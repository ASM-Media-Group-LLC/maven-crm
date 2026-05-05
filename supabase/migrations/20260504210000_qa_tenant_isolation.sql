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
