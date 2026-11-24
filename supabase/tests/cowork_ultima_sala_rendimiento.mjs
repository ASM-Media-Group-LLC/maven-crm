// SQL real en PGlite, datos sintéticos y RLS activada. No certifica concurrencia de servidor.
// El atajo/índice comparado es experimental y NO se aplica a producción: la primera
// medición no demostró una mejora consistente frente a la corrección del 23/11.
// MAVEN_PGLITE_MODULE=/ruta/a/pglite/dist/index.js node supabase/tests/cowork_ultima_sala_rendimiento.mjs
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {db,sql,id,owner,delegate,person,other,tenant,one,two} from './posiciones_constructor_fixture.mjs';
const migration=sql('./fixtures/cowork_asignacion_atajo_experimental.sql');
const tenant2=id(200),outsider=id(201),legacy=id(202),sessionA=id(301),sessionB=id(302);
await db.exec(`
create table cowork_sessions(id uuid primary key,tenant_id uuid,name text,description text,status text,created_at timestamptz,created_by uuid);
create table cowork_memberships(id uuid primary key default gen_random_uuid(),session_id uuid,user_id uuid,role text,unique(session_id,user_id));
create index idx_cowork_memberships_user_id on cowork_memberships(user_id);
create table cowork_room_assignments(id uuid primary key default gen_random_uuid(),session_id uuid,user_id uuid,room_id uuid,assigned_at timestamptz,is_active boolean);
create index idx_cowork_room_assignments_user_id on cowork_room_assignments(user_id);
create unique index idx_cowork_active_assignment on cowork_room_assignments(session_id,user_id) where is_active=true;
create function is_cowork_member(_user_id uuid,_session_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.cowork_memberships where user_id=_user_id and session_id=_session_id)$$;
alter table cowork_sessions enable row level security;
alter table cowork_memberships enable row level security;
alter table cowork_room_assignments enable row level security;
grant select on cowork_sessions,cowork_memberships,cowork_room_assignments to authenticated;
create policy "Members can view their session" on cowork_sessions for select to authenticated using (is_cowork_member((select auth.uid()),id));
create policy "Members see session memberships" on cowork_memberships for select to authenticated using (is_cowork_member((select auth.uid()),session_id));
`);
await db.exec(sql('../migrations/20261123070450_posiciones_cowork_funciones.sql').match(/create or replace function public\.is_cowork_host[\s\S]*?\$\$;/)[0]);
await db.exec(`
create policy "Hosts see all assignments" on cowork_room_assignments for select to authenticated using (is_cowork_host((select auth.uid()),session_id));
create policy "Participants see own assignment" on cowork_room_assignments for select to authenticated using (user_id=(select auth.uid()));
insert into tenants values('${tenant2}');
insert into profiles(id,full_name) values('${outsider}','Externo sintético'),('${legacy}','Heredado sintético');
insert into tenant_members values('${outsider}','${tenant2}'),('${legacy}','${tenant}');
insert into cowork_sessions values('${sessionA}','${tenant}','A','','active',now(),'${owner}'),('${sessionB}','${tenant2}','B','','active',now(),'${outsider}');
insert into cowork_memberships(session_id,user_id,role) values
 ('${sessionA}','${owner}','host'),('${sessionA}','${delegate}','host'),('${sessionA}','${person}','participant'),('${sessionA}','${other}','host'),('${sessionA}','${legacy}','host'),
 ('${sessionB}','${outsider}','host'),('${sessionB}','${delegate}','host');
insert into cowork_room_assignments(id,session_id,user_id,room_id,assigned_at,is_active) values
 ('${id(401)}','${sessionA}','${person}','${id(451)}',now()-interval '1 hour',false),
 ('${id(402)}','${sessionA}','${person}','${id(452)}',now(),true),
 ('${id(403)}','${sessionA}','${other}','${id(453)}',now(),true),
 ('${id(404)}','${sessionB}','${outsider}','${id(454)}',now(),true);
`);
await db.exec(sql('../migrations/20261123180749_rendimiento_cowork_permisos.sql'));
const as=async(uid,q)=>{
 await db.exec('begin');
 try{
  await db.query("select set_config('test.uid',$1,true)",[uid]);
  await db.exec('set local role authenticated');
  const r=(await db.query(q)).rows;
  await db.exec('rollback');return r;
 }catch(e){await db.exec('rollback');throw e;}
};
const baseline=async()=>db.exec(`alter policy "Hosts see all assignments" on cowork_room_assignments using (is_cowork_host((select auth.uid()),session_id));`);
const apply=async()=>{
 await db.exec('begin');try{await db.exec(migration);await db.exec('commit');}catch(e){await db.exec('rollback');throw e;}
};
const inputs=[owner,delegate,person,other,legacy,outsider];
const snapshot=async()=>{
 const result=[];
 for(const uid of inputs) result.push({
  uid,rows:await as(uid,'select id from cowork_room_assignments order by id'),
  own:await as(uid,'select * from cowork_mis_sesiones_activas() order by id')
 });
 return result;
};
const comparisons=[];
async function equivalent(label){
 await baseline();const before=await snapshot();await apply();const after=await snapshot();
 assert.deepEqual(after,before,label);comparisons.push(label);
}
await equivalent('dueño, delegado, empleado, anfitrión sin permiso, heredado sin posiciones e intruso de otra empresa');
await db.query('update posiciones_borrador set checks=$1 where id=$2',[JSON.stringify({'Cowork|*':true}),one]);
await equivalent('una posición: solo permiso de módulo');
await db.query('update posiciones_borrador set checks=$1 where id=$2',[JSON.stringify({'N:cowork.abrir':true}),two]);
await db.query('insert into posiciones_borrador_personas(user_id,posicion_id) values($1,$2)',[other,two]);
await equivalent('dos posiciones: unión de módulo y abrir');
assert.equal((await as(other,'select id from cowork_room_assignments order by id')).length,3);
await db.query('insert into personas_accesos_revision(user_id,tenant_id,denegadas) values($1,$2,$3)',[other,tenant,['N:cowork.abrir']]);
await equivalent('denegación personal prevalece sobre dos posiciones');
assert.equal((await as(other,'select id from cowork_room_assignments order by id')).length,1);
await db.query('update posiciones_borrador set acceso_total=true where id=$1',[one]);
await equivalent('acceso total conserva denegación personal');
await db.query('insert into personas_borrador_marcas(user_id,deshabilitada) values($1,true)',[other]);
await equivalent('persona deshabilitada conserva exactamente acceso previo');
await assert.rejects(as(person,'update cowork_room_assignments set is_active=false'),/permission denied/);
await db.exec('begin;set local role anon;');
await assert.rejects(db.query('select id from cowork_room_assignments'),/permission denied/);
await db.exec('rollback');
await apply(); // Idempotencia de ambas guardas y del índice.

// Un cambio de estructura de políticas impide optimizar a ciegas.
await db.exec(`alter policy "Participants see own assignment" on cowork_room_assignments using (false);`);
await assert.rejects(apply(),/Las políticas de asignaciones cambiaron/);
await db.exec(`alter policy "Participants see own assignment" on cowork_room_assignments using (user_id=(select auth.uid()));`);

// Escalas de datos: 5.748, 28.740 y 57.480 asignaciones; 52, 260 y 520 personas.
// Solo SQL en un proceso WASM local: estos tiempos no son los de Supabase real.
await db.exec('delete from personas_borrador_marcas;delete from personas_accesos_revision;');
const metrics=[];
for(const factor of [1,5,10]){
 await db.exec('truncate cowork_room_assignments,cowork_memberships,cowork_sessions');
 const users=52*factor,sessions=42*factor,assignments=5748*factor;
 await db.exec(`
 insert into cowork_sessions(id,tenant_id,name,description,status,created_at,created_by)
 select md5('session-'||g)::uuid,'${tenant}','Sala '||g,'','active','2026-11-01'::timestamptz+g*interval '1 minute','${owner}' from generate_series(1,${sessions})g;
 insert into cowork_memberships(session_id,user_id,role)
 select md5('session-'||g)::uuid,'${person}','participant' from generate_series(1,5)g;
 insert into cowork_memberships(session_id,user_id,role)
 select md5('session-'||(((g-1)%${sessions})+1))::uuid,md5('user-'||g)::uuid,'participant' from generate_series(1,${users})g;
 insert into cowork_room_assignments(session_id,user_id,room_id,assigned_at,is_active)
 select md5('session-'||(((g-1)%5)+1))::uuid,
 case when g%${users}=0 then '${person}'::uuid else md5('user-'||(((g-1)%${users})+1))::uuid end,
 md5('room-'||g)::uuid,'2026-11-01'::timestamptz+g*interval '1 second',false
 from generate_series(1,${assignments})g;
 analyze cowork_room_assignments;analyze cowork_memberships;analyze cowork_sessions;
 `);
 // Retirar solo el índice creado en ESTA base sintética, para medir el antes real.
 await db.exec('drop index if exists cowork_asignacion_reciente_idx');await baseline();
 const beforeRows=await as(person,'select * from cowork_mis_sesiones_activas() order by id');
 const time=async()=>{
  const samples=[];for(let i=0;i<5;i++){const start=performance.now();await as(person,'select * from cowork_mis_sesiones_activas()');samples.push(performance.now()-start);}
  samples.sort((a,b)=>a-b);return {median_ms:Number(samples[2].toFixed(2)),max_ms:Number(samples[4].toFixed(2))};
 };
 const before=await time();await apply();
 assert.deepEqual(await as(person,'select * from cowork_mis_sesiones_activas() order by id'),beforeRows);
 const after=await time();
 const plan=await as(person,`explain (analyze,buffers,format json) select a.room_id from cowork_room_assignments a
 where a.user_id=(select auth.uid()) and a.session_id=md5('session-1')::uuid order by a.assigned_at desc limit 1`);
 assert.match(JSON.stringify(plan),/cowork_asignacion_reciente_idx/);
 metrics.push({factor,users,sessions,assignments,before,after,uses_recent_index:true});
}
console.log(JSON.stringify({security_comparisons:comparisons,metrics,limitation:'Pruebas SQL locales, sin carga concurrente ni red de producción'},null,2));
await db.close();
