// El tablero de calidad de llamadas y el vigía del audio (migración
// 20261119010000_calidad_de_llamadas), probado contra un Postgres de verdad
// (PGlite) con el esquema de PROD del chat (28/09).
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/calidad_de_llamadas.ts
//
//   1. La migración carga (y vuelve a cargar: es idempotente).
//   2. La regla de un minuto con audio malo (y sin `audio` es null, no «bien»).
//   3. Día por día: solo el dueño (tenant_owners o nivel 'dueno'); los demás,
//      error 42501, nunca vacío. 14 renglones, uno por día; los números.
//   4. Persona por persona: peor primero, sin la papelera, con la causa de audio.
//   5. El vigía: 5 de 10 minutos con audio malo → aviso a la persona y a su
//      supervisor, una vez; a admins no; con 4 minutos malos tampoco.
//
// Sale con código 1 si algo falla.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FIXTURE = leer("./fixtures/prod_chat_api_20260928.sql");
const N = "20261119010000_calidad_de_llamadas.sql";
const M = leer(`../migrations/${N}`);

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);

const KASH = "30869615-f579-4981-8a1f-dbebc61eae2d";
const DUE = "a0000000-0000-4000-8000-000000000001"; // dueño por tenant_owners
const NIV = "a0000000-0000-4000-8000-000000000002"; // dueño solo por nivel
const ADM = "a0000000-0000-4000-8000-000000000003"; // admin (no dueño)
const SUP = "a0000000-0000-4000-8000-000000000004"; // supervisor
const ANA = "a0000000-0000-4000-8000-000000000005"; // agente con problemas
const BETO = "a0000000-0000-4000-8000-000000000006"; // agente sin problemas
const MUDO = "a0000000-0000-4000-8000-000000000007"; // agente con el micrófono mudo
const POCO = "a0000000-0000-4000-8000-000000000008"; // agente con solo 4 minutos malos
const BORR = "a0000000-0000-4000-8000-000000000009"; // en la papelera
const TODOS = [DUE, NIV, ADM, SUP, ANA, BETO, MUDO, POCO, BORR];

// Lo que este fixture no trae y prod sí.
const PREVIO = `
alter table public.profiles add column if not exists nivel text;
-- Stubs (en prod existen; el fixture del chat no los trae): los avisos los llaman.
create or replace function public.puede_ver_modulo(uuid, text, text) returns boolean language sql as 'select true';
create or replace function public.push_notify_enqueue(text, uuid[], jsonb, text, text, text, text, text)
returns void language sql as 'select null::void';
create table public.tenant_owners (tenant_id uuid not null, user_id uuid not null, primary key (tenant_id, user_id));
create table public.llamada_salud (id bigint generated always as identity primary key, user_id uuid not null, sala text,
  creado timestamptz not null default now(), datos jsonb not null);
create table public.llamada_cortes (id bigint generated always as identity primary key, user_id uuid not null, sala text,
  fase text not null, motivo text, contexto jsonb, creado timestamptz not null default now());
create or replace function public.llamada_num(_j jsonb, _k text) returns numeric language sql immutable as
  $f$ select case when jsonb_typeof(_j -> _k) = 'number' then (_j ->> _k)::numeric end $f$;
create or replace function public.es_dueno(_user_id uuid) returns boolean language sql stable security definer as
  $f$ select exists (select 1 from public.tenant_owners o where o.user_id = _user_id) $f$;
create or replace function public.es_admin_o_dueno(_user_id uuid) returns boolean language sql stable security definer as
  $f$ select public.es_dueno(_user_id) or exists (select 1 from public.user_roles r where r.user_id = _user_id and r.role = 'admin') $f$;
create or replace function public.equipo_de(_uid uuid) returns text language sql stable as $f$ select 'Chatters'::text $f$;
create or replace function public.destinatarios_de_aviso(_target uuid) returns table(user_id uuid) language sql stable as
  $f$ select '${SUP}'::uuid $f$;
insert into public.tenants(id, slug, name) values ('${KASH}', 'kash', 'Kash');
insert into auth.users(id, email, raw_user_meta_data) values ${TODOS.map((id) => `('${id}', '${id.slice(-2)}@ejemplo.test', '{}')`).join(", ")};
insert into public.tenant_members(user_id, tenant_id, role) select u, '${KASH}', 'member' from unnest(array['${TODOS.join("','")}']::uuid[]) u;
insert into public.tenant_owners values ('${KASH}', '${DUE}');
insert into public.user_roles(user_id, role) values ('${ADM}', 'admin');
update public.profiles set nivel = 'dueno' where id = '${NIV}';
update public.profiles set nivel = 'admin' where id = '${ADM}';
update public.profiles set nivel = 'supervisor' where id = '${SUP}';
update public.profiles set full_name = 'Ana' where id = '${ANA}';
update public.profiles set full_name = 'Beto' where id = '${BETO}';
update public.profiles set full_name = 'Mudo' where id = '${MUDO}';
update public.profiles set deleted_at = now() where id = '${BORR}';
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}
const db = new PGlite();
await db.exec(FIXTURE);
await db.exec(PREVIO);
await aplicar(db, N, M);
check(true, "la migración carga");
await aplicar(db, N + " (otra vez)", M);
check(true, "la migración vuelve a cargar (idempotente)");

const q = async (sql: string) => (await db.query(sql)).rows as Fila[];
async function como(quien: string, sql: string): Promise<Fila[]> {
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: quien, role: "authenticated" })]);
    await db.exec("set local role authenticated");
    const rs = await db.exec(sql);
    await db.exec("commit");
    return (rs.at(-1)?.rows ?? []) as Fila[];
  } catch (e) { await db.exec("rollback"); throw e; }
}
async function falla(quien: string, sql: string, patron: RegExp, m: string) {
  try { await como(quien, sql); mal.push(`${m} (NO falló)`); }
  catch (e) { const t = msg(e); check(patron.test(t), `${m} → ${t.slice(0, 100)}`); }
}

// ════ 2. La regla de un minuto ═══════════════════════════════════════════════
const malo = async (d: string) => (await q(`select public.llamada_audio_malo('${d}'::jsonb) as m, public.llamada_audio_causa('${d}'::jsonb) as c`))[0];
check((await malo(`{"calidad":"good"}`)).m === null, "sin `audio` la muestra no dice nada (null, no «bien»)");
check((await malo(`{"audio":{"abierto":true,"mudo":false,"perdida_pct":0,"oculto_pct":1}}`)).m === false, "audio sano: no es malo");
check((await malo(`{"audio":{"abierto":true}}`)).m === false, "audio medido con campos que faltan: false, nunca null");
{
  const r = await malo(`{"audio":{"abierto":true,"mudo":true}}`);
  check(r.m === true && r.c === "mic_mudo", `micrófono prendido sin sonido: malo, mic_mudo (${r.c})`);
}
check((await malo(`{"audio":{"abierto":false,"mudo":true}}`)).m === false, "micrófono apagado no cuenta como mudo");
{
  const r = await malo(`{"audio":{"abierto":true,"mudo":false,"perdida_pct":6}}`);
  check(r.m === true && r.c === "voz_se_pierde", `su voz se pierde ≥ 5 %: malo (${r.c})`);
}
check((await malo(`{"audio":{"abierto":false,"perdida_pct":30}}`)).m === false, "con el micro apagado la pérdida de su voz no cuenta");
{
  const r = await malo(`{"audio":{"abierto":false,"oculto_pct":9}}`);
  check(r.m === true && r.c === "escucha_cortado", `escucha cortado ≥ 8 %, aunque tenga el micro apagado (${r.c})`);
}

// ════ Datos: hoy y ayer ═══════════════════════════════════════════════════════
// Ana hoy: 10 minutos; 2 mala conexión; 1 trabado a la vista (y 1 trabado oculto,
// que no cuenta); cámara en 4, 2 frenada por internet; 5 con audio, 3 malos.
const fila = (uid: string, hace: string, d: Record<string, unknown>) =>
  `('${uid}', 'sala', now() - interval '${hace}', '${JSON.stringify(d)}'::jsonb)`;
const ana = [
  { calidad: "poor", vis: "visible", lag_ms: 10, cam: true, limite_cam: "bandwidth", rtt_ms: 100, audio: { abierto: true, mudo: true } },
  { calidad: "lost", vis: "visible", lag_ms: 10, cam: true, limite_cam: "bandwidth", rtt_ms: 300, audio: { abierto: true, perdida_pct: 7 } },
  { calidad: "good", vis: "visible", lag_ms: 500, cam: true, limite_cam: "none", rtt_ms: 100, audio: { abierto: true, mudo: true } },
  { calidad: "good", vis: "hidden", lag_ms: 9000, cam: true, limite_cam: "none", rtt_ms: 100, audio: { abierto: true } },
  { calidad: "good", vis: "visible", lag_ms: 10, cam: false, rtt_ms: 100, audio: { abierto: true } },
  ...Array.from({ length: 5 }, () => ({ calidad: "good", vis: "visible", lag_ms: 10, cam: false, rtt_ms: 100 })),
];
const beto = Array.from({ length: 10 }, () => ({ calidad: "excellent", vis: "visible", lag_ms: 5, cam: true, limite_cam: "none", rtt_ms: 50, audio: { abierto: true } }));
await q(`insert into public.llamada_salud(user_id, sala, creado, datos) values
  ${ana.map((d, i) => fila(ANA, `${i} seconds`, d)).join(",\n  ")},
  ${beto.map((d, i) => fila(BETO, `${i} seconds`, d)).join(",\n  ")},
  ${Array.from({ length: 6 }, (_, i) => fila(BORR, `${i} seconds`, { calidad: "lost", vis: "visible" })).join(", ")},
  ${Array.from({ length: 60 }, (_, i) => fila(ANA, `1 day ${i} seconds`, { calidad: "good", vis: "visible", lag_ms: 10, rtt_ms: 80 })).join(", ")}`);
await q(`insert into public.llamada_cortes(user_id, fase, creado) values
  ('${ANA}', 'parpadeo_ok', now()), ('${ANA}', 'caida', now()), ('${ANA}', 'reentrada_ok', now()), ('${ANA}', 'parpadeo_ok', now() - interval '1 day')`);

// ════ 3. Día por día ═════════════════════════════════════════════════════════
await falla(ANA, `select * from public.llamadas_calidad_por_dia(14)`, /solo el dueño/, "un agente no ve el tablero (error, no vacío)");
await falla(ADM, `select * from public.llamadas_calidad_por_dia(14)`, /solo el dueño/, "un admin tampoco: es del dueño");
await falla(SUP, `select * from public.llamadas_calidad_por_persona(1)`, /solo el dueño/, "ni el supervisor ve persona por persona");
{
  const dias = await como(DUE, `select * from public.llamadas_calidad_por_dia(14)`);
  check(dias.length === 14, `14 renglones, uno por día (${dias.length})`);
  check(new Date(dias[0].dia) < new Date(dias[13].dia), "en orden, del más viejo al de hoy");
  const vacio = dias[0];
  check(vacio.minutos === 0 && vacio.pct_mala_conexion === null && vacio.cortes_por_100h === null, "un día sin llamadas: 0 minutos y métricas en null");
  const hoy = dias[13];
  const n = (v: unknown) => Number(v);
  check(hoy.minutos === 26 && hoy.personas === 3, `hoy: 26 minutos de 3 personas (la papelera también mide el día) (${hoy.minutos}, ${hoy.personas})`);
  check(hoy.cortes === 2, `hoy: 2 cortes (reentrada_ok no es corte) (${hoy.cortes})`);
  check(n(hoy.cortes_por_100h) === Math.round((2 / (26 / 60)) * 100 * 10) / 10, `cortes por 100 h (${hoy.cortes_por_100h})`);
  check(n(hoy.pct_mala_conexion) === Math.round((8 / 26) * 1000) / 10, `mala conexión: 8 de 26 (${hoy.pct_mala_conexion})`);
  check(n(hoy.pct_congelado) === Math.round((1 / 25) * 1000) / 10, `trabado: 1 de 25 a la vista; el oculto no cuenta (${hoy.pct_congelado})`);
  check(n(hoy.pct_cam_limitada) === Math.round((2 / 14) * 1000) / 10, `cámara frenada: 2 de 14 con cámara (${hoy.pct_cam_limitada})`);
  check(hoy.minutos_con_audio === 15 && n(hoy.pct_audio_malo) === 20, `audio: 3 malos de 15 medidos (${hoy.minutos_con_audio}, ${hoy.pct_audio_malo})`);
  const ayer = dias[12];
  check(ayer.minutos === 60 && ayer.cortes === 1 && n(ayer.cortes_por_100h) === 100, `ayer: 60 min y 1 corte = 100 por 100 h (${ayer.cortes_por_100h})`);
  check(ayer.minutos_con_audio === 0 && ayer.pct_audio_malo === null, "ayer sin medir audio: null, nunca 0 %");
  check(ayer.rtt_mediana_ms === 80, `ping típico de ayer (${ayer.rtt_mediana_ms})`);
}
check((await como(NIV, `select * from public.llamadas_calidad_por_dia(7)`)).length === 7, "el dueño por nivel también lo ve; _dias manda");
check((await como(DUE, `select * from public.llamadas_calidad_por_dia(500)`)).length === 31, "como mucho 31 días");

// ════ 4. Persona por persona ═════════════════════════════════════════════════
{
  const p = await como(DUE, `select * from public.llamadas_calidad_por_persona(1)`);
  check(p.map((x) => x.nombre).join() === "Ana,Beto", `peor primero y sin la papelera (${p.map((x) => x.nombre).join()})`);
  const a = p[0];
  check(a.minutos === 10 && a.cortes === 2, `Ana: 10 minutos, 2 cortes (${a.minutos}, ${a.cortes})`);
  check(Number(a.pct_con_problema) === 30, `Ana: 3 de 10 minutos con algún problema (${a.pct_con_problema})`);
  check(a.causa_audio === "mic_mudo", `Ana: la causa de audio que más se repite (${a.causa_audio})`);
  check(Number(p[1].pct_con_problema) === 0 && p[1].causa_audio === null, "Beto: sin problemas, sin causa");
  const s = await como(DUE, `select * from public.llamadas_calidad_por_persona(7)`);
  check(s.find((x) => x.nombre === "Ana")?.minutos === 70, "7 días suma ayer");
}

// ════ 5. El vigía del audio ══════════════════════════════════════════════════
await q(`insert into public.llamada_salud(user_id, sala, creado, datos) values
  ${Array.from({ length: 6 }, (_, i) => fila(MUDO, `${i} minutes`, { audio: { abierto: true, mudo: true } })).join(", ")},
  ${Array.from({ length: 4 }, (_, i) => fila(POCO, `${i} minutes`, { audio: { abierto: false, oculto_pct: 20 } })).join(", ")},
  ${Array.from({ length: 6 }, (_, i) => fila(ADM, `${i} minutes`, { audio: { abierto: true, mudo: true } })).join(", ")},
  ${Array.from({ length: 6 }, (_, i) => fila(POCO, `${20 + i} minutes`, { audio: { abierto: false, oculto_pct: 20 } })).join(", ")}`);
const n1 = (await q(`select public.vigilar_audio_de_llamada() as n`))[0].n;
const avisos = await q(`select user_id, type, title, message, deep_link_url from public.notifications where type like 'llamada_audio%' order by type`);
check(n1 === 1, `avisa por una sola persona (${n1})`);
check(avisos.length === 2, `dos avisos: a ella y a su supervisor (${avisos.length})`);
check(avisos.some((a) => a.user_id === MUDO && a.type === "llamada_audio_tu" && /micrófono/.test(a.title) && a.deep_link_url === "/cowork"),
  "a la persona: qué pasa y qué hacer");
check(avisos.some((a) => a.user_id === SUP && a.type === "llamada_audio" && a.title === "A Mudo no se le escucha en la llamada"),
  `al supervisor, con el nombre (${avisos.find((a) => a.type === "llamada_audio")?.title})`);
check(!avisos.some((a) => a.user_id === ADM), "a un admin con audio malo no se le avisa");
check(!avisos.some((a) => a.user_id === POCO), "4 minutos malos en los últimos 10 no alcanzan (los de hace 20 min no cuentan)");
check((await q(`select public.vigilar_audio_de_llamada() as n`))[0].n === 0, "la siguiente vuelta no repite (2 horas)");
check((await q(`select count(*)::int as n from public.llamada_avisos_audio`))[0].n === 1, "queda anotado en llamada_avisos_audio");
await falla(ANA, `select public.vigilar_audio_de_llamada()`, /permission denied/, "nadie desde el navegador corre el vigía");
check((await como(ANA, `select * from public.llamada_avisos_audio`)).length === 0, "ni lee los avisos de audio (RLS sin políticas)");

// ════ Resultado ═══════════════════════════════════════════════════════════════
for (const m of ok) console.log("✓", m);
for (const m of mal) console.log("✗", m);
console.log(`\n${ok.length} bien, ${mal.length} mal`);
if (mal.length) Deno.exit(1);
