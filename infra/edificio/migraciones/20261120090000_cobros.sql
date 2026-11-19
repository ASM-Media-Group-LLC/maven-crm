-- VAGÓN 7 · COBROS CON STRIPE, BLOQUEO POR PAGO Y LA PUERTA (19/11/2026, tanda 8).
-- ⚠️ SOLO PARA EL EDIFICIO maven-agencias (ezeigddgkaemxpshghmu). NUNCA en Kash.
-- Va DESPUÉS de 20261119210000_arbol.sql y
-- 20261119211000_arbol_funciones.sql. Spec: docs/maven-como-lumina-spec.md (tandas 5, 7 y 8).
-- Banco: infra/edificio/tests/arbol.ts (sección «Cobros»).
--
-- Qué trae:
--   1. organizaciones.estado suma «bloqueada» (pago vencido: nadie entra, nada se borra).
--   2. precios_plataforma: los precios de la portada en una tabla (plan Equipo/Empresa,
--      setup, recarga de Argos 25 → 50, días de prueba y de gracia) + los ids de Stripe.
--      Los lee cualquiera (son los de la portada); los cambia solo el dueño de la plataforma.
--   3. stripe_eventos: cada evento del webhook UNA vez (idempotencia por id de Stripe).
--   4. puerta_intentos: tope por IP del directorio y del registro (sin enumerar correos).
--   5. Funciones: cobros_actualizar (el webhook), cobros_mi_acceso (al entrar),
--      cobros_debe_bloquear / cobros_bloquear_vencidos (reloj), cobros_desbloquear (dueño),
--      argos_acreditar_plan_de (crédito del mes al pagar la factura),
--      argos_acreditar_planes_sin_stripe (reloj del día 1 para quien paga por fuera),
--      directorio_es_del_edificio (la puerta), puerta_contar (el tope).
--   6. Una recarga de Stripe no se acredita dos veces (índice por referencia).
--   7. organizaciones_externas.fuente ('kash') para que refrescar-externas actualice su fila.
--   8. Relojes: bloquear vencidos (cada hora), créditos del mes sin Stripe (día 1),
--      refrescar Kash (cada 15 min) y limpieza de intentos. Solo si hay pg_cron y edificio_llamar.
--
-- El cobro vive en organizaciones.cobro (jsonb), que solo lee el dueño y el admin de
-- ESE cliente (plan_de_organizacion). Llaves que usa Maven:
--   stripe_customer_id, stripe_subscription_id, stripe_status, estado_pago
--   ('pendiente_checkout' | 'prueba' | 'al_dia' | 'pago_fallido' | 'cancelada' | 'por_fuera'),
--   prueba_hasta, gracia_hasta, ultimo_pago_at, bloqueada_at, origen ('registro' | 'dueno'),
--   y las opciones especiales del dueño: dias_gratis, sin_tarjeta, sin_setup, precio_a_medida.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre):
--| do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then
--|   perform cron.unschedule(j) from unnest(array['cobros-bloquear', 'argos-planes-sin-stripe', 'refrescar-externas', 'puerta-intentos-limpieza']) j
--|    where exists (select 1 from cron.job where jobname = j); end if; end $$;
--| drop function if exists public.directorio_es_del_edificio(text);
--| drop function if exists public.puerta_contar(text, int, int);
--| drop function if exists public.argos_acreditar_planes_sin_stripe(date);
--| drop function if exists public.argos_acreditar_plan_de(uuid, text);
--| drop function if exists public.cobros_desbloquear(uuid, int);
--| drop function if exists public.cobros_bloquear_vencidos();
--| drop function if exists public.cobros_debe_bloquear(text, jsonb, timestamptz);
--| drop function if exists public.cobros_mi_acceso();
--| drop function if exists public.cobros_actualizar(uuid, jsonb, text);
--| drop function if exists public.stripe_evento_tomar(text, text);
--| drop function if exists public.stripe_evento_cerrar(text, uuid, jsonb, text);
--| drop index if exists public.argos_mov_recarga_ref_idx;
--| alter table public.organizaciones_externas drop column if exists fuente;
--| drop table if exists public.puerta_intentos;
--| drop table if exists public.stripe_eventos;
--| drop table if exists public.precios_plataforma;
--| update public.organizaciones set estado = 'pausada' where estado = 'bloqueada';
--| alter table public.organizaciones drop constraint organizaciones_estado_check;
--| alter table public.organizaciones add constraint organizaciones_estado_check check (estado in ('preparacion', 'activa', 'pausada', 'archivada'));

-- ─── 0. Candado: esto no es Kash ─────────────────────────────────────────────
do $$
begin
  if exists (select 1 from public.tenants where id = '30869615-f579-4981-8a1f-dbebc61eae2d') then
    raise exception 'cobros: esta base tiene el tenant de Kash; esta migración es SOLO para el edificio maven-agencias';
  end if;
  if to_regclass('public.organizaciones') is null or to_regproc('public.argos_acreditar') is null then
    raise exception 'cobros: falta el árbol (20261119210000_arbol.sql y 20261119211000_arbol_funciones.sql)';
  end if;
end $$;

-- ─── 1. «Bloqueada»: pago vencido. Nadie entra; no se borra nada ────────────
alter table public.organizaciones drop constraint organizaciones_estado_check;
alter table public.organizaciones add constraint organizaciones_estado_check
  check (estado in ('preparacion', 'activa', 'pausada', 'archivada', 'bloqueada'));

-- ─── 2. Precios de la plataforma (los de la portada) ────────────────────────
create table public.precios_plataforma (
  clave           text primary key,
  valor           jsonb not null,
  actualizado_at  timestamptz not null default now(),
  actualizado_por uuid
);
comment on table public.precios_plataforma is
  'Precios de Maven (los de la portada) y los ids de Stripe. Los lee cualquiera; los cambia solo el dueño de la plataforma.';
alter table public.precios_plataforma enable row level security;
create policy precios_plataforma_sel on public.precios_plataforma
  for select to anon, authenticated using (true);
create policy precios_plataforma_dueno on public.precios_plataforma
  for all to authenticated
  using (public.es_dueno_de_plataforma())
  with check (public.es_dueno_de_plataforma());

insert into public.precios_plataforma (clave, valor) values
  ('plan_equipo',   '{"precio_usd": 299, "personas": 20, "argos_usd_mes": 20}'),
  ('plan_empresa',  '{"precio_usd": 599, "personas": 50, "argos_usd_mes": 50}'),
  ('setup',         '{"usd": 3000}'),
  ('recarga_argos', '{"paga_usd": 25, "credito_usd": 50, "max_por_compra": 20}'),
  ('prueba',        '{"dias": 14}'),
  ('gracia',        '{"dias": 7}'),
  -- Los ids de los productos y precios de Stripe (los llena cobros-stripe «preparar-productos»).
  ('stripe',        '{}')
on conflict (clave) do nothing;

-- ─── 3. Eventos de Stripe: cada uno una vez ──────────────────────────────────
create table public.stripe_eventos (
  id              text primary key,
  tipo            text not null,
  organizacion_id uuid references public.organizaciones(id) on delete set null,
  recibido_at     timestamptz not null default now(),
  procesado_at    timestamptz,
  resultado       jsonb,
  error           text
);
create index stripe_eventos_org_idx on public.stripe_eventos (organizacion_id, recibido_at desc);
alter table public.stripe_eventos enable row level security;
revoke all on table public.stripe_eventos from public, anon, authenticated;

-- 'nuevo' = procesarlo; 'repetido' = ya se procesó (200 y nada más);
-- 'reintento' = llegó antes y falló: se procesa otra vez.
create function public.stripe_evento_tomar(_id text, _tipo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _r public.stripe_eventos;
begin
  if not public.arbol_soy_dueno_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  insert into public.stripe_eventos (id, tipo) values (_id, _tipo) on conflict (id) do nothing;
  if found then return 'nuevo'; end if;
  select * into _r from public.stripe_eventos where id = _id for update;
  if _r.procesado_at is not null then return 'repetido'; end if;
  return 'reintento';
end;
$$;

create function public.stripe_evento_cerrar(_id text, _org uuid, _resultado jsonb, _error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.arbol_soy_dueno_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  update public.stripe_eventos
     set organizacion_id = coalesce(_org, organizacion_id),
         resultado = _resultado,
         error = _error,
         procesado_at = case when _error is null then now() end
   where id = _id;
end;
$$;

-- ─── 4. El tope de la puerta (directorio y registro) ────────────────────────
create table public.puerta_intentos (
  clave   text not null,
  ventana timestamptz not null,
  n       int not null default 0,
  primary key (clave, ventana)
);
alter table public.puerta_intentos enable row level security;
revoke all on table public.puerta_intentos from public, anon, authenticated;

-- true = puede seguir. La clave la arma la edge (huella de la IP + qué puerta).
create function public.puerta_contar(_clave text, _tope int, _minutos int default 10)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _v timestamptz := to_timestamp(floor(extract(epoch from now()) / (greatest(_minutos, 1) * 60)) * greatest(_minutos, 1) * 60);
  _n int;
begin
  if not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  insert into public.puerta_intentos (clave, ventana, n) values (_clave, _v, 1)
  on conflict (clave, ventana) do update set n = public.puerta_intentos.n + 1
  returning n into _n;
  return _n <= _tope;
end;
$$;

-- ¿Este correo vive en el edificio? Solo un sí/no; solo el servidor (la edge directorio).
create function public.directorio_es_del_edificio(_correo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.arbol_soy_plataforma()
     and exists (select 1 from auth.users u where lower(u.email) = lower(btrim(coalesce(_correo, ''))))
$$;

-- ─── 5. El cobro del cliente ─────────────────────────────────────────────────

-- Junta lo nuevo con lo que había (una llave en null se borra) y, si se pide, cambia
-- el estado (activa ↔ bloqueada, o preparacion → activa al registrarse). Solo el
-- dueño de la plataforma o el servidor (webhook).
create function public.cobros_actualizar(_org uuid, _cobro jsonb, _estado text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _o public.organizaciones;
begin
  if not public.arbol_soy_dueno_plataforma() then
    raise exception using errcode = '42501', message = 'solo_dueno: el cobro lo cambia el dueño de la plataforma (o Stripe)';
  end if;
  if _estado is not null and _estado not in ('activa', 'bloqueada') then
    raise exception using errcode = '22023', message = 'estado_invalido';
  end if;
  select * into _o from public.organizaciones where id = _org for update;
  if _o.id is null then
    raise exception using errcode = 'P0002', message = 'cliente_no_existe';
  end if;
  update public.organizaciones
     set cobro = jsonb_strip_nulls(cobro || coalesce(_cobro, '{}'::jsonb)),
         estado = case
           when _estado is null then estado
           -- Archivado o pausado a mano por Maven: Stripe no lo cambia.
           when estado in ('archivada', 'pausada') then estado
           else _estado end,
         activada_at = case when _estado = 'activa' then coalesce(activada_at, now()) else activada_at end
   where id = _org
   returning * into _o;
  perform public.arbol_anotar(_org, null, 'cobro', jsonb_build_object('cambios', coalesce(_cobro, '{}'::jsonb), 'estado', _o.estado));
  return jsonb_build_object('estado', _o.estado, 'cobro', _o.cobro);
end;
$$;

-- La misma regla que cobros-stripe/logica.ts (debeBloquear): pago fallido o
-- suscripción cancelada y la gracia ya pasó.
create function public.cobros_debe_bloquear(_estado text, _cobro jsonb, _ahora timestamptz default now())
returns boolean
language sql
stable
as $$
  select _estado = 'activa'
     and coalesce(_cobro ->> 'estado_pago', '') in ('pago_fallido', 'cancelada')
     and (_cobro ->> 'gracia_hasta') is not null
     and (_cobro ->> 'gracia_hasta')::timestamptz <= _ahora
$$;

-- El reloj de cada hora: los que se pasaron de la gracia quedan bloqueados.
create function public.cobros_bloquear_vencidos()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  _n int := 0;
  r record;
begin
  if not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  for r in
    select o.id from public.organizaciones o
     where public.cobros_debe_bloquear(o.estado, o.cobro, now())
     for update
  loop
    update public.organizaciones
       set estado = 'bloqueada',
           cobro = cobro || jsonb_build_object('bloqueada_at', now())
     where id = r.id;
    perform public.arbol_anotar(r.id, null, 'cliente_bloqueado', jsonb_build_object('motivo', 'pago'));
    _n := _n + 1;
  end loop;
  return _n;
end;
$$;

-- El dueño desbloquea a mano (y da más días de gracia, para que el reloj no lo vuelva
-- a bloquear en la hora). Grace no: es cobro.
create function public.cobros_desbloquear(_org uuid, _dias_gracia int default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.arbol_soy_dueno_plataforma() then
    raise exception using errcode = '42501', message = 'solo_dueno';
  end if;
  return public.cobros_actualizar(_org,
    jsonb_build_object('gracia_hasta', now() + make_interval(days => greatest(coalesce(_dias_gracia, 7), 0)), 'bloqueada_at', null),
    'activa');
end;
$$;

-- Al entrar a Maven: ¿mi empresa puede entrar? La usan la app (pantalla de bloqueo) y
-- nada más. La plataforma nunca queda bloqueada. Un fallo NO es «bloqueada»: la app
-- deja pasar si esto no responde.
create function public.cobros_mi_acceso()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _yo uuid := (select auth.uid());
  _org uuid;
  _admin boolean := false;
  _o public.organizaciones;
  _t public.tenants;
  _motivo text;
  _gracia timestamptz;
begin
  if _yo is null then
    return jsonb_build_object('bloqueada', false);
  end if;
  if public.es_admin_de_plataforma() then
    return jsonb_build_object('bloqueada', false, 'plataforma', true);
  end if;
  select a.organizacion_id into _org
    from public.organizacion_admins a where a.user_id = _yo
   order by a.principal desc, a.created_at asc limit 1;
  _admin := _org is not null;
  if _org is null then
    _org := public.mi_organizacion();
    select * into _t from public.tenants where id = public.current_tenant_id();
  end if;
  if _org is null then
    return jsonb_build_object('bloqueada', false);
  end if;
  select * into _o from public.organizaciones where id = _org;
  _gracia := nullif(_o.cobro ->> 'gracia_hasta', '')::timestamptz;

  _motivo := case
    when _o.estado = 'archivada' then 'archivada'
    when _o.estado = 'pausada' then 'pausada'
    when _o.estado = 'bloqueada' or public.cobros_debe_bloquear(_o.estado, _o.cobro, now()) then 'pago'
    when coalesce(_o.cobro ->> 'estado_pago', '') = 'pendiente_checkout' then 'falta_tarjeta'
    -- Agencia pausada por el admin del cliente: nadie de ella entra (tanda 6).
    when not _admin and _t.pausada_at is not null then 'agencia_pausada'
    when not _admin and _t.archivada_at is not null then 'archivada'
  end;

  return jsonb_build_object(
    'bloqueada', _motivo is not null,
    'motivo', _motivo,
    'organizacion_id', _o.id,
    'nombre', _o.nombre,
    'puedo_pagar', _admin,
    'estado_pago', _o.cobro ->> 'estado_pago',
    'gracia_hasta', _gracia,
    'en_gracia', _motivo is null and coalesce(_o.cobro ->> 'estado_pago', '') in ('pago_fallido', 'cancelada') and _gracia > now(),
    'prueba_hasta', _o.cobro ->> 'prueba_hasta');
end;
$$;

-- ─── 6. Créditos de Argos que vienen de Stripe ──────────────────────────────

-- Una recarga de Stripe (referencia = el pago) se acredita una sola vez.
create unique index argos_mov_recarga_ref_idx on public.argos_saldo_movimientos (referencia)
  where tipo = 'recarga' and referencia is not null;

-- El crédito del plan del mes para UN cliente (al pagar su factura). Una vez por mes
-- (argos_mov_plan_mes_idx); si ya estaba, no hace nada. Se acumula con lo que quedaba.
create function public.argos_acreditar_plan_de(_org uuid, _referencia text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _usd numeric;
  _b uuid;
  _periodo date := date_trunc('month', now())::date;
  _r public.argos_saldo;
  _nuevo boolean := false;
begin
  if not public.arbol_soy_dueno_plataforma() then
    raise exception using errcode = '42501', message = 'solo_dueno';
  end if;
  select coalesce((o.plan ->> 'argos_usd_mes')::numeric, 0) into _usd from public.organizaciones o where o.id = _org;
  if _usd is null then
    raise exception using errcode = 'P0002', message = 'cliente_no_existe';
  end if;
  insert into public.argos_saldo (organizacion_id) values (_org) on conflict do nothing;
  select id into _b from public.argos_saldo where organizacion_id = _org;
  perform 1 from public.argos_saldo where id = _b for update;
  if _usd > 0 then
    insert into public.argos_saldo_movimientos (billetera_id, tipo, usd, periodo, referencia, detalle)
    values (_b, 'plan_mensual', _usd, _periodo, _referencia, jsonb_build_object('plan', true, 'stripe', _referencia is not null))
    on conflict do nothing;
    _nuevo := found;
  end if;
  if _nuevo then
    perform public.arbol_anotar(_org, null, 'argos_credito', jsonb_build_object('tipo', 'plan_mensual', 'usd', _usd, 'referencia', _referencia));
  end if;
  select * into _r from public.argos_saldo where id = _b;
  return jsonb_build_object('acreditado', _nuevo, 'usd', case when _nuevo then _usd else 0 end, 'saldo_usd', _r.saldo_usd, 'pausado', _r.pausado);
end;
$$;

-- Día 1: el crédito del mes para los clientes activos que NO pagan por Stripe (alta del
-- dueño «por fuera»). Los de Stripe lo reciben al pagar su factura (invoice.paid).
create function public.argos_acreditar_planes_sin_stripe(_mes date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  _periodo date := date_trunc('month', coalesce(_mes, now()::date))::date;
  _n int := 0;
  r record;
begin
  if not public.arbol_soy_dueno_plataforma() then
    raise exception using errcode = '42501', message = 'solo_dueno';
  end if;
  for r in
    select o.id, (o.plan ->> 'argos_usd_mes')::numeric as usd
      from public.organizaciones o
     where o.estado = 'activa'
       and coalesce((o.plan ->> 'argos_usd_mes')::numeric, 0) > 0
       and coalesce(o.cobro ->> 'stripe_subscription_id', '') = ''
  loop
    insert into public.argos_saldo (organizacion_id) values (r.id) on conflict do nothing;
    insert into public.argos_saldo_movimientos (billetera_id, tipo, usd, periodo, detalle)
    select b.id, 'plan_mensual', r.usd, _periodo, jsonb_build_object('plan', true, 'stripe', false)
      from public.argos_saldo b where b.organizacion_id = r.id
    on conflict do nothing;
    if found then _n := _n + 1; end if;
  end loop;
  return _n;
end;
$$;

-- ─── 7. Kash (y otras de afuera): una fila por fuente ───────────────────────
alter table public.organizaciones_externas add column fuente text unique;
comment on column public.organizaciones_externas.fuente is
  'De dónde sale el resumen (kash = la función kash-resumen de Kash, solo lectura). La refresca la edge refrescar-externas.';

-- ─── 8. Quién puede llamar qué ───────────────────────────────────────────────
do $$
declare
  f text;
begin
  -- Solo el servidor (la llave de servicio de las edges) y los relojes.
  foreach f in array array[
    'public.stripe_evento_tomar(text, text)',
    'public.stripe_evento_cerrar(text, uuid, jsonb, text)',
    'public.puerta_contar(text, int, int)',
    'public.directorio_es_del_edificio(text)',
    'public.cobros_actualizar(uuid, jsonb, text)',
    'public.cobros_bloquear_vencidos()',
    'public.argos_acreditar_plan_de(uuid, text)',
    'public.argos_acreditar_planes_sin_stripe(date)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  -- Desde la app: la pantalla de bloqueo y el botón del dueño.
  foreach f in array array[
    'public.cobros_mi_acceso()',
    'public.cobros_desbloquear(uuid, int)',
    'public.cobros_debe_bloquear(text, jsonb, timestamptz)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ─── 9. Relojes (solo si el edificio tiene pg_cron y edificio_llamar) ───────
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'cobros: sin pg_cron, los relojes no se crean';
    return;
  end if;
  execute $c$select cron.schedule('cobros-bloquear', '7 * * * *', 'select public.cobros_bloquear_vencidos()')$c$;
  execute $c$select cron.schedule('argos-planes-sin-stripe', '10 5 1 * *', 'select public.argos_acreditar_planes_sin_stripe()')$c$;
  execute $c$select cron.schedule('puerta-intentos-limpieza', '40 9 * * *', 'delete from public.puerta_intentos where ventana < now() - interval ''1 day''')$c$;
  if to_regproc('public.edificio_llamar') is not null then
    execute $c$select cron.schedule('refrescar-externas', '*/15 * * * *', 'select public.edificio_llamar(''refrescar-externas'', ''{}''::jsonb, 30000)')$c$;
  else
    raise notice 'cobros: falta edificio_llamar (relojes del edificio); refrescar-externas no se programa';
  end if;
end $$;
