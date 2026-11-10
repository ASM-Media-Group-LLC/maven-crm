-- LA PAPELERA DE VERDAD (Alvaro, 10/11/2026). Al tirar una CARPETA el Drive
-- marca solo la carpeta (trashed_at); lo de adentro queda sin marcar. Por eso
-- «En la papelera» decía 12,2 GB (solo los archivos tirados uno por uno) cuando
-- en realidad hay ~4,5 TB bajo carpetas tiradas — p. ej. «Alicia Trece»
-- (1,55 TB), «LUSH 3.0» (1,43 TB) y «DRIVE CONTENT GENERAL» (1,25 TB), tiradas
-- el 05/10/2026. Siguen ocupando el disco hasta que se vacíe la papelera, y el
-- explorador no las muestra (están en la papelera).
--
-- nas_que_liberar() ahora cuenta como papelera: los archivos tirados + TODO lo
-- que está debajo de una carpeta tirada, una sola vez aunque haya carpetas
-- tiradas dentro de otras; y lista las carpetas tiradas más pesadas, con quién
-- y cuándo. No borra nada.

create or replace function public.nas_que_liberar()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  resumen jsonb;
  top jsonb;
  papelera jsonb;
  tiradas jsonb;
begin
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'Solo admin o dueño' using errcode = '42501';
  end if;

  -- Posibles copias: mismo nombre y mismo peso exacto (solo > 1 MB, para no
  -- contar íconos y miniaturas). Se recupera todo menos una copia de cada grupo.
  -- Las unidades se buscan SOLO para las 15 que se muestran (una pasada por
  -- tamaño): buscarlas para los ~530 mil archivos tardaba ~4 s.
  with grupos as (
    select lower(nombre) as nombre, size, count(*) as copias
      from public.drive_items
     where tipo = 'archivo' and trashed_at is null and size > 1000000
     group by lower(nombre), size
    having count(*) > 1
  ), quince as (
    select * from grupos order by (copias - 1) * size desc limit 15
  ), donde as (
    select q.nombre, q.size, array_agg(distinct coalesce(u.nombre, '')) as unidades
      from quince q
      join public.drive_items i on i.size = q.size and lower(i.nombre) = q.nombre and i.tipo = 'archivo' and i.trashed_at is null
      left join public.drive_items u on u.id = i.unidad_id
     group by q.nombre, q.size
  )
  select jsonb_build_object('grupos', (select count(*) from grupos),
                            'copias_de_mas', (select coalesce(sum(copias - 1), 0) from grupos),
                            'bytes', (select coalesce(sum((copias - 1) * size), 0) from grupos)),
         (select coalesce(jsonb_agg(jsonb_build_object('nombre', q.nombre, 'size', q.size, 'copias', q.copias,
                                                        'recupera', (q.copias - 1) * q.size, 'unidades', coalesce(d.unidades, array[]::text[]))
                                    order by (q.copias - 1) * q.size desc), '[]'::jsonb)
            from quince q left join donde d on d.nombre = q.nombre and d.size = q.size)
    into resumen, top;

  with recursive carpetas as materialized (
    select id, parent_id from public.drive_items where tipo = 'carpeta'
  ), tiradas_ids as (
    select id from public.drive_items where tipo = 'carpeta' and trashed_at is not null
  ), bajo as (
    select t.id as raiz, t.id from tiradas_ids t
    union all
    select b.raiz, c.id from bajo b join carpetas c on c.parent_id = b.id
  ), dentro as (
    select distinct id from bajo
  ), por_carpeta as (
    -- Una sola pasada por los archivos de las carpetas tiradas.
    select f.parent_id as carpeta, sum(f.size)::bigint as bytes, count(*) as archivos
      from public.drive_items f
     where f.tipo = 'archivo' and f.parent_id in (select id from dentro)
     group by f.parent_id
  ), sueltos_tirados as (
    -- Archivos tirados uno por uno, fuera de una carpeta tirada (sin contarlos dos veces).
    select coalesce(sum(f.size), 0)::bigint as bytes, count(*) as archivos
      from public.drive_items f
     where f.tipo = 'archivo' and f.trashed_at is not null
       and not exists (select 1 from dentro d where d.id = f.parent_id)
  ), total as (
    select (select coalesce(sum(bytes), 0) from por_carpeta) + s.bytes as bytes,
           (select coalesce(sum(archivos), 0) from por_carpeta) + s.archivos as archivos
      from sueltos_tirados s
  ), lista as (
    select b.raiz, coalesce(sum(pc.bytes), 0)::bigint as bytes, coalesce(sum(pc.archivos), 0)::bigint as archivos
      from bajo b left join por_carpeta pc on pc.carpeta = b.id
     group by b.raiz
  )
  select (select jsonb_build_object('bytes', bytes, 'archivos', archivos) from total),
         (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', d.id, 'nombre', d.nombre, 'padre', pd.nombre, 'tirada', d.trashed_at, 'por', p.full_name,
                   'bytes', l.bytes, 'archivos', l.archivos) order by l.bytes desc), '[]'::jsonb)
            from (select * from lista order by bytes desc limit 10) l
            join public.drive_items d on d.id = l.raiz
            left join public.drive_items pd on pd.id = d.parent_id
            left join public.profiles p on p.id = d.trashed_by
           where l.bytes > 0)
    into papelera, tiradas;

  return jsonb_build_object('copias', resumen, 'top', top, 'papelera', papelera, 'carpetas_tiradas', tiradas);
end;
$$;
