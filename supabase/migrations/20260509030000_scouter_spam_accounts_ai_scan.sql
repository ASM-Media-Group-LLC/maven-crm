-- 20260509030000_scouter_spam_accounts_ai_scan.sql
--
-- Extiende scouter_spam_accounts con columnas para el scan de IA que
-- corre cada vez que un spammer registra una cuenta nueva. El scan:
--   1. Fetchea datos públicos de IG (foto, followers, posts, bio).
--   2. Pasa el JSON a Sonnet 4.6 con un prompt que evalúa qué tan
--      creíble se ve la cuenta para una creadora target.
--   3. Persiste score (0-100) + análisis estructurado.
--
-- El scan SOLO corre la primera vez que un handle aparece en el
-- tenant (dedup por instagram_handle). Las re-corridas son mensuales
-- via cron que mira last_scanned_at.

ALTER TABLE public.scouter_spam_accounts
  ADD COLUMN IF NOT EXISTS profile_photo_url   text,
  ADD COLUMN IF NOT EXISTS followers_count     int,
  ADD COLUMN IF NOT EXISTS following_count     int,
  ADD COLUMN IF NOT EXISTS posts_count         int,
  ADD COLUMN IF NOT EXISTS bio                 text,
  ADD COLUMN IF NOT EXISTS is_verified         boolean,
  ADD COLUMN IF NOT EXISTS ai_score            int,
  ADD COLUMN IF NOT EXISTS ai_analysis         jsonb,
  ADD COLUMN IF NOT EXISTS last_scanned_at     timestamptz,
  -- Estado del scan: pending | scanning | done | failed.
  ADD COLUMN IF NOT EXISTS scan_status         text DEFAULT 'pending'
    CHECK (scan_status IN ('pending', 'scanning', 'done', 'failed')),
  ADD COLUMN IF NOT EXISTS scan_error          text;

-- Índice para que el cron mensual encuentre rápido las que tocan
-- re-escanear (last_scanned_at < now() - 30d).
CREATE INDEX IF NOT EXISTS scouter_spam_accounts_last_scanned_idx
  ON public.scouter_spam_accounts (last_scanned_at);

-- Índice global por handle (sin tenant) para que el frontend pueda
-- detectar duplicados cross-spammer y reusar el scan ya hecho.
CREATE INDEX IF NOT EXISTS scouter_spam_accounts_handle_global_idx
  ON public.scouter_spam_accounts (instagram_handle);
