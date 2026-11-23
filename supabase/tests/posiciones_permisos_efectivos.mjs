import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.MAVEN_PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,employee,supervisor,admin,legacy]=[1,2,3,4,5].map(uid);
const source=readFileSync(new URL('../../frontend/src/lib/posiciones/catalogo.ts',import.meta.url),'utf8');
const catalog=JSON.parse(source.match(/CATALOGO_POSICIONES: SeccionCatalogo\[\] = (\[[\s\S]*?\n\]);/)[1]);
const allKeys=catalog.flatMap(s=>s.grupos.flatMap(g=>g.filas.flatMap(f=>f.funciones.map(x=>x.clave))));
const keys=allKeys.filter(k=>!k.startsWith('N:'));
await db.exec(`
create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create table app_flags(key text primary key,enabled boolean);
insert into app_flags values('posiciones_mandan',true);
create table personas_borrador_marcas(user_id uuid primary key,deshabilitada boolean);
create table posiciones_borrador(id uuid primary key,activa boolean,acceso_total boolean,checks jsonb);
create table posiciones_borrador_personas(user_id uuid,posicion_id uuid);
create table posiciones_catalogo(clave text primary key);
create table user_roles(user_id uuid,role text,tenant_id uuid);
create table roles_config(id uuid,name text,tenant_id uuid,is_active boolean);
create table role_permissions(role_id uuid,module text,submodule text,can_access boolean);
create function es_dueno(u uuid) returns boolean language sql stable as $$select coalesce(u='${owner}'::uuid,false)$$;
create function is_in_role_group(u uuid,g text) returns boolean language sql stable as $$
select case g when 'admin' then u='${admin}'::uuid or u='${owner}'::uuid
when 'supervisor_or_above' then u in ('${supervisor}'::uuid,'${admin}'::uuid,'${owner}'::uuid,'${legacy}'::uuid) else false end$$;
insert into posiciones_borrador select u,true,false,'{}'::jsonb from unnest(array['${employee}','${supervisor}','${admin}']::uuid[])u;
insert into posiciones_borrador_personas select id,id from posiciones_borrador;
`);
for(const key of keys) await db.query('insert into posiciones_catalogo values($1)',[key]);
const casesSql=readFileSync(new URL('../migrations/20261119140000_argos_casos_rrhh.sql',import.meta.url),'utf8');
await db.exec(casesSql.match(/create or replace function public\.tiene_funcion[\s\S]*?\$\$;/)[0]);
await db.exec(readFileSync(new URL('../migrations/20260820010000_can_use_module_function.sql',import.meta.url),'utf8'));
const allowed=async(u,key)=>{
 const [module,sub]=key.split('|');
 return (await db.query('select can_use_module_function($1,$2,$3) ok',[u,module,sub==='*'?null:sub])).rows[0].ok;
};
// Reproduce el fallo real anterior antes de cargar la corrección.
assert.equal(await allowed(admin,'Cowork|Crear sesión'),true);
await db.query('update posiciones_borrador set checks=$1 where id=$2',[JSON.stringify({'Cowork|Crear sesión':true}),employee]);
assert.equal(await allowed(employee,'Cowork|Crear sesión'),false);
await db.exec(readFileSync(new URL('../migrations/20261123042735_posiciones_permisos_efectivos.sql',import.meta.url),'utf8'));
let checks=2;
const granted=Object.fromEntries(allKeys.map(k=>[k,true]));
for(const who of [employee,supervisor,admin]) {
 await db.query('update posiciones_borrador set checks=$1 where id=$2',['{}',who]);
 for(const key of keys){assert.equal(await allowed(who,key),false,`denegación ${who} ${key}`);checks++;}
 await db.query('update posiciones_borrador set checks=$1 where id=$2',[JSON.stringify(granted),who]);
 for(const key of keys){assert.equal(await allowed(who,key),true,`concesión ${who} ${key}`);checks++;}
 await db.query('update posiciones_borrador set activa=false where id=$1',[who]);
 assert.equal(await allowed(who,'Cowork|Crear sesión'),false);checks++;
 await db.query('update posiciones_borrador set activa=true,checks=$1 where id=$2',['{}',who]);
 assert.equal(await allowed(who,'Cowork|Crear sesión'),false);checks++;
}
assert.equal(await allowed(owner,'Cowork|Crear sesión'),true);checks++;
assert.equal(await allowed(null,'Cowork|Crear sesión'),false);checks++;
assert.equal(await allowed(legacy,'Cowork|Crear sesión'),true);checks++;
await db.query('update posiciones_borrador set acceso_total=true where id=$1',[admin]);
assert.equal(await allowed(admin,'Cowork|Crear sesión'),true);checks++;
await db.query('insert into personas_borrador_marcas values($1,true)',[admin]);
assert.equal(await allowed(admin,'Cowork|Crear sesión'),false);checks++;
assert.equal(await allowed(admin,'Fuera del catálogo|Acción'),false);checks++;
await db.query("select set_config('test.uid',$1,false)",[admin]);
const blocked=(await db.query('select mis_funciones_posicion() p')).rows[0].p;
assert.equal(blocked.bloqueada,true);assert.equal(blocked.total,false);assert.deepEqual(blocked.checks,{});checks+=3;
await db.query("select set_config('test.uid',$1,false)",[employee]);
const own=(await db.query('select mis_funciones_posicion() p')).rows[0].p;
assert.equal(own.uid,employee);assert.equal(own.aplica,true);assert.equal(own.total,false);checks+=3;
// Con varias posiciones solo conceden las activas; quitar la última concesión
// revoca al instante, sin depender del rol legacy sincronizado.
const extra=uid(20);
await db.query('insert into posiciones_borrador values($1,false,false,$2)',[extra,JSON.stringify({'Cowork|Crear sesión':true})]);
await db.query('insert into posiciones_borrador_personas values($1,$2)',[employee,extra]);
assert.equal(await allowed(employee,'Cowork|Crear sesión'),false);checks++;
await db.query('update posiciones_borrador set activa=true where id=$1',[extra]);
assert.equal(await allowed(employee,'Cowork|Crear sesión'),true);checks++;
await db.query('delete from posiciones_borrador_personas where user_id=$1 and posicion_id=$2',[employee,extra]);
assert.equal(await allowed(employee,'Cowork|Crear sesión'),false);checks++;
// Verifica también privilegios SQL, no solamente auth.uid() simulado.
await db.exec('set role anon');
await assert.rejects(db.query('select mis_funciones_posicion()'),/permission denied/);checks++;
await db.exec('reset role; set role authenticated');
assert.equal((await db.query('select mis_funciones_posicion() p')).rows[0].p.uid,employee);checks++;
await db.exec('reset role');
await db.exec("update app_flags set enabled=false where key='posiciones_mandan'");
assert.equal(await allowed(supervisor,'Cowork|Crear sesión'),true);checks++;
assert.equal(await allowed(employee,'Cowork|Crear sesión'),false);checks++;
await db.close();
console.log(`${checks} comprobaciones: ${keys.length} funciones del catálogo × empleado/supervisor/admin (conceder/denegar), posición inactiva, revocación, dueño, deshabilitada y compatibilidad. Comprueba el autorizador común; no sustituye las pruebas de cada endpoint.`);
