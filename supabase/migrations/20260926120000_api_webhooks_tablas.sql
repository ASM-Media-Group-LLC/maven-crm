-- Webhooks del Messenger, parte 1: las tablas y lo que la base garantiza sola.
--
-- El diseño completo está en la memoria del proyecto (webhooks_diseno_completo).
-- En corto: un "timbre" SIN contenido. Cada 15 s un cron pregunta si la persona
-- de una llave de Messenger tiene mensajes nuevos; si los tiene, una edge
-- function arma el timbre leyendo el MISMO feed que usa el API (como esa
-- persona, con su RLS) y le manda al integrador un POST firmado con cursores,
-- cantidad e ids de conversación. El integrador lee el contenido con
-- GET /messenger/feed, desde su IP fija, con la llave. El envío de mensajes no
-- se toca: no hay trigger en chat_messages.
--
-- Esta migración NO prende nada: crea las tablas, sus reglas y las funciones que
-- van a usar el cron y la edge (PRs siguientes). Nadie lee estas tablas todavía.
--
-- Lo que la base garantiza aunque se equivoque la edge (contra alguien con
-- service_role no hay regla que alcance: puede escribir lo que quiera):
--   * un endpoint solo nace de una llave con Messenger vigente, con IPs fijas,
--     creada por la misma persona cuyas conversaciones lee, con una sola agencia;
--   * la agencia, la persona, la llave y la URL de un endpoint no cambian nunca;
--   * un endpoint no se activa sin una prueba contestada con 2xx hace menos de 15
--     minutos, sobre una llave que siga vigente, y arrancando desde AHORA: lo que
--     pasó mientras estaba parado (o la persona de baja) no se anuncia, y el timbre
--     que haya quedado pendiente de antes se descarta;
--   * mientras está activo, el cursor solo avanza y nunca queda en el futuro;
--   * se detiene solo, en el momento, si aparece otra agencia, si la persona se da
--     de baja, o si la llave se revoca o pierde el permiso de Messenger. Vuelve
--     únicamente con un Resume que pase otra prueba;
--   * hay como mucho UN timbre pendiente por endpoint, solo con el endpoint activo,
--     y el cuerpo firmado de un timbre no se reescribe (cada reintento manda los
--     mismos bytes);
--   * nadie del navegador ve ni toca estas tablas: RLS prendida, sin políticas,
--     y sin permisos para anon ni authenticated.
--
-- ⚠️ Una violación de CHECK o de NOT NULL trae en el DETAIL la fila ENTERA (con la
-- URL, que puede llevar un token, y el secreto cifrado). En la edge nunca se loguea
-- ni se devuelve error.details de una escritura sobre api_webhook_*: solo
-- error.code o error.message.

set local lock_timeout = '3s';

-- ─── 1. endpoints: uno por llave ─────────────────────────────────────────────

create table public.api_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  -- Uno por llave. La llave se revoca, no se borra; si alguna vez se borrara, el
  -- endpoint se va con ella.
  api_key_id uuid not null unique references public.api_keys(id) on delete cascade,
  -- Copiados de la llave por el trigger de alta; nunca cambian.
  tenant_id uuid not null references public.tenants(id),
  acts_as_user_id uuid not null,
  -- La URL exacta a la que se manda (el href ya normalizado por la edge). Es un
  -- secreto: puede llevar un token en el camino. La pantalla muestra url_host.
  url text not null check (char_length(url) <= 2048 and url ~ '^https://'),
  url_host text not null,
  exclude_own boolean not null default true,

  status text not null default 'pending'
    check (status in ('pending', 'active', 'paused', 'disabled')),
  disabled_reason text check (disabled_reason in (
    'receiver_gone', 'receiver_failing', 'key_revoked', 'key_expired', 'scope_removed',
    'person_inactive', 'multi_agency', 'config_error', 'admin')),
  disabled_at timestamptz,
  paused_by uuid,
  paused_at timestamptz,

  -- El secreto de firma, cifrado con AES-GCM (WEBHOOK_SIGNING_KEK, como en
  -- _shared/mail-crypto.ts) con AAD = id|versión: copiado a otra fila no abre.
  -- Maven lo necesita en claro para firmar, así que no puede ser un hash.
  secret_cipher text not null,
  secret_nonce text not null,
  secret_key_version smallint not null default 1 check (secret_key_version >= 1),
  secret_last4 text not null check (char_length(secret_last4) = 4),

  -- Hasta dónde se miró. Es el cursor del feed separado en sus dos partes: el
  -- cursor opaco que se le pasa a /messenger/feed se arma con estas dos (es
  -- base64url de {t, i}), así que se guarda UNA sola vez, sin una copia de texto
  -- que se pueda desincronizar.
  cursor_at timestamptz,
  cursor_id uuid,

  -- Cuándo se puede volver a intentar (un reintento con espera, o el próximo
  -- timbre) y quién lo está trabajando ahora (reclamo con vencimiento).
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  failing_since timestamptz,

  -- Últimos resultados. last_error es una CLASE de error (timeout, tls, dns,
  -- http_401…), nunca el cuerpo de una respuesta. El código HTTP lo elige el
  -- receptor y fetch acepta cualquiera de 3 cifras: con un tope en 599, un
  -- receptor que contesta 999 haría fallar la anotación del intento.
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_status_code integer check (last_status_code between 100 and 999),
  last_error text check (char_length(last_error) <= 60),
  last_test_at timestamptz,

  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint api_webhook_endpoints_detenido
    check ((status = 'disabled') = (disabled_reason is not null)
       and (status = 'disabled') = (disabled_at is not null)),
  constraint api_webhook_endpoints_pausado
    check ((status = 'paused') = (paused_at is not null)
       and (paused_by is null or paused_at is not null)),
  constraint api_webhook_endpoints_cursor
    check ((cursor_at is null) = (cursor_id is null)),
  constraint api_webhook_endpoints_activo_con_cursor
    check (status <> 'active' or cursor_at is not null)
);

comment on table public.api_webhook_endpoints is
  'Webhooks del Messenger (un timbre sin contenido por llave). Ver la migración 20260926120000.';

-- ─── 2. entregas: una fila por timbre o por prueba ───────────────────────────

create table public.api_webhook_deliveries (
  -- Es el webhook-id del encabezado y el id del cuerpo: estable entre reintentos.
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.api_webhook_endpoints(id) on delete cascade,
  tenant_id uuid not null,
  event_type text not null check (event_type in ('messages.created', 'webhook.test')),
  -- Los bytes EXACTOS que se firman y se mandan en cada intento. Solo ids,
  -- cursores y cantidades: nunca texto de mensajes.
  body text not null check (octet_length(body) <= 16384),
  message_count integer,
  state text not null default 'pending' check (state in ('pending', 'delivered', 'dropped')),
  drop_reason text check (drop_reason in (
    'receiver_gone', 'receiver_failing', 'endpoint_paused', 'endpoint_disabled', 'test_failed')),
  attempts smallint not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  last_status_code integer check (last_status_code between 100 and 999),
  last_error text check (char_length(last_error) <= 60),
  latency_ms integer check (latency_ms >= 0),
  -- Se cortó DESPUÉS de mandar el cuerpo: no sabemos si llegó (lección del #1868:
  -- eso no es un fallo, es incertidumbre). Se reintenta con el mismo id.
  uncertain boolean not null default false,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,

  -- ⚠️ "is not null" explícito: un CHECK que da nulo cuenta como cumplido, y
  -- "null between 1 and 100" da nulo.
  constraint api_webhook_deliveries_cantidad
    check (case event_type
             when 'messages.created' then message_count is not null and message_count between 1 and 100
             else message_count is null end),
  constraint api_webhook_deliveries_descartado
    check ((state = 'dropped') = (drop_reason is not null)),
  constraint api_webhook_deliveries_entregado
    check ((state = 'delivered') = (delivered_at is not null)),
  -- Entregado quiere decir que el receptor contestó 2xx a un intento de verdad. Un
  -- 3xx no se sigue y cuenta como fallo; un 500 no es una entrega.
  constraint api_webhook_deliveries_entregado_2xx
    check (state <> 'delivered' or (last_status_code between 200 and 299 and attempts >= 1))
);

-- Un solo timbre en vuelo por endpoint: con el integrador caído no se arma cola.
-- Las pruebas quedan afuera (se mandan en el momento y no se reintentan).
create unique index api_webhook_deliveries_un_timbre_pendiente
  on public.api_webhook_deliveries (endpoint_id)
  where state = 'pending' and event_type = 'messages.created';
create index api_webhook_deliveries_por_endpoint
  on public.api_webhook_deliveries (endpoint_id, created_at desc);
create index api_webhook_deliveries_por_fecha
  on public.api_webhook_deliveries (created_at);

comment on table public.api_webhook_deliveries is
  'Timbres y pruebas de los webhooks del Messenger. Se guardan 14 días.';

-- ─── 3. permisos: nada para el navegador ─────────────────────────────────────
-- Los permisos por defecto de public le dan TODO a anon y authenticated en cada
-- tabla nueva. Con la RLS prendida y sin políticas ya no verían nada, pero igual
-- se sacan: dos candados. service_role (la edge) queda con lo justo.

alter table public.api_webhook_endpoints enable row level security;
alter table public.api_webhook_deliveries enable row level security;

revoke all on public.api_webhook_endpoints from public, anon, authenticated, service_role;
revoke all on public.api_webhook_deliveries from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.api_webhook_endpoints to service_role;
grant select, insert, update, delete on public.api_webhook_deliveries to service_role;

-- ─── 4. reglas del endpoint ──────────────────────────────────────────────────

-- La URL que se guarda es la que se manda. La edge (PR 2) es la que decide si un
-- host es aceptable (lista de hosts de Maven, localhost.*, *.internal, DNS con IPs
-- públicas…); acá solo va la forma, para que un error de la edge no guarde algo
-- que después no se puede corregir (la URL no se edita). Devuelve el host.
create or replace function public.api_webhooks_host_de_url(_url text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  _autoridad text;
  _host text;
begin
  if _url is null or _url !~ '^https://' then
    raise exception 'webhooks: la URL tiene que empezar con https://';
  end if;
  if char_length(_url) > 2048 then
    raise exception 'webhooks: la URL tiene más de 2048 caracteres';
  end if;
  if _url ~ '[[:space:][:cntrl:]]' then
    raise exception 'webhooks: la URL no puede tener espacios ni caracteres de control';
  end if;
  -- El href que arma la edge (new URL(x).href) es siempre ASCII visible, sin barra
  -- invertida (la pasa a /): si llega otra cosa, no es la URL que se va a mandar.
  if _url !~ '^[!-~]+$' or position(E'\\' in _url) > 0 then
    raise exception 'webhooks: la URL tiene que llegar normalizada (solo ASCII visible, sin barra invertida)';
  end if;
  if position('#' in _url) > 0 then
    raise exception 'webhooks: la URL no puede tener fragmento (#)';
  end if;

  _autoridad := substring(_url from '^https://([^/?]*)');
  if position('@' in _autoridad) > 0 then
    raise exception 'webhooks: la URL no puede llevar usuario ni contraseña';
  end if;
  if left(_autoridad, 1) = '[' then
    raise exception 'webhooks: la URL tiene que usar un nombre, no una IP';
  end if;

  _host := _autoridad;
  if position(':' in _autoridad) > 0 then
    if _autoridad !~ '^[^:]+:443$' then
      raise exception 'webhooks: la URL solo puede usar el puerto 443';
    end if;
    _host := split_part(_autoridad, ':', 1);
  end if;

  -- Minúsculas (así la normaliza la edge), al menos dos partes, y la última
  -- empieza con una letra: eso deja afuera las IPs (1.2.3.4, 0x7f000001…), los
  -- nombres de una sola parte (localhost, intranet) y el punto final.
  if _host is distinct from lower(_host)
     or char_length(_host) > 253
     or _host !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$' then
    raise exception 'webhooks: el host de la URL no es un nombre de dominio válido';
  end if;
  return _host;
end;
$$;

-- ¿La llave sirve para un webhook? Devuelve el motivo si no, o null si sí. La usan
-- el alta y la activación, para que las dos reglas no se separen nunca.
create or replace function public.api_webhooks_llave_no_sirve(_llave public.api_keys)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when _llave.id is null then 'la llave no existe'
    when _llave.revoked_at is not null then 'la llave está revocada'
    when _llave.expires_at is null or _llave.expires_at <= now() then 'la llave está vencida o no vence'
    when not ('messenger:read' = any (_llave.scopes)) then 'la llave no tiene el permiso de Messenger'
    when coalesce(cardinality(_llave.ip_whitelist), 0) = 0 then 'la llave no tiene IPs fijas'
    when (select count(*) from public.tenants) <> 1 then 'hay más de una agencia'
    when not public.api_key_persona_vigente(_llave.acts_as_user_id, _llave.tenant_id)
      then 'la persona de la llave ya no está activa en la agencia'
  end;
$$;

create or replace function public.api_webhook_endpoints_alta()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  _llave public.api_keys;
  _motivo text;
begin
  select * into _llave from public.api_keys where id = new.api_key_id;
  _motivo := public.api_webhooks_llave_no_sirve(_llave);
  if _motivo is not null then
    raise exception 'webhooks: %', _motivo;
  end if;
  -- Lo registra la misma persona cuyas conversaciones lee la llave (y la llave
  -- con Messenger, a su vez, solo la crea esa persona: api_keys_reglas_messenger).
  if new.created_by is distinct from _llave.acts_as_user_id then
    raise exception 'webhooks: el webhook lo registra la persona cuyas conversaciones lee la llave';
  end if;
  if new.status is distinct from 'pending' then
    raise exception 'webhooks: un endpoint nace esperando la prueba (pending)';
  end if;

  new.tenant_id := _llave.tenant_id;
  new.acts_as_user_id := _llave.acts_as_user_id;
  new.url_host := public.api_webhooks_host_de_url(new.url);
  new.cursor_at := null;
  new.cursor_id := null;
  new.lease_until := null;
  new.next_attempt_at := now();
  new.consecutive_failures := 0;
  new.failing_since := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.api_webhook_endpoints_cambio()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  _llave public.api_keys;
  _motivo text;
begin
  if new.id is distinct from old.id
     or new.api_key_id is distinct from old.api_key_id
     or new.tenant_id is distinct from old.tenant_id
     or new.acts_as_user_id is distinct from old.acts_as_user_id
     or new.url is distinct from old.url
     or new.url_host is distinct from old.url_host
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'webhooks: la llave, la agencia, la persona y la URL de un endpoint no cambian; hay que crear otro';
  end if;
  -- El secreto de firma no cambia (rotarlo es borrar y crear otro, con otro
  -- secreto para el integrador). Lo único permitido es volver a cifrar el MISMO
  -- secreto con una versión nueva de WEBHOOK_SIGNING_KEK, para poder retirar la
  -- vieja: sube la versión y los últimos 4 no cambian.
  if (new.secret_cipher, new.secret_nonce, new.secret_key_version, new.secret_last4)
     is distinct from (old.secret_cipher, old.secret_nonce, old.secret_key_version, old.secret_last4)
     and not (new.secret_key_version > old.secret_key_version
              and new.secret_last4 is not distinct from old.secret_last4
              and new.secret_cipher is distinct from old.secret_cipher
              and new.secret_nonce is distinct from old.secret_nonce) then
    raise exception 'webhooks: el secreto de un endpoint no cambia (solo se vuelve a cifrar con una versión nueva de la clave); hay que crear otro';
  end if;

  -- Activar (la primera vez, o al reanudar desde pausado o detenido).
  if new.status = 'active' and old.status is distinct from 'active' then
    select * into _llave from public.api_keys where id = new.api_key_id;
    _motivo := public.api_webhooks_llave_no_sirve(_llave);
    if _motivo is not null then
      raise exception 'webhooks: no se puede activar: %', _motivo;
    end if;
    if not exists (
      select 1 from public.api_webhook_deliveries d
       where d.endpoint_id = new.id
         and d.event_type = 'webhook.test'
         and d.state = 'delivered'
         and d.delivered_at >= now() - interval '15 minutes'
         -- el mismo margen de reloj que el cursor (la edge puede anotar la hora
         -- con su reloj; mejor que mande 'now' y use el de la base)
         and d.delivered_at <= now() + interval '5 seconds') then
      raise exception 'webhooks: no se puede activar sin una prueba entregada en los últimos 15 minutos';
    end if;
    -- Arranca desde ahora: nada de lo que pasó mientras estaba parado (o mientras
    -- la persona estaba de baja) se anuncia. La edge lo pone en ahora − 10 s.
    if new.cursor_at is null
       or new.cursor_at < now() - interval '2 minutes'
       or new.cursor_at > now() + interval '5 seconds' then
      raise exception 'webhooks: al activar, el cursor tiene que arrancar desde ahora';
    end if;
    -- Y de cero: sin la espera ni la racha de fallos de antes (si no, un Resume
    -- después de receiver_failing quedaría mudo hasta 8 h y el primer error lo
    -- volvería a detener por "3 días fallando"), y sin el timbre que haya quedado
    -- pendiente de antes de parar. lease_until no se toca: si quedó una corrida
    -- viva, que su reclamo venza solo.
    new.next_attempt_at := now();
    new.consecutive_failures := 0;
    new.failing_since := null;
    update public.api_webhook_deliveries
       set state = 'dropped',
           drop_reason = case old.status when 'disabled' then 'endpoint_disabled' else 'endpoint_paused' end
     where endpoint_id = new.id and state = 'pending' and event_type = 'messages.created';

  -- Salir de activo: el timbre pendiente se descarta en el momento (no se manda
  -- parado, y al volver se arranca de cero).
  elsif old.status = 'active' and new.status is distinct from 'active' then
    update public.api_webhook_deliveries
       set state = 'dropped',
           drop_reason = case
             when new.status = 'paused' then 'endpoint_paused'
             when new.disabled_reason in ('receiver_gone', 'receiver_failing') then new.disabled_reason
             else 'endpoint_disabled' end
     where endpoint_id = new.id and state = 'pending' and event_type = 'messages.created';

  -- Sigue activo y se mueve el cursor: solo hacia adelante, y nunca al futuro. Un
  -- cursor atrás repetiría timbres (o anunciaría lo de una pausa); uno en el
  -- futuro dejaría el endpoint "activo" y mudo para siempre.
  elsif old.status = 'active' and new.status = 'active'
        and (new.cursor_at, new.cursor_id) is distinct from (old.cursor_at, old.cursor_id) then
    if (new.cursor_at, new.cursor_id) < (old.cursor_at, old.cursor_id) then
      raise exception 'webhooks: el cursor de un endpoint activo solo avanza';
    end if;
    if new.cursor_at > now() + interval '5 seconds' then
      raise exception 'webhooks: el cursor no puede quedar en el futuro';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger api_webhook_endpoints_alta
  before insert on public.api_webhook_endpoints
  for each row execute function public.api_webhook_endpoints_alta();
create trigger api_webhook_endpoints_cambio
  before update on public.api_webhook_endpoints
  for each row execute function public.api_webhook_endpoints_cambio();

-- ─── 5. reglas de las entregas ───────────────────────────────────────────────
-- Contrato para la edge (PR 4), porque parar un endpoint descarta su timbre en
-- el momento (sección 4) y una entrega terminada ya no cambia:
--   * toda escritura sobre un timbre va con .eq('state','pending'): si toca 0
--     filas, lo pausaron o detuvieron mientras se mandaba. Es una carrera perdida,
--     no un fallo: no suma consecutive_failures, no se reintenta, no corta la corrida;
--   * primero se anota el intento en el timbre (y su descarte propio, si es 410 o
--     72 h fallando) y recién después se cambia el estado del endpoint;
--   * justo antes del POST se relee que el timbre siga pending y el endpoint active.

create or replace function public.api_webhook_deliveries_alta()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  _endpoint public.api_webhook_endpoints;
begin
  -- FOR SHARE: si en este mismo instante alguien pausa o detiene el endpoint, el
  -- timbre espera a que eso confirme y lo vuelve a leer ya parado.
  select * into _endpoint from public.api_webhook_endpoints where id = new.endpoint_id for share;
  if _endpoint.id is null then
    raise exception 'webhooks: el endpoint de la entrega no existe';
  end if;
  if new.event_type = 'messages.created' then
    if _endpoint.status is distinct from 'active' then
      raise exception 'webhooks: solo un endpoint activo recibe timbres';
    end if;
    if new.state is distinct from 'pending' then
      raise exception 'webhooks: un timbre nace pendiente';
    end if;
    if (select count(*) from public.tenants) <> 1 then
      raise exception 'webhooks: con más de una agencia no sale ningún timbre';
    end if;
  end if;
  new.tenant_id := _endpoint.tenant_id;
  new.created_at := now();
  return new;
end;
$$;

create or replace function public.api_webhook_deliveries_cambio()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.state <> 'pending' then
    raise exception 'webhooks: una entrega terminada (%) ya no cambia', old.state;
  end if;
  if new.id is distinct from old.id
     or new.endpoint_id is distinct from old.endpoint_id
     or new.tenant_id is distinct from old.tenant_id
     or new.event_type is distinct from old.event_type
     or new.body is distinct from old.body
     or new.message_count is distinct from old.message_count
     or new.created_at is distinct from old.created_at then
    raise exception 'webhooks: lo que se firmó de una entrega no cambia (cada reintento manda los mismos bytes)';
  end if;
  return new;
end;
$$;

create trigger api_webhook_deliveries_alta
  before insert on public.api_webhook_deliveries
  for each row execute function public.api_webhook_deliveries_alta();
create trigger api_webhook_deliveries_cambio
  before update on public.api_webhook_deliveries
  for each row execute function public.api_webhook_deliveries_cambio();

-- ─── 6. apagado automático, en el momento ────────────────────────────────────
-- No dependen de que la edge corra: la agencia nueva, la baja o la revocación
-- detienen el webhook en la misma transacción. Volver pide un Resume con prueba.
--
-- ⚠️ NUNCA hacen fallar lo que los dispara (dar de alta una agencia, dar de baja
-- a una persona, revocar una llave): si algo sale mal, dejan un WARNING y listo.
-- La pared de verdad sigue estando en el turno del cron y en la edge, que con
-- dos agencias o una llave muerta no mandan nada (y la edge detiene el endpoint
-- ella misma si lo encuentra así).
--   * "when others" atrapa todo MENOS la cancelación de la sentencia
--     (statement_timeout): por eso cada una trae su propio lock_timeout de 1 s,
--     que convierte cualquier espera de lock adentro en un error que sí se
--     atrapa, mucho antes de los 8 s del statement_timeout de PostgREST.
--   * Las tres de los triggers son SECURITY DEFINER porque quien dispara (el
--     registro de una agencia, admin-user-actions) no tiene por qué poder
--     escribir estas tablas. api_webhooks_detener, en cambio, corre con los
--     permisos de quien la llama: llamada suelta (si algún día volviera el
--     EXECUTE por defecto) no puede detener nada sin UPDATE sobre la tabla.

create or replace function public.api_webhooks_detener(_motivo text, _endpoints uuid[])
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
set lock_timeout = '1s'
as $$
begin
  update public.api_webhook_endpoints
     set status = 'disabled', disabled_reason = _motivo, disabled_at = now(),
         paused_at = null, paused_by = null
   where id = any (_endpoints) and status <> 'disabled';
exception when others then
  raise warning 'webhooks: no se pudieron detener % endpoint(s) por % (%): %',
    cardinality(_endpoints), _motivo, sqlstate, sqlerrm;
end;
$$;

create or replace function public.api_webhooks_por_agencias()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '1s'
as $$
begin
  if (select count(*) from public.tenants) <> 1 then
    perform public.api_webhooks_detener('multi_agency',
      array(select id from public.api_webhook_endpoints where status <> 'disabled'));
  end if;
  return null;
exception when others then
  raise warning 'webhooks: falló el apagado por agencias (%): %', sqlstate, sqlerrm;
  return null;
end;
$$;

create or replace function public.api_webhooks_por_baja()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '1s'
as $$
begin
  perform public.api_webhooks_detener('person_inactive',
    array(select id from public.api_webhook_endpoints
           where acts_as_user_id = new.id and status <> 'disabled'));
  return null;
exception when others then
  raise warning 'webhooks: falló el apagado por baja (%): %', sqlstate, sqlerrm;
  return null;
end;
$$;

create or replace function public.api_webhooks_por_llave()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '1s'
as $$
begin
  perform public.api_webhooks_detener(
    case when new.revoked_at is not null then 'key_revoked' else 'scope_removed' end,
    array(select id from public.api_webhook_endpoints
           where api_key_id = new.id and status <> 'disabled'));
  return null;
exception when others then
  raise warning 'webhooks: falló el apagado por llave (%): %', sqlstate, sqlerrm;
  return null;
end;
$$;

-- Por sentencia y solo al agregar: dar de alta agencias es rarísimo.
create trigger api_webhooks_por_agencias
  after insert on public.tenants
  for each statement execute function public.api_webhooks_por_agencias();
-- Solo cuando deleted_at pasa de nulo a una fecha (la baja): el resto de los
-- updates de profiles ni evalúan la función.
create trigger api_webhooks_por_baja
  after update of deleted_at on public.profiles
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.api_webhooks_por_baja();
-- Solo cuando se revoca o se le saca Messenger. api_key_consumir (que escribe
-- api_keys en cada pedido del API) no toca esas columnas: este trigger ni se mira.
create trigger api_webhooks_por_llave
  after update of revoked_at, scopes on public.api_keys
  for each row when ((old.revoked_at is null and new.revoked_at is not null)
                  or ('messenger:read' = any (old.scopes) and not ('messenger:read' = any (new.scopes))))
  execute function public.api_webhooks_por_llave();

-- ─── 7. el trabajo del cron y de la edge ─────────────────────────────────────

-- Los endpoints que tienen algo que hacer: activos, sin reclamar, con el turno
-- vencido, con una sola agencia, y con un timbre pendiente o algún mensaje nuevo
-- en las conversaciones de su persona. Una sola definición para el cron y la edge.
--
-- "Mensaje nuevo" es un SUPERCONJUNTO de lo que va a devolver el feed: misma
-- participación (la RLS de chat es solo is_chat_participant), mismo margen de
-- 10 s, created_at >= cursor_at (con el mismo instante incluido, por los
-- empates). Nunca puede ser más estricto que el feed: se perdería un timbre.
--
-- Lo que la edge (PR 4) tiene que hacer para que esto no gire en falso:
--   * el feed mira como mucho 1 h por lectura (VENTANA_FEED_MS). Con un cursor
--     viejo (una noche sin mensajes) una lectura vacía devuelve has_more y un
--     cursor 1 h más adelante, y el gate sigue en verdadero. La edge sigue
--     leyendo mientras las páginas vengan vacías y haya has_more, dentro de su
--     presupuesto, y guarda el cursor al salir. Cuando llega al día, el feed deja
--     el cursor en el borde de los 10 s y el turno siguiente da falso;
--   * si el feed o el chequeo de la persona fallan, pone next_attempt_at con la
--     misma espera creciente de los reintentos (nunca reintenta en el turno
--     siguiente); si la falla es permanente (más de 500 conversaciones) detiene
--     el endpoint con config_error.
--
-- No mira la llave: la edge la revisa en cada vuelta, y revocarla ya lo detiene
-- (api_webhooks_por_llave). Medido en prod el 26/09 para la persona de las llaves
-- de hoy (30 conversaciones): 32 bloques, 0,23 ms.
create or replace function public.api_webhooks_con_trabajo()
returns setof uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select e.id
    from public.api_webhook_endpoints e
   where e.status = 'active'
     and (e.lease_until is null or e.lease_until <= now())
     and e.next_attempt_at <= now()
     and (select count(*) from public.tenants) = 1
     and (
       exists (select 1 from public.api_webhook_deliveries d
                where d.endpoint_id = e.id
                  and d.state = 'pending'
                  and d.event_type = 'messages.created')
       or exists (select 1
                    from public.chat_participants p
                    join public.chat_messages m on m.conversation_id = p.conversation_id
                   where p.user_id = e.acts_as_user_id
                     and m.created_at >= e.cursor_at
                     and m.created_at <= now() - interval '10 seconds'
                     and (not e.exclude_own or m.sender_id <> e.acts_as_user_id))
     );
$$;

-- Lo que corre el cron cada 15 s antes de despertar a la edge. plpgsql a
-- propósito: planifica cada sentencia recién al llegar a ella, así que sin
-- endpoints listos (ninguno, o todos parados, reclamados o esperando) es una
-- lectura de una tabla chica y nunca se planifica la consulta sobre chat.
create or replace function public.api_webhooks_hay_trabajo()
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.api_webhook_endpoints
                  where status = 'active'
                    and next_attempt_at <= now()
                    and (lease_until is null or lease_until <= now())) then
    return false;
  end if;
  return exists (select 1 from public.api_webhooks_con_trabajo());
end;
$$;

-- La edge reclama hasta _max endpoints con trabajo por _lease_s segundos. Dos
-- corridas que se pisan no agarran el mismo MIENTRAS DURE EL RECLAMO: SKIP
-- LOCKED salta el que la otra tiene tomado, y las condiciones del reclamo
-- (activo, sin reclamar, con el turno vencido) van sobre la fila que se bloquea,
-- así que se vuelven a mirar con su versión más nueva si la otra corrida la
-- acaba de reclamar. Vencido el reclamo, otra corrida puede tomarlo: la edge
-- escribe condicionada a su reclamo y a que siga activo
-- (.eq('lease_until', el que le devolvió esto).eq('status', 'active')) y, si no
-- toca ninguna fila, lo perdió o lo pararon: no escribe ni manda nada más.
-- manage-api-keys (PR 3) nunca le mueve el cursor a un endpoint activo: la prueba
-- activa solo desde pending (.eq('status','pending')) y Resume solo desde paused o
-- disabled; con 0 filas, "ya estaba activo".
--
-- FOR NO KEY UPDATE (y no FOR UPDATE): no choca con la verificación de la FK al
-- insertar una entrega, que toma FOR KEY SHARE sobre el endpoint.
create or replace function public.api_webhooks_reclamar(_max integer default 5, _lease_s integer default 60)
returns setof public.api_webhook_endpoints
language plpgsql
volatile
set search_path = public, pg_temp
as $$
begin
  if _max is null or _max < 1 or _max > 20 then
    raise exception 'webhooks: _max va de 1 a 20 (llegó %)', _max;
  end if;
  if _lease_s is null or _lease_s < 10 or _lease_s > 300 then
    raise exception 'webhooks: _lease_s va de 10 a 300 (llegó %)', _lease_s;
  end if;

  return query
  update public.api_webhook_endpoints e
     set lease_until = now() + make_interval(secs => _lease_s)
   where e.id in (
     select x.id
       from public.api_webhook_endpoints x
      where x.status = 'active'
        and (x.lease_until is null or x.lease_until <= now())
        and x.next_attempt_at <= now()
        and x.id in (select public.api_webhooks_con_trabajo())
      order by x.next_attempt_at, x.id
      limit _max
      for no key update skip locked)
  returning e.*;
end;
$$;

revoke all on function public.api_webhooks_host_de_url(text) from public, anon, authenticated;
revoke all on function public.api_webhooks_llave_no_sirve(public.api_keys) from public, anon, authenticated;
revoke all on function public.api_webhook_endpoints_alta() from public, anon, authenticated, service_role;
revoke all on function public.api_webhook_endpoints_cambio() from public, anon, authenticated, service_role;
revoke all on function public.api_webhook_deliveries_alta() from public, anon, authenticated, service_role;
revoke all on function public.api_webhook_deliveries_cambio() from public, anon, authenticated, service_role;
revoke all on function public.api_webhooks_detener(text, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.api_webhooks_por_agencias() from public, anon, authenticated, service_role;
revoke all on function public.api_webhooks_por_baja() from public, anon, authenticated, service_role;
revoke all on function public.api_webhooks_por_llave() from public, anon, authenticated, service_role;
revoke all on function public.api_webhooks_con_trabajo() from public, anon, authenticated;
revoke all on function public.api_webhooks_hay_trabajo() from public, anon, authenticated, service_role;
revoke all on function public.api_webhooks_reclamar(integer, integer) from public, anon, authenticated;
-- La edge (service_role) valida URLs antes de guardar y reclama trabajo. Los
-- triggers de las tablas corren con los permisos de quien escribe (service_role),
-- así que también necesita las dos funciones de validación.
grant execute on function public.api_webhooks_host_de_url(text) to service_role;
grant execute on function public.api_webhooks_llave_no_sirve(public.api_keys) to service_role;
grant execute on function public.api_webhooks_con_trabajo() to service_role;
grant execute on function public.api_webhooks_reclamar(integer, integer) to service_role;

-- ─── 8. limpieza diaria de las entregas (14 días) ────────────────────────────

create or replace function public.app_purgar_entregas_webhooks(p_dias integer default 14, p_tope integer default 10000)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  _n integer;
begin
  if p_dias is null or p_dias < 1 then
    raise exception 'p_dias tiene que ser al menos 1 (llegó %)', p_dias;
  end if;
  if p_tope is null or p_tope < 1 then
    raise exception 'p_tope tiene que ser positivo (llegó %)', p_tope;
  end if;
  -- Un TIMBRE pendiente es trabajo vivo, no historia: no se borra por viejo. Una
  -- PRUEBA pendiente sí: no se reintenta, así que si quedó pendiente es porque la
  -- edge se cortó a mitad del envío.
  delete from public.api_webhook_deliveries
   where id in (
     select id from public.api_webhook_deliveries
      where created_at < now() - make_interval(days => p_dias)
        and (state <> 'pending' or event_type = 'webhook.test')
      order by created_at
      limit p_tope);
  get diagnostics _n = row_count;
  return _n;
end;
$$;

revoke all on function public.app_purgar_entregas_webhooks(integer, integer) from public, anon, authenticated, service_role;

-- 3:40 de la mañana en Bogotá, diez minutos después de la del historial del cron.
select cron.unschedule('purgar-entregas-webhooks')
where exists (select 1 from cron.job where jobname = 'purgar-entregas-webhooks');

select cron.schedule(
  'purgar-entregas-webhooks',
  '40 8 * * *',
  $cron$ select public.app_purgar_entregas_webhooks(14, 10000); $cron$
);
