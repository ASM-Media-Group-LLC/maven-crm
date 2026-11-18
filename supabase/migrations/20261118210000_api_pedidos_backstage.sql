-- PEDIDOS DE PERSONALIZADOS DESDE BACKSTAGE (Alvaro, 18/11/2026): «todas las
-- operaciones y la logística se mantienen en Backstage; Maven solo recibe el
-- contenido y le deja saber a Backstage que ya lo tiene».
--
--   1. Backstage crea el pedido (POST /public-api/contenido/pedidos): número,
--      modelo, qué grabar y fecha límite. Entra directo como «aprobado» (lo
--      aprobó Backstage) y Maven devuelve el link del pedido.
--   2. El link es un /aportar/<token> de tipo 'pedido': la modelo lo abre sin
--      cuenta, ve qué tiene que grabar y sube a la carpeta del pedido
--      (Personalizados/Pedido <número> dentro de su carpeta del Drive).
--   3. Backstage consulta (GET …/pedidos/{id} o …/pedidos?cambiados_desde=) si
--      ya subió, cuándo y qué archivos, con miniatura y link para verlos.
--
-- La ficha del pedido es la de siempre (custom_requests): el equipo la ve en
-- Personalizados como cualquier otro. Esta tabla solo la ata a la llave de
-- Backstage, a su número y al link. Solo la toca la edge public-api y la edge
-- drive-aporte (service_role).

-- Las bases de prueba parciales (bancos PGlite) no traen estas tablas: ahí la
-- parte de tablas se salta (las funciones se crean igual, no tocan nada).
do $$
begin
  if to_regclass('public.custom_requests') is null or to_regclass('public.drive_upload_links') is null
     or to_regclass('public.drive_items') is null or to_regclass('public.api_keys') is null
     or to_regclass('public.creators') is null or to_regclass('public.tenants') is null then
    return;
  end if;

  execute 'alter table public.drive_upload_links drop constraint if exists drive_upload_links_tipo_valido';
  execute $q$alter table public.drive_upload_links
    add constraint drive_upload_links_tipo_valido check (tipo in ('subir', 'personal', 'invitado', 'ver', 'pedido'))$q$;

  execute $q$
  create table if not exists public.api_pedidos (
    request_id      uuid primary key references public.custom_requests(id) on delete cascade,
    tenant_id       uuid not null references public.tenants(id),
    api_key_id      uuid not null references public.api_keys(id) on delete cascade,
    -- El número del pedido en Backstage.
    referencia      text not null check (char_length(referencia) between 1 and 120),
    creator_id      uuid not null references public.creators(id) on delete cascade,
    carpeta_item_id uuid not null references public.drive_items(id) on delete cascade,
    link_token      text not null unique references public.drive_upload_links(token) on delete cascade,
    -- Cuándo llegó el primer archivo (null = todavía nada).
    subido_at       timestamptz,
    -- Para «¿qué cambió desde…?»: se mueve al crear, con cada archivo y estado.
    actualizado     timestamptz not null default now(),
    created_at      timestamptz not null default now(),
    unique (api_key_id, referencia)
  )$q$;
  execute 'create index if not exists api_pedidos_cambios_idx on public.api_pedidos (api_key_id, actualizado)';
  execute 'create index if not exists api_pedidos_carpeta_idx on public.api_pedidos (carpeta_item_id)';
  execute 'alter table public.api_pedidos enable row level security';
  -- Sin políticas: nadie la lee desde el navegador.
  execute 'revoke all on public.api_pedidos from anon, authenticated';
  execute $q$comment on table public.api_pedidos is
    'Pedidos de personalizados creados por la API pública (/contenido/pedidos, Backstage). Ver supabase/functions/public-api/pedidos.ts.'$q$;
end $$;

-- «¿Qué cambió desde…?» también se mueve cuando un archivo del pedido queda
-- listo para ver (pasó al NAS) o se borra, y cuando el pedido cambia de estado
-- (la modelo no puede, el equipo lo cancela). Nunca frena lo que lo dispara.

create or replace function public.api_pedidos_tocar_por_archivo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tipo = 'archivo' and new.parent_id is not null
     and (new.estado is distinct from old.estado or new.trashed_at is distinct from old.trashed_at) then
    update public.api_pedidos set actualizado = now() where carpeta_item_id = new.parent_id;
  end if;
  return new;
exception when others then
  raise warning 'api_pedidos_tocar_por_archivo: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.api_pedidos_tocar_por_archivo() from public, anon, authenticated;


create or replace function public.api_pedidos_tocar_por_estado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    update public.api_pedidos set actualizado = now() where request_id = new.id;
  end if;
  return new;
exception when others then
  raise warning 'api_pedidos_tocar_por_estado: %', sqlerrm;
  return new;
end;
$$;
revoke all on function public.api_pedidos_tocar_por_estado() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.api_pedidos') is null then
    return;
  end if;
  execute 'drop trigger if exists api_pedidos_tocar_por_archivo on public.drive_items';
  execute 'create trigger api_pedidos_tocar_por_archivo after update of estado, trashed_at on public.drive_items for each row execute function public.api_pedidos_tocar_por_archivo()';
  execute 'drop trigger if exists api_pedidos_tocar_por_estado on public.custom_requests';
  execute 'create trigger api_pedidos_tocar_por_estado after update of status on public.custom_requests for each row execute function public.api_pedidos_tocar_por_estado()';
end $$;

-- ── El aviso a Backstage: «ya subió» (Alvaro, 18/11/2026: «cuando termine de
-- cargar el video en Maven, le dice a Backstage… así sabemos que están al día
-- las dos») ──────────────────────────────────────────────────────────────────
-- Va por el MISMO webhook firmado que los avisos del equipo (una suscripción por
-- llave, Standard Webhooks, reintentos), con un evento nuevo:
-- contenido.pedido_subido. Sale cuando un archivo del pedido queda listo para
-- ver (ya en el Drive), solo a la suscripción de la llave que creó el pedido.
-- Si suben varios seguidos, la ventana de 20 s los junta en un solo aviso.
do $$
begin
  if to_regclass('public.integracion_equipo_webhooks') is null or to_regclass('public.api_pedidos') is null then
    return;
  end if;
  execute 'alter table public.integracion_equipo_webhooks drop constraint if exists integracion_equipo_webhooks_eventos';
  execute $q$alter table public.integracion_equipo_webhooks add constraint integracion_equipo_webhooks_eventos check (
    cardinality(eventos) between 1 and 4
    and eventos <@ array['equipo.persona_entro', 'equipo.persona_salio', 'equipo.rol_cambio', 'contenido.pedido_subido']::text[])$q$;
  execute 'alter table public.integracion_equipo_entregas drop constraint if exists integracion_equipo_entregas_evento_check';
  execute $q$alter table public.integracion_equipo_entregas add constraint integracion_equipo_entregas_evento_check check (
    evento in ('equipo.persona_entro', 'equipo.persona_salio', 'equipo.rol_cambio', 'contenido.pedido_subido', 'webhook.test'))$q$;
end $$;

-- Registrar el webhook acepta también contenido.pedido_subido (por defecto
-- siguen los tres del equipo).
create or replace function public.equipo_webhook_crear(_api_key_id uuid, _url text, _eventos text[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  _t uuid := public.equipo_agencia_que_administro();
  _yo uuid := auth.uid();
  _k public.api_keys;
  _ev text[];
  _url_final text;
  _host text;
  _id uuid := gen_random_uuid();
  _secreto text;
  _sid uuid;
  _w public.integracion_equipo_webhooks;
begin
  select * into _k from public.api_keys k where k.id = _api_key_id and k.tenant_id = _t;
  if not found then
    raise exception using errcode = 'P0002', message = 'llave_no_existe: no hay una API key con ese id en tu agencia';
  end if;
  if _k.revoked_at is not null or (_k.expires_at is not null and _k.expires_at <= now()) then
    raise exception using errcode = '22023', message = 'llave_no_vigente: la API key está revocada o vencida';
  end if;
  if not ('equipo:write' = any (_k.scopes)) then
    raise exception using errcode = '22023', message = 'llave_sin_equipo: la API key no tiene el permiso equipo:write';
  end if;

  _ev := coalesce(_eventos, array['equipo.persona_entro', 'equipo.persona_salio', 'equipo.rol_cambio']);
  _ev := array(select distinct e from unnest(_ev) e where e is not null order by e);
  if cardinality(_ev) = 0
     or not (_ev <@ array['equipo.persona_entro', 'equipo.persona_salio', 'equipo.rol_cambio', 'contenido.pedido_subido']::text[]) then
    raise exception using errcode = '22023',
      message = 'eventos_invalidos: los eventos son equipo.persona_entro, equipo.persona_salio, equipo.rol_cambio y contenido.pedido_subido';
  end if;
  if 'contenido.pedido_subido' = any (_ev) and not ('contenido:write' = any (_k.scopes)) then
    raise exception using errcode = '22023', message = 'llave_sin_contenido: la API key no tiene el permiso contenido:write';
  end if;

  -- La URL como la manda la edge en cada envío (new URL(x).href): sin :443 y con la
  -- barra después del host. La forma la valida la misma regla de los webhooks del
  -- Messenger; los hosts prohibidos los vuelve a mirar la edge en CADA envío.
  _url_final := btrim(coalesce(_url, ''));
  _url_final := regexp_replace(_url_final, '^(https://[^/?#]*):443(?=[/?]|$)', '\1');
  if _url_final ~ '^https://[^/?#]+$' then
    _url_final := _url_final || '/';
  elsif _url_final ~ '^https://[^/?#]+\?' then
    _url_final := regexp_replace(_url_final, '^(https://[^/?#]+)\?', '\1/?');
  end if;
  begin
    _host := public.api_webhooks_host_de_url(_url_final);
  exception when others then
    raise exception using errcode = '22023', message = 'url_invalida: ' || replace(sqlerrm, 'webhooks: ', '');
  end;

  if exists (select 1 from public.integracion_equipo_webhooks w where w.api_key_id = _k.id) then
    raise exception using errcode = '23505', message = 'ya_tiene_webhook: esa API key ya tiene un webhook del equipo';
  end if;

  _secreto := 'whsec_' || encode(decode(
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64');
  _sid := vault.create_secret(_secreto, 'equipo_webhook_' || _id::text, 'Firma del webhook del equipo');

  insert into public.integracion_equipo_webhooks
    (id, tenant_id, api_key_id, url, url_host, eventos, secreto_id, secret_last4, created_by)
  values
    (_id, _t, _k.id, _url_final, _host, _ev, _sid, right(_secreto, 4), _yo)
  returning * into _w;

  return public.equipo_webhook_json(_w) || jsonb_build_object('secreto', _secreto);
end;
$function$;

-- Encola (o actualiza, si todavía no salió) el «ya subió» de un pedido, con sus
-- archivos listos. Los links para verlos los da GET /contenido/pedidos/{id}
-- (firmados y con vencimiento: no viajan en el aviso).
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
  select w.id, w.tenant_id into _w from public.integracion_equipo_webhooks w
   where w.api_key_id = _p.api_key_id and w.tenant_id = _p.tenant_id and w.status = 'active'
     and 'contenido.pedido_subido' = any (w.eventos);
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

-- El archivo de un pedido cambió: «actualizado» se mueve, y si quedó listo para
-- ver, sale el aviso.
create or replace function public.api_pedidos_tocar_por_archivo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _req uuid;
begin
  if new.tipo = 'archivo' and new.parent_id is not null
     and (new.estado is distinct from old.estado or new.trashed_at is distinct from old.trashed_at) then
    update public.api_pedidos set actualizado = now() where carpeta_item_id = new.parent_id
    returning request_id into _req;
    if _req is not null and new.estado = 'listo' and new.trashed_at is null and old.estado is distinct from 'listo' then
      perform public.api_pedidos_avisar_subido(_req);
    end if;
  end if;
  return new;
exception when others then
  raise warning 'api_pedidos_tocar_por_archivo: %', sqlerrm;
  return new;
end;
$$;
