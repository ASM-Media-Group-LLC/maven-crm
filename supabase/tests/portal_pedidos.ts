// Portal de creadoras, fase 3 (migraciones 20261009100000_portal_pedidos y
// 20261009110000_portal_pedidos_solo_nuevos): los
// PERSONALIZADOS desde el portal, probados contra un Postgres de verdad (PGlite)
// con el catálogo de PROD, el Drive, las fases 1 y 2 del portal (la misma
// preparación que portal_contenido.ts) y las migraciones de Personalizados.
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/portal_pedidos.ts
//
//   1. La migración carga sobre la cadena.
//   2. A ella le llega el aviso cuando el chatter crea el pedido (sin módulo,
//      a su portal), y cuando lo aprueban, lo cancelan o le llega al fan.
//   3. portal_pedido(): solo su ficha; «Lo empiezo» solo aprobado; la entrega,
//      solo un archivo terminado de SU carpeta; por aprobar, la entrega espera y
//      al aprobar pasa directo a listo; «no puede» con motivo obligatorio.
//   4. Los avisos al equipo: chatter, su manager y los supervisores de SU
//      agencia (nunca la otra), una vez cada uno.
//   5. El historial dice que fue ELLA (no «nadie»).
//   6. no_puede: solo ella lo pone; solo un supervisor lo resuelve (renegociar,
//      denegar o reembolsar).
//   7. Nadie más llama a portal_pedido(); el equipo no ata archivos del Drive.
//   8. La vuelta atrás deja todo como estaba y se puede volver a aplicar.
//
// Sale con código 1 si algo falla. Corre en el guard de cada PR.
import { PGlite } from "npm:@electric-sql/pglite@0.3";
import { PEDIDOS_DESDE } from "../functions/portal-contenido/pedidos.ts";

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
const N_CONTENIDO = "20261006120000_portal_contenido.sql";
const M_CONTENIDO = leer(`../migrations/${N_CONTENIDO}`);
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
    await aplicar(db, N_CONTENIDO, M_CONTENIDO);
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

// ─── Lo de Personalizados ───────────────────────────────────────────────────
// storage: lo mínimo de Supabase Storage (lo que miran las políticas del bucket).
const STORAGE = `
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text not null, public boolean default false);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text not null, owner uuid, created_at timestamptz default now(), metadata jsonb, unique (bucket_id, name));
alter table storage.objects enable row level security;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
`;
const PERSONALIZADOS = [
  "20260902120000_personalizados_f1.sql", "20260902160000_personalizados_rls_alcance.sql", "20261005150100_custom_requests_archivos_por_pedido.sql",
].map((n) => ({ n, sql: leer(`../migrations/${n}`) }));
const N = "20261009100000_portal_pedidos.sql";
const M = leer(`../migrations/${N}`);
const N2 = "20261009110000_portal_pedidos_solo_nuevos.sql";
const M2 = leer(`../migrations/${N2}`);

// Un supervisor de Personalizados (de verdad) y los permisos del módulo.
const SUSI = P(7);
const PERMISOS = `
insert into auth.users(id, email, raw_user_meta_data) values ('${SUSI}', 'susi@x.test', '{"full_name":"Susi"}');
update public.user_roles set role = 'supervisor' where user_id = '${SUSI}';
insert into public.tenant_members(user_id, tenant_id) values ('${SUSI}', '${T1}') on conflict do nothing;
insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
select rc.id, 'Personalizados', null, true, 'all' from public.roles_config rc where rc.name in ('Chatter', 'manager', 'supervisor')
on conflict do nothing;
`;

const R = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pedido = (id: string, creador = C1) => `insert into public.custom_requests (id, creator_id, creator_name, chatter_id, fan_handle, description, price_usd)
  values ('${id}', '${creador}', 'Sofi', '${ANA}', 'fan_${id.slice(-2)}', 'Video bailando en la playa', 120);`;

const db = await nueva(true);
await db.exec(STORAGE);
for (const m of PERSONALIZADOS) await aplicar(db, m.n, m.sql);
await db.exec(PERMISOS);
await aplicar(db, N, M);
check(true, "la migración carga sobre la cadena (catálogo de prod + Drive + portal + Personalizados)");

async function como(quien: Quien, sql: string): Promise<Fila[]> {
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
const esError = (r: Fila[] | string, re: RegExp) => typeof r === "string" && re.test(r);
const falla = async (quien: Quien, sql: string, re: RegExp, m: string) => {
  const r = await probar(db, quien, sql);
  check(esError(r, re), `${m} → ${typeof r === "string" ? r.slice(0, 90) : "NO falló"}`);
};
const portal = async (usuario: string, pedidoId: string, accion: string, motivo: string | null = null, item: string | null = null) =>
  (await como("service_role", `select public.portal_pedido('${usuario}', '${pedidoId}', '${accion}',
    ${motivo === null ? "null" : `$m$${motivo}$m$`}, ${item === null ? "null" : `'${item}'`}) as r`))[0].r as Fila;
const avisos = async (usuario: string, tipo: string) =>
  (await q(db, `select title, deep_link_url, required_permission_module from public.notifications where user_id = '${usuario}' and type = '${tipo}' order by created_at, id`));
const estado = async (id: string) => (await uno(db, `select status from public.custom_requests where id = '${id}'`))?.status;

// ════ 2. A ella le llega el pedido ════════════════════════════════════════════
const [R1, R2, R3, R4] = [1, 2, 3, 4].map(R);
await como(ANA, pedido(R1));
{
  const a = await avisos(SOFI, "portal_pedido");
  check(a.length === 1 && a[0].title === "Te llegó un pedido personalizado", `el chatter lo crea y a Sofi le llega el aviso (${a.length})`);
  check(a[0]?.deep_link_url === `/portal/pedidos?p=${R1}` && a[0]?.required_permission_module === null, "a su portal, sin módulo (si no, la campana lo escondería)");
}

// ════ 3. portal_pedido ═════════════════════════════════════════════════════════
{
  const ajeno = await portal(LUNA, R1, "empezar");
  check(ajeno.error === "no_es_tuyo", `Luna no toca el pedido de Sofi (${ajeno.error})`);
  const antes = await portal(SOFI, R1, "empezar");
  check(antes.error === "por_aprobar" && (await estado(R1)) === "solicitado", "«Lo empiezo» no se salta la aprobación");
  const deOtro = await portal(SOFI, R1, "entregar", null, EMPRESA_DOC);
  check(deOtro.error === "archivo_invalido", "no ata un archivo que no es de su carpeta");
  const ent = await portal(SOFI, R1, "entregar", null, FOTO);
  check(ent.ok === true && ent.estado === "solicitado", `por aprobar: la entrega queda y el pedido sigue esperando (${ent.estado})`);
  const fila = await uno(db, `select kind, drive_item_id, storage_path, file_name, created_by from public.custom_request_attachments where request_id = '${R1}'`);
  check(fila?.kind === "entrega" && fila?.drive_item_id === FOTO && fila?.storage_path === null && fila?.file_name === "foto.jpg" && fila?.created_by === SOFI,
    "la entrega queda atada al pedido: el archivo de su Drive, a su nombre");
  const otraVez = await portal(SOFI, R1, "entregar", null, FOTO);
  check(otraVez.ya_estaba === true, "el mismo archivo dos veces no se duplica");

  // ════ 4. Los avisos al equipo ══════════════════════════════════════════════
  for (const [u, n] of [[ANA, "el chatter que lo vendió"], [MARIO, "su manager"], [SUSI, "el supervisor de Personalizados"]] as const) {
    const a = await avisos(u, "personalizado_entrega");
    check(a.length === 1 && a[0].title === "Sofi subió la entrega de un personalizado" && a[0].deep_link_url === `/personalizados?pedido=${R1}`,
      `le llega a ${n}, una vez (${a.length})`);
  }
  check((await avisos(OLGA, "personalizado_entrega")).length === 0, "nunca a la otra agencia");
  check((await avisos(SOFI, "personalizado_entrega")).length === 0, "ni a ella");

  // El supervisor lo aprueba: como ya estaba entregado, pasa directo a listo.
  await como(SUSI, `update public.custom_requests set status = 'aprobado' where id = '${R1}'`);
  check((await estado(R1)) === "listo", `aprobado con la entrega puesta = listo (${await estado(R1)})`);
  const a = await avisos(SOFI, "portal_pedido");
  check(a.at(-1)?.title === "Aprobaron un pedido que ya entregaste", `y a ella se le avisa (${a.at(-1)?.title})`);
}

{
  await como(ANA, pedido(R2));
  await como(SUSI, `update public.custom_requests set status = 'aprobado' where id = '${R2}'`);
  check((await avisos(SOFI, "portal_pedido")).at(-1)?.title === "Aprobaron tu pedido: ya puedes hacerlo", "al aprobarlo, a ella le llega «ya puedes hacerlo»");
  const emp = await portal(SOFI, R2, "empezar");
  check(emp.ok === true && (await estado(R2)) === "en_produccion", "«Lo empiezo» → en producción");
  const ent = await portal(SOFI, R2, "entregar", null, VIDEO);
  check(ent.estado === "listo" && (await estado(R2)) === "listo", "la entrega lo deja listo");
  // ════ 5. El historial dice que fue ella ════════════════════════════════════
  const ev = await q(db, `select actor_id, from_status, to_status from public.custom_request_events where request_id = '${R2}' order by created_at, id`);
  const deElla = ev.filter((e) => e.actor_id === SOFI).map((e) => `${e.from_status}→${e.to_status}`);
  check(deElla.join(",") === "aprobado→en_produccion,en_produccion→listo", `el historial la nombra a ella (${deElla.join(",")})`);
  check(ev.find((e) => e.to_status === "aprobado")?.actor_id === SUSI, "y al supervisor en la aprobación");
  const deSiMisma = (await q(db, `select count(*)::int n from public.notifications where user_id = '${SOFI}' and reference_id = '${R2}'`))[0].n;
  check(deSiMisma === 2, `de R2 le llegaron 2 avisos (nuevo y aprobado), ninguno por lo que hizo ella (${deSiMisma})`);
  await como(ANA, `update public.custom_requests set status = 'entregado' where id = '${R2}'`);
  check((await avisos(SOFI, "portal_pedido")).at(-1)?.title === "Tu personalizado ya le llegó al fan", "y cuando le llega al fan");
}

// ════ 6. «No puede» ════════════════════════════════════════════════════════════
{
  await como(ANA, pedido(R3));
  const sin = await portal(SOFI, R3, "no_puede", "   ");
  check(sin.error === "falta_motivo" && (await estado(R3)) === "solicitado", "sin motivo no se puede decir que no");
  const si = await portal(SOFI, R3, "no_puede", "No grabo en exteriores");
  check(si.ok === true && (await estado(R3)) === "no_puede", "con motivo: «La creadora no puede»");
  const ev = await uno(db, `select actor_id, note from public.custom_request_events where request_id = '${R3}' and to_status = 'no_puede'`);
  check(ev?.actor_id === SOFI && ev?.note === "No grabo en exteriores", "el historial guarda quién y por qué");
  const a = await avisos(SUSI, "personalizado_no_puede");
  check(a.length === 1 && a[0].title === "Sofi no puede hacer un personalizado", "al supervisor le llega el «no puede»");
  check((await avisos(ANA, "personalizado_no_puede")).length === 1 && (await avisos(MARIO, "personalizado_no_puede")).length === 1, "y al chatter y al manager");

  await falla(ANA, `update public.custom_requests set status = 'solicitado' where id = '${R3}'`, /Solo un supervisor/, "el chatter no lo resuelve");
  await falla(SUSI, `update public.custom_requests set status = 'aprobado' where id = '${R3}'`, /se renegocia/, "ni el supervisor lo aprueba de una: se renegocia, se deniega o se reembolsa");
  await como(SUSI, `update public.custom_requests set status = 'solicitado', description = 'Video bailando en casa' where id = '${R3}'`);
  check((await estado(R3)) === "solicitado", "el supervisor lo renegocia (vuelve a solicitado)");
  check((await avisos(SOFI, "portal_pedido")).at(-1)?.title === "Te volvieron a mandar un pedido", "y a ella le vuelve a llegar");

  await como(ANA, pedido(R4));
  await falla(ANA, `update public.custom_requests set status = 'no_puede' where id = '${R4}'`, /Solo la creadora/, "el equipo no dice por ella que no puede");
  await falla(ANA, `insert into public.custom_requests (creator_id, creator_name, fan_handle, description, status) values ('${C1}', 'Sofi', 'x', 'y', 'no_puede')`,
    /no nace/, "ni crea un pedido en «no puede»");
  const cerrado = await portal(SOFI, R2, "no_puede", "ya no quiero");
  check(cerrado.error === "no_se_puede", "lo que ya se entregó no se puede rechazar");
}

// ════ 7. Nadie más llama a portal_pedido ══════════════════════════════════════
await falla(SOFI, `select public.portal_pedido('${SOFI}', '${R4}', 'empezar')`, /permission denied/, "ni ella con su sesión (solo la edge)");
await falla(JHON, `select public.portal_pedido('${SOFI}', '${R4}', 'empezar')`, /permission denied/, "ni un admin");
await falla(ANA, `insert into public.custom_request_attachments (request_id, drive_item_id, file_name, kind, created_by) values ('${R4}', '${FOTO}', 'x', 'entrega', '${ANA}')`,
  /row-level security|violates/, "el equipo no ata un archivo del Drive (cra_insert pide la ruta del bucket)");
await falla("postgres", `insert into public.custom_request_attachments (request_id, file_name, kind) values ('${R4}', 'x', 'entrega')`,
  /custom_request_attachments_origen/, "un adjunto es del bucket o del Drive, uno de los dos");

// ════ 7b. Solo los pedidos nuevos (20261009110000; Jhon, 08/10) ══════════════
// Los de antes del portal (la hoja, septiembre) no existen para ella: si el
// equipo los mueve, no le llega nada. La fecha es la misma que la de la edge.
{
  await aplicar(db, N2, M2);
  const [d] = await q(db, `select public.portal_pedidos_desde() as d`);
  check(new Date(d.d).toISOString() === new Date(PEDIDOS_DESDE).toISOString(),
    `la base y la edge cuentan desde la misma fecha (${new Date(d.d).toISOString()} / ${PEDIDOS_DESDE})`);

  const [R5, R6] = [5, 6].map(R);
  const antes = (await avisos(SOFI, "portal_pedido")).length;
  // Uno de la hoja (creado en septiembre), como los 612 de prod.
  await db.exec(`insert into public.custom_requests (id, creator_id, creator_name, chatter_id, fan_handle, description, price_usd, source, created_at)
    values ('${R5}', '${C1}', 'Sofi', '${ANA}', 'fan_viejo', 'De la hoja', 80, 'sheet', '2026-09-02 12:00:00-05')`);
  await como(SUSI, `update public.custom_requests set status = 'aprobado' where id = '${R5}'`);
  await como(SUSI, `update public.custom_requests set status = 'en_produccion' where id = '${R5}'`);
  check((await avisos(SOFI, "portal_pedido")).length === antes, "un pedido de antes del portal: ni al crearlo ni al moverlo le llega nada");

  await como(ANA, pedido(R6));
  const a = await avisos(SOFI, "portal_pedido");
  check(a.length === antes + 1 && a.at(-1)?.title === "Te llegó un pedido personalizado", "uno nuevo sí le llega");

  await aplicar(db, "vuelta atrás (solo nuevos)", vuelta(M2));
  const [f] = await q(db, `select to_regprocedure('public.portal_pedidos_desde()') as f`);
  // Sin la fecha, el de la hoja vuelve a avisar (así se ve que lo cortaba ella).
  await como(SUSI, `update public.custom_requests set status = 'denegado' where id = '${R5}'`);
  const tras = await avisos(SOFI, "portal_pedido");
  check(f.f === null && tras.length === antes + 2 && tras.at(-1)?.title === "Se canceló un pedido",
    `la vuelta atrás saca la fecha y el aviso vuelve a ser para todos (${tras.length - antes})`);
  await aplicar(db, N2 + " (otra vez)", M2);
  check(true, "y se puede volver a aplicar");
}

// ════ 8. La vuelta atrás ═════════════════════════════════════════════════════
{
  await aplicar(db, "vuelta atrás", vuelta(M));
  const [f] = await q(db, `select to_regprocedure('public.portal_pedido(uuid,uuid,text,text,uuid)') as f,
    (select count(*)::int from information_schema.columns where table_name = 'custom_request_attachments' and column_name = 'drive_item_id') as col,
    (select count(*)::int from public.custom_requests where status = 'no_puede') as np`);
  check(f.f === null && f.col === 0 && f.np === 0, "la vuelta atrás saca la función, la columna y el estado nuevo");
  await como(SUSI, `update public.custom_requests set status = 'aprobado' where id = '${R4}'`);
  check((await estado(R4)) === "aprobado", "y el flujo de antes sigue andando");
  await aplicar(db, N + " (otra vez)", M);
  check(true, "y se puede volver a aplicar");
}

for (const m of ok) console.log(`ok   ${m}`);
for (const m of mal) console.log(`MAL  ${m}`);
console.log(`\n${ok.length} ok, ${mal.length} mal`);
if (mal.length) Deno.exit(1);
