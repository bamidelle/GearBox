import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import Replies from '../components/Replies'
import { Icon, type IconName } from '../components/Icons'
import { Donut, TrendChart } from '../components/Charts'
import { STATUS_LABELS, fetchAll, money, type OpportunityStatus } from '../lib/types'

type Stat = {
  status: OpportunityStatus
  paid_amount: number | null
  paid_at: string | null
}

type Recent = {
  id: string
  description: string
  estimate_amount: number | null
  currency: string
  status: OpportunityStatus
  customers: { name: string } | null
  vehicles: { year: number | null; make: string | null; model: string | null } | null
}

const APPROVED: OpportunityStatus[] = ['approved', 'work_completed', 'paid']
const IN_PROGRESS: OpportunityStatus[] = ['follow_up_scheduled', 'contacted', 'customer_interested', 'appointment_requested']
const NO_RESPONSE: OpportunityStatus[] = ['new']
const DECLINED: OpportunityStatus[] = ['declined_again', 'opted_out', 'closed']

function Kpi({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="kpi">
      <span className="ico">
        <Icon name={icon} />
      </span>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  )
}

export default function Home() {
  const { shop } = useAuth()
  const [stats, setStats] = useState<Stat[] | null>(null)
  const [recent, setRecent] = useState<Recent[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!shop) return
    let cancelled = false
    fetchAll<Stat>((from, to) =>
      supabase
        .from('repair_opportunities')
        .select('status, paid_amount, paid_at')
        .eq('shop_id', shop.id)
        .range(from, to),
    )
      .then((data) => !cancelled && setStats(data))
      .catch((e: Error) => !cancelled && setError(e.message))

    supabase
      .from('repair_opportunities')
      .select('id, description, estimate_amount, currency, status, customers(name), vehicles(year, make, model)')
      .eq('shop_id', shop.id)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => !cancelled && setRecent((data ?? []) as unknown as Recent[]))
    return () => {
      cancelled = true
    }
  }, [shop])

  const trend = useMemo(() => {
    const paid = (stats ?? []).filter((s) => s.status === 'paid' && s.paid_at && s.paid_amount)
    const now = Date.now()
    const week = 7 * 86_400_000
    return Array.from({ length: 8 }, (_, i) => {
      const end = now - (7 - i) * week
      const value = paid
        .filter((p) => new Date(p.paid_at as string).getTime() <= end + week)
        .reduce((acc, p) => acc + (p.paid_amount ?? 0), 0)
      const d = new Date(end + week)
      return { label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value }
    })
  }, [stats])

  if (!shop) return null
  const cur = shop.currency
  const all = stats ?? []
  const total = all.length
  const count = (list: OpportunityStatus[]) => all.filter((s) => list.includes(s.status)).length
  const approved = count(APPROVED)
  const recovered = all
    .filter((s) => s.status === 'paid')
    .reduce((acc, s) => acc + (s.paid_amount ?? 0), 0)
  const conversion = total > 0 ? (approved / total) * 100 : 0
  const hasRecovered = trend.some((p) => p.value > 0)

  return (
    <main className="page">
      <h1>Dashboard</h1>
      <p className="muted">Here&rsquo;s what&rsquo;s happening with your follow-ups.</p>
      {error && <p className="error">{error}</p>}

      <Replies />

      {stats && total === 0 && (
        <div className="panel">
          <p>
            No declined repairs yet. <Link to="/import">Import a CSV</Link> or{' '}
            <Link to="/opportunities/new">add one manually</Link> to start recovering revenue.
          </p>
        </div>
      )}

      {stats && total > 0 && (
        <>
          <div className="kpis">
            <Kpi icon="jobs" label="Total Declined Jobs" value={String(total)} />
            <Kpi icon="check" label="Approved Repairs" value={String(approved)} />
            <Kpi icon="dollar" label="Recovered Revenue" value={money(recovered, cur)} />
            <Kpi icon="percent" label="Conversion Rate" value={`${conversion.toFixed(1)}%`} />
          </div>

          <div className="dash-grid">
            <div className="panel">
              <h2>Revenue Recovery Trend</h2>
              {hasRecovered ? (
                <TrendChart points={trend} currency={cur} />
              ) : (
                <p className="muted">No recovered revenue yet. It appears here once a repair is marked paid.</p>
              )}
            </div>
            <div className="panel">
              <h2>Job Outcomes</h2>
              <Donut
                segments={[
                  { label: 'Approved', count: approved, color: '#16a34a' },
                  { label: 'In Progress', count: count(IN_PROGRESS), color: '#f59e0b' },
                  { label: 'No Response', count: count(NO_RESPONSE), color: '#9ca3af' },
                  { label: 'Declined', count: count(DECLINED), color: '#dc2626' },
                ]}
              />
            </div>
          </div>

          <div className="panel">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>Recent Declined Jobs</h2>
              <Link to="/opportunities">View all &rarr;</Link>
            </div>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Vehicle</th>
                    <th>Service</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id} className="clickable">
                      <td>
                        <Link to={`/opportunities/${r.id}`}>{r.customers?.name ?? 'Unknown'}</Link>
                      </td>
                      <td>{[r.vehicles?.year, r.vehicles?.make, r.vehicles?.model].filter(Boolean).join(' ') || '-'}</td>
                      <td>{r.description}</td>
                      <td>{money(r.estimate_amount, r.currency)}</td>
                      <td>
                        <span className={`badge ${r.status}`}>{STATUS_LABELS[r.status]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
