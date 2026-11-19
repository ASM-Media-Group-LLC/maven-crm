// BANCO del historial del Hub (Alvaro, 19/11/2026): carga las dos migraciones
// del Hub en PGlite con lo mínimo que usan alrededor y prueba que:
//   · la señal anota solo lo que CAMBIA (la repetida de cada 30 s no anota);
//   · la primera señal = «entró al Hub»; cerrar Maven = «salió» con causa;
//   · el vigía anota «salió» de quien se cortó sin señal (> 90 s), una sola vez;
//   · hub_historial solo para quien ve Argos (42501), y el supervisor solo ve lo suyo.
// Correr: npx deno run -A --node-modules-dir=none --no-lock supabase/tests/hub_historial.ts
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
let fallas = 0;
function check(ok: boolean, msg: string) {
  console.log(`${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) fallas++;
}

const T1 = "10000000-0000-4000-8000-000000000001";
const DUENO = "a0000000-0000-4000-8000-000000000001";
const VANE = "a0000000-0000-4000-8000-000000000002";
const BREY = "a0000000-0000-4000-8000-000000000003";
const SES = "c0000000-0000-4000-8000-000000000001";

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid $$;
  create schema cron;
  create table cron.job (jobname text);
  create function cron.schedule(a text, b text, c text) returns bigint language sql as $$ select 1::bigint $$;
  create function cron.unschedule(a text) returns boolean language sql as $$ select true $$;
  create table public.profiles (id uuid primary key, full_name text, nivel text, deleted_at timestamptz);
  create table public.tenant_members (user_id uuid, tenant_id uuid);
  create table public.app_caidas (user_id uuid, creado timestamptz default now());
  create table public.llamada_cortes (user_id uuid, fase text, creado timestamptz default now());
  create table public.notifications (user_id uuid, type text, title text, message text, reference_id uuid,
    reference_type text, module_origin text, priority text, status text, visibility_scope text, deep_link_url text);
  create function public.current_tenant_id() returns uuid language sql stable as $$ select '${T1}'::uuid $$;
  create function public.es_admin_o_dueno(u uuid) returns boolean language sql stable as $$ select u = '${DUENO}'::uuid $$;
  create function public.es_rh(u uuid) returns boolean language sql stable as $$ select false $$;
  create function public.ve_argos() returns boolean language sql stable as $$
    select (select auth.uid()) in ('${DUENO}'::uuid, '${VANE}'::uuid) $$;
  set check_function_bodies = off;
`);
await db.exec(leer("../migrations/20261119012000_hub_supervisores_senal_y_avisos.sql"));
await db.exec(leer("../migrations/20261119014500_hub_historial_supervisores.sql"));
// Lo que pasa «ahora» no importa aquí: el vigía solo debe anotar la salida.
await db.exec(`
  create or replace function public.hub_problemas_ahora(_ahora timestamptz default now())
  returns table (user_id uuid, tenant_id uuid, problema text, causa text, desde timestamptz)
  language sql stable as $$ select null::uuid, null::uuid, null::text, null::text, null::timestamptz where false $$;
`);
for (const [id, n, nivel] of [[DUENO, "Alvaro", "dueno"], [VANE, "Vanessa", "supervisor"], [BREY, "Breyner", "supervisor"]]) {
  await db.query(`insert into auth.users values ($1)`, [id]);
  await db.query(`insert into public.profiles values ($1, $2, $3, null)`, [id, n, nivel]);
  await db.query(`insert into public.tenant_members values ($1, $2)`, [id, T1]);
}

async function como(uid: string | null) {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [uid ? JSON.stringify({ sub: uid }) : ""]);
}
async function senal(uid: string, o: { enHub?: boolean; cam?: boolean; pant?: string; con?: string; pausa?: boolean; salida?: string | null }) {
  await como(uid);
  await db.query(`select public.hub_reportar_senal($1, $2, $3, $4, $5, $6, $7)`,
    [SES, o.enHub ?? true, o.cam ?? true, o.pant ?? "compartiendo", o.con ?? "conectada", o.pausa ?? false, o.salida ?? null]);
}
async function eventos(uid: string) {
  const r = await db.query<{ tipo: string; valor: string; causa: string | null }>(
    `select tipo, valor, causa from public.hub_eventos where user_id = $1 order by creado, id`, [uid]);
  return r.rows.map((e) => `${e.tipo}:${e.valor}${e.causa ? `:${e.causa}` : ""}`);
}

// 1) Entra con todo bien: un solo movimiento, «entró».
await senal(VANE, {});
check(JSON.stringify(await eventos(VANE)) === JSON.stringify(["hub:entro"]), "la primera señal anota «entró al Hub» y nada más");
// 2) La misma señal 3 veces: no anota nada.
await senal(VANE, {}); await senal(VANE, {}); await senal(VANE, {});
check((await eventos(VANE)).length === 1, "la señal repetida no anota");
// 3) Quita la pantalla, apaga la cámara, vuelve a compartir.
await senal(VANE, { pant: "apagada" });
await senal(VANE, { pant: "apagada" });
await senal(VANE, { pant: "apagada", cam: false });
await senal(VANE, { pant: "compartiendo", cam: false });
check(JSON.stringify(await eventos(VANE)) === JSON.stringify([
  "hub:entro", "pantalla:sin_pantalla:apagada", "camara:apagada:apagada", "pantalla:compartiendo",
]), "anota pantalla quitada (por él), cámara apagada y pantalla de vuelta, cada una una vez");
// 4) La pantalla llega en negro: causa = negra.
await senal(VANE, { pant: "negra", cam: false });
check((await eventos(VANE)).at(-1) === "pantalla:sin_pantalla:negra", "pantalla en negro queda con su causa");
// 5) Cierra Maven: «salió» con causa salio.
await senal(VANE, { enHub: false, pant: "negra", cam: false, salida: "cerro" });
check((await eventos(VANE)).at(-1) === "hub:salio:salio", "cerrar Maven = salió (a propósito)");

// 6) Breyner entra y se corta sin aviso: el vigía anota la salida una vez.
await senal(BREY, { cam: false });
check(JSON.stringify(await eventos(BREY)) === JSON.stringify(["hub:entro", "camara:apagada:apagada"]), "entrar con la cámara apagada se anota");
await como(null);
await db.exec(`update public.hub_senal set actualizado = now() - interval '3 minutes' where user_id = '${BREY}'`);
await db.query(`select public.vigilar_supervisores_hub()`);
await db.query(`select public.vigilar_supervisores_hub()`);
let b = await eventos(BREY);
check(b.filter((e) => e.startsWith("hub:salio")).length === 1 && b.at(-1) === "hub:salio:sin_senal", "el vigía anota «se cortó sin aviso» una sola vez");
// Con la app caída anotada, la causa es la app.
await senal(BREY, { cam: false });
check((await eventos(BREY)).at(-1) === "hub:entro", "al volver, entra de nuevo");
await db.exec(`update public.hub_senal set actualizado = now() - interval '3 minutes' where user_id = '${BREY}'`);
await db.query(`insert into public.app_caidas (user_id) values ($1)`, [BREY]);
// Vuelve antes de que pase el vigía: la salida se anota igual, antes de la entrada.
await senal(BREY, { cam: false });
b = await eventos(BREY);
check(JSON.stringify(b.slice(-2)) === JSON.stringify(["hub:salio:app_caida", "hub:entro"]), "si vuelve antes del vigía, la salida (app caída) queda antes de la entrada");
// Internet caído con la app viva = salió por conexión.
await senal(BREY, { cam: false, con: "desconectada" });
check((await eventos(BREY)).at(-1) === "hub:salio:conexion", "llamada caída = salió por el internet");

// 7) hub_historial: permisos y contenido.
await como(BREY);
let negado = false;
try { await db.query(`select public.hub_historial()`); } catch (e) { negado = String((e as { code?: string }).code ?? e).includes("42501"); }
check(negado, "sin ve_argos lanza 42501");
await como(DUENO);
const r = await db.query<{ h: { eventos: Array<{ nombre: string; tipo: string }>; resumen: Array<{ nombre: string; pantalla_quitada: number; pantalla_falla: number; camara_apagada: number; salidas: number; salidas_propias: number; salidas_falla: number }> } }>(`select public.hub_historial() as h`);
const h = r.rows[0].h;
const vane = h.resumen.find((x) => x.nombre === "Vanessa")!;
const brey = h.resumen.find((x) => x.nombre === "Breyner")!;
check(vane.pantalla_quitada === 1 && vane.pantalla_falla === 1 && vane.camara_apagada === 1 && vane.salidas_propias === 1, "resumen de Vanessa: 1 quitada por ella, 1 por falla, 1 cámara, 1 salida propia");
check(brey.salidas === 3 && brey.salidas_falla === 2, "resumen de Breyner: 3 salidas, 2 por falla (app, internet)");
check(h.eventos.length > 0 && h.eventos.every((e) => typeof e.nombre === "string"), "los movimientos vienen con el nombre");
await como(VANE);
const s = await db.query<{ h: { eventos: Array<{ nombre: string }>; resumen: Array<{ nombre: string }> } }>(`select public.hub_historial(null, $1) as h`, [BREY]);
check(s.rows[0].h.resumen.length === 1 && s.rows[0].h.resumen[0].nombre === "Vanessa" && s.rows[0].h.eventos.every((e) => e.nombre === "Vanessa"),
  "un supervisor solo ve lo suyo aunque pida a otro");
const ayer = await db.query<{ h: { eventos: unknown[] } }>(`select public.hub_historial(((now() at time zone 'America/Bogota')::date - 1)) as h`);
check(ayer.rows[0].h.eventos.length === 0, "otro día: sin movimientos");

if (fallas) { console.log(`\n${fallas} falla(s)`); Deno.exit(1); }
console.log("\nhub_historial: todo bien");
