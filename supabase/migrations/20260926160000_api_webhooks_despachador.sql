-- Webhooks del Messenger, parte 4a: lo que el despachador (edge messenger-webhooks)
-- necesita de la base. No prende nada: el cron va en la migración siguiente y nace
-- apagado.
--
-- 1. api_webhooks_timbrar: avanzar el cursor y crear el timbre en UNA transacción.
--    Por separado, un timbre podía quedar creado sin que el cursor avanzara (la
--    función se corta en el medio, un Resume en el medio, el reloj de la edge
--    adelantado) y la corrida siguiente mandaba lo mismo otra vez con OTRO id, o
--    anunciaba mensajes de una pausa. Acá, si la guarda no pasa, no se crea nada;
--    y si ya había un timbre pendiente (23505 del índice único), tampoco se mueve
--    el cursor.
-- 2. api_webhooks_hay_trabajo también despierta a la edge si hay MÁS de una
--    agencia y queda algún endpoint sin detener: es el respaldo del trigger
--    api_webhooks_por_agencias, que ante un error solo deja un WARNING. La edge,
--    con dos agencias, detiene todo con multi_agency y no lee ni manda nada.

set local lock_timeout = '3s';

-- La guarda es la misma de toda escritura del despachador sobre el endpoint: su
-- reclamo (lease_until), status active y el cursor que conoce (at + id). Toda
-- activación cambia el cursor, así que un Resume en el medio la deja sin efecto.
-- 'perdio' = la guarda no pasó (lo reclamó otra corrida, lo pausaron, detuvieron o
-- reanudaron): no se escribió nada.
create or replace function public.api_webhooks_timbrar(
  _endpoint uuid,
  _tenant uuid,
  _reclamo timestamptz,
  _cursor_at timestamptz,
  _cursor_id uuid,
  _nuevo_at timestamptz,
  _nuevo_id uuid,
  _timbre uuid,
  _cuerpo text,
  _cantidad integer,
  _limpiar_error boolean default false
)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.api_webhook_endpoints
     set cursor_at = _nuevo_at,
         cursor_id = _nuevo_id,
         last_error = case when _limpiar_error then null else last_error end
   where id = _endpoint
     and tenant_id = _tenant
     and lease_until = _reclamo
     and status = 'active'
     and cursor_at = _cursor_at
     and cursor_id = _cursor_id;
  if not found then
    return 'perdio';
  end if;
  -- Un 23505 acá (ya había un timbre pendiente) aborta TODO, cursor incluido.
  insert into public.api_webhook_deliveries (id, endpoint_id, tenant_id, event_type, body, message_count)
  values (_timbre, _endpoint, _tenant, 'messages.created', _cuerpo, _cantidad);
  return 'ok';
end;
$$;

revoke all on function public.api_webhooks_timbrar(uuid, uuid, timestamptz, timestamptz, uuid, timestamptz, uuid, uuid, text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.api_webhooks_timbrar(uuid, uuid, timestamptz, timestamptz, uuid, timestamptz, uuid, uuid, text, integer, boolean)
  to service_role;

-- Igual que en la migración 20260926120000, más el respaldo de las dos agencias.
-- Sigue siendo plpgsql por lo mismo: sin endpoints listos es una lectura de una
-- tabla chica y nunca se planifica la consulta sobre chat.
create or replace function public.api_webhooks_hay_trabajo()
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from public.tenants) > 1 then
    return exists (select 1 from public.api_webhook_endpoints where status <> 'disabled');
  end if;
  if not exists (select 1 from public.api_webhook_endpoints
                  where status = 'active'
                    and next_attempt_at <= now()
                    and (lease_until is null or lease_until <= now())) then
    return false;
  end if;
  return exists (select 1 from public.api_webhooks_con_trabajo());
end;
$$;

revoke all on function public.api_webhooks_hay_trabajo() from public, anon, authenticated, service_role;
