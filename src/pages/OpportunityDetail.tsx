import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  STATUSES,
  STATUS_LABELS,
  formatDate,
  money,
  type OpportunityStatus,
} from '../lib/types'

type Detail = {
  id: string
  description: string
  estimate_amount: number | null
  currency: string
  declined_at: string | null
  status: OpportunityStatus
  next_action_at: string | null
  next_action_note: string | null
  sequence_paused: boolean
  approved_amount: number | null
  approved_at: string | null
  paid_amount: number | null
  paid_at: string | null
  customers: {
    id: string
    name: string
    email: string | null
    phone: string | null
    consent_status: string
  } | null
  vehicles: { year: number | null; make: string | null; model: string | null } | null
}

type Note = { id: string; body: string; created_at: string }
type History = { id: string; from_status: OpportunityStatus | null; to_status: OpportunityStatus; created_at: string }

const todayIso = () => new Date().toISOString().slice(0, 10)

function parseMoney(input: string): number | null {
  const n = Number(input.replace(/[^0-9.\-]/g, ''))
  return input.trim() && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

export default function OpportunityDetail() {
  const { id } = useParams()
  const { shop, session } = useAuth()

  const [opp, setOpp] = useState<Detail | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [history, setHistory] = useState<History[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [newStatus, setNewStatus] = useState<OpportunityStatus>('new')
  const [amount, setAmount] = useState('')
  const [paidDate, setPaidDate] = useState(todayIso())
  const [noteBody, setNoteBody] = useState('')
  const [nextDate, setNextDate] = useState('')
  const [nextNote, setNextNote] = useState('')

  const load = useCallback(async () => {
    if (!shop || !id) return
    const [o, n, h] = await Promise.all([
      supabase
        .from('repair_opportunities')
        .select(
          'id, description, estimate_amount, currency, declined_at, status, next_action_at, next_action_note, sequence_paused, approved_amount, approved_at, paid_amount, paid_at, customers(id, name, email, phone, consent_status), vehicles(year, make, model)',
        )
        .eq('id', id)
        .eq('shop_id', shop.id)
        .maybeSingle(),
      supabase
        .from('opportunity_notes')
        .select('id, body, created_at')
        .eq('opportunity_id', id)
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('opportunity_status_history')
        .select('id, from_status, to_status, created_at')
        .eq('opportunity_id', id)
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false }),
    ])
    if (o.error) throw new Error(o.error.message)
    if (n.error) throw new Error(n.error.message)
    if (h.error) throw new Error(h.error.message)
    const detail = o.data as unknown as Detail | null
    setOpp(detail)
    setNotes((n.data ?? []) as Note[])
    setHistory((h.data ?? []) as History[])
    if (detail) {
      setNewStatus(detail.status)
      setNextDate(detail.next_action_at ? detail.next_action_at.slice(0, 10) : '')
      setNextNote(detail.next_action_note ?? '')
    }
  }, [shop, id])

  useEffect(() => {
    setLoading(true)
    load()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [load])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  async function patch(values: Record<string, unknown>) {
    if (!shop || !id) return
    const { error } = await supabase
      .from('repair_opportunities')
      .update(values)
      .eq('id', id)
      .eq('shop_id', shop.id)
    if (error) throw new Error(error.message)
  }

  function onChangeStatus(e: FormEvent) {
    e.preventDefault()
    if (!opp) return
    run(async () => {
      const values: Record<string, unknown> = { status: newStatus }
      if (newStatus === 'approved') {
        const a = parseMoney(amount || String(opp.estimate_amount ?? ''))
        if (a === null) throw new Error('Enter the approved amount.')
        values.approved_amount = a
        values.approved_at = new Date().toISOString()
      }
      if (newStatus === 'work_completed') values.completed_at = new Date().toISOString()
      if (newStatus === 'paid') {
        const a = parseMoney(amount || String(opp.approved_amount ?? opp.estimate_amount ?? ''))
        if (a === null) throw new Error('Enter the amount the customer paid.')
        if (!paidDate) throw new Error('Enter the payment date.')
        values.paid_amount = a
        values.paid_at = new Date(`${paidDate}T12:00:00`).toISOString()
      }
      await patch(values)
      setAmount('')
    })
  }

  function onAddNote(e: FormEvent) {
    e.preventDefault()
    const body = noteBody.trim()
    if (!body || !shop || !id || !session) return
    run(async () => {
      const { error } = await supabase.from('opportunity_notes').insert({
        shop_id: shop.id,
        opportunity_id: id,
        author_id: session.user.id,
        body,
      })
      if (error) throw new Error(error.message)
      setNoteBody('')
    })
  }

  function onSaveNextAction(e: FormEvent) {
    e.preventDefault()
    run(() =>
      patch({
        next_action_at: nextDate ? new Date(`${nextDate}T09:00:00`).toISOString() : null,
        next_action_note: nextNote.trim() || null,
      }),
    )
  }

  if (loading) return <main className="card wide"><p className="muted">Loading...</p></main>
  if (!opp)
    return (
      <main className="card wide">
        <p>Opportunity not found.</p>
        <Link to="/opportunities">Back to opportunities</Link>
      </main>
    )

  const vehicle = [opp.vehicles?.year, opp.vehicles?.make, opp.vehicles?.model].filter(Boolean).join(' ')
  const needsAmount = newStatus === 'approved' || newStatus === 'paid'

  return (
    <main className="card wide">
      <p>
        <Link to="/opportunities">&larr; Opportunities</Link>
      </p>
      <h1>{opp.description}</h1>
      <p>
        <span className={`badge ${opp.status}`}>{STATUS_LABELS[opp.status]}</span>
      </p>

      {error && <p className="error">{error}</p>}

      <div className="two-col">
        <div className="panel">
          <h2>Customer</h2>
          <p>
            <strong>{opp.customers?.name}</strong>
            <br />
            {opp.customers?.email ?? 'No email'}
            <br />
            {opp.customers?.phone ?? 'No phone'}
          </p>
          <p className="muted">Contact consent: {opp.customers?.consent_status}</p>
          <p>Vehicle: {vehicle || '-'}</p>
        </div>
        <div className="panel">
          <h2>Money</h2>
          <p>Estimate: {money(opp.estimate_amount, opp.currency)}</p>
          <p>Approved: {money(opp.approved_amount, opp.currency)}</p>
          <p>
            <strong>Recovered: {money(opp.paid_amount, opp.currency)}</strong>
            {opp.paid_at && <span className="muted"> on {formatDate(opp.paid_at)}</span>}
          </p>
          <p className="muted">Declined {formatDate(opp.declined_at)}</p>
        </div>
      </div>

      <div className="panel">
        <h2>Update status</h2>
        <form onSubmit={onChangeStatus}>
          <label>
            Status
            <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as OpportunityStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          {needsAmount && (
            <label>
              {newStatus === 'approved' ? 'Approved amount' : 'Amount paid'}
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={String(
                  (newStatus === 'paid' ? (opp.approved_amount ?? opp.estimate_amount) : opp.estimate_amount) ?? '',
                )}
              />
            </label>
          )}
          {newStatus === 'paid' && (
            <label>
              Payment date
              <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </label>
          )}
          <button type="submit" disabled={busy || newStatus === opp.status}>
            Save status
          </button>
        </form>
      </div>

      <div className="two-col">
        <div className="panel">
          <h2>Next action</h2>
          <form onSubmit={onSaveNextAction}>
            <label>
              Date
              <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
            </label>
            <label>
              Note
              <input value={nextNote} onChange={(e) => setNextNote(e.target.value)} maxLength={200} />
            </label>
            <button type="submit" disabled={busy}>
              Save
            </button>
          </form>
          <label className="check">
            <input
              type="checkbox"
              checked={opp.sequence_paused}
              disabled={busy}
              onChange={(e) => run(() => patch({ sequence_paused: e.target.checked }))}
            />
            <span>Pause automatic follow-ups for this repair</span>
          </label>
        </div>

        <div className="panel">
          <h2>Notes</h2>
          <form onSubmit={onAddNote}>
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              maxLength={4000}
              placeholder="Called customer, left voicemail..."
            />
            <button type="submit" disabled={busy || !noteBody.trim()}>
              Add note
            </button>
          </form>
          <ul className="timeline">
            {notes.map((n) => (
              <li key={n.id}>
                <div className="when">{new Date(n.created_at).toLocaleString()}</div>
                {n.body}
              </li>
            ))}
            {notes.length === 0 && <li className="muted">No notes yet.</li>}
          </ul>
        </div>
      </div>

      <div className="panel">
        <h2>History</h2>
        <ul className="timeline">
          {history.map((h) => (
            <li key={h.id}>
              <div className="when">{new Date(h.created_at).toLocaleString()}</div>
              {h.from_status ? `${STATUS_LABELS[h.from_status]} \u2192 ` : 'Created as '}
              {STATUS_LABELS[h.to_status]}
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
