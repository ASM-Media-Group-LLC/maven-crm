// VIDEO EN PAUSA CON LA APP ESCONDIDA (Alvaro, 18/11/2026: «la aplicación lo más
// liviana y rápida posible»).
//
// En el navegador, LiveKit (adaptiveStream) deja de recibir el video de los
// demás cuando la pestaña queda oculta. En la app de computador eso no pasaba:
// para no cortar llamadas ni Argos, la app corre con backgroundThrottling
// apagado y la página cree que SIEMPRE está a la vista, así que decodificaba la
// cámara de cada compañero aunque Maven estuviera minimizado todo el día.
//
// La app avisa cuándo de verdad nadie ve la ventana (minimizada o en la barra) y
// aquí se marca cada video REMOTO como «en segundo plano», lo mismo que LiveKit
// hace solo en una pestaña oculta: el servidor deja de mandarlo. Al volver, se
// reanuda. No toca el audio, ni la cámara ni la pantalla propias (Argos), ni la
// ventanita flotante (esa sí está a la vista).

import type { Room } from "livekit-client";
import { escritorio } from "@/lib/escritorio";

/** Lo de RemoteVideoTrack que se usa (es interno de livekit-client 2.x). */
type VideoRemoto = {
  kind?: string;
  isInBackground?: boolean;
  updateVisibility?: (forzar?: boolean) => void;
  attachedElements?: HTMLMediaElement[];
};

/** Marca estos videos como en segundo plano (o no) y deja que LiveKit decida. */
export function marcarSegundoPlano(videos: Iterable<unknown>, escondida: boolean): number {
  let n = 0;
  for (const v of videos) {
    const t = v as VideoRemoto | null;
    if (!t || t.kind !== "video" || typeof t.updateVisibility !== "function") continue;
    t.isInBackground = escondida;
    try { t.updateVisibility(true); } catch { /* una versión nueva de LiveKit: no se pausa y ya */ }
    if (!escondida) for (const el of t.attachedElements ?? []) el.play?.().catch(() => {});
    n++;
  }
  return n;
}

/** Los videos que llegan de los demás en esta sala. */
export function videosRemotos(room: Pick<Room, "remoteParticipants">): unknown[] {
  const out: unknown[] = [];
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.videoTrackPublications.values()) if (pub.track) out.push(pub.track);
  }
  return out;
}

/** Engancha la sala a la visibilidad real de la app. En el navegador, o en una
 *  versión vieja de la app, no hace nada. Devuelve cómo soltarlo. */
export function pausarVideoConAppEscondida(room: Pick<Room, "remoteParticipants" | "on" | "off">): () => void {
  const app = escritorio();
  if (!app?.alCambiarVisibilidad) return () => {};
  let escondida = false;
  const aplicar = () => { marcarSegundoPlano(videosRemotos(room), escondida); };
  const alSuscribir = (track: unknown) => { if (escondida) marcarSegundoPlano([track], true); };
  room.on("trackSubscribed" as never, alSuscribir as never);
  const soltar = app.alCambiarVisibilidad((visible) => { escondida = !visible; aplicar(); });
  void app.visible?.().then((v) => { if (v === false) { escondida = true; aplicar(); } }).catch(() => {});
  return () => {
    soltar();
    room.off("trackSubscribed" as never, alSuscribir as never);
    if (escondida) { escondida = false; aplicar(); }
  };
}
