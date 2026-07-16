-- Retiro del pipeline Apify "story scraper" de Promolog.
--
-- Contexto: el scan de historias de IG migró a la extensión de Chrome
-- (promolog-scan-targets + promolog-ingest-stories), que corre en el navegador del
-- operador. El pipeline viejo basado en Apify quedó huérfano:
--   - edge functions promolog-dispatch / promolog-webhook / promolog-poll
--     (eliminadas del repo en este mismo cambio),
--   - cron 'promolog-poll-stuck-runs' (jobid 24), que solo vigilaba corridas Apify
--     colgadas y ya estaba inactivo.
--
-- Acá solo desagendamos ese cron (idempotente). NO tocamos:
--   - promolog-handle-check-daily (usa el actor de PERFIL de Apify, sigue vigente),
--   - promolog-story-read-staggered ni promolog-poll de otras features,
--   - la tabla promolog_dispatch_runs ni sus columnas apify_* (histórico + la
--     extensión sigue escribiendo filas con apify_actor_id = 'browser-extension').

do $$
begin
  if exists (select 1 from cron.job where jobname = 'promolog-poll-stuck-runs') then
    perform cron.unschedule('promolog-poll-stuck-runs');
  end if;
end $$;
