import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const {rpc} = vi.hoisted(() => ({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
vi.mock('@/hooks/useLanguage',()=>({useLanguage:()=>({t:(key:string)=>key,language:'es'}),useLanguageSiHay:()=>({t:(key:string)=>key})}));
vi.mock('@/hooks/useEsDueno',()=>({useEsDueno:()=>({esDueno:true,cargando:false})}));
vi.mock('@/hooks/usePausas',()=>({useModalidades:()=>({data:{modalidades:[]}})}));
import { PermisosDe, type Posicion } from '@/pages/ajustes/Posiciones';
const base:Posicion={id:'p1',nombre:'Supervisor',descripcion:null,activa:true,acceso_total:false,todas_creadoras:false,checks:{},alcances:{},orden:1,updated_at:'2026-11-22T10:00:00Z'};
function pintar(pos=base){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><PermisosDe pos={pos} personas={[]} asignaciones={[]} onVolver={vi.fn()}/></QueryClientProvider>)}
const marcar=()=>fireEvent.click(screen.getByRole('checkbox',{name:/posiciones.c.llamar/}));
beforeEach(()=>{cleanup();rpc.mockReset();rpc.mockResolvedValue({data:{...base,checks:{'N:msg.llamar':true},updated_at:'2026-11-22T11:00:00Z'},error:null});});
describe('Aplicar permisos explícitamente',()=>{
 it('editar y revisar no escribe; confirmar hace una sola petición con versión',async()=>{
  pintar();marcar();expect(rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'posiciones.revision.revisar'}));
  expect(rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'posiciones.revision.aplicar'}));
  await waitFor(()=>expect(rpc).toHaveBeenCalledTimes(1));
  expect(rpc).toHaveBeenCalledWith('posicion_aplicar_revision',expect.objectContaining({_revision:base.updated_at,_cambios:expect.objectContaining({checks:{'N:msg.llamar':true}})}));
 });
 it('descartar no cambia los permisos guardados',()=>{pintar();marcar();fireEvent.click(screen.getByRole('button',{name:'posiciones.revision.descartar'}));expect(rpc).not.toHaveBeenCalled();expect(screen.getByRole('checkbox',{name:/posiciones.c.llamar/})).toHaveAttribute('data-state','unchecked');});
 it('una falla conserva los cambios para revisarlos',async()=>{
  rpc.mockResolvedValue({data:null,error:{message:'Conflicto de versión'}});pintar();marcar();fireEvent.click(screen.getByRole('button',{name:'posiciones.revision.revisar'}));fireEvent.click(screen.getByRole('button',{name:'posiciones.revision.aplicar'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'posiciones.revision.aplicar'})).not.toBeDisabled());
  expect(screen.getByRole('dialog')).toBeInTheDocument();expect(rpc).toHaveBeenCalledTimes(1);
 });
});
