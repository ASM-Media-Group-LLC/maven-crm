import {
  Mic, MicOff, Video as VideoIcon, VideoOff, Monitor, MonitorOff,
  PhoneOff, Hand, MessageSquare, Smile, Users, BarChart3, Captions, CaptionsOff,
} from "lucide-react";
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
  unreadChatCount: number;
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
  icon: Icon, active, onClick, label, badge,
}: {
  icon: any; active?: boolean; onClick: () => void; label: string; badge?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "relative h-11 w-11 rounded-full flex items-center justify-center transition-colors",
        active === false
          ? "bg-[hsl(0_72%_51%)] text-white hover:bg-[hsl(0_72%_45%)]"
          : "bg-[hsl(220_3%_22%)] text-[hsl(220_3%_85%)] hover:bg-[hsl(220_3%_28%)]"
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
      {badge && (
        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-[hsl(214_82%_51%)] border-2 border-[hsl(220_3%_14%)]" />
      )}
    </button>
  );
}

export default function CallControls({
  isMicOn, isCamOn, isScreenSharing, isHandRaised, isChatOpen, unreadChatCount, isParticipantsOpen, isMetricsOpen,
  isCaptionsOn, captionsLanguage, captionsSupported,
  backgroundEffect,
  onToggleMic, onToggleCam, onToggleScreenShare, onToggleHand,
  onToggleChat, onToggleParticipants, onToggleMetrics,
  onToggleCaptions, onCaptionsLanguageChange,
  onSendReaction, onBackgroundChange, onLeave,
}: CallControlsProps) {
  return (
    <div className="shrink-0 flex items-center justify-center gap-2 md:gap-3 py-3 bg-[hsl(220_3%_14%)] flex-wrap px-3">
      {/* Primary controls */}
      <ControlBtn icon={isMicOn ? Mic : MicOff} active={isMicOn} onClick={onToggleMic} label="Micrófono" />
      <ControlBtn icon={isCamOn ? VideoIcon : VideoOff} active={isCamOn} onClick={onToggleCam} label="Cámara" />
      <ControlBtn
        icon={isScreenSharing ? MonitorOff : Monitor}
        active={!isScreenSharing ? undefined : true}
        onClick={onToggleScreenShare}
        label="Compartir pantalla"
      />
      <ControlBtn icon={Hand} active={isHandRaised ? true : undefined} onClick={onToggleHand} label="Levantar mano" badge={isHandRaised} />

      {/* Divider */}
      <div className="h-7 w-px bg-[hsl(220_3%_28%)] mx-1 hidden md:block" />

      {/* Reactions */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            title="Reacciones"
            className="h-11 w-11 rounded-full flex items-center justify-center bg-[hsl(220_3%_22%)] text-[hsl(220_3%_85%)] hover:bg-[hsl(220_3%_28%)] transition-colors"
          >
            <Smile className="h-[18px] w-[18px]" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-auto p-2 bg-[hsl(220_3%_22%)] border-[hsl(220_3%_30%)]" align="center">
          <div className="flex gap-1">
            {REACTIONS.map((emoji) => (
              <button key={emoji} onClick={() => onSendReaction(emoji)} className="text-xl hover:scale-125 transition-transform p-1.5 rounded-full hover:bg-[hsl(220_3%_28%)]">
                {emoji}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Captions */}
      {captionsSupported && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              title="Subtítulos"
              className={cn(
                "relative h-11 w-11 rounded-full flex items-center justify-center transition-colors",
                isCaptionsOn
                  ? "bg-[hsl(214_82%_51%/0.2)] text-[hsl(214_82%_65%)] hover:bg-[hsl(214_82%_51%/0.3)]"
                  : "bg-[hsl(220_3%_22%)] text-[hsl(220_3%_85%)] hover:bg-[hsl(220_3%_28%)]"
              )}
            >
              {isCaptionsOn ? <Captions className="h-[18px] w-[18px]" /> : <CaptionsOff className="h-[18px] w-[18px]" />}
              {isCaptionsOn && (
                <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-[hsl(214_82%_51%)] border-2 border-[hsl(220_3%_14%)]" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-56 p-3 bg-[hsl(220_3%_22%)] border-[hsl(220_3%_30%)]" align="center">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[hsl(220_3%_85%)]">Subtítulos</span>
                <button
                  onClick={onToggleCaptions}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full font-medium transition-colors",
                    isCaptionsOn
                      ? "bg-[hsl(214_82%_51%)] text-white"
                      : "bg-[hsl(220_3%_30%)] text-[hsl(220_3%_70%)] hover:bg-[hsl(220_3%_35%)]"
                  )}
                >
                  {isCaptionsOn ? "Activado" : "Desactivado"}
                </button>
              </div>
              <div>
                <label className="text-xs text-[hsl(220_3%_55%)] mb-1.5 block">Idioma</label>
                <select
                  value={captionsLanguage}
                  onChange={(e) => onCaptionsLanguageChange(e.target.value)}
                  className="w-full text-sm bg-[hsl(220_3%_18%)] border border-[hsl(220_3%_30%)] rounded-md px-2 py-1.5 text-[hsl(220_3%_85%)] focus:outline-none focus:ring-1 focus:ring-[hsl(214_82%_51%)]"
                >
                  {CAPTION_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}

      <BackgroundSelector selected={backgroundEffect} onSelect={onBackgroundChange} />

      {/* Chat */}
      <div className="relative">
        <ControlBtn icon={MessageSquare} onClick={onToggleChat} label="Chat" />
        {unreadChatCount > 0 && !isChatOpen && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-[hsl(0_72%_51%)] text-white text-[10px] font-bold flex items-center justify-center px-1 z-10">
            {unreadChatCount > 99 ? "99+" : unreadChatCount}
          </span>
        )}
      </div>
      <ControlBtn icon={Users} onClick={onToggleParticipants} label="Participantes" badge={isParticipantsOpen} />
      <ControlBtn icon={BarChart3} onClick={onToggleMetrics} label="Métricas" badge={isMetricsOpen} />

      {/* Divider */}
      <div className="h-7 w-px bg-[hsl(220_3%_28%)] mx-1 hidden md:block" />

      {/* Leave */}
      <button
        onClick={onLeave}
        className="h-11 px-5 rounded-full bg-[hsl(0_72%_51%)] text-white hover:bg-[hsl(0_72%_45%)] transition-colors flex items-center gap-2 text-sm font-medium"
      >
        <PhoneOff className="h-4 w-4" />
        Salir
      </button>
    </div>
  );
}
