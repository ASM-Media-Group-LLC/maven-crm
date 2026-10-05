// Portal de creadoras, fase 2 (migración 20261006120000_portal_contenido): la
// carpeta de contenido de cada creadora en el Drive de su agencia, probada contra
// un Postgres de verdad (PGlite) con el catálogo de PROD (los fixtures de
// creadoras_por_agencia.ts) + las migraciones del Drive en orden + la fase 1.
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/portal_contenido.ts
//
//   1. La migración carga sobre prod; con un drive_mi_rol distinto del revisado, no.
//   2. creadora_carpetas: solo una unidad 'empresa' de la agencia de la creadora;
//      lo de adentro sabe que es de esa unidad (unidad_id).
//   3. Quién la abre (drive_mi_rol): quien ve a la creadora y tiene el permiso
//      (admin, su manager; un chatter solo si su rol lo tiene; nunca la otra
//      agencia ni la propia creadora por la RLS). En prod nadie la abría: la
//      rama nueva es la que da el acceso.
//   4. El Drive de siempre no cambia: el rol de cada persona sobre lo que no es
//      de una creadora es el mismo que en prod.
//   5. Lector de verdad: ve y no escribe (ni carpetas, ni nombres, ni papelera).
//   6. drive_espacio_de_la_agencia: lo de la carpeta gasta el espacio de la
//      agencia; solo la llama el servidor.
//   7. La vuelta atrás deja todo como estaba y se puede volver a aplicar.
//
// Sale con código 1 si algo falla. Corre en el guard de cada PR.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FX_ROLES = leer("./fixtures/prod_roles_20261001.sql");
const FX = leer("./fixtures/prod_creadoras_20261005.sql");
const ANTES = [
  "20261001210000_agencias_base.sql", "20261001211000_roles_por_agencia.sql", "20261001212000_personas_por_agencia.sql",
].map((n) => ({ n, sql: leer(`../migrations/${n}`) }));
// Las migraciones viejas del Drive traen guardas de huella de cómo quedó cada
// función en prod cuando se aplicaron (algunas en otro orden que el de su
// nombre): aquí se sacan y se aplica la definición. Lo que importa lo comprueba
// la guarda de ESTA migración: drive_mi_rol y drive_uso_agencia idénticas a prod.
const sinGuardas = (sql: string) => sql.replace(/DO \$\$[\s\S]*?END \$\$;/g, (b) => (/md5\(prosrc\)/.test(b) ? "" : b));
const DRIVE = [
  "20260928200000_oficina_drive.sql", "20260929090000_drive_cupos.sql", "20260929100000_drive_cupos_nombre_o_correo.sql",
  "20260929180000_funciones_sin_voseo.sql", "20261002090000_drive_fecha_de_google.sql", "20261002100000_drive_abrir_no_modifica.sql",
  "20261002130000_drive_unidades.sql", "20261002160000_drive_compartido_agencia.sql", "20261002180000_drive_aperturas_por_persona.sql",
  "20261002200000_drive_versiones.sql", "20261003140000_drive_papelera_y_detalles.sql", "20261003170000_drive_papelera_no_cambia_la_fecha.sql",
].map((n) => ({ n, sql: sinGuardas(leer(`../migrations/${n}`)) }));
const YA = [
  "20261005140000_creadoras_por_agencia.sql", "20261005140100_cuentas_externas_y_avisos.sql", "20261006100000_portal_creadoras_cuentas.sql",
].map((n) => ({ n, sql: leer(`../migrations/${n}`) }));
const N = "20261006120000_portal_contenido.sql";
const M = leer(`../migrations/${N}`);
const vuelta = (sql: string) => sql.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");

// creator_history tal como está en prod (la fase 1 le pone políticas).
const HISTORIAL_PROD = `
create table public.creator_history (id uuid primary key default gen_random_uuid(), creator_id uuid not null, user_id uuid not null,
  action text not null, old_value text, new_value text, created_at timestamptz default now());
alter table public.creator_history enable row level security;
grant all on public.creator_history to anon, authenticated, service_role;
create policy creator_history_scope on public.creator_history for all to authenticated
  using (public.has_permission(auth.uid(), 'Creadores'::text, null::text))
  with check (public.has_permission(auth.uid(), 'Creadores'::text, null::text));
`;

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);
const json = (x: unknown) => JSON.stringify(x);

// ─── Gente, agencias, creadoras y fichas del Drive ──────────────────────────
const T1 = "10000000-0000-4000-8000-000000000001"; // asm-tech
const T2 = "10000000-0000-4000-8000-000000000002"; // otra agencia
const P = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [JHON, ANA, MARIO, CLARA, EMPL, SUPI] = [1, 2, 3, 4, 5, 6].map(P);
const OLGA = P(11);
const [SOFI, LUNA] = [31, 32].map(P);
const C = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [C1, C2, C3, D1] = [1, 2, 3, 11].map(C);
const I = (n: number) => `e1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// La carpeta de Sofi y lo de adentro; y fichas del Drive de siempre para comparar.
const [RAIZ, SESION, FOTO, VIDEO] = [1, 2, 3, 4].map(I);
const [EMPRESA, EMPRESA_DOC, MIA_JHON, MIA_DOC, COMPARTIDA, COMP_DOC, DE_TODOS, DE_TODOS_DOC] = [20, 21, 22, 23, 24, 25, 26, 27].map(I);
const [RAIZ_OTRA, NO_UNIDAD] = [40, 41].map(I);

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
  ('supervisor', 'Creadores', null, true, 'all'),
  ('employee', 'Creadores', null, false, 'all'),
  ('closer', 'Closers', null, true, 'self'),
  ('Supervisor sin creadoras', 'Cowork', null, true, 'all')
) as p(rol, module, submodule, can_access, scope) on p.rol = rc.name;
insert into auth.users(id, email, raw_user_meta_data) values
  ('${JHON}', 'jhon.lopez@maven-ai.me', '{"full_name":"Jhon"}'), ('${ANA}', 'ana@x.test', '{"full_name":"Ana"}'),
  ('${MARIO}', 'mario@x.test', '{"full_name":"Mario"}'), ('${CLARA}', 'clara@x.test', '{"full_name":"Clara"}'),
  ('${EMPL}', 'empl@x.test', '{"full_name":"Empl"}'), ('${SUPI}', 'supi@x.test', '{"full_name":"Supi"}');
update public.user_roles set role = 'admin' where user_id = '${JHON}';
update public.user_roles set role = 'Chatter' where user_id = '${ANA}';
update public.user_roles set role = 'manager' where user_id = '${MARIO}';
update public.user_roles set role = 'closer' where user_id = '${CLARA}';
update public.user_roles set role = 'Supervisor sin creadoras' where user_id = '${SUPI}';
`;
const DATOS = `
insert into public.creators (id, name, artistic_name, status, instagram_handle, assigned_manager_id, assigned_manager_profile_id, closer_responsible_id, created_by) values
  ('${C1}', 'Sofía', 'Sofi', 'active', 'sofi', '${MARIO}', '${MARIO}', null, '${JHON}'),
  ('${C2}', 'Dos', null, 'active', 'dos', null, null, null, '${JHON}'),
  ('${C3}', 'Tres', null, 'active', 'tres', null, null, '${CLARA}', '${JHON}');
insert into public.chatter_identity (id, display_name, maven_user_id) values ('e0000000-0000-4000-8000-000000000001', 'Ana', '${ANA}');
insert into public.chatter_group_members (group_id, identity_id, shift) values ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'mañana');
insert into public.chatter_group_creators (group_id, creator_id, creator_handle) values ('f0000000-0000-4000-8000-000000000001', '${C1}', 'sofi');
`;
const OTRA = `
insert into public.tenants(id, slug, name) values ('${T2}', 'otra', 'Otra agencia');
select public.sembrar_roles_de_agencia('${T2}', 'agency', '${T1}');
insert into auth.users(id, email, raw_user_meta_data) values ('${OLGA}', 'olga@otra.test', '{"full_name":"Olga"}');
insert into public.tenant_members(user_id, tenant_id) values ('${OLGA}', '${T2}');
update public.user_roles set role = 'admin' where user_id = '${OLGA}';
`;
const CUENTAS = `
insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data) values
  ('${SOFI}', 'sofi@gmail.test', '{"full_name":"Sofi"}', '{"tipo":"creadora"}'),
  ('${LUNA}', 'luna@gmail.test', '{"full_name":"Luna"}', '{"tipo":"creadora"}');
insert into public.creadora_cuentas (user_id, creator_id, correo) values ('${SOFI}', '${C1}', 'sofi@gmail.test');
`;
// El Drive de siempre: una unidad de la empresa compartida con Ana (editora),
// lo de Jhon, una carpeta suya compartida con Mario y una abierta a la agencia.
const DRIVE_DE_SIEMPRE = `
insert into public.drive_items (id, tenant_id, owner_id, parent_id, tipo, nombre) values
  ('${EMPRESA}', '${T1}', null, null, 'carpeta', 'Contabilidad'),
  ('${MIA_JHON}', '${T1}', '${JHON}', null, 'carpeta', 'Mía'),
  ('${COMPARTIDA}', '${T1}', '${JHON}', null, 'carpeta', 'Para Mario'),
  ('${DE_TODOS}', '${T1}', '${JHON}', null, 'carpeta', 'Para todos');
insert into public.drive_items (id, tenant_id, owner_id, parent_id, tipo, nombre, mime, size, storage_key) values
  ('${EMPRESA_DOC}', '${T1}', '${JHON}', '${EMPRESA}', 'archivo', 'balance.pdf', 'application/pdf', 100, '${T1}/${EMPRESA_DOC}'),
  ('${MIA_DOC}', '${T1}', '${JHON}', '${MIA_JHON}', 'archivo', 'nota.txt', 'text/plain', 10, '${T1}/${MIA_DOC}'),
  ('${COMP_DOC}', '${T1}', '${JHON}', '${COMPARTIDA}', 'archivo', 'plan.pdf', 'application/pdf', 20, '${T1}/${COMP_DOC}'),
  ('${DE_TODOS_DOC}', '${T1}', '${JHON}', '${DE_TODOS}', 'archivo', 'aviso.pdf', 'application/pdf', 30, '${T1}/${DE_TODOS_DOC}');
insert into public.drive_unidades (item_id, tenant_id, tipo) values ('${EMPRESA}', '${T1}', 'empresa');
insert into public.drive_shares (item_id, user_id, rol, created_by) values
  ('${EMPRESA}', '${ANA}', 'editor', '${JHON}'), ('${COMPARTIDA}', '${MARIO}', 'lector', '${JHON}');
insert into public.drive_compartido_agencia (item_id, tenant_id, rol, created_by) values ('${DE_TODOS}', '${T1}', 'lector', '${JHON}');
`;
// La carpeta de Sofi como la arma la edge (service_role): carpeta sin dueño,
// unidad 'empresa', marca de creadora; adentro, lo que subió ella.
const CARPETA_DE_SOFI = `
insert into public.drive_items (id, tenant_id, owner_id, parent_id, tipo, nombre) values ('${RAIZ}', '${T1}', null, null, 'carpeta', 'Contenido · Sofi');
insert into public.drive_unidades (item_id, tenant_id, tipo) values ('${RAIZ}', '${T1}', 'empresa');
insert into public.creadora_carpetas (creator_id, item_id) values ('${C1}', '${RAIZ}');
insert into public.drive_items (id, tenant_id, owner_id, parent_id, tipo, nombre) values ('${SESION}', '${T1}', '${SOFI}', '${RAIZ}', 'carpeta', 'Sesión cocina');
insert into public.drive_items (id, tenant_id, owner_id, parent_id, tipo, nombre, mime, size, storage_key) values
  ('${FOTO}', '${T1}', '${SOFI}', '${SESION}', 'archivo', 'foto.jpg', 'image/jpeg', 1000, '${T1}/${FOTO}'),
  ('${VIDEO}', '${T1}', '${SOFI}', '${SESION}', 'archivo', 'video.mp4', 'video/mp4', 50000, '${T1}/${VIDEO}');
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}
async function comoServicio(db: PGlite, sql: string) {
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "service_role" })]);
    await db.exec("set local role service_role");
    await db.exec(sql);
    await db.exec("commit");
  } catch (e) {
    await db.exec("rollback");
    throw new Error(`como service_role: ${msg(e)}`);
  }
}
async function nueva(conMigracion: boolean, antes = ""): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FX_ROLES);
  await db.exec(FX);
  await db.exec(HISTORIAL_PROD);
  await db.exec(SEMILLA);
  for (const m of ANTES) await aplicar(db, m.n, m.sql);
  for (const m of DRIVE) await aplicar(db, m.n, m.sql);
  await db.exec(DATOS);
  for (const m of YA) await aplicar(db, m.n, m.sql);
  await db.exec(OTRA + CUENTAS);
  await comoServicio(db, DRIVE_DE_SIEMPRE);
  await db.exec(antes);
  if (conMigracion) {
    await aplicar(db, N, M);
    await comoServicio(db, CARPETA_DE_SOFI);
  }
  return db;
}
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as Fila[];
const uno = async (db: PGlite, sql: string) => (await q(db, sql))[0];

type Quien = string | "service_role" | "anon" | "postgres";
async function entrar(db: PGlite, quien: Quien) {
  await db.exec("reset role");
  if (quien === "postgres") return;
  const servicio = quien === "service_role" || quien === "anon";
  const claims = servicio ? { role: quien } : { sub: quien, role: "authenticated" };
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
  await db.exec(`set local role ${servicio ? quien : "authenticated"}`);
}
// Lo corre y lo deshace siempre.
async function probar(db: PGlite, quien: Quien, sql: string): Promise<Fila[] | string> {
  await db.exec("begin");
  try { await entrar(db, quien); const rs = await db.exec(sql); return (rs.at(-1)?.rows ?? []) as Fila[]; }
  catch (e) { return msg(e); }
  finally { await db.exec("rollback"); }
}
const intento = async (f: () => Promise<unknown>) => { try { await f(); return "anduvo"; } catch (e) { return msg(e); } };
const filas = (r: Fila[] | string) => (Array.isArray(r) ? r : []);
const esError = (r: Fila[] | string, re: RegExp) => typeof r === "string" && re.test(r);
const rol = async (db: PGlite, quien: Quien, item: string) => {
  const r = await probar(db, quien, `select public.drive_mi_rol('${item}') r`);
  return typeof r === "string" ? `error: ${r.slice(0, 60)}` : (r[0]?.r ?? null);
};

// ════ 1. La migración ═════════════════════════════════════════════════════════
const prod = await nueva(false);
const con = await nueva(true);
check(true, "la migración carga sobre prod (el Drive, creadoras por agencia y la fase 1 ya aplicados)");
{
  const otraRol = await nueva(false, `create or replace function public.drive_mi_rol(p_item uuid) returns text language sql stable security definer
    set search_path to 'public' as $function$ select 'dueno'::text $function$;`);
  const r = await intento(() => aplicar(otraRol, N, M));
  check(/drive_mi_rol no es la que se revisó/.test(r), `con un drive_mi_rol distinto del revisado, no carga (${r.slice(-70)})`);
  check((await uno(otraRol, `select to_regclass('public.creadora_carpetas') t`))?.t === null, "y no deja nada");
}

// ════ 2. creadora_carpetas ═══════════════════════════════════════════════════
{
  const u = await q(con, `select id, unidad_id from public.drive_items where id in ('${RAIZ}', '${SESION}', '${FOTO}', '${VIDEO}') order by id`);
  check(u.length === 4 && u.every((f) => f.unidad_id === RAIZ), `todo lo de su carpeta es de su unidad (unidad_id): ${json(u.map((f) => f.unidad_id === RAIZ))}`);
  const k = await uno(con, `select tenant_id from public.creadora_carpetas where creator_id = '${C1}'`);
  check(k?.tenant_id === T1, "la agencia sale de la ficha");
  // Una carpeta que no es unidad, o una unidad de la otra agencia: no.
  const noUnidad = await probar(con, "service_role", `insert into public.drive_items (id, tenant_id, parent_id, tipo, nombre) values ('${NO_UNIDAD}', '${T1}', null, 'carpeta', 'Suelta');
    insert into public.creadora_carpetas (creator_id, item_id) values ('${C2}', '${NO_UNIDAD}')`);
  check(esError(noUnidad, /drive_unidades|foreign key|tiene que ser una unidad/), `una carpeta que no es unidad, no (${String(noUnidad).slice(0, 80)})`);
  const otraAgencia = await probar(con, "service_role", `insert into public.drive_items (id, tenant_id, parent_id, tipo, nombre) values ('${RAIZ_OTRA}', '${T2}', null, 'carpeta', 'De la otra');
    insert into public.drive_unidades (item_id, tenant_id, tipo) values ('${RAIZ_OTRA}', '${T2}', 'empresa');
    insert into public.creadora_carpetas (creator_id, item_id) values ('${C2}', '${RAIZ_OTRA}')`);
  check(esError(otraAgencia, /unidad de la agencia de la creadora/), `una unidad de otra agencia, no (${String(otraAgencia).slice(0, 80)})`);
  const dos = await probar(con, "service_role", `insert into public.creadora_carpetas (creator_id, item_id) values ('${C1}', '${EMPRESA}')`);
  check(esError(dos, /duplicate key|creadora_carpetas_pkey/), "una creadora, una carpeta");
}

// ════ 3. Quién la abre ══════════════════════════════════════════════════════
{
  const pRol = await rol(prod, JHON, EMPRESA);
  check(pRol === null, `línea base: en prod el admin no tiene rol sobre una unidad no compartida con él (${pRol})`);
  for (const [quien, nombre, esperado] of [
    [JHON, "el admin", "lector"],
    [MARIO, "su manager (Creadores y supervisor o más)", "lector"],
    [ANA, "su chatter (la ve, pero su rol no tiene el permiso)", null],
    [EMPL, "un empleado (no la ve)", null],
    [CLARA, "una closer de otra creadora", null],
    [SUPI, "un supervisor que no ve creadoras", null],
    [OLGA, "la admin de la otra agencia", null],
    [SOFI, "la propia creadora (por la RLS: lo suyo va por la edge)", null],
  ] as const) {
    const enRaiz = await rol(con, quien, RAIZ), enVideo = await rol(con, quien, VIDEO);
    check(enRaiz === esperado && enVideo === esperado, `${nombre}: ${esperado ?? "nada"} (${enRaiz}, ${enVideo})`);
  }
  // El permiso explícito en el rol manda: a un chatter se le da; a un manager se le quita.
  const dar = `insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
    select id, 'Creadores', 'Ver y descargar su contenido', true, 'all' from public.roles_config where name = 'Chatter';`;
  const quitar = `insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
    select id, 'Creadores', 'Ver y descargar su contenido', false, 'all' from public.roles_config where name = 'manager';`;
  const conAna = await probar(con, ANA, `reset role; ${dar} select set_config('request.jwt.claims', '{"sub":"${ANA}","role":"authenticated"}', true); set local role authenticated; select public.drive_mi_rol('${VIDEO}') r`);
  check(filas(conAna)[0]?.r === "lector", `con el permiso en su rol, su chatter la abre (${json(conAna)})`);
  const sinMario = await probar(con, MARIO, `reset role; ${quitar} select set_config('request.jwt.claims', '{"sub":"${MARIO}","role":"authenticated"}', true); set local role authenticated; select public.drive_mi_rol('${VIDEO}') r`);
  check(filas(sinMario)[0]?.r === null, `con el permiso quitado en su rol, su manager no (${json(sinMario)})`);
  const pClara = await probar(con, CLARA, `reset role; insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
    select id, 'Creadores', 'Ver y descargar su contenido', true, 'all' from public.roles_config where name = 'closer';
    select set_config('request.jwt.claims', '{"sub":"${CLARA}","role":"authenticated"}', true); set local role authenticated; select public.drive_mi_rol('${VIDEO}') r`);
  check(filas(pClara)[0]?.r === null, "con el permiso pero sin ver a esa creadora, no");

  // Por la RLS: la ficha del Drive, la unidad y la marca.
  const ve = async (quien: Quien) => ({
    archivos: filas(await probar(con, quien, `select id from public.drive_items where unidad_id = '${RAIZ}' and tipo = 'archivo'`)).length,
    unidad: filas(await probar(con, quien, `select item_id from public.drive_unidades where item_id = '${RAIZ}'`)).length,
    marca: filas(await probar(con, quien, `select creator_id from public.creadora_carpetas`)).length,
  });
  const vJ = await ve(JHON), vA = await ve(ANA), vO = await ve(OLGA), vS = await ve(SOFI), vL = await ve(LUNA);
  check(vJ.archivos === 2 && vJ.unidad === 1 && vJ.marca === 1, `el admin ve sus 2 archivos, la unidad y la marca (${json(vJ)})`);
  check(vA.archivos === 0 && vA.unidad === 0 && vA.marca === 1, `su chatter sabe que tiene carpeta pero no la abre (${json(vA)})`);
  check(vO.archivos === 0 && vO.unidad === 0 && vO.marca === 0, `la otra agencia, nada (${json(vO)})`);
  check(vS.archivos === 0 && vS.marca === 1, `la creadora ve su marca, y los archivos van por la edge (${json(vS)})`);
  check(vL.archivos === 0 && vL.marca === 0, `otra creadora, nada (${json(vL)})`);
}

// ════ 4. El Drive de siempre no cambia ═══════════════════════════════════════
{
  const items = [EMPRESA, EMPRESA_DOC, MIA_JHON, MIA_DOC, COMPARTIDA, COMP_DOC, DE_TODOS, DE_TODOS_DOC];
  const gente: Quien[] = [JHON, ANA, MARIO, CLARA, EMPL, SUPI, OLGA, SOFI];
  const diferencias: string[] = [];
  for (const g of gente) for (const it of items) {
    const a = await rol(prod, g, it), b = await rol(con, g, it);
    if (a !== b) diferencias.push(`${g.slice(-2)}/${it.slice(-2)}: ${a} → ${b}`);
  }
  check(diferencias.length === 0, `el rol de cada persona sobre lo que no es de una creadora es el de prod (${gente.length * items.length} casos; ${json(diferencias)})`);
  // De a una: probar() usa la conexión de la base, y dos a la vez se pisan la sesión.
  const casos = [await rol(con, ANA, EMPRESA_DOC), await rol(con, MARIO, COMP_DOC), await rol(con, EMPL, DE_TODOS_DOC), await rol(con, JHON, MIA_DOC)];
  check(json(casos) === json(["editor", "lector", "lector", "dueno"]), `y siguen los casos de siempre: editora, lector, abierto a la agencia, dueño (${json(casos)})`);
}

// ════ 5. Lector de verdad ═══════════════════════════════════════════════════
{
  const carpeta = await probar(con, JHON, `insert into public.drive_items (tipo, nombre, parent_id) values ('carpeta', 'Mía adentro', '${SESION}')`);
  check(esError(carpeta, /row-level security|No puedes guardar/), `no crea carpetas adentro (${String(carpeta).slice(0, 60)})`);
  const nombre = await probar(con, JHON, `update public.drive_items set nombre = 'otro.mp4' where id = '${VIDEO}' returning id`);
  const papelera = await probar(con, MARIO, `update public.drive_items set trashed_at = now() where id = '${VIDEO}' returning id`);
  check(Array.isArray(nombre) && nombre.length === 0 && Array.isArray(papelera) && papelera.length === 0, `no cambia nombres ni manda a la papelera (${json(nombre)}, ${json(papelera)})`);
  const mover = await probar(con, JHON, `update public.drive_items set parent_id = '${MIA_JHON}' where id = '${VIDEO}' returning id`);
  check(Array.isArray(mover) && mover.length === 0, "ni se lleva un archivo a lo suyo");
}

// ════ 6. El espacio de la agencia ═════════════════════════════════════════════
{
  const s = filas(await probar(con, "service_role", `select * from public.drive_espacio_de_la_agencia('${T1}')`))[0];
  const empresa = 100; // balance.pdf, en la unidad de la empresa
  check(Number(s?.usado) === empresa + 1000 + 50000, `lo de su carpeta gasta el espacio de la agencia (${s?.usado})`);
  const igual = filas(await probar(con, JHON, `select usado, cupo from public.drive_uso_agencia()`))[0];
  check(Number(igual?.usado) === Number(s?.usado) && String(igual?.cupo) === String(s?.cupo), `la misma cuenta que drive_uso_agencia (${json(igual)} = ${json(s)})`);
  const personal = filas(await probar(con, SOFI, `select usado from public.drive_uso('${SOFI}')`));
  check(personal.length === 0 || Number(personal[0]?.usado ?? 0) === 0, `y no el cupo de una persona (${json(personal)})`);
  const navegador = await probar(con, JHON, `select * from public.drive_espacio_de_la_agencia('${T1}')`);
  check(esError(navegador, /permission denied/), "solo la llama el servidor");
}

// ════ 7. La vuelta atrás ══════════════════════════════════════════════════════
{
  const db = await nueva(true);
  const r = await intento(() => aplicar(db, "vuelta atrás", vuelta(M)));
  check(r === "anduvo", `la vuelta atrás corre (${r.slice(0, 80)})`);
  const quedan = await uno(db, `select to_regclass('public.creadora_carpetas') t,
    (select count(*)::int from pg_proc where proname in ('puedo_ver_contenido_de','drive_espacio_de_la_agencia','creadora_carpetas_revisar')) f,
    (select md5(prosrc) from pg_proc where proname = 'drive_mi_rol') h`);
  check(quedan?.t === null && quedan?.f === 0 && quedan?.h === "dbfc25b5f58c1fbcf1e329839d931d2d", `y deja todo como en prod (${json(quedan)})`);
  check((await intento(() => aplicar(db, N, M))) === "anduvo", "y se puede volver a aplicar");
}

for (const m of ok) console.log(`✓ ${m}`);
for (const m of mal) console.log(`✗ ${m}`);
console.log(`\n${ok.length} ok${mal.length ? `, ${mal.length} MAL` : ""}`);
if (mal.length) Deno.exit(1);
