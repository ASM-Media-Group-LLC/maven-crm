import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users2, Crown, Hand, Monitor, LogIn, ArrowRightLeft,
  Check, X, Loader2, Radio, Power, Link2, Menu, XIcon,
} from "lucide-react";
import { toast } from "sonner";
import LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";
import { supabase } from "@/integrations/supabase/client";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import type { useCoworkSession } from "@/hooks/useCoworkSession";

interface Props {
  cowork: ReturnType<typeof useCoworkSession>;
  userId: string;
}

export default function CoworkHostDashboard({ cowork, userId }: Props) {
  const navigate = useNavigate();
  const { isOnline } = useOnlinePresence();
  const [displayName, setDisplayName] = useState("Host");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [activeRoomLk, setActiveRoomLk] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoomName, setActiveRoomName] = useState<string | null>(null);
  const [hubConnected, setHubConnected] = useState(false);
  const [moveTarget, setMoveTarget] = useState<Record<string, string>>({});
  const [hostInviteCode, setHostInviteCode] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hubMinimized, setHubMinimized] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).single();
        setDisplayName(profile?.full_name || "Host");
      }
      setProfileLoaded(true);
    });
  }, []);

  // Fetch host invite code for sharing
  useEffect(() => {
    if (cowork.session?.id) {
      cowork.getHostCode().then((res: any) => setHostInviteCode(res.hostCode)).catch(() => {});
    }
  }, [cowork.session?.id]);

  // Auto-connect to Hub only after profile is loaded
  useEffect(() => {
    if (profileLoaded && cowork.session?.host_hub_livekit_room) {
      setHubConnected(true);
    }
  }, [profileLoaded, cowork.session?.host_hub_livekit_room]);

  const enterRoom = useCallback((roomId: string) => {
    const room = cowork.rooms.find(r => r.id === roomId);
    if (!room) return;
    setActiveRoomLk(room.livekit_room_name);
    setActiveRoomId(roomId);
    setActiveRoomName(room.name);
    setHubMinimized(true);
  }, [cowork.rooms]);

  // Token providers for cowork-specific LiveKit tokens
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
  }, []);

  const getRoomParticipants = (roomId: string) =>
    cowork.assignments.filter(a => a.room_id === roomId && a.is_active);

  const openHostRequests = cowork.hostRequests.filter(r => r.status !== "resolved");
  const pendingSSRequests = cowork.screenShareRequests.filter(r => r.status === "pending");

  return (
    <div className="flex h-screen bg-[#202124] text-white relative">
      {/* Mobile sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-3 left-3 z-50 md:hidden h-8 w-8 text-white/70 hover:text-white"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <XIcon className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </Button>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Left sidebar - Dashboard */}
      <div className={`
        fixed md:relative z-40 md:z-auto
        w-72 md:w-80 h-full
        border-r border-white/10 flex flex-col bg-[#202124]
        transition-transform duration-200 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">{cowork.session?.name}</h2>
              <p className="text-xs text-white/50">Host Dashboard</p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-amber-400 hover:text-amber-300"
                title="Copiar enlace de host"
                onClick={() => {
                  const code = hostInviteCode || "";
                  const url = `${window.location.origin}/cowork?session=${cowork.session?.id || ""}&role=host&code=${code}`;
                  navigator.clipboard.writeText(url);
                  toast.success("Enlace de host copiado");
                }}
              >
                <Crown className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-400 hover:text-red-300"
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
          <div className="p-3 border-b border-white/5">
            <div className="flex items-center gap-2 text-xs text-white/50">
              <Radio className={`h-3 w-3 ${hubConnected ? "text-green-400" : "text-white/30"}`} />
              <span>Host Hub</span>
              {hubConnected && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] text-amber-400 hover:text-amber-300 px-1.5"
                  onClick={() => setHubMinimized(!hubMinimized)}
                >
                  {hubMinimized ? "Mostrar" : "Minimizar"}
                </Button>
              )}
              {!hubConnected && cowork.session?.host_hub_livekit_room && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] text-amber-400 hover:text-amber-300 px-1.5"
                  onClick={() => setHubConnected(true)}
                >
                  Reconectar
                </Button>
              )}
            </div>
          </div>

          {/* Unassigned members */}
          {(() => {
            const assignedUserIds = new Set(cowork.assignments.filter(a => a.is_active).map(a => a.user_id));
            const unassigned = cowork.memberships.filter(m => m.role === "participant" && !assignedUserIds.has(m.user_id));
            if (!unassigned.length) return null;
            return (
              <div className="p-3 border-t border-white/5 space-y-2">
                <h3 className="text-xs font-medium text-amber-400/80 uppercase tracking-wider">Sin asignar</h3>
                {unassigned.map((m) => (
                  <div key={m.user_id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${isOnline(m.user_id) ? "bg-green-400" : "bg-white/20"}`} />
                      <span className="text-white/70">{cowork.profiles[m.user_id] || "User"}</span>
                    </div>
                    <Select onValueChange={async (roomId) => {
                      try {
                        await cowork.assignToRoom(m.user_id, roomId);
                        toast.success("Participante asignado");
                      } catch (e: any) {
                        toast.error(e.message);
                      }
                    }}>
                      <SelectTrigger className="h-6 w-24 text-[10px] bg-transparent border-white/20 text-white/60">
                        <SelectValue placeholder="Asignar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {cowork.rooms.map(r => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Host Requests */}
          {openHostRequests.length > 0 && (
            <div className="p-3 border-t border-white/5 space-y-2">
              <h3 className="text-xs font-medium text-amber-400 uppercase tracking-wider flex items-center gap-1">
                <Hand className="h-3 w-3" /> Solicitudes ({openHostRequests.length})
              </h3>
              {openHostRequests.map((req) => {
                const roomName = cowork.rooms.find(r => r.id === req.room_id)?.name || "?";
                return (
                  <div key={req.id} className="bg-amber-500/10 rounded-lg p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/80">{cowork.profiles[req.user_id] || "User"}</span>
                      <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">{roomName}</Badge>
                    </div>
                    {req.message && <p className="text-[10px] text-white/50">{req.message}</p>}
                    <div className="flex gap-1">
                      {req.status === "open" && (
                        <Button size="sm" variant="ghost" className="h-5 text-[10px] text-amber-400" onClick={() => cowork.ackHostRequest(req.id)}>
                          Atender
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-5 text-[10px] text-green-400" onClick={() => cowork.resolveHostRequest(req.id)}>
                        Resolver
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Screen Share Requests */}
          {pendingSSRequests.length > 0 && (
            <div className="p-3 border-t border-white/5 space-y-2">
              <h3 className="text-xs font-medium text-blue-400 uppercase tracking-wider flex items-center gap-1">
                <Monitor className="h-3 w-3" /> Screen Share ({pendingSSRequests.length})
              </h3>
              {pendingSSRequests.map((req) => {
                const roomName = cowork.rooms.find(r => r.id === req.room_id)?.name || "?";
                return (
                  <div key={req.id} className="bg-blue-500/10 rounded-lg p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/80">{cowork.profiles[req.user_id] || "User"}</span>
                      <Badge variant="outline" className="text-[9px] border-blue-500/30 text-blue-400">{roomName}</Badge>
                    </div>
                    <div className="flex gap-1 mt-1">
                      <Button
                        size="sm" variant="ghost" className="h-5 text-[10px] text-green-400 gap-0.5"
                        onClick={async () => {
                          try { await cowork.approveScreenShare(req.id, true); toast.success("Aprobado"); } catch (e: any) { toast.error(e.message); }
                        }}
                      >
                        <Check className="h-2.5 w-2.5" /> Aprobar
                      </Button>
                      <Button
                        size="sm" variant="ghost" className="h-5 text-[10px] text-red-400 gap-0.5"
                        onClick={async () => {
                          try { await cowork.approveScreenShare(req.id, false); toast.info("Denegado"); } catch (e: any) { toast.error(e.message); }
                        }}
                      >
                        <X className="h-2.5 w-2.5" /> Denegar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-h-0">
        {activeRoomLk ? (
          <div className="flex-1 min-h-0">
            <LiveKitCallView
              roomName={activeRoomLk}
              displayName={displayName}
              callDisplayName={activeRoomName || undefined}
              isAdmin={true}
              onLeave={leaveActiveRoom}
              hideShareLink
              initialMicOn={false}
              initialCamOn={false}
              getToken={getActiveRoomToken}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4 pt-14 md:p-6">
            <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-4">Seleccione sala para ingresar</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
              {cowork.rooms.map((room) => {
                const participants = getRoomParticipants(room.id);
                return (
                  <Card key={room.id} className="bg-white/5 border-white/10">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm text-white/90">{room.name}</CardTitle>
                        <Badge variant="secondary" className="text-[10px]">
                          {participants.length} <Users2 className="h-2.5 w-2.5 ml-0.5" />
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-1 space-y-3">
                      {participants.length > 0 ? (
                        <div className="space-y-1.5">
                          {participants.map((a) => (
                            <div key={a.user_id} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${isOnline(a.user_id) ? "bg-green-400" : "bg-white/20"}`} />
                                <span className="text-white/70 truncate">{cowork.profiles[a.user_id] || "User"}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Select
                                  value={moveTarget[a.user_id] || ""}
                                  onValueChange={(v) => setMoveTarget({ ...moveTarget, [a.user_id]: v })}
                                >
                                  <SelectTrigger className="h-6 w-28 text-[10px] bg-transparent border-white/20 text-white/60">
                                    <SelectValue placeholder="Mover a..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {cowork.rooms.filter(r => r.id !== room.id).map(r => (
                                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {moveTarget[a.user_id] && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 text-primary"
                                    onClick={async () => {
                                      try {
                                        await cowork.moveParticipant(a.user_id, moveTarget[a.user_id]);
                                        toast.success("Participante movido");
                                        setMoveTarget({ ...moveTarget, [a.user_id]: "" });
                                      } catch (e: any) {
                                        toast.error(e.message);
                                      }
                                    }}
                                  >
                                    <ArrowRightLeft className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-white/30 italic">Sin participantes</p>
                      )}

                      <div className="flex gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1 h-8 text-xs gap-1"
                          onClick={() => enterRoom(room.id)}
                        >
                          <LogIn className="h-3 w-3" /> Entrar
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-blue-400 hover:text-blue-300"
                          title="Copiar enlace de participante para esta sala"
                          onClick={() => {
                            const url = `${window.location.origin}/cowork?session=${cowork.session?.id || ""}&room=${room.id}`;
                            navigator.clipboard.writeText(url);
                            toast.success(`Enlace de ${room.name} copiado`);
                          }}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

      {/* Floating Host Hub pop-up */}
      {hubConnected && cowork.session?.host_hub_livekit_room && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
          {hubMinimized ? (
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 shadow-lg border border-white/10 bg-[#2a2a2d] hover:bg-[#35353a] text-amber-400"
              onClick={() => setHubMinimized(false)}
            >
              <Crown className="h-3.5 w-3.5" />
              Hub
            </Button>
          ) : (
            <div className="w-80 md:w-96 rounded-lg border border-white/10 bg-[#1a1a1d] shadow-2xl overflow-hidden flex flex-col" style={{ height: "280px" }}>
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#2a2a2d] border-b border-white/10 shrink-0">
                <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                  <Crown className="h-3 w-3" />
                  Host Hub
                </div>
                <div className="flex gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-white/50 hover:text-white"
                    onClick={() => setHubMinimized(true)}
                  >
                    <span className="text-xs leading-none">−</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-red-400 hover:text-red-300"
                    onClick={() => setHubConnected(false)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <LiveKitCallView
                  roomName={cowork.session.host_hub_livekit_room}
                  displayName={displayName}
                  callDisplayName="Host Hub"
                  isAdmin={true}
                  onLeave={() => setHubConnected(false)}
                  hideShareLink
                  initialMicOn={false}
                  initialCamOn={false}
                  getToken={getHubToken}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
