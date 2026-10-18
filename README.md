# GearBox

Declined-repair revenue recovery for independent auto repair shops.

## Stack
- Vite + React + TypeScript
- Supabase (database, auth)
- Cloudflare Workers (hosting, scheduled follow-ups)
- Resend (email)

## Run locally
```bash
npm install
cp .env.example .env.local   # add Supabase URL + anon key
npm run dev
```

## Deploy
See `DEPLOY.md`.

Database migrations live in `supabase/migrations/`.
