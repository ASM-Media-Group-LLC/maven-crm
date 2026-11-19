-- MARCAR ENTRADA / PAUSA / SALIDA (Alvaro, 18 y 19/11/2026, preguntas y respuestas):
-- «vemos la pantalla cuando están trabajando y ya». Desde el 20/11/2026 00:00
-- (Bogotá) es obligatorio:
--   · Sin «Marcar entrada» no hay fotos, cámara, llamados de Argos, ni obligación
--     de estar en Cowork, ni horas.
--   · Se puede marcar desde 15 min antes de la entrada; las horas cuentan desde la
--     hora de entrada. Después de la salida puede seguir, pero no se paga.
--   · Pausa (baño/comida) = cowork_breaks; se paga hasta su cupo (comida + baño).
--   · Tarde, pausa de más o salir antes se descuenta; lo de más no se paga.
-- Todo pasa por en_turno(uid): antes de la fecha de corte devuelve true (Maven
-- sigue como hoy); desde la fecha, solo con la entrada marcada.

alter table public.monitor_config add column if not exists turno_obligatorio_desde timestamptz;
update public.monitor_config set turno_obligatorio_desde = '2026-11-20 05:00:00+00' where id = 1 and turno_obligatorio_desde is null;

create table if not exists public.turno_marcas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  inicio timestamptz not null default now(),
  fin timestamptz,
  cierre text check (cierre in ('manual', 'olvido', 'sistema')),
  sigue_hasta timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists turno_marcas_una_abierta on public.turno_marcas (user_id) where fin is null;
create index if not exists turno_marcas_persona on public.turno_marcas (user_id, inicio desc);
alter table public.turno_marcas enable row level security;
create policy turno_marcas_ver on public.turno_marcas for select to authenticated
  using (user_id = (select auth.uid()) or public.puede_vigilar(user_id));

create table if not exists public.turno_terminos (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  version integer not null,
  aceptado_at timestamptz not null default now()
);
alter table public.turno_terminos enable row level security;
create policy turno_terminos_ver on public.turno_terminos for select to authenticated
  using (user_id = (select auth.uid()) or public.puede_vigilar(user_id));

-- Avisos ya mandados (para no repetir): «empieza en 5 min», «no marcó entrada».
create table if not exists public.turno_avisos (
  user_id uuid not null references public.profiles(id) on delete cascade,
  turno_inicio timestamptz not null,
  tipo text not null,
  creado timestamptz not null default now(),
  primary key (user_id, turno_inicio, tipo)
);
alter table public.turno_avisos enable row level security;

-- ¿Ya rige la regla?
create or replace function public.turno_obligatorio()
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select now() >= coalesce((select c.turno_obligatorio_desde from public.monitor_config c where c.id = 1), 'infinity'::timestamptz);
$function$;

-- ¿Se le puede mirar / contar ahora? Antes de la fecha de corte, siempre (como hoy).
create or replace function public.en_turno(_uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select not public.turno_obligatorio()
      or exists (select 1 from public.turno_marcas m where m.user_id = _uid and m.fin is null);
$function$;
grant execute on function public.turno_obligatorio() to authenticated;
grant execute on function public.en_turno(uuid) to authenticated;

-- El turno que le toca ahora: el que está en curso o el próximo (hoy o mañana).
create or replace function public.turno_que_toca(_uid uuid, _ahora timestamptz default now())
returns table (inicio timestamptz, fin timestamptz)
language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_dia date := (_ahora at time zone 'America/Bogota')::date;
  d int;
  t record;
begin
  foreach d in array array[-1, 0, 1] loop
    select x.inicio as i, x.fin as f into t from public.turno_del_dia(_uid, v_dia + d) x;
    if found and t.f > _ahora then
      inicio := t.i; fin := t.f;
      return next;
      return;
    end if;
  end loop;
end;
$function$;

-- Versión vigente de las reglas de monitoreo.
create or replace function public.turno_terminos_version() returns integer language sql immutable as $$ select 1 $$;

-- Lo que la tarjeta del menú necesita saber.
create or replace function public.mi_turno()
returns table (
  aplica boolean,
  obligatorio boolean,
  obligatorio_desde timestamptz,
  abierta boolean,
  marca_inicio timestamptz,
  sigue_hasta timestamptz,
  turno_inicio timestamptz,
  turno_fin timestamptz,
  puede_desde timestamptz,
  puede boolean,
  horario_confirmado boolean,
  terminos_ok boolean,
  en_pausa boolean,
  pausa_desde timestamptz,
  pausa_kind text,
  pausa_usada_seg integer,
  cupo_seg integer
)
language plpgsql stable security definer set search_path to 'public' as $function$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_t record;
  v_m record;
  v_b record;
begin
  if v_uid is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  select x.inicio, x.fin into v_t from public.turno_que_toca(v_uid, now()) x;
  select m.inicio, m.sigue_hasta into v_m from public.turno_marcas m where m.user_id = v_uid and m.fin is null;
  select b.started_at, b.kind into v_b from public.cowork_breaks b
   where b.user_id = v_uid and b.ended_at is null and b.started_at > now() - interval '12 hours'
   order by b.started_at desc limit 1;

  aplica := not public.es_admin_o_dueno(v_uid)
            and not coalesce((select h.exento from public.horario_de(v_uid) h), false);
  obligatorio := public.turno_obligatorio();
  obligatorio_desde := (select c.turno_obligatorio_desde from public.monitor_config c where c.id = 1);
  abierta := v_m.inicio is not null;
  marca_inicio := v_m.inicio;
  sigue_hasta := v_m.sigue_hasta;
  turno_inicio := v_t.inicio;
  turno_fin := v_t.fin;
  puede_desde := v_t.inicio - interval '15 minutes';
  puede := v_t.inicio is null or (now() >= v_t.inicio - interval '15 minutes' and now() < v_t.fin);
  horario_confirmado := exists (select 1 from public.horario_confirmado hc where hc.user_id = v_uid);
  terminos_ok := exists (select 1 from public.turno_terminos tt where tt.user_id = v_uid and tt.version >= public.turno_terminos_version());
  en_pausa := v_b.started_at is not null;
  pausa_desde := v_b.started_at;
  pausa_kind := v_b.kind;
  pausa_usada_seg := coalesce((
    select sum(extract(epoch from (coalesce(b.ended_at, now()) - greatest(b.started_at, v_t.inicio))))::int
      from public.cowork_breaks b
     where b.user_id = v_uid and v_t.inicio is not null
       and coalesce(b.ended_at, now()) > v_t.inicio and b.started_at < v_t.fin), 0);
  cupo_seg := coalesce(public.argos_permitido_min(v_uid), 40) * 60;
  return next;
end;
$function$;
grant execute on function public.mi_turno() to authenticated;

create or replace function public.turno_aceptar_terminos(_version integer)
returns void language plpgsql volatile security definer set search_path to 'public' as $function$
begin
  if (select auth.uid()) is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  insert into public.turno_terminos (user_id, version, aceptado_at)
  values ((select auth.uid()), _version, now())
  on conflict (user_id) do update set version = greatest(public.turno_terminos.version, excluded.version), aceptado_at = now();
end;
$function$;
grant execute on function public.turno_aceptar_terminos(integer) to authenticated;

create or replace function public.turno_entrar()
returns void language plpgsql volatile security definer set search_path to 'public' as $function$
declare
  v_uid uuid := (select auth.uid());
  v_t record;
begin
  if v_uid is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  if exists (select 1 from public.turno_marcas m where m.user_id = v_uid and m.fin is null) then return; end if;
  if not exists (select 1 from public.turno_terminos tt where tt.user_id = v_uid and tt.version >= public.turno_terminos_version()) then
    raise exception 'turno_entrar: primero acepta las reglas de monitoreo' using errcode = 'P0001';
  end if;
  select x.inicio, x.fin into v_t from public.turno_que_toca(v_uid, now()) x;
  if v_t.inicio is not null and now() < v_t.inicio - interval '15 minutes' then
    raise exception 'turno_entrar: todavía no es tu hora (desde las %)', to_char((v_t.inicio - interval '15 minutes') at time zone 'America/Bogota', 'HH12:MI AM')
      using errcode = 'P0001';
  end if;
  insert into public.turno_marcas (user_id, inicio) values (v_uid, now());
end;
$function$;
grant execute on function public.turno_entrar() to authenticated;

create or replace function public.turno_salir(_cierre text default 'manual')
returns void language plpgsql volatile security definer set search_path to 'public' as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  update public.turno_marcas set fin = now(), cierre = case when _cierre in ('manual', 'olvido') then _cierre else 'manual' end
   where user_id = v_uid and fin is null;
  -- Si estaba en pausa, la pausa también se cierra.
  update public.cowork_breaks set ended_at = now()
   where user_id = v_uid and ended_at is null;
end;
$function$;
grant execute on function public.turno_salir(text) to authenticated;

create or replace function public.turno_sigo()
returns void language sql volatile security definer set search_path to 'public' as $function$
  update public.turno_marcas set sigue_hasta = now() + interval '30 minutes'
   where user_id = (select auth.uid()) and fin is null;
$function$;
grant execute on function public.turno_sigo() to authenticated;

-- ── Candados (solo muerden desde la fecha de corte, por en_turno) ─────────────
alter policy monitor_capturas_ins_propio on public.monitor_capturas
  with check (user_id = (select auth.uid()) and public.en_turno(user_id));
alter policy monitor_eventos_insert_propio on public.monitor_eventos
  with check (user_id = (select auth.uid()) and fuente = 'local' and public.en_turno(user_id));
alter policy argos_clips_ins_propio on public.argos_clips
  with check (user_id = (select auth.uid()) and public.en_turno(user_id));
alter policy argos_uso_apps_ins_propio on public.argos_uso_apps
  with check (user_id = (select auth.uid()) and public.en_turno(user_id));

-- Cowork obligatorio solo en turno (antes obligaba las 24 horas).
create or replace function public.mi_cowork_estado()
returns table (debe boolean, presente boolean)
language sql stable security definer set search_path to 'public' as $function$
  select public.debe_estar_en_cowork((select auth.uid())) and public.en_turno((select auth.uid())),
         public.presente_en_cowork((select auth.uid()), now());
$function$;

-- Pago desde la fecha de corte: solo lo marcado y dentro del horario; la pausa se
-- paga hasta su cupo (comida + baño) y lo de más se descuenta.
create or replace function public.argos_gracia_calculo(_uid uuid, _turno date, _hasta timestamp with time zone default now())
returns table(inicio timestamp with time zone, fin timestamp with time zone, conectado_seg integer, trabajo_seg integer, pausa_seg integer, sin_pantalla_seg integer, sin_camara_seg integer, gracia_pantalla_min integer, gracia_camara_min integer, extra_pantalla_min integer, extra_camara_min integer, descuento_seg integer, a_pagar_seg integer, ensayo boolean)
language plpgsql stable security definer set search_path to 'public' as $function$
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
    -- Solo el tiempo con la entrada marcada (cruce segmento × marca × horario).
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
    v_pausa_pag := least(v_pausa, coalesce(public.argos_permitido_min(_uid), 40) * 60);
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
  descuento_seg := round((v_pant - v_usado_p) + (v_cam - v_usado_c) + (case when v_obl then v_pausa - v_pausa_pag else 0 end))::int;
  a_pagar_seg := round(v_trab + v_usado_p + v_usado_c + v_pausa_pag)::int;
  ensayo := v_cfg.ensayo_hasta is not null and _turno < v_cfg.ensayo_hasta;
  return next;
end;
$function$;

-- ── Vigías existentes: desde la fecha de corte, solo con la entrada marcada ───
do $$
declare
  f text;
  g text;
begin
  -- vigilar_fuera_de_cowork
  f := pg_get_functiondef('public.vigilar_fuera_de_cowork'::regproc);
  g := f;
  -- 1) Marcó salida → se cierra su «fuera de Cowork».
  g := replace(g, 'elsif not exists (select 1 from public.turno_en_curso(r.user_id, v_ahora)) then',
                  'elsif not exists (select 1 from public.turno_en_curso(r.user_id, v_ahora)) or not public.en_turno(r.user_id) then');
  -- 2) Solo se abre «fuera de Cowork» a quien está en turno (primer debe_estar_en_cowork).
  g := regexp_replace(g, 'and public\.debe_estar_en_cowork\(p\.id\)', 'and public.debe_estar_en_cowork(p.id) and public.en_turno(p.id)');
  -- 4) «No entró»: desde la fecha de corte es «no marcó entrada».
  g := regexp_replace(g,
         'and not exists \(select 1 from public\.cowork_tiempo_segmentos s\s+where s\.user_id = p\.id and coalesce\(s\.ended_at, s\.last_seen_at\) >= t\.inicio - interval ''30 minutes''\)',
         'and (case when public.turno_obligatorio() then not exists (select 1 from public.turno_marcas mk where mk.user_id = p.id and coalesce(mk.fin, v_ahora) >= t.inicio - interval ''15 minutes'') else not exists (select 1 from public.cowork_tiempo_segmentos s where s.user_id = p.id and coalesce(s.ended_at, s.last_seen_at) >= t.inicio - interval ''30 minutes'') end)');
  g := regexp_replace(g, 'continue when public\.presente_en_cowork\(r\.uid, v_ahora\);(\s+)v_turno :=',
                         'continue when not public.turno_obligatorio() and public.presente_en_cowork(r.uid, v_ahora);\1v_turno :=');
  g := replace(g, '''Te estoy reportando: no has entrado a Cowork''',
                  'case when public.turno_obligatorio() then ''Te estoy reportando: no has marcado entrada'' else ''Te estoy reportando: no has entrado a Cowork'' end');
  g := replace(g, '''Ya empezó tu turno y no has entrado a Cowork''',
                  'case when public.turno_obligatorio() then ''Ya empezó tu turno y no has marcado entrada'' else ''Ya empezó tu turno y no has entrado a Cowork'' end');
  g := replace(g, 'format(''Tu turno empezó a las %s. Ya le avisé a tu supervisor. Entra a Cowork ya, con cámara y pantalla.''',
                  'format(case when public.turno_obligatorio() then ''Tu turno empezó a las %s. Ya le avisé a tu supervisor. Marca entrada ya en el menú de Maven.'' else ''Tu turno empezó a las %s. Ya le avisé a tu supervisor. Entra a Cowork ya, con cámara y pantalla.'' end');
  g := replace(g, 'format(''Tu turno empezó a las %s. Entra a Cowork ya, con cámara y pantalla completa.''',
                  'format(case when public.turno_obligatorio() then ''Tu turno empezó a las %s. Marca entrada en el menú de Maven.'' else ''Tu turno empezó a las %s. Entra a Cowork ya, con cámara y pantalla completa.'' end');
  g := replace(g, 'format(''%s no ha entrado a Cowork'', v_nom)',
                  'format(case when public.turno_obligatorio() then ''%s no ha marcado entrada'' else ''%s no ha entrado a Cowork'' end, v_nom)');
  if g = f or position('public.en_turno(r.user_id)' in g) = 0 or position('turno_marcas mk' in g) = 0
     or position('no has marcado entrada' in g) = 0 then
    raise exception 'turno: no se pudo ajustar vigilar_fuera_de_cowork (cambió el texto en producción)';
  end if;
  execute g;

  -- vigilar_tiempo_sin_pantalla: el aviso al momento, solo a quien está en turno.
  f := pg_get_functiondef('public.vigilar_tiempo_sin_pantalla'::regproc);
  g := regexp_replace(f, 'and public\.debe_estar_en_cowork\(p\.id\)', 'and public.debe_estar_en_cowork(p.id) and public.en_turno(p.id)');
  if g = f then
    raise exception 'turno: no se pudo ajustar vigilar_tiempo_sin_pantalla (cambió el texto en producción)';
  end if;
  execute g;
end $$;

-- ── Vigía de las marcas (cada minuto) ─────────────────────────────────────────
--   · 5 min antes de su entrada: «tu turno empieza en 5 min» (a la persona).
--   · Salida olvidada: 35 min después de su salida, si no dijo «sigo», se cierra.
-- («No marcó entrada» lo avisa vigilar_fuera_de_cowork, con sus 3 llamados y el
--  reporte a sus jefes.)
create or replace function public.vigilar_marcas()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare
  r record;
  v_ahora timestamptz := now();
  v_n int := 0;
begin
  if not public.turno_obligatorio() and v_ahora < coalesce((select c.turno_obligatorio_desde from public.monitor_config c where c.id = 1), 'infinity'::timestamptz) - interval '10 minutes' then
    return 0;
  end if;

  -- 5 min antes
  for r in
    select p.id as uid, t.inicio
      from public.profiles p
      cross join lateral public.turno_que_toca(p.id, v_ahora) t
     where p.deleted_at is null
       and not public.es_admin_o_dueno(p.id)
       and not coalesce((select h.exento from public.horario_de(p.id) h), false)
       and t.inicio > v_ahora and t.inicio <= v_ahora + interval '5 minutes'
       and not exists (select 1 from public.turno_marcas m where m.user_id = p.id and m.fin is null)
       and not exists (select 1 from public.turno_avisos a where a.user_id = p.id and a.turno_inicio = t.inicio and a.tipo = 'empieza')
  loop
    insert into public.turno_avisos (user_id, turno_inicio, tipo) values (r.uid, r.inicio, 'empieza') on conflict do nothing;
    insert into public.notifications
      (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    values (r.uid, 'turno_empieza', 'Tu turno empieza en 5 minutos',
            format('Entras a las %s. Marca entrada en el menú de Maven.', to_char(r.inicio at time zone 'America/Bogota', 'HH12:MI AM')),
            'turno', 'Cowork', 'high', 'new', 'personal', '/');
    v_n := v_n + 1;
  end loop;

  -- Salida olvidada
  for r in
    select m.id, m.user_id, t.fin
      from public.turno_marcas m
      cross join lateral (
        select x.fin from public.turno_del_dia(m.user_id, (m.inicio at time zone 'America/Bogota')::date) x
        union all
        select x.fin from public.turno_del_dia(m.user_id, (m.inicio at time zone 'America/Bogota')::date - 1) x
      ) t
     where m.fin is null
       and t.fin > m.inicio - interval '15 minutes'
       and v_ahora >= t.fin + interval '35 minutes'
       and (m.sigue_hasta is null or m.sigue_hasta < v_ahora)
  loop
    update public.turno_marcas set fin = v_ahora, cierre = 'olvido' where id = r.id and fin is null;
    update public.cowork_breaks set ended_at = v_ahora
     where user_id = r.user_id and ended_at is null;
    v_n := v_n + 1;
  end loop;

  -- Sin horario no hay hora de salida: a las 16 h abierta se cierra sola.
  update public.turno_marcas set fin = v_ahora, cierre = 'olvido'
   where fin is null and inicio < v_ahora - interval '16 hours';
  return v_n;
end;
$function$;

select cron.schedule('vigia-marcas-de-turno', '* * * * *', $$ select public.vigilar_marcas(); $$);
