import { useEffect, useRef } from "react";
import { Room, RoomEvent, RemoteTrack, RemoteTrackPublication, RemoteParticipant, Track } from "livekit-client";
import { marcarAudio, reanudarAudioConGesto, registrarDesbloqueo, motivoDeMudez } from "@/lib/audioDeLaLlamada";

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
  const attachedRef = useRef<Map<string, { track: RemoteTrack; el: HTMLAudioElement }>>(new Map());

  useEffect(() => {
    if (!room) return;
    // ── LOS <audio> VIVEN EN EL DOCUMENTO PRINCIPAL, NO EN EL ÁRBOL ──────────
    //
    // TERCER bug del mismo silencio "dejo la pestaña y no escucho al
    // supervisor" (reportado de nuevo 02/09/2026, tras #1463 y el detach).
    //
    // La llamada salta SOLA a la ventana del sistema al cambiar de pestaña
    // (useAutoFlotante), y su caja entera —incluidos estos <audio>— se
    // reparenta a OTRO documento. Mover un elemento de media entre documentos
    // lo PAUSA, y el play() en el documento nuevo lo bloquea el autoplay: ese
    // documento no tiene activación de usuario. Los recuperadores esperan un
    // GESTO… que no llega nunca, porque justamente la persona está mirando
    // otra app. Silencio hasta que vuelve — el síntoma exacto del reporte.
    //
    // La regla: el VIDEO puede mudarse de ventana; el AUDIO no tiene por qué.
    // Estos elementos son invisibles — se anclan a document.body del documento
    // PRINCIPAL (los scripts corren siempre en el contexto principal, así que
    // `document` es el principal aunque este componente se dibuje dentro del
    // PiP) y ninguna mudanza vuelve a tocarlos: siguen sonando con el permiso
    // de autoplay que ya ganó el gesto de entrar a la llamada.
    const container = document.body;

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
    //
    // ⚠️ MIRA TAMBIÉN SI ESTÁ PAUSADO. Antes solo preguntaba si le habían
    // arrancado la pista, y ese es el caso que MENOS dura: la librería repone la
    // pista y todo sigue. El que dura es el otro — el elemento pausado CON su
    // pista puesta —, porque el mapa de acá arriba sigue diciendo "ya está
    // adjunto" y nadie vuelve a mirarlo: queda mudo el resto de la llamada.
    //
    // Y pausados quedan por dos vías conocidas: `detach()` de la librería hace
    // `pause()` sobre cada elemento (su recycleElement), y mudar la llamada a la
    // ventana flotante del sistema saca los nodos del documento, lo que los pausa
    // por especificación. Las dos ocurren justo al empezar a compartir pantalla.
    const vigilante = window.setInterval(() => {
      const repuestas: string[] = [];
      attachedRef.current.forEach(({ track, el }) => {
        const motivo = motivoDeMudez(el);
        if (!motivo) return;
        repuestas.push(motivo);
        // Re-adjuntar solo si falta la pista; si solo estaba pausado, alcanza con
        // volver a reproducir —y re-adjuntar de más haría `pause()` por dentro.
        if (motivo !== "pausado") { try { track.attach(el); } catch { /* noop */ } }
        el.play().catch(() => {
          // Antes este fallo era mudo y el elemento quedaba pausado para siempre.
          // La espera del gesto cubre la política de autoplay en TODOS los
          // documentos, incluida la ventana flotante.
          reanudarAudioConGesto("el vigilante repuso la pista pero no arrancó");
        });
      });
      if (repuestas.length) {
        console.warn(
          `[Audio] ${repuestas.length} elemento(s) de la red de seguridad estaban mudos`,
          `(${repuestas.join(", ")}) — repuestos.`,
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

  // Nada que dibujar: los <audio> viven colgados de document.body (principal)
  // a propósito — ver el comentario grande de arriba.
  return null;
}
