-- Consultar las posiciones al autorizar, no solo al traducirlas a roles.
-- La traducción anterior omite filas que coinciden con el permiso del módulo;
-- eso pierde concesiones explícitas y deja que el nivel/admin gane a la casilla.
-- No modifica asignaciones ni checks existentes. Sin posición se conserva el
-- comportamiento anterior (decisión del 19/11). Una posición inactiva no concede.
create or replace function public.posiciones_controlan(_uid uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select _uid is not null and (
    coalesce((select m.deshabilitada from public.personas_borrador_marcas m where m.user_id=_uid),false)
    or (
      coalesce((select f.enabled from public.app_flags f where f.key='posiciones_mandan'),false)
      and (public.es_dueno(_uid) or exists (
        select 1 from public.posiciones_borrador_personas pp where pp.user_id=_uid
      ))
    )
  );
$$;

-- NULL = función todavía ajena al catálogo o persona bajo el sistema anterior.
-- false = denegación explícita: el consumidor no debe volver al nivel del rol.
create or replace function public.posicion_decision(_uid uuid, _clave text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when _uid is null then false
    when coalesce((select m.deshabilitada from public.personas_borrador_marcas m where m.user_id=_uid),false) then false
    when not public.posiciones_controlan(_uid) then null
    when not (_clave like 'N:%' or exists(select 1 from public.posiciones_catalogo c where c.clave=_clave)) then null
    else public.tiene_funcion(_uid,_clave)
  end;
$$;

create or replace function public.can_use_module_function(
  _user_id uuid, _module text, _submodule text,
  _fallback_group text default 'supervisor_or_above'
)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_explicit boolean;
begin
  if _user_id is null then return false; end if;
  v_explicit := public.posicion_decision(_user_id,_module || '|' || coalesce(_submodule,'*'));
  if v_explicit is not null then return v_explicit; end if;
  if public.is_in_role_group(_user_id,'admin') then return true; end if;
  select rp.can_access into v_explicit
  from public.user_roles ur
  join public.roles_config rc on rc.name=ur.role and rc.tenant_id=ur.tenant_id and rc.is_active
  join public.role_permissions rp on rp.role_id=rc.id
  where ur.user_id=_user_id and rp.module=_module and rp.submodule=_submodule
  order by rp.can_access desc limit 1;
  if v_explicit is not null then return v_explicit; end if;
  return public.is_in_role_group(_user_id,_fallback_group);
end;
$$;

-- Solo devuelve los permisos del usuario autenticado. No expone personas,
-- nombres de puestos ni configuración de otros usuarios.
create or replace function public.mis_funciones_posicion()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with yo as (select (select auth.uid()) id),
  estado as (
    select yo.id, public.posiciones_controlan(yo.id) aplica,
      coalesce((select m.deshabilitada from public.personas_borrador_marcas m where m.user_id=yo.id),false) bloqueada
    from yo
  ),
  puestos as (
    select pb.* from public.posiciones_borrador pb
    join public.posiciones_borrador_personas pp on pp.posicion_id=pb.id
    join yo on yo.id=pp.user_id where pb.activa
  ),
  checks as (
    select x.key, bool_or(x.value='true'::jsonb) permitida
    from puestos p cross join lateral jsonb_each(p.checks) x group by x.key
  )
  select jsonb_build_object(
    'uid', e.id, 'aplica',e.aplica, 'bloqueada',e.bloqueada,
    'total',not e.bloqueada and (public.es_dueno(e.id) or exists(select 1 from puestos p where p.acceso_total)),
    'checks',case when e.bloqueada then '{}'::jsonb else coalesce((select jsonb_object_agg(c.key,c.permitida) from checks c),'{}'::jsonb) end
  ) from estado e;
$$;

revoke all on function public.posiciones_controlan(uuid) from public, anon;
revoke all on function public.posicion_decision(uuid,text) from public, anon;
revoke all on function public.can_use_module_function(uuid,text,text,text) from public, anon;
revoke all on function public.mis_funciones_posicion() from public, anon;
grant execute on function public.posiciones_controlan(uuid) to authenticated;
grant execute on function public.posicion_decision(uuid,text) to authenticated;
grant execute on function public.can_use_module_function(uuid,text,text,text) to authenticated;
grant execute on function public.mis_funciones_posicion() to authenticated;
