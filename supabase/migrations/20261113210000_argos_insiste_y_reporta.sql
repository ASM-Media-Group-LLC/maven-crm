-- ARGOS INSISTE Y REPORTA (Alvaro, 13/11/2026).
-- «Isabel tiene que estar en el cowork. Si no está, le tiene que avisar que se meta…
--  si no está compartiendo pantalla y cámara, la jode, la jode… y le dice que la
--  está reportando.» Caso real: Isabel salió de Cowork a las 9:01 y estuvo 5 h fuera
--  usando el chat de Maven; recibió UN aviso (9:03) y nada más.
--
-- Decidido en preguntas:
--   · FUERA de Cowork (en su turno): un llamado cada 2 min hasta que entre (push al
--     teléfono; con Maven abierto, voz de Argos + cartel en cualquier página).
--   · Al 3er llamado sin hacer caso: «te estoy reportando» y el reporte SALE a sus
--     jefes (destinatarios_de_aviso). Antes salía al minuto y a ella no le decía nada.
--   · Los que NUNCA entraron: solo con horario propio (Backstage o por persona). Con el
--     horario genérico del rol no: hoy está mal para casi todos y serían avisos falsos.
--   · DENTRO de Cowork sin cámara o sin pantalla: la voz ya insiste; al 3er llamado dice
--     «te estoy reportando» y llama a argos_reportarme(), que avisa de verdad a los jefes
--     (y vuelve a avisar cada 10 min si sigue igual).

-- 1) Los llamados de cada salida.
alter table public.cowork_fuera
  add column if not exists llamados integer not null default 0,
  add column if not exists ultimo_llamado_at timestamptz,
  add column if not exists reportado_at timestamptz;

-- 2) Los llamados a quien NUNCA entró en su turno (con horario propio).
create table if not exists public.argos_no_entro (
  user_id uuid not null references public.profiles(id) on delete cascade,
  turno date not null,                    -- día (Bogotá) en que empezó el turno
  llamados integer not null default 0,
  ultimo_llamado_at timestamptz,
  reportado_at timestamptz,
  tenant_id uuid,
  primary key (user_id, turno)
);
alter table public.argos_no_entro enable row level security;
create policy argos_no_entro_sel on public.argos_no_entro
  for select to authenticated
  using (user_id = (select auth.uid()) or public.puede_vigilar_a((select auth.uid()), user_id));

-- 3) El vigía «fuera de Cowork»: abrir y cerrar como antes; avisar con llamados.
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
       and not public.es_admin_o_dueno(p.id)
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
  --    «te estoy reportando» y el aviso a sus jefes (una vez por salida).
  for r in
    select f.id, f.user_id, f.desde, f.llamados, f.reportado_at, p.full_name, h.entrada, h.salida
      from public.cowork_fuera f
      join public.profiles p on p.id = f.user_id
      left join lateral public.horario_de(f.user_id) h on true
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

  -- 4) NUNCA ENTRÓ en su turno (solo con horario propio): a los 10 min de empezar,
  --    llamados cada 2 min; al 3ro, el reporte a sus jefes.
  for r in
    select p.id as uid, p.full_name, tm.tenant_id, t.inicio, h.entrada,
           n.llamados, n.reportado_at
      from public.profiles p
      join lateral (select m.tenant_id from public.tenant_members m where m.user_id = p.id limit 1) tm on true
      cross join lateral public.turno_en_curso(p.id, v_ahora) t
      left join lateral public.horario_de(p.id) h on true
      left join public.argos_no_entro n
             on n.user_id = p.id and n.turno = (t.inicio at time zone 'America/Bogota')::date
     where p.deleted_at is null
       and (p.hora_entrada is not null or p.turno_id is not null)
       and not public.es_admin_o_dueno(p.id)
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

-- 4) Lo que la app le muestra a la persona (cartel + voz en cualquier página).
create or replace function public.mi_fuera_de_cowork()
returns table(desde timestamptz, llamados integer, nunca_entro boolean, reportado boolean, entrada time)
language sql
stable
security definer
set search_path to 'public'
as $$
  (select f.desde, f.llamados, false, f.reportado_at is not null, null::time
     from public.cowork_fuera f
    where f.user_id = (select auth.uid()) and f.hasta is null and f.llamados > 0
    limit 1)
  union all
  (select null::timestamptz, n.llamados, true, n.reportado_at is not null, (select h.entrada from public.horario_de(n.user_id) h)
     from public.argos_no_entro n
    where n.user_id = (select auth.uid())
      and n.ultimo_llamado_at > now() - interval '4 minutes'
      and not public.presente_en_cowork(n.user_id, now())
    limit 1)
  limit 1;
$$;
revoke all on function public.mi_fuera_de_cowork() from public, anon;
grant execute on function public.mi_fuera_de_cowork() to authenticated;

-- 5) Dentro de Cowork: el reporte de verdad al 3er llamado (cámara / encuadre / pantalla).
create table if not exists public.argos_reportes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('camara_apagada', 'fuera_cuadro', 'sin_pantalla')),
  created_at timestamptz not null default now()
);
create index if not exists argos_reportes_por_persona on public.argos_reportes (user_id, tipo, created_at desc);
alter table public.argos_reportes enable row level security;
create policy argos_reportes_sel on public.argos_reportes
  for select to authenticated
  using (user_id = (select auth.uid()) or public.puede_vigilar_a((select auth.uid()), user_id));

create or replace function public.argos_reportarme(_tipo text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_nom text;
  v_que text;
begin
  if v_uid is null or _tipo not in ('camara_apagada', 'fuera_cuadro', 'sin_pantalla') then return false; end if;
  if public.es_admin_o_dueno(v_uid) then return false; end if;
  -- Si sigue igual, se vuelve a reportar cada 10 min (no en cada llamado).
  if exists (select 1 from public.argos_reportes r
              where r.user_id = v_uid and r.tipo = _tipo and r.created_at > now() - interval '10 minutes') then
    return false;
  end if;
  insert into public.argos_reportes (user_id, tipo) values (v_uid, _tipo);

  select full_name into v_nom from public.profiles where id = v_uid;
  v_que := case _tipo when 'camara_apagada' then 'sigue con la cámara apagada'
                      when 'fuera_cuadro' then 'no se ve en la cámara'
                      else 'sigue sin compartir pantalla' end;
  insert into public.notifications
    (user_id, type, title, message, reference_id, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
  select d.user_id, 'argos_reporte',
         format('Argos reportó a %s: %s', coalesce(nullif(trim(v_nom), ''), 'un empleado'), v_que),
         'Está en Cowork y no hizo caso a 3 llamados de Argos.',
         v_uid, 'profile', 'HR', 'high', 'new', 'personal', format('/hr/en-vivo/%s', v_uid)
    from public.destinatarios_de_aviso(v_uid) d;
  return true;
end;
$function$;
revoke all on function public.argos_reportarme(text) from public, anon;
grant execute on function public.argos_reportarme(text) to authenticated;
