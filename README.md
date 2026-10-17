# Gearbox

Declined-repair revenue recovery for independent auto repair shops.

## Stack
- Vite + React + TypeScript
- Supabase (database, auth)
- Cloudflare (hosting)
- Resend (email, to be set up)

## Run locally
```bash
npm install
cp .env.example .env.local   # add Supabase URL + anon key
npm run dev
```

## Deploy
```bash
npm run deploy
```

Database migrations live in `supabase/migrations/`.
