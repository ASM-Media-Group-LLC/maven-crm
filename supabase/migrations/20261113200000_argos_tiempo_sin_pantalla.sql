-- TIEMPO SIN PANTALLA: AVISO AL PASARSE + RESUMEN AL CERRAR EL TURNO (Alvaro, 13/11/2026).
-- «De las 8 horas, cuánto lleva de pantalla no compartida. Solamente tiene lo del
--  almuerzo: 30 de comida y 10 de baño.» Grupo chats 30+10 = 40 min; el resto
--  60+10 = 70 min (roles_config.comida_min / bano_min; la persona puede tener los suyos).
--
-- Decidido en preguntas (13/11):
--   · Al pasarse: aviso a la persona y a sus jefes (destinatarios_de_aviso), UNA vez por turno.
--   · Al cerrar el turno: UN resumen por jefe con su gente (los que se pasaron arriba)
--     y cada empleado el suyo.
--
-- «Sin pantalla» es la MISMA cuenta que la casilla del Expediente: pausas + sin
-- pantalla + sin cámara (si apaga la cámara el reloj ya no puede ver la pantalla:
-- sin esto, apagar la cámara escondía el tiempo sin pantalla) + sin conexión +
-- fuera de Cowork. El meet cuenta como trabajo.

-- 1) Lo que tiene permitido (comida + baño), igual que lib/horarioEmpleado.ts:
--    lo de la persona; si no, el mayor de sus roles; si no, 30 + 10.
create or replace function public.argos_permitido_min(_uid uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select greatest(coalesce(p.comida_min, r.comida, 30), 0) + greatest(coalesce(p.bano_min, r.bano, 10), 0)
    from public.profiles p
    left join lateral (
      select max(c.comida_min) as comida, max(c.bano_min) as bano
        from public.user_roles ur
        join public.roles_config c on lower(c.name) = lower(ur.role) and c.is_active
                                  and (c.tenant_id = ur.tenant_id or ur.tenant_id is null)
       where ur.user_id = p.id
    ) r on true
   where p.id = _uid;
$$;

-- 2) Segundos sin pantalla de una persona entre dos momentos.
create or replace function public.argos_sin_pantalla_seg(_uid uuid, _desde timestamptz, _hasta timestamptz)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select (
    coalesce((
      select sum(extract(epoch from (least(coalesce(s.ended_at, s.last_seen_at), _hasta) - greatest(s.started_at, _desde))))
        from public.cowork_tiempo_segmentos s
       where s.user_id = _uid
         and s.estado in ('pausa', 'sin_pantalla', 'sin_camara', 'sin_conexion', 'sin_conexion_larga')
         and s.started_at < _hasta and coalesce(s.ended_at, s.last_seen_at) > _desde
    ), 0)
    + coalesce((
      select sum(extract(epoch from (least(coalesce(f.hasta, now()), _hasta) - greatest(f.desde, _desde))))
        from public.cowork_fuera f
       where f.user_id = _uid and f.desde < _hasta and coalesce(f.hasta, now()) > _desde
    ), 0)
  )::int;
$$;
revoke all on function public.argos_permitido_min(uuid) from public, anon;
revoke all on function public.argos_sin_pantalla_seg(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.argos_permitido_min(uuid) to authenticated;

-- 3) Lo que ya se avisó (uno por persona, turno y tipo) y la foto del turno.
create table if not exists public.argos_tiempo_avisos (
  user_id uuid not null references public.profiles(id) on delete cascade,
  turno date not null,                 -- día (Bogotá) en que empezó el turno
  tipo text not null check (tipo in ('pasado', 'resumen')),
  sin_pantalla_min integer not null,
  permitido_min integer not null,
  faltas integer,
  fotos integer,
  entro boolean,
  tenant_id uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, turno, tipo)
);
alter table public.argos_tiempo_avisos enable row level security;
create policy argos_tiempo_avisos_sel on public.argos_tiempo_avisos
  for select to authenticated
  using (user_id = (select auth.uid()) or public.puede_vigilar_a((select auth.uid()), user_id));

-- 4) El vigía.
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
       and not public.es_admin_o_dueno(p.id)
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
  --     o más (y menos de 3 h), una vez por turno.
  for r in
    select p.id as uid, p.full_name, tm.tenant_id, x.ini, x.fin
      from public.profiles p
      join lateral (select m.tenant_id from public.tenant_members m where m.user_id = p.id limit 1) tm on true
      join lateral public.horario_de(p.id) h on h.entrada is not null and h.salida is not null and not coalesce(h.exento, false)
      cross join lateral (
        select ((v_dia + d) + h.entrada) at time zone 'America/Bogota' as ini,
               (case when h.salida <= h.entrada then (v_dia + d + 1) + h.salida else (v_dia + d) + h.salida end)
                 at time zone 'America/Bogota' as fin
          from unnest(array[0, -1]) as d
      ) x
     where p.deleted_at is null
       and not public.es_admin_o_dueno(p.id)
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
revoke all on function public.vigilar_tiempo_sin_pantalla() from public, anon, authenticated;

-- 5) Cada 5 minutos (pg_cron). Sin edge: la campana dispara el push sola.
select cron.schedule('vigia-tiempo-sin-pantalla', '*/5 * * * *', $$ select public.vigilar_tiempo_sin_pantalla(); $$);
