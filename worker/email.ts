import type { Env } from './env'
import { escapeHtml } from './util'

export async function sendEmail(
  env: Env,
  msg: {
    from: string
    to: string
    replyTo?: string | null
    subject: string
    text: string
    idempotencyKey: string
    unsubscribeUrl?: string
  },
): Promise<string | null> {
  const html = escapeHtml(msg.text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, '<br>')

  const headers: Record<string, string> = {}
  if (msg.unsubscribeUrl) headers['List-Unsubscribe'] = `<${msg.unsubscribeUrl}>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': msg.idempotencyKey,
    },
    body: JSON.stringify({
      from: msg.from,
      to: [msg.to],
      reply_to: msg.replyTo || undefined,
      subject: msg.subject,
      text: msg.text,
      html: `<div style="font-family:system-ui,sans-serif;line-height:1.5">${html}</div>`,
      headers,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as { id?: string }
  return data.id ?? null
}
