-- El permiso y su alcance siempre proceden del mismo puesto activo.
create or replace function public.posicion_alcance(_uid uuid,_clave text)
returns text language sql stable security definer set search_path=public,pg_temp as $$
 select case when not public.posiciones_controlan(_uid) then null
   when not public.tiene_funcion(_uid,_clave) then 'none'
   when public.es_dueno(_uid) then 'all'
   else coalesce((select case max(case when p.acceso_total then 3 else case coalesce(p.alcances->>c.fila,'all') when 'all' then 3 when 'subordinates' then 2 else 1 end end)
     when 3 then 'all' when 2 then 'subordinates' when 1 then 'self' end
     from public.posiciones_borrador_personas a
     join public.posiciones_borrador p on p.id=a.posicion_id and p.activa
     join public.tenant_members m on m.user_id=a.user_id and m.tenant_id=p.tenant_id
     join public.posiciones_funciones_catalogo() c on c.clave=_clave
     where a.user_id=_uid and (p.acceso_total or p.checks->_clave='true'::jsonb)),'none') end;
$$;
revoke all on function public.posicion_alcance(uuid,text) from public,anon,authenticated;
grant execute on function public.posicion_alcance(uuid,text) to service_role;

create or replace function public.posicion_modulo_decision(_uid uuid,_module text,_submodule text default null)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare exacta boolean; resultado boolean;
begin
 exacta:=public.posicion_decision(_uid,_module||'|'||coalesce(_submodule,'*'));
 if exacta is not null or _submodule is not null or not public.posiciones_controlan(_uid) then return exacta; end if;
 select bool_or(public.tiene_funcion(_uid,c.clave)) into resultado
 from public.posiciones_funciones_catalogo() c where split_part(c.clave,'|',1)=_module;
 return resultado;
end $$;
revoke all on function public.posicion_modulo_decision(uuid,text,text) from public,anon,authenticated;
grant execute on function public.posicion_modulo_decision(uuid,text,text) to service_role;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _submodule text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_posicion boolean;
  v_role_id uuid;
  v_val boolean;
begin
  v_posicion := public.posicion_modulo_decision(_user_id,_module,_submodule);
  if v_posicion is not null then return v_posicion; end if;
  if public.is_in_role_group(_user_id, 'admin') then
    return true;
  end if;

  select rc.id into v_role_id
  from public.user_roles ur
  join public.roles_config rc on rc.name = ur.role and rc.tenant_id = ur.tenant_id and rc.is_active
  where ur.user_id = _user_id
  limit 1;

  if v_role_id is null then
    return false;
  end if;

  if _submodule is not null then
    select rp.can_access into v_val
    from public.role_permissions rp
    where rp.role_id = v_role_id and rp.module = _module and rp.submodule = _submodule
    limit 1;
    if v_val is not null then
      return v_val;
    end if;
  end if;

  select rp.can_access into v_val
  from public.role_permissions rp
  where rp.role_id = v_role_id and rp.module = _module and rp.submodule is null
  limit 1;
  if v_val is not null then
    return v_val;
  end if;

  select bool_or(rp.can_access) into v_val
  from public.role_permissions rp
  where rp.role_id = v_role_id and rp.module = _module;

  return coalesce(v_val, false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.puede_ver_modulo(_user_id uuid, _module text, _submodule text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_posicion boolean;
  v_role_id uuid;
begin
  v_posicion := public.posicion_modulo_decision(_user_id,_module,_submodule);
  if v_posicion is not null then return v_posicion; end if;
  if _module is null then
    return true;
  end if;
  if public.is_in_role_group(_user_id, 'admin') then
    return true;
  end if;
  select rc.id into v_role_id
  from public.user_roles ur
  join public.roles_config rc on rc.name = ur.role and rc.tenant_id = ur.tenant_id and rc.is_active
  where ur.user_id = _user_id
  limit 1;
  if _module in ('Dashboard', 'Messenger', 'Cowork', 'Meet', 'Correo', 'Grabaciones') then
    if v_role_id is null or not exists (
      select 1 from public.role_permissions rp where rp.role_id = v_role_id and rp.module = _module
    ) then
      return true;
    end if;
  end if;
  return public.has_permission(_user_id, _module, _submodule);
end;
$function$;

create or replace function public.has_chatter_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_user_id)
   then public.posicion_alcance(_user_id,'Chatters|Evaluator')='all'
   else (SELECT
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles_config rc ON rc.name = ur.role and rc.tenant_id = ur.tenant_id
      JOIN public.role_permissions rp ON rp.role_id = rc.id
      WHERE ur.user_id = _user_id
        AND rp.module = 'Chatters'
        AND (rp.submodule = 'Evaluator' OR rp.submodule IS NULL)
        AND rp.can_access = true
        AND COALESCE(rp.data_scope, 'all') = 'all'
    )) end;
$$;

create or replace function public.has_closer_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_user_id)
   then public.posicion_alcance(_user_id,'Closers|Dashboard')='all'
   else (select public.is_in_role_group(_user_id,'admin') or exists (
    select 1 from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role and rc.tenant_id = ur.tenant_id
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id and rp.module = 'Closers' and rp.submodule is null
      and rp.can_access and coalesce(rp.data_scope,'all') <> 'self')) end;
$$;

create or replace function public.has_contactos_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_user_id)
   then public.posicion_alcance(_user_id,'Contactos|Contactos')='all'
   else (select public.is_in_role_group(_user_id,'admin') or exists (
    select 1 from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role and rc.tenant_id = ur.tenant_id
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id and rp.module = 'Contactos' and rp.submodule is null
      and rp.can_access and coalesce(rp.data_scope,'all') <> 'self')) end;
$$;

create or replace function public.has_cowork_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_user_id)
   then public.posicion_alcance(_user_id,'Cowork|*')='all'
   else (select exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'admin')
      or exists (
        select 1
        from public.user_roles ur
        join public.roles_config rc on rc.name = ur.role and rc.tenant_id = ur.tenant_id
        join public.role_permissions rp on rp.role_id = rc.id
        where ur.user_id = _user_id
          and rp.module = 'Cowork' and rp.submodule is null
          and rp.can_access = true
          and coalesce(rp.data_scope, 'all') = 'all'
      )) end;
$$;

create or replace function public.has_cowork_team_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_user_id)
   then public.posicion_alcance(_user_id,'Cowork|*')='subordinates'
   else (select exists (
    select 1
    from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role and rc.tenant_id = ur.tenant_id
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id
      and rp.module = 'Cowork' and rp.submodule is null
      and rp.can_access = true
      and rp.data_scope = 'subordinates'
  )) end;
$$;

create or replace function public.has_creators_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_user_id)
   then public.posicion_alcance(_user_id,'Creadores|Lista')='all'
   else (-- 20261005140000: admin de su agencia, o un rol (de su agencia y activo) con
  -- permiso de Creadores y alcance que no sea 'self'. Sin rol o sin agencia: false.
  SELECT public.is_in_role_group(_user_id,'admin')
    OR ( EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles_config rc ON rc.name=ur.role and rc.tenant_id = ur.tenant_id and rc.is_active
                 JOIN public.role_permissions rp ON rp.role_id=rc.id
                 WHERE ur.user_id=_user_id AND rp.module='Creadores' AND rp.submodule IS NULL
                   AND rp.can_access AND rp.data_scope IS DISTINCT FROM 'self')
         AND NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles_config rc ON rc.name=ur.role and rc.tenant_id = ur.tenant_id
                         JOIN public.role_permissions rp ON rp.role_id=rc.id
                         WHERE ur.user_id=_user_id AND rp.module='Creadores' AND rp.submodule IS NULL AND rp.data_scope='self') )) end;
$$;

create or replace function public.has_grabaciones_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_user_id)
   then public.posicion_alcance(_user_id,'Grabaciones|*')='all'
   else (select exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'admin')
      or exists (
        select 1
        from public.user_roles ur
        join public.roles_config rc on rc.name = ur.role and rc.tenant_id = ur.tenant_id
        join public.role_permissions rp on rp.role_id = rc.id
        where ur.user_id = _user_id
          and rp.module = 'Grabaciones' and rp.submodule is null
          and rp.can_access = true
          and coalesce(rp.data_scope, 'all') = 'all'
      )) end;
$$;

create or replace function public.has_grabaciones_team_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_user_id)
   then public.posicion_alcance(_user_id,'Grabaciones|*')='subordinates'
   else (select exists (
    select 1
    from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role and rc.tenant_id = ur.tenant_id
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id
      and rp.module = 'Grabaciones' and rp.submodule is null
      and rp.can_access = true
      and rp.data_scope = 'subordinates'
  )) end;
$$;

create or replace function public.has_leadgen_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_user_id)
   then public.posicion_alcance(_user_id,'LeadGen|Lista')='all'
   else (select public.is_in_role_group(_user_id,'admin') or exists (
    select 1 from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role and rc.tenant_id = ur.tenant_id
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id and rp.module = 'LeadGen' and rp.submodule is null
      and rp.can_access and coalesce(rp.data_scope,'all') <> 'self')) end;
$$;

create or replace function public.has_promolog_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_user_id)
   then public.posicion_alcance(_user_id,'Promolog|Promos')='all'
   else (select public.is_in_role_group(_user_id, 'admin') or exists (
    select 1
    from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role and rc.tenant_id = ur.tenant_id
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id
      and rp.module = 'Promolog'
      and rp.submodule is null
      and rp.can_access
      and coalesce(rp.data_scope, 'all') <> 'self'
  )) end;
$$;

create or replace function public.has_qa_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_user_id)
   then public.posicion_alcance(_user_id,'Agency QA|Calls')='all'
   else (select public.is_in_role_group(_user_id,'admin') or exists (
    select 1 from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role and rc.tenant_id = ur.tenant_id
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id and rp.module = 'Agency QA' and rp.submodule is null
      and rp.can_access and coalesce(rp.data_scope,'all') <> 'self')) end;
$$;

create or replace function public.has_scouter_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_user_id)
   then public.posicion_alcance(_user_id,'Scouter Assist|Mis Tareas')='all'
   else (select exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'admin')
      or exists (
        select 1
        from public.user_roles ur
        join public.roles_config rc on rc.name = ur.role and rc.tenant_id = ur.tenant_id
        join public.role_permissions rp on rp.role_id = rc.id
        where ur.user_id = _user_id
          and rp.module = 'Scouter Assist' and rp.submodule is null
          and rp.can_access = true
          and coalesce(rp.data_scope, 'all') = 'all'
      )) end;
$$;

create or replace function public.has_scouter_team_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_user_id)
   then public.posicion_alcance(_user_id,'Scouter Assist|Mis Tareas')='subordinates'
   else (select exists (
    select 1
    from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role and rc.tenant_id = ur.tenant_id
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id
      and rp.module = 'Scouter Assist' and rp.submodule is null
      and rp.can_access = true
      and rp.data_scope = 'subordinates'
  )) end;
$$;

create or replace function public.has_telefonos_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_user_id)
   then public.posicion_alcance(_user_id,'Telefonos|Dispositivos')='all'
   else (SELECT
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id AND ur.role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles_config rc ON rc.name = ur.role and rc.tenant_id = ur.tenant_id
      JOIN public.role_permissions rp ON rp.role_id = rc.id
      WHERE ur.user_id = _user_id
        AND rp.module = 'Telefonos'
        AND (rp.submodule = 'Dispositivos' OR rp.submodule IS NULL)
        AND rp.can_access = true
        AND COALESCE(rp.data_scope, 'all') = 'all'
    )) end;
$$;

create or replace function public.has_tg_inbox_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_user_id)
   then public.posicion_alcance(_user_id,'Telegram|Bandeja')='all'
   else (SELECT
    public.is_in_role_group(_user_id, 'admin')
    OR (
      public.is_in_role_group(_user_id, 'supervisor_or_above')
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles_config rc ON rc.name = ur.role and rc.tenant_id = ur.tenant_id
        JOIN public.role_permissions rp ON rp.role_id = rc.id
        WHERE ur.user_id = _user_id
          AND rp.module = 'Telegram'
          AND rp.submodule IS NULL
          AND rp.data_scope = 'self'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles_config rc ON rc.name = ur.role and rc.tenant_id = ur.tenant_id
        JOIN public.role_permissions rp ON rp.role_id = rc.id
        WHERE ur.user_id = _user_id
          AND rp.module = 'Telegram'
          AND rp.submodule IS NULL
          AND rp.can_access = false
      )
    )) end;
$$;

create or replace function public.has_wa_inbox_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_user_id)
   then public.posicion_alcance(_user_id,'WhatsApp|Bandeja')='all'
   else (SELECT
    public.is_in_role_group(_user_id, 'admin')
    OR (
      public.is_in_role_group(_user_id, 'supervisor_or_above')
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles_config rc ON rc.name = ur.role and rc.tenant_id = ur.tenant_id
        JOIN public.role_permissions rp ON rp.role_id = rc.id
        WHERE ur.user_id = _user_id
          AND rp.module = 'WhatsApp'
          AND rp.submodule IS NULL
          AND rp.data_scope = 'self'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles_config rc ON rc.name = ur.role and rc.tenant_id = ur.tenant_id
        JOIN public.role_permissions rp ON rp.role_id = rc.id
        WHERE ur.user_id = _user_id
          AND rp.module = 'WhatsApp'
          AND rp.submodule IS NULL
          AND rp.can_access = false
      )
    )) end;
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
    'alcances',coalesce((select jsonb_object_agg(c.clave,public.posicion_alcance(e.id,c.clave)) from public.posiciones_funciones_catalogo() c),'{}'::jsonb),
    'checks',case when e.bloqueada then '{}'::jsonb else coalesce((select jsonb_object_agg(c.key,c.permitida and not(c.key=any(e.denegadas))) from checks c),'{}'::jsonb) end
  ) from estado e;
$$;
