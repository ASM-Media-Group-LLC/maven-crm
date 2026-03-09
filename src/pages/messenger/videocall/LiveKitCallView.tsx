import { useState, useEffect, useCallback } from "react";
import { ConnectionState } from "livekit-client";
import { useLiveKit } from "@/hooks/useLiveKit";
import CallTopBar from "./CallTopBar";
import CallControls from "./CallControls";
import CallChatSidebar from "./CallChatSidebar";
import CallParticipantsSidebar from "./CallParticipantsSidebar";
import ParticipantTile from "./ParticipantTile";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BackgroundEffect } from "./BackgroundSelector";

interface LiveKitCallViewProps {
  roomName: string;
  displayName: string;
  isAdmin?: boolean;
  onLeave: () => void;
}

export default function LiveKitCallView({ roomName, displayName, isAdmin = false, onLeave }: LiveKitCallViewProps) {
  const lk = useLiveKit();
  const [layout, setLayout] = useState<"grid" | "spotlight">("grid");
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [bgEffect, setBgEffect] = useState<BackgroundEffect>("none");

  const handleBgChange = useCallback(async (effect: BackgroundEffect) => {
    setBgEffect(effect);
    await lk.setBackgroundEffect(effect);
  }, [lk]);

  // Connect on mount
  useEffect(() => {
    lk.connect(roomName, displayName, isAdmin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, displayName, isAdmin]);

  const handleLeave = useCallback(() => {
    lk.disconnect();
    onLeave();
    toast.info("Llamada finalizada");
  }, [lk, onLeave]);

  const shareLink = `${window.location.origin}/call/${encodeURIComponent(roomName)}`;

  // Find screen sharer for spotlight
  const screenSharer = lk.participants.find((p) => p.isScreenSharing);
  const spotlightParticipant = screenSharer || lk.participants.find((p) => p.identity === lk.activeSpeaker) || lk.participants[0];

  const room = lk.getRoom();

  if (lk.connectionState === ConnectionState.Connecting) {
    return (
      <div className="flex flex-col h-full bg-[hsl(240_10%_6%)] text-[hsl(0_0%_96%)] items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-[hsl(0_0%_96%/0.7)]">Conectando a la sala...</p>
      </div>
    );
  }

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
        roomName={roomName}
        participantCount={lk.participants.length}
        layout={layout}
        onToggleLayout={() => setLayout((l) => (l === "grid" ? "spotlight" : "grid"))}
        shareLink={shareLink}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Video area */}
        <div className="flex-1 p-3 overflow-hidden">
          {layout === "grid" ? (
            <div className={cn("grid gap-2 h-full", gridCols)}>
              {lk.participants.map((p) => (
                <ParticipantTile key={p.sid} participant={p} room={room} />
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
                  />
                </div>
              )}
              {lk.participants.length > 1 && (
                <div className="flex gap-2 h-28 shrink-0 overflow-x-auto">
                  {lk.participants
                    .filter((p) => p.sid !== spotlightParticipant?.sid)
                    .map((p) => (
                      <div key={p.sid} className="w-40 shrink-0">
                        <ParticipantTile participant={p} room={room} />
                      </div>
                    ))}
                </div>
              )}
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
      </div>

      <CallControls
        isMicOn={lk.isMicOn}
        isCamOn={lk.isCamOn}
        isScreenSharing={lk.isScreenSharing}
        isHandRaised={lk.isHandRaised}
        isChatOpen={chatOpen}
        isParticipantsOpen={participantsOpen}
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
