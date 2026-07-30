-- promolog_ig_identity: de UNA fila por creadora → una fila por (creadora, cuenta).
--
-- POR QUÉ: los targets del scan de IG incluyen las cuentas EXTRA de
-- creator_social_accounts (#990), pero el caché de user-id solo guardaba la cuenta
-- PRINCIPAL (PK = creator_id). Las 21 cuentas extra van SIN id cacheado en cada
-- corrida → la extensión las resuelve vía web_profile_info, que es justo el endpoint
-- que IG limita silenciosamente → salen "throttled" casi siempre (medido 2026-07-29:
-- de 27 ⏳ de una corrida, la gran mayoría eran extras re-resolviéndose + 5 handles
-- rotos). El ig_user_id es PERMANENTE (sobrevive renombres): resolverlo una sola vez
-- por cuenta y cachearlo elimina ese bucket entero.
--
-- Consumidores actualizados en este mismo PR:
--   · promolog-scan-targets: lee el caché por (creator_id, handle) y sirve el id
--     también para las cuentas extra.
--   · promolog-ingest-stories: cuando la extensión resolvió un id, lo persiste acá
--     (upsert por creator_id+handle).
--   · promolog-story-read (pausado, cron 47): upsert actualizado al conflict nuevo.
--
-- Normalizamos handles a lowercase ANTES del PK nuevo para que la clave de conflicto
-- sea estable (scan-targets/ingest normalizan igual). Si el handle principal de una
-- creadora cambia, su fila vieja queda huérfana (inofensiva: nadie la matchea).

update public.promolog_ig_identity set handle = lower(trim(handle)) where handle <> lower(trim(handle));

alter table public.promolog_ig_identity drop constraint promolog_ig_identity_pkey;
alter table public.promolog_ig_identity add primary key (creator_id, handle);

comment on table public.promolog_ig_identity is
  'Caché del user-id numérico de IG por (creadora, cuenta) — incluye cuentas extra de creator_social_accounts. El id es permanente (no cambia con renombres). Lo escriben promolog-ingest-stories (extensión) y promolog-story-read; lo lee promolog-scan-targets.';

notify pgrst, 'reload schema';
