-- Cimientos del API de escritura: cada llave ACTÚA COMO un usuario real, y tiene
-- un límite de pedidos por hora.
--
-- 1. ACTÚA COMO. Decisión del 24/09: una llave queda atada a un usuario real y
--    consulta la base COMO él, con una sesión fabricada de 60 s. Así la RLS y los
--    triggers se aplican exactamente como si esa persona usara la app. Es lo que
--    permite abrir el Messenger por API sin reescribir su autorización: sus
--    políticas son 100% por participación, pero dos de sus guardias
--    (trg_guard_chat_message_update, trg_guard_chat_participant_update) se APARTAN
--    cuando no hay usuario — con service_role, una llave podría escribir a nombre
--    de cualquiera.
--
--    * acts_as_user_id NOT NULL. Las llaves que ya existen actúan como quien las
--      creó. ⚠️ Hoy las tres las creó el CEO: el día que tengan permisos de
--      Messenger, leerían SUS conversaciones. Por eso las llaves con permisos de
--      Messenger van a tener que elegir su usuario a propósito.
--    * La base exige que ese usuario sea de la MISMA agencia que la llave, y que
--      esté activo al crearla. Una llave de la agencia A no puede actuar como
--      alguien de la agencia B.
--    * Una llave NO cambia de identidad después de creada. Si hace falta otra,
--      se crea otra llave.
--
-- 2. LÍMITE POR HORA. Hoy no existe ninguno: una llave puede hacer un millón de
--    pedidos en una hora. Se cuenta en la misma escritura que ya hacía
--    increment_api_key_usage (request_count y last_used_at), así que NO agrega
--    carga a la base — que es justo lo que no se puede hacer después del 17/09 — y
--    pasado el límite ni siquiera escribe: rechaza leyendo.
--    Ventana fija por hora, 1.000 por defecto (55 veces el pico medido hoy: 18/h).
--
-- Compatible hacia atrás, para poder aplicarla ANTES de desplegar las funciones:
--    * increment_api_key_usage se queda (el public-api desplegado la llama).
--    * El manage-api-keys desplegado inserta sin acts_as_user_id: el trigger se
--      lo completa con created_by.

set local lock_timeout = '3s';

-- ─── 1. actúa como ────────────────────────────────────────────────────────────

-- ON DELETE CASCADE: una llave que actúa como alguien que ya no existe no puede
-- quedar viva. Es lo mismo que ya hace la purga (app_purge_user_refs borra las filas
-- cuya referencia a auth.users es NOT NULL); acá queda dicho en el esquema.
alter table public.api_keys
  add column if not exists acts_as_user_id uuid references auth.users(id) on delete cascade;

update public.api_keys
   set acts_as_user_id = created_by
 where acts_as_user_id is null;

do $$
begin
  if exists (select 1 from public.api_keys where acts_as_user_id is null) then
    raise exception 'api_keys: quedaron llaves sin usuario (created_by nulo)';
  end if;
  if exists (
    select 1 from public.api_keys k
     where not exists (
       select 1 from public.tenant_members tm
        where tm.user_id = k.acts_as_user_id and tm.tenant_id = k.tenant_id)
  ) then
    raise exception 'api_keys: hay llaves que actuarían como alguien de otra agencia';
  end if;
end $$;

-- Corre DESPUÉS de api_keys_asignar_agencia (los triggers del mismo evento van en
-- orden alfabético: "asignar" < "validar"), así que tenant_id ya está puesto.
create or replace function public.api_keys_validar_actua_como()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.acts_as_user_id is null then
    new.acts_as_user_id := new.created_by;
  end if;
  if new.acts_as_user_id is null then
    raise exception 'api_keys: una llave tiene que actuar como un usuario';
  end if;
  if not exists (
    select 1 from public.tenant_members
     where user_id = new.acts_as_user_id and tenant_id = new.tenant_id
  ) then
    raise exception 'api_keys: la llave no puede actuar como alguien de otra agencia';
  end if;
  if not exists (
    select 1 from public.profiles where id = new.acts_as_user_id and deleted_at is null
  ) then
    raise exception 'api_keys: el usuario como el que actúa la llave no está activo';
  end if;
  return new;
end;
$$;

create or replace function public.api_keys_actua_como_inmutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.acts_as_user_id is distinct from old.acts_as_user_id then
    raise exception 'api_keys: una llave no puede cambiar de identidad; creá otra';
  end if;
  return new;
end;
$$;

revoke all on function public.api_keys_validar_actua_como() from public, anon, authenticated;
revoke all on function public.api_keys_actua_como_inmutable() from public, anon, authenticated;

drop trigger if exists api_keys_validar_actua_como on public.api_keys;
create trigger api_keys_validar_actua_como
  before insert on public.api_keys
  for each row execute function public.api_keys_validar_actua_como();

drop trigger if exists api_keys_actua_como_inmutable on public.api_keys;
create trigger api_keys_actua_como_inmutable
  before update of acts_as_user_id on public.api_keys
  for each row execute function public.api_keys_actua_como_inmutable();

alter table public.api_keys alter column acts_as_user_id set not null;

-- ─── 2. límite por hora ───────────────────────────────────────────────────────

alter table public.api_keys
  add column if not exists limite_por_hora integer not null default 1000
    check (limite_por_hora > 0),
  add column if not exists ventana_inicio timestamptz,
  add column if not exists ventana_pedidos integer not null default 0;

-- Una sola escritura por pedido permitido: la misma que ya hacía
-- increment_api_key_usage, con la ventana sumada. Atómica: el UPDATE toma el lock de
-- la fila, así que dos pedidos simultáneos de la misma llave no pueden contarse como
-- uno (el segundo re-evalúa el WHERE sobre la fila ya actualizada).
--
-- ⚠️ PASADO EL LÍMITE NO SE ESCRIBE NADA: el pedido se rechaza LEYENDO. Si cada
-- rechazo escribiera, una llave desbocada convertiría su martilleo en escrituras
-- sobre la base —WAL, bloqueos, filas muertas— justo cuando más hay que protegerla.
-- No hace falta contar los rechazos para que sigan rechazados: en una ventana fija
-- el contador no baja hasta la hora siguiente.
--
-- También devuelve como quién actúa la llave y si esa persona sigue activa, en la
-- misma ida a la base: una llave de alguien dado de baja deja de servir, sin sumar
-- una consulta más por pedido. Y public-api no necesita pedir la columna nueva en la
-- búsqueda de la llave: si esta migración todavía no está, esa búsqueda sigue igual.
create or replace function public.api_key_consumir(_id uuid)
returns table (permitido boolean, limite integer, restantes integer, reinicio timestamptz,
               actua_como uuid, usuario_activo boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  _hora timestamptz := date_trunc('hour', now());
begin
  return query
  update public.api_keys k
     set ventana_pedidos = case when k.ventana_inicio = _hora then k.ventana_pedidos + 1 else 1 end,
         ventana_inicio  = _hora,
         request_count   = k.request_count + 1,
         last_used_at    = now()
   where k.id = _id
     and not (k.ventana_inicio is not distinct from _hora and k.ventana_pedidos >= k.limite_por_hora)
  returning true,
            k.limite_por_hora,
            greatest(k.limite_por_hora - k.ventana_pedidos, 0),
            _hora + interval '1 hour',
            k.acts_as_user_id,
            exists (select 1 from public.profiles p
                     where p.id = k.acts_as_user_id and p.deleted_at is null);
  if found then
    return;
  end if;

  -- Sin cupo (o la llave no existe: cero filas). Solo lectura.
  return query
  select false,
         k.limite_por_hora,
         0,
         _hora + interval '1 hour',
         k.acts_as_user_id,
         exists (select 1 from public.profiles p
                  where p.id = k.acts_as_user_id and p.deleted_at is null)
    from public.api_keys k
   where k.id = _id;
end;
$$;

revoke all on function public.api_key_consumir(uuid) from public, anon, authenticated;
grant execute on function public.api_key_consumir(uuid) to service_role;
