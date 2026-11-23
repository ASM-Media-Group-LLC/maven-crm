import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const compile=(url,require,globals={})=>{
 const source=ts.transpileModule(readFileSync(url,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};runInNewContext(source,{exports,require,console,Request,Response,Headers,crypto,TextEncoder,TextDecoder,atob,btoa,...globals});return exports;
};
const logic=compile(new URL('../functions/drive/logica.ts',import.meta.url));
const signatures=compile(new URL('../functions/_shared/drive-firma.ts',import.meta.url));
function fixture(decision,error=null){
 let handler;const calls=[];
 const client={auth:{getUser:async()=>({data:{user:{id:'caller'}}})},rpc:async(fn,args)=>{
  calls.push([fn,args]);return fn==='posicion_decision'?{data:decision,error}:{data:null,error:null};
 },from:()=>{throw Error('File data must not be touched before permission is verified')}};
 compile(new URL('../functions/drive/index.ts',import.meta.url),name=>{
  if(name.includes('supabase-js'))return {createClient:()=>client};
  if(name.endsWith('cors.ts'))return {corsFor:()=>({})};
  if(name.endsWith('drive-firma.ts'))return signatures;
  if(name.endsWith('logica.ts'))return logic;
  throw Error('Unexpected import '+name);
 },{Deno:{serve:fn=>handler=fn,env:{get:k=>({DRIVE_NAS_URL:'https://nas.example.test',DRIVE_SECRETO:'test-only-key-'.repeat(4),SUPABASE_URL:'https://db.example.test',SUPABASE_ANON_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test-service'}[k])}},fetch:()=>{throw Error('No NAS requests allowed')}});
 return {calls,run:action=>handler(new Request('https://edge.example.test/drive',{method:'POST',headers:{Authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({action,id:'not-owned'})}))};
}
let n=0;
for(const action of ['subir_iniciar','subir_confirmar','restaurar_version','borrar_para_siempre']){
 for(const [data,error,status] of [[false,null,403],[true,{message:'database unavailable'},503],['true',null,503],[undefined,null,503]]){
  const f=fixture(data,error);const response=await f.run(action);assert.equal(response.status,status);n++;
  assert.equal(f.calls.length,1);n++;
  assert.equal(f.calls[0][1]._clave,action==='borrar_para_siempre'?'N:drive.borrar':'N:drive.subir');n++;
 }
}
for(const decision of [true,null]){
 const f=fixture(decision);const response=await f.run('borrar_para_siempre');
 assert.equal(response.status,403,'a position permission does not grant ownership');assert.match((await response.json()).error,/No puedes borrar/);n++;
 assert.equal(f.calls[1][0],'drive_mi_rol');n++;
}
console.log(`${n} pruebas del handler real de Drive: no firma subidas ni borra sin verificar permiso; conserva propiedad.`);
