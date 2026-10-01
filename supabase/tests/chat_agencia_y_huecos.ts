// La agencia en cada conversación y los huecos de la base del Messenger
// (migración 20260930230000_chat_agencia_y_huecos.sql), probados contra un
// Postgres de verdad (PGlite) cargado con el esquema de PROD del 28/09 (vuelto a
// comparar con prod el 29/09 después de 20260929180000: las huellas no cambiaron).
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/chat_agencia_y_huecos.ts
//
// --node-modules-dir=none: el package.json de la raíz haría que Deno busque PGlite
// en node_modules, donde no está. --no-lock: que no toque el deno.lock.
//
// Cómo está armado:
//   0. El fixture (fixtures/prod_chat_api_20260928.sql) es el volcado de catálogo de
//      prod, sin datos. Trae sus huellas md5 en la cabecera; aquí se recalculan y,
//      si alguna no coincide, el banco falla: el fixture no se toca a mano.
//   1. Sobre el fixture se aplican, en orden y cada una en su transacción, TODAS
//      las migraciones reales posteriores a la última que tenía prod cuando se
//      sacó (FIXTURE_HASTA) que tocan algo del Messenger. Así, si una migración
//      posterior vuelve a crear un trigger o una función de A, el banco prueba lo
//      que va a quedar, no A sola. Las que no tocan el Messenger se saltan (y se
//      listan). Además, la huella de lo que crea A tiene que seguir igual después
//      de la cadena, salvo que el cambio esté anotado en CAMBIAN_LO_DE_A.
//   2. Cada hueco (A–H) se prueba DOS veces con el mismo pedido: sobre prod tal
//      cual (tiene que FUNCIONAR: es la línea base, y si no funciona el test no
//      prueba nada) y con las migraciones (tiene que fallar, o no tener efecto).
//   3. Los flujos de la app, tal como los manda supabase-js (un pedido = una
//      transacción, con el rol y los claims que pone PostgREST), siguen andando.
//   4. La vuelta atrás que documenta la migración (las líneas «--|») se corre tal
//      cual, y la app sigue abriendo directos y creando grupos.
//
// PGlite tiene UNA conexión: las carreras (dos directos a la vez, dos grupos a la
// vez) se razonan con los candados del trigger, no se prueban aquí. Sale con código
// 1 si algo falla. Corre en el guard de cada PR (guard-edge-functions.yml).
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FIXTURE = leer("./fixtures/prod_chat_api_20260928.sql");
// El complementario del 01/10 (api_keys, role_groups, get_karma_profile): lo necesita
// la migración B (20261001200000_api_messenger_escritura), que entra en la cadena.
// Las huellas de este banco son las del fixture del 28/09 y no lo miran; las del
// complementario las revisa api_messenger_escritura.ts.
const COMPLEMENTO = leer("./fixtures/prod_api_escritura_20261001.sql");
const ESQUEMA = FIXTURE + "\n" + COMPLEMENTO;
const NOMBRE_A = "20260930230000_chat_agencia_y_huecos.sql";
const MIG_A = leer(`../migrations/${NOMBRE_A}`);
// La vuelta atrás que documenta la cabecera de la migración (las líneas «--|»).
const VUELTA = MIG_A.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;

// ─── Qué es «del Messenger» ──────────────────────────────────────────────────
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
// Lo que nace en A.
const FUNCIONES_A = ["chat_conversations_agencia", "chat_participants_agencia", "chat_llave_de_par",
  "profiles_nombre_lo_cambia_un_admin", "chat_directo_con", "chat_messages_al_insertar"];
const TRIGGERS_A = ["chat_conversations_agencia", "chat_participants_agencia", "profiles_nombre_lo_cambia_un_admin",
  "chat_messages_al_insertar"];
const TABLAS_A = ["chat_conversaciones_creadas"];
const enSql = (xs: string[]) => `(${xs.map((x) => `'${x}'`).join(",")})`;
const TABLAS = enSql(LISTA_TABLAS);
const FUNCIONES = enSql(LISTA_FUNCIONES);
const DEL_MESSENGER = new Set([...LISTA_TABLAS, ...LISTA_FUNCIONES, ...FUNCIONES_A, ...TABLAS_A]);

const sinComentarios = (s: string) => s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
// Los objetos que una migración crea, cambia, borra o escribe. Es a propósito
// generoso (también mira los cuerpos de funciones): sobra una de más, no una de menos.
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

// ─── Las migraciones reales posteriores al fixture ───────────────────────────
// La última migración que prod tenía aplicada cuando se sacó el fixture (y cuando
// se volvió a comparar, el 29/09 a las 19:40). Todo lo posterior se aplica aquí.
const FIXTURE_HASTA = "20260929180000";
// Una migración posterior que nombra algo del Messenger pero no lo cambia (un
// falso positivo de `objetivos`) y no carga sobre el fixture: se anota aquí, con
// el motivo. Si SÍ cambia el Messenger, lo que hay que hacer es sumar al fixture
// lo que le falta.
const NO_TOCAN_EL_MESSENGER: Record<string, string> = {};
// Si una migración posterior cambia a propósito algo que creó A (el PR 2 suma el
// esqueleto del nombre visible a profiles_nombre_lo_cambia_un_admin), se anota
// aquí «objeto → migración», después de revisar que los huecos sigan cerrados.
// La B: delete_chat_message archiva también las marcas de la API; profiles_nombre…
// rechaza además el nombre visible de una integración; las políticas suman el cerco
// RESTRICTIVE «mvf» (UPDATE/DELETE de participantes, DELETE de mensajes); y las
// columnas nuevas (creada_por_api_key, y las marcas en el archivo). Los huecos A–H
// siguen cerrados: este mismo banco los corre con la B en la cadena.
const B_ESCRITURA = "20261001200000_api_messenger_escritura.sql";
const CAMBIAN_LO_DE_A: Record<string, string> = {
  "función delete_chat_message": B_ESCRITURA,
  "función profiles_nombre_lo_cambia_un_admin": B_ESCRITURA,
  "políticas de chat_messages": B_ESCRITURA,
  "políticas de chat_participants": B_ESCRITURA,
  "columnas de chat_conversations": B_ESCRITURA,
  "columnas de chat_message_deletions": B_ESCRITURA,
};

const DIR_MIG = new URL("../migrations/", import.meta.url);
const posteriores = [...Deno.readDirSync(DIR_MIG)].map((e) => e.name)
  .filter((n) => /^\d{14}_\w+\.sql$/.test(n) && n.slice(0, 14) > FIXTURE_HASTA).sort();
const CADENA: { n: string; sql: string; obj: string[] }[] = [];
const SALTADAS: string[] = [];
for (const n of posteriores) {
  const sql = Deno.readTextFileSync(new URL(n, DIR_MIG));
  const obj = objetivos(sql);
  if (obj.length && !NO_TOCAN_EL_MESSENGER[n]) CADENA.push({ n, sql, obj });
  else SALTADAS.push(n);
}

// ─── Gente, agencias y conversaciones del ensayo ─────────────────────────────
const T1 = "10000000-0000-4000-8000-000000000001"; // asm-tech (la de handle_new_user)
const T2 = "10000000-0000-4000-8000-000000000002"; // otra agencia
const JHON = "a0000000-0000-4000-8000-000000000001";
const ANA = "a0000000-0000-4000-8000-000000000002";
const BETO = "a0000000-0000-4000-8000-000000000003";
const CARLA = "a0000000-0000-4000-8000-000000000004";
const DANI = "a0000000-0000-4000-8000-000000000005";
const OLGA = "a0000000-0000-4000-8000-000000000006"; // de la otra agencia
const DM1 = "c0000000-0000-4000-8000-000000000001"; // Jhon (creó, admin) + Ana
const G1 = "c0000000-0000-4000-8000-000000000002"; // Jhon (creó, admin) + Ana + Beto
const G2 = "c0000000-0000-4000-8000-000000000003"; // Carla (creó, admin) + Dani; add_permission = 'all'
const G3 = "c0000000-0000-4000-8000-000000000004"; // lo creó Beto, que ya salió: Ana (admin) + Carla
const DMV1 = "c0000000-0000-4000-8000-000000000005"; // Beto + Carla, duplicado viejo (mensaje de hace 2 días)
const DMV2 = "c0000000-0000-4000-8000-000000000006"; // Beto + Carla, duplicado viejo (mensaje de ayer)
const DMV3 = "c0000000-0000-4000-8000-000000000007"; // Dani + Ana, duplicado viejo sin mensajes, el más viejo
const DMV4 = "c0000000-0000-4000-8000-000000000008"; // Dani + Ana, duplicado viejo sin mensajes
const M_DM1 = "e0000000-0000-4000-8000-000000000001"; // de Ana en DM1
const M_G1 = "e0000000-0000-4000-8000-000000000002"; // de Ana en G1
const M_G1_CITA = "e0000000-0000-4000-8000-000000000003"; // de Beto en G1, cita a M_G1
const M_G2 = "e0000000-0000-4000-8000-000000000004"; // de Carla en G2
const M_BORRADO = "e0000000-0000-4000-8000-000000000005"; // de Ana en G1, ya borrado y vacío
const M_LEG_RICO = "e0000000-0000-4000-8000-000000000006"; // borrado con el rico puesto (y archivado sin el rico)
const M_LEG_ARCH = "e0000000-0000-4000-8000-000000000007"; // borrado con file_url/file_name y sin archivo
const ACTUALIZADA = "2026-09-20 10:00:00+00"; // updated_at sembrado de TODAS las conversaciones
// Los adjuntos como los manda la app: el bucket chat-files de este proyecto y los GIF de Giphy.
const ARCHIVO_MAVEN = "https://lsagslbkliprespbyhts.supabase.co/storage/v1/object/public/chat-files/a0000000/foto.png";
const GIF_GIPHY = "https://media2.giphy.com/media/v1.Y2lk/giphy.mp4?cid=1&rid=giphy.mp4&ct=g";

const SEMILLA = `
insert into public.tenants(id, slug, name) values ('${T1}', 'asm-tech', 'ASM Tech');
-- El alta real: handle_new_user crea perfil, rol y la membresía de asm-tech.
insert into auth.users(id, email, raw_user_meta_data) values
  ('${JHON}', 'jhon@ejemplo.test', '{"full_name":"Jhon Lopez"}'),
  ('${ANA}', 'ana@ejemplo.test', '{"full_name":"Ana Ruiz"}'),
  ('${BETO}', 'beto@ejemplo.test', '{"full_name":"Beto Paz"}'),
  ('${CARLA}', 'carla@ejemplo.test', '{"full_name":"Carla Gil"}'),
  ('${DANI}', 'dani@ejemplo.test', '{"full_name":"Dani Mora"}');
insert into public.chat_conversations(id, type, name, created_by, created_at, updated_at, add_permission) values
  ('${DM1}', 'direct', null, '${JHON}', '2026-09-01 10:00+00', '${ACTUALIZADA}', 'admins'),
  ('${G1}', 'group', 'Equipo', '${JHON}', '2026-09-02 10:00+00', '${ACTUALIZADA}', 'admins'),
  ('${G2}', 'group', 'Abierto', '${CARLA}', '2026-09-03 10:00+00', '${ACTUALIZADA}', 'all'),
  ('${G3}', 'group', 'Sin su creador', '${BETO}', '2026-09-04 10:00+00', '${ACTUALIZADA}', 'admins'),
  ('${DMV1}', 'direct', null, '${BETO}', '2026-09-05 10:00+00', '${ACTUALIZADA}', 'admins'),
  ('${DMV2}', 'direct', null, '${CARLA}', '2026-09-06 10:00+00', '${ACTUALIZADA}', 'admins'),
  ('${DMV3}', 'direct', null, '${DANI}', '2026-09-07 10:00+00', '${ACTUALIZADA}', 'admins'),
  ('${DMV4}', 'direct', null, '${ANA}', '2026-09-08 10:00+00', '${ACTUALIZADA}', 'admins');
insert into public.chat_participants(conversation_id, user_id, role) values
  ('${DM1}', '${JHON}', 'admin'), ('${DM1}', '${ANA}', 'member'),
  ('${G1}', '${JHON}', 'admin'), ('${G1}', '${ANA}', 'member'), ('${G1}', '${BETO}', 'member'),
  ('${G2}', '${CARLA}', 'admin'), ('${G2}', '${DANI}', 'member'),
  ('${G3}', '${ANA}', 'admin'), ('${G3}', '${CARLA}', 'member'),
  ('${DMV1}', '${BETO}', 'admin'), ('${DMV1}', '${CARLA}', 'member'),
  ('${DMV2}', '${CARLA}', 'admin'), ('${DMV2}', '${BETO}', 'member'),
  ('${DMV3}', '${DANI}', 'admin'), ('${DMV3}', '${ANA}', 'member'),
  ('${DMV4}', '${ANA}', 'admin'), ('${DMV4}', '${DANI}', 'member');
insert into public.chat_messages(id, conversation_id, sender_id, content, created_at, reply_to_id, is_deleted) values
  ('${M_DM1}', '${DM1}', '${ANA}', 'hola Jhon', now() - interval '3 hours', null, false),
  ('${M_G1}', '${G1}', '${ANA}', 'hola equipo', now() - interval '2 hours', null, false),
  ('${M_G1_CITA}', '${G1}', '${BETO}', 'respondo', now() - interval '1 hour', '${M_G1}', false),
  ('${M_G2}', '${G2}', '${CARLA}', 'hola abierto', now() - interval '1 hour', null, false),
  ('${M_BORRADO}', '${G1}', '${ANA}', null, now() - interval '30 minutes', null, true),
  (gen_random_uuid(), '${DMV1}', '${BETO}', 'viejo 1', now() - interval '2 days', null, false),
  (gen_random_uuid(), '${DMV2}', '${CARLA}', 'viejo 2', now() - interval '1 day', null, false);
-- Los borrados de antes (prod 29/09: 46 con el rico puesto, 8 con archivo y sin fila en el
-- archivo). La migración A no los toca: se limpian aparte, si Jhon decide (ver el PR).
insert into public.chat_messages(id, conversation_id, sender_id, content, content_rich, file_url, file_name, type, is_deleted) values
  ('${M_LEG_RICO}', '${G1}', '${BETO}', null, '{"type":"doc","content":[]}', null, null, 'text', true),
  ('${M_LEG_ARCH}', '${G1}', '${BETO}', null, null, 'https://archivos.ejemplo.test/a.pdf', 'a.pdf', 'file', true);
insert into public.chat_message_deletions(message_id, conversation_id, sender_id, deleted_by, content, type)
  values ('${M_LEG_RICO}', '${G1}', '${BETO}', '${BETO}', 'lo que decía', 'text');
update public.chat_conversations set updated_at = '${ACTUALIZADA}';
`;

const msg = (e: unknown) => String((e as Error)?.message ?? e);
async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) {
    await db.exec("rollback").catch(() => {});
    throw new Error(`la migración ${nombre} no carga sobre el fixture (si cambia el Messenger, al fixture le falta algo; si no, va a NO_TOCAN_EL_MESSENGER con el motivo): ${msg(e)}`);
  }
}
async function aplicarCadena(db: PGlite) {
  for (const m of CADENA) await aplicar(db, m.n, m.sql);
}

type Modo = "prod" | "A";
async function nueva(modo: Modo, extra = ""): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(ESQUEMA);
  await db.exec(SEMILLA + extra);
  if (modo === "A") await aplicarCadena(db);
  return db;
}
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as Fila[];
const uno = async (db: PGlite, sql: string) => (await q(db, sql))[0];

// Un pedido como lo manda PostgREST: una transacción, el rol y los claims del JWT.
// "postgres" es el superusuario del banco (sin rol ni claims): para preparar el
// terreno dentro de la misma transacción.
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
// Como `falla`, y además el SQLSTATE: es lo que la API del PR 2 traduce a HTTP
// (la app compara el prefijo del mensaje). Devuelve el detail, si lo hay.
// deno-lint-ignore no-explicit-any
const codigoDe = (e: unknown) => String((e as any)?.code ?? "");
// deno-lint-ignore no-explicit-any
const detalleDe = (e: unknown): string => String((e as any)?.detail ?? "");
async function fallaCon(db: PGlite, quien: Quien, sql: string, patron: RegExp, codigo: string, m: string): Promise<string | null> {
  try { await como(db, quien, sql); mal.push(`${m} (NO falló)`); return null; }
  catch (e) {
    const t = msg(e);
    check(patron.test(t) && codigoDe(e) === codigo, `${m} → ${codigoDe(e)} ${t.slice(0, 100)}`);
    return detalleDe(e);
  }
}
// Uno o varios pedidos (cada uno con su persona) y, en la MISMA transacción, la
// pregunta de si tuvo efecto (como superusuario, sin RLS); después se deshace
// todo. `si` = el ataque funcionó.
type Paso = [Quien, string];
async function probar(db: PGlite, pasos: Paso[], efecto: string): Promise<{ ok: boolean; si?: boolean; error?: string; codigo?: string }> {
  await db.exec("begin");
  try {
    for (const [quien, sql] of pasos) { await entrar(db, quien); await db.exec(sql); }
    await db.exec("reset role");
    const r = await q(db, efecto);
    await db.exec("rollback");
    return { ok: true, si: r[0]?.si === true };
  } catch (e) {
    await db.exec("rollback");
    return { ok: false, error: msg(e), codigo: codigoDe(e) };
  }
}
// Un hueco: sobre prod tiene que funcionar; con las migraciones, fallar con
// `cierre` (y, si se pide, con ese SQLSTATE) o, si es "sin_efecto", pasar sin
// cambiar nada (la RLS lo filtra, o la base pone el valor que corresponde).
async function huecoEnPasos(prod: PGlite, conA: PGlite, nombre: string, pasos: Paso[], efecto: string, cierre: RegExp | "sin_efecto", codigo?: string) {
  const antes = await probar(prod, pasos, efecto);
  check(antes.ok && antes.si === true,
    `${nombre}: ABIERTO en prod (línea base)${antes.ok ? (antes.si ? "" : " — corrió pero sin efecto: el test no prueba nada") : ` — falló: ${antes.error?.slice(0, 90)}`}`);
  const despues = await probar(conA, pasos, efecto);
  if (cierre === "sin_efecto") {
    check(despues.ok ? despues.si === false : false,
      `${nombre}: cerrado con la migración${despues.ok ? " (no tiene efecto)" : ` — falló con error inesperado: ${despues.error?.slice(0, 90)}`}`);
  } else {
    check(!despues.ok && cierre.test(despues.error ?? "") && (!codigo || despues.codigo === codigo),
      `${nombre}: cerrado con la migración → ${despues.ok ? "PASÓ" + (despues.si ? " y tuvo efecto" : " sin error") : `${codigo ? despues.codigo + " " : ""}${despues.error?.slice(0, 100)}`}`);
  }
}
const hueco = (prod: PGlite, conA: PGlite, nombre: string, quien: Quien, sql: string, efecto: string, cierre: RegExp | "sin_efecto", codigo?: string) =>
  huecoEnPasos(prod, conA, nombre, [[quien, sql]], efecto, cierre, codigo);

// La huella de lo que crea A: funciones, triggers y las políticas que toca.
async function huellaDeA(db: PGlite): Promise<Record<string, string>> {
  const fs = await q(db, `select 'función ' || p.proname k, md5(p.prosrc || '|' || p.prosecdef::text || '|' || coalesce(p.proconfig::text, '') || '|' || coalesce(p.proacl::text, '')) h
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ${enSql([...FUNCIONES_A, "guard_chat_message_update", "delete_chat_message", "get_unread_counts"])}
    union all
    select 'trigger ' || t.tgname, md5(pg_get_triggerdef(t.oid) || '|' || t.tgenabled::text)
      from pg_trigger t where not t.tgisinternal and t.tgname in ${enSql([...TRIGGERS_A, "trg_guard_chat_message_update"])}
    union all
    select 'políticas de ' || tablename, md5(string_agg(policyname || '|' || cmd || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), E'\\n' order by policyname))
      from pg_policies where schemaname = 'public' and tablename in ('chat_messages', 'chat_participants') group by tablename
    union all
    select 'columnas de ' || c.relname, md5(string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' nn' else '' end, ',' order by a.attnum))
      from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in ('chat_conversaciones_creadas', 'chat_conversations', 'chat_message_deletions') and a.attnum > 0 and not a.attisdropped
     group by c.relname`);
  return Object.fromEntries(fs.map((f) => [f.k as string, f.h as string]));
}
function diferenciasDeHuella(a: Record<string, string>, b: Record<string, string>): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).sort();
}

// ─── Los candados ────────────────────────────────────────────────────────────
const FUERZA = ["accessshare", "rowshare", "rowexclusive", "shareupdateexclusive", "share", "sharerowexclusive", "exclusive", "accessexclusive"];
const fuerza = (m: string) => FUERZA.indexOf(m.toLowerCase().replace(/lock$/, "").replace(/\s+/g, ""));
// profiles y tenants se leen en casi todo pedido de la app (profiles: 847.079
// seq_scan y 2.083.929 idx_scan en prod el 30/09). Ni la migración ni la vuelta
// atrás los toman más fuerte que SHARE ROW EXCLUSIVE, que deja leer.
const SE_LEEN_SIEMPRE = ["profiles", "tenants"];
const DEJA_LEER = fuerza("share row exclusive");
const pedidosDe = (sql: string) =>
  [...sql.matchAll(/\block\s+table\s+public\.(\w+)\s+in\s+([a-z ]+?)\s+mode/gi)].map((m) => ({ t: m[1], f: fuerza(m[2]) }));
const CANDADOS_TENIDOS = `select c.relname t, l.mode m from pg_locks l join pg_class c on c.oid = l.relation join pg_namespace n on n.oid = c.relnamespace
    where l.locktype = 'relation' and n.nspname = 'public' and c.relkind = 'r' and c.relname in ${TABLAS}`;
// Los candados tenidos que no se pidieron al principio (o más fuertes que lo
// pedido), y los que traban las lecturas de profiles o tenants.
function candadosDeMas(tenidos: Fila[], pedidos: { t: string; f: number }[]): string[] {
  return tenidos.filter((l) => {
    const p = pedidos.find((x) => x.t === l.t);
    return !p || fuerza(l.m) > p.f || (SE_LEEN_SIEMPRE.includes(l.t) && fuerza(l.m) > DEJA_LEER);
  }).map((l) => `${l.t}:${l.m}`);
}

// ════ 0. El fixture es prod, y la cadena de migraciones ══════════════════════
// Las mismas consultas se corrieron en prod (solo lectura) el 28/09 y su
// resultado está en la cabecera del fixture como «catalogo.<tema>=<md5>».
// Los 7 triggers de prod que el fixture no trae a propósito (ver su cabecera).
const TRIGGERS_FUERA = `('api_webhooks_por_baja','profiles_baja_revoca_correo','profiles_phone_send_verification_trigger','api_webhooks_por_agencias','trg_user_roles_audit','trg_user_roles_check_role_group','trg_user_roles_sync_groups')`;
const HUELLAS_DE_CATALOGO: Record<string, string> = {
  firma: `select md5(string_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'||pg_get_function_result(p.oid)||'|'||p.prosecdef::text||'|'||p.provolatile::text||'|'||coalesce(p.proconfig::text,'')||'|'||coalesce(p.proacl::text,''), E'\\n' order by p.proname)) h
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ${FUNCIONES}`,
  triggers: `select md5(string_agg(c.relname||':'||pg_get_triggerdef(t.oid)||':'||t.tgenabled::text, E'\\n' order by c.relname, t.tgname)) h
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and ((n.nspname='public' and c.relname in ${TABLAS}) or (n.nspname='auth' and c.relname='users')) and t.tgname not in ${TRIGGERS_FUERA}`,
  realtime: `select md5(string_agg(tablename::text, ',' order by tablename)) h from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ${TABLAS}`,
  replica: `select md5(string_agg(c.relname||':'||c.relreplident::text, ',' order by c.relname)) h from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in ${TABLAS}`,
  rls: `select md5(string_agg(c.relname||':'||c.relrowsecurity::text||':'||c.relforcerowsecurity::text, ',' order by c.relname)) h from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in ${TABLAS}`,
};
const POLITICAS_SQL = `select tablename k, md5(string_agg(policyname||'|'||permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''), E'\n' order by policyname)) h from pg_policies where schemaname='public' group by 1`;
const PRODSRC_SQL = `select n.nspname||'.'||p.proname k, md5(p.prosrc) h from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth')`;
const funcionesProd = new Map<string, string>();
const politicasProd = new Map<string, string>();
{
  const db = new PGlite();
  await db.exec(ESQUEMA);
  const cab = FIXTURE.split("\n").filter((l) => l.startsWith("--"));
  const estructura = new Map<string, string[]>();
  const catalogo = new Map<string, string>();
  for (const l of cab) {
    let m = l.match(/^--\s+((?:auth|public)\.\w+)=([0-9a-f]{32})$/);
    if (m) { funcionesProd.set(m[1], m[2]); continue; }
    m = l.match(/^--\s+catalogo\.(\w+)=([0-9a-f]{32})\s/);
    if (m) { catalogo.set(m[1], m[2]); continue; }
    m = l.match(/^--\s+(\w+) ([0-9a-f]{32}) ([0-9a-f]{32}) ([0-9a-f]{32})$/);
    if (m) { estructura.set(m[1], [m[2], m[3], m[4]]); continue; }
    for (const p of l.matchAll(/(\w+)=([0-9a-f]{32})/g)) if (!l.includes(".")) politicasProd.set(p[1], p[2]);
  }
  check(funcionesProd.size === 27 && politicasProd.size === 19 && estructura.size === 20,
    `huellas de prod en la cabecera del fixture: ${funcionesProd.size} funciones, ${politicasProd.size} tablas con políticas, ${estructura.size} tablas`);
  const fs = await q(db, PRODSRC_SQL);
  const distintas = [...funcionesProd].filter(([k, h]) => fs.find((f) => f.k === k)?.h !== h).map(([k]) => k);
  check(distintas.length === 0, `las ${funcionesProd.size} funciones son las de prod byte a byte${distintas.length ? ` — distintas: ${distintas.join(", ")}` : ""}`);
  const ps = await q(db, POLITICAS_SQL);
  const polDistintas = [...politicasProd].filter(([k, h]) => ps.find((f) => f.k === k)?.h !== h).map(([k]) => k);
  check(polDistintas.length === 0, `las políticas de ${politicasProd.size} tablas son las de prod${polDistintas.length ? ` — distintas: ${polDistintas.join(", ")}` : ""}`);
  const es = await q(db, `with t as (select c.oid, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r')
    select t.relname k,
      md5((select string_agg(a.attname||' '||format_type(a.atttypid,a.atttypmod)||coalesce(' default '||pg_get_expr(d.adbin,d.adrelid),'')||case when a.attnotnull then ' nn' else '' end, ',' order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=t.oid and a.attnum>0 and not a.attisdropped)) c,
      md5(coalesce((select string_agg(k.conname||' '||pg_get_constraintdef(k.oid), ',' order by k.conname) from pg_constraint k where k.conrelid=t.oid),'')) r,
      md5(coalesce((select string_agg(pg_get_indexdef(i.indexrelid), ',' order by pg_get_indexdef(i.indexrelid)) from pg_index i where i.indrelid=t.oid),'')) i
    from t`);
  const estDistintas = [...estructura].filter(([k, [c, r, i]]) => { const f = es.find((x) => x.k === k); return !f || f.c !== c || f.r !== r || f.i !== i; }).map(([k]) => k);
  check(estDistintas.length === 0, `columnas, constraints e índices de ${estructura.size} tablas son los de prod${estDistintas.length ? ` — distintas: ${estDistintas.join(", ")}` : ""}`);
  check(catalogo.size === Object.keys(HUELLAS_DE_CATALOGO).length, `huellas de catálogo en la cabecera: ${catalogo.size}`);
  for (const [tema, sql] of Object.entries(HUELLAS_DE_CATALOGO)) {
    const h = (await uno(db, sql))?.h;
    check(h === catalogo.get(tema), `catálogo · ${tema}: igual que prod${h === catalogo.get(tema) ? "" : ` (prod ${catalogo.get(tema)}, fixture ${h})`}`);
  }

  // Lo que la migración reemplaza, y nada más.
  await db.exec(SEMILLA);
  await db.exec("begin;\n" + MIG_A + "\ncommit;");
  ok.push("la migración A corre entera en una transacción sobre el esquema de prod");
  const fs2 = await q(db, PRODSRC_SQL);
  const cambiadas = [...funcionesProd].filter(([k, h]) => fs2.find((f) => f.k === k)?.h !== h).map(([k]) => k).sort();
  check(JSON.stringify(cambiadas) === JSON.stringify(["public.delete_chat_message", "public.get_unread_counts", "public.guard_chat_message_update"]),
    `de las funciones de prod solo cambian delete_chat_message, get_unread_counts y guard_chat_message_update (${cambiadas.join(", ")})`);
  // Las funciones de los triggers no se llaman desde afuera.
  const ejecutables = await q(db, `select p.proname f, has_function_privilege('authenticated', p.oid, 'execute') a, has_function_privilege('anon', p.oid, 'execute') n
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ${enSql(TRIGGERS_A)}`);
  check(ejecutables.length === TRIGGERS_A.length && ejecutables.every((f) => !f.a && !f.n),
    `las ${ejecutables.length} funciones de trigger de A no las ejecutan anon ni authenticated (${JSON.stringify(ejecutables.filter((f) => f.a || f.n).map((f) => f.f))})`);
  // La tabla de altas no la ve ni la escucha nadie.
  const altas = await uno(db, `select c.relrowsecurity rls,
      (select count(*)::int from pg_policies where tablename = 'chat_conversaciones_creadas') politicas,
      (select count(*)::int from pg_publication_tables where tablename = 'chat_conversaciones_creadas') realtime,
      has_table_privilege('authenticated', c.oid, 'select') sel, has_table_privilege('authenticated', c.oid, 'delete') del
      from pg_class c where c.relname = 'chat_conversaciones_creadas'`);
  check(altas?.rls === true && altas?.politicas === 0 && altas?.realtime === 0 && altas?.sel === false && altas?.del === false,
    `chat_conversaciones_creadas: con RLS, sin políticas, fuera de Realtime y sin permisos para authenticated (${JSON.stringify(altas)})`);

  // Forma de la migración.
  const primera = (s: string) => s.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("--"));
  check(primera(MIG_A) === "set lock_timeout = '3s';", "la migración arranca con set lock_timeout = '3s'");
  const sc = sinComentarios(MIG_A);
  const borradas = sc.match(/drop\s+policy[^;]*;/gi) ?? [];
  const alteradas = sc.match(/alter\s+policy\s+"[^"]+"\s+on\s+public\.\w+/gi) ?? [];
  check(!/create\s+policy/i.test(sc) && borradas.length === 1 && /"Users can delete their own messages"/.test(borradas[0])
      && alteradas.length === 1 && /"Admins can remove participants" on public\.chat_participants/.test(alteradas[0]),
    `A no crea políticas, borra solo la del DELETE duro de mensajes y cambia (ALTER, no DROP+CREATE) solo la del DELETE de participantes (${borradas.length} borrada/s, ${alteradas.length} cambiada/s)`);

  // Los candados: todos al principio, en el orden del INSERT de un mensaje, y
  // después ninguna sentencia pide uno más fuerte del que ya se tiene. Cómo se
  // portan cuando un candado está ocupado, en la sección 0b.
  const pedidos = pedidosDe(sc);
  const tras = sc.slice(sc.indexOf("set lock_timeout = '3s';") + 1, sc.search(/\block\s+table\b/i));
  check(pedidos.length >= 5 && !/\b(create|alter|drop|insert|update|delete)\b/i.test(tras),
    `los ${pedidos.length} candados se piden antes de cualquier otra sentencia`);
  const orden = ["chat_messages", "chat_conversations", "chat_participants", "profiles"].map((t) => pedidos.findIndex((p) => p.t === t));
  check(orden.every((i, k) => i >= 0 && (k === 0 || i > orden[k - 1])) && orden[0] === 0,
    `en el orden en que los toma un INSERT de mensaje: chat_messages → chat_conversations → chat_participants → profiles (${pedidos.map((p) => p.t).join(" → ")})`);
  check(/set_config\('lock_timeout',\s*'200ms',\s*true\)/.test(sc) && /exception\s+when\s+lock_not_available\s+or\s+deadlock_detected/i.test(sc),
    "cada candado espera como mucho 200 ms, y si no llega se sueltan todos y se reintenta");
  const leidas = pedidos.filter((p) => SE_LEEN_SIEMPRE.includes(p.t));
  check(leidas.length === 2 && leidas.every((p) => p.f <= DEJA_LEER),
    `profiles y tenants se piden sin trabar sus lecturas, como mucho SHARE ROW EXCLUSIVE (${leidas.map((p) => `${p.t}:${FUERZA[p.f]}`).join(", ")})`);
  const dbL = new PGlite();
  await dbL.exec(ESQUEMA);
  await dbL.exec(SEMILLA);
  await dbL.exec("begin;\n" + MIG_A);
  const tenidos = await q(dbL, CANDADOS_TENIDOS);
  await dbL.exec("rollback");
  const deMas = candadosDeMas(tenidos, pedidos);
  check(tenidos.length >= pedidos.length && deMas.length === 0,
    `con la migración entera corrida, ninguna tabla del chat tiene un candado que no se haya pedido al principio, ni uno que trabe las lecturas de profiles o tenants (${tenidos.length} candados${deMas.length ? `; de más: ${deMas.join(", ")}` : ""})`);

  // Lo mismo para la vuelta atrás, corrida sobre la migración ya aplicada: un
  // DROP TRIGGER sobre profiles, por ejemplo, pide ACCESS EXCLUSIVE en medio de la
  // vuelta atrás, fuera del reintento y con el chat entero tomado.
  const pedidosV = pedidosDe(VUELTA);
  const antesV = VUELTA.slice(VUELTA.indexOf("begin;") + "begin;".length, Math.max(0, VUELTA.search(/\block\s+table\b/i)));
  check(pedidosV.length >= 4 && !/\b(create|alter|drop|insert|update|delete)\b/i.test(antesV),
    `la vuelta atrás también pide sus ${pedidosV.length} candados antes de cualquier otra sentencia`);
  const leidasV = pedidosV.filter((p) => SE_LEEN_SIEMPRE.includes(p.t));
  check(leidasV.length >= 1 && leidasV.every((p) => p.f <= DEJA_LEER),
    `la vuelta atrás tampoco traba las lecturas de profiles ni de tenants (${leidasV.map((p) => `${p.t}:${FUERZA[p.f]}`).join(", ")})`);
  await dbL.exec("begin;\n" + MIG_A + "\ncommit;");
  await dbL.exec(VUELTA.trim().replace(/commit;\s*$/, ""));
  const tenidosV = await q(dbL, CANDADOS_TENIDOS);
  await dbL.exec("rollback");
  const deMasV = candadosDeMas(tenidosV, pedidosV);
  check(tenidosV.length >= pedidosV.length && deMasV.length === 0,
    `con la vuelta atrás entera corrida, ninguna tabla tiene un candado que no se haya pedido al principio, ni uno que trabe las lecturas de profiles o tenants (${tenidosV.length} candados${deMasV.length ? `; de más: ${deMasV.join(", ")}` : ""})`);

  // La cadena: las migraciones reales posteriores al fixture que tocan el Messenger.
  check(CADENA.length >= 1 && CADENA[0].n === NOMBRE_A,
    `las migraciones posteriores a ${FIXTURE_HASTA} que tocan el Messenger se aplican en orden: ${CADENA.map((m) => `${m.n} (${m.obj.length} objetos)`).join(", ")}; se saltan ${SALTADAS.length}${SALTADAS.length ? ` (${SALTADAS.join(", ")})` : ""}`);
  check(objetivos(MIG_A).includes("chat_participants") && objetivos("alter table public.cowork_rooms add column x int;").length === 0
      && objetivos("drop trigger chat_participants_agencia on public.chat_participants;").includes("chat_participants")
      && objetivos("create or replace function public.delete_chat_message() returns void language sql as $$ select 1 $$;").includes("delete_chat_message"),
    "el filtro de la cadena reconoce lo que toca el Messenger y deja afuera lo que no");
}

// La huella de A tiene que quedar igual después de la cadena, salvo lo anotado.
{
  const soloA = new PGlite();
  await soloA.exec(ESQUEMA);
  await soloA.exec(SEMILLA);
  await aplicar(soloA, NOMBRE_A, MIG_A);
  const conCadena = await nueva("A");
  const hA = await huellaDeA(soloA), hC = await huellaDeA(conCadena);
  const cambios = diferenciasDeHuella(hA, hC).filter((k) => !CAMBIAN_LO_DE_A[k]);
  check(Object.keys(hA).length >= 12 && cambios.length === 0,
    `lo que crea A (${Object.keys(hA).length} objetos) sigue igual después de la cadena${cambios.length ? ` — cambió: ${cambios.join(", ")}` : ""}`);
  // Línea base que puede fallar: una migración posterior que saca un trigger de A se nota.
  await soloA.exec("drop trigger if exists chat_participants_agencia on public.chat_participants");
  const rotos = diferenciasDeHuella(hA, await huellaDeA(soloA));
  check(rotos.includes("trigger chat_participants_agencia"), `si una migración posterior saca un trigger de A, la huella lo marca (${rotos.join(", ")})`);
}

// ════ 0b. Los candados, con un candado ocupado ═══════════════════════════════
// Lo que protege a prod al aplicar es el bloque de candados del principio. Con
// una sola conexión (PGlite) nadie retiene un candado, así que se ensaya el
// bloque TAL COMO ESTÁ en la migración (y en la vuelta atrás) con el fallo
// inyectado justo donde lo daría un candado ocupado (lock_not_available antes del
// `exit`), y un aviso delante de cada `lock table`. Tiene que pasar que:
//   · cada candado se pide con lock_timeout = 200ms, no con los 3 s de la sesión
//     (con 3 s, una tabla del chat queda trabada hasta 18 s por intento);
//   · al fallar, el intento suelta TODO (es una subtransacción): mientras duerme
//     no tiene ningún candado;
//   · entre intento e intento pasa 1 s o más (si no, quedan pegados y el chat
//     queda trabado casi todo el tiempo);
//   · al 8.º fallo se rinde con chat_candados y no deja nada aplicado;
//   · cuando lo logra, el resto corre con lock_timeout = 3s, y al terminar la
//     sesión queda como estaba.
const MIS_CANDADOS = `(select coalesce(string_agg(c.relname || ':' || replace(l.mode, 'Lock', ''), ',' order by c.relname), '(ninguno)')
    from pg_locks l join pg_class c on c.oid = l.relation join pg_namespace n on n.oid = c.relnamespace
   where l.locktype = 'relation' and n.nspname = 'public' and c.relkind = 'r' and c.relname in ${TABLAS})`;
function conFallosInyectados(sql: string, fallos: number): string {
  // El primer `lock table` que no está comentado (la cabecera trae la vuelta atrás).
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
// Lee los avisos: los lock_timeout con que se pidió cada candado, lo que se tenía
// en el handler, cuánto pasó entre intentos y el lock_timeout de después.
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
    (select count(*)::int from pg_attribute where attrelid = 'public.chat_conversations'::regclass and attname = 'tenant_id') tenant_id,
    (select count(*)::int from pg_class where relname = 'chat_conversaciones_creadas') altas,
    (select count(*)::int from pg_trigger where tgname in ${enSql(TRIGGERS_A)} and tgenabled <> 'D') triggers,
    current_setting('lock_timeout') lock_timeout`;
{
  const base = async () => { const d = new PGlite(); await d.exec(ESQUEMA); await d.exec(SEMILLA); return d; };
  const nCandados = pedidosDe(sinComentarios(MIG_A)).length;
  // La migración: dos candados ocupados y al tercer intento entra.
  try {
    const db = await base();
    const r = await ensayarCandados(db, "begin;\n" + conFallosInyectados(MIG_A, 2) + "\ncommit;");
    const a = leerAvisos(r.avisos);
    const quedo = await uno(db, QUE_QUEDO);
    check(r.error === null && quedo?.tenant_id === 1 && quedo?.triggers === TRIGGERS_A.length,
      `migración con 2 candados ocupados: se aplica al tercer intento${r.error ? ` — falló: ${r.error.slice(0, 100)}` : ""}`);
    check(a.candados.length === 3 * nCandados && a.candados.every((t) => t === "200ms"),
      `…cada uno de los ${a.candados.length} pedidos de candado espera con lock_timeout = 200ms (${[...new Set(a.candados)].join(", ")})`);
    check(a.handler.length === 2 && a.handler.every((h) => h === "(ninguno)"),
      `…el intento que falla suelta todos los candados antes de dormir (${a.handler.join(" / ")})`);
    check(a.separaciones.length === 1 && seSeparan(a.separaciones),
      `…entre intentos pasa 1 s o más (${a.separaciones.map((x) => x.toFixed(2)).join(", ")} s)`);
    check(a.tras.length === 1 && a.tras[0] === "3s", `…con todo tomado, el resto corre con lock_timeout = 3s (${a.tras.join(", ")})`);
    check(quedo?.lock_timeout === "0", `…y al terminar, el lock_timeout de la sesión queda como estaba (${quedo?.lock_timeout})`);
  } catch (e) { mal.push(`ensayo de candados de la migración: ${msg(e).slice(0, 160)}`); }
  // La migración: ocho candados ocupados y se rinde.
  try {
    const db = await base();
    const r = await ensayarCandados(db, "begin;\n" + conFallosInyectados(MIG_A, 8) + "\ncommit;");
    const a = leerAvisos(r.avisos);
    const quedo = await uno(db, QUE_QUEDO);
    check(/chat_candados/.test(r.error ?? "") && a.fallos === 8,
      `migración con el candado ocupado 8 veces: se rinde con chat_candados → ${(r.error ?? "SE APLICÓ").slice(0, 90)}`);
    check(a.handler.length === 8 && a.handler.every((h) => h === "(ninguno)") && a.separaciones.length === 7 && seSeparan(a.separaciones),
      `…cada intento suelta todo, y entre uno y otro pasa 1 s o más (${a.handler.length} fallos sin ningún candado tomado; ${a.separaciones.map((x) => x.toFixed(2)).join(", ")} s)`);
    check(quedo?.tenant_id === 0 && quedo?.altas === 0 && quedo?.triggers === 0 && quedo?.lock_timeout === "0",
      `…y no queda nada aplicado (${JSON.stringify(quedo)})`);
  } catch (e) { mal.push(`ensayo de candados de la migración (8 fallos): ${msg(e).slice(0, 160)}`); }
  // La vuelta atrás, sobre la migración aplicada: el mismo bloque, las mismas reglas.
  const nV = pedidosDe(VUELTA).length;
  try {
    const db = await base();
    await db.exec("begin;\n" + MIG_A + "\ncommit;");
    const r = await ensayarCandados(db, conFallosInyectados(VUELTA, 8));
    const a = leerAvisos(r.avisos);
    const quedo = await uno(db, QUE_QUEDO);
    check(/chat_candados/.test(r.error ?? "") && a.fallos === 8 && a.handler.length === 8 && a.handler.every((h) => h === "(ninguno)")
        && seSeparan(a.separaciones) && a.candados.length === 8 * nV && a.candados.every((t) => t === "200ms"),
      `vuelta atrás con el candado ocupado 8 veces: pide cada candado con 200 ms, suelta todo, espera 1 s o más y se rinde con chat_candados (${(r.error ?? "SE CORRIÓ").slice(0, 60)}; ${a.fallos} fallos, ${a.handler.length} esperas sin candados, ${a.candados.length} pedidos con ${[...new Set(a.candados)].join(",")}; ${a.separaciones.map((x) => x.toFixed(1)).join(",")} s)`);
    check(quedo?.tenant_id === 1 && quedo?.triggers === TRIGGERS_A.length, `…y la migración queda entera, sin nada deshecho a medias (${JSON.stringify(quedo)})`);
    const r0 = await ensayarCandados(db, conFallosInyectados(VUELTA, 0));
    const a0 = leerAvisos(r0.avisos);
    check(r0.error === null && a0.tras.length === 1 && a0.tras[0] === "3s" && a0.candados.every((t) => t === "200ms"),
      `vuelta atrás con los candados libres: corre, y con todo tomado sigue con lock_timeout = 3s${r0.error ? ` — falló: ${r0.error.slice(0, 90)}` : ` (${a0.tras.join(",")})`}`);
  } catch (e) { mal.push(`ensayo de candados de la vuelta atrás: ${msg(e).slice(0, 160)}`); }
}

// ════ 1. A1: la agencia en cada conversación, sin tocar las filas ════════════
{
  const db = await nueva("prod");
  const antes = await q(db, `select id, updated_at::text u, xmin::text x from chat_conversations order by id`);
  const filasAntes = await q(db, `select 'm' || id k, xmin::text x from chat_messages union all select 'p' || id, xmin::text from chat_participants
    union all select 'd' || message_id, xmin::text from chat_message_deletions union all select 'f' || id, xmin::text from profiles order by 1`);
  await db.exec("begin;\n" + MIG_A + "\ncommit;");
  const despues = await q(db, `select id, updated_at::text u, xmin::text x, tenant_id::text t from chat_conversations order by id`);
  const filasDespues = await q(db, `select 'm' || id k, xmin::text x from chat_messages union all select 'p' || id, xmin::text from chat_participants
    union all select 'd' || message_id, xmin::text from chat_message_deletions union all select 'f' || id, xmin::text from profiles order by 1`);
  check(filasAntes.length > 20 && JSON.stringify(filasAntes) === JSON.stringify(filasDespues),
    `A no escribe ninguna fila de mensajes, participaciones, archivo ni perfiles (${filasAntes.length} filas con el mismo xmin; los borrados de antes quedan como estaban)`);
  check(antes.length === 8 && despues.length === 8, `las 8 conversaciones sembradas siguen (${despues.length})`);
  check(despues.every((d, i) => d.u === antes[i].u), "el updated_at de las conversaciones que ya estaban NO cambia (el orden de la bandeja no se mueve)");
  check(despues.every((d, i) => d.x === antes[i].x), "ninguna fila se reescribió ni se actualizó (mismo xmin: no hubo UPDATE ni eventos de Realtime)");
  check(despues.every((d) => d.t === T1), "todas quedaron con la única agencia");
  const col = await uno(db, `select a.attnotnull nn, a.atthasmissing faltante, (select count(*) from pg_attrdef d where d.adrelid=a.attrelid and d.adnum=a.attnum)::int def
    from pg_attribute a where a.attrelid='public.chat_conversations'::regclass and a.attname='tenant_id'`);
  check(col?.nn === true && col?.faltante === true && col?.def === 0, `tenant_id: NOT NULL, valor en el catálogo (sin reescribir) y sin default (${JSON.stringify(col)})`);
  const fk = await uno(db, `select count(*)::int n from pg_constraint where conrelid='public.chat_conversations'::regclass and contype='f' and confrelid='public.tenants'::regclass`);
  check(fk?.n === 1, "tenant_id tiene FK a tenants");
  // Las conversaciones sembradas son viejas: la tabla de altas arranca vacía. La
  // siembra de las últimas 24 horas se prueba en la sección 7.
  check((await uno(db, `select count(*)::int n from chat_conversaciones_creadas`))?.n === 0, "sin conversaciones de las últimas 24 horas, la tabla de altas arranca vacía");

  // Con dos agencias, la migración no sabe cuál poner: no corre y no deja nada a medias.
  const db2 = await nueva("prod", `insert into public.tenants(id, slug, name) values ('${T2}', 'otra', 'Otra');`);
  try { await db2.exec("begin;\n" + MIG_A + "\ncommit;"); mal.push("con dos agencias la migración corrió (NO debía)"); }
  catch (e) {
    await db2.exec("rollback");
    const col2 = await uno(db2, `select count(*)::int n from pg_attribute where attrelid='public.chat_conversations'::regclass and attname='tenant_id'`);
    check(/chat_agencia/.test(msg(e)) && col2?.n === 0, `con dos agencias la migración falla entera → ${msg(e).slice(0, 80)}`);
  }
}

// ════ 2. Los huecos A–H: abiertos en prod, cerrados con la migración ═════════
{
  const prod = await nueva("prod");
  const conA = await nueva("A");

  // A. Mover la participación propia a otra conversación (Jhon es admin de DM1, que creó).
  // ⚠️ Prod distinto del diseño: por PostgREST esto YA está cerrado. Un UPDATE con
  // WHERE que nombra columnas exige que la fila NUEVA también pase la política
  // SELECT (is_chat_participant de la conversación destino, donde Jhon no está),
  // y PostgREST no puede mandar un UPDATE sin WHERE: el rol authenticator de prod
  // precarga safeupdate. Lo que sigue abierto es el mismo movimiento sin esa
  // pared (service_role: una edge con el cliente admin), y lo cierra el trigger.
  const moverA = `update chat_participants set conversation_id = '${G2}' where conversation_id = '${DM1}' and user_id = '${JHON}'`;
  const jhonEnG2 = `select exists (select 1 from chat_participants where conversation_id = '${G2}' and user_id = '${JHON}' and role = 'admin') si`;
  const porApi = await probar(prod, [[JHON, moverA]], jhonEnG2);
  check(!porApi.ok && /row-level security/.test(porApi.error ?? ""),
    `A · por PostgREST en prod ya lo frena la RLS (la fila nueva tiene que verse por la política SELECT) → ${porApi.ok ? "PASÓ" : porApi.error?.slice(0, 90)}`);
  const porApiConA = await probar(conA, [[JHON, moverA]], jhonEnG2);
  check(!porApiConA.ok && /chat_participacion_inmutable/.test(porApiConA.error ?? ""),
    `A · por PostgREST con la migración lo frena antes el trigger → ${porApiConA.ok ? "PASÓ" : porApiConA.error?.slice(0, 90)}`);
  await hueco(prod, conA, "A · sin la pared de la RLS (service_role) mover la participación de Jhon de DM1 a G2, como admin", "service_role",
    moverA, jhonEnG2, /chat_participacion_inmutable/);
  // B. El admin de G1 le cambia el user_id a una participación.
  await hueco(prod, conA, "B · cambiarle el user_id a la participación de Beto en G1", JHON,
    `update chat_participants set user_id = '${CARLA}' where conversation_id = '${G1}' and user_id = '${BETO}'`,
    `select exists (select 1 from chat_participants where conversation_id = '${G1}' and user_id = '${CARLA}') si`,
    /chat_participacion_inmutable/);
  // C. Un miembro cambia created_by (y con eso puede borrar el grupo) o type.
  await hueco(prod, conA, "C · un miembro se pone de creador de G1 y lo borra entero", ANA,
    `update chat_conversations set created_by = '${ANA}' where id = '${G1}'; delete from chat_conversations where id = '${G1}'`,
    `select not exists (select 1 from chat_conversations where id = '${G1}') si`,
    /chat_conversacion_inmutable/);
  await hueco(prod, conA, "C · un miembro pasa G1 a 'direct' (se salta los permisos del grupo)", ANA,
    `update chat_conversations set type = 'direct' where id = '${G1}'`,
    `select exists (select 1 from chat_conversations where id = '${G1}' and type = 'direct') si`,
    /chat_conversacion_inmutable/);

  // D. Un tercero en un directo.
  await hueco(prod, conA, "D · Jhon (admin de su directo) suma a Beto a DM1", JHON,
    `insert into chat_participants(conversation_id, user_id, role) values ('${DM1}', '${BETO}', 'member')`,
    `select (select count(*) from chat_participants where conversation_id = '${DM1}') = 3 si`,
    /directo_lleno/);
  // D por la puerta de atrás: el creador saca al otro (la política DELETE dejaba a
  // cualquier admin) y suma a un tercero, que lee lo que el otro escribió.
  await hueco(prod, conA, "D · Jhon saca a Ana de DM1 (en un directo nadie saca al otro)", JHON,
    `delete from chat_participants where conversation_id = '${DM1}' and user_id = '${ANA}'`,
    `select not exists (select 1 from chat_participants where conversation_id = '${DM1}' and user_id = '${ANA}') si`,
    "sin_efecto");
  await hueco(prod, conA, "D · Jhon saca a Ana de DM1 y suma a Beto, que lee lo que Ana escribió", JHON,
    `delete from chat_participants where conversation_id = '${DM1}' and user_id = '${ANA}';
     insert into chat_participants(conversation_id, user_id, role) values ('${DM1}', '${BETO}', 'member')`,
    `select exists (select 1 from chat_participants where conversation_id = '${DM1}' and user_id = '${BETO}') si`,
    /directo_lleno/);
  await huecoEnPasos(prod, conA, "D · Ana se va sola de DM1 y Jhon suma a Beto, que lee lo que Ana escribió", [
    [ANA, `delete from chat_participants where conversation_id = '${DM1}' and user_id = '${ANA}'`],
    [JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${DM1}', '${BETO}', 'member')`],
  ], `select exists (select 1 from chat_participants where conversation_id = '${DM1}' and user_id = '${BETO}') si`,
    /directo_con_historia_ajena/);
  {
    // Volver a sumar a la MISMA persona sí se puede: los mensajes son suyos.
    const r = await probar(conA, [
      [ANA, `delete from chat_participants where conversation_id = '${DM1}' and user_id = '${ANA}'`],
      [JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${DM1}', '${ANA}', 'member')`],
    ], `select exists (select 1 from chat_participants where conversation_id = '${DM1}' and user_id = '${ANA}') si`);
    check(r.ok && r.si === true, `D · si Ana se va, Jhon la puede volver a sumar a ella${r.ok ? "" : ` — falló: ${r.error?.slice(0, 90)}`}`);
    // Y cada uno sigue pudiendo salir de un directo.
    const s = await probar(conA, [[ANA, `delete from chat_participants where conversation_id = '${DM1}' and user_id = '${ANA}'`]],
      `select not exists (select 1 from chat_participants where conversation_id = '${DM1}' and user_id = '${ANA}') si`);
    check(s.ok && s.si === true, "D · en un directo cada uno sale de su propia participación");
  }
  // El otro nunca escribió: solo reaccionó, o solo leyó. Sus rastros cuentan igual.
  const DMC = "c4000000-0000-4000-8000-000000000001";
  const abrirDMC = `insert into chat_conversations(id, type, created_by) values ('${DMC}', 'direct', '${JHON}');
    insert into chat_participants(conversation_id, user_id, role) values ('${DMC}', '${JHON}', 'admin');
    insert into chat_participants(conversation_id, user_id, role) values ('${DMC}', '${CARLA}', 'member');
    insert into chat_messages(id, conversation_id, sender_id, content) values ('e4000000-0000-4000-8000-000000000001', '${DMC}', '${JHON}', 'Carla: te paso el dato')`;
  const betoEnDMC = `select exists (select 1 from chat_participants where conversation_id = '${DMC}' and user_id = '${BETO}') si`;
  await huecoEnPasos(prod, conA, "D · Jhon le escribe a Carla, que solo reacciona; Jhon la saca y suma a Beto", [
    [JHON, abrirDMC],
    [CARLA, `insert into chat_reactions(message_id, user_id, emoji) values ('e4000000-0000-4000-8000-000000000001', '${CARLA}', '👍')`],
    [JHON, `delete from chat_participants where conversation_id = '${DMC}' and user_id = '${CARLA}';
      insert into chat_participants(conversation_id, user_id, role) values ('${DMC}', '${BETO}', 'member')`],
  ], betoEnDMC, /directo_lleno/);
  await huecoEnPasos(prod, conA, "D · Carla solo reaccionó y se fue; Jhon suma a Beto, que ve la reacción de Carla", [
    [JHON, abrirDMC],
    [CARLA, `insert into chat_reactions(message_id, user_id, emoji) values ('e4000000-0000-4000-8000-000000000001', '${CARLA}', '👍');
      delete from chat_participants where conversation_id = '${DMC}' and user_id = '${CARLA}'`],
    [JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${DMC}', '${BETO}', 'member')`],
  ], betoEnDMC, /directo_con_historia_ajena/);
  await huecoEnPasos(prod, conA, "D · Carla solo leyó y se fue; Jhon suma a Beto, que ve el recibo de Carla", [
    [JHON, abrirDMC],
    [CARLA, `insert into chat_read_receipts(message_id, user_id, read_at) values ('e4000000-0000-4000-8000-000000000001', '${CARLA}', now());
      delete from chat_participants where conversation_id = '${DMC}' and user_id = '${CARLA}'`],
    [JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${DMC}', '${BETO}', 'member')`],
  ], betoEnDMC, /directo_con_historia_ajena/);
  // Un directo que quedó vacío, con mensajes: ni con service_role entra un tercero.
  await huecoEnPasos(prod, conA, "D · Ana y Jhon se van de DM1 y service_role suma a Beto al directo vacío", [
    [ANA, `delete from chat_participants where conversation_id = '${DM1}' and user_id = '${ANA}'`],
    [JHON, `delete from chat_participants where conversation_id = '${DM1}' and user_id = '${JHON}'`],
    ["service_role", `insert into chat_participants(conversation_id, user_id, role) values ('${DM1}', '${BETO}', 'member')`],
  ], `select exists (select 1 from chat_participants where conversation_id = '${DM1}' and user_id = '${BETO}') si`,
    /directo_con_historia_ajena/);

  // E. UPDATE de lo que no se edita.
  await hueco(prod, conA, "E · atrasar la fecha de un mensaje propio", ANA,
    `update chat_messages set created_at = '2020-01-01' where id = '${M_G1}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1}' and created_at < '2021-01-01') si`,
    /chat_mensaje_inmutable/);
  await hueco(prod, conA, "E · resucitar un mensaje borrado (y escribirle)", ANA,
    `update chat_messages set is_deleted = false, content = 'volví' where id = '${M_BORRADO}'`,
    `select exists (select 1 from chat_messages where id = '${M_BORRADO}' and not is_deleted) si`,
    /un mensaje borrado no vuelve/);
  await hueco(prod, conA, "E · resucitar un borrado viejo SIN tocar el texto (su texto rico vuelve a verse)", BETO,
    `update chat_messages set is_deleted = false where id = '${M_LEG_RICO}'`,
    `select exists (select 1 from chat_messages where id = '${M_LEG_RICO}' and not is_deleted) si`,
    /un mensaje borrado no vuelve/);
  await hueco(prod, conA, "E · escribirle texto a un mensaje borrado sin resucitarlo", ANA,
    `update chat_messages set content = 'ahora digo otra cosa' where id = '${M_BORRADO}'`,
    `select exists (select 1 from chat_messages where id = '${M_BORRADO}' and content is not null) si`,
    /un mensaje borrado no se edita/);
  await hueco(prod, conA, "E · escribirle texto RICO a un mensaje borrado sin resucitarlo", ANA,
    `update chat_messages set content_rich = '{"type":"doc","content":[{"type":"text","text":"reescrito"}]}' where id = '${M_BORRADO}'`,
    `select exists (select 1 from chat_messages where id = '${M_BORRADO}' and content_rich is not null) si`,
    /un mensaje borrado no se edita/);
  await hueco(prod, conA, "E · pasar un mensaje propio a 'system' (sin autor en la burbuja)", ANA,
    `update chat_messages set type = 'system' where id = '${M_G1}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1}' and type = 'system') si`,
    /chat_mensaje_inmutable/);
  await hueco(prod, conA, "E · colgarle por UPDATE a un mensaje una imagen externa (píxel espía)", ANA,
    `update chat_messages set file_url = 'https://rastreo.ejemplo.test/p.png' where id = '${M_G1}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1}' and file_url is not null) si`,
    /chat_mensaje_inmutable/);
  await hueco(prod, conA, "E · cambiarle el nombre del archivo a un mensaje", ANA,
    `update chat_messages set file_name = 'factura.pdf' where id = '${M_G1}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1}' and file_name = 'factura.pdf') si`,
    /chat_mensaje_inmutable/);
  await hueco(prod, conA, "E · cambiarle el tamaño del archivo a un mensaje", ANA,
    `update chat_messages set file_size = 123 where id = '${M_G1}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1}' and file_size = 123) si`,
    /chat_mensaje_inmutable/);
  await hueco(prod, conA, "E · hacer por UPDATE que un mensaje cite uno de OTRA conversación", ANA,
    `update chat_messages set reply_to_id = '${M_G2}' where id = '${M_G1}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1}' and reply_to_id = '${M_G2}') si`,
    /chat_mensaje_inmutable/);
  await hueco(prod, conA, "E · meter un mensaje en un álbum", ANA,
    `update chat_messages set album_id = gen_random_uuid() where id = '${M_G1}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1}' and album_id is not null) si`,
    /chat_mensaje_inmutable/);
  await hueco(prod, conA, "E · esconder un mensaje en un hilo", BETO,
    `update chat_messages set is_thread_reply = true where id = '${M_G1_CITA}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1_CITA}' and is_thread_reply) si`,
    /chat_mensaje_inmutable/);
  // E por INSERT: lo mismo por la otra puerta.
  await hueco(prod, conA, "E · INSERT con fecha en el futuro (queda un no leído que nadie borra)", ANA,
    `insert into chat_messages(conversation_id, sender_id, content, created_at) values ('${G1}', '${ANA}', 'del futuro', '2099-01-01')`,
    `select exists (select 1 from chat_messages where content = 'del futuro' and created_at > now() + interval '1 day') si`,
    "sin_efecto");
  await hueco(prod, conA, "E · INSERT con fecha atrasada (se esconde en la historia)", ANA,
    `insert into chat_messages(conversation_id, sender_id, content, created_at) values ('${G1}', '${ANA}', 'del pasado', '2020-01-01')`,
    `select exists (select 1 from chat_messages where content = 'del pasado' and created_at < '2021-01-01') si`,
    "sin_efecto");
  {
    // El no leído eterno, con el camino de la app: Jhon marca leído y el contador vuelve a 0.
    const pasos: Paso[] = [
      [ANA, `insert into chat_messages(conversation_id, sender_id, content, created_at) values ('${G1}', '${ANA}', 'del futuro', '2099-01-01')`],
      [JHON, `update chat_participants set last_read_at = now() where conversation_id = '${G1}' and user_id = '${JHON}'`],
    ];
    // El último paso deja los claims de Jhon: get_unread_counts exige que sea él.
    const efecto = `select coalesce((select unread_count from public.get_unread_counts('${JHON}') where conversation_id = '${G1}'), 0) > 0 si`;
    const a = await probar(prod, pasos, efecto), b = await probar(conA, pasos, efecto);
    check(a.ok && a.si === true && b.ok && b.si === false,
      `E · con un mensaje «del futuro», marcar leído no borra el no leído en prod (${a.si}) y con la migración sí (${b.si})`);
  }
  await hueco(prod, conA, "E · INSERT que cita un mensaje de OTRA conversación (donde Ana no está)", ANA,
    `insert into chat_messages(conversation_id, sender_id, content, reply_to_id) values ('${DM1}', '${ANA}', 'cito de G2', '${M_G2}')`,
    `select exists (select 1 from chat_messages where content = 'cito de G2') si`,
    /chat_cita_ajena/, "MV422");
  await hueco(prod, conA, "E · INSERT con una imagen de afuera (píxel espía)", ANA,
    `insert into chat_messages(conversation_id, sender_id, content, type, file_url, file_name) values ('${G1}', '${ANA}', null, 'image', 'https://rastreo.ejemplo.test/p.png', 'p.png')`,
    `select exists (select 1 from chat_messages where file_url = 'https://rastreo.ejemplo.test/p.png') si`,
    /chat_archivo_externo/, "MV422");
  await hueco(prod, conA, "E · INSERT con una URL que imita la de Maven (otro proyecto de Supabase)", ANA,
    `insert into chat_messages(conversation_id, sender_id, type, file_url, file_name) values ('${G1}', '${ANA}', 'image', 'https://otroproyecto.supabase.co/storage/v1/object/public/chat-files/p.png', 'p.png')`,
    `select exists (select 1 from chat_messages where file_url like 'https://otroproyecto%') si`,
    /chat_archivo_externo/);
  // Los anclajes de la lista de orígenes: cada URL imita un origen permitido sin
  // serlo. Sin el «^» de chat-files pasa la primera; sin el «^» de Giphy, la
  // segunda; con 'giphy\.com' suelto, la tercera y la cuarta.
  for (const url of [
    `https://evil.test/p.png?u=${ARCHIVO_MAVEN}`,
    "https://evil.test/media1.giphy.com/x.gif",
    "https://giphy.com.evil.test/x.gif",
    "https://media1.giphy.com.evil.test/x.gif",
  ]) {
    await hueco(prod, conA, `E · INSERT con un archivo que imita un origen permitido (${url.replace(ARCHIVO_MAVEN, "<ARCHIVO_MAVEN>")})`, ANA,
      `insert into chat_messages(conversation_id, sender_id, type, file_url, file_name) values ('${G1}', '${ANA}', 'image', '${url}', 'x.gif')`,
      `select exists (select 1 from chat_messages where file_url = '${url}') si`,
      /chat_archivo_externo/, "MV422");
  }
  await hueco(prod, conA, "E · INSERT de un mensaje «borrado» con el texto legible", ANA,
    `insert into chat_messages(conversation_id, sender_id, content, is_deleted, is_edited) values ('${G1}', '${ANA}', 'borrado pero se lee', true, true)`,
    `select exists (select 1 from chat_messages where content = 'borrado pero se lee' and (is_deleted or is_edited)) si`,
    "sin_efecto");

  // F. Borrar sin dejar archivo, y reescribir sin que se note.
  await hueco(prod, conA, "F · borrar con UPDATE is_deleted = true (sin archivo)", ANA,
    `update chat_messages set is_deleted = true, content = null where id = '${M_G1}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1}' and is_deleted)
        and not exists (select 1 from chat_message_deletions where message_id = '${M_G1}') si`,
    /chat_borrado_sin_archivo/);
  await hueco(prod, conA, "F · 'borrar' con is_deleted = true y dejar el texto legible", ANA,
    `update chat_messages set is_deleted = true where id = '${M_G1}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1}' and is_deleted and content is not null) si`,
    /chat_borrado_sin_archivo/);
  await hueco(prod, conA, "F · borrar sin archivo con el permiso de OTRO mensaje (el GUC con otro id)", ANA,
    `select set_config('maven.borrado_autorizado', '${M_G2}', true);
     update chat_messages set is_deleted = true, content = null, content_rich = null where id = '${M_G1}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1}' and is_deleted)
        and not exists (select 1 from chat_message_deletions where message_id = '${M_G1}') si`,
    /un mensaje se borra con delete_chat_message/);
  await hueco(prod, conA, "F · DELETE duro de un mensaje propio", ANA,
    `delete from chat_messages where id = '${M_G1}'`,
    `select not exists (select 1 from chat_messages where id = '${M_G1}') si`,
    "sin_efecto");
  await hueco(prod, conA, "F · DELETE duro de un mensaje que ya estaba en el archivo (se lleva el archivo)", BETO,
    `delete from chat_messages where id = '${M_LEG_RICO}'`,
    `select not exists (select 1 from chat_message_deletions where message_id = '${M_LEG_RICO}') si`,
    "sin_efecto");
  await hueco(prod, conA, "F · reescribir un mensaje ya editado y quitarle la marca de editado", ANA,
    `update chat_messages set content = 'v2', is_edited = true where id = '${M_G1}';
     update chat_messages set content = 'otra cosa', is_edited = false where id = '${M_G1}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1}' and content = 'otra cosa' and not is_edited) si`,
    /la marca de editado/);
  await hueco(prod, conA, "F · reescribir un mensaje sin mandar la marca de editado", ANA,
    `update chat_messages set content = 'dije otra cosa' where id = '${M_G1}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1}' and content = 'dije otra cosa' and not is_edited) si`,
    "sin_efecto");

  // G. Entrar como admin sin serlo, o volver solo.
  await hueco(prod, conA, "G · un miembro de G2 (add_permission = 'all') suma a Beto como ADMIN", DANI,
    `insert into chat_participants(conversation_id, user_id, role) values ('${G2}', '${BETO}', 'admin')`,
    `select exists (select 1 from chat_participants where conversation_id = '${G2}' and user_id = '${BETO}' and role = 'admin') si`,
    /chat_rol_no_autorizado/);
  await hueco(prod, conA, "G · el creador de G3, que ya no está, se re-inserta como admin", BETO,
    `insert into chat_participants(conversation_id, user_id, role) values ('${G3}', '${BETO}', 'admin')`,
    `select exists (select 1 from chat_participants where conversation_id = '${G3}' and user_id = '${BETO}') si`,
    /chat_rol_no_autorizado/);
  await hueco(prod, conA, "G · el creador de G3, que ya no está, se re-inserta como member (vuelve a leer todo)", BETO,
    `insert into chat_participants(conversation_id, user_id, role) values ('${G3}', '${BETO}', 'member')`,
    `select exists (select 1 from chat_participants where conversation_id = '${G3}' and user_id = '${BETO}') si`,
    /chat_rol_no_autorizado/);
  // G3 queda vacío después de que Ana escribió: el creador que se fue no vuelve
  // como admin a leer lo que se escribió sin él.
  await huecoEnPasos(prod, conA, "G · G3 queda vacío con un mensaje de Ana, y su creador (Beto) vuelve solo como admin", [
    [ANA, `insert into chat_messages(conversation_id, sender_id, content) values ('${G3}', '${ANA}', 'esto lo escribí sin Beto')`],
    [CARLA, `delete from chat_participants where conversation_id = '${G3}' and user_id = '${CARLA}'`],
    [ANA, `delete from chat_participants where conversation_id = '${G3}' and user_id = '${ANA}'`],
    [BETO, `insert into chat_participants(conversation_id, user_id, role) values ('${G3}', '${BETO}', 'admin')`],
  ], `select exists (select 1 from chat_participants where conversation_id = '${G3}' and user_id = '${BETO}') si`,
    /chat_rol_no_autorizado/);
  // Quien suma tiene que seguir siendo de la agencia (un ex-miembro que quedó adentro).
  await huecoEnPasos(prod, conA, "G · Dani sale de la agencia (sigue en G2, add_permission = 'all') y suma a Beto", [
    ["postgres", `delete from public.tenant_members where user_id = '${DANI}'`],
    [DANI, `insert into chat_participants(conversation_id, user_id, role) values ('${G2}', '${BETO}', 'member')`],
  ], `select exists (select 1 from chat_participants where conversation_id = '${G2}' and user_id = '${BETO}') si`,
    /quien suma no es de la agencia/);
  // H. El nombre.
  await hueco(prod, conA, "H · Ana se cambia el nombre a «Jhon Lopez»", ANA,
    `update profiles set full_name = 'Jhon Lopez' where id = '${ANA}'`,
    `select exists (select 1 from profiles where id = '${ANA}' and full_name = 'Jhon Lopez') si`,
    /perfil_nombre_bloqueado/);
}

// ════ 3. Los flujos de la app siguen andando ═════════════════════════════════
{
  const db = await nueva("A");
  const NUEVO_DM = "c1000000-0000-4000-8000-000000000001";
  const NUEVO_G = "c1000000-0000-4000-8000-000000000002";
  const directo = async (yo: string, otro: string) =>
    (await como(db, yo, `select public.chat_directo_con('${otro}') d`))[0]?.d ?? null;

  check(await directo(JHON, ANA) === DM1 && await directo(ANA, JHON) === DM1, "chat_directo_con: Jhon ↔ Ana encuentra DM1 desde los dos lados");
  check(await directo(JHON, BETO) === null, "chat_directo_con: sin directo da null");
  check(await directo(JHON, JHON) === null, "chat_directo_con: conmigo mismo da null");
  await falla(db, "anon", `select public.chat_directo_con('${ANA}')`, /permission denied/, "chat_directo_con: anon no la puede llamar");

  // createDirectChat: los tres pedidos de useChat.ts, cada uno en su transacción.
  await anda(db, JHON, `insert into chat_conversations(id, type, created_by) values ('${NUEVO_DM}', 'direct', '${JHON}')`, "directo, paso 1: la conversación (sin RETURNING, como la app)");
  await anda(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${NUEVO_DM}', '${JHON}', 'admin')`, "directo, paso 2: el creador como admin");
  await anda(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${NUEVO_DM}', '${BETO}', 'member')`, "directo, paso 3: el otro como member");
  const nd = await uno(db, `select tenant_id::text t, (select count(*)::int from chat_participants where conversation_id = '${NUEVO_DM}') n, created_at > now() - interval '1 minute' reciente from chat_conversations where id = '${NUEVO_DM}'`);
  check(nd?.t === T1 && nd?.n === 2 && nd?.reciente === true, `el directo nuevo quedó en la agencia de Jhon, con 2 personas (${JSON.stringify(nd)})`);
  check(await directo(JHON, BETO) === NUEVO_DM && await directo(BETO, JHON) === NUEVO_DM, "chat_directo_con lo encuentra desde los dos lados");
  // La conversación optimista deja escribir antes de que termine el tercer paso.
  const DM_APURADO = "c1000000-0000-4000-8000-000000000007";
  await anda(db, DANI, `insert into chat_conversations(id, type, created_by) values ('${DM_APURADO}', 'direct', '${DANI}')`, "directo apurado, paso 1");
  await anda(db, DANI, `insert into chat_participants(conversation_id, user_id, role) values ('${DM_APURADO}', '${DANI}', 'admin')`, "directo apurado, paso 2");
  await anda(db, DANI, `insert into chat_messages(conversation_id, sender_id, content) values ('${DM_APURADO}', '${DANI}', 'rápido')`, "directo apurado: el creador escribe antes del paso 3");
  await anda(db, DANI, `insert into chat_participants(conversation_id, user_id, role) values ('${DM_APURADO}', '${JHON}', 'member')`, "directo apurado, paso 3: igual entra el otro");

  // createGroupChat: conversación, creador, y los miembros en UN insert de varias filas.
  await anda(db, JHON, `insert into chat_conversations(id, type, name, created_by) values ('${NUEVO_G}', 'group', 'Nuevo', '${JHON}')`, "grupo, paso 1: la conversación");
  await anda(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${NUEVO_G}', '${JHON}', 'admin')`, "grupo, paso 2: el creador como admin");
  await anda(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${NUEVO_G}', '${ANA}', 'member'), ('${NUEVO_G}', '${BETO}', 'member'), ('${NUEVO_G}', '${CARLA}', 'member')`, "grupo, paso 3: los miembros en un solo insert");
  check((await uno(db, `select count(*)::int n from chat_participants where conversation_id = '${NUEVO_G}'`))?.n === 4, "el grupo nuevo tiene 4 personas");

  // Mensajes: mandar (texto, imagen, GIF, respuesta, hilo), editar, borrar por la RPC.
  const antesNotif = (await uno(db, `select count(*)::int n from notifications`))?.n as number;
  const M_NUEVO = "e1000000-0000-4000-8000-000000000001";
  await anda(db, ANA, `insert into chat_messages(id, conversation_id, sender_id, content, content_rich) values ('${M_NUEVO}', '${NUEVO_G}', '${ANA}', 'hola @Jhon Lopez', '{"type":"doc"}')`, "mandar un mensaje a un grupo");
  const notif = await q(db, `select user_id::text u, type from notifications order by created_at desc limit 10`);
  check((await uno(db, `select count(*)::int n from notifications`))?.n === antesNotif + 3 && notif.some((n) => n.u === JHON && n.type === "chat_mention"),
    "las notificaciones salen igual que antes (3 destinatarios, la mención de Jhon como chat_mention)");
  const nuevo = await uno(db, `select created_at > now() - interval '1 minute' reciente, not is_edited and not is_deleted limpio from chat_messages where id = '${M_NUEVO}'`);
  check(nuevo?.reciente === true && nuevo?.limpio === true, `el mensaje nuevo lleva la fecha de la base y sale sin marcas (${JSON.stringify(nuevo)})`);
  await anda(db, BETO, `insert into chat_messages(conversation_id, sender_id, content, type, file_url, file_name) values ('${NUEVO_G}', '${BETO}', null, 'image', '${ARCHIVO_MAVEN}', 'foto.png')`, "mandar una imagen subida a chat-files (MessageInput)");
  await anda(db, BETO, `insert into chat_messages(conversation_id, sender_id, content, type, file_url, file_name) values ('${NUEVO_G}', '${BETO}', '🎬 GIF', 'file', '${GIF_GIPHY}', 'gif.mp4')`, "mandar un GIF de Giphy (sendGifUrl)");
  await anda(db, BETO, `insert into chat_messages(conversation_id, sender_id, content, reply_to_id) values ('${NUEVO_G}', '${BETO}', 'te respondo', '${M_NUEVO}')`, "responder citando un mensaje de la misma conversación");
  await anda(db, BETO, `insert into chat_messages(conversation_id, sender_id, content, reply_to_id, is_thread_reply) values ('${NUEVO_G}', '${BETO}', 'en el hilo', '${M_NUEVO}', true)`, "responder en un hilo (ThreadPanel)");
  await anda(db, ANA, `update chat_messages set content = 'hola a todos', is_edited = true, content_rich = null where id = '${M_NUEVO}'`, "editar un mensaje propio ({content, is_edited, content_rich: null}, como useChat)");
  check((await uno(db, `select is_edited e from chat_messages where id = '${M_NUEVO}'`))?.e === true, "el mensaje editado queda con la marca");
  const r = await anda(db, BETO, `select public.delete_chat_message('${M_NUEVO}') r`, "borrar un mensaje AJENO por la RPC responde (sin borrar)");
  check(r?.[0]?.r?.error === "not_author", `la RPC le dice not_author a quien no es el autor (${JSON.stringify(r?.[0]?.r)})`);
  await anda(db, ANA, `update chat_messages set content_rich = '{"type":"doc","content":[{"type":"text"}]}' where id = '${M_NUEVO}'`, "(vuelve a ponerle texto rico)");
  // En el MISMO pedido (una transacción), después de la RPC: el permiso ya se apagó.
  const r2 = await anda(db, ANA, `select public.delete_chat_message('${M_NUEVO}') r;
    select (select public.delete_chat_message('${M_NUEVO}')) r, current_setting('maven.borrado_autorizado', true) guc`,
    "borrar un mensaje propio por la RPC (delete_chat_message)");
  check(r2?.[0]?.r?.already === true, `la RPC borró (la segunda llamada del mismo pedido ya lo ve borrado: ${JSON.stringify(r2?.[0]?.r)})`);
  check(r2?.[0]?.guc === "", `el permiso de borrar no queda puesto después de la RPC, ni dentro del mismo pedido (${JSON.stringify(r2?.[0]?.guc)})`);
  const b = await uno(db, `select m.is_deleted d, m.content c, m.content_rich cr, a.content ac, a.content_rich acr
    from chat_messages m join chat_message_deletions a on a.message_id = m.id where m.id = '${M_NUEVO}'`);
  check(b?.d === true && b?.c === null && b?.cr === null && b?.ac === "hola a todos" && b?.acr !== null,
    `el mensaje queda vacío (también el rico) y el archivo guarda el texto Y el rico (${JSON.stringify(b)})`);
  const r3 = await anda(db, ANA, `select public.delete_chat_message('${M_NUEVO}') r`, "borrar dos veces el mismo mensaje");
  check(r3?.[0]?.r?.already === true, "la segunda vez responde already, como antes");

  // Participaciones: silenciar, leer, notificaciones, rol, sumar, salir.
  await anda(db, BETO, `update chat_participants set is_muted = true where conversation_id = '${G1}' and user_id = '${BETO}'`, "silenciar un chat (toggleMute)");
  await anda(db, BETO, `update chat_participants set notifications_mode = 'mentions', is_muted = false where conversation_id = '${G1}' and user_id = '${BETO}'`, "cambiar el modo de notificaciones (NotificationSettings)");
  await anda(db, BETO, `update chat_participants set last_read_at = now() where conversation_id = '${G1}' and user_id = '${BETO}'`, "marcar leído (last_read_at)");
  await anda(db, JHON, `update chat_participants set role = 'admin' where conversation_id = '${G1}' and user_id = '${ANA}'`, "el admin hace admin a Ana (GroupMembersPanel)");
  await anda(db, JHON, `update chat_participants set role = 'member' where conversation_id = '${G1}' and user_id = '${ANA}'`, "y le quita el admin");
  await falla(db, ANA, `update chat_participants set role = 'admin' where conversation_id = '${G1}' and user_id = '${ANA}'`, /solo un admin/, "un miembro no se hace admin solo (la guarda de siempre)");
  await anda(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${G1}', '${CARLA}', 'member')`, "el admin suma a Carla a G1 (también es el camino de aprobar una solicitud)");
  await anda(db, DANI, `insert into chat_participants(conversation_id, user_id, role) values ('${G2}', '${BETO}', 'member')`, "en un grupo con add_permission = 'all' un miembro suma a otro como member");
  await anda(db, JHON, `delete from chat_participants where conversation_id = '${G1}' and user_id = '${CARLA}'`, "el admin de un GRUPO sigue sacando a alguien (GroupMembersPanel)");
  check((await uno(db, `select count(*)::int n from chat_participants where conversation_id = '${G1}' and user_id = '${CARLA}'`))?.n === 0, "y Carla quedó afuera de G1");
  await anda(db, BETO, `delete from chat_participants where conversation_id = '${G1}' and user_id = '${BETO}'`, "salir de un grupo");

  // Conversación: el bump de updated_at, renombrar, permisos, mensaje de sistema.
  await anda(db, ANA, `update chat_conversations set updated_at = now() where id = '${G1}'`, "el bump de updated_at después de mandar (useChat.ts)");
  await anda(db, JHON, `update chat_conversations set name = 'Equipo 2' where id = '${G1}'`, "el admin renombra el grupo (ChatHeader)");
  await anda(db, JHON, `update chat_conversations set avatar_url = 'https://ejemplo.test/a.png' where id = '${G1}'`, "el admin le cambia la foto");
  await anda(db, JHON, `update chat_conversations set msg_permission = 'admins', require_approval = true where id = '${G1}'`, "el admin cambia los permisos (GroupMembersPanel)");
  await anda(db, JHON, `insert into chat_messages(conversation_id, sender_id, type, content) values ('${G1}', '${JHON}', 'system', 'Jhon agregó a Carla al grupo')`, "mensaje de sistema (sigue igual: lo cierra el PR 1b)");

  // delete_conversation_cascade con citas adentro y una cita desde OTRA conversación.
  // (Hoy la app no cita entre conversaciones; la cita cruzada vieja la siembra el banco.)
  const G_CITAS = "c1000000-0000-4000-8000-000000000003";
  const C1 = "e1000000-0000-4000-8000-000000000011", C2 = "e1000000-0000-4000-8000-000000000012", C3 = "e1000000-0000-4000-8000-000000000013";
  await anda(db, JHON, `insert into chat_conversations(id, type, name, created_by) values ('${G_CITAS}', 'group', 'Con citas', '${JHON}')`, "cascada: grupo");
  await anda(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${G_CITAS}', '${JHON}', 'admin')`, "cascada: creador");
  await anda(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${G_CITAS}', '${ANA}', 'member')`, "cascada: miembro");
  await anda(db, ANA, `insert into chat_messages(id, conversation_id, sender_id, content) values ('${C1}', '${G_CITAS}', '${ANA}', 'uno')`, "cascada: mensaje");
  await anda(db, JHON, `insert into chat_messages(id, conversation_id, sender_id, content, reply_to_id) values ('${C2}', '${G_CITAS}', '${JHON}', 'cito', '${C1}')`, "cascada: cita adentro");
  await db.exec(`insert into chat_messages(id, conversation_id, sender_id, content, reply_to_id) values ('${C3}', '${DM1}', '${ANA}', 'cito de otro chat', '${C1}')`);
  await anda(db, ANA, `select public.delete_chat_message('${C2}')`, "cascada: un mensaje borrado adentro (con archivo)");
  await anda(db, JHON, `select public.delete_conversation_cascade('${G_CITAS}')`, "delete_conversation_cascade de un grupo con citas y borrados");
  const cas = await uno(db, `select (select count(*)::int from chat_conversations where id = '${G_CITAS}') conv, (select reply_to_id from chat_messages where id = '${C3}') cita`);
  check(cas?.conv === 0 && cas?.cita === null, `la conversación se fue y la cita desde afuera quedó en NULL por el ON DELETE SET NULL (${JSON.stringify(cas)})`);
  await anda(db, ANA, `select public.delete_conversation_cascade('${DM1}')`, "delete_conversation_cascade de un directo (cualquiera de los dos, aunque no pueda sacar al otro)");
  check((await uno(db, `select count(*)::int n from chat_participants where conversation_id = '${DM1}'`))?.n === 0, "y se llevó las dos participaciones del directo");

  // Perfiles.
  await anda(db, "service_role", `update profiles set full_name = 'Ana María Ruiz', ai_daily_quota_override = 10 where id = '${ANA}'`, "un admin cambia el full_name con service_role (admin-user-actions)");
  await anda(db, ANA, `update profiles set status = 'busy', avatar_seed = 'x', ui_prefs = '{"idioma":"en"}' where id = '${ANA}'`, "la persona sigue cambiando su estado, su avatar y sus preferencias");
  await anda(db, ANA, `update profiles set full_name = full_name, status = 'away' where id = '${ANA}'`, "un UPDATE que manda el mismo full_name pasa");
  await db.exec(`insert into auth.users(id, email, raw_user_meta_data) values ('a0000000-0000-4000-8000-0000000000ff', 'nueva@ejemplo.test', '{"full_name":"Nueva Persona"}')`);
  const nueva_ = await uno(db, `select p.full_name n, (select count(*)::int from tenant_members where user_id = p.id and tenant_id = '${T1}') tm from profiles p where p.id = 'a0000000-0000-4000-8000-0000000000ff'`);
  check(nueva_?.n === "Nueva Persona" && nueva_?.tm === 1, `el alta (handle_new_user) sigue creando el perfil con su nombre y la membresía (${JSON.stringify(nueva_)})`);

  // createDirectChat en una carrera (lib: hooks/abrirDirecto.ts): el tercer paso da
  // directo_duplicado. La app borra la conversación que acaba de crear, en UN
  // pedido y mientras todavía es participante (la cascada se lleva su
  // participación), y abre el directo canónico con chat_directo_con.
  const DM_ROTO = "c1000000-0000-4000-8000-000000000004";
  await anda(db, CARLA, `insert into chat_conversations(id, type, created_by) values ('${DM_ROTO}', 'direct', '${CARLA}')`, "carrera: la conversación");
  await anda(db, CARLA, `insert into chat_participants(conversation_id, user_id, role) values ('${DM_ROTO}', '${CARLA}', 'admin')`, "carrera: el creador");
  await fallaCon(db, CARLA, `insert into chat_participants(conversation_id, user_id, role) values ('${DM_ROTO}', '${BETO}', 'member')`, /directo_duplicado/, "MV409", "carrera: el tercer paso falla (Carla y Beto ya tenían directo)");
  await anda(db, CARLA, `delete from chat_conversations where id = '${DM_ROTO}'`, "carrera: borra la conversación que creó");
  const roto = await uno(db, `select (select count(*)::int from chat_conversations where id = '${DM_ROTO}') c, (select count(*)::int from chat_participants where conversation_id = '${DM_ROTO}') p`);
  check(roto?.c === 0 && roto?.p === 0, `y no queda nada huérfano (${JSON.stringify(roto)})`);
  check(await directo(CARLA, BETO) === DMV2, "y chat_directo_con le da el directo que ya había (el canónico)");
  // El orden de antes (primero la participación y después la conversación) deja la
  // conversación huérfana: sin participación la política SELECT ya no la deja ver, y
  // el DELETE borra 0 filas sin dar error. Pasa igual en prod (hay 1 grupo sin nadie).
  const DM_VIEJO = "c1000000-0000-4000-8000-000000000006";
  await anda(db, CARLA, `insert into chat_conversations(id, type, created_by) values ('${DM_VIEJO}', 'direct', '${CARLA}')`, "orden viejo: la conversación");
  await anda(db, CARLA, `insert into chat_participants(conversation_id, user_id, role) values ('${DM_VIEJO}', '${CARLA}', 'admin')`, "orden viejo: el creador");
  await anda(db, CARLA, `delete from chat_participants where conversation_id = '${DM_VIEJO}'`, "orden viejo: borra su participación");
  await anda(db, CARLA, `delete from chat_conversations where id = '${DM_VIEJO}'`, "orden viejo: «borra» la conversación");
  check((await uno(db, `select count(*)::int n from chat_conversations where id = '${DM_VIEJO}'`))?.n === 1,
    "el orden viejo deja la conversación huérfana: por eso la app ahora borra la conversación primero");

  // Lo que manda el pedido en tenant_id o created_at no cuenta.
  const DM_T = "c1000000-0000-4000-8000-000000000005";
  await anda(db, DANI, `insert into chat_conversations(id, type, created_by, created_at) values ('${DM_T}', 'direct', '${DANI}', '2020-01-01')`, "una conversación con created_at inventado");
  check((await uno(db, `select created_at > now() - interval '1 minute' r from chat_conversations where id = '${DM_T}'`))?.r === true, "la fecha la pone la base");
  await falla(db, JHON, `update chat_conversations set created_at = '2020-01-01' where id = '${NUEVO_G}'`, /chat_conversacion_inmutable/, "la fecha de una conversación no se cambia después");
}

// ════ 4. Dos agencias: nadie suma a alguien de la otra ═══════════════════════
{
  const OTRA = `
    insert into public.tenants(id, slug, name) values ('${T2}', 'otra', 'Otra agencia');
    insert into auth.users(id, email, raw_user_meta_data) values ('${OLGA}', 'olga@otra.test', '{"full_name":"Olga Vera"}');
    -- handle_new_user la metió en asm-tech (como a toda cuenta nueva): se la pasa a la suya.
    delete from public.tenant_members where user_id = '${OLGA}';
    insert into public.tenant_members(user_id, tenant_id) values ('${OLGA}', '${T2}');`;
  // Línea base: en prod de hoy, con una segunda agencia, sí se puede.
  const prod = await nueva("prod");
  await prod.exec(OTRA);
  const base = await probar(prod, [[JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${G1}', '${OLGA}', 'member')`]],
    `select exists (select 1 from chat_participants where conversation_id = '${G1}' and user_id = '${OLGA}') si`);
  check(base.ok && base.si === true, `línea base: en prod el admin de G1 suma a alguien de otra agencia${base.ok ? "" : ` — falló: ${base.error}`}`);

  const db = await nueva("A");
  await db.exec(OTRA);
  await falla(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${G1}', '${OLGA}', 'member')`, /chat_otra_agencia/, "el admin de G1 no suma a Olga (otra agencia)");
  await falla(db, DANI, `insert into chat_participants(conversation_id, user_id, role) values ('${G2}', '${OLGA}', 'member')`, /chat_otra_agencia/, "un miembro de un grupo abierto tampoco");
  await falla(db, "service_role", `insert into chat_participants(conversation_id, user_id, role) values ('${G1}', '${OLGA}', 'member')`, /chat_otra_agencia/, "ni con service_role");
  const DM_X = "c2000000-0000-4000-8000-000000000001";
  await anda(db, JHON, `insert into chat_conversations(id, type, created_by, tenant_id) values ('${DM_X}', 'direct', '${JHON}', '${T2}')`, "Jhon abre un directo (mandando tenant_id de la otra agencia)");
  check((await uno(db, `select tenant_id::text t from chat_conversations where id = '${DM_X}'`))?.t === T1, "la conversación queda en la agencia de Jhon, no en la que mandó el pedido");
  await anda(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${DM_X}', '${JHON}', 'admin')`, "Jhon entra a su directo");
  await falla(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${DM_X}', '${OLGA}', 'member')`, /chat_otra_agencia/, "y no puede sumar a Olga");
  const GO = "c2000000-0000-4000-8000-000000000002";
  await anda(db, OLGA, `insert into chat_conversations(id, type, name, created_by) values ('${GO}', 'group', 'De Olga', '${OLGA}')`, "Olga crea un grupo");
  check((await uno(db, `select tenant_id::text t from chat_conversations where id = '${GO}'`))?.t === T2, "el grupo de Olga queda en SU agencia");
  await anda(db, OLGA, `insert into chat_participants(conversation_id, user_id, role) values ('${GO}', '${OLGA}', 'admin')`, "Olga entra a su grupo");
  await falla(db, OLGA, `insert into chat_participants(conversation_id, user_id, role) values ('${GO}', '${JHON}', 'member')`, /chat_otra_agencia/, "Olga no suma a Jhon");
  await falla(db, JHON, `update chat_participants set conversation_id = '${GO}' where conversation_id = '${G1}' and user_id = '${JHON}'`, /chat_participacion_inmutable/, "Jhon no se muda al grupo de Olga");
  // Sin sesión de usuario (sin claims: cron, el editor de SQL; desde la B,
  // service_role ya no inserta conversaciones) la agencia sale de created_by, no de
  // la primera que haya.
  const GS = "c2000000-0000-4000-8000-000000000003";
  await anda(db, "postgres", `insert into chat_conversations(id, type, name, created_by, tenant_id) values ('${GS}', 'group', 'Del sistema', '${OLGA}', '${T1}')`, "sin sesión de usuario se crea un grupo a nombre de Olga (mandando la otra agencia)");
  check((await uno(db, `select tenant_id::text t from chat_conversations where id = '${GS}'`))?.t === T2, "queda en la agencia de Olga");
  // Con dos agencias, alguien sin ninguna no puede crear conversaciones (la base no adivina).
  const SIN = "a0000000-0000-4000-8000-000000000007";
  await db.exec(`insert into auth.users(id, email, raw_user_meta_data) values ('${SIN}', 'sin@ejemplo.test', '{"full_name":"Sin Agencia"}');
    delete from public.tenant_members where user_id = '${SIN}';`);
  await falla(db, SIN, `insert into chat_conversations(type, created_by) values ('direct', '${SIN}')`, /chat_sin_agencia/, "con dos agencias, alguien sin agencia no crea conversaciones");
  // Alguien que está en las dos: puede estar en los dos lados, pero no mezclarlos.
  await db.exec(`insert into public.tenant_members(user_id, tenant_id, created_at) values ('${CARLA}', '${T2}', now())`);
  await anda(db, OLGA, `insert into chat_participants(conversation_id, user_id, role) values ('${GO}', '${CARLA}', 'member')`, "Olga suma a Carla, que también es de su agencia");
  await falla(db, CARLA, `insert into chat_participants(conversation_id, user_id, role) values ('${GO}', '${BETO}', 'member')`, /chat_otra_agencia/, "Carla no mete a Beto (solo de asm-tech) en el grupo de Olga");
  // ⚠️ Límite conocido (documentado en la migración): la agencia de una conversación
  // nueva es la membresía MÁS VIEJA de quien la crea. Carla (T1 y T2) no puede
  // abrirle un directo a Olga (solo T2); Olga a Carla sí. Queda fijado para que el
  // arreglo, cuando haya dos agencias, se note aquí.
  const DM_CO = "c2000000-0000-4000-8000-000000000005", DM_OC = "c2000000-0000-4000-8000-000000000006";
  await anda(db, CARLA, `insert into chat_conversations(id, type, created_by) values ('${DM_CO}', 'direct', '${CARLA}')`, "límite conocido: Carla (T1 y T2) abre un directo…");
  await anda(db, CARLA, `insert into chat_participants(conversation_id, user_id, role) values ('${DM_CO}', '${CARLA}', 'admin')`, "…entra…");
  await falla(db, CARLA, `insert into chat_participants(conversation_id, user_id, role) values ('${DM_CO}', '${OLGA}', 'member')`, /chat_otra_agencia: esa persona/, "…y no puede sumar a Olga (solo T2): el directo quedó en T1, su agencia más vieja");
  await anda(db, OLGA, `insert into chat_conversations(id, type, created_by) values ('${DM_OC}', 'direct', '${OLGA}');`, "límite conocido: al revés, Olga abre el directo…");
  await anda(db, OLGA, `insert into chat_participants(conversation_id, user_id, role) values ('${DM_OC}', '${OLGA}', 'admin')`, "…entra…");
  await anda(db, OLGA, `insert into chat_participants(conversation_id, user_id, role) values ('${DM_OC}', '${CARLA}', 'member')`, "…y suma a Carla sin problema");
  // createGroupChat con alguien de otra agencia en la lista: el insert masivo de
  // miembros falla ENTERO (nadie entra) y la app borra la conversación mientras el
  // creador todavía es participante, así no queda huérfana.
  const GX = "c2000000-0000-4000-8000-000000000004";
  await anda(db, JHON, `insert into chat_conversations(id, type, name, created_by) values ('${GX}', 'group', 'Mezclado', '${JHON}')`, "grupo mezclado, paso 1");
  await anda(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${GX}', '${JHON}', 'admin')`, "grupo mezclado, paso 2: el creador");
  await falla(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${GX}', '${ANA}', 'member'), ('${GX}', '${OLGA}', 'member')`, /chat_otra_agencia/, "grupo mezclado, paso 3: con Olga en la lista, falla");
  check((await uno(db, `select count(*)::int n from chat_participants where conversation_id = '${GX}'`))?.n === 1, "y no entró nadie (tampoco Ana): el insert es uno solo");
  await anda(db, JHON, `delete from chat_conversations where id = '${GX}'`, "la app deshace borrando la conversación (useChat, createGroupChat)");
  const gx = await uno(db, `select (select count(*)::int from chat_conversations where id = '${GX}') c, (select count(*)::int from chat_participants where conversation_id = '${GX}') p`);
  check(gx?.c === 0 && gx?.p === 0, `y no queda nada huérfano (${JSON.stringify(gx)})`);
}

// ════ 5. Directos: ni tercero ni duplicado; el canónico ══════════════════════
{
  // Un par más con dos directos viejos: el más viejo SIN mensajes y otro más nuevo
  // CON un mensaje. Gana el del mensaje, aunque el otro sea más viejo.
  const DMN1 = "c3000000-0000-4000-8000-000000000011", DMN2 = "c3000000-0000-4000-8000-000000000012";
  const PAR_NUEVO = `
    insert into public.chat_conversations(id, type, created_by, created_at) values
      ('${DMN1}', 'direct', '${JHON}', '2026-09-09 10:00+00'), ('${DMN2}', 'direct', '${DANI}', '2026-09-10 10:00+00');
    insert into public.chat_participants(conversation_id, user_id, role) values
      ('${DMN1}', '${JHON}', 'admin'), ('${DMN1}', '${DANI}', 'member'), ('${DMN2}', '${DANI}', 'admin'), ('${DMN2}', '${JHON}', 'member');
    insert into public.chat_messages(conversation_id, sender_id, content, created_at) values ('${DMN2}', '${DANI}', 'el que se usa', now() - interval '5 days');`;
  const prod = await nueva("prod", PAR_NUEVO);
  const db = await nueva("A", PAR_NUEVO);
  const DUP = "c3000000-0000-4000-8000-000000000001";
  const dup = async (d: PGlite, quien: Quien) => {
    await como(d, quien, `insert into chat_conversations(id, type, created_by) values ('${DUP}', 'direct', '${JHON}')`);
    await como(d, quien, `insert into chat_participants(conversation_id, user_id, role) values ('${DUP}', '${JHON}', 'admin')`);
    await como(d, quien, `insert into chat_participants(conversation_id, user_id, role) values ('${DUP}', '${ANA}', 'member')`);
  };
  try { await dup(prod, JHON); ok.push("línea base: en prod Jhon abre un SEGUNDO directo con Ana"); }
  catch (e) { mal.push(`línea base: el directo duplicado falló en prod (${msg(e).slice(0, 90)}): el test no prueba nada`); }
  try { await dup(db, JHON); mal.push("un segundo directo Jhon–Ana entró (NO debía)"); }
  catch (e) { check(/directo_duplicado/.test(msg(e)) && codigoDe(e) === "MV409", `un segundo directo Jhon–Ana → ${codigoDe(e)} ${msg(e).slice(0, 80)}`); }
  {
    // Sin sesión de usuario tampoco. Era service_role (una edge con el cliente admin);
    // desde la B, service_role ni siquiera inserta en chat_conversations,
    // chat_participants ni chat_messages (lo prueba api_messenger_escritura.ts), así
    // que la rama sin auth.uid() de A se prueba sin claims (cron, el editor de SQL).
    const DUPS = "c3000000-0000-4000-8000-000000000004";
    const pasos: Paso[] = [["postgres", `insert into chat_conversations(id, type, created_by) values ('${DUPS}', 'direct', '${JHON}');
      insert into chat_participants(conversation_id, user_id, role) values ('${DUPS}', '${JHON}', 'admin');
      insert into chat_participants(conversation_id, user_id, role) values ('${DUPS}', '${ANA}', 'member')`]];
    const efecto = `select (select count(*) from chat_participants where conversation_id = '${DUPS}') = 2 si`;
    const a = await probar(prod, pasos, efecto), b = await probar(db, pasos, efecto);
    check(a.ok && a.si === true, `línea base: en prod, sin sesión de usuario, se arma un segundo directo Jhon–Ana${a.ok ? "" : ` — falló: ${a.error?.slice(0, 80)}`}`);
    check(!b.ok && /directo_duplicado/.test(b.error ?? "") && b.codigo === "MV409", `sin sesión de usuario el duplicado también se rechaza → ${b.ok ? "PASÓ" : `${b.codigo} ${b.error?.slice(0, 80)}`}`);
  }
  const DUP2 = "c3000000-0000-4000-8000-000000000002";
  await anda(db, ANA, `insert into chat_conversations(id, type, created_by) values ('${DUP2}', 'direct', '${ANA}')`, "Ana abre un directo…");
  await anda(db, ANA, `insert into chat_participants(conversation_id, user_id, role) values ('${DUP2}', '${ANA}', 'admin')`, "…entra…");
  await fallaCon(db, ANA, `insert into chat_participants(conversation_id, user_id, role) values ('${DUP2}', '${JHON}', 'member')`, /directo_duplicado/, "MV409", "…y el duplicado al revés (Ana → Jhon) también se rechaza");
  await falla(db, "service_role", `insert into chat_participants(conversation_id, user_id, role) values ('${DM1}', '${BETO}', 'member')`, /directo_lleno/, "un tercero en un directo, ni con service_role");
  // Dos de una vez en un directo con una sola persona: la primera fila entra, la
  // segunda ve a la primera (misma sentencia) y queda afuera. Todo vuelve atrás.
  await falla(db, ANA, `insert into chat_participants(conversation_id, user_id, role) values ('${DUP2}', '${BETO}', 'member'), ('${DUP2}', '${CARLA}', 'member')`, /directo_lleno/, "dos de una vez en un directo: el segundo es un tercero");
  check((await uno(db, `select count(*)::int n from chat_participants where conversation_id = '${DUP2}'`))?.n === 1, "y no entró ninguno de los dos");
  const base3 = await probar(prod, [[ANA, `insert into chat_conversations(id, type, created_by) values ('${DUP2}', 'direct', '${ANA}');
    insert into chat_participants(conversation_id, user_id, role) values ('${DUP2}', '${ANA}', 'admin');
    insert into chat_participants(conversation_id, user_id, role) values ('${DUP2}', '${BETO}', 'member'), ('${DUP2}', '${CARLA}', 'member')`]],
    `select (select count(*) from chat_participants where conversation_id = '${DUP2}') = 3 si`);
  check(base3.ok && base3.si === true, `línea base: en prod un directo de tres personas entra de una${base3.ok ? "" : ` — falló: ${base3.error?.slice(0, 90)}`}`);
  // Los duplicados viejos (anteriores al candado): gana el del mensaje más reciente;
  // sin mensajes, el más viejo.
  const d = async (yo: string, otro: string) => (await como(db, yo, `select public.chat_directo_con('${otro}') d`))[0]?.d;
  check(await d(BETO, CARLA) === DMV2 && await d(CARLA, BETO) === DMV2, "con dos directos viejos Beto–Carla, los dos lados eligen el del mensaje más reciente (DMV2)");
  check(await d(DANI, ANA) === DMV3 && await d(ANA, DANI) === DMV3, "sin mensajes, los dos lados eligen el más viejo (DMV3)");
  check(await d(JHON, DANI) === DMN2 && await d(DANI, JHON) === DMN2, "uno con mensajes y otro sin: gana el que tiene mensajes aunque sea más nuevo (DMN2)");
  const DUP3 = "c3000000-0000-4000-8000-000000000003";
  await anda(db, BETO, `insert into chat_conversations(id, type, created_by) values ('${DUP3}', 'direct', '${BETO}')`, "Beto abre otro directo…");
  await anda(db, BETO, `insert into chat_participants(conversation_id, user_id, role) values ('${DUP3}', '${BETO}', 'admin')`, "…entra…");
  await falla(db, BETO, `insert into chat_participants(conversation_id, user_id, role) values ('${DUP3}', '${CARLA}', 'member')`, /directo_duplicado/, "…y con Carla ya no se puede un tercero");
}

// ════ 6. No leídos con tope ═══════════════════════════════════════════════════
{
  const MUCHOS = `
    update public.chat_participants set last_read_at = now() - interval '10 days' where user_id = '${JHON}';
    -- Y una conversación al día (G2: leyó después del último mensaje), para la fila con 0.
    insert into public.chat_participants(conversation_id, user_id, role, last_read_at) values ('${G2}', '${JHON}', 'member', now());
    insert into public.chat_messages(conversation_id, sender_id, content, created_at)
      select '${DM1}', '${ANA}', 'm' || g, now() - interval '1 day' + g * interval '1 second' from generate_series(1, 149) g;
    insert into public.chat_messages(conversation_id, sender_id, content, created_at)
      select '${G1}', '${BETO}', 'g' || g, now() - interval '1 day' + g * interval '1 second' from generate_series(1, 2) g;`;
  const cuenta = async (d: PGlite) => Object.fromEntries((await como(d, JHON, `select conversation_id::text c, unread_count::int n from public.get_unread_counts('${JHON}')`)).map((f) => [f.c, f.n]));
  const prod = await nueva("prod", MUCHOS);
  const db = await nueva("A", MUCHOS);
  const a = await cuenta(prod), b = await cuenta(db);
  check(a[DM1] === 150, `línea base: con 150 no leídos, prod cuenta 150 (${a[DM1]})`);
  check(b[DM1] === 101, `con la migración cuenta 101: la UI pinta «99+» igual (${b[DM1]})`);
  // G1: 2 nuevos de Beto + M_G1 (Ana) + M_G1_CITA (Beto) = 4; los tres borrados no cuentan.
  check(a[G1] === b[G1] && b[G1] === 4, `los que no llegan al tope dan lo mismo que antes (G1: ${a[G1]} → ${b[G1]})`);
  check(Object.keys(a).length === 3 && Object.keys(b).length === 3 && a[G2] === 0 && b[G2] === 0,
    `las mismas conversaciones con y sin tope, también la de 0 no leídos (${JSON.stringify(a)} → ${JSON.stringify(b)})`);
  const cero = await como(db, JHON, `select unread_count::int n from public.get_unread_counts('${JHON}') where unread_count = 0`);
  const ceroAntes = await como(prod, JHON, `select unread_count::int n from public.get_unread_counts('${JHON}') where unread_count = 0`);
  check(ceroAntes.length === 1 && cero.length === 1, `la conversación sin no leídos sigue saliendo, con 0 (${ceroAntes.length} → ${cero.length})`);
  const ajeno = await como(db, ANA, `select count(*)::int n from public.get_unread_counts('${JHON}')`);
  check(ajeno[0]?.n === 0, "los no leídos de otro siguen sin verse");
}

// ════ 7. Los topes: el grupo 31 y el directo 101 en 24 horas ═════════════════
{
  const grupo = (d: PGlite, quien: string, i: number, extra = "") =>
    como(d, quien, `insert into chat_conversations(type, name, created_by${extra ? ", created_at" : ""}) values ('group', 'g${i}', '${quien}'${extra ? `, '${extra}'` : ""})`);
  const prod = await nueva("prod");
  const db = await nueva("A");
  let hechos = 0;
  for (let i = 1; i <= 30; i++) { try { await grupo(db, JHON, i); hechos++; } catch { /* abajo */ } }
  check(hechos === 30, `Jhon crea 30 grupos en el día (${hechos})`);
  // MV429 con {limite, reintentar_en}: el PR 2 lo pasa a 429 con Retry-After.
  const leerDetalle = (d: string | null): Fila => { try { return JSON.parse(d ?? ""); } catch { return {}; } };
  const d31 = leerDetalle(await fallaCon(db, JHON, `insert into chat_conversations(type, name, created_by) values ('group', 'g31', '${JHON}')`, /chat_tope_grupos/, "MV429", "el grupo 31 se rechaza"));
  check(d31.limite === "person_new_groups_day" && d31.reintentar_en > 86000 && d31.reintentar_en <= 86400,
    `…y el detail dice qué tope y cuándo se libera un lugar: cuando la primera de las 30 altas cumpla 24 horas (${JSON.stringify(d31)})`);
  await falla(db, JHON, `insert into chat_conversations(type, name, created_by, created_at) values ('group', 'g31', '${JHON}', '2020-01-01')`, /chat_tope_grupos/, "…también con un created_at atrasado");
  await anda(db, JHON, `insert into chat_conversations(type, created_by) values ('direct', '${JHON}')`, "los grupos no cuentan para el tope de directos");
  await anda(db, ANA, `insert into chat_conversations(type, name, created_by) values ('group', 'de Ana', '${ANA}')`, "el tope es por persona: Ana crea el suyo");
  await anda(db, "postgres", `insert into chat_conversations(type, name, created_by) values ('group', 'del sistema', '${JHON}')`, "sin sesión de usuario (sin claims) no hay tope");
  check((await uno(db, `select tenant_id::text t from chat_conversations where name = 'del sistema'`))?.t === T1, "y la conversación queda en la agencia de created_by");
  await falla(db, JHON, `select count(*) from chat_conversaciones_creadas`, /permission denied/, "la tabla de altas no se lee desde la app");
  await falla(db, JHON, `delete from chat_conversaciones_creadas where user_id = '${JHON}'`, /permission denied/, "ni se borra para recuperar el cupo");
  // Las 24 horas son corridas: un alta de hace 23 horas cuenta, una de hace 25 no.
  // Nadie cambia created_at de una conversación (A3): el banco mueve las altas.
  await db.exec(`update chat_conversaciones_creadas set created_at = now() - interval '23 hours' where user_id = '${JHON}' and type = 'group'`);
  const d23 = leerDetalle(await fallaCon(db, JHON, `insert into chat_conversations(type, name, created_by) values ('group', 'a las 23 horas', '${JHON}')`, /chat_tope_grupos/, "MV429", "30 grupos de hace 23 horas todavía cuentan"));
  check(d23.reintentar_en > 3500 && d23.reintentar_en <= 3601, `…y se libera un lugar en una hora (reintentar_en ${d23.reintentar_en})`);
  await db.exec(`update chat_conversaciones_creadas set created_at = now() - interval '25 hours' where user_id = '${JHON}' and type = 'group'`);
  await anda(db, JHON, `insert into chat_conversations(type, name, created_by) values ('group', 'al otro día', '${JHON}')`, "pasadas 24 horas, Jhon vuelve a poder");
  // Línea base: en prod no hay tope.
  let base = 0;
  for (let i = 1; i <= 31; i++) { try { await grupo(prod, JHON, i); base++; } catch { /* nada */ } }
  check(base === 31, `línea base: en prod el grupo 31 entra (${base})`);
}
{
  // Crear y borrar no devuelve el cupo: se cuentan las ALTAS, no lo que sigue vivo.
  // Cada vuelta, con 3 personas, pega en Realtime (conversación + 3 participaciones,
  // y sus borrados); con la cuenta de filas vivas no había límite.
  const vuelta = async (d: PGlite, i: number) => {
    const id = `c5000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    await como(d, JHON, `insert into chat_conversations(id, type, name, created_by) values ('${id}', 'group', 'spam${i}', '${JHON}')`);
    await como(d, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${id}', '${JHON}', 'admin')`);
    await como(d, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${id}', '${ANA}', 'member'), ('${id}', '${BETO}', 'member')`);
    await como(d, JHON, `select public.delete_conversation_cascade('${id}')`);
  };
  const prod = await nueva("prod");
  const db = await nueva("A");
  let base = 0, hechas = 0;
  for (let i = 1; i <= 31; i++) { try { await vuelta(prod, i); base++; } catch { /* nada */ } }
  check(base === 31, `línea base: en prod se crean y borran 31 grupos en el día (${base})`);
  for (let i = 1; i <= 30; i++) { try { await vuelta(db, i); hechas++; } catch { /* abajo */ } }
  check(hechas === 30 && (await uno(db, `select count(*)::int n from chat_conversations where created_by = '${JHON}' and name like 'spam%'`))?.n === 0,
    `Jhon crea y borra 30 grupos (${hechas}), y no queda ninguno vivo`);
  await falla(db, JHON, `insert into chat_conversations(type, name, created_by) values ('group', 'spam31', '${JHON}')`, /chat_tope_grupos/, "el grupo 31 se rechaza igual: borrar no devuelve el cupo");
  // 30 directos del día no le quitan cupo a los grupos (ni al revés, arriba).
  const db2 = await nueva("A");
  for (let i = 1; i <= 30; i++) await como(db2, JHON, `insert into chat_conversations(type, created_by) values ('direct', '${JHON}')`);
  await anda(db2, JHON, `insert into chat_conversations(type, name, created_by) values ('group', 'después de 30 directos', '${JHON}')`, "30 directos del día no bloquean un grupo");
  // El directo 101: creados y borrados, siguen contando.
  const db3 = await nueva("A");
  let directos = 0;
  for (let i = 1; i <= 100; i++) {
    const id = `c6000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    try {
      await como(db3, JHON, `insert into chat_conversations(id, type, created_by) values ('${id}', 'direct', '${JHON}')`);
      await como(db3, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${id}', '${JHON}', 'admin')`);
      await como(db3, JHON, `delete from chat_conversations where id = '${id}'`);
      directos++;
    } catch { /* abajo */ }
  }
  check(directos === 100 && (await uno(db3, `select count(*)::int n from chat_conversations where id::text like 'c6000000%'`))?.n === 0,
    `Jhon abre y borra 100 directos en el día (${directos}), y no queda ninguno`);
  const d101 = await fallaCon(db3, JHON, `insert into chat_conversations(type, created_by) values ('direct', '${JHON}')`, /chat_tope_directos/, "MV429", "el directo 101 se rechaza");
  let d101j: Fila = {};
  try { d101j = JSON.parse(d101 ?? ""); } catch { /* abajo */ }
  check(d101j.limite === "person_new_directs_day" && d101j.reintentar_en > 0 && d101j.reintentar_en <= 86400,
    `…con su propio límite en el detail (${JSON.stringify(d101j)})`);
  const prod3 = await nueva("prod");
  let baseD = 0;
  for (let i = 1; i <= 101; i++) { try { await como(prod3, JHON, `insert into chat_conversations(type, created_by) values ('direct', '${JHON}')`); baseD++; } catch { /* nada */ } }
  check(baseD === 101, `línea base: en prod el directo 101 entra (${baseD})`);
  // Lo que ya se creó en las últimas 24 horas cuenta desde que se aplica la migración
  // (30 grupos de hace 20 horas); lo de hace 25 horas, no.
  const HOY = Array.from({ length: 30 }, (_, i) => `('c7000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}', 'group', 'hoy${i}', '${BETO}', now() - interval '20 hours')`)
    .concat([`('c7000000-0000-4000-8000-000000000099', 'group', 'ayer', '${BETO}', now() - interval '25 hours')`]).join(",\n");
  const db4 = await nueva("A", `insert into public.chat_conversations(id, type, name, created_by, created_at) values ${HOY};`);
  check((await uno(db4, `select count(*)::int n from chat_conversaciones_creadas where user_id = '${BETO}'`))?.n === 30, "la migración siembra las altas de las últimas 24 horas (30 de hace 20 horas, no la de hace 25)");
  await falla(db4, BETO, `insert into chat_conversations(type, name, created_by) values ('group', 'el 31', '${BETO}')`, /chat_tope_grupos/, "y Beto, con 30 grupos de hoy de antes de la migración, ya no crea el 31");
}

// ════ 8. La vuelta atrás que documenta la migración ══════════════════════════
// Lo que la vuelta atrás deja distinto de prod. Es la lista «Quedan» de la
// cabecera de la migración, objeto por objeto: si la vuelta atrás deja algo más
// (o devuelve algo de esto), el banco falla y hay que actualizar las dos.
const QUEDAN_TRAS_LA_VUELTA = [
  "CAMBIA función public.delete_chat_message(p_message_id uuid)",
  "CAMBIA función public.get_unread_counts(_user_id uuid)",
  "FALTA política chat_messages.Users can delete their own messages",
  "SOBRA columna chat_conversaciones_creadas.created_at",
  "SOBRA columna chat_conversaciones_creadas.id",
  "SOBRA columna chat_conversaciones_creadas.type",
  "SOBRA columna chat_conversaciones_creadas.user_id",
  "SOBRA columna chat_conversations.tenant_id",
  "SOBRA columna chat_message_deletions.content_rich",
  "SOBRA constraint chat_conversaciones_creadas.chat_conversaciones_creadas_pkey",
  "SOBRA constraint chat_conversations.chat_conversations_tenant_id_fkey",
  "SOBRA función public.chat_conversations_agencia()",
  "SOBRA función public.chat_directo_con(_otro uuid)",
  "SOBRA función public.chat_llave_de_par(_a uuid, _b uuid)",
  "SOBRA función public.chat_messages_al_insertar()",
  "SOBRA función public.chat_participants_agencia()",
  "SOBRA función public.profiles_nombre_lo_cambia_un_admin()",
  "SOBRA relación chat_conversaciones_creadas",
  "SOBRA relación chat_conversaciones_creadas_id_seq",
  "SOBRA trigger profiles.profiles_nombre_lo_cambia_un_admin",
  "SOBRA índice chat_conversaciones_creadas_persona",
  "SOBRA índice chat_conversaciones_creadas_pkey",
];
// Una foto del catálogo (public y las funciones de auth), objeto por objeto.
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
{
  check(/^begin;/.test(VUELTA.trim()) && /commit;$/.test(VUELTA.trim()), `la vuelta atrás está en la migración, entera y en una transacción (${VUELTA.split("\n").length} líneas)`);
  const conDefault = /alter column tenant_id set default/.test(VUELTA);
  const posDefault = VUELTA.indexOf("alter column tenant_id set default"), posDrop = VUELTA.indexOf("drop trigger if exists chat_conversations_agencia");
  check(conDefault && posDefault >= 0 && posDrop > posDefault, "le devuelve el default a tenant_id ANTES de sacar chat_conversations_agencia");
  // Línea base que puede fallar: sin devolver el default (lo que decía el PR al
  // principio), nadie abre un directo ni crea un grupo.
  const SIN_DEFAULT = VUELTA.replace(/do \$\$ begin\n\s*execute format\('alter table public\.chat_conversations alter column tenant_id set default[\s\S]*?end \$\$;\n/, "");
  check(SIN_DEFAULT !== VUELTA, "(el banco sabe sacarle el default a la vuelta atrás)");
  {
    const db = await nueva("A");
    await db.exec(SIN_DEFAULT);
    await falla(db, JHON, `insert into chat_conversations(type, created_by) values ('direct', '${JHON}')`, /null value in column "tenant_id"/,
      "línea base: una vuelta atrás que solo saca los triggers deja a todos sin abrir un directo");
    await falla(db, JHON, `insert into chat_conversations(type, name, created_by) values ('group', 'g', '${JHON}')`, /null value in column "tenant_id"/,
      "línea base: …ni crear un grupo");
  }
  const db = await nueva("A");
  try { await db.exec(VUELTA); ok.push("la vuelta atrás corre sobre la base con la migración"); }
  catch (e) { await db.exec("rollback").catch(() => {}); mal.push(`la vuelta atrás falló: ${msg(e).slice(0, 160)}`); }
  const quedan = await q(db, `select tgname, tgenabled::text e from pg_trigger where not tgisinternal and tgname in ${enSql(TRIGGERS_A)} order by 1`);
  check(quedan.length === 1 && quedan[0].tgname === "profiles_nombre_lo_cambia_un_admin" && quedan[0].e === "D",
    `se fueron los ${TRIGGERS_A.length - 1} triggers nuevos del chat y el de perfiles quedó apagado (${quedan.map((t) => `${t.tgname}:${t.e}`).join(", ")})`);
  const guarda = (await q(db, PRODSRC_SQL)).find((f) => f.k === "public.guard_chat_message_update")?.h;
  check(guarda === funcionesProd.get("public.guard_chat_message_update"), "guard_chat_message_update volvió byte a byte a la de prod");
  // Sin las del cerco de la B (api_fabricada_*), que la vuelta atrás de A no toca.
  const polPart = (await q(db, POLITICAS_SQL.replace("where schemaname='public'", "where schemaname='public' and policyname not like 'api\\_fabricada\\_%'"))).find((f) => f.k === "chat_participants")?.h;
  check(polPart === politicasProd.get("chat_participants"), "las políticas de chat_participants volvieron a ser las de prod (sin contar el cerco de la B)");
  // La app sigue andando.
  const VDM = "c8000000-0000-4000-8000-000000000001", VG = "c8000000-0000-4000-8000-000000000002";
  await anda(db, JHON, `insert into chat_conversations(id, type, created_by) values ('${VDM}', 'direct', '${JHON}')`, "vuelta atrás: directo, paso 1");
  await anda(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${VDM}', '${JHON}', 'admin')`, "vuelta atrás: directo, paso 2");
  await anda(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${VDM}', '${BETO}', 'member')`, "vuelta atrás: directo, paso 3");
  check((await uno(db, `select tenant_id::text t from chat_conversations where id = '${VDM}'`))?.t === T1, "vuelta atrás: el directo nuevo igual queda en la agencia (el default)");
  check(await (async () => (await como(db, JHON, `select public.chat_directo_con('${BETO}') d`))[0]?.d)() === VDM, "vuelta atrás: chat_directo_con lo encuentra (el frontend nuevo la usa)");
  await anda(db, JHON, `insert into chat_conversations(id, type, name, created_by) values ('${VG}', 'group', 'Después', '${JHON}')`, "vuelta atrás: grupo, paso 1");
  await anda(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${VG}', '${JHON}', 'admin')`, "vuelta atrás: grupo, paso 2");
  await anda(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${VG}', '${ANA}', 'member'), ('${VG}', '${CARLA}', 'member')`, "vuelta atrás: grupo, paso 3 (alta masiva)");
  const VM = "e8000000-0000-4000-8000-000000000001";
  await anda(db, ANA, `insert into chat_messages(id, conversation_id, sender_id, content) values ('${VM}', '${VG}', '${ANA}', 'hola')`, "vuelta atrás: mandar un mensaje");
  await anda(db, ANA, `update chat_messages set content = 'hola, editado', is_edited = true, content_rich = null where id = '${VM}'`, "vuelta atrás: editarlo");
  const vb = await anda(db, ANA, `select public.delete_chat_message('${VM}') r`, "vuelta atrás: borrarlo por la RPC");
  check(vb?.[0]?.r?.ok === true, `vuelta atrás: la RPC de borrar sigue andando (${JSON.stringify(vb?.[0]?.r)})`);
  await anda(db, ANA, `update profiles set status = 'busy' where id = '${ANA}'`, "vuelta atrás: el perfil se sigue actualizando");
  // El trigger de perfiles, apagado, ya no frena nada: como en prod.
  await anda(db, ANA, `update profiles set full_name = 'Ana R.' where id = '${ANA}'`, "vuelta atrás: el nombre se vuelve a cambiar desde la app, como en prod (el trigger quedó apagado)");
  // Se puede correr dos veces (por si la primera se cortó después del commit).
  try { await db.exec(VUELTA); ok.push("la vuelta atrás se puede correr dos veces"); }
  catch (e) { await db.exec("rollback").catch(() => {}); mal.push(`la vuelta atrás no se puede correr dos veces: ${msg(e).slice(0, 120)}`); }
}
{
  // Lo que queda distinto de prod es EXACTAMENTE lo que dice la cabecera. Sobre
  // prod + A sola (la cadena podría sumar cambios de otras migraciones).
  const prod = new PGlite();
  await prod.exec(ESQUEMA);
  await prod.exec(SEMILLA);
  const conVuelta = new PGlite();
  await conVuelta.exec(ESQUEMA);
  await conVuelta.exec(SEMILLA);
  await aplicar(conVuelta, NOMBRE_A, MIG_A);
  await conVuelta.exec(VUELTA);
  const quedan = diferencias(await foto(prod), await foto(conVuelta));
  const faltan = QUEDAN_TRAS_LA_VUELTA.filter((x) => !quedan.includes(x)), sobran = quedan.filter((x) => !QUEDAN_TRAS_LA_VUELTA.includes(x));
  check(faltan.length === 0 && sobran.length === 0,
    `después de la vuelta atrás, lo que queda distinto de prod son los ${QUEDAN_TRAS_LA_VUELTA.length} objetos anotados (${quedan.length}${sobran.length ? `; sin anotar: ${sobran.join(" · ")}` : ""}${faltan.length ? `; anotados que ya no quedan: ${faltan.join(" · ")}` : ""})`);
  // Por eso, después de una vuelta atrás, se arregla con una migración NUEVA.
  try { await conVuelta.exec("begin;\n" + MIG_A + "\ncommit;"); mal.push("la migración se volvió a aplicar después de la vuelta atrás (la cabecera dice que no)"); }
  catch (e) {
    await conVuelta.exec("rollback").catch(() => {});
    check(/already exists/.test(msg(e)), `después de la vuelta atrás, la misma migración no vuelve a correr → ${msg(e).slice(0, 90)}`);
  }
}

console.log(ok.map((m) => "✓ " + m).join("\n"));
if (mal.length) { console.log(mal.map((m) => "✗ " + m).join("\n")); console.log(`\n${ok.length} ok, ${mal.length} MAL`); Deno.exit(1); }
console.log(`\n${ok.length} ok`);
