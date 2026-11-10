-- PÁGINA COMPLETA DEL ESPACIO DEL NAS (Alvaro, 10/11/2026): además del bloque
-- del Centro de operaciones, una página con el detalle para decidir. Cuatro
-- lecturas, todas solo para dueño/admin y de solo lectura (no borran nada):
--
--   · nas_historia()      cómo se fue llenando: TB acumulados por mes según la
--                         fecha del archivo (lo importado conserva su fecha
--                         original) + las muestras reales del disco.
--   · nas_entro_semana()  qué entró en los últimos 7 días y quién lo subió.
--   · nas_por_modelo()    qué ocupa cada modelo: las carpetas que llevan el
--                         usuario de una modelo (grupo de chatters, Blu,
--                         Instagram o nombre artístico), con todo lo de adentro.
--   · nas_que_liberar()   posibles copias repetidas (mismo nombre y mismo peso
--                         exacto: la huella sha256 solo la tienen ~6 mil
--                         archivos, lo importado no) y la papelera.

-- La misma llave con la que una carpeta casa con una modelo
-- («MEEL_SILVERA» ↔ «Meelsilvera»). Igual que llaveDeModelo() en las edges.
create or replace function public.llave_de_modelo(_s text)
returns text language sql immutable set search_path = public as $$
  select upper(regexp_replace(coalesce(_s, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

create or replace function public.nas_historia()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  meses jsonb;
  muestras jsonb;
begin
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'Solo admin o dueño' using errcode = '42501';
  end if;

  with por_mes as (
    select date_trunc('month', i.created_at at time zone 'America/Bogota')::date as mes, sum(i.size)::bigint as bytes
      from public.drive_items i
     where i.tipo = 'archivo' and i.trashed_at is null and i.size > 0
     group by 1
  ), acumulado as (
    select mes, bytes, sum(bytes) over (order by mes)::bigint as total from por_mes
  )
  select coalesce(jsonb_agg(jsonb_build_object('mes', to_char(mes, 'YYYY-MM'), 'bytes', bytes, 'total', total) order by mes), '[]'::jsonb)
    into meses
    from acumulado
   where mes >= (date_trunc('month', now() at time zone 'America/Bogota') - interval '23 months')::date;

  select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'usado', usado, 'total', total) order by dia), '[]'::jsonb)
    into muestras
    from (
      select (medido_at at time zone 'America/Bogota')::date as dia,
             max(total_bytes - libre_bytes) as usado, max(total_bytes) as total
        from public.nas_espacio
       where medido_at > now() - interval '120 days'
       group by 1
    ) d;

  return jsonb_build_object('meses', meses, 'muestras', muestras);
end;
$$;

create or replace function public.nas_entro_semana()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  desde timestamptz := now() - interval '7 days';
  total jsonb;
  por_dia jsonb;
  por_persona jsonb;
  por_modelo jsonb;
begin
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'Solo admin o dueño' using errcode = '42501';
  end if;

  select jsonb_build_object('bytes', coalesce(sum(i.size), 0), 'archivos', count(*))
    into total
    from public.drive_items i
   where i.tipo = 'archivo' and i.trashed_at is null and i.created_at > desde;

  select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia, 'bytes', d.bytes, 'archivos', d.archivos) order by d.dia), '[]'::jsonb)
    into por_dia
    from (
      select (i.created_at at time zone 'America/Bogota')::date as dia, sum(i.size)::bigint as bytes, count(*) as archivos
        from public.drive_items i
       where i.tipo = 'archivo' and i.trashed_at is null and i.created_at > desde
       group by 1
    ) d;

  -- Quién lo subió al Drive. Lo que llega por el link de una modelo queda a nombre
  -- de quien creó el link; por eso va aparte, por modelo, abajo.
  select coalesce(jsonb_agg(jsonb_build_object('nombre', x.nombre, 'bytes', x.bytes, 'archivos', x.archivos) order by x.bytes desc), '[]'::jsonb)
    into por_persona
    from (
      select p.full_name as nombre, sum(i.size)::bigint as bytes, count(*) as archivos
        from public.drive_items i
        left join public.profiles p on p.id = i.owner_id
       where i.tipo = 'archivo' and i.trashed_at is null and i.created_at > desde
         and not exists (select 1 from public.drive_aportes a where a.drive_item_id = i.id)
       group by p.full_name
       order by sum(i.size) desc nulls last
       limit 10
    ) x;

  -- Lo que mandaron las modelos por su link (la carpeta del link lleva su usuario).
  select coalesce(jsonb_agg(jsonb_build_object('nombre', x.nombre, 'padre', x.padre, 'carpeta_id', x.carpeta_id, 'bytes', x.bytes, 'archivos', x.archivos, 'pidio', x.pidio) order by x.bytes desc), '[]'::jsonb)
    into por_modelo
    from (
      select d.id as carpeta_id, d.nombre, pd.nombre as padre, sum(a.size)::bigint as bytes, count(*) as archivos, max(p.full_name) as pidio
        from public.drive_aportes a
        join public.drive_upload_links l on l.token = a.token
        join public.drive_items d on d.id = l.item_id
        left join public.drive_items pd on pd.id = d.parent_id
        left join public.profiles p on p.id = l.created_by
       where a.created_at > desde
       group by d.id, d.nombre, pd.nombre
       order by sum(a.size) desc nulls last
       limit 10
    ) x;

  return jsonb_build_object('total', total, 'por_dia', por_dia, 'por_persona', por_persona, 'por_modelo', por_modelo);
end;
$$;

create or replace function public.nas_por_modelo()
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

  with recursive llaves as (
    select distinct public.llave_de_modelo(k) as k
      from (
        select creator_handle as k from public.chatter_group_creators
        union all select blu_name from public.blu_creator_map
        union all select instagram_handle from public.creators
        union all select artistic_name from public.creators
      ) x
     where length(public.llave_de_modelo(k)) >= 4
  ), raiz as (
    select d.id, l.k, d.nombre
      from public.drive_items d
      join llaves l on l.k = public.llave_de_modelo(d.nombre)
     where d.tipo = 'carpeta' and d.trashed_at is null
  ), arbol as (
    select id, k from raiz
    union
    select c.id, a.k from arbol a
      join public.drive_items c on c.parent_id = a.id and c.tipo = 'carpeta' and c.trashed_at is null
  ), suma as (
    select a.k, sum(f.size)::bigint as bytes, count(*) as archivos
      from (select distinct id, k from arbol) a
      join public.drive_items f on f.parent_id = a.id and f.tipo = 'archivo' and f.trashed_at is null
     group by a.k
  ), todo as (
    select s.k,
           (select mode() within group (order by r.nombre) from raiz r where r.k = s.k) as nombre,
           (select count(*) from raiz r where r.k = s.k) as carpetas,
           s.bytes, s.archivos
      from suma s
  )
  select jsonb_build_object(
    'modelos', (select coalesce(jsonb_agg(jsonb_build_object('nombre', m.nombre, 'carpetas', m.carpetas, 'bytes', m.bytes, 'archivos', m.archivos) order by m.bytes desc), '[]'::jsonb)
                  from (select * from todo order by bytes desc limit 25) m),
    'cuantas', (select count(*) from todo),
    'atribuido', (select coalesce(sum(bytes), 0) from todo),
    'usado', (select coalesce(sum(size), 0) from public.drive_items where tipo = 'archivo' and trashed_at is null)
  ) into resultado;

  return resultado;
end;
$$;

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
begin
  if not public.es_admin_o_dueno((select auth.uid())) then
    raise exception 'Solo admin o dueño' using errcode = '42501';
  end if;

  -- Posibles copias: mismo nombre y mismo peso exacto (solo > 1 MB, para no
  -- contar íconos y miniaturas). Se recupera todo menos una copia de cada grupo.
  with grupos as (
    select lower(i.nombre) as nombre, i.size, count(*) as copias,
           array_agg(distinct coalesce(u.nombre, '')) as unidades
      from public.drive_items i
      left join public.drive_items u on u.id = i.unidad_id
     where i.tipo = 'archivo' and i.trashed_at is null and i.size > 1000000
     group by lower(i.nombre), i.size
    having count(*) > 1
  )
  select jsonb_build_object('grupos', count(*), 'copias_de_mas', coalesce(sum(copias - 1), 0),
                            'bytes', coalesce(sum((copias - 1) * size), 0)),
         (select coalesce(jsonb_agg(jsonb_build_object('nombre', t.nombre, 'size', t.size, 'copias', t.copias,
                                                        'recupera', (t.copias - 1) * t.size, 'unidades', t.unidades)
                                    order by (t.copias - 1) * t.size desc), '[]'::jsonb)
            from (select * from grupos order by (copias - 1) * size desc limit 15) t)
    into resumen, top
    from grupos;

  select jsonb_build_object('bytes', coalesce(sum(size), 0), 'archivos', count(*))
    into papelera
    from public.drive_items where tipo = 'archivo' and trashed_at is not null;

  return jsonb_build_object('copias', resumen, 'top', top, 'papelera', papelera);
end;
$$;

revoke all on function public.nas_historia() from public, anon;
revoke all on function public.nas_entro_semana() from public, anon;
revoke all on function public.nas_por_modelo() from public, anon;
revoke all on function public.nas_que_liberar() from public, anon;
grant execute on function public.nas_historia() to authenticated;
grant execute on function public.nas_entro_semana() to authenticated;
grant execute on function public.nas_por_modelo() to authenticated;
grant execute on function public.nas_que_liberar() to authenticated;
