// UN SOLO RELOJ DE UN SEGUNDO PARA LOS NÚMEROS QUE CORREN (17/11/2026).
//
// El Supervisor Hub tenía un `now` de 1 s en la página entera: cada segundo se
// redibujaban sus ~3.200 líneas (tarjetas, chips, la llamada) solo para mover
// los segunderos, y la página se trababa. Ahora la página se refresca cada
// pocos segundos y los segunderos son componentes chiquitos (RelojVivo.tsx)
// que leen ESTE reloj: un solo intervalo para todos, y solo se redibuja el
// número. Sin nadie mirando, el intervalo se apaga.
//
// Con la página fuera de la vista (pestaña oculta o app minimizada) el reloj va
// cada 30 s: nadie ve el segundero, pero lo que depende de la hora (el «¿Sigues?»
// del turno, una llamada que venció) sigue llegando. Al volver, salta a la hora
// al instante y retoma el segundo (19/11/2026, modo liviano).
import { useSyncExternalStore } from "react";
import { alCambiarALaVista, paginaALaVista } from "@/lib/modoLiviano";

export const TIC_A_LA_VISTA_MS = 1000;
export const TIC_OCULTA_MS = 30_000;

let ahora = Date.now();
const oyentes = new Set<() => void>();
let intervalo: ReturnType<typeof setInterval> | null = null;
let soltarVista: (() => void) | null = null;

function avisar() {
  ahora = Date.now();
  oyentes.forEach((f) => f());
}

function armar() {
  if (intervalo !== null) clearInterval(intervalo);
  intervalo = setInterval(avisar, paginaALaVista() ? TIC_A_LA_VISTA_MS : TIC_OCULTA_MS);
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  if (intervalo === null) {
    ahora = Date.now();
    armar();
    soltarVista = alCambiarALaVista((aLaVista) => {
      if (aLaVista) avisar();
      armar();
    });
  }
  return () => {
    oyentes.delete(oyente);
    if (oyentes.size === 0 && intervalo !== null) {
      clearInterval(intervalo);
      intervalo = null;
      soltarVista?.();
      soltarVista = null;
    }
  };
}

const suscribirNada = () => () => {};

function leer(): number {
  // Sin nadie mirando, `ahora` quedó viejo: el primer dibujo de un reloj nuevo
  // no debe arrancar con la hora de hace una hora.
  if (intervalo === null) {
    const n = Date.now();
    if (n - ahora >= 1000) ahora = n;
  }
  return ahora;
}

/** La hora, actualizada cada segundo (cada 30 s fuera de la vista). Úsalo SOLO
 *  en componentes chiquitos. Con `activo = false` no se suscribe. */
export function useAhoraCadaSegundo(activo = true): number {
  return useSyncExternalStore(activo ? suscribir : suscribirNada, leer, leer);
}

/** Para pruebas: cuántos componentes están mirando el reloj. */
export function oyentesDelReloj(): number {
  return oyentes.size;
}
