// Los avisos de sistema del Messenger los arma la base (migración
// 20261001100000_chat_mensajes_de_sistema.sql, PR 1b), probados contra un Postgres
// de verdad (PGlite) cargado con el esquema de PROD del 28/09 y las migraciones
// reales posteriores (la A del PR 1 incluida), como chat_agencia_y_huecos.ts.
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/chat_mensajes_de_sistema.ts [otra-version.sql]
//
// Con un argumento, ese archivo reemplaza a la migración en toda la cadena: así se
// corren las versiones rotas a propósito (los mutantes) y el banco tiene que fallar.
//
// Cómo está armado:
//   0. «base» = el fixture + las migraciones reales que van ANTES de esta (hoy, la
//      A). Es prod el 01/10: las huellas de lo que esta migración toca se sacaron
//      de prod ese día (solo lectura) y aquí se recalculan sobre la base; si no
//      coinciden, el banco falla. «1b» = el fixture + la cadena entera.
//   1. El hueco: con sesión de usuario, un aviso libre ENTRA en la base (línea base:
//      si no entra, el test no prueba nada) y NO entra con la migración. También
//      editar un aviso, y pasar un mensaje a aviso con la A vuelta atrás.
//   2. Los siete eventos por la RPC dan EXACTAMENTE el texto que escribía la app
//      (las plantillas de main 1ab8e4fc7, con sus rellenos), y cuestan lo mismo.
//   3. Quién puede: para renombrar, sumar, sacar y cambiar el rol, quien puede
//      mandar el aviso es quien puede hacer la acción (se prueban las dos cosas en
//      la misma tabla de personas × grupos).
//   4. Los flujos de la app, tal como los manda el frontend nuevo.
//   5. Los candados y la vuelta atrás que documenta la migración.
//
// PGlite tiene UNA conexión: los candados ocupados se ensayan inyectando el fallo
// donde lo daría un candado ocupado. Sale con código 1 si algo falla. Corre en el
// guard de cada PR (guard-edge-functions.yml).
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FIXTURE = leer("./fixtures/prod_chat_api_20260928.sql");
// El complementario del 01/10 (api_keys, role_groups, get_karma_profile): lo necesita
// la migración B de la escritura por API (20261001200000), que va DESPUÉS de esta en
// la cadena. Lo que esta migración toca no está ahí; sus huellas las revisa
// api_messenger_escritura.ts.
const COMPLEMENTO = leer("./fixtures/prod_api_escritura_20261001.sql");
const NOMBRE_1B = "20261001100000_chat_mensajes_de_sistema.sql";
const NOMBRE_A = "20260930230000_chat_agencia_y_huecos.sql";
const MIG_1B = Deno.args[0] ? Deno.readTextFileSync(Deno.args[0]) : leer(`../migrations/${NOMBRE_1B}`);
const MIG_A = leer(`../migrations/${NOMBRE_A}`);
const vueltaDe = (sql: string) => sql.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");
const VUELTA = vueltaDe(MIG_1B);
const VUELTA_A = vueltaDe(MIG_A);
if (Deno.args[0]) console.log(`(mutante: ${Deno.args[0]})`);

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);
const enSql = (xs: string[]) => `(${xs.map((x) => `'${x}'`).join(",")})`;
// Un literal de SQL que aguanta comillas, saltos de línea y lo que sea.
const lit = (s: string) => `$lit$${s}$lit$`;

// ─── La cadena de migraciones (el mismo filtro que chat_agencia_y_huecos.ts) ──
const LISTA_TABLAS = ["app_flags", "chat_archived", "chat_conversations", "chat_join_requests", "chat_message_deletions",
  "chat_messages", "chat_participants", "chat_pinned", "chat_reactions", "chat_read_receipts", "chat_space_conversations",
  "chat_spaces", "notification_preferences", "notification_settings", "notifications", "profiles", "push_subscriptions",
  "tenant_members", "tenants", "user_roles"];
const LISTA_FUNCIONES = ["current_tenant_id", "delete_chat_message", "delete_conversation_cascade", "get_last_messages",
  "get_mentioned_conversations", "get_unread_counts", "guard_chat_conversation_meta", "guard_chat_conversation_perms",
  "guard_chat_message_update", "guard_chat_participant_update", "handle_new_user", "is_chat_admin", "is_chat_participant",
  "is_conversation_creator", "is_in_role_group", "menciona_a", "messenger_unread_counts", "notif_canal_activo",
  "notify_chat_message", "push_chat_message", "push_desde_notificacion", "update_updated_at_column", "user_has_role_name",
  "validate_notification_fields"];
const FUNCIONES_A = ["chat_conversations_agencia", "chat_participants_agencia", "chat_llave_de_par",
  "profiles_nombre_lo_cambia_un_admin", "chat_directo_con", "chat_messages_al_insertar"];
const FUNCIONES_1B = ["chat_evento_sistema", "chat_mensajes_de_sistema"];
const TABLAS = enSql(LISTA_TABLAS);
const DEL_MESSENGER = new Set([...LISTA_TABLAS, ...LISTA_FUNCIONES, ...FUNCIONES_A, ...FUNCIONES_1B, "chat_conversaciones_creadas"]);
const sinComentarios = (s: string) => s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
function objetivos(sql: string): string[] {
  const s = sinComentarios(sql);
  const n = String.raw`(?:only\s+)?(?:public\.)?"?(\w+)`;
  const patrones = [
    new RegExp(String.raw`\b(?:alter|drop)\s+table\s+(?:if\s+exists\s+)?` + n, "gi"),
    new RegExp(String.raw`\bcreate\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(?:\w+\s+)?on\s+` + n, "gi"),
    new RegExp(String.raw`\b(?:create(?:\s+or\s+replace)?|drop|alter)\s+(?:constraint\s+)?trigger\b[^;]*?\bon\s+` + n, "gi"),
    new RegExp(String.raw`\b(?:create|drop|alter)\s+policy\b[^;]*?\bon\s+` + n, "gi"),
    new RegExp(String.raw`\b(?:create(?:\s+or\s+replace)?|drop|alter)\s+function\s+(?:if\s+exists\s+)?` + n, "gi"),
    new RegExp(String.raw`\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+` + n, "gi"),
    new RegExp(String.raw`\b(?:grant|revoke)\b[^;]*?\bon\s+(?:table\s+|function\s+)?` + n, "gi"),
    new RegExp(String.raw`\block\s+table\s+` + n, "gi"),
  ];
  const hits = new Set<string>();
  for (const p of patrones) for (const m of s.matchAll(p)) if (DEL_MESSENGER.has(m[1].toLowerCase())) hits.add(m[1].toLowerCase());
  for (const m of s.matchAll(/\balter\s+publication\b[^;]*/gi)) {
    for (const w of m[0].matchAll(/\w+/g)) if (DEL_MESSENGER.has(w[0].toLowerCase())) hits.add(w[0].toLowerCase());
  }
  return [...hits].sort();
}
const FIXTURE_HASTA = "20260929180000";
// Migraciones que tocan objetos de este banco pero necesitan tablas que sus fixtures no traen.
// Se prueban en su propio banco, con el motivo al lado.
const NO_CARGAN_AQUI: Record<string, string> = {
  "20261111030000_fuera_de_cowork_solo_su_turno.sql":
    "Cowork: el arreglo de «fuera de Cowork» (solo si entró para su turno). Entra a esta cadena solo porque su " +
    "vigía inserta avisos en notifications, pero usa las tablas del reloj de Cowork y es_admin_o_dueno, que este " +
    "fixture no trae; no toca nada del Messenger.",
  "20261111110000_aviso_blu_caido.sql":
    "Blu: aviso a los dueños si el puente con Blu se cae y los ingresos se quedan atrás. Inserta en notifications, " +
    "pero usa blu_bridge_state, creator_daily_earnings y pg_cron, que este fixture no trae; no toca nada del Messenger.",
  "20261111100000_purga_y_candado_de_llamadas.sql":
    "Papelera: el candado calls_agencia deja pasar a NULL quién llama y a quién (la purga de cuentas) y se quita un " +
    "cron muerto. Usa pg_cron, que este fixture no trae; el candado no cambia nada del Messenger.",
  "20261111090000_fuera_de_cowork_sin_pisarse.sql":
    "Cowork: un episodio de «fuera de Cowork» no se pisa con el anterior (mismo vigía, solo cambia desde). " +
    "Entra a esta cadena solo porque su vigía inserta avisos en notifications, pero usa las tablas del reloj de " +
    "Cowork y es_admin_o_dueno, que este fixture no trae; no toca nada del Messenger.",
  "20261111080000_salud_de_llamada.sql":
    "Llamadas: por qué se cae la llamada (llamada_salud, diagnóstico y aviso a la persona y su supervisor). " +
    "Entra a esta cadena solo porque su vigía inserta avisos en notifications, pero usa es_admin_o_dueno, " +
    "equipo_de y pg_cron, que este fixture no trae; no toca nada del Messenger.",
  "20261111050000_fuera_de_cowork_reglas_alvaro.sql":
    "Cowork: las reglas de «fuera de Cowork» de Alvaro (a todos; llamada de Maven y últimos 10 min no cuentan). " +
    "Entra a esta cadena solo porque su vigía inserta avisos en notifications, pero usa las tablas del reloj de " +
    "Cowork y es_admin_o_dueno, que este fixture no trae; no toca nada del Messenger.",
  "20261111010000_donde_esta_cada_uno.sql":
    "Cowork: «fuera de Cowork» y el tablero «Dónde está cada uno» (cowork_fuera y funciones de turno). Entra a " +
    "esta cadena solo porque su vigía inserta avisos en notifications, pero usa es_admin_o_dueno, roles_config y " +
    "las tablas del reloj de Cowork, que este fixture no trae; no toca nada del Messenger. Se prueba en frontend/test/hr.",
  "20261105170000_exonerar_camara_pantalla.sql":
    "Argos: le suma exonera_camara_pantalla a profiles y a roles_config (excepción de cámara/pantalla por " +
    "persona y por rol). Entra a esta cadena solo por el alter de profiles, pero necesita roles_config, que " +
    "este fixture no trae; no toca nada del Messenger. Desde el 09/11 tumbaba este banco en todo PR con migración.",
  "20261106000000_turnos_por_rol.sql":
    "Argos: turnos por rol (rol_turnos) y el turno de cada persona (profiles.turno_id). Entra a esta cadena " +
    "solo por el alter de profiles, pero lee roles_config, que este fixture no trae; no toca nada del Messenger.",
  "20261105190000_horarios_por_rol.sql":
    "Argos: horario y cupo de baño/comida por rol y por persona (columnas en roles_config y profiles). Entra " +
    "a esta cadena solo por el alter de profiles, pero necesita roles_config, que este fixture no trae; no " +
    "toca nada del Messenger.",
  "20261030120000_monitor_camara_ia.sql":
    "el monitor de cámara de Cowork; solo toca el Messenger porque su trigger inserta avisos en notifications, pero " +
    "crea sus propias tablas y el bucket de storage, y no aporta nada al Messenger. Se prueba en frontend/test/monitor.",
  "20261009100000_portal_pedidos.sql":
    "solo toca el Messenger porque inserta avisos en notifications (los Personalizados del portal), pero necesita " +
    "custom_requests, creadora_cuentas y drive_items, que este fixture no trae. Se prueba en portal_pedidos.ts.",
  "20261001211000_roles_por_agencia.sql":
    "reescribe is_in_role_group y le suma tenant_id a user_roles, pero necesita roles_config, role_permissions, " +
    "role_base_grants y sus triggers. Con una agencia da lo mismo que prod persona por persona; se prueba en " +
    "roles_por_agencia.ts sobre el catálogo de prod.",
  "20261006130000_agencia_lineas.sql":
    "crea agencia_lineas (con FK a scouter_companies, que este fixture no trae) y le cambia el NOMBRE a una agencia " +
    "(ASM Tech → Kash): los mensajes de sistema usan el id de la agencia, nunca el nombre. Se prueba en agencia_lineas.ts.",
};
const DIR_MIG = new URL("../migrations/", import.meta.url);
const CADENA: { n: string; sql: string }[] = [...Deno.readDirSync(DIR_MIG)].map((e) => e.name)
  .filter((n) => /^\d{14}_\w+\.sql$/.test(n) && n.slice(0, 14) > FIXTURE_HASTA && !NO_CARGAN_AQUI[n]).sort()
  .map((n) => ({ n, sql: n === NOMBRE_1B ? MIG_1B : Deno.readTextFileSync(new URL(n, DIR_MIG)) }))
  .filter((m) => objetivos(m.sql).length > 0);
const iMia = CADENA.findIndex((m) => m.n === NOMBRE_1B);
const ANTES = CADENA.slice(0, Math.max(iMia, 0));
// Hasta esta, sin las que vienen después (la B de la escritura por API): para medir
// lo que cambia ESTA migración.
const HASTA_ESTA = CADENA.slice(0, iMia + 1);

// ─── Gente, agencia y conversaciones del ensayo ──────────────────────────────
const T1 = "10000000-0000-4000-8000-000000000001";
const JHON = "a0000000-0000-4000-8000-000000000001";
const ANA = "a0000000-0000-4000-8000-000000000002";
const BETO = "a0000000-0000-4000-8000-000000000003";
const CARLA = "a0000000-0000-4000-8000-000000000004";
const DANI = "a0000000-0000-4000-8000-000000000005";
const EVA = "a0000000-0000-4000-8000-000000000006"; // sin full_name: la app pone el relleno
const FABI = "a0000000-0000-4000-8000-000000000007"; // de la agencia, en ningún grupo
const NUEVA = "a0000000-0000-4000-8000-000000000008"; // de la agencia, en ningún grupo
const NOMBRE: Record<string, string | null> = {
  [JHON]: "Jhon Lopez", [ANA]: "Ana Ruiz", [BETO]: "Beto Paz", [CARLA]: "Carla Gil", [DANI]: "Dani Mora",
  [EVA]: null, [FABI]: "Fabi Sol", [NUEVA]: "Nueva Persona",
};
const G1 = "c0000000-0000-4000-8000-000000000001"; // Jhon (creó, admin) + Ana, Beto, Eva; permisos de admins
const G3 = "c0000000-0000-4000-8000-000000000003"; // lo creó Beto (member); Ana y Carla admins, Dani; info y add = 'all'
const G4 = "c0000000-0000-4000-8000-000000000004"; // de anuncios (msg_permission = 'admins'): Jhon admin + Ana
const G5 = "c0000000-0000-4000-8000-000000000005"; // Eva (sin nombre) admin + Ana
const DM1 = "c0000000-0000-4000-8000-000000000009"; // directo Jhon + Ana
const M_TXT = "e0000000-0000-4000-8000-000000000001"; // texto de Ana en G1
const M_SIS = "e0000000-0000-4000-8000-000000000002"; // aviso de Ana en G1 (de antes)
const NO_EXISTE = "c0000000-0000-4000-8000-0000000000ff";

const usuario = (id: string) => `('${id}', '${id.slice(-2)}@ejemplo.test', '${NOMBRE[id] ? JSON.stringify({ full_name: NOMBRE[id] }) : "{}"}')`;
const SEMILLA = `
insert into public.tenants(id, slug, name) values ('${T1}', 'asm-tech', 'ASM Tech');
insert into auth.users(id, email, raw_user_meta_data) values ${[JHON, ANA, BETO, CARLA, DANI, EVA, FABI, NUEVA].map(usuario).join(", ")};
insert into public.chat_conversations(id, type, name, created_by, created_at, info_permission, add_permission, msg_permission) values
  ('${G1}', 'group', 'Equipo', '${JHON}', '2026-09-01 10:00+00', 'admins', 'admins', 'all'),
  ('${G3}', 'group', 'Abierto', '${BETO}', '2026-09-02 10:00+00', 'all', 'all', 'all'),
  ('${G4}', 'group', 'Anuncios', '${JHON}', '2026-09-03 10:00+00', 'admins', 'admins', 'admins'),
  ('${G5}', 'group', 'De Eva', '${EVA}', '2026-09-04 10:00+00', 'admins', 'admins', 'all'),
  ('${DM1}', 'direct', null, '${JHON}', '2026-09-05 10:00+00', 'admins', 'admins', 'all');
insert into public.chat_participants(conversation_id, user_id, role) values
  ('${G1}', '${JHON}', 'admin'), ('${G1}', '${ANA}', 'member'), ('${G1}', '${BETO}', 'member'), ('${G1}', '${EVA}', 'member'),
  ('${G3}', '${ANA}', 'admin'), ('${G3}', '${CARLA}', 'admin'), ('${G3}', '${BETO}', 'member'), ('${G3}', '${DANI}', 'member'),
  ('${G4}', '${JHON}', 'admin'), ('${G4}', '${ANA}', 'member'),
  ('${G5}', '${EVA}', 'admin'), ('${G5}', '${ANA}', 'member'),
  ('${DM1}', '${JHON}', 'admin'), ('${DM1}', '${ANA}', 'member');
insert into public.chat_messages(id, conversation_id, sender_id, type, content, created_at) values
  ('${M_TXT}', '${G1}', '${ANA}', 'text', 'hola equipo', now() - interval '2 hours'),
  ('${M_SIS}', '${G1}', '${ANA}', 'system', 'Ana Ruiz agregó a Eva al grupo', now() - interval '1 hour');
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) {
    await db.exec("rollback").catch(() => {});
    throw new Error(`la migración ${nombre} no carga sobre el fixture: ${msg(e)}`);
  }
}
type Modo = "base" | "solo1b" | "1b";
async function nueva(modo: Modo, extra = ""): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(COMPLEMENTO);
  await db.exec(SEMILLA + extra);
  for (const m of modo === "base" ? ANTES : modo === "solo1b" ? HASTA_ESTA : CADENA) await aplicar(db, m.n, m.sql);
  return db;
}
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as Fila[];
const uno = async (db: PGlite, sql: string) => (await q(db, sql))[0];

// Un pedido como lo manda PostgREST: una transacción, el rol y los claims del JWT.
type Quien = string | "service_role" | "anon" | "postgres";
async function entrar(db: PGlite, quien: Quien) {
  await db.exec("reset role");
  if (quien === "postgres") {
    await db.query(`select set_config('request.jwt.claims', '', true)`);
    return;
  }
  const claims = quien === "service_role" || quien === "anon" ? { role: quien } : { sub: quien, role: "authenticated" };
  const rol = quien === "service_role" || quien === "anon" ? quien : "authenticated";
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
  await db.exec(`set local role ${rol}`);
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
async function anda(db: PGlite, quien: Quien, sql: string, m: string): Promise<Fila[] | null> {
  try { const r = await como(db, quien, sql); ok.push(m); return r; }
  catch (e) { mal.push(`${m} (falló: ${msg(e).slice(0, 160)})`); return null; }
}
async function falla(db: PGlite, quien: Quien, sql: string, patron: RegExp, m: string) {
  try { await como(db, quien, sql); mal.push(`${m} (NO falló)`); }
  catch (e) { const t = msg(e); check(patron.test(t), `${m} → ${t.slice(0, 110)}`); }
}
// Pedidos (cada uno con su persona) y, en la MISMA transacción, la pregunta de si
// tuvieron efecto (como superusuario); después se deshace todo.
type Paso = [Quien, string];
async function probar(db: PGlite, pasos: Paso[], efecto = "select true si"): Promise<{ ok: boolean; si?: boolean; error?: string; filas?: Fila[] }> {
  await db.exec("begin");
  try {
    for (const [quien, sql] of pasos) { await entrar(db, quien); await db.exec(sql); }
    await db.exec("reset role");
    const r = await q(db, efecto);
    await db.exec("rollback");
    return { ok: true, si: r[0]?.si === true, filas: r };
  } catch (e) {
    await db.exec("rollback");
    return { ok: false, error: msg(e) };
  }
}
// Un hueco: en `antes` tiene que funcionar (línea base); en `despues`, fallar con `cierre`.
async function hueco(antesDb: PGlite, despuesDb: PGlite, nombre: string, pasos: Paso[], efecto: string, cierre: RegExp) {
  const a = await probar(antesDb, pasos, efecto);
  check(a.ok && a.si === true,
    `${nombre}: ABIERTO sin la migración (línea base)${a.ok ? (a.si ? "" : " — corrió pero sin efecto: el test no prueba nada") : ` — falló: ${a.error?.slice(0, 90)}`}`);
  const d = await probar(despuesDb, pasos, efecto);
  check(!d.ok && cierre.test(d.error ?? ""),
    `${nombre}: cerrado con la migración → ${d.ok ? "PASÓ" + (d.si ? " y tuvo efecto" : " sin error") : d.error?.slice(0, 100)}`);
}
const rpc = (conv: string, evento: string | null, objetivo: string | null = null, texto: string | null = null) =>
  `select public.chat_evento_sistema('${conv}', ${evento === null ? "null" : `'${evento}'`}, ${objetivo ? `'${objetivo}'` : "null"}, ${texto === null ? "null" : lit(texto)}) id`;

// Las plantillas de la app en main 1ab8e4fc7, tal cual: ChatHeader.tsx:85-89 y
// GroupMembersPanel.tsx:199-202 (aceptó), 268-273 (agregó), 291-296 (eliminó),
// 319-326 (nombró/quitó admin), 333 + 360-365 (salió). `a` y `o` son el full_name
// de quien hace y de a quien le pasa (el de profiles; null si no tiene).
type Evento = "renombro" | "agrego" | "acepto" | "elimino" | "nombro_admin" | "quito_admin" | "salio";
const EVENTOS: Evento[] = ["renombro", "agrego", "acepto", "elimino", "nombro_admin", "quito_admin", "salio"];
const APP: Record<Evento, (a: string | null, o: string | null, v: string) => string> = {
  renombro: (a, _o, v) => `${a || "Alguien"} cambió el nombre del grupo a "${v}"`,
  agrego: (a, o) => `${a || "Admin"} agregó a ${o || "Usuario"} al grupo`,
  acepto: (a, o) => `${a || "Admin"} aceptó a ${o || "Usuario"} en el grupo`,
  elimino: (a, o) => `${a || "Admin"} eliminó a ${o || "Usuario"} del grupo`,
  nombro_admin: (a, o) => `${a || "Admin"} nombró admin a ${o || "Usuario"}`,
  quito_admin: (a, o) => `${a || "Admin"} quitó admin a ${o || "Usuario"}`,
  salio: (a) => `${a || "Usuario"} salió del grupo`,
};
const LLEVA_OBJETIVO = (e: Evento) => e !== "renombro" && e !== "salio";

// ─── Los candados (los mismos ayudantes que chat_agencia_y_huecos.ts) ────────
const FUERZA = ["accessshare", "rowshare", "rowexclusive", "shareupdateexclusive", "share", "sharerowexclusive", "exclusive", "accessexclusive"];
const fuerza = (m: string) => FUERZA.indexOf(m.toLowerCase().replace(/lock$/, "").replace(/\s+/g, ""));
const DEJA_LEER = fuerza("share row exclusive");
const pedidosDe = (sql: string) =>
  [...sql.matchAll(/\block\s+table\s+public\.(\w+)\s+in\s+([a-z ]+?)\s+mode/gi)].map((m) => ({ t: m[1], f: fuerza(m[2]) }));
const CANDADOS_TENIDOS = `select c.relname t, l.mode m from pg_locks l join pg_class c on c.oid = l.relation join pg_namespace n on n.oid = c.relnamespace
    where l.locktype = 'relation' and n.nspname = 'public' and c.relkind = 'r' and c.relname in ${TABLAS}`;
function candadosDeMas(tenidos: Fila[], pedidos: { t: string; f: number }[]): string[] {
  return tenidos.filter((l) => {
    const p = pedidos.find((x) => x.t === l.t);
    return !p || fuerza(l.m) > p.f || fuerza(l.m) > DEJA_LEER;
  }).map((l) => `${l.t}:${l.m}`);
}
const MIS_CANDADOS = `(select coalesce(string_agg(c.relname || ':' || replace(l.mode, 'Lock', ''), ',' order by c.relname), '(ninguno)')
    from pg_locks l join pg_class c on c.oid = l.relation join pg_namespace n on n.oid = c.relnamespace
   where l.locktype = 'relation' and n.nspname = 'public' and c.relkind = 'r' and c.relname in ${TABLAS})`;
function conFallosInyectados(sql: string, fallos: number): string {
  const i = sql.search(/^[ \t]*lock\s+table\b/im);
  const ini = sql.lastIndexOf("do $$", i), fin = sql.indexOf("end $$;", i);
  if (i < 0 || ini < 0 || fin < 0) throw new Error("no encontré el bloque de candados");
  const f = fin + "end $$;".length;
  const b = sql.slice(ini, f)
    .replace(/(\n\s*)(lock table public\.(\w+) in [a-z ]+ mode;)/gi,
      (_m, sp, lock, t) => `${sp}raise notice 'candado|${t}|%', current_setting('lock_timeout');${sp}${lock}`)
    .replace(/(\n\s*)exit;/, (_m, sp) => `${sp}if _intento <= ${fallos} then` +
      `${sp}  raise notice 'fallo|%|%', _intento, extract(epoch from clock_timestamp());` +
      `${sp}  raise exception using errcode = 'lock_not_available', message = 'candado ocupado (inyectado)';` +
      `${sp}end if;${sp}exit;`)
    .replace(/(exception\s+when\s+lock_not_available\s+or\s+deadlock_detected\s+then)/i,
      (m) => `${m}\n      raise notice 'handler|%|%', _intento, ${MIS_CANDADOS};`);
  if (!b.includes("'candado|") || !b.includes("'fallo|") || !b.includes("'handler|")) throw new Error("no pude inyectar el fallo en el bloque de candados");
  return sql.slice(0, ini) + b + `\ndo $$ begin raise notice 'tras|%', current_setting('lock_timeout'); end $$;` + sql.slice(f);
}
async function ensayarCandados(db: PGlite, sql: string): Promise<{ avisos: string[]; error: string | null }> {
  const avisos: string[] = [];
  try {
    // deno-lint-ignore no-explicit-any
    await db.exec(sql, { onNotice: (n: any) => avisos.push(String(n.message)) } as any);
    return { avisos, error: null };
  } catch (e) {
    await db.exec("rollback").catch(() => {});
    return { avisos, error: msg(e) };
  }
}
function leerAvisos(avisos: string[]) {
  const partes = (p: string) => avisos.filter((a) => a.startsWith(p + "|")).map((a) => a.split("|"));
  const fallos = partes("fallo").map((x) => Number(x[2]));
  return {
    candados: partes("candado").map((x) => x[2]),
    handler: partes("handler").map((x) => x[2]),
    fallos: fallos.length,
    separaciones: fallos.slice(1).map((t, k) => t - fallos[k]),
    tras: partes("tras").map((x) => x[1]),
  };
}
const seSeparan = (s: number[]) => s.every((x) => x >= 0.95);
const QUE_QUEDO = `select
    (select count(*)::int from pg_proc where proname = 'chat_evento_sistema') rpc,
    (select count(*)::int from pg_trigger where tgname = 'trg_mensajes_de_sistema' and tgenabled <> 'D') trigger_prendido,
    (select count(*)::int from pg_trigger where tgname = 'trg_mensajes_de_sistema') trigger_existe,
    current_setting('lock_timeout') lock_timeout`;

// Una foto del catálogo (public y auth), objeto por objeto (la de chat_agencia_y_huecos.ts).
const FOTO_SQL = `
select 'función ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' k,
       md5(p.prosrc) || ' secdef=' || p.prosecdef::text || ' vol=' || p.provolatile::text || ' cfg=' || coalesce(p.proconfig::text, '-') || ' acl=' || coalesce(p.proacl::text, '-') v
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'auth')
union all
select 'trigger ' || c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid) || ' ' || t.tgenabled::text
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
 where not t.tgisinternal and n.nspname in ('public', 'auth')
union all
select 'política ' || tablename || '.' || policyname, permissive || '|' || roles::text || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')
  from pg_policies where schemaname = 'public'
union all
select 'columna ' || c.relname || '.' || a.attname, format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' nn' else '' end || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
 where n.nspname = 'public' and c.relkind in ('r', 'v') and a.attnum > 0 and not a.attisdropped
union all
select 'constraint ' || c.relname || '.' || k.conname, pg_get_constraintdef(k.oid)
  from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
union all
select 'índice ' || i.relname, pg_get_indexdef(i.oid)
  from pg_class i join pg_namespace n on n.oid = i.relnamespace where n.nspname = 'public' and i.relkind = 'i'
union all
select 'relación ' || c.relname, c.relkind::text || ' rls=' || c.relrowsecurity::text || ' acl=' || coalesce(c.relacl::text, '-')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'v', 'S')
union all
select 'realtime ' || tablename, pubname from pg_publication_tables where schemaname = 'public'`;
const foto = async (db: PGlite) => new Map((await q(db, FOTO_SQL)).map((r) => [r.k as string, r.v as string]));
const diferencias = (a: Map<string, string>, b: Map<string, string>) =>
  [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k))
    .map((k) => `${a.has(k) ? (b.has(k) ? "CAMBIA" : "FALTA") : "SOBRA"} ${k}`).sort();

// Cada sección corre aparte: si una revienta (por ejemplo, con una versión rota de
// la migración), queda anotada como falla y las demás siguen, para que el informe
// diga qué se rompió.
async function seccion(nombre: string, fn: () => Promise<void>) {
  try { await fn(); }
  catch (e) { mal.push(`sección ${nombre}: el banco se cortó → ${msg(e).slice(0, 200)}`); }
}

// ════ 0. La base es prod, la cadena y la forma de la migración ═══════════════
// Las huellas de prod del 01/10 (MCP execute_sql, solo lectura) de lo que esta
// migración toca o usa: chat_messages entera (columnas, constraints, triggers,
// políticas), las políticas y columnas de conversaciones, participantes y
// perfiles, y las funciones que la RPC llama o que corren en el mismo INSERT.
// La misma consulta (HUELLAS_SQL) da lo mismo sobre la base (fixture + la A).
const HUELLAS_PROD_0110: Record<string, string> = {
  "columnas chat_conversations": "e941ce757977ab1a96dafe91e3e88482",
  "columnas chat_messages": "ab93b6c096b0a881e81e5d0ccc641353",
  "columnas chat_participants": "5ebf1cb4e183a087f63cb8a7b730a43f",
  "columnas profiles": "0c582c7429250f2cdd8a8613271b1580",
  "constraints chat_messages": "b8937feabf51255befbf2ac9c2a74800",
  "funcion chat_messages_al_insertar": "c4173892df226bc6b818d8251b6527a8",
  "funcion current_tenant_id": "1efc88c2899114211439a049bb7ac4c0",
  "funcion delete_chat_message": "8d348a2a946c8b6cf2a27476cd17869c",
  "funcion guard_chat_conversation_meta": "b8a424da391d2d34610222a6560fac06",
  "funcion guard_chat_message_update": "5ff71eebdd760108c0f9fd477608f218",
  "funcion guard_chat_participant_update": "c3ea0417a01db23eb20b54fade5a9d16",
  "funcion is_chat_admin": "e6c36ddd0c4457bed93046e13acba915",
  "funcion is_chat_participant": "a647d439d5170c477dbbbc41febef17a",
  "funcion notify_chat_message": "7d2c5afc894e23a98bcf0b2b06c09dcc",
  "funcion push_chat_message": "25d576d029ba02f337740e150ee56284",
  "politicas chat_conversations": "e7e1889ae41f2ab49ddd369eb476f652",
  "politicas chat_messages": "6c538aeeb778aa6c553a5d597d345d7e",
  "politicas chat_participants": "44c880a65f689155cc420e0674deaf13",
  "politicas profiles": "c2557e9db6870b41531e7046e437ba1c",
  "triggers chat_messages": "cc24fe8f68f378895cd44739ce5b5fe1",
};
const HUELLAS_SQL = `
select 'funcion ' || p.proname k, md5(p.prosrc || '|' || p.prosecdef::text || '|' || coalesce(p.proconfig::text, '') || '|' || coalesce(p.proacl::text, '')) h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('is_chat_participant','is_chat_admin','guard_chat_message_update','chat_messages_al_insertar','delete_chat_message','notify_chat_message','push_chat_message','chat_evento_sistema','chat_mensaje_de_sistema','guard_chat_conversation_meta','guard_chat_participant_update','current_tenant_id')
union all
select 'triggers chat_messages', md5(string_agg(t.tgname || ':' || pg_get_triggerdef(t.oid) || ':' || t.tgenabled::text, E'\\n' order by t.tgname))
  from pg_trigger t where t.tgrelid = 'public.chat_messages'::regclass and not t.tgisinternal
union all
select 'politicas ' || tablename, md5(string_agg(policyname || '|' || permissive || '|' || roles::text || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), E'\\n' order by policyname))
  from pg_policies where schemaname = 'public' and tablename in ('chat_messages','chat_participants','chat_conversations','profiles') group by tablename
union all
select 'columnas ' || c.relname, md5(string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '') || case when a.attnotnull then ' nn' else '' end, ',' order by a.attnum))
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
 where n.nspname = 'public' and c.relname in ('chat_messages','chat_conversations','chat_participants','profiles') and a.attnum > 0 and not a.attisdropped
 group by c.relname
union all
select 'constraints chat_messages', md5(string_agg(k.conname || ' ' || pg_get_constraintdef(k.oid), ',' order by k.conname)) from pg_constraint k where k.conrelid = 'public.chat_messages'::regclass`;
const huellas = async (db: PGlite) => Object.fromEntries((await q(db, HUELLAS_SQL)).map((f) => [f.k as string, f.h as string]));
const distintasDeProd = (h: Record<string, string>) =>
  [...new Set([...Object.keys(HUELLAS_PROD_0110), ...Object.keys(h)])].filter((k) => HUELLAS_PROD_0110[k] !== h[k]).sort();
await seccion("0 · la base y la forma", async () => {
  check(iMia > 0 && ANTES.some((m) => m.n === NOMBRE_A),
    `la cadena: ${CADENA.map((m) => m.n).join(", ")}; antes de esta van ${ANTES.map((m) => m.n).join(", ")}`);
  const base = await nueva("base");
  const dif = distintasDeProd(await huellas(base));
  check(dif.length === 0, `la base (fixture + ${ANTES.length} migración/es) es prod del 01/10 en las ${Object.keys(HUELLAS_PROD_0110).length} huellas de lo que esto toca${dif.length ? ` — distintas: ${dif.join(", ")}` : ""}`);
  const conMia = await nueva("1b");
  // Lo que cambia ESTA migración, sin las posteriores de la cadena (la B suma columnas
  // y políticas a chat_messages a propósito: lo prueba su banco).
  const difMia = distintasDeProd(await huellas(await nueva("solo1b")));
  check(difMia.includes("triggers chat_messages") && !difMia.includes("politicas chat_messages") && !difMia.includes("columnas chat_messages"),
    `línea base que puede fallar: con la migración, la huella marca el trigger nuevo y no cambia ni columnas ni políticas de chat_messages (${difMia.join(", ")})`);

  // Privilegios.
  const priv = await q(conMia, `select p.proname f, has_function_privilege('anon', p.oid, 'execute') anon,
      has_function_privilege('authenticated', p.oid, 'execute') auth, p.prosecdef d
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ${enSql(FUNCIONES_1B)} order by 1`);
  const rpcP = priv.find((f) => f.f === "chat_evento_sistema"), trgP = priv.find((f) => f.f === "chat_mensajes_de_sistema");
  check(rpcP?.anon === false && rpcP?.auth === true && rpcP?.d === true,
    `chat_evento_sistema: DEFINER, la ejecuta authenticated y NO anon (${JSON.stringify(rpcP)})`);
  check(trgP?.anon === false && trgP?.auth === false, `la función del trigger no la ejecutan ni anon ni authenticated (${JSON.stringify(trgP)})`);

  // El orden de los BEFORE: el trigger nuevo va después de los de la A.
  const antesDe = await q(conMia, `select t.tgname n from pg_trigger t where t.tgrelid = 'public.chat_messages'::regclass and not t.tgisinternal
      and (t.tgtype & 2) = 2 order by t.tgname`);
  const nombres = antesDe.map((t) => t.n as string);
  check(nombres.indexOf("trg_mensajes_de_sistema") > nombres.indexOf("chat_messages_al_insertar")
      && nombres.indexOf("trg_mensajes_de_sistema") > nombres.indexOf("trg_guard_chat_message_update")
      && nombres.indexOf("chat_messages_al_insertar") >= 0 && nombres.indexOf("trg_guard_chat_message_update") >= 0,
    `los BEFORE de chat_messages corren en orden alfabético y el nuevo va después de los de la A (${nombres.join(" → ")})`);
  await falla(conMia, ANA, `update chat_messages set type = 'system' where id = '${M_TXT}'`, /chat_mensaje_inmutable/,
    "pasar un mensaje a 'system' sigue dando el error de la A (el banco del PR 1 lo compara)");

  // Forma: el candado primero, uno solo y que deja leer.
  const sc = sinComentarios(MIG_1B);
  const primera = sc.split("\n").map((l) => l.trim()).find((l) => l);
  check(primera === "set lock_timeout = '3s';", "la migración arranca con set lock_timeout = '3s'");
  const pedidos = pedidosDe(sc);
  const tras = sc.slice(sc.indexOf("set lock_timeout = '3s';") + 1, sc.search(/\block\s+table\b/i));
  check(pedidos.length >= 1 && !/\b(create|alter|drop|insert|update|delete|comment|grant|revoke)\b/i.test(tras),
    `el candado se pide antes de cualquier otra sentencia (${pedidos.map((p) => `${p.t}:${FUERZA[p.f]}`).join(", ")})`);
  check(pedidos.every((p) => p.f <= DEJA_LEER), "ningún candado traba las lecturas (como mucho SHARE ROW EXCLUSIVE)");
  check(/set_config\('lock_timeout',\s*'200ms',\s*true\)/.test(sc) && /exception\s+when\s+lock_not_available\s+or\s+deadlock_detected/i.test(sc),
    "cada candado espera como mucho 200 ms, y si no llega se suelta todo y se reintenta");
  check(!/create\s+policy|drop\s+policy|alter\s+policy/i.test(sc), "no toca políticas");
  // Los caracteres que la RPC le saca al nombre van escritos como \uXXXX: uno
  // literal en el fuente no se ve en el diff (y un U+202E da vuelta lo que sigue).
  const invisibles = [...MIG_1B].filter((c) => /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Zs}]/u.test(c) && !" \t\n".includes(c));
  check(invisibles.length === 0, `la migración no trae caracteres invisibles literales (${invisibles.map((c) => "U+" + c.codePointAt(0)!.toString(16).toUpperCase()).join(" ") || "ninguno"})`);
  const dbL = await nueva("base");
  await dbL.exec("begin;\n" + MIG_1B);
  const tenidos = await q(dbL, CANDADOS_TENIDOS);
  await dbL.exec("rollback");
  const deMas = candadosDeMas(tenidos, pedidos);
  check(tenidos.length >= 1 && deMas.length === 0,
    `con la migración entera corrida, ninguna tabla del chat tiene un candado que no se haya pedido al principio ni uno que trabe las lecturas (${tenidos.map((l) => `${l.t}:${l.m}`).join(", ")}${deMas.length ? `; de más: ${deMas.join(", ")}` : ""})`);
});

// ════ 0b. Los candados, con un candado ocupado ═══════════════════════════════
await seccion("0b · candados", async () => {
  const n = pedidosDe(sinComentarios(MIG_1B)).length;
  try {
    const db = await nueva("base");
    const r = await ensayarCandados(db, "begin;\n" + conFallosInyectados(MIG_1B, 2) + "\ncommit;");
    const a = leerAvisos(r.avisos);
    const quedo = await uno(db, QUE_QUEDO);
    check(r.error === null && quedo?.rpc === 1 && quedo?.trigger_prendido === 1,
      `migración con el candado ocupado 2 veces: se aplica al tercer intento${r.error ? ` — falló: ${r.error.slice(0, 100)}` : ""}`);
    check(a.candados.length === 3 * n && a.candados.every((t) => t === "200ms"),
      `…cada uno de los ${a.candados.length} pedidos de candado espera con lock_timeout = 200ms (${[...new Set(a.candados)].join(", ")})`);
    check(a.handler.length === 2 && a.handler.every((h) => h === "(ninguno)"), `…el intento que falla suelta todo antes de dormir (${a.handler.join(" / ")})`);
    check(a.separaciones.length === 1 && seSeparan(a.separaciones), `…entre intentos pasa 1 s o más (${a.separaciones.map((x) => x.toFixed(2)).join(", ")} s)`);
    check(a.tras.length === 1 && a.tras[0] === "3s" && quedo?.lock_timeout === "0",
      `…el resto corre con lock_timeout = 3s y al terminar la sesión queda como estaba (${a.tras.join(", ")} / ${quedo?.lock_timeout})`);
  } catch (e) { mal.push(`ensayo de candados de la migración: ${msg(e).slice(0, 160)}`); }
  try {
    const db = await nueva("base");
    const r = await ensayarCandados(db, "begin;\n" + conFallosInyectados(MIG_1B, 8) + "\ncommit;");
    const a = leerAvisos(r.avisos);
    const quedo = await uno(db, QUE_QUEDO);
    check(/chat_candados/.test(r.error ?? "") && a.fallos === 8 && a.handler.every((h) => h === "(ninguno)") && seSeparan(a.separaciones),
      `migración con el candado ocupado 8 veces: se rinde con chat_candados, soltando todo entre intentos → ${(r.error ?? "SE APLICÓ").slice(0, 80)}`);
    check(quedo?.rpc === 0 && quedo?.trigger_existe === 0, `…y no queda nada aplicado (${JSON.stringify(quedo)})`);
  } catch (e) { mal.push(`ensayo de candados de la migración (8 fallos): ${msg(e).slice(0, 160)}`); }
});

// ════ 1. El hueco: un aviso libre entra en prod y no con la migración ════════
await seccion("1 · el hueco", async () => {
  const base = await nueva("base");
  const conMia = await nueva("1b");
  const libre = (quien: string, conv: string, texto: string) =>
    `insert into chat_messages(conversation_id, sender_id, type, content) values ('${conv}', '${quien}', 'system', ${lit(texto)})`;
  const hay = (texto: string) => `select exists (select 1 from chat_messages where type = 'system' and content = ${lit(texto)}) si`;
  const INVENTO = "Jhon Lopez nombró admin a Ana Ruiz";
  await hueco(base, conMia, "un miembro inventa un aviso («Jhon Lopez nombró admin a Ana Ruiz»)",
    [[ANA, libre(ANA, G1, INVENTO)]], hay(INVENTO), /chat_sistema_sin_evento/);
  await hueco(base, conMia, "un admin tampoco escribe un aviso libre («BLU (API): …»)",
    [[JHON, libre(JHON, G1, "BLU (API): reunión cancelada")]], hay("BLU (API): reunión cancelada"), /chat_sistema_sin_evento/);
  await hueco(base, conMia, "un miembro de un grupo de ANUNCIOS se cuela con un aviso (la política lo exceptúa)",
    [[ANA, libre(ANA, G4, "Aviso: mañana no hay turno")]], hay("Aviso: mañana no hay turno"), /chat_sistema_sin_evento/);
  await hueco(base, conMia, "el autor de un aviso le cambia el texto (la política UPDATE lo deja)",
    [[ANA, `update chat_messages set content = 'Jhon Lopez eliminó a Beto Paz del grupo' where id = '${M_SIS}'`]],
    `select exists (select 1 from chat_messages where id = '${M_SIS}' and content like 'Jhon%') si`, /chat_sistema_inmutable/);
  await hueco(base, conMia, "el autor de un aviso le pone texto rico (la burbuja pinta el rico)",
    [[ANA, `update chat_messages set content_rich = '{"type":"doc","content":[{"type":"text","text":"otro"}]}' where id = '${M_SIS}'`]],
    `select exists (select 1 from chat_messages where id = '${M_SIS}' and content_rich is not null) si`, /chat_sistema_inmutable/);
  {
    // Con la A vuelta atrás, la guarda de la A ya no frena pasar un mensaje a aviso: la de aquí sí.
    const sinA = await nueva("base");
    await sinA.exec(VUELTA_A);
    const sinAconMia = await nueva("1b");
    await sinAconMia.exec(VUELTA_A);
    await hueco(sinA, sinAconMia, "con la A vuelta atrás, pasar un mensaje propio a 'system'",
      [[ANA, `update chat_messages set type = 'system' where id = '${M_TXT}'`]],
      `select exists (select 1 from chat_messages where id = '${M_TXT}' and type = 'system') si`, /chat_sistema_sin_evento/);
  }

  // El GUC vale para ESA fila, y la RPC lo apaga.
  const OTRO_ID = "e0000000-0000-4000-8000-0000000000aa", ESTE_ID = "e0000000-0000-4000-8000-0000000000bb";
  const conGuc = (guc: string, id: string) =>
    `select set_config('maven.evento_sistema', '${guc}', true); insert into chat_messages(id, conversation_id, sender_id, type, content) values ('${id}', '${G1}', '${ANA}', 'system', 'x')`;
  const r1 = await probar(conMia, [[ANA, conGuc(OTRO_ID, ESTE_ID)]]);
  check(!r1.ok && /chat_sistema_sin_evento/.test(r1.error ?? ""), `el permiso con el id de OTRA fila no deja pasar → ${r1.ok ? "PASÓ" : r1.error?.slice(0, 80)}`);
  const r1b = await probar(conMia, [[ANA, conGuc(ESTE_ID, ESTE_ID)]]);
  check(r1b.ok, `(línea base: con el id de ESA fila, sí; es lo que pone la RPC${r1b.ok ? "" : ` — falló: ${r1b.error?.slice(0, 80)}`})`);
  const r2 = await probar(conMia, [[ANA, rpc(G1, "salio")], [ANA, `select current_setting('maven.evento_sistema', true) g`]],
    `select current_setting('maven.evento_sistema', true) g`);
  check(r2.ok && r2.filas?.[0]?.g === "", `después de la RPC, en la misma transacción, el permiso ya está apagado (${JSON.stringify(r2.filas?.[0]?.g)})`);
  const r3 = await probar(conMia, [[ANA, rpc(G1, "salio")], [ANA, libre(ANA, G1, "y ahora uno libre")]]);
  check(!r3.ok && /chat_sistema_sin_evento/.test(r3.error ?? ""), `…y un aviso libre en esa misma transacción no entra → ${r3.ok ? "PASÓ" : r3.error?.slice(0, 80)}`);

  // Los caminos del servidor siguen escribiendo avisos: sin claims (cron, migraciones,
  // SQL a mano). Desde la B (20261001200000), service_role ya no inserta en
  // chat_messages (ninguna edge lo hace; lo prueba api_messenger_escritura.ts), pero
  // sí corrige.
  await anda(conMia, "postgres", libre(JHON, G1, "Aviso del servidor"), "sin claims (cron, migraciones, SQL a mano) se siguen insertando avisos de sistema");
  await anda(conMia, "postgres", libre(JHON, G1, "Aviso de una migración"), "…y otro");
  await anda(conMia, "service_role", `update chat_messages set content = 'Aviso del servidor, corregido' where content = 'Aviso del servidor'`,
    "y service_role los puede corregir");
  // Un aviso se borra como cualquier mensaje (delete_chat_message archiva y vacía).
  const b = await anda(conMia, ANA, `select public.delete_chat_message('${M_SIS}') r`, "el autor borra su aviso con delete_chat_message");
  const bb = await uno(conMia, `select m.is_deleted d, m.content c, a.content ac from chat_messages m join chat_message_deletions a on a.message_id = m.id where m.id = '${M_SIS}'`);
  check(b?.[0]?.r?.ok === true && bb?.d === true && bb?.c === null && bb?.ac === "Ana Ruiz agregó a Eva al grupo",
    `…queda borrado y vacío, y el archivo guarda el texto (${JSON.stringify(bb)})`);
  // Los mensajes normales, igual que antes.
  await anda(conMia, ANA, `insert into chat_messages(conversation_id, sender_id, content) values ('${G1}', '${ANA}', 'un mensaje normal')`, "un mensaje de texto entra como siempre");
  await anda(conMia, ANA, `update chat_messages set content = 'hola equipo (editado)', is_edited = true where id = '${M_TXT}'`, "y se edita como siempre");
});

// ════ 2. Los siete eventos: el texto de la app, en la base ═══════════════════
await seccion("2 · los siete eventos", async () => {
  const db = await nueva("1b");
  // [evento, quién, grupo, objetivo, texto]: como lo hace la app.
  const casos: [Evento, string, string, string | null, string | null][] = [
    ["renombro", JHON, G1, null, "Equipo 2"],
    ["agrego", JHON, G1, NUEVA, null],
    ["acepto", JHON, G1, FABI, null],
    ["elimino", JHON, G1, BETO, null],
    ["nombro_admin", JHON, G1, ANA, null],
    ["quito_admin", JHON, G1, ANA, null],
    ["salio", ANA, G1, null, null],
    // Los rellenos: Eva no tiene nombre.
    ["renombro", EVA, G5, null, "Sin nombre"],
    ["agrego", EVA, G5, NUEVA, null],
    ["acepto", EVA, G5, FABI, null],
    ["elimino", EVA, G5, ANA, null],
    ["nombro_admin", EVA, G5, ANA, null],
    ["quito_admin", EVA, G5, ANA, null],
    ["salio", EVA, G5, null, null],
    ["agrego", JHON, G1, EVA, null],
    ["acepto", JHON, G1, EVA, null],
    ["elimino", JHON, G1, EVA, null],
    ["nombro_admin", JHON, G1, EVA, null],
    ["quito_admin", JHON, G1, EVA, null],
    // Lo que la app deja escribir en un nombre de grupo pasa tal cual (comillas, %).
    ["renombro", JHON, G1, null, `Grupo "A" 100% {x} $1`],
  ];
  const vistos = new Set<string>();
  let iguales = 0;
  for (const [ev, quien, g, obj, texto] of casos) {
    const r = await probar(db, [[quien, rpc(g, ev, obj, texto) + ";"]],
      `select m.id::text id, m.content c, m.type t, m.sender_id::text s, m.content_rich cr, m.is_edited e, m.created_at > now() - interval '1 minute' reciente,
         (select count(*)::int from chat_messages x where x.type = 'system' and x.created_at > now() - interval '1 minute') n
         from chat_messages m where m.type = 'system' and m.conversation_id = '${g}' order by m.created_at desc, m.id desc limit 1`);
    const esperado = APP[ev](NOMBRE[quien], obj ? NOMBRE[obj] : null, texto ?? "");
    const f = r.filas?.[0];
    const bien = r.ok && f?.c === esperado && f?.t === "system" && f?.s === quien && f?.cr === null && f?.e === false && f?.reciente === true && f?.n === 1;
    if (bien) { iguales++; vistos.add(ev); }
    check(bien, `${ev} (${NOMBRE[quien] ?? "sin nombre"}${obj ? ` → ${NOMBRE[obj] ?? "sin nombre"}` : ""}): «${esperado}»${bien ? "" : ` — dio ${r.ok ? `«${f?.c}» ${JSON.stringify({ t: f?.t, s: f?.s, n: f?.n })}` : r.error?.slice(0, 90)}`}`);
  }
  check(iguales === casos.length && vistos.size === EVENTOS.length, `los ${EVENTOS.length} eventos dan el texto exacto de la app (${iguales} de ${casos.length} casos)`);

  // Nombre vacío (no null): JS lo trata igual («"" || "Admin"»).
  const vacio = await probar(db, [["postgres", `update profiles set full_name = '' where id = '${JHON}'`], [JHON, rpc(G1, "agrego", NUEVA)]],
    `select content c from chat_messages where type = 'system' order by created_at desc, id desc limit 1`);
  check(vacio.ok && vacio.filas?.[0]?.c === APP.agrego("", NOMBRE[NUEVA], ""), `con full_name vacío, el relleno de la app (${vacio.filas?.[0]?.c ?? vacio.error})`);

  // El nombre nuevo del grupo: limpio, y con tope.
  const sucio = "\u00A0 Ven\u202Etas\n\t2\u200B\u2066 \r";
  const limpio = await probar(db, [[JHON, rpc(G1, "renombro", null, sucio)]],
    `select content c from chat_messages where type = 'system' order by created_at desc, id desc limit 1`);
  check(limpio.ok && limpio.filas?.[0]?.c === `Jhon Lopez cambió el nombre del grupo a "Ventas2"`,
    `al nombre del grupo se le sacan saltos de línea, tabuladores, U+202E, ancho cero y aislamientos, y los espacios de las puntas (${JSON.stringify(limpio.filas?.[0]?.c ?? limpio.error)})`);
  const cien = "N".repeat(100);
  const r100 = await probar(db, [[JHON, rpc(G1, "renombro", null, cien)]]);
  check(r100.ok, "un nombre de 100 caracteres entra");
  for (const [txt, que] of [["N".repeat(101), "101 caracteres"], ["", "vacío"], ["   ", "solo espacios"], ["\n\u202E\u200B", "solo caracteres invisibles"]] as const) {
    await falla(db, JHON, rpc(G1, "renombro", null, txt), /chat_evento_texto/, `un nombre de grupo ${que} no entra`);
  }
  await falla(db, JHON, rpc(G1, "renombro", null, null), /chat_evento_texto/, "renombrar sin nombre no entra");
  await falla(db, JHON, rpc(G1, "agrego", NUEVA, "y un texto libre"), /chat_evento_texto/, "un evento que no es renombrar no lleva texto");

  // Cuesta lo mismo que antes: las mismas notificaciones y los mismos pedidos de
  // push (push_chat_message no manda nada por un aviso).
  const base = await nueva("base");
  const costo = async (d: PGlite, pasos: Paso[]) => (await probar(d, [
    ["postgres", `create temp table _antes as select (select count(*) from notifications) n, (select count(*) from net._pedidos) p`], ...pasos],
    `select (select count(*)::int from notifications) - (select n from _antes)::int notif, (select count(*)::int from net._pedidos) - (select p from _antes)::int pedidos`)).filas?.[0];
  const antes = await costo(base, [[JHON, `insert into chat_messages(conversation_id, sender_id, type, content) values ('${G1}', '${JHON}', 'system', 'Jhon Lopez agregó a Nueva Persona al grupo')`]]);
  const ahora = await costo(db, [[JHON, rpc(G1, "agrego", NUEVA)]]);
  check(antes?.notif === 3 && ahora?.notif === antes?.notif && typeof antes?.pedidos === "number" && ahora?.pedidos === antes?.pedidos,
    `un aviso por la RPC cuesta lo mismo que el INSERT de antes (antes ${JSON.stringify(antes)}, ahora ${JSON.stringify(ahora)})`);
  const id = await probar(db, [[JHON, rpc(G1, "salio")]]);
  check(id.ok, "(la RPC corre)");
  const devuelto = await como(db, ANA, rpc(G1, "salio"));
  const fila = await uno(db, `select content c from chat_messages where id = '${devuelto[0]?.id}'`);
  check(fila?.c === "Ana Ruiz salió del grupo", `la RPC devuelve el id del aviso que creó (${devuelto[0]?.id})`);
});

// ════ 3. Quién puede ═════════════════════════════════════════════════════════
await seccion("3 · quién puede", async () => {
  const db = await nueva("1b");
  await falla(db, "anon", rpc(G1, "salio"), /permission denied/, "anon no la puede llamar");
  await falla(db, "service_role", rpc(G1, "salio"), /chat_evento_sin_sesion/, "service_role no tiene a quién poner de autor (inserta directo, si necesita)");
  await falla(db, FABI, rpc(G1, "salio"), /chat_evento_no_autorizado/, "alguien que no participa del grupo no manda avisos");
  await falla(db, FABI, rpc(NO_EXISTE, "salio"), /chat_evento_no_autorizado/, "…y una conversación que no existe da el MISMO error (no se entera de cuál existe)");
  await falla(db, JHON, rpc(DM1, "salio"), /chat_evento_no_es_grupo/, "en un directo no hay avisos");
  await falla(db, JHON, rpc(G1, "hackeo", BETO), /chat_evento_desconocido/, "un evento que no está en la lista");
  await falla(db, JHON, rpc(G1, null), /chat_evento_desconocido/, "sin evento");
  await falla(db, JHON, rpc(G1, "agrego"), /chat_evento_objetivo/, "sumar sin decir a quién");
  await falla(db, JHON, rpc(G1, "agrego", "a0000000-0000-4000-8000-0000000000ff"), /chat_evento_objetivo/, "sumar a alguien que no existe");
  await falla(db, ANA, rpc(G1, "salio", BETO), /chat_evento_objetivo/, "salir no lleva persona objetivo");
  await falla(db, JHON, rpc(G1, "renombro", BETO, "x"), /chat_evento_objetivo/, "renombrar no lleva persona objetivo");
  await falla(db, ANA, rpc(G1, "acepto", FABI), /chat_evento_no_autorizado/, "aceptar una solicitud es de admins (solo ellos ven las solicitudes)");
  await falla(db, DANI, rpc(G3, "acepto", FABI), /chat_evento_no_autorizado/, "…también en un grupo con add_permission = 'all'");
  await anda(db, ANA, rpc(G4, "salio"), "en un grupo de anuncios, un miembro igual avisa que sale");

  // Quien puede mandar el aviso = quien puede hacer la acción. Las dos cosas, en
  // la misma tabla de personas × grupos, cada una en su transacción deshecha.
  const PERSONAS = [JHON, ANA, BETO, CARLA, DANI, FABI];
  const corto = (id: string) => NOMBRE[id]?.split(" ")[0] ?? id.slice(-2);
  type Accion = { evento: Evento; objetivo: Record<string, string>; hacer: (g: string, o: string) => string; efecto: (g: string, o: string) => string; sinSiMismo?: boolean };
  const ACCIONES: Accion[] = [
    { evento: "renombro", objetivo: {}, hacer: (g) => `update chat_conversations set name = 'Nombre nuevo' where id = '${g}'`,
      efecto: (g) => `select exists (select 1 from chat_conversations where id = '${g}' and name = 'Nombre nuevo') si` },
    { evento: "agrego", objetivo: { [G1]: NUEVA, [G3]: NUEVA }, hacer: (g, o) => `insert into chat_participants(conversation_id, user_id, role) values ('${g}', '${o}', 'member')`,
      efecto: (g, o) => `select exists (select 1 from chat_participants where conversation_id = '${g}' and user_id = '${o}') si` },
    { evento: "elimino", objetivo: { [G1]: BETO, [G3]: DANI }, sinSiMismo: true, hacer: (g, o) => `delete from chat_participants where conversation_id = '${g}' and user_id = '${o}'`,
      efecto: (g, o) => `select not exists (select 1 from chat_participants where conversation_id = '${g}' and user_id = '${o}') si` },
    { evento: "nombro_admin", objetivo: { [G1]: ANA, [G3]: BETO }, hacer: (g, o) => `update chat_participants set role = 'admin' where conversation_id = '${g}' and user_id = '${o}'`,
      efecto: (g, o) => `select exists (select 1 from chat_participants where conversation_id = '${g}' and user_id = '${o}' and role = 'admin') si` },
    { evento: "quito_admin", objetivo: { [G1]: JHON, [G3]: CARLA }, hacer: (g, o) => `update chat_participants set role = 'member' where conversation_id = '${g}' and user_id = '${o}'`,
      efecto: (g, o) => `select exists (select 1 from chat_participants where conversation_id = '${g}' and user_id = '${o}' and role = 'member') si` },
  ];
  for (const a of ACCIONES) {
    const tabla: string[] = [];
    let si = 0, no = 0, distintas = 0;
    for (const g of [G1, G3]) {
      const o = a.objetivo[g] ?? "";
      for (const p of PERSONAS) {
        if (a.sinSiMismo && p === o) continue;
        const hace = await probar(db, [[p, a.hacer(g, o)]], a.efecto(g, o));
        const puedeHacer = hace.ok && hace.si === true;
        const avisa = await probar(db, [[p, rpc(g, a.evento, a.objetivo[g] ?? null, a.evento === "renombro" ? "Nombre nuevo" : null)]]);
        if (puedeHacer) si++; else no++;
        if (puedeHacer !== avisa.ok) { distintas++; tabla.push(`${corto(p)}@${g === G1 ? "G1" : "G3"}: hace=${puedeHacer} avisa=${avisa.ok}`); }
        else tabla.push(`${corto(p)}@${g === G1 ? "G1" : "G3"}:${puedeHacer ? "sí" : "no"}`);
      }
    }
    check(distintas === 0 && si > 0 && no > 0,
      `${a.evento}: avisa exactamente quien puede hacerlo (${si} sí, ${no} no; ${tabla.join(" ")})`);
  }
  // Salir: cualquiera que participa.
  for (const [p, g] of [[ANA, G1], [BETO, G3], [DANI, G3], [JHON, G1]] as const) {
    await anda(db, p, rpc(g, "salio") + "; select 1", `salio: ${NOMBRE[p]} avisa que sale`);
  }
});

// ════ 4. Los flujos de la app (como los manda el frontend nuevo) ═════════════
await seccion("4 · los flujos de la app", async () => {
  const db = await nueva("1b", `insert into public.chat_join_requests(conversation_id, user_id, requested_by) values ('${G1}', '${FABI}', '${ANA}');`);
  // Los ids que devuelve la RPC, en el orden en que se mandaron (dos avisos
  // seguidos pueden caer en el mismo instante: el orden no sale de created_at).
  const ids: string[] = [];
  const avisa = async (quien: string, sql: string, m: string) => { const r = await anda(db, quien, sql, m); if (r?.[0]?.id) ids.push(r[0].id); };
  // GroupMembersPanel: sumar.
  await anda(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${G1}', '${NUEVA}', 'member')`, "sumar: la participación");
  await avisa(JHON, rpc(G1, "agrego", NUEVA), "sumar: el aviso");
  // Aprobar una solicitud.
  await anda(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${G1}', '${FABI}', 'member')`, "aprobar: la participación");
  await anda(db, JHON, `delete from chat_join_requests where conversation_id = '${G1}' and user_id = '${FABI}'`, "aprobar: borra la solicitud");
  await avisa(JHON, rpc(G1, "acepto", FABI), "aprobar: el aviso");
  // Hacer y quitar admin.
  await anda(db, JHON, `update chat_participants set role = 'admin' where conversation_id = '${G1}' and user_id = '${ANA}'`, "hacer admin: el rol");
  await avisa(JHON, rpc(G1, "nombro_admin", ANA), "hacer admin: el aviso");
  await anda(db, JHON, `update chat_participants set role = 'member' where conversation_id = '${G1}' and user_id = '${ANA}'`, "quitar admin: el rol");
  await avisa(JHON, rpc(G1, "quito_admin", ANA), "quitar admin: el aviso");
  // Sacar: el aviso va DESPUÉS de borrar la participación (la persona ya no está).
  await anda(db, JHON, `delete from chat_participants where conversation_id = '${G1}' and user_id = '${BETO}'`, "sacar: la participación");
  await avisa(JHON, rpc(G1, "elimino", BETO), "sacar: el aviso (Beto ya no está, y sale igual)");
  // ChatHeader: renombrar.
  await anda(db, JHON, `update chat_conversations set name = 'Equipo 2' where id = '${G1}'`, "renombrar: el nombre");
  await avisa(JHON, rpc(G1, "renombro", null, "Equipo 2"), "renombrar: el aviso");
  // Salir: el aviso va ANTES de borrar la fila propia.
  await avisa(ANA, rpc(G1, "salio"), "salir: el aviso, mientras todavía participa");
  await anda(db, ANA, `delete from chat_participants where conversation_id = '${G1}' and user_id = '${ANA}'`, "salir: borra su participación");
  await falla(db, ANA, rpc(G1, "salio"), /chat_evento_no_autorizado/, "salir: después de irse ya no avisa (por eso la app avisa antes)");
  const filas = await q(db, `select id::text id, content c from chat_messages where conversation_id = '${G1}' and type = 'system' and id = any('{${ids.join(",")}}'::uuid[])`);
  const textos = ids.map((id) => filas.find((f) => f.id === id)?.c);
  const esperados = [
    APP.agrego(NOMBRE[JHON], NOMBRE[NUEVA], ""), APP.acepto(NOMBRE[JHON], NOMBRE[FABI], ""),
    APP.nombro_admin(NOMBRE[JHON], NOMBRE[ANA], ""), APP.quito_admin(NOMBRE[JHON], NOMBRE[ANA], ""),
    APP.elimino(NOMBRE[JHON], NOMBRE[BETO], ""), APP.renombro(NOMBRE[JHON], null, "Equipo 2"), APP.salio(NOMBRE[ANA], null, ""),
  ];
  check(JSON.stringify(textos) === JSON.stringify(esperados), `el grupo queda con los avisos de siempre, en orden: ${textos.map((t) => `«${t}»`).join(" · ")}`);
});

// ════ 5. La vuelta atrás que documenta la migración ══════════════════════════
// (El trigger queda APAGADO: lo mira QUE_QUEDO, más arriba.)
const QUEDAN_TRAS_LA_VUELTA = [
  "SOBRA función public.chat_evento_sistema(_conv uuid, _evento text, _objetivo uuid, _texto text)",
  "SOBRA función public.chat_mensajes_de_sistema()",
  "SOBRA trigger chat_messages.trg_mensajes_de_sistema",
];
await seccion("5 · la vuelta atrás", async () => {
  check(/^begin;/.test(VUELTA.trim()) && /commit;$/.test(VUELTA.trim()), `la vuelta atrás está en la migración, entera y en una transacción (${VUELTA.split("\n").length} líneas)`);
  const pedidosV = pedidosDe(VUELTA);
  const antesV = VUELTA.slice(VUELTA.indexOf("begin;") + "begin;".length, Math.max(0, VUELTA.search(/\block\s+table\b/i)));
  check(pedidosV.length >= 1 && pedidosV.every((p) => p.f <= DEJA_LEER) && !/\b(create|alter|drop|insert|update|delete)\b/i.test(antesV),
    `la vuelta atrás pide su candado primero y sin trabar lecturas (${pedidosV.map((p) => `${p.t}:${FUERZA[p.f]}`).join(", ")})`);
  const db = await nueva("1b");
  await db.exec(VUELTA.trim().replace(/commit;\s*$/, ""));
  const tenidosV = await q(db, CANDADOS_TENIDOS);
  await db.exec("rollback");
  const deMasV = candadosDeMas(tenidosV, pedidosV);
  check(tenidosV.length >= 1 && deMasV.length === 0,
    `con la vuelta atrás entera corrida, ningún candado de más ni uno que trabe lecturas (${tenidosV.map((l) => `${l.t}:${l.m}`).join(", ")}${deMasV.length ? `; de más: ${deMasV.join(", ")}` : ""})`);
  try {
    const r = await ensayarCandados(db, conFallosInyectados(VUELTA, 8));
    const a = leerAvisos(r.avisos);
    const quedo = await uno(db, QUE_QUEDO);
    check(/chat_candados/.test(r.error ?? "") && a.fallos === 8 && a.handler.every((h) => h === "(ninguno)") && a.candados.every((t) => t === "200ms") && seSeparan(a.separaciones),
      `vuelta atrás con el candado ocupado 8 veces: 200 ms por candado, suelta todo, espera 1 s o más y se rinde (${(r.error ?? "SE CORRIÓ").slice(0, 50)})`);
    check(quedo?.trigger_prendido === 1, `…y el trigger sigue prendido (${JSON.stringify(quedo)})`);
  } catch (e) { mal.push(`ensayo de candados de la vuelta atrás: ${msg(e).slice(0, 160)}`); }

  try { await db.exec(VUELTA); ok.push("la vuelta atrás corre sobre la base con la migración"); }
  catch (e) { await db.exec("rollback").catch(() => {}); mal.push(`la vuelta atrás falló: ${msg(e).slice(0, 160)}`); }
  const tras = await uno(db, QUE_QUEDO);
  check(tras?.rpc === 1 && tras?.trigger_existe === 1 && tras?.trigger_prendido === 0, `queda la RPC y el trigger APAGADO (${JSON.stringify(tras)})`);
  await anda(db, ANA, `insert into chat_messages(conversation_id, sender_id, type, content) values ('${G1}', '${ANA}', 'system', 'aviso libre')`,
    "vuelta atrás: el aviso libre vuelve a entrar, como en prod");
  const r = await anda(db, JHON, rpc(G1, "agrego", NUEVA), "vuelta atrás: la RPC sigue andando (el frontend nuevo la usa)");
  const t = await uno(db, `select content c from chat_messages where id = '${r?.[0]?.id}'`);
  check(t?.c === APP.agrego(NOMBRE[JHON], NOMBRE[NUEVA], ""), `…con el mismo texto (${t?.c})`);
  try { await db.exec(VUELTA); ok.push("la vuelta atrás se puede correr dos veces"); }
  catch (e) { await db.exec("rollback").catch(() => {}); mal.push(`la vuelta atrás no se puede correr dos veces: ${msg(e).slice(0, 120)}`); }
  // Arreglar hacia adelante: una migración nueva que lo vuelve a prender.
  await db.exec("alter table public.chat_messages enable trigger trg_mensajes_de_sistema");
  await falla(db, ANA, `insert into chat_messages(conversation_id, sender_id, type, content) values ('${G1}', '${ANA}', 'system', 'otro libre')`,
    /chat_sistema_sin_evento/, "con «enable trigger» se vuelve a cerrar");
});
await seccion("5 · lo que queda", async () => {
  // Lo que queda distinto de la base es EXACTAMENTE lo que dice la cabecera.
  const base = await nueva("base");
  const conVuelta = await nueva("base");
  await aplicar(conVuelta, NOMBRE_1B, MIG_1B);
  await conVuelta.exec(VUELTA);
  const fotoVuelta = await foto(conVuelta);
  const quedan = diferencias(await foto(base), fotoVuelta);
  check(fotoVuelta.get("trigger chat_messages.trg_mensajes_de_sistema")?.endsWith(" D") === true,
    `el trigger que queda está apagado (${fotoVuelta.get("trigger chat_messages.trg_mensajes_de_sistema")?.slice(-60)})`);
  const faltan = QUEDAN_TRAS_LA_VUELTA.filter((x) => !quedan.includes(x)), sobran = quedan.filter((x) => !QUEDAN_TRAS_LA_VUELTA.includes(x));
  check(faltan.length === 0 && sobran.length === 0,
    `después de la vuelta atrás, lo que queda distinto de prod son los ${QUEDAN_TRAS_LA_VUELTA.length} objetos anotados (${quedan.join(" · ")}${sobran.length ? `; sin anotar: ${sobran.join(" · ")}` : ""}${faltan.length ? `; anotados que ya no quedan: ${faltan.join(" · ")}` : ""})`);
  try { await conVuelta.exec("begin;\n" + MIG_1B + "\ncommit;"); mal.push("la migración se volvió a aplicar después de la vuelta atrás (la cabecera dice que hace falta una nueva)"); }
  catch (e) {
    await conVuelta.exec("rollback").catch(() => {});
    check(/already exists/.test(msg(e)), `después de la vuelta atrás, la misma migración no vuelve a correr → ${msg(e).slice(0, 90)}`);
  }
});

console.log(ok.map((m) => "✓ " + m).join("\n"));
if (mal.length) { console.log(mal.map((m) => "✗ " + m).join("\n")); console.log(`\n${ok.length} ok, ${mal.length} MAL`); Deno.exit(1); }
console.log(`\n${ok.length} ok`);
