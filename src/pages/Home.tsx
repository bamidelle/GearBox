import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import Replies from '../components/Replies'
import { STATUSES, STATUS_LABELS, fetchAll, isOpen, money, type OpportunityStatus } from '../lib/types'

type Row = {
  status: OpportunityStatus
  estimate_amount: number | null
  approved_amount: number | null
  paid_amount: number | null
}

export default function Home() {
  const { shop } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!shop) return
    let cancelled = false
    fetchAll<Row>((from, to) =>
      supabase
        .from('repair_opportunities')
        .select('status, estimate_amount, approved_amount, paid_amount')
        .eq('shop_id', shop.id)
        .range(from, to),
    )
      .then((data) => !cancelled && setRows(data))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [shop])

  if (!shop) return null
  const cur = shop.currency

  const total = rows?.length ?? 0
  const sum = (list: Row[], pick: (r: Row) => number | null) =>
    list.reduce((acc, r) => acc + (pick(r) ?? 0), 0)

  const open = (rows ?? []).filter((r) => isOpen(r.status))
  const paid = (rows ?? []).filter((r) => r.status === 'paid')
  const inProgress = (rows ?? []).filter((r) => r.status === 'approved' || r.status === 'work_completed')

  const declinedValue = sum(rows ?? [], (r) => r.estimate_amount)
  const recovered = sum(paid, (r) => r.paid_amount)
  const rate = declinedValue > 0 ? (recovered / declinedValue) * 100 : 0

  const byStatus = STATUSES.map((s) => ({
    status: s,
    count: (rows ?? []).filter((r) => r.status === s).length,
  })).filter((x) => x.count > 0)

  return (
    <main className="card wide">
      <h1>Dashboard</h1>
      {error && <p className="error">{error}</p>}

      <Replies />

      {rows && total === 0 && (
        <p>
          No declined repairs yet. <Link to="/import">Import a CSV</Link> to start recovering revenue.
        </p>
      )}

      {rows && total > 0 && (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="value">{money(recovered, cur)}</div>
              <div className="label">Recovered revenue ({paid.length} paid)</div>
            </div>
            <div className="kpi">
              <div className="value">{money(sum(open, (r) => r.estimate_amount), cur)}</div>
              <div className="label">Open opportunities ({open.length})</div>
            </div>
            <div className="kpi">
              <div className="value">{money(sum(inProgress, (r) => r.approved_amount), cur)}</div>
              <div className="label">Approved, not yet paid ({inProgress.length})</div>
            </div>
            <div className="kpi">
              <div className="value">{rate.toFixed(1)}%</div>
              <div className="label">Recovery rate of {money(declinedValue, cur)} declined</div>
            </div>
          </div>

          <div className="panel">
            <h2>By status</h2>
            <ul className="timeline">
              {byStatus.map((x) => (
                <li key={x.status}>
                  <span className={`badge ${x.status}`}>{STATUS_LABELS[x.status]}</span> {x.count}
                </li>
              ))}
            </ul>
          </div>

          <p>
            <Link to="/opportunities">View all opportunities</Link>
          </p>
        </>
      )}
    </main>
  )
}
