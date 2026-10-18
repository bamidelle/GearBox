import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { StackedBars } from '../components/BarChart'
import { Icon, type IconName } from '../components/Icons'
import { downloadCsv } from '../lib/csv'
import { STATUS_LABELS, fetchAll, money, type OpportunityStatus } from '../lib/types'
import '../reports.css'

type Opp = {
  id: string
  description: string
  status: OpportunityStatus
  estimate_amount: number | null
  approved_amount: number | null
  paid_amount: number | null
  paid_at: string | null
  completed_at: string | null
  declined_at: string | null
  created_at: string
  currency: string
  sequence_paused: boolean
  customers: { name: string; email: string | null; consent_status: string; opted_out_at: string | null } | null
  vehicles: { year: number | null; make: string | null; model: string | null } | null
}
type Log = { opportunity_id: string; status: string; sent_at: string | null; created_at: string }
type Resp = { response_type: string; created_at: string }
type Hist = { opportunity_id: string; to_status: OpportunityStatus }

const DAY = 86_400_000
const AUTO = ['new', 'follow_up_scheduled', 'contacted']
const CLOSED: OpportunityStatus[] = ['paid', 'declined_again', 'opted_out', 'closed']
const OUTCOMES: { label: string; color: string; statuses: OpportunityStatus[] }[] = [
  { label: 'Approved or done', color: '#16a34a', statuses: ['approved', 'work_completed', 'paid'] },
  { label: 'In progress', color: '#f59e0b', statuses: ['follow_up_scheduled', 'contacted', 'customer_interested', 'appointment_requested'] },
  { label: 'No response yet', color: '#9ca3af', statuses: ['new'] },
  { label: 'Declined / closed', color: '#dc2626', statuses: ['declined_again', 'opted_out', 'closed'] },
]
const FUNNEL: { label: string; reached: OpportunityStatus[] | null }[] = [
  { label: 'Declined jobs', reached: null },
  { label: 'Contacted', reached: ['contacted', 'customer_interested', 'appointment_requested', 'approved', 'work_completed', 'paid'] },
  { label: 'Customer engaged', reached: ['customer_interested', 'appointment_requested', 'approved', 'work_completed', 'paid'] },
  { label: 'Approved', reached: ['approved', 'work_completed', 'paid'] },
  { label: 'Completed', reached: ['work_completed', 'paid'] },
  { label: 'Paid', reached: ['paid'] },
]

const dateOf = (o: Opp) => o.declined_at ?? o.created_at.slice(0, 10)
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function Kpi({ icon, label, value, hint }: { icon: IconName; label: string; value: string; hint?: string }) {
  return (
    <div className="kpi">
      <span className="ico">
        <Icon name={icon} />
      </span>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {hint && <span className="label">{hint}</span>}
    </div>
  )
}

export default function Reports() {
  const { shop } = useAuth()
  const [opps, setOpps] = useState<Opp[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [resps, setResps] = useState<Resp[]>([])
  const [hist, setHist] = useState<Hist[]>([])
  const [cadence, setCadence] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [preset, setPreset] = useState<'30' | '90' | '365' | 'all' | 'custom'>('90')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [currency, setCurrency] = useState(shop?.currency ?? 'USD')

  useEffect(() => {
    if (!shop) return
    let cancelled = false
    Promise.all([
      fetchAll<Opp>((a, b) =>
        supabase
          .from('repair_opportunities')
          .select(
            'id, description, status, estimate_amount, approved_amount, paid_amount, paid_at, completed_at, declined_at, created_at, currency, sequence_paused, customers(name, email, consent_status, opted_out_at), vehicles(year, make, model)',
          )
          .eq('shop_id', shop.id)
          .order('created_at')
          .range(a, b),
      ),
      fetchAll<Log>((a, b) =>
        supabase
          .from('message_logs')
          .select('opportunity_id, status, sent_at, created_at')
          .eq('shop_id', shop.id)
          .eq('status', 'sent')
          .order('created_at')
          .range(a, b),
      ),
      fetchAll<Resp>((a, b) =>
        supabase
          .from('customer_responses')
          .select('response_type, created_at')
          .eq('shop_id', shop.id)
          .order('created_at')
          .range(a, b),
      ),
      fetchAll<Hist>((a, b) =>
        supabase
          .from('opportunity_status_history')
          .select('opportunity_id, to_status')
          .eq('shop_id', shop.id)
          .order('created_at')
          .range(a, b),
      ),
      supabase.from('shop_settings').select('default_cadence_days').eq('shop_id', shop.id).maybeSingle(),
    ])
      .then(([o, l, r, h, s]) => {
        if (cancelled) return
        setOpps(o)
        setLogs(l)
        setResps(r)
        setHist(h)
        const days = (s.data as { default_cadence_days: number[] } | null)?.default_cadence_days ?? []
        setCadence([...days].filter((n) => n > 0).sort((x, y) => x - y))
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [shop])

  const currencies = useMemo(() => {
    const set = new Set(opps.map((o) => o.currency))
    if (shop) set.add(shop.currency)
    return [...set].sort()
  }, [opps, shop])

  const [rangeFrom, rangeTo] = useMemo(() => {
    if (preset === 'all') return ['0000-01-01', '9999-12-31']
    if (preset === 'custom') return [from || '0000-01-01', to || '9999-12-31']
    const days = Number(preset)
    return [isoDay(Date.now() - days * DAY), isoDay(Date.now())]
  }, [preset, from, to])

  const inRange = (day: string) => day >= rangeFrom && day <= rangeTo

  const cohort = useMemo(
    () => opps.filter((o) => o.currency === currency && inRange(dateOf(o))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opps, currency, rangeFrom, rangeTo],
  )
  const cohortIds = useMemo(() => new Set(cohort.map((o) => o.id)), [cohort])

  const sum = (list: Opp[], pick: (o: Opp) => number | null) => list.reduce((a, o) => a + (pick(o) ?? 0), 0)

  const kpi = useMemo(() => {
    const open = cohort.filter((o) => !CLOSED.includes(o.status))
    const approved = cohort.filter((o) => ['approved', 'work_completed', 'paid'].includes(o.status))
    const completed = cohort.filter((o) => ['work_completed', 'paid'].includes(o.status))
    const paid = cohort.filter((o) => o.status === 'paid')
    const val = (o: Opp) => o.approved_amount ?? o.estimate_amount

    const sentByOpp = new Map<string, { count: number; last: number }>()
    for (const l of logs) {
      const cur = sentByOpp.get(l.opportunity_id) ?? { count: 0, last: 0 }
      cur.count += 1
      cur.last = Math.max(cur.last, new Date(l.sent_at ?? l.created_at).getTime())
      sentByOpp.set(l.opportunity_id, cur)
    }
    let dueNow = 0
    for (const o of opps) {
      if (!AUTO.includes(o.status) || o.sequence_paused || o.currency !== currency) continue
      const c = o.customers
      if (!c?.email || c.consent_status === 'withdrawn' || c.opted_out_at) continue
      const st = sentByOpp.get(o.id) ?? { count: 0, last: 0 }
      if (st.count >= cadence.length) continue
      const base = new Date(o.declined_at ? `${o.declined_at}T00:00:00Z` : o.created_at).getTime()
      const dueAt =
        st.count === 0 ? base + cadence[0] * DAY : st.last + Math.max(1, cadence[st.count] - cadence[st.count - 1]) * DAY
      if (dueAt <= Date.now()) dueNow += 1
    }

    const msgs = logs.filter((l) => inRange((l.sent_at ?? l.created_at).slice(0, 10)) && cohortIdsOrAll(l.opportunity_id))
    const rs = resps.filter((r) => inRange(r.created_at.slice(0, 10)))
    return {
      openValue: sum(open, (o) => o.estimate_amount),
      dueNow,
      messages: msgs.length,
      responses: rs.length,
      appointments: rs.filter((r) => r.response_type === 'appointment').length,
      approvedValue: sum(approved, val),
      completedValue: sum(completed, val),
      recovered: sum(paid, (o) => o.paid_amount),
      paidCount: paid.length,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohort, logs, resps, opps, cadence, currency, rangeFrom, rangeTo])

  // Messages are limited to the chosen currency's repairs so totals respect the filter.
  function cohortIdsOrAll(oppId: string) {
    const o = opps.find((x) => x.id === oppId)
    return o ? o.currency === currency : false
  }

  const funnel = useMemo(() => {
    const reached = new Map<string, Set<OpportunityStatus>>()
    for (const h of hist) {
      if (!cohortIds.has(h.opportunity_id)) continue
      const s = reached.get(h.opportunity_id) ?? new Set<OpportunityStatus>()
      s.add(h.to_status)
      reached.set(h.opportunity_id, s)
    }
    return FUNNEL.map((f) => ({
      label: f.label,
      count: f.reached === null ? cohort.length : [...reached.values()].filter((s) => f.reached!.some((st) => s.has(st))).length,
    }))
  }, [hist, cohort, cohortIds])

  const months = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const o of cohort) {
      const key = dateOf(o).slice(0, 7)
      const arr = map.get(key) ?? OUTCOMES.map(() => 0)
      const idx = OUTCOMES.findIndex((g) => g.statuses.includes(o.status))
      if (idx >= 0) arr[idx] += 1
      map.set(key, arr)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([key, values]) => ({
        label: new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
        values,
      }))
  }, [cohort])

  function exportCsv() {
    const rows: unknown[][] = [
      ['Customer', 'Vehicle', 'Repair', 'Estimate', 'Currency', 'Declined date', 'Status', 'Approved amount', 'Paid amount', 'Paid date'],
      ...cohort.map((o) => [
        o.customers?.name ?? '',
        [o.vehicles?.year, o.vehicles?.make, o.vehicles?.model].filter(Boolean).join(' '),
        o.description,
        o.estimate_amount ?? '',
        o.currency,
        o.declined_at ?? '',
        STATUS_LABELS[o.status],
        o.approved_amount ?? '',
        o.paid_amount ?? '',
        o.paid_at ? o.paid_at.slice(0, 10) : '',
      ]),
    ]
    downloadCsv(`gearbox-report-${isoDay(Date.now())}.csv`, rows)
  }

  if (!shop) return null
  const m = (v: number) => money(v, currency)
  const top = funnel[0]?.count || 0

  return (
    <main className="card wide">
      <h1>Reports</h1>
      <p className="muted">Staff-recorded outcomes for repairs declined in the selected dates.</p>

      <div className="filters">
        <label>
          Period
          <select value={preset} onChange={(e) => setPreset(e.target.value as typeof preset)}>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
            <option value="all">All time</option>
            <option value="custom">Custom dates</option>
          </select>
        </label>
        {preset === 'custom' && (
          <>
            <label>
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </>
        )}
        <label>
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-outline" onClick={exportCsv} disabled={cohort.length === 0}>
          Export CSV
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading...</p>}

      {!loading && (
        <>
          <div className="kpis">
            <Kpi icon="jobs" label="Open declined-work value" value={m(kpi.openValue)} hint="Estimates not yet closed" />
            <Kpi icon="mail" label="Follow-ups due now" value={String(kpi.dueNow)} hint="Across all open repairs" />
            <Kpi icon="mail" label="Messages sent" value={String(kpi.messages)} />
            <Kpi icon="users" label="Customer responses" value={String(kpi.responses)} />
            <Kpi icon="check" label="Appointments requested" value={String(kpi.appointments)} />
            <Kpi icon="percent" label="Approved estimate value" value={m(kpi.approvedValue)} hint="Staff-marked Approved or later" />
            <Kpi icon="check" label="Completed work value" value={m(kpi.completedValue)} hint="Staff-marked Completed or Paid" />
            <Kpi icon="dollar" label="Recovered revenue" value={m(kpi.recovered)} hint={`${kpi.paidCount} marked Paid`} />
          </div>

          <div className="dash-grid">
            <div className="panel">
              <h2>Outcomes over time</h2>
              {months.length === 0 ? (
                <p className="muted">No repairs in this period.</p>
              ) : (
                <>
                  <StackedBars groups={months} colors={OUTCOMES.map((o) => o.color)} labels={OUTCOMES.map((o) => o.label)} />
                  <details className="alt">
                    <summary>View chart data as a table</summary>
                    <div className="scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Month</th>
                            {OUTCOMES.map((o) => (
                              <th key={o.label}>{o.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {months.map((g) => (
                            <tr key={g.label}>
                              <td>{g.label}</td>
                              {g.values.map((v, i) => (
                                <td key={i}>{v}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              )}
            </div>

            <div className="panel">
              <h2>Recovery funnel</h2>
              <div className="funnel">
                {funnel.map((f) => (
                  <div key={f.label} className="bar-row">
                    <span>{f.label}</span>
                    <div className="bar-track" aria-hidden="true">
                      <div className="bar-fill" style={{ width: `${top ? (f.count / top) * 100 : 0}%` }} />
                    </div>
                    <span>
                      <strong>{f.count}</strong>
                      {top > 0 && <span className="muted"> ({Math.round((f.count / top) * 100)}%)</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel">
            <h2>How these numbers are defined</h2>
            <ul>
              <li>Repair-value figures cover repairs declined in the selected period, in the selected currency.</li>
              <li>Messages sent and customer responses are counted by the date they happened.</li>
              <li>Recovered revenue is the amount on repairs staff have marked Paid, with a payment date. Approved and completed values are shown separately.</li>
              <li>The funnel counts repairs that ever reached each stage, based on recorded status changes.</li>
              <li>
                These are staff-reported outcomes. GearBox does not claim that every approved or paid repair was
                caused by a follow-up.
              </li>
            </ul>
          </div>
        </>
      )}
    </main>
  )
}
