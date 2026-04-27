import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Video, Plus, Copy, Link2, Users, X, Users2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VideoRoom } from "./types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface VideoRoomsPanelProps {
  rooms: VideoRoom[];
  onCreateRoom: (name: string) => void;
  onJoinRoom: (room: VideoRoom) => void;
  onClose: () => void;
}

export default function VideoRoomsPanel({ rooms, onCreateRoom, onJoinRoom, onClose }: VideoRoomsPanelProps) {
  const [joinLink, setJoinLink] = useState("");
  const navigate = useNavigate();

  const handleCreate = () => {
    const autoName = `Sala ${new Date().toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`;
    onCreateRoom(autoName);
  };

  const extractRoomId = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const directCode = trimmed.replace(/^\/+|\/+$/g, "");
    if (!/^https?:\/\//i.test(trimmed) && !directCode.includes("/") && !directCode.includes("?")) {
      return directCode;
    }

    try {
      const parsed = new URL(trimmed);
      const roomFromQuery = parsed.searchParams.get("room");
      if (roomFromQuery) return decodeURIComponent(roomFromQuery).trim();

      const segments = parsed.pathname.split("/").filter(Boolean);
      const callIndex = segments.findIndex((segment) => segment.toLowerCase() === "call");
      if (callIndex !== -1 && segments[callIndex + 1]) {
        return decodeURIComponent(segments[callIndex + 1]).trim();
      }
    } catch {
      // Not an absolute URL, continue with regex fallback
    }

    const roomParamMatch = trimmed.match(/[?&]room=([^&#]+)/i);
    if (roomParamMatch?.[1]) {
      return decodeURIComponent(roomParamMatch[1]).trim();
    }

    const callPathMatch = trimmed.match(/\/call\/([^/?#]+)/i);
    if (callPathMatch?.[1]) {
      return decodeURIComponent(callPathMatch[1]).trim();
    }

    return directCode;
  };

  const handleJoinByLink = () => {
    const roomId = extractRoomId(joinLink);
    if (!roomId) return;

    const room = rooms.find((r) => r.id === roomId);
    if (room) {
      onJoinRoom(room);
    } else {
      onJoinRoom({
        id: roomId,
        name: roomId,
        createdBy: "link",
        createdAt: new Date(),
        participants: [],
        isActive: true,
        shareLink: `${window.location.origin}/call/${encodeURIComponent(roomId)}?name=${encodeURIComponent(roomId)}`,
      });
      toast.success("Uniéndote por enlace...");
    }

    setJoinLink("");
  };

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast.success("Enlace copiado al portapapeles");
  };

  return (
    <div className="flex flex-col h-full bg-card/50">
      <div className="shrink-0 flex items-center justify-between p-4 bg-primary/[0.03]">
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Video Rooms</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="shrink-0 p-4 space-y-3">
        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-2">
          <Button onClick={handleCreate} className="h-auto py-3 flex-col gap-1 rounded-2xl">
            <Plus className="h-5 w-5" />
            <span className="text-xs">Nueva sala</span>
          </Button>
          <Button variant="outline" onClick={() => document.getElementById("join-link-input")?.focus()} className="h-auto py-3 flex-col gap-1 rounded-2xl">
            <Link2 className="h-5 w-5" />
            <span className="text-xs">Unirse</span>
          </Button>
          <Button variant="secondary" onClick={() => navigate("/cowork")} className="h-auto py-3 flex-col gap-1 rounded-2xl">
            <Users2 className="h-5 w-5" />
            <span className="text-xs">Cowork</span>
          </Button>
        </div>

        {/* Join by link */}
        <div className="flex gap-2">
          <Input
            id="join-link-input"
            placeholder="Pegar enlace de la sala..."
            className="h-9 bg-primary/5 border-0 text-xs rounded-full"
            value={joinLink}
            onChange={e => setJoinLink(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleJoinByLink()}
          />
          <Button variant="secondary" size="sm" onClick={handleJoinByLink} disabled={!joinLink.trim()} className="rounded-full">
            Unirse
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 pb-4">
        <div className="space-y-3">
          {rooms.map(room => (
            <Card key={room.id} className={cn("transition-colors border-0 rounded-3xl", room.isActive ? "bg-primary/8" : "bg-primary/[0.03]")}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center",
                      room.isActive ? "bg-primary/20" : "bg-muted"
                    )}>
                      <Video className={cn("h-4 w-4", room.isActive ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{room.name}</p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Users className="h-3 w-3" /> {room.participants.length}
                        {room.isActive && (
                          <Badge className="h-4 px-1.5 text-[9px] bg-emerald-500/20 text-emerald-500 border-0">
                            EN VIVO
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Participants avatars */}
                <div className="flex items-center gap-1">
                  {room.participants.slice(0, 4).map(p => (
                    <Avatar key={p.id} className="h-6 w-6 border-2 border-card -ml-1 first:ml-0">
                      <AvatarFallback className="text-[9px] bg-muted">
                        {(p.full_name || "?").split(" ").map(w => w[0]).join("").slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {room.participants.length > 4 && (
                    <span className="text-[10px] text-muted-foreground ml-1">+{room.participants.length - 4}</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => onJoinRoom(room)}>
                    {room.isActive ? "Unirse ahora" : "Iniciar"}
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyLink(room.shareLink)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>

    </div>
  );
}
