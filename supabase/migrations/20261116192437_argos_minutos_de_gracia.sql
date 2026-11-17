-- MINUTOS DE GRACIA: 15 SIN PANTALLA Y 15 SIN CÁMARA POR TURNO (Alvaro, 16/11/2026).
--
-- «Si determinamos que tiene X minutos sin compartir pantalla y X sin cámara al
--  día... al momento de que se quede sin minutos de gracia, el contador sigue,
--  le dice cuántos minutos se conectó y cuántos le va a pagar... y que le llegue
--  un correo de una vez con el descuento, para que no venga la sorpresita a fin
--  de mes.» Decidido en preguntas (16/11):
--   · 15 min sin pantalla y 15 min sin cámara por turno («mi última oferta»).
--   · Si se le dañó algo (la cámara), RR. HH. le devuelve minutos a mano.
--   · El correo del descuento llega al cerrar el turno a la persona, a su jefe y
--     a RR. HH. Solo si hubo descuento.
--   · El descuento va en minutos; los pesos, cuando Finanzas cargue los sueldos.
--   · Una semana de ensayo: hasta el 22/11 el correo dice «ensayo: no se descuenta».
--
-- Cómo se cuenta (sobre la regla del reloj de Cowork, cuentaComoTrabajo):
--   · trabajo   = activo + meet + sin_conexion (lo que el reloj ya paga).
--   · pausa     = el botón de pausa (comida y baño). Sigue aparte: no gasta gracia
--                 ni descuenta (su regla de 40/70 min sigue igual).
--   · sin pantalla = estado sin_pantalla.
--   · sin cámara   = sin_camara + fuera_de_camara. Si le faltan las dos a la vez
--                 el reloj marca sin_camara: ese minuto se cuenta UNA sola vez.
--   · a pagar   = trabajo + lo sin pantalla hasta su gracia + lo sin cámara hasta su gracia.
--   · descuento = lo que pasó de cada gracia.
--   · conectado = trabajo + pausa + sin pantalla + sin cámara (dentro del turno).
-- Solo cuenta lo que cae dentro del turno (turno_del_dia). Ningún turno cruza la
-- medianoche (revisado el 16/11), así que el turno es el día en que empieza.

-- 1) La regla: cuántos minutos de gracia y hasta cuándo es ensayo.
create table if not exists public.argos_gracia_config (
  id smallint primary key default 1 check (id = 1),
  pantalla_min integer not null default 15 check (pantalla_min between 0 and 480),
  camara_min integer not null default 15 check (camara_min between 0 and 480),
  -- Turnos ANTERIORES a esta fecha son ensayo (el correo dice que no se descuenta).
  -- null = de verdad.
  ensayo_hasta date,
  activo boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.argos_gracia_config (id, pantalla_min, camara_min, ensayo_hasta)
values (1, 15, 15, date '2026-11-23')
on conflict (id) do nothing;
alter table public.argos_gracia_config enable row level security;
create policy argos_gracia_config_sel on public.argos_gracia_config
  for select to authenticated using (true);

-- 2) Los minutos que RR. HH. devuelve a mano (se dañó la cámara, etc.).
create table if not exists public.argos_gracia_extra (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  turno date not null,
  pantalla_min integer not null default 0 check (pantalla_min between 0 and 480),
  camara_min integer not null default 0 check (camara_min between 0 and 480),
  motivo text not null check (length(trim(motivo)) between 3 and 300),
  puesto_por uuid references public.profiles(id) on delete set null,
  tenant_id uuid,
  created_at timestamptz not null default now(),
  check (pantalla_min + camara_min > 0)
);
create index if not exists argos_gracia_extra_user_turno on public.argos_gracia_extra (user_id, turno);
alter table public.argos_gracia_extra enable row level security;
create policy argos_gracia_extra_sel on public.argos_gracia_extra
  for select to authenticated
  using (user_id = (select auth.uid()) or public.puede_vigilar_a((select auth.uid()), user_id));

-- 3) La foto de cada turno cerrado y su correo.
create table if not exists public.argos_gracia_cierre (
  user_id uuid not null references public.profiles(id) on delete cascade,
  turno date not null,
  inicio timestamptz not null,
  fin timestamptz not null,
  conectado_min integer not null,
  trabajo_min integer not null,
  pausa_min integer not null,
  sin_pantalla_min integer not null,
  sin_camara_min integer not null,
  gracia_pantalla_min integer not null,
  gracia_camara_min integer not null,
  descuento_min integer not null,
  a_pagar_min integer not null,
  ensayo boolean not null,
  tenant_id uuid,
  correo_a text[],
  correo_enviado_at timestamptz,
  -- RR. HH. devolvió minutos después del correo: sale un correo de corrección.
  correccion_pendiente boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, turno)
);
alter table public.argos_gracia_cierre enable row level security;
create policy argos_gracia_cierre_sel on public.argos_gracia_cierre
  for select to authenticated
  using (user_id = (select auth.uid()) or public.puede_vigilar_a((select auth.uid()), user_id));

-- 4) ¿A quién se le cuenta? A todos menos dueño, admins y exonerados de cámara y pantalla.
create or replace function public.argos_gracia_aplica(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.profiles p where p.id = _uid and p.deleted_at is null)
     and not public.es_admin_o_dueno(_uid)
     and not coalesce((select h.exento from public.horario_de(_uid) h), false)
     and coalesce((select c.activo from public.argos_gracia_config c where c.id = 1), false);
$$;

-- 5) La cuenta de un turno, hasta un momento (ahora, o el fin del turno).
create or replace function public.argos_gracia_calculo(_uid uuid, _turno date, _hasta timestamptz default now())
returns table (
  inicio timestamptz,
  fin timestamptz,
  conectado_seg integer,
  trabajo_seg integer,
  pausa_seg integer,
  sin_pantalla_seg integer,
  sin_camara_seg integer,
  gracia_pantalla_min integer,
  gracia_camara_min integer,
  extra_pantalla_min integer,
  extra_camara_min integer,
  descuento_seg integer,
  a_pagar_seg integer,
  ensayo boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
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
begin
  select x.inicio, x.fin into v_ini, v_fin from public.turno_del_dia(_uid, _turno) x;
  if v_ini is null then return; end if;
  select c.pantalla_min, c.camara_min, c.ensayo_hasta into v_cfg from public.argos_gracia_config c where c.id = 1;
  if not found then return; end if;
  v_hasta := least(v_fin, coalesce(_hasta, now()));

  if v_hasta > v_ini then
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
  end if;

  select coalesce(sum(e.pantalla_min), 0), coalesce(sum(e.camara_min), 0)
    into v_xp, v_xc
    from public.argos_gracia_extra e
   where e.user_id = _uid and e.turno = _turno;

  v_usado_p := least(v_pant, (v_cfg.pantalla_min + v_xp) * 60);
  v_usado_c := least(v_cam, (v_cfg.camara_min + v_xc) * 60);

  inicio := v_ini;
  fin := v_fin;
  conectado_seg := round(v_trab + v_pausa + v_pant + v_cam)::int;
  trabajo_seg := round(v_trab)::int;
  pausa_seg := round(v_pausa)::int;
  sin_pantalla_seg := round(v_pant)::int;
  sin_camara_seg := round(v_cam)::int;
  gracia_pantalla_min := v_cfg.pantalla_min + v_xp;
  gracia_camara_min := v_cfg.camara_min + v_xc;
  extra_pantalla_min := v_xp;
  extra_camara_min := v_xc;
  descuento_seg := round((v_pant - v_usado_p) + (v_cam - v_usado_c))::int;
  a_pagar_seg := round(v_trab + v_usado_p + v_usado_c)::int;
  ensayo := v_cfg.ensayo_hasta is not null and _turno < v_cfg.ensayo_hasta;
  return next;
end;
$function$;

-- 6) Lo que ve la persona en Cowork: su turno de hoy (el que está en curso, o el de hoy).
create or replace function public.mi_gracia_hoy()
returns table (
  turno date,
  inicio timestamptz,
  fin timestamptz,
  conectado_seg integer,
  trabajo_seg integer,
  pausa_seg integer,
  sin_pantalla_seg integer,
  sin_camara_seg integer,
  gracia_pantalla_min integer,
  gracia_camara_min integer,
  extra_pantalla_min integer,
  extra_camara_min integer,
  descuento_seg integer,
  a_pagar_seg integer,
  ensayo boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_turno date;
begin
  if v_uid is null or not public.argos_gracia_aplica(v_uid) then return; end if;
  select (x.inicio at time zone 'America/Bogota')::date into v_turno from public.turno_en_curso(v_uid, now()) x;
  v_turno := coalesce(v_turno, (now() at time zone 'America/Bogota')::date);
  return query
    select v_turno, c.inicio, c.fin, c.conectado_seg, c.trabajo_seg, c.pausa_seg, c.sin_pantalla_seg,
           c.sin_camara_seg, c.gracia_pantalla_min, c.gracia_camara_min, c.extra_pantalla_min,
           c.extra_camara_min, c.descuento_seg, c.a_pagar_seg, c.ensayo
      from public.argos_gracia_calculo(v_uid, v_turno, now()) c;
end;
$function$;

-- 7) Lo que ve RR. HH. / el jefe en el Expediente: cualquier turno de alguien que puede vigilar.
create or replace function public.argos_gracia_de(_uid uuid, _turno date)
returns table (
  aplica boolean,
  inicio timestamptz,
  fin timestamptz,
  conectado_seg integer,
  trabajo_seg integer,
  pausa_seg integer,
  sin_pantalla_seg integer,
  sin_camara_seg integer,
  gracia_pantalla_min integer,
  gracia_camara_min integer,
  extra_pantalla_min integer,
  extra_camara_min integer,
  descuento_seg integer,
  a_pagar_seg integer,
  ensayo boolean
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_yo uuid := (select auth.uid());
begin
  if v_yo is null or not (v_yo = _uid or public.puede_vigilar_a(v_yo, _uid)) then return; end if;
  if not public.argos_gracia_aplica(_uid) then
    aplica := false;
    return next;
    return;
  end if;
  return query
    select true, c.inicio, c.fin, c.conectado_seg, c.trabajo_seg, c.pausa_seg, c.sin_pantalla_seg,
           c.sin_camara_seg, c.gracia_pantalla_min, c.gracia_camara_min, c.extra_pantalla_min,
           c.extra_camara_min, c.descuento_seg, c.a_pagar_seg, c.ensayo
      from public.argos_gracia_calculo(_uid, _turno, now()) c;
end;
$function$;

-- 8) Quién puede devolver minutos: RR. HH., admins y dueño.
create or replace function public.argos_puede_dar_gracia(_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select _viewer is not null
     and (public.es_admin_o_dueno(_viewer)
          or exists (select 1 from public.equipo_rrhh() h where h.user_id = _viewer));
$$;

create or replace function public.argos_dar_gracia(_uid uuid, _turno date, _pantalla integer, _camara integer, _motivo text)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_yo uuid := (select auth.uid());
  v_id bigint;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
begin
  if not public.argos_puede_dar_gracia(v_yo) or not public.puede_vigilar_a(v_yo, _uid) then
    raise exception 'No tienes permiso para devolver minutos' using errcode = '42501';
  end if;
  if _turno is null or _turno > v_hoy or _turno < v_hoy - 45 then
    raise exception 'Ese día no se puede tocar' using errcode = '22023';
  end if;
  if coalesce(_pantalla, 0) < 0 or coalesce(_camara, 0) < 0
     or coalesce(_pantalla, 0) > 480 or coalesce(_camara, 0) > 480
     or coalesce(_pantalla, 0) + coalesce(_camara, 0) = 0 then
    raise exception 'Minutos no válidos' using errcode = '22023';
  end if;
  if length(trim(coalesce(_motivo, ''))) < 3 then
    raise exception 'Falta el motivo' using errcode = '22023';
  end if;

  insert into public.argos_gracia_extra (user_id, turno, pantalla_min, camara_min, motivo, puesto_por, tenant_id)
  values (_uid, _turno, coalesce(_pantalla, 0), coalesce(_camara, 0), trim(_motivo), v_yo,
          (select m.tenant_id from public.tenant_members m where m.user_id = _uid limit 1))
  returning id into v_id;

  -- Si el turno ya se cerró, se vuelve a contar (y si ya salió el correo, sale la corrección).
  update public.argos_gracia_cierre
     set correccion_pendiente = true, updated_at = now()
   where user_id = _uid and turno = _turno;

  return v_id;
end;
$function$;

-- 9) A quién le llega el correo además de la persona: su jefe y RR. HH.
--    Si la persona ES jefe, solo RR. HH.
create or replace function public.argos_gracia_destinatarios(_target uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  with t as (
    select (select m.tenant_id from public.tenant_members m where m.user_id = _target limit 1) as tenant_id,
           public.equipo_de(_target) as equipo,
           (coalesce((select p.nivel from public.profiles p where p.id = _target) in ('supervisor', 'manager', 'admin', 'dueno'), false)
             or exists (select 1 from public.equipos_a_cargo e where e.user_id = _target)) as es_jefe
  ),
  miembros as (
    select p.id
      from public.profiles p
      join public.tenant_members m on m.user_id = p.id
      join t on m.tenant_id = t.tenant_id
     where p.deleted_at is null
  )
  select distinct d.uid
    from (
      select h.user_id as uid from public.equipo_rrhh() h, t where h.tenant_id = t.tenant_id
      union
      select s.id from public.profiles s, t
       where not t.es_jefe
         and s.nivel = 'supervisor' and s.id in (select id from miembros)
         and t.equipo <> 'Otros' and public.equipo_de(s.id) = t.equipo
      union
      select e.user_id from public.equipos_a_cargo e, t
       where not t.es_jefe
         and e.equipo = t.equipo and e.user_id in (select id from miembros)
    ) d
   where d.uid is not null and d.uid <> _target;
$$;

-- 10) Para el correo (lo llama la edge detectar-tardanzas, cada 2 min, con la llave de servicio):
--     cierra los turnos que terminaron hace 10 min o más (hasta 24 h), recalcula
--     los que RR. HH. tocó y devuelve los correos que hay que mandar.
create or replace function public.argos_gracia_por_correo()
returns table (
  user_id uuid,
  turno date,
  nombre text,
  rol text,
  inicio timestamptz,
  fin timestamptz,
  conectado_min integer,
  trabajo_min integer,
  pausa_min integer,
  sin_pantalla_min integer,
  sin_camara_min integer,
  gracia_pantalla_min integer,
  gracia_camara_min integer,
  extra_pantalla_min integer,
  extra_camara_min integer,
  descuento_min integer,
  a_pagar_min integer,
  ensayo boolean,
  es_correccion boolean,
  motivos text,
  destinatarios uuid[]
)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  r record;
  c record;
  v_ahora timestamptz := now();
  v_dia date := (now() at time zone 'America/Bogota')::date;
begin
  -- 10a) Turnos recién cerrados (hoy o ayer), de quien se conectó.
  for r in
    select p.id as uid, x.inicio as ini, x.fin as fn, d.dia
      from public.profiles p
      cross join (select v_dia as dia union all select v_dia - 1) d
      cross join lateral public.turno_del_dia(p.id, d.dia) x
     where p.deleted_at is null
       and x.fin <= v_ahora - interval '10 minutes'
       and x.fin > v_ahora - interval '24 hours'
       and not exists (select 1 from public.argos_gracia_cierre g where g.user_id = p.id and g.turno = d.dia)
       and public.argos_gracia_aplica(p.id)
  loop
    select * into c from public.argos_gracia_calculo(r.uid, r.dia, r.fn);
    continue when not found or c.conectado_seg <= 0;
    insert into public.argos_gracia_cierre as g
      (user_id, turno, inicio, fin, conectado_min, trabajo_min, pausa_min, sin_pantalla_min, sin_camara_min,
       gracia_pantalla_min, gracia_camara_min, descuento_min, a_pagar_min, ensayo, tenant_id)
    values (r.uid, r.dia, c.inicio, c.fin, round(c.conectado_seg / 60.0), round(c.trabajo_seg / 60.0),
            round(c.pausa_seg / 60.0), round(c.sin_pantalla_seg / 60.0), round(c.sin_camara_seg / 60.0),
            c.gracia_pantalla_min, c.gracia_camara_min, round(c.descuento_seg / 60.0), round(c.a_pagar_seg / 60.0),
            c.ensayo, (select m.tenant_id from public.tenant_members m where m.user_id = r.uid limit 1))
    on conflict do nothing;
  end loop;

  -- 10b) Los que RR. HH. tocó: se vuelven a contar. Si el correo no había salido,
  --      no hay corrección: es la cuenta normal.
  for r in select g.user_id as uid, g.turno as dia, g.fin as fn from public.argos_gracia_cierre g where g.correccion_pendiente loop
    select * into c from public.argos_gracia_calculo(r.uid, r.dia, r.fn);
    continue when not found;
    update public.argos_gracia_cierre g
       set conectado_min = round(c.conectado_seg / 60.0), trabajo_min = round(c.trabajo_seg / 60.0),
           pausa_min = round(c.pausa_seg / 60.0), sin_pantalla_min = round(c.sin_pantalla_seg / 60.0),
           sin_camara_min = round(c.sin_camara_seg / 60.0), gracia_pantalla_min = c.gracia_pantalla_min,
           gracia_camara_min = c.gracia_camara_min, descuento_min = round(c.descuento_seg / 60.0),
           a_pagar_min = round(c.a_pagar_seg / 60.0), updated_at = now(),
           correccion_pendiente = g.correo_enviado_at is not null
     where g.user_id = r.uid and g.turno = r.dia;
  end loop;

  -- 10c) Lo que hay que mandar: descuento sin avisar, o corrección.
  return query
    select g.user_id, g.turno, coalesce(nullif(trim(p.full_name), ''), '—'),
           (select ur.role from public.user_roles ur where ur.user_id = g.user_id limit 1),
           g.inicio, g.fin, g.conectado_min, g.trabajo_min, g.pausa_min, g.sin_pantalla_min, g.sin_camara_min,
           g.gracia_pantalla_min, g.gracia_camara_min,
           coalesce((select sum(e.pantalla_min) from public.argos_gracia_extra e where e.user_id = g.user_id and e.turno = g.turno), 0)::int,
           coalesce((select sum(e.camara_min) from public.argos_gracia_extra e where e.user_id = g.user_id and e.turno = g.turno), 0)::int,
           g.descuento_min, g.a_pagar_min, g.ensayo,
           g.correo_enviado_at is not null,
           (select string_agg(trim(e.motivo), ' · ' order by e.created_at) from public.argos_gracia_extra e where e.user_id = g.user_id and e.turno = g.turno),
           coalesce((select array_agg(d.user_id) from public.argos_gracia_destinatarios(g.user_id) d), '{}'::uuid[])
      from public.argos_gracia_cierre g
      join public.profiles p on p.id = g.user_id
     where (g.correo_enviado_at is null and g.descuento_min > 0)
        or g.correccion_pendiente
     order by g.turno, p.full_name
     limit 200;
end;
$function$;

create or replace function public.argos_gracia_marcar_correo(_uid uuid, _turno date, _correo_a text[])
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.argos_gracia_cierre
     set correo_enviado_at = now(), correo_a = _correo_a, correccion_pendiente = false, updated_at = now()
   where user_id = _uid and turno = _turno;
$$;

-- 11) Permisos: la persona y sus jefes leen; el cálculo crudo y el correo solo el servidor.
revoke all on function public.argos_gracia_aplica(uuid) from public, anon, authenticated;
revoke all on function public.argos_gracia_calculo(uuid, date, timestamptz) from public, anon, authenticated;
revoke all on function public.argos_gracia_destinatarios(uuid) from public, anon, authenticated;
revoke all on function public.argos_gracia_por_correo() from public, anon, authenticated;
revoke all on function public.argos_gracia_marcar_correo(uuid, date, text[]) from public, anon, authenticated;
revoke all on function public.mi_gracia_hoy() from public, anon;
revoke all on function public.argos_gracia_de(uuid, date) from public, anon;
revoke all on function public.argos_puede_dar_gracia(uuid) from public, anon;
revoke all on function public.argos_dar_gracia(uuid, date, integer, integer, text) from public, anon;
grant execute on function public.mi_gracia_hoy() to authenticated;
grant execute on function public.argos_gracia_de(uuid, date) to authenticated;
grant execute on function public.argos_puede_dar_gracia(uuid) to authenticated;
grant execute on function public.argos_dar_gracia(uuid, date, integer, integer, text) to authenticated;
grant execute on function public.argos_gracia_por_correo() to service_role;
grant execute on function public.argos_gracia_marcar_correo(uuid, date, text[]) to service_role;
grant execute on function public.argos_gracia_calculo(uuid, date, timestamptz) to service_role;
