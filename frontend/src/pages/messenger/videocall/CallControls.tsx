import { useState, useEffect, useCallback } from "react";
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, Monitor, MonitorOff,
  PhoneOff, Hand, MessageSquare, Smile, Users,
  ChevronUp, MoreVertical, SwitchCamera, LayoutGrid, Info, Volume2, ChevronDown, Check, Cloud, Sparkles, AudioLines,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { puedeCompartirPantalla } from "@/lib/compartirPantalla";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { esBlur, type BackgroundEffect } from "@/lib/fondoDeLlamada";
import { useLanguage } from "@/hooks/useLanguage";
import { traducir, type TranslationKey } from "@/lib/i18n";

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
  /** Abre "Ajustar vista". Solo lo usa el menú del teléfono: en el modo
   *  completo ese control vive en la barra de arriba, que en compacto no se
   *  dibuja. Opcional para no romper a quien ya monta este componente. */
  onOpenAdjustView?: () => void;
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
  /** Un control más, a la derecha del chat. Lo usa el Supervisor Hub para la
   *  tacita de pausa. Va como hueco y no como botón propio para que esta barra
   *  —cuyo ancho está medido— no aprenda nada de Cowork. */
  controlesExtra?: React.ReactNode;
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
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const selected = devices.find((d) => d.deviceId === selectedId);
  // `tipo` es la clave interna del selector; lo que se lee sale del diccionario.
  const sinPermiso: Record<typeof tipo, TranslationKey> = {
    "micrófono": "messenger.call.sinPermisoMicrofono",
    "altavoz": "messenger.call.sinPermisoAltavoz",
    "cámara": "messenger.call.sinPermisoCamara",
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border text-xs text-foreground hover:bg-secondary transition-colors max-w-[200px]"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{selected?.label || t("common.select")}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {/* Se abre aunque la lista este vacia: un control que no responde no le
          dice a nadie que falta dar permiso. */}
      {open && devices.length === 0 && (
        <div className="absolute bottom-full mb-1 left-0 z-50 rounded-lg bg-card border border-border shadow-xl p-3 w-[240px]">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t(sinPermiso[tipo])}
          </p>
          {onPedirPermiso && (
            <button
              onClick={() => onPedirPermiso()}
              disabled={pidiendo}
              className="mt-2 w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {pidiendo ? t("messenger.call.pidiendoPermiso") : t("messenger.call.permitirAcceso")}
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
  const { t } = useLanguage();
  const [audioInputs, setAudioInputs] = useState<DeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<DeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<DeviceInfo[]>([]);
  const [pidiendo, setPidiendo] = useState(false);

  const enumerate = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(devices.filter((d) => d.kind === "audioinput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || t("messenger.call.microfonoN", { id: d.deviceId.slice(0, 5) }) })));
      setAudioOutputs(devices.filter((d) => d.kind === "audiooutput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || t("messenger.call.altavozN", { id: d.deviceId.slice(0, 5) }) })));
      setVideoInputs(devices.filter((d) => d.kind === "videoinput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || t("messenger.call.camaraN", { id: d.deviceId.slice(0, 5) }) })));
    } catch {}
  }, [t]);

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
      toast.error(t("messenger.call.navegadorBloqueo"), {
        description: t("messenger.call.navegadorBloqueoDesc"),
        duration: 8000,
      });
    } finally {
      setPidiendo(false);
    }
  }, [enumerate, t]);

  useEffect(() => {
    if (open) enumerate();
  }, [open, enumerate]);

  return { audioInputs, audioOutputs, videoInputs, pedirPermiso, pidiendo };
}

/* ──────────────────────────────────────────────────────────────────────────
   MENÚ "MÁS" DEL TELÉFONO

   El modo compacto se inventó para la ventanita flotante de 340px, que se usa
   CON MOUSE, y ahí está bien que no tenga menús. En un teléfono el mismo modo
   se enciende por TAMAÑO DE CONTENEDOR —la pantalla entera mide menos de
   640px— y se lleva puestos el selector de cámara (o sea, pasar a la trasera,
   que en un teléfono es básico), el de micrófono, el de altavoz, los fondos,
   el cronómetro y "Ajustar vista".

   POR QUÉ UN SOLO BOTÓN Y NO VARIOS, medido y no estimado: la fila compacta
   táctil mide 356px y entra en UNA línea desde 375px de ancho — tres píxeles
   de sobra en un iPhone SE. Un botón nuevo de 32px sube ese umbral a ~410px:
   dos filas en el iPhone 12/13/14 y 48px menos de video. Los tres selectores
   sueltos darían ~494px: dos filas en TODOS los teléfonos. Este menú OCUPA EL
   LUGAR del botón de métricas, así que la fila no crece ni un píxel. Si algún
   día hay que agregar algo, que sea ADENTRO del panel.
   ────────────────────────────────────────────────────────────────────────── */

/** Lo que se le dice a la persona al cambiar la cancelación de ruido. El
 *  cambio es invisible (no hay nada que se vea distinto en la llamada), así que
 *  sin aviso nadie sabe si el toque hizo algo. */
//
// traducir() y no el hook: es un aviso que se arma y se muestra una vez, desde
// un click.
function avisarNC(activada: boolean) {
  if (activada) {
    toast.success(traducir("messenger.call.ncActivada"), { description: traducir("messenger.call.ncActivadaDesc"), id: "nc" });
  } else {
    toast.info(traducir("messenger.call.ncDesactivada"), { description: traducir("messenger.call.ncDesactivadaDesc"), id: "nc" });
  }
}

/** Interruptor de la cancelación de ruido en el menú del micro (escritorio). */
function FilaCancelacionRuido({ activa, onClick }: { activa: boolean; onClick: () => void }) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activa}
      onClick={() => { onClick(); avisarNC(!activa); }}
      className={cn(
        "mt-2 w-full h-10 px-3 rounded-lg flex items-center gap-2.5 text-sm transition-colors border",
        activa ? "bg-primary/15 text-primary border-primary/30" : "text-foreground hover:bg-muted border-border",
      )}
    >
      <AudioLines className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">{t("messenger.call.cancelacionRuido")}</span>
      <span className={cn("text-[11px] font-medium rounded-full px-2 py-0.5", activa ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
        {activa ? t("messenger.call.activada") : t("messenger.call.desactivada")}
      </span>
    </button>
  );
}

function FilaMenu({ icon: Icon, label, onClick, activa }: {
  icon: React.ElementType; label: string; onClick: () => void; activa?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full h-11 px-3 rounded-lg flex items-center gap-3 text-sm transition-colors",
        activa ? "bg-primary/15 text-primary" : "text-foreground hover:bg-muted",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="flex-1 text-left truncate">{label}</span>
    </button>
  );
}

/** Lista PLANA de dispositivos.
 *
 *  No se reusa `DevicePill`: abre su lista con `absolute bottom-full`, y acá
 *  el panel tiene scroll propio — una lista absoluta queda RECORTADA por el
 *  contenedor y se ve como un botón muerto. */
function GrupoDispositivos({ titulo, icon: Icon, devices, selectedId, onSelect }: {
  titulo: string; icon: React.ElementType; devices: DeviceInfo[];
  selectedId?: string; onSelect: (id: string) => void;
}) {
  if (devices.length === 0) return null;
  return (
    <div>
      <p className="flex items-center gap-2 px-3 pt-2 pb-1 text-xs text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" /> {titulo}
      </p>
      {devices.map((d) => (
        <button
          key={d.deviceId}
          type="button"
          onClick={() => onSelect(d.deviceId)}
          className={cn(
            "w-full h-11 px-3 rounded-lg flex items-center gap-2 text-sm text-left transition-colors",
            d.deviceId === selectedId ? "text-primary" : "text-foreground hover:bg-muted",
          )}
        >
          <Check className={cn("h-4 w-4 shrink-0", d.deviceId === selectedId ? "opacity-100" : "opacity-0")} />
          <span className="flex-1 truncate">{d.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function CallControls({
  isMicOn, isCamOn, isScreenSharing, isHandRaised, isChatOpen, unreadChatCount, isParticipantsOpen,
  currentAudioInputId, currentAudioOutputId, currentVideoInputId,
  onToggleMic, isNoiseCancellationOn, onToggleNoiseCancellation, onToggleCam, onToggleScreenShare, onToggleHand,
  onToggleChat, onToggleParticipants,
  onSendReaction, onLeave,
  onAudioInputChange, onAudioOutputChange, onVideoInputChange,
  onOpenVideoSettings, onOpenMetrics, onOpenAdjustView, hideScreenShare, hideLeaveButton, leaveLabel, leaveIcon, compact, tactil, controlesExtra,
  backgroundEffect, onToggleBlurBackground,
}: CallControlsProps) {
  const { t } = useLanguage();
  const [audioPopoverOpen, setAudioPopoverOpen] = useState(false);
  const [videoPopoverOpen, setVideoPopoverOpen] = useState(false);
  // El menú del teléfono también tiene que disparar la consulta de
  // dispositivos: si no, sus listas salen VACÍAS. `useDevices` solo enumera
  // cuando algún panel se abre, y en modo compacto los dos popovers viejos no
  // existen — así que sin esto el menú mostraría "Girar cámara" nunca y las
  // listas en blanco. Lo encontró un test, no una lectura.
  const [menuAbierto, setMenuAbierto] = useState(false);
  const devices = useDevices(audioPopoverOpen || videoPopoverOpen || menuAbierto);

  // Se mide una vez: el navegador no adquiere la capacidad a mitad de llamada.
  const [puedeCompartir] = useState(puedeCompartirPantalla);

  // Elegir algo cierra el menú: en un teléfono ocupa media pantalla, y dejarlo
  // abierto tapa justamente el video que se acaba de ir a ajustar.
  const cerrarY = (fn?: () => void) => () => { setMenuAbierto(false); fn?.(); };

  const camaras = devices.videoInputs;
  const girarCamara = () => {
    if (camaras.length < 2) return;
    const i = camaras.findIndex((d) => d.deviceId === currentVideoInputId);
    // Sin cámara elegida se asume que está la primera (es la que abre el
    // navegador por defecto), así que la siguiente es la de índice 1.
    const siguiente = i < 0 ? 1 : (i + 1) % camaras.length;
    onVideoInputChange(camaras[siguiente].deviceId);
  };

  const btnSize = compact ? (tactil ? "h-9 w-9" : "h-8 w-8") : "h-11 w-11";
  const iconSize = compact && !tactil ? "h-3.5 w-3.5" : "h-[18px] w-[18px]";

  return (
    <div className={cn("shrink-0 flex items-center bg-background", compact ? "py-1.5 px-2 justify-center flex-wrap" : "py-3 px-4")}>
      {!compact && <div className="flex-1" />}

      {/* Center controls — en no-compacto van dentro de una consola (dock-estudio):
          una barra elevada translúcida que agrupa los controles. */}
      <div className={cn("flex items-center flex-wrap justify-center", compact ? "gap-1" : "dock-estudio gap-2 rounded-2xl px-2.5 py-2")}>
        {/* Mic — compact skips device popover */}
        {compact ? (
          <button
            onClick={onToggleMic}
            title={t("messenger.call.microfono")}
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
              <PopoverContent side="top" className="z-[200] w-auto p-2.5 bg-background border-border" align="center">
                <div className="flex items-center gap-2">
                  <DevicePill icon={Mic} tipo="micrófono" devices={devices.audioInputs} selectedId={currentAudioInputId || ""} onSelect={onAudioInputChange} onPedirPermiso={() => devices.pedirPermiso("audio")} pidiendo={devices.pidiendo} />
                  <DevicePill icon={Volume2} tipo="altavoz" devices={devices.audioOutputs} selectedId={currentAudioOutputId || ""} onSelect={onAudioOutputChange} onPedirPermiso={() => devices.pedirPermiso("audio")} pidiendo={devices.pidiendo} />
                </div>
                {/* La cancelación de ruido vivía en el hook pero NINGUNA pantalla la
                    mostraba: Jhon la buscó en una llamada y no estaba. Va aquí, junto
                    al micro, que es donde uno la busca. */}
                {onToggleNoiseCancellation && (
                  <FilaCancelacionRuido activa={!!isNoiseCancellationOn} onClick={onToggleNoiseCancellation} />
                )}
              </PopoverContent>
            </Popover>
            <button
              onClick={onToggleMic}
              title={t("messenger.call.microfono")}
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
            title={t("messenger.input.camara")}
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
              <PopoverContent side="top" className="z-[200] w-auto p-2.5 bg-background border-border" align="center">
                <div className="flex items-center gap-2">
                  <DevicePill icon={VideoIcon} tipo="cámara" devices={devices.videoInputs} selectedId={currentVideoInputId || ""} onSelect={onVideoInputChange} onPedirPermiso={() => devices.pedirPermiso("video")} pidiendo={devices.pidiendo} />
                  <button
                    onClick={() => { setVideoPopoverOpen(false); onToggleBlurBackground?.(); }}
                    title={t("messenger.call.difuminarFondo")}
                    className={cn(
                      "h-8 px-3 rounded-full flex items-center gap-1.5 text-xs transition-colors",
                      esBlur(backgroundEffect)
                        ? "bg-primary/20 text-primary hover:bg-primary/25"
                        : "bg-card text-foreground hover:bg-muted"
                    )}
                  >
                    <Cloud className="h-3.5 w-3.5" />
                    <span>{t("messenger.call.fondoDifuminado")}</span>
                  </button>
                  <button
                    onClick={() => { setVideoPopoverOpen(false); onOpenVideoSettings(); }}
                    title={t("messenger.call.fondosYEfectos")}
                    className="h-8 px-3 rounded-full flex items-center gap-1.5 text-xs bg-card text-foreground hover:bg-muted transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{t("messenger.call.fondosYEfectos")}</span>
                  </button>
                </div>
              </PopoverContent>
            </Popover>
            <button
              onClick={onToggleCam}
              title={t("messenger.input.camara")}
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
            // El botón sigue tocándose aunque el teléfono no pueda compartir:
            // así el toque explica POR QUÉ no se puede. Deshabilitarlo sería
            // peor — en una pantalla táctil no hay hover, o sea que nadie
            // llegaría a leer el motivo.
            //
            // El NOMBRE no cambia con la detección, a propósito. Atarlo a
            // `puedeCompartir` hacía que el botón se llamara distinto en
            // cualquier entorno donde `navigator.mediaDevices` no exista —
            // empezando por los tests, que fue donde se notó. Un control que
            // cambia de nombre accesible según una detección es peor que uno
            // que siempre se llama igual y explica al tocarlo.
            label={t("messenger.call.compartirPantalla")}
            className={puedeCompartir ? undefined : "opacity-60"}
            compact={compact}
            tactil={tactil}
          />
        )}

        {/* Reactions — el z-[200] del content NO es decorativo: sin él el menú
            se dibuja detrás del Supervisor Hub (z-120) y de la ventanita de
            llamada (z-150), y parece que el botón no hace nada. Fue justo así
            como se reportó. Lo mismo vale para los demás menús de la llamada. */}
        <Popover>
          <PopoverTrigger asChild>
            <button title={t("messenger.call.reacciones")} className={cn(
              "rounded-full flex items-center justify-center bg-card text-foreground hover:bg-muted transition-colors",
              compact ? (tactil ? "h-9 w-9" : "h-8 w-8") : "h-11 w-11"
            )}>
              <Smile className={compact && !tactil ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"} />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" className="z-[200] w-auto p-2 bg-card border-border" align="center">
            <div className="flex gap-1">
              {REACTIONS.map((emoji) => (
                <button key={emoji} onClick={() => onSendReaction(emoji)} className={cn("hover:scale-125 transition-transform rounded-full hover:bg-muted", compact ? "text-base p-1" : "text-xl p-1.5")}>
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <ControlBtn icon={Hand} active={isHandRaised ? true : undefined} onClick={onToggleHand} label={t("messenger.call.levantarMano")} badge={isHandRaised} compact={compact} tactil={tactil} />

        {/* Leave — en compacto va icon-only (pastilla roja estilo Google Meet) */}
        {!hideLeaveButton && (() => {
          const LeaveIcon = leaveIcon ?? PhoneOff;
          return (
            <button
              onClick={onLeave}
              title={leaveLabel || t("messenger.call.colgar")}
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
            {tactil ? (
              <Popover open={menuAbierto} onOpenChange={setMenuAbierto}>
                <PopoverTrigger asChild>
                  <button
                    title={t("messenger.call.masOpciones")}
                    className={cn(
                      "rounded-full flex items-center justify-center transition-colors",
                      "h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-card",
                    )}
                  >
                    <MoreVertical className="h-[18px] w-[18px]" />
                  </button>
                </PopoverTrigger>
                {/* z-[200]: adentro del Supervisor Hub (z-120) y de la ventanita
                    de llamada (z-150), un menú con el z-50 de shadcn se dibuja
                    DETRÁS del panel y parece un botón muerto.
                    El tope de alto es necesario de verdad: con dos cámaras, dos
                    micrófonos y tres salidas el contenido pasa los 630px y arriba
                    de la fila hay ~608px. */}
                <PopoverContent
                  side="top" align="end" sideOffset={8}
                  className="z-[200] w-[min(320px,90vw)] max-h-[70vh] overflow-y-auto overscroll-contain p-1.5 bg-background border-border"
                >
                  {camaras.length > 1 && (
                    <FilaMenu icon={SwitchCamera} label={t("messenger.call.girarCamara")} onClick={cerrarY(girarCamara)} />
                  )}
                  <GrupoDispositivos titulo={t("messenger.input.camara")} icon={VideoIcon} devices={camaras}
                    selectedId={currentVideoInputId} onSelect={(id) => cerrarY(() => onVideoInputChange(id))()} />
                  <GrupoDispositivos titulo={t("messenger.call.microfono")} icon={Mic} devices={devices.audioInputs}
                    selectedId={currentAudioInputId} onSelect={(id) => cerrarY(() => onAudioInputChange(id))()} />
                  <GrupoDispositivos titulo={t("messenger.call.altavoz")} icon={Volume2} devices={devices.audioOutputs}
                    selectedId={currentAudioOutputId} onSelect={(id) => cerrarY(() => onAudioOutputChange(id))()} />
                  <div className="h-px bg-border my-1" />
                  {onToggleNoiseCancellation && (
                    <FilaMenu icon={AudioLines} label={isNoiseCancellationOn ? t("messenger.call.cancelacionRuidoActivada") : t("messenger.call.cancelacionRuido")}
                      activa={!!isNoiseCancellationOn}
                      onClick={cerrarY(() => { onToggleNoiseCancellation(); avisarNC(!isNoiseCancellationOn); })} />
                  )}
                  <FilaMenu icon={Cloud} label={t("messenger.call.difuminarFondo")}
                    activa={esBlur(backgroundEffect)}
                    onClick={cerrarY(onToggleBlurBackground)} />
                  <FilaMenu icon={Sparkles} label={t("messenger.call.fondosYEfectos")} onClick={cerrarY(onOpenVideoSettings)} />
                  {onOpenAdjustView && (
                    <FilaMenu icon={LayoutGrid} label={t("messenger.call.ajustarVista")} onClick={cerrarY(onOpenAdjustView)} />
                  )}
                  <FilaMenu icon={Info} label={t("messenger.call.metricas")} onClick={cerrarY(onOpenMetrics)} />
                </PopoverContent>
              </Popover>
            ) : (
              <PanelBtn icon={Info} onClick={onOpenMetrics} label={t("messenger.call.metricas")} compact tactil={tactil} />
            )}
            <PanelBtn icon={Users} active={isParticipantsOpen} onClick={onToggleParticipants} label={t("messenger.call.participantes")} compact tactil={tactil} />
            <PanelBtn icon={MessageSquare} active={isChatOpen} onClick={onToggleChat} label={t("messenger.call.chat")} badge={!isChatOpen ? unreadChatCount : undefined} compact tactil={tactil} />
            {controlesExtra}
          </>
        )}
      </div>

      {/* Right panel toggles — full mode */}
      {!compact && (
        <div className="flex-1 flex items-center justify-end gap-1">
          <PanelBtn icon={Info} onClick={onOpenMetrics} label={t("messenger.call.metricas")} />
          <PanelBtn icon={Users} active={isParticipantsOpen} onClick={onToggleParticipants} label={t("messenger.call.participantes")} />
          <PanelBtn
            icon={MessageSquare}
            active={isChatOpen}
            onClick={onToggleChat}
            label={t("messenger.call.chat")}
            badge={!isChatOpen ? unreadChatCount : undefined}
          />
          {controlesExtra}
        </div>
      )}
    </div>
  );
}
