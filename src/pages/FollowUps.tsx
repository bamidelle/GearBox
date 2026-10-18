import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fetchAll, formatDate, STATUS_LABELS, type OpportunityStatus } from '../lib/types'
import { fill } from '../lib/render'
import '../followups.css'

const AUTO = ['new', 'follow_up_scheduled', 'contacted']
const DAY = 86_400_000

type Opp = {
  id: string
  description: string
  declined_at: string | null
  created_at: string
  status: OpportunityStatus
  sequence_paused: boolean
  customers: {
    name: string
    email: string | null
    consent_status: string
    opted_out_at: string | null
  } | null
}
type Log = {
  id: string
  opportunity_id: string
  status: string
  sent_at: string | null
  created_at: string
  repair_opportunities: { description: string; customers: { name: string } | null } | null
}
type Fail = { id: string; entity_id: string | null; created_at: string; metadata: { step?: number; error?: string } | null }
type Template = { id: string; name: string; subject: string; body: string }
type Tab = 'scheduled' | 'sent' | 'failed' | 'paused' | 'suppressed'

export default function FollowUps() {
  const { shop, session } = useAuth()
  const [opps, setOpps] = useState<Opp[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [fails, setFails] = useState<Fail[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [cadence, setCadence] = useState<number[]>([])
  const [enabled, setEnabled] = useState(false)
  const [hasAddress, setHasAddress] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('scheduled')

  const [templateId, setTemplateId] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!shop) return
    let cancelled = false
    Promise.all([
      supabase
        .from('shop_settings')
        .select('reminders_enabled, default_cadence_days')
        .eq('shop_id', shop.id)
        .maybeSingle(),
      supabase.from('shops').select('postal_address').eq('id', shop.id).maybeSingle(),
      supabase
        .from('message_templates')
        .select('id, name, subject, body')
        .eq('shop_id', shop.id)
        .order('created_at'),
      fetchAll<Opp>((from, to) =>
        supabase
          .from('repair_opportunities')
          .select(
            'id, description, declined_at, created_at, status, sequence_paused, customers(name, email, consent_status, opted_out_at)',
          )
          .eq('shop_id', shop.id)
          .in('status', AUTO)
          .order('created_at')
          .range(from, to),
      ),
      fetchAll<Log>((from, to) =>
        supabase
          .from('message_logs')
          .select('id, opportunity_id, status, sent_at, created_at, repair_opportunities(description, customers(name))')
          .eq('shop_id', shop.id)
          .order('created_at', { ascending: false })
          .range(from, to),
      ),
      supabase
        .from('audit_events')
        .select('id, entity_id, created_at, metadata')
        .eq('shop_id', shop.id)
        .eq('event_type', 'followup_send_failed')
        .order('created_at', { ascending: false })
        .limit(50),
    ])
      .then(([s, sh, t, o, l, f]) => {
        if (cancelled) return
        const settings = s.data as { reminders_enabled: boolean; default_cadence_days: number[] } | null
        setEnabled(Boolean(settings?.reminders_enabled))
        setCadence([...(settings?.default_cadence_days ?? [])].filter((n) => n > 0).sort((a, b) => a - b))
        setHasAddress(Boolean((sh.data as { postal_address: string | null } | null)?.postal_address?.trim()))
        const tpl = (t.data ?? []) as Template[]
        setTemplates(tpl)
        setTemplateId((cur) => cur || tpl[0]?.id || '')
        setOpps(o)
        setLogs(l)
        setFails((f.data ?? []) as Fail[])
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [shop])

  const { scheduled, paused, suppressed } = useMemo(() => {
    const sent = new Map<string, { count: number; last: number }>()
    for (const l of logs) {
      if (l.status !== 'sent') continue
      const cur = sent.get(l.opportunity_id) ?? { count: 0, last: 0 }
      cur.count += 1
      cur.last = Math.max(cur.last, new Date(l.sent_at ?? l.created_at).getTime())
      sent.set(l.opportunity_id, cur)
    }

    const sch: { o: Opp; step: number; dueAt: number; template: string }[] = []
    const pau: Opp[] = []
    const sup: { o: Opp; reason: string }[] = []

    for (const o of opps) {
      const c = o.customers
      if (o.sequence_paused) {
        pau.push(o)
        continue
      }
      if (!c?.email) {
        sup.push({ o, reason: 'No email address' })
        continue
      }
      if (c.consent_status === 'withdrawn' || c.opted_out_at) {
        sup.push({ o, reason: 'Customer opted out' })
        continue
      }
      const st = sent.get(o.id) ?? { count: 0, last: 0 }
      if (st.count >= cadence.length) continue
      const base = new Date(o.declined_at ? `${o.declined_at}T00:00:00Z` : o.created_at).getTime()
      const dueAt =
        st.count === 0
          ? base + cadence[0] * DAY
          : st.last + Math.max(1, cadence[st.count] - cadence[st.count - 1]) * DAY
      sch.push({
        o,
        step: st.count + 1,
        dueAt,
        template: templates[Math.min(st.count, templates.length - 1)]?.name ?? '-',
      })
    }
    sch.sort((a, b) => a.dueAt - b.dueAt)
    return { scheduled: sch, paused: pau, suppressed: sup }
  }, [opps, logs, cadence, templates])

  const sentLogs = logs.filter((l) => l.status === 'sent')
  const oppById = useMemo(() => new Map(opps.map((o) => [o.id, o])), [opps])

  const selected = templates.find((t) => t.id === templateId)
  const vars = {
    customer_name: 'Alex Sample',
    vehicle: '2019 Toyota Camry',
    repair: 'Brake pads replacement',
    shop_name: shop?.name ?? 'Your shop',
    response_link: `${window.location.origin}/r/sample-link`,
  }

  async function sendTest() {
    if (!session || !selected) return
    setTestBusy(true)
    setTestMsg(null)
    try {
      const r = await fetch('/api/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ templateId: selected.id }),
      })
      const body = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) throw new Error(body.error || `Request failed (${r.status})`)
      setTestMsg({ ok: true, text: `Test email sent to ${session.user.email}.` })
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not send test' })
    } finally {
      setTestBusy(false)
    }
  }

  const when = (ms: number) => (ms <= Date.now() ? 'Due now' : formatDate(new Date(ms).toISOString()))

  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: 'scheduled', label: 'Scheduled', n: scheduled.length },
    { id: 'sent', label: 'Sent', n: sentLogs.length },
    { id: 'failed', label: 'Failed', n: fails.length },
    { id: 'paused', label: 'Paused', n: paused.length },
    { id: 'suppressed', label: 'Suppressed', n: suppressed.length },
  ]

  return (
    <main className="card wide">
      <h1>Follow-ups</h1>
      <p className="muted">
        Schedule: {cadence.length ? cadence.map((d) => `day ${d}`).join(', ') : 'not set'}.{' '}
        <Link to="/settings">Change in Settings</Link>
      </p>

      {!enabled && (
        <div className="banner">
          <span>Automatic follow-ups are off, so nothing will be sent until you turn them on.</span>
          <Link to="/settings">Open Settings</Link>
        </div>
      )}
      {enabled && !hasAddress && (
        <div className="banner">
          <span>Add your shop mailing address. Emails are not sent until it is set.</span>
          <Link to="/settings">Open Settings</Link>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading...</p>}

      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'on' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label} ({t.n})
          </button>
        ))}
      </div>

      <div className="scroll">
        {tab === 'scheduled' && (
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Repair</th>
                <th>Step</th>
                <th>Due</th>
                <th>Template</th>
              </tr>
            </thead>
            <tbody>
              {scheduled.map((s) => (
                <tr key={s.o.id}>
                  <td>
                    <Link to={`/opportunities/${s.o.id}`}>{s.o.customers?.name}</Link>
                  </td>
                  <td>{s.o.description}</td>
                  <td>
                    {s.step} of {cadence.length}
                  </td>
                  <td>{when(s.dueAt)}</td>
                  <td>{s.template}</td>
                </tr>
              ))}
              {scheduled.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    Nothing scheduled.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === 'sent' && (
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Repair</th>
                <th>Sent</th>
              </tr>
            </thead>
            <tbody>
              {sentLogs.slice(0, 200).map((l) => (
                <tr key={l.id}>
                  <td>
                    <Link to={`/opportunities/${l.opportunity_id}`}>{l.repair_opportunities?.customers?.name ?? 'Customer'}</Link>
                  </td>
                  <td>{l.repair_opportunities?.description}</td>
                  <td>{new Date(l.sent_at ?? l.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {sentLogs.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No emails sent yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === 'failed' && (
          <table>
            <thead>
              <tr>
                <th>Repair</th>
                <th>When</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {fails.map((f) => {
                const o = f.entity_id ? oppById.get(f.entity_id) : undefined
                return (
                  <tr key={f.id}>
                    <td>{o ? <Link to={`/opportunities/${o.id}`}>{o.description}</Link> : '-'}</td>
                    <td>{new Date(f.created_at).toLocaleString()}</td>
                    <td style={{ whiteSpace: 'normal' }}>{f.metadata?.error ?? 'Unknown error'}</td>
                  </tr>
                )
              })}
              {fails.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No failures. Failed sends are retried automatically.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === 'paused' && (
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Repair</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {paused.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link to={`/opportunities/${o.id}`}>{o.customers?.name}</Link>
                  </td>
                  <td>{o.description}</td>
                  <td>{STATUS_LABELS[o.status]}</td>
                </tr>
              ))}
              {paused.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No paused follow-ups.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === 'suppressed' && (
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Repair</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {suppressed.map((s) => (
                <tr key={s.o.id}>
                  <td>
                    <Link to={`/opportunities/${s.o.id}`}>{s.o.customers?.name}</Link>
                  </td>
                  <td>{s.o.description}</td>
                  <td>{s.reason}</td>
                </tr>
              ))}
              {suppressed.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No suppressed contacts.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>Preview and test send</h2>
        {templates.length === 0 ? (
          <p className="muted">
            No templates yet. <Link to="/settings">Add templates in Settings</Link>.
          </p>
        ) : (
          <>
            <label>
              Template
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <div className="preview" style={{ marginTop: '0.75rem' }}>
                <div className="subj">{fill(selected.subject, vars)}</div>
                {fill(selected.body, vars)}
              </div>
            )}
            <p className="muted">Sample customer details are used in the preview and the test email.</p>
            <button type="button" disabled={testBusy || !selected} onClick={sendTest}>
              {testBusy ? 'Sending...' : `Send test to ${session?.user.email ?? 'me'}`}
            </button>
            {testMsg && <p className={testMsg.ok ? 'notice' : 'error'}>{testMsg.text}</p>}
          </>
        )}
      </div>
    </main>
  )
}
