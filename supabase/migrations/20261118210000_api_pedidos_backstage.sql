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
