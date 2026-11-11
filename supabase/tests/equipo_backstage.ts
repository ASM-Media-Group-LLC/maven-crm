// Backstage manda el equipo (migración 20261111120000_backstage_equipo), probada contra
// un Postgres de verdad (PGlite). El fixture va aquí mismo: solo las tablas y funciones
// de prod que la migración usa, con sus columnas y sus cuerpos copiados de prod
// (11/11/2026), y DOS agencias, porque con una sola un fallo de aislamiento no se ve.
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/equipo_backstage.ts
//
//   1. La migración carga, y toda agencia nace en ensayo (aplicar = false).
//   2. La puerta: sin key (la app), key sin equipo:write, revocada, vencida, de otra
//      persona o de alguien que no es admin ni dueño → no pasa. anon no ejecuta nada.
//   3. Lo que Maven tiene: solo la agencia de la key, sin cuentas de creadoras, con
//      los protegidos y la papelera marcados.
//   4. Ensayo: valida todo pero no cambia nada; un envío igual suma repetición.
//   5. El interruptor lo cambia SOLO el dueño (RLS), y queda quién y cuándo.
//   6. Aplicar: rol, nivel, equipo, jefe, horario y papelera (con baneo, sesiones y
//      bitácora de la cuenta); nada de otra agencia; nadie sube a admin.
//   7. El freno de bajas y el ensayo pedido con el interruptor prendido.
//   8. La otra agencia: su key ve y toca solo lo suyo.
//   9. Las tablas: solo se leen (admins y dueños de la agencia), nunca se escriben a mano.
//
// Sale con código 1 si algo falla. Corre en el guard de cada PR.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const N = "20261111120000_backstage_equipo.sql";
const M = leer(`../migrations/${N}`);

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);

const T1 = "10000000-0000-4000-8000-000000000001"; // Kash
const T2 = "10000000-0000-4000-8000-000000000002"; // otra agencia
const P = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [DUENO, ADMIN, ANA, BETO, CARLA, DARIO, EVA, FEDE, SOFI] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(P);
const [OLGA, PEPE] = [11, 12].map(P); // la otra agencia: OLGA es su dueña
const K = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [K_DUENO, K_SIN_SCOPE, K_ANA, K_REVOCADA, K_VENCIDA, K_ADMIN, K_OLGA] = [1, 2, 3, 4, 5, 6, 7].map(K);

// ─── El fixture: lo de prod que la migración usa ─────────────────────────────
const FIXTURE = String.raw`
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb,
  banned_until timestamptz, deleted_at timestamptz, created_at timestamptz default now()
);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid);
create table auth.refresh_tokens (id bigserial primary key, user_id text);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;

create table public.tenants (id uuid primary key default gen_random_uuid(), slug text not null, name text not null,
  active boolean not null default true, created_at timestamptz not null default now());
create table public.tenant_members (user_id uuid not null, tenant_id uuid not null, role text not null default 'member',
  created_at timestamptz not null default now());
create table public.tenant_owners (tenant_id uuid not null, user_id uuid not null, created_at timestamptz not null default now());
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade, full_name text, created_at timestamptz default now(),
  deleted_at timestamptz, deleted_by uuid, nivel text, hora_entrada time, hora_salida time,
  constraint profiles_nivel_check check (nivel = any (array['dueno', 'admin', 'manager', 'supervisor', 'agente']))
);
create table public.user_roles (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  role text not null, tenant_id uuid references public.tenants(id) on delete cascade, unique (user_id, role));
create table public.roles_config (id uuid primary key default gen_random_uuid(), name text not null, is_active boolean default true,
  tenant_id uuid);
create table public.role_groups (role_name text not null, is_admin boolean not null default false, tenant_id uuid);
create table public.api_keys (id uuid primary key default gen_random_uuid(), name text not null default 'k', key_hash text not null default md5(random()::text),
  scopes text[] not null default '{}', revoked_at timestamptz, expires_at timestamptz, tenant_id uuid references public.tenants(id),
  acts_as_user_id uuid references auth.users(id) on delete cascade);
create table public.cuenta_eventos (id uuid primary key default gen_random_uuid(), user_id uuid, user_email text, user_full_name text,
  accion text check (accion = any (array['eliminada', 'restaurada', 'purgada'])), actor_id uuid, actor_email text, detalle jsonb,
  at timestamptz default now());

-- Los cuerpos, como en prod.
create function public.user_roles_agencia() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.tenant_id := (select tm.tenant_id from public.tenant_members tm where tm.user_id = new.user_id);
  return new;
end $$;
create trigger user_roles_agencia before insert or update on public.user_roles for each row execute function public.user_roles_agencia();

create function public.current_tenant_id() returns uuid language sql stable security definer set search_path to 'public' as $$
  SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() ORDER BY created_at ASC LIMIT 1 $$;
create function public.es_dueno(_user_id uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.tenant_owners o where o.user_id = _user_id) $$;
create function public.es_admin_o_dueno(_uid uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.es_dueno(_uid) or exists (select 1 from public.user_roles ur where ur.user_id = _uid and lower(ur.role) = 'admin'); $$;
create function public.is_in_role_group(_user_id uuid, _group text) returns boolean language sql stable security definer set search_path to 'public' as $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.role_groups rg ON rg.role_name = ur.role and rg.tenant_id = ur.tenant_id
    WHERE ur.user_id = _user_id AND CASE _group WHEN 'admin' THEN rg.is_admin ELSE false END); $$;
create function public.api_key_persona_vigente(_usuario uuid, _agencia uuid) returns boolean language sql stable security definer
  set search_path to 'public' as $$
  select exists (select 1 from public.profiles p where p.id = _usuario and p.deleted_at is null)
     and not exists (select 1 from auth.users u where u.id = _usuario and u.banned_until > now())
     and exists (select 1 from public.tenant_members tm where tm.user_id = _usuario and tm.tenant_id = _agencia); $$;
create function public.api_mvk() returns uuid language plpgsql stable set search_path to 'pg_catalog', 'pg_temp' as $$
declare
  _v text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'mvk';
begin
  if _v is null then return null; end if;
  if _v !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception using errcode = 'MV401', message = 'api_llave_invalida: el claim mvk no es un id de key', detail = '{"error": "unauthorized"}';
  end if;
  return _v::uuid;
end; $$;
create function public.app_revoke_user_sessions(p_user_id uuid) returns void language plpgsql security definer
  set search_path to 'public', 'auth', 'pg_temp' as $$
begin
  delete from auth.refresh_tokens where user_id = p_user_id::text;
  delete from auth.sessions where user_id = p_user_id;
end; $$;
`;

// Las agencias ANTES de la migración: la migración las tiene que dejar en ensayo.
const AGENCIAS = `insert into public.tenants (id, slug, name) values ('${T1}', 'kash', 'Kash Agency'), ('${T2}', 'otra', 'Otra agencia');`;

const GENTE = `
insert into auth.users (id, email, raw_app_meta_data) values
  ('${DUENO}', 'Dueno@Kash.test', '{}'), ('${ADMIN}', 'admin@kash.test', '{}'), ('${ANA}', 'ana@kash.test', '{}'),
  ('${BETO}', 'beto@kash.test', '{}'), ('${CARLA}', 'carla@kash.test', '{}'), ('${DARIO}', 'dario@kash.test', '{}'),
  ('${EVA}', 'eva@kash.test', '{}'), ('${FEDE}', 'fede@kash.test', '{}'), ('${SOFI}', 'sofi@gmail.test', '{"tipo":"creadora"}'),
  ('${OLGA}', 'olga@otra.test', '{}'), ('${PEPE}', 'pepe@otra.test', '{}');
insert into public.profiles (id, full_name, nivel, deleted_at) values
  ('${DUENO}', 'Dueño', 'dueno', null), ('${ADMIN}', 'Admin', 'admin', null), ('${ANA}', 'Ana', 'agente', null),
  ('${BETO}', 'Beto', 'supervisor', null), ('${CARLA}', 'Carla', 'agente', null), ('${DARIO}', 'Darío', 'agente', now()),
  ('${EVA}', 'Eva', 'agente', null), ('${FEDE}', 'Fede', null, null), ('${SOFI}', 'Sofi', null, null),
  ('${OLGA}', 'Olga', 'dueno', null), ('${PEPE}', 'Pepe', 'agente', null);
insert into public.tenant_members (user_id, tenant_id) values
  ('${DUENO}', '${T1}'), ('${ADMIN}', '${T1}'), ('${ANA}', '${T1}'), ('${BETO}', '${T1}'), ('${CARLA}', '${T1}'),
  ('${DARIO}', '${T1}'), ('${EVA}', '${T1}'), ('${FEDE}', '${T1}'), ('${SOFI}', '${T1}'),
  ('${OLGA}', '${T2}'), ('${PEPE}', '${T2}');
insert into public.tenant_owners (tenant_id, user_id) values ('${T1}', '${DUENO}'), ('${T2}', '${OLGA}');
insert into public.roles_config (name, tenant_id) values
  ('admin', '${T1}'), ('Chatter', '${T1}'), ('Chatter Supervisor', '${T1}'), ('Finanzas', '${T1}'), ('Jefazo', '${T1}'),
  ('admin', '${T2}'), ('Chatter', '${T2}'), ('Solo de la otra', '${T2}');
insert into public.roles_config (name, tenant_id, is_active) values ('Viejo', '${T1}', false);
insert into public.role_groups (role_name, is_admin, tenant_id) values
  ('admin', true, '${T1}'), ('Jefazo', true, '${T1}'), ('Chatter', false, '${T1}'), ('admin', true, '${T2}');
insert into public.user_roles (user_id, role) values
  ('${DUENO}', 'admin'), ('${ADMIN}', 'admin'), ('${ANA}', 'Chatter'), ('${BETO}', 'Chatter Supervisor'), ('${CARLA}', 'Chatter'),
  ('${DARIO}', 'Chatter'), ('${EVA}', 'Chatter'), ('${OLGA}', 'admin'), ('${PEPE}', 'Chatter');
insert into auth.sessions (user_id) values ('${CARLA}'), ('${EVA}');
insert into auth.refresh_tokens (user_id) values ('${CARLA}');
insert into public.api_keys (id, scopes, tenant_id, acts_as_user_id, revoked_at, expires_at) values
  ('${K_DUENO}', '{equipo:write}', '${T1}', '${DUENO}', null, null),
  ('${K_SIN_SCOPE}', '{employees:read}', '${T1}', '${DUENO}', null, null),
  ('${K_ANA}', '{equipo:write}', '${T1}', '${ANA}', null, null),
  ('${K_REVOCADA}', '{equipo:write}', '${T1}', '${DUENO}', now(), null),
  ('${K_VENCIDA}', '{equipo:write}', '${T1}', '${DUENO}', null, now() - interval '1 day'),
  ('${K_ADMIN}', '{equipo:write}', '${T1}', '${ADMIN}', null, null),
  ('${K_OLGA}', '{equipo:write}', '${T2}', '${OLGA}', null, null);
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}

/** Quién hace el pedido: una persona con la sesión de una key (como la arma public-api:
 *  mvf + mvk), una persona en la app (sin mvk), o anon. */
type Quien = { persona: string; key?: string } | "anon";
async function entrar(db: PGlite, quien: Quien) {
  await db.exec("reset role");
  const claims = quien === "anon"
    ? { role: "anon" }
    : { sub: quien.persona, role: "authenticated", ...(quien.key ? { mvf: true, mvk: quien.key } : {}) };
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
  await db.exec(`set local role ${quien === "anon" ? "anon" : "authenticated"}`);
}
async function como(db: PGlite, quien: Quien, sql: string, params: unknown[] = []): Promise<Fila[]> {
  await db.exec("begin");
  try {
    await entrar(db, quien);
    const r = await db.query(sql, params);
    await db.exec("commit");
    return r.rows as Fila[];
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
async function probar(db: PGlite, quien: Quien, sql: string, params: unknown[] = []): Promise<Fila[] | string> {
  try { return await como(db, quien, sql, params); }
  catch (e) { return msg(e); }
}
const esError = (r: Fila[] | string, re: RegExp) => typeof r === "string" && re.test(r);
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as Fila[];
const uno = async (db: PGlite, sql: string) => (await q(db, sql))[0];

const estado = async (db: PGlite, quien: Quien) => (await como(db, quien, `select public.api_equipo_estado() e`))[0].e as Fila;
const aplicarCambios = async (db: PGlite, quien: Quien, cambios: unknown[], resumen: Fila = { recibidas: 1 }, ensayo = false) =>
  (await como(db, quien, `select public.api_equipo_aplicar($1::jsonb, $2::jsonb, $3) r`,
    [JSON.stringify(cambios), JSON.stringify(resumen), ensayo]))[0].r as Fila;
const probarAplicar = (db: PGlite, quien: Quien, cambios: unknown[]) =>
  probar(db, quien, `select public.api_equipo_aplicar($1::jsonb, '{"recibidas":1}'::jsonb, false) r`, [JSON.stringify(cambios)]);

const DUENO_K: Quien = { persona: DUENO, key: K_DUENO };

// ════ 1. La migración ═════════════════════════════════════════════════════════
const db = new PGlite();
await db.exec("set check_function_bodies = off;");
await db.exec(FIXTURE);
await db.exec("set check_function_bodies = on;");
await db.exec(AGENCIAS);
await aplicar(db, N, M);
check(true, "la migración carga");
await db.exec(GENTE);
{
  const filas = await q(db, `select tenant_id, aplicar, max_bajas_por_sync from public.integracion_equipo order by tenant_id`);
  check(filas.length === 2 && filas.every((f) => f.aplicar === false && f.max_bajas_por_sync === 5),
    `toda agencia nace en ensayo, con freno de 5 (${JSON.stringify(filas)})`);
}

// ════ 2. La puerta ════════════════════════════════════════════════════════════
{
  const app = await probar(db, { persona: DUENO }, `select public.api_equipo_estado()`);
  check(esError(app, /api_sin_llave/), `desde la app (sin key) no pasa (${String(app).slice(0, 60)})`);
  const anon = await probar(db, "anon", `select public.api_equipo_estado()`);
  check(esError(anon, /permission denied/), "anon no ejecuta api_equipo_estado");
  const anon2 = await probar(db, "anon", `select public.api_equipo_aplicar('[]', '{}', true)`);
  check(esError(anon2, /permission denied/), "anon no ejecuta api_equipo_aplicar");
  for (const f of ["api_equipo_llave()", "equipo_protegido(uuid)", "integracion_equipo_sello()"]) {
    const r = await uno(db, `select has_function_privilege('authenticated', 'public.${f}', 'execute') p`);
    check(r?.p === false, `nadie de afuera ejecuta ${f}`);
  }
  const casos: [Quien, RegExp, string][] = [
    [{ persona: DUENO, key: K_SIN_SCOPE }, /sin_permiso: la key no tiene equipo:write/, "una key sin equipo:write"],
    [{ persona: ANA, key: K_ANA }, /api_equipo_sin_permiso/, "la key de alguien que no es admin ni dueño"],
    [{ persona: DUENO, key: K_REVOCADA }, /api_llave_invalida/, "una key revocada"],
    [{ persona: DUENO, key: K_VENCIDA }, /api_llave_invalida/, "una key vencida"],
    [{ persona: ANA, key: K_DUENO }, /api_llave_invalida/, "la key de otra persona"],
    [{ persona: DUENO, key: K(99) }, /api_llave_invalida/, "una key que no existe"],
    [{ persona: DUENO, key: K_OLGA }, /api_llave_invalida/, "la key de la otra agencia con la sesión de esta"],
  ];
  for (const [quien, re, nombre] of casos) {
    const r = await probar(db, quien, `select public.api_equipo_estado()`);
    check(esError(r, re), `${nombre} no pasa (${String(r).slice(0, 70)})`);
    const a = await probarAplicar(db, quien, []);
    check(esError(a, re), `${nombre} tampoco aplica`);
  }
}

// ════ 3. Lo que Maven tiene ═══════════════════════════════════════════════════
{
  const e = await estado(db, DUENO_K);
  const correos = (e.personas as Fila[]).map((p) => p.correo).sort();
  check(JSON.stringify(correos) === JSON.stringify(["admin@kash.test", "ana@kash.test", "beto@kash.test", "carla@kash.test",
    "dario@kash.test", "dueno@kash.test", "eva@kash.test", "fede@kash.test"]),
    `solo la gente de la agencia de la key, sin la creadora y con el correo en minúsculas (${correos.join(", ")})`);
  const por = new Map((e.personas as Fila[]).map((p) => [p.correo, p]));
  check(por.get("dueno@kash.test")?.protegido === true && por.get("admin@kash.test")?.protegido === true, "dueño y admin, protegidos");
  check(por.get("ana@kash.test")?.protegido === false && por.get("ana@kash.test")?.rol === "Chatter", "ana, no protegida y con su rol");
  check(por.get("dario@kash.test")?.en_papelera === true, "dario, en la papelera");
  check(por.get("fede@kash.test")?.rol === null && por.get("fede@kash.test")?.nivel === null, "fede, sin rol ni nivel (null, no vacío)");
  const roles = (e.roles as Fila[]).map((r) => `${r.nombre}:${r.es_admin}`);
  check(JSON.stringify(roles) === JSON.stringify(["Chatter:false", "Chatter Supervisor:false", "Finanzas:false", "Jefazo:true", "admin:true"]),
    `los roles ACTIVOS de esta agencia, con los de admin marcados (${roles.join(", ")})`);
  check(e.aplicar === false && e.max_bajas === 5, "el interruptor, apagado");
  // Una persona que pasa a nivel admin queda protegida aunque su rol no lo sea.
  await db.exec(`update public.profiles set nivel = 'admin' where id = '${FEDE}'`);
  const e2 = await estado(db, DUENO_K);
  check((e2.personas as Fila[]).find((p) => p.id === FEDE)?.protegido === true, "nivel admin → protegido");
  await db.exec(`update public.profiles set nivel = null where id = '${FEDE}'`);
}

// ════ 4. Ensayo: valida, no cambia ════════════════════════════════════════════
{
  const cambios = [
    { user_id: ANA, campo: "rol", valor: "Finanzas" },
    { user_id: ANA, campo: "nivel", valor: "supervisor" },
    { user_id: CARLA, campo: "papelera", valor: null },
    { user_id: BETO, campo: "rol", valor: "Jefazo" },
    { user_id: BETO, campo: "rol", valor: "admin" },
    { user_id: EVA, campo: "nivel", valor: "dueno" },
    { user_id: EVA, campo: "rol", valor: "Solo de la otra" },
    { user_id: EVA, campo: "rol", valor: "Viejo" },
    { user_id: DUENO, campo: "nivel", valor: "agente" },
    { user_id: ADMIN, campo: "papelera", valor: null },
    { user_id: PEPE, campo: "rol", valor: "Chatter" },
    { user_id: SOFI, campo: "nivel", valor: "agente" },
    { user_id: DARIO, campo: "rol", valor: "Finanzas" },
    { user_id: ANA, campo: "reporta_a", valor: PEPE },
    { user_id: ANA, campo: "reporta_a", valor: ANA },
    { user_id: ANA, campo: "hora_entrada", valor: "25:00" },
    { user_id: ANA, campo: "inventado", valor: "x" },
    { user_id: "no-es-uuid", campo: "rol", valor: "Chatter" },
    { user_id: ANA, campo: "equipo", valor: 7 },
  ];
  const r = await aplicarCambios(db, DUENO_K, cambios, { recibidas: 9, algo: 1 });
  check(r.ensayo === true && r.aplicar === false, "con el interruptor apagado, es ensayo");
  const motivos = (r.rechazados as Fila[]).map((x) => `${x.user_id === ANA ? "ana" : x.user_id === BETO ? "beto" : x.user_id === EVA ? "eva" : x.user_id}|${x.campo}|${x.motivo}`);
  const espera = [
    "beto|rol|rol_de_admin", "beto|rol|rol_de_admin", "eva|nivel|nivel_no_permitido", "eva|rol|rol_desconocido", "eva|rol|rol_desconocido",
    `${DUENO}|nivel|protegido`, `${ADMIN}|papelera|protegido`, `${PEPE}|rol|no_es_de_la_agencia`, `${SOFI}|nivel|no_es_de_la_agencia`,
    `${DARIO}|rol|en_papelera`, "ana|reporta_a|jefe_no_esta_en_la_agencia", "ana|reporta_a|jefe_es_la_misma_persona",
    "ana|hora_entrada|hora_invalida", "ana|inventado|campo_desconocido", "no-es-uuid|rol|user_id_invalido", "ana|equipo|valor_invalido",
  ];
  check(JSON.stringify([...motivos].sort()) === JSON.stringify([...espera].sort()), `la base rechaza lo que no va, con su motivo (${motivos.join(", ")})`);
  const aplicables = (r.aplicados as Fila[]).map((x) => `${x.user_id}|${x.campo}`).sort();
  check(JSON.stringify(aplicables) === JSON.stringify([`${ANA}|nivel`, `${ANA}|rol`, `${CARLA}|papelera`].sort()), `y dice qué aplicaría (${aplicables})`);
  const ana = await uno(db, `select (select role from public.user_roles where user_id = '${ANA}') rol, nivel from public.profiles where id = '${ANA}'`);
  const carla = await uno(db, `select deleted_at from public.profiles where id = '${CARLA}'`);
  check(ana?.rol === "Chatter" && ana?.nivel === "agente" && carla?.deleted_at === null, "en ensayo NO cambia nada");
  const s = await q(db, `select * from public.integracion_equipo_syncs`);
  check(s.length === 1 && s[0].ensayo === true && s[0].recibidas === 9 && s[0].actor_id === DUENO && s[0].api_key_id === K_DUENO,
    "queda anotado: quién, con qué key, cuántas personas, en ensayo");
  const otra = await aplicarCambios(db, DUENO_K, cambios, { recibidas: 9, algo: 1 });
  const s2 = await q(db, `select id, repeticiones from public.integracion_equipo_syncs`);
  check(s2.length === 1 && s2[0].repeticiones === 2 && otra.sync_id === s2[0].id, "un envío igual no suma fila: suma una repetición");
  await aplicarCambios(db, DUENO_K, cambios, { recibidas: 10 });
  check((await q(db, `select 1 from public.integracion_equipo_syncs`)).length === 2, "uno distinto sí suma fila");
  const u = await uno(db, `select ultima_sync, ultima_sync_at from public.integracion_equipo where tenant_id = '${T1}'`);
  check(u?.ultima_sync?.ensayo === true && u?.ultima_sync?.recibidas === 10 && u?.ultima_sync_at !== null, "y la última llegada queda en el interruptor");
}

// ════ 5. El interruptor: solo el dueño ═══════════════════════════════════════
{
  const admin = await como(db, { persona: ADMIN }, `update public.integracion_equipo set aplicar = true returning tenant_id`);
  check(admin.length === 0, "un admin que no es dueño no lo prende");
  const ana = await probar(db, { persona: ANA }, `update public.integracion_equipo set aplicar = true returning tenant_id`);
  check(Array.isArray(ana) && ana.length === 0, "ana tampoco");
  const olga = await como(db, { persona: OLGA }, `update public.integracion_equipo set aplicar = true where tenant_id = '${T1}' returning tenant_id`);
  check(olga.length === 0, "la dueña de OTRA agencia no prende el de esta");
  const otraCol = await probar(db, { persona: DUENO }, `update public.integracion_equipo set ultima_sync = '{}' returning tenant_id`);
  check(esError(otraCol, /permission denied/), "la última llegada no se escribe a mano");
  const dueno = await como(db, { persona: DUENO }, `update public.integracion_equipo set aplicar = true returning tenant_id, actualizado_por`);
  check(dueno.length === 1 && dueno[0].tenant_id === T1 && dueno[0].actualizado_por === DUENO, "el dueño sí, y queda quién lo prendió");
  const t2 = await uno(db, `select aplicar from public.integracion_equipo where tenant_id = '${T2}'`);
  check(t2?.aplicar === false, "la otra agencia sigue en ensayo");
}

// ════ 6. Aplicar de verdad ════════════════════════════════════════════════════
{
  const r = await aplicarCambios(db, DUENO_K, [
    { user_id: ANA, campo: "rol", valor: "Finanzas" },
    { user_id: ANA, campo: "nivel", valor: "supervisor" },
    { user_id: ANA, campo: "equipo", valor: "Finanzas A" },
    { user_id: ANA, campo: "reporta_a", valor: BETO },
    { user_id: ANA, campo: "hora_entrada", valor: "08:30" },
    { user_id: ANA, campo: "hora_salida", valor: "17:00:00" },
    { user_id: FEDE, campo: "rol", valor: "Chatter" },
    { user_id: BETO, campo: "reporta_a", valor: CARLA },
    { user_id: CARLA, campo: "papelera", valor: null },
    { user_id: PEPE, campo: "papelera", valor: null },
    { user_id: BETO, campo: "rol", valor: "Jefazo" },
  ], { recibidas: 4 });
  check(r.ensayo === false, "con el interruptor prendido, se aplica");
  const ana = await uno(db, `select p.nivel, p.hora_entrada::text he, p.hora_salida::text hs,
      (select string_agg(role || '@' || tenant_id, ',') from public.user_roles where user_id = p.id) roles,
      ip.equipo, ip.reporta_a, ip.tenant_id
    from public.profiles p left join public.integracion_equipo_personas ip on ip.user_id = p.id where p.id = '${ANA}'`);
  check(ana?.roles === `Finanzas@${T1}`, `el rol cambia (uno solo, de su agencia): ${ana?.roles}`);
  check(ana?.nivel === "supervisor" && ana?.he === "08:30:00" && ana?.hs === "17:00:00", "nivel y horario");
  check(ana?.equipo === "Finanzas A" && ana?.reporta_a === BETO && ana?.tenant_id === T1, "equipo y jefe, guardados en su agencia");
  const fede = await uno(db, `select string_agg(role, ',') r from public.user_roles where user_id = '${FEDE}'`);
  check(fede?.r === "Chatter", "a quien no tenía rol se le pone");
  // El jefe de beto (carla) se valida ANTES de que carla se vaya en el mismo envío.
  const beto = await uno(db, `select reporta_a from public.integracion_equipo_personas where user_id = '${BETO}'`);
  check(beto?.reporta_a === CARLA, "las bajas van al final del envío");
  const carla = await uno(db, `select p.deleted_at, p.deleted_by, u.banned_until > now() + interval '50 years' baneada,
      (select count(*)::int from auth.sessions s where s.user_id = p.id) sesiones,
      (select count(*)::int from auth.refresh_tokens t where t.user_id = p.id::text) tokens
    from public.profiles p join auth.users u on u.id = p.id where p.id = '${CARLA}'`);
  check(carla?.deleted_at !== null && carla?.deleted_by === DUENO, "papelera: el perfil marcado, con quién");
  check(carla?.baneada === true && carla?.sesiones === 0 && carla?.tokens === 0, "papelera: bloqueada y fuera de la sesión, como «Eliminar»");
  const ev = await uno(db, `select accion, actor_id, detalle from public.cuenta_eventos where user_id = '${CARLA}'`);
  check(ev?.accion === "eliminada" && ev?.actor_id === DUENO && ev?.detalle?.origen === "backstage" && ev?.detalle?.api_key_id === K_DUENO,
    "papelera: queda en la bitácora de cuentas, con origen backstage");
  const eva = await uno(db, `select (select count(*)::int from auth.sessions where user_id = '${EVA}') s`);
  check(eva?.s === 1, "a quien no se fue no se le tocan las sesiones");
  const pepe = await uno(db, `select deleted_at from public.profiles where id = '${PEPE}'`);
  check(pepe?.deleted_at === null, "nadie de otra agencia va a la papelera");
  const betoRol = await uno(db, `select role from public.user_roles where user_id = '${BETO}'`);
  check(betoRol?.role === "Chatter Supervisor", "nadie sube a un rol de admin (Jefazo es admin en role_groups)");
  const rech = (r.rechazados as Fila[]).map((x) => `${x.campo}|${x.motivo}`).sort();
  check(JSON.stringify(rech) === JSON.stringify(["papelera|no_es_de_la_agencia", "rol|rol_de_admin"]), `lo rechazado (${rech})`);
  const s = await uno(db, `select ensayo, jsonb_array_length(aplicados) n from public.integracion_equipo_syncs order by created_at desc limit 1`);
  check(s?.ensayo === false && s?.n === 9, `la bitácora dice qué se aplicó (${s?.n})`);
  // Quitar el jefe y el equipo.
  await aplicarCambios(db, DUENO_K, [{ user_id: ANA, campo: "reporta_a", valor: null }, { user_id: ANA, campo: "equipo", valor: null }], { recibidas: 1 });
  const ana2 = await uno(db, `select equipo, reporta_a from public.integracion_equipo_personas where user_id = '${ANA}'`);
  check(ana2?.equipo === null && ana2?.reporta_a === null, "null quita el jefe y el equipo");
  // Ya en la papelera: no se vuelve a tocar.
  const otra = await aplicarCambios(db, DUENO_K, [{ user_id: CARLA, campo: "papelera", valor: null }], { recibidas: 2 });
  check((otra.rechazados as Fila[])[0]?.motivo === "en_papelera", "quien ya está en la papelera no se toca");
  const eventos = await uno(db, `select count(*)::int n from public.cuenta_eventos where user_id = '${CARLA}'`);
  check(eventos?.n === 1, "y no se anota dos veces");
  // La persona de la key se protege a sí misma.
  const yo = await aplicarCambios(db, { persona: ADMIN, key: K_ADMIN }, [{ user_id: ADMIN, campo: "nivel", valor: "agente" }], { recibidas: 3 });
  check((yo.rechazados as Fila[])[0]?.motivo === "protegido", "la key de un admin tampoco se toca a sí misma");
}

// ════ 7. El freno y el ensayo pedido ══════════════════════════════════════════
{
  await db.exec(`update public.integracion_equipo set max_bajas_por_sync = 1 where tenant_id = '${T1}'`);
  const r = await aplicarCambios(db, DUENO_K, [
    { user_id: EVA, campo: "papelera", valor: null },
    { user_id: BETO, campo: "papelera", valor: null },
    { user_id: EVA, campo: "nivel", valor: "manager" },
  ], { recibidas: 5 });
  const bajas = await uno(db, `select count(*)::int n from public.profiles where id in ('${EVA}', '${BETO}') and deleted_at is not null`);
  check(bajas?.n === 0, "más bajas que el freno: no se aplica ninguna");
  check((r.rechazados as Fila[]).filter((x) => x.motivo === "freno_de_bajas").length === 2, "y se dice por qué");
  const eva = await uno(db, `select nivel from public.profiles where id = '${EVA}'`);
  check(eva?.nivel === "manager", "lo que no es baja sí se aplica");
  const ensayo = await aplicarCambios(db, DUENO_K, [{ user_id: EVA, campo: "nivel", valor: "agente" }], { recibidas: 6 }, true);
  const eva2 = await uno(db, `select nivel from public.profiles where id = '${EVA}'`);
  check(ensayo.ensayo === true && ensayo.aplicar === true && eva2?.nivel === "manager", "ensayo pedido con el interruptor prendido: no cambia nada");
}

// ════ 8. La otra agencia ══════════════════════════════════════════════════════
{
  const olga: Quien = { persona: OLGA, key: K_OLGA };
  const e = await estado(db, olga);
  const correos = (e.personas as Fila[]).map((p) => p.correo).sort();
  check(JSON.stringify(correos) === JSON.stringify(["olga@otra.test", "pepe@otra.test"]), `la key de la otra agencia ve solo a los suyos (${correos})`);
  check((e.roles as Fila[]).every((r) => ["admin", "Chatter", "Solo de la otra"].includes(r.nombre)), "y solo sus roles");
  const r = await aplicarCambios(db, olga, [
    { user_id: ANA, campo: "nivel", valor: "agente" },
    { user_id: EVA, campo: "papelera", valor: null },
    { user_id: PEPE, campo: "reporta_a", valor: ANA },
    { user_id: PEPE, campo: "rol", valor: "Finanzas" },
  ], { recibidas: 1 });
  const motivos = (r.rechazados as Fila[]).map((x) => x.motivo).sort();
  check(JSON.stringify(motivos) === JSON.stringify(["jefe_no_esta_en_la_agencia", "no_es_de_la_agencia", "no_es_de_la_agencia", "rol_desconocido"]),
    `nada de esta agencia se toca con la key de la otra (${motivos})`);
  const ana = await uno(db, `select nivel from public.profiles where id = '${ANA}'`);
  check(ana?.nivel === "supervisor", "ana sigue igual");
  const syncs = await uno(db, `select count(*)::int n from public.integracion_equipo_syncs where tenant_id = '${T2}'`);
  check(syncs?.n === 1, "su envío queda en SU bitácora");
}

// ════ 9. Las tablas ══════════════════════════════════════════════════════════
{
  const dueno = await como(db, { persona: DUENO }, `select tenant_id from public.integracion_equipo_syncs`);
  check(dueno.length > 0 && dueno.every((f) => f.tenant_id === T1), "el dueño ve la bitácora de SU agencia");
  const admin = await como(db, { persona: ADMIN }, `select 1 from public.integracion_equipo_personas`);
  check(admin.length > 0, "un admin ve el equipo y los jefes");
  const ana = await como(db, { persona: ANA }, `select 1 from public.integracion_equipo_syncs`);
  check(ana.length === 0, "alguien que no es admin no ve la bitácora");
  const olga = await como(db, { persona: OLGA }, `select tenant_id from public.integracion_equipo_syncs`);
  check(olga.every((f) => f.tenant_id === T2), "la dueña de otra agencia no ve la de esta");
  for (const [t, sql] of [
    ["integracion_equipo_syncs", `insert into public.integracion_equipo_syncs (tenant_id, ensayo, resumen, huella) values ('${T1}', true, '{}', 'x')`],
    ["integracion_equipo_personas", `insert into public.integracion_equipo_personas (user_id, tenant_id, equipo) values ('${EVA}', '${T1}', 'x')`],
    ["integracion_equipo", `insert into public.integracion_equipo (tenant_id) values ('${T2}')`],
  ]) {
    const r = await probar(db, { persona: DUENO }, sql);
    check(esError(r, /permission denied/), `${t} no se escribe a mano, ni el dueño`);
  }
  const anon = await probar(db, "anon", `select 1 from public.integracion_equipo`);
  check(esError(anon, /permission denied/), "anon no lee nada");
}

console.log(ok.map((m) => `ok  ${m}`).join("\n"));
if (mal.length) {
  console.error(mal.map((m) => `MAL ${m}`).join("\n"));
  Deno.exit(1);
}
console.log(`\n${ok.length} ok`);
