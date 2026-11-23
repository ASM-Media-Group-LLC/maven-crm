// Executes the actual Edge handlers with isolated auth/database adapters.
// No live users, emails or network calls. SQL authorizers have separate tests.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

let count=0;
const compile=(url,require,globals={})=>{
  const source=ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  runInNewContext(source,{exports,require,console,Request,Response,Headers,crypto,...globals},{filename:url.pathname});
  return exports;
};
const hierarchy=compile(new URL('../functions/_shared/user-hierarchy.ts',import.meta.url));
const visibility=compile(new URL('../functions/_shared/user-visibility.ts',import.meta.url));

function setup({visible=['allowed'],failScope=false,deny='position_function_denied',endpoint='admin-user-actions'}={}) {
  const calls=[];
  const auth={auth:{getUser:async()=>({data:{user:{id:'caller'}},error:null})},rpc:async name=>{
    calls.push(['auth.rpc',name]);
    assert.equal(name,'admin_list_user_roles');
    return {data:visible.map(user_id=>({user_id})),error:failScope?{message:'denied'}:null};
  }};
  const admin={
    rpc:async(name,args)=>{
      calls.push(['service.rpc',name,args]);
      if(name==='can_manage_users')return {data:true,error:null};
      assert.equal(name,'can_manage_user');
      return {data:{allowed:false,reason:deny},error:null};
    },
    auth:{admin:{
      listUsers:async()=>{calls.push(['listUsers']);return {data:{users:[{id:'allowed',email:'allowed@example.test'},{id:'foreign',email:'foreign@example.test'}]},error:null};},
      getUserById:async id=>{calls.push(['getUserById',id]);return {data:{user:{email:id+'@example.test'}}};},
    }},
    from:table=>{
      calls.push(['from',table]);
      assert.equal(table,'profiles');
      let selectedIds=[];
      const query={
        select:()=>query,not:()=>query,order:()=>query,
        in:(column,ids)=>{calls.push(['in',column,ids]);selectedIds=ids;return query;},
        then:(ok,bad)=>Promise.resolve({data:[{id:'allowed',full_name:'Test',deleted_at:new Date().toISOString(),deleted_by:'foreign'}].filter(r=>selectedIds.includes(r.id)),error:null}).then(ok,bad),
      };
      return query;
    },
  };
  let handle;
  const env={SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'test-public',SUPABASE_SERVICE_ROLE_KEY:'test-service'};
  compile(new URL(`../functions/${endpoint}/index.ts`,import.meta.url),name=>{
    if(name==='../_shared/user-hierarchy.ts')return hierarchy;
    if(name==='../_shared/user-visibility.ts')return visibility;
    if(name==='../_shared/cors.ts')return {corsFor:()=>({'Access-Control-Allow-Origin':'https://example.test'})};
    if(name.startsWith('https://esm.sh/'))return {createClient:(_url,key)=>key==='test-public'?auth:admin};
    if(name==='../_shared/buzon-por-borrar.ts')return {DIAS_DE_PAPELERA:30};
    // Mail/Zoho/admin helpers are unreachable in these authorization tests.
    return new Proxy({}, {get:(_target,key)=>{throw new Error('Unexpected side effect: '+name+':'+String(key));}});
  },{Deno:{env:{get:key=>env[key]},serve:handler=>{handle=handler;}}});
  const request=body=>handle(new Request('https://example.test/function',{method:'POST',headers:{Authorization:'Bearer test-token','Content-Type':'application/json'},body:JSON.stringify(body)}));
  return {request,calls};
}

for(const action of ['create_user','migrate_email','reset_password','remove_role','delete_user','restore_user','purge_user','update_profile']) {
  const {request,calls}=setup();
  const response=await request({action,user_id:'target',role:'employee'});
  assert.equal(response.status,403,action);
  assert.equal((await response.json()).reason,'position_function_denied');
  assert.equal(calls.some(c=>['from','listUsers','getUserById'].includes(c[0])),false,action+' must not reach data or side effects');count++;
}
for(const action of ['assign_role','remove_role']) {
  const {request,calls}=setup({endpoint:'manage-user-roles'});
  const response=await request({action,user_id:'target',role:'employee'});
  assert.equal(response.status,403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://example.test');
  assert.equal(calls.some(c=>c[0]==='from'),false);count++;
}
{
  const {request,calls}=setup();
  const response=await request({action:'list_users'});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{users:[{id:'allowed',email:'allowed@example.test'}]});
  assert.equal(calls.filter(c=>c[0]==='auth.rpc').length,1);count++;
}
{
  const {request,calls}=setup();
  const response=await request({action:'list_deleted_users'});
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.users.length,1);
  assert.equal(data.users[0].id,'allowed');
  assert.equal(data.users[0].deleted_by,null);
  assert.equal(data.users[0].deleted_by_name,null);
  assert.equal(calls.filter(c=>c[0]==='getUserById').length,1);
  assert.equal(calls.some(c=>c[0]==='getUserById'&&c[1]==='foreign'),false);count++;
}
for(const action of ['list_users','list_deleted_users']) {
  const {request,calls}=setup({visible:[]});
  assert.deepEqual((await (await request({action})).json()).users,[]);
  assert.equal(calls.some(c=>['from','listUsers','getUserById'].includes(c[0])),false);count++;
  const failed=setup({failScope:true});
  assert.equal((await failed.request({action})).status,500);
  assert.equal(failed.calls.some(c=>['from','listUsers','getUserById'].includes(c[0])),false);count++;
}
console.log(`${count} pruebas de rutas Edge: autorización antes de efectos, listados limitados y fallos cerrados.`);
