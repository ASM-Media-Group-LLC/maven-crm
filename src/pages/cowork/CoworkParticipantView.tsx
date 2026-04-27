import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Hand, Monitor, Loader2, Crown, Phone, PhoneCall, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";
import type { useCoworkSession } from "@/hooks/useCoworkSession";
import { supabase } from "@/integrations/supabase/client";
import { useCoworkMediaPresence } from "@/hooks/useCoworkMediaPresence";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type TokenResult = { token: string; url: string; room?: string } | null;

interface Props {
  cowork: ReturnType<typeof useCoworkSession>;
  userId: string;
}

export default function CoworkParticipantView({ cowork, userId }: Props) {
  const isMobile = useIsMobile();
  const [displayName, setDisplayName] = useState("User");
  const [connectedLkRoom, setConnectedLkRoom] = useState<string | null>(null);
  const [manuallyLeft, setManuallyLeft] = useState(false);
  const [hasScreenShareAccess, setHasScreenShareAccess] = useState(false);
  const claimedRequestRef = useRef<string | null>(null);
  const prevRoomIdRef = useRef<string | null>(null);
  const screenShareTokenRef = useRef<TokenResult>(null);
  const dismissedRequestRef = useRef<string | null>(null);
  const pendingOneOnOneRef = useRef(false);
  const oneOnOneSeenInListRef = useRef(false);

  const [oneOnOneRoom, setOneOnOneRoom] = useState<string | null>(null);
  const [oneOnOneRequestId, setOneOnOneRequestId] = useState<string | null>(null);

  const myAssignment = cowork.myAssignment;
  const myRoom = cowork.rooms.find(r => r.id === myAssignment?.room_id);

  const { trackMediaState } = useCoworkMediaPresence(cowork.session?.id, userId);
  const prevScreenShareRef = useRef(false);
  const handleMediaStateChange = useCallback(
    (state: { micOn: boolean; camOn: boolean; screenShareOn: boolean }) => {
      trackMediaState(state);
      // Auto-revoke screen share permission when participant stops sharing.
      // Forces them to request approval again from the host for next share.
      if (prevScreenShareRef.current && !state.screenShareOn && hasScreenShareAccess) {
        setHasScreenShareAccess(false);
        screenShareTokenRef.current = null;
        toast.info("Permiso de pantalla finalizado. Solicítalo nuevamente si lo necesitas.");
        if (myRoom?.livekit_room_name) {
          const roomName = myRoom.livekit_room_name;
          setConnectedLkRoom(null);
          setTimeout(() => setConnectedLkRoom(roomName), 300);
        }
      }
      prevScreenShareRef.current = state.screenShareOn;
    },
    [trackMediaState, hasScreenShareAccess, myRoom?.livekit_room_name]
  );

  const reconnectToMainRoom = useCallback(() => {
    setOneOnOneRoom(null);
    setOneOnOneRequestId(null);
    setManuallyLeft(false);
    if (myRoom?.livekit_room_name) setConnectedLkRoom(myRoom.livekit_room_name);
  }, [myRoom?.livekit_room_name]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).single();
        setDisplayName(profile?.full_name || "User");
      }
    });
  }, []);

  // Best-effort: release the room assignment when the tab/browser is closing,
  // so the host dashboard removes the participant immediately. We use `pagehide`
  // (more reliable than `beforeunload` on mobile/iOS) and `fetch` with
  // `keepalive: true` so the request completes even if the page is unloading.
  useEffect(() => {
    const sessionId = cowork.session?.id;
    if (!sessionId) return;

    const sendLeaveBeacon = () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cowork-session`;
        supabase.auth.getSession().then(({ data }) => {
          const token = data.session?.access_token;
          if (!token) return;
          void fetch(url, {
            method: "POST",
            keepalive: true,
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ action: "leaveRoom", sessionId }),
          }).catch(() => {});
        });
      } catch {
        // best-effort; ignore
      }
    };

    const handlePageHide = (e: PageTransitionEvent) => {
      // Skip when the page is being stored in the bfcache (it may resume later).
      if (e.persisted) return;
      sendLeaveBeacon();
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      // SPA navigation away → release the slot too.
      sendLeaveBeacon();
    };
  }, [cowork.session?.id]);

  useEffect(() => {
    if (myAssignment?.room_id && prevRoomIdRef.current && myAssignment.room_id !== prevRoomIdRef.current) {
      setManuallyLeft(false);
      setHasScreenShareAccess(false);
      screenShareTokenRef.current = null;
    }
    prevRoomIdRef.current = myAssignment?.room_id || null;

    if (manuallyLeft || oneOnOneRoom) return;
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

  useEffect(() => {
    if (!oneOnOneRequestId) {
      oneOnOneSeenInListRef.current = false;
      return;
    }
    const req = cowork.hostRequests.find(r => r.id === oneOnOneRequestId);
    if (req) oneOnOneSeenInListRef.current = true;
    if (!oneOnOneSeenInListRef.current) return;
    if (req?.status === "resolved" || !req) {
      dismissedRequestRef.current = null;
      reconnectToMainRoom();
      toast.info("Llamada privada con host finalizada");
    }
  }, [cowork.hostRequests, oneOnOneRequestId, reconnectToMainRoom]);

  useEffect(() => {
    if (oneOnOneRequestId || pendingOneOnOneRef.current) return;
    const existingReq = cowork.hostRequests.find(
      r => r.user_id === userId && (r.status === "open" || r.status === "acknowledged") && r.oneone_livekit_room
    );
    if (existingReq && dismissedRequestRef.current !== existingReq.id) {
      setOneOnOneRequestId(existingReq.id);
      setOneOnOneRoom(existingReq.oneone_livekit_room!);
      setConnectedLkRoom(null);
    }
  }, [cowork.hostRequests, userId, oneOnOneRequestId]);

  const dismissedActiveRequest = cowork.hostRequests.find(
    r => r.user_id === userId
      && (r.status === "open" || r.status === "acknowledged")
      && r.oneone_livekit_room
      && r.id === dismissedRequestRef.current
  );

  const getToken = useCallback(async () => {
    const ssToken = screenShareTokenRef.current;
    if (ssToken) {
      screenShareTokenRef.current = null;
      return { token: ssToken.token, url: ssToken.url };
    }
    const result = await cowork.issueLiveKitToken("join_room");
    return { token: result.token, url: result.url };
  }, [cowork.issueLiveKitToken]);

  const getOneOnOneToken = useCallback(async () => {
    if (!oneOnOneRequestId) throw new Error("No 1:1 request");
    const result = await cowork.joinOneOnOne(oneOnOneRequestId);
    return { token: result.token, url: result.url };
  }, [cowork.joinOneOnOne, oneOnOneRequestId]);

  if (!myAssignment) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-4">
        <div className="flex flex-col items-center gap-3 bg-primary/5 rounded-3xl px-6 md:px-10 py-8 md:py-10 max-w-sm w-full">
          <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
          <p className="text-muted-foreground text-sm text-center">Esperando asignación de sala por el host...</p>
          <p className="text-xs text-muted-foreground/70">{cowork.session?.name}</p>
        </div>
      </div>
    );
  }

  const isInOneOnOne = !!oneOnOneRoom;

  // Action handlers for both inline and dropdown
  const handleRequestHost = async () => {
    dismissedRequestRef.current = null;
    try {
      await cowork.requestHost(myAssignment.room_id, "Necesito ayuda");
      toast.success("Solicitud enviada al host");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRequestOneOnOne = async () => {
    pendingOneOnOneRef.current = true;
    try {
      const result = await cowork.requestHost(myAssignment.room_id, "Llamada privada", true);
      toast.success("Solicitud de llamada privada enviada al host");
      const roomName = result?.oneone_livekit_room || result?.request?.oneone_livekit_room;
      const reqId = result?.request?.id;
      if (roomName && reqId) {
        setOneOnOneRequestId(reqId);
        setOneOnOneRoom(roomName);
        setConnectedLkRoom(null);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      pendingOneOnOneRef.current = false;
    }
  };

  const handleRequestScreenShare = async () => {
    try {
      await cowork.requestScreenShare(myAssignment.room_id);
      toast.info("Solicitud de pantalla enviada, esperando aprobación...");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleReconnectPrivateCall = () => {
    if (!dismissedActiveRequest) return;
    dismissedRequestRef.current = null;
    setOneOnOneRequestId(dismissedActiveRequest.id);
    setOneOnOneRoom(dismissedActiveRequest.oneone_livekit_room!);
    setConnectedLkRoom(null);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 md:px-4 py-2 bg-card border-b border-border z-10 shrink-0">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          {isInOneOnOne ? (
            <>
              <Crown className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-amber-500 text-sm font-medium truncate">Llamada privada con host</span>
            </>
          ) : (
            <>
              <span className="text-foreground text-sm font-medium truncate">{myRoom?.name || "Sala"}</span>
              <span className="text-muted-foreground/70 text-xs hidden sm:inline">{cowork.session?.name}</span>
            </>
          )}
        </div>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-2">
          {dismissedActiveRequest && !isInOneOnOne && (
            <Button variant="ghost" size="sm" className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 gap-1.5 animate-pulse rounded-full" onClick={handleReconnectPrivateCall}>
              <PhoneCall className="h-4 w-4" /> Reconectar a llamada privada
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-muted gap-1.5 rounded-full" disabled={isInOneOnOne} onClick={handleRequestHost}>
            <Hand className="h-4 w-4" /> {myOpenRequest && !isInOneOnOne ? "Solicitud enviada" : "Pedir host"}
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-muted gap-1.5 rounded-full" disabled={!!myOpenRequest || isInOneOnOne} onClick={handleRequestOneOnOne}>
            <Phone className="h-4 w-4" /> {isInOneOnOne ? "En llamada privada..." : "Llamada privada"}
          </Button>
          {!hasScreenShareAccess && (
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-muted gap-1.5 rounded-full" disabled={!!mySSReq} onClick={handleRequestScreenShare}>
              <Monitor className="h-4 w-4" />
              {mySSReq ? "Esperando aprobación..." : "Compartir pantalla"}
            </Button>
          )}
        </div>

        {/* Mobile actions dropdown */}
        <div className="flex md:hidden items-center gap-1">
          {dismissedActiveRequest && !isInOneOnOne && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-500 animate-pulse rounded-full" onClick={handleReconnectPrivateCall}>
              <PhoneCall className="h-4 w-4" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem onClick={handleRequestHost} disabled={isInOneOnOne}>
                <Hand className="h-4 w-4 mr-2" />
                {myOpenRequest && !isInOneOnOne ? "Solicitud enviada" : "Pedir host"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRequestOneOnOne} disabled={!!myOpenRequest || isInOneOnOne}>
                <Phone className="h-4 w-4 mr-2" />
                {isInOneOnOne ? "En llamada privada..." : "Llamada privada con host"}
              </DropdownMenuItem>
              {!hasScreenShareAccess && (
                <DropdownMenuItem onClick={handleRequestScreenShare} disabled={!!mySSReq}>
                  <Monitor className="h-4 w-4 mr-2" />
                  {mySSReq ? "Esperando aprobación..." : "Compartir pantalla"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Video area */}
      <div className="flex-1 min-h-0">
        {isInOneOnOne && oneOnOneRoom && oneOnOneRequestId ? (
          <LiveKitCallView
            key={`oneOnOne-${oneOnOneRoom}`}
            roomName={oneOnOneRoom}
            displayName={displayName}
            callDisplayName="Llamada privada con host"
            isAdmin={false}
            onLeave={() => {
              dismissedRequestRef.current = oneOnOneRequestId;
              reconnectToMainRoom();
            }}
            hideShareLink
            suppressLeaveToast
            autoLeaveOnEmpty={undefined}
            initialMicOn={false}
            initialCamOn={false}
            getToken={getOneOnOneToken}
          />
        ) : connectedLkRoom ? (
          <LiveKitCallView
            key={`room-${connectedLkRoom}`}
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
            suppressLeaveToast
            hideScreenShare={!hasScreenShareAccess}
            initialMicOn={false}
            initialCamOn={false}
            getToken={getToken}
            onMediaStateChange={handleMediaStateChange}
          />
        ) : manuallyLeft ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
            <div className="flex flex-col items-center gap-3 bg-muted/50 rounded-3xl px-6 md:px-10 py-8 max-w-xs w-full">
              <p className="text-muted-foreground text-sm">Has salido de la sala</p>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 rounded-full"
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
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
          </div>
        )}
      </div>
    </div>
  );
}
