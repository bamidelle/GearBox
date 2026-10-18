import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Reply = {
  id: string
  response_type: string
  message: string | null
  created_at: string
  repair_opportunities: { id: string; description: string; customers: { name: string } | null } | null
}

const LABELS: Record<string, string> = {
  appointment: 'Wants to schedule',
  callback: 'Wants a call back',
  interested: 'Interested',
  not_now: 'Not now',
  opt_out: 'Opted out',
}

export default function Replies() {
  const { shop } = useAuth()
  const [replies, setReplies] = useState<Reply[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!shop) return
    const { data, error } = await supabase
      .from('customer_responses')
      .select('id, response_type, message, created_at, repair_opportunities(id, description, customers(name))')
      .eq('shop_id', shop.id)
      .is('handled_at', null)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) setError(error.message)
    else setReplies((data ?? []) as unknown as Reply[])
  }, [shop])

  useEffect(() => {
    load()
  }, [load])

  async function markHandled(id: string) {
    if (!shop) return
    const { error } = await supabase
      .from('customer_responses')
      .update({ handled_at: new Date().toISOString() })
      .eq('id', id)
      .eq('shop_id', shop.id)
    if (error) setError(error.message)
    else setReplies((r) => r.filter((x) => x.id !== id))
  }

  if (replies.length === 0 && !error) return null

  return (
    <div className="panel">
      <h2>Customer replies ({replies.length})</h2>
      {error && <p className="error">{error}</p>}
      <ul className="timeline">
        {replies.map((r) => (
          <li key={r.id}>
            <div className="when">{new Date(r.created_at).toLocaleString()}</div>
            <strong>{r.repair_opportunities?.customers?.name ?? 'Customer'}</strong>: {LABELS[r.response_type] ?? r.response_type}
            {r.repair_opportunities && (
              <>
                {' '}
                &middot; <Link to={`/opportunities/${r.repair_opportunities.id}`}>{r.repair_opportunities.description}</Link>
              </>
            )}
            {r.message && <div className="muted">&ldquo;{r.message}&rdquo;</div>}
            <button type="button" className="link" onClick={() => markHandled(r.id)}>
              Mark handled
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
