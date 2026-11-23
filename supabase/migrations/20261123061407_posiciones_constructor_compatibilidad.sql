-- Definición completa contrastada con producción el 23/11/2026.
-- Conserva la identidad operativa heredada y permite múltiples posiciones.
-- El traductor sigue limitado a KASH hasta implementar organizaciones.

CREATE OR REPLACE FUNCTION public.posiciones_sincronizar(_simular boolean DEFAULT true, _respaldo boolean DEFAULT true)
 RETURNS TABLE(tipo text, quien text, detalle text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  _tenant uuid; _p record; _c record; _u record; _rid uuid;
  _new boolean; _old boolean; _s text; _s_old text; _desired text; _actual text[];
begin
  select tenant_id into _tenant from public.roles_config where name = 'admin' limit 1;
  perform set_config('maven.posiciones_aplicando', 'on', true);
  create temp table if not exists _pos_dif (tipo text, quien text, detalle text) on commit drop;
  truncate _pos_dif;

  -- Varias posiciones conceden la unión de funciones mediante tiene_funcion.
  if (select count(*) from public.tenants) <> 1 or
     exists(select 1 from public.posiciones_borrador where tenant_id is distinct from _tenant) or
     (auth.uid() is not null and _tenant is distinct from public.current_tenant_id()) then
    raise exception 'La traducción de posiciones requiere revisar el ámbito de empresa' using errcode='42501';
  end if;

  if not _simular and _respaldo then
    insert into public.posiciones_respaldo (creado_por, datos) select auth.uid(), jsonb_build_object(
      'roles_config', (select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'is_active', r.is_active, 'description', r.description)) from public.roles_config r),
      'role_permissions', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.role_permissions r),
      'user_roles', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.user_roles r),
      'drive_acceso_extra', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.drive_acceso_extra r),
      'exonerados', (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.profiles where exonera_camara_pantalla),
      'baneados', (select coalesce(jsonb_agg(id), '[]'::jsonb) from auth.users where banned_until is not null and banned_until > now()),
      'roles_calificados', (select to_jsonb(roles_calificados) from public.monitor_config limit 1));
  end if;

  if exists (select 1 from public.posiciones_borrador where rol = 'Editores de contenido exclusivo')
     and exists (select 1 from public.roles_config where name = 'Editor')
     and not exists (select 1 from public.roles_config where name = 'Editores de contenido exclusivo') then
    insert into _pos_dif values ('puesto', 'Editor', 'se renombra a «Editores de contenido exclusivo»');
    if not _simular then
      update public.roles_config set name = 'Editores de contenido exclusivo' where name = 'Editor';
      update public.user_roles set role = 'Editores de contenido exclusivo' where role = 'Editor';
    end if;
  end if;

  for _p in select * from public.posiciones_borrador where rol is not null and rol <> 'admin' order by orden loop
    select id into _rid from public.roles_config
      where name = _p.rol or (_p.rol = 'Editores de contenido exclusivo' and name = 'Editor')
      order by (name = _p.rol) desc limit 1;
    if _rid is null then
      insert into _pos_dif values ('puesto', _p.nombre, 'puesto nuevo');
      if not _simular then
        insert into public.roles_config (tenant_id, name, description, is_active)
        values (_tenant, _p.rol, _p.descripcion, _p.activa) returning id into _rid;
      end if;
    elsif not _simular then
      update public.roles_config set is_active = _p.activa where id = _rid and is_active is distinct from _p.activa;
    end if;

    for _c in select * from public.posiciones_catalogo order by clave loop
      _new := _p.acceso_total or coalesce((_p.checks ->> _c.clave)::boolean, false);
      _old := public.rp_efectivo(_rid, _c.modulo, _c.sub);
      if _new is distinct from _old then
        insert into _pos_dif values ('permiso', _p.nombre, _c.clave || ': ' || case when _new then 'gana' else 'pierde' end);
        if not _simular then
          delete from public.role_permissions where role_id = _rid and module = _c.modulo and submodule is not distinct from _c.sub;
          insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
          values (_rid, _c.modulo, _c.sub, _new, coalesce(_p.alcances ->> _c.fila, 'all'));
        end if;
      end if;
    end loop;

    for _c in select distinct pc.modulo from public.posiciones_catalogo pc
              where pc.sub is not null and (_p.acceso_total or coalesce((_p.checks ->> pc.clave)::boolean, false))
                and not exists (select 1 from public.posiciones_catalogo x where x.modulo = pc.modulo and x.sub is null) loop
      if not public.rp_efectivo(_rid, _c.modulo, null) then
        insert into _pos_dif values ('permiso', _p.nombre, _c.modulo || ': se abre el menú');
        if not _simular then
          delete from public.role_permissions where role_id = _rid and module = _c.modulo and submodule is null;
          insert into public.role_permissions (role_id, module, submodule, can_access, data_scope) values (_rid, _c.modulo, null, true, 'all');
        end if;
      end if;
    end loop;

    for _c in select distinct pc.modulo, pc.fila from public.posiciones_catalogo pc where pc.datos = 'tres' loop
      _s := _p.alcances ->> _c.fila;
      continue when _s is null or _rid is null;
      continue when not exists (select 1 from public.posiciones_catalogo x where x.fila = _c.fila and x.modulo = _c.modulo
                                and (_p.acceso_total or coalesce((_p.checks ->> x.clave)::boolean, false)));
      select data_scope into _s_old from public.role_permissions where role_id = _rid and module = _c.modulo and submodule is null limit 1;
      if _s is distinct from coalesce(_s_old, 'all') then
        insert into _pos_dif values ('datos', _p.nombre, _c.modulo || ': ' || coalesce(_s_old, 'all') || ' → ' || _s);
        if not _simular then
          if _s_old is null then
            insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
            values (_rid, _c.modulo, null, public.rp_efectivo(_rid, _c.modulo, null), _s);
          else
            update public.role_permissions set data_scope = _s where role_id = _rid and module = _c.modulo and submodule is null;
          end if;
        end if;
      end if;
    end loop;
  end loop;

  -- Identidad operativa heredada; los permisos NO se reducen a este rol.
  for _u in
    select pr.id,pr.full_name,
      case when public.es_dueno(pr.id) then 'admin' else (
        select pb.rol from public.posiciones_borrador_personas a
        join public.posiciones_borrador pb on pb.id=a.posicion_id
        where a.user_id=pr.id and pb.activa and pb.rol is not null
        order by (pb.rol='admin') desc,
          exists(select 1 from public.user_roles ur where ur.user_id=pr.id and ur.role=pb.rol) desc,
          pb.orden,pb.id limit 1
      ) end desired
    from public.profiles pr
    where pr.deleted_at is null and exists(select 1 from public.posiciones_borrador_personas a where a.user_id=pr.id)
  loop
    _desired := nullif(_u.desired, '');
    continue when _desired is null;
    select coalesce(array_agg(role order by role), '{}') into _actual from public.user_roles where user_id = _u.id;
    if _actual is distinct from array[_desired] and not (_simular and _desired = 'Editores de contenido exclusivo' and _actual = array['Editor']) then
      insert into _pos_dif values ('persona', _u.full_name, array_to_string(_actual, ', ') || ' → ' || _desired);
      if not _simular then
        if array_length(_actual, 1) = 1 then
          update public.user_roles set role = _desired where user_id = _u.id;
        else
          delete from public.user_roles where user_id = _u.id and role <> _desired;
          insert into public.user_roles (user_id, role, tenant_id) values (_u.id, _desired, _tenant) on conflict (user_id, role) do nothing;
        end if;
      end if;
    end if;
  end loop;

  for _u in
    select pr.id, pr.full_name from public.profiles pr join auth.users au on au.id = pr.id
    where pr.deleted_at is null
      and coalesce(au.raw_app_meta_data ->> 'tipo', '') <> 'creadora'
      and not public.es_dueno(pr.id)
      and exists (select 1 from public.personas_borrador_marcas m where m.user_id = pr.id and m.deshabilitada)
      and (au.banned_until is null or au.banned_until < now())
  loop
    insert into _pos_dif values ('deshabilitar', _u.full_name, 'no puede entrar');
    if not _simular then
      update auth.users set banned_until = 'infinity' where id = _u.id;
      delete from auth.sessions where user_id = _u.id;
    end if;
  end loop;
  for _u in
    select pr.id, pr.full_name from public.profiles pr join auth.users au on au.id = pr.id
    where pr.deleted_at is null and au.banned_until > now()
      and exists (select 1 from public.posiciones_borrador_personas pp where pp.user_id = pr.id)
      and exists (select 1 from public.personas_borrador_marcas m where m.user_id = pr.id and not m.deshabilitada)
  loop
    insert into _pos_dif values ('habilitar', _u.full_name, 'vuelve a entrar');
    if not _simular then update auth.users set banned_until = null where id = _u.id; end if;
  end loop;

  for _u in
    with quiere as (
      select distinct pp.user_id from public.posiciones_borrador_personas pp join public.posiciones_borrador pb on pb.id = pp.posicion_id
      where pb.activa and public.tiene_funcion(pp.user_id,'N:drive.empresa'))
    select q.user_id, true as dar from quiere q where not exists (select 1 from public.drive_acceso_extra d where d.user_id = q.user_id)
    union all
    select d.user_id, false from public.drive_acceso_extra d where not exists (select 1 from quiere q where q.user_id = d.user_id)
  loop
    insert into _pos_dif values ('drive', (select full_name from public.profiles where id = _u.user_id),
      case when _u.dar then 'gana las unidades de la empresa' else 'pierde las unidades de la empresa (conserva lo compartido)' end);
    if not _simular then
      if _u.dar then insert into public.drive_acceso_extra (user_id, nota) values (_u.user_id, 'posición') on conflict do nothing;
      else delete from public.drive_acceso_extra where user_id = _u.user_id; end if;
    end if;
  end loop;

  for _u in
    select pr.id, pr.full_name, not (public.exige_camara(pr.id) or public.exige_pantalla(pr.id)) as quiere
    from public.profiles pr
    left join public.personas_borrador_marcas m on m.user_id = pr.id
    where pr.deleted_at is null and exists (select 1 from public.posiciones_borrador_personas pp where pp.user_id = pr.id)
      and coalesce(pr.exonera_camara_pantalla, false) is distinct from not (public.exige_camara(pr.id) or public.exige_pantalla(pr.id))
  loop
    insert into _pos_dif values ('camara', _u.full_name, case when _u.quiere then 'ya no está obligado a cámara ni pantalla' else 'vuelve a estar obligado' end);
    if not _simular then update public.profiles set exonera_camara_pantalla = _u.quiere where id = _u.id; end if;
  end loop;

  for _c in select pb.rol, not (pb.pide_camara or pb.pide_pantalla) as quiere
             from public.posiciones_borrador pb where pb.rol is not null and pb.rol <> 'admin' loop
    if exists (select 1 from public.roles_config rc where rc.name = _c.rol
                and coalesce(rc.exonera_camara_pantalla, false) is distinct from _c.quiere) then
      insert into _pos_dif values ('camara', _c.rol, case when _c.quiere then 'el puesto ya no pide cámara ni pantalla' else 'el puesto pide cámara o pantalla' end);
      if not _simular then update public.roles_config set exonera_camara_pantalla = _c.quiere where name = _c.rol; end if;
    end if;
  end loop;

  if exists (select 1 from public.posiciones_borrador where rol = 'Marketing')
     and not exists (select 1 from public.monitor_config where 'Marketing' = any (roles_calificados)) then
    insert into _pos_dif values ('argos', 'Marketing', 'Argos los sigue calificando (cámara y pantalla)');
    if not _simular then update public.monitor_config set roles_calificados = array_append(roles_calificados, 'Marketing'); end if;
  end if;

  if not _simular then
    insert into public.app_flags (key, enabled, note, updated_at) values ('posiciones_mandan', true, 'Ajustes → Posiciones manda', now())
    on conflict (key) do update set enabled = true, updated_at = now();
  end if;

  return query select d.tipo, d.quien, d.detalle from _pos_dif d order by 1, 2, 3;
end $function$;



-- El traductor es interno. Las rutas públicas autorizan antes de llamarlo.
revoke all on function public.posiciones_sincronizar(boolean,boolean) from public,anon,authenticated;
create or replace function public.posiciones_aplicar(_simular boolean default true,_respaldo boolean default true)
returns table(tipo text,quien text,detalle text) language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is not null and not public.es_dueno(auth.uid()) then
   raise exception 'Solo el dueño aplica las posiciones' using errcode='42501';
 end if;
 return query select * from public.posiciones_sincronizar(_simular,_respaldo);
end $$;
