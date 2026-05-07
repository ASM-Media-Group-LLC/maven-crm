-- Posts recientes del lead, scrapeados via Apify Instagram Scraper.
-- Solo se llena para leads ai_status='high_fit' (los top-tier que
-- justifican el costo extra de Apify ~$0.001 por lead). Los medium
-- y approved se quedan con NULL y la IA usa solo el bio.
--
-- Estructura esperada del JSONB:
--   [
--     {
--       "url": "https://instagram.com/p/CXXXX",
--       "caption": "Texto del post",
--       "like_count": 1234,
--       "posted_at": "2026-05-01T12:00:00Z",
--       "is_video": false
--     },
--     ...
--   ]
--
-- Se refresca:
--   - Una vez al volverse high_fit (worker lo dispara)
--   - Semanalmente para los high_fit en el pool activo (cron)
--
-- Si en el futuro queremos consultar "leads cuyo último post tiene
-- más de N likes" o similares, vale la pena agregar un GIN index
-- sobre el JSONB. Por ahora la lectura es siempre por lead_id, así
-- que no hace falta.

ALTER TABLE public.scouter_leads
  ADD COLUMN IF NOT EXISTS recent_posts JSONB DEFAULT NULL;

COMMENT ON COLUMN public.scouter_leads.recent_posts IS
  'Apify-scraped recent posts (caption, url, likes). Only populated for high_fit leads. NULL for the rest — the AI prompt falls back to bio-only generation in that case.';
