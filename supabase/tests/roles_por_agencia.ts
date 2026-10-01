// Los roles por agencia (migración 20261001190000_roles_por_agencia.sql), probados
// contra un Postgres de verdad (PGlite) cargado con el catálogo de PROD del 01/10
// (fixtures/prod_roles_20261001.sql): las 56 funciones de roles copiadas textual,
// con sus huellas.
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/roles_por_agencia.ts
//
// Cómo está armado:
//   0. El fixture trae sus huellas md5(prosrc); aquí se recalculan y, si alguna no
//      coincide, el banco falla (el fixture no se toca a mano).
//   1. La migración corre sobre prod + 20261001150000_agencias_base, y deja cada
//      función reescrita (respaldo incluido).
//   2. EQUIVALENCIA: con una sola agencia, cada función de permisos da lo mismo
//      que en prod, persona por persona (una matriz de ~40 preguntas × 8 personas,
//      más las que dependen de quién llama).
//   3. DOS agencias: cada cosa que la migración cierra se prueba primero abierta en
//      prod (la línea base: si no está abierta, el test no prueba nada) y después
//      cerrada.
//   4. La vuelta atrás (las líneas «--|») deja las 45 funciones byte a byte como en
//      prod, y la migración se puede volver a aplicar.
//   5. Las negativas: con dos agencias al aplicar, con una función de prod que no
//      tiene la forma esperada, o con una función nueva sin revisar, no corre.
//
// Sale con código 1 si algo falla. Corre en el guard de cada PR.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FIXTURE = leer("./fixtures/prod_roles_20261001.sql");
const BASE = leer("../migrations/20261001150000_agencias_base.sql");
const NOMBRE = "20261001190000_roles_por_agencia.sql";
const MIG = leer(`../migrations/${NOMBRE}`);
const VUELTA = MIG.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");
const HUELLAS = new Map([...FIXTURE.matchAll(/^--   (\w+\([^)]*\))=([0-9a-f]{32})$/gm)].map((m) => [m[1], m[2]]));

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);

// ─── Gente, agencias y roles del ensayo ──────────────────────────────────────
const T1 = "10000000-0000-4000-8000-000000000001"; // asm-tech
const T2 = "10000000-0000-4000-8000-000000000002"; // otra agencia
const P = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [JHON, ANA, BETO, CARL, DORA, ELSA, FRED] = [1, 2, 3, 4, 5, 6, 7].map(P); // asm-tech
const [OLGA, PEPE, QUINO, SAM] = [11, 12, 13, 14].map(P); // la otra agencia
const SINAG = P(20); // cuenta sin agencia (registro público) con un rol puesto
const T1_USUARIOS: [string, string][] = [["jhon", JHON], ["ana", ANA], ["beto", BETO], ["carl", CARL], ["dora", DORA], ["elsa", ELSA], ["fred", FRED]];

// Los roles de asm-tech, como los arma la app (insert en roles_config → el trigger
// crea role_groups como «empleado» → se le pone el tipo).
const PERMISOS = `
insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
select rc.id, p.module, p.submodule, p.can_access, p.scope from public.roles_config rc join (values
  ('Chatter', 'Chatters', 'Rendimiento', true, 'self'),
  ('Chatter', 'Cowork', null, true, 'self'),
  ('Chatter', 'Contactos', 'Ver Teléfonos', false, 'all'),
  ('Chatter Supervisor', 'Chatters', null, true, 'all'),
  ('Chatter Supervisor', 'Cowork', null, true, 'subordinates'),
  ('Chatter Supervisor', 'Administración', 'Usuarios', true, 'all'),
  ('Chatter Supervisor', 'Agency QA', 'Chatters QA', true, 'all'),
  ('Chatter Supervisor', 'Contactos', 'Ver Teléfonos', true, 'all'),
  ('Chatter Supervisor', 'Telegram', null, true, 'self'),
  ('closer', 'Closers', null, true, 'self'),
  ('Closer +', 'Closers', null, true, 'all'),
  ('Closer +', 'Creadores', null, true, 'all'),
  ('supervisor', 'Cowork', null, true, 'all'),
  ('supervisor', 'Grabaciones', null, true, 'subordinates'),
  ('employee', 'Cowork', null, true, 'self')
) as p(rol, module, submodule, can_access, scope) on p.rol = rc.name;`;
const SEMILLA = `
insert into public.tenants(id, slug, name) values ('${T1}', 'asm-tech', 'ASM Tech');
insert into public.roles_config (name, is_system, level) values
  ('admin', true, 100), ('supervisor', true, 50), ('employee', true, 20), ('closer', true, 20),
  ('Chatter', false, 20), ('Chatter Supervisor', false, 55), ('Closer +', false, 50);
update public.role_groups set is_admin = true, is_manager_or_above = true, is_supervisor_or_above = true where role_name = 'admin';
update public.role_groups set is_supervisor_or_above = true where role_name in ('supervisor', 'Chatter Supervisor', 'Closer +');
update public.roles_config set level = 55 where name = 'Chatter Supervisor';
insert into public.role_base_grants (role_name, base_role) values ('Closer +', 'closer');
${PERMISOS}
-- El alta real: handle_new_user crea perfil, rol employee y la membresía de asm-tech.
insert into auth.users(id, email, raw_user_meta_data) values
  ('${JHON}', 'jhon.lopez@maven-ai.me', '{"full_name":"Jhon"}'), ('${ANA}', 'ana@x.test', '{"full_name":"Ana"}'),
  ('${BETO}', 'beto@x.test', '{"full_name":"Beto"}'), ('${CARL}', 'carl@x.test', '{"full_name":"Carl"}'),
  ('${DORA}', 'dora@x.test', '{"full_name":"Dora"}'), ('${ELSA}', 'elsa@x.test', '{"full_name":"Elsa"}'),
  ('${FRED}', 'fred@x.test', '{"full_name":"Fred"}');
update public.user_roles set role = 'admin' where user_id = '${JHON}';
update public.user_roles set role = 'Chatter' where user_id = '${ANA}';
update public.user_roles set role = 'Chatter Supervisor' where user_id = '${BETO}';
update public.user_roles set role = 'Closer +' where user_id = '${DORA}';
update public.user_roles set role = 'supervisor' where user_id = '${ELSA}';
delete from public.user_roles where user_id = '${FRED}';
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}
type Modo = "prod" | "con";
async function nueva(modo: Modo, antes = ""): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(SEMILLA + antes);
  await aplicar(db, "20261001150000_agencias_base.sql", BASE);
  if (modo === "con") await aplicar(db, NOMBRE, MIG);
  return db;
}
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as Fila[];
const uno = async (db: PGlite, sql: string) => (await q(db, sql))[0];

// Un pedido como lo manda PostgREST: una transacción, el rol y los claims del JWT.
type Quien = string | "service_role" | "anon" | "postgres";
async function como(db: PGlite, quien: Quien, sql: string): Promise<Fila[]> {
  await db.exec("begin");
  try {
    await db.exec("reset role");
    if (quien !== "postgres") {
      const servicio = quien === "service_role" || quien === "anon";
      const claims = servicio ? { role: quien } : { sub: quien, role: "authenticated" };
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await db.exec(`set local role ${servicio ? quien : "authenticated"}`);
    }
    const rs = await db.exec(sql);
    await db.exec("commit");
    return (rs.at(-1)?.rows ?? []) as Fila[];
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
async function anda(db: PGlite, quien: Quien, sql: string, m: string): Promise<Fila[] | null> {
  try { const r = await como(db, quien, sql); ok.push(m); return r; }
  catch (e) { mal.push(`${m} (falló: ${msg(e).slice(0, 160)})`); return null; }
}
async function falla(db: PGlite, quien: Quien, sql: string, patron: RegExp, m: string) {
  try { await como(db, quien, sql); mal.push(`${m} (NO falló)`); }
  catch (e) { const t = msg(e); check(patron.test(t), `${m} → ${t.slice(0, 110)}`); }
}
const intento = async (f: () => Promise<unknown>) => { try { await f(); return "anduvo"; } catch (e) { return msg(e); } };

// Todas las preguntas de permisos de una persona, en un objeto.
const SCOPES = ["has_chatter_evaluator_access", "has_chatter_global_scope", "has_closer_global_scope", "has_company_qa_global_scope",
  "has_contactos_global_scope", "has_cowork_global_scope", "has_cowork_team_scope", "has_creators_global_scope", "has_finanzas_access",
  "has_grabaciones_global_scope", "has_grabaciones_team_scope", "has_hr_access", "has_leadgen_global_scope", "has_promolog_global_scope",
  "has_qa_global_scope", "has_scouter_global_scope", "has_scouter_team_scope", "has_telefonos_global_scope", "has_tg_inbox_global_scope",
  "has_wa_inbox_global_scope", "blu_is_management", "can_access_chatters_qa", "can_use_blu_mp", "can_create_cowork_session",
  "can_manage_users", "actor_level", "target_level"];
const preguntas = (u: string) => `jsonb_build_object(
  'g_admin', public.is_in_role_group('${u}','admin'), 'g_mgr', public.is_in_role_group('${u}','manager_or_above'),
  'g_sup', public.is_in_role_group('${u}','supervisor_or_above'), 'g_mem', public.is_in_role_group('${u}','member'),
  'r_admin', public.has_role('${u}','admin'::text), 'r_manager', public.has_role('${u}','manager'::text),
  'r_sup', public.has_role('${u}','supervisor'::text), 'r_closer', public.has_role('${u}','closer'::text),
  'r_chatter', public.has_role('${u}','Chatter'::text), 'e_admin', public.has_role('${u}','admin'::public.app_role),
  'e_closer', public.has_role('${u}','closer'::public.app_role),
  'p_cowork', public.has_permission('${u}','Cowork'), 'p_rend', public.has_permission('${u}','Chatters','Rendimiento'),
  'p_usr', public.has_permission('${u}','Administración','Usuarios'), 'p_closers', public.has_permission('${u}','Closers'),
  'cumf', public.can_use_module_function('${u}','Administración','Usuarios','manager_or_above'),
  'pvm_cowork', public.puede_ver_modulo('${u}','Cowork'), 'pvm_closers', public.puede_ver_modulo('${u}','Closers'),
  'm_jhon', public.can_manage_user('${JHON}','${u}','assign_role','Chatter'),
  'm_beto', public.can_manage_user('${BETO}','${u}','reset_password'),
  'm_beto_rol', public.can_manage_user('${BETO}','${u}','assign_role','closer')
) || jsonb_build_object(${SCOPES.map((f) => `'${f}', public.${f}('${u}')`).join(", ")})`;
async function matriz(db: PGlite, usuarios: [string, string][]): Promise<Fila> {
  const r = await uno(db, `select jsonb_build_object(${usuarios.map(([n, u]) => `'${n}', ${preguntas(u)}`).join(", ")}) m`);
  return r?.m ?? {};
}
// Las que dependen de quién llama (auth.uid()).
async function comoQuien(db: PGlite, usuarios: [string, string][]): Promise<Fila> {
  const out: Fila = {};
  for (const [n, u] of usuarios) {
    const una = async (sql: string) => { try { return (await como(db, u, sql)); } catch (e) { return msg(e).slice(0, 60); } };
    out[n] = {
      telefono: await una(`select public.can_see_contact_phone() v`),
      alcance: await una(`select public.closer_scope_agent_ids() v`),
      roster: await una(`select id from public.get_closers_roster() order by id`),
      evaluadores: await una(`select user_id from public.list_chatter_evaluators() order by user_id`),
      lista: await una(`select user_id, role, level, is_admin, manageable from public.admin_list_user_roles() order by user_id`),
      mio: await una(`select public.my_can_manage_user('${ANA}', 'assign_role', 'closer') v`),
    };
  }
  return out;
}
const diferencias = (a: Fila, b: Fila, pre = ""): string[] => {
  const ks = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  const out: string[] = [];
  for (const k of ks) {
    const x = a?.[k], y = b?.[k];
    if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x)) out.push(...diferencias(x, y, `${pre}${k}.`));
    else if (JSON.stringify(x) !== JSON.stringify(y)) out.push(`${pre}${k}: ${JSON.stringify(x)} → ${JSON.stringify(y)}`);
  }
  return out;
};
const huellas = async (db: PGlite) => new Map((await q(db, `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' f, md5(p.prosrc) h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).map((f) => [f.f as string, f.h as string]));

// ════ 0. El fixture es prod ══════════════════════════════════════════════════
{
  const db = new PGlite();
  await db.exec(FIXTURE);
  const h = await huellas(db);
  const distintas = [...HUELLAS].filter(([f, x]) => h.get(f) !== x).map(([f]) => f);
  check(HUELLAS.size === 56 && distintas.length === 0, `las ${HUELLAS.size} funciones del fixture tienen las huellas de prod${distintas.length ? ` — distintas: ${distintas.join(", ")}` : ""}`);
}

const prod = await nueva("prod");
const con = await nueva("con");

// ════ 1. La migración ════════════════════════════════════════════════════════
{
  const r = await uno(con, `select count(*)::int n from public.roles_por_agencia_respaldo`);
  check(r?.n === 45, `guarda el respaldo de las 45 funciones que reescribe (${r?.n})`);
  const hProd = await huellas(prod), hCon = await huellas(con);
  const cambiaron = [...HUELLAS.keys()].filter((f) => hProd.get(f) !== hCon.get(f));
  check(cambiaron.length === 45, `cambiaron exactamente 45 de las 56 funciones del fixture (${cambiaron.length})`);
  const quietas = [...HUELLAS.keys()].filter((f) => hProd.get(f) === hCon.get(f)).sort();
  check(JSON.stringify(quietas) === JSON.stringify(["can_manage_users(_user_id uuid)", "franja_de_tipo(_is_admin boolean, _is_manager boolean, _is_supervisor boolean)",
    "is_phone_privileged()", "mail_recipient_directory()", "my_can_manage_user(_target uuid, _action text, _new_role text)",
    "nivel_por_tipo(_is_admin boolean, _is_manager boolean, _is_supervisor boolean)", "tg_role_groups_updated_at()", "tg_roles_config_guard_level()",
    "trg_role_groups_sync()", "update_updated_at_column()", "user_has_role_name(_user_id uuid, _role_name text)"]),
    `las 11 que no cruzan roles por nombre quedan iguales (${quietas.join(", ")})`);
  const t = await uno(con, `select (select count(*)::int from public.user_roles where tenant_id = '${T1}') r,
    (select count(*)::int from public.roles_config where tenant_id = '${T1}') c,
    (select count(*)::int from public.role_groups where tenant_id = '${T1}') g,
    (select count(*)::int from public.role_base_grants where tenant_id = '${T1}') b`);
  check(t?.r === 6 && t?.c === 7 && t?.g === 7 && t?.b === 1, `el relleno pone asm-tech en todo (${JSON.stringify(t)})`);
  const audit = await uno(con, `select count(*)::int n from public.audit_log where action = 'role_changed' and details->>'old_role' = details->>'new_role'`);
  check(audit?.n === 0, "el relleno no deja «role_changed» de mentira en audit_log");
}

// ════ 2. Con una sola agencia, todo da lo mismo que en prod ══════════════════
{
  const a = await matriz(prod, T1_USUARIOS), b = await matriz(con, T1_USUARIOS);
  const d = diferencias(a, b);
  check(Object.keys(a).length === 7 && d.length === 0, `la matriz de permisos (7 personas × ${Object.keys(a.jhon ?? {}).length} preguntas) da igual que en prod${d.length ? ` — ${d.slice(0, 6).join("; ")}` : ""}`);
  // Que la matriz no sea trivial: hay sí y no de todo.
  const valores = new Set(Object.values(a).flatMap((x) => Object.values(x as Fila).map((v) => JSON.stringify(v))));
  check(valores.has("true") && valores.has("false") && [...valores].some((v) => v.includes("admin_bypass")) && [...valores].some((v) => v.includes("last_admin") || v.includes("target_level_not_below_caller")),
    `la matriz tiene respuestas variadas (${valores.size} distintas): si diera todo igual no probaría nada`);
  const x = await comoQuien(prod, T1_USUARIOS), y = await comoQuien(con, T1_USUARIOS);
  const dq = diferencias(x, y);
  check(dq.length === 0, `y las que dependen de quién llama (teléfono, alcance de closers, roster, evaluadores, lista de usuarios) dan igual${dq.length ? ` — ${dq.slice(0, 4).join("; ")}` : ""}`);
}

// ════ 3. Dos agencias ═════════════════════════════════════════════════════════
// En prod la otra agencia no puede tener roles propios: su gente usa los de asm-tech.
const OTRA_PROD = `
insert into public.tenants(id, slug, name) values ('${T2}', 'otra', 'Otra agencia');
insert into auth.users(id, email, raw_user_meta_data) values ('${OLGA}', 'olga@otra.test', '{"full_name":"Olga"}'),
  ('${PEPE}', 'pepe@otra.test', '{"full_name":"Pepe"}'), ('${QUINO}', 'quino@otra.test', '{"full_name":"Quino"}'),
  ('${SAM}', 'sam@otra.test', '{"full_name":"Sam"}'), ('${SINAG}', 'sinag@x.test', '{"full_name":"Sin Agencia"}');
delete from public.tenant_members where user_id in ('${OLGA}', '${PEPE}', '${QUINO}', '${SAM}', '${SINAG}');
insert into public.tenant_members(user_id, tenant_id) values ('${OLGA}', '${T2}'), ('${PEPE}', '${T2}'), ('${QUINO}', '${T2}'), ('${SAM}', '${T2}');
update public.user_roles set role = 'admin' where user_id in ('${OLGA}', '${SINAG}');
update public.user_roles set role = 'Chatter' where user_id = '${PEPE}';
update public.user_roles set role = 'Chatter Supervisor' where user_id = '${QUINO}';
update public.user_roles set role = 'Closer +' where user_id = '${SAM}';
`;
await prod.exec(OTRA_PROD);
// Con la migración: la otra agencia nace con su plantilla y la ajusta a su gusto.
await con.exec(`insert into public.tenants(id, slug, name) values ('${T2}', 'otra', 'Otra agencia')`);
const sembrados = await anda(con, "service_role", `select public.sembrar_roles_de_agencia('${T2}', 'agency', '${T1}') n`, "sembrar_roles_de_agencia con la plantilla de Agency");
await con.exec(`
insert into public.roles_config (tenant_id, name, level) values ('${T2}', 'Closer +', 50);
update public.role_groups set is_supervisor_or_above = true where tenant_id = '${T2}' and role_name = 'Closer +';
update public.role_permissions set data_scope = 'all' where module = 'Cowork' and role_id = (select id from public.roles_config where tenant_id = '${T2}' and name = 'Chatter');
delete from public.role_permissions where module = 'Chatters' and role_id = (select id from public.roles_config where tenant_id = '${T2}' and name = 'Chatter Supervisor');
insert into auth.users(id, email, raw_user_meta_data) values ('${OLGA}', 'olga@otra.test', '{"full_name":"Olga"}'),
  ('${PEPE}', 'pepe@otra.test', '{"full_name":"Pepe"}'), ('${QUINO}', 'quino@otra.test', '{"full_name":"Quino"}'),
  ('${SAM}', 'sam@otra.test', '{"full_name":"Sam"}'), ('${SINAG}', 'sinag@x.test', '{"full_name":"Sin Agencia"}');
insert into public.tenant_members(user_id, tenant_id) values ('${OLGA}', '${T2}'), ('${PEPE}', '${T2}'), ('${QUINO}', '${T2}'), ('${SAM}', '${T2}');
update public.user_roles set role = 'admin' where user_id in ('${OLGA}', '${SINAG}');
update public.user_roles set role = 'Chatter' where user_id = '${PEPE}';
update public.user_roles set role = 'Chatter Supervisor' where user_id = '${QUINO}';
update public.user_roles set role = 'Closer +' where user_id = '${SAM}';
`);

// 3.1 La plantilla
{
  check(sembrados?.[0]?.n === 6, `crea los 6 roles de la plantilla Agency (${JSON.stringify(sembrados)})`);
  const r = await uno(con, `select
    (select count(*)::int from public.roles_config where tenant_id = '${T2}') roles,
    (select string_agg(name, ',' order by lower(name), name) from public.roles_config where tenant_id = '${T2}') nombres,
    (select count(*)::int from public.role_permissions rp join public.roles_config rc on rc.id = rp.role_id where rc.tenant_id = '${T2}') permisos,
    (select bool_and(g2.is_admin = g1.is_admin and g2.is_supervisor_or_above = g1.is_supervisor_or_above and g2.is_manager_or_above = g1.is_manager_or_above)
       from public.role_groups g2 join public.role_groups g1 on g1.role_name = g2.role_name and g1.tenant_id = '${T1}'
      where g2.tenant_id = '${T2}' and g2.role_name <> 'Closer +') tipos,
    (select level from public.roles_config where tenant_id = '${T2}' and name = 'Chatter Supervisor') nivel_fino`);
  check(r?.roles === 7 && r?.nombres === "admin,Chatter,Chatter Supervisor,closer,Closer +,employee,supervisor",
    `la otra agencia tiene su admin, su Chatter y su Closer + propios, con los mismos nombres que asm-tech (${r?.nombres})`);
  // 13 copiados de asm-tech (admin no tiene: es admin) menos el de Chatters que la otra agencia le sacó a su Chatter Supervisor.
  check(r?.permisos === 12 && r?.tipos === true, `con los permisos y el tipo de acceso copiados (${r?.permisos} permisos)`);
  check(r?.nivel_fino === 55, `y el nivel fino dentro de la franja, no la base del tipo (${r?.nivel_fino})`);
  const otra = await uno(con, `select public.sembrar_roles_de_agencia('${T2}', 'agency', '${T1}') n`);
  check(otra?.n === 0, "sembrar otra vez no pisa nada (0 roles nuevos)");
  const e = await uno(con, `select (select count(*)::int from public.roles_config where tenant_id = '${T2}') n`);
  check(e?.n === 7, "y no duplica");
  await falla(con, ANA, `select public.sembrar_roles_de_agencia('${T2}', 'agency', '${T1}')`, /permission denied/, "desde la app nadie siembra roles");
  await falla(con, "service_role", `select public.sembrar_roles_de_agencia('${T2}', 'premium', '${T1}')`, /plan desconocido/, "un plan que no existe se rechaza");
  const T3 = "10000000-0000-4000-8000-000000000003";
  await con.exec(`insert into public.tenants(id, slug, name) values ('${T3}', 'empresa', 'Una empresa')`);
  const ent = await uno(con, `select public.sembrar_roles_de_agencia('${T3}', 'enterprise', '${T1}') n`);
  const entN = await uno(con, `select string_agg(name, ',' order by name) n from public.roles_config where tenant_id = '${T3}'`);
  check(ent?.n === 3 && entN?.n === "admin,employee,supervisor", `la plantilla Enterprise trae admin, supervisor y employee (${entN?.n})`);
}

// 3.2 Nombres repetidos: cada agencia con su «Chatter»
{
  const r = await intento(() => prod.exec(`insert into public.roles_config (name) values ('Chatter')`));
  check(/roles_config_name_key/.test(r), `línea base: en prod no puede haber dos «Chatter» (${r.slice(0, 70)})`);
  const pepe = await uno(con, `select public.has_cowork_global_scope('${PEPE}') pepe, public.has_cowork_global_scope('${ANA}') ana,
    public.has_permission('${PEPE}', 'Chatters', 'Rendimiento') rend_pepe`);
  check(pepe?.pepe === true && pepe?.ana === false, "el Chatter de la otra agencia ve todo Cowork (su permiso) y el de asm-tech sigue viendo lo suyo");
  check(pepe?.rend_pepe === true, "y Pepe tiene los permisos copiados de la plantilla");
  const base = await uno(prod, `select public.has_cowork_global_scope('${PEPE}') v`);
  check(base?.v === false, "línea base: en prod Pepe solo podía tener los permisos del Chatter de asm-tech");
}

// 3.3 Lo que ve y edita cada uno
{
  // Línea base: el admin de la otra agencia edita los roles de asm-tech.
  const b = await como(prod, OLGA, `update public.roles_config set description = 'tocado por otra agencia' where name = 'Chatter' returning id`).catch((e) => msg(e));
  check(Array.isArray(b) && b.length === 1, `línea base: en prod el admin de otra agencia edita el «Chatter» de asm-tech (${JSON.stringify(b).slice(0, 60)})`);

  const vis = await como(con, OLGA, `select (select count(*)::int from public.roles_config) roles,
    (select count(*)::int from public.roles_config where tenant_id = '${T1}') de_asm,
    (select count(*)::int from public.role_groups where tenant_id = '${T1}') grupos_asm,
    (select count(*)::int from public.role_permissions rp join public.roles_config rc on rc.id = rp.role_id) permisos,
    (select count(*)::int from public.user_roles) roles_gente,
    (select count(*)::int from public.role_base_grants where tenant_id = '${T1}') herencias_asm`);
  check(vis[0]?.roles === 7 && vis[0]?.de_asm === 0 && vis[0]?.grupos_asm === 0, `Olga (admin de la otra) ve solo los 7 roles de su agencia (${JSON.stringify(vis[0])})`);
  check(vis[0]?.roles_gente === 4 && vis[0]?.herencias_asm === 0, "solo los user_roles de su gente, y nada de las herencias de asm-tech");
  const edit = await como(con, OLGA, `update public.roles_config set description = 'x' where tenant_id = '${T1}' returning id`);
  check(edit.length === 0, "no edita un rol de asm-tech (0 filas)");
  await falla(con, OLGA, `insert into public.roles_config (tenant_id, name) values ('${T1}', 'Infiltrado')`, /row-level security/, "ni crea un rol en asm-tech mandando su tenant_id");
  await anda(con, OLGA, `insert into public.roles_config (name) values ('Editor')`, "crea un rol sin decir la agencia…");
  check((await uno(con, `select tenant_id::text t from public.roles_config where name = 'Editor'`))?.t === T2, "…y queda en la suya (el default)");
  check((await uno(con, `select tenant_id::text t from public.role_groups where role_name = 'Editor'`))?.t === T2, "y su tipo de acceso también");
  const perm = await como(con, OLGA, `insert into public.role_permissions (role_id, module, can_access)
    select id, 'Cowork', true from public.roles_config where tenant_id = '${T2}' and name = 'Editor' returning id`).catch((e) => msg(e));
  check(Array.isArray(perm) && perm.length === 1, "le pone permisos a su rol");
  const idAsm = (await uno(con, `select id from public.roles_config where tenant_id = '${T1}' and name = 'Chatter'`))?.id;
  await falla(con, OLGA, `insert into public.role_permissions (role_id, module, can_access) values ('${idAsm}', 'Finanzas', true)`, /row-level security/,
    "pero no le agrega permisos al Chatter de asm-tech");
  const mover = await como(con, OLGA, `update public.role_permissions set role_id = '${idAsm}' where role_id = (select id from public.roles_config where name = 'Editor') returning id`).catch((e) => msg(e));
  check(typeof mover === "string" && /row-level security/.test(mover), `ni le pasa un permiso suyo moviéndolo de rol (${String(mover).slice(0, 60)})`);
  const grupo = await como(con, OLGA, `update public.role_groups set is_admin = true where tenant_id = '${T1}' and role_name = 'Chatter' returning 1`);
  check(grupo.length === 0 && (await uno(con, `select is_admin from public.role_groups where tenant_id = '${T1}' and role_name = 'Chatter'`))?.is_admin === false,
    "no convierte en admin al Chatter de asm-tech (la política filtra la fila)");
  const ana = await como(con, ANA, `select (select count(*)::int from public.roles_config) roles, (select count(*)::int from public.roles_config where tenant_id = '${T2}') de_otra`);
  check(ana[0]?.roles === 7 && ana[0]?.de_otra === 0, "y Ana (asm-tech) ve solo los roles de asm-tech");
  const jhon = await como(con, JHON, `select count(*)::int n from public.user_roles`);
  check(jhon[0]?.n === 6, `Jhon (admin de asm-tech) ve los user_roles de asm-tech y no los de la otra (${jhon[0]?.n})`);
  const pjhon = await como(prod, JHON, `select count(*)::int n from public.user_roles`);
  check(pjhon[0]?.n === 11, `línea base: en prod Jhon veía también los de la otra agencia (${pjhon[0]?.n})`);
  await falla(con, "service_role", `update public.roles_config set tenant_id = '${T1}' where tenant_id = '${T2}' and name = 'Editor'`, /rol_agencia_inmutable/,
    "la agencia de un rol no se cambia, ni con service_role");
}

// 3.4 Gestionar gente: solo la de la propia agencia
{
  const pb = await uno(prod, `select public.can_manage_user('${JHON}', '${PEPE}', 'assign_role', 'Chatter')->>'reason' r`);
  check(pb?.r === "admin_bypass", `línea base: en prod Jhon le cambia el rol a alguien de la otra agencia (${pb?.r})`);
  const r = await uno(con, `select
    public.can_manage_user('${JHON}', '${PEPE}', 'assign_role', 'Chatter')->>'reason' jhon_pepe,
    public.can_manage_user('${OLGA}', '${ANA}', 'reset_password')->>'reason' olga_ana,
    public.can_manage_user('${OLGA}', '${PEPE}', 'assign_role', 'closer')->>'reason' olga_pepe,
    public.can_manage_user('${OLGA}', '${PEPE}', 'assign_role', 'Infiltrado')->>'reason' rol_ajeno,
    public.can_manage_user('${QUINO}', '${OLGA}', 'remove_role')->>'reason' ultimo,
    public.can_manage_user('${BETO}', '${PEPE}', 'reset_password')->>'reason' beto_pepe`);
  check(r?.jhon_pepe === "other_agency" && r?.olga_ana === "other_agency" && r?.beto_pepe === "other_agency",
    `nadie gestiona a alguien de otra agencia (${r?.jhon_pepe}, ${r?.olga_ana}, ${r?.beto_pepe})`);
  check(r?.olga_pepe === "admin_bypass", `Olga sí gestiona a su gente (${r?.olga_pepe})`);
  await con.exec(`insert into public.roles_config (tenant_id, name, level) values ('${T1}', 'Infiltrado', 20)`);
  const r2 = await uno(con, `select public.can_manage_user('${OLGA}', '${PEPE}', 'assign_role', 'Infiltrado')->>'reason' r`);
  check(r2?.r === "invalid_or_inactive_role", `y no le asigna un rol que solo existe en asm-tech (${r2?.r})`);
  const pu = await uno(prod, `select public.can_manage_user('${QUINO}', '${OLGA}', 'remove_role')->>'reason' r`);
  check(pu?.r === "target_level_not_below_caller", `línea base: en prod Olga no era «la última admin» porque contaba a Jhon (${pu?.r})`);
  check(r?.ultimo === "last_admin", `el último admin se cuenta por agencia: Olga es la única de la suya (${r?.ultimo})`);
  const lista = await como(con, OLGA, `select user_id from public.admin_list_user_roles() order by user_id`);
  check(lista.length === 4 && lista.every((f) => [OLGA, PEPE, QUINO, SAM].includes(f.user_id)), `la lista de usuarios de Olga es solo su gente (${lista.length})`);
  const plista = await como(prod, OLGA, `select count(*)::int n from public.admin_list_user_roles()`);
  check(plista[0]?.n === 12, `línea base: en prod veía a todos (${plista[0]?.n})`);
}

// 3.5 Herencias, evaluadores y cuentas sin agencia
{
  const pr = await como(prod, JHON, `select id from public.get_closers_roster()`);
  check(pr.some((f) => f.id === SAM), "línea base: en prod Sam (Closer + de la otra) entraba al roster por la herencia de asm-tech");
  const rr = await como(con, JHON, `select id from public.get_closers_roster()`);
  check(!rr.some((f) => f.id === SAM) && rr.some((f) => f.id === DORA), "con la migración, la herencia es de cada agencia: Sam no entra (su Closer + no hereda) y Dora sí");
  const pe = await como(prod, JHON, `select user_id from public.list_chatter_evaluators()`);
  check(pe.some((f) => f.user_id === QUINO), "línea base: en prod Quino figuraba como evaluador por el permiso del Chatter Supervisor de asm-tech");
  const ce = await como(con, JHON, `select user_id from public.list_chatter_evaluators()`);
  check(!ce.some((f) => f.user_id === QUINO) && ce.some((f) => f.user_id === BETO) && ce.some((f) => f.user_id === OLGA),
    "con la migración no (su agencia le sacó ese permiso); Beto sigue, y Olga entra por ser admin de la suya");
  const ps = await uno(prod, `select public.is_in_role_group('${SINAG}', 'admin') v, public.has_permission('${SINAG}', 'Finanzas') f`);
  check(ps?.v === true && ps?.f === true, "línea base: en prod una cuenta sin agencia con el rol 'admin' era admin");
  const cs = await uno(con, `select public.is_in_role_group('${SINAG}', 'admin') v, public.has_permission('${SINAG}', 'Finanzas') f,
    public.has_role('${SINAG}', 'admin'::text) r, (select tenant_id from public.user_roles where user_id = '${SINAG}') t`);
  check(cs?.v === false && cs?.f === false && cs?.r === true && cs?.t === null,
    `con la migración, sin agencia no es admin de nada (tenant_id NULL); has_role por nombre literal sigue: lo saca la 2b (${JSON.stringify(cs)})`);
}

// 3.6 La agencia de cada rol la pone la base
{
  await con.exec(`update public.user_roles set tenant_id = '${T1}' where user_id = '${PEPE}'`);
  check((await uno(con, `select tenant_id::text t from public.user_roles where user_id = '${PEPE}'`))?.t === T2, "mandar otra agencia en user_roles no cuenta: la base pone la de la persona");
  const antes = (await uno(con, `select count(*)::int n from public.audit_log`))?.n;
  const NUEVO = P(30);
  await con.exec(`insert into auth.users(id, email, raw_user_meta_data) values ('${NUEVO}', 'nuevo@otra.test', '{"full_name":"Nuevo"}')`);
  check((await uno(con, `select tenant_id from public.user_roles where user_id = '${NUEVO}'`))?.tenant_id === null, "el alta crea el rol sin agencia (todavía no la tiene)");
  await con.exec(`insert into public.tenant_members(user_id, tenant_id) values ('${NUEVO}', '${T2}')`);
  check((await uno(con, `select tenant_id::text t from public.user_roles where user_id = '${NUEVO}'`))?.t === T2, "cuando admin-user-actions le pone la agencia, su rol la toma solo");
  const desp = await q(con, `select action from public.audit_log order by created_at desc limit 5`);
  check((await uno(con, `select count(*)::int n from public.audit_log`))?.n === antes + 1 && desp.every((f) => f.action !== "role_changed"),
    "y en audit_log queda el alta del rol, no un «role_changed» de mentira");
  // Renombrar un rol en una agencia no toca a la otra.
  await con.exec(`update public.roles_config set name = 'Chateador' where tenant_id = '${T2}' and name = 'Chatter'`);
  const ren = await uno(con, `select (select role from public.user_roles where user_id = '${PEPE}') pepe, (select role from public.user_roles where user_id = '${ANA}') ana,
    (select count(*)::int from public.role_groups where tenant_id = '${T1}' and role_name = 'Chatter') g1,
    (select count(*)::int from public.role_groups where tenant_id = '${T2}' and role_name = 'Chateador') g2`);
  check(ren?.pepe === "Chateador" && ren?.ana === "Chatter" && ren?.g1 === 1 && ren?.g2 === 1, `renombrar el Chatter de la otra agencia no le cambia el rol a Ana (${JSON.stringify(ren)})`);
  // Cambiar el tipo de acceso de un rol solo mueve el nivel de esa agencia.
  await con.exec(`update public.role_groups set is_supervisor_or_above = true where tenant_id = '${T2}' and role_name = 'employee'`);
  const niv = await uno(con, `select (select level from public.roles_config where tenant_id = '${T1}' and name = 'employee') n1,
    (select level from public.roles_config where tenant_id = '${T2}' and name = 'employee') n2`);
  check(niv?.n1 === 20 && niv?.n2 === 50, `subir a supervisor el employee de la otra agencia no toca el de asm-tech (${JSON.stringify(niv)})`);
}

// ════ 4. La vuelta atrás ══════════════════════════════════════════════════════
{
  const db = await nueva("con");
  await aplicar(db, "vuelta atrás", VUELTA);
  check(true, "la vuelta atrás corre sobre la base con la migración");
  const h = await huellas(db);
  const distintas = [...HUELLAS].filter(([f, x]) => h.get(f) !== x).map(([f]) => f);
  check(distintas.length === 0, `las 56 funciones vuelven byte a byte a prod${distintas.length ? ` — distintas: ${distintas.join(", ")}` : ""}`);
  const pol = await q(db, `select tablename t, policyname p, qual, with_check from pg_policies where schemaname = 'public' and tablename in ('user_roles','roles_config','role_permissions','role_groups','role_base_grants') order by 1, 2`);
  const polProd = await q(prod, `select tablename t, policyname p, qual, with_check from pg_policies where schemaname = 'public' and tablename in ('user_roles','roles_config','role_permissions','role_groups','role_base_grants') order by 1, 2`);
  check(JSON.stringify(pol) === JSON.stringify(polProd), `las ${pol.length} políticas vuelven a ser las de prod`);
  const est = await uno(db, `select (select count(*)::int from information_schema.columns where table_schema = 'public' and column_name = 'tenant_id'
      and table_name in ('user_roles','roles_config','role_groups','role_base_grants')) cols,
    (select count(*)::int from pg_constraint where conname in ('roles_config_name_key','role_groups_pkey','role_base_grants_pkey')) claves,
    to_regclass('public.roles_por_agencia_respaldo') is null sin_respaldo`);
  check(est?.cols === 0 && est?.claves === 3 && est?.sin_respaldo === true, `vuelven las claves de antes y se van las columnas (${JSON.stringify(est)})`);
  // Contra un prod limpio: el de arriba ya tiene la otra agencia cargada.
  const limpia = await nueva("prod");
  const m1 = await matriz(limpia, T1_USUARIOS), m2 = await matriz(db, T1_USUARIOS);
  const dm = diferencias(m1, m2);
  check(dm.length === 0, `y los permisos dan lo mismo que en prod${dm.length ? ` — ${dm.slice(0, 4).join("; ")}` : ""}`);
  await aplicar(db, NOMBRE + " (otra vez)", MIG);
  check((await uno(db, `select count(*)::int n from public.roles_por_agencia_respaldo`))?.n === 45, "después de la vuelta atrás, la migración se puede volver a aplicar");
}

// ════ 5. Las negativas ═════════════════════════════════════════════════════════
{
  const dos = await nueva("prod", `insert into public.tenants(id, slug, name) values ('${T2}', 'otra', 'Otra');`);
  const r1 = await intento(() => aplicar(dos, NOMBRE, MIG));
  check(/hay 2 agencias/.test(r1), `con dos agencias al aplicar, se niega (${r1.slice(-80)})`);

  const forma = await nueva("prod", `create or replace function public.has_hr_access(_user_id uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
    select exists (select 1 from public.user_roles ur join public.roles_config rc on rc.name = ur.role join public.role_permissions rp on rp.role_id = rc.id where ur.user_id = _user_id and rp.module = 'HR')
        or exists (select 1 from public.user_roles ur join public.roles_config rc on rc.name = ur.role where ur.user_id = _user_id and rc.name = 'HHRR') $f$;`);
  const r2 = await intento(() => aplicar(forma, NOMBRE, MIG));
  check(/has_hr_access\(uuid\) tiene 2 cruce\(s\) de la regla R1, se esperaban 1/.test(r2), `si una función de prod no tiene la forma esperada, se niega (${r2.slice(-90)})`);
  check((await uno(forma, `select to_regclass('public.roles_por_agencia_respaldo') is null v`))?.v === true, "y no deja nada a medias");

  const nueva_ = await nueva("prod", `create function public.lee_roles_sin_revisar() returns int language sql as $f$ select count(*)::int from public.roles_config $f$;`);
  const r3 = await intento(() => aplicar(nueva_, NOMBRE, MIG));
  check(/no están revisadas: (public\.)?lee_roles_sin_revisar\(\)/.test(r3), `si hay una función nueva que lee roles y no está revisada, se niega (${r3.slice(-90)})`);

  const otraForma = await nueva("prod", `create function public.cruza_otro_alias(_u uuid) returns boolean language sql as $f$
    select exists (select 1 from public.user_roles ur join public.role_groups rg on rg.role_name = ur.role where ur.user_id = _u and rg.is_admin) $f$;`);
  const r4 = await intento(() => aplicar(otraForma, NOMBRE, MIG));
  check(/quedan cruces por nombre sin agencia en: (public\.)?cruza_otro_alias\(uuid\)/.test(r4), `y si una función nueva cruza por nombre, también (${r4.slice(-90)})`);
}

for (const m of ok) console.log(`✓ ${m}`);
for (const m of mal) console.log(`✗ ${m}`);
console.log(`\n${ok.length} ok${mal.length ? `, ${mal.length} MAL` : ""}`);
if (mal.length) Deno.exit(1);
