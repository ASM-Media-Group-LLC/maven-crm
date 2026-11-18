// Los chatters entre sí (migración 20261118231000_contacto_entre_chatters),
// probado contra un Postgres de verdad (PGlite) con el esquema de PROD del chat (28/09).
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/contacto_entre_chatters.ts
//
// Regla de Alvaro: todo sigue como hace 7 días; solo lo nuevo se restringe.
//   1. La migración carga (y vuelve a cargar: es idempotente).
//   2. contacto_permitido: dos chatters de una agencia que los aísla → no; con su
//      supervisor, un admin o alguien de otro rol → sí; en otra agencia sin lista → sí.
//   3. Chat directo entre dos chatters → SÍ se abre, y la PRIMERA vez avisa (una
//      sola vez por pareja) al dueño, a los admins vivos y a los anotados, sin
//      repetir. Los directos que ya existían no avisan. Supervisor ↔ chatter no avisa.
//   4. Llamada 1 a 1 entre chatters → sí, como siempre. Sumar a otro chatter a una
//      llamada → no (ni con invitado_por falso); el supervisor sí.
//   5. Las listas: la ven / editan los de la agencia que corresponde.
//   6. El correo: la cola trae la pareja nueva con sus destinatarios y se marca.
//
// Sale con código 1 si algo falla.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FIXTURE = leer("./fixtures/prod_chat_api_20260928.sql");
const COMPLEMENTO = leer("./fixtures/prod_api_escritura_20261001.sql");
const N = "20261118231000_contacto_entre_chatters.sql";
const M = leer(`../migrations/${N}`);

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);

const KASH = "30869615-f579-4981-8a1f-dbebc61eae2d";
const OTRA = "10000000-0000-4000-8000-000000000002";
const CH1 = "a0000000-0000-4000-8000-000000000001"; // chatter
const CH2 = "a0000000-0000-4000-8000-000000000002"; // chatter
const SUP = "a0000000-0000-4000-8000-000000000003"; // chatter supervisor (nivel supervisor)
const ADM = "a0000000-0000-4000-8000-000000000004"; // admin
const ED = "a0000000-0000-4000-8000-000000000005"; // editor
const MIX = "a0000000-0000-4000-8000-000000000006"; // chatter con nivel manager
const X1 = "a0000000-0000-4000-8000-000000000007"; // chatter de OTRA agencia
const X2 = "a0000000-0000-4000-8000-000000000008"; // chatter de OTRA agencia
const CH3 = "a0000000-0000-4000-8000-000000000009"; // chatter con un directo VIEJO con CH1
const DUE = "a0000000-0000-4000-8000-000000000010"; // dueño (nivel dueno) y además admin
const ADM_BORRADO = "a0000000-0000-4000-8000-000000000011"; // admin en la papelera
const LUIS = "41b35cef-82a8-4991-9234-3514b0064767"; // anotado para Kash
const TODOS = [CH1, CH2, SUP, ADM, ED, MIX, X1, X2, CH3, DUE, ADM_BORRADO, LUIS];
const VIEJO = "c0000000-0000-4000-8000-000000000099";

// Lo que este fixture no trae y prod sí: profiles.nivel y las tablas de llamadas.
const PREVIO = `
alter table public.profiles add column if not exists nivel text;
create table public.calls (id uuid primary key default gen_random_uuid(), caller_id uuid not null, receiver_id uuid,
  conversation_id uuid, call_status text not null default 'ringing', call_type text not null default 'video',
  is_group boolean not null default false, room_id text not null);
create table public.call_participants (id uuid primary key default gen_random_uuid(), call_id uuid not null references public.calls(id),
  user_id uuid not null, status text not null default 'ringing', invitado_por uuid);
grant select, insert, update on public.calls, public.call_participants to authenticated;
-- Stubs (en prod existen; el fixture del chat no los trae): los avisos los llaman.
create or replace function public.puede_ver_modulo(uuid, text, text) returns boolean language sql as 'select true';
create or replace function public.push_notify_enqueue(text, uuid[], jsonb, text, text, text, text, text)
returns void language sql as 'select null::void';
insert into public.tenants(id, slug, name) values ('${KASH}', 'kash', 'Kash'), ('${OTRA}', 'otra', 'Otra');
insert into auth.users(id, email, raw_user_meta_data) values ${TODOS.map((id) => `('${id}', '${id.slice(-2)}@ejemplo.test', '{}')`).join(", ")};
insert into public.tenant_members(user_id, tenant_id, role) values
  ('${CH1}', '${KASH}', 'member'), ('${CH2}', '${KASH}', 'member'), ('${SUP}', '${KASH}', 'member'),
  ('${ADM}', '${KASH}', 'admin'), ('${ED}', '${KASH}', 'member'), ('${MIX}', '${KASH}', 'member'),
  ('${CH3}', '${KASH}', 'member'), ('${DUE}', '${KASH}', 'member'), ('${ADM_BORRADO}', '${KASH}', 'member'),
  ('${LUIS}', '${KASH}', 'member'),
  ('${X1}', '${OTRA}', 'member'), ('${X2}', '${OTRA}', 'member');
insert into public.user_roles(user_id, role) values
  ('${CH1}', 'Chatter'), ('${CH2}', 'Chatter'), ('${CH3}', 'Chatter'), ('${SUP}', 'Chatter Supervisor'), ('${ADM}', 'admin'),
  ('${ED}', 'Editor'), ('${MIX}', 'Chatter'), ('${X1}', 'Chatter'), ('${X2}', 'Chatter'), ('${DUE}', 'admin'),
  ('${ADM_BORRADO}', 'admin'), ('${LUIS}', 'Editor');
update public.profiles set full_name = 'Breyner' where id = '${CH1}';
update public.profiles set full_name = 'Daniel' where id = '${CH2}';
update public.profiles set nivel = 'supervisor' where id = '${SUP}';
update public.profiles set nivel = 'manager' where id = '${MIX}';
update public.profiles set nivel = 'dueno' where id = '${DUE}';
update public.profiles set nivel = 'admin', deleted_at = now() where id = '${ADM_BORRADO}';
update public.profiles set nivel = 'agente' where id in ('${CH1}', '${CH2}', '${CH3}', '${X1}', '${X2}', '${ED}');
-- Un directo de antes entre dos chatters: sigue, y no avisa.
insert into public.chat_conversations(id, type, created_by) values ('${VIEJO}', 'direct', '${CH1}');
insert into public.chat_participants(conversation_id, user_id, role) values ('${VIEJO}', '${CH1}', 'admin'), ('${VIEJO}', '${CH3}', 'member');
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}
const db = new PGlite();
await db.exec(FIXTURE);
await db.exec(COMPLEMENTO);
await db.exec(PREVIO);
await aplicar(db, N, M);
check(true, "la migración carga");
await aplicar(db, N + " (otra vez)", M);
check(true, "la migración vuelve a cargar (idempotente)");

const q = async (sql: string) => (await db.query(sql)).rows as Fila[];
async function como(quien: string | "postgres", sql: string): Promise<Fila[]> {
  await db.exec("begin");
  try {
    await db.exec("reset role");
    if (quien === "postgres") {
      await db.query(`select set_config('request.jwt.claims', '', true)`);
    } else {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: quien, role: "authenticated" })]);
      await db.exec("set local role authenticated");
    }
    const rs = await db.exec(sql);
    await db.exec("commit");
    return (rs.at(-1)?.rows ?? []) as Fila[];
  } catch (e) { await db.exec("rollback"); throw e; }
}
async function falla(quien: string, sql: string, patron: RegExp, m: string) {
  try { await como(quien, sql); mal.push(`${m} (NO falló)`); }
  catch (e) { const t = msg(e); check(patron.test(t), `${m} → ${t.slice(0, 100)}`); }
}
async function anda(quien: string, sql: string, m: string) {
  try { await como(quien, sql); check(true, m); } catch (e) { mal.push(`${m} → ${msg(e).slice(0, 120)}`); }
}
const avisos = async () => await q(`select user_id, title, message, deep_link_url from public.notifications where type = 'contacto_primer_contacto' order by user_id`);

// ════ 1. La semilla ═══════════════════════════════════════════════════════════
check((await q(`select role from public.contacto_roles_aislados where tenant_id = '${KASH}'`)).map((r) => r.role).join() === "Chatter",
  "Kash arranca con 'Chatter'");
check((await q(`select user_id from public.contacto_alertas_destinatarios where tenant_id = '${KASH}'`)).map((r) => r.user_id).join() === LUIS,
  "Kash anota a Luis Carlos para el aviso");
{
  const viejo = await q(`select a, b, correo_enviado_at from public.contacto_primer_contacto`);
  check(viejo.length === 1 && viejo[0].correo_enviado_at != null, `el directo viejo queda anotado, sin correo pendiente (${viejo.length})`);
  check((await avisos()).length === 0, "y no avisa a nadie");
}

// ════ 2. La regla ═════════════════════════════════════════════════════════════
const permitido = async (a: string, b: string) =>
  (await q(`select public.contacto_permitido('${a}', '${b}') as p`))[0].p as boolean;
check(!(await permitido(CH1, CH2)), "dos chatters de Kash: par aislado");
check(!(await permitido(CH2, CH1)), "y al revés también");
check(await permitido(CH1, CH1), "uno mismo: no");
check(await permitido(CH1, SUP), "chatter ↔ supervisor: no es par aislado");
check(await permitido(CH1, ADM), "chatter ↔ admin: no");
check(await permitido(CH1, ED), "chatter ↔ editor: no");
check(await permitido(CH1, MIX), "chatter ↔ chatter con nivel manager: no");
check(await permitido(X1, X2), "en una agencia sin lista, dos chatters: no");
{
  const r = (await como(CH1, `select public.contactos_restringidos() as id`)).map((f) => f.id).sort();
  check(r.join() === [CH2, CH3].sort().join(), `contactos_restringidos de un chatter: los otros chatters (${r.length})`);
  check((await como(SUP, `select public.contactos_restringidos() as id`)).length === 0, "el supervisor no tiene restringidos");
}
await falla(CH1, `select public.contactos_restringidos_de('${CH2}')`, /permission denied/, "nadie pregunta por los restringidos de otro");

// ════ 3. Chat directo: se abre, y la primera vez avisa ════════════════════════
const DM = "c0000000-0000-4000-8000-000000000001";
const DM_OK = "c0000000-0000-4000-8000-000000000002";
const G = "c0000000-0000-4000-8000-000000000003";
const DM_OTRA = "c0000000-0000-4000-8000-000000000004";
await q(`insert into public.chat_conversations(id, type, created_by) values ('${DM}', 'direct', '${CH1}'), ('${DM_OK}', 'direct', '${CH1}'), ('${G}', 'group', '${SUP}'), ('${DM_OTRA}', 'direct', '${X1}')`);
await anda("postgres", `insert into public.chat_participants(conversation_id, user_id, role) values ('${DM}', '${CH1}', 'admin')`, "el creador entra a su directo");
await anda("postgres", `insert into public.chat_participants(conversation_id, user_id, role) values ('${DM}', '${CH2}', 'member')`,
  "un chatter SÍ abre un directo con otro chatter (como siempre)");
{
  const a = await avisos();
  const quienes = a.map((x) => x.user_id).sort();
  const esperados = [ADM, DUE, LUIS].sort();
  check(quienes.join() === esperados.join(), `el aviso llega al dueño, a los admins vivos y a Luis, una vez cada uno (${quienes.length})`);
  check(a.every((x) => x.title === "Breyner y Daniel empezaron a hablarse por primera vez"), `con el texto (${a[0]?.title})`);
  check(a.every((x) => !/hola/i.test(String(x.message)) && String(x.deep_link_url).startsWith("/hr/persona/")), "sin contenido del chat, con link a la persona");
  check(!quienes.includes(ADM_BORRADO), "el admin en la papelera no lo recibe");
}
// Otra vez la misma pareja (otro directo, p. ej. por API) → no repite.
const DM2 = "c0000000-0000-4000-8000-000000000005";
await q(`insert into public.chat_conversations(id, type, created_by) values ('${DM2}', 'direct', '${CH2}')`);
await q(`insert into public.chat_participants(conversation_id, user_id, role) values ('${DM2}', '${CH2}', 'admin'), ('${DM2}', '${CH1}', 'member')`).catch(() => {});
check((await avisos()).length === 3, "la misma pareja no vuelve a avisar");
await anda("postgres", `insert into public.chat_participants(conversation_id, user_id, role) values ('${DM_OK}', '${CH1}', 'admin'), ('${DM_OK}', '${SUP}', 'member')`,
  "chatter ↔ supervisor en directo: sí");
await anda("postgres", `insert into public.chat_participants(conversation_id, user_id, role) values ('${G}', '${SUP}', 'admin'), ('${G}', '${CH1}', 'member'), ('${G}', '${CH2}', 'member')`,
  "en un grupo, dos chatters juntos: sí");
await anda("postgres", `insert into public.chat_participants(conversation_id, user_id, role) values ('${DM_OTRA}', '${X1}', 'admin'), ('${DM_OTRA}', '${X2}', 'member')`,
  "dos chatters de otra agencia: sí");
check((await avisos()).length === 3, "ni el supervisor, ni el grupo, ni la otra agencia avisan");

// ════ 4. Llamadas ═════════════════════════════════════════════════════════════
const UNO = "d0000000-0000-4000-8000-000000000002";
await anda(CH1, `insert into public.calls(id, caller_id, receiver_id, room_id) values ('${UNO}', '${CH1}', '${CH2}', 'call-x')`,
  "un chatter SÍ llama 1 a 1 a otro chatter (como siempre)");
await anda(CH1, `insert into public.call_participants(call_id, user_id, status) values ('${UNO}', '${CH1}', 'accepted'), ('${UNO}', '${CH2}', 'ringing')`,
  "y le suena");
await anda(CH1, `update public.call_participants set status = 'missed' where call_id = '${UNO}' and user_id = '${CH2}'`, "no contestó");
await anda(CH1, `update public.call_participants set status = 'ringing' where call_id = '${UNO}' and user_id = '${CH2}'`, "y lo vuelve a llamar");
await falla(CH1, `insert into public.call_participants(call_id, user_id, status, invitado_por) values ('${UNO}', '${CH3}', 'ringing', '${CH1}')`,
  /contacto_no_permitido/, "pero no suma a un tercer chatter a esa llamada");
const CALL = "d0000000-0000-4000-8000-000000000001";
await q(`insert into public.calls(id, caller_id, receiver_id, room_id, is_group) values ('${CALL}', '${SUP}', null, 'call-g', true)`);
await anda(CH1, `insert into public.call_participants(call_id, user_id, status) values ('${CALL}', '${CH1}', 'accepted')`, "un chatter se suma solo a una llamada");
await falla(CH1, `insert into public.call_participants(call_id, user_id, status, invitado_por) values ('${CALL}', '${CH2}', 'ringing', '${CH1}')`,
  /contacto_no_permitido/, "un chatter no suma a otro chatter a una llamada de grupo");
await falla(CH1, `insert into public.call_participants(call_id, user_id, status, invitado_por) values ('${CALL}', '${CH2}', 'ringing', '${SUP}')`,
  /contacto_no_permitido/, "ni diciendo que lo invitó el supervisor");
await anda(CH1, `insert into public.call_participants(call_id, user_id, status, invitado_por) values ('${CALL}', '${ED}', 'ringing', '${CH1}')`,
  "un chatter sí suma a un editor");
await anda(SUP, `insert into public.call_participants(call_id, user_id, status, invitado_por) values ('${CALL}', '${CH2}', 'missed', '${SUP}')`,
  "el supervisor suma a un chatter");
await falla(CH1, `update public.call_participants set status = 'ringing', invitado_por = '${CH1}' where call_id = '${CALL}' and user_id = '${CH2}'`,
  /contacto_no_permitido/, "volver a hacer sonar a otro chatter tampoco");
await anda(SUP, `update public.call_participants set status = 'ringing' where call_id = '${CALL}' and user_id = '${CH2}'`,
  "el supervisor sí lo vuelve a hacer sonar");
await anda(CH2, `update public.call_participants set status = 'accepted' where call_id = '${CALL}' and user_id = '${CH2}'`,
  "el chatter contesta la llamada de grupo");

// ════ 5. Las listas ═══════════════════════════════════════════════════════════
check((await como(CH1, `select role from public.contacto_roles_aislados`)).length === 1, "un chatter de Kash ve la lista de roles de su agencia");
check((await como(X1, `select role from public.contacto_roles_aislados`)).length === 0, "uno de otra agencia no la ve");
check((await como(CH1, `select * from public.contacto_alertas_destinatarios`)).length === 0, "un chatter no ve a quién le llega el aviso");
check((await como(CH1, `select * from public.contacto_primer_contacto`)).length === 0, "ni los primeros contactos");
check((await como(ADM, `select * from public.contacto_primer_contacto`)).length === 2, "el admin sí los ve");
await falla(CH1, `insert into public.contacto_roles_aislados(tenant_id, role) values ('${KASH}', 'Editor')`,
  /row-level security/, "un chatter no edita la lista");
await falla(ADM, `insert into public.contacto_roles_aislados(tenant_id, role) values ('${OTRA}', 'Chatter')`,
  /row-level security/, "un admin no edita la lista de otra agencia");
await falla(ADM, `insert into public.contacto_primer_contacto(tenant_id, a, b) values ('${KASH}', '${CH1}', '${ED}')`,
  /permission denied/, "nadie escribe los primeros contactos a mano");
await anda(ADM, `insert into public.contacto_roles_aislados(tenant_id, role) values ('${KASH}', 'Editor')`, "el admin de Kash suma un rol");
check(!(await permitido(CH1, ED)), "con 'Editor' en la lista, chatter ↔ editor: par aislado");
await anda(ADM, `delete from public.contacto_roles_aislados where tenant_id = '${KASH}' and role = 'Editor'`, "y lo saca");
check(await permitido(CH1, ED), "sin 'Editor', ya no");
await anda(ADM, `insert into public.contacto_alertas_destinatarios(tenant_id, user_id) values ('${KASH}', '${SUP}')`, "el admin anota a otro para el aviso");

// ════ 6. El correo ════════════════════════════════════════════════════════════
{
  const cola = await q(`select * from public.contacto_primer_contacto_por_correo()`);
  check(cola.length === 1 && cola[0].nombre_a === "Breyner" && cola[0].nombre_b === "Daniel", `la cola del correo trae la pareja nueva (${cola.length})`);
  check([...cola[0].destinatarios].sort().join() === [ADM, DUE, LUIS].sort().join(), "con sus destinatarios");
  await q(`select public.contacto_primer_contacto_marcar_correo('${cola[0].tenant_id}', '${cola[0].a}', '${cola[0].b}', array['x@ejemplo.test'])`);
  check((await q(`select * from public.contacto_primer_contacto_por_correo()`)).length === 0, "marcada, no vuelve a salir");
  await falla(CH1, `select * from public.contacto_primer_contacto_por_correo()`, /permission denied/, "la cola es solo del servidor");
}

for (const m of ok) console.log("  ok  " + m);
for (const m of mal) console.log("  MAL " + m);
console.log(`\n${ok.length} ok, ${mal.length} mal`);
if (mal.length) Deno.exit(1);
