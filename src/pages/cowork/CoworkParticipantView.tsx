import { useState, useEffect, useCallback } from "react";
import { Room, RoomEvent, ConnectionState } from "livekit-client";
import { Button } from "@/components/ui/button";
import { Hand, Monitor, Loader2 } from "lucide-react";
import { toast } from "sonner";
import LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";
import type { useCoworkSession } from "@/hooks/useCoworkSession";

interface Props {
  cowork: ReturnType<typeof useCoworkSession>;
  userId: string;
}

export default function CoworkParticipantView({ cowork, userId }: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [ssRequestStatus, setSsRequestStatus] = useState<string | null>(null);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);

  const myAssignment = cowork.myAssignment;
  const myRoom = cowork.rooms.find(r => r.id === myAssignment?.room_id);

  // Connect to assigned room
  const connectToRoom = useCallback(async (roomId: string) => {
    if (connecting) return;
    setConnecting(true);
    try {
      // Disconnect from current
      if (room) {
        await room.disconnect(true);
        setRoom(null);
      }

      const result = await cowork.issueLiveKitToken("join_room", roomId);

      const newRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: { resolution: { width: 1280, height: 720, frameRate: 30 } },
      });

      await newRoom.connect(result.url, result.token);
      setRoom(newRoom);
      setCurrentRoomId(roomId);
    } catch (e: any) {
      toast.error("Error al conectar: " + e.message);
    } finally {
      setConnecting(false);
    }
  }, [room, cowork, connecting]);

  // Auto-connect when assigned to a room
  useEffect(() => {
    if (myAssignment?.room_id && myAssignment.room_id !== currentRoomId) {
      connectToRoom(myAssignment.room_id);
    }
  }, [myAssignment?.room_id]);

  // Listen for room reassignment (move) via Realtime
  useEffect(() => {
    if (!myAssignment) return;
    // When assignment changes, the useEffect above will reconnect
  }, [myAssignment]);

  // Cleanup
  useEffect(() => {
    return () => {
      room?.disconnect(true);
    };
  }, []);

  // Check screenshare request status
  const mySSReq = cowork.screenShareRequests.find(
    r => r.user_id === userId && r.status === "pending"
  );

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
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#202124] border-b border-white/10">
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

      {/* Video area */}
      <div className="flex-1 min-h-0">
        {room ? (
          <LiveKitCallView
            room={room}
            isAdmin={false}
            onLeave={() => {
              room.disconnect(true);
              setRoom(null);
            }}
          />
        ) : connecting ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-white/60" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
