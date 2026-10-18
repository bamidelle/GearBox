# Deploying Gearbox to Cloudflare

One Cloudflare Worker serves the React app, the public customer reply endpoint (`/api/respond`), and a scheduled job (every 30 minutes) that sends follow-up emails.

## 1. Build and deploy

```bash
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (baked into the build)
npm run deploy               # asks you to log in to Cloudflare the first time
```

Note the URL it prints (like `https://gearbox.<your-subdomain>.workers.dev`).

## 2. Add server secrets

Run each command and paste the value when asked. Never put these in `.env.local` or in the repo.

```bash
npx wrangler secret put SUPABASE_URL                 # same URL as VITE_SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY    # Supabase > Project Settings > API > service_role key
npx wrangler secret put RESEND_API_KEY               # from resend.com
npx wrangler secret put EMAIL_FROM_ADDRESS           # an address on your verified Resend domain
npx wrangler secret put APP_URL                      # the Worker URL from step 1
```

## 3. Turn on follow-ups

In the app: Settings > add templates > tick "Enable automatic follow-up emails".

## Local testing of the Worker

```bash
cp .dev.vars.example .dev.vars   # fill in
npm run build && npx wrangler dev --test-scheduled
# then open http://localhost:8787/__scheduled to trigger the follow-up job
```

## How follow-ups work

- Each 30-minute run checks every shop with follow-ups enabled, skipping shops currently inside their quiet hours.
- Repairs in New, Follow-up scheduled, or Contacted status get email number N once the Nth follow-up day has passed (counted from the declined date, then from the last email sent).
- Customers who opted out are never emailed. Each email carries a reply/opt-out link.
- At most 50 emails per shop per run. A unique key per repair and step prevents double sends.
