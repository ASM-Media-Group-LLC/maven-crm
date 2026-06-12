-- Normaliza promolog_entries.network a un valor canónico en cada INSERT/UPDATE:
-- lowercase + alias (IG→instagram, TG→telegram, TT→tiktok, FB→facebook, twitter→x).
-- Unifica los splits históricos (Instagram/instagram/IG = 42.728 filas que estaban
-- partidas, Telegram/telegram/TG, X/x, etc.) para que conteos, filtros y RPCs por red
-- sean confiables. Atrapa a TODOS los escritores (scanners, form manual, RPC) a nivel
-- DB, sin tocar las edge functions.
CREATE OR REPLACE FUNCTION public.promolog_normalize_network() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.network IS NOT NULL THEN
    NEW.network := CASE lower(btrim(NEW.network))
      WHEN 'ig' THEN 'instagram'
      WHEN 'tg' THEN 'telegram'
      WHEN 'tt' THEN 'tiktok'
      WHEN 'fb' THEN 'facebook'
      WHEN 'twitter' THEN 'x'
      ELSE lower(btrim(NEW.network))
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_promolog_normalize_network ON public.promolog_entries;
CREATE TRIGGER trg_promolog_normalize_network
  BEFORE INSERT OR UPDATE ON public.promolog_entries
  FOR EACH ROW EXECUTE FUNCTION public.promolog_normalize_network();

-- Backfill de lo existente (mismo mapeo; solo las filas que difieren).
UPDATE public.promolog_entries SET network = CASE lower(btrim(network))
    WHEN 'ig' THEN 'instagram' WHEN 'tg' THEN 'telegram' WHEN 'tt' THEN 'tiktok'
    WHEN 'fb' THEN 'facebook' WHEN 'twitter' THEN 'x' ELSE lower(btrim(network)) END
WHERE network IS NOT NULL
  AND network <> CASE lower(btrim(network))
    WHEN 'ig' THEN 'instagram' WHEN 'tg' THEN 'telegram' WHEN 'tt' THEN 'tiktok'
    WHEN 'fb' THEN 'facebook' WHEN 'twitter' THEN 'x' ELSE lower(btrim(network)) END;
