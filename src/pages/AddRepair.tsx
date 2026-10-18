import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { FIELDS, validateRows, type Mapping, type RawRow } from '../lib/csvImport'
import { runImport } from '../lib/importRunner'

const IDENTITY_MAPPING = Object.fromEntries(FIELDS.map((f) => [f.key, f.key])) as Mapping

export default function AddRepair() {
  const navigate = useNavigate()
  const { shop, session } = useAuth()
  const [form, setForm] = useState<RawRow>({
    customer_name: '',
    email: '',
    phone: '',
    vehicle_year: '',
    vehicle_make: '',
    vehicle_model: '',
    description: '',
    estimate_amount: '',
    declined_at: new Date().toISOString().slice(0, 10),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: string, value: string) => setForm({ ...form, [key]: value })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!shop || !session) return
    setError(null)

    const { valid, issues } = validateRows([form], IDENTITY_MAPPING)
    if (issues.length > 0 || valid.length === 0) {
      setError(issues.map((i) => i.message).join('. '))
      return
    }

    setBusy(true)
    try {
      const summary = await runImport({
        shopId: shop.id,
        userId: session.user.id,
        currency: shop.currency,
        filename: 'Manual entry',
        mapping: IDENTITY_MAPPING,
        totalRows: 1,
        valid,
        issues: [],
      })
      if (summary.imported === 0) {
        setError('This declined repair is already recorded for this customer.')
        setBusy(false)
        return
      }
      navigate('/opportunities')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
      setBusy(false)
    }
  }

  return (
    <main className="card wide">
      <h1>Add a declined repair</h1>
      <form onSubmit={onSubmit}>
        <div className="grid">
          <label>
            Customer name *
            <input value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} required />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </label>
          <label>
            Vehicle year
            <input inputMode="numeric" value={form.vehicle_year} onChange={(e) => set('vehicle_year', e.target.value)} />
          </label>
          <label>
            Vehicle make
            <input value={form.vehicle_make} onChange={(e) => set('vehicle_make', e.target.value)} />
          </label>
          <label>
            Vehicle model
            <input value={form.vehicle_model} onChange={(e) => set('vehicle_model', e.target.value)} />
          </label>
          <label>
            Estimate amount
            <input inputMode="decimal" value={form.estimate_amount} onChange={(e) => set('estimate_amount', e.target.value)} />
          </label>
          <label>
            Declined date
            <input type="date" value={form.declined_at} onChange={(e) => set('declined_at', e.target.value)} />
          </label>
        </div>
        <label>
          Declined repair *
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Saving...' : 'Save repair'}
        </button>
      </form>
    </main>
  )
}
