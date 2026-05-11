-- ─── Tracking unificado de gasto en APIs externas ──────────────────────
-- Tabla api_usage_log + caps por provider — alimentan el subtab
-- "Control de Gasto" en Panel de Control.

CREATE TABLE IF NOT EXISTS public.api_usage_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     text NOT NULL,
  operation    text NOT NULL,
  model        text,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  units        jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_usd     numeric(10, 6) NOT NULL DEFAULT 0,
  context      jsonb NOT NULL DEFAULT '{}'::jsonb,
  tenant_id    uuid
);

CREATE INDEX IF NOT EXISTS idx_api_usage_log_provider_at
  ON public.api_usage_log (provider, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_log_at
  ON public.api_usage_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_log_tenant
  ON public.api_usage_log (tenant_id) WHERE tenant_id IS NOT NULL;

ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_usage_log_read" ON public.api_usage_log;
CREATE POLICY "api_usage_log_read"
  ON public.api_usage_log FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "api_usage_log_insert" ON public.api_usage_log;
CREATE POLICY "api_usage_log_insert"
  ON public.api_usage_log FOR INSERT TO authenticated, service_role WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.api_provider_caps (
  provider               text PRIMARY KEY,
  cost_usd_cap_monthly   numeric(10, 2) NOT NULL,
  amber_pct              int NOT NULL DEFAULT 50,
  red_pct                int NOT NULL DEFAULT 90,
  notes                  text,
  updated_at             timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.api_provider_caps (provider, cost_usd_cap_monthly, notes) VALUES
  ('anthropic',      50.00, 'Claude Sonnet 4.6 en qa-analyze + scouter-spam-account-scan'),
  ('elevenlabs',     30.00, 'Scribe STT en qa-transcribe (~150 horas/mes a $0.20/h)'),
  ('scrapecreators', 49.00, 'Discovery + enrich del scouter-worker (plan premium = $49/mes / 25k créditos)')
ON CONFLICT (provider) DO NOTHING;

ALTER TABLE public.api_provider_caps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_provider_caps_read" ON public.api_provider_caps;
CREATE POLICY "api_provider_caps_read"
  ON public.api_provider_caps FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "api_provider_caps_write" ON public.api_provider_caps;
CREATE POLICY "api_provider_caps_write"
  ON public.api_provider_caps FOR ALL TO authenticated USING (true) WITH CHECK (true);
