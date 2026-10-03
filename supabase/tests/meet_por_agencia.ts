// Meet, llamadas, grabaciones y LiveKit por agencia (migración
// 20261003120000_meet_livekit_por_agencia.sql), probado contra un Postgres de
// verdad (PGlite) con el catálogo de PROD del 01/10:
// fixtures/prod_roles_20261001.sql (roles, auth, tenants) + fixtures/prod_cowork_20261001.sql
// (Cowork) + fixtures/prod_meet_20261001.sql (las 9 tablas de Meet, llamadas y
// grabaciones y sus 7 funciones, copiadas textual con sus huellas).
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/meet_por_agencia.ts
//
// La línea de partida es prod con las migraciones que van ANTES de esta en el
// orden de aplicación: agencias_base, roles_por_agencia, personas_por_agencia y
// cowork_por_agencia (que crea agencia_de_sala_livekit).
//
// Stubs del banco (NO son de prod, ni del fixture): chat_participants (solo las
// dos columnas que lee calls_agencia) y v_recordings_usage, copiada de
// 20260820210000_meeting_recordings.
//
// Cómo está armado:
//   0. El fixture de Meet trae sus huellas md5(prosrc); aquí se recalculan. Y las
//      que exige la migración son las de prod después de cowork_por_agencia.
//   1. EQUIVALENCIA: con una sola agencia, cada persona ve lo mismo antes y
//      después (9 tablas por RLS, la vista de uso, y de quién es, quién modera y
//      quién es dueño de 10 salas). Lo que cambia a propósito se prueba aparte.
//   2. DOS agencias: cada hueco que la migración cierra se prueba primero
//      abierto (la línea base: si no está abierto, el test no prueba nada) y
//      después cerrado, y el camino legítimo de la app sigue andando.
//   3. La guarda de las edges (supabase/functions/_shared/livekit-agencia.ts)
//      dice lo mismo que la base, antes y después de la migración.
//   4. La vuelta atrás (las líneas «--|») deja las 3 funciones byte a byte, las
//      políticas, los privilegios y los grants como en prod, sin columnas,
//      triggers ni funciones nuevas; y se puede volver a aplicar.
//   5. Las negativas: con dos agencias al aplicar, con una función de prod
//      distinta de la revisada o sin cowork_por_agencia, no corre y no deja nada.
//
// Sale con código 1 si algo falla. Corre en el guard de cada PR.
import { PGlite } from "npm:@electric-sql/pglite@0.3";
import { agenciaDeSala, type Base } from "../functions/_shared/livekit-agencia.ts";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FX_ROLES = leer("./fixtures/prod_roles_20261001.sql");
const FX_COWORK = leer("./fixtures/prod_cowork_20261001.sql");
const FX_MEET = leer("./fixtures/prod_meet_20261001.sql");
const ANTES = ["20261001210000_agencias_base.sql", "20261001211000_roles_por_agencia.sql", "20261001212000_personas_por_agencia.sql", "20261001213000_cowork_por_agencia.sql"]
  .map((n) => ({ n, sql: leer(`../migrations/${n}`) }));
const NOMBRE = "20261003120000_meet_livekit_por_agencia.sql";
const MIG = leer(`../migrations/${NOMBRE}`);
const VUELTA = MIG.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");
const HUELLAS = new Map([...FX_MEET.matchAll(/^--   (\w+\([^)]*\))=([0-9a-f]{32})$/gm)].map((m) => [m[1], m[2]]));
const REEMPLAZADAS = [...MIG.matchAll(/^\s+\('(public\.\w+\([^)]*\))', '([0-9a-f]{32})'\)/gm)].map((m) => ({ fn: m[1], huella: m[2] }));

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);

// ─── Gente, agencias y datos del ensayo ──────────────────────────────────────
const T1 = "10000000-0000-4000-8000-000000000001"; // asm-tech (KASH)
const T2 = "10000000-0000-4000-8000-000000000002"; // otra agencia
const P = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [JHON, ELSA, HANA, ANA, CARL] = [1, 2, 3, 4, 5].map(P); // asm-tech: admin, supervisor, anfitriona, empleada, sin nada
const [OLGA, PEPE, QUINO, SAM] = [11, 12, 13, 14].map(P);      // la otra: admin, supervisor, anfitrión, empleado
const SINAG = P(20);                                            // cuenta sin agencia (registro público)
const PERSONAS_T1: [string, string][] = [["jhon", JHON], ["elsa", ELSA], ["hana", HANA], ["ana", ANA], ["carl", CARL]];

const id = (pre: string, n: number) => `${pre}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SA = "5a000000-0000-4000-8000-000000000001", SB = "b5000000-0000-4000-8000-000000000001"; // sesiones de Cowork
const [MA, MA2, MB] = [id("3a000000", 1), id("3a000000", 2), id("3b000000", 1)];               // reuniones
const [CA, CG, CB] = [id("ca000000", 1), id("ca000000", 2), id("cb000000", 1)];                // conversaciones (CG: grupo)
const [LA, LB] = [id("1a000000", 1), id("1b000000", 1)];                                       // llamadas
const [RA, RA2, RA3, RA4, RB] = [id("4a000000", 1), id("4a000000", 2), id("4a000000", 3), id("4a000000", 4), id("4b000000", 1)]; // grabaciones
const [GQA, GQA2, GQB] = [id("6a000000", 1), id("6a000000", 2), id("6b000000", 1)];           // invitados
const TOKEN_A = "secreto-del-invitado-de-kash-0000000000000000000000000000000";
const TOKEN_B = "secreto-del-invitado-de-la-otra-00000000000000000000000000000";

// Las salas que se miran: de KASH, de la otra, de grupo (sin fila en calls) y raras.
const SALAS_KASH = ["cowork_hub_5a000000", "cowork_5a000000_0", "meet_aaaa00000001", "meet_aaaa00000002", `call-${CA}`];
const SALA_GRUPO = `call-${CG}`;
const SALAS_RARAS = ["sala-rara", "meet_nada", `call-${id("cc000000", 9)}`, "cowork_ffffffff_0"];
const SALAS_OTRA = ["cowork_hub_b5000000", "cowork_b5000000_0", "meet_bbbb00000001", `call-${CB}`];

const SEMILLA = `
insert into public.tenants(id, slug, name) values ('${T1}', 'asm-tech', 'ASM Tech');
insert into public.roles_config (name, is_system, level) values ('admin', true, 100), ('supervisor', true, 50), ('employee', true, 20);
update public.role_groups set is_admin = true, is_manager_or_above = true, is_supervisor_or_above = true where role_name = 'admin';
update public.role_groups set is_supervisor_or_above = true where role_name = 'supervisor';
-- Grabaciones: el admin ve todas; el supervisor, las de su equipo (nivel menor); el empleado, las suyas.
insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
select rc.id, 'Grabaciones', null, true, case rc.name when 'admin' then 'all' when 'supervisor' then 'subordinates' else 'self' end from public.roles_config rc;
-- El alta real: handle_new_user crea perfil, rol employee y la membresía de asm-tech.
insert into auth.users(id, email, raw_user_meta_data) values
  ('${JHON}', 'jhon.lopez@maven-ai.me', '{"full_name":"Jhon"}'), ('${ELSA}', 'elsa@x.test', '{"full_name":"Elsa"}'),
  ('${HANA}', 'hana@x.test', '{"full_name":"Hana"}'), ('${ANA}', 'ana@x.test', '{"full_name":"Ana"}'),
  ('${CARL}', 'carl@x.test', '{"full_name":"Carl"}');
update public.user_roles set role = 'admin' where user_id = '${JHON}';
update public.user_roles set role = 'supervisor' where user_id = '${ELSA}';
`;

// Stubs del banco: ver la cabecera.
const STUBS = `
create table public.chat_participants (id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.chat_conversations(id) on delete cascade, user_id uuid not null);
create view public.v_recordings_usage with (security_invoker = true) as
select count(*) as total_recordings, coalesce(sum(size_bytes), 0) as total_bytes,
       count(*) filter (where expires_at < now() + interval '7 days') as expiring_next_week, min(expires_at) as next_expiry
from public.meeting_recordings where deleted_at is null;
grant select on public.v_recordings_usage to authenticated;
`;

const DATOS_T1 = `
insert into public.cowork_sessions (id, name, status, host_hub_livekit_room, created_by) values ('${SA}', 'Sala KASH', 'active', 'cowork_hub_5a000000', '${HANA}');
insert into public.cowork_rooms (session_id, name, livekit_room_name) values ('${SA}', 'Sala 1', 'cowork_5a000000_0');
insert into public.cowork_memberships (session_id, user_id, role) values ('${SA}', '${HANA}', 'host'), ('${SA}', '${ANA}', 'participant');
insert into public.meet_rooms (id, code, name, livekit_room_name, created_by) values
  ('${MA}', 'AAAAAA', 'Reunión KASH', 'meet_aaaa00000001', '${HANA}'),
  ('${MA2}', 'AAAAAB', 'Otra de KASH', 'meet_aaaa00000002', '${JHON}');
insert into public.meet_room_members (meet_room_id, user_id) values ('${MA}', '${HANA}'), ('${MA}', '${ANA}'), ('${MA2}', '${JHON}');
insert into public.meet_room_cohosts (meet_room_id, user_id, granted_by) values ('${MA}', '${ANA}', '${HANA}');
insert into public.meet_guest_requests (id, meet_room_id, guest_name, guest_token, ip_hash, status, decided_by, decided_at) values
  ('${GQA}', '${MA}', 'Invitada', '${TOKEN_A}', 'hash-de-ip-a', 'admitted', '${HANA}', now()),
  ('${GQA2}', '${MA}', 'Otro invitado', '${TOKEN_A}2', 'hash-de-ip-a2', 'pending', null, null);
insert into public.chat_conversations (id, tenant_id) values ('${CA}', '${T1}'), ('${CG}', '${T1}');
insert into public.chat_participants (conversation_id, user_id) values
  ('${CA}', '${ANA}'), ('${CA}', '${HANA}'), ('${CG}', '${ANA}'), ('${CG}', '${HANA}'), ('${CG}', '${JHON}');
insert into public.calls (id, caller_id, receiver_id, conversation_id, room_id, call_status) values
  ('${LA}', '${ANA}', '${HANA}', '${CA}', 'call-${CA}', 'accepted');
insert into public.call_participants (call_id, user_id, status) values ('${LA}', '${ANA}', 'accepted'), ('${LA}', '${HANA}', 'accepted');
insert into public.meeting_recordings (id, room_name, source, title, started_by, status, storage_key, size_bytes) values
  ('${RA}', 'meet_aaaa00000001', 'meet', 'Reunión KASH', '${ANA}', 'ready', 'ra.mp4', 1000),
  ('${RA2}', 'cowork_5a000000_0', 'cowork', 'Sala 1', '${HANA}', 'ready', 'ra2.mp4', 2000),
  ('${RA3}', 'call-${CA}', 'meet', 'Llamada', '${HANA}', 'ready', null, null),
  ('${RA4}', 'meet_aaaa00000002', 'meet', 'Del admin', '${JHON}', 'ready', 'ra4.mp4', 300);
insert into public.meeting_recording_recipients (recording_id, user_id) values ('${RA}', '${ANA}'), ('${RA}', '${HANA}'), ('${RA2}', '${HANA}');
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
insert into public.cowork_sessions (id, name, status, host_hub_livekit_room, created_by) values ('${SB}', 'Sala Otra', 'active', 'cowork_hub_b5000000', '${QUINO}');
insert into public.cowork_rooms (session_id, name, livekit_room_name) values ('${SB}', 'Sala 1', 'cowork_b5000000_0');
insert into public.cowork_memberships (session_id, user_id, role) values ('${SB}', '${QUINO}', 'host'), ('${SB}', '${SAM}', 'participant');
insert into public.meet_rooms (id, code, name, livekit_room_name, created_by) values ('${MB}', 'BBBBBB', 'Reunión Otra', 'meet_bbbb00000001', '${QUINO}');
insert into public.meet_room_members (meet_room_id, user_id) values ('${MB}', '${QUINO}'), ('${MB}', '${SAM}');
insert into public.meet_guest_requests (id, meet_room_id, guest_name, guest_token, status) values ('${GQB}', '${MB}', 'Invitado B', '${TOKEN_B}', 'pending');
insert into public.chat_conversations (id, tenant_id) values ('${CB}', '${T2}');
insert into public.chat_participants (conversation_id, user_id) values ('${CB}', '${SAM}'), ('${CB}', '${QUINO}');
insert into public.calls (id, caller_id, receiver_id, conversation_id, room_id, call_status) values
  ('${LB}', '${SAM}', '${QUINO}', '${CB}', 'call-${CB}', 'accepted');
insert into public.call_participants (call_id, user_id, status) values ('${LB}', '${SAM}', 'accepted'), ('${LB}', '${QUINO}', 'accepted');
insert into public.meeting_recordings (id, room_name, source, title, started_by, status, storage_key, size_bytes) values
  ('${RB}', 'meet_bbbb00000001', 'meet', 'Reunión Otra', '${SAM}', 'ready', 'rb.mp4', 500);
insert into public.meeting_recording_recipients (recording_id, user_id) values ('${RB}', '${SAM}');
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}
type Modo = "prod" | "con";
async function nueva(modo: Modo, opts: { extra?: string; sinCowork?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FX_ROLES);
  await db.exec(FX_COWORK);
  await db.exec(FX_MEET);
  await db.exec(STUBS);
  await db.exec(SEMILLA);
  for (const m of ANTES) if (!(opts.sinCowork && m.n.includes("cowork"))) await aplicar(db, m.n, m.sql);
  await db.exec(DATOS_T1 + (opts.extra ?? ""));
  if (modo === "con") await aplicar(db, NOMBRE, MIG);
  return db;
}
async function dosAgencias(modo: Modo): Promise<PGlite> {
  const db = await nueva(modo);
  await db.exec(OTRA);
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
// Lo corre y lo deshace siempre: para probar escrituras sin cambiar la base del
// ensayo. Devuelve las filas de la última sentencia, o el error.
async function ensayo(db: PGlite, quien: Quien, sql: string): Promise<{ filas: Fila[]; error: string | null }> {
  await db.exec("begin");
  try {
    await entrar(db, quien);
    const rs = await db.exec(sql);
    return { filas: (rs.at(-1)?.rows ?? []) as Fila[], error: null };
  } catch (e) {
    return { filas: [], error: msg(e) };
  } finally {
    await db.exec("rollback");
  }
}
const probar = async (db: PGlite, quien: Quien, sql: string) => (await ensayo(db, quien, sql)).error ?? "anduvo";
const ids = (fs: Fila[], k = "id") => fs.map((f) => String(f[k])).sort();
const huellaDe = async (db: PGlite, f: string) => (await uno(db, `select md5(prosrc) h from pg_proc where oid = '${f}'::regprocedure`))?.h;
const lista = (xs: string[]) => xs.map((s) => `'${s}'`).join(", ");
// Sin triggers (ni FK): una fila «de antes», como las que ya pueden estar en prod.
const crudo = (sql: string) => `set local session_replication_role = replica; ${sql}; set local session_replication_role = origin;`;

// Todo lo que una persona ve de Meet, llamadas y grabaciones, en un solo JSON.
const VISTA = (quien: string, salas: string[]) => {
  const u = /^[0-9a-f-]{36}$/.test(quien) ? `'${quien}'::uuid` : "null::uuid";
  return `select jsonb_build_object(
  'meet_rooms',    (select coalesce(jsonb_agg(id order by id), '[]') from public.meet_rooms),
  'miembros',      (select coalesce(jsonb_agg(meet_room_id || '/' || user_id order by 1), '[]') from public.meet_room_members),
  'coanfitriones', (select coalesce(jsonb_agg(meet_room_id || '/' || user_id order by 1), '[]') from public.meet_room_cohosts),
  'invitados',     (select coalesce(jsonb_agg(id order by id), '[]') from public.meet_guest_requests),
  'llamadas',      (select coalesce(jsonb_agg(id order by id), '[]') from public.calls),
  'participantes', (select coalesce(jsonb_agg(call_id || '/' || user_id order by 1), '[]') from public.call_participants),
  'grabaciones',   (select coalesce(jsonb_agg(id order by id), '[]') from public.meeting_recordings),
  'destinatarios', (select coalesce(jsonb_agg(recording_id || '/' || user_id order by 1), '[]') from public.meeting_recording_recipients),
  'uso',           (select to_jsonb(v) - 'next_expiry' from public.v_recordings_usage v),
  'agencia',       (select jsonb_agg(public.agencia_de_sala_livekit(r) order by r) from unnest(array[${lista(salas)}]) r),
  'modera',        (select jsonb_agg(public.can_moderate_livekit_room(${u}, r) order by r) from unnest(array[${lista(salas)}]) r),
  'dueno',         (select jsonb_agg(public.is_livekit_room_owner(${u}, r) order by r) from unnest(array[${lista(salas)}]) r)
) v`;
};

// La base, vista como la ven las edges (supabase-js con service_role): lo justo
// que usa livekit-agencia.ts, traducido a SQL contra PGlite.
function baseDe(db: PGlite): Base {
  return {
    from(tabla: string) {
      let cols = "*";
      const conds: string[] = [];
      const params: unknown[] = [];
      let lim: number | null = null;
      const col = (c: string) => { if (!/^\w+$/.test(c)) throw new Error(`columna rara ${c}`); return `"${c}"`; };
      const correr = async () => {
        const sel = cols === "*" ? "*" : cols.split(",").map((c) => col(c.trim())).join(", ");
        const sql = `select ${sel} from public."${tabla}"${conds.length ? " where " + conds.join(" and ") : ""}${lim !== null ? ` limit ${lim}` : ""}`;
        try { return { data: (await db.query(sql, params)).rows as Fila[], error: null }; }
        catch (e) { return { data: null, error: { message: msg(e) } }; }
      };
      const qb = {
        select(c: string) { cols = c; return qb; },
        eq(c: string, v: unknown) { params.push(v); conds.push(`${col(c)} = $${params.length}`); return qb; },
        gte(c: string, v: unknown) { params.push(v); conds.push(`${col(c)} >= $${params.length}`); return qb; },
        lte(c: string, v: unknown) { params.push(v); conds.push(`${col(c)} <= $${params.length}`); return qb; },
        in(c: string, vs: unknown[]) {
          if (!vs.length) { conds.push("false"); return qb; }
          conds.push(`${col(c)} in (${vs.map((v) => { params.push(v); return `$${params.length}`; }).join(", ")})`);
          return qb;
        },
        limit(n: number) { lim = n; return qb; },
        async maybeSingle() { const r = await correr(); return { data: r.data?.[0] ?? null, error: r.error }; },
        then(okf: (r: unknown) => unknown, malf?: (e: unknown) => unknown) { return correr().then(okf, malf); },
      };
      return qb;
    },
  };
}

// ════ 0. El fixture es prod ══════════════════════════════════════════════════
{
  const db = await nueva("prod");
  const r = await q(db, `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' f, md5(p.prosrc) h
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
  const vivo = new Map(r.map((x) => [x.f, x.h]));
  // Las 7 del fixture de Meet se comparan sobre el fixture recién cargado (antes de
  // las migraciones): es lo que estaba en prod el 01/10.
  const pura = new PGlite();
  await pura.exec(FX_ROLES); await pura.exec(FX_COWORK); await pura.exec(FX_MEET);
  const rp = await q(pura, `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' f, md5(p.prosrc) h
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
  const enFixture = new Map(rp.map((x) => [x.f, x.h]));
  const distintas = [...HUELLAS].filter(([f, h]) => enFixture.get(f) !== h).map(([f]) => f);
  check(HUELLAS.size === 7 && distintas.length === 0, `las ${HUELLAS.size} funciones del fixture de Meet tienen las huellas de prod${distintas.length ? ` — distintas: ${distintas.join(", ")}` : ""}`);
  // Las que exige la migración: is_livekit_room_owner como en prod; las otras dos
  // como las deja cowork_por_agencia (que va antes).
  const faltan = REEMPLAZADAS.filter((x) => {
    const firma = [...vivo.keys()].find((k) => k.startsWith(x.fn.replace(/^public\./, "").replace(/\(.*/, "(")));
    return !firma || vivo.get(firma) !== x.huella;
  });
  check(REEMPLAZADAS.length === 3 && faltan.length === 0,
    `las 3 huellas que exige la migración son las de prod con cowork_por_agencia aplicada${faltan.length ? ` — no: ${faltan.map((x) => x.fn).join(", ")}` : ""}`);
  check(REEMPLAZADAS.find((x) => x.fn.startsWith("public.is_livekit_room_owner"))?.huella === HUELLAS.get("is_livekit_room_owner(_user_id uuid, _room text)"),
    "la de is_livekit_room_owner es literalmente la del fixture de prod");
}

// ════ 1. Con una sola agencia, todos ven lo mismo que en prod ════════════════
const prod1 = await nueva("prod"), con1 = await nueva("con");
const SALAS_EQ = [...SALAS_KASH, ...SALAS_RARAS];
{
  const s = await uno(con1, `select
    (select count(*)::int from public.meet_rooms where tenant_id = '${T1}') reuniones,
    (select count(*)::int from public.calls where tenant_id = '${T1}') llamadas,
    (select count(*)::int from public.meeting_recordings where tenant_id = '${T1}') grabaciones,
    (select count(*)::int from public.meet_por_agencia_respaldo) respaldo`);
  check(s?.reuniones === 2 && s?.llamadas === 1 && s?.grabaciones === 4 && s?.respaldo === 3,
    `la migración asigna las 2 reuniones, la llamada y las 4 grabaciones a la agencia, y respalda las 3 funciones (${JSON.stringify(s)})`);
  const db = await nueva("prod");
  const leerFilas = async () => JSON.stringify(await q(db, `select (select jsonb_agg(to_jsonb(m) order by id) from public.meet_rooms m) a,
    (select jsonb_agg(to_jsonb(c) order by id) from public.calls c) b, (select jsonb_agg(to_jsonb(r) order by id) from public.meeting_recordings r) c`));
  const antes = await leerFilas();
  await aplicar(db, NOMBRE, MIG);
  const despues = JSON.parse(await leerFilas())[0];
  const sinAgencia = (xs: Fila[]) => xs.map(({ tenant_id: _t, ...r }) => r);
  const a0 = JSON.parse(antes)[0];
  check(JSON.stringify(sinAgencia(despues.a)) === JSON.stringify(a0.a) && JSON.stringify(sinAgencia(despues.b)) === JSON.stringify(a0.b)
    && JSON.stringify(sinAgencia(despues.c)) === JSON.stringify(a0.c), "asignar la agencia no cambia ninguna otra columna de las filas de hoy");

  for (const [n, u] of [...PERSONAS_T1, ["service_role", "service_role"]] as [string, string][]) {
    const a = (await como(prod1, u, VISTA(u, SALAS_EQ)))[0].v;
    const b = (await como(con1, u, VISTA(u, SALAS_EQ)))[0].v;
    const iguales = JSON.stringify(a) === JSON.stringify(b);
    let donde = "";
    if (!iguales) donde = " — difiere en: " + Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).join(", ");
    check(iguales, `${n}: con una sola agencia ve lo mismo que en prod (9 tablas, la vista de uso, ${SALAS_EQ.length} salas)${donde}`);
  }
  // Que no sea una comparación vacía.
  const j = (await como(prod1, JHON, VISTA(JHON, SALAS_EQ)))[0].v;
  const a = (await como(prod1, ANA, VISTA(ANA, SALAS_EQ)))[0].v;
  const e = (await como(prod1, ELSA, VISTA(ELSA, SALAS_EQ)))[0].v;
  check(j.grabaciones.length === 4 && j.destinatarios.length === 3 && j.modera.filter(Boolean).length === 5 && j.uso.total_recordings === 4
    && a.meet_rooms.length === 1 && a.coanfitriones.length === 1 && a.invitados.length === 2 && a.llamadas.length === 1 && a.participantes.length === 2
    && a.grabaciones.length === 1 && a.dueno.filter(Boolean).length === 1 && e.grabaciones.length === 3 && !e.grabaciones.includes(RA4),
    `y no es una comparación vacía (admin: ${j.grabaciones.length} grabaciones, modera ${j.modera.filter(Boolean).length}; Ana: ${a.meet_rooms.length} reunión, ${a.invitados.length} invitados, ${a.llamadas.length} llamada; Elsa por equipo: ${e.grabaciones.length}, sin la del admin)`);

  // Lo que cambia a propósito con una sola agencia:
  const tokProd = await ensayo(prod1, ANA, `select guest_token, ip_hash from public.meet_guest_requests`);
  const tokCon = await ensayo(con1, ANA, `select guest_token from public.meet_guest_requests`);
  const ipCon = await ensayo(con1, ANA, `select ip_hash from public.meet_guest_requests`);
  check(tokProd.filas.some((f) => f.guest_token === TOKEN_A) && /permission denied/.test(tokCon.error ?? "") && /permission denied/.test(ipCon.error ?? ""),
    "M1 (a propósito, también con una agencia): en prod cualquiera lee guest_token e ip_hash; con la migración nadie por la API");
  const gate = await como(con1, ANA, `select id, guest_name, status, created_at from public.meet_guest_requests where meet_room_id = '${MA}' and status = 'pending' order by created_at`);
  check(gate.length === 1 && gate[0].id === GQA2, "y la consulta de MeetGuestGate (id, guest_name, status, created_at) sigue andando");
  const grupo = async (db: PGlite) => await uno(db, `select public.agencia_de_sala_livekit('${SALA_GRUPO}') a, public.can_moderate_livekit_room('${JHON}', '${SALA_GRUPO}') m`);
  const gp = await grupo(prod1), gc = await grupo(con1);
  check(gp?.a === null && gp?.m === false && gc?.a === T1 && gc?.m === true,
    "S1 (a favor): la llamada de GRUPO, sin fila en calls, ahora es de la agencia de su conversación y su admin la modera");
}

// ════ 2. Dos agencias ═════════════════════════════════════════════════════════
const prod = await dosAgencias("prod");
const con = await dosAgencias("con");

// 2.1 La agencia la pone la base, y no cambia
{
  const t = await uno(con, `select (select tenant_id from public.meet_rooms where id = '${MB}') r, (select tenant_id from public.calls where id = '${LB}') l,
    (select tenant_id from public.meeting_recordings where id = '${RB}') g`);
  check(t?.r === T2 && t?.l === T2 && t?.g === T2, "una reunión, una llamada y una grabación creadas sin agencia quedan en la de quien las crea (las edges no la mandan)");
  const casos: [string, string, RegExp][] = [
    ["una reunión en otra agencia", `insert into public.meet_rooms (name, livekit_room_name, created_by, tenant_id) values ('x', 'meet_x1', '${QUINO}', '${T1}')`, /tiene que ser de la agencia de quien la crea/],
    ["una reunión de alguien sin agencia", `insert into public.meet_rooms (name, livekit_room_name, created_by) values ('x', 'meet_x2', '${SINAG}')`, /no es de ninguna agencia/],
    ["una reunión con una sala que no es meet_", `insert into public.meet_rooms (name, livekit_room_name, created_by) values ('x', 'call-${CA}', '${HANA}')`, /se llama meet_/],
    ["pasar una reunión a otra agencia", `update public.meet_rooms set tenant_id = '${T2}' where id = '${MA}'`, /no cambian/],
    ["cambiarle el creador a una reunión", `update public.meet_rooms set created_by = '${SAM}' where id = '${MA}'`, /no cambian/],
    ["cambiarle la sala a una reunión", `update public.meet_rooms set livekit_room_name = 'meet_bbbb00000009' where id = '${MA}'`, /no cambian/],
    ["pasar una grabación a otra agencia", `update public.meeting_recordings set tenant_id = '${T2}' where id = '${RA}'`, /no cambian/],
    ["cambiarle la sala a una grabación", `update public.meeting_recordings set room_name = 'meet_bbbb00000001' where id = '${RA}'`, /no cambian/],
    ["pasar una llamada a otra agencia", `update public.calls set tenant_id = '${T2}' where id = '${LA}'`, /no cambian/],
  ];
  for (const [que, sql, re] of casos) {
    const r = await probar(con, "postgres", sql);
    check(re.test(r), `no se puede ${que} (${r.slice(0, 70)})`);
  }
  const resto = await probar(con, "postgres", `update public.meet_rooms set name = 'otro', status = 'ended', ended_at = now() where id = '${MA}';
    update public.meeting_recordings set status = 'deleted', deleted_at = now(), title = 'y' where id = '${RA}';
    update public.calls set call_status = 'ended', end_time = now() where id = '${LA}'`);
  check(resto === "anduvo", "lo demás se sigue editando (nombre y estado de la reunión, estado de la grabación y de la llamada)");
}

// 2.2 M3: nadie de otra agencia queda dentro de una reunión
{
  const casos: [string, (u: string) => string][] = [
    ["meet_room_members", (u) => `insert into public.meet_room_members (meet_room_id, user_id) values ('${MA}', '${u}')`],
    ["meet_room_cohosts", (u) => `insert into public.meet_room_cohosts (meet_room_id, user_id, granted_by) values ('${MA}', '${u}', '${HANA}')`],
    ["meet_room_cohosts (quien lo da)", (u) => `insert into public.meet_room_cohosts (meet_room_id, user_id, granted_by) values ('${MA}', '${CARL}', '${u}')`],
    ["meet_guest_requests (quien admite)", (u) => `update public.meet_guest_requests set status = 'admitted', decided_by = '${u}', decided_at = now() where id = '${GQA2}'`],
  ];
  for (const [tabla, sql] of casos) {
    const base = await probar(prod, "postgres", sql(SAM));
    const cerrado = await probar(con, "postgres", sql(SAM));
    const propio = await probar(con, "postgres", sql(CARL));
    check(base === "anduvo" && /meet_misma_agencia: .* no es de la agencia de la reunión/.test(cerrado) && propio === "anduvo",
      `${tabla}: en prod entra alguien de otra agencia (${base}); con la migración no (${cerrado.slice(0, 50)}…), y alguien de la agencia sí (${propio})`);
  }
  const sin = await probar(con, "postgres", casos[0][1](SINAG));
  check(/no es de la agencia/.test(sin), "una cuenta sin agencia tampoco entra a una reunión");
  const mover = await probar(con, "postgres", `update public.meet_room_members set user_id = '${SAM}' where meet_room_id = '${MA}' and user_id = '${ANA}'`);
  check(/no es de la agencia/.test(mover), "ni cambiando la persona de una membresía que ya existe");
  const pin = await probar(con, "postgres", `update public.meet_room_members set pinned = true, sort_order = 2 where meet_room_id = '${MA}' and user_id = '${ANA}'`);
  check(pin === "anduvo", "fijar y ordenar mi lista (setPinned / reorder) no pasa por el control");
}

// 2.3 M1 y M2: lo que se lee de las reuniones
{
  for (const [n, u] of [["Sam (otra agencia)", SAM], ["una cuenta sin agencia", SINAG]] as [string, string][]) {
    const base = await ensayo(prod, u, `select guest_token from public.meet_guest_requests`);
    const cerrado = await ensayo(con, u, `select guest_token from public.meet_guest_requests`);
    check(base.filas.some((f) => f.guest_token === TOKEN_A) && /permission denied/.test(cerrado.error ?? ""),
      `M1: en prod ${n} lee el secreto del invitado de KASH (${base.filas.length} filas); con la migración, nadie lo lee por la API`);
  }
  const casos: { que: string; quien: string; sql: string; ajeno: (fs: Fila[]) => boolean; propio: (fs: Fila[]) => boolean }[] = [
    { que: "M1: las solicitudes de invitados", quien: SAM, sql: `select id from public.meet_guest_requests`,
      ajeno: (fs) => fs.some((f) => f.id === GQA), propio: (fs) => fs.some((f) => f.id === GQB) },
    { que: "M2: los co-anfitriones", quien: SAM, sql: `select meet_room_id, user_id from public.meet_room_cohosts`,
      ajeno: (fs) => fs.some((f) => f.meet_room_id === MA), propio: () => true },
    { que: "M1: las solicitudes, a una cuenta sin agencia", quien: SINAG, sql: `select id from public.meet_guest_requests`,
      ajeno: (fs) => fs.length > 0, propio: () => true },
  ];
  for (const c of casos) {
    const b = await como(prod, c.quien, c.sql);
    const a = await como(con, c.quien, c.sql);
    check(c.ajeno(b), `línea base: en prod ${c.que} muestran lo de KASH (${b.length} filas)`);
    check(!c.ajeno(a) && c.propio(a), `con la migración, ${c.que} muestran solo lo de su agencia (${a.length} filas)`);
  }
  const anon = await ensayo(con, "anon", `select id from public.meet_guest_requests`);
  check(/permission denied/.test(anon.error ?? ""), "anon no lee las solicitudes de invitados");
  const hana = await como(con, HANA, `select id from public.meet_guest_requests order by id`);
  check(JSON.stringify(ids(hana)) === JSON.stringify([GQA, GQA2].sort()), "y KASH sigue viendo sus invitados, sin los de la otra");
}

// 2.4 L1–L3: las llamadas del Messenger
{
  // L1: llamar a alguien de otra agencia, o con la sala de una llamada ajena.
  const llamar = (receptor: string | null, conv: string, sala = `call-${conv}`) =>
    `insert into public.calls (caller_id, receiver_id, conversation_id, room_id, call_status) values ('${SAM}', ${receptor ? `'${receptor}'` : "null"}, '${conv}', '${sala}', 'ringing') returning id`;
  const b1 = await probar(prod, SAM, llamar(ANA, CB));
  const c1 = await probar(con, SAM, llamar(ANA, CB));
  check(b1 === "anduvo" && /no es de la agencia de quien llama/.test(c1), `L1: en prod Sam llama a Ana, de otra agencia (${b1}); con la migración no (${c1.slice(0, 60)})`);
  // ... y con la sala de la llamada de Ana y Hana queda como «el que llamó»: la modera.
  const secuestro = `${llamar(null, CA)}; select public.can_moderate_livekit_room('${SAM}', 'call-${CA}') m, public.is_livekit_room_owner('${SAM}', 'call-${CA}') d`;
  const b2 = await ensayo(prod, SAM, secuestro);
  const c2 = await ensayo(con, SAM, secuestro);
  check(b2.filas[0]?.m === true && b2.filas[0]?.d === true && /no es de la agencia de quien llama|no está en la conversación/.test(c2.error ?? ""),
    `L1: en prod Sam se mete como «el que llamó» de la sala de una llamada de KASH y la modera (${JSON.stringify(b2.filas[0])}); con la migración no puede (${(c2.error ?? "").slice(0, 60)})`);
  // Dentro de KASH: Carl no está en la conversación de Ana y Hana.
  const carl = `insert into public.calls (caller_id, conversation_id, room_id) values ('${CARL}', '${CA}', 'call-${CA}'); select public.can_moderate_livekit_room('${CARL}', 'call-${CA}') m`;
  const b3 = await ensayo(prod, CARL, carl);
  const c3 = await ensayo(con, CARL, carl);
  check(b3.filas[0]?.m === true && /no está en la conversación/.test(c3.error ?? ""),
    `L1 (dentro de la agencia): en prod Carl se adueña de la llamada de Ana y Hana; con la migración no (${(c3.error ?? "").slice(0, 50)})`);
  const salaAjena = await probar(con, ANA, `insert into public.calls (caller_id, conversation_id, room_id) values ('${ANA}', '${CG}', 'meet_aaaa00000001')`);
  check(/call-<id de su conversación>/.test(salaAjena), "la sala de una llamada tiene que ser la de su conversación");
  const legit = await ensayo(con, ANA, `insert into public.calls (caller_id, receiver_id, conversation_id, room_id, call_status, call_type, is_group)
    values ('${ANA}', '${HANA}', '${CA}', 'call-${CA}', 'ringing', 'video', false) returning id, tenant_id;
    insert into public.call_participants (call_id, user_id, status) select id, x.u, x.s from public.calls, (values ('${ANA}'::uuid, 'accepted'), ('${HANA}'::uuid, 'ringing')) x(u, s)
      where caller_id = '${ANA}' and call_status = 'ringing' returning call_id`);
  check(legit.error === null && legit.filas.length === 2, `la llamada de la app (useVideoCall: llamada + dos participantes) sigue andando (${legit.error ?? "ok"})`);

  // L2: quien recibe se cambia el caller_id y la sala.
  const l2 = `update public.calls set caller_id = '${HANA}', room_id = 'call-${CB}' where id = '${LA}' returning id`;
  const b4 = await ensayo(prod, HANA, l2);
  const c4 = await ensayo(con, HANA, l2);
  check(b4.filas.length === 1 && /no cambian/.test(c4.error ?? ""), `L2: en prod quien recibe se pone de «el que llamó» y cambia la sala; con la migración no (${(c4.error ?? "").slice(0, 50)})`);
  const contestar = await ensayo(con, HANA, `update public.calls set call_status = 'accepted', start_time = now() where id = '${LA}' returning id`);
  check(contestar.filas.length === 1, "contestar, rechazar y cortar (UPDATE de call_status) siguen andando");
  const borrar = await probar(con, "postgres", `delete from public.chat_conversations where id = '${CA}'`);
  check(borrar === "anduvo", "borrar la conversación deja la llamada sin conversación (la FK ON DELETE SET NULL pasa)");

  // L3: sumarse o moverse a una llamada ajena.
  const casos: [string, Quien, string][] = [
    ["Sam se suma a la llamada de KASH", SAM, `insert into public.call_participants (call_id, user_id) values ('${LA}', '${SAM}')`],
    ["Ana suma a Sam a su llamada", ANA, `insert into public.call_participants (call_id, user_id) values ('${LA}', '${SAM}')`],
  ];
  for (const [que, quien, sql] of casos) {
    const b = await probar(prod, quien, sql);
    const c = await probar(con, quien, sql);
    check(b === "anduvo" && /no es de la agencia de la llamada/.test(c), `L3: en prod ${que} (${b}); con la migración no (${c.slice(0, 50)})`);
  }
  const mover = `update public.call_participants set call_id = '${LA}' where call_id = '${LB}' and user_id = '${SAM}'; select id from public.calls where id = '${LA}'`;
  const b5 = await ensayo(prod, SAM, mover);
  const c5 = await ensayo(con, SAM, mover);
  check(b5.filas.length === 1 && /no cambia de llamada/.test(c5.error ?? ""), `L3: en prod Sam mueve su participación a la llamada de KASH y la ve; con la migración no (${(c5.error ?? "").slice(0, 50)})`);
  const carlSuma = await probar(con, ANA, `insert into public.call_participants (call_id, user_id) values ('${LA}', '${CARL}')`);
  check(carlSuma === "anduvo", "sumar a alguien de la agencia a la llamada sigue andando");
  const verSam = await como(con, SAM, `select id from public.calls`);
  check(JSON.stringify(ids(verSam)) === JSON.stringify([LB]), "y Sam ve solo su llamada");
}

// 2.5 G1–G4: las grabaciones
{
  const casos: { que: string; quien: string; sql: string; ajeno: (fs: Fila[]) => boolean; propio: (fs: Fila[]) => boolean }[] = [
    { que: "G1: el admin ve las grabaciones", quien: OLGA, sql: `select id from public.meeting_recordings`,
      ajeno: (fs) => fs.some((f) => f.id === RA), propio: (fs) => fs.some((f) => f.id === RB) },
    { que: "G1: el supervisor ve las de su equipo", quien: PEPE, sql: `select id from public.meeting_recordings`,
      ajeno: (fs) => fs.some((f) => f.id === RA), propio: (fs) => fs.some((f) => f.id === RB) },
    { que: "G1: v_recordings_usage cuenta", quien: OLGA, sql: `select total_recordings::int n from public.v_recordings_usage`,
      ajeno: (fs) => fs[0]?.n === 5, propio: (fs) => fs[0]?.n === 1 },
    { que: "G3: el admin ve a quién se compartió", quien: OLGA, sql: `select recording_id from public.meeting_recording_recipients`,
      ajeno: (fs) => fs.some((f) => f.recording_id === RA), propio: () => true },
  ];
  for (const c of casos) {
    const b = await como(prod, c.quien, c.sql);
    const a = await como(con, c.quien, c.sql);
    check(c.ajeno(b), `línea base: en prod, ${c.que} de KASH (${b.length} filas)`);
    check(!c.ajeno(a) && c.propio(a), `con la migración, ${c.que} solo de su agencia (${a.length} filas)`);
  }
  const g2 = `update public.meeting_recordings set title = 'mía' where id = '${RA}' returning id`;
  const b2 = await ensayo(prod, OLGA, g2), c2 = await ensayo(con, OLGA, g2);
  check(b2.filas.length === 1 && c2.filas.length === 0 && c2.error === null, "G2: en prod el admin de otra agencia edita una grabación de KASH; con la migración no la alcanza");
  const g2b = await ensayo(con, OLGA, `update public.meeting_recordings set tenant_id = '${T1}' where id = '${RB}' returning id`);
  check(g2b.error !== null, `ni pasa una suya a KASH (${(g2b.error ?? "").slice(0, 50)})`);
  // G3: compartir con alguien de otra agencia.
  const comp = (u: string) => `insert into public.meeting_recording_recipients (recording_id, user_id) values ('${RA}', '${u}')`;
  const b3 = await probar(prod, "postgres", comp(SAM)), c3 = await probar(con, "postgres", comp(SAM)), p3 = await probar(con, "postgres", comp(CARL));
  check(b3 === "anduvo" && /grabacion_misma_agencia/.test(c3) && p3 === "anduvo",
    `G3: en prod una grabación de KASH se comparte con Sam (${b3}); con la migración no (${c3.slice(0, 50)}), con Carl sí`);
  // G4: grabar una sala de otra agencia, una que no es de nadie, o sin agencia.
  const grabar = (sala: string, u: string, modo: Modo = "prod") =>
    `insert into public.meeting_recordings (room_name, source, started_by) values ('${sala}', 'meet', '${u}') returning ${modo === "con" ? "tenant_id" : "id"}`;
  const g4: [string, string, string][] = [
    ["una sala de KASH por alguien de la otra", "meet_aaaa00000001", SAM],
    ["una sala que no es de ninguna agencia", "sala-rara", ANA],
    ["por una cuenta sin agencia", "meet_aaaa00000001", SINAG],
  ];
  for (const [que, sala, u] of g4) {
    const b = await probar(prod, "postgres", grabar(sala, u));
    const c = await probar(con, "postgres", grabar(sala, u));
    check(b === "anduvo" && /meeting_recordings_agencia/.test(c), `G4: en prod se graba ${que} (${b}); con la migración no (${c.slice(0, 60)})`);
  }
  for (const sala of ["meet_aaaa00000001", "cowork_5a000000_0", SALA_GRUPO]) {
    const r = await ensayo(con, "postgres", grabar(sala, CARL, "con"));
    check(r.filas[0]?.tenant_id === T1, `grabar ${sala} (Meet, Cowork, llamada de grupo) por alguien de la agencia sigue andando, con su agencia (${r.error ?? "ok"})`);
  }
  // Y KASH sigue viendo lo suyo.
  const j = await como(con, JHON, `select id from public.meeting_recordings`);
  const e = await como(con, ELSA, `select id from public.meeting_recordings`);
  const d = await como(con, JHON, `select recording_id from public.meeting_recording_recipients`);
  check(JSON.stringify(ids(j)) === JSON.stringify([RA, RA2, RA3, RA4].sort()) && JSON.stringify(ids(e)) === JSON.stringify([RA, RA2, RA3].sort()) && d.length === 3,
    `y KASH sigue viendo lo suyo: el admin las 4 y sus destinatarios, la supervisora las de su equipo, no la del admin (${j.length}, ${e.length}, ${d.length})`);
}

// 2.6 Quién modera y quién es dueño de cada sala
{
  const m = async (db: PGlite, u: string, sala: string) => (await uno(db, `select public.can_moderate_livekit_room('${u}', '${sala}') v`))?.v;
  const d = async (db: PGlite, u: string, sala: string) => (await uno(db, `select public.is_livekit_room_owner('${u}', '${sala}') v`))?.v;
  // Filas «de antes» que ya pueden estar en prod (sin pasar por los triggers).
  const legado = (modo: Modo) => crudo(`insert into public.meet_room_cohosts (meet_room_id, user_id) values ('${MA}', '${SAM}');
    insert into public.calls (caller_id, conversation_id, room_id${modo === "con" ? ", tenant_id" : ""}) values ('${SAM}', null, 'call-${CA}'${modo === "con" ? `, '${T2}'` : ""})`);
  const mirar = `select public.can_moderate_livekit_room('${SAM}', 'meet_aaaa00000001') co, public.can_moderate_livekit_room('${SAM}', 'call-${CA}') ll,
    public.is_livekit_room_owner('${SAM}', 'call-${CA}') du, public.can_moderate_livekit_room('${JHON}', 'call-${CA}') jh, public.agencia_de_sala_livekit('call-${CA}') ag`;
  const b = (await ensayo(prod, "postgres", legado("prod") + mirar)).filas[0];
  const c = (await ensayo(con, "postgres", legado("con") + mirar)).filas[0];
  check(b?.co === true && b?.ll === true && b?.du === true && b?.jh === false && b?.ag === null,
    `línea base: en prod, con un co-anfitrión y un «el que llamó» de otra agencia, Sam modera las salas de KASH y el admin de KASH ya no (${JSON.stringify(b)})`);
  check(c?.co === false && c?.ll === false && c?.du === false && c?.jh === true && c?.ag === T1,
    `con la migración, aun con esas filas, Sam no modera ni es dueño, y la sala sigue siendo de KASH (${JSON.stringify(c)})`);

  const esperado: [string, string, boolean][] = [
    [OLGA, "meet_aaaa00000001", false], [OLGA, `call-${CA}`, false], [OLGA, SALA_GRUPO, false], [OLGA, "cowork_5a000000_0", false],
    [OLGA, "meet_bbbb00000001", true], [OLGA, `call-${CB}`, true], [OLGA, "cowork_b5000000_0", true],
    [JHON, "meet_aaaa00000001", true], [JHON, `call-${CA}`, true], [JHON, SALA_GRUPO, true], [JHON, "meet_bbbb00000001", false], [JHON, `call-${CB}`, false],
    [HANA, "meet_aaaa00000001", true], [ANA, "meet_aaaa00000001", true], [ANA, `call-${CA}`, true], [ANA, "meet_aaaa00000002", false],
    [QUINO, "meet_bbbb00000001", true], [SAM, `call-${CB}`, true], [QUINO, "meet_aaaa00000001", false], [SINAG, "meet_aaaa00000001", false],
    [JHON, "sala-rara", false], [JHON, "meet_nada", false],
  ];
  const malM: string[] = [];
  for (const [u, sala, v] of esperado) if (await m(con, u, sala) !== v) malM.push(`${u.slice(-2)} ${sala} ≠ ${v}`);
  check(malM.length === 0, `con la migración, cada uno modera solo salas de su agencia: el admin todas las suyas, el anfitrión y co-anfitrión su reunión, quien llamó su llamada (${esperado.length} casos)${malM.length ? " — " + malM.join("; ") : ""}`);
  const duenos: [string, string, boolean][] = [
    [HANA, "meet_aaaa00000001", true], [ANA, "meet_aaaa00000001", false], [ANA, `call-${CA}`, true], [HANA, `call-${CA}`, false],
    [QUINO, "meet_bbbb00000001", true], [QUINO, "meet_aaaa00000001", false], [SAM, `call-${CB}`, true], [JHON, "meet_aaaa00000002", true],
  ];
  const malD: string[] = [];
  for (const [u, sala, v] of duenos) if (await d(con, u, sala) !== v) malD.push(`${u.slice(-2)} ${sala} ≠ ${v}`);
  check(malD.length === 0, `is_livekit_room_owner: dueño quien creó la reunión o hizo la llamada, de su agencia (${duenos.length} casos)${malD.length ? " — " + malD.join("; ") : ""}`);

  const anonB = await probar(prod, "anon", `select public.can_moderate_livekit_room('${JHON}', 'meet_aaaa00000001')`);
  const anonC = await probar(con, "anon", `select public.can_moderate_livekit_room('${JHON}', 'meet_aaaa00000001')`);
  check(anonB === "anduvo" && /permission denied/.test(anonC), "línea base: en prod anon pregunta quién modera qué sala; con la migración no");
}

// 2.7 Nada nuevo es de anon; las funciones de trigger no las llama nadie
{
  const nuevas = ["meet_reuniones_de_mi_agencia()", "grabaciones_de_mi_agencia()", "meet_rooms_agencia()", "meet_misma_agencia()", "calls_agencia()",
    "call_participants_agencia()", "meeting_recordings_agencia()", "grabacion_misma_agencia()", "agencia_de_sala_livekit(text)",
    "can_moderate_livekit_room(uuid,text)", "is_livekit_room_owner(uuid,text)"];
  const r = await q(con, `select f, has_function_privilege('anon', ('public.' || f)::regprocedure, 'EXECUTE') anon,
      has_function_privilege('authenticated', ('public.' || f)::regprocedure, 'EXECUTE') auth
    from unnest(array[${lista(nuevas)}]) f`);
  const deAnon = r.filter((x) => x.anon).map((x) => x.f);
  check(r.length === nuevas.length && deAnon.length === 0, `ninguna de las ${nuevas.length} funciones nuevas o reemplazadas es de anon${deAnon.length ? " — sí: " + deAnon.join(", ") : ""}`);
  const disparadores = r.filter((x) => /_agencia\(\)$/.test(x.f) && !/de_mi_agencia/.test(x.f) && x.auth).map((x) => x.f);
  check(disparadores.length === 0, `las funciones de trigger no las ejecuta authenticated${disparadores.length ? " — sí: " + disparadores.join(", ") : ""}`);
  const mia = await probar(con, ANA, `select * from public.meet_reuniones_de_mi_agencia()`);
  check(mia === "anduvo", "las de las políticas sí las ejecuta authenticated");
}

// ════ 3. La guarda de las edges dice lo mismo que la base ═════════════════════
{
  // Filas «de antes» para los casos raros de llamadas: una sala vieja sin
  // conversación con llamadas de una sola agencia, y otra con llamadas de dos.
  const viejas = (modo: Modo) => crudo(`insert into public.calls (caller_id, room_id${modo === "con" ? ", tenant_id" : ""}) values
    ('${ANA}', 'call-vieja'${modo === "con" ? `, '${T1}'` : ""}), ('${HANA}', 'call-vieja'${modo === "con" ? `, '${T1}'` : ""}),
    ('${ANA}', 'call-mezclada'${modo === "con" ? `, '${T1}'` : ""}), ('${SAM}', 'call-mezclada'${modo === "con" ? `, '${T2}'` : ""})`);
  const p2 = await dosAgencias("prod"), c2 = await dosAgencias("con");
  await aplicar(p2, "filas viejas", viejas("prod"));
  await aplicar(c2, "filas viejas", viejas("con"));
  const salas = [...SALAS_KASH, SALA_GRUPO, ...SALAS_OTRA, ...SALAS_RARAS, "call-vieja", "call-mezclada", "cowork_meet_5a000000_3a000000", "cowork_1on1_b5000000_4b000000", ""];
  const difieren: string[] = [];
  for (const sala of salas) {
    const sql = (await uno(c2, `select public.agencia_de_sala_livekit($$${sala}$$) a`))?.a ?? null;
    const tsCon = await agenciaDeSala(baseDe(c2), sala);
    const tsProd = await agenciaDeSala(baseDe(p2), sala);
    if (!(sql === tsCon && tsCon === tsProd)) difieren.push(`${sala || "(vacía)"}: base ${sql}, guarda ${tsCon}, guarda sin migración ${tsProd}`);
  }
  check(difieren.length === 0, `la guarda de las edges y agencia_de_sala_livekit dicen lo mismo en ${salas.length} salas, con y sin la migración${difieren.length ? " — " + difieren.join("; ") : ""}`);
  const esperado = await Promise.all(["call-vieja", "call-mezclada", SALA_GRUPO, "meet_bbbb00000001"].map((s) => agenciaDeSala(baseDe(c2), s)));
  check(JSON.stringify(esperado) === JSON.stringify([T1, null, T1, T2]), "y no es por decir NULL a todo (vieja: KASH; mezclada: nadie; grupo: KASH; Meet de la otra: la otra)");
}

// ════ 4. La vuelta atrás ══════════════════════════════════════════════════════
{
  const TABLAS = ["meet_rooms", "meet_room_members", "meet_room_cohosts", "meet_guest_requests", "meet_guest_attempts", "calls", "call_participants", "meeting_recordings", "meeting_recording_recipients"];
  const politicas = `select tablename || '|' || policyname || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '') p
    from pg_policies where tablename in (${lista(TABLAS)}) order by 1`;
  const privilegios = `select x from (
      select 'tabla|' || table_name || '|' || grantee || '|' || privilege_type x from information_schema.role_table_grants where table_name in (${lista(TABLAS)})
      union all
      select 'columna|' || table_name || '.' || column_name || '|' || grantee || '|' || privilege_type from information_schema.column_privileges
        where table_name in (${lista(TABLAS)})
      union all
      select 'funcion|' || p.proname || '|' || r.rolname || '|' || has_function_privilege(r.oid, p.oid, 'EXECUTE')
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace, pg_roles r
        where n.nspname = 'public' and p.proname in ('can_moderate_livekit_room', 'is_livekit_room_owner', 'agencia_de_sala_livekit')
          and r.rolname in ('anon', 'authenticated', 'service_role')
    ) t order by 1`;
  const polAntes = (await q(prod1, politicas)).map((x) => x.p);
  const privAntes = (await q(prod1, privilegios)).map((x) => x.x);
  const db = await nueva("con");
  await aplicar(db, "vuelta atrás de " + NOMBRE, VUELTA);
  const distintas: string[] = [];
  for (const x of REEMPLAZADAS) if (await huellaDe(db, x.fn) !== x.huella) distintas.push(x.fn);
  check(distintas.length === 0, `las 3 funciones vuelven byte a byte${distintas.length ? " — no: " + distintas.join(", ") : ""}`);
  const polDespues = (await q(db, politicas)).map((x) => x.p);
  check(JSON.stringify(polAntes) === JSON.stringify(polDespues), `las ${polAntes.length} políticas vuelven a ser las de prod`);
  const privDespues = (await q(db, privilegios)).map((x) => x.x);
  const faltan = privAntes.filter((x) => !privDespues.includes(x)), sobran = privDespues.filter((x) => !privAntes.includes(x));
  check(faltan.length === 0 && sobran.length === 0, `los privilegios de las 9 tablas, sus columnas y las 3 funciones vuelven a ser los de prod (${privAntes.length})${faltan.length || sobran.length ? ` — faltan ${faltan.join(", ")}; sobran ${sobran.join(", ")}` : ""}`);
  const resto = await uno(db, `select
    (select count(*)::int from information_schema.columns where table_schema = 'public' and column_name = 'tenant_id' and table_name in (${lista(TABLAS)})) columnas,
    (select count(*)::int from pg_trigger where tgname like '%agencia') triggers,
    (select count(*)::int from pg_proc where proname in ('meet_rooms_agencia', 'meet_misma_agencia', 'calls_agencia', 'call_participants_agencia', 'meeting_recordings_agencia',
      'grabacion_misma_agencia', 'meet_reuniones_de_mi_agencia', 'grabaciones_de_mi_agencia')) funciones,
    to_regclass('public.meet_por_agencia_respaldo') is null sin_respaldo`);
  check(resto?.columnas === 0 && resto?.funciones === 0 && resto?.sin_respaldo === true,
    `sin columnas ni funciones nuevas, y sin el respaldo (${JSON.stringify(resto)})`);
  const MIS_TRIGGERS = [...MIG.matchAll(/^create trigger (\w+)/gm)].map((m) => m[1]);
  const trg = (await q(db, `select tgname from pg_trigger where tgname in (${lista(MIS_TRIGGERS)})`)).map((x) => x.tgname);
  check(MIS_TRIGGERS.length === 8 && trg.length === 0, `y ninguno de los ${MIS_TRIGGERS.length} triggers nuevos${trg.length ? " — quedan: " + trg.join(", ") : ""}`);
  for (const [n, u] of [["jhon", JHON], ["ana", ANA]] as [string, string][]) {
    const v = (await como(db, u, VISTA(u, [...SALAS_EQ, SALA_GRUPO])))[0].v;
    const p = (await como(prod1, u, VISTA(u, [...SALAS_EQ, SALA_GRUPO])))[0].v;
    check(JSON.stringify(v) === JSON.stringify(p), `y ${n} ve exactamente lo mismo que en prod`);
  }
  const tok = await ensayo(db, ANA, `select guest_token from public.meet_guest_requests`);
  check(tok.error === null && tok.filas.length === 2, "(y guest_token vuelve a ser legible, como en prod)");
  await aplicar(db, NOMBRE + " (otra vez)", MIG);
  check(true, "después de la vuelta atrás, se puede volver a aplicar");
}

// ════ 5. Las negativas ════════════════════════════════════════════════════════
const nadaAMedias = async (db: PGlite) => (await uno(db, `select to_regclass('public.meet_por_agencia_respaldo') is null a,
  not exists (select 1 from information_schema.columns where table_name in ('meet_rooms', 'calls', 'meeting_recordings') and column_name = 'tenant_id') b,
  not exists (select 1 from pg_trigger where tgname in ('meet_rooms_agencia', 'calls_agencia')) c`)) as Fila;
const intentar = async (db: PGlite) => { try { await aplicar(db, NOMBRE, MIG); return "anduvo"; } catch (e) { return msg(e); } };
{
  const db = await nueva("prod");
  await db.exec(OTRA);
  const r = await intentar(db);
  check(/UNA sola agencia/.test(r), `con dos agencias al aplicar, no corre (${r.slice(-70)})`);
  const n = await nadaAMedias(db);
  check(n.a && n.b && n.c, "y no deja nada a medias");
}
{
  const db = await nueva("prod", { extra: `create or replace function public.is_livekit_room_owner(_user_id uuid, _room text) returns boolean
    language sql stable security definer set search_path to 'public' as $f$ select true $f$;` });
  const r = await intentar(db);
  check(/is_livekit_room_owner.* no es la que se revisó/.test(r), `con una función de prod distinta de la revisada, no corre (${r.slice(-90)})`);
  const n = await nadaAMedias(db);
  check(n.a && n.b && n.c, "y no deja nada a medias");
}
{
  const db = await nueva("prod", { sinCowork: true });
  const r = await intentar(db);
  check(/falta 20261001213000_cowork_por_agencia/.test(r), `sin cowork_por_agencia aplicada, no corre (${r.slice(-80)})`);
  const n = await nadaAMedias(db);
  check(n.a && n.b && n.c, "y no deja nada a medias");
}

for (const m of ok) console.log(`✓ ${m}`);
for (const m of mal) console.log(`✗ ${m}`);
console.log(`\n${ok.length} ok${mal.length ? `, ${mal.length} MAL` : ""}`);
if (mal.length) Deno.exit(1);
