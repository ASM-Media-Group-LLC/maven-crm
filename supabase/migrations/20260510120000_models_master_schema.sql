-- 20260510120000_models_master_schema.sql
--
-- Sprint 2 — paso 1 del refactor de identidad de modelos.
-- Ver docs/refactor-models-master.md para el contexto completo.
--
-- Esta migration es PURAMENTE ADITIVA: crea las tablas nuevas (`models`,
-- `model_phones`), agrega columnas `model_id` (nullable) a las 5 tablas
-- viejas, y monta los índices + RLS policies. NO mueve data, NO toca
-- columnas existentes, NO rompe ninguna query actual.
--
-- El backfill vive en una migration separada (20260510130000_*) que se
-- aplica después de validar que esta corre limpio.

-- ─── 1. Tabla canónica `models` ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.models (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
                  DEFAULT public.current_tenant_id(),

  -- Clave natural normalizada a lowercase + sin espacios.
  -- UNIQUE per tenant — futuro white-label permite la misma modelo en
  -- otra agencia sin colisión.
  instagram_handle text NOT NULL,

  -- Identidad display
  display_name    text,
  avatar_url      text,
  bio             text,
  is_verified     boolean,

  -- Geografía
  country         text,
  city            text,
  state           text,

  -- Otros perfiles (single-value: 90% de los casos)
  onlyfans_url    text,
  tiktok_handle   text,
  twitter_handle  text,

  -- Stats del scraper (último snapshot)
  followers_count int,
  posts_count     int,
  last_scraped_at timestamptz,

  -- Audit
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT models_handle_per_tenant UNIQUE (tenant_id, instagram_handle),
  CONSTRAINT models_handle_not_empty CHECK (length(trim(instagram_handle)) > 0)
);

CREATE INDEX IF NOT EXISTS models_tenant_idx
  ON public.models (tenant_id);

CREATE INDEX IF NOT EXISTS models_handle_lower_idx
  ON public.models (lower(instagram_handle));

CREATE INDEX IF NOT EXISTS models_country_idx
  ON public.models (country)
  WHERE country IS NOT NULL;

CREATE INDEX IF NOT EXISTS models_last_scraped_idx
  ON public.models (last_scraped_at)
  WHERE last_scraped_at IS NOT NULL;

-- Trigger para mantener updated_at sincronizado (patrón estándar Maven).
CREATE OR REPLACE FUNCTION public.tg_models_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_models_updated_at ON public.models;
CREATE TRIGGER trg_models_updated_at
  BEFORE UPDATE ON public.models
  FOR EACH ROW EXECUTE FUNCTION public.tg_models_set_updated_at();

-- RLS — patrón estándar de Maven: tenant_id = current_tenant_id().
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS models_tenant ON public.models;
CREATE POLICY models_tenant ON public.models
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.models TO authenticated;

-- ─── 2. Tabla `model_phones` (1-N con historial) ───────────────────────

CREATE TABLE IF NOT EXISTS public.model_phones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE
                  DEFAULT public.current_tenant_id(),
  model_id        uuid NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,

  -- E.164 normalizado (lo que usan WhatsApp / Twilio / etc.)
  phone_e164      text NOT NULL,
  -- Lo que escribió el agente original (audit trail).
  phone_raw       text,

  is_primary      boolean NOT NULL DEFAULT false,

  -- Procedencia: qué módulo capturó este número primero.
  source_module   text NOT NULL CHECK (source_module IN (
    'leadgen', 'scouter', 'closers_contacts', 'closer_creators', 'creators', 'manual'
  )),
  captured_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  captured_at     timestamptz NOT NULL DEFAULT now(),

  -- 'active' = phone vigente; 'replaced' = la modelo cambió de número;
  -- 'invalid' = el número está marcado como inválido (no responde / banneado).
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'replaced', 'invalid')),

  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT model_phones_unique UNIQUE (tenant_id, model_id, phone_e164),
  CONSTRAINT model_phones_e164_format CHECK (phone_e164 ~ '^\+?[0-9]{6,15}$')
);

CREATE INDEX IF NOT EXISTS model_phones_model_idx
  ON public.model_phones (model_id);

CREATE INDEX IF NOT EXISTS model_phones_phone_idx
  ON public.model_phones (phone_e164);

-- Solo un primary por modelo — partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS model_phones_one_primary
  ON public.model_phones (model_id)
  WHERE is_primary = true;

ALTER TABLE public.model_phones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS model_phones_tenant ON public.model_phones;
CREATE POLICY model_phones_tenant ON public.model_phones
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_phones TO authenticated;

-- ─── 3. Columnas `model_id` (nullable) en las 5 tablas viejas ──────────
--
-- Todas nullable durante la transición. Sprint 5 las pondrá NOT NULL
-- después de validar que el frontend completa migración.

ALTER TABLE public.leadgen_entries
  ADD COLUMN IF NOT EXISTS model_id uuid REFERENCES public.models(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS leadgen_entries_model_id_idx
  ON public.leadgen_entries (model_id) WHERE model_id IS NOT NULL;

ALTER TABLE public.scouter_leads
  ADD COLUMN IF NOT EXISTS model_id uuid REFERENCES public.models(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS scouter_leads_model_id_idx
  ON public.scouter_leads (model_id) WHERE model_id IS NOT NULL;

ALTER TABLE public.closers_contacts
  ADD COLUMN IF NOT EXISTS model_id uuid REFERENCES public.models(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS closers_contacts_model_id_idx
  ON public.closers_contacts (model_id) WHERE model_id IS NOT NULL;

ALTER TABLE public.closer_creators
  ADD COLUMN IF NOT EXISTS model_id uuid REFERENCES public.models(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS closer_creators_model_id_idx
  ON public.closer_creators (model_id) WHERE model_id IS NOT NULL;

ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS model_id uuid REFERENCES public.models(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS creators_model_id_idx
  ON public.creators (model_id) WHERE model_id IS NOT NULL;

-- ─── 4. Realtime publication ───────────────────────────────────────────
-- El frontend va a subscribir a UPDATEs de `models` para actualizar
-- avatares / nombres en vivo cuando el scraper enriquece data.

ALTER PUBLICATION supabase_realtime ADD TABLE public.models;
ALTER PUBLICATION supabase_realtime ADD TABLE public.model_phones;

-- REPLICA IDENTITY FULL: realtime delivery confiable para UPDATEs
-- (lecciones aprendidas del chatter evaluator — sin esto, eventos se
-- pueden droppear cuando RLS evalúa la new row).
ALTER TABLE public.models REPLICA IDENTITY FULL;
ALTER TABLE public.model_phones REPLICA IDENTITY FULL;
