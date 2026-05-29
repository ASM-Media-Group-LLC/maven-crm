-- profile_analyses — análisis deep on-demand de perfiles de IG.
--
-- Se dispara cuando un closer/owner pide en el bot de WhatsApp
-- "@maven analizame a @<handle>". El bot llama tool analyze_profile_deep
-- que invoca la edge function scrape-profile-deep, que orquesta:
--   1. Apify Instagram Scraper (stories del handle, últimos 12)
--   2. OpenRouter Gemini Vision para analizar cada story
--   3. Generación de estrategia de venta combinando análisis + catálogo
--
-- Costo aprox por análisis: $0.05 Apify + $0.01 Gemini ≈ $0.06.
--
-- Rate limit: 1 análisis por handle cada 24h (devuelve cached si pidieron
-- antes). Sin tenant cap por ahora (lo agregamos cuando explote uso).

CREATE TABLE IF NOT EXISTS profile_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Trazabilidad: quién pidió y desde dónde
  requested_by_display_name text,                  -- "Miguel Garcia" — más fácil de leer en logs
  requested_by_member_id uuid REFERENCES whatsapp_members(id) ON DELETE SET NULL,
  source_message_id uuid REFERENCES whatsapp_messages(id) ON DELETE SET NULL,
  source_group_id uuid REFERENCES whatsapp_groups(id) ON DELETE SET NULL,
  context text,                                    -- razón del pedido ("ya rechazó kash, vendele saas")

  -- Input
  instagram_handle text NOT NULL,                  -- normalizado (sin @, lowercase, sin URL)

  -- Estado del job
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','complete','failed','timeout')),
  apify_run_id text,
  apify_dataset_id text,

  -- Output structured
  profile jsonb,                                   -- { followers, posts_count, bio, linktree_url, is_verified, ... }
  stories_analysis jsonb,                          -- array de { story_index, media_url, promoted, promotion_type, confidence, reasoning, has_buy_link, buy_link_type, platform_mentioned }
  signals jsonb,                                   -- { has_agency_signals, has_tracker, leak_risk, paywall_strength, quality_estimate }
  strategy text,                                   -- texto markdown con la estrategia recomendada que el bot va a leer

  -- Telemetry
  stories_count integer DEFAULT 0,
  cost_usd numeric(10,4),
  duration_seconds integer,
  error text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Índice para rate-limit "1 por handle / 24h" — consulta típica:
-- WHERE instagram_handle = $1 AND created_at > NOW() - INTERVAL '24h'
CREATE INDEX IF NOT EXISTS idx_profile_analyses_handle_time
  ON profile_analyses (instagram_handle, created_at DESC);

-- Índice para polling de jobs colgados (status queued/running viejos)
CREATE INDEX IF NOT EXISTS idx_profile_analyses_status_pending
  ON profile_analyses (status, created_at)
  WHERE status IN ('queued','running');

-- Tenant scoping
CREATE INDEX IF NOT EXISTS idx_profile_analyses_tenant
  ON profile_analyses (tenant_id, created_at DESC);

-- RLS
ALTER TABLE profile_analyses ENABLE ROW LEVEL SECURITY;

-- Política: usuarios autenticados del tenant pueden leer todo de su tenant.
-- Insertar/update lo hace solo el service_role (las edge functions).
DROP POLICY IF EXISTS "tenant_select" ON profile_analyses;
CREATE POLICY "tenant_select" ON profile_analyses
  FOR SELECT
  USING (tenant_id = current_tenant_id());

COMMENT ON TABLE profile_analyses IS 'Análisis deep on-demand de perfiles de IG con Apify + Gemini Vision. Triggered desde whatsapp-agent tool analyze_profile_deep.';
COMMENT ON COLUMN profile_analyses.stories_analysis IS 'array de {story_index, media_url, promoted, promotion_type, confidence, reasoning, has_buy_link, buy_link_type, platform_mentioned}';
COMMENT ON COLUMN profile_analyses.signals IS 'agregado: {has_agency_signals, has_tracker, leak_risk, paywall_strength, quality_estimate}';
COMMENT ON COLUMN profile_analyses.strategy IS 'texto markdown que el bot lee y postea al grupo';
