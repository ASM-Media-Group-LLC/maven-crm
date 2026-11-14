-- COSTOS POR PARTE DE MAVEN, CON LA CUENTA (Alvaro, 13/11/2026).
--
-- «Cuánto cuesta cada parte de Maven, pieza por pieza, con el uso real de cada
-- día.» Decidió:
--   · Los costos se ordenan por PARTE de Maven: Argos · Base de Maven · Cowork y
--     llamadas · Correo · Messenger y Drive · Herramientas, y aparte «Otras / no
--     es Maven». La vista por proveedor queda en su propia pestaña.
--   · Cada pieza con su cuenta (uso × precio): hoy, en el mes y al cierre.
--   · Lo compartido (servidor de Supabase de Maven, servidor principal y
--     dominio) va junto como «Base de Maven», sin repartir.
--   · Los números salen del USO REAL de cada día; el mes se cuadra con las
--     facturas (costos_cobros) y se marca «revisado».
--
-- Esta migración:
--   1. costos_servicios.parte: a qué parte de Maven pertenece cada servicio.
--      precio_unitario_usd + unidad: el precio por unidad cuando el costo sale
--      del uso (la IA de Google: USD 0,0026 por foto juzgada, sacado el 13/11 de
--      AI Studio: USD 5,61 por 2.157 fotos juzgadas).
--   2. costos_uso_del_mes(): el uso de cada día del mes en curso (hora de
--      Bogotá) para que la página haga la cuenta. Solo el dueño, como
--      conexiones_estado(). Devuelve:
--        dias[]: dia, pantalla, camara (fotos guardadas), juzgadas (fotos con
--                veredicto de la IA), al_nas (fotos ya pasadas al NAS), videos y
--                video_seg (videos al distraerse, argos_clips).
--        almacenamiento[]: GB y archivos por bucket de Storage (monitor-capturas,
--                argos-clips, chat-files…), en GB de 1024³ como los muestra Supabase.
--        desde, hoy, dias_del_mes, calculado_at.
--      La página saca hoy, el mes y la proyección (lo del mes ÷ días que van ×
--      días del mes). Si la consulta falla, la página lo dice: nunca pone ceros.

alter table public.costos_servicios add column if not exists parte text;
alter table public.costos_servicios add column if not exists precio_unitario_usd numeric(12, 6);
alter table public.costos_servicios add column if not exists unidad text;
alter table public.costos_servicios drop constraint if exists costos_servicios_parte_check;
alter table public.costos_servicios add constraint costos_servicios_parte_check
  check (parte is null or parte in ('argos', 'base', 'cowork', 'correo', 'messenger_drive', 'herramientas', 'otras'));
alter table public.costos_servicios drop constraint if exists costos_servicios_unidad_check;
alter table public.costos_servicios add constraint costos_servicios_unidad_check
  check (unidad is null or unidad in ('foto_juzgada'));

-- Cada servicio en su parte (leído el 13/11 de los renglones que hay hoy).
update public.costos_servicios set parte = case id
    when 'google_ia' then 'argos'
    when 'elevenlabs' then 'argos'
    when 'supabase_maven' then 'base'
    when 'contabo_principal' then 'base'
    when 'godaddy_maven' then 'base'
    when 'contabo_llamadas' then 'cowork'
    when 'resend' then 'correo'
    when 'zoho' then 'correo'
    when 'github' then 'herramientas'
    when 'claude' then 'herramientas'
    when 'supabase_otros' then 'otras'
  end
  where parte is null
    and id in ('google_ia', 'elevenlabs', 'supabase_maven', 'contabo_principal', 'godaddy_maven', 'contabo_llamadas',
               'resend', 'zoho', 'github', 'claude', 'supabase_otros');

-- La IA de Google se cobra por foto juzgada.
update public.costos_servicios set
  precio_unitario_usd = 0.0026,
  unidad = 'foto_juzgada',
  como_se_calcula = 'Fotos juzgadas por Argos × USD 0,0026 (AI Studio, 13/11: USD 5,61 por 2.157 fotos juzgadas)'
  where id = 'google_ia';

-- El uso de cada día del mes en curso. Solo el dueño.
create or replace function public.costos_uso_del_mes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_desde date := date_trunc('month', (now() at time zone 'America/Bogota'))::date;
  v_ini timestamptz := (date_trunc('month', (now() at time zone 'America/Bogota')) at time zone 'America/Bogota');
  v jsonb;
begin
  if not public.es_dueno((select auth.uid())) then
    raise exception 'solo el dueño' using errcode = '42501';
  end if;

  with fotos as (
    select (c.created_at at time zone 'America/Bogota')::date as dia,
           count(*) filter (where c.tipo = 'pantalla') as pantalla,
           count(*) filter (where c.tipo = 'camara') as camara,
           count(*) filter (where c.veredicto is not null) as juzgadas,
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
