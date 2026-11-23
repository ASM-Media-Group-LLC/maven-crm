-- Jornada configurable por posición, independiente de acceso administrativo y monitoreo.
-- Una excepción explícita desactivada prevalece al combinar posiciones.
alter table public.posiciones_borrador
 add column registra_horas boolean,
 add column registra_comida boolean,
 add column registra_bano boolean;
CREATE OR REPLACE FUNCTION public.posicion_guardar(_id uuid, _revision timestamp with time zone, _cambios jsonb, _plantilla uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare actor uuid:=auth.uid(); empresa uuid:=public.current_tenant_id();
 previo public.posiciones_borrador%rowtype; candidato public.posiciones_borrador%rowtype;
 base public.posiciones_borrador%rowtype; nuevo boolean:=_id is null;
 anterior text:=current_setting('maven.posiciones_aplicando',true);
begin
 if actor is null then raise exception 'Inicia sesión' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('posiciones:'||empresa::text,0));
 if (jsonb_typeof(_cambios) is distinct from 'object' or _cambios='{}'::jsonb) or exists(select 1 from jsonb_object_keys(_cambios) k
   where k not in ('nombre','descripcion','activa','checks','alcances','acceso_total','todas_creadoras','modalidad_id','registra_horas','registra_comida','registra_bano')) then
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
     'registra_horas',base.registra_horas,'registra_comida',base.registra_comida,'registra_bano',base.registra_bano,
     'pide_camara',coalesce(base.pide_camara,true),'pide_pantalla',coalesce(base.pide_pantalla,true)));
 else
   select * into previo from public.posiciones_borrador where id=_id and tenant_id=empresa for update;
   if not found then raise exception 'Posición no disponible' using errcode='42501'; end if;
   if not public.es_dueno(actor) and exists(select 1 from public.posiciones_borrador_personas a
     where a.posicion_id=_id and (public.es_admin_o_dueno(a.user_id) or exists(select 1 from public.personas_borrador_marcas m where m.user_id=a.user_id and m.protegido))) then
     raise exception 'Solo el dueño puede modificar posiciones de administradores o personas protegidas' using errcode='42501';
   end if;
   if _revision is null or previo.updated_at is distinct from _revision then raise exception 'La posición cambió en otra sesión. Recarga y revisa de nuevo' using errcode='40001'; end if;
   if exists(select 1 from public.posiciones_borrador_personas a join public.tenant_owners o on o.user_id=a.user_id where a.posicion_id=_id)
     or (not public.es_dueno(actor) and exists(select 1 from public.posiciones_borrador_personas a where a.user_id=actor and a.posicion_id=_id)) then
     raise exception 'Esta posición está protegida' using errcode='42501';
   end if;
   if (_cambios ?| array['nombre','descripcion']) and not public.posiciones_administra(actor,'N:pos.editar') then raise exception 'No puedes editar posiciones' using errcode='42501'; end if;
   if (_cambios ? 'activa') and not public.posiciones_administra(actor,'N:pos.activar') then raise exception 'No puedes activar posiciones' using errcode='42501'; end if;
   if (_cambios ?| array['checks','alcances','acceso_total','todas_creadoras','modalidad_id','registra_horas','registra_comida','registra_bano']) and not public.posiciones_administra(actor,'N:pos.permisos') then raise exception 'No puedes editar permisos' using errcode='42501'; end if;
   perform public.posicion_validar_delegacion(actor,previo);
   candidato:=previo;
 end if;
 if (_cambios ? 'checks' and jsonb_typeof(_cambios->'checks') is distinct from 'object') or
    (_cambios ? 'alcances' and jsonb_typeof(_cambios->'alcances') is distinct from 'object') or
    exists(select 1 from jsonb_each(_cambios) x where x.key in ('activa','acceso_total','todas_creadoras') and jsonb_typeof(x.value)<>'boolean') then
   raise exception 'Configuración inválida' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_each(_cambios) x where x.key in ('registra_horas','registra_comida','registra_bano') and jsonb_typeof(x.value) not in ('boolean','null')) then
   raise exception 'Configuración de jornada inválida' using errcode='22023';
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
   insert into public.posiciones_borrador(id,tenant_id,rol,nombre,descripcion,activa,acceso_total,todas_creadoras,checks,alcances,modalidad_id,pide_camara,pide_pantalla,registra_horas,registra_comida,registra_bano,orden)
     values(candidato.id,empresa,'pos_'||replace(candidato.id::text,'-',''),candidato.nombre,candidato.descripcion,candidato.activa,
       candidato.acceso_total,candidato.todas_creadoras,candidato.checks,candidato.alcances,candidato.modalidad_id,candidato.pide_camara,candidato.pide_pantalla,candidato.registra_horas,candidato.registra_comida,candidato.registra_bano,
       (select coalesce(max(orden),0)+1 from public.posiciones_borrador where tenant_id=empresa)) returning * into candidato;
 else
   update public.posiciones_borrador set nombre=candidato.nombre,descripcion=candidato.descripcion,activa=candidato.activa,
     checks=candidato.checks,alcances=candidato.alcances,acceso_total=candidato.acceso_total,todas_creadoras=candidato.todas_creadoras,
     modalidad_id=candidato.modalidad_id,registra_horas=candidato.registra_horas,registra_comida=candidato.registra_comida,registra_bano=candidato.registra_bano,updated_at=clock_timestamp() where id=_id returning * into candidato;
 end if;
 perform public.posiciones_sincronizar(false,false);
 perform public.posiciones_sincronizar(false,false);
 perform set_config('maven.posiciones_aplicando',coalesce(anterior,''),true);
 insert into public.posiciones_revisiones(posicion_id,actor,antes,despues) values(candidato.id,actor,
   case when nuevo then '{}'::jsonb else to_jsonb(previo) end,to_jsonb(candidato));
 return to_jsonb(candidato);
end $function$
;
create or replace function public.jornada_config_de(_uid uuid)
returns table(configurada boolean,registra_horas boolean,registra_comida boolean,registra_bano boolean)
language sql stable security definer set search_path=public,pg_temp as $$
 select x.h is not null or x.c is not null or x.b is not null,
   coalesce(x.h,not public.es_admin_o_dueno(_uid) and not coalesce((select h.exento from public.horario_de(_uid) h),false)) and x.habilitada,
   coalesce(x.c,(select q.comida_min>0 from public.argos_pausas_de(_uid) q),false) and x.habilitada,
   coalesce(x.b,(select q.bano_min>0 from public.argos_pausas_de(_uid) q),false) and x.habilitada
 from (select bool_and(p.registra_horas) h,bool_and(p.registra_comida) c,bool_and(p.registra_bano) b,
   exists(select 1 from public.profiles u where u.id=_uid and u.deleted_at is null)
   and not exists(select 1 from public.personas_borrador_marcas m where m.user_id=_uid and m.deshabilitada) habilitada
   from public.posiciones_borrador_personas a join public.posiciones_borrador p on p.id=a.posicion_id
   join public.tenant_members tm on tm.user_id=a.user_id and tm.tenant_id=p.tenant_id
   where a.user_id=_uid and p.activa) x;
$$;
revoke all on function public.jornada_config_de(uuid) from public,anon,authenticated;
grant execute on function public.jornada_config_de(uuid) to service_role;

create or replace function public.mi_jornada_config()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'sin sesión' using errcode='42501'; end if;
 return (select to_jsonb(c) from public.jornada_config_de(auth.uid()) c);
end $$;
revoke all on function public.mi_jornada_config() from public,anon;
grant execute on function public.mi_jornada_config() to authenticated;

-- Horarios asignados: nunca el propio; administradores y dueños, solo el dueño.
create or replace function public.puede_editar_horario(_target uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(auth.uid() is not null and _target is not null and auth.uid()<>_target
   and exists(select 1 from public.profiles p where p.id=_target and p.deleted_at is null)
   and exists(select 1 from public.tenant_members m where m.user_id=_target and m.tenant_id=public.current_tenant_id())
   and not exists(select 1 from public.personas_borrador_marcas m where m.user_id=auth.uid() and m.deshabilitada)
   and case when public.es_admin_o_dueno(_target) then public.es_dueno(auth.uid())
     else public.es_dueno(auth.uid())
       or public.posicion_persona_en_alcance(auth.uid(),_target,'N:horarios.gestionar')
       or (exists(select 1 from public.profiles p where p.id=auth.uid() and p.nivel='supervisor' and p.deleted_at is null)
         and _target in (select user_id from public.mi_equipo_supervisado())) end,false);
$$;

-- Los datos laborales no se pueden saltar desde el perfil personal / Data API.
create or replace function public.perfil_datos_laborales_protegidos()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if current_user in ('anon','authenticated') and
   (to_jsonb(new)-array['avatar_url','avatar_seed','ui_skin','ui_prefs','status_text','status_expires_at','status','status_color','phone_e164','whatsapp_push_name','whatsapp_verified_at','whatsapp_lid'])
    is distinct from
   (to_jsonb(old)-array['avatar_url','avatar_seed','ui_skin','ui_prefs','status_text','status_expires_at','status','status_color','phone_e164','whatsapp_push_name','whatsapp_verified_at','whatsapp_lid']) then
   raise exception 'Los datos laborales se administran desde los permisos de la empresa' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.perfil_datos_laborales_protegidos() from public,anon,authenticated;
create trigger perfil_datos_laborales_protegidos before update on public.profiles
 for each row execute function public.perfil_datos_laborales_protegidos();

-- Pausas de jornada independientes de estar conectado a una sala de Cowork.
create table public.turno_pausas (
 id uuid primary key default gen_random_uuid(),
 marca_id uuid not null references public.turno_marcas(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in ('almuerzo','bano')),
 inicio timestamptz not null default now(),fin timestamptz,
 check(fin is null or fin>=inicio)
);
create index turno_pausas_marca on public.turno_pausas(marca_id);
create unique index turno_pausas_una_abierta on public.turno_pausas(user_id) where fin is null;
alter table public.turno_pausas enable row level security;
revoke all on public.turno_pausas from public,anon,authenticated;
grant select on public.turno_pausas to authenticated;
create policy turno_pausas_ver on public.turno_pausas for select to authenticated
 using(user_id=(select auth.uid()) or (public.es_dueno((select auth.uid())) and exists(
 select 1 from public.tenant_members m where m.user_id=turno_pausas.user_id and m.tenant_id=public.current_tenant_id())));

create or replace function public.jornada_pausar(_kind text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); marca uuid; c record;
begin
 if actor is null then raise exception 'sin sesión' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('jornada:'||actor::text,0));
 select * into c from public.jornada_config_de(actor);
 if not c.configurada or not c.registra_horas or _kind is null or _kind not in ('almuerzo','bano')
   or (_kind='almuerzo' and not c.registra_comida) or (_kind='bano' and not c.registra_bano) then
   raise exception 'Esta pausa no está habilitada para tu posición' using errcode='42501';
 end if;
 select id into marca from public.turno_marcas where user_id=actor and fin is null for update;
 if marca is null then raise exception 'Primero marca entrada' using errcode='22023'; end if;
 if exists(select 1 from public.cowork_breaks where user_id=actor and ended_at is null)
   or exists(select 1 from public.turno_pausas where user_id=actor and fin is null) then return; end if;
 insert into public.turno_pausas(marca_id,user_id,kind) values(marca,actor,_kind);
end $$;
create or replace function public.jornada_retomar()
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'sin sesión' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('jornada:'||auth.uid()::text,0));
 update public.turno_pausas set fin=now() where user_id=auth.uid() and fin is null;
 update public.cowork_breaks set ended_at=now() where user_id=auth.uid() and ended_at is null;
end $$;
revoke all on function public.jornada_pausar(text),public.jornada_retomar() from public,anon;
grant execute on function public.jornada_pausar(text),public.jornada_retomar() to authenticated;

-- Solicitudes con original conservado; solo el dueño de esa empresa resuelve.
create table public.turno_correcciones (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id) on delete cascade,
 marca_id uuid not null references public.turno_marcas(id) on delete cascade,
 solicitante uuid not null references public.profiles(id) on delete cascade,
 antes_inicio timestamptz not null,antes_fin timestamptz not null,
 nuevo_inicio timestamptz not null,nuevo_fin timestamptz not null,
 motivo text not null check(length(btrim(motivo)) between 5 and 1000),
 estado text not null default 'pendiente' check(estado in ('pendiente','aprobada','rechazada')),
 creado_at timestamptz not null default now(),
 resuelto_por uuid references public.profiles(id) on delete set null,resuelto_at timestamptz,
 check(nuevo_fin>nuevo_inicio)
);
create unique index turno_correcciones_pendiente on public.turno_correcciones(marca_id) where estado='pendiente';
create index turno_correcciones_empresa on public.turno_correcciones(tenant_id,estado,creado_at);
create index turno_correcciones_persona on public.turno_correcciones(solicitante,creado_at);
create index turno_correcciones_resuelto_por on public.turno_correcciones(resuelto_por);
alter table public.turno_correcciones enable row level security;
revoke all on public.turno_correcciones from public,anon,authenticated;
grant select on public.turno_correcciones to authenticated;
create policy turno_correcciones_ver on public.turno_correcciones for select to authenticated
 using(tenant_id=public.current_tenant_id() and (solicitante=(select auth.uid()) or public.es_dueno((select auth.uid()))));

create or replace function public.jornada_solicitar_correccion(_marca uuid,_inicio timestamptz,_fin timestamptz,_motivo text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.turno_marcas%rowtype; nuevo uuid;
begin
 if auth.uid() is null then raise exception 'sin sesión' using errcode='42501'; end if;
 select * into m from public.turno_marcas where id=_marca and user_id=auth.uid() for update;
 if not found then raise exception 'Registro no disponible' using errcode='42501'; end if;
 if m.fin is null or _inicio is null or _fin is null or _fin<=_inicio or _fin>now() or _fin-_inicio>interval '48 hours'
   or length(btrim(coalesce(_motivo,''))) not between 5 and 1000 then
   raise exception 'Revisa el horario y explica la corrección de una jornada cerrada' using errcode='22023';
 end if;
 insert into public.turno_correcciones(tenant_id,marca_id,solicitante,antes_inicio,antes_fin,nuevo_inicio,nuevo_fin,motivo)
 values(public.current_tenant_id(),m.id,m.user_id,m.inicio,m.fin,_inicio,_fin,btrim(_motivo)) returning id into nuevo;
 return nuevo;
end $$;

create or replace function public.jornada_resolver_correccion(_id uuid,_aprobar boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.turno_correcciones%rowtype; m public.turno_marcas%rowtype;
begin
 if auth.uid() is null or not public.es_dueno(auth.uid()) then raise exception 'Solo el dueño puede resolver correcciones' using errcode='42501'; end if;
 select * into c from public.turno_correcciones where id=_id and tenant_id=public.current_tenant_id() for update;
 if not found then raise exception 'Solicitud no disponible' using errcode='42501'; end if;
 if c.estado<>'pendiente' or _aprobar is null then raise exception 'La solicitud ya fue resuelta' using errcode='40001'; end if;
 if _aprobar then
   select * into m from public.turno_marcas where id=c.marca_id for update;
   if m.inicio is distinct from c.antes_inicio or m.fin is distinct from c.antes_fin then
     raise exception 'El registro cambió. Rechaza esta solicitud y revisa una nueva' using errcode='40001'; end if;
   if exists(select 1 from public.turno_marcas t where t.user_id=m.user_id and t.id<>m.id
       and tstzrange(t.inicio,coalesce(t.fin,'infinity'::timestamptz),'[)') && tstzrange(c.nuevo_inicio,c.nuevo_fin,'[)'))
     or exists(select 1 from public.turno_pausas p where p.marca_id=m.id and (p.inicio<c.nuevo_inicio or coalesce(p.fin,now())>c.nuevo_fin)) then
     raise exception 'El horario se cruza con otra jornada o deja una pausa fuera' using errcode='22023'; end if;
   update public.turno_marcas set inicio=c.nuevo_inicio,fin=c.nuevo_fin where id=m.id;
 end if;
 update public.turno_correcciones set estado=case when _aprobar then 'aprobada' else 'rechazada' end,
   resuelto_por=auth.uid(),resuelto_at=now() where id=c.id;
end $$;
revoke all on function public.jornada_solicitar_correccion(uuid,timestamptz,timestamptz,text),public.jornada_resolver_correccion(uuid,boolean) from public,anon;
grant execute on function public.jornada_solicitar_correccion(uuid,timestamptz,timestamptz,text),public.jornada_resolver_correccion(uuid,boolean) to authenticated;

create or replace function public.jornada_registros()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); empresa uuid:=public.current_tenant_id(); dueno boolean:=public.es_dueno(actor);
begin
 if actor is null or empresa is null then raise exception 'sin sesión' using errcode='42501'; end if;
 return jsonb_build_object('dueno',dueno,'registros',coalesce((select jsonb_agg(r order by r.inicio desc) from (
   select m.id,m.user_id,p.full_name nombre,m.inicio,m.fin,
     coalesce((select sum(extract(epoch from coalesce(b.fin,now())-b.inicio)) from public.turno_pausas b where b.marca_id=m.id),0) pausa_seg
   from public.turno_marcas m join public.profiles p on p.id=m.user_id
   join public.tenant_members t on t.user_id=m.user_id and t.tenant_id=empresa
   where (m.user_id=actor or dueno) and m.inicio>now()-interval '31 days'
   order by m.inicio desc limit 200) r),'[]'::jsonb),
   'solicitudes',coalesce((select jsonb_agg(r order by r.creado_at desc) from (
     select c.*,p.full_name nombre from public.turno_correcciones c join public.profiles p on p.id=c.solicitante
     where c.tenant_id=empresa and (c.solicitante=actor or dueno)
       and (c.estado='pendiente' or c.creado_at>now()-interval '31 days') order by c.creado_at desc limit 200) r),'[]'::jsonb));
end $$;
revoke all on function public.jornada_registros() from public,anon;
grant execute on function public.jornada_registros() to authenticated;
CREATE OR REPLACE FUNCTION public.mi_turno()
 RETURNS TABLE(aplica boolean, obligatorio boolean, obligatorio_desde timestamp with time zone, abierta boolean, marca_inicio timestamp with time zone, sigue_hasta timestamp with time zone, turno_inicio timestamp with time zone, turno_fin timestamp with time zone, puede_desde timestamp with time zone, puede boolean, horario_confirmado boolean, terminos_ok boolean, en_pausa boolean, pausa_desde timestamp with time zone, pausa_kind text, pausa_usada_seg integer, cupo_seg integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_t record;
  v_m record;
  v_b record;
begin
  if v_uid is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  select x.inicio, x.fin into v_t from public.turno_que_toca(v_uid, now()) x;
  select m.inicio, m.sigue_hasta into v_m from public.turno_marcas m where m.user_id = v_uid and m.fin is null;
  select b.started_at,b.kind into v_b from (
    select p.inicio started_at,p.kind from public.turno_pausas p where p.user_id=v_uid and p.fin is null
    union all select b.started_at,b.kind from public.cowork_breaks b
      where b.user_id=v_uid and b.ended_at is null and b.started_at>now()-interval '12 hours'
  ) b order by b.started_at desc limit 1;

  aplica := (select c.registra_horas from public.jornada_config_de(v_uid) c) or v_m.inicio is not null;
  obligatorio := public.turno_obligatorio();
  obligatorio_desde := (select c.turno_obligatorio_desde from public.monitor_config c where c.id = 1);
  abierta := v_m.inicio is not null;
  marca_inicio := v_m.inicio;
  sigue_hasta := v_m.sigue_hasta;
  turno_inicio := v_t.inicio;
  turno_fin := v_t.fin;
  puede_desde := v_t.inicio - interval '15 minutes';
  puede := v_t.inicio is null or (now() >= v_t.inicio - interval '15 minutes' and now() < v_t.fin);
  horario_confirmado := exists (select 1 from public.horario_confirmado hc where hc.user_id = v_uid);
  terminos_ok := exists (select 1 from public.turno_terminos tt where tt.user_id = v_uid and tt.version >= public.turno_terminos_version());
  en_pausa := v_b.started_at is not null;
  pausa_desde := v_b.started_at;
  pausa_kind := v_b.kind;
  pausa_usada_seg := coalesce((
    select sum(extract(epoch from (coalesce(b.ended_at, now()) - greatest(b.started_at, v_t.inicio))))::int
      from public.cowork_breaks b
     where b.user_id = v_uid and v_t.inicio is not null
       and coalesce(b.ended_at, now()) > v_t.inicio and b.started_at < v_t.fin), 0);
  pausa_usada_seg := pausa_usada_seg + coalesce((select sum(extract(epoch from coalesce(p.fin,now())-p.inicio))::int
    from public.turno_pausas p join public.turno_marcas m on m.id=p.marca_id where m.user_id=v_uid and m.fin is null),0);
  cupo_seg := (select (case when c.registra_comida then coalesce(p.comida_min,0) else 0 end
    + case when c.registra_bano then coalesce(p.bano_min,0) else 0 end)*60
    from public.jornada_config_de(v_uid) c left join lateral public.argos_pausas_de(v_uid) p on true);
  return next;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.turno_entrar()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_t record;
begin
  if v_uid is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('jornada:'||v_uid::text,0));
  if not coalesce((select c.registra_horas from public.jornada_config_de(v_uid) c),false) then
    raise exception 'El registro de horas no está habilitado para tu posición' using errcode='42501';
  end if;
  if exists (select 1 from public.turno_marcas m where m.user_id = v_uid and m.fin is null) then return; end if;
  if not exists (select 1 from public.turno_terminos tt where tt.user_id = v_uid and tt.version >= public.turno_terminos_version()) then
    raise exception 'turno_entrar: primero acepta las reglas de monitoreo' using errcode = 'P0001';
  end if;
  select x.inicio, x.fin into v_t from public.turno_que_toca(v_uid, now()) x;
  if v_t.inicio is not null and now() < v_t.inicio - interval '15 minutes' then
    raise exception 'turno_entrar: todavía no es tu hora (desde las %)', to_char((v_t.inicio - interval '15 minutes') at time zone 'America/Bogota', 'HH12:MI AM')
      using errcode = 'P0001';
  end if;
  insert into public.turno_marcas (user_id, inicio) values (v_uid, now());
end;
$function$
;
CREATE OR REPLACE FUNCTION public.turno_salir(_cierre text DEFAULT 'manual'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('jornada:'||v_uid::text,0));
  update public.turno_pausas set fin=now() where user_id=v_uid and fin is null;
  update public.turno_marcas set fin = now(), cierre = case when _cierre in ('manual', 'olvido') then _cierre else 'manual' end
   where user_id = v_uid and fin is null;
  update public.cowork_breaks set ended_at = now()
   where user_id = v_uid and ended_at is null;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.argos_asignar_turno(_user uuid, _turno uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.puede_editar_horario(_user) then raise exception 'Sin permiso para cambiar el horario de esta persona' using errcode='42501'; end if;
  if not public.es_admin_o_dueno((select auth.uid())) then raise exception 'sin permiso para asignar turno'; end if;
  update public.profiles set turno_id = _turno where id = _user;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.argos_horario_persona(_user uuid, _entrada time without time zone, _salida time without time zone, _comida integer, _bano integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.puede_editar_horario(_user) then raise exception 'Sin permiso para cambiar el horario de esta persona' using errcode='42501'; end if;
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'sin permiso para cambiar horarios';
  end if;
  update public.profiles set
    hora_entrada = _entrada,
    hora_salida  = _salida,
    comida_min   = _comida,
    bano_min     = _bano
  where id = _user;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.argos_horario_rol(_role text, _entrada time without time zone, _salida time without time zone, _comida integer, _bano integer, _tolerancia integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.es_dueno(auth.uid()) then raise exception 'Solo el dueño cambia las plantillas de horario' using errcode='42501'; end if;
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'sin permiso para cambiar horarios';
  end if;
  update public.roles_config set
    hora_entrada   = _entrada,
    hora_salida    = _salida,
    comida_min     = greatest(0, coalesce(_comida, 30)),
    bano_min       = greatest(0, coalesce(_bano, 10)),
    tolerancia_min = greatest(0, coalesce(_tolerancia, 5))
  where name = _role and tenant_id = (select public.current_tenant_id());
end;
$function$
;
CREATE OR REPLACE FUNCTION public.argos_turno_rol_borrar(_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.es_dueno(auth.uid()) then raise exception 'Solo el dueño cambia las plantillas de horario' using errcode='42501'; end if;
  if not public.es_admin_o_dueno((select auth.uid())) then raise exception 'sin permiso para borrar turnos'; end if;
  delete from public.rol_turnos where id = _id and tenant_id = (select public.current_tenant_id());
end;
$function$
;
CREATE OR REPLACE FUNCTION public.argos_turno_rol_set(_role text, _nombre text, _entrada time without time zone, _salida time without time zone, _orden integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_tenant uuid;
begin
  if not public.es_dueno(auth.uid()) then raise exception 'Solo el dueño cambia las plantillas de horario' using errcode='42501'; end if;
  if not public.es_admin_o_dueno((select auth.uid())) then raise exception 'sin permiso para cambiar turnos'; end if;
  v_tenant := (select public.current_tenant_id());
  insert into public.rol_turnos (tenant_id, role, nombre, hora_entrada, hora_salida, orden)
  values (v_tenant, _role, _nombre, _entrada, _salida, coalesce(_orden,0))
  on conflict (tenant_id, role, nombre) do update
    set hora_entrada = excluded.hora_entrada,
        hora_salida  = excluded.hora_salida,
        orden        = excluded.orden
  returning id into v_id;
  return v_id;
end;
$function$
;

-- Los accesos antiguos de Cowork también respetan las pausas elegidas por posición.
create or replace function public.cowork_pausa_segun_posicion()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare c record;
begin
 select * into c from public.jornada_config_de(new.user_id);
 if c.configurada and ((new.kind='bano' and not c.registra_bano)
   or (new.kind='almuerzo' and not c.registra_comida) or new.kind='break') then
   raise exception 'Esta pausa no está habilitada para tu posición' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.cowork_pausa_segun_posicion() from public,anon,authenticated;
create trigger cowork_pausa_segun_posicion before insert on public.cowork_breaks
 for each row execute function public.cowork_pausa_segun_posicion();
