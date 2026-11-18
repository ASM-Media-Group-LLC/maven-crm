// LA APP NO TRABA LOS COMPUTADORES FLOJOS (Alvaro, 17/11/2026).
//
// En el equipo hay 3 computadores de 4 GB y 11 de 8 GB; la app de Maven usa
// ~0,9–1,4 GB. En esos equipos (8 GB o menos) la app entra en MODO LIVIANO:
//  · la cámara propia sale en el perfil liviano (lib/perfilDeCamara.ts);
//  · las cámaras de los demás llegan en calidad media como mucho;
//  · las que no se ven ya no se bajan (adaptiveStream de LiveKit, siempre);
//  · si la app pasa de TOPE_MEMORIA_MB, se refresca sola en un momento quieto:
//    fuera de llamada o en pausa, sin nada a medio escribir, y como mucho una
//    vez cada ESPERA_ENTRE_REFRESCOS_MS (nunca en bucle).
// En equipos de 16 GB o más todo sigue igual.

export const GB_EQUIPO_FLOJO = 8;
export const TOPE_MEMORIA_MB = 1200;
export const ESPERA_ENTRE_REFRESCOS_MS = 30 * 60_000;
export const MIRAR_MEMORIA_CADA_MS = 60_000;
export const CLAVE_ULTIMO_REFRESCO = "maven.app.ultimoRefrescoPorMemoria";

/** ¿Es un equipo de 8 GB o menos? Sin dato, no (no se le baja la calidad a nadie sin evidencia). */
export function equipoFlojo(equipoGb: number | null | undefined): boolean {
  return typeof equipoGb === "number" && Number.isFinite(equipoGb) && equipoGb > 0 && equipoGb <= GB_EQUIPO_FLOJO + 0.5;
}

/** ¿Toca refrescar la app ahora por memoria? */
export function debeRefrescarPorMemoria(p: {
  ramAppMb: number | null | undefined;
  enLlamada: boolean;
  enPausa: boolean;
  escribiendo: boolean;
  ultimoRefresco: number | null;
  ahora: number;
}): boolean {
  if (typeof p.ramAppMb !== "number" || p.ramAppMb <= TOPE_MEMORIA_MB) return false;
  if (p.escribiendo) return false;
  if (p.enLlamada && !p.enPausa) return false;
  if (p.ultimoRefresco !== null && p.ahora - p.ultimoRefresco < ESPERA_ENTRE_REFRESCOS_MS) return false;
  return true;
}

// El modo liviano vive fuera de React (lo leen la llamada y el perfil de cámara
// en cada tic), igual que la pausa de Cowork (lib/coworkPausa.ts).
let liviano = false;
export function marcarModoLiviano(valor: boolean): void {
  liviano = valor;
}
export function modoLivianoActivo(): boolean {
  return liviano;
}
