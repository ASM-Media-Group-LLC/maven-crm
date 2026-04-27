import { useState, useEffect, useCallback } from "react";
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, Monitor, MonitorOff,
  PhoneOff, Hand, MessageSquare, Smile, Users,
  ChevronUp, Info, Volume2, ChevronDown, Check, Cloud, Sparkles,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { BackgroundEffect } from "./BackgroundSelector";

interface DeviceInfo {
  deviceId: string;
  label: string;
}

interface CallControlsProps {
  isMicOn: boolean;
  isCamOn: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  isChatOpen: boolean;
  unreadChatCount: number;
  isParticipantsOpen: boolean;
  currentAudioInputId?: string;
  currentAudioOutputId?: string;
  currentVideoInputId?: string;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleScreenShare: () => void;
  onToggleHand: () => void;
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  onSendReaction: (emoji: string) => void;
  onLeave: () => void;
  onAudioInputChange: (id: string) => void;
  onAudioOutputChange: (id: string) => void;
  onVideoInputChange: (id: string) => void;
  onOpenVideoSettings: () => void;
  onOpenMetrics: () => void;
  hideScreenShare?: boolean;
  hideLeaveButton?: boolean;
  compact?: boolean;
  isNoiseCancellationOn?: boolean;
  onToggleNoiseCancellation?: () => void;
}

const REACTIONS = ["👍", "👏", "❤️", "🎉", "😂", "😮", "🤔", "👋"];

function ControlBtn({
  icon: Icon, active, onClick, label, badge, className: extraClass, compact,
}: {
  icon: any; active?: boolean; onClick: () => void; label: string; badge?: boolean; className?: string; compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "relative rounded-full flex items-center justify-center transition-colors",
        compact ? "h-8 w-8" : "h-11 w-11",
        active === false
          ? "bg-[hsl(0_72%_51%)] text-white hover:bg-[hsl(0_72%_45%)]"
          : "bg-[hsl(220_3%_22%)] text-[hsl(220_3%_85%)] hover:bg-[hsl(220_3%_28%)]",
        extraClass,
      )}
    >
      <Icon className={compact ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} />
      {badge && (
        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-[hsl(214_82%_51%)] border-2 border-[hsl(220_3%_14%)]" />
      )}
    </button>
  );
}

function PanelBtn({
  icon: Icon, active, onClick, label, badge, compact,
}: {
  icon: any; active?: boolean; onClick: () => void; label: string; badge?: number; compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "relative rounded-full flex items-center justify-center transition-colors",
        compact ? "h-7 w-7" : "h-9 w-9",
        active
          ? "text-[hsl(214_82%_65%)] bg-[hsl(214_82%_51%/0.15)]"
          : "text-[hsl(220_3%_65%)] hover:text-[hsl(220_3%_85%)] hover:bg-[hsl(220_3%_22%)]",
      )}
    >
      <Icon className={compact ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} />
      {badge != null && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-[hsl(0_72%_51%)] text-white text-[10px] font-bold flex items-center justify-center px-0.5 border-2 border-[hsl(220_3%_14%)]">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

/** Pill-shaped device selector like Google Meet */
function DevicePill({ icon: Icon, devices, selectedId, onSelect }: {
  icon: any;
  devices: DeviceInfo[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = devices.find((d) => d.deviceId === selectedId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[hsl(220_3%_22%)] border border-[hsl(220_3%_30%)] text-xs text-[hsl(220_3%_85%)] hover:bg-[hsl(220_3%_25%)] transition-colors max-w-[200px]"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-[hsl(220_3%_65%)]" />
        <span className="truncate">{selected?.label || "Seleccionar"}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 text-[hsl(220_3%_55%)] transition-transform", open && "rotate-180")} />
      </button>
      {open && devices.length > 0 && (
        <div className="absolute bottom-full mb-1 left-0 z-50 rounded-lg bg-[hsl(220_3%_20%)] border border-[hsl(220_3%_28%)] shadow-xl p-1 min-w-[220px] max-h-48 overflow-y-auto">
          {devices.map((d) => (
            <button
              key={d.deviceId}
              onClick={() => { onSelect(d.deviceId); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2 text-left text-xs px-3 py-2 rounded-md transition-colors",
                d.deviceId === selectedId
                  ? "bg-[hsl(214_82%_51%/0.12)] text-[hsl(214_82%_65%)]"
                  : "text-[hsl(220_3%_80%)] hover:bg-[hsl(220_3%_28%)]"
              )}
            >
              <span className="truncate flex-1">{d.label}</span>
              {d.deviceId === selectedId && <Check className="h-3 w-3 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Hook to enumerate media devices */
function useDevices(open: boolean) {
  const [audioInputs, setAudioInputs] = useState<DeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<DeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<DeviceInfo[]>([]);

  const enumerate = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(devices.filter((d) => d.kind === "audioinput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || `Micrófono ${d.deviceId.slice(0, 5)}` })));
      setAudioOutputs(devices.filter((d) => d.kind === "audiooutput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || `Altavoz ${d.deviceId.slice(0, 5)}` })));
      setVideoInputs(devices.filter((d) => d.kind === "videoinput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || `Cámara ${d.deviceId.slice(0, 5)}` })));
    } catch {}
  }, []);

  useEffect(() => {
    if (open) enumerate();
  }, [open, enumerate]);

  return { audioInputs, audioOutputs, videoInputs };
}

export default function CallControls({
  isMicOn, isCamOn, isScreenSharing, isHandRaised, isChatOpen, unreadChatCount, isParticipantsOpen,
  currentAudioInputId, currentAudioOutputId, currentVideoInputId,
  onToggleMic, onToggleCam, onToggleScreenShare, onToggleHand,
  onToggleChat, onToggleParticipants,
  onSendReaction, onLeave,
  onAudioInputChange, onAudioOutputChange, onVideoInputChange,
  onOpenVideoSettings, onOpenMetrics, hideScreenShare, hideLeaveButton, compact,
}: CallControlsProps) {
  const [audioPopoverOpen, setAudioPopoverOpen] = useState(false);
  const [videoPopoverOpen, setVideoPopoverOpen] = useState(false);
  const devices = useDevices(audioPopoverOpen || videoPopoverOpen);

  const btnSize = compact ? "h-8 w-8" : "h-11 w-11";
  const iconSize = compact ? "h-3.5 w-3.5" : "h-[18px] w-[18px]";

  return (
    <div className={cn("shrink-0 flex items-center bg-[hsl(220_3%_14%)]", compact ? "py-1.5 px-2 justify-center flex-wrap" : "py-3 px-4")}>
      {!compact && <div className="flex-1" />}

      {/* Center controls */}
      <div className={cn("flex items-center flex-wrap justify-center", compact ? "gap-1" : "gap-2")}>
        {/* Mic — compact skips device popover */}
        {compact ? (
          <button
            onClick={onToggleMic}
            title="Micrófono"
            className={cn(
              btnSize, "rounded-full flex items-center justify-center transition-colors",
              isMicOn
                ? "bg-[hsl(220_3%_22%)] text-[hsl(220_3%_85%)] hover:bg-[hsl(220_3%_28%)]"
                : "bg-[hsl(0_72%_51%)] text-white hover:bg-[hsl(0_72%_45%)]"
            )}
          >
            {isMicOn ? <Mic className={iconSize} /> : <MicOff className={iconSize} />}
          </button>
        ) : (
          <div className="flex items-center">
            <Popover open={audioPopoverOpen} onOpenChange={setAudioPopoverOpen}>
              <PopoverTrigger asChild>
                <button className={cn(
                  "h-11 w-8 rounded-l-lg flex items-center justify-center transition-colors border-r",
                  isMicOn
                    ? "bg-[hsl(220_3%_22%)] text-[hsl(220_3%_65%)] hover:bg-[hsl(220_3%_28%)] border-[hsl(220_3%_28%)]"
                    : "bg-[hsl(0_72%_51%/0.85)] text-white hover:bg-[hsl(0_72%_45%/0.85)] border-[hsl(0_72%_45%)]"
                )}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" className="w-auto p-2.5 bg-[hsl(220_3%_17%)] border-[hsl(220_3%_28%)]" align="center">
                <div className="flex items-center gap-2">
                  <DevicePill icon={Mic} devices={devices.audioInputs} selectedId={currentAudioInputId || ""} onSelect={onAudioInputChange} />
                  <DevicePill icon={Volume2} devices={devices.audioOutputs} selectedId={currentAudioOutputId || ""} onSelect={onAudioOutputChange} />
                </div>
              </PopoverContent>
            </Popover>
            <button
              onClick={onToggleMic}
              title="Micrófono"
              className={cn(
                "h-11 w-11 rounded-r-lg flex items-center justify-center transition-colors",
                isMicOn
                  ? "bg-[hsl(220_3%_22%)] text-[hsl(220_3%_85%)] hover:bg-[hsl(220_3%_28%)]"
                  : "bg-[hsl(0_72%_51%)] text-white hover:bg-[hsl(0_72%_45%)]"
              )}
            >
              {isMicOn ? <Mic className="h-[18px] w-[18px]" /> : <MicOff className="h-[18px] w-[18px]" />}
            </button>
          </div>
        )}

        {/* Cam — compact skips device popover */}
        {compact ? (
          <button
            onClick={onToggleCam}
            title="Cámara"
            className={cn(
              btnSize, "rounded-full flex items-center justify-center transition-colors",
              isCamOn
                ? "bg-[hsl(220_3%_22%)] text-[hsl(220_3%_85%)] hover:bg-[hsl(220_3%_28%)]"
                : "bg-[hsl(0_72%_51%)] text-white hover:bg-[hsl(0_72%_45%)]"
            )}
          >
            {isCamOn ? <VideoIcon className={iconSize} /> : <VideoOff className={iconSize} />}
          </button>
        ) : (
          <div className="flex items-center">
            <Popover open={videoPopoverOpen} onOpenChange={setVideoPopoverOpen}>
              <PopoverTrigger asChild>
                <button className={cn(
                  "h-11 w-8 rounded-l-lg flex items-center justify-center transition-colors border-r",
                  isCamOn
                    ? "bg-[hsl(220_3%_22%)] text-[hsl(220_3%_65%)] hover:bg-[hsl(220_3%_28%)] border-[hsl(220_3%_28%)]"
                    : "bg-[hsl(0_72%_51%/0.85)] text-white hover:bg-[hsl(0_72%_45%/0.85)] border-[hsl(0_72%_45%)]"
                )}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" className="w-auto p-2.5 bg-[hsl(220_3%_17%)] border-[hsl(220_3%_28%)]" align="center">
                <div className="flex items-center gap-2">
                  <DevicePill icon={VideoIcon} devices={devices.videoInputs} selectedId={currentVideoInputId || ""} onSelect={onVideoInputChange} />
                  <button
                    onClick={() => { setVideoPopoverOpen(false); onOpenVideoSettings(); }}
                    title="Configuración de vídeo"
                    className="h-8 w-8 rounded-full flex items-center justify-center text-[hsl(220_3%_65%)] hover:text-[hsl(220_3%_85%)] hover:bg-[hsl(220_3%_25%)] transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </div>
              </PopoverContent>
            </Popover>
            <button
              onClick={onToggleCam}
              title="Cámara"
              className={cn(
                "h-11 w-11 rounded-r-lg flex items-center justify-center transition-colors",
                isCamOn
                  ? "bg-[hsl(220_3%_22%)] text-[hsl(220_3%_85%)] hover:bg-[hsl(220_3%_28%)]"
                  : "bg-[hsl(0_72%_51%)] text-white hover:bg-[hsl(0_72%_45%)]"
              )}
            >
              {isCamOn ? <VideoIcon className="h-[18px] w-[18px]" /> : <VideoOff className="h-[18px] w-[18px]" />}
            </button>
          </div>
        )}

        {!hideScreenShare && (
          <ControlBtn
            icon={isScreenSharing ? MonitorOff : Monitor}
            active={!isScreenSharing ? undefined : true}
            onClick={onToggleScreenShare}
            label="Compartir pantalla"
            compact={compact}
          />
        )}

        {/* Reactions */}
        <Popover>
          <PopoverTrigger asChild>
            <button title="Reacciones" className={cn(
              "rounded-full flex items-center justify-center bg-[hsl(220_3%_22%)] text-[hsl(220_3%_85%)] hover:bg-[hsl(220_3%_28%)] transition-colors",
              compact ? "h-8 w-8" : "h-11 w-11"
            )}>
              <Smile className={compact ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-auto p-2 bg-[hsl(220_3%_22%)] border-[hsl(220_3%_30%)]" align="center">
            <div className="flex gap-1">
              {REACTIONS.map((emoji) => (
                <button key={emoji} onClick={() => onSendReaction(emoji)} className={cn("hover:scale-125 transition-transform rounded-full hover:bg-[hsl(220_3%_28%)]", compact ? "text-base p-1" : "text-xl p-1.5")}>
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <ControlBtn icon={Hand} active={isHandRaised ? true : undefined} onClick={onToggleHand} label="Levantar mano" badge={isHandRaised} compact={compact} />

        {/* Leave */}
        {!hideLeaveButton && (
          <button
            onClick={onLeave}
            className={cn(
              "rounded-full bg-[hsl(0_72%_51%)] text-white hover:bg-[hsl(0_72%_45%)] transition-colors flex items-center gap-2 font-medium",
              compact ? "h-8 px-3 text-xs" : "h-11 px-5 text-sm"
            )}
          >
            <PhoneOff className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </button>
        )}

        {/* Panel toggles — inline in compact, right-aligned otherwise */}
        {compact && (
          <>
            <PanelBtn icon={Info} onClick={onOpenMetrics} label="Métricas" compact />
            <PanelBtn icon={Users} active={isParticipantsOpen} onClick={onToggleParticipants} label="Participantes" compact />
            <PanelBtn icon={MessageSquare} active={isChatOpen} onClick={onToggleChat} label="Chat" badge={!isChatOpen ? unreadChatCount : undefined} compact />
          </>
        )}
      </div>

      {/* Right panel toggles — full mode */}
      {!compact && (
        <div className="flex-1 flex items-center justify-end gap-1">
          <PanelBtn icon={Info} onClick={onOpenMetrics} label="Métricas" />
          <PanelBtn icon={Users} active={isParticipantsOpen} onClick={onToggleParticipants} label="Participantes" />
          <PanelBtn
            icon={MessageSquare}
            active={isChatOpen}
            onClick={onToggleChat}
            label="Chat"
            badge={!isChatOpen ? unreadChatCount : undefined}
          />
        </div>
      )}
    </div>
  );
}
