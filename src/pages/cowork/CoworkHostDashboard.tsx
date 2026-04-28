import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users2, Headphones, Hand, Monitor, DoorOpen,
  Check, X, Loader2, Radio, Power, Link2, Menu, XIcon, Maximize2, Minimize2, Phone, Share2,
  Mic, MicOff, Video, VideoOff, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";
import { supabase } from "@/integrations/supabase/client";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { useCoworkMediaPresence } from "@/hooks/useCoworkMediaPresence";
import type { useCoworkSession } from "@/hooks/useCoworkSession";

interface Props {
  cowork: ReturnType<typeof useCoworkSession>;
  userId: string;
}

export default function CoworkHostDashboard({ cowork, userId }: Props) {
  const navigate = useNavigate();
  const { isOnline } = useOnlinePresence();
  const { mediaStates } = useCoworkMediaPresence(cowork.session?.id, userId);
  const [displayName, setDisplayName] = useState("Host");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [activeRoomLk, setActiveRoomLk] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoomName, setActiveRoomName] = useState<string | null>(null);
  const [hubConnected, setHubConnected] = useState(false);
  const [hostInviteCode, setHostInviteCode] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hubMinimized, setHubMinimized] = useState(false);
  const [hubMaximized, setHubMaximized] = useState(false);
  // 1:1 state
  const [oneOnOneRequestId, setOneOnOneRequestId] = useState<string | null>(null);
  const [oneOnOneRoom, setOneOnOneRoom] = useState<string | null>(null);
  const oneOnOneSeenInListRef = useRef(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).single();
        setDisplayName(profile?.full_name || "Host");
      }
      setProfileLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (cowork.session?.id) {
      cowork.getHostCode().then((res: any) => setHostInviteCode(res.hostCode)).catch(() => {});
    }
  }, [cowork.session?.id]);

  useEffect(() => {
    if (profileLoaded && cowork.session?.host_hub_livekit_room) {
      setHubConnected(true);
    }
  }, [profileLoaded, cowork.session?.host_hub_livekit_room]);

  const enterRoom = useCallback((roomId: string) => {
    const room = cowork.rooms.find(r => r.id === roomId);
    if (!room) return;
    // Disconnect Hub to free the microphone — the browser tab can only reliably
    // publish a single mic track to a single LiveKit room at a time.
    setHubConnected(false);
    setHubMaximized(false);
    setActiveRoomLk(room.livekit_room_name);
    setActiveRoomId(roomId);
    setActiveRoomName(room.name);
  }, [cowork.rooms]);

  const getHubToken = useCallback(async () => {
    const result = await cowork.issueLiveKitToken("join_host_hub");
    return { token: result.token, url: result.url };
  }, [cowork.issueLiveKitToken]);

  const getActiveRoomToken = useCallback(async () => {
    const result = await cowork.issueLiveKitToken("join_room", activeRoomId!);
    return { token: result.token, url: result.url };
  }, [cowork.issueLiveKitToken, activeRoomId]);

  const leaveActiveRoom = useCallback(() => {
    setActiveRoomLk(null);
    setActiveRoomId(null);
    setActiveRoomName(null);
    // Reconnect to the Coordinator Hub when leaving a room
    if (cowork.session?.host_hub_livekit_room) {
      setHubConnected(true);
      setHubMinimized(false);
      toast.info("Volviendo al Coordinador Hub");
    }
  }, [cowork.session?.host_hub_livekit_room]);

  const leaveOneOnOne = useCallback(async () => {
    if (oneOnOneRequestId) {
      try { await cowork.resolveHostRequest(oneOnOneRequestId); } catch {}
    }
    setOneOnOneRoom(null);
    setOneOnOneRequestId(null);
  }, [oneOnOneRequestId, cowork.resolveHostRequest]);

  useEffect(() => {
    if (!oneOnOneRequestId) {
      oneOnOneSeenInListRef.current = false;
      return;
    }
    const req = cowork.hostRequests.find(r => r.id === oneOnOneRequestId);
    if (req) oneOnOneSeenInListRef.current = true;
    if (!oneOnOneSeenInListRef.current) return;
    if (!req || req.status === "resolved") {
      leaveOneOnOne();
      leaveActiveRoom();
      toast.info("Llamada privada finalizada");
    }
  }, [cowork.hostRequests, oneOnOneRequestId, leaveOneOnOne, leaveActiveRoom]);

  const getOneOnOneToken = useCallback(async () => {
    if (!oneOnOneRequestId) throw new Error("No 1:1 request");
    const result = await cowork.joinOneOnOne(oneOnOneRequestId);
    return { token: result.token, url: result.url };
  }, [cowork.joinOneOnOne, oneOnOneRequestId]);

  const getRoomParticipants = (roomId: string) =>
    cowork.assignments.filter(a => a.room_id === roomId && a.is_active);

  const openHostRequests = cowork.hostRequests.filter(
    r => r.status !== "resolved" && r.id !== oneOnOneRequestId
  );
  const pendingSSRequests = cowork.screenShareRequests.filter(r => r.status === "pending");

  return (
    <div className="flex h-screen bg-background text-foreground relative">
      {/* Mobile sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-3 left-3 z-50 md:hidden h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <XIcon className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </Button>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Left sidebar */}
      <div className={`
        fixed md:relative z-40 md:z-auto
        w-72 md:w-80 h-full
        border-r border-border flex flex-col bg-card
        transition-transform duration-200 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{cowork.session?.name}</h2>
              <p className="text-xs text-muted-foreground">Coordinador Dashboard</p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-blue-500 hover:text-blue-400"
                title="Copiar enlace de host"
                onClick={() => {
                  const code = hostInviteCode || "";
                  const url = `${window.location.origin}/cowork?session=${cowork.session?.id || ""}&role=host&code=${code}`;
                  navigator.clipboard.writeText(url);
                  toast.success("Enlace de host copiado");
                }}
              >
                <Share2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive/80"
                onClick={async () => {
                  setActiveRoomLk(null);
                  setActiveRoomId(null);
                  setActiveRoomName(null);
                  setHubConnected(false);
                  await cowork.endSession();
                  toast.success("Sesión finalizada");
                  navigate("/cowork");
                }}
              >
                <Power className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {/* Host Hub indicator */}
          <div className="p-3 border-b border-border/50">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Radio className={`h-3 w-3 ${hubConnected ? "text-emerald-500" : "text-muted-foreground/50"}`} />
              <span>Coordinador Hub</span>
              {activeRoomLk ? (
                <span className="text-[10px] text-amber-500/80 italic">en pausa (en sala)</span>
              ) : hubConnected ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] text-amber-500 hover:text-amber-400 px-1.5"
                  onClick={() => setHubMinimized(!hubMinimized)}
                >
                  {hubMinimized ? "Mostrar" : "Minimizar"}
                </Button>
              ) : cowork.session?.host_hub_livekit_room ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] text-amber-500 hover:text-amber-400 px-1.5"
                  onClick={() => setHubConnected(true)}
                >
                  Reconectar
                </Button>
              ) : null}
            </div>
          </div>

          {/* Unassigned members section removed — participants self-join via URL ?room=X */}

          {/* Host Requests */}
          <div className="p-3 border-t border-border/50 space-y-2">
            <h3 className="text-xs font-medium text-amber-500 uppercase tracking-wider flex items-center gap-1">
              <Hand className="h-3 w-3" /> Solicitudes ({openHostRequests.length})
            </h3>
            {openHostRequests.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1">Sin solicitudes pendientes</p>
            ) : (
              openHostRequests.map((req) => {
                const roomName = cowork.rooms.find(r => r.id === req.room_id)?.name || "?";
                const is1on1 = !!req.oneone_livekit_room;
                return (
                  <div key={req.id} className={`rounded-xl p-2.5 space-y-1 ${is1on1 ? "bg-primary/5" : "bg-amber-500/10"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {is1on1 ? <Phone className="h-3 w-3 text-primary" /> : <Hand className="h-3 w-3 text-amber-500" />}
                        <span className="text-xs text-foreground/80">{cowork.profiles[req.user_id] || "User"}</span>
                      </div>
                      <Badge variant="outline" className={`text-[9px] rounded-full ${is1on1 ? "border-primary/30 text-primary" : "border-amber-500/30 text-amber-500"}`}>{roomName}</Badge>
                    </div>
                    {req.message && <p className="text-[10px] text-muted-foreground">{req.message}</p>}
                    <div className="flex gap-1">
                      {req.status === "open" && (
                        <Button size="sm" variant="ghost" className={`h-5 text-[10px] rounded-full ${is1on1 ? "text-primary" : "text-amber-500"}`} onClick={async () => {
                          if (is1on1) {
                            await cowork.ackHostRequest(req.id);
                            setOneOnOneRequestId(req.id);
                            setOneOnOneRoom(req.oneone_livekit_room!);
                            setActiveRoomLk(req.oneone_livekit_room!);
                            setActiveRoomId(null);
                            setActiveRoomName(`Llamada privada con ${cowork.profiles[req.user_id] || "User"}`);
                            setHubMinimized(true);
                          } else {
                            if (req.room_id) enterRoom(req.room_id);
                            await cowork.resolveHostRequest(req.id);
                          }
                        }}>
                          Atender
                        </Button>
                      )}
                      {req.status === "acknowledged" && is1on1 && (
                        <Button size="sm" variant="ghost" className="h-5 text-[10px] text-primary rounded-full" onClick={() => {
                          setOneOnOneRequestId(req.id);
                          setOneOnOneRoom(req.oneone_livekit_room!);
                          setActiveRoomLk(req.oneone_livekit_room!);
                          setActiveRoomId(null);
                          setActiveRoomName(`Llamada privada con ${cowork.profiles[req.user_id] || "User"}`);
                          setHubMinimized(true);
                        }}>
                          Unirse a llamada privada
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Screen Share Requests */}
          <div className="p-3 border-t border-border/50 space-y-2">
            <h3 className="text-xs font-medium text-primary uppercase tracking-wider flex items-center gap-1">
              <Monitor className="h-3 w-3" /> Screen Share ({pendingSSRequests.length})
            </h3>
            {pendingSSRequests.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1">Sin solicitudes de pantalla</p>
            ) : (
              pendingSSRequests.map((req) => {
                const roomName = cowork.rooms.find(r => r.id === req.room_id)?.name || "?";
                return (
                  <div key={req.id} className="bg-primary/5 rounded-xl p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-foreground/80">{cowork.profiles[req.user_id] || "User"}</span>
                      <Badge variant="outline" className="text-[9px] border-primary/30 text-primary rounded-full">{roomName}</Badge>
                    </div>
                    <div className="flex gap-1 mt-1">
                      <Button
                        size="sm" variant="ghost" className="h-5 text-[10px] text-emerald-500 gap-0.5 rounded-full"
                        onClick={async () => {
                          try { await cowork.approveScreenShare(req.id, true); toast.success("Aprobado"); } catch (e: any) { toast.error(e.message); }
                        }}
                      >
                        <Check className="h-2.5 w-2.5" /> Aprobar
                      </Button>
                      <Button
                        size="sm" variant="ghost" className="h-5 text-[10px] text-destructive gap-0.5 rounded-full"
                        onClick={async () => {
                          try { await cowork.approveScreenShare(req.id, false); toast.info("Denegado"); } catch (e: any) { toast.error(e.message); }
                        }}
                      >
                        <X className="h-2.5 w-2.5" /> Denegar
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0">
        {activeRoomLk ? (
          <div className="flex-1 min-h-0">
            <LiveKitCallView
              key={activeRoomLk}
              roomName={activeRoomLk}
              displayName={displayName}
              callDisplayName={activeRoomName || undefined}
              isAdmin={!oneOnOneRoom}
              onLeave={() => {
                if (oneOnOneRoom) {
                  leaveOneOnOne();
                }
                leaveActiveRoom();
              }}
              hideShareLink
              suppressLeaveToast
              autoLeaveOnEmpty={oneOnOneRoom ? 3000 : undefined}
              initialMicOn={false}
              initialCamOn={false}
              getToken={oneOnOneRoom ? getOneOnOneToken : getActiveRoomToken}
              leaveLabel="Regresar a dashboard"
              leaveIcon={ArrowLeft}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4 pt-14 md:p-6">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Seleccione sala para ingresar</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
              {cowork.rooms.map((room) => {
                const participants = getRoomParticipants(room.id);
                return (
                  <div key={room.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                    <div className="p-4 pb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{room.name}</span>
                        <Badge variant="secondary" className="text-[10px] rounded-full">
                          {participants.length} <Users2 className="h-2.5 w-2.5 ml-0.5" />
                        </Badge>
                      </div>
                    </div>
                    <div className="p-4 pt-1 space-y-3">
                      {participants.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2">
                          {participants.map((a) => {
                            const fullName = cowork.profiles[a.user_id] || "User";
                            const initials = fullName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
                            const online = isOnline(a.user_id);
                            return (
                              <div key={a.user_id} className="flex flex-col items-center gap-1 rounded-xl border border-border bg-primary/5 p-2 text-center">
                                <div className="relative">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-[10px] font-medium text-primary-foreground">
                                    {initials}
                                  </div>
                                  <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${online ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                                </div>
                                <span className="text-[11px] text-muted-foreground truncate w-full">{fullName}</span>
                                {(() => {
                                  const ms = mediaStates[a.user_id];
                                  if (!ms) return null;
                                  return (
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      {ms.micOn ? <Mic className="h-3 w-3 text-emerald-500" /> : <MicOff className="h-3 w-3 text-destructive/70" />}
                                      {ms.camOn ? <Video className="h-3 w-3 text-emerald-500" /> : <VideoOff className="h-3 w-3 text-destructive/70" />}
                                      {ms.screenShareOn && <Monitor className="h-3 w-3 text-primary" />}
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground/50 italic">Sin participantes</p>
                      )}

                      <div className="flex gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1 h-8 text-xs gap-1 rounded-xl"
                          onClick={() => enterRoom(room.id)}
                        >
                          <DoorOpen className="h-3 w-3" /> Entrar
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary hover:text-primary/80 rounded-xl"
                          title="Copiar enlace de participante para esta sala"
                          onClick={() => {
                            const url = `${window.location.origin}/cowork?session=${cowork.session?.id || ""}&room=${room.id}`;
                            navigator.clipboard.writeText(url);
                            toast.success(`Enlace de ${room.name} copiado`);
                          }}
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Floating Host Hub pop-up */}
      {hubConnected && cowork.session?.host_hub_livekit_room && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
          {hubMinimized && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 shadow-lg border border-border bg-card hover:bg-muted text-amber-500 rounded-full"
              onClick={() => setHubMinimized(false)}
            >
              <Headphones className="h-3.5 w-3.5" />
              Hub
            </Button>
          )}
          <div
            className={`rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col ${
              hubMaximized
                ? "w-[calc(100vw-2rem)] h-[calc(100vh-2rem)]"
                : "w-[calc(100vw-2rem)] sm:w-96 md:w-[480px]"
            } ${hubMinimized ? "hidden" : ""}`}
            style={!hubMaximized ? { height: "380px" } : undefined}
          >
            <div className="flex items-center justify-between px-3 py-1.5 bg-muted border-b border-border shrink-0">
              <div className="flex items-center gap-1.5 text-xs text-amber-500 font-medium">
                <Headphones className="h-3 w-3" />
                Coordinador Hub
              </div>
              <div className="flex gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  onClick={() => setHubMinimized(true)}
                >
                  <span className="text-xs leading-none">−</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  onClick={() => setHubMaximized(!hubMaximized)}
                  title={hubMaximized ? "Restaurar" : "Maximizar"}
                >
                  {hubMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-destructive hover:text-destructive/80"
                  onClick={() => { setHubConnected(false); setHubMaximized(false); }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <LiveKitCallView
                roomName={cowork.session.host_hub_livekit_room}
                displayName={displayName}
                callDisplayName="Coordinador Hub"
                isAdmin={true}
                onLeave={() => { setHubConnected(false); setHubMaximized(false); }}
                hideShareLink
                hideLeaveButton
                suppressLeaveToast
                initialMicOn={false}
                initialCamOn={false}
                getToken={getHubToken}
                compact={!hubMaximized}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
