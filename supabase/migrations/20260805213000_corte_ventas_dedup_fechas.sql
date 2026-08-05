-- corte_ventas_bloque v2 — la misma venta vivía en dos tablas con fechas distintas y
-- el bot contaba según cuál mirara.
--
-- Caso real (05/08 15:01, Marketing/Ventas): el corte dijo "sin ventas hoy" (correcto:
-- monetization_opportunities tiene a msmartinasmith1 ganada AYER 04/08 18:49, $500).
-- Miguel presionó ("¿estás seguro?") y el bot se plegó usando la OTRA tabla:
-- closer_creators tenía el stage Completada marcado HOY 12:36 → "sí hay una venta hoy,
-- $499" → double-count de la venta de ayer.
--
-- v2: "Ganado HOY" cruza las dos fuentes con dedup por creadora, cada venta sale CON SU
-- HORA, y si un stage se movió hoy sobre una venta ya ganada antes, el bloque lo avisa
-- explícito ("NO es venta nueva de hoy") — el prompt desactiva la pregunta antes de que
-- exista. Complementa la regla MOTOR "dato desafiado = re-verificar, nunca plegarse".

create or replace function public.corte_ventas_bloque()
returns text language sql stable security definer set search_path to 'public'
as $$
  with hoy as (select (now() at time zone 'America/Bogota')::date as d),
  ini as (select ((select d from hoy)::timestamp at time zone 'America/Bogota') as t),
  confirmadas as (
    select count(*) n, coalesce(sum(monthly_monetization),0)::int total
    from closer_creators where stage = 'Confirmada' and coalesce(lead_source,'maven') <> 'agencia'
  ),
  b2b as (
    select count(*) filter (where stage = 'Asignada') as trabajo,
           count(*) filter (where stage = 'Completada') as ganadas
    from closer_creators
    where coalesce(lead_source,'') = 'agencia' and assigned_to is not null
  ),
  abiertos as (
    select count(*) n, coalesce(sum(monthly_value_usd),0)::int total,
           count(*) filter (where monthly_value_usd is not null) con_valor
    from monetization_opportunities
    where stage in ('interested','offered','negotiating')
  ),
  won_hoy as (
    select mo.product, mo.creator_handle, mo.monthly_value_usd, mo.won_at,
           coalesce((select c.id::text from creators c
                     where lower(c.instagram_handle) = lower(mo.creator_handle)
                        or lower(coalesce(c.artistic_name,'')) = lower(mo.creator_handle)
                     limit 1), lower(coalesce(mo.creator_handle,'?'))) as clave_creadora
    from monetization_opportunities mo, ini
    where mo.stage = 'won' and mo.won_at >= ini.t
  ),
  ganado_dedup as (
    select distinct on (clave_creadora, product)
           product, creator_handle, monthly_value_usd, won_at
    from won_hoy
    order by clave_creadora, product, (monthly_value_usd is null), won_at
  ),
  compl_hoy as (
    select cc.instagram_handle, cc.completed_date
    from closer_creators cc, ini
    where cc.deal_type = 'venta_plataforma' and cc.completed_date >= ini.t
  ),
  -- Completadas de hoy SIN venta reciente en monetization: venta real cargada solo
  -- por pipeline → cuenta como de hoy (monto por confirmar).
  compl_nuevas as (
    select ch.* from compl_hoy ch
    where not exists (
      select 1 from monetization_opportunities mo
      where mo.stage = 'won' and mo.won_at >= now() - interval '7 days'
        and lower(coalesce(mo.creator_handle,'')) = lower(ch.instagram_handle))
  ),
  -- Completadas de hoy CUYA venta ya estaba ganada ANTES de hoy: mismo negocio,
  -- solo se movió el stage → NO se cuenta, se avisa.
  compl_ya_contadas as (
    select ch.instagram_handle, ch.completed_date, mo.won_at, mo.monthly_value_usd
    from compl_hoy ch
    join monetization_opportunities mo
      on mo.stage = 'won'
     and lower(coalesce(mo.creator_handle,'')) = lower(ch.instagram_handle)
     and mo.won_at >= now() - interval '7 days'
    cross join ini
    where mo.won_at < ini.t
  ),
  ganado as (
    select string_agg(z.detalle, ' · ') as detalle,
           coalesce(sum(z.usd),0)::int as total_conocido, count(*) as n
    from (
      select replace(g.product,'_',' ') || ' a @' || coalesce(g.creator_handle,'?')
             || coalesce(' ($' || round(g.monthly_value_usd)::text, ' (monto por confirmar')
             || ', hoy ' || to_char(g.won_at at time zone 'America/Bogota','HH24:MI') || ')' as detalle,
             g.monthly_value_usd as usd
      from ganado_dedup g
      union all
      select 'venta plataforma a @' || cn.instagram_handle
             || ' (monto por confirmar, hoy '
             || to_char(cn.completed_date at time zone 'America/Bogota','HH24:MI') || ')', null
      from compl_nuevas cn
    ) z
  ),
  avisos as (
    select string_agg(
      '@' || ya.instagram_handle || ' pasó a Completada hoy '
      || to_char(ya.completed_date at time zone 'America/Bogota','HH24:MI')
      || ' pero su venta figura ganada el '
      || to_char(ya.won_at at time zone 'America/Bogota','DD/MM HH24:MI')
      || coalesce(' ($' || round(ya.monthly_value_usd)::text || ')', '')
      || ' — NO es venta nueva de hoy, no la sumes', E'\n· ') as detalle
    from compl_ya_contadas ya
  ),
  hitos_v as (
    select string_agg(distinct '· ' || m.title, E'\n') as detalle
    from creator_milestones m, hoy
    where m.occurred_on = hoy.d
      and m.kind in ('reunion_agendada','cierre','cerca_de_cierre','en_negociacion')
  )
  select
    '*En la mesa:* '
    || case when c.total > 0 then '$' || c.total || '/mes en ' || c.n || ' confirmadas por firmar'
            when c.n > 0 then c.n || ' confirmadas por firmar (montos sin cargar)'
            else '0 confirmadas por firmar' end
    || ' · ' || a.n || ' productos abiertos' || case when a.con_valor > 0 then ' ($' || a.total || '/mes valorizados)' else '' end
    || case when b.trabajo > 0 then ' · ' || b.trabajo || ' agencias B2B en trabajo' else '' end
    || E'\n*Ganado HOY (' || g.n || ' ventas):* ' || coalesce(g.detalle, 'sin ventas registradas aún')
    || case when g.total_conocido > 0 then ' — $' || g.total_conocido || ' en montos confirmados' else '' end
    || case when av.detalle is not null then E'\n*Ojo — stage movido HOY sobre ventas YA ganadas antes (no sumar):*\n· ' || av.detalle else '' end
    || case when h.detalle is not null then E'\n*Agenda/avances de hoy:*\n' || h.detalle else '' end
  from confirmadas c, abiertos a, b2b b, ganado g, avisos av, hitos_v h;
$$;
