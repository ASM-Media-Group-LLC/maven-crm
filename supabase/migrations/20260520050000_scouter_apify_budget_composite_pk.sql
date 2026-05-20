-- Fix de PK en scouter_apify_budget.
--
-- Bug: la tabla se creó con PRIMARY KEY (day) en
-- 20260504110000_scouter_assist_schema.sql, antes de la migración de
-- tenant isolation. Cuando 20260504220000_scouter_tenant_isolation.sql
-- agregó la columna tenant_id, NO actualizó el PK, así que quedó como
-- "una sola row por día, total" — no "una row por (día, tenant)".
--
-- El worker hace `upsert(..., { onConflict: "day,tenant_id" })`. Como
-- no existe unique constraint sobre (day, tenant_id), Postgres devuelve
-- 42P10 "there is no unique or exclusion constraint matching the ON
-- CONFLICT specification" y el upsert falla. Resultado: scouter_apify_budget
-- nunca tiene rows, items_processed siempre es 0, y el daily cap de
-- ScrapeCreators (870 requests / día) NUNCA se enforz a — el worker
-- gasta sin tope.
--
-- Fix: drop del PK por (day) y create PK compuesto (day, tenant_id).
-- La tabla está vacía (verificado en producción), así que el cambio es
-- trivial y no requiere migración de data.

ALTER TABLE public.scouter_apify_budget
  DROP CONSTRAINT scouter_apify_budget_pkey;

ALTER TABLE public.scouter_apify_budget
  ADD CONSTRAINT scouter_apify_budget_pkey PRIMARY KEY (day, tenant_id);

COMMENT ON CONSTRAINT scouter_apify_budget_pkey ON public.scouter_apify_budget IS
  'PK compuesto (day, tenant_id) — necesario para que recordSpend en '
  'scouter-worker pueda hacer upsert ON CONFLICT (day, tenant_id).';
