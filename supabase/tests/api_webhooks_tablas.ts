// Lo que la base garantiza de los webhooks del Messenger (migración
// 20260926120000_api_webhooks_tablas.sql), probado contra un Postgres de verdad
// (PGlite) con el esquema de prod al lado.
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/api_webhooks_tablas.ts [otra-migración.sql]
//
// --node-modules-dir=none: el package.json de la raíz haría que Deno busque
// PGlite en node_modules, donde no está. --no-lock: que no toque el deno.lock de
// las edge functions.
//
// Corre en el guard de cada PR (guard-edge-functions.yml) y a mano antes de tocar
// estas tablas. Sale con código 1 si algo falla. El esquema base (columnas, api_keys_reglas_messenger,
// api_key_persona_vigente y los permisos por defecto de public) está copiado de
// prod el 26/09/2026: si esas piezas cambian en prod, hay que copiarlas de nuevo.
// PGlite tiene UNA sola conexión: las carreras (SKIP LOCKED, FOR SHARE) se
// razonaron, no se prueban acá.
import { PGlite } from "npm:@electric-sql/pglite@0.3";
import { normalizarUrlDeWebhook, type Resultado } from "../functions/_shared/webhook-salida.ts";
import { COLS_ENTREGA, type Contexto, type Datos, type FilaEndpoint, type Llave, servirWebhook } from "../functions/manage-api-keys/webhooks.ts";
import { sellarSecreto } from "../functions/_shared/webhook-salida.ts";
import { codificarCursor } from "../functions/public-api/messenger-formato.ts";
import { type DatosDespacho, despachar, type Endpoint as EndpointDespacho, type Guarda } from "../functions/messenger-webhooks/despachador.ts";
import type { PaginaDelFeed } from "../functions/messenger-webhooks/feed.ts";
const MIG = Deno.readTextFileSync(
  Deno.args[0] ?? new URL("../migrations/20260926120000_api_webhooks_tablas.sql", import.meta.url),
);
// La del despachador (PR 4): api_webhooks_timbrar y el gate con el respaldo de dos
// agencias. Se aplica en todas las bases, como queda prod.
const MIG4 = Deno.readTextFileSync(new URL("../migrations/20260926160000_api_webhooks_despachador.sql", import.meta.url));
const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);

const ALVARO = "00000000-0000-0000-0000-00000000000a"; // persona de la llave
const ANA = "00000000-0000-0000-0000-0000000000a2";    // otra admin
const BETO = "00000000-0000-0000-0000-00000000000b";
const T1 = "10000000-0000-0000-0000-000000000001";
const T2 = "10000000-0000-0000-0000-000000000002";
const K_MSG = "20000000-0000-0000-0000-000000000001";
const K_SIN = "20000000-0000-0000-0000-000000000002";
const K_REV = "20000000-0000-0000-0000-000000000003";
const K_VENC = "20000000-0000-0000-0000-000000000004";
const K_ANA = "20000000-0000-0000-0000-000000000005";
const K_SINIP = "20000000-0000-0000-0000-000000000006";
const C1 = "30000000-0000-0000-0000-000000000001"; // Alvaro + Beto
const C2 = "30000000-0000-0000-0000-000000000002"; // Ana + Beto (Alvaro NO está)
const URL_OK = "https://hooks.integrador.example/maven/abc?x=1";

const BASE = `
create role anon; create role authenticated; create role service_role bypassrls;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create schema auth;
create table auth.users (id uuid primary key, banned_until timestamptz);
create table public.tenants (id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null, active boolean not null default true, created_at timestamptz not null default now());
alter table public.tenants enable row level security;
create table public.tenant_members (user_id uuid, tenant_id uuid references public.tenants(id), role text, created_at timestamptz default now());
create table public.profiles (id uuid primary key, full_name text, deleted_at timestamptz);
create table public.api_keys (
  id uuid primary key default gen_random_uuid(), name text not null, key_prefix text not null, key_hash text not null unique,
  scopes text[] not null default '{}', created_by uuid references auth.users(id) on delete set null, created_by_email text,
  created_at timestamptz not null default now(), last_used_at timestamptz, request_count bigint not null default 0,
  expires_at timestamptz, revoked_at timestamptz, revoked_by uuid references auth.users(id) on delete set null,
  ip_whitelist text[] not null default '{}', last_four text, tenant_id uuid not null references public.tenants(id),
  acts_as_user_id uuid not null references auth.users(id) on delete cascade,
  limite_por_hora integer not null default 1000 check (limite_por_hora > 0), ventana_inicio timestamptz, ventana_pedidos integer not null default 0,
  limite_por_minuto integer not null default 60 check (limite_por_minuto > 0), minuto_inicio timestamptz, minuto_pedidos integer not null default 0);
alter table public.api_keys enable row level security;
CREATE OR REPLACE FUNCTION public.api_key_persona_vigente(_usuario uuid, _agencia uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  select exists (select 1 from public.profiles p where p.id = _usuario and p.deleted_at is null)
     and not exists (select 1 from auth.users u where u.id = _usuario and u.banned_until > now())
     and exists (select 1 from public.tenant_members tm where tm.user_id = _usuario and tm.tenant_id = _agencia); $f$;
revoke all on function public.api_key_persona_vigente(uuid, uuid) from public, anon, authenticated;
CREATE OR REPLACE FUNCTION public.api_key_vigente(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  select public.api_key_persona_vigente(k.acts_as_user_id, k.tenant_id) from public.api_keys k where k.id = _id; $f$;
revoke all on function public.api_key_vigente(uuid) from public, anon, authenticated;
CREATE OR REPLACE FUNCTION public.api_keys_reglas_messenger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
declare
  _tiene boolean := exists (select 1 from unnest(new.scopes) s where s like 'messenger:%');
  _tenia boolean := tg_op = 'UPDATE' and exists (select 1 from unnest(old.scopes) s where s like 'messenger:%');
begin
  if not _tiene then return new; end if;
  if tg_op = 'UPDATE' and not _tenia then raise exception 'api_keys: el permiso de Messenger solo se puede poner al crear una llave nueva'; end if;
  if tg_op = 'INSERT' and coalesce(new.acts_as_user_id, new.created_by) is distinct from new.created_by then raise exception 'api_keys: una llave con Messenger lee las conversaciones de quien la crea, no las de otra persona'; end if;
  if coalesce(cardinality(new.ip_whitelist), 0) = 0 then raise exception 'api_keys: una llave con Messenger necesita IPs fijas'; end if;
  if exists (select 1 from unnest(new.ip_whitelist) ip where ip like '%/%') then raise exception 'api_keys: una llave con Messenger va con IPs exactas, sin rangos'; end if;
  if new.expires_at is null then raise exception 'api_keys: una llave con Messenger necesita fecha de vencimiento'; end if;
  if tg_op = 'INSERT' and (new.expires_at <= now() or new.expires_at > now() + interval '90 days') then raise exception 'api_keys: una llave con Messenger vence en el futuro y a 90 días como máximo'; end if;
  if tg_op = 'UPDATE' and new.expires_at > old.expires_at then raise exception 'api_keys: a una llave con Messenger no se le extiende el vencimiento; creá otra'; end if;
  return new;
end; $f$;
CREATE TRIGGER api_keys_reglas_messenger BEFORE INSERT OR UPDATE OF scopes, ip_whitelist, expires_at ON public.api_keys FOR EACH ROW EXECUTE FUNCTION api_keys_reglas_messenger();
create table public.chat_participants (id uuid primary key default gen_random_uuid(), conversation_id uuid not null, user_id uuid not null, role text not null default 'member',
  joined_at timestamptz not null default now(), last_read_at timestamptz, is_muted boolean not null default false, notifications_mode text not null default 'all', unique (conversation_id, user_id));
create index on public.chat_participants (user_id);
create table public.chat_messages (id uuid primary key default gen_random_uuid(), conversation_id uuid not null, sender_id uuid not null, content text,
  type text not null default 'text', is_deleted boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.chat_messages (conversation_id, created_at desc);
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;
-- pg_cron falso
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $f$ insert into cron.job(jobname, schedule, command) values (n, s, c) returning jobid $f$;
create function cron.unschedule(n text) returns boolean language sql as $f$ delete from cron.job where jobname = n returning true $f$;

insert into auth.users values ('${ALVARO}', null), ('${ANA}', null), ('${BETO}', null);
insert into public.tenants(id, slug, name) values ('${T1}', 'kash', 'Kash');
insert into public.tenant_members(user_id, tenant_id) values ('${ALVARO}','${T1}'), ('${ANA}','${T1}'), ('${BETO}','${T1}');
insert into public.profiles values ('${ALVARO}','Alvaro',null), ('${ANA}','Ana',null), ('${BETO}','Beto',null);
insert into public.api_keys(id, name, key_prefix, key_hash, created_by, acts_as_user_id, tenant_id, scopes, ip_whitelist, expires_at) values
  ('${K_MSG}', 'msg', 'p', 'h1', '${ALVARO}', '${ALVARO}', '${T1}', '{messenger:read}', '{1.2.3.4}', now() + interval '30 days'),
  ('${K_SIN}', 'sin', 'p', 'h2', '${ALVARO}', '${ALVARO}', '${T1}', '{creators:read}', '{1.2.3.4}', now() + interval '30 days'),
  ('${K_REV}', 'rev', 'p', 'h3', '${ALVARO}', '${ALVARO}', '${T1}', '{messenger:read}', '{1.2.3.4}', now() + interval '30 days'),
  ('${K_VENC}', 'venc', 'p', 'h4', '${ALVARO}', '${ALVARO}', '${T1}', '{messenger:read}', '{1.2.3.4}', now() + interval '30 days'),
  ('${K_ANA}', 'ana', 'p', 'h5', '${ANA}', '${ANA}', '${T1}', '{messenger:read}', '{5.6.7.8}', now() + interval '30 days');
update public.api_keys set revoked_at = now() where id = '${K_REV}';
update public.api_keys set expires_at = now() - interval '1 minute' where id = '${K_VENC}';
-- Una llave con Messenger SIN IPs no se puede crear (la regla de api_keys); se arma saltándola, para probar el candado propio.
alter table public.api_keys disable trigger api_keys_reglas_messenger;
insert into public.api_keys(id, name, key_prefix, key_hash, created_by, acts_as_user_id, tenant_id, scopes, ip_whitelist, expires_at) values
  ('${K_SINIP}', 'sinip', 'p', 'h6', '${ALVARO}', '${ALVARO}', '${T1}', '{messenger:read}', '{}', now() + interval '30 days');
alter table public.api_keys enable trigger api_keys_reglas_messenger;
insert into public.chat_participants(conversation_id, user_id) values ('${C1}','${ALVARO}'), ('${C1}','${BETO}'), ('${C2}','${ANA}'), ('${C2}','${BETO}');
`;

async function nueva(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(BASE);
  await db.exec("begin;\n" + MIG + "\ncommit;");
  await db.exec("begin;\n" + MIG4 + "\ncommit;");
  return db;
}
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as any[];
const uno = async (db: PGlite, sql: string) => (await q(db, sql))[0];
async function falla(db: PGlite, sql: string, patron: RegExp, m: string) {
  try { await db.exec(sql); mal.push(`${m} (NO falló)`); }
  catch (e) { const t = String((e as Error).message); check(patron.test(t), `${m} → ${t.slice(0, 100)}`); }
}
async function anda(db: PGlite, sql: string, m: string) {
  try { await db.exec(sql); ok.push(m); } catch (e) { mal.push(`${m} (falló: ${String((e as Error).message).slice(0, 140)})`); }
}
async function comoRol(db: PGlite, rol: string, sql: string) {
  await db.exec(`begin; set local role ${rol};`);
  try { return (await db.query(sql)).rows as any[]; } finally { await db.exec("rollback"); }
}
async function fallaComoRol(db: PGlite, rol: string, sql: string, patron: RegExp, m: string) {
  try { await comoRol(db, rol, sql); mal.push(`${m} (NO falló)`); }
  catch (e) { const t = String((e as Error).message); check(patron.test(t), `${m} → ${t.slice(0, 100)}`); }
}
const alta = (extra: Partial<Record<string, string>> = {}) => {
  const c = { id: "gen_random_uuid()", api_key_id: `'${K_MSG}'`, url: `'${URL_OK}'`, created_by: `'${ALVARO}'`,
    secret_cipher: "'c'", secret_nonce: "'n'", secret_last4: "'abcd'", url_host: "'x'", tenant_id: `'${T1}'`, acts_as_user_id: `'${ALVARO}'`, ...extra };
  return `insert into api_webhook_endpoints(${Object.keys(c).join(",")}) values (${Object.values(c).join(",")})`;
};
const EP = "40000000-0000-0000-0000-000000000001";
// Deja el endpoint EP activo, como lo haría la edge: prueba entregada + cursor en ahora − 10 s.
async function activar(db: PGlite, id = EP) {
  await db.exec(`insert into api_webhook_deliveries(endpoint_id, event_type, body, state, delivered_at, last_status_code, attempts) values ('${id}', 'webhook.test', '{}', 'delivered', now(), 204, 1);
    update api_webhook_endpoints set status = 'active', disabled_reason = null, disabled_at = null, paused_at = null, paused_by = null, cursor_at = now() - interval '10 seconds', cursor_id = '00000000-0000-0000-0000-000000000000' where id = '${id}';`);
}
// Escenografía: mover el cursor de un endpoint activo HACIA ATRÁS (la base ya no lo deja) salteando los triggers.
const retroceder = (db: PGlite, sql: string) => db.exec(`set session_replication_role = replica; ${sql}; set session_replication_role = origin;`);
const msg = (db: PGlite, conv: string, de: string, hace: string) =>
  db.exec(`insert into chat_messages(conversation_id, sender_id, created_at) values ('${conv}', '${de}', now() - interval '${hace}')`);
const hay = async (db: PGlite) => (await uno(db, `select public.api_webhooks_hay_trabajo() as h`)).h as boolean;

// ════ A. alta ════
{
  const db = await nueva();
  ok.push("la migración corre entera en una transacción");
  await anda(db, alta({ id: `'${EP}'`, tenant_id: `'${T2}'`, acts_as_user_id: `'${BETO}'`, url_host: "'mentira'" }), "alta válida (con tenant, persona y host falsos a propósito)");
  const e = await uno(db, `select tenant_id::text t, acts_as_user_id::text a, url_host h, status s, cursor_at c, lease_until l from api_webhook_endpoints where id = '${EP}'`);
  check(e?.t === T1 && e?.a === ALVARO, `tenant y persona salen de la llave, no del pedido (${e?.t}, ${e?.a})`);
  check(e?.h === "hooks.integrador.example", `url_host sale de la URL (${e?.h})`);
  check(e?.s === "pending" && e?.c === null && e?.l === null, "nace pending, sin cursor ni reclamo");
  await falla(db, alta(), /unique|duplicate/i, "segundo endpoint para la misma llave: rechazado");
  await falla(db, alta({ api_key_id: `'${K_SIN}'` }), /permiso de Messenger/, "llave sin Messenger: rechazada");
  await falla(db, alta({ api_key_id: `'${K_REV}'` }), /revocada/, "llave revocada: rechazada");
  await falla(db, alta({ api_key_id: `'${K_VENC}'` }), /vencida/, "llave vencida: rechazada");
  await falla(db, alta({ api_key_id: `'${K_SINIP}'` }), /IPs fijas/, "llave sin IPs: rechazada");
  await falla(db, alta({ api_key_id: `'${K_ANA}'` }), /registra la persona/, "Alvaro registra sobre la llave de Ana: rechazado");
  await falla(db, alta({ api_key_id: `'${K_ANA}'`, created_by: `'${BETO}'` }), /registra la persona/, "Beto registra sobre la llave de Ana: rechazado");
  await falla(db, alta({ api_key_id: `'${K_ANA}'`, created_by: "null" }), /registra la persona|null value/, "sin created_by: rechazado");
  await falla(db, alta({ api_key_id: `'${K_ANA}'`, created_by: `'${ANA}'`, status: "'active'" }), /nace esperando/, "nacer activo: rechazado");
  await falla(db, alta({ api_key_id: "'20000000-0000-0000-0000-0000000000ff'" }), /no existe|foreign key/, "llave inexistente: rechazada");
  // persona de la llave dada de baja / bloqueada / fuera de la agencia
  await db.exec(`update profiles set deleted_at = now() where id = '${ANA}'`);
  await falla(db, alta({ api_key_id: `'${K_ANA}'`, created_by: `'${ANA}'` }), /ya no está activa/, "persona dada de baja: rechazado");
  await db.exec(`update profiles set deleted_at = null where id = '${ANA}'; update auth.users set banned_until = now() + interval '1 day' where id = '${ANA}'`);
  await falla(db, alta({ api_key_id: `'${K_ANA}'`, created_by: `'${ANA}'` }), /ya no está activa/, "persona bloqueada: rechazado");
  await db.exec(`update auth.users set banned_until = null where id = '${ANA}'; delete from tenant_members where user_id = '${ANA}'`);
  await falla(db, alta({ api_key_id: `'${K_ANA}'`, created_by: `'${ANA}'` }), /ya no está activa/, "persona fuera de la agencia: rechazado");
  await db.exec(`insert into tenant_members(user_id, tenant_id) values ('${ANA}','${T1}')`);
  // DOS agencias: todo apagado
  await db.exec(`insert into tenants(id, slug, name) values ('${T2}', 'otra', 'Otra')`);
  await falla(db, alta({ api_key_id: `'${K_ANA}'`, created_by: `'${ANA}'` }), /más de una agencia/, "con dos agencias: rechazado");
  await db.exec(`delete from tenants where id = '${T2}'`);
  await anda(db, alta({ api_key_id: `'${K_ANA}'`, created_by: `'${ANA}'` }), "Ana registra sobre su propia llave: se crea");
}
// ════ A2. forma de la URL ════
{
  const db = await nueva();
  const url = async (u: string, debe: boolean | RegExp, m: string) => {
    await db.exec("savepoint s");
    try {
      await db.exec(alta({ url: `'${u.replaceAll("'", "''")}'` }));
      if (debe === true) ok.push(`URL aceptada: ${m}`); else mal.push(`URL aceptada y NO debía: ${m}`);
    } catch (e) {
      const t = String((e as Error).message);
      if (debe === true) mal.push(`URL rechazada y debía pasar: ${m} → ${t.slice(0, 90)}`);
      else check(debe instanceof RegExp ? debe.test(t) : true, `URL rechazada: ${m} → ${t.slice(0, 70)}`);
    }
    await db.exec("rollback to savepoint s");
  };
  await db.exec("begin");
  await url("http://hooks.integrador.example/x", /https/, "http");
  await url("https://hooks.integrador.example/" + "a".repeat(2040), /2048/, "más de 2048");
  await url("https://hooks.integrador.example/a b", /espacios/, "espacio");
  await url("https://hooks.integrador.example/a\tb", /espacios/, "tab");
  await url("https://hooks.integrador.example/x#frag", /fragmento/, "fragmento");
  await url("https://user:pass@hooks.integrador.example/x", /usuario/, "usuario y contraseña");
  await url("https://ok.com@169.254.169.254/x", /usuario/, "ok.com@metadata");
  await url("https://evil.com\\@good.com/x", /normalizada/, "barra invertida + @");
  await url("https://[::1]/x", /IP/, "IPv6 literal");
  await url("https://[::ffff:a9fe:a9fe]/x", /IP/, "IPv4 mapeada en IPv6");
  await url("https://127.0.0.1/x", /dominio/, "IPv4 literal");
  await url("https://169.254.169.254/latest", /dominio/, "metadata por IP");
  await url("https://0x7f000001/x", /dominio/, "IP en hexadecimal");
  await url("https://2130706433/x", /dominio/, "IP en decimal");
  await url("https://127.1/x", /dominio/, "IP abreviada");
  await url("https://localhost/x", /dominio/, "localhost (una sola parte)");
  await url("https://intranet/x", /dominio/, "nombre de una sola parte");
  await url("https://hooks.integrador.example./x", /dominio/, "punto final");
  await url("https://Hooks.Integrador.Example/x", /dominio/, "mayúsculas en el host (sin normalizar)");
  await url("https://hooks.integrador.example:8443/x", /443/, "puerto 8443");
  await url("https://hooks.integrador.example:443:443/x", /443/, "puerto doble");
  await url("https://hooks.integrador.example:/x", /443/, "dos puntos sin puerto");
  await url("https://hooks.integrador.ex%61mple/x", /dominio/, "host con %");
  await url("https://-malo.example/x", /dominio/, "etiqueta que empieza con guion");
  await url("https:///x", /dominio/, "sin host");
  await url("https://", /dominio/, "solo el esquema");
  await url("https://hooks.integrador.example:443/x", true, "puerto 443 explícito");
  await url("https://hooks.integrador.example", true, "sin camino");
  await url("https://hooks.integrador.example?x=1", true, "consulta sin camino");
  await url("https://xn--bcher-kva.example/x", true, "dominio internacional (punycode)");
  await url("https://a.b.c.integrador.example/w/" + "a".repeat(100) + "?t=AbC_-~%2F", true, "camino largo con token");
  await db.exec("rollback");
}
// ════ B. cambios del endpoint ════
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  for (const [col, val] of [["api_key_id", `'${K_ANA}'`], ["tenant_id", `'${T2}'`], ["acts_as_user_id", `'${BETO}'`], ["url", "'https://otro.example/x'"],
    ["url_host", "'otro.example'"], ["created_by", `'${BETO}'`], ["created_at", "now() - interval '1 day'"], ["id", "gen_random_uuid()"]] as const) {
    await falla(db, `update api_webhook_endpoints set ${col} = ${val} where id = '${EP}'`, /no cambian|foreign key/, `no se cambia ${col}`);
  }
  for (const col of ["secret_cipher", "secret_nonce", "secret_last4"]) {
    await falla(db, `update api_webhook_endpoints set ${col} = 'wxyz' where id = '${EP}'`, /secreto/, `no se cambia ${col}`);
  }
  await falla(db, `update api_webhook_endpoints set secret_key_version = 2 where id = '${EP}'`, /secreto/, "subir la versión SIN volver a cifrar: rechazado");
  await falla(db, `update api_webhook_endpoints set secret_key_version = 2, secret_cipher = 'c2', secret_nonce = 'n2', secret_last4 = 'zzzz' where id = '${EP}'`, /secreto/, "volver a cifrar cambiando los últimos 4 (= otro secreto): rechazado");
  await falla(db, `update api_webhook_endpoints set secret_cipher = 'c2', secret_nonce = 'n2' where id = '${EP}'`, /secreto/, "cambiar el cifrado sin subir la versión: rechazado");
  await falla(db, `update api_webhook_endpoints set secret_key_version = 2, secret_cipher = 'c2' where id = '${EP}'`, /secreto/, "volver a cifrar reusando el nonce: rechazado");
  await falla(db, `update api_webhook_endpoints set secret_key_version = 2, secret_nonce = 'n2' where id = '${EP}'`, /secreto/, "subir la versión con nonce nuevo pero el MISMO cifrado: rechazado");
  await anda(db, `update api_webhook_endpoints set secret_key_version = 2, secret_cipher = 'c2', secret_nonce = 'n2' where id = '${EP}'`, "volver a cifrar el MISMO secreto con la clave v2: anda");
  await falla(db, `update api_webhook_endpoints set secret_key_version = 1, secret_cipher = 'c', secret_nonce = 'n' where id = '${EP}'`, /secreto/, "volver a una versión vieja de la clave: rechazado");
  const antes = (await uno(db, `select updated_at u from api_webhook_endpoints where id = '${EP}'`)).u;
  await db.exec(`select pg_sleep(0.01)`);
  await db.exec(`update api_webhook_endpoints set last_error = 'timeout' where id = '${EP}'`);
  const despues = (await uno(db, `select updated_at u from api_webhook_endpoints where id = '${EP}'`)).u;
  check(new Date(despues).getTime() > new Date(antes).getTime(), "updated_at avanza en cada cambio");
  // activar
  const act = (cursor: string) => `update api_webhook_endpoints set status = 'active', disabled_reason = null, disabled_at = null, paused_at = null, paused_by = null, cursor_at = ${cursor}, cursor_id = '00000000-0000-0000-0000-000000000000' where id = '${EP}'`;
  await falla(db, act("now() - interval '10 seconds'"), /prueba entregada/, "activar sin prueba: rechazado");
  await db.exec(`insert into api_webhook_deliveries(endpoint_id, event_type, body, state, drop_reason) values ('${EP}', 'webhook.test', '{}', 'dropped', 'test_failed')`);
  await falla(db, act("now() - interval '10 seconds'"), /prueba entregada/, "activar con una prueba FALLIDA: rechazado");
  await db.exec(`set session_replication_role = replica;
    insert into api_webhook_deliveries(endpoint_id, tenant_id, event_type, body, state, delivered_at, created_at, last_status_code, attempts) values ('${EP}', '${T1}', 'webhook.test', '{}', 'delivered', now() - interval '20 minutes', now() - interval '20 minutes', 204, 1);
    set session_replication_role = origin;`);
  await falla(db, act("now() - interval '10 seconds'"), /prueba entregada/, "activar con una prueba de hace 20 min: rechazado");
  await db.exec(`insert into api_webhook_deliveries(endpoint_id, event_type, body, state, delivered_at, last_status_code, attempts) values ('${EP}', 'webhook.test', '{}', 'delivered', now(), 204, 1)`);
  await falla(db, act("null"), /desde ahora|cursor|check/i, "activar sin cursor: rechazado");
  await falla(db, act("now() - interval '1 hour'"), /desde ahora/, "activar con cursor de hace 1 h (anunciaría lo viejo): rechazado");
  await falla(db, act("now() + interval '1 minute'"), /desde ahora/, "activar con cursor en el futuro: rechazado");
  await falla(db, `update api_webhook_endpoints set status = 'active', cursor_at = now() where id = '${EP}'`, /check|cursor/i, "cursor_at sin cursor_id: rechazado");
  await db.exec(`update api_keys set revoked_at = now() where id = '${K_MSG}'`);
  check((await uno(db, `select status || '/' || disabled_reason s from api_webhook_endpoints where id = '${EP}'`)).s === "disabled/key_revoked", "revocar la llave detiene el endpoint en el momento (key_revoked)");
  await falla(db, act("now() - interval '10 seconds'"), /revocada/, "activar con la llave revocada: rechazado");
  await db.exec(`update api_keys set revoked_at = null where id = '${K_MSG}'; update profiles set deleted_at = now() where id = '${ALVARO}'`);
  check((await uno(db, `select status from api_webhook_endpoints where id = '${EP}'`)).status === "disabled", "sigue detenido aunque la llave vuelva (no revive solo)");
  await falla(db, act("now() - interval '10 seconds'"), /ya no está activa/, "activar con la persona de baja: rechazado");
  await db.exec(`update profiles set deleted_at = null where id = '${ALVARO}'; insert into tenants(id, slug, name) values ('${T2}', 'otra', 'Otra')`);
  await falla(db, act("now() - interval '10 seconds'"), /más de una agencia/, "activar con dos agencias: rechazado");
  await db.exec(`delete from tenants where id = '${T2}'`);
  await anda(db, act("now() - interval '10 seconds'"), "activar con prueba reciente y cursor en ahora − 10 s: se activa");
  // coherencia de estados
  await falla(db, `update api_webhook_endpoints set status = 'disabled' where id = '${EP}'`, /check/i, "detenido sin motivo: rechazado");
  await falla(db, `update api_webhook_endpoints set status = 'disabled', disabled_reason = 'key_revoked' where id = '${EP}'`, /check/i, "detenido sin fecha: rechazado");
  await falla(db, `update api_webhook_endpoints set disabled_reason = 'admin' where id = '${EP}'`, /check/i, "motivo sin estar detenido: rechazado");
  await falla(db, `update api_webhook_endpoints set status = 'paused' where id = '${EP}'`, /check/i, "pausado sin fecha: rechazado");
  await falla(db, `update api_webhook_endpoints set status = 'disabled', disabled_reason = 'inventado', disabled_at = now() where id = '${EP}'`, /check/i, "motivo desconocido: rechazado");
  await falla(db, `update api_webhook_endpoints set status = 'borrado' where id = '${EP}'`, /check/i, "estado desconocido: rechazado");
  await anda(db, `update api_webhook_endpoints set status = 'paused', paused_at = now(), paused_by = '${ANA}' where id = '${EP}'`, "pausar (otra admin): anda");
  // reanudar = activar otra vez: exige prueba reciente y cursor desde ahora
  await falla(db, `update api_webhook_endpoints set status = 'active', paused_at = null, paused_by = null, cursor_at = now() - interval '3 hours' where id = '${EP}'`, /desde ahora/, "reanudar desde el cursor viejo: rechazado");
  await anda(db, `update api_webhook_endpoints set status = 'active', paused_at = null, paused_by = null, cursor_at = now() - interval '10 seconds' where id = '${EP}'`, "reanudar desde ahora: anda");
  await anda(db, `update api_webhook_endpoints set status = 'disabled', disabled_reason = 'person_inactive', disabled_at = now() where id = '${EP}'`, "detener con motivo y fecha: anda");
  await falla(db, `update api_webhook_endpoints set last_status_code = 99 where id = '${EP}'`, /check/i, "código HTTP 99: rechazado");
  await falla(db, `update api_webhook_endpoints set last_error = '${"x".repeat(61)}' where id = '${EP}'`, /check/i, "last_error de 61: rechazado");
}
// ════ C. entregas ════
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  const timbre = (extra = "") => `insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count${extra ? "," + extra.split("=")[0] : ""}) values ('${EP}', 'messages.created', '{"type":"messages.created"}', 3${extra ? "," + extra.split("=")[1] : ""})`;
  await falla(db, timbre(), /solo un endpoint activo/, "timbre para un endpoint pending: rechazado");
  await anda(db, `insert into api_webhook_deliveries(endpoint_id, event_type, body) values ('${EP}', 'webhook.test', '{}')`, "prueba para un endpoint pending: anda");
  await activar(db);
  await anda(db, `insert into api_webhook_deliveries(endpoint_id, tenant_id, event_type, body, message_count) values ('${EP}', '${T2}', 'messages.created', '{}', 3)`, "timbre para un endpoint activo (con tenant falso): anda");
  check((await uno(db, `select count(*)::int n from api_webhook_deliveries where tenant_id = '${T1}' and event_type = 'messages.created'`)).n === 1, "la entrega hereda la agencia del endpoint");
  await falla(db, timbre(), /unique|duplicate/i, "segundo timbre pendiente para el mismo endpoint: rechazado");
  await anda(db, `insert into api_webhook_deliveries(endpoint_id, event_type, body) values ('${EP}', 'webhook.test', '{}')`, "una prueba con un timbre pendiente: anda");
  const T = (await uno(db, `select id from api_webhook_deliveries where event_type = 'messages.created'`)).id;
  await falla(db, `update api_webhook_deliveries set body = '{"otro":1}' where id = '${T}'`, /mismos bytes/, "reescribir el cuerpo firmado: rechazado");
  await falla(db, `update api_webhook_deliveries set message_count = 4 where id = '${T}'`, /mismos bytes/, "cambiar la cantidad: rechazado");
  await falla(db, `update api_webhook_deliveries set endpoint_id = gen_random_uuid() where id = '${T}'`, /mismos bytes|foreign/, "cambiar de endpoint: rechazado");
  await falla(db, `update api_webhook_deliveries set tenant_id = '${T2}' where id = '${T}'`, /mismos bytes/, "cambiar de agencia: rechazado");
  await falla(db, `update api_webhook_deliveries set event_type = 'webhook.test', message_count = null where id = '${T}'`, /mismos bytes/, "cambiar el tipo: rechazado");
  await anda(db, `update api_webhook_deliveries set attempts = attempts + 1, last_status_code = 503, last_error = 'http_503', uncertain = true where id = '${T}'`, "anotar un intento fallido: anda");
  await falla(db, `update api_webhook_deliveries set state = 'dropped' where id = '${T}'`, /check/i, "descartar sin motivo: rechazado");
  await falla(db, `update api_webhook_deliveries set state = 'delivered' where id = '${T}'`, /check/i, "entregar sin fecha: rechazado");
  await falla(db, `update api_webhook_deliveries set state = 'delivered', delivered_at = now() where id = '${T}'`, /check/i, "marcar entregado con el último intento en 503: rechazado");
  await anda(db, `update api_webhook_deliveries set state = 'delivered', delivered_at = now(), last_status_code = 200, attempts = attempts + 1 where id = '${T}'`, "marcar entregado con un 200: anda");
  await falla(db, `update api_webhook_deliveries set attempts = 9 where id = '${T}'`, /terminada/, "una entrega terminada no cambia");
  await falla(db, `update api_webhook_deliveries set state = 'pending', delivered_at = null where id = '${T}'`, /terminada/, "una entregada no vuelve a pendiente");
  await anda(db, timbre(), "con el anterior entregado, un timbre nuevo pendiente: anda");
  const T3 = (await uno(db, `select id from api_webhook_deliveries where event_type = 'messages.created' and state = 'pending'`)).id;
  await anda(db, `update api_webhook_deliveries set state = 'dropped', drop_reason = 'endpoint_paused' where id = '${T3}'`, "descartar con motivo: anda");
  await falla(db, `insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count, state, delivered_at) values ('${EP}', 'messages.created', '{}', 1, 'delivered', now())`, /nace pendiente/, "timbre que nace entregado: rechazado");
  await falla(db, `insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP}', 'messages.created', '{}', 0)`, /check/i, "timbre con 0 mensajes: rechazado");
  await falla(db, `insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP}', 'messages.created', '{}', 101)`, /check/i, "timbre con 101 mensajes: rechazado");
  await falla(db, `insert into api_webhook_deliveries(endpoint_id, event_type, body) values ('${EP}', 'messages.created', '{}')`, /check/i, "timbre sin cantidad: rechazado");
  await falla(db, `insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP}', 'webhook.test', '{}', 1)`, /check/i, "prueba con cantidad: rechazada");
  await falla(db, `insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP}', 'messages.updated', '{}', 1)`, /check/i, "tipo de evento desconocido: rechazado");
  await falla(db, `insert into api_webhook_deliveries(endpoint_id, event_type, body) values ('${EP}', 'webhook.test', repeat('x', 16385))`, /check/i, "cuerpo de 16385 bytes: rechazado");
  await anda(db, `insert into api_webhook_deliveries(endpoint_id, event_type, body) values ('${EP}', 'webhook.test', repeat('x', 16384))`, "cuerpo de 16384 bytes: anda");
  await falla(db, `insert into api_webhook_deliveries(endpoint_id, event_type, body) values (gen_random_uuid(), 'webhook.test', '{}')`, /no existe|foreign/, "entrega de un endpoint inexistente: rechazada");
  // borrar el endpoint se lleva sus entregas
  await db.exec(`delete from api_webhook_endpoints where id = '${EP}'`);
  check((await uno(db, `select count(*)::int n from api_webhook_deliveries`)).n === 0, "borrar el endpoint borra sus entregas");
}
// ════ D. el turno del cron y el reclamo ════
{
  const db = await nueva();
  check(await hay(db) === false, "sin endpoints: no hay trabajo");
  await db.exec(alta({ id: `'${EP}'` }));
  await msg(db, C1, BETO, "20 seconds");
  check(await hay(db) === false, "endpoint pending con mensajes: no hay trabajo (no está activo)");
  await activar(db);
  check(await hay(db) === false, "recién activado, el mensaje de hace 20 s queda ANTES del cursor: no hay trabajo");
  // un mensaje nuevo, todavía sin asentar (5 s)
  await retroceder(db, `update api_webhook_endpoints set cursor_at = now() - interval '1 minute' where id = '${EP}'`);
  await db.exec(`delete from chat_messages`);
  await msg(db, C1, BETO, "5 seconds");
  check(await hay(db) === false, "mensaje de hace 5 s (sin asentar): no hay trabajo");
  await msg(db, C1, BETO, "30 seconds");
  check(await hay(db) === true, "mensaje de otra persona de hace 30 s, después del cursor: HAY trabajo");
  await db.exec(`delete from chat_messages`);
  await msg(db, C1, BETO, "2 minutes");
  check(await hay(db) === false, "mensaje anterior al cursor: no hay trabajo");
  await db.exec(`delete from chat_messages; insert into chat_messages(conversation_id, sender_id, created_at) select '${C1}', '${BETO}', cursor_at from api_webhook_endpoints where id = '${EP}'`);
  check(await hay(db) === true, "mensaje EN el instante exacto del cursor (empate): hay trabajo (el feed decide)");
  await db.exec(`delete from chat_messages`);
  await msg(db, C1, ALVARO, "30 seconds");
  check(await hay(db) === false, "solo un mensaje propio con exclude_own: no hay trabajo");
  await db.exec(`update api_webhook_endpoints set exclude_own = false where id = '${EP}'`);
  check(await hay(db) === true, "mensaje propio con exclude_own apagado: hay trabajo");
  await db.exec(`update api_webhook_endpoints set exclude_own = true where id = '${EP}'; delete from chat_messages`);
  await msg(db, C2, BETO, "30 seconds");
  check(await hay(db) === false, "mensaje en una conversación donde la persona NO está: no hay trabajo");
  await msg(db, C1, BETO, "30 seconds");
  check(await hay(db) === true, "y en la suya: hay trabajo");
  // reclamado / con turno en el futuro
  await db.exec(`update api_webhook_endpoints set lease_until = now() + interval '30 seconds' where id = '${EP}'`);
  check(await hay(db) === false, "reclamado por otra corrida: no hay trabajo");
  await db.exec(`update api_webhook_endpoints set lease_until = now() - interval '1 second' where id = '${EP}'`);
  check(await hay(db) === true, "reclamo vencido: hay trabajo otra vez");
  await db.exec(`update api_webhook_endpoints set next_attempt_at = now() + interval '5 minutes' where id = '${EP}'`);
  check(await hay(db) === false, "turno en el futuro (esperando para reintentar): no hay trabajo");
  await db.exec(`update api_webhook_endpoints set next_attempt_at = now() where id = '${EP}'`);
  // timbre pendiente sin mensajes nuevos
  await db.exec(`delete from chat_messages; insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP}', 'messages.created', '{}', 2)`);
  check(await hay(db) === true, "timbre pendiente sin mensajes nuevos: hay trabajo (reintentar)");
  await db.exec(`update api_webhook_endpoints set next_attempt_at = now() + interval '1 minute' where id = '${EP}'`);
  check(await hay(db) === false, "timbre pendiente pero en espera: no hay trabajo");
  await db.exec(`update api_webhook_endpoints set next_attempt_at = now() where id = '${EP}'`);
  // pausado / detenido
  await db.exec(`update api_webhook_endpoints set status = 'paused', paused_at = now() where id = '${EP}'`);
  check(await hay(db) === false, "pausado: no hay trabajo");
  await db.exec(`update api_webhook_endpoints set status = 'disabled', paused_at = null, disabled_reason = 'receiver_gone', disabled_at = now() where id = '${EP}'`);
  check(await hay(db) === false, "detenido: no hay trabajo");
  // dos agencias
  await db.exec(`delete from api_webhook_deliveries where event_type = 'messages.created'`);
  await activar(db);
  await retroceder(db, `update api_webhook_endpoints set cursor_at = now() - interval '1 minute' where id = '${EP}'`);
  await msg(db, C1, BETO, "30 seconds");
  check(await hay(db) === true, "de nuevo activo y con un mensaje: hay trabajo");
  await db.exec(`insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP}', 'messages.created', '{}', 1)`);
  await db.exec(`insert into tenants(id, slug, name) values ('${T2}', 'otra', 'Otra')`);
  check((await uno(db, `select status || '/' || disabled_reason s from api_webhook_endpoints where id = '${EP}'`)).s === "disabled/multi_agency", "dar de alta otra agencia detiene el endpoint en el momento (multi_agency)");
  check((await uno(db, `select state || '/' || drop_reason s from api_webhook_deliveries where event_type = 'messages.created'`)).s === "dropped/endpoint_disabled", "y descarta su timbre pendiente");
  check(await hay(db) === false, "con dos agencias: no hay trabajo (cerrado)");
  check((await q(db, `select * from api_webhooks_reclamar(5, 60)`)).length === 0, "con dos agencias: no se reclama nada");
  await db.exec(`delete from tenants where id = '${T2}'`);
  check(await hay(db) === false, "al volver a una agencia NO revive solo (sigue detenido hasta un Resume con prueba)");
  await activar(db);
  await retroceder(db, `update api_webhook_endpoints set cursor_at = now() - interval '1 minute' where id = '${EP}'`);
  // reclamar
  const r1 = await q(db, `select id::text, lease_until from api_webhooks_reclamar(5, 60)`);
  check(r1.length === 1 && r1[0].id === EP, `reclamar devuelve el endpoint con trabajo (${r1.length})`);
  const lease = await uno(db, `select extract(epoch from lease_until - now())::int s from api_webhook_endpoints where id = '${EP}'`);
  check(lease.s >= 59 && lease.s <= 60, `lo deja reclamado 60 s (${lease.s})`);
  check((await q(db, `select * from api_webhooks_reclamar(5, 60)`)).length === 0, "reclamar otra vez enseguida: nada (ya está tomado)");
  check(await hay(db) === false, "tomado: el cron no despierta a nadie");
  await db.exec(`update api_webhook_endpoints set lease_until = null where id = '${EP}'`);
  const r2 = await q(db, `select secret_cipher, url from api_webhooks_reclamar(1, 10)`);
  check(r2.length === 1 && r2[0].secret_cipher === "c" && r2[0].url === URL_OK, "el reclamo trae la fila entera (la edge necesita el secreto y la URL)");
  for (const [a, m] of [["0, 60", "_max 0"], ["21, 60", "_max 21"], ["null, 60", "_max nulo"], ["5, 9", "_lease_s 9"], ["5, 301", "_lease_s 301"], ["5, null", "_lease_s nulo"]] as const) {
    await falla(db, `select * from api_webhooks_reclamar(${a})`, /va de/, `reclamar con ${m}: rechazado`);
  }
  // sin trabajo no se reclama aunque esté libre
  await db.exec(`update api_webhook_endpoints set lease_until = null where id = '${EP}'; delete from chat_messages`);
  check((await q(db, `select * from api_webhooks_reclamar(5, 60)`)).length === 0, "libre pero sin trabajo: no se reclama");
  check((await uno(db, `select lease_until l from api_webhook_endpoints where id = '${EP}'`)).l === null, "y no se le escribe nada (sin trabajo, sin escrituras)");
}
// ════ D2. reclamo con varios endpoints y _max ════
{
  const db = await nueva();
  const EPA = "40000000-0000-0000-0000-0000000000a1";
  await db.exec(`insert into chat_participants(conversation_id, user_id) values ('${C2}', '${ALVARO}') on conflict do nothing`);
  await db.exec(alta({ id: `'${EP}'` }));
  await db.exec(alta({ id: `'${EPA}'`, api_key_id: `'${K_ANA}'`, created_by: `'${ANA}'` }));
  await activar(db, EP); await activar(db, EPA);
  await retroceder(db, `update api_webhook_endpoints set cursor_at = now() - interval '1 minute'`);
  await db.exec(`update api_webhook_endpoints set next_attempt_at = now() - interval '5 minutes' where id = '${EPA}'`);
  await msg(db, C2, BETO, "30 seconds");
  const r = await q(db, `select id::text from api_webhooks_reclamar(1, 60)`);
  check(r.length === 1 && r[0].id === EPA, `con _max 1 toma el que espera hace más (${r[0]?.id})`);
  const r2 = await q(db, `select id::text from api_webhooks_reclamar(5, 60)`);
  check(r2.length === 1 && r2[0].id === EP, `la vuelta siguiente toma el otro (${r2.length})`);
}
// ════ E. limpieza de entregas ════
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await activar(db);
  await db.exec(`set session_replication_role = replica;
    insert into api_webhook_deliveries(endpoint_id, tenant_id, event_type, body, message_count, state, delivered_at, created_at, last_status_code, attempts)
      select '${EP}', '${T1}', 'messages.created', '{}', 1, 'delivered', now() - (g || ' days')::interval + interval '1 hour', now() - (g || ' days')::interval + interval '1 hour', 204, 1 from generate_series(1, 30) g;
    insert into api_webhook_deliveries(endpoint_id, tenant_id, event_type, body, message_count, state, created_at)
      values ('${EP}', '${T1}', 'messages.created', '{}', 1, 'pending', now() - interval '40 days');
    insert into api_webhook_deliveries(endpoint_id, tenant_id, event_type, body, state, drop_reason, created_at)
      values ('${EP}', '${T1}', 'webhook.test', '{}', 'dropped', 'test_failed', now() - interval '20 days');
    set session_replication_role = origin;`);
  const n0 = (await uno(db, `select count(*)::int n from api_webhook_deliveries`)).n;
  const r = (await uno(db, `select app_purgar_entregas_webhooks(14, 10000) r`)).r;
  const quedan = await q(db, `select state, extract(day from now() - created_at)::int d from api_webhook_deliveries order by created_at`);
  check(r === 17, `borra las entregadas/descartadas de más de 14 días (${r}: 16 entregadas + 1 prueba)`);
  check(quedan.some((x) => x.state === "pending" && x.d >= 39), "el timbre pendiente viejo NO se borra (es trabajo vivo)");
  check(quedan.filter((x) => x.state === "delivered").every((x) => x.d <= 14), "no queda ninguna entregada de más de 14 días");
  check(n0 - r === quedan.length, "cuentas cierran");
  await db.exec(`set session_replication_role = replica;
    insert into api_webhook_deliveries(endpoint_id, tenant_id, event_type, body, message_count, state, delivered_at, created_at, last_status_code, attempts)
      select '${EP}', '${T1}', 'messages.created', '{}', 1, 'delivered', now() - interval '20 days', now() - interval '20 days', 204, 1 from generate_series(1, 25);
    set session_replication_role = origin;`);
  check((await uno(db, `select app_purgar_entregas_webhooks(14, 10) r`)).r === 10, "respeta el tope");
  for (const [a, m] of [["0, 10", "p_dias 0"], ["14, 0", "p_tope 0"], ["null, 10", "p_dias nulo"]] as const) {
    await falla(db, `select app_purgar_entregas_webhooks(${a})`, /al menos 1|positivo/, `purga con ${m}: rechazada`);
  }
  const j = await q(db, `select schedule, command from cron.job where jobname = 'purgar-entregas-webhooks'`);
  check(j.length === 1 && j[0].schedule === "40 8 * * *" && /app_purgar_entregas_webhooks\(14, 10000\)/.test(j[0].command), "job de limpieza registrado (8:40 UTC, 14 días, tope 10000)");
}
// ════ F. permisos ════
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  for (const t of ["api_webhook_endpoints", "api_webhook_deliveries"]) {
    for (const rol of ["anon", "authenticated"]) {
      const p = await uno(db, `select ${["select", "insert", "update", "delete", "truncate", "references", "trigger"].map((x) => `has_table_privilege('${rol}', 'public.${t}', '${x}') "${x}"`).join(",")}`);
      check(Object.values(p).every((v) => v === false), `${rol} sin ningún permiso en ${t}`);
      await fallaComoRol(db, rol, `select * from public.${t}`, /permission denied/, `${rol} no puede leer ${t}`);
    }
    const s = await uno(db, `select ${["select", "insert", "update", "delete", "truncate", "references", "trigger"].map((x) => `has_table_privilege('service_role', 'public.${t}', '${x}') "${x}"`).join(",")}`);
    check(s.select && s.insert && s.update && s.delete && !s.truncate && !s.references && !s.trigger, `service_role con lo justo en ${t} (${JSON.stringify(s)})`);
    const rls = await uno(db, `select relrowsecurity r, (select count(*)::int from pg_policy where polrelid = 'public.${t}'::regclass) p from pg_class where oid = 'public.${t}'::regclass`);
    check(rls.r === true && rls.p === 0, `${t}: RLS prendida y sin políticas`);
  }
  const fx: Record<string, string[]> = {
    "api_webhooks_host_de_url(text)": ["service_role"],
    "api_webhooks_llave_no_sirve(api_keys)": ["service_role"],
    "api_webhooks_con_trabajo()": ["service_role"],
    "api_webhooks_reclamar(integer,integer)": ["service_role"],
    "api_webhooks_hay_trabajo()": [],
    "app_purgar_entregas_webhooks(integer,integer)": [],
    "api_webhook_endpoints_alta()": [], "api_webhook_endpoints_cambio()": [],
    "api_webhook_deliveries_alta()": [], "api_webhook_deliveries_cambio()": [],
    "api_webhooks_detener(text,uuid[])": [], "api_webhooks_por_agencias()": [],
    "api_webhooks_por_baja()": [], "api_webhooks_por_llave()": [],
  };
  for (const [f, quienes] of Object.entries(fx)) {
    for (const rol of ["anon", "authenticated", "service_role"]) {
      const puede = (await uno(db, `select has_function_privilege('${rol}', 'public.${f}', 'execute') p`)).p;
      check(puede === quienes.includes(rol), `${f}: ${rol} ${quienes.includes(rol) ? "puede" : "NO puede"} (${puede})`);
    }
  }
  // la edge (service_role) escribe de verdad, con los triggers corriendo con sus permisos
  await db.exec(`begin; set local role service_role;
    insert into api_webhook_endpoints(api_key_id, url, created_by, secret_cipher, secret_nonce, secret_last4, url_host, tenant_id, acts_as_user_id)
      values ('${K_ANA}', '${URL_OK}', '${ANA}', 'c', 'n', 'wxyz', 'x', '${T1}', '${ANA}');
    insert into api_webhook_deliveries(endpoint_id, event_type, body) select id, 'webhook.test', '{}' from api_webhook_endpoints where api_key_id = '${K_ANA}';
    commit;`).then(() => ok.push("service_role da de alta un endpoint y una entrega (triggers incluidos)"), (e) => { mal.push(`service_role no pudo dar de alta: ${String(e).slice(0, 140)}`); return db.exec("rollback"); });
  await db.exec(`begin; set local role service_role; select * from api_webhooks_reclamar(5, 60); rollback;`).then(() => ok.push("service_role puede reclamar"), (e) => { mal.push(`service_role no puede reclamar: ${String(e).slice(0, 120)}`); return db.exec("rollback"); });
  await fallaComoRol(db, "service_role", `select api_webhooks_hay_trabajo()`, /permission denied/, "service_role NO corre el turno del cron (solo postgres)");
  await fallaComoRol(db, "service_role", `select app_purgar_entregas_webhooks(14, 10)`, /permission denied/, "service_role NO corre la limpieza");
  await fallaComoRol(db, "authenticated", `select * from api_webhooks_reclamar(5, 60)`, /permission denied/, "authenticated no puede reclamar");
  await fallaComoRol(db, "anon", `select api_webhooks_host_de_url('https://a.example')`, /permission denied/, "anon no puede llamar a las funciones");
}

// ════ G. huecos que encontró la revisión por mutaciones ════
const EPA = "40000000-0000-0000-0000-0000000000a1"; // endpoint de Ana (K_ANA)
// G1. inmutables que el FK tapaba: con la otra agencia EXISTIENDO, el que tiene que saltar es el trigger
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await db.exec(`begin; insert into tenants(id, slug, name) values ('${T2}', 'otra', 'Otra')`);
  await falla(db, `update api_webhook_endpoints set tenant_id = '${T2}' where id = '${EP}'`, /no cambian/, "no se cambia tenant_id aunque la otra agencia exista (sin que el FK lo tape)");
  await db.exec("rollback");
}
// G2. un timbre no se muda de endpoint (a la URL y el secreto de OTRA persona), ni cambia de id ni de fecha
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await db.exec(alta({ id: `'${EPA}'`, api_key_id: `'${K_ANA}'`, created_by: `'${ANA}'` }));
  await activar(db, EP); await activar(db, EPA);
  await db.exec(`insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP}', 'messages.created', '{}', 2)`);
  const T = (await uno(db, `select id from api_webhook_deliveries where event_type = 'messages.created'`)).id;
  await falla(db, `update api_webhook_deliveries set endpoint_id = '${EPA}' where id = '${T}'`, /mismos bytes/, "un timbre no se muda al endpoint de otra persona (que existe)");
  await falla(db, `update api_webhook_deliveries set id = gen_random_uuid() where id = '${T}'`, /mismos bytes/, "el id del timbre (webhook-id) no cambia entre reintentos");
  await falla(db, `update api_webhook_deliveries set created_at = now() - interval '30 days' where id = '${T}'`, /mismos bytes/, "la fecha del timbre no se reescribe");
}
// G3. reactivar desde DETENIDO (restore_user) exige lo mismo que desde pausado
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await activar(db);
  await db.exec(`update api_webhook_endpoints set status = 'disabled', disabled_reason = 'person_inactive', disabled_at = now() where id = '${EP}'`);
  const reactivar = (cursor: string) => `update api_webhook_endpoints set status = 'active', disabled_reason = null, disabled_at = null, cursor_at = ${cursor} where id = '${EP}'`;
  await falla(db, reactivar("now() - interval '3 hours'"), /desde ahora/, "reactivar un DETENIDO desde el cursor viejo: rechazado (no anuncia la baja)");
  await db.exec(`delete from api_webhook_deliveries where event_type = 'webhook.test'`);
  await falla(db, reactivar("now() - interval '10 seconds'"), /prueba entregada/, "reactivar un DETENIDO sin prueba reciente: rechazado");
}
// G4. la prueba tiene que ser DE ESTE endpoint y de tipo webhook.test
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await db.exec(alta({ id: `'${EPA}'`, api_key_id: `'${K_ANA}'`, created_by: `'${ANA}'` }));
  await db.exec(`insert into api_webhook_deliveries(endpoint_id, event_type, body, state, delivered_at, last_status_code, attempts) values ('${EPA}', 'webhook.test', '{}', 'delivered', now(), 204, 1)`);
  const act = `update api_webhook_endpoints set status = 'active', paused_at = null, paused_by = null, cursor_at = now() - interval '10 seconds', cursor_id = '00000000-0000-0000-0000-000000000000' where id = '${EP}'`;
  await falla(db, act, /prueba entregada/, "la prueba entregada de OTRO endpoint no activa este");
  // un timbre entregado hace 1 min no es una prueba: reanudar pide una prueba nueva
  await activar(db, EP);
  await db.exec(`insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP}', 'messages.created', '{}', 1);
    update api_webhook_deliveries set state = 'delivered', delivered_at = now(), last_status_code = 200, attempts = 1 where endpoint_id = '${EP}' and event_type = 'messages.created';
    delete from api_webhook_deliveries where endpoint_id = '${EP}' and event_type = 'webhook.test';
    update api_webhook_endpoints set status = 'paused', paused_at = now() where id = '${EP}';`);
  await falla(db, act, /prueba entregada/, "un TIMBRE entregado no cuenta como prueba al reanudar");
}
// G5. los bordes: prueba de 14 min sí / de 16 no; cursor de 90 s sí / de 3 min no / +2 s sí / +30 s no
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  const prueba = (hace: string) => db.exec(`delete from api_webhook_deliveries; set session_replication_role = replica;
    insert into api_webhook_deliveries(endpoint_id, tenant_id, event_type, body, state, delivered_at, created_at, last_status_code, attempts) values ('${EP}', '${T1}', 'webhook.test', '{}', 'delivered', now() - interval '${hace}', now() - interval '${hace}', 204, 1);
    set session_replication_role = origin;`);
  const act = (cursor: string) => `update api_webhook_endpoints set status = 'active', paused_at = null, paused_by = null, cursor_at = ${cursor}, cursor_id = '00000000-0000-0000-0000-000000000000' where id = '${EP}'`;
  const pausar = () => db.exec(`update api_webhook_endpoints set status = 'paused', paused_at = now() where id = '${EP}'`);
  await prueba("16 minutes");
  await falla(db, act("now() - interval '10 seconds'"), /prueba entregada/, "prueba de hace 16 min: no activa");
  await prueba("14 minutes");
  await anda(db, act("now() - interval '10 seconds'"), "prueba de hace 14 min: activa");
  await pausar(); await prueba("1 minute");
  await falla(db, act("now() - interval '3 minutes'"), /desde ahora/, "cursor de hace 3 min: rechazado (la ventana es de 2)");
  await anda(db, act("now() - interval '90 seconds'"), "cursor de hace 90 s: anda");
  await pausar();
  await falla(db, act("now() + interval '30 seconds'"), /desde ahora/, "cursor 30 s en el futuro: rechazado (saltearía mensajes)");
  await anda(db, act("now() + interval '2 seconds'"), "cursor 2 s en el futuro (reloj de la edge): anda");
}
// G6. un endpoint activo no pierde el cursor (sin cursor el turno da falso para siempre)
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await activar(db);
  await falla(db, `update api_webhook_endpoints set cursor_at = null, cursor_id = null where id = '${EP}'`, /check/i, "a un endpoint ACTIVO no se le borra el cursor");
}
// G7. el turno: solo cuenta un TIMBRE PENDIENTE DE ESE endpoint
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await activar(db);
  await db.exec(`insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP}', 'messages.created', '{}', 1);
    update api_webhook_deliveries set state = 'delivered', delivered_at = now(), last_status_code = 200, attempts = 1 where event_type = 'messages.created';
    insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP}', 'messages.created', '{}', 1);
    update api_webhook_deliveries set state = 'dropped', drop_reason = 'receiver_failing' where state = 'pending';`);
  check(await hay(db) === false, "timbres ya entregados o descartados, sin mensajes: no hay trabajo (sin despertar cada 15 s)");
  await db.exec(`insert into api_webhook_deliveries(endpoint_id, event_type, body) values ('${EP}', 'webhook.test', '{}')`);
  check(await hay(db) === false, "una PRUEBA pendiente (colgada), sin mensajes: no hay trabajo");
  await db.exec(alta({ id: `'${EPA}'`, api_key_id: `'${K_ANA}'`, created_by: `'${ANA}'` }));
  await activar(db, EPA);
  await db.exec(`delete from api_webhook_deliveries where event_type = 'messages.created';
    insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP}', 'messages.created', '{}', 1)`);
  const r = await q(db, `select id::text from api_webhooks_reclamar(5, 60)`);
  check(r.length === 1 && r[0].id === EP, `el timbre pendiente de EP no despierta a EPA (${r.map((x) => x.id).join(",")})`);
}
// G8. un timbre descartado no bloquea el siguiente; pausado o detenido no recibe timbres
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await activar(db);
  await db.exec(`insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP}', 'messages.created', '{}', 1);
    update api_webhook_deliveries set state = 'dropped', drop_reason = 'receiver_failing' where event_type = 'messages.created';`);
  await anda(db, `insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP}', 'messages.created', '{}', 1)`, "con el anterior DESCARTADO, un timbre nuevo: anda");
  await db.exec(`update api_webhook_deliveries set state = 'dropped', drop_reason = 'endpoint_paused' where state = 'pending';
    update api_webhook_endpoints set status = 'paused', paused_at = now() where id = '${EP}'`);
  await falla(db, `insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP}', 'messages.created', '{}', 1)`, /solo un endpoint activo/, "timbre para un endpoint PAUSADO: rechazado");
  await db.exec(`update api_webhook_endpoints set status = 'disabled', paused_at = null, disabled_reason = 'admin', disabled_at = now() where id = '${EP}'`);
  await falla(db, `insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP}', 'messages.created', '{}', 1)`, /solo un endpoint activo/, "timbre para un endpoint DETENIDO: rechazado");
}
// G9. CHECKs de las entregas que nadie pinchaba (cada uno solo, sin que otro CHECK lo tape)
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await db.exec(`insert into api_webhook_deliveries(id, endpoint_id, event_type, body) values ('${EP}', '${EP}', 'webhook.test', '{}')`);
  const upd = (set: string) => `update api_webhook_deliveries set ${set} where id = '${EP}'`;
  await falla(db, `insert into api_webhook_deliveries(endpoint_id, event_type, body) values ('${EP}', 'messages.updated', '{}')`, /check/i, "tipo desconocido SIN cantidad: rechazado");
  await falla(db, upd("state = 'failed'"), /check/i, "estado de entrega desconocido: rechazado");
  await falla(db, upd("state = 'dropped', drop_reason = 'inventado'"), /check/i, "motivo de descarte desconocido: rechazado");
  await falla(db, upd("attempts = -1"), /check/i, "intentos negativos: rechazado");
  await falla(db, upd("last_status_code = 99"), /check/i, "código HTTP 99 en la entrega: rechazado");
  await falla(db, upd(`last_error = '${"x".repeat(61)}'`), /check/i, "last_error de 61 en la entrega: rechazado");
  await falla(db, upd("latency_ms = -1"), /check/i, "latencia negativa: rechazada");
  await falla(db, upd("drop_reason = 'test_failed'"), /check/i, "motivo de descarte sin estar descartada: rechazado");
  await falla(db, upd("delivered_at = now()"), /check/i, "fecha de entrega sin estar entregada: rechazada");
}
// G10. CHECKs del endpoint que nadie pinchaba
{
  const db = await nueva();
  for (const [extra, m] of [[{ secret_key_version: "0" }, "secret_key_version 0"], [{ secret_last4: "'abc'" }, "secret_last4 de 3"]] as const) {
    await db.exec("begin"); await falla(db, alta(extra), /check/i, `${m}: rechazado`); await db.exec("rollback");
  }
  await db.exec(alta({ id: `'${EP}'` }));
  await activar(db);
  await falla(db, `update api_webhook_endpoints set consecutive_failures = -1 where id = '${EP}'`, /check/i, "fallos consecutivos negativos: rechazado");
  await falla(db, `update api_webhook_endpoints set disabled_at = now() where id = '${EP}'`, /check/i, "activo con disabled_at: rechazado");
  await falla(db, `update api_webhook_endpoints set paused_at = now() where id = '${EP}'`, /check/i, "activo con paused_at: rechazado");
  await falla(db, `update api_webhook_endpoints set paused_by = '${ANA}' where id = '${EP}'`, /check/i, "activo con paused_by y sin paused_at: rechazado");
}
// G11. el alta PISA lo que el trigger fuerza, aunque la edge mande otra cosa
{
  const db = await nueva();
  await anda(db, alta({ id: `'${EP}'`, cursor_at: "now() - interval '1 day'", cursor_id: `'${EP}'`, lease_until: "'infinity'", created_at: "now() - interval '1 year'", updated_at: "now() - interval '1 year'" }), "alta con cursor, reclamo y fechas de mentira");
  const e = await uno(db, `select cursor_at c, cursor_id i, lease_until l, (now() - created_at < interval '1 minute') cr, (now() - updated_at < interval '1 minute') up from api_webhook_endpoints where id = '${EP}'`);
  check(e.c === null && e.i === null, "el alta anula el cursor que venga");
  check(e.l === null, "el alta anula el reclamo que venga (un lease 'infinity' lo mataría en silencio al activarlo)");
  check(e.cr === true && e.up === true, "el alta pone created_at y updated_at en ahora");
  await db.exec(`insert into api_webhook_deliveries(endpoint_id, event_type, body, created_at) values ('${EP}', 'webhook.test', '{}', now() - interval '30 days')`);
  check((await uno(db, `select (now() - created_at < interval '1 minute') r from api_webhook_deliveries`)).r === true, "la entrega nace con created_at = ahora (no se puede antedatar para la purga)");
}
// G12. llaves: con Messenger pero sin vencimiento (saltando la regla, como K_SINIP) y con OTRO permiso de Messenger
{
  const db = await nueva();
  await db.exec(`alter table public.api_keys disable trigger api_keys_reglas_messenger;
    insert into public.api_keys(id, name, key_prefix, key_hash, created_by, acts_as_user_id, tenant_id, scopes, ip_whitelist, expires_at) values
      ('20000000-0000-0000-0000-000000000007', 'sinvenc', 'p', 'h7', '${ALVARO}', '${ALVARO}', '${T1}', '{messenger:read}', '{1.2.3.4}', null);
    alter table public.api_keys enable trigger api_keys_reglas_messenger;
    insert into public.api_keys(id, name, key_prefix, key_hash, created_by, acts_as_user_id, tenant_id, scopes, ip_whitelist, expires_at) values
      ('20000000-0000-0000-0000-000000000008', 'escribe', 'p', 'h8', '${ALVARO}', '${ALVARO}', '${T1}', '{messenger:write}', '{1.2.3.4}', now() + interval '30 days');`);
  await falla(db, alta({ api_key_id: "'20000000-0000-0000-0000-000000000007'" }), /no vence/, "llave de Messenger SIN vencimiento: rechazada");
  await falla(db, alta({ api_key_id: "'20000000-0000-0000-0000-000000000008'" }), /permiso de Messenger/, "llave con messenger:write pero sin messenger:read: rechazada");
}
// G13. forma de la URL: caracteres de control que no son espacio, host de más de 253, etiqueta de 64
{
  const db = await nueva();
  const et = (n: number) => "a".repeat(n);
  await falla(db, alta({ url: `'https://hooks.integrador.example/a' || chr(1) || 'b'` }), /espacios/, "URL con un carácter de control (0x01): rechazada");
  await falla(db, alta({ url: `'https://hooks.integrador.example/a' || chr(127) || 'b'` }), /espacios/, "URL con DEL (0x7f): rechazada");
  await falla(db, alta({ url: `'https://${et(63)}.${et(63)}.${et(63)}.${et(63)}.example/x'` }), /dominio/, "host de 263 caracteres: rechazado");
  await falla(db, alta({ url: `'https://${et(64)}.example/x'` }), /dominio/, "etiqueta de 64 caracteres: rechazada");
  await db.exec("begin");
  await anda(db, alta({ url: `'https://${et(63)}.${et(63)}.${et(63)}.${et(61)}/x'` }), "host de 253 con etiquetas de 63: anda");
  await db.exec("rollback");
}
// G14. el margen del turno es 10 s, ni más ni menos
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await activar(db);
  await retroceder(db, `update api_webhook_endpoints set cursor_at = now() - interval '1 minute' where id = '${EP}'`);
  await msg(db, C1, BETO, "8 seconds");
  check(await hay(db) === false, "mensaje de hace 8 s: no hay trabajo (margen de 10)");
  await db.exec(`delete from chat_messages`);
  await msg(db, C1, BETO, "12 seconds");
  check(await hay(db) === true, "mensaje de hace 12 s: hay trabajo (margen de 10, no más)");
}
// G15. reclamar: orden en los dos sentidos, duración del reclamo, y la forma que protege contra dos corridas a la vez
{
  const db = await nueva();
  await db.exec(`insert into chat_participants(conversation_id, user_id) values ('${C2}', '${ALVARO}') on conflict do nothing`);
  await db.exec(alta({ id: `'${EP}'` }));
  await db.exec(alta({ id: `'${EPA}'`, api_key_id: `'${K_ANA}'`, created_by: `'${ANA}'` }));
  await activar(db, EP); await activar(db, EPA);
  await retroceder(db, `update api_webhook_endpoints set cursor_at = now() - interval '1 minute'`);
  await msg(db, C2, BETO, "30 seconds");
  // ahora el que espera hace más es EP (el primero que se creó): sin ORDER BY, uno de los dos sentidos falla
  await db.exec(`update api_webhook_endpoints set next_attempt_at = now() - interval '5 minutes' where id = '${EP}'`);
  await db.exec(`update api_webhook_endpoints set next_attempt_at = now() - interval '1 minute' where id = '${EPA}'`);
  const r = await q(db, `select id::text from api_webhooks_reclamar(1, 10)`);
  check(r.length === 1 && r[0].id === EP, `con _max 1 toma el que espera hace más, en el otro sentido (${r[0]?.id})`);
  const l = await uno(db, `select extract(epoch from lease_until - now())::int s from api_webhook_endpoints where id = '${EP}'`);
  check(l.s >= 9 && l.s <= 10, `reclamar(1, 10) lo toma por 10 s, no por 60 (${l.s})`);
  // PGlite es una sola conexión: la carrera entre dos corridas no se puede provocar acá. Se fija la FORMA.
  const def = (await uno(db, `select pg_get_functiondef('public.api_webhooks_reclamar(integer,integer)'::regprocedure) d`)).d as string;
  check(/for no key update skip locked/i.test(def), "reclamar bloquea la fila con FOR NO KEY UPDATE SKIP LOCKED (no choca con la FK de las entregas)");
  check(/x\.status = 'active'/.test(def) && /x\.lease_until is null or x\.lease_until <= now\(\)/.test(def) && /x\.next_attempt_at <= now\(\)/.test(def),
    "reclamar repite estado, reclamo y turno sobre la fila que bloquea (EvalPlanQual los re-mira con la versión nueva)");
}
// G16. purga con tope nulo; borrar la llave se lleva el endpoint
{
  const db = await nueva();
  await falla(db, `select app_purgar_entregas_webhooks(14, null)`, /positivo/, "purga con p_tope nulo (sin límite): rechazada");
  await db.exec(alta({ id: `'${EP}'` }));
  await db.exec(`insert into api_webhook_deliveries(endpoint_id, event_type, body) values ('${EP}', 'webhook.test', '{}')`);
  await anda(db, `delete from api_keys where id = '${K_MSG}'`, "borrar la llave con endpoint: anda");
  check((await uno(db, `select (select count(*) from api_webhook_endpoints)::int e, (select count(*) from api_webhook_deliveries)::int d`)).e === 0, "borrar la llave se lleva el endpoint y sus entregas");
}


// ════ H. lo que agregó la revisión adversarial ════
const estado = async (db: PGlite, id = EP) => (await uno(db, `select status, disabled_reason r, paused_at p, next_attempt_at n, consecutive_failures f, failing_since fs, lease_until l from api_webhook_endpoints where id = '${id}'`));
const timbres = async (db: PGlite, id = EP) => await q(db, `select state, drop_reason r from api_webhook_deliveries where endpoint_id = '${id}' and event_type = 'messages.created' order by created_at`);
const pausar = (db: PGlite, id = EP) => db.exec(`update api_webhook_endpoints set status = 'paused', paused_at = now(), paused_by = '${ANA}' where id = '${id}'`);
const detener = (db: PGlite, motivo: string, id = EP) => db.exec(`update api_webhook_endpoints set status = 'disabled', disabled_reason = '${motivo}', disabled_at = now() where id = '${id}'`);
const timbre = (db: PGlite, id = EP) => db.exec(`insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${id}', 'messages.created', '{}', 1)`);
// H1. activar arranca de cero: sin la espera, la racha ni el timbre de antes; el reclamo vivo se respeta
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await activar(db);
  await timbre(db);
  await db.exec(`update api_webhook_endpoints set next_attempt_at = now() + interval '8 hours', consecutive_failures = 13, failing_since = now() - interval '73 hours', lease_until = now() + interval '40 seconds' where id = '${EP}'`);
  await detener(db, "receiver_failing");
  const t0 = await timbres(db);
  check(t0.length === 1 && t0[0].state === "dropped" && t0[0].r === "receiver_failing", `detener por receiver_failing descarta el timbre con ese motivo (${JSON.stringify(t0)})`);
  await activar(db);
  const e = await estado(db);
  check(e.status === "active" && e.f === 0 && e.fs === null && new Date(e.n).getTime() <= Date.now() + 1000, "reanudar desde detenido: sin espera, sin racha y sin failing_since viejos");
  check(e.l !== null, "reanudar NO suelta un reclamo vivo (que venza solo)");
  // el timbre pendiente de ANTES de pausar se descarta al reanudar (si la pausa no lo hubiera descartado)
  await db.exec(`update api_webhook_endpoints set lease_until = null where id = '${EP}'`);
  await timbre(db);
  await db.exec(`set session_replication_role = replica; update api_webhook_endpoints set status = 'paused', paused_at = now() where id = '${EP}'; set session_replication_role = origin;`);
  check((await timbres(db)).filter((t) => t.state === "pending").length === 1, "(escena) quedó un timbre pendiente con el endpoint pausado");
  await activar(db);
  const t1 = await timbres(db);
  check(t1.filter((t) => t.state === "pending").length === 0 && t1[t1.length - 1].r === "endpoint_paused", `reanudar descarta el timbre viejo (endpoint_paused) (${JSON.stringify(t1)})`);
  check(await hay(db) === false, "y sin mensajes nuevos no hay trabajo (no se reenvía lo viejo)");
  await anda(db, `insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP}', 'messages.created', '{}', 2)`, "y el primer timbre nuevo entra (el lugar quedó libre)");
}
// H2. salir de activo descarta el timbre en el momento, con el motivo que corresponde
for (const [salida, esperado] of [["paused", "endpoint_paused"], ["receiver_gone", "receiver_gone"], ["receiver_failing", "receiver_failing"], ["key_revoked", "endpoint_disabled"], ["admin", "endpoint_disabled"]] as const) {
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await activar(db);
  await timbre(db);
  if (salida === "paused") await pausar(db); else await detener(db, salida);
  const t = await timbres(db);
  check(t.length === 1 && t[0].state === "dropped" && t[0].r === esperado, `salir de activo por ${salida}: el timbre queda descartado con ${esperado} (${JSON.stringify(t)})`);
}
// H3. el cursor de un endpoint activo solo avanza y nunca queda en el futuro
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await activar(db);
  const Z = "00000000-0000-0000-0000-000000000000", MID = "80000000-0000-0000-0000-000000000000";
  await db.exec(`update api_webhook_endpoints set cursor_id = '${MID}' where id = '${EP}'`);
  await falla(db, `update api_webhook_endpoints set cursor_at = cursor_at - interval '1 second' where id = '${EP}'`, /solo avanza/, "cursor 1 s atrás: rechazado");
  await falla(db, `update api_webhook_endpoints set cursor_id = '${Z}' where id = '${EP}'`, /solo avanza/, "mismo instante con un id menor: rechazado");
  await anda(db, `update api_webhook_endpoints set cursor_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' where id = '${EP}'`, "mismo instante con un id mayor (así lo deja el feed al día): anda");
  await anda(db, `update api_webhook_endpoints set cursor_at = now(), cursor_id = '${Z}' where id = '${EP}'`, "cursor hacia adelante: anda");
  await falla(db, `update api_webhook_endpoints set cursor_at = now() + interval '1 minute' where id = '${EP}'`, /futuro/, "cursor en el futuro (endpoint mudo para siempre): rechazado");
  await falla(db, `update api_webhook_endpoints set cursor_at = '2100-01-01' where id = '${EP}'`, /futuro/, "cursor en 2100: rechazado");
  await anda(db, `update api_webhook_endpoints set last_error = 'timeout', consecutive_failures = 1 where id = '${EP}'`, "anotar un fallo sin mover el cursor: anda");
  await pausar(db);
  await anda(db, `update api_webhook_endpoints set cursor_at = now() - interval '5 days' where id = '${EP}'`, "pausado, el cursor se puede tocar (activar lo vuelve a exigir desde ahora)");
  await falla(db, `update api_webhook_endpoints set status = 'active', paused_at = null, paused_by = null where id = '${EP}'`, /desde ahora|prueba/, "y reanudar con ese cursor viejo: rechazado");
}
// H4. el código HTTP lo elige el receptor: 999 se anota; fuera de 3 cifras no
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await activar(db);
  await timbre(db);
  await anda(db, `update api_webhook_endpoints set last_status_code = 999, consecutive_failures = consecutive_failures + 1, failing_since = now(), next_attempt_at = now() + interval '30 seconds' where id = '${EP}'`, "un intento que el receptor contestó con 999 se anota en el endpoint");
  await anda(db, `update api_webhook_deliveries set last_status_code = 999, attempts = attempts + 1 where endpoint_id = '${EP}' and state = 'pending'`, "y en el timbre");
  await falla(db, `update api_webhook_endpoints set last_status_code = 1000 where id = '${EP}'`, /check/i, "1000 no es un código HTTP: rechazado");
}
// H5. "entregada" es un 2xx de un intento de verdad
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  const prueba = (cols: string, vals: string) => `insert into api_webhook_deliveries(endpoint_id, event_type, body, state, delivered_at${cols}) values ('${EP}', 'webhook.test', '{}', 'delivered', now()${vals})`;
  await falla(db, prueba("", ""), /check/i, "prueba entregada sin intento ni código: rechazada");
  await falla(db, prueba(", last_status_code, attempts", ", 500, 1"), /check/i, "prueba 'entregada' con un 500: rechazada");
  await falla(db, prueba(", last_status_code, attempts", ", 302, 1"), /check/i, "prueba 'entregada' con un 302 (no se sigue): rechazada");
  await falla(db, prueba(", last_status_code, attempts", ", 200, 0"), /check/i, "prueba 'entregada' con 0 intentos: rechazada");
  await anda(db, prueba(", last_status_code, attempts", ", 299, 1"), "prueba entregada con 299: anda");
  await db.exec(`delete from api_webhook_deliveries; insert into api_webhook_deliveries(endpoint_id, event_type, body, state, delivered_at, last_status_code, attempts) values ('${EP}', 'webhook.test', '{}', 'delivered', now() + interval '1 year', 204, 1)`);
  await falla(db, `update api_webhook_endpoints set status = 'active', cursor_at = now() - interval '10 seconds', cursor_id = '00000000-0000-0000-0000-000000000000' where id = '${EP}'`, /prueba entregada/, "una prueba con fecha de entrega en el futuro no activa");
}
// H6. apagado automático: baja de la persona, llave revocada o sin Messenger, otra agencia
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await db.exec(alta({ id: `'${"40000000-0000-0000-0000-0000000000a1"}'`, api_key_id: `'${K_ANA}'`, created_by: `'${ANA}'` }));
  await activar(db); await activar(db, "40000000-0000-0000-0000-0000000000a1");
  await timbre(db);
  await db.exec(`update profiles set full_name = 'Alvaro M' where id = '${ALVARO}'`);
  check((await estado(db)).status === "active", "tocar otra cosa del perfil no detiene nada");
  await db.exec(`update profiles set deleted_at = now() where id = '${ALVARO}'`);
  const e = await estado(db);
  check(e.status === "disabled" && e.r === "person_inactive", `dar de baja a la persona detiene SU endpoint en el momento (${e.status}/${e.r})`);
  check((await timbres(db))[0]?.r === "endpoint_disabled", "y descarta su timbre pendiente");
  check((await estado(db, "40000000-0000-0000-0000-0000000000a1")).status === "active", "el endpoint de otra persona sigue activo");
  await db.exec(`update profiles set deleted_at = null where id = '${ALVARO}'`);
  check((await estado(db)).status === "disabled", "restore_user NO lo revive: hace falta un Resume con prueba");
  await activar(db);
  check((await estado(db)).status === "active", "Resume con prueba después de la restauración: activo");
  // llave: lo que hace api_key_consumir en cada pedido no dispara nada
  await db.exec(`update api_keys set request_count = request_count + 1, last_used_at = now(), minuto_pedidos = minuto_pedidos + 1 where id = '${K_MSG}'`);
  check((await estado(db)).status === "active", "anotar un pedido del API en la llave no toca el webhook");
  await db.exec(`update api_keys set scopes = '{creators:read}' where id = '${K_MSG}'`);
  const s = await estado(db);
  check(s.status === "disabled" && s.r === "scope_removed", `sacarle Messenger a la llave lo detiene (${s.status}/${s.r})`);
  await db.exec(`update api_keys set revoked_at = now() where id = '${K_ANA}'`);
  const a = await estado(db, "40000000-0000-0000-0000-0000000000a1");
  check(a.status === "disabled" && a.r === "key_revoked", `revocar la llave de Ana detiene el suyo (${a.status}/${a.r})`);
}
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await db.exec(alta({ id: `'${"40000000-0000-0000-0000-0000000000a1"}'`, api_key_id: `'${K_ANA}'`, created_by: `'${ANA}'` }));
  await activar(db);
  await pausar(db, "40000000-0000-0000-0000-0000000000a1");
  await db.exec(`insert into tenants(id, slug, name) values ('${T2}', 'otra', 'Otra'), (gen_random_uuid(), 'otra2', 'Otra 2')`);
  const r = await q(db, `select status, disabled_reason r, paused_at p from api_webhook_endpoints order by id`);
  check(r.every((x) => x.status === "disabled" && x.r === "multi_agency" && x.p === null), `otra agencia detiene TODOS (activo y pausado), con un insert de varias filas (${JSON.stringify(r.map((x) => x.status + "/" + x.r))})`);
  // la pared de la base también en el alta del timbre (aunque el trigger de agencias no hubiera corrido)
  await db.exec(`delete from tenants where id <> '${T1}'`);
  await activar(db);
  await db.exec(`alter table tenants disable trigger api_webhooks_por_agencias; insert into tenants(id, slug, name) values ('${T2}', 'otra', 'Otra'); alter table tenants enable trigger api_webhooks_por_agencias;`);
  await falla(db, `insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP}', 'messages.created', '{}', 1)`, /más de una agencia/, "con dos agencias no nace ningún timbre aunque el endpoint siga activo");
}
// H7. el apagado automático NUNCA hace fallar lo que lo dispara
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await activar(db);
  // escena: algo hace fallar cualquier cambio del endpoint
  await db.exec(`alter table api_webhook_endpoints add constraint escena_falla check (status <> 'disabled') not valid`);
  await anda(db, `update api_keys set revoked_at = now() where id = '${K_MSG}'`, "revocar la llave anda aunque detener el webhook falle");
  await anda(db, `update profiles set deleted_at = now() where id = '${ALVARO}'`, "dar de baja a la persona anda aunque detener el webhook falle");
  await anda(db, `insert into tenants(id, slug, name) values ('${T2}', 'otra', 'Otra')`, "dar de alta otra agencia anda aunque detener el webhook falle");
  check((await estado(db)).status === "active", "(y el endpoint quedó como estaba: la pared es el turno y la edge)");
  await retroceder(db, `update api_webhook_endpoints set cursor_at = now() - interval '1 minute' where id = '${EP}'`);
  await msg(db, C1, BETO, "30 seconds");
  // Con la migración del despachador, el turno SÍ despierta a la edge: es el respaldo
  // (la edge, con dos agencias, no lee ni manda nada y detiene todo; bloque O).
  check(await hay(db) === true, "con dos agencias y el endpoint sin detener, el turno despierta a la edge (el respaldo del trigger)");
  check((await q(db, `select * from api_webhooks_con_trabajo()`)).length === 0, "y con_trabajo, sola, tampoco devuelve nada");
}
// H8. la limpieza borra las PRUEBAS pendientes viejas (no se reintentan) y deja el timbre pendiente
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await activar(db);
  await db.exec(`set session_replication_role = replica;
    insert into api_webhook_deliveries(endpoint_id, tenant_id, event_type, body, state, created_at) values ('${EP}', '${T1}', 'webhook.test', '{}', 'pending', now() - interval '20 days');
    insert into api_webhook_deliveries(endpoint_id, tenant_id, event_type, body, message_count, state, created_at) values ('${EP}', '${T1}', 'messages.created', '{}', 1, 'pending', now() - interval '20 days');
    set session_replication_role = origin;`);
  check((await uno(db, `select app_purgar_entregas_webhooks(14, 100) r`)).r === 1, "borra la prueba pendiente de hace 20 días");
  check((await uno(db, `select count(*)::int n from api_webhook_deliveries where event_type = 'messages.created' and state = 'pending'`)).n === 1, "y deja el timbre pendiente");
}
// H9. el turno del cron no planifica la consulta de chat si no hay endpoints listos
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await db.exec(`alter table chat_messages rename to chat_messages_x`);
  let r: unknown = "error";
  try { r = await hay(db); } catch (e) { r = String(e).slice(0, 80); }
  check(r === false, `sin endpoints listos, el turno no toca chat_messages (${r})`);
  await db.exec(`alter table chat_messages_x rename to chat_messages`);
  await activar(db);
  await db.exec(`update api_webhook_endpoints set next_attempt_at = now() + interval '1 hour' where id = '${EP}'`);
  await db.exec(`alter table chat_messages rename to chat_messages_x`);
  r = "error"; try { r = await hay(db); } catch (e) { r = String(e).slice(0, 80); }
  check(r === false, `con el único endpoint esperando para reintentar, tampoco (${r})`);
  await db.exec(`update api_webhook_endpoints set next_attempt_at = now() where id = '${EP}'`);
  r = "sin error"; try { await hay(db); } catch (e) { r = String(e); }
  check(/chat_messages/.test(String(r)), "con un endpoint listo, sí la consulta (prueba de que la salida temprana es la que corta)");
  await db.exec(`alter table chat_messages_x rename to chat_messages`);
}

// ════ I. bordes de lo agregado ════
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'`, next_attempt_at: "now() + interval '9 hours'", consecutive_failures: "7", failing_since: "now() - interval '5 days'" }));
  const e = await uno(db, `select next_attempt_at <= now() + interval '1 second' n, consecutive_failures f, failing_since fs from api_webhook_endpoints where id = '${EP}'`);
  check(e.n === true && e.f === 0 && e.fs === null, "el alta arranca sin espera ni racha de fallos aunque el pedido traiga otra cosa");
  await activar(db);
  await db.exec(`update profiles set deleted_at = null where id = '${ALVARO}'`);
  check((await uno(db, `select status from api_webhook_endpoints where id = '${EP}'`)).status === "active", "volver a poner deleted_at en nulo (sin baja) no detiene nada");
  await db.exec(`update api_keys set scopes = '{messenger:read,creators:read}' where id = '${K_MSG}'`);
  check((await uno(db, `select status from api_webhook_endpoints where id = '${EP}'`)).status === "active", "sumarle un permiso a la llave (sin sacarle Messenger) no detiene nada");
  await db.exec(`update api_keys set expires_at = expires_at - interval '1 day' where id = '${K_MSG}'`);
  check((await uno(db, `select status from api_webhook_endpoints where id = '${EP}'`)).status === "active", "acortar el vencimiento no detiene nada (lo mira la edge)");
}
{
  const db = await nueva();
  await db.exec("begin");
  for (const [u, m] of [["https://hooks.integrador.example/a\u200bb", "espacio de ancho cero en el camino"], ["https://hooks.integrador.example/a\u00e9", "letra con tilde sin codificar"], ["https://hooks.integrador.example/a\u202eb", "marca de dirección RTL"]] as const) {
    await db.exec("savepoint s");
    try { await db.exec(alta({ url: `'${u}'` })); mal.push(`URL aceptada y NO debía: ${m}`); }
    catch (e) { check(/normalizada|espacios/.test(String(e)), `URL rechazada: ${m}`); }
    await db.exec("rollback to savepoint s");
  }
  await db.exec("rollback");
}

// ════ J. segunda ronda de revisión ════
{
  const db = await nueva();
  const r = await q(db, `select proname, proconfig, prosecdef from pg_proc where proname in ('api_webhooks_detener','api_webhooks_por_agencias','api_webhooks_por_baja','api_webhooks_por_llave')`);
  check(r.length === 4 && r.every((x) => (x.proconfig ?? []).some((c: string) => /^lock_timeout=/.test(c) && c !== "lock_timeout=0")), "los cuatro apagados automáticos traen su propio lock_timeout (una espera no termina en una cancelación que no se atrapa)");
  check(r.find((x) => x.proname === "api_webhooks_detener")?.prosecdef === false, "api_webhooks_detener corre con los permisos de quien la llama");
  check(r.filter((x) => x.proname !== "api_webhooks_detener").every((x) => x.prosecdef === true), "los tres triggers de apagado son SECURITY DEFINER");
  await db.exec(alta({ id: `'${EP}'` }));
  await activar(db);
  await db.exec(`grant execute on function public.api_webhooks_detener(text, uuid[]) to anon`);
  await db.exec(`begin; set local role anon; select public.api_webhooks_detener('admin', array['${EP}'::uuid]); commit;`).catch(() => db.exec("rollback"));
  check((await uno(db, `select status from api_webhook_endpoints where id = '${EP}'`)).status === "active", "aun con EXECUTE, anon no detiene nada (necesita UPDATE sobre la tabla)");
  await db.exec(`update profiles set deleted_at = now() where id = '${ALVARO}'`);
  check((await uno(db, `select status || '/' || disabled_reason s from api_webhook_endpoints where id = '${EP}'`)).s === "disabled/person_inactive", "y la baja sigue deteniéndolo (desde el trigger)");
}
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  const prueba = (mas: string) => db.exec(`delete from api_webhook_deliveries; insert into api_webhook_deliveries(endpoint_id, event_type, body, state, delivered_at, last_status_code, attempts) values ('${EP}', 'webhook.test', '{}', 'delivered', now() + interval '${mas}', 204, 1)`);
  const act = `update api_webhook_endpoints set status = 'active', cursor_at = now() - interval '10 seconds', cursor_id = '00000000-0000-0000-0000-000000000000' where id = '${EP}'`;
  await prueba("6 seconds");
  await falla(db, act, /prueba entregada/, "prueba anotada con el reloj 6 s adelantado: no activa");
  await prueba("4 seconds");
  await anda(db, act, "prueba anotada con el reloj 4 s adelantado: activa (mismo margen que el cursor)");
}

// ════ K. api_webhooks_con_trabajo sola (la edge también la puede llamar) ════
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await activar(db);
  await retroceder(db, `update api_webhook_endpoints set cursor_at = now() - interval '1 minute' where id = '${EP}'`);
  await msg(db, C1, BETO, "30 seconds");
  const ct = async () => (await q(db, `select * from api_webhooks_con_trabajo()`)).length;
  check(await ct() === 1, "con_trabajo: activo, libre, con turno y un mensaje → lo devuelve");
  await db.exec(`update api_webhook_endpoints set lease_until = now() + interval '30 seconds' where id = '${EP}'`);
  check(await ct() === 0, "con_trabajo: reclamado → no");
  await db.exec(`update api_webhook_endpoints set lease_until = null, next_attempt_at = now() + interval '1 minute' where id = '${EP}'`);
  check(await ct() === 0, "con_trabajo: con el turno en el futuro → no");
  await db.exec(`update api_webhook_endpoints set next_attempt_at = now() where id = '${EP}'`);
  await db.exec(`set session_replication_role = replica; update api_webhook_endpoints set status = 'paused', paused_at = now() where id = '${EP}'; set session_replication_role = origin;`);
  check(await ct() === 0, "con_trabajo: pausado → no");
}

// ════ L. el apagado automático no bloquea aunque falle ANTES de llegar a detener ════
{
  const db = await nueva();
  await db.exec(alta({ id: `'${EP}'` }));
  await activar(db);
  await db.exec(`alter table api_webhook_endpoints rename to api_webhook_endpoints_x`);
  await anda(db, `update api_keys set revoked_at = now() where id = '${K_MSG}'`, "revocar anda aunque la tabla de endpoints no esté (falla el SELECT del trigger)");
  await anda(db, `update profiles set deleted_at = now() where id = '${ALVARO}'`, "dar de baja anda aunque la tabla de endpoints no esté");
  await anda(db, `insert into tenants(id, slug, name) values ('${T2}', 'otra', 'Otra')`, "dar de alta una agencia anda aunque la tabla de endpoints no esté");
  await db.exec(`alter table api_webhook_endpoints_x rename to api_webhook_endpoints`);
}

// ════ M. lo que la edge acepta, la base también (y con el mismo host) ════
{
  const db = await nueva();
  const entradas = [
    "https://hooks.integrador.com/maven/abc?x=1", "https://INTEGRADOR.com:443/a b?c=d e", "https://bücher.de/ñandú",
    "https://integrador.com", "https://integrador.com?x=1", "https://a.b.c.integrador.co.uk/p/q/r?s=t&u=%20v",
    "https://integrador.com/<x>\"y\"", "https://integrador.com/a\\b", "https://x-y.integrador.io/" + "a".repeat(1900),
  ];
  for (const entrada of entradas) {
    const r = normalizarUrlDeWebhook(entrada);
    if (!r.ok) continue;
    await db.exec("begin");
    try {
      await db.exec(`delete from api_webhook_endpoints; ${alta({ url: `'${r.href.replaceAll("'", "''")}'` })}`);
      const host = (await uno(db, `select url_host h from api_webhook_endpoints`)).h;
      check(host === r.host, `edge y base coinciden en el host de ${entrada.slice(0, 50)} (${host} / ${r.host})`);
    } catch (e) {
      mal.push(`la edge aceptó y la base rechazó ${entrada.slice(0, 50)} → ${String(e).slice(0, 90)}`);
    }
    await db.exec("rollback");
  }
}

// ════ N. las acciones de manage-api-keys (webhooks.ts) contra la base de verdad ════
// Lo mismo que hace la edge, pero con un Datos en SQL: así cada escritura del PR 3
// pasa por los triggers y los CHECKs reales (alta, turno de la prueba, prueba
// entregada, activación, pausa, reanudar, baja) y por el aislamiento por agencia.
{
  const db = await nueva();
  const fila = (r: Record<string, unknown> | undefined) => {
    if (!r) return null;
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) o[k] = v instanceof Date ? v.toISOString() : v;
    return o;
  };
  const q1 = async (sql: string, p: unknown[] = []) => fila((await db.query(sql, p)).rows[0] as Record<string, unknown> | undefined);
  const escribir = async (sql: string, p: unknown[]) => {
    try { return { ok: true as const, valor: fila((await db.query(sql, p)).rows[0] as Record<string, unknown> | undefined) }; }
    catch (e) { return { ok: false as const, codigo: (e as { code?: string }).code ?? null }; }
  };
  const escrituras: string[] = [];
  /** El Datos de la edge, en SQL y atado a la agencia T (como crearDatos). */
  const datosDe = (T: string): Datos => ({
    llave: async (id) => (await q1(`select id, key_prefix, scopes, expires_at, revoked_at, acts_as_user_id from api_keys where id = $1 and tenant_id = $2`, [id, T])) as unknown as Llave,
    llaveVigente: async (id) => (await q1(`select api_key_vigente($1::uuid) v`, [id]))?.v === true,
    agencias: async () => Number((await q1(`select count(*)::int n from tenants`))?.n),
    endpoint: async (id) => (await q1(`select * from api_webhook_endpoints where id = $1 and tenant_id = $2`, [id, T])) as unknown as FilaEndpoint,
    endpointDeLlave: async (k) => (await q1(`select * from api_webhook_endpoints where api_key_id = $1 and tenant_id = $2`, [k, T])) as unknown as FilaEndpoint,
    endpointsDeLlaves: async (ks) => (await db.query(`select * from api_webhook_endpoints where api_key_id = any($1) and tenant_id = $2`, [ks, T])).rows.map((r) => fila(r as Record<string, unknown>)) as unknown as FilaEndpoint[],
    entregas: async (id, limite, solo) => (await db.query(`select ${COLS_ENTREGA} from api_webhook_deliveries where endpoint_id = $1 and tenant_id = $2 ${solo ? "and state <> 'delivered'" : ""} order by created_at desc limit $3`, [id, T, limite])).rows.map((r) => fila(r as Record<string, unknown>)!),
    nombres: async (ids) => new Map(((await db.query(`select id, full_name from profiles where id = any($1)`, [ids])).rows as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name])),
    crearEndpoint: async (f) => {
      escrituras.push("crearEndpoint");
      const c = { ...f, tenant_id: T };
      const k = Object.keys(c);
      const r = await escribir(`insert into api_webhook_endpoints(${k.join(",")}) values (${k.map((_, i) => `$${i + 1}`).join(",")}) returning *`, Object.values(c));
      return r.ok ? { ok: true, valor: r.valor as unknown as FilaEndpoint } : r;
    },
    actualizarEndpoint: async (id, cambios, siEstado) => {
      escrituras.push("actualizarEndpoint");
      const k = Object.keys(cambios);
      const r = await escribir(
        `update api_webhook_endpoints set ${k.map((c, i) => `${c} = $${i + 1}`).join(", ")} where id = $${k.length + 1} and tenant_id = $${k.length + 2} and status = any($${k.length + 3}) returning *`,
        [...Object.values(cambios), id, T, siEstado],
      );
      return r.ok ? { ok: true, valor: r.valor as unknown as FilaEndpoint | null } : r;
    },
    // Lo mismo que el .or(last_test_at.is.null, last_test_at.lt."…") de crearDatos.
    reservarPrueba: async (id, antesMs) => {
      escrituras.push("reservarPrueba");
      const r = await escribir(`update api_webhook_endpoints set last_test_at = 'now' where id = $1 and tenant_id = $2 and (last_test_at is null or last_test_at < $3) returning *`, [id, T, new Date(antesMs).toISOString()]);
      return r.ok ? { ok: true, valor: r.valor as unknown as FilaEndpoint | null } : r;
    },
    borrarEndpoint: async (id) => (escrituras.push("borrarEndpoint"), (await db.query(`delete from api_webhook_endpoints where id = $1 and tenant_id = $2 returning id`, [id, T])).rows.length > 0),
    crearEntrega: async (f) => {
      escrituras.push("crearEntrega");
      const c = { ...f, tenant_id: T };
      const k = Object.keys(c);
      return (await escribir(`insert into api_webhook_deliveries(${k.join(",")}) values (${k.map((_, i) => `$${i + 1}`).join(",")}) returning id`, Object.values(c))).ok;
    },
    cerrarEntrega: async (id, cambios) => {
      escrituras.push("cerrarEntrega");
      const k = Object.keys(cambios);
      const r = await escribir(`update api_webhook_deliveries set ${k.map((c, i) => `${c} = $${i + 1}`).join(", ")} where id = $${k.length + 1} and tenant_id = $${k.length + 2} and state = 'pending' returning id`, [...Object.values(cambios), id, T]);
      if (!r.ok) mal.push(`la base rechazó el cierre de la entrega (${r.codigo})`);
      return r.ok;
    },
  });
  let n = 0;
  const ctx = (extra: Partial<Contexto> = {}): Contexto => ({
    datos: datosDe(T1), callerId: ALVARO, idioma: "es",
    entorno: (v) => (v === "WEBHOOK_SIGNING_KEK" ? "k".repeat(40) : undefined),
    resolver: () => Promise.resolve(["93.184.216.34"]),
    uuid: () => `eeeeeeee-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    enviar: () => Promise.resolve<Resultado>({ tipo: "respuesta", estado: 204, retryAfterS: null, latenciaMs: 12 }),
    ...extra,
  });
  /** Pasaron más de 12 s desde la última prueba. */
  const correrElReloj = (id: string) => db.exec(`update api_webhook_endpoints set last_test_at = now() - interval '1 minute' where id = '${id}'`);
  const estado = async (id: string) => (await uno(db, `select status from api_webhook_endpoints where id = '${id}'`))?.status;
  const test = (r: { cuerpo: Record<string, unknown> }) => r.cuerpo.test as Record<string, unknown> | undefined;

  const alta = await servirWebhook("webhook_create", { key_id: K_MSG, url: "https://Hooks.Integrador.com/maven?t=1" }, ctx());
  check(alta.estado === 201, `N: el alta del módulo la acepta la base (${alta.estado} ${JSON.stringify(alta.cuerpo).slice(0, 80)})`);
  const epId = (alta.cuerpo.webhook as { id: string }).id;
  const creado = await uno(db, `select status, url, url_host, created_by::text c, tenant_id::text t from api_webhook_endpoints where id = '${epId}'`);
  check(creado?.status === "pending" && creado?.url === "https://hooks.integrador.com/maven?t=1" && creado?.c === ALVARO && creado?.t === T1, "N: nace pending, con la URL normalizada, de la persona y la agencia");
  const ajena = await servirWebhook("webhook_create", { key_id: K_ANA, url: "https://x.integrador.com/" }, ctx());
  check(ajena.estado === 403, "N: la llave de otra persona: 403 (antes de llegar a la base)");
  const prueba = await servirWebhook("webhook_test", { id: epId }, ctx());
  check(prueba.estado === 200 && test(prueba)?.delivered === true && test(prueba)?.activated === true, `N: la prueba entregada ACTIVA en la base de verdad (${prueba.estado} ${JSON.stringify(test(prueba))})`);
  const activo = await uno(db, `select status, cursor_at is not null c, cursor_id::text i, last_test_at is not null p, last_status_code s from api_webhook_endpoints where id = '${epId}'`);
  check(activo?.status === "active" && activo?.c === true && activo?.i === "00000000-0000-0000-0000-000000000000" && activo?.p === true && activo?.s === 204, "N: activo, con el cursor desde ahora, el turno y la prueba anotados");
  const d = await uno(db, `select state, attempts, last_status_code, delivered_at is not null e from api_webhook_deliveries where endpoint_id = '${epId}'`);
  check(d?.state === "delivered" && d?.attempts === 1 && d?.last_status_code === 204 && d?.e === true, "N: la entrega de la prueba cumple el CHECK de 2xx con intento");

  // El turno: una prueba enseguida de otra no sale ni escribe nada.
  const antes = await uno(db, `select last_test_at::text t, (select count(*)::int from api_webhook_deliveries) n from api_webhook_endpoints where id = '${epId}'`);
  escrituras.length = 0;
  const seguida = await servirWebhook("webhook_test", { id: epId }, ctx());
  const despues = await uno(db, `select last_test_at::text t, (select count(*)::int from api_webhook_deliveries) n from api_webhook_endpoints where id = '${epId}'`);
  check(seguida.estado === 429 && despues?.t === antes?.t && despues?.n === antes?.n && escrituras.join() === "reservarPrueba", `N: la prueba seguida: 429, sin tocar la fila ni anotar entrega (${seguida.estado} ${escrituras.join()})`);

  // Una prueba sobre un activo no pisa lo del despachador.
  await db.exec(`update api_webhook_endpoints set last_status_code = 500, last_error = 'http_500', consecutive_failures = 2 where id = '${epId}'`);
  await correrElReloj(epId);
  const sobreActivo = await servirWebhook("webhook_test", { id: epId }, ctx({ enviar: () => Promise.resolve<Resultado>({ tipo: "respuesta", estado: 404, retryAfterS: null, latenciaMs: 3 }) }));
  const tras = await uno(db, `select status, last_status_code s, last_error e, consecutive_failures f from api_webhook_endpoints where id = '${epId}'`);
  check(sobreActivo.estado === 200 && test(sobreActivo)?.delivered === false && tras?.status === "active" && tras?.s === 500 && tras?.e === "http_500" && tras?.f === 2, "N: una prueba sobre un activo no pisa el detalle del despachador");

  const pausa = await servirWebhook("webhook_pause", { id: epId }, ctx({ callerId: ANA }));
  check(pausa.estado === 200 && (await uno(db, `select status, paused_by::text b from api_webhook_endpoints where id = '${epId}'`))?.b === ANA, "N: la pausa de otra admin la acepta la base");
  await correrElReloj(epId);
  const reanuda = await servirWebhook("webhook_resume", { id: epId }, ctx());
  const limpio = await uno(db, `select status, paused_by, last_error, last_status_code s, consecutive_failures f from api_webhook_endpoints where id = '${epId}'`);
  check(reanuda.estado === 200 && limpio?.status === "active" && limpio?.paused_by === null && limpio?.last_error === null && limpio?.s === 204 && limpio?.f === 0, `N: reanudar desde pausado pasa el trigger y arranca el detalle de cero (${reanuda.estado} ${JSON.stringify(limpio)})`);
  const yaActivo = await servirWebhook("webhook_resume", { id: epId }, ctx());
  check(yaActivo.estado === 409, "N: reanudar un activo: 409 'ya estaba activo'");
  // detenido por la base (revocar la llave), y reanudar: la edge frena antes de mandar
  await db.exec(`update api_keys set revoked_at = now() where id = '${K_MSG}'`);
  check((await uno(db, `select status || '/' || disabled_reason s from api_webhook_endpoints where id = '${epId}'`))?.s === "disabled/key_revoked", "N: revocar la llave lo detiene");
  await correrElReloj(epId);
  let mandadas = 0;
  const muerta = await servirWebhook("webhook_resume", { id: epId }, ctx({ enviar: () => (mandadas++, Promise.resolve<Resultado>({ tipo: "respuesta", estado: 204, retryAfterS: null, latenciaMs: 1 })) }));
  check(muerta.estado === 409 && mandadas === 0, `N: reanudar con la llave revocada: 409 sin mandar nada (${muerta.estado})`);
  await db.exec(`update api_keys set revoked_at = null where id = '${K_MSG}'`);
  const revive = await servirWebhook("webhook_resume", { id: epId }, ctx());
  check(revive.estado === 200 && (await estado(epId)) === "active", `N: reanudar desde detenido, con prueba, pasa el trigger (${revive.estado})`);
  const entregas = await servirWebhook("webhook_deliveries", { id: epId, limit: 10 }, ctx({ callerId: ANA }));
  const filas = entregas.cuerpo.deliveries as Record<string, unknown>[];
  check(entregas.estado === 200 && filas.length === 4 && filas.every((f) => !("body" in f) && !("tenant_id" in f)), `N: las entregas (4 pruebas) las ve otra admin, sin el cuerpo (${filas?.length})`);
  check((entregas.cuerpo.webhook as { status: string })?.status === "active", "N: las entregas traen el webhook al lado");
  const baja = await servirWebhook("webhook_delete", { id: epId }, ctx({ callerId: ANA }));
  check(baja.estado === 200 && (await uno(db, `select count(*)::int n from api_webhook_deliveries`))?.n === 0, "N: borrar se lleva el endpoint y sus entregas");

  // Dos agencias: la base detiene todo; la edge ni registra ni prueba, y desde la
  // otra agencia el endpoint no existe (ni se escribe nada).
  const otraAlta = await servirWebhook("webhook_create", { key_id: K_MSG, url: "https://hooks.integrador.com/otra" }, ctx());
  const ep2 = (otraAlta.cuerpo.webhook as { id: string } | undefined)?.id ?? "";
  check(otraAlta.estado === 201, `N: después de borrar, la llave puede registrar otro (${otraAlta.estado})`);
  await db.exec(`insert into tenants(id, slug, name) values ('${T2}', 'otra', 'Otra')`);
  check((await uno(db, `select status || '/' || disabled_reason s from api_webhook_endpoints where id = '${ep2}'`))?.s === "disabled/multi_agency", "N: la segunda agencia lo detiene");
  escrituras.length = 0;
  const desdeT2 = [];
  for (const accion of ["webhook_pause", "webhook_delete", "webhook_deliveries", "webhook_test", "webhook_resume"]) {
    desdeT2.push((await servirWebhook(accion, { id: ep2 }, ctx({ datos: datosDe(T2) }))).estado);
  }
  check(desdeT2.every((e) => e === 404) && escrituras.length === 0, `N: desde la otra agencia el endpoint no existe y no se escribe nada (${desdeT2.join(",")} / ${escrituras.join()})`);
  check((await uno(db, `select count(*)::int n from api_webhook_endpoints where id = '${ep2}'`))?.n === 1, "N: sigue ahí");
  await correrElReloj(ep2);
  const conDos = await servirWebhook("webhook_resume", { id: ep2 }, ctx());
  const altaConDos = await servirWebhook("webhook_create", { key_id: K_MSG, url: "https://hooks.integrador.com/tercera" }, ctx());
  check(conDos.estado === 409 && altaConDos.estado === 409 && escrituras.length === 0, `N: con dos agencias ni reanuda ni registra, sin escribir (${conDos.estado} ${altaConDos.estado})`);
  await db.exec(`delete from tenants where id = '${T2}'`);

  // Carrera con un trigger de verdad: mientras sale una prueba que FALLA sobre un
  // pending, revocan la llave y la base lo detiene. La anotación va solo sobre
  // pending (no le escribe el 401 al detenido) y la respuesta cuenta el detenido.
  await servirWebhook("webhook_delete", { id: ep2 }, ctx({ callerId: ANA }));
  const alta3 = await servirWebhook("webhook_create", { key_id: K_MSG, url: "https://hooks.integrador.com/cuarta" }, ctx());
  const ep3 = (alta3.cuerpo.webhook as { id: string } | undefined)?.id ?? "";
  const enCarrera = await servirWebhook("webhook_test", { id: ep3 }, ctx({
    enviar: async () => {
      await db.exec(`update api_keys set revoked_at = now() where id = '${K_MSG}'`);
      return { tipo: "respuesta", estado: 401, retryAfterS: null, latenciaMs: 4 };
    },
  }));
  const quedo = await uno(db, `select status || '/' || disabled_reason s, last_status_code c, last_error e, last_attempt_at a from api_webhook_endpoints where id = '${ep3}'`);
  check(alta3.estado === 201 && enCarrera.estado === 200 && quedo?.s === "disabled/key_revoked" && quedo?.c === null && quedo?.e === null && quedo?.a === null, `N: la prueba que falla no anota sobre lo que la base detuvo mientras salía (${enCarrera.estado} ${JSON.stringify(quedo)})`);
  const w3 = enCarrera.cuerpo.webhook as { status?: string; disabled_reason?: string } | null;
  check(w3?.status === "disabled" && w3?.disabled_reason === "key_revoked", `N: y la respuesta cuenta el detenido, no el pending de antes de mandar (${JSON.stringify(w3 && { s: w3.status, r: w3.disabled_reason })})`);
  await db.exec(`update api_keys set revoked_at = null where id = '${K_MSG}'`);

  // Y reanudar con la llave revocada mientras sale una prueba que SÍ llega: la base
  // no deja activar (P0001) y el aviso dice por qué (la llave), no "probá de nuevo".
  await correrElReloj(ep3);
  const enCarrera2 = await servirWebhook("webhook_resume", { id: ep3 }, ctx({
    enviar: async () => {
      await db.exec(`update api_keys set revoked_at = now() where id = '${K_MSG}'`);
      return { tipo: "respuesta", estado: 204, retryAfterS: null, latenciaMs: 4 };
    },
  }));
  const t2 = enCarrera2.cuerpo.test as { activated?: boolean; notice?: string } | undefined;
  check(enCarrera2.estado === 200 && t2?.activated === false && t2?.notice === "La key está revocada o vencida", `N: reanudar con la llave revocada en el medio: no activa y dice que es la llave (${enCarrera2.estado} ${JSON.stringify(t2)})`);
  await db.exec(`update api_keys set revoked_at = null where id = '${K_MSG}'`);
}


// ════ O. el despachador (PR 4, messenger-webhooks) contra la base de verdad ════
// Con la migración 20260926160000 (api_webhooks_timbrar y el gate con el respaldo de
// dos agencias) y un DatosDespacho en SQL que devuelve las filas con to_jsonb, o sea
// con los instantes como los da PostgREST. El reclamo se devuelve con microsegundos a
// propósito (PGlite solo tiene milisegundos): una guarda que los recortara falla acá.
{
  const db = await nueva();
  const KEK_O = "k".repeat(40);
  const ENTORNO_O = (v: string) => (v === "WEBHOOK_SIGNING_KEK" ? KEK_O : undefined);
  const EP_O = "40000000-0000-0000-0000-0000000000aa";
  const MAXI = "ffffffff-ffff-ffff-ffff-ffffffffffff";
  const js = async (sql: string, p: unknown[] = []) => ((await db.query(`select to_jsonb(x) j from (${sql}) x`, p)).rows as { j: Record<string, unknown> }[]).map((r) => r.j);
  const escribir = async (sql: string, p: unknown[]): Promise<boolean | null> => {
    try { return (await db.query(sql, p)).rows.length > 0; } catch { return null; }
  };
  const sets = (cambios: Record<string, unknown>, desde: number) => Object.keys(cambios).map((c, i) => `${c} = $${desde + i}`).join(", ");
  const datos: DatosDespacho = {
    agencias: async () => Number((await uno(db, "select count(*)::int n from tenants")).n),
    detenerPorAgencias: async () => (await escribir(`update api_webhook_endpoints set status = 'disabled', disabled_reason = 'multi_agency', disabled_at = now(), paused_at = null, paused_by = null where status <> 'disabled' returning id`, [])) !== null,
    reclamar: async (max, s) => {
      const filas = await js(`select * from api_webhooks_reclamar($1, $2)`, [max, s]);
      // Microsegundos en el reclamo, como en prod.
      for (const f of filas) await db.query(`update api_webhook_endpoints set lease_until = lease_until + interval '0.000123 seconds' where id = $1`, [f.id]);
      const ids = filas.map((f) => f.id as string);
      return ids.length ? (await js(`select * from api_webhook_endpoints where id = any($1)`, [ids])) as unknown as EndpointDespacho[] : [];
    },
    llave: async (id, t) => ({ ok: true, valor: ((await js(`select id, tenant_id, key_prefix, scopes, expires_at, revoked_at, acts_as_user_id, ip_whitelist from api_keys where id = $1 and tenant_id = $2`, [id, t]))[0] ?? null) as never }),
    llaveVigente: async (id) => ({ ok: true, valor: (await uno(db, `select api_key_vigente('${id}') v`)).v === true }),
    timbrePendiente: async (e, t) => ({ ok: true, valor: ((await js(`select id, body, attempts, uncertain from api_webhook_deliveries where endpoint_id = $1 and tenant_id = $2 and state = 'pending' and event_type = 'messages.created'`, [e, t]))[0] ?? null) as never }),
    timbrar: async (g: Guarda, n, t, limpiar) => {
      try {
        const r = await db.query(`select api_webhooks_timbrar($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) r`, [g.id, g.tenantId, g.reclamo, g.cursorAt, g.cursorId, n.t, n.i, t.id, t.body, t.cantidad, limpiar]);
        return (r.rows[0] as { r: string }).r === "ok" ? "ok" : "perdio";
      } catch (e) {
        return (e as { code?: string }).code === "23505" ? "ya_hay_uno" : "error";
      }
    },
    actualizarEndpoint: (g, cambios) => {
      const k = Object.keys(cambios).length;
      return escribir(
        `update api_webhook_endpoints set ${sets(cambios, 1)} where id = $${k + 1} and tenant_id = $${k + 2} and lease_until = $${k + 3} and status = 'active' and cursor_at = $${k + 4} and cursor_id = $${k + 5} returning id`,
        [...Object.values(cambios), g.id, g.tenantId, g.reclamo, g.cursorAt, g.cursorId],
      );
    },
    anotarTimbre: (id, t, cambios) => {
      const k = Object.keys(cambios).length;
      return escribir(`update api_webhook_deliveries set ${sets(cambios, 1)} where id = $${k + 1} and tenant_id = $${k + 2} and state = 'pending' returning id`, [...Object.values(cambios), id, t]);
    },
    soltar: async (id, t, reclamo) => void (await db.query(`update api_webhook_endpoints set lease_until = null where id = $1 and tenant_id = $2 and lease_until = $3`, [id, t, reclamo])),
  };
  const ahoraDb = async () => (await uno(db, `select to_jsonb(now() - interval '10 seconds') t`)).t as string;
  let nUuid = 0;
  const correrO = async (paginas: (n: number) => Promise<PaginaDelFeed> | PaginaDelFeed, respuesta: Resultado | (() => Promise<Resultado>)) => {
    const envios: string[] = [];
    let n = 0;
    const inf = await despachar({
      datos,
      leerFeed: async () => await paginas(n++),
      sesionConfigurada: () => true,
      entorno: ENTORNO_O,
      uuid: () => `70000000-0000-4000-8000-${String(++nUuid).padStart(12, "0")}`,
      azar: () => 0.5,
      log: () => {},
      enviar: async (e) => (envios.push(e.cuerpo), typeof respuesta === "function" ? await respuesta() : respuesta),
    });
    return { inf, envios };
  };
  const R204: Resultado = { tipo: "respuesta", estado: 204, retryAfterS: null, latenciaMs: 5 };
  const R503: Resultado = { tipo: "respuesta", estado: 503, retryAfterS: null, latenciaMs: 5 };
  const conMensajes = async () => ({ ok: true as const, cantidad: 2, conversaciones: [C1], siguiente: codificarCursor({ t: await ahoraDb(), i: MAXI }), hayMas: false });
  const epO = async () => await uno(db, `select status, disabled_reason r, consecutive_failures f, lease_until is null suelto, next_attempt_at <= now() ya, cursor_id::text ci, last_error e from api_webhook_endpoints where id = '${EP_O}'`);
  const timbresO = async () => await q(db, `select id::text, state, drop_reason d, attempts a, last_status_code c from api_webhook_deliveries where endpoint_id = '${EP_O}' and event_type = 'messages.created' order by created_at, id`);
  // Un mensaje nuevo para la persona y el cursor un rato atrás (con µs): el gate da true.
  const hayAlgo = async (hace = "20 minutes") => {
    await retroceder(db, `update api_webhook_endpoints set cursor_at = now() - interval '1 hour' - interval '0.000456 seconds', next_attempt_at = now() - interval '1 second' where id = '${EP_O}'`);
    await msg(db, C1, BETO, hace);
  };

  // El endpoint, con el secreto sellado de verdad, activo como lo deja la prueba.
  const sellado = (await sellarSecreto("whsec_" + btoa("s".repeat(33)), EP_O, ENTORNO_O))!;
  await db.exec(alta({ id: `'${EP_O}'`, secret_cipher: `'${sellado.cipher}'`, secret_nonce: `'${sellado.nonce}'` }));
  await activar(db, EP_O);

  // 1. timbre nuevo, entregado
  await hayAlgo();
  check(await hay(db), "O: con un mensaje nuevo, el gate da true");
  const r1 = await correrO(() => conMensajes(), R204);
  const t1 = await timbresO();
  const e1 = await epO();
  check((r1.inf.cuerpo.resultados ?? [])[0]?.accion === "entregado" && r1.envios.length === 1, `O: el despachador lo entrega (${JSON.stringify(r1.inf.cuerpo.resultados)})`);
  check(t1.length === 1 && t1[0].state === "delivered" && t1[0].a === 1 && t1[0].c === 204, `O: el timbre pasa los CHECKs y queda entregado (${JSON.stringify(t1)})`);
  check(e1.status === "active" && e1.f === 0 && e1.suelto === true && e1.ci === MAXI, `O: el endpoint con el cursor nuevo, sin racha y suelto (${JSON.stringify(e1)})`);
  check(!(await hay(db)), "O: y el gate vuelve a false (nada después del cursor)");

  // 2. un 503: queda pendiente con espera; el reintento (mismo timbre) se entrega
  await hayAlgo("15 minutes");
  const r2 = await correrO(() => conMensajes(), R503);
  const t2 = (await timbresO()).filter((t) => t.state === "pending");
  const e2 = await epO();
  check((r2.inf.cuerpo.resultados ?? [])[0]?.accion === "reintentar" && t2.length === 1 && t2[0].a === 1 && e2.f === 1 && e2.ya === false, `O: 503 → pendiente, 1 fallo y espera (${JSON.stringify([t2, e2])})`);
  check(!(await hay(db)), "O: durante la espera el gate da false");
  await db.exec(`update api_webhook_endpoints set next_attempt_at = now() - interval '1 second' where id = '${EP_O}'`);
  const r2b = await correrO(() => conMensajes(), R204);
  const t2b = (await timbresO()).find((t) => t.id === t2[0].id);
  check((r2b.inf.cuerpo.resultados ?? [])[0]?.accion === "entregado" && t2b?.state === "delivered" && t2b?.a === 2 && r2b.envios[0] === r2.envios[0], `O: el reintento manda los MISMOS bytes y se entrega (${JSON.stringify(t2b)})`);
  check((await epO()).f === 0, "O: la racha vuelve a cero");

  // 3. la pausa llega durante el envío: el trigger descarta el timbre y el despachador no anota nada más
  await hayAlgo("14 minutes");
  const r3 = await correrO(() => conMensajes(), async () => {
    await db.exec(`update api_webhook_endpoints set status = 'paused', paused_at = now(), paused_by = '${ANA}' where id = '${EP_O}'`);
    return R204;
  });
  const t3 = (await timbresO()).at(-1);
  const e3 = await epO();
  check((r3.inf.cuerpo.resultados ?? [])[0]?.accion === "perdio" && t3?.state === "dropped" && t3?.d === "endpoint_paused" && e3.status === "paused" && e3.suelto === true, `O: pausa en el medio → carrera perdida, timbre descartado, suelto (${JSON.stringify([t3, e3])})`);

  // 4. Resume en el medio de la lectura (ABA): timbrar no pasa la guarda y no crea nada
  await activar(db, EP_O);
  await hayAlgo("13 minutes");
  const antes4 = (await timbresO()).length;
  const r4 = await correrO(async () => {
    // Otra admin pausa y la persona reanuda (con prueba): el cursor arranca de nuevo.
    await db.exec(`update api_webhook_endpoints set status = 'paused', paused_at = now() where id = '${EP_O}'`);
    await activar(db, EP_O);
    return await conMensajes();
  }, R204);
  check((r4.inf.cuerpo.resultados ?? [])[0]?.accion === "perdio" && (await timbresO()).length === antes4 && r4.envios.length === 0, `O: Resume en el medio → no se crea ni se manda nada (${JSON.stringify(r4.inf.cuerpo.resultados)})`);

  // 5. 410: timbre descartado (receiver_gone) y endpoint detenido
  await hayAlgo("12 minutes");
  await correrO(() => conMensajes(), { tipo: "respuesta", estado: 410, retryAfterS: null, latenciaMs: 5 });
  const t5 = (await timbresO()).at(-1);
  const e5 = await epO();
  check(t5?.state === "dropped" && t5?.d === "receiver_gone" && e5.status === "disabled" && e5.r === "receiver_gone" && e5.suelto === true, `O: 410 → receiver_gone en los dos (${JSON.stringify([t5, e5])})`);

  // 6. 72 h fallando: el intento y el descarte juntos, y detenido por receiver_failing
  await activar(db, EP_O);
  await hayAlgo("11 minutes");
  await correrO(() => conMensajes(), R503);
  await db.exec(`update api_webhook_endpoints set failing_since = now() - interval '73 hours', consecutive_failures = 15, next_attempt_at = now() - interval '1 second' where id = '${EP_O}'`);
  await correrO(() => conMensajes(), R503);
  const t6 = (await timbresO()).at(-1);
  const e6 = await epO();
  check(t6?.state === "dropped" && t6?.d === "receiver_failing" && t6?.a === 2 && e6.status === "disabled" && e6.r === "receiver_failing", `O: 72 h → receiver_failing en los dos (${JSON.stringify([t6, e6])})`);

  // 7. llave revocada con el trigger caído: el despachador la detiene él mismo
  await activar(db, EP_O);
  await hayAlgo("10 minutes");
  await db.exec(`alter table api_keys disable trigger api_webhooks_por_llave; update api_keys set revoked_at = now() where id = '${K_MSG}'; alter table api_keys enable trigger api_webhooks_por_llave;`);
  check((await epO()).status === "active", "O: (con el trigger apagado, la revocación no lo detuvo)");
  const r7 = await correrO(() => conMensajes(), R204);
  const e7 = await epO();
  check(e7.status === "disabled" && e7.r === "key_revoked" && r7.envios.length === 0, `O: el despachador ve la llave revocada y lo detiene sin mandar (${JSON.stringify(e7)})`);
  await db.exec(`update api_keys set revoked_at = null where id = '${K_MSG}'`);

  // 8. timbrar directo: con un timbre ya pendiente da 23505 y NO mueve el cursor
  await activar(db, EP_O);
  await db.exec(`insert into api_webhook_deliveries(endpoint_id, event_type, body, message_count) values ('${EP_O}', 'messages.created', '{}', 1)`);
  const [fila8] = await js(`select * from api_webhooks_reclamar(1, 60)`);
  if (fila8) {
    const g8: Guarda = { id: EP_O, tenantId: T1, reclamo: fila8.lease_until as string, cursorAt: fila8.cursor_at as string, cursorId: fila8.cursor_id as string };
    const r8 = await datos.timbrar(g8, { t: await ahoraDb(), i: MAXI }, { id: "70000000-0000-4000-8000-0000000000f8", body: "{}", cantidad: 1 }, false);
    const c8 = await uno(db, `select to_jsonb(cursor_at) c from api_webhook_endpoints where id = '${EP_O}'`);
    check(r8 === "ya_hay_uno" && c8.c === fila8.cursor_at, `O: timbrar con uno pendiente → 23505 y el cursor sin mover (${r8})`);
    const r8b = await datos.timbrar({ ...g8, cursorId: MAXI }, { t: await ahoraDb(), i: MAXI }, { id: "70000000-0000-4000-8000-0000000000f9", body: "{}", cantidad: 1 }, false);
    check(r8b === "perdio", `O: timbrar con la guarda vieja → perdio, sin crear nada (${r8b})`);
  } else {
    check(false, "O: no se pudo reclamar para probar timbrar");
  }
  await db.exec(`update api_webhook_deliveries set state = 'dropped', drop_reason = 'endpoint_paused' where endpoint_id = '${EP_O}' and state = 'pending'`);

  // 9. dos agencias con el trigger caído: el gate despierta igual y el despachador detiene todo
  await db.exec(`update api_webhook_endpoints set lease_until = null where id = '${EP_O}'`);
  await db.exec(`alter table tenants disable trigger api_webhooks_por_agencias; insert into tenants(id, slug, name) values ('${T2}', 'otra', 'Otra'); alter table tenants enable trigger api_webhooks_por_agencias;`);
  check((await epO()).status === "active" && await hay(db), "O: con dos agencias y un endpoint sin detener, el gate da true (el respaldo)");
  const r9 = await correrO(() => conMensajes(), R204);
  check(r9.inf.cuerpo.motivo === "varias_agencias" && (await epO()).r === "multi_agency" && r9.envios.length === 0, `O: el despachador detiene todo con multi_agency (${JSON.stringify(r9.inf.cuerpo)})`);
  check(!(await hay(db)), "O: y el gate vuelve a false");
  await db.exec(`delete from tenants where id = '${T2}'`);
}

console.log(ok.map((m) => "✓ " + m).join("\n"));
if (mal.length) { console.log(mal.map((m) => "✗ " + m).join("\n")); console.log(`\n${ok.length} ok, ${mal.length} MAL`); Deno.exit(1); }
console.log(`\n${ok.length} ok`);
