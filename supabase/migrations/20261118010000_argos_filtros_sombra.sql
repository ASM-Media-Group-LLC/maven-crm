-- ARGOS A USD 15 (Alvaro, 17/11/2026). Semana de prueba de los dos filtros que
-- ahorran IA, EN SOMBRA: no cambian cómo juzga Argos, solo dejan los datos para
-- el informe del 26/11.
--  1) ¿Cambió la pantalla? Cada pantallazo trae su «huella» (256 bits, dHash
--     16x16 calculado gratis en el equipo de la persona). Si se parece a la
--     anterior que la IA ya juzgó, no haría falta volver a pagar.
--  2) ¿Qué hay al frente? La app de computador ya anota app + página en
--     argos_uso_apps. Si está en la lista de trabajo aprobada, tampoco.
-- Y la fecha desde la que Cowork solo abre en la app de computador.

alter table public.monitor_capturas add column if not exists huella text;
comment on column public.monitor_capturas.huella is
  'dHash 16x16 (64 hex) del pantallazo, calculado en el equipo. Filtro «¿cambió la pantalla?» de Argos.';

alter table public.monitor_config add column if not exists cowork_solo_app_desde timestamptz
  default '2026-11-24 05:00:00+00';
update public.monitor_config set cowork_solo_app_desde = '2026-11-24 05:00:00+00'
  where id = 1 and cowork_solo_app_desde is null;
comment on column public.monitor_config.cowork_solo_app_desde is
  'Desde cuándo Cowork en el navegador de un computador manda a la app de Maven. null = nunca.';

-- Lista de apps y páginas que cuentan como trabajo. La arma Claude con lo que
-- Argos ya ve; Alvaro aprueba cada una (aprobado=true). Patrones de ILIKE.
create table if not exists public.argos_apps_trabajo (
  id bigint generated always as identity primary key,
  campo text not null check (campo in ('app', 'titulo', 'url')),
  patron text not null,
  nota text,
  aprobado boolean not null default false,
  created_at timestamptz not null default now(),
  unique (campo, patron)
);
alter table public.argos_apps_trabajo enable row level security;
-- Sin políticas: solo el servidor la lee (el informe y, después, el juez).

-- Informe de la semana de prueba. Para cada pantallazo que la IA juzgó:
--  · igual  = su huella se parece (≤ umbral bits distintos) a la del anterior
--             juzgado de la misma persona (≤ 10 min antes);
--  · lista  = lo que había al frente estaba en la lista;
--  · escapada = era «malo» y el filtro lo habría dado por bueno.
create or replace function public.argos_informe_sombra(
  p_desde timestamptz,
  p_hasta timestamptz,
  p_umbral int default 24,
  p_solo_aprobadas boolean default true
) returns jsonb
language sql
security definer
set search_path = public
as $$
  with c as (
    select m.id, m.user_id, m.created_at, m.huella, coalesce(m.fuera_de_lugar, false) as mala
    from monitor_capturas m
    where m.tipo = 'pantalla' and m.veredicto is not null
      and m.created_at >= p_desde and m.created_at < p_hasta
  ),
  x as (
    select c.*, prev.huella as huella_prev, coalesce(prev.fuera_de_lugar, false) as mala_prev,
           u.app, u.titulo, u.url
    from c
    left join lateral (
      select m2.huella, m2.fuera_de_lugar from monitor_capturas m2
      where m2.user_id = c.user_id and m2.tipo = 'pantalla' and m2.veredicto is not null
        and m2.created_at < c.created_at and m2.created_at > c.created_at - interval '10 minutes'
      order by m2.created_at desc limit 1
    ) prev on true
    left join lateral (
      select a.app, a.titulo, a.url from argos_uso_apps a
      where a.user_id = c.user_id
        and c.created_at between a.desde - interval '5 seconds' and a.hasta + interval '5 seconds'
      order by a.hasta desc limit 1
    ) u on true
  ),
  f as (
    select x.*,
      (x.huella is not null and x.huella_prev is not null
        and length(x.huella) = 64 and length(x.huella_prev) = 64
        and bit_count(('x' || x.huella)::bit(256) # ('x' || x.huella_prev)::bit(256)) <= p_umbral) as igual,
      (x.app is not null and exists (
        select 1 from argos_apps_trabajo l
        where (l.aprobado or not p_solo_aprobadas)
          and case l.campo when 'app' then x.app ilike l.patron
                           when 'titulo' then coalesce(x.titulo, '') ilike l.patron
                           else coalesce(x.url, '') ilike l.patron end)) as lista
    from x
  ),
  g as (
    select f.*, (f.igual or f.lista) as salta,
      (f.mala and ((f.igual and not f.mala_prev) or (not f.igual and f.lista))) as escapada
    from f
  ),
  dia as (
    select (created_at at time zone 'America/Bogota')::date as d,
      count(*) as miradas,
      count(*) filter (where salta) as saltadas,
      count(*) filter (where mala) as malas,
      count(*) filter (where escapada) as escapadas
    from g group by 1
  )
  select jsonb_build_object(
    'umbral', p_umbral,
    'miradas', (select count(*) from g),
    'con_huella', (select count(*) from g where huella is not null),
    'con_app', (select count(*) from g where app is not null),
    'saltadas_igual', (select count(*) from g where igual),
    'saltadas_lista', (select count(*) from g where lista and not igual),
    'saltadas', (select count(*) from g where salta),
    'malas', (select count(*) from g where mala),
    'malas_escapadas', (select count(*) from g where escapada),
    'usd_hoy', round((select count(*) from g) * 0.0022, 2),
    'usd_con_filtros', round((select count(*) from g where not salta) * 0.0022, 2),
    'por_dia', coalesce((select jsonb_agg(to_jsonb(dia) order by d) from dia), '[]'::jsonb)
  );
$$;
revoke all on function public.argos_informe_sombra(timestamptz, timestamptz, int, boolean) from public, anon, authenticated;
