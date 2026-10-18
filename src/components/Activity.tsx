import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Event = { id: string; at: string; text: string; detail?: string }

const RESPONSE_LABELS: Record<string, string> = {
  approve: 'Customer approved the repair',
  appointment: 'Customer asked to schedule the repair',
  callback: 'Customer asked for a call back',
  interested: 'Customer said they are interested',
  not_now: 'Customer said not right now',
  opt_out: 'Customer opted out of follow-ups',
}

const LOG_LABELS: Record<string, string> = {
  sent: 'Follow-up email sent',
  scheduled: 'Follow-up email queued',
  failed: 'Follow-up email failed',
  suppressed: 'Follow-up email suppressed',
  skipped: 'Follow-up email skipped',
}

export default function Activity() {
  const { id } = useParams()
  const { shop } = useAuth()
  const [events, setEvents] = useState<Event[] | null>(null)

  useEffect(() => {
    if (!shop || !id) return
    let cancelled = false
    Promise.all([
      supabase
        .from('message_logs')
        .select('id, status, sent_at, created_at')
        .eq('shop_id', shop.id)
        .eq('opportunity_id', id),
      supabase
        .from('customer_responses')
        .select('id, response_type, message, created_at')
        .eq('shop_id', shop.id)
        .eq('opportunity_id', id),
    ]).then(([logs, responses]) => {
      if (cancelled) return
      const list: Event[] = []
      for (const l of (logs.data ?? []) as { id: string; status: string; sent_at: string | null; created_at: string }[]) {
        list.push({ id: `l${l.id}`, at: l.sent_at ?? l.created_at, text: LOG_LABELS[l.status] ?? l.status })
      }
      for (const r of (responses.data ?? []) as { id: string; response_type: string; message: string | null; created_at: string }[]) {
        list.push({
          id: `r${r.id}`,
          at: r.created_at,
          text: RESPONSE_LABELS[r.response_type] ?? r.response_type,
          detail: r.message ?? undefined,
        })
      }
      list.sort((a, b) => b.at.localeCompare(a.at))
      setEvents(list)
    })
    return () => {
      cancelled = true
    }
  }, [shop, id])

  if (!events || events.length === 0) return null

  return (
    <main className="card wide" style={{ marginTop: 0 }}>
      <h2>Customer contact</h2>
      <ul className="timeline">
        {events.map((e) => (
          <li key={e.id}>
            <div className="when">{new Date(e.at).toLocaleString()}</div>
            {e.text}
            {e.detail && <div className="muted">&ldquo;{e.detail}&rdquo;</div>}
          </li>
        ))}
      </ul>
    </main>
  )
}
