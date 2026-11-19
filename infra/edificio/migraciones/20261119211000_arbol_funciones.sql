-- VAGÓN 3 · EL ÁRBOL (2 de 2): registros (pedidos de sillas, historial, avisos,
-- enlaces de acceso, saldo de Argos, socios y briefs) y las funciones que usan los
-- paneles del dueño de la plataforma y del admin del cliente.
-- ⚠️ SOLO PARA EL EDIFICIO maven-agencias (ezeigddgkaemxpshghmu). NUNCA en Kash.
-- Requiere 20261119210000_arbol.sql. Banco: infra/edificio/tests/arbol.ts.
--
-- Todas las funciones son security definer, con search_path fijo y (select auth.uid()).
-- Los errores empiezan con una clave estable (sin_permiso, paquete_lleno, agencia_llena,
-- org_en_preparacion…) para que la pantalla los traduzca con t().
--
-- Lo que NO hace (va en otros vagones): mandar correos (los manda la edge con Resend
-- al activar o invitar), crear cuentas de Auth, sembrar los roles de una agencia nueva
-- (sembrar_roles_de_agencia, solo service_role), cobrar con Stripe, ni insertar
-- notificaciones (dispararían push reales).
--
-- Vuelta atrás (las líneas «--|»; el banco las corre). Después, la de la parte 1.
--| drop function if exists public.organizaciones_del_dueno();
--| drop function if exists public.lideres_de_organizacion(uuid);
--| drop function if exists public.plan_de_organizacion(uuid);
--| drop function if exists public.arbol_plan_visible(uuid, jsonb);
--| drop table if exists public.organizaciones_externas;
--| drop function if exists public.argos_acreditar_planes(date);
--| drop function if exists public.argos_acreditar(uuid, uuid, text, numeric, text, jsonb);
--| drop function if exists public.argos_cobrar(uuid, numeric, jsonb);
--| drop function if exists public.argos_puede_juzgar(uuid);
--| drop function if exists public.argos_billetera_de(uuid);
--| drop function if exists public.usar_enlace_de_acceso(text, text);
--| drop function if exists public.crear_enlace_de_acceso(uuid, text, uuid, uuid, uuid);
--| drop function if exists public.resumen_organizacion(uuid);
--| drop function if exists public.personas_de_agencia(uuid);
--| drop function if exists public.marca_de_mi_organizacion();
--| drop function if exists public.decidir_pedido(uuid, boolean, int);
--| drop function if exists public.pedir_sillas(int, text, uuid);
--| drop function if exists public.mandar_aviso(uuid, text, text, uuid[]);
--| drop function if exists public.salir_de_agencia();
--| drop function if exists public.entrar_a_agencia(uuid);
--| drop function if exists public.pausar_agencia(uuid, boolean);
--| drop function if exists public.reactivar_agencia(uuid);
--| drop function if exists public.archivar_agencia(uuid);
--| drop function if exists public.cambiar_dueno_agencia(uuid, uuid);
--| drop function if exists public.dar_sillas_a_agencia(uuid, int);
--| drop function if exists public.crear_agencia(uuid, text, int, text);
--| drop function if exists public.activar_organizacion(uuid);
--| drop function if exists public.quitar_admin_organizacion(uuid, uuid);
--| drop function if exists public.agregar_admin_organizacion(uuid, uuid, boolean);
--| drop function if exists public.crear_organizacion(text, text, jsonb, jsonb, boolean, text);
--| drop function if exists public.arbol_agencia_que_administro(uuid);
--| drop function if exists public.arbol_slug(text);
--| drop function if exists public.arbol_anotar(uuid, uuid, text, jsonb);
--| drop table if exists public.briefs;
--| drop table if exists public.socios;
--| drop trigger if exists organizaciones_billetera on public.organizaciones;
--| drop function if exists public.organizaciones_billetera();
--| drop table if exists public.argos_saldo_movimientos;
--| drop table if exists public.argos_saldo;
--| drop function if exists public.argos_saldo_mover();
--| drop table if exists public.enlaces_de_acceso;
--| drop function if exists public.enlaces_guarda_preparacion();
--| drop table if exists public.organizacion_avisos;
--| drop table if exists public.organizacion_bitacora;
--| drop table if exists public.pedidos_de_sillas;

-- ═══ 1. Registros ════════════════════════════════════════════════════════════

-- 1a. Pedidos de sillas: agencia → cliente (tenant_id puesto) y cliente → Maven (tenant_id NULL).
create table public.pedidos_de_sillas (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  tenant_id       uuid references public.tenants(id) on delete cascade,
  pedido_por      uuid,
  sillas          int not null check (sillas between 1 and 10000),
  nota            text check (nota is null or length(nota) <= 1000),
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  decidido_por    uuid,
  decidido_at     timestamptz,
  otorgadas       int check (otorgadas is null or otorgadas >= 0),
  created_at      timestamptz not null default now()
);
create index pedidos_de_sillas_pendientes_idx on public.pedidos_de_sillas (organizacion_id, created_at) where estado = 'pendiente';
alter table public.pedidos_de_sillas enable row level security;
create policy pedidos_de_sillas_sel on public.pedidos_de_sillas
  for select to authenticated
  using (public.puedo_administrar_organizacion(organizacion_id)
         or (tenant_id is not null and public.es_dueno_de_agencia(tenant_id))
         or pedido_por = (select auth.uid()));

-- 1b. Historial del cliente (como lumina_org_log).
create table public.organizacion_bitacora (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  tenant_id       uuid references public.tenants(id) on delete set null,
  actor_id        uuid,
  actor_nombre    text,
  actor_tipo      text not null check (actor_tipo in ('plataforma', 'cliente', 'agencia', 'sistema')),
  accion          text not null,
  detalle         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index organizacion_bitacora_org_idx on public.organizacion_bitacora (organizacion_id, created_at desc);
alter table public.organizacion_bitacora enable row level security;
create policy organizacion_bitacora_sel on public.organizacion_bitacora
  for select to authenticated
  using (public.puedo_administrar_organizacion(organizacion_id)
         or (tenant_id is not null and public.es_dueno_de_agencia(tenant_id)));

-- 1c. Avisos del cliente a sus agencias (la entrega —campana/correo— la hace la edge).
create table public.organizacion_avisos (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  titulo          text not null check (length(btrim(titulo)) between 1 and 200),
  cuerpo          text not null check (length(cuerpo) between 1 and 5000),
  -- NULL = a todas las agencias del cliente.
  para_agencias   uuid[],
  creado_por      uuid,
  enviados        int not null default 0,
  created_at      timestamptz not null default now()
);
create index organizacion_avisos_org_idx on public.organizacion_avisos (organizacion_id, created_at desc);
alter table public.organizacion_avisos enable row level security;
create policy organizacion_avisos_sel on public.organizacion_avisos
  for select to authenticated
  using (public.puedo_administrar_organizacion(organizacion_id)
         or (organizacion_id = (select public.mi_organizacion())
             and (para_agencias is null or (select public.current_tenant_id()) = any (para_agencias))));

-- 1d. Enlaces de acceso («Crear mi contraseña»): 7 días, un solo uso, se guarda el hash.
create table public.enlaces_de_acceso (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  organizacion_id uuid references public.organizaciones(id) on delete cascade,
  tenant_id       uuid references public.tenants(id) on delete cascade,
  proposito       text not null default 'crear_contrasena' check (proposito in ('crear_contrasena', 'invitacion', 'recuperar')),
  token_hash      text not null unique,
  -- Quién mandó la invitación (la edge lo pasa): cuenta en la tarjeta «Líder de {Marca}».
  creado_por      uuid,
  expira_at       timestamptz not null default now() + interval '7 days',
  usado_at        timestamptz,
  created_at      timestamptz not null default now()
);
create index enlaces_de_acceso_user_idx on public.enlaces_de_acceso (user_id, created_at desc);
alter table public.enlaces_de_acceso enable row level security;
revoke all on table public.enlaces_de_acceso from public, anon, authenticated;

-- Cliente en preparación: nadie recibe enlaces hasta activarlo (como trg_guard_prep_links).
create function public.enlaces_guarda_preparacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.organizaciones o
     where o.estado = 'preparacion'
       and (o.id = new.organizacion_id
            or o.id = (select t.organizacion_id from public.tenants t where t.id = new.tenant_id)
            or o.id in (select t.organizacion_id from public.tenant_members m join public.tenants t on t.id = m.tenant_id where m.user_id = new.user_id)
            or o.id in (select a.organizacion_id from public.organizacion_admins a where a.user_id = new.user_id))
  ) then
    raise exception using errcode = 'P0001', message = 'org_en_preparacion: el cliente está en preparación; la invitación sale al activarlo';
  end if;
  return new;
end;
$$;
revoke all on function public.enlaces_guarda_preparacion() from public, anon, authenticated;
create trigger enlaces_guarda_preparacion
  before insert on public.enlaces_de_acceso
  for each row execute function public.enlaces_guarda_preparacion();

-- 1e. Saldo de Argos (créditos; Stripe va después). Una billetera por cliente; una
--     agencia suelta tiene la suya. Cada consumo anota la agencia (para el «gastado» por agencia).
create table public.argos_saldo (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid references public.organizaciones(id) on delete cascade,
  tenant_id       uuid references public.tenants(id) on delete cascade,
  saldo_usd       numeric(12, 4) not null default 0,
  -- Sin saldo, Argos se pausa (lo demás de Maven sigue). Se despausa sola al recargar.
  pausado         boolean not null default true,
  pausado_at      timestamptz default now(),
  actualizado_at  timestamptz not null default now(),
  constraint argos_saldo_uno_u_otro check ((organizacion_id is null) <> (tenant_id is null))
);
create unique index argos_saldo_org_idx on public.argos_saldo (organizacion_id) where organizacion_id is not null;
create unique index argos_saldo_tenant_idx on public.argos_saldo (tenant_id) where tenant_id is not null;
alter table public.argos_saldo enable row level security;
create policy argos_saldo_sel on public.argos_saldo
  for select to authenticated
  using ((organizacion_id is not null and public.puedo_administrar_organizacion(organizacion_id))
         or (tenant_id is not null and public.es_dueno_de_agencia(tenant_id)));

create table public.argos_saldo_movimientos (
  id           uuid primary key default gen_random_uuid(),
  billetera_id uuid not null references public.argos_saldo(id) on delete cascade,
  tenant_id    uuid references public.tenants(id) on delete set null,
  tipo         text not null check (tipo in ('plan_mensual', 'recarga', 'consumo', 'ajuste')),
  -- + entra, − sale (consumo siempre negativo).
  usd          numeric(12, 4) not null,
  -- Mes del crédito del plan (uno por mes y billetera).
  periodo      date,
  -- Pago de Stripe, cuando exista.
  referencia   text,
  detalle      jsonb not null default '{}'::jsonb,
  creado_por   uuid,
  created_at   timestamptz not null default now(),
  constraint argos_mov_signo check ((tipo = 'consumo' and usd <= 0) or (tipo in ('plan_mensual', 'recarga') and usd >= 0) or tipo = 'ajuste'),
  constraint argos_mov_periodo check ((tipo = 'plan_mensual') = (periodo is not null))
);
create unique index argos_mov_plan_mes_idx on public.argos_saldo_movimientos (billetera_id, periodo) where tipo = 'plan_mensual';
create index argos_mov_billetera_idx on public.argos_saldo_movimientos (billetera_id, created_at desc);
create index argos_mov_tenant_idx on public.argos_saldo_movimientos (tenant_id, created_at desc) where tipo = 'consumo';
alter table public.argos_saldo_movimientos enable row level security;
create policy argos_saldo_movimientos_sel on public.argos_saldo_movimientos
  for select to authenticated
  using (exists (select 1 from public.argos_saldo b
                  where b.id = billetera_id
                    and ((b.organizacion_id is not null and public.puedo_administrar_organizacion(b.organizacion_id))
                         or (b.tenant_id is not null and public.es_dueno_de_agencia(b.tenant_id))))
         or (tenant_id is not null and tipo = 'consumo' and public.es_dueno_de_agencia(tenant_id)));

-- El saldo es siempre la suma de los movimientos: lo mantiene la base.
create function public.argos_saldo_mover()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.argos_saldo b
     set saldo_usd = b.saldo_usd + new.usd,
         pausado = (b.saldo_usd + new.usd) <= 0,
         pausado_at = case when (b.saldo_usd + new.usd) <= 0 then coalesce(b.pausado_at, now()) else null end,
         actualizado_at = now()
   where b.id = new.billetera_id;
  return new;
end;
$$;
revoke all on function public.argos_saldo_mover() from public, anon, authenticated;
create trigger argos_saldo_mover
  after insert on public.argos_saldo_movimientos
  for each row execute function public.argos_saldo_mover();

-- Cada cliente nace con su billetera (vacía y en pausa hasta el primer crédito).
create function public.organizaciones_billetera()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.argos_saldo (organizacion_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.organizaciones_billetera() from public, anon, authenticated;
create trigger organizaciones_billetera
  after insert on public.organizaciones
  for each row execute function public.organizaciones_billetera();

-- 1f. Socios (como Lumina: invitados por el dueño, levantan demos y onboardings) y briefs.
create table public.socios (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  nombre       text,
  correo       text,
  activo       boolean not null default true,
  invitado_por uuid,
  created_at   timestamptz not null default now()
);
alter table public.socios enable row level security;
create policy socios_sel on public.socios
  for select to authenticated
  using (user_id = (select auth.uid()) or public.es_admin_de_plataforma());
create policy socios_plataforma on public.socios
  for all to authenticated
  using (public.es_admin_de_plataforma())
  with check (public.es_admin_de_plataforma());

create table public.briefs (
  id               uuid primary key default gen_random_uuid(),
  estado           text not null default 'nuevo' check (estado in ('nuevo', 'en_proceso', 'ganado', 'perdido')),
  tipo             text not null default 'demo' check (tipo in ('demo', 'onboarding')),
  idioma           text not null default 'es',
  empresa          text,
  industria        text,
  contacto_nombre  text,
  contacto_correo  text,
  contacto_telefono text,
  tamano_equipo    text,
  notas            text,
  -- Lo demás del formulario (objetivos, urgencia, quién decide…), como en Lumina.
  datos            jsonb not null default '{}'::jsonb,
  archivos         jsonb not null default '[]'::jsonb,
  socio_id         uuid references auth.users(id) on delete set null,
  -- Cuando el brief se vuelve cliente.
  organizacion_id  uuid references public.organizaciones(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index briefs_socio_idx on public.briefs (socio_id, created_at desc);
alter table public.briefs enable row level security;
create policy briefs_sel on public.briefs
  for select to authenticated
  using (public.es_admin_de_plataforma() or socio_id = (select auth.uid()));
create policy briefs_ins on public.briefs
  for insert to authenticated
  with check (public.es_admin_de_plataforma()
              or (socio_id = (select auth.uid())
                  and exists (select 1 from public.socios s where s.user_id = (select auth.uid()) and s.activo)));
create policy briefs_upd on public.briefs
  for update to authenticated
  using (public.es_admin_de_plataforma() or socio_id = (select auth.uid()))
  with check (public.es_admin_de_plataforma() or socio_id = (select auth.uid()));
create policy briefs_del on public.briefs
  for delete to authenticated
  using (public.es_admin_de_plataforma());

-- 1g. Organizaciones de afuera (Kash): tarjeta SOLO PARA MIRAR en el panel del dueño.
--     Kash vive en su propia base (lsagslbkliprespbyhts) y NO se toca: una edge/cron
--     llama a su función de solo lectura (otro carril) y guarda aquí el resumen.
--     Aquí no hay nada que escriba en Kash.
create table public.organizaciones_externas (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  logo_url       text,
  -- A dónde lleva «Entrar» (la app de computador / el Maven de Kash de siempre).
  app_url        text,
  -- {personas, en_vivo, nota_argos_hoy, argos_gastado_mes_usd, argos_saldo_usd, necesita_de_ti, agencias:[…]}
  resumen        jsonb not null default '{}'::jsonb,
  actualizado_at timestamptz,
  orden          int not null default 0,
  created_at     timestamptz not null default now()
);
comment on table public.organizaciones_externas is
  'Clientes que viven fuera del edificio (Kash). Solo mirar: el resumen lo refresca una edge/cron con una lectura de solo lectura.';
alter table public.organizaciones_externas enable row level security;
create policy organizaciones_externas_sel on public.organizaciones_externas
  for select to authenticated using (public.es_admin_de_plataforma());
-- Sin escritura por la API: la refresca el servidor (service_role).

-- ═══ 2. Ayudantes internos ═══════════════════════════════════════════════════

-- El plan como lo puede ver quien llama: completo para el dueño de la plataforma y
-- para el admin de ese cliente; sin precios para el equipo de Maven.
create function public.arbol_plan_visible(_org uuid, _plan jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.arbol_soy_dueno_plataforma()
      or exists (select 1 from public.organizacion_admins a where a.organizacion_id = _org and a.user_id = (select auth.uid()))
      then coalesce(_plan, '{}'::jsonb)
    else coalesce(_plan, '{}'::jsonb) - 'precio_usd' - 'setup_usd' - 'argos_usd_mes'
  end
$$;
revoke all on function public.arbol_plan_visible(uuid, jsonb) from public, anon, authenticated;

create function public.arbol_anotar(_org uuid, _tenant uuid, _accion text, _detalle jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _yo uuid := (select auth.uid());
  _tipo text;
  _nombre text;
begin
  _tipo := case
    when _yo is null then 'sistema'
    when public.es_admin_de_plataforma() then 'plataforma'
    when exists (select 1 from public.organizacion_admins a where a.organizacion_id = _org and a.user_id = _yo) then 'cliente'
    else 'agencia' end;
  select coalesce(nullif(p.full_name, ''), u.email) into _nombre
    from auth.users u left join public.profiles p on p.id = u.id where u.id = _yo;
  insert into public.organizacion_bitacora (organizacion_id, tenant_id, actor_id, actor_nombre, actor_tipo, accion, detalle)
  values (_org, _tenant, _yo, _nombre, _tipo, _accion, coalesce(_detalle, '{}'::jsonb));
end;
$$;
revoke all on function public.arbol_anotar(uuid, uuid, text, jsonb) from public, anon, authenticated;

create function public.arbol_slug(_texto text)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  _base text := left(btrim(regexp_replace(lower(coalesce(_texto, '')), '[^a-z0-9]+', '-', 'g'), '-'), 40);
  _slug text;
begin
  if length(_base) < 2 then _base := 'cliente'; end if;
  _slug := _base;
  while exists (select 1 from public.tenants where slug = _slug)
     or exists (select 1 from public.organizaciones where slug = _slug) loop
    _slug := _base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 5);
  end loop;
  return _slug;
end;
$$;
revoke all on function public.arbol_slug(text) from public, anon, authenticated;

-- La agencia, si quien llama administra su cliente (o es la plataforma). Si no, corta.
create function public.arbol_agencia_que_administro(_tenant uuid)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  _t public.tenants;
begin
  select * into _t from public.tenants where id = _tenant;
  if _t.id is null then
    raise exception using errcode = 'P0002', message = 'agencia_no_existe';
  end if;
  if not (public.arbol_soy_plataforma()
          or (_t.organizacion_id is not null and public.puedo_administrar_organizacion(_t.organizacion_id))) then
    raise exception using errcode = '42501', message = 'sin_permiso: esa agencia no es de tus clientes';
  end if;
  return _t;
end;
$$;
revoke all on function public.arbol_agencia_que_administro(uuid) from public, anon, authenticated;

-- ═══ 3. Plataforma: clientes ═════════════════════════════════════════════════

create function public.crear_organizacion(
  _nombre text, _tipo text default 'normal', _plan jsonb default '{}'::jsonb,
  _marca jsonb default '{}'::jsonb, _es_demo boolean default false, _slug text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  if not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso: solo la plataforma crea clientes';
  end if;
  if not public.arbol_soy_dueno_plataforma()
     and (coalesce(_plan, '{}'::jsonb) - 'nombre' - 'personas') <> '{}'::jsonb then
    raise exception using errcode = '42501', message = 'solo_dueno: el precio del paquete lo pone el dueño de la plataforma';
  end if;
  insert into public.organizaciones (nombre, slug, tipo, plan, marca, es_demo, creada_por)
  values (btrim(_nombre), coalesce(_slug, public.arbol_slug(_nombre)), coalesce(_tipo, 'normal'),
          coalesce(_plan, '{}'::jsonb), coalesce(_marca, '{}'::jsonb), coalesce(_es_demo, false), (select auth.uid()))
  returning id into _id;
  perform public.arbol_anotar(_id, null, 'cliente_creado', jsonb_build_object('nombre', _nombre, 'tipo', _tipo, 'plan', _plan));
  return _id;
end;
$$;

create function public.agregar_admin_organizacion(_org uuid, _user uuid, _principal boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso: solo la plataforma nombra admins del cliente';
  end if;
  if coalesce(_principal, false) then
    update public.organizacion_admins set principal = false where organizacion_id = _org and principal;
  end if;
  insert into public.organizacion_admins (organizacion_id, user_id, principal)
  values (_org, _user, coalesce(_principal, false))
  on conflict (organizacion_id, user_id) do update set principal = excluded.principal;
  perform public.arbol_anotar(_org, null, 'admin_agregado', jsonb_build_object('user_id', _user, 'principal', _principal));
end;
$$;

create function public.quitar_admin_organizacion(_org uuid, _user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso: solo la plataforma quita admins del cliente';
  end if;
  delete from public.organizacion_admins where organizacion_id = _org and user_id = _user;
  delete from public.agencia_en_foco f using public.tenants t
   where f.user_id = _user and t.id = f.tenant_id and t.organizacion_id = _org;
  perform public.arbol_anotar(_org, null, 'admin_quitado', jsonb_build_object('user_id', _user));
end;
$$;

-- «Activar»: sale de preparación. Desde aquí la edge puede mandar invitaciones.
create function public.activar_organizacion(_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _o public.organizaciones;
  _faltan text[] := '{}';
begin
  if not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso: solo la plataforma activa clientes';
  end if;
  select * into _o from public.organizaciones where id = _org for update;
  if _o.id is null then
    raise exception using errcode = 'P0002', message = 'cliente_no_existe';
  end if;
  if _o.estado not in ('preparacion', 'pausada') then
    raise exception using errcode = 'P0001', message = format('estado_invalido: el cliente está %s', _o.estado);
  end if;
  if not exists (select 1 from public.organizacion_admins a where a.organizacion_id = _org) then
    _faltan := array_append(_faltan, 'lider');
  end if;
  if coalesce((_o.plan ->> 'personas')::numeric, 0) <= 0 then
    _faltan := array_append(_faltan, 'paquete');
  end if;
  if cardinality(_faltan) > 0 then
    raise exception using errcode = 'P0001', message = 'faltan_pendientes: ' || array_to_string(_faltan, ', ');
  end if;
  update public.organizaciones set estado = 'activa', activada_at = coalesce(activada_at, now()) where id = _org;
  perform public.arbol_anotar(_org, null, 'cliente_activado', '{}'::jsonb);
  return jsonb_build_object('ok', true, 'estado', 'activa');
end;
$$;

-- ═══ 4. Admin del cliente: agencias ═════════════════════════════════════════

create function public.crear_agencia(_org uuid, _nombre text, _sillas int default 0, _slug text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _o public.organizaciones;
  _id uuid;
begin
  if not public.puedo_administrar_organizacion(_org) then
    raise exception using errcode = '42501', message = 'sin_permiso: no administras ese cliente';
  end if;
  select * into _o from public.organizaciones where id = _org;
  if _o.id is null then
    raise exception using errcode = 'P0002', message = 'cliente_no_existe';
  end if;
  -- Cliente directo = UNA agencia.
  if _o.tipo = 'normal' and exists (select 1 from public.tenants t where t.organizacion_id = _org and t.archivada_at is null) then
    raise exception using errcode = 'P0001', message = 'cliente_directo: un cliente directo tiene una sola agencia';
  end if;
  insert into public.tenants (slug, name, organizacion_id, sillas)
  values (coalesce(_slug, public.arbol_slug(_nombre)), btrim(_nombre), _org, greatest(coalesce(_sillas, 0), 0))
  returning id into _id;
  perform public.arbol_anotar(_org, _id, 'agencia_creada', jsonb_build_object('nombre', _nombre, 'sillas', _sillas));
  return _id;
end;
$$;

create function public.dar_sillas_a_agencia(_tenant uuid, _sillas int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _t public.tenants := public.arbol_agencia_que_administro(_tenant);
begin
  if _t.organizacion_id is null then
    raise exception using errcode = 'P0001', message = 'agencia_sin_cliente: una agencia suelta no tiene tope de sillas';
  end if;
  update public.tenants set sillas = _sillas where id = _tenant;
  perform public.arbol_anotar(_t.organizacion_id, _tenant, 'sillas_cambiadas', jsonb_build_object('antes', _t.sillas, 'ahora', _sillas));
  return jsonb_build_object('ok', true, 'sillas', _sillas, 'personas', public.personas_en_agencia(_tenant));
end;
$$;

create function public.cambiar_dueno_agencia(_tenant uuid, _user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _t public.tenants := public.arbol_agencia_que_administro(_tenant);
  _antes uuid[];
begin
  if not exists (select 1 from public.tenant_members m where m.tenant_id = _tenant and m.user_id = _user) then
    raise exception using errcode = 'P0001', message = 'no_es_de_la_agencia: el dueño nuevo tiene que trabajar en esa agencia';
  end if;
  select coalesce(array_agg(user_id), '{}') into _antes from public.tenant_owners where tenant_id = _tenant;
  delete from public.tenant_owners where tenant_id = _tenant and user_id <> _user;
  insert into public.tenant_owners (tenant_id, user_id) values (_tenant, _user) on conflict do nothing;
  if _t.organizacion_id is not null then
    perform public.arbol_anotar(_t.organizacion_id, _tenant, 'dueno_cambiado', jsonb_build_object('antes', _antes, 'ahora', _user));
  end if;
end;
$$;

-- Archivar libera sus sillas para el resto del paquete; la gente queda, sin entrar nadie nuevo.
create function public.archivar_agencia(_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _t public.tenants := public.arbol_agencia_que_administro(_tenant);
begin
  update public.tenants set archivada_at = coalesce(archivada_at, now()), active = false where id = _tenant;
  delete from public.agencia_en_foco where tenant_id = _tenant;
  if _t.organizacion_id is not null then
    perform public.arbol_anotar(_t.organizacion_id, _tenant, 'agencia_archivada', '{}'::jsonb);
  end if;
end;
$$;

-- Reactivar vuelve a pedir sus sillas al paquete (si no caben, paquete_lleno).
create function public.reactivar_agencia(_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _t public.tenants := public.arbol_agencia_que_administro(_tenant);
begin
  update public.tenants set archivada_at = null, active = true where id = _tenant;
  if _t.organizacion_id is not null then
    perform public.arbol_anotar(_t.organizacion_id, _tenant, 'agencia_reactivada', '{}'::jsonb);
  end if;
end;
$$;

-- Pausar: la marca la lee la app (entrada y Argos). No libera sillas.
create function public.pausar_agencia(_tenant uuid, _pausar boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _t public.tenants := public.arbol_agencia_que_administro(_tenant);
begin
  update public.tenants set pausada_at = case when _pausar then coalesce(pausada_at, now()) else null end where id = _tenant;
  if _t.organizacion_id is not null then
    perform public.arbol_anotar(_t.organizacion_id, _tenant, case when _pausar then 'agencia_pausada' else 'agencia_despausada' end, '{}'::jsonb);
  end if;
end;
$$;

-- «Entrar» a una agencia: desde aquí current_tenant_id() es esa agencia para quien llama.
create function public.entrar_a_agencia(_tenant uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _yo uuid := (select auth.uid());
  _t public.tenants;
begin
  if _yo is null then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if exists (select 1 from public.tenant_members m where m.user_id = _yo) then
    raise exception using errcode = 'P0001', message = 'cuenta_de_agencia: una cuenta de agencia solo ve su agencia';
  end if;
  _t := public.arbol_agencia_que_administro(_tenant);
  insert into public.agencia_en_foco (user_id, tenant_id) values (_yo, _tenant)
  on conflict (user_id) do update set tenant_id = excluded.tenant_id, desde = now();
  if _t.organizacion_id is not null then
    perform public.arbol_anotar(_t.organizacion_id, _tenant, 'entro_a_agencia', '{}'::jsonb);
  end if;
  return _tenant;
end;
$$;

create function public.salir_de_agencia()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.agencia_en_foco where user_id = (select auth.uid());
$$;

create function public.mandar_aviso(_org uuid, _titulo text, _cuerpo text, _agencias uuid[] default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  if not public.puedo_administrar_organizacion(_org) then
    raise exception using errcode = '42501', message = 'sin_permiso: no administras ese cliente';
  end if;
  if _agencias is not null and exists (
    select 1 from unnest(_agencias) a(id)
     where not exists (select 1 from public.tenants t where t.id = a.id and t.organizacion_id = _org)) then
    raise exception using errcode = 'P0001', message = 'agencia_de_otro_cliente: una de esas agencias no es de este cliente';
  end if;
  insert into public.organizacion_avisos (organizacion_id, titulo, cuerpo, para_agencias, creado_por)
  values (_org, btrim(_titulo), _cuerpo, _agencias, (select auth.uid()))
  returning id into _id;
  perform public.arbol_anotar(_org, null, 'aviso_mandado', jsonb_build_object('aviso_id', _id, 'titulo', _titulo, 'agencias', _agencias));
  return _id;
end;
$$;

-- ═══ 5. Pedidos de sillas ════════════════════════════════════════════════════

-- Sin _organizacion: la agencia de quien llama (dueño o admin) le pide a su cliente.
-- Con _organizacion: el admin del cliente le pide a Maven.
create function public.pedir_sillas(_sillas int, _nota text default null, _organizacion uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _t uuid;
  _org uuid;
  _id uuid;
begin
  if _organizacion is null then
    _t := public.equipo_agencia_que_administro();
    select organizacion_id into _org from public.tenants where id = _t;
    if _org is null then
      raise exception using errcode = 'P0001', message = 'agencia_sin_cliente: esta agencia no tiene cliente a quien pedirle';
    end if;
  else
    if not public.puedo_administrar_organizacion(_organizacion) then
      raise exception using errcode = '42501', message = 'sin_permiso: no administras ese cliente';
    end if;
    _org := _organizacion;
  end if;
  insert into public.pedidos_de_sillas (organizacion_id, tenant_id, pedido_por, sillas, nota)
  values (_org, _t, (select auth.uid()), _sillas, _nota)
  returning id into _id;
  perform public.arbol_anotar(_org, _t, case when _t is null then 'pidio_sillas_a_maven' else 'agencia_pidio_sillas' end,
                              jsonb_build_object('pedido_id', _id, 'sillas', _sillas, 'nota', _nota));
  return _id;
end;
$$;

-- Agencia → cliente: decide el admin del cliente y las sillas salen de su paquete
-- (si no caben: paquete_lleno, y el cliente le pide a Maven).
-- Cliente → Maven: decide la plataforma y el paquete del cliente crece.
create function public.decidir_pedido(_pedido uuid, _aprobar boolean, _sillas int default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _p public.pedidos_de_sillas;
  _dar int;
begin
  select * into _p from public.pedidos_de_sillas where id = _pedido for update;
  if _p.id is null then
    raise exception using errcode = 'P0002', message = 'pedido_no_existe';
  end if;
  if _p.tenant_id is null then
    if not public.arbol_soy_plataforma() then
      raise exception using errcode = '42501', message = 'sin_permiso: los pedidos a Maven los decide la plataforma';
    end if;
  elsif not public.puedo_administrar_organizacion(_p.organizacion_id) then
    raise exception using errcode = '42501', message = 'sin_permiso: no administras ese cliente';
  end if;
  if _p.estado <> 'pendiente' then
    raise exception using errcode = 'P0001', message = format('ya_decidido: el pedido está %s', _p.estado);
  end if;

  _dar := case when _aprobar then greatest(coalesce(_sillas, _p.sillas), 0) else 0 end;
  if _aprobar and _dar > 0 then
    if _p.tenant_id is not null then
      update public.tenants set sillas = sillas + _dar where id = _p.tenant_id;
    else
      update public.organizaciones
         set plan = jsonb_set(plan, '{personas}', to_jsonb(coalesce((plan ->> 'personas')::numeric, 0)::int + _dar))
       where id = _p.organizacion_id;
    end if;
  end if;
  update public.pedidos_de_sillas
     set estado = case when _aprobar then 'aprobado' else 'rechazado' end,
         decidido_por = (select auth.uid()), decidido_at = now(), otorgadas = _dar
   where id = _pedido;
  perform public.arbol_anotar(_p.organizacion_id, _p.tenant_id,
                              case when _aprobar then 'pedido_aprobado' else 'pedido_rechazado' end,
                              jsonb_build_object('pedido_id', _pedido, 'pedidas', _p.sillas, 'otorgadas', _dar));
  return jsonb_build_object('ok', true, 'estado', case when _aprobar then 'aprobado' else 'rechazado' end, 'otorgadas', _dar);
end;
$$;

-- ═══ 6. Lecturas para los paneles ════════════════════════════════════════════

-- La marca para quien trabaja en una agencia: «X · powered by Maven». Sin plan ni cobro.
create function public.marca_de_mi_organizacion()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('organizacion_id', o.id, 'nombre', coalesce(o.marca ->> 'nombre', o.nombre), 'logo_url', o.marca ->> 'logo_url')
    from public.organizaciones o
   where o.id = coalesce(public.mi_organizacion(),
                         (select a.organizacion_id from public.organizacion_admins a where a.user_id = (select auth.uid()) order by a.principal desc, a.created_at limit 1))
$$;

-- La fila desplegable de «Tus agencias»: dueño, admins, supervisores, empleados.
create function public.personas_de_agencia(_tenant uuid)
returns table (user_id uuid, nombre text, correo text, nivel text, roles text[], es_dueno boolean, en_vivo boolean, desde timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.es_dueno_de_agencia(_tenant) then
    raise exception using errcode = '42501', message = 'sin_permiso: esa agencia no es tuya';
  end if;
  return query
  select tm.user_id,
         coalesce(nullif(p.full_name, ''), u.email)::text,
         u.email::text,
         p.nivel::text,
         coalesce((select array_agg(ur.role::text order by ur.role::text) from public.user_roles ur where ur.user_id = tm.user_id), '{}'),
         exists (select 1 from public.tenant_owners o where o.tenant_id = _tenant and o.user_id = tm.user_id),
         exists (select 1 from public.cowork_tiempo_segmentos s
                  where s.user_id = tm.user_id and s.ended_at is null and s.last_seen_at > now() - interval '90 seconds'),
         tm.created_at
    from public.tenant_members tm
    join auth.users u on u.id = tm.user_id
    left join public.profiles p on p.id = tm.user_id
   where tm.tenant_id = _tenant
     and p.deleted_at is null
   order by 6 desc, 2;
end;
$$;

-- El tablero de sillas del cliente (OrgSeatsBoard de Lumina, con las columnas de Maven).
--   En vivo: segmento de Cowork abierto con latido de hace < 90 s (como fuera_de_cowork).
--   Nota de Argos hoy: la fórmula del día de api_equipo_notas (pantalla 45 · cámara 35 ·
--     foco 20), promedio de quienes tienen datos hoy (hora del cliente). null = sin datos.
--   Necesita de ti: pedidos de sillas pendientes + alertas graves abiertas de Argos +
--     agencia llena + agencia sin dueño.
create function public.resumen_organizacion(_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _o public.organizaciones;
  _ini timestamptz;
  _fin timestamptz;
  _mes timestamptz;
  _agencias jsonb;
  _b public.argos_saldo;
begin
  if not public.puedo_administrar_organizacion(_org) then
    raise exception using errcode = '42501', message = 'sin_permiso: no administras ese cliente';
  end if;
  select * into _o from public.organizaciones where id = _org;
  if _o.id is null then
    raise exception using errcode = 'P0002', message = 'cliente_no_existe';
  end if;
  _ini := (now() at time zone _o.zona_horaria)::date::timestamp at time zone _o.zona_horaria;
  _fin := _ini + interval '1 day';
  _mes := date_trunc('month', now() at time zone _o.zona_horaria) at time zone _o.zona_horaria;
  select * into _b from public.argos_saldo where organizacion_id = _org;

  with ag as (
    select t.* from public.tenants t where t.organizacion_id = _org
  ),
  gente as (
    select tm.tenant_id, tm.user_id
      from public.tenant_members tm
      join ag on ag.id = tm.tenant_id
      join auth.users u on u.id = tm.user_id
      left join public.profiles p on p.id = tm.user_id
     where coalesce(u.raw_app_meta_data ->> 'tipo', '') <> 'creadora'
       and p.deleted_at is null
  ),
  vivo as (
    select g.tenant_id, count(distinct s.user_id)::int as n
      from gente g join public.cowork_tiempo_segmentos s on s.user_id = g.user_id
     where s.ended_at is null and s.last_seen_at > now() - interval '90 seconds'
     group by g.tenant_id
  ),
  segs as (
    select g.tenant_id, g.user_id,
           sum(case when s.estado in ('activo', 'pausa') then coalesce(s.seconds, 0) else 0 end)::numeric as seg_pantalla
      from gente g join public.cowork_tiempo_segmentos s on s.user_id = g.user_id
     where s.started_at >= _ini and s.started_at < _fin
     group by g.tenant_id, g.user_id
  ),
  caps as (
    select g.tenant_id, g.user_id,
           count(*) filter (where c.tipo = 'camara') as cap_camara,
           count(*) filter (where c.tipo = 'camara' and c.cara_visible is true) as cap_cara,
           count(*) filter (where c.tipo = 'pantalla') as cap_pantalla,
           count(*) filter (where c.fuera_de_lugar is true and c.perdonado is not true) as cap_distraido
      from gente g join public.monitor_capturas c on c.user_id = g.user_id
     where c.created_at >= _ini and c.created_at < _fin
     group by g.tenant_id, g.user_id
  ),
  notas as (
    select coalesce(s.tenant_id, c.tenant_id) as tenant_id,
           round((least(1.0, coalesce(s.seg_pantalla, 0) / (8 * 3600.0)) * 45)::numeric, 1)
           + case when coalesce(c.cap_camara, 0) > 0 then round((c.cap_cara::numeric / c.cap_camara) * 35, 1) else 0 end
           + case when coalesce(c.cap_pantalla, 0) > 0 then round((1 - (c.cap_distraido::numeric / c.cap_pantalla)) * 20, 1) else 20 end
             as nota
      from segs s full join caps c on c.user_id = s.user_id
  ),
  nota_ag as (
    select tenant_id, round(avg(nota), 0)::int as nota, count(*)::int as con_datos from notas group by tenant_id
  ),
  alertas as (
    select a.tenant_id, count(*)::int as abiertas, count(*) filter (where a.gravedad >= 3)::int as graves
      from public.argos_alertas a join ag on ag.id = a.tenant_id
     where a.cerrada_at is null
     group by a.tenant_id
  ),
  pedidos as (
    select p.tenant_id, count(*)::int as n
      from public.pedidos_de_sillas p
     where p.organizacion_id = _org and p.tenant_id is not null and p.estado = 'pendiente'
     group by p.tenant_id
  ),
  gasto as (
    select m.tenant_id, round(-sum(m.usd), 2) as usd
      from public.argos_saldo_movimientos m
     where m.billetera_id = _b.id and m.tipo = 'consumo' and m.created_at >= _mes
     group by m.tenant_id
  ),
  duenos as (
    select o.tenant_id, jsonb_agg(jsonb_build_object('user_id', o.user_id, 'nombre', coalesce(nullif(p.full_name, ''), u.email))) as lista
      from public.tenant_owners o
      join ag on ag.id = o.tenant_id
      left join auth.users u on u.id = o.user_id
      left join public.profiles p on p.id = o.user_id
     group by o.tenant_id
  ),
  filas as (
    select ag.id, ag.name, ag.slug, ag.sillas, ag.archivada_at, ag.pausada_at, ag.created_at,
           public.personas_en_agencia(ag.id) as personas,
           coalesce(v.n, 0) as en_vivo,
           na.nota, coalesce(na.con_datos, 0) as con_datos,
           coalesce(al.abiertas, 0) as alertas_abiertas, coalesce(al.graves, 0) as alertas_graves,
           coalesce(pe.n, 0) as pedidos,
           coalesce(ga.usd, 0) as argos_gastado_mes,
           coalesce(du.lista, '[]'::jsonb) as duenos
      from ag
      left join vivo v on v.tenant_id = ag.id
      left join nota_ag na on na.tenant_id = ag.id
      left join alertas al on al.tenant_id = ag.id
      left join pedidos pe on pe.tenant_id = ag.id
      left join gasto ga on ga.tenant_id = ag.id
      left join duenos du on du.tenant_id = ag.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'nombre', f.name, 'slug', f.slug,
           'sillas', f.sillas, 'personas', f.personas, 'libres', greatest(f.sillas - f.personas, 0),
           'llena', f.archivada_at is null and f.personas >= f.sillas,
           'en_vivo', f.en_vivo,
           'nota_argos_hoy', f.nota, 'nota_con_datos', f.con_datos,
           'argos_gastado_mes_usd', f.argos_gastado_mes,
           'alertas_abiertas', f.alertas_abiertas,
           'duenos', f.duenos,
           'pausada', f.pausada_at is not null,
           'archivada', f.archivada_at is not null, 'archivada_at', f.archivada_at,
           'necesita_de_ti', case when f.archivada_at is not null then 0 else
               f.pedidos + f.alertas_graves
               + (case when f.personas >= f.sillas then 1 else 0 end)
               + (case when jsonb_array_length(f.duenos) = 0 then 1 else 0 end) end,
           'necesita_detalle', jsonb_build_object(
               'pedidos_de_sillas', f.pedidos, 'alertas_graves', f.alertas_graves,
               'llena', f.personas >= f.sillas, 'sin_dueno', jsonb_array_length(f.duenos) = 0)
         ) order by f.archivada_at nulls first, f.created_at), '[]'::jsonb)
    into _agencias
    from filas f;

  return jsonb_build_object(
    'organizacion', jsonb_build_object('id', _o.id, 'nombre', _o.nombre, 'slug', _o.slug, 'tipo', _o.tipo,
                                       'estado', _o.estado, 'es_demo', _o.es_demo,
                                       'plan', public.arbol_plan_visible(_org, _o.plan), 'marca', _o.marca),
    'paquete', coalesce((_o.plan ->> 'personas')::numeric, 0)::int,
    'repartidas', (select coalesce(sum((a ->> 'sillas')::int), 0) from jsonb_array_elements(_agencias) a where not (a ->> 'archivada')::boolean),
    'ocupadas', (select coalesce(sum((a ->> 'personas')::int), 0) from jsonb_array_elements(_agencias) a where not (a ->> 'archivada')::boolean),
    'libres', coalesce((_o.plan ->> 'personas')::numeric, 0)::int
              - (select coalesce(sum((a ->> 'sillas')::int), 0) from jsonb_array_elements(_agencias) a where not (a ->> 'archivada')::boolean),
    'agencias_activas', (select count(*) from jsonb_array_elements(_agencias) a where not (a ->> 'archivada')::boolean),
    'en_vivo', (select coalesce(sum((a ->> 'en_vivo')::int), 0) from jsonb_array_elements(_agencias) a),
    'argos', jsonb_build_object('saldo_usd', coalesce(_b.saldo_usd, 0), 'pausado', coalesce(_b.pausado, true),
                                'argos_usd_mes', (public.arbol_plan_visible(_org, _o.plan) ->> 'argos_usd_mes')::numeric),
    'pedidos_a_maven_pendientes', (select count(*) from public.pedidos_de_sillas p where p.organizacion_id = _org and p.tenant_id is null and p.estado = 'pendiente'),
    'necesita_de_ti', (select coalesce(sum((a ->> 'necesita_de_ti')::int), 0) from jsonb_array_elements(_agencias) a)
                      + (case when coalesce(_b.pausado, true) then 1 else 0 end),
    'agencias', _agencias
  );
end;
$$;

-- «Ve su plan y sus pagos»: el admin del cliente y el dueño de la plataforma. El
-- equipo de Maven recibe el plan sin precios y sin cobro.
create function public.plan_de_organizacion(_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _o public.organizaciones;
  _completo boolean;
begin
  if not public.puedo_administrar_organizacion(_org) then
    raise exception using errcode = '42501', message = 'sin_permiso: no administras ese cliente';
  end if;
  select * into _o from public.organizaciones where id = _org;
  _completo := public.arbol_soy_dueno_plataforma()
               or exists (select 1 from public.organizacion_admins a where a.organizacion_id = _org and a.user_id = (select auth.uid()));
  return jsonb_build_object(
    'plan', public.arbol_plan_visible(_org, _o.plan),
    'cobro', case when _completo then _o.cobro end,
    've_precios', _completo);
end;
$$;

-- La tarjeta «Líder de {Marca}» (lumina_org_leaders): por cada admin del cliente.
--   correo_madre = el admin principal. Agencias creadas, invitaciones mandadas y sillas
--   repartidas salen de la bitácora (lo que hizo esa cuenta); los pedidos sin responder
--   son los de las agencias del cliente (cualquier admin los puede decidir).
create function public.lideres_de_organizacion(_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _r jsonb;
begin
  if not public.puedo_administrar_organizacion(_org) then
    raise exception using errcode = '42501', message = 'sin_permiso: no administras ese cliente';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', a.user_id,
           'nombre', coalesce(nullif(p.full_name, ''), u.email),
           'correo', u.email,
           'correo_madre', a.principal,
           'admin_desde', a.created_at,
           'ultimo_ingreso', u.last_sign_in_at,
           'ultima_accion', (select max(b.created_at) from public.organizacion_bitacora b
                              where b.organizacion_id = _org and b.actor_id = a.user_id),
           'agencias_creadas', (select count(*) from public.organizacion_bitacora b
                                 where b.organizacion_id = _org and b.actor_id = a.user_id and b.accion = 'agencia_creada'),
           'invitaciones_mandadas', (select count(*) from public.organizacion_bitacora b
                                      where b.organizacion_id = _org and b.actor_id = a.user_id and b.accion = 'invitacion_mandada'),
           'sillas_repartidas', (select coalesce(sum(case b.accion
                                     when 'agencia_creada' then coalesce((b.detalle ->> 'sillas')::int, 0)
                                     when 'sillas_cambiadas' then coalesce((b.detalle ->> 'ahora')::int, 0) - coalesce((b.detalle ->> 'antes')::int, 0)
                                     when 'pedido_aprobado' then case when b.tenant_id is not null then coalesce((b.detalle ->> 'otorgadas')::int, 0) else 0 end
                                     else 0 end), 0)
                                   from public.organizacion_bitacora b
                                  where b.organizacion_id = _org and b.actor_id = a.user_id),
           'pedidos_sin_responder', (select count(*) from public.pedidos_de_sillas pe
                                      where pe.organizacion_id = _org and pe.tenant_id is not null and pe.estado = 'pendiente'),
           'ultimas_acciones', coalesce((select jsonb_agg(jsonb_build_object('accion', x.accion, 'tenant_id', x.tenant_id,
                                                                            'detalle', x.detalle, 'at', x.created_at) order by x.created_at desc)
                                           from (select b.* from public.organizacion_bitacora b
                                                  where b.organizacion_id = _org and b.actor_id = a.user_id
                                                  order by b.created_at desc limit 5) x), '[]'::jsonb)
         ) order by a.principal desc, a.created_at), '[]'::jsonb)
    into _r
    from public.organizacion_admins a
    join auth.users u on u.id = a.user_id
    left join public.profiles p on p.id = a.user_id
   where a.organizacion_id = _org;
  return _r;
end;
$$;

-- «Tus organizaciones» del panel del dueño: cada cliente del edificio con sus números,
-- más las tarjetas de afuera (Kash) para mirar. El equipo de Maven lo ve sin precios.
create function public.organizaciones_del_dueno()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _clientes jsonb := '[]'::jsonb;
  _externas jsonb;
  r record;
  _res jsonb;
begin
  if not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso: solo la plataforma';
  end if;
  for r in select o.id from public.organizaciones o order by o.es_demo, o.estado = 'archivada', o.created_at loop
    _res := public.resumen_organizacion(r.id);
    _clientes := _clientes || jsonb_build_array(jsonb_build_object(
      'id', r.id,
      'organizacion', _res -> 'organizacion',
      'paquete', _res -> 'paquete', 'repartidas', _res -> 'repartidas', 'ocupadas', _res -> 'ocupadas',
      'agencias_activas', _res -> 'agencias_activas', 'en_vivo', _res -> 'en_vivo',
      'nota_argos_hoy', (select round(avg((a ->> 'nota_argos_hoy')::numeric))::int
                           from jsonb_array_elements(_res -> 'agencias') a
                          where jsonb_typeof(a -> 'nota_argos_hoy') = 'number'),
      'argos', _res -> 'argos',
      'pedidos_a_maven_pendientes', _res -> 'pedidos_a_maven_pendientes',
      'necesita_de_ti', _res -> 'necesita_de_ti',
      'solo_mirar', false));
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'nombre', e.nombre, 'logo_url', e.logo_url, 'app_url', e.app_url,
           'resumen', e.resumen, 'actualizado_at', e.actualizado_at, 'solo_mirar', true) order by e.orden, e.nombre), '[]'::jsonb)
    into _externas
    from public.organizaciones_externas e;
  return jsonb_build_object('clientes', _clientes, 'externas', _externas, 've_precios', public.arbol_soy_dueno_plataforma());
end;
$$;

-- ═══ 7. Enlaces de acceso (los usa la edge, con la llave de servicio) ═══════

create function public.crear_enlace_de_acceso(_user uuid, _proposito text default 'crear_contrasena', _tenant uuid default null,
                                               _org uuid default null, _creado_por uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  _token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  _o uuid := coalesce(_org, (select t.organizacion_id from public.tenants t where t.id = _tenant));
begin
  if not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso: los enlaces los crea el servidor';
  end if;
  -- Un enlace nuevo deja sin efecto los anteriores del mismo propósito.
  update public.enlaces_de_acceso set usado_at = now()
   where user_id = _user and proposito = _proposito and usado_at is null;
  insert into public.enlaces_de_acceso (user_id, organizacion_id, tenant_id, proposito, token_hash, creado_por)
  values (_user, _org, _tenant, _proposito, encode(sha256(convert_to(_token, 'UTF8')), 'hex'), _creado_por);
  if _o is not null and _proposito <> 'recuperar' then
    insert into public.organizacion_bitacora (organizacion_id, tenant_id, actor_id, actor_tipo, accion, detalle)
    values (_o, _tenant, _creado_por, case when _creado_por is null then 'sistema' else 'cliente' end,
            'invitacion_mandada', jsonb_build_object('user_id', _user, 'proposito', _proposito));
  end if;
  return _token;
end;
$$;

create function public.usar_enlace_de_acceso(_token text, _proposito text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _e public.enlaces_de_acceso;
begin
  if not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso: los enlaces los usa el servidor';
  end if;
  select * into _e from public.enlaces_de_acceso
   where token_hash = encode(sha256(convert_to(coalesce(_token, ''), 'UTF8')), 'hex')
   for update;
  if _e.id is null or (_proposito is not null and _e.proposito <> _proposito) then
    raise exception using errcode = 'P0002', message = 'enlace_no_existe';
  end if;
  if _e.usado_at is not null then
    raise exception using errcode = 'P0001', message = 'enlace_usado';
  end if;
  if _e.expira_at <= now() then
    raise exception using errcode = 'P0001', message = 'enlace_vencido';
  end if;
  update public.enlaces_de_acceso set usado_at = now() where id = _e.id;
  return _e.user_id;
end;
$$;

-- ═══ 8. Saldo de Argos (los usa argos-mirar y, después, el webhook de Stripe) ═

-- La billetera que paga a esta agencia: la de su cliente, o la propia si es suelta.
create function public.argos_billetera_de(_tenant uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _org uuid;
  _id uuid;
begin
  select organizacion_id into _org from public.tenants where id = _tenant;
  if _org is not null then
    select id into _id from public.argos_saldo where organizacion_id = _org;
    if _id is null then
      insert into public.argos_saldo (organizacion_id) values (_org) on conflict do nothing;
      select id into _id from public.argos_saldo where organizacion_id = _org;
    end if;
  else
    select id into _id from public.argos_saldo where tenant_id = _tenant;
    if _id is null then
      insert into public.argos_saldo (tenant_id) values (_tenant) on conflict do nothing;
      select id into _id from public.argos_saldo where tenant_id = _tenant;
    end if;
  end if;
  return _id;
end;
$$;
revoke all on function public.argos_billetera_de(uuid) from public, anon, authenticated;

-- ¿Argos puede juzgar a esta agencia? (antes de pagarle a la IA)
create function public.argos_puede_juzgar(_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select not b.pausado and b.saldo_usd > 0
      from public.argos_saldo b
      join public.tenants t on t.id = _tenant
     where (t.organizacion_id is not null and b.organizacion_id = t.organizacion_id)
        or (t.organizacion_id is null and b.tenant_id = t.id)
  ), false)
$$;

-- Cobra lo que YA se gastó (siempre se anota, aunque deje el saldo en negativo);
-- si el saldo llega a 0, Argos queda en pausa.
create function public.argos_cobrar(_tenant uuid, _usd numeric, _detalle jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _b uuid;
  _r public.argos_saldo;
begin
  if not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'sin_permiso: el consumo lo anota el servidor';
  end if;
  if _usd is null or _usd < 0 then
    raise exception using errcode = '22023', message = 'monto_invalido';
  end if;
  _b := public.argos_billetera_de(_tenant);
  perform 1 from public.argos_saldo where id = _b for update;
  insert into public.argos_saldo_movimientos (billetera_id, tenant_id, tipo, usd, detalle)
  values (_b, _tenant, 'consumo', -_usd, coalesce(_detalle, '{}'::jsonb));
  select * into _r from public.argos_saldo where id = _b;
  return jsonb_build_object('saldo_usd', _r.saldo_usd, 'pausado', _r.pausado);
end;
$$;

-- Crédito: recarga (Stripe), plan mensual o ajuste. Para un cliente (_org) o una agencia suelta (_tenant).
create function public.argos_acreditar(_org uuid, _tenant uuid, _tipo text, _usd numeric, _referencia text default null, _detalle jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _b uuid;
  _r public.argos_saldo;
begin
  if not public.arbol_soy_dueno_plataforma() then
    raise exception using errcode = '42501', message = 'solo_dueno: los créditos de Argos los pone el dueño de la plataforma (o Stripe)';
  end if;
  if _tipo not in ('recarga', 'ajuste', 'plan_mensual') then
    raise exception using errcode = '22023', message = 'tipo_invalido';
  end if;
  if _org is not null then
    insert into public.argos_saldo (organizacion_id) values (_org) on conflict do nothing;
    select id into _b from public.argos_saldo where organizacion_id = _org;
  else
    _b := public.argos_billetera_de(_tenant);
  end if;
  perform 1 from public.argos_saldo where id = _b for update;
  insert into public.argos_saldo_movimientos (billetera_id, tipo, usd, periodo, referencia, detalle, creado_por)
  values (_b, _tipo, _usd,
          case when _tipo = 'plan_mensual' then date_trunc('month', now())::date end,
          _referencia, coalesce(_detalle, '{}'::jsonb), (select auth.uid()));
  select * into _r from public.argos_saldo where id = _b;
  if _r.organizacion_id is not null then
    perform public.arbol_anotar(_r.organizacion_id, null, 'argos_credito', jsonb_build_object('tipo', _tipo, 'usd', _usd, 'referencia', _referencia));
  end if;
  return jsonb_build_object('saldo_usd', _r.saldo_usd, 'pausado', _r.pausado);
end;
$$;

-- El crédito del plan de cada mes (para un cron el día 1). Una vez por mes y cliente
-- (el índice argos_mov_plan_mes_idx lo garantiza). Devuelve cuántos acreditó.
create function public.argos_acreditar_planes(_mes date default null)
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
     where o.estado = 'activa' and coalesce((o.plan ->> 'argos_usd_mes')::numeric, 0) > 0
  loop
    insert into public.argos_saldo (organizacion_id) values (r.id) on conflict do nothing;
    insert into public.argos_saldo_movimientos (billetera_id, tipo, usd, periodo, detalle)
    select b.id, 'plan_mensual', r.usd, _periodo, jsonb_build_object('plan', true)
      from public.argos_saldo b where b.organizacion_id = r.id
    on conflict do nothing;
    if found then _n := _n + 1; end if;
  end loop;
  return _n;
end;
$$;

-- ═══ 9. Quién puede llamar qué ═══════════════════════════════════════════════
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.crear_organizacion(text, text, jsonb, jsonb, boolean, text)',
    'public.agregar_admin_organizacion(uuid, uuid, boolean)',
    'public.quitar_admin_organizacion(uuid, uuid)',
    'public.activar_organizacion(uuid)',
    'public.crear_agencia(uuid, text, int, text)',
    'public.dar_sillas_a_agencia(uuid, int)',
    'public.cambiar_dueno_agencia(uuid, uuid)',
    'public.archivar_agencia(uuid)',
    'public.reactivar_agencia(uuid)',
    'public.pausar_agencia(uuid, boolean)',
    'public.entrar_a_agencia(uuid)',
    'public.salir_de_agencia()',
    'public.mandar_aviso(uuid, text, text, uuid[])',
    'public.pedir_sillas(int, text, uuid)',
    'public.decidir_pedido(uuid, boolean, int)',
    'public.marca_de_mi_organizacion()',
    'public.personas_de_agencia(uuid)',
    'public.resumen_organizacion(uuid)',
    'public.plan_de_organizacion(uuid)',
    'public.lideres_de_organizacion(uuid)',
    'public.organizaciones_del_dueno()',
    -- Adentro exige al dueño de la plataforma (ajustes y recargas a mano); Grace no.
    'public.argos_acreditar(uuid, uuid, text, numeric, text, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  -- Solo el servidor.
  foreach f in array array[
    'public.crear_enlace_de_acceso(uuid, text, uuid, uuid, uuid)',
    'public.usar_enlace_de_acceso(text, text)',
    'public.argos_puede_juzgar(uuid)',
    'public.argos_cobrar(uuid, numeric, jsonb)',
    'public.argos_acreditar_planes(date)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
