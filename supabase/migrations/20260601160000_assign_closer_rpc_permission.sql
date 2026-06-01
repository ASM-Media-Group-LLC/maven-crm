-- =============================================================================
-- Fix: asignar contacto a closer sin "duplicate key", gateado por el PERMISO
--      de la UI ("Closers / Asignar Closer"), no por roles hardcodeados.
-- -----------------------------------------------------------------------------
-- Bug reportado:
--   El dialog "Asignar Closer" hacía, del lado del cliente:
--     SELECT closer_creators WHERE source_contact_id = X   (gated por RLS)
--     if (existe) UPDATE assigned_to;  else INSERT ...
--   source_contact_id tiene UNIQUE. Si el caller NO podía VER la fila existente
--   (caso típico: el contacto ya tenía una fila "Nueva" sin asignar, invisible
--   por RLS para quien no es supervisor/admin), el SELECT volvía null -> el
--   código iba al INSERT -> chocaba con
--   "closer_creators_source_contact_id_key".
--   Parchearlo agregando policies por nombre de rol era whack-a-mole.
--
-- Fix:
--   RPC SECURITY DEFINER que hace el chequeo de existencia SERVER-SIDE (inmune a
--   RLS: ve TODAS las filas) y convierte-o-reasigna de forma atómica. La
--   AUTORIZACIÓN cuelga del MISMO permiso que muestra/oculta el botón en la UI
--   (role_permissions: Closers / Asignar Closer), via has_permission().
--
-- Additive. No toca tablas. Reversible (drop de las 2 funciones).
-- =============================================================================

-- has_permission: espejo en SQL de canAccess(module, submodule) del front
-- (frontend/src/hooks/usePermissions.ts). admin => true; sino busca el
-- roles_config activo del rol del user y resuelve role_permissions:
--   submódulo específico  ->  nivel módulo  ->  cualquier submódulo que conceda.
-- Mismo join que ya usan otras policies (ej. "Borrar Calls" en Agency QA).
create or replace function public.has_permission(_user_id uuid, _module text, _submodule text default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
  v_val boolean;
begin
  -- Admin: acceso total (igual que el shortcut isAdmin del front).
  if public.is_in_role_group(_user_id, 'admin') then
    return true;
  end if;

  -- roles_config activo que matchea el rol (text libre) del user.
  select rc.id into v_role_id
  from public.user_roles ur
  join public.roles_config rc on rc.name = ur.role and rc.is_active
  where ur.user_id = _user_id
  limit 1;

  if v_role_id is null then
    return false;
  end if;

  -- 1) submódulo específico (la fila que togglea el admin en la UI).
  if _submodule is not null then
    select rp.can_access into v_val
    from public.role_permissions rp
    where rp.role_id = v_role_id and rp.module = _module and rp.submodule = _submodule
    limit 1;
    if v_val is not null then
      return v_val;
    end if;
  end if;

  -- 2) nivel módulo (sin submódulo).
  select rp.can_access into v_val
  from public.role_permissions rp
  where rp.role_id = v_role_id and rp.module = _module and rp.submodule is null
  limit 1;
  if v_val is not null then
    return v_val;
  end if;

  -- 3) si hay cualquier submódulo del módulo, alcanza con uno que conceda.
  select bool_or(rp.can_access) into v_val
  from public.role_permissions rp
  where rp.role_id = v_role_id and rp.module = _module;

  return coalesce(v_val, false);
end;
$$;
grant execute on function public.has_permission(uuid, text, text) to authenticated, service_role;
comment on function public.has_permission(uuid, text, text) is
  'Espejo SQL de canAccess(module,submodule) del front (usePermissions): admin=true; sino role_permissions del roles_config del rol (specific submodule > module-level > any submodule). Para gatear RPCs con el MISMO permiso que muestra/oculta botones en la UI.';

-- assign_closer_to_contact: convierte un closers_contacts en closer_creators (o
-- reasigna si ya existe por source_contact_id), atómico e inmune a RLS. Devuelve
-- el closer_creators.id. Gateado por el permiso "Closers / Asignar Closer".
create or replace function public.assign_closer_to_contact(p_contact_id uuid, p_closer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_id uuid;
  v_contact public.closers_contacts%rowtype;
begin
  -- AUTORIZACIÓN: mismo permiso que la UI. Si el rol no lo tiene marcado, 403.
  if not public.has_permission(auth.uid(), 'Closers', 'Asignar Closer') then
    raise exception 'No tenés permiso para asignar closers (Closers / Asignar Closer).'
      using errcode = '42501';
  end if;

  select * into v_contact from public.closers_contacts where id = p_contact_id;
  if not found then
    raise exception 'Contacto no encontrado.' using errcode = 'P0002';
  end if;

  -- Chequeo de existencia SERVER-SIDE: el definer ve TODAS las filas (RLS no
  -- aplica), así que SIEMPRE encuentra la fila si ya existe -> nunca duplica.
  select id into v_creator_id
  from public.closer_creators
  where source_contact_id = p_contact_id;

  if v_creator_id is not null then
    -- Ya existe -> reasignar. Si estaba en el pozo 'Nuevo' (sin asignar), pasa a
    -- 'Asignada' + passed_date. Si ya estaba más avanzada, NO la pisamos.
    update public.closer_creators
    set assigned_to = p_closer_id,
        stage       = case when stage = 'Nuevo' then 'Asignada' else stage end,
        passed_date = coalesce(passed_date, current_date)
    where id = v_creator_id;
  else
    -- No existe -> crear ya asignada (stage 'Asignada', no el viejo 'nuevo').
    insert into public.closer_creators (
      instagram_handle, phone, category, source_contact_id,
      assigned_to, stage, passed_date, created_by
    ) values (
      coalesce(nullif(v_contact.handle, ''), nullif(v_contact.name, ''), 'sin_handle'),
      v_contact.phone,
      v_contact.physical_appearance,
      p_contact_id,
      p_closer_id,
      'Asignada',
      current_date,
      auth.uid()
    )
    returning id into v_creator_id;
  end if;

  -- Marcar el contacto como convertido para que no reaparezca como pendiente.
  update public.closers_contacts set status = 'converted' where id = p_contact_id;

  return v_creator_id;
end;
$$;
grant execute on function public.assign_closer_to_contact(uuid, uuid) to authenticated;
revoke execute on function public.assign_closer_to_contact(uuid, uuid) from anon, public;
comment on function public.assign_closer_to_contact(uuid, uuid) is
  'Convierte un closers_contacts en closer_creators (o reasigna si ya existe por source_contact_id), atómico e inmune a RLS. Gateado por has_permission(Closers / Asignar Closer). Devuelve el closer_creators.id.';
