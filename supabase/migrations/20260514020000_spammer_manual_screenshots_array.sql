-- Migrar manual_screenshot_path (text único) a manual_screenshot_paths
-- (text[]) para permitir múltiples screenshots por cuenta restringida.
-- Conservamos la columna vieja temporalmente para backwards-compat — el
-- frontend ya no la escribe pero algunos scans antiguos podrían seguir
-- leyéndola hasta que también se actualicen.

ALTER TABLE public.scouter_spammer_accounts
  ADD COLUMN IF NOT EXISTS manual_screenshot_paths text[] NOT NULL DEFAULT '{}';

-- Backfill: copia el path único en un array de 1 elemento si la cuenta
-- ya tenía screenshot subido. Idempotente — no toca cuentas que ya
-- tengan algo en paths.
UPDATE public.scouter_spammer_accounts
SET manual_screenshot_paths = ARRAY[manual_screenshot_path]
WHERE manual_screenshot_path IS NOT NULL
  AND COALESCE(array_length(manual_screenshot_paths, 1), 0) = 0;

COMMENT ON COLUMN public.scouter_spammer_accounts.manual_screenshot_paths IS
  'Lista de paths en storage.scouter-screenshots con screenshots manuales del perfil. El scan los pasa a Claude vision para enriquecer el análisis.';
