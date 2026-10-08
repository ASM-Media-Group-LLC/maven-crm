// Accesos de OnlyFans de las creadoras (migración 20261008120000_creadora_accesos),
// probada contra un Postgres de verdad (PGlite) con el catálogo de PROD: los mismos
// fixtures que portal_creadoras.ts.
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/creadora_accesos.ts
//
//   1. La migración carga sobre prod.
//   2. La agencia sale de la ficha; los textos se limpian; la contraseña va completa
//      (cifrado + nonce + versión) o no va; la fecha de la contraseña se mueve SOLO
//      cuando cambia la contraseña.
//   3. NADIE desde el navegador: ni un admin, ni la creadora, ni anon. Solo la edge
//      (service_role).
//   4. Los eventos: solo se agregan (ni la edge los cambia ni los borra), con la
//      agencia de la ficha.
//   5. Borrar la ficha borra sus accesos y sus eventos.
//   6. La vuelta atrás (las líneas «--|») deja todo como estaba y se puede volver a aplicar.
//
// Sale con código 1 si algo falla. Corre en el guard de cada PR.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FX_ROLES = leer("./fixtures/prod_roles_20261001.sql");
const FX = leer("./fixtures/prod_creadoras_20261005.sql");
const ANTES = [
  "20261001210000_agencias_base.sql", "20261001211000_roles_por_agencia.sql", "20261001212000_personas_por_agencia.sql",
].map((n) => ({ n, sql: leer(`../migrations/${n}`) }));
const YA = ["20261005140000_creadoras_por_agencia.sql", "20261005140100_cuentas_externas_y_avisos.sql"]
  .map((n) => ({ n, sql: leer(`../migrations/${n}`) }));
const N = "20261008120000_creadora_accesos.sql";
const M = leer(`../migrations/${N}`);
const vuelta = (sql: string) => sql.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);

const T1 = "10000000-0000-4000-8000-000000000001";
const T2 = "10000000-0000-4000-8000-000000000002";
const P = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [JHON, MARIO] = [1, 3].map(P);
const SOFI = P(31);
const C = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [C1, C2] = [1, 2].map(C);

const SEMILLA = `
insert into public.tenants(id, slug, name) values ('${T1}', 'asm-tech', 'ASM Tech');
insert into public.roles_config (name, is_system, level) values
  ('admin', true, 100), ('manager', true, 70), ('supervisor', true, 50), ('employee', true, 20), ('closer', true, 20),
  ('Chatter', false, 20), ('Chatter Supervisor', false, 55), ('Supervisor sin creadoras', false, 50);
update public.role_groups set is_admin = true, is_manager_or_above = true, is_supervisor_or_above = true where role_name = 'admin';
update public.role_groups set is_manager_or_above = true, is_supervisor_or_above = true where role_name = 'manager';
update public.role_groups set is_supervisor_or_above = true where role_name in ('supervisor', 'Chatter Supervisor', 'Supervisor sin creadoras');
insert into auth.users(id, email, raw_user_meta_data) values
  ('${JHON}', 'jhon.lopez@maven-ai.me', '{"full_name":"Jhon"}'), ('${MARIO}', 'mario@x.test', '{"full_name":"Mario"}');
update public.user_roles set role = 'admin' where user_id = '${JHON}';
update public.user_roles set role = 'manager' where user_id = '${MARIO}';
`;
const DATOS = `
insert into public.creators (id, name, artistic_name, status, instagram_handle, email, created_by) values
  ('${C1}', 'Sofía', 'Sofi', 'active', 'sofi', 'sofi@x.test', '${JHON}'),
  ('${C2}', 'Dos', null, 'active', 'dos', null, '${JHON}');
insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data) values
  ('${SOFI}', 'sofi.personal@gmail.test', '{"full_name":"Sofi"}', '{"tipo":"creadora"}');
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}
async function nueva(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FX_ROLES);
  await db.exec(FX);
  await db.exec(SEMILLA);
  for (const m of ANTES) await aplicar(db, m.n, m.sql);
  await db.exec(DATOS);
  for (const m of YA) await aplicar(db, m.n, m.sql);
  await db.exec(`insert into public.tenants(id, slug, name) values ('${T2}', 'otra', 'Otra agencia');
    select public.sembrar_roles_de_agencia('${T2}', 'agency', '${T1}');`);
  await aplicar(db, N, M);
  return db;
}
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as Fila[];
const uno = async (db: PGlite, sql: string) => (await q(db, sql))[0];

type Quien = string | "service_role" | "anon";
async function entrar(db: PGlite, quien: Quien) {
  await db.exec("reset role");
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
async function probar(db: PGlite, quien: Quien, sql: string): Promise<Fila[] | string> {
  await db.exec("begin");
  try { await entrar(db, quien); const rs = await db.exec(sql); return (rs.at(-1)?.rows ?? []) as Fila[]; }
  catch (e) { return msg(e); }
  finally { await db.exec("rollback"); }
}
const esError = (r: Fila[] | string, re: RegExp) => typeof r === "string" && re.test(r);

// ════ 1. La migración ═════════════════════════════════════════════════════════
const db = await nueva();
check(true, "la migración carga sobre prod");

// ════ 2. Qué se guarda y cómo ═════════════════════════════════════════════════
await como(db, "service_role", `insert into public.creadora_accesos
  (creator_id, tenant_id, of_correo, of_usuario, of_clave_cifrada, of_clave_nonce, of_clave_version, doble_verificacion, actualizado_por, actualizado_desde)
  values ('${C1}', '${T2}', '  Sofi.OF@Gmail.test ', '  sofi_of  ', 'Y2lmcmFkbw==', 'bm9uY2U=', 1, true, '${JHON}', 'importador')`);
{
  const f = await uno(db, `select * from public.creadora_accesos where creator_id = '${C1}'`);
  check(f?.tenant_id === T1, `la agencia sale de la ficha aunque pidan otra (${f?.tenant_id})`);
  check(f?.of_correo === "sofi.of@gmail.test", `el correo, en minúsculas y sin espacios (${f?.of_correo})`);
  check(f?.of_usuario === "sofi_of", `el usuario, sin espacios (${f?.of_usuario})`);
  check(f?.clave_cambiada_en !== null, "con contraseña, la fecha de la contraseña queda puesta");
  const fecha = f?.clave_cambiada_en;

  await db.exec("select pg_sleep(0.01)");
  await como(db, "service_role", `update public.creadora_accesos set doble_verificacion = false, actualizado_desde = 'creadora' where creator_id = '${C1}'`);
  const g = await uno(db, `select clave_cambiada_en, actualizado_en from public.creadora_accesos where creator_id = '${C1}'`);
  check(String(g?.clave_cambiada_en) === String(fecha), "cambiar otra cosa NO mueve la fecha de la contraseña");
  check(new Date(g?.actualizado_en) >= new Date(fecha), "y sí la de actualizado");

  await como(db, "service_role", `update public.creadora_accesos set of_clave_cifrada = 'b3RyYQ==', of_clave_nonce = 'bjI=' where creator_id = '${C1}'`);
  const h = await uno(db, `select clave_cambiada_en from public.creadora_accesos where creator_id = '${C1}'`);
  check(new Date(h?.clave_cambiada_en) > new Date(fecha), "cambiar la contraseña sí la mueve");

  const vacio = await como(db, "service_role", `insert into public.creadora_accesos (creator_id, of_correo, of_usuario) values ('${C2}', '   ', '') returning of_correo, of_usuario, clave_cambiada_en`);
  check(vacio[0]?.of_correo === null && vacio[0]?.of_usuario === null, "un texto vacío queda null");
  check(vacio[0]?.clave_cambiada_en === null, "sin contraseña, sin fecha de contraseña");

  const media = await probar(db, "service_role", `update public.creadora_accesos set of_clave_cifrada = 'eA==' where creator_id = '${C2}'`);
  check(esError(media, /creadora_accesos_clave_completa/), `la contraseña va completa o no va (${String(media).slice(0, 80)})`);
  const desde = await probar(db, "service_role", `update public.creadora_accesos set actualizado_desde = 'otro' where creator_id = '${C2}'`);
  check(esError(desde, /creadora_accesos_desde/), "actualizado_desde, solo equipo / creadora / importador");
  const fantasma = await probar(db, "service_role", `insert into public.creadora_accesos (creator_id) values ('${C(99)}')`);
  check(esError(fantasma, /no existe/), "no hay accesos de una creadora que no existe");
}

// ════ 3. Nadie desde el navegador ════════════════════════════════════════════
for (const [quien, nombre] of [[JHON, "un admin"], [MARIO, "un manager"], [SOFI, "la creadora"], ["anon", "anon"]] as const) {
  const ver = await probar(db, quien, `select of_usuario from public.creadora_accesos`);
  check(esError(ver, /permission denied/), `${nombre} no lee la tabla desde el navegador (${String(ver).slice(0, 60)})`);
  const escribir = await probar(db, quien, `insert into public.creadora_accesos (creator_id, of_usuario) values ('${C2}', 'x')`);
  check(esError(escribir, /permission denied/), `${nombre} no escribe desde el navegador`);
  const eventos = await probar(db, quien, `select * from public.creadora_accesos_eventos`);
  check(esError(eventos, /permission denied/), `${nombre} no lee los eventos desde el navegador`);
  for (const f of ["creadora_accesos_revisar()", "creadora_accesos_eventos_revisar()"]) {
    const r = await uno(db, `select has_function_privilege('${quien === "anon" ? "anon" : "authenticated"}', 'public.${f}', 'execute') p`);
    check(r?.p === false, `${nombre} no ejecuta ${f}`);
  }
}

// ════ 4. Los eventos: solo se agregan ════════════════════════════════════════
{
  const r = await como(db, "service_role", `insert into public.creadora_accesos_eventos (creator_id, tenant_id, user_id, accion, desde, campos)
    values ('${C1}', '${T2}', '${JHON}', 'ver_clave', 'equipo', '{}') returning tenant_id, en`);
  check(r[0]?.tenant_id === T1, `el evento lleva la agencia de la ficha (${r[0]?.tenant_id})`);
  const cambiar = await probar(db, "service_role", `update public.creadora_accesos_eventos set accion = 'guardar'`);
  check(esError(cambiar, /permission denied/), "ni la edge cambia un evento");
  const borrar = await probar(db, "service_role", `delete from public.creadora_accesos_eventos`);
  check(esError(borrar, /permission denied/), "ni la edge borra un evento");
  const rara = await probar(db, "service_role", `insert into public.creadora_accesos_eventos (creator_id, accion, desde) values ('${C1}', 'mirar', 'equipo')`);
  check(esError(rara, /creadora_accesos_eventos_accion/), "la acción, de la lista");
}

// ════ 5. Borrar la ficha borra lo suyo ═══════════════════════════════════════
{
  await db.exec(`delete from public.creators where id = '${C1}'`);
  const a = await uno(db, `select count(*)::int n from public.creadora_accesos where creator_id = '${C1}'`);
  const e = await uno(db, `select count(*)::int n from public.creadora_accesos_eventos where creator_id = '${C1}'`);
  check(a?.n === 0 && e?.n === 0, `borrar la ficha borra sus accesos y sus eventos (${a?.n}, ${e?.n})`);
}

// ════ 6. La vuelta atrás ══════════════════════════════════════════════════════
{
  await aplicar(db, "vuelta atrás", vuelta(M));
  const t = await uno(db, `select to_regclass('public.creadora_accesos') a, to_regclass('public.creadora_accesos_eventos') e`);
  check(t?.a === null && t?.e === null, "la vuelta atrás quita las dos tablas");
  const f = await uno(db, `select count(*)::int n from pg_proc where proname like 'creadora_accesos%'`);
  check(f?.n === 0, `y las funciones (${f?.n})`);
  await aplicar(db, "otra vez", M);
  check(true, "y se puede volver a aplicar");
}

console.log(ok.map((m) => `ok  ${m}`).join("\n"));
if (mal.length) {
  console.error(mal.map((m) => `MAL ${m}`).join("\n"));
  Deno.exit(1);
}
console.log(`\n${ok.length} ok`);
