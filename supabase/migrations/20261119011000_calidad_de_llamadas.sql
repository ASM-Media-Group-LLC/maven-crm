-- ¿LAS LLAMADAS MEJORAN DE VERDAD? (Alvaro, 18/11/2026).
--
-- Decisión del dueño: un tablero solo para él que diga, día por día, si las
-- llamadas mejoran con cada arreglo; y quién tiene problemas de AUDIO, para que
-- a esa persona y a su supervisor les llegue el aviso.
--
-- Todo sale de lo que ya se mide: llamada_salud (una muestra por persona por
-- minuto en llamada) y llamada_cortes. Desde este cambio cada muestra trae
-- además `audio` (frontend/src/lib/audioDeLlamada.ts):
--   audio.abierto     el micrófono está prendido en la llamada
--   audio.mudo        prendido pero sin sonido todo el minuto (energía 0) o el
--                     sistema lo silenció: no lo escuchan
--   audio.perdida_pct de SU voz, cuánto se pierde camino a los demás
--   audio.oculto_pct  de lo que OYE, qué parte el navegador tuvo que «rellenar»
--                     porque no llegó a tiempo (se escucha entrecortado)
-- Las muestras de antes no traen `audio`: para esos días la métrica de audio es
-- null («sin medir»), nunca 0.
--
-- Lo que hay aquí:
--   1) llamada_audio_malo / llamada_audio_causa: la regla de un minuto con audio malo.
--   2) llamadas_calidad_por_dia(_dias): los últimos N días (14 por defecto).
--   3) llamadas_calidad_por_persona(_dias): hoy (1) o 7 días, peor primero.
--   4) vigilar_audio_de_llamada (cada 5 min): 5 o más de los últimos 10 minutos
--      con audio malo → aviso a la persona (qué hacer) y a quienes reciben los
--      avisos de su equipo (destinatarios_de_aviso: supervisor, jefes, RR. HH.,
--      admins y dueño), igual que el vigía de cortes. Un aviso cada 2 horas por
--      persona como mucho; a admins y dueño no se les avisa (como en cortes).
--
-- Quién ve el tablero: SOLO el dueño (tenant_owners o profiles.nivel = 'dueno').
-- Sin permiso NO devuelve vacío: lanza un error (42501).

-- ── 1) La regla de un minuto ─────────────────────────────────────────────────
-- null = la muestra no midió el audio (versión vieja de Maven); si midió,
-- siempre true o false (cada campo que falte cuenta como «bien», con coalesce).
create or replace function public.llamada_audio_malo(_d jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(jsonb_typeof(_d -> 'audio'), '') <> 'object' then null
    else (coalesce((_d -> 'audio' -> 'abierto') = 'true'::jsonb, false)
            and (coalesce((_d -> 'audio' -> 'mudo') = 'true'::jsonb, false)
                 or coalesce(public.llamada_num(_d -> 'audio', 'perdida_pct'), 0) >= 5))
         or coalesce(public.llamada_num(_d -> 'audio', 'oculto_pct'), 0) >= 8
  end;
$$;

-- Por qué fue malo ese minuto (null si no fue malo o no se midió).
--   mic_mudo         su micrófono prendido no manda sonido
--   voz_se_pierde    su voz se pierde camino a los demás
--   escucha_cortado  a ella le llega cortado el audio de los demás
create or replace function public.llamada_audio_causa(_d jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when not coalesce(public.llamada_audio_malo(_d), false) then null
    when coalesce((_d -> 'audio' -> 'abierto') = 'true'::jsonb, false) and coalesce((_d -> 'audio' -> 'mudo') = 'true'::jsonb, false) then 'mic_mudo'
    when coalesce((_d -> 'audio' -> 'abierto') = 'true'::jsonb, false)
         and coalesce(public.llamada_num(_d -> 'audio', 'perdida_pct'), 0) >= 5 then 'voz_se_pierde'
    else 'escucha_cortado'
  end;
$$;

-- ¿Quien pregunta es el dueño? (tenant_owners, o su nivel en profiles).
create or replace function public.ve_tablero_llamadas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (select auth.uid()) is not null and (
    public.es_dueno((select auth.uid()))
    or exists (select 1 from public.profiles p
                where p.id = (select auth.uid()) and p.nivel = 'dueno' and p.deleted_at is null)
  );
$$;
revoke all on function public.ve_tablero_llamadas() from public, anon;
grant execute on function public.ve_tablero_llamadas() to authenticated;

-- ── 2) Día por día ───────────────────────────────────────────────────────────
-- Una fila por día de Bogotá (los días sin llamadas también, con minutos 0 y
-- las métricas en null). Cada métrica es un porcentaje de minutos en llamada:
--   pct_mala_conexion  LiveKit calificó la conexión como mala o perdida
--   cortes_por_100h    cortes (los mismos de Argos › Llamadas) por cada 100 h de llamada
--   pct_congelado      con la pestaña a la vista, la página se trabó más de 200 ms
--   pct_cam_limitada   con cámara prendida, el internet le bajó la calidad
--   rtt_mediana_ms     el ping típico
--   pct_audio_malo     de los minutos que midieron audio, cuántos fueron malos
--   pct_con_problema   minutos con cualquiera de: mala conexión, congelado o audio malo
create or replace function public.llamadas_calidad_por_dia(_dias integer default 14)
returns table (
  dia date,
  minutos integer,
  personas integer,
  pct_mala_conexion numeric,
  cortes integer,
  horas_llamada numeric,
  cortes_por_100h numeric,
  pct_congelado numeric,
  pct_cam_limitada numeric,
  rtt_mediana_ms integer,
  minutos_con_audio integer,
  pct_audio_malo numeric,
  pct_con_problema numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_n int := least(greatest(coalesce(_dias, 14), 1), 31);
  v_desde timestamptz;
begin
  if not coalesce(public.ve_tablero_llamadas(), false) then
    raise exception 'llamadas_calidad_por_dia: solo el dueño ve el tablero de llamadas' using errcode = '42501';
  end if;
  v_desde := ((v_hoy - (v_n - 1))::timestamp) at time zone 'America/Bogota';

  return query
  with s as (
    select (x.creado at time zone 'America/Bogota')::date as d, x.user_id as uid, x.datos as m
      from public.llamada_salud x
     where x.creado >= v_desde
  ),
  agg as (
    select s.d,
           count(*) as n,
           count(distinct s.uid) as p,
           count(*) filter (where s.m ->> 'calidad' in ('poor', 'lost')) as mala,
           count(*) filter (where s.m ->> 'vis' = 'visible') as vis,
           count(*) filter (where s.m ->> 'vis' = 'visible' and coalesce(public.llamada_num(s.m, 'lag_ms'), 0) > 200) as cong,
           count(*) filter (where (s.m -> 'cam') = 'true'::jsonb) as cam,
           count(*) filter (where (s.m -> 'cam') = 'true'::jsonb and s.m ->> 'limite_cam' = 'bandwidth') as camlim,
           percentile_cont(0.5) within group (order by nullif(public.llamada_num(s.m, 'rtt_ms'), 0)) as rtt,
           count(*) filter (where public.llamada_audio_malo(s.m) is not null) as aud,
           count(*) filter (where public.llamada_audio_malo(s.m)) as audmal,
           count(*) filter (where s.m ->> 'calidad' in ('poor', 'lost')
                               or (s.m ->> 'vis' = 'visible' and coalesce(public.llamada_num(s.m, 'lag_ms'), 0) > 200)
                               or coalesce(public.llamada_audio_malo(s.m), false)) as prob
      from s
     group by s.d
  ),
  c as (
    select (lc.creado at time zone 'America/Bogota')::date as d, count(*) as n
      from public.llamada_cortes lc
     where lc.creado >= v_desde
       and lc.fase in ('parpadeo_ok', 'caida', 'reentrada_agotada', 'recarga')
     group by 1
  ),
  dias as (
    select (v_hoy - g)::date as d from generate_series(0, v_n - 1) as g
  )
  select dias.d,
         coalesce(agg.n, 0)::int,
         coalesce(agg.p, 0)::int,
         round(100.0 * agg.mala / nullif(agg.n, 0), 1),
         coalesce(c.n, 0)::int,
         round(coalesce(agg.n, 0) / 60.0, 1),
         round(100.0 * coalesce(c.n, 0) / nullif(agg.n / 60.0, 0), 1),
         round(100.0 * agg.cong / nullif(agg.vis, 0), 1),
         round(100.0 * agg.camlim / nullif(agg.cam, 0), 1),
         round(agg.rtt)::int,
         coalesce(agg.aud, 0)::int,
         round(100.0 * agg.audmal / nullif(agg.aud, 0), 1),
         round(100.0 * agg.prob / nullif(agg.n, 0), 1)
    from dias
    left join agg on agg.d = dias.d
    left join c on c.d = dias.d
   order by dias.d;
end;
$$;
revoke all on function public.llamadas_calidad_por_dia(integer) from public, anon;
grant execute on function public.llamadas_calidad_por_dia(integer) to authenticated;

-- ── 3) Persona por persona ───────────────────────────────────────────────────
-- _dias = 1 es hoy (desde la medianoche de Bogotá); 7 es la última semana.
-- Las mismas métricas, más la causa de audio que más se repite. Peor primero:
-- más % de minutos con problema, después más cortes por 100 h.
create or replace function public.llamadas_calidad_por_persona(_dias integer default 1)
returns table (
  user_id uuid,
  nombre text,
  equipo text,
  minutos integer,
  pct_mala_conexion numeric,
  cortes integer,
  cortes_por_100h numeric,
  pct_congelado numeric,
  pct_cam_limitada numeric,
  rtt_mediana_ms integer,
  minutos_con_audio integer,
  pct_audio_malo numeric,
  causa_audio text,
  pct_con_problema numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_n int := least(greatest(coalesce(_dias, 1), 1), 31);
  v_desde timestamptz;
begin
  if not coalesce(public.ve_tablero_llamadas(), false) then
    raise exception 'llamadas_calidad_por_persona: solo el dueño ve el tablero de llamadas' using errcode = '42501';
  end if;
  v_desde := ((v_hoy - (v_n - 1))::timestamp) at time zone 'America/Bogota';

  return query
  with s as (
    select x.user_id as uid, x.datos as m
      from public.llamada_salud x
     where x.creado >= v_desde
  ),
  agg as (
    select s.uid,
           count(*) as n,
           count(*) filter (where s.m ->> 'calidad' in ('poor', 'lost')) as mala,
           count(*) filter (where s.m ->> 'vis' = 'visible') as vis,
           count(*) filter (where s.m ->> 'vis' = 'visible' and coalesce(public.llamada_num(s.m, 'lag_ms'), 0) > 200) as cong,
           count(*) filter (where (s.m -> 'cam') = 'true'::jsonb) as cam,
           count(*) filter (where (s.m -> 'cam') = 'true'::jsonb and s.m ->> 'limite_cam' = 'bandwidth') as camlim,
           percentile_cont(0.5) within group (order by nullif(public.llamada_num(s.m, 'rtt_ms'), 0)) as rtt,
           count(*) filter (where public.llamada_audio_malo(s.m) is not null) as aud,
           count(*) filter (where public.llamada_audio_malo(s.m)) as audmal,
           mode() within group (order by public.llamada_audio_causa(s.m)) as causa,
           count(*) filter (where s.m ->> 'calidad' in ('poor', 'lost')
                               or (s.m ->> 'vis' = 'visible' and coalesce(public.llamada_num(s.m, 'lag_ms'), 0) > 200)
                               or coalesce(public.llamada_audio_malo(s.m), false)) as prob
      from s
     group by s.uid
  ),
  c as (
    select lc.user_id as uid, count(*) as n
      from public.llamada_cortes lc
     where lc.creado >= v_desde
       and lc.fase in ('parpadeo_ok', 'caida', 'reentrada_agotada', 'recarga')
     group by lc.user_id
  ),
  filas as (
    select agg.uid, pr.full_name as nombre_p, public.equipo_de(agg.uid) as equipo_p,
           agg.n::int as n,
           round(100.0 * agg.mala / nullif(agg.n, 0), 1) as p_mala,
           coalesce(c.n, 0)::int as n_cortes,
           round(100.0 * coalesce(c.n, 0) / nullif(agg.n / 60.0, 0), 1) as c100,
           round(100.0 * agg.cong / nullif(agg.vis, 0), 1) as p_cong,
           round(100.0 * agg.camlim / nullif(agg.cam, 0), 1) as p_cam,
           round(agg.rtt)::int as rtt_p,
           agg.aud::int as aud,
           round(100.0 * agg.audmal / nullif(agg.aud, 0), 1) as p_aud,
           case when agg.audmal > 0 then agg.causa end as causa_p,
           round(100.0 * agg.prob / nullif(agg.n, 0), 1) as p_prob
      from agg
      join public.profiles pr on pr.id = agg.uid and pr.deleted_at is null
      left join c on c.uid = agg.uid
  )
  select f.uid, f.nombre_p, f.equipo_p, f.n, f.p_mala, f.n_cortes, f.c100, f.p_cong, f.p_cam,
         f.rtt_p, f.aud, f.p_aud, f.causa_p, f.p_prob
    from filas f
   order by f.p_prob desc nulls last, f.c100 desc nulls last, f.n desc;
end;
$$;
revoke all on function public.llamadas_calidad_por_persona(integer) from public, anon;
grant execute on function public.llamadas_calidad_por_persona(integer) to authenticated;

-- ── 4) El vigía del audio ────────────────────────────────────────────────────
create table if not exists public.llamada_avisos_audio (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  creado timestamptz not null default now(),
  causa text not null,
  minutos_malos integer not null,
  minutos integer not null,
  detalle jsonb
);
-- Solo el servidor lo lee y lo escribe (sin políticas: nadie desde el navegador).
alter table public.llamada_avisos_audio enable row level security;
create index if not exists llamada_avisos_audio_user_creado_idx on public.llamada_avisos_audio (user_id, creado desc);

create or replace function public.vigilar_audio_de_llamada()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_ahora timestamptz := now();
  v_avisos int := 0;
  v_nombre text;
  v_titulo_tu text;
  v_msg_tu text;
  v_titulo text;
  v_msg text;
begin
  for r in
    select s.user_id, p.full_name,
           count(*)::int as minutos,
           (count(*) filter (where public.llamada_audio_malo(s.datos)))::int as malos,
           mode() within group (order by public.llamada_audio_causa(s.datos)) as causa,
           round(avg(public.llamada_num(s.datos -> 'audio', 'perdida_pct')), 1) as perdida,
           round(avg(public.llamada_num(s.datos -> 'audio', 'oculto_pct')), 1) as oculto
      from public.llamada_salud s
      join public.profiles p on p.id = s.user_id and p.deleted_at is null
     where s.creado >= v_ahora - interval '10 minutes'
       and jsonb_typeof(s.datos -> 'audio') = 'object'
     group by s.user_id, p.full_name
    having count(*) filter (where public.llamada_audio_malo(s.datos)) >= 5
  loop
    continue when public.es_admin_o_dueno(r.user_id);
    continue when exists (select 1 from public.llamada_avisos_audio a
                           where a.user_id = r.user_id and a.creado >= v_ahora - interval '2 hours');
    continue when r.causa is null;

    insert into public.llamada_avisos_audio (user_id, causa, minutos_malos, minutos, detalle)
    values (r.user_id, r.causa, r.malos, r.minutos,
            jsonb_build_object('perdida_pct', r.perdida, 'oculto_pct', r.oculto));

    v_nombre := coalesce(nullif(trim(r.full_name), ''), 'un empleado');
    case r.causa
      when 'mic_mudo' then
        v_titulo_tu := 'Tu micrófono no está mandando sonido';
        v_msg_tu := format('En %s de los últimos 10 minutos tu micrófono estuvo prendido pero no captó nada: no te escuchan. Revisa en la llamada qué micrófono está elegido, desconéctalo y vuelve a conectarlo, o sal y vuelve a entrar.', r.malos);
        v_titulo := format('A %s no se le escucha en la llamada', v_nombre);
        v_msg := format('Lleva %s de los últimos 10 minutos con el micrófono prendido sin sonido. Causa probable: su micrófono no capta (otro programa lo tomó o está desconectado).', r.malos);
      when 'voz_se_pierde' then
        v_titulo_tu := 'Tu voz les llega cortada a los demás';
        v_msg_tu := format('En %s de los últimos 10 minutos se perdió parte de tu voz en el camino%s. Acércate al router o conéctate por cable, y cierra lo que esté usando internet.',
                           r.malos, case when r.perdida is not null then format(' (pérdida de %s %%)', r.perdida) else '' end);
        v_titulo := format('A %s se le corta la voz en la llamada', v_nombre);
        v_msg := format('Lleva %s de los últimos 10 minutos así. Causa probable: su internet pierde paquetes al subir%s.',
                        r.malos, case when r.perdida is not null then format(' (%s %%)', r.perdida) else '' end);
      else
        v_titulo_tu := 'Escuchas cortados a los demás';
        v_msg_tu := format('En %s de los últimos 10 minutos te llegó el audio entrecortado. Tu internet de bajada está inestable: acércate al router, conéctate por cable o reinicia el módem.', r.malos);
        v_titulo := format('A %s le llega cortado el audio de la llamada', v_nombre);
        v_msg := format('Lleva %s de los últimos 10 minutos así. Causa probable: su internet de bajada está inestable.', r.malos);
    end case;

    -- A la persona: qué pasa y qué puede hacer.
    insert into public.notifications
      (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    values (r.user_id, 'llamada_audio_tu', v_titulo_tu, v_msg_tu, 'cowork', 'Cowork', 'medium', 'new', 'personal', '/cowork');

    -- A su supervisor y a quienes reciben los avisos de su equipo (la misma
    -- regla que los cortes de llamada).
    insert into public.notifications
      (user_id, type, title, message, reference_id, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    select d.user_id, 'llamada_audio', v_titulo, v_msg, r.user_id, 'profile', 'Cowork', 'medium', 'new', 'personal', '/dashboard'
      from public.destinatarios_de_aviso(r.user_id) d;

    v_avisos := v_avisos + 1;
  end loop;
  return v_avisos;
end;
$$;
revoke all on function public.vigilar_audio_de_llamada() from public, anon, authenticated;

-- Cada 5 minutos. Protegido: pg_cron solo existe en la base real.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  perform cron.unschedule(j.jobname) from cron.job j where j.jobname = 'vigia-audio-de-llamada';
  perform cron.schedule('vigia-audio-de-llamada', '*/5 * * * *', $cron$ select public.vigilar_audio_de_llamada(); $cron$);
end
$$;

comment on function public.llamadas_calidad_por_dia(integer) is
  'Tablero del dueño: calidad de las llamadas día por día (mala conexión, cortes por 100 h, congelado, cámara limitada, ping, audio). Solo lee.';
comment on function public.llamadas_calidad_por_persona(integer) is
  'Tablero del dueño: calidad de las llamadas por persona, hoy o 7 días, peor primero. Solo lee.';
