// Agencias conectadas (migración 20261111190000_agencias_conectadas), probada contra un
// Postgres de verdad (PGlite) con DOS agencias, porque con una sola un fallo de
// aislamiento no se ve. Encima de 20261111120000_backstage_equipo (la que ya está en
// prod), con el fixture de su banco (equipo_backstage.ts) más lo que esta usa:
// role_permissions, el reloj de Cowork, las capturas de Argos, las tardanzas, Vault y
// pg_cron (de mentira: solo lo que la migración llama), y la regla de URL de los
// webhooks del Messenger, leída de su migración.
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/agencias_conectadas.ts
//
//   1. Las dos migraciones cargan, y nacen los dos cron.
//   2. Roles: la puerta; el ensayo no crea nada; aplicar crea en la agencia de la key,
//      con origen 'plataforma' y sin permisos; nunca uno de admin; la otra agencia
//      tiene los suyos; equipo_roles_sin_permisos solo de mi agencia.
//   3. Pendientes: con el interruptor apagado no se anota nada; se anota, se suma y
//      nunca se resucita una descartada; resolver solo en mi agencia, con la cuenta
//      que coincide; la otra agencia tiene su propia fila con el mismo correo.
//   4. Horas y notas: solo la gente de la agencia de la key, sin cuentas externas, por
//      día de Bogotá; el rango, hasta 93 días.
//   5. Webhooks: registrar (solo mi agencia, llave con equipo:write), encolar solo para
//      la agencia de la persona, la ventana que junta, el despachador (reclamar,
//      anotar, detener) y quién puede qué.
//   6. Horario por semana y /equipo/argos (20261114000000, que también carga encima de
//      las dos y vuelve a correr todo lo de arriba con sus copias de api_equipo_estado y
//      api_equipo_aplicar): aplicar y validar horario_semana, la RLS, turno_del_dia,
//      turno_en_curso y horario_de; los vigías ya no persiguen a nadie en su descanso; y
//      api_equipo_argos por turno, solo de la agencia de la key.
//
// Sale con código 1 si algo falla. Corre en el guard de cada PR.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const BASE = "20261111120000_backstage_equipo.sql";
const N = "20261111190000_agencias_conectadas.sql";
const M_BASE = leer(`../migrations/${BASE}`);
const M = leer(`../migrations/${N}`);
const N2 = "20261114000000_equipo_horario_semana_y_argos.sql";
const M2 = leer(`../migrations/${N2}`);
// La regla de URL de los webhooks del Messenger, tal cual está en prod.
const HOST_DE_URL = (() => {
  const src = leer("../migrations/20260926120000_api_webhooks_tablas.sql");
  const i = src.indexOf("create or replace function public.api_webhooks_host_de_url");
  const j = src.indexOf("$$;", src.indexOf("as $$", i) + 5);
  if (i < 0 || j < 0) throw new Error("no se encontró api_webhooks_host_de_url");
  return src.slice(i, j + 3);
})();

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const T1 = "10000000-0000-4000-8000-000000000001"; // Kash
const T2 = "10000000-0000-4000-8000-000000000002"; // la otra agencia
const P = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [DUENO, ADMIN, ANA, BETO, CARLA, DARIO, EVA, FEDE, SOFI] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(P);
const [OLGA, PEPE, QUIQUE] = [11, 12, 13].map(P); // la otra agencia: OLGA es su dueña
const [NUEVA, PASAJERO] = [21, 22].map(P);
const K = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [K_DUENO, K_SIN_SCOPE, K_ANA, K_OLGA, K_DUENO_2] = [1, 2, 3, 7, 8].map(K);

// ─── El fixture ──────────────────────────────────────────────────────────────
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

-- Vault y pg_cron: solo lo que la migración llama.
create schema vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text, secret text,
  created_at timestamptz default now());
create view vault.decrypted_secrets as select id, name, description, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
  returns uuid language sql as $$ insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id $$;
revoke all on schema vault from public;
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
create function cron.schedule(_nombre text, _cuando text, _orden text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (_nombre, _cuando, _orden) returning jobid $$;
create function cron.unschedule(_nombre text) returns boolean language sql as $$
  delete from cron.job where jobname = _nombre returning true $$;

create table public.tenants (id uuid primary key default gen_random_uuid(), slug text not null, name text not null,
  active boolean not null default true, created_at timestamptz not null default now());
create table public.tenant_members (user_id uuid not null unique, tenant_id uuid not null, role text not null default 'member',
  created_at timestamptz not null default now(), primary key (user_id, tenant_id));
create table public.tenant_owners (tenant_id uuid not null, user_id uuid not null, created_at timestamptz not null default now());
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade, full_name text, created_at timestamptz default now(),
  deleted_at timestamptz, deleted_by uuid, nivel text, hora_entrada time, hora_salida time,
  turno_id uuid, exonera_camara_pantalla boolean default false, comida_min integer, bano_min integer,
  constraint profiles_nivel_check check (nivel = any (array['dueno', 'admin', 'manager', 'supervisor', 'agente']))
);
create table public.user_roles (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  role text not null, tenant_id uuid references public.tenants(id) on delete cascade, unique (user_id, role));
create table public.roles_config (id uuid primary key default gen_random_uuid(), name text not null, is_active boolean not null default true,
  tenant_id uuid not null, level integer not null default 20, created_at timestamptz not null default now(),
  hora_entrada time, hora_salida time, exonera_camara_pantalla boolean default false, comida_min integer, bano_min integer,
  constraint roles_config_agencia_nombre unique (tenant_id, name));
create table public.role_groups (role_name text not null, is_admin boolean not null default false, tenant_id uuid not null,
  primary key (tenant_id, role_name));
create table public.role_permissions (id uuid primary key default gen_random_uuid(), role_id uuid not null references public.roles_config(id) on delete cascade,
  module text not null, submodule text, can_access boolean not null default true, data_scope text not null default 'all');
create table public.api_keys (id uuid primary key default gen_random_uuid(), name text not null default 'k', key_hash text not null default md5(random()::text),
  scopes text[] not null default '{}', revoked_at timestamptz, expires_at timestamptz, tenant_id uuid references public.tenants(id),
  acts_as_user_id uuid references auth.users(id) on delete cascade);
create table public.cuenta_eventos (id uuid primary key default gen_random_uuid(), user_id uuid, user_email text, user_full_name text,
  accion text, actor_id uuid, actor_email text, detalle jsonb, at timestamptz default now());
create table public.cowork_tiempo_segmentos (id uuid primary key default gen_random_uuid(), session_id uuid not null, user_id uuid not null,
  estado text not null, started_at timestamptz not null, last_seen_at timestamptz not null, ended_at timestamptz, seconds integer);
create table public.monitor_capturas (id uuid primary key default gen_random_uuid(), user_id uuid not null, tipo text not null,
  cara_visible boolean, fuera_de_lugar boolean, perdonado boolean not null default false, created_at timestamptz not null);
create table public.tardanzas_registro (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid not null,
  dia date not null, turno_nombre text, horario_asignado time not null, entro_at timestamptz not null, tarde_min integer not null);

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

-- Lo que usa 20261114000000 (horario por semana, los vigías y /equipo/argos): los
-- turnos, Argos y Cowork, con los cuerpos de prod (13/11/2026) donde importan.
create table public.rol_turnos (id uuid primary key default gen_random_uuid(), role text, nombre text,
  hora_entrada time not null, hora_salida time not null);
create table public.cowork_fuera (id uuid primary key default gen_random_uuid(), user_id uuid not null, tenant_id uuid not null,
  desde timestamptz not null, hasta timestamptz, motivo text, avisado_at timestamptz, created_at timestamptz not null default now(),
  llamados integer not null default 0, ultimo_llamado_at timestamptz, reportado_at timestamptz);
create unique index cowork_fuera_uno_abierto on public.cowork_fuera (user_id) where hasta is null;
create table public.argos_reportes (id uuid primary key default gen_random_uuid(), user_id uuid not null,
  tipo text not null check (tipo in ('camara_apagada', 'fuera_cuadro', 'sin_pantalla')), created_at timestamptz not null default now());
create table public.monitor_eventos (id uuid primary key default gen_random_uuid(), user_id uuid not null, tipo text,
  estado text not null default 'pendiente', created_at timestamptz not null default now());
create table public.argos_no_entro (user_id uuid not null, turno date not null, llamados integer not null default 0,
  ultimo_llamado_at timestamptz, reportado_at timestamptz, tenant_id uuid, primary key (user_id, turno));
create table public.argos_tiempo_avisos (user_id uuid not null, turno date not null, tipo text not null check (tipo in ('pasado', 'resumen')),
  sin_pantalla_min integer, permitido_min integer, faltas integer, fotos integer, entro boolean, tenant_id uuid,
  created_at timestamptz not null default now(), primary key (user_id, turno, tipo));
create table public.cowork_libres (user_id uuid primary key);
create table public.cowork_breaks (id uuid primary key default gen_random_uuid(), user_id uuid not null, kind text,
  started_at timestamptz not null, ended_at timestamptz);
create table public.llamada_maven_latido (user_id uuid primary key, last_seen_at timestamptz not null);
create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null, type text, title text,
  message text, reference_id uuid, reference_type text, module_origin text, priority text, status text, visibility_scope text,
  deep_link_url text, created_at timestamptz not null default now());

create function public.debe_estar_en_cowork(_uid uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select _uid is not null
     and not public.es_admin_o_dueno(_uid)
     and not exists (select 1 from public.cowork_libres l where l.user_id = _uid); $$;
create function public.presente_en_cowork(_uid uuid, _ahora timestamptz default now()) returns boolean language sql stable
  security definer set search_path to 'public' as $$
  select exists (
           select 1 from public.cowork_tiempo_segmentos s
            where s.user_id = _uid and s.ended_at is null and s.last_seen_at > _ahora - interval '90 seconds')
      or exists (
           select 1 from public.cowork_breaks b
            where b.user_id = _uid and b.ended_at is null and b.started_at > _ahora - interval '4 hours')
      or exists (
           select 1 from public.llamada_maven_latido l
            where l.user_id = _uid and l.last_seen_at > _ahora - interval '90 seconds'); $$;
create function public.argos_permitido_min(_uid uuid) returns integer language sql stable security definer set search_path to 'public' as $$
  select greatest(coalesce(p.comida_min, r.comida, 30), 0) + greatest(coalesce(p.bano_min, r.bano, 10), 0)
    from public.profiles p
    left join lateral (
      select max(c.comida_min) as comida, max(c.bano_min) as bano
        from public.user_roles ur
        join public.roles_config c on lower(c.name) = lower(ur.role) and c.is_active
                                  and (c.tenant_id = ur.tenant_id or ur.tenant_id is null)
       where ur.user_id = p.id
    ) r on true
   where p.id = _uid; $$;
create function public.argos_sin_pantalla_seg(_uid uuid, _desde timestamptz, _hasta timestamptz) returns integer language sql stable
  security definer set search_path to 'public' as $$
  select (
    coalesce((
      select sum(extract(epoch from (least(coalesce(s.ended_at, s.last_seen_at), _hasta) - greatest(s.started_at, _desde))))
        from public.cowork_tiempo_segmentos s
       where s.user_id = _uid
         and s.estado in ('pausa', 'sin_pantalla', 'sin_camara', 'sin_conexion', 'sin_conexion_larga')
         and s.started_at < _hasta and coalesce(s.ended_at, s.last_seen_at) > _desde
    ), 0)
    + coalesce((
      select sum(extract(epoch from (least(coalesce(f.hasta, now()), _hasta) - greatest(f.desde, _desde))))
        from public.cowork_fuera f
       where f.user_id = _uid and f.desde < _hasta and coalesce(f.hasta, now()) > _desde
    ), 0)
  )::int; $$;
-- A quién le llegan los avisos de alguien: aquí, el dueño de su agencia.
create function public.destinatarios_de_aviso(_uid uuid) returns table(user_id uuid) language sql stable security definer
  set search_path to 'public' as $$
  select o.user_id from public.tenant_owners o join public.tenant_members m on m.tenant_id = o.tenant_id where m.user_id = _uid; $$;
-- puede_vigilar_a cerrada para authenticated (como en prod) y puede_vigilar abierta: aquí
-- vigila el dueño o un admin.
create function public.puede_vigilar_a(_viewer uuid, _target uuid) returns boolean language sql stable security definer
  set search_path to 'public' as $$
  select _viewer is not null and _target is not null and _viewer <> _target and public.es_admin_o_dueno(_viewer); $$;
revoke all on function public.puede_vigilar_a(uuid, uuid) from public, anon, authenticated;
create function public.puede_vigilar(_target uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.puede_vigilar_a((select auth.uid()), _target); $$;
revoke all on function public.puede_vigilar(uuid) from public, anon;
`;

const AGENCIAS = `insert into public.tenants (id, slug, name) values ('${T1}', 'kash', 'Kash Agency'), ('${T2}', 'otra', 'Otra agencia');`;

const GENTE = `
insert into auth.users (id, email, raw_app_meta_data) values
  ('${DUENO}', 'Dueno@Kash.test', '{}'), ('${ADMIN}', 'admin@kash.test', '{}'), ('${ANA}', 'ana@kash.test', '{}'),
  ('${BETO}', 'beto@kash.test', '{}'), ('${CARLA}', 'carla@kash.test', '{}'), ('${DARIO}', 'dario@kash.test', '{}'),
  ('${EVA}', 'eva@kash.test', '{}'), ('${FEDE}', 'fede@kash.test', '{}'), ('${SOFI}', 'sofi@gmail.test', '{"tipo":"creadora"}'),
  ('${OLGA}', 'olga@otra.test', '{}'), ('${PEPE}', 'pepe@otra.test', '{}'), ('${QUIQUE}', 'quique@otra.test', '{}');
insert into public.profiles (id, full_name, nivel, deleted_at) values
  ('${DUENO}', 'Dueño', 'dueno', null), ('${ADMIN}', 'Admin', 'admin', null), ('${ANA}', 'Ana', 'agente', null),
  ('${BETO}', 'Beto', 'supervisor', null), ('${CARLA}', 'Carla', 'agente', null), ('${DARIO}', 'Darío', 'agente', now()),
  ('${EVA}', 'Eva', 'agente', null), ('${FEDE}', 'Fede', null, null), ('${SOFI}', 'Sofi', null, null),
  ('${OLGA}', 'Olga', 'dueno', null), ('${PEPE}', 'Pepe', 'agente', null), ('${QUIQUE}', 'Quique', 'agente', null);
insert into public.tenant_members (user_id, tenant_id) values
  ('${DUENO}', '${T1}'), ('${ADMIN}', '${T1}'), ('${ANA}', '${T1}'), ('${BETO}', '${T1}'), ('${CARLA}', '${T1}'),
  ('${DARIO}', '${T1}'), ('${EVA}', '${T1}'), ('${FEDE}', '${T1}'), ('${SOFI}', '${T1}'),
  ('${OLGA}', '${T2}'), ('${PEPE}', '${T2}'), ('${QUIQUE}', '${T2}');
insert into public.tenant_owners (tenant_id, user_id) values ('${T1}', '${DUENO}'), ('${T2}', '${OLGA}');
insert into public.roles_config (name, tenant_id) values
  ('admin', '${T1}'), ('Chatter', '${T1}'), ('Chatter Supervisor', '${T1}'), ('Finanzas', '${T1}'), ('Jefazo', '${T1}'),
  ('admin', '${T2}'), ('Chatter', '${T2}'), ('Solo de la otra', '${T2}');
insert into public.roles_config (name, tenant_id, is_active) values ('Viejo', '${T1}', false);
insert into public.role_groups (role_name, is_admin, tenant_id) values
  ('admin', true, '${T1}'), ('Jefazo', true, '${T1}'), ('Chatter', false, '${T1}'), ('admin', true, '${T2}');
insert into public.role_permissions (role_id, module, can_access)
  select id, 'cowork', true from public.roles_config where name = 'Chatter' and tenant_id = '${T1}';
insert into public.user_roles (user_id, role) values
  ('${DUENO}', 'admin'), ('${ADMIN}', 'admin'), ('${ANA}', 'Chatter'), ('${BETO}', 'Chatter Supervisor'), ('${CARLA}', 'Chatter'),
  ('${DARIO}', 'Chatter'), ('${EVA}', 'Chatter'), ('${OLGA}', 'admin'), ('${PEPE}', 'Chatter'), ('${QUIQUE}', 'Chatter');
insert into public.api_keys (id, scopes, tenant_id, acts_as_user_id) values
  ('${K_DUENO}', '{equipo:write}', '${T1}', '${DUENO}'),
  ('${K_SIN_SCOPE}', '{employees:read}', '${T1}', '${DUENO}'),
  ('${K_ANA}', '{equipo:write}', '${T1}', '${ANA}'),
  ('${K_OLGA}', '{equipo:write}', '${T2}', '${OLGA}'),
  ('${K_DUENO_2}', '{equipo:write}', '${T1}', '${DUENO}');
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}

/** Quién hace el pedido: una persona con la sesión de una key (como la arma public-api:
 *  mvf + mvk), una persona en la app (sin mvk), la edge con service_role, o anon. */
type Quien = { persona: string; key?: string } | "anon" | "service";
async function entrar(db: PGlite, quien: Quien) {
  await db.exec("reset role");
  const claims = quien === "anon" ? { role: "anon" } : quien === "service" ? { role: "service_role" }
    : { sub: quien.persona, role: "authenticated", ...(quien.key ? { mvf: true, mvk: quien.key } : {}) };
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
  await db.exec(`set local role ${quien === "anon" ? "anon" : quien === "service" ? "service_role" : "authenticated"}`);
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
const q = async (db: PGlite, sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Fila[];
const uno = async (db: PGlite, sql: string, params: unknown[] = []) => (await q(db, sql, params))[0];
const corto = (r: unknown) => String(typeof r === "string" ? r : JSON.stringify(r)).slice(0, 90);

const DUENO_K: Quien = { persona: DUENO, key: K_DUENO };
const OLGA_K: Quien = { persona: OLGA, key: K_OLGA };
const roles = async (quien: Quien, lista: unknown[], ensayo = false) =>
  (await como(db, quien, `select public.api_equipo_roles($1::jsonb, $2) r`, [JSON.stringify(lista), ensayo]))[0].r as Fila;
const pendientes = async (quien: Quien, lista: unknown[]) =>
  (await como(db, quien, `select public.api_equipo_pendientes($1::jsonb) r`, [JSON.stringify(lista)]))[0].r as Fila;
const prender = (t: string, si = true) => db.exec(`update public.integracion_equipo set aplicar = ${si} where tenant_id = '${t}'`);

// ════ 1. Las migraciones ══════════════════════════════════════════════════════
const db = new PGlite();
await db.exec("set check_function_bodies = off;");
await db.exec(FIXTURE);
await db.exec(HOST_DE_URL);
await db.exec("revoke all on function public.api_webhooks_host_de_url(text) from public, anon, authenticated;");
await db.exec("set check_function_bodies = on;");
await db.exec(AGENCIAS);
await aplicar(db, BASE, M_BASE);
await aplicar(db, N, M);
check(true, "las dos migraciones cargan (la de prod y esta)");
await aplicar(db, `${N} (otra vez)`, M);
check(true, "y esta se puede volver a correr");
await aplicar(db, N2, M2);
await aplicar(db, `${N2} (otra vez)`, M2);
check(true, "la del horario por semana y /equipo/argos carga encima, y se puede volver a correr");
await db.exec(GENTE);
{
  const jobs = (await q(db, `select jobname, schedule from cron.job order by jobname`)).map((j) => `${j.jobname}@${j.schedule}`);
  check(igual(jobs, ["equipo-webhooks-tick@30 seconds", "purgar-entregas-equipo@50 8 * * *"]), `los dos cron, una vez cada uno (${jobs})`);
  const tick = await uno(db, `select command from cron.job where jobname = 'equipo-webhooks-tick'`);
  check(/messenger-webhooks\?tarea=equipo/.test(tick?.command) && /where public\.equipo_webhooks_hay_trabajo\(\)/.test(tick?.command),
    "el tick despierta a messenger-webhooks?tarea=equipo solo si hay trabajo");
}

// ════ 2. Roles ════════════════════════════════════════════════════════════════
{
  const app = await probar(db, { persona: DUENO }, `select public.api_equipo_roles('["X"]', false)`);
  check(esError(app, /api_sin_llave/), `desde la app (sin key) no pasa (${corto(app)})`);
  const anon = await probar(db, "anon", `select public.api_equipo_roles('["X"]', false)`);
  check(esError(anon, /permission denied/), "anon no ejecuta api_equipo_roles");
  const ana = await probar(db, { persona: ANA, key: K_ANA }, `select public.api_equipo_roles('["X"]', false)`);
  check(esError(ana, /api_equipo_sin_permiso/), "la key de alguien que no es admin ni dueño no pasa");
  const sin = await probar(db, { persona: DUENO, key: K_SIN_SCOPE }, `select public.api_equipo_roles('["X"]', false)`);
  check(esError(sin, /equipo:write/), "una key sin equipo:write no pasa");
  const muchos = await probar(db, DUENO_K, `select public.api_equipo_roles($1::jsonb, false)`, [JSON.stringify(Array.from({ length: 51 }, (_, i) => `R${i}`))]);
  check(esError(muchos, /hasta 50/), "más de 50 roles: no");

  const LISTA = ["Closer", { nombre: "chatter" }, "Admin", "Dueño", "OWNER", "jefazo", "x".repeat(61), 7, "  ", "Viejo", "closer", { otro: 1 }];
  const r = await roles(DUENO_K, LISTA);
  check(r.ensayo === true, "con el interruptor apagado es ensayo");
  check(igual(r.creados, ["Closer"]) && igual(r.ya_estaban, ["chatter"]), `crearía Closer; chatter ya está (${corto(r)})`);
  const motivos = (r.rechazados as Fila[]).map((x) => `${String(x.nombre).slice(0, 8)}:${x.motivo}`).sort();
  check(igual(motivos, [":nombre_invalido", "7:nombre_invalido", "Admin:rol_de_admin", "Dueño:rol_de_admin", "OWNER:rol_de_admin",
    "Viejo:rol_inactivo", "jefazo:rol_de_admin", "xxxxxxxx:nombre_muy_largo", `{"otro"::nombre_invalido`].sort()),
    `rechaza admin, dueño, lo que role_groups marca admin, lo largo, lo que no es nombre y lo apagado (${motivos})`);
  const nada = await uno(db, `select count(*)::int n from public.roles_config where origen = 'plataforma'`);
  check(nada?.n === 0, "en ensayo no crea nada");

  await prender(T1);
  const r2 = await roles(DUENO_K, LISTA);
  check(r2.ensayo === false && igual(r2.creados, ["Closer"]), "con el interruptor prendido, lo crea");
  const closer = await q(db, `select rc.tenant_id, rc.is_active, rc.origen,
      (select count(*)::int from public.role_permissions rp where rp.role_id = rc.id) permisos
    from public.roles_config rc where rc.name = 'Closer'`);
  check(closer.length === 1 && closer[0].tenant_id === T1 && closer[0].is_active === true && closer[0].origen === "plataforma" && closer[0].permisos === 0,
    `en la agencia de la key, activo, de la plataforma y sin permisos (${corto(closer)})`);
  const r3 = await roles(DUENO_K, ["closer"]);
  check(igual(r3.creados, []) && igual(r3.ya_estaban, ["closer"]), "otra vez: ya está (sin mayúsculas ni acentos)");
  // El mapa de la agencia también cuenta como «ya está».
  await db.exec(`update public.integracion_equipo set mapa_roles = '{"Chat Agent": "Chatter"}' where tenant_id = '${T1}'`);
  const r4 = await roles(DUENO_K, ["chat agent"]);
  check(igual(r4.ya_estaban, ["chat agent"]) && igual(r4.creados, []), "lo que resuelve el mapa de la agencia no se crea");

  // La otra agencia: sus propios roles, aunque se llamen igual.
  const otraEnsayo = await roles(OLGA_K, ["Closer", "Solo de la otra", "Finanzas"]);
  check(otraEnsayo.ensayo === true && igual(otraEnsayo.creados, ["Closer", "Finanzas"]) && igual(otraEnsayo.ya_estaban, ["Solo de la otra"]),
    `la otra agencia no ve los roles de esta (${corto(otraEnsayo)})`);
  await prender(T2);
  await roles(OLGA_K, ["Closer"]);
  const porAgencia = (await q(db, `select tenant_id from public.roles_config where name = 'Closer' order by tenant_id`)).map((f) => f.tenant_id);
  check(igual(porAgencia, [T1, T2]), "cada agencia tiene su Closer");
  const t1 = await q(db, `select name from public.roles_config where tenant_id = '${T1}' and origen = 'plataforma'`);
  check(t1.length === 1, "la key de la otra no creó nada aquí");

  // Lo que el dueño tiene que configurar.
  const sp = await como(db, { persona: DUENO }, `select nombre from public.equipo_roles_sin_permisos()`);
  check(igual(sp.map((f) => f.nombre), ["Closer"]), "equipo_roles_sin_permisos: el Closer de mi agencia");
  const spOlga = await como(db, { persona: OLGA }, `select nombre from public.equipo_roles_sin_permisos()`);
  check(igual(spOlga.map((f) => f.nombre), ["Closer"]), "y la dueña de la otra ve el suyo");
  const spAna = await probar(db, { persona: ANA }, `select * from public.equipo_roles_sin_permisos()`);
  check(esError(spAna, /sin_permiso/), "alguien que no es admin ni dueño no lo ve");
  await db.exec(`insert into public.role_permissions (role_id, module, can_access)
    select id, 'cowork', false from public.roles_config where name = 'Closer' and tenant_id = '${T1}'`);
  check((await como(db, { persona: DUENO }, `select nombre from public.equipo_roles_sin_permisos()`)).length === 1,
    "un permiso en false no cuenta como configurado");
  await db.exec(`update public.role_permissions set can_access = true where role_id = (select id from public.roles_config where name = 'Closer' and tenant_id = '${T1}')`);
  check((await como(db, { persona: DUENO }, `select nombre from public.equipo_roles_sin_permisos()`)).length === 0, "con un permiso de verdad, sale de la lista");
  check((await como(db, { persona: OLGA }, `select nombre from public.equipo_roles_sin_permisos()`)).length === 1, "y el de la otra agencia sigue");

  // api_equipo_estado: el origen y los permisos de cada rol.
  const e = (await como(db, DUENO_K, `select public.api_equipo_estado() e`))[0].e as Fila;
  const porNombre = new Map((e.roles as Fila[]).map((x) => [x.nombre, x]));
  check(porNombre.get("Closer")?.origen === "plataforma" && porNombre.get("Closer")?.con_permisos === true, "estado: Closer, de la plataforma y con permisos");
  check(porNombre.get("Chatter")?.origen === null && porNombre.get("Chatter")?.con_permisos === true, "estado: Chatter, de Maven");
  check(porNombre.get("Finanzas")?.con_permisos === false, "estado: Finanzas, sin permisos");
  check(!porNombre.has("Solo de la otra"), "estado: nada de la otra agencia");
}

// ════ 3. Pendientes ═══════════════════════════════════════════════════════════
const PEND = [
  { correo: "Nueva@Kash.test", nombre: "Nueva", rol: "Closer", nivel: "agente", equipo: "Ventas A", reporta_a: "beto@kash.test" },
  { correo: "ana@kash.test", nombre: "Ana" },
  { correo: "sofi@gmail.test", nombre: "Sofi" },
  { correo: "no-es-correo" },
  { correo: "pepe@otra.test", nombre: "Pepe de la otra" },
  { correo: "raro@kash.test", nivel: "admin", reporta_a: "no es correo" },
];
{
  await prender(T1, false);
  const ensayo = await pendientes(DUENO_K, PEND);
  check(ensayo.ensayo === true && (await q(db, `select 1 from public.integracion_equipo_pendientes`)).length === 0,
    "con el interruptor apagado no se anota nada");
  await prender(T1);
  const r = await pendientes(DUENO_K, PEND);
  check(r.registradas === 3 && r.actualizadas === 0, `se anotan nueva, pepe (no tiene cuenta AQUÍ) y raro (${corto(r)})`);
  const ign = (r.ignoradas as Fila[]).map((x) => `${x.correo}:${x.motivo}`).sort();
  check(igual(ign, ["ana@kash.test:ya_tiene_cuenta", "no-es-correo:correo_invalido", "sofi@gmail.test:ya_tiene_cuenta"]),
    `quien ya tiene cuenta en la agencia (también una externa) no queda pendiente (${ign})`);
  const nueva = await uno(db, `select * from public.integracion_equipo_pendientes where correo = 'nueva@kash.test'`);
  check(nueva?.tenant_id === T1 && nueva?.estado === "pendiente" && nueva?.veces === 1 && nueva?.rol === "Closer" && nueva?.nivel === "agente"
    && nueva?.equipo === "Ventas A" && nueva?.reporta_a_correo === "beto@kash.test", "con todo lo que mandó la plataforma");
  const raro = await uno(db, `select nivel, reporta_a_correo from public.integracion_equipo_pendientes where correo = 'raro@kash.test'`);
  check(raro?.nivel === null && raro?.reporta_a_correo === null, "un nivel de admin o un jefe que no es correo no se guardan");

  const otra = await pendientes(DUENO_K, [{ correo: "nueva@kash.test", nombre: "Nueva Apellido", equipo: "Ventas B", reporta_a: "beto@kash.test" }]);
  const n2 = await uno(db, `select veces, nombre, equipo from public.integracion_equipo_pendientes where correo = 'nueva@kash.test'`);
  check(otra.actualizadas === 1 && n2?.veces === 2 && n2?.nombre === "Nueva Apellido" && n2?.equipo === "Ventas B", "otra vez: suma y refresca");

  // La otra agencia: su propia fila con el mismo correo.
  const deOlga = await pendientes(OLGA_K, [{ correo: "nueva@kash.test", nombre: "Otra Nueva" }]);
  const filas = await q(db, `select tenant_id, nombre from public.integracion_equipo_pendientes where correo = 'nueva@kash.test' order by tenant_id`);
  check(deOlga.registradas === 1 && filas.length === 2 && filas[0].nombre === "Nueva Apellido" && filas[1].tenant_id === T2,
    "la otra agencia anota la suya y no toca la de esta");

  // Quién los ve.
  const dueno = await como(db, { persona: DUENO }, `select tenant_id from public.integracion_equipo_pendientes`);
  check(dueno.length === 3 && dueno.every((f) => f.tenant_id === T1), "el dueño ve los de SU agencia");
  const olga = await como(db, { persona: OLGA }, `select tenant_id from public.integracion_equipo_pendientes`);
  check(olga.length === 1 && olga[0].tenant_id === T2, "la dueña de la otra, los suyos");
  check((await como(db, { persona: ANA }, `select 1 from public.integracion_equipo_pendientes`)).length === 0, "alguien que no es admin, ninguno");
  for (const sql of [
    `insert into public.integracion_equipo_pendientes (tenant_id, correo) values ('${T1}', 'x@kash.test')`,
    `update public.integracion_equipo_pendientes set estado = 'descartada'`,
    `delete from public.integracion_equipo_pendientes`,
  ]) {
    check(esError(await probar(db, { persona: DUENO }, sql), /permission denied/), `no se escribe a mano: ${sql.slice(0, 30)}`);
  }
  check(esError(await probar(db, "anon", `select 1 from public.integracion_equipo_pendientes`), /permission denied/), "anon no lee nada");

  // Resolver.
  const id = (c: string, t = T1) => uno(db, `select id from public.integracion_equipo_pendientes where correo = $1 and tenant_id = $2`, [c, t]).then((f) => f?.id);
  const idNueva = await id("nueva@kash.test");
  const idPepe = await id("pepe@otra.test");
  const idRaro = await id("raro@kash.test");
  const resolver = (quien: Quien, pid: string, accion: string, uid: string | null = null) =>
    probar(db, quien, `select public.equipo_pendiente_resolver($1, $2, $3) r`, [pid, accion, uid]);
  check(esError(await resolver({ persona: OLGA }, idNueva, "descartar"), /pendiente_no_existe/), "la dueña de otra agencia no resuelve uno de esta");
  check(esError(await resolver({ persona: ANA }, idNueva, "descartar"), /sin_permiso/), "alguien que no es admin no resuelve");
  check(esError(await resolver({ persona: DUENO }, idNueva, "borrar"), /accion_invalida/), "solo aprobar o descartar");
  check(esError(await resolver({ persona: DUENO }, idNueva, "aprobar"), /falta_user_id/), "aprobar pide la cuenta");
  check(esError(await resolver({ persona: DUENO }, idPepe, "aprobar", PEPE), /cuenta_no_coincide/),
    "la cuenta tiene que ser de esta agencia (pepe es de la otra, aunque el correo coincida)");
  check(esError(await resolver({ persona: DUENO }, idNueva, "aprobar", ANA), /cuenta_no_coincide/), "y con el mismo correo");

  // Descartar: queda descartada en los envíos siguientes.
  const d = await resolver({ persona: ADMIN }, idRaro, "descartar");
  check(Array.isArray(d) && d[0].r.estado === "descartada", "un admin descarta");
  await pendientes(DUENO_K, [{ correo: "raro@kash.test", nombre: "Raro Nuevo" }]);
  const raro2 = await uno(db, `select estado, veces, nombre from public.integracion_equipo_pendientes where id = $1`, [idRaro]);
  check(raro2?.estado === "descartada" && raro2?.veces === 2 && raro2?.nombre === null, "una descartada no vuelve: solo suma una vez");
  check(esError(await resolver({ persona: DUENO }, idRaro, "aprobar", ANA), /ya_resuelta/), "ni se aprueba después");

  // Aprobar: el frontend creó la cuenta (create_user la pone en la agencia de quien crea).
  await db.exec(`insert into auth.users (id, email, raw_app_meta_data) values ('${NUEVA}', 'nueva@kash.test', '{}');
    insert into public.profiles (id, full_name) values ('${NUEVA}', 'Nueva');
    insert into public.tenant_members (user_id, tenant_id) values ('${NUEVA}', '${T1}');`);
  const a = await resolver({ persona: DUENO }, idNueva, "aprobar", NUEVA);
  check(Array.isArray(a) && a[0].r.estado === "aprobada" && a[0].r.user_id === NUEVA && a[0].r.reporta_a === BETO, `aprobada (${corto(a)})`);
  const ip = await uno(db, `select tenant_id, equipo, reporta_a from public.integracion_equipo_personas where user_id = '${NUEVA}'`);
  check(ip?.tenant_id === T1 && ip?.equipo === "Ventas B" && ip?.reporta_a === BETO, "con el equipo y el jefe de la plataforma");
  const otraVez = await resolver({ persona: DUENO }, idNueva, "aprobar", NUEVA);
  check(Array.isArray(otraVez) && otraVez[0].r.estado === "aprobada", "repetir la misma aprobación no es un error");
  const yaTiene = await pendientes(DUENO_K, [{ correo: "nueva@kash.test" }]);
  check((yaTiene.ignoradas as Fila[])[0]?.motivo === "ya_tiene_cuenta", "y en el envío siguiente ya tiene cuenta");
  const deOlgaSigue = await uno(db, `select estado from public.integracion_equipo_pendientes where tenant_id = '${T2}'`);
  check(deOlgaSigue?.estado === "pendiente", "la de la otra agencia sigue pendiente");
}

// ════ 4. Horas y notas ════════════════════════════════════════════════════════
{
  const S = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  // 10/11 en Bogotá (UTC-5): ana 13:00–17:00 activa (4 h), 17:00–17:30 pausa; un tramo
  // que cruza la medianoche de Bogotá (23:00 del 10 → 01:00 del 11); pepe (la otra
  // agencia) y sofi (externa), también con horas.
  await db.exec(`insert into public.cowork_tiempo_segmentos (session_id, user_id, estado, started_at, last_seen_at, ended_at, seconds) values
    ('${S(1)}', '${ANA}', 'activo', '2026-11-10 18:00+00', '2026-11-10 22:00+00', '2026-11-10 22:00+00', 14400),
    ('${S(1)}', '${ANA}', 'pausa', '2026-11-10 22:00+00', '2026-11-10 22:30+00', '2026-11-10 22:30+00', 1800),
    ('${S(2)}', '${BETO}', 'activo', '2026-11-11 04:00+00', '2026-11-11 06:00+00', '2026-11-11 06:00+00', 7200),
    ('${S(3)}', '${PEPE}', 'activo', '2026-11-10 18:00+00', '2026-11-10 20:00+00', '2026-11-10 20:00+00', 7200),
    ('${S(4)}', '${SOFI}', 'activo', '2026-11-10 18:00+00', '2026-11-10 20:00+00', '2026-11-10 20:00+00', 7200);
  insert into public.tardanzas_registro (tenant_id, user_id, dia, turno_nombre, horario_asignado, entro_at, tarde_min) values
    ('${T1}', '${ANA}', '2026-11-10', 'Tarde', '12:45', '2026-11-10 18:00+00', 15),
    ('${T2}', '${PEPE}', '2026-11-10', 'Tarde', '12:00', '2026-11-10 18:00+00', 60);
  insert into public.monitor_capturas (user_id, tipo, cara_visible, fuera_de_lugar, perdonado, created_at) values
    ('${ANA}', 'camara', true, null, false, '2026-11-10 19:00+00'), ('${ANA}', 'camara', false, null, false, '2026-11-10 19:10+00'),
    ('${ANA}', 'pantalla', null, true, false, '2026-11-10 19:00+00'), ('${ANA}', 'pantalla', null, false, false, '2026-11-10 19:05+00'),
    ('${ANA}', 'pantalla', null, true, true, '2026-11-10 19:06+00'),
    ('${PEPE}', 'camara', true, null, false, '2026-11-10 19:00+00');`);
  const horas = async (quien: Quien, desde: string, hasta: string) =>
    (await como(db, quien, `select public.api_equipo_horas($1::date, $2::date) h`, [desde, hasta]))[0].h as Fila;
  const h = await horas(DUENO_K, "2026-11-10", "2026-11-10");
  const correos = (h.personas as Fila[]).map((p) => p.correo);
  check(h.desde === "2026-11-10" && h.hasta === "2026-11-10", "dice el rango");
  check(!correos.includes("pepe@otra.test") && !correos.includes("sofi@gmail.test") && !correos.includes("olga@otra.test"),
    `ni la otra agencia ni las cuentas externas (${correos})`);
  check(correos.includes("dueno@kash.test") && correos.includes("eva@kash.test") && !correos.includes("dario@kash.test"),
    "las personas activas van aunque no tengan horas; la de la papelera sin horas, no");
  const ana = (h.personas as Fila[]).find((p) => p.correo === "ana@kash.test");
  const dia = ana?.dias?.[0];
  check(ana?.dias?.length === 1 && dia?.fecha === "2026-11-10" && dia?.minutos_trabajados === 240 && dia?.minutos_pausa === 30
    && dia?.minutos_en_sala === 270 && dia?.sesiones === 1, `ana: 4 h trabajadas, 30 min de pausa (${corto(dia)})`);
  check(dia?.llego_tarde === true && dia?.minutos_tarde === 15 && dia?.hora_asignada === "12:45:00" && dia?.turno === "Tarde", "y la tardanza");
  const beto = (h.personas as Fila[]).find((p) => p.correo === "beto@kash.test");
  check(beto?.dias?.[0]?.minutos_trabajados === 60, `el tramo que cruza la medianoche de Bogotá se parte por día (${corto(beto?.dias)})`);
  const h2 = await horas(DUENO_K, "2026-11-10", "2026-11-11");
  const beto2 = (h2.personas as Fila[]).find((p) => p.correo === "beto@kash.test");
  check(igual(beto2?.dias?.map((x: Fila) => [x.fecha, x.minutos_trabajados]), [["2026-11-10", 60], ["2026-11-11", 60]]), "las dos mitades, cada una en su día");
  const ho = await horas(OLGA_K, "2026-11-10", "2026-11-10");
  const deOlga = (ho.personas as Fila[]).map((p) => p.correo).sort();
  check(igual(deOlga, ["olga@otra.test", "pepe@otra.test", "quique@otra.test"]), `la key de la otra agencia ve solo a los suyos (${deOlga})`);
  check((ho.personas as Fila[]).find((p) => p.correo === "pepe@otra.test")?.dias?.[0]?.minutos_tarde === 60, "con sus tardanzas");
  for (const [d, hh, que] of [["2026-11-10", "2026-11-09", "desde después de hasta"], ["2026-01-01", "2026-04-04", "más de 93 días"]]) {
    check(esError(await probar(db, DUENO_K, `select public.api_equipo_horas($1::date, $2::date)`, [d, hh]), /de 1 a 93/), `horas: ${que}, no`);
  }
  check(!esError(await probar(db, DUENO_K, `select public.api_equipo_horas('2026-01-01', '2026-04-03')`), /./), "93 días justos, sí");
  check(esError(await probar(db, { persona: DUENO }, `select public.api_equipo_horas('2026-11-10', '2026-11-10')`), /api_sin_llave/), "horas: desde la app, no");
  check(esError(await probar(db, { persona: ANA, key: K_ANA }, `select public.api_equipo_horas('2026-11-10', '2026-11-10')`), /api_equipo_sin_permiso/),
    "horas: la key de alguien que no es admin, no");

  const notas = async (quien: Quien) =>
    (await como(db, quien, `select public.api_equipo_notas('2026-11-10', '2026-11-10') n`))[0].n as Fila;
  const n = await notas(DUENO_K);
  const nc = (n.personas as Fila[]).map((p) => p.correo).sort();
  check(igual(nc, ["ana@kash.test", "beto@kash.test"]), `notas: solo los de esta agencia con datos (${nc})`);
  const na = (n.personas as Fila[]).find((p) => p.correo === "ana@kash.test")?.dias?.[0];
  // pantalla: 4,5 h (activo + pausa) de 8 → 25,3; cámara 1 de 2 con cara → 17,5; foco: 1
  // distraída de 3 (la perdonada no cuenta) → 13,3. Total 56,1.
  check(Number(na?.desglose?.pantalla) === 25.3 && Number(na?.desglose?.camara) === 17.5 && Number(na?.desglose?.foco) === 13.3 && Number(na?.nota) === 56.1,
    `notas: la fórmula de api_argos_notas (${corto(na)})`);
  check(na?.crudo?.capturas_distraido === 1 && na?.crudo?.segundos_en_pantalla === 16200 && na?.maximos?.pantalla === 45, "con lo crudo y los máximos");
  const no = await notas(OLGA_K);
  check(igual((no.personas as Fila[]).map((p) => p.correo), ["pepe@otra.test"]), "notas: la otra agencia, solo lo suyo");
  check(esError(await probar(db, DUENO_K, `select public.api_equipo_notas('2026-01-01', '2026-06-01')`), /de 1 a 93/), "notas: más de 93 días, no");
}

// ════ 5. Webhooks ═════════════════════════════════════════════════════════════
{
  const crear = (quien: Quien, key: string, url: string, eventos: string[] | null = null) =>
    probar(db, quien, `select public.equipo_webhook_crear($1, $2, $3) w`, [key, url, eventos]);
  check(esError(await crear({ persona: ANA }, K_DUENO, "https://hooks.backstage.io/maven"), /sin_permiso/), "crear: alguien que no es admin, no");
  check(esError(await crear("anon", K_DUENO, "https://hooks.backstage.io/maven"), /permission denied/), "crear: anon, no");
  check(esError(await crear({ persona: DUENO }, K_OLGA, "https://hooks.backstage.io/maven"), /llave_no_existe/), "crear: con la llave de otra agencia, no");
  check(esError(await crear({ persona: DUENO }, K_SIN_SCOPE, "https://hooks.backstage.io/maven"), /llave_sin_equipo/), "crear: una llave sin equipo:write, no");
  check(esError(await crear({ persona: DUENO }, K_DUENO, "http://hooks.backstage.io/maven"), /url_invalida/), "crear: sin https, no");
  check(esError(await crear({ persona: DUENO }, K_DUENO, "https://10.0.0.1/x"), /url_invalida/), "crear: una IP, no");
  check(esError(await crear({ persona: DUENO }, K_DUENO, "https://hooks.backstage.io/maven", ["equipo.otra_cosa"]), /eventos_invalidos/), "crear: un evento que no existe, no");
  const w1 = await crear({ persona: DUENO }, K_DUENO, "https://hooks.backstage.io:443");
  const W1 = Array.isArray(w1) ? w1[0].w as Fila : null;
  check(!!W1 && /^whsec_[A-Za-z0-9+/]{64}$/.test(W1.secreto) && W1.secret_last4 === W1.secreto.slice(-4) && W1.status === "active",
    `crear: devuelve el secreto UNA vez (${corto(w1)})`);
  check(igual(W1?.eventos, ["equipo.persona_entro", "equipo.persona_salio", "equipo.rol_cambio"]) && W1?.url_host === "hooks.backstage.io" && !("url" in (W1 ?? {})),
    "con los tres eventos, el host y sin la URL entera");
  const fila = await uno(db, `select w.url, w.tenant_id, s.secret from public.integracion_equipo_webhooks w join vault.secrets s on s.id = w.secreto_id where w.id = $1`, [W1?.id]);
  check(fila?.url === "https://hooks.backstage.io/" && fila?.tenant_id === T1 && fila?.secret === W1?.secreto,
    "la URL queda como la manda la edge (sin :443 y con /) y el secreto en Vault");
  check(esError(await crear({ persona: ADMIN }, K_DUENO, "https://otra.backstage.io/x"), /ya_tiene_webhook/), "una por llave");
  const w2 = await crear({ persona: OLGA }, K_OLGA, "https://hooks.otra-plataforma.io/eventos", ["equipo.persona_salio", "equipo.rol_cambio"]);
  const W2 = Array.isArray(w2) ? w2[0].w as Fila : null;
  check(!!W2 && W2.secreto !== W1?.secreto, "la otra agencia registra la suya, con otro secreto");

  const lista = (quien: Quien) => como(db, quien, `select public.equipo_webhooks() l`).then((r) => r[0].l as Fila[]);
  check(igual((await lista({ persona: DUENO })).map((w) => w.id), [W1?.id]), "equipo_webhooks: el dueño ve la de SU agencia");
  check(igual((await lista({ persona: OLGA })).map((w) => w.id), [W2?.id]), "y la dueña de la otra, la suya");
  check(esError(await probar(db, { persona: ANA }, `select public.equipo_webhooks()`), /sin_permiso/), "alguien que no es admin no las ve");
  for (const t of ["integracion_equipo_webhooks", "integracion_equipo_entregas"]) {
    check(esError(await probar(db, { persona: DUENO }, `select 1 from public.${t}`), /permission denied/), `${t}: nadie de la app la lee directo`);
  }

  const entregas = (w: string) => q(db, `select * from public.integracion_equipo_entregas where webhook_id = $1 order by created_at, id`, [w]);
  const limpiar = () => db.exec(`delete from public.integracion_equipo_entregas`);

  // Cambio de rol en esta agencia: solo a la suscripción de esta agencia.
  await db.exec(`update public.user_roles set role = 'Finanzas' where user_id = '${ANA}'`);
  const e1 = await entregas(W1!.id);
  check(e1.length === 1 && e1[0].evento === "equipo.rol_cambio" && e1[0].tenant_id === T1 && e1[0].user_id === ANA, "rol_cambio, encolado para esta agencia");
  const b1 = JSON.parse(e1[0].body);
  check(b1.id === e1[0].id && b1.type === "equipo.rol_cambio" && b1.api_version === "v1" && b1.agency_id === T1
    && b1.data.correo === "ana@kash.test" && b1.data.rol_anterior === "Chatter" && b1.data.rol === "Finanzas" && b1.data.via === "maven",
    `el cuerpo firmado (${corto(e1[0].body)})`);
  check(new Date(e1[0].next_attempt_at).getTime() - new Date(e1[0].created_at).getTime() === 20_000, "sale 20 s después (la ventana)");
  check((await entregas(W2!.id)).length === 0, "a la otra agencia no le llega nada");

  // La ventana junta: volver al rol de antes antes de que salga el aviso = nada.
  await db.exec(`update public.user_roles set role = 'Chatter' where user_id = '${ANA}'`);
  check((await entregas(W1!.id)).length === 0, "ida y vuelta en la ventana: no se avisa");
  await db.exec(`update public.user_roles set role = 'Finanzas' where user_id = '${ANA}'; update public.user_roles set role = 'Closer' where user_id = '${ANA}'`);
  const e2 = await entregas(W1!.id);
  check(e2.length === 1 && JSON.parse(e2[0].body).data.rol_anterior === "Chatter" && JSON.parse(e2[0].body).data.rol === "Closer",
    "dos cambios en la ventana: uno solo, del primero al último");
  await limpiar();

  // En la otra agencia: pepe a la papelera → solo a la suscripción de la otra.
  await db.exec(`update public.profiles set deleted_at = now() where id = '${PEPE}'`);
  check((await entregas(W1!.id)).length === 0, "la papelera de la otra agencia no le llega a esta");
  const e3 = await entregas(W2!.id);
  check(e3.length === 1 && e3[0].evento === "equipo.persona_salio" && JSON.parse(e3[0].body).data.motivo === "papelera" && e3[0].tenant_id === T2,
    "persona_salio (papelera), para la otra agencia");
  // Y si vuelve: la otra no está suscrita a persona_entro, pero se anulan.
  await db.exec(`update public.profiles set deleted_at = null where id = '${PEPE}'`);
  check((await entregas(W2!.id)).length === 0, "salió y volvió en la ventana: no se avisa nada");
  await limpiar();

  // Un alta desde la app: la cuenta (rol employee, sin agencia todavía), la agencia y el
  // rol, en tres pedidos distintos → UN persona_entro con el rol final.
  await db.exec(`insert into auth.users (id, email, raw_app_meta_data) values ('${PASAJERO}', 'pasajero@kash.test', '{}');
    insert into public.profiles (id, full_name) values ('${PASAJERO}', 'Pasajero');
    insert into public.user_roles (user_id, role) values ('${PASAJERO}', 'employee');`);
  check((await entregas(W1!.id)).length === 0, "sin agencia todavía, nada");
  await db.exec(`insert into public.tenant_members (user_id, tenant_id) values ('${PASAJERO}', '${T1}')`);
  await db.exec(`update public.user_roles set role = 'Closer' where user_id = '${PASAJERO}'`);
  const e4 = await entregas(W1!.id);
  const d4 = e4.length === 1 ? JSON.parse(e4[0].body).data : null;
  check(e4.length === 1 && e4[0].evento === "equipo.persona_entro" && d4?.rol === "Closer" && d4?.motivo === "alta" && d4?.correo === "pasajero@kash.test",
    `un solo persona_entro, con el rol final (${corto(e4.map((x) => x.evento))})`);
  check((await entregas(W2!.id)).length === 0, "a la otra agencia, nada");
  // Y se va antes de que salga: no se avisa ninguno.
  await db.exec(`delete from public.tenant_members where user_id = '${PASAJERO}'`);
  check((await entregas(W1!.id)).length === 0, "entró y salió en la ventana: nada");
  await db.exec(`insert into public.tenant_members (user_id, tenant_id) values ('${PASAJERO}', '${T1}')`);
  await limpiar();

  // Mudarse de agencia: sale de una y entra a la otra, cada aviso a la suya.
  await db.exec(`update public.tenant_members set tenant_id = '${T2}' where user_id = '${PASAJERO}'`);
  const s1 = await entregas(W1!.id), s2 = await entregas(W2!.id);
  check(s1.length === 1 && s1[0].evento === "equipo.persona_salio" && JSON.parse(s1[0].body).data.motivo === "fuera_de_la_agencia",
    "mudarse: persona_salio para la de antes");
  check(s2.length === 0, "y la nueva no está suscrita a persona_entro");
  await db.exec(`update public.tenant_members set tenant_id = '${T1}' where user_id = '${PASAJERO}'`);
  await limpiar();

  // Cuentas externas y gente sin cambio real: nada.
  await db.exec(`insert into public.user_roles (user_id, role) values ('${SOFI}', 'Chatter')`);
  await db.exec(`update public.user_roles set tenant_id = null where user_id = '${ANA}'`);
  check((await entregas(W1!.id)).length === 0, "ni una cuenta externa ni un cambio que no es de rol");

  // Por la API: via = api (la sesión de una key).
  await como(db, DUENO_K, `select public.api_equipo_aplicar($1::jsonb, '{"recibidas":1}'::jsonb, false)`,
    [JSON.stringify([{ user_id: EVA, campo: "rol", valor: "Finanzas" }, { user_id: CARLA, campo: "papelera", valor: null }])]);
  const e5 = await entregas(W1!.id);
  const via = e5.map((x) => `${x.evento}:${JSON.parse(x.body).data.via}`).sort();
  check(igual(via, ["equipo.persona_salio:api", "equipo.rol_cambio:api"]), `lo que hace la plataforma también se avisa, con via api (${via})`);
  await limpiar();

  // Pausada: no se encola; reanudada, sí.
  const cambiar = (quien: Quien, id: string, accion: string) => probar(db, quien, `select public.equipo_webhook_cambiar($1, $2) w`, [id, accion]);
  check(esError(await cambiar({ persona: OLGA }, W1!.id, "pausar"), /webhook_no_existe/), "la dueña de otra agencia no pausa la de esta");
  const pausada = await cambiar({ persona: DUENO }, W1!.id, "pausar");
  check(Array.isArray(pausada) && pausada[0].w.status === "paused", "pausar");
  await db.exec(`update public.user_roles set role = 'Chatter' where user_id = '${EVA}'`);
  check((await entregas(W1!.id)).length === 0, "pausada: no se encola");
  check(esError(await probar(db, { persona: DUENO }, `select public.equipo_webhook_probar($1)`, [W1!.id]), /webhook_no_activo/), "pausada: no se prueba");
  const reanudada = await cambiar({ persona: DUENO }, W1!.id, "reanudar");
  check(Array.isArray(reanudada) && reanudada[0].w.status === "active", "reanudar");
  check(esError(await cambiar({ persona: DUENO }, W1!.id, "romper"), /accion_invalida/), "solo pausar, reanudar o borrar");

  // Probar.
  const prueba = await probar(db, { persona: DUENO }, `select public.equipo_webhook_probar($1) p`, [W1!.id]);
  check(Array.isArray(prueba) && typeof prueba[0].p.entrega_id === "string", "probar: encola un webhook.test");
  check(esError(await probar(db, { persona: DUENO }, `select public.equipo_webhook_probar($1)`, [W1!.id]), /prueba_muy_seguida/), "una prueba cada 12 s");
  check(esError(await probar(db, { persona: OLGA }, `select public.equipo_webhook_probar($1)`, [W1!.id]), /webhook_no_existe/), "la otra agencia no prueba la de esta");

  // El despachador.
  check(esError(await probar(db, { persona: DUENO }, `select * from public.equipo_webhooks_reclamar(5, 60)`), /permission denied/), "reclamar: la app no");
  check(esError(await probar(db, "anon", `select * from public.equipo_webhooks_reclamar(5, 60)`), /permission denied/), "reclamar: anon no");
  await db.exec(`update public.user_roles set role = 'Finanzas' where user_id = '${EVA}'`); // un rol_cambio en la ventana
  await db.exec(`update public.user_roles set role = 'Chatter' where user_id = '${PEPE}'`); // nada (no cambió)
  await db.exec(`update public.user_roles set role = 'Solo de la otra' where user_id = '${QUIQUE}'`); // para la otra
  const reclamar = () => como(db, "service", `select * from public.equipo_webhooks_reclamar(10, 60)`);
  const r1 = await reclamar();
  check(r1.length === 1 && r1[0].evento === "webhook.test" && r1[0].secreto === W1!.secreto && r1[0].url === "https://hooks.backstage.io/" && r1[0].intento === 1,
    `reclamar: primero la prueba (lo demás espera su ventana), con el secreto y la URL (${corto(r1.map((x) => x.evento))})`);
  check(JSON.parse(r1[0].cuerpo).type === "webhook.test", "el cuerpo de la prueba");
  check((await reclamar()).length === 0, "reclamada: no se vuelve a reclamar");
  const anotar = (id: string, reclamo: string, accion: string, extra: Record<string, unknown> = {}) =>
    como(db, "service", `select public.equipo_webhooks_anotar($1, $2::timestamptz, $3, $4, $5, $6, $7, $8, $9) r`,
      [id, reclamo, accion, extra.codigo ?? null, extra.error ?? null, extra.incierto ?? false, extra.espera ?? null, extra.ms ?? null, extra.motivo ?? null])
      .then((r) => r[0].r as string);
  check(await anotar(r1[0].id, "2000-01-01T00:00:00Z", "entregado", { codigo: 200 }) === "perdio", "anotar con otro reclamo: perdió");
  check(await anotar(r1[0].id, r1[0].reclamo, "entregado", { codigo: 204, ms: 80 }) === "ok", "anotar: entregado");
  const t = await uno(db, `select state, delivered_at, last_status_code from public.integracion_equipo_entregas where id = $1`, [r1[0].id]);
  check(t?.state === "delivered" && t?.last_status_code === 204, "la prueba, entregada");

  // Las de la ventana ya vencida (se adelanta el reloj a mano).
  await db.exec(`update public.integracion_equipo_entregas set next_attempt_at = now() - interval '1 second' where state = 'pending'`);
  check((await como(db, "service", `select 1`)).length === 1 && (await uno(db, `select public.equipo_webhooks_hay_trabajo() h`))?.h === true, "hay trabajo");
  const r2 = await reclamar();
  const porAgencia = r2.map((x) => `${x.tenant_id === T1 ? "T1" : "T2"}:${x.evento}`).sort();
  check(igual(porAgencia, ["T1:equipo.rol_cambio", "T2:equipo.rol_cambio"]), `una de cada suscripción, cada una con SU secreto (${porAgencia})`);
  const deT2 = r2.find((x) => x.tenant_id === T2);
  check(deT2?.secreto === W2!.secreto && JSON.parse(deT2!.cuerpo).data.correo === "quique@otra.test", "la de la otra agencia, con su secreto y su persona");
  const deT1 = r2.find((x) => x.tenant_id === T1)!;
  check(await anotar(deT1.id, deT1.reclamo, "reintentar", { codigo: 500, error: "http_500", espera: 120 }) === "ok", "anotar: reintentar");
  const f1 = await uno(db, `select state, attempts, lease_until, next_attempt_at > now() + interval '100 seconds' espera, last_error from public.integracion_equipo_entregas where id = $1`, [deT1.id]);
  const wf = await uno(db, `select consecutive_failures, failing_since, status from public.integracion_equipo_webhooks where id = $1`, [W1!.id]);
  check(f1?.state === "pending" && f1?.attempts === 1 && f1?.lease_until === null && f1?.espera === true && f1?.last_error === "http_500",
    "sigue pendiente, sin reclamo, con la espera del Retry-After");
  check(wf?.consecutive_failures === 1 && wf?.failing_since !== null && wf?.status === "active", "la suscripción cuenta el fallo");
  // 72 h fallando: se detiene y lo pendiente se descarta.
  await db.exec(`update public.integracion_equipo_webhooks set failing_since = now() - interval '73 hours' where id = '${W1!.id}';
    update public.integracion_equipo_entregas set next_attempt_at = now() - interval '1 second' where id = '${deT1.id}'`);
  const r3 = await reclamar();
  const otraVez = r3.find((x) => x.id === deT1.id)!;
  check(otraVez?.intento === 2, "el segundo intento");
  await anotar(otraVez.id, otraVez.reclamo, "reintentar", { codigo: 503, error: "http_503" });
  const w72 = await uno(db, `select status, disabled_reason from public.integracion_equipo_webhooks where id = $1`, [W1!.id]);
  const e72 = await uno(db, `select state, drop_reason from public.integracion_equipo_entregas where id = $1`, [deT1.id]);
  check(w72?.status === "disabled" && w72?.disabled_reason === "receiver_failing" && e72?.state === "dropped" && e72?.drop_reason === "receiver_failing",
    "72 h fallando: detenida (receiver_failing) y lo pendiente, descartado");
  const w2Estado = await uno(db, `select status from public.integracion_equipo_webhooks where id = $1`, [W2!.id]);
  check(w2Estado?.status === "active", "la de la otra agencia sigue andando");
  // 410: se detiene en el acto.
  check(await anotar(deT2!.id, deT2!.reclamo, "detener", { codigo: 410, error: "http_410", motivo: "receiver_gone" }) === "ok", "anotar: detener");
  const w410 = await uno(db, `select status, disabled_reason from public.integracion_equipo_webhooks where id = $1`, [W2!.id]);
  check(w410?.status === "disabled" && w410?.disabled_reason === "receiver_gone", "un 410 la detiene (receiver_gone)");
  check((await anotar(deT2!.id, deT2!.reclamo, "entregado")) === "perdio", "una entrega descartada ya no se anota");

  // Reanudar y revocar la llave: se detiene sola.
  await cambiar({ persona: DUENO }, W1!.id, "reanudar");
  await db.exec(`update public.api_keys set revoked_at = now() where id = '${K_DUENO}'`);
  const rev = await uno(db, `select status, disabled_reason from public.integracion_equipo_webhooks where id = $1`, [W1!.id]);
  check(rev?.status === "disabled" && rev?.disabled_reason === "key_revoked", "revocar la llave la detiene");
  check(esError(await cambiar({ persona: DUENO }, W1!.id, "reanudar"), /llave_no_vigente/), "y con la llave revocada no se reanuda");
  // Una suscripción activa cuya llave perdió equipo:write sin pasar por el trigger: la
  // detiene el despachador antes de mandar.
  const w3 = await crear({ persona: DUENO }, K_DUENO_2, "https://hooks.backstage.io/otra");
  const W3 = Array.isArray(w3) ? w3[0].w as Fila : null;
  await db.exec(`update public.user_roles set role = 'Chatter' where user_id = '${EVA}';
    update public.integracion_equipo_entregas set next_attempt_at = now() - interval '1 second' where state = 'pending';
    alter table public.api_keys disable trigger equipo_webhooks_por_llave;
    update public.api_keys set scopes = '{employees:read}' where id = '${K_DUENO_2}';
    alter table public.api_keys enable trigger equipo_webhooks_por_llave;`);
  check((await reclamar()).length === 0, "el despachador no manda con una llave que ya no sirve");
  const w3e = await uno(db, `select status, disabled_reason from public.integracion_equipo_webhooks where id = $1`, [W3?.id]);
  check(w3e?.status === "disabled" && w3e?.disabled_reason === "scope_removed", "y la detiene (scope_removed)");

  // Las entregas, y borrar.
  const ent = await probar(db, { persona: DUENO }, `select public.equipo_webhook_entregas($1, 10) e`, [W1!.id]);
  check(Array.isArray(ent) && (ent[0].e as Fila[]).length >= 1 && (ent[0].e as Fila[]).every((x) => !("body" in x)), "equipo_webhook_entregas: las de mi agencia, sin el cuerpo");
  check(esError(await probar(db, { persona: OLGA }, `select public.equipo_webhook_entregas($1)`, [W1!.id]), /webhook_no_existe/), "la otra agencia no las ve");
  const secretos = (await uno(db, `select count(*)::int n from vault.secrets`))?.n;
  const borrado = await cambiar({ persona: DUENO }, W1!.id, "borrar");
  check(Array.isArray(borrado) && borrado[0].w.borrado === true, "borrar");
  check((await uno(db, `select count(*)::int n from vault.secrets`))?.n === secretos - 1, "y su secreto se va de Vault");
  check((await q(db, `select 1 from public.integracion_equipo_webhooks where id = $1`, [W1!.id])).length === 0, "la suscripción ya no está");

  // Que nada de esto haga fallar lo que lo dispara: con la tabla de entregas rota, el
  // cambio de rol igual se hace (y queda un WARNING).
  await cambiar({ persona: OLGA }, W2!.id, "reanudar");
  await db.exec(`alter table public.integracion_equipo_entregas add constraint rota check (false) not valid`);
  const pasa = await probar(db, "service", `select 1`);
  await db.exec(`update public.user_roles set role = 'Chatter' where user_id = '${QUIQUE}'`);
  const quique = await uno(db, `select role from public.user_roles where user_id = '${QUIQUE}'`);
  const encolada = await q(db, `select 1 from public.integracion_equipo_entregas where user_id = '${QUIQUE}' and state = 'pending'`);
  check(Array.isArray(pasa) && quique?.role === "Chatter" && encolada.length === 0, "si encolar falla, el cambio de rol igual se hace");
  await db.exec(`alter table public.integracion_equipo_entregas drop constraint rota`);

  // Permisos de las funciones internas.
  for (const f of ["equipo_evento_encolar(uuid, uuid, text, jsonb)", "equipo_webhook_detener(uuid, text)", "equipo_webhooks_hay_trabajo()",
    "equipo_agencia_que_administro()", "equipo_webhook_llave_no_sirve(uuid)", "equipo_evento_persona(uuid, boolean)"]) {
    const r = await uno(db, `select has_function_privilege('authenticated', 'public.${f}', 'execute') p`);
    check(r?.p === false, `la app no ejecuta ${f}`);
  }
  for (const f of ["equipo_webhooks_reclamar(integer, integer)", "equipo_webhooks_anotar(uuid, timestamptz, text, integer, text, boolean, integer, integer, text)"]) {
    const a = await uno(db, `select has_function_privilege('authenticated', 'public.${f}', 'execute') a, has_function_privilege('service_role', 'public.${f}', 'execute') s`);
    check(a?.a === false && a?.s === true, `${f}: solo la edge (service_role)`);
  }
  for (const f of ["api_equipo_roles(jsonb, boolean)", "api_equipo_pendientes(jsonb)", "api_equipo_horas(date, date)", "api_equipo_notas(date, date)",
    "equipo_pendiente_resolver(uuid, text, uuid)", "equipo_roles_sin_permisos()", "equipo_webhook_crear(uuid, text, text[])"]) {
    const a = await uno(db, `select has_function_privilege('anon', 'public.${f}', 'execute') a, has_function_privilege('authenticated', 'public.${f}', 'execute') u`);
    check(a?.a === false && a?.u === true, `${f}: authenticated sí (la función se cuida sola), anon no`);
  }
}

// ════ 6. Horario por semana y /equipo/argos ═══════════════════════════════════
{
  const [LUNA, MARTIN, NICO, OSCAR, RAUL, SARA, TOMAS, UGO, VERA] = [31, 32, 33, 34, 35, 36, 37, 38, 41].map(P);
  const nuevos: [string, string, string][] = [
    [LUNA, "luna@kash.test", T1], [MARTIN, "martin@kash.test", T1], [NICO, "nico@kash.test", T1], [OSCAR, "oscar@kash.test", T1],
    [RAUL, "raul@kash.test", T1], [SARA, "sara@kash.test", T1], [TOMAS, "tomas@kash.test", T1], [UGO, "ugo@kash.test", T1],
    [VERA, "vera@otra.test", T2],
  ];
  // Las llaves del dueño de arriba quedaron revocadas o sin el scope (sección 5): una nueva.
  const K_DUENO_3 = K(9);
  await db.exec(`insert into public.api_keys (id, scopes, tenant_id, acts_as_user_id) values ('${K_DUENO_3}', '{equipo:write}', '${T1}', '${DUENO}')`);
  const DUENO_K6: Quien = { persona: DUENO, key: K_DUENO_3 };
  for (const [id, correo, t] of nuevos) {
    await db.exec(`insert into auth.users (id, email, raw_app_meta_data) values ('${id}', '${correo}', '{}');
      insert into public.profiles (id, full_name, nivel) values ('${id}', '${correo.split("@")[0]}', 'agente');
      insert into public.tenant_members (user_id, tenant_id) values ('${id}', '${t}');
      insert into public.user_roles (user_id, role) values ('${id}', 'Chatter');`);
  }
  const DIAS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];
  const SEMANA = { lun: ["08:00:00", "16:00:00"], mar: ["08:00:00", "16:00:00"], mie: ["08:00:00", "16:00:00"],
    jue: ["08:00:00", "16:00:00"], vie: ["08:00:00", "16:00:00"], sab: null, dom: ["22:00:00", "06:00:00"] };
  const FILAS_SEMANA = ["0:22:00:00-06:00:00", "1:08:00:00-16:00:00", "2:08:00:00-16:00:00", "3:08:00:00-16:00:00",
    "4:08:00:00-16:00:00", "5:08:00:00-16:00:00", "6:descanso"];
  const mismoHorario = (a: Fila | null | undefined, b: Fila) => !!a && Object.keys(a).length === 7 && DIAS.every((d) => igual(a[d], b[d]));
  const aplicarH = async (quien: Quien, cambios: unknown[], ensayo = false) =>
    (await como(db, quien, `select public.api_equipo_aplicar($1::jsonb, '{"recibidas":1}'::jsonb, $2) r`, [JSON.stringify(cambios), ensayo]))[0].r as Fila;
  const filas = async (uid: string) =>
    (await q(db, `select dia, entrada::text e, salida::text s from public.horario_semanal where user_id = $1 order by dia`, [uid]))
      .map((f) => `${f.dia}:${f.e ? `${f.e}-${f.s}` : "descanso"}`);

  // ── Aplicar horario_semana (api_equipo_aplicar) ──
  const ens = await aplicarH(DUENO_K6, [{ user_id: LUNA, campo: "horario_semana", valor: JSON.stringify(SEMANA) }], true);
  // (jsonb ordena las claves: se compara campo por campo, no el texto del objeto)
  const aplicadosDe = (r: Fila) => ((r.aplicados ?? []) as Fila[]).map((x) => `${x.user_id}|${x.campo}`);
  check(ens.ensayo === true && igual(aplicadosDe(ens), [`${LUNA}|horario_semana`]) && (await filas(LUNA)).length === 0,
    `horario_semana en ensayo: se aplicaría y no se guarda (${corto(ens)})`);
  const ap = await aplicarH(DUENO_K6, [{ user_id: LUNA, campo: "horario_semana", valor: JSON.stringify(SEMANA) }]);
  check(ap.ensayo === false && igual(ap.rechazados, []), `horario_semana se aplica (${corto(ap)})`);
  check(igual(await filas(LUNA), FILAS_SEMANA), `los 7 días, con el sábado de descanso (${await filas(LUNA)})`);
  const MALOS: [string, unknown][] = [
    ["un día que no existe", JSON.stringify({ lun: ["08:00", "16:00"], domingo: ["10:00", "12:00"] })],
    ["una hora fuera de 24 h", JSON.stringify({ lun: ["25:00", "16:00"] })],
    ["entrada igual a salida", JSON.stringify({ lun: ["08:00", "08:00:00"] })],
    ["un día que no es una lista", JSON.stringify({ lun: "08:00-16:00" })],
    ["una lista de uno", JSON.stringify({ lun: ["08:00"] })],
    ["números en vez de horas", JSON.stringify({ lun: [8, 16] })],
    ["texto que no es JSON", "lunes a viernes"],
    ["JSON que no es un objeto", "[1, 2]"],
    ["un texto JSON", JSON.stringify("08:00")],
  ];
  for (const [que, valor] of MALOS) {
    const r = await aplicarH(DUENO_K6, [{ user_id: LUNA, campo: "horario_semana", valor }]);
    check(igual(r.aplicados, []) && r.rechazados?.[0]?.motivo === "horario_invalido", `horario_semana: ${que} → horario_invalido, sin romper (${corto(r)})`);
  }
  const obj = await aplicarH(DUENO_K6, [{ user_id: LUNA, campo: "horario_semana", valor: { lun: ["08:00", "16:00"] } }]);
  check(obj.rechazados?.[0]?.motivo === "valor_invalido", "un objeto en vez del texto con el JSON: valor_invalido");
  check(igual(await filas(LUNA), FILAS_SEMANA), "lo rechazado no tocó el horario que había");
  const prot = await aplicarH(DUENO_K6, [
    { user_id: ADMIN, campo: "horario_semana", valor: JSON.stringify(SEMANA) },
    { user_id: VERA, campo: "horario_semana", valor: JSON.stringify(SEMANA) },
  ]);
  check(igual((prot.rechazados as Fila[]).map((x) => x.motivo).sort(), ["no_es_de_la_agencia", "protegido"]),
    `ni a un admin ni a alguien de otra agencia (${corto(prot.rechazados)})`);
  check((await q(db, `select 1 from public.horario_semanal where user_id in ('${ADMIN}', '${VERA}')`)).length === 0, "y no se guardó nada de ellos");
  // null lo quita (vuelve a valer el horario de siempre).
  await aplicarH(DUENO_K6, [{ user_id: TOMAS, campo: "horario_semana", valor: JSON.stringify(SEMANA) }]);
  const quitar = await aplicarH(DUENO_K6, [{ user_id: TOMAS, campo: "horario_semana", valor: null }]);
  check(igual(aplicadosDe(quitar), [`${TOMAS}|horario_semana`]) && (await filas(TOMAS)).length === 0, "null quita el horario por semana");
  // La otra agencia pone el de los suyos con su key.
  await aplicarH(OLGA_K, [{ user_id: VERA, campo: "horario_semana", valor: JSON.stringify(SEMANA) }]);
  check(igual(await filas(VERA), FILAS_SEMANA), "la key de la otra agencia pone el horario de los suyos");

  // ── api_equipo_estado ──
  const est = (await como(db, DUENO_K6, `select public.api_equipo_estado() e`))[0].e as Fila;
  const enEstado = (id: string) => (est.personas as Fila[]).find((p) => p.id === id);
  check(mismoHorario(enEstado(LUNA)?.horario_semana, SEMANA), `estado: el horario por semana, los 7 días (${corto(enEstado(LUNA)?.horario_semana)})`);
  check(enEstado(ANA)?.horario_semana === null && enEstado(TOMAS)?.horario_semana === null, "estado: null para quien no tiene");
  check(!enEstado(VERA), "estado: nada de la otra agencia");

  // ── La RLS de horario_semanal ──
  check((await como(db, { persona: LUNA }, `select count(*)::int n from public.horario_semanal`))[0].n === 7, "la persona ve su horario por semana");
  check((await como(db, { persona: ANA }, `select count(*)::int n from public.horario_semanal`))[0].n === 0, "otra agente no ve el de nadie");
  const delJefe = await probar(db, { persona: DUENO }, `select count(*)::int n from public.horario_semanal where user_id = $1`, [LUNA]);
  check(Array.isArray(delJefe) && delJefe[0].n === 7, `quien la puede vigilar lo ve, sin que la política falle por permisos (${corto(delJefe)})`);
  check(esError(await probar(db, { persona: LUNA }, `insert into public.horario_semanal (user_id, dia, entrada, salida) values ($1, 6, '08:00', '12:00')`, [LUNA]),
    /permission denied/), "nadie lo escribe con su sesión");
  check(esError(await probar(db, { persona: DUENO }, `update public.horario_semanal set entrada = '07:00' where user_id = $1`, [LUNA]), /permission denied/),
    "ni el dueño desde la app (solo por api_equipo_aplicar)");
  check(esError(await probar(db, "anon", `select * from public.horario_semanal`), /permission denied/), "anon no lo lee");
  for (const f of ["turno_del_dia(uuid, date)", "equipo_horario_semana(uuid)", "equipo_horario_semana_valido(jsonb)"]) {
    const r = await uno(db, `select has_function_privilege('authenticated', 'public.${f}', 'execute') u, has_function_privilege('anon', 'public.${f}', 'execute') a`);
    check(r?.u === false && r?.a === false, `la app no ejecuta ${f}`);
  }

  // ── turno_del_dia, turno_en_curso y horario_de ──
  await db.exec(`update public.profiles set hora_entrada = '09:00', hora_salida = '17:00' where id in ('${MARTIN}', '${DARIO}', '${CARLA}');
    insert into public.cowork_libres (user_id) values ('${MARTIN}');`);
  const tramo = (f: Fila) => `${new Date(f.inicio).toISOString().slice(0, 16)}→${new Date(f.fin).toISOString().slice(0, 16)}`;
  const turno = async (uid: string, dia: string) => (await q(db, `select inicio, fin from public.turno_del_dia($1, $2::date)`, [uid, dia])).map(tramo);
  const enCurso = async (uid: string, ahora: string) =>
    (await q(db, `select inicio, fin from public.turno_en_curso($1, $2::timestamptz)`, [uid, ahora])).map(tramo);
  check(igual(await turno(LUNA, "2026-11-09"), ["2026-11-09T13:00→2026-11-09T21:00"]), "turno_del_dia: el lunes, 08:00–16:00 de Bogotá");
  check(igual(await turno(LUNA, "2026-11-14"), []), "turno_del_dia: el sábado es descanso, sin turno");
  check(igual(await turno(LUNA, "2026-11-15"), ["2026-11-16T03:00→2026-11-16T11:00"]), "turno_del_dia: el domingo de noche cruza la medianoche");
  check(igual(await turno(MARTIN, "2026-11-14"), ["2026-11-14T14:00→2026-11-14T22:00"]), "turno_del_dia: sin horario por semana, el de siempre (todos los días)");
  check(igual(await enCurso(LUNA, "2026-11-16T05:00:00Z"), ["2026-11-16T03:00→2026-11-16T11:00"]), "turno_en_curso: a la medianoche del lunes, el del domingo");
  check(igual(await enCurso(LUNA, "2026-11-14T15:00:00Z"), []), "turno_en_curso: el sábado, ninguno");
  check(igual(await enCurso(LUNA, "2026-11-09T15:00:00Z"), ["2026-11-09T13:00→2026-11-09T21:00"]), "turno_en_curso: el lunes a media mañana");
  check(igual(await enCurso(LUNA, "2026-11-09T21:00:00Z"), []), "turno_en_curso: al terminar, ya no");
  check(igual(await enCurso(MARTIN, "2026-11-14T15:00:00Z"), ["2026-11-14T14:00→2026-11-14T22:00"]), "turno_en_curso: sin horario por semana, igual que antes");
  const hd = await uno(db, `select extract(dow from now() at time zone 'America/Bogota')::int d, h.entrada::text e, h.salida::text s, h.exento
    from public.horario_de($1) h`, [LUNA]);
  const hoyEsperado = hd?.d === 6 ? [null, null] : hd?.d === 0 ? ["22:00:00", "06:00:00"] : ["08:00:00", "16:00:00"];
  check(igual([hd?.e, hd?.s], hoyEsperado) && hd?.exento === false, `horario_de: el de hoy en su horario por semana (${corto(hd)})`);
  const hm = await uno(db, `select h.entrada::text e, h.salida::text s from public.horario_de($1) h`, [MARTIN]);
  check(igual([hm?.e, hm?.s], ["09:00:00", "17:00:00"]), "horario_de: sin horario por semana, el de siempre");

  // ── Los vigías, con turnos de verdad alrededor de ahora ──
  // NICO: por semana, solo el día en que empezó su turno (hace 20 min, dura 5 h 20).
  // RAUL: el mismo turno, pero con hora_entrada/hora_salida (todos los días).
  // OSCAR: ese mismo horario de siempre, pero su horario por semana es todo descanso ({}).
  // SARA: por semana, un turno que terminó hace 30 min. UGO: el mismo, con el de siempre.
  // TOMAS: el mismo de siempre, pero con la semana entera de descanso.
  const ts = await uno(db, `select
      to_char(date_trunc('second', now() - interval '20 minutes') at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI:SS') ini,
      to_char(date_trunc('second', now() + interval '5 hours') at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI:SS') fin,
      to_char(date_trunc('second', now() - interval '2 hours') at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI:SS') ini2,
      to_char(date_trunc('second', now() - interval '30 minutes') at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI:SS') fin2`);
  const semanaDeUnDia = (uid: string, ini: string, fin: string) =>
    db.exec(`insert into public.horario_semanal (user_id, dia, entrada, salida)
      select '${uid}', d, case when d = extract(dow from '${ini}'::timestamp)::int then '${ini}'::timestamp::time end,
                          case when d = extract(dow from '${ini}'::timestamp)::int then '${fin}'::timestamp::time end
        from generate_series(0, 6) as d`);
  await semanaDeUnDia(NICO, ts.ini, ts.fin);
  await semanaDeUnDia(SARA, ts.ini2, ts.fin2);
  await db.exec(`update public.profiles set hora_entrada = '${ts.ini}'::timestamp::time, hora_salida = '${ts.fin}'::timestamp::time
      where id in ('${RAUL}', '${OSCAR}');
    update public.profiles set hora_entrada = '${ts.ini2}'::timestamp::time, hora_salida = '${ts.fin2}'::timestamp::time
      where id in ('${UGO}', '${TOMAS}');`);
  const vacia = await aplicarH(DUENO_K6, [{ user_id: OSCAR, campo: "horario_semana", valor: "{}" }, { user_id: TOMAS, campo: "horario_semana", valor: "{}" }]);
  check(igual(vacia.rechazados, []) && (await filas(OSCAR)).every((f) => f.endsWith("descanso")) && (await filas(OSCAR)).length === 7,
    "una semana sin días ({}) se guarda: los 7 de descanso");
  check((await enCurso(NICO, new Date().toISOString())).length === 1, "NICO está en su turno (por semana)");
  check((await enCurso(RAUL, new Date().toISOString())).length === 1, "RAUL está en su turno (el de siempre)");
  check((await enCurso(OSCAR, new Date().toISOString())).length === 0, "OSCAR descansa: su horario por semana manda sobre el de siempre");
  const estOscar = ((await como(db, DUENO_K6, `select public.api_equipo_estado() e`))[0].e.personas as Fila[]).find((p) => p.id === OSCAR);
  check(DIAS.every((d) => estOscar?.horario_semana?.[d] === null), "estado: la semana de descanso son 7 días en null (no «sin horario»)");

  await q(db, `select public.vigilar_fuera_de_cowork()`);
  const noEntro = await q(db, `select user_id, turno::text t, llamados from public.argos_no_entro where user_id in ('${NICO}', '${RAUL}', '${OSCAR}')`);
  check(noEntro.some((f) => f.user_id === NICO && f.llamados === 1 && f.t === ts.ini.slice(0, 10)),
    `con horario por semana, en su turno y sin entrar: Argos lo llama (${corto(noEntro)})`);
  check(noEntro.some((f) => f.user_id === RAUL), "sin horario por semana, igual que antes");
  check(!noEntro.some((f) => f.user_id === OSCAR), "en su día de descanso Argos no lo llama, aunque su horario de siempre diga que es su turno");
  const avisoNico = await q(db, `select message from public.notifications where user_id = '${NICO}' and type = 'cowork_no_entro_tu'`);
  check(avisoNico.length === 1 && String(avisoNico[0].message).includes(ts.ini.slice(11, 16)),
    `el aviso dice la hora a la que empezó su turno (${corto(avisoNico)})`);
  check((await q(db, `select 1 from public.notifications where user_id = '${OSCAR}'`)).length === 0, "a OSCAR no le llegó nada");

  await q(db, `select public.vigilar_tiempo_sin_pantalla()`);
  const resumen = await q(db, `select user_id, turno::text t, entro from public.argos_tiempo_avisos
    where tipo = 'resumen' and user_id in ('${SARA}', '${UGO}', '${TOMAS}')`);
  check(resumen.some((f) => f.user_id === SARA && f.t === ts.ini2.slice(0, 10) && f.entro === false),
    `el turno de su día (por semana) tiene su resumen al cerrar (${corto(resumen)})`);
  check(resumen.some((f) => f.user_id === UGO), "resumen: sin horario por semana, igual que antes");
  check(!resumen.some((f) => f.user_id === TOMAS), "resumen: un día de descanso no tiene");

  // ── GET /equipo/argos (api_equipo_argos) ──
  const S = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  await db.exec(`insert into public.cowork_tiempo_segmentos (session_id, user_id, estado, started_at, last_seen_at, ended_at, seconds) values
    ('${S(1)}', '${LUNA}', 'activo', '2026-11-02 13:00+00', '2026-11-02 15:00+00', '2026-11-02 15:00+00', 7200),
    ('${S(1)}', '${LUNA}', 'sin_pantalla', '2026-11-02 15:00+00', '2026-11-02 15:20+00', '2026-11-02 15:20+00', 1200),
    ('${S(1)}', '${LUNA}', 'pausa', '2026-11-02 15:20+00', '2026-11-02 15:50+00', '2026-11-02 15:50+00', 1800),
    ('${S(1)}', '${LUNA}', 'activo', '2026-11-02 15:50+00', '2026-11-02 21:00+00', '2026-11-02 21:00+00', 18600),
    ('${S(2)}', '${LUNA}', 'activo', '2026-11-07 15:00+00', '2026-11-07 16:00+00', '2026-11-07 16:00+00', 3600),
    ('${S(3)}', '${LUNA}', 'activo', '2026-11-09 03:30+00', '2026-11-09 04:00+00', '2026-11-09 04:00+00', 1800),
    ('${S(4)}', '${DARIO}', 'activo', '2026-11-02 15:00+00', '2026-11-02 16:00+00', '2026-11-02 16:00+00', 3600),
    ('${S(5)}', '${VERA}', 'activo', '2026-11-02 13:00+00', '2026-11-02 14:00+00', '2026-11-02 14:00+00', 3600);
  insert into public.cowork_fuera (user_id, tenant_id, desde, hasta, motivo, llamados, reportado_at) values
    ('${LUNA}', '${T1}', '2026-11-02 16:00+00', '2026-11-02 16:25+00', 'volvio', 3, '2026-11-02 16:05+00');
  insert into public.argos_reportes (user_id, tipo, created_at) values
    ('${LUNA}', 'camara_apagada', '2026-11-02 14:00+00'), ('${LUNA}', 'sin_pantalla', '2026-11-02 15:10+00'),
    ('${LUNA}', 'camara_apagada', '2026-11-02 22:00+00');
  insert into public.monitor_eventos (user_id, tipo, estado, created_at) values
    ('${LUNA}', 'celular', 'falta', '2026-11-02 14:30+00'), ('${LUNA}', 'celular', 'descartado', '2026-11-02 15:30+00'),
    ('${LUNA}', 'celular', 'pendiente', '2026-11-02 21:30+00');
  insert into public.monitor_capturas (user_id, tipo, cara_visible, fuera_de_lugar, perdonado, created_at) values
    ('${LUNA}', 'pantalla', null, false, false, '2026-11-02 13:30+00'), ('${LUNA}', 'pantalla', null, false, false, '2026-11-02 14:30+00'),
    ('${LUNA}', 'pantalla', null, false, false, '2026-11-02 20:59+00'), ('${LUNA}', 'camara', true, null, false, '2026-11-02 14:00+00'),
    ('${LUNA}', 'pantalla', null, false, false, '2026-11-02 21:05+00');
  insert into public.argos_no_entro (user_id, turno, llamados, ultimo_llamado_at, reportado_at, tenant_id) values
    ('${LUNA}', '2026-11-03', 3, '2026-11-03 13:40+00', '2026-11-03 13:40+00', '${T1}');`);
  const argos = async (quien: Quien, desde: string, hasta: string) =>
    (await como(db, quien, `select public.api_equipo_argos($1::date, $2::date) a`, [desde, hasta]))[0].a as Fila;
  const a = await argos(DUENO_K6, "2026-11-02", "2026-11-08");
  const porCorreo = new Map((a.personas as Fila[]).map((p) => [p.correo, p]));
  check(a.desde === "2026-11-02" && a.hasta === "2026-11-08", "argos: dice el rango");
  const correosA = [...porCorreo.keys()];
  check(!correosA.some((c) => ["dueno@kash.test", "admin@kash.test", "sofi@gmail.test", "pepe@otra.test", "vera@otra.test", "olga@otra.test"].includes(c)),
    `argos: sin admins ni dueños, sin cuentas externas, sin la otra agencia (${correosA})`);
  const luna = porCorreo.get("luna@kash.test");
  check(luna?.vigilado === true && luna?.expediente_url === `https://app.maven-ai.me/hr/expediente/${LUNA}`, `argos: vigilado y el link a su expediente (${corto(luna)})`);
  check(igual(luna?.dias?.map((d: Fila) => d.fecha), ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-08"]),
    `argos: un día por turno; el sábado de descanso no aparece aunque haya entrado (${luna?.dias?.map((d: Fila) => d.fecha)})`);
  const lun = luna?.dias?.[0] as Fila;
  check(Date.parse(lun?.turno?.inicio) === Date.parse("2026-11-02T13:00:00Z") && Date.parse(lun?.turno?.fin) === Date.parse("2026-11-02T21:00:00Z")
    && lun?.en_curso === false, `argos: el turno del lunes (${corto(lun?.turno)})`);
  check(lun?.entro === true && lun?.sin_pantalla_min === 75 && lun?.permitido_min === 40,
    `argos: 20 sin pantalla + 30 de pausa + 25 fuera de Cowork = 75 de 40 permitidos (${corto(lun)})`);
  check(lun?.fuera_de_cowork_veces === 1 && lun?.fuera_de_cowork_min === 25 && lun?.llamados_fuera === 3 && lun?.reportado_fuera === true,
    "argos: la salida de Cowork, con sus llamados y el reporte");
  const rs = lun?.reportes_en_sala as Fila | undefined;
  check(Object.keys(rs ?? {}).length === 3 && rs?.camara_apagada === 1 && rs?.fuera_cuadro === 0 && rs?.sin_pantalla === 1 && lun?.faltas === 1 && lun?.fotos === 3,
    `argos: reportes en la sala, faltas (sin las descartadas) y fotos de pantalla, solo dentro del turno (${corto(lun?.reportes_en_sala)})`);
  const mar = luna?.dias?.[1] as Fila;
  check(mar?.entro === false && mar?.sin_pantalla_min === 0 && mar?.no_entro_llamados === 3 && mar?.no_entro_reportado === true,
    `argos: el martes no entró y Argos lo reportó (${corto(mar)})`);
  check(luna?.dias?.[2]?.no_entro_llamados === 0 && luna?.dias?.[2]?.no_entro_reportado === false, "argos: sin llamados, en cero");
  check(luna?.dias?.[5]?.entro === true, "argos: el turno del domingo de noche cuenta lo del lunes de madrugada");
  const martin = porCorreo.get("martin@kash.test");
  check(martin?.vigilado === false && martin?.dias?.length === 7, "argos: sin horario por semana, un turno cada día; libre de Cowork = no vigilado");
  check(igual(porCorreo.get("ana@kash.test")?.dias, []), "argos: quien no tiene horario va con dias = []");
  const dario = porCorreo.get("dario@kash.test");
  check(dario?.dias?.length === 7 && dario?.dias?.[0]?.entro === true, "argos: alguien de la papelera que entró en el rango, con sus turnos de antes de irse");
  const carlaBorrada = await uno(db, `select deleted_at is not null b from public.profiles where id = '${CARLA}'`);
  check(carlaBorrada?.b === true && !porCorreo.has("carla@kash.test"), "argos: alguien de la papelera que no entró, no");
  const ao = await argos(OLGA_K, "2026-11-02", "2026-11-08");
  const deOlga = (ao.personas as Fila[]).map((p) => p.correo).sort();
  check(igual(deOlga, ["pepe@otra.test", "quique@otra.test", "vera@otra.test"]), `argos: la key de la otra agencia ve solo a los suyos, sin su dueña (${deOlga})`);
  check((ao.personas as Fila[]).find((p) => p.correo === "vera@otra.test")?.dias?.[0]?.entro === true, "argos: con lo de los suyos");
  // Un turno en curso va marcado; uno que no empezó, no va.
  const hoy = await uno(db, `select ((now() at time zone 'America/Bogota')::date - 1)::text a, ((now() at time zone 'America/Bogota')::date + 1)::text b`);
  const ahora = await argos(DUENO_K6, hoy.a, hoy.b);
  const nico = (ahora.personas as Fila[]).find((p) => p.correo === "nico@kash.test");
  check(nico?.dias?.length === 1 && nico?.dias?.[0]?.en_curso === true && nico?.dias?.[0]?.entro === false, `argos: el turno en curso (${corto(nico?.dias)})`);
  const futuros = (ahora.personas as Fila[]).flatMap((p) => p.dias as Fila[]).filter((d) => Date.parse(d.turno.inicio) > Date.now());
  check(futuros.length === 0, "argos: ningún turno que todavía no empieza");
  // La puerta y el rango, como horas y notas.
  check(esError(await probar(db, DUENO_K6, `select public.api_equipo_argos('2026-01-01', '2026-04-04')`), /de 1 a 93/), "argos: más de 93 días, no");
  check(esError(await probar(db, DUENO_K6, `select public.api_equipo_argos('2026-11-10', '2026-11-09')`), /de 1 a 93/), "argos: desde después de hasta, no");
  check(esError(await probar(db, { persona: DUENO }, `select public.api_equipo_argos('2026-11-02', '2026-11-08')`), /api_sin_llave/), "argos: desde la app, no");
  check(esError(await probar(db, { persona: ANA, key: K_ANA }, `select public.api_equipo_argos('2026-11-02', '2026-11-08')`), /api_equipo_sin_permiso/),
    "argos: la key de alguien que no es admin, no");
  const g = await uno(db, `select has_function_privilege('anon', 'public.api_equipo_argos(date, date)', 'execute') a,
    has_function_privilege('authenticated', 'public.api_equipo_argos(date, date)', 'execute') u`);
  check(g?.a === false && g?.u === true, "api_equipo_argos(date, date): authenticated sí (la función se cuida sola), anon no");
  for (const f of ["vigilar_fuera_de_cowork()", "vigilar_tiempo_sin_pantalla()"]) {
    const r = await uno(db, `select has_function_privilege('authenticated', 'public.${f}', 'execute') u`);
    check(r?.u === false, `la app no ejecuta ${f}`);
  }
}

console.log(ok.map((m) => `ok  ${m}`).join("\n"));
if (mal.length) {
  console.error(mal.map((m) => `MAL ${m}`).join("\n"));
  Deno.exit(1);
}
console.log(`\n${ok.length} ok`);
