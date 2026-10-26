import { useEffect, useRef, memo, useCallback, useState } from "react";
import { MARCA_AUDIO, reanudarAudioConGesto } from "@/lib/audioDeLaLlamada";
import { Track, Room } from "livekit-client";
import { UserAvatar } from "@/components/UserAvatar";
import { MicOff, Hand, Monitor, WifiOff, Pin, PinOff, MoreVertical, UserX, ZoomIn, ZoomOut, Minimize2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LKParticipant } from "@/hooks/useLiveKit";
import { cn } from "@/lib/utils";
import { useVideoZoom } from "./useVideoZoom";
import { useLanguage } from "@/hooks/useLanguage";

interface ParticipantTileProps {
  participant: LKParticipant;
  room: Room | null;
  large?: boolean;
  className?: string;
  preferredAudioOutputDeviceId?: string;
  onMuteParticipant?: (identity: string) => void;
  onRemoveParticipant?: (identity: string) => void;
  onPinParticipant?: (sid: string) => void;
  pinnedSid?: string | null;
  isAdmin?: boolean;
  /** Vista chica (ventanita flotante o ventana del sistema). Ahí NO se dibujan
   *  los controles del recuadro — ver el comentario donde se usa. */
  compact?: boolean;
}


function areReactionsEqual(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function areParticipantPropsEqual(prev: ParticipantTileProps, next: ParticipantTileProps) {
  const prevP = prev.participant;
  const nextP = next.participant;
  return (
    prev.room === next.room &&
    prev.large === next.large &&
    prev.className === next.className &&
    prev.preferredAudioOutputDeviceId === next.preferredAudioOutputDeviceId &&
    prev.pinnedSid === next.pinnedSid &&
    prevP.sid === nextP.sid &&
    prevP.identity === nextP.identity &&
    prevP.name === nextP.name &&
    prevP.isSpeaking === nextP.isSpeaking &&
    prevP.isMuted === nextP.isMuted &&
    prevP.isCameraOff === nextP.isCameraOff &&
    prevP.isScreenSharing === nextP.isScreenSharing &&
    prevP.isLocal === nextP.isLocal &&
    prevP.handRaised === nextP.handRaised &&
    prevP.connectionQuality === nextP.connectionQuality &&
    prevP.hasVideoTrack === nextP.hasVideoTrack &&
    areReactionsEqual(prevP.reactions, nextP.reactions) &&
    prev.isAdmin === next.isAdmin &&
    prev.onMuteParticipant === next.onMuteParticipant &&
    prev.onRemoveParticipant === next.onRemoveParticipant &&
    prev.onPinParticipant === next.onPinParticipant &&
    prev.compact === next.compact
  );
}

function ConnectionIndicator({ quality }: { quality: string }) {
  const { t } = useLanguage();
  const bars = quality === "excellent" ? 3 : quality === "good" ? 2 : quality === "poor" ? 1 : 0;
  const color = bars >= 2 ? "bg-success" : bars === 1 ? "bg-warning" : "bg-destructive";

  if (quality === "lost") {
    return (
      <div className="flex items-center gap-0.5" title={t("messenger.tile.conexionPerdida")}>
        <WifiOff className="h-3 w-3 text-destructive" />
      </div>
    );
  }

  return (
    <div className="flex items-end gap-px h-3" title={t("messenger.tile.calidad", { calidad: quality })}>
      {[1, 2, 3].map((level) => (
        <div
          key={level}
          className={cn("w-[3px] rounded-sm transition-colors", level <= bars ? color : "bg-muted")}
          style={{ height: `${level * 4}px` }}
        />
      ))}
    </div>
  );
}

const ParticipantTile = memo(function ParticipantTile({
  participant, room, large, className, preferredAudioOutputDeviceId,
  onMuteParticipant, onRemoveParticipant, onPinParticipant, pinnedSid, isAdmin, compact,
}: ParticipantTileProps) {
  const { t } = useLanguage();
  const isPinned = pinnedSid === participant.sid;
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const attachedVideoTrackRef = useRef<any>(null);
  const attachedVideoElRef = useRef<HTMLVideoElement | null>(null);
  const attachedAudioTrackRef = useRef<any>(null);
  // ⚠️ El elemento al que se adjuntó el audio, guardado aparte. NO se puede leer
  // `audioRef.current` en la limpieza al desmontar: React vacía los refs de
  // elementos del DOM ANTES de correr las limpiezas de los efectos pasivos, así
  // que allí siempre vale null — y `detach(null)` es `detach()`, que desconecta
  // la pista de TODOS los elementos de la sala. Ver el comentario del final.
  const attachedAudioElRef = useRef<HTMLAudioElement | null>(null);

  const showVideo = !participant.isCameraOff || participant.isScreenSharing;

  // Zoom estilo Google Meet: solo sobre pantallas compartidas, que es donde hay
  // texto que leer. Sobre una cámara no aporta.
  const zoom = useVideoZoom(participant.isScreenSharing);
  const [confirmarSilencio, setConfirmarSilencio] = useState(false);

  // ── Robust audio attachment helper ─────────────────────────────
  const attachAudioTrack = useCallback(() => {
    if (participant.isLocal || !room) return;
    // Quien comparte pantalla dibuja DOS recuadros (su pantalla y su persona) y
    // los dos son la misma persona de LiveKit: sin esto, ambos adjuntaban el
    // MISMO micrófono, y con el <audio> de la red de seguridad la voz de esa
    // persona salía por TRES elementos a la vez. Una pantalla no tiene micrófono.
    if (participant.esTileDePantalla) return;

    const audioEl = audioRef.current;
    if (!audioEl) return;

    const lkParticipant = room.remoteParticipants.get(participant.identity);
    if (!lkParticipant) return;

    const audioTrack = [...lkParticipant.audioTrackPublications.values()].find(
      (t) => t.source === Track.Source.Microphone
    );

    if (audioTrack?.track) {
      // Only re-attach if the track changed or the element lost its source
      const needsAttach =
        attachedAudioTrackRef.current !== audioTrack.track ||
        !audioEl.srcObject ||
        (audioEl.srcObject instanceof MediaStream && audioEl.srcObject.getAudioTracks().length === 0);

      if (needsAttach) {
        // Detach old track if different
        if (attachedAudioTrackRef.current && attachedAudioTrackRef.current !== audioTrack.track) {
          try { attachedAudioTrackRef.current.detach(audioEl); } catch {}
        }

        audioTrack.track.attach(audioEl);
        attachedAudioTrackRef.current = audioTrack.track;
        attachedAudioElRef.current = audioEl;
        audioEl.volume = 1;


        // Set audio output device
        const mediaEl = audioEl as HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void>; sinkId?: string };
        if (preferredAudioOutputDeviceId && typeof mediaEl.setSinkId === "function" && mediaEl.sinkId !== preferredAudioOutputDeviceId) {
          mediaEl.setSinkId(preferredAudioOutputDeviceId).catch(() => {});
        }

        // Robust play with retries. Antes se rendia tras 5 intentos (~4,8 s) y
        // en silencio: los reintentos rapidos cubren una carrera de
        // milisegundos, pero no la politica de autoplay del navegador, que solo
        // se levanta con un gesto del usuario y puede tardar minutos.
        const tryPlay = (attempt = 0) => {
          audioEl.play().catch(() => {
            if (attempt < 5) { setTimeout(() => tryPlay(attempt + 1), 300 * Math.pow(2, attempt)); return; }
            reanudarAudioConGesto(`no arranco el audio de ${participant.identity}`);
          });
        };
        tryPlay();
      }
    } else if (attachedAudioTrackRef.current && audioEl) {
      try { attachedAudioTrackRef.current.detach(audioEl); } catch {}
      attachedAudioTrackRef.current = null;
      attachedAudioElRef.current = null;
    }
  }, [room, participant.identity, participant.isLocal, participant.esTileDePantalla, preferredAudioOutputDeviceId]);

  // ── Video attachment effect ────────────────────────────────────
  useEffect(() => {
    if (!room) return;

    if (videoRef.current !== attachedVideoElRef.current) {
      if (attachedVideoTrackRef.current && attachedVideoElRef.current) {
        try { attachedVideoTrackRef.current.detach(attachedVideoElRef.current); } catch {}
      }
      attachedVideoTrackRef.current = null;
      attachedVideoElRef.current = videoRef.current;
    }

    const lkParticipant = participant.isLocal
      ? room.localParticipant
      : room.remoteParticipants.get(participant.identity);

    if (!lkParticipant) return;

    const videoSource = participant.isScreenSharing ? Track.Source.ScreenShare : Track.Source.Camera;

    const attachVideo = () => {
      const videoTrack = [...lkParticipant.videoTrackPublications.values()].find((t) => t.source === videoSource);
      const videoEl = videoRef.current;
      if (videoTrack?.track && videoEl) {
        try {
          if (attachedVideoTrackRef.current && attachedVideoTrackRef.current !== videoTrack.track) {
            attachedVideoTrackRef.current.detach(videoEl);
          }
          const shouldAttach = attachedVideoTrackRef.current !== videoTrack.track || !(videoEl as HTMLVideoElement).srcObject;
          if (shouldAttach) {
            videoTrack.track.attach(videoEl);
            attachedVideoTrackRef.current = videoTrack.track;
            videoEl.play?.().catch(() => {});
          }
          return false;
        } catch {
          attachedVideoTrackRef.current = null;
          return !participant.isCameraOff;
        }
      } else if (videoEl) {
        if (attachedVideoTrackRef.current) {
          try { attachedVideoTrackRef.current.detach(videoEl); } catch {}
          attachedVideoTrackRef.current = null;
        }
        return !participant.isCameraOff;
      }
      return false;
    };

    const needsRetry = attachVideo();
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryAttempts = 0;

    const scheduleAttachRetry = () => {
      if (retryAttempts >= 8 || (participant.isCameraOff && !participant.isScreenSharing)) return;
      retryTimer = setTimeout(() => {
        retryAttempts += 1;
        const stillNeedsRetry = attachVideo();
        if (stillNeedsRetry) scheduleAttachRetry();
      }, 200 * retryAttempts + 150);
    };

    if (needsRetry && (!participant.isCameraOff || participant.isScreenSharing)) scheduleAttachRetry();

    return () => { if (retryTimer) clearTimeout(retryTimer); };
  }, [room, participant.identity, participant.isLocal, participant.isCameraOff, participant.isScreenSharing, participant.hasVideoTrack]);

  // ── Audio attachment effect (separate from video) ──────────────
  useEffect(() => {
    attachAudioTrack();

    // Also set up a retry: sometimes the track arrives slightly after the
    // participant state updates, so poll a few times.
    if (participant.isLocal) return;

    let retryCount = 0;
    const maxRetries = 6;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = () => {
      if (retryCount >= maxRetries) return;
      retryTimer = setTimeout(() => {
        retryCount++;
        attachAudioTrack();
        // Keep retrying if we still don't have audio attached
        if (!attachedAudioTrackRef.current) scheduleRetry();
      }, 300 * (retryCount + 1));
    };

    // If no track attached yet, schedule retries
    if (!attachedAudioTrackRef.current) {
      scheduleRetry();
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [attachAudioTrack, participant.isLocal, participant.isMuted]);

  // ── Cleanup on unmount ─────────────────────────────────────────
  useEffect(() => {
    const attachedVideo = attachedVideoTrackRef;
    const attachedVideoEl = attachedVideoElRef;
    const attachedAudio = attachedAudioTrackRef;
    const attachedAudioEl = attachedAudioElRef;
    return () => {
      // ⚠️ SOLO NUESTRO ELEMENTO. Acá había además un `detach()` SIN argumentos,
      // y `detach()` sin argumentos desconecta el track de TODOS los elementos
      // donde esté adjunto — incluido el `<audio>` oculto de RoomAudioSink, que
      // es la red de seguridad de toda la sala.
      //
      // O sea: cada vez que un recuadro se desmontaba —y se desmontan todo el
      // tiempo: al pasar a la ventana flotante solo se dibujan DOS, al volver se
      // dibujan todos, y `hideNoVideo` los filtra según prendan o apaguen la
      // cámara— ese gesto le arrancaba la pista a la red de seguridad. Y el sink
      // no la reponía nunca, porque su mapa seguía diciendo "ya está adjunto".
      //
      // Resultado: la persona dejaba de escuchar a quien no tuviera recuadro
      // —justamente el supervisor, que entra sin cámara— por el resto del turno.
      //
      // ── Y POR QUÉ NO SE LEE `audioRef.current` ACÁ ───────────────────────
      //
      // Porque en este punto SIEMPRE vale null. React vacía los refs de los
      // elementos del DOM en la fase de commit, ANTES de correr las limpiezas
      // de los efectos pasivos de un componente que se desmonta. O sea que
      // `detach(audioRef.current)` es literalmente `detach()`: la misma rama
      // que se creía haber eliminado el 31/08, con el mismo daño. El `!` de
      // TypeScript tapó el agujero durante dos semanas.
      //
      // Por eso el elemento se guarda en un ref NUESTRO al adjuntarlo: ese no
      // lo toca nadie. Y si no hay elemento, no se desconecta nada — mejor
      // dejar una pista adjunta a un elemento muerto que callar a toda la sala.
      if (attachedVideo.current && attachedVideoEl.current) {
        try { attachedVideo.current.detach(attachedVideoEl.current); } catch {}
      }
      attachedVideo.current = null;
      attachedVideoEl.current = null;
      if (attachedAudio.current && attachedAudioEl.current) {
        try { attachedAudio.current.detach(attachedAudioEl.current); } catch {}
      }
      attachedAudio.current = null;
      attachedAudioEl.current = null;
    };
  }, []);

  return (
    <div
      className={cn(
        // tile-estudio: borde + filo de luz + sombra honda (tile elevado de set).
        // El fondo del tile lo pone esa clase (antes era un gris plano inline).
        "tile-estudio group relative overflow-hidden flex items-center justify-center h-full transition-all duration-200",
        compact ? "rounded-lg" : "rounded-2xl",
        participant.isSpeaking && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        isPinned && "ring-2 ring-primary",
        className
      )}
    >
      {participant.isScreenSharing && showVideo && (
        <div className="absolute bottom-2 right-2 z-20 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-1 backdrop-blur-sm opacity-0 hover:opacity-100 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={zoom.zoomOut}
            disabled={zoom.scale <= 1}
            title={t("messenger.tile.alejar")}
            aria-label={t("messenger.tile.alejar")}
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/90 hover:bg-white/15 disabled:opacity-30"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[2.2rem] text-center text-[10px] tabular-nums text-white/80">
            {Math.round(zoom.scale * 100)}%
          </span>
          <button
            type="button"
            onClick={zoom.zoomIn}
            title={t("messenger.tile.acercar")}
            aria-label={t("messenger.tile.acercar")}
            className="flex h-6 w-6 items-center justify-center rounded-full text-white/90 hover:bg-white/15"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          {zoom.isZoomed && (
            <button
              type="button"
              onClick={zoom.reset}
              title={t("messenger.tile.verCompleta")}
              aria-label={t("messenger.tile.verCompleta")}
              className="flex h-6 w-6 items-center justify-center rounded-full text-white/90 hover:bg-white/15"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {showVideo ? (
        <div
          className="absolute inset-0 z-[1] overflow-hidden"
          {...(participant.isScreenSharing ? zoom.handlers : {})}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={participant.isLocal}
            // `contain` y NO `cover`, tambien para la camara. `cover` rellena la
            // caja RECORTANDO lo que sobra, y como la caja se estira a lo que
            // le de la grilla, en una pantalla ancha su proporcion no tiene
            // nada que ver con la de la camara: a Jhon le cortaba la cabeza.
            // En una herramienta de supervision, ver a la persona entera vale
            // mas que llenar el rectangulo — las franjas oscuras son el precio
            // y son baratas.
            className={cn("absolute inset-0 w-full h-full object-contain", participant.isScreenSharing ? "bg-black" : "bg-black/40")}
            style={
              participant.isScreenSharing
                ? zoom.style
                : { transform: participant.isLocal ? "scaleX(-1)" : undefined }
            }
          />
        </div>
      ) : (
        <UserAvatar
          name={participant.name}
          size="xl"
          // En el recuadro chico (tira del teléfono, caritas de la ventana flotante)
          // el avatar de 64 px se pisaba con el nombre (Jhon, 10/09).
          className={cn("z-[1]", large ? "h-24 w-24" : compact ? "h-10 w-10" : "h-16 w-16")}
        />
      )}

      {/* El atributo sale de la CONSTANTE, no escrito a mano: tener ese nombre
          suelto en dos archivos fue exactamente el bug — el sink marcaba
          `data-lk-room-audio` y los recuperadores buscaban `data-lk-audio`, así
          que no encontraban nada y nadie se enteraba. */}
      {!participant.isLocal && !participant.esTileDePantalla && (
        <audio ref={audioRef} autoPlay playsInline {...{ [MARCA_AUDIO]: "true" }} style={{ display: "none" }} />
      )}

      {/* Controles del recuadro.
          En la vista chica va SOLO el de anclar, y más chico. Dos razones:

          1. EL MENÚ NO FUNCIONA AHÍ. Es un DropdownMenu de Radix, que dibuja su
             contenido en `document.body` — y dentro de la ventana flotante del
             sistema `document` sigue siendo el de la ventana PRINCIPAL. El menú
             se abre en la otra ventana, donde nadie lo ve. El botón responde y
             no pasa nada, que es peor que no tenerlo.
          2. LOS DOS JUNTOS NO ENTRABAN. Eran dos botones de 40px pegados sobre
             un recuadro de ~150x84. En los grandes había lugar y el anclar
             funcionaba; en el chico de la otra persona ocupaban casi todo el
             ancho, así que el clic caía sobre el menú roto y parecía que anclar
             no servía para los demás. Con uno solo y más chico, entra. */}
      {(onPinParticipant || !compact) && (
      <div className="absolute inset-0 z-[5] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
        <div className="flex items-center gap-1 pointer-events-auto">
          {onPinParticipant && (
            <button
              onClick={() => onPinParticipant(participant.sid)}
              className={cn(
                "rounded-full backdrop-blur-sm flex items-center justify-center transition-colors",
                compact ? "h-8 w-8" : "h-10 w-10",
                isPinned
                  ? "bg-primary/30 text-primary hover:bg-primary/40"
                  : "bg-[hsl(220_3%_18%/0.85)] text-foreground hover:bg-[hsl(220_3%_25%/0.95)]"
              )}
              title={isPinned ? t("messenger.sidebar.desanclar") : t("messenger.tile.anclarEnPantalla")}
            >
              {isPinned ? <PinOff className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} /> : <Pin className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />}
            </button>
          )}
          {!compact && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-10 w-10 rounded-full bg-[hsl(220_3%_18%/0.85)] backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-[hsl(220_3%_25%/0.95)] transition-colors"
                title={t("messenger.tile.masOpcionesPara", { name: participant.name })}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="z-[200] bg-card border-border">
              {onPinParticipant && (
                <DropdownMenuItem onClick={() => onPinParticipant(participant.sid)} className="text-foreground focus:bg-muted">
                  {isPinned ? <PinOff className="h-3.5 w-3.5 mr-2" /> : <Pin className="h-3.5 w-3.5 mr-2" />}
                  {isPinned ? t("messenger.sidebar.desanclar") : t("messenger.tile.anclarEnPantalla")}
                </DropdownMenuItem>
              )}
              {/* Silenciar a otro: cualquiera en la llamada, como en Google.
                  PIDE CONFIRMACION y dice "para todos" a proposito. Antes era un
                  boton de un click pegado al de anclar, y en un empalme alguien
                  lo apretaba creyendo que se silenciaba a si mismo — dejaba al
                  otro mudo para toda la sala sin que ninguno entendiera por que. */}
              {!participant.isLocal && onMuteParticipant && !participant.isMuted && (
                <DropdownMenuItem onClick={() => setConfirmarSilencio(true)} className="text-foreground focus:bg-muted">
                  <MicOff className="h-3.5 w-3.5 mr-2" /> {t("messenger.tile.silenciarParaTodos")}
                </DropdownMenuItem>
              )}
              {isAdmin && !participant.isLocal && onRemoveParticipant && (
                <DropdownMenuItem onClick={() => onRemoveParticipant(participant.identity)} className="text-destructive focus:bg-muted">
                  <UserX className="h-3.5 w-3.5 mr-2" /> {t("messenger.tile.quitarDeLaLlamada")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
      </div>
      )}

      {/* Silenciar a otro es irreversible desde acá: solo esa persona puede
          volver a prender su micro. Por eso se confirma y se dice quién es. */}
      <AlertDialog open={confirmarSilencio} onOpenChange={setConfirmarSilencio}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("messenger.tile.silenciarA", { name: participant.name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("messenger.tile.silenciarDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={() => onMuteParticipant?.(participant.identity)}>
              {t("messenger.tile.silenciarParaTodos")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reactions */}
      {participant.reactions.length > 0 && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-2 z-10 pointer-events-none">
          {participant.reactions.map((emoji, i) => (
            <span key={`${emoji}-${i}-${Date.now()}`} className="text-6xl drop-shadow-lg animate-reaction-float">{emoji}</span>
          ))}
        </div>
      )}

      {/* Hand raised */}
      {participant.handRaised && (
        <div className="absolute top-3 left-3 bg-warning/90 rounded-full p-2 animate-pulse z-10">
          <Hand className="h-6 w-6 text-white" />
        </div>
      )}

      {/* Pinned indicator */}
      {isPinned && (
        <div className="absolute top-3 right-3 z-10">
          <div className="flex items-center gap-1 bg-primary/85 backdrop-blur-sm text-white text-[10px] font-medium rounded-full px-2 py-1">
            <Pin className="h-3 w-3" /> {t("messenger.tile.anclado")}
          </div>
        </div>
      )}

      {/* Screen sharing badge */}
      {participant.isScreenSharing && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <div className="flex items-center gap-1.5 bg-[hsl(220_3%_14%/0.8)] backdrop-blur-sm text-foreground text-[10px] font-medium rounded-full px-2.5 py-1">
            <Monitor className="h-3 w-3" /> {t("messenger.tile.compartiendoPantalla")}
          </div>
        </div>
      )}

      {/* Rótulo lower-third (Estudio Acero): el nombre en una placa sólida
          abajo-izquierda y la señal en su propia placa abajo-derecha, como un
          rótulo de transmisión — en vez de una barra con degradé. */}
      <div className={cn("absolute bottom-0 left-0 right-0 flex items-end justify-between z-10 pointer-events-none", compact ? "px-1.5 py-1.5" : "px-2.5 py-2.5")}>
        <div className={cn("flex min-w-0 items-center gap-1.5 rounded-md border border-white/10 bg-[hsl(var(--background)/0.72)] backdrop-blur-sm", compact ? "px-1.5 py-0.5" : "px-2 py-1")}>
          <span className={cn("truncate font-medium text-white", compact ? "text-[10px]" : "text-xs")}>
            {participant.isLocal ? t("messenger.preview.tu") : participant.name}
          </span>
          {participant.isMuted && (
            <div className={cn("rounded-full bg-destructive flex items-center justify-center shrink-0", compact ? "h-4 w-4" : "h-5 w-5")}>
              <MicOff className={compact ? "h-2.5 w-2.5 text-white" : "h-3 w-3 text-white"} />
            </div>
          )}
        </div>
        {/* La calidad de conexión es de la PERSONA, no de cada recuadro: con
            cámara + pantalla se dibujan dos tiles suyos y sin esta guarda el
            iconito salía repetido. Va en el de su cámara. */}
        {!participant.esTileDePantalla && (
          <div className="shrink-0 rounded-md border border-white/10 bg-[hsl(var(--background)/0.72)] px-1.5 py-1 backdrop-blur-sm">
            <ConnectionIndicator quality={participant.connectionQuality} />
          </div>
        )}
      </div>
    </div>
  );
}, areParticipantPropsEqual);

export default ParticipantTile;
