// Las personas por agencia (migraciones 20261001212000_personas_por_agencia.sql y
// 20261001212100_personas_karma_y_directorio.sql), probadas contra un Postgres de
// verdad (PGlite) con el catálogo de PROD: los fixtures del Messenger (28/09) y de
// la escritura por API (01/10, que trae get_karma_profile y send_karma tal como
// están en prod), más mail_recipient_directory copiada de prod con su huella.
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/personas_por_agencia.ts
//
// Cada cosa se prueba dos veces con el mismo pedido: sobre prod de hoy (la línea
// base: tiene que estar ABIERTA, si no el test no prueba nada) y con las
// migraciones. Las agencias del ensayo son dos. Además, con una sola agencia, lo
// que ve cada persona tiene que ser lo mismo que en prod.
//
// Sale con código 1 si algo falla. Corre en el guard de cada PR.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const CHAT = leer("./fixtures/prod_chat_api_20260928.sql");
const API = leer("./fixtures/prod_api_escritura_20261001.sql");
const N1 = "20261001212000_personas_por_agencia.sql";
const N2 = "20261001212100_personas_karma_y_directorio.sql";
const M1 = leer(`../migrations/${N1}`);
const M2 = leer(`../migrations/${N2}`);
const vuelta = (sql: string) => sql.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");

// mail_recipient_directory, copia textual de prod (01/10). Lo que lee y los
// fixtures no traen: auth.users.deleted_at y email_role_groups.
const HUELLA_DIRECTORIO = "7a1992863df1a22bd6aab276ad28f24c";
const DIRECTORIO = `
alter table auth.users add column deleted_at timestamp with time zone;
create table public.email_role_groups (role text primary key, group_email text, group_name text, enabled boolean default true, zgid text);
CREATE OR REPLACE FUNCTION public.mail_recipient_directory()
 RETURNS TABLE(email text, nombre text, tipo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with permitido as (
    select 1 from public.mail_credentials
    where user_id = auth.uid() and revoked_at is null
    limit 1
  )
  -- Compañeros (excluye al que llama: uno no se escribe a sí mismo desde el "Para")
  select lower(u.email)::text,
         coalesce(nullif(btrim(p.full_name), ''), split_part(u.email, '@', 1))::text,
         'persona'::text
  from auth.users u
  join public.profiles p on p.id = u.id
  where exists (select 1 from permitido)
    and u.deleted_at is null
    and u.email is not null
    and (lower(u.email) like '%@maven-ai.me' or lower(u.email) like '%@unlok.me')
    and u.id <> auth.uid()
  union all
  -- Listas de distribución por rol, solo las que existen de verdad en Zoho
  select lower(g.group_email)::text, g.group_name::text, 'grupo'::text
  from public.email_role_groups g
  where exists (select 1 from permitido)
    and g.enabled
    and g.zgid is not null
$function$;
`;

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);

const T1 = "10000000-0000-4000-8000-000000000001"; // asm-tech
const T2 = "10000000-0000-4000-8000-000000000002"; // otra agencia
const P = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [JHON, ANA, BETO] = [1, 2, 3].map(P);
const [OLGA, PEPE] = [11, 12].map(P);
const SIN = P(20);

const SEMILLA = `
insert into public.tenants(id, slug, name) values ('${T1}', 'asm-tech', 'ASM Tech');
insert into auth.users(id, email, raw_user_meta_data) values
  ('${JHON}', 'jhon.lopez@maven-ai.me', '{"full_name":"Jhon Lopez"}'),
  ('${ANA}', 'ana.ruiz@maven-ai.me', '{"full_name":"Ana Ruiz"}'),
  ('${BETO}', 'beto.paz@maven-ai.me', '{"full_name":"Beto Paz"}');
insert into public.role_groups (role_name, is_admin, is_manager_or_above, is_supervisor_or_above) values ('admin', true, true, true) on conflict do nothing;
update public.user_roles set role = 'admin' where user_id = '${JHON}';
insert into public.mail_credentials (user_id, email_address) values ('${ANA}', 'ana.ruiz@maven-ai.me'), ('${OLGA}', 'olga@maven-ai.me');
insert into public.email_role_groups (role, group_email, group_name, zgid) values ('Chatter', 'chatters@maven-ai.me', 'Chatters', 'z1');
`;
// La otra agencia entra después (así se puede medir antes «una sola agencia»).
const OTRA = `
insert into public.tenants(id, slug, name) values ('${T2}', 'otra', 'Otra agencia');
insert into auth.users(id, email, raw_user_meta_data) values
  ('${OLGA}', 'olga@maven-ai.me', '{"full_name":"Olga Vera"}'),
  ('${PEPE}', 'pepe@maven-ai.me', '{"full_name":"Pepe Gil"}'),
  ('${SIN}', 'sin@maven-ai.me', '{"full_name":"Sin Agencia"}');
-- handle_new_user los metió en asm-tech (como a toda cuenta nueva en prod): se los pasa a la suya.
delete from public.tenant_members where user_id in ('${OLGA}', '${PEPE}', '${SIN}');
insert into public.tenant_members(user_id, tenant_id) values ('${OLGA}', '${T2}'), ('${PEPE}', '${T2}');
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}
type Modo = "prod" | "con";
async function nueva(modo: Modo, antes = ""): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(CHAT);
  await db.exec(API);
  await db.exec(DIRECTORIO);
  await db.exec(SEMILLA + antes);
  if (modo === "con") { await aplicar(db, N1, M1); await aplicar(db, N2, M2); }
  return db;
}
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as Fila[];
const uno = async (db: PGlite, sql: string) => (await q(db, sql))[0];
type Quien = string | "service_role" | "anon" | "postgres";
async function como(db: PGlite, quien: Quien, sql: string): Promise<Fila[]> {
  await db.exec("begin");
  try {
    await db.exec("reset role");
    if (quien !== "postgres") {
      const servicio = quien === "service_role" || quien === "anon";
      const claims = servicio ? { role: quien } : { sub: quien, role: "authenticated" };
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await db.exec(`set local role ${servicio ? quien : "authenticated"}`);
    }
    const rs = await db.exec(sql);
    await db.exec("commit");
    return (rs.at(-1)?.rows ?? []) as Fila[];
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
async function falla(db: PGlite, quien: Quien, sql: string, patron: RegExp, m: string) {
  try { await como(db, quien, sql); mal.push(`${m} (NO falló)`); }
  catch (e) { const t = msg(e); check(patron.test(t), `${m} → ${t.slice(0, 110)}`); }
}
const intento = async (f: () => Promise<unknown>) => { try { await f(); return "anduvo"; } catch (e) { return msg(e); } };
const ids = (fs: Fila[], k = "id") => fs.map((f) => f[k]).sort();
const huellaDe = async (db: PGlite, f: string) => (await uno(db, `select md5(prosrc) h from pg_proc where oid = '${f}'::regprocedure`))?.h;

// ════ 0. Los fixtures son prod ═══════════════════════════════════════════════
{
  const db = await nueva("prod");
  check(await huellaDe(db, "public.mail_recipient_directory()") === HUELLA_DIRECTORIO, "mail_recipient_directory es la de prod (huella)");
  check(await huellaDe(db, "public.get_karma_profile(uuid)") === "1aa22eb9f32d548fa57475c3032a980e", "get_karma_profile es la de prod (huella)");
  check(await huellaDe(db, "public.send_karma(uuid)") === "b084b3561f41bb7c013e67de4f897f7d", "send_karma es la de prod (huella)");
}

// ════ 1. Con una sola agencia, todos ven lo mismo que en prod ════════════════
const VISTAS = (db: PGlite, u: string) => como(db, u, `select
  (select coalesce(jsonb_agg(id order by id), '[]') from public.profiles) perfiles,
  (select coalesce(jsonb_agg(email order by email), '[]') from public.mail_recipient_directory()) para,
  public.get_karma_profile('${BETO}') - 'vote_pct' karma_beto`);
{
  const p = await nueva("prod"), c = await nueva("con");
  for (const [n, u] of [["jhon", JHON], ["ana", ANA], ["beto", BETO]]) {
    const a = (await VISTAS(p, u))[0], b = (await VISTAS(c, u))[0];
    check(JSON.stringify(a) === JSON.stringify(b), `${n}: con una sola agencia ve los mismos perfiles, el mismo «Para» y el mismo karma que en prod`);
  }
  const a = (await VISTAS(p, JHON))[0];
  check(a.perfiles.length === 3 && a.karma_beto?.name === "Beto Paz", `y no es una comparación vacía (${a.perfiles.length} perfiles, karma de ${a.karma_beto?.name})`);
}

// ════ 2. Dos agencias ═════════════════════════════════════════════════════════
const prod = await nueva("prod", OTRA);
const con = await nueva("con", OTRA);

// 2.1 Los perfiles
{
  const b = await como(prod, ANA, `select id from public.profiles`);
  check(b.some((f) => f.id === OLGA), `línea base: en prod Ana (asm-tech) ve el perfil de Olga (otra agencia) — ve ${b.length}`);
  const a = await como(con, ANA, `select id from public.profiles`);
  check(JSON.stringify(ids(a)) === JSON.stringify([JHON, ANA, BETO].sort()), `con las migraciones, Ana ve solo a la gente de asm-tech (${a.length})`);
  const o = await como(con, OLGA, `select id from public.profiles`);
  check(JSON.stringify(ids(o)) === JSON.stringify([OLGA, PEPE].sort()), `y Olga solo a la de la suya (${o.length})`);
  const s = await como(con, SIN, `select id from public.profiles`);
  check(s.length === 1 && s[0].id === SIN, "una cuenta sin agencia ve solo su propio perfil");
  const sr = await como(con, "service_role", `select count(*)::int n from public.profiles`);
  check(sr[0]?.n === 6, `service_role (las edge functions) sigue viendo todo (${sr[0]?.n})`);
  const join = await como(con, ANA, `select p.id from public.profiles p where p.id = '${OLGA}'`);
  check(join.length === 0, "ni pidiéndolo por id");
  await como(con, ANA, `update public.profiles set status = 'busy' where id = '${ANA}'`);
  check((await uno(con, `select status from public.profiles where id = '${ANA}'`))?.status === "busy", "Ana sigue cambiando su propio perfil");
  const g = await como(con, ANA, `select array_agg(x order by x) a from public.gente_de_mi_agencia() x`);
  check(JSON.stringify(g[0]?.a) === JSON.stringify([JHON, ANA, BETO].sort()), "gente_de_mi_agencia() da la gente de la agencia de quien llama");
  await falla(con, "anon", `select public.gente_de_mi_agencia()`, /permission denied/, "anon no la puede llamar");
  const pol = await uno(con, `select policyname from pg_policies where tablename = 'profiles' and cmd = 'SELECT'`);
  check(pol?.policyname === "Profiles de la propia agencia", `la política se llama por lo que hace (${pol?.policyname})`);
}

// 2.2 El «Para» del Correo
{
  const b = await como(prod, ANA, `select email from public.mail_recipient_directory()`);
  check(b.some((f) => f.email === "olga@maven-ai.me"), "línea base: en prod el «Para» de Ana le sugiere a Olga, de otra agencia");
  const a = await como(con, ANA, `select email, tipo from public.mail_recipient_directory() order by email`);
  const personas = a.filter((f) => f.tipo === "persona").map((f) => f.email);
  check(JSON.stringify(personas) === JSON.stringify(["beto.paz@maven-ai.me", "jhon.lopez@maven-ai.me"]), `con las migraciones, solo su gente (${personas.join(", ")})`);
  check(a.some((f) => f.tipo === "grupo"), "las listas por rol siguen apareciendo (se separan con el correo por agencia, 2b)");
}

// 2.3 El karma
{
  const b = await como(prod, ANA, `select public.get_karma_profile('${OLGA}') r`);
  check(b[0]?.r?.name === "Olga Vera" && b[0]?.r?.email === "olga@maven-ai.me", "línea base: en prod Ana ve el nombre y el correo de Olga en su karma");
  const a = await como(con, ANA, `select public.get_karma_profile('${OLGA}') r`);
  check(a[0]?.r?.error === "not_found" && !a[0]?.r?.name, `con las migraciones, el karma de alguien de otra agencia «no existe» (${JSON.stringify(a[0]?.r)})`);
  const propio = await como(con, ANA, `select public.get_karma_profile('${BETO}') r`);
  check(propio[0]?.r?.name === "Beto Paz", "el de su gente sigue andando");
  const yo = await como(con, ANA, `select public.get_karma_profile('${ANA}') r`);
  check(yo[0]?.r?.name === "Ana Ruiz" && yo[0]?.r?.is_self === true, "y el propio también");
  const be = await como(prod, JHON, `select public.get_karma_profile('${BETO}') r`);
  const ce = await como(con, JHON, `select public.get_karma_profile('${BETO}') r`);
  check(be[0]?.r?.admin?.eligible === 5 && ce[0]?.r?.admin?.eligible === 2,
    `los «elegibles» del karma se cuentan en la agencia (prod ${be[0]?.r?.admin?.eligible}, con las migraciones ${ce[0]?.r?.admin?.eligible})`);
  const bs = await como(prod, ANA, `select public.send_karma('${OLGA}') r`);
  check(bs[0]?.r?.name === "Olga Vera", "línea base: en prod Ana le manda karma a Olga");
  const cs = await como(con, ANA, `select public.send_karma('${OLGA}') r`);
  const n = await uno(con, `select count(*)::int n from public.karma_sends where recipient_id = '${OLGA}'`);
  check(cs[0]?.r?.error === "not_found" && n?.n === 0, `con las migraciones no (${JSON.stringify(cs[0]?.r)}), y no queda fila`);
  const cb = await como(con, ANA, `select public.send_karma('${BETO}') r`);
  check(cb[0]?.r?.name === "Beto Paz", "a su gente sí");
  await falla(con, "anon", `select public.get_karma_profile('${BETO}')`, /permission denied/, "los grants de karma_sin_anon siguen (anon no entra)");
}

// ════ 3. La vuelta atrás ══════════════════════════════════════════════════════
{
  const db = await nueva("con", OTRA);
  await aplicar(db, "vuelta atrás de " + N2, vuelta(M2));
  await aplicar(db, "vuelta atrás de " + N1, vuelta(M1));
  check(await huellaDe(db, "public.mail_recipient_directory()") === HUELLA_DIRECTORIO
    && await huellaDe(db, "public.get_karma_profile(uuid)") === "1aa22eb9f32d548fa57475c3032a980e"
    && await huellaDe(db, "public.send_karma(uuid)") === "b084b3561f41bb7c013e67de4f897f7d", "las tres funciones vuelven byte a byte a prod");
  const pol = await uno(db, `select policyname, qual from pg_policies where tablename = 'profiles' and cmd = 'SELECT'`);
  check(pol?.policyname === "Authenticated users can view all profiles" && pol?.qual === "true", `la política vuelve a ser la de prod (${pol?.policyname}: ${pol?.qual})`);
  const acl = await uno(db, `select proacl::text a from pg_proc where oid = 'public.get_karma_profile(uuid)'::regprocedure`);
  check(!/anon/.test(acl?.a ?? "") && /authenticated/.test(acl?.a ?? ""), `y los grants del karma siguen como los dejó karma_sin_anon (${acl?.a})`);
  await aplicar(db, N1 + " (otra vez)", M1);
  await aplicar(db, N2 + " (otra vez)", M2);
  check(true, "después de la vuelta atrás, se pueden volver a aplicar");
}

// ════ 4. Si prod no tiene el texto esperado, no corre ═════════════════════════
{
  const db = await nueva("prod", `create or replace function public.send_karma(target uuid) returns jsonb language plpgsql security definer set search_path to 'public' as $f$ begin return '{}'::jsonb; end $f$;`);
  await aplicar(db, N1, M1);
  const r = await intento(() => aplicar(db, N2, M2));
  check(/send_karma\(uuid\) el texto a reemplazar aparece 0/.test(r), `con un send_karma distinto del de prod, la migración se niega (${r.slice(-90)})`);
  check((await uno(db, `select to_regclass('public.personas_por_agencia_respaldo') is null v`))?.v === true, "y no deja nada a medias");
}

for (const m of ok) console.log(`✓ ${m}`);
for (const m of mal) console.log(`✗ ${m}`);
console.log(`\n${ok.length} ok${mal.length ? `, ${mal.length} MAL` : ""}`);
if (mal.length) Deno.exit(1);
