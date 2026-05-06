# MAVEN CRM

All-in-one platform for creators' agency management — closers, chatters, scouter, finance, HR.

## Repo layout

```
frontend/          Vite + React + TS app (Vite root is `frontend/`)
supabase/          Edge functions (Deno) + SQL migrations
servicios/         Standalone microservices (e.g. scouter-worker)
```

Build output goes to `<repo-root>/dist`.

## Run locally

```bash
# Frontend
npm install
npm run dev          # http://localhost:8080
```

Edge functions are deployed via the Supabase CLI:

```bash
supabase functions deploy <name>
supabase secrets set KEY=value
```

Migrations live under `supabase/migrations/` and are applied via `supabase db push` or by hand through the SQL editor when needed.

## Stack

- React 18, Vite, Tailwind, Radix UI
- Supabase (auth, DB, edge functions, storage)
- Anthropic Claude (QA evaluation), Groq (lead scoring)
- TanStack Query for data fetching
