-- Funciones de mantenimiento e importacion: sacarles el permiso de PUBLIC/anon/authenticated.
--
-- Supabase le da EXECUTE a PUBLIC por defecto a toda funcion nueva, y nadie se lo saca. Como
-- estas son SECURITY DEFINER (corren como postgres y no evaluan RLS) y ninguna mira quien la
-- llama, cualquiera con la publishable key del bundle podia ejecutarlas. Las tres peores no
-- leen datos: los ESCRIBEN.
--   import_hubstaff_data / import_hubstaff_members -> inyectar horas de Hubstaff (insumo de pago)
--   import_blu_chatter_daily                       -> inyectar ventas de chatters
-- Y varias borran: purge_old_ai_conversations, expire_meeting_recordings,
-- cleanup_duplicate_leadgen_entries, end_expired_chatter_sessions.
--
-- Ninguna la llama el navegador. Sus llamadores reales, verificados por dos caminos
-- independientes (grep en el repo + cron.job del catalogo):
--   pg_cron jobid 5  purge_old_ai_conversations       (0 4 * * *,    username=postgres)
--   pg_cron jobid 12 cleanup-old-scouter-jobs-monthly (15 12 1 * *,  username=postgres)
--   pg_cron jobid 13 chatter-sessions-auto-end        (* * * * *,    username=postgres)
--   pg_cron jobid 17 scouter-spammer-scan-recovery    (*/5 * * * *,  username=postgres)
--   pg_cron jobid 80 chatter-notas                    (45 9 * * *,   username=postgres)
--   pg_cron jobid 81 chatter-masivos                  (10 10 * * *,  username=postgres)
--   infra/hubstaff-bridge/index.mjs:184 y :256    (cliente service_role)
--   infra/blu-bridge/index.mjs:759                (cliente service_role)
--   supabase/functions/recordings/index.ts:111    (cliente service_role)
--   supabase/functions/public-api/index.ts:167    (cliente service_role)
-- cleanup_duplicate_leadgen_entries no la llama nadie, en ningun lado.
--
-- postgres (los crons) y service_role (los micros y la API) NO se ven afectados: verificado que
-- las 12 tienen service_role=X PROPIO en su proacl, no heredado de PUBLIC. Si fuera heredado,
-- este revoke habria roto el puente de Hubstaff, el de BLU y la API de Maven.
--
-- La API de Maven no esta en juego por otro motivo ademas: su tabla api_keys no tiene grant de
-- SELECT ni para anon ni para authenticated, asi que ni llega a evaluarse RLS.

revoke execute on function public.purge_old_ai_conversations() from public, anon, authenticated;
revoke execute on function public.cleanup_duplicate_leadgen_entries() from public, anon, authenticated;
revoke execute on function public.expire_meeting_recordings() from public, anon, authenticated;
revoke execute on function public.end_expired_chatter_sessions() from public, anon, authenticated;
revoke execute on function public.cleanup_old_scouter_jobs() from public, anon, authenticated;
revoke execute on function public.recover_stuck_spammer_scans() from public, anon, authenticated;
revoke execute on function public.import_hubstaff_data(jsonb) from public, anon, authenticated;
revoke execute on function public.import_hubstaff_members(jsonb) from public, anon, authenticated;
revoke execute on function public.import_blu_chatter_daily(jsonb) from public, anon, authenticated;
revoke execute on function public.calcular_notas_chatters(date) from public, anon, authenticated;
revoke execute on function public.chatter_masivos_refresh(integer) from public, anon, authenticated;
revoke execute on function public.increment_api_key_usage(uuid) from public, anon, authenticated;
