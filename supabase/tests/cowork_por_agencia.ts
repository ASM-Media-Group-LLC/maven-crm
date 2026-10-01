// Cowork por agencia (migración 20261001213000_cowork_por_agencia.sql), probado
// contra un Postgres de verdad (PGlite) con el catálogo de PROD del 01/10:
// fixtures/prod_roles_20261001.sql (roles, auth, tenants) + fixtures/prod_cowork_20261001.sql
// (las 13 tablas de Cowork y sus 21 funciones, copiadas textual con sus huellas).
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/cowork_por_agencia.ts
//
// La línea de partida es prod con las migraciones que van ANTES de esta en el
// orden de aplicación: agencias_base, roles_por_agencia y personas_por_agencia
// (la de karma y directorio no toca Cowork ni carga en estos fixtures).
//
// Cómo está armado:
//   0. El fixture de Cowork trae sus huellas md5(prosrc); aquí se recalculan.
//   1. EQUIVALENCIA: con una sola agencia, cada persona ve lo mismo antes y
//      después: las 11 funciones, las 13 tablas por RLS y la moderación de 8 salas.
//   2. DOS agencias: cada cosa que la migración cierra se prueba primero abierta
//      (la línea base: si no está abierta, el test no prueba nada) y después
//      cerrada.
//   3. La vuelta atrás (las líneas «--|») deja las 10 funciones byte a byte,
//      las políticas como en prod y sin columnas nuevas; y se puede volver a aplicar.
//   4. Las negativas: con dos agencias al aplicar, o con una función de prod
//      distinta de la revisada, no corre y no deja nada a medias.
//
// Sale con código 1 si algo falla. Corre en el guard de cada PR.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FX_ROLES = leer("./fixtures/prod_roles_20261001.sql");
const FX_COWORK = leer("./fixtures/prod_cowork_20261001.sql");
const ANTES = ["20261001210000_agencias_base.sql", "20261001211000_roles_por_agencia.sql", "20261001212000_personas_por_agencia.sql"]
  .map((n) => ({ n, sql: leer(`../migrations/${n}`) }));
const NOMBRE = "20261001213000_cowork_por_agencia.sql";
const MIG = leer(`../migrations/${NOMBRE}`);
const VUELTA = MIG.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");
const HUELLAS = new Map([...FX_COWORK.matchAll(/^--   (\w+\([^)]*\))=([0-9a-f]{32})$/gm)].map((m) => [m[1], m[2]]));
const REEMPLAZADAS = [...MIG.matchAll(/^\s+\('(public\.\w+\([^)]*\))', '([0-9a-f]{32})'\)/gm)].map((m) => ({ fn: m[1], huella: m[2] }));

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);

// ─── Gente, agencias y datos del ensayo ──────────────────────────────────────
const T1 = "10000000-0000-4000-8000-000000000001"; // asm-tech
const T2 = "10000000-0000-4000-8000-000000000002"; // otra agencia
const P = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [JHON, ELSA, HANA, ANA, CARL] = [1, 2, 3, 4, 5].map(P); // asm-tech: admin, supervisor, anfitriona, participante, sin sesión
const [OLGA, PEPE, QUINO, SAM] = [11, 12, 13, 14].map(P);      // la otra: admin, supervisor, anfitrión, participante
const SINAG = P(20);                                            // cuenta sin agencia (registro público)
const PERSONAS_T1: [string, string][] = [["jhon", JHON], ["elsa", ELSA], ["hana", HANA], ["ana", ANA], ["carl", CARL]];

// Los 8 primeros caracteres del id de la sesión van en el nombre de sus salas.
const SA = "5a000000-0000-4000-8000-000000000001", SA2 = "5a200000-0000-4000-8000-000000000001";
const SB = "b5000000-0000-4000-8000-000000000001", SB2 = "b5200000-0000-4000-8000-000000000001";
const RA1 = "7a000000-0000-4000-8000-000000000001", RA2 = "7a000000-0000-4000-8000-000000000002";
const RB1 = "7b000000-0000-4000-8000-000000000001";
const MA = "3a000000-0000-4000-8000-000000000001", MB = "3b000000-0000-4000-8000-000000000001";
const SALAS = ["cowork_hub_5a000000", "cowork_5a000000_0", "cowork_meet_5a000000_3a000000", "cowork_1on1_5a000000_4a000000",
  "cowork_5a000000_deadbeef", "cowork_hub_5a200000", "meet_aaaa00000001", "call-c1"];

// Horas fijas (las dos bases del ensayo tienen que tener los MISMOS datos).
const AHORA = Date.now();
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();

const SEMILLA = `
insert into public.tenants(id, slug, name) values ('${T1}', 'asm-tech', 'ASM Tech');
insert into public.roles_config (name, is_system, level) values ('admin', true, 100), ('supervisor', true, 50), ('employee', true, 20);
update public.role_groups set is_admin = true, is_manager_or_above = true, is_supervisor_or_above = true where role_name = 'admin';
update public.role_groups set is_supervisor_or_above = true where role_name = 'supervisor';
insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
select rc.id, 'Cowork', null, true, case rc.name when 'employee' then 'self' else 'all' end from public.roles_config rc;
-- El alta real: handle_new_user crea perfil, rol employee y la membresía de asm-tech.
insert into auth.users(id, email, raw_user_meta_data) values
  ('${JHON}', 'jhon.lopez@maven-ai.me', '{"full_name":"Jhon"}'), ('${ELSA}', 'elsa@x.test', '{"full_name":"Elsa"}'),
  ('${HANA}', 'hana@x.test', '{"full_name":"Hana"}'), ('${ANA}', 'ana@x.test', '{"full_name":"Ana"}'),
  ('${CARL}', 'carl@x.test', '{"full_name":"Carl"}');
update public.user_roles set role = 'admin' where user_id = '${JHON}';
update public.user_roles set role = 'supervisor' where user_id = '${ELSA}';
`;

const DATOS_T1 = `
insert into public.cowork_break_limits (kind, label, minutos) values ('bano', 'Baño', 10), ('break', 'Break', 30);
insert into public.cowork_sessions (id, name, status, host_hub_livekit_room, created_by, created_at, ended_at, ended_by) values
  ('${SA}', 'Sala KASH', 'active', 'cowork_hub_5a000000', '${HANA}', '${hace(120)}', null, null),
  ('${SA2}', 'KASH ayer', 'ended', 'cowork_hub_5a200000', '${JHON}', '${hace(2000)}', '${hace(1500)}', '${JHON}');
insert into public.cowork_rooms (id, session_id, name, livekit_room_name) values
  ('${RA1}', '${SA}', 'Sala 1', 'cowork_5a000000_0'), ('${RA2}', '${SA}', 'Sala 2', 'cowork_5a000000_1');
insert into public.cowork_memberships (session_id, user_id, role) values
  ('${SA}', '${HANA}', 'host'), ('${SA}', '${ANA}', 'participant'), ('${SA2}', '${JHON}', 'host');
insert into public.cowork_room_assignments (session_id, user_id, room_id) values ('${SA}', '${ANA}', '${RA1}');
insert into public.cowork_breaks (session_id, room_id, user_id, kind, started_at, ended_at) values
  ('${SA}', '${RA1}', '${ANA}', 'bano', '${hace(40)}', '${hace(35)}'),
  ('${SA}', '${RA1}', '${ANA}', 'break', '${hace(10)}', null);
insert into public.cowork_llamados (session_id, room_id, user_id, kind, started_at, seconds, nonce) values
  ('${SA}', '${RA1}', '${ANA}', 'camara', '${hace(50)}', 30, 'n1');
insert into public.cowork_tiempo_segmentos (session_id, room_id, user_id, estado, started_at, last_seen_at, ended_at) values
  ('${SA}', '${RA1}', '${ANA}', 'activo', '${hace(60)}', '${hace(41)}', '${hace(40)}'),
  ('${SA}', '${RA1}', '${ANA}', 'pausa', '${hace(40)}', '${hace(35)}', '${hace(35)}'),
  ('${SA}', '${RA1}', '${HANA}', 'activo', '${hace(60)}', '${hace(20)}', '${hace(20)}');
insert into public.cowork_meets (id, session_id, created_by, livekit_room_name, started_at, ended_at, end_reason) values
  ('${MA}', '${SA}', '${HANA}', 'cowork_meet_5a000000_3a000000', '${hace(30)}', '${hace(25)}', 'terminado');
insert into public.cowork_meet_participants (meet_id, session_id, user_id, room_id, joined_at, left_at, left_reason) values
  ('${MA}', '${SA}', '${ANA}', '${RA1}', '${hace(30)}', '${hace(25)}', 'meet_terminado');
insert into public.cowork_host_requests (session_id, room_id, user_id, message, oneone_livekit_room) values
  ('${SA}', '${RA1}', '${ANA}', 'ayuda', 'cowork_1on1_5a000000_4a000000');
insert into public.meet_rooms (livekit_room_name, created_by) values ('meet_aaaa00000001', '${JHON}');
insert into public.calls (room_id, caller_id) values ('call-c1', '${ANA}');
`;

// La otra agencia entra después de las migraciones (todas exigen UNA agencia al
// aplicarse), como la va a crear el panel de plataforma.
const OTRA = `
insert into public.tenants(id, slug, name) values ('${T2}', 'otra', 'Otra agencia');
select public.sembrar_roles_de_agencia('${T2}', 'enterprise', '${T1}');
insert into auth.users(id, email, raw_user_meta_data) values
  ('${OLGA}', 'olga@otra.test', '{"full_name":"Olga"}'), ('${PEPE}', 'pepe@otra.test', '{"full_name":"Pepe"}'),
  ('${QUINO}', 'quino@otra.test', '{"full_name":"Quino"}'), ('${SAM}', 'sam@otra.test', '{"full_name":"Sam"}'),
  ('${SINAG}', 'sinag@x.test', '{"full_name":"Sin agencia"}');
insert into public.tenant_members(user_id, tenant_id) values ('${OLGA}', '${T2}'), ('${PEPE}', '${T2}'), ('${QUINO}', '${T2}'), ('${SAM}', '${T2}');
update public.user_roles set role = 'admin' where user_id = '${OLGA}';
update public.user_roles set role = 'supervisor' where user_id = '${PEPE}';
`;
const DATOS_T2 = `
insert into public.cowork_sessions (id, name, status, host_hub_livekit_room, created_by, created_at, ended_at, ended_by) values
  ('${SB}', 'Sala Otra', 'active', 'cowork_hub_b5000000', '${QUINO}', '${hace(100)}', null, null),
  ('${SB2}', 'Otra ayer', 'ended', 'cowork_hub_b5200000', '${OLGA}', '${hace(1900)}', '${hace(1400)}', '${OLGA}');
insert into public.cowork_rooms (id, session_id, name, livekit_room_name) values ('${RB1}', '${SB}', 'Sala 1', 'cowork_b5000000_0');
insert into public.cowork_memberships (session_id, user_id, role) values
  ('${SB}', '${QUINO}', 'host'), ('${SB}', '${SAM}', 'participant'), ('${SB2}', '${OLGA}', 'host');
insert into public.cowork_room_assignments (session_id, user_id, room_id) values ('${SB}', '${SAM}', '${RB1}');
insert into public.cowork_breaks (session_id, room_id, user_id, kind, started_at, ended_at) values
  ('${SB}', '${RB1}', '${SAM}', 'bano', '${hace(30)}', '${hace(22)}'),
  ('${SB}', '${RB1}', '${SAM}', 'bano', '${hace(5)}', null);
insert into public.cowork_llamados (session_id, room_id, user_id, kind, started_at, seconds, nonce) values
  ('${SB}', '${RB1}', '${SAM}', 'luz', '${hace(45)}', 20, 'n2');
insert into public.cowork_tiempo_segmentos (session_id, room_id, user_id, estado, started_at, last_seen_at, ended_at) values
  ('${SB}', '${RB1}', '${SAM}', 'activo', '${hace(55)}', '${hace(31)}', '${hace(30)}');
insert into public.cowork_meets (id, session_id, created_by, livekit_room_name, started_at, ended_at, end_reason) values
  ('${MB}', '${SB}', '${QUINO}', 'cowork_meet_b5000000_3b000000', '${hace(28)}', '${hace(24)}', 'terminado');
insert into public.cowork_meet_participants (meet_id, session_id, user_id, room_id, joined_at, left_at, left_reason) values
  ('${MB}', '${SB}', '${SAM}', '${RB1}', '${hace(28)}', '${hace(24)}', 'meet_terminado');
insert into public.meet_rooms (livekit_room_name, created_by) values ('meet_bbbb00000001', '${OLGA}');
insert into public.calls (room_id, caller_id) values ('call-c2', '${SAM}');
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}
type Modo = "prod" | "con";
async function nueva(modo: Modo, extra = ""): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FX_ROLES);
  await db.exec(FX_COWORK);
  await db.exec(SEMILLA);
  for (const m of ANTES) await aplicar(db, m.n, m.sql);
  await db.exec(DATOS_T1 + extra);
  if (modo === "con") await aplicar(db, NOMBRE, MIG);
  return db;
}
async function dosAgencias(modo: Modo): Promise<PGlite> {
  const db = await nueva(modo);
  await db.exec(OTRA);
  if (modo === "con") await db.exec(`select public.sembrar_cowork_de_agencia('${T2}', '${T1}')`);
  await db.exec(DATOS_T2);
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
async function probar(db: PGlite, quien: Quien, sql: string): Promise<string> {
  await db.exec("begin");
  try { await entrar(db, quien); await db.exec(sql); return "anduvo"; }
  catch (e) { return msg(e); }
  finally { await db.exec("rollback"); }
}
const ids = (fs: Fila[], k = "id") => fs.map((f) => String(f[k])).sort();
const huellaDe = async (db: PGlite, f: string) => (await uno(db, `select md5(prosrc) h from pg_proc where oid = '${f}'::regprocedure`))?.h;

// Todo lo que una persona ve de Cowork, en un solo JSON. Lo que depende del
// reloj (segundos de una pausa abierta) se saca: las dos bases no corren en el
// mismo instante.
const VISTA = (quien: string) => { const u = /^[0-9a-f-]{36}$/.test(quien) ? `'${quien}'::uuid` : "null::uuid"; return `select jsonb_build_object(
  'activas_admin', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.cowork_sesiones_activas_admin() x),
  'finalizadas',   (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.cowork_mis_sesiones_finalizadas() x),
  'mis_activas',   (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]') from public.cowork_mis_sesiones_activas() x),
  'supervisa',     jsonb_build_array(public.cowork_puede_supervisar(${u}, '${SA}'), public.cowork_puede_supervisar(${u}, '${SA2}')),
  'abiertas',      (select coalesce(jsonb_agg(to_jsonb(x) - 'segundos' - 'excedida' order by x.user_id, x.kind), '[]') from public.cowork_pausas_abiertas('${SA}') x),
  'bano',          (select coalesce(jsonb_agg(to_jsonb(x) order by x.user_id), '[]') from public.cowork_bano_consumido_hoy(array['${ANA}', '${HANA}', '${CARL}']::uuid[]) x),
  'tiempo',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.dia, x.user_id), '[]') from public.cowork_tiempo_diario(null, null, null, 500, 0) x),
  'equipo',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.user_id), '[]') from public.equipo_tiempo_cowork(current_date - 7, current_date + 1) x),
  'pausas',        (select coalesce(jsonb_agg(to_jsonb(x) order by x.dia, x.user_id), '[]') from public.cowork_pausas_resumen() x),
  'meets',         (select coalesce(jsonb_agg(to_jsonb(x) - 'meet_seconds' - 'seconds' order by x.meet_id, x.user_id), '[]') from public.cowork_meets_resumen() x),
  'reloj',         (select coalesce(jsonb_agg(to_jsonb(x) order by x.user_id), '[]') from public.cowork_reloj_de_sala('${SA}') x),
  'modera',        (select jsonb_agg(public.can_moderate_livekit_room(${u}, r) order by r) from unnest(array[${SALAS.map((s) => `'${s}'`).join(", ")}]) r),
  'tablas', jsonb_build_object(
    'sessions',     (select coalesce(jsonb_agg(id order by id), '[]') from public.cowork_sessions),
    'rooms',        (select coalesce(jsonb_agg(id order by id), '[]') from public.cowork_rooms),
    'memberships',  (select coalesce(jsonb_agg(id order by id), '[]') from public.cowork_memberships),
    'assignments',  (select coalesce(jsonb_agg(id order by id), '[]') from public.cowork_room_assignments),
    'breaks',       (select coalesce(jsonb_agg(id order by id), '[]') from public.cowork_breaks),
    'limits',       (select coalesce(jsonb_agg(kind || '=' || minutos order by kind), '[]') from public.cowork_break_limits),
    'llamados',     (select coalesce(jsonb_agg(id order by id), '[]') from public.cowork_llamados),
    'segmentos',    (select coalesce(jsonb_agg(id order by id), '[]') from public.cowork_tiempo_segmentos),
    'meets',        (select coalesce(jsonb_agg(id order by id), '[]') from public.cowork_meets),
    'participants', (select coalesce(jsonb_agg(id order by id), '[]') from public.cowork_meet_participants),
    'host_req',     (select coalesce(jsonb_agg(id order by id), '[]') from public.cowork_host_requests),
    'screenshare',  (select count(*) from public.cowork_screenshare_requests),
    'incognito',    (select count(*) from public.cowork_incognito_watch)
  )
) v`; };
// En prod los id de pausas, salas, etc. salen de gen_random_uuid: se comparan por
// cantidad, salvo los que el ensayo fija (sesiones, salas, meets).
const normalizar = (v: Fila) => {
  const t = { ...v.tablas };
  for (const k of ["memberships", "assignments", "breaks", "llamados", "segmentos", "participants", "host_req"]) t[k] = t[k].length;
  const sinId = (xs: Fila[]) => xs.map(({ id: _id, ...r }) => r);
  return { ...v, tablas: t, meets: v.meets, pausas: v.pausas, tiempo: v.tiempo, abiertas: sinId(v.abiertas) };
};

// ════ 0. El fixture es prod ══════════════════════════════════════════════════
{
  const db = await nueva("prod");
  const r = await q(db, `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' f, md5(p.prosrc) h
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
  const vivo = new Map(r.map((x) => [x.f, x.h]));
  const distintas = [...HUELLAS].filter(([f, h]) => vivo.get(f) !== h).map(([f]) => f);
  check(HUELLAS.size === 21 && distintas.length === 0, `las ${HUELLAS.size} funciones del fixture de Cowork tienen las huellas de prod${distintas.length ? ` — distintas: ${distintas.join(", ")}` : ""}`);
  const faltan = REEMPLAZADAS.filter((x) => {
    const firma = [...HUELLAS.keys()].find((k) => k.startsWith(x.fn.replace(/^public\./, "").replace(/\(.*/, "(")));
    return !firma || HUELLAS.get(firma) !== x.huella;
  });
  check(REEMPLAZADAS.length === 10 && faltan.length === 0, `las 10 huellas que exige la migración son las del fixture (= prod)${faltan.length ? ` — no: ${faltan.map((x) => x.fn).join(", ")}` : ""}`);
}

// ════ 1. Con una sola agencia, todos ven lo mismo que en prod ════════════════
const prod1 = await nueva("prod"), con1 = await nueva("con");
{
  const s = await uno(con1, `select (select count(*)::int from public.cowork_sessions where tenant_id = '${T1}') sesiones,
    (select count(*)::int from public.cowork_break_limits where tenant_id = '${T1}') topes,
    (select count(*)::int from public.cowork_por_agencia_respaldo) respaldo`);
  check(s?.sesiones === 2 && s?.topes === 2 && s?.respaldo === 10, `la migración asigna las 2 sesiones y los 2 topes a la agencia, y respalda las 10 funciones (${JSON.stringify(s)})`);
  const db = await nueva("prod");
  const leerUpd = async () => JSON.stringify(await q(db, `select id, updated_at::text u from public.cowork_sessions order by id`));
  const antes = await leerUpd();
  await aplicar(db, NOMBRE, MIG);
  check(antes === await leerUpd(), "asignar la agencia no toca updated_at de las sesiones");

  for (const [n, u] of [...PERSONAS_T1, ["service_role", "service_role"]] as [string, string][]) {
    const a = normalizar((await como(prod1, u, VISTA(u)))[0].v);
    const b = normalizar((await como(con1, u, VISTA(u)))[0].v);
    const iguales = JSON.stringify(a) === JSON.stringify(b);
    let donde = "";
    if (!iguales) donde = " — difiere en: " + Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).join(", ");
    check(iguales, `${n}: con una sola agencia ve lo mismo que en prod (11 funciones, 13 tablas, 8 salas)${donde}`);
  }
  // Que no sea una comparación vacía.
  const j = (await como(prod1, JHON, VISTA(JHON)))[0].v;
  const e = (await como(prod1, ELSA, VISTA(ELSA)))[0].v;
  const h = (await como(prod1, HANA, VISTA(HANA)))[0].v;
  check(j.activas_admin.length === 1 && j.finalizadas.length === 1 && j.tiempo.length >= 2 && j.modera.every((x: boolean) => x)
    && e.abiertas.length === 1 && e.tablas.breaks.length === 2 && e.pausas.length === 1 && e.meets.length === 1
    && h.reloj.length === 1 && h.supervisa.join() === "false,false",
    `y no es una comparación vacía (admin: ${j.activas_admin.length} activa, ${j.tiempo.length} días-persona, modera ${j.modera.filter(Boolean).length}/8; supervisora: ${e.abiertas.length} pausa abierta, ${e.tablas.breaks.length} pausas)`);
}

// ════ 2. Dos agencias ═════════════════════════════════════════════════════════
const prod = await dosAgencias("prod");
const con = await dosAgencias("con");

// 2.1 La agencia de la sesión la pone la base
{
  const s = await q(con, `select id, tenant_id from public.cowork_sessions order by id`);
  check(s.find((x) => x.id === SB)?.tenant_id === T2 && s.find((x) => x.id === SA)?.tenant_id === T1,
    "una sesión creada sin agencia queda en la de quien la crea (la edge no la manda)");
  const r1 = await probar(con, "postgres", `insert into public.cowork_sessions (name, host_hub_livekit_room, created_by, tenant_id) values ('x', 'cowork_hub_x', '${QUINO}', '${T1}')`);
  check(/tiene que ser de la agencia de quien la crea/.test(r1), `no se puede crear una sesión en otra agencia (${r1.slice(0, 80)})`);
  const r2 = await probar(con, "postgres", `insert into public.cowork_sessions (name, host_hub_livekit_room, created_by) values ('x', 'cowork_hub_x', '${SINAG}')`);
  check(/no es de ninguna agencia/.test(r2), `una cuenta sin agencia no crea sesiones (${r2.slice(0, 80)})`);
  const r3 = await probar(con, "postgres", `update public.cowork_sessions set tenant_id = '${T2}' where id = '${SA}'`);
  check(/no se cambia/.test(r3), "la agencia de una sesión no se cambia");
  const r4 = await probar(con, "postgres", `update public.cowork_sessions set name = 'otro nombre', status = 'ended' where id = '${SA}'`);
  check(r4 === "anduvo", "el resto de la sesión se sigue editando");
}

// 2.2 Nadie queda dentro de una sesión de otra agencia (las 10 tablas)
{
  const MA2 = "3a000000-0000-4000-8000-000000000002";
  const casos: [string, (u: string) => string][] = [
    ["cowork_memberships", (u) => `insert into public.cowork_memberships (session_id, user_id, role) values ('${SA}', '${u}', 'host')`],
    ["cowork_room_assignments", (u) => `insert into public.cowork_room_assignments (session_id, user_id, room_id) values ('${SA}', '${u}', '${RA2}')`],
    ["cowork_breaks", (u) => `insert into public.cowork_breaks (session_id, user_id, kind, started_at, ended_at) values ('${SA}', '${u}', 'bano', now() - interval '3 min', now())`],
    ["cowork_llamados", (u) => `insert into public.cowork_llamados (session_id, user_id, kind, started_at, nonce) values ('${SA}', '${u}', 'luz', now(), 'z')`],
    ["cowork_tiempo_segmentos", (u) => `insert into public.cowork_tiempo_segmentos (session_id, user_id, estado, ended_at) values ('${SA}', '${u}', 'activo', now())`],
    ["cowork_meets", (u) => `insert into public.cowork_meets (id, session_id, created_by, livekit_room_name) values ('${MA2}', '${SA}', '${u}', 'cowork_meet_5a000000_3a000002')`],
    ["cowork_meet_participants", (u) => `insert into public.cowork_meet_participants (meet_id, session_id, user_id) values ('${MA}', '${SA}', '${u}')`],
    ["cowork_host_requests", (u) => `insert into public.cowork_host_requests (session_id, room_id, user_id) values ('${SA}', '${RA1}', '${u}')`],
    ["cowork_screenshare_requests", (u) => `insert into public.cowork_screenshare_requests (session_id, room_id, user_id) values ('${SA}', '${RA1}', '${u}')`],
    ["cowork_incognito_watch", (u) => `insert into public.cowork_incognito_watch (session_id, user_id) values ('${SA}', '${u}')`],
  ];
  for (const [tabla, sql] of casos) {
    const base = await probar(prod, "postgres", sql(SAM));
    const cerrado = await probar(con, "postgres", sql(SAM));
    const propio = await probar(con, "postgres", sql(CARL));
    check(base === "anduvo" && /cowork_misma_agencia: .* no es de la agencia de la sesión/.test(cerrado) && propio === "anduvo",
      `${tabla}: en prod entra alguien de otra agencia (${base}); con la migración no (${cerrado.slice(0, 60)}…), y alguien de la agencia sí (${propio})`);
  }
  const sin = await probar(con, "postgres", casos[0][1](SINAG));
  check(/no es de la agencia/.test(sin), "una cuenta sin agencia tampoco entra a una sesión");
  const mover = await probar(con, "postgres", `update public.cowork_memberships set user_id = '${SAM}' where session_id = '${SA}' and user_id = '${ANA}'`);
  check(/no es de la agencia/.test(mover), "ni cambiando la persona de una membresía que ya existe");
  const latido = await probar(con, "postgres", `update public.cowork_tiempo_segmentos set last_seen_at = now(), estado = 'pausa' where user_id = '${ANA}'`);
  check(latido === "anduvo", "el latido del reloj (UPDATE de last_seen_at/estado) no pasa por el control");
}

// 2.3 Los topes de pausa
{
  const b = await como(prod, SAM, `select kind, minutos from public.cowork_break_limits order by kind`);
  check(b.length === 2, "línea base: en prod hay UNA fila por tipo para todo Maven");
  const pb = await como(prod, OLGA, `update public.cowork_break_limits set minutos = 99 where kind = 'bano' returning kind`);
  const kash = await uno(prod, `select minutos from public.cowork_break_limits where kind = 'bano'`);
  check(pb.length === 1 && kash?.minutos === 99, "línea base: en prod el admin de otra agencia le cambia el tope de baño a KASH");
  const c = await como(con, SAM, `select kind, minutos from public.cowork_break_limits order by kind`);
  check(c.length === 2, `con la migración la otra agencia tiene sus propios topes, sembrados (${c.length})`);
  await como(con, OLGA, `update public.cowork_break_limits set minutos = 5 where kind = 'bano'`);
  const t = await q(con, `select tenant_id, minutos from public.cowork_break_limits where kind = 'bano' order by tenant_id`);
  check(t.find((x) => x.tenant_id === T1)?.minutos === 10 && t.find((x) => x.tenant_id === T2)?.minutos === 5,
    "el admin de la otra agencia cambia SUS topes y los de KASH quedan en 10");
  const mueve = await probar(con, OLGA, `update public.cowork_break_limits set tenant_id = '${T1}' where kind = 'break'`);
  check(/row-level security|violates/.test(mueve), `un admin no pasa un tope a otra agencia (${mueve.slice(0, 70)})`);
  const resiembra = await uno(con, `select public.sembrar_cowork_de_agencia('${T2}', '${T1}') n`);
  check(resiembra?.n === 0, "sembrar dos veces no pisa los topes que la agencia ya cambió");
  const siembraApp = await probar(con, OLGA, `select public.sembrar_cowork_de_agencia('${T2}', '${T1}')`);
  check(/permission denied/.test(siembraApp), "desde la app nadie siembra topes");
  // El tope de cada pausa es el de su agencia (con el JOIN solo por tipo se duplicaba).
  const api = await como(con, "service_role", `select profile_id, kind, limit_seconds from public.api_cowork_breaks(null, null, null, 500, 0)`);
  const nPausas = await uno(con, `select count(*)::int n from public.cowork_breaks`);
  check(api.length === nPausas?.n && api.find((x) => x.profile_id === SAM && x.kind === "bathroom")?.limit_seconds === 300
    && api.find((x) => x.profile_id === ANA && x.kind === "bathroom")?.limit_seconds === 600,
    `api_cowork_breaks: una fila por pausa (${api.length}/${nPausas?.n}) y el tope de su agencia (Sam 300 s, Ana 600 s)`);
  const res = await como(con, PEPE, `select user_id, bano_limite_seg from public.cowork_pausas_resumen()`);
  check(res.length === 1 && res[0].user_id === SAM && res[0].bano_limite_seg === 300, "el resumen de pausas usa el tope de la agencia");
  const abiertas = await como(con, QUINO, `select user_id, limite_segundos from public.cowork_pausas_abiertas('${SB}')`);
  check(abiertas.length === 1 && abiertas[0].limite_segundos === 300, "y las pausas abiertas también");
}

// 2.4 Lo que veía todo, ahora ve lo de su agencia
type Caso = { que: string; quien: string; sql: string; ajeno: (fs: Fila[]) => boolean; propio: (fs: Fila[]) => boolean };
const tiene = (k: string, v: string) => (fs: Fila[]) => fs.some((f) => f[k] === v);
const casos: Caso[] = [
  { que: "el tablero de sesiones activas del admin", quien: OLGA, sql: `select id from public.cowork_sesiones_activas_admin()`, ajeno: tiene("id", SA), propio: tiene("id", SB) },
  { que: "las sesiones finalizadas que ve un admin", quien: OLGA, sql: `select id from public.cowork_mis_sesiones_finalizadas()`, ajeno: tiene("id", SA2), propio: tiene("id", SB2) },
  { que: "entrar como anfitrión con alcance (cowork_puede_supervisar)", quien: OLGA,
    sql: `select x.s as id from (values ('${SA}'::uuid), ('${SB}'::uuid)) x(s) where public.cowork_puede_supervisar('${OLGA}', x.s)`, ajeno: tiene("id", SA), propio: tiene("id", SB) },
  { que: "las pausas abiertas de una sesión (supervisor)", quien: PEPE,
    sql: `select user_id from public.cowork_pausas_abiertas('${SA}') union all select user_id from public.cowork_pausas_abiertas('${SB}')`, ajeno: tiene("user_id", ANA), propio: tiene("user_id", SAM) },
  { que: "el baño consumido hoy", quien: SAM, sql: `select user_id from public.cowork_bano_consumido_hoy(array['${ANA}', '${SAM}']::uuid[])`, ajeno: tiene("user_id", ANA), propio: tiene("user_id", SAM) },
  { que: "el reporte de tiempo (admin)", quien: OLGA, sql: `select user_id from public.cowork_tiempo_diario(null, null, null, 500, 0)`, ajeno: tiene("user_id", ANA), propio: tiene("user_id", SAM) },
  { que: "el tiempo del equipo", quien: OLGA, sql: `select user_id from public.equipo_tiempo_cowork(current_date - 7, current_date + 1)`, ajeno: tiene("user_id", ANA), propio: tiene("user_id", SAM) },
  { que: "el resumen de pausas (supervisor)", quien: PEPE, sql: `select user_id from public.cowork_pausas_resumen()`, ajeno: tiene("user_id", ANA), propio: tiene("user_id", SAM) },
  { que: "el resumen de meets (supervisor)", quien: PEPE, sql: `select user_id from public.cowork_meets_resumen()`, ajeno: tiene("user_id", ANA), propio: tiene("user_id", SAM) },
  { que: "las pausas por RLS (supervisor)", quien: PEPE, sql: `select user_id from public.cowork_breaks`, ajeno: tiene("user_id", ANA), propio: tiene("user_id", SAM) },
  { que: "los llamados por RLS (supervisor)", quien: PEPE, sql: `select user_id from public.cowork_llamados`, ajeno: tiene("user_id", ANA), propio: tiene("user_id", SAM) },
  { que: "el reloj por RLS (admin)", quien: OLGA, sql: `select user_id from public.cowork_tiempo_segmentos`, ajeno: tiene("user_id", ANA), propio: tiene("user_id", SAM) },
];
for (const c of casos) {
  const b = await como(prod, c.quien, c.sql);
  const a = await como(con, c.quien, c.sql);
  check(c.ajeno(b), `línea base: en prod ${c.que} de la otra agencia muestra lo de KASH (${b.length} filas)`);
  check(!c.ajeno(a) && c.propio(a), `con la migración, ${c.que} muestra solo lo de su agencia (${a.length} filas)`);
}
{
  // Y KASH sigue viendo lo suyo.
  const j = await como(con, JHON, `select id from public.cowork_sesiones_activas_admin()`);
  const e = await como(con, ELSA, `select user_id from public.cowork_breaks`);
  const t = await como(con, JHON, `select user_id from public.cowork_tiempo_diario(null, null, null, 500, 0)`);
  check(JSON.stringify(ids(j)) === JSON.stringify([SA]) && e.length === 2 && e.every((x) => x.user_id === ANA) && t.some((x) => x.user_id === ANA) && !t.some((x) => x.user_id === SAM),
    "y KASH sigue viendo lo suyo, sin lo de la otra");
  // La API pública (service_role) sigue viendo todo: la corta aislamiento.ts con más de una agencia.
  const api = await como(con, "service_role", `select user_id from public.cowork_tiempo_diario(null, null, null, 500, 0)`);
  check(api.some((x) => x.user_id === ANA) && api.some((x) => x.user_id === SAM), "service_role (API pública) sigue viendo todo, como antes");
}

// 2.5 Moderar salas de LiveKit
{
  const m = async (db: PGlite, u: string, sala: string) => (await uno(db, `select public.can_moderate_livekit_room('${u}', '${sala}') v`))?.v;
  check(await m(prod, OLGA, "cowork_5a000000_0") === true && await m(prod, OLGA, "meet_aaaa00000001") === true && await m(prod, OLGA, "call-c1") === true,
    "línea base: en prod el admin de otra agencia modera las salas de Cowork, Meet y llamadas de KASH");
  const esperado: [string, string, boolean][] = [
    [OLGA, "cowork_5a000000_0", false], [OLGA, "cowork_hub_5a000000", false], [OLGA, "cowork_meet_5a000000_3a000000", false],
    [OLGA, "meet_aaaa00000001", false], [OLGA, "call-c1", false],
    [OLGA, "cowork_b5000000_0", true], [OLGA, "cowork_hub_b5000000", true], [OLGA, "meet_bbbb00000001", true], [OLGA, "call-c2", true],
    [JHON, "cowork_5a000000_0", true], [JHON, "cowork_1on1_5a000000_4a000000", true], [JHON, "cowork_5a000000_deadbeef", true],
    [JHON, "meet_aaaa00000001", true], [JHON, "call-c1", true], [JHON, "cowork_b5000000_0", false], [JHON, "call-c2", false],
    [HANA, "cowork_5a000000_0", true], [QUINO, "cowork_b5000000_0", true], [QUINO, "cowork_5a000000_0", false],
    [SINAG, "cowork_5a000000_0", false],
  ];
  const mal2: string[] = [];
  for (const [u, sala, v] of esperado) if (await m(con, u, sala) !== v) mal2.push(`${u.slice(-2)} ${sala} ≠ ${v}`);
  check(mal2.length === 0, `con la migración, cada admin modera solo las salas de su agencia; los anfitriones, las de su sesión (${esperado.length} casos)${mal2.length ? " — " + mal2.join("; ") : ""}`);
  check(await m(prod, JHON, "sala-rara") === true && await m(con, JHON, "sala-rara") === false,
    "un nombre de sala que no es de Cowork, Meet ni llamadas ya no lo modera ningún admin (antes, todos)");
  const a = await q(con, `select public.agencia_de_sala_livekit(x) a from unnest(array['cowork_5a000000_0', 'cowork_b5000000_0', 'meet_bbbb00000001', 'call-c1', 'sala-rara', 'cowork_ffffffff_0']) x`);
  check(JSON.stringify(a.map((x) => x.a)) === JSON.stringify([T1, T2, T2, T1, null, null]), "agencia_de_sala_livekit sabe de quién es cada sala (y NULL si no sabe)");
  const anon = await probar(con, "anon", `select public.agencia_de_sala_livekit('cowork_5a000000_0')`);
  check(/permission denied/.test(anon), "anon no la puede llamar");
}

// ════ 3. La vuelta atrás ══════════════════════════════════════════════════════
{
  const politicas = `select tablename || '|' || policyname || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '') p
    from pg_policies where tablename like 'cowork%' order by 1`;
  const antes = (await q(prod1, politicas)).map((x) => x.p);
  const db = await nueva("con");
  await aplicar(db, "vuelta atrás de " + NOMBRE, VUELTA);
  const distintas: string[] = [];
  for (const x of REEMPLAZADAS) if (await huellaDe(db, x.fn) !== x.huella) distintas.push(x.fn);
  check(distintas.length === 0, `las 10 funciones vuelven byte a byte a prod${distintas.length ? " — no: " + distintas.join(", ") : ""}`);
  const despues = (await q(db, politicas)).map((x) => x.p);
  check(JSON.stringify(antes) === JSON.stringify(despues), `las ${antes.length} políticas de Cowork vuelven a ser las de prod`);
  const resto = await uno(db, `select
    (select count(*)::int from information_schema.columns where table_schema = 'public' and column_name = 'tenant_id' and table_name like 'cowork%') columnas,
    (select count(*)::int from pg_trigger where tgname like 'cowork%agencia') triggers,
    (select count(*)::int from pg_proc where proname in ('cowork_misma_agencia', 'cowork_sessions_agencia', 'cowork_sesiones_de_mi_agencia', 'agencia_de_sala_livekit', 'sembrar_cowork_de_agencia')) funciones,
    (select pg_get_constraintdef(oid) from pg_constraint where conname = 'cowork_break_limits_pkey') pk,
    to_regclass('public.cowork_por_agencia_respaldo') is null sin_respaldo`);
  check(resto?.columnas === 0 && resto?.triggers === 0 && resto?.funciones === 0 && resto?.pk === "PRIMARY KEY (kind)" && resto?.sin_respaldo === true,
    `sin columnas, triggers ni funciones nuevas, y la clave de los topes vuelve a ser el tipo (${JSON.stringify(resto)})`);
  const v = normalizar((await como(db, JHON, VISTA(JHON)))[0].v);
  const p = normalizar((await como(prod1, JHON, VISTA(JHON)))[0].v);
  check(JSON.stringify(v) === JSON.stringify(p), "y el admin ve exactamente lo mismo que en prod");
  await aplicar(db, NOMBRE + " (otra vez)", MIG);
  check(true, "después de la vuelta atrás, se puede volver a aplicar");
}

// ════ 4. Las negativas ════════════════════════════════════════════════════════
{
  const db = await nueva("prod");
  await db.exec(OTRA);
  const r = await (async () => { try { await aplicar(db, NOMBRE, MIG); return "anduvo"; } catch (e) { return msg(e); } })();
  check(/UNA sola agencia/.test(r), `con dos agencias al aplicar, no corre (${r.slice(-70)})`);
  const nada = await uno(db, `select to_regclass('public.cowork_por_agencia_respaldo') is null a,
    not exists (select 1 from information_schema.columns where table_name = 'cowork_sessions' and column_name = 'tenant_id') b`);
  check(nada?.a === true && nada?.b === true, "y no deja nada a medias");
}
{
  const db = await nueva("prod", `create or replace function public.cowork_tiempo_diario(_desde date default null, _hasta date default null, _user_id uuid default null, _limit integer default 100, _offset integer default 0)
    returns table(dia date, user_id uuid, nombre text, seg_activo integer, seg_meet integer, seg_pausa integer, seg_sin_camara integer, seg_sin_pantalla integer, seg_fuera_de_camara integer, seg_en_sala integer, horas_activas numeric, sesiones integer, primer_ingreso timestamp with time zone, ultima_salida timestamp with time zone, seg_sin_conexion integer, seg_sin_conexion_larga integer)
    language sql stable security definer set search_path to 'public' as $f$ select null::date, null::uuid, null::text, 0, 0, 0, 0, 0, 0, 0, 0::numeric, 0, null::timestamptz, null::timestamptz, 0, 0 where false $f$;`);
  const r = await (async () => { try { await aplicar(db, NOMBRE, MIG); return "anduvo"; } catch (e) { return msg(e); } })();
  check(/cowork_tiempo_diario.* no es la que se revisó/.test(r), `con una función de prod distinta de la revisada, no corre (${r.slice(-90)})`);
  const nada = await uno(db, `select to_regclass('public.cowork_por_agencia_respaldo') is null a`);
  check(nada?.a === true, "y no deja nada a medias");
}

for (const m of ok) console.log(`✓ ${m}`);
for (const m of mal) console.log(`✗ ${m}`);
console.log(`\n${ok.length} ok${mal.length ? `, ${mal.length} MAL` : ""}`);
if (mal.length) Deno.exit(1);
