-- El resumen de permisos se solicita en toda la aplicación. Resuelve los
-- puestos y sus alcances en conjunto, conservando bloqueos y excepciones.
create or replace function public.mis_funciones_posicion()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 with yo as materialized(select (select auth.uid()) id), estado as materialized(
   select yo.id,public.posiciones_controlan(yo.id) aplica,public.es_dueno(yo.id) dueno,
     coalesce((select m.deshabilitada from public.personas_borrador_marcas m where m.user_id=yo.id),false) bloqueada,
     case when public.es_dueno(yo.id) then '{}'::text[] else coalesce((select r.denegadas from public.personas_accesos_revision r where r.user_id=yo.id),'{}') end denegadas
   from yo
 ), puestos as materialized(
   select p.* from public.posiciones_borrador p
   join public.posiciones_borrador_personas a on a.posicion_id=p.id
   join public.tenant_members m on m.user_id=a.user_id and m.tenant_id=p.tenant_id
   join yo on yo.id=a.user_id where p.activa
 ), checks as(
   select x.key,bool_or(x.value='true'::jsonb) permitida
   from puestos p cross join lateral jsonb_each(p.checks) x group by x.key
 ), alcances as(
   select c.clave,max(case when p.acceso_total then 3 else
     case coalesce(p.alcances->>c.fila,'all') when 'all' then 3 when 'subordinates' then 2 else 1 end end) nivel
   from public.posiciones_funciones_catalogo() c join puestos p
     on p.acceso_total or p.checks->c.clave='true'::jsonb
   group by c.clave
 ) select jsonb_build_object(
   'uid',e.id,'aplica',e.aplica,'bloqueada',e.bloqueada,
   'total',not e.bloqueada and (e.dueno or exists(select 1 from puestos p where p.acceso_total)),
   'denegadas',to_jsonb(e.denegadas),
   'alcances',coalesce((select jsonb_object_agg(c.clave,
     case when not e.aplica then null
       when e.bloqueada or (not e.dueno and (c.clave=any(e.denegadas) or a.nivel is null)) then 'none'
       when e.dueno then 'all'
       else case a.nivel when 3 then 'all' when 2 then 'subordinates' when 1 then 'self' else 'none' end end)
     from public.posiciones_funciones_catalogo() c left join alcances a on a.clave=c.clave),'{}'::jsonb),
   'checks',case when e.bloqueada then '{}'::jsonb else coalesce((select jsonb_object_agg(c.key,c.permitida and not(c.key=any(e.denegadas))) from checks c),'{}'::jsonb) end
 ) from estado e;
$$;

-- La puerta de revisión de Argos se consulta en toda la aplicación. Evalúa el
-- mismo permiso una vez por persona del período, no por cada caso repetido.
create or replace function public.argos_casos_bloqueo()
returns table(debe boolean,pendientes integer,total integer)
language sql stable security definer set search_path=public as $$
 with yo as materialized(select (select auth.uid()) id), casos as materialized(
   select c.user_id,c.dia,c.veredicto from public.argos_casos c
   where c.dia < (now() at time zone 'America/Bogota')::date
     and c.dia >= (now() at time zone 'America/Bogota')::date - 14
 ), personas as materialized(select distinct user_id from casos), autorizadas as materialized(
   select p.user_id from personas p,yo where public.puede_vigilar_a(yo.id,p.user_id)
 ), visibles as materialized(
   select c.dia,c.veredicto from casos c join autorizadas a on a.user_id=c.user_id
 ), mios as(
   select v.veredicto from visibles v where v.dia in(select dia from visibles where veredicto is null)
 ), conteo as(
   select count(*) filter(where veredicto is null)::integer pendientes,count(*)::integer total from mios
 ) select (public.tiene_funcion(yo.id,'N:argos.casos.obligado') and not public.es_dueno(yo.id)
     and public.tiene_funcion(yo.id,'N:argos.casos.juzgar') and c.pendientes>0) debe,
   c.pendientes,c.total from yo cross join conteo c;
$$;
