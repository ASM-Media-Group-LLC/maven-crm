// LA LLAMADA AVISA QUE SIGUE VIVA (Alvaro, 18/11/2026: «se escondió la llamada
// y no encontraba dónde colgar»).
//
// La llamada vive en su propia pestaña (en la app de computador, su propia
// ventana). Al volver a Maven quedaba detrás y no había cómo volver ni colgar.
// Ahora la pestaña de la llamada avisa por un canal del navegador que sigue
// viva, y Maven muestra arriba una barra fija «En llamada con Grace · Volver ·
// Colgar». Los botones de la barra le piden a la pestaña de la llamada que se
// muestre o que cuelgue.
//
// BroadcastChannel: mismo origen, mismo navegador (o la misma app). No pasa por
// el servidor ni sale del equipo.

export const CANAL_LLAMADA = "maven-llamada-en-curso";

/** Cada cuánto la llamada dice «sigo acá». Si deja de decirlo, la barra se va. */
export const LATIDO_LLAMADA_MS = 2_000;
/** Sin noticias de la llamada durante este tiempo, se da por terminada. */
export const LLAMADA_VENCE_MS = 7_000;

export type MensajeLlamada =
  | { tipo: "en-llamada"; sala: string; nombre: string; desde: number }
  | { tipo: "colgo"; sala: string }
  | { tipo: "colgar"; sala: string }
  | { tipo: "mostrar"; sala: string };

export function abrirCanalDeLlamada(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "function" ? new BroadcastChannel(CANAL_LLAMADA) : null;
  } catch {
    return null;
  }
}

/** ¿El mensaje tiene la forma que esperamos? (Lo puede mandar otra pestaña vieja.) */
export function esMensajeDeLlamada(m: unknown): m is MensajeLlamada {
  if (!m || typeof m !== "object") return false;
  const x = m as { tipo?: unknown; sala?: unknown };
  if (typeof x.sala !== "string" || !x.sala) return false;
  if (x.tipo === "en-llamada") {
    const y = m as { nombre?: unknown; desde?: unknown };
    return typeof y.nombre === "string" && typeof y.desde === "number";
  }
  return x.tipo === "colgo" || x.tipo === "colgar" || x.tipo === "mostrar";
}

export interface LlamadaVista {
  sala: string;
  nombre: string;
  desde: number;
  vistaEn: number;
}

/** Aplica un mensaje a lo que se sabe de las llamadas abiertas. */
export function aplicarMensaje(antes: Record<string, LlamadaVista>, m: MensajeLlamada, ahora: number): Record<string, LlamadaVista> {
  if (m.tipo === "en-llamada") return { ...antes, [m.sala]: { sala: m.sala, nombre: m.nombre, desde: m.desde, vistaEn: ahora } };
  if (m.tipo === "colgo") {
    if (!antes[m.sala]) return antes;
    const { [m.sala]: _fuera, ...resto } = antes;
    return resto;
  }
  return antes;
}

/** Las llamadas que siguen vivas (dijeron «sigo acá» hace poco), la más nueva primero. */
export function llamadasVivas(todas: Record<string, LlamadaVista>, ahora: number): LlamadaVista[] {
  return Object.values(todas)
    .filter((l) => ahora - l.vistaEn <= LLAMADA_VENCE_MS)
    .sort((a, b) => b.desde - a.desde);
}

/** mm:ss (o h:mm:ss) de lo que lleva la llamada. */
export function duracion(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}
