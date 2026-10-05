// El buzón de Zoho se borra al PURGAR la cuenta (migración
// 20261005120000_buzon_zoho_al_purgar.sql), probado contra un Postgres de
// verdad (PGlite).
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/buzones_por_borrar.ts
//
// La papelera sale de las MIGRACIONES del repo: 20260907190000 (deleted_at y
// cuenta_eventos), 20260916203000 (el trigger que revoca la credencial al dar
// de baja) y 20260907200000 (la purga del cron), y después la nueva, con su
// guarda de huella. app_purge_user_refs y app_force_delete_auth_user son
// dobles que borran lo mismo que importa aquí (mail_credentials, el perfil y
// auth.users); cron, net y vault, dobles que anotan.
//
// Lo que se prueba:
//   1. app_casilla_de_la_cuenta: la credencial vigente o la revocada CON la
//      baja; nunca una casilla vieja de un cambio de correo; el acceso solo si
//      es del dominio del equipo.
//   2. La purga automática encola el buzón ANTES de destruir (después ya no
//      hay mail_credentials de dónde sacarlo), deja el evento 'purgada' con la
//      casilla, y no toca lo que todavía está dentro de los 30 días.
//   3. Si la purga de una cuenta falla, no queda ni la purga ni la fila.
//   4. El contexto que mira la edge (purgada, recuperada, dirección reusada) y
//      el resultado, que llega a la cola y al evento.
//   5. Encolar es idempotente y no reabre lo ya borrado.
//   6. El cron: solo llama a la edge si hay algo vencido.
//   7. Permisos: nada de esto lo puede llamar anon ni authenticated.
//   8. La vuelta atrás deja la purga EXACTAMENTE como en prod (misma huella),
//      y la migración se vuelve a aplicar sobre eso; con otra función, la
//      guarda frena.
//
// Sale con código 1 si algo falla.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const PAPELERA = leer("../migrations/20260907190000_cuentas_recuperables_30_dias.sql");
const REVOCA = leer("../migrations/20260916203000_baja_revoca_credencial_de_correo.sql");
const PURGA = leer("../migrations/20260907200000_purga_cuentas_vencidas.sql");
const NOMBRE = "20261005120000_buzon_zoho_al_purgar.sql";
const MIG = leer(`../migrations/${NOMBRE}`);
const VUELTA = MIG.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");

const HUELLA_PROD = "b54343e20393b75508d739fd3459c9fc";
const HUELLA_REPO = "caeb79d358839a358378683bfd9a5586";

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);

const P = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// ANA: vencida con credencial (y una casilla vieja de antes). BETO: vencida sin
// credencial, acceso @maven-ai.me. CARLA: vencida, acceso @unlok.me y sin
// credencial. DANI: en la papelera hace 5 días. EVA: activa. FER: activa, sin nada.
const [ANA, BETO, CARLA, DANI, EVA, FER] = [1, 2, 3, 4, 5, 6].map(P);

const ESQUEMA = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Los privilegios por defecto de Supabase: cada tabla y función nueva para los tres roles.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.profiles (id uuid primary key references auth.users(id), full_name text);
create function public.can_manage_users(_user_id uuid) returns boolean language sql stable as $$ select false $$;
create table public.mail_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  email_address text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, email_address)
);
-- Dobles de la purga: lo que importa aquí es que se llevan mail_credentials y el perfil.
create function public.app_purge_user_refs(p_user_id uuid) returns void language plpgsql as $$
begin
  if exists (select 1 from public.profiles where id = p_user_id and full_name = 'EXPLOTA') then
    raise exception 'purga rota a propósito';
  end if;
  delete from public.mail_credentials where user_id = p_user_id;
  delete from public.profiles where id = p_user_id;
end $$;
create function public.app_force_delete_auth_user(p_user_id uuid) returns void language sql as $$
  delete from auth.users where id = p_user_id $$;
-- cron, net y vault de mentira.
create schema cron;
create table cron.job (jobid serial primary key, jobname text unique, schedule text, command text, active boolean default true);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid $$;
create function cron.unschedule(job_name text) returns boolean language sql as $$
  delete from cron.job where jobname = job_name returning true $$;
create schema net;
create table net.llamadas (id serial primary key, url text, headers jsonb, body jsonb);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $$
  insert into net.llamadas (url, headers, body) values (url, headers, body) returning id $$;
create schema vault;
create table vault.decrypted_secrets (name text, decrypted_secret text);
insert into vault.decrypted_secrets values ('cron_internal_token', 'token-del-cron');
`;

// Las bajas se marcan con un UPDATE de deleted_at, como la edge: así corre el
// trigger de verdad y revoca la credencial con su now().
const DATOS = `
insert into auth.users values
  ('${ANA}', 'ana@maven-ai.me'), ('${BETO}', 'beto@maven-ai.me'), ('${CARLA}', 'carla@unlok.me'),
  ('${DANI}', 'dani@maven-ai.me'), ('${EVA}', 'eva@maven-ai.me'), ('${FER}', 'fer@unlok.me');
insert into public.profiles (id, full_name) values
  ('${ANA}', 'Ana'), ('${BETO}', 'Beto'), ('${CARLA}', 'Carla'), ('${DANI}', 'Dani'), ('${EVA}', 'Eva'), ('${FER}', 'Fer');
-- Ana se cambió de correo hace un año: la casilla vieja quedó revocada entonces.
insert into public.mail_credentials (user_id, email_address, created_at, revoked_at) values
  ('${ANA}', 'ana.vieja@maven-ai.me', now() - interval '2 years', now() - interval '1 year'),
  ('${ANA}', 'ana@maven-ai.me', now() - interval '1 year', null),
  ('${DANI}', 'dani@maven-ai.me', now() - interval '1 year', null),
  ('${EVA}', 'eva@maven-ai.me', now() - interval '1 year', null);
update public.profiles set deleted_at = now() - interval '31 days' where id in ('${ANA}', '${BETO}', '${CARLA}');
update public.profiles set deleted_at = now() - interval '5 days' where id = '${DANI}';
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try {
    await db.exec("begin;\n" + sql + "\ncommit;");
  } catch (e) {
    await db.exec("rollback").catch(() => {});
    throw new Error(`${nombre} no carga: ${msg(e)}`);
  }
}
async function falla(db: PGlite, sql: string): Promise<string> {
  try {
    await db.exec("begin;\n" + sql + "\ncommit;");
    return "anduvo";
  } catch (e) {
    await db.exec("rollback").catch(() => {});
    return msg(e);
  }
}
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as Fila[];
const uno = async (db: PGlite, sql: string) => (await q(db, sql))[0];
const huella = async (db: PGlite) =>
  (await uno(db, `select md5(prosrc) as h from pg_proc where proname = 'app_purgar_cuentas_vencidas'`))?.h as string;

async function nueva(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(ESQUEMA);
  await aplicar(db, "cuentas_recuperables_30_dias", PAPELERA);
  await aplicar(db, "baja_revoca_credencial_de_correo", REVOCA);
  await aplicar(db, "purga_cuentas_vencidas", PURGA);
  await db.exec(DATOS);
  return db;
}

// ─── 0. Línea base: la purga de hoy se lleva el buzón sin dejar rastro ───────
{
  const db = await nueva();
  check((await huella(db)) === HUELLA_REPO, "línea base: la purga del repo tiene la huella que espera la guarda");
  await q(db, `select public.app_purgar_cuentas_vencidas(30, 50)`);
  const creds = await q(db, `select * from public.mail_credentials where user_id = '${ANA}'`);
  check(creds.length === 0, "línea base: después de purgar, ya no queda de dónde sacar el buzón de Ana");
  const ev = await uno(db, `select detalle from public.cuenta_eventos where user_id = '${ANA}' and accion = 'purgada'`);
  check(ev && !("casilla_zoho" in ev.detalle), "línea base: el evento de la purga no dice nada del buzón");
  await db.close();
}

const db = await nueva();
await aplicar(db, NOMBRE, MIG);

// ─── 1. Cuál es el buzón de cada cuenta ──────────────────────────────────────
{
  const casilla = async (id: string, dominio?: string) =>
    (await uno(db, `select public.app_casilla_de_la_cuenta('${id}'${dominio === undefined ? "" : `, '${dominio}'`}) as c`)).c;
  check((await casilla(ANA)) === "ana@maven-ai.me", "Ana (en la papelera): la credencial que revocó la baja, no la vieja");
  check((await casilla(BETO)) === "beto@maven-ai.me", "Beto (sin credencial, acceso @maven-ai.me): su acceso");
  check((await casilla(CARLA)) === null, "Carla (acceso @unlok.me, sin credencial): ninguno");
  check((await casilla(DANI)) === "dani@maven-ai.me", "Dani (5 días en la papelera): su credencial");
  check((await casilla(EVA)) === "eva@maven-ai.me", "Eva (activa): su credencial vigente");
  check((await casilla(FER)) === null, "Fer (activa, @unlok.me, sin credencial): ninguno");
  check((await casilla(BETO, "")) === null, "sin dominio del equipo no se usa el acceso");
  const revAna = await uno(db, `select revoked_at is not null as r from public.mail_credentials where user_id = '${ANA}' and email_address = 'ana@maven-ai.me'`);
  check(revAna.r === true, "el trigger de la baja revocó la credencial de Ana (y aun así es su buzón)");
}

// ─── 2. La purga automática encola ANTES de destruir ─────────────────────────
{
  const n = (await uno(db, `select public.app_purgar_cuentas_vencidas(30, 50) as n`)).n;
  check(n === 3, `purgó las tres vencidas (${n})`);
  const vivos = (await q(db, `select id from auth.users order by id`)).map((r) => r.id);
  check(vivos.join(",") === [DANI, EVA, FER].join(","), "Dani (5 días), Eva y Fer siguen");

  const cola = await q(db, `select * from public.buzones_por_borrar order by direccion`);
  check(cola.map((c) => c.direccion).join(",") === "ana@maven-ai.me,beto@maven-ai.me",
    `encoló los buzones de Ana y Beto, ni la casilla vieja ni Carla (${cola.map((c) => c.direccion).join(",")})`);
  const a = cola.find((c) => c.user_id === ANA)!;
  check(a.estado === "pendiente" && a.origen === "purga_automatica" && a.intentos === 0, "la fila de Ana: pendiente, del cron, sin intentos");
  const dif = (new Date(a.borrar_desde).getTime() - new Date(a.eliminada_el).getTime()) / 86_400_000;
  check(dif === 30, `borrar_desde = baja + 30 días (${dif})`);

  const ev = await uno(db, `select * from public.cuenta_eventos where id = '${a.evento_id}'`);
  check(ev?.accion === "purgada" && ev.user_id === ANA && ev.actor_email === "cron", "la fila apunta al evento 'purgada' de Ana");
  check(ev?.detalle.casilla_zoho === "ana@maven-ai.me" && ev.detalle.casilla_zoho_estado === "pendiente" &&
    ev.detalle.casilla_zoho_liberada === null, "el evento dice qué buzón quedó en cola");
  const evCarla = await uno(db, `select detalle from public.cuenta_eventos where user_id = '${CARLA}' and accion = 'purgada'`);
  check(evCarla?.detalle.casilla_zoho === null && /no tenía casilla/.test(evCarla.detalle.casilla_zoho_motivo),
    "Carla: el evento dice POR QUÉ no hay buzón");
  const credDani = await q(db, `select * from public.mail_credentials where user_id = '${DANI}'`);
  check(credDani.length === 1, "lo que está dentro de los 30 días no se toca");
}

// ─── 3. Si la purga de una cuenta falla, no queda nada a medias ──────────────
{
  await db.exec(`update public.profiles set full_name = 'EXPLOTA', deleted_at = now() - interval '40 days' where id = '${DANI}'`);
  const antes = (await uno(db, `select count(*)::int as n from public.buzones_por_borrar`)).n;
  const e = await falla(db, `select public.app_purgar_cuentas_vencidas(30, 50)`);
  check(/purga rota/.test(e), "la purga falla entera");
  const despues = (await uno(db, `select count(*)::int as n from public.buzones_por_borrar`)).n;
  const evento = await q(db, `select 1 from public.cuenta_eventos where user_id = '${DANI}' and accion = 'purgada'`);
  check(antes === despues && evento.length === 0, "ni fila en la cola ni evento: la transacción vuelve entera");
  await db.exec(`update public.profiles set full_name = 'Dani', deleted_at = now() - interval '5 days' where id = '${DANI}'`);
}

// ─── 4. Contexto y resultado ─────────────────────────────────────────────────
{
  const ctx = async (id: string, dir: string) =>
    (await uno(db, `select public.app_buzon_por_borrar_contexto('${id}', '${dir}') as c`)).c;
  const cAna = await ctx(ANA, "ana@maven-ai.me");
  check(cAna.perfil_existe === false && cAna.otra_cuenta_con_esa_direccion === false && cAna.credencial_activa_de_otra === false,
    "Ana purgada: sin perfil, nadie más con su dirección");
  const cDani = await ctx(DANI, "dani@maven-ai.me");
  check(cDani.perfil_existe === true && typeof cDani.deleted_at === "string" && !Number.isNaN(Date.parse(cDani.deleted_at)),
    "Dani en la papelera: perfil y fecha de baja legible desde JS");
  const cEva = await ctx(EVA, "eva@maven-ai.me");
  check(cEva.perfil_existe === true && cEva.deleted_at === null, "Eva activa (o recuperada): deleted_at null");

  // Alguien nuevo entra con la dirección de Beto, y Fer vincula la de Ana.
  await db.exec(`insert into auth.users values ('${P(7)}', 'Beto@maven-ai.me')`);
  await db.exec(`insert into public.mail_credentials (user_id, email_address) values ('${FER}', 'ana@maven-ai.me')`);
  check((await ctx(BETO, " beto@maven-ai.me")).otra_cuenta_con_esa_direccion === true, "dirección reusada como acceso (sin importar mayúsculas)");
  check((await ctx(ANA, "ana@maven-ai.me")).credencial_activa_de_otra === true, "dirección vinculada por otra cuenta");
  await db.exec(`delete from auth.users where id = '${P(7)}'; delete from public.mail_credentials where user_id = '${FER}' and email_address = 'ana@maven-ai.me'`);

  const a = await uno(db, `select * from public.buzones_por_borrar where user_id = '${ANA}'`);
  await q(db, `select public.app_buzon_por_borrar_resultado('${a.id}', 'pendiente', 'todavía no se cumplen los 30 días', false)`);
  let fila = await uno(db, `select * from public.buzones_por_borrar where id = '${a.id}'`);
  check(fila.intentos === 0 && fila.motivo === "todavía no se cumplen los 30 días" && fila.resuelto_el === null,
    "esperar el plazo anota el motivo y no gasta intentos");
  await q(db, `select public.app_buzon_por_borrar_resultado('${a.id}', 'pendiente', 'no se pudo listar la organización: TOKEN_EXPIRED')`);
  fila = await uno(db, `select * from public.buzones_por_borrar where id = '${a.id}'`);
  check(fila.intentos === 1 && fila.estado === "pendiente", "una falla sí gasta un intento");
  let ev = await uno(db, `select detalle from public.cuenta_eventos where id = '${a.evento_id}'`);
  check(ev.detalle.casilla_zoho_motivo === "no se pudo listar la organización: TOKEN_EXPIRED" && ev.detalle.casilla_zoho_liberada === null,
    "el motivo de la falla llega al evento 'purgada'");
  await q(db, `select public.app_buzon_por_borrar_resultado('${a.id}', 'borrado', null)`);
  fila = await uno(db, `select * from public.buzones_por_borrar where id = '${a.id}'`);
  ev = await uno(db, `select detalle from public.cuenta_eventos where id = '${a.evento_id}'`);
  check(fila.estado === "borrado" && fila.intentos === 2 && fila.resuelto_el !== null, "borrado: queda resuelto");
  check(ev.detalle.casilla_zoho_liberada === "ana@maven-ai.me" && ev.detalle.casilla_zoho_estado === "borrado" &&
    ev.detalle.casilla_zoho_motivo === null && ev.detalle.eliminada_el !== undefined,
    "el evento dice que se liberó, sin perder lo que ya tenía");
  check(/estado inválido/.test(await falla(db, `select public.app_buzon_por_borrar_resultado('${a.id}', 'cualquiera', null)`)), "estado inválido: error");
  check(/no existe la fila/.test(await falla(db, `select public.app_buzon_por_borrar_resultado(gen_random_uuid(), 'borrado', null)`)), "fila inexistente: error");
}

// ─── 5. Encolar es idempotente y no reabre lo borrado ────────────────────────
{
  const a = await uno(db, `select * from public.buzones_por_borrar where user_id = '${ANA}'`);
  const id = (await uno(db, `select public.app_encolar_buzon('${ANA}', 'ana@maven-ai.me', now(), 30, 'purga_manual', null) as id`)).id;
  const f = await uno(db, `select * from public.buzones_por_borrar where id = '${a.id}'`);
  check(id === a.id && f.estado === "borrado" && f.origen === "purga_automatica", "lo ya borrado no se reabre (y devuelve la misma fila)");

  const b = await uno(db, `select * from public.buzones_por_borrar where user_id = '${BETO}'`);
  await q(db, `select public.app_buzon_por_borrar_resultado('${b.id}', 'no_se_borra', 'la dirección la usa otra cuenta')`);
  const id2 = (await uno(db, `select public.app_encolar_buzon('${BETO}', ' beto@maven-ai.me ', now() - interval '2 days', 30, 'purga_manual', null) as id`)).id;
  const g = await uno(db, `select * from public.buzones_por_borrar where id = '${b.id}'`);
  check(id2 === b.id && g.estado === "pendiente" && g.intentos === 0 && g.motivo === null && g.origen === "purga_manual",
    "una que no se borró se reabre con los datos nuevos (y la dirección sin espacios cae en la misma fila)");
  check((await uno(db, `select public.app_encolar_buzon('${FER}', '  ', now(), 30, 'purga_manual', null) as id`)).id === null,
    "sin dirección no se encola nada");
  check(/p_dias/.test(await falla(db, `select public.app_encolar_buzon('${FER}', 'x@maven-ai.me', now(), 0, 'purga_manual', null)`)), "p_dias 0: error");
  check(/origen/.test(await falla(db, `select public.app_encolar_buzon('${FER}', 'x@maven-ai.me', now(), 30, 'a_mano', null)`)), "origen desconocido: error");
}

// ─── 6. El cron: solo despierta a la edge si hay algo vencido ────────────────
{
  const job = await uno(db, `select * from cron.job where jobname = 'borrar-buzones-vencidos'`);
  check(job?.schedule === "20 7 * * *", "el cron corre 07:20 UTC, después de la purga (07:00)");
  const purga = await uno(db, `select * from cron.job where jobname = 'purgar-cuentas-vencidas'`);
  check(purga?.command.includes("app_purgar_cuentas_vencidas(30, 50)"), "la purga sigue programada igual");
  const correr = async () => {
    await db.exec(`delete from net.llamadas`);
    await db.exec(job.command);
    return await q(db, `select * from net.llamadas`);
  };
  // Beto quedó pendiente pero con baja de hace 2 días: todavía no vence.
  check((await correr()).length === 0, "nada vencido: no llama a la edge");
  await db.exec(`update public.buzones_por_borrar set borrar_desde = now() - interval '1 minute' where user_id = '${BETO}'`);
  const llamadas = await correr();
  check(llamadas.length === 1 && llamadas[0].url.endsWith("/functions/v1/buzones-por-borrar") &&
    llamadas[0].headers["X-Cron-Token"] === "token-del-cron", "con algo vencido: una llamada, con X-Cron-Token");
}

// ─── 7. Permisos ─────────────────────────────────────────────────────────────
{
  const fns = [
    "app_casilla_de_la_cuenta(uuid, text)",
    "app_encolar_buzon(uuid, text, timestamptz, int, text, uuid)",
    "app_buzon_por_borrar_contexto(uuid, text)",
    "app_buzon_por_borrar_resultado(uuid, text, text, boolean)",
    "app_purgar_cuentas_vencidas(int, int)",
  ];
  for (const fn of fns) {
    const p = await uno(db, `select has_function_privilege('anon', 'public.${fn}', 'EXECUTE') as anon,
      has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE') as auth,
      has_function_privilege('service_role', 'public.${fn}', 'EXECUTE') as srv`);
    check(p.anon === false && p.auth === false && p.srv === true, `${fn}: solo service_role`);
  }
  const t = await uno(db, `select has_table_privilege('authenticated', 'public.buzones_por_borrar', 'INSERT') as ins,
    has_table_privilege('authenticated', 'public.buzones_por_borrar', 'UPDATE') as upd,
    has_table_privilege('authenticated', 'public.buzones_por_borrar', 'DELETE') as del,
    has_table_privilege('anon', 'public.buzones_por_borrar', 'INSERT') as anon_ins`);
  check(!t.ins && !t.upd && !t.del && !t.anon_ins, "nadie desde el navegador escribe en la cola");
  const rls = await uno(db, `select relrowsecurity as r from pg_class where oid = 'public.buzones_por_borrar'::regclass`);
  check(rls.r === true, "la cola tiene RLS");
  const defs = await q(db, `select proname, prosecdef from pg_proc where proname in
    ('app_casilla_de_la_cuenta', 'app_encolar_buzon', 'app_buzon_por_borrar_contexto', 'app_buzon_por_borrar_resultado', 'app_purgar_cuentas_vencidas')`);
  check(defs.length === 5 && defs.every((d) => d.prosecdef), "las cinco son SECURITY DEFINER (la purga corre como el cron)");
}

// ─── 8. Vuelta atrás, reaplicar sobre prod, y la guarda ──────────────────────
{
  await aplicar(db, "vuelta atrás", VUELTA);
  check((await huella(db)) === HUELLA_PROD, "la vuelta atrás deja la purga con la huella EXACTA de prod");
  const queda = await q(db, `select 1 from pg_class where relname = 'buzones_por_borrar'
    union all select 1 from pg_proc where proname in ('app_casilla_de_la_cuenta', 'app_encolar_buzon', 'app_buzon_por_borrar_contexto', 'app_buzon_por_borrar_resultado')
    union all select 1 from cron.job where jobname = 'borrar-buzones-vencidos'`);
  check(queda.length === 0, "y se lleva la cola, las funciones y el cron");
  await aplicar(db, `${NOMBRE} sobre la purga de prod`, MIG);
  check((await huella(db)) !== HUELLA_PROD, "la migración se aplica sobre la purga tal como está en prod");
  await aplicar(db, `${NOMBRE} dos veces`, MIG.replace(/do \$\$[\s\S]*?end \$\$;/, ""));
  check(true, "y es re-aplicable (sin la guarda, que ya no reconoce la purga nueva a propósito)");

  await db.exec(`create or replace function public.app_purgar_cuentas_vencidas(p_dias int default 30, p_tope int default 50)
    returns int language sql as $$ select 0 $$`);
  const e = await falla(db, MIG);
  check(/cambió en la base/.test(e), "con otra purga en la base, la guarda frena antes de tocar nada");
}

await db.close();

for (const m of ok) console.log(`  ✓ ${m}`);
for (const m of mal) console.log(`  ✗ ${m}`);
console.log(`\n${ok.length} bien, ${mal.length} mal`);
if (mal.length) Deno.exit(1);
