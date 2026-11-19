-- PAUSAS POR MODALIDAD, QUIÉN CAMBIA A QUIÉN E INACTIVIDAD (Alvaro, 19/11/2026,
-- tres rondas de preguntas). Pensado para muchas EMPRESAS, no solo esta.
--
-- MODALIDADES DE PAUSA: cada empresa (tenant) define las suyas, almuerzo + baño.
-- En la de Alvaro: «1 hora» (60 + 10), «30 minutos» (30 + 10), «Sin pausa» (0).
-- Solo el dueño y quien tenga N:pausas.modalidades (Admin) las crean o cambian.
-- Cada PUESTO trae una (posiciones_borrador.modalidad_id) y a una PERSONA se le
-- puede poner otra (pausas_persona) sin cambiarle el puesto.
-- El baño es un cupo TOTAL por turno; el almuerzo (y el «break») el suyo.
-- De la modalidad sale todo: el pago (argos_gracia_calculo), el tope de cada
-- pausa en Cowork (pausa_restante_min → cowork-session) y la tarjeta del turno
-- (argos_permitido_min).
--
-- QUIÉN CAMBIA A QUIÉN (pausas y horarios, una sola regla, puede_gestionar_a):
-- nadie se cambia a sí mismo; al dueño no lo toca nadie; un admin cambia a
-- todos menos admins y dueño (RR. HH. incluido); quien tenga
-- N:horarios.gestionar (RR. HH.) cambia a todos menos admins y dueño. Los
-- supervisores, además, el HORARIO de su equipo (no la pausa).
--
-- INACTIVIDAD (desde el corte del 20/11, con la entrada marcada): si alguien
-- llega a 10 min sin tocar teclado/ratón ni hablar, no se paga TODO ese rato
-- (desde que dejó de tocar hasta que vuelve); a los 20 min se le marca salida.

set check_function_bodies = off;

-- ─── Las modalidades ─────────────────────────────────────────────────────────
create table if not exists public.pausas_modalidades (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  nombre text not null check (length(btrim(nombre)) between 1 and 60),
  comida_min integer not null default 60 check (comida_min between 0 and 240),
  bano_min integer not null default 10 check (bano_min between 0 and 120),
  orden integer not null default 0,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, nombre)
);
comment on table public.pausas_modalidades is
  'Modalidades de pausa de cada empresa (almuerzo + baño, en minutos, cupo por turno). Las crean el dueño y quien tenga N:pausas.modalidades.';

create table if not exists public.pausas_persona (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  modalidad_id uuid not null references public.pausas_modalidades(id) on delete cascade,
  asignado_por uuid references public.profiles(id) on delete set null,
  asignado_at timestamptz not null default now()
);

do $col$ begin
  if to_regclass('public.posiciones_borrador') is not null then
    alter table public.posiciones_borrador add column if not exists modalidad_id uuid references public.pausas_modalidades(id) on delete set null;
  end if;
end $col$;

alter table public.pausas_modalidades enable row level security;
alter table public.pausas_persona enable row level security;

-- La empresa de alguien (la primera; hoy cada persona está en una).
create or replace function public.empresa_de(_uid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.tenant_id from public.tenant_members m where m.user_id = _uid order by m.created_at nulls last limit 1;
$$;
revoke all on function public.empresa_de(uuid) from public, anon, authenticated;

do $pol$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pausas_modalidades' and policyname = 'pausas_modalidades_ver') then
    create policy pausas_modalidades_ver on public.pausas_modalidades for select to authenticated
      using (tenant_id = public.empresa_de((select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pausas_persona' and policyname = 'pausas_persona_ver') then
    create policy pausas_persona_ver on public.pausas_persona for select to authenticated
      using (user_id = (select auth.uid()) or public.puede_vigilar_a((select auth.uid()), user_id));
  end if;
end $pol$;

-- ─── Quién cambia a quién ────────────────────────────────────────────────────
create or replace function public.puede_gestionar_a(_viewer uuid, _target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _viewer is not null and _target is not null and _viewer <> _target
     and not public.es_dueno(_target)
     and exists (select 1 from public.profiles t where t.id = _target and t.deleted_at is null)
     and exists (
       select 1 from public.tenant_members a
         join public.tenant_members b on b.tenant_id = a.tenant_id
        where a.user_id = _viewer and b.user_id = _target)
     and (
       public.es_dueno(_viewer)
       or (public.es_admin_o_dueno(_viewer) and not public.es_admin_o_dueno(_target))
       or (public.tiene_funcion(_viewer, 'N:horarios.gestionar') and not public.es_admin_o_dueno(_target))
     );
$$;
revoke all on function public.puede_gestionar_a(uuid, uuid) from public, anon;
grant execute on function public.puede_gestionar_a(uuid, uuid) to authenticated;

-- Horarios: la misma regla; los supervisores, además, su equipo (nunca a sí mismos).
create or replace function public.puede_editar_horario(_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.puede_gestionar_a((select auth.uid()), _target)
      or (
        _target is not null and _target <> (select auth.uid())
        and not public.es_admin_o_dueno(_target)
        and exists (select 1 from public.profiles p
                     where p.id = (select auth.uid()) and p.nivel = 'supervisor' and p.deleted_at is null)
        and _target in (select s.user_id from public.mi_equipo_supervisado() s)
      );
$$;

-- ─── La pausa de cada persona ────────────────────────────────────────────────
-- Persona → puesto (la mayor si tiene varios) → lo de antes (roles_config) → 30 + 10.
create or replace function public.argos_pausas_de(_uid uuid)
returns table (modalidad_id uuid, nombre text, comida_min integer, bano_min integer, origen text)
language sql
stable
security definer
set search_path = public
as $$
  select x.modalidad_id, x.nombre, x.comida_min, x.bano_min, x.origen from (
    select m.id as modalidad_id, m.nombre, m.comida_min, m.bano_min, 'persona'::text as origen, 1 as prioridad, 0 as total
      from public.pausas_persona pp join public.pausas_modalidades m on m.id = pp.modalidad_id
     where pp.user_id = _uid
    union all
    select m.id, m.nombre, m.comida_min, m.bano_min, 'puesto', 2, m.comida_min + m.bano_min
      from public.posiciones_borrador_personas bp
      join public.posiciones_borrador pb on pb.id = bp.posicion_id and pb.activa
      join public.pausas_modalidades m on m.id = pb.modalidad_id
     where bp.user_id = _uid
    union all
    select null, null, coalesce(p.comida_min, r.comida, 30), coalesce(p.bano_min, r.bano, 10), 'base', 3, 0
      from public.profiles p
      left join lateral (
        select max(c.comida_min) as comida, max(c.bano_min) as bano
          from public.user_roles ur
          join public.roles_config c on lower(c.name) = lower(ur.role) and c.is_active
                                    and (c.tenant_id = ur.tenant_id or ur.tenant_id is null)
         where ur.user_id = p.id
      ) r on true
     where p.id = _uid
  ) x
  order by x.prioridad, x.total desc
  limit 1;
$$;
revoke all on function public.argos_pausas_de(uuid) from public, anon;
grant execute on function public.argos_pausas_de(uuid) to authenticated;

-- El cupo total (lo usan la tarjeta del turno y Argos): almuerzo + baño.
create or replace function public.argos_permitido_min(_uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(coalesce(p.comida_min, 30), 0) + greatest(coalesce(p.bano_min, 10), 0)
    from public.argos_pausas_de(_uid) p;
$$;

-- Lo que le queda de ese tipo de pausa en el turno de hoy (lo usa Cowork para el
-- contador). El baño es un cupo total; almuerzo y break comparten el suyo.
create or replace function public.pausa_restante_min(_uid uuid, _kind text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with p as (select * from public.argos_pausas_de(_uid)),
  t as (
    select coalesce((select q.inicio from public.turno_que_toca(_uid, now()) q where q.inicio <= now()), now() - interval '12 hours') as desde
  ),
  usado as (
    select coalesce(sum(extract(epoch from (coalesce(b.ended_at, now()) - greatest(b.started_at, t.desde)))), 0) as seg
      from public.cowork_breaks b, t
     where b.user_id = _uid and coalesce(b.ended_at, now()) > t.desde
       and case when _kind = 'bano' then b.kind = 'bano' else b.kind in ('almuerzo', 'break') end
       and b.ended_at is not null
  )
  select greatest(0, floor(((case when _kind = 'bano' then p.bano_min else p.comida_min end) * 60 - usado.seg) / 60))::int
    from p, usado;
$$;
revoke all on function public.pausa_restante_min(uuid, text) from public, anon, authenticated;

-- ─── Lo que ven y usan las pantallas ─────────────────────────────────────────
create or replace function public.pausas_modalidades_de_mi_empresa()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'puede_editar', public.es_dueno((select auth.uid())) or public.tiene_funcion((select auth.uid()), 'N:pausas.modalidades')
                    or public.es_admin_o_dueno((select auth.uid())),
    'modalidades', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.id, 'nombre', m.nombre, 'comida_min', m.comida_min, 'bano_min', m.bano_min, 'activa', m.activa,
        'personas', (select count(*) from public.pausas_persona pp where pp.modalidad_id = m.id),
        'puestos', (select count(*) from public.posiciones_borrador pb where pb.modalidad_id = m.id))
      order by m.orden, m.nombre)
      from public.pausas_modalidades m where m.tenant_id = public.empresa_de((select auth.uid()))), '[]'::jsonb));
$$;
revoke all on function public.pausas_modalidades_de_mi_empresa() from public, anon;
grant execute on function public.pausas_modalidades_de_mi_empresa() to authenticated;

create or replace function public.pausas_modalidad_guardar(_id uuid, _nombre text, _comida integer, _bano integer, _activa boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
  emp uuid := public.empresa_de((select auth.uid()));
  v_id uuid;
begin
  if not (public.es_dueno(yo) or public.es_admin_o_dueno(yo) or public.tiene_funcion(yo, 'N:pausas.modalidades')) then
    raise exception 'sin permiso para cambiar las modalidades de pausa' using errcode = '42501';
  end if;
  if emp is null then raise exception 'sin empresa' using errcode = '42501'; end if;
  if _id is null then
    insert into public.pausas_modalidades (tenant_id, nombre, comida_min, bano_min, activa, orden)
    values (emp, btrim(_nombre), _comida, _bano, coalesce(_activa, true),
            coalesce((select max(orden) + 1 from public.pausas_modalidades where tenant_id = emp), 1))
    returning id into v_id;
  else
    update public.pausas_modalidades
       set nombre = btrim(_nombre), comida_min = _comida, bano_min = _bano, activa = coalesce(_activa, true), updated_at = now()
     where id = _id and tenant_id = emp
    returning id into v_id;
    if v_id is null then raise exception 'no encontrada' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end
$$;
revoke all on function public.pausas_modalidad_guardar(uuid, text, integer, integer, boolean) from public, anon;
grant execute on function public.pausas_modalidad_guardar(uuid, text, integer, integer, boolean) to authenticated;

-- La gente a la que el que mira le puede cambiar la pausa, con la suya actual.
create or replace function public.pausas_del_equipo()
returns table (user_id uuid, modalidad_id uuid, modalidad text, comida_min integer, bano_min integer, origen text, puede_cambiar boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, x.modalidad_id, x.nombre, x.comida_min, x.bano_min, x.origen,
         public.puede_gestionar_a((select auth.uid()), p.id)
    from public.profiles p
    cross join lateral public.argos_pausas_de(p.id) x
   where p.deleted_at is null
     and (public.puede_gestionar_a((select auth.uid()), p.id) or public.puede_editar_horario(p.id));
$$;
revoke all on function public.pausas_del_equipo() from public, anon;
grant execute on function public.pausas_del_equipo() to authenticated;

-- Ponerle a alguien una modalidad (null = la de su puesto).
create or replace function public.pausas_asignar(_user_id uuid, _modalidad_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
begin
  if not public.puede_gestionar_a(yo, _user_id) then
    raise exception 'no puedes cambiarle la pausa a esta persona' using errcode = '42501';
  end if;
  if _modalidad_id is null then
    delete from public.pausas_persona where user_id = _user_id;
    return;
  end if;
  if not exists (select 1 from public.pausas_modalidades m
                  where m.id = _modalidad_id and m.activa and m.tenant_id = public.empresa_de(_user_id)) then
    raise exception 'modalidad inválida' using errcode = '22023';
  end if;
  insert into public.pausas_persona (user_id, modalidad_id, asignado_por, asignado_at)
  values (_user_id, _modalidad_id, yo, now())
  on conflict (user_id) do update set modalidad_id = excluded.modalidad_id, asignado_por = excluded.asignado_por, asignado_at = now();
end
$$;
revoke all on function public.pausas_asignar(uuid, uuid) from public, anon;
grant execute on function public.pausas_asignar(uuid, uuid) to authenticated;

-- ─── El pago: pausa por tipo e inactividad ───────────────────────────────────
create or replace function public.argos_gracia_calculo(_uid uuid, _turno date, _hasta timestamptz default now())
returns table (inicio timestamptz, fin timestamptz, conectado_seg integer, trabajo_seg integer, pausa_seg integer, sin_pantalla_seg integer,
               sin_camara_seg integer, gracia_pantalla_min integer, gracia_camara_min integer, extra_pantalla_min integer,
               extra_camara_min integer, descuento_seg integer, a_pagar_seg integer, ensayo boolean)
language plpgsql
stable
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
  v_ini timestamptz;
  v_fin timestamptz;
  v_hasta timestamptz;
  v_cfg record;
  v_trab numeric := 0;
  v_pausa numeric := 0;
  v_pant numeric := 0;
  v_cam numeric := 0;
  v_xp integer := 0;
  v_xc integer := 0;
  v_usado_p numeric;
  v_usado_c numeric;
  v_obl boolean;
  v_pausa_pag numeric := 0;
  v_bano numeric := 0;
  v_otra numeric := 0;
  v_comida_min integer;
  v_bano_min integer;
  v_inact numeric := 0;
begin
  select x.inicio, x.fin into v_ini, v_fin from public.turno_del_dia(_uid, _turno) x;
  if v_ini is null then return; end if;
  select c.pantalla_min, c.camara_min, c.ensayo_hasta into v_cfg from public.argos_gracia_config c where c.id = 1;
  if not found then return; end if;
  v_hasta := least(v_fin, coalesce(_hasta, now()));
  v_obl := v_ini >= coalesce((select c.turno_obligatorio_desde from public.monitor_config c where c.id = 1), 'infinity'::timestamptz);

  if v_hasta > v_ini and not v_obl then
    select coalesce(sum(z.d) filter (where z.estado in ('activo', 'meet', 'sin_conexion')), 0),
           coalesce(sum(z.d) filter (where z.estado = 'pausa'), 0),
           coalesce(sum(z.d) filter (where z.estado = 'sin_pantalla'), 0),
           coalesce(sum(z.d) filter (where z.estado in ('sin_camara', 'fuera_de_camara')), 0)
      into v_trab, v_pausa, v_pant, v_cam
      from (
        select s.estado,
               greatest(0, extract(epoch from (least(coalesce(s.ended_at, s.last_seen_at), v_hasta) - greatest(s.started_at, v_ini)))) as d
          from public.cowork_tiempo_segmentos s
         where s.user_id = _uid
           and s.started_at < v_hasta
           and coalesce(s.ended_at, s.last_seen_at) > v_ini
      ) z;
  elsif v_hasta > v_ini then
    select coalesce(sum(z.d) filter (where z.estado in ('activo', 'meet', 'sin_conexion')), 0),
           coalesce(sum(z.d) filter (where z.estado = 'pausa'), 0),
           coalesce(sum(z.d) filter (where z.estado = 'sin_pantalla'), 0),
           coalesce(sum(z.d) filter (where z.estado in ('sin_camara', 'fuera_de_camara')), 0)
      into v_trab, v_pausa, v_pant, v_cam
      from (
        select s.estado,
               greatest(0, extract(epoch from (
                 least(coalesce(s.ended_at, s.last_seen_at), v_hasta, coalesce(mk.fin, now()))
                 - greatest(s.started_at, v_ini, mk.inicio)))) as d
          from public.cowork_tiempo_segmentos s
          join public.turno_marcas mk
            on mk.user_id = s.user_id
           and mk.inicio < least(coalesce(s.ended_at, s.last_seen_at), v_hasta)
           and coalesce(mk.fin, now()) > greatest(s.started_at, v_ini)
         where s.user_id = _uid
           and s.started_at < v_hasta
           and coalesce(s.ended_at, s.last_seen_at) > v_ini
      ) z;

    -- Pausa pagada POR TIPO según su modalidad (19/11/2026): el baño hasta su
    -- cupo total del turno; almuerzo y break hasta el suyo. Lo de más no se paga.
    select coalesce(sum(z.d) filter (where z.kind = 'bano'), 0),
           coalesce(sum(z.d) filter (where z.kind <> 'bano'), 0)
      into v_bano, v_otra
      from (
        select b.kind,
               greatest(0, extract(epoch from (
                 least(coalesce(b.ended_at, now()), v_hasta, coalesce(mk.fin, now()))
                 - greatest(b.started_at, v_ini, mk.inicio)))) as d
          from public.cowork_breaks b
          join public.turno_marcas mk
            on mk.user_id = b.user_id
           and mk.inicio < least(coalesce(b.ended_at, now()), v_hasta)
           and coalesce(mk.fin, now()) > greatest(b.started_at, v_ini)
         where b.user_id = _uid
           and b.started_at < v_hasta
           and coalesce(b.ended_at, now()) > v_ini
      ) z;
    select p.comida_min, p.bano_min into v_comida_min, v_bano_min from public.argos_pausas_de(_uid) p;
    v_pausa_pag := least(v_pausa,
                         least(v_bano, coalesce(v_bano_min, 10) * 60) + least(v_otra, coalesce(v_comida_min, 30) * 60));

    -- Inactividad (19/11/2026): si llegó a 10 min sin tocar nada ni hablar, no
    -- se paga todo ese rato, desde que dejó de tocar (la alerta se abre a los
    -- 10 min) hasta que volvió (o se le marcó salida).
    select coalesce(sum(greatest(0, extract(epoch from (
             least(coalesce(s.ended_at, s.last_seen_at), v_hasta, coalesce(mk.fin, now()), coalesce(g.cerrada_at, now()))
             - greatest(s.started_at, v_ini, mk.inicio, g.abierta_at - interval '10 minutes'))))), 0)
      into v_inact
      from public.argos_graves g
      join public.cowork_tiempo_segmentos s
        on s.user_id = g.user_id
       and s.estado in ('activo', 'meet', 'sin_conexion')
       and s.started_at < coalesce(g.cerrada_at, now())
       and coalesce(s.ended_at, s.last_seen_at) > g.abierta_at - interval '10 minutes'
      join public.turno_marcas mk
        on mk.user_id = g.user_id
       and mk.inicio < coalesce(g.cerrada_at, now())
       and coalesce(mk.fin, now()) > g.abierta_at - interval '10 minutes'
     where g.user_id = _uid
       and g.tipo = 'sin_actividad'
       and g.abierta_at - interval '10 minutes' < v_hasta
       and coalesce(g.cerrada_at, now()) > v_ini;
    v_inact := least(v_inact, v_trab);
    v_trab := v_trab - v_inact;
  end if;

  select coalesce(sum(e.pantalla_min), 0), coalesce(sum(e.camara_min), 0)
    into v_xp, v_xc
    from public.argos_gracia_extra e
   where e.user_id = _uid and e.turno = _turno;

  v_usado_p := least(v_pant, (v_cfg.pantalla_min + v_xp) * 60);
  v_usado_c := least(v_cam, (v_cfg.camara_min + v_xc) * 60);

  inicio := v_ini;
  fin := v_fin;
  conectado_seg := round(v_trab + v_inact + v_pausa + v_pant + v_cam)::int;
  trabajo_seg := round(v_trab)::int;
  pausa_seg := round(v_pausa)::int;
  sin_pantalla_seg := round(v_pant)::int;
  sin_camara_seg := round(v_cam)::int;
  gracia_pantalla_min := v_cfg.pantalla_min + v_xp;
  gracia_camara_min := v_cfg.camara_min + v_xc;
  extra_pantalla_min := v_xp;
  extra_camara_min := v_xc;
  descuento_seg := round((v_pant - v_usado_p) + (v_cam - v_usado_c)
                         + (case when v_obl then v_pausa - v_pausa_pag + v_inact else 0 end))::int;
  a_pagar_seg := round(v_trab + v_usado_p + v_usado_c + v_pausa_pag)::int;
  ensayo := v_cfg.ensayo_hasta is not null and _turno < v_cfg.ensayo_hasta;
  return next;
end;
$function$;

-- ─── Lo que la persona ve de su alerta (con el corte, el aviso de pago) ──────
drop function if exists public.mi_alerta_grave();
create function public.mi_alerta_grave()
returns table (id uuid, tipo text, desde timestamptz, minutos integer, detalle text, escalada boolean, obligatorio boolean)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.tipo, g.abierta_at, g.minutos, g.detalle, g.escalada_at is not null, public.turno_obligatorio()
    from public.argos_graves g
   where g.user_id = (select auth.uid()) and g.cerrada_at is null
   order by g.abierta_at
   limit 1;
$$;
revoke all on function public.mi_alerta_grave() from public, anon;
grant execute on function public.mi_alerta_grave() to authenticated;

-- ─── El vigía: con el corte, a los 20 min sin actividad se marca salida ──────
create or replace function public.argos_vigilar_graves()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  g public.argos_graves%rowtype;
  n integer := 0;
  v_nombre text;
  v_titulo text;
  v_msg text;
  min_txt text;
  v_obl boolean := public.turno_obligatorio();
begin
  create temporary table if not exists _graves_medida (
    user_id uuid, cub11 numeric, inac11 numeric, ultimo_inac numeric,
    aj60 numeric, aj10 numeric, cub10 numeric, top_ajena text
  ) on commit drop;
  truncate _graves_medida;
  insert into _graves_medida
  with activos as (
    select distinct a.user_id from public.argos_uso_apps a
     where a.hasta > now() - interval '3 minutes'
  ),
  en_turno_ahora as (
    select x.user_id from activos x
     where not public.es_dueno(x.user_id)
       and public.en_turno(x.user_id)
       and (public.turno_obligatorio() or exists (select 1 from public.turno_en_curso(x.user_id, now())))
       and not exists (select 1 from public.cowork_breaks b
                        where b.user_id = x.user_id and b.ended_at is null and b.started_at > now() - interval '12 hours')
  ),
  base as (
    select a.user_id, a.hasta, coalesce(a.segundos, 0)::numeric as seg,
           public.argos_app_clase(a.app, a.titulo, a.url) as clase,
           coalesce(nullif(btrim(a.titulo), ''), a.app) as nombre,
           coalesce(a.segundos_inactivo, 0)::numeric as inac_raw
      from public.argos_uso_apps a
      join en_turno_ahora e on e.user_id = a.user_id
     where a.hasta > now() - interval '61 minutes'
  ),
  b2 as (
    select base.*, case when clase = 'bloqueada' then seg else least(inac_raw, seg) end as inac from base
  )
  select user_id,
         coalesce(sum(seg) filter (where hasta > now() - interval '11 minutes'), 0),
         coalesce(sum(inac) filter (where hasta > now() - interval '11 minutes'), 0),
         (array_agg(case when seg > 0 then inac / seg else 0 end order by hasta desc))[1],
         coalesce(sum(seg) filter (where clase = 'ajena'), 0),
         coalesce(sum(seg) filter (where clase = 'ajena' and hasta > now() - interval '10 minutes'), 0),
         coalesce(sum(seg) filter (where hasta > now() - interval '10 minutes'), 0),
         (array_agg(left(nombre, 60) order by seg desc) filter (where clase = 'ajena'))[1]
    from b2
   group by user_id;
  update public.argos_graves ag
     set cerrada_at = now()
   where ag.cerrada_at is null
     and (
       not exists (select 1 from _graves_medida m where m.user_id = ag.user_id)
       or (ag.tipo = 'sin_actividad' and exists (select 1 from _graves_medida m where m.user_id = ag.user_id and coalesce(m.ultimo_inac, 0) < 0.5))
       or (ag.tipo = 'fuera_del_trabajo' and exists (select 1 from _graves_medida m where m.user_id = ag.user_id and m.aj10 < 0.3 * greatest(m.cub10, 1)))
     );
  for r in
    select m.*, 'sin_actividad'::text as tipo from _graves_medida m
     where m.cub11 >= 480 and m.inac11 >= 540 and coalesce(m.ultimo_inac, 0) >= 0.8
    union all
    select m.*, 'fuera_del_trabajo'::text from _graves_medida m
     where m.aj60 >= 3000 and m.aj10 >= 0.5 * greatest(m.cub10, 1)
       and public.tiene_funcion(m.user_id, 'N:argos.apps_ajenas') and not public.es_dueno(m.user_id)
  loop
    select coalesce(nullif(btrim(p.full_name), ''), 'Alguien') into v_nombre from public.profiles p where p.id = r.user_id;
    select * into g from public.argos_graves
     where user_id = r.user_id and tipo = r.tipo and cerrada_at is null;
    if not found then
      insert into public.argos_graves (user_id, tipo, minutos, detalle)
      values (r.user_id, r.tipo,
              case when r.tipo = 'sin_actividad' then round(r.inac11 / 60) else round(r.aj60 / 60) end,
              case when r.tipo = 'fuera_del_trabajo' then r.top_ajena end)
      returning * into g;
      perform public.argos_rafaga(r.user_id, 'alerta_grave');
      perform public.argos_caso_avisar(r.user_id, 'argos_grave_persona',
        case when r.tipo = 'sin_actividad' then 'Llevas 10 minutos sin actividad en tu turno'
             else 'Llevas una hora fuera de tu trabajo' end,
        case when r.tipo = 'sin_actividad' and v_obl
               then '¿Sigues ahí? Desde que dejaste de tocar, ese tiempo no se paga. A los 20 minutos se te marca salida.'
             when r.tipo = 'sin_actividad'
               then '¿Sigues ahí? Si no vuelves en 2 minutos, Argos avisa a tu jefe y a RR. HH.'
             else coalesce(g.detalle, 'Apps ajenas') || '. Si no vuelves a tu trabajo en 2 minutos, Argos avisa a tu jefe y a RR. HH.' end,
        '/cowork', g.id, 'high');
      n := n + 1;
    else
      update public.argos_graves
         set actualizada_at = now(),
             minutos = case when r.tipo = 'sin_actividad'
                            then greatest(minutos, round(extract(epoch from (now() - abierta_at)) / 60)::int + 10)
                            else greatest(minutos, round(r.aj60 / 60)::int) end,
             detalle = coalesce(r.top_ajena, detalle)
       where id = g.id
       returning * into g;
      if g.escalada_at is null and g.abierta_at <= now() - interval '2 minutes' then
        update public.argos_graves set escalada_at = now() where id = g.id;
        min_txt := g.minutos::text;
        v_titulo := case when r.tipo = 'sin_actividad'
                       then 'Alerta grave: ' || v_nombre || ' lleva ' || min_txt || ' min sin actividad'
                       else 'Alerta grave: ' || v_nombre || ' lleva ' || min_txt || ' min fuera de su trabajo' end;
        v_msg := case when r.tipo = 'sin_actividad'
                    then 'En turno, sin tocar teclado ni ratón. Ya se le avisó y no volvió. Tócalo para verlo en vivo.'
                    else coalesce(g.detalle, 'Apps ajenas') || '. Ya se le avisó y sigue. Tócalo para verlo en vivo.' end;
        perform public.argos_caso_avisar(d.uid, 'argos_grave', v_titulo, v_msg, '/hr/en-vivo/' || r.user_id, g.id, 'high')
          from (
            select o.user_id as uid from public.tenant_owners o
              join public.tenant_members m on m.tenant_id = o.tenant_id
             where m.user_id = r.user_id
            union
            select j.user_id from public.jefes_directos(r.user_id) j
            union
            select f.user_id from public.con_funcion('N:argos.casos.juzgar', true) f
             where public.puede_vigilar_a(f.user_id, r.user_id)
          ) d
         where d.uid is not null and d.uid <> r.user_id;
        perform public.argos_caso_avisar(r.user_id, 'argos_grave_persona',
          'Argos avisó a tu jefe y a RR. HH.',
          case when r.tipo = 'sin_actividad' then 'Llevas ' || min_txt || ' minutos sin actividad en tu turno.'
               else 'Llevas ' || min_txt || ' minutos fuera de tu trabajo.' end,
          '/cowork', g.id, 'high');
      end if;

      -- 20 minutos sin actividad (19/11/2026): con el corte, se le marca salida.
      if r.tipo = 'sin_actividad' and v_obl and g.abierta_at <= now() - interval '10 minutes'
         and exists (select 1 from public.turno_marcas mk where mk.user_id = r.user_id and mk.fin is null) then
        update public.turno_marcas set fin = now(), cierre = 'sistema' where user_id = r.user_id and fin is null;
        update public.cowork_breaks set ended_at = now() where user_id = r.user_id and ended_at is null;
        update public.argos_graves set cerrada_at = now() where id = g.id;
        perform public.argos_caso_avisar(r.user_id, 'turno_salida_inactividad',
          'Se te marcó salida: 20 minutos sin actividad',
          'Ese rato no se paga. Si sigues trabajando, marca entrada otra vez.', '/', g.id, 'high');
        perform public.argos_caso_avisar(j.user_id, 'turno_salida_inactividad',
          'Salida automática: ' || v_nombre,
          '20 minutos sin tocar nada ni hablar en su turno. Ese rato no se le paga.', '/hr/en-vivo/' || r.user_id, g.id, 'medium')
          from public.jefes_directos(r.user_id) j;
      end if;
    end if;
  end loop;
  return n;
end
$$;
revoke all on function public.argos_vigilar_graves() from public, anon, authenticated;

-- ─── Lo de esta empresa: sus modalidades, los puestos y quién gestiona ───────
-- Para cada empresa con dueño: «1 hora», «30 minutos» y «Sin pausa».
insert into public.pausas_modalidades (tenant_id, nombre, comida_min, bano_min, orden)
select o.tenant_id, v.nombre, v.comida, v.bano, v.orden
  from (select distinct tenant_id from public.tenant_owners) o
  cross join (values ('1 hora', 60, 10, 1), ('30 minutos', 30, 10, 2), ('Sin pausa', 0, 0, 3)) as v(nombre, comida, bano, orden)
on conflict (tenant_id, nombre) do nothing;

do $pos$
declare
  emp uuid := (select tenant_id from public.tenant_owners limit 1);
  m60 uuid; m30 uuid; m0 uuid;
begin
  if to_regclass('public.posiciones_borrador') is null or emp is null then return; end if;
  select id into m60 from public.pausas_modalidades where tenant_id = emp and nombre = '1 hora';
  select id into m30 from public.pausas_modalidades where tenant_id = emp and nombre = '30 minutos';
  select id into m0  from public.pausas_modalidades where tenant_id = emp and nombre = 'Sin pausa';
  -- 30 + 10: chatters, sus supervisores y editores; sin pausa: freelance; los demás, 1 hora.
  update public.posiciones_borrador set modalidad_id = case
           when nombre in ('Chatter', 'Chatter Supervisor', 'Editores de contenido exclusivo') then m30
           when nombre = 'Freelance' then m0
           else m60 end
   where modalidad_id is null;
  -- Coordinador no es una posición: a quien lo tenga como puesto, «30 minutos».
  insert into public.pausas_persona (user_id, modalidad_id, asignado_at)
  select distinct ur.user_id, m30, now() from public.user_roles ur where lower(ur.role) = 'coordinador'
  on conflict (user_id) do nothing;
  -- Las funciones nuevas en los puestos: Admin crea modalidades y gestiona;
  -- RR. HH. (HHRR y Jefe de RR. HH.) gestiona horarios y pausas de su gente.
  update public.posiciones_borrador
     set checks = checks || '{"N:pausas.modalidades": true, "N:horarios.gestionar": true}'::jsonb, updated_at = now()
   where nombre = 'Admin';
  update public.posiciones_borrador
     set checks = checks || '{"N:horarios.gestionar": true}'::jsonb, updated_at = now()
   where nombre in ('HHRR', 'Jefe de RR. HH.');
end $pos$;
