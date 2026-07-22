-- has_role() TIER-AWARE — fix de RAÍZ para la clase de bug "rol custom rechazado
-- por RLS" (5 incidentes: #535 Team Leader, #607 blu_is_management, #892 permisos
-- Closer Supervisor, #901 lista de closers, #937 convertir a creadora).
--
-- CAUSA: has_role() comparaba texto LITERAL (role = 'supervisor') → los roles
-- custom ("Closer Supervisor", "Team Leader", "Chatter Supervisor"...) daban
-- false en las 51 policies RLS (28 tablas) escritas sobre has_role, aunque su
-- TIER en role_groups (el que se elige en la UI de Roles) dice que son
-- supervisores. Hoy ~30 usuarios están en roles custom vs ~17 en roles base.
--
-- FIX: has_role() ahora resuelve por TIER además del match literal:
--   'admin'      → is_in_role_group(uid,'admin')
--   'manager'    → is_in_role_group(uid,'manager_or_above')
--   'supervisor' → is_in_role_group(uid,'supervisor_or_above')
--   otros roles funcionales ('closer', 'agent'...) → tabla role_base_grants
--     (rol_custom → rol_base que hereda; seed: Closer Supervisor ⊇ closer,
--      mismo criterio que ROLE_SYNONYMS del bot y la paridad #892).
--
-- Con esto las 51 policies existentes (y cualquier policy futura que use
-- has_role) reconocen los roles custom SIN editar cada policy, y un rol nuevo
-- creado en la UI queda cubierto por su tier automáticamente.
--
-- BLAST RADIUS AUDITADO (2026-07-22, net-CERO permisos nuevos hoy):
--   · is_admin=true → solo rol 'admin' → expansión 'admin' = no-op.
--   · is_manager_or_above → solo admin+manager → expansión 'manager' solo suma
--     admins (ya tienen acceso total por policies propias).
--   · Única policy que menciona 'supervisor' o 'closer' = creators INSERT,
--     ya ampliada por #937 → no-op.
--   · 2 funciones con NOT has_role (wa_clear/delete_conversation) son guardas
--     'solo admin' → sin cambio.
--   · Rol base 'closer' tiene 0 usuarios (todos los closers reales son custom).

-- ── 1. Tabla de herencia funcional (rol custom → rol base) ──────────────────
create table if not exists public.role_base_grants (
  role_name  text not null,
  base_role  text not null,
  note       text,
  created_at timestamptz not null default now(),
  primary key (role_name, base_role)
);

alter table public.role_base_grants enable row level security;

drop policy if exists "Admins manage role_base_grants" on public.role_base_grants;
create policy "Admins manage role_base_grants" on public.role_base_grants
  for all to authenticated
  using (public.is_in_role_group(auth.uid(), 'admin'))
  with check (public.is_in_role_group(auth.uid(), 'admin'));

drop policy if exists "Authenticated can read role_base_grants" on public.role_base_grants;
create policy "Authenticated can read role_base_grants" on public.role_base_grants
  for select to authenticated using (true);

insert into public.role_base_grants (role_name, base_role, note) values
  ('Closer Supervisor', 'closer', 'Closer Supervisor opera como closer (paridad PR #892 / ROLE_SYNONYMS del bot)')
on conflict do nothing;

-- ── 2. has_role tier-aware (ambos overloads) ────────────────────────────────
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role::text
  )
  or case _role::text
    when 'admin'      then public.is_in_role_group(_user_id, 'admin')
    when 'manager'    then public.is_in_role_group(_user_id, 'manager_or_above')
    when 'supervisor' then public.is_in_role_group(_user_id, 'supervisor_or_above')
    else exists (
      select 1
      from public.user_roles ur
      join public.role_base_grants g on g.role_name = ur.role
      where ur.user_id = _user_id and g.base_role = _role::text
    )
  end
$$;

create or replace function public.has_role(_user_id uuid, _role text)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
  or case _role
    when 'admin'      then public.is_in_role_group(_user_id, 'admin')
    when 'manager'    then public.is_in_role_group(_user_id, 'manager_or_above')
    when 'supervisor' then public.is_in_role_group(_user_id, 'supervisor_or_above')
    else exists (
      select 1
      from public.user_roles ur
      join public.role_base_grants g on g.role_name = ur.role
      where ur.user_id = _user_id and g.base_role = _role
    )
  end
$$;
