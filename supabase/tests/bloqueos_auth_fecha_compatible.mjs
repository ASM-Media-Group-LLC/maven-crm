// Prueba aislada en Postgres/PGlite, sin conectar a Supabase de producción.
// MAVEN_PGLITE_MODULE=/ruta/a/pglite/dist/index.js node supabase/tests/bloqueos_auth_fecha_compatible.mjs
import assert from 'node:assert/strict';
import {db,sql,id,owner,delegate,person,other} from './posiciones_constructor_fixture.mjs';

const migration=sql('../migrations/20261124060246_bloqueos_auth_fecha_compatible.sql');
const negative=id(999);
await db.query("update auth.users set banned_until='infinity' where id=$1",[person]);
await db.query("update auth.users set banned_until='2030-01-01T00:00:00Z' where id=$1",[delegate]);
await db.query("update auth.users set banned_until='2020-01-01T00:00:00Z' where id=$1",[other]);
await db.query("insert into auth.users(id,banned_until) values($1,'-infinity')",[negative]);
const rows=async()=> (await db.query('select id,banned_until::text as until,raw_app_meta_data from auth.users order by id')).rows;
const access=async()=> (await db.query(`select proowner,proacl::text as acl,prosecdef,proconfig,prosrc
 from pg_proc where oid='public.posiciones_sincronizar(boolean,boolean)'::regprocedure`)).rows[0];
const roles=async()=> (await db.query(`select jsonb_build_object(
 'roles',(select jsonb_agg(to_jsonb(r)) from public.user_roles r),
 'permisos',(select jsonb_agg(to_jsonb(r)) from public.role_permissions r),
 'posiciones',(select jsonb_agg(to_jsonb(r)) from public.posiciones_borrador r)) as snapshot`)).rows[0].snapshot;
const before=await rows(), fnBefore=await access(), rolesBefore=await roles();
await db.exec(migration);
const after=await rows(), fnAfter=await access();
for(const row of after) {
 const previous=before.find(r=>r.id===row.id);
 assert.deepEqual(row,{...previous,until:previous.until==='infinity'?'9999-12-31 00:00:00+00':previous.until});
}
assert.equal(fnAfter.prosrc,fnBefore.prosrc.replace("banned_until = 'infinity'","banned_until = '9999-12-31 00:00:00+00'::timestamptz"));
assert.deepEqual({...fnAfter,prosrc:null},{...fnBefore,prosrc:null});
assert.deepEqual(await roles(),rolesBefore);
await db.exec(migration);
assert.deepEqual(await rows(),after); // Reaplicar no cambia un bloqueo finito.

// La función real del constructor sigue respetando simulación y genera fechas válidas.
await db.query("select set_config('test.uid',$1,false)",[owner]);
await db.query('insert into personas_borrador_marcas(user_id,deshabilitada) values($1,true)',[other]);
await db.query('insert into auth.sessions(user_id) values($1)',[other]);
await db.exec('select * from posiciones_sincronizar(true,false)');
assert.equal((await db.query('select banned_until::text as until from auth.users where id=$1',[other])).rows[0].until,'2020-01-01 00:00:00+00');
await db.exec('select * from posiciones_sincronizar(false,false)');
assert.equal((await db.query('select banned_until::text as until from auth.users where id=$1',[other])).rows[0].until,'9999-12-31 00:00:00+00');
assert.equal((await db.query('select count(*) as n from auth.sessions where user_id=$1',[other])).rows[0].n,0);

// Una función cambiada de forma desconocida bloquea la migración antes de tocar datos.
await db.exec(`create or replace function posiciones_sincronizar(_simular boolean default true,_respaldo boolean default true)
 returns table(tipo text,quien text,detalle text) language plpgsql security definer
 set search_path=public,auth as $$begin return;end$$;`);
await db.query("update auth.users set banned_until='infinity' where id=$1",[person]);
await assert.rejects(db.exec(migration),/La forma del bloqueo cambió/);
assert.equal((await db.query('select banned_until::text as until from auth.users where id=$1',[person])).rows[0].until,'infinity');
await db.close();
console.log('Bloqueos Auth: fecha compatible, acceso conservado, simulación, aplicación, idempotencia y rechazo seguro verificados.');
