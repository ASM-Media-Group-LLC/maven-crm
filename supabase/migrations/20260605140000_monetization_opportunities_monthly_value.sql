-- Columna de monto en monetization_opportunities, para poder ordenar/priorizar
-- las oportunidades por plata (un cierre de $24k no puede verse igual que uno de $120).
-- Para agency/exchange = facturación mensual de la creadora; para productos = precio del plan.

ALTER TABLE public.monetization_opportunities
  ADD COLUMN IF NOT EXISTS monthly_value_usd numeric;

COMMENT ON COLUMN public.monetization_opportunities.monthly_value_usd IS
  'Valor mensual estimado de la oportunidad en USD (facturacion de la creadora para agency/exchange, o precio del plan para productos). Para ordenar/priorizar por monto. Lo cargan humanos en la pantalla o el bot via log_monetization_opportunity.';
