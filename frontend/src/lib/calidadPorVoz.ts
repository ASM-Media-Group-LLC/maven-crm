import { VideoQuality } from "livekit-client";

// EN COWORK, CÁMARAS EN CALIDAD BAJA SI NO HABLA (Alvaro, 17/11/2026:
// «la plataforma se laguea»; eligió «cámaras en baja si no habla»).
//
// Se siguen viendo todos, pero recibir y dibujar la cámara de cada compañero en
// calidad alta gasta internet de bajada y procesador sin que nadie la esté
// mirando. Desde ahora, en las salas de Cowork, la cámara de un compañero llega
// en la capa baja, salvo:
//   · el que está hablando (y unos segundos después de callarse, para que no
//     salte la calidad entre frase y frase);
//   · el que la persona fijó/abrió (pin).
// La pantalla compartida NO se toca: se lee, tiene que verse nítida.

/** Segundos que se mantiene nítido a quien acaba de hablar. */
export const NITIDO_TRAS_HABLAR_MS = 10_000;

/** ¿En esta sala se aplica? Todas las de Cowork (trabajo, Hub, meets, 1:1). */
export function aplicaCalidadPorVoz(sala: string | null | undefined): boolean {
  return !!sala && sala.startsWith("cowork_");
}

/** La calidad máxima que se pide para la cámara de ese compañero. */
export function calidadDeCamara(o: { fijado: boolean; hablando: boolean; ultimaVezHablo: number | undefined; ahora: number }): VideoQuality {
  if (o.fijado || o.hablando) return VideoQuality.HIGH;
  if (o.ultimaVezHablo !== undefined && o.ahora - o.ultimaVezHablo < NITIDO_TRAS_HABLAR_MS) return VideoQuality.HIGH;
  return VideoQuality.LOW;
}
