import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Icon } from '../components/Icons'
import { money } from '../lib/types'
import '../respond.css'

type Info = {
  shopName: string
  customerName: string
  description: string
  vehicle: string
  estimate: number | null
  currency: string
}
type ResponseType = 'approve' | 'appointment' | 'callback' | 'not_now' | 'opt_out'

function Shell({ shopName, children }: { shopName: string; children: React.ReactNode }) {
  return (
    <div className="resp">
      <div className="resp-head">
        <span className="logo-mark">
          <Icon name="settings" size={18} />
        </span>
        {shopName || 'GearBox'}
      </div>
      <div className="resp-body">{children}</div>
    </div>
  )
}

export default function Respond() {
  const { token = '' } = useParams()
  const [info, setInfo] = useState<Info | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'done'>('loading')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneType, setDoneType] = useState<ResponseType | null>(null)

  useEffect(() => {
    fetch(`/api/respond/info?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('invalid')
        setInfo((await r.json()) as Info)
        setState('ready')
      })
      .catch(() => setState('invalid'))
  }, [token])

  async function send(type: ResponseType) {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, type, message }),
      })
      if (!r.ok) throw new Error('failed')
      setDoneType(type)
      setState('done')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') return <p className="center muted">Loading...</p>

  if (state === 'invalid')
    return (
      <Shell shopName="">
        <h1>Link expired</h1>
        <p className="muted">This link is no longer valid. Please contact the shop directly.</p>
      </Shell>
    )

  if (state === 'done')
    return (
      <Shell shopName={info?.shopName ?? ''}>
        <div className="resp-done">
          <Icon name="check" size={28} />
        </div>
        <h1 style={{ textAlign: 'center' }}>Thank you</h1>
        <p style={{ textAlign: 'center' }}>
          {doneType === 'opt_out'
            ? 'You will not receive further emails about this repair.'
            : doneType === 'not_now'
              ? `Thanks for letting ${info?.shopName} know.`
              : `${info?.shopName} has your request and will confirm the final scope and price with you.`}
        </p>
      </Shell>
    )

  return (
    <Shell shopName={info?.shopName ?? ''}>
      <h1>Your Repair Estimate</h1>
      <p className="muted">
        Hi {info?.customerName}, {info?.shopName} recommended the following repair work that you previously
        declined. Please review it and let us know how you&rsquo;d like to proceed.
      </p>

      <div className="resp-card">
        {info?.vehicle && <strong>{info.vehicle}</strong>}
        <div className="small" style={{ marginTop: info?.vehicle ? '0.6rem' : 0 }}>
          Recommended repair
        </div>
        <div>{info?.description}</div>
        {info?.estimate != null && <div className="resp-amount">{money(info.estimate, info.currency)}</div>}
        <div className="small" style={{ marginTop: '0.5rem' }}>
          This is the shop&rsquo;s earlier estimate. The final scope and price will be confirmed by the shop
          before any work is done.
        </div>
      </div>

      <form onSubmit={(e) => e.preventDefault()} style={{ margin: 0 }}>
        <label>
          Message for the shop (optional)
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="stack">
          <button type="button" disabled={busy} onClick={() => send('approve')}>
            I&rsquo;d like to go ahead
          </button>
          <button type="button" className="btn-outline" disabled={busy} onClick={() => send('callback')}>
            Request Callback
          </button>
          <button type="button" className="btn-outline" disabled={busy} onClick={() => send('appointment')}>
            Request Appointment
          </button>
        </div>
      </form>

      <p className="resp-foot">
        No account required. This link expires in 60 days.
        <br />
        <button type="button" className="link" disabled={busy} onClick={() => send('not_now')}>
          Not right now
        </button>
        {' \u00b7 '}
        <button type="button" className="link" disabled={busy} onClick={() => send('opt_out')}>
          Stop emailing me
        </button>
      </p>
    </Shell>
  )
}
