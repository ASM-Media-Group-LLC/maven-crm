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
