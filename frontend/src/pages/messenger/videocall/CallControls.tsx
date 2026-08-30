import { useState, useEffect, useCallback } from "react";
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, Monitor, MonitorOff,
  PhoneOff, Hand, MessageSquare, Smile, Users,
  ChevronUp, Info, Volume2, ChevronDown, Check, Cloud, Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
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
  leaveLabel?: string;
  leaveIcon?: LucideIcon;
  compact?: boolean;
  /** Se va a tocar con un dedo: hay que agrandar los botones.
   *
   *  LOS TAMAÑOS ESTÁN MEDIDOS, no elegidos a ojo. Con 40px la fila necesita
   *  413px para entrar en una línea, así que se partía en dos en casi todos los
   *  teléfonos y se comía 48px de video. Con 36px (y el de colgar en 48) entra
   *  en una sola fila desde 375px: iPhone SE/13 mini, 12/13/14 (390), Pixel
   *  (412) y Pro Max (430). De 360 para abajo envuelve, que con `flex-wrap` es
   *  prolijo y sigue siendo mejor que nueve botones de 28px pegados.
   *
   *
   *  El modo compacto se inventó para la ventana flotante de 340px, y ahí los
   *  botones de 28px están bien: se usan con un mouse. En un teléfono la misma
   *  fila se dibuja igual de chica pero se toca con el pulgar — nueve controles
   *  de 28px separados por 4px, y errarle a "chat" silencia el micrófono o
   *  cuelga la llamada. Con esto se suben a 40/36 solo en ese caso.
   *
   *  La fila ya envuelve (`flex-wrap`), así que si no entran pasa a dos líneas
   *  en vez de salirse de la pantalla. */
  tactil?: boolean;
  isNoiseCancellationOn?: boolean;
  onToggleNoiseCancellation?: () => void;
  backgroundEffect?: BackgroundEffect;
  onToggleBlurBackground?: () => void;
}

const REACTIONS = ["👍", "👏", "❤️", "🎉", "😂", "😮", "🤔", "👋"];

function ControlBtn({
  icon: Icon, active, onClick, label, badge, className: extraClass, compact, tactil,
}: {
  icon: any; active?: boolean; onClick: () => void; label: string; badge?: boolean; className?: string; compact?: boolean; tactil?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "relative rounded-full flex items-center justify-center transition-colors",
        compact ? (tactil ? "h-9 w-9" : "h-8 w-8") : "h-11 w-11",
        active === false
          ? "bg-destructive text-white hover:bg-destructive/90"
          : "bg-card text-foreground hover:bg-muted",
        extraClass,
      )}
    >
      <Icon className={compact && !tactil ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} />
      {badge && (
        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary border-2 border-background" />
      )}
    </button>
  );
}

function PanelBtn({
  icon: Icon, active, onClick, label, badge, compact, tactil,
}: {
  icon: any; active?: boolean; onClick: () => void; label: string; badge?: number; compact?: boolean; tactil?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "relative rounded-full flex items-center justify-center transition-colors",
        compact ? (tactil ? "h-8 w-8" : "h-7 w-7") : "h-9 w-9",
        active
          ? "text-primary bg-primary/15"
          : "text-muted-foreground hover:text-foreground hover:bg-card",
      )}
    >
      <Icon className={compact && !tactil ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} />
      {badge != null && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center px-0.5 border-2 border-background">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

/** Pill-shaped device selector like Google Meet */
function DevicePill({ icon: Icon, devices, selectedId, onSelect, onPedirPermiso, pidiendo, tipo }: {
  icon: any;
  devices: DeviceInfo[];
  selectedId: string;
  onSelect: (id: string) => void;
  onPedirPermiso?: () => void;
  pidiendo?: boolean;
  tipo: "micrófono" | "altavoz" | "cámara";
}) {
  const [open, setOpen] = useState(false);
  const selected = devices.find((d) => d.deviceId === selectedId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-xs text-foreground hover:bg-secondary transition-colors max-w-[200px]"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{selected?.label || "Seleccionar"}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {/* Se abre aunque la lista este vacia: un control que no responde no le
          dice a nadie que falta dar permiso. */}
      {open && devices.length === 0 && (
        <div className="absolute bottom-full mb-1 left-0 z-50 rounded-lg bg-card border border-border shadow-xl p-3 w-[240px]">
          <p className="text-xs text-muted-foreground leading-relaxed">
            El navegador no muestra tu {tipo} hasta que le des permiso.
          </p>
          {onPedirPermiso && (
            <button
              onClick={() => onPedirPermiso()}
              disabled={pidiendo}
              className="mt-2 w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {pidiendo ? "Pidiendo permiso…" : "Permitir acceso"}
            </button>
          )}
        </div>
      )}
      {open && devices.length > 0 && (
        <div className="absolute bottom-full mb-1 left-0 z-50 rounded-lg bg-card border border-border shadow-xl p-1 min-w-[220px] max-h-48 overflow-y-auto">
          {devices.map((d) => (
            <button
              key={d.deviceId}
              onClick={() => { onSelect(d.deviceId); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2 text-left text-xs px-3 py-2 rounded-md transition-colors",
                d.deviceId === selectedId
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-muted"
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
//
// El navegador NO entrega ni el id ni la etiqueta de un dispositivo hasta que la
// persona dio permiso de micro o camara. Quien entro a la llamada con los dos
// apagados —o los rechazo— ve una lista vacia, y antes eso dejaba el selector
// mudo: hacia click y no pasaba nada, sin ninguna explicacion. Por eso el hook
// ademas expone como PEDIR el permiso.
function useDevices(open: boolean) {
  const [audioInputs, setAudioInputs] = useState<DeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<DeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<DeviceInfo[]>([]);
  const [pidiendo, setPidiendo] = useState(false);

  const enumerate = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(devices.filter((d) => d.kind === "audioinput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || `Micrófono ${d.deviceId.slice(0, 5)}` })));
      setAudioOutputs(devices.filter((d) => d.kind === "audiooutput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || `Altavoz ${d.deviceId.slice(0, 5)}` })));
      setVideoInputs(devices.filter((d) => d.kind === "videoinput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || `Cámara ${d.deviceId.slice(0, 5)}` })));
    } catch {}
  }, []);

  // Un getUserMedia basta para que el navegador revele los dispositivos. El
  // track se corta enseguida: solo se queria el permiso, no capturar nada.
  const pedirPermiso = useCallback(async (tipo: "audio" | "video") => {
    setPidiendo(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        tipo === "audio" ? { audio: true } : { video: true },
      );
      stream.getTracks().forEach((t) => t.stop());
      await enumerate();
    } catch {
      toast.error("El navegador bloqueó el acceso", {
        description: "Hay que habilitarlo desde el candado de la barra de direcciones.",
        duration: 8000,
      });
    } finally {
      setPidiendo(false);
    }
  }, [enumerate]);

  useEffect(() => {
    if (open) enumerate();
  }, [open, enumerate]);

  return { audioInputs, audioOutputs, videoInputs, pedirPermiso, pidiendo };
}

export default function CallControls({
  isMicOn, isCamOn, isScreenSharing, isHandRaised, isChatOpen, unreadChatCount, isParticipantsOpen,
  currentAudioInputId, currentAudioOutputId, currentVideoInputId,
  onToggleMic, onToggleCam, onToggleScreenShare, onToggleHand,
  onToggleChat, onToggleParticipants,
  onSendReaction, onLeave,
  onAudioInputChange, onAudioOutputChange, onVideoInputChange,
  onOpenVideoSettings, onOpenMetrics, hideScreenShare, hideLeaveButton, leaveLabel, leaveIcon, compact, tactil,
  backgroundEffect, onToggleBlurBackground,
}: CallControlsProps) {
  const [audioPopoverOpen, setAudioPopoverOpen] = useState(false);
  const [videoPopoverOpen, setVideoPopoverOpen] = useState(false);
  const devices = useDevices(audioPopoverOpen || videoPopoverOpen);

  const btnSize = compact ? (tactil ? "h-9 w-9" : "h-8 w-8") : "h-11 w-11";
  const iconSize = compact && !tactil ? "h-3.5 w-3.5" : "h-[18px] w-[18px]";

  return (
    <div className={cn("shrink-0 flex items-center bg-background", compact ? "py-1.5 px-2 justify-center flex-wrap" : "py-3 px-4")}>
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
                ? "bg-card text-foreground hover:bg-muted"
                : "bg-destructive text-white hover:bg-destructive/90"
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
                    ? "bg-card text-muted-foreground hover:bg-muted border-border"
                    : "bg-destructive/85 text-white hover:bg-destructive/80 border-destructive/90"
                )}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" className="w-auto p-2.5 bg-background border-border" align="center">
                <div className="flex items-center gap-2">
                  <DevicePill icon={Mic} tipo="micrófono" devices={devices.audioInputs} selectedId={currentAudioInputId || ""} onSelect={onAudioInputChange} onPedirPermiso={() => devices.pedirPermiso("audio")} pidiendo={devices.pidiendo} />
                  <DevicePill icon={Volume2} tipo="altavoz" devices={devices.audioOutputs} selectedId={currentAudioOutputId || ""} onSelect={onAudioOutputChange} onPedirPermiso={() => devices.pedirPermiso("audio")} pidiendo={devices.pidiendo} />
                </div>
              </PopoverContent>
            </Popover>
            <button
              onClick={onToggleMic}
              title="Micrófono"
              className={cn(
                "h-11 w-11 rounded-r-lg flex items-center justify-center transition-colors",
                isMicOn
                  ? "bg-card text-foreground hover:bg-muted"
                  : "bg-destructive text-white hover:bg-destructive/90"
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
                ? "bg-card text-foreground hover:bg-muted"
                : "bg-destructive text-white hover:bg-destructive/90"
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
                    ? "bg-card text-muted-foreground hover:bg-muted border-border"
                    : "bg-destructive/85 text-white hover:bg-destructive/80 border-destructive/90"
                )}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" className="w-auto p-2.5 bg-background border-border" align="center">
                <div className="flex items-center gap-2">
                  <DevicePill icon={VideoIcon} tipo="cámara" devices={devices.videoInputs} selectedId={currentVideoInputId || ""} onSelect={onVideoInputChange} onPedirPermiso={() => devices.pedirPermiso("video")} pidiendo={devices.pidiendo} />
                  <button
                    onClick={() => { setVideoPopoverOpen(false); onToggleBlurBackground?.(); }}
                    title="Difuminar fondo"
                    className={cn(
                      "h-8 px-3 rounded-full flex items-center gap-1.5 text-xs transition-colors",
                      backgroundEffect === "blur"
                        ? "bg-primary/20 text-primary hover:bg-primary/25"
                        : "bg-card text-foreground hover:bg-muted"
                    )}
                  >
                    <Cloud className="h-3.5 w-3.5" />
                    <span>Fondo difuminado</span>
                  </button>
                  <button
                    onClick={() => { setVideoPopoverOpen(false); onOpenVideoSettings(); }}
                    title="Fondos y efectos"
                    className="h-8 px-3 rounded-full flex items-center gap-1.5 text-xs bg-card text-foreground hover:bg-muted transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Fondos y efectos</span>
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
                  ? "bg-card text-foreground hover:bg-muted"
                  : "bg-destructive text-white hover:bg-destructive/90"
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
            tactil={tactil}
          />
        )}

        {/* Reactions */}
        <Popover>
          <PopoverTrigger asChild>
            <button title="Reacciones" className={cn(
              "rounded-full flex items-center justify-center bg-card text-foreground hover:bg-muted transition-colors",
              compact ? (tactil ? "h-9 w-9" : "h-8 w-8") : "h-11 w-11"
            )}>
              <Smile className={compact && !tactil ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-auto p-2 bg-card border-border" align="center">
            <div className="flex gap-1">
              {REACTIONS.map((emoji) => (
                <button key={emoji} onClick={() => onSendReaction(emoji)} className={cn("hover:scale-125 transition-transform rounded-full hover:bg-muted", compact ? "text-base p-1" : "text-xl p-1.5")}>
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <ControlBtn icon={Hand} active={isHandRaised ? true : undefined} onClick={onToggleHand} label="Levantar mano" badge={isHandRaised} compact={compact} tactil={tactil} />

        {/* Leave — en compacto va icon-only (pastilla roja estilo Google Meet) */}
        {!hideLeaveButton && (() => {
          const LeaveIcon = leaveIcon ?? PhoneOff;
          return (
            <button
              onClick={onLeave}
              title={leaveLabel || "Colgar"}
              className={cn(
                "rounded-full bg-destructive text-white hover:bg-destructive/90 transition-colors flex items-center justify-center gap-2 font-medium",
                compact ? (tactil ? "h-9 w-12 text-xs" : "h-8 w-12 text-xs") : "h-11 px-5 text-sm"
              )}
            >
              <LeaveIcon className={compact && !tactil ? "h-3.5 w-3.5" : "h-4 w-4"} />
              {leaveLabel && !compact && <span>{leaveLabel}</span>}
            </button>
          );
        })()}

        {/* Panel toggles — inline in compact, right-aligned otherwise */}
        {compact && (
          <>
            <PanelBtn icon={Info} onClick={onOpenMetrics} label="Métricas" compact tactil={tactil} />
            <PanelBtn icon={Users} active={isParticipantsOpen} onClick={onToggleParticipants} label="Participantes" compact tactil={tactil} />
            <PanelBtn icon={MessageSquare} active={isChatOpen} onClick={onToggleChat} label="Chat" badge={!isChatOpen ? unreadChatCount : undefined} compact tactil={tactil} />
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
