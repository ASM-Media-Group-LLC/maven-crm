-- CAÍDAS RECIENTES PARA EL HUB DEL SUPERVISOR (Alvaro, 17/11/2026: «aviso
-- automático a la persona y su supervisor»).
--
-- El 16/11 una sola chatter puso 36 de las 37 caídas del día y su supervisor no
-- lo veía. El hub de Cowork (CoworkHostDashboard) suma un chip «Internet
-- inestable · N caídas» a quien se le cayó la llamada 3 veces o más en la última
-- hora (frontend/src/lib/caidasSeguidas.ts). Solo visibilidad: no escribe nada,
-- no manda avisos ni push.
--
-- POR QUÉ UNA RPC Y NO UNA POLÍTICA: llamada_cortes no tiene política de SELECT
-- (la leen solo las funciones del servidor) y cada fila trae el `contexto` con
-- la medición del equipo de la persona. El hub solo necesita un número por
-- persona, así que esta función devuelve eso y nada más, sin abrir la tabla.
--
-- QUIÉN VE A QUIÉN: las MISMAS reglas que Argos (como argos_llamadas_hoy). La
-- puerta es ve_argos() y las filas son las de argos_vigilables(). Sin permiso NO
-- devuelve vacío: lanza 42501, para que la pantalla no diga «nadie se cayó».
--
-- QUÉ CUENTA: solo la fase 'caida' (la que abre cada episodio en que la llamada
-- se cayó de verdad). 'reentrada_agotada' es el final del MISMO episodio y
-- contarla duplicaría; los parpadeos se curan solos; 'recarga' es la página; con
-- el equipo dormido la fase llega como 'equipo_dormido'. Y si 3 personas o más se
-- cayeron con un minuto de diferencia, eso fue el servidor, no su internet: esas
-- caídas no cuentan (en los 7 días al 17/11 nunca se cayeron dos a la vez).
--
-- La ventana se pide en minutos (el hub pide 60) y se acota entre 5 y 180.

create or replace function public.cowork_caidas_recientes(_minutos integer default 60)
returns table (user_id uuid, caidas integer)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_desde timestamptz := now() - make_interval(mins => least(greatest(coalesce(_minutos, 60), 5), 180));
begin
  if not coalesce(public.ve_argos(), false) then
    raise exception 'cowork_caidas_recientes: sin permiso para ver las caídas del equipo' using errcode = '42501';
  end if;

  return query
  with c as (
    select lc.user_id as uid, lc.creado
      from public.llamada_cortes lc
     where lc.creado >= v_desde
       and lc.fase = 'caida'
  ),
  propias as (
    select c.uid
      from c
     where (select count(distinct o.uid)
              from c o
             where o.creado between c.creado - interval '1 minute' and c.creado + interval '1 minute') < 3
  )
  select p.uid, count(*)::int
    from propias p
   where p.uid in (select v.user_id from public.argos_vigilables() v)
   group by p.uid;
end;
$$;

revoke all on function public.cowork_caidas_recientes(integer) from public, anon;
grant execute on function public.cowork_caidas_recientes(integer) to authenticated;

comment on function public.cowork_caidas_recientes(integer) is
  'Hub de Cowork: caídas de llamada (fase caida, sin las caídas generales del servidor) por persona en los últimos N minutos, solo de la gente que el que mira puede vigilar (reglas de Argos). Solo lee.';
