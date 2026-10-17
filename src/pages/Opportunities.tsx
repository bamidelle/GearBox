import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import {
  STATUSES,
  STATUS_LABELS,
  fetchAll,
  formatDate,
  money,
  type OpportunityStatus,
} from '../lib/types'

type Row = {
  id: string
  description: string
  estimate_amount: number | null
  currency: string
  declined_at: string | null
  status: OpportunityStatus
  customers: { name: string; email: string | null } | null
  vehicles: { year: number | null; make: string | null; model: string | null } | null
}

export default function Opportunities() {
  const { shop } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'all' | 'open' | OpportunityStatus>('open')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!shop) return
    let cancelled = false
    setLoading(true)
    fetchAll<Row>((from, to) =>
      supabase
        .from('repair_opportunities')
        .select(
          'id, description, estimate_amount, currency, declined_at, status, customers(name, email), vehicles(year, make, model)',
        )
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false })
        .range(from, to),
    )
      .then((data) => !cancelled && setRows(data))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [shop])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (status === 'open') {
        if (['paid', 'declined_again', 'opted_out', 'closed'].includes(r.status)) return false
      } else if (status !== 'all' && r.status !== status) return false
      if (!q) return true
      return (
        r.description.toLowerCase().includes(q) ||
        (r.customers?.name ?? '').toLowerCase().includes(q) ||
        (r.customers?.email ?? '').toLowerCase().includes(q)
      )
    })
  }, [rows, status, query])

  return (
    <main className="card wide">
      <h1>Opportunities</h1>

      <div className="toolbar">
        <input
          placeholder="Search customer or repair"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="open">Open</option>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <Link to="/import" className="btn">
          Import CSV
        </Link>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading...</p>}

      {!loading && !error && filtered.length === 0 && (
        <p className="muted">
          {rows.length === 0 ? 'No opportunities yet. Import a CSV to get started.' : 'Nothing matches.'}
        </p>
      )}

      {filtered.length > 0 && (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Declined repair</th>
                <th>Estimate</th>
                <th>Declined</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="clickable">
                  <td>
                    <Link to={`/opportunities/${r.id}`}>{r.customers?.name ?? 'Unknown'}</Link>
                  </td>
                  <td>
                    {[r.vehicles?.year, r.vehicles?.make, r.vehicles?.model].filter(Boolean).join(' ') || '-'}
                  </td>
                  <td>{r.description}</td>
                  <td>{money(r.estimate_amount, r.currency)}</td>
                  <td>{formatDate(r.declined_at)}</td>
                  <td>
                    <span className={`badge ${r.status}`}>{STATUS_LABELS[r.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">{filtered.length} shown</p>
    </main>
  )
}
