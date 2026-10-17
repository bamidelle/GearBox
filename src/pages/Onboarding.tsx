import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const CURRENCIES = ['USD', 'CAD', 'GBP', 'EUR', 'AUD', 'NZD', 'NGN']

function getTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  const zones = intl.supportedValuesOf?.('timeZone') ?? []
  return zones.length ? zones : ['UTC']
}

export default function Onboarding() {
  const navigate = useNavigate()
  const { session, refreshShop, signOut } = useAuth()
  const timezones = getTimezones()
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState(
    timezones.includes(browserZone) ? browserZone : timezones[0],
  )
  const [currency, setCurrency] = useState('USD')
  const [contactEmail, setContactEmail] = useState(session?.user.email ?? '')
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const { error } = await supabase.rpc('create_shop', {
      p_name: name.trim(),
      p_timezone: timezone,
      p_currency: currency,
      p_locale: navigator.language || 'en-US',
      p_contact_email: contactEmail.trim() || null,
      p_policy_ack: ack,
    })

    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    await refreshShop()
    navigate('/', { replace: true })
  }

  return (
    <main className="card">
      <h1>Set up your shop</h1>
      <p className="muted">This takes under a minute.</p>

      <form onSubmit={onSubmit}>
        <label>
          Shop name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
          />
        </label>
        <label>
          Contact email
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </label>
        <label>
          Time zone
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {timezones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <label>
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
          />
          <span>
            I confirm I have permission to contact my customers about their
            declined repairs.
          </span>
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={busy || !ack || !name.trim()}>
          {busy ? 'Creating...' : 'Create shop'}
        </button>
      </form>

      <p className="muted">
        <button type="button" className="link" onClick={signOut}>
          Log out
        </button>
      </p>
    </main>
  )
}
