import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

type Info = { shopName: string; customerName: string; description: string; vehicle: string }
type ResponseType = 'appointment' | 'callback' | 'interested' | 'not_now' | 'opt_out'

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
      <main className="card">
        <h1>Link expired</h1>
        <p className="muted">This link is no longer valid. Please contact the shop directly.</p>
      </main>
    )

  if (state === 'done')
    return (
      <main className="card">
        <h1>Thank you</h1>
        <p>
          {doneType === 'opt_out'
            ? 'You will not receive further emails about this repair.'
            : `${info?.shopName} has your reply and will be in touch.`}
        </p>
      </main>
    )

  return (
    <main className="card">
      <h1>{info?.shopName}</h1>
      <p>
        Hi {info?.customerName}, you chose to wait on this repair{info?.vehicle ? ` for your ${info.vehicle}` : ''}:
      </p>
      <p>
        <strong>{info?.description}</strong>
      </p>

      <form onSubmit={(e) => e.preventDefault()}>
        <label>
          Message for the shop (optional)
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="button" disabled={busy} onClick={() => send('appointment')}>
          I would like to schedule this
        </button>
        <button type="button" disabled={busy} onClick={() => send('callback')}>
          Please call me
        </button>
        <button type="button" disabled={busy} onClick={() => send('not_now')}>
          Not right now
        </button>
      </form>

      <p className="muted">
        <button type="button" className="link" disabled={busy} onClick={() => send('opt_out')}>
          Stop emailing me about this
        </button>
      </p>
    </main>
  )
}
