-- ============================================================================
-- COMBINED MIGRATION BUNDLE — May 4 only (chatter_* already applied)
-- Generated 2026-05-04 (revision 2)
-- The 6 chatter_* migrations from May 2 were already applied to JHON-V3
-- via direct SQL (relation chatter_profiles already exists). Only the
-- May 4 migrations are needed.
-- ============================================================================

BEGIN;


-- ─── 20260504100000_agency_qa_schema.sql ─────────────────────────────────────────────
-- ============================================================================
-- Agency QA — schema (migrated from kash-call-qa)
-- ============================================================================
-- Closer call evaluation system: closers + models + per-call AI analysis +
-- human feedback + Mike (AI supervisor) chat sessions.
--
-- All tables are prefixed `qa_` to avoid clashing with Maven's existing
-- `leads`, `calls`, `companies` tables and with the future generic `models`
-- name space. App-level access is gated by canAccess('Agency QA',
-- <submodule>) — RLS here is intentionally permissive for authenticated
-- users; per-user scoping (chat sessions, etc.) uses auth.uid() filters.

-- ----------------------------------------------------------------------------
-- 1. Closers — sales reps whose calls get evaluated
-- ----------------------------------------------------------------------------
CREATE TABLE public.qa_closers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qa_closers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qa_closers_read"   ON public.qa_closers FOR SELECT  TO authenticated USING (true);
CREATE POLICY "qa_closers_write"  ON public.qa_closers FOR ALL     TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 2. Models — OnlyFans / agency models the closer is selling for
-- ----------------------------------------------------------------------------
CREATE TABLE public.qa_models (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,
  category        text,
  -- Canonical country (compatible with country-normalize.ts), used to render
  -- the flag emoji in QA emails / UI. Nullable until set in /new-qa.
  country         text,
  ig_url          text,
  avatar_data_url text,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qa_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qa_models_read"   ON public.qa_models FOR SELECT  TO authenticated USING (true);
CREATE POLICY "qa_models_write"  ON public.qa_models FOR ALL     TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 3. Calls — one row per analyzed sales call
-- ----------------------------------------------------------------------------
CREATE TABLE public.qa_calls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id        uuid REFERENCES public.qa_models(id)   ON DELETE SET NULL,
  closer_id       uuid REFERENCES public.qa_closers(id)  ON DELETE SET NULL,
  call_date       date NOT NULL,
  evaluator_name  text NOT NULL,
  transcript      text NOT NULL,
  audio_metrics   jsonb,
  -- Full Claude / IA analysis payload (sections, dimensions, outcome, …)
  claude_analysis jsonb NOT NULL,
  claude_score    integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX qa_calls_model_idx   ON public.qa_calls(model_id);
CREATE INDEX qa_calls_closer_idx  ON public.qa_calls(closer_id);
CREATE INDEX qa_calls_date_idx    ON public.qa_calls(call_date DESC);

ALTER TABLE public.qa_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qa_calls_read"   ON public.qa_calls FOR SELECT  TO authenticated USING (true);
CREATE POLICY "qa_calls_write"  ON public.qa_calls FOR ALL     TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 4. Human feedback — per-call free-form feedback from supervisors
-- ----------------------------------------------------------------------------
CREATE TABLE public.qa_human_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id         uuid NOT NULL REFERENCES public.qa_calls(id) ON DELETE CASCADE,
  evaluator_name  text NOT NULL,
  feedback_text   text NOT NULL,
  human_score     integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX qa_human_feedback_call_idx ON public.qa_human_feedback(call_id);

ALTER TABLE public.qa_human_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qa_human_feedback_read"   ON public.qa_human_feedback FOR SELECT  TO authenticated USING (true);
CREATE POLICY "qa_human_feedback_write"  ON public.qa_human_feedback FOR ALL     TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 5. Section feedback — granular thumbs-up/down per analysis section
-- ----------------------------------------------------------------------------
CREATE TABLE public.qa_section_feedback (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id          uuid NOT NULL REFERENCES public.qa_calls(id) ON DELETE CASCADE,
  section_type     text NOT NULL,
  section_index    integer NOT NULL,
  section_label    text,
  -- 1 = thumbs up, -1 = thumbs down
  thumbs           integer NOT NULL,
  note             text,
  suggested_score  integer,
  evaluator_name   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qa_section_feedback_call_section_unique
    UNIQUE (call_id, section_type, section_index)
);

CREATE INDEX qa_section_feedback_call_idx ON public.qa_section_feedback(call_id);

CREATE TRIGGER qa_section_feedback_set_updated_at
  BEFORE UPDATE ON public.qa_section_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.qa_section_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qa_section_feedback_read"   ON public.qa_section_feedback FOR SELECT  TO authenticated USING (true);
CREATE POLICY "qa_section_feedback_write"  ON public.qa_section_feedback FOR ALL     TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 6. Mike chat sessions — per-user conversations with the AI QA supervisor
-- ----------------------------------------------------------------------------
-- Each session is scoped to ONE closer or "all" (team-wide). Scope is fixed
-- at creation to maximize Anthropic prompt caching (90% discount on repeated
-- context). To switch closers, create a new session.
CREATE TABLE public.qa_chat_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- "closer" → only that closer's QAs visible | "all" → team-wide context
  scope_type       text NOT NULL,
  scope_closer_id  uuid REFERENCES public.qa_closers(id) ON DELETE SET NULL,
  title            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX qa_chat_sessions_user_idx ON public.qa_chat_sessions(user_id, created_at DESC);

CREATE TRIGGER qa_chat_sessions_set_updated_at
  BEFORE UPDATE ON public.qa_chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.qa_chat_sessions ENABLE ROW LEVEL SECURITY;
-- Each user only sees their own sessions. Admin role can override at app level
-- (canAccess gives them the page; the queries can pass `all=true` plus a
-- service-role edge function call to fetch everyone's).
CREATE POLICY "qa_chat_sessions_own"
  ON public.qa_chat_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 7. Mike chat messages — individual user / assistant turns
-- ----------------------------------------------------------------------------
-- tokens_in / tokens_out / cached_tokens enable cost tracking and prompt-cache
-- verification (cached_tokens > 0 means Anthropic served from cache).
CREATE TABLE public.qa_chat_messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES public.qa_chat_sessions(id) ON DELETE CASCADE,
  -- "user" | "assistant"
  role           text NOT NULL,
  content        text NOT NULL,
  tokens_in      integer,
  tokens_out     integer,
  cached_tokens  integer,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX qa_chat_messages_session_idx ON public.qa_chat_messages(session_id, created_at);

ALTER TABLE public.qa_chat_messages ENABLE ROW LEVEL SECURITY;
-- A user can read/write messages only inside one of their own sessions.
CREATE POLICY "qa_chat_messages_via_session"
  ON public.qa_chat_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.qa_chat_sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.qa_chat_sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );


-- ─── 20260504110000_scouter_assist_schema.sql ─────────────────────────────────────────────
-- ============================================================================
-- Scouter Assist — schema (migrated from kash-call-qa)
-- ============================================================================
-- Lead discovery + AI scoring pipeline for the agency. Drains Apify-derived
-- Instagram data into a leads CRM with per-company targeting, AI scoring,
-- favorites, and an in-app notifications channel for high-fit leads.
--
-- All tables prefixed `scouter_` to avoid clashing with Maven's existing
-- `leads`, `companies`, `notifications`. Access gated at app level via
-- canAccess('Scouter Assist', <submodule>); RLS is permissive for
-- authenticated users except for per-user state (favorites, notification
-- reads) which scopes to auth.uid().

-- ----------------------------------------------------------------------------
-- 1. Companies — agency brand accounts (kash_miami, unlok_me, …)
-- ----------------------------------------------------------------------------
-- Used as the targeting bucket for leads (which company is pursuing this
-- lead). NOT the same as Maven's existing `companies` table — this is for
-- the scouter's outreach accounts, kept separate to avoid coupling concerns.
CREATE TABLE public.scouter_companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scouter_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scouter_companies_read"   ON public.scouter_companies FOR SELECT  TO authenticated USING (true);
CREATE POLICY "scouter_companies_write"  ON public.scouter_companies FOR ALL     TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 2. Leads — Instagram prospects discovered + AI-scored
-- ----------------------------------------------------------------------------
-- Wide table — keeps the kash schema 1:1 because the scouter pipeline (icp
-- rules, AI scoring, lead drawer UI) reads from many of these columns.
-- Discovery flow:
--   raw scrape → leads(status='discovery') → AI score → status='candidate'
--   → outreach (touches in jsonb) → status='contacting'/'confirmed'/'active'
CREATE TABLE public.scouter_leads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.scouter_companies(id) ON DELETE RESTRICT,
  instagram_handle     text NOT NULL,
  instagram_url        text,
  name                 text,
  phone                text,
  country              text,
  city                 text,
  -- A++ | A | B+ | B | C+ | C — free text validated at API edge
  category             text,
  -- discovery | candidate | contacting | confirmed | active | rejected
  status               text NOT NULL DEFAULT 'discovery',
  platform             text,
  onlyfans_url         text,
  followers            integer,
  bio                  text,
  verified             boolean NOT NULL DEFAULT false,
  photo_data_url       text,
  -- 0–10 with one decimal (e.g. 6.5). Was integer in early kash migrations
  -- and broke every UPDATE the moment the model returned a decimal.
  ai_score             real,
  ai_status            text,
  ai_reason            text,
  -- Detected link-in-bio platform (Linktree, Beacons, Stan, AllMyLinks,
  -- Koji, "Direct OF" if it links straight to OF/Fansly/MYM, "Other" for
  -- unknown external URLs, NULL if no external URL). Useful as a signal
  -- before invoking the AI scorer.
  link_in_bio_platform text,
  -- 0–3 prefilter score computed by lib/scouter-icp-rules.ts. Sorts the
  -- score_lead queue — most promising first.
  prefilter_score      integer NOT NULL DEFAULT 0,
  -- Where the lead came from (hashtag pipeline, podcast, base, CP, etc.)
  discovery_source     text,
  -- Legacy single-account targeting. Kept readable for old UI compat;
  -- new writes go through `target_companies`.
  contact_account      text,
  -- Many-to-many via jsonb array of company slugs — replaces contact_account.
  target_companies     jsonb NOT NULL DEFAULT '[]'::jsonb,
  assigned_closer      text,
  -- Sub-product within the company (e.g. kash_latam inside kash)
  sub_product          text,
  -- Destination when closed but not a known company (e.g. external agency)
  assigned_agency      text,
  monetization_usd     integer,
  split_pct            integer,
  notes                text,
  date_added           date,
  date_contacted       date,
  date_confirmed       date,
  date_active          date,
  date_rejected        date,
  -- Outreach touches as jsonb array of { date, channel: dm1|dm2|dm3|call|other, note? }
  contact_touches      jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scouter_leads_company_handle_unique UNIQUE (company_id, instagram_handle)
);

CREATE INDEX scouter_leads_status_idx          ON public.scouter_leads(status);
CREATE INDEX scouter_leads_company_status_idx  ON public.scouter_leads(company_id, status);
CREATE INDEX scouter_leads_ai_status_idx       ON public.scouter_leads(ai_status) WHERE ai_status IS NOT NULL;
CREATE INDEX scouter_leads_prefilter_idx       ON public.scouter_leads(prefilter_score DESC);

CREATE TRIGGER scouter_leads_set_updated_at
  BEFORE UPDATE ON public.scouter_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.scouter_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scouter_leads_read"   ON public.scouter_leads FOR SELECT  TO authenticated USING (true);
CREATE POLICY "scouter_leads_write"  ON public.scouter_leads FOR ALL     TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 3. Lead favorites — per-user, NOT shared between users
-- ----------------------------------------------------------------------------
CREATE TABLE public.scouter_lead_favorites (
  lead_id     uuid NOT NULL REFERENCES public.scouter_leads(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scouter_lead_favorites_pk PRIMARY KEY (lead_id, user_id)
);

CREATE INDEX scouter_lead_favorites_user_idx ON public.scouter_lead_favorites(user_id);

ALTER TABLE public.scouter_lead_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scouter_lead_favorites_own"
  ON public.scouter_lead_favorites
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. Scouter jobs — persistent queue for the discovery / scoring worker
-- ----------------------------------------------------------------------------
-- Drained in small batches by the worker. Status state machine:
--   queued → running → done | failed (after maxAttempts)
-- Kinds: discover_seed | discover_hashtag | score_lead | enrich_profile.
CREATE TABLE public.scouter_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          text NOT NULL,
  status        text NOT NULL DEFAULT 'queued',
  -- Target company for discover/score jobs; null for global jobs
  company_id    uuid REFERENCES public.scouter_companies(id) ON DELETE CASCADE,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts      integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 3,
  last_error    text,
  result        jsonb,
  -- Higher priority jobs are picked up first
  priority      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  completed_at  timestamptz
);

CREATE INDEX scouter_jobs_dispatch_idx
  ON public.scouter_jobs(status, priority DESC, created_at)
  WHERE status = 'queued';
CREATE INDEX scouter_jobs_company_idx ON public.scouter_jobs(company_id);

ALTER TABLE public.scouter_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scouter_jobs_read"   ON public.scouter_jobs FOR SELECT  TO authenticated USING (true);
CREATE POLICY "scouter_jobs_write"  ON public.scouter_jobs FOR ALL     TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 5. Apify token state + budget — rate-limit / cooldown bookkeeping
-- ----------------------------------------------------------------------------
-- Persistent so it survives container redeploys. Stores ONLY the last 6
-- chars of the token (`token_suffix`) for debugging — never the full token.
CREATE TABLE public.scouter_apify_token_state (
  token_suffix    text PRIMARY KEY,
  cooldown_until  timestamptz,
  last_error      text,
  -- Total requests for the current day (resets via apify_budget rollover)
  requests_today  integer NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scouter_apify_token_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scouter_apify_token_state_read"   ON public.scouter_apify_token_state FOR SELECT  TO authenticated USING (true);
CREATE POLICY "scouter_apify_token_state_write"  ON public.scouter_apify_token_state FOR ALL     TO authenticated USING (true) WITH CHECK (true);

-- One row per day. Worker checks this BEFORE firing an Apify run; if the
-- daily cap is exceeded it pauses.
CREATE TABLE public.scouter_apify_budget (
  day              date PRIMARY KEY,
  est_spend_usd    integer NOT NULL DEFAULT 0,
  runs_count       integer NOT NULL DEFAULT 0,
  items_processed  integer NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scouter_apify_budget ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scouter_apify_budget_read"   ON public.scouter_apify_budget FOR SELECT  TO authenticated USING (true);
CREATE POLICY "scouter_apify_budget_write"  ON public.scouter_apify_budget FOR ALL     TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 6. In-app notifications (scouter-specific channel)
-- ----------------------------------------------------------------------------
-- Kept SEPARATE from Maven's existing `notifications` table because the
-- payload shape, the read state semantics, and the recipients differ. A
-- single notification is inserted once and each user marks their own read
-- state via scouter_notification_reads.
--
-- Kinds:
--   "lead_high_fit"  → AI scored a lead as ai_status='high_fit'
CREATE TABLE public.scouter_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX scouter_notifications_created_idx ON public.scouter_notifications(created_at DESC);

ALTER TABLE public.scouter_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scouter_notifications_read"   ON public.scouter_notifications FOR SELECT  TO authenticated USING (true);
CREATE POLICY "scouter_notifications_write"  ON public.scouter_notifications FOR ALL     TO authenticated USING (true) WITH CHECK (true);

-- Per-user read state. Row exists ⇒ the user has read the notification.
CREATE TABLE public.scouter_notification_reads (
  notification_id  uuid NOT NULL REFERENCES public.scouter_notifications(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scouter_notification_reads_pk PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX scouter_notification_reads_user_idx ON public.scouter_notification_reads(user_id);

ALTER TABLE public.scouter_notification_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scouter_notification_reads_own"
  ON public.scouter_notification_reads
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ─── 20260504200000_tenants_and_membership.sql ─────────────────────────────────────────────
-- ============================================================================
-- Tenants + tenant membership — base for multi-tenant isolation
-- ============================================================================
-- Maven CRM is going to be sold to external agencies (Phase 2). Each
-- agency = one tenant. Today there's a single tenant: ASM Tech.
--
-- This migration is the FIRST piece of the multi-tenant work; the
-- two follow-up migrations (qa_tenant_isolation, scouter_tenant_isolation)
-- add tenant_id columns + tenant-scoped RLS to the qa_* and scouter_*
-- tables. Maven's older tables (creators, sales, …) are out of scope
-- for this slice and stay single-tenant for now (deuda known).

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
CREATE TABLE public.tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,                 -- 'asm-tech', 'agency-x', ...
  name        text NOT NULL,                        -- display name
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tenant_members (
  user_id     uuid NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id)    ON DELETE CASCADE,
  -- 'owner' | 'admin' | 'member' — kept as free text so we can extend
  -- without a schema change (e.g. 'support', 'auditor').
  role        text NOT NULL DEFAULT 'member',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tenant_id)
);

CREATE INDEX tenant_members_user_idx   ON public.tenant_members(user_id);
CREATE INDEX tenant_members_tenant_idx ON public.tenant_members(tenant_id);

-- ----------------------------------------------------------------------------
-- 2. Helper: current_tenant_id()
-- ----------------------------------------------------------------------------
-- Returns the tenant_id of the user calling the query. Used by the
-- tenant-scoped RLS policies on every qa_* / scouter_* table, and as
-- the DEFAULT value for tenant_id columns so app-level inserts don't
-- need to know about it.
--
-- SECURITY DEFINER + STABLE so RLS policies can call it without
-- triggering recursion through tenant_members' own RLS.
--
-- For users in multiple tenants, returns the earliest membership.
-- A future "active tenant switcher" will need a session-scoped
-- override (e.g. via JWT claim or a settings table).
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.tenant_members
  WHERE user_id = auth.uid()
  ORDER BY created_at ASC
  LIMIT 1
$$;

-- ----------------------------------------------------------------------------
-- 3. RLS — users only see their own tenants / memberships
-- ----------------------------------------------------------------------------
ALTER TABLE public.tenants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants_self_visible" ON public.tenants
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

-- Membership is per-user. Users see only their own rows.
CREATE POLICY "tenant_members_own" ON public.tenant_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Writes to these two tables are reserved for service role / admin
-- workflows. Authenticated users can't insert themselves into a new
-- tenant or rename one — that flow goes through the admin tooling.
-- (No INSERT/UPDATE/DELETE policies on purpose.)

-- ----------------------------------------------------------------------------
-- 4. Seed — first tenant (ASM Tech) + assign every existing user
-- ----------------------------------------------------------------------------
INSERT INTO public.tenants (slug, name)
VALUES ('asm-tech', 'ASM Tech')
ON CONFLICT (slug) DO NOTHING;

-- Every existing auth.users row becomes an owner of ASM Tech. Future
-- signups are NOT auto-attached — they'll come through an explicit
-- onboarding flow (invite link, admin assignment, etc.).
INSERT INTO public.tenant_members (user_id, tenant_id, role)
SELECT u.id, t.id, 'owner'
FROM auth.users u
CROSS JOIN public.tenants t
WHERE t.slug = 'asm-tech'
ON CONFLICT (user_id, tenant_id) DO NOTHING;


-- ─── 20260504210000_qa_tenant_isolation.sql ─────────────────────────────────────────────
-- ============================================================================
-- Multi-tenant isolation for the qa_* tables (Agency QA)
-- ============================================================================
-- Adds tenant_id to every qa_* table (default = current_tenant_id() so
-- the app code keeps working without changes), backfills existing rows
-- to ASM Tech, and replaces the previous "any authenticated user" RLS
-- with tenant-scoped policies.
--
-- For per-user tables (qa_chat_sessions, qa_chat_messages) the policy
-- combines tenant scope AND auth.uid() so a user can only see their
-- own chats inside their own tenant.

-- Reusable: helper to add tenant_id to a generic-shape table.
-- We can't easily macro this in pure SQL, so the same 4-line block
-- repeats per table. The pattern is intentional and identical:
--   ADD COLUMN nullable → backfill → SET NOT NULL → SET DEFAULT
-- This works whether the table has 0 rows (empty) or rows already
-- populated (everything backfills to ASM Tech).

-- ─── qa_closers ─────────────────────────────────────────────────────────
ALTER TABLE public.qa_closers
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.qa_closers
  SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'asm-tech')
  WHERE tenant_id IS NULL;
ALTER TABLE public.qa_closers
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
CREATE INDEX qa_closers_tenant_idx ON public.qa_closers(tenant_id);

DROP POLICY IF EXISTS "qa_closers_read"  ON public.qa_closers;
DROP POLICY IF EXISTS "qa_closers_write" ON public.qa_closers;
CREATE POLICY "qa_closers_tenant" ON public.qa_closers
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ─── qa_models ──────────────────────────────────────────────────────────
ALTER TABLE public.qa_models
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.qa_models
  SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'asm-tech')
  WHERE tenant_id IS NULL;
ALTER TABLE public.qa_models
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
CREATE INDEX qa_models_tenant_idx ON public.qa_models(tenant_id);

DROP POLICY IF EXISTS "qa_models_read"  ON public.qa_models;
DROP POLICY IF EXISTS "qa_models_write" ON public.qa_models;
CREATE POLICY "qa_models_tenant" ON public.qa_models
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ─── qa_calls ───────────────────────────────────────────────────────────
ALTER TABLE public.qa_calls
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.qa_calls
  SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'asm-tech')
  WHERE tenant_id IS NULL;
ALTER TABLE public.qa_calls
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
CREATE INDEX qa_calls_tenant_idx ON public.qa_calls(tenant_id);

DROP POLICY IF EXISTS "qa_calls_read"  ON public.qa_calls;
DROP POLICY IF EXISTS "qa_calls_write" ON public.qa_calls;
CREATE POLICY "qa_calls_tenant" ON public.qa_calls
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ─── qa_human_feedback ──────────────────────────────────────────────────
ALTER TABLE public.qa_human_feedback
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.qa_human_feedback
  SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'asm-tech')
  WHERE tenant_id IS NULL;
ALTER TABLE public.qa_human_feedback
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
CREATE INDEX qa_human_feedback_tenant_idx ON public.qa_human_feedback(tenant_id);

DROP POLICY IF EXISTS "qa_human_feedback_read"  ON public.qa_human_feedback;
DROP POLICY IF EXISTS "qa_human_feedback_write" ON public.qa_human_feedback;
CREATE POLICY "qa_human_feedback_tenant" ON public.qa_human_feedback
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ─── qa_section_feedback ────────────────────────────────────────────────
ALTER TABLE public.qa_section_feedback
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.qa_section_feedback
  SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'asm-tech')
  WHERE tenant_id IS NULL;
ALTER TABLE public.qa_section_feedback
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
CREATE INDEX qa_section_feedback_tenant_idx ON public.qa_section_feedback(tenant_id);

DROP POLICY IF EXISTS "qa_section_feedback_read"  ON public.qa_section_feedback;
DROP POLICY IF EXISTS "qa_section_feedback_write" ON public.qa_section_feedback;
CREATE POLICY "qa_section_feedback_tenant" ON public.qa_section_feedback
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ─── qa_chat_sessions (per-user × tenant) ───────────────────────────────
ALTER TABLE public.qa_chat_sessions
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.qa_chat_sessions
  SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'asm-tech')
  WHERE tenant_id IS NULL;
ALTER TABLE public.qa_chat_sessions
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
CREATE INDEX qa_chat_sessions_tenant_idx ON public.qa_chat_sessions(tenant_id);

DROP POLICY IF EXISTS "qa_chat_sessions_own" ON public.qa_chat_sessions;
CREATE POLICY "qa_chat_sessions_own_tenant" ON public.qa_chat_sessions
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND user_id = auth.uid()
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND user_id = auth.uid()
  );

-- ─── qa_chat_messages (scoped via parent session) ───────────────────────
ALTER TABLE public.qa_chat_messages
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.qa_chat_messages
  SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'asm-tech')
  WHERE tenant_id IS NULL;
ALTER TABLE public.qa_chat_messages
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
CREATE INDEX qa_chat_messages_tenant_idx ON public.qa_chat_messages(tenant_id);

DROP POLICY IF EXISTS "qa_chat_messages_via_session" ON public.qa_chat_messages;
CREATE POLICY "qa_chat_messages_via_session_tenant" ON public.qa_chat_messages
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.qa_chat_sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.qa_chat_sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );


-- ─── 20260504220000_scouter_tenant_isolation.sql ─────────────────────────────────────────────
-- ============================================================================
-- Multi-tenant isolation for the scouter_* tables (Scouter Assist)
-- ============================================================================
-- Mirrors the qa_tenant_isolation migration for the scouter_* set:
-- adds tenant_id everywhere, backfills to ASM Tech, replaces the
-- previous permissive RLS with tenant-scoped policies.
--
-- Per-user tables (scouter_lead_favorites, scouter_notification_reads)
-- combine tenant scope AND auth.uid() so favorites/read-state stay
-- private to each user inside their tenant.

-- ─── scouter_companies ──────────────────────────────────────────────────
ALTER TABLE public.scouter_companies
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.scouter_companies
  SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'asm-tech')
  WHERE tenant_id IS NULL;
ALTER TABLE public.scouter_companies
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
CREATE INDEX scouter_companies_tenant_idx ON public.scouter_companies(tenant_id);

DROP POLICY IF EXISTS "scouter_companies_read"  ON public.scouter_companies;
DROP POLICY IF EXISTS "scouter_companies_write" ON public.scouter_companies;
CREATE POLICY "scouter_companies_tenant" ON public.scouter_companies
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ─── scouter_leads ──────────────────────────────────────────────────────
ALTER TABLE public.scouter_leads
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.scouter_leads
  SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'asm-tech')
  WHERE tenant_id IS NULL;
ALTER TABLE public.scouter_leads
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
CREATE INDEX scouter_leads_tenant_idx ON public.scouter_leads(tenant_id);

DROP POLICY IF EXISTS "scouter_leads_read"  ON public.scouter_leads;
DROP POLICY IF EXISTS "scouter_leads_write" ON public.scouter_leads;
CREATE POLICY "scouter_leads_tenant" ON public.scouter_leads
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ─── scouter_lead_favorites (per-user × tenant) ─────────────────────────
ALTER TABLE public.scouter_lead_favorites
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.scouter_lead_favorites
  SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'asm-tech')
  WHERE tenant_id IS NULL;
ALTER TABLE public.scouter_lead_favorites
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
CREATE INDEX scouter_lead_favorites_tenant_idx ON public.scouter_lead_favorites(tenant_id);

DROP POLICY IF EXISTS "scouter_lead_favorites_own" ON public.scouter_lead_favorites;
CREATE POLICY "scouter_lead_favorites_own_tenant" ON public.scouter_lead_favorites
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND user_id = auth.uid()
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND user_id = auth.uid()
  );

-- ─── scouter_jobs ───────────────────────────────────────────────────────
ALTER TABLE public.scouter_jobs
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.scouter_jobs
  SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'asm-tech')
  WHERE tenant_id IS NULL;
ALTER TABLE public.scouter_jobs
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
CREATE INDEX scouter_jobs_tenant_idx ON public.scouter_jobs(tenant_id);

DROP POLICY IF EXISTS "scouter_jobs_read"  ON public.scouter_jobs;
DROP POLICY IF EXISTS "scouter_jobs_write" ON public.scouter_jobs;
CREATE POLICY "scouter_jobs_tenant" ON public.scouter_jobs
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ─── scouter_apify_token_state ──────────────────────────────────────────
ALTER TABLE public.scouter_apify_token_state
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.scouter_apify_token_state
  SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'asm-tech')
  WHERE tenant_id IS NULL;
ALTER TABLE public.scouter_apify_token_state
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
CREATE INDEX scouter_apify_token_state_tenant_idx ON public.scouter_apify_token_state(tenant_id);

DROP POLICY IF EXISTS "scouter_apify_token_state_read"  ON public.scouter_apify_token_state;
DROP POLICY IF EXISTS "scouter_apify_token_state_write" ON public.scouter_apify_token_state;
CREATE POLICY "scouter_apify_token_state_tenant" ON public.scouter_apify_token_state
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ─── scouter_apify_budget ───────────────────────────────────────────────
ALTER TABLE public.scouter_apify_budget
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.scouter_apify_budget
  SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'asm-tech')
  WHERE tenant_id IS NULL;
ALTER TABLE public.scouter_apify_budget
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
CREATE INDEX scouter_apify_budget_tenant_idx ON public.scouter_apify_budget(tenant_id);

DROP POLICY IF EXISTS "scouter_apify_budget_read"  ON public.scouter_apify_budget;
DROP POLICY IF EXISTS "scouter_apify_budget_write" ON public.scouter_apify_budget;
CREATE POLICY "scouter_apify_budget_tenant" ON public.scouter_apify_budget
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ─── scouter_notifications ──────────────────────────────────────────────
ALTER TABLE public.scouter_notifications
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.scouter_notifications
  SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'asm-tech')
  WHERE tenant_id IS NULL;
ALTER TABLE public.scouter_notifications
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
CREATE INDEX scouter_notifications_tenant_idx ON public.scouter_notifications(tenant_id);

DROP POLICY IF EXISTS "scouter_notifications_read"  ON public.scouter_notifications;
DROP POLICY IF EXISTS "scouter_notifications_write" ON public.scouter_notifications;
CREATE POLICY "scouter_notifications_tenant" ON public.scouter_notifications
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

-- ─── scouter_notification_reads (per-user × tenant) ─────────────────────
ALTER TABLE public.scouter_notification_reads
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
UPDATE public.scouter_notification_reads
  SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'asm-tech')
  WHERE tenant_id IS NULL;
ALTER TABLE public.scouter_notification_reads
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id();
CREATE INDEX scouter_notification_reads_tenant_idx ON public.scouter_notification_reads(tenant_id);

DROP POLICY IF EXISTS "scouter_notification_reads_own" ON public.scouter_notification_reads;
CREATE POLICY "scouter_notification_reads_own_tenant" ON public.scouter_notification_reads
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND user_id = auth.uid()
  )
  WITH CHECK (
    tenant_id = public.current_tenant_id()
    AND user_id = auth.uid()
  );


COMMIT;
