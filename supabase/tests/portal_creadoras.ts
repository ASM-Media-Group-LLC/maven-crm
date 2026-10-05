// Portal de creadoras, fase 1 (migración 20261006100000_portal_creadoras_cuentas),
// probada contra un Postgres de verdad (PGlite) con el catálogo de PROD: los mismos
// fixtures que creadoras_por_agencia.ts + creator_history como está en prod + las
// migraciones de agencias, creadoras por agencia y cuentas externas (ya aplicadas).
//
//   deno run -A --node-modules-dir=none --no-lock supabase/tests/portal_creadoras.ts
//
//   1. La migración carga sobre prod, y no carga si falta una columna de la ficha.
//   2. creadora_cuentas: solo cuentas de creadora, la agencia sale de la ficha, una
//      cuenta por ficha y una ficha por agencia; la misma cuenta en dos agencias, sí.
//   3. Quién la ve: quien ve a la creadora y ella; el correo, solo enmascarado.
//      Nadie la escribe desde el navegador.
//   4. La creadora: sus agencias, su ficha (las 22 columnas y nada más), y guardar
//      solo esas columnas, solo texto. La tabla creators y v_creators le siguen cerradas.
//   5. El historial: cada una de las 22 columnas anota quién y qué cambió (portal o
//      ficha); sin sesión o en otra columna, no. Y se vuelve confiable: cada agencia
//      ve el suyo, y desde el navegador no se cambia ni se borra (en prod, sí).
//   6. portal_hola: primer y último acceso, como mucho cada 5 minutos.
//   7. La vuelta atrás (las líneas «--|») deja todo como estaba y se puede volver a aplicar.
//
// Sale con código 1 si algo falla. Corre en el guard de cada PR.
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const leer = (rel: string) => Deno.readTextFileSync(new URL(rel, import.meta.url));
const FX_ROLES = leer("./fixtures/prod_roles_20261001.sql");
const FX = leer("./fixtures/prod_creadoras_20261005.sql");
const ANTES = [
  "20261001210000_agencias_base.sql", "20261001211000_roles_por_agencia.sql", "20261001212000_personas_por_agencia.sql",
].map((n) => ({ n, sql: leer(`../migrations/${n}`) }));
const YA = ["20261005140000_creadoras_por_agencia.sql", "20261005140100_cuentas_externas_y_avisos.sql"]
  .map((n) => ({ n, sql: leer(`../migrations/${n}`) }));
const N = "20261006100000_portal_creadoras_cuentas.sql";
const M = leer(`../migrations/${N}`);
const vuelta = (sql: string) => sql.split("\n").filter((l) => l.startsWith("--|")).map((l) => l.replace(/^--\| ?/, "")).join("\n");

// creator_history tal como está en prod (05/10): nació fuera de las migraciones.
const HISTORIAL_PROD = `
create table public.creator_history (id uuid primary key default gen_random_uuid(), creator_id uuid not null, user_id uuid not null,
  action text not null, old_value text, new_value text, created_at timestamptz default now());
create index idx_creator_history_creator on public.creator_history (creator_id);
alter table public.creator_history enable row level security;
grant all on public.creator_history to anon, authenticated, service_role;
create policy creator_history_scope on public.creator_history for all to authenticated
  using (public.has_permission(auth.uid(), 'Creadores'::text, null::text))
  with check (public.has_permission(auth.uid(), 'Creadores'::text, null::text));
`;

const ok: string[] = [], mal: string[] = [];
const check = (c: boolean, m: string) => (c ? ok : mal).push(m);
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
const msg = (e: unknown) => String((e as Error)?.message ?? e);
const json = (x: unknown) => JSON.stringify(x);

// ─── Gente, agencias y creadoras del ensayo ──────────────────────────────────
const T1 = "10000000-0000-4000-8000-000000000001"; // asm-tech
const T2 = "10000000-0000-4000-8000-000000000002"; // otra agencia
const P = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [JHON, ANA, MARIO, CLARA, EMPL] = [1, 2, 3, 4, 5].map(P); // asm-tech
const OLGA = P(11); // admin de la otra agencia
const [SOFI, LUNA] = [31, 32].map(P); // cuentas de creadora: Sofi (C1 y D1), Luna (sin ficha)
const C = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [C1, C2, C3, D1] = [1, 2, 3, 11].map(C);

const CAMPOS = [
  "tono_voz", "tono_emocional", "como_quieres_que_te_llamen", "emoji_frecuente",
  "personalidad_marca", "terminos_afecto", "frases_venta", "apodos_permitidos",
  "palabras_prohibidas", "hobbies", "mascotas_nombres", "comida_favorita",
  "contenido_jamas_haria", "restricciones_seguridad",
  "respuesta_sexo_en_persona", "respuesta_usuario_grosero", "respuesta_pedir_desnudos",
  "respuesta_cuanto_cobra_encuentro", "respuesta_muestra_intimas",
  "estrategia_material_gratis", "estrategia_problemas_personales", "estrategia_rechazo",
];

const SEMILLA = `
insert into public.tenants(id, slug, name) values ('${T1}', 'asm-tech', 'ASM Tech');
insert into public.roles_config (name, is_system, level) values
  ('admin', true, 100), ('manager', true, 70), ('supervisor', true, 50), ('employee', true, 20), ('closer', true, 20),
  ('Chatter', false, 20), ('Chatter Supervisor', false, 55), ('Supervisor sin creadoras', false, 50);
update public.role_groups set is_admin = true, is_manager_or_above = true, is_supervisor_or_above = true where role_name = 'admin';
update public.role_groups set is_manager_or_above = true, is_supervisor_or_above = true where role_name = 'manager';
update public.role_groups set is_supervisor_or_above = true where role_name in ('supervisor', 'Chatter Supervisor', 'Supervisor sin creadoras');
insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
select rc.id, p.module, p.submodule, p.can_access, p.scope from public.roles_config rc join (values
  ('Chatter', 'Creadores', null, false, 'self'),
  ('manager', 'Creadores', null, true, 'all'),
  ('employee', 'Creadores', null, false, 'all'),
  ('closer', 'Closers', null, true, 'self')
) as p(rol, module, submodule, can_access, scope) on p.rol = rc.name;
insert into auth.users(id, email, raw_user_meta_data) values
  ('${JHON}', 'jhon.lopez@maven-ai.me', '{"full_name":"Jhon"}'), ('${ANA}', 'ana@x.test', '{"full_name":"Ana"}'),
  ('${MARIO}', 'mario@x.test', '{"full_name":"Mario"}'), ('${CLARA}', 'clara@x.test', '{"full_name":"Clara"}'),
  ('${EMPL}', 'empl@x.test', '{"full_name":"Empl"}');
update public.user_roles set role = 'admin' where user_id = '${JHON}';
update public.user_roles set role = 'Chatter' where user_id = '${ANA}';
update public.user_roles set role = 'manager' where user_id = '${MARIO}';
update public.user_roles set role = 'closer' where user_id = '${CLARA}';
`;
const DATOS = `
insert into public.creators (id, name, artistic_name, status, instagram_handle, email, assigned_manager_id, assigned_manager_profile_id, closer_responsible_id, created_by, tono_voz) values
  ('${C1}', 'Sofía', 'Sofi', 'active', 'sofi', 'sofi@x.test', '${MARIO}', '${MARIO}', null, '${JHON}', 'Picante'),
  ('${C2}', 'Dos', null, 'active', 'dos', null, null, null, null, '${JHON}', null),
  ('${C3}', 'Tres', null, 'active', 'tres', null, null, null, '${CLARA}', '${JHON}', null);
insert into public.chatter_identity (id, display_name, maven_user_id) values ('e0000000-0000-4000-8000-000000000001', 'Ana', '${ANA}');
insert into public.chatter_group_members (group_id, identity_id, shift) values ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'mañana');
insert into public.chatter_group_creators (group_id, creator_id, creator_handle) values ('f0000000-0000-4000-8000-000000000001', '${C1}', 'sofi');
`;
const OTRA = `
insert into public.tenants(id, slug, name) values ('${T2}', 'otra', 'Otra agencia');
select public.sembrar_roles_de_agencia('${T2}', 'agency', '${T1}');
insert into auth.users(id, email, raw_user_meta_data) values ('${OLGA}', 'olga@otra.test', '{"full_name":"Olga"}');
insert into public.tenant_members(user_id, tenant_id) values ('${OLGA}', '${T2}');
update public.user_roles set role = 'admin' where user_id = '${OLGA}';
`;
// Las cuentas de creadora como las da de alta la edge (auth.admin.createUser con
// app_metadata.tipo = 'creadora'): sin rol, fuera de tenant_members.
const CREADORAS = `
insert into auth.users(id, email, raw_user_meta_data, raw_app_meta_data) values
  ('${SOFI}', 'Sofi.Personal@Gmail.test', '{"full_name":"Sofi"}', '{"tipo":"creadora"}'),
  ('${LUNA}', 'luna@gmail.test', '{"full_name":"Luna"}', '{"tipo":"creadora"}');
`;

async function aplicar(db: PGlite, nombre: string, sql: string) {
  try { await db.exec("begin;\n" + sql + "\ncommit;"); }
  catch (e) { await db.exec("rollback").catch(() => {}); throw new Error(`${nombre} no carga: ${msg(e)}`); }
}
async function nueva(conMigracion: boolean, antes = ""): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(FX_ROLES);
  await db.exec(FX);
  await db.exec(HISTORIAL_PROD);
  await db.exec(SEMILLA);
  for (const m of ANTES) await aplicar(db, m.n, m.sql);
  await db.exec(DATOS);
  for (const m of YA) await aplicar(db, m.n, m.sql);
  await db.exec(OTRA);
  await db.exec(CREADORAS + antes);
  if (conMigracion) await aplicar(db, N, M);
  return db;
}
const q = async (db: PGlite, sql: string) => (await db.query(sql)).rows as Fila[];
const uno = async (db: PGlite, sql: string) => (await q(db, sql))[0];

type Quien = string | "service_role" | "anon" | "postgres";
async function entrar(db: PGlite, quien: Quien) {
  await db.exec("reset role");
  if (quien === "postgres") return;
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
// Lo corre y lo deshace siempre.
async function probar(db: PGlite, quien: Quien, sql: string): Promise<Fila[] | string> {
  await db.exec("begin");
  try { await entrar(db, quien); const rs = await db.exec(sql); return (rs.at(-1)?.rows ?? []) as Fila[]; }
  catch (e) { return msg(e); }
  finally { await db.exec("rollback"); }
}
const intento = async (f: () => Promise<unknown>) => { try { await f(); return "anduvo"; } catch (e) { return msg(e); } };
const filas = (r: Fila[] | string) => (Array.isArray(r) ? r : []);
const esError = (r: Fila[] | string, re: RegExp) => typeof r === "string" && re.test(r);

// ════ 1. La migración ═════════════════════════════════════════════════════════
const prod = await nueva(false);
const con = await nueva(true);
check(true, "la migración carga sobre prod (agencias, creadoras por agencia y cuentas externas ya aplicadas)");
{
  const sin = await nueva(false, `drop view public.v_creators cascade; alter table public.creators drop column restricciones_seguridad;`);
  const r = await intento(() => aplicar(sin, N, M));
  check(/no existen o no son texto: \{restricciones_seguridad\}/.test(r), `si falta una columna de la ficha, no carga (${r.slice(-80)})`);
  check((await uno(sin, `select to_regclass('public.creadora_cuentas') t`))?.t === null, "y no deja nada");
  const lista = await uno(con, `select public.portal_campos_ficha() c`);
  check(json(lista?.c) === json(CAMPOS), `portal_campos_ficha son las 22 de la ficha, en orden (${lista?.c?.length})`);
}

// ════ 2. creadora_cuentas: qué se puede atar ══════════════════════════════════
await como(con, "service_role", `insert into public.creadora_cuentas (user_id, creator_id, tenant_id, correo, invitada_por)
  values ('${SOFI}', '${C1}', '${T2}', '  Sofi.Personal@Gmail.test ', '${MARIO}')`);
{
  const f = await uno(con, `select tenant_id, correo, correo_visible from public.creadora_cuentas where creator_id = '${C1}'`);
  check(f?.tenant_id === T1, `la agencia sale de la ficha aunque pidan otra (${f?.tenant_id})`);
  check(f?.correo === "sofi.personal@gmail.test", `el correo queda en minúsculas y sin espacios (${f?.correo})`);
  check(f?.correo_visible === "s•••@gmail.test", `correo_visible enmascarado como v_creators (${f?.correo_visible})`);

  const empleado = await probar(con, "service_role", `insert into public.creadora_cuentas (user_id, creator_id, correo) values ('${EMPL}', '${C2}', 'empl@x.test')`);
  check(esError(empleado, /no es de creadora/), `una cuenta de empleado no se ata a una ficha (${empleado})`);
  const enAgencia = await probar(con, "service_role", `insert into public.tenant_members (user_id, tenant_id) values ('${LUNA}', '${T1}');
    insert into public.creadora_cuentas (user_id, creator_id, correo) values ('${LUNA}', '${C2}', 'luna@gmail.test')`);
  check(esError(enAgencia, /es de alguien de una agencia/), `ni una de creadora que está en tenant_members (${enAgencia})`);
  const otraFicha = await probar(con, "service_role", `insert into public.creadora_cuentas (user_id, creator_id, correo) values ('${SOFI}', '${C2}', 'sofi@x.test')`);
  check(esError(otraFicha, /otra creadora de la misma agencia/), `en una agencia, una cuenta es de UNA ficha (${otraFicha})`);
  const dosCuentas = await probar(con, "service_role", `insert into public.creadora_cuentas (user_id, creator_id, correo) values ('${LUNA}', '${C1}', 'luna@gmail.test')`);
  check(esError(dosCuentas, /creadora_cuentas_una_por_ficha/), `una ficha tiene una sola cuenta (${String(dosCuentas).slice(0, 80)})`);
  const noExiste = await probar(con, "service_role", `insert into public.creadora_cuentas (user_id, creator_id, correo) values ('${LUNA}', '${C(77)}', 'luna@gmail.test')`);
  check(esError(noExiste, /no existe/), `una ficha que no existe, no (${noExiste})`);
}
// Olga carga su creadora y Sofi también trabaja con la otra agencia: misma cuenta.
await como(con, OLGA, `insert into public.creators (id, name, status, instagram_handle, created_by, tono_voz) values ('${D1}', 'Sofía (otra)', 'active', 'sofi_otra', '${OLGA}', 'Dulce')`);
await como(prod, OLGA, `insert into public.creators (id, name, status, instagram_handle, created_by) values ('${D1}', 'Sofía (otra)', 'active', 'sofi_otra', '${OLGA}')`);
await como(con, "service_role", `insert into public.creadora_cuentas (user_id, creator_id, correo, invitada_por) values ('${SOFI}', '${D1}', 'sofi.personal@gmail.test', '${OLGA}')`);
check((await uno(con, `select count(*)::int n from public.creadora_cuentas where user_id = '${SOFI}'`))?.n === 2, "la misma cuenta en dos agencias: una fila por ficha");

// ════ 3. Quién ve las cuentas ═════════════════════════════════════════════════
{
  const ve = async (quien: Quien) => {
    const r = await probar(con, quien, `select creator_id from public.creadora_cuentas order by creator_id`);
    return typeof r === "string" ? `error: ${r.slice(0, 50)}` : r.map((f) => f.creator_id);
  };
  check(json(await ve(JHON)) === json([C1]), `el admin de asm-tech ve la de su agencia, no la de la otra (${json(await ve(JHON))})`);
  check(json(await ve(MARIO)) === json([C1]), "su manager la ve");
  check(json(await ve(ANA)) === json([C1]), "su chatter la ve (ve a la creadora; el correo, enmascarado)");
  check(json(await ve(CLARA)) === json([]), "quien no ve a esa creadora (una closer de otra), no");
  check(json(await ve(OLGA)) === json([D1]), "la otra agencia ve solo la suya");
  check(json(await ve(SOFI)) === json([C1, D1]), "Sofi ve sus dos fichas");
  check(json(await ve(LUNA)) === json([]), "una creadora sin ficha no ve nada");
  check(String(await ve("anon")).startsWith("error"), `anon, nada (${await ve("anon")})`);

  const correo = await probar(con, JHON, `select correo from public.creadora_cuentas`);
  check(esError(correo, /permission denied/), `el correo completo no se lee desde el navegador, ni siendo admin (${String(correo).slice(0, 60)})`);
  const visible = filas(await probar(con, ANA, `select correo_visible from public.creadora_cuentas`));
  check(visible[0]?.correo_visible === "s•••@gmail.test", "se lee enmascarado");
  for (const [que, sql] of [
    ["agregar", `insert into public.creadora_cuentas (user_id, creator_id, correo) values ('${LUNA}', '${C2}', 'x@x.test')`],
    ["cambiar", `update public.creadora_cuentas set invitada_por = '${JHON}' where creator_id = '${C1}' returning 1`],
    ["borrar", `delete from public.creadora_cuentas where creator_id = '${C1}' returning 1`],
  ] as const) {
    const r = await probar(con, JHON, sql);
    check(esError(r, /permission denied/), `${que} una cuenta desde el navegador, no (${String(r).slice(0, 60)})`);
  }
  const suya = await probar(con, SOFI, `update public.creadora_cuentas set creator_id = '${C2}' returning 1`);
  check(esError(suya, /permission denied/), "ni la propia creadora la cambia");
}

// ════ 4. La creadora ══════════════════════════════════════════════════════════
{
  const ag = filas(await probar(con, SOFI, `select creator_id, tenant_id, agencia, nombre, nombre_artistico from public.portal_mis_agencias()`));
  check(ag.length === 2 && ag[0].creator_id === C1 && ag[0].agencia === "ASM Tech" && ag[0].nombre_artistico === "Sofi" && ag[1].creator_id === D1 && ag[1].tenant_id === T2,
    `portal_mis_agencias: sus dos fichas, con su agencia (${json(ag)})`);
  check(filas(await probar(con, LUNA, `select * from public.portal_mis_agencias()`)).length === 0, "Luna, sin ficha: ninguna");
  check(filas(await probar(con, JHON, `select * from public.portal_mis_agencias()`)).length === 0, "alguien del equipo: ninguna");

  const ficha = filas(await probar(con, SOFI, `select public.portal_mi_ficha('${C1}') f`))[0]?.f;
  check(ficha && json(Object.keys(ficha).sort()) === json([...CAMPOS].sort()), `portal_mi_ficha: exactamente las 22 columnas (${Object.keys(ficha ?? {}).length})`);
  check(ficha?.tono_voz === "Picante", "con lo que ya tenía cargado");
  for (const [quien, ficha2, nombre] of [[SOFI, C3, "Sofi, una ficha que no es suya"], [LUNA, C1, "Luna, la de Sofi"], [JHON, C1, "el admin (no es su ficha)"], [OLGA, C1, "la otra agencia"]] as const) {
    const r = await probar(con, quien, `select public.portal_mi_ficha('${ficha2}') f`);
    check(esError(r, /esa ficha no es tuya/), `${nombre}: no (${String(r).slice(0, 50)})`);
  }
  const anon = await probar(con, "anon", `select public.portal_mi_ficha('${C1}') f`);
  check(esError(anon, /permission denied/), `anon no puede ni llamarla (${String(anon).slice(0, 50)})`);

  const g = filas(await probar(con, SOFI, `select public.portal_guardar_ficha('${C1}', '{"tono_voz":"Dulce","hobbies":"  yoga y pasta  ","comida_favorita":""}') f`))[0]?.f;
  check(g?.tono_voz === "Dulce" && g?.hobbies === "yoga y pasta" && g?.comida_favorita === null, `guarda, recorta y vacío = sin dato, y devuelve la ficha (${json({ t: g?.tono_voz, h: g?.hobbies, c: g?.comida_favorita })})`);
  for (const [cambios, re, que] of [
    [`{"status":"terminated"}`, /«status» no es un campo de tu ficha/, "el estado"],
    [`{"email":"otra@x.test"}`, /«email» no es un campo/, "el correo de la ficha"],
    [`{"precios_contenido":"0"}`, /no es un campo/, "los precios"],
    [`{"usuarios_vip":"x"}`, /no es un campo/, "los usuarios VIP"],
    [`{"tono_voz = 'x', status":"y"}`, /no es un campo/, "una clave armada para inyectar"],
    [`{"tono_voz":5}`, /tiene que ser texto/, "un número"],
    [`{"tono_voz":["a"]}`, /tiene que ser texto/, "una lista"],
    [`["tono_voz"]`, /van como un objeto/, "algo que no es un objeto"],
    [`{"tono_voz":"${"x".repeat(4001)}"}`, /demasiado largo/, "más de 4.000 caracteres"],
  ] as const) {
    const r = await probar(con, SOFI, `select public.portal_guardar_ficha('${C1}', '${cambios.replace(/'/g, "''")}') f`);
    check(esError(r, re), `guardar ${que}: no (${String(r).slice(0, 70)})`);
  }
  const ajena = await probar(con, SOFI, `select public.portal_guardar_ficha('${C3}', '{"tono_voz":"x"}') f`);
  check(esError(ajena, /no es tuya/), "guardar en una ficha ajena: no");
  const staff = await probar(con, MARIO, `select public.portal_guardar_ficha('${C1}', '{"tono_voz":"x"}') f`);
  check(esError(staff, /no es tuya/), "el equipo no usa el portal: edita desde Operaciones");

  // La tabla y la vista le siguen cerradas: todo pasa por las funciones.
  const tabla = filas(await probar(con, SOFI, `select id from public.creators`));
  const vista = filas(await probar(con, SOFI, `select id from public.v_creators`));
  const cambia = await probar(con, SOFI, `update public.creators set status = 'terminated' where id = '${C1}' returning id`);
  check(tabla.length === 0 && vista.length === 0 && Array.isArray(cambia) && cambia.length === 0,
    `creators y v_creators le siguen cerradas (${tabla.length}, ${vista.length}, ${json(cambia)})`);
  const porCorreo = await probar(con, SOFI, `select * from public.portal_cuenta_por_correo('luna@gmail.test')`);
  check(esError(porCorreo, /permission denied/), "portal_cuenta_por_correo es solo del servidor");
  const srv = filas(await probar(con, "service_role", `select * from public.portal_cuenta_por_correo(' LUNA@gmail.test ')`))[0];
  check(srv?.user_id === LUNA && srv?.tipo === "creadora" && srv?.es_de_agencia === false, `el servidor la encuentra por correo, sin importar mayúsculas (${json(srv)})`);
  const emp = filas(await probar(con, "service_role", `select * from public.portal_cuenta_por_correo('empl@x.test')`))[0];
  check(emp?.tipo === "" && emp?.es_de_agencia === true, `y distingue una de empleado (${json(emp)})`);
}

// ════ 5. El historial ═════════════════════════════════════════════════════════
await como(con, SOFI, `select public.portal_guardar_ficha('${C1}', '{"tono_voz":"Dulce","hobbies":"yoga","comida_favorita":""}')`);
{
  const h = await q(con, `select action, old_value, new_value, user_id from public.creator_history where creator_id = '${C1}' order by action`);
  check(json(h.map((f) => f.action)) === json(["portal:hobbies", "portal:tono_voz"]), `lo que cambió desde el portal, una fila por campo; lo que no cambió, nada (${json(h.map((f) => f.action))})`);
  const tono = h.find((f) => f.action === "portal:tono_voz");
  check(tono?.old_value === "Picante" && tono?.new_value === "Dulce" && tono?.user_id === SOFI, `con el antes, el después y quién (${json(tono)})`);

  await como(con, MARIO, `update public.creators set personalidad_marca = 'Juguetona', city = 'Medellín' where id = '${C1}'`);
  const m = await q(con, `select action, user_id from public.creator_history where creator_id = '${C1}' and user_id = '${MARIO}'`);
  check(json(m) === json([{ action: "ficha:personalidad_marca", user_id: MARIO }]), `desde Operaciones queda como «ficha:», y la ciudad (otra columna) no se anota (${json(m)})`);

  const antes = (await uno(con, `select count(*)::int n from public.creator_history`))?.n;
  await como(con, "service_role", `update public.creators set tono_voz = 'Del servidor' where id = '${C1}'`);
  check((await uno(con, `select count(*)::int n from public.creator_history`))?.n === antes, "sin sesión (service_role, cron, webhook) no se anota");

  // Cada una de las 22: si alguna faltara en el WHEN del trigger, no se anotaría.
  const sets = CAMPOS.map((k) => `${k} = 'cambio ${k}'`).join(", ");
  await como(con, JHON, `update public.creators set ${sets} where id = '${C2}'`);
  const todas = await q(con, `select action from public.creator_history where creator_id = '${C2}' order by action`);
  check(json(todas.map((f) => f.action)) === json(CAMPOS.map((k) => `ficha:${k}`).sort()), `las 22 columnas se anotan (${todas.length})`);
}
{
  // Ver, cambiar y borrar el historial: en prod, la otra agencia ve el de asm-tech y
  // cualquiera con permiso de Creadores lo cambia o lo borra.
  await como(prod, JHON, `insert into public.creator_history (creator_id, user_id, action) values ('${C1}', '${JHON}', 'Cambio de estado')`);
  const pOlga = filas(await probar(prod, OLGA, `select id from public.creator_history where creator_id = '${C1}'`)).length;
  const cOlga = filas(await probar(con, OLGA, `select id from public.creator_history where creator_id = '${C1}'`)).length;
  check(pOlga > 0, `línea base: en prod la otra agencia ve el historial de asm-tech (${pOlga})`);
  check(cOlga === 0, `con la migración, no (${cOlga})`);
  check(filas(await probar(con, OLGA, `select id from public.creator_history where creator_id = '${D1}'`)).length === 0, "y ve el de su creadora (todavía vacío)");
  const jhonVe = filas(await probar(con, JHON, `select id from public.creator_history where creator_id = '${C1}'`)).length;
  check(jhonVe === 3, `asm-tech sigue viendo el suyo: 2 del portal y 1 de Operaciones (${jhonVe})`);

  const pCambia = filas(await probar(prod, JHON, `update public.creator_history set new_value = 'falso' returning id`)).length;
  const cCambia = filas(await probar(con, JHON, `update public.creator_history set new_value = 'falso' returning id`)).length;
  const pBorra = filas(await probar(prod, JHON, `delete from public.creator_history returning id`)).length;
  const cBorra = filas(await probar(con, JHON, `delete from public.creator_history returning id`)).length;
  check(pCambia > 0 && pBorra > 0, `línea base: en prod se cambia y se borra (${pCambia}, ${pBorra})`);
  check(cCambia === 0 && cBorra === 0, `con la migración, ni siendo admin (${cCambia}, ${cBorra})`);

  const agrega = await probar(con, JHON, `insert into public.creator_history (creator_id, user_id, action) values ('${C1}', '${JHON}', 'Verificación aprobada') returning id`);
  check(filas(agrega).length === 1, "agregar sigue andando (cambio de estado y verificación)");
  const ajeno = await probar(con, OLGA, `insert into public.creator_history (creator_id, user_id, action) values ('${C1}', '${OLGA}', 'Inventado') returning id`);
  check(esError(ajeno, /row-level security/), `la otra agencia no le agrega historial a una creadora ajena (${String(ajeno).slice(0, 60)})`);
}

// ════ 6. portal_hola ══════════════════════════════════════════════════════════
{
  await como(con, SOFI, `select public.portal_hola('${C1}')`);
  const a = await uno(con, `select primer_acceso, ultimo_acceso from public.creadora_cuentas where creator_id = '${C1}'`);
  check(a?.primer_acceso && a?.ultimo_acceso, "la primera vez anota primer y último acceso");
  await como(con, SOFI, `select public.portal_hola('${C1}')`);
  const b = await uno(con, `select ultimo_acceso from public.creadora_cuentas where creator_id = '${C1}'`);
  check(String(b?.ultimo_acceso) === String(a?.ultimo_acceso), "dentro de 5 minutos no vuelve a escribir");
  await con.exec(`update public.creadora_cuentas set ultimo_acceso = now() - interval '1 hour' where creator_id = '${C1}'`);
  await como(con, SOFI, `select public.portal_hola('${C1}')`);
  const c = await uno(con, `select primer_acceso, ultimo_acceso from public.creadora_cuentas where creator_id = '${C1}'`);
  check(new Date(c?.ultimo_acceso) > new Date(Date.now() - 60_000) && String(c?.primer_acceso) === String(a?.primer_acceso), "pasada la hora, actualiza el último y deja el primero");
  await como(con, LUNA, `select public.portal_hola('${C1}')`);
  await como(con, JHON, `select public.portal_hola('${D1}')`);
  check(String((await uno(con, `select ultimo_acceso from public.creadora_cuentas where creator_id = '${C1}'`))?.ultimo_acceso) === String(c?.ultimo_acceso)
    && (await uno(con, `select primer_acceso from public.creadora_cuentas where creator_id = '${D1}'`))?.primer_acceso === null,
    "nadie más marca su acceso");
}

// ════ 7. La vuelta atrás ══════════════════════════════════════════════════════
{
  const db = await nueva(true);
  const r = await intento(() => aplicar(db, "vuelta atrás", vuelta(M)));
  check(r === "anduvo", `la vuelta atrás corre (${r.slice(0, 80)})`);
  const quedan = await uno(db, `select to_regclass('public.creadora_cuentas') t,
    (select count(*)::int from pg_proc where proname in ('portal_campos_ficha','es_mi_ficha','portal_cuenta_por_correo','portal_mis_agencias','portal_mi_ficha','portal_guardar_ficha','portal_hola','creators_ficha_historial','creadora_cuentas_revisar')) f,
    (select count(*)::int from pg_trigger where tgname = 'creators_ficha_historial') tr,
    (select string_agg(policyname, ',') from pg_policies where tablename = 'creator_history') p`);
  check(quedan?.t === null && quedan?.f === 0 && quedan?.tr === 0 && quedan?.p === "creator_history_scope", `y deja todo como en prod (${json(quedan)})`);
  check((await intento(() => aplicar(db, N, M))) === "anduvo", "y se puede volver a aplicar");
}

for (const m of ok) console.log(`✓ ${m}`);
for (const m of mal) console.log(`✗ ${m}`);
console.log(`\n${ok.length} ok${mal.length ? `, ${mal.length} MAL` : ""}`);
if (mal.length) Deno.exit(1);
