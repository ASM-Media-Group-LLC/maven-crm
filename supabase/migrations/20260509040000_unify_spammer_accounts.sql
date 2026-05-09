-- 20260509040000_unify_spammer_accounts.sql
--
-- PR #122 creó una tabla `scouter_spam_accounts` (sin la doble m)
-- pensando que era nueva, sin darnos cuenta que ya existía
-- `scouter_spammer_accounts` (con doble m) usada por la sección
-- "Cuentas Spammer" del Settings de Scouter Assist. Resultado: el
-- Panel de control leía la tabla equivocada y aparecía vacío aunque
-- los spammers ya hubieran cargado cuentas.
--
-- Esta migration:
--   1. Agrega las columnas del scan IA a la tabla CORRECTA
--      (scouter_spammer_accounts).
--   2. Borra la tabla redundante scouter_spam_accounts (estaba vacía,
--      no hay data que perder).
--
-- Las migrations 20260509020000 y 20260509030000 quedan obsoletas
-- pero se preservan en el historial; si en algún momento se restaura
-- desde scratch, todo queda en estado correcto al final.

-- ─── 1. Extender scouter_spammer_accounts con campos del scan IA ─────
ALTER TABLE public.scouter_spammer_accounts
  ADD COLUMN IF NOT EXISTS following_count    int,
  ADD COLUMN IF NOT EXISTS posts_count        int,
  ADD COLUMN IF NOT EXISTS is_verified        boolean,
  ADD COLUMN IF NOT EXISTS ai_score           int,
  ADD COLUMN IF NOT EXISTS ai_analysis        jsonb,
  ADD COLUMN IF NOT EXISTS last_scanned_at    timestamptz,
  -- Estado del scan: pending | scanning | done | failed.
  ADD COLUMN IF NOT EXISTS scan_status        text DEFAULT 'pending'
    CHECK (scan_status IN ('pending', 'scanning', 'done', 'failed')),
  ADD COLUMN IF NOT EXISTS scan_error         text;

-- Índice para que el cron mensual encuentre rápido las que tocan
-- re-escanear (last_scanned_at < now() - 30d).
CREATE INDEX IF NOT EXISTS scouter_spammer_accounts_last_scanned_idx
  ON public.scouter_spammer_accounts (last_scanned_at);

-- Índice global por handle (sin tenant) para que el frontend pueda
-- detectar duplicados cross-spammer y reusar el scan ya hecho.
CREATE INDEX IF NOT EXISTS scouter_spammer_accounts_handle_global_idx
  ON public.scouter_spammer_accounts (instagram_handle);

-- ─── 2. Drop tabla redundante scouter_spam_accounts ─────────────────
-- Estaba vacía (nadie la insertó porque la UI de spammer ya usaba la
-- de doble m). CASCADE borra las policies, índices y triggers
-- asociados. La función helper que existía solo para esta tabla
-- también se va.
DROP TABLE IF EXISTS public.scouter_spam_accounts CASCADE;
DROP FUNCTION IF EXISTS public.scouter_spam_accounts_set_updated_at() CASCADE;
