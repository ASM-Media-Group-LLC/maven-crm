import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const exports={};
runInNewContext(ts.transpileModule(readFileSync(new URL('../functions/cowork-session/permisos-posicion.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
let n=0;
const verify=exports.revisarPosicion;
for(const action of ['addRoom','updateRoom','closeRoom','getHostCode','updateSession','setAlertRules','endSession']){
 const calls=[];const r=await verify({rpc:async(fn,a)=>{calls.push(a._clave);return {data:a._clave!=='N:cowork.abrir',error:null}}},'caller',action,{});
 assert.equal(r.status,403);assert.equal(calls.includes('N:cowork.abrir'),true);n+=2;
}
for(const [data,error,status] of [[false,null,403],[null,null,403],[true,{message:'db unavailable'},503],['true',null,503]]){
 const r=await verify({rpc:async(fn,a)=>({data:a._clave==='N:cowork.miembros'?data:true,error:a._clave==='N:cowork.miembros'?error:null})},'caller','asignarSala',{});
 assert.equal(r.status,status);n++;
}
assert.equal((await verify({rpc:async(fn,a)=>({data:a._clave!=='N:cowork.abrir',error:null})},'caller','asignarSala',{})).ok,true);n++;
for(const purpose of ['preview_room','monitor_room','incognito_room']){
 assert.equal((await verify({rpc:async()=>({data:true,error:null})},'caller','issueLiveKitToken',{purpose,sessionId:'session',roomId:'room'})).ok,true);n++;
 for(const [data,error,status] of [[false,null,403],[true,{message:'db unavailable'},503],['true',null,503]]){
  const r=await verify({rpc:async(fn)=>({data:fn==='cowork_posicion_ver_sala'?data:true,error:fn==='cowork_posicion_ver_sala'?error:null})},'caller','issueLiveKitToken',{purpose,sessionId:'session',roomId:'room'});
  assert.equal(r.status,status);n++;
 }
 const r=await verify({rpc:async(fn,a)=>({data:a._clave==='N:cowork.verpantallas'?false:true,error:null})},'caller','issueLiveKitToken',{purpose});assert.equal(r.status,403);n++;
}
for(const action of ['leaveRoom','leaveSession','incognitoLeave','salirDeMeetGrupal','endBreak']){
 assert.equal((await verify({rpc:()=>{throw Error('Exit must stay available')}},'caller',action,{})).ok,true);n++;
}
for(const data of [null,true])assert.equal((await verify({rpc:async()=>({data,error:null})},'caller','requestHost',{})).ok,true),n++;
assert.equal((await verify({rpc:async()=>({data:false,error:null})},'caller','latido',{})).status,403);n++;
console.log(`${n} pruebas de Cowork: administrar, supervisar, fallos de autorización y salir tras revocación.`);
