-- ============================================================================
-- Chatter public access — Phase 5
-- ============================================================================
-- The chatter (aspirante) visits /chatter/<sessionId> without a Maven account.
-- They need to read & write to their session's messages directly so realtime
-- works without polling. We grant scoped anon access:
--
--   - SELECT a single chatter_session by id, only if it isn't ended
--   - SELECT chatter_messages whose session is open
--   - SELECT the chatter_profile referenced by an open session (so the
--     chatter can render the model's avatar/name)
--   - SELECT chatter_config (for fan_name + fan_avatar_url, since the
--     chatter sees the fan persona; no secrets here)
--   - UPDATE typing/read columns on their session
--
-- Inserting messages still goes through the chatter-public edge function
-- (so we can enforce role='chatter' and prevent abuse). RLS for INSERT
-- stays restricted to authenticated users.
--
-- Idempotent: drops the policies before recreating, so this script can be
-- safely re-run if a prior attempt half-applied.

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON public.chatter_sessions          TO anon;
GRANT SELECT ON public.chatter_messages          TO anon;
GRANT SELECT ON public.chatter_profiles          TO anon;
GRANT SELECT ON public.chatter_config            TO anon;
GRANT UPDATE (typing_chatter, typing_chatter_at, read_by_chatter_at)
  ON public.chatter_sessions TO anon;

-- ---- chatter_sessions ----
DROP POLICY IF EXISTS chatter_sessions_anon_read          ON public.chatter_sessions;
DROP POLICY IF EXISTS chatter_sessions_anon_update_typing ON public.chatter_sessions;

CREATE POLICY chatter_sessions_anon_read ON public.chatter_sessions
  FOR SELECT TO anon
  USING (status <> 'ended');

CREATE POLICY chatter_sessions_anon_update_typing ON public.chatter_sessions
  FOR UPDATE TO anon
  USING (status <> 'ended')
  WITH CHECK (status <> 'ended');

-- ---- chatter_messages ----
-- Note: explicit table-qualified column names so Postgres doesn't try to
-- resolve `session_id` against the inner subquery's table.
DROP POLICY IF EXISTS chatter_messages_anon_read ON public.chatter_messages;

CREATE POLICY chatter_messages_anon_read ON public.chatter_messages
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.chatter_sessions s
      WHERE s.id = chatter_messages.session_id
        AND s.status <> 'ended'
    )
  );

-- ---- chatter_profiles ----
-- Explicit chatter_profiles.id qualification (otherwise Postgres tries to
-- match s.profile_id [uuid] = s.id [text from sessions] and explodes).
DROP POLICY IF EXISTS chatter_profiles_anon_read ON public.chatter_profiles;

CREATE POLICY chatter_profiles_anon_read ON public.chatter_profiles
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.chatter_sessions s
      WHERE s.profile_id = chatter_profiles.id
        AND s.status <> 'ended'
    )
  );

-- ---- chatter_config ----
DROP POLICY IF EXISTS chatter_config_anon_read ON public.chatter_config;

CREATE POLICY chatter_config_anon_read ON public.chatter_config
  FOR SELECT TO anon USING (true);

-- ============================================================================
-- Realtime: ensure profile changes propagate to anon (other tables already
-- in supabase_realtime publication via the initial migration).
-- ============================================================================
-- chatter_sessions and chatter_messages were already added in the initial
-- schema; nothing to do here. profiles and config are admin-managed and
-- don't need realtime updates for the chatter view (one-time fetch is fine).
