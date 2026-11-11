import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { api, fullName, lifespan, type Person, type PersonInput, type PersonRef } from './api'

export function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" />
      <path d="M12 7.5V12M12 12H5v4.5M12 12h7v4.5" />
    </svg>
  )
}

export function LockIcon({ label }: { label?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  )
}

export function Modal({ title, eyebrow, onClose, children }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode }) {
  const id = useId()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="modal-head">
          <div>
            {eyebrow && <p className="muted small" style={{ margin: 0 }}>{eyebrow}</p>}
            <h1 id={id} style={{ fontSize: 26, marginTop: 4 }}>{title}</h1>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ErrorBox({ error }: { error: string | null }) {
  return error ? <div className="error" role="alert">{error}</div> : null
}

/** Runs an async action with busy and error state for a form. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run, setError }
}

export function PersonFields({ value, onChange, fixedSex }: { value: PersonInput; onChange: (v: PersonInput) => void; fixedSex?: 'M' | 'F' }) {
  const set = (patch: Partial<PersonInput>) => onChange({ ...value, ...patch })
  return (
    <>
      <div className="grid2">
        <label className="field"><span>First name</span>
          <input className="input" required value={value.firstName} onChange={(e) => set({ firstName: e.target.value })} />
        </label>
        <label className="field"><span>Other names</span>
          <input className="input" value={value.otherNames ?? ''} onChange={(e) => set({ otherNames: e.target.value })} />
        </label>
      </div>
      <div className="grid3">
        {!fixedSex && (
          <label className="field"><span>Sex</span>
            <select className="input" value={value.sex} onChange={(e) => set({ sex: e.target.value as PersonInput['sex'] })}>
              <option value="M">Male</option><option value="F">Female</option><option value="U">Unknown</option>
            </select>
          </label>
        )}
        <label className="field"><span>Birth year</span>
          <input className="input" inputMode="numeric" value={value.birthYear ?? ''} placeholder="e.g. 1952"
            onChange={(e) => set({ birthYear: e.target.value ? Number(e.target.value) || undefined : undefined })} />
        </label>
        <label className="field"><span>Clan (optional)</span>
          <input className="input" value={value.clan ?? ''} onChange={(e) => set({ clan: e.target.value || undefined })} />
        </label>
      </div>
      <label className="row" style={{ marginTop: 12, minHeight: 36, fontSize: 14 }}>
        <input type="checkbox" checked={!!value.isDeceased} onChange={(e) => set({ isDeceased: e.target.checked })} style={{ width: 18, height: 18 }} />
        Deceased
      </label>
    </>
  )
}

export const emptyPerson = (sex: 'M' | 'F' | 'U' = 'M'): PersonInput => ({ firstName: '', otherNames: '', sex })

export function cleanPerson(p: PersonInput): PersonInput {
  const out: PersonInput = { ...p, firstName: p.firstName.trim(), otherNames: (p.otherNames ?? '').trim() }
  if (!out.clan) delete out.clan
  if (!out.birthYear) delete out.birthYear
  return out
}

/** Choose an existing person or describe a new one, with a duplicate check on new names. */
export function PersonPicker({ treeId, label, sex, value, onChange, exclude = [] }: {
  treeId: string
  label: string
  sex?: 'M' | 'F'
  value: PersonRef | null
  onChange: (v: PersonRef | null) => void
  exclude?: string[]
}) {
  const [mode, setMode] = useState<'find' | 'new'>('find')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [picked, setPicked] = useState<Person | null>(null)
  const [draft, setDraft] = useState<PersonInput>(emptyPerson(sex ?? 'M'))
  const [matches, setMatches] = useState<{ person: Person; name: string }[]>([])
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (mode !== 'find' || picked) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      const rows = await api<Person[]>('GET', `/trees/${treeId}/persons?q=${encodeURIComponent(q)}`)
      setResults(rows.filter((p) => (!sex || p.sex === sex || p.sex === 'U') && !exclude.includes(p.id)))
    }, 200)
    return () => window.clearTimeout(timer.current)
  }, [q, mode, picked, treeId, sex, exclude.join(',')])

  useEffect(() => {
    if (mode !== 'new') return
    if (!draft.firstName.trim()) {
      setMatches([])
      onChange(null)
      return
    }
    onChange({ new: cleanPerson(draft) })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      const params = new URLSearchParams({ firstName: draft.firstName.trim(), otherNames: draft.otherNames ?? '' })
      if (draft.birthYear) params.set('birthYear', String(draft.birthYear))
      const rows = await api<{ person: Person; name: string }[]>('GET', `/trees/${treeId}/persons/matches?${params}`)
      setMatches(rows.filter((m) => !exclude.includes(m.person.id)))
    }, 300)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, mode])

  const choose = (p: Person) => {
    setPicked(p)
    setMode('find')
    onChange({ id: p.id })
  }

  return (
    <div className="field">
      <span>{label}</span>
      {picked && value && 'id' in value ? (
        <div className="picked">
          <span><strong>{fullName(picked)}</strong> <span className="muted small">{lifespan(picked)}</span></span>
          <button type="button" className="btn-link" onClick={() => { setPicked(null); onChange(null) }}>Change</button>
        </div>
      ) : mode === 'find' ? (
        <>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input" placeholder="Search people in this tree" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search for ${label}`} />
            <button type="button" className="btn" onClick={() => { setMode('new'); setDraft({ ...emptyPerson(sex ?? 'M'), firstName: q.split(' ')[0] ?? '', otherNames: q.split(' ').slice(1).join(' ') }) }}>New person</button>
          </div>
          {results.length > 0 && (
            <div className="picker-list">
              {results.map((p) => (
                <button type="button" key={p.id} onClick={() => choose(p)}>
                  <span>{fullName(p)}</span><span className="muted small">{lifespan(p)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '4px 14px 14px' }}>
          <PersonFields value={draft} onChange={setDraft} fixedSex={sex} />
          {matches.length > 0 && (
            <div className="note">
              <strong>Already in this tree?</strong>
              {matches.map((m) => (
                <div key={m.person.id} className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
                  <span>{m.name} <span className="small">{lifespan(m.person)}</span></span>
                  <button type="button" className="btn-link" onClick={() => choose(m.person)}>Use this person</button>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="btn-link" style={{ marginTop: 8 }} onClick={() => { setMode('find'); onChange(null) }}>Search existing instead</button>
        </div>
      )}
    </div>
  )
}
