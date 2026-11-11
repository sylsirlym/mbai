import { INestApplication } from '@nestjs/common';
import { childLabel } from '../src/family/family.service';
import { client, person, setup } from './helpers';

let app: INestApplication;
let api: Awaited<ReturnType<typeof client>>;
let treeId: string;

beforeAll(async () => {
  app = await setup();
  api = await client(app);
  treeId = (await api.call('post', '/trees', { name: 'Kioko family' })).body.id;
});
afterAll(() => app.close());

async function newPerson(firstName: string, otherNames: string, sex: 'M' | 'F', extra = {}) {
  const r = await api.call('post', `/trees/${treeId}/persons`, person(firstName, otherNames, sex, extra));
  expect(r.status).toBe(201);
  return r.body.id as string;
}
async function marryHead(husbandId: string, brideId: string, extra = {}) {
  return api.call('post', `/trees/${treeId}/marriages`, { mode: 'head', husbandId, bride: { id: brideId }, ...extra });
}
async function marryWife(sponsorHouseId: string, brideId: string) {
  return api.call('post', `/trees/${treeId}/marriages`, { mode: 'wife', sponsorHouseId, bride: { id: brideId } });
}

describe('house labels', () => {
  it('alternates letters and numbers down a sponsor chain', () => {
    expect(childLabel('2', 0)).toBe('2A');
    expect(childLabel('2', 1)).toBe('2B');
    expect(childLabel('2', 26)).toBe('2AA');
    expect(childLabel('2A', 0)).toBe('2A-1');
    expect(childLabel('2A-1', 0)).toBe('2A-1A');
  });
});

describe('the Mutua Kioko homestead', () => {
  let mutua: string, mwende: string, ndinda: string, kavata: string, syokau: string;
  let house1: string, house2: string, house2a: string, house3: string;

  it('creates the household at the first marriage', async () => {
    mutua = await newPerson('Mutua', 'Kioko', 'M', { birthYear: 1952, deathDate: '2019-06-01' });
    mwende = await newPerson('Mwende', 'Mutua', 'F');
    let hh = await api.call('get', `/trees/${treeId}/households`);
    expect(hh.body).toHaveLength(0);

    const r = await marryHead(mutua, mwende, { startedOn: '1974-08-01' });
    expect(r.status).toBe(201);
    expect(r.body.label).toBe('1');
    house1 = r.body.id;

    hh = await api.call('get', `/trees/${treeId}/households`);
    expect(hh.body).toHaveLength(1);
    expect(hh.body[0].is_founder).toBe(true);
  });

  it('adds more wives as numbered houses in the same household', async () => {
    ndinda = await newPerson('Ndinda', 'Mutua', 'F');
    syokau = await newPerson('Syokau', 'Mutua', 'F');
    house2 = (await marryHead(mutua, ndinda)).body.id;
    const r3 = await marryHead(mutua, syokau, { form: 'civil' });
    house3 = r3.body.id;
    expect(r3.body.label).toBe('3');
  });

  it('refuses a marriage to the head dated after his death', async () => {
    const late = await newPerson('Nduku', 'Kilonzo', 'F');
    const r = await marryHead(mutua, late, { startedOn: '2020-01-01' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/died/);
  });

  it('lets a wife marry a wife, who joins under her house', async () => {
    kavata = await newPerson('Kavata', 'Musau', 'F');
    const r = await marryWife(house2, kavata);
    expect(r.status).toBe(201);
    expect(r.body.label).toBe('2A');
    expect(r.body.marriage_form).toBe('customary');
    house2a = r.body.id;
  });

  it('allows a married-in wife to sponsor another, with no depth limit', async () => {
    const mumbua = await newPerson('Mumbua', 'Nzau', 'F');
    const r = await marryWife(house2a, mumbua);
    expect(r.status).toBe(201);
    expect(r.body.label).toBe('2A-1');
  });

  it('allows a widow to sponsor a wife into her late husband’s household', async () => {
    const wanjiru = await newPerson('Kalunde', 'Mbithi', 'F');
    const r = await marryWife(house3, wanjiru);
    expect(r.status).toBe(201);
    expect(r.body.label).toBe('3A');
  });

  it('refuses to marry someone who is still an active wife', async () => {
    const r = await marryWife(house1, kavata);
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/still a wife in House 2A/);
  });

  it('refuses a sponsor whose own marriage has ended', async () => {
    const nzisa = await newPerson('Nzisa', 'Mutua', 'F');
    const h = (await marryHead(mutua, nzisa, { startedOn: '1995-01-01' })).body.id;
    expect((await api.call('post', `/houses/${h}/end`, { reason: 'divorce', endedOn: '2001-01-01' })).status).toBe(201);
    const other = await newPerson('Mwikali', 'Kyalo', 'F');
    const r = await marryWife(h, other);
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/has ended/);
  });

  it('adds children to a house and keeps the biological father restricted', async () => {
    const r = await api.call('post', `/trees/${treeId}/children`, {
      houseId: house2a,
      child: person('Mbithe', 'Mutua', 'F', { birthYear: 2005 }),
      father: { kind: 'person', person: { new: person('Nzioka', 'Kilonzo', 'M') } },
    });
    expect(r.status).toBe(201);
    const mbithe = r.body.id;

    const view = (await api.call('get', `/persons/${mbithe}`)).body;
    expect(view.birth.label).toBe('2A');
    expect(view.birth.socialParents.map((p: any) => p.name)).toEqual(['Kavata Musau', 'Ndinda Mutua', 'Mutua Kioko']);
    // The tree creator is an admin, so sees the restricted father.
    expect(view.parents.find((p: any) => p.name === 'Nzioka Kilonzo')?.restricted).toBe(true);

    // A viewer sees that a restricted parent exists, but not who.
    const viewer = await (await import('./helpers')).client(app, 'viewer@example.com');
    await api.call('post', `/trees/${treeId}/members`, { email: 'viewer@example.com', role: 'viewer' });
    const asViewer = (await viewer.call('get', `/persons/${mbithe}`)).body;
    expect(asViewer.parents.some((p: any) => p.name === 'Nzioka Kilonzo')).toBe(false);
    expect(asViewer.parents.some((p: any) => p.restricted === true && !p.name)).toBe(true);
    // ...and cannot edit.
    const denied = await viewer.call('post', `/trees/${treeId}/persons`, person('X', '', 'M'));
    expect(denied.status).toBe(403);
  });

  it('nests woman-to-woman houses under their sponsor in the household view', async () => {
    const hhId = (await api.call('get', `/trees/${treeId}/households`)).body[0].id;
    const hh = (await api.call('get', `/households/${hhId}`)).body;
    expect(hh.houses.map((h: any) => h.label)).toEqual(['1', '2', '3', '4']);
    const h2 = hh.houses[1];
    expect(h2.houses[0].label).toBe('2A');
    expect(h2.houses[0].houses[0].label).toBe('2A-1');
    expect(h2.houses[0].children[0].first_name).toBe('Mbithe');
    expect(hh.houses[2].status).toBe('widowed');
    expect(hh.houses[3].status).toBe('ended');
  });

  it('shows the chain up to the head on a married-in wife’s profile', async () => {
    const v = (await api.call('get', `/persons/${kavata}`)).body;
    expect(v.marriages[0].womanToWoman).toBe(true);
    expect(v.marriages[0].chain.map((c: any) => c.label)).toEqual(['2', '2A']);
    expect(v.marriages[0].household.head_name).toBe('Mutua Kioko');
  });

  it('gives a son his own household while he stays a child of his birth house', async () => {
    const son = await api.call('post', `/trees/${treeId}/children`, {
      houseId: house1,
      child: person('Musyoka', 'Mutua', 'M', { birthYear: 1976 }),
      father: { kind: 'head' },
    });
    const wife = await newPerson('Ndunge', 'Musyoka', 'F');
    const m = await marryHead(son.body.id, wife);
    expect(m.body.label).toBe('1');

    const v = (await api.call('get', `/persons/${son.body.id}`)).body;
    expect(v.birth.label).toBe('1');
    expect(v.headsHousehold.id).toBe(m.body.household_id);

    const own = (await api.call('get', `/households/${m.body.household_id}`)).body;
    expect(own.birthHousehold.head_name).toBe('Mutua Kioko');
    const list = (await api.call('get', `/trees/${treeId}/households`)).body;
    expect(list.find((h: any) => h.head_name === 'Musyoka Mutua').is_founder).toBe(false);
  });

  it('adds parents to a founder, moving the line up a generation', async () => {
    const r = await api.call('post', `/persons/${mutua}/parents`, {
      father: { new: person('Kioko', 'Mbaluka', 'M', { birthYear: 1920 }) },
      mother: { unknown: true },
    });
    expect(r.status).toBe(201);
    const list = (await api.call('get', `/trees/${treeId}/households`)).body;
    expect(list.find((h: any) => h.head_name === 'Mutua Kioko').is_founder).toBe(false);
    expect(list.find((h: any) => h.head_name === 'Kioko Mbaluka').is_founder).toBe(true);

    const again = await api.call('post', `/persons/${mutua}/parents`, { father: { new: person('Y', '', 'M') }, mother: { unknown: true } });
    expect(again.status).toBe(400);
  });

  it('refuses to make a descendant someone’s parent', async () => {
    const grandpa = (await api.call('get', `/trees/${treeId}/persons?q=Kioko Mbaluka`)).body[0].id;
    // Find Musyoka (grandson of Kioko Mbaluka) and try to make him Kioko's father.
    const musyoka = (await api.call('get', `/trees/${treeId}/persons?q=Musyoka Mutua`)).body[0].id;
    const r = await api.call('post', `/persons/${grandpa}/parents`, { father: { id: musyoka }, mother: { unknown: true } });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/descendant/);
  });

  it('finds likely duplicates and merges them', async () => {
    const dup = await newPerson('Kavata', 'Musau', 'F', { birthYear: 1983, clan: 'Ambua' });
    const m = (await api.call('get', `/trees/${treeId}/persons/matches?firstName=Kavata&otherNames=Musau&birthYear=1983`)).body;
    expect(m.map((x: any) => x.person.id)).toEqual(expect.arrayContaining([kavata, dup]));

    const merged = await api.call('post', `/persons/${dup}/merge`, { intoId: kavata });
    expect(merged.status).toBe(201);
    expect(merged.body.clan).toBe('Ambua');
    expect((await api.call('get', `/persons/${dup}`)).status).toBe(404);
  });

  it('records a child of an unmarried mother without a house', async () => {
    const mother = await newPerson('Mueni', 'Kyalo', 'F');
    const r = await api.call('post', `/trees/${treeId}/children`, { motherId: mother, child: person('Kasyoka', 'Mueni', 'F') });
    expect(r.status).toBe(201);
    expect(r.body.birth_house_id).toBeNull();
    const v = (await api.call('get', `/persons/${mother}`)).body;
    expect(v.children.map((c: any) => c.name)).toEqual(['Kasyoka Mueni']);
  });
});

describe('access', () => {
  it('hides trees from people who are not members', async () => {
    const stranger = await client(app, 'stranger@example.com');
    const r = await stranger.call('get', `/trees/${treeId}/households`);
    expect(r.status).toBe(404);
  });

  it('rejects wrong passwords', async () => {
    const request = (await import('supertest')).default;
    const r = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'sylvester@example.com', password: 'nope' });
    expect(r.status).toBe(401);
  });
});
