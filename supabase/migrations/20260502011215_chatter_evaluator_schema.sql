-- ============================================================================
-- Chatter Evaluator — schema initial
-- ============================================================================
-- Native Maven implementation of the standalone Roleplaychatters app.
-- Shared resources (profiles, vault, criteria, config) are global across all
-- examiners. Sessions / messages / evaluations are per-examiner and isolated
-- via RLS using the existing user_roles / role_permissions infrastructure.

-- ----------------------------------------------------------------------------
-- 0. PREREQ: updated_at trigger function (idempotent — already exists in prod
--    but Supabase branches don't always inherit functions; CREATE OR REPLACE
--    is safe regardless).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. SHARED: profiles (Annie, Camila, Ferp, Julieta, Michelle + futuros)
-- ----------------------------------------------------------------------------
CREATE TABLE public.chatter_profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text UNIQUE NOT NULL,                  -- 'annie', 'camila', etc.
  name        text NOT NULL,
  name_en     text,
  -- Bilingual bio fields
  nationality      text,    nationality_en   text,
  location         text,    location_en      text,
  age              text,    age_en           text,
  greeting         text,    greeting_en      text,
  users_term       text,    users_term_en    text,   -- "babe", "babyy" forms of address
  body             text,    body_en          text,
  nudity           text,    nudity_en        text,
  anal             text,    anal_en          text,
  collabs          text,    collabs_en       text,
  videocall        text,    videocall_en     text,
  custom           text,    custom_en        text,
  extra            text,    extra_en         text,
  -- Pricing dictionary {service_name: price_string}
  prices      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Catch-all for additional dynamic fields the admin may add at runtime
  extra_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Avatar
  avatar_url   text,
  avatar_x     int  DEFAULT 50,
  avatar_y     int  DEFAULT 50,
  avatar_zoom  int  DEFAULT 100,
  -- Audit
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER chatter_profiles_updated_at
  BEFORE UPDATE ON public.chatter_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 2. SHARED: vault items (~300 image/video items per profile today)
-- ----------------------------------------------------------------------------
CREATE TABLE public.chatter_vault_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES public.chatter_profiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  url         text NOT NULL,
  media_type  text CHECK (media_type IN ('image','video','other')) DEFAULT 'image',
  position    int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chatter_vault_profile ON public.chatter_vault_items(profile_id, position);

-- ----------------------------------------------------------------------------
-- 3. SHARED: evaluation criteria (10 default + admin-managed extras)
-- ----------------------------------------------------------------------------
CREATE TABLE public.chatter_criteria_defaults (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label      text NOT NULL,
  label_en   text,
  weight     numeric NOT NULL DEFAULT 1,
  position   int NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. SHARED: singleton config (emails, apps script URL, JavixBuster identity)
-- ----------------------------------------------------------------------------
CREATE TABLE public.chatter_config (
  id                    int PRIMARY KEY DEFAULT 1,
  apps_script_url       text,
  notification_emails   text[] NOT NULL DEFAULT '{}',
  -- JavixBuster (the simulated fan, global identity for all examiners)
  fan_name              text NOT NULL DEFAULT 'JavixBuster',
  fan_avatar_url        text NOT NULL DEFAULT '/JavixBuster.png',
  fan_avatar_url_light  text,                                   -- optional light-mode variant
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chatter_config_singleton CHECK (id = 1)
);

INSERT INTO public.chatter_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER chatter_config_updated_at
  BEFORE UPDATE ON public.chatter_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5. PER-EXAMINER: sessions
-- ----------------------------------------------------------------------------
-- Short text PK (e.g. 'DMZMCB') for clean public URLs /s/<id>
CREATE TABLE public.chatter_sessions (
  id                       text PRIMARY KEY,
  examiner_user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  examiner_name            text,
  profile_id               uuid NOT NULL REFERENCES public.chatter_profiles(id),
  chatter_name             text NOT NULL,
  status                   text NOT NULL DEFAULT 'waiting'
                                CHECK (status IN ('waiting','active','ended')),
  duration_minutes         int NOT NULL DEFAULT 60,
  started_at               timestamptz,
  ended_at                 timestamptz,
  expires_at               timestamptz,
  -- Device lock (chatter side)
  active_device_id         text,
  active_device_claimed_at timestamptz,
  -- Typing indicators
  typing_chatter           boolean NOT NULL DEFAULT false,
  typing_fan               boolean NOT NULL DEFAULT false,
  typing_chatter_at        timestamptz,
  typing_fan_at            timestamptz,
  -- Read markers
  read_by_chatter_at       timestamptz,
  read_by_examiner_at      timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chatter_sessions_examiner ON public.chatter_sessions(examiner_user_id, created_at DESC);
CREATE INDEX idx_chatter_sessions_status   ON public.chatter_sessions(status) WHERE status <> 'ended';

-- ----------------------------------------------------------------------------
-- 6. PER-SESSION: messages
-- ----------------------------------------------------------------------------
CREATE TABLE public.chatter_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    text NOT NULL REFERENCES public.chatter_sessions(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('fan','chatter','system')),
  msg_type      text NOT NULL DEFAULT 'message'
                  CHECK (msg_type IN ('message','tip','purchase','notice')),
  content       text,
  price         numeric,                              -- for tip / purchase
  images        text[] NOT NULL DEFAULT '{}',
  deleted       text CHECK (deleted IN ('chatter','full') OR deleted IS NULL),
  from_examiner boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chatter_messages_session ON public.chatter_messages(session_id, created_at);

-- ----------------------------------------------------------------------------
-- 7. PER-SESSION: evaluations (criteria results + verdict + feedback)
-- ----------------------------------------------------------------------------
CREATE TABLE public.chatter_evaluations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          text NOT NULL UNIQUE
                          REFERENCES public.chatter_sessions(id) ON DELETE CASCADE,
  examiner_user_id    uuid NOT NULL REFERENCES auth.users(id),
  examiner_name       text,
  verdict             text NOT NULL CHECK (verdict IN ('apto','no_apto')),
  feedback            text,
  -- [{ label, status: 'pass'|'partial'|'fail' }, ...]
  criteria_results    jsonb NOT NULL DEFAULT '[]'::jsonb,
  score_pct           numeric,
  sent_to_apps_script boolean NOT NULL DEFAULT false,
  sent_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.chatter_profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatter_vault_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatter_criteria_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatter_config            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatter_sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatter_messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatter_evaluations       ENABLE ROW LEVEL SECURITY;

-- Helper: does the current user have access to the Chatters module?
-- Anyone with Chatters access can edit shared resources (profiles, vault,
-- criteria, config) — same flat permission model as the original
-- Roleplaychatters app where any logged-in user could edit anything.
CREATE OR REPLACE FUNCTION public.has_chatters_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Admin always
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR
    -- Or has explicit Chatters module permission via role config
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles_config rc
        ON rc.name = ur.role::text AND rc.is_active = true
      JOIN public.role_permissions rp ON rp.role_id = rc.id
      WHERE ur.user_id = auth.uid()
        AND rp.module = 'Chatters'
        AND rp.can_access = true
    )
$$;

-- ---- chatter_profiles: read for any authenticated, write for admin/manager
CREATE POLICY chatter_profiles_read ON public.chatter_profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY chatter_profiles_write ON public.chatter_profiles
  FOR ALL TO authenticated
  USING (public.has_chatters_access())
  WITH CHECK (public.has_chatters_access());

-- ---- chatter_vault_items: same pattern
CREATE POLICY chatter_vault_read ON public.chatter_vault_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY chatter_vault_write ON public.chatter_vault_items
  FOR ALL TO authenticated
  USING (public.has_chatters_access())
  WITH CHECK (public.has_chatters_access());

-- ---- chatter_criteria_defaults: same pattern
CREATE POLICY chatter_criteria_read ON public.chatter_criteria_defaults
  FOR SELECT TO authenticated USING (true);
CREATE POLICY chatter_criteria_write ON public.chatter_criteria_defaults
  FOR ALL TO authenticated
  USING (public.has_chatters_access())
  WITH CHECK (public.has_chatters_access());

-- ---- chatter_config: same pattern (read all, write admin/manager)
CREATE POLICY chatter_config_read ON public.chatter_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY chatter_config_write ON public.chatter_config
  FOR ALL TO authenticated
  USING (public.has_chatters_access())
  WITH CHECK (public.has_chatters_access());

-- ---- chatter_sessions: examiner sees own; admin sees all
CREATE POLICY chatter_sessions_read ON public.chatter_sessions
  FOR SELECT TO authenticated
  USING (
    examiner_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
CREATE POLICY chatter_sessions_insert ON public.chatter_sessions
  FOR INSERT TO authenticated
  WITH CHECK (examiner_user_id = auth.uid());
CREATE POLICY chatter_sessions_update ON public.chatter_sessions
  FOR UPDATE TO authenticated
  USING (
    examiner_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
CREATE POLICY chatter_sessions_delete ON public.chatter_sessions
  FOR DELETE TO authenticated
  USING (examiner_user_id = auth.uid());

-- ---- chatter_messages: tied to session ownership
CREATE POLICY chatter_messages_read ON public.chatter_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chatter_sessions s
      WHERE s.id = session_id
      AND (
        s.examiner_user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
      )
    )
  );
CREATE POLICY chatter_messages_write ON public.chatter_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chatter_sessions s
      WHERE s.id = session_id AND s.examiner_user_id = auth.uid()
    )
  );
CREATE POLICY chatter_messages_update ON public.chatter_messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chatter_sessions s
      WHERE s.id = session_id AND s.examiner_user_id = auth.uid()
    )
  );

-- ---- chatter_evaluations: examiner manages own
CREATE POLICY chatter_evaluations_read ON public.chatter_evaluations
  FOR SELECT TO authenticated
  USING (
    examiner_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
CREATE POLICY chatter_evaluations_insert ON public.chatter_evaluations
  FOR INSERT TO authenticated
  WITH CHECK (examiner_user_id = auth.uid());
CREATE POLICY chatter_evaluations_update ON public.chatter_evaluations
  FOR UPDATE TO authenticated
  USING (examiner_user_id = auth.uid());

-- ============================================================================
-- REALTIME
-- ============================================================================
-- Enable realtime on session-scoped tables so the examiner UI and the chatter
-- view (via edge function proxy) stay in sync without polling.
ALTER PUBLICATION supabase_realtime ADD TABLE public.chatter_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chatter_messages;

-- ============================================================================
-- NOTES (intentional gaps to be filled in later phases)
-- ============================================================================
-- 1. Public chatter access (no auth, /s/<sessionId>) is NOT yet handled here.
--    Phase 5 will add an edge function `chatter-session-access` that:
--      - validates sessionId + device lock
--      - issues a short-lived JWT scoped to that session
--      - the chatter client uses that JWT for read/write to messages
--    Additional RLS policies will be appended at that time, gated on the JWT
--    claim `session_id` matching the row's session_id.
--
-- 2. Apps Script integration stays as-is (existing webhook in chatter_config).
--    Phase 4 will trigger it from a Maven edge function instead of inline JS.
--
-- 3. Storage bucket `chatter-vault` for media will be created separately
--    (Supabase dashboard or another migration) and is not part of this DDL.
