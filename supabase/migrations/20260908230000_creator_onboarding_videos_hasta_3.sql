-- Hasta 3 videos de onboarding por creadora (pedido de Jhon, 08/09/2026).
--
-- Se hace con una TABLA y no con tres columnas repetidas ni un jsonb: cada
-- video tiene su llave, su peso, quién lo subió y cuándo, y con columnas
-- repetidas (video1_key, video2_key…) toda consulta y todo borrado se vuelve
-- un case de tres ramas.
--
-- El tope de 3 se hace cumplir en la BASE con un trigger, no solo en la UI:
-- la tabla es escribible por RLS y la edge es otro camino de escritura. Una
-- validación que vive únicamente en el navegador no es una regla.
--
-- Se cambia el modelo AHORA porque no hay ni un video subido (verificado):
-- la versión de una sola columna tenía horas de vida.
CREATE TABLE IF NOT EXISTS public.creator_onboarding_videos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  -- Llave del objeto en el bucket R2 maven-onboarding. Nunca una URL: las
  -- firmadas nacen vencidas al guardarlas y las públicas dejan el video a la
  -- vista de cualquiera con el link.
  storage_key text NOT NULL UNIQUE,
  titulo      text,
  size_bytes  bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_onboarding_videos_creator_idx
  ON public.creator_onboarding_videos (creator_id, created_at);

ALTER TABLE public.creator_onboarding_videos ENABLE ROW LEVEL SECURITY;

-- Mismo alcance que creator_business: quien puede ver Creadoras, puede ver
-- sus videos. Los chatters entran por acá.
DROP POLICY IF EXISTS creator_onboarding_videos_scope ON public.creator_onboarding_videos;
CREATE POLICY creator_onboarding_videos_scope
  ON public.creator_onboarding_videos
  FOR ALL
  USING (has_permission(auth.uid(), 'Creadores'::text, NULL::text))
  WITH CHECK (has_permission(auth.uid(), 'Creadores'::text, NULL::text));

CREATE OR REPLACE FUNCTION public.tope_videos_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM public.creator_onboarding_videos
      WHERE creator_id = NEW.creator_id) >= 3 THEN
    RAISE EXCEPTION 'Esta creadora ya tiene 3 videos de onboarding. Borra uno antes de subir otro.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tope_videos_onboarding ON public.creator_onboarding_videos;
CREATE TRIGGER tope_videos_onboarding
  BEFORE INSERT ON public.creator_onboarding_videos
  FOR EACH ROW EXECUTE FUNCTION public.tope_videos_onboarding();

COMMENT ON TABLE public.creator_onboarding_videos IS
  'Videos de onboarding de la creadora (hasta 3, tope forzado por trigger). El archivo vive en el bucket R2 maven-onboarding; acá solo la llave. Los mira el equipo que le escribe, para aprender su voz.';

-- Las 4 columnas de creators quedan MUERTAS, no se borran. Para quitarlas
-- habría que sacarlas de v_creators, y CREATE OR REPLACE VIEW no puede
-- eliminar columnas: exigiría DROP VIEW + recrear, lo que se lleva los
-- permisos de una vista de la que depende todo el módulo de creadoras (y que
-- enmascara PII). El riesgo no compensa quitar cuatro columnas vacías.
COMMENT ON COLUMN public.creators.onboarding_video_key IS
  'MUERTA (08/09/2026). La fuente de verdad es la tabla creator_onboarding_videos, que admite hasta 3. Nunca tuvo datos.';
COMMENT ON COLUMN public.creators.onboarding_video_at IS 'MUERTA — ver creator_onboarding_videos.';
COMMENT ON COLUMN public.creators.onboarding_video_bytes IS 'MUERTA — ver creator_onboarding_videos.';
COMMENT ON COLUMN public.creators.onboarding_video_by IS 'MUERTA — ver creator_onboarding_videos.';
