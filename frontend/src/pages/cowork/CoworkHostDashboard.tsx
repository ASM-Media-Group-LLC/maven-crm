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
  Pin, PinOff, PhoneOff, PictureInPicture2, KeyRound, Copy,
} from "lucide-react";
import { toast } from "sonner";
import LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";
import CoworkRoomMonitor from "./CoworkRoomMonitor";
import { usePipWindow } from "./usePipWindow";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { useCoworkMediaPresence } from "@/hooks/useCoworkMediaPresence";
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
  const [hubConnected, setHubConnected] = useState(false);
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
  const hubPip = usePipWindow();

  const toggleHubPinned = () => {
    setHubPinned(p => {
      const next = !p;
      try { localStorage.setItem("cowork.hub.pinned", next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  };

  // Abre el Hub como ventana flotante del SO (pop-out). Fallback: toggle z-index.
  const popOutHub = async () => {
    if (hubPip.pipWindow) { hubPip.closePip(); return; }
    if (hubPip.supported) {
      const ok = await hubPip.openPip({ width: hubSize?.w ?? 480, height: hubSize?.h ?? 420 });
      if (!ok) { toast.error("No pude abrir la ventana flotante"); toggleHubPinned(); }
    } else {
      toast.info("Tu navegador no soporta ventana flotante multi-monitor (usá Chrome/Edge). Fijo al frente dentro de Maven.");
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
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [editRoom, setEditRoom] = useState<CoworkRoom | null>(null);
  const [editName, setEditName] = useState("");
  const [editVideo, setEditVideo] = useState(true);
  const [closeTarget, setCloseTarget] = useState<CoworkRoom | null>(null);
  const [roomBusy, setRoomBusy] = useState(false);
  // Central de audio del coordinador: master del micro + escuchar/hablar por sala + micro compartido.
  const [globalMic, setGlobalMic] = useState(false);
  const [roomHear, setRoomHear] = useState<Record<string, boolean>>({});
  const [roomMic, setRoomMic] = useState<Record<string, boolean>>({});
  const [micBaseTrack, setMicBaseTrack] = useState<MediaStreamTrack | null>(null);
  const hearFor = (roomId: string) => roomHear[roomId] ?? true;   // por defecto se escuchan todas
  const broadcastFor = (roomId: string) => globalMic && (roomMic[roomId] ?? false); // hablar = master && sala

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

  useEffect(() => {
    if (profileLoaded && cowork.session?.host_hub_livekit_room) {
      setHubConnected(true);
    }
  }, [profileLoaded, cowork.session?.host_hub_livekit_room]);

  // Central de audio: captura del micro compartido para broadcastear a varias salas. Se toma
  // UNA vez al activar el master y cada sala publica un clon (CoworkRoomMonitor). El Coordinador
  // Hub queda INDEPENDIENTE (no se corta al togglear el micro global): su mic está apagado por
  // defecto, así que no hay conflicto de captura ni doble publicación de tu voz.
  useEffect(() => {
    if (!globalMic) return;
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
        if (!cancelled) { toast.error("No pude acceder al micrófono"); setGlobalMic(false); }
      }
    })();
    return () => {
      cancelled = true;
      setMicBaseTrack(null);
      try { track?.stop(); } catch { /* noop */ }
    };
  }, [globalMic]);

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

  // Quién comparte pantalla en cada sala — VERDAD de LiveKit reportada por cada
  // CoworkRoomMonitor (más confiable que el presence auto-reportado, que fallaba y
  // mostraba "nadie comparte" aunque alguien lo estuviera haciendo).
  const [roomSharers, setRoomSharers] = useState<Record<string, string[]>>({});
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
      <div className={`
        fixed md:relative z-40 md:z-auto
        w-72 md:w-80 h-full
        border-r border-border flex flex-col bg-card
        transition-transform duration-200 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{cowork.session?.name}</h2>
              <p className="text-xs text-muted-foreground">Coordinador Dashboard</p>
            </div>
            <div className="flex gap-1">
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
                  setHubConnected(false);
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
              <span>Coordinador Hub</span>
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
                  onClick={() => setHubConnected(true)}
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
                          Atender
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
                  variant={globalMic ? "default" : "outline"}
                  className={`gap-1.5 rounded-full h-8 ${globalMic ? "bg-success hover:bg-success/90 text-white border-transparent" : ""}`}
                  title={globalMic ? "Micrófono activo: tu voz va a las salas que tengan el 🎤 encendido. Tocá para silenciar todo." : "Activá tu micrófono para poder hablarle a las salas (después elegí a cuáles con el 🎤 de cada sala)."}
                  onClick={() => setGlobalMic((v) => !v)}
                >
                  {globalMic ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                  {globalMic ? "Micrófono activo" : "Mi micrófono"}
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
                return (
                  <div key={room.id} className={`bg-card border rounded-2xl overflow-hidden ${sharers.length ? "border-primary/50" : "border-border"}`}>
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
                              />
                            </div>
                          )}

                          {/* Central de audio por sala: escuchar (🔊) y hablarle (🎤) */}
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-7 flex-1 text-[11px] gap-1 rounded-lg ${hearFor(room.id) ? "text-foreground" : "text-muted-foreground/50"}`}
                              title={hearFor(room.id) ? "Escuchando esta sala. Tocá para silenciar su audio." : "Sala silenciada (no la oís). Tocá para escuchar."}
                              onClick={() => setRoomHear((m) => ({ ...m, [room.id]: !hearFor(room.id) }))}
                            >
                              {hearFor(room.id) ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                              {hearFor(room.id) ? "Escuchando" : "Silenciada"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-7 flex-1 text-[11px] gap-1 rounded-lg ${broadcastFor(room.id) ? "text-success" : "text-muted-foreground/50"}`}
                              title={globalMic ? (broadcastFor(room.id) ? "Tu voz va a esta sala. Tocá para dejar de hablarle." : "Tocá para hablarle a esta sala.") : "Activá 'Mi micrófono' arriba para poder hablarle a las salas."}
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
      {hubConnected && cowork.session?.host_hub_livekit_room && hubPip.pipWindow && createPortal(
        <div className="w-full h-screen flex flex-col bg-card text-foreground">
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted border-b border-border shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-amber-500 font-medium">
              <Headphones className="h-3 w-3" /> Coordinador Hub
            </div>
            <div className="flex gap-1">
              <Button variant="secondary" size="sm" className="h-6 gap-1 rounded-full px-2.5 text-[11px]" onClick={hubPip.closePip} title="Traer de vuelta a Maven">
                <ArrowLeft className="h-3 w-3" /> A Maven
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive/80" onClick={() => { hubPip.closePip(); setHubConnected(false); }} title="Colgar llamada">
                <PhoneOff className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <LiveKitCallView
              roomName={cowork.session.host_hub_livekit_room}
              displayName={displayName}
              callDisplayName="Coordinador Hub"
              isAdmin={true}
              onLeave={() => { hubPip.closePip(); setHubConnected(false); }}
              hideShareLink hideLeaveButton suppressLeaveToast
              initialMicOn={false} initialCamOn={false}
              getToken={getHubToken}
            />
          </div>
        </div>,
        hubPip.pipWindow.document.body,
      )}

      {/* Ventanita del Hub DENTRO de Maven (cuando NO está en ventana flotante).
          Arrastrable, redimensionable por la esquina, y con pop-out a ventana del SO. */}
      {hubConnected && cowork.session?.host_hub_livekit_room && !hubPip.pipWindow && (
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
                title={hubMaximized ? undefined : "Arrastrá para mover la ventana"}
              >
                <Headphones className="h-3 w-3" />
                Coordinador Hub
              </div>
              <div className="flex gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-5 w-5 ${hubPinned && !hubPip.supported ? "text-amber-500 hover:text-amber-400" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={popOutHub}
                  title={hubPip.supported
                    ? "Ventana flotante: siempre al frente y movible a otro monitor"
                    : (hubPinned ? "Fijado al frente (click para soltar)" : "Fijar al frente")}
                >
                  {hubPip.supported ? <PictureInPicture2 className="h-3 w-3" /> : (hubPinned ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />)}
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
                  onClick={() => { setHubConnected(false); setHubMaximized(false); }}
                  title="Colgar llamada"
                >
                  <PhoneOff className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <LiveKitCallView
                roomName={cowork.session.host_hub_livekit_room}
                displayName={displayName}
                callDisplayName="Coordinador Hub"
                isAdmin={true}
                onLeave={() => { setHubConnected(false); setHubMaximized(false); }}
                hideShareLink
                hideLeaveButton
                suppressLeaveToast
                initialMicOn={false}
                initialCamOn={false}
                getToken={getHubToken}
                compact={!hubMaximized}
              />
            </div>
            {/* Handle de resize (esquina inferior derecha), solo en modo ventanita. */}
            {!hubMaximized && (
              <div
                onPointerDown={startHubResize}
                title="Arrastrá para cambiar el tamaño"
                className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none z-10"
                style={{ background: "linear-gradient(135deg, transparent 50%, hsl(var(--muted-foreground)/0.5) 50%)" }}
              />
            )}
          </div>
        </div>
      )}

      {/* Añadir sala */}
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
                <div className="text-xs text-muted-foreground">Si lo apagás, la miniatura muestra solo los participantes (sin video).</div>
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
