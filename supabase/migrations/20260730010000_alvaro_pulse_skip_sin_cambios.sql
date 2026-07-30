-- El pulso a Álvaro se mandaba cada 2h aunque los números fueran IDÉNTICOS al anterior:
-- 8 pulsos en 7 días = 38% de todo lo que el bot le manda a su DM, y no respondió
-- ninguno. Ahora, si el bloque de métricas es exactamente igual al del último pulso
-- del día, NO se manda. Así el pulso solo interrumpe cuando algo cambió.
CREATE OR REPLACE FUNCTION public.alvaro_pulse(p_dry_run boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant uuid := '30869615-f579-4981-8a1f-dbebc61eae2d';
  v_dm uuid := '9eb0f764-cf6e-4d8f-87e0-c7b9cdc2d17f';
  v_when text := to_char(now() at time zone 'America/Bogota','HH24:MI');
  v_mgr text;
  v_body text;
  v_last text;
begin
  with ga as (
    select manager_name, count(*) as need, count(*) filter (where quadrant='critico') as crit
    from get_manager_growth_feed(v_tenant) group by 1
  ),
  sc as (
    select manager_name,
      count(days_since_contact) as silent,
      count(*) filter (where days_since_contact is null) as sin_reg
    from get_manager_silent_creators(v_tenant, 3) group by 1
  )
  select string_agg(
    format('· *%s*: %s creadoras para empujar (%s críticas) · %s con 3+ días sin contacto%s',
      split_part(coalesce(ga.manager_name, sc.manager_name),' ',1),
      coalesce(ga.need,0), coalesce(ga.crit,0), coalesce(sc.silent,0),
      case when coalesce(sc.sin_reg,0) > 0 then format(' (+%s sin registro)', sc.sin_reg) else '' end),
    E'\n' order by coalesce(ga.manager_name, sc.manager_name))
  into v_mgr
  from ga full join sc on sc.manager_name = ga.manager_name;

  v_body := format(E'📊 *Pulso del equipo* — hoy %s (Bogotá)\n\n%s\n\n_Managers: promo (Promolog) + ingreso (BLU) mes a la fecha; contacto por la línea de Managers. "Sin registro" = sin saliente por la línea de Managers desde 16/7 (no prueba abandono). Escribime acá si querés el detalle de alguna._',
                   v_when, coalesce(v_mgr, '· sin datos'));

  if p_dry_run then
    return v_body;
  end if;

  -- ANTI-RUIDO: si el último pulso de hoy tiene EXACTAMENTE el mismo bloque de
  -- métricas, no interrumpimos de nuevo.
  select body into v_last
  from whatsapp_messages
  where group_id = v_dm and is_from_bot and body like '%Pulso del equipo%'
    and sent_at >= (now() at time zone 'America/Bogota')::date
  order by sent_at desc limit 1;

  if v_mgr is not null and v_last is not null and position(v_mgr in v_last) > 0 then
    return 'skipped_sin_cambios';
  end if;

  perform net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/whatsapp-send',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='supabase_anon_key'),
      'X-Cron-Token',(select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
    body := jsonb_build_object('group_id', v_dm::text, 'body', v_body),
    timeout_milliseconds := 30000);
  return v_body;
end;
$function$;
