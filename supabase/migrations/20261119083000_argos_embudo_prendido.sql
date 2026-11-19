-- ARGOS: EL EMBUDO PRENDIDO DE VERDAD (Alvaro, 19/11/2026: «prender ya así»).
--
-- Desde el 18/11 los filtros corrían en sombra (20261118010000_argos_filtros_sombra):
-- solo anotaban qué se habría saltado. Ahora el juez (edge argos-mirar) pasa cada
-- pantallazo por el embudo aprobado el 17/11, de lo más barato a lo más caro:
--
--   1) ¿Cambió la pantalla? La huella (dHash de 256 bits) se parece (≤ 24 bits
--      distintos) a la del pantallazo anterior de la persona que miró una IA o
--      la lista (≤ 10 min antes) → se copia ese veredicto. Gratis.
--   2) ¿Qué app tiene al frente? Si la app/página está en la lista aprobada
--      (argos_apps_trabajo) → «trabajo». Gratis. Las apps que muestran OTRA
--      pantalla adentro (escritorio remoto como AnyDesk; Blu App, que es un
--      navegador con título fijo; la app de Maven con título «Maven», que queda
--      al frente mientras la pantalla muestra el escritorio) NO cuentan solas:
--      pasan a la IA chica. Con los datos del 18–19/11, el 100 % de las malas
--      que la lista dejaba pasar venían de esas dos (Blu App con YouTube o
--      Instagram adentro, Maven con el escritorio vacío).
--   3) IA chica: Gemini Flash-Lite con la imagen en resolución baja responde
--      sí / no / no sé. «Sí» → trabajo, listo.
--   4) Argos detallado (el de siempre) para «no» y «no sé», y una revisión al
--      azar (10 %) de todo lo que los filtros 1–3 dieron por bueno, para seguir
--      midiendo cuántas malas se escapan.
--
-- TOPE DIARIO (Alvaro, 19/11): monitor_config.argos_tope_dia_usd (USD 1,50).
-- La edge suma lo gastado hoy (hora de Bogotá, argos_gasto_hoy) y NUNCA pide
-- una mirada que lo pase. Al acercarse (70 % del tope) entra en «ahorro»: sin
-- revisión al azar, la IA chica decide sola y Argos detallado solo mira los
-- «no» seguros. Si ya no cabe ni la chica, la foto queda sin juzgar (no cuenta
-- como mala ni como buena). null = sin tope.
--
-- Escritorio remoto (AnyDesk, TeamViewer, Escritorio remoto de Chrome, RustDesk,
-- Parsec…) nunca cuenta como trabajo por el nombre: siempre va a la IA chica.
--
-- Cada veredicto dice quién lo decidió (monitor_capturas.juzgada_por). Las
-- cuentas de Gemini cobran solo las miradas de verdad: la detallada a USD 0,0022
-- y la chica a su precio (monitor_config.argos_precio_chica_usd).
--
-- INTERRUPTOR: update public.monitor_config set argos_filtros_activos = false where id = 1;
-- apaga TODO el embudo al instante: Argos vuelve a mirar cada foto con la IA
-- detallada, como antes del 19/11.

-- ─── Columnas ────────────────────────────────────────────────────────────────
alter table public.monitor_capturas add column if not exists juzgada_por text;
alter table public.monitor_capturas add column if not exists filtro_decia text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'monitor_capturas_juzgada_por_check') then
    alter table public.monitor_capturas add constraint monitor_capturas_juzgada_por_check
      check (juzgada_por is null or juzgada_por in ('argos', 'argos_azar', 'ia_chica', 'filtro_igual', 'filtro_lista'));
  end if;
end $$;
comment on column public.monitor_capturas.juzgada_por is
  'Quién decidió el veredicto. null o argos = Argos detallado (como siempre); argos_azar = Argos detallado por la revisión al azar de algo que el embudo daba por bueno; ia_chica = Flash-Lite dijo «sí, trabajo»; filtro_igual = la pantalla no cambió y se copió el veredicto anterior; filtro_lista = app/página de la lista aprobada.';
comment on column public.monitor_capturas.filtro_decia is
  'Lo que decía el embudo antes de Argos detallado: igual, lista, ia_chica_si, ia_chica_no, ia_chica_no_se, ia_chica_error. Con juzgada_por=argos_azar y fuera_de_lugar=true es una mala que el embudo habría dejado pasar.';

alter table public.monitor_config add column if not exists argos_filtros_activos boolean not null default true;
alter table public.monitor_config add column if not exists argos_umbral_huella integer not null default 24;
alter table public.monitor_config add column if not exists argos_revision_azar numeric not null default 0.10;
alter table public.monitor_config add column if not exists argos_precio_chica_usd numeric not null default 0.0003;
alter table public.monitor_config add column if not exists argos_tope_dia_usd numeric default 1.50;
comment on column public.monitor_config.argos_tope_dia_usd is
  'Tope de gasto de Gemini de Argos por día (hora de Bogotá), en USD. Nunca se pasa: cerca del tope decide la IA chica sola y, si no cabe ni esa, la foto queda sin juzgar. null = sin tope.';
comment on column public.monitor_config.argos_filtros_activos is
  'Interruptor del embudo de Argos (huella, lista, IA chica). false = todas las fotos a Argos detallado, como antes del 19/11.';
comment on column public.monitor_config.argos_umbral_huella is
  'Bits distintos (de 256) hasta los que dos pantallazos cuentan como «la misma pantalla». 24 = el del informe en sombra.';
comment on column public.monitor_config.argos_revision_azar is
  'Probabilidad (0–1) de mandar a Argos detallado algo que el embudo ya dio por bueno, para medir escapadas.';
comment on column public.monitor_config.argos_precio_chica_usd is
  'USD por mirada de la IA chica (Gemini Flash-Lite, imagen en resolución baja). La detallada sigue en costos_servicios(google_ia).';

-- Las apps que muestran OTRA pantalla adentro no cuentan solas como trabajo.
alter table public.argos_apps_trabajo add column if not exists contenedor boolean not null default false;
comment on column public.argos_apps_trabajo.contenedor is
  'true = la app puede mostrar cualquier cosa adentro (Blu App, la ventana «Maven» sola): el nombre no alcanza y la foto pasa a la IA chica.';
update public.argos_apps_trabajo set contenedor = true
 where (campo = 'app' and patron in ('Blu App', 'Maven'))
    or (campo = 'titulo' and patron in ('%BLU%', '%Maven%'));

-- ─── La decisión de los filtros 1 y 2, foto por foto ────────────────────────
-- La edge la llama una vez por ronda con los pantallazos que va a juzgar.
-- filtro: 'igual' | 'lista' | 'contenedor' | null. Mismas reglas que
-- argos_informe_sombra (umbral, ventana de 10 min, solo aprobadas, ±5 s del
-- tramo de argos_uso_apps), con dos cuidados:
--  · El «anterior» es el último que miró una IA o la lista, nunca otra copia
--    (filtro_igual): así una pantalla que cambia de a poco no se encadena
--    copia tras copia y a los 10 min sin IA se vuelve a mirar.
--  · Escritorio remoto o un contenedor → 'contenedor' (a la IA chica).
create or replace function public.argos_embudo_filtros(p_ids uuid[])
returns table (
  id uuid,
  filtro text,
  distancia integer,
  prev_id uuid,
  prev_veredicto text,
  prev_fuera boolean,
  app text,
  titulo text,
  url text,
  lista_nota text
)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select coalesce((select m.argos_filtros_activos from monitor_config m where m.id = 1), true) as activos,
           coalesce((select m.argos_umbral_huella from monitor_config m where m.id = 1), 24) as umbral
  ),
  c as (
    select m.id, m.user_id, m.created_at, m.huella
    from monitor_capturas m
    where m.id = any(p_ids) and m.tipo = 'pantalla'
  ),
  x as (
    select c.*, prev.id as prev_id, prev.huella as huella_prev, prev.veredicto as prev_veredicto,
           prev.fuera_de_lugar as prev_fuera, u.app, u.titulo, u.url
    from c
    left join lateral (
      select m2.id, m2.huella, m2.veredicto, m2.fuera_de_lugar from monitor_capturas m2
      where m2.user_id = c.user_id and m2.tipo = 'pantalla' and m2.veredicto is not null
        and coalesce(m2.juzgada_por, 'argos') <> 'filtro_igual'
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
  d as (
    select x.*,
      case when x.huella ~ '^[0-9a-f]{64}$' and coalesce(x.huella_prev, '') ~ '^[0-9a-f]{64}$'
           then bit_count(('x' || x.huella)::bit(256) # ('x' || x.huella_prev)::bit(256))::int end as dist,
      (coalesce(x.app, '') || ' ' || coalesce(x.titulo, '') || ' ' || coalesce(x.url, ''))
        ~* '(anydesk|teamviewer|rustdesk|parsec|splashtop|remote ?desktop|remotedesktop|escritorio remoto|chrome remote|vnc|mstsc|msrdc|nomachine|ultraviewer|supremo|jump desktop|remotepc|getscreen|zoho assist)' as remoto,
      (select l.nota from argos_apps_trabajo l
        where x.app is not null and l.aprobado and not l.contenedor
          and case l.campo when 'app' then x.app ilike l.patron
                           when 'titulo' then coalesce(x.titulo, '') ilike l.patron
                           else coalesce(x.url, '') ilike l.patron end
        order by l.id limit 1) as nota_lista,
      exists (select 1 from argos_apps_trabajo l
        where x.app is not null and l.aprobado and l.contenedor
          and case l.campo when 'app' then x.app ilike l.patron
                           when 'titulo' then coalesce(x.titulo, '') ilike l.patron
                           else coalesce(x.url, '') ilike l.patron end) as en_contenedor
    from x
  )
  select d.id,
    case
      when not (select activos from cfg) then null
      -- Escritorio remoto: nunca por el nombre ni por copia; siempre la IA chica.
      when d.remoto then 'contenedor'
      when d.dist is not null and d.dist <= (select umbral from cfg) and d.prev_veredicto is not null then 'igual'
      when d.nota_lista is not null then 'lista'
      when d.en_contenedor then 'contenedor'
      else null
    end,
    d.dist, d.prev_id, d.prev_veredicto, d.prev_fuera, d.app, d.titulo, d.url, d.nota_lista
  from d;
$$;
revoke all on function public.argos_embudo_filtros(uuid[]) from public, anon, authenticated;

-- ─── Lo que cuesta cada foto ─────────────────────────────────────────────────
-- Detallada (null/argos/argos_azar con veredicto) + chica si la hubo antes.
create or replace function public.argos_costo_foto(
  p_veredicto text, p_juzgada_por text, p_filtro_decia text, p_precio numeric, p_precio_chica numeric
) returns numeric
language sql
immutable
as $$
  select case when p_veredicto is null then 0::numeric else
    (case when coalesce(p_juzgada_por, 'argos') in ('argos', 'argos_azar') then coalesce(p_precio, 0.0022) else 0 end)
    + (case when p_filtro_decia in ('ia_chica_si', 'ia_chica_no', 'ia_chica_no_se') then coalesce(p_precio_chica, 0.0003) else 0 end)
  end;
$$;

-- ─── Lo gastado hoy y el tope (lo lee la edge al empezar cada ronda) ────────
-- Día de Bogotá. Solo las fotos de pantalla de Argos (la cámara va aparte).
create or replace function public.argos_gasto_hoy()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with pr as (
    select coalesce((select c.precio_unitario_usd from costos_servicios c where c.id = 'google_ia'), 0.0022) as foto,
           coalesce((select m.argos_precio_chica_usd from monitor_config m where m.id = 1), 0.0003) as chica,
           (select m.argos_tope_dia_usd from monitor_config m where m.id = 1) as tope
  )
  select jsonb_build_object(
    'usd', coalesce((
      select sum(public.argos_costo_foto(m.veredicto, m.juzgada_por, m.filtro_decia, pr.foto, pr.chica))
        from monitor_capturas m
       where m.veredicto is not null
         and m.created_at >= (date_trunc('day', now() at time zone 'America/Bogota') at time zone 'America/Bogota')), 0),
    'precio_foto', pr.foto,
    'precio_chica', pr.chica,
    'tope', pr.tope)
  from pr;
$$;
revoke all on function public.argos_gasto_hoy() from public, anon, authenticated;

-- ─── El saldo de Gemini con el embudo ────────────────────────────────────────
-- Mismo cuerpo que 20261117140000_aviso_sin_saldo_una_vez.sql salvo que el gasto
-- ya no es «fotos con veredicto × precio» sino la suma de argos_costo_foto (una
-- copia del filtro no cuesta; la chica cuesta lo suyo). juzgadas_desde cuenta
-- solo las miradas de Argos detallado; chicas_desde y saltadas_desde, el resto.
create or replace function public.ia_saldo_calculo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  p record;
  v_precio numeric;
  v_chica numeric;
  v_juzgadas integer := 0;
  v_chicas integer := 0;
  v_saltadas integer := 0;
  v_gastado numeric := 0;
  v_saldo numeric;
  v_promedio numeric;
  v_ultimas24 numeric;
  v_ultimas3 numeric;
  v_ritmo numeric;
  v_dias numeric;
  v_ultimo_ok timestamptz;
  v_sin_saldo_at timestamptz;
  v_sin_saldo_id bigint;
  v_activo boolean;
  v_pocos numeric;
  v_hoy numeric;
  v_estado text;
begin
  select s.id, s.saldo_usd, s.medido_at, s.origen into p
    from public.costos_saldo s
   where s.servicio_id = 'google_ia'
   order by s.medido_at desc, s.id desc
   limit 1;
  select coalesce(c.precio_unitario_usd, 0.0022) into v_precio from public.costos_servicios c where c.id = 'google_ia';
  v_precio := coalesce(v_precio, 0.0022);
  select coalesce((select m.argos_precio_chica_usd from public.monitor_config m where m.id = 1), 0.0003) into v_chica;

  if p.id is not null then
    select count(*) filter (where coalesce(c.juzgada_por, 'argos') in ('argos', 'argos_azar')),
           count(*) filter (where c.filtro_decia in ('ia_chica_si', 'ia_chica_no', 'ia_chica_no_se')),
           count(*) filter (where c.juzgada_por in ('filtro_igual', 'filtro_lista')),
           coalesce(sum(public.argos_costo_foto(c.veredicto, c.juzgada_por, c.filtro_decia, v_precio, v_chica)), 0)
      into v_juzgadas, v_chicas, v_saltadas, v_gastado
      from public.monitor_capturas c
     where c.created_at >= p.medido_at and c.veredicto is not null;
    v_gastado := round(v_gastado, 2);
    v_saldo := p.saldo_usd - v_gastado;
  end if;

  select avg(x.usd) into v_promedio from (
    select sum(public.argos_costo_foto(c.veredicto, c.juzgada_por, c.filtro_decia, v_precio, v_chica)) as usd
      from public.monitor_capturas c
     where c.veredicto is not null
       and c.created_at >= (date_trunc('day', now() at time zone 'America/Bogota') - interval '10 days') at time zone 'America/Bogota'
       and c.created_at < date_trunc('day', now() at time zone 'America/Bogota') at time zone 'America/Bogota'
     group by (c.created_at at time zone 'America/Bogota')::date
    having count(*) >= 200
     order by (c.created_at at time zone 'America/Bogota')::date desc
     limit 3
  ) x;
  select coalesce(sum(public.argos_costo_foto(c.veredicto, c.juzgada_por, c.filtro_decia, v_precio, v_chica))
                    filter (where c.created_at >= now() - interval '24 hours'), 0),
         coalesce(sum(public.argos_costo_foto(c.veredicto, c.juzgada_por, c.filtro_decia, v_precio, v_chica))
                    filter (where c.created_at >= now() - interval '3 hours'), 0)
    into v_ultimas24, v_ultimas3
    from public.monitor_capturas c
   where c.veredicto is not null and c.created_at >= now() - interval '24 hours';
  v_ritmo := round(greatest(coalesce(v_promedio, 0), v_ultimas24, v_ultimas3 * 16.0 / 3), 2);

  select max(d.at) into v_ultimo_ok
    from public.argos_diag d
   where d.paso = 'ok' and d.at > now() - interval '3 days' and d.detalle ->> 'proveedor' = 'gemini';
  -- El episodio sin saldo empieza en la PRIMERA falla 402 después del último ok,
  -- no en la última: así su id no cambia en cada ronda de Argos y el aviso al
  -- dueño sale una sola vez (antes salía cada 10 min: 122 avisos el 16-17/11).
  select d.at, d.id into v_sin_saldo_at, v_sin_saldo_id
    from public.argos_diag d
   where d.paso in ('fin', 'vision_error') and d.at > now() - interval '3 days'
     and d.at > coalesce(v_ultimo_ok, '-infinity'::timestamptz)
     and ((d.detalle -> 'fallas' ->> 'gemini') like '402%'
          or (d.detalle -> 'fallas' ->> 'gemini') ilike '%prepayment credits%')
   order by d.at asc
   limit 1;

  select coalesce((select m.activo from public.monitor_config m where m.id = 1), true) into v_activo;

  v_pocos := greatest(2 * v_ritmo, 8);
  v_hoy := greatest(v_ritmo, 4);
  v_dias := case when v_saldo is not null and v_ritmo > 0 then round(greatest(v_saldo, 0) / v_ritmo, 1) end;

  v_estado := case
    when v_sin_saldo_at is not null and v_sin_saldo_at > coalesce(v_ultimo_ok, '-infinity'::timestamptz) then 'sin_saldo'
    when p.id is null then 'sin_dato'
    -- Por la cuenta ya se acabó hace rato (medio día de gasto) y Google sigue
    -- respondiendo: alguien recargó o el precio cambió → hay que anotar el saldo.
    when v_saldo <= -greatest(v_ritmo / 2, 3) then 'anotar'
    when v_saldo <= v_hoy then 'se_acaba_hoy'
    when v_saldo <= v_pocos then 'pocos_dias'
    else 'bien'
  end;

  return jsonb_build_object(
    'estado', v_estado,
    'saldo_usd', case when v_saldo is null then null else round(v_saldo, 2) end,
    'punto', case when p.id is null then null else jsonb_build_object(
      'id', p.id, 'saldo_usd', p.saldo_usd, 'medido_at', p.medido_at, 'origen', p.origen) end,
    'juzgadas_desde', v_juzgadas,
    'chicas_desde', v_chicas,
    'saltadas_desde', v_saltadas,
    'gastado_usd', v_gastado,
    'precio_foto_usd', v_precio,
    'precio_chica_usd', v_chica,
    'ritmo_dia_usd', v_ritmo,
    'dias_restantes', v_dias,
    'se_acaba_at', case when v_dias is null then null else now() + make_interval(secs => (v_dias * 86400)::double precision) end,
    'umbral_pocos_usd', v_pocos,
    'umbral_hoy_usd', v_hoy,
    'ultimo_ok', v_ultimo_ok,
    'sin_saldo_at', v_sin_saldo_at,
    'sin_saldo_id', v_sin_saldo_id,
    'argos_activo', v_activo,
    'calculado_at', now()
  );
end
$$;
revoke all on function public.ia_saldo_calculo() from public, anon, authenticated;

-- ─── Costos por parte: «juzgadas» = miradas de la IA detallada ──────────────
-- Mismo cuerpo que 20261114060000_costos_por_parte_de_maven.sql salvo la
-- cuenta de fotos: la pantalla multiplica «juzgadas» por el precio de la foto,
-- así que ahí van las miradas detalladas MÁS las chicas convertidas a su precio
-- (para que la plata dé), y aparte cuántas decidió cada parte del embudo.
create or replace function public.costos_uso_del_mes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_desde date := date_trunc('month', (now() at time zone 'America/Bogota'))::date;
  v_ini timestamptz := (date_trunc('month', (now() at time zone 'America/Bogota')) at time zone 'America/Bogota');
  v_precio numeric;
  v_chica numeric;
  v jsonb;
begin
  if not public.es_dueno((select auth.uid())) then
    raise exception 'solo el dueño' using errcode = '42501';
  end if;
  select coalesce((select c.precio_unitario_usd from public.costos_servicios c where c.id = 'google_ia'), 0.0022) into v_precio;
  select coalesce((select m.argos_precio_chica_usd from public.monitor_config m where m.id = 1), 0.0003) into v_chica;

  with fotos as (
    select (c.created_at at time zone 'America/Bogota')::date as dia,
           count(*) filter (where c.tipo = 'pantalla') as pantalla,
           count(*) filter (where c.tipo = 'camara') as camara,
           round(coalesce(sum(public.argos_costo_foto(c.veredicto, c.juzgada_por, c.filtro_decia, v_precio, v_chica)), 0)
                 / nullif(v_precio, 0)) as juzgadas,
           count(*) filter (where c.veredicto is not null and coalesce(c.juzgada_por, 'argos') in ('argos', 'argos_azar')) as argos_detallado,
           count(*) filter (where c.filtro_decia in ('ia_chica_si', 'ia_chica_no', 'ia_chica_no_se')) as ia_chica,
           count(*) filter (where c.juzgada_por in ('filtro_igual', 'filtro_lista')) as sin_ia,
           count(*) filter (where c.en_nas) as al_nas
      from public.monitor_capturas c
     where c.created_at >= v_ini
     group by 1
  ), videos as (
    select (a.created_at at time zone 'America/Bogota')::date as dia,
           count(*) as videos,
           coalesce(sum(a.duracion_seg), 0) as segundos
      from public.argos_clips a
     where a.created_at >= v_ini
     group by 1
  ), dias as (
    select x::date as dia from generate_series(v_desde::timestamp, v_hoy::timestamp, interval '1 day') as x
  ), cubetas as (
    select o.bucket_id,
           round(sum(coalesce((o.metadata ->> 'size')::bigint, 0)) / 1073741824.0, 3) as gb,
           count(*) as archivos
      from storage.objects o
     group by o.bucket_id
  )
  select jsonb_build_object(
    'desde', v_desde,
    'hoy', v_hoy,
    'dias_del_mes', extract(day from (v_desde + interval '1 month' - interval '1 day'))::int,
    'calculado_at', now(),
    'dias', coalesce((
      select jsonb_agg(jsonb_build_object(
               'dia', d.dia,
               'pantalla', coalesce(f.pantalla, 0),
               'camara', coalesce(f.camara, 0),
               'juzgadas', coalesce(f.juzgadas, 0),
               'argos_detallado', coalesce(f.argos_detallado, 0),
               'ia_chica', coalesce(f.ia_chica, 0),
               'sin_ia', coalesce(f.sin_ia, 0),
               'al_nas', coalesce(f.al_nas, 0),
               'videos', coalesce(vv.videos, 0),
               'video_seg', coalesce(vv.segundos, 0)) order by d.dia)
        from dias d
        left join fotos f on f.dia = d.dia
        left join videos vv on vv.dia = d.dia), '[]'::jsonb),
    'almacenamiento', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', b.bucket_id, 'gb', b.gb, 'archivos', b.archivos) order by b.gb desc)
        from cubetas b), '[]'::jsonb)
  ) into v;
  return v;
end $$;
revoke all on function public.costos_uso_del_mes() from public, anon;
grant execute on function public.costos_uso_del_mes() to authenticated;

-- ─── Informe del embudo (reemplaza al de sombra desde el 19/11) ─────────────
-- Cuántas decidió cada parte, cuánto costó y, de la revisión al azar, cuántas
-- malas habría dejado pasar el embudo (escapadas medidas, no estimadas).
create or replace function public.argos_informe_embudo(p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with pr as (
    select coalesce((select c.precio_unitario_usd from costos_servicios c where c.id = 'google_ia'), 0.0022) as foto,
           coalesce((select m.argos_precio_chica_usd from monitor_config m where m.id = 1), 0.0003) as chica
  ),
  c as (
    select m.juzgada_por, m.filtro_decia, coalesce(m.fuera_de_lugar, false) as mala,
           public.argos_costo_foto(m.veredicto, m.juzgada_por, m.filtro_decia, pr.foto, pr.chica) as usd
    from monitor_capturas m, pr
    where m.tipo = 'pantalla' and m.veredicto is not null
      and m.created_at >= p_desde and m.created_at < p_hasta
  )
  select jsonb_build_object(
    'fotos', (select count(*) from c),
    'por_parte', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(juzgada_por, 'argos') as k, count(*) as n from c group by 1) t), '{}'::jsonb),
    'malas', (select count(*) from c where mala),
    'azar_revisadas', (select count(*) from c where juzgada_por = 'argos_azar'),
    'azar_escapadas', (select count(*) from c where juzgada_por = 'argos_azar' and mala),
    'azar_escapadas_por_filtro', coalesce((select jsonb_object_agg(k, n) from (
        select filtro_decia as k, count(*) as n from c where juzgada_por = 'argos_azar' and mala group by 1) t), '{}'::jsonb),
    'usd', round((select coalesce(sum(usd), 0) from c), 2),
    'usd_sin_embudo', round((select count(*) from c) * (select foto from pr), 2)
  );
$$;
revoke all on function public.argos_informe_embudo(timestamptz, timestamptz) from public, anon, authenticated;
