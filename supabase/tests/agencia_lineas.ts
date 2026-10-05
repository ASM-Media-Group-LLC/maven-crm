// La agencia de cada creadora, por agencia (migración 20261006130000_agencia_lineas),
// probada contra un Postgres de verdad (PGlite) con los fixtures de prod.
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/agencia_lineas.ts
//
//   1. Kash se llama Kash (no ASM Tech) y tiene sus tres líneas, con su compañía y su tier.
//   2. Cada uno ve las de su agencia: la otra agencia, ninguna; nadie las escribe.
//   3. La vuelta atrás deja todo como estaba y se puede volver a aplicar.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FX_ROLES = leer("./fixtures/prod_roles_20261001.sql");
const FX = leer("./fixtures/prod_creadoras_20261005.sql");
const ANTES = ["20261001210000_agencias_base.sql", "20261001211000_roles_por_agencia.sql", "20261001212000_personas_por_agencia.sql"]
  .map((n) => ({ n, sql: leer(`../migrations/${n}`) }));
const N = "20261006130000_agencia_lineas.sql";
const M = leer(`../migrations/${N}`);
const vuelta = (sql: string) => sql.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);
const json = (x: unknown) => JSON.stringify(x);

const T1 = "10000000-0000-4000-8000-000000000001", T2 = "10000000-0000-4000-8000-000000000002";
const JHON = "a0000000-0000-4000-8000-000000000001", OLGA = "a0000000-0000-4000-8000-000000000011";
const [KASH, ATOMICK, UNLOK, AJENA] = ["b1", "b2", "b3", "b4"].map((x) => `${x}000000-0000-4000-8000-000000000000`);

const SEMILLA = `
insert into public.tenants(id, slug, name) values ('${T1}', 'asm-tech', 'ASM Tech');
insert into public.roles_config (name, is_system, level) values ('admin', true, 100), ('employee', true, 20),
  ('Chatter', false, 20), ('Chatter Supervisor', false, 55), ('Supervisor sin creadoras', false, 50), ('manager', true, 70), ('supervisor', true, 50), ('closer', true, 20);
update public.role_groups set is_admin = true, is_manager_or_above = true, is_supervisor_or_above = true where role_name = 'admin';
insert into auth.users(id, email, raw_user_meta_data) values ('${JHON}', 'jhon@x.test', '{"full_name":"Jhon"}');
update public.user_roles set role = 'admin' where user_id = '${JHON}';
-- scouter_companies tal como está en prod (lo que usa esta migración).
create table public.scouter_companies (id uuid primary key, slug text, name text not null, tenant_id uuid);
grant select on public.scouter_companies to authenticated;
insert into public.scouter_companies (id, slug, name, tenant_id) values
  ('${KASH}', 'kash', 'Kash', '${T1}'), ('${ATOMICK}', 'atomick', 'Atomick', '${T1}'), ('${UNLOK}', 'unlok', 'Unlok', '${T1}');
`;
const OTRA = `
insert into public.tenants(id, slug, name) values ('${T2}', 'otra', 'Otra agencia');
select public.sembrar_roles_de_agencia('${T2}', 'agency', '${T1}');
insert into auth.users(id, email, raw_user_meta_data) values ('${OLGA}', 'olga@otra.test', '{"full_name":"Olga"}');
insert into public.tenant_members(user_id, tenant_id) values ('${OLGA}', '${T2}');
update public.user_roles set role = 'admin' where user_id = '${OLGA}';
-- La otra agencia también tiene una compañía «Kash» en su directorio: la línea no la toma.
insert into public.scouter_companies (id, slug, name, tenant_id) values ('${AJENA}', 'kash', 'Kash', '${T2}');
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}
async function nueva(conMigracion: boolean): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FX_ROLES);
  await db.exec(FX);
  await db.exec(SEMILLA);
  for (const m of ANTES) await aplicar(db, m.n, m.sql);
  await db.exec(OTRA);
  if (conMigracion) await aplicar(db, N, M);
  return db;
}
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as Fila[];
async function probar(db: PGlite, quien: string, sql: string): Promise<Fila[] | string> {
  await db.exec("begin");
  try {
    await db.exec("reset role");
    const servicio = quien === "service_role" || quien === "anon";
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(servicio ? { role: quien } : { sub: quien, role: "authenticated" })]);
    await db.exec(`set local role ${servicio ? quien : "authenticated"}`);
    const rs = await db.exec(sql);
    return (rs.at(-1)?.rows ?? []) as Fila[];
  } catch (e) { return msg(e); } finally { await db.exec("rollback"); }
}

// ════ 1. Kash y sus líneas ═══════════════════════════════════════════════════
const con = await nueva(true);
{
  const t = await q(con, `select slug, name from public.tenants order by slug`);
  check(json(t) === json([{ slug: "asm-tech", name: "Kash" }, { slug: "otra", name: "Otra agencia" }]), `la agencia se llama Kash (el slug no cambia), la otra queda igual (${json(t)})`);
  const l = await q(con, `select nombre, orden, company_id, kash_type, alias, tenant_id from public.agencia_lineas order by orden`);
  check(json(l.map((x) => x.nombre)) === json(["Kash Plus", "Kash Massive", "Atomick"]), `las tres líneas, en orden (${json(l.map((x) => x.nombre))})`);
  check(l[0].company_id === KASH && l[1].company_id === KASH && l[2].company_id === ATOMICK, "cada una con la compañía de SU agencia (no la Kash de la otra)");
  check(l[0].kash_type === "Plus" && l[1].kash_type === "Massive" && l[2].kash_type === null, "los tiers de Kash");
  check(json(l[2].alias) === json(["Atomic Agency", "Unlok", "Unlok Platform"]), "Atomick absorbe los nombres viejos (Unlok, Atomic Agency)");
  check(l.every((x) => x.tenant_id === T1), "todas de Kash");
}

// ════ 2. Quién las ve ═══════════════════════════════════════════════════════
{
  const deJhon = await probar(con, JHON, `select nombre from public.agencia_lineas order by orden`);
  const deOlga = await probar(con, OLGA, `select nombre from public.agencia_lineas`);
  const anon = await probar(con, "anon", `select nombre from public.agencia_lineas`);
  check(Array.isArray(deJhon) && deJhon.length === 3, "alguien de Kash ve sus tres líneas");
  check(Array.isArray(deOlga) && deOlga.length === 0, "la otra agencia, ninguna (ve su nombre fijo)");
  check(typeof anon === "string" && /permission denied/.test(anon), "anon, nada");
  const escribe = await probar(con, JHON, `insert into public.agencia_lineas (tenant_id, nombre) values ('${T1}', 'Inventada')`);
  const borra = await probar(con, JHON, `delete from public.agencia_lineas returning 1`);
  check(typeof escribe === "string" && /permission denied/.test(escribe) && typeof borra === "string" && /permission denied/.test(borra),
    "nadie las escribe ni las borra desde el navegador, ni siendo admin");
  const nombre = await probar(con, OLGA, `select name from public.tenants`);
  check(Array.isArray(nombre) && json(nombre) === json([{ name: "Otra agencia" }]), "cada agencia lee su propio nombre (el que ve fijo en el formulario)");
}

// ════ 3. La vuelta atrás ══════════════════════════════════════════════════════
{
  const db = await nueva(true);
  let r = "anduvo";
  try { await aplicar(db, "vuelta atrás", vuelta(M)); } catch (e) { r = msg(e); }
  check(r === "anduvo", `la vuelta atrás corre (${r.slice(0, 80)})`);
  const quedan = (await q(db, `select to_regclass('public.agencia_lineas') t, (select name from public.tenants where slug = 'asm-tech') n`))[0];
  check(quedan?.t === null && quedan?.n === "ASM Tech", `y deja todo como estaba (${json(quedan)})`);
  let r2 = "anduvo";
  try { await aplicar(db, N, M); } catch (e) { r2 = msg(e); }
  check(r2 === "anduvo", "y se puede volver a aplicar");
}

for (const m of ok) console.log(`✓ ${m}`);
for (const m of mal) console.log(`✗ ${m}`);
console.log(`\n${ok.length} ok${mal.length ? `, ${mal.length} MAL` : ""}`);
if (mal.length) Deno.exit(1);
