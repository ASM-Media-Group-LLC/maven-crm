import { useEffect, useRef } from "react";
import { Room, RoomEvent, RemoteTrack, RemoteTrackPublication, RemoteParticipant, Track } from "livekit-client";
import { marcarAudio, reanudarAudioConGesto, registrarDesbloqueo, perdioLaPista } from "@/lib/audioDeLaLlamada";

interface Props {
  room: Room | null | undefined;
  preferredAudioOutputDeviceId?: string;
}

/**
 * Safety-net audio renderer at the room level.
 *
 * Subscribes to ALL remote microphone tracks and attaches each to a hidden
 * <audio> element, regardless of whether a ParticipantTile for that participant
 * is currently mounted (it may be filtered out by hideNoVideo or maxTiles).
 *
 * ParticipantTile also attaches audio to its own element; the browser will play
 * both attached MediaStreams simultaneously, but the underlying media stream is
 * the same so it is heard once per output device. To avoid double audio, we
 * keep this sink muted=false and rely on the browser sharing the same source.
 * In practice attaching the same RemoteAudioTrack twice does not duplicate audio
 * because LiveKit's attach() returns the same underlying element source.
 */
export default function RoomAudioSink({ room, preferredAudioOutputDeviceId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const attachedRef = useRef<Map<string, { track: RemoteTrack; el: HTMLAudioElement }>>(new Map());

  useEffect(() => {
    if (!room) return;
    const container = containerRef.current;
    if (!container) return;

    const attach = (track: RemoteTrack, participant: RemoteParticipant) => {
      // Micrófono Y audio de pantalla compartida. El segundo faltaba: aunque
      // alguien compartiera un video con sonido, acá se descartaba y nadie lo
      // oía. Lo demás (si algún día hay otra fuente) se sigue ignorando.
      if (track.source !== Track.Source.Microphone && track.source !== Track.Source.ScreenShareAudio) return;
      const key = `${participant.sid}-${track.sid}`;
      if (attachedRef.current.has(key)) return;
      const el = document.createElement("audio");
      el.autoplay = true;
      (el as any).playsInline = true;
      // ⚠️ Se marca con el MISMO atributo que el resto de la app. Acá el nombre
      // divergía (`data-lk-room-audio`) y los tres recuperadores de
      // useLiveKit —que buscan `audio[data-lk-audio]`— eran CIEGOS a este
      // elemento. Y es el único que lleva la voz de quien no tiene tile: el
      // supervisor entra sin cámara y la grilla lo filtra. Resultado: un chatter
      // sin escuchar a su supervisora por el resto del turno.
      marcarAudio(el);
      el.style.display = "none";
      container.appendChild(el);
      try { track.attach(el); } catch {}
      const mediaEl = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (preferredAudioOutputDeviceId && typeof mediaEl.setSinkId === "function") {
        mediaEl.setSinkId(preferredAudioOutputDeviceId).catch(() => {});
      }
      const tryPlay = (attempt = 0) => {
        el.play().catch(() => {
          if (attempt < 5) { setTimeout(() => tryPlay(attempt + 1), 300 * Math.pow(2, attempt)); return; }
          // Antes acá se RENDÍA en silencio. Los reintentos rápidos cubren una
          // carrera de milisegundos, pero no la política de autoplay: esa solo
          // se levanta con un gesto del usuario y puede tardar minutos. Sin esto,
          // la pista quedaba muda para siempre y sin dejar rastro.
          reanudarAudioConGesto(`no arrancó el audio de ${participant.identity}`);
        });
      };
      tryPlay();
      attachedRef.current.set(key, { track, el });
    };

    const detach = (track: RemoteTrack, participant: RemoteParticipant) => {
      const key = `${participant.sid}-${track.sid}`;
      const entry = attachedRef.current.get(key);
      if (!entry) return;
      try { entry.track.detach(entry.el); } catch {}
      try { entry.el.remove(); } catch {}
      attachedRef.current.delete(key);
    };

    // Attach any already-subscribed tracks
    room.remoteParticipants.forEach((p) => {
      p.audioTrackPublications.forEach((pub) => {
        if (pub.track) attach(pub.track as RemoteTrack, p);
      });
    });

    const onSubscribed = (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      attach(track, participant);
    };
    const onUnsubscribed = (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      detach(track, participant);
    };

    room.on(RoomEvent.TrackSubscribed, onSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onUnsubscribed);

    // Desbloquear el contexto de audio de LiveKit forma parte de reanudar: si
    // sigue suspendido, el `play()` del elemento no produce sonido.
    //
    // Antes esto era un listener de click en el documento PRINCIPAL con
    // `{ once: true }`. Dos fallas: la llamada se muda a la ventana flotante del
    // sistema —OTRO documento—, así que los clics de la persona no llegaban
    // nunca; y `once` daba UN solo intento en toda la vida del componente.
    const bajaDesbloqueo = registrarDesbloqueo(() => room.startAudio());

    // ── VIGILANTE: que no nos arranquen la pista ──────────────────────────
    //
    // `track.detach()` SIN argumentos desconecta la pista de TODOS los
    // elementos donde esté adjunta. Otros componentes lo usaban en su limpieza,
    // así que al desmontarse un recuadro este elemento —la red de seguridad de
    // la sala— se quedaba vacío. Y no se reponía nunca: `attachedRef` seguía
    // diciendo "ya está adjunto".
    //
    // Se arregló el sitio que lo hacía, pero la red de seguridad no puede
    // depender de que nadie vuelva a escribir esa línea: mirar el `srcObject`
    // cada pocos segundos no cuesta nada y convierte un silencio permanente en
    // un hueco de tres segundos.
    const vigilante = window.setInterval(() => {
      let repuestas = 0;
      attachedRef.current.forEach(({ track, el }) => {
        if (!perdioLaPista(el)) return;
        repuestas += 1;
        try { track.attach(el); } catch { /* noop */ }
        el.play().catch(() => { /* lo resuelve el gesto */ });
      });
      if (repuestas) {
        console.warn(
          `[Audio] Le habían arrancado la pista a ${repuestas} elemento(s) de la red de seguridad`,
          "— re-adjuntadas. Si esto se repite, alguien está haciendo detach() sin argumentos.",
        );
      }
    }, 3000);

    return () => {
      room.off(RoomEvent.TrackSubscribed, onSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onUnsubscribed);
      window.clearInterval(vigilante);
      bajaDesbloqueo();
      attachedRef.current.forEach((entry) => {
        try { entry.track.detach(entry.el); } catch {}
        try { entry.el.remove(); } catch {}
      });
      attachedRef.current.clear();
    };
  }, [room, preferredAudioOutputDeviceId]);

  return <div ref={containerRef} aria-hidden="true" style={{ display: "none" }} />;
}
