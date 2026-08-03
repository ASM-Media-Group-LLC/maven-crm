-- alvaro_pulse v3.2 — cortes reales en WARMING + hitos anotados en Managers/Ventas
-- (pedido de Jhon 03/08, tras leer el grupo AI Warming del día).
--
-- WARMING: el bot SÍ registraba los cortes ("✓ Registré a Daniel: 15 textos…"
-- → fila real en whatsapp_daily_reports) pero el pulso no los leía: mostraba
-- "19 perfiles" (leadgen de Maven) e ignoraba el reporte que Álvaro pidió cada
-- 2 horas. Ahora la línea abre con el corte del día (textos/resp/números o
-- videos/fotos/posts) y quien no registró corte sale "sin corte aún" — SIN
-- perder sus señales (Hubstaff, grupo): la lección v2 de no confundir "sin
-- reporte" con "no hizo nada" sigue vigente. + "Del grupo hoy" operativo
-- (recuperada/baneada/campaña…), con los @lids limpiados del extracto.
--
-- MANAGERS/VENTAS: "Del grupo hoy" por keywords agarró ruido (María corrigiendo
-- al bot) y se perdió lo importante. Fuente primaria ahora = creator_milestones
-- (lo ANOTADO: retención/accesos/cierres/meets/casos de éxito); las keywords
-- quedan solo de RESPALDO cuando no hay ningún hito del día.
--
-- Se conserva de v3/v3.1: gate de domingo, promo hoy por manager, atribución
-- key10/key8+kash_type, caídas a día vencido, guarda del $0 fantasma, feed_stale.
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
  v_managers_group uuid := '73a4414e-2546-4ca7-9289-7cbec70b0273';
  v_ventas_group uuid := 'd12ec56f-b324-4369-b72d-7540fb930ef6';
  v_today date := (now() at time zone 'America/Bogota')::date;
  v_when text := to_char(now() at time zone 'America/Bogota','HH24:MI');
  v_hora int := extract(hour from now() at time zone 'America/Bogota')::int;
  v_start timestamptz := v_today::timestamp at time zone 'America/Bogota';
  v_end timestamptz := (v_today::timestamp at time zone 'America/Bogota') + interval '24 hours';
  v_meta_contactadas int := greatest(2, v_hora - 9);
  v_es_domingo boolean := extract(dow from (now() at time zone 'America/Bogota'))::int = 0;
  v_dom_fichados text;
  v_managers text; v_ventas text; v_warming text;
  v_promo text; v_contacto text; v_hub_mgr text; v_caidas text; v_lbl_caida text;
  v_grupo_m text; v_grupo_v text; v_grupo_w text; v_hub_clo text;
  v_hitos_m text; v_hitos_v text;
  v_conc text; v_intervencion text;
  v_completadas_hoy int; v_confirmadas int; v_asignadas int;
  v_negociando int; v_interesados int; v_ofrecidos int; v_ganados_mes int;
  v_feed_last timestamptz; v_feed_stale boolean;
  -- Caída a día vencido: tramo 1..(día de ayer) de este mes vs el MISMO tramo del
  -- mes pasado. Hoy 3 → "1–2 ago vs 1–2 jul", como lo pidió Jhon, con fechas dichas.
  v_dcorte int := extract(day from v_today)::int - 1;
  v_prev_ini date := (date_trunc('month', v_today) - interval '1 month')::date;
  v_meses constant text[] := array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
begin
  -- ── GATE DE DOMINGO (pedido de Álvaro 02/08; ver migración domingos) ──
  if v_es_domingo and v_hora not in (12, 18) then return 'skip: domingo, solo 12:00 y 18:00'; end if;
  if (not v_es_domingo) and v_hora in (12, 18) then return 'skip: 12/18 son horarios de domingo'; end if;

  -- Frescura del feed en vivo de Hubstaff (única señal observable: max(starts_at)).
  select max(starts_at) into v_feed_last from hubstaff_activities;
  v_feed_stale := v_feed_last is null or v_feed_last < now() - interval '30 minutes';

  -- ── HITOS DEL DÍA (creator_milestones) ─────────────────────────────────────
  -- "Noticias de hoy": anotados hoy (aunque hayan ocurrido antes — se dice la
  -- fecha) u ocurridos hoy. Managers ve estados (retención/accesos/salidas);
  -- Ventas ve plata (cierres/meets/negociación/casos de éxito).
  select string_agg(
      '· ' || etiqueta || ' '
      || case when nullif(creator_handle,'') is not null then '*' || creator_handle || '*: ' else '' end
      || title
      || case when occurred_on <> v_today then ' (' || to_char(occurred_on,'DD/MM') || ')' else '' end,
      E'\n' order by occurred_on desc, created_at desc)
  into v_hitos_m
  from (
    select m.creator_handle, m.title, m.occurred_on, m.created_at,
           case m.kind when 'en_retencion' then '🚨' when 'quito_accesos' then '🔒'
                       when 'salida_anunciada' then '👋' when 'record_ingreso' then '🏆'
                       else '📌' end as etiqueta
    from creator_milestones m
    where m.tenant_id = v_tenant
      and (m.created_at >= v_start or m.occurred_on = v_today)
      and m.kind in ('en_retencion','quito_accesos','salida_anunciada','record_ingreso')
    order by m.occurred_on desc, m.created_at desc limit 5
  ) t;

  select string_agg(
      '· ' || etiqueta || ' '
      || case when nullif(creator_handle,'') is not null then '*' || creator_handle || '*: ' else '' end
      || title
      || case when occurred_on <> v_today then ' (' || to_char(occurred_on,'DD/MM') || ')' else '' end,
      E'\n' order by occurred_on desc, created_at desc)
  into v_hitos_v
  from (
    select m.creator_handle, m.title, m.occurred_on, m.created_at,
           case m.kind when 'caso_exito' then '📈' when 'venta_producto' then '💰'
                       when 'cierre' then '✅' when 'reunion_agendada' then '📅'
                       when 'en_negociacion' then '🤝' when 'cerca_de_cierre' then '🔥'
                       else '📌' end as etiqueta
    from creator_milestones m
    where m.tenant_id = v_tenant
      and (m.created_at >= v_start or m.occurred_on = v_today)
      and m.kind in ('caso_exito','venta_producto','cierre','reunion_agendada','en_negociacion','cerca_de_cierre')
    order by m.occurred_on desc, m.created_at desc limit 5
  ) t;

  -- ── MANAGERS · promo de HOY (X/N por manager) ──────────────────────────────
  -- Cuenta creadoras DISTINTAS con promoted='true' HOY (columna `dia`, Bogotá).
  -- Es un PISO durante el día: la promo se detecta a medida que corren los scans.
  select string_agg(
      '· ' || mgr || ': *' || con_promo || '/' || total || '* promocionaron hoy',
      E'\n' order by mgr)
  into v_promo
  from (
    select split_part(p.full_name,' ',1) as mgr,
           count(*)::int as total,
           count(*) filter (where exists (
             select 1 from promolog_entries e
             where e.creator_id = c.id and e.tenant_id = v_tenant
               and e.dia = v_today and e.promoted = 'true'))::int as con_promo
    from creators c join profiles p on p.id = c.assigned_manager_profile_id
    where c.status = 'active' and c.assigned_manager_profile_id is not null
    group by 1
  ) t;

  -- ── MANAGERS · contactadas hoy (línea compartida, atribución Kash) ─────────
  with sc as (
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
  por_creadora as (select a.creator_id, sum(a.msgs)::int as msgs from attrib a group by 1),
  tot as (select coalesce(sum(msgs),0)::int as t, count(*)::int as n from por_creadora),
  top2 as (
    select coalesce(sum(x.msgs),0)::int as t2,
           string_agg(coalesce(nullif(cr.artistic_name,''), cr.name), ' y ') as nombres
    from (select creator_id, msgs from por_creadora order by msgs desc limit 2) x
    join creators cr on cr.id = x.creator_id
  )
  select
    (select string_agg(
        '· ' || mg.mgr || ': *' || coalesce(pm.contactadas,0) || ' contactadas* · '
        || coalesce(sc.silent,0) || ' con 3+ días sin contacto'
        || case when coalesce(sc.sin_reg,0) > 0 then ' (+' || sc.sin_reg || ' sin registro)' else '' end
        || case when (not v_es_domingo) and coalesce(pm.contactadas,0) < v_meta_contactadas
                then ' ⚠️ bajo (esperable ~' || v_meta_contactadas || ')' else '' end,
        E'\n' order by mg.mgr)
      -- Se parte del ROSTER de managers, no de sc: una manager con CERO
      -- silenciosas desaparecería si la lista naciera del RPC de silenciosas.
      from (select distinct split_part(p2.full_name,' ',1) as mgr
              from creators c2 join profiles p2 on p2.id = c2.assigned_manager_profile_id
             where c2.status = 'active') mg
      left join sc on split_part(sc.manager_name,' ',1) = mg.mgr
      left join per_mgr pm on pm.mgr = mg.mgr),
    (select case when tot.t >= 10 and tot.n > 2 and top2.t2 * 2 >= tot.t
        then E'\n⚠️ Concentración: ' || top2.t2 || ' de ' || tot.t || ' mensajes de la línea fueron a solo 2 creadoras (' || top2.nombres || ').'
        else '' end
      from tot, top2)
  into v_contacto, v_conc;

  -- ── MANAGERS · horas y actividad de las managers en Hubstaff hoy ───────────
  select string_agg(
      '· ' || nombre || ': ' || (secs/3600)::int || 'h' || lpad(((secs%3600)/60)::int::text,2,'0')
      || coalesce(' · ' || act || '% act.', ''),
      E'\n' order by secs desc)
  into v_hub_mgr
  from (
    select split_part(p.full_name,' ',1) as nombre,
           sum(a.tracked_seconds)::bigint as secs,
           round(sum(a.overall_activity * a.tracked_seconds) filter (where a.overall_activity is not null)
                 / nullif(sum(a.tracked_seconds) filter (where a.overall_activity is not null), 0))::int as act
    from (select distinct assigned_manager_profile_id as pid from creators
          where status='active' and assigned_manager_profile_id is not null) mgrs
    join profiles p on p.id = mgrs.pid
    join hubstaff_members hm on hm.profile_id = p.id
    join hubstaff_activities a on a.member_id = hm.id and a.starts_at >= v_start
    group by 1 having sum(a.tracked_seconds) > 0
  ) t;

  -- ── MANAGERS · modelos en caída (día vencido, mismo tramo del mes pasado) ──
  if v_dcorte >= 1 then
    v_lbl_caida := '1–' || v_dcorte || ' ' || v_meses[extract(month from v_today)::int]
                 || ' vs 1–' || v_dcorte || ' ' || v_meses[extract(month from v_prev_ini)::int];
    select string_agg(
        '· ' || nombre || ': $' || act || ' vs $' || prev || ' (' || pct || '%)' || flag,
        E'\n' order by pct)
    into v_caidas
    from (
      select coalesce(nullif(c.artistic_name,''), c.name) as nombre,
             round(coalesce(sum(e.total_gross) filter (where e.date >= date_trunc('month',v_today)::date and e.date <= v_today - 1), 0))::int as act,
             round(coalesce(sum(e.total_gross) filter (where e.date >= v_prev_ini and e.date <= v_prev_ini + (v_dcorte-1)), 0))::int as prev,
             round(((coalesce(sum(e.total_gross) filter (where e.date >= date_trunc('month',v_today)::date and e.date <= v_today - 1), 0)
                     - coalesce(sum(e.total_gross) filter (where e.date >= v_prev_ini and e.date <= v_prev_ini + (v_dcorte-1)), 0))
                    / nullif(sum(e.total_gross) filter (where e.date >= v_prev_ini and e.date <= v_prev_ini + (v_dcorte-1)), 0)) * 100)::int as pct,
             -- Últimos 2 días en ~$0 tras venir facturando = probable corte de
             -- lectura (quitó accesos), no caída real. Se marca, no se esconde.
             case when coalesce((select sum(e2.total_gross) from creator_daily_earnings e2
                                 where e2.creator_id = c.id and e2.date >= v_today - 2), 0) < 5
                  then ' ⚠️ sin lectura BLU reciente (¿quitó accesos?)' else '' end as flag
      from creators c
      join creator_daily_earnings e on e.creator_id = c.id
      where c.status = 'active' and c.assigned_manager_profile_id is not null
        and e.date >= v_prev_ini and e.date <= v_today - 1
      group by c.id, nombre
      having coalesce(sum(e.total_gross) filter (where e.date >= v_prev_ini and e.date <= v_prev_ini + (v_dcorte-1)), 0) >= 100
         and coalesce(sum(e.total_gross) filter (where e.date >= date_trunc('month',v_today)::date and e.date <= v_today - 1), 0)
             < 0.75 * coalesce(sum(e.total_gross) filter (where e.date >= v_prev_ini and e.date <= v_prev_ini + (v_dcorte-1)), 0)
      order by 4 limit 5
    ) t;
  else
    v_lbl_caida := 'día 1 del mes';
    v_caidas := '· la comparación mes vs mes arranca mañana (hoy no hay día vencido del mes)';
  end if;

  -- ── MANAGERS · respaldo por keywords (solo si no hay hitos del día) ────────
  -- Los @lids/menciones se limpian del extracto para que se lea como frase.
  select string_agg('· ' || nombre || ': "' || left(limpio, 110) || '…"', E'\n' order by ult)
  into v_grupo_m
  from (
    select * from (
      select coalesce(split_part(nullif(pf.full_name,''),' ',1), wm.sender_display_name) as nombre,
             regexp_replace(regexp_replace(coalesce(nullif(wm.body,''), wm.transcribed_text, ''),
               '@[0-9]{6,}[[:space:]]*', '', 'g'), E'[\\n\\r\\t ]+', ' ', 'g') as limpio,
             max(wm.sent_at) as ult
      from whatsapp_messages wm
      left join whatsapp_members mm on mm.group_id = wm.group_id and mm.external_id = wm.sender_external_id
      left join profiles pf on pf.id = mm.user_id
      where wm.group_id = v_managers_group and wm.is_from_bot = false
        and wm.sent_at >= v_start
        and coalesce(nullif(wm.body,''), wm.transcribed_text, '') ~* '(retenc|quit[oó] (los )?accesos|carta de terminac|renunci|se va|firm[oó]|cerr[oó]|ballena|subi[oó]|subieron|let.?s ?shoot|letshoot|unlimited|reuni[oó]n|caso de [eé]xito)'
      group by 1, 2
    ) s
    where length(s.limpio) > 25
    order by s.ult desc limit 3
  ) t;

  v_managers :=
    E'📊 *MANAGERS* — ' || v_when || E' (Bogotá)\n'
    || E'\n*Promo hoy* (piso: se detecta durante el día)\n' || coalesce(v_promo, '· sin datos')
    || E'\n\n*Contacto hoy* (línea Managers · Plus=Carolina, Massive=Fabiana)\n' || coalesce(v_contacto, '· sin datos') || coalesce(v_conc, '')
    || E'\n\n*Managers en Hubstaff hoy*\n' || coalesce(v_hub_mgr, '· sin horas registradas' || case when v_feed_stale then ' (feed atrasado)' else '' end)
    || E'\n\n*Modelos en caída* (' || v_lbl_caida || E', día vencido)\n' || coalesce(v_caidas, '· ninguna con caída fuerte (≥25%)')
    || case when v_dcorte >= 1 then E'\n_Ojo: ayer aún liquida (BLU ~2 días de lag) — las caídas pueden achicarse._' else '' end
    || case when v_hitos_m is not null then E'\n\n*Hitos de hoy*\n' || v_hitos_m
            when v_grupo_m is not null then E'\n\n*Del grupo hoy*\n' || v_grupo_m
            else '' end;

  -- ── VENTAS ─────────────────────────────────────────────────────────────────
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

  -- Closers / closer supervisors en Hubstaff hoy (horas + % actividad).
  select string_agg(
      '· ' || nombre || ': ' || (secs/3600)::int || 'h' || lpad(((secs%3600)/60)::int::text,2,'0')
      || coalesce(' · ' || act || '% act.', ''),
      E'\n' order by secs desc)
  into v_hub_clo
  from (
    select split_part(p.full_name,' ',1) as nombre,
           sum(a.tracked_seconds)::bigint as secs,
           round(sum(a.overall_activity * a.tracked_seconds) filter (where a.overall_activity is not null)
                 / nullif(sum(a.tracked_seconds) filter (where a.overall_activity is not null), 0))::int as act
    from (select distinct ur.user_id from user_roles ur where ur.role::text ilike '%closer%') cl
    join profiles p on p.id = cl.user_id
    join hubstaff_members hm on hm.profile_id = p.id
    join hubstaff_activities a on a.member_id = hm.id and a.starts_at >= v_start
    group by 1 having sum(a.tracked_seconds) > 0
  ) t;

  -- VENTAS · respaldo por keywords (solo si no hay hitos del día).
  select string_agg('· ' || nombre || ': "' || left(limpio, 110) || '…"', E'\n' order by ult)
  into v_grupo_v
  from (
    select * from (
      select coalesce(split_part(nullif(pf.full_name,''),' ',1), wm.sender_display_name) as nombre,
             regexp_replace(regexp_replace(coalesce(nullif(wm.body,''), wm.transcribed_text, ''),
               '@[0-9]{6,}[[:space:]]*', '', 'g'), E'[\\n\\r\\t ]+', ' ', 'g') as limpio,
             max(wm.sent_at) as ult
      from whatsapp_messages wm
      left join whatsapp_members mm on mm.group_id = wm.group_id and mm.external_id = wm.sender_external_id
      left join profiles pf on pf.id = mm.user_id
      where wm.group_id = v_ventas_group and wm.is_from_bot = false
        and wm.sent_at >= v_start
        and coalesce(nullif(wm.body,''), wm.transcribed_text, '') ~* '(retenc|quit[oó] (los )?accesos|firm[oó]|cerr[oó]|subi[oó]|subieron|gracias a|let.?s ?shoot|letshoot|unlimited|caso de [eé]xito|reuni[oó]n de cierre)'
      group by 1, 2
    ) s
    where length(s.limpio) > 25
    order by s.ult desc limit 3
  ) t;

  v_ventas :=
    E'💼 *VENTAS* — ' || v_when || E' (Bogotá)\n'
    || E'\n*Pipeline*\n'
    || '· Reclutamiento: *' || v_completadas_hoy || ' completadas hoy* · ' || v_confirmadas || ' confirmadas por firmar · ' || v_asignadas || E' asignadas\n'
    || '· Productos: ' || v_negociando || ' negociando · ' || v_interesados || ' interesados · ' || v_ofrecidos || ' ofrecidos · *' || v_ganados_mes || ' ganados este mes*'
    || E'\n\n*Closers en Hubstaff hoy*\n' || coalesce(v_hub_clo, '· sin horas registradas' || case when v_feed_stale then ' (feed atrasado)' else '' end)
    || case when v_hitos_v is not null then E'\n\n*Hitos de hoy*\n' || v_hitos_v
            when v_grupo_v is not null then E'\n\n*Del grupo hoy*\n' || v_grupo_v
            else '' end
    || case when v_intervencion is not null
         then E'\n\n👉 *Conviene que intervengas* (alto valor frenado 3+ días sin cierre): ' || v_intervencion
         else '' end;

  -- ── WARMING · corte del día primero, señales después ───────────────────────
  -- El corte es la fila de whatsapp_daily_reports que el bot registra cuando
  -- reportan en el grupo (Álvaro los pidió cada 2h). "sin corte aún" NO borra
  -- las señales: alguien sin reporte pero con 4h de Hubstaff se ve trabajando.
  with miembros as (
    select p.id, m.external_id,
           split_part(coalesce(nullif(p.full_name,''), m.display_name),' ',1) as nombre
    from whatsapp_members m join profiles p on p.id = m.user_id
    where m.group_id = v_warming_group
      and p.full_name not ilike '%lopez%' and p.full_name not ilike '%Alvaro%'
  ),
  rep as (
    select r.user_id, r.created_at, r.contactados, r.respuestas, r.numeros_obtenidos,
           r.videos_creados, r.fotos_creadas, r.posts_subidos, r.cuentas_creadas
    from whatsapp_daily_reports r where r.report_date = v_today
  ),
  datos as (
    select mi.nombre, mi.id,
      rep.created_at as corte_at,
      rep.contactados, rep.respuestas, rep.numeros_obtenidos,
      rep.videos_creados, rep.fotos_creadas, rep.posts_subidos, rep.cuentas_creadas,
      (select count(*) from closers_contacts cc
        where cc.created_by = mi.id and cc.phone is not null and cc.created_at::date = v_today) as numeros,
      (select count(*) from leadgen_entries le
        where le.lg_user_id = mi.id and le.created_at::date = v_today) as leads,
      (select coalesce(r2.videos_creados,0) + coalesce(r2.fotos_creadas,0) from whatsapp_daily_reports r2
        where r2.user_id = mi.id and r2.report_date = v_today - 1) as piezas_ayer,
      (select coalesce(sum(a.tracked_seconds),0)::bigint
        from hubstaff_activities a join hubstaff_members hm on hm.id = a.member_id
        where hm.profile_id = mi.id and a.starts_at >= v_start) as hub_secs,
      (select round(sum(a.overall_activity * a.tracked_seconds) filter (where a.overall_activity is not null)
                    / nullif(sum(a.tracked_seconds) filter (where a.overall_activity is not null), 0))::int
        from hubstaff_activities a join hubstaff_members hm on hm.id = a.member_id
        where hm.profile_id = mi.id and a.starts_at >= v_start) as hub_act,
      (select to_char(max(wm.sent_at) at time zone 'America/Bogota','HH24:MI')
        from whatsapp_messages wm
        where wm.group_id = v_warming_group and wm.sender_external_id = mi.external_id
          and wm.is_from_bot = false and wm.sent_at >= v_start) as ultimo_msg
    from miembros mi left join rep on rep.user_id = mi.id
  ),
  render as (
    select d.nombre, d.corte_at, d.hub_secs,
      -- Números del corte: los de llg (textos/resp/números) se muestran aunque
      -- sean 0 — el 0 ES la noticia (Daniel: 15 textos · 0 resp · 0 números).
      nullif(concat_ws(' · ',
        case when d.contactados is not null then d.contactados || ' textos' end,
        case when d.respuestas is not null then d.respuestas || ' resp' end,
        case when d.numeros_obtenidos is not null then d.numeros_obtenidos || ' números' end,
        case when coalesce(d.videos_creados,0) > 0 then d.videos_creados || ' videos' end,
        case when coalesce(d.fotos_creadas,0) > 0 then d.fotos_creadas || ' fotos' end,
        case when coalesce(d.posts_subidos,0) > 0 then d.posts_subidos || ' posts' end,
        case when coalesce(d.cuentas_creadas,0) > 0 then d.cuentas_creadas || ' cuentas' end
      ), '') as reporte,
      nullif(concat_ws(' · ',
        case when d.leads > 0 then d.leads || ' perfiles cargados' end,
        case when d.numeros > 0 then d.numeros || ' números en Maven' end,
        case when not v_feed_stale and d.hub_secs > 0
             then (d.hub_secs/3600)::int || 'h' || lpad(((d.hub_secs%3600)/60)::int::text,2,'0') || ' Hubstaff'
                  || coalesce(' (' || d.hub_act || '% act.)', '') end,
        case when d.ultimo_msg is not null then 'en el grupo ' || d.ultimo_msg end,
        case when d.corte_at is null and coalesce(d.piezas_ayer,0) > 0 then d.piezas_ayer || ' piezas ayer' end
      ), '') as senales
    from datos d
  )
  select string_agg(
    case when corte_at is null and senales is null
      then '· *' || nombre || '*: sin señales hoy (ni Hubstaff, ni mensajes, ni números)'
           || case when v_feed_stale then ' — feed de Hubstaff atrasado, las horas no son concluyentes' else '' end
      else '· *' || nombre || '*'
           || case when corte_at is not null
                then ' — corte ' || to_char(corte_at at time zone 'America/Bogota','HH24:MI') || ': '
                     || coalesce(reporte, 'registrado')
                else ' — sin corte aún' end
           || case when senales is not null then E'\n   ' || senales else '' end
    end,
    E'\n' order by (corte_at is null), hub_secs desc nulls last, nombre)
  into v_warming
  from render;

  -- WARMING · lo operativo del grupo (recuperadas/baneadas/campañas/bloqueos).
  select string_agg('· ' || nombre || ': "' || left(limpio, 110) || '…"', E'\n' order by ult)
  into v_grupo_w
  from (
    select * from (
      select coalesce(split_part(nullif(pf.full_name,''),' ',1), wm.sender_display_name) as nombre,
             regexp_replace(regexp_replace(coalesce(nullif(wm.body,''), wm.transcribed_text, ''),
               '@[0-9]{6,}[[:space:]]*', '', 'g'), E'[\\n\\r\\t ]+', ' ', 'g') as limpio,
             max(wm.sent_at) as ult
      from whatsapp_messages wm
      left join whatsapp_members mm on mm.group_id = wm.group_id and mm.external_id = wm.sender_external_id
      left join profiles pf on pf.id = mm.user_id
      where wm.group_id = v_warming_group and wm.is_from_bot = false
        and wm.sent_at >= v_start
        and coalesce(nullif(wm.body,''), wm.transcribed_text, '') ~* '(recuperad|banead|verificad|verificaci|campañ|aprob[oó]|granja|bloquead|suspendid|ca[ií]da)'
      group by 1, 2
    ) s
    where length(s.limpio) > 15
    order by s.ult desc limit 3
  ) t;

  v_warming := E'🔥 *WARMING (AI)* — ' || v_when || E' (Bogotá)\n\n' || coalesce(v_warming, '· sin datos')
    || case when v_grupo_w is not null then E'\n\n*Del grupo hoy*\n' || v_grupo_w else '' end
    || E'\n\n_corte = reporte del día registrado por el bot · perfiles/números = cargados en Maven · % = actividad Hubstaff._'
    || case when v_feed_stale
         then E'\n⚠️ Hubstaff sin reportar desde ' ||
              coalesce(to_char(v_feed_last at time zone 'America/Bogota','HH24:MI'), '(nunca)') ||
              ' — las horas del día no son concluyentes.'
         else '' end;

  -- Domingo: sin control de gente, pero si alguien SÍ fichó, una línea informativa.
  if v_es_domingo then
    select string_agg(nombre || ' ' || horas, ' · ' order by secs desc) into v_dom_fichados
    from (
      select hm.name as nombre, sum(a.tracked_seconds) as secs,
             (sum(a.tracked_seconds)/3600)::int || 'h' || lpad((((sum(a.tracked_seconds)::int % 3600))/60)::text, 2, '0') as horas
      from hubstaff_activities a join hubstaff_members hm on hm.id = a.member_id
      where a.starts_at >= v_start
      group by hm.name
      having sum(a.tracked_seconds) >= 900
      order by 2 desc limit 8
    ) t;
    if v_dom_fichados is not null then
      v_managers := v_managers || E'\n\n_Fichando hoy domingo (Hubstaff): ' || v_dom_fichados || '_';
    end if;
  end if;

  if p_dry_run then
    if v_es_domingo then return v_managers || E'\n\n———\n\n' || v_ventas || E'\n\n———\n\n(domingo: WARMING no se manda)'; end if;
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
  if not v_es_domingo then
    perform pg_sleep(1);
    perform net.http_post(
      url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/whatsapp-send',
      headers := jsonb_build_object('Content-Type','application/json',
        'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='supabase_anon_key'),
        'X-Cron-Token',(select decrypted_secret from vault.decrypted_secrets where name='cron_internal_token')),
      body := jsonb_build_object('group_id', v_dm::text, 'body', v_warming),
      timeout_milliseconds := 30000);
    return 'sent_3_sections';
  end if;
  return 'sent_2_sections_domingo';
end;
$function$;
