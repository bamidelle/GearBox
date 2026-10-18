import { admin, appBase, type Ctx, type Db, type Env } from './env'
import { sendEmail } from './email'
import { json, sha256Hex } from './util'

const OPEN_STATUSES = ['new', 'follow_up_scheduled', 'contacted', 'customer_interested', 'appointment_requested']

const TYPE_TO_STATUS: Record<string, string> = {
  approve: 'approved',
  callback: 'customer_interested',
  appointment: 'appointment_requested',
  interested: 'customer_interested',
  not_now: 'declined_again',
  opt_out: 'opted_out',
}

const TYPE_LABEL: Record<string, string> = {
  approve: 'approved the repair',
  callback: 'wants a call back',
  appointment: 'wants to schedule the repair',
  interested: 'is interested',
  not_now: 'is not ready yet',
  opt_out: 'opted out of follow-ups',
}

type TokenRow = { id: string; shop_id: string; opportunity_id: string }

async function lookupToken(db: Db, token: string): Promise<TokenRow | null> {
  if (!token || token.length < 20 || token.length > 200) return null
  const { data } = await db
    .from('customer_action_tokens')
    .select('id, shop_id, opportunity_id, expires_at, revoked_at')
    .eq('token_hash', await sha256Hex(token))
    .maybeSingle()
  if (!data || data.revoked_at || new Date(data.expires_at).getTime() < Date.now()) return null
  return data as TokenRow
}

export async function handleRespond(request: Request, env: Env, ctx: Ctx): Promise<Response> {
  const url = new URL(request.url)
  const db = admin(env)

  if (request.method === 'GET' && url.pathname === '/api/respond/info') {
    const t = await lookupToken(db, url.searchParams.get('token') ?? '')
    if (!t) return json({ error: 'invalid' }, 404)

    const { data } = await db
      .from('repair_opportunities')
      .select('description, estimate_amount, currency, customers(name), vehicles(year, make, model), shops(name)')
      .eq('id', t.opportunity_id)
      .eq('shop_id', t.shop_id)
      .maybeSingle()
    if (!data) return json({ error: 'invalid' }, 404)

    const row = data as unknown as {
      description: string
      estimate_amount: number | null
      currency: string
      customers: { name: string } | null
      vehicles: { year: number | null; make: string | null; model: string | null } | null
      shops: { name: string } | null
    }
    return json({
      shopName: row.shops?.name ?? '',
      customerName: row.customers?.name ?? '',
      description: row.description,
      estimate: row.estimate_amount,
      currency: row.currency,
      vehicle: [row.vehicles?.year, row.vehicles?.make, row.vehicles?.model].filter(Boolean).join(' '),
    })
  }

  if (request.method === 'POST' && url.pathname === '/api/respond') {
    let body: { token?: string; type?: string; message?: string }
    try {
      body = await request.json()
    } catch {
      return json({ error: 'bad request' }, 400)
    }
    const type = body.type ?? ''
    if (!(type in TYPE_TO_STATUS)) return json({ error: 'bad request' }, 400)
    const message = (body.message ?? '').trim().slice(0, 2000) || null

    const t = await lookupToken(db, body.token ?? '')
    if (!t) return json({ error: 'invalid' }, 404)

    const { data: opp } = await db
      .from('repair_opportunities')
      .select('id, status, customer_id, description, estimate_amount, customers(name)')
      .eq('id', t.opportunity_id)
      .eq('shop_id', t.shop_id)
      .maybeSingle()
    if (!opp) return json({ error: 'invalid' }, 404)
    const o = opp as unknown as {
      id: string
      status: string
      customer_id: string
      description: string
      estimate_amount: number | null
      customers: { name: string } | null
    }

    const { error: respErr } = await db.from('customer_responses').insert({
      shop_id: t.shop_id,
      opportunity_id: t.opportunity_id,
      token_id: t.id,
      response_type: type,
      message,
    })
    if (respErr) {
      console.error('customer_responses insert failed', respErr.message)
      return json({ error: 'server' }, 500)
    }

    if (OPEN_STATUSES.includes(o.status)) {
      const values: Record<string, unknown> = { status: TYPE_TO_STATUS[type] }
      if (type === 'approve' && o.estimate_amount != null) {
        values.approved_amount = o.estimate_amount
        values.approved_at = new Date().toISOString()
      }
      await db.from('repair_opportunities').update(values).eq('id', o.id).eq('shop_id', t.shop_id)
    }

    if (type === 'opt_out') {
      const nowIso = new Date().toISOString()
      await db
        .from('customers')
        .update({ consent_status: 'withdrawn', opted_out_at: nowIso })
        .eq('id', o.customer_id)
        .eq('shop_id', t.shop_id)
      await db
        .from('repair_opportunities')
        .update({ sequence_paused: true })
        .eq('customer_id', o.customer_id)
        .eq('shop_id', t.shop_id)
    }

    await db.from('customer_action_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', t.id)
    await db.from('audit_events').insert({
      shop_id: t.shop_id,
      event_type: 'customer_response',
      entity_type: 'repair_opportunity',
      entity_id: o.id,
      metadata: { type },
    })

    ctx.waitUntil(
      notifyShop(env, db, t.shop_id, o.id, o.customers?.name ?? 'A customer', o.description, type, message).catch(
        (e) => console.error('shop notification failed', e),
      ),
    )
    return json({ ok: true })
  }

  return json({ error: 'not found' }, 404)
}

async function notifyShop(
  env: Env,
  db: Db,
  shopId: string,
  opportunityId: string,
  customerName: string,
  description: string,
  type: string,
  message: string | null,
): Promise<void> {
  const [{ data: shop }, { data: settings }] = await Promise.all([
    db.from('shops').select('name, contact_email').eq('id', shopId).maybeSingle(),
    db.from('shop_settings').select('reply_to_email').eq('shop_id', shopId).maybeSingle(),
  ])
  const to = settings?.reply_to_email || shop?.contact_email
  if (!to) return

  const text =
    `${customerName} ${TYPE_LABEL[type]}.\n\nRepair: ${description}\n` +
    (message ? `\nTheir message:\n${message}\n` : '') +
    `\nOpen in GearBox: ${appBase(env)}/opportunities/${opportunityId}`

  await sendEmail(env, {
    from: `GearBox <${env.EMAIL_FROM_ADDRESS}>`,
    to,
    subject: `${customerName} ${TYPE_LABEL[type]}`,
    text,
    idempotencyKey: `notify:${opportunityId}:${type}:${Date.now()}`,
  })
}
