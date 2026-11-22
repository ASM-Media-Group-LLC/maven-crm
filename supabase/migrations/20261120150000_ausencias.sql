-- AUSENCIAS, CALENDARIO DE ASISTENCIA Y PERMISOS ESPECIALES (Alvaro, 20/11/2026).
--
-- 1) AUSENCIAS: Vacaciones, Permiso, Incapacidad médica (con adjunto privado) y
--    Día libre / compensatorio. La persona PIDE en Maven → su jefe aprueba o
--    rechaza → RR. HH. da la aprobación final y dice si es pagada o no (las
--    vacaciones vienen pagadas). RR. HH. también puede registrar una ya aprobada
--    (una incapacidad, por ejemplo). Mientras está pendiente, la persona la cancela.
--
-- 2) DE LA EMPRESA (Ajustes → Empresa, nunca por persona): el aviso mínimo por
--    tipo (la incapacidad no lo pide) y la política de vacaciones (días por año,
--    se acumulan desde la fecha de ingreso). Los festivos los carga RR. HH. a mano.
--
-- 3) QUIÉN: todo por PUESTO (Posiciones) + permisos especiales por persona.
--      · «Aprobar ausencias de su equipo»  → N:ausencias.aprobar_equipo
--      · «Aprobación final de ausencias»   → N:ausencias.aprobar_final
--      · Ver el calendario de otros         → el alcance de datos de la fila
--        «Ausencias» del puesto (todos / su equipo / solo lo suyo).
--      El dueño siempre puede. Encima del puesto, un permiso especial
--      (permisos_extra) suma una función o un alcance a UNA persona, con quién y
--      cuándo, y se revoca. tiene_funcion() ya lo mira: sirve para todo Maven.
--
-- 4) DURANTE UNA AUSENCIA APROBADA NADA MOLESTA: todo lo que exige horario pasa
--    por turno_del_dia / turno_en_curso / en_turno / horario_de /
--    debe_estar_en_cowork / argos_vigila_a. Aquí cada uno consulta dia_libre()
--    (ausencia de día completo o festivo) o ausente_ahora() (también la parcial):
--    no hay turno ese día → no hay tardanza, no se pide Marcar entrada, no se
--    exige Cowork, Argos no mira ni gasta, no hay llamados de horario.
--
-- 5) MOTIVO Y ADJUNTO SOLO RR. HH.: la tabla solo la leen la persona y quien da la
--    aprobación final; los jefes y el calendario van por RPC sin motivo ni adjunto;
--    los compañeros solo ven «Ausente» o «De vacaciones».

set check_function_bodies = off;

-- ─── Tablas ──────────────────────────────────────────────────────────────────

alter table public.profiles add column if not exists fecha_ingreso date;
comment on column public.profiles.fecha_ingreso is
  'Fecha de ingreso a la empresa (de aquí se acumulan las vacaciones). La pone RR. HH. con ausencias_fecha_ingreso_guardar.';

create table if not exists public.ausencias_politica (
  tenant_id uuid primary key,
  vacaciones_dias_anio numeric(5,2) not null default 15 check (vacaciones_dias_anio between 0 and 60),
  -- Días de anticipación mínimos por tipo; la incapacidad nunca lo pide.
  aviso_vacaciones_dias integer not null default 15 check (aviso_vacaciones_dias between 0 and 120),
  aviso_permiso_dias integer not null default 2 check (aviso_permiso_dias between 0 and 120),
  aviso_dia_libre_dias integer not null default 2 check (aviso_dia_libre_dias between 0 and 120),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on table public.ausencias_politica is
  'Política de ausencias de cada empresa (Ajustes → Empresa): vacaciones por año y aviso mínimo por tipo.';

create table if not exists public.ausencias_festivos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  fecha date not null,
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, fecha)
);

create table if not exists public.ausencias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('vacaciones', 'permiso', 'incapacidad', 'dia_libre')),
  desde date not null,
  hasta date not null,
  -- Día parcial: solo con desde = hasta (y nunca vacaciones).
  hora_desde time,
  hora_hasta time,
  dias numeric(6,2) not null default 0,
  motivo text check (motivo is null or length(motivo) <= 1000),
  adjunto_path text,
  estado text not null default 'pendiente_jefe'
    check (estado in ('pendiente_jefe', 'pendiente_rrhh', 'aprobada', 'rechazada', 'cancelada')),
  pagada boolean,
  directa boolean not null default false,
  jefe_por uuid references public.profiles(id) on delete set null,
  jefe_at timestamptz,
  jefe_nota text check (jefe_nota is null or length(jefe_nota) <= 500),
  rrhh_por uuid references public.profiles(id) on delete set null,
  rrhh_at timestamptz,
  rechazo_motivo text check (rechazo_motivo is null or length(rechazo_motivo) <= 500),
  rechazada_por uuid references public.profiles(id) on delete set null,
  creada_por uuid references public.profiles(id) on delete set null,
  recordado_at timestamptz,
  regreso_avisado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hasta >= desde),
  check ((hora_desde is null and hora_hasta is null)
         or (hora_desde is not null and hora_hasta is not null and hora_hasta > hora_desde and desde = hasta and tipo <> 'vacaciones'))
);
create index if not exists ausencias_user_fechas_idx on public.ausencias (user_id, desde, hasta);
create index if not exists ausencias_tenant_fechas_idx on public.ausencias (tenant_id, desde, hasta);
create index if not exists ausencias_pendientes_idx on public.ausencias (estado) where estado in ('pendiente_jefe', 'pendiente_rrhh');

-- PERMISOS ESPECIALES (genérico, para todo Maven): una función del catálogo de
-- Posiciones («N:…» o «Modulo|Sub») y/o un alcance de datos para una fila, dados
-- a UNA persona encima de su puesto. Con auditoría: quién, cuándo, por qué y
-- quién lo revocó. No se borran: se revocan.
create table if not exists public.permisos_extra (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  clave text check (clave is null or clave ~ '^(N:[a-z0-9_.]+|[^|]+\|[^|]+)$'),
  fila text check (fila is null or length(btrim(fila)) between 1 and 80),
  alcance text check (alcance is null or alcance in ('all', 'subordinates', 'self')),
  motivo text check (motivo is null or length(motivo) <= 300),
  otorgado_por uuid references public.profiles(id) on delete set null,
  otorgado_at timestamptz not null default now(),
  revocado_por uuid references public.profiles(id) on delete set null,
  revocado_at timestamptz,
  check (clave is not null or (fila is not null and alcance is not null)),
  check ((fila is null) = (alcance is null))
);
create index if not exists permisos_extra_vivos_idx on public.permisos_extra (user_id) where revocado_at is null;
comment on table public.permisos_extra is
  'Permisos especiales por persona encima del puesto (función y/o alcance de una fila). Auditados; se revocan, no se borran. Los lee tiene_funcion() y alcance_fila().';

alter table public.ausencias_politica enable row level security;
alter table public.ausencias_festivos enable row level security;
alter table public.ausencias enable row level security;
alter table public.permisos_extra enable row level security;

-- ─── Ayudantes de identidad ──────────────────────────────────────────────────

create or replace function public.uuid_o_null(_t text)
returns uuid
language plpgsql
immutable
as $$
begin
  return _t::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.misma_empresa(_a uuid, _b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _a is not null and _b is not null and exists (
    select 1 from public.tenant_members a
      join public.tenant_members b on b.tenant_id = a.tenant_id
     where a.user_id = _a and b.user_id = _b);
$$;
revoke all on function public.misma_empresa(uuid, uuid) from public, anon;
grant execute on function public.misma_empresa(uuid, uuid) to authenticated, service_role;

-- tiene_funcion: el puesto (como antes) O un permiso especial vivo de esa clave.
create or replace function public.tiene_funcion(_uid uuid, _clave text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _uid is not null
     and not coalesce((select m.deshabilitada from public.personas_borrador_marcas m where m.user_id = _uid), false)
     and (
       public.es_dueno(_uid)
       or exists (
         select 1
           from public.posiciones_borrador_personas pp
           join public.posiciones_borrador pb on pb.id = pp.posicion_id
          where pp.user_id = _uid and pb.activa
            and (pb.acceso_total or coalesce((pb.checks ->> _clave)::boolean, false))
       )
       or exists (
         select 1 from public.permisos_extra pe
          where pe.user_id = _uid and pe.clave = _clave and pe.revocado_at is null
       )
     );
$$;

-- El alcance de datos de una fila del catálogo para alguien: el mayor entre sus
-- puestos y sus permisos especiales. Sin nada dicho en la fila, «solo lo suyo».
create or replace function public.alcance_fila(_uid uuid, _fila text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when _uid is null then null
    when coalesce((select m.deshabilitada from public.personas_borrador_marcas m where m.user_id = _uid), false) then null
    when public.es_dueno(_uid) then 'all'
    else (
      select case max(x.r) when 3 then 'all' when 2 then 'subordinates' else 'self' end
        from (
          select case when pb.acceso_total then 3
                      else case pb.alcances ->> _fila when 'all' then 3 when 'subordinates' then 2 else 1 end end as r
            from public.posiciones_borrador_personas pp
            join public.posiciones_borrador pb on pb.id = pp.posicion_id
           where pp.user_id = _uid and pb.activa
          union all
          select case pe.alcance when 'all' then 3 when 'subordinates' then 2 else 1 end
            from public.permisos_extra pe
           where pe.user_id = _uid and pe.revocado_at is null and pe.fila = _fila
          union all
          select 1
        ) x)
  end;
$$;
revoke all on function public.alcance_fila(uuid, text) from public, anon;
grant execute on function public.alcance_fila(uuid, text) to authenticated, service_role;

-- «Su equipo»: la misma regla que puede_vigilar_a para supervisores y jefes con
-- equipos a cargo (de su empresa; nunca admins ni dueño).
create or replace function public.es_de_su_equipo(_viewer uuid, _target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _viewer is not null and _target is not null and _viewer <> _target
     and public.misma_empresa(_viewer, _target)
     and not public.es_admin_o_dueno(_target)
     and (
       exists (
         select 1 from public.profiles s
           join public.profiles t on t.id = _target and t.deleted_at is null and t.nivel = 'agente'
          where s.id = _viewer and s.deleted_at is null and s.nivel in ('supervisor', 'manager')
            and public.equipo_de(s.id) <> 'Otros'
            and public.equipo_de(s.id) = public.equipo_de(t.id))
       or exists (select 1 from public.equipos_a_cargo e where e.user_id = _viewer and e.equipo = public.equipo_de(_target))
     );
$$;
revoke all on function public.es_de_su_equipo(uuid, uuid) from public, anon;
grant execute on function public.es_de_su_equipo(uuid, uuid) to authenticated, service_role;

-- ¿Ve el calendario / las ausencias (sin motivo) de esa persona? Por el alcance
-- de la fila «Ausencias» de su puesto (o su permiso especial).
create or replace function public.ausencias_puede_ver(_viewer uuid, _target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _viewer is not null and _target is not null and (
    _viewer = _target
    or (
      public.misma_empresa(_viewer, _target)
      and exists (select 1 from public.profiles t where t.id = _target and t.deleted_at is null)
      and case public.alcance_fila(_viewer, 'Ausencias')
            when 'all' then public.es_dueno(_viewer) or not public.es_dueno(_target)
            when 'subordinates' then public.es_de_su_equipo(_viewer, _target)
            else false
          end
    )
  );
$$;
revoke all on function public.ausencias_puede_ver(uuid, uuid) from public, anon;
grant execute on function public.ausencias_puede_ver(uuid, uuid) to authenticated, service_role;

-- Primer nivel: función del puesto + la persona está en lo que ve. Nunca a sí mismo.
create or replace function public.ausencias_aprueba_equipo(_viewer uuid, _target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _viewer is not null and _target is not null and _viewer <> _target
     and public.misma_empresa(_viewer, _target)
     and (public.es_dueno(_viewer)
          or (public.tiene_funcion(_viewer, 'N:ausencias.aprobar_equipo') and public.ausencias_puede_ver(_viewer, _target)));
$$;
revoke all on function public.ausencias_aprueba_equipo(uuid, uuid) from public, anon;
grant execute on function public.ausencias_aprueba_equipo(uuid, uuid) to authenticated, service_role;

-- Aprobación final (RR. HH. o quien tenga la función). Ve motivo y adjunto.
create or replace function public.ausencias_aprueba_final(_viewer uuid, _target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _viewer is not null and _target is not null and _viewer <> _target
     and public.misma_empresa(_viewer, _target)
     and (public.es_dueno(_viewer)
          or (public.tiene_funcion(_viewer, 'N:ausencias.aprobar_final') and not public.es_dueno(_target)));
$$;
revoke all on function public.ausencias_aprueba_final(uuid, uuid) from public, anon;
grant execute on function public.ausencias_aprueba_final(uuid, uuid) to authenticated, service_role;

-- RR. HH. de la empresa (festivos, registrar directo, fecha de ingreso).
create or replace function public.ausencias_es_rrhh(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _uid is not null and (public.es_dueno(_uid) or public.tiene_funcion(_uid, 'N:ausencias.aprobar_final'));
$$;
revoke all on function public.ausencias_es_rrhh(uuid) from public, anon;
grant execute on function public.ausencias_es_rrhh(uuid) to authenticated, service_role;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- ausencias: la persona y quien da la aprobación final. Nadie más lee la tabla
-- (motivo y adjunto). Se escribe solo por las RPC de abajo.
do $pol$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ausencias' and policyname = 'ausencias_ver_propia_o_rrhh') then
    create policy ausencias_ver_propia_o_rrhh on public.ausencias for select to authenticated
      using (user_id = (select auth.uid()) or public.ausencias_aprueba_final((select auth.uid()), user_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ausencias_festivos' and policyname = 'ausencias_festivos_ver') then
    create policy ausencias_festivos_ver on public.ausencias_festivos for select to authenticated
      using (exists (select 1 from public.tenant_members m where m.user_id = (select auth.uid()) and m.tenant_id = ausencias_festivos.tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ausencias_politica' and policyname = 'ausencias_politica_ver') then
    create policy ausencias_politica_ver on public.ausencias_politica for select to authenticated
      using (exists (select 1 from public.tenant_members m where m.user_id = (select auth.uid()) and m.tenant_id = ausencias_politica.tenant_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'permisos_extra' and policyname = 'permisos_extra_ver') then
    create policy permisos_extra_ver on public.permisos_extra for select to authenticated
      using (user_id = (select auth.uid())
             or public.es_dueno((select auth.uid()))
             or (public.tiene_funcion((select auth.uid()), 'N:permisos.extra') and public.misma_empresa((select auth.uid()), user_id)));
  end if;
end $pol$;

-- ─── Días libres: el ayudante único ──────────────────────────────────────────

-- ¿Ese día no le toca trabajar? Festivo de su empresa o ausencia APROBADA de día
-- completo. Lo consultan turno_del_dia, horario_de y todo lo que exige horario.
create or replace function public.dia_libre(_uid uuid, _dia date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _uid is not null and _dia is not null and (
    exists (select 1 from public.ausencias_festivos f
             where f.fecha = _dia and f.tenant_id = public.empresa_de(_uid))
    or exists (select 1 from public.ausencias a
                where a.user_id = _uid and a.estado = 'aprobada' and a.hora_desde is null
                  and _dia between a.desde and a.hasta)
  );
$$;
revoke all on function public.dia_libre(uuid, date) from public, anon;
grant execute on function public.dia_libre(uuid, date) to authenticated, service_role;

-- ¿Está ausente en este momento? Día libre (hora de Bogotá) o ausencia parcial
-- aprobada que cubre esta hora.
create or replace function public.ausente_ahora(_uid uuid, _ts timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.dia_libre(_uid, (_ts at time zone 'America/Bogota')::date)
      or exists (select 1 from public.ausencias a
                  where a.user_id = _uid and a.estado = 'aprobada' and a.hora_desde is not null
                    and a.desde = (_ts at time zone 'America/Bogota')::date
                    and (_ts at time zone 'America/Bogota')::time >= a.hora_desde
                    and (_ts at time zone 'America/Bogota')::time < a.hora_hasta);
$$;
revoke all on function public.ausente_ahora(uuid, timestamptz) from public, anon;
grant execute on function public.ausente_ahora(uuid, timestamptz) to authenticated, service_role;

-- La lista de quienes tienen el día libre (para las edge functions, p. ej.
-- detectar-tardanzas): día completo, festivo o parcial.
create or replace function public.ausentes_del_dia(_dia date)
returns table(user_id uuid, parcial boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, not public.dia_libre(p.id, _dia)
    from public.profiles p
   where p.deleted_at is null
     and (public.dia_libre(p.id, _dia)
          or exists (select 1 from public.ausencias a where a.user_id = p.id and a.estado = 'aprobada'
                       and a.hora_desde is not null and a.desde = _dia));
$$;
revoke all on function public.ausentes_del_dia(date) from public, anon, authenticated;
grant execute on function public.ausentes_del_dia(date) to service_role;

-- ─── Horario y turno: lo de siempre (base) + el día libre ────────────────────

-- horario_base_de: el horario_de de producción (20261114000000), sin ausencias.
create or replace function public.horario_base_de(_uid uuid)
returns table(entrada time without time zone, salida time without time zone, exento boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when sem.tiene then sem.entrada else coalesce(p.hora_entrada, t.hora_entrada, rc.hora_entrada) end,
         case when sem.tiene then sem.salida else coalesce(p.hora_salida, t.hora_salida, rc.hora_salida) end,
         coalesce(p.exonera_camara_pantalla, false) or coalesce(rc.exonera_camara_pantalla, false)
    from public.profiles p
    left join public.rol_turnos t on t.id = p.turno_id
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
$$;
revoke all on function public.horario_base_de(uuid) from public, anon;
grant execute on function public.horario_base_de(uuid) to authenticated, service_role;

-- horario_de: el de hoy; con el día libre, entrada y salida en null (como un día
-- de descanso del horario por semana). exento no cambia.
create or replace function public.horario_de(_uid uuid)
returns table(entrada time without time zone, salida time without time zone, exento boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when l.libre then null else b.entrada end,
         case when l.libre then null else b.salida end,
         b.exento
    from public.horario_base_de(_uid) b
    cross join lateral (select public.dia_libre(_uid, (now() at time zone 'America/Bogota')::date) as libre) l;
$$;
revoke all on function public.horario_de(uuid) from public, anon;
grant execute on function public.horario_de(uuid) to authenticated, service_role;

-- turno_base_del_dia: el turno_del_dia de producción, sin ausencias (lo usa el
-- calendario para mostrar el turno que «no se exige»).
create or replace function public.turno_base_del_dia(_uid uuid, _dia date)
returns table(inicio timestamp with time zone, fin timestamp with time zone)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_ent time;
  v_sal time;
  v_ini timestamp;
  v_fin timestamp;
begin
  if _uid is null or _dia is null then return; end if;
  if exists (select 1 from public.horario_semanal hs where hs.user_id = _uid) then
    select hs.entrada, hs.salida into v_ent, v_sal
      from public.horario_semanal hs
     where hs.user_id = _uid and hs.dia = extract(dow from _dia)::smallint;
  else
    select h.entrada, h.salida into v_ent, v_sal from public.horario_base_de(_uid) h;
  end if;
  if v_ent is null or v_sal is null then return; end if;
  v_ini := _dia + v_ent;
  v_fin := _dia + v_sal;
  if v_fin <= v_ini then v_fin := v_fin + interval '1 day'; end if;
  inicio := v_ini at time zone 'America/Bogota';
  fin := v_fin at time zone 'America/Bogota';
  return next;
end;
$$;
revoke all on function public.turno_base_del_dia(uuid, date) from public, anon, authenticated;
grant execute on function public.turno_base_del_dia(uuid, date) to service_role;

-- turno_del_dia: sin turno el día libre. De aquí cuelgan turno_en_curso,
-- turno_que_toca, en_turno (antes del corte), vigilar_fuera_de_cowork (fuera y
-- «nunca entró»), vigilar_marcas, vigilar_tiempo_sin_pantalla, argos_gracia_*,
-- mi_turno, hub_* y api_equipo_argos.
create or replace function public.turno_del_dia(_uid uuid, _dia date)
returns table(inicio timestamp with time zone, fin timestamp with time zone)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
#variable_conflict use_column
begin
  if _uid is null or _dia is null then return; end if;
  if public.dia_libre(_uid, _dia) then return; end if;
  return query select x.inicio, x.fin from public.turno_base_del_dia(_uid, _dia) x;
end;
$$;
revoke all on function public.turno_del_dia(uuid, date) from public, anon, authenticated;
grant execute on function public.turno_del_dia(uuid, date) to service_role;

-- en_turno: además, nunca durante una ausencia aprobada (también la parcial).
-- Lo usan monitor-vision, mi_cowork_estado (Cowork obligatorio) y los buzones
-- de fotos y videos de Argos.
create or replace function public.en_turno(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not public.ausente_ahora(_uid, now()) and case
    when public.turno_obligatorio()
      then exists (select 1 from public.turno_marcas m where m.user_id = _uid and m.fin is null)
    else exists (select 1 from public.turno_en_curso(_uid, now()))
  end;
$$;

-- debe_estar_en_cowork: durante una ausencia, no.
create or replace function public.debe_estar_en_cowork(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _uid is not null
     and not public.es_admin_o_dueno(_uid)
     and not exists (select 1 from public.cowork_libres l where l.user_id = _uid)
     and not public.ausente_ahora(_uid, now());
$$;

-- argos_vigila_a: durante una ausencia, Argos no mira ni gasta.
create or replace function public.argos_vigila_a(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select (public.exige_camara(_uid) or public.exige_pantalla(_uid))
     and not public.ausente_ahora(_uid, now());
$$;

-- ─── Días hábiles y saldo ────────────────────────────────────────────────────

-- Días que cuenta una ausencia: los días en que su horario tiene turno, sin
-- festivos. Sin horario en ningún día, de lunes a viernes. Parcial = medio día.
create or replace function public.ausencias_dias_habiles(_uid uuid, _desde date, _hasta date)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.empresa_de(_uid);
  v_trabaja boolean[] := array[false, false, false, false, false, false, false];
  v_alguno boolean := false;
  d date;
  i int;
  n numeric := 0;
begin
  if _desde is null or _hasta is null or _hasta < _desde then return 0; end if;
  -- Qué días de la semana trabaja (una semana cualquiera, la de _desde).
  for i in 0..6 loop
    if exists (select 1 from public.turno_base_del_dia(_uid, _desde + i)) then
      v_trabaja[extract(dow from (_desde + i))::int + 1] := true;
      v_alguno := true;
    end if;
  end loop;
  if not v_alguno then
    v_trabaja := array[false, true, true, true, true, true, false];
  end if;
  d := _desde;
  while d <= _hasta loop
    if v_trabaja[extract(dow from d)::int + 1]
       and not exists (select 1 from public.ausencias_festivos f where f.tenant_id = v_tenant and f.fecha = d) then
      n := n + 1;
    end if;
    d := d + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.ausencias_dias_habiles(uuid, date, date) from public, anon;
grant execute on function public.ausencias_dias_habiles(uuid, date, date) to authenticated, service_role;

create or replace function public.ausencias_politica_de(_tenant uuid)
returns public.ausencias_politica
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p from public.ausencias_politica p where p.tenant_id = _tenant),
    row(_tenant, 15, 15, 2, 2, null, now())::public.ausencias_politica);
$$;
revoke all on function public.ausencias_politica_de(uuid) from public, anon, authenticated;

-- Saldo de vacaciones: días por año de la empresa, acumulados día a día desde la
-- fecha de ingreso; se descuentan las aprobadas.
create or replace function public.ausencias_saldo(_uid uuid)
returns table(fecha_ingreso date, ingreso_estimado boolean, dias_anio numeric, acumulados numeric,
              usados numeric, pendientes numeric, disponibles numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_yo uuid := (select auth.uid());
  v_pol public.ausencias_politica;
  v_ing date;
  v_est boolean;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
begin
  if v_yo is not null and v_yo <> _uid
     and not public.ausencias_puede_ver(v_yo, _uid) and not public.ausencias_aprueba_final(v_yo, _uid) then
    raise exception 'ausencias_saldo: sin permiso' using errcode = '42501';
  end if;
  v_pol := public.ausencias_politica_de(public.empresa_de(_uid));
  select coalesce(p.fecha_ingreso,
                  (select e.hire_date from public.employees e where e.profile_id = p.id and e.hire_date is not null limit 1),
                  p.created_at::date),
         p.fecha_ingreso is null
           and not exists (select 1 from public.employees e where e.profile_id = p.id and e.hire_date is not null)
    into v_ing, v_est
    from public.profiles p where p.id = _uid;
  if v_ing is null then return; end if;
  fecha_ingreso := v_ing;
  ingreso_estimado := v_est;
  dias_anio := v_pol.vacaciones_dias_anio;
  acumulados := round(v_pol.vacaciones_dias_anio * greatest(0, v_hoy - v_ing) / 365.0, 2);
  usados := coalesce((select sum(a.dias) from public.ausencias a
                       where a.user_id = _uid and a.tipo = 'vacaciones' and a.estado = 'aprobada'), 0);
  pendientes := coalesce((select sum(a.dias) from public.ausencias a
                           where a.user_id = _uid and a.tipo = 'vacaciones' and a.estado in ('pendiente_jefe', 'pendiente_rrhh')), 0);
  disponibles := acumulados - usados;
  return next;
end;
$$;
revoke all on function public.ausencias_saldo(uuid) from public, anon;
grant execute on function public.ausencias_saldo(uuid) to authenticated, service_role;

-- ─── Avisos ──────────────────────────────────────────────────────────────────
-- Respeta las preferencias (notif_canal_activo): si la persona apagó la campana y
-- el push de ese tipo, no se inserta. El push sale solo (push_desde_notificacion).
create or replace function public.ausencias_avisar(_uid uuid, _tipo text, _titulo text, _mensaje text, _ref uuid, _link text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, message, reference_id, reference_type,
                                    module_origin, priority, status, deep_link_url, visibility_scope, is_read)
  select _uid, _tipo, left(_titulo, 160), left(_mensaje, 400), _ref, 'ausencia',
         'HR', 'medium', 'new', _link, 'personal', false
   where _uid is not null
     and (public.notif_canal_activo(_uid, _tipo, 'in_app') or public.notif_canal_activo(_uid, _tipo, 'push'));
$$;
revoke all on function public.ausencias_avisar(uuid, text, text, text, uuid, text) from public, anon, authenticated;

create or replace function public.ausencias_nombre_tipo(_tipo text)
returns text
language sql
immutable
as $$
  select case _tipo when 'vacaciones' then 'vacaciones' when 'permiso' then 'permiso'
                    when 'incapacidad' then 'incapacidad médica' when 'dia_libre' then 'día libre' else _tipo end;
$$;

create or replace function public.ausencias_fechas_texto(_desde date, _hasta date, _hd time, _hh time)
returns text
language sql
immutable
as $$
  select case
    when _hd is not null then to_char(_desde, 'DD/MM') || ' de ' || to_char(_hd, 'HH24:MI') || ' a ' || to_char(_hh, 'HH24:MI')
    when _desde = _hasta then 'el ' || to_char(_desde, 'DD/MM')
    else 'del ' || to_char(_desde, 'DD/MM') || ' al ' || to_char(_hasta, 'DD/MM')
  end;
$$;

-- Quiénes aprueban el primer nivel (sin contar al dueño, que puede pero no
-- recibe cada solicitud) y quiénes la final (si no hay nadie, el dueño).
create or replace function public.ausencias_jefes_de(_target uuid)
returns table(user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.profiles p
   where p.deleted_at is null and p.id <> _target
     and not public.es_dueno(p.id)
     and public.misma_empresa(p.id, _target)
     and public.tiene_funcion(p.id, 'N:ausencias.aprobar_equipo')
     and public.ausencias_puede_ver(p.id, _target);
$$;
revoke all on function public.ausencias_jefes_de(uuid) from public, anon, authenticated;

create or replace function public.ausencias_rrhh_de(_target uuid)
returns table(user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with f as (
    select p.id from public.profiles p
     where p.deleted_at is null and p.id <> _target and not public.es_dueno(p.id)
       and public.misma_empresa(p.id, _target)
       and public.tiene_funcion(p.id, 'N:ausencias.aprobar_final')
  )
  select id from f
  union
  select o.user_id from public.tenant_owners o
   where o.tenant_id = public.empresa_de(_target) and o.user_id <> _target
     and not exists (select 1 from f);
$$;
revoke all on function public.ausencias_rrhh_de(uuid) from public, anon, authenticated;

-- ─── Pedir, cancelar, decidir, registrar ─────────────────────────────────────

create or replace function public.ausencia_solicitar(
  _tipo text, _desde date, _hasta date, _hora_desde time default null, _hora_hasta time default null,
  _motivo text default null, _adjunto_path text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tenant uuid := public.empresa_de(v_uid);
  v_pol public.ausencias_politica;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_aviso int;
  v_dias numeric;
  v_saldo record;
  v_id uuid;
  v_estado text;
  v_nom text;
  v_jefe record;
  v_hay_jefe boolean := false;
begin
  if v_uid is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  if v_tenant is null then raise exception 'ausencia_solicitar: no perteneces a ninguna empresa' using errcode = 'P0001'; end if;
  if _tipo not in ('vacaciones', 'permiso', 'incapacidad', 'dia_libre') then
    raise exception 'ausencia_solicitar: tipo no válido' using errcode = 'P0001';
  end if;
  if _desde is null or _hasta is null or _hasta < _desde then
    raise exception 'ausencia_solicitar: revisa las fechas' using errcode = 'P0001';
  end if;
  if _hasta - _desde > 366 then
    raise exception 'ausencia_solicitar: máximo un año' using errcode = 'P0001';
  end if;
  if (_hora_desde is null) <> (_hora_hasta is null)
     or (_hora_desde is not null and (_desde <> _hasta or _hora_hasta <= _hora_desde or _tipo = 'vacaciones')) then
    raise exception 'ausencia_solicitar: el día parcial es de un solo día y con hora de inicio y fin' using errcode = 'P0001';
  end if;
  if _tipo = 'incapacidad' and coalesce(btrim(_adjunto_path), '') = '' then
    raise exception 'ausencia_solicitar: la incapacidad necesita el soporte (foto o PDF)' using errcode = 'P0001';
  end if;
  if _adjunto_path is not null and split_part(_adjunto_path, '/', 1) <> v_uid::text then
    raise exception 'ausencia_solicitar: adjunto no válido' using errcode = 'P0001';
  end if;

  v_pol := public.ausencias_politica_de(v_tenant);
  v_aviso := case _tipo when 'vacaciones' then v_pol.aviso_vacaciones_dias
                        when 'permiso' then v_pol.aviso_permiso_dias
                        when 'dia_libre' then v_pol.aviso_dia_libre_dias
                        else 0 end;
  if _tipo <> 'incapacidad' and _desde - v_hoy < v_aviso then
    raise exception 'ausencia_solicitar: este tipo se pide con % días de anticipación', v_aviso using errcode = 'P0001';
  end if;
  if exists (select 1 from public.ausencias a
              where a.user_id = v_uid and a.estado in ('pendiente_jefe', 'pendiente_rrhh', 'aprobada')
                and a.desde <= _hasta and a.hasta >= _desde) then
    raise exception 'ausencia_solicitar: ya tienes una ausencia en esas fechas' using errcode = 'P0001';
  end if;

  v_dias := case when _hora_desde is not null then 0.5 else public.ausencias_dias_habiles(v_uid, _desde, _hasta) end;
  if _tipo = 'vacaciones' then
    select * into v_saldo from public.ausencias_saldo(v_uid);
    if v_dias > coalesce(v_saldo.disponibles, 0) - coalesce(v_saldo.pendientes, 0) then
      raise exception 'ausencia_solicitar: no te alcanza el saldo de vacaciones (tienes % días)',
        greatest(0, coalesce(v_saldo.disponibles, 0) - coalesce(v_saldo.pendientes, 0)) using errcode = 'P0001';
    end if;
  end if;

  select exists (select 1 from public.ausencias_jefes_de(v_uid)) into v_hay_jefe;
  v_estado := case when v_hay_jefe then 'pendiente_jefe' else 'pendiente_rrhh' end;

  insert into public.ausencias (tenant_id, user_id, tipo, desde, hasta, hora_desde, hora_hasta, dias, motivo,
                                adjunto_path, estado, pagada, creada_por)
  values (v_tenant, v_uid, _tipo, _desde, _hasta, _hora_desde, _hora_hasta, v_dias, nullif(btrim(_motivo), ''),
          nullif(btrim(_adjunto_path), ''), v_estado, case when _tipo = 'vacaciones' then true end, v_uid)
  returning id into v_id;

  v_nom := coalesce(nullif(btrim((select p.full_name from public.profiles p where p.id = v_uid)), ''), 'Alguien de tu equipo');
  if v_hay_jefe then
    for v_jefe in select j.user_id from public.ausencias_jefes_de(v_uid) j loop
      perform public.ausencias_avisar(v_jefe.user_id, 'ausencia_solicitada',
        format('%s pide %s', v_nom, public.ausencias_nombre_tipo(_tipo)),
        format('%s pide %s %s. Revísala y apruébala o recházala.', v_nom, public.ausencias_nombre_tipo(_tipo),
               public.ausencias_fechas_texto(_desde, _hasta, _hora_desde, _hora_hasta)),
        v_id, '/asistencia?tab=ausencias&id=' || v_id);
    end loop;
  else
    for v_jefe in select r.user_id from public.ausencias_rrhh_de(v_uid) r loop
      perform public.ausencias_avisar(v_jefe.user_id, 'ausencia_por_aprobar',
        format('%s pide %s', v_nom, public.ausencias_nombre_tipo(_tipo)),
        format('%s pide %s %s. Falta tu aprobación final.', v_nom, public.ausencias_nombre_tipo(_tipo),
               public.ausencias_fechas_texto(_desde, _hasta, _hora_desde, _hora_hasta)),
        v_id, '/asistencia?tab=ausencias&id=' || v_id);
    end loop;
  end if;
  return v_id;
end;
$$;
revoke all on function public.ausencia_solicitar(text, date, date, time, time, text, text) from public, anon;
grant execute on function public.ausencia_solicitar(text, date, date, time, time, text, text) to authenticated;

create or replace function public.ausencia_cancelar(_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  update public.ausencias set estado = 'cancelada', updated_at = now()
   where id = _id and user_id = v_uid and estado in ('pendiente_jefe', 'pendiente_rrhh');
  if not found then
    raise exception 'ausencia_cancelar: solo se cancela una solicitud tuya que siga pendiente' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.ausencia_cancelar(uuid) from public, anon;
grant execute on function public.ausencia_cancelar(uuid) to authenticated;

-- Primer nivel (jefe): aprueba → pasa a RR. HH.; rechaza → se le avisa a la persona.
create or replace function public.ausencia_decidir_jefe(_id uuid, _aprobar boolean, _nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  a public.ausencias;
  v_nom text;
  v_jefe text;
  r record;
begin
  if v_uid is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  select * into a from public.ausencias where id = _id for update;
  if not found or a.estado <> 'pendiente_jefe' then
    raise exception 'ausencia_decidir_jefe: esta solicitud ya no está pendiente' using errcode = 'P0001';
  end if;
  if not public.ausencias_aprueba_equipo(v_uid, a.user_id) then
    raise exception 'ausencia_decidir_jefe: no puedes aprobar ausencias de esta persona' using errcode = '42501';
  end if;
  if not _aprobar and coalesce(btrim(_nota), '') = '' then
    raise exception 'ausencia_decidir_jefe: di por qué la rechazas' using errcode = 'P0001';
  end if;
  v_nom := coalesce(nullif(btrim((select p.full_name from public.profiles p where p.id = a.user_id)), ''), 'Alguien');
  v_jefe := coalesce(nullif(btrim((select p.full_name from public.profiles p where p.id = v_uid)), ''), 'Tu jefe');
  if _aprobar then
    update public.ausencias set estado = 'pendiente_rrhh', jefe_por = v_uid, jefe_at = now(),
           jefe_nota = nullif(btrim(_nota), ''), updated_at = now()
     where id = _id;
    for r in select x.user_id from public.ausencias_rrhh_de(a.user_id) x loop
      perform public.ausencias_avisar(r.user_id, 'ausencia_por_aprobar',
        format('%s: %s lista para aprobación final', v_nom, public.ausencias_nombre_tipo(a.tipo)),
        format('%s aprobó %s de %s %s. Falta tu aprobación final (y si es pagada).', v_jefe,
               public.ausencias_nombre_tipo(a.tipo), v_nom, public.ausencias_fechas_texto(a.desde, a.hasta, a.hora_desde, a.hora_hasta)),
        a.id, '/asistencia?tab=ausencias&id=' || a.id);
    end loop;
  else
    update public.ausencias set estado = 'rechazada', jefe_por = v_uid, jefe_at = now(),
           rechazo_motivo = btrim(_nota), rechazada_por = v_uid, updated_at = now()
     where id = _id;
    perform public.ausencias_avisar(a.user_id, 'ausencia_rechazada',
      format('Tu solicitud de %s no fue aprobada', public.ausencias_nombre_tipo(a.tipo)),
      format('%s la rechazó: %s', v_jefe, btrim(_nota)),
      a.id, '/mis-dias');
  end if;
end;
$$;
revoke all on function public.ausencia_decidir_jefe(uuid, boolean, text) from public, anon;
grant execute on function public.ausencia_decidir_jefe(uuid, boolean, text) to authenticated;

-- Final (RR. HH.): aprueba (y dice si es pagada) o rechaza. También desde
-- 'pendiente_jefe' (cuando el jefe no está o RR. HH. decide directo).
create or replace function public.ausencia_decidir_final(_id uuid, _aprobar boolean, _pagada boolean default null, _nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  a public.ausencias;
  v_pagada boolean;
  v_txt text;
  r record;
  v_nom text;
begin
  if v_uid is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  select * into a from public.ausencias where id = _id for update;
  if not found or a.estado not in ('pendiente_jefe', 'pendiente_rrhh') then
    raise exception 'ausencia_decidir_final: esta solicitud ya no está pendiente' using errcode = 'P0001';
  end if;
  if not public.ausencias_aprueba_final(v_uid, a.user_id) then
    raise exception 'ausencia_decidir_final: no tienes la aprobación final de ausencias' using errcode = '42501';
  end if;
  v_nom := coalesce(nullif(btrim((select p.full_name from public.profiles p where p.id = a.user_id)), ''), 'Alguien');
  if _aprobar then
    v_pagada := coalesce(_pagada, a.pagada, a.tipo = 'vacaciones');
    update public.ausencias set estado = 'aprobada', pagada = v_pagada, rrhh_por = v_uid, rrhh_at = now(), updated_at = now()
     where id = _id;
    v_txt := format('%s %s, %s.', initcap(public.ausencias_nombre_tipo(a.tipo)),
                    public.ausencias_fechas_texto(a.desde, a.hasta, a.hora_desde, a.hora_hasta),
                    case when v_pagada then 'pagada' else 'no pagada' end);
    perform public.ausencias_avisar(a.user_id, 'ausencia_aprobada',
      format('Aprobada: tu %s', public.ausencias_nombre_tipo(a.tipo)),
      v_txt || ' Esos días Maven no te pide marcar entrada ni estar en Cowork.', a.id, '/mis-dias');
    for r in select distinct x.uid from (
               select a.jefe_por as uid
               union select j.user_id from public.ausencias_jefes_de(a.user_id) j) x
              where x.uid is not null and x.uid <> v_uid loop
      perform public.ausencias_avisar(r.uid, 'ausencia_aprobada',
        format('%s estará fuera', v_nom), format('%s: %s', v_nom, v_txt), a.id, '/asistencia?tab=ausencias&id=' || a.id);
    end loop;
  else
    if coalesce(btrim(_nota), '') = '' then
      raise exception 'ausencia_decidir_final: di por qué la rechazas' using errcode = 'P0001';
    end if;
    update public.ausencias set estado = 'rechazada', rrhh_por = v_uid, rrhh_at = now(),
           rechazo_motivo = btrim(_nota), rechazada_por = v_uid, updated_at = now()
     where id = _id;
    perform public.ausencias_avisar(a.user_id, 'ausencia_rechazada',
      format('Tu solicitud de %s no fue aprobada', public.ausencias_nombre_tipo(a.tipo)),
      format('RR. HH. la rechazó: %s', btrim(_nota)), a.id, '/mis-dias');
  end if;
end;
$$;
revoke all on function public.ausencia_decidir_final(uuid, boolean, boolean, text) from public, anon;
grant execute on function public.ausencia_decidir_final(uuid, boolean, boolean, text) to authenticated;

-- RR. HH. registra una ya aprobada (incapacidad, por ejemplo). Sin aviso mínimo.
create or replace function public.ausencia_registrar(
  _user_id uuid, _tipo text, _desde date, _hasta date, _pagada boolean,
  _hora_desde time default null, _hora_hasta time default null,
  _motivo text default null, _adjunto_path text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_dias numeric;
begin
  if v_uid is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  if not public.ausencias_aprueba_final(v_uid, _user_id) then
    raise exception 'ausencia_registrar: no tienes la aprobación final de ausencias para esta persona' using errcode = '42501';
  end if;
  if _tipo not in ('vacaciones', 'permiso', 'incapacidad', 'dia_libre') or _desde is null or _hasta is null or _hasta < _desde
     or _hasta - _desde > 366 then
    raise exception 'ausencia_registrar: revisa el tipo y las fechas' using errcode = 'P0001';
  end if;
  if (_hora_desde is null) <> (_hora_hasta is null)
     or (_hora_desde is not null and (_desde <> _hasta or _hora_hasta <= _hora_desde or _tipo = 'vacaciones')) then
    raise exception 'ausencia_registrar: el día parcial es de un solo día y con hora de inicio y fin' using errcode = 'P0001';
  end if;
  if _adjunto_path is not null and split_part(_adjunto_path, '/', 1) <> _user_id::text then
    raise exception 'ausencia_registrar: adjunto no válido' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.ausencias a
              where a.user_id = _user_id and a.estado in ('pendiente_jefe', 'pendiente_rrhh', 'aprobada')
                and a.desde <= _hasta and a.hasta >= _desde) then
    raise exception 'ausencia_registrar: ya tiene una ausencia en esas fechas' using errcode = 'P0001';
  end if;
  v_dias := case when _hora_desde is not null then 0.5 else public.ausencias_dias_habiles(_user_id, _desde, _hasta) end;
  insert into public.ausencias (tenant_id, user_id, tipo, desde, hasta, hora_desde, hora_hasta, dias, motivo,
                                adjunto_path, estado, pagada, directa, creada_por, rrhh_por, rrhh_at)
  values (public.empresa_de(_user_id), _user_id, _tipo, _desde, _hasta, _hora_desde, _hora_hasta, v_dias,
          nullif(btrim(_motivo), ''), nullif(btrim(_adjunto_path), ''), 'aprobada',
          coalesce(_pagada, _tipo = 'vacaciones'), true, v_uid, v_uid, now())
  returning id into v_id;
  perform public.ausencias_avisar(_user_id, 'ausencia_aprobada',
    format('RR. HH. registró tu %s', public.ausencias_nombre_tipo(_tipo)),
    format('%s %s, %s. Esos días Maven no te pide marcar entrada ni estar en Cowork.',
           initcap(public.ausencias_nombre_tipo(_tipo)), public.ausencias_fechas_texto(_desde, _hasta, _hora_desde, _hora_hasta),
           case when coalesce(_pagada, _tipo = 'vacaciones') then 'pagada' else 'no pagada' end),
    v_id, '/mis-dias');
  return v_id;
end;
$$;
revoke all on function public.ausencia_registrar(uuid, text, date, date, boolean, time, time, text, text) from public, anon;
grant execute on function public.ausencia_registrar(uuid, text, date, date, boolean, time, time, text, text) to authenticated;

-- RR. HH. anula una aprobada (se devuelve el saldo).
create or replace function public.ausencia_anular(_id uuid, _nota text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  a public.ausencias;
begin
  select * into a from public.ausencias where id = _id for update;
  if not found or a.estado <> 'aprobada' or not public.ausencias_aprueba_final(v_uid, a.user_id) then
    raise exception 'ausencia_anular: no se puede anular' using errcode = '42501';
  end if;
  if coalesce(btrim(_nota), '') = '' then
    raise exception 'ausencia_anular: di por qué' using errcode = 'P0001';
  end if;
  update public.ausencias set estado = 'cancelada', rechazo_motivo = btrim(_nota), rechazada_por = v_uid, updated_at = now()
   where id = _id;
  perform public.ausencias_avisar(a.user_id, 'ausencia_rechazada',
    format('RR. HH. anuló tu %s', public.ausencias_nombre_tipo(a.tipo)),
    format('%s: %s', initcap(public.ausencias_fechas_texto(a.desde, a.hasta, a.hora_desde, a.hora_hasta)), btrim(_nota)),
    a.id, '/mis-dias');
end;
$$;
revoke all on function public.ausencia_anular(uuid, text) from public, anon;
grant execute on function public.ausencia_anular(uuid, text) to authenticated;

-- ─── Lecturas ────────────────────────────────────────────────────────────────

-- Lo que puedo hacer (para el menú y las pantallas).
create or replace function public.mis_permisos_ausencias()
returns table(alcance text, aprueba_equipo boolean, aprueba_final boolean, es_rrhh boolean, configura_empresa boolean, permisos_extra boolean)
language sql
stable
security definer
set search_path = public
as $$
  select public.alcance_fila((select auth.uid()), 'Ausencias'),
         public.es_dueno((select auth.uid())) or public.tiene_funcion((select auth.uid()), 'N:ausencias.aprobar_equipo'),
         public.es_dueno((select auth.uid())) or public.tiene_funcion((select auth.uid()), 'N:ausencias.aprobar_final'),
         public.ausencias_es_rrhh((select auth.uid())),
         public.es_dueno((select auth.uid())) or public.tiene_funcion((select auth.uid()), 'N:empresa.configurar'),
         public.es_dueno((select auth.uid())) or public.tiene_funcion((select auth.uid()), 'N:permisos.extra');
$$;
revoke all on function public.mis_permisos_ausencias() from public, anon;
grant execute on function public.mis_permisos_ausencias() to authenticated;

-- ¿Hoy estoy de ausencia? (la tarjeta del turno y el candado de capturas del cliente)
create or replace function public.mi_ausencia_hoy()
returns table(ausente boolean, ahora boolean, tipo text, hasta date, parcial boolean, hora_desde time, hora_hasta time, festivo text)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (select (select auth.uid()) as uid, (now() at time zone 'America/Bogota')::date as hoy),
  a as (
    select x.* from public.ausencias x, yo
     where x.user_id = yo.uid and x.estado = 'aprobada' and yo.hoy between x.desde and x.hasta
     order by x.hora_desde nulls first limit 1
  ),
  f as (select fe.nombre from public.ausencias_festivos fe, yo where fe.fecha = yo.hoy and fe.tenant_id = public.empresa_de(yo.uid) limit 1)
  select exists (select 1 from a) or exists (select 1 from f),
         public.ausente_ahora((select uid from yo), now()),
         (select a.tipo from a), (select a.hasta from a), coalesce((select a.hora_desde is not null from a), false),
         (select a.hora_desde from a), (select a.hora_hasta from a), (select f.nombre from f);
$$;
revoke all on function public.mi_ausencia_hoy() from public, anon;
grant execute on function public.mi_ausencia_hoy() to authenticated;

-- Mis ausencias (con mi motivo).
create or replace function public.mis_ausencias()
returns table(id uuid, tipo text, desde date, hasta date, hora_desde time, hora_hasta time, dias numeric, motivo text,
              adjunto_path text, estado text, pagada boolean, directa boolean, rechazo_motivo text, created_at timestamptz,
              jefe_nombre text, jefe_at timestamptz, rrhh_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.tipo, a.desde, a.hasta, a.hora_desde, a.hora_hasta, a.dias, a.motivo, a.adjunto_path, a.estado,
         a.pagada, a.directa, a.rechazo_motivo, a.created_at,
         (select p.full_name from public.profiles p where p.id = a.jefe_por), a.jefe_at, a.rrhh_at
    from public.ausencias a
   where a.user_id = (select auth.uid())
   order by a.desde desc, a.created_at desc
   limit 200;
$$;
revoke all on function public.mis_ausencias() from public, anon;
grant execute on function public.mis_ausencias() to authenticated;

-- La bandeja: lo pendiente que YO puedo decidir. El motivo y el adjunto solo van
-- si tengo la aprobación final de esa persona.
create or replace function public.ausencias_bandeja()
returns table(id uuid, user_id uuid, nombre text, avatar_url text, avatar_seed text, equipo text, tipo text, desde date,
              hasta date, hora_desde time, hora_hasta time, dias numeric, estado text, pagada boolean, created_at timestamptz,
              jefe_nombre text, jefe_nota text, motivo text, adjunto_path text, puedo_jefe boolean, puedo_final boolean,
              saldo_disponible numeric)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (select (select auth.uid()) as uid)
  select a.id, a.user_id, p.full_name, p.avatar_url, p.avatar_seed, public.equipo_de(a.user_id), a.tipo, a.desde, a.hasta,
         a.hora_desde, a.hora_hasta, a.dias, a.estado, a.pagada, a.created_at,
         (select j.full_name from public.profiles j where j.id = a.jefe_por), a.jefe_nota,
         case when public.ausencias_aprueba_final(yo.uid, a.user_id) then a.motivo end,
         case when public.ausencias_aprueba_final(yo.uid, a.user_id) then a.adjunto_path end,
         a.estado = 'pendiente_jefe' and public.ausencias_aprueba_equipo(yo.uid, a.user_id),
         public.ausencias_aprueba_final(yo.uid, a.user_id),
         case when a.tipo = 'vacaciones' then (select s.disponibles from public.ausencias_saldo(a.user_id) s) end
    from public.ausencias a
    join public.profiles p on p.id = a.user_id
    cross join yo
   where a.estado in ('pendiente_jefe', 'pendiente_rrhh')
     and a.tenant_id = public.empresa_de(yo.uid)
     and ((a.estado = 'pendiente_jefe' and public.ausencias_aprueba_equipo(yo.uid, a.user_id))
          or public.ausencias_aprueba_final(yo.uid, a.user_id))
   order by a.desde, a.created_at;
$$;
revoke all on function public.ausencias_bandeja() from public, anon;
grant execute on function public.ausencias_bandeja() to authenticated;

-- El calendario de ausencias (aprobadas y pendientes) de quienes puedo ver. Sin
-- motivo ni adjunto (eso es de RR. HH.).
create or replace function public.ausencias_calendario(_desde date, _hasta date)
returns table(id uuid, user_id uuid, nombre text, avatar_url text, avatar_seed text, equipo text, tipo text, desde date,
              hasta date, hora_desde time, hora_hasta time, dias numeric, estado text, pagada boolean, directa boolean)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.user_id, p.full_name, p.avatar_url, p.avatar_seed, public.equipo_de(a.user_id), a.tipo, a.desde, a.hasta,
         a.hora_desde, a.hora_hasta, a.dias, a.estado, a.pagada, a.directa
    from public.ausencias a
    join public.profiles p on p.id = a.user_id and p.deleted_at is null
   where a.estado in ('pendiente_jefe', 'pendiente_rrhh', 'aprobada')
     and a.desde <= _hasta and a.hasta >= _desde
     and _hasta - _desde <= 400
     and a.tenant_id = public.empresa_de((select auth.uid()))
     and public.ausencias_puede_ver((select auth.uid()), a.user_id)
   order by a.desde, p.full_name;
$$;
revoke all on function public.ausencias_calendario(date, date) from public, anon;
grant execute on function public.ausencias_calendario(date, date) to authenticated;

-- Lo que ven los compañeros: «Ausente» o «De vacaciones» hoy (sin motivo, sin tipo
-- más allá de vacaciones). Cualquiera de la misma empresa.
create or replace function public.ausentes_hoy_empresa()
returns table(user_id uuid, etiqueta text, hasta date)
language sql
stable
security definer
set search_path = public
as $$
  select a.user_id, case when a.tipo = 'vacaciones' then 'vacaciones' else 'ausente' end, a.hasta
    from public.ausencias a
   where a.estado = 'aprobada' and a.hora_desde is null
     and (now() at time zone 'America/Bogota')::date between a.desde and a.hasta
     and a.tenant_id = public.empresa_de((select auth.uid()));
$$;
revoke all on function public.ausentes_hoy_empresa() from public, anon;
grant execute on function public.ausentes_hoy_empresa() to authenticated;

-- ─── Festivos, política y fecha de ingreso ───────────────────────────────────

create or replace function public.ausencias_festivo_guardar(_fecha date, _nombre text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if not public.ausencias_es_rrhh(v_uid) then
    raise exception 'ausencias_festivo_guardar: solo RR. HH.' using errcode = '42501';
  end if;
  if _fecha is null or coalesce(btrim(_nombre), '') = '' then
    raise exception 'ausencias_festivo_guardar: falta la fecha o el nombre' using errcode = 'P0001';
  end if;
  insert into public.ausencias_festivos (tenant_id, fecha, nombre, creado_por)
  values (public.empresa_de(v_uid), _fecha, btrim(_nombre), v_uid)
  on conflict (tenant_id, fecha) do update set nombre = excluded.nombre
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.ausencias_festivo_guardar(date, text) from public, anon;
grant execute on function public.ausencias_festivo_guardar(date, text) to authenticated;

create or replace function public.ausencias_festivo_quitar(_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not public.ausencias_es_rrhh(v_uid) then
    raise exception 'ausencias_festivo_quitar: solo RR. HH.' using errcode = '42501';
  end if;
  delete from public.ausencias_festivos where id = _id and tenant_id = public.empresa_de(v_uid);
end;
$$;
revoke all on function public.ausencias_festivo_quitar(uuid) from public, anon;
grant execute on function public.ausencias_festivo_quitar(uuid) to authenticated;

create or replace function public.ausencias_politica_mia()
returns table(vacaciones_dias_anio numeric, aviso_vacaciones_dias integer, aviso_permiso_dias integer,
              aviso_dia_libre_dias integer, puede_editar boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.vacaciones_dias_anio, p.aviso_vacaciones_dias, p.aviso_permiso_dias, p.aviso_dia_libre_dias,
         public.es_dueno((select auth.uid())) or public.tiene_funcion((select auth.uid()), 'N:empresa.configurar')
    from (select (public.ausencias_politica_de(public.empresa_de((select auth.uid())))).*) p;
$$;
revoke all on function public.ausencias_politica_mia() from public, anon;
grant execute on function public.ausencias_politica_mia() to authenticated;

create or replace function public.ausencias_politica_guardar(_dias_anio numeric, _aviso_vac integer, _aviso_permiso integer, _aviso_dia_libre integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tenant uuid := public.empresa_de(v_uid);
begin
  if not public.puedo_configurar_empresa() then
    raise exception 'ausencias_politica_guardar: solo quien configura la empresa' using errcode = '42501';
  end if;
  insert into public.ausencias_politica (tenant_id, vacaciones_dias_anio, aviso_vacaciones_dias, aviso_permiso_dias,
                                         aviso_dia_libre_dias, updated_by, updated_at)
  values (v_tenant, _dias_anio, _aviso_vac, _aviso_permiso, _aviso_dia_libre, v_uid, now())
  on conflict (tenant_id) do update
    set vacaciones_dias_anio = excluded.vacaciones_dias_anio, aviso_vacaciones_dias = excluded.aviso_vacaciones_dias,
        aviso_permiso_dias = excluded.aviso_permiso_dias, aviso_dia_libre_dias = excluded.aviso_dia_libre_dias,
        updated_by = v_uid, updated_at = now();
end;
$$;
revoke all on function public.ausencias_politica_guardar(numeric, integer, integer, integer) from public, anon;
grant execute on function public.ausencias_politica_guardar(numeric, integer, integer, integer) to authenticated;

create or replace function public.ausencias_fecha_ingreso_guardar(_user_id uuid, _fecha date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ausencias_aprueba_final((select auth.uid()), _user_id) then
    raise exception 'ausencias_fecha_ingreso_guardar: solo RR. HH.' using errcode = '42501';
  end if;
  if _fecha is not null and _fecha > (now() at time zone 'America/Bogota')::date then
    raise exception 'ausencias_fecha_ingreso_guardar: la fecha no puede ser futura' using errcode = 'P0001';
  end if;
  update public.profiles set fecha_ingreso = _fecha where id = _user_id;
end;
$$;
revoke all on function public.ausencias_fecha_ingreso_guardar(uuid, date) from public, anon;
grant execute on function public.ausencias_fecha_ingreso_guardar(uuid, date) to authenticated;

-- ─── Permisos especiales: otorgar, revocar, ver ──────────────────────────────

create or replace function public.permisos_extra_puede_dar(_viewer uuid, _target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _viewer is not null and _target is not null and _viewer <> _target
     and public.misma_empresa(_viewer, _target)
     and not public.es_dueno(_target)
     and (public.es_dueno(_viewer)
          or (public.tiene_funcion(_viewer, 'N:permisos.extra') and not public.es_admin_o_dueno(_target)));
$$;
revoke all on function public.permisos_extra_puede_dar(uuid, uuid) from public, anon;
grant execute on function public.permisos_extra_puede_dar(uuid, uuid) to authenticated;

create or replace function public.permisos_extra_de(_user_id uuid)
returns table(id uuid, clave text, fila text, alcance text, motivo text, otorgado_por_nombre text, otorgado_at timestamptz,
              revocado_por_nombre text, revocado_at timestamptz, puedo_editar boolean)
language sql
stable
security definer
set search_path = public
as $$
  select pe.id, pe.clave, pe.fila, pe.alcance, pe.motivo,
         (select p.full_name from public.profiles p where p.id = pe.otorgado_por), pe.otorgado_at,
         (select p.full_name from public.profiles p where p.id = pe.revocado_por), pe.revocado_at,
         public.permisos_extra_puede_dar((select auth.uid()), _user_id)
    from public.permisos_extra pe
   where pe.user_id = _user_id
     and (_user_id = (select auth.uid())
          or public.es_dueno((select auth.uid()))
          or (public.tiene_funcion((select auth.uid()), 'N:permisos.extra') and public.misma_empresa((select auth.uid()), _user_id))
          or public.ausencias_aprueba_final((select auth.uid()), _user_id))
   order by pe.revocado_at nulls first, pe.otorgado_at desc;
$$;
revoke all on function public.permisos_extra_de(uuid) from public, anon;
grant execute on function public.permisos_extra_de(uuid) to authenticated;

create or replace function public.permisos_extra_otorgar(_user_id uuid, _clave text, _fila text default null, _alcance text default null, _motivo text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if not public.permisos_extra_puede_dar(v_uid, _user_id) then
    raise exception 'permisos_extra_otorgar: no puedes dar permisos especiales a esta persona' using errcode = '42501';
  end if;
  if _clave = 'N:permisos.extra' and not public.es_dueno(v_uid) then
    raise exception 'permisos_extra_otorgar: ese permiso solo lo da el dueño' using errcode = '42501';
  end if;
  insert into public.permisos_extra (user_id, clave, fila, alcance, motivo, otorgado_por)
  values (_user_id, nullif(btrim(_clave), ''), nullif(btrim(_fila), ''), nullif(btrim(_alcance), ''), nullif(btrim(_motivo), ''), v_uid)
  returning id into v_id;
  perform public.ausencias_avisar(_user_id, 'permiso_especial',
    'Tienes un permiso especial nuevo',
    format('%s te dio un permiso especial en Maven.', coalesce((select p.full_name from public.profiles p where p.id = v_uid), 'Alguien')),
    v_id, '/mis-dias');
  return v_id;
end;
$$;
revoke all on function public.permisos_extra_otorgar(uuid, text, text, text, text) from public, anon;
grant execute on function public.permisos_extra_otorgar(uuid, text, text, text, text) to authenticated;

create or replace function public.permisos_extra_revocar(_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_target uuid;
begin
  select pe.user_id into v_target from public.permisos_extra pe where pe.id = _id and pe.revocado_at is null;
  if v_target is null or not public.permisos_extra_puede_dar(v_uid, v_target) then
    raise exception 'permisos_extra_revocar: no se puede revocar' using errcode = '42501';
  end if;
  update public.permisos_extra set revocado_por = v_uid, revocado_at = now() where id = _id;
end;
$$;
revoke all on function public.permisos_extra_revocar(uuid) from public, anon;
grant execute on function public.permisos_extra_revocar(uuid) to authenticated;

-- ─── El calendario de asistencia ─────────────────────────────────────────────
-- Una fila por persona visible y por día: su turno (aunque no se exija), si
-- llegó, tarde, faltó, ausencia (tipo, pagada) o festivo, en vivo (solo hoy) y
-- horas trabajadas contra las del turno. Hasta 42 días por consulta.
create or replace function public.asistencia_dias(_desde date, _hasta date, _user_id uuid default null)
returns table(user_id uuid, nombre text, avatar_url text, avatar_seed text, equipo text, dia date,
              turno_inicio timestamptz, turno_fin timestamptz, estado text, entrada_at timestamptz, tarde_min integer,
              trabajado_min integer, turno_min integer, ausencia_id uuid, ausencia_tipo text, ausencia_estado text,
              ausencia_pagada boolean, ausencia_parcial boolean, festivo text, en_vivo text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_yo uuid := (select auth.uid());
  v_tenant uuid := public.empresa_de(v_yo);
  v_ahora timestamptz := now();
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  p record;
  d date;
  t record;
  a record;
  v_fest text;
  v_ent timestamptz;
  v_tol int;
  v_trab numeric;
begin
  if v_yo is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  if _desde is null or _hasta is null or _hasta < _desde or _hasta - _desde > 41 then
    raise exception 'asistencia_dias: rango no válido (hasta 42 días)' using errcode = 'P0001';
  end if;
  for p in
    select pr.id, pr.full_name, pr.avatar_url, pr.avatar_seed
      from public.profiles pr
      join public.tenant_members m on m.user_id = pr.id and m.tenant_id = v_tenant
     where pr.deleted_at is null
       and (_user_id is null or pr.id = _user_id)
       and public.ausencias_puede_ver(v_yo, pr.id)
     order by pr.full_name
  loop
    d := _desde;
    while d <= _hasta loop
      user_id := p.id; nombre := p.full_name; avatar_url := p.avatar_url; avatar_seed := p.avatar_seed;
      equipo := public.equipo_de(p.id); dia := d;
      turno_inicio := null; turno_fin := null; entrada_at := null; tarde_min := null; trabajado_min := null; turno_min := null;
      ausencia_id := null; ausencia_tipo := null; ausencia_estado := null; ausencia_pagada := null; ausencia_parcial := null;
      en_vivo := null;

      select f.nombre into v_fest from public.ausencias_festivos f where f.tenant_id = v_tenant and f.fecha = d;
      festivo := v_fest;
      select x.id, x.tipo, x.estado, x.pagada, x.hora_desde is not null as parcial into a
        from public.ausencias x
       where x.user_id = p.id and x.estado in ('aprobada', 'pendiente_jefe', 'pendiente_rrhh') and d between x.desde and x.hasta
       order by (x.estado = 'aprobada') desc, x.hora_desde nulls first
       limit 1;
      if found then
        ausencia_id := a.id; ausencia_tipo := a.tipo; ausencia_estado := a.estado;
        ausencia_pagada := a.pagada; ausencia_parcial := a.parcial;
      end if;

      select x.inicio, x.fin into t from public.turno_base_del_dia(p.id, d) x;
      if found then
        turno_inicio := t.inicio; turno_fin := t.fin;
        turno_min := (extract(epoch from (t.fin - t.inicio)) / 60)::int;
      end if;

      if v_fest is not null then
        estado := 'festivo';
      elsif ausencia_estado = 'aprobada' and not ausencia_parcial then
        estado := 'ausente';
      elsif turno_inicio is null then
        estado := 'descanso';
      elsif v_ahora < turno_inicio then
        estado := 'pendiente';
      else
        select min(m.inicio) into v_ent from public.turno_marcas m
         where m.user_id = p.id and m.inicio >= turno_inicio - interval '2 hours' and m.inicio < turno_fin;
        if v_ent is null then
          select min(s.started_at) into v_ent from public.cowork_tiempo_segmentos s
           where s.user_id = p.id and s.started_at >= turno_inicio - interval '2 hours' and s.started_at < turno_fin;
        end if;
        entrada_at := v_ent;
        if v_ent is null then
          estado := case when v_ahora >= turno_fin then 'falto' else 'sin_entrada' end;
        else
          select tr.tarde_min, tr.tolerancia_min into tarde_min, v_tol
            from public.tardanzas_registro tr where tr.user_id = p.id and tr.dia = d limit 1;
          if tarde_min is null then
            tarde_min := greatest(0, ceil(extract(epoch from (v_ent - turno_inicio)) / 60))::int;
            v_tol := 5;
          end if;
          estado := case when tarde_min > coalesce(v_tol, 5) then 'tarde' else 'presente' end;
        end if;
        select sum(extract(epoch from (least(coalesce(m.fin, v_ahora), turno_fin + interval '6 hours') - m.inicio))) into v_trab
          from public.turno_marcas m
         where m.user_id = p.id and m.inicio >= turno_inicio - interval '2 hours' and m.inicio < turno_fin;
        if v_trab is null then
          select sum(coalesce(s.seconds, extract(epoch from (coalesce(s.ended_at, s.last_seen_at) - s.started_at)))) into v_trab
            from public.cowork_tiempo_segmentos s
           where s.user_id = p.id and s.started_at >= turno_inicio - interval '2 hours' and s.started_at < turno_fin;
        end if;
        trabajado_min := greatest(0, coalesce(v_trab, 0) / 60)::int;
      end if;

      if d = v_hoy then
        en_vivo := case
          when exists (select 1 from public.cowork_breaks b where b.user_id = p.id and b.ended_at is null
                         and b.started_at > v_ahora - interval '4 hours') then 'en_pausa'
          when public.presente_en_cowork(p.id, v_ahora) then 'conectado'
          else 'desconectado' end;
      end if;
      return next;
      d := d + 1;
    end loop;
  end loop;
end;
$$;
revoke all on function public.asistencia_dias(date, date, uuid) from public, anon;
grant execute on function public.asistencia_dias(date, date, uuid) to authenticated;

-- ─── Recordatorios (cron) ────────────────────────────────────────────────────
-- Pendientes > 48 h → a RR. HH. (una vez). La tarde antes de volver → a la persona.
create or replace function public.ausencias_recordatorios()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  x record;
  n int := 0;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_hora int := extract(hour from (now() at time zone 'America/Bogota'))::int;
begin
  for r in
    select a.*, p.full_name from public.ausencias a join public.profiles p on p.id = a.user_id
     where a.estado in ('pendiente_jefe', 'pendiente_rrhh') and a.recordado_at is null
       and coalesce(a.jefe_at, a.created_at) < now() - interval '48 hours'
  loop
    for x in select y.user_id from public.ausencias_rrhh_de(r.user_id) y loop
      perform public.ausencias_avisar(x.user_id, 'ausencia_pendiente_48h',
        format('%s lleva más de 48 h esperando', coalesce(nullif(btrim(r.full_name), ''), 'Una solicitud')),
        format('La solicitud de %s %s sigue %s.', public.ausencias_nombre_tipo(r.tipo),
               public.ausencias_fechas_texto(r.desde, r.hasta, r.hora_desde, r.hora_hasta),
               case when r.estado = 'pendiente_jefe' then 'sin respuesta del jefe' else 'esperando tu aprobación final' end),
        r.id, '/asistencia?tab=ausencias&id=' || r.id);
    end loop;
    update public.ausencias set recordado_at = now() where id = r.id;
    n := n + 1;
  end loop;

  if v_hora >= 17 then
    for r in
      select a.* from public.ausencias a
       where a.estado = 'aprobada' and a.hora_desde is null and a.hasta = v_hoy and a.regreso_avisado_at is null
    loop
      perform public.ausencias_avisar(r.user_id, 'ausencia_regreso',
        'Mañana vuelves',
        format('Tu %s termina hoy. Mañana Maven te espera en tu horario de siempre.', public.ausencias_nombre_tipo(r.tipo)),
        r.id, '/mis-dias');
      update public.ausencias set regreso_avisado_at = now() where id = r.id;
      n := n + 1;
    end loop;
  end if;
  return n;
end;
$$;
revoke all on function public.ausencias_recordatorios() from public, anon, authenticated;

do $cron$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ausencias-recordatorios';
    perform cron.schedule('ausencias-recordatorios', '20 * * * *', 'select public.ausencias_recordatorios()');
  end if;
end $cron$;

-- ─── El adjunto: buzón privado ───────────────────────────────────────────────
-- Carpeta = id de la persona. Sube la persona (o RR. HH. al registrar); lo leen
-- la persona y quien da la aprobación final. Nadie más (ni el jefe).
do $sto$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('ausencias-adjuntos', 'ausencias-adjuntos', false, 10485760,
            array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
    on conflict (id) do update set public = false;

    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'ausencias_adjuntos_subir') then
      create policy ausencias_adjuntos_subir on storage.objects for insert to authenticated
        with check (bucket_id = 'ausencias-adjuntos'
                    and ((storage.foldername(name))[1] = ((select auth.uid()))::text
                         or public.ausencias_aprueba_final((select auth.uid()), public.uuid_o_null((storage.foldername(name))[1]))));
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'ausencias_adjuntos_ver') then
      create policy ausencias_adjuntos_ver on storage.objects for select to authenticated
        using (bucket_id = 'ausencias-adjuntos'
               and ((storage.foldername(name))[1] = ((select auth.uid()))::text
                    or public.ausencias_aprueba_final((select auth.uid()), public.uuid_o_null((storage.foldername(name))[1]))));
    end if;
  end if;
end $sto$;

-- ─── Posiciones: las funciones nuevas en los puestos de hoy ──────────────────
-- Es configuración de PUESTOS (no de personas), como en 20261119200000: RR. HH.
-- y Admin dan la aprobación final y ven a todos; los supervisores aprueban y ven
-- a su equipo; Admin da permisos especiales. Cada empresa lo cambia en Posiciones.
do $pos$ begin
  if to_regclass('public.posiciones_borrador') is not null then
    update public.posiciones_borrador
       set checks = checks || '{"N:ausencias.aprobar_final": true, "N:permisos.extra": true}'::jsonb,
           alcances = alcances || '{"Ausencias": "all"}'::jsonb, updated_at = now()
     where nombre = 'Admin';
    update public.posiciones_borrador
       set checks = checks || '{"N:ausencias.aprobar_final": true}'::jsonb,
           alcances = alcances || '{"Ausencias": "all"}'::jsonb, updated_at = now()
     where nombre in ('HHRR', 'Jefe de RR. HH.');
    update public.posiciones_borrador
       set checks = checks || '{"N:ausencias.aprobar_equipo": true}'::jsonb,
           alcances = alcances || '{"Ausencias": "subordinates"}'::jsonb, updated_at = now()
     where nombre in ('Chatter Supervisor', 'Operations Sales');
  end if;
end $pos$;

-- Mi horario (para «Mis días»): el de cada día de la semana, o el de siempre.
create or replace function public.mi_horario_semana()
returns table(dia smallint, entrada time, salida time, por_semana boolean)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (select (select auth.uid()) as uid),
  sem as (select exists (select 1 from public.horario_semanal w, yo where w.user_id = yo.uid) as tiene)
  select d.n::smallint,
         case when sem.tiene then hs.entrada else b.entrada end,
         case when sem.tiene then hs.salida else b.salida end,
         sem.tiene
    from (values (1), (2), (3), (4), (5), (6), (0)) as d(n)
    cross join yo cross join sem
    left join public.horario_semanal hs on hs.user_id = yo.uid and hs.dia = d.n
    left join lateral public.horario_base_de(yo.uid) b on true;
$$;
revoke all on function public.mi_horario_semana() from public, anon;
grant execute on function public.mi_horario_semana() to authenticated;
