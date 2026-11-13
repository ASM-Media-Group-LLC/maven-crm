-- ANDREA (RR. HH.) VE TODOS LOS COWORKS, COMO LOS ADMINS (Alvaro, 13/11/2026).
-- «Con la nueva actualización no le permite ingresar al cowork de Chatters. Esta es la
--  de HR: ella debería, como los admins, ver todo.» La regla de anfitriones designados
-- (20261113220000) la bajaba a participante al entrar, y la de «un solo Cowork»
-- (20261113230000) la rechazaba. Ahora hay anfitriones en TODAS las sesiones, además de
-- admins y dueño: hoy, Andrea. Ella sigue trabajando como participante en RR. HH.

create table if not exists public.cowork_anfitriones_en_todas (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.cowork_anfitriones_en_todas enable row level security;
insert into public.cowork_anfitriones_en_todas (user_id) values
  ('246e7c28-aa30-4fc8-86f5-eff1f4a18984')   -- Andrea Palacio (RR. HH.)
on conflict do nothing;

create or replace function public.puede_ser_anfitrion(_session uuid, _uid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.es_admin_o_dueno(_uid)
      or exists (select 1 from public.cowork_anfitriones_en_todas t where t.user_id = _uid)
      or exists (select 1 from public.cowork_anfitriones a where a.session_id = _session and a.user_id = _uid);
$$;

-- Ya anfitriona de todas las sesiones activas (menos RR. HH., donde trabaja).
insert into public.cowork_memberships (session_id, user_id, role)
select s.id, t.user_id, 'host'
  from public.cowork_sessions s
  cross join public.cowork_anfitriones_en_todas t
 where s.status = 'active'
   and not exists (select 1 from public.cowork_memberships cm where cm.session_id = s.id and cm.user_id = t.user_id);
