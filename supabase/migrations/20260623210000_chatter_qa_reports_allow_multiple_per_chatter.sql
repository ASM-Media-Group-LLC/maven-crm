-- Permitir VARIOS QA cualitativos por chatter en el mismo mes/compañía.
-- Antes había unique(chatter_name, company, period) → el 2do reporte del mismo chatter
-- (p.ej. para otro set de modelos, o una re-evaluación) fallaba con duplicate key.
-- Ya aplicado en prod vía MCP el 2026-06-23; este archivo deja la versión en el repo.
ALTER TABLE public.chatter_qa_reports
  DROP CONSTRAINT IF EXISTS chatter_qa_reports_chatter_name_company_period_key;
