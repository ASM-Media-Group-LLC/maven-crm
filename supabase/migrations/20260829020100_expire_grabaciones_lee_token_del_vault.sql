-- El cron diario de expiración tenía el X-Cron-Token ESCRITO EN TEXTO PLANO
-- dentro de su propio comando, y encima NO era el que la edge function
-- esperaba: devolvía 401 todos los días desde que se creó (21/08/2026).
--
-- Nadie se enteró porque `cron.job_run_details` decía "succeeded":
-- net.http_post solo ENCOLA el pedido, así que el cron se declara exitoso
-- pase lo que pase del otro lado. La luz verde era falsa.
--
-- Consecuencia real: la promesa de "todo se borra a los 90 días" —lo único
-- que hace viable guardar en el disco del VPS— nunca se estaba cumpliendo.
-- No se notó porque la grabación más vieja es del 21/08 y vence el 19/11.
--
-- El token se rotó (Supabase secrets + vault, verificados por digest) y el
-- comando pasa a leerlo del vault, como el resto de los crons.
create or replace function public.expirar_grabaciones_tick()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token text;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'recordings_cron_token';

  if v_token is null then
    return jsonb_build_object('ok', false, 'error', 'falta recordings_cron_token en vault');
  end if;

  perform net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/recordings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', v_token
    ),
    body := jsonb_build_object('action', 'expire'),
    timeout_milliseconds := 150000
  );
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.expirar_grabaciones_tick() from public, anon, authenticated;

select cron.alter_job(74, command => $$select public.expirar_grabaciones_tick();$$);
