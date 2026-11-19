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
// Equipos de más de 8 GB (19/11/2026): el tope de 1,2 GB se les aplicaba igual y
// la app se recargaba sola 3–4 veces al día con 5–12 GB libres; cada recarga
// reconectaba la llamada y la cámara quedaba en negro o apagada (43 de 104
// apagones de cámara del 18–19/11). Ahora solo si la app pasa de 3 GB Y al
// equipo le quedan menos de 2 GB libres.
export const TOPE_MEMORIA_GRANDE_MB = 3000;
export const LIBRE_MINIMO_GB = 2;
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
  equipoGb?: number | null;
  libreGb?: number | null;
  enLlamada: boolean;
  enPausa: boolean;
  enCowork?: boolean;
  escribiendo: boolean;
  ultimoRefresco: number | null;
  ahora: number;
}): boolean {
  if (typeof p.ramAppMb !== "number") return false;
  // Equipo flojo (8 GB o menos, o sin dato): el tope de siempre. Equipo grande:
  // solo si de verdad le falta memoria.
  const grande = typeof p.equipoGb === "number" && p.equipoGb > GB_EQUIPO_FLOJO + 0.5;
  if (grande) {
    if (p.ramAppMb <= TOPE_MEMORIA_GRANDE_MB) return false;
    if (typeof p.libreGb === "number" && p.libreGb >= LIBRE_MINIMO_GB) return false;
  } else if (p.ramAppMb <= TOPE_MEMORIA_MB) return false;
  if (p.escribiendo) return false;
  // Nunca con una llamada abierta, ni en pausa (19/11/2026): al volver de la
  // pausa la cámara arrancaba de cero y quedaba en negro o apagada. Tampoco en
  // Cowork aunque la llamada esté reconectando (un parpadeo no es «sin llamada»).
  if (p.enLlamada || p.enCowork) return false;
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
