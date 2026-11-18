// AVISO DE VERSIÓN NUEVA DE LA APP DE COMPUTADOR (Alvaro, 18/11/2026).
// Lo puro: qué mostrar y cuándo actualizar sola. Ver components/AvisoActualizacionApp.tsx.

export type EstadoAviso = "nada" | "ofrecer" | "ofrecerEnLlamada";

export function estadoDelAviso(version: string | null, enLlamada: boolean): EstadoAviso {
  if (!version) return "nada";
  return enLlamada ? "ofrecerEnLlamada" : "ofrecer";
}

/** Se actualiza sola solo al COLGAR: estaba en llamada y ya no. */
export const tocaActualizarAlColgar = (version: string | null, antes: boolean, ahora: boolean) =>
  !!version && antes && !ahora;
