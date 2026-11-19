-- RR. HH. JUZGA A ARGOS (Alvaro, 19/11/2026, por preguntas y respuestas).
--
-- Argos marca; un humano de RR. HH. confirma. Cada persona tiene UN CASO POR
-- DÍA (hora de Bogotá) con todo lo que Argos marcó: alertas con sus minutos,
-- fotos fuera de lugar, llamados, reportes, videos, si no entró, y lo nuevo que
-- ya mide la app de computador sin gastar IA: minutos sin tocar nada y minutos
-- en apps ajenas a la lista de trabajo. RR. HH. decide: «cometió», «no cometió»
-- o «justificado», siempre con una frase.
--
-- TODO VA POR EL PUESTO (Alvaro: «si esto es algo del rol, ponerlo en el rol»).
-- Cinco funciones nuevas en Ajustes → Posiciones (Argos → Revisión de RR. HH.):
--   N:argos.casos.juzgar    juzgar los casos
--   N:argos.casos.obligado  tiene que revisar cada día (cartel si se atrasa)
--   N:argos.casos.corregir  cambiar un veredicto ya dado
--   N:argos.casos.reporte   recibir el reporte limpio de las 9 am
--   N:argos.casos.jefe      aviso si la revisión se atrasa y de casos graves
-- HHRR (Andrea) = juzgar + obligado. «Jefe de RR. HH.» (Grace) = juzgar +
-- corregir + reporte + jefe. El dueño tiene todo por su puesto (acceso total),
-- pero nunca carga con el cartel ni con los avisos de jefe.
--
-- AVISOS (campana + celular; la tarjeta de la campana pinta color y foto):
--   · la persona juzgada, siempre y al momento;
--   · su jefe directo cuando se confirma «cometió»;
--   · quien tenga «jefe» cuando se confirma un caso grave;
--   · el dueño cuando alguien corrige el veredicto de otro;
--   · 7 am: a quien está obligado, «tienes N casos de ayer»;
--   · 9 am: el reporte a quien tenga «reporte»; y a quien tenga «jefe», si
--     quedaron casos de ayer sin revisar.
--
-- Hasta el 26/11 esto solo se anota: no toca la nota ni el pago. Desde ese día
-- (decisión de Alvaro) solo lo confirmado «cometió» contará; eso se conecta en
-- una migración aparte.

set check_function_bodies = off;

-- ─── Funciones por puesto ────────────────────────────────────────────────────
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
     );
$$;
revoke all on function public.tiene_funcion(uuid, text) from public, anon;
grant execute on function public.tiene_funcion(uuid, text) to authenticated;

-- Lo que puede el que mira, de una vez (la pantalla decide qué mostrar).
create or replace function public.mis_funciones_casos()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'juzgar',   public.tiene_funcion(u.id, 'N:argos.casos.juzgar'),
    'obligado', public.tiene_funcion(u.id, 'N:argos.casos.obligado') and not public.es_dueno(u.id),
    'corregir', public.tiene_funcion(u.id, 'N:argos.casos.corregir'),
    'reporte',  public.tiene_funcion(u.id, 'N:argos.casos.reporte'),
    'jefe',     public.tiene_funcion(u.id, 'N:argos.casos.jefe'),
    'dueno',    public.es_dueno(u.id))
  from (select (select auth.uid()) as id) u;
$$;
revoke all on function public.mis_funciones_casos() from public, anon;
grant execute on function public.mis_funciones_casos() to authenticated;

-- Jefe directo: supervisor de su equipo y quien tenga ese equipo a cargo, de su
-- misma agencia. Nunca el dueño (a él le llega el reporte).
create or replace function public.jefes_directos(_target uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct x.uid
    from (
      select s.id as uid from public.profiles s
       where s.deleted_at is null and s.nivel = 'supervisor'
         and public.equipo_de(s.id) <> 'Otros'
         and public.equipo_de(s.id) = public.equipo_de(_target)
      union
      select e.user_id from public.equipos_a_cargo e
       where e.equipo = public.equipo_de(_target)
    ) x
   where x.uid is not null and x.uid <> _target
     and not public.es_dueno(x.uid)
     and exists (
       select 1 from public.tenant_members a
         join public.tenant_members b on b.tenant_id = a.tenant_id
        where a.user_id = x.uid and b.user_id = _target);
$$;
revoke all on function public.jefes_directos(uuid) from public, anon, authenticated;

-- El nombre del puesto para mostrar: el de trabajo antes que Admin o Dueño.
create or replace function public.puesto_para_mostrar(_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select string_agg(pb.nombre, ' · ' order by pb.orden)
       from public.posiciones_borrador_personas pp
       join public.posiciones_borrador pb on pb.id = pp.posicion_id
      where pp.user_id = _uid and pb.nombre not in ('Admin', 'Dueño')),
    (select pb.nombre
       from public.posiciones_borrador_personas pp
       join public.posiciones_borrador pb on pb.id = pp.posicion_id
      where pp.user_id = _uid order by pb.orden limit 1));
$$;
revoke all on function public.puesto_para_mostrar(uuid) from public, anon, authenticated;

-- ─── Qué app es: trabajo, neutra, bloqueada o ajena ──────────────────────────
-- La lista de trabajo es la que aprobó Alvaro (argos_apps_trabajo). Las que
-- muestran otra cosa adentro (Blu App, Maven) cuentan como trabajo para los
-- minutos: lo de adentro lo juzga la IA con la foto.
create or replace function public.argos_app_clase(_app text, _titulo text, _url text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(_app, '') ~* '^(pantalla bloqueada|lockapp\.exe|loginwindow|screensaverengine)$' then 'bloqueada'
    when exists (
      select 1 from public.argos_apps_trabajo l
       where l.aprobado
         and case l.campo when 'app' then coalesce(_app, '') ilike l.patron
                          when 'titulo' then coalesce(_titulo, '') ilike l.patron
                          else coalesce(_url, '') ilike l.patron end) then 'trabajo'
    when coalesce(_app, '') ~* '^(explorador de windows|explorer(\.exe)?|finder|configuraci[oó]n|settings|ajustes del sistema|system settings|microsoft\.notes|notas|notes|calculadora|calculator|administrador de tareas|task manager)$' then 'neutra'
    else 'ajena'
  end;
$$;
revoke all on function public.argos_app_clase(text, text, text) from public, anon;
grant execute on function public.argos_app_clase(text, text, text) to authenticated;

-- El panel de Kash (Backstage) abierto por su título también es trabajo: ya
-- estaba aprobado por la dirección kashagency.me, pero en el navegador se ve
-- «Kash Agency · Panel».
do $kash$ begin
  if to_regclass('public.argos_apps_trabajo') is not null then
    insert into public.argos_apps_trabajo (campo, patron, aprobado, contenedor, nota)
    select 'titulo', '%Kash Agency%', true, false, 'Panel de Kash (Backstage) por su título'
     where not exists (select 1 from public.argos_apps_trabajo where campo = 'titulo' and patron = '%Kash Agency%');
  end if;
end $kash$;

-- Lo que midió la app de computador en un día de una persona, sin IA:
-- minutos sin tocar nada (en apps de trabajo o neutras), con la pantalla
-- bloqueada y en apps ajenas (todo el tiempo, se toque o no), con las 3 primeras.
create or replace function public.argos_actividad_dia(_uid uuid, _dia date)
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
  u as (
    select a.app, a.titulo, a.url, coalesce(a.segundos, 0) as seg,
           least(coalesce(a.segundos_inactivo, 0), coalesce(a.segundos, 0)) as inac,
           public.argos_app_clase(a.app, a.titulo, a.url) as clase
      from public.argos_uso_apps a, r
     where a.user_id = _uid and a.desde < r.d1 and a.hasta > r.d0
  ),
  aj as (
    select left(btrim(regexp_replace(coalesce(nullif(btrim(u.titulo), ''), u.app, '?'),
                 '\s*[-–—]\s*(Google Chrome|Brave|Opera|Firefox|Safari|(Personal|Perfil \d+):\s*Microsoft\W{0,2}Edge|Microsoft\W{0,2}Edge)$', '', 'i')), 60) as nombre,
           sum(u.seg) as seg
      from u where u.clase = 'ajena'
     group by 1
     order by 2 desc
     limit 3
  )
  select jsonb_build_object(
    'medido_min',    coalesce(round(sum(u.seg) / 60.0), 0),
    'sin_tocar_min', coalesce(round(sum(case when u.clase in ('trabajo', 'neutra') then u.inac else 0 end) / 60.0), 0),
    'bloqueada_min', coalesce(round(sum(case when u.clase = 'bloqueada' then u.seg else 0 end) / 60.0), 0),
    'ajenas_min',    coalesce(round(sum(case when u.clase = 'ajena' then u.seg else 0 end) / 60.0), 0),
    'top_ajenas',    coalesce((select jsonb_agg(jsonb_build_object('nombre', aj.nombre, 'min', round(aj.seg / 60.0))) from aj where aj.seg >= 60), '[]'::jsonb))
  from u;
$$;
revoke all on function public.argos_actividad_dia(uuid, date) from public, anon;
grant execute on function public.argos_actividad_dia(uuid, date) to authenticated;

-- ─── Los casos ───────────────────────────────────────────────────────────────
create table if not exists public.argos_casos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  dia date not null,
  resumen jsonb not null default '{}'::jsonb,
  gravedad smallint not null default 1 check (gravedad between 1 and 3),
  foto_path text,
  veredicto text check (veredicto is null or veredicto in ('cometio', 'no_cometio', 'justificado')),
  frase text check (frase is null or length(btrim(frase)) between 3 and 500),
  juzgado_por uuid references public.profiles(id) on delete set null,
  juzgado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dia)
);
create index if not exists argos_casos_dia_idx on public.argos_casos (dia, veredicto);
comment on table public.argos_casos is
  'Un caso por persona y día (Bogotá) con todo lo que Argos marcó; RR. HH. lo juzga (cometio / no_cometio / justificado) con una frase. Lo arma argos_casos_armar cada 10 min mientras no tenga veredicto.';

create table if not exists public.argos_casos_historial (
  id bigint generated always as identity primary key,
  caso_id uuid not null references public.argos_casos(id) on delete cascade,
  veredicto_antes text,
  frase_antes text,
  por_antes uuid,
  veredicto text not null,
  frase text not null,
  por uuid,
  at timestamptz not null default now()
);
create index if not exists argos_casos_historial_caso_idx on public.argos_casos_historial (caso_id, at);

alter table public.argos_casos enable row level security;
alter table public.argos_casos_historial enable row level security;

-- Quién puede ver un caso:
--   · quien tenga una función de la revisión y pueda vigilar a esa persona
--     (Andrea no ve a los admins; Grace y el dueño, a todos menos el dueño);
--   · su jefe directo, solo cuando quedó «cometió»;
--   · la propia persona, cuando ya tiene veredicto.
create or replace function public.argos_caso_visible(_viewer uuid, _target uuid, _veredicto text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _viewer is not null and (
    (_viewer = _target and _veredicto is not null)
    or ((public.es_dueno(_viewer)
          or public.tiene_funcion(_viewer, 'N:argos.casos.juzgar')
          or public.tiene_funcion(_viewer, 'N:argos.casos.corregir')
          or public.tiene_funcion(_viewer, 'N:argos.casos.reporte')
          or public.tiene_funcion(_viewer, 'N:argos.casos.jefe'))
        and public.puede_vigilar_a(_viewer, _target))
    or (_veredicto = 'cometio' and public.puede_vigilar_a(_viewer, _target))
  );
$$;
revoke all on function public.argos_caso_visible(uuid, uuid, text) from public, anon;
grant execute on function public.argos_caso_visible(uuid, uuid, text) to authenticated;

do $pol$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'argos_casos' and policyname = 'argos_casos_ver') then
    create policy argos_casos_ver on public.argos_casos for select to authenticated
      using (public.argos_caso_visible((select auth.uid()), user_id, veredicto));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'argos_casos_historial' and policyname = 'argos_casos_historial_ver') then
    create policy argos_casos_historial_ver on public.argos_casos_historial for select to authenticated
      using (exists (select 1 from public.argos_casos c where c.id = caso_id
                     and public.argos_caso_visible((select auth.uid()), c.user_id, c.veredicto)));
  end if;
end $pol$;

-- La persona ve la foto de su propio caso ya juzgado (y nada más de su carpeta).
do $pol$ begin
  if to_regclass('storage.objects') is not null
     and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'monitor_capturas_read_caso_propio') then
    create policy monitor_capturas_read_caso_propio on storage.objects for select to authenticated
      using (bucket_id = 'monitor-capturas'
             and exists (select 1 from public.argos_casos c
                          where c.user_id = (select auth.uid()) and c.veredicto is not null
                            and (c.foto_path = name or c.resumen -> 'fotos' ? name)));
  end if;
end $pol$;

-- ─── Lo que pasó, en palabras (para los avisos) ──────────────────────────────
create or replace function public.argos_caso_texto(_r jsonb)
returns text
language sql
immutable
as $$
  select coalesce(nullif(array_to_string((array_remove(array[
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

-- ─── Armar los casos de un día ───────────────────────────────────────────────
-- Corre cada 10 min para hoy (y, pasada la medianoche, una vez más para ayer).
-- Solo toca casos SIN veredicto: lo juzgado no se mueve.
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
  usan as (
    select distinct a.user_id from public.argos_uso_apps a
     where a.desde < d1 and a.hasta > d0 and a.user_id in (select id from gente)
  ),
  act as (
    select usan.user_id, public.argos_actividad_dia(usan.user_id, _dia) as j from usan
  ),
  cand as (
    select g.id as user_id, alj.j as alertas, coalesce(alj.min_marcados, 0) as min_marcados,
           coalesce(alj.grav, 0) as grav, coalesce(alj.tipo_grave, false) as tipo_grave,
           coalesce(fo.n, 0) as fotos_malas, rep.n as reportes_n, rep.j as reportes,
           nud.n as llamados_n, nud.j as llamados, cl.n as videos_n, cl.min as videos_min,
           ne.j as no_entro, act.j as actividad,
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
      left join act on act.user_id = g.id
     where alj.user_id is not null or fo.user_id is not null or rep.user_id is not null or ne.user_id is not null
        or coalesce((act.j ->> 'sin_tocar_min')::int, 0) >= 30
        or coalesce((act.j ->> 'ajenas_min')::int, 0) >= 15
  )
  insert into public.argos_casos (user_id, dia, resumen, gravedad, foto_path)
  select c.user_id, _dia,
         jsonb_strip_nulls(jsonb_build_object(
           'alertas', coalesce(c.alertas, '{}'::jsonb),
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
           when c.tipo_grave or coalesce(c.reportes_n, 0) > 0 or c.no_entro is not null
             or c.min_marcados + coalesce((c.actividad ->> 'ajenas_min')::int, 0) >= 60 then 3
           when c.grav >= 2 or coalesce((c.actividad ->> 'sin_tocar_min')::int, 0) >= 30
             or coalesce((c.actividad ->> 'ajenas_min')::int, 0) >= 30 then 2
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

-- ─── Avisos ──────────────────────────────────────────────────────────────────
create or replace function public.argos_caso_avisar(
  _uid uuid, _tipo text, _titulo text, _mensaje text, _link text, _caso uuid, _prioridad text default 'medium'
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, message, reference_id, reference_type,
                                    module_origin, priority, status, deep_link_url, visibility_scope, is_read)
  select _uid, _tipo, left(_titulo, 160), left(_mensaje, 400), _caso, 'argos_caso',
         'argos', _prioridad, 'new', _link, 'personal', false
   where _uid is not null;
$$;
revoke all on function public.argos_caso_avisar(uuid, text, text, text, text, uuid, text) from public, anon, authenticated;

-- Quién tiene una función (sin el dueño cuando se pide).
create or replace function public.con_funcion(_clave text, _sin_dueno boolean default true)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct pp.user_id
    from public.posiciones_borrador_personas pp
    join public.posiciones_borrador pb on pb.id = pp.posicion_id
    join public.profiles p on p.id = pp.user_id and p.deleted_at is null
   where pb.activa and coalesce((pb.checks ->> _clave)::boolean, false)
     and not coalesce((select m.deshabilitada from public.personas_borrador_marcas m where m.user_id = pp.user_id), false)
     and (not _sin_dueno or not public.es_dueno(pp.user_id))
  union
  select o.user_id from public.tenant_owners o where not _sin_dueno;
$$;
revoke all on function public.con_funcion(text, boolean) from public, anon, authenticated;

-- ─── Juzgar (y corregir) ─────────────────────────────────────────────────────
create or replace function public.argos_caso_juzgar(_id uuid, _veredicto text, _frase text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
  c public.argos_casos%rowtype;
  hoy date := (now() at time zone 'America/Bogota')::date;
  nombre text;
  quien text;
  dia_txt text;
  que text;
  link text;
  antes_txt text;
  ahora_txt text;
  v_frase text := btrim(coalesce(_frase, ''));
begin
  if _veredicto not in ('cometio', 'no_cometio', 'justificado') then
    raise exception 'veredicto inválido' using errcode = '22023';
  end if;
  if length(v_frase) < 3 then
    raise exception 'falta la frase de por qué' using errcode = '22023';
  end if;
  select * into c from public.argos_casos where id = _id for update;
  if not found or not public.argos_caso_visible(yo, c.user_id, null) then
    raise exception 'no encontrado' using errcode = 'P0002';
  end if;
  if c.dia >= hoy then
    raise exception 'el día todavía no termina' using errcode = '22023';
  end if;
  if c.veredicto is null then
    if not public.tiene_funcion(yo, 'N:argos.casos.juzgar') then
      raise exception 'sin permiso para juzgar' using errcode = '42501';
    end if;
  else
    if not public.tiene_funcion(yo, 'N:argos.casos.corregir') then
      raise exception 'sin permiso para corregir' using errcode = '42501';
    end if;
    if c.veredicto = _veredicto and coalesce(c.frase, '') = v_frase then
      return jsonb_build_object('ok', true, 'sin_cambio', true);
    end if;
  end if;

  insert into public.argos_casos_historial (caso_id, veredicto_antes, frase_antes, por_antes, veredicto, frase, por)
  values (c.id, c.veredicto, c.frase, c.juzgado_por, _veredicto, v_frase, yo);

  update public.argos_casos
     set veredicto = _veredicto, frase = v_frase, juzgado_por = yo, juzgado_at = now(), updated_at = now()
   where id = c.id;

  select coalesce(nullif(btrim(p.full_name), ''), 'Alguien') into nombre from public.profiles p where p.id = c.user_id;
  select coalesce(nullif(btrim(p.full_name), ''), 'RR. HH.') into quien from public.profiles p where p.id = yo;
  dia_txt := to_char(c.dia, 'DD/MM');
  que := public.argos_caso_texto(c.resumen);
  link := '/argos/caso/' || c.id;

  -- 1) La persona, siempre y al momento.
  perform public.argos_caso_avisar(c.user_id,
    case _veredicto when 'cometio' then 'argos_caso_cometio' when 'justificado' then 'argos_caso_justificado' else 'argos_caso_limpio' end,
    case _veredicto
      when 'cometio' then 'Revisión de tu día ' || dia_txt || ': falta confirmada'
      when 'justificado' then 'Revisión de tu día ' || dia_txt || ': justificado'
      else 'Revisión de tu día ' || dia_txt || ': quedó limpio' end,
    case _veredicto
      when 'cometio' then que || '. RR. HH.: «' || v_frase || '»'
      when 'justificado' then 'RR. HH. revisó lo que marcó Argos y lo justificó: «' || v_frase || '». No cuenta en tu contra.'
      else 'RR. HH. revisó lo que marcó Argos y no hubo falta.' end,
    link, c.id, case when _veredicto = 'cometio' then 'high' else 'medium' end);

  -- 2) Su jefe directo, cuando quedó «cometió».
  if _veredicto = 'cometio' then
    perform public.argos_caso_avisar(j.user_id, 'argos_caso_equipo',
      'Falta confirmada: ' || nombre || ' · ' || dia_txt,
      que || '. RR. HH.: «' || v_frase || '»', link, c.id, 'high')
      from public.jefes_directos(c.user_id) j
     where j.user_id <> yo;
  end if;

  -- 3) Quien supervisa la revisión (Grace), si es grave y quedó «cometió».
  if _veredicto = 'cometio' and c.gravedad >= 3 then
    perform public.argos_caso_avisar(f.user_id, 'argos_caso_grave',
      'Caso grave confirmado: ' || nombre || ' · ' || dia_txt,
      que || '. ' || quien || ': «' || v_frase || '»', link, c.id, 'high')
      from public.con_funcion('N:argos.casos.jefe', true) f
     where f.user_id <> yo and f.user_id <> c.user_id;
  end if;

  -- 4) El dueño, cuando alguien corrige el veredicto que dio otra persona.
  if c.veredicto is not null and c.juzgado_por is distinct from yo then
    antes_txt := case c.veredicto when 'cometio' then 'Cometió' when 'justificado' then 'Justificado' else 'No cometió' end;
    ahora_txt := case _veredicto when 'cometio' then 'Cometió' when 'justificado' then 'Justificado' else 'No cometió' end;
    perform public.argos_caso_avisar(o.user_id, 'argos_caso_corregido',
      quien || ' corrigió un caso: ' || nombre || ' · ' || dia_txt,
      'Antes: ' || antes_txt || '. Ahora: ' || ahora_txt || '. Por qué: «' || v_frase || '»', link, c.id, 'medium')
      from public.tenant_owners o
     where o.user_id <> yo;
  end if;

  return jsonb_build_object('ok', true);
end
$$;
revoke all on function public.argos_caso_juzgar(uuid, text, text) from public, anon;
grant execute on function public.argos_caso_juzgar(uuid, text, text) to authenticated;

-- ─── Leer: los casos de un día y un caso ─────────────────────────────────────
create or replace function public.argos_caso_fila(_c public.argos_casos, _yo uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', _c.id,
    'user_id', _c.user_id,
    'nombre', p.full_name,
    'avatar_url', p.avatar_url,
    'puesto', public.puesto_para_mostrar(_c.user_id),
    'equipo', public.equipo_de(_c.user_id),
    'dia', _c.dia,
    'resumen', _c.resumen,
    'gravedad', _c.gravedad,
    'foto_path', _c.foto_path,
    'veredicto', _c.veredicto,
    'frase', _c.frase,
    'juzgado_por', j.full_name,
    'juzgado_at', _c.juzgado_at,
    'en_curso', _c.dia >= (now() at time zone 'America/Bogota')::date,
    'puede_juzgar', _c.veredicto is null and _c.dia < (now() at time zone 'America/Bogota')::date
                    and public.tiene_funcion(_yo, 'N:argos.casos.juzgar'),
    'puede_corregir', _c.veredicto is not null and public.tiene_funcion(_yo, 'N:argos.casos.corregir'),
    'historial', coalesce((select jsonb_agg(jsonb_build_object(
                    'veredicto_antes', h.veredicto_antes, 'veredicto', h.veredicto, 'frase', h.frase,
                    'por', hp.full_name, 'at', h.at) order by h.at)
                  from public.argos_casos_historial h left join public.profiles hp on hp.id = h.por
                 where h.caso_id = _c.id), '[]'::jsonb))
  from public.profiles p
  left join public.profiles j on j.id = _c.juzgado_por
  where p.id = _c.user_id;
$$;
revoke all on function public.argos_caso_fila(public.argos_casos, uuid) from public, anon, authenticated;

create or replace function public.argos_casos_del_dia(_dia date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(public.argos_caso_fila(c, (select auth.uid()))
                            order by (c.veredicto is not null), c.gravedad desc,
                                     coalesce((c.resumen ->> 'min_marcados')::int, 0) desc), '[]'::jsonb)
    from public.argos_casos c
   where c.dia = _dia
     and (public.es_dueno((select auth.uid()))
          or public.tiene_funcion((select auth.uid()), 'N:argos.casos.juzgar')
          or public.tiene_funcion((select auth.uid()), 'N:argos.casos.corregir')
          or public.tiene_funcion((select auth.uid()), 'N:argos.casos.reporte')
          or public.tiene_funcion((select auth.uid()), 'N:argos.casos.jefe'))
     and public.puede_vigilar_a((select auth.uid()), c.user_id);
$$;
revoke all on function public.argos_casos_del_dia(date) from public, anon;
grant execute on function public.argos_casos_del_dia(date) to authenticated;

create or replace function public.argos_caso(_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.argos_caso_fila(c, (select auth.uid()))
    from public.argos_casos c
   where c.id = _id and public.argos_caso_visible((select auth.uid()), c.user_id, c.veredicto);
$$;
revoke all on function public.argos_caso(uuid) from public, anon;
grant execute on function public.argos_caso(uuid) to authenticated;

-- Los días con casos (para elegir día) y cuántos faltan por revisar.
create or replace function public.argos_casos_dias(_desde date default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia, 'total', d.total, 'pendientes', d.pendientes) order by d.dia desc), '[]'::jsonb)
    from (
      select c.dia, count(*) as total, count(*) filter (where c.veredicto is null) as pendientes
        from public.argos_casos c
       where c.dia >= coalesce(_desde, (now() at time zone 'America/Bogota')::date - 30)
         and (public.es_dueno((select auth.uid()))
              or public.tiene_funcion((select auth.uid()), 'N:argos.casos.juzgar')
              or public.tiene_funcion((select auth.uid()), 'N:argos.casos.corregir')
              or public.tiene_funcion((select auth.uid()), 'N:argos.casos.reporte')
              or public.tiene_funcion((select auth.uid()), 'N:argos.casos.jefe'))
         and public.puede_vigilar_a((select auth.uid()), c.user_id)
       group by c.dia
    ) d;
$$;
revoke all on function public.argos_casos_dias(date) from public, anon;
grant execute on function public.argos_casos_dias(date) to authenticated;

-- ─── El cartel que no se quita (quien está obligado) ─────────────────────────
-- Casos de días que ya terminaron, sin veredicto, que esa persona puede juzgar.
create or replace function public.argos_casos_bloqueo()
returns table (debe boolean, pendientes integer, total integer)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (select (select auth.uid()) as id),
  mios as (
    select c.veredicto
      from public.argos_casos c, yo
     where c.dia < (now() at time zone 'America/Bogota')::date
       and c.dia >= (now() at time zone 'America/Bogota')::date - 14
       and public.puede_vigilar_a(yo.id, c.user_id)
       and c.dia in (select c2.dia from public.argos_casos c2
                      where c2.veredicto is null
                        and c2.dia < (now() at time zone 'America/Bogota')::date
                        and public.puede_vigilar_a(yo.id, c2.user_id))
  )
  select (public.tiene_funcion(yo.id, 'N:argos.casos.obligado') and not public.es_dueno(yo.id)
          and public.tiene_funcion(yo.id, 'N:argos.casos.juzgar')
          and (select count(*) from mios where veredicto is null) > 0) as debe,
         (select count(*) from mios where veredicto is null)::int as pendientes,
         (select count(*) from mios)::int as total
    from yo;
$$;
revoke all on function public.argos_casos_bloqueo() from public, anon;
grant execute on function public.argos_casos_bloqueo() to authenticated;

-- ─── El reporte limpio de RR. HH. ────────────────────────────────────────────
create or replace function public.argos_reporte_rrhh(_dia date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with yo as (select (select auth.uid()) as id),
  c as (
    select x.*, p.full_name as nombre, j.full_name as juez
      from public.argos_casos x
      join public.profiles p on p.id = x.user_id
      left join public.profiles j on j.id = x.juzgado_por, yo
     where x.dia = _dia
       and (public.es_dueno(yo.id) or public.tiene_funcion(yo.id, 'N:argos.casos.reporte')
            or public.tiene_funcion(yo.id, 'N:argos.casos.jefe'))
       and public.puede_vigilar_a(yo.id, x.user_id)
  )
  select jsonb_build_object(
    'dia', _dia,
    'total', (select count(*) from c),
    'cometio', (select count(*) from c where veredicto = 'cometio'),
    'no_cometio', (select count(*) from c where veredicto = 'no_cometio'),
    'justificado', (select count(*) from c where veredicto = 'justificado'),
    'sin_revisar', (select count(*) from c where veredicto is null),
    'casos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'user_id', c.user_id, 'nombre', c.nombre, 'puesto', public.puesto_para_mostrar(c.user_id),
        'veredicto', c.veredicto, 'frase', c.frase, 'juez', c.juez, 'gravedad', c.gravedad,
        'que', public.argos_caso_texto(c.resumen), 'foto_path', c.foto_path,
        'corregido', exists (select 1 from public.argos_casos_historial h where h.caso_id = c.id and h.veredicto_antes is not null))
      order by case c.veredicto when 'cometio' then 0 when 'justificado' then 2 when 'no_cometio' then 3 else 1 end,
               c.gravedad desc, c.nombre) from c), '[]'::jsonb));
$$;
revoke all on function public.argos_reporte_rrhh(date) from public, anon;
grant execute on function public.argos_reporte_rrhh(date) to authenticated;

-- ─── Los avisos programados (7 am y 9 am de Bogotá) ──────────────────────────
create or replace function public.argos_casos_avisos(_momento text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  ayer date := (now() at time zone 'America/Bogota')::date - 1;
  dia_txt text := to_char((now() at time zone 'America/Bogota')::date - 1, 'DD/MM');
  r record;
  n integer := 0;
  tot integer; com integer; lim integer; jus integer; pen integer;
  link text := '/hr/monitor-ia?t=revision&dia=' || to_char((now() at time zone 'America/Bogota')::date - 1, 'YYYY-MM-DD');
begin
  if _momento = 'manana' then
    -- A quien está obligado: «tienes N casos de ayer».
    for r in
      select f.user_id,
             (select count(*) from public.argos_casos c
               where c.dia = ayer and c.veredicto is null and public.puede_vigilar_a(f.user_id, c.user_id)) as pend
        from public.con_funcion('N:argos.casos.obligado', true) f
       where public.tiene_funcion(f.user_id, 'N:argos.casos.juzgar')
    loop
      if r.pend > 0 then
        perform public.argos_caso_avisar(r.user_id, 'argos_casos_del_dia',
          'Tienes ' || r.pend || case when r.pend = 1 then ' caso' else ' casos' end || ' de ayer para revisar',
          'Lo que marcó Argos el ' || dia_txt || ', persona por persona: decide si cometió, no cometió o está justificado.',
          link, null, 'high');
        n := n + 1;
      end if;
    end loop;
  elsif _momento = 'reporte' then
    -- El reporte limpio a quien tenga «reporte» (el dueño incluido).
    for r in select distinct x.user_id from public.con_funcion('N:argos.casos.reporte', false) x loop
      select count(*), count(*) filter (where veredicto = 'cometio'), count(*) filter (where veredicto = 'no_cometio'),
             count(*) filter (where veredicto = 'justificado'), count(*) filter (where veredicto is null)
        into tot, com, lim, jus, pen
        from public.argos_casos c
       where c.dia = ayer and public.puede_vigilar_a(r.user_id, c.user_id);
      if tot > 0 then
        perform public.argos_caso_avisar(r.user_id, 'argos_reporte_rrhh',
          'Reporte de RR. HH. · ' || dia_txt,
          com || case when com = 1 then ' cometió' else ' cometieron' end
            || ' · ' || lim || ' sin falta · ' || jus || case when jus = 1 then ' justificado' else ' justificados' end
            || case when pen > 0 then ' · ' || pen || ' sin revisar' else '' end,
          link || '&vista=reporte', null, case when com > 0 or pen > 0 then 'high' else 'medium' end);
        n := n + 1;
      end if;
    end loop;
    -- A quien supervisa la revisión: si quedó algo de ayer sin revisar.
    for r in
      select f.user_id,
             (select count(*) from public.argos_casos c
               where c.dia = ayer and c.veredicto is null and public.puede_vigilar_a(f.user_id, c.user_id)) as pend,
             (select string_agg(distinct split_part(p.full_name, ' ', 1), ', ')
                from public.con_funcion('N:argos.casos.obligado', true) o
                join public.profiles p on p.id = o.user_id) as quienes
        from public.con_funcion('N:argos.casos.jefe', true) f
    loop
      if r.pend > 0 then
        perform public.argos_caso_avisar(r.user_id, 'argos_casos_atraso',
          'Revisión atrasada: ' || r.pend || case when r.pend = 1 then ' caso' else ' casos' end || ' de ayer sin revisar',
          coalesce(r.quienes, 'RR. HH.') || ' todavía no termina los casos del ' || dia_txt || '. En el reporte salen como «sin revisar».',
          link, null, 'high');
        n := n + 1;
      end if;
    end loop;
  end if;
  return n;
end
$$;
revoke all on function public.argos_casos_avisos(text) from public, anon, authenticated;

-- ─── Relojes ─────────────────────────────────────────────────────────────────
do $cron$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('argos-casos-armar', 'argos-casos-7am', 'argos-casos-9am');
    -- Cada 10 min: los casos de hoy; en la primera hora del día, también los de ayer.
    perform cron.schedule('argos-casos-armar', '*/10 * * * *',
      $job$select public.argos_casos_armar((now() at time zone 'America/Bogota')::date);
           select public.argos_casos_armar((now() at time zone 'America/Bogota')::date - 1)
            where extract(hour from now() at time zone 'America/Bogota') < 1;$job$);
    perform cron.schedule('argos-casos-7am', '0 12 * * *', $job$select public.argos_casos_avisos('manana');$job$);
    perform cron.schedule('argos-casos-9am', '0 14 * * *', $job$select public.argos_casos_avisos('reporte');$job$);
  end if;
end $cron$;
