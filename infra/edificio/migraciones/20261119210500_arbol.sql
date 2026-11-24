-- VAGÓN 3 · EL ÁRBOL (1 de 2): dueño de la plataforma → clientes → agencias → personas.
-- ⚠️ SOLO PARA EL EDIFICIO maven-agencias (ezeigddgkaemxpshghmu). NUNCA en Kash
-- (lsagslbkliprespbyhts). Ver infra/edificio/migraciones/README.md.
-- Spec: docs/maven-como-lumina-spec.md. Banco: infra/edificio/tests/arbol.ts.
--
-- Diseño (decidido el 19/11):
--   · AGENCIA = el tenant de siempre. Todo el RLS por tenant que ya existe sirve tal cual.
--   · CLIENTE = organizaciones (nueva), padre de tenants (tenants.organizacion_id;
--     NULL = agencia suelta, como la «Agencia de prueba»).
--   · ADMIN DEL CLIENTE = organizacion_admins: cuentas a nivel cliente, NUNCA miembros
--     de una agencia (una cuenta por agencia se mantiene: tenant_members UNIQUE(user_id)).
--   · PLATAFORMA = plataforma_admins, con dos niveles (decisión del 19/11, tanda 5):
--       dueno → rusin24@gmail.com: todo, precios y cobros incluidos.
--       admin → Grace (cuenta aparte en el edificio): todo MENOS precios y cobros
--               (precio del plan, cobro, créditos/recargas de Argos, facturas).
--
-- Cómo el admin del cliente ve sus agencias «como dueño» sin reescribir cientos de
-- políticas (detalle en el README):
--   1. «Agencia en foco» (agencia_en_foco): el admin del cliente (o de la plataforma)
--      ENTRA a una de sus agencias (entrar_a_agencia, en la parte 2) y
--      current_tenant_id() le devuelve esa agencia. Así las ~100 políticas y ~50
--      funciones que filtran por current_tenant_id() le abren esa agencia, y solo esa.
--      Quien es miembro de una agencia sigue con la suya: la membresía gana siempre.
--   2. es_dueno_de_agencia(t) / soy_dueno_aqui(): «dueño» con nombre de agencia
--      (tenant_owners, admin del cliente de esa agencia, o plataforma).
--      es_dueno(uid) NO se toca: no sabe de agencias, y abrirlo a los admins del
--      cliente abriría las 24 políticas que lo usan sin filtro de agencia.
--   3. Se amplían, sin cambiar lo que ya responden, las funciones con agencia:
--      es_dueno_de_la_agencia_de, equipo_agencia_que_administro y puede_vigilar_a.
--   4. Las políticas que piden es_dueno/es_admin_o_dueno de quien llama Y filtran por
--      current_tenant_id() suman «o soy_dueno_aqui()» (reescritas desde pg_policies).
--
-- Vuelta atrás (las líneas «--|»; el banco las corre). Antes, la parte 2.
--| do $$ declare r record; begin for r in select sentencia from public.arbol_respaldo order by orden loop execute r.sentencia; end loop; end $$;
--| drop table public.arbol_respaldo;
--| drop trigger if exists tenant_members_sillas on public.tenant_members;
--| drop trigger if exists tenant_members_no_admin_cliente on public.tenant_members;
--| drop trigger if exists organizacion_admins_no_miembro on public.organizacion_admins;
--| drop trigger if exists tenants_arbol on public.tenants;
--| drop function if exists public.tenant_members_sillas();
--| drop function if exists public.tenant_members_no_admin_cliente();
--| drop function if exists public.tenants_arbol();
--| drop table if exists public.agencia_en_foco;
--| drop table if exists public.organizacion_admins;
--| alter table public.tenants drop column organizacion_id, drop column sillas, drop column archivada_at, drop column pausada_at;
--| drop table if exists public.organizaciones;
--| drop function if exists public.soy_dueno_aqui();
--| drop function if exists public.tenants_visibles();
--| drop function if exists public.mi_organizacion();
--| drop function if exists public.puedo_administrar_organizacion(uuid);
--| drop function if exists public.mis_organizaciones();
--| drop function if exists public.es_dueno_de_agencia(uuid);
--| drop function if exists public.personas_en_agencia(uuid);
--| drop function if exists public.arbol_soy_dueno_plataforma();
--| drop function if exists public.arbol_soy_plataforma();
--| drop function if exists public.es_dueno_de_plataforma();
--| alter table public.plataforma_admins drop column if exists nivel;
--| drop function if exists public.organizaciones_guarda();

-- ─── 0. Candado: esto no es Kash ─────────────────────────────────────────────
-- Kash tiene a sus dueños de hoy en tenant_owners (02/11) y su agencia asm-tech
-- con 90+ personas. Si aparece su tenant, la migración se niega.
do $$
begin
  if exists (select 1 from public.tenants where id = '30869615-f579-4981-8a1f-dbebc61eae2d') then
    raise exception 'arbol: esta base tiene el tenant de Kash; esta migración es SOLO para el edificio maven-agencias';
  end if;
end $$;

-- Respaldo de lo que se reescribe (funciones y políticas), para la vuelta atrás.
create table public.arbol_respaldo (
  orden     int generated always as identity primary key,
  que       text not null,
  sentencia text not null
);
alter table public.arbol_respaldo enable row level security;
revoke all on table public.arbol_respaldo from public, anon, authenticated;

insert into public.arbol_respaldo (que, sentencia)
select 'funcion ' || p.proname, pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('current_tenant_id', 'es_dueno_de_la_agencia_de', 'equipo_agencia_que_administro', 'puede_vigilar_a');

do $$
declare
  n int;
begin
  select count(*) into n from public.arbol_respaldo;
  if n <> 4 then
    raise exception 'arbol: esperaba 4 funciones base (current_tenant_id, es_dueno_de_la_agencia_de, equipo_agencia_que_administro, puede_vigilar_a) y hay %', n;
  end if;
end $$;

-- ─── 1. Clientes ─────────────────────────────────────────────────────────────
create table public.organizaciones (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null check (length(btrim(nombre)) between 1 and 120),
  slug         text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  -- marca_blanca: tiene agencias (como Blu). normal: directo a sus empleados (UNA agencia).
  tipo         text not null default 'normal' check (tipo in ('marca_blanca', 'normal')),
  -- Nace en preparación: nadie recibe correos ni enlaces hasta activar_organizacion.
  estado       text not null default 'preparacion' check (estado in ('preparacion', 'activa', 'pausada', 'archivada')),
  es_demo      boolean not null default false,
  -- {nombre: equipo|empresa|enterprise, precio_usd, personas, argos_usd_mes}
  plan         jsonb not null default '{}'::jsonb,
  -- {nombre, logo_url}: «X · powered by Maven».
  marca        jsonb not null default '{}'::jsonb,
  -- Datos de cobro (Stripe va después): {stripe_customer_id, correo, ...}
  cobro        jsonb not null default '{}'::jsonb,
  zona_horaria text not null default 'America/Bogota',
  creada_por   uuid,
  activada_at  timestamptz,
  archivada_at timestamptz,
  created_at   timestamptz not null default now(),
  constraint organizaciones_plan_personas check (
    not (plan ? 'personas') or (jsonb_typeof(plan -> 'personas') = 'number' and (plan ->> 'personas')::numeric >= 0)
  ),
  constraint organizaciones_plan_nombre check (
    not (plan ? 'nombre') or plan ->> 'nombre' in ('equipo', 'empresa', 'enterprise')
  )
);

comment on table public.organizaciones is
  'Clientes de Maven (padres de las agencias = tenants). Solo en el edificio maven-agencias. Se escribe por las funciones del árbol.';

-- El tamaño del paquete, legible sin abrir el plan (que trae el precio).
alter table public.organizaciones
  add column personas int generated always as (coalesce((plan ->> 'personas')::numeric, 0)::int) stored;

alter table public.organizaciones enable row level security;

-- plan (trae el precio) y cobro NO se leen directo por la API: el equipo de Maven no
-- ve precios ni cobros. Se leen con plan_de_organizacion() (parte 2), que se los da al
-- dueño de la plataforma y al admin de ESE cliente («ve su plan y sus pagos»).
revoke select on table public.organizaciones from anon, authenticated;
grant select (id, nombre, slug, tipo, estado, es_demo, personas, marca, zona_horaria,
              creada_por, activada_at, archivada_at, created_at)
  on public.organizaciones to authenticated;

-- Las agencias cuelgan del cliente.
alter table public.tenants
  add column organizacion_id uuid references public.organizaciones(id) on delete restrict,
  add column sillas int not null default 0 check (sillas >= 0),
  add column archivada_at timestamptz,
  add column pausada_at timestamptz;

create index tenants_organizacion_idx on public.tenants (organizacion_id) where organizacion_id is not null;

comment on column public.tenants.organizacion_id is 'El cliente de esta agencia. NULL = agencia suelta (sin tope de sillas).';
comment on column public.tenants.sillas is 'Sillas que el cliente le dio a la agencia: tope de personas. La suma de las agencias no archivadas no pasa de plan.personas.';

-- ─── 2. Admins del cliente ───────────────────────────────────────────────────
create table public.organizacion_admins (
  organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  principal       boolean not null default false,
  created_at      timestamptz not null default now(),
  primary key (organizacion_id, user_id)
);
create index organizacion_admins_user_idx on public.organizacion_admins (user_id);
create unique index organizacion_admins_un_principal on public.organizacion_admins (organizacion_id) where principal;

comment on table public.organizacion_admins is
  'Admins del cliente: cuentas a nivel cliente, nunca miembros de una agencia. Ven todas las agencias de su cliente como dueños.';

alter table public.organizacion_admins enable row level security;

-- ─── 3. La agencia en foco ───────────────────────────────────────────────────
create table public.agencia_en_foco (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  desde     timestamptz not null default now()
);
comment on table public.agencia_en_foco is
  'La agencia que un admin del cliente (o de la plataforma) está mirando: current_tenant_id() la devuelve si no es miembro de ninguna. Se escribe con entrar_a_agencia / salir_de_agencia.';
alter table public.agencia_en_foco enable row level security;
revoke all on table public.agencia_en_foco from anon;
create policy agencia_en_foco_sel_propia on public.agencia_en_foco
  for select to authenticated using (user_id = (select auth.uid()));

-- ─── 4. Ayudantes ────────────────────────────────────────────────────────────

-- Dos niveles en la plataforma: el dueño (precios y cobros) y el equipo (todo lo demás).
alter table public.plataforma_admins
  add column nivel text not null default 'admin' check (nivel in ('dueno', 'admin'));
comment on column public.plataforma_admins.nivel is
  'dueno = dueño de la plataforma (precios y cobros); admin = equipo de Maven, todo menos precios y cobros.';

create function public.es_dueno_de_plataforma()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.plataforma_admins where user_id = (select auth.uid()) and nivel = 'dueno')
$$;
revoke all on function public.es_dueno_de_plataforma() from public, anon;
grant execute on function public.es_dueno_de_plataforma() to authenticated, service_role;

-- ¿Quien llama es la plataforma? Admin de plataforma, la llave de servicio, o una
-- conexión directa a la base (editor SQL / MCP: sin claims del JWT). Por PostgREST
-- siempre hay claims (anon incluido), así que la tercera no se alcanza desde la API.
create function public.arbol_soy_plataforma()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin_de_plataforma()
      or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      or coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') in ('', '{}')
$$;
revoke all on function public.arbol_soy_plataforma() from public, anon;
grant execute on function public.arbol_soy_plataforma() to authenticated, service_role;

-- Lo mismo, pero para precios y cobros: el dueño de la plataforma (no el equipo).
create function public.arbol_soy_dueno_plataforma()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_dueno_de_plataforma()
      or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      or coalesce(nullif(current_setting('request.jwt.claims', true), ''), '') in ('', '{}')
$$;
revoke all on function public.arbol_soy_dueno_plataforma() from public, anon;
grant execute on function public.arbol_soy_dueno_plataforma() to authenticated, service_role;

-- Personas que ocupan silla: miembros de la agencia, sin creadoras ni cuentas en la papelera.
create function public.personas_en_agencia(_t uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.tenant_members tm
    join auth.users u on u.id = tm.user_id
    left join public.profiles p on p.id = tm.user_id
   where tm.tenant_id = _t
     and coalesce(u.raw_app_meta_data ->> 'tipo', '') <> 'creadora'
     and p.deleted_at is null
$$;
revoke all on function public.personas_en_agencia(uuid) from public, anon, authenticated;

-- Los clientes que administro (todos si soy plataforma).
create function public.mis_organizaciones()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.organizacion_id from public.organizacion_admins a where a.user_id = (select auth.uid())
  union
  select o.id from public.organizaciones o where public.es_admin_de_plataforma()
$$;
revoke all on function public.mis_organizaciones() from public, anon;
grant execute on function public.mis_organizaciones() to authenticated, service_role;

create function public.puedo_administrar_organizacion(_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _org is not null and (
    public.arbol_soy_plataforma()
    or exists (select 1 from public.organizacion_admins a where a.organizacion_id = _org and a.user_id = (select auth.uid()))
  )
$$;
revoke all on function public.puedo_administrar_organizacion(uuid) from public, anon;
grant execute on function public.puedo_administrar_organizacion(uuid) to authenticated, service_role;

-- «Dueño» de UNA agencia: dueño de verdad (tenant_owners), admin de su cliente, o plataforma.
create function public.es_dueno_de_agencia(_t uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _t is not null and (
    exists (select 1 from public.tenant_owners o where o.tenant_id = _t and o.user_id = (select auth.uid()))
    or public.es_admin_de_plataforma()
    or exists (select 1 from public.tenants t
                 join public.organizacion_admins a on a.organizacion_id = t.organizacion_id
                where t.id = _t and a.user_id = (select auth.uid()))
  )
$$;
revoke all on function public.es_dueno_de_agencia(uuid) from public, anon;
grant execute on function public.es_dueno_de_agencia(uuid) to authenticated, service_role;

-- current_tenant_id(): la membresía primero (igual que antes); si no es miembro de
-- ninguna, la agencia en foco, siempre que todavía la pueda mirar.
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select tm.tenant_id from public.tenant_members tm
      where tm.user_id = (select auth.uid())
      order by tm.created_at asc
      limit 1),
    (select f.tenant_id from public.agencia_en_foco f
       join public.tenants t on t.id = f.tenant_id
      where f.user_id = (select auth.uid())
        and (public.es_admin_de_plataforma()
             or exists (select 1 from public.organizacion_admins a
                         where a.user_id = f.user_id and a.organizacion_id = t.organizacion_id)))
  )
$$;

create function public.soy_dueno_aqui()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_dueno_de_agencia(public.current_tenant_id())
$$;
revoke all on function public.soy_dueno_aqui() from public, anon;
grant execute on function public.soy_dueno_aqui() to authenticated, service_role;

-- Las agencias que puedo ver: la mía, las que soy dueño, las de mis clientes; todas si soy plataforma.
create function public.tenants_visibles()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.tenant_id from public.tenant_members tm where tm.user_id = (select auth.uid())
  union
  select o.tenant_id from public.tenant_owners o where o.user_id = (select auth.uid())
  union
  select t.id from public.tenants t
    join public.organizacion_admins a on a.organizacion_id = t.organizacion_id
   where a.user_id = (select auth.uid())
  union
  select t.id from public.tenants t where public.es_admin_de_plataforma()
$$;
revoke all on function public.tenants_visibles() from public, anon;
grant execute on function public.tenants_visibles() to authenticated, service_role;

-- El cliente de mi agencia (para la marca y los avisos de quien trabaja en ella).
create function public.mi_organizacion()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.organizacion_id from public.tenants t where t.id = public.current_tenant_id()
$$;
revoke all on function public.mi_organizacion() from public, anon;
grant execute on function public.mi_organizacion() to authenticated, service_role;

-- ─── 5. Lo que ya existía, ampliado (sin cambiar lo que respondía) ──────────

-- Dueño de la agencia de esa persona: antes solo tenant_owners; ahora también el
-- admin de su cliente y la plataforma.
create or replace function public.es_dueno_de_la_agencia_de(_persona uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_members m
     where m.user_id = _persona
       and public.es_dueno_de_agencia(m.tenant_id)
  )
$$;

-- El dueño o un admin de ESA agencia (la de la sesión) — y ahora el admin del cliente en foco.
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
       public.es_dueno_de_agencia(_t)
       or exists (select 1 from public.user_roles ur
                   where ur.user_id = _yo and lower(ur.role) = 'admin' and ur.tenant_id = _t)) then
    raise exception using errcode = '42501',
      message = 'sin_permiso: solo el dueño o un admin de la agencia';
  end if;
  return _t;
end;
$$;
revoke all on function public.equipo_agencia_que_administro() from public, anon, authenticated;

-- puede_vigilar_a (cámaras y pantallas de Argos): suma «o soy dueño de la agencia
-- de esa persona», que sí sabe de agencias. Se reescribe desde la definición viva.
do $$
declare
  _def text;
  _viejo constant text := 'public.es_admin_o_dueno(_viewer)';
  _nuevo constant text := '(public.es_admin_o_dueno(_viewer) or (_viewer = (select auth.uid()) and public.es_dueno_de_la_agencia_de(_target)))';
begin
  select sentencia into _def from public.arbol_respaldo where que = 'funcion puede_vigilar_a';
  if (length(_def) - length(replace(_def, _viejo, ''))) / length(_viejo) < 1 then
    raise exception 'arbol: puede_vigilar_a cambió (no encuentro «%»); revisar a mano', _viejo;
  end if;
  -- Solo la primera aparición: es la rama del que mira.
  execute regexp_replace(_def, regexp_replace(_viejo, '([().])', '\\\1', 'g'), _nuevo);
end $$;

-- ─── 6. Políticas con agencia que piden «dueño» de quien llama ──────────────
-- Las que filtran por current_tenant_id() y piden es_dueno/es_admin_o_dueno de
-- quien llama suman «o soy_dueno_aqui()». Hoy: argos_alertas, argos_contexto
-- (Argos), y las que aparezcan con la misma forma. Las que piden es_dueno SIN filtro
-- de agencia no se tocan (ver el README: abrirlas cruzaría clientes).
do $$
declare
  r record;
  _patron constant text := '(public\.)?(es_dueno|es_admin_o_dueno)\(\( SELECT auth\.uid\(\) AS uid\)\)';
  _usa text;
  _chk text;
  _n int := 0;
begin
  for r in
    select p.schemaname, p.tablename, p.policyname, p.qual, p.with_check
      from pg_policies p
     where p.schemaname = 'public'
       and coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') ~ 'current_tenant_id'
       and coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') ~ _patron
  loop
    insert into public.arbol_respaldo (que, sentencia) values (
      'politica ' || r.tablename || '.' || r.policyname,
      format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename)
        || coalesce(' using (' || r.qual || ')', '')
        || coalesce(' with check (' || r.with_check || ')', ''));
    _usa := regexp_replace(r.qual, _patron, '(\& OR soy_dueno_aqui())', 'g');
    _chk := regexp_replace(r.with_check, _patron, '(\& OR soy_dueno_aqui())', 'g');
    execute format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename)
      || coalesce(' using (' || _usa || ')', '')
      || coalesce(' with check (' || _chk || ')', '');
    _n := _n + 1;
  end loop;
  raise notice 'arbol: % política(s) con agencia ahora aceptan al dueño en foco', _n;
end $$;

-- tenants: cada quien ve las agencias que puede ver (antes: solo la suya).
insert into public.arbol_respaldo (que, sentencia)
select 'politica tenants.' || p.policyname,
       format('alter policy %I on public.tenants using (%s)', p.policyname, p.qual)
  from pg_policies p
 where p.schemaname = 'public' and p.tablename = 'tenants' and p.policyname = 'tenants_self_visible';

alter policy tenants_self_visible on public.tenants
  using (id in (select public.tenants_visibles()));

-- ─── 7. Políticas de las tablas nuevas ──────────────────────────────────────
-- organizaciones: la ven sus admins y la plataforma. Quien trabaja en una agencia
-- lee solo la marca, con marca_de_mi_organizacion() (parte 2): el plan y el cobro no.
create policy organizaciones_sel_admin on public.organizaciones
  for select to authenticated
  using (public.puedo_administrar_organizacion(id));

create policy organizacion_admins_sel on public.organizacion_admins
  for select to authenticated
  using (user_id = (select auth.uid()) or public.puedo_administrar_organizacion(organizacion_id));

-- Sin políticas de escritura: todo pasa por las funciones del árbol (security definer).

-- ─── 8. Reglas de la base ───────────────────────────────────────────────────

-- 8a. Agencias: el cliente no cambia (salvo la plataforma); las sillas no pasan del
--     paquete ni bajan de lo usado; el cliente archivado no recibe agencias nuevas.
create function public.tenants_arbol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _org public.organizaciones;
  _repartidas int;
  _usadas int;
  _paquete int;
begin
  if tg_op = 'UPDATE' and new.organizacion_id is distinct from old.organizacion_id
     and old.organizacion_id is not null and not public.arbol_soy_plataforma() then
    raise exception using errcode = '42501', message = 'agencia_de_otro_cliente: solo la plataforma mueve una agencia de cliente';
  end if;

  if new.organizacion_id is null then
    return new;
  end if;

  -- Un pedido a la vez por cliente: así dos repartos al mismo tiempo no pasan el paquete.
  select * into _org from public.organizaciones where id = new.organizacion_id for update;

  if tg_op = 'INSERT' and _org.estado = 'archivada' then
    raise exception using errcode = 'P0001', message = 'cliente_archivado: el cliente está archivado';
  end if;

  if new.archivada_at is null then
    -- No baja de lo usado.
    if tg_op = 'UPDATE' then
      _usadas := public.personas_en_agencia(new.id);
      if new.sillas < _usadas then
        raise exception using errcode = 'P0001',
          message = format('sillas_en_uso: la agencia tiene %s personas; no puede quedar con %s sillas', _usadas, new.sillas);
      end if;
    end if;
    -- La suma no pasa del paquete.
    _paquete := coalesce((_org.plan ->> 'personas')::numeric, 0)::int;
    select coalesce(sum(t.sillas), 0) into _repartidas
      from public.tenants t
     where t.organizacion_id = new.organizacion_id and t.archivada_at is null and t.id <> new.id;
    if _repartidas + new.sillas > _paquete then
      raise exception using errcode = 'P0001',
        message = format('paquete_lleno: el paquete del cliente es de %s personas, ya repartió %s y esta agencia pide %s', _paquete, _repartidas, new.sillas);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.tenants_arbol() from public, anon, authenticated;

create trigger tenants_arbol
  before insert or update of organizacion_id, sillas, archivada_at on public.tenants
  for each row execute function public.tenants_arbol();

-- 8b. Personas: agencia llena = no entra nadie más (SE BLOQUEA, decisión del 19/11).
--     Agencia archivada = no entra nadie. Agencia suelta (sin cliente) = sin tope.
create function public.tenant_members_sillas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _t public.tenants;
  _usadas int;
begin
  if tg_op = 'UPDATE' and new.tenant_id is not distinct from old.tenant_id then
    return new;
  end if;
  -- Ya es miembro de esa agencia: el ON CONFLICT DO NOTHING de admin-user-actions
  -- tiene que seguir sin hacer nada (y no dar «agencia llena»).
  if exists (select 1 from public.tenant_members m where m.user_id = new.user_id and m.tenant_id = new.tenant_id) then
    return new;
  end if;
  -- Bloquea la agencia: dos altas al mismo tiempo no pasan el tope.
  select * into _t from public.tenants where id = new.tenant_id for update;
  if _t.archivada_at is not null then
    raise exception using errcode = 'P0001', message = 'agencia_archivada: la agencia está archivada';
  end if;
  if _t.organizacion_id is null then
    return new;
  end if;
  -- Las creadoras no ocupan silla.
  if exists (select 1 from auth.users u where u.id = new.user_id and coalesce(u.raw_app_meta_data ->> 'tipo', '') = 'creadora') then
    return new;
  end if;
  _usadas := public.personas_en_agencia(new.tenant_id);
  if _usadas + 1 > _t.sillas then
    raise exception using errcode = 'P0001',
      message = format('agencia_llena: la agencia tiene %s de %s sillas ocupadas; pide más sillas a tu cliente', _usadas, _t.sillas);
  end if;
  return new;
end;
$$;
revoke all on function public.tenant_members_sillas() from public, anon, authenticated;

create trigger tenant_members_sillas
  before insert or update of tenant_id on public.tenant_members
  for each row execute function public.tenant_members_sillas();

-- 8c. Una cuenta, un nivel: un admin del cliente no es miembro de una agencia, y al revés.
create function public.tenant_members_no_admin_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'tenant_members'
     and exists (select 1 from public.organizacion_admins a where a.user_id = new.user_id) then
    raise exception using errcode = 'P0001', message = 'cuenta_de_cliente: esa cuenta es admin de un cliente; para trabajar en una agencia usa otra cuenta';
  end if;
  if tg_table_name = 'organizacion_admins'
     and exists (select 1 from public.tenant_members m where m.user_id = new.user_id) then
    raise exception using errcode = 'P0001', message = 'cuenta_de_agencia: esa cuenta ya trabaja en una agencia; el admin del cliente usa otra cuenta';
  end if;
  return new;
end;
$$;
revoke all on function public.tenant_members_no_admin_cliente() from public, anon, authenticated;

create trigger tenant_members_no_admin_cliente
  before insert or update of user_id on public.tenant_members
  for each row execute function public.tenant_members_no_admin_cliente();
create trigger organizacion_admins_no_miembro
  before insert or update of user_id on public.organizacion_admins
  for each row execute function public.tenant_members_no_admin_cliente();

-- 8d. Cliente: el paquete, el cobro, el estado, el tipo y lo de demo los cambia solo la
--     plataforma; y el paquete no baja de lo ya repartido.
create function public.organizaciones_guarda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _repartidas int;
begin
  if not public.arbol_soy_plataforma() and (
       new.plan is distinct from old.plan or new.cobro is distinct from old.cobro
       or new.estado is distinct from old.estado or new.tipo is distinct from old.tipo
       or new.es_demo is distinct from old.es_demo or new.slug is distinct from old.slug
       or new.activada_at is distinct from old.activada_at) then
    raise exception using errcode = '42501', message = 'solo_plataforma: el paquete, el cobro y el estado del cliente los cambia Maven';
  end if;
  -- Precios y cobros: solo el dueño de la plataforma (Grace no). Las personas del
  -- paquete sí las mueve el equipo (aprobar pedidos de sillas).
  if not public.arbol_soy_dueno_plataforma() and (
       new.cobro is distinct from old.cobro
       or (new.plan - 'personas') is distinct from (old.plan - 'personas')) then
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
revoke all on function public.organizaciones_guarda() from public, anon, authenticated;

create trigger organizaciones_guarda
  before update on public.organizaciones
  for each row execute function public.organizaciones_guarda();

-- ─── 9. El dueño de la plataforma ───────────────────────────────────────────
-- rusin24@gmail.com (decisión del 19/11). La cuenta NO se crea aquí: se crea en el
-- Auth del edificio y después se corre de nuevo esta línea (no hace nada si no existe).
-- Grace (admin, sin precios ni cobros) va con su cuenta del edificio: ver el README.
insert into public.plataforma_admins (user_id, nivel)
select id, 'dueno' from auth.users where lower(email) = 'rusin24@gmail.com'
on conflict (user_id) do update set nivel = 'dueno';
