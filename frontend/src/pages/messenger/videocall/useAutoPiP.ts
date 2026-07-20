import { useEffect, useRef } from "react";
import { Room, Track } from "livekit-client";

// PiP automático estilo Google Meet: al ocultarse la pestaña/ventana durante una
// llamada, abrimos el Picture-in-Picture del navegador con el video más relevante:
// pantalla compartida remota > cámara del hablante activo > cualquier cámara remota
// > pantalla/cámara local. Al volver a la pestaña se cierra solo.
//
// Permisos: Chrome permite entrar a PiP SIN gesto del usuario en pestañas que están
// capturando cámara/micrófono (auto-PiP para videollamadas); además registramos el
// action handler de mediaSession ("enterpictureinpicture") que habilita el auto-PiP
// nativo del navegador. Si el navegador lo bloquea, fallamos en silencio (no toast).
export function useAutoPiP(getRoom: () => Room | null, enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const getRoomRef = useRef(getRoom);
  getRoomRef.current = getRoom;

  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;
    if (!("pictureInPictureEnabled" in document) || !document.pictureInPictureEnabled) return;

    const ensureVideo = (): HTMLVideoElement => {
      if (videoRef.current) return videoRef.current;
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.setAttribute("playsinline", "true");
      // Tiene que ser renderizable para poder entrar a PiP (display:none lo rompe):
      // lo dejamos de 2px e invisible en una esquina.
      v.style.cssText = "position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:0;pointer-events:none;";
      document.body.appendChild(v);
      videoRef.current = v;
      return v;
    };

    // El video más relevante para la ventanita (mismo criterio que el spotlight).
    const pickTrack = (): MediaStreamTrack | null => {
      const room = getRoomRef.current();
      if (!room) return null;
      const trackOf = (p: { videoTrackPublications: Map<string, unknown> } | undefined, source: Track.Source): MediaStreamTrack | null => {
        if (!p) return null;
        const pub = Array.from(p.videoTrackPublications.values()).find(
          (t) => (t as { source: Track.Source }).source === source,
        ) as { track?: { mediaStreamTrack?: MediaStreamTrack }; isMuted?: boolean } | undefined;
        const track = pub?.track?.mediaStreamTrack ?? null;
        return track && track.readyState === "live" && !pub?.isMuted ? track : null;
      };
      const remotes = Array.from(room.remoteParticipants.values());
      for (const p of remotes) {
        const t = trackOf(p, Track.Source.ScreenShare);
        if (t) return t;
      }
      const speaker = room.activeSpeakers?.find((s) => !s.isLocal);
      if (speaker) {
        const t = trackOf(speaker as unknown as { videoTrackPublications: Map<string, unknown> }, Track.Source.Camera);
        if (t) return t;
      }
      for (const p of remotes) {
        const t = trackOf(p, Track.Source.Camera);
        if (t) return t;
      }
      return (
        trackOf(room.localParticipant, Track.Source.ScreenShare) ||
        trackOf(room.localParticipant, Track.Source.Camera)
      );
    };

    let entering = false;
    const enterPiP = async () => {
      if (entering || document.pictureInPictureElement) return;
      // Si ya hay una ventana Document-PiP abierta (ej. el Hub popped-out), no abrimos
      // además el PiP de video: chocarían.
      if ((window as { documentPictureInPicture?: { window?: Window | null } }).documentPictureInPicture?.window) return;
      const track = pickTrack();
      if (!track) return; // llamada solo-audio → no hay nada que mostrar
      entering = true;
      try {
        const v = ensureVideo();
        v.srcObject = new MediaStream([track]);
        await v.play();
        await v.requestPictureInPicture();
      } catch {
        // Navegador sin soporte o política que exige gesto → silencio.
      } finally {
        entering = false;
      }
    };

    const exitPiP = async () => {
      try {
        if (videoRef.current && document.pictureInPictureElement === videoRef.current) {
          await document.exitPictureInPicture();
        }
      } catch { /* noop */ }
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") void enterPiP();
      else void exitPiP();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Habilita el auto-PiP nativo de Chrome para sitios de videollamada.
    try {
      (navigator as { mediaSession?: { setActionHandler?: (a: string, h: (() => void) | null) => void } })
        .mediaSession?.setActionHandler?.("enterpictureinpicture", () => { void enterPiP(); });
    } catch { /* acción no soportada en este navegador */ }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      try {
        (navigator as { mediaSession?: { setActionHandler?: (a: string, h: (() => void) | null) => void } })
          .mediaSession?.setActionHandler?.("enterpictureinpicture", null);
      } catch { /* noop */ }
      void exitPiP();
      videoRef.current?.remove();
      videoRef.current = null;
    };
  }, [enabled]);
}
