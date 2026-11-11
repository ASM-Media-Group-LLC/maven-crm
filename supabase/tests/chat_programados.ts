// Mensajes programados del Messenger (migración 20261008170000_chat_programados),
// probados contra un Postgres de verdad (PGlite) cargado con el esquema de PROD
// del 28/09 y las migraciones reales del chat que vinieron después (la misma
// cadena que chat_mensajes_de_sistema.ts).
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/chat_programados.ts
//
//   1. La migración carga sobre la cadena de prod.
//   2. Programar: solo quien está en la conversación, solo admins en un grupo de
//      anuncios, nunca un aviso de sistema, nunca un archivo de afuera, ni una
//      cita de otra conversación, ni una hora pasada. Nadie escribe la tabla a mano.
//   3. Salir: el cron (sin sesión, como pg_cron) los inserta A NOMBRE de quien los
//      programó, en orden, y los avisos de siempre les llegan a los demás.
//   4. Si entre programar y salir la persona dejó el grupo, NO sale: queda fallido
//      con el motivo, le llega un aviso, y los demás programados salen igual.
//   5. Cancelar devuelve los mensajes, solo los propios y solo si no salieron.
//   6. La vuelta atrás (las líneas «--|») deja todo como estaba y se puede volver a aplicar.
//
// Sale con código 1 si algo falla. Corre en el guard de cada PR.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FIXTURE = leer("./fixtures/prod_chat_api_20260928.sql");
const COMPLEMENTO = leer("./fixtures/prod_api_escritura_20261001.sql");
const N = "20261008170000_chat_programados.sql";
const M = leer(`../migrations/${N}`);
const vueltaDe = (sql: string) => sql.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);
const enSql = (xs: string[]) => `(${xs.map((x) => `'${x}'`).join(",")})`;

// ─── La cadena de migraciones (el mismo filtro que chat_mensajes_de_sistema.ts) ──
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
const DEL_MESSENGER = new Set([...LISTA_TABLAS, ...LISTA_FUNCIONES, ...FUNCIONES_A, ...FUNCIONES_1B, "chat_conversaciones_creadas", "chat_programados"]);
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
  "20261111060000_backstage_equipo.sql":
    "Backstage manda el equipo (POST /equipo/sync): el interruptor, la bitácora y las RPC api_equipo_*. Entra a " +
    "esta cadena solo porque cambia rol, nivel, horario y la papelera de profiles/user_roles y lee api_keys, pero " +
    "usa es_admin_o_dueno, roles_config, tenant_owners y cuenta_eventos, que este fixture no trae; no toca nada del " +
    "Messenger. Se prueba en su propio banco, equipo_backstage.ts.",
  "20261111030000_fuera_de_cowork_solo_su_turno.sql":
    "Cowork: el arreglo de «fuera de Cowork» (solo si entró para su turno). Entra a esta cadena solo porque su " +
    "vigía inserta avisos en notifications, pero usa las tablas del reloj de Cowork y es_admin_o_dueno, que este " +
    "fixture no trae; no toca nada del Messenger.",
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
  .map((n) => ({ n, sql: Deno.readTextFileSync(new URL(n, DIR_MIG)) }))
  .filter((m) => objetivos(m.sql).length > 0);

check(CADENA.some((m) => m.n === N), "esta migración entra a la cadena del chat");

// ─── Gente y conversaciones ──────────────────────────────────────────────────
const T1 = "10000000-0000-4000-8000-000000000001";
const JHON = "a0000000-0000-4000-8000-000000000001";
const ANA = "a0000000-0000-4000-8000-000000000002";
const BETO = "a0000000-0000-4000-8000-000000000003";
const FABI = "a0000000-0000-4000-8000-000000000007"; // de la agencia, en ningún grupo
const G1 = "c0000000-0000-4000-8000-000000000001"; // Jhon (admin) + Ana + Beto
const G4 = "c0000000-0000-4000-8000-000000000004"; // de anuncios: Jhon admin + Ana
const DM1 = "c0000000-0000-4000-8000-000000000009"; // Jhon + Ana
const M_G1 = "e0000000-0000-4000-8000-000000000001"; // de Ana en G1
const M_DM = "e0000000-0000-4000-8000-000000000003"; // de Jhon en DM1
const NOMBRES: Record<string, string> = { [JHON]: "Jhon Lopez", [ANA]: "Ana Ruiz", [BETO]: "Beto Paz", [FABI]: "Fabi Sol" };
// Stubs (NO son de prod; en prod existen): el fixture del chat no trae
// puede_ver_modulo ni push_notify_enqueue porque los avisos del chat salen antes
// de llamarlas. El aviso de «no se pudo enviar tu programado» SÍ llega hasta ahí.
// El push queda anotado en _push para poder contarlo.
const STUBS = `
create or replace function public.puede_ver_modulo(uuid, text, text) returns boolean language sql as 'select true';
create table public._push (tipo text, a uuid[]);
create or replace function public.push_notify_enqueue(text, uuid[], jsonb, text, text, text, text, text)
returns void language sql as 'insert into public._push values ($1, $2)';
`;
const SEMILLA = `
insert into public.tenants(id, slug, name) values ('${T1}', 'asm-tech', 'ASM Tech');
insert into auth.users(id, email, raw_user_meta_data) values ${Object.entries(NOMBRES)
  .map(([id, n]) => `('${id}', '${id.slice(-2)}@ejemplo.test', '${JSON.stringify({ full_name: n })}')`).join(", ")};
insert into public.chat_conversations(id, type, name, created_by, created_at, info_permission, add_permission, msg_permission) values
  ('${G1}', 'group', 'Equipo', '${JHON}', '2026-09-01 10:00+00', 'admins', 'admins', 'all'),
  ('${G4}', 'group', 'Anuncios', '${JHON}', '2026-09-03 10:00+00', 'admins', 'admins', 'admins'),
  ('${DM1}', 'direct', null, '${JHON}', '2026-09-05 10:00+00', 'admins', 'admins', 'all');
insert into public.chat_participants(conversation_id, user_id, role) values
  ('${G1}', '${JHON}', 'admin'), ('${G1}', '${ANA}', 'member'), ('${G1}', '${BETO}', 'member'),
  ('${G4}', '${JHON}', 'admin'), ('${G4}', '${ANA}', 'member'),
  ('${DM1}', '${JHON}', 'admin'), ('${DM1}', '${ANA}', 'member');
insert into public.chat_messages(id, conversation_id, sender_id, type, content, created_at) values
  ('${M_G1}', '${G1}', '${ANA}', 'text', 'hola equipo', now() - interval '2 hours'),
  ('${M_DM}', '${DM1}', '${JHON}', 'text', 'hola Ana', now() - interval '1 hour');
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}
const db = new PGlite();
await db.exec(FIXTURE);
await db.exec(COMPLEMENTO);
await db.exec(STUBS);
await db.exec(SEMILLA);
for (const m of CADENA) await aplicar(db, m.n, m.sql);
check(true, "la migración carga sobre la cadena de prod");

const q = async (sql: string) => (await db.query(sql)).rows as Fila[];
type Quien = string | "anon" | "postgres";
async function entrar(quien: Quien) {
  await db.exec("reset role");
  if (quien === "postgres") { await db.query(`select set_config('request.jwt.claims', '', true)`); return; }
  const claims = quien === "anon" ? { role: "anon" } : { sub: quien, role: "authenticated" };
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
  await db.exec(`set local role ${quien === "anon" ? "anon" : "authenticated"}`);
}
async function como(quien: Quien, sql: string): Promise<Fila[]> {
  await db.exec("begin");
  try { await entrar(quien); const rs = await db.exec(sql); await db.exec("commit"); return (rs.at(-1)?.rows ?? []) as Fila[]; }
  catch (e) { await db.exec("rollback"); throw e; }
}
async function falla(quien: Quien, sql: string, patron: RegExp, m: string) {
  try { await como(quien, sql); mal.push(`${m} (NO falló)`); }
  catch (e) { const t = msg(e); check(patron.test(t), `${m} → ${t.slice(0, 100)}`); }
}
const texto = (t: string, extra: Fila = {}) => JSON.stringify([{ type: "text", content: t, ...extra }]);
const programar = (conv: string, cuando: string, mensajes: string) =>
  `select public.chat_programar('${conv}', ${cuando}, $j$${mensajes}$j$::jsonb) as id`;
const MANANA = "now() + interval '1 day'";
const URL_OK = "https://lsagslbkliprespbyhts.supabase.co/storage/v1/object/public/chat-files/a/1-foto.png";

// ════ 2. Programar ════════════════════════════════════════════════════════════
const [{ id: P1 }] = await como(ANA, programar(G1, MANANA, texto("buenos días equipo")));
check(!!P1, "Ana programa un mensaje en su grupo");
{
  const suyos = await como(ANA, `select id, resumen, estado from public.chat_programados`);
  check(suyos.length === 1 && suyos[0].resumen === "buenos días equipo", `Ana ve el suyo, con su resumen (${suyos.length})`);
  const deBeto = await como(BETO, `select id from public.chat_programados`);
  check(deBeto.length === 0, "Beto no ve los de Ana");
}
await falla(ANA, `insert into public.chat_programados (user_id, conversation_id, enviar_en, mensajes) values ('${ANA}', '${G1}', now(), '[{"type":"text","content":"x"}]')`,
  /permission denied/, "nadie escribe la tabla a mano");
await falla(FABI, programar(G1, MANANA, texto("hola")), /ya no estás en esta conversación/, "quien no está en la conversación no programa");
await falla(ANA, programar(G4, MANANA, texto("anuncio")), /solo escriben los administradores/, "en un grupo de anuncios, un miembro no programa");
check((await como(JHON, programar(G4, MANANA, texto("anuncio del admin"))))[0]?.id != null, "el admin del grupo de anuncios sí");
await falla(ANA, programar(G1, MANANA, JSON.stringify([{ type: "system", content: "Ana agregó a Fabi" }])), /tipo inválido/, "nunca un aviso de sistema");
await falla(ANA, programar(G1, MANANA, JSON.stringify([{ type: "image", content: "", file_url: "https://evil.example/x.png" }])), /almacenamiento de Maven/, "nunca un archivo de afuera");
await falla(ANA, programar(G1, MANANA, texto("respuesta", { reply_to_id: M_DM })), /ya no está en esta conversación/, "nunca una cita de otra conversación");
await falla(ANA, programar(G1, "now() - interval '1 hour'", texto("tarde")), /ya pasó/, "una hora pasada, no");
await falla(ANA, programar(G1, "now() + interval '400 days'", texto("lejos")), /un año/, "a más de un año, no");
await falla(ANA, programar(G1, MANANA, texto("   ")), /vacío/, "un texto vacío, no");
await falla("anon", programar(G1, MANANA, texto("hola")), /permission denied/, "anon no programa");
{
  // Una sesión fabricada por una key de la API (claims mvf/mvk): la pared de la API.
  await db.exec("begin");
  let t = "";
  try {
    await db.exec("reset role");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ANA, role: "authenticated", mvf: true, mvk: "k" })]);
    await db.exec("set local role authenticated");
    await db.exec(programar(G1, MANANA, texto("por la API")));
  } catch (e) { t = msg(e); } finally { await db.exec("rollback"); }
  check(/api_programar_no_por_api/.test(t), `con una key de la API no se programa (${t.slice(0, 60)})`);
}
await falla(ANA, `select public.chat_programados_enviar()`, /permission denied/, "la persona no hace de cron");

// ════ 3. Salir ════════════════════════════════════════════════════════════════
// Uno con texto + foto (como la app: la foto con el texto de pie, un archivo después).
const ALBUM = "f0000000-0000-4000-8000-000000000001";
const [{ id: P2 }] = await como(ANA, programar(G1, MANANA, JSON.stringify([
  { type: "image", content: "la foto", file_url: URL_OK, file_name: "foto.png", album_id: ALBUM, reply_to_id: M_G1 },
  { type: "file", content: "informe.pdf", file_url: URL_OK.replace("foto.png", "informe.pdf"), file_name: "informe.pdf" },
])));
await db.exec(`update public.chat_programados set enviar_en = now() - interval '1 minute' where id in ('${P1}', '${P2}')`);
const avisosAntes = (await q(`select count(*)::int n from public.notifications where user_id = '${JHON}' and type in ('chat_message','chat_mention')`))[0].n;
{
  const [r] = await como("postgres", `select public.chat_programados_enviar() as n`);
  check(r.n === 2, `el cron manda los dos vencidos (${r.n})`);
  const salieron = await q(`select sender_id, content, type, reply_to_id, album_id from public.chat_messages
    where conversation_id = '${G1}' and id <> '${M_G1}' order by created_at, id`);
  check(salieron.length === 3 && salieron.every((m) => m.sender_id === ANA), `salen a nombre de Ana (${salieron.length})`);
  const orden = salieron.map((m) => m.content);
  check(orden.indexOf("la foto") < orden.indexOf("informe.pdf"), `en el orden en que se programaron (${orden.join(" | ")})`);
  const foto = salieron.find((m) => m.content === "la foto");
  check(foto?.reply_to_id === M_G1 && foto?.album_id === ALBUM, "con su cita y su álbum");
  const avisosDespues = (await q(`select count(*)::int n from public.notifications where user_id = '${JHON}' and type in ('chat_message','chat_mention')`))[0].n;
  check(avisosDespues - avisosAntes === 3, `a Jhon le llegan los avisos de siempre (${avisosDespues - avisosAntes})`);
  const est = await q(`select estado from public.chat_programados where id in ('${P1}', '${P2}')`);
  check(est.every((e) => e.estado === "enviado"), "y quedan enviados");
  const [otra] = await como("postgres", `select public.chat_programados_enviar() as n`);
  check(otra.n === 0, "una segunda corrida no manda nada de nuevo");
}

// ════ 4. Dejó el grupo entre programar y salir ════════════════════════════════
{
  const [{ id: P3 }] = await como(ANA, programar(G1, MANANA, texto("me fui antes")));
  const [{ id: P4 }] = await como(ANA, programar(DM1, MANANA, texto("este sí sale")));
  await db.exec(`update public.chat_programados set enviar_en = now() - interval '1 minute' where id in ('${P3}', '${P4}');
    delete from public.chat_participants where conversation_id = '${G1}' and user_id = '${ANA}';`);
  const [r] = await como("postgres", `select public.chat_programados_enviar() as n`);
  const [f3] = await q(`select estado, ultimo_error from public.chat_programados where id = '${P3}'`);
  const [f4] = await q(`select estado from public.chat_programados where id = '${P4}'`);
  check(r.n === 1 && f4.estado === "enviado", "el del chat donde sigue sale igual");
  check(f3.estado === "fallido" && /ya no estás/.test(f3.ultimo_error ?? ""), `el del grupo que dejó queda fallido con el motivo (${f3.estado})`);
  const n = (await q(`select count(*)::int n from public.chat_messages where content = 'me fui antes'`))[0].n;
  check(n === 0, "y NO se manda");
  const aviso = await q(`select title from public.notifications where user_id = '${ANA}' and type = 'chat_programado_fallido'`);
  check(aviso.length === 1, "a Ana le llega un aviso de que no salió");
  const push = await q(`select tipo from public._push where tipo = 'chat_programado_fallido'`);
  check(push.length === 1, "y también al teléfono (push)");
}

// ════ 5. Cancelar ═════════════════════════════════════════════════════════════
{
  const [{ id: P5 }] = await como(ANA, programar(DM1, MANANA, texto("lo voy a cancelar")));
  const [ajeno] = await como(JHON, `select public.chat_programado_cancelar('${P5}') as r`);
  check(ajeno.r === null, "el de otra persona no se cancela");
  const [r] = await como(ANA, `select public.chat_programado_cancelar('${P5}') as r`);
  check(r.r?.mensajes?.[0]?.content === "lo voy a cancelar" && r.r?.conversation_id === DM1, "cancelar devuelve los mensajes y su chat");
  const [dos] = await como(ANA, `select public.chat_programado_cancelar('${P5}') as r`);
  check(dos.r === null, "dos veces, la segunda nada");
  const [enviado] = await como(ANA, `select public.chat_programado_cancelar('${P1}') as r`);
  check(enviado.r === null, "uno que ya salió no se cancela");
}

// ════ 6. La vuelta atrás ══════════════════════════════════════════════════════
{
  await aplicar(db, "vuelta atrás", vueltaDe(M));
  const [t] = await q(`select to_regclass('public.chat_programados') as t, to_regprocedure('public.chat_programar(uuid, timestamptz, jsonb)') as f`);
  check(t.t === null && t.f === null, "la vuelta atrás borra la tabla y las funciones");
  await aplicar(db, N + " (otra vez)", M);
  check(true, "y se puede volver a aplicar");
}

for (const m of ok) console.log(`ok   ${m}`);
for (const m of mal) console.log(`MAL  ${m}`);
console.log(`\n${ok.length} ok, ${mal.length} mal`);
if (mal.length) Deno.exit(1);
