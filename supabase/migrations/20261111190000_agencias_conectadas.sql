-- AGENCIAS CONECTADAS (decisiones de Alvaro, 11/11/2026): la próxima agencia que
-- llegue conecta SU plataforma (la de RR. HH., como Backstage) sin pasar por nosotros.
-- Se apoya en 20261111120000_backstage_equipo.sql (el interruptor, la bitácora,
-- api_equipo_llave, api_equipo_estado y api_equipo_aplicar) y le suma:
--
--   1. LOS ROLES VIENEN DE LA PLATAFORMA. La plataforma manda su lista de roles y Maven
--      los crea con el mismo nombre en ESA agencia (roles_config.origen = 'plataforma').
--      No se inventa nada: un rol nuevo nace SIN permisos (no ve nada) hasta que el
--      dueño marca qué ve en Maven. Nunca se crea un rol de admin ni de dueño.
--      → api_equipo_roles, equipo_roles_sin_permisos.
--
--   2. QUIEN NO TIENE CUENTA QUEDA PENDIENTE. La persona que manda la plataforma y no
--      tiene cuenta en Maven queda en integracion_equipo_pendientes. El dueño o un admin
--      la aprueba con un clic (el frontend crea la cuenta con create_user de siempre y
--      después llama a equipo_pendiente_resolver) o la descarta; una descartada sigue
--      descartada en los envíos siguientes. → api_equipo_pendientes,
--      equipo_pendiente_resolver.
--
--   3. LO QUE MAVEN DEVUELVE:
--      · el equipo como quedó (GET /equipo, sobre api_equipo_estado, que ahora dice
--        también el origen de cada rol y si ya tiene permisos);
--      · horas y asistencia de Cowork (api_equipo_horas);
--      · la nota de Argos con su desglose (api_equipo_notas);
--      · avisos por webhook cuando alguien entra, sale (papelera) o cambia de rol, ya
--        sea por la plataforma o desde la app de Maven (integracion_equipo_webhooks).
--
-- POR QUÉ LOS WEBHOOKS NO VAN EN api_webhook_endpoints (los del Messenger). Ese sistema
-- es un «timbre» del feed del Messenger y está hecho para UNA sola agencia: un endpoint
-- solo nace de una llave con messenger:read, IPs fijas y vencimiento
-- (api_webhooks_llave_no_sirve); con dos o más agencias se detienen TODOS
-- (api_webhooks_por_agencias, multi_agency) y el despachador no manda nada; activo
-- exige un cursor del feed; y las entregas solo aceptan messages.created y
-- webhook.test. Meter aquí eventos que justamente tienen que andar con varias agencias
-- obligaba a cambiar cada una de esas reglas de un sistema en producción. Esto es la
-- versión genérica mínima: sus propias dos tablas, aisladas por agencia desde el
-- trigger que encola, con la MISMA firma (Standard Webhooks, _shared/webhook-salida.ts)
-- y el mismo envío protegido (IP verificada, sin redirecciones), que hace la misma edge
-- messenger-webhooks cuando la despierta su cron con ?tarea=equipo.
--
-- LA PARED ES LA BASE. Todo lo que pide una key pasa por api_equipo_llave (claim
-- `mvk`, scope equipo:write, persona vigente y admin o dueña de la agencia de la key) y
-- se cruza con ESA agencia: una key nunca ve ni toca otra. Lo que se maneja desde la
-- app pasa por current_tenant_id() y exige admin o dueño de esa agencia. Por eso
-- /equipo deja de apagarse con dos o más agencias (public-api/aislamiento.ts); el banco
-- supabase/tests/agencias_conectadas.ts lo prueba con dos agencias para cada RPC.

set local lock_timeout = '3s';

-- ─── 0. Piezas chicas ────────────────────────────────────────────────────────

-- Minúsculas, sin acentos y con un solo espacio: la misma comparación que hace la edge
-- (clave() en public-api/equipo-logica.ts) para decir que «Closer» y «closer» son el
-- mismo rol.
create or replace function public.equipo_clave(_s text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select btrim(regexp_replace(
    translate(lower(_s), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
    '\s+', ' ', 'g'));
$$;
revoke all on function public.equipo_clave(text) from public, anon, authenticated;

-- Quién puede manejar lo de la agencia desde la app: el dueño o un admin de ESA agencia
-- (la de la sesión). Devuelve la agencia; si no, corta con sin_permiso.
create or replace function public.equipo_agencia_que_administro()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _yo uuid := auth.uid();
  _t uuid := public.current_tenant_id();
begin
  if _yo is null or _t is null or not (
       exists (select 1 from public.tenant_owners o where o.tenant_id = _t and o.user_id = _yo)
       or exists (select 1 from public.user_roles ur
                   where ur.user_id = _yo and lower(ur.role) = 'admin' and ur.tenant_id = _t)) then
    raise exception using errcode = '42501',
      message = 'sin_permiso: solo el dueño o un admin de la agencia';
  end if;
  return _t;
end;
$$;
revoke all on function public.equipo_agencia_que_administro() from public, anon, authenticated;

-- ─── 1. Los roles que manda la plataforma ────────────────────────────────────

-- null = se hizo en Maven; 'plataforma' = llegó por la plataforma conectada.
alter table public.roles_config
  add column if not exists origen text
  constraint roles_config_origen check (origen is null or origen = 'plataforma');

comment on column public.roles_config.origen is
  'null = rol hecho en Maven; plataforma = lo creó la plataforma de la agencia (api_equipo_roles). Nace sin permisos.';

-- _roles: [ "Closer", { "nombre": "Chatter" }, … ] (hasta 50). Crea en la agencia de
-- la key los que falten: activos, con origen 'plataforma' y SIN filas en
-- role_permissions. Nunca un rol de admin ni de dueño. En ensayo (el pedido lo pide o
-- el interruptor de la agencia está apagado) no cambia nada: dice qué haría.
create or replace function public.api_equipo_roles(_roles jsonb, _ensayo boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _k public.api_keys := public.api_equipo_llave();
  _cfg public.integracion_equipo;
  _ensayo_final boolean;
  _x jsonb;
  _nombre text;
  _clave text;
  _vistos text[] := '{}';
  _rc record;
  _creados jsonb := '[]'::jsonb;
  _ya jsonb := '[]'::jsonb;
  _rechazados jsonb := '[]'::jsonb;
begin
  if _roles is null or jsonb_typeof(_roles) <> 'array' or jsonb_array_length(_roles) > 50 then
    raise exception 'api_equipo_roles: _roles tiene que ser una lista de hasta 50 roles';
  end if;

  -- Un envío a la vez por agencia (el mismo candado que api_equipo_aplicar).
  perform pg_advisory_xact_lock(hashtextextended('integracion_equipo:' || _k.tenant_id::text, 0));
  insert into public.integracion_equipo (tenant_id) values (_k.tenant_id) on conflict (tenant_id) do nothing;
  select * into _cfg from public.integracion_equipo c where c.tenant_id = _k.tenant_id;
  _ensayo_final := coalesce(_ensayo, false) or not _cfg.aplicar;

  for _x in select v from jsonb_array_elements(_roles) as a(v) loop
    _nombre := case jsonb_typeof(_x)
                 when 'string' then _x #>> '{}'
                 when 'object' then case when jsonb_typeof(_x -> 'nombre') = 'string' then _x ->> 'nombre' end
               end;
    if _nombre is not null then
      _nombre := btrim(regexp_replace(_nombre, '\s+', ' ', 'g'));
    end if;
    if _nombre is null or _nombre = '' or _nombre ~ '[[:cntrl:]]' then
      _rechazados := _rechazados || jsonb_build_object('nombre', left(coalesce(_nombre, _x::text), 120), 'motivo', 'nombre_invalido');
      continue;
    end if;
    if char_length(_nombre) > 60 then
      _rechazados := _rechazados || jsonb_build_object('nombre', left(_nombre, 120), 'motivo', 'nombre_muy_largo');
      continue;
    end if;
    _clave := public.equipo_clave(_nombre);
    -- El mismo rol dos veces en el envío («Closer» y «closer»): cuenta una sola.
    if _clave = any (_vistos) then
      continue;
    end if;
    _vistos := _vistos || _clave;

    -- Nada que Maven trate como admin: los nombres de admin y dueño, y cualquier rol
    -- que role_groups marque is_admin en esta agencia (lo que mira is_in_role_group).
    if _clave in ('admin', 'admins', 'administrador', 'administradora', 'administrator', 'superadmin', 'super admin',
                  'dueno', 'duena', 'owner', 'propietario', 'propietaria')
       or exists (select 1 from public.role_groups rg
                   where rg.tenant_id = _k.tenant_id and rg.is_admin and public.equipo_clave(rg.role_name) = _clave) then
      _rechazados := _rechazados || jsonb_build_object('nombre', _nombre, 'motivo', 'rol_de_admin');
      continue;
    end if;

    -- Ya lo resuelve el mapa de la agencia (integracion_equipo.mapa_roles).
    if exists (select 1 from jsonb_object_keys(_cfg.mapa_roles) as m(k) where public.equipo_clave(m.k) = _clave) then
      _ya := _ya || to_jsonb(_nombre);
      continue;
    end if;

    select rc.name, rc.is_active into _rc
      from public.roles_config rc
     where rc.tenant_id = _k.tenant_id and public.equipo_clave(rc.name) = _clave
     order by (rc.name = _nombre) desc, rc.is_active desc, rc.name
     limit 1;
    if found then
      if _rc.is_active then
        _ya := _ya || to_jsonb(_nombre);
      else
        -- Volver a prender un rol apagado lo decide una persona en Maven.
        _rechazados := _rechazados || jsonb_build_object('nombre', _nombre, 'motivo', 'rol_inactivo');
      end if;
      continue;
    end if;

    if not _ensayo_final then
      begin
        insert into public.roles_config (tenant_id, name, is_active, origen)
        values (_k.tenant_id, _nombre, true, 'plataforma');
      exception when others then
        _rechazados := _rechazados || jsonb_build_object('nombre', _nombre, 'motivo', 'error_de_base');
        continue;
      end;
    end if;
    _creados := _creados || to_jsonb(_nombre);
  end loop;

  return jsonb_build_object(
    'ensayo', _ensayo_final,
    'creados', _creados,
    'ya_estaban', _ya,
    'rechazados', _rechazados
  );
end;
$$;
revoke all on function public.api_equipo_roles(jsonb, boolean) from public, anon;
grant execute on function public.api_equipo_roles(jsonb, boolean) to authenticated;

-- Los roles que llegaron de la plataforma y todavía no ven nada en Maven (ninguna fila
-- de role_permissions con can_access): lo que el dueño tiene que configurar.
create or replace function public.equipo_roles_sin_permisos()
returns table (nombre text, creado_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _t uuid := public.equipo_agencia_que_administro();
begin
  return query
  select rc.name, rc.created_at
    from public.roles_config rc
   where rc.tenant_id = _t
     and rc.origen = 'plataforma'
     and rc.is_active
     and not exists (select 1 from public.role_permissions rp where rp.role_id = rc.id and rp.can_access)
   order by rc.created_at, rc.name;
end;
$$;
revoke all on function public.equipo_roles_sin_permisos() from public, anon;
grant execute on function public.equipo_roles_sin_permisos() to authenticated;

-- ─── 2. Lo que Maven tiene hoy, ahora con el origen y los permisos de cada rol ─
-- Igual que en 20261111120000 (la edge lo compara con la lista de la plataforma y
-- GET /equipo lo devuelve), más dos datos por rol: origen y con_permisos.

create or replace function public.api_equipo_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _k public.api_keys := public.api_equipo_llave();
  _cfg public.integracion_equipo;
begin
  select * into _cfg from public.integracion_equipo c where c.tenant_id = _k.tenant_id;
  return jsonb_build_object(
    'agencia', _k.tenant_id,
    'aplicar', coalesce(_cfg.aplicar, false),
    'max_bajas', coalesce(_cfg.max_bajas_por_sync, 5),
    'mapa_roles', coalesce(_cfg.mapa_roles, '{}'::jsonb),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nombre', rc.name,
               'es_admin', lower(rc.name) = 'admin' or coalesce(rg.is_admin, false),
               'origen', rc.origen,
               'con_permisos', exists (select 1 from public.role_permissions rp
                                        where rp.role_id = rc.id and rp.can_access))
             order by rc.name)
        from public.roles_config rc
        left join public.role_groups rg on rg.role_name = rc.name and rg.tenant_id = rc.tenant_id
       where rc.tenant_id = _k.tenant_id and rc.is_active
    ), '[]'::jsonb),
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'correo', lower(u.email),
               'nombre', p.full_name,
               'rol', (select ur.role from public.user_roles ur
                        where ur.user_id = p.id and ur.tenant_id = _k.tenant_id
                        order by ur.role limit 1),
               'nivel', p.nivel,
               'hora_entrada', p.hora_entrada::text,
               'hora_salida', p.hora_salida::text,
               'equipo', ip.equipo,
               'reporta_a', ip.reporta_a,
               'en_papelera', p.deleted_at is not null,
               'protegido', public.equipo_protegido(p.id))
             order by p.id)
        from public.tenant_members tm
        join public.profiles p on p.id = tm.user_id
        join auth.users u on u.id = p.id
        left join public.integracion_equipo_personas ip on ip.user_id = p.id and ip.tenant_id = _k.tenant_id
       where tm.tenant_id = _k.tenant_id
         and coalesce(u.raw_app_meta_data ->> 'tipo', '') <> 'creadora'
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.api_equipo_estado() from public, anon;
grant execute on function public.api_equipo_estado() to authenticated;

-- ─── 3. Los pendientes: gente de la plataforma sin cuenta en Maven ───────────

create table if not exists public.integracion_equipo_pendientes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  correo           text not null check (correo = lower(correo) and char_length(correo) between 3 and 254),
  nombre           text check (nombre is null or char_length(nombre) <= 200),
  rol              text check (rol is null or char_length(rol) <= 100),
  nivel            text check (nivel is null or nivel in ('manager', 'supervisor', 'agente')),
  equipo           text check (equipo is null or char_length(equipo) between 1 and 80),
  reporta_a_correo text check (reporta_a_correo is null or char_length(reporta_a_correo) <= 254),
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'descartada')),
  -- Cuántos envíos la trajeron, y cuándo el primero y el último.
  veces            integer not null default 1 check (veces >= 1),
  primera_vez      timestamptz not null default now(),
  ultima_vez       timestamptz not null default now(),
  -- La cuenta que se le creó al aprobarla.
  user_id          uuid references auth.users(id) on delete set null,
  resuelta_por     uuid references auth.users(id) on delete set null,
  resuelta_at      timestamptz,
  constraint integracion_equipo_pendientes_una_por_correo unique (tenant_id, correo),
  constraint integracion_equipo_pendientes_resuelta check ((estado = 'pendiente') = (resuelta_at is null))
);
create index if not exists integracion_equipo_pendientes_por_estado
  on public.integracion_equipo_pendientes (tenant_id, estado, ultima_vez desc);

comment on table public.integracion_equipo_pendientes is
  'Gente que manda la plataforma de la agencia y no tiene cuenta en Maven. El dueño o un admin la aprueba (crea la cuenta) o la descarta.';

alter table public.integracion_equipo_pendientes enable row level security;
revoke all on public.integracion_equipo_pendientes from public, anon, authenticated;
grant select on public.integracion_equipo_pendientes to authenticated;

drop policy if exists integracion_equipo_pendientes_ver on public.integracion_equipo_pendientes;
create policy integracion_equipo_pendientes_ver on public.integracion_equipo_pendientes
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) and (select public.es_admin_o_dueno((select auth.uid()))));

-- _lista: [{ correo, nombre, rol, nivel, equipo, reporta_a }] — los pendientes_de_crear
-- que calculó la edge. La edge la llama solo fuera de ensayo; igual, con el interruptor
-- apagado no se anota nada. Una fila descartada o aprobada nunca vuelve a pendiente:
-- suma una vez y la última fecha, y nada más.
create or replace function public.api_equipo_pendientes(_lista jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _k public.api_keys := public.api_equipo_llave();
  _cfg public.integracion_equipo;
  _x jsonb;
  _correo text;
  _nivel text;
  _jefe text;
  _nueva boolean;
  _registradas integer := 0;
  _actualizadas integer := 0;
  _ignoradas jsonb := '[]'::jsonb;
  _txt text;
begin
  if _lista is null or jsonb_typeof(_lista) <> 'array' or jsonb_array_length(_lista) > 1000 then
    raise exception 'api_equipo_pendientes: _lista tiene que ser una lista de hasta 1000 personas';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('integracion_equipo:' || _k.tenant_id::text, 0));
  select * into _cfg from public.integracion_equipo c where c.tenant_id = _k.tenant_id;
  if not coalesce(_cfg.aplicar, false) then
    return jsonb_build_object('ensayo', true, 'registradas', 0, 'actualizadas', 0, 'ignoradas', '[]'::jsonb);
  end if;

  for _x in select v from jsonb_array_elements(_lista) as a(v) loop
    if jsonb_typeof(_x) <> 'object' or jsonb_typeof(_x -> 'correo') is distinct from 'string' then
      _ignoradas := _ignoradas || jsonb_build_object('correo', null, 'motivo', 'correo_invalido');
      continue;
    end if;
    _correo := lower(btrim(_x ->> 'correo'));
    if char_length(_correo) > 254 or _correo !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      _ignoradas := _ignoradas || jsonb_build_object('correo', left(_correo, 120), 'motivo', 'correo_invalido');
      continue;
    end if;
    -- Ya tiene cuenta en ESTA agencia (también las cuentas externas, que la edge no ve).
    if exists (select 1 from public.tenant_members tm join auth.users u on u.id = tm.user_id
                where tm.tenant_id = _k.tenant_id and lower(u.email) = _correo) then
      _ignoradas := _ignoradas || jsonb_build_object('correo', _correo, 'motivo', 'ya_tiene_cuenta');
      continue;
    end if;
    _nivel := case when _x ->> 'nivel' in ('manager', 'supervisor', 'agente') then _x ->> 'nivel' end;
    _jefe := lower(btrim(_x ->> 'reporta_a'));
    if _jefe is not null and (char_length(_jefe) > 254 or _jefe !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
      _jefe := null;
    end if;

    insert into public.integracion_equipo_pendientes as p
      (tenant_id, correo, nombre, rol, nivel, equipo, reporta_a_correo)
    values (
      _k.tenant_id, _correo,
      nullif(left(btrim(_x ->> 'nombre'), 200), ''),
      nullif(left(btrim(_x ->> 'rol'), 100), ''),
      _nivel,
      nullif(left(btrim(_x ->> 'equipo'), 80), ''),
      _jefe)
    on conflict (tenant_id, correo) do update
      set veces = p.veces + 1,
          ultima_vez = now(),
          nombre = case when p.estado = 'pendiente' then excluded.nombre else p.nombre end,
          rol = case when p.estado = 'pendiente' then excluded.rol else p.rol end,
          nivel = case when p.estado = 'pendiente' then excluded.nivel else p.nivel end,
          equipo = case when p.estado = 'pendiente' then excluded.equipo else p.equipo end,
          reporta_a_correo = case when p.estado = 'pendiente' then excluded.reporta_a_correo else p.reporta_a_correo end
    returning (xmax = 0) into _nueva;
    if _nueva then _registradas := _registradas + 1; else _actualizadas := _actualizadas + 1; end if;
  end loop;

  return jsonb_build_object('ensayo', false, 'registradas', _registradas, 'actualizadas', _actualizadas, 'ignoradas', _ignoradas);
end;
$$;
revoke all on function public.api_equipo_pendientes(jsonb) from public, anon;
grant execute on function public.api_equipo_pendientes(jsonb) to authenticated;

-- Aprobar o descartar un pendiente, desde la app (el dueño o un admin de la agencia).
--   'descartar' → descartada (y así queda en los envíos siguientes).
--   'aprobar'   → el frontend YA creó la cuenta (admin-user-actions create_user, que la
--                 pone en la agencia de quien la crea) y manda su id: tiene que ser de
--                 esta agencia y con el mismo correo. Queda aprobada con su cuenta, y se
--                 le pone el equipo y el jefe que mandó la plataforma (si el jefe está
--                 en la agencia). Repetir la misma aprobación devuelve lo mismo.
-- Errores (el texto empieza con el código): sin_permiso, pendiente_no_existe,
-- accion_invalida, ya_resuelta, falta_user_id, cuenta_no_coincide.
create or replace function public.equipo_pendiente_resolver(_id uuid, _accion text, _user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _t uuid := public.equipo_agencia_que_administro();
  _yo uuid := auth.uid();
  _p public.integracion_equipo_pendientes;
  _jefe uuid;
begin
  select * into _p from public.integracion_equipo_pendientes x where x.id = _id for update;
  if not found or _p.tenant_id is distinct from _t then
    raise exception using errcode = 'P0002', message = 'pendiente_no_existe: no hay un pendiente con ese id en tu agencia';
  end if;
  if _accion is null or _accion not in ('aprobar', 'descartar') then
    raise exception using errcode = '22023', message = 'accion_invalida: la acción es aprobar o descartar';
  end if;

  -- Repetir la misma aprobación (un reintento de la app) no es un error.
  if _accion = 'aprobar' and _p.estado = 'aprobada' and _p.user_id is not distinct from _user_id and _user_id is not null then
    return jsonb_build_object('id', _p.id, 'estado', _p.estado, 'user_id', _p.user_id,
      'equipo', _p.equipo, 'reporta_a', (select ip.reporta_a from public.integracion_equipo_personas ip where ip.user_id = _p.user_id));
  end if;
  if _p.estado <> 'pendiente' then
    raise exception using errcode = '55000', message = 'ya_resuelta: ese pendiente ya está ' || _p.estado;
  end if;

  if _accion = 'descartar' then
    update public.integracion_equipo_pendientes
       set estado = 'descartada', resuelta_por = _yo, resuelta_at = now()
     where id = _p.id;
    return jsonb_build_object('id', _p.id, 'estado', 'descartada', 'user_id', null, 'equipo', null, 'reporta_a', null);
  end if;

  if _user_id is null then
    raise exception using errcode = '22023', message = 'falta_user_id: para aprobar hace falta la cuenta que se creó';
  end if;
  if not exists (select 1 from public.tenant_members tm join auth.users u on u.id = tm.user_id
                  where tm.user_id = _user_id and tm.tenant_id = _t and lower(u.email) = _p.correo) then
    raise exception using errcode = '22023',
      message = 'cuenta_no_coincide: la cuenta no es de esta agencia o no tiene el correo del pendiente';
  end if;

  update public.integracion_equipo_pendientes
     set estado = 'aprobada', user_id = _user_id, resuelta_por = _yo, resuelta_at = now()
   where id = _p.id;

  if _p.equipo is not null then
    insert into public.integracion_equipo_personas (user_id, tenant_id, equipo)
    values (_user_id, _t, _p.equipo)
    on conflict (user_id) do update set equipo = excluded.equipo, tenant_id = excluded.tenant_id, actualizado_at = now();
  end if;
  if _p.reporta_a_correo is not null then
    select tm.user_id into _jefe
      from public.tenant_members tm
      join auth.users u on u.id = tm.user_id
      join public.profiles pr on pr.id = tm.user_id
     where tm.tenant_id = _t and lower(u.email) = _p.reporta_a_correo and pr.deleted_at is null and tm.user_id <> _user_id
     limit 1;
    if _jefe is not null then
      insert into public.integracion_equipo_personas (user_id, tenant_id, reporta_a)
      values (_user_id, _t, _jefe)
      on conflict (user_id) do update set reporta_a = excluded.reporta_a, tenant_id = excluded.tenant_id, actualizado_at = now();
    end if;
  end if;

  return jsonb_build_object('id', _p.id, 'estado', 'aprobada', 'user_id', _user_id, 'equipo', _p.equipo, 'reporta_a', _jefe);
end;
$$;
revoke all on function public.equipo_pendiente_resolver(uuid, text, uuid) from public, anon;
grant execute on function public.equipo_pendiente_resolver(uuid, text, uuid) to authenticated;

-- ─── 4. Horas y asistencia (Cowork) ──────────────────────────────────────────
-- La lógica de cowork_tiempo_diario (cada tramo recortado a cada día de Bogotá; lo que
-- se paga es activo + meet + sin_conexion) y la tardanza de tardanzas_registro, como
-- api_attendance, pero SOLO de la gente de la agencia de la key (tenant_members, sin
-- cuentas externas). Hasta 93 días. Van todas las personas activas (con dias = [] si
-- no tuvieron nada) y las de la papelera que tuvieron algo en el rango. Un día que no
-- aparece es un día sin conexión a Cowork.

create or replace function public.api_equipo_horas(_desde date, _hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _k public.api_keys := public.api_equipo_llave();
  _r jsonb;
begin
  if _desde is null or _hasta is null or _desde > _hasta or _hasta - _desde > 92 then
    raise exception 'api_equipo_horas: el rango va de 1 a 93 días, con desde <= hasta';
  end if;

  with gente as (
    select tm.user_id, lower(u.email) as correo, p.full_name as nombre, p.deleted_at
      from public.tenant_members tm
      join public.profiles p on p.id = tm.user_id
      join auth.users u on u.id = tm.user_id
     where tm.tenant_id = _k.tenant_id
       and coalesce(u.raw_app_meta_data ->> 'tipo', '') <> 'creadora'
  ),
  tramos as (
    select s.user_id, s.session_id, s.estado,
           greatest(s.started_at, d.dia_ini) as ini,
           least(coalesce(s.ended_at, s.last_seen_at), d.dia_fin) as fin,
           d.dia
      from public.cowork_tiempo_segmentos s
      join gente g on g.user_id = s.user_id
     cross join lateral (
       select x::date as dia,
              (x::date)::timestamp at time zone 'America/Bogota' as dia_ini,
              (x::date + 1)::timestamp at time zone 'America/Bogota' as dia_fin
         from generate_series(
           ((s.started_at at time zone 'America/Bogota')::date)::timestamp,
           ((coalesce(s.ended_at, s.last_seen_at) at time zone 'America/Bogota')::date)::timestamp,
           interval '1 day') as x
     ) d
     where (coalesce(s.ended_at, s.last_seen_at) at time zone 'America/Bogota')::date >= _desde
       and (s.started_at at time zone 'America/Bogota')::date <= _hasta
  ),
  sumas as (
    select t.user_id, t.dia,
           sum(case when t.estado in ('activo', 'meet', 'sin_conexion') then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_trabajo,
           sum(case when t.estado = 'meet' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_meet,
           sum(case when t.estado = 'pausa' then extract(epoch from (t.fin - t.ini)) else 0 end)::int as seg_pausa,
           sum(extract(epoch from (t.fin - t.ini)))::int as seg_en_sala,
           count(distinct t.session_id)::int as sesiones,
           min(t.ini) as primera_entrada,
           max(t.fin) as ultima_salida
      from tramos t
     where t.fin > t.ini and t.dia between _desde and _hasta
     group by t.user_id, t.dia
  ),
  tarde as (
    select tr.user_id, tr.dia, tr.horario_asignado, tr.tarde_min, tr.turno_nombre
      from public.tardanzas_registro tr
      join gente g on g.user_id = tr.user_id
     where tr.tenant_id = _k.tenant_id and tr.dia between _desde and _hasta
  ),
  dias as (
    select coalesce(s.user_id, t.user_id) as user_id, coalesce(s.dia, t.dia) as dia,
           s.seg_trabajo, s.seg_meet, s.seg_pausa, s.seg_en_sala, s.sesiones, s.primera_entrada, s.ultima_salida,
           t.horario_asignado, t.tarde_min, t.turno_nombre
      from sumas s
      full join tarde t on t.user_id = s.user_id and t.dia = s.dia
  )
  select jsonb_build_object(
    'desde', _desde,
    'hasta', _hasta,
    'personas', coalesce(jsonb_agg(jsonb_build_object('correo', g.correo, 'nombre', g.nombre, 'dias', g.dias) order by g.correo), '[]'::jsonb)
  ) into _r
  from (
    select ge.correo, ge.nombre,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'fecha', d.dia,
                      'minutos_trabajados', round(coalesce(d.seg_trabajo, 0) / 60.0)::int,
                      'minutos_en_meet', round(coalesce(d.seg_meet, 0) / 60.0)::int,
                      'minutos_pausa', round(coalesce(d.seg_pausa, 0) / 60.0)::int,
                      'minutos_en_sala', round(coalesce(d.seg_en_sala, 0) / 60.0)::int,
                      'sesiones', coalesce(d.sesiones, 0),
                      'primera_entrada', d.primera_entrada,
                      'ultima_salida', d.ultima_salida,
                      'llego_tarde', coalesce(d.tarde_min, 0) > 0,
                      'minutos_tarde', coalesce(d.tarde_min, 0),
                      'hora_asignada', d.horario_asignado,
                      'turno', d.turno_nombre)
                    order by d.dia)
               from dias d where d.user_id = ge.user_id
           ), '[]'::jsonb) as dias
      from gente ge
     where ge.deleted_at is null or exists (select 1 from dias d where d.user_id = ge.user_id)
  ) g;
  return _r;
end;
$$;
revoke all on function public.api_equipo_horas(date, date) from public, anon;
grant execute on function public.api_equipo_horas(date, date) to authenticated;

-- ─── 5. La nota de Argos con su desglose ─────────────────────────────────────
-- La fórmula de api_argos_notas (45 pantalla sobre 8 h + 35 cámara con la cara + 20 de
-- foco, sin contar las capturas perdonadas), por día de Bogotá, SOLO de la gente de la
-- agencia de la key. Hasta 93 días. Van las personas con al menos un día con datos.

create or replace function public.api_equipo_notas(_desde date, _hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _k public.api_keys := public.api_equipo_llave();
  _ini timestamptz;
  _fin timestamptz;
  _r jsonb;
begin
  if _desde is null or _hasta is null or _desde > _hasta or _hasta - _desde > 92 then
    raise exception 'api_equipo_notas: el rango va de 1 a 93 días, con desde <= hasta';
  end if;
  _ini := _desde::timestamp at time zone 'America/Bogota';
  _fin := (_hasta + 1)::timestamp at time zone 'America/Bogota';

  with gente as (
    select tm.user_id, lower(u.email) as correo, p.full_name as nombre
      from public.tenant_members tm
      join public.profiles p on p.id = tm.user_id
      join auth.users u on u.id = tm.user_id
     where tm.tenant_id = _k.tenant_id
       and coalesce(u.raw_app_meta_data ->> 'tipo', '') <> 'creadora'
  ),
  segs as (
    select s.user_id, (s.started_at at time zone 'America/Bogota')::date as dia,
           sum(case when s.estado in ('activo', 'pausa') then coalesce(s.seconds, 0) else 0 end)::int as seg_pantalla,
           sum(coalesce(s.seconds, 0))::int as seg_conectado
      from public.cowork_tiempo_segmentos s
      join gente g on g.user_id = s.user_id
     where s.started_at >= _ini and s.started_at < _fin
     group by s.user_id, dia
  ),
  caps as (
    select c.user_id, (c.created_at at time zone 'America/Bogota')::date as dia,
           count(*) filter (where c.tipo = 'camara')::int as cap_camara,
           count(*) filter (where c.tipo = 'camara' and c.cara_visible is true)::int as cap_cara,
           count(*) filter (where c.tipo = 'pantalla')::int as cap_pantalla,
           count(*) filter (where c.fuera_de_lugar is true and c.perdonado is not true)::int as cap_distraido
      from public.monitor_capturas c
      join gente g on g.user_id = c.user_id
     where c.created_at >= _ini and c.created_at < _fin
     group by c.user_id, dia
  ),
  juntos as (
    select coalesce(s.user_id, c.user_id) as user_id, coalesce(s.dia, c.dia) as dia,
           coalesce(s.seg_pantalla, 0) as seg_pantalla, coalesce(s.seg_conectado, 0) as seg_conectado,
           coalesce(c.cap_camara, 0) as cap_camara, coalesce(c.cap_cara, 0) as cap_cara,
           coalesce(c.cap_pantalla, 0) as cap_pantalla, coalesce(c.cap_distraido, 0) as cap_distraido
      from segs s
      full join caps c on c.user_id = s.user_id and c.dia = s.dia
  ),
  notas as (
    select j.*,
           round((least(1.0, j.seg_pantalla / (8 * 3600.0)) * 45)::numeric, 1) as n_pantalla,
           case when j.cap_camara > 0 then round((j.cap_cara::numeric / j.cap_camara) * 35, 1) else 0 end as n_camara,
           case when j.cap_pantalla > 0 then round((1 - (j.cap_distraido::numeric / j.cap_pantalla)) * 20, 1) else 20 end as n_foco
      from juntos j
     where j.dia between _desde and _hasta
  )
  select jsonb_build_object(
    'desde', _desde,
    'hasta', _hasta,
    'personas', coalesce(jsonb_agg(jsonb_build_object('correo', x.correo, 'nombre', x.nombre, 'dias', x.dias) order by x.correo), '[]'::jsonb)
  ) into _r
  from (
    select g.correo, g.nombre,
           jsonb_agg(jsonb_build_object(
             'fecha', n.dia,
             'nota', least(100, greatest(0, round((n.n_pantalla + n.n_camara + n.n_foco)::numeric, 1))),
             'desglose', jsonb_build_object('pantalla', n.n_pantalla, 'camara', n.n_camara, 'foco', n.n_foco),
             'maximos', jsonb_build_object('pantalla', 45, 'camara', 35, 'foco', 20),
             'crudo', jsonb_build_object(
               'segundos_en_pantalla', n.seg_pantalla,
               'segundos_conectado', n.seg_conectado,
               'capturas_camara', n.cap_camara,
               'capturas_con_cara', n.cap_cara,
               'capturas_pantalla', n.cap_pantalla,
               'capturas_distraido', n.cap_distraido))
             order by n.dia) as dias
      from notas n
      join gente g on g.user_id = n.user_id
     group by g.correo, g.nombre
  ) x;
  return _r;
end;
$$;
revoke all on function public.api_equipo_notas(date, date) from public, anon;
grant execute on function public.api_equipo_notas(date, date) to authenticated;

-- ─── 6. Webhooks del equipo ──────────────────────────────────────────────────
-- Una suscripción por API key (con equipo:write, de la agencia de quien la registra),
-- con los eventos que quiere: equipo.persona_entro, equipo.persona_salio y
-- equipo.rol_cambio. El secreto de firma se genera aquí y se guarda en Vault (cifrado
-- fuera de la tabla); se muestra UNA vez al crearla.
--
-- Encolar: triggers en user_roles, profiles.deleted_at y tenant_members. Cada evento
-- se encola SOLO para las suscripciones activas de la agencia de ESA persona (su única
-- fila en tenant_members), así que un cambio en una agencia nunca le llega a otra.
-- Nunca hacen fallar lo que los dispara: ante un error, un WARNING y listo.
--
-- La ventana de 20 s: cada aviso sale 20 s después de pasar, y mientras no salió, los
-- de la misma persona se juntan. Así un alta desde la app (la cuenta, después la
-- agencia, después el rol: tres pedidos distintos) llega como UN persona_entro con su
-- rol final, y un cambio que se deshace en esos 20 s no llega.
--
-- Mandar: la edge messenger-webhooks con ?tarea=equipo (cron equipo-webhooks-tick cada
-- 30 s, solo si hay trabajo) reclama la más vieja de cada suscripción (en orden: una
-- que falla frena a las de atrás, como el timbre del Messenger), la firma (Standard
-- Webhooks: webhook-id, webhook-timestamp, webhook-signature) y anota qué pasó.
-- Reintentos: 30 s, 2 min, 10 min, 30 min, 1 h, 2 h, 4 h, 8 h…; 72 h fallando → se
-- detiene (receiver_failing). Un 410 la detiene en el acto (receiver_gone).

create table if not exists public.integracion_equipo_webhooks (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  -- Una por llave. La llave se revoca, no se borra; si se borrara, se va con ella.
  api_key_id           uuid not null unique references public.api_keys(id) on delete cascade,
  -- La URL exacta (el href normalizado). Es un secreto (puede llevar un token): la app
  -- muestra url_host.
  url                  text not null check (char_length(url) <= 2048 and url ~ '^https://'),
  url_host             text not null,
  eventos              text[] not null,
  status               text not null default 'active' check (status in ('active', 'paused', 'disabled')),
  disabled_reason      text check (disabled_reason in (
                         'receiver_gone', 'receiver_failing', 'key_revoked', 'key_expired', 'scope_removed',
                         'person_inactive', 'config_error')),
  disabled_at          timestamptz,
  -- El secreto de firma vive en vault.secrets; aquí solo su id y los últimos 4.
  secreto_id           uuid not null,
  secret_last4         text not null check (char_length(secret_last4) = 4),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  failing_since        timestamptz,
  last_attempt_at      timestamptz,
  last_success_at      timestamptz,
  last_status_code     integer check (last_status_code between 100 and 999),
  last_error           text check (char_length(last_error) <= 60),
  created_by           uuid not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint integracion_equipo_webhooks_eventos check (
    cardinality(eventos) between 1 and 3
    and eventos <@ array['equipo.persona_entro', 'equipo.persona_salio', 'equipo.rol_cambio']::text[]),
  constraint integracion_equipo_webhooks_detenido check (
    (status = 'disabled') = (disabled_reason is not null) and (status = 'disabled') = (disabled_at is not null))
);
create index if not exists integracion_equipo_webhooks_por_agencia on public.integracion_equipo_webhooks (tenant_id, status);

comment on table public.integracion_equipo_webhooks is
  'Webhooks del equipo (persona_entro, persona_salio, rol_cambio), uno por API key con equipo:write. Ver 20261111190000.';

create table if not exists public.integracion_equipo_entregas (
  -- Es el webhook-id del encabezado y el id del cuerpo: estable entre reintentos.
  id               uuid primary key default gen_random_uuid(),
  webhook_id       uuid not null references public.integracion_equipo_webhooks(id) on delete cascade,
  tenant_id        uuid not null,
  evento           text not null check (evento in ('equipo.persona_entro', 'equipo.persona_salio', 'equipo.rol_cambio', 'webhook.test')),
  -- De quién es el aviso (para juntar los de la misma persona en la ventana).
  user_id          uuid,
  datos            jsonb not null default '{}'::jsonb,
  -- Los bytes EXACTOS que se firman y se mandan en cada intento.
  body             text not null check (octet_length(body) <= 16384),
  state            text not null default 'pending' check (state in ('pending', 'delivered', 'dropped')),
  drop_reason      text check (drop_reason in (
                     'receiver_gone', 'receiver_failing', 'endpoint_paused', 'endpoint_disabled', 'test_failed')),
  attempts         smallint not null default 0 check (attempts >= 0),
  next_attempt_at  timestamptz not null default now(),
  lease_until      timestamptz,
  last_attempt_at  timestamptz,
  last_status_code integer check (last_status_code between 100 and 999),
  last_error       text check (char_length(last_error) <= 60),
  latency_ms       integer check (latency_ms >= 0),
  uncertain        boolean not null default false,
  created_at       timestamptz not null default now(),
  delivered_at     timestamptz,
  constraint integracion_equipo_entregas_descartada check ((state = 'dropped') = (drop_reason is not null)),
  constraint integracion_equipo_entregas_entregada check ((state = 'delivered') = (delivered_at is not null))
);
create index if not exists integracion_equipo_entregas_pendientes
  on public.integracion_equipo_entregas (webhook_id, created_at) where state = 'pending';
create index if not exists integracion_equipo_entregas_por_webhook
  on public.integracion_equipo_entregas (webhook_id, created_at desc);
create index if not exists integracion_equipo_entregas_por_fecha
  on public.integracion_equipo_entregas (created_at);

comment on table public.integracion_equipo_entregas is
  'Avisos del equipo por webhook, uno por suscripción y evento. Se guardan 14 días.';

-- Nadie del navegador las ve ni las toca directo: todo por las funciones de abajo.
alter table public.integracion_equipo_webhooks enable row level security;
alter table public.integracion_equipo_entregas enable row level security;
revoke all on public.integracion_equipo_webhooks from public, anon, authenticated, service_role;
revoke all on public.integracion_equipo_entregas from public, anon, authenticated, service_role;

-- 6.1 Las piezas del aviso ─────────────────────────────────────────────────────

-- El cuerpo firmado: el mismo formato que los timbres del Messenger (id, type,
-- api_version, created_at) más la agencia y los datos de la persona.
create or replace function public.equipo_evento_cuerpo(_id uuid, _evento text, _tenant uuid, _creado timestamptz, _datos jsonb)
returns text
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'id', _id,
    'type', _evento,
    'api_version', 'v1',
    'created_at', to_char(_creado at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'agency_id', _tenant,
    'data', _datos)::text;
$$;

-- Si el cambio vino por la API (sesión de una key: claim mvk) o desde Maven.
create or replace function public.equipo_evento_via()
returns text
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
begin
  return case when nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'mvk' is not null then 'api' else 'maven' end;
exception when others then
  return 'maven';
end;
$$;

-- La persona como sale en el aviso. null si no es del equipo (cuenta externa de
-- creadora, sin perfil) o, salvo que se pida, si está en la papelera.
create or replace function public.equipo_evento_persona(_uid uuid, _con_papelera boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'correo', lower(u.email),
           'nombre', p.full_name,
           'rol', (select min(ur.role) from public.user_roles ur where ur.user_id = u.id),
           'nivel', p.nivel)
    from auth.users u
    join public.profiles p on p.id = u.id
   where u.id = _uid
     and coalesce(u.raw_app_meta_data ->> 'tipo', '') <> 'creadora'
     and (_con_papelera or p.deleted_at is null);
$$;

-- Encola un evento para las suscripciones activas de ESA agencia, juntándolo con lo
-- que esa persona tenga sin salir todavía (la ventana de 20 s, ver arriba).
create or replace function public.equipo_evento_encolar(_tenant uuid, _uid uuid, _evento text, _datos jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _w record;
  _p public.integracion_equipo_entregas;
  _d jsonb;
  _id uuid;
  _ahora timestamptz := now();
begin
  for _w in
    select w.id, w.tenant_id, w.eventos from public.integracion_equipo_webhooks w
     where w.tenant_id = _tenant and w.status = 'active'
     order by w.id
  loop
    if _evento = 'equipo.rol_cambio' then
      select * into _p from public.integracion_equipo_entregas e
       where e.webhook_id = _w.id and e.user_id = _uid and e.state = 'pending' and e.attempts = 0 and e.lease_until is null
         and e.evento in ('equipo.persona_entro', 'equipo.rol_cambio')
       order by e.created_at desc limit 1
       for update;
      if found then
        if _p.evento = 'equipo.persona_entro' then
          -- Entró y le pusieron el rol: un solo aviso, con el rol final.
          _d := _p.datos || jsonb_build_object('rol', _datos -> 'rol');
        elsif (_p.datos ->> 'rol_anterior') is not distinct from (_datos ->> 'rol') then
          -- Volvió al rol de antes sin que saliera el aviso: no pasó nada.
          delete from public.integracion_equipo_entregas where id = _p.id;
          continue;
        else
          _d := _p.datos || jsonb_build_object('rol', _datos -> 'rol', 'nombre', _datos -> 'nombre');
        end if;
        update public.integracion_equipo_entregas
           set datos = _d, body = public.equipo_evento_cuerpo(_p.id, _p.evento, _p.tenant_id, _p.created_at, _d)
         where id = _p.id;
        continue;
      end if;
    elsif _evento = 'equipo.persona_salio' then
      if exists (select 1 from public.integracion_equipo_entregas e
                  where e.webhook_id = _w.id and e.user_id = _uid and e.state = 'pending' and e.attempts = 0
                    and e.lease_until is null and e.evento = 'equipo.persona_entro') then
        -- Entró y salió sin que saliera el aviso: no se avisa ninguno de los dos.
        delete from public.integracion_equipo_entregas e
         where e.webhook_id = _w.id and e.user_id = _uid and e.state = 'pending' and e.attempts = 0
           and e.lease_until is null and e.evento in ('equipo.persona_entro', 'equipo.rol_cambio');
        continue;
      end if;
      -- Se va: un cambio de rol que no salió ya no importa.
      delete from public.integracion_equipo_entregas e
       where e.webhook_id = _w.id and e.user_id = _uid and e.state = 'pending' and e.attempts = 0
         and e.lease_until is null and e.evento = 'equipo.rol_cambio';
    elsif _evento = 'equipo.persona_entro' then
      delete from public.integracion_equipo_entregas e
       where e.webhook_id = _w.id and e.user_id = _uid and e.state = 'pending' and e.attempts = 0
         and e.lease_until is null and e.evento = 'equipo.persona_salio';
      if found then
        -- Salió y volvió sin que saliera el aviso: no pasó nada.
        continue;
      end if;
    end if;

    if _evento = any (_w.eventos) then
      _id := gen_random_uuid();
      insert into public.integracion_equipo_entregas
        (id, webhook_id, tenant_id, evento, user_id, datos, body, next_attempt_at, created_at)
      values
        (_id, _w.id, _w.tenant_id, _evento, _uid, _datos,
         public.equipo_evento_cuerpo(_id, _evento, _w.tenant_id, _ahora, _datos),
         _ahora + interval '20 seconds', _ahora);
    end if;
  end loop;
end;
$$;

-- 6.2 Los triggers que encolan ─────────────────────────────────────────────────

-- El rol de una persona (el que muestra api_equipo_estado: el primero por nombre)
-- cambió: equipo.rol_cambio con el de antes y el de ahora.
create or replace function public.equipo_eventos_por_rol()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '1s'
as $$
declare
  _uid uuid;
  _viejo text;
  _nuevo text;
  _t uuid;
  _p jsonb;
  _antes text;
  _despues text;
begin
  if not exists (select 1 from public.integracion_equipo_webhooks where status = 'active') then
    return null;
  end if;
  if tg_op = 'DELETE' then
    _uid := old.user_id; _viejo := old.role; _nuevo := null;
  elsif tg_op = 'INSERT' then
    _uid := new.user_id; _viejo := null; _nuevo := new.role;
  else
    _uid := new.user_id; _viejo := old.role; _nuevo := new.role;
    if _viejo is not distinct from _nuevo then return null; end if;
  end if;
  select tm.tenant_id into _t from public.tenant_members tm where tm.user_id = _uid;
  if _t is null or not exists (select 1 from public.integracion_equipo_webhooks w
                                where w.tenant_id = _t and w.status = 'active') then
    return null;
  end if;
  _p := public.equipo_evento_persona(_uid);
  if _p is null then
    return null;
  end if;
  _despues := _p ->> 'rol';
  -- El de antes: los roles de ahora sin este cambio.
  select min(x.r) into _antes from (
    select ur.role as r from public.user_roles ur where ur.user_id = _uid and ur.role is distinct from _nuevo
    union all
    select _viejo where _viejo is not null
  ) x;
  if _antes is not distinct from _despues then
    return null;
  end if;
  perform public.equipo_evento_encolar(_t, _uid, 'equipo.rol_cambio', jsonb_build_object(
    'correo', _p -> 'correo', 'nombre', _p -> 'nombre', 'rol_anterior', _antes, 'rol', _despues,
    'via', public.equipo_evento_via()));
  return null;
exception when others then
  raise warning 'equipo_eventos_por_rol (%): %', sqlstate, sqlerrm;
  return null;
end;
$$;

-- La papelera: entrar en ella es salir del equipo; restaurarla, volver.
create or replace function public.equipo_eventos_por_papelera()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '1s'
as $$
declare
  _t uuid;
  _p jsonb;
begin
  if not exists (select 1 from public.integracion_equipo_webhooks where status = 'active') then
    return null;
  end if;
  select tm.tenant_id into _t from public.tenant_members tm where tm.user_id = new.id;
  if _t is null then
    return null;
  end if;
  _p := public.equipo_evento_persona(new.id, true);
  if _p is null then
    return null;
  end if;
  if new.deleted_at is not null then
    perform public.equipo_evento_encolar(_t, new.id, 'equipo.persona_salio',
      _p || jsonb_build_object('motivo', 'papelera', 'via', public.equipo_evento_via()));
  else
    perform public.equipo_evento_encolar(_t, new.id, 'equipo.persona_entro',
      _p || jsonb_build_object('motivo', 'restaurada', 'via', public.equipo_evento_via()));
  end if;
  return null;
exception when others then
  raise warning 'equipo_eventos_por_papelera (%): %', sqlstate, sqlerrm;
  return null;
end;
$$;

-- La agencia de una persona: entrar a tenant_members es entrar al equipo de esa
-- agencia; salir, salir. Quien ya está en la papelera no se vuelve a avisar (su
-- salida ya se avisó al mandarla ahí; la purga de los 30 días no es noticia).
create or replace function public.equipo_eventos_por_agencia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '1s'
as $$
declare
  _p jsonb;
begin
  if not exists (select 1 from public.integracion_equipo_webhooks where status = 'active') then
    return null;
  end if;
  if tg_op in ('DELETE', 'UPDATE') then
    if tg_op = 'DELETE' or old.tenant_id is distinct from new.tenant_id or old.user_id is distinct from new.user_id then
      _p := public.equipo_evento_persona(old.user_id);
      if _p is not null then
        perform public.equipo_evento_encolar(old.tenant_id, old.user_id, 'equipo.persona_salio',
          _p || jsonb_build_object('motivo', 'fuera_de_la_agencia', 'via', public.equipo_evento_via()));
      end if;
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if tg_op = 'INSERT' or old.tenant_id is distinct from new.tenant_id or old.user_id is distinct from new.user_id then
      _p := public.equipo_evento_persona(new.user_id);
      if _p is not null then
        perform public.equipo_evento_encolar(new.tenant_id, new.user_id, 'equipo.persona_entro',
          _p || jsonb_build_object('motivo', 'alta', 'via', public.equipo_evento_via()));
      end if;
    end if;
  end if;
  return null;
exception when others then
  raise warning 'equipo_eventos_por_agencia (%): %', sqlstate, sqlerrm;
  return null;
end;
$$;

drop trigger if exists equipo_eventos_por_rol on public.user_roles;
create trigger equipo_eventos_por_rol
  after insert or delete or update of role on public.user_roles
  for each row execute function public.equipo_eventos_por_rol();

drop trigger if exists equipo_eventos_por_papelera on public.profiles;
create trigger equipo_eventos_por_papelera
  after update of deleted_at on public.profiles
  for each row when (old.deleted_at is distinct from new.deleted_at)
  execute function public.equipo_eventos_por_papelera();

drop trigger if exists equipo_eventos_por_agencia on public.tenant_members;
create trigger equipo_eventos_por_agencia
  after insert or delete or update on public.tenant_members
  for each row execute function public.equipo_eventos_por_agencia();

-- 6.3 La llave de una suscripción ──────────────────────────────────────────────

-- ¿Sirve la llave para avisar? null si sí; si no, el motivo para detener la suscripción.
create or replace function public.equipo_webhook_llave_no_sirve(_api_key_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _k public.api_keys;
begin
  select * into _k from public.api_keys k where k.id = _api_key_id;
  if not found or _k.revoked_at is not null then return 'key_revoked'; end if;
  if _k.expires_at is not null and _k.expires_at <= now() then return 'key_expired'; end if;
  if not ('equipo:write' = any (_k.scopes)) then return 'scope_removed'; end if;
  if not public.api_key_persona_vigente(_k.acts_as_user_id, _k.tenant_id) then return 'person_inactive'; end if;
  return null;
end;
$$;

-- Detener una suscripción: y lo que tenía por salir, descartado.
create or replace function public.equipo_webhook_detener(_id uuid, _motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.integracion_equipo_webhooks
     set status = 'disabled', disabled_reason = _motivo, disabled_at = now(), updated_at = now()
   where id = _id and status <> 'disabled';
  update public.integracion_equipo_entregas
     set state = 'dropped',
         drop_reason = case when _motivo in ('receiver_gone', 'receiver_failing') then _motivo else 'endpoint_disabled' end,
         lease_until = null
   where webhook_id = _id and state = 'pending';
end;
$$;

-- Revocar la llave o sacarle equipo:write la detiene en el momento (sin esperar a que
-- haya un aviso). Nunca hace fallar el cambio de la llave.
create or replace function public.equipo_webhooks_por_llave()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
set lock_timeout = '1s'
as $$
declare
  _w uuid;
begin
  for _w in select w.id from public.integracion_equipo_webhooks w where w.api_key_id = new.id and w.status <> 'disabled' loop
    perform public.equipo_webhook_detener(_w,
      case when new.revoked_at is not null then 'key_revoked' else 'scope_removed' end);
  end loop;
  return null;
exception when others then
  raise warning 'equipo_webhooks_por_llave (%): %', sqlstate, sqlerrm;
  return null;
end;
$$;

drop trigger if exists equipo_webhooks_por_llave on public.api_keys;
create trigger equipo_webhooks_por_llave
  after update of revoked_at, scopes on public.api_keys
  for each row when ((old.revoked_at is null and new.revoked_at is not null)
                  or ('equipo:write' = any (old.scopes) and not ('equipo:write' = any (new.scopes))))
  execute function public.equipo_webhooks_por_llave();

-- 6.4 Desde la app: registrar, ver, probar, pausar, reanudar, borrar ──────────
-- Todo para el dueño o un admin de la agencia de la sesión, y solo sobre lo de ESA
-- agencia. Errores (el texto empieza con el código): sin_permiso, llave_no_existe,
-- llave_no_vigente, llave_sin_equipo, eventos_invalidos, url_invalida,
-- ya_tiene_webhook, webhook_no_existe, accion_invalida, webhook_no_activo,
-- prueba_muy_seguida.

-- La suscripción como la ve la app (nunca la URL entera ni el secreto).
create or replace function public.equipo_webhook_json(_w public.integracion_equipo_webhooks)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', _w.id,
    'api_key_id', _w.api_key_id,
    'url_host', _w.url_host,
    'eventos', to_jsonb(_w.eventos),
    'status', _w.status,
    'disabled_reason', _w.disabled_reason,
    'disabled_at', _w.disabled_at,
    'secret_last4', _w.secret_last4,
    'consecutive_failures', _w.consecutive_failures,
    'failing_since', _w.failing_since,
    'last_attempt_at', _w.last_attempt_at,
    'last_success_at', _w.last_success_at,
    'last_status_code', _w.last_status_code,
    'last_error', _w.last_error,
    'created_by', _w.created_by,
    'created_at', _w.created_at,
    'pendientes', (select count(*) from public.integracion_equipo_entregas e
                    where e.webhook_id = _w.id and e.state = 'pending'));
$$;

create or replace function public.equipo_webhook_crear(_api_key_id uuid, _url text, _eventos text[] default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
     or not (_ev <@ array['equipo.persona_entro', 'equipo.persona_salio', 'equipo.rol_cambio']::text[]) then
    raise exception using errcode = '22023',
      message = 'eventos_invalidos: los eventos son equipo.persona_entro, equipo.persona_salio y equipo.rol_cambio';
  end if;

  -- La URL como la manda la edge en cada envío (new URL(x).href): sin :443 y con la
  -- barra después del host. La forma la valida la misma regla de los webhooks del
  -- Messenger; los hosts prohibidos (los de Maven, red interna) los vuelve a mirar la
  -- edge en CADA envío y, si cae en uno, la detiene (config_error).
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

  -- 48 bytes al azar (tres UUID v4, de un generador criptográfico) en base64: el mismo
  -- formato whsec_ que los webhooks del Messenger y que verifica standardwebhooks.
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
$$;

-- Las suscripciones de mi agencia (con lo último que pasó).
create or replace function public.equipo_webhooks()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _t uuid := public.equipo_agencia_que_administro();
begin
  return coalesce((
    select jsonb_agg(public.equipo_webhook_json(w) order by w.created_at)
      from public.integracion_equipo_webhooks w
     where w.tenant_id = _t
  ), '[]'::jsonb);
end;
$$;

-- Las últimas entregas de una suscripción de mi agencia (hasta 100).
create or replace function public.equipo_webhook_entregas(_id uuid, _limite integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _t uuid := public.equipo_agencia_que_administro();
begin
  if not exists (select 1 from public.integracion_equipo_webhooks w where w.id = _id and w.tenant_id = _t) then
    raise exception using errcode = 'P0002', message = 'webhook_no_existe: no hay un webhook con ese id en tu agencia';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', e.id, 'evento', e.evento, 'datos', e.datos, 'state', e.state, 'drop_reason', e.drop_reason,
             'attempts', e.attempts, 'next_attempt_at', e.next_attempt_at, 'last_attempt_at', e.last_attempt_at,
             'last_status_code', e.last_status_code, 'last_error', e.last_error, 'latency_ms', e.latency_ms,
             'uncertain', e.uncertain, 'created_at', e.created_at, 'delivered_at', e.delivered_at)
           order by e.created_at desc)
      from (select * from public.integracion_equipo_entregas x
             where x.webhook_id = _id and x.tenant_id = _t
             order by x.created_at desc
             limit least(greatest(coalesce(_limite, 50), 1), 100)) e
  ), '[]'::jsonb);
end;
$$;

-- pausar | reanudar | borrar.
create or replace function public.equipo_webhook_cambiar(_id uuid, _accion text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _t uuid := public.equipo_agencia_que_administro();
  _w public.integracion_equipo_webhooks;
  _motivo text;
begin
  select * into _w from public.integracion_equipo_webhooks w where w.id = _id and w.tenant_id = _t for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'webhook_no_existe: no hay un webhook con ese id en tu agencia';
  end if;
  if _accion = 'pausar' then
    update public.integracion_equipo_webhooks
       set status = 'paused', disabled_reason = null, disabled_at = null, updated_at = now()
     where id = _id and status = 'active';
    update public.integracion_equipo_entregas
       set state = 'dropped', drop_reason = 'endpoint_paused', lease_until = null
     where webhook_id = _id and state = 'pending';
  elsif _accion = 'reanudar' then
    _motivo := public.equipo_webhook_llave_no_sirve(_w.api_key_id);
    if _motivo is not null then
      raise exception using errcode = '22023', message = 'llave_no_vigente: la API key ya no sirve (' || _motivo || ')';
    end if;
    -- Arranca de cero: lo que pasó mientras estaba parada no se avisa.
    update public.integracion_equipo_webhooks
       set status = 'active', disabled_reason = null, disabled_at = null,
           consecutive_failures = 0, failing_since = null, updated_at = now()
     where id = _id;
  elsif _accion = 'borrar' then
    delete from public.integracion_equipo_webhooks where id = _id;
    delete from vault.secrets where id = _w.secreto_id;
    return jsonb_build_object('id', _id, 'borrado', true);
  else
    raise exception using errcode = '22023', message = 'accion_invalida: la acción es pausar, reanudar o borrar';
  end if;
  select * into _w from public.integracion_equipo_webhooks w where w.id = _id;
  return public.equipo_webhook_json(_w);
end;
$$;

-- «Enviar prueba»: un webhook.test que sale en el próximo turno (≤ 30 s). Una cada
-- 12 s por suscripción. La app mira el resultado en equipo_webhook_entregas.
create or replace function public.equipo_webhook_probar(_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _t uuid := public.equipo_agencia_que_administro();
  _w public.integracion_equipo_webhooks;
  _e uuid := gen_random_uuid();
  _ahora timestamptz := now();
begin
  select * into _w from public.integracion_equipo_webhooks w where w.id = _id and w.tenant_id = _t for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'webhook_no_existe: no hay un webhook con ese id en tu agencia';
  end if;
  if _w.status <> 'active' then
    raise exception using errcode = '55000', message = 'webhook_no_activo: reanúdalo antes de probarlo';
  end if;
  if exists (select 1 from public.integracion_equipo_entregas e
              where e.webhook_id = _id and e.evento = 'webhook.test' and e.created_at > _ahora - interval '12 seconds') then
    raise exception using errcode = '55000', message = 'prueba_muy_seguida: espera unos segundos entre pruebas';
  end if;
  insert into public.integracion_equipo_entregas (id, webhook_id, tenant_id, evento, datos, body, next_attempt_at, created_at)
  values (_e, _id, _t, 'webhook.test', '{}'::jsonb,
          public.equipo_evento_cuerpo(_e, 'webhook.test', _t, _ahora, '{}'::jsonb), _ahora, _ahora);
  return jsonb_build_object('entrega_id', _e);
end;
$$;

-- 6.5 El despachador (la edge, con service_role) ──────────────────────────────

-- La espera antes de cada reintento (la misma tabla que los webhooks del Messenger).
create or replace function public.equipo_webhooks_espera(_intento integer)
returns interval
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select make_interval(secs => (array[30, 120, 600, 1800, 3600, 7200, 14400, 28800])[least(greatest(_intento, 1), 8)]);
$$;

-- ¿Hay algo para mandar? Lo mira el cron antes de despertar a la edge.
create or replace function public.equipo_webhooks_hay_trabajo()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.integracion_equipo_entregas e
      join public.integracion_equipo_webhooks w on w.id = e.webhook_id
     where e.state = 'pending' and w.status = 'active'
       and e.next_attempt_at <= now() and (e.lease_until is null or e.lease_until <= now()));
$$;

-- Reclama hasta _max entregas (la más vieja de cada suscripción, la prueba primero) por
-- _lease_s segundos. ANTES de devolverlas ya anota el intento y la próxima espera: si
-- la edge se muere a mitad del envío, el turno siguiente espera (nunca un reenvío cada
-- 30 s). Una suscripción con la llave muerta se detiene aquí mismo.
create or replace function public.equipo_webhooks_reclamar(_max integer default 10, _lease_s integer default 60)
returns table (id uuid, webhook_id uuid, tenant_id uuid, evento text, url text, cuerpo text,
               intento integer, secreto text, reclamo timestamptz)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  _w public.integracion_equipo_webhooks;
  _e public.integracion_equipo_entregas;
  _motivo text;
  _n integer := 0;
begin
  if _max is null or _max < 1 or _max > 20 then
    raise exception 'equipo_webhooks_reclamar: _max va de 1 a 20 (llegó %)', _max;
  end if;
  if _lease_s is null or _lease_s < 10 or _lease_s > 300 then
    raise exception 'equipo_webhooks_reclamar: _lease_s va de 10 a 300 (llegó %)', _lease_s;
  end if;
  for _w in
    select w.* from public.integracion_equipo_webhooks w
     where w.status = 'active'
       and exists (select 1 from public.integracion_equipo_entregas x
                    where x.webhook_id = w.id and x.state = 'pending' and x.next_attempt_at <= now()
                      and (x.lease_until is null or x.lease_until <= now()))
     order by w.id
     for no key update skip locked
  loop
    exit when _n >= _max;
    _motivo := public.equipo_webhook_llave_no_sirve(_w.api_key_id);
    if _motivo is not null then
      perform public.equipo_webhook_detener(_w.id, _motivo);
      continue;
    end if;
    -- En orden: la más vieja (la prueba, antes que nada). Si todavía no le toca, no se
    -- adelanta ninguna de atrás.
    select * into _e from public.integracion_equipo_entregas x
     where x.webhook_id = _w.id and x.state = 'pending'
     order by (x.evento = 'webhook.test') desc, x.created_at, x.id
     limit 1
     for update skip locked;
    if not found or _e.next_attempt_at > now() or (_e.lease_until is not null and _e.lease_until > now()) then
      continue;
    end if;
    update public.integracion_equipo_entregas x
       set attempts = x.attempts + 1,
           last_attempt_at = now(),
           lease_until = now() + make_interval(secs => _lease_s),
           next_attempt_at = now() + public.equipo_webhooks_espera(x.attempts + 1)
     where x.id = _e.id
    returning * into _e;
    update public.integracion_equipo_webhooks set last_attempt_at = now(), updated_at = now() where integracion_equipo_webhooks.id = _w.id;
    _n := _n + 1;
    id := _e.id;
    webhook_id := _w.id;
    tenant_id := _w.tenant_id;
    evento := _e.evento;
    url := _w.url;
    cuerpo := _e.body;
    intento := _e.attempts;
    secreto := (select s.decrypted_secret from vault.decrypted_secrets s where s.id = _w.secreto_id);
    reclamo := _e.lease_until;
    return next;
  end loop;
end;
$$;

-- Lo que pasó con un envío. Solo si la entrega sigue pendiente y con ESTE reclamo
-- ('perdio' si no: la pausaron, la detuvieron o venció el reclamo).
--   _accion 'entregado' (2xx), 'reintentar' (cualquier otro fallo) o 'detener'
--   (_motivo receiver_gone o config_error).
create or replace function public.equipo_webhooks_anotar(
  _id uuid,
  _reclamo timestamptz,
  _accion text,
  _codigo integer default null,
  _error text default null,
  _incierto boolean default false,
  _reintentar_en_s integer default null,
  _latencia_ms integer default null,
  _motivo text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _e public.integracion_equipo_entregas;
  _w public.integracion_equipo_webhooks;
  _wid uuid;
  _cod integer := case when _codigo between 100 and 999 then _codigo end;
  _err text := left(_error, 60);
  _lat integer := case when _latencia_ms >= 0 then _latencia_ms end;
begin
  -- Primero la suscripción y después la entrega: el mismo orden que reclamar y que
  -- pausar/detener (si no, dos corridas se podrían trabar una a la otra).
  select x.webhook_id into _wid from public.integracion_equipo_entregas x where x.id = _id;
  if not found then
    return 'perdio';
  end if;
  select * into _w from public.integracion_equipo_webhooks w where w.id = _wid for no key update;
  select * into _e from public.integracion_equipo_entregas x
   where x.id = _id and x.state = 'pending' and x.lease_until = _reclamo
   for update;
  if not found then
    return 'perdio';
  end if;

  if _accion = 'entregado' then
    update public.integracion_equipo_entregas
       set state = 'delivered', delivered_at = now(), last_status_code = _cod, last_error = null,
           latency_ms = _lat, lease_until = null
     where id = _id;
    update public.integracion_equipo_webhooks
       set last_success_at = now(), last_status_code = _cod, last_error = null,
           consecutive_failures = 0, failing_since = null, updated_at = now()
     where id = _w.id;
    return 'ok';
  end if;

  if _e.evento = 'webhook.test' then
    -- Una prueba no se reintenta ni cuenta como fallo del receptor: se muestra y listo.
    update public.integracion_equipo_entregas
       set state = 'dropped', drop_reason = 'test_failed', last_status_code = _cod, last_error = _err,
           latency_ms = _lat, uncertain = uncertain or coalesce(_incierto, false), lease_until = null
     where id = _id;
    update public.integracion_equipo_webhooks
       set last_status_code = _cod, last_error = _err, updated_at = now()
     where id = _w.id;
    return 'ok';
  end if;

  if _accion = 'detener' then
    update public.integracion_equipo_entregas
       set last_status_code = _cod, last_error = _err, latency_ms = _lat,
           uncertain = uncertain or coalesce(_incierto, false)
     where id = _id;
    update public.integracion_equipo_webhooks
       set last_status_code = _cod, last_error = _err, updated_at = now()
     where id = _w.id;
    perform public.equipo_webhook_detener(_w.id,
      case when _motivo in ('receiver_gone', 'config_error') then _motivo else 'config_error' end);
    return 'ok';
  end if;

  if _accion <> 'reintentar' then
    raise exception 'equipo_webhooks_anotar: la acción es entregado, reintentar o detener (llegó %)', _accion;
  end if;
  update public.integracion_equipo_entregas
     set last_status_code = _cod, last_error = _err, latency_ms = _lat,
         uncertain = uncertain or coalesce(_incierto, false), lease_until = null,
         next_attempt_at = greatest(next_attempt_at,
                                    now() + make_interval(secs => least(greatest(coalesce(_reintentar_en_s, 0), 0), 3600)))
   where id = _id;
  update public.integracion_equipo_webhooks
     set consecutive_failures = consecutive_failures + 1,
         failing_since = coalesce(failing_since, now()),
         last_status_code = _cod, last_error = _err, updated_at = now()
   where id = _w.id
  returning * into _w;
  -- 72 h fallando sin parar: se detiene.
  if _w.failing_since <= now() - interval '72 hours' then
    perform public.equipo_webhook_detener(_w.id, 'receiver_failing');
  end if;
  return 'ok';
end;
$$;

-- Las entregas terminadas de más de 14 días (y las pruebas viejas).
create or replace function public.equipo_webhooks_purgar(_dias integer default 14, _tope integer default 10000)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  _n integer;
begin
  delete from public.integracion_equipo_entregas
   where id in (
     select x.id from public.integracion_equipo_entregas x
      where x.created_at < now() - make_interval(days => greatest(coalesce(_dias, 14), 1))
        and (x.state <> 'pending' or x.evento = 'webhook.test')
      order by x.created_at
      limit greatest(coalesce(_tope, 10000), 1));
  get diagnostics _n = row_count;
  return _n;
end;
$$;

-- 6.6 Permisos de las funciones ────────────────────────────────────────────────

revoke all on function public.equipo_evento_cuerpo(uuid, text, uuid, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.equipo_evento_via() from public, anon, authenticated;
revoke all on function public.equipo_evento_persona(uuid, boolean) from public, anon, authenticated;
revoke all on function public.equipo_evento_encolar(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.equipo_eventos_por_rol() from public, anon, authenticated, service_role;
revoke all on function public.equipo_eventos_por_papelera() from public, anon, authenticated, service_role;
revoke all on function public.equipo_eventos_por_agencia() from public, anon, authenticated, service_role;
revoke all on function public.equipo_webhook_llave_no_sirve(uuid) from public, anon, authenticated;
revoke all on function public.equipo_webhook_detener(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.equipo_webhooks_por_llave() from public, anon, authenticated, service_role;
revoke all on function public.equipo_webhook_json(public.integracion_equipo_webhooks) from public, anon, authenticated;
revoke all on function public.equipo_webhooks_espera(integer) from public, anon, authenticated;
revoke all on function public.equipo_webhooks_hay_trabajo() from public, anon, authenticated, service_role;
revoke all on function public.equipo_webhooks_purgar(integer, integer) from public, anon, authenticated, service_role;

-- La app (dueño o admin, lo verifica cada función).
revoke all on function public.equipo_webhook_crear(uuid, text, text[]) from public, anon;
revoke all on function public.equipo_webhooks() from public, anon;
revoke all on function public.equipo_webhook_entregas(uuid, integer) from public, anon;
revoke all on function public.equipo_webhook_cambiar(uuid, text) from public, anon;
revoke all on function public.equipo_webhook_probar(uuid) from public, anon;
grant execute on function public.equipo_webhook_crear(uuid, text, text[]) to authenticated;
grant execute on function public.equipo_webhooks() to authenticated;
grant execute on function public.equipo_webhook_entregas(uuid, integer) to authenticated;
grant execute on function public.equipo_webhook_cambiar(uuid, text) to authenticated;
grant execute on function public.equipo_webhook_probar(uuid) to authenticated;

-- El despachador (la edge con service_role): solo reclamar y anotar.
revoke all on function public.equipo_webhooks_reclamar(integer, integer) from public, anon, authenticated;
revoke all on function public.equipo_webhooks_anotar(uuid, timestamptz, text, integer, text, boolean, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.equipo_webhooks_reclamar(integer, integer) to service_role;
grant execute on function public.equipo_webhooks_anotar(uuid, timestamptz, text, integer, text, boolean, integer, integer, text)
  to service_role;

-- 6.7 Los cron ───────────────────────────────────────────────────────────────────
-- Cada 30 s mira si hay algo para mandar (una lectura de una tabla chica) y SOLO
-- entonces despierta a messenger-webhooks con ?tarea=equipo. Nace prendido: sin
-- suscripciones no hace nada. Apagar: cron.alter_job((select jobid from cron.job where
-- jobname = 'equipo-webhooks-tick'), active := false).

select cron.unschedule('equipo-webhooks-tick')
where exists (select 1 from cron.job where jobname = 'equipo-webhooks-tick');

select cron.schedule(
  'equipo-webhooks-tick',
  '30 seconds',
  $cron$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/messenger-webhooks?tarea=equipo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000)
  where public.equipo_webhooks_hay_trabajo();
  $cron$
);

-- 3:50 de la mañana en Bogotá, diez minutos después de la de los webhooks del Messenger.
select cron.unschedule('purgar-entregas-equipo')
where exists (select 1 from cron.job where jobname = 'purgar-entregas-equipo');

select cron.schedule(
  'purgar-entregas-equipo',
  '50 8 * * *',
  $cron$ select public.equipo_webhooks_purgar(14, 10000); $cron$
);
