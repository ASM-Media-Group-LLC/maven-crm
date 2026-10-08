// Correos programados (migración 20261008160000_correo_programados), probados
// contra un Postgres de verdad (PGlite) con los roles y el auth de PROD.
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/correo_programados.ts
//
//   1. La migración carga.
//   2. La persona ve SUS programados, solo las columnas de la lista: el correo
//      entero no viaja por acá. No crea, no cambia, no borra. anon, nada.
//   3. El cron toma solo lo vencido y pendiente, y lo marca «enviando» en el
//      mismo paso: una segunda corrida no lo vuelve a tomar.
//   4. Uno colgado en «enviando» más de 15 min queda fallido, NO se reintenta.
//   5. Cancelar devuelve el correo entero, solo si es tuyo y todavía no salió.
//   6. La vuelta atrás (las líneas «--|») deja todo como estaba y se puede volver a aplicar.
//
// Sale con código 1 si algo falla. Corre en el guard de cada PR.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FX_ROLES = leer("./fixtures/prod_roles_20261001.sql");
const N = "20261008160000_correo_programados.sql";
const M = leer(`../migrations/${N}`);
const vuelta = (sql: string) => sql.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);

const P = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [KEILA, ANA] = [1, 2].map(P);

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}

type Quien = string | "service_role" | "anon";
async function entrar(db: PGlite, quien: Quien) {
  await db.exec("reset role");
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
async function probar(db: PGlite, quien: Quien, sql: string): Promise<Fila[] | string> {
  await db.exec("begin");
  try { await entrar(db, quien); const rs = await db.exec(sql); return (rs.at(-1)?.rows ?? []) as Fila[]; }
  catch (e) { return msg(e); }
  finally { await db.exec("rollback"); }
}
const esError = (r: Fila[] | string, re: RegExp) => typeof r === "string" && re.test(r);
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as Fila[];

// ════ 1. La migración ═════════════════════════════════════════════════════════
const db = new PGlite();
await db.exec(FX_ROLES);
await db.exec(`insert into auth.users(id, email, raw_user_meta_data) values
  ('${KEILA}', 'keila@maven-ai.me', '{"full_name":"Keila"}'), ('${ANA}', 'ana@maven-ai.me', '{"full_name":"Ana"}');`);
await aplicar(db, N, M);
check(true, "la migración carga");

const CORREO = `'{"html":"<p>Hola</p>","text":"Hola","attachments":[{"filename":"a.pdf","contentType":"application/pdf","contentBase64":"JVBERi0x"}]}'::jsonb`;
const programar = (quien: string, cuando: string, asunto: string) => como(db, "service_role", `
  insert into public.mail_programados (user_id, enviar_en, para, asunto, resumen, correo)
  values ('${quien}', ${cuando}, '{ana@x.com}', '${asunto}', 'Hola', ${CORREO}) returning id`);

const [vencido] = await programar(KEILA, "now() - interval '1 minute'", "Vencido");
const [manana] = await programar(KEILA, "now() + interval '1 day'", "Mañana");
const [deAna] = await programar(ANA, "now() + interval '1 day'", "De Ana");

// ════ 2. Quién ve qué ═════════════════════════════════════════════════════════
{
  const mios = await como(db, KEILA, `select id, asunto, estado, adjuntos_meta from public.mail_programados order by enviar_en`);
  check(mios.length === 2 && mios.every((f) => f.asunto !== "De Ana"), `Keila ve sus dos y no el de Ana (${mios.map((f) => f.asunto)})`);
  const entero = await probar(db, KEILA, `select correo from public.mail_programados`);
  check(esError(entero, /permission denied/), `el correo entero NO se lee desde la pantalla (${String(entero).slice(0, 60)})`);
  const crear = await probar(db, KEILA, `insert into public.mail_programados (user_id, enviar_en, para, correo) values ('${KEILA}', now(), '{a@x.com}', '{}')`);
  check(esError(crear, /permission denied/), "la persona no crea programados (los crea la edge, que revisa el correo)");
  const cambiar = await probar(db, KEILA, `update public.mail_programados set enviar_en = now() where id = '${manana.id}'`);
  check(esError(cambiar, /permission denied/), "ni los cambia");
  const borrar = await probar(db, KEILA, `delete from public.mail_programados where id = '${manana.id}'`);
  check(esError(borrar, /permission denied/), "ni los borra");
  const anon = await probar(db, "anon", `select id from public.mail_programados`);
  check(esError(anon, /permission denied/), "anon, nada");
  const tomarComoPersona = await probar(db, KEILA, `select * from public.mail_programados_tomar(5)`);
  check(esError(tomarComoPersona, /permission denied/), "la persona no puede hacer de cron");
}

// ════ 3. El cron toma lo vencido ═════════════════════════════════════════════
{
  const tomados = await como(db, "service_role", `select id, estado, intentos from public.mail_programados_tomar(5)`);
  check(tomados.length === 1 && tomados[0].id === vencido.id, `toma SOLO el vencido (${tomados.length})`);
  check(tomados[0]?.estado === "enviando" && tomados[0]?.intentos === 1, "y lo deja «enviando», con su intento contado");
  const otraVez = await como(db, "service_role", `select id from public.mail_programados_tomar(5)`);
  check(otraVez.length === 0, "una segunda corrida no lo vuelve a tomar");
}

// ════ 4. Colgado en «enviando» ═══════════════════════════════════════════════
{
  await db.exec(`update public.mail_programados set tomado_en = now() - interval '20 minutes' where id = '${vencido.id}'`);
  const tomados = await como(db, "service_role", `select id from public.mail_programados_tomar(5)`);
  const [f] = await q(db, `select estado, ultimo_error from public.mail_programados where id = '${vencido.id}'`);
  check(tomados.length === 0, "⚠️ el colgado NO se vuelve a tomar (pudo haber salido)");
  check(f.estado === "fallido" && /Enviados/.test(f.ultimo_error ?? ""), `queda fallido y dice que mire Enviados (${f.estado})`);
}

// ════ 5. Cancelar ════════════════════════════════════════════════════════════
{
  const [r] = await como(db, KEILA, `select public.mail_programado_cancelar('${manana.id}') as r`);
  check(r.r?.asunto === "Mañana" && r.r?.correo?.attachments?.length === 1, "cancelar devuelve el correo entero, con sus adjuntos");
  const [f] = await q(db, `select estado, cerrado_en from public.mail_programados where id = '${manana.id}'`);
  check(f.estado === "cancelado" && f.cerrado_en !== null, "y queda cancelado (no sale)");
  const [dos] = await como(db, KEILA, `select public.mail_programado_cancelar('${manana.id}') as r`);
  check(dos.r === null, "cancelar dos veces: la segunda no devuelve nada");
  const [ajeno] = await como(db, KEILA, `select public.mail_programado_cancelar('${deAna.id}') as r`);
  const [sigue] = await q(db, `select estado from public.mail_programados where id = '${deAna.id}'`);
  check(ajeno.r === null && sigue.estado === "pendiente", "el de otra persona, no");
  const [fallido] = await como(db, KEILA, `select public.mail_programado_cancelar('${vencido.id}') as r`);
  check(fallido.r?.asunto === "Vencido", "un fallido se recupera cancelándolo (para corregirlo y volver a mandarlo)");
  const anon = await probar(db, "anon", `select public.mail_programado_cancelar('${deAna.id}')`);
  check(esError(anon, /permission denied/), "anon no cancela");
}

// ════ 6. La vuelta atrás ═════════════════════════════════════════════════════
{
  await aplicar(db, "vuelta atrás", vuelta(M));
  const [t] = await q(db, `select to_regclass('public.mail_programados') as t`);
  check(t.t === null, "la vuelta atrás borra la tabla");
  await aplicar(db, N + " (otra vez)", M);
  check(true, "y se puede volver a aplicar");
}

for (const m of ok) console.log(`ok   ${m}`);
for (const m of mal) console.log(`MAL  ${m}`);
console.log(`\n${ok.length} ok, ${mal.length} mal`);
if (mal.length) Deno.exit(1);
