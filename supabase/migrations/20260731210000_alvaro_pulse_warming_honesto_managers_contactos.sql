-- alvaro_pulse v2 — pulso honesto (31/07):
--
-- WARMING: el pulso decía "sin reporte hoy" por persona cuando no había reporte
-- FORMAL cargado, y se leía como "el equipo no hizo nada" — falso: los cuatro
-- llevaban 2,8-4h en Hubstaff y venían hablando en el grupo desde las 09:39.
-- Ahora distingue: reporte formal → como antes; sin reporte formal → señales
-- reales del día (horas Hubstaff EN VIVO + última participación en el grupo +
-- contenido de ayer); sin nada → "sin actividad registrada". Si el feed de
-- Hubstaff está viejo (>30 min: franjas fijas de 10 min + lag de poll 2-5 ⇒
-- peor caso normal 12-15; mismo umbral que la tool de #1030) lo DICE en vez de
-- imputar 0h.
--
-- MANAGERS: se agrega "contactadas hoy" por manager. La línea es COMPARTIDA
-- (un solo número): la atribución NO es por quién tipeó sino por la cuenta Kash
-- de la creadora — Plus=Carolina, Massive=Fabiana (creator_business.kash_type;
-- fallback manager asignada). Port fiel del match de get_manager_contact_activity
-- (_shared/agent-tools/managers.ts): canonical_phone + últimos 10 dígitos, y
-- fallback últimos 8 SOLO si esa cola es de UNA única creadora. ⚠️ Si cambia la
-- tool, sincronizar este match. Con contactadas bajo la meta horaria dice
-- "vamos bajos" (meta ≈ 1 contactada/hora desde las 10: 11h→2 · 13h→4 · 15h→6
-- · 17h→8 · 19h→10), y avisa la concentración cuando 2 creadoras se llevan
-- ≥50% de los mensajes del día (caso real: 46 de 72 a solo 2).
--
-- VENTAS: bullet "conviene que intervengas" con reglas fijas: confirmadas de
-- ≥$10k/mes frenadas 3+ días sin pasar a Completada (máx 3, por monto).
create or replace function public.alvaro_pulse(p_dry_run boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_tenant uuid := '30869615-f579-4981-8a1f-dbebc61eae2d';
  v_dm uuid := '9eb0f764-cf6e-4d8f-87e0-c7b9cdc2d17f';
  v_warming_group uuid := 'a12d9f41-c962-4d98-b0bb-6b2d2573534c';
  v_today date := (now() at time zone 'America/Bogota')::date;
  v_when text := to_char(now() at time zone 'America/Bogota','HH24:MI');
  v_hora int := extract(hour from now() at time zone 'America/Bogota')::int;
  v_start timestamptz := v_today::timestamp at time zone 'America/Bogota';
  v_end timestamptz := (v_today::timestamp at time zone 'America/Bogota') + interval '24 hours';
  -- Meta de contactadas por manager según la hora (~1/hora desde las 10).
  v_meta_contactadas int := greatest(2, v_hora - 9);
  v_mgr text; v_managers text; v_ventas text; v_warming text;
  v_conc text; v_intervencion text;
  v_completadas_hoy int; v_confirmadas int; v_asignadas int;
  v_negociando int; v_interesados int; v_ofrecidos int; v_ganados_mes int;
  v_feed_last timestamptz; v_feed_stale boolean;
begin
  -- Frescura del feed en vivo de Hubstaff (única señal observable: max(starts_at)).
  select max(starts_at) into v_feed_last from hubstaff_activities;
  v_feed_stale := v_feed_last is null or v_feed_last < now() - interval '30 minutes';

  -- ── MANAGERS: radar + contactadas del día (línea compartida, atribución Kash) ──
  with ga as (
    select manager_name, count(*) as need, count(*) filter (where quadrant='critico') as crit
    from get_manager_growth_feed(v_tenant) group by 1
  ),
  sc as (
    select manager_name,
      count(days_since_contact) as silent,
      count(*) filter (where days_since_contact is null) as sin_reg
    from get_manager_silent_creators(v_tenant, 3) group by 1
  ),
  linea as (select id from wa_channels where department='manager' and coalesce(active, true)),
  convs as (select id, contact_id from wa_conversations where channel_id in (select id from linea) and contact_id is not null),
  sal as (
    select c.contact_id, count(*)::int as msgs
    from wa_conversation_messages wm join convs c on c.id = wm.conversation_id
    where wm.direction = 'out' and wm.deleted_at is null and coalesce(wm.status,'') <> 'failed'
      and wm.sent_at >= v_start and wm.sent_at < v_end
    group by 1
  ),
  cr_phone as (
    select cr.id, cr.assigned_manager_profile_id,
           right(public.canonical_phone(coalesce(cr.phone_e164, cr.whatsapp_number, cr.phone)), 10) as key10,
           right(regexp_replace(coalesce(cr.phone_e164, cr.whatsapp_number, cr.phone, ''), '\D', '', 'g'), 8) as key8
    from creators cr where cr.status = 'active'
  ),
  cr10 as (
    select distinct on (key10) key10, id from cr_phone
    where length(key10) = 10
    order by key10, (assigned_manager_profile_id is null)
  ),
  cr8 as (
    select key8, min(id::text)::uuid as id from cr_phone
    where length(key8) = 8
    group by key8 having count(distinct id) = 1
  ),
  matched as (
    select s.msgs, coalesce(c10.id, c8.id) as creator_id
    from sal s
    join wa_contacts ct on ct.id = s.contact_id
    left join cr10 c10 on c10.key10 = right(public.canonical_phone(ct.phone_e164), 10)
    left join cr8 c8 on c10.id is null and c8.key8 = right(regexp_replace(coalesce(ct.phone_e164,''), '\D', '', 'g'), 8)
  ),
  attrib as (
    select m.creator_id, m.msgs,
      case when cb.kash_type = 'Plus' then 'Carolina'
           when cb.kash_type = 'Massive' then 'Fabiana'
           else split_part(coalesce(p.full_name, '(sin manager)'), ' ', 1) end as mgr
    from matched m
    join creators cr on cr.id = m.creator_id
    left join creator_business cb on cb.creator_id = m.creator_id
    left join profiles p on p.id = cr.assigned_manager_profile_id
    where m.creator_id is not null
  ),
  per_mgr as (
    select mgr, count(distinct creator_id)::int as contactadas, sum(msgs)::int as msgs_tot
    from attrib group by mgr
  ),
  por_creadora as (
    select a.creator_id, sum(a.msgs)::int as msgs from attrib a group by 1
  ),
  tot as (select coalesce(sum(msgs),0)::int as t, count(*)::int as n from por_creadora),
  top2 as (
    select coalesce(sum(x.msgs),0)::int as t2,
           string_agg(coalesce(nullif(cr.artistic_name,''), cr.name), ' y ') as nombres
    from (select creator_id, msgs from por_creadora order by msgs desc limit 2) x
    join creators cr on cr.id = x.creator_id
  )
  select
    (select string_agg(
        format('· *%s*: %s creadoras para empujar (%s críticas) · %s con 3+ días sin contacto%s · %s contactadas hoy%s',
          split_part(coalesce(ga.manager_name, sc.manager_name),' ',1),
          coalesce(ga.need,0), coalesce(ga.crit,0), coalesce(sc.silent,0),
          case when coalesce(sc.sin_reg,0) > 0 then format(' (+%s sin registro)', sc.sin_reg) else '' end,
          coalesce(pm.contactadas, 0),
          case when coalesce(pm.contactadas,0) < v_meta_contactadas
               then format(' ⚠️ vamos bajos (esperable ~%s a esta hora)', v_meta_contactadas) else '' end),
        E'\n' order by coalesce(ga.manager_name, sc.manager_name))
      from ga full join sc on sc.manager_name = ga.manager_name
      left join per_mgr pm on pm.mgr = split_part(coalesce(ga.manager_name, sc.manager_name),' ',1)),
    (select case when tot.t >= 10 and tot.n > 2 and top2.t2 * 2 >= tot.t
        then format(E'\n⚠️ Concentración: %s de %s mensajes de la línea fueron a solo 2 creadoras (%s).',
                    top2.t2, tot.t, top2.nombres)
        else '' end
      from tot, top2)
  into v_mgr, v_conc;

  v_managers := format(E'📊 *MANAGERS* — %s (Bogotá)\n\n%s%s\n\n_Promo (Promolog) + ingreso (BLU) mes a la fecha; contacto por la línea de Managers (atribución por cuenta Kash: Plus=Carolina, Massive=Fabiana)._',
                       v_when, coalesce(v_mgr, '· sin datos'), coalesce(v_conc, ''));

  -- ── VENTAS (igual que antes) + cuándo conviene que intervenga el owner ──────
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

  select string_agg(
      format('@%s ($%s/mes, confirmada hace %s días)',
             coalesce(nullif(instagram_handle,''),'(sin handle)'),
             round(monthly_monetization)::text,
             (v_today - confirmed_date::date)::text),
      ' · ' order by monthly_monetization desc)
  into v_intervencion
  from (
    select instagram_handle, monthly_monetization, confirmed_date
    from closer_creators
    where stage = 'Confirmada' and coalesce(monthly_monetization,0) >= 10000
      and confirmed_date is not null and confirmed_date::date <= v_today - 3
    order by monthly_monetization desc limit 3
  ) t;

  v_ventas := format(
    E'💼 *VENTAS* — %s (Bogotá)\n\n'
    '*Reclutamiento (agencia):* %s completadas hoy · %s confirmadas por firmar · %s en pipeline (asignadas).\n'
    '*Productos (Unlimited/CP):* %s negociando · %s interesados · %s ofrecidos · %s ganados este mes.',
    v_when, v_completadas_hoy, v_confirmadas, v_asignadas,
    v_negociando, v_interesados, v_ofrecidos, v_ganados_mes)
    || case when v_intervencion is not null
         then E'\n\n👉 *Conviene que intervengas vos* (alto valor frenado 3+ días sin cierre): ' || v_intervencion
         else '' end;

  -- ── WARMING: reporte formal → señales del día → sin actividad ───────────────
  with miembros as (
    select p.id, m.external_id,
           split_part(coalesce(nullif(p.full_name,''), m.display_name),' ',1) as nombre
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
        where r.user_id = mi.id and r.report_date = v_today and r.role_kind='content') as nota,
      (select coalesce(r.videos_creados,0) + coalesce(r.fotos_creadas,0) from whatsapp_daily_reports r
        where r.user_id = mi.id and r.report_date = v_today - 1) as piezas_ayer,
      (select coalesce(sum(a.tracked_seconds),0)::bigint
        from hubstaff_activities a join hubstaff_members hm on hm.id = a.member_id
        where hm.profile_id = mi.id and a.starts_at >= v_start) as hub_secs,
      (select to_char(max(wm.sent_at) at time zone 'America/Bogota','HH24:MI')
        from whatsapp_messages wm
        where wm.group_id = v_warming_group and wm.sender_external_id = mi.external_id
          and wm.is_from_bot = false and wm.sent_at >= v_start) as ultimo_msg
    from miembros mi
  ),
  con_senales as (
    select d.*,
      concat_ws(' · ',
        case when not v_feed_stale and d.hub_secs > 0
             then format('%sh%sm Hubstaff', (d.hub_secs/3600)::int, lpad(((d.hub_secs % 3600)/60)::int::text, 2, '0')) end,
        case when d.ultimo_msg is not null then 'activo en el grupo ' || d.ultimo_msg end,
        case when coalesce(d.piezas_ayer,0) > 0 then d.piezas_ayer || ' piezas de contenido ayer' end
      ) as senales
    from datos d
  )
  select string_agg(
    '· *' || nombre || '*: ' ||
    case
      when numeros > 0 or leads > 0 or coalesce(videos,0) > 0 or coalesce(fotos,0) > 0 then
        concat_ws(' · ',
          case when numeros > 0 then numeros || (case when numeros=1 then ' número'  else ' números'  end) end,
          case when leads   > 0 then leads   || (case when leads=1   then ' perfil'  else ' perfiles' end) end,
          case when coalesce(videos,0) > 0 then videos || (case when videos=1 then ' video' else ' videos' end) end,
          case when coalesce(fotos,0)  > 0 then fotos  || (case when fotos=1  then ' foto'  else ' fotos'  end) end)
      when nota is not null then 'reportó gestión/contenido'
      when senales <> '' then 'sin reporte formal (' || senales || ')'
      else 'sin actividad registrada' ||
           case when v_feed_stale then '' else ' (0h Hubstaff, sin mensajes en el grupo)' end
    end,
    E'\n' order by (numeros*10 + coalesce(videos,0) + (hub_secs/3600)::int) desc, nombre)
  into v_warming
  from con_senales;

  v_warming := format(E'🔥 *WARMING (AI)* — %s (Bogotá)\n\n%s%s\n\n_Números = quien carga el contacto. "Sin reporte formal" ≠ sin actividad: las señales (Hubstaff/grupo) van entre paréntesis._',
                      v_when, coalesce(v_warming, '· sin datos'),
                      case when v_feed_stale
                        then E'\n⚠️ Hubstaff sin reportar desde ' ||
                             coalesce(to_char(v_feed_last at time zone 'America/Bogota','HH24:MI'), '(nunca)') ||
                             ' — las horas del día no son concluyentes.'
                        else '' end);

  if p_dry_run then
    return v_managers || E'\n\n———\n\n' || v_ventas || E'\n\n———\n\n' || v_warming;
  end if;

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
$fn$;
