-- Ventas de SOPHIE (la AI chatter de BLU; interno "persona-pro") — pedido de Grace
-- 07/08 vía Jhon. Aplicado en prod vía MCP como: sophie_daily_stats + sophie_tool_manuales.
--
-- FUENTE: contrato sacado del bundle de la app de escritorio de BLU (no hay REST):
-- el mismo WS del blu-bridge (wss://of.unlok.me/) acepta
--   {type:"persona-pro-stats-rollup", modelIds:"all", from, to} → {data:{models:[...]}}
--   {type:"persona-pro-stats-dashboard", modelId, from, to}     → detalle por modelo
-- El bridge (infra/blu-bridge) pide el rollup POR DÍA en ambas cuentas (plus/massive)
-- y upserta acá. `raw` guarda la fila cruda del rollup: el mapeo de campos es
-- defensivo (aiSales/salesValue/sales) hasta confirmar el shape con la 1ª corrida.
CREATE TABLE IF NOT EXISTS public.sophie_daily_stats (
  date date NOT NULL,
  account text NOT NULL,               -- 'plus' | 'massive'
  blu_model_id bigint NOT NULL,
  model_name text,
  username text,
  ai_sales numeric NOT NULL DEFAULT 0,
  ai_messages integer NOT NULL DEFAULT 0,
  raw jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, account, blu_model_id)
);
ALTER TABLE public.sophie_daily_stats ENABLE ROW LEVEL SECURITY;  -- solo service role

-- Bot: tool get_sophie_sales (inline en whatsapp-agent) — total/por día/por cuenta/
-- top modelos. Manual de Clari += sección; allowlist de Managers += la tool.
-- ⚠️ OPERATIVO: el blu-bridge corre en Dokploy — este cambio requiere REDEPLOY
-- manual del servicio blu-bridge para que empiece a sincronizar Sophie.
select 1;
