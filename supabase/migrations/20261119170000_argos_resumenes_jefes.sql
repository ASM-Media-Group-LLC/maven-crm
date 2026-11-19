-- ARGOS: RESUMEN DIARIO Y TENDENCIA SEMANAL (Alvaro, 19/11/2026, por preguntas).
--
-- «Nadie alcanza a revisar todo eso» (3.235 avisos y 406 videos en 7 días). Lo
-- importante llega solo:
--   · 11:55 pm (Bogotá): a cada jefe directo, su equipo hoy — los 5 que peor
--     estuvieron (con qué pasó y la foto) y los 5 mejores (más horas, menos
--     marcas). El dueño recibe el reporte limpio de RR. HH. a las 9 am.
--   · Lunes 7 am: al dueño y a cada jefe, quién viene mejorando y quién
--     empeorando: minutos marcados por hora trabajada, esta semana vs la anterior.
-- Todo sin IA: casos del día (argos_casos) y lo que mide la app de computador.
-- Lo ve cada quien en /argos/resumen según a quién puede vigilar.

set check_function_bodies = off;

-- Minutos medidos y «marcados» (alertas sin contar «sin señal» + sin tocar nada
-- + apps ajenas si su puesto las vigila) de cada persona en un rango.
create or replace function public.argos_medida_rango(_d0 timestamptz, _d1 timestamptz)
returns table (user_id uuid, medido_min integer, marcados_min integer)
language sql
stable
security definer
set search_path = public
as $$
  with u0 as (
    select a.user_id, coalesce(a.segundos, 0)::numeric as seg,
           least(coalesce(a.segundos_inactivo, 0), coalesce(a.segundos, 0))::numeric as inac,
           public.argos_app_clase(a.app, a.titulo, a.url) as clase
      from public.argos_uso_apps a
     where a.desde >= _d0 and a.desde < _d1
  ),
  u as (
    select user_id, sum(seg) as seg,
           sum(case when clase in ('trabajo', 'neutra') then inac else 0 end) as inac,
           sum(case when clase = 'ajena' then seg else 0 end) as ajena
      from u0 group by 1
  ),
  al as (
    select a.user_id,
           sum(greatest(0, extract(epoch from (least(coalesce(a.cerrada_at, a.actualizada_at, now()), _d1) - greatest(a.abierta_at, _d0)))))::numeric as seg
      from public.argos_alertas a
     where a.abierta_at >= _d0 and a.abierta_at < _d1 and a.tipo <> 'sin_senal'
     group by 1
  )
  select u.user_id,
         round(u.seg / 60)::int,
         round((coalesce(al.seg, 0) + u.inac
                + case when public.tiene_funcion(u.user_id, 'N:argos.apps_ajenas') then u.ajena else 0 end) / 60)::int
    from u left join al on al.user_id = u.user_id
   where not public.es_dueno(u.user_id);
$$;
revoke all on function public.argos_medida_rango(timestamptz, timestamptz) from public, anon, authenticated;

-- El resumen de un día para un grupo de personas (lo usan la página y el aviso).
create or replace function public.argos_resumen_de(_gente uuid[], _dia date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select (_dia::timestamp at time zone 'America/Bogota') as d0,
           ((_dia + 1)::timestamp at time zone 'America/Bogota') as d1
  ),
  med as (
    select m.* from r, public.argos_medida_rango(r.d0, r.d1) m where m.user_id = any(_gente)
  ),
  peores as (
    select c.id, c.user_id, p.full_name as nombre, public.puesto_para_mostrar(c.user_id) as puesto,
           c.gravedad, public.argos_caso_texto(c.resumen) as que, c.foto_path, c.veredicto
      from public.argos_casos c join public.profiles p on p.id = c.user_id
     where c.dia = _dia and c.user_id = any(_gente)
     order by c.gravedad desc,
              coalesce((c.resumen ->> 'min_marcados')::int, 0)
              + coalesce((c.resumen #>> '{actividad,sin_tocar_min}')::int, 0) desc
     limit 5
  ),
  mejores as (
    select m.user_id, p.full_name as nombre, public.puesto_para_mostrar(m.user_id) as puesto,
           m.medido_min, m.marcados_min
      from med m join public.profiles p on p.id = m.user_id
     where m.medido_min >= 120
       and m.user_id not in (select user_id from peores)
     order by (m.marcados_min::numeric / greatest(m.medido_min, 1)) asc, m.medido_min desc
     limit 5
  )
  select jsonb_build_object(
    'dia', _dia,
    'medidas', (select count(*) from med),
    'casos', (select count(*) from public.argos_casos c where c.dia = _dia and c.user_id = any(_gente)),
    'peores', coalesce((select jsonb_agg(to_jsonb(peores)) from peores), '[]'::jsonb),
    'mejores', coalesce((select jsonb_agg(to_jsonb(mejores)) from mejores), '[]'::jsonb));
$$;
revoke all on function public.argos_resumen_de(uuid[], date) from public, anon, authenticated;

-- Tendencia: minutos marcados por hora trabajada, la semana que terminó vs la
-- anterior (al menos 5 h medidas en cada una).
create or replace function public.argos_tendencia_de(_gente uuid[], _lunes date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select ((_lunes - 7)::timestamp at time zone 'America/Bogota') as a0,
           (_lunes::timestamp at time zone 'America/Bogota') as a1,
           ((_lunes - 14)::timestamp at time zone 'America/Bogota') as b0
  ),
  ahora as (select m.* from r, public.argos_medida_rango(r.a0, r.a1) m where m.user_id = any(_gente)),
  antes as (select m.* from r, public.argos_medida_rango(r.b0, r.a0) m where m.user_id = any(_gente)),
  x as (
    select a.user_id, p.full_name as nombre, public.puesto_para_mostrar(a.user_id) as puesto,
           round(a.medido_min / 60.0, 1) as horas,
           round(a.marcados_min / greatest(a.medido_min / 60.0, 1), 1) as por_hora,
           round(b.marcados_min / greatest(b.medido_min / 60.0, 1), 1) as por_hora_antes
      from ahora a join antes b on b.user_id = a.user_id
      join public.profiles p on p.id = a.user_id
     where a.medido_min >= 300 and b.medido_min >= 300
  )
  select jsonb_build_object(
    'semana', _lunes - 7,
    'comparadas', (select count(*) from x),
    'mejoran', coalesce((select jsonb_agg(to_jsonb(m)) from (select * from x where por_hora < por_hora_antes order by por_hora - por_hora_antes asc limit 5) m), '[]'::jsonb),
    'empeoran', coalesce((select jsonb_agg(to_jsonb(m)) from (select * from x where por_hora > por_hora_antes order by por_hora - por_hora_antes desc limit 5) m), '[]'::jsonb));
$$;
revoke all on function public.argos_tendencia_de(uuid[], date) from public, anon, authenticated;

-- Lo que ve quien abre /argos/resumen: solo la gente que puede vigilar.
create or replace function public.argos_resumen_dia(_dia date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.argos_resumen_de(coalesce(array_agg(v.user_id), '{}'), _dia)
    from public.argos_vigilables() v;
$$;
revoke all on function public.argos_resumen_dia(date) from public, anon;
grant execute on function public.argos_resumen_dia(date) to authenticated;

create or replace function public.argos_tendencia_semana(_lunes date default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.argos_tendencia_de(
           coalesce(array_agg(v.user_id), '{}'),
           coalesce(_lunes, (date_trunc('week', now() at time zone 'America/Bogota'))::date))
    from public.argos_vigilables() v;
$$;
revoke all on function public.argos_tendencia_semana(date) from public, anon;
grant execute on function public.argos_tendencia_semana(date) to authenticated;

-- ─── Los avisos programados ──────────────────────────────────────────────────
create or replace function public.argos_resumenes_avisos(_momento text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'America/Bogota')::date;
  lunes date := (date_trunc('week', now() at time zone 'America/Bogota'))::date;
  r record;
  res jsonb;
  n integer := 0;
  peores text;
  mejores text;
begin
  if _momento = 'dia' then
    -- Cada jefe directo con su equipo (la gente que tuvo actividad hoy).
    for r in
      with activos as (
        select distinct a.user_id from public.argos_uso_apps a
         where a.desde >= (hoy::timestamp at time zone 'America/Bogota')
        union
        select c.user_id from public.argos_casos c where c.dia = hoy
      )
      select j.user_id as jefe, array_agg(distinct a.user_id) as gente
        from activos a, lateral public.jefes_directos(a.user_id) j
       group by j.user_id
    loop
      res := public.argos_resumen_de(r.gente, hoy);
      select string_agg(split_part(x ->> 'nombre', ' ', 1) || ' (' || (x ->> 'que') || ')', ' · ')
        into peores from jsonb_array_elements(res -> 'peores') x;
      select string_agg(split_part(x ->> 'nombre', ' ', 1), ', ')
        into mejores from jsonb_array_elements(res -> 'mejores') x;
      if peores is not null or mejores is not null then
        perform public.argos_caso_avisar(r.jefe, 'argos_resumen_dia',
          'Tu equipo hoy · ' || to_char(hoy, 'DD/MM'),
          coalesce('Lo peor: ' || peores || '. ', 'Nadie marcado hoy. ')
            || coalesce('Lo mejor: ' || mejores || '.', ''),
          '/argos/resumen?dia=' || to_char(hoy, 'YYYY-MM-DD'), null, 'medium');
        n := n + 1;
      end if;
    end loop;
  elsif _momento = 'semana' then
    for r in
      with activos as (
        select distinct a.user_id from public.argos_uso_apps a
         where a.desde >= ((lunes - 7)::timestamp at time zone 'America/Bogota')
           and a.desde < (lunes::timestamp at time zone 'America/Bogota')
      )
      select j.user_id as jefe, array_agg(distinct a.user_id) as gente
        from activos a, lateral public.jefes_directos(a.user_id) j
       group by j.user_id
      union all
      select o.user_id, (select array_agg(distinct a.user_id) from activos a where not public.es_dueno(a.user_id))
        from (select distinct user_id from public.tenant_owners) o
    loop
      res := public.argos_tendencia_de(r.gente, lunes);
      select string_agg(split_part(x ->> 'nombre', ' ', 1), ', ') into mejores from jsonb_array_elements(res -> 'mejoran') x;
      select string_agg(split_part(x ->> 'nombre', ' ', 1), ', ') into peores from jsonb_array_elements(res -> 'empeoran') x;
      if mejores is not null or peores is not null then
        perform public.argos_caso_avisar(r.jefe, 'argos_tendencia_semana',
          'Tendencia de la semana',
          coalesce('Mejoran: ' || mejores || '. ', '') || coalesce('Empeoran: ' || peores || '.', ''),
          '/argos/resumen?vista=semana', null, 'medium');
        n := n + 1;
      end if;
    end loop;
  end if;
  return n;
end
$$;
revoke all on function public.argos_resumenes_avisos(text) from public, anon, authenticated;

do $cron$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('argos-resumen-dia', 'argos-tendencia-semana');
    -- 11:55 pm Bogotá = 04:55 UTC del día siguiente.
    perform cron.schedule('argos-resumen-dia', '55 4 * * *', $job$select public.argos_resumenes_avisos('dia');$job$);
    -- Lunes 7 am Bogotá = 12:00 UTC.
    perform cron.schedule('argos-tendencia-semana', '0 12 * * 1', $job$select public.argos_resumenes_avisos('semana');$job$);
  end if;
end $cron$;
