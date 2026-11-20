// BANCO de Ausencias (20/11/2026): carga 20261120150000_ausencias.sql en PGlite con
// lo mínimo de alrededor (perfiles, empresa, puestos, horario por semana) y prueba
// el flujo completo: alcance por puesto, días hábiles con festivos, aviso mínimo,
// saldo, jefe → RR. HH. (el jefe NO ve el motivo), avisos, día libre que borra el
// turno (turno_del_dia / turno_en_curso), ausencia parcial, solape, cancelar,
// calendario de asistencia y permisos especiales (otorgar, auditar, revocar).
// Correr: npx deno run -A --node-modules-dir=none --no-lock supabase/tests/ausencias.ts
import { PGlite } from "npm:@electric-sql/pglite@0.3";

const MIG = Deno.readTextFileSync(new URL("../migrations/20261120150000_ausencias.sql", import.meta.url));
const STUB = `
create role authenticated; create role anon; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table profiles (id uuid primary key, full_name text, avatar_url text, avatar_seed text, created_at timestamptz default now(), deleted_at timestamptz, nivel text, hora_entrada time, hora_salida time, turno_id uuid, exonera_camara_pantalla boolean);
create table tenant_members (user_id uuid, tenant_id uuid, role text, created_at timestamptz default now());
create table tenant_owners (user_id uuid, tenant_id uuid);
create table user_roles (user_id uuid, role text, tenant_id uuid);
create table roles_config (name text, hora_entrada time, hora_salida time, exonera_camara_pantalla boolean, is_active boolean, tenant_id uuid, level int);
create table rol_turnos (id uuid, nombre text, hora_entrada time, hora_salida time);
create table horario_semanal (user_id uuid, dia smallint, entrada time, salida time);
create table posiciones_borrador (id uuid primary key default gen_random_uuid(), nombre text, activa boolean default true, acceso_total boolean default false, checks jsonb default '{}', alcances jsonb default '{}', updated_at timestamptz);
create table posiciones_borrador_personas (user_id uuid, posicion_id uuid);
create table personas_borrador_marcas (user_id uuid primary key, deshabilitada boolean);
create table equipos_a_cargo (user_id uuid, equipo text);
create table cowork_libres (user_id uuid);
create table turno_marcas (id uuid default gen_random_uuid(), user_id uuid, inicio timestamptz, fin timestamptz);
create table cowork_tiempo_segmentos (user_id uuid, started_at timestamptz, ended_at timestamptz, last_seen_at timestamptz, seconds int);
create table cowork_breaks (user_id uuid, started_at timestamptz, ended_at timestamptz);
create table tardanzas_registro (user_id uuid, dia date, tarde_min int, tolerancia_min int);
create table employees (profile_id uuid, hire_date date);
create table notifications (id uuid default gen_random_uuid(), user_id uuid, type text, title text, message text, reference_id uuid, reference_type text, module_origin text, priority text, status text, deep_link_url text, visibility_scope text, is_read boolean, created_at timestamptz default now());
create table monitor_config (id int, turno_obligatorio_desde timestamptz);
create function es_dueno(_user_id uuid) returns boolean language sql stable as $$ select exists (select 1 from tenant_owners o where o.user_id = _user_id) $$;
create function es_admin_o_dueno(_uid uuid) returns boolean language sql stable as $$ select es_dueno(_uid) or exists (select 1 from user_roles where user_id=_uid and lower(role)='admin') $$;
create function empresa_de(_uid uuid) returns uuid language sql stable as $$ select tenant_id from tenant_members where user_id=_uid limit 1 $$;
create function equipo_de(_uid uuid) returns text language sql stable as $$ select coalesce((select case lower(role) when 'chatter' then 'Chatters' when 'chatter supervisor' then 'Chatters' when 'hhrr' then 'RRHH' end from user_roles where user_id=_uid limit 1),'Otros') $$;
create function notif_canal_activo(p_user uuid, p_type text, p_canal text) returns boolean language sql as $$ select true $$;
create function exige_camara(_uid uuid) returns boolean language sql as $$ select true $$;
create function exige_pantalla(_uid uuid) returns boolean language sql as $$ select false $$;
create function turno_obligatorio() returns boolean language sql as $$ select false $$;
create function puedo_configurar_empresa() returns boolean language sql as $$ select es_dueno(auth.uid()) $$;
create function presente_en_cowork(_uid uuid, _ahora timestamptz default now()) returns boolean language sql as $$ select false $$;
create or replace function public.turno_en_curso(_uid uuid, _ahora timestamp with time zone default now())
 returns table(inicio timestamp with time zone, fin timestamp with time zone) language plpgsql stable security definer set search_path to 'public' as $function$
declare v_dia date := (_ahora at time zone 'America/Bogota')::date; t record; d int;
begin
  foreach d in array array[0, -1] loop
    select x.inicio as ini, x.fin as fin_turno into t from public.turno_del_dia(_uid, v_dia + d) x;
    if found and _ahora >= t.ini and _ahora < t.fin_turno then inicio := t.ini; fin := t.fin_turno; return next; return; end if;
  end loop;
end; $function$;
`;

let fallas = 0;
const db = new PGlite();
await db.exec(STUB);
await db.exec(MIG);
const T = "10000000-0000-4000-8000-000000000001", DUE = "a0000000-0000-4000-8000-000000000001", RH = "a0000000-0000-4000-8000-000000000002", SUP = "a0000000-0000-4000-8000-000000000003", ANA = "a0000000-0000-4000-8000-000000000004", OTRO = "a0000000-0000-4000-8000-000000000005";
await db.exec(`
insert into profiles(id, full_name, nivel, hora_entrada, hora_salida) values ('${DUE}','Dueño','dueno',null,null),('${RH}','Rita RH','agente','08:00','17:00'),('${SUP}','Sara Sup','supervisor','08:00','17:00'),('${ANA}','Ana Chatter','agente','08:00','16:00'),('${OTRO}','Otro','agente','08:00','16:00');
insert into tenant_members(user_id, tenant_id) select id, '${T}' from profiles;
insert into tenant_owners values ('${DUE}','${T}');
insert into user_roles values ('${RH}','HHRR','${T}'),('${SUP}','Chatter Supervisor','${T}'),('${ANA}','Chatter','${T}'),('${OTRO}','Closer','${T}');
insert into posiciones_borrador(nombre) values ('HHRR'),('Chatter Supervisor'),('Chatter');
insert into posiciones_borrador_personas select '${RH}', id from posiciones_borrador where nombre='HHRR';
insert into posiciones_borrador_personas select '${SUP}', id from posiciones_borrador where nombre='Chatter Supervisor';
insert into posiciones_borrador_personas select '${ANA}', id from posiciones_borrador where nombre='Chatter';
insert into horario_semanal values ('${ANA}',1,'08:00','16:00'),('${ANA}',2,'08:00','16:00'),('${ANA}',3,'08:00','16:00'),('${ANA}',4,'08:00','16:00'),('${ANA}',5,'08:00','16:00');
`);
await db.exec("do $pos$ begin" + MIG.split("do $pos$ begin")[1]);
const como = async (u, sql) => { await db.exec(`select set_config('test.uid','${u}',false)`); return (await db.query(sql)).rows; };
const ok = (c, m) => { console.log((c ? "OK  " : "MAL ") + m); if (!c) fallas++; };
const err = async (u, sql, re, m) => { try { await como(u, sql); ok(false, m + " (no falló)"); } catch (e) { ok(re.test(e.message), m + " → " + e.message); } };
const hoy = "(now() at time zone 'America/Bogota')::date";

ok((await como(SUP, `select public.alcance_fila('${SUP}','Ausencias') a`))[0].a === "subordinates", "supervisor: alcance su equipo");
ok((await como(RH, `select public.alcance_fila('${RH}','Ausencias') a`))[0].a === "all", "RR. HH.: alcance todos");
ok((await como(ANA, `select public.alcance_fila('${ANA}','Ausencias') a`))[0].a === "self", "chatter: solo lo suyo");
ok((await como(SUP, `select public.ausencias_puede_ver('${SUP}','${ANA}') v`))[0].v === true, "sup ve a Ana");
ok((await como(SUP, `select public.ausencias_puede_ver('${SUP}','${OTRO}') v`))[0].v === false, "sup no ve a Otro");
ok((await como(ANA, `select public.ausencias_puede_ver('${ANA}','${OTRO}') v`))[0].v === false, "Ana no ve a Otro");
ok(Number((await como(ANA, `select public.ausencias_dias_habiles('${ANA}','2026-12-07','2026-12-13') n`))[0].n) === 5, "días hábiles L-V = 5");
await como(RH, `select public.ausencias_festivo_guardar('2026-12-08','Inmaculada')`);
ok(Number((await como(ANA, `select public.ausencias_dias_habiles('${ANA}','2026-12-07','2026-12-13') n`))[0].n) === 4, "con festivo = 4");
await err(ANA, `select public.ausencias_festivo_guardar('2026-12-25','Navidad')`, /solo RR/, "Ana no carga festivos");
await err(ANA, `select public.ausencia_solicitar('vacaciones', ${hoy} + 3, ${hoy} + 4)`, /anticipaci/, "vacaciones con 3 días: aviso mínimo");
await como(RH, `select public.ausencias_fecha_ingreso_guardar('${ANA}', ${hoy} - 730)`);
const s = (await como(ANA, `select * from public.ausencias_saldo('${ANA}')`))[0];
ok(Number(s.acumulados) === 30, "saldo: 2 años × 15 = 30 → " + s.acumulados);
await err(ANA, `select public.ausencia_solicitar('vacaciones', ${hoy} + 20, ${hoy} + 80)`, /saldo/, "vacaciones sin saldo");
const id = (await como(ANA, `select public.ausencia_solicitar('permiso','2026-12-14','2026-12-14',null,null,'cita médica de mi hija') id`))[0].id;
let a = (await como(RH, `select * from public.ausencias where id='${id}'`))[0];
ok(a.estado === "pendiente_jefe", "va al jefe primero");
ok((await como(SUP, `select count(*)::int n from notifications where user_id='${SUP}' and type='ausencia_solicitada'`))[0].n === 1, "aviso al jefe");
const band = await como(SUP, `select * from public.ausencias_bandeja()`);
ok(band.length === 1 && band[0].motivo === null && band[0].puedo_jefe === true, "jefe ve la solicitud SIN motivo");
await err(ANA, `select public.ausencia_decidir_jefe('${id}', true)`, /no puedes/, "Ana no se aprueba sola");
await como(SUP, `select public.ausencia_decidir_jefe('${id}', true)`);
ok((await como(RH, `select count(*)::int n from notifications where user_id='${RH}' and type='ausencia_por_aprobar'`))[0].n === 1, "aviso a RR. HH.");
const bandRh = await como(RH, `select * from public.ausencias_bandeja()`);
ok(bandRh[0]?.motivo === "cita médica de mi hija", "RR. HH. ve el motivo");
await err(SUP, `select public.ausencia_decidir_final('${id}', true, true)`, /aprobaci/, "sup no da la final");
await como(RH, `select public.ausencia_decidir_final('${id}', true, false)`);
a = (await como(ANA, `select * from public.mis_ausencias() where id='${id}'`))[0];
ok(a.estado === "aprobada" && a.pagada === false, "aprobada, no pagada");
ok((await como(ANA, `select count(*)::int n from notifications where user_id='${ANA}' and type='ausencia_aprobada'`))[0].n === 1, "aviso a la persona");
ok((await como(SUP, `select count(*)::int n from notifications where user_id='${SUP}' and type='ausencia_aprobada'`))[0].n === 1, "aviso al jefe en la final");
ok((await como(ANA, `select public.dia_libre('${ANA}','2026-12-14') v`))[0].v === true, "dia_libre ese día");
ok((await como(ANA, `select count(*)::int n from public.turno_del_dia('${ANA}','2026-12-14')`))[0].n === 0, "sin turno ese día");
ok((await como(ANA, `select count(*)::int n from public.turno_del_dia('${ANA}','2026-12-15')`))[0].n === 1, "turno al día siguiente");
ok((await como(ANA, `select count(*)::int n from public.turno_base_del_dia('${ANA}','2026-12-14')`))[0].n === 1, "el turno base sigue (calendario)");
ok((await como(ANA, `select public.dia_libre('${ANA}','2026-12-08') v`))[0].v === true, "festivo = día libre");
ok((await como(ANA, `select count(*)::int n from public.turno_en_curso('${ANA}','2026-12-14 10:00-05')`))[0].n === 0, "turno_en_curso vacío en la ausencia");
ok((await como(ANA, `select count(*)::int n from public.turno_en_curso('${ANA}','2026-12-15 10:00-05')`))[0].n === 1, "turno_en_curso al otro día");
const cal = await como(SUP, `select * from public.ausencias_calendario('2026-12-01','2026-12-31')`);
ok(cal.length === 1 && !("motivo" in cal[0]), "calendario sin motivo");
await como(RH, `select public.ausencia_registrar('${ANA}','permiso','2026-12-16','2026-12-16', true, '08:00','10:00','médico')`);
ok((await como(ANA, `select public.ausente_ahora('${ANA}', '2026-12-16 09:00-05') v`))[0].v === true, "parcial: ausente a las 9");
ok((await como(ANA, `select public.ausente_ahora('${ANA}', '2026-12-16 11:00-05') v`))[0].v === false, "parcial: no a las 11");
ok((await como(ANA, `select count(*)::int n from public.turno_del_dia('${ANA}','2026-12-16')`))[0].n === 1, "parcial: el turno sigue");
await err(ANA, `select public.ausencia_solicitar('permiso','2026-12-14','2026-12-15')`, /ya tienes/, "solape rechazado");
const idc = (await como(ANA, `select public.ausencia_solicitar('dia_libre','2026-12-21','2026-12-21') id`))[0].id;
await como(ANA, `select public.ausencia_cancelar('${idc}')`);
ok((await como(ANA, `select estado from public.mis_ausencias() where id='${idc}'`))[0].estado === "cancelada", "cancelada por la persona");
const as = await como(SUP, `select * from public.asistencia_dias('2026-12-07','2026-12-16')`);
const dia = (n) => as.find((r) => r.nombre === "Ana Chatter" && new Date(r.dia).toISOString().startsWith(n));
ok(dia("2026-12-08")?.estado === "festivo", "asistencia: festivo");
ok(dia("2026-12-14")?.estado === "ausente", "asistencia: ausente");
ok(dia("2026-12-12")?.estado === "descanso", "asistencia: sábado descanso");
console.log("asistencia sup ve:", [...new Set(as.map((r) => r.nombre))]);
await err(SUP, `select public.permisos_extra_otorgar('${OTRO}','N:ausencias.aprobar_final')`, /no puedes/, "sup no da permisos especiales");
await como(DUE, `select public.permisos_extra_otorgar('${OTRO}','N:ausencias.aprobar_equipo','Ausencias','all','cubre a Sara')`);
ok((await como(OTRO, `select public.tiene_funcion('${OTRO}','N:ausencias.aprobar_equipo') v`))[0].v === true, "extra: tiene la función");
ok((await como(OTRO, `select public.alcance_fila('${OTRO}','Ausencias') a`))[0].a === "all", "extra: alcance todos");
const pe = (await como(DUE, `select * from public.permisos_extra_de('${OTRO}')`))[0];
ok(pe.otorgado_por_nombre === "Dueño", "extra: con quién lo dio");
await como(DUE, `select public.permisos_extra_revocar('${pe.id}')`);
ok((await como(OTRO, `select public.tiene_funcion('${OTRO}','N:ausencias.aprobar_equipo') v`))[0].v === false, "extra revocado");
ok((await como(DUE, `select public.ausencias_recordatorios() n`))[0].n >= 0, "recordatorios corre");
console.log((await como(ANA, `select * from public.mi_ausencia_hoy()`))[0]);
console.log((await como(ANA, `select * from public.ausencias_politica_mia()`))[0]);
console.log((await como(SUP, `select * from public.mis_permisos_ausencias()`))[0]);
console.log((await como(ANA, `select * from public.ausentes_hoy_empresa()`)));
ok((await como(ANA, `select public.en_turno('${ANA}') v`)).length === 1, "en_turno corre");
ok((await como(ANA, `select public.argos_vigila_a('${ANA}') v`)).length === 1, "argos_vigila_a corre");
ok((await como(ANA, `select public.debe_estar_en_cowork('${ANA}') v`))[0].v !== undefined, "debe_estar_en_cowork corre");
ok((await como(ANA, `select * from public.horario_de('${ANA}')`)).length === 1, "horario_de corre");
const mh = await como(ANA, `select * from public.mi_horario_semana()`); ok(mh.length === 7 && mh.filter((d) => d.entrada).length === 5, "mi horario: 7 días, 5 con turno");
if (fallas) Deno.exit(1);
