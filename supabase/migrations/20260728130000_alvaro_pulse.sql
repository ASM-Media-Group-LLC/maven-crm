-- alvaro_pulse — "mecanismo de Alvaro": pulso periódico del equipo al DM privado de Alvaro.
--
-- CONTEXTO: Alvaro pidió (27/07) que el bot lo contactara al privado cada ~2h reportándole
-- cómo va el equipo. El bot lo prometió pero NO persistió una fila ejecutable (patrón conocido:
-- promete sin cron/reminder) → nunca disparó. Esta función + cron lo hace de verdad.
--
-- Compone un pulso conciso desde los RPCs de managers (get_manager_growth_feed = promo×ingreso,
-- get_manager_silent_creators = días sin contacto) y lo manda al DM de Alvaro (whatsapp_groups
-- 9eb0f764) vía la edge whatsapp-send (modo ad-hoc {group_id, body}).
--
-- p_dry_run=true → devuelve el texto sin enviar (para previsualizar).
-- Cadencia: cada 2h en horario laboral Bogotá (11,13,15,17,19 = 16,18,20,22,00 UTC).
-- Para pausar: select cron.unschedule('alvaro-pulse');  Para cambiar destino/contenido, editar acá.

create or replace function public.alvaro_pulse(p_dry_run boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_tenant uuid := '30869615-f579-4981-8a1f-dbebc61eae2d';
  v_dm uuid := '9eb0f764-cf6e-4d8f-87e0-c7b9cdc2d17f';  -- DM · Alvaro S
  v_when text := to_char(now() at time zone 'America/Bogota','HH24:MI');
  v_mgr text;
  v_body text;
begin
  with ga as (
    select manager_name, count(*) as need, count(*) filter (where quadrant='critico') as crit
    from get_manager_growth_feed(v_tenant) group by 1
  ),
  sc as (
    select manager_name, count(*) as silent
    from get_manager_silent_creators(v_tenant, 3) group by 1
  )
  select string_agg(
    format('· *%s*: %s creadoras para empujar (%s críticas) · %s con 3+ días sin contacto',
      split_part(coalesce(ga.manager_name, sc.manager_name),' ',1),
      coalesce(ga.need,0), coalesce(ga.crit,0), coalesce(sc.silent,0)),
    E'\n' order by coalesce(ga.manager_name, sc.manager_name))
  into v_mgr
  from ga full join sc on sc.manager_name = ga.manager_name;

  v_body := format(
    E'📊 *Pulso del equipo* — hoy %s (Bogotá)\n\n%s\n\n_Managers: promo (Promolog) + ingreso (BLU) mes a la fecha; contacto por la línea de Managers. Escribime acá si querés el detalle de alguna._',
    v_when, coalesce(v_mgr, '· sin datos'));

  if p_dry_run then
    return v_body;
  end if;

  perform net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/whatsapp-send',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='supabase_anon_key'),
      'X-Cron-Token',(select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
    body := jsonb_build_object('group_id', v_dm::text, 'body', v_body),
    timeout_milliseconds := 30000);
  return v_body;
end;
$function$;

revoke all on function public.alvaro_pulse(boolean) from public, anon;
grant execute on function public.alvaro_pulse(boolean) to service_role;

-- Cron cada 2h en horario laboral (idempotente).
do $$ begin
  perform cron.unschedule('alvaro-pulse');
exception when others then null; end $$;
select cron.schedule('alvaro-pulse', '0 16,18,20,22,0 * * *', 'select public.alvaro_pulse(false);');
