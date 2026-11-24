import assert from 'node:assert/strict';
import {db,sql,id,owner,delegate,person,tenant} from './posiciones_constructor_fixture.mjs';
await db.exec('alter table personas_borrador_marcas add column updated_at timestamptz not null default now()');
await db.exec(sql('../migrations/20261123070814_posiciones_marcas_revisadas.sql'));
let n=0;const who=uid=>db.query("select set_config('test.uid',$1,false)",[uid]);
async function rejected(p,pattern){await assert.rejects(p,pattern);n++;}
await who(delegate);await rejected(db.query('select persona_aplicar_marcas($1,null,false,true)',[person]),/Solo el dueño/);
await who(owner);await rejected(db.query('select persona_aplicar_marcas($1,null,false,true)',[owner]),/protegida/);
await rejected(db.query('select persona_aplicar_marcas($1,null,false,true)',[id(999)]),/protegida/);
await db.query('select persona_aplicar_marcas($1,null,false,true)',[person]);
assert.equal((await db.query('select deshabilitada from personas_borrador_marcas where user_id=$1',[person])).rows[0].deshabilitada,true);n++;
assert.equal((await db.query('select tiene_funcion($1,$2) v',[person,'Messenger|*'])).rows[0].v,false);n++;
await rejected(db.query('select persona_aplicar_marcas($1,null,false,false)',[person]),/cambió/);
const version=(await db.query('select updated_at::text v from personas_borrador_marcas where user_id=$1',[person])).rows[0].v;
await db.query('select persona_aplicar_marcas($1,$2,true,false)',[person,version]);
assert.equal((await db.query('select tiene_funcion($1,$2) v',[person,'Messenger|*'])).rows[0].v,true);n++;
assert.equal((await db.query('select count(*) n from personas_accesos_auditoria where user_id=$1',[person])).rows[0].n,2);n++;
assert.equal((await db.query("select has_table_privilege('authenticated','personas_borrador_marcas','UPDATE') v")).rows[0].v,false);n++;
console.log(`${n} pruebas de deshabilitación/protección: versión, dueño protegido, revocación y auditoría.`);await db.close();
