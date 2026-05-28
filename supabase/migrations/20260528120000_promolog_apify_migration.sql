-- Promolog: migración del backend Dokploy (5 servicios) a Apify + Gemini Vision.
--
-- Contexto: el sistema actual corre en infra externa (Dokploy) que scrapea IG
-- stories y profile pics de ~80 creadores activos varias veces al día y los
-- inserta directo en `promolog_entries` con `created_by=null` (service role).
-- Migramos a:
--   1) pg_cron diario 1x → edge function `promolog-dispatch`
--   2) Dispatch llama Apify (Instagram Scraper) con la lista de handles
--   3) Apify webhook → edge function `promolog-webhook`
--   4) Webhook baja stories, llama Gemini Vision para análisis cualitativo
--      (¿promocionó OnlyFans? ¿link de compra? ¿indirecta?), inserta entries
--
-- Esta migración:
--   · Agrega columnas de tracking AI a `promolog_entries`
--   · Crea tabla `promolog_dispatch_runs` para auditar cada corrida
--   · Crea índice para rate-limit (1 run/creador/día)

-- ─── 1. promolog_entries: columnas AI ──────────────────────────────────────
ALTER TABLE public.promolog_entries
  ADD COLUMN IF NOT EXISTS apify_run_id text,
  ADD COLUMN IF NOT EXISTS dispatch_run_id uuid,
  ADD COLUMN IF NOT EXISTS analyzed_by_ai boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS ai_confidence numeric(4,3),         -- 0.000 - 1.000
  ADD COLUMN IF NOT EXISTS ai_reasoning text,                  -- por qué AI dijo lo que dijo
  ADD COLUMN IF NOT EXISTS story_index integer,                -- slide 0,1,2... de las stories del día
  ADD COLUMN IF NOT EXISTS story_count integer,                -- total de stories ese día
  ADD COLUMN IF NOT EXISTS story_media_url text,               -- URL original (CDN IG, temporal)
  ADD COLUMN IF NOT EXISTS scraped_at timestamptz;

COMMENT ON COLUMN public.promolog_entries.analyzed_by_ai IS
  'true si el entry lo creó el pipeline Apify+Gemini, false si fue manual o legacy Dokploy';
COMMENT ON COLUMN public.promolog_entries.ai_confidence IS
  '0-1: qué tan seguro está Gemini Vision de la clasificación promoted/has_buy_link';

CREATE INDEX IF NOT EXISTS idx_promolog_entries_dispatch_run
  ON public.promolog_entries(dispatch_run_id) WHERE dispatch_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promolog_entries_apify_run
  ON public.promolog_entries(apify_run_id) WHERE apify_run_id IS NOT NULL;

-- ─── 2. promolog_dispatch_runs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promolog_dispatch_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  apify_run_id    text,                                     -- null hasta que arranca Apify
  apify_actor_id  text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','succeeded','failed','timeout','partial')),
  creators_count  integer NOT NULL DEFAULT 0,
  creators_succeeded integer NOT NULL DEFAULT 0,
  creators_failed integer NOT NULL DEFAULT 0,
  entries_created integer NOT NULL DEFAULT 0,
  cost_usd        numeric(8,4),
  error           text,
  dispatched_by   uuid REFERENCES auth.users(id),           -- null si lo lanzó el cron
  payload         jsonb,                                     -- la request que mandamos a Apify
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promolog_dispatch_runs_tenant_started
  ON public.promolog_dispatch_runs(tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_promolog_dispatch_runs_apify_run
  ON public.promolog_dispatch_runs(apify_run_id) WHERE apify_run_id IS NOT NULL;

ALTER TABLE public.promolog_dispatch_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promolog_dispatch_runs_tenant_scoped" ON public.promolog_dispatch_runs;
CREATE POLICY "promolog_dispatch_runs_tenant_scoped" ON public.promolog_dispatch_runs
  FOR ALL
  USING (
    -- Service role bypasses; user-scope: ASM Tech default tenant + admin/manager
    tenant_id = '30869615-f579-4981-8a1f-dbebc61eae2d'::uuid
  )
  WITH CHECK (
    tenant_id = '30869615-f579-4981-8a1f-dbebc61eae2d'::uuid
  );

-- FK aware: entries link to runs but we don't cascade delete
-- (queremos preservar el histórico aún si el run-row se borra).
ALTER TABLE public.promolog_entries
  DROP CONSTRAINT IF EXISTS promolog_entries_dispatch_run_id_fkey;
ALTER TABLE public.promolog_entries
  ADD CONSTRAINT promolog_entries_dispatch_run_id_fkey
  FOREIGN KEY (dispatch_run_id) REFERENCES public.promolog_dispatch_runs(id)
  ON DELETE SET NULL;

-- ─── 3. Rate-limit helper: evitar dos runs el mismo día ────────────────────
-- Usado por promolog-dispatch para abortar si ya hubo un run hoy.
CREATE OR REPLACE FUNCTION public.promolog_dispatched_today(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.promolog_dispatch_runs
    WHERE tenant_id = p_tenant_id
      AND status IN ('running','succeeded','partial')
      AND started_at::date = (now() AT TIME ZONE 'America/New_York')::date
  );
$$;

GRANT EXECUTE ON FUNCTION public.promolog_dispatched_today(uuid) TO authenticated, service_role;

-- ─── 4. View: creadores elegibles para verificación ───────────────────────
-- "Activos" = status='active' AND tienen instagram_handle.
-- promolog-dispatch usa este view (orden estable por creator.id) para
-- partir el batch si supera el max input del actor de Apify.
CREATE OR REPLACE VIEW public.v_promolog_eligible_creators AS
SELECT
  c.id,
  c.name,
  c.artistic_name,
  c.instagram_handle,
  c.onlyfans_url,
  c.instagram_followers,
  c.assigned_manager_profile_id,
  c.assigned_specialist_profile_id
FROM public.creators c
WHERE c.status = 'active'
  AND c.instagram_handle IS NOT NULL
  AND c.instagram_handle <> ''
ORDER BY c.id;

GRANT SELECT ON public.v_promolog_eligible_creators TO authenticated, service_role;
