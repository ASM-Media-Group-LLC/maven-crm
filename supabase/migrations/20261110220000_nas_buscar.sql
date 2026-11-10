-- ÁREA DEL NAS, SEGUNDA PASADA (Alvaro, 10/11/2026):
--   · nas_buscar(texto)  "un buscador por letras, como alemia, y que me salga lo
--                        que tengo": carpetas cuyo nombre lo contiene (con el
--                        peso de todo lo de adentro) y archivos (los más pesados).
--   · nas_mas_pesados()  marca los que están dentro de una carpeta tirada a la
--                        papelera (siguen ocupando disco, pero no se ven).
--   · nas_ficha()        suma los aportes de modelos esperando pasar al NAS,
--                        para el «todo está corriendo bien» del Resumen.
-- Solo dueño/admin, solo lectura.

create or replace function public.nas_buscar(_texto text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  patron text;
  resultado jsonb;
begin
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'Solo admin o dueño' using errcode = '42501';
  end if;
  if length(btrim(coalesce(_texto, ''))) < 2 then
    return jsonb_build_object('carpetas', '[]'::jsonb, 'archivos', '[]'::jsonb);
  end if;
  -- Mismo índice que el buscador del Drive (drive_items_nombre_trgm_idx sobre
  -- drive_nombre_buscable): ~16 ms en vez de ~0,8 s recorriendo los nombres.
  -- % y _ del texto se buscan literales, no como comodines.
  patron := '%' || replace(replace(replace(public.drive_nombre_buscable(btrim(_texto)), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with recursive encontradas as (
    select id, parent_id, nombre from public.drive_items
     where trashed_at is null and tipo = 'carpeta' and public.drive_nombre_buscable(nombre) like patron
     order by length(nombre), nombre limit 40
  ), baja as (
    select id as raiz, id from encontradas
    union all
    select b.raiz, c.id from baja b join public.drive_items c on c.parent_id = b.id and c.tipo = 'carpeta' and c.trashed_at is null
  ), peso as (
    -- Por el índice de parent_id: solo los archivos de las carpetas encontradas.
    select b.raiz, coalesce(sum(f.size), 0)::bigint as bytes, count(f.id) as archivos
      from baja b left join public.drive_items f on f.parent_id = b.id and f.tipo = 'archivo' and f.trashed_at is null
     group by b.raiz
  ), archivos as (
    select id, nombre, size, parent_id from public.drive_items
     where trashed_at is null and tipo = 'archivo' and public.drive_nombre_buscable(nombre) like patron
     order by size desc nulls last limit 40
  )
  select jsonb_build_object(
    'carpetas', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre, 'padre', pc.nombre,
                                                               'bytes', p.bytes, 'archivos', p.archivos) order by p.bytes desc, e.nombre), '[]'::jsonb)
                   from encontradas e join peso p on p.raiz = e.id left join public.drive_items pc on pc.id = e.parent_id),
    'archivos', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.nombre, 'size', a.size,
                                                               'carpeta_id', a.parent_id, 'carpeta', pc.nombre) order by a.size desc nulls last), '[]'::jsonb)
                   from archivos a left join public.drive_items pc on pc.id = a.parent_id)
  ) into resultado;

  return resultado;
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

  with recursive carpetas as materialized (
    select id, parent_id from public.drive_items where tipo = 'carpeta'
  ), en_papelera as (
    select id from public.drive_items where tipo = 'carpeta' and trashed_at is not null
    union
    select c.id from en_papelera p join carpetas c on c.parent_id = p.id
  ), x as (
    select id, nombre, size, parent_id, unidad_id, owner_id, created_at, mime
      from public.drive_items
     where tipo = 'archivo' and trashed_at is null and size is not null
     order by size desc limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'nombre', x.nombre, 'size', x.size, 'carpeta_id', x.parent_id, 'carpeta', pc.nombre,
           'unidad', u.nombre, 'dueno', p.full_name, 'creado', x.created_at, 'tipo', public.nas_tipo_de_archivo(x.mime, x.nombre),
           'en_papelera', exists (select 1 from en_papelera e where e.id = x.parent_id))
         order by x.size desc), '[]'::jsonb)
    into r
    from x
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
    'aportes_esperando', (select count(*) from public.drive_aportes where not en_nas),
    'nas', (select jsonb_build_object('caido', caido, 'desde', desde, 'actualizado', actualizado) from public.drive_nas_salud where id = 1)
  ) into r;

  return r;
end;
$$;

revoke all on function public.nas_buscar(text) from public, anon;
grant execute on function public.nas_buscar(text) to authenticated;
