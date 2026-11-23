-- Acceso por aprobación; no modifica miembros ni posiciones existentes.
create or replace function public.posiciones_funciones_catalogo() returns table(clave text,fila text)
language sql immutable set search_path=public,pg_temp as $$ values
('Dashboard|*','Dashboard'),
('N:argos.presencia','Presencia en vivo'),
('N:argos.avisar','Presencia en vivo'),
('N:argos.video','Presencia en vivo'),
('N:argos.expediente','Expediente'),
('N:argos.perdonar','Expediente'),
('N:argos.pdf','Expediente'),
('N:horarios.gestionar','Horarios y pausas'),
('N:empresa.configurar','Horarios y pausas'),
('N:argos.apps_ajenas','Lo que Argos le vigila'),
('N:camara_pantalla.decidir','Lo que Argos le vigila'),
('N:argos.casos.juzgar','Revisión de RR. HH.'),
('N:argos.casos.obligado','Revisión de RR. HH.'),
('N:argos.casos.corregir','Revisión de RR. HH.'),
('N:argos.casos.reporte','Revisión de RR. HH.'),
('N:argos.casos.jefe','Revisión de RR. HH.'),
('N:argos.ajustes','Ajustes de Argos'),
('Cowork|*','Salas'),
('Cowork|Crear sesión','Salas'),
('N:cowork.abrir','Salas'),
('N:cowork.miembros','Salas'),
('N:cowork.verpantallas','Salas'),
('Messenger|*','Mensajes'),
('N:msg.archivos','Mensajes'),
('N:msg.grupo','Mensajes'),
('N:msg.llamar','Mensajes'),
('N:msg.borrar','Mensajes'),
('Correo|*','Bandeja'),
('Meet|*','Reuniones'),
('Meet|Crear reunión','Reuniones'),
('Meet|Terminar reunión','Reuniones'),
('Grabaciones|*','Grabaciones'),
('Oficina|Documentos','Documentos y hojas'),
('Oficina|Hojas de cálculo','Documentos y hojas'),
('Oficina|Presentaciones','Documentos y hojas'),
('Oficina|Calendario','Documentos y hojas'),
('Oficina|Drive','Drive'),
('N:drive.empresa','Drive'),
('N:drive.subir','Drive'),
('N:drive.borrar','Drive'),
('N:drive.compartir','Drive'),
('Contactos|Contactos','Contactos'),
('Contactos|Dashboard','Contactos'),
('Contactos|Crear Contacto','Contactos'),
('Contactos|Editar Contacto','Contactos'),
('Contactos|Eliminar Contacto','Contactos'),
('Contactos|Ver Teléfonos','Contactos'),
('Administración|Usuarios','Usuarios'),
('N:usr.agregar','Usuarios'),
('N:usr.editar','Usuarios'),
('N:usr.desactivar','Usuarios'),
('N:usr.reset','Usuarios'),
('N:usr.asignar','Usuarios'),
('Administración|Roles','Posiciones'),
('N:pos.agregar','Posiciones'),
('N:pos.editar','Posiciones'),
('N:pos.borrar','Posiciones'),
('N:pos.activar','Posiciones'),
('N:pos.permisos','Posiciones'),
('Administración|Auditoría','Auditoría'),
('Creadores|Lista','Gestionar creadoras'),
('Creadores|Dashboard','Gestionar creadoras'),
('Creadores|Nuevo','Gestionar creadoras'),
('Creadores|Editar Creator','Gestionar creadoras'),
('Creadores|Eliminar Creator','Gestionar creadoras'),
('Creadores|Cambiar Plataforma','Gestionar creadoras'),
('Creadores|Editar Blu CRM','Gestionar creadoras'),
('Creadores|Onboarding','Gestionar creadoras'),
('Creadores|Offboarding','Gestionar creadoras'),
('Creadores|Perfil: Info','Perfil'),
('Creadores|Perfil: Lineamientos','Perfil'),
('Creadores|Perfil: Redes','Perfil'),
('Creadores|Perfil: Monetización','Perfil'),
('Creadores|Perfil: Documentos','Perfil'),
('Creadores|Perfil: Notas','Perfil'),
('Creadores|Perfil: Tickets','Perfil'),
('Creadores|Perfil: Historial','Perfil'),
('Creadores|Editar Banking','Perfil'),
('Creator Sales|Dashboard','Dashboard de ingresos'),
('Closers|Dashboard','Operación'),
('Closers|Actividad','Operación'),
('Closers|Operaciones','Operación'),
('Closers|Oportunidades','Operación'),
('Closers|Asignar Closer','Operación'),
('Closers|Editar Status','Operación'),
('Closers|Editar Comisiones','Operación'),
('Closers|Convertir a Creadora','Operación'),
('LeadGen|Lista','LeadGen'),
('LeadGen|Dashboard','LeadGen'),
('LeadGen|Crear Entrada','LeadGen'),
('LeadGen|Eliminar Entradas','LeadGen'),
('LeadGen|Agentes','LeadGen'),
('LeadGen|Supervisores','LeadGen'),
('LeadGen|Rendimiento','LeadGen'),
('WhatsApp|Bandeja','WhatsApp'),
('WhatsApp|Canales','WhatsApp'),
('WhatsApp|Analítica','WhatsApp'),
('WhatsApp|IA','WhatsApp'),
('WhatsApp|Asignar conversaciones','WhatsApp'),
('Telegram|Bandeja','Telegram'),
('Telegram|Cuentas','Telegram'),
('Telegram|Asignar conversaciones','Telegram'),
('Telefonos|Dashboard','Teléfonos'),
('Telefonos|Dispositivos','Teléfonos'),
('Chatters|Workspace','Chatters'),
('Chatters|Evaluator','Chatters'),
('Chatters|Rendimiento','Chatters'),
('Chatters|Horarios','Chatters'),
('Chatters|Horarios · Gestionar','Chatters'),
('Chatters|Admin','Chatters'),
('Chatters|Borrar Historial','Chatters'),
('Agency QA|Chatters: Scorecard','QA de chatters'),
('Agency QA|Chatters: QA Cualitativo','QA de chatters'),
('Agency QA|Chatters: Masivos','QA de chatters'),
('Agency QA|Chatters: Asistencia','QA de chatters'),
('Agency QA|Chatters: Anomalías','QA de chatters'),
('Agency QA|Chatters: Notificaciones','QA de chatters'),
('Agency QA|Calls','QA de closers'),
('Agency QA|New QA','QA de closers'),
('Agency QA|QA History','QA de closers'),
('Agency QA|QA Chat','QA de closers'),
('Agency QA|Borrar Calls','QA de closers'),
('Agency QA|Managers QA','QA de managers y LLG'),
('Agency QA|LLG QA','QA de managers y LLG'),
('Personalizados|Tablero','Pedidos'),
('Personalizados|Tabla','Pedidos'),
('Personalizados|Crear pedido','Pedidos'),
('Personalizados|Aprobar','Pedidos'),
('Personalizados|Gestionar','Pedidos'),
('Parrilla|Parrilla','Parrilla'),
('Parrilla|Referencias','Parrilla'),
('Parrilla|Editar','Parrilla'),
('Parrilla|Enviar al grupo','Parrilla'),
('Promolog|Promos','Promolog'),
('Promolog|Promobot','Promolog'),
('Promolog|Rendimiento','Promolog'),
('Tickets|Lista de Tickets','Tickets'),
('Tickets|Crear Ticket','Tickets'),
('Tickets|Editar Ticket','Tickets'),
('Tickets|Eliminar Ticket','Tickets'),
('Tickets|Asignar Ticket','Tickets'),
('Tickets|Plantillas','Tickets'),
('Tickets|Gestionar Plantillas','Tickets'),
('Panel de control|Modelos','Panel ejecutivo'),
('Panel de control|Chatters Reclutamiento','Panel ejecutivo'),
('Panel de control|Cuentas Spammer','Panel ejecutivo'),
('Panel de control|Control de Gasto','Panel ejecutivo'),
('Scouter Assist|Mis Tareas','Scouter Assist'),
('Scouter Assist|Generar Tareas','Scouter Assist'),
('Scouter Assist|Recomputar Lookalike','Scouter Assist'),
('Finanzas|Dashboard','Finanzas'),
('Finanzas|Nómina','Finanzas'),
('Finanzas|Invoices','Finanzas'),
('Finanzas|Collections','Finanzas'),
('Finanzas|Control Financiero','Finanzas'),
('Finanzas|Horas Variables','Finanzas'),
('Finanzas|Templates','Finanzas'),
('Finanzas|Reportes','Finanzas'),
('Finanzas|Configuración','Finanzas'),
('HR|Candidatos','Personal'),
('HR|Onboarding','Personal'),
('HR|Empleados Activos','Personal'),
('HR|Offboarding','Personal'),
('HR|Directorio','Personal'),
('HR|Organigrama','Personal'),
('HR|Asistencia','Tiempo'),
('HR|Horarios','Tiempo'),
('HR|Horarios Chatters','Tiempo'),
('HR|Horas Extra','Tiempo'),
('HR|Banco de Horas','Tiempo'),
('HR|Vacaciones','Tiempo'),
('HR|Permisos','Tiempo'),
('HR|Monitoreo','Gestión'),
('HR|Incidentes','Gestión'),
('HR|Desempeño','Gestión'),
('HR|Capacitación','Gestión'),
('HR|Deducciones','Gestión'),
('HR|Anuncios','Gestión'); $$;
create or replace function public.posicion_clave_valida(_clave text) returns boolean
language sql immutable set search_path=public,pg_temp as $$
 select coalesce(_clave=any(array['Dashboard|*','N:argos.presencia','N:argos.avisar','N:argos.video','N:argos.expediente','N:argos.perdonar','N:argos.pdf','N:horarios.gestionar','N:empresa.configurar','N:argos.apps_ajenas','N:camara_pantalla.decidir','N:argos.casos.juzgar','N:argos.casos.obligado','N:argos.casos.corregir','N:argos.casos.reporte','N:argos.casos.jefe','N:argos.ajustes','Cowork|*','Cowork|Crear sesión','N:cowork.miembros','N:cowork.abrir','N:cowork.verpantallas','Messenger|*','N:msg.archivos','N:msg.grupo','N:msg.llamar','N:msg.borrar','Correo|*','Meet|*','Meet|Crear reunión','Meet|Terminar reunión','Grabaciones|*','Oficina|Documentos','Oficina|Hojas de cálculo','Oficina|Presentaciones','Oficina|Calendario','Oficina|Drive','N:drive.empresa','N:drive.subir','N:drive.borrar','N:drive.compartir','Contactos|Contactos','Contactos|Dashboard','Contactos|Crear Contacto','Contactos|Editar Contacto','Contactos|Eliminar Contacto','Contactos|Ver Teléfonos','Administración|Usuarios','N:usr.agregar','N:usr.editar','N:usr.desactivar','N:usr.reset','N:usr.asignar','Administración|Roles','N:pos.agregar','N:pos.editar','N:pos.borrar','N:pos.activar','N:pos.permisos','Administración|Auditoría','Creadores|Lista','Creadores|Dashboard','Creadores|Nuevo','Creadores|Editar Creator','Creadores|Eliminar Creator','Creadores|Cambiar Plataforma','Creadores|Editar Blu CRM','Creadores|Onboarding','Creadores|Offboarding','Creadores|Perfil: Info','Creadores|Perfil: Lineamientos','Creadores|Perfil: Redes','Creadores|Perfil: Monetización','Creadores|Perfil: Documentos','Creadores|Perfil: Notas','Creadores|Perfil: Tickets','Creadores|Perfil: Historial','Creadores|Editar Banking','Creator Sales|Dashboard','Closers|Dashboard','Closers|Actividad','Closers|Operaciones','Closers|Oportunidades','Closers|Asignar Closer','Closers|Editar Status','Closers|Editar Comisiones','Closers|Convertir a Creadora','LeadGen|Lista','LeadGen|Dashboard','LeadGen|Crear Entrada','LeadGen|Eliminar Entradas','LeadGen|Agentes','LeadGen|Supervisores','LeadGen|Rendimiento','WhatsApp|Bandeja','WhatsApp|Canales','WhatsApp|Analítica','WhatsApp|IA','WhatsApp|Asignar conversaciones','Telegram|Bandeja','Telegram|Cuentas','Telegram|Asignar conversaciones','Telefonos|Dashboard','Telefonos|Dispositivos','Chatters|Workspace','Chatters|Evaluator','Chatters|Rendimiento','Chatters|Horarios','Chatters|Horarios · Gestionar','Chatters|Admin','Chatters|Borrar Historial','Agency QA|Chatters: Scorecard','Agency QA|Chatters: QA Cualitativo','Agency QA|Chatters: Masivos','Agency QA|Chatters: Asistencia','Agency QA|Chatters: Anomalías','Agency QA|Chatters: Notificaciones','Agency QA|Calls','Agency QA|New QA','Agency QA|QA History','Agency QA|QA Chat','Agency QA|Borrar Calls','Agency QA|Managers QA','Agency QA|LLG QA','Personalizados|Tablero','Personalizados|Tabla','Personalizados|Crear pedido','Personalizados|Aprobar','Personalizados|Gestionar','Parrilla|Parrilla','Parrilla|Referencias','Parrilla|Editar','Parrilla|Enviar al grupo','Promolog|Promos','Promolog|Promobot','Promolog|Rendimiento','Tickets|Lista de Tickets','Tickets|Crear Ticket','Tickets|Editar Ticket','Tickets|Eliminar Ticket','Tickets|Asignar Ticket','Tickets|Plantillas','Tickets|Gestionar Plantillas','Panel de control|Modelos','Panel de control|Chatters Reclutamiento','Panel de control|Cuentas Spammer','Panel de control|Control de Gasto','Scouter Assist|Mis Tareas','Scouter Assist|Generar Tareas','Scouter Assist|Recomputar Lookalike','Finanzas|Dashboard','Finanzas|Nómina','Finanzas|Invoices','Finanzas|Collections','Finanzas|Control Financiero','Finanzas|Horas Variables','Finanzas|Templates','Finanzas|Reportes','Finanzas|Configuración','HR|Candidatos','HR|Onboarding','HR|Empleados Activos','HR|Offboarding','HR|Directorio','HR|Organigrama','HR|Asistencia','HR|Horarios','HR|Horarios Chatters','HR|Horas Extra','HR|Banco de Horas','HR|Vacaciones','HR|Permisos','HR|Monitoreo','HR|Incidentes','HR|Desempeño','HR|Capacitación','HR|Deducciones','HR|Anuncios']::text[]),false);
$$;

create table public.cowork_solicitudes_acceso (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 session_id uuid not null references public.cowork_sessions(id),
 user_id uuid not null references public.profiles(id) on delete restrict,
 room_id uuid references public.cowork_rooms(id),
 estado text not null default 'pendiente' check(estado in ('pendiente','aprobada','rechazada')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 resuelto_por uuid references public.profiles(id) on delete restrict,
 unique(session_id,user_id)
);
create index cowork_acceso_empresa_estado_idx on public.cowork_solicitudes_acceso(tenant_id,estado);
create index cowork_acceso_persona_idx on public.cowork_solicitudes_acceso(user_id);
create index cowork_acceso_sala_idx on public.cowork_solicitudes_acceso(room_id);
create index cowork_acceso_responsable_idx on public.cowork_solicitudes_acceso(resuelto_por);
create table public.cowork_accesos_auditoria (
 id bigint generated always as identity primary key,
 tenant_id uuid not null references public.tenants(id),
 session_id uuid not null references public.cowork_sessions(id),
 user_id uuid not null references public.profiles(id) on delete restrict,
 actor uuid not null references public.profiles(id) on delete restrict,
 antes jsonb, despues jsonb not null, created_at timestamptz not null default now()
);
create index cowork_accesos_auditoria_empresa_idx on public.cowork_accesos_auditoria(tenant_id,created_at desc);
create index cowork_accesos_auditoria_sesion_idx on public.cowork_accesos_auditoria(session_id);
create index cowork_accesos_auditoria_persona_idx on public.cowork_accesos_auditoria(user_id);
create index cowork_accesos_auditoria_actor_idx on public.cowork_accesos_auditoria(actor);
alter table public.cowork_solicitudes_acceso enable row level security;
alter table public.cowork_accesos_auditoria enable row level security;
revoke all on public.cowork_solicitudes_acceso, public.cowork_accesos_auditoria from anon, authenticated;
grant select on public.cowork_solicitudes_acceso, public.cowork_accesos_auditoria to authenticated;

create or replace function public.cowork_puede_gestionar_acceso(_session uuid,_user uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(auth.uid() is not null and auth.uid()<>_user
   and public.tiene_funcion(auth.uid(),'Cowork|*')
   and public.posicion_persona_en_alcance(auth.uid(),_user,'N:cowork.miembros')
   and exists(select 1 from public.cowork_sessions s
     join public.tenant_members yo on yo.tenant_id=s.tenant_id and yo.user_id=auth.uid()
     join public.tenant_members el on el.tenant_id=s.tenant_id and el.user_id=_user
     join public.profiles p on p.id=el.user_id and p.deleted_at is null
     join public.profiles a on a.id=yo.user_id and a.deleted_at is null
     where s.id=_session and s.status='active'),false);
$$;
create policy cowork_acceso_lectura on public.cowork_solicitudes_acceso for select to authenticated
 using(user_id=(select auth.uid()) or public.cowork_puede_gestionar_acceso(session_id,user_id));
create policy cowork_acceso_historial on public.cowork_accesos_auditoria for select to authenticated
 using(public.cowork_puede_gestionar_acceso(session_id,user_id));

-- Lectura propia: no necesita revelar salas ni miembros a quien espera aprobación.
create or replace function public.cowork_mi_solicitud(_session uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('estado',q.estado,'sessionId',s.id,'sessionName',s.name,
   'roomId',q.room_id,'roomName',r.name,'pendingApproval',true)
 from public.cowork_solicitudes_acceso q
 join public.cowork_sessions s on s.id=q.session_id and s.status='active'
 join public.tenant_members m on m.user_id=auth.uid() and m.tenant_id=s.tenant_id
 left join public.cowork_rooms r on r.id=q.room_id and r.session_id=s.id
 where q.user_id=auth.uid() and q.session_id=_session;
$$;

create or replace function public.cowork_solicitar_acceso(_session uuid,_room uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); empresa uuid;
begin
 select s.tenant_id into empresa from public.cowork_sessions s
 join public.tenant_members m on m.tenant_id=s.tenant_id and m.user_id=uid
 join public.profiles p on p.id=uid and p.deleted_at is null
 where s.id=_session and s.status='active';
 if empresa is null or public.posicion_decision(uid,'Cowork|*') is false then
   raise exception 'No tienes acceso a este Cowork' using errcode='42501'; end if;
 if _room is not null and not exists(select 1 from public.cowork_rooms where id=_room and session_id=_session) then
   raise exception 'La sala no pertenece a este Cowork'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cowork-acceso:'||_session::text||':'||uid::text,0));
 if exists(select 1 from public.cowork_memberships where session_id=_session and user_id=uid) then
   return jsonb_build_object('estado','miembro','sessionId',_session,'pendingApproval',false);
 end if;
 insert into public.cowork_solicitudes_acceso(tenant_id,session_id,user_id,room_id)
 values(empresa,_session,uid,_room) on conflict(session_id,user_id) do nothing;
 return public.cowork_mi_solicitud(_session);
end $$;

-- La aprobación, membresía y sala fija se guardan juntas. Solo se mueve una
-- asignación que ya estaba activa: agregar a alguien desconectado no registra horas.
create or replace function public.cowork_resolver_acceso(_session uuid,_user uuid,_room uuid,_aprobar boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); empresa uuid; previa jsonb; posterior jsonb;
 sala_nombre text; anterior uuid; anterior_sala uuid;
begin
 select tenant_id into empresa from public.cowork_sessions where id=_session;
 perform pg_advisory_xact_lock(hashtextextended('posiciones:'||coalesce(empresa::text,''),0));
 if not public.cowork_puede_gestionar_acceso(_session,_user) then
   raise exception 'Tu posición no permite gestionar a esta persona en este Cowork' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cowork-acceso:'||_session::text||':'||_user::text,0));
 select to_jsonb(q) into previa from public.cowork_solicitudes_acceso q
 where session_id=_session and user_id=_user for update;
 if _aprobar is null then raise exception 'Debes elegir aprobar o rechazar'; end if;
 if _aprobar then
   if public.posicion_decision(_user,'Cowork|*') is false then
     raise exception 'Primero habilita Cowork en la posición de esta persona'; end if;
   select name into sala_nombre from public.cowork_rooms where id=_room and session_id=_session;
   if sala_nombre is null then raise exception 'Elige una sala de este Cowork'; end if;
   if exists(select 1 from public.cowork_memberships where session_id=_session and user_id=_user and role='host') then
     raise exception 'Un anfitrión trabaja desde su panel y no se asigna a una sala'; end if;
   insert into public.cowork_memberships(session_id,user_id,role) values(_session,_user,'participant')
     on conflict(session_id,user_id) do nothing;
   insert into public.cowork_sala_fija(session_id,user_id,room_id,asignado_por,updated_at)
     values(_session,_user,_room,uid,now()) on conflict(session_id,user_id) do update
     set room_id=excluded.room_id,asignado_por=excluded.asignado_por,updated_at=excluded.updated_at;
   select id,room_id into anterior,anterior_sala from public.cowork_room_assignments
     where session_id=_session and user_id=_user and is_active for update;
   if anterior is not null and anterior_sala<>_room then
     update public.cowork_room_assignments set is_active=false where id=anterior;
     insert into public.cowork_room_assignments(session_id,user_id,room_id,assigned_by)
       values(_session,_user,_room,uid);
   end if;
 else
   if previa is null or previa->>'estado'<>'pendiente' then raise exception 'No hay una solicitud pendiente'; end if;
 end if;
 insert into public.cowork_solicitudes_acceso(tenant_id,session_id,user_id,room_id,estado,resuelto_por)
 values(empresa,_session,_user,case when _aprobar then _room else (previa->>'room_id')::uuid end,
   case when _aprobar then 'aprobada' else 'rechazada' end,uid)
 on conflict(session_id,user_id) do update set room_id=excluded.room_id,estado=excluded.estado,
   resuelto_por=excluded.resuelto_por,updated_at=now() returning to_jsonb(cowork_solicitudes_acceso.*) into posterior;
 if previa is distinct from posterior then
   insert into public.cowork_accesos_auditoria(tenant_id,session_id,user_id,actor,antes,despues)
   values(empresa,_session,_user,uid,previa,posterior);
 end if;
 return jsonb_build_object('ok',true,'soloFija',anterior is null,'roomId',_room,'roomName',sala_nombre);
end $$;

-- Solo nombres y salas de la empresa; nunca devuelve la actividad de un equipo ajeno.
create or replace function public.cowork_panel_accesos(_session uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare empresa uuid; personas jsonb; sesiones jsonb; solicitudes jsonb;
begin
 select m.tenant_id into empresa from public.tenant_members m join public.profiles p on p.id=m.user_id
   where m.user_id=auth.uid() and p.deleted_at is null;
 if empresa is null or not public.tiene_funcion(auth.uid(),'Cowork|*')
   or not public.tiene_funcion(auth.uid(),'N:cowork.miembros') then
   raise exception 'Tu posición no permite gestionar accesos de Cowork' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nombre',p.full_name) order by p.full_name),'[]') into personas
 from public.profiles p join public.tenant_members m on m.user_id=p.id and m.tenant_id=empresa
 where p.id<>auth.uid() and p.deleted_at is null
   and public.posicion_persona_en_alcance(auth.uid(),p.id,'N:cowork.miembros');
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'nombre',s.name,'salas',
   (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'nombre',r.name) order by r.sort_order),'[]')
    from public.cowork_rooms r where r.session_id=s.id)) order by s.name),'[]') into sesiones
 from public.cowork_sessions s where s.tenant_id=empresa and s.status='active' and (_session is null or s.id=_session);
 select coalesce(jsonb_agg(jsonb_build_object('userId',q.user_id,'nombre',p.full_name,'sessionId',q.session_id,
   'sessionName',s.name,'roomId',q.room_id,'createdAt',q.created_at) order by q.created_at),'[]') into solicitudes
 from public.cowork_solicitudes_acceso q join public.profiles p on p.id=q.user_id
 join public.cowork_sessions s on s.id=q.session_id and s.status='active'
 where q.tenant_id=empresa and q.estado='pendiente' and (_session is null or q.session_id=_session)
   and public.cowork_puede_gestionar_acceso(q.session_id,q.user_id);
 return jsonb_build_object('personas',personas,'sesiones',sesiones,'solicitudes',solicitudes);
end $$;

revoke all on function public.cowork_puede_gestionar_acceso(uuid,uuid),public.cowork_mi_solicitud(uuid),
 public.cowork_solicitar_acceso(uuid,uuid),public.cowork_resolver_acceso(uuid,uuid,uuid,boolean),
 public.cowork_panel_accesos(uuid) from public,anon;
grant execute on function public.cowork_puede_gestionar_acceso(uuid,uuid),public.cowork_mi_solicitud(uuid),
 public.cowork_solicitar_acceso(uuid,uuid),public.cowork_resolver_acceso(uuid,uuid,uuid,boolean),
 public.cowork_panel_accesos(uuid) to authenticated;
