-- Video de onboarding de la creadora. El archivo NO vive acá ni en Supabase
-- Storage: va a Cloudflare R2 (bucket maven-onboarding), porque es un video
-- que el equipo mira muchas veces y en R2 servirlo cuesta $0. Acá solo queda
-- la LLAVE del objeto; las URLs se firman al vuelo y vencen.
--
-- Se guarda la llave y no una URL a propósito: una URL firmada guardada en la
-- base nace vencida, y una URL pública convertiría el video en algo que
-- cualquiera con el link puede ver (el problema que ya tenemos con chat-files).
ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS onboarding_video_key   text,
  ADD COLUMN IF NOT EXISTS onboarding_video_at    timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_video_bytes bigint,
  ADD COLUMN IF NOT EXISTS onboarding_video_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.creators.onboarding_video_key IS
  'Llave del objeto en el bucket R2 maven-onboarding (formato <creator_id>/<uuid>.<ext>). NULL = todavía no subió video. Nunca guardar acá una URL: las firmadas vencen y las públicas dejan el video a la vista de cualquiera con el link.';
