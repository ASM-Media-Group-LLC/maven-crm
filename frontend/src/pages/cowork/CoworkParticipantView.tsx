import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeRoomCode, isCompleteRoomCode, ROOM_CODE_LENGTH } from "@/lib/coworkRoomCode";
import { Hand, Loader2, Crown, Phone, PhoneCall, MoreVertical, ArrowLeft, LogOut, KeyRound, DoorOpen, Coffee } from "lucide-react";
import { toast } from "sonner";
import { useFaceNudge } from "@/hooks/useFaceNudge";
import LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";
import { usePersistentCall, CallOutlet } from "@/components/PersistentCallProvider";
import type { useCoworkSession } from "@/hooks/useCoworkSession";
import { supabase } from "@/integrations/supabase/client";
import { useCoworkMediaPresence } from "@/hooks/useCoworkMediaPresence";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  cowork: ReturnType<typeof useCoworkSession>;
  userId: string;
}

// mm:ss mientras dura poco; hh:mm:ss si la pausa se estira.
export function formatBreak(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const sec = totalSeconds % 60;
  const dosDigitos = (n: number) => String(n).padStart(2, "0");
  return h > 0
    ? `${h}:${dosDigitos(m)}:${dosDigitos(sec)}`
    : `${dosDigitos(m)}:${dosDigitos(sec)}`;
}

export default function CoworkParticipantView({ cowork, userId }: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [displayName, setDisplayName] = useState("User");
  const [connectedLkRoom, setConnectedLkRoom] = useState<string | null>(null);
  const [manuallyLeft, setManuallyLeft] = useState(false);
  const prevRoomIdRef = useRef<string | null>(null);
  const dismissedRequestRef = useRef<string | null>(null);
  const pendingOneOnOneRef = useRef(false);
  const oneOnOneSeenInListRef = useRef(false);

  const [oneOnOneRoom, setOneOnOneRoom] = useState<string | null>(null);
  const [oneOnOneRequestId, setOneOnOneRequestId] = useState<string | null>(null);

  // Pantalla "no tengo sala": código para entrar y la última sala para reanudar.
  const [roomCode, setRoomCode] = useState("");
  const [joiningByCode, setJoiningByCode] = useState(false);
  const [lastRoomId, setLastRoomId] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  const myAssignment = cowork.myAssignment;
  const myRoom = cowork.rooms.find(r => r.id === myAssignment?.room_id);

  // Sin asignación activa, buscamos la última sala en la que estuvo para ofrecerle
  // reanudar. Sin esto la única salida sería el código, y quien salió de su propia
  // sala tendría que pedirlo de nuevo al coordinador.
  useEffect(() => {
    const sid = cowork.session?.id;
    if (!sid || myAssignment) return;
    let alive = true;
    cowork.getMyLastRoomId(sid)
      .then((rid) => { if (alive) setLastRoomId(rid); })
      .catch(() => { /* noop */ });
    return () => { alive = false; };
  }, [cowork.session?.id, myAssignment, cowork.getMyLastRoomId]);

  const { trackMediaState } = useCoworkMediaPresence(cowork.session?.id, userId);

  // Pausa (baño). El tiempo lo cuenta el cliente de quien está en pausa y viaja
  // por presence, así el coordinador lo ve en vivo aunque recargue su dashboard.
  const [breakStartedAt, setBreakStartedAt] = useState<number | null>(null);
  const [breakElapsed, setBreakElapsed] = useState(0);
  const lastMediaRef = useRef<{ micOn: boolean; camOn: boolean; screenShareOn: boolean }>({
    micOn: false, camOn: false, screenShareOn: false,
  });
  const faceRef = useRef<{ faceState: string | null; faceSince: number | null }>({
    faceState: null, faceSince: null,
  });

  useEffect(() => {
    if (!breakStartedAt) { setBreakElapsed(0); return; }
    const tick = () => setBreakElapsed(Math.floor((Date.now() - breakStartedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [breakStartedAt]);

  const [breakKind, setBreakKind] = useState<"bano" | "break" | null>(null);
  const [breakLimite, setBreakLimite] = useState<number | null>(null);

  // La pausa la abre y la cierra el SERVIDOR: el reloj no puede ser el del
  // navegador de quien está siendo medido. Lo que viaja por presence sigue
  // siendo el arranque, para que el coordinador lo vea en vivo, pero el
  // registro real y el tiempo que cuenta son los de la base.
  const toggleBreak = useCallback(async (kind: "bano" | "break" = "bano") => {
    const cerrando = !!breakStartedAt;
    try {
      const r = await cowork.setBreak?.(cerrando ? null : kind);
      const inicio = cerrando ? null : (r?.startedAt ?? Date.now());
      setBreakStartedAt(inicio);
      setBreakKind(cerrando ? null : kind);
      setBreakLimite(cerrando ? null : (r?.limiteMinutos ?? null));
      trackMediaState({
        ...lastMediaRef.current,
        onBreak: !cerrando, breakStartedAt: inicio, breakKind: cerrando ? null : kind,
        ...faceRef.current,
      });
    } catch (e) {
      toast.error("No se pudo registrar la pausa", { description: (e as Error).message });
    }
  }, [breakStartedAt, trackMediaState, cowork]);

  const { startCall, endCall } = usePersistentCall();

  // Salir de la sala: libera la asignación del lado del servidor (para que el
  // dashboard del coordinador se entere) y saca al chatter de Cowork.
  const handleLeaveRoom = useCallback(async () => {
    setConnectedLkRoom(null);
    setManuallyLeft(true);
    endCall();
    try { await cowork.leaveRoom?.(); } catch { /* best-effort */ }
    toast.success("Saliste de la sala");
    navigate("/dashboard");
  }, [cowork, navigate, endCall]);

  // La config de la llamada se arma UNA vez por sala. Los callbacks se leen por
  // ref: si fueran dependencias, cualquier cambio de estado del componente
  // reiniciaría la videollamada.
  const cbRef = useRef({ getToken, handleMediaStateChange, handleFaceStateChange, handleLeaveRoom });
  cbRef.current = { getToken, handleMediaStateChange, handleFaceStateChange, handleLeaveRoom };

  // El encuadre lo calcula LiveKitCallView sobre el video local y lo reporta acá;
  // nosotros solo lo republicamos por presence para que lo vea el coordinador.
  // Lo que ve la propia persona. Hasta ahora el encuadre solo viajaba al
  // coordinador: quien estaba fuera de cuadro no se enteraba y se quedaba así.
  const [faceWatch, setFaceWatch] = useState<{ state: string; since: number } | null>(null);
  useFaceNudge(faceWatch as never, !!breakStartedAt);

  const handleFaceStateChange = useCallback(
    (watch: { state: string; since: number }) => {
      setFaceWatch(watch);
      faceRef.current = { faceState: watch.state, faceSince: watch.since };
      trackMediaState({
        ...lastMediaRef.current,
        onBreak: !!breakStartedAt,
        breakStartedAt,
        ...faceRef.current,
      });
    },
    [breakStartedAt, trackMediaState]
  );
  // Compartir pantalla ya es DIRECTO (el token de sala lo permite para todos) —
  // acá solo reportamos el estado de media para que el dashboard lo muestre.
  const handleMediaStateChange = useCallback(
    (state: { micOn: boolean; camOn: boolean; screenShareOn: boolean }) => {
      // Guardamos el último estado de media para poder re-publicarlo junto con la
      // pausa: presence reemplaza el payload entero en cada track().
      lastMediaRef.current = state;
      trackMediaState({ ...state, onBreak: !!breakStartedAt, breakStartedAt, ...faceRef.current });
    },
    [trackMediaState, breakStartedAt]
  );

  const reconnectToMainRoom = useCallback(() => {
    setOneOnOneRoom(null);
    setOneOnOneRequestId(null);
    setManuallyLeft(false);
    if (myRoom?.livekit_room_name) setConnectedLkRoom(myRoom.livekit_room_name);
  }, [myRoom?.livekit_room_name]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).single();
        setDisplayName(profile?.full_name || "User");
      }
    });
  }, []);

  // Best-effort: release the room assignment when the tab/browser is closing,
  // so the host dashboard removes the participant immediately. We use `pagehide`
  // (more reliable than `beforeunload` on mobile/iOS) and `fetch` with
  // `keepalive: true` so the request completes even if the page is unloading.
  useEffect(() => {
    const sessionId = cowork.session?.id;
    if (!sessionId) return;

    const sendLeaveBeacon = () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cowork-session`;
        supabase.auth.getSession().then(({ data }) => {
          const token = data.session?.access_token;
          if (!token) return;
          void fetch(url, {
            method: "POST",
            keepalive: true,
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ action: "leaveRoom", sessionId }),
          }).catch(() => {});
        });
      } catch {
        // best-effort; ignore
      }
    };

    const handlePageHide = (e: PageTransitionEvent) => {
      // Skip when the page is being stored in the bfcache (it may resume later).
      if (e.persisted) return;
      sendLeaveBeacon();
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      // SPA navigation away → release the slot too.
      sendLeaveBeacon();
    };
  }, [cowork.session?.id]);

  useEffect(() => {
    if (myAssignment?.room_id && prevRoomIdRef.current && myAssignment.room_id !== prevRoomIdRef.current) {
      setManuallyLeft(false);
    }
    prevRoomIdRef.current = myAssignment?.room_id || null;

    if (manuallyLeft || oneOnOneRoom) return;
    if (myRoom?.livekit_room_name && myRoom.livekit_room_name !== connectedLkRoom) {
      setConnectedLkRoom(myRoom.livekit_room_name);
    }
  }, [myRoom?.livekit_room_name, manuallyLeft, myAssignment?.room_id, oneOnOneRoom]);

  const myOpenRequest = cowork.hostRequests.find(
    r => r.user_id === userId && (r.status === "open" || r.status === "acknowledged")
  );

  useEffect(() => {
    if (!oneOnOneRequestId) {
      oneOnOneSeenInListRef.current = false;
      return;
    }
    const req = cowork.hostRequests.find(r => r.id === oneOnOneRequestId);
    if (req) oneOnOneSeenInListRef.current = true;
    if (!oneOnOneSeenInListRef.current) return;
    if (req?.status === "resolved" || !req) {
      dismissedRequestRef.current = null;
      reconnectToMainRoom();
      toast.info("Llamada privada con coordinador finalizada");
    }
  }, [cowork.hostRequests, oneOnOneRequestId, reconnectToMainRoom]);

  useEffect(() => {
    if (oneOnOneRequestId || pendingOneOnOneRef.current) return;
    const existingReq = cowork.hostRequests.find(
      r => r.user_id === userId && (r.status === "open" || r.status === "acknowledged") && r.oneone_livekit_room
    );
    if (existingReq && dismissedRequestRef.current !== existingReq.id) {
      setOneOnOneRequestId(existingReq.id);
      setOneOnOneRoom(existingReq.oneone_livekit_room!);
      setConnectedLkRoom(null);
    }
  }, [cowork.hostRequests, userId, oneOnOneRequestId]);

  const dismissedActiveRequest = cowork.hostRequests.find(
    r => r.user_id === userId
      && (r.status === "open" || r.status === "acknowledged")
      && r.oneone_livekit_room
      && r.id === dismissedRequestRef.current
  );

  const getToken = useCallback(async () => {
    // El token de sala ya permite compartir pantalla a todos (sin flujo de permisos).
    const result = await cowork.issueLiveKitToken("join_room");
    return { token: result.token, url: result.url };
  }, [cowork.issueLiveKitToken]);

  const getOneOnOneToken = useCallback(async () => {
    if (!oneOnOneRequestId) throw new Error("No 1:1 request");
    const result = await cowork.joinOneOnOne(oneOnOneRequestId);
    return { token: result.token, url: result.url };
  }, [cowork.joinOneOnOne, oneOnOneRequestId]);

  if (!myAssignment) {
    // ANTES: un spinner con "Esperando asignación de sala por el coordinador…".
    // Era una espera IMPOSIBLE: `assignToRoom` se eliminó al pasar a self-join por
    // URL, así que ningún coordinador podía asignar nada y el participante quedaba
    // trabado para siempre (pasaba al volver sin `?room=`, al entrar por el lobby,
    // o al salir de la sala). Ahora la pantalla ofrece las dos salidas reales:
    // reanudar la última sala, o canjear el código que dio el coordinador.
    const resumeLastRoom = async () => {
      if (!lastRoomId || !cowork.session?.id) return;
      setResuming(true);
      try {
        await cowork.joinSession(cowork.session.id, "participant", undefined, lastRoomId);
        cowork.refetch();
      } catch (e: any) {
        toast.error(e.message || "No se pudo volver a tu sala");
      } finally {
        setResuming(false);
      }
    };

    const enterWithCode = async () => {
      const code = normalizeRoomCode(roomCode);
      if (!isCompleteRoomCode(code)) return;
      setJoiningByCode(true);
      try {
        await cowork.joinByCode(code);
        setRoomCode("");
        cowork.refetch();
      } catch (e: any) {
        toast.error(e.message || "No se pudo entrar con ese código");
      } finally {
        setJoiningByCode(false);
      }
    };

    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 p-4">
        <div className="flex flex-col items-center gap-4 bg-primary/5 rounded-3xl px-6 md:px-10 py-8 md:py-10 max-w-sm w-full">
          <div className="flex items-center justify-center h-14 w-14 rounded-full bg-primary/10">
            <DoorOpen className="h-7 w-7 text-primary" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-foreground font-semibold text-center">Todavía no estás en una sala</p>
            <p className="text-xs text-muted-foreground/70">{cowork.session?.name}</p>
          </div>

          {lastRoomId && (
            <Button onClick={resumeLastRoom} disabled={resuming} className="w-full rounded-full gap-2">
              {resuming ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />}
              Volver a mi sala
            </Button>
          )}

          <div className="w-full flex flex-col gap-2">
            <span className="text-xs text-muted-foreground text-center">
              {lastRoomId ? "O entra con el código de otra sala" : "Entra con el código que te dio tu coordinador"}
            </span>
            <div className="flex gap-2">
              <Input
                value={roomCode}
                onChange={(e) => setRoomCode(normalizeRoomCode(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && enterWithCode()}
                placeholder="ABC234"
                maxLength={ROOM_CODE_LENGTH}
                className="rounded-full text-center font-mono tracking-[0.25em] uppercase"
              />
              <Button
                onClick={enterWithCode}
                disabled={!isCompleteRoomCode(roomCode) || joiningByCode}
                className="rounded-full gap-1 shrink-0"
              >
                {joiningByCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Entrar
              </Button>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-muted-foreground"
            onClick={() => navigate("/cowork", { replace: true })}
          >
            Volver a Cowork
          </Button>
        </div>
      </div>
    );
  }

  const isInOneOnOne = !!oneOnOneRoom;

  // Action handlers for both inline and dropdown
  const handleRequestHost = async () => {
    dismissedRequestRef.current = null;
    try {
      await cowork.requestHost(myAssignment.room_id, "Necesito ayuda");
      toast.success("Solicitud enviada al coordinador");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRequestOneOnOne = async () => {
    pendingOneOnOneRef.current = true;
    try {
      const result = await cowork.requestHost(myAssignment.room_id, "Llamada privada", true);
      toast.success("Solicitud de llamada privada enviada al coordinador");
      const roomName = result?.oneone_livekit_room || result?.request?.oneone_livekit_room;
      const reqId = result?.request?.id;
      if (roomName && reqId) {
        setOneOnOneRequestId(reqId);
        setOneOnOneRoom(roomName);
        setConnectedLkRoom(null);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      pendingOneOnOneRef.current = false;
    }
  };

  const handleReconnectPrivateCall = () => {
    if (!dismissedActiveRequest) return;
    dismissedRequestRef.current = null;
    setOneOnOneRequestId(dismissedActiveRequest.id);
    setOneOnOneRoom(dismissedActiveRequest.oneone_livekit_room!);
    setConnectedLkRoom(null);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 md:px-4 py-2 bg-card border-b border-border z-10 shrink-0">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          {isInOneOnOne ? (
            <>
              <Crown className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-amber-500 text-sm font-medium truncate">Llamada privada con coordinador</span>
            </>
          ) : (
            <>
              <span className="text-foreground text-sm font-medium truncate">{myRoom?.name || "Sala"}</span>
              <span className="text-muted-foreground/70 text-xs hidden sm:inline">{cowork.session?.name}</span>
            </>
          )}
        </div>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-2">
          {dismissedActiveRequest && !isInOneOnOne && (
            <Button variant="ghost" size="sm" className="text-amber-500 hover:text-amber-400 hover:bg-amber-500/10 gap-1.5 animate-pulse rounded-full" onClick={handleReconnectPrivateCall}>
              <PhoneCall className="h-4 w-4" /> Reconectar a llamada privada
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-muted gap-1.5 rounded-full" disabled={isInOneOnOne} onClick={handleRequestHost}>
            <Hand className="h-4 w-4" /> {myOpenRequest && !isInOneOnOne ? "Solicitud enviada" : "Pedir coordinador"}
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-muted gap-1.5 rounded-full" disabled={!!myOpenRequest || isInOneOnOne} onClick={handleRequestOneOnOne}>
            <Phone className="h-4 w-4" /> {isInOneOnOne ? "En llamada privada..." : "Llamada privada coordinador"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`gap-1.5 rounded-full ${breakStartedAt ? "text-amber-500 hover:text-amber-400 hover:bg-amber-500/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
            onClick={breakStartedAt ? () => toggleBreak() : undefined}
            title={breakStartedAt ? "Avisar que volviste" : "Avisar que te ausentás un momento"}
            asChild={!breakStartedAt}
          >
            {breakStartedAt ? (
              <>
                <Coffee className="h-4 w-4" />
                {`${breakKind === "break" ? "Break" : "Baño"} · ${formatBreak(breakElapsed)}`}
                {breakLimite != null && breakElapsed > breakLimite * 60 && (
                  <span className="text-destructive">· pasado</span>
                )}
              </>
            ) : (
              <span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <span className="inline-flex items-center gap-1.5 cursor-pointer">
                      <Coffee className="h-4 w-4" /> Pausa
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => toggleBreak("bano")}>Baño</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleBreak("break")}>Break (30 min)</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            )}
          </Button>
          {/* Compartir pantalla ahora es DIRECTO desde los controles de la llamada
              (abajo), sin pedir permiso — el token de sala lo habilita para todos. */}
        </div>

        {/* Mobile actions dropdown */}
        <div className="flex md:hidden items-center gap-1">
          {dismissedActiveRequest && !isInOneOnOne && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-500 animate-pulse rounded-full" onClick={handleReconnectPrivateCall}>
              <PhoneCall className="h-4 w-4" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem onClick={handleRequestHost} disabled={isInOneOnOne}>
                <Hand className="h-4 w-4 mr-2" />
                {myOpenRequest && !isInOneOnOne ? "Solicitud enviada" : "Pedir coordinador"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRequestOneOnOne} disabled={!!myOpenRequest || isInOneOnOne}>
                <Phone className="h-4 w-4 mr-2" />
                {isInOneOnOne ? "En llamada privada..." : "Llamada privada con coordinador"}
              </DropdownMenuItem>
              {breakStartedAt ? (
                <DropdownMenuItem onClick={() => toggleBreak()}>
                  <Coffee className="h-4 w-4 mr-2" />
                  {`${breakKind === "break" ? "Break" : "Baño"} · ${formatBreak(breakElapsed)}`}
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => toggleBreak("bano")}>
                    <Coffee className="h-4 w-4 mr-2" /> Baño
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toggleBreak("break")}>
                    <Coffee className="h-4 w-4 mr-2" /> Break (30 min)
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Video area */}
      <div className="flex-1 min-h-0">
        {isInOneOnOne && oneOnOneRoom && oneOnOneRequestId ? (
          <LiveKitCallView
            key={`oneOnOne-${oneOnOneRoom}`}
            roomName={oneOnOneRoom}
            displayName={displayName}
            callDisplayName="Llamada privada con coordinador"
            isAdmin={false}
            onLeave={async () => {
              const reqId = oneOnOneRequestId;
              dismissedRequestRef.current = reqId;
              // Resolver la solicitud 1:1 para que NO quede abierta en la BD y vuelva a
              // secuestrar al participante tras recargar o al aprobarle una pantalla.
              if (reqId) { try { await cowork.resolveHostRequest(reqId); } catch { /* best-effort */ } }
              reconnectToMainRoom();
            }}
            hideShareLink
            suppressLeaveToast
            autoLeaveOnEmpty={undefined}
            initialMicOn={false}
            initialCamOn={false}
            getToken={getOneOnOneToken}
            leaveLabel="Regresar a la sala"
            leaveIcon={ArrowLeft}
          />
        ) : connectedLkRoom ? (
          // VUELTA ATRÁS a montar la llamada acá mismo.
          //
          // Se había movido al PersistentCallProvider para que sobreviviera al
          // navegar a otra sección, pero desde ese cambio a varias chatters se
          // les quedaba la pantalla en negro al entrar. Intenté arreglarlo por
          // el lado del portal (el <video> se pausa al salir del documento) y no
          // alcanzó. Con gente sin poder trabajar, la llamada vuelve a donde
          // funcionaba y la ventanita se retoma cuando se pueda probar en vivo.
          //
          // El provider queda montado: no molesta si nadie lo usa, y el Hub del
          // coordinador va a necesitarlo.
          <LiveKitCallView
            key={`room-${connectedLkRoom}`}
            roomName={connectedLkRoom}
            displayName={displayName}
            callDisplayName={myRoom?.name}
            isAdmin={false}
            recording={{ source: "cowork", title: myRoom?.name || undefined }}
            onLeave={handleLeaveRoom}
            hideShareLink
            suppressLeaveToast
            initialMicOn={false}
            initialCamOn={false}
            getToken={getToken}
            onMediaStateChange={handleMediaStateChange}
            onFaceStateChange={handleFaceStateChange}
            leaveLabel="Salir y volver al dashboard"
            leaveIcon={LogOut}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
          </div>
        )}
      </div>
    </div>
  );
}
