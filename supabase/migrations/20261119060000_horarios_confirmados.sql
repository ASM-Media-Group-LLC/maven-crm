-- HORARIOS CONFIRMADOS (Alvaro, 19/11/2026, preguntas y respuestas):
--   · Un solo horario por persona, día por día (horario_semanal, que ya manda en
--     horario_de / turno_del_dia), con su base en el puesto (hoy roles_config +
--     rol_turnos; cuando las posiciones salgan del borrador, la posición).
--   · Lo cambia «el que tiene los accesos»: por ahora el dueño, RR. HH. (a todos
--     menos admins) y los supervisores (Daniel Ospina, Breyner, Vanessa) a su
--     equipo. Cuando las posiciones manden, este candado lee la posición.
--   · Cada guardado deja la confirmación (quién y cuándo) y el historial.
--   · Mientras el horario de alguien no esté confirmado, Argos no le cuenta
--     llegadas tarde (eso lo hace el frontend con horario_confirmado).
--   · A RR. HH. (Andrea) le sale un cartel que no se quita hasta confirmar todos.

create table if not exists public.horario_confirmado (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  confirmado_at timestamptz not null default now(),
  confirmado_por uuid references public.profiles(id) on delete set null
);
alter table public.horario_confirmado enable row level security;

create table if not exists public.horario_cambios (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  por uuid references public.profiles(id) on delete set null,
  creado timestamptz not null default now(),
  antes jsonb,
  despues jsonb
);
create index if not exists horario_cambios_persona on public.horario_cambios (user_id, creado desc);
alter table public.horario_cambios enable row level security;

-- ¿Quien mira puede cambiar el horario de _target?
create or replace function public.puede_editar_horario(_target uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select _target is not null
     and not public.es_dueno(_target)
     and (
       public.es_dueno((select auth.uid()))
       or (coalesce(public.es_rh((select auth.uid())), false) and not public.es_admin_o_dueno(_target))
       or (
         exists (select 1 from public.profiles p
                  where p.id = (select auth.uid()) and p.nivel = 'supervisor' and p.deleted_at is null)
         and _target in (select s.user_id from public.mi_equipo_supervisado() s)
       )
     );
$function$;
revoke all on function public.puede_editar_horario(uuid) from public, anon;
grant execute on function public.puede_editar_horario(uuid) to authenticated;

create policy horario_confirmado_ver on public.horario_confirmado
  for select to authenticated
  using (user_id = (select auth.uid()) or public.puede_vigilar(user_id) or public.puede_editar_horario(user_id));

create policy horario_cambios_ver on public.horario_cambios
  for select to authenticated
  using (user_id = (select auth.uid()) or public.puede_vigilar(user_id) or public.puede_editar_horario(user_id));

-- La gente cuyo horario puede cambiar quien mira, con su base y su semana.
create or replace function public.horarios_del_equipo()
returns table (
  user_id uuid,
  nombre text,
  avatar_url text,
  avatar_seed text,
  puesto text,
  equipo text,
  base_entrada time,
  base_salida time,
  turno text,
  semana jsonb,
  confirmado_at timestamptz,
  confirmado_por text
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_tenant uuid := public.current_tenant_id();
begin
  if v_uid is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  return query
  select p.id,
         p.full_name,
         p.avatar_url,
         p.avatar_seed,
         (select string_agg(distinct ur.role, ' + ') from public.user_roles ur where ur.user_id = p.id),
         public.equipo_de(p.id),
         coalesce(p.hora_entrada, t.hora_entrada, rc.hora_entrada),
         coalesce(p.hora_salida, t.hora_salida, rc.hora_salida),
         t.nombre,
         (select jsonb_agg(jsonb_build_object('dia', hs.dia, 'entrada', hs.entrada, 'salida', hs.salida) order by hs.dia)
            from public.horario_semanal hs where hs.user_id = p.id),
         hc.confirmado_at,
         (select q.full_name from public.profiles q where q.id = hc.confirmado_por)
    from public.profiles p
    join public.tenant_members m on m.user_id = p.id and m.tenant_id = v_tenant
    left join public.rol_turnos t on t.id = p.turno_id
    left join lateral (
      select c.hora_entrada, c.hora_salida
        from public.user_roles ur
        join public.roles_config c on lower(c.name) = lower(ur.role) and c.is_active
                                  and (c.tenant_id = ur.tenant_id or ur.tenant_id is null)
       where ur.user_id = p.id
       order by (c.hora_entrada is null), c.level desc nulls last
       limit 1
    ) rc on true
    left join public.horario_confirmado hc on hc.user_id = p.id
   where p.deleted_at is null
     and public.puede_editar_horario(p.id)
   order by p.full_name;
end;
$function$;
revoke all on function public.horarios_del_equipo() from public, anon;
grant execute on function public.horarios_del_equipo() to authenticated;

-- Guarda la semana de una persona (7 días; descanso = entrada y salida en null)
-- y la deja confirmada. Candado en el servidor.
create or replace function public.horario_guardar(_user_id uuid, _dias jsonb)
returns void
language plpgsql
volatile security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_antes jsonb;
  v_d jsonb;
  v_vistos int[] := '{}';
  v_dia int;
  v_ent time;
  v_sal time;
begin
  if v_uid is null or not public.puede_editar_horario(_user_id) then
    raise exception 'horario_guardar: sin permiso para cambiar el horario de esta persona' using errcode = '42501';
  end if;
  if jsonb_typeof(_dias) <> 'array' or jsonb_array_length(_dias) <> 7 then
    raise exception 'horario_guardar: se esperan los 7 días de la semana' using errcode = '22023';
  end if;
  for v_d in select * from jsonb_array_elements(_dias) loop
    v_dia := (v_d->>'dia')::int;
    if v_dia is null or v_dia < 0 or v_dia > 6 or v_dia = any(v_vistos) then
      raise exception 'horario_guardar: día inválido o repetido' using errcode = '22023';
    end if;
    v_vistos := v_vistos || v_dia;
    v_ent := nullif(v_d->>'entrada', '')::time;
    v_sal := nullif(v_d->>'salida', '')::time;
    if (v_ent is null) <> (v_sal is null) then
      raise exception 'horario_guardar: cada día lleva entrada y salida, o es descanso' using errcode = '22023';
    end if;
  end loop;

  select jsonb_agg(jsonb_build_object('dia', hs.dia, 'entrada', hs.entrada, 'salida', hs.salida) order by hs.dia)
    into v_antes from public.horario_semanal hs where hs.user_id = _user_id;

  delete from public.horario_semanal where user_id = _user_id;
  insert into public.horario_semanal (user_id, dia, entrada, salida, actualizado_at)
  select _user_id, (e->>'dia')::smallint, nullif(e->>'entrada', '')::time, nullif(e->>'salida', '')::time, now()
    from jsonb_array_elements(_dias) e;

  insert into public.horario_confirmado (user_id, confirmado_at, confirmado_por)
  values (_user_id, now(), v_uid)
  on conflict (user_id) do update set confirmado_at = excluded.confirmado_at, confirmado_por = excluded.confirmado_por;

  insert into public.horario_cambios (user_id, por, antes, despues)
  values (_user_id, v_uid, v_antes,
          (select jsonb_agg(jsonb_build_object('dia', hs.dia, 'entrada', hs.entrada, 'salida', hs.salida) order by hs.dia)
             from public.horario_semanal hs where hs.user_id = _user_id));
end;
$function$;
revoke all on function public.horario_guardar(uuid, jsonb) from public, anon;
grant execute on function public.horario_guardar(uuid, jsonb) to authenticated;

-- ¿Le sale el cartel que no se quita? Solo a RR. HH. que no es admin ni dueño
-- (Andrea), mientras quede alguien sin confirmar.
create or replace function public.horarios_bloqueo()
returns table (debe boolean, pendientes integer, total integer)
language sql
stable security definer
set search_path to 'public'
as $function$
  with gente as (
    select h.user_id, h.confirmado_at from public.horarios_del_equipo() h
  ),
  yo as (
    select coalesce(public.es_rh((select auth.uid())), false)
           and not public.es_admin_o_dueno((select auth.uid())) as rh
  )
  select (select rh from yo) and exists (select 1 from gente where confirmado_at is null),
         (select count(*)::int from gente where confirmado_at is null),
         (select count(*)::int from gente);
$function$;
revoke all on function public.horarios_bloqueo() from public, anon;
grant execute on function public.horarios_bloqueo() to authenticated;
