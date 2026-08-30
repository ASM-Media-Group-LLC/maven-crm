-- Mapa rol de Maven → grupo de correo (lista de distribución) en Zoho.
-- El motor de sync (edge role-email-groups) mantiene los miembros al día contra
-- user_roles. RLS bloqueada: solo se toca por edges con service_role.
create table if not exists public.email_role_groups (
  role             text primary key,              -- rol de user_roles (o '__all__' = todos)
  group_email      text not null unique,          -- ej. chatters@maven-ai.me
  group_name       text not null,
  zgid             text,                           -- id del grupo en Zoho; null hasta provisionar
  enabled          boolean not null default true,
  access_type      text not null default 'Public', -- accessType Zoho (Public = acepta externos, ej. RH)
  last_synced_at   timestamptz,
  last_sync_result jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.email_role_groups enable row level security;
revoke all on public.email_role_groups from anon, authenticated;

-- Miembros esperados por rol = usuarios con ese rol y correo de dominio propio
-- (@maven-ai.me o @unlok.me — excluye cuentas de test tipo gmail). Usa el email
-- REAL de login (mezcla de dominios durante la migración; se auto-cura al migrar).
create or replace function public.role_group_members()
returns table (role text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select ur.role, lower(u.email)
  from public.user_roles ur
  join auth.users u on u.id = ur.user_id
  where lower(u.email) like '%@maven-ai.me' or lower(u.email) like '%@unlok.me'
$$;
revoke all on function public.role_group_members() from anon, authenticated;

-- Seed de los grupos por rol (uno por rol; '__all__' = equipo entero). Idempotente.
insert into public.email_role_groups (role, group_email, group_name) values
  ('Chatter',                'chatters@maven-ai.me',                 'Chatters'),
  ('Chatter Supervisor',     'chatters-supervisores@maven-ai.me',    'Supervisores Chatters'),
  ('Closer +',               'closers@maven-ai.me',                  'Closers'),
  ('manager',                'managers@maven-ai.me',                 'Managers'),
  ('Coordinador',            'coordinadores@maven-ai.me',            'Coordinadores'),
  ('Coordinador Supervisor', 'coordinadores-supervisores@maven-ai.me','Coordinadores Supervisores'),
  ('Warming',                'warming@maven-ai.me',                  'Warming'),
  ('Team Leader',            'team-leaders@maven-ai.me',             'Team Leaders'),
  ('employee',               'empleados@maven-ai.me',                'Empleados'),
  ('HHRR',                   'rrhh@maven-ai.me',                     'Recursos Humanos'),
  ('admin',                  'admins@maven-ai.me',                   'Admins'),
  ('__all__',                'equipo@maven-ai.me',                   'Equipo')
on conflict (role) do nothing;
