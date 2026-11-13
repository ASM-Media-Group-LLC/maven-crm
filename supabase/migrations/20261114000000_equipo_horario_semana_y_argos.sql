-- HORARIO POR SEMANA DESDE LA PLATAFORMA + LO DE ARGOS DE VUELTA (13/11/2026).
--
-- El problema: cada persona tenía UN solo turno diario (hora_entrada / hora_salida), sin
-- días. Los fines de semana todos se veían «no ha entrado», Argos los llamaba y los
-- reportaba. Ahora la plataforma de la agencia (Backstage) puede mandar el horario de
-- cada día de la semana, y lo que no trae turno es descanso.
--
--   1. horario_semanal: una fila por persona y día (0 = domingo … 6 = sábado, como
--      extract(dow)). Quien tiene filas aquí tiene horario por semana; un día con
--      entrada y salida en null es descanso. Se guardan siempre los 7 días, así una
--      semana entera de descanso (vacaciones) también se puede decir. Se lee con la
--      RLS (la persona y quien la puede vigilar) y se escribe SOLO por
--      api_equipo_aplicar (security definer, la plataforma con su key).
--   2. turno_del_dia(uid, día): el turno que empieza ese día (Bogotá). Con horario por
--      semana, el de ese día de la semana (descanso = sin turno); sin él, lo de siempre
--      (horario_de: lo propio, el turno asignado o el del rol).
--   3. horario_de devuelve, a quien tiene horario por semana, el de HOY (null en su
--      descanso). turno_en_curso usa turno_del_dia para hoy y ayer (los turnos que
--      cruzan la medianoche siguen igual).
--   4. Los vigías: el resumen de cierre de turno (vigilar_tiempo_sin_pantalla, 4b) mira
--      el turno de cada día con turno_del_dia, y «nunca entró» (vigilar_fuera_de_cowork)
--      también cuenta como horario propio el horario por semana. Los avisos dicen la
--      hora del turno en curso (no la de «hoy», que en un turno de noche ya es otro día).
--   5. POST /equipo/sync: el campo horario_semana (api_equipo_estado lo devuelve;
--      api_equipo_aplicar lo valida otra vez y lo guarda).
--   6. GET /equipo/argos: lo de Argos por persona y turno (api_equipo_argos), con el
--      mismo acceso que api_equipo_horas y api_equipo_notas (la key, su agencia).
--
-- Los cuerpos de horario_de, turno_en_curso, los dos vigías, api_equipo_estado y
-- api_equipo_aplicar se copiaron de PRODUCCIÓN (pg_get_functiondef, 13/11/2026) y solo
-- cambia lo dicho arriba. Se prueba en supabase/tests/agencias_conectadas.ts.

set local lock_timeout = '3s';

-- ─── 1. El horario por semana ────────────────────────────────────────────────

create table if not exists public.horario_semanal (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  dia            smallint not null check (dia between 0 and 6),
  entrada        time,
  salida         time,
  actualizado_at timestamptz not null default now(),
  primary key (user_id, dia),
  -- Los dos o ninguno (descanso); y un turno no dura cero horas.
  constraint horario_semanal_par check ((entrada is null) = (salida is null)),
  constraint horario_semanal_con_horas check (entrada is null or entrada <> salida)
);

alter table public.horario_semanal enable row level security;

-- La persona y quien la puede vigilar. Con puede_vigilar(user_id), que es
-- puede_vigilar_a((select auth.uid()), user_id) y SÍ la puede ejecutar authenticated:
-- una política corre con los permisos de quien consulta, y puede_vigilar_a está
-- cerrada para authenticated (20261111210000), así que con ella cada select de la app
-- fallaría con «permission denied for function puede_vigilar_a».
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'horario_semanal' and policyname = 'horario_semanal_ver') then
    create policy horario_semanal_ver on public.horario_semanal
      for select to authenticated
      using (user_id = (select auth.uid()) or public.puede_vigilar(user_id));
  end if;
end $$;

-- Nadie lo escribe con su sesión: solo api_equipo_aplicar (definer).
revoke all on table public.horario_semanal from anon, authenticated;
grant select on table public.horario_semanal to authenticated;

-- ¿Sirve como horario por semana? { "lun": ["08:00", "16:00"], …, "dom": null }: solo
-- esas 7 claves; cada una null o [entrada, salida] en 24 h, distintas. La edge ya lo
-- validó (equipo-logica.ts); esto es la pared. Todo va en CASE: un AND no asegura el
-- orden, y un cast a time o un jsonb_each sobre algo que no sirve lanzaría un error en
-- vez de decir «no».
create or replace function public.equipo_horario_semana_valido(_h jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
           when _h is null or jsonb_typeof(_h) <> 'object' then false
           else not exists (
             select 1 from jsonb_each(_h) as e(k, v)
              where not (case
                           when e.k not in ('lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom') then false
                           when jsonb_typeof(e.v) = 'null' then true
                           when jsonb_typeof(e.v) <> 'array' then false
                           when jsonb_array_length(e.v) <> 2 then false
                           when jsonb_typeof(e.v -> 0) <> 'string' or jsonb_typeof(e.v -> 1) <> 'string' then false
                           when (e.v ->> 0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
                             or (e.v ->> 1) !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then false
                           else (e.v ->> 0)::time <> (e.v ->> 1)::time
                         end))
         end;
$$;
revoke all on function public.equipo_horario_semana_valido(jsonb) from public, anon, authenticated;

-- El horario por semana de una persona, como lo ve la plataforma: null si no tiene; si
-- tiene, los 7 días ({ "lun": ["08:00:00", "16:00:00"], …, "dom": null }).
create or replace function public.equipo_horario_semana(_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_object_agg(d.k, case when hs.entrada is null then 'null'::jsonb
                                    else jsonb_build_array(hs.entrada::text, hs.salida::text) end)
    from (values (1, 'lun'), (2, 'mar'), (3, 'mie'), (4, 'jue'), (5, 'vie'), (6, 'sab'), (0, 'dom')) as d(n, k)
    left join public.horario_semanal hs on hs.user_id = _uid and hs.dia = d.n
   where exists (select 1 from public.horario_semanal w where w.user_id = _uid);
$$;
revoke all on function public.equipo_horario_semana(uuid) from public, anon, authenticated;

-- ─── 2. El turno de un día ───────────────────────────────────────────────────
-- El turno que EMPIEZA ese día (Bogotá, sin horario de verano). Un turno que cruza la
-- medianoche termina al día siguiente. Sin turno ese día (descanso, o nadie le puso
-- horario): ninguna fila.

create or replace function public.turno_del_dia(_uid uuid, _dia date)
returns table(inicio timestamptz, fin timestamptz)
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
    select h.entrada, h.salida into v_ent, v_sal from public.horario_de(_uid) h;
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
revoke all on function public.turno_del_dia(uuid, date) from public, anon, authenticated;
grant execute on function public.turno_del_dia(uuid, date) to service_role;

-- ─── 3. horario_de y turno_en_curso ──────────────────────────────────────────
-- horario_de: igual que en producción, pero a quien tiene horario por semana le da el
-- de HOY (Bogotá); en su día de descanso, entrada y salida en null. exento no cambia.

create or replace function public.horario_de(_uid uuid)
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

-- turno_en_curso: el de hoy o el de ayer (si cruza la medianoche), ahora con
-- turno_del_dia. Para quien no tiene horario por semana da lo mismo que antes.
create or replace function public.turno_en_curso(_uid uuid, _ahora timestamp with time zone default now())
returns table(inicio timestamp with time zone, fin timestamp with time zone)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_dia date := (_ahora at time zone 'America/Bogota')::date;
  t record;
  d int;
begin
  foreach d in array array[0, -1] loop
    select x.inicio as ini, x.fin as fin_turno into t from public.turno_del_dia(_uid, v_dia + d) x;
    if found and _ahora >= t.ini and _ahora < t.fin_turno then
      inicio := t.ini;
      fin := t.fin_turno;
      return next;
      return;
    end if;
  end loop;
end;
$$;

-- Los mismos permisos que en producción (create or replace los conserva; esto es para
-- una base nueva, como la de los bancos de prueba).
revoke all on function public.horario_de(uuid) from public, anon;
grant execute on function public.horario_de(uuid) to authenticated, service_role;
revoke all on function public.turno_en_curso(uuid, timestamp with time zone) from public, anon;
grant execute on function public.turno_en_curso(uuid, timestamp with time zone) to authenticated, service_role;

-- ─── 4. Los vigías ───────────────────────────────────────────────────────────
-- vigilar_fuera_de_cowork: igual que en producción (20261113220000), salvo:
--   · los llamados a quien está fuera dicen la hora del turno EN CURSO (turno_en_curso)
--     y no la de horario_de, que con horario por semana es la de hoy;
--   · «nunca entró» también cuenta como horario propio el horario por semana, y dice la
--     hora a la que empezó su turno en curso.

create or replace function public.vigilar_fuera_de_cowork()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_ahora timestamptz := now();
  v_avisos int := 0;
  v_n int;
  v_min int;
  v_nom text;
  v_turno date;
begin
  -- 1) Cerrar: volvió (Cowork, pausa u otra llamada de Maven), o se le acabó el turno.
  for r in select f.id, f.user_id, f.desde from public.cowork_fuera f where f.hasta is null loop
    if public.presente_en_cowork(r.user_id, v_ahora) then
      update public.cowork_fuera set hasta = v_ahora, motivo = 'volvio' where id = r.id;
    elsif not exists (select 1 from public.turno_en_curso(r.user_id, v_ahora)) then
      update public.cowork_fuera
         set hasta = least(v_ahora, coalesce((select t.fin from public.turno_en_curso(r.user_id, r.desde) t), v_ahora)),
             motivo = 'fin_de_turno'
       where id = r.id;
    end if;
  end loop;

  -- 2) Abrir: en su turno, entró para este turno, no está, y no se fue en los
  --    últimos 10 minutos del turno.
  for r in
    select p.id as uid, tm.tenant_id, t.inicio, t.fin,
           (select max(coalesce(s.ended_at, s.last_seen_at)) from public.cowork_tiempo_segmentos s
             where s.user_id = p.id and coalesce(s.ended_at, s.last_seen_at) >= t.inicio - interval '30 minutes') as ultimo
      from public.profiles p
      join lateral (select m.tenant_id from public.tenant_members m where m.user_id = p.id limit 1) tm on true
      cross join lateral public.turno_en_curso(p.id, v_ahora) t
     where p.deleted_at is null
       and public.debe_estar_en_cowork(p.id)
       and not coalesce((select h.exento from public.horario_de(p.id) h), false)
       and not exists (select 1 from public.cowork_fuera f where f.user_id = p.id and f.hasta is null)
  loop
    continue when r.ultimo is null;
    continue when public.presente_en_cowork(r.uid, v_ahora);
    continue when greatest(r.ultimo, r.inicio) >= r.fin - interval '10 minutes';
    insert into public.cowork_fuera (user_id, tenant_id, desde)
    values (r.uid, r.tenant_id, greatest(r.ultimo, r.inicio,
            coalesce((select max(f.hasta) from public.cowork_fuera f where f.user_id = r.uid), r.inicio)))
    on conflict do nothing;
  end loop;

  -- 3) Llamados: al minuto el primero, después cada 2 min hasta que vuelva. Al 3ro,
  --    «te estoy reportando» y el aviso a sus jefes (una vez por salida). La hora del
  --    aviso es la del turno en curso.
  for r in
    select f.id, f.user_id, f.desde, f.llamados, f.reportado_at, p.full_name,
           (t.inicio at time zone 'America/Bogota')::time as entrada,
           (t.fin at time zone 'America/Bogota')::time as salida
      from public.cowork_fuera f
      join public.profiles p on p.id = f.user_id
      left join lateral public.turno_en_curso(f.user_id, v_ahora) t on true
     where f.hasta is null and f.desde <= v_ahora - interval '1 minute'
       and (f.ultimo_llamado_at is null or f.ultimo_llamado_at <= v_ahora - interval '110 seconds')
  loop
    v_n := r.llamados + 1;
    v_min := greatest(1, round(extract(epoch from (v_ahora - r.desde)) / 60))::int;

    insert into public.notifications
      (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    values (r.user_id, 'cowork_fuera_tu',
            case when v_n >= 3 then 'Te estoy reportando: sigues fuera de Cowork'
                 when v_n = 2 then 'Sigues fuera de Cowork en tu turno'
                 else 'Saliste de Cowork en tu turno' end,
            case when v_n >= 3 then format('Llevas %s min fuera y no volviste. Ya le avisé a tu supervisor. Entra a Cowork ya, con cámara y pantalla.', v_min)
                 else format('Llevas %s min fuera. Entra a Cowork ya, con cámara y pantalla completa. Mientras estés fuera cuenta en tu nota.', v_min) end,
            'cowork', 'Cowork', 'high', 'new', 'personal', '/cowork');

    if v_n >= 3 and r.reportado_at is null then
      insert into public.notifications
        (user_id, type, title, message, reference_id, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
      select d.user_id, 'cowork_fuera',
             format('%s sigue fuera de Cowork', coalesce(nullif(trim(r.full_name), ''), 'Un empleado')),
             format('Está en su turno (%s–%s), salió a las %s y lleva %s min fuera. Argos le hizo 3 llamados y no volvió.',
                    to_char(r.entrada, 'HH24:MI'), to_char(r.salida, 'HH24:MI'),
                    to_char(r.desde at time zone 'America/Bogota', 'HH24:MI'), v_min),
             r.user_id, 'profile', 'HR', 'high', 'new', 'personal',
             format('/hr/en-vivo/%s?fuera=%s', r.user_id, r.id)
        from public.destinatarios_de_aviso(r.user_id) d;
    end if;

    update public.cowork_fuera
       set llamados = v_n, ultimo_llamado_at = v_ahora,
           avisado_at = coalesce(avisado_at, v_ahora),
           reportado_at = case when v_n >= 3 then coalesce(reportado_at, v_ahora) else reportado_at end
     where id = r.id;
    v_avisos := v_avisos + 1;
  end loop;

  -- 4) NUNCA ENTRÓ en su turno (solo con horario propio, también el horario por
  --    semana): a los 10 min de empezar, llamados cada 2 min; al 3ro, el reporte a sus
  --    jefes.
  for r in
    select p.id as uid, p.full_name, tm.tenant_id, t.inicio,
           (t.inicio at time zone 'America/Bogota')::time as entrada,
           n.llamados, n.reportado_at
      from public.profiles p
      join lateral (select m.tenant_id from public.tenant_members m where m.user_id = p.id limit 1) tm on true
      cross join lateral public.turno_en_curso(p.id, v_ahora) t
      left join lateral public.horario_de(p.id) h on true
      left join public.argos_no_entro n
             on n.user_id = p.id and n.turno = (t.inicio at time zone 'America/Bogota')::date
     where p.deleted_at is null
       and (p.hora_entrada is not null or p.turno_id is not null
            or exists (select 1 from public.horario_semanal hs where hs.user_id = p.id))
       and public.debe_estar_en_cowork(p.id)
       and not coalesce(h.exento, false)
       and v_ahora >= t.inicio + interval '10 minutes'
       and v_ahora < t.fin - interval '10 minutes'
       and not exists (select 1 from public.cowork_tiempo_segmentos s
                        where s.user_id = p.id and coalesce(s.ended_at, s.last_seen_at) >= t.inicio - interval '30 minutes')
       and (n.ultimo_llamado_at is null or n.ultimo_llamado_at <= v_ahora - interval '110 seconds')
  loop
    continue when public.presente_en_cowork(r.uid, v_ahora);
    v_turno := (r.inicio at time zone 'America/Bogota')::date;
    v_n := coalesce(r.llamados, 0) + 1;
    v_min := greatest(1, round(extract(epoch from (v_ahora - r.inicio)) / 60))::int;
    v_nom := coalesce(nullif(trim(r.full_name), ''), 'Un empleado');

    insert into public.notifications
      (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    values (r.uid, 'cowork_no_entro_tu',
            case when v_n >= 3 then 'Te estoy reportando: no has entrado a Cowork'
                 else 'Ya empezó tu turno y no has entrado a Cowork' end,
            case when v_n >= 3 then format('Tu turno empezó a las %s. Ya le avisé a tu supervisor. Entra a Cowork ya, con cámara y pantalla.', to_char(r.entrada, 'HH24:MI'))
                 else format('Tu turno empezó a las %s. Entra a Cowork ya, con cámara y pantalla completa.', to_char(r.entrada, 'HH24:MI')) end,
            'cowork', 'Cowork', 'high', 'new', 'personal', '/cowork');

    if v_n >= 3 and r.reportado_at is null then
      insert into public.notifications
        (user_id, type, title, message, reference_id, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
      select d.user_id, 'cowork_no_entro',
             format('%s no ha entrado a Cowork', v_nom),
             format('Debía entrar a las %s y lleva %s min sin entrar. Argos le hizo 3 llamados.', to_char(r.entrada, 'HH24:MI'), v_min),
             r.uid, 'profile', 'HR', 'high', 'new', 'personal', format('/hr/expediente/%s', r.uid)
        from public.destinatarios_de_aviso(r.uid) d;
    end if;

    insert into public.argos_no_entro (user_id, turno, llamados, ultimo_llamado_at, reportado_at, tenant_id)
    values (r.uid, v_turno, v_n, v_ahora, case when v_n >= 3 then v_ahora end, r.tenant_id)
    on conflict (user_id, turno) do update
      set llamados = excluded.llamados, ultimo_llamado_at = excluded.ultimo_llamado_at,
          reportado_at = coalesce(public.argos_no_entro.reportado_at, excluded.reportado_at);
    v_avisos := v_avisos + 1;
  end loop;

  return v_avisos;
end;
$function$;

-- vigilar_tiempo_sin_pantalla: igual que en producción (20261113220000), salvo el
-- resumen al cerrar el turno (4b): antes armaba los turnos de hoy y de ayer con UNA
-- entrada y salida (horario_de); ahora con turno_del_dia, el de cada día. Así el turno
-- de ayer de alguien que hoy descansa también tiene su resumen, y un día de descanso
-- no lo tiene.

create or replace function public.vigilar_tiempo_sin_pantalla()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  j record;
  v_ahora timestamptz := now();
  v_dia date := (now() at time zone 'America/Bogota')::date;
  v_turno date;
  v_sin int;
  v_perm int;
  v_entro boolean;
  v_faltas int;
  v_fotos int;
  v_nom text;
  v_avisos int := 0;
begin
  -- 4a) AL MOMENTO: en su turno, ya entró, y se pasó de lo permitido.
  for r in
    select p.id as uid, p.full_name, tm.tenant_id, t.inicio, t.fin
      from public.profiles p
      join lateral (select m.tenant_id from public.tenant_members m where m.user_id = p.id limit 1) tm on true
      cross join lateral public.turno_en_curso(p.id, v_ahora) t
     where p.deleted_at is null
       and public.debe_estar_en_cowork(p.id)
       and not coalesce((select h.exento from public.horario_de(p.id) h), false)
       and exists (select 1 from public.cowork_tiempo_segmentos s
                    where s.user_id = p.id and coalesce(s.ended_at, s.last_seen_at) >= t.inicio - interval '30 minutes')
  loop
    v_turno := (r.inicio at time zone 'America/Bogota')::date;
    continue when exists (select 1 from public.argos_tiempo_avisos a
                           where a.user_id = r.uid and a.turno = v_turno and a.tipo = 'pasado');
    v_perm := public.argos_permitido_min(r.uid);
    v_sin := round(public.argos_sin_pantalla_seg(r.uid, r.inicio, v_ahora) / 60.0);
    continue when v_sin <= v_perm;

    insert into public.argos_tiempo_avisos (user_id, turno, tipo, sin_pantalla_min, permitido_min, tenant_id)
    values (r.uid, v_turno, 'pasado', v_sin, v_perm, r.tenant_id)
    on conflict do nothing;

    v_nom := coalesce(nullif(trim(r.full_name), ''), 'Un empleado');
    insert into public.notifications
      (user_id, type, title, message, reference_id, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    select d.user_id, 'argos_tiempo_pasado',
           format('%s se pasó de su tiempo sin pantalla', v_nom),
           format('Lleva %s min sin pantalla en su turno (%s–%s) y tiene %s permitidos (comida + baño).',
                  v_sin, to_char(r.inicio at time zone 'America/Bogota', 'HH24:MI'),
                  to_char(r.fin at time zone 'America/Bogota', 'HH24:MI'), v_perm),
           r.uid, 'profile', 'HR', 'high', 'new', 'personal', format('/hr/expediente/%s', r.uid)
      from public.destinatarios_de_aviso(r.uid) d;

    insert into public.notifications
      (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    values (r.uid, 'argos_tiempo_pasado_tu', 'Te pasaste de tu tiempo sin pantalla',
            format('Llevas %s min sin compartir pantalla en tu turno y tienes %s (comida + baño). Vuelve a Cowork con cámara y pantalla.',
                   v_sin, v_perm),
            'cowork', 'Cowork', 'high', 'new', 'personal', '/cowork');
    v_avisos := v_avisos + 1;
  end loop;

  -- 4b) AL CERRAR EL TURNO: la foto de cada persona cuyo turno terminó hace 10 min
  --     o más (y menos de 3 h), una vez por turno. El turno de hoy y el de ayer, cada
  --     uno con turno_del_dia (un día de descanso no tiene turno).
  for r in
    select p.id as uid, p.full_name, tm.tenant_id, x.ini, x.fin
      from public.profiles p
      join lateral (select m.tenant_id from public.tenant_members m where m.user_id = p.id limit 1) tm on true
      join lateral public.horario_de(p.id) h on not coalesce(h.exento, false)
      cross join lateral (
        select t.inicio as ini, t.fin
          from unnest(array[0, -1]) as d
         cross join lateral public.turno_del_dia(p.id, v_dia + d) t
      ) x
     where p.deleted_at is null
       and public.debe_estar_en_cowork(p.id)
       and x.fin <= v_ahora - interval '10 minutes'
       and x.fin > v_ahora - interval '3 hours'
  loop
    v_turno := (r.ini at time zone 'America/Bogota')::date;
    continue when exists (select 1 from public.argos_tiempo_avisos a
                           where a.user_id = r.uid and a.turno = v_turno and a.tipo = 'resumen');
    v_entro := exists (select 1 from public.cowork_tiempo_segmentos s
                        where s.user_id = r.uid and s.started_at < r.fin
                          and coalesce(s.ended_at, s.last_seen_at) >= r.ini - interval '30 minutes');
    v_perm := public.argos_permitido_min(r.uid);
    v_sin := case when v_entro then round(public.argos_sin_pantalla_seg(r.uid, r.ini, r.fin) / 60.0) else 0 end;
    select count(*) into v_faltas from public.monitor_eventos e
     where e.user_id = r.uid and e.created_at >= r.ini and e.created_at < r.fin;
    select count(*) into v_fotos from public.monitor_capturas c
     where c.user_id = r.uid and c.tipo = 'pantalla' and c.created_at >= r.ini and c.created_at < r.fin;

    insert into public.argos_tiempo_avisos (user_id, turno, tipo, sin_pantalla_min, permitido_min, faltas, fotos, entro, tenant_id, created_at)
    values (r.uid, v_turno, 'resumen', v_sin, v_perm, v_faltas, v_fotos, v_entro, r.tenant_id, v_ahora)
    on conflict do nothing;

    if v_entro then
      insert into public.notifications
        (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
      values (r.uid, 'argos_resumen_turno_tu',
              case when v_sin > v_perm then 'Tu turno: te pasaste de tu tiempo sin pantalla' else 'Tu turno: dentro de tu tiempo' end,
              format('Estuviste %s min sin pantalla de %s permitidos · %s fallas · %s fotos.', v_sin, v_perm, v_faltas, v_fotos),
              'cowork', 'Cowork', 'normal', 'new', 'personal', '/dashboard');
    end if;
  end loop;

  -- 4c) UN resumen por jefe con su gente de este cierre (los que se pasaron arriba).
  --     Si nadie del cierre entró (día libre, festivo), no se manda.
  for j in
    select d.user_id as jefe,
           count(*) filter (where a.entro and a.sin_pantalla_min > a.permitido_min) as pasados,
           count(*) filter (where a.entro and a.sin_pantalla_min <= a.permitido_min) as dentro,
           count(*) filter (where not a.entro) as sin_entrar,
           -- Los 6 que más se pasaron; el resto se cuenta («+3 más»).
           (array_agg(format('%s %s de %s min', trim(split_part(p.full_name, ' ', 1) || ' ' || split_part(p.full_name, ' ', 2)),
                             a.sin_pantalla_min, a.permitido_min)
                      order by (a.sin_pantalla_min - a.permitido_min) desc)
              filter (where a.entro and a.sin_pantalla_min > a.permitido_min))[1:6] as top
      from public.argos_tiempo_avisos a
      join public.profiles p on p.id = a.user_id
      cross join lateral public.destinatarios_de_aviso(a.user_id) d
     where a.tipo = 'resumen' and a.created_at = v_ahora
     group by d.user_id
    having count(*) filter (where a.entro) > 0
  loop
    insert into public.notifications
      (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    values (j.jefe, 'argos_resumen_turno',
            case when j.pasados = 0 then 'Resumen del turno: todos dentro de su tiempo'
                 when j.pasados = 1 then 'Resumen del turno: 1 se pasó de su tiempo sin pantalla'
                 else format('Resumen del turno: %s se pasaron de su tiempo sin pantalla', j.pasados) end,
            concat_ws(' ',
                      case when j.top is not null then array_to_string(j.top, ' · ')
                           || case when j.pasados > 6 then format(' · +%s más', j.pasados - 6) else '' end || '.' end,
                      format('%s dentro de su tiempo · %s sin entrar.', j.dentro, j.sin_entrar)),
            'profile', 'HR', 'normal', 'new', 'personal', '/hr/monitor-ia?t=dia');
    v_avisos := v_avisos + 1;
  end loop;

  return v_avisos;
end;
$function$;

-- Solo el cron (y la edge con service_role), como en producción.
revoke all on function public.vigilar_fuera_de_cowork() from public, anon, authenticated;
grant execute on function public.vigilar_fuera_de_cowork() to service_role;
revoke all on function public.vigilar_tiempo_sin_pantalla() from public, anon, authenticated;
grant execute on function public.vigilar_tiempo_sin_pantalla() to service_role;

-- ─── 5. POST /equipo/sync: horario_semana ────────────────────────────────────
-- api_equipo_estado: igual que en producción (20261111190000), más el horario por
-- semana de cada persona (null si no tiene), para que la edge compare.

create or replace function public.api_equipo_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _k public.api_keys := public.api_equipo_llave();
  _cfg public.integracion_equipo;
begin
  select * into _cfg from public.integracion_equipo c where c.tenant_id = _k.tenant_id;
  return jsonb_build_object(
    'agencia', _k.tenant_id,
    'aplicar', coalesce(_cfg.aplicar, false),
    'max_bajas', coalesce(_cfg.max_bajas_por_sync, 5),
    'mapa_roles', coalesce(_cfg.mapa_roles, '{}'::jsonb),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nombre', rc.name,
               'es_admin', lower(rc.name) = 'admin' or coalesce(rg.is_admin, false),
               'origen', rc.origen,
               'con_permisos', exists (select 1 from public.role_permissions rp
                                        where rp.role_id = rc.id and rp.can_access))
             order by rc.name)
        from public.roles_config rc
        left join public.role_groups rg on rg.role_name = rc.name and rg.tenant_id = rc.tenant_id
       where rc.tenant_id = _k.tenant_id and rc.is_active
    ), '[]'::jsonb),
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'correo', lower(u.email),
               'nombre', p.full_name,
               'rol', (select ur.role from public.user_roles ur
                        where ur.user_id = p.id and ur.tenant_id = _k.tenant_id
                        order by ur.role limit 1),
               'nivel', p.nivel,
               'hora_entrada', p.hora_entrada::text,
               'hora_salida', p.hora_salida::text,
               'horario_semana', public.equipo_horario_semana(p.id),
               'equipo', ip.equipo,
               'reporta_a', ip.reporta_a,
               'en_papelera', p.deleted_at is not null,
               'protegido', public.equipo_protegido(p.id))
             order by p.id)
        from public.tenant_members tm
        join public.profiles p on p.id = tm.user_id
        join auth.users u on u.id = p.id
        left join public.integracion_equipo_personas ip on ip.user_id = p.id and ip.tenant_id = _k.tenant_id
       where tm.tenant_id = _k.tenant_id
         and coalesce(u.raw_app_meta_data ->> 'tipo', '') <> 'creadora'
    ), '[]'::jsonb)
  );
end;
$$;

-- api_equipo_aplicar: igual que en producción (20261111120000), más el campo
-- horario_semana. Su valor llega como texto con el JSON de los 7 días (la edge lo
-- arma) o null (= quitar el horario por semana: vuelve a valer hora_entrada/salida).
-- Aplicar reemplaza los 7 días de una vez; un día en null es descanso.

create or replace function public.api_equipo_aplicar(_cambios jsonb, _resumen jsonb, _ensayo boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  _k public.api_keys := public.api_equipo_llave();
  _yo uuid := auth.uid();
  _cfg public.integracion_equipo;
  _ensayo_final boolean;
  _bajas integer;
  _c jsonb;
  _uid uuid;
  _campo text;
  _txt text;
  _jefe uuid;
  _hs jsonb;
  _motivo text;
  _aplicados jsonb := '[]'::jsonb;
  _rechazados jsonb := '[]'::jsonb;
  _huella text;
  _ultima_id uuid;
  _ultima_huella text;
  _ultima_ensayo boolean;
  _sync uuid;
  _recibidas integer;
begin
  if _cambios is null or jsonb_typeof(_cambios) <> 'array' or jsonb_array_length(_cambios) > 10000 then
    raise exception 'api_equipo_aplicar: _cambios tiene que ser una lista (hasta 10.000)';
  end if;
  if _resumen is null or jsonb_typeof(_resumen) <> 'object' or pg_column_size(_resumen) > 4000000 then
    raise exception 'api_equipo_aplicar: _resumen tiene que ser un objeto (hasta 4 MB)';
  end if;

  -- Un envío a la vez por agencia: dos a la vez se pisarían.
  perform pg_advisory_xact_lock(hashtextextended('integracion_equipo:' || _k.tenant_id::text, 0));

  insert into public.integracion_equipo (tenant_id) values (_k.tenant_id) on conflict (tenant_id) do nothing;
  select * into _cfg from public.integracion_equipo c where c.tenant_id = _k.tenant_id for update;
  _ensayo_final := coalesce(_ensayo, false) or not _cfg.aplicar;

  select count(*) into _bajas from jsonb_array_elements(_cambios) as x(v) where x.v ->> 'campo' = 'papelera';

  -- Las bajas al final: un cambio de jefe hacia alguien que se va en este mismo envío
  -- se valida antes de que se vaya.
  for _c in
    select x.v from jsonb_array_elements(_cambios) as x(v) order by (x.v ->> 'campo' = 'papelera')
  loop
    _motivo := null;
    _campo := _c ->> 'campo';
    _uid := null;
    _jefe := null;
    _txt := null;
    _hs := null;
    begin
      _uid := (_c ->> 'user_id')::uuid;
    exception when others then
      _motivo := 'user_id_invalido';
    end;

    if _motivo is null and (_uid is null or not exists (
         select 1 from public.tenant_members tm
           join public.profiles p on p.id = tm.user_id
           join auth.users u on u.id = p.id
          where tm.user_id = _uid and tm.tenant_id = _k.tenant_id
            and coalesce(u.raw_app_meta_data ->> 'tipo', '') <> 'creadora')) then
      _motivo := 'no_es_de_la_agencia';
    end if;
    if _motivo is null and (_uid = _yo or public.equipo_protegido(_uid)) then
      _motivo := 'protegido';
    end if;
    if _motivo is null and exists (select 1 from public.profiles p where p.id = _uid and p.deleted_at is not null) then
      _motivo := 'en_papelera';
    end if;

    if _motivo is null then
      -- El valor: texto o null (nada de números ni objetos). El horario por semana
      -- llega como texto con su JSON.
      if _c -> 'valor' is null or jsonb_typeof(_c -> 'valor') = 'null' then
        _txt := null;
      elsif jsonb_typeof(_c -> 'valor') = 'string' then
        _txt := _c ->> 'valor';
      else
        _motivo := 'valor_invalido';
      end if;
    end if;

    if _motivo is null then
      case _campo
        when 'rol' then
          if _txt is null or not exists (
               select 1 from public.roles_config rc
                where rc.tenant_id = _k.tenant_id and rc.is_active and rc.name = _txt) then
            _motivo := 'rol_desconocido';
          elsif lower(_txt) = 'admin' or exists (
               select 1 from public.role_groups rg
                where rg.role_name = _txt and rg.tenant_id = _k.tenant_id and rg.is_admin) then
            _motivo := 'rol_de_admin';
          end if;
        when 'nivel' then
          if _txt is null or _txt not in ('manager', 'supervisor', 'agente') then
            _motivo := 'nivel_no_permitido';
          end if;
        when 'equipo' then
          if _txt is not null and (char_length(_txt) not between 1 and 80) then
            _motivo := 'equipo_invalido';
          end if;
        when 'reporta_a' then
          if _txt is not null then
            begin
              _jefe := _txt::uuid;
            exception when others then
              _motivo := 'jefe_invalido';
            end;
            if _motivo is null and _jefe = _uid then
              _motivo := 'jefe_es_la_misma_persona';
            elsif _motivo is null and not exists (
                 select 1 from public.tenant_members tm
                   join public.profiles p on p.id = tm.user_id
                  where tm.user_id = _jefe and tm.tenant_id = _k.tenant_id and p.deleted_at is null) then
              _motivo := 'jefe_no_esta_en_la_agencia';
            end if;
          end if;
        when 'hora_entrada', 'hora_salida' then
          if _txt is not null and _txt !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then
            _motivo := 'hora_invalida';
          end if;
        when 'horario_semana' then
          if _txt is not null then
            begin
              _hs := _txt::jsonb;
            exception when others then
              _motivo := 'horario_invalido';
            end;
            if _motivo is null and not public.equipo_horario_semana_valido(_hs) then
              _motivo := 'horario_invalido';
            end if;
          end if;
        when 'papelera' then
          if _bajas > _cfg.max_bajas_por_sync then
            _motivo := 'freno_de_bajas';
          end if;
        else
          _motivo := 'campo_desconocido';
      end case;
    end if;

    if _motivo is not null then
      _rechazados := _rechazados || jsonb_build_object('user_id', _c ->> 'user_id', 'campo', _campo, 'motivo', _motivo);
      continue;
    end if;

    if not _ensayo_final then
      begin
        case _campo
          when 'rol' then
            -- Una persona, un rol (como «Cambiar rol» en la app).
            if exists (select 1 from public.user_roles ur where ur.user_id = _uid) then
              delete from public.user_roles ur
               where ur.user_id = _uid
                 and ur.id <> (select x.id from public.user_roles x where x.user_id = _uid
                                order by (x.role = _txt) desc, x.role limit 1);
              update public.user_roles set role = _txt where user_id = _uid and role is distinct from _txt;
            else
              insert into public.user_roles (user_id, role) values (_uid, _txt);
            end if;
          when 'nivel' then
            update public.profiles set nivel = _txt where id = _uid;
          when 'equipo' then
            insert into public.integracion_equipo_personas (user_id, tenant_id, equipo)
            values (_uid, _k.tenant_id, _txt)
            on conflict (user_id) do update
              set equipo = excluded.equipo, tenant_id = excluded.tenant_id, actualizado_at = now();
          when 'reporta_a' then
            insert into public.integracion_equipo_personas (user_id, tenant_id, reporta_a)
            values (_uid, _k.tenant_id, _jefe)
            on conflict (user_id) do update
              set reporta_a = excluded.reporta_a, tenant_id = excluded.tenant_id, actualizado_at = now();
          when 'hora_entrada' then
            update public.profiles set hora_entrada = _txt::time where id = _uid;
          when 'hora_salida' then
            update public.profiles set hora_salida = _txt::time where id = _uid;
          when 'horario_semana' then
            delete from public.horario_semanal where user_id = _uid;
            if _hs is not null then
              insert into public.horario_semanal (user_id, dia, entrada, salida)
              select _uid, d.n, (_hs -> d.k ->> 0)::time, (_hs -> d.k ->> 1)::time
                from (values (1, 'lun'), (2, 'mar'), (3, 'mie'), (4, 'jue'), (5, 'vie'), (6, 'sab'), (0, 'dom')) as d(n, k);
            end if;
          when 'papelera' then
            -- Lo mismo que «Eliminar» en la app (admin-user-actions, delete_user): fuera
            -- de la sesión, bloqueada la entrada, marcado el perfil y anotado. El buzón
            -- de Zoho no se toca: se borra al purgar, a los 30 días.
            update public.profiles set deleted_at = now(), deleted_by = _yo where id = _uid and deleted_at is null;
            perform public.app_revoke_user_sessions(_uid);
            update auth.users set banned_until = now() + interval '876000 hours' where id = _uid;
            insert into public.cuenta_eventos (user_id, user_email, user_full_name, accion, actor_id, actor_email, detalle)
            select _uid, u.email, p.full_name, 'eliminada', _yo,
                   (select a.email from auth.users a where a.id = _yo),
                   jsonb_build_object('origen', 'backstage', 'api_key_id', _k.id)
              from auth.users u join public.profiles p on p.id = u.id
             where u.id = _uid;
        end case;
      exception when others then
        _rechazados := _rechazados || jsonb_build_object('user_id', _uid, 'campo', _campo, 'motivo', 'error_de_base',
                                                         'detalle', left(sqlerrm, 200));
        continue;
      end;
    end if;

    _aplicados := _aplicados || jsonb_build_object('user_id', _uid, 'campo', _campo);
  end loop;

  -- La bitácora: un envío igual al último (misma huella, mismo modo) y sin nada
  -- aplicado no suma fila, suma una repetición.
  _huella := md5(_resumen::text);
  _recibidas := case when jsonb_typeof(_resumen -> 'recibidas') = 'number' then (_resumen ->> 'recibidas')::integer else 0 end;
  select s.id, s.huella, s.ensayo into _ultima_id, _ultima_huella, _ultima_ensayo
    from public.integracion_equipo_syncs s
   where s.tenant_id = _k.tenant_id
   order by s.created_at desc
   limit 1;
  if _ultima_id is not null and _ultima_huella = _huella and _ultima_ensayo = _ensayo_final
     and (_ensayo_final or jsonb_array_length(_aplicados) = 0) then
    update public.integracion_equipo_syncs
       set repeticiones = repeticiones + 1, ultima_vez = now()
     where id = _ultima_id;
    _sync := _ultima_id;
  else
    insert into public.integracion_equipo_syncs
      (tenant_id, api_key_id, actor_id, ensayo, recibidas, resumen, aplicados, rechazados_base, huella)
    values
      (_k.tenant_id, _k.id, _yo, _ensayo_final, _recibidas, _resumen, _aplicados, _rechazados, _huella)
    returning id into _sync;
  end if;

  update public.integracion_equipo
     set ultima_sync = jsonb_build_object(
           'sync_id', _sync,
           'ensayo', _ensayo_final,
           'recibidas', _recibidas,
           'cambios', jsonb_array_length(_cambios),
           'aplicados', case when _ensayo_final then 0 else jsonb_array_length(_aplicados) end,
           'rechazados', jsonb_array_length(_rechazados)),
         ultima_sync_at = now()
   where tenant_id = _k.tenant_id;

  return jsonb_build_object(
    'ensayo', _ensayo_final,
    'aplicar', _cfg.aplicar,
    'sync_id', _sync,
    'aplicados', _aplicados,
    'rechazados', _rechazados
  );
end;
$function$;

-- Como en 20261111120000: authenticated sí (cada una exige la key con api_equipo_llave).
revoke all on function public.api_equipo_estado() from public, anon;
grant execute on function public.api_equipo_estado() to authenticated;
revoke all on function public.api_equipo_aplicar(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.api_equipo_aplicar(jsonb, jsonb, boolean) to authenticated;

-- ─── 6. GET /equipo/argos ────────────────────────────────────────────────────
-- Lo de Argos por persona y TURNO (el que empieza cada día de Bogotá del rango, según
-- turno_del_dia), SOLO de la gente de la agencia de la key (sin cuentas externas, y sin
-- admins ni dueños, a quienes Argos no vigila). Hasta 93 días. Un día sin turno
-- (descanso, o sin horario) no aparece; un turno que todavía no empieza, tampoco; el
-- que está en curso va con en_curso = true (sus números son hasta ahora). Van todas
-- las personas activas (con dias = [] si no tuvieron turnos) y las de la papelera que
-- entraron en algún turno del rango (solo los turnos de antes de irse).
--
-- Por turno: entro (algún tramo de Cowork en el turno, o 30 min antes), sin_pantalla_min
-- (argos_sin_pantalla_seg, lo mismo que mide el vigía; 0 si no entró) y permitido_min
-- (comida + baño), las salidas de Cowork (cowork_fuera: veces, minutos dentro del
-- turno, llamados de Argos y si lo reportó), «no entró» (argos_no_entro: llamados y si
-- lo reportó), los reportes dentro de la sala (argos_reportes, por tipo), las faltas
-- (monitor_eventos, menos las descartadas) y las fotos de pantalla.

create or replace function public.api_equipo_argos(_desde date, _hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _k public.api_keys := public.api_equipo_llave();
  _ahora timestamptz := now();
  _r jsonb;
begin
  if _desde is null or _hasta is null or _desde > _hasta or _hasta - _desde > 92 then
    raise exception 'api_equipo_argos: el rango va de 1 a 93 días, con desde <= hasta';
  end if;

  with gente as (
    select tm.user_id, lower(u.email) as correo, p.full_name as nombre, p.deleted_at,
           public.debe_estar_en_cowork(tm.user_id)
             and not coalesce((select h.exento from public.horario_de(tm.user_id) h), false) as vigilado
      from public.tenant_members tm
      join public.profiles p on p.id = tm.user_id
      join auth.users u on u.id = tm.user_id
     where tm.tenant_id = _k.tenant_id
       and coalesce(u.raw_app_meta_data ->> 'tipo', '') <> 'creadora'
       and not public.equipo_protegido(tm.user_id)
  ),
  turnos as (
    select g.user_id, x.dia, t.inicio, t.fin, least(t.fin, _ahora) as corte
      from gente g
     cross join lateral (
       select d::date as dia from generate_series(_desde::timestamp, _hasta::timestamp, interval '1 day') as d
     ) x
     cross join lateral public.turno_del_dia(g.user_id, x.dia) t
     where t.inicio <= _ahora
       and t.inicio < coalesce(g.deleted_at, 'infinity'::timestamptz)
  ),
  dias as (
    select tu.user_id, tu.dia, tu.inicio, tu.fin, (_ahora < tu.fin) as en_curso, e.entro,
           case when e.entro and tu.corte > tu.inicio
                then round(public.argos_sin_pantalla_seg(tu.user_id, tu.inicio, tu.corte) / 60.0)::int
                else 0 end as sin_pantalla_min,
           public.argos_permitido_min(tu.user_id) as permitido_min,
           f.veces, f.minutos, f.llamados, f.reportado,
           coalesce(n.llamados, 0) as no_entro_llamados, (n.reportado_at is not null) as no_entro_reportado,
           ar.camara_apagada, ar.fuera_cuadro, ar.sin_pantalla,
           ev.faltas, ca.fotos
      from turnos tu
     cross join lateral (
       select exists (select 1 from public.cowork_tiempo_segmentos s
                       where s.user_id = tu.user_id
                         and s.started_at < tu.fin
                         and s.started_at >= tu.inicio - interval '1 day'
                         and coalesce(s.ended_at, s.last_seen_at) >= tu.inicio - interval '30 minutes') as entro
     ) e
     cross join lateral (
       select count(*)::int as veces,
              coalesce(round(sum(extract(epoch from (least(coalesce(cf.hasta, _ahora), tu.fin) - greatest(cf.desde, tu.inicio)))) / 60), 0)::int as minutos,
              coalesce(sum(cf.llamados), 0)::int as llamados,
              coalesce(bool_or(cf.reportado_at is not null), false) as reportado
         from public.cowork_fuera cf
        where cf.user_id = tu.user_id and cf.desde < tu.fin and coalesce(cf.hasta, _ahora) > tu.inicio
     ) f
      left join public.argos_no_entro n on n.user_id = tu.user_id and n.turno = tu.dia
     cross join lateral (
       select count(*) filter (where a.tipo = 'camara_apagada')::int as camara_apagada,
              count(*) filter (where a.tipo = 'fuera_cuadro')::int as fuera_cuadro,
              count(*) filter (where a.tipo = 'sin_pantalla')::int as sin_pantalla
         from public.argos_reportes a
        where a.user_id = tu.user_id and a.created_at >= tu.inicio and a.created_at < tu.fin
     ) ar
     cross join lateral (
       select count(*)::int as faltas
         from public.monitor_eventos me
        where me.user_id = tu.user_id and me.created_at >= tu.inicio and me.created_at < tu.fin
          and coalesce(me.estado, '') <> 'descartado'
     ) ev
     cross join lateral (
       select count(*)::int as fotos
         from public.monitor_capturas c
        where c.user_id = tu.user_id and c.tipo = 'pantalla' and c.created_at >= tu.inicio and c.created_at < tu.fin
     ) ca
  )
  select jsonb_build_object(
    'desde', _desde,
    'hasta', _hasta,
    'personas', coalesce(jsonb_agg(jsonb_build_object(
                  'correo', x.correo,
                  'nombre', x.nombre,
                  'vigilado', x.vigilado,
                  'expediente_url', 'https://app.maven-ai.me/hr/expediente/' || x.user_id::text,
                  'dias', x.dias) order by x.correo), '[]'::jsonb)
  ) into _r
  from (
    select ge.user_id, ge.correo, ge.nombre, ge.vigilado,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'fecha', d.dia,
                      'turno', jsonb_build_object('inicio', d.inicio, 'fin', d.fin),
                      'en_curso', d.en_curso,
                      'entro', d.entro,
                      'sin_pantalla_min', d.sin_pantalla_min,
                      'permitido_min', d.permitido_min,
                      'fuera_de_cowork_veces', d.veces,
                      'fuera_de_cowork_min', d.minutos,
                      'llamados_fuera', d.llamados,
                      'reportado_fuera', d.reportado,
                      'no_entro_llamados', d.no_entro_llamados,
                      'no_entro_reportado', d.no_entro_reportado,
                      'reportes_en_sala', jsonb_build_object(
                        'camara_apagada', d.camara_apagada,
                        'fuera_cuadro', d.fuera_cuadro,
                        'sin_pantalla', d.sin_pantalla),
                      'faltas', d.faltas,
                      'fotos', d.fotos)
                    order by d.dia)
               from dias d where d.user_id = ge.user_id
           ), '[]'::jsonb) as dias
      from gente ge
     where ge.deleted_at is null
        or exists (select 1 from dias d where d.user_id = ge.user_id and d.entro)
  ) x;
  return _r;
end;
$$;
revoke all on function public.api_equipo_argos(date, date) from public, anon;
grant execute on function public.api_equipo_argos(date, date) to authenticated;
