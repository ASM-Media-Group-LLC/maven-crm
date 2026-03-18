import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Hand, Monitor, Loader2 } from "lucide-react";
import { toast } from "sonner";
import LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";
import type { useCoworkSession } from "@/hooks/useCoworkSession";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  cowork: ReturnType<typeof useCoworkSession>;
  userId: string;
}

export default function CoworkParticipantView({ cowork, userId }: Props) {
  const [displayName, setDisplayName] = useState("User");
  const [ssRequestStatus, setSsRequestStatus] = useState<string | null>(null);
  const [connectedLkRoom, setConnectedLkRoom] = useState<string | null>(null);
  const [manuallyLeft, setManuallyLeft] = useState(false);
  // Track whether we already claimed the current approved request
  const claimedRequestRef = useRef<string | null>(null);
  // Track previous room assignment to detect host-initiated moves
  const prevRoomIdRef = useRef<string | null>(null);

  const myAssignment = cowork.myAssignment;
  const myRoom = cowork.rooms.find(r => r.id === myAssignment?.room_id);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).single();
        setDisplayName(profile?.full_name || "User");
      }
    });
  }, []);

  // When assignment changes, update the connected room
  useEffect(() => {
    // If host moved participant to a different room, reset manuallyLeft
    if (myAssignment?.room_id && prevRoomIdRef.current && myAssignment.room_id !== prevRoomIdRef.current) {
      setManuallyLeft(false);
    }
    prevRoomIdRef.current = myAssignment?.room_id || null;

    if (manuallyLeft) return; // Don't auto-connect if user intentionally left
    if (myRoom?.livekit_room_name && myRoom.livekit_room_name !== connectedLkRoom) {
      setConnectedLkRoom(myRoom.livekit_room_name);
    }
  }, [myRoom?.livekit_room_name, manuallyLeft, myAssignment?.room_id]);

  const mySSReq = cowork.screenShareRequests.find(
    r => r.user_id === userId && r.status === "pending"
  );

  // Detect when screen share request is approved and auto-claim token
  useEffect(() => {
    const approvedReq = cowork.screenShareRequests.find(
      r => r.user_id === userId && (r as any).status === "approved"
    );
    if (approvedReq && claimedRequestRef.current !== approvedReq.id) {
      claimedRequestRef.current = approvedReq.id;
      (async () => {
        try {
          const result = await cowork.claimScreenShareToken(approvedReq.id);
          if (result?.token && result?.url && result?.room) {
            toast.success("Pantalla compartida aprobada. Reconectando...");
            // Force reconnect with new token that has screen share permissions
            setConnectedLkRoom(null);
            setTimeout(() => setConnectedLkRoom(result.room), 300);
          }
        } catch (e: any) {
          toast.error(e.message || "Error al reclamar permisos de pantalla");
        }
      })();
    }
  }, [cowork.screenShareRequests, userId, cowork.claimScreenShareToken]);

  if (!myAssignment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
        <p className="text-muted-foreground">Esperando asignación de sala por el host...</p>
        <p className="text-xs text-muted-foreground">Sesión: {cowork.session?.name}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#202124]">
      {/* Top bar with cowork-specific actions */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#202124] border-b border-white/10 z-10">
        <div className="flex items-center gap-3">
          <span className="text-white/90 text-sm font-medium">{myRoom?.name || "Sala"}</span>
          <span className="text-white/40 text-xs">{cowork.session?.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-white/70 hover:text-white hover:bg-white/10 gap-1.5"
            onClick={async () => {
              try {
                await cowork.requestHost(myAssignment.room_id, "Necesito ayuda");
                toast.success("Solicitud enviada al host");
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          >
            <Hand className="h-4 w-4" /> Pedir host
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-white/70 hover:text-white hover:bg-white/10 gap-1.5"
            disabled={!!mySSReq}
            onClick={async () => {
              try {
                await cowork.requestScreenShare(myAssignment.room_id);
                toast.info("Solicitud de pantalla enviada, esperando aprobación...");
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          >
            <Monitor className="h-4 w-4" />
            {mySSReq ? "Esperando aprobación..." : "Compartir pantalla"}
          </Button>
        </div>
      </div>

      {/* Video area using existing LiveKitCallView */}
      <div className="flex-1 min-h-0">
        {connectedLkRoom ? (
          <LiveKitCallView
            roomName={connectedLkRoom}
            displayName={displayName}
            callDisplayName={myRoom?.name}
            isAdmin={false}
            onLeave={() => {
              setConnectedLkRoom(null);
              setManuallyLeft(true);
            }}
            hideShareLink
            hideScreenShare
            initialMicOn={false}
            initialCamOn={false}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-white/60" />
          </div>
        )}
      </div>
    </div>
  );
}
