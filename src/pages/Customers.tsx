import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fetchAll, isOpen, money, type OpportunityStatus } from '../lib/types'
import '../customers.css'

type Customer = {
  id: string
  name: string
  email: string | null
  phone: string | null
  consent_status: 'unknown' | 'granted' | 'withdrawn'
}
type Opp = { customer_id: string; status: OpportunityStatus; estimate_amount: number | null }

export const CONSENT_LABELS: Record<string, string> = {
  granted: 'Consented',
  unknown: 'Not recorded',
  withdrawn: 'Opted out',
}

export default function Customers() {
  const { shop } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [opps, setOpps] = useState<Opp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!shop) return
    let cancelled = false
    Promise.all([
      fetchAll<Customer>((from, to) =>
        supabase
          .from('customers')
          .select('id, name, email, phone, consent_status')
          .eq('shop_id', shop.id)
          .order('name')
          .range(from, to),
      ),
      fetchAll<Opp>((from, to) =>
        supabase
          .from('repair_opportunities')
          .select('customer_id, status, estimate_amount')
          .eq('shop_id', shop.id)
          .order('created_at')
          .range(from, to),
      ),
    ])
      .then(([c, o]) => {
        if (cancelled) return
        setCustomers(c)
        setOpps(o)
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [shop])

  const openByCustomer = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>()
    for (const o of opps) {
      if (!isOpen(o.status)) continue
      const cur = map.get(o.customer_id) ?? { count: 0, value: 0 }
      cur.count += 1
      cur.value += o.estimate_amount ?? 0
      map.set(o.customer_id, cur)
    }
    return map
  }, [opps])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q),
    )
  }, [customers, query])

  return (
    <main className="card wide">
      <h1>Customers</h1>
      <div className="toolbar">
        <input placeholder="Search name, email, or phone" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading...</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="muted">{customers.length === 0 ? 'No customers yet. Import a CSV to add some.' : 'Nothing matches.'}</p>
      )}

      {filtered.length > 0 && (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Open jobs</th>
                <th>Open value</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const o = openByCustomer.get(c.id)
                return (
                  <tr key={c.id} className="clickable">
                    <td>
                      <Link to={`/customers/${c.id}`}>{c.name}</Link>
                    </td>
                    <td>{c.email ?? '-'}</td>
                    <td>{c.phone ?? '-'}</td>
                    <td>{o?.count ?? 0}</td>
                    <td>{money(o?.value ?? 0, shop?.currency ?? 'USD')}</td>
                    <td>
                      <span className={`badge ${c.consent_status}`}>{CONSENT_LABELS[c.consent_status]}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">{filtered.length} shown</p>
    </main>
  )
}
