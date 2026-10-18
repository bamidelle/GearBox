import { admin, appBase, type Db, type Env } from './env'
import { sendEmail } from './email'
import { fill, inQuietHours, pageAll, randomToken, sha256Hex } from './util'

const AUTO_STATUSES = ['new', 'follow_up_scheduled', 'contacted']
const MAX_PER_SHOP_PER_RUN = 50
const DAY = 86_400_000
const TOKEN_TTL_DAYS = 60

type ShopSettings = {
  shop_id: string
  sender_name: string | null
  reply_to_email: string | null
  quiet_hours_start: string
  quiet_hours_end: string
  default_cadence_days: number[] | null
  shops: { name: string; timezone: string } | null
}

type Template = { id: string; subject: string; body: string }

type Opp = {
  id: string
  description: string
  declined_at: string | null
  created_at: string
  customer_id: string
  status?: string
  customers: {
    id: string
    name: string
    email: string | null
    consent_status: string
    opted_out_at: string | null
  } | null
  vehicles: { year: number | null; make: string | null; model: string | null } | null
}

export async function runFollowUps(env: Env, now = new Date()): Promise<void> {
  const db = admin(env)
  const { data, error } = await db
    .from('shop_settings')
    .select(
      'shop_id, sender_name, reply_to_email, quiet_hours_start, quiet_hours_end, default_cadence_days, shops(name, timezone)',
    )
    .eq('reminders_enabled', true)
  if (error) {
    console.error('shop_settings query failed', error.message)
    return
  }
  for (const s of (data ?? []) as unknown as ShopSettings[]) {
    try {
      await processShop(env, db, s, now)
    } catch (e) {
      console.error(`follow-ups failed for shop ${s.shop_id}`, e)
    }
  }
}

async function processShop(env: Env, db: Db, s: ShopSettings, now: Date): Promise<void> {
  const shop = s.shops
  if (!shop) return

  const cadence = (s.default_cadence_days ?? []).filter((n) => n > 0).sort((a, b) => a - b)
  if (cadence.length === 0) return
  if (inQuietHours(now, shop.timezone, s.quiet_hours_start, s.quiet_hours_end)) return

  const { data: tpl, error: tErr } = await db
    .from('message_templates')
    .select('id, subject, body')
    .eq('shop_id', s.shop_id)
    .order('created_at', { ascending: true })
  if (tErr) throw new Error(tErr.message)
  const templates = (tpl ?? []) as Template[]
  if (templates.length === 0) return

  const opps = await pageAll<Opp>((from, to) =>
    db
      .from('repair_opportunities')
      .select(
        'id, description, declined_at, created_at, customer_id, status, customers(id, name, email, consent_status, opted_out_at), vehicles(year, make, model)',
      )
      .eq('shop_id', s.shop_id)
      .eq('sequence_paused', false)
      .in('status', AUTO_STATUSES)
      .order('created_at', { ascending: true })
      .range(from, to),
  )

  const logs = await pageAll<{ opportunity_id: string; sent_at: string | null }>((from, to) =>
    db
      .from('message_logs')
      .select('opportunity_id, sent_at')
      .eq('shop_id', s.shop_id)
      .eq('status', 'sent')
      .order('created_at', { ascending: true })
      .range(from, to),
  )
  const sentMap = new Map<string, { count: number; last: number }>()
  for (const l of logs) {
    const cur = sentMap.get(l.opportunity_id) ?? { count: 0, last: 0 }
    cur.count += 1
    cur.last = Math.max(cur.last, l.sent_at ? new Date(l.sent_at).getTime() : 0)
    sentMap.set(l.opportunity_id, cur)
  }

  let sent = 0
  for (const opp of opps) {
    if (sent >= MAX_PER_SHOP_PER_RUN) break

    const c = opp.customers
    if (!c || !c.email || c.consent_status === 'withdrawn' || c.opted_out_at) continue

    const st = sentMap.get(opp.id) ?? { count: 0, last: 0 }
    const idx = st.count
    if (idx >= cadence.length) continue

    const base = new Date(opp.declined_at ? `${opp.declined_at}T00:00:00Z` : opp.created_at).getTime()
    const dueAt =
      idx === 0 ? base + cadence[0] * DAY : st.last + Math.max(1, cadence[idx] - cadence[idx - 1]) * DAY
    if (now.getTime() < dueAt) continue

    const template = templates[Math.min(idx, templates.length - 1)]
    const ok = await sendFollowUp(env, db, s, shop.name, opp, c.email, c.name, template, idx, now)
    if (ok) sent += 1
  }
}

async function sendFollowUp(
  env: Env,
  db: Db,
  s: ShopSettings,
  shopName: string,
  opp: Opp,
  email: string,
  customerName: string,
  template: Template,
  stepIndex: number,
  now: Date,
): Promise<boolean> {
  // The unique send_key means a retry or a parallel run can never send the same step twice.
  const sendKey = `${opp.id}:${stepIndex}`
  const { data: log, error: logErr } = await db
    .from('message_logs')
    .insert({
      shop_id: s.shop_id,
      opportunity_id: opp.id,
      customer_id: opp.customer_id,
      status: 'scheduled',
      send_key: sendKey,
      scheduled_for: now.toISOString(),
    })
    .select('id')
    .single()
  if (logErr || !log) {
    if (logErr && logErr.code !== '23505') console.error('message_logs insert failed', logErr.message)
    return false
  }

  try {
    const token = randomToken()
    const { error: tokErr } = await db.from('customer_action_tokens').insert({
      shop_id: s.shop_id,
      opportunity_id: opp.id,
      token_hash: await sha256Hex(token),
      expires_at: new Date(now.getTime() + TOKEN_TTL_DAYS * DAY).toISOString(),
    })
    if (tokErr) throw new Error(`token insert: ${tokErr.message}`)

    const link = `${appBase(env)}/r/${token}`
    const vehicle = [opp.vehicles?.year, opp.vehicles?.make, opp.vehicles?.model].filter(Boolean).join(' ')
    const vars = {
      customer_name: customerName,
      vehicle: vehicle || 'vehicle',
      repair: opp.description,
      shop_name: shopName,
      response_link: link,
    }

    const text =
      `${fill(template.body, vars)}\n\n--\n` +
      `You are receiving this because ${shopName} recommended a repair for your vehicle. ` +
      `To stop these emails, use this link: ${link}`

    const senderName = (s.sender_name?.trim() || shopName).replace(/[<>"]/g, '')
    const providerId = await sendEmail(env, {
      from: `${senderName} <${env.EMAIL_FROM_ADDRESS}>`,
      to: email,
      replyTo: s.reply_to_email,
      subject: fill(template.subject, vars),
      text,
      idempotencyKey: sendKey,
      unsubscribeUrl: link,
    })

    await db
      .from('message_logs')
      .update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: providerId })
      .eq('id', log.id)

    if (opp.status === 'new' || opp.status === 'follow_up_scheduled') {
      await db
        .from('repair_opportunities')
        .update({ status: 'contacted' })
        .eq('id', opp.id)
        .eq('shop_id', s.shop_id)
    }

    await db.from('audit_events').insert({
      shop_id: s.shop_id,
      event_type: 'followup_sent',
      entity_type: 'repair_opportunity',
      entity_id: opp.id,
      metadata: { step: stepIndex + 1, template_id: template.id },
    })
    return true
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`follow-up ${sendKey} failed`, message)
    // Remove the placeholder so the next run retries; Resend's idempotency key prevents double delivery.
    await db.from('message_logs').delete().eq('id', log.id)
    await db.from('audit_events').insert({
      shop_id: s.shop_id,
      event_type: 'followup_send_failed',
      entity_type: 'repair_opportunity',
      entity_id: opp.id,
      metadata: { step: stepIndex + 1, error: message.slice(0, 300) },
    })
    return false
  }
}
