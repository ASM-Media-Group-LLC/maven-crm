-- Posiciones propias de la empresa y revisión atómica de los accesos personales.
-- No cambia asignaciones, funciones ni sesiones existentes al instalarse.
alter table public.posiciones_borrador add column tenant_id uuid references public.tenants(id);
do $$
declare empresa uuid; anterior text := current_setting('maven.posiciones_aplicando',true);
begin
  -- Las posiciones antiguas no tenían empresa. No adivinar si el respaldo
  -- llega a ejecutarse sobre una instalación con varias organizaciones.
  if (select count(*) from public.tenants) <> 1 then
    raise exception 'Identifica la empresa de las posiciones existentes antes de migrarlas';
  end if;
  select id into empresa from public.tenants;
  if exists(select 1 from public.posiciones_borrador_personas a
    left join public.tenant_members m on m.user_id=a.user_id and m.tenant_id=empresa where m.user_id is null) then
    raise exception 'Hay asignaciones sin pertenencia a la empresa';
  end if;
  perform set_config('maven.posiciones_aplicando','on',true);
  update public.posiciones_borrador set tenant_id=empresa;
  perform set_config('maven.posiciones_aplicando',coalesce(anterior,''),true);
end $$;
alter table public.posiciones_borrador alter column tenant_id set not null;
alter table public.posiciones_borrador alter column tenant_id set default public.current_tenant_id();
create index posiciones_empresa_idx on public.posiciones_borrador(tenant_id);

create table public.personas_accesos_revision (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id),
  revision bigint not null default 0,
  denegadas text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create table public.personas_accesos_auditoria (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id),
  user_id uuid references public.profiles(id) on delete set null,
  actor uuid references auth.users(id) on delete set null,
  antes jsonb not null,
  despues jsonb not null,
  created_at timestamptz not null default now()
);
create index personas_accesos_auditoria_empresa_fecha_idx on public.personas_accesos_auditoria(tenant_id,created_at desc);
create index personas_accesos_auditoria_persona_idx on public.personas_accesos_auditoria(user_id);
create index personas_accesos_auditoria_actor_idx on public.personas_accesos_auditoria(actor);
create index personas_accesos_revision_empresa_idx on public.personas_accesos_revision(tenant_id);
alter table public.personas_accesos_revision enable row level security;
alter table public.personas_accesos_auditoria enable row level security;
revoke all on public.personas_accesos_revision, public.personas_accesos_auditoria from anon, authenticated;
grant select on public.personas_accesos_revision, public.personas_accesos_auditoria to authenticated;
create policy personas_accesos_revision_leer on public.personas_accesos_revision for select to authenticated
  using(tenant_id=(select public.current_tenant_id()) and (user_id=(select auth.uid()) or
    exists(select 1 from public.tenant_owners o where o.user_id=(select auth.uid()) and o.tenant_id=personas_accesos_revision.tenant_id)));
create policy personas_accesos_auditoria_leer on public.personas_accesos_auditoria for select to authenticated
  using(tenant_id=(select public.current_tenant_id()) and
    exists(select 1 from public.tenant_owners o where o.user_id=(select auth.uid()) and o.tenant_id=personas_accesos_auditoria.tenant_id));

-- Un dueño solo administra las posiciones de su propia empresa.
drop policy if exists posiciones_borrador_dueno on public.posiciones_borrador;
create policy posiciones_borrador_dueno on public.posiciones_borrador for all to authenticated
  using(tenant_id=(select public.current_tenant_id()) and exists(select 1 from public.tenant_owners o where o.user_id=(select auth.uid()) and o.tenant_id=posiciones_borrador.tenant_id))
  with check(tenant_id=(select public.current_tenant_id()) and exists(select 1 from public.tenant_owners o where o.user_id=(select auth.uid()) and o.tenant_id=posiciones_borrador.tenant_id));
-- El selector viejo escribía cada casilla. A partir de ahora se escribe con
-- persona_aplicar_accesos, que revisa la empresa y aplica todas de una vez.
revoke insert, update, delete on public.posiciones_borrador_personas from authenticated;
drop policy if exists posiciones_borrador_personas_dueno on public.posiciones_borrador_personas;
create policy posiciones_borrador_personas_dueno on public.posiciones_borrador_personas for select to authenticated
  using(exists(select 1 from public.posiciones_borrador p where p.id=posicion_id and p.tenant_id=(select public.current_tenant_id())
    and exists(select 1 from public.tenant_owners o where o.user_id=(select auth.uid()) and o.tenant_id=p.tenant_id)));

create or replace function public.tiene_funcion(_uid uuid, _clave text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select _uid is not null
    and not coalesce((select m.deshabilitada from public.personas_borrador_marcas m where m.user_id=_uid),false)
    and (public.es_dueno(_uid) or (
      not exists(select 1 from public.personas_accesos_revision r where r.user_id=_uid and _clave=any(r.denegadas))
      and exists(select 1 from public.posiciones_borrador_personas a
        join public.posiciones_borrador p on p.id=a.posicion_id
        join public.tenant_members m on m.user_id=a.user_id and m.tenant_id=p.tenant_id
        where a.user_id=_uid and p.activa and (p.acceso_total or p.checks->_clave='true'::jsonb))
    ));
$$;
revoke all on function public.tiene_funcion(uuid,text) from public,anon;
grant execute on function public.tiene_funcion(uuid,text) to authenticated,service_role;

create or replace function public.posiciones_controlan(_uid uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select _uid is not null and (
    coalesce((select m.deshabilitada from public.personas_borrador_marcas m where m.user_id=_uid),false)
    or (coalesce((select f.enabled from public.app_flags f where f.key='posiciones_mandan'),false) and (
      public.es_dueno(_uid)
      or exists(select 1 from public.personas_accesos_revision r where r.user_id=_uid)
      or exists(select 1 from public.posiciones_borrador_personas a where a.user_id=_uid)
    )));
$$;

create or replace function public.mis_funciones_posicion()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with yo as(select (select auth.uid()) id), estado as(
    select yo.id,public.posiciones_controlan(yo.id) aplica,
      coalesce((select m.deshabilitada from public.personas_borrador_marcas m where m.user_id=yo.id),false) bloqueada,
      case when public.es_dueno(yo.id) then '{}'::text[] else coalesce((select r.denegadas from public.personas_accesos_revision r where r.user_id=yo.id),'{}') end denegadas
    from yo
  ), puestos as(
    select p.* from public.posiciones_borrador p
    join public.posiciones_borrador_personas a on a.posicion_id=p.id
    join public.tenant_members m on m.user_id=a.user_id and m.tenant_id=p.tenant_id
    join yo on yo.id=a.user_id where p.activa
  ), checks as(
    select x.key,bool_or(x.value='true'::jsonb) permitida from puestos p cross join lateral jsonb_each(p.checks) x group by x.key
  ) select jsonb_build_object(
    'uid',e.id,'aplica',e.aplica,'bloqueada',e.bloqueada,
    'total',not e.bloqueada and (public.es_dueno(e.id) or exists(select 1 from puestos p where p.acceso_total)),
    'denegadas',to_jsonb(e.denegadas),
    'checks',case when e.bloqueada then '{}'::jsonb else coalesce((select jsonb_object_agg(c.key,c.permitida and not(c.key=any(e.denegadas))) from checks c),'{}'::jsonb) end
  ) from estado e;
$$;

create or replace function public.posicion_clave_valida(_clave text) returns boolean
language sql immutable set search_path=public,pg_temp as $$
 select coalesce(_clave=any(array['Dashboard|*','N:argos.presencia','N:argos.avisar','N:argos.video','N:argos.expediente','N:argos.perdonar','N:argos.pdf','N:horarios.gestionar','N:empresa.configurar','N:argos.apps_ajenas','N:camara_pantalla.decidir','N:argos.casos.juzgar','N:argos.casos.obligado','N:argos.casos.corregir','N:argos.casos.reporte','N:argos.casos.jefe','N:argos.ajustes','Cowork|*','Cowork|Crear sesión','N:cowork.abrir','N:cowork.verpantallas','Messenger|*','N:msg.archivos','N:msg.grupo','N:msg.llamar','N:msg.borrar','Correo|*','Meet|*','Meet|Crear reunión','Meet|Terminar reunión','Grabaciones|*','Oficina|Documentos','Oficina|Hojas de cálculo','Oficina|Presentaciones','Oficina|Calendario','Oficina|Drive','N:drive.empresa','N:drive.subir','N:drive.borrar','N:drive.compartir','Contactos|Contactos','Contactos|Dashboard','Contactos|Crear Contacto','Contactos|Editar Contacto','Contactos|Eliminar Contacto','Contactos|Ver Teléfonos','Administración|Usuarios','N:usr.agregar','N:usr.editar','N:usr.desactivar','N:usr.reset','N:usr.asignar','Administración|Roles','N:pos.agregar','N:pos.editar','N:pos.borrar','N:pos.activar','N:pos.permisos','Administración|Auditoría','Creadores|Lista','Creadores|Dashboard','Creadores|Nuevo','Creadores|Editar Creator','Creadores|Eliminar Creator','Creadores|Cambiar Plataforma','Creadores|Editar Blu CRM','Creadores|Onboarding','Creadores|Offboarding','Creadores|Perfil: Info','Creadores|Perfil: Lineamientos','Creadores|Perfil: Redes','Creadores|Perfil: Monetización','Creadores|Perfil: Documentos','Creadores|Perfil: Notas','Creadores|Perfil: Tickets','Creadores|Perfil: Historial','Creadores|Editar Banking','Creator Sales|Dashboard','Closers|Dashboard','Closers|Actividad','Closers|Operaciones','Closers|Oportunidades','Closers|Asignar Closer','Closers|Editar Status','Closers|Editar Comisiones','Closers|Convertir a Creadora','LeadGen|Lista','LeadGen|Dashboard','LeadGen|Crear Entrada','LeadGen|Eliminar Entradas','LeadGen|Agentes','LeadGen|Supervisores','LeadGen|Rendimiento','WhatsApp|Bandeja','WhatsApp|Canales','WhatsApp|Analítica','WhatsApp|IA','WhatsApp|Asignar conversaciones','Telegram|Bandeja','Telegram|Cuentas','Telegram|Asignar conversaciones','Telefonos|Dashboard','Telefonos|Dispositivos','Chatters|Workspace','Chatters|Evaluator','Chatters|Rendimiento','Chatters|Horarios','Chatters|Horarios · Gestionar','Chatters|Admin','Chatters|Borrar Historial','Agency QA|Chatters: Scorecard','Agency QA|Chatters: QA Cualitativo','Agency QA|Chatters: Masivos','Agency QA|Chatters: Asistencia','Agency QA|Chatters: Anomalías','Agency QA|Chatters: Notificaciones','Agency QA|Calls','Agency QA|New QA','Agency QA|QA History','Agency QA|QA Chat','Agency QA|Borrar Calls','Agency QA|Managers QA','Agency QA|LLG QA','Personalizados|Tablero','Personalizados|Tabla','Personalizados|Crear pedido','Personalizados|Aprobar','Personalizados|Gestionar','Parrilla|Parrilla','Parrilla|Referencias','Parrilla|Editar','Parrilla|Enviar al grupo','Promolog|Promos','Promolog|Promobot','Promolog|Rendimiento','Tickets|Lista de Tickets','Tickets|Crear Ticket','Tickets|Editar Ticket','Tickets|Eliminar Ticket','Tickets|Asignar Ticket','Tickets|Plantillas','Tickets|Gestionar Plantillas','Panel de control|Modelos','Panel de control|Chatters Reclutamiento','Panel de control|Cuentas Spammer','Panel de control|Control de Gasto','Scouter Assist|Mis Tareas','Scouter Assist|Generar Tareas','Scouter Assist|Recomputar Lookalike','Finanzas|Dashboard','Finanzas|Nómina','Finanzas|Invoices','Finanzas|Collections','Finanzas|Control Financiero','Finanzas|Horas Variables','Finanzas|Templates','Finanzas|Reportes','Finanzas|Configuración','HR|Candidatos','HR|Onboarding','HR|Empleados Activos','HR|Offboarding','HR|Directorio','HR|Organigrama','HR|Asistencia','HR|Horarios','HR|Horarios Chatters','HR|Horas Extra','HR|Banco de Horas','HR|Vacaciones','HR|Permisos','HR|Monitoreo','HR|Incidentes','HR|Desempeño','HR|Capacitación','HR|Deducciones','HR|Anuncios']::text[]),false);
$$;
revoke all on function public.posicion_clave_valida(text) from public,anon;
grant execute on function public.posicion_clave_valida(text) to authenticated,service_role;

create or replace function public.persona_aplicar_accesos(_user_id uuid,_revision bigint,_posiciones uuid[],_denegadas text[],_versiones jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid:=auth.uid(); empresa uuid:=public.current_tenant_id(); actual public.personas_accesos_revision%rowtype;
  antes jsonb; despues jsonb; elegidas uuid[]; restricciones text[]; anterior text:=current_setting('maven.posiciones_aplicando',true);
begin
  if actor is null or not exists(select 1 from public.tenant_owners o where o.user_id=actor and o.tenant_id=empresa) then
    raise exception 'No tienes permiso para asignar posiciones' using errcode='42501';
  end if;
  if not exists(select 1 from public.tenant_members m join public.profiles p on p.id=m.user_id and p.deleted_at is null
    where m.user_id=_user_id and m.tenant_id=empresa) then
    raise exception 'La persona no pertenece a tu empresa' using errcode='42501';
  end if;
  if _user_id=actor or exists(select 1 from public.tenant_owners o where o.user_id=_user_id) then
    raise exception 'Los accesos del dueño están protegidos' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('posiciones:'||empresa::text,0));
  if jsonb_typeof(_versiones) is distinct from 'object' then
    raise exception 'Falta la revisión de las posiciones' using errcode='22023';
  end if;
  if _posiciones is null or _denegadas is null or array_position(_posiciones,null) is not null or array_position(_denegadas,null) is not null then
    raise exception 'Selección de accesos inválida' using errcode='22023';
  end if;
  select coalesce(array_agg(distinct x order by x),'{}') into elegidas from unnest(_posiciones) x;
  select coalesce(array_agg(distinct x order by x),'{}') into restricciones from unnest(_denegadas) x;
  if exists(select 1 from unnest(elegidas) x left join public.posiciones_borrador p on p.id=x
    where p.id is null or p.tenant_id<>empresa or (not p.activa and not exists(select 1 from public.posiciones_borrador_personas a where a.user_id=_user_id and a.posicion_id=x))) then
    raise exception 'Hay posiciones ajenas, inexistentes o inactivas' using errcode='22023';
  end if;
  if exists(select 1 from public.posiciones_borrador_personas a join public.tenant_owners o on o.user_id=a.user_id
    where a.posicion_id=any(elegidas)) then
    raise exception 'La posición del dueño no se puede asignar a otra persona' using errcode='42501';
  end if;
  if exists(select 1 from unnest(restricciones) x where not public.posicion_clave_valida(x)) then
    raise exception 'La restricción no corresponde a una función de Maven' using errcode='22023';
  end if;
  -- Las posiciones revisadas (antes y después) tampoco pueden cambiar entre
  -- la revisión visual y Aplicar. La escritura de posiciones usa el mismo lock.
  perform 1 from public.posiciones_borrador p where p.tenant_id=empresa and
    (p.id=any(elegidas) or exists(select 1 from public.posiciones_borrador_personas a where a.user_id=_user_id and a.posicion_id=p.id)) order by p.id for update;
  if exists(select 1 from public.posiciones_borrador p where p.tenant_id=empresa and
    (p.id=any(elegidas) or exists(select 1 from public.posiciones_borrador_personas a where a.user_id=_user_id and a.posicion_id=p.id))
    and (not(_versiones ? p.id::text) or p.updated_at is distinct from (_versiones->>p.id::text)::timestamptz)) then
    raise exception 'Una posición cambió. Recarga y revisa de nuevo' using errcode='40001';
  end if;
  -- El perfil serializa también la primera edición (aún no existe revisión).
  perform 1 from public.profiles p where p.id=_user_id for update;
  select * into actual from public.personas_accesos_revision where user_id=_user_id for update;
  if not found then actual.user_id:=_user_id; actual.tenant_id:=empresa; actual.revision:=0; actual.denegadas:='{}'; end if;
  if actual.tenant_id<>empresa or _revision is null or actual.revision<>_revision then
    raise exception 'Los accesos cambiaron en otra sesión. Recarga y revisa de nuevo' using errcode='40001';
  end if;
  select jsonb_build_object('posiciones',coalesce(array_agg(a.posicion_id order by a.posicion_id),'{}'::uuid[]),'denegadas',actual.denegadas,'revision',actual.revision)
    into antes from public.posiciones_borrador_personas a where a.user_id=_user_id;
  if antes->'posiciones'=to_jsonb(elegidas) and actual.denegadas=restricciones then return antes; end if;
  insert into public.personas_accesos_revision(user_id,tenant_id) values(_user_id,empresa) on conflict(user_id) do nothing;
  perform set_config('maven.posiciones_aplicando','on',true);
  delete from public.posiciones_borrador_personas where user_id=_user_id and not(posicion_id=any(elegidas));
  insert into public.posiciones_borrador_personas(user_id,posicion_id) select _user_id,x from unnest(elegidas) x on conflict do nothing;
  update public.personas_accesos_revision set revision=revision+1,denegadas=restricciones,updated_at=clock_timestamp() where user_id=_user_id returning * into actual;
  perform public.posiciones_sincronizar(false,false);
  perform public.posiciones_sincronizar(false,false);
  perform set_config('maven.posiciones_aplicando',coalesce(anterior,''),true);
  despues:=jsonb_build_object('posiciones',elegidas,'denegadas',restricciones,'revision',actual.revision);
  insert into public.personas_accesos_auditoria(tenant_id,user_id,actor,antes,despues) values(empresa,_user_id,actor,antes,despues);
  return despues;
end;
$$;
revoke all on function public.persona_aplicar_accesos(uuid,bigint,uuid[],text[],jsonb) from public,anon;
grant execute on function public.persona_aplicar_accesos(uuid,bigint,uuid[],text[],jsonb) to authenticated;
