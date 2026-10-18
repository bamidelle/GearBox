import type { Ctx, Env } from './env'
import { handleRespond } from './respond'
import { handleTestSend } from './testsend'
import { runFollowUps } from './followups'

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/api/respond' || pathname.startsWith('/api/respond/')) {
      return handleRespond(request, env, ctx)
    }
    if (pathname === '/api/test-send') {
      return handleTestSend(request, env)
    }
    // Everything else is the React app (static assets, SPA fallback).
    return env.ASSETS.fetch(request)
  },

  async scheduled(_event: unknown, env: Env, ctx: Ctx): Promise<void> {
    ctx.waitUntil(runFollowUps(env))
  },
}
