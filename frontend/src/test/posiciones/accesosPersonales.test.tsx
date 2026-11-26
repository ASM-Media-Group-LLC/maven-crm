import {beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
vi.mock('@/hooks/useLanguage',()=>({useLanguage:()=>({t:(key:string,args?:Record<string,unknown>)=>args?.funcion?`${key} ${args.funcion}`:key,language:'es'})}));
import {EditorAccesosPersona} from '@/components/ajustes/EditorAccesosPersona';
import {accesosCombinados,alcancesCombinados,type PosicionPersonal} from '@/lib/posiciones/personas';
const positions:PosicionPersonal[]=[
 {id:'support',nombre:'Soporte',activa:true,acceso_total:false,checks:{'Messenger|*':true,'N:msg.llamar':true},updated_at:'2026-11-23T00:00:00Z'},
 {id:'ops',nombre:'Operaciones',activa:true,acceso_total:false,checks:{'Oficina|Documentos':true,'N:msg.llamar':true},updated_at:'2026-11-23T00:00:00Z'},
 {id:'inactive',nombre:'Inactiva',activa:false,acceso_total:true,checks:{},updated_at:'2026-11-23T00:00:00Z'},
];
const persona={id:'person1',full_name:'Persona ejemplo'};
const close=vi.fn();
function content(props={}){return <EditorAccesosPersona persona={persona} posiciones={positions} asignadas={['support']} onCerrar={close} {...props}/>}
function paint(props={}){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={client}>{content(props)}</QueryClientProvider>)}
const edit=()=>{fireEvent.click(screen.getByRole('checkbox',{name:'Operaciones'}));fireEvent.change(screen.getByRole('textbox'),{target:{value:'llamar'}});fireEvent.click(screen.getByRole('checkbox',{name:'posiciones.personas.editor.bloquearFuncion posiciones.c.llamar'}));};
// Solo cuentan las ESCRITURAS: al abrir, el editor lee cámara/pantalla (exigencias_de_varios).
const aplicaciones=()=>rpc.mock.calls.filter(c=>c[0]==='persona_aplicar_accesos');
beforeEach(()=>{cleanup();rpc.mockReset().mockResolvedValue({error:null});close.mockReset()});
describe('Asignación revisada y restricciones individuales',()=>{
 it('combina sin que el bloqueo pueda recuperarse desde otra posición o acceso total',()=>{
  expect(accesosCombinados(positions,['support','ops'],['N:msg.llamar'])).toMatchObject({'Messenger|*':true,'Oficina|Documentos':true,'N:msg.llamar':false});
  expect(accesosCombinados([{...positions[0],acceso_total:true}],['support'],['N:msg.llamar'])['N:msg.llamar']).toBe(false);
  expect(accesosCombinados(positions,['inactive'],[])['Oficina|Documentos']).toBe(false);
 });
 it('las casillas y Revisar no escriben; Aplicar envía una petición versionada',async()=>{
  paint();edit();expect(aplicaciones()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'posiciones.revision.revisar'}));expect(aplicaciones()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'posiciones.revision.aplicar'}));
  await waitFor(()=>expect(close).toHaveBeenCalledTimes(1));
  expect(aplicaciones()).toHaveLength(1);expect(rpc).toHaveBeenCalledWith('persona_aplicar_accesos',{
   _user_id:'person1',_revision:0,_posiciones:['support','ops'],_denegadas:['N:msg.llamar'],
   _versiones:Object.fromEntries(positions.map(p=>[p.id,p.updated_at])),
  });
 });
 it('cancelar no guarda ni modifica la configuración recibida',()=>{
  paint();edit();fireEvent.click(screen.getByRole('button',{name:'posiciones.dialogo.cancelar'}));
  expect(aplicaciones()).toHaveLength(0);expect(close).toHaveBeenCalledTimes(1);expect(positions[0].checks['N:msg.llamar']).toBe(true);
 });
 it('no permite asignar una posición desactivada',()=>{paint();expect(screen.getByRole('checkbox',{name:/Inactiva/})).toBeDisabled()});
 it('una falla conserva la propuesta y muestra el motivo',async()=>{
  rpc.mockResolvedValue({error:{message:'La posición cambió'}});paint();edit();fireEvent.click(screen.getByRole('button',{name:'posiciones.revision.revisar'}));fireEvent.click(screen.getByRole('button',{name:'posiciones.revision.aplicar'}));
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('La posición cambió'));
  expect(close).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'posiciones.revision.seguir'}));
  expect(screen.getByRole('checkbox',{name:'Operaciones'})).toBeChecked();
 });
 it('rechaza un cambio de versión de la persona sin reescribir el borrador',()=>{
  const client=new QueryClient();const view=render(<QueryClientProvider client={client}>{content()}</QueryClientProvider>);edit();
  view.rerender(<QueryClientProvider client={client}>{content({revision:{user_id:persona.id,revision:1,denegadas:[]}})}</QueryClientProvider>);
  expect(screen.getByRole('alert')).toHaveTextContent('posiciones.personas.editor.conflicto');expect(screen.getByRole('button',{name:'posiciones.revision.revisar'})).toBeDisabled();expect(aplicaciones()).toHaveLength(0);
 });
});

it('revisa ampliación de alcance aunque las funciones concedidas sean las mismas',()=>{
 const roles=positions.map(p=>({...p,alcances:{Mensajes:(p.id==='support'?'self':'all') as 'self'|'all'}}));
 expect(alcancesCombinados(roles,['support'],[])['N:msg.llamar']).toBe('self');
 expect(alcancesCombinados(roles,['support','ops'],[])['N:msg.llamar']).toBe('all');
 expect(alcancesCombinados(roles,['support','ops'],['N:msg.llamar'])['N:msg.llamar']).toBeNull();
 paint({posiciones:roles});fireEvent.click(screen.getByRole('checkbox',{name:'Operaciones'}));
 fireEvent.click(screen.getByRole('button',{name:'posiciones.revision.revisar'}));
 expect(screen.getByText('posiciones.datos.self → posiciones.datos.all')).toBeInTheDocument();
});
