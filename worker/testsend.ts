import { admin, type Env } from './env'
import { sendEmail } from './email'
import { fill, json } from './util'

const MAX_TESTS_PER_HOUR = 5

// Sends a template, filled with sample data, to the signed-in user's own email address.
export async function handleTestSend(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'not found' }, 404)

  const jwt = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'Please log in again.' }, 401)

  const db = admin(env)
  const { data: userData, error: userErr } = await db.auth.getUser(jwt)
  const user = userData?.user
  if (userErr || !user?.email) return json({ error: 'Please log in again.' }, 401)

  let body: { templateId?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad request' }, 400)
  }

  const { data: membership } = await db
    .from('shop_memberships')
    .select('shop_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return json({ error: 'No shop found.' }, 403)
  const shopId = membership.shop_id as string

  const { data: tpl } = await db
    .from('message_templates')
    .select('subject, body')
    .eq('id', body.templateId ?? '')
    .eq('shop_id', shopId)
    .maybeSingle()
  if (!tpl) return json({ error: 'Template not found.' }, 404)

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
  const { count } = await db
    .from('audit_events')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .eq('event_type', 'test_send')
    .gte('created_at', hourAgo)
  if ((count ?? 0) >= MAX_TESTS_PER_HOUR) return json({ error: 'Too many test emails. Try again later.' }, 429)

  const [{ data: shop }, { data: settings }] = await Promise.all([
    db.from('shops').select('name, postal_address').eq('id', shopId).maybeSingle(),
    db.from('shop_settings').select('sender_name, reply_to_email').eq('shop_id', shopId).maybeSingle(),
  ])
  const shopName = (shop?.name as string | undefined) ?? 'Your shop'

  const vars = {
    customer_name: 'Alex Sample',
    vehicle: '2019 Toyota Camry',
    repair: 'Brake pads replacement',
    shop_name: shopName,
    response_link: `${env.APP_URL.replace(/\/+$/, '')}/r/sample-link`,
  }

  const text =
    `${fill(tpl.body as string, vars)}\n\n--\n` +
    `You are receiving this because ${shopName} recommended a repair for your vehicle. ` +
    `To stop these emails, use this link: ${vars.response_link}\n\n` +
    `${shopName}, ${(shop?.postal_address as string | null) ?? '(add your mailing address in Settings)'}\n\n` +
    `This is a test email with sample data.`

  const senderName = (((settings?.sender_name as string | null)?.trim() || shopName) as string).replace(/[<>"]/g, '')

  try {
    await sendEmail(env, {
      from: `${senderName} <${env.EMAIL_FROM_ADDRESS}>`,
      to: user.email,
      replyTo: settings?.reply_to_email as string | null,
      subject: `[TEST] ${fill(tpl.subject as string, vars)}`,
      text,
      idempotencyKey: `test:${user.id}:${Date.now()}`,
    })
  } catch (e) {
    console.error('test send failed', e)
    return json({ error: 'Email could not be sent. Check the email settings (Resend key and sender address).' }, 502)
  }

  await db.from('audit_events').insert({
    shop_id: shopId,
    actor_id: user.id,
    event_type: 'test_send',
    metadata: {},
  })
  return json({ ok: true })
}
