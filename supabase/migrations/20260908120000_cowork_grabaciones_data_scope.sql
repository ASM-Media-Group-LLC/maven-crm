-- COWORK Y GRABACIONES RESPETAN "PERMISOS DE DATOS" (data_scope).
--
-- En Administración → Roles cada módulo tiene tres alcances: Todos los datos /
-- Propios y subordinados / Solo datos propios. Cowork y Grabaciones los
-- guardaban pero NO los miraban (auditoría 18/06: "data_scope decorativo"):
--   · Grabaciones: veías lo que grabaste + lo que te compartieron + admin.
--   · Cowork: solo las salas donde sos miembro; "todas" era un camino solo-admin
--     (RPC cowork_sesiones_activas_admin, PR #1471).
-- Un rol con "Todos los datos" (Operations Sales, Finanzas, HHRR…) veía lo
-- mismo que uno con "Solo propios". Reporte de Jhon, 08/09/2026.
--
-- Semántica (misma que Chatters/Teléfonos, has_<módulo>_global_scope):
--   · admin                                 → todo
--   · can_access + data_scope = 'all'       → todo
--   · can_access + data_scope = 'subordinates'
--       → lo de gente de NIVEL INFERIOR (roles_config.level vía actor_level):
--         Cowork = sesiones con al menos un miembro de nivel menor;
--         Grabaciones = grabaciones iniciadas por alguien de nivel menor.
--   · lo demás                              → lo propio (comportamiento previo)
--
-- ⚠️ A PROPÓSITO NO se ensancha la policy de la TABLA cowork_sessions: esa fila
-- trae `host_invite_code`, y quien la lea puede entrar como host sin que nadie
-- se lo dé. La visibilidad ampliada va SOLO por la RPC, que devuelve columnas
-- elegidas. El modo incógnito y "entrar como host sin código" siguen siendo
-- de admin (edge cowork-session), tal como pidió Jhon.

create or replace function public.has_cowork_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'admin')
      or exists (
        select 1
        from public.user_roles ur
        join public.roles_config rc on rc.name = ur.role
        join public.role_permissions rp on rp.role_id = rc.id
        where ur.user_id = _user_id
          and rp.module = 'Cowork' and rp.submodule is null
          and rp.can_access = true
          and coalesce(rp.data_scope, 'all') = 'all'
      );
$$;

create or replace function public.has_cowork_team_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id
      and rp.module = 'Cowork' and rp.submodule is null
      and rp.can_access = true
      and rp.data_scope = 'subordinates'
  );
$$;

create or replace function public.has_grabaciones_global_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'admin')
      or exists (
        select 1
        from public.user_roles ur
        join public.roles_config rc on rc.name = ur.role
        join public.role_permissions rp on rp.role_id = rc.id
        where ur.user_id = _user_id
          and rp.module = 'Grabaciones' and rp.submodule is null
          and rp.can_access = true
          and coalesce(rp.data_scope, 'all') = 'all'
      );
$$;

create or replace function public.has_grabaciones_team_scope(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id
      and rp.module = 'Grabaciones' and rp.submodule is null
      and rp.can_access = true
      and rp.data_scope = 'subordinates'
  );
$$;

grant execute on function public.has_cowork_global_scope(uuid),
                          public.has_cowork_team_scope(uuid),
                          public.has_grabaciones_global_scope(uuid),
                          public.has_grabaciones_team_scope(uuid)
  to authenticated, service_role;

-- La RPC del landing: era solo-admin; ahora responde al alcance. Mismo nombre y
-- misma forma de fila (la llaman el edge cowork-session y el front).
create or replace function public.cowork_sesiones_activas_admin()
returns table(id uuid, name text, description text, members integer, rooms integer,
              created_at timestamptz, host_name text, my_role text)
language sql stable security definer set search_path = public as $$
  select
    s.id, s.name, s.description,
    (select count(*)::integer from public.cowork_memberships m where m.session_id = s.id),
    (select count(*)::integer from public.cowork_rooms r where r.session_id = s.id),
    s.created_at,
    (select p.full_name from public.profiles p where p.id = s.created_by),
    (select m.role from public.cowork_memberships m
      where m.session_id = s.id and m.user_id = auth.uid() limit 1)
  from public.cowork_sessions s
  where s.status = 'active'
    and (
      public.has_cowork_global_scope(auth.uid())
      or (
        public.has_cowork_team_scope(auth.uid())
        and exists (
          select 1 from public.cowork_memberships m
          where m.session_id = s.id
            and public.actor_level(m.user_id) < public.actor_level(auth.uid())
        )
      )
    )
  order by s.created_at desc;
$$;

-- ⚠️ Las POLICIES corren como el usuario que consulta (no como el dueño de la
-- función), y actor_level() era SECURITY DEFINER pero sin EXECUTE para
-- authenticated: la policy de abajo tiraba "permission denied for function
-- actor_level" a TODO el mundo (se vio al probar como Operations Sales). Dentro
-- de la RPC no pasa porque la RPC es definer. Sin este grant no hay Grabaciones.
grant execute on function public.actor_level(uuid) to authenticated, service_role;

-- Grabaciones: la lista sale de la tabla con RLS (useRecordings), así que
-- alcanza con la policy. El edge `recordings` repite la regla en puedeVer()
-- para descargar/reproducir (service_role no pasa por RLS).
drop policy if exists meeting_recordings_select on public.meeting_recordings;
create policy meeting_recordings_select on public.meeting_recordings
  for select to authenticated
  using (
    deleted_at is null and (
      started_by = auth.uid()
      or exists (
        select 1 from public.meeting_recording_recipients r
        where r.recording_id = meeting_recordings.id and r.user_id = auth.uid()
      )
      or public.has_role(auth.uid(), 'admin'::text)
      or public.has_grabaciones_global_scope(auth.uid())
      or (
        public.has_grabaciones_team_scope(auth.uid())
        and public.actor_level(started_by) < public.actor_level(auth.uid())
      )
    )
  );
