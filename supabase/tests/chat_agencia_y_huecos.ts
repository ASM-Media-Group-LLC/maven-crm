// La agencia en cada conversación y los huecos de la base del Messenger
// (migración 20260929210000_chat_agencia_y_huecos.sql), probados contra un
// Postgres de verdad (PGlite) cargado con el esquema de PROD del 28/09 (vuelto a
// comparar con prod el 29/09: las huellas no cambiaron).
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
//   1. Cada hueco (A–H) se prueba DOS veces con el mismo pedido: sobre prod tal
//      cual (tiene que FUNCIONAR: es la línea base, y si no funciona el test no
//      prueba nada) y con las migraciones (tiene que fallar, o no tener efecto).
//   2. Los flujos de la app, tal como los manda supabase-js (un pedido = una
//      transacción, con el rol y los claims que pone PostgREST), siguen andando.
//
// PGlite tiene UNA conexión: las carreras (dos directos a la vez, dos grupos a la
// vez) se razonan con los candados del trigger, no se prueban aquí. Sale con código
// 1 si algo falla. Corre en el guard de cada PR (guard-edge-functions.yml).
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FIXTURE = leer("./fixtures/prod_chat_api_20260928.sql");
const MIG_A = leer("../migrations/20260929210000_chat_agencia_y_huecos.sql");

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;

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
-- Los borrados de antes (prod 29/09: 44 con el rico puesto, 8 con archivo y sin fila en el
-- archivo). La migración A no los toca: se limpian aparte, si Jhon decide (ver el PR).
insert into public.chat_messages(id, conversation_id, sender_id, content, content_rich, file_url, file_name, type, is_deleted) values
  ('${M_LEG_RICO}', '${G1}', '${BETO}', null, '{"type":"doc","content":[]}', null, null, 'text', true),
  ('${M_LEG_ARCH}', '${G1}', '${BETO}', null, null, 'https://archivos.ejemplo.test/a.pdf', 'a.pdf', 'file', true);
insert into public.chat_message_deletions(message_id, conversation_id, sender_id, deleted_by, content, type)
  values ('${M_LEG_RICO}', '${G1}', '${BETO}', '${BETO}', 'lo que decía', 'text');
update public.chat_conversations set updated_at = '${ACTUALIZADA}';
`;

type Modo = "prod" | "A";
async function nueva(modo: Modo, extra = ""): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(SEMILLA + extra);
  if (modo === "A") await db.exec("begin;\n" + MIG_A + "\ncommit;");
  return db;
}
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as Fila[];
const uno = async (db: PGlite, sql: string) => (await q(db, sql))[0];
const msg = (e: unknown) => String((e as Error)?.message ?? e);

// Un pedido como lo manda PostgREST: una transacción, el rol y los claims del JWT.
type Quien = string | "service_role" | "anon";
async function entrar(db: PGlite, quien: Quien) {
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
// El pedido y, en la MISMA transacción, la pregunta de si tuvo efecto (como
// superusuario, sin RLS); después se deshace todo. `si` = el ataque funcionó.
async function probar(db: PGlite, quien: Quien, sql: string, efecto: string): Promise<{ ok: boolean; si?: boolean; error?: string }> {
  await db.exec("begin");
  try {
    await entrar(db, quien);
    await db.exec(sql);
    await db.exec("reset role");
    const r = await q(db, efecto);
    await db.exec("rollback");
    return { ok: true, si: r[0]?.si === true };
  } catch (e) {
    await db.exec("rollback");
    return { ok: false, error: msg(e) };
  }
}
// Un hueco: sobre prod tiene que funcionar; con las migraciones, fallar con
// `cierre` o, si es "sin_efecto", pasar sin cambiar nada (la RLS lo filtra).
async function hueco(prod: PGlite, conA: PGlite, nombre: string, quien: Quien, sql: string, efecto: string, cierre: RegExp | "sin_efecto") {
  const antes = await probar(prod, quien, sql, efecto);
  check(antes.ok && antes.si === true,
    `${nombre}: ABIERTO en prod (línea base)${antes.ok ? (antes.si ? "" : " — corrió pero sin efecto: el test no prueba nada") : ` — falló: ${antes.error?.slice(0, 90)}`}`);
  const despues = await probar(conA, quien, sql, efecto);
  if (cierre === "sin_efecto") {
    check(despues.ok ? despues.si === false : false,
      `${nombre}: cerrado con la migración${despues.ok ? " (no tiene efecto)" : ` — falló con error inesperado: ${despues.error?.slice(0, 90)}`}`);
  } else {
    check(!despues.ok && cierre.test(despues.error ?? ""),
      `${nombre}: cerrado con la migración → ${despues.ok ? "PASÓ" + (despues.si ? " y tuvo efecto" : " sin error") : despues.error?.slice(0, 100)}`);
  }
}

// ════ 0. El fixture es prod ══════════════════════════════════════════════════
// Las mismas consultas se corrieron en prod (solo lectura) el 28/09 y su
// resultado está en la cabecera del fixture como «catalogo.<tema>=<md5>».
const TABLAS = `('app_flags','chat_archived','chat_conversations','chat_join_requests','chat_message_deletions','chat_messages','chat_participants','chat_pinned','chat_reactions','chat_read_receipts','chat_space_conversations','chat_spaces','notification_preferences','notification_settings','notifications','profiles','push_subscriptions','tenant_members','tenants','user_roles')`;
const FUNCIONES = `('current_tenant_id','delete_chat_message','delete_conversation_cascade','get_last_messages','get_mentioned_conversations','get_unread_counts','guard_chat_conversation_meta','guard_chat_conversation_perms','guard_chat_message_update','guard_chat_participant_update','handle_new_user','is_chat_admin','is_chat_participant','is_conversation_creator','is_in_role_group','menciona_a','messenger_unread_counts','notif_canal_activo','notify_chat_message','push_chat_message','push_desde_notificacion','update_updated_at_column','user_has_role_name','validate_notification_fields')`;
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
{
  const db = new PGlite();
  await db.exec(FIXTURE);
  const cab = FIXTURE.split("\n").filter((l) => l.startsWith("--"));
  const funciones = new Map<string, string>();
  const politicas = new Map<string, string>();
  const estructura = new Map<string, string[]>();
  const catalogo = new Map<string, string>();
  for (const l of cab) {
    let m = l.match(/^--\s+((?:auth|public)\.\w+)=([0-9a-f]{32})$/);
    if (m) { funciones.set(m[1], m[2]); continue; }
    m = l.match(/^--\s+catalogo\.(\w+)=([0-9a-f]{32})\s/);
    if (m) { catalogo.set(m[1], m[2]); continue; }
    m = l.match(/^--\s+(\w+) ([0-9a-f]{32}) ([0-9a-f]{32}) ([0-9a-f]{32})$/);
    if (m) { estructura.set(m[1], [m[2], m[3], m[4]]); continue; }
    for (const p of l.matchAll(/(\w+)=([0-9a-f]{32})/g)) if (!l.includes(".")) politicas.set(p[1], p[2]);
  }
  check(funciones.size === 27 && politicas.size === 19 && estructura.size === 20,
    `huellas de prod en la cabecera del fixture: ${funciones.size} funciones, ${politicas.size} tablas con políticas, ${estructura.size} tablas`);
  const fs = await q(db, `select n.nspname||'.'||p.proname k, md5(p.prosrc) h from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth')`);
  const distintas = [...funciones].filter(([k, h]) => fs.find((f) => f.k === k)?.h !== h).map(([k]) => k);
  check(distintas.length === 0, `las ${funciones.size} funciones son las de prod byte a byte${distintas.length ? ` — distintas: ${distintas.join(", ")}` : ""}`);
  const ps = await q(db, `select tablename k, md5(string_agg(policyname||'|'||permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''), E'\n' order by policyname)) h from pg_policies where schemaname='public' group by 1`);
  const polDistintas = [...politicas].filter(([k, h]) => ps.find((f) => f.k === k)?.h !== h).map(([k]) => k);
  check(polDistintas.length === 0, `las políticas de ${politicas.size} tablas son las de prod${polDistintas.length ? ` — distintas: ${polDistintas.join(", ")}` : ""}`);
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
  const fs2 = await q(db, `select n.nspname||'.'||p.proname k, md5(p.prosrc) h from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','auth')`);
  const cambiadas = [...funciones].filter(([k, h]) => fs2.find((f) => f.k === k)?.h !== h).map(([k]) => k).sort();
  check(JSON.stringify(cambiadas) === JSON.stringify(["public.delete_chat_message", "public.get_unread_counts", "public.guard_chat_message_update"]),
    `de las funciones de prod solo cambian delete_chat_message, get_unread_counts y guard_chat_message_update (${cambiadas.join(", ")})`);

  // Forma de las migraciones.
  const primera = (s: string) => s.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("--"));
  check(primera(MIG_A) === "set lock_timeout = '3s';", "la migración arranca con set lock_timeout = '3s'");
  const sinComentarios = MIG_A.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  const borradas = sinComentarios.match(/drop\s+policy[^;]*;/gi) ?? [];
  check(!/create\s+policy|alter\s+policy/i.test(sinComentarios) && borradas.length === 1 && /"Users can delete their own messages"/.test(borradas[0]),
    `A no crea ni cambia políticas y solo borra una, la del DELETE duro de mensajes (${borradas.length})`);
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
  const porApi = await probar(prod, JHON, moverA, jhonEnG2);
  check(!porApi.ok && /row-level security/.test(porApi.error ?? ""),
    `A · por PostgREST en prod ya lo frena la RLS (la fila nueva tiene que verse por la política SELECT) → ${porApi.ok ? "PASÓ" : porApi.error?.slice(0, 90)}`);
  const porApiConA = await probar(conA, JHON, moverA, jhonEnG2);
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
  // D por la puerta de atrás: saca a Ana (la política DELETE deja al admin) y suma a
  // Beto, que queda leyendo lo que Ana le escribió a Jhon.
  await hueco(prod, conA, "D · Jhon saca a Ana de DM1 y suma a Beto, que lee lo que Ana escribió", JHON,
    `delete from chat_participants where conversation_id = '${DM1}' and user_id = '${ANA}';
     insert into chat_participants(conversation_id, user_id, role) values ('${DM1}', '${BETO}', 'member')`,
    `select exists (select 1 from chat_participants where conversation_id = '${DM1}' and user_id = '${BETO}') si`,
    /directo_con_historia_ajena/);
  {
    // Volver a sumar a la MISMA persona sí se puede: los mensajes son suyos.
    const r = await probar(conA, JHON,
      `delete from chat_participants where conversation_id = '${DM1}' and user_id = '${ANA}';
       insert into chat_participants(conversation_id, user_id, role) values ('${DM1}', '${ANA}', 'member')`,
      `select exists (select 1 from chat_participants where conversation_id = '${DM1}' and user_id = '${ANA}') si`);
    check(r.ok && r.si === true, `D · sacar a Ana y volver a sumarla a ella sí pasa${r.ok ? "" : ` — falló: ${r.error?.slice(0, 90)}`}`);
  }
  // E. UPDATE de lo que no se edita.
  await hueco(prod, conA, "E · atrasar la fecha de un mensaje propio", ANA,
    `update chat_messages set created_at = '2020-01-01' where id = '${M_G1}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1}' and created_at < '2021-01-01') si`,
    /chat_mensaje_inmutable/);
  await hueco(prod, conA, "E · resucitar un mensaje borrado", ANA,
    `update chat_messages set is_deleted = false, content = 'volví' where id = '${M_BORRADO}'`,
    `select exists (select 1 from chat_messages where id = '${M_BORRADO}' and not is_deleted) si`,
    /chat_mensaje_borrado/);
  await hueco(prod, conA, "E · escribirle texto a un mensaje borrado sin resucitarlo", ANA,
    `update chat_messages set content = 'ahora digo otra cosa' where id = '${M_BORRADO}'`,
    `select exists (select 1 from chat_messages where id = '${M_BORRADO}' and content is not null) si`,
    /chat_mensaje_borrado/);
  await hueco(prod, conA, "E · pasar un mensaje propio a 'system' (sin autor en la burbuja)", ANA,
    `update chat_messages set type = 'system' where id = '${M_G1}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1}' and type = 'system') si`,
    /chat_mensaje_inmutable/);
  await hueco(prod, conA, "E · colgarle a un mensaje una imagen externa (píxel espía)", ANA,
    `update chat_messages set file_url = 'https://rastreo.ejemplo.test/p.png' where id = '${M_G1}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1}' and file_url is not null) si`,
    /chat_mensaje_inmutable/);
  await hueco(prod, conA, "E · hacer que un mensaje cite uno de OTRA conversación", ANA,
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
  // F. Borrar sin dejar archivo.
  await hueco(prod, conA, "F · borrar con UPDATE is_deleted = true (sin archivo)", ANA,
    `update chat_messages set is_deleted = true, content = null where id = '${M_G1}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1}' and is_deleted)
        and not exists (select 1 from chat_message_deletions where message_id = '${M_G1}') si`,
    /chat_borrado_sin_archivo/);
  await hueco(prod, conA, "F · 'borrar' con is_deleted = true y dejar el texto legible", ANA,
    `update chat_messages set is_deleted = true where id = '${M_G1}'`,
    `select exists (select 1 from chat_messages where id = '${M_G1}' and is_deleted and content is not null) si`,
    /chat_borrado_sin_archivo/);
  await hueco(prod, conA, "F · DELETE duro de un mensaje propio", ANA,
    `delete from chat_messages where id = '${M_G1}'`,
    `select not exists (select 1 from chat_messages where id = '${M_G1}') si`,
    "sin_efecto");
  await hueco(prod, conA, "F · DELETE duro de un mensaje que ya estaba en el archivo (se lleva el archivo)", BETO,
    `delete from chat_messages where id = '${M_LEG_RICO}'`,
    `select not exists (select 1 from chat_message_deletions where message_id = '${M_LEG_RICO}') si`,
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

  // Mensajes: mandar, editar, borrar por la RPC.
  const antesNotif = (await uno(db, `select count(*)::int n from notifications`))?.n as number;
  const M_NUEVO = "e1000000-0000-4000-8000-000000000001";
  await anda(db, ANA, `insert into chat_messages(id, conversation_id, sender_id, content, content_rich) values ('${M_NUEVO}', '${NUEVO_G}', '${ANA}', 'hola @Jhon Lopez', '{"type":"doc"}')`, "mandar un mensaje a un grupo");
  const notif = await q(db, `select user_id::text u, type from notifications order by created_at desc limit 10`);
  check((await uno(db, `select count(*)::int n from notifications`))?.n === antesNotif + 3 && notif.some((n) => n.u === JHON && n.type === "chat_mention"),
    "las notificaciones salen igual que antes (3 destinatarios, la mención de Jhon como chat_mention)");
  await anda(db, ANA, `update chat_messages set content = 'hola a todos', is_edited = true, content_rich = null where id = '${M_NUEVO}'`, "editar un mensaje propio ({content, is_edited, content_rich: null}, como useChat)");
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
  await anda(db, BETO, `delete from chat_participants where conversation_id = '${G1}' and user_id = '${BETO}'`, "salir de un grupo");

  // Conversación: el bump de updated_at, renombrar, permisos, mensaje de sistema.
  await anda(db, ANA, `update chat_conversations set updated_at = now() where id = '${G1}'`, "el bump de updated_at después de mandar (useChat.ts)");
  await anda(db, JHON, `update chat_conversations set name = 'Equipo 2' where id = '${G1}'`, "el admin renombra el grupo (ChatHeader)");
  await anda(db, JHON, `update chat_conversations set avatar_url = 'https://ejemplo.test/a.png' where id = '${G1}'`, "el admin le cambia la foto");
  await anda(db, JHON, `update chat_conversations set msg_permission = 'admins', require_approval = true where id = '${G1}'`, "el admin cambia los permisos (GroupMembersPanel)");
  await anda(db, JHON, `insert into chat_messages(conversation_id, sender_id, type, content) values ('${G1}', '${JHON}', 'system', 'Jhon agregó a Carla al grupo')`, "mensaje de sistema (sigue igual: lo cierra el PR 1b)");

  // delete_conversation_cascade con citas adentro y una cita desde OTRA conversación.
  const G_CITAS = "c1000000-0000-4000-8000-000000000003";
  const C1 = "e1000000-0000-4000-8000-000000000011", C2 = "e1000000-0000-4000-8000-000000000012", C3 = "e1000000-0000-4000-8000-000000000013";
  await anda(db, JHON, `insert into chat_conversations(id, type, name, created_by) values ('${G_CITAS}', 'group', 'Con citas', '${JHON}')`, "cascada: grupo");
  await anda(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${G_CITAS}', '${JHON}', 'admin')`, "cascada: creador");
  await anda(db, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${G_CITAS}', '${ANA}', 'member')`, "cascada: miembro");
  await anda(db, ANA, `insert into chat_messages(id, conversation_id, sender_id, content) values ('${C1}', '${G_CITAS}', '${ANA}', 'uno')`, "cascada: mensaje");
  await anda(db, JHON, `insert into chat_messages(id, conversation_id, sender_id, content, reply_to_id) values ('${C2}', '${G_CITAS}', '${JHON}', 'cito', '${C1}')`, "cascada: cita adentro");
  await anda(db, ANA, `insert into chat_messages(id, conversation_id, sender_id, content, reply_to_id) values ('${C3}', '${DM1}', '${ANA}', 'cito de otro chat', '${C1}')`, "cascada: cita desde otra conversación");
  await anda(db, ANA, `select public.delete_chat_message('${C2}')`, "cascada: un mensaje borrado adentro (con archivo)");
  await anda(db, JHON, `select public.delete_conversation_cascade('${G_CITAS}')`, "delete_conversation_cascade de un grupo con citas y borrados");
  const cas = await uno(db, `select (select count(*)::int from chat_conversations where id = '${G_CITAS}') conv, (select reply_to_id from chat_messages where id = '${C3}') cita`);
  check(cas?.conv === 0 && cas?.cita === null, `la conversación se fue y la cita desde afuera quedó en NULL por el ON DELETE SET NULL (${JSON.stringify(cas)})`);
  await anda(db, ANA, `select public.delete_conversation_cascade('${DM1}')`, "delete_conversation_cascade de un directo (cualquiera de los dos)");

  // Perfiles.
  await anda(db, "service_role", `update profiles set full_name = 'Ana María Ruiz', ai_daily_quota_override = 10 where id = '${ANA}'`, "un admin cambia el full_name con service_role (admin-user-actions)");
  await anda(db, ANA, `update profiles set status = 'busy', avatar_seed = 'x', ui_prefs = '{"idioma":"en"}' where id = '${ANA}'`, "la persona sigue cambiando su estado, su avatar y sus preferencias");
  await anda(db, ANA, `update profiles set full_name = full_name, status = 'away' where id = '${ANA}'`, "un UPDATE que manda el mismo full_name pasa");
  await anda(db, "service_role", `select 1`, "(alta de usuario)");
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
  await falla(db, CARLA, `insert into chat_participants(conversation_id, user_id, role) values ('${DM_ROTO}', '${BETO}', 'member')`, /directo_duplicado/, "carrera: el tercer paso falla (Carla y Beto ya tenían directo)");
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
  const base = await probar(prod, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${G1}', '${OLGA}', 'member')`,
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
  // Sin sesión de usuario (service_role) la agencia sale de created_by, no de la primera que haya.
  const GS = "c2000000-0000-4000-8000-000000000003";
  await anda(db, "service_role", `insert into chat_conversations(id, type, name, created_by, tenant_id) values ('${GS}', 'group', 'Del sistema', '${OLGA}', '${T1}')`, "service_role crea un grupo a nombre de Olga (mandando la otra agencia)");
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
  const prod = await nueva("prod");
  const db = await nueva("A");
  const DUP = "c3000000-0000-4000-8000-000000000001";
  const dup = async (d: PGlite) => {
    await como(d, JHON, `insert into chat_conversations(id, type, created_by) values ('${DUP}', 'direct', '${JHON}')`);
    await como(d, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${DUP}', '${JHON}', 'admin')`);
    await como(d, JHON, `insert into chat_participants(conversation_id, user_id, role) values ('${DUP}', '${ANA}', 'member')`);
  };
  try { await dup(prod); ok.push("línea base: en prod Jhon abre un SEGUNDO directo con Ana"); }
  catch (e) { mal.push(`línea base: el directo duplicado falló en prod (${msg(e).slice(0, 90)}): el test no prueba nada`); }
  try { await dup(db); mal.push("un segundo directo Jhon–Ana entró (NO debía)"); }
  catch (e) { check(/directo_duplicado/.test(msg(e)), `un segundo directo Jhon–Ana → ${msg(e).slice(0, 80)}`); }
  const DUP2 = "c3000000-0000-4000-8000-000000000002";
  await anda(db, ANA, `insert into chat_conversations(id, type, created_by) values ('${DUP2}', 'direct', '${ANA}')`, "Ana abre un directo…");
  await anda(db, ANA, `insert into chat_participants(conversation_id, user_id, role) values ('${DUP2}', '${ANA}', 'admin')`, "…entra…");
  await falla(db, ANA, `insert into chat_participants(conversation_id, user_id, role) values ('${DUP2}', '${JHON}', 'member')`, /directo_duplicado/, "…y el duplicado al revés (Ana → Jhon) también se rechaza");
  await falla(db, "service_role", `insert into chat_participants(conversation_id, user_id, role) values ('${DM1}', '${BETO}', 'member')`, /directo_lleno/, "un tercero en un directo, ni con service_role");
  // Dos de una vez en un directo con una sola persona: la primera fila entra, la
  // segunda ve a la primera (misma sentencia) y queda afuera. Todo vuelve atrás.
  await falla(db, ANA, `insert into chat_participants(conversation_id, user_id, role) values ('${DUP2}', '${BETO}', 'member'), ('${DUP2}', '${CARLA}', 'member')`, /directo_lleno/, "dos de una vez en un directo: el segundo es un tercero");
  check((await uno(db, `select count(*)::int n from chat_participants where conversation_id = '${DUP2}'`))?.n === 1, "y no entró ninguno de los dos");
  const base3 = await probar(prod, ANA, `insert into chat_conversations(id, type, created_by) values ('${DUP2}', 'direct', '${ANA}');
    insert into chat_participants(conversation_id, user_id, role) values ('${DUP2}', '${ANA}', 'admin');
    insert into chat_participants(conversation_id, user_id, role) values ('${DUP2}', '${BETO}', 'member'), ('${DUP2}', '${CARLA}', 'member')`,
    `select (select count(*) from chat_participants where conversation_id = '${DUP2}') = 3 si`);
  check(base3.ok && base3.si === true, `línea base: en prod un directo de tres personas entra de una${base3.ok ? "" : ` — falló: ${base3.error?.slice(0, 90)}`}`);
  // Los duplicados viejos (anteriores al candado): gana el del mensaje más reciente;
  // sin mensajes, el más viejo.
  const d = async (yo: string, otro: string) => (await como(db, yo, `select public.chat_directo_con('${otro}') d`))[0]?.d;
  check(await d(BETO, CARLA) === DMV2 && await d(CARLA, BETO) === DMV2, "con dos directos viejos Beto–Carla, los dos lados eligen el del mensaje más reciente (DMV2)");
  check(await d(DANI, ANA) === DMV3 && await d(ANA, DANI) === DMV3, "sin mensajes, los dos lados eligen el más viejo (DMV3)");
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

// ════ 7. El grupo 31 del día ══════════════════════════════════════════════════
{
  const grupo = (d: PGlite, quien: string, i: number, extra = "") =>
    como(d, quien, `insert into chat_conversations(type, name, created_by${extra ? ", created_at" : ""}) values ('group', 'g${i}', '${quien}'${extra ? `, '${extra}'` : ""})`);
  const prod = await nueva("prod");
  const db = await nueva("A");
  let hechos = 0;
  for (let i = 1; i <= 30; i++) { try { await grupo(db, JHON, i); hechos++; } catch { /* abajo */ } }
  check(hechos === 30, `Jhon crea 30 grupos en el día (${hechos})`);
  await falla(db, JHON, `insert into chat_conversations(type, name, created_by) values ('group', 'g31', '${JHON}')`, /chat_tope_grupos/, "el grupo 31 se rechaza");
  await falla(db, JHON, `insert into chat_conversations(type, name, created_by, created_at) values ('group', 'g31', '${JHON}', '2020-01-01')`, /chat_tope_grupos/, "…también con un created_at atrasado");
  await anda(db, JHON, `insert into chat_conversations(type, created_by) values ('direct', '${JHON}')`, "un directo no cuenta para el tope");
  await anda(db, ANA, `insert into chat_conversations(type, name, created_by) values ('group', 'de Ana', '${ANA}')`, "el tope es por persona: Ana crea el suyo");
  await anda(db, "service_role", `insert into chat_conversations(type, name, created_by) values ('group', 'del sistema', '${JHON}')`, "sin sesión de usuario (service_role) no hay tope");
  check((await uno(db, `select tenant_id::text t from chat_conversations where name = 'del sistema'`))?.t === T1, "y la conversación queda en la agencia de created_by");
  // Pasa un día: la fecha no la cambia nadie (A3), así que el banco apaga la
  // guarda solo para simular el paso del tiempo.
  await db.exec(`alter table chat_conversations disable trigger chat_conversations_agencia;
    update chat_conversations set created_at = now() - interval '25 hours' where created_by = '${JHON}' and type = 'group';
    alter table chat_conversations enable trigger chat_conversations_agencia;`);
  await anda(db, JHON, `insert into chat_conversations(type, name, created_by) values ('group', 'al otro día', '${JHON}')`, "pasadas 24 horas, Jhon vuelve a poder");
  // Línea base: en prod no hay tope.
  let base = 0;
  for (let i = 1; i <= 31; i++) { try { await grupo(prod, JHON, i); base++; } catch { /* nada */ } }
  check(base === 31, `línea base: en prod el grupo 31 entra (${base})`);
}

console.log(ok.map((m) => "✓ " + m).join("\n"));
if (mal.length) { console.log(mal.map((m) => "✗ " + m).join("\n")); console.log(`\n${ok.length} ok, ${mal.length} MAL`); Deno.exit(1); }
console.log(`\n${ok.length} ok`);
