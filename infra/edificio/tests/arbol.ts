// El árbol del edificio (infra/edificio/migraciones/20261119210500_arbol.sql y
// 20261119211000_arbol_funciones.sql), probado contra un Postgres de verdad (PGlite).
//
//   deno run -A --node-modules-dir=none --no-lock infra/edificio/tests/arbol.ts
//
// La base: las migraciones reales de las agencias (tenants_and_membership y
// agencias_base), tenant_owners/es_dueno de argos_dueno, y las funciones de dueño de
// las migraciones de documentos y agencias conectadas, copiadas de su archivo. Lo de
// Argos/Cowork que no tiene fixture va mínimo (las columnas que se leen) y
// puede_vigilar_a / es_admin_o_dueno / es_rh con su definición del edificio (19/11).
//
// Qué prueba:
//   1. Cargan las dos migraciones; rusin24 queda como dueño de la plataforma.
//   2. Aislamiento entre DOS clientes: cada admin ve solo su cliente y sus agencias.
//   3. El admin del cliente «entra» a su agencia y la ve como dueño (Argos, personas,
//      puede_vigilar_a); nunca la de otro cliente. es_dueno() no cambia.
//   4. Sillas: el paquete y la agencia bloquean; archivar libera; no baja de lo usado.
//   5. Pedidos de sillas agencia → cliente → Maven.
//   6. Cliente en preparación: sin enlaces; enlaces de un solo uso y con vencimiento.
//   7. El dueño de la plataforma ve todo; Grace (admin) todo menos precios y cobros.
//   8. Avisos, historial, «Líder de {Marca}», tarjeta de Kash, saldo de Argos, socios y briefs.
//  10. Cobros (20261120090500_cobros.sql): precios, eventos de Stripe una vez, bloqueo
//      por pago tras la gracia, la pantalla de entrada, créditos del plan y recargas
//      sin duplicar, el directorio de la puerta y su tope.
//  10c. Quién soy (20261120120000_quien_soy.sql): dueño / Grace / admin del cliente / nadie,
//      y la lista «Equipo de Maven» solo para la plataforma.
//  11. Vuelta atrás de las cuatro y vuelta a cargar.
//
// Sale con código 1 si algo falla.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const MIGS = "../../../supabase/migrations/";
const BASE_TENANTS = leer(MIGS + "20260504200000_tenants_and_membership.sql");
const BASE_AGENCIAS = leer(MIGS + "20261001210000_agencias_base.sql");
const ARGOS_DUENO = leer(MIGS + "20261102012000_argos_dueno.sql");
const DOCS_DUENO = leer(MIGS + "20261114130000_documentos_dueno_ve_todo_y_pedir_acceso.sql");
const CONECTADAS = leer(MIGS + "20261111190000_agencias_conectadas.sql");
const ARBOL = leer("../migraciones/20261119210500_arbol.sql");
const FUNCIONES = leer("../migraciones/20261119211000_arbol_funciones.sql");
const COBROS = leer("../migraciones/20261120090500_cobros.sql");
const QUIEN_SOY = leer("../migraciones/20261120120000_quien_soy.sql");
const vuelta = (sql: string) => sql.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");

/** Saca «create or replace function public.<nombre>(…) … $$;» tal cual de una migración. */
function funcion(sql: string, nombre: string): string {
  const ini = sql.indexOf(`create or replace function public.${nombre}(`);
  if (ini < 0) throw new Error(`no encuentro ${nombre}`);
  const cuerpo = sql.indexOf("$$", ini);
  const fin = sql.indexOf("$$;", cuerpo + 2);
  return sql.slice(ini, fin + 3);
}

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);

// ─── Gente del ensayo ────────────────────────────────────────────────────────
const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const RUSIN = id(1), GRACE = id(2), AA = id(3), BB = id(4), K = id(5);
const A1O = id(6), E1 = id(7), E2 = id(8), E3 = id(9), E4 = id(10), E5 = id(11), E6 = id(12);
const CREADORA = id(13), E7 = id(14), B1O = id(15), SOCIO = id(16), X = id(17), AA2 = id(18);

const PREVIO = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}',
  last_sign_in_at timestamptz, created_at timestamptz default now());
-- auth.uid() como en el edificio.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
grant execute on function auth.uid() to anon, authenticated, service_role;
create table public.profiles (id uuid primary key, full_name text, nivel text, deleted_at timestamptz);
create table public.user_roles (id uuid primary key default gen_random_uuid(), user_id uuid not null, role text not null, tenant_id uuid);
`;

// Lo de Argos/Cowork que lee el árbol (columnas que se usan) y las funciones del edificio.
const ARGOS = `
set check_function_bodies = off;
create table public.cowork_tiempo_segmentos (id uuid primary key default gen_random_uuid(), user_id uuid not null,
  estado text not null, started_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  ended_at timestamptz, seconds int);
create table public.monitor_capturas (id uuid primary key default gen_random_uuid(), user_id uuid not null, tipo text not null,
  cara_visible boolean, fuera_de_lugar boolean, perdonado boolean not null default false, created_at timestamptz not null default now());
create table public.equipos_a_cargo (user_id uuid, equipo text);
create function public.equipo_de(_u uuid) returns text language sql stable as $$ select 'Otros'::text $$;
create or replace function public.es_admin_o_dueno(_uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.es_dueno(_uid)
      or exists (select 1 from public.user_roles ur where ur.user_id = _uid and lower(ur.role) = 'admin');
$$;
create or replace function public.es_rh(_uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles ur where ur.user_id = _uid and lower(ur.role) in ('hhrr','rrhh'));
$$;
CREATE OR REPLACE FUNCTION public.puede_vigilar_a(_viewer uuid, _target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select _viewer is not null and _target is not null and _viewer <> _target
     and exists (select 1 from public.profiles t where t.id = _target and t.deleted_at is null)
     and (
       public.es_admin_o_dueno(_viewer)
       or (public.es_rh(_viewer) and not public.es_admin_o_dueno(_target))
       or exists (
         select 1
           from public.profiles s
           join public.profiles t on t.id = _target and t.nivel = 'agente' and t.deleted_at is null
          where s.id = _viewer and s.nivel = 'supervisor' and s.deleted_at is null
            and public.equipo_de(s.id) <> 'Otros'
            and public.equipo_de(s.id) = public.equipo_de(t.id)
            and exists (
              select 1 from public.user_roles a
                join public.user_roles b on b.tenant_id = a.tenant_id
               where a.user_id = s.id and b.user_id = t.id
            )
       )
       or (
         not public.es_admin_o_dueno(_target)
         and exists (select 1 from public.equipos_a_cargo e where e.user_id = _viewer and e.equipo = public.equipo_de(_target))
         and exists (
           select 1 from public.user_roles a
             join public.user_roles b on b.tenant_id = a.tenant_id
            where a.user_id = _viewer and b.user_id = _target
         )
       )
     );
$function$;
create table public.argos_alertas (id uuid primary key default gen_random_uuid(), tenant_id uuid references public.tenants(id),
  user_id uuid not null, tipo text not null default 'x', gravedad smallint not null default 2,
  abierta_at timestamptz not null default now(), cerrada_at timestamptz);
alter table public.argos_alertas enable row level security;
-- Como en el edificio (sin la rama de supervisores, que no cambia aquí).
create policy argos_alertas_sel_supervisor on public.argos_alertas for select to authenticated
  using ((public.es_admin_o_dueno((select auth.uid())) or public.es_rh((select auth.uid())))
         and tenant_id = (select public.current_tenant_id()));
create table public.argos_contexto (id uuid primary key default gen_random_uuid(), tenant_id uuid not null default public.current_tenant_id(), texto text);
alter table public.argos_contexto enable row level security;
create policy argos_contexto_ins_admin on public.argos_contexto for insert to authenticated
  with check (public.es_dueno((select auth.uid())) and tenant_id = (select public.current_tenant_id()));
create policy argos_contexto_sel_supervisor on public.argos_contexto for select to authenticated
  using (public.es_admin_o_dueno((select auth.uid())) and tenant_id = (select public.current_tenant_id()));
-- Una política con es_dueno SIN filtro de agencia: no se toca.
create table public.argos_voz (id int primary key, texto text);
alter table public.argos_voz enable row level security;
create policy argos_voz_sel on public.argos_voz for select to authenticated using (public.es_dueno((select auth.uid())));
set check_function_bodies = on;
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}

const db = new PGlite();
const q = async (sql: string) => (await db.query(sql)).rows as Fila[];

type Quien = string | "service_role" | "postgres";
async function como(quien: Quien, sql: string): Promise<Fila[]> {
  await db.exec("begin");
  try {
    await db.exec("reset role");
    if (quien !== "postgres") {
      const servicio = quien === "service_role";
      const claims = servicio ? { role: quien } : { sub: quien, role: "authenticated" };
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await db.exec(`set local role ${servicio ? "service_role" : "authenticated"}`);
    }
    const rs = await db.exec(sql);
    await db.exec("commit");
    return (rs.at(-1)?.rows ?? []) as Fila[];
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
async function anda(quien: Quien, sql: string, m: string): Promise<Fila[]> {
  try { const r = await como(quien, sql); ok.push(m); return r; }
  catch (e) { mal.push(`${m} (falló: ${msg(e).slice(0, 200)})`); return []; }
}
async function falla(quien: Quien, sql: string, patron: RegExp, m: string) {
  try { await como(quien, sql); mal.push(`${m} (NO falló)`); }
  catch (e) { const t = msg(e); check(patron.test(t), `${m} → ${t.slice(0, 120)}`); }
}
const val = async (quien: Quien, sql: string) => {
  const r = await como(quien, sql);
  return r[0] ? Object.values(r[0])[0] : undefined;
};
const ids = async (quien: Quien, sql: string) => (await como(quien, sql)).map((f) => String(Object.values(f)[0])).sort();

// ════ 1. Carga ═══════════════════════════════════════════════════════════════
await db.exec(PREVIO);
// Las cuentas van DESPUÉS de tenants_and_membership: esa migración mete a toda cuenta que exista en asm-tech.
await aplicar(db, "tenants_and_membership", BASE_TENANTS);
await db.exec(`insert into auth.users(id, email) values
  ('${RUSIN}', 'Rusin24@gmail.com'), ('${GRACE}', 'grace@edificio.test'), ('${AA}', 'lider@cliente-a.test'),
  ('${AA2}', 'otro@cliente-a.test'), ('${BB}', 'lider@cliente-b.test'), ('${K}', 'dueno@suelta.test'),
  ('${A1O}', 'dueno@a1.test'), ('${E1}', 'e1@a1.test'), ('${E2}', 'e2@a1.test'), ('${E3}', 'e3@a1.test'),
  ('${E4}', 'e4@a1.test'), ('${E5}', 'e5@a1.test'), ('${E6}', 'e6@a1.test'), ('${E7}', 'e7@a2.test'),
  ('${B1O}', 'dueno@b1.test'), ('${SOCIO}', 'socio@edificio.test'), ('${X}', 'x@nadie.test');
  update auth.users set raw_app_meta_data = '{"tipo":"creadora"}' where id = '${E6}';
  insert into auth.users(id, email, raw_app_meta_data) values ('${CREADORA}', 'creadora@a1.test', '{"tipo":"creadora"}');
  insert into public.profiles (id, full_name, nivel) select id, split_part(email, '@', 1), 'agente' from auth.users;`);
await aplicar(db, "agencias_base", BASE_AGENCIAS);
await aplicar(db, "argos_dueno (tenant_owners + es_dueno)", ARGOS_DUENO.slice(0, ARGOS_DUENO.indexOf("alter policy monitor_capturas_sel_supervisor")));
await aplicar(db, "funciones de dueño", funcion(DOCS_DUENO, "es_dueno_de_la_agencia_de") + "\n" + funcion(CONECTADAS, "equipo_agencia_que_administro"));
await aplicar(db, "argos mínimo", ARGOS);
// La agencia suelta (como la «Agencia de prueba»): asm-tech del seed, con su dueño K.
const SUELTA = String((await q(`select id from public.tenants where slug = 'asm-tech'`))[0].id);
await db.exec(`insert into public.tenant_members (user_id, tenant_id) values ('${K}', '${SUELTA}');
  insert into public.tenant_owners (tenant_id, user_id) values ('${SUELTA}', '${K}');
  insert into public.argos_alertas (tenant_id, user_id) values ('${SUELTA}', '${K}');`);

try {
  await aplicar(db, "arbol", ARBOL);
  await aplicar(db, "arbol_funciones", FUNCIONES);
  check(true, "las dos migraciones cargan");
} catch (e) {
  console.error(msg(e));
  Deno.exit(1);
}
const plat = await q(`select user_id::text u, nivel from public.plataforma_admins`);
check(plat.length === 1 && plat[0].u === RUSIN && plat[0].nivel === "dueno", `rusin24 queda como dueño de la plataforma (${JSON.stringify(plat)})`);
await db.exec(`insert into public.plataforma_admins (user_id, nivel) values ('${GRACE}', 'admin')`);

const pols = await q(`select policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') e from pg_policies where tablename in ('argos_alertas', 'argos_contexto', 'argos_voz') order by 1`);
check(pols.filter((p) => /soy_dueno_aqui/.test(p.e)).length === 3,
  `las 3 políticas con agencia suman soy_dueno_aqui (${pols.map((p) => p.policyname + (/soy_dueno_aqui/.test(p.e) ? "✓" : "")).join(", ")})`);
check(!/soy_dueno_aqui/.test(pols.find((p) => p.policyname === "argos_voz_sel")?.e ?? ""), "la de es_dueno sin agencia (argos_voz) no se toca");

// ════ 2. Clientes y agencias ═════════════════════════════════════════════════
await falla(AA, `select public.crear_organizacion('Cliente A')`, /sin_permiso/, "un cualquiera no crea clientes");
await falla(GRACE, `select public.crear_organizacion('Cliente con precio', 'normal', '{"personas":5,"precio_usd":299}')`, /solo_dueno/,
  "Grace (admin de plataforma) no pone precios");
const ORG_A = String(await val(RUSIN, `select public.crear_organizacion('Cliente A', 'marca_blanca', '{"nombre":"equipo","personas":10,"precio_usd":299,"argos_usd_mes":20}', '{"nombre":"Marca A"}')`));
const ORG_B = String(await val(GRACE, `select public.crear_organizacion('Cliente B', 'normal', '{"nombre":"equipo","personas":5}')`));
const ORG_C = String(await val(RUSIN, `select public.crear_organizacion('Cliente C', 'normal', '{"personas":3}')`));
check(/^[0-9a-f-]{36}$/.test(ORG_A) && /^[0-9a-f-]{36}$/.test(ORG_B), "el dueño y Grace crean clientes (Grace sin precio)");
check((await val("postgres", `select estado from public.organizaciones where id = '${ORG_A}'`)) === "preparacion", "el cliente nace en preparación");

await falla(AA, `select public.crear_agencia('${ORG_A}', 'Agencia Uno', 6)`, /sin_permiso/, "antes de ser admin, no crea agencias");
await anda(RUSIN, `select public.agregar_admin_organizacion('${ORG_A}', '${AA}', true); select public.agregar_admin_organizacion('${ORG_A}', '${AA2}', false);
  select public.agregar_admin_organizacion('${ORG_B}', '${BB}', true)`, "el dueño nombra los admins de los clientes");

const A1 = String(await val(AA, `select public.crear_agencia('${ORG_A}', 'Agencia Uno', 6)`));
const A2 = String(await val(AA, `select public.crear_agencia('${ORG_A}', 'Agencia Dos', 4)`));
await falla(AA, `select public.crear_agencia('${ORG_A}', 'Agencia Tres', 1)`, /paquete_lleno/, "una agencia más pasa el paquete (10): se bloquea");
const B1 = String(await val(BB, `select public.crear_agencia('${ORG_B}', 'B Uno', 3)`));
await falla(BB, `select public.crear_agencia('${ORG_B}', 'B Dos', 1)`, /cliente_directo/, "un cliente directo tiene una sola agencia");
await falla(AA, `select public.crear_agencia('${ORG_B}', 'Intrusa', 1)`, /sin_permiso/, "el admin de A no crea agencias en B");

// Gente: 6 sillas en A1 → dueño + 5; la sexta falla; la creadora no ocupa silla.
await anda("postgres", `insert into public.tenant_members (user_id, tenant_id) values
  ('${A1O}', '${A1}'), ('${E1}', '${A1}'), ('${E2}', '${A1}'), ('${E3}', '${A1}'), ('${E4}', '${A1}'), ('${E5}', '${A1}'),
  ('${CREADORA}', '${A1}'), ('${E7}', '${A2}'), ('${B1O}', '${B1}')`, "A1 se llena con sus 6 sillas (más una creadora, que no ocupa)");
await falla("postgres", `insert into public.tenant_members (user_id, tenant_id) values ('${X}', '${A1}')`, /agencia_llena/, "agencia llena: no entra nadie más");
await anda("postgres", `insert into public.tenant_members (user_id, tenant_id) values ('${E1}', '${A1}') on conflict do nothing`,
  "volver a meter a alguien que ya está (ON CONFLICT DO NOTHING) no da «agencia llena»");
await falla("postgres", `insert into public.tenant_members (user_id, tenant_id) values ('${AA}', '${A2}')`, /cuenta_de_cliente/, "el admin del cliente no puede ser miembro de una agencia");
await falla(RUSIN, `select public.agregar_admin_organizacion('${ORG_A}', '${E1}')`, /cuenta_de_agencia/, "ni alguien de una agencia, admin del cliente");

await anda(AA, `select public.cambiar_dueno_agencia('${A1}', '${A1O}')`, "el admin del cliente pone al dueño de A1");
await falla(AA, `select public.cambiar_dueno_agencia('${A1}', '${X}')`, /no_es_de_la_agencia/, "el dueño tiene que trabajar en la agencia");
await falla(AA, `select public.cambiar_dueno_agencia('${B1}', '${B1O}')`, /sin_permiso/, "el admin de A no cambia el dueño de B1");
await anda(BB, `select public.cambiar_dueno_agencia('${B1}', '${B1O}')`, "el admin de B pone al dueño de B1");

// ════ 3. Quién ve qué ════════════════════════════════════════════════════════
const t = (...xs: string[]) => JSON.stringify(xs.sort());
check(JSON.stringify(await ids(AA, `select id from public.tenants`)) === t(A1, A2), "el admin de A ve sus dos agencias y nada más");
check(JSON.stringify(await ids(BB, `select id from public.tenants`)) === t(B1), "el admin de B ve solo B1");
check(JSON.stringify(await ids(K, `select id from public.tenants`)) === t(SUELTA), "el dueño de la agencia suelta ve solo la suya");
check(JSON.stringify(await ids(E1, `select id from public.tenants`)) === t(A1), "un empleado ve solo su agencia");
check(JSON.stringify(await ids(RUSIN, `select id from public.tenants`)) === t(SUELTA, A1, A2, B1), "el dueño de la plataforma ve todas");
check(JSON.stringify(await ids(GRACE, `select id from public.tenants`)) === t(SUELTA, A1, A2, B1), "Grace también ve todas");
check(JSON.stringify(await ids(AA, `select id from public.organizaciones`)) === t(ORG_A), "el admin de A ve solo su cliente");
check((await ids(E1, `select id from public.organizaciones`)).length === 0, "un empleado no lee la tabla de clientes");
await falla(AA, `select plan from public.organizaciones`, /permission denied/, "el plan (con precio) no se lee directo por la API");
await falla(GRACE, `select cobro from public.organizaciones`, /permission denied/, "ni el cobro");
const marca = (await como(E1, `select public.marca_de_mi_organizacion() m`))[0].m;
check(marca?.nombre === "Marca A" && !("plan" in marca), `el empleado lee la marca de su cliente, sin plan (${JSON.stringify(marca)})`);

await falla(AA, `select public.resumen_organizacion('${ORG_B}')`, /sin_permiso/, "el admin de A no ve el tablero de B");
await falla(A1O, `select public.resumen_organizacion('${ORG_A}')`, /sin_permiso/, "el dueño de una agencia no ve el tablero del cliente");
await anda(RUSIN, `select public.resumen_organizacion('${ORG_B}')`, "el dueño de la plataforma ve el tablero de cualquiera");

// Antes de entrar: el admin del cliente no tiene agencia en la sesión.
await db.exec(`insert into public.argos_alertas (tenant_id, user_id, gravedad) values
  ('${A1}', '${E1}', 3), ('${A1}', '${E2}', 2), ('${A2}', '${E7}', 2), ('${B1}', '${B1O}', 2)`);
check((await val(AA, `select public.current_tenant_id()`)) === null, "sin entrar, el admin del cliente no tiene agencia en la sesión");
check((await ids(AA, `select id from public.argos_alertas`)).length === 0, "y no ve alertas de Argos");
await falla(AA, `select public.entrar_a_agencia('${B1}')`, /sin_permiso/, "no puede entrar a una agencia de otro cliente");
await falla(E1, `select public.entrar_a_agencia('${A2}')`, /cuenta_de_agencia/, "una cuenta de agencia no entra a otra agencia");
await anda(AA, `select public.entrar_a_agencia('${A1}')`, "el admin de A entra a A1");
check((await val(AA, `select public.current_tenant_id()`)) === A1, "current_tenant_id() le da A1");
check((await como(AA, `select tenant_id::text t from public.argos_alertas`)).every((f) => f.t === A1) &&
  (await como(AA, `select 1 from public.argos_alertas`)).length === 2, "ve las alertas de Argos de A1 (y solo esas), como el dueño");
check((await val(AA, `select public.soy_dueno_aqui()`)) === true, "soy_dueno_aqui() es true");
check((await val(AA, `select public.es_dueno('${AA}')`)) === false, "es_dueno() no cambia (no sabe de agencias)");
check((await ids(AA, `select id from public.argos_voz`)).length === 0 && (await val(AA, `select count(*)::int from public.argos_voz`)) === 0,
  "las políticas de es_dueno sin agencia no se le abren");
await anda(AA, `insert into public.argos_contexto (texto) values ('contexto de A1')`, "escribe el contexto de Argos de A1 como dueño");
check((await val("postgres", `select tenant_id::text from public.argos_contexto`)) === A1, "y queda en A1");
check((await val(AA, `select public.es_dueno_de_la_agencia_de('${E1}')`)) === true, "es_dueno_de_la_agencia_de(alguien de A1) = true");
check((await val(AA, `select public.es_dueno_de_la_agencia_de('${E7}')`)) === true, "también de A2 (es su cliente)");
check((await val(AA, `select public.es_dueno_de_la_agencia_de('${B1O}')`)) === false, "pero no de B1");
check((await val(AA, `select public.puede_vigilar_a('${AA}', '${E1}')`)) === true, "puede vigilar (cámara/pantalla) a alguien de A1");
check((await val(AA, `select public.puede_vigilar_a('${AA}', '${B1O}')`)) === false, "y no a alguien de B1");
check((await val(K, `select public.puede_vigilar_a('${K}', '${E1}')`)) === true,
  "línea base sin cambio: el dueño suelto sigue pasando por es_admin_o_dueno (hueco preexistente, ver README)");
const gente = await como(AA, `select * from public.personas_de_agencia('${A1}')`);
check(gente.length === 7 && gente[0].user_id === A1O && gente[0].es_dueno === true, `personas_de_agencia: 7 (con la creadora), el dueño primero (${gente.length})`);
await falla(AA, `select * from public.personas_de_agencia('${B1}')`, /sin_permiso/, "no lista la gente de B1");
await anda(AA, `select public.entrar_a_agencia('${A2}')`, "cambia a A2");
check((await como(AA, `select tenant_id::text t from public.argos_alertas`)).every((f) => f.t === A2), "y ahora ve solo las de A2");

// Regresión: los dueños de siempre siguen igual.
check(JSON.stringify(await ids(K, `select tenant_id from public.argos_alertas`)) === t(SUELTA), "el dueño suelto ve sus alertas (y solo esas)");
check(JSON.stringify(await ids(A1O, `select distinct tenant_id from public.argos_alertas`)) === t(A1), "el dueño de A1 ve las de A1");
check((await ids(E1, `select id from public.argos_alertas`)).length === 0, "un empleado no ve alertas");

// Quitar al admin le quita la agencia en foco.
await anda(RUSIN, `select public.quitar_admin_organizacion('${ORG_A}', '${AA2}')`, "el dueño quita un admin del cliente");
await como(AA2, `select 1`);
check((await ids(AA2, `select id from public.tenants`)).length === 0, "el admin quitado ya no ve agencias");

// ════ 4. Sillas ══════════════════════════════════════════════════════════════
await falla(AA, `select public.dar_sillas_a_agencia('${A2}', 5)`, /paquete_lleno/, "6 + 5 pasa el paquete de 10");
await falla(AA, `select public.dar_sillas_a_agencia('${A1}', 5)`, /sillas_en_uso/, "A1 no baja de sus 6 personas");
await anda(AA, `select public.archivar_agencia('${A2}')`, "archivar A2 libera sus 4 sillas");
await falla("postgres", `insert into public.tenant_members (user_id, tenant_id) values ('${X}', '${A2}')`, /agencia_archivada/, "a una agencia archivada no entra nadie");
check((await val(AA, `select public.current_tenant_id()`)) === null, "archivar saca del foco a quien la miraba");
await anda(AA, `select public.dar_sillas_a_agencia('${A1}', 10)`, "A1 puede usar las 10");
await falla(AA, `select public.reactivar_agencia('${A2}')`, /paquete_lleno/, "reactivar A2 ya no cabe");
await anda(AA, `select public.dar_sillas_a_agencia('${A1}', 6); select public.reactivar_agencia('${A2}')`, "con A1 en 6, A2 vuelve");
await falla("postgres", `update public.organizaciones set plan = jsonb_set(plan, '{personas}', '8') where id = '${ORG_A}'`, /paquete_menor/,
  "el paquete no baja de lo repartido");
await falla(GRACE, `select public.dar_sillas_a_agencia('${SUELTA}', 3)`, /agencia_sin_cliente/, "una agencia suelta no tiene tope");
await anda("postgres", `insert into public.tenant_members (user_id, tenant_id) values ('${X}', '${SUELTA}'); delete from public.tenant_members where user_id = '${X}'`,
  "la agencia suelta recibe gente sin tope de sillas");

// ════ 5. Pedidos de sillas ═══════════════════════════════════════════════════
const P1 = String(await val(A1O, `select public.pedir_sillas(2, 'entra gente nueva')`));
check(/^[0-9a-f-]{36}$/.test(P1), "el dueño de A1 le pide 2 sillas a su cliente");
await falla(E1, `select public.pedir_sillas(2)`, /sin_permiso/, "un empleado no pide sillas");
await falla(K, `select public.pedir_sillas(2)`, /agencia_sin_cliente/, "la agencia suelta no tiene a quién pedir");
await falla(BB, `select public.decidir_pedido('${P1}', true)`, /sin_permiso/, "el admin de B no decide pedidos de A");
await falla(AA, `select public.decidir_pedido('${P1}', true)`, /paquete_lleno/, "aprobar sin lugar en el paquete: paquete_lleno");
check((await ids(A1O, `select id from public.pedidos_de_sillas`)).includes(P1), "el dueño de A1 ve su pedido");
check((await ids(B1O, `select id from public.pedidos_de_sillas`)).length === 0, "el dueño de B1 no");
const P2 = String(await val(AA, `select public.pedir_sillas(5, 'crecemos', '${ORG_A}')`));
await falla(AA, `select public.decidir_pedido('${P2}', true)`, /sin_permiso/, "el cliente no aprueba su propio pedido a Maven");
await anda(GRACE, `select public.decidir_pedido('${P2}', true)`, "Grace aprueba el pedido a Maven (las personas no son precio)");
check((await val("postgres", `select personas from public.organizaciones where id = '${ORG_A}'`)) === 15, "el paquete de A sube a 15");
await anda(AA, `select public.decidir_pedido('${P1}', true)`, "ahora el admin de A aprueba las 2 sillas de A1");
check((await val("postgres", `select sillas from public.tenants where id = '${A1}'`)) === 8, "A1 queda con 8");
await falla(AA, `select public.decidir_pedido('${P1}', false)`, /ya_decidido/, "un pedido se decide una vez");

// ════ 6. Preparación y enlaces ═══════════════════════════════════════════════
await falla("service_role", `select public.crear_enlace_de_acceso('${A1O}', 'invitacion', '${A1}', null, '${AA}')`, /org_en_preparacion/,
  "cliente en preparación: no salen invitaciones");
await falla("service_role", `select public.crear_enlace_de_acceso('${AA}')`, /org_en_preparacion/, "ni al admin del cliente");
await falla(RUSIN, `select public.activar_organizacion('${ORG_C}')`, /faltan_pendientes: lider/, "sin líder no se activa");
await falla(AA, `select public.activar_organizacion('${ORG_A}')`, /sin_permiso/, "el cliente no se activa solo");
await anda(GRACE, `select public.activar_organizacion('${ORG_A}'); select public.activar_organizacion('${ORG_B}')`, "la plataforma activa A y B");
const TOKEN = String(await val("service_role", `select public.crear_enlace_de_acceso('${A1O}', 'invitacion', '${A1}', null, '${AA}')`));
check(TOKEN.length === 64, "activado, sale el enlace (64 caracteres)");
check((await val("postgres", `select count(*)::int from public.enlaces_de_acceso where token_hash = '${TOKEN}'`)) === 0, "la base guarda el hash, no el enlace");
check((await val("service_role", `select public.usar_enlace_de_acceso('${TOKEN}', 'invitacion')`)) === A1O, "el enlace devuelve su persona");
await falla("service_role", `select public.usar_enlace_de_acceso('${TOKEN}')`, /enlace_usado/, "un solo uso");
const VIEJO = String(await val("service_role", `select public.crear_enlace_de_acceso('${E1}')`));
await db.exec(`update public.enlaces_de_acceso set expira_at = now() - interval '1 minute' where user_id = '${E1}'`);
await falla("service_role", `select public.usar_enlace_de_acceso('${VIEJO}')`, /enlace_vencido/, "a los 7 días vence");
await falla(AA, `select public.crear_enlace_de_acceso('${E1}')`, /permission denied/, "desde la app nadie crea enlaces (solo el servidor)");
await falla(AA, `select * from public.enlaces_de_acceso`, /permission denied/, "ni los lee");

// ════ 7. Avisos, historial, líderes ═════════════════════════════════════════
await anda(AA, `select public.mandar_aviso('${ORG_A}', 'Hola', 'Reunión mañana', array['${A1}']::uuid[])`, "el admin de A manda un aviso a A1");
await falla(AA, `select public.mandar_aviso('${ORG_A}', 'x', 'y', array['${B1}']::uuid[])`, /agencia_de_otro_cliente/, "no a una agencia de otro cliente");
await falla(BB, `select public.mandar_aviso('${ORG_A}', 'x', 'y')`, /sin_permiso/, "el admin de B no manda avisos a A");
check((await ids(E1, `select id from public.organizacion_avisos`)).length === 1, "alguien de A1 ve el aviso");
check((await ids(E7, `select id from public.organizacion_avisos`)).length === 0, "alguien de A2 no (no era para A2)");
check((await ids(B1O, `select id from public.organizacion_avisos`)).length === 0, "alguien de B1 no");
const bitA = await como(AA, `select distinct organizacion_id::text o from public.organizacion_bitacora`);
check(bitA.length === 1 && bitA[0].o === ORG_A, "el historial: el admin de A ve solo lo de A");
check((await ids(BB, `select id from public.organizacion_bitacora where organizacion_id = '${ORG_A}'`)).length === 0, "el de B no ve el de A");
const lid = (await como(AA, `select public.lideres_de_organizacion('${ORG_A}') l`))[0].l as Fila[];
const yo = lid.find((l) => l.user_id === AA);
check(yo?.correo_madre === true && yo?.agencias_creadas === 2 && yo?.invitaciones_mandadas === 1 && yo?.sillas_repartidas === 12
  && yo?.ultimas_acciones?.length === 5 && yo?.pedidos_sin_responder === 0,
  `«Líder de {Marca}»: correo madre, 2 agencias, 1 invitación, 12 sillas (6+4+0+2), 5 acciones (${JSON.stringify({ ...yo, ultimas_acciones: yo?.ultimas_acciones?.length })})`);
await falla(BB, `select public.lideres_de_organizacion('${ORG_A}')`, /sin_permiso/, "el de B no ve los líderes de A");

// ════ 8. Saldo de Argos ══════════════════════════════════════════════════════
check((await val("service_role", `select public.argos_puede_juzgar('${A1}')`)) === false, "sin crédito, Argos está en pausa");
await falla(GRACE, `select public.argos_acreditar('${ORG_A}', null, 'recarga', 50)`, /solo_dueno/, "Grace no pone créditos (es cobro)");
check((await val("service_role", `select public.argos_acreditar_planes()`)) === 1, "el crédito del mes entra a A (B no tiene Argos en el plan)");
check((await val("service_role", `select public.argos_acreditar_planes()`)) === 0, "y una sola vez por mes");
check((await val("service_role", `select public.argos_puede_juzgar('${A1}')`)) === true, "con USD 20, Argos juzga");
await anda("service_role", `select public.argos_cobrar('${A1}', 15, '{"fotos":100}')`, "cobra 15 a A1");
const cob = (await como("service_role", `select public.argos_cobrar('${A2}', 7) r`))[0].r;
check(Number(cob.saldo_usd) === -2 && cob.pausado === true, `se anota lo gastado aunque quede en −2, y Argos se pausa (${JSON.stringify(cob)})`);
check((await val("service_role", `select public.argos_puede_juzgar('${A1}')`)) === false, "en pausa, no juzga a ninguna agencia del cliente");
const rec = (await como(RUSIN, `select public.argos_acreditar('${ORG_A}', null, 'recarga', 50, 'pi_prueba') r`))[0].r;
check(Number(rec.saldo_usd) === 48 && rec.pausado === false, "el dueño recarga 50 y Argos vuelve");
await falla(AA, `select public.argos_cobrar('${A1}', 1)`, /permission denied/, "desde la app nadie cobra");
check((await como(AA, `select 1 from public.argos_saldo`)).length === 1, "el admin de A ve su billetera");
check((await como(BB, `select organizacion_id::text o from public.argos_saldo`)).every((f) => f.o === ORG_B), "el de B solo la suya");
check((await como(A1O, `select 1 from public.argos_saldo_movimientos`)).length === 1, "el dueño de A1 ve solo los consumos de A1");
await anda("service_role", `select public.argos_cobrar('${SUELTA}', 1)`, "la agencia suelta tiene su propia billetera");

// ════ 9. Tableros ════════════════════════════════════════════════════════════
// Los segmentos prueban quién sigue en vivo, pero cerca de medianoche algunos
// empezaron ayer. Las tres personas tienen capturas de HOY para probar la nota
// diaria sin depender de la hora del runner; la cuarta solo tiene una de ayer.
await db.exec(`insert into public.cowork_tiempo_segmentos (user_id, estado, started_at, last_seen_at, seconds) values
  ('${E1}', 'activo', now() - interval '1 hour', now(), 3600), ('${E2}', 'activo', now() - interval '10 minutes', now() - interval '10 seconds', 600),
  ('${E3}', 'activo', now() - interval '2 hours', now() - interval '30 minutes', 5400);
  insert into public.monitor_capturas (user_id, tipo, cara_visible, fuera_de_lugar) values
  ('${E1}', 'camara', true, null), ('${E1}', 'pantalla', null, false), ('${E1}', 'pantalla', null, true),
  ('${E2}', 'camara', true, null), ('${E3}', 'camara', true, null);
  insert into public.monitor_capturas (user_id, tipo, cara_visible, created_at) values
  ('${E4}', 'camara', true, now() - interval '1 day');`);
const res = (await como(AA, `select public.resumen_organizacion('${ORG_A}') r`))[0].r;
const a1 = (res.agencias as Fila[]).find((a) => a.id === A1);
check(res.paquete === 15 && res.repartidas === 12 && res.libres === 3 && res.ocupadas === 7, `tablero: paquete 15, repartidas 12, libres 3, ocupadas 7 (${res.paquete}/${res.repartidas}/${res.libres}/${res.ocupadas})`);
check(a1?.personas === 6 && a1?.en_vivo === 2 && a1?.llena === false, `A1: 6 personas, 2 en vivo (el de hace 30 min no) (${a1?.personas}/${a1?.en_vivo})`);
check(typeof a1?.nota_argos_hoy === "number" && a1?.nota_con_datos === 3, `A1 tiene nota de Argos de hoy y excluye los datos de ayer (${a1?.nota_argos_hoy}, ${a1?.nota_con_datos} con datos)`);
check(Number(a1?.argos_gastado_mes_usd) === 15 && a1?.necesita_de_ti === 1, `A1: gastó 15 de Argos este mes; necesita de ti = 1 alerta grave (${a1?.argos_gastado_mes_usd}/${a1?.necesita_de_ti})`);
check(res.organizacion.plan.precio_usd === 299, "el admin del cliente ve su precio");
const resG = (await como(GRACE, `select public.resumen_organizacion('${ORG_A}') r`))[0].r;
check(resG.organizacion.plan.precio_usd === undefined && resG.organizacion.plan.personas === 15 && resG.argos.argos_usd_mes === null,
  "Grace ve el tablero sin precios");
const planG = (await como(GRACE, `select public.plan_de_organizacion('${ORG_A}') p`))[0].p;
check(planG.cobro === null && planG.ve_precios === false, "plan_de_organizacion: Grace sin cobro");
const planA = (await como(AA, `select public.plan_de_organizacion('${ORG_A}') p`))[0].p;
check(planA.ve_precios === true && planA.plan.precio_usd === 299, "el admin del cliente ve su plan y sus pagos");

// Kash: tarjeta de afuera, solo mirar (la refresca el servidor).
await anda("service_role", `insert into public.organizaciones_externas (nombre, app_url, resumen, actualizado_at)
  values ('KA$H Group', 'maven://kash', '{"personas":91,"en_vivo":40}', now())`, "el servidor guarda el resumen de Kash");
await falla(GRACE, `insert into public.organizaciones_externas (nombre) values ('otra')`, /row-level security/, "desde la app nadie la escribe");
const dueno = (await como(RUSIN, `select public.organizaciones_del_dueno() d`))[0].d;
check(dueno.clientes.length === 3 && dueno.externas.length === 1 && dueno.externas[0].solo_mirar === true && dueno.ve_precios === true,
  `«Tus organizaciones»: 3 clientes + Kash para mirar (${dueno.clientes.length}+${dueno.externas.length})`);
const duenoG = (await como(GRACE, `select public.organizaciones_del_dueno() d`))[0].d;
check(duenoG.ve_precios === false && duenoG.clientes.every((c: Fila) => c.organizacion.plan.precio_usd === undefined), "Grace la ve sin precios");
await falla(AA, `select public.organizaciones_del_dueno()`, /sin_permiso/, "un admin de cliente no ve el panel del dueño");
check((await como(AA, `select 1 from public.organizaciones_externas`)).length === 0, "ni la tarjeta de Kash");

// ════ 10. Socios y briefs ════════════════════════════════════════════════════
await anda(RUSIN, `insert into public.socios (user_id, nombre) values ('${SOCIO}', 'Socio')`, "el dueño invita un socio");
await anda(SOCIO, `insert into public.briefs (empresa, socio_id) values ('Prospecto', '${SOCIO}')`, "el socio levanta un brief");
await falla(X, `insert into public.briefs (empresa, socio_id) values ('Otro', '${X}')`, /row-level security/, "alguien que no es socio, no");
await anda(RUSIN, `insert into public.briefs (empresa) values ('Del dueño')`, "el dueño también");
check((await como(SOCIO, `select 1 from public.briefs`)).length === 1, "el socio ve solo los suyos");
check((await como(GRACE, `select 1 from public.briefs`)).length === 2, "la plataforma ve todos");

// ════ 10b. Cobros (Stripe, bloqueo, puerta) ══════════════════════════════════
try {
  await aplicar(db, "cobros", COBROS);
  check(true, "la migración de cobros carga encima del árbol");
} catch (e) {
  console.error(msg(e));
  Deno.exit(1);
}
check((await como(X, `select clave from public.precios_plataforma`)).length === 7, "los precios de la portada los lee cualquiera");
check((await como(GRACE, `update public.precios_plataforma set valor = '{"precio_usd":1}' where clave = 'plan_equipo' returning 1`)).length === 0,
  "Grace no cambia precios");
check((await como(RUSIN, `update public.precios_plataforma set actualizado_at = now() where clave = 'plan_equipo' returning 1`)).length === 1,
  "el dueño sí");
check((await val("service_role", `select public.stripe_evento_tomar('evt_1', 'invoice.paid')`)) === "nuevo", "evento nuevo → se procesa");
check((await val("service_role", `select public.stripe_evento_tomar('evt_1', 'invoice.paid')`)) === "reintento", "llegó otra vez sin cerrar → reintento");
await anda("service_role", `select public.stripe_evento_cerrar('evt_1', '${ORG_B}', '{"ok":true}')`, "se cierra el evento");
check((await val("service_role", `select public.stripe_evento_tomar('evt_1', 'invoice.paid')`)) === "repetido", "ya cerrado → repetido (no se hace dos veces)");
await falla(AA, `select public.stripe_evento_tomar('evt_2', 'x')`, /permission denied/, "desde la app nadie toca los eventos");
await falla(GRACE, `select public.cobros_actualizar('${ORG_B}', '{"estado_pago":"al_dia"}')`, /permission denied/, "Grace no toca el cobro");

// Pago fallido: 7 días de gracia (aquí, ya vencida) → el reloj bloquea; B1O no entra.
await anda("service_role", `select public.cobros_actualizar('${ORG_B}', '{"estado_pago":"pago_fallido","gracia_hasta":"2020-01-01T00:00:00Z","stripe_subscription_id":"sub_1"}')`,
  "el webhook anota el pago fallido");
const accB = (await como(B1O, `select public.cobros_mi_acceso() a`))[0].a;
check(accB.bloqueada === true && accB.motivo === "pago" && accB.puedo_pagar === false,
  `pasada la gracia, la gente del cliente no entra aunque el reloj no haya corrido (${JSON.stringify(accB)})`);
check((await val("postgres", `select public.cobros_bloquear_vencidos()`)) === 1, "el reloj bloquea al que se pasó de la gracia");
check((await val("postgres", `select estado from public.organizaciones where id = '${ORG_B}'`)) === "bloqueada", "B queda bloqueada");
check((await val("postgres", `select public.cobros_bloquear_vencidos()`)) === 0, "y no lo vuelve a contar");
const accBB = (await como(BB, `select public.cobros_mi_acceso() a`))[0].a;
check(accBB.bloqueada === true && accBB.puedo_pagar === true, "su admin ve el bloqueo con el botón de pagar");
check((await como(AA, `select public.cobros_mi_acceso() a`))[0].a.bloqueada === false, "el cliente A (al día) entra");
check((await como(GRACE, `select public.cobros_mi_acceso() a`))[0].a.bloqueada === false, "la plataforma nunca queda bloqueada");
// En gracia todavía: entra, con aviso.
await anda("service_role", `select public.cobros_actualizar('${ORG_A}', jsonb_build_object('estado_pago', 'pago_fallido', 'gracia_hasta', now() + interval '7 days'))`,
  "A falla un pago: 7 días de gracia");
const accA = (await como(E1, `select public.cobros_mi_acceso() a`))[0].a;
check(accA.bloqueada === false && accA.en_gracia === true, `en gracia entra con aviso (${JSON.stringify(accA)})`);
check((await val("postgres", `select public.cobros_bloquear_vencidos()`)) === 0, "en gracia el reloj no bloquea");
// Paga: invoice.paid → al día y activa otra vez; la gracia se borra.
await anda("service_role", `select public.cobros_actualizar('${ORG_B}', '{"estado_pago":"al_dia","gracia_hasta":null,"bloqueada_at":null}', 'activa')`,
  "pagó: el webhook la desbloquea");
const cobB = (await como(BB, `select public.plan_de_organizacion('${ORG_B}') p`))[0].p.cobro;
check((await val("postgres", `select estado from public.organizaciones where id = '${ORG_B}'`)) === "activa" && cobB.gracia_hasta === undefined && cobB.estado_pago === "al_dia",
  `B vuelve a activa y sin gracia (${JSON.stringify(cobB)})`);
await falla(GRACE, `select public.cobros_desbloquear('${ORG_B}')`, /solo_dueno/, "Grace no desbloquea (es cobro)");
await anda(RUSIN, `select public.cobros_desbloquear('${ORG_B}', 3)`, "el dueño desbloquea a mano con días de gracia");
// Un cliente pausado por Maven: Stripe no lo reactiva.
await db.exec(`update public.organizaciones set estado = 'pausada' where id = '${ORG_C}'`);
await anda("service_role", `select public.cobros_actualizar('${ORG_C}', '{"estado_pago":"al_dia"}', 'activa')`, "un pago de un cliente pausado");
check((await val("postgres", `select estado from public.organizaciones where id = '${ORG_C}'`)) === "pausada", "pausado por Maven: Stripe no lo prende");
// Falta la tarjeta (registro sin terminar el checkout).
await anda("service_role", `select public.cobros_actualizar('${ORG_B}', '{"estado_pago":"pendiente_checkout"}')`, "registro sin tarjeta todavía");
check((await como(BB, `select public.cobros_mi_acceso() a`))[0].a.motivo === "falta_tarjeta", "sin tarjeta: pide terminar el pago");
await anda("service_role", `select public.cobros_actualizar('${ORG_B}', '{"estado_pago":"prueba"}')`, "con tarjeta: prueba de 14 días");

// Créditos de Argos: plan del mes una vez; recarga de Stripe una vez.
const sB0 = Number(await val("postgres", `select saldo_usd from public.argos_saldo where organizacion_id = '${ORG_B}'`));
await db.exec(`update public.organizaciones set plan = plan || '{"argos_usd_mes":20}' where id = '${ORG_B}'`);
const pl1 = (await como("service_role", `select public.argos_acreditar_plan_de('${ORG_B}', 'in_1') r`))[0].r;
const pl2 = (await como("service_role", `select public.argos_acreditar_plan_de('${ORG_B}', 'in_2') r`))[0].r;
check(pl1.acreditado === true && Number(pl1.saldo_usd) === sB0 + 20 && pl2.acreditado === false && Number(pl2.saldo_usd) === sB0 + 20,
  `el crédito del plan entra una vez por mes y se acumula (${sB0} → ${pl1.saldo_usd} → ${pl2.saldo_usd})`);
await anda("service_role", `select public.argos_acreditar('${ORG_B}', null, 'recarga', 50, 'cs_recarga_1')`, "recarga de Stripe: +50");
await falla("service_role", `select public.argos_acreditar('${ORG_B}', null, 'recarga', 50, 'cs_recarga_1')`, /argos_mov_recarga_ref_idx|duplicate key/,
  "la misma recarga no entra dos veces");
check(Number(await val("postgres", `select saldo_usd from public.argos_saldo where organizacion_id = '${ORG_B}'`)) === sB0 + 70, "saldo = antes + 20 + 50");
check((await val("service_role", `select public.argos_acreditar_planes_sin_stripe()`)) === 0, "este mes A ya tenía su crédito: no se repite");
check((await val("service_role", `select public.argos_acreditar_planes_sin_stripe((now() + interval '1 month')::date)`)) === 1,
  "día 1 del mes que viene: solo el cliente activo sin Stripe recibe su crédito (A; B paga por Stripe, C está pausado)");

// La puerta: directorio (sí/no) y su tope.
check((await val("service_role", `select public.directorio_es_del_edificio(' Lider@Cliente-B.test ')`)) === true, "un correo del edificio → sí");
check((await val("service_role", `select public.directorio_es_del_edificio('alguien@kash.test')`)) === false, "uno que no → no");
await falla(X, `select public.directorio_es_del_edificio('lider@cliente-b.test')`, /permission denied/, "desde la app nadie pregunta el directorio");
const topes = [];
for (let i = 0; i < 4; i++) topes.push(await val("service_role", `select public.puerta_contar('ip:1', 3)`));
check(JSON.stringify(topes) === "[true,true,true,false]", `el tope corta al cuarto intento (${JSON.stringify(topes)})`);

// ════ 10c. Quién soy en la plataforma ════════════════════════════════════════
try {
  await aplicar(db, "quien_soy", QUIEN_SOY);
  const yo = async (u: Quien) => (await como(u, `select public.quien_soy_en_la_plataforma() y`))[0].y;
  const r = await yo(RUSIN), g = await yo(GRACE), a = await yo(AA), x = await yo(X);
  check(r.tipo === "dueno" && r.correo.toLowerCase() === "rusin24@gmail.com", `rusin24 es «dueno» (${JSON.stringify(r)})`);
  check(g.tipo === "admin_plataforma", `Grace es «admin_plataforma» (${g.tipo})`);
  check(a.tipo === "admin_cliente" && a.organizacion_id === ORG_A, `el admin del cliente A es «admin_cliente» de A (${JSON.stringify(a)})`);
  check(x.tipo === null, `alguien sin nada no es de la plataforma (${x.tipo})`);
  const eq = (await como(GRACE, `select public.equipo_de_maven() e`))[0].e as Fila[];
  check(eq.length === 2 && eq[0].nivel === "dueno", `el equipo de Maven: dueño primero (${eq.map((e) => e.nivel).join(",")})`);
  await falla(AA, `select public.equipo_de_maven()`, /sin_permiso/, "el admin de un cliente no ve el equipo de Maven");
  await falla(X, `select public.equipo_de_maven()`, /sin_permiso/, "un cualquiera no ve el equipo de Maven");
} catch (e) {
  check(false, `quien_soy: ${msg(e)}`);
}

// ════ 11. Vuelta atrás y vuelta a cargar ═════════════════════════════════════
try {
  await aplicar(db, "vuelta atrás de quien_soy", vuelta(QUIEN_SOY));
  check((await q(`select to_regproc('public.equipo_de_maven') is null n`))[0].n === true, "la vuelta atrás de quien_soy borra lo suyo");
  await aplicar(db, "vuelta atrás de cobros", vuelta(COBROS));
  check((await q(`select to_regclass('public.precios_plataforma') is null n`))[0].n === true, "la vuelta atrás de cobros borra lo suyo");
  await aplicar(db, "vuelta atrás de arbol_funciones", vuelta(FUNCIONES));
  await aplicar(db, "vuelta atrás de arbol", vuelta(ARBOL));
  const quedan = await q(`select count(*)::int n from pg_tables where schemaname = 'public' and tablename in
    ('organizaciones', 'organizacion_admins', 'agencia_en_foco', 'pedidos_de_sillas', 'argos_saldo', 'briefs', 'organizaciones_externas', 'arbol_respaldo')`);
  check(quedan[0].n === 0, "la vuelta atrás borra todo lo nuevo");
  const src = await q(`select prosrc from pg_proc where proname = 'current_tenant_id'`);
  check(!/agencia_en_foco/.test(src[0].prosrc), "current_tenant_id() vuelve a ser el de antes");
  const pol = await q(`select coalesce(qual, '') || coalesce(with_check, '') e from pg_policies where tablename in ('argos_alertas', 'argos_contexto', 'tenants')`);
  check(pol.every((p) => !/soy_dueno_aqui|tenants_visibles/.test(p.e)), "las políticas vuelven a las de antes");
  check(JSON.stringify(await ids(K, `select tenant_id from public.argos_alertas`)) === t(SUELTA), "y el dueño suelto sigue viendo lo suyo");
  await aplicar(db, "arbol (otra vez)", ARBOL);
  await aplicar(db, "arbol_funciones (otra vez)", FUNCIONES);
  await aplicar(db, "cobros (otra vez)", COBROS);
  await aplicar(db, "quien_soy (otra vez)", QUIEN_SOY);
  check(true, "después de la vuelta atrás, las cuatro vuelven a cargar");
} catch (e) {
  check(false, msg(e));
}

for (const m of ok) console.log("  ✓", m);
for (const m of mal) console.log("  ✗", m);
console.log(`\n${ok.length} bien, ${mal.length} mal`);
if (mal.length) Deno.exit(1);
