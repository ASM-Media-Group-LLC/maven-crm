-- Vista agregada de costos del bot por grupo y mes. Lee api_usage_log
-- filtrado a operaciones whatsapp_*, junta el group_id desde el context jsonb,
-- y agrupa por (tenant_id, group_id, mes).
--
-- Se usa en el Panel de Control → WhatsApp Bot → tarjeta "Costos".

CREATE OR REPLACE VIEW public.whatsapp_costs_by_group_month AS
SELECT
  l.tenant_id,
  (l.context ->> 'group_id')::uuid                          AS group_id,
  date_trunc('month', l.occurred_at)::date                  AS month,
  COUNT(*)                                                  AS calls,
  SUM(l.cost_usd)                                           AS cost_usd,
  -- Breakdown por operación (texto, audio, imagen, agent)
  SUM(l.cost_usd) FILTER (WHERE l.operation = 'whatsapp_agent')               AS agent_cost,
  SUM(l.cost_usd) FILTER (WHERE l.operation = 'whatsapp_extract_commitments') AS extract_cost,
  SUM(l.cost_usd) FILTER (WHERE l.operation = 'whatsapp-transcribe-audio')    AS audio_cost,
  SUM(l.cost_usd) FILTER (WHERE l.operation = 'whatsapp-analyze-image')       AS image_cost,
  -- Breakdown agent por mode (auto = Haiku, mention = Sonnet)
  SUM(l.cost_usd) FILTER (WHERE l.operation = 'whatsapp_agent' AND l.context->>'invoked_by' = 'auto')    AS agent_auto_cost,
  SUM(l.cost_usd) FILTER (WHERE l.operation = 'whatsapp_agent' AND l.context->>'invoked_by' != 'auto' AND l.context ? 'invoked_by') AS agent_mention_cost
FROM public.api_usage_log l
WHERE l.operation LIKE 'whatsapp%'
  AND l.context ? 'group_id'
GROUP BY l.tenant_id, (l.context ->> 'group_id')::uuid, date_trunc('month', l.occurred_at);

COMMENT ON VIEW public.whatsapp_costs_by_group_month IS
  'Costos del bot de WhatsApp por grupo y mes, leyendo api_usage_log y agrupando por context.group_id. Se renderiza en Panel de Control → WhatsApp Bot.';

GRANT SELECT ON public.whatsapp_costs_by_group_month TO authenticated;
