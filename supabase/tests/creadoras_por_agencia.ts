// Creadoras por agencia, cuentas externas y avisos (migraciones
// 20261005140000_creadoras_por_agencia y 20261005140100_cuentas_externas_y_avisos),
// probadas contra un Postgres de verdad (PGlite) con el catálogo de PROD:
// fixtures/prod_roles_20261001.sql (roles, auth, tenants) + fixtures/prod_creadoras_20261005.sql
// (creators, sus 3 vistas, notifications y las 42 funciones, copiadas textual con sus huellas).
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/creadoras_por_agencia.ts
//
// La línea de partida es prod: el fixture + las migraciones que ya están aplicadas
// (agencias_base, roles_por_agencia, personas_por_agencia). Cómo está armado:
//   0. El fixture es prod: las huellas de las 42 funciones, las 2 que salen de las
//      migraciones de antes y las 3 vistas.
//   1. La migración: el relleno (sin UPDATE: el webhook externo no se entera), el
//      trigger, la política, el respaldo y qué funciones cambiaron.
//   2. EQUIVALENCIA con una sola agencia: cada persona ve lo mismo que en prod en
//      la tabla, en v_creators y en 11 funciones. La única que cambia es la que
//      tenía alcance global implícito (un supervisor sin permiso de Creadores).
//   3. DOS agencias: cada cosa se prueba primero abierta en prod (la línea base:
//      si no está abierta, el test no prueba nada) y después cerrada.
//   4. Las vistas ya no se escriben (antes: borrar o insertar saltando la RLS).
//   5. Cuentas externas: el alta de empleados sigue igual; la de creadora no
//      recibe rol, tal como la hace GoTrue (INSERT y después UPDATE de app_metadata).
//   6. Avisos: los 5 usos legítimos del navegador, el de service_role y el de una
//      función SECURITY DEFINER siguen; los maliciosos, no.
//   7. La vuelta atrás (las líneas «--|») deja todo como en prod, y se puede volver
//      a aplicar.
//   8. Las negativas: con dos agencias, con una función o vista distinta de la
//      revisada, o con una función nueva sin revisar, no corre y no deja nada.
//
// Sale con código 1 si algo falla. Corre en el guard de cada PR.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FX_ROLES = leer("./fixtures/prod_roles_20261001.sql");
const FX = leer("./fixtures/prod_creadoras_20261005.sql");
const ANTES = ["20261001210000_agencias_base.sql", "20261001211000_roles_por_agencia.sql", "20261001212000_personas_por_agencia.sql"]
  .map((n) => ({ n, sql: leer(`../migrations/${n}`) }));
const N1 = "20261005140000_creadoras_por_agencia.sql", N2 = "20261005140100_cuentas_externas_y_avisos.sql";
const M1 = leer(`../migrations/${N1}`), M2 = leer(`../migrations/${N2}`);
const vuelta = (sql: string) => sql.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");
const HUELLAS = new Map([...FX.matchAll(/^--   (\w+\([^)]*\))=([0-9a-f]{32})$/gm)].map((m) => [m[1], m[2]]));
const VISTAS = new Map([...FX.matchAll(/^--   (v_\w+)=([0-9a-f]{32})$/gm)].map((m) => [m[1], m[2]]));
const DE_ANTES = ["has_creators_global_scope(_user_id uuid)", "handle_new_user()"];

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);
const json = (x: unknown) => JSON.stringify(x);

// ─── Gente, agencias y creadoras del ensayo ──────────────────────────────────
const T1 = "10000000-0000-4000-8000-000000000001"; // asm-tech
const T2 = "10000000-0000-4000-8000-000000000002"; // otra agencia
const P = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [JHON, ANA, MARIO, CLARA, EMPL, SUPI, SINROL] = [1, 2, 3, 4, 5, 6, 7].map(P); // asm-tech
const [OLGA, PEPE] = [11, 12].map(P); // la otra agencia
const SINAG = P(20); // cuenta con rol 'admin' y sin agencia (registro público)
const [EMPLEADO_NUEVO, CREADORA, CREADORA2, CREADORA3] = [30, 31, 32, 33].map(P);
const PERSONAS: [string, string][] = [["jhon (admin)", JHON], ["ana (Chatter, C1 por su grupo)", ANA], ["mario (manager)", MARIO],
  ["clara (closer de C3)", CLARA], ["empl (employee)", EMPL], ["supi (supervisor sin Creadores)", SUPI], ["sinrol", SINROL]];
const C = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [C1, C2, C3, C4, D1, BORRADA] = [1, 2, 3, 4, 11, 99].map(C);
const K = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [K1, K2, K3] = [1, 2, 3].map(K);

// Los roles de asm-tech como los arma la app (insert en roles_config → el trigger
// crea role_groups como «empleado» → se le pone el tipo), y la gente: el alta real
// (handle_new_user de antes de agencias_base: perfil, 'employee' y asm-tech).
const SEMILLA = `
insert into public.tenants(id, slug, name) values ('${T1}', 'asm-tech', 'ASM Tech');
insert into public.roles_config (name, is_system, level) values
  ('admin', true, 100), ('manager', true, 70), ('supervisor', true, 50), ('employee', true, 20), ('closer', true, 20),
  ('Chatter', false, 20), ('Chatter Supervisor', false, 55), ('Supervisor sin creadoras', false, 50);
update public.role_groups set is_admin = true, is_manager_or_above = true, is_supervisor_or_above = true where role_name = 'admin';
update public.role_groups set is_manager_or_above = true, is_supervisor_or_above = true where role_name = 'manager';
update public.role_groups set is_supervisor_or_above = true where role_name in ('supervisor', 'Chatter Supervisor', 'Supervisor sin creadoras');
insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
select rc.id, p.module, p.submodule, p.can_access, p.scope from public.roles_config rc join (values
  ('Chatter', 'Creadores', null, false, 'self'),
  ('manager', 'Creadores', null, true, 'all'),
  ('manager', 'Closers', 'Asignar Closer', true, 'all'),
  ('supervisor', 'Creadores', null, true, 'all'),
  ('Chatter Supervisor', 'Creadores', null, true, 'all'),
  ('employee', 'Creadores', null, false, 'all'),
  ('closer', 'Closers', null, true, 'self'),
  ('Supervisor sin creadoras', 'Cowork', null, true, 'all')
) as p(rol, module, submodule, can_access, scope) on p.rol = rc.name;
insert into auth.users(id, email, raw_user_meta_data) values
  ('${JHON}', 'jhon.lopez@maven-ai.me', '{"full_name":"Jhon"}'), ('${ANA}', 'ana@x.test', '{"full_name":"Ana"}'),
  ('${MARIO}', 'mario@x.test', '{"full_name":"Mario"}'), ('${CLARA}', 'clara@x.test', '{"full_name":"Clara"}'),
  ('${EMPL}', 'empl@x.test', '{"full_name":"Empl"}'), ('${SUPI}', 'supi@x.test', '{"full_name":"Supi"}'),
  ('${SINROL}', 'sinrol@x.test', '{"full_name":"Sin rol"}');
update public.user_roles set role = 'admin' where user_id = '${JHON}';
update public.user_roles set role = 'Chatter' where user_id = '${ANA}';
update public.user_roles set role = 'manager' where user_id = '${MARIO}';
update public.user_roles set role = 'closer' where user_id = '${CLARA}';
update public.user_roles set role = 'Supervisor sin creadoras' where user_id = '${SUPI}';
delete from public.user_roles where user_id = '${SINROL}';
`;

// Las creadoras de hoy (antes de la migración: así las agarra el relleno).
const HOY = `(now() at time zone 'utc')`;
const DATOS = `
insert into public.creators (id, name, artistic_name, status, instagram_handle, email, phone, city, assigned_manager_id, assigned_manager_profile_id, closer_responsible_id, category, created_by) values
  ('${C1}', 'Uno', 'Unito', 'active', 'uno', 'uno@x.test', '+573001110001', 'Medellín', '${MARIO}', '${MARIO}', null, 'A+', '${JHON}'),
  ('${C2}', 'Dos', null, 'terminated', 'dos', 'dos@x.test', '+573001110002', 'Cali', null, null, null, null, '${JHON}'),
  ('${C3}', 'Tres', null, 'active', 'tres', null, null, 'Medellín', null, null, '${CLARA}', 'Elite', '${JHON}'),
  ('${C4}', 'Cuatro', null, 'active', 'cuatro', null, null, null, null, null, null, null, '${JHON}');
insert into public.chatter_identity (id, display_name, maven_user_id) values ('e0000000-0000-4000-8000-000000000001', 'Ana', '${ANA}');
insert into public.chatter_group_members (group_id, identity_id, shift) values ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'mañana');
insert into public.chatter_group_creators (group_id, creator_id, creator_handle) values ('f0000000-0000-4000-8000-000000000001', '${C1}', 'uno');
insert into public.closers_contacts (id, name, handle, platform, created_by) values
  ('${K1}', 'Contacto Uno', '@uno', 'instagram', '${JHON}'), ('${K2}', 'Nueva', 'nuevaig', 'instagram', '${JHON}');
insert into public.promolog_entries (creator_id, date, promoted, network, tenant_id, story_count) values
  ('${C1}', ${HOY}, 'true', 'instagram', '${T1}', 2), ('${C3}', ${HOY}, 'false', 'instagram', '${T1}', 1);
insert into public.creator_status_history (creator_id, instagram_handle, name, new_status) values ('${BORRADA}', 'uno', 'Uno de antes', 'deleted');
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}
type Modo = "prod" | "con";
async function nueva(modo: Modo, antes = ""): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FX_ROLES);
  await db.exec(FX);
  await db.exec(SEMILLA);
  for (const m of ANTES) await aplicar(db, m.n, m.sql);
  await db.exec(DATOS + antes);
  if (modo === "con") { await aplicar(db, N1, M1); await aplicar(db, N2, M2); }
  return db;
}
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as Fila[];
const uno = async (db: PGlite, sql: string) => (await q(db, sql))[0];

// Un pedido como lo manda PostgREST: una transacción, el rol y los claims del JWT.
type Quien = string | "service_role" | "anon" | "postgres";
async function entrar(db: PGlite, quien: Quien) {
  await db.exec("reset role");
  if (quien === "postgres") return;
  const servicio = quien === "service_role" || quien === "anon";
  const claims = servicio ? { role: quien } : { sub: quien, role: "authenticated" };
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
  await db.exec(`set local role ${servicio ? quien : "authenticated"}`);
}
async function como(db: PGlite, quien: Quien, sql: string): Promise<Fila[]> {
  await db.exec("begin");
  try {
    await entrar(db, quien);
    const rs = await db.exec(sql);
    await db.exec("commit");
    return (rs.at(-1)?.rows ?? []) as Fila[];
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
// Lo corre y lo deshace siempre: para probar escrituras sin cambiar la base del ensayo.
async function probar(db: PGlite, quien: Quien, sql: string): Promise<Fila[] | string> {
  await db.exec("begin");
  try { await entrar(db, quien); const rs = await db.exec(sql); return (rs.at(-1)?.rows ?? []) as Fila[]; }
  catch (e) { return msg(e); }
  finally { await db.exec("rollback"); }
}
const intento = async (f: () => Promise<unknown>) => { try { await f(); return "anduvo"; } catch (e) { return msg(e); } };
const huellas = async (db: PGlite) => new Map((await q(db, `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' f, md5(p.prosrc) h
  from pg_proc p where p.pronamespace = 'public'::regnamespace`)).map((f) => [f.f as string, f.h as string]));
const vistas = async (db: PGlite) => new Map((await q(db, `select relname, md5(pg_get_viewdef(oid, true)) h from pg_class
  where relnamespace = 'public'::regnamespace and relkind = 'v'`)).map((f) => [f.relname as string, f.h as string]));

// Lo que ve una persona: la tabla, la vista y 11 funciones que devuelven creadoras.
async function loQueVe(db: PGlite, quien: Quien): Promise<Fila> {
  const una = async (sql: string) => {
    try { return (await como(db, quien, sql)).map((f) => Object.values(f).length === 1 ? Object.values(f)[0] : f); }
    catch (e) { return `error: ${msg(e).slice(0, 70)}`; }
  };
  return {
    tabla: await una(`select id from public.creators order by id`),
    vista: await una(`select id, phone from public.v_creators order by id`),
    promolog_elegibles: await una(`select id from public.v_promolog_eligible_creators order by id`),
    por_correo: await una(`select public.find_creator_name_by_email('uno@x.test') v`),
    por_telefono: await una(`select public.find_creator_name_by_phone('+573001110002') v`),
    historial: await una(`select creator_id, name, source from public.find_creator_history_by_handle('uno') order by source`),
    sin_promo_7d: await una(`select creator_id from public.get_promolog_stale_creators(7) order by 1`),
    faltantes_hoy: await una(`select creadora, estado from public.get_promo_day_faltantes('${T1}', null, null) order by creadora`),
    promo_hoy: await una(`select creator_id, promo_stories from public.get_promo_day_breakdown('${T1}', null, null) order by creator_id`),
    acciones: await una(`select kind, creator_id from public.get_promolog_action_feed('${T1}') order by kind`),
    ciudades: await una(`select v from public.contact_filter_cities() v order by 1`),
    contactos_medellin: await una(`select v from public.contact_ids_by_city('Medellín') v order by 1`),
    activas_hoy: await una(`select public.get_contact_funnel_stats(null, null)->'activas_hoy' v`),
  };
}
const diferencias = (a: Fila, b: Fila, pre = ""): string[] => {
  const ks = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  const out: string[] = [];
  for (const k of ks) if (json(a?.[k]) !== json(b?.[k])) out.push(`${pre}${k}: ${json(a?.[k])} → ${json(b?.[k])}`);
  return out;
};

// ════ 0. El fixture es prod ══════════════════════════════════════════════════
{
  const db = new PGlite();
  await db.exec(FX_ROLES);
  await db.exec(FX);
  const h = await huellas(db);
  const distintas = [...HUELLAS].filter(([f, x]) => !DE_ANTES.includes(f) && h.get(f) !== x).map(([f]) => f);
  check(HUELLAS.size === 44 && distintas.length === 0, `las ${HUELLAS.size - DE_ANTES.length} funciones del fixture tienen las huellas de prod${distintas.length ? ` — distintas: ${distintas.join(", ")}` : ""}`);
  const v = await vistas(db);
  const vd = [...VISTAS].filter(([n, x]) => v.get(n) !== x).map(([n]) => n);
  check(VISTAS.size === 3 && vd.length === 0, `y las 3 vistas, la definición de prod (md5 de pg_get_viewdef)${vd.length ? ` — distintas: ${vd.join(", ")}` : ""}`);
}

const prod = await nueva("prod");
const con = await nueva("con");

{
  const h = await huellas(prod);
  const d = DE_ANTES.filter((f) => h.get(f) !== HUELLAS.get(f));
  check(d.length === 0, `con las migraciones que ya están en prod, has_creators_global_scope y handle_new_user son las de prod${d.length ? ` — distintas: ${d.join(", ")}` : ""}`);
}

// ════ 1. La migración ════════════════════════════════════════════════════════
{
  const r = await uno(con, `select (select count(*)::int from public.creadoras_por_agencia_respaldo) resp,
    (select count(*)::int from public.creators where tenant_id = '${T1}') de_asm, (select count(*)::int from public.creators) todas,
    (select attnotnull from pg_attribute where attrelid = 'public.creators'::regclass and attname = 'tenant_id') not_null,
    (select count(*)::int from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
       where d.adrelid = 'public.creators'::regclass and a.attname = 'tenant_id') con_default,
    to_regclass('public.creators_agencia_idx') is not null indice,
    (select count(*)::int from pg_constraint where conrelid = 'public.creators'::regclass and contype = 'f' and confrelid = 'public.tenants'::regclass) fk,
    (select count(*)::int from public._webhook_creadoras) webhook`);
  check(r?.resp === 40, `guarda el respaldo de 38 funciones y 2 vistas (${r?.resp})`);
  check(r?.de_asm === 4 && r?.todas === 4 && r?.not_null === true && r?.con_default === 0, `las 4 creadoras quedan en asm-tech; tenant_id NOT NULL y sin default (${json(r)})`);
  check(r?.indice === true && r?.fk === 1, "con índice y clave foránea a tenants");
  check(r?.webhook === 4, `el relleno no disparó el webhook externo de creators: siguen los 4 avisos de las altas (${r?.webhook})`);
  const hp = await huellas(prod), hc = await huellas(con);
  const fx = [...HUELLAS.keys()];
  const cambiaron = fx.filter((f) => hp.get(f) !== hc.get(f)).sort();
  const esperadas = fx.filter((f) => !["chatter_can_view_creator", "mask_email", "mask_phone", "validate_notification_fields", "push_desde_notificacion"]
    .some((n) => f.startsWith(n + "("))).sort();
  check(json(cambiaron) === json(esperadas) && cambiaron.length === 39,
    `cambiaron las 37 funciones de creadoras, has_creators_global_scope y handle_new_user (${cambiaron.length}); las 5 que no leen creadoras, iguales`);
  const leen = await q(con, `select p.oid::regprocedure::text f from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.prosrc ~* '\\m(from|join)\\s+(public\\.)?creators\\M' order by 1`);
  check(leen.length === 1 && /creadoras_de_mi_agencia/.test(leen[0].f), `ya ninguna función lee creators directo, salvo creadoras_de_mi_agencia (${leen.map((f) => f.f).join(", ")})`);
  const plan = (await q(con, `explain (costs off) select c.id from public.creadoras_de_mi_agencia() c where c.id = '${C1}'`)).map((f) => f["QUERY PLAN"]).join(" | ");
  check(!/Function Scan/.test(plan) && /creators/.test(plan), `creadoras_de_mi_agencia() se expande dentro de la consulta (no es una caja negra): ${plan.slice(0, 120)}`);
  const pol = await uno(con, `select permissive, cmd, roles::text r, qual, with_check from pg_policies where tablename = 'creators' and policyname = 'creators_de_mi_agencia'`);
  check(pol?.permissive === "RESTRICTIVE" && pol?.cmd === "ALL" && /current_tenant_id/.test(pol?.qual) && /current_tenant_id/.test(pol?.with_check),
    `la política nueva es restrictiva para todo, con USING y WITH CHECK (${pol?.permissive} ${pol?.cmd} ${pol?.r})`);
}

// ════ 2. Con una sola agencia, todos ven lo mismo que en prod ════════════════
{
  const difs: string[] = [];
  let supiProd: Fila = {}, supiCon: Fila = {};
  for (const [n, u] of PERSONAS) {
    const a = await loQueVe(prod, u), b = await loQueVe(con, u);
    if (u === SUPI) { supiProd = a; supiCon = b; continue; }
    difs.push(...diferencias(a, b, `${n}.`));
  }
  check(difs.length === 0, `6 personas × 13 lecturas (tabla, v_creators, v_promolog_eligible_creators y 10 funciones) dan igual que en prod${difs.length ? ` — ${difs.slice(0, 5).join("; ")}` : ""}`);
  const jhon = await loQueVe(con, JHON), ana = await loQueVe(con, ANA), mario = await loQueVe(con, MARIO), clara = await loQueVe(con, CLARA);
  check(jhon.tabla.length === 4 && json(ana.tabla) === json([C1]) && mario.tabla.length === 4 && json(clara.tabla) === json([C3]),
    `y no es trivial: admin y manager ven las 4, la Chatter su C1, la closer su C3 (${jhon.tabla.length}/${json(ana.tabla)}/${mario.tabla.length}/${json(clara.tabla)})`);
  check(jhon.vista[0]?.phone === "+573001110001" && /^•+0001$/.test(ana.vista[0]?.phone ?? ""),
    `v_creators sigue enmascarando el teléfono (admin ${jhon.vista[0]?.phone}, Chatter ${ana.vista[0]?.phone})`);
  check(json(jhon.ciudades) === json(["Medellín"]) && jhon.por_correo[0] === "Uno" && jhon.activas_hoy[0] === 3 && jhon.sin_promo_7d.length === 1,
    `las funciones devuelven datos de verdad (${json(jhon.ciudades)}, ${jhon.por_correo[0]}, ${jhon.activas_hoy[0]} activas)`);
  const vacio = (x: Fila) => Array.isArray(x.tabla) && x.tabla.length === 0 && Array.isArray(x.vista) && x.vista.length === 0;
  check(vacio(await loQueVe(con, EMPL)) && vacio(await loQueVe(con, SINROL)) && vacio(await loQueVe(prod, SINROL)),
    "employee (Creadores sin acceso) y sin rol: 0 creadoras, en prod y con la migración");
  // El único cambio: el alcance global implícito de supervisor_or_above sin permiso de Creadores.
  check(supiProd.tabla?.length === 4 && supiProd.vista?.length === 4, `línea base: en prod un supervisor SIN permiso de Creadores veía las 4 (${supiProd.tabla?.length})`);
  check(json(supiCon.tabla) === "[]" && json(supiCon.vista) === "[]", "con la migración, su alcance global ya no es implícito: 0");
  const fSupi = diferencias({ ...supiProd, tabla: 0, vista: 0 }, { ...supiCon, tabla: 0, vista: 0 });
  check(fSupi.length === 0, `y las funciones (que no miran el alcance) le dan lo mismo${fSupi.length ? ` — ${fSupi.slice(0, 3).join("; ")}` : ""}`);
  const g = await uno(con, `select public.has_creators_global_scope('${JHON}') jhon, public.has_creators_global_scope('${MARIO}') mario,
    public.has_creators_global_scope('${ANA}') ana, public.has_creators_global_scope('${EMPL}') empl, public.has_creators_global_scope('${SUPI}') supi,
    public.has_creators_global_scope('${SINROL}') sinrol, public.has_creators_global_scope(null) nadie`);
  check(g?.jhon && g?.mario && !g?.ana && !g?.empl && !g?.supi && !g?.sinrol && !g?.nadie, `has_creators_global_scope: admin y Creadores 'all' sí; self, sin acceso, sin permiso y sin rol no (${json(g)})`);
}

// ════ 3. Dos agencias ═════════════════════════════════════════════════════════
const OTRA = `
insert into public.tenants(id, slug, name) values ('${T2}', 'otra', 'Otra agencia');
select public.sembrar_roles_de_agencia('${T2}', 'agency', '${T1}');
insert into auth.users(id, email, raw_user_meta_data) values ('${OLGA}', 'olga@otra.test', '{"full_name":"Olga"}'),
  ('${PEPE}', 'pepe@otra.test', '{"full_name":"Pepe"}'), ('${SINAG}', 'sinag@x.test', '{"full_name":"Sin agencia"}');
insert into public.tenant_members(user_id, tenant_id) values ('${OLGA}', '${T2}'), ('${PEPE}', '${T2}');
update public.user_roles set role = 'admin' where user_id in ('${OLGA}', '${SINAG}');
update public.user_roles set role = 'Chatter' where user_id = '${PEPE}';
`;
const DATOS_T2 = `
insert into public.promolog_entries (creator_id, date, promoted, network, tenant_id, story_count) values ('${D1}', ${HOY}, 'true', 'x', '${T2}', 1);
insert into public.closers_contacts (id, name, handle, platform, created_by) values ('${K3}', 'Contacto Otra', 'otra1', 'instagram', '${OLGA}');
`;
// La otra agencia la crea el panel de plataforma DESPUÉS de las migraciones (todas
// exigen una sola agencia al aplicarse); Olga carga su creadora desde la app.
for (const db of [prod, con]) {
  await db.exec(OTRA);
  await como(db, OLGA, `insert into public.creators (id, name, status, instagram_handle, email, phone, city, created_by)
    values ('${D1}', 'De la otra', 'active', 'otra1', 'otra@x.test', '+573009990011', 'Bogotá', '${OLGA}')`);
  await db.exec(DATOS_T2);
}

// 3.1 Lo que ve cada uno
{
  const po = await loQueVe(prod, OLGA), co = await loQueVe(con, OLGA);
  const pj = await loQueVe(prod, JHON), cj = await loQueVe(con, JHON);
  check(po.tabla.length === 5 && po.vista.length === 5 && po.promolog_elegibles.length === 4,
    `línea base: en prod Olga (admin de la otra) ve las 5 creadoras en la tabla y en v_creators, y las 4 activas de Promolog (${po.tabla.length}/${po.vista.length}/${po.promolog_elegibles.length})`);
  check(json(co.tabla) === json([D1]) && json(co.vista.map((f: Fila) => f.id)) === json([D1]) && json(co.promolog_elegibles) === json([D1]),
    `con la migración, Olga ve solo la suya en la tabla, en v_creators y en v_promolog_eligible_creators (${json(co.tabla)})`);
  check(pj.tabla.length === 5 && cj.tabla.length === 4 && !cj.tabla.includes(D1) && !cj.vista.some((f: Fila) => f.id === D1),
    `y Jhon (admin de asm-tech) ya no ve la de la otra (${pj.tabla.length} → ${cj.tabla.length})`);
  check(po.por_correo[0] === "Uno" && po.por_telefono[0] === "Dos" && json(po.ciudades) === json(["Bogotá", "Medellín"]),
    `línea base: en prod las funciones le dan a Olga datos de asm-tech (correo → ${po.por_correo[0]}, teléfono → ${po.por_telefono[0]}, ciudades ${json(po.ciudades)})`);
  check(co.por_correo[0] === null && co.por_telefono[0] === null && json(co.ciudades) === json(["Bogotá"]) && json(co.contactos_medellin) === "[]",
    `con la migración, nada: correo y teléfono no encuentran, las ciudades son las suyas (${json(co.ciudades)})`);
  check(po.faltantes_hoy.length === 3 && json(co.faltantes_hoy) === json([{ creadora: "otra1", estado: "sin_leer" }]),
    `get_promo_day_faltantes: en prod le listaba a Olga las de asm-tech (${json(po.faltantes_hoy)}); ahora solo la suya (${json(co.faltantes_hoy)})`);
  check(po.activas_hoy[0] === 4 && co.activas_hoy[0] === 1 && cj.activas_hoy[0] === 3, `los conteos del embudo son de cada agencia (${po.activas_hoy[0]} → ${co.activas_hoy[0]}; Jhon ${cj.activas_hoy[0]})`);
  check(json(po.sin_promo_7d) === json([C4, D1]) && json(co.sin_promo_7d) === json([D1]) && json(cj.sin_promo_7d) === json([C4]),
    `get_promolog_stale_creators: cada uno la suya (prod ${po.sin_promo_7d.length} → Olga ${co.sin_promo_7d.length}, Jhon ${cj.sin_promo_7d.length})`);
  check(po.historial.length === 2 && json(co.historial) === json([{ creator_id: BORRADA, name: "Uno de antes", source: "history" }]),
    `find_creator_history_by_handle ya no le muestra a Olga la creadora viva de asm-tech (queda la fila de historial: tabla hija, siguiente paso)`);
  const pp = await loQueVe(prod, PEPE), cp = await loQueVe(con, PEPE);
  check(pp.tabla.length === 0 && cp.tabla.length === 0 && cp.por_correo[0] === null && pp.por_correo[0] === "Uno",
    `la Chatter de la otra: 0 en la tabla en los dos, pero en prod las funciones le daban datos de asm-tech (${pp.por_correo[0]} → ${cp.por_correo[0]})`);
  const s = await como(con, "service_role", `select public.find_creator_name_by_email('otra@x.test') a, public.find_creator_name_by_email('uno@x.test') b,
    (select count(*)::int from public.v_promolog_eligible_creators) elegibles, (select count(*)::int from public.get_promolog_stale_creators(7)) sin_promo`);
  check(s[0]?.a === "De la otra" && s[0]?.b === "Uno" && s[0]?.elegibles === 4 && s[0]?.sin_promo === 2,
    `service_role (las edges de Promolog, los crons) sigue viendo todas (${json(s[0])})`);
  const sp = await loQueVe(prod, SINAG), sc = await loQueVe(con, SINAG);
  check(sc.tabla.length === 0 && sc.por_correo[0] === null && json(sc.ciudades) === "[]" && sp.por_correo[0] === "Uno",
    `una cuenta sin agencia: 0 en todo (en prod las funciones le daban datos: ${sp.por_correo[0]})`);
  const directa = await probar(con, ANA, `select count(*) from public.creadoras_de_mi_agencia()`);
  check(typeof directa === "string" && /permission denied/.test(directa), "creadoras_de_mi_agencia() no se llama por la API");
}

// 3.2 Escribir en la tabla
{
  const pu = await probar(prod, OLGA, `update public.creators set name = 'tocada' where id = '${C1}' returning id`);
  const cu = await probar(con, OLGA, `update public.creators set name = 'tocada' where id = '${C1}' returning id`);
  check(Array.isArray(pu) && pu.length === 1 && Array.isArray(cu) && cu.length === 0, `línea base: en prod Olga editaba una creadora de asm-tech; ahora 0 filas (${json(pu)} → ${json(cu)})`);
  const pd = await probar(prod, OLGA, `delete from public.creators where id = '${C4}' returning id`);
  const cd = await probar(con, OLGA, `delete from public.creators where id = '${C4}' returning id`);
  check(Array.isArray(pd) && pd.length === 1 && Array.isArray(cd) && cd.length === 0, "y la borraba; ahora 0 filas");
  const ci = await probar(con, OLGA, `insert into public.creators (name, tenant_id) values ('Infiltrada', '${T1}')`);
  check(typeof ci === "string" && /de tu agencia/.test(ci), `no crea una creadora en asm-tech mandando el tenant_id (${String(ci).slice(0, 70)})`);
  const cn = await probar(con, JHON, `insert into public.creators (name) values ('Nueva'); reset role; select tenant_id from public.creators where name = 'Nueva'`);
  check(Array.isArray(cn) && cn[0]?.tenant_id === T1, "una creadora nueva sin decir la agencia queda en la de quien la crea");
  const ps = await probar(prod, SINAG, `insert into public.creators (name) values ('Del registro público'); reset role; select id from public.creators where name = 'Del registro público'`);
  const cs = await probar(con, SINAG, `insert into public.creators (name) values ('Del registro público')`);
  check(Array.isArray(ps) && ps.length === 1 && typeof cs === "string" && /sin agencia/.test(cs),
    `línea base: en prod una cuenta sin agencia con 'admin' creaba creadoras; ahora no (${String(cs).slice(0, 60)})`);
  const cm = await probar(con, "service_role", `update public.creators set tenant_id = '${T2}' where id = '${C1}'`);
  check(typeof cm === "string" && /no se cambia/.test(cm), "la agencia de una creadora no se cambia, ni con service_role");
  const sv = await probar(con, "service_role", `insert into public.creators (name) values ('Sin agencia')`);
  const sc = await probar(con, "service_role", `insert into public.creators (name, created_by) values ('Por la de quien la creó', '${OLGA}') returning tenant_id`);
  check(typeof sv === "string" && /falta la agencia/.test(sv) && Array.isArray(sc) && sc[0]?.tenant_id === T2,
    "service_role tiene que decir la agencia, o se toma la de created_by");
}

// 3.3 Las funciones que escriben
{
  const pr = await probar(prod, OLGA, `select id from public.reactivate_creator('${C2}', null)`);
  const cr = await probar(con, OLGA, `select id from public.reactivate_creator('${C2}', null)`);
  const cj = await probar(con, JHON, `select id from public.reactivate_creator('${C2}', null)`);
  check(Array.isArray(pr) && pr.length === 1 && Array.isArray(cr) && cr.length === 0 && Array.isArray(cj) && cj.length === 1,
    `reactivate_creator: en prod Olga reactivaba una de asm-tech; ahora 0, y Jhon sí la suya (${json(pr)} → ${json(cr)})`);
  const pw = await probar(prod, OLGA, `select public.set_creator_whatsapp('${C1}', '+57 300 000 0000'); reset role; select whatsapp_number from public.creators where id = '${C1}'`);
  const cw = await probar(con, OLGA, `select public.set_creator_whatsapp('${C1}', '+57 300 000 0000'); reset role; select count(*)::int n from public.creators where id = '${C1}' and whatsapp_number is not null`);
  const jw = await probar(con, JHON, `select public.set_creator_whatsapp('${C1}', '+57 300 000 0000'); reset role; select count(*)::int n from public.creators where id = '${C1}' and whatsapp_number is not null`);
  check(Array.isArray(pw) && pw[0]?.whatsapp_number && Array.isArray(cw) && cw[0]?.n === 0 && Array.isArray(jw) && jw[0]?.n === 1,
    "set_creator_whatsapp: lo mismo (Olga ya no le cambia el WhatsApp a una de asm-tech; Jhon sí)");
  const pdeal = await probar(prod, OLGA, `select public.create_platform_deal_for_creator('${C1}', 'onlyfans', 10, null) v`);
  const cdeal = await probar(con, OLGA, `select public.create_platform_deal_for_creator('${C1}', 'onlyfans', 10, null) v`);
  const jdeal = await probar(con, MARIO, `select public.create_platform_deal_for_creator('${C1}', 'onlyfans', 10, null) v`);
  check(Array.isArray(pdeal) && typeof cdeal === "string" && /Creadora no encontrada/.test(cdeal) && Array.isArray(jdeal) && jdeal[0]?.v,
    `create_platform_deal_for_creator (lee la creadora en un %rowtype): Olga ya no arma un trato con una de asm-tech; Mario sí (${String(cdeal).slice(0, 40)})`);
  const pconv = await probar(prod, OLGA, `select public.convert_contact_to_creator('${K1}') v`);
  const cconv = await probar(con, OLGA, `select public.convert_contact_to_creator('${K1}') v; reset role; select tenant_id from public.creators where instagram_handle = '@uno'`);
  const jconv = await probar(con, JHON, `select public.convert_contact_to_creator('${K1}') v`);
  check(typeof pconv === "string" && /creator_already_exists/.test(pconv) && Array.isArray(cconv) && cconv[0]?.tenant_id === T2
    && typeof jconv === "string" && /creator_already_exists/.test(jconv),
    "convert_contact_to_creator: el «ya existe» mira la propia agencia (a Olga ya no le revela una de asm-tech) y la nueva queda en la suya");
}

// ════ 4. Las vistas ya no se escriben ═════════════════════════════════════════
{
  const pd = await probar(prod, ANA, `delete from public.v_creators where id = '${C1}' returning id`);
  const cd = await probar(con, ANA, `delete from public.v_creators where id = '${C1}' returning id`);
  check(Array.isArray(pd) && pd.length === 1, "línea base: en prod la Chatter BORRABA su creadora por v_creators (la tabla solo deja a admin)");
  check(typeof cd === "string" && /permission denied/.test(cd), `ahora no (${String(cd).slice(0, 50)})`);
  const pu = await probar(prod, ANA, `update public.v_promolog_eligible_creators set name = 'tocada' where id = '${C3}' returning id`);
  const cu = await probar(con, ANA, `update public.v_promolog_eligible_creators set name = 'tocada' where id = '${C3}' returning id`);
  check(Array.isArray(pu) && pu.length === 1 && typeof cu === "string" && /permission denied/.test(cu),
    "línea base: editaba por v_promolog_eligible_creators una creadora que ni ve; ahora no");
  for (const v of ["v_creators", "v_promolog_eligible_creators", "v_creator_prospects"]) {
    const pi = await probar(prod, "anon", `insert into public.${v} (name) values ('desde anon')`);
    const ci = await probar(con, "anon", `insert into public.${v} (name) values ('desde anon')`);
    check(Array.isArray(pi) && typeof ci === "string" && /permission denied/.test(ci), `línea base: anon INSERTABA en ${v}; ahora no`);
  }
  const lee = await probar(con, ANA, `select count(*)::int n from public.v_creators`);
  check(Array.isArray(lee) && lee[0]?.n === 1, "y se siguen leyendo");
}

// ════ 5. Cuentas externas ═════════════════════════════════════════════════════
// Como lo hace GoTrue: INSERT con app_metadata de proveedor y, en la MISMA
// transacción, el UPDATE con el app_metadata que mandó el servidor.
const alta = (id: string, correo: string, appMeta: string, enElInsert = "") => `
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
values ('${id}', '${correo}', '{"full_name":"Persona ${id.slice(-2)}"}', '{"provider":"email","providers":["email"]${enElInsert}}');
update auth.users set raw_app_meta_data = raw_app_meta_data || '${appMeta}'::jsonb where id = '${id}';`;
{
  for (const db of [prod, con]) {
    await aplicar(db, "alta de empleado", alta(EMPLEADO_NUEVO, "nuevo@x.test", '{"alta":"admin"}'));
    // admin-user-actions: la agencia de quien crea y el rol elegido.
    await db.exec(`insert into public.tenant_members (user_id, tenant_id) values ('${EMPLEADO_NUEVO}', '${T1}') on conflict do nothing;
      update public.user_roles set role = 'Chatter' where user_id = '${EMPLEADO_NUEVO}';`);
  }
  const fila = `select (select json_agg(json_build_object('role', role, 'tenant', tenant_id) order by role) from public.user_roles where user_id = '${EMPLEADO_NUEVO}') roles,
    (select count(*)::int from public.profiles where id = '${EMPLEADO_NUEVO}') perfil`;
  const p = await uno(prod, fila), c = await uno(con, fila);
  check(json(p) === json(c) && json(c?.roles) === json([{ role: "Chatter", tenant: T1 }]) && c?.perfil === 1,
    `el alta normal (create_user) da lo mismo que en prod: perfil, y el rol elegido en su agencia (${json(c?.roles)})`);
  const pe = await como(prod, EMPLEADO_NUEVO, `select count(*)::int n from public.creators`), ce = await como(con, EMPLEADO_NUEVO, `select count(*)::int n from public.creators`);
  check(pe[0]?.n === ce[0]?.n, `y ve lo mismo que en prod (${pe[0]?.n})`);

  for (const db of [prod, con]) await aplicar(db, "alta de creadora", alta(CREADORA, "creadora@gmail.test", '{"alta":"admin","tipo":"creadora"}'));
  const r = `select (select count(*)::int from public.user_roles where user_id = '${CREADORA}') roles,
    (select count(*)::int from public.profiles where id = '${CREADORA}') perfil`;
  const pc = await uno(prod, r), cc = await uno(con, r);
  check(pc?.roles === 1, "línea base: en prod la cuenta de creadora recibía el rol 'employee'");
  check(cc?.roles === 0 && cc?.perfil === 1, `con la migración, ningún rol (y su perfil sí) (${json(cc)})`);
  const pr = await probar(prod, "postgres", `update public.user_roles set role = 'admin' where user_id = '${CREADORA}' returning role`);
  const cr = await probar(con, "postgres", `insert into public.user_roles (user_id, role) values ('${CREADORA}', 'employee')`);
  check(Array.isArray(pr) && pr.length === 1 && typeof cr === "string" && /externa/.test(cr), `y no se le puede poner un rol después (${String(cr).slice(0, 70)})`);
  const cv = await como(con, CREADORA, `select count(*)::int n from public.creators`);
  check(cv[0]?.n === 0, "una cuenta de creadora (sin agencia ni rol) no ve ninguna creadora");

  await aplicar(con, "alta de creadora con la marca en el INSERT", alta(CREADORA2, "otra.creadora@gmail.test", '{}', ',"tipo":"creadora"'));
  check((await uno(con, `select count(*)::int n from public.user_roles where user_id = '${CREADORA2}'`))?.n === 0, "si la marca ya viene en el INSERT, handle_new_user no le da el rol");
  await aplicar(con, "alta de creadora en dos pasos", alta(CREADORA3, "tercera@gmail.test", '{"alta":"admin"}'));
  check((await uno(con, `select count(*)::int n from public.user_roles where user_id = '${CREADORA3}'`))?.n === 1, "una cuenta creada sin la marca recibe 'employee' como siempre…");
  await con.exec(`update auth.users set raw_app_meta_data = raw_app_meta_data || '{"tipo":"creadora"}' where id = '${CREADORA3}'`);
  check((await uno(con, `select count(*)::int n from public.user_roles where user_id = '${CREADORA3}'`))?.n === 0, "…y si después el servidor la marca como creadora, se le saca");
  await con.exec(`update auth.users set raw_app_meta_data = raw_app_meta_data || '{"provider":"email","ultimo":"x"}' where id = '${EMPLEADO_NUEVO}'`);
  check((await uno(con, `select count(*)::int n from public.user_roles where user_id = '${EMPLEADO_NUEVO}'`))?.n === 1, "otros cambios de app_metadata de un empleado no le tocan el rol");
}

// ════ 6. Avisos ═══════════════════════════════════════════════════════════════
{
  const aviso = (para: string | null, extra = "") =>
    `insert into public.notifications (user_id, type, title, message${extra ? ", " + extra.split("=")[0] : ""}) values (${para ? `'${para}'` : "null"}, 'prueba', 'Hola', 'texto'${extra ? ", " + extra.split("=").slice(1).join("=") : ""})`;
  const legitimos: [string, Quien, string][] = [
    ["evaluador de chatters (a la lista de su agencia)", JHON, `insert into public.notifications (user_id, type, title, message, reference_type, module_origin, priority, deep_link_url, required_permission_module, required_permission_submodule)
       values ('${ANA}', 'chatter_evaluation', 'Evaluación', 'x', 'chatter_evaluation', 'chatter-evaluator', 'high', '/chatter-evaluator/workspace?session=074C54IP', 'Chatters', 'Evaluator')`],
    ["onboarding paso 4 (a los admins, sin enlace)", ANA, `insert into public.notifications (user_id, type, title, message, reference_id, reference_type) values ('${JHON}', 'onboarding_step4_complete', 'Paso 4', 'x', '${C1}', 'creator')`],
    ["inactividad de onboarding (a su manager)", ANA, `insert into public.notifications (user_id, type, title, message, reference_id, reference_type, module_origin, priority, deep_link_url, required_permission_module)
       values ('${MARIO}', 'onboarding_inactivity', 'Inactiva', 'x', '${C1}', 'creator', 'creadores', 'high', '/creadores/${C1}', 'Creadores')`],
    ["anuncio de RRHH (a varios a la vez)", MARIO, `insert into public.notifications (user_id, title, message, type, module_origin, priority, visibility_scope, deep_link_url)
       values ('${ANA}', '📢 Anuncio', 'x', 'announcement', 'Comunicación', 'medium', 'personal', '/hr/anuncios'), ('${JHON}', '📢 Anuncio', 'x', 'announcement', 'Comunicación', 'medium', 'personal', '/hr/anuncios'), ('${MARIO}', '📢 Anuncio', 'x', 'announcement', 'Comunicación', 'medium', 'personal', '/hr/anuncios')`],
    ["a uno mismo", ANA, aviso(ANA, "deep_link_url='/notificaciones'")],
    ["una edge con service_role (mail-fetch), con enlace absoluto y a otra agencia", "service_role", aviso(OLGA, "deep_link_url='https://app.maven-ai.me/correo'")],
  ];
  // Sin RETURNING, como la app (con RETURNING la fila tendría que pasar también la
  // política de SELECT, que solo muestra los avisos propios). Se cuentan después, como postgres.
  const contar = `; reset role; select (select count(*)::int from public.notifications) n, (select count(*)::int from public._avisos_push) push`;
  const antes = await uno(con, `select (select count(*)::int from public.notifications) n`);
  for (const [n, quien, sql] of legitimos) {
    const p = await probar(prod, quien, sql + contar), c = await probar(con, quien, sql + contar);
    const nuevos = Array.isArray(c) ? c[0]?.n - antes?.n : -1;
    check(Array.isArray(p) && Array.isArray(c) && json(p) === json(c) && nuevos > 0, `aviso legítimo: ${n} (${Array.isArray(c) ? `${nuevos} aviso(s)` : String(c).slice(0, 80)})`);
  }
  // Una función SECURITY DEFINER (como notify_chat_message) no pasa por la RLS.
  for (const db of [prod, con]) {
    await db.exec(`create function public._avisa_de_la_base(_para uuid) returns void language sql security definer set search_path to 'public' as
      $f$ insert into public.notifications (user_id, type, title, deep_link_url, automation_key) values (_para, 'closer_assigned', 'Te asignaron', '/closers?id=1', 'closer_assign:' || _para) $f$;`);
  }
  const sd = await probar(con, ANA, `select public._avisa_de_la_base('${OLGA}'); select count(*)::int n from public._avisos_push where destinatarios = array['${OLGA}'::uuid]`);
  check(Array.isArray(sd) && sd[0]?.n === 1, "los avisos de la base (función SECURITY DEFINER) siguen saliendo, con push");

  const malos: [string, Quien, string][] = [
    ["a alguien de OTRA agencia", ANA, aviso(OLGA)],
    ["con un enlace https://", ANA, aviso(MARIO, "deep_link_url='https://evil.test/login'")],
    ["con un enlace //sitio", ANA, aviso(MARIO, "deep_link_url='//evil.test'")],
    ["con un enlace /\\sitio", ANA, aviso(MARIO, "deep_link_url='/\\evil.test'")],
    ["con un enlace «/<tab>/sitio»", ANA, aviso(MARIO, "deep_link_url=E'/\\t/evil.test'")],
    ["con javascript:", ANA, aviso(MARIO, "deep_link_url='javascript:alert(1)'")],
    ["«por rol» a todos los admins (user_id NULL + role_target)", ANA, aviso(null, "role_target='admin'")],
    ["sin destinatario", ANA, aviso(null)],
    ["ocupando el automation_key de un aviso automático", ANA, aviso(MARIO, "automation_key='closer_assign:x'")],
    ["desde una cuenta sin agencia", SINAG, aviso(ANA)],
  ];
  for (const [n, quien, sql] of malos) {
    const p = await probar(prod, quien, sql + contar), c = await probar(con, quien, sql);
    check(Array.isArray(p) && p[0]?.n === antes?.n + 1, `línea base: en prod se podía crear un aviso ${n}`);
    check(typeof c === "string" && /row-level security/.test(c), `ahora no: ${n} (${String(c).slice(0, 60)})`);
  }
  const push = await probar(prod, ANA, aviso(OLGA, "deep_link_url='https://evil.test'") + `; select url from public._avisos_push where destinatarios = array['${OLGA}'::uuid] order by id desc limit 1`);
  check(Array.isArray(push) && push[0]?.url === "https://evil.test", "(en prod ese aviso salía como push al teléfono de la otra agencia, con el enlace de afuera)");
}

// ════ 7. La vuelta atrás ══════════════════════════════════════════════════════
{
  const db = await nueva("con");
  await aplicar(db, "vuelta atrás de " + N2, vuelta(M2));
  await aplicar(db, "vuelta atrás de " + N1, vuelta(M1));
  check(true, "las dos vueltas atrás corren sobre la base con las migraciones");
  const limpia = await nueva("prod");
  const h = await huellas(db), hl = await huellas(limpia);
  const distintas = [...HUELLAS.keys()].filter((f) => h.get(f) !== hl.get(f));
  check(distintas.length === 0, `las 44 funciones vuelven byte a byte a prod${distintas.length ? ` — distintas: ${distintas.join(", ")}` : ""}`);
  const v = await vistas(db);
  check([...VISTAS].every(([n, x]) => v.get(n) === x), "las 3 vistas vuelven a su definición de prod");
  const est = `select (select json_agg(json_build_object('t', tablename, 'p', policyname, 'q', qual, 'c', with_check) order by tablename, policyname) from pg_policies where tablename in ('creators', 'notifications')) pol,
    (select json_agg(relname || ' ' || (select string_agg(a::text, ',' order by a::text) from unnest(relacl) a) order by relname) from pg_class where relnamespace = 'public'::regnamespace and relname in ('creators', 'v_creators', 'v_promolog_eligible_creators', 'v_creator_prospects')) acl,
    (select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'creators' and column_name = 'tenant_id') col,
    (select json_agg(tgname order by tgname) from pg_trigger where tgrelid in ('public.creators'::regclass, 'auth.users'::regclass, 'public.user_roles'::regclass) and not tgisinternal) trg,
    to_regclass('public.creadoras_por_agencia_respaldo') is null and to_regclass('public.cuentas_externas_respaldo') is null sin_respaldo`;
  const a = await uno(db, est), b = await uno(limpia, est);
  const d = diferencias(a, b);
  check(d.length === 0, `políticas, permisos, columnas y triggers como en prod${d.length ? ` — ${d.join("; ").slice(0, 300)}` : ""}`);
  const x = await loQueVe(db, JHON), y = await loQueVe(limpia, JHON);
  check(diferencias(x, y).length === 0, "y Jhon ve lo mismo que en prod");
  await aplicar(db, N1 + " (otra vez)", M1);
  await aplicar(db, N2 + " (otra vez)", M2);
  check((await uno(db, `select count(*)::int n from public.creadoras_por_agencia_respaldo`))?.n === 40, "después de la vuelta atrás, las migraciones se pueden volver a aplicar");
}

// ════ 8. Las negativas ═════════════════════════════════════════════════════════
{
  const dos = await nueva("prod", `insert into public.tenants(id, slug, name) values ('${T2}', 'otra', 'Otra');`);
  const r1 = await intento(() => aplicar(dos, N1, M1));
  check(/hay 2 agencias/.test(r1), `con dos agencias al aplicar, se niega (${r1.slice(-70)})`);
  check((await uno(dos, `select to_regclass('public.creadoras_por_agencia_respaldo') is null a, (select count(*)::int from information_schema.columns where table_name = 'creators' and column_name = 'tenant_id') c`))?.a === true,
    "y no deja nada a medias");

  const forma = await nueva("prod", `create or replace function public.find_creator_name_by_phone(p_phone text) returns text language sql stable security definer set search_path to 'public' as
    $function$ select name from public.creators where phone = p_phone or whatsapp_number = p_phone limit 1; $function$;`);
  const r2 = await intento(() => aplicar(forma, N1, M1));
  check(/find_creator_name_by_phone\(text\) no es la que se revisó/.test(r2), `si una función de prod no es la revisada, se niega (${r2.slice(-90)})`);
  check((await uno(forma, `select (select count(*)::int from information_schema.columns where table_name = 'creators' and column_name = 'tenant_id') c`))?.c === 0, "sin tocar la tabla");

  const nuevaFn = await nueva("prod", `create function public.lee_creadoras_sin_revisar() returns bigint language sql stable security definer set search_path to 'public' as
    $f$ select count(*) from public.creators $f$;`);
  const r3 = await intento(() => aplicar(nuevaFn, N1, M1));
  check(/no están revisadas: lee_creadoras_sin_revisar\(\)/.test(r3), `si hay una función SECURITY DEFINER nueva que lee creators, se niega (${r3.slice(-80)})`);
  const soloServicio = await nueva("prod", `create function public.solo_servicio() returns bigint language sql stable security definer set search_path to 'public' as
    $f$ select count(*) from public.creators $f$; revoke all on function public.solo_servicio() from public, anon, authenticated;`);
  check(/anduvo/.test(await intento(() => aplicar(soloServicio, N1, M1))), "una que solo puede llamar service_role no frena la migración (queda en la lista de siguiente paso)");

  const vista = await nueva("prod", `create or replace view public.v_promolog_eligible_creators as select id, name, artistic_name, instagram_handle, onlyfans_url, instagram_followers,
    assigned_manager_profile_id, assigned_specialist_profile_id from public.creators c where status = 'active';`);
  const r4 = await intento(() => aplicar(vista, N1, M1));
  check(/la vista public\.v_promolog_eligible_creators no es la que se revisó/.test(r4), `si una vista cambió, se niega (${r4.slice(-80)})`);

  const alta2 = await nueva("prod", `create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path to 'public' as
    $function$ begin insert into public.profiles (id, full_name) values (new.id, null) on conflict (id) do nothing; return new; end; $function$;`);
  const r5 = await intento(() => aplicar(alta2, N2, M2));
  check(/handle_new_user no es la que se revisó/.test(r5), `si handle_new_user cambió, la de cuentas externas se niega (${r5.slice(-70)})`);
}

for (const m of ok) console.log(`✓ ${m}`);
for (const m of mal) console.log(`✗ ${m}`);
console.log(`\n${ok.length} ok${mal.length ? `, ${mal.length} MAL` : ""}`);
if (mal.length) Deno.exit(1);
