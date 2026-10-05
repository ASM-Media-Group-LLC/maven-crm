-- DRIVE: EL TIPO REAL DE LOS ARCHIVOS SIN EXTENSIÓN (Jhon, 06/10: «el visor de
-- documentos de Maven está mal, no me deja previsualizar»).
-- Banco: supabase/tests/drive_tipos_por_firma.ts.
--
-- 13.593 archivos importados de Google no tienen extensión en el nombre y
-- llegaron como application/octet-stream (el importador sacaba el tipo de la
-- extensión): grabaciones de Meet y de pantalla, todo «ENTREGA DE CARGO». Sin
-- el tipo no hay miniatura ni ícono, y el visor tenía que adivinar.
--
-- La mini lee los primeros bytes de cada uno en el NAS (infra/nas-drive/tipos.mjs)
-- y los corrige por la edge `drive` (acciones firmadas op «tipos»), que llama a:
--   · drive_sin_tipo(desde, limite): los que faltan, por páginas (id > desde);
--   · drive_corregir_tipos(ids, mime): les pone el tipo, SOLO si siguen con uno
--     genérico y SOLO uno de la lista cerrada de lo que reconoce la firma.
-- ⚠️ La fecha: drive_items_cuidar le pone now() a updated_at en un UPDATE de
-- service_role salvo que updated_at llegue DISTINTO del anterior. Corregir el
-- tipo no es modificar el archivo: se corre la fecha un microsegundo, así el
-- disparador la respeta y nadie ve 13.593 archivos «modificados hoy».
-- Solo service_role (la edge): nada de esto es para el navegador.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre):
--| drop function public.drive_corregir_tipos(uuid[], text);
--| drop function public.drive_sin_tipo(uuid, integer);

create function public.drive_sin_tipo(p_desde uuid default null, p_limite integer default 1000)
returns table (id uuid, storage_key text)
language sql
stable
security definer
set search_path = public
as $$
  -- ⚠️ Primero filtrar y DESPUÉS ordenar (materialized): con `order by id limit`
  -- directo, la base recorre las 891.000 fichas por el índice del id, una por
  -- una (32 s por página en prod, 06/10); así, una pasada y se ordenan las que
  -- quedan (0,8 s).
  with pendientes as materialized (
    select i.id, i.storage_key
      from public.drive_items i
     where i.tipo = 'archivo' and i.estado = 'listo' and i.storage_key is not null
       and (i.mime is null or i.mime in ('application/octet-stream', 'binary/octet-stream', 'application/x-binary', 'application/unknown'))
       and i.nombre !~ '\.[A-Za-z0-9]{1,5}$'
       and (p_desde is null or i.id > p_desde)
  )
  select id, storage_key from pendientes
   order by id
   limit least(greatest(coalesce(p_limite, 1000), 1), 2000);
$$;

create function public.drive_corregir_tipos(p_ids uuid[], p_mime text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if p_mime is null or p_mime not in (
    'video/mp4', 'video/quicktime', 'video/webm', 'image/heic', 'image/avif', 'image/jpeg', 'image/png',
    'image/gif', 'image/webp', 'application/pdf', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg'
  ) then
    raise exception 'Tipo no permitido: %', p_mime using errcode = '22023';
  end if;
  if coalesce(array_length(p_ids, 1), 0) > 2000 then
    raise exception 'Hasta 2000 por llamada' using errcode = '22023';
  end if;
  update public.drive_items i
     set mime = p_mime, updated_at = i.updated_at + interval '1 microsecond'
   where i.id = any(p_ids) and i.tipo = 'archivo'
     and (i.mime is null or i.mime in ('application/octet-stream', 'binary/octet-stream', 'application/x-binary', 'application/unknown'));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.drive_sin_tipo(uuid, integer) from public, anon, authenticated;
revoke all on function public.drive_corregir_tipos(uuid[], text) from public, anon, authenticated;
grant execute on function public.drive_sin_tipo(uuid, integer) to service_role;
grant execute on function public.drive_corregir_tipos(uuid[], text) to service_role;
