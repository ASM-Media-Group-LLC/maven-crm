-- FIN de los leads duplicados en el pipeline de Closers (caso "vencidas que ya
-- estaban Completadas/No interesadas", 2026-07-23).
--
-- Se encontraron 28 filas duplicadas del mismo handle (limpiadas por SQL en la
-- misma sesión): 22 filas 'Nuevo' stale del pool que quedaron vivas cuando el
-- assign creó una fila NUEVA en vez de promoverlas, 3 pares solo-Nuevo, la
-- triple 'Asignada' de nicole_sanmiguel (contaba 3 veces como vencida) y la
-- 'Asignada' zombi de anarossofi (seguía vencida tras marcarla No interesada).
--
-- Prevención en dos capas:
--   1. assign_closer_to_contact ahora dedup-ea TAMBIÉN por handle: si existe
--      una fila ABIERTA (Nuevo/Asignada/Confirmada) con el mismo
--      lower(instagram_handle), la PROMUEVE en vez de insertar otra.
--   2. Índice único parcial: nunca más dos filas abiertas del mismo handle.
--      (Los reingresos legítimos siguen OK: la fila vieja terminal no bloquea.)

create or replace function public.assign_closer_to_contact(p_contact_id uuid, p_closer_id uuid)
returns uuid
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_creator_id uuid;
  v_contact public.closers_contacts%rowtype;
  v_handle text;
begin
  if not public.has_permission(auth.uid(), 'Closers', 'Asignar Closer') then
    raise exception 'No tenés permiso para asignar closers (Closers / Asignar Closer).'
      using errcode = '42501';
  end if;

  select * into v_contact from public.closers_contacts where id = p_contact_id;
  if not found then
    raise exception 'Contacto no encontrado.' using errcode = 'P0002';
  end if;

  v_handle := coalesce(nullif(v_contact.handle, ''), nullif(v_contact.name, ''), 'sin_handle');

  -- 1) mismo contacto ya convertido
  select id into v_creator_id
  from public.closer_creators
  where source_contact_id = p_contact_id
    and deal_type = 'reclutamiento';

  -- 2) NUEVO: fila ABIERTA con el mismo handle (p.ej. la fila 'Nuevo' del pool
  --    cargada por otro camino) → promoverla, NO duplicar. Este era el origen
  --    de los duplicados (22 casos limpiados el 2026-07-23).
  if v_creator_id is null and lower(v_handle) <> 'sin_handle' then
    select id into v_creator_id
    from public.closer_creators
    where lower(instagram_handle) = lower(v_handle)
      and stage in ('Nuevo', 'Asignada', 'Confirmada')
    order by created_at asc
    limit 1;
  end if;

  if v_creator_id is not null then
    update public.closer_creators
    set assigned_to = p_closer_id,
        stage       = case when stage = 'Nuevo' then 'Asignada' else stage end,
        passed_date = coalesce(passed_date, current_date),
        source_contact_id = coalesce(source_contact_id, p_contact_id),
        phone       = coalesce(phone, v_contact.phone)
    where id = v_creator_id;
  else
    insert into public.closer_creators (
      instagram_handle, phone, category, source_contact_id,
      assigned_to, stage, passed_date, created_by
    ) values (
      v_handle,
      v_contact.phone,
      v_contact.physical_appearance,
      p_contact_id,
      p_closer_id,
      'Asignada',
      current_date,
      auth.uid()
    )
    returning id into v_creator_id;
  end if;

  update public.closers_contacts set status = 'converted' where id = p_contact_id;

  return v_creator_id;
end;
$function$;

-- Backstop a nivel BD: una sola fila ABIERTA por handle. Excluye vacíos y el
-- placeholder 'sin_handle'. Los stages terminales quedan fuera → reingresos OK.
create unique index if not exists uq_closer_creators_open_handle
on public.closer_creators (lower(instagram_handle))
where stage in ('Nuevo', 'Asignada', 'Confirmada')
  and coalesce(instagram_handle, '') not in ('', 'sin_handle');
