-- Cada API key pertenece a UNA agencia, y la decide la base, no el cliente.
--
-- POR QUÉ. `api_keys` no tenía columna de agencia: una llave era de una persona
-- (`created_by`), no de una agencia. El API pública corre con service_role, así
-- que no había ninguna capa que supiera de qué agencia devolver datos. Con una
-- sola agencia en Maven eso es invisible —todo le pertenece— y el día que entre
-- la segunda, cualquier llave le devolvería los datos de la otra.
--
-- DISEÑO.
--  * `tenant_id` NOT NULL con FK a tenants.
--  * La agencia la ASIGNA un trigger a partir de quién crea la llave, leyendo
--    `tenant_members` (la misma fuente que `current_tenant_id()`). El cliente no
--    elige: si manda una, tiene que ser una agencia de quien la crea, o falla.
--  * Una llave NO puede cambiar de agencia después de creada.
--  * Compatible hacia atrás: el `manage-api-keys` desplegado hoy inserta sin
--    tenant_id, y el trigger se lo completa. Por eso esta migración se puede
--    aplicar ANTES de desplegar las funciones nuevas sin romper nada.
--
-- ⚠️ ORDEN: esta migración va ANTES del merge. public-api nueva pide la columna
--    tenant_id; si se desplegara primero, respondería 503 a todas las llaves.

-- public-api lee api_keys en CADA pedido. Si algo tiene tomada la tabla, mejor que
-- esta migración falle rápido a que haga esperar a las integraciones en vivo.
set local lock_timeout = '3s';

alter table public.api_keys
  add column if not exists tenant_id uuid references public.tenants(id);

-- Antes de rellenar: cada creador tiene que estar en EXACTAMENTE una agencia. Con
-- dos, el UPDATE ... FROM de abajo elegiría una al azar — y una llave asignada a la
-- agencia equivocada es la fuga que esto viene a cerrar. Es la misma regla que
-- aplica el trigger a las llaves nuevas.
do $$
begin
  if exists (
    select 1 from public.api_keys k
     where (select count(*) from public.tenant_members tm where tm.user_id = k.created_by) <> 1
  ) then
    raise exception 'api_keys: hay llaves cuyo creador no está en exactamente una agencia';
  end if;
end $$;

-- Relleno: la agencia de cada llave es la de quien la creó.
update public.api_keys k
   set tenant_id = tm.tenant_id
  from public.tenant_members tm
 where tm.user_id = k.created_by
   and k.tenant_id is null;

-- Si alguna llave quedó sin agencia no se sigue: una llave huérfana es
-- exactamente una llave imposible de aislar.
do $$
begin
  if exists (select 1 from public.api_keys where tenant_id is null) then
    raise exception 'api_keys: quedaron llaves sin agencia después del relleno';
  end if;
end $$;

-- La agencia la decide la base.
create or replace function public.api_keys_asignar_agencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if new.created_by is null then
    raise exception 'api_keys: una llave tiene que tener creador para saber de qué agencia es';
  end if;

  if new.tenant_id is not null then
    -- Viene explícita: tiene que ser una agencia de quien la crea.
    if not exists (
      select 1 from public.tenant_members
       where user_id = new.created_by and tenant_id = new.tenant_id
    ) then
      raise exception 'api_keys: la agencia indicada no es una agencia de quien crea la llave';
    end if;
    return new;
  end if;

  select count(*) into n from public.tenant_members where user_id = new.created_by;
  if n = 0 then
    raise exception 'api_keys: quien crea la llave no pertenece a ninguna agencia';
  elsif n > 1 then
    -- Adivinar acá es justo cómo se termina entregando la agencia equivocada.
    raise exception 'api_keys: quien crea la llave pertenece a varias agencias; hay que indicar tenant_id';
  end if;

  select tenant_id into new.tenant_id
    from public.tenant_members where user_id = new.created_by;
  return new;
end;
$$;

create or replace function public.api_keys_agencia_inmutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'api_keys: una llave no puede cambiar de agencia';
  end if;
  return new;
end;
$$;

-- Funciones de trigger: no tienen por qué poder ejecutarse sueltas.
revoke all on function public.api_keys_asignar_agencia() from public, anon, authenticated;
revoke all on function public.api_keys_agencia_inmutable() from public, anon, authenticated;

drop trigger if exists api_keys_asignar_agencia on public.api_keys;
create trigger api_keys_asignar_agencia
  before insert on public.api_keys
  for each row execute function public.api_keys_asignar_agencia();

drop trigger if exists api_keys_agencia_inmutable on public.api_keys;
create trigger api_keys_agencia_inmutable
  before update of tenant_id on public.api_keys
  for each row execute function public.api_keys_agencia_inmutable();

alter table public.api_keys alter column tenant_id set not null;

create index if not exists api_keys_tenant_id_idx on public.api_keys (tenant_id);
