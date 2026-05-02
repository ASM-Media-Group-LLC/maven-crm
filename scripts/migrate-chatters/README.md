# Chatter Evaluator data migration

One-time scripts to copy the legacy Roleplaychatters Firebase data into the
Maven Supabase branch as part of the native integration.

What it migrates:

- `profiles/*` → `public.chatter_profiles` (5 entries today: annie, camila, ferp, julieta, michelle)
- `content/*` → `public.chatter_vault_items` (~300 items today; files copied to Supabase Storage bucket `chatter-vault`)
- `config` → `public.chatter_config` (singleton row with `apps_script_url` + `notification_emails`)
- Default 10 criteria → `public.chatter_criteria_defaults`

What it does NOT migrate:

- `sessions/*` and their messages — those are per-examiner ephemeral data and
  the new schema uses Maven user IDs as owners, so historical Firebase
  sessions aren't meaningful here.

## Pre-requisites

1. The schema migration `20260502011215_chatter_evaluator_schema.sql` is
   applied to the target Supabase project (the JHON-V3 branch:
   `tjsqfkxysdbiwwxesqcx`).
2. The Storage bucket `chatter-vault` exists. The script will create it if
   missing, which requires the service-role key.
3. Firebase admin SDK service account JSON file is available locally
   (`roleplaychatters-firebase-adminsdk-*.json` from the legacy repo).

## Run

```bash
cd scripts/migrate-chatters
npm install

# 1) Dry-run first to see what would happen (zero writes):
FIREBASE_SA_PATH=/Users/john/Claude/Roleplaychatters-master/roleplaychatters-firebase-adminsdk-fbsvc-fa831a3df0.json \
SUPABASE_URL=https://tjsqfkxysdbiwwxesqcx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-of-branch> \
npm run migrate:dry

# 2) When happy with the dry-run output, run for real:
FIREBASE_SA_PATH=/Users/john/Claude/Roleplaychatters-master/roleplaychatters-firebase-adminsdk-fbsvc-fa831a3df0.json \
SUPABASE_URL=https://tjsqfkxysdbiwwxesqcx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key-of-branch> \
npm run migrate

# 3) Verify counts match Firebase:
FIREBASE_SA_PATH=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run verify
```

## Flags on `migrate.mjs`

- `--dry-run` — read & report only, zero writes (use this first).
- `--skip-files` — insert `chatter_vault_items` rows but **keep the original
  URLs** instead of downloading + uploading to Supabase Storage. Faster, but
  the URLs stay tied to `roleplaychatters.imaginehub.me`. Useful if you just
  want metadata in place and will copy files later.

## Idempotency

- `chatter_profiles` upserts on `key` (unique).
- `chatter_config` upserts on `id=1` (singleton).
- `chatter_criteria_defaults` skips rows whose `label` already exists.
- `chatter_vault_items` does NOT have a natural unique key — re-running will
  insert duplicates. Use `--skip-files` to avoid the slow file copy and
  manually `DELETE FROM chatter_vault_items` first if you need a clean re-run.

## Service-role key for the branch

Get it from the dashboard:
`https://supabase.com/dashboard/project/tjsqfkxysdbiwwxesqcx/settings/api-keys`

⚠ This key bypasses RLS — never commit it. Pass via env var only.

## After the migration

- Roleplaychatters at `roleplaychatters.imaginehub.me` keeps running untouched
  — this script only **reads** from Firebase, never writes back.
- The Maven branch (JHON-V3 / `tjsqfkxysdbiwwxesqcx`) now has the data and is
  ready for Phase 2 (Admin UI for profiles + vault).
