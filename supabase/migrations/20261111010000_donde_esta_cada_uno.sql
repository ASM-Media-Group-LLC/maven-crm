-- DÓNDE ESTÁ CADA UNO + FUERA DE COWORK (Alvaro, 10/11/2026: «necesito saber
-- dónde está el empleado en todo momento… si se sale de la llamada de Cowork en
-- horario de turno hoy no queda registro de nada»).
--
-- Decidió: si un empleado se sale de Cowork en su turno (cuelga, cierra la
-- ventanita o cierra Maven), al minuto cuenta como «fuera de Cowork» y le llega
-- aviso a su supervisor y a él (el dueño); y un tablero con cada empleado:
-- conectado o no, qué tiene en pantalla según la última captura y hace cuánto.
--
--   · cowork_fuera: un episodio por cada salida (desde → hasta), con el aviso.
--   · horario_de / turno_en_curso: el turno de cada persona (persona → turno
--     asignado → rol, igual que lib/horarioEmpleado.ts), con los que cruzan la
--     medianoche. Sin días libres en la base: por eso «se salió» exige que haya
--     ENTRADO a Cowork en este turno (quien no vino es tardanza/ausencia, otro
--     detector), y así un día libre no dispara nada.
--   · vigilar_fuera_de_cowork(): la corre pg_cron cada minuto (la programación va
--     en una migración aparte, que se aplica cuando Alvaro funde el PR).
--   · donde_esta_cada_uno(): el tablero (dueño, admins y RR. HH. ven a todos;
--     un supervisor, a su equipo).
-- Estar en Cowork = un latido de la sala hace menos de 90 s (el reloj late cada
-- 30 s) o una pausa abierta (la comida se toma con pausa, no cerrando Maven).

create table if not exists public.cowork_fuera (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  tenant_id   uuid not null,
  desde       timestamptz not null,
  hasta       timestamptz,
  motivo      text check (motivo in ('volvio', 'fin_de_turno')),
  avisado_at  timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists cowork_fuera_uno_abierto on public.cowork_fuera (user_id) where hasta is null;
create index if not exists cowork_fuera_por_persona on public.cowork_fuera (user_id, desde desc);

alter table public.cowork_fuera enable row level security;
create policy cowork_fuera_ver on public.cowork_fuera
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.es_admin_o_dueno((select auth.uid()))
    or coalesce(public.es_rh((select auth.uid())), false)
    or user_id in (select s.user_id from public.mi_equipo_supervisado() s)
  );
revoke insert, update, delete on public.cowork_fuera from authenticated, anon;
grant select on public.cowork_fuera to authenticated;

-- El horario de una persona: lo suyo, si no el turno asignado, si no su rol.
create or replace function public.horario_de(_uid uuid)
returns table (entrada time, salida time, exento boolean)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.hora_entrada, t.hora_entrada, rc.hora_entrada),
         coalesce(p.hora_salida, t.hora_salida, rc.hora_salida),
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
   where p.id = _uid;
$$;

-- El turno que está corriendo en «_ahora» (hora Colombia), o nada.
create or replace function public.turno_en_curso(_uid uuid, _ahora timestamptz default now())
returns table (inicio timestamptz, fin timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  h record;
  v_local timestamp := _ahora at time zone 'America/Bogota';
  v_dia date := (_ahora at time zone 'America/Bogota')::date;
  v_ini timestamp;
  v_fin timestamp;
  d int;
begin
  select * into h from public.horario_de(_uid);
  if h.entrada is null or h.salida is null then return; end if;
  -- El de hoy, o el de ayer si cruza la medianoche (p. ej. 16:00 → 00:00).
  foreach d in array array[0, -1] loop
    v_ini := (v_dia + d) + h.entrada;
    v_fin := (v_dia + d) + h.salida;
    if v_fin <= v_ini then v_fin := v_fin + interval '1 day'; end if;
    if v_local >= v_ini and v_local < v_fin then
      inicio := v_ini at time zone 'America/Bogota';
      fin := v_fin at time zone 'America/Bogota';
      return next;
      return;
    end if;
  end loop;
end;
$$;

-- ¿Está en Cowork ahora? Latido fresco de la sala o una pausa abierta.
create or replace function public.presente_en_cowork(_uid uuid, _ahora timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
           select 1 from public.cowork_tiempo_segmentos s
            where s.user_id = _uid and s.ended_at is null and s.last_seen_at > _ahora - interval '90 seconds')
      or exists (
           select 1 from public.cowork_breaks b
            where b.user_id = _uid and b.ended_at is null and b.started_at > _ahora - interval '4 hours');
$$;

-- El vigía: abre y cierra los episodios «fuera de Cowork» y avisa al minuto.
-- Devuelve cuántos avisos mandó.
create or replace function public.vigilar_fuera_de_cowork()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_ahora timestamptz := now();
  v_avisos int := 0;
begin
  -- 1) Cerrar: volvió a Cowork, o se le acabó el turno.
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

  -- 2) Abrir: en su turno, ya había entrado a Cowork en este turno, y ahora no está.
  for r in
    select p.id as uid, tm.tenant_id, t.inicio,
           (select max(coalesce(s.ended_at, s.last_seen_at)) from public.cowork_tiempo_segmentos s
             where s.user_id = p.id and s.started_at >= t.inicio - interval '30 minutes') as ultimo
      from public.profiles p
      join lateral (select m.tenant_id from public.tenant_members m where m.user_id = p.id limit 1) tm on true
      cross join lateral public.turno_en_curso(p.id, v_ahora) t
     where p.deleted_at is null
       and not public.es_admin_o_dueno(p.id)
       and not coalesce((select h.exento from public.horario_de(p.id) h), false)
       and not exists (select 1 from public.cowork_fuera f where f.user_id = p.id and f.hasta is null)
  loop
    continue when r.ultimo is null;                         -- no vino: eso es tardanza/ausencia
    continue when public.presente_en_cowork(r.uid, v_ahora);
    insert into public.cowork_fuera (user_id, tenant_id, desde)
    values (r.uid, r.tenant_id, greatest(r.ultimo, r.inicio))
    on conflict do nothing;
  end loop;

  -- 3) Avisar a quien lleva 1 minuto o más fuera: al dueño, a los supervisores de
  --    su equipo y a la persona. La campana dispara el push sola (trigger).
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
           r.user_id, 'profile', 'HR', 'high', 'new', 'personal', d.link
      from (
        select o.user_id as uid, '/hr/monitor-ia?t=donde' as link
          from public.tenant_owners o where o.tenant_id = r.tenant_id
        union
        select s.id, '/dashboard'
          from public.profiles s
          join public.tenant_members sm on sm.user_id = s.id and sm.tenant_id = r.tenant_id
         where s.nivel = 'supervisor' and s.deleted_at is null and s.id <> r.user_id
           and public.equipo_de(s.id) = public.equipo_de(r.user_id)
           and not exists (select 1 from public.tenant_owners o2 where o2.user_id = s.id and o2.tenant_id = r.tenant_id)
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
$$;

revoke all on function public.horario_de(uuid) from public, anon;
revoke all on function public.turno_en_curso(uuid, timestamptz) from public, anon;
revoke all on function public.presente_en_cowork(uuid, timestamptz) from public, anon;
revoke all on function public.vigilar_fuera_de_cowork() from public, anon, authenticated;
grant execute on function public.horario_de(uuid) to authenticated;
grant execute on function public.turno_en_curso(uuid, timestamptz) to authenticated;
grant execute on function public.presente_en_cowork(uuid, timestamptz) to authenticated;

-- El tablero «Dónde está cada uno».
create or replace function public.donde_esta_cada_uno()
returns table (
  user_id uuid, nombre text, puesto text, equipo text,
  entrada time, salida time, en_turno boolean,
  estado text, estado_desde timestamptz, ultimo_latido timestamptz,
  pantalla_at timestamptz, pantalla_que text, pantalla_fuera_de_lugar boolean, captura_at timestamptz,
  fuera_hoy_veces integer, fuera_hoy_min integer, exento boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := (select auth.uid());
  v_tenant uuid := public.current_tenant_id();
  v_todos boolean;
  v_hoy timestamptz := date_trunc('day', now() at time zone 'America/Bogota') at time zone 'America/Bogota';
begin
  if v_uid is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  v_todos := public.es_admin_o_dueno(v_uid) or coalesce(public.es_rh(v_uid), false);

  return query
  with gente as (
    select p.id, p.full_name
      from public.profiles p
      join public.tenant_members m on m.user_id = p.id and m.tenant_id = v_tenant
     where p.deleted_at is null
       and not public.es_admin_o_dueno(p.id)
       and (v_todos or p.id in (select s.user_id from public.mi_equipo_supervisado() s))
  )
  select g.id,
         g.full_name,
         (select string_agg(distinct ur.role, ' + ') from public.user_roles ur where ur.user_id = g.id),
         public.equipo_de(g.id),
         h.entrada, h.salida,
         (t.inicio is not null),
         case
           when seg.estado is not null then seg.estado
           when br.started_at is not null then 'pausa'
           when f.desde is not null then 'fuera_de_cowork'
           when t.inicio is not null and not exists (
                  select 1 from public.cowork_tiempo_segmentos s2
                   where s2.user_id = g.id and s2.started_at >= t.inicio - interval '30 minutes') then 'no_ha_entrado'
           when t.inicio is not null then 'fuera_de_cowork'
           else 'fuera_de_turno'
         end,
         coalesce(seg.started_at, br.started_at, f.desde),
         (select max(s3.last_seen_at) from public.cowork_tiempo_segmentos s3 where s3.user_id = g.id and s3.started_at > now() - interval '2 days'),
         cap.created_at, cap.veredicto, cap.fuera_de_lugar,
         capx.created_at,
         coalesce(fh.veces, 0), coalesce(fh.minutos, 0),
         coalesce(h.exento, false)
    from gente g
    left join lateral public.horario_de(g.id) h on true
    left join lateral public.turno_en_curso(g.id) t on true
    left join lateral (
      select s.estado, s.started_at from public.cowork_tiempo_segmentos s
       where s.user_id = g.id and s.ended_at is null and s.last_seen_at > now() - interval '90 seconds'
       order by s.started_at desc limit 1
    ) seg on true
    left join lateral (
      select b.started_at from public.cowork_breaks b
       where b.user_id = g.id and b.ended_at is null and b.started_at > now() - interval '4 hours'
       order by b.started_at desc limit 1
    ) br on true
    left join lateral (
      select x.desde from public.cowork_fuera x where x.user_id = g.id and x.hasta is null limit 1
    ) f on true
    left join lateral (
      select c.created_at, c.veredicto, c.fuera_de_lugar from public.monitor_capturas c
       where c.user_id = g.id and c.tipo = 'pantalla' and c.veredicto is not null and c.created_at > now() - interval '12 hours'
       order by c.created_at desc limit 1
    ) cap on true
    left join lateral (
      select c.created_at from public.monitor_capturas c
       where c.user_id = g.id and c.tipo = 'pantalla' and c.created_at > now() - interval '12 hours'
       order by c.created_at desc limit 1
    ) capx on true
    left join lateral (
      select count(*)::int as veces,
             coalesce(round(sum(extract(epoch from (coalesce(x.hasta, now()) - x.desde))) / 60), 0)::int as minutos
        from public.cowork_fuera x where x.user_id = g.id and x.desde >= v_hoy
    ) fh on true
   order by g.full_name;
end;
$$;

revoke all on function public.donde_esta_cada_uno() from public, anon;
grant execute on function public.donde_esta_cada_uno() to authenticated;
