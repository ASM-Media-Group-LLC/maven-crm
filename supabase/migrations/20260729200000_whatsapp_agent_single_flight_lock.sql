-- Single-flight: lock por grupo para serializar corridas del whatsapp-agent.
-- Sin esto, mensajes casi simultáneos (o night_catchup + mención) disparaban
-- corridas concurrentes que no se veían entre sí → 2-4 respuestas duplicadas/
-- contradictorias. La 2da corrida espera a que libere y al arrancar ya ve la
-- respuesta de la 1ra en su ventana de contexto. TTL = failsafe anti-deadlock.
create table if not exists public.whatsapp_agent_locks (
  group_id    uuid primary key references public.whatsapp_groups(id) on delete cascade,
  holder      uuid not null,
  acquired_at timestamptz not null default now(),
  expires_at  timestamptz not null
);
alter table public.whatsapp_agent_locks enable row level security;
-- Sin policies a propósito: solo el edge fn (service_role, bypassa RLS) la usa;
-- RLS on + sin policy = deny para anon/authenticated.

-- Acquire atómico: toma el lock si está libre o expirado. Devuelve true si lo tomó.
create or replace function public.wa_agent_lock_acquire(p_group_id uuid, p_holder uuid, p_ttl_seconds int)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare ok boolean;
begin
  insert into public.whatsapp_agent_locks(group_id, holder, acquired_at, expires_at)
  values (p_group_id, p_holder, now(), now() + make_interval(secs => p_ttl_seconds))
  on conflict (group_id) do update
    set holder = excluded.holder, acquired_at = now(), expires_at = excluded.expires_at
    where public.whatsapp_agent_locks.expires_at < now()
  returning true into ok;
  return coalesce(ok, false);
end $$;

create or replace function public.wa_agent_lock_release(p_group_id uuid, p_holder uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.whatsapp_agent_locks where group_id = p_group_id and holder = p_holder;
end $$;

revoke execute on function public.wa_agent_lock_acquire(uuid, uuid, int) from public, anon;
revoke execute on function public.wa_agent_lock_release(uuid, uuid) from public, anon;
grant execute on function public.wa_agent_lock_acquire(uuid, uuid, int) to service_role;
grant execute on function public.wa_agent_lock_release(uuid, uuid) to service_role;
