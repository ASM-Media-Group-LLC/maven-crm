-- EXAMINADORES DEL CHATTER EVALUATOR, A MANO (Grace, 05/11/2026: «no deja
-- agregar ni quitar personal ahí»). La lista de «Asignar a» salía sola de los
-- roles con permiso Chatters → Evaluator más todos los admins, sin forma de
-- sumar a alguien suelto ni de sacar a quien no evalúa, y mostraba cuentas en
-- la papelera. Ahora la pestaña Admin guarda por persona:
--   permitido = true  → examina aunque su rol no tenga el permiso
--   permitido = false → no aparece ni se le pueden asignar sesiones (a quien no
--                       es admin también se le quita el acceso al evaluador)
-- Sin fila, manda el rol como antes.

create table if not exists public.chatter_examinadores (
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  permitido boolean not null,
  cambiado_por uuid default auth.uid(),
  cambiado_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

alter table public.chatter_examinadores enable row level security;

create or replace function public.has_chatter_evaluator_access(_user_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select
    -- Admin bypass: mismo comportamiento que el frontend (admin ve todo)
    exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'admin')
    or (
      (
        -- Permiso explícito Chatters → Evaluator o acceso al módulo entero
        exists (
          select 1
          from public.user_roles ur
          join public.roles_config rc on rc.name = ur.role and rc.tenant_id = ur.tenant_id
          join public.role_permissions rp on rp.role_id = rc.id
          where ur.user_id = _user_id
            and rp.module = 'Chatters'
            and (rp.submodule = 'Evaluator' or rp.submodule is null)
            and rp.can_access = true
        )
        -- o lo agregaron a mano como examinador
        or exists (select 1 from public.chatter_examinadores x where x.user_id = _user_id and x.permitido)
      )
      -- y no lo sacaron a mano
      and not exists (select 1 from public.chatter_examinadores x where x.user_id = _user_id and not x.permitido)
    );
$$;

-- Si se le pueden asignar sesiones: un admin que se sacó de la lista sigue
-- entrando al evaluador (admin ve todo), pero ya no recibe sesiones.
create or replace function public.puede_ser_examinador(_user_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.has_chatter_evaluator_access(_user_id)
    and not exists (select 1 from public.chatter_examinadores x where x.user_id = _user_id and not x.permitido)
    and exists (select 1 from public.profiles p where p.id = _user_id and p.deleted_at is null);
$$;

create or replace function public.list_chatter_evaluators()
returns table(user_id uuid, full_name text, avatar_url text)
language sql stable security definer
set search_path to 'public'
as $$
  with evaluator_role_names as (
    select distinct rc.tenant_id, rc.name
    from public.role_permissions rp
    join public.roles_config rc on rc.id = rp.role_id
    where rp.module = 'Chatters'
      and (rp.submodule = 'Evaluator' or rp.submodule is null)
      and rp.can_access = true
    union
    select t.id, 'admin' from public.tenants t
  ),
  evaluator_user_ids as (
    select distinct ur.user_id
    from public.user_roles ur
    where (ur.tenant_id, ur.role) in (select tenant_id, name from evaluator_role_names)
    union
    select x.user_id from public.chatter_examinadores x where x.permitido
  )
  select p.id as user_id, coalesce(p.full_name, 'Sin nombre') as full_name, p.avatar_url
  from public.profiles p
  where p.id in (select user_id from evaluator_user_ids)
    -- Las cuentas en la papelera no evalúan (aparecían Brenda, Tatiana, Yoselin).
    and p.deleted_at is null
    and not exists (select 1 from public.chatter_examinadores x where x.user_id = p.id and not x.permitido)
  order by coalesce(p.full_name, 'zzz') collate "es-x-icu";
$$;

create policy chatter_examinadores_read on public.chatter_examinadores
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_chatter_evaluator_access((select auth.uid())));

create policy chatter_examinadores_write on public.chatter_examinadores
  for all to authenticated
  using (public.has_chatter_global_scope((select auth.uid())))
  with check (public.has_chatter_global_scope((select auth.uid())));

-- Asignar una sesión: a alguien que todavía puede examinar.
alter policy chatter_sessions_insert on public.chatter_sessions
  with check (public.has_chatter_evaluator_access((select auth.uid())) and public.puede_ser_examinador(examiner_user_id));

grant select, insert, update, delete on public.chatter_examinadores to authenticated;
