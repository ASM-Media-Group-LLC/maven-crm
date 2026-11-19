// «MOMENTO PRIVADO» (Alvaro, 19/11/2026).
//
// Si el puesto pide cámara y pantalla, la persona igual puede apagarlas: nadie
// se las prende a la fuerza («llegó la mamá, están hablando… no lo puedes
// obligar»). Con este botón:
//   · Un toque apaga cámara, micrófono y pantalla (el mismo bus de la pausa).
//   · Argos no le insiste mientras dure, ni se lo anota, ni le avisa al jefe.
//   · No es pausa: el tiempo sigue siendo de trabajo y GASTA de sus minutos de
//     gracia del turno (15 de cámara y 15 de pantalla). Al acabarse, termina
//     solo y Argos vuelve a pedir la cámara como siempre.
//
// Vive fuera de React, igual que la pausa: los avisos corren dentro de la
// llamada, que sobrevive a la página de Cowork, y lo consultan en cada tic.
// Sobrevive a un F5 en la misma pestaña (sessionStorage); si el almacenamiento
// no está, funciona igual hasta recargar.

import { pedirSoltarSinPrender } from "@/lib/ordenesDePausa";

const CLAVE = "maven-momento-privado-hasta";

let hasta: number | null = leerGuardado();
const oyentes = new Set<() => void>();

function leerGuardado(): number | null {
  try {
    const v = Number(sessionStorage.getItem(CLAVE));
    return Number.isFinite(v) && v > Date.now() ? v : null;
  } catch {
    return null;
  }
}

function guardar(v: number | null): void {
  try {
    if (v === null) sessionStorage.removeItem(CLAVE);
    else sessionStorage.setItem(CLAVE, String(v));
  } catch { /* sin almacenamiento: dura hasta recargar */ }
}

function avisar(): void {
  for (const cb of oyentes) {
    try { cb(); } catch { /* un oyente roto no frena a los demás */ }
  }
}

/** ¿Está en un momento privado ahora? Si se le acabó el tiempo, deja de estarlo. */
export function estaEnMomentoPrivado(ahora = Date.now()): boolean {
  if (hasta === null) return false;
  if (ahora < hasta) return true;
  // Se acabó solo: la llamada olvida lo apagado sin prenderlo (Argos lo pide).
  hasta = null;
  guardar(null);
  pedirSoltarSinPrender();
  avisar();
  return false;
}

/** Hasta cuándo dura, tal cual está guardado (sin vencerlo): para React
 *  (useSyncExternalStore pide una lectura pura). */
export function momentoPrivadoGuardado(): number | null {
  return hasta;
}

/** Hasta cuándo dura (epoch ms) o null. */
export function momentoPrivadoHasta(): number | null {
  return estaEnMomentoPrivado() ? hasta : null;
}

/** Empieza un momento privado por los minutos de gracia que le quedan. */
export function empezarMomentoPrivado(minutos: number, ahora = Date.now()): boolean {
  const m = Math.floor(Number(minutos) || 0);
  if (m <= 0) return false;
  hasta = ahora + m * 60_000;
  guardar(hasta);
  avisar();
  return true;
}

export function terminarMomentoPrivado(): void {
  if (hasta === null) return;
  hasta = null;
  guardar(null);
  avisar();
}

export function suscribirMomentoPrivado(cb: () => void): () => void {
  oyentes.add(cb);
  return () => { oyentes.delete(cb); };
}

/** Minutos que puede durar: lo que le queda de gracia en lo que su puesto pide
 *  (si pide las dos, la menor). Sin nada pedido no hace falta el botón (null). */
export function minutosDisponibles(
  exige: { camara: boolean; pantalla: boolean },
  queda: { camara: number; pantalla: number },
): number | null {
  const cuentan: number[] = [];
  if (exige.camara) cuentan.push(queda.camara);
  if (exige.pantalla) cuentan.push(queda.pantalla);
  if (cuentan.length === 0) return null;
  return Math.max(0, Math.min(...cuentan));
}
