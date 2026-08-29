import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users2, Headphones, Hand, Monitor, DoorOpen,
  X, Loader2, Radio, Power, Link2, Menu, XIcon, Maximize2, Minimize2, Phone, Share2,
  Mic, MicOff, Video, VideoOff, ArrowLeft, Plus, Pencil, Volume2, VolumeX,
  PanelLeftClose, PanelLeftOpen,
  Pin, PinOff, PhoneOff, PictureInPicture2, KeyRound, Copy, Check, Coffee, EyeOff,
} from "lucide-react";
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
import { hablar } from "@/lib/voz";
import { AVISAR_COORDINADOR_MS } from "@/hooks/useFaceNudge";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { useCoworkMediaPresence, type MediaState } from "@/hooks/useCoworkMediaPresence";
import { cn } from "@/lib/utils";
import { leerLimitesPausa } from "@/lib/coworkTablas";
import { cuentaPausa, clasesPausa, nombreYApellido, AVISAR_SUPERVISOR_PASADO_MS } from "@/lib/pausaCowork";
import type { useCoworkSession, CoworkRoom } from "@/hooks/useCoworkSession";

interface Props {
  cowork: ReturnType<typeof useCoworkSession>;
  userId: string;
}

export default function CoworkHostDashboard({ cowork, userId }: Props) {
  const navigate = useNavigate();
  const { isOnline } = useOnlinePresence();
  const { mediaStates } = useCoworkMediaPresence(cowork.session?.id, userId);
  const [displayName, setDisplayName] = useState("Host");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [activeRoomLk, setActiveRoomLk] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [activeRoomName, setActiveRoomName] = useState<string | null>(null);
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
  const [hostInviteCode, setHostInviteCode] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hubMinimized, setHubMinimized] = useState(false);
  const [hubMaximized, setHubMaximized] = useState(false);
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
      if (!ok) { toast.error("No pude abrir la ventana flotante"); toggleHubPinned(); }
    } else {
      toast.info("Tu navegador no soporta ventana flotante multi-monitor (usa Chrome/Edge). Fijo al frente dentro de Maven.");
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
  const [roomHear, setRoomHear] = useState<Record<string, boolean>>({});
  // Tic de un segundo: los contadores de pausa y las alertas de encuadre se
  // calculan contra este reloj, así avanzan solos sin depender de que llegue un
  // evento de presence.
  //
  // Va ARRIBA de todo lo que lo usa. Como const, leerlo antes de su línea lanza;
  // hoy solo se lee dentro de funciones que corren al renderizar —así que no
  // rompe— pero es el mismo patrón que tumbó esta pantalla dos veces, y basta
  // que alguien lo mueva a un arreglo de dependencias para que vuelva a pasar.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Límites por tipo de pausa (tabla, no constantes). Si no cargan, no se pinta
  // nada de rojo: mejor sin señal que marcando a alguien por un dato que falta.
  const [limitesPausa, setLimitesPausa] = useState<Record<string, number>>({});
  useEffect(() => {
    void leerLimitesPausa(supabase).then(setLimitesPausa);
  }, []);
  // Segundos que lleva alguien en pausa, o null si no está en una.
  const pausaDe = (uid: string) => {
    const st = mediaStates[uid];
    if (!st?.onBreak || !st.breakStartedAt) return null;
    const segundos = Math.max(0, Math.floor((now - (st.breakStartedAt as number)) / 1000));
    const kind = st.breakKind === "break" ? "break" : "bano";
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
      etiqueta: kind === "break" ? "Break" : "Baño",
      excedida: cuenta.excedida,
      cuenta,
    };
  };
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
  // El micro se captura si le hablás a alguien: a todas, o al menos a una sala.
  const micArmed = Object.values(roomMic).some(Boolean);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).single();
        setDisplayName(profile?.full_name || "Host");
      }
      setProfileLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (cowork.session?.id) {
      cowork.getHostCode().then((res: any) => setHostInviteCode(res.hostCode)).catch(() => {});
    }
  }, [cowork.session?.id]);

  // Central de audio: captura del micro compartido para broadcastear a varias salas. Se toma
  // cuando le hablás a AL MENOS una sala (a todas con el botón global, o a una con su 🎤) y cada
  // sala publica un clon (CoworkRoomMonitor). El Coordinador Hub queda INDEPENDIENTE (su mic está
  // apagado por defecto, así que no hay conflicto de captura ni doble publicación de tu voz).
  useEffect(() => {
    if (!micArmed) return;
    let cancelled = false;
    let track: MediaStreamTrack | null = null;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        track = stream.getAudioTracks()[0] || null;
        if (cancelled) { track?.stop(); return; }
        setMicBaseTrack(track);
      } catch {
        // Sin micro no podés hablarle a nadie → desarmamos todo.
        // `setRoomMic({})` YA apaga todo: sin entrada, cada sala vuelve a su
        // default (no hablar). Acá había además un `setGlobalMic(false)` que
        // quedó huérfano cuando el botón global pasó a ser una acción sobre
        // las salas — o sea que si a alguien le fallaba el micrófono, en vez
        // del aviso se llevaba una pantalla negra.
        if (!cancelled) { toast.error("No pude acceder al micrófono"); setRoomMic({}); }
      }
    })();
    return () => {
      cancelled = true;
      setMicBaseTrack(null);
      try { track?.stop(); } catch { /* noop */ }
    };
  }, [micArmed]);

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
    const switching = !!activeRoomId;
    setActiveRoomLk(room.livekit_room_name);
    setActiveRoomId(roomId);
    setActiveRoomName(room.name);
    // Cambiar de sala = moverse: la anterior se cuelga (no se puede estar en dos salas).
    if (switching) toast.info(`Te moviste a ${room.name}`);
  }, [cowork.rooms, activeRoomId]);

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
  const colgarHub = useCallback(() => {
    setHubMaximized(false);
    endCall();
  }, [endCall]);

  const conectarHub = useCallback(() => {
    if (!hubRoom || !hubKey) return;
    startCall({
      key: hubKey,
      roomName: hubRoom,
      displayName,
      callDisplayName: "Supervisor Hub",
      isAdmin: true,
      onLeave: colgarHub,
      hideShareLink: true,
      hideLeaveButton: true,
      suppressLeaveToast: true,
      initialMicOn: false,
      initialCamOn: false,
      getToken: getHubToken,
    });
  }, [hubRoom, hubKey, displayName, colgarHub, getHubToken, startCall]);

  // Entrar al Hub al abrir la sesión. UNA sola vez: sin el candado, colgar el
  // Hub lo volvería a conectar en el mismo instante.
  //
  // Si ya venía sonando de otra sección se ADOPTA la llamada viva en vez de
  // arrancar una nueva: reconectar corta el audio de las salas unos segundos.
  const yaEntroAlHub = useRef(false);
  useEffect(() => {
    if (!profileLoaded || !hubRoom || yaEntroAlHub.current) return;
    yaEntroAlHub.current = true;
    if (activeKey !== hubKey) conectarHub();
  }, [profileLoaded, hubRoom, hubKey, activeKey, conectarHub]);

  const getActiveRoomToken = useCallback(async () => {
    const result = await cowork.issueLiveKitToken("join_room", activeRoomId!);
    return { token: result.token, url: result.url };
  }, [cowork.issueLiveKitToken, activeRoomId]);

  // Salir de la sala (Volver al dashboard o el botón rojo) = colgar ESA sala.
  const leaveActiveRoom = useCallback(() => {
    setActiveRoomLk(null);
    setActiveRoomId(null);
    setActiveRoomName(null);
    // El Hub es independiente: si sigue conectado no hay nada que hacer; si el
    // coordinador lo colgó a mano, solo lo re-abrimos si él toca "Reconectar".
  }, []);

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
      toast.info("Llamada privada finalizada");
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
      toast.success("Nombre actualizado");
    } catch (e: any) {
      toast.error(e.message || "No se pudo cambiar el nombre");
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
  // El sonido y la voz esperan a los 3 minutos, que es cuando el supervisor ya
  // le avisó DOS VECES a la persona y no corrigió. Antes sonaba al minuto —
  // antes incluso de que el chatter viera su primer aviso— y eso rompía justo lo
  // que se buscaba: que un descuido se resuelva solo sin interrumpir a nadie.
  const FACE_ALERT_MS = 60_000;
  const FACE_SONIDO_MS = AVISAR_COORDINADOR_MS;
  const faceIssue = (ms: MediaState | undefined): string | null => {
    if (!ms || !ms.faceState || !ms.faceSince) return null;
    if (ms.onBreak) return null;                   // ya sabemos que no está
    if (ms.faceState === "ok") return null;
    if (ms.faceState === "unavailable") return null; // el detector no cargó en su equipo
    if (now - ms.faceSince < FACE_ALERT_MS) return null;
    return ms.faceState === "no_face" ? "Sin rostro"
      : ms.faceState === "too_small" ? "Fuera de cuadro"
      : ms.faceState === "too_dark" ? "Sin luz"
      // Cámara apagada SIN pausa marcada. Antes se ignoraba, y era el hueco más
      // grande: apagar la cámara es la forma más fácil de desaparecer, y era
      // justo la que no avisaba. Con pausa marcada sigue sin avisar (la corta
      // el `ms.onBreak` de arriba), que es lo correcto.
      : ms.faceState === "cam_off" ? "Cámara apagada"
      : null;
  };


  // Tic de un segundo: los contadores de pausa se calculan contra este reloj, así
  // avanzan solos sin depender de que llegue un evento de presence.

  // Aviso sonoro cuando alguien se PASA de su pausa — pero recién a los 3
  // minutos de excedido, no al segundo uno.
  //
  // El motivo es que interrumpir a quien supervisa nueve salas es caro:
  // pasarse un minuto del baño es asunto de la persona, y ella ya está
  // recibiendo su propio aviso hablado. Lo que amerita subir un nivel es que
  // el aviso no haya surtido efecto.
  //
  // Una vez por persona y por pausa: se rearma cuando esa persona vuelve.
  const yaAvisadoPausa = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const [uid, st] of Object.entries(mediaStates)) {
      const p = pausaDe(uid);
      if (!p) { yaAvisadoPausa.current.delete(uid); continue; }
      const pasadoSeg = -p.cuenta.restante;
      if (pasadoSeg * 1000 < AVISAR_SUPERVISOR_PASADO_MS) continue;
      if (yaAvisadoPausa.current.has(uid)) continue;
      yaAvisadoPausa.current.add(uid);
      const quien = nombreYApellido(cowork.profiles[uid]);
      playCoordinatorRequestSound();
      hablar(`${quien} lleva ${Math.floor(pasadoSeg / 60)} minutos pasado de su ${p.etiqueta.toLowerCase()}.`,
        { volumen: 0.85 });
      toast.warning(`${quien}: pasado de ${p.etiqueta.toLowerCase()}`, {
        description: `Lleva ${p.cuenta.texto.replace("−", "")} de más y ya se le avisó por voz.`,
        duration: 10_000,
      });
    }
  }, [mediaStates, now, cowork.profiles]);

  // Aviso sonoro cuando alguien lleva rato fuera de cuadro. Hasta ahora la
  // alerta era una etiqueta silenciosa en la tarjeta: si el coordinador estaba
  // mirando otra sala, no se enteraba. Suena UNA vez por persona y por episodio
  // — se rearma solo cuando esa persona vuelve a cuadro.
  const yaAvisado = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const [uid, st] of Object.entries(mediaStates)) {
      const problema = faceIssue(st);
      const bastante = !!problema && !!st.faceSince && (now - st.faceSince) >= FACE_SONIDO_MS;
      if (bastante && !yaAvisado.current.has(uid)) {
        yaAvisado.current.add(uid);
        // Con apellido: en el equipo hay dos Álvaro Mejía y hubo dos Manuela
        // Zapata. Un aviso que dice solo el nombre de pila no identifica a
        // nadie, que es exactamente lo que el aviso tiene que hacer.
        const quien = nombreYApellido(cowork.profiles[uid]);
        playCoordinatorRequestSound();
        // Se lo dice en voz alta y CON EL NOMBRE. Es lo que la voz del propio
        // chatter no puede darle al coordinador: saber a quién mirar sin tener
        // que buscar cuál de las nueve salas parpadea.
        const nombre = quien;
        hablar(
          problema === "Sin luz" ? `${nombre} no tiene luz suficiente.`
          : problema === "Fuera de cuadro" ? `${nombre} está fuera de cuadro.`
          : problema === "Cámara apagada" ? `${nombre} tiene la cámara apagada y no marcó pausa.`
          : `${nombre} no está frente a la cámara.`,
          { volumen: 0.85 },
        );
        toast.warning(`${quien}: ${problema.toLowerCase()}`, {
          description: "Lleva más de tres minutos así y ya se le avisó dos veces.",
          duration: 8000,
        });
      } else if (!problema) {
        yaAvisado.current.delete(uid);
      }
    }
  }, [mediaStates, now, cowork.profiles]);

  // El aviso de manos levantadas (sonido + globito del sistema) se mudó a
  // useCoworkRequestAlerts, montado por encima del router: acá solo sonaba
  // mientras esta página estuviera abierta, y el coordinador que navegaba a otra
  // sección dejaba de enterarse. Si se dejara también acá, sonaría dos veces.

  // Quién comparte pantalla en cada sala — VERDAD de LiveKit reportada por cada
  // CoworkRoomMonitor (más confiable que el presence auto-reportado, que fallaba y
  // mostraba "nadie comparte" aunque alguien lo estuviera haciendo).
  const [roomSharers, setRoomSharers] = useState<Record<string, string[]>>({});
  // Quién está HABLANDO en cada sala (ActiveSpeakersChanged de LiveKit), para
  // pintar la card en verde mientras alguien habla.
  const [roomSpeakers, setRoomSpeakers] = useState<Record<string, string[]>>({});
  const getRoomSharers = (roomId: string) => roomSharers[roomId] ?? [];

  const handleAddRoom = async () => {
    const name = addName.trim();
    if (!name) return;
    setRoomBusy(true);
    try {
      await cowork.addRoom(name);
      await cowork.refetch(true);
      toast.success("Sala añadida");
      setAddOpen(false);
      setAddName("");
    } catch (e: any) { toast.error(e?.message || "No se pudo añadir la sala"); }
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
      toast.success("Sala actualizada");
      setEditRoom(null);
    } catch (e: any) { toast.error(e?.message || "No se pudo actualizar la sala"); }
    finally { setRoomBusy(false); }
  };

  const handleCloseRoom = async () => {
    if (!closeTarget) return;
    setRoomBusy(true);
    try {
      await cowork.closeRoom(closeTarget.id);
      await cowork.refetch(true);
      toast.success("Sala cerrada");
      setCloseTarget(null);
    } catch (e: any) { toast.error(e?.message || "No se pudo cerrar la sala"); }
    finally { setRoomBusy(false); }
  };

  return (
    <div className="flex h-screen bg-background text-foreground relative">
      {/* Mobile sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-3 left-3 z-50 md:hidden h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <XIcon className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </Button>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Left sidebar */}
      {/* Plegada queda una tira angosta con el boton para volver a abrirla: si
          desapareciera del todo no habria como traerla de vuelta. */}
      {sidebarCollapsed && (
        <div className="hidden md:flex w-10 h-full border-r border-border bg-card flex-col items-center pt-3 shrink-0">
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Mostrar el panel de solicitudes y pantallas"
            onClick={() => { setSidebarCollapsed(false); localStorage.setItem("maven.cowork.sidebar.collapsed", "0"); }}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
          {/* Con el panel plegado, una mano levantada quedaria invisible: el
              unico lugar donde se listan es adentro. El contador lo trae de
              vuelta y al tocarlo abre el panel en el que estan. */}
          {openHostRequests.length > 0 && (
            <button
              onClick={() => { setSidebarCollapsed(false); localStorage.setItem("maven.cowork.sidebar.collapsed", "0"); }}
              title={`${openHostRequests.length} ${openHostRequests.length === 1 ? "persona pide" : "personas piden"} supervisor`}
              className="mt-2 relative h-8 w-8 rounded-lg flex items-center justify-center bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 transition-colors animate-pulse"
            >
              <Hand className="h-4 w-4" />
              <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-amber-500 text-[10px] font-semibold text-black flex items-center justify-center">
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
                title={excedidas ? `${excedidas} pasado(s) del límite` : `${enPausa} en pausa`}
                className={`mt-2 relative h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
                  excedidas ? "bg-destructive/20 text-destructive animate-pulse" : "bg-success/15 text-success hover:bg-success/25"
                }`}
              >
                <Coffee className="h-4 w-4" />
                <span className={`absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center ${
                  excedidas ? "bg-destructive text-white" : "bg-success text-black"
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
        w-72 md:w-80 h-full
        border-r border-border flex flex-col bg-card
        transition-transform duration-200 ease-in-out
        ${sidebarCollapsed ? "md:hidden" : ""}
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <button
                type="button"
                className="group flex items-center gap-1.5 text-left"
                title="Cambiar el nombre de la sesión"
                onClick={() => {
                  setSessionName(cowork.session?.name || "");
                  setRenameOpen(true);
                }}
              >
                <h2 className="text-sm font-semibold text-foreground truncate">{cowork.session?.name}</h2>
                <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </button>
              <p className="text-xs text-muted-foreground">Supervisor Dashboard</p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="hidden md:inline-flex h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Ocultar este panel"
                onClick={() => { setSidebarCollapsed(true); localStorage.setItem("maven.cowork.sidebar.collapsed", "1"); }}
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-blue-500 hover:text-blue-400"
                title="Copiar enlace de host"
                onClick={() => {
                  const code = hostInviteCode || "";
                  const url = `${window.location.origin}/cowork?session=${cowork.session?.id || ""}&role=host&code=${code}`;
                  navigator.clipboard.writeText(url);
                  toast.success("Enlace de host copiado");
                }}
              >
                <Share2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive/80"
                onClick={async () => {
                  setActiveRoomLk(null);
                  setActiveRoomId(null);
                  setActiveRoomName(null);
                  colgarHub();
                  await cowork.endSession();
                  toast.success("Sesión finalizada");
                  navigate("/cowork");
                }}
              >
                <Power className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {/* Host Hub indicator */}
          <div className="p-3 border-b border-border/50">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Radio className={`h-3 w-3 ${hubConnected ? "text-success" : "text-muted-foreground/50"}`} />
              <span>Supervisor Hub</span>
              {hubConnected ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] text-amber-500 hover:text-amber-400 px-1.5"
                  onClick={() => setHubMinimized(!hubMinimized)}
                >
                  {hubMinimized ? "Mostrar" : "Minimizar"}
                </Button>
              ) : cowork.session?.host_hub_livekit_room ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] text-amber-500 hover:text-amber-400 px-1.5"
                  onClick={conectarHub}
                >
                  Reconectar
                </Button>
              ) : null}
            </div>
          </div>

          {/* Unassigned members section removed — participants self-join via URL ?room=X */}

          {/* Host Requests */}
          <div className="p-3 border-t border-border/50 space-y-2">
            <h3 className="text-xs font-medium text-amber-500 uppercase tracking-wider flex items-center gap-1">
              <Hand className="h-3 w-3" /> Solicitudes ({openHostRequests.length})
            </h3>
            {openHostRequests.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1">Sin solicitudes pendientes</p>
            ) : (
              openHostRequests.map((req) => {
                const roomName = cowork.rooms.find(r => r.id === req.room_id)?.name || "?";
                const is1on1 = !!req.oneone_livekit_room;
                return (
                  <div key={req.id} className={`rounded-xl p-2.5 space-y-1 ${is1on1 ? "bg-primary/5" : "bg-amber-500/10"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {is1on1 ? <Phone className="h-3 w-3 text-primary" /> : <Hand className="h-3 w-3 text-amber-500" />}
                        <span className="text-xs text-foreground/80">{cowork.profiles[req.user_id] || "User"}</span>
                      </div>
                      <Badge variant="outline" className={`text-[9px] rounded-full ${is1on1 ? "border-primary/30 text-primary" : "border-amber-500/30 text-amber-500"}`}>{roomName}</Badge>
                    </div>
                    {req.message && <p className="text-[10px] text-muted-foreground">{req.message}</p>}
                    <div className="flex gap-1">
                      {req.status === "open" && (
                        <Button size="sm" variant="ghost" className={`h-5 text-[10px] rounded-full ${is1on1 ? "text-primary" : "text-amber-500"}`} onClick={async () => {
                          if (is1on1) {
                            await cowork.ackHostRequest(req.id);
                            setOneOnOneRequestId(req.id);
                            setOneOnOneRoom(req.oneone_livekit_room!);
                            setOneOnOneName(`Llamada privada con ${cowork.profiles[req.user_id] || "User"}`);
                            setHubMinimized(true);
                          } else {
                            if (req.room_id) enterRoom(req.room_id);
                            await cowork.resolveHostRequest(req.id);
                          }
                        }}>
                          {is1on1 ? "Atender" : "Ir a la sala"}
                        </Button>
                      )}
                      {/* Marcar como atendida SIN entrar a la sala: muchas veces el
                          coordinador ya resolvió por otro lado (le habló por el 🎤,
                          pasó por su puesto) y solo necesita sacarla de la lista.
                          Antes la única salida era "Atender", que te metía a la sala. */}
                      {!is1on1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 text-[10px] text-muted-foreground hover:text-foreground rounded-full"
                          title="Sacarla de la lista sin entrar a la sala"
                          onClick={async () => {
                            try {
                              await cowork.resolveHostRequest(req.id);
                            } catch {
                              toast.error("No se pudo marcar como atendida");
                            }
                          }}
                        >
                          <Check className="h-3 w-3 mr-0.5" /> Listo
                        </Button>
                      )}
                      {req.status === "acknowledged" && is1on1 && (
                        <Button size="sm" variant="ghost" className="h-5 text-[10px] text-primary rounded-full" onClick={() => {
                          setOneOnOneRequestId(req.id);
                          setOneOnOneRoom(req.oneone_livekit_room!);
                          setOneOnOneName(`Llamada privada con ${cowork.profiles[req.user_id] || "User"}`);
                          setHubMinimized(true);
                        }}>
                          Unirse a llamada privada
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

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
                    limitesPausa[st.breakKind === "break" ? "break" : "bano"],
                    st.breakKind === "break" ? 0 : (st.banoConsumidoSeg ?? 0),
                  ),
                };
              })
              .sort((a, b) => b.segundos - a.segundos);
            if (!enPausa.length) return null;
            return (
              <div className="p-3 border-t border-border/50 space-y-2">
                <h3 className="text-xs font-medium text-amber-500 uppercase tracking-wider flex items-center gap-1">
                  <Coffee className="h-3 w-3" /> En pausa ({enPausa.length})
                </h3>
                {enPausa.map((p) => (
                  <div key={p.uid} className="bg-amber-500/10 rounded-xl p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-1.5">
                      <Coffee className="h-3 w-3 text-amber-500 shrink-0" />
                      <span className="text-xs text-foreground/80 truncate">{p.nombre}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {p.sala && (
                        <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-500 rounded-full">
                          {p.sala}
                        </Badge>
                      )}
                      <span className={cn("text-[11px] font-mono tabular-nums", clasesPausa(p.cuenta.estado))}>
                        {p.cuenta.texto}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Pantallas compartidas EN VIVO por sala (ya no hay aprobaciones: compartir
              es directo para todos; acá solo se ve quién está compartiendo y dónde). */}
          <div className="p-3 border-t border-border/50 space-y-2">
            <h3 className="text-xs font-medium text-primary uppercase tracking-wider flex items-center gap-1">
              <Monitor className="h-3 w-3" /> Pantallas en vivo
            </h3>
            {(() => {
              const sharing = cowork.rooms
                .map(room => ({ room, sharers: getRoomSharers(room.id) }))
                .filter(x => x.sharers.length > 0);
              if (sharing.length === 0) {
                return <p className="text-xs text-muted-foreground px-1">Nadie está compartiendo pantalla</p>;
              }
              return sharing.map(({ room, sharers }) => (
                <div key={room.id} className="bg-primary/5 rounded-xl p-2.5 flex items-center justify-between gap-2">
                  <span className="text-xs text-foreground/80 truncate">{sharers.join(", ")}</span>
                  <Badge variant="outline" className="text-[9px] border-primary/30 text-primary rounded-full shrink-0">{room.name}</Badge>
                </div>
              ));
            })()}
          </div>
        </ScrollArea>
      </div>

      {/* Main content area — solo las llamadas 1:1 viven acá; las SALAS viven en su
          ventana persistente (abajo) para que navegar no las cuelgue. */}
      <div className="flex-1 flex flex-col min-h-0">
        {oneOnOneRoom && oneOnOneRequestId ? (
          <div className="flex-1 min-h-0">
            <LiveKitCallView
              key={oneOnOneRoom}
              roomName={oneOnOneRoom}
              displayName={displayName}
              callDisplayName={oneOnOneName || "Llamada privada"}
              isAdmin={false}
              onLeave={() => { leaveOneOnOne(); }}
              hideShareLink
              suppressLeaveToast
              autoLeaveOnEmpty={3000}
              initialMicOn={false}
              initialCamOn={false}
              getToken={getOneOnOneToken}
              leaveLabel="Regresar a dashboard"
              leaveIcon={ArrowLeft}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4 pt-14 md:p-6">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Seleccione sala para ingresar</h3>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className={`gap-1.5 rounded-full h-8 ${todasEscuchando ? "" : "text-destructive border-destructive/40"}`}
                  title={todasEscuchando
                    ? "Estás escuchando todas las salas. Toca para silenciarlas (solo para ti)."
                    : "Toca para escuchar todas. Las que ya tenías activadas se quedan como están."}
                  onClick={() => fijarEscuchaDeTodas(!todasEscuchando)}
                >
                  {todasEscuchando ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                  {todasEscuchando ? "Escuchando todas" : "Escuchar todas"}
                </Button>
                <Button
                  size="sm"
                  variant={hablandoATodas ? "default" : "outline"}
                  className={`gap-1.5 rounded-full h-8 ${hablandoATodas ? "bg-success hover:bg-success/90 text-white border-transparent" : ""}`}
                  title={hablandoATodas
                    ? "Tu voz va a TODAS las salas. Toca para dejar de hablarles."
                    : "Habla a todas a la vez. Las que ya tenías activadas se quedan como están."}
                  onClick={() => fijarMicDeTodas(!hablandoATodas)}
                >
                  {hablandoATodas ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                  {hablandoATodas ? "Hablando a todas" : "Hablar a todas"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 rounded-full h-8 shrink-0"
                  onClick={() => { setAddName(""); setAddOpen(true); }}
                >
                  <Plus className="h-3.5 w-3.5" /> Añadir sala
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
              {cowork.rooms.map((room) => {
                const participants = getRoomParticipants(room.id);
                const sharers = getRoomSharers(room.id);
                const speakers = roomSpeakers[room.id] ?? [];
                return (
                  <div
                    key={room.id}
                    className={`bg-card border rounded-2xl overflow-hidden transition-colors ${
                      // Verde manda sobre azul: que alguien esté HABLANDO ahora es
                      // más urgente de ver que que esté compartiendo pantalla.
                      speakers.length
                        ? "border-success"
                        : sharers.length
                          ? "border-primary/50"
                          : "border-border"
                    }`}
                  >
                    <div className="p-4 pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{room.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="secondary" className="text-[10px] rounded-full">
                            {participants.length} <Users2 className="h-2.5 w-2.5 ml-0.5" />
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-lg"
                            title="Editar sala"
                            onClick={() => openEdit(room)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive rounded-lg"
                            title="Cerrar sala"
                            onClick={() => setCloseTarget(room)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {/* Quién de esta sala está en pausa y hace cuánto. Verde
                          mientras esté dentro del límite; rojo y parpadeando si
                          se pasó — es lo que el coordinador tiene que ver sin
                          leer, de un vistazo sobre la miniatura. */}
                      {(() => {
                        const enPausa = participants
                          .map((p) => ({ p, pausa: pausaDe(p.user_id) }))
                          .filter((x) => x.pausa);
                        if (!enPausa.length) return null;
                        return (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {enPausa.map(({ p, pausa }) => (
                              <span
                                key={p.user_id}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
                                  pausa!.cuenta.estado === "excedida" ? "bg-destructive/20 animate-pulse"
                                    : pausa!.cuenta.estado === "poco" ? "bg-amber-500/15"
                                    : "bg-success/15",
                                  clasesPausa(pausa!.cuenta.estado),
                                )}
                                title={`${cowork.profiles[p.user_id] || "Alguien"} · ${pausa!.etiqueta}${pausa!.excedida ? " · PASADO del límite" : " · le quedan " + pausa!.cuenta.texto}`}
                              >
                                <Coffee className="h-2.5 w-2.5" />
                                <span className="truncate max-w-[92px]">{nombreYApellido(cowork.profiles[p.user_id])}</span> {pausa!.cuenta.texto}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                      {/* Estado de pantalla compartida de la sala, con quién comparte. */}
                      <div className="mt-1 flex items-center gap-1.5">
                        {sharers.length > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-primary font-medium">
                            <Monitor className="h-3 w-3" /> Compartiendo: {sharers.join(", ")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/50">
                            <Monitor className="h-3 w-3" /> Sin pantalla compartida
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="p-4 pt-1 space-y-3">
                      {participants.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground/50 italic">Sin participantes</p>
                      ) : (
                        <>
                          {(room.preview_mode ?? "video") === "avatars" ? (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                {participants.map((a) => {
                                  const fullName = cowork.profiles[a.user_id] || "User";
                                  const initials = fullName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
                                  const online = isOnline(a.user_id);
                                  return (
                                    <div key={a.user_id} className="flex flex-col items-center gap-1 rounded-xl border border-border bg-primary/5 p-2 text-center">
                                      <div className="relative">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-[10px] font-medium text-primary-foreground">
                                          {initials}
                                        </div>
                                        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${online ? "bg-success" : "bg-muted-foreground/30"}`} />
                                      </div>
                                      <span className="text-[11px] text-muted-foreground truncate w-full">{fullName}</span>
                                      {(() => {
                                        const ms = mediaStates[a.user_id];
                                        if (!ms) return null;
                                        return (
                                          <div className="flex items-center gap-1.5 mt-0.5">
                                            {ms.micOn ? <Mic className="h-3 w-3 text-success" /> : <MicOff className="h-3 w-3 text-destructive/70" />}
                                            {ms.camOn ? <Video className="h-3 w-3 text-success" /> : <VideoOff className="h-3 w-3 text-destructive/70" />}
                                            {ms.screenShareOn && <Monitor className="h-3 w-3 text-primary" />}
                                            {faceIssue(ms) && (
                                              <span
                                                className="flex items-center gap-0.5 text-[10px] text-amber-500"
                                                title={`${faceIssue(ms)} desde hace ${formatBreak(Math.floor((now - (ms.faceSince as number)) / 1000))}`}
                                              >
                                                <EyeOff className="h-3 w-3" />
                                                {formatBreak(Math.floor((now - (ms.faceSince as number)) / 1000))}
                                              </span>
                                            )}
                                            {ms.onBreak && ms.breakStartedAt && (
                                              <span className="flex items-center gap-0.5 text-[10px] text-amber-500 font-mono tabular-nums">
                                                <Coffee className="h-3 w-3" />
                                                {formatBreak(Math.max(0, Math.floor((now - ms.breakStartedAt) / 1000)))}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  );
                                })}
                              </div>
                              {/* En modo avatares el monitor sigue conectado SOLO para el audio (sin video). */}
                              <CoworkRoomMonitor
                                roomId={room.id}
                                issueToken={cowork.issueLiveKitToken}
                                showVideo={false}
                                hearOn={hearFor(room.id)}
                                broadcastOn={broadcastFor(room.id)}
                                micBaseTrack={micBaseTrack}
                                enabled={activeRoomId !== room.id}
                                onSharersChange={(names) => setRoomSharers((m) => ({ ...m, [room.id]: names }))}
                                onSpeakingChange={(names) => setRoomSpeakers((m) => ({ ...m, [room.id]: names }))}
                              />
                            </>
                          ) : (
                            <div className="h-36 rounded-xl overflow-hidden bg-black/40 border border-border">
                              <CoworkRoomMonitor
                                roomId={room.id}
                                issueToken={cowork.issueLiveKitToken}
                                showVideo
                                hearOn={hearFor(room.id)}
                                broadcastOn={broadcastFor(room.id)}
                                micBaseTrack={micBaseTrack}
                                enabled={activeRoomId !== room.id}
                                onSharersChange={(names) => setRoomSharers((m) => ({ ...m, [room.id]: names }))}
                                onSpeakingChange={(names) => setRoomSpeakers((m) => ({ ...m, [room.id]: names }))}
                              />
                            </div>
                          )}

                          {/* Central de audio por sala: escuchar (🔊) y hablarle (🎤) */}
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-7 flex-1 text-[11px] gap-1 rounded-lg ${hearFor(room.id) ? "text-foreground" : "text-muted-foreground/50"}`}
                              title={hearFor(room.id) ? "Escuchando esta sala. Toca para silenciar su audio." : "Sala silenciada (no la oís). Toca para escuchar."}
                              onClick={() => setRoomHear((m) => ({ ...m, [room.id]: !hearFor(room.id) }))}
                            >
                              {hearFor(room.id) ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                              {hearFor(room.id) ? "Escuchando" : "Silenciada"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-7 flex-1 text-[11px] gap-1 rounded-lg font-medium ${broadcastFor(room.id) ? "bg-success text-white hover:bg-success/90" : "bg-destructive/10 text-destructive hover:bg-destructive/20"}`}
                              title={broadcastFor(room.id)
                                ? "Tu voz va a esta sala. Toca para dejar de hablarle."
                                : "Toca para hablarle solo a esta sala."}
                              onClick={() => setRoomMic((m) => ({ ...m, [room.id]: !(m[room.id] ?? false) }))}
                            >
                              {broadcastFor(room.id) ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                              {broadcastFor(room.id) ? "Hablando" : "Hablar"}
                            </Button>
                          </div>
                        </>
                      )}

                      <div className="flex gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1 h-8 text-xs gap-1 rounded-xl"
                          onClick={() => enterRoom(room.id)}
                        >
                          <DoorOpen className="h-3 w-3" /> Entrar
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary hover:text-primary/80 rounded-xl"
                          title="Copiar enlace de participante para esta sala"
                          onClick={() => {
                            const url = `${window.location.origin}/cowork?session=${cowork.session?.id || ""}&room=${room.id}`;
                            navigator.clipboard.writeText(url);
                            toast.success(`Enlace de ${room.name} copiado`);
                          }}
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* Código de la sala: la alternativa al link que sobrevive a
                          WhatsApp y se puede dictar por voz. El participante lo pega
                          en "Entrar con el código de tu sala". */}
                      {room.join_code && (
                        <button
                          type="button"
                          title="Copiar código de esta sala"
                          className="flex items-center justify-center gap-1.5 w-full text-[11px] text-muted-foreground hover:text-primary transition-colors"
                          onClick={() => {
                            navigator.clipboard.writeText(room.join_code!);
                            toast.success(`Código de ${room.name}: ${room.join_code}`);
                          }}
                        >
                          <KeyRound className="h-3 w-3" />
                          <span className="font-mono tracking-[0.2em]">{room.join_code}</span>
                          <Copy className="h-2.5 w-2.5 opacity-60" />
                        </button>
                      )}
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
          de las salas ya se ven en vivo en las cards del dashboard. */}
      {activeRoomLk && activeRoomId && (
        <div className="fixed inset-4 z-[110] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted border-b border-border shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
              <DoorOpen className="h-3 w-3" />
              {activeRoomName || "Sala"}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                className="h-6 gap-1 rounded-full px-2.5 text-[11px]"
                onClick={leaveActiveRoom}
                title="Salir de la sala y volver al dashboard"
              >
                <ArrowLeft className="h-3 w-3" /> Volver al dashboard
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-destructive hover:text-destructive/80"
                onClick={leaveActiveRoom}
                title="Colgar llamada"
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
              callDisplayName={activeRoomName || undefined}
              isAdmin={true}
              onLeave={leaveActiveRoom}
              recording={{ source: "cowork", title: activeRoomName || undefined }}
              hideShareLink
              suppressLeaveToast
              initialMicOn={false}
              initialCamOn={false}
              getToken={getActiveRoomToken}
              leaveLabel="Colgar"
            />
          </div>
        </div>
      )}

      {/* HUB EN VENTANA FLOTANTE DEL SO (Document PiP): always-on-top real, movible a
          cualquier monitor, resize nativo. Portalizamos el call view a esa ventana. */}

      {/* Ventanita del Hub DENTRO de Maven (cuando NO está en ventana flotante).
          Arrastrable, redimensionable por la esquina, y con pop-out a ventana del SO. */}
      {hubConnected && cowork.session?.host_hub_livekit_room && (
        <div
          className={`fixed flex flex-col items-end ${hubPinned ? "z-[120]" : "z-30"} ${
            hubPos && !hubMaximized ? "" : "bottom-4 right-4"
          }`}
          style={hubPos && !hubMaximized ? { left: hubPos.x, top: hubPos.y } : undefined}
        >
          {hubMinimized && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 shadow-lg border border-border bg-card hover:bg-muted text-amber-500 rounded-full"
              onClick={() => setHubMinimized(false)}
            >
              <Headphones className="h-3.5 w-3.5" />
              Hub
            </Button>
          )}
          <div
            ref={hubPanelRef}
            className={`relative rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col ${
              hubMaximized
                ? "w-[calc(100vw-2rem)] h-[calc(100vh-2rem)]"
                : hubSize ? "" : "w-[calc(100vw-2rem)] sm:w-96 md:w-[480px]"
            } ${hubMinimized ? "hidden" : ""}`}
            style={hubMaximized ? undefined : {
              ...(hubSize ? { width: hubSize.w, height: hubSize.h } : { height: 380 }),
            }}
          >
            <div className="flex items-center justify-between px-3 py-1.5 bg-muted border-b border-border shrink-0">
              <div
                className={`flex flex-1 items-center gap-1.5 text-xs text-amber-500 font-medium select-none ${hubMaximized ? "" : "cursor-move touch-none"}`}
                onPointerDown={(e) => { if (!hubMaximized) startWindowDrag(e, hubPanelRef, setHubPos, "cowork.hub.pos"); }}
                title={hubMaximized ? undefined : "Arrastra para mover la ventana"}
              >
                <Headphones className="h-3 w-3" />
                Supervisor Hub
              </div>
              <div className="flex gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-5 w-5 ${hubPinned && !ventanaDelSistemaSoportada ? "text-amber-500 hover:text-amber-400" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={popOutHub}
                  title={ventanaDelSistemaSoportada
                    ? (ventanaDelSistemaAbierta
                        ? "Traer el Hub de vuelta a Maven"
                        : "Ventana flotante: siempre al frente y movible a otro monitor")
                    : (hubPinned ? "Fijado al frente (click para soltar)" : "Fijar al frente")}
                >
                  {ventanaDelSistemaSoportada ? <PictureInPicture2 className="h-3 w-3" /> : (hubPinned ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />)}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  onClick={() => setHubMinimized(true)}
                  title="Minimizar"
                >
                  <span className="text-xs leading-none">−</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  onClick={() => setHubMaximized(!hubMaximized)}
                  title={hubMaximized ? "Restaurar" : "Maximizar"}
                >
                  {hubMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-destructive hover:text-destructive/80"
                  onClick={colgarHub}
                  title="Colgar llamada"
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
                title="Arrastra para cambiar el tamaño"
                className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none z-10"
                style={{ background: "linear-gradient(135deg, transparent 50%, hsl(var(--muted-foreground)/0.5) 50%)" }}
              />
            )}
          </div>
        </div>
      )}

      {/* Añadir sala */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Nombre de la sesión</DialogTitle></DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="cowork-session-name">Cómo se llama esta sesión</Label>
            <Input
              id="cowork-session-name"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value.slice(0, 80))}
              onKeyDown={(e) => { if (e.key === "Enter" && sessionName.trim()) void doRenameSession(); }}
              placeholder="Ej: Chatters mañana"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Lo ven todos los participantes de la sesión.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancelar</Button>
            <Button onClick={() => void doRenameSession()} disabled={!sessionName.trim() || renaming}>
              {renaming ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Añadir sala</DialogTitle></DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="cowork-add-room">Nombre de la sala</Label>
            <Input
              id="cowork-add-room"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Ej. Sala 3"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleAddRoom(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddRoom} disabled={roomBusy || !addName.trim()} className="gap-1">
              {roomBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Añadir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar sala (nombre + modo de preview) */}
      <Dialog open={!!editRoom} onOpenChange={(o) => { if (!o) setEditRoom(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Editar sala</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="cowork-edit-room">Nombre</Label>
              <Input id="cowork-edit-room" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border p-3 gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">Mostrar video en vivo</div>
                <div className="text-xs text-muted-foreground">Si lo apagas, la miniatura muestra solo los participantes (sin video).</div>
              </div>
              <Switch checked={editVideo} onCheckedChange={setEditVideo} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditRoom(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={roomBusy}>
              {roomBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cerrar sala (confirmación) */}
      <AlertDialog open={!!closeTarget} onOpenChange={(o) => { if (!o) setCloseTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar la sala «{closeTarget?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la sala y los participantes que estén dentro quedarán sin asignación. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={roomBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleCloseRoom(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {roomBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cerrar sala"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
