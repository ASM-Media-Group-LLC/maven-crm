// Reproducible source inventory. References are evidence to inspect, NOT proof
// that a permission is enforced at every entry point. Never reads .env files.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import ts from 'typescript';

const root=resolve(import.meta.dirname,'../..');
const parse=(file,source=readFileSync(resolve(root,file),'utf8'))=>ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
const walk=(node,fn)=>{fn(node);ts.forEachChild(node,n=>walk(n,fn));};
const strings=node=>{const values=[];walk(node,n=>{if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))values.push(n.text);});return values;};
const catalogFile=parse('frontend/src/lib/posiciones/catalogo.ts');
let catalog;
walk(catalogFile,n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(catalogFile)==='CATALOGO_POSICIONES')catalog=JSON.parse(n.initializer.getText(catalogFile));});
if(!catalog)throw new Error('Missing permission catalog');
const labels={};
walk(parse('frontend/src/lib/i18n/posiciones.ts'),n=>{
  if(ts.isPropertyAssignment(n)&&ts.isStringLiteral(n.name)&&ts.isObjectLiteralExpression(n.initializer)) {
    const es=n.initializer.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText().replaceAll('"','')==='es');
    if(es&&ts.isStringLiteral(es.initializer))labels[n.name.text]=es.initializer.text;
  }
});
const permissions=catalog.flatMap(s=>s.grupos.flatMap(g=>g.filas.flatMap(f=>f.funciones.map(a=>({
  key:a.clave,label:labels[a.etiqueta]??a.etiqueta,section:labels[s.etiqueta]??s.seccion,
  group:labels[g.etiqueta]??g.grupo,row:f.fila,scoped:f.datos==='tres',new:a.nueva,
  evidence:[],verification:a.clave.startsWith('N:usr.')?'users_local_tests':a.nueva?'pending':'shared_authorizer_tested',
})))));
const byKey=new Map(permissions.map(p=>[p.key,p]));
const files=[];
const collect=dir=>{for(const e of readdirSync(resolve(root,dir),{withFileTypes:true})) {
  const file=dir+'/'+e.name;
  if(e.isDirectory()) {if(!['test','__tests__','node_modules','dist'].includes(e.name))collect(file);}
  else if(/\.(ts|tsx)$/.test(file)&&! /\.(test|spec)\./.test(file))files.push(file);
}};
collect('frontend/src');collect('supabase/functions');
const resources=[];
for(const file of files) {
  if(file.includes('/lib/i18n/')||file.includes('/lib/posiciones/catalogo'))continue;
  const sf=parse(file),entry={file,imports:[],tables:[],rpcs:[],edges:[],permission_calls:[]};
  walk(sf,n=>{
    if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier))entry.imports.push(n.moduleSpecifier.text);
    if(ts.isStringLiteral(n)&&n.text.startsWith('N:')&&byKey.has(n.text))byKey.get(n.text).evidence.push({file,line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1,kind:'literal_reference'});
    if(!ts.isCallExpression(n)||!ts.isPropertyAccessExpression(n.expression)&&!ts.isIdentifier(n.expression))return;
    const name=ts.isIdentifier(n.expression)?n.expression.text:n.expression.name.text;
    const first=n.arguments[0],value=first&&ts.isStringLiteral(first)?first.text:null;
    if(value&&['from','rpc','invoke'].includes(name))entry[{from:'tables',rpc:'rpcs',invoke:'edges'}[name]].push(value);
    if(['canAccess','explicitPermission','tieneFuncion','canFunction'].includes(name))entry.permission_calls.push({method:name,arguments:strings(n),line:sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1});
  });
  for(const field of ['imports','tables','rpcs','edges'])entry[field]=[...new Set(entry[field])];
  resources.push(entry);
}
// Historical SQL references are listed separately: a newer migration can replace
// the same function, so a matching string is not proof of the deployed behavior.
for(const file of readdirSync(resolve(root,'supabase/migrations')).filter(f=>f.endsWith('.sql'))) {
  const sql=readFileSync(resolve(root,'supabase/migrations',file),'utf8');
  for(const p of permissions.filter(p=>p.new)) if(sql.includes("'"+p.key+"'")) {
    p.evidence.push({file:'supabase/migrations/'+file,kind:'historical_sql_reference'});
  }
}
const app=parse('frontend/src/App.tsx'),components=new Map();
walk(app,n=>{
  if(ts.isImportDeclaration(n)&&n.importClause?.name&&ts.isStringLiteral(n.moduleSpecifier))components.set(n.importClause.name.text,n.moduleSpecifier.text);
  if(ts.isVariableDeclaration(n)&&n.initializer) {
    const path=strings(n.initializer).find(v=>v.startsWith('./pages/')||v.startsWith('@/pages/'));
    if(path)components.set(n.name.getText(app),path);
  }
});
const attr=(opening,name)=>{
  const a=opening.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.text===name);
  return a?.initializer?(ts.isStringLiteral(a.initializer)?a.initializer.text:a.initializer.getText(app)):null;
};
const routes=[];
function visit(node,parents=[]) {
  const opening=ts.isJsxElement(node)?node.openingElement:ts.isJsxSelfClosingElement(node)?node:null;
  let next=parents;
  if(opening?.tagName.getText(app)==='Route') {
    const path=attr(opening,'path'),element=attr(opening,'element')??'';
    const names=[...element.matchAll(/<([A-Z]\w+)/g)].map(m=>m[1]);
    const chain=parents.concat({path,components:names});
    if(path||opening.attributes.properties.some(p=>p.name?.getText(app)==='index')) {
      routes.push({path:path??'(index)',line:app.getLineAndCharacterOfPosition(opening.getStart(app)).line+1,
        parents:parents.map(p=>p.path).filter(Boolean),wrappers:parents.flatMap(p=>p.components),
        components:names.map(name=>({name,source:components.get(name)??null})),
        module:element.match(/\bmodule="([^"]+)"/)?.[1]??null,
        submodule:element.match(/\bsubmodule="([^"]+)"/)?.[1]??null,
        runtime_verified:false});
    }
    next=chain;
  }
  ts.forEachChild(node,n=>visit(n,next));
}
visit(app);
const counts={sections:catalog.length,groups:catalog.reduce((n,s)=>n+s.grupos.length,0),rows:catalog.reduce((n,s)=>n+s.grupos.reduce((sum,g)=>sum+g.filas.length,0),0),permissions:permissions.length,new_permissions:permissions.filter(p=>p.new).length,routes:routes.length,source_files:resources.length};
const result={generated_at:new Date().toISOString(),scope:'Source map of Maven routes, permission catalog, frontend and Edge dependencies. Not a visual recording or full endpoint audit.',counts,
  live_ui:{Maven:'not captured',Infloww:'not visited',BLU:'not visited'},
  publication:{production_changed:false,homepage_changed:false},
  known_gaps:[
    'N:usr.asignar is tested in legacy role assignment; position/person assignment remains owner-only and needs a unified flow.',
    'N:pos.* delegation remains owner-only in UI and RLS. Enabling these checkboxes is not yet sufficient.',
    'Scope enforcement is tested for Usuarios only; other modules still need RLS and action tests.',
    'Shared authorizer tests do not prove that all endpoints call it.',
    'Some newer functions have SQL references but still need complete flow tests.',
    'Actual app screens must be captured before using them to rebuild homepage demonstrations.',
  ],permissions,routes,resources};
const output=resolve(root,process.argv[2]??'docs/audits/maven-role-map.json');
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output:relative(root,output),...counts,new_keys_without_reference:permissions.filter(p=>p.new&&!p.evidence.length).map(p=>p.key)},null,2));
