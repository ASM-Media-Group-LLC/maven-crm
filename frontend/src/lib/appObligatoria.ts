// COWORK SOLO CON LA APP DE COMPUTADOR (Alvaro, 17/11/2026).
//
// «Esta plataforma vive de que alguien comparta pantalla todo el tiempo.» En el
// navegador compartir pide un clic cada vez y se corta con cada recarga; la app
// (desktop/) comparte la pantalla completa sola y vuelve sola. Por eso Cowork,
// en un computador, funciona solo dentro de la app, para TODOS (admins incluidos).
// Se prende por partes (tabla cowork_app_obligatoria): primero los probadores,
// después todos desde la fecha `desde`. Antes de esa fecha, en el navegador se
// avisa con la fecha.
//
// Afuera quedan los celulares (no comparten pantalla) y, si la configuración no
// se pudo leer, no se bloquea: cerrar Cowork por un error de red dejaría a todo
// el equipo afuera sin motivo.

export type ConfigAppObligatoria = { desde: string | null; probadores: string[] };

export type EstadoAppObligatoria =
  | { tipo: "libre" }
  | { tipo: "aviso"; desde: string }
  | { tipo: "obligatoria" };

export function decidirAppObligatoria(p: {
  enApp: boolean;
  puedeCompartir: boolean;
  config: ConfigAppObligatoria | null;
  userId: string | null;
  ahora: number;
}): EstadoAppObligatoria {
  if (p.enApp || !p.puedeCompartir || !p.config || !p.userId) return { tipo: "libre" };
  const desde = p.config.desde ? Date.parse(p.config.desde) : NaN;
  if (p.config.probadores.includes(p.userId)) return { tipo: "obligatoria" };
  if (Number.isFinite(desde) && p.ahora >= desde) return { tipo: "obligatoria" };
  if (Number.isFinite(desde)) return { tipo: "aviso", desde: p.config.desde! };
  return { tipo: "libre" };
}

export const DESCARGAS_APP = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/descargas`;
export const DESCARGA_MAC = `${DESCARGAS_APP}/Maven-Mac.dmg`;
export const DESCARGA_WINDOWS = `${DESCARGAS_APP}/Maven-Windows.exe`;
