-- COWORK: "subordinados" = sesiones CREADAS por alguien de nivel inferior, y
-- quien tiene alcance sobre una sesión puede ENTRAR, no solo mirarla.
--
-- Ajuste sobre 20260908120000 tras probarlo Jhon como Operations Sales (08/09):
--   1. La regla de subordinados estaba por "algún MIEMBRO de nivel inferior";
--      Jhon la definió por quién CREÓ la sala. Queda por created_by, igual que
--      Grabaciones va por started_by.
--   2. Con "Todos los datos" veía las 7 sesiones pero todas en "Solo lectura":
--      el edge cowork-session solo dejaba entrar como host sin código a admin.
--      Ahora también entra quien tenga alcance sobre ESA sesión (esta función).
--      El modo incógnito sigue siendo solo admin.
--
-- ⚠️ Operations Sales tiene nivel 10, el más bajo de la jerarquía: con
-- "subordinados" no ve a nadie hasta que se le suba el nivel en roles_config.
-- Eso es una decisión de Jhon, no de esta migración.

create or replace function public.cowork_puede_supervisar(_user_id uuid, _session_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_cowork_global_scope(_user_id)
      or (
        public.has_cowork_team_scope(_user_id)
        and exists (
          select 1 from public.cowork_sessions s
          where s.id = _session_id
            and public.actor_level(s.created_by) < public.actor_level(_user_id)
        )
      );
$$;
grant execute on function public.cowork_puede_supervisar(uuid, uuid) to authenticated, service_role;

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
        and public.actor_level(s.created_by) < public.actor_level(auth.uid())
      )
    )
  order by s.created_at desc;
$$;
