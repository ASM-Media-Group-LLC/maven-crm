-- POR QUÉ SE CAE LA LLAMADA, PERSONA POR PERSONA (Alvaro, 11/11/2026).
--
-- llamada_cortes ya anotaba cada corte (100 a 160 reconexiones al día en unas
-- 20 personas), pero no el porqué. Ahora:
--  1) Cada corte trae `contexto`: la última medición de la llamada de esa
--     persona (si su computador no daba abasto, si su internet no subía, si la
--     pestaña estaba dormida…). Ver frontend/src/lib/saludDeLlamada.ts.
--  2) llamada_salud: una medición por minuto mientras dura la llamada.
--  3) diagnostico_de_llamada: junta las dos y saca la causa probable.
--  4) vigilar_cortes_de_llamada (cada 5 min): a quien se le cortó la llamada 4
--     veces o más en la última hora, le avisa a ella y a su supervisor, con la
--     causa (decisión de Alvaro: «avisar a la persona y supervisor»). Un aviso
--     cada 3 horas por persona como mucho.

alter table public.llamada_cortes add column if not exists contexto jsonb;
create index if not exists llamada_cortes_user_creado_idx on public.llamada_cortes (user_id, creado desc);

create table if not exists public.llamada_salud (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sala text,
  creado timestamptz not null default now(),
  datos jsonb not null
);
alter table public.llamada_salud enable row level security;
-- Como llamada_cortes: cada quien inserta lo suyo; leer, solo el servidor.
create policy "llamada_salud_inserta_el_propio" on public.llamada_salud
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create index if not exists llamada_salud_user_creado_idx on public.llamada_salud (user_id, creado desc);
create index if not exists llamada_salud_creado_idx on public.llamada_salud (creado);

create table if not exists public.llamada_avisos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  creado timestamptz not null default now(),
  cortes integer not null,
  causa text not null,
  detalle jsonb
);
alter table public.llamada_avisos enable row level security;
create index if not exists llamada_avisos_user_creado_idx on public.llamada_avisos (user_id, creado desc);

-- Un número de un jsonb, o null si no es número (la muestra viene del navegador).
create or replace function public.llamada_num(_j jsonb, _k text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case when jsonb_typeof(_j -> _k) = 'number' then (_j ->> _k)::numeric end;
$$;

-- La causa probable de los cortes de una persona desde _desde.
--   computador          su computador no da abasto (el video lo frena la cpu,
--                       o la página se traba con la pestaña a la vista)
--   internet_subida     su internet de subida no alcanza
--   internet_inestable  ping alto, paquetes perdidos o calidad mala
--   pestana_dormida     el navegador duerme la pestaña de Maven
--   recargas            la página se le recargó o el navegador la descartó
--   sin_causa_clara     hay mediciones pero ninguna explica los cortes
--   sin_datos           todavía no hay mediciones (versión vieja de Maven)
create or replace function public.diagnostico_de_llamada(_uid uuid, _desde timestamptz)
returns table (
  cortes integer, recargas integer, muestras integer,
  pct_computador integer, pct_subida integer, pct_inestable integer, pct_dormida integer,
  subida_kbps integer, rtt_ms integer, perdida_pct numeric, nucleos integer, nav text,
  causa text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cortes int; v_recargas int; v_n int;
  v_cpu int; v_subida int; v_inestable int; v_dormida int;
  v_kbps int; v_rtt int; v_perdida numeric; v_nucleos int; v_nav text;
  v_causa text;
begin
  select count(*) filter (where c.fase in ('parpadeo_ok', 'caida', 'reentrada_agotada', 'recarga')),
         count(*) filter (where c.fase = 'recarga')
    into v_cortes, v_recargas
    from public.llamada_cortes c
   where c.user_id = _uid and c.creado >= _desde;

  with m as (
    select s.datos d from public.llamada_salud s where s.user_id = _uid and s.creado >= _desde
  )
  select count(*),
         count(*) filter (where d->>'limite_cam' = 'cpu' or d->>'limite_pant' = 'cpu'
                             or (d->>'vis' = 'visible' and coalesce(public.llamada_num(d, 'lag_ms'), 0) >= 1500)),
         count(*) filter (where d->>'limite_cam' = 'bandwidth' or d->>'limite_pant' = 'bandwidth'
                             or coalesce(public.llamada_num(d, 'subida_kbps'), 99999) < 800),
         count(*) filter (where d->>'calidad' in ('poor', 'lost')
                             or coalesce(public.llamada_num(d, 'rtt_ms'), 0) >= 400
                             or coalesce(public.llamada_num(d, 'perdida_pct'), 0) >= 5),
         count(*) filter (where d->>'vis' = 'hidden' and coalesce(public.llamada_num(d, 'lag_ms'), 0) >= 5000),
         percentile_cont(0.5) within group (order by public.llamada_num(d, 'subida_kbps'))::int,
         percentile_cont(0.5) within group (order by public.llamada_num(d, 'rtt_ms'))::int,
         round(avg(public.llamada_num(d, 'perdida_pct')), 1),
         max(public.llamada_num(d, 'nucleos'))::int,
         max(d->>'nav')
    into v_n, v_cpu, v_subida, v_inestable, v_dormida, v_kbps, v_rtt, v_perdida, v_nucleos, v_nav
    from m;

  -- En porcentaje de las mediciones.
  if v_n > 0 then
    v_cpu := round(100.0 * v_cpu / v_n); v_subida := round(100.0 * v_subida / v_n);
    v_inestable := round(100.0 * v_inestable / v_n); v_dormida := round(100.0 * v_dormida / v_n);
  end if;

  -- La que más pesa, si pesa (25 % o más); empate: computador > subida > inestable > dormida.
  v_causa := case
    when v_n = 0 and v_recargas >= 2 then 'recargas'
    when v_n = 0 then 'sin_datos'
    when greatest(v_cpu, v_subida, v_inestable, v_dormida) < 25 then
      case when v_recargas >= 2 then 'recargas' else 'sin_causa_clara' end
    when v_cpu = greatest(v_cpu, v_subida, v_inestable, v_dormida) then 'computador'
    when v_subida = greatest(v_cpu, v_subida, v_inestable, v_dormida) then 'internet_subida'
    when v_inestable = greatest(v_cpu, v_subida, v_inestable, v_dormida) then 'internet_inestable'
    else 'pestana_dormida'
  end;

  return query select v_cortes, v_recargas, v_n, v_cpu, v_subida, v_inestable, v_dormida,
                      v_kbps, v_rtt, v_perdida, v_nucleos, v_nav, v_causa;
end;
$$;
revoke all on function public.diagnostico_de_llamada(uuid, timestamptz) from public, anon, authenticated;

-- Lo que se le dice a la persona según la causa (lo que puede hacer ella).
create or replace function public.consejo_de_llamada(_causa text, _kbps integer, _rtt integer, _perdida numeric)
returns text
language sql
immutable
set search_path = public
as $$
  select case _causa
    when 'computador' then 'Tu computador no da abasto con la llamada y se traba. Cierra los programas y pestañas que no uses; si sigue, avísale a tu supervisor.'
    when 'internet_subida' then format('Tu internet de subida no alcanza%s. Acércate al router o conéctate por cable, y que nadie más en tu casa esté subiendo videos.',
                                       case when _kbps is not null then format(' (unos %s kbps)', _kbps) else '' end)
    when 'internet_inestable' then format('Tu internet está inestable%s. Acércate al router, conéctate por cable o reinicia el módem.',
                                          case when _rtt is not null then format(' (ping %s ms, pérdida %s %%)', _rtt, coalesce(_perdida, 0)) else '' end)
    when 'pestana_dormida' then 'Tu navegador está dejando dormida la pestaña de Maven. En Chrome: Configuración → Rendimiento → agrega app.maven-ai.me a «Mantener siempre activos estos sitios».'
    when 'recargas' then 'La página de Maven se te recargó varias veces. Cierra las otras pestañas de Maven y deja una sola abierta.'
    else 'Todavía no encontramos una causa clara. Si sigue, avísale a tu supervisor.'
  end;
$$;

create or replace function public.causa_de_llamada_corta(_causa text)
returns text
language sql
immutable
set search_path = public
as $$
  select case _causa
    when 'computador' then 'su computador no da abasto'
    when 'internet_subida' then 'su internet de subida no alcanza'
    when 'internet_inestable' then 'su internet está inestable'
    when 'pestana_dormida' then 'su navegador duerme la pestaña de Maven'
    when 'recargas' then 'la página de Maven se le recarga'
    when 'sin_datos' then 'todavía sin medición'
    else 'sin causa clara todavía'
  end;
$$;

create or replace function public.vigilar_cortes_de_llamada()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  dx record;
  v_ahora timestamptz := now();
  v_avisos int := 0;
begin
  for r in
    select c.user_id, p.full_name, tm.tenant_id
      from public.llamada_cortes c
      join public.profiles p on p.id = c.user_id and p.deleted_at is null
      join lateral (select m.tenant_id from public.tenant_members m where m.user_id = c.user_id limit 1) tm on true
     where c.creado >= v_ahora - interval '1 hour'
       and c.fase in ('parpadeo_ok', 'caida', 'reentrada_agotada', 'recarga')
     group by c.user_id, p.full_name, tm.tenant_id
    having count(*) >= 4
  loop
    continue when public.es_admin_o_dueno(r.user_id);
    continue when exists (select 1 from public.llamada_avisos a
                           where a.user_id = r.user_id and a.creado >= v_ahora - interval '3 hours');

    select * into dx from public.diagnostico_de_llamada(r.user_id, v_ahora - interval '1 hour');
    -- Sin mediciones (su pestaña sigue con la versión vieja de Maven) no hay
    -- nada útil que decir todavía: se espera a medir.
    continue when dx.causa = 'sin_datos';

    insert into public.llamada_avisos (user_id, cortes, causa, detalle)
    values (r.user_id, dx.cortes, dx.causa, to_jsonb(dx));

    -- A la persona: qué pasa y qué puede hacer.
    insert into public.notifications
      (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    values (r.user_id, 'llamada_cortes_tu',
            format('Se te cortó la llamada %s veces en la última hora', dx.cortes),
            public.consejo_de_llamada(dx.causa, dx.subida_kbps, dx.rtt_ms, dx.perdida_pct),
            'cowork', 'Cowork', 'normal', 'new', 'personal', '/cowork');

    -- A su supervisor (mismo equipo, misma agencia), con la causa.
    insert into public.notifications
      (user_id, type, title, message, reference_id, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    select s.id, 'llamada_cortes',
           format('A %s se le cortó la llamada %s veces en la última hora',
                  coalesce(nullif(trim(r.full_name), ''), 'un empleado'), dx.cortes),
           format('Causa probable: %s.%s', public.causa_de_llamada_corta(dx.causa),
                  case when dx.nav is not null then format(' Equipo: %s%s.', dx.nav,
                       case when dx.nucleos is not null then format(', %s núcleos', dx.nucleos) else '' end) else '' end),
           r.user_id, 'profile', 'Cowork', 'normal', 'new', 'personal', '/dashboard'
      from public.profiles s
      join public.tenant_members sm on sm.user_id = s.id and sm.tenant_id = r.tenant_id
     where s.nivel = 'supervisor' and s.deleted_at is null and s.id <> r.user_id
       and public.equipo_de(s.id) = public.equipo_de(r.user_id);

    v_avisos := v_avisos + 1;
  end loop;
  return v_avisos;
end;
$$;
revoke all on function public.vigilar_cortes_de_llamada() from public, anon, authenticated;

-- Cada 5 minutos; y la medición de más de 14 días se borra cada madrugada.
select cron.schedule('vigia-cortes-de-llamada', '*/5 * * * *', $$ select public.vigilar_cortes_de_llamada(); $$);
select cron.schedule('llamada-salud-limpieza', '17 8 * * *', $$ delete from public.llamada_salud where creado < now() - interval '14 days'; $$);
