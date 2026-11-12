// La escritura del Messenger por API DE PUNTA A PUNTA (PR 4): el public-api de verdad
// (supabase/functions/public-api/index.ts, su Deno.serve capturado) contra la base de
// verdad (PGlite con el esquema de PROD de los fixtures + las migraciones reales, la
// A, el 1b y la B), con supabase-js de verdad en el medio. Entre los dos, un PostgREST
// mínimo (el fetch de esta prueba) que hace lo que hace el de Supabase con cada pedido:
// verifica el JWT con el secreto, abre una transacción con el rol y los claims del
// token (request.jwt.claims) y corre la consulta o la RPC con parámetros con nombre.
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/api_messenger_escritura_edge.ts
//
// Lo que prueba que ningún test con clientes falsos puede probar:
//  · que el token que fabrica el edge (mvf + mvk) es el que la base reconoce como la
//    key: la marca «vino por API» sale con el nombre visible de api_keys;
//  · que los nombres y los parámetros de las RPC del edge son los de la migración B;
//  · que los SQLSTATE y el detail que lanza la base son los que traduce el edge (cada
//    fila de la tabla §1.8 que se puede provocar con un solo pedido);
//  · la repetición con la misma Idempotency-Key, también después de un corte de red
//    con la escritura ya hecha (outcome_unknown → la repetición da el mismo mensaje).
// PGlite tiene UNA conexión: dos pedidos a la vez no se pueden probar aquí (el 429
// concurrent_write lo razona y lo prueba por partes el banco de la B).
//
// La base de prueba es la del banco de la B (api_messenger_escritura.ts), con menos
// gente: la cadena de migraciones se arma con el mismo criterio. Sale con código 1 si
// algo falla. Nunca toca prod.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FIXTURE = leer("./fixtures/prod_chat_api_20260928.sql");
const COMPLEMENTO = leer("./fixtures/prod_api_escritura_20261001.sql");
const NOMBRE_B = "20261001200000_api_messenger_escritura.sql";

// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const ok: string[] = [];
const mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);

// ─── La cadena de migraciones (el mismo criterio que el banco de la B) ───────
const FIXTURE_HASTA = "20260929180000";
const TABLAS = ["app_flags", "chat_archived", "chat_conversations", "chat_join_requests", "chat_message_deletions", "chat_messages",
  "chat_participants", "chat_pinned", "chat_reactions", "chat_read_receipts", "chat_space_conversations", "chat_spaces",
  "notification_preferences", "notification_settings", "notifications", "profiles", "push_subscriptions", "tenant_members", "tenants",
  "user_roles", "api_keys", "role_groups", "chat_conversaciones_creadas", "api_escritura_cupos", "api_escritura_idem"];
const sinComentarios = (s: string) => s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const MIG_B = Deno.readTextFileSync(new URL(`../migrations/${NOMBRE_B}`, import.meta.url));
const FUNCIONES = new Set(["current_tenant_id", "delete_chat_message", "delete_conversation_cascade", "get_karma_profile", "get_unread_counts",
  "guard_chat_message_update", "handle_new_user", "is_chat_admin", "is_chat_participant", "notify_chat_message", "push_chat_message",
  "chat_conversations_agencia", "chat_participants_agencia", "chat_messages_al_insertar", "chat_directo_con", "chat_llave_de_par",
  "profiles_nombre_lo_cambia_un_admin", "api_key_persona_vigente", "api_key_vigente", "api_key_consumir", "api_keys_reglas_messenger",
  "api_keys_validar_actua_como", "api_keys_asignar_agencia",
  ...[...sinComentarios(MIG_B).matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)/gi)].map((m) => m[1].toLowerCase())]);
const DE_INTERES = new Set([...TABLAS, ...FUNCIONES]);
function tocaAlgo(sql: string): boolean {
  const s = sinComentarios(sql);
  const n = String.raw`(?:only\s+)?(?:public\.)?"?(\w+)`;
  const patrones = [
    String.raw`\b(?:alter|drop)\s+table\s+(?:if\s+exists\s+)?` + n,
    String.raw`\bcreate\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(?:\w+\s+)?on\s+` + n,
    String.raw`\b(?:create(?:\s+or\s+replace)?|drop|alter)\s+(?:constraint\s+)?trigger\b[^;]*?\bon\s+` + n,
    String.raw`\b(?:create|drop|alter)\s+policy\b[^;]*?\bon\s+` + n,
    String.raw`\b(?:create(?:\s+or\s+replace)?|drop|alter)\s+function\s+(?:if\s+exists\s+)?` + n,
    String.raw`\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+` + n,
    String.raw`\b(?:grant|revoke)\b[^;]*?\bon\s+(?:table\s+|function\s+)?` + n,
    String.raw`\block\s+table\s+` + n,
  ].map((p) => new RegExp(p, "gi"));
  return patrones.some((p) => [...s.matchAll(p)].some((m) => DE_INTERES.has(m[1].toLowerCase())));
}
// Migraciones que tocan objetos de este banco pero necesitan tablas que sus fixtures no traen.
// Se prueban en su propio banco, con el motivo al lado.
const NO_CARGAN_AQUI: Record<string, string> = {
  "20261111120000_backstage_equipo.sql":
    "Backstage manda el equipo (POST /equipo/sync): el interruptor, la bitácora y las RPC api_equipo_*. Entra a " +
    "esta cadena solo porque cambia rol, nivel, horario y la papelera de profiles/user_roles y lee api_keys, pero " +
    "usa es_admin_o_dueno, roles_config, tenant_owners y cuenta_eventos, que este fixture no trae; no toca nada del " +
    "Messenger. Se prueba en su propio banco, equipo_backstage.ts.",
  "20261111030000_fuera_de_cowork_solo_su_turno.sql":
    "Cowork: el arreglo de «fuera de Cowork» (solo si entró para su turno). Entra a esta cadena solo porque su " +
    "vigía inserta avisos en notifications, pero usa las tablas del reloj de Cowork y es_admin_o_dueno, que este " +
    "fixture no trae; no toca nada del Messenger.",
  "20261111130000_sin_blu.sql":
    "Blu: se apagan los cron que buscaban a Blu (Alvaro cortó la conexión). Usa pg_cron, que este fixture no " +
    "trae; no toca nada del Messenger.",
  "20261111140000_caja_negra_de_subidas.sql":
    "Drive: caja negra de las subidas de las modelos (drive_aportar_intentos) y aviso a quien creó el link si " +
    "una subida se traba. Usa pg_cron e inserta notificaciones; no toca nada del Messenger.",
  "20261111150000_costos_y_conexiones.sql":
    "Costos y conexiones (solo el dueño): tablas de costos, aviso si un servicio se dispara y conexiones_estado(). Usa " +
    "pg_cron, es_dueno y lee cron.job; inserta notificaciones. No toca nada del Messenger.",
  "20261111160000_costos_cobros.sql":
    "Costos: cada cobro de 2026 (costos_cobros) y el día de cobro de cada servicio, para el tablero del dueño. " +
    "Depende de costos_servicios y es_dueno; no toca nada del Messenger.",
  "20261111170000_costos_sin_claude.sql":
    "Costos: se apaga Claude de la cuenta (decisión de Alvaro). Depende de costos_servicios; no toca el Messenger.",
  "20261111180000_costos_consumo_de_maven.sql":
    "Costos: cada servicio vale lo que consume Maven (no la factura completa) y dice si se revisó. Depende de " +
    "costos_servicios y costos_cobros; no toca el Messenger.",
  "20261111220000_costos_cuentas_atadas.sql":
    "Costos: las cuentas atadas a cada servicio (costos_cuentas, solo el dueño). Se siembra leyendo mail_credentials, " +
    "profiles, auth y buzones_por_borrar, que este fixture no trae completos; no toca el Messenger.",
  "20261111230000_argos_minuto_a_minuto.sql":
    "Argos minuto a minuto: argos_jornada_cruda entrega lo crudo del turno (tramos del reloj de Cowork, pausas, " +
    "salidas de Cowork, pantallazos fuera de lugar y alertas) a quien puede_vigilar_a deja. Solo lectura y una " +
    "función nueva; usa las tablas del reloj de Cowork y de Argos, que este fixture no trae; no toca el Messenger.",
  "20261111190000_agencias_conectadas.sql":
    "Agencias conectadas: la plataforma de cada agencia manda sus roles (roles_config.origen), los pendientes, " +
    "lee horas y notas, y recibe avisos por webhook (triggers en user_roles, profiles y tenant_members). Entra a " +
    "esta cadena por esos triggers y por api_keys, pero usa roles_config, role_permissions, el reloj de Cowork, " +
    "Vault y pg_cron, que este fixture no trae; no toca nada del Messenger. Se prueba en su propio banco, " +
    "agencias_conectadas.ts.",
  "20261111200000_rrhh_copia_de_avisos.sql":
    "RR. HH. recibe copia de los avisos de vigilancia (se salió de Cowork) y se le prende el push. Entra a esta " +
    "cadena solo porque su vigía inserta avisos en notifications, pero usa las tablas del reloj de Cowork y " +
    "es_admin_o_dueno, que este fixture no trae; no toca nada del Messenger.",
  "20261111210000_monitoreo_en_vivo.sql":
    "Monitoreo en vivo: los avisos de «se salió de Cowork» abren la vista en vivo, «Revisado ✓» y «Avisarle» por " +
    "RPC, y supervisores/RR. HH. ven las fotos de su gente. Entra a esta cadena solo porque su vigía inserta avisos " +
    "en notifications, pero usa las tablas del reloj de Cowork, Argos y es_admin_o_dueno, que este fixture no trae; " +
    "no toca nada del Messenger.",
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
    "(ASM Tech → Kash): el Messenger y su API usan el id de la agencia, nunca el nombre. Se prueba en agencia_lineas.ts.",
};
const DIR = new URL("../migrations/", import.meta.url);
const CADENA = [...Deno.readDirSync(DIR)].map((e) => e.name)
  .filter((x) => /^\d{14}_\w+\.sql$/.test(x) && x.slice(0, 14) > FIXTURE_HASTA && !NO_CARGAN_AQUI[x]).sort()
  .map((n) => ({ n, sql: Deno.readTextFileSync(new URL(n, DIR)) }))
  .filter((m) => m.n === NOMBRE_B || tocaAlgo(m.sql));

// ─── La gente, las conversaciones y las keys ─────────────────────────────────
const T1 = "10000000-0000-4000-8000-000000000001";
const JHON = "a0000000-0000-4000-8000-000000000001";
const ANA = "a0000000-0000-4000-8000-000000000002";
const BETO = "a0000000-0000-4000-8000-000000000003";
const DANI = "a0000000-0000-4000-8000-000000000005";
const ALVARO = "a0000000-0000-4000-8000-000000000006"; // la persona de «BLU»
const NUEVA = "a0000000-0000-4000-8000-000000000007";  // alta después de la migración, sin sello de admin
const BAJA = "a0000000-0000-4000-8000-000000000009";
const DM_AJ = "c0000000-0000-4000-8000-000000000001";
const G = "c0000000-0000-4000-8000-000000000003";
const G_ANUNCIOS = "c0000000-0000-4000-8000-000000000004";
const G_SIN = "c0000000-0000-4000-8000-000000000007";
const M_G_ANA = "e0000000-0000-4000-8000-000000000001";
const M_G_HILO = "e0000000-0000-4000-8000-000000000002";
const M_SIN = "e0000000-0000-4000-8000-000000000004";
const M_ALV_MANO = "e0000000-0000-4000-8000-000000000005";
const I_BLU = "30000000-0000-4000-8000-000000000001";
const LLAVES = {
  BLU: { id: "20000000-0000-4000-8000-000000000001", quien: ALVARO, scopes: "{messenger:read,messenger:write}", nombre: "BLU", integracion: I_BLU },
  BLU2: { id: "20000000-0000-4000-8000-000000000002", quien: ALVARO, scopes: "{messenger:read,messenger:write}", nombre: "BLU", integracion: I_BLU },
  WEB: { id: "20000000-0000-4000-8000-000000000003", quien: ALVARO, scopes: "{messenger:read,messenger:write}", nombre: "Kash Web", integracion: null },
  LEE: { id: "20000000-0000-4000-8000-000000000005", quien: ALVARO, scopes: "{messenger:read}", nombre: null, integracion: null },
  CREA: { id: "20000000-0000-4000-8000-000000000006", quien: ALVARO, scopes: "{creators:read}", nombre: null, integracion: null },
} as const;
type NombreDeLlave = keyof typeof LLAVES;
const crudo = (k: NombreDeLlave) => `mvk_live_banco${k.toLowerCase()}${"0".repeat(30)}`;
async function sha256hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

const persona = (id: string, nombre: string, extra = "'{}', '2026-09-01 10:00+00'") =>
  `('${id}', '${nombre.toLowerCase().replace(/ /g, ".")}@ejemplo.test', '{"full_name":"${nombre}"}', ${extra})`;
const SEMILLA = `
insert into public.tenants(id, slug, name) values ('${T1}', 'asm-tech', 'ASM Tech');
insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data, created_at) values
  ${persona(JHON, "Jhon Lopez")}, ${persona(ANA, "Ana Ruiz")}, ${persona(BETO, "Beto Paz")}, ${persona(DANI, "Dani Mora")},
  ${persona(ALVARO, "Alvaro Diaz")}, ${persona(NUEVA, "Nora Vidal", "'{}', now()")}, ${persona(BAJA, "Bruno Sanz")};
update public.profiles set deleted_at = now() where id = '${BAJA}';
insert into public.role_groups(role_name, is_admin) values ('admin', true), ('employee', false);
insert into public.user_roles(user_id, role) values ('${JHON}', 'admin');
insert into public.chat_conversations(id, type, name, created_by, created_at, msg_permission) values
  ('${DM_AJ}', 'direct', null, '${ALVARO}', '2026-09-01 10:00+00', 'all'),
  ('${G}', 'group', 'Grupo', '${ALVARO}', '2026-09-02 10:00+00', 'all'),
  ('${G_ANUNCIOS}', 'group', 'Anuncios', '${JHON}', '2026-09-02 11:00+00', 'admins'),
  ('${G_SIN}', 'group', 'Sin Alvaro', '${ANA}', '2026-09-04 10:00+00', 'all');
insert into public.chat_participants(conversation_id, user_id, role) values
  ('${DM_AJ}', '${ALVARO}', 'admin'), ('${DM_AJ}', '${JHON}', 'member'),
  ('${G}', '${ALVARO}', 'admin'), ('${G}', '${JHON}', 'member'), ('${G}', '${ANA}', 'member'), ('${G}', '${BETO}', 'member'),
  ('${G_ANUNCIOS}', '${JHON}', 'admin'), ('${G_ANUNCIOS}', '${ALVARO}', 'member'),
  ('${G_SIN}', '${ANA}', 'admin'), ('${G_SIN}', '${BETO}', 'member');
insert into public.chat_messages(id, conversation_id, sender_id, content, created_at, reply_to_id, is_thread_reply) values
  ('${M_G_ANA}', '${G}', '${ANA}', 'hola grupo', now() - interval '3 hours', null, false),
  ('${M_G_HILO}', '${G}', '${BETO}', 'respondo en el hilo', now() - interval '2 hours', '${M_G_ANA}', true),
  ('${M_SIN}', '${G_SIN}', '${ANA}', 'sin Alvaro', now() - interval '2 hours', null, false),
  ('${M_ALV_MANO}', '${G}', '${ALVARO}', 'escrito a mano', now() - interval '90 minutes', null, false);
`;
async function semillaDeLlaves() {
  const filas: string[] = [];
  for (const [k, l] of Object.entries(LLAVES) as [NombreDeLlave, (typeof LLAVES)[NombreDeLlave]][]) {
    filas.push(`insert into public.api_keys(id, name, key_prefix, key_hash, created_by, acts_as_user_id, tenant_id, scopes, ip_whitelist, expires_at,
        api_display_name, limite_por_minuto, limite_por_hora${l.integracion ? ", integracion_id" : ""})
      values ('${l.id}', '${k}', 'mvk_live_x', '${await sha256hex(crudo(k))}', '${l.quien}', '${l.quien}', '${T1}', '${l.scopes}', '{1.2.3.4}',
        now() + interval '30 days', ${l.nombre === null ? "null" : `'${l.nombre}'`}, 100000, 100000${l.integracion ? `, '${l.integracion}'` : ""});`);
  }
  // El freno con fuentes declaradas (las reales de pg_stat_activity no se pueden mirar
  // en PGlite) y el interruptor prendido: cada prueba los cambia.
  return filas.join("\n") + `
create schema banco;
create table banco.presion (senal text primary key, valor numeric, medible boolean not null);
insert into banco.presion values ('backends', 3, true), ('slot', 1024, true), ('cola', 0, true);
create or replace function public.api_fuente_backends() returns table (valor numeric, medible boolean) language sql security definer set search_path = pg_catalog, pg_temp
  as $f$ select p.valor, p.medible from banco.presion p where p.senal = 'backends' $f$;
create or replace function public.api_fuente_slot() returns table (valor numeric, medible boolean) language sql security definer set search_path = pg_catalog, pg_temp
  as $f$ select p.valor, p.medible from banco.presion p where p.senal = 'slot' $f$;
create or replace function public.api_fuente_cola() returns table (valor numeric, medible boolean) language sql security definer set search_path = pg_catalog, pg_temp
  as $f$ select p.valor, p.medible from banco.presion p where p.senal = 'cola' $f$;
update public.app_flags set enabled = true where key = 'api_messenger_escritura';`;
}

const db = new PGlite();
await db.exec(FIXTURE);
await db.exec(COMPLEMENTO);
await db.exec(SEMILLA);
for (const m of CADENA) {
  try { await db.exec("begin;\n" + m.sql + "\ncommit;"); } catch (e) {
    await db.exec("rollback").catch(() => {});
    throw new Error(`la migración ${m.n} no carga: ${(e as Error).message}`);
  }
}
await db.exec(await semillaDeLlaves());
const q = async (sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as Fila[];
check(CADENA.some((m) => m.n === NOMBRE_B), `la cadena: ${CADENA.map((m) => m.n.slice(0, 14)).join(" → ")}`);

// ─── Un PostgREST mínimo sobre PGlite ────────────────────────────────────────
const SECRETO = "secreto-del-banco-que-no-es-el-de-verdad-0123456789abcdef";
const BASE = "https://proyecto.supabase.co";
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function firmar(claims: Fila) {
  const t = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const cuerpo = `${t({ alg: "HS256", typ: "JWT" })}.${t(claims)}`;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRETO), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `${cuerpo}.${b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(cuerpo))))}`;
}
async function verificar(token: string): Promise<Fila | null> {
  const [h, p, f] = token.split(".");
  if (!h || !p || !f) return null;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRETO), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const firma = Uint8Array.from(atob(f.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (f.length % 4)) % 4)), (c) => c.charCodeAt(0));
  if (!(await crypto.subtle.verify("HMAC", k, firma, new TextEncoder().encode(`${h}.${p}`)))) return null;
  const claims = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (p.length % 4)) % 4)));
  return claims.exp && claims.exp < Date.now() / 1000 ? null : claims;
}
const SERVICE_ROLE = await firmar({ role: "service_role", iss: "banco" });
const ANON = await firmar({ role: "anon", iss: "banco" });

/** Lo que ve el banco de cada pedido a la base: qué se llamó, con qué claims. */
const pedidosALaBase: { que: string; claims: Fila; metodo: string; args?: Fila }[] = [];
/** Para simular fallos: antes (demora o error) o después de correr (la red se corta
 *  con la escritura YA hecha). */
type Truco = { que: string; demoraMs?: number; error500?: boolean; errorPg?: string; cortarDespues?: boolean; antesSql?: string; veces: number };
const trucos: Truco[] = [];
const truco = (que: string) => {
  const t = trucos.find((x) => x.que === que && x.veces > 0);
  if (t) t.veces--;
  return t;
};
let cola: Promise<unknown> = Promise.resolve();
const enOrden = <T>(f: () => Promise<T>): Promise<T> => {
  const r = cola.then(f, f);
  cola = r.catch(() => {});
  return r;
};
const responder = (estado: number, cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status: estado, headers: { "content-type": "application/json", ...cabeceras } });
const errorPgrst = (e: Fila) => ({ code: e.code ?? null, message: e.message ?? String(e), details: e.detail ?? null, hint: e.hint ?? null });
const estadoDe = (code: string) => code === "42501" ? 403 : code === "23505" ? 409 : code === "PGRST202" ? 404 : code.startsWith("57") ? 500 : 400;
const IDENT = /^[a-z_][a-z0-9_]*$/;

async function ejecutar(claims: Fila, sql: string, params: unknown[]): Promise<string> {
  await db.exec("begin");
  try {
    await db.exec("reset role");
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await db.exec(`set local role ${claims.role === "service_role" ? "service_role" : claims.role === "anon" ? "anon" : "authenticated"}`);
    const r = (await db.query(sql, params)).rows as Fila[];
    await db.exec("commit");
    return String(r[0]?.j ?? "null");
  } catch (e) {
    await db.exec("rollback").catch(() => {});
    throw e;
  }
}

async function rpc(claims: Fila, fn: string, args: Fila): Promise<Response> {
  if (!IDENT.test(fn)) return responder(404, { code: "PGRST202", message: "función inválida" });
  const defs = await q(`select p.proretset,
      case when p.proargnames is null then '{}'::text[] else
        coalesce((select array_agg(x.n order by x.o) from unnest(p.proargnames, coalesce(p.proargmodes, array_fill('i'::"char", array[cardinality(p.proargnames)])))
                  with ordinality as x(n, m, o) where x.m in ('i', 'b', 'v')), '{}') end as nombres,
      array(select format_type(t, null) from unnest(p.proargtypes) t) as tipos
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [fn]);
  const claves = Object.keys(args);
  const def = defs.find((d) => claves.every((k) => (d.nombres as string[]).includes(k)) && (d.tipos as string[]).length >= claves.length);
  if (!def) return responder(404, { code: "PGRST202", message: `Could not find the function public.${fn}`, details: null, hint: null });
  const nombres = def.nombres as string[];
  const tipos = def.tipos as string[];
  const valores = claves.map((k) => args[k] === null || args[k] === undefined ? null : typeof args[k] === "object" ? JSON.stringify(args[k]) : String(args[k]));
  // Como texto y casteado en SQL (como PostgREST): así el serializador de PGlite no
  // decide por su cuenta qué es un null o un booleano.
  const lista = claves.map((k, i) => `${k} => ($${i + 1}::text)::${tipos[nombres.indexOf(k)]}`).join(", ");
  const sql = def.proretset
    ? `select coalesce(json_agg(t), '[]')::text as j from public.${fn}(${lista}) t`
    : `select to_json(public.${fn}(${lista}))::text as j`;
  const texto = await ejecutar(claims, sql, valores);
  return new Response(texto, { status: 200, headers: { "content-type": "application/json" } });
}

/** Los filtros de PostgREST que usan public-api y manage-api-keys: eq, neq, gt, gte,
 *  lt, lte, in, is.null y or=(…) de esos mismos. */
function filtros(url: URL, params: unknown[], prefijo = ""): string[] {
  const ops: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };
  const uno = (col: string, v: string): string => {
    if (!IDENT.test(col)) throw new Error(`el banco no sabe filtrar por ${col}`);
    const [op, ...resto] = v.split(".");
    const val = resto.join(".");
    if (ops[op]) { params.push(val); return `${prefijo}${col} ${ops[op]} $${params.length}`; }
    if (op === "in") { params.push(val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""))); return `${prefijo}${col}::text = any($${params.length}::text[])`; }
    if (op === "is" && val === "null") return `${prefijo}${col} is null`;
    throw new Error(`el banco no sabe el filtro ${col}=${v}`);
  };
  const where: string[] = [];
  for (const [col, v] of url.searchParams) {
    if (["select", "order", "limit", "offset", "columns"].includes(col)) continue;
    if (col === "or") {
      where.push("(" + v.replace(/^\(|\)$/g, "").split(",").map((p) => { const [c, ...r] = p.split("."); return uno(c, r.join(".")); }).join(" or ") + ")");
      continue;
    }
    where.push(uno(col, v));
  }
  return where;
}

async function tabla(claims: Fila, metodo: string, url: URL, accept: string, cuerpo: string | null): Promise<Response> {
  const rel = url.pathname.split("/").pop()!;
  if (!IDENT.test(rel)) return responder(400, { code: "PGRST100", message: "relación inválida" });
  const sel = (url.searchParams.get("select") ?? "*").split(",").map((c) => c.trim()).filter(Boolean);
  if (!sel.every((c) => c === "*" || IDENT.test(c))) throw new Error(`el banco no sabe hacer este select: ${sel.join(",")}`);
  const params: unknown[] = [];
  const unObjeto = accept.includes("vnd.pgrst.object");
  const estado = metodo === "POST" ? 201 : 200;
  // Las filas como las arma PostgREST (json_agg) y, con .single(), un objeto o 406.
  const salida = async (filasSql: string, antes = "") => {
    const texto = await ejecutar(claims, `${antes} select coalesce(json_agg(t), '[]')::text as j from (${filasSql}) t`, params);
    if (!unObjeto) return new Response(texto, { status: estado, headers: { "content-type": "application/json" } });
    const filas = JSON.parse(texto);
    if (filas.length !== 1) return responder(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
    return new Response(JSON.stringify(filas[0]), { status: estado, headers: { "content-type": "application/json" } });
  };
  if (metodo === "POST" || metodo === "PATCH") {
    const fila = JSON.parse(cuerpo ?? "{}");
    const cols = Object.keys(fila);
    if (!cols.every((c) => IDENT.test(c))) throw new Error("columnas raras");
    params.push(JSON.stringify(fila));
    if (metodo === "POST") {
      return await salida(`select ${sel.join(", ")} from ins`,
        `with ins as (insert into public.${rel} (${cols.join(", ")}) select ${cols.join(", ")} from json_populate_record(null::public.${rel}, $1::json) returning *)`);
    }
    const where = filtros(url, params, "t.");
    return await salida(`select ${sel.join(", ")} from upd`,
      `with upd as (update public.${rel} t set ${cols.map((c) => `${c} = r.${c}`).join(", ")} from json_populate_record(null::public.${rel}, $1::json) r ${where.length ? "where " + where.join(" and ") : ""} returning t.*)`);
  }
  const where = filtros(url, params);
  const orden = (url.searchParams.get("order") ?? "").split(",").filter(Boolean).map((o) => {
    const [c, dir = "asc", nulos] = o.split(".");
    if (!IDENT.test(c)) throw new Error(`orden ${o}`);
    return `${c} ${dir === "desc" ? "desc" : "asc"}${nulos === "nullslast" ? " nulls last" : nulos === "nullsfirst" ? " nulls first" : ""}`;
  });
  const lim = url.searchParams.get("limit"), off = url.searchParams.get("offset");
  const base = `from public.${rel}${where.length ? " where " + where.join(" and ") : ""}`;
  if (metodo === "HEAD") {
    const n = JSON.parse(await ejecutar(claims, `select count(*)::text as j ${base}`, params));
    return new Response(null, { status: 200, headers: { "content-range": `*/${n}` } });
  }
  return await salida(`select ${sel.join(", ")} ${base}${orden.length ? " order by " + orden.join(", ") : ""}${lim ? ` limit ${Number(lim)}` : ""}${off ? ` offset ${Number(off)}` : ""}`);
}

const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
  const h = new Headers(init?.headers);
  const metodo = (init?.method ?? "GET").toUpperCase();
  const token = (h.get("authorization") ?? "").replace(/^Bearer /, "");
  // Un GoTrue mínimo para manage-api-keys (auth.getUser): el usuario del JWT firmado.
  if (url.href === `${BASE}/auth/v1/user`) {
    const c = await verificar(token);
    if (!c?.sub) return responder(401, { code: 401, msg: "invalid JWT" });
    const u = (await q(`select id::text id, email from auth.users where id = $1`, [c.sub]))[0];
    return responder(200, { id: u.id, aud: "authenticated", role: "authenticated", email: u.email, app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T10:00:00Z" });
  }
  if (!url.href.startsWith(`${BASE}/rest/v1/`)) return fetchOriginal(entrada, init);
  return await enOrden(async () => {
    const claims = await verificar(token);
    if (!claims) return responder(401, { code: "PGRST301", message: "JWSError JWSInvalidSignature" });
    const esRpc = url.pathname.startsWith("/rest/v1/rpc/");
    const que = esRpc ? `rpc:${url.pathname.slice("/rest/v1/rpc/".length)}` : `${metodo}:${url.pathname.split("/").pop()}`;
    const args = esRpc ? JSON.parse(String(init?.body ?? "{}")) : undefined;
    pedidosALaBase.push({ que, claims, metodo, args });
    const t = truco(que);
    // La demora respeta la señal del que llama, como un fetch de verdad: si el edge
    // corta por plazo (fetchSinReintentos), aquí también se corta.
    if (t?.demoraMs) {
      const senal = init?.signal;
      await new Promise<void>((listo, cortado) => {
        const reloj = setTimeout(listo, t.demoraMs);
        senal?.addEventListener("abort", () => { clearTimeout(reloj); cortado(senal.reason ?? new DOMException("abortado", "AbortError")); }, { once: true });
      });
    }
    if (t?.error500) return responder(500, { code: "XX000", message: "la base no responde (simulado)" });
    if (t?.errorPg) return responder(estadoDe(t.errorPg), { code: t.errorPg, message: "canceling statement due to statement timeout (simulado)", details: null, hint: null });
    if (t?.antesSql) await db.exec(t.antesSql);
    try {
      const r = esRpc
        ? await rpc(claims, url.pathname.slice("/rest/v1/rpc/".length), args)
        : await tabla(claims, metodo, url, h.get("accept") ?? "", init?.body ? String(init.body) : null);
      if (t?.cortarDespues) throw new TypeError("la red se cortó después de mandar (simulado)");
      return r;
    } catch (e) {
      if (e instanceof TypeError) throw e;
      const err = e as Fila;
      if (!err.code) throw e;
      return responder(estadoDe(String(err.code)), errorPgrst(err));
    }
  });
}) as typeof fetch;

// ─── El public-api de verdad, sin red: su Deno.serve capturado ───────────────
Deno.env.set("SUPABASE_URL", BASE);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE);
Deno.env.set("SUPABASE_ANON_KEY", ANON);
Deno.env.set("MAVEN_JWT_SECRET", SECRETO);
let servir: ((r: Request) => Promise<Response>) | null = null;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (f: (r: Request) => Promise<Response>) => { servir = f; return { finished: Promise.resolve(), shutdown() {} }; };
await import("../functions/public-api/index.ts");
if (!servir) throw new Error("public-api no llamó a Deno.serve");
const handler: (r: Request) => Promise<Response> = servir;
// Y manage-api-keys de verdad (las reglas de la key, con la sesión de un admin).
servir = null;
await import("../functions/manage-api-keys/index.ts");
if (!servir) throw new Error("manage-api-keys no llamó a Deno.serve");
const manage: (r: Request) => Promise<Response> = servir;

type Pedido = { llave?: NombreDeLlave; cuerpo?: unknown; crudo?: BodyInit; idem?: string; tipo?: string; cabeceras?: Record<string, string>; idioma?: string };
type Resp = { estado: number; json: Fila; cabeceras: Headers };
let n = 0;
const idem = () => `banco-${String(++n).padStart(6, "0")}`;
async function pedir(metodo: string, ruta: string, p: Pedido = {}): Promise<Resp> {
  const h: Record<string, string> = { "cf-connecting-ip": "1.2.3.4", "X-API-Key": crudo(p.llave ?? "BLU"), ...(p.cabeceras ?? {}) };
  if (p.idioma) h["Accept-Language"] = p.idioma;
  if (p.idem) h["Idempotency-Key"] = p.idem;
  let body: BodyInit | undefined = p.crudo;
  if (p.cuerpo !== undefined) { body = JSON.stringify(p.cuerpo); h["Content-Type"] = p.tipo ?? "application/json"; }
  else if (p.tipo) h["Content-Type"] = p.tipo;
  // Un GET no lleva cuerpo (fetch no lo deja armar).
  if (metodo === "GET") body = undefined;
  const r = await handler(new Request(`${BASE}/functions/v1/public-api${ruta}`, { method: metodo, headers: h, body }));
  const texto = await r.text();
  let json: Fila = {};
  try { json = texto ? JSON.parse(texto) : {}; } catch { json = { _texto: texto }; }
  return { estado: r.status, json, cabeceras: r.headers };
}
const d = (r: Resp) => `${r.estado} ${JSON.stringify(r.json).slice(0, 220)}`;
const espera = (r: Resp, estado: number, error: string | null, m: string) =>
  check(r.estado === estado && (error === null || r.json.error === error), `${m} → ${d(r)}`);
const mensajesApi = async () => Number((await q(`select count(*)::int c from public.chat_messages where api_key_id is not null`))[0].c);
/** Los mensajes por API de antes, 2 minutos atrás (el tope por conversación es 6/min). */
const envejecer = () => db.exec(`set session_replication_role = replica;
  update public.chat_messages set created_at = created_at - interval '2 minutes' where api_key_id is not null;
  set session_replication_role = origin;`);
const enviar = (conv: string, cuerpo: unknown, p: Pedido = {}) => pedir("POST", `/messenger/conversations/${conv}/messages`, { cuerpo, idem: idem(), ...p });

// ════ 1. GET /me: messenger_write null para toda key que no escribe ══════════
{
  for (const k of ["CREA", "LEE"] as const) {
    const r = await pedir("GET", "/me", { llave: k });
    check(r.estado === 200 && r.json.messenger_write === null && r.json.acts_as?.id === ALVARO, `GET /me con ${k}: 200 y messenger_write null → ${d(r)}`);
  }
  const r = await pedir("GET", "/me");
  check(r.estado === 200 && r.json.messenger_write?.display_name === "BLU" && r.json.messenger_write?.limits?.messages_per_hour === 1000
      && typeof r.json.messenger_write?.remaining?.messages_hour === "number",
    `GET /me con BLU: el nombre visible, los topes y lo que queda → ${d(r)}`);
  // El token que fabricó el edge: mvf siempre, mvk el id de ESTA key, nunca *_metadata.
  const de = pedidosALaBase.filter((x) => x.que === "rpc:api_mi_llave").map((x) => x.claims);
  check(de.length === 3 && de.every((c) => c.mvf === true && c.role === "authenticated" && c.sub === ALVARO && !Object.keys(c).some((k) => /metadata/.test(k)))
      && de[2].mvk === LLAVES.BLU.id && de[0].mvk === LLAVES.CREA.id,
    `el token de cada pedido: mvf, mvk = la key del pedido, sin *_metadata (${JSON.stringify(de[2])})`);
  check(pedidosALaBase.filter((x) => x.claims.role === "service_role").every((x) => !x.que.includes("api_messenger")),
    "service_role nunca llama a una RPC de escritura");
}

// ════ 2. Mandar: la marca la pone la base, con el nombre de api_keys ═════════
let primero = "";
{
  const antes = await mensajesApi();
  const k = idem();
  const r = await pedir("POST", `/messenger/conversations/${G}/messages`, { cuerpo: { text: "  hola\r\ngrupo  " }, idem: k });
  primero = r.json.data?.id ?? "";
  espera(r, 201, null, "POST …/messages: 201");
  check(r.json.object === "message" && r.json.idempotent_replay === false && r.json.data?.via_api?.display_name === "BLU"
      && r.json.data?.sender?.id === ALVARO && r.json.data?.sender?.name === "Alvaro Diaz" && r.json.data?.text === "hola\ngrupo",
    `la respuesta: via_api «BLU», sender la persona real, el texto normalizado por la base → ${d(r)}`);
  const fila = (await q(`select api_key_id::text k, api_display_name n, sender_id::text s from public.chat_messages where id = $1`, [primero]))[0];
  check(fila?.k === LLAVES.BLU.id && fila?.n === "BLU" && fila?.s === ALVARO, `en la base: api_key_id = la key, «BLU», de Alvaro (${JSON.stringify(fila)})`);
  check(await mensajesApi() === antes + 1, "una sola fila");
  const titulo = (await q(`select title from public.notifications where deep_link_url like '%' || $1 order by created_at desc limit 1`, [primero]))[0]?.title ?? "";
  check(/BLU \(API\)/.test(titulo), `la notificación dice «BLU (API)» (${titulo})`);

  // (e) La repetición: 200, el mismo mensaje, idempotent_replay; nada nuevo en la base.
  const rep = await pedir("POST", `/messenger/conversations/${G}/messages`, { cuerpo: { text: "  hola\r\ngrupo  " }, idem: k });
  check(rep.estado === 200 && rep.json.idempotent_replay === true && rep.json.data?.id === primero, `la repetición: 200, el mismo id, idempotent_replay → ${d(rep)}`);
  check(await mensajesApi() === antes + 1, "la repetición no escribió nada");
  const otra = await pedir("POST", `/messenger/conversations/${G}/messages`, { cuerpo: { text: "otro texto" }, idem: k });
  espera(otra, 409, "idempotency_key_reused", "la misma Idempotency-Key con otro pedido: 409");

  // (f) Sin Idempotency-Key, un campo de más, un cuerpo raro: 400 y ni un pedido a la base de escritura.
  const pedidos = pedidosALaBase.length;
  espera(await pedir("POST", `/messenger/conversations/${G}/messages`, { cuerpo: { text: "x" } }), 400, "idempotency_key_required", "sin Idempotency-Key: 400");
  espera(await enviar(G, { text: "x", reply_to: M_G_ANA }), 400, "unknown_field", "un campo de más (reply_to): 400");
  espera(await enviar(G, { text: "x", thread: "si" }), 400, "invalid_field", "thread que no es booleano: 400");
  espera(await pedir("POST", `/messenger/conversations/${G}/messages`, { crudo: "{", tipo: "application/json", idem: idem() }), 400, "invalid_json", "JSON roto: 400");
  espera(await pedir("POST", `/messenger/conversations/${G}/messages`, { crudo: "[1]", tipo: "application/json", idem: idem() }), 400, "invalid_json", "un arreglo: 400");
  espera(await pedir("POST", `/messenger/conversations/${G}/messages`, { cuerpo: { text: "x" }, idem: "corta" }), 400, "invalid_idempotency_key", "Idempotency-Key de 5: 400");
  espera(await pedir("POST", `/messenger/conversations/${G}/messages`, { cuerpo: { text: "x" }, tipo: "text/plain", idem: idem() }), 415, "unsupported_media_type", "text/plain: 415");
  // Un JSON válido con un byte que no es UTF-8 dentro del texto: si se decodificara sin
  // `fatal`, saldría un U+FFFD y el mensaje se mandaría con otro texto.
  const utf8Roto = new Uint8Array([...new TextEncoder().encode('{"text":"a'), 0xff, ...new TextEncoder().encode('b"}')]);
  const roto = await pedir("POST", `/messenger/conversations/${G}/messages`, { crudo: utf8Roto, tipo: "application/json", idem: idem() });
  check(roto.estado === 400 && roto.json.error === "invalid_json" && roto.json.message === "El cuerpo no es UTF-8 válido", `UTF-8 roto dentro del texto: 400 → ${d(roto)}`);
  espera(await pedir("POST", `/messenger/conversations/${G}/messages`, { cuerpo: { text: "x".repeat(70_000) }, idem: idem() }), 413, "payload_too_large", "70 KB: 413");
  check(!pedidosALaBase.slice(pedidos).some((x) => x.que.startsWith("rpc:api_messenger")), "ninguno de esos llegó a una RPC de escritura");
  check(await mensajesApi() === antes + 1, "ni una fila más");
}

// ════ 3. Cada respuesta de la base, por el edge (§1.8) ═══════════════════════
{
  await envejecer();
  espera(await enviar(G_SIN, { text: "hola" }), 404, "conversation_not_found", "una conversación donde no está: 404");
  espera(await enviar("c0000000-0000-4000-8000-0000000000ff", { text: "hola" }), 404, "conversation_not_found", "una que no existe: 404");
  espera(await enviar(G_ANUNCIOS, { text: "hola" }), 403, "not_allowed_in_conversation", "grupo de anuncios sin ser admin: 403 (la RLS)");
  espera(await enviar(G, { text: "al revés ‮" }), 422, "invalid_text", "U+202E: 422");
  espera(await enviar(G, { text: "x".repeat(4001) }), 422, "invalid_text", "4.001 caracteres: 422");
  espera(await enviar(G, { text: "   " }), 422, "invalid_text", "solo espacios: 422");
  espera(await enviar(G, { text: "hola\u200Bmundo" }), 422, "invalid_text", "un espacio de ancho cero (U+200B): 422");
  espera(await enviar(G, { text: "\u200D\u00A0" }), 422, "invalid_text", "nada visible (ZWJ y espacio duro): 422");
  espera(await enviar(G, { text: "ho\u0000la" }), 422, "invalid_text", "un NUL: 422 (el edge, antes de la base)");
  espera(await enviar(G, { text: "cito", reply_to_id: M_SIN }), 422, "invalid_reply", "cita de otra conversación: 422 (chat_cita_ajena de la A)");
  espera(await enviar(G, { text: "hilo", reply_to_id: M_G_HILO, thread: true }), 422, "invalid_reply", "hilo sobre una respuesta en hilo: 422");
  const emojis = await enviar(DM_AJ, { text: "🙂".repeat(4000) });
  check(emojis.estado === 201 && [...(emojis.json.data?.text ?? "")].length === 4000, `4.000 emojis: 201 → ${emojis.estado}`);
  const hilo = await enviar(G, { text: "respondo", reply_to_id: M_G_ANA, thread: true });
  check(hilo.estado === 201 && hilo.json.data?.is_thread_reply === true && hilo.json.data?.reply_to_id === M_G_ANA, `respuesta en hilo: 201 → ${d(hilo)}`);
  // Sin el scope de escritura: 403 sin tocar la base (ni current_tenant_id).
  const p = pedidosALaBase.length;
  espera(await enviar(G, { text: "hola" }, { llave: "LEE" }), 403, "forbidden", "key de solo lectura: 403");
  espera(await pedir("GET", "/messenger/people", { llave: "LEE" }), 403, "forbidden", "GET /people de solo lectura: 403");
  check(!pedidosALaBase.slice(p).some((x) => x.claims.role === "authenticated"), "sin el scope, la sesión de la persona no tocó la base");
}

// ════ 4. Topes, interruptor y freno: 429 y 503 con Retry-After ═══════════════
{
  await envejecer();
  // El tope en 1 por minuto, con la ventana de esta key en cero (los de antes no cuentan).
  await db.exec(`update public.api_escritura_cupos set lim_msj_min = 1, min_msj = 0, min_dest = 0 where clave = 'llave:${LLAVES.BLU.id}'`);
  const a = await enviar(DM_AJ, { text: "uno" });
  const b = await enviar(DM_AJ, { text: "dos" });
  check(a.estado === 201, `con el tope en 1 por minuto, el primero pasa → ${d(a)}`);
  const ra = Number(b.cabeceras.get("Retry-After"));
  check(b.estado === 429 && b.json.error === "rate_limited" && b.json.limit === "key_messages_minute" && ra >= 1 && ra <= 60 && b.json.retry_after === ra,
    `el segundo: 429 key_messages_minute con Retry-After ${ra} → ${d(b)}`);
  await db.exec(`update public.api_escritura_cupos set lim_msj_min = 60 where clave = 'llave:${LLAVES.BLU.id}'`);
  await envejecer();
  await db.exec(`update public.app_flags set enabled = false where key = 'api_messenger_escritura'`);
  const off = await enviar(DM_AJ, { text: "apagado" });
  check(off.estado === 503 && off.json.error === "writes_paused" && off.cabeceras.get("Retry-After") === "300", `interruptor apagado: 503 writes_paused, Retry-After 300 → ${d(off)}`);
  const offBorrar = await pedir("DELETE", `/messenger/conversations/${G}/messages/${primero}`);
  check(offBorrar.estado === 503 && offBorrar.json.error === "writes_paused", `apagado, tampoco se borra → ${d(offBorrar)}`);
  const offMe = await pedir("GET", "/me");
  check(offMe.estado === 200 && offMe.json.messenger_write?.display_name === "BLU", "apagado, /me sigue andando");
  await db.exec(`update public.app_flags set enabled = true where key = 'api_messenger_escritura'`);
  await db.exec(`update banco.presion set valor = 500 where senal = 'cola'`);
  const presion = await enviar(DM_AJ, { text: "bajo presión" });
  check(presion.estado === 503 && presion.json.error === "writes_paused" && presion.cabeceras.get("Retry-After") === "60", `freno por presión: 503, Retry-After 60 → ${d(presion)}`);
  await db.exec(`update banco.presion set valor = 0 where senal = 'cola'`);
  // La base lenta (la key y el cupo tardan más de 1,5 s): ni se intenta.
  trucos.push({ que: "rpc:api_key_consumir", demoraMs: 1_600, veces: 1 });
  const p = pedidosALaBase.length;
  const lenta = await enviar(DM_AJ, { text: "lento" });
  check(lenta.estado === 503 && lenta.json.error === "writes_paused" && lenta.cabeceras.get("Retry-After") === "30", `base lenta: 503 writes_paused, Retry-After 30 → ${d(lenta)}`);
  check(!pedidosALaBase.slice(p).some((x) => x.que.startsWith("rpc:api_messenger")), "con la base lenta no se intentó escribir");
  // El contador caído: una escritura se corta en el acto; una lectura se sirve.
  trucos.push({ que: "rpc:api_key_consumir", error500: true, veces: 2 });
  const p2 = pedidosALaBase.length;
  const sinContador = await enviar(DM_AJ, { text: "sin contador" });
  check(sinContador.estado === 503 && !pedidosALaBase.slice(p2).some((x) => x.que === "rpc:api_key_vigente" || x.que === "HEAD:tenants"),
    `sin contador, la escritura da 503 antes de api_key_vigente y del conteo → ${d(sinContador)}`);
  const lectura = await pedir("GET", "/", { llave: "CREA" });
  check(lectura.estado === 200 && lectura.json.object === "api", `sin contador, una lectura se sirve igual que siempre → ${d(lectura)}`);
  check(trucos.every((t) => t.veces === 0), "los dos pedidos pasaron por el contador caído");
}

// ════ 5. Resultado incierto: la red se corta con la escritura YA hecha ═══════
{
  await envejecer();
  const k = idem();
  trucos.push({ que: "rpc:api_messenger_enviar", cortarDespues: true, veces: 1 });
  const antes = await mensajesApi();
  const r = await pedir("POST", `/messenger/conversations/${DM_AJ}/messages`, { cuerpo: { text: "¿llegó?" }, idem: k });
  check(r.estado === 503 && r.json.error === "outcome_unknown" && r.cabeceras.get("Retry-After") === "5", `corte después de escribir: 503 outcome_unknown, Retry-After 5 → ${d(r)}`);
  check(await mensajesApi() === antes + 1, "la escritura SÍ se hizo (por eso no se puede decir que falló)");
  const rep = await pedir("POST", `/messenger/conversations/${DM_AJ}/messages`, { cuerpo: { text: "¿llegó?" }, idem: k });
  check(rep.estado === 200 && rep.json.idempotent_replay === true, `reintentar con la misma Idempotency-Key: 200 la repetición → ${d(rep)}`);
  check(await mensajesApi() === antes + 1, "y no se duplicó (lección #1868)");
}

// ════ 5b. La base valida la key en CADA escritura (la ventana de 60 s del token) ═
{
  await envejecer();
  // Se revoca entre que el edge la buscó (vigente) y la RPC: la base lo ve igual.
  trucos.push({ que: "rpc:api_messenger_enviar", antesSql: `update public.api_keys set revoked_at = now() where id = '${LLAVES.BLU2.id}'`, veces: 1 });
  const antes = await mensajesApi();
  const r = await enviar(DM_AJ, { text: "revocada en el medio" }, { llave: "BLU2" });
  check(r.estado === 401 && r.json.error === "unauthorized", `revocada después de la búsqueda del edge: 401 de la base (MV401) → ${d(r)}`);
  check(await mensajesApi() === antes, "y no escribió nada");
  espera(await enviar(DM_AJ, { text: "ya revocada" }, { llave: "BLU2" }), 401, "unauthorized", "ya revocada: 401 (el edge, antes de la base)");
  await db.exec(`update public.api_keys set revoked_at = null where id = '${LLAVES.BLU2.id}'`);
}

// ════ 6. Editar y borrar: solo lo de la MISMA integración ════════════════════
{
  await envejecer();
  const web = await enviar(DM_AJ, { text: "de Kash Web" }, { llave: "WEB" });
  check(web.estado === 201 && web.json.data?.via_api?.display_name === "Kash Web", `otra integración de la misma persona manda como «Kash Web» → ${d(web)}`);
  const ruta = (conv: string, m: string) => `/messenger/conversations/${conv}/messages/${m}`;
  const ed = await pedir("PATCH", ruta(G, primero), { cuerpo: { text: "editado" } });
  check(ed.estado === 200 && ed.json.changed === true && ed.json.data?.text === "editado" && ed.json.data?.is_edited === true, `PATCH lo propio: 200 changed → ${d(ed)}`);
  const igual = await pedir("PATCH", ruta(G, primero), { cuerpo: { text: "editado" } });
  check(igual.estado === 200 && igual.json.changed === false, `PATCH con el mismo texto: 200 sin escribir → ${d(igual)}`);
  const rot = await pedir("PATCH", ruta(G, primero), { cuerpo: { text: "desde la key rotada" }, llave: "BLU2" });
  check(rot.estado === 200 && rot.json.changed === true, `la key rotada (misma integración) edita lo de «BLU» → ${d(rot)}`);
  espera(await pedir("PATCH", ruta(DM_AJ, web.json.data?.id), { cuerpo: { text: "x" } }), 403, "other_integration_message", "PATCH lo de «Kash Web» con «BLU»: 403");
  espera(await pedir("PATCH", ruta(G, M_ALV_MANO), { cuerpo: { text: "x" } }), 403, "not_an_api_message", "PATCH lo escrito a mano: 403");
  espera(await pedir("PATCH", ruta(G, M_G_ANA), { cuerpo: { text: "x" } }), 403, "not_your_message", "PATCH lo de Ana: 403");
  espera(await pedir("PATCH", ruta(G, "e0000000-0000-4000-8000-0000000000ff"), { cuerpo: { text: "x" } }), 404, "not_found", "PATCH lo que no existe: 404");
  espera(await pedir("PATCH", ruta(DM_AJ, primero), { cuerpo: { text: "x" } }), 404, "not_found", "PATCH en otra conversación: 404");
  espera(await pedir("PATCH", ruta(G, primero), { cuerpo: { text: "‮" } }), 422, "invalid_text", "PATCH con U+202E: 422");
  const b1 = await pedir("DELETE", ruta(G, primero));
  check(b1.estado === 200 && b1.json.object === "message_deleted" && b1.json.already_deleted === false, `DELETE: 200 → ${d(b1)}`);
  const b2 = await pedir("DELETE", ruta(G, primero));
  check(b2.estado === 200 && b2.json.already_deleted === true, `DELETE otra vez: 200 already_deleted → ${d(b2)}`);
  espera(await pedir("PATCH", ruta(G, primero), { cuerpo: { text: "x" } }), 409, "message_deleted", "PATCH lo borrado: 409");
  const archivo = (await q(`select api_display_name n from public.chat_message_deletions where message_id = $1`, [primero]))[0];
  check(archivo?.n === "BLU", `el borrado quedó archivado con la marca (${JSON.stringify(archivo)})`);
  espera(await pedir("DELETE", ruta(G, M_ALV_MANO)), 403, "not_an_api_message", "DELETE lo escrito a mano: 403");
  // La lectura del Messenger ve la marca (las dos columnas nuevas de COLS_MENSAJE).
  const lista = await pedir("GET", `/messenger/conversations/${G}/messages?limit=100`);
  const conMarca = (lista.json.data ?? []).filter((m: Fila) => m.via_api);
  check(lista.estado === 200 && conMarca.length >= 1 && conMarca.every((m: Fila) => m.via_api.display_name === "BLU" && m.sender?.id === ALVARO)
      && (lista.json.data ?? []).some((m: Fila) => m.via_api === null && m.id === M_G_ANA),
    `GET …/messages: via_api en los de API y null en los de la app → ${lista.estado}, ${conMarca.length} con marca de ${(lista.json.data ?? []).length}`);
  const dm = await pedir("GET", `/messenger/conversations/${DM_AJ}/messages?limit=100`);
  check((dm.json.data ?? []).some((m: Fila) => m.via_api?.display_name === "Kash Web"), "y en el directo, «Kash Web» con su nombre");
  const bandeja = await pedir("GET", "/messenger/conversations");
  const ultimo = (bandeja.json.data ?? []).find((c: Fila) => c.id === DM_AJ)?.last_message;
  check(bandeja.estado === 200 && ultimo?.via_api?.display_name === "Kash Web", `la bandeja: la vista previa trae via_api → ${JSON.stringify(ultimo)}`);
}

// ════ 7. Abrir un directo con su primer mensaje; el directorio ═══════════════
{
  await envejecer();
  const r = await pedir("POST", "/messenger/conversations", { cuerpo: { type: "direct", user_id: ANA, text: "hola Ana" }, idem: idem() });
  check(r.estado === 201 && r.json.object === "conversation_message" && r.json.conversation?.created === true && r.json.message?.via_api?.display_name === "BLU",
    `abrir con Ana (no había directo): 201 created → ${d(r)}`);
  const conv = r.json.conversation?.id;
  const otra = await pedir("POST", "/messenger/conversations", { cuerpo: { type: "direct", user_id: ANA, text: "otra vez" }, idem: idem() });
  check(otra.estado === 200 && otra.json.conversation?.id === conv && otra.json.conversation?.created === false, `otra vez con Ana: 200, el mismo directo → ${d(otra)}`);
  const conJhon = await pedir("POST", "/messenger/conversations", { cuerpo: { type: "direct", user_id: JHON, text: "hola Jhon" }, idem: idem() });
  check(conJhon.estado === 200 && conJhon.json.conversation?.id === DM_AJ, `con Jhon: el directo que ya había (DM_AJ) → ${d(conJhon)}`);
  const miembros = (await q(`select user_id::text u, role from public.chat_participants where conversation_id = $1 order by role`, [conv]));
  check(miembros.length === 2 && miembros.some((m) => m.u === ALVARO && m.role === "admin") && miembros.some((m) => m.u === ANA && m.role === "member"),
    `el directo nuevo: Alvaro admin y Ana member (${JSON.stringify(miembros)})`);
  espera(await pedir("POST", "/messenger/conversations", { cuerpo: { type: "direct", user_id: ALVARO, text: "yo" }, idem: idem() }), 422, "cannot_message_self", "consigo mismo: 422");
  espera(await pedir("POST", "/messenger/conversations", { cuerpo: { type: "direct", user_id: NUEVA, text: "hola" }, idem: idem() }), 404, "person_not_found", "alta sin sello de admin: 404");
  espera(await pedir("POST", "/messenger/conversations", { cuerpo: { type: "direct", user_id: BAJA, text: "hola" }, idem: idem() }), 404, "person_not_found", "dada de baja: 404");
  espera(await pedir("POST", "/messenger/conversations", { cuerpo: { type: "group", user_id: ANA, text: "hola" }, idem: idem() }), 400, "invalid_field", "type group: 400");
  const gente = await pedir("GET", "/messenger/people");
  const ids = (gente.json.data ?? []).map((p: Fila) => p.id);
  check(gente.estado === 200 && gente.json.object === "list" && ids.includes(ANA) && ids.includes(JHON) && !ids.includes(ALVARO) && !ids.includes(NUEVA) && !ids.includes(BAJA),
    `GET /people: la agencia sin la persona de la key, sin altas sin sello ni bajas → ${JSON.stringify(ids)}`);
  const ana = await pedir("GET", "/messenger/people?q=ana&limit=1");
  check(ana.estado === 200 && ana.json.data?.length === 1 && ana.json.data[0].id === ANA && ana.json.data[0].object === "person", `GET /people?q=ana → ${d(ana)}`);
  const pagina = await pedir("GET", "/messenger/people?limit=1");
  check(pagina.json.has_more === true && pagina.json.data?.length === 1, "GET /people?limit=1: has_more");
  const segunda = await pedir("GET", "/messenger/people?limit=1&offset=1");
  check(segunda.json.offset === 1 && segunda.json.data?.[0]?.id === ids[1] && ids[1] !== ids[0], `GET /people?offset=1: la segunda persona → ${d(segunda)}`);
}

// ════ 8. Métodos y rutas: 405 con Allow, sin leer el cuerpo ══════════════════
{
  const raiz = await pedir("GET", "/");
  const rutas = (raiz.json.resources ?? []).map((r: Fila) => `${r.method ?? "GET"} ${r.path} ${r.scope}`);
  for (const r of ["GET /messenger/people messenger:write", "POST /messenger/conversations messenger:write",
    "POST /messenger/conversations/{id}/messages messenger:write", "PATCH /messenger/conversations/{id}/messages/{message_id} messenger:write",
    "DELETE /messenger/conversations/{id}/messages/{message_id} messenger:write", "GET /messenger/feed messenger:read"]) {
    check(rutas.includes(r), `GET / lista «${r}»`);
  }
  const casos: [string, string, number, string | null][] = [
    ["GET", `/messenger/conversations/${G}/messages/${M_G_ANA}`, 405, "PATCH, DELETE"],
    ["POST", "/creators", 405, "GET"],
    ["DELETE", "/creators/x", 405, "GET"],
    ["POST", "/", 405, "GET"],
    ["PUT", "/messenger/conversations", 405, "GET, POST, PATCH, DELETE"],
    ["POST", "/me", 405, "GET"],
    ["POST", "/messenger/feed", 405, "GET"],
    ["PATCH", "/messenger/conversations", 405, "GET, POST"],
    ["POST", "/messenger/nada", 404, null],
  ];
  for (const [metodo, ruta, estado, allow] of casos) {
    const r = await pedir(metodo, ruta, { cuerpo: { text: "x" }, idem: idem() });
    check(r.estado === estado && (allow === null || r.cabeceras.get("Allow") === allow), `${metodo} ${ruta}: ${estado}${allow ? ` Allow: ${allow}` : ""} → ${r.estado} ${r.cabeceras.get("Allow")}`);
  }
  // Un 405 no lee el cuerpo: uno de 70 KB a /creators sigue siendo 405, no 413.
  const grande = await pedir("POST", "/creators", { cuerpo: { text: "x".repeat(70_000) } });
  check(grande.estado === 405, `POST /creators con 70 KB: 405 (no se leyó) → ${grande.estado}`);
  // En inglés, el mismo código y otro texto.
  const en = await pedir("POST", `/messenger/conversations/${G}/messages`, { cuerpo: { text: "x" }, idioma: "en" });
  check(en.estado === 400 && en.json.error === "idempotency_key_required" && /^Missing Idempotency-Key/.test(en.json.message), `en inglés → ${d(en)}`);
}

// ════ 9. El directorio: un q que la base no puede leer, y el interruptor ══════
{
  for (const q of ["%00", "ana%00x"]) {
    const r = await pedir("GET", `/messenger/people?q=${q}`);
    check(r.estado === 400 && r.json.error === "bad_request" && !r.cabeceras.get("Retry-After"),
      `GET /people?q=${q}: 400 (no un 503 que se reintenta para siempre) → ${d(r)}`);
  }
  const p = pedidosALaBase.length;
  await db.exec(`update public.app_flags set enabled = false where key = 'api_messenger_escritura'`);
  const off = await pedir("GET", "/messenger/people");
  check(off.estado === 503 && off.json.error === "writes_paused" && off.cabeceras.get("Retry-After") === "300",
    `GET /people con el interruptor apagado: 503 writes_paused, Retry-After 300 → ${d(off)}`);
  check(pedidosALaBase.slice(p).some((x) => x.que === "rpc:api_escritura_habilitada" && x.claims.role === "authenticated" && x.claims.mvk === LLAVES.BLU.id)
      && !pedidosALaBase.slice(p).some((x) => x.que === "rpc:messenger_directorio"),
    "lo decidió api_escritura_habilitada con la sesión de la persona, y la lista ni se pidió");
  await db.exec(`update public.app_flags set enabled = true where key = 'api_messenger_escritura'`);
  await db.exec(`update banco.presion set valor = 500 where senal = 'cola'`);
  const presion = await pedir("GET", "/messenger/people");
  check(presion.estado === 503 && presion.json.error === "writes_paused" && presion.cabeceras.get("Retry-After") === "60", `GET /people con el freno: 503, Retry-After 60 → ${d(presion)}`);
  await db.exec(`update banco.presion set valor = 0 where senal = 'cola'`);
  check((await pedir("GET", "/messenger/people")).estado === 200, "prendido y sin presión, GET /people vuelve a andar");
}

// ════ 10. La base lenta corta ANTES que el edge: 57014, que se reintenta seguro ══
{
  await envejecer();
  // La base tarda 8,5 s (más que nada que el edge espere con 8 s) y responde lo que da
  // el statement_timeout de authenticated: 57014. Con el plazo de 10 s de la sesión, el
  // edge recibe esa respuesta (volvió atrás entera) y no un corte sin respuesta.
  const k = idem();
  trucos.push({ que: "rpc:api_messenger_enviar", demoraMs: 8_500, errorPg: "57014", veces: 1 });
  const antes = await mensajesApi();
  const lenta = await pedir("POST", `/messenger/conversations/${DM_AJ}/messages`, { cuerpo: { text: "base lenta" }, idem: k });
  check(lenta.estado === 503 && lenta.json.error === "temporarily_unavailable" && lenta.cabeceras.get("Retry-After") === "2",
    `la base cortó a los 8 s: 503 temporarily_unavailable, Retry-After 2 (no outcome_unknown) → ${d(lenta)}`);
  check(await mensajesApi() === antes, "no se escribió nada");
  const otra = await pedir("POST", `/messenger/conversations/${DM_AJ}/messages`, { cuerpo: { text: "base lenta" }, idem: k });
  check(otra.estado === 201 && otra.json.idempotent_replay === false && await mensajesApi() === antes + 1,
    `reintentar con la misma Idempotency-Key manda el mensaje una vez → ${d(otra)}`);
}

// ════ 11. manage-api-keys de verdad: write se da (PR 5) con sus reglas, y el nombre es de su dueño ══
{
  // Jhon y Alvaro, admins de Maven (manage-api-keys es solo para admins).
  await db.exec(`delete from public.user_roles where user_id in ('${JHON}', '${ALVARO}');
    insert into public.user_roles(user_id, role) values ('${JHON}', 'admin'), ('${ALVARO}', 'admin');`);
  // Hasta 5 keys activas por agencia: quedan «BLU» y lugar para las de esta sección.
  await db.exec(`update public.api_keys set revoked_at = now() where id in ('${LLAVES.BLU2.id}', '${LLAVES.WEB.id}', '${LLAVES.LEE.id}', '${LLAVES.CREA.id}')`);
  const jwt = async (sub: string) => await firmar({ sub, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
  const JWT = { JHON: await jwt(JHON), ALVARO: await jwt(ALVARO) };
  const gestionar = async (quien: keyof typeof JWT, cuerpo: Fila) => {
    const r = await manage(new Request(`${BASE}/functions/v1/manage-api-keys`, {
      method: "POST", headers: { Authorization: `Bearer ${JWT[quien]}`, "Content-Type": "application/json", Origin: "https://app.maven-ai.me" },
      body: JSON.stringify({ lang: "es", ...cuerpo }),
    }));
    const t = await r.text();
    let json: Fila = {};
    try { json = t ? JSON.parse(t) : {}; } catch { json = { _t: t }; }
    return { estado: r.status, json, cabeceras: r.headers } as Resp;
  };
  const llaves = async () => Number((await q(`select count(*)::int c from public.api_keys`))[0].c);

  // Desde el PR 5 (SCOPES_OCULTOS_EN_PANTALLA vacía) la pantalla ofrece messenger:write.
  const lista = await gestionar("JHON", { action: "list" });
  check(lista.estado === 200 && (lista.json.scope_catalog ?? []).some((x: Fila) => x.key === "messenger:write")
      && (lista.json.scope_catalog ?? []).some((x: Fila) => x.key === "messenger:read"),
    `list: 200 y la pantalla ofrece messenger:write → ${lista.estado}`);

  // Lo que manda la pantalla al crear una key que escribe. Sin cada pieza, 400 y nada.
  const escribe = {
    action: "create", name: "Escribe", scopes: ["messenger:read", "messenger:write"], ip_whitelist: ["5.6.7.8"], expires_in_days: 30,
    acknowledge_messenger_reads_as: JHON, acknowledge_messenger_writes_as: JHON, display_name: "Kappa Bot",
  };
  const antes = await llaves();
  const sinConfirmar = await gestionar("JHON", { ...escribe, acknowledge_messenger_writes_as: undefined });
  check(sinConfirmar.estado === 400 && /mandar mensajes en el Messenger a TU nombre/.test(sinConfirmar.json.error ?? ""),
    `crear con write sin la confirmación: 400 → ${d(sinConfirmar)}`);
  const confirmaOtro = await gestionar("JHON", { ...escribe, acknowledge_messenger_writes_as: ALVARO });
  check(confirmaOtro.estado === 400 && /a TU nombre/.test(confirmaOtro.json.error ?? ""), `la confirmación de otro admin no vale: 400 → ${d(confirmaOtro)}`);
  const sinNombre = await gestionar("JHON", { ...escribe, display_name: undefined });
  check(sinNombre.estado === 400 && /necesita un nombre visible/.test(sinNombre.json.error ?? ""), `crear con write sin nombre visible: 400 → ${d(sinNombre)}`);
  const sinLeer = await gestionar("JHON", { ...escribe, scopes: ["messenger:write"] });
  check(sinLeer.estado === 400 && /va con el de leerlo/.test(sinLeer.json.error ?? ""), `crear con write sin read: 400 → ${d(sinLeer)}`);
  check(await llaves() === antes, "y ninguno de esos creó una key");

  // En regla: se crea, con el nombre visible y una integración nueva (no la de «BLU»).
  const creada = await gestionar("JHON", escribe);
  const integraciones = (await q(`select integracion_id::text i from public.api_keys where id <> $1`, [creada.json.id ?? null])).map((f) => f.i);
  check(creada.estado === 201 && creada.json.scopes?.join(",") === "messenger:read,messenger:write"
      && creada.json.api_display_name === "Kappa Bot" && typeof creada.json.key === "string"
      && typeof creada.json.integracion_id === "string" && !integraciones.includes(creada.json.integracion_id),
    `crear con messenger:write en regla: 201 con el nombre visible y una integración nueva → ${d(creada)}`);
  check(await llaves() === antes + 1, "y quedó UNA key");
  // Su fila de cupo la crea la base (sin ella, la escritura falla cerrada).
  check(Number((await q(`select count(*)::int c from public.api_escritura_cupos where clave = $1`, [`llave:${creada.json.id}`]))[0].c) === 1,
    "la base creó la fila de cupo de la key nueva");

  // A una key que ya existe no se le suma write (aunque ya lea el Messenger).
  const lee = await gestionar("JHON", {
    action: "create", name: "Lector", scopes: ["messenger:read"], ip_whitelist: ["5.6.7.8"], expires_in_days: 30, acknowledge_messenger_reads_as: JHON,
  });
  check(lee.estado === 201 && lee.json.scopes?.join(",") === "messenger:read", `crear con messenger:read: 201 → ${d(lee)}`);
  const sumarWrite = await gestionar("JHON", { action: "update", id: lee.json.id, scopes: ["messenger:read", "messenger:write"] });
  check(sumarWrite.estado === 400 && /solo se puede poner al crear una key nueva/.test(sumarWrite.json.error ?? ""), `editar sumando messenger:write: 400 → ${d(sumarWrite)}`);

  // La rotación: «Escribe» se revoca y la nueva la reemplaza. Hereda la integración y el
  // nombre (no hace falta mandarlo). Un nombre de OTRA integración («BLU», de Alvaro)
  // no se puede usar, y reemplazar una key ajena tampoco.
  const revocada = await gestionar("JHON", { action: "revoke", id: creada.json.id });
  check(revocada.estado === 200, `revocar «Escribe»: 200 → ${d(revocada)}`);
  const ocupado = await gestionar("JHON", { ...escribe, name: "Otra", display_name: "BLU" });
  check(ocupado.estado === 400 && /ya usó ese nombre visible/.test(ocupado.json.error ?? ""), `el nombre de otra integración: 400 → ${d(ocupado)}`);
  const ajena = await gestionar("JHON", { ...escribe, name: "Ajena", display_name: undefined, replaces_key_id: LLAVES.BLU.id });
  check(ajena.estado === 400 && /tiene que ser tuya/.test(ajena.json.error ?? ""), `reemplazar la key de Alvaro: 400 → ${d(ajena)}`);
  const rotada = await gestionar("JHON", { ...escribe, name: "Escribe 2", display_name: undefined, replaces_key_id: creada.json.id });
  check(rotada.estado === 201 && rotada.json.integracion_id === creada.json.integracion_id && rotada.json.api_display_name === "Kappa Bot",
    `la rotación desde una key revocada: 201, misma integración y mismo nombre → ${d(rotada)}`);

  // El nombre visible de «BLU» lo cambia solo Alvaro: un admin que no es su dueño, no.
  const ajeno = await gestionar("JHON", { action: "update", id: LLAVES.BLU.id, display_name: "Kappa Bot" });
  check(ajeno.estado === 403 && ajeno.json.error === "Solo la persona dueña de la key puede cambiar su nombre visible",
    `Jhon (admin) renombra «BLU» de Alvaro: 403 → ${d(ajeno)}`);
  const nombre = async () => (await q(`select api_display_name n from public.api_keys where id = $1`, [LLAVES.BLU.id]))[0]?.n;
  check(await nombre() === "BLU", "y «BLU» sigue llamándose «BLU»");
  const propio = await gestionar("ALVARO", { action: "update", id: LLAVES.BLU.id, display_name: "BLU Bot" });
  check(propio.estado === 200 && propio.json.api_display_name === "BLU Bot" && await nombre() === "BLU Bot", `Alvaro renombra su «BLU»: 200 → ${d(propio)}`);
  const reservado = await gestionar("ALVARO", { action: "update", id: LLAVES.BLU.id, display_name: "Soporte Maven" });
  check(reservado.estado === 400 && /se parece al de Maven o al de un área/.test(reservado.json.error ?? ""), `un nombre reservado: el MV422 de la base, traducido → ${d(reservado)}`);
}

console.log(`\n${ok.length} ok, ${mal.length} mal`);
for (const m of mal) console.log("  ✗ " + m);
if (Deno.args.includes("-v")) for (const m of ok) console.log("  ✓ " + m);
globalThis.fetch = fetchOriginal;
Deno.exit(mal.length ? 1 : 0);
