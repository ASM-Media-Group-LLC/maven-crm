-- Horarios por rol/departamento + cupo de baño/comida (Alvaro, 05/11).
-- Para no ir uno por uno: cada rol tiene su hora de entrada/salida, su cupo de
-- baño y comida (minutos que NO cuentan en contra) y su tolerancia de tardanza.
-- Una persona puede sobreescribir lo suyo. La jornada y el cupo alimentan la nota
-- (pantalla/cámara se miden sobre el turno MENOS baño+comida) y la detección de
-- tardanza. Lo manejan dueño + admins.

alter table public.roles_config
  add column if not exists hora_entrada   time,
  add column if not exists hora_salida    time,
  add column if not exists comida_min     int  not null default 30,
  add column if not exists bano_min       int  not null default 10,
  add column if not exists tolerancia_min int  not null default 5;

alter table public.profiles
  add column if not exists hora_entrada time,
  add column if not exists hora_salida  time,
  add column if not exists comida_min   int,
  add column if not exists bano_min      int;

-- RPC: horario de un ROL (dueño + admins).
create or replace function public.argos_horario_rol(
  _role text, _entrada time, _salida time, _comida int, _bano int, _tolerancia int)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'sin permiso para cambiar horarios';
  end if;
  update public.roles_config set
    hora_entrada   = _entrada,
    hora_salida    = _salida,
    comida_min     = greatest(0, coalesce(_comida, 30)),
    bano_min       = greatest(0, coalesce(_bano, 10)),
    tolerancia_min = greatest(0, coalesce(_tolerancia, 5))
  where name = _role and tenant_id = (select public.current_tenant_id());
end;
$$;

-- RPC: override de horario por PERSONA (dueño + admins). null = usa el del rol.
create or replace function public.argos_horario_persona(
  _user uuid, _entrada time, _salida time, _comida int, _bano int)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'sin permiso para cambiar horarios';
  end if;
  update public.profiles set
    hora_entrada = _entrada,
    hora_salida  = _salida,
    comida_min   = _comida,
    bano_min     = _bano
  where id = _user;
end;
$$;

revoke all on function public.argos_horario_rol(text, time, time, int, int, int) from public, anon;
revoke all on function public.argos_horario_persona(uuid, time, time, int, int) from public, anon;
grant execute on function public.argos_horario_rol(text, time, time, int, int, int) to authenticated;
grant execute on function public.argos_horario_persona(uuid, time, time, int, int) to authenticated;
