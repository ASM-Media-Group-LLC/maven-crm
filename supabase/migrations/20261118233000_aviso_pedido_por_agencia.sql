-- EL AVISO «YA SUBIÓ» LLEGA A LA DIRECCIÓN DE LA AGENCIA (18/11/2026).
--
-- Backstage registró https://grupo.kashagency.me/api/maven/contenido-aviso con
-- su llave «Backstage», pero creó el pedido de prueba con la llave «kashgrupo1».
-- api_pedidos_avisar_subido solo buscaba la dirección registrada con LA MISMA
-- llave del pedido, así que el aviso contenido.pedido_subido nunca se encoló
-- (0 intentos). Ahora busca primero la de la misma llave y, si no hay, la
-- dirección activa de esa misma agencia (tenant) que pida el evento. Nunca
-- cruza agencias.

create or replace function public.api_pedidos_avisar_subido(_request uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _p public.api_pedidos;
  _w record;
  _datos jsonb;
  _e public.integracion_equipo_entregas;
  _id uuid;
  _ahora timestamptz := now();
begin
  select * into _p from public.api_pedidos where request_id = _request;
  if not found then return; end if;
  -- La dirección del aviso es de la AGENCIA, no de una llave: Backstage creó el
  -- pedido con una llave y registró el aviso con otra, y el aviso nunca salió.
  -- Primero la registrada con la misma llave del pedido; si no hay, cualquiera
  -- activa de esa agencia que pida este evento.
  select w.id, w.tenant_id into _w from public.integracion_equipo_webhooks w
   where w.tenant_id = _p.tenant_id and w.status = 'active'
     and 'contenido.pedido_subido' = any (w.eventos)
   order by (w.api_key_id = _p.api_key_id) desc, w.created_at desc
   limit 1;
  if not found then return; end if;

  _datos := jsonb_build_object(
    'pedido_id', _p.request_id,
    'referencia', _p.referencia,
    'creadora_id', _p.creator_id,
    'estado', 'subido',
    'subido', _p.subido_at,
    'archivos', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'nombre', d.nombre, 'tipo', d.mime, 'tamano', d.size, 'subido', d.created_at)
                       order by d.created_at)
        from (select * from public.drive_items
               where parent_id = _p.carpeta_item_id and tipo = 'archivo' and estado = 'listo' and trashed_at is null
               order by created_at limit 50) d), '[]'::jsonb));

  select * into _e from public.integracion_equipo_entregas e
   where e.webhook_id = _w.id and e.user_id = _p.request_id and e.evento = 'contenido.pedido_subido'
     and e.state = 'pending' and e.attempts = 0 and e.lease_until is null
   order by e.created_at desc limit 1
   for update;
  if found then
    update public.integracion_equipo_entregas
       set datos = _datos, body = public.equipo_evento_cuerpo(_e.id, _e.evento, _e.tenant_id, _e.created_at, _datos)
     where id = _e.id;
    return;
  end if;
  _id := gen_random_uuid();
  insert into public.integracion_equipo_entregas
    (id, webhook_id, tenant_id, evento, user_id, datos, body, next_attempt_at, created_at)
  values
    (_id, _w.id, _w.tenant_id, 'contenido.pedido_subido', _p.request_id, _datos,
     public.equipo_evento_cuerpo(_id, 'contenido.pedido_subido', _w.tenant_id, _ahora, _datos),
     _ahora + interval '20 seconds', _ahora);
end;
$$;
revoke all on function public.api_pedidos_avisar_subido(uuid) from public, anon, authenticated;
