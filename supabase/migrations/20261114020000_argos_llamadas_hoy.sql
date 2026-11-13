-- ARGOS › LLAMADAS: A QUIÉN SE LE CORTA HOY Y POR QUÉ (Alvaro, 13/11/2026).
--
-- Hoy hubo 87 cortes en 12 horas, casi todos parpadeos cortos que se recuperan,
-- y la causa que más sale es «internet de subida» o «sin causa clara». Los datos
-- ya existían (llamada_cortes, llamada_salud, diagnostico_de_llamada) pero solo
-- los leía el vigía de las 4 caídas por hora. Esta función los junta para la
-- pestaña «Llamadas» de Argos: una fila por persona con cortes en el día de
-- Bogotá, lo grave aparte, la causa y el consejo, la medición real de internet
-- (prueba de velocidad) y si la cancelación de ruido está corriendo.
--
-- Quién ve a quién: las MISMAS reglas que el resto de Argos. La puerta es
-- ve_argos() (dueño, admins, RR. HH., supervisores y jefes con equipo a cargo) y
-- las filas son las de argos_vigilables() más uno mismo, igual que
-- argos_dia_personas. Sin permiso NO devuelve vacío: lanza un error, para que la
-- pantalla diga «no se pudo» en vez de «nadie tiene cortes».
--
-- Qué cuenta como corte: lo mismo que diagnostico_de_llamada y el vigía
-- (parpadeo_ok, caida, reentrada_agotada, recarga). Graves = los que tumbaron la
-- llamada (caida, reentrada_agotada, recarga).
--
-- LA CAUSA CON LA PRUEBA REAL. `subida_kbps` de llamada_salud es el
-- availableOutgoingBitrate de WebRTC: una estimación del control de congestión
-- que refleja lo que la llamada está usando, no la capacidad del internet (en
-- producción hay muestras de 1.000.000 kbps). Desde este cambio, en Cowork se
-- mide la velocidad de verdad (datos.prueba = { subida_mbps, bajada_mbps, ms,
-- at }, ver frontend/src/lib/pruebaDeRed.ts). Aquí, y SOLO aquí:
--   · si diagnostico dice «internet_subida» pero la última prueba del día mide
--     1,5 Mbps o más de subida y el codificador casi nunca estuvo limitado por
--     ancho de banda (menos del 25 % de las muestras), la causa se recalcula sin
--     la subida;
--   · si diagnostico no encuentra causa y la prueba mide menos de 1,5 Mbps, la
--     causa es la subida;
--   · el consejo cita los kbps de la prueba real, nunca la estimación.
-- diagnostico_de_llamada y vigilar_cortes_de_llamada NO se tocan: el aviso
-- automático sigue con su regla de hoy.
--
-- Solo lee. No escribe en ninguna tabla.

create or replace function public.argos_llamadas_hoy()
returns table (
  user_id uuid,
  nombre text,
  equipo text,
  cortes integer,
  graves integer,
  ultimo_corte timestamptz,
  horas integer[],
  causa text,
  causa_texto text,
  causa_estimada text,
  consejo text,
  subida_estimada_kbps integer,
  rtt_ms integer,
  perdida_pct numeric,
  nav text,
  nucleos integer,
  prueba_subida_mbps numeric,
  prueba_bajada_mbps numeric,
  prueba_ms integer,
  prueba_subida_tope boolean,
  prueba_at timestamptz,
  nc text,
  nc_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_desde timestamptz := ((now() at time zone 'America/Bogota')::date)::timestamp at time zone 'America/Bogota';
begin
  if not coalesce(public.ve_argos(), false) then
    raise exception 'argos_llamadas_hoy: sin permiso para ver las llamadas del equipo' using errcode = '42501';
  end if;

  return query
  with vis as (
    select v.user_id as uid from public.argos_vigilables() v
  ),
  c as (
    select lc.user_id as uid, lc.fase, lc.creado
      from public.llamada_cortes lc
     where lc.creado >= v_desde
       and lc.fase in ('parpadeo_ok', 'caida', 'reentrada_agotada', 'recarga')
       and (lc.user_id = (select auth.uid()) or lc.user_id in (select vis.uid from vis))
  ),
  pp as (
    select c.uid,
           count(*)::int as n_cortes,
           (count(*) filter (where c.fase in ('caida', 'reentrada_agotada', 'recarga')))::int as n_graves,
           max(c.creado) as ultimo
      from c
     group by c.uid
  ),
  ph as (
    select c.uid, extract(hour from c.creado at time zone 'America/Bogota')::int as h, count(*)::int as n
      from c
     group by c.uid, extract(hour from c.creado at time zone 'America/Bogota')::int
  ),
  base as (
    select pp.uid, pp.n_cortes, pp.n_graves, pp.ultimo,
           pr.full_name as nombre_p,
           public.equipo_de(pp.uid) as equipo_p,
           array(
             select coalesce(ph.n, 0)
               from generate_series(0, 23) as g(h)
               left join ph on ph.uid = pp.uid and ph.h = g.h
              order by g.h
           ) as horas_p,
           d.causa as causa_d, d.recargas as recargas_d,
           d.pct_computador, d.pct_inestable, d.pct_dormida,
           d.subida_kbps as kbps_d, d.rtt_ms as rtt_d, d.perdida_pct as perdida_d,
           d.nav as nav_d, d.nucleos as nucleos_d,
           lim.pct_limitada,
           pru.p as prueba, pru.creado as prueba_creado,
           public.llamada_num(pru.p, 'subida_mbps') as sub_mbps,
           public.llamada_num(pru.p, 'bajada_mbps') as baj_mbps,
           ncs.estado as nc_estado, ncs.creado as nc_creado
      from pp
      join public.profiles pr on pr.id = pp.uid and pr.deleted_at is null
      cross join lateral public.diagnostico_de_llamada(pp.uid, v_desde) d
      -- Qué parte del día el codificador estuvo de verdad limitado por ancho de
      -- banda (señal del navegador, no estimación).
      left join lateral (
        select case when count(*) > 0 then
                 round(100.0 * count(*) filter (where s.datos->>'limite_cam' = 'bandwidth' or s.datos->>'limite_pant' = 'bandwidth') / count(*))::int
               end as pct_limitada
          from public.llamada_salud s
         where s.user_id = pp.uid and s.creado >= v_desde
      ) lim on true
      -- La última prueba de velocidad real del día.
      left join lateral (
        select s.datos->'prueba' as p, s.creado
          from public.llamada_salud s
         where s.user_id = pp.uid and s.creado >= v_desde
           and jsonb_typeof(s.datos->'prueba') = 'object'
         order by s.creado desc
         limit 1
      ) pru on true
      -- Si la cancelación de ruido estaba corriendo en la última muestra que lo dice.
      left join lateral (
        select s.datos->>'nc' as estado, s.creado
          from public.llamada_salud s
         where s.user_id = pp.uid and s.creado >= v_desde
           and jsonb_typeof(s.datos->'nc') = 'string'
         order by s.creado desc
         limit 1
      ) ncs on true
  ),
  conc as (
    select b.*,
      case
        when b.causa_d = 'internet_subida' and b.sub_mbps >= 1.5 and coalesce(b.pct_limitada, 0) < 25 then
          case
            when greatest(b.pct_computador, b.pct_inestable, b.pct_dormida) < 25 then
              case when b.recargas_d >= 2 then 'recargas' else 'sin_causa_clara' end
            when b.pct_computador = greatest(b.pct_computador, b.pct_inestable, b.pct_dormida) then 'computador'
            when b.pct_inestable = greatest(b.pct_computador, b.pct_inestable, b.pct_dormida) then 'internet_inestable'
            else 'pestana_dormida'
          end
        when b.causa_d in ('sin_causa_clara', 'sin_datos') and b.sub_mbps < 1.5 then 'internet_subida'
        else b.causa_d
      end as causa_final
      from base b
  )
  select conc.uid,
         conc.nombre_p,
         conc.equipo_p,
         conc.n_cortes,
         conc.n_graves,
         conc.ultimo,
         conc.horas_p,
         conc.causa_final,
         public.causa_de_llamada_corta(conc.causa_final),
         conc.causa_d,
         public.consejo_de_llamada(conc.causa_final, round(conc.sub_mbps * 1000)::int, conc.rtt_d, conc.perdida_d),
         conc.kbps_d,
         conc.rtt_d,
         conc.perdida_d,
         conc.nav_d,
         conc.nucleos_d,
         conc.sub_mbps,
         conc.baj_mbps,
         public.llamada_num(conc.prueba, 'ms')::int,
         coalesce(conc.prueba->>'subida_tope' = 'true', false),
         conc.prueba_creado,
         conc.nc_estado,
         conc.nc_creado
    from conc
   order by conc.n_cortes desc, conc.n_graves desc, conc.ultimo desc;
end;
$$;

revoke all on function public.argos_llamadas_hoy() from public, anon;
grant execute on function public.argos_llamadas_hoy() to authenticated;

comment on function public.argos_llamadas_hoy() is
  'Argos › Llamadas: cortes de hoy (día de Bogotá) por persona que el que mira puede vigilar, con causa, consejo, prueba de velocidad real y estado de la cancelación de ruido. Solo lee.';
