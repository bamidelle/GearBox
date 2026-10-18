# Deploying Gearbox to Cloudflare (no terminal needed)

One Cloudflare Worker serves the React app, the public customer reply endpoint (`/api/respond`), and a scheduled job (every 30 minutes) that sends follow-up emails. Cloudflare builds and deploys it automatically from this GitHub repo on every push to `main`.

## 1. Connect the repo (gets you the live link)

1. Cloudflare dashboard > **Workers & Pages** > **Create** > **Import a repository** (GitHub). Allow access to `bamidelle/GearBox`.
2. Project/Worker name: `gearbox` (must match `name` in `wrangler.jsonc`).
3. Build command: `npm run build`. Deploy command: `npx wrangler deploy`. Root directory: `/`.
4. Under **Build variables**, add:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon (public) key
5. Save and Deploy. Your link is shown on the Worker page, like `https://gearbox.<your-subdomain>.workers.dev`.

## 2. Add server secrets (for emails and customer replies)

Worker > **Settings** > **Variables and Secrets** > Add (type: Secret):

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | same as `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase > Project Settings > API > `service_role` key (never share or commit) |
| `RESEND_API_KEY` | from resend.com |
| `EMAIL_FROM_ADDRESS` | an address on your verified Resend domain |
| `APP_URL` | your Worker link from step 1 |

The app itself (sign up, import, opportunities, dashboard) works without these. They are only needed for follow-up emails and the customer reply page.

## 3. Turn on follow-ups

In the app: Settings > fill in the shop mailing address > add templates > tick "Enable automatic follow-up emails".

## Using the terminal instead

```bash
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run deploy               # asks you to log in to Cloudflare the first time
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # repeat for each secret above
```

## Local testing of the Worker

```bash
cp .dev.vars.example .dev.vars   # fill in
npm run build && npx wrangler dev --test-scheduled
# then open http://localhost:8787/__scheduled to trigger the follow-up job
```

## How follow-ups work

- Each 30-minute run checks every shop with follow-ups enabled, skipping shops that have no mailing address or are inside their quiet hours.
- Repairs in New, Follow-up scheduled, or Contacted status get email number N once the Nth follow-up day has passed (counted from the declined date, then from the last email sent).
- Customers who opted out are never emailed. Each email carries a reply/opt-out link and the shop's mailing address.
- At most 50 emails per shop per run. A unique key per repair and step prevents double sends.
