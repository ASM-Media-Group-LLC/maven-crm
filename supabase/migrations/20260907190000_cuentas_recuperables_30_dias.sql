-- Cuentas recuperables 30 días, como Google Workspace.
--
-- Hasta hoy, borrar una cuenta en Maven DESTRUÍA: app_purge_user_refs recorre
-- todas las FKs a auth.users en public y, según la columna, borra la fila o
-- pone la referencia en NULL. Eso se lleva los roles, el correo, las horas de
-- Cowork, los espacios de chat que la persona hubiera creado (esos son NOT
-- NULL: desaparecen para todos) y deja sin autor ~50 columnas created_by /
-- assigned_to por todo el CRM. No había nada que recuperar.
--
-- A partir de acá, "eliminar" = suspender: se le cierran las sesiones y se le
-- bloquea la entrada, pero no se toca un solo dato. A los 30 días un cron
-- ejecuta la purga de verdad (la que ya existía).

-- 1. Estado de la baja, en el perfil.
alter table public.profiles
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

comment on column public.profiles.deleted_at is
  'Cuenta suspendida (papelera de 30 días). NULL = activa. La purga real la hace el cron.';

-- Parcial: solo interesa la papelera, que siempre es un puñado de filas.
create index if not exists profiles_deleted_at_idx
  on public.profiles (deleted_at) where deleted_at is not null;

-- 2. Bitácora de bajas. A propósito SIN FK a auth.users ni a profiles: tiene que
-- seguir legible DESPUÉS de la purga, que es justo cuando uno pregunta "¿quién
-- borró a esta persona?". Por lo mismo guarda el nombre y el correo como copia:
-- si la fila del perfil ya no existe, el registro igual se lee solo.
create table if not exists public.cuenta_eventos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_email text,
  user_full_name text,
  accion text not null check (accion in ('eliminada', 'restaurada', 'purgada')),
  actor_id uuid,
  actor_email text,
  detalle jsonb,
  at timestamptz not null default now()
);

create index if not exists cuenta_eventos_user_idx on public.cuenta_eventos (user_id, at desc);
create index if not exists cuenta_eventos_at_idx on public.cuenta_eventos (at desc);

alter table public.cuenta_eventos enable row level security;

-- Solo lectura, y solo para quien puede gestionar usuarios. Escribe la edge con
-- service_role, que se salta RLS: nadie puede fabricar ni borrar un registro
-- desde el navegador.
drop policy if exists "Gestores de usuarios leen la bitácora" on public.cuenta_eventos;
create policy "Gestores de usuarios leen la bitácora"
  on public.cuenta_eventos for select
  to authenticated
  using (public.can_manage_users((select auth.uid())));

-- 3. Cerrarle la sesión ya mismo. Banear en GoTrue frena el REFRESH del token,
-- pero el access token que ya tenga en el navegador le sirve hasta que vence
-- (una hora por defecto): sin esto, la persona sigue trabajando un rato después
-- de que la dieron de baja. Hay que borrar las sesiones a mano, y eso vive en
-- el esquema auth, al que la edge no llega por la API — de ahí el SECURITY
-- DEFINER. Ojo: auth.refresh_tokens.user_id es TEXT, no uuid.
create or replace function public.app_revoke_user_sessions(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.sessions where user_id = p_user_id;
end;
$$;

revoke all on function public.app_revoke_user_sessions(uuid) from public;
revoke all on function public.app_revoke_user_sessions(uuid) from authenticated;
revoke all on function public.app_revoke_user_sessions(uuid) from anon;
grant execute on function public.app_revoke_user_sessions(uuid) to service_role;
