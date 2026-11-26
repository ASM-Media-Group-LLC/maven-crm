-- NUEVO CLIENTE DE VERDAD (25/11/2026). ⚠️ SOLO PARA EL EDIFICIO maven-agencias
-- (ezeigddgkaemxpshghmu). NUNCA en Kash. Requiere 20261119210500_arbol.sql,
-- 20261119211000_arbol_funciones.sql y 20261120090500_cobros.sql.
--
-- Lo que decidió Alvaro (docs/organizaciones-como-lumina-mapa-y-propuesta.md, tandas
-- del 24 y 25/11):
--   · Sin «clientes de clientes»: una organización = UNA empresa = UN espacio (tenant)
--     escondido. Maven crea la organización e invita SOLO al Dueño.
--   · El alta pide lo básico (empresa, Dueño, correo, idioma). Lo demás va en la FICHA,
--     que Maven le pregunta a Alvaro con botones, una por una, en cada cliente: no hay
--     números fijos de prueba ni de gracia.
--   · Nace «En preparación». «Activar» no deja pasar hasta que la ficha esté contestada,
--     el setup pagado o regalado y, si se pidió, el contrato firmado. Al activar sale la
--     invitación al Dueño (la manda la función «plataforma»).
--   · Crean y activan Alvaro y Grace; precios, setup, días de prueba y de gracia, forma
--     de cobro y precio de silla extra: SOLO Alvaro (dueño de la plataforma).
--
-- Nuevo aquí:
--   1. organizaciones.idioma y organizaciones.ficha (la ficha NO se lee directo por la
--      API: trae dinero; se lee con ficha_de_organizacion).
--   2. crear_cliente(nombre, idioma, es_demo): la organización + su único espacio.
--   3. ficha_faltantes / ficha_de_organizacion / guardar_ficha.
--   4. activar_organizacion con los candados nuevos (reemplaza la del árbol).
--   5. pausar_organizacion / reactivar_organizacion / extender_prueba.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre). Devuelve activar_organizacion y
-- organizaciones_guarda a como estaban (las guarda nuevo_cliente_respaldo).
--| do $$ declare r record; begin for r in select sentencia from public.nuevo_cliente_respaldo order by orden loop execute r.sentencia; end loop; end $$;
--| drop table public.nuevo_cliente_respaldo;
--| drop function if exists public.extender_prueba(uuid, int);
--| drop function if exists public.reactivar_organizacion(uuid);
--| drop function if exists public.pausar_organizacion(uuid, text);
--| drop function if exists public.guardar_ficha(uuid, jsonb);
--| drop function if exists public.ficha_de_organizacion(uuid);
--| drop function if exists public.ficha_faltantes(uuid);
--| drop function if exists public.crear_cliente(text, text, boolean);
--| alter table public.organizaciones drop column if exists ficha;
--| alter table public.organizaciones drop column if exists idioma;
--| drop function if exists public.ficha_claves_de_dinero();

-- ─── 0. Candado: esto no es Kash ─────────────────────────────────────────────
do $$
begin
  if exists (select 1 from public.tenants where id = '30869615-f579-4981-8a1f-dbebc61eae2d') then
    raise exception 'nuevo_cliente: esta base tiene el tenant de Kash; esta migración es SOLO para el edificio maven-agencias';
  end if;
end $$;

-- Respaldo de las dos funciones que se reescriben, para la vuelta atrás.
create table public.nuevo_cliente_respaldo (
  orden     int generated always as identity primary key,
  que       text not null,
  sentencia text not null
);
alter table public.nuevo_cliente_respaldo enable row level security;
revoke all on table public.nuevo_cliente_respaldo from public, anon, authenticated;
insert into public.nuevo_cliente_respaldo (que, sentencia)
select 'funcion ' || p.proname, pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('activar_organizacion', 'organizaciones_guarda');
do $$
begin
  if (select count(*) from public.nuevo_cliente_respaldo) <> 2 then
    raise exception 'nuevo_cliente: esperaba activar_organizacion y organizaciones_guarda del árbol';
  end if;
end $$;

-- ─── 1. Columnas ─────────────────────────────────────────────────────────────
alter table public.organizaciones
  add column idioma text not null default 'es' check (idioma in ('es', 'en')),
  -- {montaje, pide_contrato, contrato_firmado_at, dias_prueba, dias_gracia, forma_cobro,
  --  setup_usd, setup_estado, silla_extra_usd, pausa:{motivo, at}}
  add column ficha jsonb not null default '{}'::jsonb;

comment on column public.organizaciones.ficha is
  'Ficha del cliente que Maven le pregunta a Alvaro al prepararlo. Trae dinero: se lee con ficha_de_organizacion (sin montos para Grace) y se cambia con guardar_ficha.';

-- idioma sí se lee (va en la invitación); ficha NO (como plan y cobro).
grant select (idioma) on public.organizaciones to authenticated;

-- Las claves de dinero de la ficha: solo el dueño de la plataforma las ve y las cambia.
create function public.ficha_claves_de_dinero()
returns text[]
language sql
immutable
as $$
  select array['dias_prueba', 'dias_gracia', 'forma_cobro', 'setup_usd', 'setup_estado', 'silla_extra_usd']
$$;
revoke all on function public.ficha_claves_de_dinero() from public, anon;
grant execute on function public.ficha_claves_de_dinero() to authenticated, service_role;

-- ─── 2. Crear el cliente: la organización y su único espacio ────────────────
create function public.crear_cliente(_nombre text, _idioma text default 'es', _es_demo boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
  _n text := btrim(coalesce(_nombre, ''));
begin
  if not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso: solo Maven crea clientes';
  end if;
  if length(_n) < 2 or length(_n) > 120 then
    raise exception using errcode = '22023', message = 'nombre_invalido: el nombre de la empresa va de 2 a 120 letras';
  end if;
  if coalesce(_idioma, 'es') not in ('es', 'en') then
    raise exception using errcode = '22023', message = 'idioma_invalido';
  end if;
  insert into public.organizaciones (nombre, slug, tipo, plan, marca, es_demo, creada_por, idioma)
  values (_n, public.arbol_slug(_n), 'normal', '{}'::jsonb, '{}'::jsonb, coalesce(_es_demo, false),
          (select auth.uid()), coalesce(_idioma, 'es'))
  returning id into _id;
  -- Su único espacio (escondido para el cliente): ahí vive su gente. Sillas = las del
  -- plan (0 hasta que se conteste la ficha).
  insert into public.tenants (slug, name, organizacion_id, sillas)
  values (public.arbol_slug(_n), _n, _id, 0);
  -- El historial sin montos (Grace también lo lee).
  perform public.arbol_anotar(_id, null, 'cliente_creado', jsonb_build_object('nombre', _n, 'idioma', coalesce(_idioma, 'es'), 'es_demo', coalesce(_es_demo, false)));
  return _id;
end;
$$;

-- ─── 3. La ficha ─────────────────────────────────────────────────────────────

-- Lo que falta contestar o resolver para poder activar (claves estables; la pantalla
-- las traduce). «dueno» = falta el Dueño del cliente.
create function public.ficha_faltantes(_org uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _o public.organizaciones;
  _f jsonb;
  _faltan text[] := '{}';
begin
  if not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso: la ficha es de Maven';
  end if;
  select * into _o from public.organizaciones where id = _org;
  if _o.id is null then
    raise exception using errcode = 'P0002', message = 'cliente_no_existe';
  end if;
  _f := coalesce(_o.ficha, '{}'::jsonb);
  if not exists (select 1 from public.organizacion_admins a where a.organizacion_id = _org and a.principal) then
    _faltan := _faltan || 'dueno'::text;
  end if;
  if coalesce((_o.plan ->> 'personas')::numeric, 0) <= 0 or not (_o.plan ? 'nombre') then
    _faltan := _faltan || 'plan'::text;
  end if;
  if not (_o.plan ? 'precio_usd') then _faltan := _faltan || 'precio'::text; end if;
  if not (_f ? 'dias_prueba') then _faltan := _faltan || 'dias_prueba'::text; end if;
  if not (_f ? 'dias_gracia') then _faltan := _faltan || 'dias_gracia'::text; end if;
  if not (_f ? 'forma_cobro') then _faltan := _faltan || 'forma_cobro'::text; end if;
  if not (_f ? 'setup_usd') then
    _faltan := _faltan || 'setup'::text;
  elsif (_f ->> 'setup_usd')::numeric > 0 and coalesce(_f ->> 'setup_estado', 'pendiente') not in ('pagado', 'regalado') then
    -- El setup se cobra ANTES de activar (tanda 25/11).
    _faltan := _faltan || 'setup_sin_pagar'::text;
  end if;
  if not (_f ? 'silla_extra_usd') then _faltan := _faltan || 'silla_extra'::text; end if;
  if not (_f ? 'montaje') then _faltan := _faltan || 'montaje'::text; end if;
  if not (_f ? 'pide_contrato') then
    _faltan := _faltan || 'contrato'::text;
  elsif (_f ->> 'pide_contrato')::boolean and not (_f ? 'contrato_firmado_at') then
    _faltan := _faltan || 'contrato_sin_firmar'::text;
  end if;
  return _faltan;
end;
$$;

-- La ficha como la puede ver quien llama: completa para Alvaro; sin dinero para Grace.
create function public.ficha_de_organizacion(_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _o public.organizaciones;
  _f jsonb;
  _dueno boolean := public.arbol_soy_dueno_plataforma();
  _faltan text[];
  _k text;
begin
  if not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso: la ficha es de Maven';
  end if;
  select * into _o from public.organizaciones where id = _org;
  if _o.id is null then
    raise exception using errcode = 'P0002', message = 'cliente_no_existe';
  end if;
  _f := coalesce(_o.ficha, '{}'::jsonb);
  _faltan := public.ficha_faltantes(_org);
  if not _dueno then
    foreach _k in array public.ficha_claves_de_dinero() loop
      _f := _f - _k;
    end loop;
  end if;
  return jsonb_build_object(
    'organizacion_id', _o.id,
    'nombre', _o.nombre,
    'estado', _o.estado,
    'idioma', _o.idioma,
    'es_demo', _o.es_demo,
    'plan', public.arbol_plan_visible(_org, _o.plan),
    'ficha', _f,
    'prueba_hasta', case when _dueno then _o.cobro ->> 'prueba_hasta' end,
    've_dinero', _dueno,
    'faltan', to_jsonb(_faltan));
end;
$$;

-- Guardar una o varias respuestas de la ficha. Claves:
--   plan_nombre ('equipo'|'empresa'|'enterprise'), personas (1..10000)   → Maven (Alvaro y Grace)
--   precio_usd (0..1000000)                                               → solo Alvaro
--   dias_prueba (0..365), dias_gracia (0..90), forma_cobro ('link'|'factura'|'suscripcion'),
--   setup_usd (0..1000000), setup_estado ('pendiente'|'pagado'|'regalado'),
--   silla_extra_usd (0..10000)                                            → solo Alvaro
--   montaje ('maven'|'cliente'), pide_contrato (bool), contrato_firmado (bool) → Maven
create function public.guardar_ficha(_org uuid, _cambios jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _o public.organizaciones;
  _c jsonb := coalesce(_cambios, '{}'::jsonb);
  _f jsonb;
  _plan jsonb;
  _k text;
  _n numeric;
  _personas int;
  _antes int;
  _anotar jsonb := '{}'::jsonb;
  _permitidas text[] := array['plan_nombre', 'personas', 'precio_usd', 'dias_prueba', 'dias_gracia', 'forma_cobro',
                              'setup_usd', 'setup_estado', 'silla_extra_usd', 'montaje', 'pide_contrato', 'contrato_firmado'];
begin
  if not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso: la ficha es de Maven';
  end if;
  if jsonb_typeof(_c) <> 'object' then
    raise exception using errcode = '22023', message = 'ficha_invalida';
  end if;
  for _k in select jsonb_object_keys(_c) loop
    if not (_k = any (_permitidas)) then
      raise exception using errcode = '22023', message = format('ficha_invalida: «%s» no es parte de la ficha', _k);
    end if;
    if (_k = 'precio_usd' or _k = any (public.ficha_claves_de_dinero())) and not public.arbol_soy_dueno_plataforma() then
      raise exception using errcode = '42501', message = 'solo_dueno: precios y cobros los pone el dueño de la plataforma';
    end if;
  end loop;

  select * into _o from public.organizaciones where id = _org for update;
  if _o.id is null then
    raise exception using errcode = 'P0002', message = 'cliente_no_existe';
  end if;
  if _o.estado = 'archivada' then
    raise exception using errcode = 'P0001', message = 'cliente_archivado';
  end if;
  _f := coalesce(_o.ficha, '{}'::jsonb);
  _plan := coalesce(_o.plan, '{}'::jsonb);

  -- El plan (nombre, personas, precio) vive en organizaciones.plan, como siempre.
  if _c ? 'plan_nombre' then
    if _c ->> 'plan_nombre' not in ('equipo', 'empresa', 'enterprise') then
      raise exception using errcode = '22023', message = 'ficha_invalida: plan';
    end if;
    _plan := _plan || jsonb_build_object('nombre', _c ->> 'plan_nombre',
      'argos_usd_mes', case _c ->> 'plan_nombre' when 'equipo' then 20 else 50 end);
    _anotar := _anotar || jsonb_build_object('plan', _c ->> 'plan_nombre');
  end if;
  if _c ? 'personas' then
    _n := (_c ->> 'personas')::numeric;
    if _n is null or _n < 1 or _n > 10000 or _n <> trunc(_n) then
      raise exception using errcode = '22023', message = 'ficha_invalida: personas';
    end if;
    _plan := _plan || jsonb_build_object('personas', _n::int);
    _anotar := _anotar || jsonb_build_object('personas', _n::int);
  end if;
  if _c ? 'precio_usd' then
    _n := (_c ->> 'precio_usd')::numeric;
    if _n is null or _n < 0 or _n > 1000000 then
      raise exception using errcode = '22023', message = 'ficha_invalida: precio';
    end if;
    _plan := _plan || jsonb_build_object('precio_usd', _n);
  end if;

  -- Números de la ficha.
  foreach _k in array array['dias_prueba', 'dias_gracia', 'setup_usd', 'silla_extra_usd'] loop
    if _c ? _k then
      _n := (_c ->> _k)::numeric;
      if _n is null or _n < 0
         or (_k = 'dias_prueba' and (_n > 365 or _n <> trunc(_n)))
         or (_k = 'dias_gracia' and (_n > 90 or _n <> trunc(_n)))
         or (_k = 'setup_usd' and _n > 1000000)
         or (_k = 'silla_extra_usd' and _n > 10000) then
        raise exception using errcode = '22023', message = format('ficha_invalida: %s', _k);
      end if;
      _f := _f || jsonb_build_object(_k, _n);
    end if;
  end loop;
  if _c ? 'forma_cobro' then
    if _c ->> 'forma_cobro' not in ('link', 'factura', 'suscripcion') then
      raise exception using errcode = '22023', message = 'ficha_invalida: forma_cobro';
    end if;
    _f := _f || jsonb_build_object('forma_cobro', _c ->> 'forma_cobro');
  end if;
  if _c ? 'setup_estado' then
    if _c ->> 'setup_estado' not in ('pendiente', 'pagado', 'regalado') then
      raise exception using errcode = '22023', message = 'ficha_invalida: setup_estado';
    end if;
    _f := _f || jsonb_build_object('setup_estado', _c ->> 'setup_estado',
                                   'setup_estado_at', now(), 'setup_estado_por', (select auth.uid()));
  end if;
  -- Sin setup no hay nada que pagar.
  if (_f ? 'setup_usd') and (_f ->> 'setup_usd')::numeric = 0 then
    _f := _f - 'setup_estado' - 'setup_estado_at' - 'setup_estado_por';
  elsif (_f ? 'setup_usd') and not (_f ? 'setup_estado') then
    _f := _f || jsonb_build_object('setup_estado', 'pendiente');
  end if;
  if _c ? 'montaje' then
    if _c ->> 'montaje' not in ('maven', 'cliente') then
      raise exception using errcode = '22023', message = 'ficha_invalida: montaje';
    end if;
    _f := _f || jsonb_build_object('montaje', _c ->> 'montaje');
    _anotar := _anotar || jsonb_build_object('montaje', _c ->> 'montaje');
  end if;
  if _c ? 'pide_contrato' then
    if jsonb_typeof(_c -> 'pide_contrato') <> 'boolean' then
      raise exception using errcode = '22023', message = 'ficha_invalida: pide_contrato';
    end if;
    _f := _f || jsonb_build_object('pide_contrato', (_c ->> 'pide_contrato')::boolean);
    if not (_c ->> 'pide_contrato')::boolean then
      _f := _f - 'contrato_firmado_at';
    end if;
  end if;
  if _c ? 'contrato_firmado' then
    if jsonb_typeof(_c -> 'contrato_firmado') <> 'boolean' then
      raise exception using errcode = '22023', message = 'ficha_invalida: contrato_firmado';
    end if;
    if (_c ->> 'contrato_firmado')::boolean then
      _f := _f || jsonb_build_object('contrato_firmado_at', coalesce(_f ->> 'contrato_firmado_at', now()::text));
      _anotar := _anotar || jsonb_build_object('contrato_firmado', true);
    else
      _f := _f - 'contrato_firmado_at';
    end if;
  end if;

  -- Las sillas del único espacio siguen al plan. Si sube: primero el plan; si baja:
  -- primero el espacio (los candados del árbol no dejan pasar el paquete ni bajar de lo usado).
  _personas := coalesce((_plan ->> 'personas')::numeric, 0)::int;
  _antes := coalesce((_o.plan ->> 'personas')::numeric, 0)::int;
  if _personas < _antes then
    update public.tenants set sillas = _personas where organizacion_id = _org and archivada_at is null;
  end if;
  update public.organizaciones set ficha = _f, plan = _plan where id = _org;
  if _personas > _antes then
    update public.tenants set sillas = _personas where organizacion_id = _org and archivada_at is null;
  end if;

  -- Historial sin montos (lo lee también el equipo de Maven).
  perform public.arbol_anotar(_org, null, 'ficha_cambiada',
    _anotar || jsonb_build_object('claves', (select jsonb_agg(k) from jsonb_object_keys(_c) k)));
  return public.ficha_de_organizacion(_org);
end;
$$;

-- ─── 4. Activar, con los candados nuevos ─────────────────────────────────────
-- Reemplaza la del árbol (misma firma). Solo saca de «En preparación»: reactivar una
-- cuenta pausada es reactivar_organizacion. Pone el reloj de la prueba con los días de
-- ESTE cliente. Después, la función «plataforma» manda la invitación al Dueño.
create or replace function public.activar_organizacion(_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _o public.organizaciones;
  _faltan text[];
  _dias int;
  _prueba timestamptz;
begin
  if not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso: solo Maven activa clientes';
  end if;
  select * into _o from public.organizaciones where id = _org for update;
  if _o.id is null then
    raise exception using errcode = 'P0002', message = 'cliente_no_existe';
  end if;
  if _o.estado <> 'preparacion' then
    raise exception using errcode = 'P0001', message = format('estado_invalido: el cliente está %s', _o.estado);
  end if;
  _faltan := public.ficha_faltantes(_org);
  if cardinality(_faltan) > 0 then
    raise exception using errcode = 'P0001', message = 'faltan_pendientes: ' || array_to_string(_faltan, ', ');
  end if;
  _dias := coalesce((_o.ficha ->> 'dias_prueba')::numeric, 0)::int;
  _prueba := case when _dias > 0 then now() + make_interval(days => _dias) end;
  -- Directo (no por cobros_actualizar): Grace también activa, y esto no es un precio.
  update public.organizaciones
     set estado = 'activa',
         activada_at = coalesce(activada_at, now()),
         cobro = jsonb_strip_nulls(cobro || jsonb_build_object(
                   'prueba_hasta', _prueba,
                   'dias_gracia', coalesce((_o.ficha ->> 'dias_gracia')::numeric, 0)::int,
                   'forma_cobro', _o.ficha ->> 'forma_cobro',
                   'estado_pago', case when _prueba is not null then 'en_prueba' else 'por_cobrar' end,
                   'activada_at', now()))
   where id = _org;
  perform public.arbol_anotar(_org, null, 'cliente_activado', jsonb_build_object('dias_prueba', _dias));
  return jsonb_build_object('ok', true, 'estado', 'activa');
end;
$$;

-- El trigger organizaciones_guarda exige ser el dueño para tocar «cobro». Activar lo
-- hace también Grace: que la guarda deje pasar el cambio de cobro HECHO POR activar
-- (solo prueba/gracia/forma/estado de pago con los valores de la ficha, en el paso
-- preparación → activa).
create or replace function public.organizaciones_guarda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _repartidas int;
  _activando boolean := old.estado = 'preparacion' and new.estado = 'activa'
    and (new.cobro - 'prueba_hasta' - 'dias_gracia' - 'forma_cobro' - 'estado_pago' - 'activada_at')
        is not distinct from (old.cobro - 'prueba_hasta' - 'dias_gracia' - 'forma_cobro' - 'estado_pago' - 'activada_at');
begin
  if not public.arbol_soy_plataforma() and (
       new.plan is distinct from old.plan or new.cobro is distinct from old.cobro
       or new.estado is distinct from old.estado or new.tipo is distinct from old.tipo
       or new.es_demo is distinct from old.es_demo or new.slug is distinct from old.slug
       or new.activada_at is distinct from old.activada_at
       or new.ficha is distinct from old.ficha or new.idioma is distinct from old.idioma) then
    raise exception using errcode = '42501', message = 'solo_plataforma: el paquete, el cobro y el estado del cliente los cambia Maven';
  end if;
  -- Precios y cobros: solo el dueño de la plataforma (Grace no). Las personas y el
  -- nombre del plan sí los mueve el equipo.
  if not public.arbol_soy_dueno_plataforma() and (
       (new.cobro is distinct from old.cobro and not _activando)
       or (new.plan - 'personas' - 'nombre' - 'argos_usd_mes') is distinct from (old.plan - 'personas' - 'nombre' - 'argos_usd_mes')
       or exists (select 1 from unnest(public.ficha_claves_de_dinero()) k
                   where (new.ficha -> k) is distinct from (old.ficha -> k))) then
    raise exception using errcode = '42501', message = 'solo_dueno: precios y cobros los cambia el dueño de la plataforma';
  end if;
  if new.plan is distinct from old.plan then
    select coalesce(sum(t.sillas), 0) into _repartidas
      from public.tenants t where t.organizacion_id = new.id and t.archivada_at is null;
    if coalesce((new.plan ->> 'personas')::numeric, 0) < _repartidas then
      raise exception using errcode = 'P0001',
        message = format('paquete_menor: el cliente ya repartió %s sillas; el paquete no puede quedar en %s', _repartidas, coalesce(new.plan ->> 'personas', '0'));
    end if;
  end if;
  return new;
end;
$$;

-- ─── 5. Pausar, reactivar, extender la prueba ───────────────────────────────
create function public.pausar_organizacion(_org uuid, _motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _o public.organizaciones;
begin
  if not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso: solo Maven pausa clientes';
  end if;
  select * into _o from public.organizaciones where id = _org for update;
  if _o.id is null then
    raise exception using errcode = 'P0002', message = 'cliente_no_existe';
  end if;
  if _o.estado not in ('activa', 'bloqueada') then
    raise exception using errcode = 'P0001', message = format('estado_invalido: el cliente está %s', _o.estado);
  end if;
  update public.organizaciones
     set estado = 'pausada',
         ficha = ficha || jsonb_build_object('pausa', jsonb_build_object('motivo', left(coalesce(_motivo, ''), 300), 'at', now(), 'por', (select auth.uid())))
   where id = _org;
  perform public.arbol_anotar(_org, null, 'cliente_pausado', jsonb_build_object('motivo', left(coalesce(_motivo, ''), 300)));
  return jsonb_build_object('ok', true, 'estado', 'pausada');
end;
$$;

create function public.reactivar_organizacion(_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _o public.organizaciones;
begin
  if not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso: solo Maven reactiva clientes';
  end if;
  select * into _o from public.organizaciones where id = _org for update;
  if _o.id is null then
    raise exception using errcode = 'P0002', message = 'cliente_no_existe';
  end if;
  if _o.estado <> 'pausada' then
    raise exception using errcode = 'P0001', message = format('estado_invalido: el cliente está %s', _o.estado);
  end if;
  update public.organizaciones set estado = 'activa', ficha = ficha - 'pausa' where id = _org;
  perform public.arbol_anotar(_org, null, 'cliente_reactivado', '{}'::jsonb);
  return jsonb_build_object('ok', true, 'estado', 'activa');
end;
$$;

-- Más días de prueba (cuentan desde hoy o desde el fin de la prueba, lo que sea más tarde).
create function public.extender_prueba(_org uuid, _dias int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _o public.organizaciones;
  _hasta timestamptz;
begin
  if not public.arbol_soy_dueno_plataforma() then
    raise exception using errcode = '42501', message = 'solo_dueno: la prueba la extiende el dueño de la plataforma';
  end if;
  if _dias is null or _dias < 1 or _dias > 365 then
    raise exception using errcode = '22023', message = 'dias_invalidos';
  end if;
  select * into _o from public.organizaciones where id = _org for update;
  if _o.id is null then
    raise exception using errcode = 'P0002', message = 'cliente_no_existe';
  end if;
  if _o.estado = 'archivada' then
    raise exception using errcode = 'P0001', message = 'cliente_archivado';
  end if;
  _hasta := greatest(coalesce(nullif(_o.cobro ->> 'prueba_hasta', '')::timestamptz, now()), now()) + make_interval(days => _dias);
  update public.organizaciones
     set cobro = cobro || jsonb_build_object('prueba_hasta', _hasta, 'estado_pago',
                   case when coalesce(cobro ->> 'estado_pago', '') in ('', 'por_cobrar', 'en_prueba') then 'en_prueba' else cobro ->> 'estado_pago' end)
   where id = _org;
  perform public.arbol_anotar(_org, null, 'prueba_extendida', jsonb_build_object('dias', _dias));
  return jsonb_build_object('ok', true, 'prueba_hasta', _hasta);
end;
$$;

-- ─── 6. Quién puede llamar qué ───────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.crear_cliente(text, text, boolean)',
    'public.ficha_faltantes(uuid)',
    'public.ficha_de_organizacion(uuid)',
    'public.guardar_ficha(uuid, jsonb)',
    'public.activar_organizacion(uuid)',
    'public.pausar_organizacion(uuid, text)',
    'public.reactivar_organizacion(uuid)',
    'public.extender_prueba(uuid, int)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
