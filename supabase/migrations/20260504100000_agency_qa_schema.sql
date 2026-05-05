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
