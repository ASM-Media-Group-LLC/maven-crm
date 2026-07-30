-- alvaro_pulse: pasa de UN mensaje (solo Managers) a TRES secciones que Álvaro (owner) pidió
-- por su DM: Managers / Ventas / Warming. En vivo manda 3 mensajes separados ("seccionado en
-- tres textos"); en dry_run los devuelve concatenados para revisar sin enviar.
--
-- Fuentes por sección (todo SQL — la función es plpgsql, NO puede llamar las tools TS):
--  · Managers: get_manager_growth_feed + get_manager_silent_creators (igual que antes).
--  · Ventas: reclutamiento (closer_creators: Confirmada / Completada hoy / pipeline Asignada) +
--    productos (monetization_opportunities: negociando / interesados / ganados).
--  · Warming: por PERSONA del grupo AI WARMING — números de CUALQUIERA (closers_contacts, no
--    solo LLG) + contenido (whatsapp_daily_reports role_kind='content'). Nada de rankings
--    tenant-wide (por eso Clari alucinaba un "Andrés"): esto lee SOLO los 4 miembros del grupo.
CREATE OR REPLACE FUNCTION public.alvaro_pulse(p_dry_run boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant uuid := '30869615-f579-4981-8a1f-dbebc61eae2d';
  v_dm uuid := '9eb0f764-cf6e-4d8f-87e0-c7b9cdc2d17f';
  v_warming_group uuid := 'a12d9f41-c962-4d98-b0bb-6b2d2573534c';
  v_today date := (now() at time zone 'America/Bogota')::date;
  v_when text := to_char(now() at time zone 'America/Bogota','HH24:MI');
  v_mgr text; v_managers text; v_ventas text; v_warming text;
  -- ventas
  v_completadas_hoy int; v_confirmadas int; v_asignadas int;
  v_negociando int; v_interesados int; v_ofrecidos int; v_ganados_mes int;
begin
  ------------------------------------------------------------------ MANAGERS
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

  v_managers := format(E'📊 *MANAGERS* — %s (Bogotá)\n\n%s\n\n_Promo (Promolog) + ingreso (BLU) mes a la fecha; contacto por la línea de Managers._',
                       v_when, coalesce(v_mgr, '· sin datos'));

  ------------------------------------------------------------------ VENTAS
  select
    count(*) filter (where stage='Completada' and confirmed_date::date = v_today),
    count(*) filter (where stage='Confirmada'),
    count(*) filter (where stage='Asignada')
  into v_completadas_hoy, v_confirmadas, v_asignadas
  from closer_creators;

  select
    count(*) filter (where stage='negotiating'),
    count(*) filter (where stage='interested'),
    count(*) filter (where stage='offered'),
    count(*) filter (where stage='won' and updated_at >= date_trunc('month', v_today))
  into v_negociando, v_interesados, v_ofrecidos, v_ganados_mes
  from monetization_opportunities where tenant_id = v_tenant;

  v_ventas := format(
    E'💼 *VENTAS* — %s (Bogotá)\n\n'
    '*Reclutamiento (agencia):* %s completadas hoy · %s confirmadas por firmar · %s en pipeline (asignadas).\n'
    '*Productos (Unlimited/CP):* %s negociando · %s interesados · %s ofrecidos · %s ganados este mes.',
    v_when, v_completadas_hoy, v_confirmadas, v_asignadas,
    v_negociando, v_interesados, v_ofrecidos, v_ganados_mes);

  ------------------------------------------------------------------ WARMING (por persona del grupo)
  with miembros as (
    select p.id, split_part(coalesce(nullif(p.full_name,''), m.display_name),' ',1) as nombre
    from whatsapp_members m join profiles p on p.id = m.user_id
    where m.group_id = v_warming_group
      and p.full_name not ilike '%lopez%' and p.full_name not ilike '%Alvaro%'
  ),
  datos as (
    select mi.nombre, mi.id,
      (select count(*) from closers_contacts cc
        where cc.created_by = mi.id and cc.phone is not null and cc.created_at::date = v_today) as numeros,
      (select count(*) from leadgen_entries le
        where le.lg_user_id = mi.id and le.created_at::date = v_today) as leads,
      (select r.videos_creados from whatsapp_daily_reports r
        where r.user_id = mi.id and r.report_date = v_today) as videos,
      (select r.fotos_creadas from whatsapp_daily_reports r
        where r.user_id = mi.id and r.report_date = v_today) as fotos,
      (select nullif(trim(r.raw_text),'') from whatsapp_daily_reports r
        where r.user_id = mi.id and r.report_date = v_today and r.role_kind='content') as nota
    from miembros mi
  )
  select string_agg(
    '· *' || nombre || '*: ' ||
    concat_ws(' · ',
      case when numeros > 0 then numeros || (case when numeros=1 then ' número'  else ' números'  end) end,
      case when leads   > 0 then leads   || (case when leads=1   then ' perfil'  else ' perfiles' end) end,
      case when videos  > 0 then videos  || (case when videos=1  then ' video'   else ' videos'   end) end,
      case when fotos   > 0 then fotos   || (case when fotos=1   then ' foto'    else ' fotos'    end) end,
      case when numeros=0 and leads=0 and coalesce(videos,0)=0 and coalesce(fotos,0)=0
           then coalesce(case when nota is not null then 'reportó gestión/contenido' end, 'sin reporte hoy') end),
    E'\n' order by (numeros*10 + coalesce(videos,0)) desc, nombre)
  into v_warming
  from datos;

  v_warming := format(E'🔥 *WARMING (AI)* — %s (Bogotá)\n\n%s\n\n_Números = quien carga el contacto (no solo Daniel). Contenido = lo registrado ese día._',
                      v_when, coalesce(v_warming, '· sin datos'));

  ------------------------------------------------------------------ SALIDA
  if p_dry_run then
    return v_managers || E'\n\n———\n\n' || v_ventas || E'\n\n———\n\n' || v_warming;
  end if;

  -- En vivo: 3 mensajes separados (Álvaro pidió "seccionado en tres textos").
  perform net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/whatsapp-send',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='supabase_anon_key'),
      'X-Cron-Token',(select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
    body := jsonb_build_object('group_id', v_dm::text, 'body', v_managers),
    timeout_milliseconds := 30000);
  perform pg_sleep(1);
  perform net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/whatsapp-send',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='supabase_anon_key'),
      'X-Cron-Token',(select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
    body := jsonb_build_object('group_id', v_dm::text, 'body', v_ventas),
    timeout_milliseconds := 30000);
  perform pg_sleep(1);
  perform net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/whatsapp-send',
    headers := jsonb_build_object('Content-Type','application/json',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='supabase_anon_key'),
      'X-Cron-Token',(select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
    body := jsonb_build_object('group_id', v_dm::text, 'body', v_warming),
    timeout_milliseconds := 30000);
  return 'sent_3_sections';
end;
$function$;
