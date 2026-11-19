-- LOS RELOJES (pg_cron) DEL EDIFICIO — solo para maven-agencias (ezeigddgkaemxpshghmu).
-- Tren de agencias, vagón 1 (19/11/2026). NUNCA se aplica a Kash: vive fuera de
-- supabase/migrations y solo lo usa infra/casas/al-dia.sh.
--
-- Salió de comparar los 98 relojes de Kash (lectura, 19/11). Aquí van los que hace
-- falta para que Maven funcione para clientes nuevos: Argos, Cowork, turnos, Hub de
-- supervisores, llamadas, Messenger programado, webhooks, salud y limpiezas.
-- NO van los de integraciones de Kash: Blu, chatters, closers, promolog, scouter,
-- WhatsApp, Telegram, Zoho (buzones, grupos de correo, correo programado),
-- fb/x-scan, parrilla, creadoras, costos y saldo de IA (los mira Kash), ni los de una
-- sola vez (argos-tope-vuelve-*).
--
-- Los que llaman funciones edge no llevan ninguna dirección ni llave escrita: la
-- dirección, la llave pública y el token interno salen de la bóveda del edificio
-- (vault: project_url, supabase_anon_key, cron_internal_token), que llena el
-- workflow «Edificio · secretos». Mientras falten, los llamados no salen.
--
-- Los que dependen del NAS (argos-al-nas, drive-aporte-nas, grabaciones-al-drive)
-- se crean APAGADOS: el NAS es de Kash y conectarlo al edificio es decisión de Alvaro.

-- ─── 1. Llamar a una función del edificio desde un reloj ─────────────────────
create or replace function public.edificio_llamar(_funcion text, _cuerpo jsonb default '{}'::jsonb, _espera_ms integer default 55000)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'vault', 'extensions'
as $function$
declare
  v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1);
  v_anon text := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key' limit 1);
  v_token text := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token' limit 1);
begin
  if v_url is null or v_token is null then
    raise warning 'edificio_llamar(%): faltan project_url o cron_internal_token en la bóveda', _funcion;
    return null;
  end if;
  -- (partido en dos para que al-dia.sh no lo reescriba al sanear)
  if v_url like '%' || 'lsagslbkli' || 'prespbyhts' || '%' then
    raise exception 'ALTO: la bóveda del edificio apunta a Kash';
  end if;
  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || _funcion,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', coalesce(v_anon, ''),
      'Authorization', 'Bearer ' || coalesce(v_anon, ''),
      'X-Cron-Token', v_token),
    body := _cuerpo,
    timeout_milliseconds := _espera_ms);
end;
$function$;

revoke all on function public.edificio_llamar(text, jsonb, integer) from public, anon, authenticated;

-- ─── 2. Las funciones SQL que llaman los relojes tienen que existir ─────────
do $$
declare
  f text;
  faltan text := '';
begin
  foreach f in array array[
    'public.argos_casos_avisos', 'public.argos_casos_armar', 'public.argos_vigilar_graves',
    'public.argos_resumenes_avisos', 'public.cerrar_grabaciones_huerfanas_tick',
    'public.chat_programados_enviar', 'public.expirar_grabaciones_tick', 'public.hub_estado_refrescar',
    'public.equipo_webhooks_hay_trabajo', 'public.pg_net_watchdog', 'public.app_purgar_cuentas_vencidas',
    'public.equipo_webhooks_purgar', 'public.app_purgar_entregas_webhooks', 'public.app_purgar_historial_cron',
    'public.purge_old_ai_conversations', 'public.drive_rescatar_huerfanos', 'public.vigilar_cortes_de_llamada',
    'public.vigilar_fuera_de_cowork', 'public.vigilar_marcas', 'public.vigilar_subidas_trabadas',
    'public.vigilar_supervisores_hub', 'public.vigilar_tiempo_sin_pantalla', 'public.grabaciones_al_drive_tick'
  ] loop
    if to_regproc(f) is null then faltan := faltan || ' ' || f; end if;
  end loop;
  if faltan <> '' then
    raise exception 'Faltan funciones para los relojes del edificio:%', faltan;
  end if;
end $$;

-- ─── 3. Relojes que llaman funciones edge ───────────────────────────────────
select cron.schedule('argos-mirar',           '*/2 * * * *',    $$select public.edificio_llamar('argos-mirar')$$);
select cron.schedule('argos-vigia',           '1-59/2 * * * *', $$select public.edificio_llamar('argos-vigia')$$);
select cron.schedule('argos-escalar-persona', '*/2 * * * *',    $$select public.edificio_llamar('argos-escalar-persona', '{}'::jsonb, 25000)$$);
select cron.schedule('detectar-tardanzas',    '*/2 * * * *',    $$select public.edificio_llamar('detectar-tardanzas')$$);
select cron.schedule('equipo-vigilante',      '*/3 * * * *',    $$select public.edificio_llamar('equipo-vigilante', '{}'::jsonb, 25000)$$);
select cron.schedule('salud-vigilante',       '*/2 * * * *',    $$select public.edificio_llamar('salud-vigilante', '{}'::jsonb, 25000)$$);
select cron.schedule('dispatch-reports-hourly', '0 * * * *',    $$select public.edificio_llamar('dispatch-reports', '{}'::jsonb, 60000)$$);
select cron.schedule('equipo-webhooks-tick',  '30 seconds',     $$select public.edificio_llamar('messenger-webhooks?tarea=equipo', '{}'::jsonb, 5000) where public.equipo_webhooks_hay_trabajo()$$);
select cron.schedule('argos-clips-purga',     '0 9 * * *',      $$select public.edificio_llamar('limpieza-storage', '{"regla":"argos_clips_30d"}'::jsonb, 120000)$$);
select cron.schedule('monitor_limpiar_capturas', '17 4 * * *',  $$select public.edificio_llamar('limpieza-storage', '{"regla":"monitor_faltas_7d"}'::jsonb, 120000)$$);
select cron.schedule('monitor-capturas-limpieza', '0 4 * * *',  $$select public.edificio_llamar('limpieza-storage', '{"regla":"monitor_capturas_30d"}'::jsonb, 120000)$$);
select cron.schedule('storage-retencion-diaria', '25 6 * * *',  $$select public.edificio_llamar('storage-retencion', '{"limite":2000}'::jsonb, 120000)$$);

-- Del NAS: se crean apagados (ver arriba).
select cron.schedule('argos-al-nas',          '* * * * *',      $$select public.edificio_llamar('argos-al-nas')$$);
select cron.schedule('drive-aporte-nas',      '*/2 * * * *',    $$select public.edificio_llamar('drive-aporte-nas')$$);

-- ─── 4. Relojes de SQL ──────────────────────────────────────────────────────
select cron.schedule('api-escritura-idem-purga', '23 9 * * *',  $$delete from public.api_escritura_idem where created_at < now() - interval '72 hours'$$);
select cron.schedule('argos-casos-7am',       '0 12 * * *',     $$select public.argos_casos_avisos('manana')$$);
select cron.schedule('argos-casos-9am',       '0 14 * * *',     $$select public.argos_casos_avisos('reporte')$$);
select cron.schedule('argos-casos-armar',     '*/10 * * * *',   $$select public.argos_casos_armar((now() at time zone 'America/Bogota')::date); select public.argos_casos_armar((now() at time zone 'America/Bogota')::date - 1) where extract(hour from now() at time zone 'America/Bogota') < 1;$$);
select cron.schedule('argos-graves',          '*/2 * * * *',    $$select public.argos_vigilar_graves()$$);
select cron.schedule('argos-resumen-dia',     '55 4 * * *',     $$select public.argos_resumenes_avisos('dia')$$);
select cron.schedule('argos-tendencia-semana', '0 12 * * 1',    $$select public.argos_resumenes_avisos('semana')$$);
select cron.schedule('argos-uso-apps-limpieza', '20 9 * * *',   $$delete from public.argos_uso_apps where desde < now() - interval '30 days'$$);
select cron.schedule('cerrar-grabaciones-huerfanas', '*/2 * * * *', $$select public.cerrar_grabaciones_huerfanas_tick()$$);
select cron.schedule('chat-programados',      '* * * * *',      $$select public.chat_programados_enviar() where exists (select 1 from public.chat_programados where estado = 'pendiente' and enviar_en <= now())$$);
select cron.schedule('drive-intentos-limpieza', '23 8 * * *',   $$delete from public.drive_aportar_intentos where iniciado_at < now() - interval '60 days'$$);
select cron.schedule('expire-meeting-recordings-daily', '30 6 * * *', $$select public.expirar_grabaciones_tick()$$);
select cron.schedule('grabaciones-al-drive',  '*/2 * * * *',    $$select public.grabaciones_al_drive_tick()$$);
select cron.schedule('hub-estado-supervisores', '15 seconds',   $$select public.hub_estado_refrescar()$$);
select cron.schedule('llamada-salud-limpieza', '17 8 * * *',    $$delete from public.llamada_salud where creado < now() - interval '14 days'$$);
select cron.schedule('pg-net-watchdog',       '*/15 * * * *',   $$select public.pg_net_watchdog()$$);
select cron.schedule('purgar-cuentas-vencidas', '0 7 * * *',    $$select public.app_purgar_cuentas_vencidas(30, 50)$$);
select cron.schedule('purgar-entregas-equipo', '50 8 * * *',    $$select public.equipo_webhooks_purgar(14, 10000)$$);
select cron.schedule('purgar-entregas-webhooks', '40 8 * * *',  $$select public.app_purgar_entregas_webhooks(14, 10000)$$);
select cron.schedule('purgar-historial-cron', '30 8 * * *',     $$select public.app_purgar_historial_cron(7, 5000, 150000)$$);
select cron.schedule('purge_old_ai_conversations', '0 4 * * *', $$select public.purge_old_ai_conversations()$$);
select cron.schedule('rescatar-huerfanos',    '*/5 * * * *',    $$select public.drive_rescatar_huerfanos()$$);
select cron.schedule('vigia-cortes-de-llamada', '*/5 * * * *',  $$select public.vigilar_cortes_de_llamada()$$);
select cron.schedule('vigia-fuera-de-cowork', '* * * * *',      $$select public.vigilar_fuera_de_cowork()$$);
select cron.schedule('vigia-marcas-de-turno', '* * * * *',      $$select public.vigilar_marcas()$$);
select cron.schedule('vigia-subidas-trabadas', '*/5 * * * *',   $$select public.vigilar_subidas_trabadas()$$);
select cron.schedule('vigia-supervisores-hub', '* * * * *',     $$select public.vigilar_supervisores_hub()$$);
select cron.schedule('vigia-tiempo-sin-pantalla', '*/5 * * * *', $$select public.vigilar_tiempo_sin_pantalla()$$);

-- ─── 5. Los del NAS, apagados; y nada de relojes de integraciones de Kash ────
-- (las migraciones que se aplicaron antes pudieron haber creado alguno).
do $$
declare
  j record;
begin
  for j in select jobid, jobname from cron.job
            where jobname in ('argos-al-nas', 'drive-aporte-nas', 'grabaciones-al-drive') loop
    perform cron.alter_job(j.jobid, active := false);
  end loop;
  for j in select jobid, jobname from cron.job
            where jobname ~ '^(blu|chatter|closer|promolog|scouter|whatsapp|wa-|telegram|tg-|fb-scan|x-scan|parrilla|creators|role-email|borrar-buzones|mail-|costos|vigilar-saldo|alvaro-pulse|argos-tope)' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;
