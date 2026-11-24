import { describe, it, expect } from 'vitest';
import { cambiosDePosicion } from '@/lib/posiciones/cambios';
const base = { checks: {'N:msg.llamar': true}, alcances: {}, acceso_total: false, todas_creadoras: false };
describe('revisión de permisos', () => {
  it('muestra revocaciones y cambios de alcance antes de aplicar', () => {
    const changes = cambiosDePosicion(base, {...base, checks: {}, alcances: {Salas:'self'}});
    expect(changes).toContainEqual(expect.objectContaining({clave:'N:msg.llamar',antes:true,despues:false}));
    expect(changes).toContainEqual(expect.objectContaining({clave:'alcance:Salas',antes:'all',despues:'self'}));
  });
  it('no confunde falso con casilla ausente', () => {
    expect(cambiosDePosicion({...base,checks:{}},{...base,checks:{'N:msg.llamar':false}})).toEqual([]);
  });
  it('muestra acceso total y permisos individuales al mismo tiempo', () => {
    expect(cambiosDePosicion(base,{...base,acceso_total:true,checks:{}}).map(c=>c.clave)).toEqual(expect.arrayContaining(['acceso_total','N:msg.llamar']));
  });
});
