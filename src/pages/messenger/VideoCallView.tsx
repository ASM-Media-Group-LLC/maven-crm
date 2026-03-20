import { useState, useEffect } from "react";
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, Monitor, MonitorOff,
  PhoneOff, Users, MessageSquare, Hand, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { VideoRoom, UserProfile } from "./types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface VideoCallViewProps {
  room: VideoRoom;
  onLeave: () => void;
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function VideoCallView({ room, onLeave }: VideoCallViewProps) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenShare, setScreenShare] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const allParticipants: (UserProfile & { isMe?: boolean })[] = [
    { id: "me", full_name: "Tú", avatar_url: null, isMe: true },
    ...room.participants,
  ];

  const copyLink = () => {
    navigator.clipboard.writeText(room.shareLink);
    toast.success("Enlace copiado");
  };

  const gridCols = allParticipants.length <= 2 ? "grid-cols-1 md:grid-cols-2"
    : allParticipants.length <= 4 ? "grid-cols-2"
    : "grid-cols-2 md:grid-cols-3";

  return (
    <div className="flex flex-col h-full bg-[hsl(240_10%_6%)] text-[hsl(0_0%_96%)]">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-[hsl(240_8%_10%)]">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-sm">{room.name}</h2>
          <Badge variant="outline" className="text-[10px] border-[hsl(0_0%_96%/0.2)] text-[hsl(0_0%_96%/0.7)]">
            {formatTime(elapsed)}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-[hsl(0_0%_96%/0.7)] hover:text-[hsl(0_0%_96%)] hover:bg-[hsl(0_0%_100%/0.1)] gap-1.5 text-xs" onClick={copyLink}>
            <Link2 className="h-3.5 w-3.5" />
            Copiar enlace
          </Button>
          <Button
            variant="ghost" size="icon"
            className="text-[hsl(0_0%_96%/0.7)] hover:text-[hsl(0_0%_96%)] hover:bg-[hsl(0_0%_100%/0.1)]"
            onClick={() => setLayout(l => l === "grid" ? "spotlight" : "grid")}
          >
            {layout === "grid" ? <Grid3X3 className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="text-[hsl(0_0%_96%/0.7)] hover:text-[hsl(0_0%_96%)] hover:bg-[hsl(0_0%_100%/0.1)]">
                <Users className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" side="bottom" align="end">
              <p className="text-sm font-medium mb-2">Participantes ({allParticipants.length})</p>
              <div className="space-y-2">
                {allParticipants.map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-[10px] bg-primary/20 text-primary">{getInitials(p.full_name || "?")}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{p.full_name || "?"}</span>
                    {(p as any).isMe && <Badge variant="secondary" className="text-[9px] h-4">Tú</Badge>}
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Video grid */}
      <div className="flex-1 p-3 overflow-hidden">
        {layout === "grid" ? (
          <div className={cn("grid gap-2 h-full", gridCols)}>
            {allParticipants.map(p => (
              <ParticipantTile
                key={p.id}
                name={p.full_name || "?"}
                isMe={(p as any).isMe}
                micOn={!(p as any).isMe || micOn}
                camOn={!(p as any).isMe || camOn}
                screenShare={(p as any).isMe && screenShare}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col h-full gap-2">
            <div className="flex-1">
              <ParticipantTile
                name={allParticipants[0]?.full_name || ""}
                isMe
                micOn={micOn}
                camOn={camOn}
                screenShare={screenShare}
                large
              />
            </div>
            <div className="flex gap-2 h-28 shrink-0 overflow-x-auto">
              {allParticipants.slice(1).map(p => (
                <div key={p.id} className="w-40 shrink-0">
                  <ParticipantTile name={p.full_name || "?"} micOn camOn={false} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="shrink-0 flex items-center justify-center gap-3 py-4 bg-[hsl(240_8%_10%)]">
        <ControlButton icon={micOn ? Mic : MicOff} active={micOn} onClick={() => setMicOn(!micOn)} label="Micrófono" />
        <ControlButton icon={camOn ? VideoIcon : VideoOff} active={camOn} onClick={() => setCamOn(!camOn)} label="Cámara" />
        <ControlButton icon={screenShare ? MonitorOff : Monitor} active={screenShare} onClick={() => { setScreenShare(!screenShare); toast.info(screenShare ? "Pantalla dejada de compartir" : "Compartiendo pantalla (demo)"); }} label="Pantalla" />
        <ControlButton icon={Hand} active={handRaised} onClick={() => { setHandRaised(!handRaised); toast.info(handRaised ? "Mano bajada" : "Mano levantada"); }} label="Mano" />
        <ControlButton icon={MessageSquare} onClick={() => toast.info("Chat de la llamada (demo)")} label="Chat" />
        <button
          onClick={onLeave}
          className="h-12 px-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors flex items-center gap-2 text-sm font-medium"
        >
          <PhoneOff className="h-4 w-4" />
          Salir
        </button>
      </div>
    </div>
  );
}

function ControlButton({ icon: Icon, active, onClick, label }: { icon: any; active?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "h-12 w-12 rounded-full flex items-center justify-center transition-colors",
        active === false
          ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
          : "bg-[hsl(0_0%_100%/0.1)] text-[hsl(0_0%_96%)] hover:bg-[hsl(0_0%_100%/0.2)]"
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function ParticipantTile({ name, isMe, micOn = true, camOn = true, screenShare, large }: {
  name: string; isMe?: boolean; micOn?: boolean; camOn?: boolean; screenShare?: boolean; large?: boolean;
}) {
  return (
    <div className={cn(
      "relative rounded-xl overflow-hidden flex items-center justify-center h-full",
      camOn ? "bg-[hsl(240_6%_15%)]" : "bg-[hsl(240_8%_12%)]"
    )}>
      {camOn ? (
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--primary)/0.1)] to-[hsl(var(--accent)/0.1)]" />
      ) : null}

      {screenShare ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[hsl(240_6%_13%)]">
          <div className="text-center space-y-2">
            <Monitor className="h-12 w-12 text-primary mx-auto" />
            <p className="text-sm text-[hsl(0_0%_96%/0.7)]">Compartiendo pantalla</p>
          </div>
        </div>
      ) : !camOn ? (
        <Avatar className={cn("border-2 border-[hsl(0_0%_100%/0.1)]", large ? "h-24 w-24" : "h-16 w-16")}>
          <AvatarFallback className={cn("bg-primary/20 text-primary font-semibold", large ? "text-3xl" : "text-lg")}>
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
      ) : (
        <Avatar className={cn("border-2 border-[hsl(0_0%_100%/0.1)]", large ? "h-24 w-24" : "h-16 w-16")}>
          <AvatarFallback className={cn("bg-primary/20 text-primary font-semibold", large ? "text-3xl" : "text-lg")}>
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
      )}

      {/* Name label */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-[hsl(0_0%_0%/0.6)] backdrop-blur-sm rounded-md px-2 py-1">
        <span className="text-xs font-medium text-[hsl(0_0%_96%)]">{isMe ? "Tú" : name}</span>
        {!micOn && <MicOff className="h-3 w-3 text-destructive" />}
      </div>
    </div>
  );
}
