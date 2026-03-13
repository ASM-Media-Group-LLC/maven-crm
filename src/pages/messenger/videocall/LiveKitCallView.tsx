import { useState, useEffect, useCallback, useMemo } from "react";
import { ConnectionState } from "livekit-client";
import { useLiveKit } from "@/hooks/useLiveKit";
import { useSpeechCaptions } from "@/hooks/useSpeechCaptions";
import CallTopBar from "./CallTopBar";
import CallControls from "./CallControls";
import CallChatSidebar from "./CallChatSidebar";
import CallParticipantsSidebar from "./CallParticipantsSidebar";
import CallMetricsPanel from "./CallMetricsPanel";
import CallCaptions from "./CallCaptions";
import AdjustViewDialog, { type ViewSettings, type LayoutMode } from "./AdjustViewDialog";
import ParticipantTile from "./ParticipantTile";
import { Loader2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BackgroundEffect } from "./BackgroundSelector";

const STORAGE_KEY = "call-view-settings";

function loadViewSettings(): ViewSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { layout: "auto", maxTiles: 49, hideNoVideo: false };
}

function saveViewSettings(s: ViewSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

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
}

export default function LiveKitCallView({ roomName, displayName, callDisplayName, isAdmin = false, onLeave, initialMicOn = true, initialCamOn = true, initialAudioDeviceId, initialVideoDeviceId, initialAudioOutputDeviceId, initialBackgroundEffect = "none" }: LiveKitCallViewProps) {
  const lk = useLiveKit();
  const captions = useSpeechCaptions();
  const [viewSettings, setViewSettings] = useState<ViewSettings>(loadViewSettings);
  const [adjustViewOpen, setAdjustViewOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [bgEffect, setBgEffect] = useState<BackgroundEffect>(initialBackgroundEffect);

  const handleViewSettingsChange = useCallback((s: ViewSettings) => {
    setViewSettings(s);
    saveViewSettings(s);
  }, []);

  // Auto-clear unread chat messages when chat sidebar is open
  useEffect(() => {
    if (chatOpen && lk.unreadChatCount > 0) {
      lk.clearUnreadChat();
    }
  }, [chatOpen, lk.unreadChatCount, lk.clearUnreadChat]);

  const handleBgChange = useCallback((effect: BackgroundEffect) => {
    setBgEffect(effect);

    if (lk.connectionState === ConnectionState.Connected) {
      void lk.setBackgroundEffect(effect);
    }
  }, [lk.connectionState, lk.setBackgroundEffect]);

  // Connect on mount
  useEffect(() => {
    lk.connect(roomName, displayName, isAdmin, {
      initialMicOn,
      initialCamOn,
      audioDeviceId: initialAudioDeviceId,
      videoDeviceId: initialVideoDeviceId,
      audioOutputDeviceId: initialAudioOutputDeviceId,
      backgroundEffect: initialBackgroundEffect,
    });

    return () => {
      lk.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, displayName, isAdmin, initialMicOn, initialCamOn, initialAudioDeviceId, initialVideoDeviceId, initialAudioOutputDeviceId, initialBackgroundEffect]);

  // ── beforeunload: disconnect gracefully when tab/window closes ──
  useEffect(() => {
    const handleBeforeUnload = () => {
      lk.disconnect();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [lk]);

  const handleLeave = useCallback(() => {
    lk.disconnect();
    onLeave();
    toast.info("Llamada finalizada");
  }, [lk, onLeave]);

  const shareLink = useMemo(() => {
    const params = new URLSearchParams();
    const resolvedDisplayName = (callDisplayName || roomName).trim();

    if (resolvedDisplayName) {
      params.set("name", resolvedDisplayName);
    }

    const qs = params.toString();
    return `${window.location.origin}/call/${encodeURIComponent(roomName)}${qs ? `?${qs}` : ""}`;
  }, [roomName, callDisplayName]);

  // ── Resolve effective layout based on settings ──
  const effectiveLayout: "grid" | "spotlight" | "sidebar" = useMemo(() => {
    const mode = viewSettings.layout;
    if (mode === "spotlight") return "spotlight";
    if (mode === "sidebar") return "sidebar";
    if (mode === "tiled") return "grid";
    // auto: use spotlight if screen sharing, otherwise grid
    const hasScreenShare = lk.participants.some((p) => p.isScreenSharing);
    return hasScreenShare ? "spotlight" : "grid";
  }, [viewSettings.layout, lk.participants]);

  // ── Filter participants based on view settings ──
  const visibleParticipants = useMemo(() => {
    let list = lk.participants;
    if (viewSettings.hideNoVideo) {
      list = list.filter((p) => p.isCamOn || p.isScreenSharing || p.isLocal);
    }
    if (list.length > viewSettings.maxTiles) {
      list = list.slice(0, viewSettings.maxTiles);
    }
    return list;
  }, [lk.participants, viewSettings.hideNoVideo, viewSettings.maxTiles]);

  // Find screen sharer for spotlight
  const spotlightParticipant = useMemo(() => {
    const screenSharer = visibleParticipants.find((p) => p.isScreenSharing);
    return screenSharer || visibleParticipants.find((p) => p.identity === lk.activeSpeaker) || visibleParticipants[0];
  }, [visibleParticipants, lk.activeSpeaker]);

  const room = lk.getRoom();

  // ── Loading state ──────────────────────────────────────────────
  if (lk.connectionState === ConnectionState.Connecting) {
    return (
      <div className="flex flex-col h-full bg-[hsl(240_10%_6%)] text-[hsl(0_0%_96%)] items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-[hsl(0_0%_96%/0.7)]">Conectando a la sala...</p>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (lk.error) {
    return (
      <div className="flex flex-col h-full bg-[hsl(240_10%_6%)] text-[hsl(0_0%_96%)] items-center justify-center gap-4">
        <p className="text-destructive font-medium">Error de conexión</p>
        <p className="text-sm text-[hsl(0_0%_96%/0.5)] max-w-md text-center">{lk.error}</p>
        <button
          onClick={handleLeave}
          className="mt-4 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm"
        >
          Volver
        </button>
      </div>
    );
  }

  // ── Grid columns ───────────────────────────────────────────────
  const gridCols =
    visibleParticipants.length <= 1
      ? "grid-cols-1"
      : visibleParticipants.length <= 2
        ? "grid-cols-1 md:grid-cols-2"
        : visibleParticipants.length <= 4
          ? "grid-cols-2"
          : visibleParticipants.length <= 9
            ? "grid-cols-2 md:grid-cols-3"
            : "grid-cols-3 md:grid-cols-4";

  return (
    <div className="flex flex-col h-full bg-[hsl(240_10%_6%)] text-[hsl(0_0%_96%)]">
      <CallTopBar
        roomName={callDisplayName || roomName}
        participantCount={lk.participants.length}
        onOpenAdjustView={() => setAdjustViewOpen(true)}
        shareLink={shareLink}
      />

      {/* Reconnecting banner */}
      {lk.isReconnecting && (
        <div className="shrink-0 flex items-center justify-center gap-2 py-1.5 bg-amber-500/20 text-amber-300 text-xs font-medium">
          <WifiOff className="h-3.5 w-3.5 animate-pulse" />
          Reconectando...
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Video area */}
        <div className="relative flex-1 p-3 overflow-hidden">
          {effectiveLayout === "grid" ? (
            <div className={cn("grid gap-2 h-full", gridCols)}>
              {visibleParticipants.map((p) => (
                <ParticipantTile key={`${p.identity}-${p.sid}`} participant={p} room={room} preferredAudioOutputDeviceId={initialAudioOutputDeviceId} />
              ))}
            </div>
          ) : effectiveLayout === "sidebar" ? (
            <div className="flex h-full gap-2">
              {spotlightParticipant && (
                <div className="flex-1">
                  <ParticipantTile
                    participant={spotlightParticipant}
                    room={room}
                    large
                    className="h-full"
                    preferredAudioOutputDeviceId={initialAudioOutputDeviceId}
                  />
                </div>
              )}
              {visibleParticipants.length > 1 && (
                <div className="flex flex-col gap-2 w-48 shrink-0 overflow-y-auto">
                  {visibleParticipants
                    .filter((p) => p.sid !== spotlightParticipant?.sid)
                    .map((p) => (
                      <div key={`${p.identity}-${p.sid}`} className="h-28 shrink-0">
                        <ParticipantTile participant={p} room={room} preferredAudioOutputDeviceId={initialAudioOutputDeviceId} />
                      </div>
                    ))}
                </div>
              )}
            </div>
          ) : (
            /* spotlight */
            <div className="flex flex-col h-full gap-2">
              {spotlightParticipant && (
                <div className="flex-1">
                  <ParticipantTile
                    participant={spotlightParticipant}
                    room={room}
                    large
                    className="h-full"
                    preferredAudioOutputDeviceId={initialAudioOutputDeviceId}
                  />
                </div>
              )}
              {visibleParticipants.length > 1 && (
                <div className="flex gap-2 h-28 shrink-0 overflow-x-auto">
                  {visibleParticipants
                    .filter((p) => p.sid !== spotlightParticipant?.sid)
                    .map((p) => (
                      <div key={`${p.identity}-${p.sid}`} className="w-40 shrink-0">
                        <ParticipantTile participant={p} room={room} preferredAudioOutputDeviceId={initialAudioOutputDeviceId} />
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {lk.participants.length <= 1 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center px-4">
              <div className="rounded-full bg-background/80 border border-border px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
                Esperando a que otros participantes se unan...
              </div>
            </div>
          )}

          {/* Captions overlay */}
          {captions.isActive && (
            <CallCaptions captions={captions.captions} interimText={captions.interimText} />
          )}
        </div>

        {/* Sidebars */}
        {chatOpen && (
          <CallChatSidebar
            messages={lk.chatMessages}
            onSend={lk.sendChatMessage}
            onClose={() => setChatOpen(false)}
            localIdentity={room?.localParticipant.identity || ""}
          />
        )}
        {participantsOpen && (
          <CallParticipantsSidebar
            participants={lk.participants}
            isAdmin={isAdmin}
            onMuteParticipant={lk.muteParticipant}
            onRemoveParticipant={lk.removeParticipant}
            onClose={() => setParticipantsOpen(false)}
          />
        )}
        {metricsOpen && (
          <CallMetricsPanel
            room={room}
            participants={lk.participants}
            onClose={() => setMetricsOpen(false)}
          />
        )}
      </div>

      <CallControls
        isMicOn={lk.isMicOn}
        isCamOn={lk.isCamOn}
        isScreenSharing={lk.isScreenSharing}
        isHandRaised={lk.isHandRaised}
        isChatOpen={chatOpen}
        unreadChatCount={lk.unreadChatCount}
        isParticipantsOpen={participantsOpen}
        isMetricsOpen={metricsOpen}
        isCaptionsOn={captions.isActive}
        captionsLanguage={captions.language}
        captionsSupported={captions.isSupported}
        backgroundEffect={bgEffect}
        onToggleMic={lk.toggleMic}
        onToggleCam={lk.toggleCam}
        onToggleScreenShare={lk.toggleScreenShare}
        onToggleHand={lk.toggleHand}
        onToggleChat={() => {
          const willOpen = !chatOpen;
          setChatOpen(willOpen);
          if (willOpen) {
            setParticipantsOpen(false);
            setMetricsOpen(false);
            lk.clearUnreadChat();
          }
        }}
        onToggleParticipants={() => { setParticipantsOpen(!participantsOpen); if (!participantsOpen) { setChatOpen(false); setMetricsOpen(false); } }}
        onToggleMetrics={() => { setMetricsOpen(!metricsOpen); if (!metricsOpen) { setChatOpen(false); setParticipantsOpen(false); } }}
        onToggleCaptions={captions.toggle}
        onCaptionsLanguageChange={captions.changeLanguage}
        onSendReaction={lk.sendReaction}
        onBackgroundChange={handleBgChange}
        onLeave={handleLeave}
      />

      {/* Adjust View Dialog */}
      <AdjustViewDialog
        open={adjustViewOpen}
        onClose={() => setAdjustViewOpen(false)}
        settings={viewSettings}
        onSettingsChange={handleViewSettingsChange}
      />
    </div>
  );
}
