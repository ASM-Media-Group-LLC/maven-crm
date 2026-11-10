-- ÁREA DEL NAS (Alvaro, 10/11/2026): "ver todo lo que hay en el NAS". Cuatro
-- lecturas más para /oficina/espacio-nas, solo dueño/admin y de solo lectura:
--
--   · nas_explorar(carpeta)  el explorador: las carpetas de un nivel con el peso
--                            de TODO lo que tienen adentro (ordenadas de la más
--                            pesada), los archivos sueltos de ese nivel y la ruta.
--                            Sin carpeta = la raíz del Drive.
--   · nas_por_tipo()         cuánto es video, foto, audio, documento, comprimido
--                            u otro (por tipo MIME y, si no alcanza, extensión).
--   · nas_mas_pesados()      los 50 archivos más grandes, con dónde están y quién.
--   · nas_ficha()            los números de la ficha: archivos, carpetas,
--                            unidades, personas, desde cuándo, estado del NAS.
--
-- El peso de las carpetas se calcula al momento: las ~42 mil carpetas se cargan
-- una vez (materialized) y se recorren en memoria — la raíz entera tarda ~1 s.
-- Recorrer drive_items directo en cada vuelta tardaba 9–12 s.

create or replace function public.nas_explorar(_carpeta uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resultado jsonb;
begin
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'Solo admin o dueño' using errcode = '42501';
  end if;

  with recursive carpetas as materialized (
    select id, parent_id, nombre from public.drive_items
     where tipo = 'carpeta' and trashed_at is null
  ), hijos as (
    select id, nombre from carpetas where parent_id is not distinct from _carpeta
  ), baja as (
    select id as raiz, id from hijos
    union all
    select b.raiz, c.id from baja b join carpetas c on c.parent_id = b.id
  ), directo as (
    select f.parent_id as carpeta, sum(f.size)::bigint as bytes, count(*) as archivos, max(f.created_at) as ultimo
      from public.drive_items f
     where f.tipo = 'archivo' and f.trashed_at is null
       and f.parent_id in (select id from baja)
     group by f.parent_id
  ), peso as (
    select b.raiz, coalesce(sum(d.bytes), 0)::bigint as bytes, coalesce(sum(d.archivos), 0)::bigint as archivos,
           count(*) - 1 as carpetas, max(d.ultimo) as ultimo
      from baja b left join directo d on d.carpeta = b.id
     group by b.raiz
  ), sueltos as (
    select f.id, f.nombre, f.size, f.mime, f.created_at
      from public.drive_items f
     where f.tipo = 'archivo' and f.trashed_at is null and f.parent_id is not distinct from _carpeta
  ), ruta as (
    select id, parent_id, nombre, 0 as nivel from carpetas where id = _carpeta
    union all
    select c.id, c.parent_id, c.nombre, r.nivel + 1 from ruta r join carpetas c on c.id = r.parent_id
  )
  select jsonb_build_object(
    'carpeta', (select jsonb_build_object('id', id, 'nombre', nombre) from carpetas where id = _carpeta),
    'ruta', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre) order by nivel desc), '[]'::jsonb) from ruta),
    'hijos', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'nombre', h.nombre, 'bytes', p.bytes, 'archivos', p.archivos,
                                                            'carpetas', p.carpetas, 'ultimo', p.ultimo) order by p.bytes desc, h.nombre), '[]'::jsonb)
                from hijos h join peso p on p.raiz = h.id),
    'sueltos', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre, 'size', s.size, 'mime', s.mime,
                                                              'creado', s.created_at) order by s.size desc nulls last), '[]'::jsonb)
                  from (select * from sueltos order by size desc nulls last limit 100) s),
    'sueltos_total', (select jsonb_build_object('bytes', coalesce(sum(size), 0), 'archivos', count(*)) from sueltos),
    'total', jsonb_build_object(
      'bytes', (select coalesce(sum(bytes), 0) from peso) + (select coalesce(sum(size), 0) from sueltos),
      'archivos', (select coalesce(sum(archivos), 0) from peso) + (select count(*) from sueltos))
  ) into resultado;

  return resultado;
end;
$$;

-- Clasificación de un archivo para «por tipo»: por su tipo MIME y, si no
-- alcanza, por la extensión. Se clasifica por (mime, extensión) y no archivo por
-- archivo: agrupado quedan ~400 combinaciones; con expresiones regulares sobre
-- los ~940 mil nombres tardaba 19 s, así tarda ~1,5 s.
create or replace function public.nas_extension(_nombre text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(case when position('.' in coalesce(_nombre, '')) > 0 then reverse(split_part(reverse(_nombre), '.', 1)) end)
$$;

create or replace function public.nas_tipo_por_ext(_mime text, _ext text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when _mime like 'video/%' or _ext in ('mp4','mov','m4v','mkv','avi','webm','mts','m2ts','braw','r3d','wmv','flv','3gp') then 'video'
    when _mime like 'image/%' or _ext in ('jpg','jpeg','png','heic','heif','webp','gif','tif','tiff','bmp','cr2','cr3','nef','arw','dng','raf','orf','raw','psd','svg') then 'foto'
    when _mime like 'audio/%' or _ext in ('mp3','wav','m4a','aac','flac','ogg','aif','aiff') then 'audio'
    when _ext in ('zip','rar','7z','tar','gz','tgz','dmg','iso') then 'comprimido'
    when _mime in ('application/pdf', 'text/plain', 'text/csv')
      or _mime like 'application/vnd.openxmlformats%' or _mime like 'application/vnd.ms-%' or _mime like 'application/msword%'
      or _ext in ('pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','pages','numbers','key','rtf','odt','ods') then 'documento'
    else 'otro'
  end
$$;

create or replace function public.nas_tipo_de_archivo(_mime text, _nombre text)
returns text
language sql
immutable
set search_path = public
as $$
  select public.nas_tipo_por_ext(_mime, public.nas_extension(_nombre))
$$;

create or replace function public.nas_por_tipo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tipos jsonb;
begin
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'Solo admin o dueño' using errcode = '42501';
  end if;

  with g as (
    -- La extensión va escrita acá y no con nas_extension(): una función con
    -- search_path fijo no se incrusta y se llamaba ~940 mil veces (7 s).
    -- Extensión = lo que va después del último punto, solo si es corto y sin
    -- espacios («video.mp4 arias crazy2» no tiene extensión «mp4 arias crazy2»).
    select mime, case when length(e) between 1 and 8 and position(' ' in e) = 0 then e end as ext,
           sum(size)::bigint as bytes, count(*) as archivos
      from (select mime, size, lower(case when position('.' in nombre) > 0 then reverse(split_part(reverse(nombre), '.', 1)) end) as e
              from public.drive_items
             where tipo = 'archivo' and trashed_at is null) x
     group by 1, 2
  ), t as (
    select public.nas_tipo_por_ext(mime, ext) as tipo, coalesce(ext, '—') as ext, bytes, archivos from g
  ), por_tipo as (
    select tipo, sum(bytes)::bigint as bytes, sum(archivos)::bigint as archivos from t group by tipo
  ), por_ext as (
    select tipo, ext, sum(bytes)::bigint as bytes, sum(archivos)::bigint as archivos,
           row_number() over (partition by tipo order by sum(bytes) desc nulls last) as n
      from t group by tipo, ext
  )
  select coalesce(jsonb_agg(jsonb_build_object('tipo', p.tipo, 'bytes', p.bytes, 'archivos', p.archivos,
           'extensiones', (select coalesce(jsonb_agg(jsonb_build_object('ext', e.ext, 'bytes', e.bytes, 'archivos', e.archivos) order by e.bytes desc nulls last), '[]'::jsonb)
                             from por_ext e where e.tipo = p.tipo and e.n <= 5)) order by p.bytes desc nulls last), '[]'::jsonb)
    into tipos
    from por_tipo p;

  return jsonb_build_object('tipos', tipos);
end;
$$;

create or replace function public.nas_mas_pesados()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'Solo admin o dueño' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'nombre', x.nombre, 'size', x.size, 'carpeta_id', x.parent_id, 'carpeta', pc.nombre,
           'unidad', u.nombre, 'dueno', p.full_name, 'creado', x.created_at, 'tipo', public.nas_tipo_de_archivo(x.mime, x.nombre))
         order by x.size desc), '[]'::jsonb)
    into r
    from (select id, nombre, size, parent_id, unidad_id, owner_id, created_at, mime
            from public.drive_items
           where tipo = 'archivo' and trashed_at is null and size is not null
           order by size desc limit 50) x
    left join public.drive_items pc on pc.id = x.parent_id
    left join public.drive_items u on u.id = x.unidad_id
    left join public.profiles p on p.id = x.owner_id;

  return jsonb_build_object('archivos', r);
end;
$$;

create or replace function public.nas_ficha()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'Solo admin o dueño' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'archivos', (select count(*) from public.drive_items where tipo = 'archivo' and trashed_at is null),
    'carpetas', (select count(*) from public.drive_items where tipo = 'carpeta' and trashed_at is null),
    'unidades', (select count(distinct unidad_id) from public.drive_items where unidad_id is not null and trashed_at is null),
    'personas', (select count(distinct owner_id) from public.drive_items where tipo = 'archivo' and trashed_at is null and owner_id is not null),
    'desde', (select min(created_at) from public.drive_items where tipo = 'archivo' and trashed_at is null and created_at > '2010-01-01'),
    'links_modelos', (select count(*) from public.drive_upload_links where activo),
    'nas', (select jsonb_build_object('caido', caido, 'desde', desde, 'actualizado', actualizado) from public.drive_nas_salud where id = 1)
  ) into r;

  return r;
end;
$$;

revoke all on function public.nas_explorar(uuid) from public, anon;
revoke all on function public.nas_por_tipo() from public, anon;
revoke all on function public.nas_mas_pesados() from public, anon;
revoke all on function public.nas_ficha() from public, anon;
grant execute on function public.nas_explorar(uuid) to authenticated;
grant execute on function public.nas_por_tipo() to authenticated;
grant execute on function public.nas_mas_pesados() to authenticated;
grant execute on function public.nas_ficha() to authenticated;

