// La base de la escritura del Messenger por API (migración
// 20261001200000_api_messenger_escritura.sql), probada contra un Postgres de verdad
// (PGlite) cargado con el esquema de PROD: el fixture del 28/09
// (fixtures/prod_chat_api_20260928.sql) más el complementario del 01/10
// (fixtures/prod_api_escritura_20261001.sql: api_keys, role_groups y
// get_karma_profile), los dos con sus huellas.
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/api_messenger_escritura.ts
//
// Cómo está armado:
//   0. Las huellas: los fixtures son prod, y el fixture del 28/09 más las migraciones
//      que prod ya tiene (la A y el 1b) da lo mismo que prod el 01/10 para todo lo
//      que B reemplaza o compone.
//   1. Sobre los fixtures se aplican, en orden, TODAS las migraciones reales
//      posteriores al fixture que tocan el Messenger o las keys (la A incluida) y la
//      B. Las que no tocan nada de eso se saltan y se listan.
//   2. Cada sección arma una base nueva y prueba un tema. Donde se puede, con una
//      línea base que PUEDE fallar (lo mismo sin la B, o con la sesión de la app).
//   3. La vuelta atrás que documenta la migración (las líneas «--|») se corre tal cual.
//   4. Mutantes: versiones de la B con una pieza rota; cada una tiene que hacer
//      fallar al menos una prueba (si no, esa prueba no prueba nada).
//
// Las sesiones son como las arma PostgREST: una transacción, el rol y los claims del
// JWT. La de la app no trae `mvf`; la fabricada por el edge (PR 4) trae `mvf` y, si
// viene de una key, `mvk`. PGlite tiene UNA conexión: las carreras (dos keys a la vez
// en la misma conversación, la misma Idempotency-Key dos veces) se razonan con los
// candados (el de la key, el de la conversación y las filas de cupo), no se prueban
// aquí. Sale con código 1 si algo falla. Corre en el guard de cada PR.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FIXTURE = leer("./fixtures/prod_chat_api_20260928.sql");
const COMPLEMENTO = leer("./fixtures/prod_api_escritura_20261001.sql");
const NOMBRE_B = "20261001200000_api_messenger_escritura.sql";
const MIG_B = leer(`../migrations/${NOMBRE_B}`);
const VUELTA = MIG_B.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");

// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
type R = { ok: string[]; mal: string[] };
const nuevoR = (): R => ({ ok: [], mal: [] });
const TOTAL = nuevoR();
const check = (c: boolean, m: string, r: R = TOTAL) => (c ? r.ok : r.mal).push(m);
const msg = (e: unknown) => String((e as Error)?.message ?? e);
// deno-lint-ignore no-explicit-any
const codigoDe = (e: unknown) => String((e as any)?.code ?? "");
// deno-lint-ignore no-explicit-any
const detalleDe = (e: unknown) => String((e as any)?.detail ?? "");
const json = (s: string): Fila => { try { return JSON.parse(s); } catch { return {}; } };

// ─── La cadena de migraciones ────────────────────────────────────────────────
const FIXTURE_HASTA = "20260929180000"; // la última que tenía prod el 28/09
const PROD_HASTA = "20261001150000";    // la última del repo que prod tiene aplicada el 01/10 (la A, el 1b y karma_sin_anon)
const TABLAS_DE_INTERES = ["app_flags", "chat_archived", "chat_conversations", "chat_join_requests", "chat_message_deletions",
  "chat_messages", "chat_participants", "chat_pinned", "chat_reactions", "chat_read_receipts", "chat_space_conversations",
  "chat_spaces", "notification_preferences", "notification_settings", "notifications", "profiles", "push_subscriptions",
  "tenant_members", "tenants", "user_roles", "api_keys", "role_groups", "chat_conversaciones_creadas",
  "api_escritura_cupos", "api_escritura_idem"];
const sinComentarios = (s: string) => s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const FUNCIONES_DE_B = [...new Set([...sinComentarios(MIG_B).matchAll(/create\s+or\s+replace\s+function\s+public\.(\w+)/gi)].map((m) => m[1].toLowerCase()))];
const FUNCIONES_DE_INTERES = new Set(["current_tenant_id", "delete_chat_message", "delete_conversation_cascade", "get_karma_profile",
  "get_unread_counts", "guard_chat_message_update", "handle_new_user", "is_chat_admin", "is_chat_participant", "notify_chat_message",
  "push_chat_message", "chat_conversations_agencia", "chat_participants_agencia", "chat_messages_al_insertar", "chat_directo_con",
  "chat_llave_de_par", "profiles_nombre_lo_cambia_un_admin", "api_key_persona_vigente", "api_key_vigente", "api_key_consumir",
  "api_keys_reglas_messenger", "api_keys_validar_actua_como", "api_keys_asignar_agencia", "send_karma", ...FUNCIONES_DE_B]);
const DE_INTERES = new Set([...TABLAS_DE_INTERES, ...FUNCIONES_DE_INTERES]);
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
  for (const p of patrones) for (const m of s.matchAll(p)) if (DE_INTERES.has(m[1].toLowerCase())) hits.add(m[1].toLowerCase());
  return [...hits].sort();
}
// Migraciones que tocan objetos de este banco pero necesitan tablas que sus fixtures no traen.
// Se prueban en su propio banco, con el motivo al lado.
const NO_CARGAN_AQUI: Record<string, string> = {
  "20261111100000_backstage_equipo.sql":
    "Backstage manda el equipo (POST /equipo/sync): el interruptor, la bitácora y las RPC api_equipo_*. Entra a " +
    "esta cadena solo porque cambia rol, nivel, horario y la papelera de profiles/user_roles y lee api_keys, pero " +
    "usa es_admin_o_dueno, roles_config, tenant_owners y cuenta_eventos, que este fixture no trae; no toca nada del " +
    "Messenger. Se prueba en su propio banco, equipo_backstage.ts.",
  "20261111030000_fuera_de_cowork_solo_su_turno.sql":
    "Cowork: el arreglo de «fuera de Cowork» (solo si entró para su turno). Entra a esta cadena solo porque su " +
    "vigía inserta avisos en notifications, pero usa las tablas del reloj de Cowork y es_admin_o_dueno, que este " +
    "fixture no trae; no toca nada del Messenger.",
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
const DIR_MIG = new URL("../migrations/", import.meta.url);
const CADENA: { n: string; sql: string }[] = [];
const SALTADAS: string[] = [];
for (const n of [...Deno.readDirSync(DIR_MIG)].map((e) => e.name).filter((x) => /^\d{14}_\w+\.sql$/.test(x) && x.slice(0, 14) > FIXTURE_HASTA).sort()) {
  const sql = Deno.readTextFileSync(new URL(n, DIR_MIG));
  if (NO_CARGAN_AQUI[n]) SALTADAS.push(n);
  else if (n === NOMBRE_B || objetivos(sql).length) CADENA.push({ n, sql }); else SALTADAS.push(n);
}
const ANTES_DE_B = CADENA.filter((m) => m.n < NOMBRE_B);
const DESPUES_DE_B = CADENA.filter((m) => m.n > NOMBRE_B);

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) {
    await db.exec("rollback").catch(() => {});
    throw new Error(`la migración ${nombre} no carga sobre los fixtures: ${msg(e)}`);
  }
}

// ─── Gente, conversaciones y keys del ensayo ─────────────────────────────────
const T1 = "10000000-0000-4000-8000-000000000001";
const T2 = "10000000-0000-4000-8000-000000000002";
const JHON = "a0000000-0000-4000-8000-000000000001";   // admin de Maven
const ANA = "a0000000-0000-4000-8000-000000000002";
const BETO = "a0000000-0000-4000-8000-000000000003";
const CARLA = "a0000000-0000-4000-8000-000000000004";
const DANI = "a0000000-0000-4000-8000-000000000005";
const ALVARO = "a0000000-0000-4000-8000-000000000006"; // la persona de «BLU»
const NUEVA = "a0000000-0000-4000-8000-000000000007";  // alta después de la migración, sin sello
const SELLADA = "a0000000-0000-4000-8000-000000000008"; // alta después, con el sello de admin
const BAJA = "a0000000-0000-4000-8000-000000000009";   // dada de baja
const BLOQ = "a0000000-0000-4000-8000-00000000000a";   // bloqueada
const relleno = (i: number) => `b0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const DM_AJ = "c0000000-0000-4000-8000-000000000001";  // Alvaro (admin) + Jhon
const DM_JA = "c0000000-0000-4000-8000-000000000002";  // Jhon (admin) + Ana
const G = "c0000000-0000-4000-8000-000000000003";      // «Grupo»: Alvaro (admin), Jhon, Ana, Beto, Carla
const G_ANUNCIOS = "c0000000-0000-4000-8000-000000000004"; // msg_permission = admins; Jhon admin, Alvaro member
const G50 = "c0000000-0000-4000-8000-000000000005";    // Alvaro + 49
const G51 = "c0000000-0000-4000-8000-000000000006";    // Alvaro + 50
const G_SIN = "c0000000-0000-4000-8000-000000000007";  // Ana + Beto (sin Alvaro)
const DMV1 = "c0000000-0000-4000-8000-000000000008";   // Alvaro + Dani, viejo (mensaje de hace 2 días)
const DMV2 = "c0000000-0000-4000-8000-000000000009";   // Alvaro + Dani, viejo (mensaje de ayer): el canónico
const M_G_ANA = "e0000000-0000-4000-8000-000000000001";
const M_G_HILO = "e0000000-0000-4000-8000-000000000002"; // de Beto, en hilo de M_G_ANA
const M_G_BORRADO = "e0000000-0000-4000-8000-000000000003";
const M_SIN = "e0000000-0000-4000-8000-000000000004";    // en G_SIN
const M_ALV_MANO = "e0000000-0000-4000-8000-000000000005"; // de Alvaro, escrito a mano, en G
const K_BLU = "20000000-0000-4000-8000-000000000001";  // Alvaro, write, «BLU»
const K_BLU2 = "20000000-0000-4000-8000-000000000002"; // Alvaro, la rotación de «BLU» (misma integración)
const K_WEB = "20000000-0000-4000-8000-000000000003";  // Alvaro, write, «Kash Web» (otra integración)
const K_PANEL = "20000000-0000-4000-8000-000000000004"; // Jhon, write, «Panel QA»
const K_LEE = "20000000-0000-4000-8000-000000000005";  // Alvaro, solo messenger:read
const K_CREA = "20000000-0000-4000-8000-000000000006"; // Alvaro, creators:read (no es de Messenger)
const K_REV = "20000000-0000-4000-8000-000000000007";  // Alvaro, write, revocada
const K_VENC = "20000000-0000-4000-8000-000000000008"; // Alvaro, write, vencida
const K_NEXO = "20000000-0000-4000-8000-000000000009"; // Carla, write, «Nexo», vencida y revocada
const I_BLU = "30000000-0000-4000-8000-000000000001";
const I_PANEL = "30000000-0000-4000-8000-000000000002";

const persona = (id: string, nombre: string, extra = "") => `('${id}', '${nombre.toLowerCase().replace(/ /g, ".")}@ejemplo.test', '{"full_name":"${nombre}"}', ${extra || "'{}', '2026-09-01 10:00+00'"})`;
const SEMILLA = `
insert into public.tenants(id, slug, name) values ('${T1}', 'asm-tech', 'ASM Tech');
insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data, created_at) values
  ${persona(JHON, "Jhon Lopez")}, ${persona(ANA, "Ana Ruiz")}, ${persona(BETO, "Beto Paz")}, ${persona(CARLA, "Carla Gil")},
  ${persona(DANI, "Dani Mora")}, ${persona(ALVARO, "Alvaro Diaz")},
  ${persona(NUEVA, "Nora Vidal", "'{}', now()")}, ${persona(SELLADA, "Sara Luna", `'{"alta":"admin"}', now()`)},
  ${persona(BAJA, "Bruno Sanz")}, ${persona(BLOQ, "Lia Mar")},
  ${Array.from({ length: 52 }, (_, i) => persona(relleno(i + 1), `Persona ${i + 1}`)).join(",\n  ")};
update public.profiles set deleted_at = now() where id = '${BAJA}';
update auth.users set banned_until = now() + interval '30 days' where id = '${BLOQ}';
insert into public.role_groups(role_name, is_admin) values ('admin', true), ('employee', false);
insert into public.user_roles(user_id, role) values ('${JHON}', 'admin');
insert into public.chat_conversations(id, type, name, created_by, created_at, msg_permission) values
  ('${DM_AJ}', 'direct', null, '${ALVARO}', '2026-09-01 10:00+00', 'all'),
  ('${DM_JA}', 'direct', null, '${JHON}', '2026-09-01 11:00+00', 'all'),
  ('${G}', 'group', 'Grupo', '${ALVARO}', '2026-09-02 10:00+00', 'all'),
  ('${G_ANUNCIOS}', 'group', 'Anuncios', '${JHON}', '2026-09-02 11:00+00', 'admins'),
  ('${G50}', 'group', 'Cincuenta', '${ALVARO}', '2026-09-03 10:00+00', 'all'),
  ('${G51}', 'group', 'Cincuenta y uno', '${ALVARO}', '2026-09-03 11:00+00', 'all'),
  ('${G_SIN}', 'group', 'Sin Alvaro', '${ANA}', '2026-09-04 10:00+00', 'all'),
  ('${DMV1}', 'direct', null, '${ALVARO}', '2026-09-05 10:00+00', 'all'),
  ('${DMV2}', 'direct', null, '${DANI}', '2026-09-06 10:00+00', 'all');
insert into public.chat_participants(conversation_id, user_id, role) values
  ('${DM_AJ}', '${ALVARO}', 'admin'), ('${DM_AJ}', '${JHON}', 'member'),
  ('${DM_JA}', '${JHON}', 'admin'), ('${DM_JA}', '${ANA}', 'member'),
  ('${G}', '${ALVARO}', 'admin'), ('${G}', '${JHON}', 'member'), ('${G}', '${ANA}', 'member'), ('${G}', '${BETO}', 'member'), ('${G}', '${CARLA}', 'member'),
  ('${G_ANUNCIOS}', '${JHON}', 'admin'), ('${G_ANUNCIOS}', '${ALVARO}', 'member'),
  ('${G50}', '${ALVARO}', 'admin'), ('${G51}', '${ALVARO}', 'admin'),
  ('${G_SIN}', '${ANA}', 'admin'), ('${G_SIN}', '${BETO}', 'member'),
  ('${DMV1}', '${ALVARO}', 'admin'), ('${DMV1}', '${DANI}', 'member'),
  ('${DMV2}', '${DANI}', 'admin'), ('${DMV2}', '${ALVARO}', 'member');
insert into public.chat_participants(conversation_id, user_id, role)
  select '${G50}', ('b0000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'member' from generate_series(1, 49) g;
insert into public.chat_participants(conversation_id, user_id, role)
  select '${G51}', ('b0000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'member' from generate_series(1, 50) g;
insert into public.chat_messages(id, conversation_id, sender_id, content, created_at, reply_to_id, is_thread_reply, is_deleted) values
  ('${M_G_ANA}', '${G}', '${ANA}', 'hola grupo', now() - interval '3 hours', null, false, false),
  ('${M_G_HILO}', '${G}', '${BETO}', 'respondo en el hilo', now() - interval '2 hours', '${M_G_ANA}', true, false),
  ('${M_G_BORRADO}', '${G}', '${ANA}', null, now() - interval '2 hours', null, false, true),
  ('${M_SIN}', '${G_SIN}', '${ANA}', 'sin Alvaro', now() - interval '2 hours', null, false, false),
  ('${M_ALV_MANO}', '${G}', '${ALVARO}', 'escrito a mano', now() - interval '90 minutes', null, false, false),
  (gen_random_uuid(), '${DMV1}', '${DANI}', 'viejo 1', now() - interval '2 days', null, false, false),
  (gen_random_uuid(), '${DMV2}', '${DANI}', 'viejo 2', now() - interval '1 day', null, false, false);
`;
// Las keys, con los triggers de prod y los de la B (las reglas de Messenger piden IPs y
// vencimiento). Y el freno con fuentes declaradas: valores fijos que cada prueba cambia.
const llave = (id: string, quien: string, scopes: string, nombre: string | null, extra: Fila = {}) =>
  `insert into public.api_keys(id, name, key_prefix, key_hash, created_by, acts_as_user_id, tenant_id, scopes, ip_whitelist, expires_at, api_display_name${extra.integracion ? ", integracion_id" : ""})
   values ('${id}', 'k${id.slice(-2)}', 'mvk_live_x', 'h${id}', '${quien}', '${quien}', '${T1}', '${scopes}', '{1.2.3.4}', now() + interval '30 days', ${nombre === null ? "null" : `'${nombre}'`}${extra.integracion ? `, '${extra.integracion}'` : ""});`;
const FUENTES_DECLARADAS = `
create schema banco;
create table banco.presion (senal text primary key, valor numeric, medible boolean not null);
insert into banco.presion values ('backends', 3, true), ('slot', 1024, true), ('cola', 0, true);
create or replace function public.api_fuente_backends() returns table (valor numeric, medible boolean) language sql security definer set search_path = pg_catalog, pg_temp
  as $f$ select p.valor, p.medible from banco.presion p where p.senal = 'backends' $f$;
create or replace function public.api_fuente_slot() returns table (valor numeric, medible boolean) language sql security definer set search_path = pg_catalog, pg_temp
  as $f$ select p.valor, p.medible from banco.presion p where p.senal = 'slot' $f$;
create or replace function public.api_fuente_cola() returns table (valor numeric, medible boolean) language sql security definer set search_path = pg_catalog, pg_temp
  as $f$ select p.valor, p.medible from banco.presion p where p.senal = 'cola' $f$;`;
const SEMILLA_B = `
${llave(K_BLU, ALVARO, "{messenger:read,messenger:write}", "BLU", { integracion: I_BLU })}
${llave(K_BLU2, ALVARO, "{messenger:read,messenger:write}", "BLU", { integracion: I_BLU })}
${llave(K_WEB, ALVARO, "{messenger:read,messenger:write}", "Kash Web")}
${llave(K_PANEL, JHON, "{messenger:read,messenger:write}", "Panel QA", { integracion: I_PANEL })}
${llave(K_LEE, ALVARO, "{messenger:read}", null)}
${llave(K_CREA, ALVARO, "{creators:read}", null)}
${llave(K_REV, ALVARO, "{messenger:read,messenger:write}", "Robot Rev")}
${llave(K_VENC, ALVARO, "{messenger:read,messenger:write}", "Robot Venc")}
${llave(K_NEXO, CARLA, "{messenger:read,messenger:write}", "Nexo")}
update public.api_keys set revoked_at = now() where id in ('${K_REV}', '${K_NEXO}');
update public.api_keys set expires_at = now() - interval '1 minute' where id in ('${K_VENC}', '${K_NEXO}');
${FUENTES_DECLARADAS}
update public.app_flags set enabled = true where key = 'api_messenger_escritura';
`;

async function nueva(migB = MIG_B, extra = ""): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(COMPLEMENTO);
  await db.exec(SEMILLA);
  for (const m of ANTES_DE_B) await aplicar(db, m.n, m.sql);
  await aplicar(db, NOMBRE_B, migB);
  for (const m of DESPUES_DE_B) await aplicar(db, m.n, m.sql);
  await db.exec(SEMILLA_B + extra);
  return db;
}
// prod el 01/10: los fixtures + las migraciones que prod ya tiene (la A, el 1b y karma_sin_anon).
async function prodHoy(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(COMPLEMENTO);
  await db.exec(SEMILLA);
  for (const m of ANTES_DE_B.filter((x) => x.n.slice(0, 14) <= PROD_HASTA)) await aplicar(db, m.n, m.sql);
  return db;
}
const q = async (db: PGlite, sql: string, p: unknown[] = []) => (await db.query(sql, p)).rows as Fila[];
const uno = async (db: PGlite, sql: string, p: unknown[] = []) => (await q(db, sql, p))[0];

// ─── Sesiones ────────────────────────────────────────────────────────────────
type Sesion = { claims: Fila | null; rol: string | null; nombre: string };
const app = (uid: string, extra: Fila = {}): Sesion => ({ claims: { sub: uid, role: "authenticated", aud: "authenticated", ...extra }, rol: "authenticated", nombre: `app:${uid.slice(-2)}` });
const api = (uid: string, k: string): Sesion => ({ claims: { sub: uid, role: "authenticated", aud: "authenticated", mvf: true, mvk: k }, rol: "authenticated", nombre: `api:${k.slice(-2)}` });
const fabricada = (uid: string): Sesion => ({ claims: { sub: uid, role: "authenticated", aud: "authenticated", mvf: true }, rol: "authenticated", nombre: `mvf:${uid.slice(-2)}` });
// Tokens con los claims «editados»: lo que no fabrica el edge, pero que la base tiene
// que tratar igual de fabricado (un solo predicado: trae `mvf` o `mvk`, aunque sea null).
const soloMvk = (uid: string, k = K_BLU): Sesion => ({ claims: { sub: uid, role: "authenticated", aud: "authenticated", mvk: k }, rol: "authenticated", nombre: `solo-mvk:${uid.slice(-2)}` });
const mvfNull = (uid: string): Sesion => ({ claims: { sub: uid, role: "authenticated", aud: "authenticated", mvf: null }, rol: "authenticated", nombre: `mvf-null:${uid.slice(-2)}` });
const mvkNull = (uid: string): Sesion => ({ claims: { sub: uid, role: "authenticated", aud: "authenticated", mvk: null }, rol: "authenticated", nombre: `mvk-null:${uid.slice(-2)}` });
const mvfNullConMvk = (uid: string, k = K_BLU): Sesion => ({ claims: { sub: uid, role: "authenticated", aud: "authenticated", mvf: null, mvk: k }, rol: "authenticated", nombre: `mvf-null+mvk:${uid.slice(-2)}` });
// Un JWT de GoTrue de verdad: user_metadata (que la persona sí controla) con mvf y mvk adentro.
const gotrue = (uid: string): Sesion => ({ claims: { iss: "https://lsagslbkliprespbyhts.supabase.co/auth/v1", sub: uid, aud: "authenticated", exp: 9999999999,
  email: "x@ejemplo.test", app_metadata: { provider: "email", alta: "admin" }, user_metadata: { full_name: "x", mvf: true, mvk: K_BLU },
  role: "authenticated", aal: "aal1", session_id: "5f0c0e2a-1111-4222-8333-944444444444", is_anonymous: false }, rol: "authenticated", nombre: `gotrue:${uid.slice(-2)}` });
const SR: Sesion = { claims: { role: "service_role" }, rol: "service_role", nombre: "service_role" };
const SR_CON_MVK = (k: string): Sesion => ({ claims: { role: "service_role", mvf: true, mvk: k }, rol: "service_role", nombre: "service_role+mvk" });
const ANON: Sesion = { claims: { role: "anon" }, rol: "anon", nombre: "anon" };
const PG: Sesion = { claims: null, rol: null, nombre: "postgres" };
const BLU = api(ALVARO, K_BLU);

async function entrar(db: PGlite, s: Sesion) {
  await db.exec("reset role");
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [s.claims ? JSON.stringify(s.claims) : ""]);
  if (s.rol) await db.exec(`set local role ${s.rol}`);
}
async function como(db: PGlite, s: Sesion, sql: string, p?: unknown[]): Promise<Fila[]> {
  await db.exec("begin");
  try {
    await entrar(db, s);
    const rows = p ? (await db.query(sql, p)).rows as Fila[] : ((await db.exec(sql)).at(-1)?.rows ?? []) as Fila[];
    await db.exec("commit");
    return rows;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
// deno-lint-ignore no-explicit-any
type Res = { ok: true; r: any; filas: Fila[] } | { ok: false; codigo: string; texto: string; det: Fila };
async function intentar(db: PGlite, s: Sesion, sql: string, p?: unknown[]): Promise<Res> {
  try { const filas = await como(db, s, sql, p); return { ok: true, r: filas[0]?.r, filas }; }
  catch (e) { return { ok: false, codigo: codigoDe(e), texto: msg(e), det: json(detalleDe(e)) }; }
}
// Una RPC, con argumentos con nombre (como PostgREST).
const rpc = (db: PGlite, s: Sesion, fn: string, args: Fila) =>
  intentar(db, s, `select public.${fn}(${Object.keys(args).map((k, i) => `${k} => $${i + 1}`).join(", ")}) r`, Object.values(args));
let idemN = 0;
const idem = () => `pedido-${String(++idemN).padStart(6, "0")}`;
const enviar = (db: PGlite, s: Sesion, conv: string, texto: string, extra: Fila = {}) =>
  rpc(db, s, "api_messenger_enviar", { _conversacion: conv, _texto: texto, _responde_a: extra.responde ?? null, _en_hilo: extra.hilo ?? false, _idem: extra.idem ?? idem() });
const abrir = (db: PGlite, s: Sesion, con: string, texto: string, idemKey = idem()) =>
  rpc(db, s, "api_messenger_abrir_directo", { _con: con, _texto: texto, _idem: idemKey });
const editar = (db: PGlite, s: Sesion, conv: string, mid: string, texto: string) =>
  rpc(db, s, "api_messenger_editar", { _conversacion: conv, _mensaje: mid, _texto: texto });
const borrar = (db: PGlite, s: Sesion, conv: string, mid: string) =>
  rpc(db, s, "api_messenger_borrar", { _conversacion: conv, _mensaje: mid });
const desc = (x: Res) => x.ok ? `ok ${JSON.stringify(x.r)?.slice(0, 90)}` : `${x.codigo} ${x.texto.slice(0, 90)} ${JSON.stringify(x.det)}`;
// El rechazo esperado: SQLSTATE y, si se pide, el campo del detail (error / limite / motivo).
function rechazo(x: Res, codigo: string, campo: string | null, valor: string | null, m: string, r: R = TOTAL) {
  const bien = !x.ok && x.codigo === codigo && (campo === null || x.det[campo] === valor);
  check(bien, `${m} → ${desc(x)}`, r);
  return bien;
}
function anda(x: Res, m: string, r: R = TOTAL) { check(x.ok, `${m}${x.ok ? "" : ` → ${desc(x)}`}`, r); return x.ok; }
const mensajeDe = (x: Res): Fila => (x.ok ? x.r?.message ?? {} : {});
const cupo = (db: PGlite, clave: string) => uno(db, `select * from public.api_escritura_cupos where clave = $1`, [clave]);
const envejecer = (db: PGlite, conv: string, minutos = 2) =>
  db.query(`update public.chat_messages set created_at = created_at - make_interval(mins => $2) where conversation_id = $1`, [conv, minutos]);
const presion = (db: PGlite, senal: string, valor: number | null, medible = true) =>
  db.query(`update banco.presion set valor = $2, medible = $3 where senal = $1`, [senal, valor, medible]);
// Sembrar filas sin que corran los triggers (como si ya estuvieran en la base).
async function sembrarSinTriggers(db: PGlite, sql: string) {
  await db.exec(`set session_replication_role = replica;\n${sql};\nset session_replication_role = origin;`);
}

// ════ 0. Los fixtures son prod, y la cadena ══════════════════════════════════
{
  // El fixture del 28/09: lo que B reemplaza tiene la huella de su cabecera.
  const huellas = (fx: string, re: RegExp) => new Map([...fx.split("\n").filter((l) => l.startsWith("--")).flatMap((l) => [...l.matchAll(re)])].map((m) => [m[1], m[2]]));
  const delFixture = huellas(FIXTURE, /^--\s+((?:auth|public)\.\w+)=([0-9a-f]{32})$/gm);
  const delComplemento = huellas(COMPLEMENTO, /^--\s+(public\.\w+)=([0-9a-f]{32})$/gm);
  const prodTrasA = huellas(COMPLEMENTO, /^--\s+prod\.((?:public|politicas)\.\w+)=([0-9a-f]{32})$/gm);
  check(delFixture.size === 27 && delComplemento.size === 10 && prodTrasA.size === 15,
    `huellas en las cabeceras: ${delFixture.size} del fixture del 28/09, ${delComplemento.size} del complementario y ${prodTrasA.size} de prod tras la A y el 1b`);
  const PRODSRC = `select n.nspname||'.'||p.proname k, md5(p.prosrc) h from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth')`;
  const POLITICAS = `select tablename k, md5(string_agg(policyname||'|'||permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''), E'\n' order by policyname)) h from pg_policies where schemaname='public' group by 1`;
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(COMPLEMENTO);
  const fs = new Map((await q(db, PRODSRC)).map((f) => [f.k, f.h]));
  const malF = [...delFixture].filter(([k, h]) => fs.get(k) !== h).map(([k]) => k);
  const malC = [...delComplemento].filter(([k, h]) => fs.get(k) !== h).map(([k]) => k);
  check(malF.length === 0 && malC.length === 0, `las funciones de los dos fixtures son las de prod byte a byte${malF.length + malC.length ? ` — distintas: ${[...malF, ...malC].join(", ")}` : ""}`);
  const est = await q(db, `with t as (select c.oid, c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname in ('api_keys','role_groups'))
    select t.relname k,
      md5((select string_agg(a.attname||' '||format_type(a.atttypid,a.atttypmod)||coalesce(' default '||pg_get_expr(d.adbin,d.adrelid),'')||case when a.attnotnull then ' nn' else '' end, ',' order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=t.oid and a.attnum>0 and not a.attisdropped)) || ' ' ||
      md5(coalesce((select string_agg(k.conname||' '||pg_get_constraintdef(k.oid), ',' order by k.conname) from pg_constraint k where k.conrelid=t.oid),'')) || ' ' ||
      md5(coalesce((select string_agg(pg_get_indexdef(i.indexrelid), ',' order by pg_get_indexdef(i.indexrelid)) from pg_index i where i.indrelid=t.oid),'')) h,
      (select md5(string_agg(pg_get_triggerdef(tg.oid)||':'||tg.tgenabled::text, E'\n' order by tg.tgname)) from pg_trigger tg where tg.tgrelid=t.oid and not tg.tgisinternal) trg
    from t order by 1`);
  const cab = (re: RegExp) => COMPLEMENTO.match(re)?.slice(1).join(" ");
  check(est[0]?.h === cab(/^--\s+api_keys ([0-9a-f]{32}) ([0-9a-f]{32}) ([0-9a-f]{32})$/m) && est[1]?.h === cab(/^--\s+role_groups ([0-9a-f]{32}) ([0-9a-f]{32}) ([0-9a-f]{32})$/m)
      && est[0]?.trg === cab(/^--\s+triggers\.api_keys=([0-9a-f]{32})$/m),
    `columnas, constraints, índices y triggers de api_keys y role_groups son los de prod (${est.map((e) => e.k).join(", ")})`);
  // Los permisos del karma, como quedaron en prod después de karma_sin_anon (sin
  // PUBLIC ni anon), en el fixture y después de la cadena (que la vuelve a correr).
  const acls = new Map([...COMPLEMENTO.matchAll(/^--\s+acl\.public\.(\w+)=(\{[^}]*\})$/gm)].map((m) => [m[1], m[2]]));
  const aclDe = async (d: PGlite) => new Map((await q(d, `select p.proname k, p.proacl::text v from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any($1)`, [[...acls.keys()]])).map((f) => [f.k, f.v]));
  const aclFx = await aclDe(db);
  check(acls.size === 2 && [...acls].every(([k, v]) => aclFx.get(k) === v && !v.includes("anon") && !v.startsWith("{=")),
    `get_karma_profile y send_karma tienen los permisos de prod (sin PUBLIC ni anon): ${[...aclFx].map(([k, v]) => `${k} ${v}`).join("; ")}`);
  const pol = new Map((await q(db, POLITICAS)).map((f) => [f.k, f.h]));
  check(pol.get("role_groups") === cab(/^--\s+politicas\.role_groups=([0-9a-f]{32})$/m) && !pol.has("api_keys"), "las políticas de role_groups son las de prod y api_keys no tiene ninguna (como en prod)");
  // Fixture del 28/09 + A = prod del 01/10 en todo lo que B reemplaza o compone.
  const hoy = await prodHoy();
  const aclHoy = await aclDe(hoy);
  check([...acls].every(([k, v]) => aclHoy.get(k) === v), "…y siguen así con la cadena (karma_sin_anon no cambia nada sobre el fixture)");
  const fh = new Map((await q(hoy, PRODSRC)).map((f) => [f.k, f.h]));
  const ph = new Map((await q(hoy, POLITICAS)).map((f) => [f.k, f.h]));
  const distintas = [...prodTrasA].filter(([k, h]) => (k.startsWith("politicas.") ? ph.get(k.slice(10)) : fh.get(k)) !== h).map(([k]) => k);
  check(distintas.length === 0, `con la A y el 1b aplicados, las ${prodTrasA.size} piezas que toca o compone la B son iguales a prod del 01/10${distintas.length ? ` — distintas: ${distintas.join(", ")}` : ""}`);
  const politicas28 = new Map([...FIXTURE.split("\n").filter((l) => l.startsWith("--") && !l.includes(".")).flatMap((l) => [...l.matchAll(/(\w+)=([0-9a-f]{32})/g)])].map((m) => [m[1], m[2]]));
  const cercadas = ["chat_conversations", "chat_reactions", "chat_read_receipts", "chat_pinned", "chat_archived", "chat_join_requests", "chat_spaces", "chat_space_conversations", "notifications", "chat_message_deletions"];
  const polMal = cercadas.filter((t) => ph.get(t) !== politicas28.get(t));
  check(polMal.length === 0, `las políticas de las otras ${cercadas.length} tablas que cerca la B siguen siendo las del 28/09, como en prod${polMal.length ? ` — distintas: ${polMal.join(", ")}` : ""}`);
  check(CADENA.at(-1)?.n === NOMBRE_B || DESPUES_DE_B.length > 0,
    `la cadena: ${CADENA.map((m) => m.n.slice(0, 14)).join(" → ")}; se saltan ${SALTADAS.length} (${SALTADAS.join(", ")})`);
}

// ════ 0b. Ningún carácter invisible literal en los fuentes ═══════════════════
// Un carácter de formato (dirección del texto, ancho cero) o de control literal en un
// fuente no se ve en la revisión y cambia lo que hace. Tampoco van escapes \uXXXX en
// la migración: un transporte que decodifica JSON (el MCP) los convierte en el
// carácter por el camino. Las clases se arman con chr().
{
  const raros = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Co}\p{Cs}]/u;
  const espacios = /\p{Zs}/u;
  for (const [nombre, texto] of [[NOMBRE_B, MIG_B], ["api_messenger_escritura.ts", Deno.readTextFileSync(new URL(import.meta.url))],
    ["fixtures/prod_api_escritura_20261001.sql", COMPLEMENTO]] as [string, string][]) {
    const malos = [...texto].map((c, i) => [c, i] as [string, number]).filter(([c]) => (raros.test(c) && c !== "\n" && c !== "\t") || (espacios.test(c) && c !== " "));
    check(malos.length === 0, `${nombre}: ningún carácter invisible ni de control literal${malos.length ? ` — hay ${malos.length}: ${malos.slice(0, 5).map(([c, i]) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")} en ${i}`).join(", ")}` : ""}`);
  }
  const escapes = sinComentarios(MIG_B).match(/\\u[0-9a-fA-F]{4}/g) ?? [];
  check(escapes.length === 0, `la migración no lleva escapes \\uXXXX en el SQL (${escapes.length})`);
}

// ════ 1. La forma de la migración ════════════════════════════════════════════
const FUERZA = ["accessshare", "rowshare", "rowexclusive", "shareupdateexclusive", "share", "sharerowexclusive", "exclusive", "accessexclusive"];
const fuerza = (m: string) => FUERZA.indexOf(m.toLowerCase().replace(/lock$/, "").replace(/\s+/g, ""));
const SE_LEEN_SIEMPRE = ["profiles", "tenants", "tenant_members", "user_roles", "role_groups"];
const DEJA_LEER = fuerza("share row exclusive");
const pedidosDe = (sql: string) =>
  [...sinComentarios(sql).matchAll(/\block\s+table\s+public\.(\w+)\s+in\s+([a-z ]+?)\s+mode/gi)].map((m) => ({ t: m[1], f: fuerza(m[2]) }));
const CANDADOS_TENIDOS = `select c.relname t, l.mode m from pg_locks l join pg_class c on c.oid = l.relation join pg_namespace n on n.oid = c.relnamespace
    where l.locktype = 'relation' and n.nspname = 'public' and c.relkind = 'r' and c.relname = any($1)`;
// Un candado de más: en una tabla que no se pidió (salvo una lectura: ACCESS SHARE),
// más fuerte que lo pedido, o uno que traba las lecturas de las tablas que se leen siempre.
function candadosDeMas(tenidos: Fila[], pedidos: { t: string; f: number }[]): string[] {
  return tenidos.filter((l) => {
    const p = pedidos.find((x) => x.t === l.t);
    return (p ? fuerza(l.m) > p.f : fuerza(l.m) > 0) || (SE_LEEN_SIEMPRE.includes(l.t) && fuerza(l.m) > DEJA_LEER);
  }).map((l) => `${l.t}:${l.m}`);
}
const MIS_CANDADOS = `(select coalesce(string_agg(c.relname || ':' || replace(l.mode, 'Lock', ''), ',' order by c.relname), '(ninguno)')
    from pg_locks l join pg_class c on c.oid = l.relation join pg_namespace n on n.oid = c.relnamespace
   where l.locktype = 'relation' and n.nspname = 'public' and c.relkind = 'r' and c.relname like any (array['chat_%', 'notifications', 'api_keys', 'app_flags']))`;
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
  if (!b.includes("'candado|") || !b.includes("'fallo|") || !b.includes("'handler|")) throw new Error("no pude inyectar el fallo");
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
  return { candados: partes("candado").map((x) => x[2]), handler: partes("handler").map((x) => x[2]), fallos: fallos.length,
    separaciones: fallos.slice(1).map((t, k) => t - fallos[k]), tras: partes("tras").map((x) => x[1]) };
}
const seSeparan = (s: number[]) => s.every((x) => x >= 0.95);
const QUE_QUEDO = `select (select count(*)::int from pg_attribute where attrelid = 'public.chat_messages'::regclass and attname = 'api_key_id') marca,
    (select count(*)::int from pg_class where relname in ('api_escritura_cupos', 'api_escritura_idem')) tablas,
    (select count(*)::int from pg_policies where policyname like 'api_fabricada_%') cerco,
    current_setting('lock_timeout') lock_timeout`;
{
  const primera = (s: string) => s.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("--"));
  check(primera(MIG_B) === "set lock_timeout = '3s';", "la migración arranca con set lock_timeout = '3s'");
  const sc = sinComentarios(MIG_B);
  const pedidos = pedidosDe(MIG_B);
  const tras = sc.slice(sc.indexOf("set lock_timeout = '3s';") + 1, sc.search(/\block\s+table\b/i));
  check(pedidos.length === 14 && !/\b(create|alter|drop|insert|update|delete|grant|revoke)\b/i.test(tras),
    `los ${pedidos.length} candados se piden antes de cualquier otra sentencia`);
  const orden = ["chat_messages", "chat_conversations", "chat_participants", "notifications"].map((t) => pedidos.findIndex((p) => p.t === t));
  check(orden.every((i, k) => i >= 0 && (k === 0 || i > orden[k - 1])) && orden[0] === 0,
    `en el orden en que los toma un INSERT de mensaje (${pedidos.map((p) => p.t).join(" → ")})`);
  check(/set_config\('lock_timeout',\s*'200ms',\s*true\)/.test(sc) && /exception\s+when\s+lock_not_available\s+or\s+deadlock_detected/i.test(sc),
    "cada candado espera como mucho 200 ms, y si no llega se sueltan todos y se reintenta");
  check(!pedidos.some((p) => SE_LEEN_SIEMPRE.includes(p.t)), "profiles, tenants y las tablas de roles no se piden: B solo las lee");
  // Con la migración entera corrida (sin commit), qué candados se tienen.
  const db = await prodHoy();
  const existentes = (await q(db, `select c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`)).map((f) => f.t as string);
  await db.exec("begin;\n" + MIG_B);
  const tenidos = await q(db, CANDADOS_TENIDOS, [existentes]);
  await db.exec("rollback");
  const deMas = candadosDeMas(tenidos, pedidos);
  const fuertesPedidos = pedidos.every((p) => tenidos.some((t) => t.t === p.t && fuerza(t.m) === p.f));
  check(fuertesPedidos && deMas.length === 0,
    `con la migración entera corrida, ninguna tabla que ya existía tiene un candado más fuerte que el pedido al principio, y las que no se pidieron solo se leen (${tenidos.length} candados${deMas.length ? `; de más: ${deMas.join(", ")}` : ""})`);
  // La vuelta atrás, sobre la migración ya aplicada.
  const pedidosV = pedidosDe(VUELTA);
  const antesV = VUELTA.slice(VUELTA.indexOf("begin;") + "begin;".length, Math.max(0, VUELTA.search(/\block\s+table\b/i)));
  check(pedidosV.length === 5 && !/\b(create|alter|drop|insert|update|delete|grant|revoke)\b/i.test(antesV),
    `la vuelta atrás también pide sus ${pedidosV.length} candados antes de cualquier otra sentencia`);
  const dbV = await nueva();
  const existentesV = (await q(dbV, `select c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`)).map((f) => f.t as string);
  await dbV.exec(VUELTA.trim().replace(/commit;\s*$/, ""));
  const tenidosV = await q(dbV, CANDADOS_TENIDOS, [existentesV]);
  await dbV.exec("rollback");
  const deMasV = candadosDeMas(tenidosV, pedidosV);
  check(tenidosV.length >= pedidosV.length && deMasV.length === 0,
    `con la vuelta atrás entera corrida, ninguna tabla tiene un candado más fuerte que el pedido al principio (${tenidosV.length} candados${deMasV.length ? `; de más: ${deMasV.join(", ")}` : ""})`);

  // Con un candado ocupado: 2 fallos y entra; 8 fallos y se rinde sin dejar nada.
  const nB = pedidos.length;
  for (const fallos of [2, 8]) {
    const d = await prodHoy();
    const r = await ensayarCandados(d, "begin;\n" + conFallosInyectados(MIG_B, fallos) + "\ncommit;");
    const a = leerAvisos(r.avisos);
    const quedo = await uno(d, QUE_QUEDO);
    if (fallos === 2) {
      check(r.error === null && quedo?.marca === 1 && quedo?.tablas === 2 && quedo?.cerco === 29,
        `migración con 2 candados ocupados: se aplica al tercer intento${r.error ? ` — falló: ${r.error.slice(0, 120)}` : ` (${quedo?.cerco} políticas del cerco)`}`);
      check(a.candados.length === 3 * nB && a.candados.every((t) => t === "200ms"), `…cada uno de los ${a.candados.length} pedidos de candado espera con lock_timeout = 200ms`);
      check(a.handler.length === 2 && a.handler.every((h) => h === "(ninguno)"), `…el intento que falla suelta todos los candados antes de dormir (${a.handler.join(" / ")})`);
      check(a.separaciones.length === 1 && seSeparan(a.separaciones), `…entre intentos pasa 1 s o más (${a.separaciones.map((x) => x.toFixed(2)).join(", ")} s)`);
      check(a.tras.length === 1 && a.tras[0] === "3s" && quedo?.lock_timeout === "0", `…con todo tomado sigue con lock_timeout = 3s y al terminar la sesión queda como estaba (${a.tras.join(",")} / ${quedo?.lock_timeout})`);
    } else {
      check(/api_candados/.test(r.error ?? "") && a.fallos === 8 && a.handler.every((h) => h === "(ninguno)") && seSeparan(a.separaciones),
        `migración con el candado ocupado 8 veces: se rinde con api_candados, soltando todo entre intentos → ${(r.error ?? "SE APLICÓ").slice(0, 80)}`);
      check(quedo?.marca === 0 && quedo?.tablas === 0 && quedo?.cerco === 0, `…y no queda nada aplicado (${JSON.stringify(quedo)})`);
    }
  }
  {
    const d = await nueva();
    const r = await ensayarCandados(d, conFallosInyectados(VUELTA, 8));
    const a = leerAvisos(r.avisos);
    const trig = await uno(d, `select count(*)::int n from pg_trigger where tgname in ('chat_messages_api', 'chat_messages_api_editar', 'chat_conversations_api', 'chat_participants_api')`);
    check(/api_candados/.test(r.error ?? "") && a.fallos === 8 && a.candados.every((t) => t === "200ms") && a.handler.every((h) => h === "(ninguno)") && trig?.n === 4,
      `vuelta atrás con el candado ocupado 8 veces: pide cada candado con 200 ms, suelta todo y se rinde sin deshacer nada a medias (${a.fallos} fallos, ${trig?.n} triggers siguen)`);
  }

  // Nada reescribe filas de las tablas del chat (mismo xmin), y api_keys queda con
  // integracion_id = id (las 3 de prod: aquí, las que haya).
  {
    const d = await prodHoy();
    await d.exec(`insert into public.api_keys(id, name, key_prefix, key_hash, created_by, acts_as_user_id, tenant_id, scopes) values
      ('20000000-0000-4000-8000-0000000000f1', 'vieja', 'p', 'hv1', '${JHON}', '${JHON}', '${T1}', '{creators:read}')`);
    const FILAS = `select 'm' || id k, xmin::text x from chat_messages union all select 'c' || id, xmin::text from chat_conversations
      union all select 'p' || id, xmin::text from chat_participants union all select 'n' || id, xmin::text from notifications
      union all select 'f' || id, xmin::text from profiles union all select 'd' || message_id, xmin::text from chat_message_deletions order by 1`;
    const antes = await q(d, FILAS);
    await aplicar(d, NOMBRE_B, MIG_B);
    const despues = await q(d, FILAS);
    check(antes.length > 100 && JSON.stringify(antes) === JSON.stringify(despues),
      `B no reescribe ninguna fila de mensajes, conversaciones, participantes, notificaciones, perfiles ni archivo (${antes.length} filas con el mismo xmin)`);
    const k = await uno(d, `select integracion_id::text i, api_display_name n from public.api_keys where id = '20000000-0000-4000-8000-0000000000f1'`);
    check(k?.i === "20000000-0000-4000-8000-0000000000f1" && k?.n === null, `la key que ya existía queda como su propia integración y sin nombre visible (${JSON.stringify(k)})`);
    const marcas = await uno(d, `select count(*) filter (where api_key_id is not null)::int n, count(*)::int t from chat_messages`);
    check(marcas?.n === 0, `ningún mensaje que ya estaba queda con marca (${marcas?.t} mensajes)`);
    const flag = await uno(d, `select enabled from app_flags where key = 'api_messenger_escritura'`);
    check(flag?.enabled === false, "el interruptor nace apagado");
    const cupos = await q(d, `select clave from api_escritura_cupos order by 1`);
    check(JSON.stringify(cupos.map((c) => c.clave)) === JSON.stringify([`agencia:${T1}`, "plataforma"]), `nacen la fila de la plataforma y la de la agencia (${cupos.map((c) => c.clave).join(", ")})`);
  }
  // Lo que tardan el VALIDATE y los índices con un chat más grande que el de prod
  // (47.277 mensajes y 13 MB de heap el 01/10): 50.000 mensajes de ~350 bytes (30 MB).
  // Todo eso corre con chat_messages tomado: tiene que ser cosa de milisegundos.
  {
    const d = await prodHoy();
    await sembrarSinTriggers(d, `insert into public.chat_messages(conversation_id, sender_id, content, created_at)
      select '${G}', '${ANA}', repeat('mensaje de prueba ', 20) || g, now() - g * interval '1 second' from generate_series(1, 50000) g`);
    const t0 = performance.now();
    await aplicar(d, NOMBRE_B, MIG_B);
    const t1 = performance.now();
    await d.exec(`alter table chat_messages drop constraint chat_messages_api_coherente; drop index chat_messages_api_por_conv; drop index chat_messages_api_por_llave;`);
    const t2 = performance.now();
    await d.exec(MIG_B.match(/alter table public\.chat_messages add constraint chat_messages_api_coherente[\s\S]*?validate constraint chat_messages_api_coherente;/)![0]);
    const t3 = performance.now();
    await d.exec(MIG_B.match(/create index chat_messages_api_por_conv[^;]*;\ncreate index chat_messages_api_por_llave[^;]*;/)![0]);
    const t4 = performance.now();
    const filas = (await uno(d, `select count(*)::int n, pg_size_pretty(pg_relation_size('chat_messages')) t from chat_messages`));
    check(filas?.n > 50000 && t1 - t0 < 5000,
      `con ${filas?.n} mensajes (${filas?.t} de heap) la migración entera tarda ${Math.round(t1 - t0)} ms en PGlite; el VALIDATE ${Math.round(t3 - t2)} ms y los dos índices parciales ${Math.round(t4 - t3)} ms`);
  }
  // Permisos: nada nuevo lo ejecuta anon ni PUBLIC; las internas y las de trigger
  // tampoco authenticated; las tablas nuevas, cerradas y fuera de Realtime.
  {
    const d = await nueva();
    const nuevas = FUNCIONES_DE_B.filter((f) => !["notify_chat_message", "delete_chat_message", "get_karma_profile", "delete_conversation_cascade", "profiles_nombre_lo_cambia_un_admin"].includes(f));
    const g = await q(d, `select p.proname f, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth,
        coalesce(p.proacl::text, '') ~ '(^|[{,])=X' publico, p.prosecdef def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any($1)`, [nuevas]);
    check(g.length === nuevas.length && g.every((f) => !f.anon && !f.publico),
      `las ${g.length} funciones nuevas: ninguna la ejecuta anon ni PUBLIC (${g.filter((f) => f.anon || f.publico).map((f) => f.f).join(", ") || "ok"})`);
    const RPC = ["api_escritura_habilitada", "api_llave_del_pedido", "api_mi_llave", "messenger_directorio", "messenger_persona_alcanzable",
      "api_misma_integracion", "api_idem_clave", "api_idem_buscar", "api_idem_guardar", "api_mensaje_json", "api_texto_normalizado",
      "api_messenger_enviar", "api_messenger_abrir_directo", "api_messenger_editar", "api_messenger_borrar", "api_retirar_mensajes_de_integracion",
      ];
    const malAuth = g.filter((f) => RPC.includes(f.f) !== f.auth).map((f) => `${f.f}:${f.auth}`);
    check(malAuth.length === 0, `authenticated ejecuta solo las ${RPC.length} que llama una sesión; las internas y las de trigger, no (${malAuth.join(", ") || "ok"})`);
    const oraculo = await uno(d, `select has_function_privilege('authenticated', 'public.api_nombre_de_integracion(uuid, text)', 'execute') a,
      has_function_privilege('service_role', 'public.api_nombre_de_integracion(uuid, text)', 'execute') s`);
    check(oraculo?.a === false && oraculo?.s === true, `api_nombre_de_integracion: la ejecuta service_role (el admin que renombra) y no authenticated, que con ella sabría los nombres visibles de otra agencia (${JSON.stringify(oraculo)})`);
    const invoker = g.filter((f) => !f.def).map((f) => f.f).sort();
    check(JSON.stringify(invoker) === JSON.stringify(["api_esqueleto", "api_idem_clave", "api_messenger_abrir_directo", "api_messenger_borrar", "api_messenger_editar", "api_messenger_enviar", "api_mensaje_json", "api_mvk", "api_sin_acentos", "api_texto_es_valido", "api_texto_normalizado"].sort()),
      `las 4 de escritura son INVOKER (la RLS y los triggers se aplican como en la app), y solo las puras y api_mensaje_json lo son además (${invoker.join(", ")})`);
    const t = await q(d, `select c.relname t, c.relrowsecurity rls, (select count(*)::int from pg_policies p where p.tablename = c.relname) pol,
        (select count(*)::int from pg_publication_tables r where r.tablename = c.relname) rt,
        has_table_privilege('authenticated', c.oid, 'select') sel, has_table_privilege('anon', c.oid, 'select') sela
      from pg_class c where c.relname in ('api_escritura_cupos', 'api_escritura_idem') order by 1`);
    check(t.length === 2 && t.every((x) => x.rls && x.pol === 0 && x.rt === 0 && !x.sel && !x.sela),
      `api_escritura_cupos y api_escritura_idem: RLS sin políticas, fuera de Realtime y sin permisos para anon ni authenticated (${JSON.stringify(t)})`);
    const nTrig = await q(d, `select tgname n from pg_trigger t join pg_class c on c.oid = t.tgrelid where not tgisinternal and c.relname in ('chat_messages', 'chat_conversations', 'chat_participants') order by c.relname, tgname`);
    check(nTrig.map((x) => x.n).join(",").includes("chat_conversations_agencia,chat_conversations_api") &&
      nTrig.map((x) => x.n).join(",").includes("chat_messages_al_insertar,chat_messages_api,chat_messages_api_editar,on_chat_message_notify") &&
      nTrig.map((x) => x.n).join(",").includes("chat_participants_agencia,chat_participants_api"),
      `los triggers de la B van después de los de la A en el orden alfabético en que corren (${nTrig.map((x) => x.n).join(", ")})`);
    const job = await uno(d, `select schedule s, command c from cron.job where jobname = 'api-escritura-idem-purga'`);
    check(job?.s === "23 9 * * *" && /delete from public\.api_escritura_idem where created_at < now\(\) - interval '72 hours'/.test(job?.c ?? "") && !/net\./.test(job?.c ?? ""),
      `la purga diaria de la idempotencia está programada, en SQL puro (${job?.s})`);
  }
}

// ════ 2. La app no cambia ════════════════════════════════════════════════════
{
  const db = await nueva();
  const n0 = (await uno(db, `select count(*)::int n from notifications`))?.n as number;
  const r = await intentar(db, app(ANA), `insert into chat_messages(conversation_id, sender_id, content, api_key_id, api_display_name) values ('${G}', '${ANA}', 'hola desde la app', '${K_BLU}', 'BLU') returning id`);
  check(r.ok, `la app manda un mensaje (y trata de poner la marca)${r.ok ? "" : ` → ${desc(r)}`}`);
  const m = await uno(db, `select api_key_id, api_display_name, created_at > now() - interval '1 minute' reciente from chat_messages where content = 'hola desde la app'`);
  check(m?.api_key_id === null && m?.api_display_name === null && m?.reciente === true, `…y la marca queda en NULL: no la pone el pedido (${JSON.stringify(m)})`);
  const t = await q(db, `select title, type from notifications order by created_at desc, title limit 4`);
  check((await uno(db, `select count(*)::int n from notifications`))?.n === n0 + 4 && t.every((x) => x.title === "Ana Ruiz en Grupo"),
    `las notificaciones de un mensaje de la app salen igual: «Ana Ruiz en Grupo» a los 4 (${[...new Set(t.map((x) => x.title))].join(", ")})`);
  // user_metadata.mvk: el claim está anidado, no es de primer nivel.
  const um = await intentar(db, app(ALVARO, { user_metadata: { mvk: K_BLU, mvf: true } }), `insert into chat_messages(conversation_id, sender_id, content) values ('${G}', '${ALVARO}', 'con user_metadata.mvk')`);
  const umm = await uno(db, `select api_key_id from chat_messages where content = 'con user_metadata.mvk'`);
  check(um.ok && umm?.api_key_id === null, `user_metadata.mvk (lo que una persona sí puede poner en su JWT) no marca nada (${um.ok ? JSON.stringify(umm) : desc(um)})`);
  const ed = await intentar(db, app(ANA), `update chat_messages set content = 'editado en la app', is_edited = true, content_rich = null where content = 'hola desde la app'`);
  check(ed.ok, `la app edita su mensaje${ed.ok ? "" : ` → ${desc(ed)}`}`);
  const bo = await intentar(db, app(ANA), `select public.delete_chat_message((select id from chat_messages where content = 'editado en la app')) r`);
  const arch = await uno(db, `select d.content, d.api_key_id, d.api_display_name from chat_message_deletions d join chat_messages m on m.id = d.message_id where d.content = 'editado en la app'`);
  check(bo.ok && bo.r?.ok === true && arch?.content === "editado en la app" && arch?.api_key_id === null, `la app borra por la RPC y el archivo guarda el texto, con las marcas en NULL (${JSON.stringify(arch)})`);
  // Directo en 3 pasos, grupo y las escrituras de siempre.
  const D = "c9000000-0000-4000-8000-000000000001";
  const pasos = [
    anda(await intentar(db, app(BETO), `insert into chat_conversations(id, type, created_by) values ('${D}', 'direct', '${BETO}')`), "la app abre un directo (paso 1)"),
    anda(await intentar(db, app(BETO), `insert into chat_participants(conversation_id, user_id, role) values ('${D}', '${BETO}', 'admin')`), "…paso 2"),
    anda(await intentar(db, app(BETO), `insert into chat_participants(conversation_id, user_id, role) values ('${D}', '${CARLA}', 'member')`), "…paso 3"),
  ];
  const d = await uno(db, `select creada_por_api_key, tenant_id::text t from chat_conversations where id = '${D}'`);
  check(pasos.every(Boolean) && d?.creada_por_api_key === null && d?.t === T1, `el directo de la app no queda como abierto por una key (${JSON.stringify(d)})`);
  anda(await intentar(db, app(ANA), `update chat_participants set last_read_at = now() where conversation_id = '${G}' and user_id = '${ANA}'`), "la app marca leído (cerco: UPDATE de participantes)");
  anda(await intentar(db, app(ANA), `insert into chat_reactions(message_id, user_id, emoji) values ('${M_G_HILO}', '${ANA}', '👍')`), "la app reacciona (cerco: chat_reactions)");
  anda(await intentar(db, app(ANA), `insert into chat_read_receipts(message_id, user_id, read_at) values ('${M_G_HILO}', '${ANA}', now())`), "la app deja el recibo de leído (cerco: chat_read_receipts)");
  anda(await intentar(db, app(ANA), `insert into chat_pinned(user_id, conversation_id) values ('${ANA}', '${G}')`), "la app fija un chat (cerco: chat_pinned)");
  anda(await intentar(db, app(ANA), `insert into notifications(user_id, type, title) values ('${JHON}', 'chat_message', 'aviso de la app')`), "la app inserta una notificación (cerco: notifications, WITH CHECK true)");
  anda(await intentar(db, app(ALVARO), `update chat_conversations set name = 'Grupo 2' where id = '${G}'`), "la app renombra un grupo (cerco: UPDATE de conversaciones)");
  anda(await intentar(db, app(ALVARO), `select public.delete_conversation_cascade('${G_ANUNCIOS}')`).then((x) => x.ok ? x : { ...x, ok: x.texto.includes("No autorizado") } as Res), "delete_conversation_cascade sigue corriendo para la app (aquí dice que no es admin, como antes)");
  anda(await intentar(db, app(ANA), `select public.delete_conversation_cascade('${G_SIN}')`), "delete_conversation_cascade borra un grupo desde la app");
  // Las lecturas de la app: get_last_messages devuelve SETOF chat_messages, cuyo tipo
  // de fila suma las dos columnas de la marca.
  const lecturas = await intentar(db, app(JHON), `select (select count(*)::int from public.get_last_messages('${JHON}')) ultimos,
      (select count(*)::int from public.get_unread_counts('${JHON}')) no_leidos, (select count(*)::int from public.messenger_unread_counts()) no_leidos_api,
      (select count(*)::int from public.get_mentioned_conversations('${JHON}', 'Jhon Lopez', 'Jhon')) menciones,
      (select (public.get_karma_profile('${ANA}')) ->> 'name') karma`);
  check(lecturas.ok && lecturas.filas[0]?.ultimos === 1 && lecturas.filas[0]?.no_leidos === 4 && lecturas.filas[0]?.no_leidos_api === 4 && lecturas.filas[0]?.karma === "Ana Ruiz",
    `las lecturas de la app siguen andando: get_last_messages, get_unread_counts, messenger_unread_counts, get_mentioned_conversations y get_karma_profile (${lecturas.ok ? JSON.stringify(lecturas.filas[0]) : desc(lecturas)})`);
  const ult = await intentar(db, app(JHON), `select m.api_key_id, m.api_display_name from public.get_last_messages('${JHON}') m limit 1`);
  check(ult.ok && ult.filas.length === 1 && "api_key_id" in ult.filas[0] && ult.filas[0].api_key_id === null, "…y get_last_messages ya trae la marca (en NULL para lo de la app)");
  // Con el interruptor apagado la app no se entera.
  await db.exec(`update app_flags set enabled = false where key = 'api_messenger_escritura'`);
  anda(await intentar(db, app(ANA), `insert into chat_messages(conversation_id, sender_id, content) values ('${G}', '${ANA}', 'con el interruptor apagado')`), "con el interruptor apagado la app sigue mandando");
  // postgres (cron, el editor de SQL) inserta como siempre, sin marca.
  anda(await intentar(db, PG, `insert into chat_messages(conversation_id, sender_id, content) values ('${G}', '${JHON}', 'desde postgres')`), "postgres (cron, el editor de SQL) sigue insertando");
}

// ════ 3. Los rechazos de la key ══════════════════════════════════════════════
{
  const db = await nueva();
  anda(await enviar(db, BLU, G, "primero"), "BLU manda a «Grupo»");
  rechazo(await enviar(db, api(JHON, K_BLU), G, "x"), "MV401", "error", "unauthorized", "mvk de OTRA persona (la key es de Alvaro y el token de Jhon)");
  rechazo(await enviar(db, api(ALVARO, K_REV), G, "x"), "MV401", "error", "unauthorized", "key revocada (el token puede seguir vivo 60 s)");
  rechazo(await enviar(db, api(ALVARO, K_VENC), G, "x"), "MV401", "error", "unauthorized", "key vencida");
  rechazo(await enviar(db, api(ALVARO, K_LEE), G, "x"), "MV403", "error", "forbidden", "key con messenger:read y sin messenger:write");
  rechazo(await enviar(db, api(ALVARO, K_CREA), G, "x"), "MV403", "error", "forbidden", "key que no es de Messenger (creators:read)");
  rechazo(await enviar(db, api(ALVARO, "no-es-un-uuid"), G, "x"), "MV401", "error", "unauthorized", "mvk que no es un UUID");
  rechazo(await enviar(db, api(ALVARO, "20000000-0000-4000-8000-0000000000ee"), G, "x"), "MV401", "error", "unauthorized", "mvk que no existe");
  rechazo(await enviar(db, app(ALVARO), G, "x"), "MV401", "error", "unauthorized", "la app (sin mvk) no puede usar las RPC de escritura");
  rechazo(await enviar(db, fabricada(ALVARO), G, "x"), "MV401", "error", "unauthorized", "una sesión fabricada sin mvk tampoco");
  rechazo(await enviar(db, ANON, G, "x"), "42501", null, null, "anon no las ejecuta");
  rechazo(await enviar(db, BLU, G_SIN, "x"), "MV404", "error", "conversation_not_found", "una conversación donde la persona de la key no está");
  rechazo(await enviar(db, BLU, "c0000000-0000-4000-8000-0000000000ee", "x"), "MV404", "error", "conversation_not_found", "una conversación que no existe");
  rechazo(await enviar(db, BLU, G_ANUNCIOS, "x"), "42501", null, null, "un grupo de anuncios sin ser admin: la RLS de siempre (el edge lo pasa a 403 not_allowed_in_conversation)");
  await db.exec(`delete from api_escritura_cupos where clave = 'llave:${K_BLU}'`);
  rechazo(await enviar(db, BLU, G, "x"), "MV503", "motivo", "sin_cupo", "sin fila de cupo, falla cerrado");
  await db.exec(`insert into api_escritura_cupos(clave) values ('llave:${K_BLU}')`);
  await db.exec(`update app_flags set enabled = false where key = 'api_messenger_escritura'`);
  rechazo(await enviar(db, BLU, G, "x"), "MV503", "motivo", "interruptor", "interruptor apagado");
  await db.exec(`delete from app_flags where key = 'api_messenger_escritura'`);
  rechazo(await enviar(db, BLU, G, "x"), "MV503", "motivo", "interruptor", "sin la fila del interruptor cuenta como apagado");
  await db.exec(`insert into app_flags(key, enabled) values ('api_messenger_escritura', true)`);
  anda(await enviar(db, BLU, G, "con todo en orden"), "con el interruptor prendido y la fila de cupo, vuelve a andar");
  await db.exec(`update profiles set deleted_at = now() where id = '${ALVARO}'`);
  rechazo(await enviar(db, BLU, G, "x"), "MV403", "error", "forbidden", "la persona de la key dada de baja");
  await db.exec(`update profiles set deleted_at = null where id = '${ALVARO}'; update auth.users set banned_until = now() + interval '1 day' where id = '${ALVARO}'`);
  rechazo(await enviar(db, BLU, G, "x"), "MV403", "error", "forbidden", "la persona de la key bloqueada");
  await db.exec(`update auth.users set banned_until = null where id = '${ALVARO}'; delete from tenant_members where user_id = '${ALVARO}'`);
  rechazo(await enviar(db, BLU, G, "x"), "MV403", "error", "forbidden", "la persona de la key que ya no es de la agencia");
  await db.exec(`insert into tenant_members(user_id, tenant_id, created_at) values ('${ALVARO}', '${T1}', '2026-09-01')`);
  await db.exec(`insert into tenants(id, slug, name) values ('${T2}', 'otra', 'Otra agencia')`);
  rechazo(await enviar(db, BLU, G, "x"), "MV503", "motivo", "varias_agencias", "con DOS agencias sembradas, la base apaga la escritura (no solo la edge)");
  const cuentas = await uno(db, `select count(*) filter (where api_key_id is not null)::int n from chat_messages`);
  check(cuentas?.n === 2, `de todos los intentos solo quedaron los 2 mensajes que pasaron (${cuentas?.n})`);
}

// ════ 4. El cerco de la sesión fabricada ═════════════════════════════════════
{
  const db = await nueva();
  // Catálogo: toda política permisiva de escritura sobre chat_% o notifications tiene
  // una hermana RESTRICTIVE con el predicado `mvf`, salvo lo que cierra un trigger.
  const POR_TRIGGER = new Set(["chat_messages:INSERT", "chat_messages:UPDATE", "chat_conversations:INSERT", "chat_participants:INSERT"]);
  const pol = await q(db, `select tablename t, policyname n, permissive p, cmd c, coalesce(qual, '') u, coalesce(with_check, '') w, roles::text r
    from pg_policies where schemaname = 'public' and (tablename like 'chat\\_%' or tablename = 'notifications')`);
  const PREDICADO = "( SELECT (auth.jwt() ?| ARRAY['mvf'::text, 'mvk'::text])) IS NOT TRUE";
  const cerco = (t: string, c: string) => pol.find((x) => x.t === t && x.p === "RESTRICTIVE" && x.c === c && x.r === "{public}"
    && (c === "INSERT" ? x.w : x.u).replace(/\s+/g, " ").includes(PREDICADO)
    && (c !== "UPDATE" || x.w.replace(/\s+/g, " ").includes(PREDICADO)));
  const huecos: string[] = [];
  let permisivas = 0;
  for (const x of pol.filter((p) => p.p === "PERMISSIVE" && p.c !== "SELECT")) {
    for (const c of x.c === "ALL" ? ["INSERT", "UPDATE", "DELETE"] : [x.c]) {
      permisivas++;
      if (!cerco(x.t, c) && !POR_TRIGGER.has(`${x.t}:${c}`)) huecos.push(`${x.t}:${c} («${x.n}»)`);
    }
  }
  check(permisivas >= 25 && huecos.length === 0, `de pg_policies: las ${permisivas} escrituras permitidas de chat_* y notifications están cercadas por una RESTRICTIVE «mvf» o por un trigger${huecos.length ? ` — sin cerco: ${huecos.join(", ")}` : ""}`);
  check(pol.filter((x) => x.n.startsWith("api_fabricada_")).every((x) => x.p === "RESTRICTIVE" && x.c !== "ALL" && x.c !== "SELECT"),
    "el cerco nunca es FOR ALL ni SELECT: la bandeja de la API sigue leyendo chat_pinned y chat_archived");
  // Línea base que PUEDE fallar: el mismo catálogo en prod de hoy tiene huecos.
  const hoy = await prodHoy();
  const polHoy = await q(hoy, `select tablename t, cmd c, permissive p from pg_policies where schemaname = 'public' and (tablename like 'chat\\_%' or tablename = 'notifications')`);
  const huecosHoy = polHoy.filter((x) => x.p === "PERMISSIVE" && x.c !== "SELECT").length;
  check(huecosHoy >= 20 && polHoy.every((x) => x.p !== "RESTRICTIVE" || x.c === "INSERT"), `línea base: en prod de hoy las ${huecosHoy} políticas de escritura no tienen cerco (el test de catálogo puede fallar)`);

  // Comportamiento: cada escritura, con la sesión de la app anda; con mvf sin mvk, no.
  const casos: [string, Sesion, string, string][] = [
    ["mensaje (INSERT)", fabricada(ANA), `insert into chat_messages(conversation_id, sender_id, content) values ('${G}', '${ANA}', 'fab')`, `select exists(select 1 from chat_messages where content = 'fab') si`],
    ["mensaje (UPDATE)", fabricada(ANA), `update chat_messages set content = 'fab2', is_edited = true where id = '${M_G_ANA}'`, `select exists(select 1 from chat_messages where content = 'fab2') si`],
    ["conversación (INSERT)", fabricada(ANA), `insert into chat_conversations(id, type, created_by) values ('c9100000-0000-4000-8000-000000000001', 'direct', '${ANA}')`, `select exists(select 1 from chat_conversations where id = 'c9100000-0000-4000-8000-000000000001') si`],
    ["conversación (UPDATE)", fabricada(ALVARO), `update chat_conversations set name = 'fab' where id = '${G}'`, `select exists(select 1 from chat_conversations where name = 'fab') si`],
    ["conversación (DELETE)", fabricada(ALVARO), `delete from chat_conversations where id = '${G50}'`, `select not exists(select 1 from chat_conversations where id = '${G50}') si`],
    ["delete_conversation_cascade", fabricada(ALVARO), `select public.delete_conversation_cascade('${G50}')`, `select not exists(select 1 from chat_conversations where id = '${G50}') si`],
    ["participante (INSERT)", fabricada(ALVARO), `insert into chat_participants(conversation_id, user_id, role) values ('${G}', '${DANI}', 'member')`, `select exists(select 1 from chat_participants where conversation_id = '${G}' and user_id = '${DANI}') si`],
    ["participante (UPDATE)", fabricada(ANA), `update chat_participants set is_muted = true where conversation_id = '${G}' and user_id = '${ANA}'`, `select exists(select 1 from chat_participants where conversation_id = '${G}' and user_id = '${ANA}' and is_muted) si`],
    ["participante (DELETE)", fabricada(ANA), `delete from chat_participants where conversation_id = '${G}' and user_id = '${ANA}'`, `select not exists(select 1 from chat_participants where conversation_id = '${G}' and user_id = '${ANA}') si`],
    ["reacción", fabricada(ANA), `insert into chat_reactions(message_id, user_id, emoji) values ('${M_G_HILO}', '${ANA}', '🤖')`, `select exists(select 1 from chat_reactions where emoji = '🤖') si`],
    ["recibo de leído", fabricada(ANA), `insert into chat_read_receipts(message_id, user_id, read_at) values ('${M_G_HILO}', '${ANA}', now())`, `select exists(select 1 from chat_read_receipts where user_id = '${ANA}') si`],
    ["fijar", fabricada(ANA), `insert into chat_pinned(user_id, conversation_id) values ('${ANA}', '${G}')`, `select exists(select 1 from chat_pinned where user_id = '${ANA}') si`],
    ["archivar", fabricada(ANA), `insert into chat_archived(user_id, conversation_id) values ('${ANA}', '${G}')`, `select exists(select 1 from chat_archived where user_id = '${ANA}') si`],
    ["espacio", fabricada(ANA), `insert into chat_spaces(id, name, created_by) values ('d9000000-0000-4000-8000-000000000001', 'fab', '${ANA}')`, `select exists(select 1 from chat_spaces where name = 'fab') si`],
    ["notificación (INSERT)", fabricada(ANA), `insert into notifications(user_id, type, title) values ('${JHON}', 'chat_message', 'falsa')`, `select exists(select 1 from notifications where title = 'falsa') si`],
    ["notificación (UPDATE)", fabricada(JHON), `update notifications set status = 'read' where user_id = '${JHON}'`, `select exists(select 1 from notifications where user_id = '${JHON}' and status = 'read') si`],
    ["notificación (DELETE)", fabricada(JHON), `delete from notifications where user_id = '${JHON}'`, `select not exists(select 1 from notifications where user_id = '${JHON}') si`],
  ];
  const probar = async (s: Sesion, sql: string, efecto: string) => {
    await db.exec("begin");
    try { await entrar(db, s); await db.exec(sql); await db.exec("reset role"); const r = await uno(db, efecto); await db.exec("rollback"); return { ok: true, si: r?.si === true }; }
    catch (e) { await db.exec("rollback"); return { ok: false, si: false, error: msg(e) }; }
  };
  let cercadas = 0, editadas = 0, deGotrue = 0;
  for (const [nombre, s, sql, efecto] of casos) {
    const uid = s.claims!.sub as string;
    const comoApp = await probar(app(uid), sql, efecto);
    const comoFab = await probar(s, sql, efecto);
    const bien = comoApp.ok && comoApp.si && !comoFab.si;
    if (bien) cercadas++;
    else check(false, `cerco · ${nombre}: con la app ${comoApp.ok ? (comoApp.si ? "anda" : "NO tiene efecto (la línea base no prueba nada)") : `falla: ${comoApp.error?.slice(0, 80)}`}; fabricada ${comoFab.si ? "TUVO EFECTO" : "sin efecto"}`);
    // El mismo pedido con los claims editados: mvk sin mvf, mvf: null, mvk: null y los dos.
    const variantes = [soloMvk(uid), mvfNull(uid), mvkNull(uid), mvfNullConMvk(uid)];
    const conEfecto: string[] = [];
    for (const v of variantes) if ((await probar(v, sql, efecto)).si) conEfecto.push(v.nombre);
    if (conEfecto.length === 0) editadas++;
    else check(false, `cerco · ${nombre}: con claims editados TUVO EFECTO (${conEfecto.join(", ")})`);
    // Y un JWT de GoTrue con mvf/mvk en user_metadata es la app.
    const g = await probar(gotrue(uid), sql, efecto);
    if (g.ok && g.si) deGotrue++;
    else check(false, `cerco · ${nombre}: un JWT de GoTrue con mvf/mvk en user_metadata NO anda (${g.error?.slice(0, 80) ?? "sin efecto"})`);
  }
  check(cercadas === casos.length, `cerco: las ${casos.length} escrituras andan con la sesión de la app y no tienen efecto con una sesión fabricada sin key (${cercadas}/${casos.length})`);
  check(editadas === casos.length, `cerco: tampoco con un token con mvk y sin mvf, con mvf: null, con mvk: null ni con los dos (${editadas}/${casos.length}, 4 variantes cada una)`);
  check(deGotrue === casos.length, `cerco: un JWT de GoTrue con mvf y mvk dentro de user_metadata sigue siendo la app (${deGotrue}/${casos.length})`);
  // Las funciones DEFINER no pasan por las políticas: cada una que una sesión puede
  // llamar y que escribe en chat_* o notifications tiene su guarda `mvf`, o su
  // escritura cae en un trigger de la pared (y entonces se prueba que con una sesión
  // fabricada, con key o sin ella, no tenga efecto). Se lee del catálogo: si el PR 1b
  // (chat_evento_sistema) ya está en la cadena, entra solo.
  const POR_UN_TRIGGER: Record<string, string> = {
    delete_chat_message: "su UPDATE de chat_messages pasa por chat_messages_api_editar",
    chat_evento_sistema: "su INSERT de chat_messages pasa por chat_messages_api (por API no hay avisos de sistema)",
  };
  const definer = await q(db, `select p.proname f, p.prosrc s from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and pg_get_function_result(p.oid) <> 'trigger'
      and has_function_privilege('authenticated', p.oid, 'execute')
      and p.prosrc ~* '(insert\\s+into|update|delete\\s+from)\\s+(public\\.)?(chat_\\w+|notifications)\\M'`);
  const sinGuarda = definer.filter((f) => !/\(auth\.jwt\(\) \?\| array\['mvf', 'mvk'\]\) is true/i.test(f.s) && !POR_UN_TRIGGER[f.f]).map((f) => f.f);
  check(definer.length >= 3 && sinGuarda.length === 0,
    `las ${definer.length} funciones DEFINER que una sesión puede llamar y escriben en el chat tienen guarda «mvf» o caen en un trigger de la pared (${definer.map((f) => f.f).sort().join(", ")})${sinGuarda.length ? ` — sin guarda: ${sinGuarda.join(", ")}` : ""}`);
  const mLlave = mensajeDe(await enviar(db, BLU, G50, "para delete_chat_message"));
  for (const s of [fabricada(ALVARO), api(ALVARO, K_WEB)]) {
    const r = await intentar(db, s, `select public.delete_chat_message('${mLlave.id}') r`);
    const sigue = await uno(db, `select is_deleted from chat_messages where id = $1`, [mLlave.id]);
    check(!r.ok && sigue?.is_deleted === false && r.codigo === "MV403", `delete_chat_message con ${s.nombre}: el trigger lo frena y no queda nada (${desc(r)})`);
  }
  for (const s of [soloMvk(ALVARO), mvfNull(ALVARO)]) {
    const c = await intentar(db, s, `select public.delete_conversation_cascade('${G50}')`);
    const r = await intentar(db, s, `select public.api_retirar_mensajes_de_integracion('${K_BLU}', null, 200) r`);
    const sigue = await uno(db, `select count(*)::int n from chat_conversations where id = '${G50}'`);
    check(!c.ok && c.codigo === "MV403" && !r.ok && r.codigo === "MV403" && sigue?.n === 1,
      `con ${s.nombre}, delete_conversation_cascade y la retirada dan MV403 (${desc(c).slice(0, 60)} / ${desc(r).slice(0, 60)})`);
  }
  const mk = await intentar(db, mvkNull(ALVARO), `insert into chat_messages(conversation_id, sender_id, content) values ('${G}', '${ALVARO}', 'con mvk null')`);
  check(!mk.ok && mk.codigo === "MV403", `un mensaje con mvk: null (sin key) no entra como si fuera de la app (${desc(mk).slice(0, 90)})`);
  if (definer.some((f) => f.f === "chat_evento_sistema")) {
    for (const s of [fabricada(ALVARO), BLU]) {
      const r = await intentar(db, s, `select public.chat_evento_sistema('${G}', 'salio') r`);
      const hay = await uno(db, `select count(*)::int n from chat_messages where type = 'system' and conversation_id = '${G}'`);
      check(!r.ok && r.codigo === "MV403" && hay?.n === 0, `chat_evento_sistema (PR 1b) con ${s.nombre}: MV403 y ningún aviso de sistema (${desc(r)})`);
    }
    const appOk = await intentar(db, app(ALVARO), `select public.chat_evento_sistema('${G}', 'salio') r`);
    check(appOk.ok, `línea base: con la sesión de la app chat_evento_sistema sí manda el aviso${appOk.ok ? "" : ` → ${desc(appOk)}`}`);
  } else {
    TOTAL.ok.push("chat_evento_sistema (PR 1b) todavía no está en la cadena: cuando entre, este mismo test lo prueba con una sesión fabricada y con una key");
  }
  // La sesión fabricada sigue LEYENDO (la lectura del PR 4 de antes).
  const lee = await intentar(db, fabricada(ALVARO), `select (select count(*)::int from chat_messages where conversation_id = '${G}') m, (select count(*)::int from chat_pinned) p`);
  check(lee.ok && (lee.filas[0]?.m ?? 0) > 0, `la sesión fabricada sigue leyendo mensajes y fijados (${JSON.stringify(lee.ok ? lee.filas[0] : desc(lee))})`);
}

// ════ 5. service_role no inserta en el chat ══════════════════════════════════
{
  const db = await nueva();
  const C = "c9200000-0000-4000-8000-000000000001";
  for (const [s, nombre] of [[SR, "service_role"], [SR_CON_MVK(K_BLU), "service_role con mvk"]] as [Sesion, string][]) {
    rechazo(await intentar(db, s, `insert into chat_messages(conversation_id, sender_id, content) values ('${G}', '${ALVARO}', 'sr')`), "MV403", "error", "forbidden", `${nombre} no inserta mensajes`);
    rechazo(await intentar(db, s, `insert into chat_conversations(id, type, created_by) values ('${C}', 'direct', '${ALVARO}')`), "MV403", "error", "forbidden", `${nombre} no crea conversaciones`);
    rechazo(await intentar(db, s, `insert into chat_participants(conversation_id, user_id, role) values ('${G}', '${DANI}', 'member')`), "MV403", "error", "forbidden", `${nombre} no suma participantes`);
  }
  // Línea base: en prod de hoy service_role sí inserta.
  const hoy = await prodHoy();
  const base = await intentar(hoy, SR, `insert into chat_messages(conversation_id, sender_id, content) values ('${G}', '${ALVARO}', 'sr')`);
  check(base.ok, `línea base: en prod de hoy service_role inserta un mensaje${base.ok ? "" : ` (${desc(base)})`}`);
  // Lo que service_role sí hace sigue andando: leer, marcar entregado (push-entregado), purgar.
  anda(await intentar(db, SR, `insert into chat_read_receipts(message_id, user_id, delivered_at) values ('${M_G_HILO}', '${ANA}', now()) on conflict do nothing`), "service_role marca entregado (push-entregado)");
  anda(await intentar(db, SR, `update profiles set full_name = 'Dani Mora R' where id = '${DANI}'`), "service_role cambia un nombre (admin-user-actions)");
}

// ════ 6. La forma del texto ══════════════════════════════════════════════════
{
  const db = await nueva();
  const conv = [G, DM_AJ, G50];
  let i = 0;
  const otra = () => conv[(i++) % conv.length];
  const largo = "a".repeat(4000);
  anda(await enviar(db, BLU, otra(), largo), "4.000 caracteres entran");
  rechazo(await enviar(db, BLU, otra(), largo + "a"), "MV422", "error", "invalid_text", "4.001 caracteres no");
  const emojis = "👍".repeat(4000);
  const e = await enviar(db, BLU, otra(), emojis);
  check(e.ok && (mensajeDe(e).content as string)?.length === 8000, `4.000 emojis (4.000 puntos de código) entran${e.ok ? "" : ` → ${desc(e)}`}`);
  anda(await enviar(db, BLU, otra(), "familia 👨\u200D👩\u200D👧 con ZWJ"), "emojis con ZWJ entran");
  rechazo(await enviar(db, BLU, otra(), "pagar a \u202Eanuncio"), "MV422", "error", "invalid_text", "U+202E (invierte la dirección del texto) no");
  // La misma clase que limpia chat_evento_sistema (PR 1b), y al menos un carácter visible.
  const cp = (...n: number[]) => String.fromCodePoint(...n);
  for (const [n, t] of [
    ["U+200B (ancho cero) en el medio", `ho${cp(0x200B)}la`], ["U+FEFF", `${cp(0xFEFF)}hola`], ["U+2060", `ho${cp(0x2060)}la`],
    ["U+061C (marca de letra árabe)", `hola ${cp(0x061C)} 123`], ["U+2028", `hola${cp(0x2028)}mundo`], ["U+2029", `hola${cp(0x2029)}mundo`],
    ["U+206A", `ho${cp(0x206A)}la`], ["U+00AD (guion blando)", `ho${cp(0x00AD)}la`], ["U+180E", `ho${cp(0x180E)}la`], ["U+200C", `ho${cp(0x200C)}la`],
    ["solo U+200B", cp(0x200B)], ["solo U+061C", cp(0x061C)], ["solo U+200D (ZWJ)", cp(0x200D)], ["solo espacios de Unicode", cp(0x00A0, 0x3000, 0x2003)],
  ] as [string, string][]) rechazo(await enviar(db, BLU, otra(), t), "MV422", "error", "invalid_text", `${n}: no`);
  anda(await enviar(db, BLU, otra(), `hola${cp(0x00A0)}mundo`), "un espacio duro (U+00A0) entre palabras sí");
  for (const [c, n] of [["\u200E", "U+200E"], ["\u2066", "U+2066"], ["\u0007", "BEL"], ["\u001B", "ESC"], ["\u0085", "C1 U+0085"], ["\r", "\\r suelto"], ["\u007F", "DEL"]]) {
    rechazo(await enviar(db, BLU, otra(), `con ${c} adentro`), "MV422", "error", "invalid_text", `${n} no`);
  }
  for (const [t, n] of [["", "vacío"], ["   \n\t ", "solo espacios"]]) rechazo(await enviar(db, BLU, otra(), t), "MV422", "error", "invalid_text", `texto ${n} no`);
  const nfc = await enviar(db, BLU, otra(), "  café\r\nlinea dos\t  ");
  check(nfc.ok && mensajeDe(nfc).content === "café\nlinea dos", `el texto queda en NFC, con \\r\\n → \\n y recortado (${JSON.stringify(mensajeDe(nfc).content)})`);
  anda(await enviar(db, BLU, otra(), "con\ttab\ny salto"), "\\t y \\n adentro sí");
  // Por INSERT directo (la pared, sin la RPC): solo texto plano.
  for (const [cols, vals, n] of [
    ["type, file_url, file_name", `'image', 'https://lsagslbkliprespbyhts.supabase.co/storage/v1/object/public/chat-files/x.png', 'x.png'`, "imagen de chat-files"],
    ["content_rich", `'{"type":"doc"}'`, "texto rico"], ["album_id", "gen_random_uuid()", "álbum"],
  ]) {
    rechazo(await intentar(db, BLU, `insert into chat_messages(conversation_id, sender_id, content, ${cols}) values ('${G}', '${ALVARO}', 'directo', ${vals})`), "MV422", "error", "invalid_text", `por API no va ${n}`);
  }
  rechazo(await intentar(db, BLU, `insert into chat_messages(conversation_id, sender_id, content, type) values ('${G}', '${ALVARO}', 'Jhon Lopez nombró admin a BLU', 'system')`), "MV403", "error", "forbidden", "por API nunca va un aviso de sistema");
  rechazo(await intentar(db, BLU, `insert into chat_messages(conversation_id, sender_id, content) values ('${G}', '${JHON}', 'a nombre de otro')`), "MV403", "error", "forbidden", "por API no se escribe a nombre de otra persona");
  const sinGasto = await cupo(db, `llave:${K_BLU}`);
  const pasaron = (await uno(db, `select count(*)::int n from chat_messages where api_key_id is not null`))?.n;
  check(sinGasto?.min_msj === pasaron || sinGasto?.dia_msj === pasaron, `los rechazos no gastan cupo: ${sinGasto?.dia_msj} mensajes gastados = ${pasaron} que pasaron`);
}

// ════ 7. Citas, hilos y tamaño ═══════════════════════════════════════════════
{
  const db = await nueva();
  rechazo(await enviar(db, BLU, G, "cito de otro chat", { responde: M_SIN }), "MV422", null, null, "una cita de OTRA conversación (la frena A con chat_cita_ajena)");
  check(/chat_cita_ajena/.test((await enviar(db, BLU, G, "cito de otro chat", { responde: M_SIN }) as { texto: string }).texto ?? ""), "…y el error es el de A: B no lo repite");
  rechazo(await enviar(db, BLU, G, "cito uno borrado", { responde: M_G_BORRADO }), "MV422", "error", "invalid_reply", "una cita a un mensaje borrado");
  rechazo(await enviar(db, BLU, G, "hilo de un hilo", { responde: M_G_HILO, hilo: true }), "MV422", "error", "invalid_reply", "un hilo que no apunta a una raíz");
  rechazo(await enviar(db, BLU, G, "hilo sin cita", { hilo: true }), "MV422", "error", "invalid_reply", "un hilo sin cita");
  const c = await enviar(db, BLU, G, "respondo", { responde: M_G_ANA });
  check(c.ok && mensajeDe(c).reply_to_id === M_G_ANA && mensajeDe(c).is_thread_reply === false, `una cita válida entra${c.ok ? "" : ` → ${desc(c)}`}`);
  const h = await enviar(db, BLU, G, "en el hilo", { responde: M_G_ANA, hilo: true });
  check(h.ok && mensajeDe(h).is_thread_reply === true, `una respuesta en el hilo de una raíz entra${h.ok ? "" : ` → ${desc(h)}`}`);
  const c2 = await enviar(db, BLU, G, "cito una respuesta de hilo", { responde: M_G_HILO });
  check(c2.ok, `citar (sin hilo) una respuesta de hilo sí se puede, como en la app${c2.ok ? "" : ` → ${desc(c2)}`}`);
  rechazo(await enviar(db, BLU, G51, "a 51"), "MV422", "error", "conversation_too_large", "un grupo de 51 personas no");
  const g50 = await enviar(db, BLU, G50, "a 50");
  const pes = await cupo(db, `llave:${K_BLU}`);
  check(g50.ok, `un grupo de 50 sí${g50.ok ? "" : ` → ${desc(g50)}`}`);
  check(pes?.min_dest === 7 + 7 + 7 + 52, `…y pesa (50−1)+3 = 52 destinatarios ponderados (en el minuto: 3 × 7 de «Grupo» + 52 = ${pes?.min_dest})`);
}

// ════ 8. Por conversación: 6 por minuto, 150 por día y la ronda ══════════════
{
  const db = await nueva();
  const PANEL = api(JHON, K_PANEL);
  let pasaron = 0;
  for (let i = 0; i < 6; i++) if ((await enviar(db, i % 2 ? PANEL : BLU, G, `turno ${i}`)).ok) pasaron++;
  check(pasaron === 6, `dos keys de dos personas se turnan en «Grupo»: entran 6 en el minuto (${pasaron})`);
  const r7 = await enviar(db, PANEL, G, "el séptimo");
  rechazo(r7, "MV429", "limite", "conversation_minute", "el 7.º del minuto se rechaza, venga de la key que venga");
  check(!r7.ok && r7.det.reintentar_en >= 1 && r7.det.reintentar_en <= 60, `…con reintentar_en entre 1 y 60 s (${!r7.ok && r7.det.reintentar_en})`);
  anda(await enviar(db, BLU, DM_AJ, "en otra conversación sí"), "…pero en otra conversación entra");
  await envejecer(db, G);
  anda(await enviar(db, BLU, G, "pasado el minuto"), "pasado el minuto, vuelve a entrar");
  // 150 por día de Bogotá, entre todas las keys (una sola persona: no hay ronda).
  const db2 = await nueva();
  await sembrarSinTriggers(db2, `insert into chat_messages(conversation_id, sender_id, content, created_at, api_key_id, api_display_name)
    select '${G}', '${ALVARO}', 'sembrado ' || g, greatest(now() - interval '90 seconds', (date_trunc('day', now() at time zone 'America/Bogota')) at time zone 'America/Bogota'), '${K_BLU}', 'BLU'
      from generate_series(1, 149) g`);
  anda(await enviar(db2, BLU, G, "el 150"), "el 150.º del día entra");
  const d151 = await enviar(db2, PANEL, G, "el 151");
  rechazo(d151, "MV429", "limite", "conversation_day", "el 151.º del día se rechaza (también desde otra key)");
  const finDia = Number((await uno(db2, `select ceil(extract(epoch from ((date_trunc('day', now() at time zone 'America/Bogota') + interval '1 day') at time zone 'America/Bogota') - now()))::int s`))?.s);
  check(!d151.ok && Math.abs(d151.det.reintentar_en - finDia) <= 2, `…y se libera a la medianoche de Bogotá (reintentar_en ${!d151.ok && d151.det.reintentar_en}, faltan ${finDia} s)`);
  await db2.exec(`update chat_messages set created_at = (date_trunc('day', now() at time zone 'America/Bogota') at time zone 'America/Bogota') - interval '1 minute' where content like 'sembrado%'`);
  anda(await enviar(db2, PANEL, G, "los de ayer no cuentan"), "los de ayer (Bogotá) no cuentan");

  // La ronda: dos keys de personas distintas se turnan en un directo.
  const ronda = async (d: PGlite) => {
    let n = 0;
    for (let i = 0; i < 20; i++) {
      if (i % 5 === 0) await envejecer(d, DM_AJ);
      if ((await enviar(d, i % 2 ? PANEL : BLU, DM_AJ, `ronda ${i}`)).ok) n++;
    }
    await envejecer(d, DM_AJ);
    return { n, r21: await enviar(d, BLU, DM_AJ, "la 21") };
  };
  const db3 = await nueva();
  const { n, r21 } = await ronda(db3);
  check(n === 20, `BLU y «Panel QA» se turnan 20 veces en el directo de Alvaro y Jhon (${n})`);
  rechazo(r21, "MV429", "limite", "conversation_loop", "la 21.ª se corta: la ronda entre integraciones");
  check(!r21.ok && r21.det.reintentar_en === 3600, `…con reintentar_en 3600 (${!r21.ok && r21.det.reintentar_en})`);
  anda(await intentar(db3, app(JHON), `insert into chat_messages(conversation_id, sender_id, content) values ('${DM_AJ}', '${JHON}', 'escribo yo')`), "Jhon escribe a mano en el directo");
  anda(await enviar(db3, BLU, DM_AJ, "después de una persona"), "un mensaje humano en las últimas 20 desarma la ronda");
  // Línea base: la misma ronda sin el corte deja pasar la 21.
  const iCorte = MIG_B.indexOf("  if _hay = 20 and _humanos = 0 and _personas >= 2 then");
  const fCorte = MIG_B.indexOf("  end if;\n", iCorte) + "  end if;\n".length;
  const sinCorte = iCorte < 0 ? MIG_B : MIG_B.slice(0, iCorte) + MIG_B.slice(fCorte);
  check(sinCorte !== MIG_B, "(el banco sabe sacarle el corte de ronda a la migración)");
  const db4 = await nueva(sinCorte);
  const base = await ronda(db4);
  check(base.n === 20 && base.r21.ok, `línea base: sin el corte, la 21.ª pasa${base.r21.ok ? "" : ` (${desc(base.r21)})`}`);
  // Una sola integración que publica sola no se corta.
  const db5 = await nueva();
  let solo = 0;
  for (let i = 0; i < 21; i++) { if (i % 5 === 0) await envejecer(db5, DM_AJ); if ((await enviar(db5, BLU, DM_AJ, `reporte ${i}`)).ok) solo++; }
  check(solo === 21, `una sola integración que publica 21 seguidas en un directo no se corta (${solo})`);
  // Dos integraciones de la MISMA persona tampoco (la ronda se mide por persona).
  const db6 = await nueva();
  let misma = 0;
  for (let i = 0; i < 21; i++) { if (i % 5 === 0) await envejecer(db6, DM_AJ); if ((await enviar(db6, i % 2 ? api(ALVARO, K_WEB) : BLU, DM_AJ, `dos mías ${i}`)).ok) misma++; }
  check(misma === 21, `dos integraciones de la misma persona que se turnan 21 veces no se cortan (${misma})`);
}

// ════ 9. Los cupos y sus ventanas ════════════════════════════════════════════
{
  const db = await nueva();
  const filas = await q(db, `select * from api_escritura_cupos where clave in ('llave:${K_BLU}', 'agencia:${T1}', 'plataforma') order by clave`);
  const ARRANQUE = { lim_msj_min: 60, lim_msj_hora: 1000, lim_msj_dia: 10000, lim_dest_min: 300, lim_dest_hora: 4000, lim_dest_dia: 40000, lim_chats_dia: 100, lim_edic_min: 30, lim_edic_hora: 300 };
  check(filas.length === 3 && filas.every((f) => Object.entries(ARRANQUE).every(([k, v]) => f[k] === v)),
    `los tres niveles arrancan con 60/1.000/10.000 mensajes, 300/4.000/40.000 destinatarios, 100 chats, 30/300 ediciones (${filas.length} filas)`);
  check(filas.every((f) => f.lim_dest_hora >= 4 * f.lim_msj_hora && f.lim_dest_dia >= 4 * f.lim_msj_dia && f.lim_dest_min >= 4 * f.lim_msj_min && f.lim_dest_min >= 52),
    "1.000 directos por hora entran: un directo pesa 4 y 4 × 1.000 ≤ 4.000 (y lo mismo por minuto y por día); un grupo de 50 (52) entra en un minuto");
  const llaves = await q(db, `select clave from api_escritura_cupos where clave like 'llave:%' order by 1`);
  check(llaves.length === 7, `el trigger de api_keys creó la fila de cada key con messenger:write (${llaves.length}: también las revocadas y vencidas; no las de lectura)`);
  // Techos: solo una migración los sube.
  for (const [col, v] of [["lim_msj_hora", 2001], ["lim_msj_min", 121], ["lim_dest_min", 51], ["lim_dest_hora", 8001], ["lim_chats_dia", 101], ["lim_edic_hora", 1001]] as [string, number][]) {
    rechazo(await intentar(db, PG, `update api_escritura_cupos set ${col} = ${v} where clave = 'plataforma'`), "23514", null, null, `el techo de ${col} no deja poner ${v}`);
  }
  anda(await intentar(db, PG, `update api_escritura_cupos set lim_msj_hora = 2000, lim_msj_dia = 20000 where clave = 'plataforma'`), "hasta el techo sí (2.000 por hora)");
  rechazo(await intentar(db, PG, `update api_escritura_cupos set lim_msj_min = 100, lim_msj_hora = 50 where clave = 'plataforma'`), "23514", null, null, "el minuto no puede ser más que la hora");
  await db.exec(`update api_escritura_cupos set lim_msj_hora = 1000, lim_msj_dia = 10000 where clave = 'plataforma'`);
  // El peso: un directo 4, «Grupo» (5) 7.
  anda(await enviar(db, BLU, DM_AJ, "un directo"), "BLU manda un directo");
  anda(await enviar(db, BLU, G, "a cinco"), "y uno a «Grupo»");
  const tres = await q(db, `select clave, min_msj m, min_dest d, hora_dest h, dia_dest x from api_escritura_cupos where clave in ('llave:${K_BLU}', 'agencia:${T1}', 'plataforma')`);
  check(tres.every((f) => f.m === 2 && f.d === 11 && f.h === 11 && f.x === 11), `un directo pesa 4 y un grupo de 5 pesa 7, en la key, la agencia y la plataforma (${JSON.stringify(tres.map((f) => [f.m, f.d]))})`);
  // Minuto.
  await db.exec(`update api_escritura_cupos set lim_msj_min = 3 where clave = 'llave:${K_BLU}'`);
  anda(await enviar(db, BLU, G50, "el tercero"), "el 3.º del minuto entra");
  const m4 = await enviar(db, BLU, DM_AJ, "el cuarto");
  rechazo(m4, "MV429", "limite", "key_messages_minute", "con un tope de 3 por minuto, el 4.º se rechaza");
  check(!m4.ok && m4.det.reintentar_en >= 1 && m4.det.reintentar_en <= 60, `…y se libera al empezar el minuto siguiente (${!m4.ok && m4.det.reintentar_en} s)`);
  const antesRechazo = await cupo(db, `llave:${K_BLU}`);
  check(antesRechazo?.min_msj === 3 && antesRechazo?.hora_msj === 3, "el rechazo no gastó nada");
  await db.exec(`update api_escritura_cupos set min_inicio = min_inicio - interval '1 minute' where clave = 'llave:${K_BLU}'`);
  anda(await enviar(db, BLU, DM_AJ, "minuto nuevo"), "en el minuto siguiente vuelve a entrar (la ventana avanza)");
  await db.exec(`update api_escritura_cupos set lim_msj_min = 60 where clave = 'llave:${K_BLU}'`);
  // Hora: el 1.000.º entra, el 1.001.º no.
  await db.exec(`update api_escritura_cupos set hora_msj = 999, hora_inicio = date_trunc('hour', now()) where clave in ('llave:${K_BLU}')`);
  anda(await enviar(db, BLU, G50, "el mil"), "con 999 en la hora, el 1.000.º entra");
  rechazo(await enviar(db, BLU, G, "el mil uno"), "MV429", "limite", "key_messages_hour", "el 1.001.º de la hora se rechaza");
  await db.exec(`update api_escritura_cupos set hora_msj = 0, hora_dest = 3992, min_dest = 0, min_msj = 0 where clave = 'llave:${K_BLU}'`);
  await envejecer(db, DM_AJ);
  anda(await enviar(db, BLU, DM_AJ, "dest 3996"), "con 3.992 destinatarios en la hora, un directo (4) entra…");
  anda(await enviar(db, BLU, DM_AJ, "dest 4000"), "…y otro, que llega justo a 4.000…");
  rechazo(await enviar(db, BLU, DM_AJ, "dest 4004"), "MV429", "limite", "key_recipients_hour", "…y el siguiente no: los destinatarios de la hora");
  await db.exec(`update api_escritura_cupos set hora_dest = 0, dia_msj = 10000, dia_inicio = (now() at time zone 'America/Bogota')::date where clave = 'llave:${K_BLU}'`);
  const dia = await enviar(db, BLU, G, "el del día");
  rechazo(dia, "MV429", "limite", "key_messages_day", "con 10.000 en el día, el siguiente se rechaza");
  check(!dia.ok && dia.det.reintentar_en > 0 && dia.det.reintentar_en <= 86400, `…hasta la medianoche de Bogotá (${!dia.ok && dia.det.reintentar_en} s)`);
  await db.exec(`update api_escritura_cupos set dia_inicio = dia_inicio - 1 where clave = 'llave:${K_BLU}'`);
  await envejecer(db, G);
  anda(await enviar(db, BLU, G, "al otro día"), "al otro día vuelve a entrar");
  // La agencia y la plataforma.
  await db.exec(`update api_escritura_cupos set lim_msj_min = 1, min_msj = 1, min_inicio = date_trunc('minute', now()) where clave = 'agencia:${T1}'`);
  rechazo(await enviar(db, api(JHON, K_PANEL), DM_JA, "agencia"), "MV429", "limite", "agency_messages_minute", "el tope de la agencia frena a todas sus keys");
  await db.exec(`update api_escritura_cupos set lim_msj_min = 60 where clave = 'agencia:${T1}'; update api_escritura_cupos set lim_msj_min = 1, min_msj = 1, min_inicio = date_trunc('minute', now()) where clave = 'plataforma'`);
  rechazo(await enviar(db, api(JHON, K_PANEL), DM_JA, "plataforma"), "MV429", "limite", "platform_messages_minute", "y el de la plataforma, a todas las agencias");
  await db.exec(`update api_escritura_cupos set lim_msj_min = 60 where clave = 'plataforma'`);
  // Un pedido que la RLS rechaza después del trigger no deja nada gastado.
  const antesRls = await cupo(db, `llave:${K_BLU}`);
  rechazo(await enviar(db, BLU, G_ANUNCIOS, "anuncio"), "42501", null, null, "un mensaje que la RLS rechaza (grupo de anuncios)…");
  const despuesRls = await cupo(db, `llave:${K_BLU}`);
  check(antesRls?.hora_msj === despuesRls?.hora_msj && antesRls?.dia_dest === despuesRls?.dia_dest, `…no gasta cupo: la transacción vuelve atrás entera (${antesRls?.hora_msj} → ${despuesRls?.hora_msj})`);
  // Chats nuevos y ediciones.
  await db.exec(`update api_escritura_cupos set lim_chats_dia = 1 where clave = 'llave:${K_BLU}'`);
  anda(await abrir(db, BLU, BETO, "hola Beto"), "BLU abre un directo nuevo con Beto");
  rechazo(await abrir(db, BLU, CARLA, "hola Carla"), "MV429", "limite", "key_new_chats_day", "con un tope de 1 chat nuevo por día, el segundo se rechaza");
  anda(await abrir(db, BLU, JHON, "al directo que ya existe"), "reusar un directo que ya existe no gasta chats");
  await db.exec(`update api_escritura_cupos set lim_edic_min = 1 where clave = 'llave:${K_BLU}'`);
  const m = mensajeDe(await enviar(db, BLU, G50, "para editar"));
  anda(await editar(db, BLU, G50, m.id, "editado una vez"), "la primera edición del minuto entra");
  rechazo(await editar(db, BLU, G50, m.id, "editado dos veces"), "MV429", "limite", "key_edits_minute", "con un tope de 1 edición por minuto, la segunda se rechaza");
  rechazo(await borrar(db, BLU, G50, m.id), "MV429", "limite", "key_edits_minute", "borrar también gasta una edición");
}

// ════ 10. La idempotencia ════════════════════════════════════════════════════
{
  const db = await nueva();
  const r1 = await enviar(db, BLU, G, "una vez", { idem: "pedido-repetido-1" });
  const r2 = await enviar(db, BLU, G, "una vez", { idem: "pedido-repetido-1" });
  const cuantos = (await uno(db, `select count(*)::int n from chat_messages where content = 'una vez'`))?.n;
  check(r1.ok && r2.ok && r1.r.repetido === false && r2.r.repetido === true && mensajeDe(r2).id === mensajeDe(r1).id && cuantos === 1,
    `la misma Idempotency-Key con el mismo pedido devuelve el MISMO mensaje con repetido = true y no escribe otro (${cuantos} fila)`);
  const gasto = await cupo(db, `llave:${K_BLU}`);
  check(gasto?.dia_msj === 1, `la repetición no gasta cupo (${gasto?.dia_msj})`);
  anda(await editar(db, BLU, G, mensajeDe(r1).id, "una vez, corregido"), "(se edita el mensaje)");
  const r3 = await enviar(db, BLU, G, "una vez", { idem: "pedido-repetido-1" });
  check(r3.ok && r3.r.repetido === true && mensajeDe(r3).content === "una vez, corregido", `la repetición devuelve el mensaje como está ahora (${r3.ok && mensajeDe(r3).content})`);
  rechazo(await enviar(db, BLU, G, "otro texto", { idem: "pedido-repetido-1" }), "MV409", "error", "idempotency_key_reused", "la misma key con OTRO pedido: 409");
  rechazo(await enviar(db, BLU, DM_AJ, "una vez", { idem: "pedido-repetido-1" }), "MV409", "error", "idempotency_key_reused", "…también si cambia la conversación");
  const otraKey = await enviar(db, api(ALVARO, K_WEB), G, "una vez", { idem: "pedido-repetido-1" });
  check(otraKey.ok && otraKey.r.repetido === false, "la misma Idempotency-Key en OTRA key es otro pedido");
  for (const [k, n] of [["corta", "de menos de 8"], ["con espacio 1", "con espacio"], ["x".repeat(101), "de 101"], ["pedido-ñandú", "no ASCII"], [null, "sin Idempotency-Key"]] as [string | null, string][]) {
    rechazo(await rpc(db, BLU, "api_messenger_enviar", { _conversacion: G, _texto: "x", _idem: k }), "MV422", "error", "invalid_idempotency_key", `Idempotency-Key ${n}`);
  }
  // La huella no se ve.
  rechazo(await intentar(db, BLU, `select * from api_escritura_idem`), "42501", null, null, "una sesión de key no lee api_escritura_idem");
  rechazo(await intentar(db, app(ALVARO), `select * from api_escritura_idem`), "42501", null, null, "la app tampoco");
  const fila = await uno(db, `select encode(huella_sha, 'hex') hx, encode(huella_sha, 'base64') b64, encode(clave_sha, 'hex') cx from api_escritura_idem where message_id = $1`, [mensajeDe(r1).id]);
  const todo = JSON.stringify(await q(db, `select to_jsonb(m) j from chat_messages m where id = $1`, [mensajeDe(r1).id]));
  check(!!fila?.hx && !todo.includes(fila.hx) && !todo.includes(fila.b64) && !todo.includes(fila.cx), "ninguna columna de chat_messages (la fila que viaja por Realtime) deja ver la huella ni la clave");
  const colsM = await q(db, `select column_name c, data_type t from information_schema.columns where table_schema = 'public' and table_name = 'chat_messages' and (data_type = 'bytea' or column_name ~ 'huella|idem')`);
  check(colsM.length === 0, "chat_messages no tiene ninguna columna de idempotencia");
  const salida = await q(db, `select parameter_name p from information_schema.parameters where specific_schema = 'public' and specific_name like 'api_idem_buscar%' and parameter_mode = 'OUT'`);
  check(salida.length === 4 && !salida.some((x) => /huella/.test(x.p)), `api_idem_buscar no devuelve la huella: compara adentro (${salida.map((x) => x.p).join(", ")})`);
  // 72 horas.
  await db.exec(`update api_escritura_idem set created_at = now() - interval '73 hours' where message_id = '${mensajeDe(r1).id}'`);
  const r4 = await enviar(db, BLU, G, "otro pedido después de 72 h", { idem: "pedido-repetido-1" });
  check(r4.ok && r4.r.repetido === false && mensajeDe(r4).id !== mensajeDe(r1).id, `pasadas las 72 h, la misma Idempotency-Key es un pedido nuevo (la fila vieja se reemplaza)${r4.ok ? "" : ` → ${desc(r4)}`}`);
  await db.exec(`update api_escritura_idem set created_at = now() - interval '73 hours'`);
  const job = (await uno(db, `select command c from cron.job where jobname = 'api-escritura-idem-purga'`))?.c;
  await db.exec(job);
  check((await uno(db, `select count(*)::int n from api_escritura_idem`))?.n === 0, "la purga diaria borra lo de más de 72 h");
}

// ════ 11. Abrir un directo ═══════════════════════════════════════════════════
{
  const db = await nueva();
  const PANEL = api(JHON, K_PANEL);
  const reusa = await abrir(db, PANEL, ANA, "hola Ana");
  check(reusa.ok && reusa.r.created === false && reusa.r.conversation_id === DM_JA && mensajeDe(reusa).api_display_name === "Panel QA",
    `si ya hay un directo, lo reusa: el de Jhon y Ana (${reusa.ok ? reusa.r.conversation_id : desc(reusa)})`);
  const canon = await abrir(db, BLU, DANI, "hola Dani");
  check(canon.ok && canon.r.conversation_id === DMV2, `con dos directos viejos, el canónico (el del mensaje más reciente) (${canon.ok ? canon.r.conversation_id : desc(canon)})`);
  const n0 = (await uno(db, `select count(*)::int n from chat_conversations`))?.n as number;
  const nuevo = await abrir(db, BLU, BETO, "hola Beto", "abrir-beto-0001");
  const c = nuevo.ok ? await uno(db, `select type, created_by::text cb, creada_por_api_key::text k, tenant_id::text t,
      (select string_agg(user_id::text || ':' || role, ',' order by role) from chat_participants where conversation_id = c.id) p,
      (select count(*)::int from chat_messages where conversation_id = c.id) m
    from chat_conversations c where id = $1`, [nuevo.r.conversation_id]) : null;
  check(nuevo.ok && nuevo.r.created === true && c?.type === "direct" && c?.cb === ALVARO && c?.k === K_BLU && c?.t === T1
      && c?.p === `${ALVARO}:admin,${BETO}:member` && c?.m === 1,
    `si no hay, lo crea con el primer mensaje en la misma transacción: directo de la agencia, Alvaro admin y Beto member (${nuevo.ok ? JSON.stringify(c) : desc(nuevo)})`);
  const rep = await abrir(db, BLU, BETO, "hola Beto", "abrir-beto-0001");
  check(rep.ok && rep.r.repetido === true && rep.r.created === true && rep.r.conversation_id === (nuevo.ok ? nuevo.r?.conversation_id : null) && (await uno(db, `select count(*)::int n from chat_conversations`))?.n === n0 + 1,
    "la repetición devuelve el mismo directo (created sigue en true) sin abrir otro");
  rechazo(await abrir(db, BLU, ALVARO, "conmigo"), "MV422", "error", "cannot_message_self", "consigo mismo no");
  rechazo(await abrir(db, BLU, NUEVA, "hola"), "MV404", "error", "person_not_found", "con alguien dado de alta después de la migración SIN el sello de admin no");
  anda(await abrir(db, BLU, SELLADA, "hola Sara"), "con el sello de admin sí");
  rechazo(await abrir(db, BLU, BAJA, "hola"), "MV404", "error", "person_not_found", "con alguien dado de baja no");
  rechazo(await abrir(db, BLU, BLOQ, "hola"), "MV404", "error", "person_not_found", "con alguien bloqueado no");
  rechazo(await abrir(db, BLU, "a0000000-0000-4000-8000-0000000000ee", "hola"), "MV404", "error", "person_not_found", "con alguien que no existe no");
  await db.exec(`delete from tenant_members where user_id = '${CARLA}'`);
  rechazo(await abrir(db, BLU, CARLA, "hola"), "MV404", "error", "person_not_found", "con alguien que no es de la agencia de la key no");
  const n1 = (await uno(db, `select count(*)::int n from chat_conversations`))?.n;
  rechazo(await abrir(db, BLU, DANI, "  "), "MV422", "error", "invalid_text", "con un texto inválido falla…");
  rechazo(await abrir(db, BLU, relleno(1), "con \u202E"), "MV422", "error", "invalid_text", "…también si el directo era nuevo…");
  check((await uno(db, `select count(*)::int n from chat_conversations`))?.n === n1, "…y no queda un directo vacío");
  // La pared, sin la RPC: por INSERT directo con la sesión de la key.
  const D = "c9300000-0000-4000-8000-000000000001";
  rechazo(await intentar(db, BLU, `insert into chat_conversations(id, type, name, created_by) values ('${D}', 'group', 'por API', '${ALVARO}')`), "MV403", "error", "forbidden", "por API no se crea un grupo");
  rechazo(await intentar(db, BLU, `insert into chat_participants(conversation_id, user_id, role) values ('${G}', '${DANI}', 'member')`), "MV403", "error", "forbidden", "por API no se suma a nadie a un grupo que ya existe");
  rechazo(await intentar(db, BLU, `insert into chat_conversations(id, type, created_by) values ('${D}', 'direct', '${ALVARO}');
    insert into chat_participants(conversation_id, user_id, role) values ('${D}', '${ALVARO}', 'admin');
    insert into chat_participants(conversation_id, user_id, role) values ('${D}', '${NUEVA}', 'member')`), "MV404", "error", "person_not_found", "por INSERT directo tampoco se suma a alguien no alcanzable");
  anda(await intentar(db, BLU, `insert into chat_conversations(id, type, created_by) values ('${D}', 'direct', '${ALVARO}')`), "(un directo creado por INSERT directo, en un pedido…)");
  rechazo(await intentar(db, BLU, `insert into chat_participants(conversation_id, user_id, role) values ('${D}', '${ALVARO}', 'admin')`), "MV403", "error", "forbidden", "…no recibe participantes en OTRO pedido");
  // Los topes de conversaciones de la persona.
  const db2 = await nueva();
  await sembrarSinTriggers(db2, `insert into chat_conversations(id, type, name, created_by, tenant_id)
      select ('c8000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'group', 'g' || g, '${ALVARO}', '${T1}' from generate_series(1, 445) g;
    insert into chat_participants(conversation_id, user_id, role)
      select ('c8000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, '${ALVARO}', 'admin' from generate_series(1, 445) g`);
  rechazo(await abrir(db2, BLU, BETO, "hola"), "MV422", "error", "too_many_conversations", "la persona de la key ya está en 450 conversaciones");
  const db3 = await nueva();
  await sembrarSinTriggers(db3, `insert into chat_conversations(id, type, created_by, tenant_id, creada_por_api_key)
      select ('c8000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'direct', '${ALVARO}', '${T1}', '${K_WEB}' from generate_series(1, 200) g`);
  rechazo(await abrir(db3, BLU, BETO, "hola"), "MV422", "error", "too_many_conversations", "sus keys ya abrieron 200 conversaciones (cuentan todas las de la persona)");
}

// ════ 12. Las marcas, editar y borrar ════════════════════════════════════════
{
  const db = await nueva();
  const m = mensajeDe(await enviar(db, BLU, G, "de BLU"));
  check(m.api_key_id === K_BLU && m.api_display_name === "BLU" && m.sender_id === ALVARO, `el mensaje sale con la marca de la base: la key, «BLU» y la persona real (${JSON.stringify([m.api_key_id, m.api_display_name])})`);
  const marca = async () => (await uno(db, `select api_key_id::text k, api_display_name n from chat_messages where id = $1`, [m.id]));
  for (const [s, n] of [[app(ALVARO), "la persona desde la app"], [SR, "service_role"], [PG, "postgres"], [BLU, "la propia key"]] as [Sesion, string][]) {
    await intentar(db, s, `update chat_messages set api_key_id = null, api_display_name = 'Otro' where id = '${m.id}'`);
    const k = await marca();
    check(k?.k === K_BLU && k?.n === "BLU", `la marca no cambia aunque la toque ${n} (${JSON.stringify(k)})`);
  }
  rechazo(await intentar(db, app(ALVARO), `update chat_messages set content = 'lo cambio a mano', is_edited = true where id = '${m.id}'`), "MV403", "error", "forbidden", "la app no edita un mensaje que mandó una integración");
  rechazo(await intentar(db, app(ALVARO), `update chat_messages set content_rich = '{"type":"doc"}' where id = '${m.id}'`), "MV403", "error", "forbidden", "…ni le pone texto rico");
  const ed = await editar(db, BLU, G, m.id, "  de BLU, editado\r\n");
  check(ed.ok && ed.r.cambiado === true && mensajeDe(ed).content === "de BLU, editado" && mensajeDe(ed).is_edited === true, `la API edita lo que mandó su integración (normalizado y con la marca de editado)${ed.ok ? "" : ` → ${desc(ed)}`}`);
  const edAntes = (await cupo(db, `llave:${K_BLU}`))?.min_edic;
  const igual = await editar(db, BLU, G, m.id, "de BLU, editado");
  const ed0 = (await cupo(db, `llave:${K_BLU}`))?.min_edic;
  check(igual.ok && igual.r.cambiado === false && ed0 === edAntes && edAntes >= 1, `con el mismo texto no escribe ni gasta una edición (ediciones: ${edAntes} → ${ed0})`);
  anda(await editar(db, api(ALVARO, K_BLU2), G, m.id, "editado por la key rotada"), "la key que reemplaza a BLU (misma integración) también lo edita");
  rechazo(await editar(db, api(ALVARO, K_WEB), G, m.id, "x"), "MV403", "error", "other_integration_message", "otra integración de la misma persona, no");
  rechazo(await editar(db, BLU, G, M_ALV_MANO, "x"), "MV403", "error", "not_an_api_message", "lo que la persona escribió a mano, no");
  rechazo(await editar(db, BLU, G, M_G_ANA, "x"), "MV403", "error", "not_your_message", "lo de otra persona, no");
  rechazo(await editar(db, BLU, DM_AJ, m.id, "x"), "MV404", "error", "not_found", "un mensaje que no es de esa conversación: 404");
  rechazo(await editar(db, BLU, G, "e0000000-0000-4000-8000-0000000000ee", "x"), "MV404", "error", "not_found", "uno que no existe: 404");
  rechazo(await editar(db, BLU, G_SIN, M_SIN, "x"), "MV404", "error", "not_found", "uno de una conversación donde no está: 404");
  rechazo(await editar(db, BLU, G, m.id, "a".repeat(4001)), "MV422", "error", "invalid_text", "editar a 4.001 caracteres, no");
  // La pared, sin la RPC.
  rechazo(await intentar(db, BLU, `update chat_messages set content = 'directo' where id = '${M_ALV_MANO}'`), "MV403", "error", "not_an_api_message", "por UPDATE directo tampoco toca lo escrito a mano");
  rechazo(await intentar(db, api(ALVARO, K_WEB), `update chat_messages set content = 'directo' where id = '${m.id}'`), "MV403", "error", "other_integration_message", "…ni lo de otra integración");
  // Borrar.
  rechazo(await borrar(db, api(ALVARO, K_WEB), G, m.id), "MV403", "error", "other_integration_message", "otra integración no lo borra");
  rechazo(await borrar(db, BLU, G, M_ALV_MANO), "MV403", "error", "not_an_api_message", "la API no borra lo escrito a mano");
  const b = await borrar(db, BLU, G, m.id);
  const arch = await uno(db, `select d.api_key_id::text k, d.api_display_name n, d.deleted_by::text por, d.content c, m.is_deleted b, m.content mc, m.api_display_name mn
    from chat_message_deletions d join chat_messages m on m.id = d.message_id where d.message_id = $1`, [m.id]);
  check(b.ok && b.r.already_deleted === false && arch?.k === K_BLU && arch?.n === "BLU" && arch?.por === ALVARO && arch?.c === "editado por la key rotada" && arch?.b === true && arch?.mc === null && arch?.mn === "BLU",
    `la API borra lo suyo por delete_chat_message: el archivo guarda texto y marcas, y el mensaje queda vacío con su marca (${JSON.stringify(arch)})`);
  const b2 = await borrar(db, BLU, G, m.id);
  check(b2.ok && b2.r.already_deleted === true, "borrar otra vez: already_deleted");
  rechazo(await editar(db, BLU, G, m.id, "x"), "MV409", "error", "message_deleted", "editar uno borrado: 409");
  // La app borra un mensaje de su integración.
  const m2 = mensajeDe(await enviar(db, BLU, G50, "lo borra la persona"));
  const ba = await intentar(db, app(ALVARO), `select public.delete_chat_message('${m2.id}') r`);
  const arch2 = await uno(db, `select api_key_id::text k, api_display_name n from chat_message_deletions where message_id = $1`, [m2.id]);
  check(ba.ok && ba.r?.ok === true && arch2?.k === K_BLU && arch2?.n === "BLU", `la app SÍ borra un mensaje de su integración, y el archivo guarda la marca (${JSON.stringify(arch2)})`);
  // Con el interruptor apagado, borrar también se corta.
  const m3 = mensajeDe(await enviar(db, BLU, DM_AJ, "para borrar con el interruptor apagado"));
  await db.exec(`update app_flags set enabled = false where key = 'api_messenger_escritura'`);
  rechazo(await borrar(db, BLU, DM_AJ, m3.id), "MV503", "motivo", "interruptor", "con el interruptor apagado la API tampoco borra (la limpieza es la retirada)");
  rechazo(await editar(db, BLU, DM_AJ, m3.id, "x"), "MV503", "motivo", "interruptor", "…ni edita");
}

// ════ 13. El nombre visible ══════════════════════════════════════════════════
{
  const db = await nueva();
  let n = 0;
  const alta = (nombre: string | null, extra: Fila = {}) => {
    const id = `21000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
    return intentar(db, PG, `insert into public.api_keys(id, name, key_prefix, key_hash, created_by, acts_as_user_id, tenant_id, scopes, ip_whitelist, expires_at, api_display_name${extra.integracion ? ", integracion_id" : ""})
      values ($1::uuid, 'k', 'p', 'hx' || $1::text, $2::uuid, $2::uuid, '${T1}', $3::text[], '{1.2.3.4}', now() + interval '30 days', $4::text${extra.integracion ? ", $5::uuid" : ""}) returning id, api_display_name r`,
      [id, extra.quien ?? ALVARO, extra.scopes ?? "{messenger:read,messenger:write}", nombre, ...(extra.integracion ? [extra.integracion] : [])]);
  };
  for (const [nombre, error, por] of [
    ["ВLU", "display_name_format", "«ВLU» con la В cirílica"],
    ["B\u200BLU", "display_name_format", "con un espacio de ancho cero"],
    ["B", "display_name_format", "de 1 carácter"],
    ["x".repeat(33), "display_name_format", "de 33"],
    ["...", "display_name_format", "sin letras"],
    ["Mav3n", "display_name_reserved", "«Mav3n»"],
    ["MavenBot", "display_name_reserved", "«MavenBot»"],
    ["Sistemas", "display_name_reserved", "«Sistemas»"],
    ["Administración", "display_name_reserved", "«Administración»"],
    ["Alvaro_CEO", "display_name_reserved", "«Alvaro_CEO»"],
    ["Ciberseguridad", "display_name_reserved", "«Ciberseguridad»"],
    ["Ana", "display_name_person", "el nombre de pila de alguien"],
    ["Bot de Ana", "display_name_person", "un nombre de pila como palabra"],
    ["Beto Paz", "display_name_person", "el nombre completo de alguien"],
    ["JhonLopezBot", "display_name_person", "un nombre completo pegado"],
    ["Nexo", "display_name_taken", "el de una integración vencida y revocada de OTRA persona"],
    ["N3x0", "display_name_taken", "…también escrito «N3x0»"],
    ["B.L.U", "display_name_taken", "«B.L.U» (BLU es de otra integración)"],
  ] as [string, string, string][]) {
    rechazo(await alta(nombre), "MV422", "error", error, `nombre visible ${por}`);
  }
  const rot = await alta("BLU", { integracion: I_BLU });
  check(rot.ok, `la rotación (misma integración) conserva «BLU»${rot.ok ? "" : ` → ${desc(rot)}`}`);
  rechazo(await alta("BLU", { integracion: I_PANEL }), "MV422", "error", "integration_not_yours", "una key no se cuelga de la integración de otra persona");
  const norm = await alta("  Señal   Ágil  ");
  check(norm.ok && norm.filas[0]?.r === "Señal Ágil", `con tildes y espacios de más: se normaliza (${norm.ok ? norm.filas[0]?.r : desc(norm)})`);
  rechazo(await alta(null), "MV422", "error", "display_name_required", "con messenger:write y sin nombre visible no");
  rechazo(await alta("Escribe Sola", { scopes: "{messenger:write}" }), "MV422", "error", "messenger_write_without_read", "messenger:write sin messenger:read no");
  rechazo(await intentar(db, PG, `update public.api_keys set scopes = '{messenger:read,messenger:write}', api_display_name = 'Tarde' where id = '${K_LEE}'`), "MV422", "error", "messenger_write_only_new_keys", "messenger:write no se agrega al editar una key");
  rechazo(await intentar(db, PG, `update public.api_keys set integracion_id = gen_random_uuid() where id = '${K_BLU}'`), "MV422", "error", "integration_immutable", "la integración de una key no cambia");
  anda(await intentar(db, PG, `update public.api_keys set scopes = '{messenger:read}' where id = '${K_WEB}'`), "quitarle messenger:write a una key sí se puede");
  anda(await intentar(db, PG, `update public.api_keys set last_used_at = now(), request_count = request_count + 1 where id = '${K_BLU}'`), "api_key_consumir (UPDATE de cada pedido) no pasa por el trigger del nombre");
  const sinNombre = await alta(null, { scopes: "{creators:read}" });
  check(sinNombre.ok, `una key que no es de Messenger se crea igual que antes, sin nombre visible${sinNombre.ok ? "" : ` → ${desc(sinNombre)}`}`);
  // Nadie se llama como una integración (la mitad de A10 que vive aquí).
  rechazo(await intentar(db, SR, `update profiles set full_name = 'Blu' where id = '${BETO}'`), "MV422", null, null, "el admin no le pone a alguien el nombre de una integración («Blu»)");
  rechazo(await intentar(db, SR, `update profiles set full_name = 'B.L.U.' where id = '${BETO}'`), "MV422", null, null, "…ni escrito «B.L.U.»");
  anda(await intentar(db, SR, `update profiles set full_name = 'Beto Paz Ruiz' where id = '${BETO}'`), "cualquier otro nombre, sí");
  anda(await intentar(db, app(BETO), `update profiles set full_name = full_name, status = 'busy' where id = '${BETO}'`), "la app que manda el mismo full_name (y otro campo) sigue pudiendo guardar el perfil");
  rechazo(await intentar(db, app(BETO), `update profiles set full_name = 'Otro' where id = '${BETO}'`), "P0001", null, null, "y desde la app sigue sin poder cambiarse el nombre (A)");
  anda(await intentar(db, PG, `insert into auth.users(id, email, raw_user_meta_data) values ('a0000000-0000-4000-8000-0000000000fe', 'blu@ejemplo.test', '{"full_name":"Blu"}')`), "el alta (handle_new_user) no pasa por esta regla: es INSERT");
}

// ════ 14. Cómo llega: notificaciones ═════════════════════════════════════════
{
  const db = await nueva();
  const m = mensajeDe(await enviar(db, BLU, G, "aviso para el grupo"));
  const t = await q(db, `select user_id::text u, title, type, message, deep_link_url d from notifications where deep_link_url like '%' || $1 order by user_id`, [m.id]);
  check(t.length === 4 && t.every((x) => x.title === "BLU (API) en Grupo" && x.type === "chat_message" && x.message === "aviso para el grupo"),
    `en un grupo: «BLU (API) en Grupo» a los 4 participantes, sin la persona de la key (${[...new Set(t.map((x) => x.title))].join(", ")})`);
  check(!t.some((x) => x.u === ALVARO), "la persona de la key no recibe la notificación de su propia integración");
  const d = mensajeDe(await enviar(db, BLU, DM_AJ, "aviso directo"));
  const td = await q(db, `select title from notifications where deep_link_url like '%' || $1`, [d.id]);
  check(td.length === 1 && td[0].title === "BLU (API)", `en un directo: «BLU (API)» (${td.map((x) => x.title).join(", ")})`);
  const me = mensajeDe(await enviar(db, BLU, G, "hola @Ana Ruiz"));
  const tm = await uno(db, `select title, type, priority from notifications where user_id = $1 and deep_link_url like '%' || $2`, [ANA, me.id]);
  check(tm?.title === "BLU (API) te mencionó en Grupo" && tm?.type === "chat_mention" && tm?.priority === "high", `una mención: «BLU (API) te mencionó en Grupo», con la prioridad de siempre (${JSON.stringify(tm)})`);
  const push = await q(db, `select body from net._pedidos where body->'ref'->>'message_id' = $1`, [m.id]);
  check(push.length <= 1, "el push sigue saliendo por push_chat_message, sin cambios (el nombre del push lo arma web-push, PR 3)");
  const hoy = await prodHoy();
  await hoy.exec(`insert into chat_messages(conversation_id, sender_id, content) values ('${G}', '${ALVARO}', 'en prod de hoy')`);
  const th = await uno(hoy, `select title from notifications where message = 'en prod de hoy' limit 1`);
  check(th?.title === "Alvaro Diaz en Grupo", `línea base: en prod de hoy el título lleva el nombre de la persona (${th?.title})`);
}

// ════ 15. Karma ══════════════════════════════════════════════════════════════
{
  const sembrar = (marcados: boolean) => `insert into chat_messages(conversation_id, sender_id, content, created_at${marcados ? ", api_key_id, api_display_name" : ""})
    select '${G}', '${ALVARO}', 'karma ' || g, now() - (g % 12) * interval '1 day' - interval '1 hour'${marcados ? `, '${K_BLU}', 'BLU'` : ""} from generate_series(1, 120) g`;
  const karma = async (d: PGlite) => (await como(d, app(JHON), `select public.get_karma_profile('${ALVARO}') r`))[0]?.r as Fila;
  const db = await nueva();
  await sembrarSinTriggers(db, sembrar(true));
  const conApi = await karma(db);
  check(conApi?.stars?.actividad === false && conApi?.admin?.msgs_sent_30d === 1, `120 mensajes por API en 12 días no le dan a la persona la estrella Actividad (cuenta ${conApi?.admin?.msgs_sent_30d}: el escrito a mano)`);
  const db2 = await nueva();
  await sembrarSinTriggers(db2, sembrar(false));
  const aMano = await karma(db2);
  check(aMano?.stars?.actividad === true && aMano?.admin?.msgs_sent_30d === 121, `línea base: los mismos 120 escritos a mano sí la dan (${aMano?.admin?.msgs_sent_30d})`);
}

// ════ 16. GET /me, el directorio y a quién se le escribe ═════════════════════
{
  const db = await nueva();
  const mi = (s: Sesion) => rpc(db, s, "api_mi_llave", {});
  for (const [s, n] of [[app(ALVARO), "la app"], [api(ALVARO, K_CREA), "una key {creators:read}"], [api(ALVARO, K_LEE), "una key {messenger:read}"]] as [Sesion, string][]) {
    const r = await mi(s);
    check(r.ok && r.r === null, `api_mi_llave con ${n}: null, sin error${r.ok ? "" : ` → ${desc(r)}`}`);
  }
  const yo = await mi(BLU);
  check(yo.ok && yo.r?.display_name === "BLU" && yo.r?.limits?.messages_per_hour === 1000 && yo.r?.remaining?.messages_hour === 1000,
    `api_mi_llave con BLU: el nombre visible, los topes y lo que queda (${yo.ok ? JSON.stringify(yo.r?.remaining) : desc(yo)})`);
  await enviar(db, BLU, DM_AJ, "uno");
  const yo2 = await mi(BLU);
  check(yo2.ok && yo2.r?.remaining?.messages_hour === 999 && yo2.r?.remaining?.recipients_hour === 3996, `…y lo que queda baja con cada mensaje (${yo2.ok && JSON.stringify([yo2.r?.remaining?.messages_hour, yo2.r?.remaining?.recipients_hour])})`);
  rechazo(await mi(api(ALVARO, K_REV)), "MV401", "error", "unauthorized", "api_mi_llave con una key con write revocada: 401");
  // El directorio.
  const dir = (s: Sesion, args: Fila = {}) => intentar(db, s, `select * from public.messenger_directorio(_q => $1, _limite => $2, _desde => $3)`, [args.q ?? null, args.limite ?? 50, args.desde ?? 0]);
  rechazo(await dir(api(ALVARO, K_LEE)), "MV403", "error", "forbidden", "el directorio con una key {messenger:read}: 403 (pide write)");
  rechazo(await dir(app(ALVARO)), "MV401", "error", "unauthorized", "la app no usa el directorio");
  const todos = await dir(BLU, { limite: 100 });
  const ids = todos.ok ? todos.filas.map((f) => f.id) : [];
  check(todos.ok && !ids.includes(ALVARO) && !ids.includes(NUEVA) && !ids.includes(BAJA) && !ids.includes(BLOQ) && ids.includes(SELLADA) && ids.includes(JHON) && ids.length === 58,
    `el directorio: la agencia sin la persona de la key, sin bajas, bloqueadas ni altas sin sello (${ids.length} personas)`);
  const ana = await dir(BLU, { q: "ÁNA" });
  check(ana.ok && ana.filas.length === 1 && ana.filas[0].name === "Ana Ruiz", `?q= sin acentos ni mayúsculas (${ana.ok && ana.filas.map((f) => f.name).join(", ")})`);
  for (const comodin of ["%", "_", "\\"]) {
    const c = await dir(BLU, { q: comodin });
    check(c.ok && c.filas.length === 0, `?q=${comodin} no es un comodín (${c.ok && c.filas.length})`);
  }
  const pag = await dir(BLU, { limite: 2 });
  const pag2 = await dir(BLU, { limite: 2, desde: 2 });
  check(pag.ok && pag.filas.length === 3 && pag2.ok && pag2.filas[0]?.id === pag.filas[2]?.id, "devuelve limit + 1 filas (has_more) y pagina con offset");
  const alc = (s: Sesion, otro: string) => rpc(db, s, "messenger_persona_alcanzable", { _otro: otro });
  const a1 = await alc(BLU, BETO), a2 = await alc(BLU, NUEVA), a3 = await alc(BLU, ALVARO);
  check(a1.ok && a1.r === true && a2.ok && a2.r === false && a3.ok && a3.r === false, "messenger_persona_alcanzable: Beto sí; un alta sin sello y uno mismo, no");
  rechazo(await alc(api(ALVARO, K_LEE), BETO), "MV403", "error", "forbidden", "messenger_persona_alcanzable con una key {messenger:read}: 403");
}

// ════ 17. La retirada de emergencia ══════════════════════════════════════════
{
  const db = await nueva();
  const ms = [
    mensajeDe(await enviar(db, BLU, G, "retirar 1")), mensajeDe(await enviar(db, BLU, DM_AJ, "retirar 2")),
    mensajeDe(await enviar(db, api(ALVARO, K_BLU2), G50, "retirar 3 (key rotada)")),
  ];
  const web = mensajeDe(await enviar(db, api(ALVARO, K_WEB), G, "de otra integración"));
  const desde = (await uno(db, `select now() - interval '1 hour' t`))?.t;
  const notifDe = async (ids: string[]) => (await uno(db, `select count(*)::int n from notifications where ${ids.map((_, i) => `deep_link_url like '%' || $${i + 1}`).join(" or ")}`, ids))?.n as number;
  const antes = await notifDe(ms.map((m) => m.id));
  const totalAntes = (await uno(db, `select count(*)::int n from notifications`))?.n as number;
  await db.exec(`update api_keys set revoked_at = now() where id = '${K_BLU}'; update app_flags set enabled = false where key = 'api_messenger_escritura'`);
  const ret = (s: Sesion, k = K_BLU, limite = 200) => rpc(db, s, "api_retirar_mensajes_de_integracion", { _llave: k, _desde: desde, _limite: limite });
  rechazo(await ret(app(ANA)), "MV403", "error", "forbidden", "alguien que no es admin ni la persona de la key no retira");
  rechazo(await ret(api(ALVARO, K_WEB)), "MV403", "error", "forbidden", "la API no la puede usar (sesión fabricada)");
  rechazo(await ret(ANON), "42501", null, null, "anon no la ejecuta");
  rechazo(await ret(app(JHON), "20000000-0000-4000-8000-0000000000ee"), "MV404", "error", "not_found", "una key que no existe: 404");
  const r1 = await ret(app(JHON), K_BLU, 2);
  check(r1.ok && r1.r?.retirados === 2 && r1.r?.quedan === 1, `con el tope de 2 por llamada retira 2 y dice que queda 1 (${r1.ok ? JSON.stringify(r1.r) : desc(r1)})`);
  const r2 = await ret(app(JHON));
  check(r2.ok && r2.r?.retirados === 1 && r2.r?.quedan === 0, `un admin de la agencia termina con la key REVOCADA y el interruptor apagado, también lo de la key rotada (${r2.ok ? JSON.stringify(r2.r) : desc(r2)})`);
  const est = await q(db, `select m.is_deleted b, m.content c, d.deleted_by::text por, d.api_display_name n, d.content dc from chat_messages m join chat_message_deletions d on d.message_id = m.id where m.id = any($1)`, [ms.map((m) => m.id)]);
  check(est.length === 3 && est.every((x) => x.b && x.c === null && x.por === JHON && x.n === "BLU" && /^retirar/.test(x.dc)),
    `los 3 quedan borrados y archivados con la marca, el texto y quién retiró (${est.length})`);
  const despues = await notifDe(ms.map((m) => m.id));
  const totalDespues = (await uno(db, `select count(*)::int n from notifications`))?.n as number;
  check(antes > 0 && despues === 0 && totalDespues === totalAntes - antes, `se lleva sus ${antes} notificaciones y nada más (${totalAntes} → ${totalDespues})`);
  const w = await uno(db, `select is_deleted from chat_messages where id = $1`, [web.id]);
  check(w?.is_deleted === false, "lo de otra integración de la misma persona queda");
  const r3 = await ret(app(ALVARO));
  check(r3.ok && r3.r?.retirados === 0, `la persona de la key también la puede correr (${r3.ok ? JSON.stringify(r3.r) : desc(r3)})`);
  // Quien ya salió de la conversación también pierde la notificación (el texto del
  // mensaje viaja en ella).
  await db.exec(`update app_flags set enabled = true where key = 'api_messenger_escritura'`);
  const sale = mensajeDe(await enviar(db, api(ALVARO, K_BLU2), G, "lo ve alguien que después se va"));
  const deBeto = async () => (await uno(db, `select count(*)::int n from notifications where user_id = '${BETO}' and deep_link_url like '%' || $1`, [sale.id]))?.n;
  const antesBeto = await deBeto();
  anda(await intentar(db, app(BETO), `delete from chat_participants where conversation_id = '${G}' and user_id = '${BETO}'`), "Beto sale del grupo");
  anda(await ret(app(JHON), K_BLU2), "se retira lo de la integración");
  check(antesBeto === 1 && await deBeto() === 0, `…y la notificación de Beto, que ya se fue, también se va (${antesBeto} → ${await deBeto()})`);
  // Un solo DELETE de notificaciones, después del recorrido (deep_link_url no tiene índice).
  const cuerpo = MIG_B.slice(MIG_B.indexOf("create or replace function public.api_retirar_mensajes_de_integracion"));
  const fn = cuerpo.slice(0, cuerpo.indexOf("\n$$;"));
  const deletes = fn.match(/delete from public\.notifications/g) ?? [];
  check(deletes.length === 1 && fn.indexOf("delete from public.notifications") > fn.indexOf("end loop;"), `la retirada borra las notificaciones con UN solo DELETE, después del recorrido (${deletes.length})`);
}
{
  // El tamaño de prod: un grupo de 41 personas y 175 mil notificaciones. Con un DELETE
  // por mensaje, 200 mensajes tardaban 29 s en PGlite (en prod, 278 ms cada uno: más que
  // los 8 s de statement_timeout, y no se retiraba nada).
  const db = await nueva();
  await sembrarSinTriggers(db, `
    insert into notifications(user_id, type, title, message, reference_id, reference_type, deep_link_url)
      select '${JHON}', 'chat_message', 'x', 'y', gen_random_uuid(), 'conversation', '/messenger?c=' || gen_random_uuid() || '&m=' || gen_random_uuid() from generate_series(1, 175000) g;
    insert into chat_messages(id, conversation_id, sender_id, content, api_key_id, api_display_name, created_at)
      select ('e9000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, '${G50}', '${ALVARO}', 'm' || g, '${K_BLU}', 'BLU', now() - g * interval '1 second' from generate_series(1, 200) g;
    insert into notifications(user_id, type, title, message, reference_id, reference_type, deep_link_url)
      select p.user_id, 'chat_message', 'BLU (API) en Cincuenta', 'm', '${G50}', 'conversation', '/messenger?c=${G50}&m=' || m.id
        from chat_messages m join chat_participants p on p.conversation_id = m.conversation_id and p.user_id <> m.sender_id
       where m.id::text like 'e9000000%'`);
  const n0 = (await uno(db, `select count(*)::int n from notifications`))?.n as number;
  const t0 = performance.now();
  const r = await rpc(db, app(JHON), "api_retirar_mensajes_de_integracion", { _llave: K_BLU, _desde: null, _limite: 200 });
  const ms = performance.now() - t0;
  const n1 = (await uno(db, `select count(*)::int n from notifications`))?.n as number;
  check(r.ok && r.r?.retirados === 200 && n0 - n1 === 200 * 49 && ms < 3000,
    `con ${n0} notificaciones, retirar 200 mensajes de un grupo de 50 tarda ${Math.round(ms)} ms y se lleva sus ${n0 - n1} notificaciones${r.ok ? "" : ` (${desc(r)})`}`);
}

// ════ 18. El freno por presión ═══════════════════════════════════════════════
{
  const db = await nueva();
  const uno_ = async (senal: string, valor: number | null, medible: boolean, espera: boolean, m: string) => {
    await presion(db, senal, valor, medible);
    await envejecer(db, G);
    const r = await enviar(db, BLU, G, `freno ${senal} ${valor}`);
    if (espera) anda(r, m); else rechazo(r, "MV503", "motivo", "presion", m);
    await db.exec(`update banco.presion set valor = case senal when 'backends' then 3 when 'slot' then 1024 else 0 end, medible = true`);
  };
  await uno_("backends", 15, true, true, "15 backends activos: anda (el umbral es más de 15)");
  await uno_("backends", 16, true, false, "16 backends activos: frena");
  await uno_("slot", 67108864, true, true, "64 MB sin leer por Realtime: anda");
  await uno_("slot", 67108865, true, false, "64 MB + 1 byte: frena");
  await uno_("cola", 200, true, true, "200 en la cola de pg_net: anda");
  await uno_("cola", 201, true, false, "201: frena");
  for (const s of ["backends", "slot", "cola"]) await uno_(s, 0, false, false, `${s} que no se puede medir: frena (falla cerrado)`);
  await uno_("slot", null, true, false, "un valor NULL: frena");
  await presion(db, "backends", 999, true);
  await db.exec(`update app_flags set enabled = false where key = 'api_messenger_escritura'`);
  rechazo(await enviar(db, BLU, G, "x"), "MV503", "motivo", "interruptor", "con el interruptor apagado ni se mide la presión: el motivo es el interruptor");
  // Las fuentes de verdad, en PGlite: no hay slots de Realtime, no hay cola de pg_net
  // y pg_stat_activity no muestra backends de cliente. Las tres dan «no medible».
  const real = await nueva();
  const reales = [...MIG_B.matchAll(/create or replace function public\.api_fuente_\w+\(\)[\s\S]*?\n\$\$;/g)].map((m) => m[0]);
  check(reales.length === 3, "(el banco encuentra las 3 fuentes de verdad en la migración)");
  for (const f of reales) await real.exec(f);
  const p = await q(real, `select senal, valor, medible from public.api_presion_medida() order by 1`);
  check(p.length === 3 && p.every((x) => x.medible === false), `con las fuentes de verdad en PGlite las tres dan «no medible» (${p.map((x) => `${x.senal}:${x.medible}`).join(", ")})`);
  rechazo(await enviar(real, BLU, G, "x"), "MV503", "motivo", "presion", "…y entonces el freno corta: falla cerrado");
  const ex = await uno(real, `select has_function_privilege('authenticated', 'public.api_presion_medida()', 'execute') a, has_function_privilege('authenticated', 'public.api_fuente_backends()', 'execute') b`);
  check(ex?.a === false && ex?.b === false, "las fuentes y la medida no las ejecuta una sesión: solo api_escritura_habilitada (DEFINER, de postgres)");
}

// ════ 19. La vuelta atrás ════════════════════════════════════════════════════
// Lo que la vuelta atrás deja distinto de prod (el fixture + la A) es EXACTAMENTE esto.
const QUEDAN_TRAS_LA_VUELTA_GRUPOS: Record<string, number> = {
  "SOBRA columna": 38, "SOBRA constraint": 16, "SOBRA índice": 7, "SOBRA relación": 2, "SOBRA función": 34, "SOBRA política": 29,
};
const QUEDAN_TRAS_LA_VUELTA = [
  "SOBRA columna api_escritura_cupos.*", "SOBRA columna api_escritura_idem.*",
  "SOBRA columna api_keys.api_display_name", "SOBRA columna api_keys.integracion_id", "SOBRA columna app_flags.valor",
  "SOBRA columna chat_conversations.creada_por_api_key", "SOBRA columna chat_message_deletions.api_display_name",
  "SOBRA columna chat_message_deletions.api_key_id", "SOBRA columna chat_messages.api_display_name", "SOBRA columna chat_messages.api_key_id",
  "SOBRA constraint api_escritura_cupos.*", "SOBRA constraint api_escritura_idem.api_escritura_idem_pkey",
  "SOBRA constraint api_keys.api_keys_escritura_con_lectura", "SOBRA constraint api_keys.api_keys_escritura_con_nombre",
  "SOBRA constraint chat_messages.chat_messages_api_coherente",
  "SOBRA índice api_escritura_cupos_pkey", "SOBRA índice api_escritura_idem_pkey", "SOBRA índice api_escritura_idem_por_fecha",
  "SOBRA índice api_keys_integracion_idx", "SOBRA índice chat_conversations_por_api_key", "SOBRA índice chat_messages_api_por_conv",
  "SOBRA índice chat_messages_api_por_llave",
  "SOBRA relación api_escritura_cupos", "SOBRA relación api_escritura_idem",
  "SOBRA función public.*", "SOBRA política *.api_fabricada_*",
];
const FOTO_SQL = `
select 'función ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' k,
       md5(p.prosrc) || ' secdef=' || p.prosecdef::text || ' cfg=' || coalesce(p.proconfig::text, '-') || ' acl=' || coalesce(p.proacl::text, '-') v
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
const coincide = (x: string, patron: string) => new RegExp("^" + patron.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$").test(x);
{
  check(/^begin;/.test(VUELTA.trim()) && /commit;$/.test(VUELTA.trim()), `la vuelta atrás está en la migración, entera y en una transacción (${VUELTA.split("\n").length} líneas)`);
  const db = await nueva();
  try { await db.exec(VUELTA); ok("la vuelta atrás corre sobre la base con la migración"); }
  catch (e) { await db.exec("rollback").catch(() => {}); check(false, `la vuelta atrás falló: ${msg(e).slice(0, 160)}`); }
  const PRODSRC = `select p.proname k, md5(p.prosrc) h from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`;
  const hs = new Map((await q(db, PRODSRC)).map((f) => [f.k, f.h]));
  const prodTrasA = new Map([...COMPLEMENTO.matchAll(/^--\s+prod\.public\.(\w+)=([0-9a-f]{32})$/gm)].map((m) => [m[1], m[2]]));
  const delComp = new Map([...COMPLEMENTO.matchAll(/^--\s+public\.(\w+)=([0-9a-f]{32})$/gm)].map((m) => [m[1], m[2]]));
  const vuelven = ["notify_chat_message", "delete_chat_message", "delete_conversation_cascade", "profiles_nombre_lo_cambia_un_admin"].filter((f) => hs.get(f) !== prodTrasA.get(f));
  check(vuelven.length === 0 && hs.get("get_karma_profile") === delComp.get("get_karma_profile"),
    `notify_chat_message, delete_chat_message, delete_conversation_cascade, profiles_nombre_lo_cambia_un_admin y get_karma_profile vuelven byte a byte a las de prod${vuelven.length ? ` — distintas: ${vuelven.join(", ")}` : ""}`);
  const trig = await q(db, `select tgname from pg_trigger where tgname in ('chat_messages_api', 'chat_messages_api_editar', 'chat_conversations_api', 'chat_participants_api', 'api_keys_nombre_visible', 'api_keys_cupos_de_escritura')`);
  check(trig.length === 0, `se fueron los 6 triggers de la B (${trig.map((t) => t.tgname).join(", ")})`);
  rechazo(await enviar(db, BLU, G, "después de la vuelta atrás"), "42501", null, null, "las RPC de escritura ya no las ejecuta authenticated");
  check((await uno(db, `select enabled from app_flags where key = 'api_messenger_escritura'`))?.enabled === false, "y el interruptor queda apagado");
  // La app sigue andando.
  anda(await intentar(db, app(ANA), `insert into chat_messages(conversation_id, sender_id, content) values ('${G}', '${ANA}', 'tras la vuelta atrás')`), "vuelta atrás: la app manda");
  const t = await uno(db, `select title from notifications where message = 'tras la vuelta atrás' limit 1`);
  check(t?.title === "Ana Ruiz en Grupo", `vuelta atrás: la notificación sale como en prod (${t?.title})`);
  anda(await intentar(db, app(ANA), `select public.delete_chat_message((select id from chat_messages where content = 'tras la vuelta atrás'))`), "vuelta atrás: la app borra");
  const D = "c9400000-0000-4000-8000-000000000001";
  anda(await intentar(db, app(BETO), `insert into chat_conversations(id, type, created_by) values ('${D}', 'direct', '${BETO}');
    insert into chat_participants(conversation_id, user_id, role) values ('${D}', '${BETO}', 'admin');`), "vuelta atrás: la app abre un directo");
  anda(await intentar(db, app(BETO), `insert into chat_participants(conversation_id, user_id, role) values ('${D}', '${CARLA}', 'member')`), "…y suma al otro");
  anda(await intentar(db, PG, `insert into public.api_keys(name, key_prefix, key_hash, created_by, tenant_id, scopes) values ('nueva', 'p', 'hnueva', '${JHON}', '${T1}', '{creators:read}')`), "vuelta atrás: manage-api-keys sigue creando keys");
  // La sesión fabricada sigue cercada (las políticas quedan).
  const fab = await intentar(db, fabricada(ANA), `insert into chat_reactions(message_id, user_id, emoji) values ('${M_G_HILO}', '${ANA}', '🤖')`);
  check(!fab.ok, "el cerco queda: una sesión fabricada sigue sin escribir en chat_reactions");
  try { await db.exec(VUELTA); ok("la vuelta atrás se puede correr dos veces"); }
  catch (e) { await db.exec("rollback").catch(() => {}); check(false, `la vuelta atrás no se puede correr dos veces: ${msg(e).slice(0, 120)}`); }
  // Lo que queda distinto de prod (fixture + A), objeto por objeto.
  const hoy = await prodHoy();
  const conVuelta = await prodHoy();
  await aplicar(conVuelta, NOMBRE_B, MIG_B);
  await conVuelta.exec(VUELTA);
  const quedan = diferencias(await foto(hoy), await foto(conVuelta));
  const sinAnotar = quedan.filter((x) => !QUEDAN_TRAS_LA_VUELTA.some((p) => coincide(x, p)));
  const grupos = Object.fromEntries(Object.keys(QUEDAN_TRAS_LA_VUELTA_GRUPOS).map((g) => [g, quedan.filter((x) => x.startsWith(g + " ")).length]));
  const gruposMal = Object.entries(QUEDAN_TRAS_LA_VUELTA_GRUPOS).filter(([g, n]) => grupos[g] !== n);
  check(quedan.length === Object.values(QUEDAN_TRAS_LA_VUELTA_GRUPOS).reduce((a, b) => a + b, 0), `(los ${quedan.length} objetos que quedan caen todos en los grupos anotados)`);
  check(sinAnotar.length === 0 && gruposMal.length === 0 && !quedan.some((x) => /^(CAMBIA|FALTA) /.test(x)),
    `después de la vuelta atrás, lo que queda distinto de prod es solo lo anotado e inerte: nada CAMBIA ni FALTA (${quedan.length}: ${JSON.stringify(grupos)}${sinAnotar.length ? `; sin anotar: ${sinAnotar.join(" · ")}` : ""}${gruposMal.length ? `; cuentas distintas: ${JSON.stringify(gruposMal)}` : ""})`);
  try { await conVuelta.exec("begin;\n" + MIG_B + "\ncommit;"); check(false, "la migración se volvió a aplicar después de la vuelta atrás (la cabecera dice que no)"); }
  catch (e) { await conVuelta.exec("rollback").catch(() => {}); check(/already exists/.test(msg(e)), `después de la vuelta atrás, la misma migración no vuelve a correr → ${msg(e).slice(0, 90)}`); }
}
function ok(m: string) { TOTAL.ok.push(m); }

// ════ 20. Mutantes ═══════════════════════════════════════════════════════════
// Cada uno rompe una pieza de la B; alguna prueba de arriba tiene que notarlo. Aquí
// se corre una prueba chica por mutante (la misma idea que la de su sección).
type Mutante = { nombre: string; de: string | RegExp; a: string; nota: (db: PGlite) => Promise<boolean> };
const falla_ = async (x: Promise<Res>, codigo: string, campo?: string, valor?: string) => { const r = await x; return !r.ok && r.codigo === codigo && (!campo || r.det[campo] === valor); };
const MUTANTES: Mutante[] = [
  { nombre: "sin el rechazo de service_role en chat_messages_api",
    de: "  if _c ->> 'role' = 'service_role' then\n    raise exception using errcode = 'MV403',\n      message = 'api_service_role_no_escribe_chat: con service_role no se insertan mensajes',", a: "  if false then\n    raise exception using errcode = 'MV403',\n      message = 'x',",
    nota: (db) => falla_(intentar(db, SR, `insert into chat_messages(conversation_id, sender_id, content) values ('${G}', '${ALVARO}', 'sr')`), "MV403") },
  { nombre: "la sesión fabricada sin key inserta mensajes",
    de: "    -- La app (y postgres sin claims). Las marcas no las pone el pedido.\n    if _c ?| array['mvf', 'mvk'] then", a: "    -- La app (y postgres sin claims). Las marcas no las pone el pedido.\n    if false then",
    nota: async (db) => { await intentar(db, fabricada(ANA), `insert into chat_messages(conversation_id, sender_id, content) values ('${G}', '${ANA}', 'fab')`); return (await uno(db, `select count(*)::int n from chat_messages where content = 'fab'`))?.n === 0; } },
  { nombre: "las marcas se pueden cambiar con UPDATE",
    de: "  new.api_key_id := old.api_key_id;\n  new.api_display_name := old.api_display_name;\n", a: "",
    nota: async (db) => { const m = mensajeDe(await enviar(db, BLU, G, "m")); await intentar(db, SR, `update chat_messages set api_display_name = 'Otro' where id = '${m.id}'`); return (await uno(db, `select api_display_name n from chat_messages where id = $1`, [m.id]))?.n === "BLU"; } },
  { nombre: "el tope por conversación es 7 por minuto", de: "  if _hay >= 6 then", a: "  if _hay >= 7 then",
    nota: async (db) => { for (let i = 0; i < 6; i++) await enviar(db, BLU, G, `t${i}`); return falla_(enviar(db, BLU, G, "7"), "MV429", "limite", "conversation_minute"); } },
  { nombre: "cada mensaje pesa 1", de: "  _peso := (_n - 1) + 3;", a: "  _peso := 1;",
    nota: async (db) => { await enviar(db, BLU, G, "p"); return (await cupo(db, `llave:${K_BLU}`))?.min_dest === 7; } },
  { nombre: "el título sin «(API)»", de: "    sender_name := new.api_display_name || ' (API)';", a: "    sender_name := new.api_display_name;",
    nota: async (db) => { const m = mensajeDe(await enviar(db, BLU, DM_AJ, "t")); return (await uno(db, `select title from notifications where deep_link_url like '%' || $1`, [m.id]))?.title === "BLU (API)"; } },
  { nombre: "el karma cuenta los mensajes por API", de: "    and api_key_id is null\n    and created_at >= now() - interval '30 days';", a: "    and created_at >= now() - interval '30 days';",
    nota: async (db) => { await sembrarSinTriggers(db, `insert into chat_messages(conversation_id, sender_id, content, api_key_id, api_display_name) values ('${G}', '${ALVARO}', 'k', '${K_BLU}', 'BLU')`); const k = (await como(db, app(JHON), `select public.get_karma_profile('${ALVARO}') r`))[0]?.r; return k?.admin?.msgs_sent_30d === 1; } },
  { nombre: "notifications sin cerco", de: "  foreach _t in array array['notifications', 'chat_reactions',", a: "  foreach _t in array array['chat_reactions',",
    nota: async (db) => { await intentar(db, fabricada(ANA), `insert into notifications(user_id, type, title) values ('${JHON}', 'chat_message', 'falsa')`); return (await uno(db, `select count(*)::int n from notifications where title = 'falsa'`))?.n === 0; } },
  { nombre: "la idempotencia no mira la huella", de: "  select i.huella_sha = _huella, i.conversation_id", a: "  select true, i.conversation_id",
    nota: async (db) => { await enviar(db, BLU, G, "a", { idem: "mutante-0001" }); return falla_(enviar(db, BLU, G, "b", { idem: "mutante-0001" }), "MV409"); } },
  { nombre: "api_mi_llave valida la escritura antes de mirar si la key escribe", de: " or not exists (select 1 from public.api_keys k where k.id = _id and 'messenger:write' = any (k.scopes))", a: "",
    nota: async (db) => { const r = await rpc(db, api(ALVARO, K_LEE), "api_mi_llave", {}); return r.ok && r.r === null; } },
  { nombre: "el freno deja pasar lo que no se puede medir", de: "   where not p.medible or p.valor is null or p.valor > p.umbral;", a: "   where p.valor > p.umbral;",
    nota: async (db) => { await presion(db, "slot", 0, false); return falla_(enviar(db, BLU, G, "x"), "MV503", "motivo", "presion"); } },
  { nombre: "sin la raíz reservada «ceo»", de: "|staff|moderad|ceo|gerenc|", a: "|staff|moderad|gerenc|",
    nota: (db) => falla_(intentar(db, PG, `insert into public.api_keys(name, key_prefix, key_hash, created_by, acts_as_user_id, tenant_id, scopes, ip_whitelist, expires_at, api_display_name) values ('k', 'p', 'hceo', '${BETO}', '${BETO}', '${T1}', '{messenger:read,messenger:write}', '{1.2.3.4}', now() + interval '30 days', 'Ventas_CEO')`), "MV422", "error", "display_name_reserved") },
  { nombre: "la retirada deja las notificaciones",
    de: "    delete from public.notifications n\n     using unnest(_enlaces) l(enlace)\n     where n.deep_link_url = l.enlace and n.reference_type = 'conversation';\n", a: "    perform 1;\n",
    nota: async (db) => { const m = mensajeDe(await enviar(db, BLU, G, "r")); await rpc(db, app(JHON), "api_retirar_mensajes_de_integracion", { _llave: K_BLU, _desde: null, _limite: 200 }); return (await uno(db, `select count(*)::int n from notifications where deep_link_url like '%' || $1`, [m.id]))?.n === 0; } },
  { nombre: "la retirada, como antes: solo las notificaciones de quienes siguen en la conversación",
    de: "     where n.deep_link_url = l.enlace and n.reference_type = 'conversation';", a: "     where n.deep_link_url = l.enlace and n.reference_type = 'conversation'\n       and n.user_id in (select p.user_id from public.chat_participants p where p.conversation_id = n.reference_id);",
    nota: async (db) => { const m = mensajeDe(await enviar(db, BLU, G, "r")); await intentar(db, app(BETO), `delete from chat_participants where conversation_id = '${G}' and user_id = '${BETO}'`); await rpc(db, app(JHON), "api_retirar_mensajes_de_integracion", { _llave: K_BLU, _desde: null, _limite: 200 }); return (await uno(db, `select count(*)::int n from notifications where deep_link_url like '%' || $1`, [m.id]))?.n === 0; } },
  { nombre: "el cerco solo mira mvf (un token con mvk y sin mvf pasa)",
    de: "  _pred text := $p$(select auth.jwt() ?| array['mvf', 'mvk']) is not true$p$;", a: "  _pred text := $p$(select auth.jwt() ->> 'mvf') is null$p$;",
    nota: async (db) => { await intentar(db, soloMvk(ANA), `insert into notifications(user_id, type, title) values ('${JHON}', 'chat_message', 'falsa')`); return (await uno(db, `select count(*)::int n from notifications where title = 'falsa'`))?.n === 0; } },
  { nombre: "delete_conversation_cascade solo mira mvf", de: "  IF (auth.jwt() ?| array['mvf', 'mvk']) IS TRUE THEN", a: "  IF (auth.jwt() ->> 'mvf') IS NOT NULL THEN",
    nota: async (db) => { await intentar(db, soloMvk(ALVARO), `select public.delete_conversation_cascade('${G50}')`); return (await uno(db, `select count(*)::int n from chat_conversations where id = '${G50}'`))?.n === 1; } },
  { nombre: "la retirada solo mira mvf", de: "  if (auth.jwt() ?| array['mvf', 'mvk']) is true then", a: "  if (auth.jwt() ->> 'mvf') is not null then",
    nota: (db) => falla_(rpc(db, soloMvk(ALVARO), "api_retirar_mensajes_de_integracion", { _llave: K_BLU, _desde: null, _limite: 200 }), "MV403") },
  { nombre: "el trigger de mensajes trata mvk: null como la app", de: "    -- La app (y postgres sin claims). Las marcas no las pone el pedido.\n    if _c ?| array['mvf', 'mvk'] then", a: "    -- La app (y postgres sin claims). Las marcas no las pone el pedido.\n    if _c ? 'mvf' then",
    nota: (db) => falla_(intentar(db, mvkNull(ALVARO), `insert into chat_messages(conversation_id, sender_id, content) values ('${G}', '${ALVARO}', 'x')`), "MV403") },
  { nombre: "el texto deja pasar U+200B", de: " || chr(8203) || chr(8204)", a: " || chr(8204)",
    nota: (db) => falla_(enviar(db, BLU, G, `ho${String.fromCodePoint(0x200B)}la`), "MV422", "error", "invalid_text") },
  { nombre: "el texto no pide un carácter visible", de: "     and _t ~ ('[^[:space:]'", a: "     and _t !~ ('^$[^[:space:]'",
    nota: (db) => falla_(enviar(db, BLU, G, String.fromCodePoint(0x200D)), "MV422", "error", "invalid_text") },
  { nombre: "api_nombre_de_integracion abierta a authenticated", de: "  grant execute on function public.api_nombre_de_integracion(uuid, text) to service_role;", a: "  grant execute on function public.api_nombre_de_integracion(uuid, text) to service_role, authenticated;",
    nota: (db) => falla_(intentar(db, app(ANA), `select public.api_nombre_de_integracion('${ANA}', 'BLU') r`), "42501") },
  { nombre: "la app edita un mensaje de su integración", de: "    if old.api_key_id is not null and auth.uid() is not null and not _borrado", a: "    if false and old.api_key_id is not null",
    nota: async (db) => { const m = mensajeDe(await enviar(db, BLU, G, "e")); return falla_(intentar(db, app(ALVARO), `update chat_messages set content = 'x', is_edited = true where id = '${m.id}'`), "MV403"); } },
  { nombre: "el directorio no pide messenger:write",
    de: "  _k jsonb := public.api_llave_del_pedido(true);\n  _agencia uuid := (_k ->> 'tenant_id')::uuid;", a: "  _k jsonb := public.api_llave_del_pedido(false);\n  _agencia uuid := (_k ->> 'tenant_id')::uuid;",
    nota: (db) => falla_(intentar(db, api(ALVARO, K_LEE), `select * from public.messenger_directorio()`), "MV403") },
  { nombre: "por INSERT directo se suma a cualquiera a un directo",
    de: "  if new.user_id is distinct from auth.uid() and not public.api_persona_alcanzable(new.user_id, _k.tenant_id) then", a: "  if false then",
    nota: (db) => falla_(intentar(db, BLU, `insert into chat_conversations(id, type, created_by) values ('c9500000-0000-4000-8000-000000000001', 'direct', '${ALVARO}');
      insert into chat_participants(conversation_id, user_id, role) values ('c9500000-0000-4000-8000-000000000001', '${ALVARO}', 'admin');
      insert into chat_participants(conversation_id, user_id, role) values ('c9500000-0000-4000-8000-000000000001', '${NUEVA}', 'member')`), "MV404") },
  { nombre: "el tope de la hora deja pasar uno de más", de: "(case when c.hora_inicio >= _hora then c.hora_msj  else 0 end) + _msj   <= c.lim_msj_hora)", a: "(case when c.hora_inicio >= _hora then c.hora_msj  else 0 end) + _msj   <= c.lim_msj_hora + 1)",
    nota: async (db) => { await db.exec(`update api_escritura_cupos set hora_msj = 1000, hora_inicio = date_trunc('hour', now()) where clave = 'llave:${K_BLU}'`); return falla_(enviar(db, BLU, G, "x"), "MV429", "limite", "key_messages_hour"); } },
  { nombre: "delete_conversation_cascade sin la guarda de la sesión fabricada", de: "  IF (auth.jwt() ?| array['mvf', 'mvk']) IS TRUE THEN", a: "  IF false THEN",
    nota: async (db) => { await intentar(db, fabricada(ALVARO), `select public.delete_conversation_cascade('${G50}')`); return (await uno(db, `select count(*)::int n from chat_conversations where id = '${G50}'`))?.n === 1; } },
];
{
  let muertos = 0;
  for (const mu of MUTANTES) {
    const mig = typeof mu.de === "string" ? MIG_B.replace(mu.de, mu.a) : MIG_B.replace(mu.de, mu.a);
    if (mig === MIG_B) { check(false, `mutante «${mu.nombre}»: no se pudo aplicar (cambió la migración)`); continue; }
    let nota = false;
    try {
      const db = await nueva(mig);
      nota = !(await mu.nota(db));
    } catch (e) { nota = true; console.error(`mutante «${mu.nombre}»: la base no cargó (${msg(e).slice(0, 100)})`); }
    // La misma prueba con la migración de verdad tiene que pasar (si no, no prueba nada).
    const real = await mu.nota(await nueva());
    if (nota && real) muertos++;
    else check(false, `mutante «${mu.nombre}»: ${nota ? "" : "el banco NO lo nota"}${real ? "" : " · la prueba falla también con la migración de verdad"}`);
  }
  check(muertos === MUTANTES.length, `mutantes: el banco nota los ${muertos} de ${MUTANTES.length} (y cada prueba pasa con la migración de verdad)`);
  // El bloque de candados, también: sin pedir notifications al principio, el chequeo de pg_locks lo nota.
  const sinNotif = MIG_B.replace("      lock table public.notifications in access exclusive mode;            -- cerco\n", "");
  const d = await prodHoy();
  const existentes = (await q(d, `select c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`)).map((f) => f.t as string);
  await d.exec("begin;\n" + sinNotif);
  const tenidos = await q(d, CANDADOS_TENIDOS, [existentes]);
  await d.exec("rollback");
  check(sinNotif !== MIG_B && candadosDeMas(tenidos, pedidosDe(sinNotif)).includes("notifications:AccessExclusiveLock"),
    "mutante del bloque de candados: si notifications no se pide al principio, el chequeo de pg_locks lo marca");
}

console.log(TOTAL.ok.map((m) => "✓ " + m).join("\n"));
if (TOTAL.mal.length) { console.log(TOTAL.mal.map((m) => "✗ " + m).join("\n")); console.log(`\n${TOTAL.ok.length} ok, ${TOTAL.mal.length} MAL`); Deno.exit(1); }
console.log(`\n${TOTAL.ok.length} ok`);
