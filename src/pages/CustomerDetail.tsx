import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { STATUS_LABELS, formatDate, money, type OpportunityStatus } from '../lib/types'
import '../customers.css'

type Customer = {
  id: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  consent_status: 'unknown' | 'granted' | 'withdrawn'
}
type Vehicle = { id: string; year: number | null; make: string | null; model: string | null }
type Opp = {
  id: string
  description: string
  status: OpportunityStatus
  estimate_amount: number | null
  currency: string
  declined_at: string | null
}

export default function CustomerDetail() {
  const { id } = useParams()
  const { shop } = useAuth()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [opps, setOpps] = useState<Opp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [consent, setConsent] = useState<Customer['consent_status']>('unknown')

  const load = useCallback(async () => {
    if (!shop || !id) return
    const [c, v, o] = await Promise.all([
      supabase
        .from('customers')
        .select('id, name, email, phone, notes, consent_status')
        .eq('id', id)
        .eq('shop_id', shop.id)
        .maybeSingle(),
      supabase.from('vehicles').select('id, year, make, model').eq('customer_id', id).eq('shop_id', shop.id),
      supabase
        .from('repair_opportunities')
        .select('id, description, status, estimate_amount, currency, declined_at')
        .eq('customer_id', id)
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false }),
    ])
    if (c.error) throw new Error(c.error.message)
    const row = c.data as Customer | null
    setCustomer(row)
    setVehicles((v.data ?? []) as Vehicle[])
    setOpps((o.data ?? []) as Opp[])
    if (row) {
      setName(row.name)
      setEmail(row.email ?? '')
      setPhone(row.phone ?? '')
      setNotes(row.notes ?? '')
      setConsent(row.consent_status)
    }
  }, [shop, id])

  useEffect(() => {
    load()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [load])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!shop || !customer) return
    setBusy(true)
    setError(null)
    setSaved(false)

    const patch: Record<string, unknown> = {
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      notes: notes.trim() || null,
      consent_status: consent,
    }
    if (consent !== customer.consent_status) {
      if (consent === 'withdrawn') {
        patch.opted_out_at = new Date().toISOString()
      } else {
        patch.opted_out_at = null
        if (consent === 'granted') {
          patch.consent_at = new Date().toISOString()
          patch.consent_source = 'manual'
        }
      }
    }

    const { error } = await supabase.from('customers').update(patch).eq('id', customer.id).eq('shop_id', shop.id)
    if (error) setError(error.message)
    else {
      setSaved(true)
      await load().catch(() => undefined)
    }
    setBusy(false)
  }

  if (loading) return <main className="card wide"><p className="muted">Loading...</p></main>
  if (!customer)
    return (
      <main className="card wide">
        <p>Customer not found.</p>
        <Link to="/customers">Back to customers</Link>
      </main>
    )

  return (
    <main className="card wide">
      <p>
        <Link to="/customers">&larr; Customers</Link>
      </p>
      <h1>{customer.name}</h1>

      <div className="panel">
        <h2>Details</h2>
        <form onSubmit={onSave}>
          <div className="grid">
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label>
              Email contact
              <select value={consent} onChange={(e) => setConsent(e.target.value as Customer['consent_status'])}>
                <option value="unknown">Not recorded (will receive follow-ups)</option>
                <option value="granted">Consented</option>
                <option value="withdrawn">Opted out (no emails)</option>
              </select>
            </label>
          </div>
          <label>
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          {saved && <p className="notice">Saved.</p>}
          <button type="submit" disabled={busy}>
            Save customer
          </button>
        </form>
      </div>

      <div className="two-col">
        <div className="panel">
          <h2>Vehicles</h2>
          <ul className="timeline">
            {vehicles.map((v) => (
              <li key={v.id}>{[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unknown vehicle'}</li>
            ))}
            {vehicles.length === 0 && <li className="muted">No vehicles recorded.</li>}
          </ul>
        </div>
        <div className="panel">
          <h2>Declined repairs</h2>
          <ul className="timeline">
            {opps.map((o) => (
              <li key={o.id}>
                <Link to={`/opportunities/${o.id}`}>{o.description}</Link>
                <div>
                  <span className={`badge ${o.status}`}>{STATUS_LABELS[o.status]}</span>{' '}
                  <span className="muted">
                    {money(o.estimate_amount, o.currency)} &middot; {formatDate(o.declined_at)}
                  </span>
                </div>
              </li>
            ))}
            {opps.length === 0 && <li className="muted">None.</li>}
          </ul>
        </div>
      </div>
    </main>
  )
}
