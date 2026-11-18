// UN SOLO RELOJ DE UN SEGUNDO PARA LOS NÚMEROS QUE CORREN (17/11/2026).
//
// El Supervisor Hub tenía un `now` de 1 s en la página entera: cada segundo se
// redibujaban sus ~3.200 líneas (tarjetas, chips, la llamada) solo para mover
// los segunderos, y la página se trababa. Ahora la página se refresca cada
// pocos segundos y los segunderos son componentes chiquitos (RelojVivo.tsx)
// que leen ESTE reloj: un solo intervalo para todos, y solo se redibuja el
// número. Sin nadie mirando, el intervalo se apaga.
import { useSyncExternalStore } from "react";

let ahora = Date.now();
const oyentes = new Set<() => void>();
let intervalo: ReturnType<typeof setInterval> | null = null;

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  if (intervalo === null) {
    ahora = Date.now();
    intervalo = setInterval(() => {
      ahora = Date.now();
      oyentes.forEach((f) => f());
    }, 1000);
  }
  return () => {
    oyentes.delete(oyente);
    if (oyentes.size === 0 && intervalo !== null) {
      clearInterval(intervalo);
      intervalo = null;
    }
  };
}

/** La hora, actualizada cada segundo. Úsalo SOLO en componentes chiquitos. */
export function useAhoraCadaSegundo(): number {
  return useSyncExternalStore(suscribir, () => ahora, () => ahora);
}

/** Para pruebas: cuántos componentes están mirando el reloj. */
export function oyentesDelReloj(): number {
  return oyentes.size;
}
