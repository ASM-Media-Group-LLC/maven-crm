// El embudo de Argos prendido (migración 20261119083000_argos_embudo_prendido),
// probado contra un Postgres de verdad (PGlite).
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/argos_embudo.ts
//
//   1. La migración carga (y vuelve a cargar: es idempotente) encima de la de
//      los filtros en sombra.
//   2. argos_embudo_filtros: igual (≤ 24 bits del anterior que miró una IA),
//      lista (solo aprobadas, no contenedores), contenedor (Blu App / Maven
//      sola / escritorio remoto, aunque la pantalla sea igual), nunca se
//      encadena una copia con otra, y con el interruptor apagado no decide nada.
//   3. Lo que cuesta cada foto, lo gastado hoy con el tope, y el saldo de Gemini
//      que solo cobra las miradas de verdad.
//
// Sale con código 1 si algo falla.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const SOMBRA = leer("../migrations/20261118010000_argos_filtros_sombra.sql");
const M = leer("../migrations/20261119083000_argos_embudo_prendido.sql");

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);

const ANA = "a0000000-0000-4000-8000-000000000001";

// Lo mínimo de prod que tocan estas funciones (no hay fixture de Argos).
const PREVIO = `
create role anon; create role authenticated;
create table public.monitor_capturas (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, tipo text not null default 'pantalla',
  path text, nas_path text, en_nas boolean not null default false, created_at timestamptz not null default now(),
  veredicto text, fuera_de_lugar boolean, analizado boolean not null default false, perdonado boolean not null default false);
create table public.monitor_config (id smallint primary key default 1, activo boolean not null default true);
insert into public.monitor_config (id) values (1);
create table public.argos_uso_apps (id bigint generated always as identity primary key, user_id uuid not null,
  app text not null, titulo text not null default '', url text, desde timestamptz not null, hasta timestamptz not null);
create table public.costos_servicios (id text primary key, precio_unitario_usd numeric, unidad text, como_se_calcula text);
insert into public.costos_servicios values ('google_ia', 0.0022, 'foto_juzgada', '');
create table public.costos_saldo (id bigint generated always as identity primary key, servicio_id text,
  saldo_usd numeric, medido_at timestamptz, origen text);
create table public.argos_diag (id bigint generated always as identity primary key, ronda text, paso text,
  detalle jsonb, at timestamptz not null default now());
create table public.argos_clips (id bigint generated always as identity primary key, created_at timestamptz, duracion_seg int);
create or replace function public.es_dueno(_user_id uuid) returns boolean language sql as 'select true';
`;

const db = new PGlite();
const q = async (sql: string, p: unknown[] = []) => (await db.query<Fila>(sql, p)).rows;

await db.exec(PREVIO);
await db.exec(SOMBRA);
try {
  await db.exec(M);
  await db.exec(M);
  check(true, "la migración carga dos veces");
} catch (e) {
  check(false, `la migración no carga: ${msg(e)}`);
}

// Lista aprobada como en prod (los contenedores los marca la migración).
await db.exec(`
insert into public.argos_apps_trabajo (campo, patron, nota, aprobado) values
  ('app', 'Blu App', 'App de Blu', true), ('app', 'Maven', 'App de Maven', true),
  ('titulo', '%BLU%', 'BLU OF Manager', true), ('titulo', '%Maven%', 'Pestaña de Maven', true),
  ('titulo', '%OnlyFans%', 'Pestaña de OnlyFans', true), ('titulo', '%YouTube%', 'sin aprobar', false);
update public.argos_apps_trabajo set contenedor = true
 where (campo = 'app' and patron in ('Blu App', 'Maven')) or (campo = 'titulo' and patron in ('%BLU%', '%Maven%'));
`);

const H0 = "0".repeat(64);
const H_CERCA = "f" + "0".repeat(63); // 4 bits distintos de H0
const H_LEJOS = "f".repeat(64); // 256 bits distintos

/** Inserta una captura `min` minutos atrás y devuelve su id. */
const foto = async (min: number, huella: string | null, veredicto: string | null = null, extra: Fila = {}) => {
  const [r] = await q(
    `insert into public.monitor_capturas (user_id, created_at, huella, veredicto, fuera_de_lugar, juzgada_por)
     values ($1, now() - make_interval(secs => $2::double precision * 60), $3, $4, $5, $6) returning id`,
    [ANA, min, huella, veredicto, extra.fuera ?? (veredicto ? false : null), extra.juzgada_por ?? null],
  );
  return r.id as string;
};
const app = async (min: number, a: string, titulo = "", url: string | null = null) => {
  await q(
    `insert into public.argos_uso_apps (user_id, app, titulo, url, desde, hasta)
     values ($1, $2, $3, $4, now() - make_interval(secs => ($5::double precision * 60) + 20), now() - make_interval(secs => ($5::double precision * 60) - 20))`,
    [ANA, a, titulo, url, min],
  );
};
const filtros = async (ids: string[]) => {
  const rows = await q(`select * from public.argos_embudo_filtros($1::uuid[])`, [ids]);
  return new Map(rows.map((r) => [r.id as string, r]));
};

// ─── 2. Los filtros ──────────────────────────────────────────────────────────
// Ventana 1 (hace 100–90 min): igual al anterior que miró la IA.
await foto(100, H0, "CRM · chat", { juzgada_por: "argos" });
const igual = await foto(98, H_CERCA);
const distinta = await foto(97, H_LEJOS);
let f = await filtros([igual, distinta]);
check(f.get(igual)?.filtro === "igual" && f.get(igual)?.distancia === 4 && f.get(igual)?.prev_veredicto === "CRM · chat",
  `pantalla casi igual → igual con el veredicto anterior (${JSON.stringify(f.get(igual))})`);
check(f.get(distinta)?.filtro === null, "pantalla distinta y sin app → a la IA chica (null)");

// Una copia (filtro_igual) no sirve de anterior: no se encadena.
await foto(80, H0, "CRM · chat", { juzgada_por: "argos" });
await foto(75, H_CERCA, "CRM · chat", { juzgada_por: "filtro_igual" });
const tras_copia = await foto(73, H_CERCA);
f = await filtros([tras_copia]);
check(f.get(tras_copia)?.filtro === "igual" && f.get(tras_copia)?.distancia === 4,
  "el anterior es el último que miró una IA, no la copia");
await foto(60, H0, "CRM · chat", { juzgada_por: "filtro_igual" });
const solo_copias = await foto(58, H0);
f = await filtros([solo_copias]);
check(f.get(solo_copias)?.filtro === null, "si en 10 min solo hay copias, se vuelve a mirar");

// Ventana 2 (hace 40–30 min): lista y contenedores, con la pantalla distinta.
await foto(42, H0, "Maven · chat", { juzgada_por: "argos" });
await app(40, "Microsoft Edge", "Mensajes — OnlyFans y 1 página más");
const lista = await foto(40, H_LEJOS);
await app(37, "Desktop management app built by Exoplanet", "Blu App");
const blu = await foto(37, H0 + "");
await app(34, "Maven", "Maven");
const maven = await foto(34, H_LEJOS);
await app(31, "Brave Browser", "Rubius - YouTube");
const sin_aprobar = await foto(31, H0);
f = await filtros([lista, blu, maven, sin_aprobar]);
check(f.get(lista)?.filtro === "lista" && f.get(lista)?.lista_nota === "Pestaña de OnlyFans",
  `app de la lista → lista con su nota (${JSON.stringify(f.get(lista))})`);
check(f.get(blu)?.filtro === "contenedor", "Blu App (título fijo, YouTube adentro) → contenedor, no lista");
check(f.get(maven)?.filtro === "contenedor", "la ventana «Maven» sola → contenedor, no lista");
check(f.get(sin_aprobar)?.filtro === null, "patrón sin aprobar no cuenta");

// Ventana 3 (hace 20 min): escritorio remoto, aunque diga OnlyFans y la pantalla sea igual.
await foto(22, H0, "OnlyFans · chat", { juzgada_por: "argos" });
await app(20, "AnyDesk", "Mensajes — OnlyFans");
const remoto = await foto(20, H0);
await app(18, "Google Chrome", "Escritorio remoto de Chrome - Google Chrome", "https://remotedesktop.google.com/access");
const remoto2 = await foto(18, H_LEJOS);
f = await filtros([remoto, remoto2]);
check(f.get(remoto)?.filtro === "contenedor", "AnyDesk nunca se aprueba por el nombre ni por la copia");
check(f.get(remoto2)?.filtro === "contenedor", "Escritorio remoto de Chrome → contenedor");

// Interruptor apagado → no decide nada.
await db.exec(`update public.monitor_config set argos_filtros_activos = false where id = 1`);
f = await filtros([igual, lista, remoto]);
check([...f.values()].every((r) => r.filtro === null) && f.size === 3, "con el interruptor apagado, ningún filtro decide");
await db.exec(`update public.monitor_config set argos_filtros_activos = true where id = 1`);

// ─── 3. La plata ─────────────────────────────────────────────────────────────
const costo = async (jp: string | null, fd: string | null, v: string | null = "x") =>
  Number((await q(`select public.argos_costo_foto($1, $2, $3, 0.0022, 0.0003) as c`, [v, jp, fd]))[0].c);
check(await costo(null, null) === 0.0022, "foto vieja (sin juzgada_por) = 0,0022");
check(await costo("argos", "ia_chica_no") === 0.0025, "chica + detallada = 0,0025");
check(await costo("argos_azar", "igual") === 0.0022, "revisión al azar de una copia = 0,0022");
check(await costo("ia_chica", "ia_chica_si") === 0.0003, "solo la chica = 0,0003");
check(await costo("filtro_igual", "igual") === 0 && await costo("filtro_lista", "lista") === 0, "copia y lista = 0");
check(await costo("argos", "ia_chica_error") === 0.0022, "chica que falló no se cobra");
check(await costo("argos", null, null) === 0, "sin veredicto = 0");

const cfg = (await q(`select * from public.monitor_config where id = 1`))[0];
check(cfg.argos_filtros_activos === true && Number(cfg.argos_revision_azar) === 0.1 && Number(cfg.argos_tope_dia_usd) === 1.5 &&
  Number(cfg.argos_precio_chica_usd) === 0.0003 && cfg.argos_umbral_huella === 24,
  `config por defecto: prendido, 10 %, tope 1,50, chica 0,0003, umbral 24 (${JSON.stringify(cfg)})`);

// Gasto de hoy: borrón y cuenta nueva con fotos de hace 1 minuto.
await db.exec(`delete from public.monitor_capturas`);
await foto(1, null, "a", { juzgada_por: "argos" }); // 0.0022
await q(`update public.monitor_capturas set filtro_decia = 'ia_chica_no'`); // + 0.0003
await foto(1, null, "b", { juzgada_por: "ia_chica" });
await q(`update public.monitor_capturas set filtro_decia = 'ia_chica_si' where veredicto = 'b'`); // 0.0003
await foto(1, null, "c", { juzgada_por: "filtro_igual" }); // 0
await foto(1, null, "d", { juzgada_por: "filtro_lista" }); // 0
await foto(1, null, "e"); // vieja: 0.0022
await foto(1, null); // sin juzgar: 0
const g = (await q(`select public.argos_gasto_hoy() as g`))[0].g;
check(Math.abs(Number(g.usd) - 0.005) < 1e-9 && Number(g.tope) === 1.5 && Number(g.precio_chica) === 0.0003,
  `gasto de hoy = 0,0050 con tope 1,50 (${JSON.stringify(g)})`);

await q(`insert into public.costos_saldo (servicio_id, saldo_usd, medido_at, origen) values ('google_ia', 10, now() - interval '1 hour', 'manual')`);
const s = (await q(`select public.ia_saldo_calculo() as s`))[0].s;
check(Math.abs(Number(s.gastado_usd) - 0.01) < 1e-9 || Math.abs(Number(s.gastado_usd) - 0) < 1e-9,
  `saldo: gastado redondeado a centavos (${s.gastado_usd})`);
check(s.juzgadas_desde === 2 && s.chicas_desde === 2 && s.saltadas_desde === 2,
  `saldo: 2 detalladas, 2 chicas, 2 sin IA (${JSON.stringify({ j: s.juzgadas_desde, c: s.chicas_desde, sa: s.saltadas_desde })})`);
check(Number(s.saldo_usd) >= 9.99 && Number(s.precio_chica_usd) === 0.0003, `saldo: 10 − 0,005 ≈ 9,99 (${s.saldo_usd})`);

const inf = (await q(`select public.argos_informe_embudo(now() - interval '1 day', now() + interval '1 minute') as i`))[0].i;
check(inf.fotos === 5 && inf.por_parte.filtro_igual === 1 && Math.abs(Number(inf.usd) - 0.01) < 0.006,
  `informe del embudo (${JSON.stringify(inf)})`);

for (const m of ok) console.log(`  ✓ ${m}`);
for (const m of mal) console.log(`  ✗ ${m}`);
console.log(`\n${ok.length} bien, ${mal.length} mal`);
if (mal.length) Deno.exit(1);
