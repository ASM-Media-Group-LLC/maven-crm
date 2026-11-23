import assert from 'node:assert/strict';
import {db,sql,id,owner,delegate,person,other,tenant,delegatePosition,one} from './posiciones_constructor_fixture.mjs';
await db.exec(`
create function is_in_role_group(u uuid,g text) returns boolean language sql stable as $$select es_admin_o_dueno(u)$$;
create function es_rh(u uuid) returns boolean language sql stable as $$select false$$;
create function actor_level(u uuid) returns int language sql stable as $$select case when es_admin_o_dueno(u) then 100 else 10 end$$;
create schema storage;create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;
create function storage.foldername(n text) returns text[] language sql immutable as $$select string_to_array(n,'/')$$;
grant usage on schema storage to authenticated;grant select on storage.objects to authenticated;
create policy legacy_objects on storage.objects for select to authenticated using(es_admin_o_dueno(auth.uid()));
create table cowork_sessions(id uuid primary key,status text,tenant_id uuid,created_by uuid);
create table cowork_memberships(user_id uuid,session_id uuid,role text);
create table cowork_rooms(id uuid,session_id uuid);
create table cowork_room_assignments(session_id uuid,room_id uuid,user_id uuid,is_active boolean);
create table argos_voz(id int);create table argos_situaciones(id int);create table argos_contexto(tenant_id uuid);
alter table monitor_config add column id int;
`);
for(const table of ['monitor_capturas','monitor_eventos','monitor_rondas','argos_alertas','argos_nudges','argos_uso_apps','monitor_clips','argos_clips']){
 await db.exec(`create table ${table}(id uuid default gen_random_uuid(),user_id uuid,tenant_id uuid);alter table ${table} enable row level security;
 grant select on ${table} to authenticated;create policy legacy on ${table} for select to authenticated using(es_admin_o_dueno(auth.uid()));`);
 for(const uid of [person,other])await db.query(`insert into ${table}(user_id,tenant_id) values($1,$2)`,[uid,tenant]);
}
for(const table of ['monitor_config','argos_voz','argos_situaciones','argos_contexto']){
 await db.exec(`alter table ${table} enable row level security;grant select,insert,update on ${table} to authenticated;create policy legacy on ${table} for all to authenticated using(es_admin_o_dueno(auth.uid())) with check(es_admin_o_dueno(auth.uid()));`);
}
await db.exec(sql('../migrations/20261123064131_posiciones_acciones_messenger_argos.sql').split('create or replace function public.argos_perdonar_captura')[0]);
await db.exec(sql('../migrations/20261123065843_posiciones_alcances_efectivos.sql'));
await db.exec(sql('../migrations/20261123070139_posiciones_argos_acceso.sql'));
await db.exec(sql('../migrations/20261123070450_posiciones_cowork_funciones.sql'));
let n=0;async function eq(query,args,expected){assert.deepEqual((await db.query(query,args)).rows[0].v,expected,query);n++;}
const who=uid=>db.query("select set_config('test.uid',$1,false)",[uid]);
await who(delegate);await db.query("update user_roles set role='admin' where user_id=$1",[delegate]);
await eq('select puede_vigilar_a($1,$2) v',[delegate,person],false);
await eq('select ve_argos() v',[],false);
await db.exec('set role authenticated');await eq('select count(*) v from monitor_capturas',[],0);await eq('select count(*) v from argos_clips',[],0);await db.exec('reset role');
await db.query("update posiciones_borrador set checks=checks||'{\"N:argos.expediente\":true}' where id=$1",[delegatePosition]);
await eq('select ve_argos() v',[],true);await eq('select argos_puede_abrir_expediente($1) v',[person],true);await eq('select puede_vigilar($1) v',[person],false);
await db.exec('set role authenticated');await eq('select count(*) v from monitor_capturas',[],2);await eq('select count(*) v from argos_clips',[],0);await db.exec('reset role');
await db.query("update posiciones_borrador set checks=checks||'{\"N:argos.video\":true,\"N:argos.presencia\":true}',alcances='{\"Presencia en vivo\":\"self\"}' where id=$1",[delegatePosition]);
await eq('select puede_vigilar($1) v',[person],false);
await db.query("update posiciones_borrador set alcances='{\"Presencia en vivo\":\"subordinates\"}' where id=$1",[delegatePosition]);
await db.query("update profiles set nivel='supervisor' where id=$1",[delegate]);await db.query("update profiles set equipo='Diseño' where id=$1",[other]);
await eq('select puede_vigilar($1) v',[person],true);await eq('select puede_vigilar($1) v',[other],false);
await db.exec('set role authenticated');await eq('select count(*) v from argos_clips',[],1);await db.exec('reset role');
for(const uid of [person,other])await db.query("insert into storage.objects values('argos-clips',$1)",[`${uid}/clip.webm`]);
await db.exec('set role authenticated');await eq('select count(*) v from storage.objects',[],1);await db.exec('reset role');
await db.query('insert into personas_accesos_revision(user_id,tenant_id,denegadas) values($1,$2,$3)',[delegate,tenant,['N:argos.video']]);
await db.exec('set role authenticated');await eq('select count(*) v from storage.objects',[],0);await db.exec('reset role');
// Scope never crosses companies, even for an owner signing photographs.
await db.query('insert into tenant_members values($1,$2)',[id(900),id(901)]);
await eq('select argos_puede_ver_foto($1,$2) v',[owner,id(900)],false);await eq('select argos_puede_ver_foto($1,$2) v',[owner,owner],true);
const session=id(910),room=id(911);
await db.query("insert into cowork_sessions values($1,'active',$2,$3)",[session,tenant,owner]);
await db.query("insert into cowork_memberships values($1,$2,'host')",[delegate,session]);
await db.query('insert into cowork_rooms values($1,$2)',[room,session]);await db.query('insert into cowork_room_assignments values($1,$2,$3,true)',[session,room,person]);
await eq('select is_cowork_host($1,$2) v',[delegate,session],false);
await db.query("update posiciones_borrador set checks=checks||'{\"Cowork|*\":true,\"N:cowork.abrir\":true,\"N:cowork.verpantallas\":true}',alcances=alcances||'{\"Salas\":\"subordinates\"}' where id=$1",[delegatePosition]);
await eq('select is_cowork_host($1,$2) v',[delegate,session],true);await eq('select cowork_posicion_ver_sala($1,$2) v',[session,room],true);
await db.query('insert into cowork_room_assignments values($1,$2,$3,true)',[session,room,other]);
await eq('select cowork_posicion_ver_sala($1,$2) v',[session,room],false);
await who(person);await eq('select $1=any(cowork_ven_pantallas_del_hub()) v',[delegate],true);
await who(other);await eq('select $1=any(cowork_ven_pantallas_del_hub()) v',[delegate],false);
console.log(`${n} pruebas de Argos/Cowork: funciones reales, filas y archivos privados, alcance de sala y empresa.`);await db.close();
