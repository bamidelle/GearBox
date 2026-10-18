import { createClient } from '@supabase/supabase-js'

export interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  RESEND_API_KEY: string
  // Verified Resend sender address, e.g. notifications@yourdomain.com
  EMAIL_FROM_ADDRESS: string
  // Public base URL of the deployed app, e.g. https://gearbox.example.workers.dev
  APP_URL: string
}

export interface Ctx {
  waitUntil(promise: Promise<unknown>): void
}

// Service-role client: bypasses RLS. Server-side only, never ship this key to the browser.
export function admin(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export type Db = ReturnType<typeof admin>

export function appBase(env: Env): string {
  return env.APP_URL.replace(/\/+$/, '')
}
