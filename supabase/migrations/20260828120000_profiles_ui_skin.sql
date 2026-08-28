-- Skins de Maven (Settings → Mi cuenta → Apariencia): preset de ACENTO de la
-- UI elegido por cada usuario. El frontend guarda acá el id del skin
-- ('maven' | 'atardecer' | 'esmeralda' | 'orquidea' | 'medianoche') para que
-- la elección siga al usuario en cualquier dispositivo; NULL = nunca eligió
-- (default maven). Texto libre a propósito: sumar un skin nuevo no debe
-- requerir migración — el frontend valida contra su lista (isSkinId en
-- hooks/useSkin.ts) y cae a maven ante cualquier valor desconocido.
-- La policy existente "Users can update own profile" (auth.uid() = id) ya
-- cubre la escritura; no hace falta RLS nueva.
alter table public.profiles
  add column if not exists ui_skin text;

comment on column public.profiles.ui_skin is
  'Skin de acento de la UI elegido en Settings → Apariencia (maven/atardecer/esmeralda/orquidea/medianoche). NULL = default maven.';
