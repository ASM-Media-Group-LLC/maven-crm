-- FIX del anzuelo "0 números" en la nota del cierre (19/08). El campo `numeros` de
-- los insumos se forzaba a 0 para TODOS (greatest(coalesce(...,0), numeros_maven)),
-- así que una persona sin_metricas_tabla — rol infra como Brayan (Granja/CP/Veneno),
-- que NO tiene métrica de números — aparecía con "numeros": 0 y el modelo la penalizó
-- por eso, ignorando la marca sin_metricas_tabla que le decía "evaluá por lo que
-- contó en el grupo". Resultado: Brayan 2.5 el 19/08 por "0 números" que ni es su rol.
-- El fix es SOLO de DISPLAY: numeros = null cuando sin_metricas_tabla. No toca
-- corte_nota_formula, ni nota_sugerida, ni los promedios. Aplicada en prod por MCP;
-- este archivo la versiona en el repo (idempotente, CREATE OR REPLACE).
create or replace function public.corte_cierre_prep(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_tenant uuid := '30869615-f579-4981-8a1f-dbebc61eae2d';
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_ini timestamptz := (now() at time zone 'America/Bogota')::date::timestamp at time zone 'America/Bogota';
  v_es_viernes boolean := extract(dow from (now() at time zone 'America/Bogota'))::int = 5;
  v_es_sabado boolean := extract(dow from (now() at time zone 'America/Bogota'))::int = 6;
  v_fr_max int;
  v_hub_ref numeric;
  v_personas jsonb;
  v_equipo numeric;
  v_empresa numeric;
  v_semana jsonb;
begin
  v_fr_max := case when v_es_sabado then 2 else 5 end;
  v_hub_ref := case when v_es_sabado then 3.5 else 7.0 end;

  -- Se calculan las notas de LOS TRES grupos del régimen en cada llamada (idempotente,
  -- upsert): así el promedio de EMPRESA está completo sin importar qué grupo corre
  -- primero a las 19:00.
  with grupos_corte as (
    select unnest(array[
      'a12d9f41-c962-4d98-b0bb-6b2d2573534c',  -- AI WARMING
      '73a4414e-2546-4ca7-9289-7cbec70b0273',  -- Managers
      'd12ec56f-b324-4369-b72d-7540fb930ef6'   -- Marketing/Ventas
    ]::uuid[]) as gid
  ),
  todos_miembros as (
    select g.gid as group_id, p.id as pid,
           split_part(coalesce(nullif(p.full_name,''), min(m.display_name)),' ',1) as nombre,
           min(m.created_at) as member_since
    from grupos_corte g
    join whatsapp_members m on m.group_id = g.gid and coalesce(m.active, true)
    join profiles p on p.id = m.user_id
    where p.full_name not ilike '%lopez%' and p.full_name not ilike '%Alvaro%'
    group by 1, 2, p.full_name
  ),
  habla as (
    select w.group_id, mm.user_id as pid, count(*) as msgs
    from whatsapp_messages w
    join whatsapp_members mm on mm.group_id = w.group_id and mm.external_id = w.sender_external_id
    where w.group_id in (select gid from grupos_corte)
      and w.is_from_bot = false and w.sent_at >= v_ini
      and length(coalesce(nullif(w.body,''), w.transcribed_text, '')) > 15
    group by 1, 2
  ),
  -- Grupo CASA del día: donde más habló; empate → membresía más antigua. UNA nota por
  -- persona por día (el 04/08 Daniel tuvo 8.6 en WARMING y 7.8 en Ventas a la vez).
  casa as (
    select pid, group_id from (
      select tm.pid, tm.group_id,
             row_number() over (
               partition by tm.pid
               order by coalesce(h.msgs, 0) desc, tm.member_since asc, tm.group_id
             ) as rn
      from todos_miembros tm
      left join habla h on h.pid = tm.pid and h.group_id = tm.group_id
    ) z where rn = 1
  ),
  miembros as (
    select tm.group_id, tm.pid, tm.nombre
    from todos_miembros tm join casa c on c.pid = tm.pid and c.group_id = tm.group_id
  ),
  msgs as (
    select mi.pid,
           count(*) filter (where length(coalesce(nullif(w.body,''), w.transcribed_text, '')) > 15) as msgs_dia,
           count(distinct least(floor((extract(epoch from (w.sent_at at time zone 'America/Bogota') - v_hoy::timestamp) / 3600 - 10) / 2), v_fr_max - 1))
             filter (where (w.sent_at at time zone 'America/Bogota')::time between time '10:00' and time '19:00'
                       and length(coalesce(nullif(w.body,''), w.transcribed_text, '')) > 15) as franjas
    from miembros mi
    join whatsapp_members mm on mm.group_id = mi.group_id and mm.user_id = mi.pid
    join whatsapp_messages w on w.group_id = mi.group_id and w.sender_external_id = mm.external_id
      and w.is_from_bot = false and w.sent_at >= v_ini
    group by 1
  ),
  hub as (
    select hm.profile_id as pid,
           round(coalesce(sum(a.tracked_seconds),0) / 3600.0, 1) as horas,
           round(sum(a.overall_activity * a.tracked_seconds) filter (where a.overall_activity is not null)
                 / nullif(sum(a.tracked_seconds) filter (where a.overall_activity is not null), 0))::int as act
    from hubstaff_members hm
    join hubstaff_activities a on a.member_id = hm.id and a.starts_at >= v_ini
    group by 1
  ),
  rep as (
    select r.user_id as pid, r.contactados, r.respuestas, r.numeros_obtenidos,
           coalesce(r.videos_creados,0) + coalesce(r.fotos_creadas,0) as piezas,
           coalesce(r.posts_subidos,0) as posts, coalesce(r.cuentas_creadas,0) as cuentas
    from whatsapp_daily_reports r where r.report_date = v_hoy
  ),
  extra as (
    select mi.pid,
      (select count(*) from closers_contacts cc where cc.created_by = mi.pid and cc.phone is not null and cc.created_at >= v_ini) as numeros_maven,
      -- Seguimientos a leads en Maven, caiga o no un número: es el trabajo de backlog
      -- que el 04/08 dejó a María invisible para la fórmula (28 toques ese día).
      (select count(*) from closer_contact_history ch where ch.created_by = mi.pid and ch.created_at >= v_ini) as gestiones,
      (select count(*) from leadgen_entries le where le.lg_user_id = mi.pid and le.created_at >= v_ini) as perfiles,
      (select count(*) from closer_creators cc2 where cc2.assigned_to = mi.pid and cc2.confirmed_date >= v_ini) as confirmadas_hoy,
      (select count(*) from closer_creators cc3 where cc3.assigned_to = mi.pid and cc3.completed_date >= v_ini) as completadas_hoy,
      (select count(*) from monetization_opportunities mo where mo.assigned_to = mi.pid and mo.stage='won' and mo.won_at >= v_ini) as ventas_won_hoy
    from miembros mi
  ),
  linea as (select id from wa_channels where department='manager' and coalesce(active, true)),
  convs as (select id, contact_id from wa_conversations where channel_id in (select id from linea) and contact_id is not null),
  sal as (
    select c.contact_id, count(*)::int as msgs
    from wa_conversation_messages wm join convs c on c.id = wm.conversation_id
    where wm.direction = 'out' and wm.deleted_at is null and coalesce(wm.status,'') <> 'failed'
      and wm.sent_at >= v_ini
    group by 1
  ),
  cr_phone as (
    select cr.id, cr.assigned_manager_profile_id,
           right(public.canonical_phone(coalesce(cr.phone_e164, cr.whatsapp_number, cr.phone)), 10) as key10,
           right(regexp_replace(coalesce(cr.phone_e164, cr.whatsapp_number, cr.phone, ''), '\D', '', 'g'), 8) as key8
    from creators cr where cr.status = 'active'
  ),
  cr10 as (
    select distinct on (key10) key10, id from cr_phone where length(key10) = 10
    order by key10, (assigned_manager_profile_id is null)
  ),
  cr8 as (
    select key8, min(id::text)::uuid as id from cr_phone where length(key8) = 8
    group by key8 having count(distinct id) = 1
  ),
  matched as (
    select s.msgs, coalesce(c10.id, c8.id) as creator_id
    from sal s join wa_contacts ct on ct.id = s.contact_id
    left join cr10 c10 on c10.key10 = right(public.canonical_phone(ct.phone_e164), 10)
    left join cr8 c8 on c10.id is null and c8.key8 = right(regexp_replace(coalesce(ct.phone_e164,''), '\D', '', 'g'), 8)
  ),
  contactadas_mgr as (
    select case when cb.kash_type = 'Plus' then 'Carolina'
                when cb.kash_type = 'Massive' then 'Fabiana'
                else split_part(coalesce(p.full_name,'-'),' ',1) end as mgr,
           count(distinct m.creator_id)::int as contactadas
    from matched m
    join creators cr on cr.id = m.creator_id
    left join creator_business cb on cb.creator_id = m.creator_id
    left join profiles p on p.id = cr.assigned_manager_profile_id
    where m.creator_id is not null
    group by 1
  ),
  promos_mgr as (
    select split_part(p.full_name,' ',1) as mgr,
           count(*)::int as roster,
           count(*) filter (where exists (
             select 1 from promolog_entries e
             where e.creator_id = c.id and e.tenant_id = v_tenant
               and e.dia = v_hoy and e.promoted = 'true'))::int as con_promo
    from creators c join profiles p on p.id = c.assigned_manager_profile_id
    where c.status = 'active' group by 1
  ),
  calc as (
    select mi.group_id, mi.pid, mi.nombre,
      coalesce(ms.franjas, 0)::int as franjas,
      coalesce(ms.msgs_dia, 0)::int as msgs_dia,
      case when exists (select 1 from hubstaff_members hmx where hmx.profile_id = mi.pid)
        then coalesce(h.horas, 0) end as hub_h,
      h.act as hub_act,
      r.contactados, r.respuestas, r.numeros_obtenidos, coalesce(r.piezas,0) as piezas,
      coalesce(r.posts,0) as posts,
      x.numeros_maven, x.gestiones, x.perfiles, x.confirmadas_hoy, x.completadas_hoy, x.ventas_won_hoy,
      cm.contactadas, pm.roster, pm.con_promo,
      case
        -- Managers: la promo del roster es el eje (Álvaro puntuó 5.5 con promo 8-11/30
        -- aunque el contacto estuviera bien). 20% contacto, 80% promo.
        when pm.roster is not null then
          0.2 * least(coalesce(cm.contactadas,0) / 8.0, 1) + 0.8 * (pm.con_promo::numeric / nullif(pm.roster,0))
        when x.ventas_won_hoy > 0 then 1.0
        when x.confirmadas_hoy > 0 or x.completadas_hoy > 0 then 0.85
        when coalesce(r.numeros_obtenidos, x.numeros_maven, 0) > 0 or coalesce(r.contactados,0) > 0 then
          0.6 * least(greatest(coalesce(r.numeros_obtenidos,0), x.numeros_maven) / 3.0, 1)
          + 0.4 * least(coalesce(r.contactados,0) / 60.0, 1)
        -- Seguimientos sin número aún: cuentan, con techo 0.7 (tocar leads no puede
        -- valer más que traer resultados).
        when x.gestiones >= 3 then 0.7 * least(x.gestiones / 15.0, 1)
        when coalesce(r.piezas,0) + coalesce(r.posts,0) > 0 then
          least((coalesce(r.piezas,0) + coalesce(r.posts,0)) / 6.0, 1)
        when x.perfiles > 0 then least(x.perfiles / 15.0, 1)
        else null
      end as avance
    from miembros mi
    left join msgs ms on ms.pid = mi.pid
    left join hub h on h.pid = mi.pid
    left join rep r on r.pid = mi.pid
    left join extra x on x.pid = mi.pid
    left join contactadas_mgr cm on cm.mgr = mi.nombre
    left join promos_mgr pm on pm.mgr = mi.nombre
  ),
  notas as (
    select c.*,
      corte_nota_formula(c.franjas, v_fr_max, c.hub_h, v_hub_ref, c.hub_act, c.avance) as nota_sugerida,
      (c.avance is null) as sin_metricas_tabla
    from calc c
  ),
  -- Si la CASA de alguien cambió durante el día, la fila vieja del otro grupo del
  -- mismo día se borra: si no, el promedio de empresa lo contaría dos veces.
  limpiadas as (
    delete from corte_notas cn
    using casa c
    where cn.fecha = v_hoy and cn.profile_id = c.pid and cn.group_id <> c.group_id
      and cn.group_id in (select gid from grupos_corte)
    returning cn.profile_id
  ),
  guardadas as (
    insert into corte_notas (fecha, group_id, profile_id, nombre, nota_sugerida, componentes)
    select v_hoy, n.group_id, n.pid, n.nombre, n.nota_sugerida,
      jsonb_strip_nulls(jsonb_build_object(
        'franjas', n.franjas, 'franjas_max', v_fr_max, 'msgs_dia', n.msgs_dia,
        'hub_h', n.hub_h, 'hub_act', n.hub_act,
        'sin_cuenta_hubstaff', case when n.hub_h is null then true else null end,
        'textos', n.contactados, 'respuestas', n.respuestas,
        'numeros', case when n.sin_metricas_tabla then null else greatest(coalesce(n.numeros_obtenidos,0), coalesce(n.numeros_maven,0)) end,
        'gestiones', nullif(n.gestiones,0),
        'perfiles', nullif(n.perfiles,0), 'piezas', nullif(n.piezas,0), 'posts', nullif(n.posts,0),
        'contactadas', n.contactadas, 'roster', n.roster, 'promos_roster', n.con_promo,
        'confirmadas', nullif(n.confirmadas_hoy,0), 'completadas', nullif(n.completadas_hoy,0),
        'ventas_won', nullif(n.ventas_won_hoy,0),
        'sin_metricas_tabla', case when n.sin_metricas_tabla then true else null end))
    from notas n
    on conflict (fecha, group_id, profile_id) do update
      set nota_sugerida = excluded.nota_sugerida, componentes = excluded.componentes, nombre = excluded.nombre
    returning group_id, profile_id, nombre, nota_sugerida, componentes
  )
  select
    jsonb_agg(jsonb_build_object('nombre', g.nombre, 'nota_sugerida', g.nota_sugerida, 'insumos', g.componentes)
              order by g.nota_sugerida desc nulls last) filter (where g.group_id = p_group_id),
    round(avg(g.nota_sugerida) filter (where g.group_id = p_group_id), 1),
    round(avg(g.nota_sugerida), 1)
  into v_personas, v_equipo, v_empresa
  from guardadas g;

  if v_es_viernes then
    select jsonb_agg(jsonb_build_object('nombre', s.nombre, 'promedio_7d', s.prom, 'dias_con_nota', s.dias, 'mejor', s.mejor, 'peor', s.peor)
                     order by s.prom desc)
    into v_semana
    from (
      select cn.nombre, round(avg(cn.nota_sugerida), 1) as prom, count(*) as dias,
             max(cn.nota_sugerida) as mejor, min(cn.nota_sugerida) as peor
      from corte_notas cn
      where cn.group_id = p_group_id and cn.fecha > v_hoy - 7
      group by cn.nombre
    ) s;
  end if;

  return jsonb_build_object(
    'personas', coalesce(v_personas, '[]'::jsonb),
    'equipo_promedio', v_equipo,
    'empresa_promedio', v_empresa,
    'semana', v_semana
  );
end;
$$;