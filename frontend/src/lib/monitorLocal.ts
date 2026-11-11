import { useSyncExternalStore } from "react";

// LO QUE EL MONITOR DE COWORK LE CUENTA A LA PROPIA PERSONA (Alvaro, 10/11/2026).
// Los empleados decían «cuando me voy a otro lado ya no me toma pantallazos»:
// sí se los tomaba, pero el aviso solo sale dentro de Maven. Aquí se anota cada
// pantallazo para que la llamada (también en la ventanita flotante y en la
// ventana del sistema) diga «monitoreo activo · hace X» y, al volver a Maven,
// se le cuente cuántos se tomaron mientras estaba en otra app.

let ultimo: number | null = null;
let mientrasAfuera = 0;
const escuchas = new Set<() => void>();

const afuera = () => typeof document !== "undefined" && document.visibilityState === "hidden";

/** Se tomó un pantallazo (lo llama useMonitorCamara). */
export function anotarPantallazo(ahora = Date.now()): void {
  ultimo = ahora;
  if (afuera()) mientrasAfuera += 1;
  for (const f of escuchas) f();
}

export function ultimoPantallazo(): number | null {
  return ultimo;
}

/** Cuántos se tomaron con Maven en segundo plano; lo deja en cero. */
export function tomarLosDeAfuera(): number {
  const n = mientrasAfuera;
  mientrasAfuera = 0;
  return n;
}

function suscribir(f: () => void): () => void {
  escuchas.add(f);
  return () => { escuchas.delete(f); };
}

/** El último pantallazo (ms), para pintar «hace X». */
export function useUltimoPantallazo(): number | null {
  return useSyncExternalStore(suscribir, ultimoPantallazo, () => null);
}

/** Para los bancos: vuelve a cero. */
export function reiniciarMonitorLocal(): void {
  ultimo = null;
  mientrasAfuera = 0;
}
