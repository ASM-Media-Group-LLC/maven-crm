import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.MAVEN_PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const sql=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,delegate,person,other,tenant,ownerPosition,delegatePosition,one,two]=[1,2,3,4,100,101,102,103,104].map(id);
await db.exec(`
create role anon;create role authenticated;create role service_role;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create table auth.users(id uuid primary key,banned_until timestamptz,raw_app_meta_data jsonb default '{}');
create table auth.sessions(user_id uuid);
create table tenants(id uuid primary key);
create table tenant_members(user_id uuid primary key,tenant_id uuid);
create table tenant_owners(user_id uuid,tenant_id uuid);
create function current_tenant_id() returns uuid language sql stable as $$select tenant_id from tenant_members where user_id=auth.uid()$$;
create function es_dueno(u uuid) returns boolean language sql stable as $$select exists(select 1 from tenant_owners where user_id=u)$$;
create table profiles(id uuid primary key,full_name text,avatar_url text,nivel text default 'agente',equipo text default 'Ventas',deleted_at timestamptz,exonera_camara_pantalla boolean default false);
create table equipos_a_cargo(user_id uuid,tenant_id uuid,equipo text);
create function equipo_de(u uuid) returns text language sql stable as $$select equipo from profiles where id=u$$;

create table posiciones_borrador(id uuid primary key default gen_random_uuid(),nombre text,descripcion text,rol text,activa boolean default true,acceso_total boolean default false,todas_creadoras boolean default false,
 checks jsonb default '{}',alcances jsonb default '{}',orden int default 0,modalidad_id uuid,pide_camara boolean default true,pide_pantalla boolean default true,updated_at timestamptz default now(),created_at timestamptz default now());
create table posiciones_borrador_personas(user_id uuid references profiles(id),posicion_id uuid references posiciones_borrador(id),primary key(user_id,posicion_id));
create table personas_borrador_marcas(user_id uuid primary key,deshabilitada boolean default false,protegido boolean default false);
create table posiciones_respaldo(id bigint generated always as identity,creado_por uuid,datos jsonb);
create table app_flags(key text primary key,enabled boolean,note text,updated_at timestamptz);
create table roles_config(id uuid primary key default gen_random_uuid(),tenant_id uuid,name text,is_active boolean default true,description text,exonera_camara_pantalla boolean);
create table role_permissions(id uuid primary key default gen_random_uuid(),role_id uuid,module text,submodule text,can_access boolean,data_scope text);
create table user_roles(user_id uuid,role text,tenant_id uuid,unique(user_id,role));
create function es_admin_o_dueno(u uuid) returns boolean language sql stable as $$select es_dueno(u) or exists(select 1 from user_roles where user_id=u and role='admin')$$;
create table drive_acceso_extra(user_id uuid primary key,nota text);
create table pausas_modalidades(id uuid,tenant_id uuid,activa boolean);
create table monitor_config(roles_calificados text[]);
create function exige_camara(u uuid) returns boolean language sql stable as $$select coalesce(bool_or(p.pide_camara),false) from posiciones_borrador p join posiciones_borrador_personas a on a.posicion_id=p.id where a.user_id=u and p.activa$$;
create function exige_pantalla(u uuid) returns boolean language sql stable as $$select coalesce(bool_or(p.pide_pantalla),false) from posiciones_borrador p join posiciones_borrador_personas a on a.posicion_id=p.id where a.user_id=u and p.activa$$;
-- Scope helper is separately exercised in posiciones_usuarios.mjs. This fixture keeps team membership deterministic.
create function posicion_usuario_en_alcance(a uuid,b uuid,c text) returns boolean language sql stable as $$select a<>b and exists(select 1 from tenant_members x join tenant_members y on x.tenant_id=y.tenant_id where x.user_id=a and y.user_id=b)$$;
grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;
grant select,insert,update,delete on posiciones_borrador,posiciones_borrador_personas to authenticated;
alter table posiciones_borrador enable row level security;alter table posiciones_borrador_personas enable row level security;
insert into tenants values('${tenant}');insert into tenant_owners values('${owner}','${tenant}');
insert into app_flags values('posiciones_mandan',true,null,now());
insert into roles_config(tenant_id,name) values('${tenant}','admin');
`);
for(const uid of [owner,delegate,person,other]) {
 await db.query('insert into auth.users(id) values($1)',[uid]);await db.query('insert into profiles(id,full_name) values($1,$2)',[uid,`Persona ${uid.slice(-1)}`]);
 await db.query('insert into tenant_members values($1,$2)',[uid,tenant]);
 await db.query('insert into user_roles values($1,$2,$3)',[uid,uid===owner?'admin':'employee',tenant]);
}
const old=sql('../migrations/20261119060000_posiciones_mandan.sql');
await db.exec(old.slice(old.indexOf('create table if not exists public.posiciones_catalogo'),old.indexOf('--',old.indexOf('on conflict (clave)'))>0?old.indexOf('--',old.indexOf('on conflict (clave)')):old.indexOf('create or replace function public.rp_efectivo')));
await db.exec(old.match(/create or replace function public\.rp_efectivo[\s\S]*?\$\$;/)[0]);
for(const [pid,name,rol,keys,total] of [
 [ownerPosition,'Dueño','admin',{},true],
 [delegatePosition,'Delegado','delegate',{'Administración|Roles':true,'N:pos.agregar':true,'N:pos.editar':true,'N:pos.borrar':true,'N:pos.activar':true,'N:pos.permisos':true,'Administración|Usuarios':true,'N:usr.asignar':true,'Messenger|*':true,'N:msg.llamar':true},false],
 [one,'Soporte','support',{'Messenger|*':true,'N:msg.llamar':true},false],
 [two,'Operaciones','ops',{'Oficina|Documentos':true,'N:msg.llamar':true},false]]) {
 await db.query('insert into posiciones_borrador(id,nombre,rol,checks,acceso_total) values($1,$2,$3,$4,$5)',[pid,name,rol,JSON.stringify(keys),total]);
}
for(const [uid,pid] of [[owner,ownerPosition],[delegate,delegatePosition],[person,one],[other,one]])await db.query('insert into posiciones_borrador_personas values($1,$2)',[uid,pid]);
await db.exec(sql('../migrations/20261123033654_posiciones_aplicar_y_avisos_saldo.sql'));
await db.exec(sql('../migrations/20261123061204_posiciones_personas_revision.sql'));
await db.exec(sql('../migrations/20261123061407_posiciones_constructor_compatibilidad.sql'));
await db.exec(sql('../migrations/20261123062055_posiciones_constructor_delegado.sql'));

await db.exec(sql('../migrations/20261123042735_posiciones_permisos_efectivos.sql').match(/create or replace function public\.posicion_decision[\s\S]*?\$\$;/)[0]);
export {db,sql,id,owner,delegate,person,other,tenant,ownerPosition,delegatePosition,one,two};
