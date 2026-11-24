import assert from 'node:assert/strict';
import {db,sql,id,owner,delegate,person,other,tenant,delegatePosition,one,two} from './posiciones_constructor_fixture.mjs';
await db.exec(`
create function is_in_role_group(u uuid,g text) returns boolean language sql stable as $$select es_admin_o_dueno(u)$$;
create function es_rh(u uuid) returns boolean language sql stable as $$select false$$;
create table argos_casos(user_id uuid,dia date,veredicto text);
`);
await db.exec(sql('../migrations/20261123065843_posiciones_alcances_efectivos.sql'));
await db.exec(sql('../migrations/20261123064131_posiciones_acciones_messenger_argos.sql').split('create or replace function public.argos_perdonar_captura')[0]);
await db.exec(sql('../migrations/20261123070139_posiciones_argos_acceso.sql')
 .match(/create or replace function public\.puede_vigilar_a[\s\S]*?\$\$;/)[0]);
const oldPermissions=sql('../migrations/20261123065843_posiciones_alcances_efectivos.sql')
 .match(/create or replace function public\.mis_funciones_posicion[\s\S]*?\$\$;/)[0];
const oldArgos=sql('../migrations/20261119140000_argos_casos_rrhh.sql')
 .match(/create or replace function public\.argos_casos_bloqueo[\s\S]*?\$\$;/)[0];
await db.exec(oldPermissions.replace('public.mis_funciones_posicion()', 'public.permisos_anteriores()'));
await db.exec(oldArgos);
await db.exec(oldArgos.replace('public.argos_casos_bloqueo()', 'public.argos_anteriores()'));
await db.exec('revoke all on function argos_casos_bloqueo() from public,anon; grant execute on function argos_casos_bloqueo() to authenticated;');
const metadataSql="select proname,prosecdef,provolatile,proconfig,proacl from pg_proc where oid in ('mis_funciones_posicion()'::regprocedure,'argos_casos_bloqueo()'::regprocedure) order by proname";
const metadata=(await db.query(metadataSql)).rows;
await db.exec(sql('../migrations/20261123181156_rendimiento_argos_y_permisos.sql'));
assert.deepEqual((await db.query(metadataSql)).rows,metadata,'Mismos permisos de ejecución y contexto de seguridad');
const foreign=id(900),foreignTenant=id(901),foreignPosition=id(902);
await db.query('insert into tenants values($1)',[foreignTenant]);
await db.query('insert into profiles(id,full_name) values($1,$2)',[foreign,'Otra empresa']);
await db.query('insert into tenant_members values($1,$2)',[foreign,foreignTenant]);
await db.query("insert into posiciones_borrador(id,nombre,rol,tenant_id,checks,alcances) values($1,'Ajena','foreign',$2,'{\"Cowork|*\":true}','{\"Salas\":\"all\"}')",[foreignPosition,foreignTenant]);
await db.query('insert into posiciones_borrador_personas values($1,$2)',[person,foreignPosition]);
// Fechas fuera del período, día actual, pendientes y resueltos, datos ajenos.
for(const uid of [owner,delegate,person,other,foreign]){
 for(const [days,verdict] of [[0,null],[1,null],[1,'revisado'],[2,'revisado'],[14,null],[15,null]]){
  await db.query("insert into argos_casos values($1,(now() at time zone 'America/Bogota')::date-$2::int,$3)",[uid,days,verdict]);
 }
}
await db.exec(`insert into argos_casos select '${person}',(now() at time zone 'America/Bogota')::date-3,null from generate_series(1,120);`);
let checks=0;
async function compare(label){
 for(const uid of [owner,delegate,person,other,foreign,id(9999),'']){
  await db.query("select set_config('test.uid',$1,false)",[uid]);
  await db.exec('set role authenticated');
  try{
   const r=(await db.query('select mis_funciones_posicion() nuevo,permisos_anteriores() anterior')).rows[0];
   assert.deepEqual(r.nuevo,r.anterior,`${label}: permisos de ${uid}`);
   const a=(await db.query('select * from argos_casos_bloqueo()')).rows;
   const b=(await db.query('select * from argos_anteriores()')).rows;
   assert.deepEqual(a,b,`${label}: revisión Argos de ${uid}`);
   checks+=2;
  } finally{await db.exec('reset role');}
 }
}
await compare('Base y puesto ajeno ignorado');
await db.query('insert into posiciones_borrador_personas values($1,$2)',[person,two]);
await db.query("update posiciones_borrador set checks=checks||'{\"Cowork|*\":true,\"N:argos.presencia\":true,\"N:argos.casos.juzgar\":true,\"N:argos.casos.obligado\":true}',alcances='{\"Salas\":\"self\",\"Presencia en vivo\":\"subordinates\"}' where id=$1",[one]);
await db.query("update posiciones_borrador set checks=checks||'{\"Cowork|*\":true}',alcances='{\"Salas\":\"subordinates\"}' where id=$1",[two]);
await db.query("update profiles set nivel='supervisor' where id=$1",[person]);
await compare('Combinación, equipo y obligación de revisar');
await db.query("insert into personas_accesos_revision(user_id,tenant_id,denegadas) values($1,$2,array['Cowork|*','N:argos.casos.juzgar'])",[person,tenant]);
await compare('Excepciones individuales');
await db.query('update posiciones_borrador set acceso_total=true where id=$1',[two]);
await compare('Acceso total respeta excepciones');
await db.query('update posiciones_borrador set activa=false where id=$1',[two]);
await compare('Puesto inactivo');
await db.query("update posiciones_borrador set checks=checks||'{\"N:argos.expediente\":true}',alcances='{\"Expediente\":\"all\"}' where id=$1",[delegatePosition]);
await compare('Supervisor autorizado para toda su empresa');
await db.exec(`insert into personas_borrador_marcas(user_id,deshabilitada) values('${person}',true),('${owner}',true);`);
await compare('Cuenta bloqueada, incluido dueño');
await db.exec("update app_flags set enabled=false where key='posiciones_mandan'");
await compare('Roles anteriores y cuentas bloqueadas');
await db.exec('delete from personas_borrador_marcas');
await compare('Roles anteriores sin bloqueos');
await db.exec('delete from argos_casos');
await compare('Sin casos');
console.log(`${checks} comparaciones de permisos/Argos: JSON y conteos idénticos, fechas, excepciones, empresas, bloqueos y roles anteriores.`);
await db.close();
