import { useState, useEffect, useCallback, useMemo } from "react";
import { ConnectionState } from "livekit-client";
import { useLiveKit } from "@/hooks/useLiveKit";
import CallTopBar from "./CallTopBar";
import CallControls from "./CallControls";
import CallChatSidebar from "./CallChatSidebar";
import CallParticipantsSidebar from "./CallParticipantsSidebar";
import CallMetricsPanel from "./CallMetricsPanel";
import ParticipantTile from "./ParticipantTile";
import { Loader2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BackgroundEffect } from "./BackgroundSelector";

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
  const [layout, setLayout] = useState<"grid" | "spotlight">("grid");
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [bgEffect, setBgEffect] = useState<BackgroundEffect>(initialBackgroundEffect);

  const handleBgChange = useCallback(async (effect: BackgroundEffect) => {
    setBgEffect(effect);
    await lk.setBackgroundEffect(effect);
  }, [lk]);

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

  useEffect(() => {
    if (lk.connectionState !== ConnectionState.Connected) return;
    if (!lk.isCamOn || bgEffect === "none") return;
    lk.setBackgroundEffect(bgEffect);
  }, [lk.connectionState, lk.isCamOn, lk.setBackgroundEffect, bgEffect]);

  // Find screen sharer for spotlight
  const spotlightParticipant = useMemo(() => {
    const screenSharer = lk.participants.find((p) => p.isScreenSharing);
    return screenSharer || lk.participants.find((p) => p.identity === lk.activeSpeaker) || lk.participants[0];
  }, [lk.participants, lk.activeSpeaker]);

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
    lk.participants.length <= 1
      ? "grid-cols-1"
      : lk.participants.length <= 2
        ? "grid-cols-1 md:grid-cols-2"
        : lk.participants.length <= 4
          ? "grid-cols-2"
          : lk.participants.length <= 9
            ? "grid-cols-2 md:grid-cols-3"
            : "grid-cols-3 md:grid-cols-4";

  return (
    <div className="flex flex-col h-full bg-[hsl(240_10%_6%)] text-[hsl(0_0%_96%)]">
      <CallTopBar
        roomName={callDisplayName || roomName}
        participantCount={lk.participants.length}
        layout={layout}
        onToggleLayout={() => setLayout((l) => (l === "grid" ? "spotlight" : "grid"))}
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
          {layout === "grid" ? (
            <div className={cn("grid gap-2 h-full", gridCols)}>
              {lk.participants.map((p) => (
                <ParticipantTile key={`${p.identity}-${p.sid}`} participant={p} room={room} preferredAudioOutputDeviceId={initialAudioOutputDeviceId} />
              ))}
            </div>
          ) : (
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
              {lk.participants.length > 1 && (
                <div className="flex gap-2 h-28 shrink-0 overflow-x-auto">
                  {lk.participants
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
        isParticipantsOpen={participantsOpen}
        isMetricsOpen={metricsOpen}
        backgroundEffect={bgEffect}
        onToggleMic={lk.toggleMic}
        onToggleCam={lk.toggleCam}
        onToggleScreenShare={lk.toggleScreenShare}
        onToggleHand={lk.toggleHand}
        onToggleChat={() => { setChatOpen(!chatOpen); if (!chatOpen) setParticipantsOpen(false); }}
        onToggleParticipants={() => { setParticipantsOpen(!participantsOpen); if (!participantsOpen) setChatOpen(false); }}
        onSendReaction={lk.sendReaction}
        onBackgroundChange={handleBgChange}
        onLeave={handleLeave}
      />
    </div>
  );
}
