import {
  Mic, MicOff, Video as VideoIcon, VideoOff, Monitor, MonitorOff,
  PhoneOff, Hand, MessageSquare, Smile, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import BackgroundSelector, { BackgroundEffect } from "./BackgroundSelector";

interface CallControlsProps {
  isMicOn: boolean;
  isCamOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  isChatOpen: boolean;
  isParticipantsOpen: boolean;
  backgroundEffect: BackgroundEffect;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleScreenShare: () => void;
  onToggleHand: () => void;
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  onSendReaction: (emoji: string) => void;
  onBackgroundChange: (effect: BackgroundEffect) => void;
  onLeave: () => void;
}

const REACTIONS = ["👍", "👏", "❤️", "🎉", "😂", "😮", "🤔", "👋"];

function ControlBtn({
  icon: Icon, active, onClick, label, danger, badge,
}: {
  icon: any; active?: boolean; onClick: () => void; label: string; danger?: boolean; badge?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "relative h-12 w-12 rounded-full flex items-center justify-center transition-colors",
        danger
          ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
          : active === false
            ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
            : "bg-[hsl(0_0%_100%/0.1)] text-[hsl(0_0%_96%)] hover:bg-[hsl(0_0%_100%/0.2)]"
      )}
    >
      <Icon className="h-5 w-5" />
      {badge && (
        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary border-2 border-[hsl(240_8%_10%)]" />
      )}
    </button>
  );
}

export default function CallControls({
  isMicOn, isCamOn, isScreenSharing, isHandRaised, isChatOpen, isParticipantsOpen,
  backgroundEffect,
  onToggleMic, onToggleCam, onToggleScreenShare, onToggleHand,
  onToggleChat, onToggleParticipants, onSendReaction, onBackgroundChange, onLeave,
}: CallControlsProps) {
  return (
    <div className="shrink-0 flex items-center justify-center gap-3 py-4 bg-[hsl(240_8%_10%)]">
      <ControlBtn icon={isMicOn ? Mic : MicOff} active={isMicOn} onClick={onToggleMic} label="Micrófono" />
      <ControlBtn icon={isCamOn ? VideoIcon : VideoOff} active={isCamOn} onClick={onToggleCam} label="Cámara" />
      <ControlBtn
        icon={isScreenSharing ? MonitorOff : Monitor}
        active={!isScreenSharing ? undefined : true}
        onClick={onToggleScreenShare}
        label="Compartir pantalla"
      />
      <ControlBtn icon={Hand} active={isHandRaised ? true : undefined} onClick={onToggleHand} label="Levantar mano" badge={isHandRaised} />

      {/* Reactions */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            title="Reacciones"
            className="h-12 w-12 rounded-full flex items-center justify-center bg-[hsl(0_0%_100%/0.1)] text-[hsl(0_0%_96%)] hover:bg-[hsl(0_0%_100%/0.2)] transition-colors"
          >
            <Smile className="h-5 w-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-auto p-2" align="center">
          <div className="flex gap-1">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onSendReaction(emoji)}
                className="text-xl hover:scale-125 transition-transform p-1"
              >
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <ControlBtn icon={MessageSquare} onClick={onToggleChat} label="Chat" badge={isChatOpen} />
      <ControlBtn icon={Users} onClick={onToggleParticipants} label="Participantes" badge={isParticipantsOpen} />

      <button
        onClick={onLeave}
        className="h-12 px-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors flex items-center gap-2 text-sm font-medium"
      >
        <PhoneOff className="h-4 w-4" />
        Salir
      </button>
    </div>
  );
}
