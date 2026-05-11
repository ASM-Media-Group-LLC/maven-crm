-- Flag de "restricted" para cuentas spammer.
-- IG aplica el restricted-flag automáticamente a cuentas que detecta
-- como adult/spam/reportadas, ocultándolas a viewers no-loggeados.
-- Para el caso de Maven: si la cuenta de la AGENCIA que usamos para
-- outreach está restricted, las creators target no pueden verla sin
-- estar logueadas → deal-breaker para scouting.
--
-- Lo seteamos en la edge function scouter-spam-account-scan cuando
-- ScrapeCreators devuelve isRestricted:true o errorStatus 404 con
-- mensaje "Profile is restricted".

ALTER TABLE public.scouter_spammer_accounts
  ADD COLUMN IF NOT EXISTS is_restricted boolean;

COMMENT ON COLUMN public.scouter_spammer_accounts.is_restricted IS
  'true si IG aplicó el restricted-flag (cuenta oculta a no-loggeados). Deal-breaker para outreach.';
