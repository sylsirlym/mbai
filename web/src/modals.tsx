import { useEffect, useMemo, useState } from 'react'
import { api, fullName, type HouseNode, type Household, type Person, type PersonInput, type PersonRef } from './api'
import { cleanPerson, emptyPerson, ErrorBox, Modal, PersonFields, PersonPicker, useAction } from './ui'

/** All houses in a household, flattened, with the chain of labels above each one. */
export function flattenHouses(houses: HouseNode[], chain: HouseNode[] = []): { house: HouseNode; chain: HouseNode[] }[] {
  return houses.flatMap((h) => [{ house: h, chain }, ...flattenHouses(h.houses, [...chain, h])])
}

// ---------------- Record a marriage ----------------

export function RecordMarriageModal({ treeId, household, husband, initialSponsor, onClose, onDone }: {
  treeId: string
  household?: Household
  husband?: Person
  initialSponsor?: string
  onClose: () => void
  onDone: (house: { id: string; household_id: string; label: string }) => void
}) {
  const head = household?.head ?? husband!
  const all = useMemo(() => (household ? flattenHouses(household.houses) : []), [household])
  const sponsors = all.filter((x) => x.house.status !== 'ended')
  const [mode, setMode] = useState<'head' | 'wife'>(initialSponsor ? 'wife' : 'head')
  const [sponsorId, setSponsorId] = useState(initialSponsor ?? sponsors[0]?.house.id ?? '')
  const [bride, setBride] = useState<PersonRef | null>(null)
  const [form, setForm] = useState('customary')
  const [startedOn, setStartedOn] = useState('')
  const [place, setPlace] = useState('')
  const { busy, error, run } = useAction()

  const sponsor = all.find((x) => x.house.id === sponsorId)
  const headDied = head.death_date ?? (head.death_year ? `${head.death_year}` : null)

  const submit = () =>
    run(async () => {
      if (!bride) throw new Error('Choose or add the bride')
      const common = { bride, startedOn: startedOn || undefined, place: place || undefined }
      const house = await api('POST', `/trees/${treeId}/marriages`,
        mode === 'head' ? { mode, husbandId: head.id, form, ...common } : { mode, sponsorHouseId: sponsorId, ...common })
      onDone(house)
    })

  return (
    <Modal title="Record a marriage" eyebrow={`${fullName(head)} homestead`} onClose={onClose}>
      <PersonPicker treeId={treeId} label="Bride" sex="F" value={bride} onChange={setBride}
        exclude={all.filter((x) => x.house.status !== 'ended').map((x) => x.house.wife.id)} />

      <fieldset style={{ border: 0, margin: '22px 0 0', padding: 0 }}>
        <legend style={{ fontSize: 14, fontWeight: 500, padding: 0 }}>Who is she marrying?</legend>
        <div className="grid2" style={{ marginTop: 8 }}>
          <button type="button" className="choice" aria-pressed={mode === 'head'} onClick={() => setMode('head')}>
            <strong>{fullName(head)}</strong>
            <span className="muted small">Opens a new house directly under him</span>
          </button>
          <button type="button" className="choice w2w" aria-pressed={mode === 'wife'} disabled={!sponsors.length} onClick={() => setMode('wife')}>
            <strong>A wife of this household</strong>
            <span className="muted small">{sponsors.length ? 'Woman-to-woman. The new house sits under the sponsoring wife’s house' : 'Needs at least one active house first'}</span>
          </button>
        </div>
      </fieldset>

      {mode === 'wife' ? (
        <>
          <label className="field"><span>Sponsoring wife</span>
            <select className="input" value={sponsorId} onChange={(e) => setSponsorId(e.target.value)}>
              {sponsors.map(({ house, chain }) => (
                <option key={house.id} value={house.id}>
                  {fullName(house.wife)} · House {house.label}{chain.length ? ` (married in by ${fullName(chain[chain.length - 1].wife)})` : ''}{house.status === 'widowed' ? ' (widowed)' : ''}
                </option>
              ))}
            </select>
          </label>
          {sponsor && sponsor.chain.length > 0 && (
            <div className="note">{fullName(sponsor.house.wife)} was herself married in by another wife. This is unusual but allowed; the new house still belongs to the {fullName(head)} homestead.</div>
          )}
          {sponsor?.house.status === 'widowed' && (
            <div className="note">{fullName(sponsor.house.wife)} is widowed. The new house joins her late husband’s homestead.</div>
          )}
          <div className="field"><span>Form of marriage</span>
            <div className="info" style={{ marginTop: 0, fontSize: 15, color: 'var(--ink)' }}>Customary <span className="muted small">· only customary is offered for woman-to-woman marriages</span></div>
          </div>
        </>
      ) : (
        <>
          <label className="field"><span>Form of marriage</span>
            <select className="input" value={form} onChange={(e) => setForm(e.target.value)}>
              <option value="customary">Customary</option><option value="civil">Civil</option><option value="religious">Religious</option>
            </select>
          </label>
          {headDied && <div className="error" style={{ marginTop: 8 }}>{fullName(head)} died in {headDied}. If you give a date, it must be before then.</div>}
        </>
      )}

      <div className="grid2">
        <label className="field"><span>Date (optional)</span>
          <input className="input" type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
        </label>
        <label className="field"><span>Place (optional)</span>
          <input className="input" placeholder="Village or ward" value={place} onChange={(e) => setPlace(e.target.value)} />
        </label>
      </div>

      <div className="info" style={{ marginTop: 22 }}>
        <p className="eyebrow" style={{ marginBottom: 8 }}>Where the new house goes</p>
        <ol className="crumbs">
          <li><span className="c" style={{ borderColor: 'var(--border)' }}>{fullName(head)} · head</span></li>
          {mode === 'wife' && sponsor && [...sponsor.chain, sponsor.house].map((h) => (
            <li key={h.id}><span className="c">House {h.label} · {h.wife.first_name}</span></li>
          ))}
          <li><span className="c current">New house</span></li>
        </ol>
      </div>

      <ErrorBox error={error} />
      <div className="footer">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>Record marriage</button>
      </div>
    </Modal>
  )
}

// ---------------- Add a child ----------------

export function AddChildModal({ treeId, household, initialHouseId, mother, onClose, onDone }: {
  treeId: string
  household?: Household
  initialHouseId?: string
  /** For a child of an unmarried mother (no house). */
  mother?: Person
  onClose: () => void
  onDone: (child: Person) => void
}) {
  const houses = household ? flattenHouses(household.houses) : []
  const [houseId, setHouseId] = useState(initialHouseId ?? houses[0]?.house.id ?? '')
  const [child, setChild] = useState<PersonInput>(emptyPerson('F'))
  const [fatherKind, setFatherKind] = useState<'head' | 'person' | 'unknown'>(mother ? 'unknown' : 'head')
  const [father, setFather] = useState<PersonRef | null>(null)
  const [restricted, setRestricted] = useState(true)
  const { busy, error, run } = useAction()
  const entry = houses.find((x) => x.house.id === houseId)

  const submit = () =>
    run(async () => {
      if (!child.firstName.trim()) throw new Error('Give the child’s first name')
      if (fatherKind === 'person' && !father) throw new Error('Choose or add the father, or pick “Not recorded”')
      const body: any = {
        child: cleanPerson(child),
        father: fatherKind === 'person' ? { kind: 'person', person: father, restricted } : { kind: fatherKind },
      }
      if (mother) body.motherId = mother.id
      else body.houseId = houseId
      onDone(await api('POST', `/trees/${treeId}/children`, body))
    })

  return (
    <Modal title="Add a child" eyebrow={mother ? `Child of ${fullName(mother)}` : entry ? `House ${entry.house.label} · ${fullName(entry.house.wife)}` : ''} onClose={onClose}>
      <PersonFields value={child} onChange={setChild} />

      {!mother && (
        <label className="field"><span>House</span>
          <select className="input" value={houseId} onChange={(e) => setHouseId(e.target.value)}>
            {houses.map(({ house }) => <option key={house.id} value={house.id}>House {house.label} · {fullName(house.wife)}</option>)}
          </select>
        </label>
      )}

      <h2 style={{ fontSize: 18, marginTop: 26 }}>Biological parents</h2>
      <p className="muted small" style={{ margin: '4px 0 0' }}>Who the child was born to. Kept apart from who the child belongs to.</p>
      <div className="picked" style={{ marginTop: 12 }}>
        <span><span className="muted small" style={{ display: 'block' }}>Mother</span><strong>{mother ? fullName(mother) : entry ? fullName(entry.house.wife) : '—'}</strong></span>
        {!mother && entry && <span className="muted small">From House {entry.house.label}</span>}
      </div>

      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 10, margin: '10px 0 0', padding: '12px 14px' }}>
        <legend className="muted small" style={{ padding: '0 4px' }}>Father</legend>
        <div className="seg">
          {!mother && <label><input type="radio" name="bf" checked={fatherKind === 'head'} onChange={() => setFatherKind('head')} /> {household ? fullName(household.head) : 'Household head'}</label>}
          <label><input type="radio" name="bf" checked={fatherKind === 'person'} onChange={() => setFatherKind('person')} /> Another person</label>
          <label><input type="radio" name="bf" checked={fatherKind === 'unknown'} onChange={() => setFatherKind('unknown')} /> Not recorded</label>
        </div>
        {fatherKind === 'person' && (
          <>
            <PersonPicker treeId={treeId} label="Person" sex="M" value={father} onChange={setFather} />
            <label className="field"><span>Who can see this</span>
              <select className="input" value={restricted ? 'r' : 'o'} onChange={(e) => setRestricted(e.target.value === 'r')}>
                <option value="r">Restricted: tree admins only</option>
                <option value="o">Everyone who can see this tree</option>
              </select>
            </label>
          </>
        )}
      </fieldset>

      {!mother && entry && household && (
        <>
          <h2 style={{ fontSize: 18, marginTop: 26 }}>Belongs to</h2>
          <p className="muted small" style={{ margin: '4px 0 8px' }}>Worked out from the house chain. Lineage follows these.</p>
          <div className="stack">
            {[entry.house, ...[...entry.chain].reverse()].map((h, i) => (
              <div key={h.id} className="picked" style={i > 0 ? { background: 'var(--w2w-tint)', borderColor: 'var(--w2w-border)' } : undefined}>
                <span><strong>{fullName(h.wife)}</strong> · {i === 0 ? `mother, House ${h.label}` : `sponsoring wife, House ${h.label}`}</span>
              </div>
            ))}
            <div className="picked"><span><strong>{fullName(household.head)}</strong> · household head{household.head.is_deceased ? ' (deceased)' : ''}</span></div>
          </div>
        </>
      )}

      <ErrorBox error={error} />
      <div className="footer">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>Add child</button>
      </div>
    </Modal>
  )
}

// ---------------- Start a new line ----------------

export function StartLineModal({ treeId, onClose, onDone }: { treeId: string; onClose: () => void; onDone: (p: Person) => void }) {
  const [p, setP] = useState<PersonInput>(emptyPerson('M'))
  const [matches, setMatches] = useState<{ person: Person; name: string }[]>([])
  const { busy, error, run } = useAction()

  useEffect(() => {
    if (!p.firstName.trim()) return setMatches([])
    const t = window.setTimeout(async () => {
      const params = new URLSearchParams({ firstName: p.firstName.trim(), otherNames: p.otherNames ?? '' })
      setMatches(await api('GET', `/trees/${treeId}/persons/matches?${params}`))
    }, 300)
    return () => window.clearTimeout(t)
  }, [p.firstName, p.otherNames, treeId])

  return (
    <Modal title="Start a new line" onClose={onClose}>
      <p className="muted" style={{ margin: '8px 0 0' }}>Add the oldest person you know of in this family. You can add his parents later if you learn them.</p>
      <PersonFields value={p} onChange={setP} fixedSex="M" />
      {matches.length > 0 && (
        <div className="note"><strong>Already in this tree:</strong> {matches.map((m) => m.name).join(', ')}. If it’s the same person, open their profile instead.</div>
      )}
      <ErrorBox error={error} />
      <div className="footer">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}
          onClick={() => run(async () => {
            if (!p.firstName.trim()) throw new Error('Give the founder’s first name')
            onDone(await api('POST', `/trees/${treeId}/persons`, cleanPerson(p)))
          })}>Add founder</button>
      </div>
    </Modal>
  )
}

// ---------------- Add parents ----------------

export function AddParentsModal({ person, onClose, onDone }: { person: Person; onClose: () => void; onDone: () => void }) {
  const [father, setFather] = useState<PersonRef | null>(null)
  const [mother, setMother] = useState<PersonRef | null>(null)
  const [motherUnknown, setMotherUnknown] = useState(false)
  const { busy, error, run } = useAction()

  return (
    <Modal title="Add parents" eyebrow={fullName(person)} onClose={onClose}>
      <p className="muted" style={{ margin: '8px 0 0' }}>
        The parents’ marriage is recorded for you. If the father already has a household, {person.first_name} joins it as a child of the mother’s house.
      </p>
      <PersonPicker treeId={person.tree_id} label="Father" sex="M" value={father} onChange={setFather} exclude={[person.id]} />
      {!motherUnknown && <PersonPicker treeId={person.tree_id} label="Mother" sex="F" value={mother} onChange={setMother} exclude={[person.id]} />}
      <label className="row" style={{ marginTop: 12, minHeight: 36, fontSize: 14 }}>
        <input type="checkbox" checked={motherUnknown} onChange={(e) => setMotherUnknown(e.target.checked)} style={{ width: 18, height: 18 }} />
        Mother not known (adds an “Unknown” wife you can fill in later)
      </label>
      <ErrorBox error={error} />
      <div className="footer">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}
          onClick={() => run(async () => {
            if (!father) throw new Error('Choose or add the father')
            if (!motherUnknown && !mother) throw new Error('Choose or add the mother, or tick “Mother not known”')
            await api('POST', `/persons/${person.id}/parents`, { father, mother: motherUnknown ? { unknown: true } : mother })
            onDone()
          })}>Add parents</button>
      </div>
    </Modal>
  )
}

// ---------------- End a marriage ----------------

export function EndMarriageModal({ house, onClose, onDone }: { house: { id: string; label: string; wifeName: string }; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('divorce')
  const [endedOn, setEndedOn] = useState('')
  const { busy, error, run } = useAction()
  return (
    <Modal title={`End House ${house.label}`} eyebrow={house.wifeName} onClose={onClose}>
      <p className="muted" style={{ margin: '8px 0 0' }}>The house stays on the tree, marked as ended. Its children keep belonging to it.</p>
      <div className="grid2">
        <label className="field"><span>Reason</span>
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="divorce">Divorce or separation</option><option value="death">Death of the wife</option><option value="other">Other</option>
          </select>
        </label>
        <label className="field"><span>Date (optional)</span>
          <input className="input" type="date" value={endedOn} onChange={(e) => setEndedOn(e.target.value)} />
        </label>
      </div>
      <ErrorBox error={error} />
      <div className="footer">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}
          onClick={() => run(async () => { await api('POST', `/houses/${house.id}/end`, { reason, endedOn: endedOn || undefined }); onDone() })}>End marriage</button>
      </div>
    </Modal>
  )
}

// ---------------- Members ----------------

export function MembersModal({ treeId, isAdmin, onClose }: { treeId: string; isAdmin: boolean; onClose: () => void }) {
  const [members, setMembers] = useState<{ id: string; email: string; name: string; role: string }[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const { busy, error, run } = useAction()
  const load = () => api('GET', `/trees/${treeId}/members`).then(setMembers)
  useEffect(() => { load() }, [treeId])

  return (
    <Modal title="People with access" onClose={onClose}>
      <table className="t" style={{ marginTop: 16 }}>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
        <tbody>{members.map((m) => <tr key={m.id}><td>{m.name}</td><td>{m.email}</td><td>{m.role}</td></tr>)}</tbody>
      </table>
      {isAdmin && (
        <>
          <p className="muted small" style={{ marginTop: 18 }}>Admins see restricted details such as biological fathers. Editors can add and change records. Viewers can only look.</p>
          <div className="grid2">
            <label className="field"><span>Email of someone with an account</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="field"><span>Role</span>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option>
              </select>
            </label>
          </div>
          <ErrorBox error={error} />
          <div className="footer">
            <button className="btn btn-primary" disabled={busy}
              onClick={() => run(async () => { await api('POST', `/trees/${treeId}/members`, { email, role }); setEmail(''); await load() })}>Add</button>
          </div>
        </>
      )}
    </Modal>
  )
}
