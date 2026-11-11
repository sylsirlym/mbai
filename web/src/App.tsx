import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, NavLink, Outlet, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { api, fullName, initials, lifespan, type Household, type HouseholdSummary, type HouseNode, type Person, type PersonInput, type PersonRef, type Tree } from './api'
import { useAuth } from './auth'
import { AddChildModal, AddParentsModal, EndMarriageModal, flattenHouses, MembersModal, RecordMarriageModal, StartLineModal } from './modals'
import { ErrorBox, LockIcon, Logo, Modal, PersonFields, PersonPicker, useAction } from './ui'

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <p className="muted" style={{ padding: 28 }}>Loading…</p>
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <AuthPage mode="login" />} />
      <Route path="/register" element={user ? <Navigate to="/" /> : <AuthPage mode="register" />} />
      <Route path="/" element={user ? <TreesPage /> : <Navigate to="/login" />} />
      <Route path="/t/:treeId" element={user ? <TreeLayout /> : <Navigate to="/login" />}>
        <Route index element={<TreeHome />} />
        <Route path="h/:householdId" element={<HouseholdPage />} />
        <Route path="p/:personId" element={<PersonPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

// ---------------- auth ----------------

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { busy, error, run } = useAction()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    run(() => (mode === 'login' ? login(email, password) : register(name, email, password)))
  }
  return (
    <div className="auth">
      <form className="card" onSubmit={submit}>
        <div className="brand"><Logo /> Mbai</div>
        <h1 style={{ fontSize: 26, marginTop: 20 }}>{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
        {mode === 'register' && (
          <label className="field"><span>Your name</span><input className="input" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        )}
        <label className="field"><span>Email</span><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label className="field"><span>Password</span>
          <input className="input" type="password" required minLength={mode === 'register' ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>
        <ErrorBox error={error} />
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 20 }} disabled={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <p className="muted small" style={{ textAlign: 'center', marginTop: 16 }}>
          {mode === 'login' ? <>New here? <Link to="/register">Create an account</Link></> : <>Have an account? <Link to="/login">Sign in</Link></>}
        </p>
      </form>
    </div>
  )
}

function TopBar({ treeId }: { treeId?: string }) {
  const { user, logout } = useAuth()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!treeId || !q.trim()) return setResults([])
    const t = window.setTimeout(() => api<Person[]>('GET', `/trees/${treeId}/persons?q=${encodeURIComponent(q)}`).then(setResults), 200)
    return () => window.clearTimeout(t)
  }, [q, treeId])
  return (
    <header className="topbar">
      <Link to="/" className="brand"><Logo /> Mbai</Link>
      {treeId && (
        <div className="search" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}>
          <label className="sr-only" htmlFor="search">Search people</label>
          <input id="search" className="input" type="search" placeholder="Search people in this tree" value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} />
          {open && results.length > 0 && (
            <div className="search-results">
              {results.map((p) => (
                <Link key={p.id} to={`/t/${treeId}/p/${p.id}`} onClick={() => { setOpen(false); setQ('') }}>
                  <span>{fullName(p)}</span><span className="muted small">{lifespan(p)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="spacer" />
      <span className="muted small">{user?.name}</span>
      <button className="avatar-btn" aria-label="Sign out" title="Sign out" onClick={logout}>{initials(user?.name ?? '')}</button>
    </header>
  )
}

// ---------------- trees ----------------

function TreesPage() {
  const [trees, setTrees] = useState<Tree[] | null>(null)
  const [name, setName] = useState('')
  const { busy, error, run } = useAction()
  const nav = useNavigate()
  useEffect(() => { api<Tree[]>('GET', '/trees').then(setTrees) }, [])
  if (trees && trees.length === 1) return <Navigate to={`/t/${trees[0].id}`} replace />
  return (
    <>
      <TopBar />
      <main style={{ maxWidth: 640, margin: '40px auto', padding: '0 20px' }}>
        <h1 style={{ fontSize: 30 }}>Your family trees</h1>
        <div className="stack" style={{ marginTop: 20 }}>
          {trees?.map((t) => (
            <Link key={t.id} to={`/t/${t.id}`} className="card row" style={{ textDecoration: 'none', color: 'inherit', justifyContent: 'space-between' }}>
              <strong>{t.name}</strong><span className="muted small">{t.people} people · {t.role}</span>
            </Link>
          ))}
        </div>
        <form className="card" style={{ marginTop: 24 }}
          onSubmit={(e) => { e.preventDefault(); run(async () => { const t = await api<Tree>('POST', '/trees', { name }); nav(`/t/${t.id}`) }) }}>
          <h2 style={{ fontSize: 20 }}>{trees?.length ? 'Start another tree' : 'Start your first tree'}</h2>
          <p className="muted small">A tree holds one or more family lines. Everyone you invite to it sees all its lines.</p>
          <label className="field"><span>Tree name</span><input className="input" required placeholder="e.g. Muteti family" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <ErrorBox error={error} />
          <div className="footer"><button className="btn btn-primary" disabled={busy}>Create tree</button></div>
        </form>
      </main>
    </>
  )
}

interface TreeCtx {
  tree: Tree
  households: HouseholdSummary[]
  refresh: () => Promise<void>
  canEdit: boolean
}
const TreeContext = createContext<TreeCtx>(null!)
const useTree = () => useContext(TreeContext)

function TreeLayout() {
  const { treeId } = useParams()
  const [tree, setTree] = useState<Tree | null>(null)
  const [households, setHouseholds] = useState<HouseholdSummary[]>([])
  const [modal, setModal] = useState<'line' | 'members' | null>(null)
  const nav = useNavigate()

  const refresh = useCallback(async () => {
    const [trees, hh] = await Promise.all([api<Tree[]>('GET', '/trees'), api<HouseholdSummary[]>('GET', `/trees/${treeId}/households`)])
    setTree(trees.find((t) => t.id === treeId) ?? null)
    setHouseholds(hh)
  }, [treeId])
  useEffect(() => { refresh() }, [refresh])

  if (!tree) return <><TopBar /><p className="muted" style={{ padding: 28 }}>Loading tree…</p></>
  const canEdit = tree.role !== 'viewer'
  const founders = households.filter((h) => h.is_founder)
  const branches = households.filter((h) => !h.is_founder)

  return (
    <TreeContext.Provider value={{ tree, households, refresh, canEdit }}>
      <TopBar treeId={tree.id} />
      <div className="layout frame">
        <nav className="sidebar" aria-label="Households">
          <p className="eyebrow">{tree.name}</p>
          {founders.length > 0 && <p className="muted small" style={{ margin: '14px 0 6px' }}>Lines (founders)</p>}
          <div className="stack" style={{ gap: 2 }}>
            {founders.map((h) => (
              <NavLink key={h.id} className={({ isActive }) => 'hh' + (isActive ? ' active' : '')} to={`/t/${tree.id}/h/${h.id}`}>
                {h.head_name}<span className="small muted">{h.people}</span>
              </NavLink>
            ))}
          </div>
          {branches.length > 0 && <p className="muted small" style={{ margin: '14px 0 6px' }}>Other households</p>}
          <div className="stack" style={{ gap: 2 }}>
            {branches.map((h) => (
              <NavLink key={h.id} className={({ isActive }) => 'hh' + (isActive ? ' active' : '')} to={`/t/${tree.id}/h/${h.id}`}>
                {h.head_name}<span className="small muted">{h.people}</span>
              </NavLink>
            ))}
          </div>
          {canEdit && <button className="btn btn-dashed" style={{ marginTop: 14 }} onClick={() => setModal('line')}>+ Start a new line</button>}
          <button className="btn" style={{ marginTop: 10, width: '100%' }} onClick={() => setModal('members')}>People with access</button>
        </nav>
        <Outlet />
      </div>
      {modal === 'line' && (
        <StartLineModal treeId={tree.id} onClose={() => setModal(null)}
          onDone={(p) => { setModal(null); refresh(); nav(`/t/${tree.id}/p/${p.id}?next=marry`) }} />
      )}
      {modal === 'members' && <MembersModal treeId={tree.id} isAdmin={tree.role === 'admin'} onClose={() => setModal(null)} />}
    </TreeContext.Provider>
  )
}

function TreeHome() {
  const { tree, households } = useTree()
  if (households.length) {
    const first = households.find((h) => h.is_founder) ?? households[0]
    return <Navigate to={`/t/${tree.id}/h/${first.id}`} replace />
  }
  return (
    <main className="content">
      <div className="card" style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: 26 }}>No households yet</h1>
        <p className="muted">A household appears when a man’s first marriage is recorded. Start a line with the oldest person you know of, then record his marriage.</p>
        <p className="muted small">Use “Start a new line” in the sidebar.</p>
      </div>
    </main>
  )
}

// ---------------- household tree ----------------

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

type Selection = { kind: 'head' } | { kind: 'house'; id: string } | null

function HouseholdPage() {
  const { householdId } = useParams()
  const { tree, refresh, canEdit } = useTree()
  const [hh, setHh] = useState<Household | null>(null)
  const [sel, setSel] = useState<Selection>(null)
  const [modal, setModal] = useState<{ kind: 'marry'; sponsor?: string } | { kind: 'child'; houseId?: string } | { kind: 'end'; house: HouseNode } | { kind: 'parents' } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => api<Household>('GET', `/households/${householdId}`).then(setHh).catch((e) => setError(e.message)), [householdId])
  useEffect(() => { setHh(null); setSel(null); load() }, [load])
  const after = () => { setModal(null); load(); refresh() }

  if (error) return <main className="content"><ErrorBox error={error} /></main>
  if (!hh) return <main className="content"><p className="muted">Loading…</p></main>

  const flat = flattenHouses(hh.houses)
  const selected = sel?.kind === 'house' ? flat.find((x) => x.house.id === sel.id) : undefined

  return (
    <>
      <main className="content">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
          <div>
            <p className="muted small" style={{ margin: '0 0 4px' }}>
              Household{hh.birthHousehold && <> · <Link to={`/t/${tree.id}/h/${hh.birthHousehold.id}`}>born in the {hh.birthHousehold.head_name} homestead, House {hh.birthHousehold.label}</Link></>}
            </p>
            <h1 style={{ fontSize: 32 }}>{fullName(hh.head)} homestead</h1>
            <p className="muted small" style={{ margin: '6px 0 0' }}>{hh.counts.houses} houses · {hh.counts.people} people</p>
          </div>
          {canEdit && (
            <div className="row">
              <button className="btn" disabled={!flat.length} onClick={() => setModal({ kind: 'child' })}>Add child</button>
              <button className="btn btn-primary" onClick={() => setModal({ kind: 'marry' })}>Record marriage</button>
            </div>
          )}
        </div>

        <div className="legend">
          <span><span style={{ width: 28, borderTop: '2px solid var(--line)' }} />Marriage to household head</span>
          <span><span style={{ width: 28, borderTop: '2px dashed var(--w2w)' }} />Woman-to-woman marriage</span>
          <span><span style={{ width: 28, borderTop: '2px solid var(--secondary)' }} />Child of the house</span>
          <span><span style={{ width: 14, height: 14, borderRadius: 4, border: '1px dashed var(--line)', background: 'var(--bg)' }} />Ended</span>
        </div>

        <div className="tree-scroll">
          <div className="tree">
            <button className="head-card" onClick={() => setSel({ kind: 'head' })} style={sel?.kind === 'head' ? { boxShadow: '0 0 0 3px var(--accent)' } : undefined}>
              <span className="avatar on-dark" style={{ width: 48, height: 48, borderRadius: 24 }}>{initials(fullName(hh.head))}</span>
              <span className="stack" style={{ gap: 2 }}>
                <span className="eyebrow">Head of household</span>
                <strong style={{ fontSize: 17 }}>{fullName(hh.head)}</strong>
                <span className="small">{lifespan(hh.head)}</span>
              </span>
            </button>
            {hh.houses.length > 0 && <div className="stub" />}
            <div className="branch">
              {hh.houses.map((h) => (
                <section key={h.id} className="col" aria-label={`House ${h.label}`}>
                  <HouseCard house={h} treeId={tree.id} selectedId={sel?.kind === 'house' ? sel.id : undefined} onSelect={(id) => setSel({ kind: 'house', id })} />
                </section>
              ))}
            </div>
          </div>
        </div>
      </main>

      <aside className="aside" aria-label="Selection">
        {sel?.kind === 'head' ? (
          <div className="card">
            <h2 style={{ fontSize: 20 }}>{fullName(hh.head)}</h2>
            <p className="muted small">Head of household · {lifespan(hh.head)}</p>
            <div className="stack" style={{ marginTop: 16 }}>
              <Link className="btn btn-primary" to={`/t/${tree.id}/p/${hh.head.id}`}>Open profile</Link>
              {canEdit && !hh.head.birth_house_id && <button className="btn" onClick={() => setModal({ kind: 'parents' })}>Add his parents</button>}
            </div>
          </div>
        ) : selected ? (
          <div className="card">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <span className={'avatar ' + (selected.chain.length ? 'w2w' : '')} style={{ width: 52, height: 52, borderRadius: 26 }}>{initials(fullName(selected.house.wife))}</span>
              <div>
                <h2 style={{ fontSize: 20 }}>{fullName(selected.house.wife)}</h2>
                <p className="muted small" style={{ margin: '2px 0 0' }}>{lifespan(selected.house.wife) || 'Wife'}</p>
              </div>
            </div>
            <p className="eyebrow" style={{ margin: '18px 0 6px' }}>Where she sits</p>
            <ol className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 14, gap: 6 }}>
              <li>{fullName(hh.head)} homestead</li>
              {selected.chain.map((c) => <li key={c.id}>House {c.label} · {fullName(c.wife)}</li>)}
              <li><strong>House {selected.house.label} · {fullName(selected.house.wife)}</strong></li>
            </ol>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', fontSize: 14, margin: '18px 0 0' }}>
              {selected.chain.length > 0 && <><dt className="muted">Married in by</dt><dd style={{ margin: 0 }}>{fullName(selected.chain[selected.chain.length - 1].wife)}</dd></>}
              <dt className="muted">Form</dt><dd style={{ margin: 0 }}>{cap(selected.house.marriage_form)}{selected.chain.length ? ', woman-to-woman' : ''}</dd>
              {selected.house.started_on && <><dt className="muted">Date</dt><dd style={{ margin: 0 }}>{selected.house.started_on}</dd></>}
              <dt className="muted">Status</dt><dd style={{ margin: 0 }}>{cap(selected.house.status)}{selected.house.end_reason ? ` (${selected.house.end_reason})` : ''}</dd>
              <dt className="muted">Children</dt><dd style={{ margin: 0 }}>{selected.house.children.length}</dd>
            </dl>
            <div className="stack" style={{ marginTop: 20 }}>
              <Link className="btn btn-primary" to={`/t/${tree.id}/p/${selected.house.wife.id}`}>Open profile</Link>
              {canEdit && <button className="btn" onClick={() => setModal({ kind: 'child', houseId: selected.house.id })}>Add a child to this house</button>}
              {canEdit && selected.house.status !== 'ended' && (
                <button className="btn" onClick={() => setModal({ kind: 'marry', sponsor: selected.house.id })}>{selected.house.wife.first_name} marries a wife</button>
              )}
              {canEdit && selected.house.status !== 'ended' && <button className="btn" onClick={() => setModal({ kind: 'end', house: selected.house })}>End this marriage</button>}
            </div>
          </div>
        ) : (
          <div className="card"><p className="muted" style={{ margin: 0 }}>Select the head or a wife to see where they sit and what you can do next.</p></div>
        )}
      </aside>

      {modal?.kind === 'marry' && <RecordMarriageModal treeId={tree.id} household={hh} initialSponsor={modal.sponsor} onClose={() => setModal(null)} onDone={after} />}
      {modal?.kind === 'child' && <AddChildModal treeId={tree.id} household={hh} initialHouseId={modal.houseId} onClose={() => setModal(null)} onDone={after} />}
      {modal?.kind === 'end' && <EndMarriageModal house={{ id: modal.house.id, label: modal.house.label, wifeName: fullName(modal.house.wife) }} onClose={() => setModal(null)} onDone={after} />}
      {modal?.kind === 'parents' && <AddParentsModal person={hh.head} onClose={() => setModal(null)} onDone={after} />}
    </>
  )
}

function HouseCard({ house, treeId, selectedId, onSelect, sub = false }: { house: HouseNode; treeId: string; selectedId?: string; onSelect: (id: string) => void; sub?: boolean }) {
  const ended = house.status === 'ended'
  const wifeName = fullName(house.wife)
  const status = ended ? `Ended${house.ended_on ? ' ' + house.ended_on.slice(0, 4) : ''}` : house.status === 'widowed' ? 'widowed' : ''
  return (
    <div className={'house' + (sub ? ' w2w' : '') + (ended ? ' ended' : '')}>
      <p className="eyebrow" style={{ marginBottom: 10 }}>
        House {house.label}
        {sub ? ' · married in' : ` · ${house.marriage_form}`}
        {house.started_on ? ` · ${house.started_on.slice(0, 4)}` : ''}
        {status && !sub ? ` · ${status}` : ''}
      </p>
      <button className={'person-btn' + (selectedId === house.id ? ' selected' : '')} onClick={() => onSelect(house.id)}>
        <span className={'avatar ' + (sub ? 'w2w' : ended ? 'grey' : '')}>{house.wife.is_placeholder ? '?' : initials(wifeName)}</span>
        <span className="stack" style={{ gap: 0 }}>
          <strong style={{ fontSize: 15 }}>{wifeName}</strong>
          <span className="muted small">{[lifespan(house.wife), sub && status ? status : ''].filter(Boolean).join(' · ') || 'Wife of the house'}</span>
        </span>
      </button>

      {house.houses.map((child) => (
        <div key={child.id} className="subhouse-row">
          <div className="subhouse-line" />
          <HouseCard house={child} treeId={treeId} selectedId={selectedId} onSelect={onSelect} sub />
        </div>
      ))}

      {house.children.length > 0 ? (
        <>
          <p className="muted small" style={{ margin: '14px 0 8px', fontWeight: 500 }}>Children ({house.children.length})</p>
          <div className="children">
            {house.children.map((c) => (
              <div key={c.id} className="stack" style={{ gap: 4 }}>
                <Link className="child-btn" to={`/t/${treeId}/p/${c.id}`}>
                  <span style={{ fontWeight: 500 }}>{fullName(c)}</span>
                  <span className="row muted small" style={{ gap: 6 }}>
                    {c.has_restricted_parent && <LockIcon label="Biological father restricted" />}
                    {c.birth_year ?? ''}
                  </span>
                </Link>
                {c.heads_household_id && <Link className="small" style={{ paddingLeft: 12 }} to={`/t/${treeId}/h/${c.heads_household_id}`}>Heads own homestead →</Link>}
              </div>
            ))}
          </div>
        </>
      ) : (
        !sub && <p className="muted small" style={{ margin: '14px 0 0' }}>No children recorded</p>
      )}
    </div>
  )
}

// ---------------- person profile ----------------

interface PersonView {
  person: Person
  name: string
  headsHousehold: { id: string; houses: { id: string; label: string; wife_id: string; wife_name: string; marriage_form: string; started_on: string | null; ended_on: string | null; end_reason: string | null; sponsor_house_id: string | null }[] } | null
  marriages: { id: string; label: string; marriage_form: string; started_on: string | null; ended_on: string | null; end_reason: string | null; place: string | null; womanToWoman: boolean; household: { id: string; head_id: string; head_name: string; head_deceased: boolean }; chain: { houseId: string; label: string; wifeId: string; wifeName: string }[] }[]
  birth: { houseId: string; label: string; household: { id: string; head_id: string; head_name: string }; socialParents: { id: string; name: string; role: string }[] } | null
  parents: ({ id: string; name: string; relation: string; restricted: boolean; sex: string } | { restricted: true; relation: string; sex: string; id?: undefined; name?: undefined })[]
  children: { id: string; name: string; birth_year: number | null; house_label: string | null; has_restricted_parent: boolean }[]
  canSeeRestricted: boolean
}

function PersonPage() {
  const { personId } = useParams()
  const { tree, refresh, canEdit } = useTree()
  const [v, setV] = useState<PersonView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<'edit' | 'parents' | 'marry' | 'child' | 'merge' | null>(null)
  const [household, setHousehold] = useState<Household | undefined>()
  const nav = useNavigate()
  const askedNext = useRef(false)

  const load = useCallback(() => api<PersonView>('GET', `/persons/${personId}`).then(setV).catch((e) => setError(e.message)), [personId])
  useEffect(() => { setV(null); load() }, [load])
  useEffect(() => {
    // Right after "Start a new line", go straight on to recording the founder's marriage.
    if (v && !askedNext.current && new URLSearchParams(window.location.search).get('next') === 'marry' && canEdit) {
      askedNext.current = true
      openMarry()
    }
  }, [v])
  const after = () => { setModal(null); load(); refresh() }

  async function openMarry() {
    if (!v) return
    setHousehold(v.headsHousehold ? await api<Household>('GET', `/households/${v.headsHousehold.id}`) : undefined)
    setModal('marry')
  }

  if (error) return <main className="content"><ErrorBox error={error} /></main>
  if (!v) return <main className="content"><p className="muted">Loading…</p></main>
  const p = v.person
  const activeWife = v.marriages.find((m) => !m.ended_on && !m.end_reason)

  return (
    <main className="content" style={{ maxWidth: 1240 }}>
      <nav aria-label="Breadcrumb" className="row muted small" style={{ marginBottom: 18 }}>
        {activeWife ? <><Link to={`/t/${tree.id}/h/${activeWife.household.id}`}>{activeWife.household.head_name} homestead</Link><span aria-hidden="true">/</span><span>House {activeWife.label}</span></>
          : v.headsHousehold ? <Link to={`/t/${tree.id}/h/${v.headsHousehold.id}`}>{v.name} homestead</Link>
          : v.birth ? <><Link to={`/t/${tree.id}/h/${v.birth.household.id}`}>{v.birth.household.head_name} homestead</Link><span aria-hidden="true">/</span><span>House {v.birth.label}</span></> : null}
      </nav>

      <section className="row" style={{ justifyContent: 'space-between', gap: 20 }}>
        <div className="row" style={{ gap: 18, flexWrap: 'nowrap' }}>
          <span className={'avatar lg ' + (activeWife?.womanToWoman ? 'w2w' : '')}>{initials(v.name)}</span>
          <div>
            <h1 style={{ fontSize: 32 }}>{v.name}</h1>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 15 }}>
              {[p.sex === 'M' ? 'Male' : p.sex === 'F' ? 'Female' : 'Sex unknown', lifespan(p), p.clan ? `${p.clan} clan` : ''].filter(Boolean).join(' · ')}
            </p>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              {v.headsHousehold && <span className="chip">Head of household</span>}
              {activeWife && <span className={'chip ' + (activeWife.womanToWoman ? 'w2w' : '')}>Wife of House {activeWife.label}</span>}
              <span className={'chip ' + (p.is_deceased ? 'grey' : '')}>{p.is_deceased ? 'Deceased' : 'Living'}</span>
            </div>
          </div>
        </div>
        {canEdit && (
          <div className="row">
            <button className="btn" onClick={() => setModal('edit')}>Edit details</button>
            {!p.birth_house_id && <button className="btn" onClick={() => setModal('parents')}>Add parents</button>}
            {p.sex === 'M' && <button className="btn btn-primary" onClick={openMarry}>Record marriage</button>}
            {p.sex === 'F' && !activeWife && <button className="btn" onClick={() => setModal('child')}>Add child (no house)</button>}
            {tree.role === 'admin' && <button className="btn" onClick={() => setModal('merge')}>Merge duplicate</button>}
          </div>
        )}
      </section>

      <div className="layout" style={{ gap: 24, marginTop: 28 }}>
        <div className="stack" style={{ flex: '999 1 560px', minWidth: 0, gap: 24 }}>
          {v.headsHousehold && (
            <section className="card">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: 20 }}>Houses</h2>
                <Link to={`/t/${tree.id}/h/${v.headsHousehold.id}`}>Open homestead tree</Link>
              </div>
              <table className="t" style={{ marginTop: 10 }}>
                <thead><tr><th>House</th><th>Wife</th><th>Form</th><th>Status</th></tr></thead>
                <tbody>
                  {v.headsHousehold.houses.map((h) => (
                    <tr key={h.id}>
                      <td>{h.label}</td>
                      <td><Link to={`/t/${tree.id}/p/${h.wife_id}`}>{h.wife_name}</Link>{h.sponsor_house_id && <span className="muted small"> · married in</span>}</td>
                      <td>{cap(h.marriage_form)}</td>
                      <td>{h.ended_on || h.end_reason ? `Ended${h.end_reason ? ` (${h.end_reason})` : ''}` : 'Active'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {v.marriages.length > 0 && (
            <section className="card">
              <h2 style={{ fontSize: 20, marginBottom: 16 }}>Marriages</h2>
              <div className="stack" style={{ gap: 12 }}>
                {v.marriages.map((m) => (
                  <div key={m.id} className={'house' + (m.womanToWoman ? ' w2w' : '') + (m.ended_on || m.end_reason ? ' ended' : '')}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>House {m.label} · {m.womanToWoman ? 'woman-to-woman, ' : ''}{m.marriage_form}</strong>
                      <span className="muted small">{m.started_on ? `Since ${m.started_on}` : ''}{m.ended_on || m.end_reason ? ` · ended${m.ended_on ? ' ' + m.ended_on : ''}` : ' · active'}</span>
                    </div>
                    <p className="eyebrow" style={{ margin: '12px 0 6px', color: m.womanToWoman ? 'var(--w2w-text)' : undefined }}>Chain up to the household head</p>
                    <ol className="crumbs">
                      <li><Link to={`/t/${tree.id}/h/${m.household.id}`}>{m.household.head_name} · head</Link></li>
                      {m.chain.map((c, i) => (
                        <li key={c.houseId}>
                          {i === m.chain.length - 1 ? <span className="c current">{c.wifeName} · House {c.label}</span>
                            : <Link to={`/t/${tree.id}/p/${c.wifeId}`}>{c.wifeName} · House {c.label} (sponsor)</Link>}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 20 }}>Children</h2>
              <span className="muted small">Social and biological kept separate</span>
            </div>
            {v.children.length ? (
              <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <table className="t" style={{ minWidth: 480 }}>
                  <thead><tr><th>Child</th><th>House</th><th>Biological father</th></tr></thead>
                  <tbody>
                    {v.children.map((c) => (
                      <tr key={c.id}>
                        <td><Link to={`/t/${tree.id}/p/${c.id}`}>{c.name}</Link>{c.birth_year && <span className="muted small"> · b. {c.birth_year}</span>}</td>
                        <td>{c.house_label ?? '—'}</td>
                        <td>{c.has_restricted_parent ? <span className="row muted" style={{ gap: 6 }}><LockIcon />Restricted</span> : <span className="muted">See profile</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted small">No children recorded.</p>}
          </section>

          <section className="card">
            <h2 style={{ fontSize: 20, marginBottom: 14 }}>Parents</h2>
            {v.birth ? (
              <>
                <p className="muted small" style={{ margin: '0 0 8px' }}>Born into <Link to={`/t/${tree.id}/h/${v.birth.household.id}`}>House {v.birth.label} of the {v.birth.household.head_name} homestead</Link>. Belongs to:</p>
                <div className="grid2">
                  {v.birth.socialParents.map((sp) => (
                    <Link key={sp.id + sp.role} to={`/t/${tree.id}/p/${sp.id}`} className="picked" style={{ textDecoration: 'none', color: 'inherit', marginTop: 0 }}>
                      <span><strong>{sp.name}</strong><br /><span className="muted small">{sp.role}</span></span>
                    </Link>
                  ))}
                </div>
              </>
            ) : <p className="muted small" style={{ margin: 0 }}>Parents not recorded.{canEdit && <> <button className="btn-link" onClick={() => setModal('parents')}>Add parents</button></>}</p>}
            {v.parents.length > 0 && (
              <>
                <p className="muted small" style={{ margin: '16px 0 8px' }}>Biological</p>
                <div className="grid2">
                  {v.parents.map((bp, i) => bp.name ? (
                    <Link key={bp.id} to={`/t/${tree.id}/p/${bp.id}`} className="picked" style={{ textDecoration: 'none', color: 'inherit', marginTop: 0 }}>
                      <span><strong>{bp.name}</strong><br /><span className="muted small">{bp.sex === 'F' ? 'Mother' : 'Father'}{bp.restricted ? ' · restricted' : ''}</span></span>
                      {bp.restricted && <LockIcon label="Restricted" />}
                    </Link>
                  ) : (
                    <div key={i} className="picked" style={{ marginTop: 0 }}><span className="row muted" style={{ gap: 6 }}><LockIcon />{bp.sex === 'F' ? 'Mother' : 'Father'}: restricted</span></div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {modal === 'edit' && <EditPersonModal person={p} onClose={() => setModal(null)} onDone={after} />}
      {modal === 'parents' && <AddParentsModal person={p} onClose={() => setModal(null)} onDone={after} />}
      {modal === 'marry' && (
        <RecordMarriageModal treeId={tree.id} household={household} husband={p} onClose={() => setModal(null)}
          onDone={(h) => { setModal(null); refresh(); nav(`/t/${tree.id}/h/${h.household_id}`) }} />
      )}
      {modal === 'child' && <AddChildModal treeId={tree.id} mother={p} onClose={() => setModal(null)} onDone={after} />}
      {modal === 'merge' && <MergeModal person={p} onClose={() => setModal(null)} onDone={(id) => { setModal(null); refresh(); nav(`/t/${tree.id}/p/${id}`) }} />}
    </main>
  )
}

function EditPersonModal({ person, onClose, onDone }: { person: Person; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState<PersonInput>({
    firstName: person.is_placeholder ? '' : person.first_name, otherNames: person.other_names, sex: person.sex,
    clan: person.clan ?? undefined, birthYear: person.birth_year ?? undefined, isDeceased: person.is_deceased,
  })
  const [deathYear, setDeathYear] = useState(person.death_year ? String(person.death_year) : '')
  const { busy, error, run } = useAction()
  return (
    <Modal title="Edit details" eyebrow={fullName(person)} onClose={onClose}>
      <PersonFields value={v} onChange={setV} />
      {v.isDeceased && (
        <label className="field"><span>Year of death</span>
          <input className="input" inputMode="numeric" value={deathYear} onChange={(e) => setDeathYear(e.target.value)} />
        </label>
      )}
      <ErrorBox error={error} />
      <div className="footer">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => run(async () => {
          await api('PATCH', `/persons/${person.id}`, {
            firstName: v.firstName.trim(), otherNames: (v.otherNames ?? '').trim(), sex: v.sex,
            clan: v.clan || undefined, birthYear: v.birthYear || undefined, isDeceased: !!v.isDeceased,
            deathYear: v.isDeceased && deathYear ? Number(deathYear) : undefined,
          })
          onDone()
        })}>Save</button>
      </div>
    </Modal>
  )
}

function MergeModal({ person, onClose, onDone }: { person: Person; onClose: () => void; onDone: (keptId: string) => void }) {
  const [into, setInto] = useState<PersonRef | null>(null)
  const { busy, error, run } = useAction()
  return (
    <Modal title="Merge duplicate" eyebrow={fullName(person)} onClose={onClose}>
      <p className="muted" style={{ margin: '8px 0 0' }}>Pick the record to keep. Everything linked to {fullName(person)} moves onto it, missing details are filled in, and this record is deleted.</p>
      <PersonPicker treeId={person.tree_id} label="Keep this person" sex={person.sex === 'U' ? undefined : person.sex} value={into} onChange={(r) => setInto(r && 'id' in r ? r : null)} exclude={[person.id]} />
      <ErrorBox error={error} />
      <div className="footer">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={busy || !into} onClick={() => run(async () => {
          const id = (into as { id: string }).id
          await api('POST', `/persons/${person.id}/merge`, { intoId: id })
          onDone(id)
        })}>Merge</button>
      </div>
    </Modal>
  )
}
