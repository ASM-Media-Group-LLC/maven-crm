-- LAS POSICIONES MANDAN (Alvaro, 19/11/2026: «hagámoslo ahorita», todo de una
-- vez, con botón de regreso de 7 días y sin aviso al equipo).
--
-- Ajustes → Posiciones era un borrador (20261119010000). Esto lo conecta al
-- sistema de permisos que Maven ya usa, SIN reescribir las ~100 pantallas:
--
--   posiciones_aplicar(_simular) traduce el borrador a lo de siempre:
--     · cada posición = un puesto en roles_config (Dueño no: el dueño es admin);
--     · cada check "Modulo|Sub" = role_permissions, pero SOLO se escribe donde el
--       borrador difiere de lo que esa persona ve HOY (rp_efectivo es el espejo
--       exacto de usePermissions.canAccess). Lo que no cambia no se toca;
--     · personas → user_roles (UNA por persona: Maven lee un solo puesto con
--       maybeSingle; los de la posición Admin quedan como 'admin');
--     · «Unidades de la empresa» → drive_acceso_extra;
--     · «No obligado a cámara» → profiles.exonera_camara_pantalla;
--     · «Deshabilitada» y las cuentas sin posición → no entran (banned_until).
--   Con _simular = true solo DEVUELVE las diferencias (la comparación de
--   antes/después que Alvaro pidió) y no toca nada.
--
--   Al aplicar guarda un respaldo completo; posiciones_regresar() lo restaura
--   (7 días). Después de prendido, cada cambio en la pantalla se aplica solo.
--
--   Los checks «nuevo» (N:…: Argos, llamar, archivos, abrir salas, usuarios)
--   siguen como hoy en el código; se conectan uno por uno después (decisión
--   de Alvaro, 19/11). Excepción: N:drive.empresa ya manda (drive_acceso_extra).

-- El banco PGlite no trae todas las tablas/funciones de producción: los
-- cuerpos se validan al correr, y las políticas van solo si existe es_dueno.
set check_function_bodies = off;

create table if not exists public.posiciones_catalogo (
  clave text primary key,
  modulo text not null,
  sub text,
  fila text not null,
  datos text not null check (datos in ('tres','no'))
);
alter table public.posiciones_catalogo enable row level security;
do $pol$ begin
  if to_regprocedure('public.es_dueno(uuid)') is not null then
    drop policy if exists posiciones_catalogo_dueno on public.posiciones_catalogo;
    create policy posiciones_catalogo_dueno on public.posiciones_catalogo for select to authenticated
      using ((select public.es_dueno((select auth.uid()))));
  end if;
end $pol$;

insert into public.posiciones_catalogo (clave, modulo, sub, fila, datos) values
  ('Dashboard|*','Dashboard',null,'Dashboard','tres'),
  ('Cowork|*','Cowork',null,'Salas','tres'),
  ('Cowork|Crear sesión','Cowork','Crear sesión','Salas','tres'),
  ('Messenger|*','Messenger',null,'Mensajes','tres'),
  ('Correo|*','Correo',null,'Bandeja','no'),
  ('Meet|*','Meet',null,'Reuniones','tres'),
  ('Meet|Crear reunión','Meet','Crear reunión','Reuniones','tres'),
  ('Meet|Terminar reunión','Meet','Terminar reunión','Reuniones','tres'),
  ('Grabaciones|*','Grabaciones',null,'Grabaciones','tres'),
  ('Oficina|Documentos','Oficina','Documentos','Documentos y hojas','tres'),
  ('Oficina|Hojas de cálculo','Oficina','Hojas de cálculo','Documentos y hojas','tres'),
  ('Oficina|Presentaciones','Oficina','Presentaciones','Documentos y hojas','tres'),
  ('Oficina|Calendario','Oficina','Calendario','Documentos y hojas','tres'),
  ('Oficina|Drive','Oficina','Drive','Drive','tres'),
  ('Contactos|Contactos','Contactos','Contactos','Contactos','tres'),
  ('Contactos|Dashboard','Contactos','Dashboard','Contactos','tres'),
  ('Contactos|Crear Contacto','Contactos','Crear Contacto','Contactos','tres'),
  ('Contactos|Editar Contacto','Contactos','Editar Contacto','Contactos','tres'),
  ('Contactos|Eliminar Contacto','Contactos','Eliminar Contacto','Contactos','tres'),
  ('Contactos|Ver Teléfonos','Contactos','Ver Teléfonos','Contactos','tres'),
  ('Administración|Usuarios','Administración','Usuarios','Usuarios','tres'),
  ('Administración|Roles','Administración','Roles','Posiciones','no'),
  ('Administración|Auditoría','Administración','Auditoría','Auditoría','no'),
  ('Creadores|Lista','Creadores','Lista','Gestionar creadoras','tres'),
  ('Creadores|Dashboard','Creadores','Dashboard','Gestionar creadoras','tres'),
  ('Creadores|Nuevo','Creadores','Nuevo','Gestionar creadoras','tres'),
  ('Creadores|Editar Creator','Creadores','Editar Creator','Gestionar creadoras','tres'),
  ('Creadores|Eliminar Creator','Creadores','Eliminar Creator','Gestionar creadoras','tres'),
  ('Creadores|Cambiar Plataforma','Creadores','Cambiar Plataforma','Gestionar creadoras','tres'),
  ('Creadores|Editar Blu CRM','Creadores','Editar Blu CRM','Gestionar creadoras','tres'),
  ('Creadores|Onboarding','Creadores','Onboarding','Gestionar creadoras','tres'),
  ('Creadores|Offboarding','Creadores','Offboarding','Gestionar creadoras','tres'),
  ('Creadores|Perfil: Info','Creadores','Perfil: Info','Perfil','tres'),
  ('Creadores|Perfil: Lineamientos','Creadores','Perfil: Lineamientos','Perfil','tres'),
  ('Creadores|Perfil: Redes','Creadores','Perfil: Redes','Perfil','tres'),
  ('Creadores|Perfil: Monetización','Creadores','Perfil: Monetización','Perfil','tres'),
  ('Creadores|Perfil: Documentos','Creadores','Perfil: Documentos','Perfil','tres'),
  ('Creadores|Perfil: Notas','Creadores','Perfil: Notas','Perfil','tres'),
  ('Creadores|Perfil: Tickets','Creadores','Perfil: Tickets','Perfil','tres'),
  ('Creadores|Perfil: Historial','Creadores','Perfil: Historial','Perfil','tres'),
  ('Creadores|Editar Banking','Creadores','Editar Banking','Perfil','tres'),
  ('Creator Sales|Dashboard','Creator Sales','Dashboard','Dashboard de ingresos','tres'),
  ('Closers|Dashboard','Closers','Dashboard','Operación','tres'),
  ('Closers|Actividad','Closers','Actividad','Operación','tres'),
  ('Closers|Operaciones','Closers','Operaciones','Operación','tres'),
  ('Closers|Oportunidades','Closers','Oportunidades','Operación','tres'),
  ('Closers|Asignar Closer','Closers','Asignar Closer','Operación','tres'),
  ('Closers|Editar Status','Closers','Editar Status','Operación','tres'),
  ('Closers|Editar Comisiones','Closers','Editar Comisiones','Operación','tres'),
  ('Closers|Convertir a Creadora','Closers','Convertir a Creadora','Operación','tres'),
  ('LeadGen|Lista','LeadGen','Lista','LeadGen','tres'),
  ('LeadGen|Dashboard','LeadGen','Dashboard','LeadGen','tres'),
  ('LeadGen|Crear Entrada','LeadGen','Crear Entrada','LeadGen','tres'),
  ('LeadGen|Eliminar Entradas','LeadGen','Eliminar Entradas','LeadGen','tres'),
  ('LeadGen|Agentes','LeadGen','Agentes','LeadGen','tres'),
  ('LeadGen|Supervisores','LeadGen','Supervisores','LeadGen','tres'),
  ('LeadGen|Rendimiento','LeadGen','Rendimiento','LeadGen','tres'),
  ('WhatsApp|Bandeja','WhatsApp','Bandeja','WhatsApp','tres'),
  ('WhatsApp|Canales','WhatsApp','Canales','WhatsApp','tres'),
  ('WhatsApp|Analítica','WhatsApp','Analítica','WhatsApp','tres'),
  ('WhatsApp|IA','WhatsApp','IA','WhatsApp','tres'),
  ('WhatsApp|Asignar conversaciones','WhatsApp','Asignar conversaciones','WhatsApp','tres'),
  ('Telegram|Bandeja','Telegram','Bandeja','Telegram','tres'),
  ('Telegram|Cuentas','Telegram','Cuentas','Telegram','tres'),
  ('Telegram|Asignar conversaciones','Telegram','Asignar conversaciones','Telegram','tres'),
  ('Telefonos|Dashboard','Telefonos','Dashboard','Teléfonos','tres'),
  ('Telefonos|Dispositivos','Telefonos','Dispositivos','Teléfonos','tres'),
  ('Chatters|Workspace','Chatters','Workspace','Chatters','tres'),
  ('Chatters|Evaluator','Chatters','Evaluator','Chatters','tres'),
  ('Chatters|Rendimiento','Chatters','Rendimiento','Chatters','tres'),
  ('Chatters|Horarios','Chatters','Horarios','Chatters','tres'),
  ('Chatters|Horarios · Gestionar','Chatters','Horarios · Gestionar','Chatters','tres'),
  ('Chatters|Admin','Chatters','Admin','Chatters','tres'),
  ('Chatters|Borrar Historial','Chatters','Borrar Historial','Chatters','tres'),
  ('Agency QA|Chatters: Scorecard','Agency QA','Chatters: Scorecard','QA de chatters','tres'),
  ('Agency QA|Chatters: QA Cualitativo','Agency QA','Chatters: QA Cualitativo','QA de chatters','tres'),
  ('Agency QA|Chatters: Masivos','Agency QA','Chatters: Masivos','QA de chatters','tres'),
  ('Agency QA|Chatters: Asistencia','Agency QA','Chatters: Asistencia','QA de chatters','tres'),
  ('Agency QA|Chatters: Anomalías','Agency QA','Chatters: Anomalías','QA de chatters','tres'),
  ('Agency QA|Chatters: Notificaciones','Agency QA','Chatters: Notificaciones','QA de chatters','tres'),
  ('Agency QA|Calls','Agency QA','Calls','QA de closers','tres'),
  ('Agency QA|New QA','Agency QA','New QA','QA de closers','tres'),
  ('Agency QA|QA History','Agency QA','QA History','QA de closers','tres'),
  ('Agency QA|QA Chat','Agency QA','QA Chat','QA de closers','tres'),
  ('Agency QA|Borrar Calls','Agency QA','Borrar Calls','QA de closers','tres'),
  ('Agency QA|Managers QA','Agency QA','Managers QA','QA de managers y LLG','tres'),
  ('Agency QA|LLG QA','Agency QA','LLG QA','QA de managers y LLG','tres'),
  ('Personalizados|Tablero','Personalizados','Tablero','Pedidos','tres'),
  ('Personalizados|Tabla','Personalizados','Tabla','Pedidos','tres'),
  ('Personalizados|Crear pedido','Personalizados','Crear pedido','Pedidos','tres'),
  ('Personalizados|Aprobar','Personalizados','Aprobar','Pedidos','tres'),
  ('Personalizados|Gestionar','Personalizados','Gestionar','Pedidos','tres'),
  ('Parrilla|Parrilla','Parrilla','Parrilla','Parrilla','no'),
  ('Parrilla|Referencias','Parrilla','Referencias','Parrilla','no'),
  ('Parrilla|Editar','Parrilla','Editar','Parrilla','no'),
  ('Parrilla|Enviar al grupo','Parrilla','Enviar al grupo','Parrilla','no'),
  ('Promolog|Promos','Promolog','Promos','Promolog','no'),
  ('Promolog|Promobot','Promolog','Promobot','Promolog','no'),
  ('Promolog|Rendimiento','Promolog','Rendimiento','Promolog','no'),
  ('Tickets|Lista de Tickets','Tickets','Lista de Tickets','Tickets','tres'),
  ('Tickets|Crear Ticket','Tickets','Crear Ticket','Tickets','tres'),
  ('Tickets|Editar Ticket','Tickets','Editar Ticket','Tickets','tres'),
  ('Tickets|Eliminar Ticket','Tickets','Eliminar Ticket','Tickets','tres'),
  ('Tickets|Asignar Ticket','Tickets','Asignar Ticket','Tickets','tres'),
  ('Tickets|Plantillas','Tickets','Plantillas','Tickets','tres'),
  ('Tickets|Gestionar Plantillas','Tickets','Gestionar Plantillas','Tickets','tres'),
  ('Panel de control|Modelos','Panel de control','Modelos','Panel ejecutivo','no'),
  ('Panel de control|Chatters Reclutamiento','Panel de control','Chatters Reclutamiento','Panel ejecutivo','no'),
  ('Panel de control|Cuentas Spammer','Panel de control','Cuentas Spammer','Panel ejecutivo','no'),
  ('Panel de control|Control de Gasto','Panel de control','Control de Gasto','Panel ejecutivo','no'),
  ('Scouter Assist|Mis Tareas','Scouter Assist','Mis Tareas','Scouter Assist','no'),
  ('Scouter Assist|Generar Tareas','Scouter Assist','Generar Tareas','Scouter Assist','no'),
  ('Scouter Assist|Recomputar Lookalike','Scouter Assist','Recomputar Lookalike','Scouter Assist','no'),
  ('Finanzas|Dashboard','Finanzas','Dashboard','Finanzas','no'),
  ('Finanzas|Nómina','Finanzas','Nómina','Finanzas','no'),
  ('Finanzas|Invoices','Finanzas','Invoices','Finanzas','no'),
  ('Finanzas|Collections','Finanzas','Collections','Finanzas','no'),
  ('Finanzas|Control Financiero','Finanzas','Control Financiero','Finanzas','no'),
  ('Finanzas|Horas Variables','Finanzas','Horas Variables','Finanzas','no'),
  ('Finanzas|Templates','Finanzas','Templates','Finanzas','no'),
  ('Finanzas|Reportes','Finanzas','Reportes','Finanzas','no'),
  ('Finanzas|Configuración','Finanzas','Configuración','Finanzas','no'),
  ('HR|Candidatos','HR','Candidatos','Personal','tres'),
  ('HR|Onboarding','HR','Onboarding','Personal','tres'),
  ('HR|Empleados Activos','HR','Empleados Activos','Personal','tres'),
  ('HR|Offboarding','HR','Offboarding','Personal','tres'),
  ('HR|Directorio','HR','Directorio','Personal','tres'),
  ('HR|Organigrama','HR','Organigrama','Personal','tres'),
  ('HR|Asistencia','HR','Asistencia','Tiempo','tres'),
  ('HR|Horarios','HR','Horarios','Tiempo','tres'),
  ('HR|Horarios Chatters','HR','Horarios Chatters','Tiempo','tres'),
  ('HR|Horas Extra','HR','Horas Extra','Tiempo','tres'),
  ('HR|Banco de Horas','HR','Banco de Horas','Tiempo','tres'),
  ('HR|Vacaciones','HR','Vacaciones','Tiempo','tres'),
  ('HR|Permisos','HR','Permisos','Tiempo','tres'),
  ('HR|Monitoreo','HR','Monitoreo','Gestión','tres'),
  ('HR|Incidentes','HR','Incidentes','Gestión','tres'),
  ('HR|Desempeño','HR','Desempeño','Gestión','tres'),
  ('HR|Capacitación','HR','Capacitación','Gestión','tres'),
  ('HR|Deducciones','HR','Deducciones','Gestión','tres'),
  ('HR|Anuncios','HR','Anuncios','Gestión','tres')
on conflict (clave) do update set modulo = excluded.modulo, sub = excluded.sub, fila = excluded.fila, datos = excluded.datos;

alter table public.posiciones_borrador add column if not exists rol text;

create table if not exists public.posiciones_respaldo (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  creado_por uuid,
  restaurado_at timestamptz,
  datos jsonb not null
);
alter table public.posiciones_respaldo enable row level security;
do $pol$ begin
  if to_regprocedure('public.es_dueno(uuid)') is not null then
    drop policy if exists posiciones_respaldo_dueno on public.posiciones_respaldo;
    create policy posiciones_respaldo_dueno on public.posiciones_respaldo for select to authenticated
      using ((select public.es_dueno((select auth.uid()))));
  end if;
end $pol$;

-- Espejo de usePermissions.canAccess (sin el bypass de admin ni los ocultos).
create or replace function public.rp_efectivo(_rid uuid, _mod text, _sub text)
returns boolean language sql stable set search_path = public as $$
  with p as (select module, submodule, can_access from public.role_permissions where role_id = _rid),
       u as (select _mod = any (array['Dashboard','Messenger','Cowork','Meet','Correo','Grabaciones','Oficina']) es)
  select case
    when _rid is null then false
    when not exists (select 1 from p) then (select es from u)
    when _sub is not null and exists (select 1 from p where module = _mod and submodule = _sub)
      then (select bool_or(can_access) from p where module = _mod and submodule = _sub)
    when exists (select 1 from p where module = _mod and submodule is null)
      then (select bool_or(can_access) from p where module = _mod and submodule is null)
    when exists (select 1 from p where module = _mod) then (select bool_or(can_access) from p where module = _mod)
    else (select es from u)
  end
$$;

create or replace function public.posiciones_aplicar(_simular boolean default true, _respaldo boolean default true)
returns table (tipo text, quien text, detalle text)
language plpgsql security definer set search_path = public, auth as $$
declare
  _tenant uuid; _p record; _c record; _u record; _rid uuid;
  _new boolean; _old boolean; _s text; _s_old text; _desired text; _actual text[];
begin
  if auth.uid() is not null and not public.es_dueno(auth.uid()) then
    raise exception 'Solo el dueño aplica las posiciones' using errcode = '42501';
  end if;
  select tenant_id into _tenant from public.roles_config where name = 'admin' limit 1;
  perform set_config('maven.posiciones_aplicando', 'on', true);
  create temp table if not exists _pos_dif (tipo text, quien text, detalle text) on commit drop;
  truncate _pos_dif;

  -- Maven lee UN puesto por persona: fuera de los admin, nadie puede quedar en dos.
  for _u in
    select pr.full_name from public.posiciones_borrador_personas pp
    join public.posiciones_borrador pb on pb.id = pp.posicion_id
    join public.profiles pr on pr.id = pp.user_id
    where pb.rol is not null and pb.rol <> 'admin'
      and not exists (select 1 from public.posiciones_borrador_personas a join public.posiciones_borrador b on b.id = a.posicion_id
                      where a.user_id = pp.user_id and (b.rol = 'admin' or b.nombre = 'Dueño'))
    group by pr.full_name having count(*) > 1
  loop
    raise exception 'Una persona está en dos posiciones: %. Maven solo admite una (salvo los admin).', _u.full_name;
  end loop;

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

  -- «Editor» pasa a llamarse «Editores de contenido exclusivo».
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

    -- Checks: solo donde el borrador difiere de lo que ven hoy.
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

    -- Un submódulo prendido en un módulo cuya fila general está apagada no se
    -- vería en el menú: se prende la fila general.
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

    -- Alcance de datos (lo lee dataScope en la fila general del módulo).
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

  -- Personas → su puesto (uno).
  for _u in
    select pr.id, pr.full_name,
      case when bool_or(pb.rol = 'admin' or pb.nombre = 'Dueño') then 'admin'
           else max(coalesce(pb.rol, '')) end as desired
    from public.posiciones_borrador_personas pp
    join public.posiciones_borrador pb on pb.id = pp.posicion_id
    join public.profiles pr on pr.id = pp.user_id and pr.deleted_at is null
    group by pr.id, pr.full_name
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

  -- No entran: marcadas «deshabilitada» y cuentas del equipo sin posición.
  for _u in
    select pr.id, pr.full_name from public.profiles pr join auth.users au on au.id = pr.id
    where pr.deleted_at is null
      and coalesce(au.raw_app_meta_data ->> 'tipo', '') <> 'creadora'
      and not public.es_dueno(pr.id)
      and (exists (select 1 from public.personas_borrador_marcas m where m.user_id = pr.id and m.deshabilitada)
           or not exists (select 1 from public.posiciones_borrador_personas pp where pp.user_id = pr.id))
      and (au.banned_until is null or au.banned_until < now())
  loop
    insert into _pos_dif values ('deshabilitar', _u.full_name, 'no puede entrar');
    if not _simular then
      update auth.users set banned_until = 'infinity' where id = _u.id;
      delete from auth.sessions where user_id = _u.id;
    end if;
  end loop;
  -- Y al revés: alguien que estaba deshabilitado por aquí y ya no lo está.
  for _u in
    select pr.id, pr.full_name from public.profiles pr join auth.users au on au.id = pr.id
    where pr.deleted_at is null and au.banned_until > now()
      and exists (select 1 from public.posiciones_borrador_personas pp where pp.user_id = pr.id)
      and exists (select 1 from public.personas_borrador_marcas m where m.user_id = pr.id and not m.deshabilitada)
  loop
    insert into _pos_dif values ('habilitar', _u.full_name, 'vuelve a entrar');
    if not _simular then update auth.users set banned_until = null where id = _u.id; end if;
  end loop;

  -- Unidades de la empresa en el Drive.
  for _u in
    with quiere as (
      select distinct pp.user_id from public.posiciones_borrador_personas pp join public.posiciones_borrador pb on pb.id = pp.posicion_id
      where pb.acceso_total or coalesce((pb.checks ->> 'N:drive.empresa')::boolean, false))
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

  -- Cámara y pantalla obligatorias (por persona).
  for _u in
    select pr.id, pr.full_name, coalesce(m.sin_camara, false) as quiere
    from public.profiles pr
    left join public.personas_borrador_marcas m on m.user_id = pr.id
    where pr.deleted_at is null and exists (select 1 from public.posiciones_borrador_personas pp where pp.user_id = pr.id)
      and coalesce(pr.exonera_camara_pantalla, false) is distinct from coalesce(m.sin_camara, false)
  loop
    insert into _pos_dif values ('camara', _u.full_name, case when _u.quiere then 'ya no está obligado a cámara ni pantalla' else 'vuelve a estar obligado' end);
    if not _simular then update public.profiles set exonera_camara_pantalla = _u.quiere where id = _u.id; end if;
  end loop;

  -- Argos sigue calificando a Marketing como calificaba a Warming y closer.
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
end $$;

-- Regresar a como estaba (7 días).
create or replace function public.posiciones_regresar()
returns text language plpgsql security definer set search_path = public, auth as $$
declare _r record; _u uuid;
begin
  if auth.uid() is null or not public.es_dueno(auth.uid()) then
    raise exception 'Solo el dueño puede regresar' using errcode = '42501';
  end if;
  select * into _r from public.posiciones_respaldo
    where restaurado_at is null and created_at > now() - interval '7 days' order by id desc limit 1;
  if _r is null then raise exception 'No hay respaldo de los últimos 7 días'; end if;
  perform set_config('maven.posiciones_aplicando', 'on', true);
  update public.app_flags set enabled = false, updated_at = now() where key = 'posiciones_mandan';

  -- Puestos: nombres y estado como estaban; los creados después se borran.
  update public.roles_config rc set name = x.name, is_active = x.is_active
    from jsonb_to_recordset(_r.datos -> 'roles_config') as x(id uuid, name text, is_active boolean, description text)
    where rc.id = x.id and (rc.name is distinct from x.name or rc.is_active is distinct from x.is_active);
  delete from public.role_permissions;
  insert into public.role_permissions select * from jsonb_populate_recordset(null::public.role_permissions, _r.datos -> 'role_permissions');

  -- Personas: solo las que cambiaron (cada cambio avisa a las plataformas conectadas).
  for _u in
    select distinct coalesce(a.user_id, b.user_id) from
      (select user_id, array_agg(role order by role) r from public.user_roles group by user_id) a
      full join (select user_id, array_agg(role order by role) r from jsonb_populate_recordset(null::public.user_roles, _r.datos -> 'user_roles') group by user_id) b
      on a.user_id = b.user_id
    where a.r is distinct from b.r
  loop
    delete from public.user_roles where user_id = _u;
    insert into public.user_roles select * from jsonb_populate_recordset(null::public.user_roles, _r.datos -> 'user_roles') x where x.user_id = _u;
  end loop;

  -- Los puestos creados después (sin nadie ya) se borran.
  delete from public.roles_config rc
    where not exists (select 1 from jsonb_to_recordset(_r.datos -> 'roles_config') as x(id uuid) where x.id = rc.id)
      and not exists (select 1 from public.user_roles ur where ur.role = rc.name);

  delete from public.drive_acceso_extra;
  insert into public.drive_acceso_extra select * from jsonb_populate_recordset(null::public.drive_acceso_extra, _r.datos -> 'drive_acceso_extra');

  update public.profiles set exonera_camara_pantalla = (id in (select (jsonb_array_elements_text(_r.datos -> 'exonerados'))::uuid))
    where exonera_camara_pantalla is distinct from (id in (select (jsonb_array_elements_text(_r.datos -> 'exonerados'))::uuid));

  update auth.users set banned_until = null
    where banned_until > now() and id not in (select (jsonb_array_elements_text(_r.datos -> 'baneados'))::uuid);

  if _r.datos ? 'roles_calificados' and jsonb_typeof(_r.datos -> 'roles_calificados') = 'array' then
    update public.monitor_config set roles_calificados = array(select jsonb_array_elements_text(_r.datos -> 'roles_calificados'));
  end if;

  update public.posiciones_respaldo set restaurado_at = now() where id = _r.id;
  return 'Listo: todo volvió a como estaba el ' || to_char(_r.created_at at time zone 'America/Bogota', 'DD/MM HH24:MI');
end $$;

-- Después de prendido, cada cambio en la pantalla se aplica solo.
create or replace function public.posiciones_al_cambiar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('maven.posiciones_aplicando', true), '') = 'on' then return null; end if;
  if exists (select 1 from public.app_flags where key = 'posiciones_mandan' and enabled) then
    -- Dos pasadas: escribir una fila de submódulo puede cambiar cómo se lee
    -- el resto del módulo (usePermissions cae a «alguna fila del módulo»);
    -- la segunda pasada deja explícito lo que quedó implícito. (19/11: en la
    -- primera aplicación, quitar «crear reunión» apagó Meet entero a quien no
    -- tenía fila general; la segunda pasada lo dejó bien.)
    perform public.posiciones_aplicar(false, false);
    perform public.posiciones_aplicar(false, false);
  end if;
  return null;
end $$;

drop trigger if exists posiciones_borrador_aplica on public.posiciones_borrador;
create trigger posiciones_borrador_aplica after insert or update or delete on public.posiciones_borrador
  for each statement execute function public.posiciones_al_cambiar();
drop trigger if exists posiciones_personas_aplica on public.posiciones_borrador_personas;
create trigger posiciones_personas_aplica after insert or update or delete on public.posiciones_borrador_personas
  for each statement execute function public.posiciones_al_cambiar();
drop trigger if exists posiciones_marcas_aplica on public.personas_borrador_marcas;
create trigger posiciones_marcas_aplica after insert or update or delete on public.personas_borrador_marcas
  for each statement execute function public.posiciones_al_cambiar();

-- Protegidos: solo el dueño les cambia el puesto.
create or replace function public.user_roles_protegidos() returns trigger
language plpgsql security definer set search_path = public as $$
declare _uid uuid;
begin
  if tg_op = 'DELETE' then _uid := old.user_id; else _uid := new.user_id; end if;
  if coalesce(current_setting('maven.posiciones_aplicando', true), '') <> 'on'
     and auth.uid() is not null and not public.es_dueno(auth.uid())
     and exists (select 1 from public.personas_borrador_marcas m where m.user_id = _uid and m.protegido) then
    raise exception 'Esta persona está protegida: solo el dueño le cambia algo' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
do $trg$ begin
  if to_regclass('public.user_roles') is not null then
    drop trigger if exists user_roles_protegidos on public.user_roles;
    create trigger user_roles_protegidos before insert or update or delete on public.user_roles
      for each row execute function public.user_roles_protegidos();
  end if;
end $trg$;

revoke all on function public.posiciones_aplicar(boolean, boolean) from public, anon;
revoke all on function public.posiciones_regresar() from public, anon;
grant execute on function public.posiciones_aplicar(boolean, boolean) to authenticated;
grant execute on function public.posiciones_regresar() to authenticated;
