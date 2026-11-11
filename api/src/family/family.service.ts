import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService, Q } from '../db/db.service';
import { RuleError } from '../common/http';
import { Role } from '../trees/trees';
import {
  AddChild,
  AddParents,
  EndMarriage,
  PersonInput,
  PersonPatch,
  PersonRef,
  RecordMarriage,
} from './schemas';

const PERSON_COLS = `id, tree_id, first_name, other_names, sex, clan, birth_date::text, birth_year, birth_place,
  death_date::text, death_year, is_deceased, is_placeholder, notes, birth_house_id`;

export interface PersonRow {
  id: string;
  tree_id: string;
  first_name: string;
  other_names: string;
  sex: 'M' | 'F' | 'U';
  clan: string | null;
  birth_date: string | null;
  birth_year: number | null;
  birth_place: string | null;
  death_date: string | null;
  death_year: number | null;
  is_deceased: boolean;
  is_placeholder: boolean;
  notes: string | null;
  birth_house_id: string | null;
}

export interface HouseRow {
  id: string;
  tree_id: string;
  household_id: string;
  wife_person_id: string;
  sponsor_house_id: string | null;
  label: string;
  marriage_form: string;
  started_on: string | null;
  place: string | null;
  ended_on: string | null;
  end_reason: string | null;
}

const HOUSE_COLS = `id, tree_id, household_id, wife_person_id, sponsor_house_id, label, marriage_form,
  started_on::text, place, ended_on::text, end_reason`;

export const fullName = (p: { first_name: string; other_names: string }) =>
  [p.first_name, p.other_names].filter(Boolean).join(' ');

/** Next label for a house opened by a wife: "2" → "2A", "2A" → "2A-1", "2A-1" → "2A-1A". */
export function childLabel(sponsorLabel: string, index: number): string {
  if (/\d$/.test(sponsorLabel)) {
    let s = '';
    let n = index;
    do {
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return sponsorLabel + s;
  }
  return `${sponsorLabel}-${index + 1}`;
}

@Injectable()
export class FamilyService {
  constructor(private db: DbService) {}

  // ---------- people ----------

  async createPerson(treeId: string, input: PersonInput, q: Q = this.db.query, placeholder = false) {
    const [p] = await q<PersonRow>(
      `INSERT INTO persons (tree_id, first_name, other_names, sex, clan, birth_date, birth_year, birth_place,
                            death_date, death_year, is_deceased, notes, is_placeholder)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${PERSON_COLS}`,
      [
        treeId,
        input.firstName,
        input.otherNames ?? '',
        input.sex,
        input.clan ?? null,
        input.birthDate ?? null,
        input.birthYear ?? (input.birthDate ? Number(input.birthDate.slice(0, 4)) : null),
        input.birthPlace ?? null,
        input.deathDate ?? null,
        input.deathYear ?? (input.deathDate ? Number(input.deathDate.slice(0, 4)) : null),
        input.isDeceased ?? !!(input.deathDate || input.deathYear),
        input.notes ?? null,
        placeholder,
      ],
    );
    return p;
  }

  async updatePerson(id: string, patch: PersonPatch) {
    const map: Record<string, string> = {
      firstName: 'first_name',
      otherNames: 'other_names',
      sex: 'sex',
      clan: 'clan',
      birthDate: 'birth_date',
      birthYear: 'birth_year',
      birthPlace: 'birth_place',
      deathDate: 'death_date',
      deathYear: 'death_year',
      isDeceased: 'is_deceased',
      notes: 'notes',
    };
    return this.db.tx(async (q) => {
      const p = await this.person(q, id, true);
      if (patch.sex && patch.sex !== p.sex) {
        const [head] = await q('SELECT 1 FROM households WHERE head_person_id = $1', [id]);
        const [wife] = await q('SELECT 1 FROM houses WHERE wife_person_id = $1', [id]);
        if ((head && patch.sex !== 'M') || (wife && patch.sex !== 'F')) {
          throw new RuleError('Sex conflicts with this person’s marriages');
        }
      }
      const sets: string[] = [];
      const vals: unknown[] = [];
      for (const [k, col] of Object.entries(map)) {
        const v = (patch as any)[k];
        if (v === undefined) continue;
        vals.push(v);
        sets.push(`${col} = $${vals.length}`);
      }
      if ((patch.deathDate || patch.deathYear) && patch.isDeceased === undefined) sets.push('is_deceased = true');
      if (sets.length) {
        vals.push(id);
        await q(`UPDATE persons SET ${sets.join(', ')}, is_placeholder = false WHERE id = $${vals.length}`, vals);
      }
      return this.person(q, id);
    });
  }

  private async person(q: Q, id: string, lock = false): Promise<PersonRow> {
    const [p] = await q<PersonRow>(`SELECT ${PERSON_COLS} FROM persons WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id]);
    if (!p) throw new NotFoundException('Person not found');
    return p;
  }

  private async house(q: Q, id: string, lock = false): Promise<HouseRow> {
    const [h] = await q<HouseRow>(`SELECT ${HOUSE_COLS} FROM houses WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id]);
    if (!h) throw new NotFoundException('House not found');
    return h;
  }

  private async resolve(q: Q, treeId: string, ref: PersonRef): Promise<PersonRow> {
    if ('new' in ref) return this.createPerson(treeId, ref.new, q);
    const p = await this.person(q, ref.id, true);
    if (p.tree_id !== treeId) throw new RuleError('That person is in a different tree');
    return p;
  }

  /** The house chain from a house up to the top-level house (index 0 = the given house). */
  async chain(q: Q, houseId: string): Promise<(HouseRow & { wife_name: string })[]> {
    return q(
      `WITH RECURSIVE c AS (
         SELECT h.*, 0 AS depth FROM houses h WHERE h.id = $1
         UNION ALL
         SELECT h.*, c.depth + 1 FROM houses h JOIN c ON h.id = c.sponsor_house_id WHERE c.depth < 200
       )
       SELECT c.id, c.household_id, c.wife_person_id, c.sponsor_house_id, c.label, c.marriage_form,
              c.started_on::text, c.ended_on::text, c.end_reason,
              trim(p.first_name || ' ' || p.other_names) AS wife_name
         FROM c JOIN persons p ON p.id = c.wife_person_id ORDER BY c.depth`,
      [houseId],
    );
  }

  // ---------- marriages ----------

  async recordMarriage(treeId: string, input: RecordMarriage) {
    return this.db.tx((q) => this.recordMarriageTx(q, treeId, input));
  }

  private async recordMarriageTx(q: Q, treeId: string, input: RecordMarriage): Promise<HouseRow> {
    const bride = await this.resolve(q, treeId, input.bride);
    if (bride.sex !== 'F') throw new RuleError(`${fullName(bride)} must be recorded as female to be married as a wife`);

    const [active] = await q(
      `SELECT h.label, trim(hp.first_name || ' ' || hp.other_names) AS head
         FROM houses h JOIN households hh ON hh.id = h.household_id JOIN persons hp ON hp.id = hh.head_person_id
        WHERE h.wife_person_id = $1 AND h.ended_on IS NULL`,
      [bride.id],
    );
    if (active) {
      throw new RuleError(
        `${fullName(bride)} is still a wife in House ${active.label} of the ${active.head} homestead. End that marriage first.`,
      );
    }

    if (input.mode === 'head') {
      const husband = await this.person(q, input.husbandId, true);
      if (husband.tree_id !== treeId) throw new RuleError('That person is in a different tree');
      if (husband.sex !== 'M') throw new RuleError(`${fullName(husband)} must be recorded as male to head a household`);
      if (husband.id === bride.id) throw new RuleError('A person cannot marry themselves');
      if (input.startedOn && husband.death_date && input.startedOn > husband.death_date) {
        throw new RuleError(`${fullName(husband)} died on ${husband.death_date}. The marriage date must be before then.`);
      }

      let [household] = await q<{ id: string }>('SELECT id FROM households WHERE head_person_id = $1 FOR UPDATE', [husband.id]);
      if (!household) {
        [household] = await q('INSERT INTO households (tree_id, head_person_id) VALUES ($1,$2) RETURNING id', [treeId, husband.id]);
      }
      const [{ next }] = await q<{ next: number }>(
        `SELECT coalesce(max(label::int), 0) + 1 AS next FROM houses
          WHERE household_id = $1 AND sponsor_house_id IS NULL AND label ~ '^[0-9]+$'`,
        [household.id],
      );
      const [house] = await q<HouseRow>(
        `INSERT INTO houses (tree_id, household_id, wife_person_id, label, marriage_form, started_on, place)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${HOUSE_COLS}`,
        [treeId, household.id, bride.id, String(next), input.form, input.startedOn ?? null, input.place ?? null],
      );
      return house;
    }

    // Woman-to-woman: the new house sits under the sponsoring wife's house, in the same household.
    const sponsor = await this.house(q, input.sponsorHouseId, true);
    if (sponsor.tree_id !== treeId) throw new RuleError('That house is in a different tree');
    if (sponsor.ended_on) {
      throw new RuleError(`House ${sponsor.label} has ended, so its wife can no longer marry a wife into this household`);
    }
    const chain = await this.chain(q, sponsor.id);
    if (chain.some((h) => h.wife_person_id === bride.id)) {
      throw new RuleError(`${fullName(bride)} is already in this house's line and cannot be married into it`);
    }
    const [head] = await q<{ head_person_id: string }>('SELECT head_person_id FROM households WHERE id = $1 FOR UPDATE', [
      sponsor.household_id,
    ]);
    if (head.head_person_id === bride.id) throw new RuleError('The household head cannot be married in as a wife');

    const [{ n }] = await q<{ n: number }>('SELECT count(*)::int AS n FROM houses WHERE sponsor_house_id = $1', [sponsor.id]);
    const [house] = await q<HouseRow>(
      `INSERT INTO houses (tree_id, household_id, wife_person_id, sponsor_house_id, label, marriage_form, started_on, place)
       VALUES ($1,$2,$3,$4,$5,'customary',$6,$7) RETURNING ${HOUSE_COLS}`,
      [treeId, sponsor.household_id, bride.id, sponsor.id, childLabel(sponsor.label, n), input.startedOn ?? null, input.place ?? null],
    );
    return house;
  }

  async endMarriage(houseId: string, input: EndMarriage) {
    return this.db.tx(async (q) => {
      const h = await this.house(q, houseId, true);
      if (h.ended_on || h.end_reason) throw new RuleError(`House ${h.label} has already ended`);
      if (input.endedOn && h.started_on && input.endedOn < h.started_on) {
        throw new RuleError('A marriage cannot end before it started');
      }
      await q('UPDATE houses SET ended_on = coalesce($2::date, current_date), end_reason = $3 WHERE id = $1', [
        houseId,
        input.endedOn ?? null,
        input.reason,
      ]);
      return this.house(q, houseId);
    });
  }

  // ---------- children and parents ----------

  async addChild(treeId: string, input: AddChild) {
    return this.db.tx(async (q) => {
      let motherId: string;
      let headId: string | null = null;
      if (input.houseId) {
        const h = await this.house(q, input.houseId, true);
        if (h.tree_id !== treeId) throw new RuleError('That house is in a different tree');
        motherId = h.wife_person_id;
        [{ head_person_id: headId }] = await q('SELECT head_person_id FROM households WHERE id = $1', [h.household_id]);
      } else {
        const m = await this.person(q, input.motherId!, true);
        if (m.tree_id !== treeId) throw new RuleError('That person is in a different tree');
        if (m.sex !== 'F') throw new RuleError('The mother must be recorded as female');
        motherId = m.id;
      }

      const child = await this.createPerson(treeId, input.child, q);
      await q('UPDATE persons SET birth_house_id = $2 WHERE id = $1', [child.id, input.houseId ?? null]);
      await q(`INSERT INTO parent_links (child_id, parent_id, relation) VALUES ($1,$2,'biological')`, [child.id, motherId]);

      const f = input.father;
      if (f.kind === 'head') {
        if (!headId) throw new RuleError('There is no household head to name as father for a child outside a house');
        await q(`INSERT INTO parent_links (child_id, parent_id, relation) VALUES ($1,$2,'biological')`, [child.id, headId]);
      } else if (f.kind === 'person') {
        const father = await this.resolve(q, treeId, f.person);
        if (father.sex === 'F') throw new RuleError('The biological father cannot be recorded as female');
        if (father.id === motherId) throw new RuleError('Father and mother must be different people');
        await q(
          `INSERT INTO parent_links (child_id, parent_id, relation, restricted) VALUES ($1,$2,'biological',$3)`,
          [child.id, father.id, f.restricted],
        );
      }
      return this.person(q, child.id);
    });
  }

  /** Links parents to someone recorded without them, e.g. a line's founder. */
  async addParents(personId: string, input: AddParents) {
    return this.db.tx(async (q) => {
      const p = await this.person(q, personId, true);
      if (p.birth_house_id) {
        const [h] = await q('SELECT label FROM houses WHERE id = $1', [p.birth_house_id]);
        throw new RuleError(`${fullName(p)} already has parents (House ${h.label})`);
      }
      const father = await this.resolve(q, p.tree_id, input.father);
      if (father.sex !== 'M') throw new RuleError(`${fullName(father)} must be recorded as male to be the father`);

      let mother: PersonRow;
      if ('unknown' in input.mother) {
        mother = await this.createPerson(p.tree_id, { firstName: 'Unknown', otherNames: '', sex: 'F' }, q, true);
      } else {
        mother = await this.resolve(q, p.tree_id, input.mother);
      }
      for (const parent of [father, mother]) {
        if (parent.id === p.id) throw new RuleError('A person cannot be their own parent');
        if (await this.isAncestor(q, p.id, parent.id)) {
          throw new RuleError(`${fullName(parent)} is a descendant of ${fullName(p)}, so cannot be their parent`);
        }
      }

      // Reuse the parents' house if their marriage is already recorded; otherwise record it now.
      const [existing] = await q<{ id: string }>(
        `SELECT h.id FROM houses h JOIN households hh ON hh.id = h.household_id
          WHERE hh.head_person_id = $1 AND h.wife_person_id = $2 ORDER BY h.created_at LIMIT 1`,
        [father.id, mother.id],
      );
      const houseId =
        existing?.id ??
        (await this.recordMarriageTx(q, p.tree_id, { mode: 'head', husbandId: father.id, form: 'customary', bride: { id: mother.id } })).id;

      await q('UPDATE persons SET birth_house_id = $2 WHERE id = $1', [p.id, houseId]);
      for (const parent of [father, mother]) {
        if (parent.is_placeholder) continue;
        await q(
          `INSERT INTO parent_links (child_id, parent_id, relation) VALUES ($1,$2,'biological') ON CONFLICT DO NOTHING`,
          [p.id, parent.id],
        );
      }
      return { personId: p.id, houseId };
    });
  }

  /** True if `ancestorId` is a parent (social or biological) of `personId`, at any depth. */
  async isAncestor(q: Q, ancestorId: string, personId: string): Promise<boolean> {
    const [r] = await q(
      `WITH RECURSIVE up(id, depth) AS (
         SELECT $2::uuid, 0
         UNION
         SELECT par.id, up.depth + 1 FROM up
           JOIN LATERAL (
             SELECT pl.parent_id AS id FROM parent_links pl WHERE pl.child_id = up.id
             UNION SELECT h.wife_person_id FROM persons c JOIN houses h ON h.id = c.birth_house_id WHERE c.id = up.id
             UNION SELECT hh.head_person_id FROM persons c JOIN houses h ON h.id = c.birth_house_id
                     JOIN households hh ON hh.id = h.household_id WHERE c.id = up.id
           ) par ON true
          WHERE up.depth < 200
       )
       SELECT 1 FROM up WHERE id = $1 AND depth > 0 LIMIT 1`,
      [ancestorId, personId],
    );
    return !!r;
  }

  // ---------- duplicates ----------

  async matches(treeId: string, firstName: string, otherNames = '', birthYear?: number) {
    const tokens = otherNames.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = await this.db.query<PersonRow>(
      `SELECT ${PERSON_COLS} FROM persons
        WHERE tree_id = $1 AND NOT is_placeholder AND lower(first_name) = lower($2)
          AND ($3::int IS NULL OR birth_year IS NULL OR abs(birth_year - $3) <= 3)`,
      [treeId, firstName, birthYear ?? null],
    );
    return rows
      .map((p) => {
        const theirs = p.other_names.toLowerCase().split(/\s+/).filter(Boolean);
        const shared = tokens.filter((t) => theirs.includes(t)).length;
        const score = 1 + shared * 2 + (birthYear && p.birth_year === birthYear ? 2 : 0);
        return { person: p, name: fullName(p), score };
      })
      .filter((m) => !tokens.length || m.score > 1 || !m.person.other_names)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

  /** Folds `sourceId` into `intoId`: every link moves across and the source record is deleted. */
  async merge(sourceId: string, intoId: string) {
    if (sourceId === intoId) throw new RuleError('Choose two different people');
    return this.db.tx(async (q) => {
      const a = await this.person(q, sourceId, true);
      const b = await this.person(q, intoId, true);
      if (a.tree_id !== b.tree_id) throw new RuleError('Both people must be in the same tree');
      if (a.sex !== b.sex && a.sex !== 'U' && b.sex !== 'U') throw new RuleError('These two are recorded with different sexes');

      const heads = await q('SELECT id FROM households WHERE head_person_id = ANY($1)', [[a.id, b.id]]);
      if (heads.length > 1) throw new RuleError('Both people head a household. Merge is not possible automatically.');
      if (a.birth_house_id && b.birth_house_id && a.birth_house_id !== b.birth_house_id) {
        throw new RuleError('These two were born into different houses');
      }
      const activeWife = await q('SELECT id FROM houses WHERE wife_person_id = ANY($1) AND ended_on IS NULL', [[a.id, b.id]]);
      if (activeWife.length > 1) throw new RuleError('Both people are active wives. End one marriage first.');

      await q('UPDATE households SET head_person_id = $2 WHERE head_person_id = $1', [a.id, b.id]);
      await q('UPDATE houses SET wife_person_id = $2 WHERE wife_person_id = $1', [a.id, b.id]);
      await q(
        `INSERT INTO parent_links (child_id, parent_id, relation, restricted)
           SELECT CASE WHEN child_id = $1 THEN $2 ELSE child_id END,
                  CASE WHEN parent_id = $1 THEN $2 ELSE parent_id END, relation, restricted
             FROM parent_links WHERE (child_id = $1 OR parent_id = $1)
              AND NOT (child_id = $1 AND parent_id = $2) AND NOT (child_id = $2 AND parent_id = $1)
         ON CONFLICT DO NOTHING`,
        [a.id, b.id],
      );
      await q(
        `UPDATE persons t SET
           other_names = CASE WHEN t.other_names = '' THEN s.other_names ELSE t.other_names END,
           clan = coalesce(t.clan, s.clan), birth_date = coalesce(t.birth_date, s.birth_date),
           birth_year = coalesce(t.birth_year, s.birth_year), birth_place = coalesce(t.birth_place, s.birth_place),
           death_date = coalesce(t.death_date, s.death_date), death_year = coalesce(t.death_year, s.death_year),
           is_deceased = t.is_deceased OR s.is_deceased, notes = coalesce(t.notes, s.notes),
           birth_house_id = coalesce(t.birth_house_id, s.birth_house_id),
           sex = CASE WHEN t.sex = 'U' THEN s.sex ELSE t.sex END, is_placeholder = false
         FROM persons s WHERE t.id = $2 AND s.id = $1`,
        [a.id, b.id],
      );
      await q('DELETE FROM persons WHERE id = $1', [a.id]);
      return this.person(q, b.id);
    });
  }

  // ---------- reads ----------

  async listHouseholds(treeId: string) {
    return this.db.query(
      `SELECT hh.id, hp.id AS head_id, trim(hp.first_name || ' ' || hp.other_names) AS head_name,
              (hp.birth_house_id IS NULL) AS is_founder,
              (SELECT count(*)::int FROM houses h WHERE h.household_id = hh.id) AS houses,
              1 + (SELECT count(*)::int FROM houses h WHERE h.household_id = hh.id)
                + (SELECT count(*)::int FROM persons c JOIN houses h ON h.id = c.birth_house_id WHERE h.household_id = hh.id)
                AS people
         FROM households hh JOIN persons hp ON hp.id = hh.head_person_id
        WHERE hh.tree_id = $1 ORDER BY hp.first_name, hp.other_names`,
      [treeId],
    );
  }

  async searchPersons(treeId: string, text: string) {
    return this.db.query(
      `SELECT ${PERSON_COLS},
              (SELECT id FROM households WHERE head_person_id = p.id) AS heads_household_id
         FROM persons p
        WHERE tree_id = $1 AND NOT is_placeholder
          AND ($2 = '' OR (first_name || ' ' || other_names) ILIKE '%' || $2 || '%')
        ORDER BY first_name, other_names LIMIT 50`,
      [treeId, text],
    );
  }

  async getHousehold(id: string, role: Role) {
    const [hh] = await this.db.query('SELECT id, tree_id, head_person_id FROM households WHERE id = $1', [id]);
    if (!hh) throw new NotFoundException('Household not found');
    const [head] = await this.db.query<PersonRow>(`SELECT ${PERSON_COLS} FROM persons WHERE id = $1`, [hh.head_person_id]);
    const houses = await this.db.query<HouseRow & { wife: PersonRow }>(
      `SELECT ${HOUSE_COLS.split(',').map((c) => 'h.' + c.trim()).join(', ')}, to_jsonb(w) AS wife
         FROM houses h JOIN persons w ON w.id = h.wife_person_id
        WHERE h.household_id = $1 ORDER BY h.created_at`,
      [id],
    );
    const children = await this.db.query(
      `SELECT c.id, c.first_name, c.other_names, c.sex, c.birth_year, c.birth_date::text, c.is_deceased, c.birth_house_id,
              (SELECT id FROM households WHERE head_person_id = c.id) AS heads_household_id,
              EXISTS (SELECT 1 FROM parent_links pl WHERE pl.child_id = c.id AND pl.restricted) AS has_restricted_parent
         FROM persons c JOIN houses h ON h.id = c.birth_house_id
        WHERE h.household_id = $1 ORDER BY c.birth_year NULLS LAST, c.birth_date NULLS LAST, c.created_at`,
      [id],
    );

    // Where the head was born, so the UI can link up a generation.
    let birthHousehold: { id: string; label: string; head_name: string } | null = null;
    if (head.birth_house_id) {
      [birthHousehold] = await this.db.query<{ id: string; label: string; head_name: string }>(
        `SELECT hh.id, h.label, trim(hp.first_name || ' ' || hp.other_names) AS head_name
           FROM houses h JOIN households hh ON hh.id = h.household_id JOIN persons hp ON hp.id = hh.head_person_id
          WHERE h.id = $1`,
        [head.birth_house_id],
      );
    }

    type Node = (typeof houses)[number] & { children: typeof children; houses: Node[]; status: string };
    const byId = new Map<string, Node>();
    for (const h of houses) {
      const wife = h.wife as any;
      byId.set(h.id, {
        ...h,
        wife: { ...wife, birth_date: wife.birth_date ?? null, death_date: wife.death_date ?? null },
        status: h.ended_on || h.end_reason ? 'ended' : head.is_deceased ? 'widowed' : 'active',
        children: children.filter((c) => c.birth_house_id === h.id),
        houses: [],
      });
    }
    const roots: Node[] = [];
    for (const n of byId.values()) {
      if (n.sponsor_house_id && byId.has(n.sponsor_house_id)) byId.get(n.sponsor_house_id)!.houses.push(n);
      else roots.push(n);
    }
    const byLabel = (a: Node, b: Node) => a.label.localeCompare(b.label, 'en', { numeric: true });
    const sortRec = (ns: Node[]) => {
      ns.sort(byLabel);
      ns.forEach((n) => sortRec(n.houses));
    };
    sortRec(roots);

    return {
      id: hh.id,
      treeId: hh.tree_id,
      head,
      birthHousehold,
      houses: roots,
      counts: { houses: houses.length, people: 1 + houses.length + children.length },
      canSeeRestricted: role === 'admin',
    };
  }

  async getPerson(id: string, role: Role) {
    const q = this.db.query;
    const p = await this.person(q, id);
    const admin = role === 'admin';

    const [headOf] = await q('SELECT id FROM households WHERE head_person_id = $1', [id]);
    const headHouses = headOf
      ? await q(
          `SELECT h.id, h.label, h.marriage_form, h.started_on::text, h.ended_on::text, h.end_reason, h.sponsor_house_id,
                  w.id AS wife_id, trim(w.first_name || ' ' || w.other_names) AS wife_name
             FROM houses h JOIN persons w ON w.id = h.wife_person_id WHERE h.household_id = $1 ORDER BY h.created_at`,
          [headOf.id],
        )
      : [];

    const wifeHouses = await q<HouseRow>(`SELECT ${HOUSE_COLS} FROM houses WHERE wife_person_id = $1 ORDER BY created_at`, [id]);
    const marriages = [];
    for (const h of wifeHouses) {
      const chain = await this.chain(q, h.id);
      const [hh] = await q(
        `SELECT hh.id, hp.id AS head_id, trim(hp.first_name || ' ' || hp.other_names) AS head_name, hp.is_deceased AS head_deceased
           FROM households hh JOIN persons hp ON hp.id = hh.head_person_id WHERE hh.id = $1`,
        [h.household_id],
      );
      marriages.push({
        ...h,
        household: hh,
        womanToWoman: !!h.sponsor_house_id,
        // From the household head down to this house.
        chain: chain.reverse().map((c) => ({ houseId: c.id, label: c.label, wifeId: c.wife_person_id, wifeName: c.wife_name })),
      });
    }

    // Born into: house, household, and everyone the person belongs to through the house chain.
    let birth = null;
    if (p.birth_house_id) {
      const chain = await this.chain(q, p.birth_house_id);
      const [hh] = await q(
        `SELECT hh.id, hp.id AS head_id, trim(hp.first_name || ' ' || hp.other_names) AS head_name
           FROM houses h JOIN households hh ON hh.id = h.household_id JOIN persons hp ON hp.id = hh.head_person_id
          WHERE h.id = $1`,
        [p.birth_house_id],
      );
      birth = {
        houseId: p.birth_house_id,
        label: chain[0].label,
        household: hh,
        socialParents: [
          ...chain.map((c, i) => ({ id: c.wife_person_id, name: c.wife_name, role: i === 0 ? 'wife of the house' : `sponsor, House ${c.label}` })),
          { id: hh.head_id, name: hh.head_name, role: 'household head' },
        ],
      };
    }

    const bioParents = (
      await q(
        `SELECT pl.parent_id AS id, pl.relation, pl.restricted, trim(pp.first_name || ' ' || pp.other_names) AS name, pp.sex
           FROM parent_links pl JOIN persons pp ON pp.id = pl.parent_id WHERE pl.child_id = $1 AND NOT pp.is_placeholder`,
        [id],
      )
    ).map((r) => (r.restricted && !admin ? { restricted: true, relation: r.relation, sex: r.sex } : r));

    // Children: born into her houses, plus biological children (restricted ones only for admins).
    const children = await q(
      `SELECT DISTINCT c.id, trim(c.first_name || ' ' || c.other_names) AS name, c.birth_year, c.birth_house_id,
              h.label AS house_label,
              EXISTS (SELECT 1 FROM parent_links pl WHERE pl.child_id = c.id AND pl.restricted) AS has_restricted_parent
         FROM persons c LEFT JOIN houses h ON h.id = c.birth_house_id
        WHERE c.id IN (
          SELECT c2.id FROM persons c2 JOIN houses h2 ON h2.id = c2.birth_house_id WHERE h2.wife_person_id = $1
          UNION SELECT pl.child_id FROM parent_links pl WHERE pl.parent_id = $1 AND ($2 OR NOT pl.restricted)
        )
        ORDER BY c.birth_year NULLS LAST`,
      [id, admin],
    );

    return {
      person: p,
      name: fullName(p),
      headsHousehold: headOf ? { id: headOf.id, houses: headHouses } : null,
      marriages,
      birth,
      parents: bioParents,
      children,
      canSeeRestricted: admin,
    };
  }
}
