// Drive: quién mandó cada cosa a la papelera y el tamaño de una carpeta
// (migración 20261003140000_drive_papelera_y_detalles.sql), probado contra un
// Postgres de verdad (PGlite).
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/drive_papelera_y_detalles.ts
//
// El esquema del Drive sale de las MIGRACIONES del repo, no de una copia: la
// tabla, las políticas y el trigger de 20260928200000_oficina_drive.sql,
// drive_items_cuidar como la dejó 20261002130000_drive_unidades.sql y
// drive_mi_rol con lo abierto a la agencia (20261002160000_drive_compartido_agencia.sql,
// entera, con su guarda de huella). auth.uid(), auth.role() y
// current_tenant_id() se leen de los claims, como en Supabase.
//
// Lo que se prueba:
//   1. La papelera: quien tira queda anotado; restaurar lo borra; nadie lo
//      escribe a mano (y escribirlo no cambia «Última modificación»); lo tirado
//      antes de la migración queda con null y se sigue viendo.
//   2. Lo que se ve en la papelera es lo que la RLS deja ver: lo importado (sin
//      dueño) lo ven quienes tienen la carpeta; nadie de afuera ni de otra agencia.
//   3. drive_tamano_carpeta (Detalles) y drive_tamanos (la columna Tamaño, de a
//      tandas): suman bien, no cuentan papelera ni subidas a medias, solo con
//      acceso, se cortan en 60 niveles, anon no las puede llamar y la cuenta
//      interna (que no mira permisos) no la puede llamar nadie de afuera.
//   4. La vuelta atrás (líneas «--|») deja la tabla como estaba y se puede volver
//      a aplicar.
//
// Con `--medir` además carga la forma de prod (~908.000 fichas: 97 unidades, la
// más grande con 140.000 archivos en 2.800 carpetas) y mide cuánto tardan
// (tarda ~20 s en cargar; por eso no corre en cada PR):
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/drive_papelera_y_detalles.ts --medir
//
// Sale con código 1 si algo falla.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const BASE = leer("../migrations/20260928200000_oficina_drive.sql");
const UNIDADES = leer("../migrations/20261002130000_drive_unidades.sql");
const AGENCIA = leer("../migrations/20261002160000_drive_compartido_agencia.sql");
const NOMBRE = "20261003140000_drive_papelera_y_detalles.sql";
const MIG = leer(`../migrations/${NOMBRE}`);
const VUELTA = MIG.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");

/** drive_items_cuidar como quedó en prod (la última que la define). */
function cuidarDeUnidades(): string {
  const a = UNIDADES.indexOf("CREATE OR REPLACE FUNCTION public.drive_items_cuidar()");
  const b = UNIDADES.indexOf("END; $function$;", a);
  if (a < 0 || b < 0) throw new Error("no encontré drive_items_cuidar en drive_unidades.sql");
  return UNIDADES.slice(a, b + "END; $function$;".length);
}

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);

// ─── Gente, agencias y fichas ────────────────────────────────────────────────
const T1 = "10000000-0000-4000-8000-000000000001";
const T2 = "10000000-0000-4000-8000-000000000002";
const P = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [JHON, ANA, LEO, PEPE, OLGA] = [1, 2, 3, 4, 11].map(P); // dueño de lo suyo, editora, lector, sin acceso, otra agencia
const I = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U = I(1), F1 = I(2), SUB = I(3), F2 = I(4), F3 = I(5), VIEJO = I(6), BASURA = I(7), EN_BASURA = I(8);
const HONDA = I(9), F_HONDO = I(10), A_MEDIAS = I(11), MIA = I(20), F_MIA = I(21), AJENA = I(30);

const ESQUEMA = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Los privilegios por defecto de Supabase: cada tabla nueva para los tres roles.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;
create function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')) $$;
create table public.tenants (id uuid primary key, name text);
create table public.tenant_members (user_id uuid references auth.users(id), tenant_id uuid references public.tenants(id), primary key (user_id, tenant_id));
create function public.current_tenant_id() returns uuid language sql stable security definer set search_path = public as $$
  select m.tenant_id from public.tenant_members m where m.user_id = auth.uid() limit 1 $$;
insert into public.tenants values ('${T1}', 'KASH'), ('${T2}', 'Otra');
insert into auth.users values ('${JHON}', 'jhon@x.test'), ('${ANA}', 'ana@x.test'), ('${LEO}', 'leo@x.test'),
  ('${PEPE}', 'pepe@x.test'), ('${OLGA}', 'olga@otra.test');
insert into public.tenant_members values ('${JHON}', '${T1}'), ('${ANA}', '${T1}'), ('${LEO}', '${T1}'), ('${PEPE}', '${T1}'), ('${OLGA}', '${T2}');
`;

// Lo importado de Google no tiene dueño (owner_id null). Se carga como postgres
// (sin claims): el trigger cuidar lo deja pasar como a la edge.
const DATOS = `
insert into public.drive_items (id, tenant_id, owner_id, parent_id, tipo, nombre, size, storage_key) values
  ('${U}',  '${T1}', null, null,     'carpeta', 'Marketing', null, null),
  ('${F1}', '${T1}', null, '${U}',   'archivo', 'Plan.docx', 100, 'k1'),
  ('${SUB}','${T1}', null, '${U}',   'carpeta', '2026', null, null),
  ('${F2}', '${T1}', null, '${SUB}', 'archivo', 'Enero.xlsx', 200, 'k2'),
  ('${F3}', '${T1}', null, '${SUB}', 'archivo', 'Febrero.xlsx', 300, 'k3'),
  ('${VIEJO}', '${T1}', null, '${SUB}', 'archivo', 'Viejo.pdf', 1000, 'k4'),
  ('${BASURA}', '${T1}', null, '${SUB}', 'carpeta', 'Basura', null, null),
  ('${EN_BASURA}', '${T1}', null, '${BASURA}', 'archivo', 'Adentro.mp4', 5000, 'k5'),
  ('${MIA}', '${T1}', '${JHON}', null, 'carpeta', 'Contabilidad', null, null),
  ('${F_MIA}', '${T1}', '${JHON}', '${MIA}', 'archivo', 'Balance.pdf', 10, 'k6'),
  ('${AJENA}', '${T2}', '${OLGA}', null, 'carpeta', 'De otra agencia', null, null);
insert into public.drive_items (id, tenant_id, owner_id, parent_id, tipo, nombre, size, storage_key, estado) values
  ('${A_MEDIAS}', '${T1}', '${ANA}', '${SUB}', 'archivo', 'Subiendo.mov', 7000, 'k7', 'subiendo');
-- Tres niveles más abajo: 2026 › Q1 › Q2 › Q3 › Hondo.txt (50 bytes).
insert into public.drive_items (id, tenant_id, owner_id, parent_id, tipo, nombre) values
  ('${I(40)}', '${T1}', null, '${SUB}', 'carpeta', 'Q1'),
  ('${I(41)}', '${T1}', null, '${I(40)}', 'carpeta', 'Q2'),
  ('${HONDA}', '${T1}', null, '${I(41)}', 'carpeta', 'Q3');
insert into public.drive_items (id, tenant_id, owner_id, parent_id, tipo, nombre, size, storage_key) values
  ('${F_HONDO}', '${T1}', null, '${HONDA}', 'archivo', 'Hondo.txt', 50, 'k8');
-- La unidad: Ana editora, Leo lector. Pepe no tiene nada.
insert into public.drive_shares (item_id, user_id, rol) values ('${U}', '${ANA}', 'editor'), ('${U}', '${LEO}', 'lector');
-- Antes de la migración: alguien ya tiró Viejo.pdf y la carpeta Basura.
update public.drive_items set trashed_at = now() - interval '2 days' where id in ('${VIEJO}', '${BASURA}');
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}

async function nueva(conMigracion: boolean): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(ESQUEMA);
  await aplicar(db, "oficina_drive", BASE);
  await aplicar(db, "unidad_id + drive_items_cuidar de drive_unidades",
    "ALTER TABLE public.drive_items ADD COLUMN unidad_id uuid;\n" + cuidarDeUnidades());
  await aplicar(db, "drive_compartido_agencia", AGENCIA);
  await db.exec(DATOS);
  if (conMigracion) await aplicar(db, NOMBRE, MIG);
  return db;
}

// Un pedido como lo manda PostgREST: una transacción, el rol y los claims del JWT.
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
async function error(db: PGlite, quien: Quien, sql: string): Promise<string> {
  try { await como(db, quien, sql); return "anduvo"; } catch (e) { return msg(e); }
}
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as Fila[];
const ficha = async (db: PGlite, id: string) => (await q(db, `select * from public.drive_items where id = '${id}'`))[0];

// ─── 0. La base de partida es la de prod ─────────────────────────────────────
{
  const db = await nueva(false);
  const cols = await q(db, `select column_name from information_schema.columns where table_name = 'drive_items' and column_name = 'trashed_by'`);
  check(cols.length === 0, "línea base: drive_items todavía no tiene trashed_by");
  // La papelera de antes (owner_id = yo) no le mostraba a Ana lo importado que ya estaba tirado.
  const antes = await como(db, ANA, `select id from public.drive_items where owner_id = auth.uid() and trashed_at is not null`);
  check(antes.length === 0, "línea base: con «owner_id = yo», Ana no ve nada de lo importado en la papelera");
  await db.close();
}

const db = await nueva(true);

// ─── 1. La migración quedó como se pensó ─────────────────────────────────────
{
  const triggers = (await q(db, `select tgname from pg_trigger where tgrelid = 'public.drive_items'::regclass and not tgisinternal order by tgname`))
    .map((r) => r.tgname as string);
  const i = triggers.indexOf("drive_items_borrado_por"), j = triggers.indexOf("drive_items_cuidar");
  check(i >= 0 && j >= 0 && i < j, `drive_items_borrado_por corre ANTES que drive_items_cuidar (orden: ${triggers.join(", ")})`);
  for (const fn of ["drive_tamano_carpeta(uuid)", "drive_tamanos(uuid[])"]) {
    const priv = (await q(db, `select has_function_privilege('anon', 'public.${fn}', 'EXECUTE') as anon,
      has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE') as auth`))[0];
    check(priv.anon === false && priv.auth === true, `${fn}: anon no, authenticated sí`);
  }
  const interna = (await q(db, `select has_function_privilege('anon', 'public.drive_sumar_carpeta(uuid, uuid, timestamptz)', 'EXECUTE') as anon,
    has_function_privilege('authenticated', 'public.drive_sumar_carpeta(uuid, uuid, timestamptz)', 'EXECUTE') as auth`))[0];
  check(interna.anon === false && interna.auth === false, "drive_sumar_carpeta (no mira permisos): ni anon ni authenticated");
  const defs = await q(db, `select proname, prosecdef from pg_proc where proname in ('drive_tamano_carpeta', 'drive_tamanos', 'drive_sumar_carpeta') order by proname`);
  check(defs.map((d) => `${d.proname}:${d.prosecdef}`).join(",") === "drive_sumar_carpeta:false,drive_tamano_carpeta:true,drive_tamanos:true",
    `las dos públicas son SECURITY DEFINER y la interna no (${defs.map((d) => `${d.proname}:${d.prosecdef}`).join(", ")})`);
}

// ─── 2. Quién lo tiró ────────────────────────────────────────────────────────
{
  const viejo = await ficha(db, VIEJO);
  check(viejo.trashed_at !== null && viejo.trashed_by === null, "lo tirado antes de la migración queda en la papelera con trashed_by null");

  await como(db, ANA, `update public.drive_items set trashed_at = now() where id = '${F1}'`);
  let f1 = await ficha(db, F1);
  check(f1.trashed_at !== null && f1.trashed_by === ANA, "Ana (editora) tira Plan.docx (sin dueño) y queda anotada");

  await como(db, ANA, `update public.drive_items set trashed_by = '${JHON}' where id = '${F1}'`);
  f1 = await ficha(db, F1);
  check(f1.trashed_by === ANA, "en la papelera, trashed_by no se puede reescribir a mano");

  const f2antes = await ficha(db, F2);
  await como(db, ANA, `update public.drive_items set trashed_by = '${JHON}' where id = '${F2}'`);
  const f2 = await ficha(db, F2);
  check(f2.trashed_by === null, "fuera de la papelera, trashed_by sigue en null aunque se escriba");
  check(String(f2.updated_at) === String(f2antes.updated_at), "escribir trashed_by a mano no cambia «Última modificación»");

  await como(db, ANA, `update public.drive_items set nombre = 'Plan final.docx' where id = '${F1}'`);
  f1 = await ficha(db, F1);
  check(f1.trashed_by === ANA && f1.nombre === "Plan final.docx", "renombrar en la papelera no borra quién la tiró");

  // Leo es lector: ve la papelera de la unidad pero no puede restaurar.
  const leoVe = await como(db, LEO, `select id, trashed_by from public.drive_items where trashed_at is not null order by id`);
  check(leoVe.some((r) => r.id === F1 && r.trashed_by === ANA), "Leo (lector) ve en la papelera lo que tiró Ana, con quién fue");
  await como(db, LEO, `update public.drive_items set trashed_at = null where id = '${F1}'`);
  check((await ficha(db, F1)).trashed_at !== null, "Leo (lector) no puede restaurar: la RLS no lo deja (cero filas)");

  // Ana restaura: se borra quién lo tiró.
  await como(db, ANA, `update public.drive_items set trashed_at = null where id = '${F1}'`);
  f1 = await ficha(db, F1);
  check(f1.trashed_at === null && f1.trashed_by === null, "al restaurar, trashed_by vuelve a null");

  // Jhon tira lo suyo.
  await como(db, JHON, `update public.drive_items set trashed_at = now() where id = '${F_MIA}'`);
  check((await ficha(db, F_MIA)).trashed_by === JHON, "Jhon tira lo suyo y queda anotado");

  // La edge (service_role, sin auth.uid()) puede decir quién fue.
  await como(db, "service_role", `update public.drive_items set trashed_at = now(), trashed_by = '${LEO}' where id = '${F3}'`);
  check((await ficha(db, F3)).trashed_by === LEO, "service_role puede decir quién lo tiró");
  await como(db, "service_role", `update public.drive_items set trashed_at = null where id = '${F3}'`);
  check((await ficha(db, F3)).trashed_by === null, "y al restaurar desde la edge también se borra");
}

// ─── 3. Qué ve cada uno en la papelera (la RLS) ──────────────────────────────
{
  const papelera = async (quien: string) =>
    (await como(db, quien, `select id from public.drive_items where trashed_at is not null order by trashed_at desc`)).map((r) => r.id as string);
  const ana = await papelera(ANA);
  check(ana.includes(VIEJO) && ana.includes(BASURA), "Ana ve lo importado que ya estaba tirado (sin dueño, sin trashed_by)");
  check(!ana.includes(F_MIA), "Ana no ve lo que Jhon tiró en SU unidad");
  const jhon = await papelera(JHON);
  check(jhon.includes(F_MIA) && !jhon.includes(VIEJO), "Jhon ve lo suyo y no lo de una unidad a la que no tiene acceso");
  check((await papelera(PEPE)).length === 0, "Pepe (sin acceso a nada) no ve nada");
  check((await papelera(OLGA)).length === 0, "Olga (otra agencia) no ve nada");
  check((await como(db, ANA, `select id from public.drive_items where trashed_at is not null and parent_id = '${BASURA}'`)).length === 0,
    "lo de adentro de una carpeta tirada no está marcado: la papelera muestra solo la carpeta");
}

// ─── 4. Cuánto ocupa una carpeta ─────────────────────────────────────────────
{
  const tamano = async (quien: string, id: string) =>
    (await como(db, quien, `select * from public.drive_tamano_carpeta('${id}')`))[0];
  // Marketing: Plan (100) + Enero (200) + Febrero (300) + Hondo (50). No cuenta
  // Viejo.pdf (papelera), lo de adentro de Basura (carpeta tirada) ni Subiendo.mov.
  const u = await tamano(ANA, U);
  check(Number(u.bytes) === 650 && Number(u.archivos) === 4 && u.completo === true,
    `Marketing: 650 bytes en 4 archivos, completo (dio ${u.bytes} / ${u.archivos} / ${u.completo})`);
  check(Number(u.carpetas) === 4, `Marketing: 4 carpetas adentro, sin la tirada (dio ${u.carpetas})`);
  const leo = await tamano(LEO, SUB);
  check(Number(leo.bytes) === 550 && Number(leo.archivos) === 3, `Leo (lector) también puede: 2026 = 550 bytes, 3 archivos (dio ${leo.bytes} / ${leo.archivos})`);
  const tirada = await tamano(ANA, BASURA);
  check(Number(tirada.bytes) === 5000, "una carpeta en la papelera se puede medir (lo de adentro no está marcado)");

  check(/No tienes acceso/.test(await error(db, PEPE, `select * from public.drive_tamano_carpeta('${U}')`)), "Pepe (sin acceso): No tienes acceso");
  check(/No tienes acceso/.test(await error(db, OLGA, `select * from public.drive_tamano_carpeta('${U}')`)), "Olga (otra agencia): No tienes acceso");
  check(/No tienes acceso/.test(await error(db, ANA, `select * from public.drive_tamano_carpeta('${AJENA}')`)), "una carpeta de otra agencia: No tienes acceso");
  check(/permission denied/.test(await error(db, "anon", `select * from public.drive_tamano_carpeta('${U}')`)), "anon no la puede llamar");
  check(/No es una carpeta/.test(await error(db, ANA, `select * from public.drive_tamano_carpeta('${F2}')`)), "un archivo: No es una carpeta");
  check(/permission denied/.test(await error(db, ANA, `select * from public.drive_sumar_carpeta('${U}', '${T1}', now() + interval '1 minute')`)),
    "la cuenta interna no se puede llamar desde el navegador (se saltaría el permiso)");

  // La lista: de a tandas, en el orden pedido; lo que no se ve (o no es una
  // carpeta) no vuelve, sin error.
  const tanda = async (quien: string, ids: string[]) =>
    await como(db, quien, `select * from public.drive_tamanos(array[${ids.map((i) => `'${i}'::uuid`).join(",")}])`);
  const deAna = await tanda(ANA, [SUB, U, F2, AJENA, MIA, BASURA]);
  check(deAna.map((r) => r.item_id).join(",") === [SUB, U, BASURA].join(","),
    `Ana: vuelven 2026, Marketing y Basura, en ese orden; no el archivo, ni lo de otra agencia, ni la carpeta de Jhon (dio ${deAna.length})`);
  const marketing = deAna.find((r) => r.item_id === U);
  check(Number(marketing?.bytes) === 650 && Number(marketing?.archivos) === 4 && marketing?.completo === true,
    "la tanda da lo mismo que el panel de Detalles para Marketing");
  check((await tanda(PEPE, [U, SUB, MIA])).length === 0, "Pepe (sin acceso): la tanda vuelve vacía, sin error");
  check((await tanda(OLGA, [U, SUB])).length === 0, "Olga (otra agencia): la tanda vuelve vacía");
  check((await tanda(JHON, [MIA, U])).map((r) => r.item_id).join(",") === MIA, "Jhon: solo su carpeta");
  const muchas = Array.from({ length: 101 }, (_, n) => I(500 + n));
  check(/de a 100/.test(await error(db, ANA, `select * from public.drive_tamanos(array[${muchas.map((i) => `'${i}'::uuid`).join(",")}])`)),
    "más de 100 carpetas por llamada: error");
  check(/permission denied/.test(await error(db, "anon", `select * from public.drive_tamanos(array['${U}'::uuid])`)), "anon no puede pedir la tanda");

  // 65 niveles de carpetas: se corta a los 60 y lo dice.
  let madre = MIA;
  const filas: string[] = [];
  for (let n = 0; n < 65; n++) {
    const id = I(100 + n);
    filas.push(`('${id}', '${T1}', '${JHON}', '${madre}', 'carpeta', 'N${n}')`);
    madre = id;
  }
  await db.exec(`insert into public.drive_items (id, tenant_id, owner_id, parent_id, tipo, nombre) values ${filas.join(",\n")}`);
  const hondo = await tamano(JHON, MIA);
  check(hondo.completo === false && Number(hondo.carpetas) === 60, `65 niveles: se corta en 60 y avisa (dio ${hondo.carpetas} / ${hondo.completo})`);
  const hondoEnTanda = (await tanda(JHON, [MIA]))[0];
  check(hondoEnTanda?.completo === false, "en la tanda también se corta en 60 niveles y lo dice");
}

// ─── 5. La vuelta atrás ──────────────────────────────────────────────────────
{
  await aplicar(db, "vuelta atrás", VUELTA);
  const cols = await q(db, `select column_name from information_schema.columns where table_name = 'drive_items' and column_name = 'trashed_by'`);
  const fn = await q(db, `select proname from pg_proc where proname in ('drive_tamano_carpeta', 'drive_tamanos', 'drive_sumar_carpeta', 'drive_items_borrado_por')`);
  const tg = await q(db, `select tgname from pg_trigger where tgname = 'drive_items_borrado_por'`);
  check(cols.length === 0 && fn.length === 0 && tg.length === 0, "la vuelta atrás saca la columna, las cuatro funciones y el trigger");
  await como(db, ANA, `update public.drive_items set trashed_at = now() where id = '${F2}'`);
  check((await ficha(db, F2)).trashed_at !== null, "sin la migración, mandar a la papelera sigue andando");
  try {
    await aplicar(db, `${NOMBRE} (otra vez)`, MIG);
    check(true, "se puede volver a aplicar después de la vuelta atrás");
  } catch (e) {
    check(false, `no se pudo volver a aplicar: ${msg(e)}`);
  }
}

await db.close();

// ─── 6. (--medir) Cuánto tarda con la forma de prod ──────────────────────────
if (Deno.args.includes("--medir")) {
  const grande = await nueva(true);
  let t0 = performance.now();
  await grande.exec(`
    create table plan as select k, case when k = 1 then 140000 when k <= 6 then 50000 else 5500 end as n from generate_series(1, 97) k;
    insert into public.drive_items (id, tenant_id, owner_id, parent_id, tipo, nombre)
    select md5('u'||k||'-'||j)::uuid, '${T1}', null,
      case when j = 0 then null else md5('u'||k||'-'||(j/10))::uuid end, 'carpeta', 'c'||j
    from plan, generate_series(0, greatest(n/50, 1)) j;
    insert into public.drive_items (tenant_id, owner_id, parent_id, tipo, nombre, size, storage_key)
    select '${T1}', null, md5('u'||k||'-'||(f % (greatest(n/50, 1) + 1)))::uuid, 'archivo', 'f'||f, 1000 + f % 7, 'k'||k||'-'||f
    from plan, generate_series(1, n) f;
    insert into public.drive_shares (item_id, user_id, rol) select md5('u'||k||'-0')::uuid, '${ANA}', 'editor' from plan;
    analyze public.drive_items;
  `);
  const filas = (await q(grande, "select count(*) as n from public.drive_items"))[0].n;
  console.log(`\n  medir: ${filas} fichas cargadas en ${Math.round(performance.now() - t0)} ms`);
  const medir = async (nombre: string, sql: string) => {
    t0 = performance.now();
    const r = await como(grande, ANA, sql);
    console.log(`  medir: ${nombre}: ${r.length} fila(s) en ${Math.round(performance.now() - t0)} ms`);
  };
  await medir("Detalles de la unidad de 140.000 archivos", `select * from public.drive_tamano_carpeta(md5('u1-0')::uuid)`);
  await medir("tanda con la unidad de 140.000 archivos", `select * from public.drive_tamanos(array[md5('u1-0')::uuid])`);
  await medir("tanda con las 97 unidades (toda la tabla)", `select * from public.drive_tamanos(array(select md5('u'||k||'-0')::uuid from plan order by k))`);
  await medir("tanda con 100 subcarpetas de la grande", `select * from public.drive_tamanos(array(select md5('u1-'||j)::uuid from generate_series(1, 100) j))`);
  await grande.close();
}

for (const m of ok) console.log(`  ✓ ${m}`);
for (const m of mal) console.log(`  ✗ ${m}`);
console.log(`\n${ok.length} bien, ${mal.length} mal`);
if (mal.length) Deno.exit(1);
