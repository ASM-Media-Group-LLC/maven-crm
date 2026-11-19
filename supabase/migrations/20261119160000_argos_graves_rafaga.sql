-- ARGOS VIGILA MÁS: ALERTA GRAVE Y RÁFAGA (Alvaro, 19/11/2026, por preguntas).
--
-- ALERTA GRAVE, sin gastar IA (lo mide la app de computador, argos_uso_apps):
--   · sin_actividad: 10 minutos sin tocar teclado ni ratón (o bloqueado) en turno;
--   · fuera_del_trabajo: una hora en apps ajenas a la lista de trabajo.
-- Primero se le avisa a LA PERSONA (cartel y voz de Argos en Maven + campana).
-- Si a los 2 minutos sigue igual, sube al dueño, a su jefe directo y a RR. HH.
-- (quien tenga «Juzgar los casos de Argos» y pueda vigilarla). Un episodio por
-- persona y tipo: no se repite mientras siga abierto; se cierra solo al volver.
-- Solo corre en turno: antes del 20/11 dentro de su horario; desde ese día, con
-- la entrada marcada (en_turno). Nunca en pausa ni al dueño.
--
-- RÁFAGA: cuando Argos ve algo raro (alerta de distracción, celular, fuera de
-- lugar o sin pantalla; una foto juzgada fuera de lugar; o una alerta grave), el
-- computador de esa persona saca una foto cada 10 s durante 2 minutos en vez de
-- una por minuto. Son evidencia: la IA sigue mirando una por ronda, no más.
--
-- Las alertas graves entran al caso del día (resumen.graves) y lo hacen grave.
--
-- APPS AJENAS POR PUESTO: la lista de trabajo (argos_apps_trabajo) es la de los
-- chatters. Marketing, Editores o PR trabajan en Premiere, Canva o Instagram, que
-- no están en ella. Por eso la alerta de «una hora fuera del trabajo» y el caso
-- por apps ajenas solo corren para los puestos que tengan la función
-- N:argos.apps_ajenas («Se le vigilan las apps ajenas»): hoy Chatter y Chatter
-- Supervisor. Los minutos se siguen anotando para todos.

set check_function_bodies = off;

create table if not exists public.argos_graves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('sin_actividad', 'fuera_del_trabajo')),
  abierta_at timestamptz not null default now(),
  actualizada_at timestamptz not null default now(),
  cerrada_at timestamptz,
  escalada_at timestamptz,
  minutos integer not null default 0,
  detalle text
);
create unique index if not exists argos_graves_abierta_idx on public.argos_graves (user_id, tipo) where cerrada_at is null;
create index if not exists argos_graves_dia_idx on public.argos_graves (abierta_at);
alter table public.argos_graves enable row level security;
do $pol$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'argos_graves' and policyname = 'argos_graves_ver') then
    create policy argos_graves_ver on public.argos_graves for select to authenticated
      using (user_id = (select auth.uid()) or public.puede_vigilar_a((select auth.uid()), user_id));
  end if;
end $pol$;

create table if not exists public.argos_rafagas (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  hasta timestamptz not null,
  motivo text
);
alter table public.argos_rafagas enable row level security;
do $pol$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'argos_rafagas' and policyname = 'argos_rafagas_propia') then
    create policy argos_rafagas_propia on public.argos_rafagas for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $pol$;

-- ─── Ráfaga ──────────────────────────────────────────────────────────────────
create or replace function public.argos_rafaga(_uid uuid, _motivo text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.argos_rafagas (user_id, hasta, motivo)
  values (_uid, now() + interval '2 minutes', _motivo)
  on conflict (user_id) do update
     set hasta = greatest(public.argos_rafagas.hasta, excluded.hasta), motivo = excluded.motivo;
$$;
revoke all on function public.argos_rafaga(uuid, text) from public, anon, authenticated;

create or replace function public.mi_rafaga()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select r.hasta from public.argos_rafagas r
   where r.user_id = (select auth.uid()) and r.hasta > now();
$$;
revoke all on function public.mi_rafaga() from public, anon;
grant execute on function public.mi_rafaga() to authenticated;

create or replace function public.argos_rafaga_por_alerta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo in ('distraido', 'fuera_de_lugar', 'celular', 'sin_pantalla') then
    perform public.argos_rafaga(new.user_id, new.tipo);
  end if;
  return null;
end
$$;

create or replace function public.argos_rafaga_por_foto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fuera_de_lugar and not coalesce(old.fuera_de_lugar, false)
     and new.created_at > now() - interval '5 minutes' then
    perform public.argos_rafaga(new.user_id, 'foto_fuera_de_lugar');
  end if;
  return null;
end
$$;

do $trg$ begin
  if to_regclass('public.argos_alertas') is not null then
    drop trigger if exists argos_rafaga_alerta on public.argos_alertas;
    create trigger argos_rafaga_alerta after insert on public.argos_alertas
      for each row execute function public.argos_rafaga_por_alerta();
  end if;
  if to_regclass('public.monitor_capturas') is not null then
    drop trigger if exists argos_rafaga_foto on public.monitor_capturas;
    create trigger argos_rafaga_foto after update of fuera_de_lugar on public.monitor_capturas
      for each row when (new.fuera_de_lugar is true and old.fuera_de_lugar is distinct from true)
      execute function public.argos_rafaga_por_foto();
  end if;
end $trg$;

-- ─── Alerta grave ────────────────────────────────────────────────────────────
-- Lo que ve la persona en Maven (cartel y voz) mientras su alerta está abierta.
create or replace function public.mi_alerta_grave()
returns table (id uuid, tipo text, desde timestamptz, minutos integer, detalle text, escalada boolean)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.tipo, g.abierta_at, g.minutos, g.detalle, g.escalada_at is not null
    from public.argos_graves g
   where g.user_id = (select auth.uid()) and g.cerrada_at is null
   order by g.abierta_at
   limit 1;
$$;
revoke all on function public.mi_alerta_grave() from public, anon;
grant execute on function public.mi_alerta_grave() to authenticated;

create or replace function public.argos_vigilar_graves()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  g public.argos_graves%rowtype;
  n integer := 0;
  nombre text;
  titulo text;
  msg text;
  min_txt text;
begin
  -- Quién se mide: la app de computador reportó en los últimos 3 min, está en
  -- turno y no está en pausa.
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

  -- 1) Cerrar lo que ya volvió (o quien ya no se mide: salió, pausa, fin de turno).
  update public.argos_graves g
     set cerrada_at = now()
   where g.cerrada_at is null
     and (
       not exists (select 1 from _graves_medida m where m.user_id = g.user_id)
       or (g.tipo = 'sin_actividad' and exists (select 1 from _graves_medida m where m.user_id = g.user_id and coalesce(m.ultimo_inac, 0) < 0.5))
       or (g.tipo = 'fuera_del_trabajo' and exists (select 1 from _graves_medida m where m.user_id = g.user_id and m.aj10 < 0.3 * greatest(m.cub10, 1)))
     );

  -- 2) Abrir (o seguir) episodios.
  for r in
    select m.*, 'sin_actividad'::text as tipo from _graves_medida m
     where m.cub11 >= 480 and m.inac11 >= 540 and coalesce(m.ultimo_inac, 0) >= 0.8
    union all
    select m.*, 'fuera_del_trabajo'::text from _graves_medida m
     where m.aj60 >= 3000 and m.aj10 >= 0.5 * greatest(m.cub10, 1)
       and public.tiene_funcion(m.user_id, 'N:argos.apps_ajenas') and not public.es_dueno(m.user_id)
  loop
    select * into g from public.argos_graves
     where user_id = r.user_id and tipo = r.tipo and cerrada_at is null;
    select coalesce(nullif(btrim(p.full_name), ''), 'Alguien') into nombre from public.profiles p where p.id = r.user_id;

    if not found then
      insert into public.argos_graves (user_id, tipo, minutos, detalle)
      values (r.user_id, r.tipo,
              case when r.tipo = 'sin_actividad' then round(r.inac11 / 60) else round(r.aj60 / 60) end,
              case when r.tipo = 'fuera_del_trabajo' then r.top_ajena end)
      returning * into g;
      perform public.argos_rafaga(r.user_id, 'alerta_grave');
      -- Primero la persona.
      perform public.argos_caso_avisar(r.user_id, 'argos_grave_persona',
        case when r.tipo = 'sin_actividad' then 'Llevas 10 minutos sin actividad en tu turno'
             else 'Llevas una hora fuera de tu trabajo' end,
        case when r.tipo = 'sin_actividad' then '¿Sigues ahí? Si no vuelves en 2 minutos, Argos avisa a tu jefe y a RR. HH.'
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

      -- 2 minutos después y sigue igual: sube a dueño, jefe directo y RR. HH.
      if g.escalada_at is null and g.abierta_at <= now() - interval '2 minutes' then
        update public.argos_graves set escalada_at = now() where id = g.id;
        min_txt := g.minutos::text;
        titulo := case when r.tipo = 'sin_actividad'
                       then 'Alerta grave: ' || nombre || ' lleva ' || min_txt || ' min sin actividad'
                       else 'Alerta grave: ' || nombre || ' lleva ' || min_txt || ' min fuera de su trabajo' end;
        msg := case when r.tipo = 'sin_actividad'
                    then 'En turno, sin tocar teclado ni ratón. Ya se le avisó y no volvió. Tócalo para verlo en vivo.'
                    else coalesce(g.detalle, 'Apps ajenas') || '. Ya se le avisó y sigue. Tócalo para verlo en vivo.' end;
        perform public.argos_caso_avisar(d.uid, 'argos_grave', titulo, msg, '/hr/en-vivo/' || r.user_id, g.id, 'high')
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
    end if;
  end loop;
  return n;
end
$$;
revoke all on function public.argos_vigilar_graves() from public, anon, authenticated;

-- ─── El caso del día cuenta las alertas graves ───────────────────────────────
create or replace function public.argos_caso_texto(_r jsonb)
returns text
language sql
immutable
as $$
  select coalesce(nullif(array_to_string((array_remove(array[
    case when (_r #>> '{graves,sin_actividad}')::int > 0 then
      'Alerta grave: sin actividad ×' || (_r #>> '{graves,sin_actividad}') end,
    case when (_r #>> '{graves,fuera_del_trabajo}')::int > 0 then
      'Alerta grave: fuera del trabajo ×' || (_r #>> '{graves,fuera_del_trabajo}') end,
    case when (_r #>> '{alertas,celular,n}')::int > 0 then
      'Celular ' || (_r #>> '{alertas,celular,n}') || case when (_r #>> '{alertas,celular,n}')::int = 1 then ' vez' else ' veces' end
      || ' (' || coalesce(_r #>> '{alertas,celular,min}', '0') || ' min)' end,
    case when (_r #>> '{alertas,fuera_de_lugar,min}')::int > 0 then 'Fuera de lugar ' || (_r #>> '{alertas,fuera_de_lugar,min}') || ' min' end,
    case when (_r #>> '{actividad,ajenas_min}')::int >= 5 then
      coalesce(_r #>> '{actividad,top_ajenas,0,nombre}', 'Apps ajenas') || ' ' || (_r #>> '{actividad,ajenas_min}') || ' min' end,
    case when (_r #>> '{actividad,sin_tocar_min}')::int >= 10 then 'Sin tocar nada ' || (_r #>> '{actividad,sin_tocar_min}') || ' min' end,
    case when (_r #>> '{alertas,distraido,min}')::int > 0 then 'Distraído ' || (_r #>> '{alertas,distraido,min}') || ' min' end,
    case when (_r #>> '{alertas,sin_pantalla,min}')::int > 0 then 'Sin compartir pantalla ' || (_r #>> '{alertas,sin_pantalla,min}') || ' min' end,
    case when (_r #>> '{alertas,pausa_de_mas,min}')::int > 0 then 'Pausa de más ' || (_r #>> '{alertas,pausa_de_mas,min}') || ' min' end,
    case when (_r ->> 'reportes_n')::int > 0 then 'Argos lo reportó ' || (_r ->> 'reportes_n') || case when (_r ->> 'reportes_n')::int = 1 then ' vez' else ' veces' end end,
    case when (_r -> 'no_entro') is not null and (_r -> 'no_entro') <> 'null'::jsonb then 'No entró a Cowork' end,
    case when (_r #>> '{alertas,sin_senal,min}')::int > 0 then 'Sin señal ' || (_r #>> '{alertas,sin_senal,min}') || ' min' end
  ], null))[1:4], ' · '), ''), 'Lo que marcó Argos');
$$;

create or replace function public.argos_casos_armar(_dia date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  d0 timestamptz := _dia::timestamp at time zone 'America/Bogota';
  d1 timestamptz := (_dia + 1)::timestamp at time zone 'America/Bogota';
  n integer;
begin
  with gente as (
    select p.id from public.profiles p
     where p.deleted_at is null and not public.es_dueno(p.id)
  ),
  al as (
    select a.user_id, a.tipo, count(*) as n, max(a.gravedad) as grav,
           sum(greatest(0, extract(epoch from (least(coalesce(a.cerrada_at, a.actualizada_at, now()), d1) - greatest(a.abierta_at, d0)))))::int as seg
      from public.argos_alertas a
     where a.abierta_at >= d0 and a.abierta_at < d1 and a.user_id in (select id from gente)
     group by 1, 2
  ),
  alj as (
    select al.user_id,
           jsonb_object_agg(al.tipo, jsonb_build_object('n', al.n, 'min', round(al.seg / 60.0))) as j,
           round(sum(al.seg) filter (where al.tipo <> 'sin_senal') / 60.0) as min_marcados,
           max(al.grav) as grav,
           bool_or(al.tipo in ('celular', 'fuera_de_lugar')) as tipo_grave
      from al
     group by 1
  ),
  alf as (
    select a.user_id,
           (array_agg(a.captura_path order by a.gravedad desc, a.abierta_at desc))[1:4] as fotos
      from public.argos_alertas a
     where a.abierta_at >= d0 and a.abierta_at < d1 and a.captura_path is not null
       and a.user_id in (select id from gente)
     group by 1
  ),
  fo as (
    select c.user_id, count(*) as n,
           (array_agg(c.path order by c.created_at desc))[1:6] as fotos
      from public.monitor_capturas c
     where c.created_at >= d0 and c.created_at < d1 and c.fuera_de_lugar
       and not coalesce(c.perdonado, false) and c.path is not null
       and c.user_id in (select id from gente)
     group by 1
  ),
  rep as (
    select r.user_id, count(*) as n, jsonb_object_agg(r.tipo, r.k) as j
      from (select user_id, tipo, count(*) as k from public.argos_reportes
             where created_at >= d0 and created_at < d1 group by 1, 2) r
     group by 1
  ),
  nud as (
    select x.user_id, sum(x.k) as n, jsonb_object_agg(x.tipo, x.k) as j
      from (select user_id, tipo, count(*) as k from public.argos_nudges
             where created_at >= d0 and created_at < d1 group by 1, 2) x
     group by 1
  ),
  cl as (
    select c.user_id, count(*) as n, round(sum(coalesce(c.duracion_seg, 0)) / 60.0) as min
      from public.argos_clips c
     where c.created_at >= d0 and c.created_at < d1
     group by 1
  ),
  ne as (
    select e.user_id, jsonb_build_object('llamados', e.llamados, 'reportado_at', e.reportado_at) as j
      from public.argos_no_entro e
     where e.turno = _dia and e.reportado_at is not null
  ),
  gr as (
    select x.user_id, jsonb_object_agg(x.tipo, x.k) as j
      from (select user_id, tipo, count(*) as k from public.argos_graves
             where abierta_at >= d0 and abierta_at < d1 and escalada_at is not null group by 1, 2) x
     group by 1
  ),
  usan as (
    select distinct a.user_id from public.argos_uso_apps a
     where a.desde < d1 and a.hasta > d0 and a.user_id in (select id from gente)
  ),
  act as (
    select usan.user_id, public.argos_actividad_dia(usan.user_id, _dia) as j,
           public.tiene_funcion(usan.user_id, 'N:argos.apps_ajenas') as ajenas_cuentan
      from usan
  ),
  cand as (
    select g.id as user_id, alj.j as alertas, coalesce(alj.min_marcados, 0) as min_marcados,
           coalesce(alj.grav, 0) as grav, coalesce(alj.tipo_grave, false) as tipo_grave,
           coalesce(fo.n, 0) as fotos_malas, rep.n as reportes_n, rep.j as reportes,
           nud.n as llamados_n, nud.j as llamados, cl.n as videos_n, cl.min as videos_min,
           ne.j as no_entro, act.j as actividad, gr.j as graves,
           case when coalesce(act.ajenas_cuentan, false) then coalesce((act.j ->> 'ajenas_min')::int, 0) else 0 end as ajenas_min,
           (select array_agg(distinct p) from unnest(coalesce(fo.fotos, '{}') || coalesce(alf.fotos, '{}')) p where p is not null) as fotos,
           coalesce(fo.fotos[1], alf.fotos[1]) as foto
      from gente g
      left join alj on alj.user_id = g.id
      left join alf on alf.user_id = g.id
      left join fo on fo.user_id = g.id
      left join rep on rep.user_id = g.id
      left join nud on nud.user_id = g.id
      left join cl on cl.user_id = g.id
      left join ne on ne.user_id = g.id
      left join gr on gr.user_id = g.id
      left join act on act.user_id = g.id
     where alj.user_id is not null or fo.user_id is not null or rep.user_id is not null or ne.user_id is not null
        or gr.user_id is not null
        or coalesce((act.j ->> 'sin_tocar_min')::int, 0) >= 30
        or (coalesce(act.ajenas_cuentan, false) and coalesce((act.j ->> 'ajenas_min')::int, 0) >= 15)
  )
  insert into public.argos_casos (user_id, dia, resumen, gravedad, foto_path)
  select c.user_id, _dia,
         jsonb_strip_nulls(jsonb_build_object(
           'alertas', coalesce(c.alertas, '{}'::jsonb),
           'graves', c.graves,
           'min_marcados', c.min_marcados,
           'fotos_malas', c.fotos_malas,
           'reportes_n', coalesce(c.reportes_n, 0),
           'reportes', c.reportes,
           'llamados_n', coalesce(c.llamados_n, 0),
           'llamados', c.llamados,
           'videos_n', coalesce(c.videos_n, 0),
           'videos_min', coalesce(c.videos_min, 0),
           'no_entro', c.no_entro,
           'actividad', coalesce(c.actividad, '{}'::jsonb),
           'fotos', to_jsonb(coalesce((c.fotos)[1:8], '{}'::text[])))),
         case
           when c.graves is not null or c.tipo_grave or coalesce(c.reportes_n, 0) > 0 or c.no_entro is not null
             or c.min_marcados + c.ajenas_min >= 60 then 3
           when c.grav >= 2 or coalesce((c.actividad ->> 'sin_tocar_min')::int, 0) >= 30
             or c.ajenas_min >= 30 then 2
           else 1
         end,
         c.foto
    from cand c
  on conflict (user_id, dia) do update
     set resumen = excluded.resumen,
         gravedad = excluded.gravedad,
         foto_path = excluded.foto_path,
         updated_at = now()
   where public.argos_casos.veredicto is null;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function public.argos_casos_armar(date) from public, anon, authenticated;

-- ─── Hoy se le vigilan las apps ajenas a Chatter y Chatter Supervisor ─────────
do $pos$ begin
  if to_regclass('public.posiciones_borrador') is not null then
    update public.posiciones_borrador
       set checks = checks || '{"N:argos.apps_ajenas": true}'::jsonb, updated_at = now()
     where nombre in ('Chatter', 'Chatter Supervisor')
       and not coalesce((checks ->> 'N:argos.apps_ajenas')::boolean, false);
  end if;
end $pos$;

-- ─── Reloj: cada 2 minutos ───────────────────────────────────────────────────
do $cron$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'argos-graves';
    perform cron.schedule('argos-graves', '*/2 * * * *', $job$select public.argos_vigilar_graves();$job$);
  end if;
end $cron$;
