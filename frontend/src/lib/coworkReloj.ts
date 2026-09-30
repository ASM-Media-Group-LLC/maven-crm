// El reloj de Cowork tal como se MUESTRA (fase 3 del reemplazo de Hubstaff).
// El servidor manda con cada latido cuánto lleva la persona hoy y en qué
// estado está; acá se convierte eso en el número que corre en pantalla y en
// la frase que explica por qué está detenido. Puro, sin React.
import { cuentaComoTrabajo, ESTADOS_TIEMPO, type EstadoTiempo } from "@/lib/coworkTiempoRegla";

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
  // Corre en lo que se paga: la regla es UNA (cuentaComoTrabajo), no una copia.
  if (!cuentaComoTrabajo(reloj.estado)) return base;
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

// Una entrada POR ESTADO, y no un switch con `default`: con el switch, un estado
// nuevo sin frase caía en el default y el reloj se veía detenido sin motivo. Con
// la tabla, olvidarse uno no compila. null = el reloj corre.
const MOTIVO_PROPIO: Record<EstadoTiempo, string | null> = {
  activo: null,
  meet: null,
  // Una caída pagada (hasta 10 min por hora): el reloj corre (el cartel de la
  // llamada es el que le avisa que se cayó la sala).
  sin_conexion: null,
  pausa: "en pausa",
  sin_camara: "cámara apagada",
  sin_pantalla: "sin compartir pantalla",
  fuera_de_camara: "no estás frente a la cámara",
  sin_conexion_larga: "sin conexión a la sala",
};

const MOTIVO_DE_OTRO: Record<EstadoTiempo, string | null> = {
  activo: null,
  meet: null,
  sin_conexion: null,
  pausa: "en pausa",
  sin_camara: "cámara apagada",
  sin_pantalla: "sin pantalla",
  fuera_de_camara: "fuera de cámara",
  sin_conexion_larga: "sin conexión",
};

/** Por qué está detenido, dicho a la persona. `null` cuando corre. */
export function motivoDetenido(estado: EstadoTiempo | null | undefined): string | null {
  return estado ? MOTIVO_PROPIO[estado] ?? null : null;
}

/** La misma frase pero en tercera persona, para el tablero del supervisor. */
export function motivoDetenidoDeOtro(estado: EstadoTiempo | null | undefined): string | null {
  return estado ? MOTIVO_DE_OTRO[estado] ?? null : null;
}

// Sale de la regla, no se copia a mano: una lista a mano descartaba en silencio
// los estados nuevos y el supervisor veía a la persona sin reloj.
const ESTADOS = new Set<string>(ESTADOS_TIEMPO);

/** Arma el reloj desde lo que llegó por presencia (campos sueltos, cualquiera
 *  puede faltar si el otro lado corre un bundle viejo). */
export function relojDesdePresencia(ms: { relojEstado?: string | null; relojSegundosHoy?: number | null; relojEn?: number | null } | undefined): RelojCowork | null {
  if (!ms || !ms.relojEstado || !ESTADOS.has(ms.relojEstado) || typeof ms.relojSegundosHoy !== "number" || typeof ms.relojEn !== "number") return null;
  return { estado: ms.relojEstado as EstadoTiempo, segundosHoy: ms.relojSegundosHoy, en: ms.relojEn };
}
