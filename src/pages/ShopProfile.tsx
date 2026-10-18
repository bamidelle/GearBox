import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function ShopProfile() {
  const { shop } = useAuth()
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    if (!shop) return
    const { data, error } = await supabase
      .from('shops')
      .select('postal_address, contact_phone')
      .eq('id', shop.id)
      .maybeSingle()
    if (error) setError(error.message)
    setAddress(data?.postal_address ?? '')
    setPhone(data?.contact_phone ?? '')
    setLoaded(true)
  }, [shop])

  useEffect(() => {
    load()
  }, [load])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!shop) return
    setBusy(true)
    setError(null)
    setSaved(false)
    const { error } = await supabase
      .from('shops')
      .update({ postal_address: address.trim() || null, contact_phone: phone.trim() || null })
      .eq('id', shop.id)
    if (error) setError(error.message)
    else setSaved(true)
    setBusy(false)
  }

  if (!loaded) return null

  return (
    <main className="card wide">
      <h1>Shop profile</h1>
      {!address.trim() && (
        <p className="error">
          Add your mailing address. Follow-up emails will not be sent until it is set.
        </p>
      )}
      <form onSubmit={onSave}>
        <label>
          Mailing address (shown in email footers)
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            minLength={5}
            maxLength={300}
          />
        </label>
        <label>
          Phone
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        {saved && <p className="notice">Saved.</p>}
        <button type="submit" disabled={busy}>
          Save profile
        </button>
      </form>
    </main>
  )
}
