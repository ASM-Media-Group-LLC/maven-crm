-- MONITOREO EN VIVO, DE LA A A LA Z (Alvaro, 11/11/2026).
--
-- «Toco el aviso en el teléfono y me lleva al expediente con fotos, no a lo que
-- está pasando». Desde hoy, cada aviso de vigilancia abre la VISTA EN VIVO de esa
-- persona (/hr/en-vivo/<persona>?alerta=<id> o ?fuera=<id>): arriba qué vio Argos
-- y desde cuándo, abajo su pantalla y su cámara en vivo, con «Avisarle» y
-- «Revisado ✓». Y el inicio del teléfono abre con «Quién está bajando ahora».
--
-- Esta migración pone la parte de la base:
--   1. puede_vigilar: quién puede mirar a quién (una sola regla para la RLS, las
--      funciones y el edge cowork-session): el dueño a todos; RR. HH. a todos
--      menos admins y dueño; el supervisor SOLO a los agentes de su equipo (el
--      mismo criterio de mi_equipo_supervisado()).
--   2. «Revisado ✓»: quién y cuándo, en argos_alertas y en cowork_fuera.
--   3. «Avisarle»: el mismo aviso de Cowork (cowork_avisos, voz de Mario) desde
--      la vista en vivo, aunque quien mira no sea anfitrión de esa sesión.
--   4. Los supervisores ven las alertas, los pantallazos y los videos de SU
--      equipo, y RR. HH. por fin puede ABRIR las fotos y los videos (la tabla ya
--      se lo dejaba ver desde el 08/11, pero el almacenamiento seguía solo para
--      el dueño: las miniaturas le salían rotas).
--   5. «Se salió de Cowork»: el aviso abre la vista en vivo (solo cambian los
--      enlaces respecto de 20261111200000_rrhh_copia_de_avisos.sql).

set local lock_timeout = '3s';

-- ─── 1. Quién puede mirar a quién ────────────────────────────────────────────
-- Interna (con quien mira explícito): la usan las de abajo y las policies.
create or replace function public.puede_vigilar_a(_viewer uuid, _target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _viewer is not null and _target is not null and _viewer <> _target
     and exists (select 1 from public.profiles t where t.id = _target and t.deleted_at is null)
     and (
       public.es_dueno(_viewer)
       or (public.es_rh(_viewer) and not public.es_admin_o_dueno(_target))
       -- Supervisor → agentes de su equipo y de su agencia (= mi_equipo_supervisado).
       or exists (
         select 1
           from public.profiles s
           join public.profiles t on t.id = _target and t.nivel = 'agente' and t.deleted_at is null
          where s.id = _viewer and s.nivel = 'supervisor' and s.deleted_at is null
            and public.equipo_de(s.id) <> 'Otros'
            and public.equipo_de(s.id) = public.equipo_de(t.id)
            and exists (
              select 1 from public.user_roles a
                join public.user_roles b on b.tenant_id = a.tenant_id
               where a.user_id = s.id and b.user_id = t.id
            )
       )
     );
$$;
revoke all on function public.puede_vigilar_a(uuid, uuid) from public, anon, authenticated;
grant execute on function public.puede_vigilar_a(uuid, uuid) to service_role;

-- Para el navegador y el edge (con el JWT de quien mira): «¿puedo mirar a esta persona?».
create or replace function public.puede_vigilar(_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.puede_vigilar_a((select auth.uid()), _target);
$$;
revoke all on function public.puede_vigilar(uuid) from public, anon;
grant execute on function public.puede_vigilar(uuid) to authenticated, service_role;

-- Para el almacenamiento: la carpeta de primer nivel de los buckets de Argos es
-- el id de la persona (<uid>/<día>/...). Si no tiene forma de uuid, no se mira.
create or replace function public.puede_vigilar_carpeta(_carpeta text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when _carpeta ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.puede_vigilar_a((select auth.uid()), _carpeta::uuid)
    else false
  end;
$$;
revoke all on function public.puede_vigilar_carpeta(text) from public, anon;
grant execute on function public.puede_vigilar_carpeta(text) to authenticated, service_role;

-- ─── 2. «Revisado ✓» ─────────────────────────────────────────────────────────
alter table public.argos_alertas
  add column if not exists revisada_por uuid references auth.users(id) on delete set null,
  add column if not exists revisada_at timestamptz;

alter table public.cowork_fuera
  add column if not exists revisado_por uuid references auth.users(id) on delete set null,
  add column if not exists revisado_at timestamptz;

-- Marca una alerta de Argos (o una salida de Cowork) como revisada. La primera
-- marca queda: si otro ya la revisó, devuelve quién y cuándo, sin pisarla.
create or replace function public.monitoreo_marcar_revisado(_alerta uuid default null, _fuera uuid default null)
returns table (revisado_at timestamptz, revisado_por uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_persona uuid;
begin
  if v_uid is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  if (_alerta is null) = (_fuera is null) then
    raise exception 'Indica una alerta o una salida de Cowork' using errcode = '22023';
  end if;

  if _alerta is not null then
    select a.user_id into v_persona
      from public.argos_alertas a
     where a.id = _alerta
       and (a.tenant_id is null or a.tenant_id = public.current_tenant_id());
    if v_persona is null or not public.puede_vigilar_a(v_uid, v_persona) then
      raise exception 'Alerta no encontrada' using errcode = '42501';
    end if;
    update public.argos_alertas
       set revisada_por = v_uid, revisada_at = now()
     where id = _alerta and revisada_at is null;
    return query select a.revisada_at, a.revisada_por from public.argos_alertas a where a.id = _alerta;
  else
    select f.user_id into v_persona
      from public.cowork_fuera f
     where f.id = _fuera
       and (f.tenant_id is null or f.tenant_id = public.current_tenant_id());
    if v_persona is null or not public.puede_vigilar_a(v_uid, v_persona) then
      raise exception 'Salida no encontrada' using errcode = '42501';
    end if;
    update public.cowork_fuera
       set revisado_por = v_uid, revisado_at = now()
     where id = _fuera and revisado_at is null;
    return query select f.revisado_at, f.revisado_por from public.cowork_fuera f where f.id = _fuera;
  end if;
end;
$$;
revoke all on function public.monitoreo_marcar_revisado(uuid, uuid) from public, anon;
grant execute on function public.monitoreo_marcar_revisado(uuid, uuid) to authenticated;

-- ─── 3. «Avisarle» desde la vista en vivo ────────────────────────────────────
-- El mismo aviso del botón Avisar de Cowork: una fila en cowork_avisos para la
-- persona, en la sala donde está ahora. Le llega por realtime (cartel, campana y
-- la voz de Mario) con useRecepcionAvisos, igual que desde el tablero. Quien mira
-- desde la vista en vivo no suele ser anfitrión de esa sesión, por eso entra por
-- aquí y no por la policy de inserción (que exige ser anfitrión): la regla es
-- puede_vigilar. Si la persona no está en Cowork, no hay a dónde avisarle.
create or replace function public.monitoreo_avisar(_user_id uuid, _situacion text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_sesion uuid;
  v_sala uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  if _situacion is null or _situacion !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'Situación inválida' using errcode = '22023';
  end if;
  if not public.puede_vigilar_a(v_uid, _user_id) then
    raise exception 'No puedes avisarle a esta persona' using errcode = '42501';
  end if;

  select a.session_id, a.room_id into v_sesion, v_sala
    from public.cowork_room_assignments a
    join public.cowork_sessions s on s.id = a.session_id and s.status = 'active'
   where a.user_id = _user_id and a.is_active
     and (s.tenant_id is null or s.tenant_id = public.current_tenant_id())
   order by a.assigned_at desc
   limit 1;
  if v_sesion is null then
    raise exception 'No está en Cowork' using errcode = 'P0002';
  end if;

  insert into public.cowork_avisos (session_id, room_id, user_id, situacion, created_by)
  values (v_sesion, v_sala, _user_id, _situacion, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.monitoreo_avisar(uuid, text) from public, anon;
grant execute on function public.monitoreo_avisar(uuid, text) to authenticated;

-- ─── 4. Supervisores: su equipo. RR. HH.: las fotos y los videos ─────────────
alter policy "argos_alertas_sel_supervisor" on public.argos_alertas
  using (
    (
      es_dueno((select auth.uid()))
      or (es_rh((select auth.uid())) and not es_admin_o_dueno(user_id))
      or user_id in (select s.user_id from public.mi_equipo_supervisado() s(user_id))
    )
    and (tenant_id = (select current_tenant_id()))
  );

alter policy "monitor_capturas_sel_supervisor" on public.monitor_capturas
  using (
    es_dueno((select auth.uid()))
    or (es_rh((select auth.uid())) and not es_admin_o_dueno(user_id))
    or user_id in (select s.user_id from public.mi_equipo_supervisado() s(user_id))
  );

alter policy "argos_clips_sel_dueno" on public.argos_clips
  using (
    es_dueno((select auth.uid()))
    or (es_rh((select auth.uid())) and not es_admin_o_dueno(user_id))
    or user_id in (select s.user_id from public.mi_equipo_supervisado() s(user_id))
  );

-- Almacenamiento: el dueño todo (como hasta hoy); RR. HH. y supervisores, la
-- carpeta de quien pueden mirar.
alter policy "monitor_capturas_read_supervisor" on storage.objects
  using (
    bucket_id = 'monitor-capturas'
    and (
      es_dueno((select auth.uid()))
      or public.puede_vigilar_carpeta((storage.foldername(name))[1])
    )
  );

alter policy "argos_clips_obj_sel" on storage.objects
  using (
    bucket_id = 'argos-clips'
    and (
      es_dueno((select auth.uid()))
      or public.puede_vigilar_carpeta((storage.foldername(name))[1])
    )
  );

-- ─── 5. «Se salió de Cowork» abre la vista en vivo ───────────────────────────
-- Igual a 20261111200000_rrhh_copia_de_avisos.sql; solo cambian los enlaces del
-- paso 3: dueño, RR. HH. y supervisor van a /hr/en-vivo/<persona>?fuera=<salida>.
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
       and not public.es_admin_o_dueno(p.id)
       and not coalesce((select h.exento from public.horario_de(p.id) h), false)
       and not exists (select 1 from public.cowork_fuera f where f.user_id = p.id and f.hasta is null)
  loop
    continue when r.ultimo is null;
    continue when public.presente_en_cowork(r.uid, v_ahora);
    continue when greatest(r.ultimo, r.inicio) >= r.fin - interval '10 minutes';
    -- Nunca antes de que cerrara el episodio anterior: si volvió un instante y
    -- se fue de nuevo, el nuevo empieza al cerrar el otro (antes se pisaban y
    -- esos minutos contaban dos veces; Lina Pérez, 11/11).
    insert into public.cowork_fuera (user_id, tenant_id, desde)
    values (r.uid, r.tenant_id, greatest(r.ultimo, r.inicio,
            coalesce((select max(f.hasta) from public.cowork_fuera f where f.user_id = r.uid), r.inicio)))
    on conflict do nothing;
  end loop;

  -- 3) Avisar a quien lleva 1 minuto o más fuera. El aviso abre la vista en vivo
  --    de esa persona con esta salida arriba (Alvaro, 11/11).
  for r in
    select f.id, f.user_id, f.tenant_id, f.desde, p.full_name, h.entrada, h.salida
      from public.cowork_fuera f
      join public.profiles p on p.id = f.user_id
      left join lateral public.horario_de(f.user_id) h on true
     where f.hasta is null and f.avisado_at is null and f.desde <= v_ahora - interval '1 minute'
  loop
    insert into public.notifications
      (user_id, type, title, message, reference_id, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    select d.uid, 'cowork_fuera',
           format('%s se salió de Cowork', coalesce(nullif(trim(r.full_name), ''), 'Un empleado')),
           format('Está en su turno (%s–%s) y salió de la llamada a las %s. Cuenta como «fuera de Cowork» hasta que vuelva.',
                  to_char(r.entrada, 'HH24:MI'), to_char(r.salida, 'HH24:MI'), to_char(r.desde at time zone 'America/Bogota', 'HH24:MI')),
           r.user_id, 'profile', 'HR', 'high', 'new', 'personal',
           format('/hr/en-vivo/%s?fuera=%s', r.user_id, r.id)
      from (
        select o.user_id as uid
          from public.tenant_owners o where o.tenant_id = r.tenant_id
        union
        select s.id
          from public.profiles s
          join public.tenant_members sm on sm.user_id = s.id and sm.tenant_id = r.tenant_id
         where s.nivel = 'supervisor' and s.deleted_at is null and s.id <> r.user_id
           and public.equipo_de(s.id) = public.equipo_de(r.user_id)
           and not exists (select 1 from public.tenant_owners o2 where o2.user_id = s.id and o2.tenant_id = r.tenant_id)
        union
        -- RR. HH. de la agencia (copia de lo que ve el dueño), menos la persona misma.
        select h.user_id
          from public.equipo_rrhh() h
         where h.tenant_id = r.tenant_id and h.user_id <> r.user_id
           and not exists (select 1 from public.tenant_owners o3 where o3.user_id = h.user_id and o3.tenant_id = r.tenant_id)
      ) d;

    insert into public.notifications
      (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    values (r.user_id, 'cowork_fuera_tu', 'Saliste de Cowork en tu turno',
            'Vuelve a entrar a Cowork y comparte tu pantalla completa. Mientras estés fuera cuenta en tu nota.',
            'cowork', 'Cowork', 'high', 'new', 'personal', '/cowork');

    update public.cowork_fuera set avisado_at = v_ahora where id = r.id;
    v_avisos := v_avisos + 1;
  end loop;

  return v_avisos;
end;
$function$;
