// Drive: el buscador rápido (20261003170200_drive_buscar_rapido.sql, con los
// índices de 20261003170100 y 20261003170150) y la papelera que
// no cambia «Última modificación» (20261003170000_drive_papelera_no_cambia_la_fecha.sql),
// probados contra un Postgres de verdad (PGlite, con pg_trgm en public y
// unaccent en extensions, como en Maven).
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/drive_buscar_y_fecha.ts
//
// El esquema sale de las MIGRACIONES del repo, con sus guardas de huella: si
// drive_items_cuidar o drive_buscar del repo no fueran los de prod, la
// migración nueva no se aplicaría y la prueba fallaría.
//
// Lo que se prueba:
//   1. La papelera: tirar y restaurar no cambian updated_at; cambiar el nombre
//      sí (también en la misma sentencia que la papelera); el arreglo de los
//      importados de Google toca solo los que debe; la vuelta atrás.
//   2. El buscador, contra una REFERENCIA hecha a lo bruto (todas las fichas,
//      drive_mi_rol sobre cada una, la papelera de arriba y el orden de
//      siempre): mismo resultado, en el mismo orden, para cada persona y cada
//      búsqueda, por todos los caminos (pocas coincidencias, mirando cada una
//      o con lo que la persona ve; muchas con poco visible; muchas con mucho
//      visible: recorrido por fecha y lo que el recorrido no alcanza).
//   3. Permisos: nadie ve lo que drive_mi_rol no le deja (otra agencia, sin
//      acceso, papelera, subidas a medias), anon no puede llamarla, y sí
//      aparece lo compartido directo dentro de una carpeta que no se ve, lo
//      propio dentro de una carpeta ajena y una unidad que se ve por una
//      carpeta de más arriba (las unidades importadas cuelgan de otra carpeta).
//   4. Lo que antes se perdía: quien ve poco del Drive encuentra sus fotos
//      aunque haya miles más nuevas en otras unidades.
//   5. Sin alguno de los dos índices la migración no se aplica; la vuelta
//      atrás deja la función de antes (misma huella).
//
// Con `--medir` además carga la forma de prod (~900.000 fichas: 58 unidades, la
// más grande con 140.000 archivos; 37 «Mi unidad» de Google; ~150.000 IMG_) y
// compara la función de antes con la nueva (tarda un par de minutos):
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/drive_buscar_y_fecha.ts --medir
//
// Sale con código 1 si algo falla.
import { PGlite } from "npm:@electric-sql/pglite@0.3";
import { pg_trgm } from "npm:@electric-sql/pglite@0.3/contrib/pg_trgm";
import { unaccent } from "npm:@electric-sql/pglite@0.3/contrib/unaccent";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const BASE = leer("../migrations/20260928200000_oficina_drive.sql");
const UNIDADES = leer("../migrations/20261002130000_drive_unidades.sql");
const AGENCIA = leer("../migrations/20261002160000_drive_compartido_agencia.sql");
const PAPELERA = leer("../migrations/20261003140000_drive_papelera_y_detalles.sql");
const BUSCAR_VIEJO = leer("../migrations/20261002200100_drive_buscar.sql");
// CONCURRENTLY no anda en PGlite (un solo proceso): el mismo índice, sin eso.
const sinConcurrently = (sql: string) => sql.replace(/CREATE INDEX CONCURRENTLY/g, "CREATE INDEX");
const INDICE_VIEJO = sinConcurrently(leer("../migrations/20261002200200_drive_buscar_indice.sql"));
const FECHA = leer("../migrations/20261003170000_drive_papelera_no_cambia_la_fecha.sql");
const INDICE = sinConcurrently(leer("../migrations/20261003170100_drive_buscar_indice_por_fecha.sql"));
const INDICE_CARPETAS = sinConcurrently(leer("../migrations/20261003170150_drive_buscar_indice_de_carpetas.sql"));
const BUSCAR = leer("../migrations/20261003170200_drive_buscar_rapido.sql");
const vuelta = (sql: string) => sql.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");
const sinVuelta = (sql: string) => sql.split("\n").filter((l) => !l.startsWith("--|")).join("\n");

const HUELLA_BUSCAR_PROD = "7f8eb811b9f3d152c9645b5926c52ce8";

/** drive_items_cuidar como quedó en prod (la última que la define). */
function cuidarDeUnidades(): string {
  const a = UNIDADES.indexOf("CREATE OR REPLACE FUNCTION public.drive_items_cuidar()");
  const b = UNIDADES.indexOf("END; $function$;", a);
  if (a < 0 || b < 0) throw new Error("no encontré drive_items_cuidar en drive_unidades.sql");
  return UNIDADES.slice(a, b + "END; $function$;".length);
}

/** La función de antes con otro nombre, para comparar (--medir y el punto 4). */
function buscarViejoComo(nombre: string): string {
  const a = BUSCAR_VIEJO.indexOf("CREATE FUNCTION public.drive_buscar(");
  const b = BUSCAR_VIEJO.indexOf("$function$;", BUSCAR_VIEJO.indexOf("AS $function$", a) + 13);
  if (a < 0 || b < 0) throw new Error("no encontré drive_buscar en 20261002200100");
  return BUSCAR_VIEJO.slice(a, b + "$function$;".length).replace("public.drive_buscar(", `public.${nombre}(`) +
    `\nGRANT EXECUTE ON FUNCTION public.${nombre}(text, text[], integer) TO authenticated;`;
}

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);

// ─── Gente y agencias ────────────────────────────────────────────────────────
const T1 = "10000000-0000-4000-8000-000000000001";
const T2 = "10000000-0000-4000-8000-000000000002";
const P = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// Jhon: su Mi unidad. Ana: la unidad de fotos entera. Leo: la de contabilidad.
// Pepe: una «Mi unidad» de Google y un archivo suelto. Rita: una sola carpeta
// vieja. Sin: nada. Nora: la carpeta de arriba de lo importado (ve la unidad
// de contabilidad por ahí). Olga: otra agencia.
const [JHON, ANA, LEO, PEPE, RITA, SIN, NORA, OLGA] = [1, 2, 3, 4, 5, 6, 7, 11].map(P);
const I = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U_FOTOS = I(1), F_ENE = I(2), F_FEB = I(3), F_VIEJA = I(4);
const U_CONTA = I(10), BASURA = I(11), EN_BASURA = I(12), TIRADA = I(13), SUBIENDO = I(14), SUELTA = I(15), ACIDO = I(16);
const CELIA1 = I(17), CELIA2 = I(18), BALANCE = I(19);
const U_MANUALES = I(20), MANUAL = I(21);
const MIA = I(30), MIA_FOTO = I(31), MIA_CARPETA_IMG = I(32);
const P_GOOGLE = I(40), PEPE_FOTO = I(41);
const AJENA = I(50), AJENA_FOTO = I(51);
// Lo importado de Google cuelga de una carpeta: la unidad de contabilidad
// también (como en prod: las 58 unidades tienen carpeta madre).
const RAIZ_GOOGLE = I(70), VARIOS = I(71), VARIOS_FOTO = I(72), JHON_EN_CONTA = I(73), JHON_CARPETA = I(74), EN_CARPETA_JHON = I(75);
// Los importados de Google para el arreglo de fechas.
const G_TIRADO = I(60), G_VIVO = I(61), M_TIRADO = I(62), G_TIRADO_ANTES = I(63);

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
insert into public.tenants values ('${T1}', 'KASH'), ('${T2}', 'Otra');
insert into auth.users select id::uuid, 'x' || n || '@x.test' from (values ('${JHON}', 1), ('${ANA}', 2), ('${LEO}', 3),
  ('${PEPE}', 4), ('${RITA}', 5), ('${SIN}', 6), ('${NORA}', 7), ('${OLGA}', 11)) v(id, n);
insert into public.tenant_members values ('${JHON}', '${T1}'), ('${ANA}', '${T1}'), ('${LEO}', '${T1}'), ('${PEPE}', '${T1}'),
  ('${RITA}', '${T1}'), ('${SIN}', '${T1}'), ('${NORA}', '${T1}'), ('${OLGA}', '${T2}');
-- La tabla de unidades, como en prod (la usa el buscador para las unidades que se ven enteras).
create table public.drive_unidades (item_id uuid primary key, tenant_id uuid not null, tipo text not null, persona uuid);
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}

/** Todo lo de antes de estas migraciones, como está en prod. */
async function base(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm, unaccent } });
  await db.exec(ESQUEMA);
  await aplicar(db, "oficina_drive", BASE);
  await aplicar(db, "unidad_id + drive_items_cuidar de drive_unidades",
    "ALTER TABLE public.drive_items ADD COLUMN unidad_id uuid;\n" + cuidarDeUnidades());
  await aplicar(db, "drive_compartido_agencia", AGENCIA);
  await aplicar(db, "drive_papelera_y_detalles", sinVuelta(PAPELERA));
  await aplicar(db, "drive_buscar (el de antes)", sinVuelta(BUSCAR_VIEJO));
  await db.exec(INDICE_VIEJO);
  return db;
}

// Un pedido como lo manda PostgREST: una transacción, el rol y los claims del JWT.
type Quien = string | "service_role" | "anon";
async function como(db: PGlite, quien: Quien, sql: string, params: unknown[] = []): Promise<Fila[]> {
  await db.exec("begin");
  try {
    await db.exec("reset role");
    const servicio = quien === "service_role" || quien === "anon";
    const claims = servicio ? { role: quien } : { sub: quien, role: "authenticated" };
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await db.exec(`set local role ${servicio ? quien : "authenticated"}`);
    const rs = await db.query(sql, params);
    await db.exec("commit");
    return rs.rows as Fila[];
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
async function error(db: PGlite, quien: Quien, sql: string): Promise<string> {
  try { await como(db, quien, sql); return "anduvo"; } catch (e) { return msg(e); }
}
const q = async (db: PGlite, sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Fila[];
const ficha = async (db: PGlite, id: string) => (await q(db, `select * from public.drive_items where id = $1`, [id]))[0];
/** Como la edge (service_role): el trigger respeta las fechas puestas a propósito. */
async function comoEdge(db: PGlite, sql: string) {
  await db.exec("begin");
  await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
  await db.exec(sql);
  await db.exec("commit");
}

// ─── Las fichas ──────────────────────────────────────────────────────────────
// Fechas distintas para todo (sin empates, así el orden de la referencia es uno).
// La unidad de fotos: 6000 IMG_ recientes en dos carpetas (Ana las ve; Rita no)
// y 7 viejas en «Archivo 2019» (lo único que ve Rita). Con más de 5000 «img»
// el buscador toma el camino del recorrido por fecha.
const DATOS = `
insert into public.drive_items (id, tenant_id, owner_id, parent_id, tipo, nombre, size, storage_key, estado, updated_at, created_at, unidad_id) values
  ('${U_FOTOS}', '${T1}', null, null, 'carpeta', 'Fotos KASH', null, null, 'listo', '2026-01-01', '2026-01-01', '${U_FOTOS}'),
  ('${F_ENE}', '${T1}', null, '${U_FOTOS}', 'carpeta', 'Sesión enero', null, null, 'listo', '2026-01-02', '2026-01-02', '${U_FOTOS}'),
  ('${F_FEB}', '${T1}', null, '${U_FOTOS}', 'carpeta', 'Sesión febrero', null, null, 'listo', '2026-01-03', '2026-01-03', '${U_FOTOS}'),
  ('${F_VIEJA}', '${T1}', null, '${U_FOTOS}', 'carpeta', 'Archivo 2019', null, null, 'listo', '2019-05-01', '2019-05-01', '${U_FOTOS}'),
  ('${RAIZ_GOOGLE}', '${T1}', null, null, 'carpeta', 'Archivo de Google', null, null, 'listo', '2024-12-01', '2024-12-01', null),
  ('${U_CONTA}', '${T1}', null, '${RAIZ_GOOGLE}', 'carpeta', 'Contabilidad', null, null, 'listo', '2025-01-01', '2025-01-01', '${U_CONTA}'),
  ('${VARIOS}', '${T1}', null, '${RAIZ_GOOGLE}', 'carpeta', 'Varios', null, null, 'listo', '2024-12-02', '2024-12-02', null),
  ('${VARIOS_FOTO}', '${T1}', null, '${VARIOS}', 'archivo', 'IMG_varios.jpg', 10, 'k-varios', 'listo', '2024-12-03', '2024-12-03', null),
  ('${JHON_EN_CONTA}', '${T1}', '${JHON}', '${U_CONTA}', 'archivo', 'IMG_jhon_en_conta.jpg', 10, 'k-jhon-conta', 'listo', '2025-04-01', '2025-04-01', '${U_CONTA}'),
  ('${JHON_CARPETA}', '${T1}', '${JHON}', '${U_CONTA}', 'carpeta', 'Cosas de Jhon', null, null, 'listo', '2025-04-02', '2025-04-02', '${U_CONTA}'),
  ('${EN_CARPETA_JHON}', '${T1}', null, '${JHON_CARPETA}', 'archivo', 'IMG_en_cosas.jpg', 10, 'k-en-cosas', 'listo', '2025-04-03', '2025-04-03', '${U_CONTA}'),
  ('${BASURA}', '${T1}', null, '${U_CONTA}', 'carpeta', 'Basura', null, null, 'listo', '2025-01-02', '2025-01-02', '${U_CONTA}'),
  ('${EN_BASURA}', '${T1}', null, '${BASURA}', 'archivo', 'IMG_basura.jpg', 10, 'k-basura', 'listo', '2026-09-30 10:00', '2026-09-30', '${U_CONTA}'),
  ('${TIRADA}', '${T1}', null, '${U_CONTA}', 'archivo', 'IMG_tirada.jpg', 10, 'k-tirada', 'listo', '2026-09-30 11:00', '2026-09-30', '${U_CONTA}'),
  ('${SUBIENDO}', '${T1}', '${LEO}', '${U_CONTA}', 'archivo', 'IMG_subiendo.jpg', 10, 'k-subiendo', 'subiendo', '2026-09-30 12:00', '2026-09-30', '${U_CONTA}'),
  ('${SUELTA}', '${T1}', null, '${U_CONTA}', 'archivo', 'IMG_suelta.jpg', 10, 'k-suelta', 'listo', '2026-09-30 13:00', '2026-09-30', '${U_CONTA}'),
  ('${ACIDO}', '${T1}', null, '${U_CONTA}', 'archivo', 'Ácido fólico.pdf', 10, 'k-acido', 'listo', '2025-03-01', '2025-03-01', '${U_CONTA}'),
  ('${CELIA1}', '${T1}', null, '${U_CONTA}', 'archivo', 'Factura Celia Lora.pdf', 10, 'k-celia1', 'listo', '2026-08-01', '2026-08-01', '${U_CONTA}'),
  ('${CELIA2}', '${T1}', null, '${U_CONTA}', 'archivo', 'celia lora contrato.docx', 10, 'k-celia2', 'listo', '2025-08-01', '2025-08-01', '${U_CONTA}'),
  ('${BALANCE}', '${T1}', null, '${U_CONTA}', 'archivo', 'KASH · Balance 2026.xlsx', 10, 'k-balance', 'listo', '2026-07-01', '2026-07-01', '${U_CONTA}'),
  ('${U_MANUALES}', '${T1}', null, null, 'carpeta', 'Manuales', null, null, 'listo', '2024-01-01', '2024-01-01', '${U_MANUALES}'),
  ('${MANUAL}', '${T1}', null, '${U_MANUALES}', 'archivo', 'img manual.pdf', 10, 'k-manual', 'listo', '2024-06-01', '2024-06-01', '${U_MANUALES}'),
  ('${MIA}', '${T1}', '${JHON}', null, 'carpeta', 'Mis fotos', null, null, 'listo', '2026-02-01', '2026-02-01', null),
  ('${MIA_FOTO}', '${T1}', '${JHON}', '${MIA}', 'archivo', 'IMG_mia.jpg', 10, 'k-mia', 'listo', '2026-02-02', '2026-02-02', null),
  ('${MIA_CARPETA_IMG}', '${T1}', '${JHON}', '${MIA}', 'carpeta', 'img viejas', null, null, 'listo', '2026-02-03', '2026-02-03', null),
  ('${P_GOOGLE}', '${T1}', null, null, 'carpeta', 'Mi unidad de Pepe', null, null, 'listo', '2023-01-01', '2023-01-01', null),
  ('${PEPE_FOTO}', '${T1}', null, '${P_GOOGLE}', 'archivo', 'IMG_pepe.png', 10, '${T1}/google/${PEPE_FOTO}', 'listo', '2023-02-01', '2023-02-01', null),
  ('${AJENA}', '${T2}', '${OLGA}', null, 'carpeta', 'De otra agencia', null, null, 'listo', '2026-01-01', '2026-01-01', null),
  ('${AJENA_FOTO}', '${T2}', '${OLGA}', '${AJENA}', 'archivo', 'IMG_otra.jpg', 10, 'k-otra', 'listo', '2026-09-30 14:00', '2026-09-30', null);
-- 6000 fotos recientes (una por minuto hacia atrás desde el 30/09) y algunas
-- que tienen «img» en el medio.
insert into public.drive_items (tenant_id, owner_id, parent_id, tipo, nombre, size, storage_key, updated_at, created_at, unidad_id)
select '${T1}', null, case when n % 2 = 0 then '${F_ENE}'::uuid else '${F_FEB}'::uuid end, 'archivo',
  case when n % 50 = 0 then 'Portada img ' || n || '.png' else 'IMG_' || n || '.JPG' end,
  1000, 'k-foto-' || n, timestamptz '2026-09-30 09:00' - n * interval '1 minute', '2026-01-05', '${U_FOTOS}'
from generate_series(1, 6000) n;
insert into public.drive_items (tenant_id, owner_id, parent_id, tipo, nombre, size, storage_key, updated_at, created_at, unidad_id)
select '${T1}', null, '${F_VIEJA}', 'archivo', 'IMG_' || (9000 + n) || '.JPG', 1000, 'k-vieja-' || n,
  timestamptz '2019-06-01' + n * interval '1 day', '2019-06-01', '${U_FOTOS}'
from generate_series(1, 7) n;
insert into public.drive_shares (item_id, user_id, rol) values
  ('${U_FOTOS}', '${ANA}', 'editor'), ('${U_CONTA}', '${LEO}', 'lector'), ('${P_GOOGLE}', '${PEPE}', 'editor'),
  ('${SUELTA}', '${PEPE}', 'lector'), ('${F_VIEJA}', '${RITA}', 'lector'), ('${RAIZ_GOOGLE}', '${NORA}', 'lector'),
  -- Ana también tiene compartida una carpeta de su unidad (no cambia nada).
  ('${F_ENE}', '${ANA}', 'lector');
insert into public.drive_unidades values ('${U_FOTOS}', '${T1}', 'empresa', null), ('${U_CONTA}', '${T1}', 'empresa', null),
  ('${U_MANUALES}', '${T1}', 'empresa', null), ('${P_GOOGLE}', '${T1}', 'personal', '${PEPE}');
-- «Manuales», abierta a toda la agencia.
insert into public.drive_compartido_agencia (item_id, tenant_id, rol) values ('${MANUAL}', '${T1}', 'lector');
-- La papelera: una carpeta con una foto adentro, y una foto sola.
update public.drive_items set trashed_at = '2026-10-01' where id in ('${BASURA}', '${TIRADA}');
`;

/** Lo mismo que hace la función con el texto: minúsculas, sin tildes, palabras. */
function patronesDe(texto: string) {
  const qn = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  const palabras = [...new Set(qn.split(/\s+/).filter(Boolean))].slice(0, 8);
  return { patrones: palabras.map((w) => `%${esc(w)}%`), inicio: `${esc(qn)}%` };
}

/** La REFERENCIA, a lo bruto: todas las fichas de la agencia, drive_mi_rol
 *  sobre cada una, la papelera de las carpetas de arriba y el orden de siempre. */
async function referencia(db: PGlite, quien: string, texto: string, limite = 50, exts: string[] | null = null): Promise<string[]> {
  const { patrones, inicio } = patronesDe(texto);
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: quien, role: "authenticated" })]);
    const rs = await db.query(`
      select i.id from public.drive_items i
      where i.tenant_id = public.current_tenant_id()
        and i.trashed_at is null and (i.tipo = 'carpeta' or i.estado = 'listo')
        and public.drive_nombre_buscable(i.nombre) like all ($1::text[])
        and ($4::text[] is null or i.tipo = 'carpeta' or lower(substring(i.nombre from '\\.([A-Za-z0-9]+)$')) = any ($4::text[]))
        and public.drive_mi_rol(i.id) is not null
        and not exists (
          with recursive arriba as (
            select p.id, p.parent_id, p.trashed_at, 1 as nivel from public.drive_items p where p.id = i.parent_id
            union all
            select p.id, p.parent_id, p.trashed_at, a.nivel + 1 from public.drive_items p join arriba a on p.id = a.parent_id where a.nivel < 50)
          select 1 from arriba where trashed_at is not null)
      order by (public.drive_nombre_buscable(i.nombre) like $2) desc, i.updated_at desc
      limit $3`, [patrones, inicio, limite, exts]);
    await db.exec("commit");
    return (rs.rows as Fila[]).map((r) => r.id as string);
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}

const buscar = async (db: PGlite, quien: string, texto: string, limite = 50, exts: string[] | null = null, fn = "drive_buscar") =>
  (await como(db, quien, `select * from public.${fn}($1, $2, $3)`, [texto, exts, limite]));
const ids = (filas: Fila[]) => filas.map((f) => f.id as string);
const iguales = (a: string[], b: string[]) => a.length === b.length && a.every((x, n) => x === b[n]);
const mismoConjunto = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

// ─── 0. La base de partida es la de prod ─────────────────────────────────────
const db = await base();
{
  const h = (await q(db, `select md5(prosrc) as h from pg_proc where oid = to_regprocedure('public.drive_buscar(text, text[], integer)')`))[0]?.h;
  check(h === HUELLA_BUSCAR_PROD, `drive_buscar del repo = el de prod (huella ${h})`);
}
await comoEdge(db, DATOS);
// Los importados de Google, ANTES del arreglo: uno tirado con la fecha de la
// papelera, uno vivo con otra fecha (cambió de nombre), uno subido en Maven y
// tirado, y uno importado tirado mucho después de su última modificación.
await comoEdge(db, `
insert into public.drive_items (id, tenant_id, owner_id, parent_id, tipo, nombre, size, storage_key, created_at, updated_at, trashed_at, unidad_id) values
  ('${G_TIRADO}', '${T1}', null, '${U_CONTA}', 'archivo', 'g tirado.pdf', 1, '${T1}/google/${G_TIRADO}', '2022-01-01', '2026-10-02 10:00:01+00', '2026-10-02 10:00:00+00', '${U_CONTA}'),
  ('${G_VIVO}', '${T1}', null, '${U_CONTA}', 'archivo', 'g vivo.pdf', 1, '${T1}/google/${G_VIVO}', '2022-01-01', '2026-10-02 10:00:00+00', null, '${U_CONTA}'),
  ('${M_TIRADO}', '${T1}', '${LEO}', '${U_CONTA}', 'archivo', 'm tirado.pdf', 1, '${T1}/${M_TIRADO}', '2022-01-01', '2026-10-02 10:00:01+00', '2026-10-02 10:00:00+00', '${U_CONTA}'),
  ('${G_TIRADO_ANTES}', '${T1}', null, '${U_CONTA}', 'archivo', 'g tirado antes.pdf', 1, '${T1}/google/${G_TIRADO_ANTES}', '2022-01-01', '2026-09-01', '2026-10-02 10:00:00+00', '${U_CONTA}');
analyze public.drive_items;`);

// Lo que la búsqueda de antes no encontraba (punto 4): se guarda ahora, antes
// de reemplazarla.
await aplicar(db, "drive_buscar de antes, como drive_buscar_viejo", buscarViejoComo("drive_buscar_viejo"));

// ─── 1. La papelera no cambia la fecha ───────────────────────────────────────
{
  // Línea base: hoy, tirar a la papelera le pone la fecha de hoy.
  const f = ids((await q(db, `select id from public.drive_items where nombre = 'IMG_10.JPG'`)))[0];
  const antes = (await ficha(db, f)).updated_at as Date;
  await como(db, ANA, `update public.drive_items set trashed_at = now() where id = '${f}'`);
  check((await ficha(db, f)).updated_at.getTime() !== antes.getTime(), "línea base: sin la migración, tirar a la papelera cambia updated_at");
  await comoEdge(db, `update public.drive_items set trashed_at = null, updated_at = '${antes.toISOString()}' where id = '${f}'`);
}
await aplicar(db, "20261003170000 (papelera sin fecha)", FECHA);
{
  const g = await ficha(db, G_TIRADO);
  check(g.updated_at.getTime() === new Date("2022-01-01").getTime(), "arreglo: el importado de Google tirado vuelve a su fecha (created_at)");
  check((await ficha(db, G_VIVO)).updated_at.getTime() === new Date("2026-10-02T10:00:00Z").getTime(), "arreglo: un importado que NO está en la papelera no se toca");
  check((await ficha(db, M_TIRADO)).updated_at.getTime() === new Date("2026-10-02T10:00:01Z").getTime(), "arreglo: lo subido en Maven (sin fecha de Google) no se toca");
  check((await ficha(db, G_TIRADO_ANTES)).updated_at.getTime() === new Date("2026-09-01").getTime(), "arreglo: un importado tirado mucho después de su última modificación no se toca");

  const f = ids((await q(db, `select id from public.drive_items where nombre = 'IMG_12.JPG'`)))[0];
  const antes = (await ficha(db, f)).updated_at.getTime();
  await como(db, ANA, `update public.drive_items set trashed_at = now() where id = '${f}'`);
  const tirada = await ficha(db, f);
  check(tirada.trashed_at !== null && tirada.trashed_by === ANA, "tirar a la papelera sigue andando y anota quién (trashed_by)");
  check(tirada.updated_at.getTime() === antes, "tirar a la papelera NO cambia «Última modificación»");
  await como(db, ANA, `update public.drive_items set trashed_at = null where id = '${f}'`);
  const vuelta1 = await ficha(db, f);
  check(vuelta1.trashed_at === null && vuelta1.trashed_by === null && vuelta1.updated_at.getTime() === antes,
    "restaurar tampoco la cambia (y borra trashed_by)");
  await como(db, ANA, `update public.drive_items set trashed_by = '${LEO}' where id = '${f}'`);
  check((await ficha(db, f)).updated_at.getTime() === antes, "escribir trashed_by a mano no cuenta como modificación");
  await como(db, ANA, `update public.drive_items set nombre = 'IMG_12 (editada).JPG' where id = '${f}'`);
  const renombrada = (await ficha(db, f)).updated_at.getTime();
  check(renombrada > antes, "cambiar el nombre SÍ cambia «Última modificación»");
  await como(db, ANA, `update public.drive_items set nombre = 'IMG_12.JPG', trashed_at = now() where id = '${f}'`);
  check((await ficha(db, f)).updated_at.getTime() >= renombrada, "nombre + papelera en la misma sentencia: cuenta el nombre");
  await como(db, ANA, `update public.drive_items set trashed_at = null where id = '${f}'`);
  await comoEdge(db, `update public.drive_items set updated_at = '${new Date(antes).toISOString()}' where id = '${f}'`);
  check((await ficha(db, f)).updated_at.getTime() === antes, "la edge (service_role) sigue pudiendo poner la fecha a propósito");
  check(/Solo se puede cambiar/.test(await error(db, ANA, `update public.drive_items set size = 1 where id = '${f}'`)),
    "lo demás sigue cuidado: el navegador no cambia el tamaño");

  // La vuelta atrás vuelve a la comparación de antes; y se puede volver a aplicar.
  const fx = ids((await q(db, `select id from public.drive_items where nombre = 'IMG_14.JPG'`)))[0];
  await aplicar(db, "vuelta atrás de 20261003170000", vuelta(FECHA));
  const h = (await q(db, `select md5(prosrc) as h from pg_proc where proname = 'drive_items_cuidar'`))[0].h;
  check(h === "b41c0e8a540888ca8453cdf5ca825a5e", `la vuelta atrás deja drive_items_cuidar como en prod (huella ${h})`);
  const a2 = (await ficha(db, fx)).updated_at.getTime();
  await como(db, ANA, `update public.drive_items set trashed_at = now() where id = '${fx}'`);
  check((await ficha(db, fx)).updated_at.getTime() !== a2, "sin la migración, tirar vuelve a cambiar la fecha");
  await como(db, ANA, `update public.drive_items set trashed_at = null where id = '${fx}'`);
  await comoEdge(db, `update public.drive_items set updated_at = '${new Date(a2).toISOString()}' where id = '${fx}'`);
  try { await aplicar(db, "20261003170000 (otra vez)", FECHA); check(true, "se puede volver a aplicar después de la vuelta atrás"); }
  catch (e) { check(false, msg(e)); }
}

// ─── 5a. Sin el índice por fecha, la migración del buscador no se aplica ─────
{
  let falla = "";
  try {
    await db.exec("begin;\nDROP INDEX IF EXISTS public.drive_items_modificado_idx;\n" + BUSCAR + "\ncommit;");
  } catch (e) { falla = msg(e); await db.exec("rollback").catch(() => {}); }
  check(/Falta el índice drive_items_modificado_idx/.test(falla), "sin el índice por fecha, la migración del buscador se niega a aplicarse");
  const cfg = (await q(db, `select proconfig from pg_proc where oid = to_regprocedure('public.drive_buscar(text, text[], integer)')`))[0].proconfig;
  check(!String(cfg).includes("plan_cache_mode"), "línea base: la función de antes no fuerza planes a medida");
}
{
  await db.exec(INDICE);
  let falla = "";
  try { await db.exec("begin;\n" + BUSCAR + "\ncommit;"); } catch (e) { falla = msg(e); await db.exec("rollback").catch(() => {}); }
  check(/Falta el índice drive_items_subcarpetas_idx/.test(falla), "sin el índice de carpetas, tampoco");
}
await db.exec(INDICE_CARPETAS);
await aplicar(db, "20261003170200 (buscador rápido)", BUSCAR);
await db.exec("analyze public.drive_items");
{
  const p = (await q(db, `select has_function_privilege('anon', 'public.drive_buscar(text, text[], integer)', 'EXECUTE') as anon,
    has_function_privilege('authenticated', 'public.drive_buscar(text, text[], integer)', 'EXECUTE') as auth,
    (select prosecdef from pg_proc where oid = to_regprocedure('public.drive_buscar(text, text[], integer)')) as definer`))[0];
  check(p.anon === false && p.auth === true && p.definer === true, "drive_buscar: anon no, authenticated sí, SECURITY DEFINER");
  check(/permission denied/.test(await error(db, "anon", `select * from public.drive_buscar('img')`)), "anon no puede buscar");
  const cols = await q(db, `select string_agg(a, ',' order by n) as c from unnest((select proargnames from pg_proc where oid = to_regprocedure('public.drive_buscar(text, text[], integer)'))) with ordinality x(a, n)`);
  check(cols[0].c === "p_q,p_extensiones,p_limite,id,nombre,tipo,mime,size,updated_at,owner_id,parent_id,ubicacion",
    "misma firma y mismas columnas que antes (el navegador no cambia)");
}

// ─── 2 y 3. Igual que la referencia, para cada persona y búsqueda ────────────
{
  const casos: [string, string, string, number?, string[]?][] = [
    // [quién, persona, texto, límite, extensiones]
    [ANA, "Ana", "img"], [ANA, "Ana", "img", 100], [ANA, "Ana", "IMG_1"], [ANA, "Ana", "portada img"], [ANA, "Ana", "sesion"],
    [ANA, "Ana", "img", 50, ["png"]],
    [LEO, "Leo", "img"], [LEO, "Leo", "celia lora"], [LEO, "Leo", "CELIA"], [LEO, "Leo", "acido"], [LEO, "Leo", "ÁCIDO FÓLICO"],
    [LEO, "Leo", "balance kash"], [LEO, "Leo", "kash balance 2026"],
    [JHON, "Jhon", "img"], [JHON, "Jhon", "mis fotos"], [JHON, "Jhon", "img_en"],
    [NORA, "Nora", "img"], [NORA, "Nora", "celia lora"], [NORA, "Nora", "varios"],
    [PEPE, "Pepe", "img"], [RITA, "Rita", "img"], [RITA, "Rita", "img_9"], [SIN, "alguien sin acceso", "img"],
    [OLGA, "Olga (otra agencia)", "img"],
  ];
  for (const [quien, nombre, texto, limite = 50, exts = null] of casos) {
    const ref = await referencia(db, quien, texto, limite, exts);
    const nuevo = ids(await buscar(db, quien, texto, limite, exts));
    check(iguales(nuevo, ref), `${nombre} busca «${texto}»${exts ? ` (${exts.join(",")})` : ""}: igual a la referencia, en el mismo orden (${nuevo.length} / ${ref.length})`);
  }

  // Lo que se espera ver, dicho con nombres.
  const nombres = async (quien: string, texto: string) => (await buscar(db, quien, texto)).map((f) => f.nombre as string);
  const deLeo = await nombres(LEO, "img");
  check(!deLeo.some((n) => /basura|tirada|subiendo/.test(n)), "Leo no ve lo de la papelera (ni lo de adentro de una carpeta tirada) ni subidas a medias");
  check(deLeo.includes("IMG_suelta.jpg") && deLeo.includes("img manual.pdf"), "Leo ve lo de su unidad y lo abierto a la agencia");
  const dePepe = await nombres(PEPE, "img");
  check(mismoConjunto(dePepe, ["IMG_pepe.png", "IMG_suelta.jpg", "img manual.pdf"]),
    `Pepe: su «Mi unidad» de Google, el archivo compartido directo (en una carpeta que no ve) y lo abierto a la agencia (${dePepe.join(" · ")})`);
  const deJhon = await nombres(JHON, "img");
  check(mismoConjunto(deJhon, ["img viejas", "IMG_mia.jpg", "img manual.pdf", "IMG_jhon_en_conta.jpg", "IMG_en_cosas.jpg"]),
    `Jhon: lo suyo (también la carpeta y lo que subió en una unidad que no ve, con lo de adentro) y lo de la agencia (${deJhon.join(" · ")})`);
  const deNora = await nombres(NORA, "img");
  check(deNora.includes("IMG_varios.jpg") && deNora.includes("IMG_suelta.jpg") && !deNora.some((n) => /basura|tirada|subiendo/.test(n)),
    `Nora ve la unidad de contabilidad por la carpeta de arriba y lo de «Varios», sin la papelera (${deNora.length})`);
  const p = (await q(db, `select proconfig from pg_proc where oid = to_regprocedure('public.drive_buscar(text, text[], integer)')`))[0].proconfig;
  check(String(p).includes("plan_cache_mode=force_custom_plan"), "la función nueva fuerza planes a medida (las listas entran como constantes)");
  check((await nombres(SIN, "img")).join() === "img manual.pdf", "alguien sin nada: solo lo abierto a la agencia");
  check((await nombres(OLGA, "img")).join() === "IMG_otra.jpg", "Olga (otra agencia): solo lo suyo, nada de KASH");
  check((await buscar(db, ANA, "im")).length === 0 && (await buscar(db, ANA, "  ")).length === 0, "con menos de 3 letras no busca");
  const celia = await nombres(LEO, "celia lora");
  check(celia[0] === "celia lora contrato.docx" && celia[1] === "Factura Celia Lora.pdf", "primero lo que EMPIEZA con lo buscado, aunque sea más viejo");
  const ubic = (await buscar(db, LEO, "celia lora"))[0].ubicacion;
  check(ubic === "Contabilidad", "devuelve dónde está (la carpeta madre)");
  const conIncio = (await buscar(db, ANA, "img", 100)).map((f) => f.nombre as string);
  check(conIncio.slice(0, 100).every((n) => /^IMG_/i.test(n)), "Ana, «img» (camino del recorrido): con 6000 fotos, las 100 empiezan con IMG");
  const portada = await nombres(ANA, "portada img");
  check(portada.length === 50 && portada.every((n) => /^Portada img/.test(n)), "dos palabras en el camino del recorrido: las dos tienen que estar");
}

// ─── 4. Lo que antes se perdía ───────────────────────────────────────────────
{
  // Rita ve una sola carpeta, vieja. Hay 6000 fotos más nuevas que no ve: la
  // función de antes miraba solo las 400 más nuevas y no le devolvía nada.
  const antes = (await buscar(db, RITA, "img", 50, null, "drive_buscar_viejo")).map((f) => f.nombre as string);
  const ahora = (await buscar(db, RITA, "img")).map((f) => f.nombre as string);
  check(antes.length === 0, `antes: Rita buscaba «img» y no encontraba nada (${antes.length})`);
  check(ahora.length === 8 && ahora.filter((n) => /^IMG_90/.test(n)).length === 7 && ahora.includes("img manual.pdf"),
    `ahora: encuentra sus 7 fotos de 2019 y el manual de la agencia (${ahora.length})`);
}

// ─── 2b. Quien ve mucho: el recorrido por fecha y cuando no alcanza ──────────
{
  // 31.000 fichas nuevas sin «img» en la unidad de contabilidad: Leo (y Nora)
  // ven más de 30.000 y van por el recorrido; sus pocas fotos son viejas y el
  // recorrido no llega: completan las ordenadas, en el mismo orden.
  await comoEdge(db, `
    insert into public.drive_items (tenant_id, owner_id, parent_id, tipo, nombre, size, storage_key, updated_at, created_at, unidad_id)
    select '${T1}', null, '${U_CONTA}', 'archivo', 'Documento ' || n || '.pdf', 10, 'k-doc-' || n,
      timestamptz '2026-10-01' + n * interval '1 second', '2026-10-01', '${U_CONTA}'
    from generate_series(1, 31000) n;
    analyze public.drive_items;`);
  for (const [quien, nombre] of [[RITA, "Rita"], [ANA, "Ana"], [LEO, "Leo"], [NORA, "Nora"], [PEPE, "Pepe"]] as const) {
    const r = await referencia(db, quien, "img");
    const n = ids(await buscar(db, quien, "img"));
    check(iguales(n, r), `${nombre}, con 31.000 fichas más nuevas: «img» igual a la referencia (${n.length} / ${r.length})`);
  }
  // «documento 1»: >5000 coincidencias, todas recientes.
  const r = await referencia(db, LEO, "documento 1");
  const n = ids(await buscar(db, LEO, "documento 1"));
  check(iguales(n, r), `Leo busca «documento 1» (31.000 coincidencias): igual a la referencia (${n.length} / ${r.length})`);
  // «documento zx»: «zx» es corta para el índice y «documento» está en
  // 31.000; con todas las palabras hay 3, viejas. El recorrido no las
  // encontraría: van todas las de «documento» que ve, ordenadas.
  await comoEdge(db, `
    insert into public.drive_items (tenant_id, owner_id, parent_id, tipo, nombre, size, storage_key, updated_at, created_at, unidad_id)
    values ('${T1}', null, '${U_CONTA}', 'archivo', 'Documento zx 1.pdf', 1, 'k-zx-1', '2020-01-01', '2020-01-01', '${U_CONTA}'),
           ('${T1}', null, '${U_CONTA}', 'archivo', 'Documento zx 2.pdf', 1, 'k-zx-2', '2020-02-01', '2020-02-01', '${U_CONTA}'),
           ('${T1}', null, '${U_CONTA}', 'archivo', 'zx documento.pdf', 1, 'k-zx-3', '2020-03-01', '2020-03-01', '${U_CONTA}');`);
  const rz = await referencia(db, LEO, "documento zx");
  const nz = ids(await buscar(db, LEO, "documento zx"));
  check(iguales(nz, rz) && rz.length === 3, `Leo busca «documento zx» (3 de 31.000, viejas): igual a la referencia (${nz.length} / ${rz.length})`);
}

// ─── 5b. La vuelta atrás deja la función de antes ────────────────────────────
{
  await aplicar(db, "vuelta atrás de 20261003170200", vuelta(BUSCAR));
  const h = (await q(db, `select md5(prosrc) as h from pg_proc where oid = to_regprocedure('public.drive_buscar(text, text[], integer)')`))[0]?.h;
  check(h === HUELLA_BUSCAR_PROD, `la vuelta atrás deja drive_buscar como en prod (huella ${h})`);
  try { await aplicar(db, "20261003170200 (otra vez)", BUSCAR); check(true, "se puede volver a aplicar después de la vuelta atrás"); }
  catch (e) { check(false, msg(e)); }
}
await db.close();

// ─── 6. (--medir) La forma de prod: antes y después ──────────────────────────
if (Deno.args.includes("--medir")) {
  const g = await base();
  let t0 = performance.now();
  const AMPLIO = P(20), DOS = P(21), POCO = P(22), TODO = P(23);
  // Sin triggers para cargar rápido: unidad_id y fechas se ponen a mano.
  await g.exec(`
    insert into auth.users values ('${AMPLIO}', 'amplio@x.test'), ('${DOS}', 'dos@x.test'), ('${POCO}', 'poco@x.test'), ('${TODO}', 'todo@x.test');
    insert into public.tenant_members values ('${AMPLIO}', '${T1}'), ('${DOS}', '${T1}'), ('${POCO}', '${T1}'), ('${TODO}', '${T1}');
    set session_replication_role = replica;
    -- 58 unidades: la grande con 140.000 archivos en 2.800 carpetas; las demás, 12.000 en 240.
    create table plan as select k, case when k = 1 then 140000 else 12000 end as n, case when k = 1 then 2800 else 240 end as c
      from generate_series(1, 58) k;
    -- Como en prod, las unidades cuelgan de una carpeta (la de lo importado).
    insert into public.drive_items (id, tenant_id, owner_id, parent_id, tipo, nombre, updated_at, created_at)
    values (md5('raiz')::uuid, '${T1}', null, null, 'carpeta', 'Unidades importadas', '2021-01-01', '2021-01-01');
    insert into public.drive_items (id, tenant_id, owner_id, parent_id, tipo, nombre, unidad_id, updated_at, created_at)
    select md5('u'||k||'-'||j)::uuid, '${T1}', null,
      case when j = 0 then md5('raiz')::uuid when j <= 20 then md5('u'||k||'-0')::uuid else md5('u'||k||'-'||(1 + j % 20))::uuid end,
      'carpeta', case when j = 0 then 'Unidad ' || k else 'Carpeta ' || k || '-' || j end, md5('u'||k||'-0')::uuid,
      now() - (abs(hashtext('c'||k||'-'||j)) % (5*365*86400)) * interval '1 second', '2021-01-01'
    from plan, generate_series(0, c) j;
    insert into public.drive_items (tenant_id, owner_id, parent_id, tipo, nombre, size, storage_key, unidad_id, updated_at, created_at)
    select '${T1}', null, md5('u'||k||'-'||(21 + f % (c - 20)))::uuid, 'archivo',
      case when f % 6 = 0 then 'IMG_' || f || '.JPG' when f % 6 = 1 then 'Factura ' || f || '.pdf'
           when k = 9 and f % 1000 = 2 then 'Celia Lora ' || f || '.pdf' else 'Documento ' || f || '.docx' end,
      1000, 'k'||k||'-'||f, md5('u'||k||'-0')::uuid,
      now() - (abs(hashtext('f'||k||'-'||f)) % (5*365*86400)) * interval '1 second', '2021-01-01'
    from plan, generate_series(1, n) f;
    -- 37 «Mi unidad» de Google importadas (sin unidad): 1.580 archivos en 30 carpetas cada una.
    insert into public.drive_unidades select md5('u'||k||'-0')::uuid, '${T1}', 'empresa', null from plan;
    insert into public.drive_items (id, tenant_id, owner_id, parent_id, tipo, nombre, updated_at, created_at)
    select md5('p'||k||'-'||j)::uuid, '${T1}', null, case when j = 0 then md5('raiz')::uuid else md5('p'||k||'-0')::uuid end,
      'carpeta', 'Personal ' || k || '-' || j, now() - (abs(hashtext('pc'||k||'-'||j)) % (5*365*86400)) * interval '1 second', '2021-01-01'
    from generate_series(1, 37) k, generate_series(0, 30) j;
    insert into public.drive_items (tenant_id, owner_id, parent_id, tipo, nombre, size, storage_key, updated_at, created_at)
    select '${T1}', null, md5('p'||k||'-'||(1 + f % 30))::uuid, 'archivo',
      case when f % 6 = 0 then 'IMG_' || f || '.JPG' else 'Documento personal ' || f || '.docx' end,
      1000, 'p'||k||'-'||f, now() - (abs(hashtext('pf'||k||'-'||f)) % (5*365*86400)) * interval '1 second', '2021-01-01'
    from generate_series(1, 37) k, generate_series(1, 1580) f;
    -- Amplio: 8 unidades enteras y 146 carpetas sueltas (como la persona de
    -- prod con 154 compartidos). Dos: 2 carpetas sueltas en las unidades
    -- grandes y lo suyo. Poco: una carpeta. Todo: la carpeta de arriba de lo
    -- importado (como Jhon en prod: ve ~888.000 de las 891.000 fichas).
    insert into public.drive_shares (item_id, user_id, rol)
    select md5('u'||k||'-0')::uuid, '${AMPLIO}'::uuid, 'lector' from generate_series(1, 8) k
    union all select md5('u'||(9 + n % 50)||'-'||(21 + n))::uuid, '${AMPLIO}'::uuid, 'lector' from generate_series(0, 145) n
    union all select md5('u1-' || 100)::uuid, '${DOS}'::uuid, 'editor'
    union all select md5('u2-' || 50)::uuid, '${DOS}'::uuid, 'editor'
    union all select md5('u30-' || 77)::uuid, '${POCO}'::uuid, 'lector'
    union all select md5('raiz')::uuid, '${TODO}'::uuid, 'lector';
    insert into public.drive_items (tenant_id, owner_id, parent_id, tipo, nombre, size, storage_key, updated_at, created_at)
    values ('${T1}', '${DOS}', null, 'archivo', 'IMG_dos.JPG', 1, 'dos-1', now(), now());
    set session_replication_role = origin;
  `);
  await g.exec(`drop index if exists public.drive_items_nombre_trgm_idx; ${INDICE_VIEJO}`);
  await g.exec(INDICE);
  await g.exec(INDICE_CARPETAS);
  await g.exec("analyze public.drive_items");
  await aplicar(g, "drive_buscar de antes, como drive_buscar_viejo", buscarViejoComo("drive_buscar_viejo"));
  await aplicar(g, "20261003170200", BUSCAR);
  const filas = (await q(g, "select count(*) as n from public.drive_items"))[0].n;
  const imgs = (await q(g, "select count(*) as n from public.drive_items where public.drive_nombre_buscable(nombre) like '%img%'"))[0].n;
  console.log(`\n  medir: ${filas} fichas (${imgs} con «img») cargadas en ${Math.round((performance.now() - t0) / 1000)} s`);
  const medir = async (quien: string, nombre: string, texto: string) => {
    const vez = async (fn: string) => {
      await buscar(g, quien, texto, 50, null, fn); // la primera calienta la caché
      t0 = performance.now();
      const r = await buscar(g, quien, texto, 50, null, fn);
      return { ms: Math.round(performance.now() - t0), n: r.length };
    };
    const a = await vez("drive_buscar_viejo");
    const b = await vez("drive_buscar");
    console.log(`  medir: ${nombre.padEnd(22)} «${texto}»`.padEnd(52) + `antes ${String(a.ms).padStart(5)} ms (${a.n})  ·  ahora ${String(b.ms).padStart(5)} ms (${b.n})`);
  };
  for (const [quien, nombre] of [[TODO, "todo (como Jhon)"], [AMPLIO, "8 unidades + 146 carp."], [DOS, "2 carpetas"], [POCO, "1 carpeta"]] as const) {
    for (const texto of ["img", "celia lora", "factura 12", "documento", "carpeta 9-1"]) await medir(quien, nombre, texto);
  }
  await g.close();
}

for (const m of ok) console.log(`  ✓ ${m}`);
for (const m of mal) console.log(`  ✗ ${m}`);
console.log(`\n${ok.length} bien, ${mal.length} mal`);
if (mal.length) Deno.exit(1);
