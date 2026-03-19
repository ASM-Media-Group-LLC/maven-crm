import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Hand, Monitor, Loader2, Crown, Phone } from "lucide-react";
import { toast } from "sonner";
import LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";
import type { useCoworkSession } from "@/hooks/useCoworkSession";
import { supabase } from "@/integrations/supabase/client";
import { useCoworkMediaPresence } from "@/hooks/useCoworkMediaPresence";

type TokenResult = { token: string; url: string; room?: string } | null;

interface Props {
  cowork: ReturnType<typeof useCoworkSession>;
  userId: string;
}

export default function CoworkParticipantView({ cowork, userId }: Props) {
  const [displayName, setDisplayName] = useState("User");
  const [ssRequestStatus, setSsRequestStatus] = useState<string | null>(null);
  const [connectedLkRoom, setConnectedLkRoom] = useState<string | null>(null);
  const [manuallyLeft, setManuallyLeft] = useState(false);
  const [hasScreenShareAccess, setHasScreenShareAccess] = useState(false);
  const claimedRequestRef = useRef<string | null>(null);
  const prevRoomIdRef = useRef<string | null>(null);
  const screenShareTokenRef = useRef<TokenResult>(null);
  const dismissedRequestRef = useRef<string | null>(null);
  const oneOnOneWasActiveRef = useRef(false);
  const pendingOneOnOneRef = useRef(false);

  // 1:1 state
  const [oneOnOneRoom, setOneOnOneRoom] = useState<string | null>(null);
  const [oneOnOneRequestId, setOneOnOneRequestId] = useState<string | null>(null);

  const myAssignment = cowork.myAssignment;
  const myRoom = cowork.rooms.find(r => r.id === myAssignment?.room_id);

  // Media presence broadcasting
  const { trackMediaState } = useCoworkMediaPresence(cowork.session?.id, userId);
  const handleMediaStateChange = useCallback(
    (state: { micOn: boolean; camOn: boolean; screenShareOn: boolean }) => {
      trackMediaState(state);
    },
    [trackMediaState]
  );

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
    if (myAssignment?.room_id && prevRoomIdRef.current && myAssignment.room_id !== prevRoomIdRef.current) {
      setManuallyLeft(false);
      setHasScreenShareAccess(false);
      screenShareTokenRef.current = null;
    }
    prevRoomIdRef.current = myAssignment?.room_id || null;

    if (manuallyLeft || oneOnOneRoom) return; // don't reconnect main room during 1:1
    if (myRoom?.livekit_room_name && myRoom.livekit_room_name !== connectedLkRoom) {
      setConnectedLkRoom(myRoom.livekit_room_name);
    }
  }, [myRoom?.livekit_room_name, manuallyLeft, myAssignment?.room_id, oneOnOneRoom]);

  const myOpenRequest = cowork.hostRequests.find(
    r => r.user_id === userId && (r.status === "open" || r.status === "acknowledged")
  );
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
            setHasScreenShareAccess(true);
            screenShareTokenRef.current = { token: result.token, url: result.url, room: result.room };
            setConnectedLkRoom(null);
            setTimeout(() => setConnectedLkRoom(result.room), 300);
          }
        } catch (e: any) {
          toast.error(e.message || "Error al reclamar permisos de pantalla");
        }
      })();
    }
  }, [cowork.screenShareRequests, userId, cowork.claimScreenShareToken]);

  // Auto-close 1:1 overlay when host request is resolved
  useEffect(() => {
    if (!oneOnOneRequestId) return;
    const req = cowork.hostRequests.find(r => r.id === oneOnOneRequestId);
    if (req) {
      // Request found — mark as active so we can detect when it disappears
      oneOnOneWasActiveRef.current = true;
      if (req.status === "resolved") {
        setOneOnOneRoom(null);
        setOneOnOneRequestId(null);
        dismissedRequestRef.current = null;
        oneOnOneWasActiveRef.current = false;
        // Auto-reconnect to main room
        setManuallyLeft(false);
        if (myRoom?.livekit_room_name) setConnectedLkRoom(myRoom.livekit_room_name);
        toast.info("Llamada privada con host finalizada");
      }
    } else if (oneOnOneWasActiveRef.current) {
      setOneOnOneRoom(null);
      setOneOnOneRequestId(null);
      dismissedRequestRef.current = null;
      oneOnOneWasActiveRef.current = false;
      setManuallyLeft(false);
      if (myRoom?.livekit_room_name) setConnectedLkRoom(myRoom.livekit_room_name);
      toast.info("Llamada privada con host finalizada");
    }
  }, [cowork.hostRequests, oneOnOneRequestId]);

  // Auto-restore 1:1 overlay from existing open/acknowledged requests (handles refresh/re-entry)
  useEffect(() => {
    if (oneOnOneRequestId || pendingOneOnOneRef.current) return;
    const existingReq = cowork.hostRequests.find(
      r => r.user_id === userId && (r.status === "open" || r.status === "acknowledged") && r.oneone_livekit_room
    );
    if (existingReq && dismissedRequestRef.current !== existingReq.id) {
      setOneOnOneRequestId(existingReq.id);
      setOneOnOneRoom(existingReq.oneone_livekit_room!);
      setConnectedLkRoom(null); // disconnect main room
    }
  }, [cowork.hostRequests, userId, oneOnOneRequestId]);

  // Token provider: use screen share token if available, otherwise regular cowork token
  const getToken = useCallback(async () => {
    const ssToken = screenShareTokenRef.current;
    if (ssToken) {
      screenShareTokenRef.current = null;
      return { token: ssToken.token, url: ssToken.url };
    }
    const result = await cowork.issueLiveKitToken("join_room");
    return { token: result.token, url: result.url };
  }, [cowork.issueLiveKitToken]);

  // Token provider for 1:1 room
  const getOneOnOneToken = useCallback(async () => {
    if (!oneOnOneRequestId) throw new Error("No 1:1 request");
    const result = await cowork.joinOneOnOne(oneOnOneRequestId);
    return { token: result.token, url: result.url };
  }, [cowork.joinOneOnOne, oneOnOneRequestId]);

  if (!myAssignment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
        <p className="text-muted-foreground">Esperando asignación de sala por el host...</p>
        <p className="text-xs text-muted-foreground">Sesión: {cowork.session?.name}</p>
      </div>
    );
  }

  const isInOneOnOne = !!oneOnOneRoom;

  return (
    <div className="flex flex-col h-screen bg-[#202124]">
      {/* Top bar with cowork-specific actions */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#202124] border-b border-white/10 z-10">
        <div className="flex items-center gap-3">
          {isInOneOnOne ? (
            <>
              <Crown className="h-4 w-4 text-amber-400" />
              <span className="text-amber-400 text-sm font-medium">Llamada privada con host</span>
            </>
          ) : (
            <>
              <span className="text-white/90 text-sm font-medium">{myRoom?.name || "Sala"}</span>
              <span className="text-white/40 text-xs">{cowork.session?.name}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Simple notification request */}
          <Button
            variant="ghost"
            size="sm"
            className="text-white/70 hover:text-white hover:bg-white/10 gap-1.5"
            disabled={isInOneOnOne}
            onClick={async () => {
              dismissedRequestRef.current = null;
              try {
                await cowork.requestHost(myAssignment.room_id, "Necesito ayuda");
                toast.success("Solicitud enviada al host");
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          >
            <Hand className="h-4 w-4" /> {myOpenRequest && !isInOneOnOne ? "Solicitud enviada" : "Pedir host ingrese a la sala"}
          </Button>
          {/* 1:1 video call request */}
          <Button
            variant="ghost"
            size="sm"
            className="text-white/70 hover:text-white hover:bg-white/10 gap-1.5"
            disabled={!!myOpenRequest || isInOneOnOne}
            onClick={async () => {
              pendingOneOnOneRef.current = true;
              try {
                const result = await cowork.requestHost(myAssignment.room_id, "Llamada 1:1", true);
                toast.success("Solicitud de llamada enviada al host");
                const roomName = result?.oneone_livekit_room || result?.request?.oneone_livekit_room;
                const reqId = result?.request?.id;
                if (roomName && reqId) {
                  setOneOnOneRequestId(reqId);
                  setOneOnOneRoom(roomName);
                  setConnectedLkRoom(null); // disconnect main room
                }
              } catch (e: any) {
                toast.error(e.message);
              } finally {
                pendingOneOnOneRef.current = false;
              }
            }}
          >
            <Phone className="h-4 w-4" /> {isInOneOnOne ? "En llamada con host..." : "Llamar host"}
          </Button>
          {!hasScreenShareAccess && (
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
          )}
        </div>
      </div>

      {/* Video area */}
      <div className="flex-1 min-h-0">
        {isInOneOnOne && oneOnOneRoom && oneOnOneRequestId ? (
          <LiveKitCallView
            roomName={oneOnOneRoom}
            displayName={displayName}
            callDisplayName="1:1 con Host"
            isAdmin={false}
            onLeave={async () => {
              if (oneOnOneRequestId) {
                try { await cowork.resolveHostRequest(oneOnOneRequestId); } catch {}
              }
              setOneOnOneRoom(null);
              setOneOnOneRequestId(null);
              // Auto-reconnect to main room
              setManuallyLeft(false);
              if (myRoom?.livekit_room_name) {
                setConnectedLkRoom(myRoom.livekit_room_name);
              }
            }}
            hideShareLink
            initialMicOn={false}
            initialCamOn={false}
            getToken={getOneOnOneToken}
          />
        ) : connectedLkRoom ? (
          <LiveKitCallView
            roomName={connectedLkRoom}
            displayName={displayName}
            callDisplayName={myRoom?.name}
            isAdmin={false}
            onLeave={() => {
              setConnectedLkRoom(null);
              setManuallyLeft(true);
              setHasScreenShareAccess(false);
              screenShareTokenRef.current = null;
            }}
            hideShareLink
            hideScreenShare={!hasScreenShareAccess}
            initialMicOn={false}
            initialCamOn={false}
            getToken={getToken}
            onMediaStateChange={handleMediaStateChange}
          />
        ) : manuallyLeft ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-white/60 text-sm">Has salido de la sala</p>
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setManuallyLeft(false);
                if (myRoom?.livekit_room_name) {
                  setConnectedLkRoom(myRoom.livekit_room_name);
                }
              }}
            >
              Reconectar
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-white/60" />
          </div>
        )}
      </div>
    </div>
  );
}
