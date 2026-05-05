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
