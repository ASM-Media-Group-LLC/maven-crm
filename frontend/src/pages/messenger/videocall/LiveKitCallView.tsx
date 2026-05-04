import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ConnectionState } from "livekit-client";
import { useLiveKit } from "@/hooks/useLiveKit";
import CallTopBar from "./CallTopBar";
import CallControls from "./CallControls";
import CallChatSidebar from "./CallChatSidebar";
import CallParticipantsSidebar from "./CallParticipantsSidebar";
import AdjustViewDialog, { type ViewSettings } from "./AdjustViewDialog";
import VideoSettingsDialog from "./VideoSettingsDialog";
import MetricsDialog from "./MetricsDialog";
import ParticipantTile from "./ParticipantTile";
import RoomAudioSink from "./RoomAudioSink";

import { Loader2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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
}

export default function LiveKitCallView({ roomName, displayName, callDisplayName, isAdmin = false, onLeave, initialMicOn = true, initialCamOn = true, initialAudioDeviceId, initialVideoDeviceId, initialAudioOutputDeviceId, initialBackgroundEffect = "none", hideShareLink, hideScreenShare, hideLeaveButton, leaveLabel, leaveIcon, suppressLeaveToast, compact, autoLeaveOnEmpty, getToken, onMediaStateChange }: LiveKitCallViewProps) {
  const lk = useLiveKit();
  const [viewSettings, setViewSettings] = useState<ViewSettings>(DEFAULT_VIEW_SETTINGS);
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

  const handleAudioInputChange = useCallback((id: string) => { setAudioInputId(id); lk.switchAudioInput?.(id); }, [lk]);
  const handleAudioOutputChange = useCallback((id: string) => { setAudioOutputId(id); lk.switchAudioOutput?.(id); }, [lk]);
  const handleVideoInputChange = useCallback((id: string) => { setVideoInputId(id); lk.switchVideoInput?.(id); }, [lk]);

  const handlePinParticipant = useCallback((sid: string) => {
    setPinnedSid((prev) => prev === sid ? null : sid);
  }, []);

  const shareLink = useMemo(() => {
    const params = new URLSearchParams();
    const n = (callDisplayName || roomName).trim();
    if (n) params.set("name", n);
    const qs = params.toString();
    return `${window.location.origin}/call/${encodeURIComponent(roomName)}${qs ? `?${qs}` : ""}`;
  }, [roomName, callDisplayName]);

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
      <div className="flex flex-col h-full bg-[hsl(220_3%_14%)] text-[hsl(220_3%_85%)] items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-[hsl(214_82%_51%)]" />
        <p className="text-sm text-[hsl(220_3%_60%)]">Conectando a la sala...</p>
      </div>
    );
  }

  if (lk.error) {
    return (
      <div className="flex flex-col h-full bg-[hsl(220_3%_14%)] text-[hsl(220_3%_85%)] items-center justify-center gap-4">
        <p className="text-[hsl(0_72%_65%)] font-medium">Error de conexión</p>
        <p className="text-sm text-[hsl(220_3%_55%)] max-w-md text-center">{lk.error}</p>
        <button onClick={handleLeave} className="mt-4 px-4 py-2 rounded-full bg-[hsl(214_82%_51%)] text-white text-sm hover:bg-[hsl(214_82%_45%)]">Volver</button>
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
    <div className="flex flex-col h-full bg-[hsl(220_3%_14%)] text-[hsl(220_3%_85%)]">
      <CallTopBar roomName={callDisplayName || roomName} participantCount={lk.participants.length} onOpenAdjustView={() => setAdjustViewOpen(true)} shareLink={shareLink} hideShareLink={hideShareLink} compact={compact} />

      {lk.isReconnecting && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-1.5 bg-[hsl(40_96%_50%/0.15)] text-[hsl(40_96%_60%)] text-xs font-medium">
          <WifiOff className="h-3.5 w-3.5 animate-pulse" /> Reconectando...
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="relative flex-1 p-3 overflow-hidden">
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
              <div className="rounded-full bg-[hsl(220_3%_20%/0.9)] border border-[hsl(220_3%_30%)] px-3 py-1.5 text-xs text-[hsl(220_3%_60%)] backdrop-blur-sm">Esperando a que otros participantes se unan...</div>
            </div>
          )}


        </div>

        {chatOpen && <CallChatSidebar messages={lk.chatMessages} onSend={lk.sendChatMessage} onClose={() => setChatOpen(false)} localIdentity={room?.localParticipant.identity || ""} />}
        {participantsOpen && <CallParticipantsSidebar participants={lk.participants} isAdmin={isAdmin} onMuteParticipant={lk.muteParticipant} onRemoveParticipant={lk.removeParticipant} onClose={() => setParticipantsOpen(false)} />}
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
        compact={compact}
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
