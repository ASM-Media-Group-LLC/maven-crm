-- TURNOS DE LA EMPRESA (Alvaro, 27/11/2026, preguntas y respuestas):
--   «aquí el AM es de 8 de la mañana a 4 de la tarde, de 4 a 12 es el PM y la
--   madrugada el resto… debería estar en la estructura de roles también para
--   elegirse… que todo sea muy personalizable para cada puesto».
--   · Cada empresa define su lista de turnos (nombre + entrada + salida), igual
--     que ya define sus modalidades de pausa (pausas_modalidades).
--   · Cada puesto (posiciones_borrador) trae un turno por defecto.
--   · Cada persona puede tener el suyo (RR. HH. lo pone en Horarios del equipo):
--     un chatter es del puesto «Chatter» pero trabaja AM, PM o madrugada.
--   · Orden para saber el turno de alguien: el de la persona → el de su puesto.
--   · El horario base (horario_de / horarios_del_equipo) usa ese turno cuando la
--     persona no tiene horas propias. horario_semanal (la semana confirmada) sigue
--     mandando por encima de todo, como hasta hoy.
--   · Cambian: dueño, quien configura la empresa y RR. HH. (en RR. HH., no en los
--     puestos de admin/dueño/acceso total). La persona: quien puede editar su horario.
--   · Se siembran AM 08–16, PM 16–00 y Madrugada 00–08 en cada empresa. No se le
--     asigna turno a ningún puesto ni persona: eso lo decide RR. HH.

-- ─── 1. La lista de turnos de cada empresa ───────────────────────────────────
create table if not exists public.turnos_empresa (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 40),
  hora_entrada time not null,
  hora_salida time not null,
  orden integer not null default 0,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, nombre)
);
alter table public.turnos_empresa enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'turnos_empresa' and policyname = 'turnos_empresa_ver') then
    create policy turnos_empresa_ver on public.turnos_empresa
      for select to authenticated
      using (tenant_id = public.current_tenant_id());
  end if;
end $$;
-- Nadie escribe con su sesión: solo turno_empresa_guardar (definer).
revoke insert, update, delete on public.turnos_empresa from anon, authenticated;
grant select on public.turnos_empresa to authenticated;

-- ─── 2. El turno por defecto del puesto y el de la persona ───────────────────
alter table public.posiciones_borrador
  add column if not exists turno_id uuid references public.turnos_empresa(id) on delete set null;
alter table public.profiles
  add column if not exists turno_empresa_id uuid references public.turnos_empresa(id) on delete set null;

-- ─── 3. Quién puede ──────────────────────────────────────────────────────────
-- La lista de la empresa: dueño, quien configura la empresa o RR. HH.
create or replace function public.puedo_editar_turnos_empresa()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select public.puedo_configurar_empresa() or coalesce(public.es_rh((select auth.uid())), false);
$function$;
revoke all on function public.puedo_editar_turnos_empresa() from public, anon;
grant execute on function public.puedo_editar_turnos_empresa() to authenticated;

-- El turno de un puesto: lo mismo, pero RR. HH. no toca puestos de admin, del
-- dueño ni de acceso total (igual que puede_cambiar_exigencias).
create or replace function public.puede_cambiar_turno_puesto(_posicion uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select public.puedo_configurar_empresa()
      or public.puede_cambiar_exigencias((select auth.uid()), _posicion)
      or (coalesce(public.es_rh((select auth.uid())), false)
          and exists (select 1 from public.posiciones_borrador pb
                       where pb.id = _posicion and not pb.acceso_total
                         and coalesce(pb.rol, '') <> 'admin' and pb.nombre <> 'Dueño'));
$function$;
revoke all on function public.puede_cambiar_turno_puesto(uuid) from public, anon;
grant execute on function public.puede_cambiar_turno_puesto(uuid) to authenticated;

-- ─── 4. Leer y guardar la lista ──────────────────────────────────────────────
create or replace function public.turnos_de_mi_empresa()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'puede_editar', public.puedo_editar_turnos_empresa(),
    'turnos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'nombre', t.nombre,
        'entrada', to_char(t.hora_entrada, 'HH24:MI'), 'salida', to_char(t.hora_salida, 'HH24:MI'),
        'activa', t.activa,
        'puestos', (select count(*) from public.posiciones_borrador pb where pb.turno_id = t.id),
        'personas', (select count(*) from public.profiles p where p.turno_empresa_id = t.id and p.deleted_at is null))
      order by t.orden, t.nombre)
      from public.turnos_empresa t where t.tenant_id = public.empresa_de((select auth.uid()))), '[]'::jsonb),
    -- El turno por defecto de cada puesto de la empresa, y si quien mira lo puede cambiar.
    'puestos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pb.id, 'nombre', pb.nombre, 'turno_id', pb.turno_id,
        'puede', public.puede_cambiar_turno_puesto(pb.id),
        'personas', (select count(*) from public.posiciones_borrador_personas bp where bp.posicion_id = pb.id))
      order by pb.orden, pb.nombre)
      from public.posiciones_borrador pb
     where pb.activa and pb.tenant_id = public.empresa_de((select auth.uid()))), '[]'::jsonb));
$function$;
revoke all on function public.turnos_de_mi_empresa() from public, anon;
grant execute on function public.turnos_de_mi_empresa() to authenticated;

create or replace function public.turno_empresa_guardar(_id uuid, _nombre text, _entrada time, _salida time, _activa boolean default true)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  emp uuid := public.empresa_de((select auth.uid()));
  v_id uuid;
begin
  if not public.puedo_editar_turnos_empresa() then
    raise exception 'sin permiso para cambiar los turnos de la empresa' using errcode = '42501';
  end if;
  if emp is null then raise exception 'sin empresa' using errcode = '42501'; end if;
  if _entrada is null or _salida is null or _entrada = _salida then
    raise exception 'entrada y salida deben ser distintas' using errcode = '22023';
  end if;
  if _id is null then
    insert into public.turnos_empresa (tenant_id, nombre, hora_entrada, hora_salida, activa, orden)
    values (emp, btrim(_nombre), _entrada, _salida, coalesce(_activa, true),
            coalesce((select max(orden) + 1 from public.turnos_empresa where tenant_id = emp), 1))
    returning id into v_id;
  else
    update public.turnos_empresa
       set nombre = btrim(_nombre), hora_entrada = _entrada, hora_salida = _salida,
           activa = coalesce(_activa, true), updated_at = now()
     where id = _id and tenant_id = emp
    returning id into v_id;
    if v_id is null then raise exception 'no encontrado' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end
$function$;
revoke all on function public.turno_empresa_guardar(uuid, text, time, time, boolean) from public, anon;
grant execute on function public.turno_empresa_guardar(uuid, text, time, time, boolean) to authenticated;

-- ─── 5. Ponerle turno a un puesto o a una persona ────────────────────────────
create or replace function public.posicion_turno_guardar(_posicion uuid, _turno uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.puede_cambiar_turno_puesto(_posicion) then
    raise exception 'No puedes cambiar el turno de este puesto' using errcode = '42501';
  end if;
  if _turno is not null and not exists (
    select 1 from public.turnos_empresa t join public.posiciones_borrador pb on pb.id = _posicion
     where t.id = _turno and t.tenant_id = pb.tenant_id) then
    raise exception 'Ese turno no es de esta empresa' using errcode = '22023';
  end if;
  perform set_config('maven.posiciones_aplicando', 'on', true);
  update public.posiciones_borrador set turno_id = _turno, updated_at = now() where id = _posicion;
  perform set_config('maven.posiciones_aplicando', '', true);
end $function$;
revoke all on function public.posicion_turno_guardar(uuid, uuid) from public, anon;
grant execute on function public.posicion_turno_guardar(uuid, uuid) to authenticated;

create or replace function public.persona_turno_guardar(_uid uuid, _turno uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.puede_editar_horario(_uid) then
    raise exception 'No puedes cambiar el turno de esta persona' using errcode = '42501';
  end if;
  if _turno is not null and not exists (
    select 1 from public.turnos_empresa t where t.id = _turno and t.tenant_id = public.empresa_de((select auth.uid()))) then
    raise exception 'Ese turno no es de esta empresa' using errcode = '22023';
  end if;
  update public.profiles set turno_empresa_id = _turno where id = _uid;
end $function$;
revoke all on function public.persona_turno_guardar(uuid, uuid) from public, anon;
grant execute on function public.persona_turno_guardar(uuid, uuid) to authenticated;

-- ─── 6. El turno de alguien: el suyo → el de su puesto ───────────────────────
create or replace function public.turno_empresa_de(_uid uuid)
returns table (turno_id uuid, nombre text, entrada time, salida time, origen text)
language sql
stable security definer
set search_path to 'public'
as $function$
  select x.id, x.nombre, x.hora_entrada, x.hora_salida, x.origen from (
    select t.id, t.nombre, t.hora_entrada, t.hora_salida, 'persona'::text as origen, 0 as prio, 0 as orden
      from public.profiles p join public.turnos_empresa t on t.id = p.turno_empresa_id
     where p.id = _uid
    union all
    select t.id, t.nombre, t.hora_entrada, t.hora_salida, 'puesto', 1, pb.orden
      from public.posiciones_borrador_personas bp
      join public.posiciones_borrador pb on pb.id = bp.posicion_id and pb.activa
      join public.turnos_empresa t on t.id = pb.turno_id
     where bp.user_id = _uid
  ) x
  order by x.prio, x.orden
  limit 1;
$function$;
revoke all on function public.turno_empresa_de(uuid) from public, anon, authenticated;

-- El turno de varias personas a la vez (Argos → Turno y Horarios del equipo). Solo
-- de gente que quien mira puede vigilar o cuyo horario puede editar.
create or replace function public.turnos_de_la_gente(_ids uuid[])
returns table (user_id uuid, turno_id uuid, nombre text, entrada text, salida text, origen text)
language sql
stable security definer
set search_path to 'public'
as $function$
  select u.id, t.turno_id, t.nombre, to_char(t.entrada, 'HH24:MI'), to_char(t.salida, 'HH24:MI'), t.origen
    from unnest(_ids) as u(id)
    cross join lateral public.turno_empresa_de(u.id) t
   where public.puede_vigilar(u.id) or public.puede_editar_horario(u.id) or u.id = (select auth.uid());
$function$;
revoke all on function public.turnos_de_la_gente(uuid[]) from public, anon;
grant execute on function public.turnos_de_la_gente(uuid[]) to authenticated;

-- ─── 7. El horario base usa el turno (copiado de producción, 27/11/2026) ─────
-- Solo cambia la cadena: horas propias → TURNO (persona o puesto) → turno del rol → rol.
create or replace function public.horario_de(_uid uuid)
 returns table(entrada time without time zone, salida time without time zone, exento boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case when sem.tiene then sem.entrada else coalesce(p.hora_entrada, te.entrada, t.hora_entrada, rc.hora_entrada) end,
         case when sem.tiene then sem.salida else coalesce(p.hora_salida, te.salida, t.hora_salida, rc.hora_salida) end,
         coalesce(p.exonera_camara_pantalla, false) or coalesce(rc.exonera_camara_pantalla, false)
    from public.profiles p
    left join public.rol_turnos t on t.id = p.turno_id
    left join lateral public.turno_empresa_de(p.id) te on true
    left join lateral (
      select c.hora_entrada, c.hora_salida, c.exonera_camara_pantalla
        from public.user_roles ur
        join public.roles_config c on lower(c.name) = lower(ur.role) and c.is_active
                                  and (c.tenant_id = ur.tenant_id or ur.tenant_id is null)
       where ur.user_id = p.id
       order by (c.hora_entrada is null), c.level desc nulls last
       limit 1
    ) rc on true
    left join lateral (
      select exists (select 1 from public.horario_semanal w where w.user_id = p.id) as tiene,
             hs.entrada, hs.salida
        from (select 1) as uno
        left join public.horario_semanal hs
               on hs.user_id = p.id
              and hs.dia = extract(dow from (now() at time zone 'America/Bogota'))::smallint
    ) sem on true
   where p.id = _uid;
$function$;

create or replace function public.horarios_del_equipo()
 returns table(user_id uuid, nombre text, avatar_url text, avatar_seed text, puesto text, equipo text, base_entrada time without time zone, base_salida time without time zone, turno text, semana jsonb, confirmado_at timestamp with time zone, confirmado_por text)
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
         coalesce(p.hora_entrada, te.entrada, t.hora_entrada, rc.hora_entrada),
         coalesce(p.hora_salida, te.salida, t.hora_salida, rc.hora_salida),
         coalesce(te.nombre, t.nombre),
         (select jsonb_agg(jsonb_build_object('dia', hs.dia, 'entrada', hs.entrada, 'salida', hs.salida) order by hs.dia)
            from public.horario_semanal hs where hs.user_id = p.id),
         hc.confirmado_at,
         (select q.full_name from public.profiles q where q.id = hc.confirmado_por)
    from public.profiles p
    join public.tenant_members m on m.user_id = p.id and m.tenant_id = v_tenant
    left join public.rol_turnos t on t.id = p.turno_id
    left join lateral public.turno_empresa_de(p.id) te on true
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

-- ─── 8. Los tres turnos de siempre en cada empresa ───────────────────────────
insert into public.turnos_empresa (tenant_id, nombre, hora_entrada, hora_salida, orden)
select t.id, x.nombre, x.e, x.s, x.o
  from public.tenants t
 cross join (values ('AM', time '08:00', time '16:00', 1),
                    ('PM', time '16:00', time '00:00', 2),
                    ('Madrugada', time '00:00', time '08:00', 3)) as x(nombre, e, s, o)
on conflict (tenant_id, nombre) do nothing;
