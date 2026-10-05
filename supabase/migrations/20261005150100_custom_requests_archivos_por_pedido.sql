-- PERSONALIZADOS: los archivos del bucket custom-requests, por pedido.
-- Banco: supabase/tests/seguridad_archivos.ts.
--
-- Los huecos que se cierran:
--   A1. «custom-requests read» e «insert» solo miraban bucket_id: cualquier
--       cuenta con sesión leía (URL firmada) y subía cualquier archivo del
--       bucket, también los de pedidos que su RLS no le deja ver (referencias de
--       contenido adulto y entregas de las creadoras).
--   A2. «custom-requests delete» dejaba borrar lo propio aunque el pedido ya no
--       fuera visible, y a quien gestiona no le dejaba borrar el archivo que sí
--       puede quitar de la ficha (cra_delete): la fila se iba y el archivo
--       quedaba huérfano.
--   A3. cra_insert solo miraba created_by: se colgaba un adjunto (con cualquier
--       ruta) a un pedido ajeno.
--
-- La ruta de un archivo la arma usePersonalizados.ts (subirAdjunto):
-- «<id del pedido>/<Date.now()>-<nombre saneado>». La primera carpeta es el pedido.
--
-- Qué cambia (siempre con la RLS de las tablas de Personalizados, sin copiarla):
--   · Leer (y firmar URL): el archivo es de un pedido que la persona VE
--     (custom_requests con su RLS: cr_read).
--   · Subir: a la carpeta de un pedido que la persona puede EDITAR. Se pregunta
--     con custom_request_puede_editar(), que hace «SELECT … FOR KEY SHARE» sobre
--     el pedido: Postgres le aplica las políticas de SELECT y las de UPDATE
--     (cr_update) de custom_requests. El chatter que creó el pedido (o es su
--     chatter) sube referencias; quien gestiona, también; quien entrega es
--     alguno de esos dos.
--   · Borrar: el pedido se ve y, igual que cra_delete (la fila del adjunto), el
--     archivo es de quien lo subió o la persona tiene la función «Gestionar».
--     Así quien puede quitar el adjunto de la ficha también borra su archivo.
--   · La fila del adjunto (cra_insert): además de created_by = yo, el pedido es
--     uno que puedo editar y la ruta está en SU carpeta.
-- Un objeto cuya primera carpeta no es un uuid no es de ningún pedido: no se ve.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre):
--| drop policy if exists "custom-requests read" on storage.objects;
--| create policy "custom-requests read" on storage.objects for select to authenticated using (bucket_id = 'custom-requests');
--| drop policy if exists "custom-requests insert" on storage.objects;
--| create policy "custom-requests insert" on storage.objects for insert to authenticated with check (bucket_id = 'custom-requests');
--| drop policy if exists "custom-requests delete" on storage.objects;
--| create policy "custom-requests delete" on storage.objects for delete to authenticated using (bucket_id = 'custom-requests' and owner = auth.uid());
--| alter policy cra_insert on public.custom_request_attachments with check (created_by = auth.uid());
--| drop function public.custom_request_de_ruta(text);
--| drop function public.custom_request_puede_editar(uuid);

-- ─── 0. Lo que se reemplaza tiene que ser lo revisado ────────────────────────
do $$
declare
  r record;
  esperado jsonb := jsonb_build_object(
    'custom-requests read',   jsonb_build_array('SELECT', '(bucket_id = ''custom-requests''::text)', null),
    'custom-requests insert', jsonb_build_array('INSERT', null, '(bucket_id = ''custom-requests''::text)'),
    'custom-requests delete', jsonb_build_array('DELETE', '((bucket_id = ''custom-requests''::text) AND (owner = auth.uid()))', null));
  vistas int := 0;
begin
  for r in select policyname, cmd, qual, with_check from pg_policies
           where schemaname = 'storage' and tablename = 'objects'
             and (coalesce(qual, '') || coalesce(with_check, '')) like '%custom-requests%' loop
    if not esperado ? r.policyname
       or esperado -> r.policyname ->> 0 <> r.cmd
       or (esperado -> r.policyname ->> 1) is distinct from r.qual
       or (esperado -> r.policyname ->> 2) is distinct from r.with_check then
      raise exception 'custom_requests_archivos: la política % de storage.objects no es la que se revisó (%, %, %)', r.policyname, r.cmd, r.qual, r.with_check;
    end if;
    vistas := vistas + 1;
  end loop;
  if vistas <> 3 then
    raise exception 'custom_requests_archivos: se esperaban 3 políticas del bucket custom-requests y hay %', vistas;
  end if;
  if (select with_check from pg_policies where schemaname = 'public' and tablename = 'custom_request_attachments' and policyname = 'cra_insert')
     is distinct from '(created_by = auth.uid())' then
    raise exception 'custom_requests_archivos: cra_insert no es la que se revisó';
  end if;
end $$;

-- ─── 1. Las dos preguntas, con la RLS de quien llama ─────────────────────────
-- El pedido de una ruta: la primera carpeta, si es un uuid.
create or replace function public.custom_request_de_ruta(p_name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select case when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              and strpos(p_name, '/') > 0
         then split_part(p_name, '/', 1)::uuid end
$$;
grant execute on function public.custom_request_de_ruta(text) to authenticated, service_role;

-- ¿Puede editar el pedido? Las políticas de SELECT y UPDATE de custom_requests,
-- sin copiarlas (FOR KEY SHARE no escribe ni dispara triggers).
create or replace function public.custom_request_puede_editar(p_request_id uuid)
returns boolean
language plpgsql
volatile
security invoker
set search_path = public
as $$
begin
  if p_request_id is null then
    return false;
  end if;
  perform 1 from public.custom_requests where id = p_request_id for key share;
  return found;
exception when insufficient_privilege then
  return false;
end
$$;
revoke all on function public.custom_request_puede_editar(uuid) from public, anon;
grant execute on function public.custom_request_puede_editar(uuid) to authenticated;
comment on function public.custom_request_puede_editar(uuid) is
  '¿Quien llama puede EDITAR este pedido? Aplica cr_read y cr_update (SELECT FOR KEY SHARE) sin copiarlas. Como service_role da true para todo pedido que exista.';

-- ─── 2. El bucket: por pedido ───────────────────────────────────────────────
drop policy "custom-requests read" on storage.objects;
create policy "custom-requests read" on storage.objects for select to authenticated
  using (
    bucket_id = 'custom-requests'
    and exists (select 1 from public.custom_requests r where r.id = public.custom_request_de_ruta(name))
  );

drop policy "custom-requests insert" on storage.objects;
create policy "custom-requests insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'custom-requests'
    and public.custom_request_puede_editar(public.custom_request_de_ruta(name))
  );

drop policy "custom-requests delete" on storage.objects;
create policy "custom-requests delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'custom-requests'
    and exists (select 1 from public.custom_requests r where r.id = public.custom_request_de_ruta(name))
    and (
      owner = (select auth.uid())
      or public.can_use_module_function((select auth.uid()), 'Personalizados', 'Gestionar', 'supervisor_or_above')
    )
  );

-- ─── 3. La fila del adjunto: a un pedido que puedo editar, en su carpeta ────
alter policy cra_insert on public.custom_request_attachments
  with check (
    created_by = (select auth.uid())
    and public.custom_request_de_ruta(storage_path) = request_id
    and public.custom_request_puede_editar(request_id)
  );
