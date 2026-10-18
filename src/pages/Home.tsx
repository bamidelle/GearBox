import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import Replies from '../components/Replies'
import { Icon, type IconName } from '../components/Icons'
import { Donut, TrendChart } from '../components/Charts'
import { STATUS_LABELS, fetchAll, money, type OpportunityStatus } from '../lib/types'
import { loadSampleData, removeSampleData, SAMPLE_SOURCE } from '../lib/sampleData'
import '../dashboard.css'

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

type Setup = { address: boolean; templates: boolean; reminders: boolean; sample: number }

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
  const { shop, session } = useAuth()
  const [stats, setStats] = useState<Stat[] | null>(null)
  const [recent, setRecent] = useState<Recent[]>([])
  const [setup, setSetup] = useState<Setup>({ address: false, templates: false, reminders: false, sample: 0 })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)

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

    Promise.all([
      supabase.from('shops').select('postal_address').eq('id', shop.id).maybeSingle(),
      supabase.from('message_templates').select('id', { count: 'exact', head: true }).eq('shop_id', shop.id),
      supabase.from('shop_settings').select('reminders_enabled').eq('shop_id', shop.id).maybeSingle(),
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('shop_id', shop.id)
        .eq('consent_source', SAMPLE_SOURCE),
    ]).then(([shopRow, tpl, settings, sample]) => {
      if (cancelled) return
      setSetup({
        address: Boolean((shopRow.data as { postal_address: string | null } | null)?.postal_address?.trim()),
        templates: (tpl.count ?? 0) > 0,
        reminders: Boolean((settings.data as { reminders_enabled: boolean } | null)?.reminders_enabled),
        sample: sample.count ?? 0,
      })
    })

    return () => {
      cancelled = true
    }
  }, [shop, tick])

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

  async function onLoadSample() {
    if (!shop) return
    setBusy(true)
    setError(null)
    try {
      await loadSampleData(shop.id, shop.currency)
      setTick((t) => t + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load sample data')
    } finally {
      setBusy(false)
    }
  }

  async function onRemoveSample() {
    if (!shop || !window.confirm('Remove all sample data? Your own data is not affected.')) return
    setBusy(true)
    setError(null)
    try {
      await removeSampleData(shop.id)
      setTick((t) => t + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove sample data')
    } finally {
      setBusy(false)
    }
  }

  if (!shop) return null
  const cur = shop.currency
  const all = stats ?? []
  const total = all.length
  const count = (list: OpportunityStatus[]) => all.filter((s) => list.includes(s.status)).length
  const approved = count(APPROVED)
  const recovered = all.filter((s) => s.status === 'paid').reduce((acc, s) => acc + (s.paid_amount ?? 0), 0)
  const conversion = total > 0 ? (approved / total) * 100 : 0
  const hasRecovered = trend.some((p) => p.value > 0)

  const fullName = (session?.user.user_metadata?.full_name as string | undefined)?.trim()
  const first = fullName?.split(/\s+/)[0]

  const steps = [
    { done: setup.address, label: 'Add your shop mailing address', to: '/settings' },
    { done: total - setup.sample > 0, label: 'Import or add your declined repairs', to: '/import' },
    { done: setup.templates, label: 'Create your follow-up email templates', to: '/settings' },
    { done: setup.reminders, label: 'Turn on automatic follow-ups', to: '/settings' },
  ]
  const doneCount = steps.filter((s) => s.done).length

  return (
    <main className="page">
      <div className="hello">
        <div>
          <h1>{first ? `Welcome back, ${first}` : 'Dashboard'}</h1>
          <p className="muted" style={{ margin: 0 }}>
            Here&rsquo;s what&rsquo;s happening with your follow-ups.
          </p>
        </div>
        <Link to="/opportunities/new" className="btn">
          + Add repair
        </Link>
      </div>

      {error && <p className="error">{error}</p>}

      {setup.sample > 0 && (
        <div className="banner">
          <span>You&rsquo;re viewing sample data. Customers have no email, so nothing will be sent.</span>
          <button type="button" className="btn-outline" disabled={busy} onClick={onRemoveSample}>
            Remove sample data
          </button>
        </div>
      )}

      {stats && total === 0 && (
        <div className="empty-hero">
          <h2>Let&rsquo;s recover your first declined repair</h2>
          <p>Import a spreadsheet or add one by hand. Or load sample data to see how the dashboard works.</p>
          <div className="row">
            <Link to="/import" className="btn">
              Import CSV
            </Link>
            <Link to="/opportunities/new" className="btn btn-outline">
              Add a repair
            </Link>
            <button type="button" className="btn-outline" disabled={busy} onClick={onLoadSample}>
              {busy ? 'Loading...' : 'Load sample data'}
            </button>
          </div>
        </div>
      )}

      <Replies />

      <div className="kpis">
        <Kpi icon="jobs" label="Total Declined Jobs" value={String(total)} />
        <Kpi icon="check" label="Approved Repairs" value={String(approved)} />
        <Kpi icon="dollar" label="Recovered Revenue" value={money(recovered, cur)} />
        <Kpi icon="percent" label="Conversion Rate" value={`${conversion.toFixed(1)}%`} />
      </div>

      {doneCount < steps.length && (
        <div className="panel">
          <h2 style={{ marginBottom: 0 }}>Get started</h2>
          <div className="progress">
            <div style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <span className="muted">
            {doneCount} of {steps.length} done
          </span>
          <ul className="checklist">
            {steps.map((s) => (
              <li key={s.label} className={s.done ? 'done' : ''}>
                <span className="tick">{s.done && <Icon name="check" size={14} />}</span>
                <span className="t" style={{ flex: 1 }}>
                  {s.label}
                </span>
                {!s.done && <Link to={s.to}>Open &rarr;</Link>}
              </li>
            ))}
          </ul>
        </div>
      )}

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

      {total > 0 && (
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
      )}
    </main>
  )
}
