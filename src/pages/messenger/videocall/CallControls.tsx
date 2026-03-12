import {
  Mic, MicOff, Video as VideoIcon, VideoOff, Monitor, MonitorOff,
  PhoneOff, Hand, MessageSquare, Smile, Users, BarChart3, Captions, CaptionsOff, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import BackgroundSelector, { BackgroundEffect } from "./BackgroundSelector";
import { CAPTION_LANGUAGES } from "@/hooks/useSpeechCaptions";

interface CallControlsProps {
  isMicOn: boolean;
  isCamOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  isChatOpen: boolean;
  isParticipantsOpen: boolean;
  isMetricsOpen: boolean;
  isCaptionsOn: boolean;
  captionsLanguage: string;
  captionsSupported: boolean;
  backgroundEffect: BackgroundEffect;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleScreenShare: () => void;
  onToggleHand: () => void;
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  onToggleMetrics: () => void;
  onToggleCaptions: () => void;
  onCaptionsLanguageChange: (lang: string) => void;
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
  isMicOn, isCamOn, isScreenSharing, isHandRaised, isChatOpen, isParticipantsOpen, isMetricsOpen,
  isCaptionsOn, captionsLanguage, captionsSupported,
  backgroundEffect,
  onToggleMic, onToggleCam, onToggleScreenShare, onToggleHand,
  onToggleChat, onToggleParticipants, onToggleMetrics,
  onToggleCaptions, onCaptionsLanguageChange,
  onSendReaction, onBackgroundChange, onLeave,
}: CallControlsProps) {
  return (
    <div className="shrink-0 flex items-center justify-center gap-2 md:gap-3 py-4 bg-[hsl(240_8%_10%)] flex-wrap px-2">
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

      {/* Captions with language selector */}
      {captionsSupported && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              title="Subtítulos"
              className={cn(
                "relative h-12 w-12 rounded-full flex items-center justify-center transition-colors",
                isCaptionsOn
                  ? "bg-primary/30 text-primary hover:bg-primary/40"
                  : "bg-[hsl(0_0%_100%/0.1)] text-[hsl(0_0%_96%)] hover:bg-[hsl(0_0%_100%/0.2)]"
              )}
            >
              {isCaptionsOn ? <Captions className="h-5 w-5" /> : <CaptionsOff className="h-5 w-5" />}
              {isCaptionsOn && (
                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary border-2 border-[hsl(240_8%_10%)]" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-56 p-3" align="center">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Subtítulos</span>
                <button
                  onClick={onToggleCaptions}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full font-medium transition-colors",
                    isCaptionsOn
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {isCaptionsOn ? "Activado" : "Desactivado"}
                </button>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Idioma</label>
                <select
                  value={captionsLanguage}
                  onChange={(e) => onCaptionsLanguageChange(e.target.value)}
                  className="w-full text-sm bg-muted border border-border rounded-md px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {CAPTION_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}

      <BackgroundSelector selected={backgroundEffect} onSelect={onBackgroundChange} />
      <ControlBtn icon={MessageSquare} onClick={onToggleChat} label="Chat" badge={isChatOpen} />
      <ControlBtn icon={Users} onClick={onToggleParticipants} label="Participantes" badge={isParticipantsOpen} />
      <ControlBtn icon={BarChart3} onClick={onToggleMetrics} label="Métricas" badge={isMetricsOpen} />

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
