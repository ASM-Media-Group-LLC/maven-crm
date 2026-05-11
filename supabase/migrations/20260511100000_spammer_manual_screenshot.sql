-- Path en scouter-screenshots bucket donde el user subió un screenshot
-- del perfil de la cuenta restringida. Cuando IG bloquea el scrape, el
-- user toma screenshot logueado del perfil (que sí ve) y lo pega acá;
-- la edge function lo manda a Claude vision para extraer bio + nombre +
-- followers + link + posts + verified, y corre el análisis con esa
-- data real en vez del snapshot vacío.

ALTER TABLE public.scouter_spammer_accounts
  ADD COLUMN IF NOT EXISTS manual_screenshot_path text;

COMMENT ON COLUMN public.scouter_spammer_accounts.manual_screenshot_path IS
  'Path en bucket scouter-screenshots. Usado para cuentas restricted que IG oculta a scrapers — el user sube screenshot logueado y Claude vision extrae la data.';
