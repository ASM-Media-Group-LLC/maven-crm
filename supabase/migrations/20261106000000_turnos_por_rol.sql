-- Turnos por rol (Alvaro, 06/11): un rol puede tener VARIOS turnos (ej. Chatters
-- AM / PM / Madrugada). Cada persona tiene UN turno asignado. El horario de la
-- persona se resuelve por su turno; si no tiene turno asignado, cae al default
-- del rol (roles_config.hora_entrada/salida). El comida/baño/tolerancia del rol
-- aplica a todos sus turnos (no cambia por turno).

create table if not exists public.rol_turnos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  role text not null,              -- roles_config.name
  nombre text not null,            -- "AM", "PM", "Madrugada"
  hora_entrada time not null,
  hora_salida  time not null,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, role, nombre)
);
create index if not exists rol_turnos_role_idx on public.rol_turnos (tenant_id, role, orden);

alter table public.rol_turnos enable row level security;

drop policy if exists "ver turnos" on public.rol_turnos;
create policy "ver turnos" on public.rol_turnos for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));
-- Escribir: solo las RPCs (dueño + admin).
revoke insert, update, delete on public.rol_turnos from authenticated, anon;

-- Turno asignado a cada persona (null = usa el default del rol).
alter table public.profiles add column if not exists turno_id uuid references public.rol_turnos(id) on delete set null;

-- RPC: alta/baja/modificación de turnos de un rol (dueño + admins).
create or replace function public.argos_turno_rol_set(
  _role text, _nombre text, _entrada time, _salida time, _orden int default 0
) returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_id uuid;
begin
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'sin permiso para cambiar turnos';
  end if;
  insert into public.rol_turnos (tenant_id, role, nombre, hora_entrada, hora_salida, orden)
  values ((select public.current_tenant_id()), _role, _nombre, _entrada, _salida, coalesce(_orden,0))
  on conflict (tenant_id, role, nombre) do update
    set hora_entrada = excluded.hora_entrada,
        hora_salida  = excluded.hora_salida,
        orden        = excluded.orden
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.argos_turno_rol_borrar(_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'sin permiso para borrar turnos';
  end if;
  delete from public.rol_turnos where id = _id and tenant_id = (select public.current_tenant_id());
end;
$$;

-- RPC: asignar turno a una persona (dueño + admins). null = quitar asignación.
create or replace function public.argos_asignar_turno(_user uuid, _turno uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'sin permiso para asignar turno';
  end if;
  update public.profiles set turno_id = _turno where id = _user;
end;
$$;

revoke all on function public.argos_turno_rol_set(text, text, time, time, int) from public, anon;
revoke all on function public.argos_turno_rol_borrar(uuid) from public, anon;
revoke all on function public.argos_asignar_turno(uuid, uuid) from public, anon;
grant execute on function public.argos_turno_rol_set(text, text, time, time, int) to authenticated;
grant execute on function public.argos_turno_rol_borrar(uuid) to authenticated;
grant execute on function public.argos_asignar_turno(uuid, uuid) to authenticated;

-- Preset: los 3 turnos clásicos de Chatters (AM/PM/Madrugada) si no existen.
do $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.roles_config where name = 'Chatter' limit 1;
  if v_tenant is null then return; end if;
  insert into public.rol_turnos (tenant_id, role, nombre, hora_entrada, hora_salida, orden) values
    (v_tenant, 'Chatter', 'AM',        '08:00', '16:00', 1),
    (v_tenant, 'Chatter', 'PM',        '16:00', '00:00', 2),
    (v_tenant, 'Chatter', 'Madrugada', '00:00', '08:00', 3)
  on conflict (tenant_id, role, nombre) do nothing;
end $$;