-- LAS LIMPIEZAS DE FOTOS Y VIDEOS VUELVEN A FUNCIONAR (13/11/2026).
--
-- Tres crons fallaban TODOS los días con «Direct deletion from storage tables is
-- not allowed. Use the Storage API instead» (storage.protect_delete de Supabase):
--   · monitor_limpiar_capturas  (17 4 * * *) → public.monitor_limpiar_capturas()
--   · monitor-capturas-limpieza (0 4 * * *)  → SQL suelto en el cron
--   · argos-clips-purga         (0 9 * * *)  → public.argos_clips_purga()
-- Como cada uno era una sola transacción, el primer `delete from storage.objects`
-- tumbaba todo: tampoco se ordenaban las filas.
--
-- Ahora los tres crons (mismos nombres, mismos horarios) despiertan la edge
-- limpieza-storage, que borra por la API de Storage. La base solo dice QUÉ
-- venció (la retención queda escrita aquí, no la manda nadie desde afuera) y
-- ordena las filas después:
--
--   regla                 archivos que borra                         filas
--   monitor_faltas_7d     monitor-capturas con más de 7 días, MENOS  monitor_eventos: se quita el
--                         los pantallazos de Argos que aún no se     enlace a la foto si ya no existe
--                         mudaron al NAS (fila en monitor_capturas   (faltas de más de 7 días); se
--                         con en_nas = false: esos los maneja        podan los latidos de
--                         argos-al-nas, buzón → NAS → 30 días)       monitor_rondas de más de 2 días
--   monitor_capturas_30d  monitor-capturas con más de 30 días        monitor_capturas de más de 30
--                                                                    días que NUNCA llegaron al NAS
--                                                                    (nas_path vacío) y cuya foto
--                                                                    ya no está
--   argos_clips_30d       argos-clips con más de 30 días             argos_clips de más de 30 días
--                                                                    (por started_at) sin copia en
--                                                                    el NAS y cuyo video ya no está
--
-- Lo único que cambia contra las limpiezas viejas es que ahora nunca borran algo
-- que el NAS todavía necesita: la de 7 días ya no se lleva pantallazos que
-- quizá no se copiaron al NAS (las viejas los habrían borrado a los 7 días, con
-- el NAS caído se perdían), y las de 30 días no borran la fila de algo que vive
-- en el NAS (argos-al-nas borra primero la copia del NAS y después la fila; sin
-- la fila la copia quedaría para siempre). Ninguna retención se acorta.

-- ── 1) Qué venció, por regla (solo service_role) ─────────────────────────────
create or replace function public.limpieza_storage_vencidos(_regla text, _limite integer default 1000)
returns table (nombre text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limite integer := least(greatest(coalesce(_limite, 1000), 1), 1000);
begin
  if _regla = 'monitor_faltas_7d' then
    return query
      select o.name::text
        from storage.objects o
       where o.bucket_id = 'monitor-capturas'
         and o.created_at < now() - interval '7 days'
         -- Un pantallazo de Argos que todavía no se mudó al NAS (en_nas = false)
         -- no se toca: lo copia y lo borra argos-al-nas. Si ya se mudó y quedó
         -- el archivo en el buzón (un remove que falló), es un sobrante y sí se va.
         and not exists (select 1 from public.monitor_capturas c where c.path = o.name and not c.en_nas)
       order by o.created_at
       limit v_limite;
  elsif _regla = 'monitor_capturas_30d' then
    return query
      select o.name::text
        from storage.objects o
       where o.bucket_id = 'monitor-capturas'
         and o.created_at < now() - interval '30 days'
       order by o.created_at
       limit v_limite;
  elsif _regla = 'argos_clips_30d' then
    return query
      select o.name::text
        from storage.objects o
       where o.bucket_id = 'argos-clips'
         and o.created_at < now() - interval '30 days'
       order by o.created_at
       limit v_limite;
  else
    raise exception 'limpieza_storage_vencidos: regla desconocida %', _regla using errcode = '22023';
  end if;
end
$$;

-- ── 2) Las filas, una vez borrados los archivos (solo service_role) ──────────
create or replace function public.limpieza_storage_filas(_regla text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a integer := 0;
  b integer := 0;
begin
  if _regla = 'monitor_faltas_7d' then
    -- Sin enlace muerto: se quita la ruta de las faltas viejas cuya foto ya no está.
    update public.monitor_eventos e
       set captura_path = null
     where e.captura_path is not null
       and e.created_at < now() - interval '7 days'
       and not exists (select 1 from storage.objects o
                        where o.bucket_id = 'monitor-capturas' and o.name = e.captura_path);
    get diagnostics a = row_count;
    -- Los latidos del rondín no son historial.
    delete from public.monitor_rondas where last_at < now() - interval '2 days';
    get diagnostics b = row_count;
    return jsonb_build_object('faltas_sin_foto', a, 'rondas_podadas', b);

  elsif _regla = 'monitor_capturas_30d' then
    delete from public.monitor_capturas c
     where c.created_at < now() - interval '30 days'
       and c.nas_path is null
       and not exists (select 1 from storage.objects o
                        where o.bucket_id = 'monitor-capturas' and o.name = c.path);
    get diagnostics a = row_count;
    return jsonb_build_object('capturas_borradas', a);

  elsif _regla = 'argos_clips_30d' then
    delete from public.argos_clips k
     where k.started_at < now() - interval '30 days'
       and k.nas_path is null
       and not exists (select 1 from storage.objects o
                        where o.bucket_id = 'argos-clips' and o.name = k.path);
    get diagnostics a = row_count;
    return jsonb_build_object('clips_borrados', a);

  else
    raise exception 'limpieza_storage_filas: regla desconocida %', _regla using errcode = '22023';
  end if;
end
$$;

revoke all on function public.limpieza_storage_vencidos(text, integer) from public, anon, authenticated;
revoke all on function public.limpieza_storage_filas(text) from public, anon, authenticated;
grant execute on function public.limpieza_storage_vencidos(text, integer) to service_role;
grant execute on function public.limpieza_storage_filas(text) to service_role;

-- ── 3) Los crons: mismos nombres y horarios, ahora llaman a la edge ──────────
-- Mismo patrón que borrar-buzones-vencidos: X-Cron-Token desde Vault, sin llaves
-- escritas aquí. Protegido: pg_cron solo existe en la base real.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;

  perform cron.unschedule(j.jobname)
     from cron.job j
    where j.jobname in ('monitor_limpiar_capturas', 'monitor-capturas-limpieza', 'argos-clips-purga');

  perform cron.schedule('monitor-capturas-limpieza', '0 4 * * *', $cron$
    select net.http_post(
      url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/limpieza-storage',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')),
      body := '{"regla":"monitor_capturas_30d"}'::jsonb,
      timeout_milliseconds := 120000);
  $cron$);

  perform cron.schedule('monitor_limpiar_capturas', '17 4 * * *', $cron$
    select net.http_post(
      url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/limpieza-storage',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')),
      body := '{"regla":"monitor_faltas_7d"}'::jsonb,
      timeout_milliseconds := 120000);
  $cron$);

  perform cron.schedule('argos-clips-purga', '0 9 * * *', $cron$
    select net.http_post(
      url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/limpieza-storage',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')),
      body := '{"regla":"argos_clips_30d"}'::jsonb,
      timeout_milliseconds := 120000);
  $cron$);
end
$$;

-- ── 4) Las funciones viejas ya no sirven (borraban directo en storage) ───────
drop function if exists public.monitor_limpiar_capturas();
drop function if exists public.argos_clips_purga();
