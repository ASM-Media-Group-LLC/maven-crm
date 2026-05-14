-- RPC api_usage_summary(_from, _to): devuelve agregados server-side para el
-- dashboard Control de Gasto. Sustituye el SELECT directo de api_usage_log
-- que estaba siendo capeado a 1000 rows por PostgREST (default db-max-rows),
-- causando que los KPIs y el chart mostraran datos truncados / iguales sin
-- importar el rango elegido.
--
-- Devuelve tres "secciones" en un solo JSON para minimizar round-trips:
--   · totals: array {provider, calls, cost_usd}
--   · daily:  array {day, provider, cost_usd} para el line chart
--   · recent: array con las últimas 50 calls (no agregado, raw rows)

CREATE OR REPLACE FUNCTION public.api_usage_summary(
  _from timestamptz,
  _to timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounded AS (
    SELECT * FROM public.api_usage_log
    WHERE occurred_at >= _from AND occurred_at <= _to
  ),
  totals AS (
    SELECT provider,
           COUNT(*)::bigint AS calls,
           COALESCE(SUM(cost_usd), 0)::numeric AS cost_usd
    FROM bounded
    GROUP BY provider
  ),
  daily AS (
    SELECT (occurred_at AT TIME ZONE 'UTC')::date::text AS day,
           provider,
           COALESCE(SUM(cost_usd), 0)::numeric AS cost_usd
    FROM bounded
    GROUP BY 1, 2
    ORDER BY 1
  ),
  recent AS (
    SELECT provider, occurred_at, cost_usd, operation, model
    FROM bounded
    ORDER BY occurred_at DESC
    LIMIT 50
  )
  SELECT jsonb_build_object(
    'totals', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM totals t), '[]'::jsonb),
    'daily',  COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM daily d),  '[]'::jsonb),
    'recent', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM recent r), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.api_usage_summary(timestamptz, timestamptz) TO authenticated;
