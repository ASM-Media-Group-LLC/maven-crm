import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ConnectionState, Track } from "livekit-client";
import { useLiveKit } from "@/hooks/useLiveKit";
import CallTopBar from "./CallTopBar";
import CallControls from "./CallControls";
import CallChatSidebar from "./CallChatSidebar";
import CallParticipantsSidebar from "./CallParticipantsSidebar";
import AdjustViewDialog, { type ViewSettings } from "./AdjustViewDialog";
import VideoSettingsDialog from "./VideoSettingsDialog";
import MetricsDialog from "./MetricsDialog";
import ParticipantTile from "./ParticipantTile";
import RecordingControl from "./RecordingControl";
import RoomAudioSink from "./RoomAudioSink";
import { useAutoPiP } from "./useAutoPiP";

import { Loader2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useFaceWatch, faceStateLabel, type FaceWatch } from "@/hooks/useFaceWatch";
import { useFaceNudge } from "@/hooks/useFaceNudge";
import { BackgroundEffect } from "./BackgroundSelector";

const DEFAULT_VIEW_SETTINGS: ViewSettings = { layout: "auto", maxTiles: 49, hideNoVideo: false };

interface LiveKitCallViewProps {
  roomName: string;
  displayName: string;
  callDisplayName?: string;
  isAdmin?: boolean;
  onLeave: () => void;
  initialMicOn?: boolean;
  initialCamOn?: boolean;
  initialAudioDeviceId?: string;
  initialVideoDeviceId?: string;
  initialAudioOutputDeviceId?: string;
  initialBackgroundEffect?: BackgroundEffect;
  hideShareLink?: boolean;
  hideScreenShare?: boolean;
  hideLeaveButton?: boolean;
  /** Custom label for the leave button (e.g. "Regresar a la sala"). When set, the button shows icon + text */
  leaveLabel?: string;
  /** Custom icon for the leave button (defaults to PhoneOff) */
  leaveIcon?: import("lucide-react").LucideIcon;
  /** When true, skip the generic "Llamada finalizada" toast on leave */
  suppressLeaveToast?: boolean;
  compact?: boolean;
  /** If set, auto-leave when remote participants reach 0 for this many ms */
  autoLeaveOnEmpty?: number;
  /** Custom token provider; bypasses the default livekit-token edge function */
  getToken?: () => Promise<{ token: string; url: string }>;
  /** Fires whenever the local participant's media state changes */
  onMediaStateChange?: (state: { micOn: boolean; camOn: boolean; screenShareOn: boolean }) => void;
  /**
   * Opt-in de la vigilancia de encuadre (¿se le ve la cara?). Solo se activa si
   * el contenedor pasa este callback: una llamada 1:1 del chat no lo necesita.
   * Corre sobre el video LOCAL, en el navegador de la propia persona.
   */
  onFaceStateChange?: (watch: FaceWatch) => void;
  /** Cowork: avisarle a la propia persona cuando no se le ve. Va acá y no en la
   *  página para que siga funcionando en la ventanita flotante. */
  supervisorEncuadre?: boolean;
  /** Habilita el botón de grabar (Meet/Cowork, solo usuarios con cuenta).
   *  Sin este prop igual se muestra el punto rojo pasivo cuando la sala se
   *  está grabando — que un invitado sepa que lo graban no es opcional. */
  recording?: { source: "meet" | "cowork"; title?: string };
  /** Link que copia el botón "Copiar enlace". Sin esto se comparte
   *  /call/<sala>, que exige login — a un externo lo deja mirando la
   *  pantalla de login (feedback de Jhon 21/08). Meet pasa acá su link
   *  público /entrar/<código>. */
  shareLink?: string;
}

export default function LiveKitCallView({ roomName, displayName, callDisplayName, isAdmin = false, onLeave, initialMicOn = true, initialCamOn = true, initialAudioDeviceId, initialVideoDeviceId, initialAudioOutputDeviceId, initialBackgroundEffect = "none", hideShareLink, hideScreenShare, hideLeaveButton, leaveLabel, leaveIcon, suppressLeaveToast, compact, autoLeaveOnEmpty, getToken, onMediaStateChange, onFaceStateChange, supervisorEncuadre, recording, shareLink: shareLinkProp }: LiveKitCallViewProps) {
  const lk = useLiveKit();
  const [viewSettings, setViewSettings] = useState<ViewSettings>(DEFAULT_VIEW_SETTINGS);

  // PiP automático estilo Google Meet: al cambiar de pestaña/ventana, la llamada
  // aparece en la ventanita flotante del navegador (pantalla compartida o hablante).
  useAutoPiP(lk.getRoom, true);

  // Modo compacto AUTOMÁTICO cuando el contenedor es chico (ventana angosta/baja):
  // mismos controles que Google Meet a tamaño mini. Se suma al prop `compact`.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [autoCompact, setAutoCompact] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setAutoCompact(r.width < 640 || r.height < 480);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [lk.connectionState]);
  const effectiveCompact = compact || autoCompact;
  const [adjustViewOpen, setAdjustViewOpen] = useState(false);
  const [videoSettingsOpen, setVideoSettingsOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [bgEffect, setBgEffect] = useState<BackgroundEffect>(initialBackgroundEffect);
  const [audioInputId, setAudioInputId] = useState(initialAudioDeviceId);
  const [audioOutputId, setAudioOutputId] = useState(initialAudioOutputDeviceId);
  const [videoInputId, setVideoInputId] = useState(initialVideoDeviceId);
  const [pinnedSid, setPinnedSid] = useState<string | null>(null);

  const handleViewSettingsChange = useCallback((s: ViewSettings) => { setViewSettings(s); }, []);

  useEffect(() => { if (chatOpen && lk.unreadChatCount > 0) lk.clearUnreadChat(); }, [chatOpen, lk.unreadChatCount, lk.clearUnreadChat]);

  const handleBgChange = useCallback((effect: BackgroundEffect) => {
    setBgEffect(effect);
    if (lk.connectionState === ConnectionState.Connected) void lk.setBackgroundEffect(effect);
  }, [lk.connectionState, lk.setBackgroundEffect]);

  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retried = false;

    const tryConnect = async () => {
      try {
        await lk.connect(roomName, displayNameRef.current, isAdmin, {
          initialMicOn,
          initialCamOn,
          audioDeviceId: initialAudioDeviceId,
          videoDeviceId: initialVideoDeviceId,
          audioOutputDeviceId: initialAudioOutputDeviceId,
          backgroundEffect: initialBackgroundEffect,
          tokenProvider: getTokenRef.current ? () => getTokenRef.current!() : undefined,
        });
      } catch (err: any) {
        if (cancelled) return;
        const msg = String(err?.message || err || "");
        // Auto-retry once on race-condition aborts (StrictMode double-mount, fast remount)
        if (!retried && /Abort handler called|aborted|AbortError/i.test(msg)) {
          retried = true;
          console.warn("[LiveKit] Signal aborted, retrying once in 600ms…", msg);
          retryTimer = setTimeout(() => { if (!cancelled) void tryConnect(); }, 600);
        }
      }
    };

    void tryConnect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      lk.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, isAdmin, initialMicOn, initialCamOn, initialAudioDeviceId, initialVideoDeviceId, initialAudioOutputDeviceId, initialBackgroundEffect]);

  useEffect(() => {
    const h = () => { lk.disconnect(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [lk]);

  const handleLeave = useCallback(() => { lk.disconnect(); onLeave(); if (!suppressLeaveToast) toast.info("Llamada finalizada"); }, [lk, onLeave, suppressLeaveToast]);

  // Una acción de moderación puede volver con 403 del servidor (no sos
  // anfitrión, o intentás moderar al anfitrión): mostramos el motivo. Con el
  // honor system anterior no había respuesta posible — el mensaje salía al aire
  // y nadie sabía si había pasado algo.
  const runModeration = useCallback(async (fn: () => Promise<unknown>, okMessage: string) => {
    try {
      await fn();
      toast.success(okMessage);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo aplicar la acción");
    }
  }, []);

  const handleModeration = useCallback(
    (fn: (identity: string) => Promise<void>, okMessage: string) => (identity: string) => {
      void runModeration(() => fn(identity), okMessage);
    },
    [runModeration],
  );

  const handleAudioInputChange = useCallback((id: string) => { setAudioInputId(id); lk.switchAudioInput?.(id); }, [lk]);
  const handleAudioOutputChange = useCallback((id: string) => { setAudioOutputId(id); lk.switchAudioOutput?.(id); }, [lk]);
  const handleVideoInputChange = useCallback((id: string) => { setVideoInputId(id); lk.switchVideoInput?.(id); }, [lk]);

  const handlePinParticipant = useCallback((sid: string) => {
    setPinnedSid((prev) => prev === sid ? null : sid);
  }, []);

  const shareLink = useMemo(() => {
    if (shareLinkProp) return shareLinkProp;
    const params = new URLSearchParams();
    const n = (callDisplayName || roomName).trim();
    if (n) params.set("name", n);
    const qs = params.toString();
    return `${window.location.origin}/call/${encodeURIComponent(roomName)}${qs ? `?${qs}` : ""}`;
  }, [roomName, callDisplayName, shareLinkProp]);

  // Clear pin if participant left
  useEffect(() => {
    if (pinnedSid && !lk.participants.some((p) => p.sid === pinnedSid)) {
      setPinnedSid(null);
    }
  }, [lk.participants, pinnedSid]);

  // Auto-leave when remote participants reach 0 for autoLeaveOnEmpty ms
  // Only triggers after at least one remote participant has been seen (room was populated)
  const handleLeaveRef = useRef(handleLeave);
  handleLeaveRef.current = handleLeave;
  const hadRemoteParticipantRef = useRef(false);
  useEffect(() => { hadRemoteParticipantRef.current = false; }, [roomName]);
  useEffect(() => {
    if (!autoLeaveOnEmpty || lk.connectionState !== ConnectionState.Connected) return;
    const remoteCount = lk.participants.filter((p) => !p.isLocal).length;
    if (remoteCount > 0) { hadRemoteParticipantRef.current = true; return; }
    if (!hadRemoteParticipantRef.current) return;
    const timer = setTimeout(() => { handleLeaveRef.current(); }, autoLeaveOnEmpty);
    return () => clearTimeout(timer);
  }, [autoLeaveOnEmpty, lk.participants, lk.connectionState]);

  // Fire onMediaStateChange when local participant's media state changes
  const localP = lk.participants.find((p) => p.isLocal);
  const localMicOn = localP ? !localP.isMuted : false;
  const localCamOn = localP ? !localP.isCameraOff : false;
  const localScreenShare = localP ? localP.isScreenSharing : false;
  const onMediaStateChangeRef = useRef(onMediaStateChange);
  onMediaStateChangeRef.current = onMediaStateChange;
  // Vigilancia de encuadre sobre la cámara local. El track sale del room de
  // LiveKit, así no capturamos la cámara una segunda vez.
  //
  // SE BUSCA EN UN TIC, NO EN UN useMemo, y esto no es un detalle de estilo:
  // LiveKit publica la cámara de forma ASÍNCRONA. `localCamOn` se pone en true
  // apenas se pide la cámara, pero la publicación aparece unos instantes
  // después. Con un useMemo dependiente de `localCamOn`, el cálculo corría
  // justo en ese hueco, devolvía null, y NADA lo volvía a disparar: el
  // supervisor se quedaba con "no hay cámara" para siempre y le reclamaba a
  // alguien que estaba perfectamente encuadrado. Le pasó a Jhon probando, y
  // sobrevivía a recargar porque la carrera se repite en cada arranque.
  //
  // Un tic de un segundo cierra la carrera venga la publicación cuando venga,
  // y cuesta nada: es leer una propiedad de un objeto que ya está en memoria.
  const [localCameraTrack, setLocalCameraTrack] = useState<MediaStreamTrack | null>(null);
  useEffect(() => {
    const buscar = () => {
      const room = lk.getRoom();
      const pub = room?.localParticipant?.getTrackPublication?.(Track.Source.Camera);
      const t = (pub?.track?.mediaStreamTrack as MediaStreamTrack | undefined) ?? null;
      // Solo se avisa si CAMBIÓ: si no, cada segundo re-dispararía el detector.
      setLocalCameraTrack((antes) => (antes === t ? antes : t));
    };
    buscar();
    const id = window.setInterval(buscar, 1000);
    return () => window.clearInterval(id);
  }, [lk, localCamOn, lk.connectionState]);
  // `enabled` NO incluye localCamOn: con la cámara apagada queremos que reporte
  // `cam_off`, no que se congele en el último estado.
  const faceWatch = useFaceWatch(localCameraTrack, !!onFaceStateChange && localCamOn);

  // EL SUPERVISOR VIVE ACÁ, no en la página de Cowork. Esta vista sobrevive a
  // navegar a otra sección de Maven (se muda a la ventanita flotante); la
  // página no. Cuando el aviso vivía allá, se apagaba justo cuando la persona
  // se iba a mirar otra pantalla — o sea, justo cuando más falta hace.
  useFaceNudge(supervisorEncuadre ? faceWatch : null);
  const onFaceStateChangeRef = useRef(onFaceStateChange);
  onFaceStateChangeRef.current = onFaceStateChange;
  useEffect(() => {
    onFaceStateChangeRef.current?.(faceWatch);
  }, [faceWatch]);

  useEffect(() => {
    onMediaStateChangeRef.current?.({ micOn: localMicOn, camOn: localCamOn, screenShareOn: localScreenShare });
  }, [localMicOn, localCamOn, localScreenShare]);

  const effectiveLayout: "grid" | "sidebar" = useMemo(() => {
    if (pinnedSid) return "sidebar";
    const mode = viewSettings.layout;
    if (mode === "sidebar") return "sidebar";
    if (mode === "tiled") return "grid";
    return lk.participants.some((p) => p.isScreenSharing) ? "sidebar" : "grid";
  }, [viewSettings.layout, lk.participants, pinnedSid]);

  const visibleParticipants = useMemo(() => {
    let list = lk.participants;
    if (viewSettings.hideNoVideo) list = list.filter((p) => !p.isCameraOff || p.isScreenSharing || p.isLocal);
    if (list.length > viewSettings.maxTiles) list = list.slice(0, viewSettings.maxTiles);
    return list;
  }, [lk.participants, viewSettings.hideNoVideo, viewSettings.maxTiles]);

  const spotlightParticipant = useMemo(() => {
    if (pinnedSid) {
      const pinned = visibleParticipants.find((p) => p.sid === pinnedSid);
      if (pinned) return pinned;
    }
    const ss = visibleParticipants.find((p) => p.isScreenSharing);
    return ss || visibleParticipants.find((p) => p.identity === lk.activeSpeaker) || visibleParticipants[0];
  }, [visibleParticipants, lk.activeSpeaker, pinnedSid]);

  const room = lk.getRoom();

  if (lk.connectionState === ConnectionState.Connecting) {
    return (
      <div className="flex flex-col h-full bg-background text-foreground items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Conectando a la sala...</p>
      </div>
    );
  }

  if (lk.error) {
    return (
      <div className="flex flex-col h-full bg-background text-foreground items-center justify-center gap-4">
        <p className="text-destructive font-medium">Error de conexión</p>
        <p className="text-sm text-muted-foreground max-w-md text-center">{lk.error}</p>
        <button onClick={handleLeave} className="mt-4 px-4 py-2 rounded-full bg-primary text-white text-sm hover:bg-primary/90">Volver</button>
      </div>
    );
  }

  const gridCols =
    visibleParticipants.length <= 1 ? "grid-cols-1"
    : visibleParticipants.length <= 2 ? "grid-cols-1 md:grid-cols-2"
    : visibleParticipants.length <= 4 ? "grid-cols-2"
    : visibleParticipants.length <= 9 ? "grid-cols-2 md:grid-cols-3"
    : "grid-cols-3 md:grid-cols-4";

  return (
    <div ref={rootRef} className="flex flex-col h-full bg-background text-foreground">
      <CallTopBar roomName={callDisplayName || roomName} participantCount={lk.participants.length} onOpenAdjustView={() => setAdjustViewOpen(true)} shareLink={shareLink} hideShareLink={hideShareLink} compact={effectiveCompact} />

      {lk.isReconnecting && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-1.5 bg-warning/15 text-warning text-xs font-medium">
          <WifiOff className="h-3.5 w-3.5 animate-pulse" /> Reconectando...
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="relative flex-1 p-3 overflow-hidden">
          <div className="absolute left-5 top-5 z-20">
            <RecordingControl
              room={room}
              roomName={roomName}
              source={recording?.source ?? "cowork"}
              title={recording?.title}
              canControl={!!recording}
              compact={effectiveCompact}
            />
          </div>
          {effectiveLayout === "grid" ? (
            <div className={cn("grid gap-2 h-full", gridCols)}>
              {visibleParticipants.map((p) => <ParticipantTile key={`${p.identity}-${p.sid}`} participant={p} room={room} preferredAudioOutputDeviceId={audioOutputId} onMuteParticipant={lk.muteParticipant} onRemoveParticipant={lk.removeParticipant} onPinParticipant={handlePinParticipant} pinnedSid={pinnedSid} isAdmin={isAdmin} />)}
            </div>
          ) : (
            <div className="flex h-full gap-2">
              {spotlightParticipant && <div className="flex-1"><ParticipantTile participant={spotlightParticipant} room={room} large className="h-full" preferredAudioOutputDeviceId={audioOutputId} onMuteParticipant={lk.muteParticipant} onRemoveParticipant={lk.removeParticipant} onPinParticipant={handlePinParticipant} pinnedSid={pinnedSid} isAdmin={isAdmin} /></div>}
              {visibleParticipants.filter((p) => p.sid !== spotlightParticipant?.sid).length > 0 && (
                <div className="flex flex-col gap-2 w-48 shrink-0 overflow-y-auto">
                  {visibleParticipants.filter((p) => p.sid !== spotlightParticipant?.sid).map((p) => (
                    <div key={`${p.identity}-${p.sid}`} className="h-28 shrink-0"><ParticipantTile participant={p} room={room} preferredAudioOutputDeviceId={audioOutputId} onMuteParticipant={lk.muteParticipant} onRemoveParticipant={lk.removeParticipant} onPinParticipant={handlePinParticipant} pinnedSid={pinnedSid} isAdmin={isAdmin} /></div>
                  ))}
                </div>
              )}
            </div>
          )}

          {lk.participants.length <= 1 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center px-4">
              <div className="rounded-full bg-[hsl(220_3%_20%/0.9)] border border-border px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">Esperando a que otros participantes se unan...</div>
            </div>
          )}


        </div>

        {chatOpen && <CallChatSidebar messages={lk.chatMessages} onSend={lk.sendChatMessage} onClose={() => setChatOpen(false)} localIdentity={room?.localParticipant.identity || ""} />}
        {/* El aviso de encuadre se le muestra a la PROPIA persona: si el sistema
          detecta que no se le ve, que se entere y se acomode. Es una ayuda, no
          una cámara de vigilancia silenciosa. */}
      {onFaceStateChange && faceStateLabel(faceWatch.state) && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 backdrop-blur-sm">
          <span className="text-[11px] text-amber-500">{faceStateLabel(faceWatch.state)}</span>
        </div>
      )}

      {participantsOpen && (
          <CallParticipantsSidebar
            participants={lk.participants}
            isAdmin={isAdmin}
            onMuteParticipant={handleModeration(lk.muteParticipant, "Silenciado")}
            onRemoveParticipant={handleModeration(lk.removeParticipant, "Sacado de la llamada")}
            onSetCanPublish={(identity, canPublish) =>
              runModeration(
                () => lk.setParticipantCanPublish(identity, canPublish),
                canPublish ? "Puede volver a hablar" : "Queda solo como oyente",
              )}
            onSetCohost={(identity, isCohost) =>
              runModeration(
                () => lk.setCohost(identity, isCohost),
                isCohost ? "Ahora es co-anfitrión" : "Ya no es co-anfitrión",
              )}
            onMuteAll={() => runModeration(
              async () => {
                const muted = await lk.muteAllParticipants();
                return muted;
              },
              "Todos silenciados",
            )}
            onEndForAll={async () => {
              if (!window.confirm("¿Terminar la llamada para todos los participantes?")) return;
              await runModeration(lk.endRoomForAll, "Llamada terminada para todos");
            }}
            onClose={() => setParticipantsOpen(false)}
          />
        )}
      </div>

      {/* Safety-net: ensures every remote mic is audible even if its tile isn't mounted */}
      <RoomAudioSink room={room} preferredAudioOutputDeviceId={audioOutputId} />

      <CallControls
        isMicOn={lk.isMicOn}
        isCamOn={lk.isCamOn}
        isScreenSharing={lk.isScreenSharing}
        isHandRaised={lk.isHandRaised}
        isChatOpen={chatOpen}
        unreadChatCount={lk.unreadChatCount}
        isParticipantsOpen={participantsOpen}
        currentAudioInputId={audioInputId}
        currentAudioOutputId={audioOutputId}
        currentVideoInputId={videoInputId}
        onToggleMic={lk.toggleMic}
        onToggleCam={lk.toggleCam}
        onToggleScreenShare={lk.toggleScreenShare}
        onToggleHand={lk.toggleHand}
        onToggleChat={() => { const w = !chatOpen; setChatOpen(w); if (w) { setParticipantsOpen(false); lk.clearUnreadChat(); } }}
        onToggleParticipants={() => { setParticipantsOpen(!participantsOpen); if (!participantsOpen) setChatOpen(false); }}
        onSendReaction={lk.sendReaction}
        onLeave={handleLeave}
        onAudioInputChange={handleAudioInputChange}
        onAudioOutputChange={handleAudioOutputChange}
        onVideoInputChange={handleVideoInputChange}
        onOpenVideoSettings={() => setVideoSettingsOpen(true)}
        onOpenMetrics={() => setMetricsOpen(true)}
        hideScreenShare={hideScreenShare}
        hideLeaveButton={hideLeaveButton}
        leaveLabel={leaveLabel}
        leaveIcon={leaveIcon}
        compact={effectiveCompact}
        backgroundEffect={bgEffect}
        onToggleBlurBackground={() => handleBgChange(bgEffect === "blur" ? "none" : "blur")}
      />

      <AdjustViewDialog open={adjustViewOpen} onClose={() => setAdjustViewOpen(false)} settings={viewSettings} onSettingsChange={handleViewSettingsChange} />

      <VideoSettingsDialog
        open={videoSettingsOpen}
        onClose={() => setVideoSettingsOpen(false)}
        currentVideoInputId={videoInputId}
        onVideoInputChange={handleVideoInputChange}
        backgroundEffect={bgEffect}
        onBackgroundChange={handleBgChange}
      />

      <MetricsDialog
        open={metricsOpen}
        onClose={() => setMetricsOpen(false)}
        room={room}
        participants={lk.participants}
      />
    </div>
  );
}
