import { useState, useEffect, useCallback } from "react";
import { Room } from "livekit-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users2, Crown, Hand, Monitor, LogIn, ArrowRightLeft,
  Check, X, Loader2, Radio, Copy, Power,
} from "lucide-react";
import { toast } from "sonner";
import LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";
import type { useCoworkSession } from "@/hooks/useCoworkSession";

interface Props {
  cowork: ReturnType<typeof useCoworkSession>;
  userId: string;
}

export default function CoworkHostDashboard({ cowork, userId }: Props) {
  const [hubRoom, setHubRoom] = useState<Room | null>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [connectingHub, setConnectingHub] = useState(false);
  const [connectingRoom, setConnectingRoom] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<Record<string, string>>({});

  // Connect to Host Hub
  const connectHub = useCallback(async () => {
    if (connectingHub || hubRoom) return;
    setConnectingHub(true);
    try {
      const result = await cowork.issueLiveKitToken("join_host_hub");
      const r = new Room({ adaptiveStream: true, dynacast: true });
      await r.connect(result.url, result.token);
      setHubRoom(r);
      toast.success("Conectado al Host Hub");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConnectingHub(false);
    }
  }, [cowork, connectingHub, hubRoom]);

  // Auto-connect to hub
  useEffect(() => {
    connectHub();
    return () => { hubRoom?.disconnect(true); };
  }, []);

  // Enter a cowork room
  const enterRoom = useCallback(async (roomId: string) => {
    if (connectingRoom) return;
    setConnectingRoom(roomId);
    try {
      if (activeRoom) {
        await activeRoom.disconnect(true);
        setActiveRoom(null);
        setActiveRoomId(null);
      }
      const result = await cowork.issueLiveKitToken("join_room", roomId);
      const r = new Room({ adaptiveStream: true, dynacast: true });
      await r.connect(result.url, result.token);
      setActiveRoom(r);
      setActiveRoomId(roomId);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConnectingRoom(null);
    }
  }, [cowork, activeRoom, connectingRoom]);

  const leaveActiveRoom = useCallback(() => {
    activeRoom?.disconnect(true);
    setActiveRoom(null);
    setActiveRoomId(null);
  }, [activeRoom]);

  // Cleanup
  useEffect(() => {
    return () => {
      hubRoom?.disconnect(true);
      activeRoom?.disconnect(true);
    };
  }, []);

  const getRoomParticipants = (roomId: string) =>
    cowork.assignments.filter(a => a.room_id === roomId && a.is_active);

  const openHostRequests = cowork.hostRequests.filter(r => r.status !== "resolved");
  const pendingSSRequests = cowork.screenShareRequests.filter(r => r.status === "pending");

  return (
    <div className="flex h-screen bg-[#202124] text-white">
      {/* Left sidebar - Dashboard */}
      <div className="w-80 border-r border-white/10 flex flex-col">
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
                className="h-7 w-7 text-white/60 hover:text-white"
                onClick={() => {
                  navigator.clipboard.writeText(cowork.session?.id || "");
                  toast.success("ID copiado");
                }}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-400 hover:text-red-300"
                onClick={async () => {
                  await cowork.endSession();
                  toast.success("Sesión finalizada");
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
            <div className="flex items-center gap-2 text-xs text-white/50 mb-2">
              <Radio className="h-3 w-3 text-green-400" /> Host Hub
              {!hubRoom && (
                <Button variant="ghost" size="sm" className="h-5 text-xs ml-auto" onClick={connectHub} disabled={connectingHub}>
                  {connectingHub ? <Loader2 className="h-3 w-3 animate-spin" /> : "Conectar"}
                </Button>
              )}
            </div>
          </div>

          {/* Rooms */}
          <div className="p-3 space-y-3">
            <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider">Salas</h3>
            {cowork.rooms.map((room) => {
              const participants = getRoomParticipants(room.id);
              const isActive = activeRoomId === room.id;
              return (
                <Card key={room.id} className={`bg-white/5 border-white/10 ${isActive ? "ring-1 ring-primary" : ""}`}>
                  <CardHeader className="p-3 pb-1">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm text-white/90">{room.name}</CardTitle>
                      <Badge variant="secondary" className="text-[10px]">
                        {participants.length} <Users2 className="h-2.5 w-2.5 ml-0.5" />
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-1 space-y-2">
                    {/* Participants in this room */}
                    {participants.length > 0 ? (
                      <div className="space-y-1">
                        {participants.map((a) => (
                          <div key={a.user_id} className="flex items-center justify-between text-xs">
                            <span className="text-white/70 truncate">{cowork.profiles[a.user_id] || "User"}</span>
                            <div className="flex items-center gap-1">
                              <Select
                                value={moveTarget[a.user_id] || ""}
                                onValueChange={(v) => setMoveTarget({ ...moveTarget, [a.user_id]: v })}
                              >
                                <SelectTrigger className="h-6 w-24 text-[10px] bg-transparent border-white/20 text-white/60">
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
                      <p className="text-[10px] text-white/30 italic">Sin participantes</p>
                    )}

                    <Button
                      variant={isActive ? "destructive" : "secondary"}
                      size="sm"
                      className="w-full h-7 text-xs gap-1"
                      disabled={!!connectingRoom}
                      onClick={() => isActive ? leaveActiveRoom() : enterRoom(room.id)}
                    >
                      {connectingRoom === room.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : isActive ? (
                        <>Salir</>
                      ) : (
                        <><LogIn className="h-3 w-3" /> Entrar</>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
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
                    <span className="text-white/70">{cowork.profiles[m.user_id] || "User"}</span>
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
                        size="sm"
                        variant="ghost"
                        className="h-5 text-[10px] text-green-400 gap-0.5"
                        onClick={async () => {
                          try {
                            await cowork.approveScreenShare(req.id, true);
                            toast.success("Screen share aprobado");
                          } catch (e: any) {
                            toast.error(e.message);
                          }
                        }}
                      >
                        <Check className="h-2.5 w-2.5" /> Aprobar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 text-[10px] text-red-400 gap-0.5"
                        onClick={async () => {
                          try {
                            await cowork.approveScreenShare(req.id, false);
                            toast.info("Screen share denegado");
                          } catch (e: any) {
                            toast.error(e.message);
                          }
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
        {/* Active room media */}
        {activeRoom ? (
          <div className="flex-1 min-h-0">
            <LiveKitCallView
              room={activeRoom}
              isAdmin={true}
              onLeave={leaveActiveRoom}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-white/30 space-y-2">
              <Users2 className="h-16 w-16 mx-auto" />
              <p className="text-sm">Selecciona una sala para entrar</p>
              <p className="text-xs">El Host Hub está {hubRoom ? "activo" : "desconectado"} en segundo plano</p>
            </div>
          </div>
        )}

        {/* Host Hub mini view (always visible when connected) */}
        {hubRoom && (
          <div className="h-32 border-t border-white/10 bg-[#1a1a1d]">
            <div className="flex items-center gap-2 px-3 py-1 text-xs text-white/40">
              <Crown className="h-3 w-3 text-amber-400" />
              <span>Host Hub</span>
            </div>
            <div className="h-[calc(100%-24px)] overflow-hidden">
              <LiveKitCallView
                room={hubRoom}
                isAdmin={true}
                onLeave={() => {
                  hubRoom.disconnect(true);
                  setHubRoom(null);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
