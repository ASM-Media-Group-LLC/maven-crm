// La base de las agencias (migración 20261001150000_agencias_base.sql), probada
// contra un Postgres de verdad (PGlite) cargado con el esquema de PROD: el mismo
// fixture del banco del Messenger (fixtures/prod_chat_api_20260928.sql) más
// 20260930230000_chat_agencia_y_huecos, que prod ya tiene aplicada desde el 01/10.
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/agencias_base.ts
//
// Cada cosa se prueba dos veces con el mismo pedido: sobre prod de hoy (tiene que
// ANDAR: es la línea base, y si no anda el test no prueba nada) y con la
// migración. Las agencias del ensayo son DOS: con una sola, una prueba de
// aislamiento no puede fallar.
//
// Lo que NO prueba (y por qué): el alta de verdad por GoTrue. GoTrue escribe
// app_metadata DESPUÉS del INSERT en auth.users, y eso no se reproduce aquí; por
// eso la migración no lee app_metadata y la agencia la pone admin-user-actions.
// Lo que sí se ensaya es lo que esa función le pide a la base (§3).
//
// Sale con código 1 si algo falla. Corre en el guard de cada PR.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FIXTURE = leer("./fixtures/prod_chat_api_20260928.sql");
const CHAT = leer("../migrations/20260930230000_chat_agencia_y_huecos.sql");
const NOMBRE = "20261001150000_agencias_base.sql";
const MIG = leer(`../migrations/${NOMBRE}`);
const VUELTA = MIG.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);

// ─── Gente y agencias del ensayo ─────────────────────────────────────────────
const T1 = "10000000-0000-4000-8000-000000000001"; // asm-tech
const T2 = "10000000-0000-4000-8000-000000000002"; // otra agencia
const JHON = "a0000000-0000-4000-8000-000000000001"; // jhon.lopez@maven-ai.me: el super admin
const ANA = "a0000000-0000-4000-8000-000000000002";
const NUEVA = "a0000000-0000-4000-8000-000000000003"; // la cuenta que se crea durante el ensayo
const OTRA = "a0000000-0000-4000-8000-000000000004"; // otra cuenta nueva

const SEMILLA = `
insert into public.tenants(id, slug, name) values ('${T1}', 'asm-tech', 'ASM Tech');
insert into auth.users(id, email, raw_user_meta_data) values
  ('${JHON}', 'Jhon.Lopez@maven-ai.me', '{"full_name":"Jhon Lopez"}'),
  ('${ANA}', 'ana@ejemplo.test', '{"full_name":"Ana Ruiz"}');
`;
// La segunda agencia nace DESPUÉS de la migración del chat, que exige que haya una sola.
const SEGUNDA = `insert into public.tenants(id, slug, name) values ('${T2}', 'otra', 'Otra agencia');`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}
type Modo = "prod" | "con";
async function nueva(modo: Modo, antes = ""): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(SEMILLA + antes);
  await aplicar(db, "20260930230000_chat_agencia_y_huecos.sql", CHAT);
  await db.exec(SEGUNDA);
  if (modo === "con") await aplicar(db, NOMBRE, MIG);
  return db;
}
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as Fila[];
const uno = async (db: PGlite, sql: string) => (await q(db, sql))[0];

// Un pedido como lo manda PostgREST: una transacción, el rol y los claims del JWT.
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
async function anda(db: PGlite, quien: Quien, sql: string, m: string): Promise<Fila[] | null> {
  try { const r = await como(db, quien, sql); ok.push(m); return r; }
  catch (e) { mal.push(`${m} (falló: ${msg(e).slice(0, 160)})`); return null; }
}
async function falla(db: PGlite, quien: Quien, sql: string, patron: RegExp, m: string) {
  try { await como(db, quien, sql); mal.push(`${m} (NO falló)`); }
  catch (e) { const t = msg(e); check(patron.test(t), `${m} → ${t.slice(0, 110)}`); }
}
const membresias = async (db: PGlite, uid: string) =>
  (await q(db, `select tenant_id::text t from public.tenant_members where user_id = '${uid}' order by created_at`)).map((f) => f.t);
const altaDe = (uid: string, email: string) =>
  `insert into auth.users(id, email, raw_user_meta_data) values ('${uid}', '${email}', '{"full_name":"Cuenta Nueva"}')`;

const prod = await nueva("prod");
const con = await nueva("con");

// ════ 1. El alta ya no mete a nadie en asm-tech ══════════════════════════════
{
  await prod.exec(altaDe(NUEVA, "nueva@ejemplo.test"));
  check(JSON.stringify(await membresias(prod, NUEVA)) === JSON.stringify([T1]),
    "línea base: en prod, toda cuenta nueva cae sola en asm-tech");

  await con.exec(altaDe(NUEVA, "nueva@ejemplo.test"));
  const p = await uno(con, `select p.full_name n, (select string_agg(role, ',') from user_roles where user_id = p.id) r from profiles p where p.id = '${NUEVA}'`);
  check(p?.n === "Cuenta Nueva" && p?.r === "employee", `con la migración, el alta sigue creando el perfil con su nombre y el rol (${JSON.stringify(p)})`);
  check((await membresias(con, NUEVA)).length === 0, "y ya no la mete en ninguna agencia");
  const sin = await como(con, NUEVA, `select public.current_tenant_id()::text t`);
  check(sin[0]?.t === null, "sin agencia, current_tenant_id() da NULL (no adivina)");
}

// ════ 2. Una persona, una agencia ════════════════════════════════════════════
{
  const r = await (async () => { try { await como(prod, "postgres", `insert into public.tenant_members(user_id, tenant_id) values ('${ANA}', '${T2}')`); return "anduvo"; } catch (e) { return msg(e); } })();
  check(r === "anduvo", `línea base: en prod, una persona puede estar en dos agencias (${r.slice(0, 80)})`);

  await falla(con, "postgres", `insert into public.tenant_members(user_id, tenant_id) values ('${ANA}', '${T2}')`, /tenant_members_una_agencia/,
    "con la migración, Ana (asm-tech) no puede sumarse a otra agencia, ni como superusuario");
  await falla(con, "service_role", `insert into public.tenant_members(user_id, tenant_id) values ('${ANA}', '${T2}')`, /tenant_members_una_agencia/,
    "ni con service_role");
  await falla(con, ANA, `insert into public.tenant_members(user_id, tenant_id) values ('${ANA}', '${T2}')`, /row-level security|permission denied/,
    "y una persona no se mete sola en una agencia desde la app");
  const c = await como(con, ANA, `select public.current_tenant_id()::text t`);
  check(c[0]?.t === T1, "current_tenant_id() de Ana sigue siendo asm-tech");
}

// ════ 3. Lo que hace admin-user-actions al crear una cuenta ══════════════════
// Inserta (persona, agencia de quien crea) con ON CONFLICT (user_id, tenant_id)
// DO NOTHING y relee. Si lo que quedó no es esa agencia, deshace el alta.
{
  const PONER = (uid: string, t: string) =>
    `insert into public.tenant_members(user_id, tenant_id) values ('${uid}', '${t}') on conflict (user_id, tenant_id) do nothing`;

  // Línea base: con el handle_new_user de prod la cuenta ya está en asm-tech; un
  // admin de asm-tech la "pone" y no pasa nada. Un admin de la otra agencia la deja
  // en DOS: el agujero que la migración cierra.
  await prod.exec(altaDe(OTRA, "otra@ejemplo.test"));
  await anda(prod, "service_role", PONER(OTRA, T2), "línea base: un admin de la otra agencia crea una cuenta (prod)");
  check((await membresias(prod, OTRA)).length === 2, "línea base: en prod esa cuenta queda en asm-tech Y en la otra agencia");

  // Con la migración: la cuenta nace sin agencia y queda SOLO en la de quien la crea.
  await con.exec(altaDe(OTRA, "otra@ejemplo.test"));
  await anda(con, "service_role", PONER(OTRA, T2), "con la migración, el admin de la otra agencia le pone su agencia");
  check(JSON.stringify(await membresias(con, OTRA)) === JSON.stringify([T2]), "y queda solo en esa agencia");
  const t = await como(con, OTRA, `select public.current_tenant_id()::text t`);
  check(t[0]?.t === T2, "su current_tenant_id() es la otra agencia");
  await anda(con, "service_role", PONER(OTRA, T2), "repetir el pedido no rompe nada (ON CONFLICT)");
  check((await membresias(con, OTRA)).length === 1, "y no duplica la membresía");
  // Una cuenta que ya es de otra agencia: el pedido falla y la función deshace el alta.
  await falla(con, "service_role", PONER(ANA, T2), /tenant_members_una_agencia/,
    "poner en la otra agencia a alguien que ya es de asm-tech falla (la función lo lee como error y deshace el alta)");
  check(JSON.stringify(await membresias(con, ANA)) === JSON.stringify([T1]), "y Ana sigue solo en asm-tech");
}

// ════ 4. El super admin de la plataforma ═════════════════════════════════════
{
  const r = await (async () => { try { await como(prod, JHON, `select public.es_admin_de_plataforma() si`); return "existe"; } catch (e) { return msg(e); } })();
  check(/does not exist/.test(r), `línea base: en prod no hay super admin (${r.slice(0, 80)})`);

  const sembrado = await q(con, `select user_id::text u from public.plataforma_admins`);
  check(sembrado.length === 1 && sembrado[0].u === JHON, `la migración siembra a jhon.lopez@maven-ai.me, aunque el correo esté con mayúsculas (${JSON.stringify(sembrado)})`);
  check((await como(con, JHON, `select public.es_admin_de_plataforma() si`))[0]?.si === true, "Jhon es super admin");
  check((await como(con, ANA, `select public.es_admin_de_plataforma() si`))[0]?.si === false, "Ana no");
  check((await como(con, "service_role", `select public.es_admin_de_plataforma() si`))[0]?.si === false, "sin persona (service_role) da false, no true");
  await falla(con, "anon", `select public.es_admin_de_plataforma()`, /permission denied/, "anon no la puede llamar");
  await falla(con, ANA, `select * from public.plataforma_admins`, /permission denied/, "la tabla no se lee desde la app");
  await falla(con, JHON, `select * from public.plataforma_admins`, /permission denied/, "ni siquiera el propio super admin (se pregunta con la función)");
  await falla(con, ANA, `insert into public.plataforma_admins(user_id) values ('${ANA}')`, /permission denied/, "nadie se hace super admin desde la app");
  await falla(con, "anon", `select * from public.plataforma_admins`, /permission denied/, "anon tampoco la lee");
  // Borrar la cuenta se lleva la fila.
  await con.exec(`insert into public.plataforma_admins(user_id) values ('${NUEVA}'); delete from auth.users where id = '${NUEVA}'`);
  check((await q(con, `select 1 from public.plataforma_admins where user_id = '${NUEVA}'`)).length === 0, "borrar la cuenta se lleva su fila de super admin");
}

// ════ 5. La migración no corre si alguien está en dos agencias ═══════════════
{
  const db = await nueva("prod");
  await db.exec(`insert into public.tenant_members(user_id, tenant_id) values ('${ANA}', '${T2}')`);
  const r = await (async () => { try { await aplicar(db, NOMBRE, MIG); return "aplicó"; } catch (e) { return msg(e); } })();
  check(/1 persona\(s\) en más de una agencia/.test(r), `con alguien en dos agencias, la migración se niega y no deja nada a medias (${r.slice(0, 120)})`);
  const quedo = await uno(db, `select (select count(*)::int from pg_constraint where conname = 'tenant_members_una_agencia') c, to_regclass('public.plataforma_admins') is not null t`);
  check(quedo?.c === 0 && quedo?.t === false, `y no quedó ni la restricción ni la tabla (${JSON.stringify(quedo)})`);
}

// ════ 6. La vuelta atrás ═════════════════════════════════════════════════════
{
  const db = await nueva("con");
  await aplicar(db, "vuelta atrás", VUELTA);
  check(true, "la vuelta atrás corre sobre la base con la migración");
  const v = await uno(db, `select (select count(*)::int from pg_constraint where conname = 'tenant_members_una_agencia') c,
    to_regclass('public.plataforma_admins') is null t, to_regprocedure('public.es_admin_de_plataforma()') is null f`);
  check(v?.c === 0 && v?.t === true && v?.f === true, `se fueron la restricción, la tabla y la función (${JSON.stringify(v)})`);
  await db.exec(altaDe(NUEVA, "nueva@ejemplo.test"));
  check(JSON.stringify(await membresias(db, NUEVA)) === JSON.stringify([T1]), "y el alta vuelve a meter la cuenta en asm-tech, como en prod");
  await aplicar(db, "vuelta atrás (otra vez)", VUELTA);
  check(true, "la vuelta atrás se puede correr dos veces");
  await db.exec(`delete from auth.users where id = '${NUEVA}'`);
  await aplicar(db, NOMBRE + " (otra vez)", MIG);
  check((await q(db, `select 1 from public.plataforma_admins where user_id = '${JHON}'`)).length === 1, "después de la vuelta atrás, la migración se puede volver a aplicar");
}

for (const m of ok) console.log(`✓ ${m}`);
for (const m of mal) console.log(`✗ ${m}`);
console.log(`\n${ok.length} ok${mal.length ? `, ${mal.length} MAL` : ""}`);
if (mal.length) Deno.exit(1);
