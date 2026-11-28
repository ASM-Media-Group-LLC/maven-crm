-- TURNOS: LOS CONFLICTOS A LA VISTA (Alvaro, 27/11/2026: «tomando en cuenta que
-- hagan conflictos»). Quien tiene varios puestos con turnos distintos y no tiene
-- turno propio: se usa el del primer puesto (orden de Posiciones) y aquí se avisa,
-- para que RR. HH. le ponga el suyo en Horarios del equipo. Solo lectura: misma
-- función de 20261127190845_turnos_de_la_empresa.sql con la clave «conflictos».
create or replace function public.turnos_de_mi_empresa()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with emp as (select public.empresa_de((select auth.uid())) as id),
  varios as (
    select bp.user_id,
           jsonb_agg(jsonb_build_object('puesto', pb.nombre, 'turno', t.nombre) order by pb.orden) as puestos,
           (array_agg(t.nombre order by pb.orden))[1] as usa
      from public.posiciones_borrador_personas bp
      join public.posiciones_borrador pb on pb.id = bp.posicion_id and pb.activa
      join public.turnos_empresa t on t.id = pb.turno_id
      join public.profiles p on p.id = bp.user_id and p.deleted_at is null and p.turno_empresa_id is null
     where pb.tenant_id = (select id from emp)
     group by bp.user_id
    having count(distinct pb.turno_id) > 1
  )
  select jsonb_build_object(
    'puede_editar', public.puedo_editar_turnos_empresa(),
    'turnos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'nombre', t.nombre,
        'entrada', to_char(t.hora_entrada, 'HH24:MI'), 'salida', to_char(t.hora_salida, 'HH24:MI'),
        'activa', t.activa,
        'puestos', (select count(*) from public.posiciones_borrador pb where pb.turno_id = t.id),
        'personas', (select count(*) from public.profiles p where p.turno_empresa_id = t.id and p.deleted_at is null))
      order by t.orden, t.nombre)
      from public.turnos_empresa t where t.tenant_id = (select id from emp)), '[]'::jsonb),
    'puestos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pb.id, 'nombre', pb.nombre, 'turno_id', pb.turno_id,
        'puede', public.puede_cambiar_turno_puesto(pb.id),
        'personas', (select count(*) from public.posiciones_borrador_personas bp where bp.posicion_id = pb.id))
      order by pb.orden, pb.nombre)
      from public.posiciones_borrador pb
     where pb.activa and pb.tenant_id = (select id from emp)), '[]'::jsonb),
    'conflictos', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', v.user_id, 'nombre', p.full_name, 'usa', v.usa, 'puestos', v.puestos) order by p.full_name)
      from varios v join public.profiles p on p.id = v.user_id
     where public.puede_editar_horario(v.user_id) or public.es_dueno((select auth.uid()))), '[]'::jsonb));
$function$;
revoke all on function public.turnos_de_mi_empresa() from public, anon;
grant execute on function public.turnos_de_mi_empresa() to authenticated;
