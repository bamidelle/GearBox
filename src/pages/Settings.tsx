import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

type Settings = {
  sender_name: string | null
  reply_to_email: string | null
  quiet_hours_start: string
  quiet_hours_end: string
  default_cadence_days: number[]
  reminders_enabled: boolean
}

type Template = { id: string; name: string; subject: string; body: string }

const DEFAULT_TEMPLATES: Omit<Template, 'id'>[] = [
  {
    name: 'First follow-up',
    subject: 'Following up on your {{vehicle}}',
    body:
      'Hi {{customer_name}},\n\nWhen you visited {{shop_name}}, we recommended: {{repair}}. ' +
      'You chose to wait, and we wanted to check in. If you would like to go ahead or have questions, ' +
      'let us know here: {{response_link}}\n\nThanks,\n{{shop_name}}',
  },
  {
    name: 'Second reminder',
    subject: 'Quick reminder about your {{vehicle}}',
    body:
      'Hi {{customer_name}},\n\nJust a reminder about the recommended repair on your {{vehicle}}: {{repair}}. ' +
      'Tell us what works for you: {{response_link}}\n\n{{shop_name}}',
  },
  {
    name: 'Final check-in',
    subject: 'Last check-in from {{shop_name}}',
    body:
      'Hi {{customer_name}},\n\nThis is our last note about {{repair}} on your {{vehicle}}. ' +
      'If you would like to schedule it or stop hearing from us, use this link: {{response_link}}\n\n{{shop_name}}',
  },
]

const hhmm = (t: string) => t.slice(0, 5)

export default function SettingsPage() {
  const { shop, session } = useAuth()
  const [isOwner, setIsOwner] = useState(false)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [cadence, setCadence] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [editing, setEditing] = useState<Template | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    if (!shop || !session) return
    const [s, t, m] = await Promise.all([
      supabase
        .from('shop_settings')
        .select('sender_name, reply_to_email, quiet_hours_start, quiet_hours_end, default_cadence_days, reminders_enabled')
        .eq('shop_id', shop.id)
        .maybeSingle(),
      supabase
        .from('message_templates')
        .select('id, name, subject, body')
        .eq('shop_id', shop.id)
        .order('created_at'),
      supabase
        .from('shop_memberships')
        .select('role')
        .eq('shop_id', shop.id)
        .eq('user_id', session.user.id)
        .maybeSingle(),
    ])
    if (s.error) throw new Error(s.error.message)
    if (t.error) throw new Error(t.error.message)
    if (m.error) throw new Error(m.error.message)
    const row = s.data as Settings | null
    setSettings(row)
    setCadence((row?.default_cadence_days ?? []).join(', '))
    setTemplates((t.data ?? []) as Template[])
    setIsOwner(m.data?.role === 'owner')
  }, [shop, session])

  useEffect(() => {
    load().catch((e: Error) => setError(e.message))
  }, [load])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await action()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  function onSaveSettings(e: FormEvent) {
    e.preventDefault()
    if (!shop || !settings) return
    run(async () => {
      const days = cadence
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .map(Number)
      if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 365))
        throw new Error('Follow-up days must be whole numbers like 2, 7, 14.')
      const { error } = await supabase
        .from('shop_settings')
        .update({
          sender_name: settings.sender_name?.trim() || null,
          reply_to_email: settings.reply_to_email?.trim() || null,
          quiet_hours_start: settings.quiet_hours_start,
          quiet_hours_end: settings.quiet_hours_end,
          default_cadence_days: days,
          reminders_enabled: settings.reminders_enabled,
        })
        .eq('shop_id', shop.id)
      if (error) throw new Error(error.message)
      setSaved(true)
    })
  }

  function onSaveTemplate(e: FormEvent) {
    e.preventDefault()
    if (!shop || !editing) return
    run(async () => {
      const values = {
        name: editing.name.trim(),
        subject: editing.subject.trim(),
        body: editing.body.trim(),
      }
      if (!values.name || !values.subject || !values.body) throw new Error('Fill in name, subject, and body.')
      const res = editing.id
        ? await supabase.from('message_templates').update(values).eq('id', editing.id).eq('shop_id', shop.id)
        : await supabase.from('message_templates').insert({ ...values, shop_id: shop.id })
      if (res.error) throw new Error(res.error.message)
      setEditing(null)
    })
  }

  function onDeleteTemplate(t: Template) {
    if (!shop || !window.confirm(`Delete template "${t.name}"?`)) return
    run(async () => {
      const { error } = await supabase.from('message_templates').delete().eq('id', t.id).eq('shop_id', shop.id)
      if (error) throw new Error(error.message)
    })
  }

  function onAddDefaults() {
    if (!shop) return
    run(async () => {
      const { error } = await supabase
        .from('message_templates')
        .insert(DEFAULT_TEMPLATES.map((t) => ({ ...t, shop_id: shop.id })))
      if (error) throw new Error(error.message)
    })
  }

  if (!settings) {
    return (
      <main className="card wide">
        <h1>Settings</h1>
        {error ? <p className="error">{error}</p> : <p className="muted">Loading...</p>}
      </main>
    )
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings({ ...settings, [key]: value })

  return (
    <main className="card wide">
      <h1>Settings</h1>
      {!isOwner && <p className="muted">Only the shop owner can change settings.</p>}
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <h2>Follow-up emails</h2>
        <form onSubmit={onSaveSettings}>
          <fieldset disabled={!isOwner || busy} className="plain">
            <div className="grid">
              <label>
                Sender name
                <input value={settings.sender_name ?? ''} onChange={(e) => set('sender_name', e.target.value)} />
              </label>
              <label>
                Reply-to email
                <input
                  type="email"
                  value={settings.reply_to_email ?? ''}
                  onChange={(e) => set('reply_to_email', e.target.value)}
                />
              </label>
              <label>
                Quiet hours start
                <input
                  type="time"
                  value={hhmm(settings.quiet_hours_start)}
                  onChange={(e) => set('quiet_hours_start', e.target.value)}
                />
              </label>
              <label>
                Quiet hours end
                <input
                  type="time"
                  value={hhmm(settings.quiet_hours_end)}
                  onChange={(e) => set('quiet_hours_end', e.target.value)}
                />
              </label>
              <label>
                Follow-up days after decline
                <input value={cadence} onChange={(e) => setCadence(e.target.value)} placeholder="2, 7, 14" />
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.reminders_enabled}
                onChange={(e) => set('reminders_enabled', e.target.checked)}
              />
              <span>Enable automatic follow-up emails (requires email sending to be set up)</span>
            </label>
          </fieldset>
          {isOwner && (
            <button type="submit" disabled={busy}>
              Save settings
            </button>
          )}
          {saved && <p className="notice">Saved.</p>}
        </form>
      </div>

      <div className="panel">
        <h2>Email templates</h2>
        <p className="muted">
          Placeholders: {'{{customer_name}} {{vehicle}} {{repair}} {{shop_name}} {{response_link}}'}
        </p>

        {templates.length === 0 && isOwner && (
          <button type="button" onClick={onAddDefaults} disabled={busy}>
            Add 3 starter templates
          </button>
        )}

        <ul className="timeline">
          {templates.map((t) => (
            <li key={t.id}>
              <strong>{t.name}</strong>
              <div className="muted">{t.subject}</div>
              {isOwner && (
                <div className="row">
                  <button type="button" className="link" onClick={() => setEditing(t)}>
                    Edit
                  </button>
                  <button type="button" className="link" onClick={() => onDeleteTemplate(t)}>
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {isOwner && !editing && templates.length > 0 && (
          <button type="button" onClick={() => setEditing({ id: '', name: '', subject: '', body: '' })}>
            New template
          </button>
        )}

        {editing && (
          <form onSubmit={onSaveTemplate}>
            <label>
              Name
              <input
                value={editing.name}
                maxLength={120}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </label>
            <label>
              Subject
              <input
                value={editing.subject}
                maxLength={200}
                onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
              />
            </label>
            <label>
              Body
              <textarea
                rows={8}
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              />
            </label>
            <div className="row">
              <button type="submit" disabled={busy}>
                Save template
              </button>
              <button type="button" className="link" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
