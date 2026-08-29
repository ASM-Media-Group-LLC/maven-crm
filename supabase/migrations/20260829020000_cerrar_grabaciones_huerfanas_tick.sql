-- Cierra las grabaciones que quedaron abiertas porque nadie apretó Detener.
--
-- POR QUÉ EXISTE: una fila solo pasa a 'ready' cuando alguien para la
-- grabación. Si se cierra la pestaña, se cae internet o la reunión termina
-- sola, queda en 'recording' para siempre. Dos consecuencias:
--   · Descargar responde "grabación no disponible" sobre un archivo que SÍ
--     existe (le pasó a María el 28/08/2026).
--   · expire_meeting_recordings SOLO mira filas en 'ready', así que el
--     archivo de una fila colgada NO SE BORRA NUNCA. Ese es el disco
--     creciendo sin techo que el diseño de 90 días promete evitar.
--
-- El barrido ya existía, pero vivía dentro del cron `expire`, que corre UNA
-- VEZ AL DÍA. Bajar el umbral no servía si quien lo aplica pasa cada 24 h.
--
-- POR QUÉ EL GUARD: el tic corre cada 2 minutos todo el día, pero casi
-- siempre termina en el `count` de abajo — leer una tabla que ronda la
-- decena de filas. Despertar la edge function 720 veces por día para no
-- hacer nada sería el gasto real; esto lo evita.
--
-- El intervalo de 15 minutos debe coincidir con GRACIA_HUERFANA_MS en
-- supabase/functions/recordings/index.ts.
create or replace function public.cerrar_grabaciones_huerfanas_tick()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token text;
  v_abiertas integer;
begin
  select count(*) into v_abiertas
  from public.meeting_recordings
  where status in ('recording', 'processing')
    and deleted_at is null
    and started_at < now() - interval '15 minutes';

  if v_abiertas = 0 then
    return jsonb_build_object('abiertas', 0, 'despertada', false);
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'recordings_cron_token';

  if v_token is null then
    return jsonb_build_object('abiertas', v_abiertas, 'despertada', false,
                              'error', 'falta el secreto recordings_cron_token en vault');
  end if;

  perform net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/recordings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', v_token
    ),
    body := jsonb_build_object('action', 'sweep'),
    timeout_milliseconds := 120000
  );

  return jsonb_build_object('abiertas', v_abiertas, 'despertada', true);
end;
$$;

revoke all on function public.cerrar_grabaciones_huerfanas_tick() from public, anon, authenticated;

select cron.schedule(
  'cerrar-grabaciones-huerfanas',
  '*/2 * * * *',
  $$select public.cerrar_grabaciones_huerfanas_tick();$$
);
