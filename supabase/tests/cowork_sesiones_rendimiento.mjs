import assert from 'node:assert/strict';
import {db,sql,id,owner,delegate,person,other,tenant,delegatePosition} from './posiciones_constructor_fixture.mjs';

// Ejecuta ambas versiones bajo RLS real: la optimización no debe ampliar accesos.
await db.exec(`
create table cowork_sessions(id uuid primary key, name text, description text, status text, tenant_id uuid, created_by uuid, created_at timestamptz);
create table cowork_memberships(user_id uuid,session_id uuid,role text,unique(session_id,user_id));
create index idx_cowork_memberships_user_id on cowork_memberships(user_id);
create table cowork_room_assignments(session_id uuid,room_id uuid,user_id uuid,is_active boolean,assigned_at timestamptz);
create index idx_cowork_room_assignments_user_id on cowork_room_assignments(user_id);
create function is_cowork_member(u uuid,s uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from cowork_memberships where user_id=u and session_id=s)
$$;
`);
await db.exec(sql('../migrations/20261123070450_posiciones_cowork_funciones.sql')
 .match(/create or replace function public\.is_cowork_host[\s\S]*?\$\$;/)[0]);
await db.exec(`
alter table cowork_sessions enable row level security;
alter table cowork_memberships enable row level security;
alter table cowork_room_assignments enable row level security;
grant select on cowork_sessions,cowork_memberships,cowork_room_assignments to authenticated;
create policy sesion on cowork_sessions for select to authenticated using(is_cowork_member((select auth.uid()),id));
create policy miembros on cowork_memberships for select to authenticated using(is_cowork_member((select auth.uid()),session_id));
create policy propia on cowork_room_assignments for select to authenticated using(user_id=(select auth.uid()));
create policy anfitrion on cowork_room_assignments for select to authenticated using(is_cowork_host((select auth.uid()),session_id));
`);
const [active,ended,foreign,empty,oldRoom,lastRoom,hostRoom,foreignRoom]=[910,911,912,913,920,921,922,923].map(id);
for(const [sid,status,company,creator,date] of [
 [active,'active',tenant,owner,'2026-11-20'],
 [ended,'ended',tenant,owner,'2026-11-21'],
 [foreign,'active',id(999),other,'2026-11-22'],
 [empty,'active',tenant,owner,'2026-11-23'],
]) await db.query('insert into cowork_sessions values($1,$2,null,$3,$4,$5,$6)',[sid,sid,status,company,creator,date]);
for(const [uid,sid,role] of [
 [person,active,'participant'],[person,ended,'participant'],[person,empty,'participant'],
 [delegate,active,'host'],[owner,active,'host'],[other,foreign,'host'],
]) await db.query('insert into cowork_memberships values($1,$2,$3)',[uid,sid,role]);
for(const [uid,sid,room,activeAssignment,date] of [
 [person,active,oldRoom,true,'2026-11-20'],[person,active,lastRoom,false,'2026-11-21'],
 [delegate,active,hostRoom,true,'2026-11-22'],[other,foreign,foreignRoom,true,'2026-11-22'],
]) await db.query('insert into cowork_room_assignments values($1,$2,$3,$4,$5)',[sid,room,uid,activeAssignment,date]);
// Historial ajeno: reproducir el recorrido completo que bloqueaba la portada.
await db.exec(`insert into cowork_room_assignments
 select '${foreign}','${foreignRoom}',md5(i::text)::uuid,false,'2026-11-20'::timestamptz
 from generate_series(1,6000) i; analyze cowork_memberships; analyze cowork_room_assignments;`);
const baseline=sql('../migrations/20260903120000_cowork_finalizar_seguro.sql')
 .match(/CREATE OR REPLACE FUNCTION public\.cowork_mis_sesiones_activas\(\)[\s\S]*?\$function\$;/)[0];
const migration=sql('../migrations/20261123180347_rendimiento_cowork_permisos.sql');
const actors=[person,delegate,owner,other,id(9999),''];
const asUser=async(uid,query)=>{
 await db.query("select set_config('test.uid',$1,false)",[uid]);
 await db.exec('set role authenticated');
 try{return (await db.query(query)).rows;} finally{await db.exec('reset role');}
};
const query='select * from cowork_mis_sesiones_activas()';
const before=new Map();
await db.exec(baseline);
for(const uid of actors) before.set(uid,await asUser(uid,query));
const metadataQuery="select prosecdef,provolatile,proconfig,proacl from pg_proc where oid='cowork_mis_sesiones_activas()'::regprocedure";
const metadata=(await db.query(metadataQuery)).rows;
assert.equal(metadata[0].prosecdef,false);
await db.exec(migration);
assert.deepEqual((await db.query(metadataQuery)).rows,metadata,'Conserva invoker, estabilidad, search_path y permisos de ejecución');
for(const uid of actors) assert.deepEqual(await asUser(uid,query),before.get(uid),`Mismas filas para ${uid || 'sin sesión'}`);
const rows=await asUser(person,query);
assert.deepEqual(rows.map(r=>r.id),[empty,active],'Solo sesiones activas propias, ordenadas');
assert.equal(rows[0].last_room_id,null,'Sin historial no inventa una sala');
assert.equal(rows[1].last_room_id,lastRoom,'Volver usa la asignación más reciente aunque ya no esté activa');
assert.equal(rows[1].members,3,'Cuenta los miembros autorizados de la sesión');
assert.deepEqual(await asUser(id(9999),query),[],'Un tercero no ve sesiones');
assert.deepEqual(await asUser('',query),[],'Sin sesión no hay datos');
assert.equal((await asUser(delegate,'select is_cowork_host(auth.uid(),'+"'"+active+"') as ok"))[0].ok,false);
await db.query("update posiciones_borrador set checks=checks||'{\"Cowork|*\":true,\"N:cowork.abrir\":true}' where id=$1",[delegatePosition]);
assert.equal((await asUser(delegate,`select is_cowork_host(auth.uid(),'${active}') as ok`))[0].ok,true);
assert.deepEqual(await asUser(delegate,query),before.get(delegate),'El permiso de host no incorpora asignaciones ajenas al resultado');
const body=migration.split('$function$')[1];
const explained=await asUser(person,`explain(analyze,format json) ${body}`);
const plan=explained[0]['QUERY PLAN'][0].Plan;
const flatten=p=>[p,...(p.Plans||[]).flatMap(flatten)];
const assignmentScan=flatten(plan).find(p=>p['Relation Name']==='cowork_room_assignments');
assert.ok(assignmentScan && assignmentScan['Node Type']!=='Seq Scan',JSON.stringify(assignmentScan));
assert.ok(assignmentScan['Actual Rows']<=2,'El plan no recorre el historial de las otras personas');
console.log('Cowork: equivalencia para 6 identidades, RLS, última sala, host delegado e índice con 6.000 asignaciones ajenas: OK.');
await db.close();
