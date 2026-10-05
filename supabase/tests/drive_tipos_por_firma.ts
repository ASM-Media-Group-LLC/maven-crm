// El tipo real de los archivos sin extensión (migración 20261006150000_drive_tipos_por_firma),
// probado contra un Postgres de verdad (PGlite), con el drive_items_cuidar de prod.
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/drive_tipos_por_firma.ts
//
//   1. drive_sin_tipo devuelve SOLO los archivos listos, sin extensión y con un tipo genérico, por páginas.
//   2. drive_corregir_tipos les pone el tipo SIN cambiar la fecha (nadie ve «modificado hoy»),
//      solo si siguen genéricos y solo tipos de la lista.
//   3. Solo service_role: ni el navegador (authenticated) ni anon.
//   4. La vuelta atrás corre y se puede volver a aplicar.
import { PGlite } from "npm:@electric-sql/pglite@0.3";
import { pg_trgm } from "npm:@electric-sql/pglite@0.3/contrib/pg_trgm";
import { unaccent } from "npm:@electric-sql/pglite@0.3/contrib/unaccent";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const BASE = leer("../migrations/20260928200000_oficina_drive.sql");
const UNIDADES = leer("../migrations/20261002130000_drive_unidades.sql");
const FECHA = leer("../migrations/20261003170000_drive_papelera_no_cambia_la_fecha.sql");
const N = "20261006150000_drive_tipos_por_firma.sql";
const M = leer(`../migrations/${N}`);
const vuelta = (sql: string) => sql.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");
const sinVuelta = (sql: string) => sql.split("\n").filter((l) => !l.startsWith("--|")).join("\n");

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
const json = (x: unknown) => JSON.stringify(x);

const T1 = "10000000-0000-4000-8000-000000000001";
const JHON = "a0000000-0000-4000-8000-000000000001";
const I = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [CARPETA, HUBSTAFF, CON_EXT, YA_VIDEO, SUBIENDO, GRABACION, SIN_MIME] = [1, 2, 3, 4, 5, 6, 7].map(I);

const ESQUEMA = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema extensions;
create extension pg_trgm schema public;
create extension unaccent schema extensions;
grant usage on schema auth, extensions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
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
insert into public.tenants values ('${T1}', 'KASH');
insert into auth.users values ('${JHON}', 'jhon@x.test');
insert into public.tenant_members values ('${JHON}', '${T1}');
create table public.drive_unidades (item_id uuid primary key, tenant_id uuid not null, tipo text not null, persona uuid);
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}
async function nueva(conMigracion: boolean): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm, unaccent } });
  await db.exec(ESQUEMA);
  await aplicar(db, "oficina_drive", BASE);
  await aplicar(db, "unidad_id + drive_items_cuidar", "ALTER TABLE public.drive_items ADD COLUMN unidad_id uuid;\n" + cuidarDeUnidades());
  await aplicar(db, "drive_papelera_no_cambia_la_fecha", sinVuelta(FECHA));
  // Las fichas como las dejó el importador (sin dueño; fechas viejas).
  await db.exec(`
    insert into public.drive_items (id, tenant_id, owner_id, parent_id, tipo, nombre, mime, size, storage_key, estado, updated_at) values
      ('${CARPETA}', '${T1}', null, null, 'carpeta', 'ENTREGA DE CARGO', null, null, null, 'listo', '2026-09-04T16:05:00Z'),
      ('${HUBSTAFF}', '${T1}', null, '${CARPETA}', 'archivo', 'EXPLICACIÓN DE HUBSTAFF', 'application/octet-stream', 144495654, '${T1}/google/${HUBSTAFF}', 'listo', '2026-08-28T10:00:00Z'),
      ('${CON_EXT}', '${T1}', null, '${CARPETA}', 'archivo', 'reel.mp4', 'application/octet-stream', 10, '${T1}/google/${CON_EXT}', 'listo', '2026-08-28T10:00:00Z'),
      ('${YA_VIDEO}', '${T1}', null, '${CARPETA}', 'archivo', 'Grabación vieja', 'video/mp4', 10, '${T1}/google/${YA_VIDEO}', 'listo', '2026-08-28T10:00:00Z'),
      ('${SUBIENDO}', '${T1}', '${JHON}', '${CARPETA}', 'archivo', 'Subiendo', 'application/octet-stream', 10, '${T1}/${SUBIENDO}', 'subiendo', '2026-08-28T10:00:00Z'),
      ('${GRABACION}', '${T1}', null, '${CARPETA}', 'archivo', 'Contratación - 2026／09／04 11:05 GMT-05:00 - Recording', 'application/octet-stream', 10, '${T1}/google/${GRABACION}', 'listo', '2026-09-04T16:05:00Z'),
      ('${SIN_MIME}', '${T1}', null, '${CARPETA}', 'archivo', 'DOCUMENTOS CONTRATACIÓN', null, 10, '${T1}/google/${SIN_MIME}', 'listo', '2026-09-04T16:05:00Z');
  `);
  if (conMigracion) await aplicar(db, N, M);
  return db;
}
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as Fila[];
async function como(db: PGlite, quien: "service_role" | "authenticated" | "anon", sql: string): Promise<Fila[] | string> {
  await db.exec("begin");
  try {
    await db.exec("reset role");
    const claims = quien === "authenticated" ? { sub: JHON, role: "authenticated" } : { role: quien };
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await db.exec(`set local role ${quien}`);
    const rs = await db.exec(sql);
    await db.exec("commit");
    return (rs.at(-1)?.rows ?? []) as Fila[];
  } catch (e) {
    await db.exec("rollback").catch(() => {});
    return msg(e);
  }
}

// ════ 1. Los que faltan ═════════════════════════════════════════════════════
const db = await nueva(true);
{
  const r = await como(db, "service_role", `select id from public.drive_sin_tipo(null, 1000)`);
  const ids = Array.isArray(r) ? r.map((x) => x.id).sort() : r;
  check(json(ids) === json([HUBSTAFF, GRABACION, SIN_MIME].sort()),
    `solo los listos, sin extensión y con tipo genérico o vacío (no «reel.mp4», no el que ya es video, no el que sube, no la carpeta): ${json(ids)}`);
  const p1 = await como(db, "service_role", `select id from public.drive_sin_tipo(null, 1)`);
  const p2 = Array.isArray(p1) ? await como(db, "service_role", `select id from public.drive_sin_tipo('${p1[0].id}', 1000)`) : p1;
  check(Array.isArray(p1) && p1.length === 1 && Array.isArray(p2) && p2.length === 2 && !p2.some((x) => x.id === p1[0].id), "por páginas: lo de después del último");
}

// ════ 2. Corregir sin tocar la fecha ═══════════════════════════════════════
{
  const antes = (await q(db, `select updated_at::text u from public.drive_items where id = '${HUBSTAFF}'`))[0].u;
  const r = await como(db, "service_role", `select public.drive_corregir_tipos(array['${HUBSTAFF}', '${YA_VIDEO}', '${CON_EXT}']::uuid[], 'video/mp4') n`);
  check(Array.isArray(r) && r[0].n === 2, `cambia solo los que siguen genéricos (HUBSTAFF y reel.mp4; el que ya es video no): ${json(r)}`);
  const d = (await q(db, `select mime, updated_at::text u, (updated_at - '${antes}'::timestamptz) dif from public.drive_items where id = '${HUBSTAFF}'`))[0];
  check(d.mime === "video/mp4", "HUBSTAFF ahora es video/mp4");
  check(String(d.dif) === "00:00:00.000001", `⚠️ la fecha NO pasa a hoy (se corre 1 µs y el disparador la respeta): antes ${antes}, ahora ${d.u}`);
  const otra = await como(db, "service_role", `select public.drive_corregir_tipos(array['${GRABACION}']::uuid[], 'text/html') n`);
  check(typeof otra === "string" && /no permitido/i.test(otra), "un tipo fuera de la lista (text/html) no entra");
  const sinMime = await como(db, "service_role", `select public.drive_corregir_tipos(array['${SIN_MIME}']::uuid[], 'application/pdf') n`);
  check(Array.isArray(sinMime) && sinMime[0].n === 1, "el que no tenía tipo (null) también se corrige");
  const quedan = await como(db, "service_role", `select id from public.drive_sin_tipo(null, 1000)`);
  check(Array.isArray(quedan) && json(quedan.map((x) => x.id)) === json([GRABACION]), "y deja de aparecer entre los que faltan");
}

// ════ 3. Solo service_role ═════════════════════════════════════════════════
{
  for (const quien of ["authenticated", "anon"] as const) {
    const l = await como(db, quien, `select id from public.drive_sin_tipo(null, 10)`);
    const c = await como(db, quien, `select public.drive_corregir_tipos(array['${GRABACION}']::uuid[], 'video/mp4')`);
    check(typeof l === "string" && /permission denied/.test(l) && typeof c === "string" && /permission denied/.test(c), `${quien}: ni listar ni corregir`);
  }
}

// ════ 4. La vuelta atrás ═════════════════════════════════════════════════════
{
  const v = await nueva(true);
  let r = "anduvo";
  try { await aplicar(v, "vuelta atrás", vuelta(M)); } catch (e) { r = msg(e); }
  check(r === "anduvo", `la vuelta atrás corre (${r.slice(0, 80)})`);
  const f = (await q(v, `select to_regprocedure('public.drive_sin_tipo(uuid, integer)') a, to_regprocedure('public.drive_corregir_tipos(uuid[], text)') b`))[0];
  check(f.a === null && f.b === null, "y no deja las funciones");
  let r2 = "anduvo";
  try { await aplicar(v, N, M); } catch (e) { r2 = msg(e); }
  check(r2 === "anduvo", "y se puede volver a aplicar");
}

for (const m of ok) console.log(`✓ ${m}`);
for (const m of mal) console.log(`✗ ${m}`);
console.log(`\n${ok.length} ok${mal.length ? `, ${mal.length} MAL` : ""}`);
if (mal.length) Deno.exit(1);
