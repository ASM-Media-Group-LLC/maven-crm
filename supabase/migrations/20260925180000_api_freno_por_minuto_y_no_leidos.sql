-- Dos arreglos antes de abrir el Messenger por API.
--
-- 1. 🔴 get_unread_counts le contaba los no leídos de CUALQUIERA a cualquiera.
--    Su guarda era `_user_id = auth.uid() OR auth.uid() IS NULL`, y `anon` tenía
--    EXECUTE: con la clave pública de Maven (está en la página web) y el id de una
--    persona, cualquiera sin sesión obtenía la lista de sus conversaciones y cuántos
--    mensajes sin leer tiene en cada una. Ahora solo responde por uno mismo. Solo la
--    llama el frontend, siempre con sesión y con el id propio (useChat.ts,
--    useUnreadChatCount.ts): la app no cambia. Ninguna función ni cron la llama.
--
-- 2. FRENO POR MINUTO en api_key_consumir. La ventana por hora deja gastar los
--    1.000 pedidos en un minuto: ráfagas así, y no el promedio, son las que pueden
--    repetir el 17/09 (el edge comparte la base con la app). 60 por minuto por
--    llave, en la MISMA escritura que ya se hacía; y como con la hora, pasado el
--    límite no se escribe nada: se rechaza leyendo.
--
--    Cambia el tipo que devuelve la función (dos columnas nuevas AL FINAL), y eso
--    Postgres solo lo permite con DROP + CREATE. Es compatible con el public-api
--    desplegado: lee las columnas por nombre y las nuevas las ignora. Y si justo
--    en el cambio una llamada falla, public-api ya sirve igual (el límite falla
--    abierto a propósito).

set local lock_timeout = '3s';

-- ─── 1. get_unread_counts: solo por uno mismo ─────────────────────────────────

create or replace function public.get_unread_counts(_user_id uuid)
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  SELECT cp.conversation_id, COUNT(cm.id) AS unread_count
  FROM chat_participants cp
  LEFT JOIN chat_messages cm ON cm.conversation_id = cp.conversation_id
    AND cm.sender_id != _user_id AND cm.is_deleted = false
    AND (cp.last_read_at IS NULL OR cm.created_at > cp.last_read_at)
  WHERE cp.user_id = _user_id AND _user_id = (SELECT auth.uid())
  GROUP BY cp.conversation_id;
$$;

revoke all on function public.get_unread_counts(uuid) from public, anon;
grant execute on function public.get_unread_counts(uuid) to authenticated, service_role;

-- ─── 2. freno por minuto ──────────────────────────────────────────────────────

alter table public.api_keys
  add column if not exists limite_por_minuto integer not null default 60
    check (limite_por_minuto > 0),
  add column if not exists minuto_inicio timestamptz,
  add column if not exists minuto_pedidos integer not null default 0;

drop function if exists public.api_key_consumir(uuid);

-- Igual que antes, más la ventana del minuto. `limite`, `restantes` y `reinicio`
-- siguen siendo los de la HORA (las cabeceras X-RateLimit-*); `motivo` dice qué
-- límite se alcanzó ('hora' | 'minuto', null si se permitió) y, si fue el del
-- minuto, `reinicio` es el próximo minuto en punto.
create function public.api_key_consumir(_id uuid)
returns table (permitido boolean, limite integer, restantes integer, reinicio timestamptz,
               actua_como uuid, usuario_activo boolean, limite_minuto integer, motivo text)
language plpgsql
security definer
set search_path = public
as $$
declare
  _hora   timestamptz := date_trunc('hour', now());
  _minuto timestamptz := date_trunc('minute', now());
begin
  return query
  update public.api_keys k
     set ventana_pedidos = case when k.ventana_inicio = _hora then k.ventana_pedidos + 1 else 1 end,
         ventana_inicio  = _hora,
         minuto_pedidos  = case when k.minuto_inicio = _minuto then k.minuto_pedidos + 1 else 1 end,
         minuto_inicio   = _minuto,
         request_count   = k.request_count + 1,
         last_used_at    = now()
   where k.id = _id
     and not (k.ventana_inicio is not distinct from _hora and k.ventana_pedidos >= k.limite_por_hora)
     and not (k.minuto_inicio is not distinct from _minuto and k.minuto_pedidos >= k.limite_por_minuto)
  returning true,
            k.limite_por_hora,
            greatest(k.limite_por_hora - k.ventana_pedidos, 0),
            _hora + interval '1 hour',
            k.acts_as_user_id,
            public.api_key_persona_vigente(k.acts_as_user_id, k.tenant_id),
            k.limite_por_minuto,
            null::text;
  if found then
    return;
  end if;

  -- Sin cupo (o la llave no existe: cero filas). Solo lectura.
  return query
  select false,
         k.limite_por_hora,
         case when k.ventana_inicio is not distinct from _hora
              then greatest(k.limite_por_hora - k.ventana_pedidos, 0)
              else k.limite_por_hora end,
         case when k.ventana_inicio is not distinct from _hora and k.ventana_pedidos >= k.limite_por_hora
              then _hora + interval '1 hour'
              else _minuto + interval '1 minute' end,
         k.acts_as_user_id,
         public.api_key_persona_vigente(k.acts_as_user_id, k.tenant_id),
         k.limite_por_minuto,
         case when k.ventana_inicio is not distinct from _hora and k.ventana_pedidos >= k.limite_por_hora
              then 'hora' else 'minuto' end
    from public.api_keys k
   where k.id = _id;
end;
$$;

revoke all on function public.api_key_consumir(uuid) from public, anon, authenticated;
grant execute on function public.api_key_consumir(uuid) to service_role;
