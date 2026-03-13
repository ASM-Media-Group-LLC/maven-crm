import {
  Mic, MicOff, Video as VideoIcon, VideoOff, Monitor, MonitorOff,
  PhoneOff, Hand, MessageSquare, Smile, Users, Captions, CaptionsOff,
  BarChart3, ChevronLeft, MoreVertical,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CAPTION_LANGUAGES } from "@/hooks/useSpeechCaptions";

interface CallControlsProps {
  isMicOn: boolean;
  isCamOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  isChatOpen: boolean;
  unreadChatCount: number;
  isParticipantsOpen: boolean;
  isCaptionsOn: boolean;
  captionsLanguage: string;
  captionsSupported: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleScreenShare: () => void;
  onToggleHand: () => void;
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  onToggleCaptions: () => void;
  onCaptionsLanguageChange: (lang: string) => void;
  onSendReaction: (emoji: string) => void;
  onLeave: () => void;
  onOpenAudioSettings: () => void;
  onOpenVideoSettings: () => void;
  onOpenMetrics: () => void;
}

const REACTIONS = ["👍", "👏", "❤️", "🎉", "😂", "😮", "🤔", "👋"];

function ControlBtn({
  icon: Icon, active, onClick, label, badge, className: extraClass,
}: {
  icon: any; active?: boolean; onClick: () => void; label: string; badge?: boolean; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "relative h-11 w-11 rounded-full flex items-center justify-center transition-colors",
        active === false
          ? "bg-[hsl(0_72%_51%)] text-white hover:bg-[hsl(0_72%_45%)]"
          : "bg-[hsl(220_3%_22%)] text-[hsl(220_3%_85%)] hover:bg-[hsl(220_3%_28%)]",
        extraClass,
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
      {badge && (
        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-[hsl(214_82%_51%)] border-2 border-[hsl(220_3%_14%)]" />
      )}
    </button>
  );
}

/** Small chevron pointing left, positioned to the left of a control button */
function MiniChevron({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="h-5 w-5 rounded-full flex items-center justify-center bg-[hsl(220_3%_22%)] text-[hsl(220_3%_65%)] hover:bg-[hsl(220_3%_28%)] transition-colors"
    >
      <ChevronLeft className="h-3 w-3" />
    </button>
  );
}

export default function CallControls({
  isMicOn, isCamOn, isScreenSharing, isHandRaised, isChatOpen, unreadChatCount, isParticipantsOpen,
  isCaptionsOn, captionsLanguage, captionsSupported,
  onToggleMic, onToggleCam, onToggleScreenShare, onToggleHand,
  onToggleChat, onToggleParticipants,
  onToggleCaptions, onCaptionsLanguageChange,
  onSendReaction, onLeave, onOpenAudioSettings, onOpenVideoSettings, onOpenMetrics,
}: CallControlsProps) {
  return (
    <div className="shrink-0 flex items-center justify-center gap-2 py-3 bg-[hsl(220_3%_14%)] px-3">
      {/* Mic with audio settings chevron */}
      <div className="flex items-center gap-0.5">
        <MiniChevron onClick={onOpenAudioSettings} />
        <ControlBtn icon={isMicOn ? Mic : MicOff} active={isMicOn} onClick={onToggleMic} label="Micrófono" />
      </div>

      {/* Cam with video settings chevron */}
      <div className="flex items-center gap-0.5">
        <MiniChevron onClick={onOpenVideoSettings} />
        <ControlBtn icon={isCamOn ? VideoIcon : VideoOff} active={isCamOn} onClick={onToggleCam} label="Cámara" />
      </div>

      {/* Screen share */}
      <ControlBtn
        icon={isScreenSharing ? MonitorOff : Monitor}
        active={!isScreenSharing ? undefined : true}
        onClick={onToggleScreenShare}
        label="Compartir pantalla"
      />

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

      {/* Hand raise */}
      <ControlBtn icon={Hand} active={isHandRaised ? true : undefined} onClick={onToggleHand} label="Levantar mano" badge={isHandRaised} />

      {/* Metrics */}
      <ControlBtn icon={BarChart3} onClick={onOpenMetrics} label="Métricas" />

      {/* More options: Chat, Participants */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            title="Más opciones"
            className="h-11 w-11 rounded-full flex items-center justify-center bg-[hsl(220_3%_22%)] text-[hsl(220_3%_85%)] hover:bg-[hsl(220_3%_28%)] transition-colors relative"
          >
            <MoreVertical className="h-[18px] w-[18px]" />
            {unreadChatCount > 0 && !isChatOpen && (
              <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-[hsl(0_72%_51%)] border-2 border-[hsl(220_3%_14%)]" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-48 p-1 bg-[hsl(220_3%_22%)] border-[hsl(220_3%_30%)]" align="center">
          <MoreMenuItem icon={MessageSquare} label="Chat" badge={unreadChatCount > 0 && !isChatOpen ? unreadChatCount : undefined} onClick={onToggleChat} />
          <MoreMenuItem icon={Users} label="Participantes" active={isParticipantsOpen} onClick={onToggleParticipants} />
        </PopoverContent>
      </Popover>

      {/* Leave */}
      <button
        onClick={onLeave}
        className="h-11 px-5 rounded-full bg-[hsl(0_72%_51%)] text-white hover:bg-[hsl(0_72%_45%)] transition-colors flex items-center gap-2 text-sm font-medium ml-1"
      >
        <PhoneOff className="h-4 w-4" />
      </button>
    </div>
  );
}

function MoreMenuItem({ icon: Icon, label, active, badge, onClick }: {
  icon: any; label: string; active?: boolean; badge?: number; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
        active ? "bg-[hsl(214_82%_51%/0.12)] text-[hsl(214_82%_65%)]" : "text-[hsl(220_3%_85%)] hover:bg-[hsl(220_3%_28%)]"
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1 text-left">{label}</span>
      {badge != null && (
        <span className="min-w-[18px] h-[18px] rounded-full bg-[hsl(0_72%_51%)] text-white text-[10px] font-bold flex items-center justify-center px-1">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}
