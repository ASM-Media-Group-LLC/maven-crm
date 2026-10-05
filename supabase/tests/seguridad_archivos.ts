// Los tres huecos de antes del portal de creadoras, probados contra un Postgres
// de verdad (PGlite) con el catálogo de roles de PROD (fixtures/prod_roles_20261001.sql
// + agencias_base y roles_por_agencia, como hoy en prod):
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/seguridad_archivos.ts
//
//   1. 20261005150000_creator_video_permisos.sql — los videos de onboarding: la
//      tabla real (20260908230000), creators con las políticas de prod copiadas
//      textual de pg_policies (05/10) y la edición preguntada con FOR KEY SHARE.
//   2. 20261005150100_custom_requests_archivos_por_pedido.sql — el bucket de
//      Personalizados: las migraciones reales del módulo (20260902120000 y
//      20260902160000) y un storage.objects mínimo (stub) con RLS; los pedidos,
//      subidas y borrados como los hace usePersonalizados.ts.
//   3. 20261005150200_correo_avisos_desde_el_navegador.sql — las dos RPC que usa
//      send-notification-email desde el navegador.
//
// Cada hueco se prueba ABIERTO sin la migración (la línea base: si no está
// abierto, el test no prueba nada) y CERRADO con ella; los flujos de la app
// siguen andando; la vuelta atrás («--|») deja todo como estaba y se puede
// volver a aplicar; con una política distinta de la revisada, no corre.
//
// Sale con código 1 si algo falla. Corre en el guard de cada PR.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FX_ROLES = leer("./fixtures/prod_roles_20261001.sql");
// personas_por_agencia no hace falta (no toca permisos) y pide las políticas de profiles.
const ANTES = ["20261001210000_agencias_base.sql", "20261001211000_roles_por_agencia.sql"]
  .map((n) => ({ n, sql: leer(`../migrations/${n}`) }));
const PERSONALIZADOS = ["20260902120000_personalizados_f1.sql", "20260902160000_personalizados_rls_alcance.sql"]
  .map((n) => ({ n, sql: leer(`../migrations/${n}`) }));
const VIDEOS_BASE = { n: "20260908230000_creator_onboarding_videos_hasta_3.sql", sql: leer("../migrations/20260908230000_creator_onboarding_videos_hasta_3.sql") };
const MIGS = ["20261005150000_creator_video_permisos.sql", "20261005150100_custom_requests_archivos_por_pedido.sql", "20261005150200_correo_avisos_desde_el_navegador.sql"]
  .map((n) => ({ n, sql: leer(`../migrations/${n}`) }));
const vuelta = (sql: string) => sql.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);

// ─── Gente ───────────────────────────────────────────────────────────────────
const T1 = "10000000-0000-4000-8000-000000000001"; // asm-tech
const T2 = "10000000-0000-4000-8000-000000000002"; // otra agencia
const P = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [JHON, MANU, SUSI, CHAT, CHAT2, CLO, NADIE] = [1, 2, 3, 4, 5, 6, 7].map(P);
// admin, manager, Chatter Supervisor (aprueba y gestiona Personalizados), dos chatters, closer, employee sin permisos
const OLGA = P(11); // otra agencia
const BAJA = P(12); // cuenta borrada de asm-tech

// Creadoras y videos
const C = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [CA, CB, CC] = [1, 2, 3].map(C); // A: la maneja Manu y la ve Chat; B: de Clo; C: nadie en particular
const V = (n: number) => `0f000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const KEY = (c: string, n: number) => `${c}/${String(n).padStart(8, "0")}-1111-4111-8111-111111111111.mp4`;
// Pedidos de Personalizados
const R = (n: number) => `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [P1, P2, P3] = [1, 2, 3].map(R); // P1 de Chat, P2 de Chat2, P3 lo crea Chat en el ensayo

// ─── Lo que no viene en el fixture (stubs, NO son de prod) ─────────────────────
const STUBS = `
-- storage: lo mínimo de Supabase Storage (las columnas que miran las políticas).
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text not null, public boolean default false);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid,
  created_at timestamptz default now(),
  metadata jsonb,
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

-- creators: solo las columnas que leen las políticas (y las 4 que comenta
-- 20260908230000). Las POLÍTICAS sí son las de prod (pg_policies, 05/10/2026).
create table public.creators (
  id uuid primary key,
  name text not null,
  closer_responsible_id uuid,
  assigned_manager_id uuid,
  updated_at timestamptz not null default now(),
  onboarding_video_key text, onboarding_video_at timestamptz, onboarding_video_bytes bigint, onboarding_video_by uuid
);
alter table public.creators enable row level security;
create table public.bench_chatter_creadora (uid uuid, creator_id uuid);
-- chatter_can_view_creator de prod mira los grupos de chatters; aquí, una tabla.
create function public.chatter_can_view_creator(_uid uuid, _creator_id uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.bench_chatter_creadora where uid = _uid and creator_id = _creator_id) $$;
create policy "Admins can delete creators" on public.creators for delete to authenticated using (has_role(auth.uid(), 'admin'::app_role));
create policy "Authorized roles can insert creators" on public.creators for insert to authenticated with check ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'closer'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_creators_global_scope(auth.uid()) OR is_in_role_group(auth.uid(), 'supervisor_or_above'::text)));
create policy "Authenticated users can view creators" on public.creators for select to authenticated using (true);
create policy creators_scope_select on public.creators for select to authenticated using ((has_creators_global_scope(auth.uid()) OR (closer_responsible_id = auth.uid()) OR (assigned_manager_id = auth.uid()) OR chatter_can_view_creator(auth.uid(), id)));
create policy "Managers and admins can update creators" on public.creators for update to authenticated using ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_creators_global_scope(auth.uid()) OR is_in_role_group(auth.uid(), 'supervisor_or_above'::text)));
-- Prod tiene diez triggers de UPDATE en creators: este anota si alguno corre.
create table public.bench_disparos (tabla text, cuando timestamptz default clock_timestamp());
create function public.bench_anotar() returns trigger language plpgsql security definer set search_path = public as
  $$ begin insert into public.bench_disparos (tabla) values (tg_table_name); return new; end $$;
create trigger bench_anotar after update on public.creators for each row execute function public.bench_anotar();
`;

const SEMILLA = `
insert into public.tenants(id, slug, name) values ('${T1}', 'asm-tech', 'ASM Tech');
insert into public.roles_config (name, is_system, level) values
  ('admin', true, 100), ('manager', true, 80), ('employee', true, 20), ('closer', true, 20),
  ('Chatter', false, 20), ('Chatter Supervisor', false, 55);
update public.role_groups set is_admin = true, is_manager_or_above = true, is_supervisor_or_above = true where role_name = 'admin';
update public.role_groups set is_manager_or_above = true, is_supervisor_or_above = true where role_name = 'manager';
update public.role_groups set is_supervisor_or_above = true where role_name = 'Chatter Supervisor';
insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
select rc.id, p.module, p.submodule, true, p.scope from public.roles_config rc join (values
  ('manager', 'Creadores', null::text, 'all'),
  ('Chatter Supervisor', 'Creadores', null, 'all'),
  ('Chatter', 'Creadores', null, 'self'),
  ('closer', 'Creadores', null, 'self')
) as p(rol, module, submodule, scope) on p.rol = rc.name;
insert into auth.users(id, email, raw_user_meta_data) values
  ('${JHON}', 'jhon@maven-ai.me', '{"full_name":"Jhon"}'), ('${MANU}', 'manu@maven-ai.me', '{"full_name":"Manu"}'),
  ('${SUSI}', 'Susi@Maven-AI.me', '{"full_name":"Susi"}'), ('${CHAT}', 'chat@maven-ai.me', '{"full_name":"Chat"}'),
  ('${CHAT2}', 'chat2@maven-ai.me', '{"full_name":"Chat2"}'), ('${CLO}', 'clo@maven-ai.me', '{"full_name":"Clo"}'),
  ('${NADIE}', 'nadie@maven-ai.me', '{"full_name":"Nadie"}'), ('${BAJA}', 'baja@maven-ai.me', '{"full_name":"Baja"}');
update public.user_roles set role = 'admin' where user_id = '${JHON}';
update public.user_roles set role = 'manager' where user_id = '${MANU}';
update public.user_roles set role = 'Chatter Supervisor' where user_id = '${SUSI}';
update public.user_roles set role = 'Chatter' where user_id in ('${CHAT}', '${CHAT2}');
update public.user_roles set role = 'closer' where user_id = '${CLO}';
`;

const DATOS = `
insert into public.creators (id, name, closer_responsible_id, assigned_manager_id) values
  ('${CA}', 'Ana Creadora', null, '${MANU}'), ('${CB}', 'Bea Creadora', '${CLO}', null), ('${CC}', 'Cami Creadora', null, null);
insert into public.bench_chatter_creadora values ('${CHAT}', '${CA}');
insert into public.creator_onboarding_videos (id, creator_id, storage_key, uploaded_by) values
  ('${V(1)}', '${CA}', '${KEY(CA, 1)}', '${MANU}'), ('${V(3)}', '${CC}', '${KEY(CC, 3)}', '${JHON}');
-- Personalizados: P1 de Chat, P2 de Chat2 (con su chatter).
insert into public.custom_requests (id, creator_id, creator_name, chatter_id, fan_handle, description, created_by) values
  ('${R(1)}', '${CA}', 'Ana Creadora', '${CHAT}', '@fan1', 'video de 8 min', '${CHAT}'),
  ('${R(2)}', '${CB}', 'Bea Creadora', '${CHAT2}', '@fan2', '3 fotos', '${CHAT2}');
insert into storage.objects (bucket_id, name, owner) values
  ('custom-requests', '${P1}/1700000000000-ref.jpg', '${CHAT}'),
  ('custom-requests', '${P2}/1700000000001-ref.jpg', '${CHAT2}'),
  ('custom-requests', 'suelto/sin-pedido.jpg', '${CHAT}');
insert into public.custom_request_attachments (request_id, storage_path, file_name, kind, created_by) values
  ('${R(1)}', '${P1}/1700000000000-ref.jpg', 'ref.jpg', 'referencia', '${CHAT}'),
  ('${R(2)}', '${P2}/1700000000001-ref.jpg', 'ref.jpg', 'referencia', '${CHAT2}');
-- Otra agencia (para los destinatarios del correo).
insert into public.tenants(id, slug, name) values ('${T2}', 'otra', 'Otra agencia');
insert into auth.users(id, email, raw_user_meta_data) values ('${OLGA}', 'olga@otra.test', '{"full_name":"Olga"}');
insert into public.tenant_members(user_id, tenant_id) values ('${OLGA}', '${T2}') on conflict do nothing;
update auth.users set deleted_at = now() where id = '${BAJA}';
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}
async function nueva(con: boolean, antesDeMigrar = ""): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FX_ROLES);
  await db.exec(STUBS);
  await db.exec(SEMILLA);
  for (const m of PERSONALIZADOS) await aplicar(db, m.n, m.sql); // 02/09
  await aplicar(db, VIDEOS_BASE.n, VIDEOS_BASE.sql);              // 08/09
  for (const m of ANTES) await aplicar(db, m.n, m.sql);          // 01/10
  // En prod, la agencia de cada uno: asm-tech (handle_new_user ya no la pone sola).
  await db.exec(`insert into public.tenant_members(user_id, tenant_id)
    select id, '${T1}' from auth.users where id not in (select user_id from public.tenant_members) on conflict do nothing;`);
  await db.exec(DATOS + antesDeMigrar);
  if (con) for (const m of MIGS) await aplicar(db, m.n, m.sql);
  return db;
}
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as Fila[];
const uno = async (db: PGlite, sql: string) => (await q(db, sql))[0];

// Un pedido como lo manda PostgREST (o Storage): una transacción, el rol y los claims del JWT.
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
/** Lo corre y lo deshace siempre: «anduvo» o el error. */
async function probar(db: PGlite, quien: Quien, sql: string): Promise<string> {
  await db.exec("begin");
  try { await entrar(db, quien); await db.exec(sql); return "anduvo"; }
  catch (e) { return msg(e); }
  finally { await db.exec("rollback"); }
}
/** Cuántas filas devuelve (o toca, con RETURNING), y lo deshace. */
async function filas(db: PGlite, quien: Quien, sql: string): Promise<number | string> {
  await db.exec("begin");
  try { await entrar(db, quien); const rs = await db.exec(sql); return rs.at(-1)?.rows.length ?? 0; }
  catch (e) { return msg(e); }
  finally { await db.exec("rollback"); }
}
const RLS = /row-level security|permission denied/;
const politicas = (tabla: string, esquema = "public") =>
  `select policyname || '|' || cmd || '|' || array_to_string(roles, ',') || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '') p
   from pg_policies where schemaname = '${esquema}' and tablename = '${tabla}' order by 1`;

const prod = await nueva(false);
const con = await nueva(true);

// ════ 0. La base del ensayo es la de prod ════════════════════════════════════
{
  const pol = await uno(prod, `select qual, with_check from pg_policies where tablename = 'creator_onboarding_videos'`);
  check(pol?.qual === "has_permission(auth.uid(), 'Creadores'::text, NULL::text)", `creator_onboarding_videos tiene la política de prod (${pol?.qual})`);
  const st = (await q(prod, politicas("objects", "storage"))).map((x) => x.p);
  check(st.length === 3 && st.every((p) => p.includes("custom-requests")), `storage.objects tiene las 3 políticas de prod del bucket (${st.length})`);
  const perm = await uno(prod, `select public.has_permission('${CHAT}', 'Creadores') chat, public.has_permission('${NADIE}', 'Creadores') nadie,
    public.has_creators_global_scope('${CHAT}') chat_global, public.has_creators_global_scope('${MANU}') manu_global,
    public.can_use_module_function('${SUSI}', 'Personalizados', 'Gestionar', 'supervisor_or_above') susi_gestiona,
    public.has_permission('${SUSI}', 'Personalizados') susi_modulo`);
  check(perm?.chat === true && perm?.nadie === false && perm?.chat_global === false && perm?.manu_global === true,
    `los permisos de Creadores son los esperados (${JSON.stringify(perm)})`);
  check(perm?.susi_gestiona === true && perm?.susi_modulo === true, "Susi (Chatter Supervisor) gestiona Personalizados con el módulo");
}

// ════ 1. Videos de onboarding ════════════════════════════════════════════════
{
  // V2 abierto en prod: con el módulo, Chat le cuelga a A la llave de un video de C.
  const v2 = await probar(prod, CHAT, `insert into public.creator_onboarding_videos (creator_id, storage_key) values ('${CA}', '${CC}/99999999-1111-4111-8111-111111111111.mp4')`);
  check(v2 === "anduvo", `línea base (V2): en prod un chatter con el módulo escribe la tabla de videos por la API (${v2})`);
  const v2b = await filas(prod, CHAT, `delete from public.creator_onboarding_videos where id = '${V(1)}' returning id`);
  check(v2b === 1, `línea base (V2): y borra la fila de un video sin pasar por la edge (${v2b})`);

  // Con la migración: nadie escribe por la API.
  for (const [quien, n] of [[CHAT, "Chat"], [MANU, "Manu (manager)"], [JHON, "Jhon (admin)"]] as const) {
    const ins = await probar(con, quien, `insert into public.creator_onboarding_videos (creator_id, storage_key) values ('${CA}', '${CC}/99999999-1111-4111-8111-111111111111.mp4')`);
    check(RLS.test(ins), `V2 cerrado: ${n} no inserta en la tabla de videos (${ins.slice(0, 60)})`);
    const del = await probar(con, quien, `delete from public.creator_onboarding_videos where id = '${V(1)}'`);
    check(RLS.test(del), `V2 cerrado: ${n} no borra filas de videos (${del.slice(0, 60)})`);
  }
  const edge = await probar(con, "service_role", `insert into public.creator_onboarding_videos (creator_id, storage_key, uploaded_by) values ('${CA}', '${KEY(CA, 2)}', '${MANU}')`);
  check(edge === "anduvo", `la edge (service_role) sí escribe (${edge})`);

  // Lectura: el módulo + ver a la creadora.
  const ve = async (db: PGlite, quien: string) => (await como(db, quien, `select creator_id from public.creator_onboarding_videos order by creator_id`)).map((x) => x.creator_id as string);
  check(JSON.stringify(await ve(con, CHAT)) === JSON.stringify([CA, CC]), "con la política de prod de creators (todos ven a todas), Chat (con el módulo) ve los dos videos");
  check((await ve(con, NADIE)).length === 0, "sin el módulo Creadores no se ve ningún video");

  // La edición: la política de UPDATE de creators, sin copiarla.
  const edita = async (db: PGlite, quien: string, c: string) => (await como(db, quien, `select public.creator_video_puede_editar('${c}') e`))[0].e as boolean;
  const matriz: [string, string, boolean][] = [
    [JHON, "Jhon (admin)", true], [MANU, "Manu (manager)", true], [SUSI, "Susi (supervisor)", true],
    [CHAT, "Chat (chatter)", false], [CLO, "Clo (closer)", false], [NADIE, "Nadie (sin permisos)", false],
  ];
  for (const [quien, n, esperado] of matriz) {
    const r = await edita(con, quien, CA);
    check(r === esperado, `creator_video_puede_editar(A) para ${n} = ${esperado} (dio ${r})`);
  }
  check(await edita(con, MANU, C(99)) === false, "una creadora que no existe: false");
  const anon = await probar(con, "anon", `select public.creator_video_puede_editar('${CA}')`);
  check(/permission denied/.test(anon), `anon no la puede llamar (${anon.slice(0, 50)})`);
  const disparos = await uno(con, `select count(*)::int n from public.bench_disparos`);
  const fecha = await uno(con, `select updated_at::text u from public.creators where id = '${CA}'`);
  await como(con, MANU, `select public.creator_video_puede_editar('${CA}')`);
  const disparos2 = await uno(con, `select count(*)::int n from public.bench_disparos`);
  const fecha2 = await uno(con, `select updated_at::text u from public.creators where id = '${CA}'`);
  check(disparos?.n === 0 && disparos2?.n === 0 && fecha?.u === fecha2?.u, "preguntar no escribe la creadora ni dispara sus triggers de UPDATE");
  const def = await uno(con, `select prosecdef, provolatile from pg_proc where proname = 'creator_video_puede_editar'`);
  check(def?.prosecdef === false && def?.provolatile === "v", "es SECURITY INVOKER (corre con la RLS de quien llama) y VOLATILE");

  // Hereda lo que se cambie en creators (lo que va a hacer el arreglo de la otra rama).
  const db = await nueva(true);
  await db.exec(`drop policy "Authenticated users can view creators" on public.creators;
    alter policy "Managers and admins can update creators" on public.creators
      using (has_role(auth.uid(), 'admin'::app_role) OR assigned_manager_id = auth.uid());`);
  check(JSON.stringify(await ve(db, CHAT)) === JSON.stringify([CA]), "sin «todos ven a todas», Chat solo ve el video de la creadora que ve (A): la tabla sigue a creators");
  check((await ve(db, CLO)).length === 0 || JSON.stringify(await ve(db, CLO)) === JSON.stringify([]), "Clo (closer de B, sin videos) no ve los de A ni C");
  check(await edita(db, MANU, CA) === true && await edita(db, MANU, CC) === false,
    "con una política de UPDATE más estricta, Manu edita A (la maneja) y ya no C: la función la sigue sin tocarla");
  check(await edita(db, SUSI, CA) === false, "y Susi (supervisor) deja de poder editar: no hay copia de la regla vieja");
  await db.close();
}

// ════ 2. El bucket custom-requests ═══════════════════════════════════════════
{
  const objetos = async (db: PGlite, quien: string) =>
    (await como(db, quien, `select name from storage.objects where bucket_id = 'custom-requests' order by name`)).map((x) => x.name as string);
  const subir = (quien: string, ruta: string) =>
    `insert into storage.objects (bucket_id, name, owner) values ('custom-requests', '${ruta}', '${quien}') returning id`;

  // A1 abierto en prod.
  const chat2Prod = await objetos(prod, CHAT2);
  check(chat2Prod.includes(`${P1}/1700000000000-ref.jpg`), "línea base (A1): en prod Chat2 lee el archivo del pedido de Chat (no ve ese pedido)");
  check(await probar(prod, CHAT2, subir(CHAT2, `${P1}/x.jpg`)) === "anduvo", "línea base (A1): y sube a la carpeta del pedido de Chat");
  check(await probar(prod, NADIE, subir(NADIE, `${P2}/x.jpg`)) === "anduvo", "línea base (A1): hasta alguien sin el módulo sube a cualquier pedido");
  const a3 = await probar(prod, CHAT2, `insert into public.custom_request_attachments (request_id, storage_path, file_name, created_by) values ('${P1}', '${P2}/1700000000001-ref.jpg', 'x', '${CHAT2}')`);
  check(a3 === "anduvo", `línea base (A3): Chat2 cuelga un adjunto al pedido de Chat (${a3.slice(0, 60)})`);

  // Leer: el archivo es de un pedido que la persona ve.
  check(JSON.stringify(await objetos(con, CHAT)) === JSON.stringify([`${P1}/1700000000000-ref.jpg`]), "A1 cerrado: Chat lee solo los archivos de su pedido");
  check(JSON.stringify(await objetos(con, CHAT2)) === JSON.stringify([`${P2}/1700000000001-ref.jpg`]), "A1 cerrado: Chat2 lee solo los de su pedido");
  check((await objetos(con, SUSI)).length === 2, "Susi (supervisor con el módulo) lee los de todos los pedidos");
  check((await objetos(con, NADIE)).length === 0, "sin el módulo no se lee nada");
  check(!(await objetos(con, JHON)).includes("suelto/sin-pedido.jpg"), "un archivo fuera de la carpeta de un pedido no lo ve nadie (ni el admin por la API)");

  // Subir: a la carpeta de un pedido que puede editar.
  check(await probar(con, CHAT, subir(CHAT, `${P1}/1700000000002-otra.jpg`)) === "anduvo", "Chat sube una referencia a su pedido");
  check(RLS.test(await probar(con, CHAT, subir(CHAT, `${P2}/x.jpg`))), "A1 cerrado: Chat no sube a la carpeta del pedido de Chat2");
  check(RLS.test(await probar(con, NADIE, subir(NADIE, `${P2}/x.jpg`))), "A1 cerrado: alguien sin el módulo no sube a ningún pedido");
  check(RLS.test(await probar(con, CHAT, subir(CHAT, `suelto/x.jpg`))), "no se sube fuera de la carpeta de un pedido");
  check(RLS.test(await probar(con, CHAT, subir(CHAT, `${P1}`))), "ni con el id del pedido como nombre de archivo (sin carpeta)");
  check(await probar(con, SUSI, subir(SUSI, `${P2}/entrega.mp4`)) === "anduvo", "Susi (gestiona) sube la entrega al pedido de Chat2");

  // El flujo completo: crear el pedido, subir referencias, aprobar, entregar.
  const flujo = await probar(con, CHAT, `
    insert into public.custom_requests (id, creator_name, chatter_id, fan_handle, description) values ('${P3}', 'Ana Creadora', '${CHAT}', '@fan3', 'audio');
    insert into storage.objects (bucket_id, name, owner) values ('custom-requests', '${P3}/1700000000003-ref.jpg', '${CHAT}') returning id;
    insert into public.custom_request_attachments (request_id, storage_path, file_name, kind, created_by) values ('${P3}', '${P3}/1700000000003-ref.jpg', 'ref.jpg', 'referencia', '${CHAT}');
  `);
  check(flujo === "anduvo", `el chatter crea el pedido, sube la referencia y la cuelga (${flujo.slice(0, 80)})`);
  await como(con, CHAT, `insert into public.custom_requests (id, creator_name, chatter_id, fan_handle, description) values ('${P3}', 'Ana Creadora', '${CHAT}', '@fan3', 'audio');`);
  const aprueba = await probar(con, SUSI, `update public.custom_requests set status = 'aprobado' where id = '${P3}'`);
  check(aprueba === "anduvo", `el supervisor aprueba (${aprueba.slice(0, 60)})`);
  const entrega = await probar(con, CHAT, `
    insert into storage.objects (bucket_id, name, owner) values ('custom-requests', '${P3}/1700000000004-entrega.mp4', '${CHAT}') returning id;
    insert into public.custom_request_attachments (request_id, storage_path, file_name, kind, created_by) values ('${P3}', '${P3}/1700000000004-entrega.mp4', 'entrega.mp4', 'entrega', '${CHAT}');`);
  check(entrega === "anduvo", `quien entrega (el chatter del pedido) sube la entrega (${entrega.slice(0, 60)})`);
  const firma = await filas(con, CHAT, `select id from storage.objects where bucket_id = 'custom-requests' and name = '${P1}/1700000000000-ref.jpg'`);
  check(firma === 1, "firmar la URL (Storage busca el objeto con la RLS) anda para el dueño del pedido");

  // A3: la fila del adjunto.
  check(RLS.test(await probar(con, CHAT2, `insert into public.custom_request_attachments (request_id, storage_path, file_name, created_by) values ('${P1}', '${P1}/x.jpg', 'x', '${CHAT2}')`)),
    "A3 cerrado: Chat2 no cuelga adjuntos al pedido de Chat");
  check(RLS.test(await probar(con, CHAT, `insert into public.custom_request_attachments (request_id, storage_path, file_name, created_by) values ('${P1}', '${P2}/1700000000001-ref.jpg', 'x', '${CHAT}')`)),
    "A3 cerrado: ni con la ruta de un archivo de otro pedido");

  // Borrar: como cra_delete, dentro de un pedido que se ve.
  const borrar = (ruta: string) => `delete from storage.objects where bucket_id = 'custom-requests' and name = '${ruta}' returning id`;
  check(await filas(con, CHAT, borrar(`${P1}/1700000000000-ref.jpg`)) === 1, "Chat borra su archivo");
  check(await filas(con, CHAT2, borrar(`${P1}/1700000000000-ref.jpg`)) === 0, "Chat2 no borra el de Chat");
  check(await filas(con, SUSI, borrar(`${P1}/1700000000000-ref.jpg`)) === 1, "A2: quien gestiona borra el archivo que también puede quitar de la ficha");
  check(await filas(prod, SUSI, borrar(`${P1}/1700000000000-ref.jpg`)) === 0, "línea base (A2): en prod el supervisor quitaba la fila pero no el archivo");
  await como(con, SUSI, `insert into storage.objects (bucket_id, name, owner) values ('custom-requests', '${P3}/1700000000005-de-susi.jpg', '${SUSI}')`);
  check(await filas(con, CHAT, borrar(`${P3}/1700000000005-de-susi.jpg`)) === 0, "el chatter no borra lo que subió el supervisor (igual que cra_delete)");

  // Preguntar si puede editar no toca el pedido.
  const antes = await uno(con, `select updated_at::text u, (select count(*)::int from public.custom_request_events where request_id = '${P1}') ev from public.custom_requests where id = '${P1}'`);
  await como(con, CHAT, `select public.custom_request_puede_editar('${P1}')`);
  const despues = await uno(con, `select updated_at::text u, (select count(*)::int from public.custom_request_events where request_id = '${P1}') ev from public.custom_requests where id = '${P1}'`);
  check(antes?.u === despues?.u && antes?.ev === despues?.ev, "custom_request_puede_editar no cambia updated_at ni escribe eventos");
  const pe = await uno(con, `select public.custom_request_de_ruta('${P1}/a.jpg') = '${P1}'::uuid a, public.custom_request_de_ruta('nada/a.jpg') is null b,
    public.custom_request_de_ruta('${P1}') is null c, public.custom_request_de_ruta('${P1.toUpperCase()}/a.jpg') = '${P1}'::uuid d`);
  check(pe?.a && pe?.b && pe?.c && pe?.d, `custom_request_de_ruta: la primera carpeta si es un uuid (${JSON.stringify(pe)})`);
}

// ════ 3. Las RPC del correo ══════════════════════════════════════════════════
{
  const dest = async (quien: string, ids: string[], correos: string[]) =>
    (await como(con, "service_role", `select user_id, email from public.correo_destinatarios_de_agencia('${quien}',
      array[${ids.map((i) => `'${i}'`).join(",")}]::uuid[], array[${correos.map((c) => `'${c}'`).join(",")}]::text[]) order by email`))
      .map((x) => x.email as string);
  check(JSON.stringify(await dest(CHAT, [MANU, OLGA, BAJA], ["SUSI@maven-ai.me ", "olga@otra.test", "alguien@gmail.com"])) === JSON.stringify(["manu@maven-ai.me", "susi@maven-ai.me"]),
    "de ids y correos, solo las cuentas de la agencia de quien pide (sin mayúsculas ni espacios; sin la otra agencia, sin la borrada, sin direcciones sueltas)");
  check(JSON.stringify(await dest(OLGA, [MANU, OLGA], ["chat@maven-ai.me"])) === JSON.stringify(["olga@otra.test"]), "para Olga, solo su agencia");
  check((await dest(CHAT, [], [])).length === 0, "sin pedir a nadie, nadie");
  for (const quien of ["anon", CHAT] as const) {
    const r1 = await probar(con, quien, `select * from public.correo_destinatarios_de_agencia('${CHAT}', array['${MANU}']::uuid[], null)`);
    const r2 = await probar(con, quien, `select public.correo_navegador_turno('${CHAT}', 'qa_closer', 'x')`);
    const r3 = await probar(con, quien, `select * from public.correo_envios_navegador`);
    check([r1, r2, r3].every((r) => /permission denied/.test(r)), `${quien === "anon" ? "anon" : "una persona"} no llama las RPC ni lee el registro`);
  }
  const turno = async (quien: string) => (await como(con, "service_role", `select public.correo_navegador_turno('${quien}', 'evaluacion_chatter', 'e1') t`))[0].t as boolean;
  const cinco = [];
  for (let i = 0; i < 6; i++) cinco.push(await turno(CHAT));
  check(JSON.stringify(cinco) === JSON.stringify([true, true, true, true, true, false]), `5 por minuto y el sexto no (${cinco})`);
  check(await turno(CHAT2) === true, "el tope es por persona");
  await con.exec(`update public.correo_envios_navegador set created_at = now() - interval '2 minutes' where user_id = '${CHAT}'`);
  check(await turno(CHAT) === true, "pasado el minuto, vuelve a poder");
  const reg = await uno(con, `select count(*)::int n, bool_and(plantilla = 'evaluacion_chatter' and ref = 'e1') b from public.correo_envios_navegador where user_id = '${CHAT}'`);
  check(reg?.n === 6 && reg?.b === true, `cada pedido queda anotado con su plantilla y su reporte (${JSON.stringify(reg)}); el rechazado no`);
}

// ════ 4. La vuelta atrás ═════════════════════════════════════════════════════
{
  const foto = async (db: PGlite) => JSON.stringify({
    videos: (await q(db, politicas("creator_onboarding_videos"))).map((x) => x.p),
    adjuntos: (await q(db, politicas("custom_request_attachments"))).map((x) => x.p),
    storage: (await q(db, politicas("objects", "storage"))).map((x) => x.p),
    grants: (await q(db, `select privilege_type from information_schema.role_table_grants where table_name = 'creator_onboarding_videos' and grantee = 'authenticated' order by 1`)).map((x) => x.privilege_type),
    funciones: (await q(db, `select proname from pg_proc where proname in ('creator_video_puede_editar', 'custom_request_puede_editar', 'custom_request_de_ruta', 'correo_navegador_turno', 'correo_destinatarios_de_agencia') order by 1`)).map((x) => x.proname),
    tabla: (await uno(db, `select to_regclass('public.correo_envios_navegador') is not null t`))?.t,
  });
  const base = await foto(prod);
  const db = await nueva(true);
  for (const m of [...MIGS].reverse()) await aplicar(db, `vuelta atrás de ${m.n}`, vuelta(m.sql));
  const despues = await foto(db);
  check(base === despues, `la vuelta atrás deja políticas, privilegios y funciones como en prod${base === despues ? "" : `\n  prod:   ${base}\n  vuelta: ${despues}`}`);
  const otraVez = await (async () => { try { for (const m of MIGS) await aplicar(db, m.n, m.sql); return "anduvo"; } catch (e) { return msg(e); } })();
  check(otraVez === "anduvo", `y se pueden volver a aplicar (${otraVez.slice(0, 80)})`);
  await db.close();
}

// ════ 5. Las negativas: con algo distinto de lo revisado, no corre ═══════════
{
  const db = await nueva(false, `alter policy creator_onboarding_videos_scope on public.creator_onboarding_videos using (true);`);
  const r = await (async () => { try { await aplicar(db, MIGS[0].n, MIGS[0].sql); return "anduvo"; } catch (e) { return msg(e); } })();
  check(/no es la que se revisó/.test(r), `videos: con una política distinta de la revisada, no corre (${r.slice(-80)})`);
  const nada = await uno(db, `select to_regprocedure('public.creator_video_puede_editar(uuid)') is null a`);
  check(nada?.a === true, "y no deja nada a medias");
  const r2 = await (async () => {
    try {
      await db.exec(`create policy "otra del bucket" on storage.objects for select to authenticated using (bucket_id = 'custom-requests' and true);`);
      await aplicar(db, MIGS[1].n, MIGS[1].sql);
      return "anduvo";
    } catch (e) { return msg(e); }
  })();
  check(/no es la que se revisó/.test(r2), `bucket: con una política más del bucket, no corre (${r2.slice(-80)})`);
  await db.close();
}

await prod.close();
await con.close();
for (const m of ok) console.log(`✓ ${m}`);
for (const m of mal) console.log(`✗ ${m}`);
console.log(`\n${ok.length} ok${mal.length ? `, ${mal.length} MAL` : ""}`);
if (mal.length) Deno.exit(1);
