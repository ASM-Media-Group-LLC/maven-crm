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
revoke all on function public.posiciones_funciones_catalogo() from public,anon,authenticated;
-- Constructor de posiciones: cada operación requiere su propia función.
-- El traductor heredado queda privado y no se puede usar para saltar el editor.
create or replace function public.posiciones_administra(_actor uuid,_accion text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(_actor is not null and exists(select 1 from public.tenant_members m
   where m.user_id=_actor and m.tenant_id=public.current_tenant_id())
   and not coalesce((select deshabilitada from public.personas_borrador_marcas where user_id=_actor),false)
   and (exists(select 1 from public.tenant_owners o where o.user_id=_actor and o.tenant_id=public.current_tenant_id())
     or (public.tiene_funcion(_actor,'Administración|Roles') and public.tiene_funcion(_actor,_accion))),false);
$$;
revoke all on function public.posiciones_administra(uuid,text) from public,anon,authenticated;

-- Un delegado no puede conceder funciones/alcances superiores a los suyos.
create or replace function public.posicion_validar_delegacion(_actor uuid,_p public.posiciones_borrador)
returns void language plpgsql stable security definer set search_path=public,pg_temp as $$
declare k text; r record; rango int; concedido int;
begin
 if exists(select 1 from public.tenant_owners o where o.user_id=_actor and o.tenant_id=_p.tenant_id) then return; end if;
 if _p.acceso_total or _p.todas_creadoras then
   raise exception 'Solo el dueño puede conceder acceso total o a todas las creadoras' using errcode='42501';
 end if;
 for k in select key from jsonb_each(_p.checks) where value='true'::jsonb loop
   if not public.tiene_funcion(_actor,k) then raise exception 'No puedes conceder una función que no tienes: %',k using errcode='42501'; end if;
 end loop;
 for r in select c.clave,c.fila as key,coalesce(_p.alcances->>c.fila,'all') as value
   from public.posiciones_funciones_catalogo() c where _p.checks->c.clave='true'::jsonb loop
   rango:=case r.value when 'all' then 3 when 'subordinates' then 2 else 1 end;
   -- La función y el alcance tienen que venir del MISMO puesto. Ver Usuarios
   -- con alcance all no amplía reset_password concedido solo para self.
   select coalesce(max(case when p.acceso_total then 3 else case coalesce(p.alcances->>r.key,'all') when 'all' then 3 when 'subordinates' then 2 else 1 end end),0)
     into concedido from public.posiciones_borrador p join public.posiciones_borrador_personas a on a.posicion_id=p.id
     where a.user_id=_actor and p.activa and p.tenant_id=_p.tenant_id
       and (p.acceso_total or p.checks->r.clave='true'::jsonb);
   if rango>concedido then raise exception 'No puedes conceder un alcance superior al tuyo: %',r.key using errcode='42501'; end if;
 end loop;
end $$;
revoke all on function public.posicion_validar_delegacion(uuid,public.posiciones_borrador) from public,anon,authenticated;

revoke insert,update,delete on public.posiciones_borrador from authenticated;
create or replace function public.posicion_guardar(_id uuid,_revision timestamptz,_cambios jsonb,_plantilla uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); empresa uuid:=public.current_tenant_id();
 previo public.posiciones_borrador%rowtype; candidato public.posiciones_borrador%rowtype;
 base public.posiciones_borrador%rowtype; nuevo boolean:=_id is null;
 anterior text:=current_setting('maven.posiciones_aplicando',true);
begin
 if actor is null then raise exception 'Inicia sesión' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('posiciones:'||empresa::text,0));
 if (jsonb_typeof(_cambios) is distinct from 'object' or _cambios='{}'::jsonb) or exists(select 1 from jsonb_object_keys(_cambios) k
   where k not in ('nombre','descripcion','activa','checks','alcances','acceso_total','todas_creadoras','modalidad_id')) then
   raise exception 'Configuración de posición inválida' using errcode='22023';
 end if;
 if nuevo then
   if not public.posiciones_administra(actor,'N:pos.agregar') then raise exception 'No puedes crear posiciones' using errcode='42501'; end if;
   if _plantilla is not null then
     select * into base from public.posiciones_borrador where id=_plantilla and tenant_id=empresa;
     if not found then raise exception 'Plantilla inválida' using errcode='22023'; end if;
     if exists(select 1 from public.posiciones_borrador_personas a join public.tenant_owners o on o.user_id=a.user_id where a.posicion_id=_plantilla) then
       raise exception 'La posición del dueño no es una plantilla' using errcode='42501';
     end if;
   end if;
   candidato:=jsonb_populate_record(null::public.posiciones_borrador,jsonb_build_object(
     'id',gen_random_uuid(),'tenant_id',empresa,'nombre','','descripcion',null,'activa',true,
     'acceso_total',coalesce(base.acceso_total,false),'todas_creadoras',coalesce(base.todas_creadoras,false),
     'checks',coalesce(base.checks,'{}'::jsonb),'alcances',coalesce(base.alcances,'{}'::jsonb),'modalidad_id',base.modalidad_id,
     'pide_camara',coalesce(base.pide_camara,true),'pide_pantalla',coalesce(base.pide_pantalla,true)));
 else
   select * into previo from public.posiciones_borrador where id=_id and tenant_id=empresa for update;
   if not found then raise exception 'Posición no disponible' using errcode='42501'; end if;
   if _revision is null or previo.updated_at is distinct from _revision then raise exception 'La posición cambió en otra sesión. Recarga y revisa de nuevo' using errcode='40001'; end if;
   if exists(select 1 from public.posiciones_borrador_personas a join public.tenant_owners o on o.user_id=a.user_id where a.posicion_id=_id)
     or (not public.es_dueno(actor) and exists(select 1 from public.posiciones_borrador_personas a where a.user_id=actor and a.posicion_id=_id)) then
     raise exception 'Esta posición está protegida' using errcode='42501';
   end if;
   if (_cambios ?| array['nombre','descripcion']) and not public.posiciones_administra(actor,'N:pos.editar') then raise exception 'No puedes editar posiciones' using errcode='42501'; end if;
   if (_cambios ? 'activa') and not public.posiciones_administra(actor,'N:pos.activar') then raise exception 'No puedes activar posiciones' using errcode='42501'; end if;
   if (_cambios ?| array['checks','alcances','acceso_total','todas_creadoras','modalidad_id']) and not public.posiciones_administra(actor,'N:pos.permisos') then raise exception 'No puedes editar permisos' using errcode='42501'; end if;
   perform public.posicion_validar_delegacion(actor,previo);
   candidato:=previo;
 end if;
 if (_cambios ? 'checks' and jsonb_typeof(_cambios->'checks') is distinct from 'object') or
    (_cambios ? 'alcances' and jsonb_typeof(_cambios->'alcances') is distinct from 'object') or
    exists(select 1 from jsonb_each(_cambios) x where x.key in ('activa','acceso_total','todas_creadoras') and jsonb_typeof(x.value)<>'boolean') then
   raise exception 'Configuración inválida' using errcode='22023';
 end if;
 candidato:=jsonb_populate_record(candidato,_cambios);
 candidato.nombre:=btrim(candidato.nombre);
 if candidato.nombre is null or length(candidato.nombre) not between 1 and 80 or length(coalesce(candidato.descripcion,''))>300
   or exists(select 1 from public.posiciones_borrador p where p.tenant_id=empresa and lower(p.nombre)=lower(candidato.nombre) and p.id<>candidato.id) then
   raise exception 'Escribe un nombre válido y único para esta posición' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_each(candidato.checks) x where jsonb_typeof(x.value)<>'boolean' or not public.posicion_clave_valida(x.key))
   or exists(select 1 from jsonb_each_text(candidato.alcances) x where x.value is null or x.value not in ('all','subordinates','self') or (not exists(select 1 from public.posiciones_funciones_catalogo() c where c.fila=x.key) and coalesce(previo.alcances,base.alcances,'{}'::jsonb)->x.key is distinct from to_jsonb(x.value))) then
   raise exception 'Permisos o alcance de datos inválidos' using errcode='22023';
 end if;
 if candidato.modalidad_id is not null and not exists(select 1 from public.pausas_modalidades m
   where m.id=candidato.modalidad_id and m.tenant_id=empresa and (m.activa or m.id=previo.modalidad_id)) then
   raise exception 'La modalidad no pertenece a tu empresa o está inactiva' using errcode='22023';
 end if;
 perform public.posicion_validar_delegacion(actor,candidato);
 perform set_config('maven.posiciones_aplicando','on',true);
 if nuevo then
   insert into public.posiciones_borrador(id,tenant_id,rol,nombre,descripcion,activa,acceso_total,todas_creadoras,checks,alcances,modalidad_id,pide_camara,pide_pantalla,orden)
     values(candidato.id,empresa,'pos_'||replace(candidato.id::text,'-',''),candidato.nombre,candidato.descripcion,candidato.activa,
       candidato.acceso_total,candidato.todas_creadoras,candidato.checks,candidato.alcances,candidato.modalidad_id,candidato.pide_camara,candidato.pide_pantalla,
       (select coalesce(max(orden),0)+1 from public.posiciones_borrador where tenant_id=empresa)) returning * into candidato;
 else
   update public.posiciones_borrador set nombre=candidato.nombre,descripcion=candidato.descripcion,activa=candidato.activa,
     checks=candidato.checks,alcances=candidato.alcances,acceso_total=candidato.acceso_total,todas_creadoras=candidato.todas_creadoras,
     modalidad_id=candidato.modalidad_id,updated_at=clock_timestamp() where id=_id returning * into candidato;
 end if;
 perform public.posiciones_sincronizar(false,false);
 perform public.posiciones_sincronizar(false,false);
 perform set_config('maven.posiciones_aplicando',coalesce(anterior,''),true);
 insert into public.posiciones_revisiones(posicion_id,actor,antes,despues) values(candidato.id,actor,
   case when nuevo then '{}'::jsonb else to_jsonb(previo) end,to_jsonb(candidato));
 return to_jsonb(candidato);
end $$;
revoke all on function public.posicion_guardar(uuid,timestamptz,jsonb,uuid) from public,anon;
grant execute on function public.posicion_guardar(uuid,timestamptz,jsonb,uuid) to authenticated;

create or replace function public.posicion_aplicar_revision(_id uuid,_revision timestamptz,_cambios jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if _id is null or not(_cambios ?& array['checks','alcances','acceso_total','todas_creadoras','modalidad_id'])
   or exists(select 1 from jsonb_object_keys(_cambios) k where k not in ('checks','alcances','acceso_total','todas_creadoras','modalidad_id')) then
   raise exception 'Configuración de permisos inválida' using errcode='22023';
 end if;
 return public.posicion_guardar(_id,_revision,_cambios,null);
end $$;

create or replace function public.posicion_eliminar(_id uuid,_revision timestamptz)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); empresa uuid:=public.current_tenant_id(); previo public.posiciones_borrador%rowtype;
 anterior text:=current_setting('maven.posiciones_aplicando',true);
begin
 if not public.posiciones_administra(actor,'N:pos.borrar') then raise exception 'No puedes eliminar posiciones' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('posiciones:'||empresa::text,0));
 select * into previo from public.posiciones_borrador where id=_id and tenant_id=empresa for update;
 if not found then raise exception 'Posición no disponible' using errcode='42501'; end if;
 if _revision is null or previo.updated_at is distinct from _revision then raise exception 'La posición cambió. Recarga y revisa de nuevo' using errcode='40001'; end if;
 if exists(select 1 from public.posiciones_borrador_personas where posicion_id=_id) then raise exception 'Reasigna a sus personas antes de eliminar la posición' using errcode='23503'; end if;
 perform public.posicion_validar_delegacion(actor,previo);
 perform set_config('maven.posiciones_aplicando','on',true);
 delete from public.posiciones_borrador where id=_id;
 -- El identificador heredado deja de poder asignarse. No se borra historial.
 update public.roles_config set is_active=false where tenant_id=empresa and name=previo.rol and name<>'admin';
 insert into public.posiciones_revisiones(posicion_id,actor,antes,despues) values(_id,actor,to_jsonb(previo),'{}');
 perform set_config('maven.posiciones_aplicando',coalesce(anterior,''),true);
end $$;
revoke all on function public.posicion_eliminar(uuid,timestamptz) from public,anon;
grant execute on function public.posicion_eliminar(uuid,timestamptz) to authenticated;

create or replace function public.persona_puede_asignar(_actor uuid,_target uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(_actor is not null and _target<>_actor
   and exists(select 1 from public.tenant_members m where m.user_id=_target and m.tenant_id=public.current_tenant_id())
   and exists(select 1 from public.tenant_members m where m.user_id=_actor and m.tenant_id=public.current_tenant_id())
   and not coalesce((select deshabilitada from public.personas_borrador_marcas where user_id=_actor),false)
   and not exists(select 1 from public.tenant_owners o where o.user_id=_target)
   and (exists(select 1 from public.tenant_owners o where o.user_id=_actor and o.tenant_id=public.current_tenant_id())
     or (public.tiene_funcion(_actor,'Administración|Usuarios') and public.tiene_funcion(_actor,'N:usr.asignar')
       and public.posicion_usuario_en_alcance(_actor,_target,'N:usr.asignar')
       and not coalesce((select protegido from public.personas_borrador_marcas where user_id=_target),false))),false);
$$;
revoke all on function public.persona_puede_asignar(uuid,uuid) from public,anon,authenticated;

create or replace function public.persona_aplicar_accesos(_user_id uuid,_revision bigint,_posiciones uuid[],_denegadas text[],_versiones jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid:=auth.uid(); empresa uuid:=public.current_tenant_id(); actual public.personas_accesos_revision%rowtype;
  puesto public.posiciones_borrador%rowtype; antes jsonb; despues jsonb; elegidas uuid[]; restricciones text[]; anterior text:=current_setting('maven.posiciones_aplicando',true);
begin
  if not public.persona_puede_asignar(actor,_user_id) then
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
  if not public.es_dueno(actor) then
    for puesto in select * from public.posiciones_borrador where id=any(elegidas) loop
      -- Solo las funciones efectivamente concedidas; las denegaciones no
      -- elevan acceso y siguen ganando sobre todos los puestos.
      puesto.checks:=puesto.checks - restricciones;
      perform public.posicion_validar_delegacion(actor,puesto);
    end loop;
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

create or replace function public.constructor_posiciones_datos()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); empresa uuid:=public.current_tenant_id(); dueno boolean;begin
 dueno:=exists(select 1 from public.tenant_owners where user_id=actor and tenant_id=empresa);
 if actor is null or not(dueno or public.posiciones_administra(actor,'Administración|Roles')
   or (public.tiene_funcion(actor,'Administración|Usuarios') and public.tiene_funcion(actor,'N:usr.asignar'))) then
   raise exception 'No tienes acceso al constructor de posiciones' using errcode='42501';
 end if;
 return jsonb_build_object(
   'dueno',dueno,
   'acciones',jsonb_build_object('agregar',public.posiciones_administra(actor,'N:pos.agregar'),'editar',public.posiciones_administra(actor,'N:pos.editar'),
     'borrar',public.posiciones_administra(actor,'N:pos.borrar'),'activar',public.posiciones_administra(actor,'N:pos.activar'),'permisos',public.posiciones_administra(actor,'N:pos.permisos')),
   'posiciones',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object(
     'protegida',exists(select 1 from public.posiciones_borrador_personas a where a.posicion_id=p.id and (exists(select 1 from public.tenant_owners o where o.user_id=a.user_id) or (not dueno and a.user_id=actor))),
     'asignable',not exists(select 1 from public.posiciones_borrador_personas a join public.tenant_owners o on o.user_id=a.user_id where a.posicion_id=p.id)) order by p.orden,p.created_at),'[]')
     from public.posiciones_borrador p where p.tenant_id=empresa),
   'personas',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'avatar_url',p.avatar_url,'editable',public.persona_puede_asignar(actor,p.id)) order by p.full_name),'[]')
     from public.profiles p join public.tenant_members m on m.user_id=p.id and m.tenant_id=empresa
     where p.deleted_at is null and (dueno or public.persona_puede_asignar(actor,p.id) or p.id=actor)),
   'asignaciones',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.posiciones_borrador_personas a
     join public.posiciones_borrador p on p.id=a.posicion_id where p.tenant_id=empresa and (dueno or public.persona_puede_asignar(actor,a.user_id) or a.user_id=actor)),
   'revisiones',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.personas_accesos_revision r
     where r.tenant_id=empresa and (dueno or public.persona_puede_asignar(actor,r.user_id) or r.user_id=actor)),
   'marcas',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.personas_borrador_marcas r
     join public.tenant_members m on m.user_id=r.user_id and m.tenant_id=empresa where dueno),
   'duenos',(select coalesce(jsonb_agg(jsonb_build_object('user_id',o.user_id)),'[]') from public.tenant_owners o where o.tenant_id=empresa)
 );
end $$;
revoke all on function public.constructor_posiciones_datos() from public,anon;
grant execute on function public.constructor_posiciones_datos() to authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_user(_caller uuid, _target uuid, _action text, _new_role text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_level int; v_target_level int; v_new_role_level int;
  v_is_admin boolean; v_target_is_admin boolean; v_new_role_is_admin boolean;
  v_admin_count int; v_effective_role text; v_ctx jsonb; v_function text;
BEGIN
  -- Allowlist: una acción no declarada se DENIEGA acá, no queda abierta por olvido.
  IF _action IS NULL OR _action NOT IN
     ('assign_role','remove_role','delete_user','reset_password',
      'update_profile','create_user','list_users') THEN
    RETURN jsonb_build_object('allowed', false, 'reason','unknown_action');
  END IF;
  IF _caller IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason','no_caller');
  END IF;
  IF NOT public.can_manage_users(_caller) THEN
    RETURN jsonb_build_object('allowed', false, 'reason','no_user_management_permission');
  END IF;
  -- Otra agencia: nadie gestiona a quien no es de la suya (20261001211000).
  IF _target IS NOT NULL
     AND (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = _target)
         IS DISTINCT FROM (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = _caller) THEN
    RETURN jsonb_build_object('allowed', false, 'reason','other_agency');
  END IF;

  v_is_admin     := public.is_in_role_group(_caller,'admin');
  v_caller_level := public.actor_level(_caller);
  v_target_level := CASE WHEN _target IS NULL THEN NULL ELSE public.target_level(_target) END;
  v_ctx := jsonb_build_object('caller_level',v_caller_level,'target_level',v_target_level);
  -- El alta sin rol crea employee por el trigger de auth.users: también se
  -- valida ese nivel para que omitir el campo no salte la jerarquía.
  if _action='create_user' and _new_role is null then _new_role := 'employee'; end if;

  -- Si el rol pedido es el que YA tiene, no es asignación: así "editar el nombre"
  -- (que el front manda siempre con role) no se convierte en cambio de rol.
  IF _new_role IS NOT NULL AND _target IS NOT NULL THEN
    SELECT ur.role::text INTO v_effective_role
    FROM public.user_roles ur WHERE ur.user_id = _target LIMIT 1;
    IF v_effective_role = _new_role THEN _new_role := NULL; END IF;
  END IF;

  -- El selector heredado no puede deshacer las asignaciones revisadas.
  if _target is not null and public.posiciones_controlan(_target)
    and (_action in ('assign_role','remove_role') or (_action='update_profile' and _new_role is not null)) then
    return jsonb_build_object('allowed',false,'reason','use_position_constructor')||v_ctx;
  end if;
  -- Cada operación respeta su casilla, incluso cuando el rol es admin.
  v_function := case _action
    when 'create_user' then 'N:usr.agregar'
    when 'update_profile' then 'N:usr.editar'
    when 'delete_user' then 'N:usr.desactivar'
    when 'reset_password' then 'N:usr.reset'
    when 'assign_role' then 'N:usr.asignar'
    when 'remove_role' then 'N:usr.asignar'
    else null end;
  if v_function is not null and public.posicion_decision(_caller,v_function) is false then
    return jsonb_build_object('allowed',false,'reason','position_function_denied','function',v_function)||v_ctx;
  end if;
  -- Editar el perfil no puede convertirse en asignar un rol por otro camino.
  -- Se evalúa después de normalizar el rol sin cambios a NULL.
  if _new_role is not null and (_action='update_profile' or (_action='create_user' and _new_role<>'employee'))
     and public.posicion_decision(_caller,'N:usr.asignar') is false then
    return jsonb_build_object('allowed',false,'reason','position_function_denied','function','N:usr.asignar')||v_ctx;
  end if;
  if _target is not null and _action not in ('create_user','list_users')
     and (not public.posicion_usuario_en_alcance(_caller,_target,v_function)
       or (_action='update_profile' and _new_role is not null
           and not public.posicion_usuario_en_alcance(_caller,_target,'N:usr.asignar'))) then
    return jsonb_build_object('allowed',false,'reason','outside_position_scope')||v_ctx;
  end if;
  -- La cuenta del dueño no se puede administrar mediante el bypass de admin.
  if _target is not null and _target <> _caller
     and public.es_dueno(_target) and not public.es_dueno(_caller) then
    return jsonb_build_object('allowed',false,'reason','protected_owner')||v_ctx;
  end if;
  if _target is not null and not public.es_dueno(_caller)
     and exists (select 1 from public.personas_borrador_marcas m where m.user_id=_target and m.protegido) then
    return jsonb_build_object('allowed',false,'reason','protected_user')||v_ctx;
  end if;

  IF _action IN ('assign_role','create_user','update_profile') AND _new_role IS NOT NULL THEN
    SELECT rc.level, COALESCE(rg.is_admin,false)
      INTO v_new_role_level, v_new_role_is_admin
    FROM public.roles_config rc
    LEFT JOIN public.role_groups rg ON rg.role_name = rc.name AND rg.tenant_id = rc.tenant_id
    WHERE rc.name = _new_role AND rc.is_active
      AND rc.tenant_id = (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = _caller);

    IF v_new_role_level IS NULL THEN
      RETURN jsonb_build_object('allowed',false,'reason','invalid_or_inactive_role')||v_ctx;
    END IF;
    -- ESTRICTO (decisión de Jhon): >= , no >. Un supervisor no puede nombrar a otro
    -- supervisor, ni HHRR a otro HHRR. Solo el admin saltea la escalera.
    IF NOT v_is_admin AND v_new_role_level >= v_caller_level THEN
      RETURN jsonb_build_object('allowed',false,'reason','role_at_or_above_caller_level',
                                'new_role_level',v_new_role_level)||v_ctx;
    END IF;
  END IF;

  IF _action = 'create_user' THEN
    RETURN jsonb_build_object('allowed',true,'reason','ok')||v_ctx;
  END IF;
  IF _action = 'list_users' THEN
    RETURN jsonb_build_object('allowed',true,'reason','ok')||v_ctx;
  END IF;
  IF _target IS NULL THEN
    RETURN jsonb_build_object('allowed',false,'reason','no_target')||v_ctx;
  END IF;

  IF _target = _caller THEN
    IF _action = 'update_profile' AND _new_role IS NULL THEN
      RETURN jsonb_build_object('allowed',true,'reason','self_profile_ok')||v_ctx;
    END IF;
    RETURN jsonb_build_object('allowed',false,'reason','self_target_not_allowed')||v_ctx;
  END IF;

  v_target_is_admin := public.is_in_role_group(_target,'admin');

  -- Último admin: decide por role_groups.is_admin (fuente de verdad), no por level.
  IF v_target_is_admin AND (
       _action IN ('delete_user','remove_role')
       OR (_action IN ('assign_role','update_profile')
           AND _new_role IS NOT NULL AND NOT COALESCE(v_new_role_is_admin,false))
     ) THEN
    SELECT COUNT(DISTINCT ur.user_id) INTO v_admin_count
    FROM public.user_roles ur JOIN public.role_groups rg ON rg.role_name = ur.role::text and rg.tenant_id = ur.tenant_id
    WHERE rg.is_admin
      AND ur.tenant_id = (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = _target);
    IF v_admin_count <= 1 THEN
      RETURN jsonb_build_object('allowed',false,'reason','last_admin')||v_ctx;
    END IF;
  END IF;

  IF v_is_admin THEN
    RETURN jsonb_build_object('allowed',true,'reason','admin_bypass')||v_ctx;
  END IF;
  IF v_caller_level > v_target_level THEN
    RETURN jsonb_build_object('allowed',true,'reason','ok')||v_ctx;
  END IF;
  RETURN jsonb_build_object('allowed',false,
    'reason', CASE WHEN v_target_level = 999 THEN 'unknown_target_role'
                   ELSE 'target_level_not_below_caller' END)||v_ctx;
END;
$function$;

