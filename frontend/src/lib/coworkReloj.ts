// El reloj de Cowork tal como se MUESTRA (fase 3 del reemplazo de Hubstaff).
// El servidor manda con cada latido cuánto lleva la persona hoy y en qué
// estado está; acá se convierte eso en el número que corre en pantalla y en
// la frase que explica por qué está detenido. Puro, sin React.
import type { EstadoTiempo } from "@/lib/coworkTiempoRegla";

export type { EstadoTiempo };

export interface RelojCowork {
  estado: EstadoTiempo;
  /** Segundos con el reloj corriendo hoy, según el servidor, al momento `en`. */
  segundosHoy: number;
  /** Epoch ms de cuando el servidor lo dijo. */
  en: number;
}

/** Los segundos que hay que MOSTRAR ahora: lo que dijo el servidor más lo que
 *  corrió desde entonces si el reloj sigue andando. Entre latidos (30 s) el
 *  cronómetro no se queda quieto. */
export function segundosMostrados(reloj: RelojCowork | null, ahora: number): number {
  if (!reloj) return 0;
  const base = Math.max(0, reloj.segundosHoy);
  if (reloj.estado !== "activo") return base;
  return base + Math.max(0, Math.floor((ahora - reloj.en) / 1000));
}

/** "3h 42m 07s", "42m 07s", "0m 05s". Con segundos (pedido de Jhon, 07/09):
 *  ver el segundero correr es lo que le dice a la persona que el reloj está
 *  vivo y no colgado. */
export function formatoReloj(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const ss = `${String(r).padStart(2, "0")}s`;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m ${ss}` : `${m}m ${ss}`;
}

/** Por qué está detenido, dicho a la persona. `null` cuando corre. */
export function motivoDetenido(estado: EstadoTiempo | null | undefined): string | null {
  switch (estado) {
    case "pausa": return "en pausa";
    case "sin_camara": return "cámara apagada";
    case "sin_pantalla": return "sin compartir pantalla";
    case "fuera_de_camara": return "no estás frente a la cámara";
    case "activo": return null;
    default: return null;
  }
}

/** La misma frase pero en tercera persona, para el tablero del supervisor. */
export function motivoDetenidoDeOtro(estado: EstadoTiempo | null | undefined): string | null {
  switch (estado) {
    case "pausa": return "en pausa";
    case "sin_camara": return "cámara apagada";
    case "sin_pantalla": return "sin pantalla";
    case "fuera_de_camara": return "fuera de cámara";
    default: return null;
  }
}

const ESTADOS = new Set<string>(["activo", "pausa", "sin_camara", "sin_pantalla", "fuera_de_camara"]);

/** Arma el reloj desde lo que llegó por presencia (campos sueltos, cualquiera
 *  puede faltar si el otro lado corre un bundle viejo). */
export function relojDesdePresencia(ms: { relojEstado?: string | null; relojSegundosHoy?: number | null; relojEn?: number | null } | undefined): RelojCowork | null {
  if (!ms || !ms.relojEstado || !ESTADOS.has(ms.relojEstado) || typeof ms.relojSegundosHoy !== "number" || typeof ms.relojEn !== "number") return null;
  return { estado: ms.relojEstado as EstadoTiempo, segundosHoy: ms.relojSegundosHoy, en: ms.relojEn };
}
