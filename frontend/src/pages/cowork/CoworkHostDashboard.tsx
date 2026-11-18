import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Cronometro, RelojDePersona } from "./RelojVivo";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users2, Headphones, Hand, Monitor, DoorOpen,
  X, Loader2, Radio, Link2, Menu, XIcon, Maximize2, Minimize2, Phone, Share2,
  Mic, MicOff, Video, VideoOff, ArrowLeft, Plus, Pencil, Volume2, VolumeX, ScreenShare, ScreenShareOff,
  PanelRightClose, PanelRightOpen, MoreVertical, MessageCircle,
  Pin, PinOff, PhoneOff, PictureInPicture2, KeyRound, Check, Coffee, EyeOff, MonitorOff, Settings2, MoreHorizontal,
  WifiOff, WifiLow, ChevronRight, Megaphone, ArrowRightLeft, Cloud, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";
import { usePersistentCall, CallOutlet } from "@/components/PersistentCallProvider";
import CoworkRoomMonitor from "./CoworkRoomMonitor";
import { formatBreak } from "./CoworkParticipantView";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { playCoordinatorRequestSound } from "@/lib/coordinatorRequestSound";
import { encolarVoz, alFallarLaVoz } from "@/lib/colaDeVoz";
import { debeAvisarSinPantalla } from "@/hooks/useFaceNudge";
import { olvidarAusentes, tocaAvisar, type MarcasAviso } from "@/lib/avisosSupervisor";
import { useCaidasDelEquipo } from "@/hooks/useCaidasDelEquipo";
import { hayChipDeCaidas } from "@/lib/caidasSeguidas";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { useCoworkMediaPresence, type MediaState } from "@/hooks/useCoworkMediaPresence";
import { cn } from "@/lib/utils";
import { tituloBonito } from "@/lib/tituloBonito";
import { leerLimitesPausa, rpcConsumoPausas } from "@/lib/coworkTablas";
import { relojDesdePresencia } from "@/lib/coworkReloj";
import { personasEnSala, relojDeRespaldo, latidoFresco, sinConexionConLaSala } from "@/lib/coworkOcupacion";
import { cuentaComoTrabajo } from "@/lib/coworkTiempoRegla";
import { useRelojDeSala } from "@/hooks/useRelojDeSala";
import { type PausaDeSala } from "./SalaEnPausa";
import AvisarDialog from "./AvisarDialog";
import AvisarGeneralDialog, { type ObjetivoAviso } from "./AvisarGeneralDialog";
import AvisoChatter from "./AvisoChatter";
import { MarcaApp, ResumenAppDelEquipo } from "./AppDelEquipo";
import { useRecepcionAvisos } from "./useRecepcionAvisos";
import { puedeAvisar as puedeAvisarCowork } from "@/lib/coworkAvisos";
import { cuentaPausa, clasesPausa, nombreYApellido, nombreCorto } from "@/lib/pausaCowork";
import { normalizarReglas, reglaDeEstado, sonEstandar, type ReglaAviso } from "@/lib/coworkReglas";
import { armarCadenaNC, loadNCPreference, type CadenaNC } from "@/lib/noise-suppression-processor";
import CoworkReglasDialog from "./CoworkReglasDialog";
import CoworkPausasDialog from "./CoworkPausasDialog";
import MeetGrupalDialog from "./MeetGrupalDialog";
import type { CoworkMeet } from "@/hooks/useCoworkSession";
import PausaSupervisorBoton from "./PausaSupervisorBoton";
import { leerPausaSupervisor, suscribirPausaSupervisor, esEstadoSupervisor } from "@/lib/pausaSupervisor";
import { iniciarLatido, actualizarLatido, detenerLatido } from "@/lib/coworkLatido";
import { juntarMedios, type MedioDeLlamada } from "@/lib/latidoDelSupervisor";
import { fijarPantallaDelHub, pantallaDelHub, suscribirPantallaDelHub } from "@/lib/pantallaDelHub";
import { marcarPausa } from "@/lib/coworkPausa";
import type { useCoworkSession, CoworkRoom } from "@/hooks/useCoworkSession";
import { useUserRole } from "@/hooks/useUserRole";
import { useIsMobile } from "@/hooks/use-mobile";
import { useChatShared } from "@/hooks/ChatProvider";
import { useMessengerDock } from "@/components/messenger/MessengerDock";
import { MUELLE_EXTRA_ID } from "@/hooks/useMuelleFlotante";
import { UserAvatar } from "@/components/UserAvatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLanguage } from "@/hooks/useLanguage";
import { traducir, type TranslationKey } from "@/lib/i18n";
import { ETIQUETA_SUPERVISOR, NOMBRE_PAUSA, claveMotivoDetenido, mensajeDeSolicitud } from "./textosCowork";
import { alternarBlur, esBlur, guardarFondo, leerFondoGuardado, type BackgroundEffect } from "@/lib/fondoDeLlamada";
import { precalentarFondo, soportaProcesadorDeFondo } from "@/lib/fondoFino/procesador";
import { crearCamaraDelAnfitrion, type CamaraDelAnfitrion, type ResultadoDelFondo } from "@/lib/camaraDelAnfitrion";
import { escritorio } from "@/lib/escritorio";

// Lo que vio el detector de encuadre, como CÓDIGO: se compara y se elige el
// icono con esto, y el texto sale del diccionario en el idioma de quien mira.
type ProblemaCara = "sin_rostro" | "fuera_de_cuadro" | "sin_luz" | "camara_apagada";
const ETIQUETA_PROBLEMA: Record<ProblemaCara, TranslationKey> = {
  sin_rostro: "cowork.host.face.noFace",
  fuera_de_cuadro: "cowork.host.face.outOfFrame",
  sin_luz: "cowork.host.face.noLight",
  camara_apagada: "cowork.host.face.cameraOff",
};
// Lo que DICE la voz del tablero. Queda en español a propósito: el motor de voz
// está fijo en español (lib/voz pide es-419) y leer inglés con esa voz no se
// entiende. Lo escrito (etiquetas y avisos) sí sale en el idioma de la interfaz.
const VOZ_PROBLEMA: Record<ProblemaCara, string> = {
  sin_rostro: "no está frente a la cámara",
  fuera_de_cuadro: "está fuera de cuadro",
  sin_luz: "no tiene luz suficiente",
  camara_apagada: "tiene la cámara apagada y no marcó pausa",
};
// Por qué se murió la voz: lib/colaDeVoz lo manda armado en español. Los dos
// motivos que conoce se dicen en el idioma de quien mira; uno nuevo sale tal cual.
const MOTIVO_VOZ: Record<string, TranslationKey> = {
  "el navegador aceptó la frase pero nunca la reprodujo": "cowork.host.voiceReason.neverPlayed",
  "este navegador no tiene síntesis de voz": "cowork.host.voiceReason.noSynthesis",
};

// Un control de la tarjeta de sala (escuchar, hablar, cámara, pantalla). El
// estado se lee por el color, no por la palabra: apagado es neutro, encendido
// es verde (algo tuyo está saliendo a esa sala) y "caído" es rojo latiendo,
// porque un botón verde con el micro muerto es el peor de los mundos. Antes
// "Hablar" apagado era rojo, y en una sesión de once salas eran once botones
// rojos gritando sin que pasara nada.
function BotonSala({ activo, tono = "verde", icono: Icono, etiqueta, title, grande, onClick }: {
  activo: boolean;
  /** "neutro": encendido es el estado normal (escuchar); "verde": encendido
   *  es algo tuyo saliendo a la sala; "caido": está encendido pero no llega. */
  tono?: "neutro" | "verde" | "caido";
  icono: LucideIcon;
  /** Texto al lado del icono. En la tarjeta solo lo lleva Hablar; en la hoja
   *  del teléfono lo llevan todos. */
  etiqueta?: string;
  title: string;
  grande?: boolean;
  onClick: () => void;
}) {
  const color = tono === "caido"
    ? "bg-destructive text-destructive-foreground animate-pulse motion-reduce:animate-none"
    : activo
      ? (tono === "neutro" ? "text-foreground hover:bg-muted" : "bg-success text-success-foreground hover:bg-success/90")
      : "text-muted-foreground/60 hover:bg-muted hover:text-foreground";
  return (
    <button
      type="button"
      title={title}
      aria-pressed={activo}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors",
        grande ? "h-11 flex-1 px-3" : "h-8 min-w-8 px-2 tactil:h-10 tactil:min-w-10",
        color,
      )}
    >
      <Icono className={grande ? "h-4 w-4" : "h-3.5 w-3.5"} />
      {etiqueta && <span>{etiqueta}</span>}
    </button>
  );
}

interface Props {
  cowork: ReturnType<typeof useCoworkSession>;
  userId: string;
}

export default function CoworkHostDashboard({ cowork, userId }: Props) {
  // Los métodos del meet grupal sueltos: los callbacks dependen de ellos, no de `cowork` entero.
  const { crearMeetGrupal, terminarMeetGrupal, joinMeetGrupal } = cowork;
  const navigate = useNavigate();
  // `t` para lo que se dibuja. Los avisos que salen de efectos, de callbacks
  // memoizados y de la config de la llamada usan traducir(): meter `t` en esas
  // dependencias reconectaría el Hub o la sala al cambiar el idioma.
  const { t } = useLanguage();
  const { isOnline } = useOnlinePresence();
  const { mediaStates, supervisores, supervisoresDesde, trackEstadoSupervisor } = useCoworkMediaPresence(cowork.session?.id, userId);
  // La pausa del supervisor (break / almuerzo / ausente) se elige con la tacita
  // de la barra del Hub y se publica por presencia para que los chatters la
  // vean. Aparte de `mediaStates` a propósito: ver useCoworkMediaPresence.
  useEffect(() => {
    trackEstadoSupervisor(leerPausaSupervisor());
    return suscribirPausaSupervisor((e) => trackEstadoSupervisor(e));
  }, [trackEstadoSupervisor]);
  // Quién está CONECTADO a cada sala según LiveKit, reportado por el monitor de
  // esa sala. `null` = ese monitor no sabe. Es la verdad para las tarjetas: las
  // asignaciones quedan activas aunque la persona cierre la pestaña sin salir
  // (Jhon, 10/09: "aparece Julián si no está conectado").
  const [roomConectados, setRoomConectados] = useState<Record<string, string[] | null>>({});
  // Reloj de respaldo desde la base (lo que dejó el latido), para cuando la
  // presencia de Realtime no llega y la persona igual está trabajando (Jhon,
  // 10/09: "Camila aparece con puntico gris y sin contador").
  const relojRespaldo = useRelojDeSala(cowork.session?.id);
  // Las reglas de ESTA sesión (lib/coworkReglas): qué alertas existen y a qué
  // umbral se escala al supervisor. Sin `alert_rules` en la fila es el
  // estándar, o sea lo que Cowork hizo siempre. Va ARRIBA de todo lo que la
  // usa: es una const, y leerla desde un arreglo de dependencias antes de su
  // línea es la TDZ que ya tumbó esta pantalla dos veces.
  const reglas = useMemo(() => normalizarReglas(cowork.session?.alert_rules), [cowork.session?.alert_rules]);
  const [reglasOpen, setReglasOpen] = useState(false);
  const [pausasOpen, setPausasOpen] = useState(false);
  const [displayName, setDisplayName] = useState("Host");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [activeRoomLk, setActiveRoomLk] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoomName, setActiveRoomName] = useState<string | null>(null);
  // Meet grupal (Jhon, 10/09): si la "sala activa" es un meet, acá va su id. El
  // token sale de otro purpose y colgar TERMINA el meet para todos.
  const [activeMeetId, setActiveMeetId] = useState<string | null>(null);
  const [meetDialogOpen, setMeetDialogOpen] = useState(false);
  const {
    startCall, endCall, activeKey,
    abrirVentanaDelSistema, cerrarVentanaDelSistema,
    ventanaDelSistemaAbierta, ventanaDelSistemaSoportada,
  } = usePersistentCall();
  // "El Hub está conectado" NO es estado de esta página: la llamada vive en el
  // provider, que está por encima del router. Guardarlo acá significaba que al
  // volver de otra sección arrancaba en false y colgaba la llamada que seguía
  // viva. Se lee de la única fuente que sobrevive a navegar.
  const hubRoom = cowork.session?.host_hub_livekit_room ?? null;
  const hubKey = hubRoom ? `cowork-hub-${hubRoom}` : null;
  const hubConnected = !!hubKey && activeKey === hubKey;
  // Finalizar y repartir el enlace de host son del CREADOR de la sesión (o de
  // un admin). Los demás hosts supervisan, pero no apagan la sesión para todos
  // ni convierten en host a nadie: así se cortó la racha de cierres.
  const { isAdmin, role: miRol } = useUserRole();
  // Argos vigila a todos menos a los admins (y el dueño, que es admin): al
  // supervisor que trabaja desde este panel le pide cámara y pantalla, le toma
  // fotos y le cuenta el tiempo (Alvaro, 13/11/2026). Mientras el rol carga, no.
  const vigilarAnfitrion = miRol !== null && !isAdmin;
  const puedeFinalizar = !!cowork.session && (cowork.session.created_by === userId || isAdmin);
  // Avisar: cualquier anfitrión de la sesión le avisa a un CHATTER (Alvaro,
  // 17/11/2026); un admin además puede avisarle a otro anfitrión. Se inserta
  // una fila por persona; la RLS de cowork_avisos vuelve a validar cada una
  // (anfitrión de la sesión + la matriz). Al destinatario le llega por realtime.
  const puedeAvisar = puedeAvisarCowork(!!cowork.isHost);
  const puedeAvisarGeneral = puedeAvisar || isAdmin;
  const enviarAviso = useCallback(async (targetIds: string[], slug: string, roomId?: string) => {
    const sid = cowork.session?.id;
    if (!sid || targetIds.length === 0) return;
    const filas = targetIds.map((uid) => ({
      session_id: sid, user_id: uid, situacion: slug, ...(roomId ? { room_id: roomId } : {}),
    }));
    // (supabase as any): cowork_avisos no está en los tipos generados (ver el
    // mismo patrón en useCoworkSession con `sinTipar` y en las tablas wa_*).
    const { error } = await (supabase as unknown as {
      from: (t: string) => { insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }> };
    }).from("cowork_avisos").insert(filas);
    if (error) toast.error(traducir("cowork.avisar.failed"));
    else toast.success(traducir(targetIds.length > 1 ? "cowork.avisar.sentAll" : "cowork.avisar.sent"));
  }, [cowork.session?.id]);
  // A quién puede avisar ESTE usuario (host = supervisor, participant = chatter),
  // menos a sí mismo. El pop-up general lo usa para el selector; espeja la RLS.
  const objetivosAviso = useMemo<ObjetivoAviso[]>(() => {
    return cowork.memberships
      .filter((m) => m.user_id !== userId)
      .map((m) => ({
        uid: m.user_id,
        nombre: cowork.profiles[m.user_id] ? nombreYApellido(cowork.profiles[m.user_id]) : m.user_id.slice(0, 8),
        esSupervisor: m.role === "host",
      }))
      .filter((o) => (o.esSupervisor ? isAdmin : puedeAvisar));
  }, [cowork.memberships, cowork.profiles, userId, isAdmin, puedeAvisar]);
  // Recepción de avisos para ESTE supervisor: el dueño avisándole a un supervisor
  // no servía si el supervisor no lo oía. Mismo hook que CoworkParticipantView.
  const { aviso: avisoRecibido, cerrar: cerrarAvisoRecibido } = useRecepcionAvisos(userId);
  const [copiandoEnlace, setCopiandoEnlace] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hubMinimized, setHubMinimized] = useState(false);
  const [hubMaximized, setHubMaximized] = useState(false);
  // Silenciar el Hub SOLO para mí (pedido de Álvaro 01/09): metido en una sala
  // seguía escuchando a los managers del Hub sin ninguna forma de callarlos.
  // No mutea a nadie ni toca mi micro: es volumen local de reproducción
  // (setVolume(0) vía incomingAudioMuted en la llamada del Hub). Persistido:
  // quien lo silencia lo quiere así también mañana.
  const [hubSilenciado, setHubSilenciado] = useState(
    () => localStorage.getItem("maven.cowork.hub.silenciado") === "1",
  );
  const fijarHubSilencio = useCallback((n: boolean) => {
    setHubSilenciado(n);
    try { localStorage.setItem("maven.cowork.hub.silenciado", n ? "1" : "0"); } catch { /* noop */ }
  }, []);
  const toggleHubSilencio = useCallback(() => {
    setHubSilenciado((v) => {
      const n = !v;
      try { localStorage.setItem("maven.cowork.hub.silenciado", n ? "1" : "0"); } catch { /* noop */ }
      return n;
    });
  }, []);
  // Ventana del Hub: arrastrable (posición persistida) + pin "always on top".
  const [hubPos, setHubPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem("cowork.hub.pos");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [hubPinned, setHubPinned] = useState<boolean>(() => localStorage.getItem("cowork.hub.pinned") !== "0");
  const hubPanelRef = useRef<HTMLDivElement | null>(null);
  // Tamaño manual de la ventanita in-page (resize por la esquina). null = tamaño default.
  const [hubSize, setHubSize] = useState<{ w: number; h: number } | null>(() => {
    try { const raw = localStorage.getItem("cowork.hub.size"); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  // Ventana FLOTANTE del SO (Document PiP): always-on-top real + mover a otro monitor +
  // resize nativo. El botón pin la abre; si el navegador no la soporta, cae al pin z-index.

  const toggleHubPinned = () => {
    setHubPinned(p => {
      const next = !p;
      try { localStorage.setItem("cowork.hub.pinned", next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  };

  // Saca el Hub a una ventana del sistema, movible a otro monitor. La abre el
  // PROVIDER y no esta pagina: asi se muda la misma llamada en vez de montar
  // otra, que era lo que pasaba antes — sacarlo del navegador reconectaba.
  // Sin soporte del navegador queda el fallback de fijar al frente.
  const popOutHub = async () => {
    if (ventanaDelSistemaAbierta) { cerrarVentanaDelSistema(); return; }
    if (ventanaDelSistemaSoportada) {
      const ok = await abrirVentanaDelSistema({ width: hubSize?.w ?? 480, height: hubSize?.h ?? 420 });
      if (!ok) { toast.error(t("cowork.host.popOutError")); toggleHubPinned(); }
    } else {
      toast.info(t("cowork.host.popOutUnsupported"));
      toggleHubPinned();
    }
  };

  // Resize de la ventanita in-page desde la esquina inferior derecha.
  const startHubResize = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const panel = hubPanelRef.current;
    if (!panel) return;
    // Anclar a top-left (si estaba en la esquina por default) para que crezca natural.
    const rect = panel.getBoundingClientRect();
    if (!hubPos) setHubPos({ x: rect.left, y: rect.top });
    const startX = e.clientX, startY = e.clientY, startW = rect.width, startH = rect.height;
    const onMove = (ev: PointerEvent) => {
      const w = Math.min(Math.max(280, startW + (ev.clientX - startX)), window.innerWidth - 16);
      const h = Math.min(Math.max(220, startH + (ev.clientY - startY)), window.innerHeight - 16);
      setHubSize({ w, h });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setHubSize(s => { if (s) { try { localStorage.setItem("cowork.hub.size", JSON.stringify(s)); } catch { /* noop */ } } return s; });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Drag genérico desde la barra de título de una ventana flotante (Hub o Sala).
  // Clampeado al viewport; persiste la posición al soltar.
  const startWindowDrag = (
    e: React.PointerEvent,
    panelRef: React.MutableRefObject<HTMLDivElement | null>,
    setPos: (p: { x: number; y: number } | null) => void,
    storageKey: string,
  ) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    let last: { x: number; y: number } | null = null;
    const onMove = (ev: PointerEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      const x = Math.min(Math.max(8, ev.clientX - dx), window.innerWidth - panel.offsetWidth - 8);
      const y = Math.min(Math.max(8, ev.clientY - dy), window.innerHeight - panel.offsetHeight - 8);
      last = { x, y };
      setPos(last);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (last) { try { localStorage.setItem(storageKey, JSON.stringify(last)); } catch { /* noop */ } }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Estirar el Hub desde la esquina (Alvaro: "más grande, más cómodo"). Igual que
  // el arrastre pero cambia el tamaño; se guarda en cowork.hub.size y revive.
  const startWindowResize = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const rect = hubPanelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX, sy = e.clientY, sw = rect.width, sh = rect.height;
    let last: { w: number; h: number } | null = null;
    const onMove = (ev: PointerEvent) => {
      const w = Math.min(Math.max(360, sw + (ev.clientX - sx)), window.innerWidth - 16);
      const h = Math.min(Math.max(320, sh + (ev.clientY - sy)), window.innerHeight - 16);
      last = { w, h };
      setHubSize(last);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (last) { try { localStorage.setItem("cowork.hub.size", JSON.stringify(last)); } catch { /* noop */ } }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // La posición del Hub se guarda en localStorage. Si se arrastró en una pantalla
  // grande y después se abre en una más chica (o se achica la ventana), esas
  // coordenadas quedaban FUERA del viewport y la ventana "desaparecía". Re-clampea
  // al montar y en cada resize para que siempre quede visible.
  useEffect(() => {
    const clampIntoView = () => {
      setHubPos((prev) => {
        if (!prev) return prev;
        const panel = hubPanelRef.current;
        const w = panel?.offsetWidth ?? hubSize?.w ?? 480;
        const h = panel?.offsetHeight ?? hubSize?.h ?? 380;
        const maxX = Math.max(8, window.innerWidth - w - 8);
        const maxY = Math.max(8, window.innerHeight - h - 8);
        const x = Math.min(Math.max(8, prev.x), maxX);
        const y = Math.min(Math.max(8, prev.y), maxY);
        if (x === prev.x && y === prev.y) return prev;
        try { localStorage.setItem("cowork.hub.pos", JSON.stringify({ x, y })); } catch { /* noop */ }
        return { x, y };
      });
    };
    clampIntoView();
    window.addEventListener("resize", clampIntoView);
    return () => window.removeEventListener("resize", clampIntoView);
  }, [hubSize]);

  // 1:1 state
  const [oneOnOneRequestId, setOneOnOneRequestId] = useState<string | null>(null);
  const [oneOnOneRoom, setOneOnOneRoom] = useState<string | null>(null);
  const [oneOnOneName, setOneOnOneName] = useState<string | null>(null);
  const oneOnOneSeenInListRef = useRef(false);
  // La SALA activa se muestra a pantalla completa mientras estás en ella; salir
  // ("Volver al dashboard" o el rojo) la cuelga. La ÚNICA ventana miniatura es la
  // del Coordinador Hub (pedido del owner) — los videos de las salas ya se ven en
  // vivo en las cards del dashboard.
  // Gestión de salas (añadir / editar / cerrar)
  // Renombrar la sesión desde el header (antes el nombre quedaba fijo desde que
  // se creaba; una sesión que dura semanas se quedaba con el nombre del primer día).
  const [renameOpen, setRenameOpen] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [editRoom, setEditRoom] = useState<CoworkRoom | null>(null);
  const [editName, setEditName] = useState("");
  const [editVideo, setEditVideo] = useState(true);
  const [closeTarget, setCloseTarget] = useState<CoworkRoom | null>(null);
  const [roomBusy, setRoomBusy] = useState(false);
  // Central de audio del coordinador: master del micro + escuchar/hablar por sala + micro compartido.
  // Se recuerda por navegador: al recargar el tablero, las salas que uno
  // silenció siguen silenciadas (antes volvían todas a "Escuchando").
  const [roomHear, setRoomHearEstado] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("maven.cowork.salas.escucha") ?? "{}") as Record<string, boolean>; } catch { return {}; }
  });
  const setRoomHear = (upd: Record<string, boolean> | ((m: Record<string, boolean>) => Record<string, boolean>)) =>
    setRoomHearEstado((m) => {
      const n = typeof upd === "function" ? upd(m) : upd;
      try { localStorage.setItem("maven.cowork.salas.escucha", JSON.stringify(n)); } catch { /* noop */ }
      return n;
    });
  // Tic de un segundo: los contadores de pausa y las alertas de encuadre se
  // calculan contra este reloj, así avanzan solos sin depender de que llegue un
  // evento de presence.
  //
  // Va ARRIBA de todo lo que lo usa. Como const, leerlo antes de su línea lanza;
  // hoy solo se lee dentro de funciones que corren al renderizar —así que no
  // rompe— pero es el mismo patrón que tumbó esta pantalla dos veces, y basta
  // que alguien lo mueva a un arreglo de dependencias para que vuelva a pasar.
  // El reloj que mueve los contadores (pausas, tiempos) y re-evalúa los avisos.
  // 17/11/2026: tic de 5 s mientras se mira (antes 1 s) y 30 s con la pestaña
  // oculta. Con 1 s la página ENTERA (~3.200 líneas, la llamada, las tarjetas)
  // se redibujaba cada segundo y el hub se trababa. Los segunderos que sí tienen
  // que moverse cada segundo son componentes chiquitos (RelojVivo.tsx) con su
  // propio reloj compartido (lib/ahoraCompartido.ts). Oculta, un tablero en
  // segundo plano deja de redibujarse —y de re-evaluar alertas— cada segundo,
  // que es puro gasto cuando nadie lo está viendo. Al volver a la pestaña,
  // salta a `now` al instante y retoma el tic fino.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let id: number | undefined;
    const armar = () => {
      if (id != null) window.clearInterval(id);
      const ms = document.visibilityState === "visible" ? 5000 : 30_000;
      id = window.setInterval(() => setNow(Date.now()), ms);
    };
    const alCambiar = () => { if (document.visibilityState === "visible") setNow(Date.now()); armar(); };
    armar();
    // El primer tic va al segundo de abrir, como antes: los avisos que ya
    // corresponden (una pausa pasada, alguien sin cara) salen enseguida.
    const primero = window.setTimeout(() => setNow(Date.now()), 1000);
    document.addEventListener("visibilitychange", alCambiar);
    return () => { if (id != null) window.clearInterval(id); window.clearTimeout(primero); document.removeEventListener("visibilitychange", alCambiar); };
  }, []);

  // Límites por tipo de pausa. Si la sesión trae pausas propias en sus reglas,
  // mandan esas; si no, la tabla (no constantes). Si la tabla no carga, no se
  // pinta nada de rojo: mejor sin señal que marcando a alguien por un dato que
  // falta.
  const [limitesTabla, setLimitesTabla] = useState<Record<string, number>>({});
  useEffect(() => {
    void leerLimitesPausa(supabase).then(setLimitesTabla);
  }, []);
  // Se mira la FILA cruda y no `reglas`: normalizar rellena las pausas con el
  // estándar aunque la sesión nunca las haya tocado, y una sesión sin reglas
  // propias tiene que seguir leyendo la tabla exactamente como hasta hoy.
  // `alert_rules` llega como `unknown` (los tipos generados no la conocen);
  // el cast solo afirma "es un objeto que puede traer pausas", nada más.
  const traePausasPropias = !!(cowork.session?.alert_rules as { pausas?: unknown } | null | undefined)?.pausas;
  const limitesPausa = useMemo<Record<string, number>>(
    // El almuerzo no se configura por sesión: su tope sale siempre de la tabla,
    // así que aun con reglas propias se parte de la tabla y se pisan baño y break.
    () => (traePausasPropias ? { ...limitesTabla, bano: reglas.pausas.banoMin, break: reglas.pausas.breakMin } : limitesTabla),
    [traePausasPropias, reglas, limitesTabla],
  );
  // Lo que lleva HOY cada persona en pausa por tipo (baño/break/almuerzo), para
  // el resumen de la tarjeta. Lo cuenta el servidor (cowork_consumo_pausas_hoy);
  // se pide solo para quienes están en pausa ahora y se refresca cada 30 s.
  const [consumoHoy, setConsumoHoy] = useState<Record<string, Record<string, number>>>({});
  const pausadosKey = useMemo(
    () => Object.entries(mediaStates).filter(([, s]) => s?.onBreak).map(([uid]) => uid).sort().join(","),
    [mediaStates],
  );
  useEffect(() => {
    const ids = pausadosKey ? pausadosKey.split(",") : [];
    if (!ids.length) { setConsumoHoy({}); return; }
    let vivo = true;
    const cargar = async () => {
      const { data } = await rpcConsumoPausas(supabase, ids);
      if (!vivo || !data) return;
      const m: Record<string, Record<string, number>> = {};
      for (const f of data) { (m[f.user_id] ??= {})[f.kind] = (m[f.user_id]?.[f.kind] ?? 0) + f.segundos; }
      setConsumoHoy(m);
    };
    void cargar();
    const id = window.setInterval(() => { if (document.visibilityState === "visible") void cargar(); }, 30_000);
    return () => { vivo = false; window.clearInterval(id); };
  }, [pausadosKey]);
  // Segundos que lleva alguien en pausa, o null si no está en una.
  const pausaDe = (uid: string) => {
    const st = mediaStates[uid];
    if (!st?.onBreak || !st.breakStartedAt) return null;
    const segundos = Math.max(0, Math.floor((now - (st.breakStartedAt as number)) / 1000));
    const kind: "bano" | "break" | "almuerzo" = st.breakKind === "break" ? "break" : st.breakKind === "almuerzo" ? "almuerzo" : "bano";
    const limite = limitesPausa[kind];
    // La cuenta la hace lib/pausaCowork, el MISMO módulo que usa la pantalla
    // del empleado. Si cada lado la calculara por su cuenta, tarde o temprano
    // dirían cosas distintas sobre el mismo minuto — y ahí se acaba la
    // conversación sobre si alguien se pasó o no.
    // El baño es un presupuesto DIARIO: lo ya gastado hoy viaja por presence
    // para que el supervisor vea EXACTAMENTE el mismo número que la persona.
    // Si cada lado lo calculara aparte, discutirían sobre distintos minutos.
    const cuenta = cuentaPausa(segundos, limite, kind === "bano" ? (st.banoConsumidoSeg ?? 0) : 0);
    return {
      segundos, kind,
      excedida: cuenta.excedida,
      cuenta,
    };
  };
  // Si TODOS los que están en la sala marcaron pausa, la tarjeta entra en
  // "pausa": el video sigue apenas atenuado y el estado va en la línea de
  // abajo de la miniatura (diseño v5, Álvaro 26/10). Con una sola persona por
  // sala —el caso normal— es "esa persona está en pausa".
  /** Si la persona está en un meet grupal ahora: cuál y desde cuándo (epoch ms). */
  const meetDe = (uid: string): { meetId: string; desde: number } | null => {
    for (const m of cowork.meets) {
      const p = m.participantes.find((x) => x.user_id === uid && !x.left_at);
      if (p) return { meetId: m.id, desde: Date.parse(p.joined_at) };
    }
    return null;
  };
  const pausaDeLaSala = (uids: string[]): PausaDeSala | null => {
    if (!uids.length) return null;
    // Todos en el meet grupal → la miniatura dice "En meet grupal" con el tiempo
    // del que más lleva. No es pausa (el reloj suma), pero el video se apaga igual.
    const meets = uids.map((uid) => meetDe(uid));
    if (meets.every((m) => m)) {
      const desde = Math.min(...meets.map((m) => m!.desde));
      return { kind: "meet", segundos: Math.max(0, Math.floor((now - desde) / 1000)), desde, limiteMin: null, consumidoSeg: 0, excedida: false };
    }
    const pausas = uids.map((uid) => ({ uid, p: pausaDe(uid) }));
    if (pausas.some((x) => !x.p)) return null;
    // La más larga manda en el panel; con una persona es la única.
    const { uid, p } = pausas.reduce((a, b) => (b.p!.segundos > a.p!.segundos ? b : a));
    const st = mediaStates[uid];
    return {
      kind: p!.kind, segundos: p!.segundos, desde: (st?.breakStartedAt as number | null) ?? null,
      limiteMin: limitesPausa[p!.kind] ?? null,
      consumidoSeg: p!.kind === "bano" ? (st?.banoConsumidoSeg ?? 0) : 0,
      excedida: p!.excedida,
      resumenHoy: consumoHoy[uid],
      limites: limitesPausa,
    };
  };
  // Cada dos minutos se apagan las asignaciones de quien lleva más de tres sin
  // latir: cerró la pestaña sin salir y su nombre se quedaba en la tarjeta para
  // siempre. Lo hace el servidor con el latido como prueba; acá solo se dispara.
  useEffect(() => {
    if (!cowork.session?.id) return;
    const barrer = () => { void cowork.barrerAsignacionesColgadas?.().catch(() => { /* la próxima */ }); };
    const primero = window.setTimeout(barrer, 20_000);
    const id = window.setInterval(barrer, 2 * 60_000);
    return () => { window.clearTimeout(primero); window.clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cowork.session?.id]);

  // Barra lateral plegada, como el menu de Maven. Se recuerda porque es una
  // preferencia de espacio en pantalla, no un estado de la operacion.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("maven.cowork.sidebar.collapsed") === "1",
  );
  const [roomMic, setRoomMic] = useState<Record<string, boolean>>({});
  const [micBaseTrack, setMicBaseTrack] = useState<MediaStreamTrack | null>(null);
  // Se escucha una sala si el master global esta activo Y esa sala no fue
  // silenciada aparte. Apagar el global no borra las elecciones por sala: al
  // volver a prenderlo, cada una queda como estaba.
  // El estado de cada sala es la VERDAD; el botón global no es un candado que
  // bloquee las miniaturas, es una acción que las fija todas de un golpe.
  //
  // Antes el global mandaba (`globalHear && ...`), así que con todo silenciado
  // destildar una sala no hacía nada: había que volver a "escuchar todas" para
  // recuperar el control, y eso obligaba a oír las nueve para poder oír una.
  const hearFor = (roomId: string) => roomHear[roomId] ?? true;

  // Estado del botón global. "Todas encendidas" solo cuando de verdad lo están:
  // si hay una sola apagada, el botón ofrece encender el resto en vez de
  // apagarlas — que es lo que se quiere cuando se viene de silenciar todo y se
  // fue rescatando salas de a una.
  const todasEscuchando = cowork.rooms.every((r) => hearFor(r.id));
  const fijarEscuchaDeTodas = (encendido: boolean) =>
    setRoomHear(Object.fromEntries(cowork.rooms.map((r) => [r.id, encendido])));
  // El 🎤 de cada sala le habla SOLO a esa; "Hablar a todas" enciende todos de
  // una. Mismo modelo que la escucha, y por el mismo motivo: antes el global
  // DESHABILITABA los botones por sala, así que para hablarle a una había que
  // apagar el global primero. Todo vive en el navegador de cada coordinador:
  // que Álvaro se silencie no deja sorda a Yoselin.
  const broadcastFor = (roomId: string) => roomMic[roomId] ?? false;
  const hablandoATodas = cowork.rooms.length > 0 && cowork.rooms.every((r) => broadcastFor(r.id));
  const fijarMicDeTodas = (encendido: boolean) =>
    setRoomMic(Object.fromEntries(cowork.rooms.map((r) => [r.id, encendido])));
  // El micro se captura si le hablas a alguien: a todas, o al menos a una sala.
  const micArmed = Object.values(roomMic).some(Boolean);

  // Cámara y pantalla broadcasteadas: MISMO modelo que la escucha y el micro
  // (el botón global fija todas de un golpe; el de cada miniatura manda).
  // Una sola captura de cada cosa; cada sala activada publica un clon.
  const [roomCam, setRoomCam] = useState<Record<string, boolean>>({});
  const [roomScreen, setRoomScreen] = useState<Record<string, boolean>>({});
  const [camBaseTrack, setCamBaseTrack] = useState<MediaStreamTrack | null>(null);
  const [screenBaseTrack, setScreenBaseTrack] = useState<MediaStreamTrack | null>(null);
  const camFor = (roomId: string) => roomCam[roomId] ?? false;
  const screenFor = (roomId: string) => roomScreen[roomId] ?? false;
  const camaraATodas = cowork.rooms.length > 0 && cowork.rooms.every((r) => camFor(r.id));
  const pantallaATodas = cowork.rooms.length > 0 && cowork.rooms.every((r) => screenFor(r.id));
  const fijarCamDeTodas = (encendido: boolean) =>
    setRoomCam(Object.fromEntries(cowork.rooms.map((r) => [r.id, encendido])));
  const fijarScreenDeTodas = (encendido: boolean) =>
    setRoomScreen(Object.fromEntries(cowork.rooms.map((r) => [r.id, encendido])));
  const camArmed = Object.values(roomCam).some(Boolean);
  const screenArmed = Object.values(roomScreen).some(Boolean);

  // UNA SOLA PANTALLA (Alvaro, 16/11/2026): «Luis, Vanessa, Breyner y Daniel,
  // cuando estén en un cowork, que te haga compartir la pantalla solo en el que
  // estás hablando o con la persona que estás hablando; solo una compartida de
  // pantalla, no varias.» Para el anfitrión que no es admin ni dueño:
  //   · no se pide otra pantalla: se usa la que ya comparte en el Hub (la de
  //     Argos) y se reenvía un clon;
  //   · ese clon va a UNA sala: la sala en la que entró, o si no, la última a la
  //     que le dio «Hablar». Si no le habla a nadie, no va a ninguna;
  //   · no hay «Pantalla a todas».
  const unaSolaPantalla = vigilarAnfitrion;
  const [pantallaHub, setPantallaHub] = useState<MediaStreamTrack | null>(() => pantallaDelHub());
  useEffect(() => suscribirPantallaDelHub(setPantallaHub), []);
  const baseDePantalla = unaSolaPantalla ? pantallaHub : screenBaseTrack;

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).single();
        setDisplayName(profile?.full_name || "Host");
      }
      setProfileLoaded(true);
    });
  }, []);


  // Central de audio: captura del micro compartido para broadcastear a varias salas. Se toma
  // cuando le hablas a AL MENOS una sala (a todas con el botón global, o a una con su 🎤) y cada
  // sala publica un clon (CoworkRoomMonitor). El Coordinador Hub queda INDEPENDIENTE (su mic está
  // apagado por defecto, así que no hay conflicto de captura ni doble publicación de tu voz).
  // ── EL MICRÓFONO SE PUEDE MORIR SOLO, Y NADIE LO MIRABA ─────────────────
  //
  // El micro se tomaba UNA vez y se volvía a tomar únicamente cuando `micArmed`
  // cambiaba, o sea al pasar de "ninguna sala" a "alguna" o al revés. Pero un
  // MediaStreamTrack se muere por su cuenta y sin avisar: te quitas los
  // auriculares, cambia el dispositivo por defecto, u otro programa (Zoom,
  // Discord, Meet) se queda con el micro.
  //
  // Cuando eso pasaba, las copias publicadas en las salas se quedaban MUDAS, el
  // botón seguía verde, y el supervisor hablaba sin que lo oyera nadie. Y no se
  // recuperaba solo: seguía así el resto del turno, salvo que por casualidad
  // apagara el micro de TODAS las salas y lo volviera a encender — que es
  // exactamente lo que hace quien va a "probar otra vez", y por eso el fallo
  // parecía arreglarse solo y no había forma de reproducirlo.
  //
  // Se vigila por tres vías porque ninguna sola alcanza:
  //   · `ended`  — el track murió (dispositivo desconectado).
  //   · `mute`   — el track vive pero la FUENTE no entrega audio (otro programa
  //                se quedó con el micro). No hace falta re-tomarlo: puede
  //                volver solo, y ahí llega `unmute`.
  //   · un tic de respaldo, porque hay navegadores donde `ended` no llega.
  const [generacionMic, setGeneracionMic] = useState(0);
  /** Qué le pasa al micro AHORA, para poder decirlo en pantalla en vez de
   *  dejar el botón en verde mintiendo. */
  const [micCaido, setMicCaido] = useState<null | "muerto" | "silenciado">(null);
  const recapturasMic = useRef(0);
  /** Tope de re-tomas seguidas. Sin él, un micro que muere al instante hace un
   *  bucle de getUserMedia. No cuenta la re-toma de un micro que venía
   *  funcionando bien: esa es un cambio de dispositivo normal, no un bucle. */
  const MAX_RECAPTURAS_MIC = 5;
  const VIGILANCIA_MIC_MS = 5_000;
  const SOBREVIVIO_MS = 60_000;

  useEffect(() => {
    if (!micArmed) { recapturasMic.current = 0; setMicCaido(null); return; }
    let cancelled = false;
    let track: MediaStreamTrack | null = null;
    let vigilante: number | null = null;
    let renaciendo = false;
    let vivoDesde = 0;
    /** La cadena de cancelación de ruido sobre el micro, si el supervisor la
     *  tiene activada en las llamadas (misma preferencia, mismo motor). */
    let cadenaNC: CadenaNC | null = null;

    const renacer = (motivo: "muerto" | "silenciado") => {
      if (cancelled) return;
      setMicCaido(motivo);
      // Silenciado no es muerto: la fuente puede volver sola y llega `unmute`.
      // Re-tomar acá sería pelearle el micro a otro programa.
      if (motivo !== "muerto" || renaciendo) return;
      renaciendo = true;
      if (vivoDesde && Date.now() - vivoDesde > SOBREVIVIO_MS) recapturasMic.current = 0;
      if (recapturasMic.current >= MAX_RECAPTURAS_MIC) {
        toast.error(traducir("cowork.host.micKeepsDropping"), {
          description: traducir("cowork.host.micKeepsDroppingDesc"),
          duration: 12_000, id: "micro-supervisor",
        });
        return;
      }
      recapturasMic.current += 1;
      toast.warning(traducir("cowork.host.micDropped"), {
        description: traducir("cowork.host.micDroppedDesc"),
        duration: 6_000, id: "micro-supervisor",
      });
      setGeneracionMic((n) => n + 1);
    };

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // Un canal: RNNoise cuesta CPU por canal y la voz es mono.
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        });
        track = stream.getAudioTracks()[0] || null;
        if (cancelled || !track) { track?.stop(); return; }
        // Lo que se reparte a las salas es la pista LIMPIA, si el supervisor
        // tiene la cancelación de ruido activada en sus llamadas. Antes su voz
        // salía cruda a nueve salas mientras la de los chatters iba filtrada.
        // Si la cadena falla, sale la cruda: nunca sin voz.
        let pistaParaRepartir: MediaStreamTrack = track;
        if (loadNCPreference()) {
          try {
            cadenaNC = await armarCadenaNC(track);
            if (cancelled) { void cadenaNC.destruir(); cadenaNC = null; track.stop(); return; }
            pistaParaRepartir = cadenaNC.salida;
          } catch (e) {
            console.warn("[cowork] la cancelación de ruido del micro del supervisor no se pudo armar:", e);
          }
        }
        setMicBaseTrack(pistaParaRepartir);
        setMicCaido(null);
        vivoDesde = Date.now();
        track.addEventListener("ended", () => renacer("muerto"));
        track.addEventListener("mute", () => renacer("silenciado"));
        track.addEventListener("unmute", () => { if (!cancelled) setMicCaido(null); });
        // Respaldo: hay navegadores donde `ended` no llega nunca. Mirar una
        // propiedad cada cinco segundos no cuesta nada y es lo único que
        // convierte un fallo mudo en uno que se nota.
        vigilante = window.setInterval(() => {
          if (track && track.readyState === "ended") renacer("muerto");
        }, VIGILANCIA_MIC_MS);
      } catch {
        // Sin micro no puedes hablarle a nadie → desarmamos todo.
        // `setRoomMic({})` YA apaga todo: sin entrada, cada sala vuelve a su
        // default (no hablar). Acá había además un `setGlobalMic(false)` que
        // quedó huérfano cuando el botón global pasó a ser una acción sobre
        // las salas — o sea que si a alguien le fallaba el micrófono, en vez
        // del aviso se llevaba una pantalla negra.
        if (!cancelled) { toast.error(traducir("cowork.host.micAccessError")); setRoomMic({}); }
      }
    })();
    return () => {
      cancelled = true;
      if (vigilante !== null) window.clearInterval(vigilante);
      setMicBaseTrack(null);
      if (cadenaNC) { void cadenaNC.destruir(); cadenaNC = null; }
      try { track?.stop(); } catch { /* noop */ }
    };
  }, [micArmed, generacionMic]);

  // ── EL FONDO DE LA CÁMARA DEL ANFITRIÓN (18/11/2026) ─────────────────────
  //
  // Alvaro no podía difuminar el fondo en Cowork: la cámara que se reparte a las
  // salas salía CRUDA (no pasaba por ningún procesador) y no había botón. Ahora
  // pasa por el MISMO procesador de las llamadas (lib/camaraDelAnfitrion.ts) con
  // la MISMA preferencia (leerFondoGuardado): si eligió difuminar en una llamada,
  // Cowork lo respeta, y lo que elija aquí vale para sus llamadas.
  const [fondo, setFondo] = useState<BackgroundEffect>(() => leerFondoGuardado());
  const fondoRef = useRef(fondo);
  fondoRef.current = fondo;
  // El último nivel de difuminado elegido, para que el botón lo devuelva igual
  // (mismo criterio que el botón rápido de la llamada).
  const ultimoBlurRef = useRef<BackgroundEffect>("blur");
  if (esBlur(fondo)) ultimoBlurRef.current = fondo;
  const [preparandoFondo, setPreparandoFondo] = useState(false);
  const camaraRef = useRef<CamaraDelAnfitrion | null>(null);
  // Saberlo crea un canvas con WebGL2: una sola vez.
  const puedeDifuminar = useMemo(() => soportaProcesadorDeFondo(), []);

  // El detector baja ~9,4 MB la primera vez: se baja de antemano a quien ya
  // tiene un fondo elegido o está en la app de computador (como en la llamada).
  useEffect(() => {
    if (!puedeDifuminar) return;
    if (leerFondoGuardado() === "none" && !escritorio()) return;
    const id = window.setTimeout(() => { void precalentarFondo(); }, 3000);
    return () => window.clearTimeout(id);
  }, [puedeDifuminar]);

  /** Pone el fondo en la cámara que se reparte y actualiza lo que ven las salas. */
  const ponerFondoEnCamara = useCallback(async (camara: CamaraDelAnfitrion, efecto: BackgroundEffect) => {
    setPreparandoFondo(efecto !== "none");
    const r: ResultadoDelFondo = await camara.aplicar(efecto);
    // Se apagó la cámara o llegó otro pedido: lo resuelve el que sigue.
    if (camaraRef.current !== camara || r === "apagada" || r === "reemplazado") return;
    setPreparandoFondo(false);
    // La procesada si enganchó; la cruda si no. Nunca sin cámara por el fondo.
    // Si es la misma pista de antes (cambio en vivo), las salas no re-publican.
    setCamBaseTrack(camara.salida());
    if (r === "puesto" || r === "sin-fondo") return;
    // El botón muestra lo que de verdad sale: sin fondo. La preferencia guardada
    // solo se borra si la imagen ya no existe (igual que en la llamada).
    fondoRef.current = "none";
    setFondo("none");
    if (r === "imagen-perdida") {
      guardarFondo("none");
      toast.error(traducir("shared.call.bgGone"), { description: traducir("shared.call.bgGoneDesc"), id: "fondo-cowork" });
    } else if (r === "no-soportado") {
      toast.error(traducir("cowork.host.blurUnsupported"), { id: "fondo-cowork" });
    } else {
      toast.error(traducir("cowork.host.blurFailed"), { description: traducir("cowork.host.blurFailedDesc"), id: "fondo-cowork" });
    }
  }, []);

  /** El botón «Difuminar fondo»: alterna y lo guarda; con la cámara al aire, en vivo. */
  const alternarDifuminado = useCallback(() => {
    const nuevo = alternarBlur(fondoRef.current, ultimoBlurRef.current);
    fondoRef.current = nuevo;
    setFondo(nuevo);
    // Se guarda SIEMPRE: con la cámara apagada, se pone al encenderla.
    guardarFondo(nuevo);
    const camara = camaraRef.current;
    if (camara) void ponerFondoEnCamara(camara, nuevo);
  }, [ponerFondoEnCamara]);

  // Captura ÚNICA de la cámara para broadcastear (calidad capada a ~540p/15fps
  // a propósito: publicar video es un encoder POR SALA — con nueve salas, la
  // máquina y la subida del coordinador tienen que sobrevivir). Si el track
  // muere (otro programa tomó la cámara, se desconectó), se desarma todo y se
  // avisa — un botón verde sin cámara detrás es el bug del micro otra vez.
  useEffect(() => {
    if (!camArmed) return;
    let cancelled = false;
    let track: MediaStreamTrack | null = null;
    let camara: CamaraDelAnfitrion | null = null;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 15, max: 15 } },
        });
        track = stream.getVideoTracks()[0] || null;
        if (cancelled || !track) { track?.stop(); return; }
        track.addEventListener("ended", () => {
          if (cancelled) return;
          toast.error(traducir("cowork.host.camDropped"), { description: traducir("cowork.host.camDroppedDesc"), id: "cam-broadcast" });
          setRoomCam({});
        });
      } catch {
        if (!cancelled) { toast.error(traducir("cowork.host.camAccessError")); setRoomCam({}); }
        return;
      }
      // La cámara cruda pasa por el procesador de fondo de las llamadas.
      const cam = crearCamaraDelAnfitrion(track, {
        alPrimeraCarga: () => toast.info(traducir("shared.call.bgPreparando"), { id: "fondo-preparando", duration: 8000 }),
        // El procesador se cayó con la cámara al aire: vuelve la cruda y se avisa.
        alCaerse: () => {
          if (cancelled) return;
          setCamBaseTrack(cam.salida());
          fondoRef.current = "none";
          setFondo("none");
          toast.error(traducir("cowork.host.blurDropped"), { description: traducir("cowork.host.blurFailedDesc"), id: "fondo-cowork" });
        },
      });
      camara = cam;
      camaraRef.current = cam;
      // El fondo elegido se pone ANTES de repartir la cámara: las salas no ven el
      // cuarto ni un instante. Si no se puede, sale la cruda (ponerFondoEnCamara).
      const efecto = leerFondoGuardado();
      fondoRef.current = efecto;
      setFondo(efecto);
      if (efecto === "none") setCamBaseTrack(cam.salida());
      else await ponerFondoEnCamara(cam, efecto);
    })();
    return () => {
      cancelled = true;
      if (camaraRef.current === camara) camaraRef.current = null;
      setCamBaseTrack(null);
      setPreparandoFondo(false);
      // Limpia el procesador, la pista procesada y la cámara cruda.
      if (camara) void camara.destruir();
      else { try { track?.stop(); } catch { /* noop */ } }
    };
  }, [camArmed, ponerFondoEnCamara]);

  // Captura ÚNICA de la pantalla (el picker del navegador se abre UNA vez; esa
  // misma pantalla va a todas las salas activadas). "Dejar de compartir" desde
  // el navegador dispara `ended` → se desarma todo, sin botones mintiendo.
  useEffect(() => {
    // El supervisor no captura aparte: su pantalla es la del Hub (ver arriba).
    if (!screenArmed || unaSolaPantalla) return;
    let cancelled = false;
    let track: MediaStreamTrack | null = null;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { max: 1280 }, height: { max: 720 }, frameRate: { ideal: 15, max: 15 } },
          audio: false,
        });
        track = stream.getVideoTracks()[0] || null;
        if (cancelled || !track) { track?.stop(); return; }
        track.addEventListener("ended", () => {
          if (cancelled) return;
          setRoomScreen({});
        });
        setScreenBaseTrack(track);
      } catch {
        // Canceló el picker o el navegador lo negó: desarmar sin drama.
        if (!cancelled) setRoomScreen({});
      }
    })();
    return () => {
      cancelled = true;
      setScreenBaseTrack(null);
      try { track?.stop(); } catch { /* noop */ }
    };
  }, [screenArmed, unaSolaPantalla]);

  const enterRoom = useCallback((roomId: string) => {
    const room = cowork.rooms.find(r => r.id === roomId);
    if (!room) return;
    // El Hub NO se desconecta al entrar a una sala (pedido 2026-07-20: navegar entre
    // meets sin colgar — la pantalla compartida del Hub sigue viva en la ventanita).
    // El viejo "liberar el micrófono" ya no aplica: cada call view captura su propio
    // track solo al activarlo, y la central de audio ya publica clones a varias salas.
    setHubMaximized(false);
    // Ya estoy en esta sala → nada que hacer.
    if (activeRoomId === roomId) return;
    // Si venía de un meet grupal, irme a una sala es dejarlo: se cierra para todos.
    if (activeMeetId) { void terminarMeetGrupal(activeMeetId, "supervisor_salio").catch(() => { /* ya cerrado */ }); setActiveMeetId(null); }
    const switching = !!activeRoomId;
    setActiveRoomLk(room.livekit_room_name);
    setActiveRoomId(roomId);
    setActiveRoomName(room.name);
    // Cambiar de sala = moverse: la anterior se cuelga (no se puede estar en dos salas).
    if (switching) toast.info(traducir("cowork.host.movedTo", { room: room.name }));
  }, [cowork.rooms, activeRoomId, activeMeetId, terminarMeetGrupal]);

  // LA PANTALLA DEL SUPERVISOR ES PARA SU TRABAJO (Alvaro, 17/11/2026): «lo
  // importante es que el supervisor siga compartiendo la pantalla para su
  // trabajo, no para la persona con la que está hablando». Ya NO se manda sola
  // a la sala a la que le da «Hablar» ni a la que entra: sigue compartida en el
  // Hub (Argos la ve). Si él quiere mostrarle algo a una sala, toca el botón de
  // pantalla de esa sala (una sala a la vez) o comparte desde adentro.

  // ── Meet grupal ──────────────────────────────────────────────────────────
  // El supervisor entra al meet como a una sala más (misma vista a pantalla
  // completa), pero el token es otro y colgar TERMINA el meet para todos.
  const entrarAlMeet = useCallback((meet: Pick<CoworkMeet, "id" | "livekit_room_name">) => {
    setHubMaximized(false);
    setActiveMeetId(meet.id);
    setActiveRoomLk(meet.livekit_room_name);
    setActiveRoomId(`meet:${meet.id}`);
    // En español a propósito: es también el título de la GRABACIÓN (se guarda).
    // Lo que se ve en pantalla sale de `nombreSalaActiva`, traducido.
    setActiveRoomName("Meet grupal");
  }, []);
  const crearMeet = useCallback(async (roomIds: string[]) => {
    try {
      const r = await crearMeetGrupal(roomIds);
      toast.success(r.participantes === 1
        ? traducir("cowork.host.meetCreatedOne")
        : traducir("cowork.host.meetCreatedMany", { n: r.participantes }));
      setMeetDialogOpen(false);
      entrarAlMeet(r.meet);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : traducir("cowork.host.meetCreateError"));
    }
  }, [crearMeetGrupal, entrarAlMeet]);

  const getHubToken = useCallback(async () => {
    const result = await cowork.issueLiveKitToken("join_host_hub");
    return { token: result.token, url: result.url };
  }, [cowork.issueLiveKitToken]);

  // El Hub vive en el PersistentCallProvider, por encima del router.
  //
  // Mientras el coordinador está en Cowork se dibuja dentro de su ventanita de
  // siempre —arrastrable, redimensionable, anclable— y si navega a otra sección
  // pasa sola a la flotante del provider en vez de cortarse.
  //
  // De paso arregla algo que ya estaba mal: antes había DOS LiveKitCallView del
  // Hub (uno para la ventana del sistema, otro para el panel), así que sacarlo
  // del navegador desmontaba uno y montaba el otro — o sea, reconectaba la
  // llamada. Ahora es el mismo componente movido por portal.
  // Lo que el supervisor tiene prendido en el Hub y en la sala donde está
  // (lib/latidoDelSupervisor): el latido cuenta cualquiera de las dos.
  const medioHubRef = useRef<MedioDeLlamada | null>(null);
  const medioSalaRef = useRef<MedioDeLlamada | null>(null);
  const empujarMedios = useCallback(() => {
    actualizarLatido(juntarMedios(medioHubRef.current, medioSalaRef.current));
  }, []);
  const enUnaSalaRef = useRef(false);
  enUnaSalaRef.current = !!activeRoomLk;

  const colgarHub = useCallback(() => {
    setHubMaximized(false);
    endCall();
    medioHubRef.current = null;
    // Si sigue trabajando DENTRO de una sala, sigue en Cowork: el latido sigue
    // con lo que tiene prendido ahí (Luis, 17/11/2026: se le cayó el Hub
    // estando en la Sala 1 con cámara y pantalla, y Argos lo reportó «fuera»).
    if (enUnaSalaRef.current) {
      empujarMedios();
      return;
    }
    // Colgó el Hub y no está en ninguna sala: deja de trabajar, se cierra su reloj.
    detenerLatido();
    void cowork.leaveRoom?.();
  }, [endCall, cowork.leaveRoom, empujarMedios]);

  // Refs del navegador de SESIONES. DECLARADOS acá arriba (antes de
  // conectarHub, que los usa) pero SINCRONIZADOS más abajo, donde viven la
  // lista y la acción de cambio.
  const sesionesNavegablesRef = useRef<Array<{ id: string; name: string }>>([]);
  const cambiarDeSesionRef = useRef<(id: string) => void>(() => {});

  const conectarHub = useCallback(() => {
    if (!hubRoom || !hubKey) return;
    startCall({
      key: hubKey,
      roomName: hubRoom,
      displayName,
      callDisplayName: "Supervisor Hub",
      isAdmin: true,
      hideEndForAll: true,
      onLeave: colgarHub,
      hideShareLink: true,
      hideLeaveButton: true,
      suppressLeaveToast: true,
      initialMicOn: false,
      initialCamOn: false,
      getToken: getHubToken,
      // ARGOS TAMBIÉN AL SUPERVISOR (Alvaro, 13/11/2026): en el panel trabaja con
      // cámara y pantalla como todos; Argos le toma fotos y su tiempo cuenta.
      // Los callbacks van a funciones de módulo: siguen vivos con el Hub flotando
      // en otra sección.
      supervisorEncuadre: vigilarAnfitrion,
      // Su pantalla del Hub es la única: el tablero la reenvía a la sala donde habla.
      onLocalScreenTrack: fijarPantallaDelHub,
      // …y en el Hub no la ve nadie: solo la sala a la que le habla.
      pantallaSoloParaMi: vigilarAnfitrion,
      onFaceStateChange: (w) => actualizarLatido({ faceState: w.state, faceSince: w.since }),
      onMediaStateChange: (m) => {
        medioHubRef.current = { camOn: m.camOn, screenShareOn: m.screenShareOn, conexionSala: m.conexionSala ?? null };
        empujarMedios();
      },
      incomingAudioMuted: hubSilenciado,
      // La tacita: break / almuerzo / ausente. Es un elemento fijo que lee su
      // estado del store, así que no queda viejo aunque esta config se arme
      // una sola vez.
      controlesExtra: <PausaSupervisorBoton />,
      // La ventanita flotante del provider también tiene el 🔇: cuando lo
      // togglean allá, acá se sincroniza el estado y la persistencia.
      onIncomingAudioMutedChange: fijarHubSilencio,
      // Navegador de SESIONES del Hub (HR, COORDINADORES, CHATTERS KASH…).
      // Todo por REF: los valores se calculan más abajo y se leen al momento de
      // usar la config — meterlos como deps de este useCallback sería la TDZ
      // que ya tumbó la página una vez. Cambiar de sesión NAVEGA, así que
      // funciona igual con el Hub flotando en otra sección.
      roomSwitcher: {
        rooms: sesionesNavegablesRef.current,
        currentId: cowork.session?.id ?? "",
        onSwitch: (id: string) => cambiarDeSesionRef.current(id),
      },
    });
  }, [hubRoom, hubKey, displayName, colgarHub, getHubToken, startCall, hubSilenciado, fijarHubSilencio, cowork.session?.id, vigilarAnfitrion, empujarMedios]);

  // EL RELOJ DEL SUPERVISOR (Alvaro, 13/11/2026): con el Hub conectado late como
  // cualquiera en su sala, y su tiempo en el panel cuenta como trabajo. No se
  // apaga al desmontar (el Hub sigue en la ventanita flotante); solo al colgar.
  // También late si está DENTRO de una sala aunque el Hub se haya caído (Luis,
  // 17/11/2026). Arranca con lo que ya tiene prendido, no con todo apagado.
  const sesionDelHub = cowork.session?.id ?? null;
  const enUnaSala = !!activeRoomLk;
  useEffect(() => {
    if (!sesionDelHub || !(hubConnected || enUnaSala) || !vigilarAnfitrion) return;
    iniciarLatido(sesionDelHub, {
      ...juntarMedios(medioHubRef.current, medioSalaRef.current),
      faceState: null, faceSince: null,
      onBreak: esEstadoSupervisor(leerPausaSupervisor()),
    });
  }, [sesionDelHub, hubConnected, enUnaSala, vigilarAnfitrion]);
  // La tacita (break / almuerzo / ausente) es su pausa: el reloj marca pausa y
  // Argos no le reclama mientras tanto.
  useEffect(() => {
    if (!vigilarAnfitrion) return;
    const aplicar = (e: unknown) => {
      const enPausa = esEstadoSupervisor(e);
      actualizarLatido({ onBreak: enPausa });
      marcarPausa(enPausa);
    };
    aplicar(leerPausaSupervisor());
    return suscribirPausaSupervisor(aplicar);
  }, [vigilarAnfitrion]);

  // Entrar al Hub al abrir la sesión. UNA sola vez: sin el candado, colgar el
  // Hub lo volvería a conectar en el mismo instante.
  //
  // Si ya venía sonando de otra sección se ADOPTA la llamada viva en vez de
  // arrancar una nueva: reconectar corta el audio de las salas unos segundos.
  const yaEntroAlHub = useRef(false);
  useEffect(() => {
    if (!profileLoaded || !hubRoom || yaEntroAlHub.current) return;
    yaEntroAlHub.current = true;
    // Si el Hub ya venía sonando, conectarHub() con el MISMO key solo re-empuja
    // la config (sin reconectar): así los closures (flechas de salas, 🔇)
    // apuntan siempre a ESTA instancia del dashboard y no a una desmontada.
    conectarHub();
  }, [profileLoaded, hubRoom, hubKey, activeKey, conectarHub]);

  // Re-empujar la config al provider cuando cambia el silencio: mismo key →
  // el provider actualiza props del MISMO LiveKitCallView, sin reconectar la
  // llamada (setConfig re-renderiza, no remonta).
  useEffect(() => {
    if (yaEntroAlHub.current && activeKey === hubKey) conectarHub();
    // Solo cuando cambia el silencio o se sabe si se le vigila (el rol llega
    // después); conectarHub cambia de identidad justo por eso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubSilenciado, vigilarAnfitrion]);

  const getActiveRoomToken = useCallback(async () => {
    const result = activeMeetId
      ? await joinMeetGrupal(activeMeetId)
      : await cowork.issueLiveKitToken("join_room", activeRoomId!);
    return { token: result.token, url: result.url };
  }, [cowork.issueLiveKitToken, joinMeetGrupal, activeRoomId, activeMeetId]);

  // Salir de la sala (Volver al dashboard o el botón rojo) = colgar ESA sala.
  const leaveActiveRoom = useCallback(() => {
    // Colgar el meet grupal lo termina para todos: la gente vuelve a su sala.
    if (activeMeetId) {
      void terminarMeetGrupal(activeMeetId, "supervisor_salio").catch(() => { /* ya cerrado */ });
      setActiveMeetId(null);
      toast.info(traducir("cowork.host.meetEnded"));
    }
    setActiveRoomLk(null);
    setActiveRoomId(null);
    setActiveRoomName(null);
    // Lo de la sala ya no cuenta para el latido. Si el Hub tampoco está, salió
    // de todo: se cierra su reloj.
    medioSalaRef.current = null;
    if (hubConnected) empujarMedios();
    else detenerLatido();
    // El Hub es independiente: si sigue conectado no hay nada que hacer; si el
    // coordinador lo colgó a mano, solo lo re-abrimos si él toca "Reconectar".
  }, [activeMeetId, terminarMeetGrupal, hubConnected, empujarMedios]);

  // ── Navegador de salas (flechas + lista dentro de la llamada) ─────────────
  //
  // Moverse = la semántica de siempre de "Entrar": la sala anterior se CUELGA
  // (no se puede estar en dos) y a la nueva llegás con el micro APAGADO
  // (initialMicOn=false del flujo de sala) — sin presencias fantasma ni voz
  // colándose donde ya no estás mirando. "hub" te devuelve al Hub (cuelga la
  // sala y quedás solo en el Hub, que nunca se corta).
  // Las SESIONES entre las que se puede saltar: las propias (host o
  // participante) + para admins TODAS las activas de la empresa (la lista
  // admin devuelve [] para no-admins — la guarda vive en el RPC). Se resuelve
  // una vez al montar: las sesiones no aparecen/desaparecen a cada rato.
  const [sesionesNavegables, setSesionesNavegables] = useState<Array<{ id: string; name: string; miRol: string | null }>>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [mias, todas] = await Promise.all([
          cowork.listMyActiveSessions().catch(() => []),
          cowork.adminListSessions().catch(() => []),
        ]);
        const map = new Map<string, { id: string; name: string; miRol: string | null }>();
        for (const s of mias) map.set(s.id, { id: s.id, name: s.name, miRol: s.role });
        for (const s of todas) if (!map.has(s.id)) map.set(s.id, { id: s.id, name: s.name, miRol: s.my_role });
        if (alive) setSesionesNavegables([...map.values()]);
      } catch { /* sin lista no hay flechas, y ya */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambiar de SESIÓN: si no soy miembro (admin espiando la lista global),
  // primero me uno como host (el edge deja a los admin entrar sin código);
  // después se navega — CoworkPage desmonta este dashboard entero (cuelga la
  // sala activa al desmontar su vista) y monta el de la sesión nueva, cuyo
  // Hub REEMPLAZA al actual en el provider (un solo hueco de llamada). El
  // micro llega apagado como siempre (initialMicOn=false del Hub).
  const cambiarDeSesion = useCallback(async (id: string) => {
    if (!id || id === cowork.session?.id) return;
    const destino = sesionesNavegablesRef.current.find((s) => s.id === id);
    try {
      if (!(destino as { miRol?: string | null } | undefined)?.miRol) {
        await cowork.joinSession(id, "host");
      }
      navigate(`/cowork?session=${id}`);
    } catch (e) {
      toast.error((e as Error).message || traducir("cowork.host.switchSessionError"));
    }
  }, [cowork, navigate]);
  // Sincronización de los refs declarados arriba de conectarHub.
  cambiarDeSesionRef.current = cambiarDeSesion;
  sesionesNavegablesRef.current = sesionesNavegables;

  // La lista llegó (async) → re-empujar la config del Hub para que las
  // flechas del provider la vean. Mismo patrón que el re-push del silencio:
  // mismo key, sin reconectar.
  useEffect(() => {
    if (yaEntroAlHub.current && activeKey === hubKey) conectarHub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesionesNavegables]);

  const leaveOneOnOne = useCallback(async () => {
    if (oneOnOneRequestId) {
      try { await cowork.resolveHostRequest(oneOnOneRequestId); } catch {}
    }
    setOneOnOneRoom(null);
    setOneOnOneRequestId(null);
    setOneOnOneName(null);
  }, [oneOnOneRequestId, cowork.resolveHostRequest]);

  useEffect(() => {
    if (!oneOnOneRequestId) {
      oneOnOneSeenInListRef.current = false;
      return;
    }
    const req = cowork.hostRequests.find(r => r.id === oneOnOneRequestId);
    if (req) oneOnOneSeenInListRef.current = true;
    if (!oneOnOneSeenInListRef.current) return;
    if (!req || req.status === "resolved") {
      leaveOneOnOne();
      toast.info(traducir("cowork.host.privateCallEnded"));
    }
  }, [cowork.hostRequests, oneOnOneRequestId, leaveOneOnOne]);

  const getOneOnOneToken = useCallback(async () => {
    if (!oneOnOneRequestId) throw new Error("No 1:1 request");
    const result = await cowork.joinOneOnOne(oneOnOneRequestId);
    return { token: result.token, url: result.url };
  }, [cowork.joinOneOnOne, oneOnOneRequestId]);

  const getRoomParticipants = (roomId: string) =>
    cowork.assignments.filter(a => a.room_id === roomId && a.is_active);

  const openHostRequests = cowork.hostRequests.filter(
    r => r.status !== "resolved" && r.id !== oneOnOneRequestId
  );

  const doRenameSession = async () => {
    const nombre = sessionName.trim();
    if (!nombre) return;
    setRenaming(true);
    try {
      await cowork.renameSession(nombre);
      cowork.refetch();
      setRenameOpen(false);
      toast.success(t("cowork.host.renamed"));
    } catch (e: any) {
      toast.error(e.message || t("cowork.host.renameError"));
    } finally {
      setRenaming(false);
    }
  };

  // DOS UMBRALES, a propósito.
  //
  // Al minuto aparece la etiqueta en la tarjeta: si el coordinador está mirando,
  // lo ve; si no, no lo interrumpe nada. Agacharse a buscar algo o tomar agua no
  // tiene por qué sonarle a nadie.
  //
  // El sonido y la voz esperan al umbral del supervisor de la REGLA de esa
  // persona (cámara o encuadre, según lo que vio el detector): 3:00 en el
  // estándar, que es cuando ya se le avisó DOS VECES y no corrigió. Antes
  // sonaba al minuto —antes incluso de que el chatter viera su primer aviso— y
  // eso rompía justo lo que se buscaba: que un descuido se resuelva solo sin
  // interrumpir a nadie. Con `supervisorSeg` en null la etiqueta se ve, pero
  // no suena ni habla: en esa sesión al supervisor no se lo escala.
  const FACE_ALERT_MS = 60_000;
  /** Cuándo suena y habla por encuadre para ESTA persona; null = en esta
   *  sesión nunca (regla apagada o sin escalar al supervisor). */
  const umbralSonidoEncuadre = (ms: MediaState | undefined): number | null => {
    const regla = reglaDeEstado(reglas, ms?.faceState);
    if (!regla || !regla.activa || regla.supervisorSeg === null) return null;
    return regla.supervisorSeg * 1000;
  };
  /** Cuántos avisos ya recibió la persona según SU regla. El toast del
   *  supervisor decía "ya se le avisó dos veces" con los números fijos; con
   *  reglas por sesión eso puede ser cero o cinco. */
  const vecesAvisada = (regla: ReglaAviso, seg: number): number =>
    seg < regla.primerAvisoSeg ? 0 : 1 + Math.floor((seg - regla.primerAvisoSeg) / Math.max(1, regla.repetirSeg));
  // traducir(): se arma dentro de los efectos de los avisos.
  const textoAvisada = (n: number): string =>
    n === 0 ? traducir("cowork.host.warned.none") : n === 1 ? traducir("cowork.host.warned.once") : traducir("cowork.host.warned.many", { n });
  // ¿Lleva rato sin compartir pantalla?
  //
  // En Cowork la pantalla es la mitad del trabajo: sin ella el supervisor ve
  // una cara pero no ve QUÉ está haciendo esa persona. La persona ya recibe su
  // propio aviso (2:00 en el estándar); esto es lo que faltaba del otro lado, y
  // es lo mismo que ya pasaba con el encuadre antes de arreglarlo: el sistema
  // sabía, pero solo se lo decía a quien tenía el problema. El umbral es el de
  // la sesión; null (regla apagada o sin escalar) = acá no se avisa nunca.
  // Con la sala caída la cámara y la pantalla se ven apagadas aunque no lo
  // estén: avisar (y DECIRLO en voz alta, por cada persona) mandaría al
  // supervisor a reclamar lo que no está roto. Lo que se ve es "sin conexión".
  // Lo que dice el navegador de la persona manda (llega fresco aunque esté fuera
  // de /cowork); el reloj cubre a los bundles viejos, que no mandan la conexión.
  const salaCaidaEn = (ms: MediaState | undefined): boolean =>
    ms?.conexionSala === "desconectada" || ms?.relojEstado === "sin_conexion" || ms?.relojEstado === "sin_conexion_larga";

  const sinPantalla = (ms: MediaState | undefined): boolean => !salaCaidaEn(ms) && debeAvisarSinPantalla(
    ms, now,
    reglas.pantalla.activa && reglas.pantalla.supervisorSeg !== null ? reglas.pantalla.supervisorSeg * 1000 : null,
  );

  const faceIssue = (ms: MediaState | undefined): ProblemaCara | null => {
    if (!ms || !ms.faceState || !ms.faceSince) return null;
    if (ms.onBreak) return null;                   // ya sabemos que no está
    if (salaCaidaEn(ms)) return null;              // se cayó la sala, no su cámara
    if (ms.faceState === "ok") return null;
    if (ms.faceState === "unavailable") return null; // el detector no cargó en su equipo
    const regla = reglaDeEstado(reglas, ms.faceState);
    // Apagada = esa alerta no existe en esta sesión: tampoco la etiqueta.
    if (!regla || !regla.activa) return null;
    // La etiqueta aparece al minuto, pero nunca DESPUÉS de que suene: un umbral
    // de supervisor más corto (Estricto, o uno personalizado) la adelanta.
    if (now - ms.faceSince < Math.min(FACE_ALERT_MS, (regla.supervisorSeg ?? Infinity) * 1000)) return null;
    return ms.faceState === "no_face" ? "sin_rostro"
      : ms.faceState === "too_small" ? "fuera_de_cuadro"
      : ms.faceState === "too_dark" ? "sin_luz"
      // Cámara apagada SIN pausa marcada. Antes se ignoraba, y era el hueco más
      // grande: apagar la cámara es la forma más fácil de desaparecer, y era
      // justo la que no avisaba. Con pausa marcada sigue sin avisar (la corta
      // el `ms.onBreak` de arriba), que es lo correcto.
      : ms.faceState === "cam_off" ? "camara_apagada"
      : null;
  };


  // Tic de un segundo: los contadores de pausa se calculan contra este reloj, así
  // avanzan solos sin depender de que llegue un evento de presence.

  // ── LA VOZ SE MURIÓ Y NADIE SE ENTERABA ────────────────────────────────
  //
  // Cuando el motor de voz de Chromium se traba, `speak()` se acepta sin error
  // y la frase nunca suena. El único rastro era un `console.warn` — así que el
  // supervisor seguía viendo los avisos escritos, no escuchaba ninguno, y no
  // tenía forma de saber que le faltaba la mitad del sistema. Se descubrió
  // porque hubo que pedirle la consola.
  //
  // Ahora se dice en pantalla, con la instrucción que de verdad sirve: recargar
  // NO destraba el motor, hay que cerrar el navegador entero.
  useEffect(() => alFallarLaVoz((motivo) => {
    toast.error(traducir("cowork.host.voiceDead"), {
      description: traducir("cowork.host.voiceDeadDesc", { reason: MOTIVO_VOZ[motivo] ? traducir(MOTIVO_VOZ[motivo]) : motivo }),
      duration: 20_000,
      id: "voz-muerta",
    });
  }), []);

  // Aviso sonoro cuando alguien se PASA de su pausa — pero recién al umbral
  // de la sesión de excedido (3:00 en el estándar), no al segundo uno. Con
  // `supervisorSeg` en null, en esta sesión pasarse no escala a nadie.
  //
  // El motivo es que interrumpir a quien supervisa nueve salas es caro:
  // pasarse un minuto del baño es asunto de la persona, y ella ya está
  // recibiendo su propio aviso hablado. Lo que amerita subir un nivel es que
  // el aviso no haya surtido efecto.
  //
  // Se REPITE mientras siga pasada (ver REPETIR_AVISO_SUPERVISOR_MS), y la
  // marca se borra cuando la pausa termina o la persona se va.
  const yaAvisadoPausa = useRef<MarcasAviso>(new Map());
  useEffect(() => {
    // Olvidar a quien se fue. Faltaba SOLO en este aviso —los otros dos ya la
    // hacían—, y esa asimetría dejaba muda la próxima pausa de quien se
    // desconectaba estando pasado: su marca quedaba puesta para siempre.
    olvidarAusentes(yaAvisadoPausa.current, mediaStates);
    for (const uid of Object.keys(mediaStates)) {
      const p = pausaDe(uid);
      if (!p) { yaAvisadoPausa.current.delete(uid); continue; }
      const pasadoSeg = -p.cuenta.restante;
      if (reglas.pausas.supervisorSeg === null) continue;
      if (pasadoSeg * 1000 < reglas.pausas.supervisorSeg * 1000) continue;
      if (!tocaAvisar(yaAvisadoPausa.current, uid, now)) continue;
      const quien = nombreYApellido(cowork.profiles[uid]);
      playCoordinatorRequestSound();
      // Se ENCOLA en vez de hablar directo: los tres avisos recorren a toda la
      // gente en el mismo ciclo, y disparar `cancel()+speak()` decenas de veces
      // de golpe es lo que traba el motor de voz de Chromium. La cola agrupa
      // por persona y habla de a una.
      // La voz, en español (ver VOZ_PROBLEMA); el cartel, en el idioma de la interfaz.
      encolarVoz(quien, `lleva ${Math.floor(pasadoSeg / 60)} minutos pasado de su ${p.kind === "break" ? "break" : p.kind === "almuerzo" ? "almuerzo" : "baño"}`,
        { volumen: 0.85 });
      toast.warning(traducir(p.kind === "break" ? "cowork.host.alert.overBreak" : p.kind === "almuerzo" ? "cowork.host.alert.overLunch" : "cowork.host.alert.overBathroom", { name: quien }), {
        description: traducir("cowork.host.alert.overDesc", { time: p.cuenta.texto.replace("−", "") }),
        duration: 10_000,
      });
    }
  }, [mediaStates, now, cowork.profiles, reglas]);

  // Aviso sonoro cuando alguien lleva rato fuera de cuadro. Hasta ahora la
  // alerta era una etiqueta silenciosa en la tarjeta: si el coordinador estaba
  // mirando otra sala, no se enteraba. Se REPITE mientras siga fuera de cuadro
  // (ver REPETIR_AVISO_SUPERVISOR_MS) y la marca se borra cuando vuelve o se va.
  const yaAvisado = useRef<MarcasAviso>(new Map());
  useEffect(() => {
    // Si alguien se FUE de la sesión, su marca se va con él. Sin esto la marca
    // queda pegada para siempre: al volver ya figura como "ya avisado" y no
    // vuelve a sonar nunca más. Era por qué el aviso funcionaba una vez y
    // después no, y se veía como "dejó de andar" cuando en realidad nunca se
    // rearmaba. Solo se limpiaba al VOLVER a estar bien — irse no cuenta como
    // volver a estar bien.
    olvidarAusentes(yaAvisado.current, mediaStates);
    for (const [uid, st] of Object.entries(mediaStates)) {
      const problema = faceIssue(st);
      const umbral = umbralSonidoEncuadre(st);
      const bastante = !!problema && umbral !== null && !!st.faceSince && (now - st.faceSince) >= umbral;
      if (bastante && tocaAvisar(yaAvisado.current, uid, now)) {
        // Con apellido: en el equipo hay dos Álvaro Mejía y hubo dos Manuela
        // Zapata. Un aviso que dice solo el nombre de pila no identifica a
        // nadie, que es exactamente lo que el aviso tiene que hacer.
        const quien = nombreYApellido(cowork.profiles[uid]);
        playCoordinatorRequestSound();
        // Se lo dice en voz alta y CON EL NOMBRE. Es lo que la voz del propio
        // chatter no puede darle al coordinador: saber a quién mirar sin tener
        // que buscar cuál de las nueve salas parpadea.
        // El nombre lo pone la cola: así dos problemas de la misma persona se
        // dicen en UNA frase ("...tiene la cámara apagada, y lleva 8 minutos
        // sin compartir pantalla") en vez de dos que se cortan entre sí.
        encolarVoz(quien, VOZ_PROBLEMA[problema], { volumen: 0.85 });
        const seg = Math.floor((now - (st.faceSince as number)) / 1000);
        const regla = reglaDeEstado(reglas, st.faceState);
        toast.warning(`${quien}: ${traducir(ETIQUETA_PROBLEMA[problema]).toLowerCase()}`, {
          description: traducir("cowork.host.alert.faceDesc", {
            time: formatBreak(seg), warned: textoAvisada(regla ? vecesAvisada(regla, seg) : 0),
          }),
          duration: 8000,
        });
      } else if (!problema) {
        yaAvisado.current.delete(uid);
      }
    }
  }, [mediaStates, now, cowork.profiles, reglas]);

  // Lo mismo, para compartir pantalla. Es un aviso aparte y no una rama del de
  // arriba porque son dos problemas distintos: alguien puede estar perfecto en
  // cámara y llevar media hora sin compartir, que es justamente el caso que no
  // se veía. Se REPITE mientras siga sin compartir (ver
  // REPETIR_AVISO_SUPERVISOR_MS) y se rearma cuando vuelve a compartir.
  const yaAvisadoPantalla = useRef<MarcasAviso>(new Map());
  useEffect(() => {
    // Misma purga que arriba, por la misma razón.
    olvidarAusentes(yaAvisadoPantalla.current, mediaStates);
    for (const [uid, st] of Object.entries(mediaStates)) {
      if (sinPantalla(st)) {
        if (!tocaAvisar(yaAvisadoPantalla.current, uid, now)) continue;
        const quien = nombreYApellido(cowork.profiles[uid]);
        const minutos = Math.floor((now - (st.screenShareSince as number)) / 60000);
        playCoordinatorRequestSound();
        // Con nombre y apellido, igual que el de encuadre: en una grilla de
        // nueve salas, saber A QUIÉN mirar es la mitad del aviso. Y en el
        // equipo hay dos Álvaro Mejía.
        encolarVoz(quien, `lleva ${minutos} minutos sin compartir pantalla`, { volumen: 0.85 });
        const seg = Math.floor((now - (st.screenShareSince as number)) / 1000);
        toast.warning(traducir("cowork.host.alert.noScreen", { name: quien }), {
          description: traducir("cowork.host.alert.noScreenDesc", {
            n: minutos, warned: textoAvisada(vecesAvisada(reglas.pantalla, seg)),
          }),
          duration: 8000,
        });
      } else if (st.screenShareOn) {
        // Se rearma solo cuando VUELVE a compartir, no apenas deja de cumplirse
        // la condición: si se rearmara con la pausa, volvería a sonar al
        // volver del baño sin que la persona haya hecho nada distinto.
        yaAvisadoPantalla.current.delete(uid);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaStates, now, cowork.profiles]);

  // El aviso de manos levantadas (sonido + globito del sistema) se mudó a
  // useCoworkRequestAlerts, montado por encima del router: acá solo sonaba
  // mientras esta página estuviera abierta, y el coordinador que navegaba a otra
  // sección dejaba de enterarse. Si se dejara también acá, sonaría dos veces.

  // Quién comparte pantalla en cada sala — VERDAD de LiveKit reportada por cada
  // CoworkRoomMonitor (más confiable que el presence auto-reportado, que fallaba y
  // mostraba "nadie comparte" aunque alguien lo estuviera haciendo).
  // Quién comparte pantalla en cada sala (ids), según LiveKit. Los nombres
  // que el monitor también manda ya no hacen falta: el panel los saca del perfil.
  const [roomSharerIds, setRoomSharerIds] = useState<Record<string, string[]>>({});
  // Quién está HABLANDO en cada sala (ActiveSpeakersChanged de LiveKit), para
  // pintar la card en verde mientras alguien habla.
  const [roomSpeakers, setRoomSpeakers] = useState<Record<string, string[]>>({});
  // Manejadores ESTABLES por sala para CoworkRoomMonitor (que está memoizado):
  // si se recrean en cada render —como las flechas inline de antes— el memo no
  // sirve y los 8-9 monitores se redibujan con cada tick del reloj o evento de
  // presencia, que era parte de lo que congelaba el navegador del supervisor
  // (Álvaro, 23/10). Los setX de useState son estables, así que cachear una vez
  // por sala es seguro.
  const manejadoresMonitor = useRef<Record<string, {
    sharers: (names: string[], ids?: string[]) => void;
    speaking: (names: string[]) => void;
    participants: (ids: string[] | null) => void;
  }>>({});
  const manejadoresDe = (roomId: string) => {
    let h = manejadoresMonitor.current[roomId];
    if (!h) {
      h = {
        sharers: (_names, ids) => setRoomSharerIds((m) => ({ ...m, [roomId]: ids ?? [] })),
        speaking: (names) => setRoomSpeakers((m) => ({ ...m, [roomId]: names })),
        participants: (ids) => setRoomConectados((m) => ({ ...m, [roomId]: ids })),
      };
      manejadoresMonitor.current[roomId] = h;
    }
    return h;
  };

  const handleAddRoom = async () => {
    const name = addName.trim();
    if (!name) return;
    setRoomBusy(true);
    try {
      await cowork.addRoom(name);
      await cowork.refetch(true);
      toast.success(t("cowork.host.roomAdded"));
      setAddOpen(false);
      setAddName("");
    } catch (e: any) { toast.error(e?.message || t("cowork.host.roomAddError")); }
    finally { setRoomBusy(false); }
  };

  const openEdit = (room: CoworkRoom) => {
    setEditRoom(room);
    setEditName(room.name);
    setEditVideo((room.preview_mode ?? "video") === "video");
  };

  const handleSaveEdit = async () => {
    if (!editRoom) return;
    setRoomBusy(true);
    try {
      await cowork.updateRoom(editRoom.id, {
        name: editName.trim() || editRoom.name,
        previewMode: editVideo ? "video" : "avatars",
      });
      await cowork.refetch(true);
      toast.success(t("cowork.host.roomUpdated"));
      setEditRoom(null);
    } catch (e: any) { toast.error(e?.message || t("cowork.host.roomUpdateError")); }
    finally { setRoomBusy(false); }
  };

  const handleCloseRoom = async () => {
    if (!closeTarget) return;
    setRoomBusy(true);
    try {
      await cowork.closeRoom(closeTarget.id);
      await cowork.refetch(true);
      toast.success(t("cowork.host.roomClosed"));
      setCloseTarget(null);
    } catch (e: any) { toast.error(e?.message || t("cowork.host.roomCloseError")); }
    finally { setRoomBusy(false); }
  };

  // ── Tarjeta de sala (rediseño, fase 6) ──────────────────────────────────
  //
  // El video es el protagonista. Lo que antes iba ARRIBA del video como texto
  // (reloj, "Compartiendo: …", pausas) ahora va ENCIMA del video: los llamados
  // como etiquetas y la gente con su reloj al pie. Los controles bajan a una
  // sola fila; editar, cerrar y copiar el enlace se guardan en el menú «⋯».
  // En el teléfono la tarjeta es solo el video: al tocarla, sus controles
  // suben en una hoja inferior.
  const isMobile = useIsMobile();
  const [salaEnHoja, setSalaEnHoja] = useState<string | null>(null);
  // Qué salas están mostrando la PANTALLA compartida en su miniatura. Lo
  // controla la ÚNICA pantallita de la tarjeta (escritorio); en el teléfono
  // no aplica: ahí el salto a la pantalla es automático y la pantallita abre
  // la hoja de la sala.
  const [verPantallaDe, setVerPantallaDe] = useState<Record<string, boolean>>({});
  // La sala a la que se le está AVISANDO (voz Mario) desde los tres puntitos
  // o la hoja del teléfono: un solo diálogo controlado para todas.
  const [avisarSala, setAvisarSala] = useState<string | null>(null);
  // Escribirle a alguien desde la lista de pantallas: se abre (o crea) el DM
  // y sale en la ventanita flotante del Messenger, sin irse del tablero.
  const { createDirectChat } = useChatShared();
  const { abrirChat } = useMessengerDock();
  const escribirA = (uid: string) => { const id = createDirectChat(uid); if (id) abrirChat(id); };
  // MOVER A OTRA SALA (Alvaro, 17/11/2026): antes cada participante elegía su
  // sala y el anfitrión no podía moverlo. La edge valida que quien mueve es
  // anfitrión y que la sala es de esta sesión; a la persona le llega por
  // Realtime y su vista entra sola a la sala nueva.
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const moverASala = async (uid: string, roomId: string) => {
    if (moviendo) return;
    setMoviendo(uid);
    try {
      const r = await cowork.asignarSala(uid, roomId);
      toast.success(t("cowork.host.movedToRoom", {
        name: nombreYApellido(cowork.profiles[uid]) || t("cowork.common.someone"),
        room: r.roomName,
      }));
      void cowork.refetch(true);
    } catch {
      toast.error(t("cowork.host.moveToRoomFailed"));
    } finally {
      setMoviendo(null);
    }
  };

  // Dónde colgar el botón «Hub» cuando el hub está minimizado: en la pila del
  // muelle flotante (encima de la nubecita del Messenger), que es lo que la
  // gente ya sabe dónde está. Antes quedaba donde hubiera quedado la ventana
  // al arrastrarla, o sea en cualquier lado. Se busca al minimizar (el muelle
  // vive por encima del router, así que ya está en el DOM), y si no hay
  // muelle (sin Messenger ni Clari) el botón cae abajo a la derecha.
  const [anclaMuelle, setAnclaMuelle] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setAnclaMuelle(hubMinimized ? document.getElementById(MUELLE_EXTRA_ID) : null);
  }, [hubMinimized, isMobile]);

  const minutosTexto = (seg: number) => (seg < 60 ? `${seg} s` : `${Math.floor(seg / 60)} min`);

  // El reloj de una persona: la presencia manda; si no llegó, el que el latido
  // dejó en la base. (La presencia ya no se queda vieja con la página de la
  // persona desmontada: lee el reloj al publicar. Comparar las dos por hora no
  // sirve: una es la hora del navegador y la otra la del servidor.)
  // Va antes de las etiquetas y de las tarjetas, que lo usan.
  const relojDe = (uid: string) => relojDesdePresencia(mediaStates[uid]) ?? relojDeRespaldo(relojRespaldo[uid], now);
  // Caídas de llamada de la última hora por persona (lib/caidasSeguidas.ts).
  // null = no se sabe (cargando o falló): sin chip, nunca «0 caídas».
  const caidasDelEquipo = useCaidasDelEquipo();
  type Etiqueta = { key: string; texto: string; tono: "warning" | "destructive" | "muted"; icono: LucideIcon };
  /** Los llamados de atención de una sala: lo que el supervisor tiene que ver
   *  sin leer. Con dos personas en la sala, cada etiqueta dice de quién es. */
  const etiquetasDe = (participants: Array<{ user_id: string }>, sinPausaGlobal: boolean): Etiqueta[] => {
    const out: Etiqueta[] = [];
    for (const a of participants) {
      const ms = mediaStates[a.user_id];
      const quien = participants.length > 1 ? `${nombreYApellido(cowork.profiles[a.user_id])} · ` : "";
      // En un meet grupal no hay cámara ni pantalla que exigir: su chip dice
      // dónde está y cuánto lleva, y nada más.
      const enMeet = meetDe(a.user_id);
      if (enMeet) {
        if (sinPausaGlobal) {
          out.push({ key: `${a.user_id}-meet`, icono: Video, texto: `${quien}${t("cowork.host.chip.inMeet", { time: minutosTexto(Math.floor((now - enMeet.desde) / 1000)) })}`, tono: "muted" });
        }
        continue;
      }
      // Se le cayó la sala: eso es lo que hay que ver, no "cámara apagada".
      const reloj = relojDe(a.user_id);
      if (salaCaidaEn(ms) || sinConexionConLaSala(reloj)) {
        const larga = reloj?.estado === "sin_conexion_larga";
        out.push({
          key: `${a.user_id}-conexion`,
          icono: WifiOff,
          texto: `${quien}${t(larga ? "cowork.host.chip.noConnectionLong" : "cowork.host.chip.noConnection")}`,
          tono: larga ? "destructive" : "warning",
        });
      }
      // Su internet se le corta seguido: 3 caídas o más en la última hora.
      // Solo visibilidad, sin voz ni push (Alvaro, 17/11/2026).
      const caidas = caidasDelEquipo?.[a.user_id];
      if (hayChipDeCaidas(caidas)) {
        out.push({
          key: `${a.user_id}-caidas`,
          icono: WifiLow,
          texto: `${quien}${t("cowork.host.chip.unstableInternet", { n: caidas })}`,
          tono: "warning",
        });
      }
      const problema = faceIssue(ms);
      if (problema && ms?.faceSince) {
        out.push({
          key: `${a.user_id}-cara`,
          icono: problema === "camara_apagada" ? VideoOff : EyeOff,
          texto: `${quien}${t(ETIQUETA_PROBLEMA[problema])} · ${minutosTexto(Math.floor((now - ms.faceSince) / 1000))}`,
          tono: "warning",
        });
      }
      if (sinPantalla(ms) && ms?.screenShareSince) {
        out.push({
          key: `${a.user_id}-pantalla`,
          icono: MonitorOff,
          texto: `${quien}${t("cowork.host.chip.noScreen")} · ${minutosTexto(Math.floor((now - ms.screenShareSince) / 1000))}`,
          tono: "warning",
        });
      }
      const pausa = sinPausaGlobal ? pausaDe(a.user_id) : null;
      if (pausa) {
        out.push({
          key: `${a.user_id}-pausa`,
          icono: Coffee,
          texto: `${quien}${t(NOMBRE_PAUSA[pausa.kind])} ${pausa.cuenta.texto}`,
          tono: pausa.cuenta.estado === "excedida" ? "destructive" : pausa.cuenta.estado === "poco" ? "warning" : "muted",
        });
      }
    }
    return out;
  };
  // Chips sobrios (diseño v5, Álvaro 26/10): fondo oscuro uniforme y el color
  // va en el TEXTO — ámbar avisa, rojo exige, lo neutro no compite.
  const TONO_ETIQUETA: Record<Etiqueta["tono"], string> = {
    warning: "border border-warning/35 bg-black/55 text-warning",
    destructive: "border border-destructive/40 bg-black/55 text-destructive animate-pulse motion-reduce:animate-none",
    muted: "border border-white/10 bg-black/55 text-white/75",
  };

  /** La gente de una sala con su reloj de Cowork (el mismo número que ve la
   *  persona, porque viaja por presencia). */
  const personasDe = (participants: Array<{ user_id: string }>) => participants.map((a) => {
    const reloj = relojDe(a.user_id);
    const corre = !!reloj && cuentaComoTrabajo(reloj.estado);
    return {
      uid: a.user_id,
      nombre: nombreYApellido(cowork.profiles[a.user_id]),
      // Verde si la presencia general la ve, O si su latido es reciente: está
      // trabajando aunque el socket de Realtime se le haya caído.
      online: isOnline(a.user_id) || latidoFresco(relojRespaldo[a.user_id], now),
      reloj,
      corre,
      motivo: (() => {
        const clave = reloj && !corre ? claveMotivoDetenido(reloj.estado, true) : null;
        return clave ? t(clave) : null;
      })(),
    };
  });

  /** Los cuatro controles de una sala. Misma lógica que siempre (escuchar /
   *  hablar / cámara / pantalla por sala); solo cambia el tamaño: en la
   *  tarjeta son iconos, en la hoja del teléfono llevan su palabra. */
  const controlesDeSala = (room: CoworkRoom, grande: boolean) => (
    <>
      <BotonSala
        grande={grande}
        tono="neutro"
        activo={hearFor(room.id)}
        icono={hearFor(room.id) ? Volume2 : VolumeX}
        etiqueta={grande ? (hearFor(room.id) ? t("cowork.host.room.listening") : t("cowork.host.room.muted")) : undefined}
        title={hearFor(room.id) ? t("cowork.host.room.listeningHint") : t("cowork.host.room.mutedHint")}
        onClick={() => setRoomHear((m) => ({ ...m, [room.id]: !hearFor(room.id) }))}
      />
      <BotonSala
        grande={grande}
        tono={broadcastFor(room.id) && micCaido ? "caido" : "verde"}
        activo={broadcastFor(room.id)}
        icono={broadcastFor(room.id) && !micCaido ? Mic : MicOff}
        etiqueta={broadcastFor(room.id) ? (micCaido ? t("cowork.host.micDown") : t("cowork.host.room.talking")) : t("cowork.host.talk")}
        title={broadcastFor(room.id)
          ? (micCaido ? t("cowork.host.room.micDownHint") : t("cowork.host.room.talkingHint"))
          : t("cowork.host.room.talkHint")}
        onClick={() => {
          setRoomMic((m) => ({ ...m, [room.id]: !(m[room.id] ?? false) }));
        }}
      />
      <BotonSala
        grande={grande}
        activo={camFor(room.id)}
        icono={camFor(room.id) ? Video : VideoOff}
        etiqueta={grande ? t("cowork.host.camera") : undefined}
        title={camFor(room.id) ? t("cowork.host.room.cameraOnHint") : t("cowork.host.room.cameraHint")}
        onClick={() => setRoomCam((m) => ({ ...m, [room.id]: !(m[room.id] ?? false) }))}
      />
      <BotonSala
        grande={grande}
        activo={screenFor(room.id)}
        icono={screenFor(room.id) ? ScreenShare : ScreenShareOff}
        etiqueta={grande ? t("cowork.host.screen") : undefined}
        title={screenFor(room.id) ? t("cowork.host.room.screenOnHint") : t("cowork.host.room.screenHint")}
        // El supervisor comparte en una sola sala: prenderla aquí la apaga en las demás.
        onClick={() => setRoomScreen((m) => unaSolaPantalla
          ? ((m[room.id] ?? false) ? {} : { [room.id]: true })
          : { ...m, [room.id]: !(m[room.id] ?? false) })}
      />
    </>
  );

  const copiarEnlaceDeSala = (room: CoworkRoom) => {
    const url = `${window.location.origin}/cowork?session=${cowork.session?.id || ""}&room=${room.id}`;
    navigator.clipboard.writeText(url);
    toast.success(t("cowork.host.linkCopied", { room: room.name }));
  };
  const copiarCodigoDeSala = (room: CoworkRoom) => {
    if (!room.join_code) return;
    navigator.clipboard.writeText(room.join_code);
    toast.success(t("cowork.host.codeCopied", { room: room.name, code: room.join_code }));
  };

  const conectadas = cowork.assignments.filter((a) => a.is_active).length;
  const fraseDeSalas = t("cowork.host.roomsSummary", {
    people: conectadas === 1 ? t("cowork.host.peopleConnectedOne") : t("cowork.host.peopleConnectedMany", { n: conectadas }),
    rooms: cowork.rooms.length === 1 ? t("cowork.host.roomsOne") : t("cowork.host.roomsMany", { n: cowork.rooms.length }),
  });
  // Lo que se VE como nombre de la sala activa. En el meet grupal, "Meet grupal"
  // en el idioma de quien mira (el estado guarda el español para la grabación).
  const nombreSalaActiva = activeMeetId ? t("cowork.meet.title") : activeRoomName;

  // Quién está en cada sala, calculado antes de dibujar. "Participantes" son
  // los asignados que ESTÁN según LiveKit; si el monitor no sabe (no conectó,
  // o está apagado porque entré a esa sala), los asignados a secas.
  const fichas = cowork.rooms.map((room) => {
    const asignados = getRoomParticipants(room.id);
    const ids = asignados.map((a) => a.user_id);
    // Se le cayó la sala y sigue ahí: lo dice su navegador, o su reloj. Con la
    // conexión de por medio también se queda quien estaba en pausa.
    const caidas = ids.filter((uid) => mediaStates[uid]?.conexionSala === "desconectada" || sinConexionConLaSala(relojDe(uid)));
    const presentes = new Set(personasEnSala(ids, roomConectados[room.id], caidas));
    const participants = asignados.filter((a) => presentes.has(a.user_id));
    const pausaSala = pausaDeLaSala(participants.map((p) => p.user_id));
    return { room, asignados, participants, pausaSala };
  });

  // Barrita de consola (el aire del "cuadrito" del homepage, Álvaro 26/10):
  // cuánta gente hay en salas, cuántas con conversación, y el reloj de pared.
  const enSalas = fichas.reduce((n, f) => n + f.participants.length, 0);
  const salasHablando = fichas.reduce((n, f) => n + ((roomSpeakers[f.room.id]?.length ?? 0) > 0 ? 1 : 0), 0);
  const relojPared = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="flex flex-1 min-h-0 text-foreground relative md:flex-row-reverse">
      {/* En escritorio el panel lateral va a la DERECHA (Jhon, 10/09); el orden del
          DOM no cambia, lo invierte flex-row-reverse. En el teléfono el panel es
          una hoja fija y el orden no importa. */}
      {/* Mobile sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-3 left-3 z-50 md:hidden h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <XIcon className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </Button>

      {/* Aviso recibido (si a ESTE supervisor le avisaron): cartel + campana + voz,
          por encima de todo. El root es `relative`, así se ancla acá. */}
      {avisoRecibido && (
        <AvisoChatter
          nombreDe={avisoRecibido.nombreDe}
          etiqueta={avisoRecibido.etiqueta}
          onCerrar={cerrarAvisoRecibido}
          t={t}
        />
      )}

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Panel lateral */}
      {/* Plegada queda una tira angosta con el boton para volver a abrirla: si
          desapareciera del todo no habria como traerla de vuelta. */}
      {sidebarCollapsed && (
        <div className="hidden md:flex w-10 h-full border-l border-border bg-card flex-col items-center pt-3 shrink-0">
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title={t("cowork.host.showPanel")}
            onClick={() => { setSidebarCollapsed(false); localStorage.setItem("maven.cowork.sidebar.collapsed", "0"); }}
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>
          {/* Con el panel plegado, una mano levantada quedaria invisible: el
              unico lugar donde se listan es adentro. El contador lo trae de
              vuelta y al tocarlo abre el panel en el que estan. */}
          {openHostRequests.length > 0 && (
            <button
              onClick={() => { setSidebarCollapsed(false); localStorage.setItem("maven.cowork.sidebar.collapsed", "0"); }}
              title={openHostRequests.length === 1 ? t("cowork.host.requestsOne") : t("cowork.host.requestsMany", { n: openHostRequests.length })}
              className="mt-2 relative h-8 w-8 rounded-lg flex items-center justify-center bg-warning/15 text-warning hover:bg-warning/25 transition-colors animate-pulse"
            >
              <Hand className="h-4 w-4" />
              <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-warning text-[10px] font-semibold text-warning-foreground flex items-center justify-center">
                {openHostRequests.length > 9 ? "9+" : openHostRequests.length}
              </span>
            </button>
          )}
          {/* Lo mismo con las pausas: si alguien se paso del limite, se ve. */}
          {(() => {
            const excedidas = Object.keys(mediaStates).filter((uid) => pausaDe(uid)?.excedida).length;
            const enPausa = Object.keys(mediaStates).filter((uid) => pausaDe(uid)).length;
            if (!enPausa) return null;
            return (
              <button
                onClick={() => { setSidebarCollapsed(false); localStorage.setItem("maven.cowork.sidebar.collapsed", "0"); }}
                title={excedidas ? t("cowork.host.overLimit", { n: excedidas }) : t("cowork.host.pausedCount", { n: enPausa })}
                className={`mt-2 relative h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
                  excedidas ? "bg-destructive/20 text-destructive animate-pulse" : "bg-success/15 text-success hover:bg-success/25"
                }`}
              >
                <Coffee className="h-4 w-4" />
                <span className={`absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center ${
                  excedidas ? "bg-destructive text-destructive-foreground" : "bg-success text-success-foreground"
                }`}>
                  {enPausa}
                </span>
              </button>
            );
          })()}
        </div>
      )}

      <div className={`
        fixed md:relative z-40 md:z-auto
        w-72 xl:w-80 h-[calc(100dvh-3.5rem)] md:h-full
        md:border-l border-border/60 flex flex-col bg-card/65 backdrop-blur-xl
        transition-transform duration-200 ease-in-out
        ${sidebarCollapsed ? "md:hidden" : ""}
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <div className="border-b border-border/60 px-4 pb-3 pl-14 pt-4 md:pl-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">Supervisor Dashboard</p>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              {/* El nombre ES el botón para renombrar (Jhon, 10/09): el lápiz que
                  iba al lado quedaba tapado por la barrita de acciones. Al pasar
                  el mouse se subraya, para que se note que se puede tocar. */}
              <button
                type="button"
                className="group flex min-w-0 items-center text-left"
                title={t("cowork.host.renameHint")}
                onClick={() => {
                  setSessionName(cowork.session?.name || "");
                  setRenameOpen(true);
                }}
              >
                <h2 className="truncate font-display text-base font-semibold text-foreground decoration-primary/60 decoration-dotted underline-offset-4 transition-colors group-hover:text-primary group-hover:underline">{tituloBonito(cowork.session?.name)}</h2>
              </button>
            </div>
            {/* Acciones de la sesión, todas del mismo tamaño y color: antes cada
                una tenía el suyo (el enlace en acento, el apagado en rojo) y la
                fila se veía desparejada. Finalizar la sesión ya no está aquí:
                vive en la lista de sesiones, fuera del tablero. */}
            <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-muted/40 p-0.5">
              {puedeFinalizar && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  title={t("cowork.host.copyHostLinkHint")}
                  aria-label={t("cowork.host.copyHostLink")}
                  disabled={copiandoEnlace}
                  // El código se pide AL COPIAR, no al abrir el tablero: el servidor
                  // lo emite con vencimiento, y uno pedido hace tres horas ya no
                  // serviría. Mientras el vigente no venza, devuelve el mismo.
                  onClick={async () => {
                    setCopiandoEnlace(true);
                    try {
                      const res = await cowork.getHostCode() as { hostCode: string; expiresAt?: string };
                      const url = `${window.location.origin}/cowork?session=${cowork.session?.id || ""}&role=host&code=${res.hostCode}`;
                      await navigator.clipboard.writeText(url);
                      toast.success(t("cowork.host.hostLinkCopied"), {
                        description: t("cowork.host.hostLinkCopiedDesc"),
                      });
                    } catch (e) {
                      toast.error(t("cowork.host.copyLinkError"), { description: (e as Error).message });
                    } finally {
                      setCopiandoEnlace(false);
                    }
                  }}
                >
                  <Share2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                title={t("cowork.host.pausesHint")}
                aria-label={t("cowork.host.pauses")}
                onClick={() => setPausasOpen(true)}
              >
                <Coffee className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="relative h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                title={t("cowork.rules.eyebrow")}
                aria-label={t("cowork.rules.eyebrow")}
                onClick={() => setReglasOpen(true)}
              >
                <Settings2 className="h-4 w-4" />
                {/* Punto cuando la sesión NO sigue el estándar: de un vistazo se
                    sabe que aquí los avisos son distintos a los de siempre. */}
                {!sonEstandar(reglas) && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-card" />
                )}
              </Button>
              <span className="mx-0.5 hidden h-4 w-px bg-border md:block" aria-hidden />
              <Button
                variant="ghost"
                size="icon"
                className="hidden h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:inline-flex"
                title={t("cowork.host.hidePanel")}
                aria-label={t("cowork.host.hidePanel")}
                onClick={() => { setSidebarCollapsed(true); localStorage.setItem("maven.cowork.sidebar.collapsed", "1"); }}
              >
                <PanelRightClose className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {/* El panel va en TARJETAS (Jhon, 10/09: "dale un buen diseño"): cada
              bloque con su icono en un círculo, su título y su cuenta, sobre un
              fondo apenas más claro que el panel. */}
          <section className="mx-3 mt-3 rounded-2xl border border-border/60 bg-background/50 p-3">
            <div className="flex items-center gap-2.5">
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", hubConnected ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                <Radio className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">Supervisor Hub</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {hubConnected ? (hubMinimized ? t("cowork.host.hub.connectedMinimized") : t("cowork.host.hub.connected")) : t("cowork.host.hub.notConnected")}
                </p>
              </div>
              {hubConnected ? (
                <Button variant="outline" size="sm" className="h-7 shrink-0 rounded-full px-2.5 text-[11px]" onClick={() => setHubMinimized(!hubMinimized)}>
                  {hubMinimized ? t("cowork.host.hub.show") : t("cowork.host.minimize")}
                </Button>
              ) : cowork.session?.host_hub_livekit_room ? (
                <Button variant="outline" size="sm" className="h-7 shrink-0 rounded-full px-2.5 text-[11px]" onClick={conectarHub}>
                  {t("cowork.host.hub.reconnect")}
                </Button>
              ) : null}
            </div>
            {/* Avisar general: eliges a una persona de la sesión o a todos, y la
                situación. Solo lo ven quienes pueden avisar (los 4 designados o
                el dueño). */}
            {puedeAvisarGeneral && (
              <div className="mt-2.5">
                <AvisarGeneralDialog
                  objetivos={objetivosAviso}
                  onAvisar={(ids, slug) => void enviarAviso(ids, slug)}
                  t={t}
                />
              </div>
            )}
          </section>

          {/* Unassigned members section removed — participants self-join via URL ?room=X */}

          {/* Host Requests */}
          <section className="mx-3 mt-3 space-y-2 rounded-2xl border border-border/60 bg-background/50 p-3">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-warning/15 text-warning"><Hand className="h-3.5 w-3.5" /></span>
              <h3 className="text-xs font-semibold text-foreground">{t("cowork.host.requests")}</h3>
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{openHostRequests.length}</span>
            </div>
            {openHostRequests.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1">{t("cowork.host.noRequests")}</p>
            ) : (
              openHostRequests.map((req) => {
                const roomName = cowork.rooms.find(r => r.id === req.room_id)?.name || "?";
                const is1on1 = !!req.oneone_livekit_room;
                return (
                  <div key={req.id} className={`rounded-xl p-2.5 space-y-1 ${is1on1 ? "bg-primary/5" : "bg-warning/10"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex min-w-0 items-center gap-2">
                        <UserAvatar name={cowork.profiles[req.user_id]} src={cowork.avatares[req.user_id]?.src} seed={cowork.avatares[req.user_id]?.seed} size="sm" />
                        <span className="truncate text-xs font-medium text-foreground/90">{cowork.profiles[req.user_id] || "User"}</span>
                        {is1on1 ? <Phone className="h-3 w-3 shrink-0 text-primary" /> : <Hand className="h-3 w-3 shrink-0 text-warning" />}
                      </div>
                      <Badge variant="outline" className={`text-[9px] rounded-full ${is1on1 ? "border-primary/30 text-primary" : "border-warning/30 text-warning"}`}>{roomName}</Badge>
                    </div>
                    {req.message && <p className="text-[10px] text-muted-foreground">{mensajeDeSolicitud(req.message, t)}</p>}
                    <div className="flex gap-1">
                      {req.status === "open" && (
                        <Button size="sm" variant="ghost" className={`h-5 text-[10px] rounded-full ${is1on1 ? "text-primary" : "text-warning"}`} onClick={async () => {
                          if (is1on1) {
                            await cowork.ackHostRequest(req.id);
                            setOneOnOneRequestId(req.id);
                            setOneOnOneRoom(req.oneone_livekit_room!);
                            setOneOnOneName(cowork.profiles[req.user_id] || "User");
                            setHubMinimized(true);
                          } else {
                            if (req.room_id) enterRoom(req.room_id);
                            await cowork.resolveHostRequest(req.id);
                          }
                        }}>
                          {is1on1 ? t("cowork.host.answer") : t("cowork.host.goToRoom")}
                        </Button>
                      )}
                      {/* Marcar como atendida SIN entrar a la sala: muchas veces el
                          coordinador ya resolvió por otro lado (le habló por el 🎤,
                          pasó por su puesto) y solo necesita sacarla de la lista.
                          Antes la única salida era "Atender", que te metía a la sala. */}
                      {/* También para las PRIVADAS, y ahí no es una comodidad:
                          es la única salida.

                          Mientras una solicitud privada siga abierta, al chatter
                          se lo lleva automáticamente a esa sala 1:1 — y si nadie
                          la cierra, queda parado en una sala VACÍA mientras aquí
                          le hablan a la sala principal. Se ve igual que un
                          problema de audio: "le hablo y no me escucha".

                          Antes este botón estaba envuelto en `!is1on1`, así que
                          para una privada solo había "Atender" y "Unirse":
                          ninguna de las dos la cierra. Si ella tocaba Atender y
                          después cerraba la pestaña, la solicitud quedaba viva
                          para siempre. */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 text-[10px] text-muted-foreground hover:text-foreground rounded-full"
                        title={is1on1
                          ? t("cowork.host.closePrivateHint")
                          : t("cowork.host.doneHint")}
                        onClick={async () => {
                          try {
                            await cowork.resolveHostRequest(req.id);
                          } catch {
                            toast.error(t("cowork.host.doneError"));
                          }
                        }}
                      >
                        <Check className="h-3 w-3 mr-0.5" /> {is1on1 ? t("common.close") : t("cowork.host.done")}
                      </Button>
                      {req.status === "acknowledged" && is1on1 && (
                        <Button size="sm" variant="ghost" className="h-5 text-[10px] text-primary rounded-full" onClick={() => {
                          setOneOnOneRequestId(req.id);
                          setOneOnOneRoom(req.oneone_livekit_room!);
                          setOneOnOneName(cowork.profiles[req.user_id] || "User");
                          setHubMinimized(true);
                        }}>
                          {t("cowork.host.joinPrivate")}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </section>

          {/* En pausa (baño). Amarillo y con el tiempo corriendo, para ver de un
              vistazo quién se levantó y hace cuánto. El estado vive en presence:
              no queda registro de las idas al baño de nadie. */}
          {(() => {
            const enPausa = Object.entries(mediaStates)
              .filter(([, st]) => st.onBreak && st.breakStartedAt)
              .map(([uid, st]) => {
                const sala = cowork.assignments.find((a) => a.user_id === uid && a.is_active);
                return {
                  uid,
                  nombre: cowork.profiles[uid] || "User",
                  segundos: Math.max(0, Math.floor((now - (st.breakStartedAt as number)) / 1000)),
                  sala: cowork.rooms.find((r) => r.id === sala?.room_id)?.name,
                  cuenta: cuentaPausa(
                    Math.max(0, Math.floor((now - (st.breakStartedAt as number)) / 1000)),
                    limitesPausa[st.breakKind === "break" ? "break" : st.breakKind === "almuerzo" ? "almuerzo" : "bano"],
                    st.breakKind === "bano" ? (st.banoConsumidoSeg ?? 0) : 0,
                  ),
                };
              })
              .sort((a, b) => b.segundos - a.segundos);
            if (!enPausa.length) return null;
            return (
              <section className="mx-3 mt-3 space-y-2 rounded-2xl border border-border/60 bg-background/50 p-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-warning/15 text-warning"><Coffee className="h-3.5 w-3.5" /></span>
                  <h3 className="text-xs font-semibold text-foreground">{t("common.paused")}</h3>
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{enPausa.length}</span>
                </div>
                {enPausa.map((p) => (
                  <div key={p.uid} className="bg-warning/10 rounded-xl px-2 py-1.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <UserAvatar name={p.nombre} src={cowork.avatares[p.uid]?.src} seed={cowork.avatares[p.uid]?.seed} size="sm" />
                      <span className="text-xs text-foreground/90 truncate">{p.nombre}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {p.sala && (
                        <Badge variant="outline" className="text-[9px] border-warning/30 text-warning rounded-full">
                          {p.sala}
                        </Badge>
                      )}
                      <span className={cn("text-[11px] font-mono tabular-nums", clasesPausa(p.cuenta.estado))}>
                        {p.cuenta.texto}
                      </span>
                    </div>
                  </div>
                ))}
              </section>
            );
          })()}

          {/* Supervisores en pausa (break / lunch / ausente desde la tacita del
              Hub). Aquí SÍ con el tiempo: lo ven los supervisores entre sí; los
              chatters solo ven la pantalla sin contador (Jhon, 10/09). */}
          {(() => {
            const sups = Object.entries(supervisores)
              .filter(([, e]) => esEstadoSupervisor(e))
              .map(([uid, e]) => ({
                uid,
                nombre: nombreYApellido(cowork.profiles[uid]) || "Supervisor",
                etiqueta: esEstadoSupervisor(e) ? t(ETIQUETA_SUPERVISOR[e]) : "",
                desde: supervisoresDesde[uid] ?? null,
              }));
            if (!sups.length) return null;
            return (
              <div className="p-3 border-t border-border/50 space-y-2">
                <h3 className="text-xs font-medium text-warning flex items-center gap-1">
                  <Coffee className="h-3 w-3" /> {t("cowork.host.supervisorsPaused", { n: sups.length })}
                </h3>
                {sups.map((s) => (
                  <div key={s.uid} className="bg-warning/10 rounded-xl p-2.5 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs text-foreground/80">{s.nombre}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className="text-[9px] border-warning/30 text-warning rounded-full">{s.etiqueta}</Badge>
                      {s.desde != null && (
                        <span className="text-[11px] font-mono tabular-nums text-warning"><Cronometro desde={s.desde} /></span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ¿Quién ya tiene la app? (Alvaro, 18/11/2026): desde el viernes
              Cowork en el computador va solo en la app; aquí se ve quién falta
              para empujarlo uno por uno (AppDelEquipo.tsx). */}
          <ResumenAppDelEquipo
            uids={fichas.flatMap((f) => f.participants.map((a) => a.user_id))}
            mediaStates={mediaStates}
            nombreDe={(uid) => nombreYApellido(cowork.profiles[uid]) || t("cowork.common.someone")}
            avatares={cowork.avatares}
            onEscribir={escribirA}
          />

          {/* Quién está EN las salas ahora (los asignados que el monitor ve), con
              su estado —verde trabajando, naranja en baño o break, violeta en meet
              grupal— y el monitorcito si comparte pantalla. Antes la lista era solo
              "quién comparte pantalla": como la pausa apaga la pantalla, la gente
              en break desaparecía de la lista justo cuando más importaba verla
              (Jhon, 10/09). */}
          <section className="mx-3 my-3 space-y-2 rounded-2xl border border-border/60 bg-background/50 p-3">
            {(() => {
              const filas = fichas.flatMap(({ room, participants }) => participants.map((a) => {
                const uid = a.user_id;
                const pausa = pausaDe(uid);
                return {
                  key: `${room.id}-${uid}`,
                  uid,
                  room,
                  nombre: nombreYApellido(cowork.profiles[uid]) || t("cowork.common.someone"),
                  kindPausa: pausa ? pausa.kind : null,
                  enMeet: !!meetDe(uid),
                  comparte: (roomSharerIds[room.id] ?? []).includes(uid),
                };
              }));
              return (
                <>
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-primary"><Users2 className="h-3.5 w-3.5" /></span>
                    <h3 className="text-xs font-semibold text-foreground">{t("cowork.host.inRooms")}</h3>
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{filas.length}</span>
                  </div>
                  {filas.length === 0 && <p className="px-1 text-xs text-muted-foreground">{t("cowork.host.nobodyInRooms")}</p>}
                  {filas.map((f) => (
                    <div key={f.key} className={cn("flex items-center gap-2 rounded-xl px-2 py-1.5", f.kindPausa ? "bg-warning/10" : "bg-primary/5")}>
                      <UserAvatar name={cowork.profiles[f.uid]} src={cowork.avatares[f.uid]?.src} seed={cowork.avatares[f.uid]?.seed} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn("h-2 w-2 shrink-0 rounded-full", f.kindPausa ? "bg-warning" : f.enMeet ? "bg-primary" : "bg-success")}
                            title={f.kindPausa ? t(f.kindPausa === "break" ? "cowork.host.status.onBreak" : f.kindPausa === "almuerzo" ? "cowork.host.status.atLunch" : "cowork.host.status.inBathroom") : f.enMeet ? t("cowork.pauseTile.inMeet") : t("cowork.host.status.working")}
                          />
                          <span className="truncate text-xs text-foreground/90">{f.nombre}</span>
                          <MarcaApp estado={mediaStates[f.uid]} />
                        </div>
                        <span className="block truncate text-[10px] text-primary/80">
                          {f.room.name}{f.kindPausa ? ` · ${t(NOMBRE_PAUSA[f.kindPausa])}` : f.enMeet ? ` · ${t("cowork.meet.title")}` : ""}
                        </span>
                      </div>
                      <span className="shrink-0" title={f.comparte ? t("cowork.host.sharingScreen") : t("cowork.host.notSharingScreen")}>
                        {f.comparte ? <Monitor className="h-3.5 w-3.5 text-primary" /> : <MonitorOff className="h-3.5 w-3.5 text-muted-foreground/40" />}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-lg text-muted-foreground hover:text-foreground" title={t("cowork.host.more")}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => escribirA(f.uid)}>
                            <MessageCircle className="mr-2 h-4 w-4" /> {t("cowork.host.messageOnMessenger")}
                          </DropdownMenuItem>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger disabled={moviendo === f.uid}>
                              {moviendo === f.uid
                                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                : <ArrowRightLeft className="mr-2 h-4 w-4" />}
                              {t("cowork.host.moveToRoom")}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-52">
                              {cowork.rooms.length <= 1 && (
                                <DropdownMenuItem disabled>{t("cowork.host.moveToRoomNoOther")}</DropdownMenuItem>
                              )}
                              {cowork.rooms.length > 1 && cowork.rooms.map((r) => (
                                <DropdownMenuItem
                                  key={r.id}
                                  disabled={r.id === f.room.id || !!moviendo}
                                  onClick={() => void moverASala(f.uid, r.id)}
                                >
                                  {r.id === f.room.id
                                    ? <Check className="mr-2 h-4 w-4 text-primary" />
                                    : <span className="mr-2 h-4 w-4" />}
                                  <span className="truncate">{r.name}</span>
                                  {r.id === f.room.id && (
                                    <span className="ml-auto pl-2 text-[10px] text-muted-foreground">{t("cowork.host.moveToRoomCurrent")}</span>
                                  )}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </>
              );
            })()}
          </section>
        </ScrollArea>
      </div>

      {/* Main content area — solo las llamadas 1:1 viven acá; las SALAS viven en su
          ventana persistente (abajo) para que navegar no las cuelgue. */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {oneOnOneRoom && oneOnOneRequestId ? (
          <div className="flex-1 min-h-0">
            <LiveKitCallView
              key={oneOnOneRoom}
              roomName={oneOnOneRoom}
              displayName={displayName}
              callDisplayName={oneOnOneName ? t("cowork.host.privateCallWith", { name: oneOnOneName }) : t("cowork.host.privateCall")}
              isAdmin={false}
              onLeave={() => { leaveOneOnOne(); }}
              hideShareLink
              suppressLeaveToast
              // Adentro de la sala no se abre una segunda pantalla: si quiere
              // mostrar la suya, la manda con el botón de la tarjeta.
              hideScreenShare={unaSolaPantalla && !activeMeetId}
              autoLeaveOnEmpty={3000}
              initialMicOn={false}
              initialCamOn={false}
              getToken={getOneOnOneToken}
              leaveLabel={t("cowork.host.returnToDashboard")}
              leaveIcon={ArrowLeft}
            />
          </div>
        ) : (
          <div className="call-ambiente flex-1 overflow-y-auto overflow-x-hidden p-3 pt-14 pb-28 md:p-6 md:pb-32">
            {/* Barrita de consola, como el cuadrito del homepage: semáforo,
                «en vivo» latiendo, el conteo y el reloj de pared. Mismo look en
                teléfono y computadora. */}
            <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-border/70 bg-card/50 px-3.5 py-2 [box-shadow:inset_0_1px_0_hsl(0_0%_100%/.05)]">
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-destructive/70" />
                <span className="h-2 w-2 rounded-full bg-warning/70" />
                <span className="h-2 w-2 rounded-full bg-success/70" />
              </span>
              <span className="font-mono text-xs tracking-wide text-muted-foreground">cowork</span>
              <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-success">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                </span>
                {t("cowork.host.consola.live")}
              </span>
              <span className="hidden min-w-0 truncate font-mono text-[11px] text-muted-foreground/70 sm:inline">{t("cowork.host.consola.estado", { n: enSalas, m: salasHablando })}</span>
              <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/60">{relojPared}</span>
            </div>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold leading-tight text-foreground">{t("cowork.create.rooms")}</h2>
                <p className="text-sm text-muted-foreground">{fraseDeSalas}</p>
              </div>
              {/* Los cuatro botones globales fijan TODAS las salas de un golpe. Una
                  palabra cada uno (Jhon, 10/09: "ocupan mucho espacio"): el estado
                  lo dice el color, no el texto. En el teléfono, solo el icono. */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className={`gap-1.5 rounded-full h-8 ${todasEscuchando ? "" : "text-destructive border-destructive/40"}`}
                  title={todasEscuchando
                    ? t("cowork.host.all.listeningHint")
                    : t("cowork.host.all.listenHint")}
                  onClick={() => fijarEscuchaDeTodas(!todasEscuchando)}
                >
                  {todasEscuchando ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{t("cowork.host.listen")}</span>
                </Button>
                <Button
                  size="sm"
                  variant={hablandoATodas ? "default" : "outline"}
                  className={`gap-1.5 rounded-full h-8 ${
                    hablandoATodas
                      // Verde solo si de verdad te están oyendo. Un botón en
                      // verde con el micro caído es peor que no tener botón.
                      ? (micCaido
                          ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground border-transparent animate-pulse"
                          : "bg-success hover:bg-success/90 text-success-foreground border-transparent")
                      : ""
                  }`}
                  title={micCaido
                    ? (micCaido === "muerto"
                        ? t("cowork.host.all.micDeadHint")
                        : t("cowork.host.all.micTakenHint"))
                    : hablandoATodas
                      ? t("cowork.host.all.talkingHint")
                      : t("cowork.host.all.talkHint")}
                  onClick={() => fijarMicDeTodas(!hablandoATodas)}
                >
                  {hablandoATodas && !micCaido ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{micCaido ? t("cowork.host.micDown") : t("cowork.host.talk")}</span>
                </Button>
                {/* Cámara y pantalla a todas: mismo modelo que escuchar/hablar —
                    el global fija todas y después se apagan salas individuales. */}
                <Button
                  size="sm"
                  variant={camaraATodas ? "default" : "outline"}
                  className={`gap-1.5 rounded-full h-8 ${camaraATodas ? "bg-success hover:bg-success/90 text-success-foreground border-transparent" : ""}`}
                  title={camaraATodas
                    ? t("cowork.host.all.cameraOnHint")
                    : t("cowork.host.all.cameraHint")}
                  onClick={() => fijarCamDeTodas(!camaraATodas)}
                >
                  {camaraATodas ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{t("cowork.host.camera")}</span>
                </Button>
                {/* Difuminar el fondo de la cámara que ven las salas (18/11/2026).
                    Es la misma preferencia de las llamadas; con la cámara al
                    aire el cambio se ve en vivo. Verde = difuminado puesto. */}
                <Button
                  size="sm"
                  variant={esBlur(fondo) ? "default" : "outline"}
                  disabled={!puedeDifuminar}
                  aria-pressed={esBlur(fondo)}
                  aria-label={t("cowork.host.blur")}
                  data-boton="difuminar-fondo"
                  className={`gap-1.5 rounded-full h-8 ${esBlur(fondo) ? "bg-success hover:bg-success/90 text-success-foreground border-transparent" : ""}`}
                  title={!puedeDifuminar
                    ? t("cowork.host.blurUnsupported")
                    : esBlur(fondo)
                      ? t("cowork.host.all.blurOnHint")
                      : t("cowork.host.all.blurHint")}
                  onClick={alternarDifuminado}
                >
                  {preparandoFondo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{t("cowork.host.blur")}</span>
                </Button>
                {!unaSolaPantalla && (
                <Button
                  size="sm"
                  variant={pantallaATodas ? "default" : "outline"}
                  className={`gap-1.5 rounded-full h-8 ${pantallaATodas ? "bg-success hover:bg-success/90 text-success-foreground border-transparent" : ""}`}
                  title={pantallaATodas
                    ? t("cowork.host.all.screenOnHint")
                    : t("cowork.host.all.screenHint")}
                  onClick={() => fijarScreenDeTodas(!pantallaATodas)}
                >
                  {pantallaATodas ? <ScreenShare className="h-3.5 w-3.5" /> : <ScreenShareOff className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{t("cowork.host.screen")}</span>
                </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-full h-8 shrink-0"
                  title={t("cowork.host.meetHint")}
                  onClick={() => setMeetDialogOpen(true)}
                >
                  <Video className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Meet</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 rounded-full h-8 shrink-0"
                  title={t("cowork.host.addRoom")}
                  onClick={() => { setAddName(""); setAddOpen(true); }}
                >
                  <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("cowork.host.addRoom")}</span>
                </Button>
              </div>
            </div>
            {/* La grilla se llena sola: en un monitor grande entran cinco o
                seis salas por fila y todas quedan a la vista; en una ventana
                angosta bajan a dos; en el teléfono son dos miniaturas por fila
                CON su video (diseño v5 aprobado por Álvaro, 26/10). */}
            <div className="grid grid-cols-2 gap-2 md:gap-4 md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(360px,1fr))]">
              {/* Meets grupales abiertos: una tarjeta cada uno, antes de las salas,
                  con su gente y el tiempo. Cualquier supervisor puede entrar; el
                  que lo invocó lo termina al colgar. */}
              {cowork.meets.map((meet) => {
                const gente = meet.participantes.filter((p) => !p.left_at);
                const dentro = activeMeetId === meet.id;
                if (isMobile) {
                  return (
                    <button
                      key={`meet-${meet.id}`}
                      data-meet={meet.id}
                      type="button"
                      disabled={dentro}
                      onClick={() => entrarAlMeet(meet)}
                      className="col-span-2 flex w-full items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 px-3 py-2.5 text-left transition-colors active:bg-primary/10 disabled:opacity-60"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><Video className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-display text-sm font-semibold text-foreground">{t("cowork.meet.title")}</span>
                        <span className="block truncate text-xs text-muted-foreground">{gente.map((p) => nombreYApellido(cowork.profiles[p.user_id])).join(", ") || t("cowork.host.everyoneBack")}</span>
                      </div>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-primary"><Cronometro desde={Date.parse(meet.started_at)} /></span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                    </button>
                  );
                }
                return (
                  <div key={`meet-${meet.id}`} data-meet={meet.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-primary/40 bg-card">
                    <div className="flex h-10 items-center gap-2 px-3">
                      <Video className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="min-w-0 truncate font-display text-sm font-semibold text-foreground">{t("cowork.meet.title")}</span>
                      <span className="ml-auto inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground" title={t("cowork.host.inMeetCount", { n: gente.length })}>
                        <Users2 className="h-3 w-3" />{gente.length}
                      </span>
                    </div>
                    <div className="mx-2 mb-2 flex aspect-[4/3] flex-col items-center justify-center gap-1 overflow-hidden rounded-xl bg-primary/10 px-3 text-center md:mx-0 md:mb-0 md:aspect-video md:rounded-none">
                      <div className="font-display text-2xl font-bold tabular-nums text-primary"><Cronometro desde={Date.parse(meet.started_at)} /></div>
                      <div className="text-[11px] text-muted-foreground">{t("cowork.pauses.calledBy", { name: nombreYApellido(cowork.profiles[meet.created_by]) || t("cowork.host.aSupervisor") })}</div>
                      <div className="line-clamp-2 text-[11px] text-foreground/80">{gente.map((p) => nombreYApellido(cowork.profiles[p.user_id])).join(", ") || t("cowork.host.everyoneBack")}</div>
                    </div>
                    <div className="hidden md:flex items-center gap-1 px-2 py-2">
                      <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs text-destructive hover:text-destructive" onClick={() => { void terminarMeetGrupal(meet.id, "terminado").catch((e: unknown) => toast.error(e instanceof Error ? e.message : t("cowork.host.endMeetError"))); if (dentro) leaveActiveRoom(); }}>
                        {t("cowork.host.endMeetShort")}
                      </Button>
                      <Button variant="secondary" size="sm" className="ml-auto h-8 gap-1.5 rounded-lg text-xs" disabled={dentro} onClick={() => entrarAlMeet(meet)}>
                        <DoorOpen className="h-3.5 w-3.5" /> {dentro ? t("cowork.host.youreIn") : t("cowork.common.enter")}
                      </Button>
                    </div>
                  </div>
                );
              })}
              {fichas.map(({ room, asignados, participants, pausaSala }) => {
                const speakers = roomSpeakers[room.id] ?? [];
                const etiquetas = etiquetasDe(participants, !pausaSala);
                const personas = personasDe(participants);
                const manejadores = manejadoresDe(room.id);
                const monitor = (showVideo: boolean) => (
                  <CoworkRoomMonitor
                    roomId={room.id}
                    roomName={room.name}
                    issueToken={cowork.issueLiveKitToken}
                    showVideo={showVideo}
                    showNames={false}
                    // UNA sola pantallita por tarjeta (la de arriba): el botón
                    // de swap de cada tile se apaga aquí (duplicado = feo).
                    conBotonDePantalla={false}
                    // Controla la vista desde la pantallita de la cabecera, en
                    // teléfono Y escritorio: por defecto la cámara; al tocarla
                    // muestra la PANTALLA compartida en la propia tarjeta
                    // (Álvaro, 26/10 — "que me deje ver la pantalla ahí en
                    // chiquito, no que me lleve"). Explícito (no undefined) para
                    // que el toque mande y no choque con el salto automático.
                    verPantalla={!!verPantallaDe[room.id]}
                    hearOn={hearFor(room.id)}
                    broadcastOn={broadcastFor(room.id)}
                    micBaseTrack={micBaseTrack}
                    camOn={camFor(room.id)}
                    camBaseTrack={camBaseTrack}
                    screenOn={screenFor(room.id)}
                    screenBaseTrack={baseDePantalla}
                    // Apagado también cuando SU hoja está abierta, sin mirar
                    // isMobile: si el viewport cruza el breakpoint con la hoja
                    // abierta, dos monitores de la misma sala comparten
                    // identidad en LiveKit y uno patea al otro.
                    enabled={activeRoomId !== room.id && salaEnHoja !== room.id}
                    onSharersChange={manejadores.sharers}
                    onSpeakingChange={manejadores.speaking}
                    onParticipantsChange={manejadores.participants}
                  />
                );

                const alguienComparte = participants.some((a) => mediaStates[a.user_id]?.screenShareOn);
                // Si la sala pidió NO mostrar video en el tablero («Mostrar
                // video en vivo» apagado), eso se respeta TAMBIÉN en pausa.
                const modoVideo = (room.preview_mode ?? "video") === "video";
                // La cuenta de la pausa para la línea de abajo de la tarjeta
                // (v5): regresiva, la MISMA que ve la persona en su pantalla.
                const cuentaSala = pausaSala ? cuentaPausa(pausaSala.segundos, pausaSala.limiteMin, pausaSala.consumidoSeg) : null;
                const pausaTxt = pausaSala
                  ? pausaSala.kind === "bano"
                    ? t("cowork.pause.bano")
                    : pausaSala.kind === "almuerzo"
                      ? t("cowork.pause.almuerzo")
                      : pausaSala.kind === "meet"
                        ? t("cowork.meet.title")
                        : t("cowork.pause.break")
                  : null;

                return (
                  <div
                    key={room.id}
                    data-sala={room.id}
                    role={isMobile ? "button" : undefined}
                    tabIndex={isMobile ? 0 : undefined}
                    // En el teléfono la tarjeta entera abre su hoja de controles.
                    // Un toque sobre un botón de adentro (el de ver la pantalla
                    // compartida) hace lo suyo y no abre nada.
                    onClick={isMobile ? (e) => { if ((e.target as HTMLElement).closest("button")) return; setSalaEnHoja(room.id); } : undefined}
                    onKeyDown={isMobile ? (e) => { if ((e.target as HTMLElement).closest("button")) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSalaEnHoja(room.id); } } : undefined}
                    className={cn(
                      // card-estudio: la misma elevación de set que los tiles de la
                      // llamada (sombra honda + filo de luz), conservando bg-card y
                      // el borde verde al hablar.
                      "card-estudio flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card/55 backdrop-blur-xl transition-colors",
                      // Verde cuando alguien está HABLANDO ahora: es lo único que
                      // amerita pintar la tarjeta. Compartir pantalla es lo normal
                      // y ya no colorea el borde; lo anormal (no compartir) sale
                      // como etiqueta sobre el video.
                      speakers.length ? "card-estudio--viva border-success" : "border-border",
                      // Vacía: borde punteado y apagada (v5) — se distingue sin gritar.
                      participants.length === 0 && "border-dashed opacity-80",
                      isMobile && "cursor-pointer active:bg-muted/40",
                    )}
                  >
                    {/* Cabecera FUERA del cuadro del video (Álvaro, 26/10): el
                        nombre arribita, y a la derecha la pantallita (iconito
                        discreto, verde solo si esa sala comparte) y los tres
                        puntitos. El video queda limpio; el código de sala sigue
                        en ⋯ → «Copiar código». */}
                    <div className="flex h-9 shrink-0 items-center gap-1 pl-3 pr-1.5">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{tituloBonito(room.name)}</span>
                      {participants.length > 1 && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground" title={t("cowork.host.inRoomCount", { n: participants.length })}>
                          <Users2 className="h-3 w-3" />{participants.length}
                        </span>
                      )}
                      {/* La pantallita: en teléfono Y escritorio, tocarla
                          muestra la PANTALLA compartida de esa sala aquí mismo,
                          en la miniatura (tócala otra vez y vuelve la cámara).
                          NO te lleva a ningún lado — stopPropagation para que no
                          dispare el toque de la tarjeta (Álvaro, 26/10). Verde
                          solo como señal de que esa sala está compartiendo. */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setVerPantallaDe((m) => ({ ...m, [room.id]: !m[room.id] })); }}
                        className={cn(
                          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted/60",
                          verPantallaDe[room.id]
                            ? "bg-muted/70 text-foreground"
                            : alguienComparte ? "text-success" : "text-muted-foreground/50",
                        )}
                        aria-label={verPantallaDe[room.id]
                          ? t("cowork.monitor.viewCamera")
                          : alguienComparte
                            ? t("cowork.monitor.viewScreen")
                            : t("cowork.host.screen")}
                        title={verPantallaDe[room.id]
                          ? t("cowork.monitor.viewCamera")
                          : alguienComparte
                            ? t("cowork.monitor.viewScreen")
                            : t("cowork.host.screen")}
                      >
                        <Monitor className="h-3.5 w-3.5" />
                      </button>
                      {/* El megáfono del Avisar: su propio botón en cada sala
                          (Álvaro, 26/10), violeta para que no se confunda con
                          escuchar la sala. Cosa aparte. */}
                      {puedeAvisar && (
                        <button
                          type="button"
                          disabled={participants.length === 0}
                          onClick={(e) => { e.stopPropagation(); setAvisarSala(room.id); }}
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-violet-300/80 transition-colors hover:bg-violet-500/15 hover:text-violet-200 disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={t("cowork.avisar.trigger")}
                          title={t("cowork.avisar.trigger")}
                        >
                          <Megaphone className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                            title={t("cowork.host.roomMenu")}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {/* Primero lo que se hace con los puntitos: ENTRAR a
                              donde esa persona, y AVISARLE con la voz. */}
                          <DropdownMenuItem onClick={() => enterRoom(room.id)}>
                            <DoorOpen className="mr-2 h-4 w-4" /> {t("cowork.host.enterRoom")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => copiarEnlaceDeSala(room)}>
                            <Link2 className="mr-2 h-4 w-4" /> {t("cowork.host.copyParticipantLink")}
                          </DropdownMenuItem>
                          {room.join_code && (
                            <DropdownMenuItem onClick={() => copiarCodigoDeSala(room)}>
                              <KeyRound className="mr-2 h-4 w-4" /> {t("cowork.host.copyCode")} <span className="ml-auto font-mono text-xs text-muted-foreground">{room.join_code}</span>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => openEdit(room)}>
                            <Pencil className="mr-2 h-4 w-4" /> {t("cowork.host.editRoom")}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setCloseTarget(room)}>
                            <X className="mr-2 h-4 w-4" /> {t("cowork.host.closeRoom")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {/* El cuadro del video, limpio, a 4:3 en el teléfono (a
                        175 px, 16:9 daban 98 px y la pausa no cabía). */}
                    <div className={cn(
                      "relative aspect-[4/3] overflow-hidden md:aspect-video",
                      participants.length === 0 ? "bg-black/35" : "bg-black/40",
                    )}>
                      {participants.length === 0 ? (
                        <>
                          {/* Placeholder con GLOW cuando no hay cámara/gente
                              (look aprobado por Alvaro): círculo de vidrio con
                              glow de acento, en vez del negro plano. */}
                          <div className="relative flex h-full flex-col items-center justify-center gap-2.5 text-muted-foreground/70">
                            <div className="relative">
                              <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-primary/30 blur-2xl" />
                              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm">
                                <Users2 className="h-5 w-5" />
                              </div>
                            </div>
                            <span className="text-xs">{t("cowork.host.noParticipants")}</span>
                          </div>
                          {/* El monitor sigue MONTADO aunque no vea a nadie. Antes se
                              desmontaba aquí, y como es él quien avisa quién está, ya no
                              podía avisar que alguien llegó (o volvió tras un corte de
                              red): la sala quedaba "Sin participantes" y sin pantalla
                              hasta recargar el tablero (Jhon, 10/09). Solo si hay
                              asignados: una sala vacía de verdad no gasta conexión. */}
                          {asignados.length > 0 && monitor(false)}
                        </>
                      ) : pausaSala && modoVideo ? (
                        // En pausa el video SIGUE, apenas atenuado (diseño v5,
                        // Álvaro 26/10): nada encimado en el centro — el estado
                        // va en la línea de abajo, donde iba el reloj.
                        <div className="h-full w-full [filter:saturate(.5)_brightness(.55)]">{monitor(true)}</div>
                      ) : !modoVideo ? (
                        // Modo avatares (con o sin pausa): NUNCA video; en pausa
                        // los avatares se atenúan igual que el video.
                        <div className={cn("h-full w-full", pausaSala && "[filter:saturate(.5)_brightness(.55)]")}>
                          <div className="flex h-full flex-wrap items-center justify-center gap-4 p-3">
                            {participants.map((a) => {
                              const ms = mediaStates[a.user_id];
                              return (
                                <div key={a.user_id} className="flex flex-col items-center gap-1">
                                  <UserAvatar name={cowork.profiles[a.user_id]} src={cowork.avatares[a.user_id]?.src} seed={cowork.avatares[a.user_id]?.seed} size="lg" status={isOnline(a.user_id) ? "online" : "away"} />
                                  <span className="max-w-[120px] truncate text-[11px] text-muted-foreground">{nombreYApellido(cowork.profiles[a.user_id])}</span>
                                  {ms && (
                                    <div className="flex items-center gap-1.5">
                                      {ms.micOn ? <Mic className="h-3 w-3 text-success" /> : <MicOff className="h-3 w-3 text-destructive/70" />}
                                      {ms.camOn ? <Video className="h-3 w-3 text-success" /> : <VideoOff className="h-3 w-3 text-destructive/70" />}
                                      {ms.screenShareOn && <Monitor className="h-3 w-3 text-primary" />}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {/* En modo avatares el monitor sigue conectado SOLO para el audio (sin video). */}
                          {monitor(false)}
                        </div>
                      ) : (
                        monitor(true)
                      )}


                      {etiquetas.length > 0 && (
                        <div className="pointer-events-none absolute left-2 top-2 z-10 flex max-w-[80%] flex-col items-start gap-1">
                          {etiquetas.map((e) => (
                            <span
                              key={e.key}
                              className={cn("inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium backdrop-blur-sm", TONO_ETIQUETA[e.tono])}
                            >
                              <e.icono className="h-3 w-3 shrink-0" />
                              <span className="truncate">{e.texto}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Línea de abajo (v5): nombre corto y reloj en gris
                          discreto sobre un degradado suave — sin cajitas. En
                          pausa, el estado toma el lugar del reloj: «Baño · 2:33»
                          en ámbar, y en rojo si ya se pasó. */}
                      {(pausaSala || (personas.length === 1 && modoVideo)) && participants.length > 0 && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-baseline gap-2 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6">
                          <span className="min-w-0 truncate text-xs text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">
                            {personas.map((p) => nombreCorto(p.nombre)).join(", ")}
                          </span>
                          {pausaSala && cuentaSala ? (
                            <span className={cn("ml-auto shrink-0 text-[11px] font-medium tabular-nums [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]", pausaSala.excedida ? "text-destructive" : "text-warning")}>
                              {pausaTxt} · {cuentaSala.texto}
                            </span>
                          ) : personas[0]?.reloj ? (
                            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-white/55" title={personas[0].corre ? t("cowork.host.clockRunning") : t("cowork.host.clockStopped", { reason: personas[0].motivo ?? "—" })}>
                              <RelojDePersona reloj={personas[0].reloj} />
                            </span>
                          ) : null}
                        </div>
                      )}

                    </div>

                    {/* Con dos o más personas los chips encimados tapaban el video de
                        la tercera (Jhon, 10/09). Van listadas DEBAJO del video, cada una
                        con su reloj; sobre el video solo queda quien está solo. */}
                    {personas.length > 1 && !pausaSala && (room.preview_mode ?? "video") === "video" && (
                      <ul className="mx-2 mb-2 divide-y divide-border/40 rounded-xl bg-muted/30 px-2 md:mx-0 md:mb-0 md:rounded-none md:border-t md:border-border/40 md:bg-transparent md:px-3">
                        {personas.map((p) => (
                          <li key={p.uid} className="flex items-center gap-1.5 py-1 text-[11px]">
                            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", p.online ? "bg-success" : "bg-muted-foreground/40")} />
                            <span className="min-w-0 flex-1 truncate text-foreground/90">{nombreCorto(p.nombre)}</span>
                            {p.reloj && (
                              <span className="shrink-0 tabular-nums text-muted-foreground" title={p.corre ? t("cowork.host.clockRunning") : t("cowork.host.clockStopped", { reason: p.motivo ?? "—" })}>
                                <RelojDePersona reloj={p.reloj} />
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Una fila: los cuatro controles de la sala y Entrar. Solo
                        en escritorio; en el teléfono viven en la hoja inferior. */}
                    <div className="hidden md:flex items-center gap-1 px-2 py-2">
                      {participants.length > 0 && (
                        <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted/40 p-0.5">
                          {controlesDeSala(room, false)}
                        </div>
                      )}
                      <div className="ml-auto flex items-center gap-1.5">
                        {/* Avisar vive ahora en el megáfono de la cabecera; aquí
                            solo queda Entrar. */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-lg border border-primary/40 bg-primary/15 px-4 text-xs font-semibold text-primary hover:bg-primary/25 hover:text-primary"
                          onClick={() => enterRoom(room.id)}
                        >
                          {t("cowork.common.enter")}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sala activa a PANTALLA COMPLETA. Salir ("Volver al dashboard" o el rojo) la
          cuelga — sin ventanita de sala: la única miniatura es la del Hub, y los videos
          de las salas ya se ven en vivo en las cards del dashboard.
          En el teléfono ocupa toda la pantalla y deja libre la franja del reloj y la
          batería (pt-safe): la barra de "Volver al dashboard" quedaba debajo (Jhon,
          10/09). En escritorio, la ventana con margen de siempre. */}
      {activeRoomLk && activeRoomId && (
        <div className="fixed inset-0 z-[110] flex flex-col overflow-hidden border-border bg-card pt-safe pb-safe md:inset-4 md:rounded-2xl md:border md:shadow-2xl">
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted border-b border-border shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
              <DoorOpen className="h-3 w-3" />
              {nombreSalaActiva || t("cowork.common.room")}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                className="h-6 gap-1 rounded-full px-2.5 text-[11px]"
                onClick={leaveActiveRoom}
                title={t("cowork.host.leaveRoomHint")}
              >
                <ArrowLeft className="h-3 w-3" /> {t("cowork.common.backToDashboard")}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-destructive hover:text-destructive/80"
                onClick={leaveActiveRoom}
                title={t("cowork.host.hangUpCall")}
              >
                <PhoneOff className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <LiveKitCallView
              key={activeRoomLk}
              roomName={activeRoomLk}
              displayName={displayName}
              callDisplayName={nombreSalaActiva || undefined}
              isAdmin={true}
              // Una sala de Cowork no se termina desde adentro de la llamada.
              hideEndForAll
              onLeave={leaveActiveRoom}
              recording={{ source: "cowork", title: activeRoomName || undefined }}
              hideShareLink
              suppressLeaveToast
              // En el meet grupal el supervisor entra hablando y con cámara; en una
              // sala, como siempre, apagado.
              initialMicOn={!!activeMeetId}
              initialCamOn={!!activeMeetId}
              // Entrar a una sala no lo saca de la vigilancia del Hub.
              sinLatidoDeLlamada={unaSolaPantalla}
              // …y lo que tenga prendido aquí también cuenta para su latido.
              onMediaStateChange={vigilarAnfitrion ? (m) => {
                medioSalaRef.current = { camOn: m.camOn, screenShareOn: m.screenShareOn, conexionSala: m.conexionSala ?? null };
                empujarMedios();
              } : undefined}
              getToken={getActiveRoomToken}
              leaveLabel={activeMeetId ? t("cowork.host.endMeet") : t("cowork.host.hangUp")}
              // Flechas + lista para moverse entre las SALAS de esta sesión sin
              // volver al dashboard (Jhon, 10/09: cambiar de sesión se hace solo
              // desde el Supervisor Hub). Moverse = "Entrar" a la otra: la actual
              // se cuelga y a la nueva llegás con el micro apagado. En el meet
              // grupal no hay flechas: se sale con "Terminar meet".
              roomSwitcher={activeMeetId ? undefined : {
                rooms: cowork.rooms.map((r) => ({ id: r.id, name: r.name })),
                currentId: activeRoomId,
                onSwitch: enterRoom,
              }}
            />
          </div>
        </div>
      )}

      {/* HUB EN VENTANA FLOTANTE DEL SO (Document PiP): always-on-top real, movible a
          cualquier monitor, resize nativo. Portalizamos el call view a esa ventana. */}

      {/* Ventanita del Hub DENTRO de Maven (cuando NO está en ventana flotante).
          Arrastrable, redimensionable por la esquina, y con pop-out a ventana del SO. */}
      {hubConnected && cowork.session?.host_hub_livekit_room && (
        <>
          {hubMinimized && (() => {
            // El dorado es la seña del Hub desde siempre (Jhon lo pidió de
            // vuelta el 10/09): un disco dorado con los audífonos sobre el mismo
            // vidrio que la nubecita del Messenger, a su misma altura, para que
            // se lea como de la misma familia. Colgado del ancla del muelle se
            // posiciona absoluto (no ensancha la pila) y se alinea hacia adentro
            // según el lado en que esté el muelle.
            const lado = anclaMuelle?.dataset.lado === "izquierda" ? "left-0" : "right-0";
            const boton = (
              <button
                type="button"
                title={t("cowork.host.showHub")}
                aria-label={t("cowork.host.showHub")}
                onClick={() => setHubMinimized(false)}
                className={cn(
                  "glass-panel group flex h-10 items-center gap-2 rounded-full pl-1.5 pr-3.5 text-foreground",
                  "ring-1 ring-warning/35 shadow-[0_8px_22px_-10px_hsl(var(--warning)/.55)]",
                  "transition-transform hover:scale-105 active:scale-95 motion-reduce:transition-none",
                  anclaMuelle && `absolute bottom-0 ${lado}`,
                  salaEnHoja && "invisible",
                )}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-warning/15 text-warning transition-colors group-hover:bg-warning/25">
                  <Headphones className="h-4 w-4" />
                </span>
                <span className="text-[13px] font-semibold">Hub</span>
              </button>
            );
            return anclaMuelle
              ? createPortal(boton, anclaMuelle)
              : <div className={`fixed right-4 bottom-4 tactil:bottom-24 ${hubPinned ? "z-[120]" : "z-30"}`}>{boton}</div>;
          })()}
        <div
          className={cn(
            "fixed flex flex-col items-end",
            // En el teléfono la hoja va por ENCIMA del muelle de burbujas (z-50):
            // si no, la nube de Chats y Clari se montan sobre sus controles.
            // Minimizado, el Hub vuelve a ser la píldora del muelle.
            hubPinned ? "z-[120]" : isMobile ? "z-[60]" : "z-30",
            (salaEnHoja || hubMinimized) && "invisible",
            // Teléfono: hoja inferior a lo ancho, siempre abajo (Jhon, 10/09: la
            // ventanita de 230 px no encuadraba y se movía sin querer al tocarla).
            isMobile ? "inset-x-0 bottom-0" : (hubPos && !hubMaximized ? "" : "bottom-4 right-4"),
          )}
          style={!isMobile && hubPos && !hubMaximized ? { left: hubPos.x, top: hubPos.y } : undefined}
        >
          <div
            ref={hubPanelRef}
            className={cn(
              "relative border border-white/10 bg-card/60 shadow-2xl backdrop-blur-xl overflow-hidden flex flex-col [box-shadow:0_20px_50px_-12px_rgba(0,0,0,.5),inset_0_1px_0_hsl(0_0%_100%/.1)]",
              isMobile
                ? (hubMaximized ? "w-screen h-[100dvh] rounded-none border-0 pt-safe pb-safe" : "w-screen rounded-t-2xl border-x-0 border-b-0 pb-safe")
                : hubMaximized
                  ? "w-[calc(100vw-2rem)] h-[calc(100dvh-2rem)] rounded-2xl"
                  : cn("rounded-2xl", hubSize ? "" : "w-96 md:w-[620px]"),
              hubMinimized && "hidden",
            )}
            style={hubMaximized ? undefined : isMobile
              // Media pantalla: arriba siguen viéndose las salas; adentro entran la
              // barra, el video con la tira de gente y la fila de controles entera.
              ? { height: "min(58dvh, 520px)" }
              : {
                ...(hubSize ? { width: hubSize.w, height: hubSize.h } : { height: 460 }),
                // Nunca más alto que la pantalla. Aplica también al alto que la
                // persona haya elegido arrastrando la esquina.
                maxHeight: "calc(100dvh - 2rem)",
              }}
          >
            {/* Esquina para ESTIRAR el Hub (Alvaro: más grande, más cómodo). */}
            {!isMobile && !hubMaximized && !hubMinimized && (
              <div
                onPointerDown={startWindowResize}
                className="absolute bottom-0 right-0 z-30 flex h-5 w-5 cursor-nwse-resize items-end justify-end p-1 text-white/40 hover:text-white/70"
              >
                <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="currentColor"><path d="M9 3 3 9H9V3zM9 7l-2 2H9V7z" /></svg>
              </div>
            )}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 shrink-0">
              <div
                className={cn("flex flex-1 items-center gap-1.5 text-xs text-foreground font-medium select-none", !hubMaximized && !isMobile && "cursor-move touch-none")}
                onPointerDown={(e) => { if (!hubMaximized && !isMobile) startWindowDrag(e, hubPanelRef, setHubPos, "cowork.hub.pos"); }}
                title={hubMaximized || isMobile ? undefined : t("cowork.host.dragToMove")}
              >
                <Headphones className="h-3 w-3 text-warning" />
                Supervisor Hub
              </div>
              <div className="flex gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-5 w-5 ${hubSilenciado ? "text-warning hover:text-warning/80" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={toggleHubSilencio}
                  title={hubSilenciado
                    ? t("cowork.host.hub.mutedHint")
                    : t("cowork.host.hub.muteHint")}
                >
                  {hubSilenciado ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-5 w-5 ${hubPinned && !ventanaDelSistemaSoportada ? "text-warning hover:text-warning/80" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={popOutHub}
                  title={ventanaDelSistemaSoportada
                    ? (ventanaDelSistemaAbierta
                        ? t("cowork.host.hub.bringBack")
                        : t("cowork.host.hub.popOut"))
                    : (hubPinned ? t("cowork.host.hub.pinned") : t("cowork.host.hub.pin"))}
                >
                  {ventanaDelSistemaSoportada ? <PictureInPicture2 className="h-3 w-3" /> : (hubPinned ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />)}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  onClick={() => setHubMinimized(true)}
                  title={t("cowork.host.minimize")}
                >
                  <span className="text-xs leading-none">−</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  onClick={() => setHubMaximized(!hubMaximized)}
                  title={hubMaximized ? t("cowork.host.restore") : t("cowork.host.maximize")}
                >
                  {hubMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-destructive hover:text-destructive/80"
                  onClick={colgarHub}
                  title={t("cowork.host.hangUpCall")}
                >
                  <PhoneOff className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <CallOutlet className="w-full h-full" />
            </div>
            {/* Handle de resize (esquina inferior derecha), solo en modo ventanita. */}
            {!hubMaximized && (
              <div
                onPointerDown={startHubResize}
                title={t("cowork.host.dragToResize")}
                className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none z-10"
                style={{ background: "linear-gradient(135deg, transparent 50%, hsl(var(--muted-foreground)/0.5) 50%)" }}
              />
            )}
          </div>
        </div>
        </>
      )}

      {/* Reglas de la sesión (qué alertas existen y cuándo se escala al
          supervisor). Guardar las escribe en cowork_sessions.alert_rules; el
          realtime de la sesión las trae de vuelta a todos, incluido este
          dashboard. */}
      {/* Teléfono: los controles de la sala que se tocó, en una hoja inferior.
          Misma lógica que los botones de la tarjeta en escritorio. */}
      <Sheet open={!!salaEnHoja} onOpenChange={(o) => { if (!o) setSalaEnHoja(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6 pt-3">
          {(() => {
            const room = cowork.rooms.find((r) => r.id === salaEnHoja);
            if (!room) return null;
            const participants = getRoomParticipants(room.id);
            const personas = personasDe(participants);
            const pausaSala = pausaDeLaSala(participants.map((p) => p.user_id));
            const etiquetas = etiquetasDe(participants, !pausaSala);
            return (
              <>
                <SheetHeader className="text-left">
                  <SheetTitle className="flex items-center gap-2 font-display">
                    {tituloBonito(room.name)}
                    <span className="text-xs font-normal text-muted-foreground">{participants.length === 1 ? t("cowork.host.personOne") : t("cowork.host.personMany", { n: participants.length })}</span>
                  </SheetTitle>
                  <SheetDescription>
                    {room.join_code ? <>{t("cowork.host.roomCode")} <span className="font-mono tracking-[0.18em] text-foreground">{room.join_code}</span></> : t("cowork.host.roomNoCode")}
                  </SheetDescription>
                </SheetHeader>
                {/* El video EN VIVO de la sala que tocó — solo aquí (una sala a la
                    vez) para no decodificar video de todo el grid en el teléfono.
                    El monitor salta solo a la pantalla compartida y trae el botón
                    para volver a la cámara (CoworkRoomMonitor, modo móvil). */}
                {participants.length > 0 && (
                  // En pausa el video también se ve aquí, apenas atenuado (v5).
                  <div className={cn("mt-3 aspect-video overflow-hidden rounded-xl bg-black", pausaSala && "[filter:saturate(.5)_brightness(.55)]")}>
                    <CoworkRoomMonitor
                      roomId={room.id}
                      roomName={room.name}
                      issueToken={cowork.issueLiveKitToken}
                      showVideo={true}
                      showNames={true}
                      hearOn={hearFor(room.id)}
                      broadcastOn={broadcastFor(room.id)}
                      micBaseTrack={micBaseTrack}
                      camOn={camFor(room.id)}
                      camBaseTrack={camBaseTrack}
                      screenOn={screenFor(room.id)}
                      screenBaseTrack={baseDePantalla}
                      enabled={true}
                    />
                  </div>
                )}
                {personas.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {personas.map((p) => (
                      <li key={p.uid} className="flex items-center gap-2 text-sm">
                        <UserAvatar name={p.nombre} src={cowork.avatares[p.uid]?.src} seed={cowork.avatares[p.uid]?.seed} size="sm" status={p.online ? "online" : "away"} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{p.nombre}</span>
                          {p.motivo && <span className="block truncate text-xs text-muted-foreground">{t("cowork.host.clockStopped", { reason: p.motivo })}</span>}
                        </span>
                        {p.reloj && (
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            <RelojDePersona reloj={p.reloj} />
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {etiquetas.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {etiquetas.map((e) => (
                      <span key={e.key} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", TONO_ETIQUETA[e.tono])}>
                        <e.icono className="h-3 w-3" />{e.texto}
                      </span>
                    ))}
                  </div>
                )}
                {participants.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-1">
                    {controlesDeSala(room, true)}
                  </div>
                )}
                {/* AVISAR también desde el teléfono (la voz que corrige al
                    chatter): sin esto la operación quedaba coja fuera de la
                    computadora (Álvaro, 26/10). */}
                {puedeAvisar && participants.length > 0 && (
                  <Button variant="outline" className="mt-2 h-10 w-full gap-1.5 rounded-xl text-xs text-violet-300 hover:text-violet-200" onClick={() => { const id = room.id; setSalaEnHoja(null); setAvisarSala(id); }}>
                    <Megaphone className="h-3.5 w-3.5" /> {t("cowork.avisar.trigger")}
                  </Button>
                )}
                <Button className="mt-3 h-11 w-full gap-2 rounded-xl" onClick={() => { setSalaEnHoja(null); enterRoom(room.id); }}>
                  <DoorOpen className="h-4 w-4" /> {t("cowork.host.enterRoom")}
                </Button>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Button variant="outline" className="h-10 gap-1.5 rounded-xl text-xs" onClick={() => copiarEnlaceDeSala(room)}>
                    <Link2 className="h-3.5 w-3.5" /> {t("cowork.host.link")}
                  </Button>
                  <Button variant="outline" className="h-10 gap-1.5 rounded-xl text-xs" onClick={() => { setSalaEnHoja(null); openEdit(room); }}>
                    <Pencil className="h-3.5 w-3.5" /> {t("common.edit")}
                  </Button>
                  <Button variant="outline" className="h-10 gap-1.5 rounded-xl text-xs text-destructive hover:text-destructive" onClick={() => { setSalaEnHoja(null); setCloseTarget(room); }}>
                    <X className="h-3.5 w-3.5" /> {t("common.close")}
                  </Button>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* El AVISAR: UN diálogo controlado para la sala elegida (lo abre el
          megáfono de la tarjeta o de la hoja), con categorías y la voz Mario. */}
      {avisarSala && (() => {
        const room = cowork.rooms.find((r) => r.id === avisarSala);
        if (!room) return null;
        const gente = getRoomParticipants(room.id);
        const chatterId = gente[0]?.user_id ?? null;
        return (
          <AvisarDialog
            nombreChatter={chatterId ? nombreYApellido(cowork.profiles[chatterId]) : null}
            onAvisar={(slug) => { if (chatterId) void enviarAviso([chatterId], slug, room.id); }}
            t={t}
            open
            onOpenChange={(abierto) => { if (!abierto) setAvisarSala(null); }}
          />
        );
      })()}

      <MeetGrupalDialog
        open={meetDialogOpen}
        onOpenChange={setMeetDialogOpen}
        salas={cowork.rooms.map((r) => {
          const gente = getRoomParticipants(r.id);
          return { id: r.id, name: r.name, personas: gente.map((a) => nombreYApellido(cowork.profiles[a.user_id])), enPausa: gente.filter((a) => !!pausaDe(a.user_id)).length };
        })}
        onConfirmar={crearMeet}
      />
      <CoworkPausasDialog
        open={pausasOpen}
        onOpenChange={setPausasOpen}
        sessionId={cowork.session?.id ?? null}
        nombreSesion={cowork.session?.name ?? ""}
        banoMin={limitesPausa.bano ?? 10}
        breakMin={limitesPausa.break ?? 30}
      />
      <CoworkReglasDialog
        open={reglasOpen}
        onOpenChange={setReglasOpen}
        reglas={reglas}
        nombreSesion={cowork.session?.name ?? ""}
        autoria={{
          // El nombre sale del mapa de perfiles que el hook ya trae para los
          // miembros; quien cambió las reglas es host, así que está ahí.
          quien: cowork.session?.alert_rules_updated_by
            ? (cowork.profiles[cowork.session.alert_rules_updated_by] ?? null)
            : null,
          cuando: cowork.session?.alert_rules_updated_at ?? null,
        }}
        onGuardar={(r) => cowork.updateAlertRules(r)}
      />

      {/* Añadir sala */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t("cowork.create.sessionName")}</DialogTitle></DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="cowork-session-name">{t("cowork.host.renameLabel")}</Label>
            <Input
              id="cowork-session-name"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value.slice(0, 80))}
              onKeyDown={(e) => { if (e.key === "Enter" && sessionName.trim()) void doRenameSession(); }}
              placeholder={t("cowork.host.renamePlaceholder")}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">{t("cowork.host.renameHelp")}</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => void doRenameSession()} disabled={!sessionName.trim() || renaming}>
              {renaming ? t("cowork.host.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t("cowork.host.addRoom")}</DialogTitle></DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="cowork-add-room">{t("cowork.host.roomName")}</Label>
            <Input
              id="cowork-add-room"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder={t("cowork.host.roomNamePlaceholder")}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleAddRoom(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleAddRoom} disabled={roomBusy || !addName.trim()} className="gap-1">
              {roomBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {t("cowork.host.addShort")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar sala (nombre + modo de preview) */}
      <Dialog open={!!editRoom} onOpenChange={(o) => { if (!o) setEditRoom(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t("cowork.host.editRoom")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="cowork-edit-room">{t("common.name")}</Label>
              <Input id="cowork-edit-room" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border p-3 gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">{t("cowork.host.showLiveVideo")}</div>
                <div className="text-xs text-muted-foreground">{t("cowork.host.showLiveVideoHint")}</div>
              </div>
              <Switch checked={editVideo} onCheckedChange={setEditVideo} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditRoom(null)}>{t("common.cancel")}</Button>
            <Button onClick={handleSaveEdit} disabled={roomBusy}>
              {roomBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cerrar sala (confirmación) */}
      <AlertDialog open={!!closeTarget} onOpenChange={(o) => { if (!o) setCloseTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cowork.host.closeRoomTitle", { name: closeTarget?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("cowork.host.closeRoomDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={roomBusy} />
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleCloseRoom(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {roomBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("cowork.host.closeRoom")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
