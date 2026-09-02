import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeRoomCode, isCompleteRoomCode, ROOM_CODE_LENGTH } from "@/lib/coworkRoomCode";
import { Hand, Loader2, Crown, Phone, PhoneCall, MoreVertical, ArrowLeft, LogOut, KeyRound, DoorOpen, Coffee } from "lucide-react";
import { toast } from "sonner";
import LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";
import { usePersistentCall, CallOutlet } from "@/components/PersistentCallProvider";
import type { useCoworkSession } from "@/hooks/useCoworkSession";
import { supabase } from "@/integrations/supabase/client";
import { useCoworkMediaPresence, salirDePresencia } from "@/hooks/useCoworkMediaPresence";
import { marcarPausa } from "@/lib/coworkPausa";
import { fijarReglas, normalizarReglas } from "@/lib/coworkReglas";
import { cn } from "@/lib/utils";
import { rpcBanoConsumido, leerLimitesPausa } from "@/lib/coworkTablas";
import { cuentaPausa, clasesPausa, fraseFinDePausa, REPETIR_FIN_PAUSA_MS, fraseDiaAgotado, LIMITE_DIARIO_AGOTADO_MS } from "@/lib/pausaCowork";
import { hablar } from "@/lib/voz";
import { playMessageNotification } from "@/lib/notificationSound";
import { useIsMobile } from "@/hooks/use-mobile";
import { marcarDescartada, fueDescartada, olvidarDescartada } from "@/lib/solicitudPrivada";
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

/** ¿La fila de la sesión trae topes de pausa PROPIOS? `alert_rules` llega como
 *  jsonb sin tipar (`unknown`), y una sesión con reglas solo de cámara sigue a
 *  la tabla para las pausas: eso es lo correcto, no un hueco. */
function traePausasPropias(raw: unknown): boolean {
  return !!raw && typeof raw === "object" && (raw as { pausas?: unknown }).pausas != null;
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

  // `persistente`: la presencia del chatter tiene que durar lo que dura su
  // LLAMADA, no lo que dura esta página. Al navegar a otra sección la llamada
  // sigue viva en la ventanita flotante; si el canal de presencia se cerrara
  // acá, el coordinador lo vería IRSE de la sala sin que se haya ido.
  const { trackMediaState } = useCoworkMediaPresence(
    cowork.session?.id, userId, { persistente: true },
  );

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

  // ── Recuperar la pausa que quedó abierta ───────────────────────────────
  //
  // El arranque de la pausa vivía SOLO en memoria de esta pestaña. Si la
  // pestaña se recargaba —el banner de actualización de la PWA, el service
  // worker, un F5, un crash— Maven se olvidaba de que la persona estaba en
  // pausa, aunque la fila siguiera abierta en la base. Dos consecuencias, y la
  // segunda es la peor:
  //
  //   · el contador arrancaba de cero, así que el aviso de "se te acabó el
  //     break" no saltaba nunca;
  //   · el botón volvía a decir "Baño" en vez de "Volver", así que al volver se
  //     abría una pausa NUEVA en lugar de cerrar la anterior. Y como nada
  //     cierra las pausas abiertas, la primera quedaba colgada para siempre.
  //
  // El servidor sí lo sabía todo el tiempo. Solo había que preguntárselo.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const p = await cowork.getPausaAbierta?.();
        // Si mientras tanto la persona marcó o cerró una pausa a mano, gana lo
        // que hizo ella: no se le pisa una acción con una respuesta vieja.
        if (!vivo || !p) return;
        setBreakStartedAt((actual) => (actual === null ? p.startedAt : actual));
        setBreakKind((actual) => (actual === null ? p.kind : actual));
        setBreakLimite((actual) => (actual === null ? p.limiteMinutos : actual));
      } catch { /* si no se pudo consultar, queda como estaba */ }
    })();
    return () => { vivo = false; };
    // Una sola vez al montar: después el estado lo manda `toggleBreak`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Las reglas de ESTA sesión (qué alertas existen y cuándo saltan) van al
  // store de `coworkReglas`, no por props, por la misma razón que la pausa: los
  // avisos corren dentro de la llamada, que sobrevive a esta página, y las
  // leen en cada tic. Como el realtime de la sesión refetchea la fila, un cambio
  // del supervisor pasa por acá y llega en vivo. `null`/sin columna = estándar.
  const alertRulesDeSesion: unknown = cowork.session?.alert_rules;
  useEffect(() => {
    fijarReglas(normalizarReglas(alertRulesDeSesion));
  }, [alertRulesDeSesion]);
  // Los topes salen de la BASE (cowork_break_limits), no de un número escrito
  // acá. El menú decía "Break (30 min)" y "Baño" a secas: si mañana alguien
  // cambia el tope en la tabla, el cartel seguiría prometiendo lo viejo.
  //
  // Salvo que la sesión traiga pausas propias en `alert_rules`: ahí mandan
  // esas, porque son las que el supervisor eligió para este grupo (a las
  // managers no se les mide el break igual que a los chatters). La tabla queda
  // como el estándar de toda sesión sin reglas propias.
  const [limitesPausa, setLimitesPausa] = useState<Record<string, number>>({});
  useEffect(() => {
    if (traePausasPropias(alertRulesDeSesion)) {
      const { pausas } = normalizarReglas(alertRulesDeSesion);
      setLimitesPausa({ bano: pausas.banoMin, break: pausas.breakMin });
      return;
    }
    // Si la sesión trae pausas propias mientras la tabla todavía responde, la
    // respuesta vieja no debe pisar lo que eligió el supervisor.
    let vigente = true;
    void leerLimitesPausa(supabase).then((l) => { if (vigente) setLimitesPausa(l); });
    return () => { vigente = false; };
  }, [alertRulesDeSesion]);
  // Cuánto baño gastó HOY esta persona (pausas ya cerradas). El baño es un
  // presupuesto DIARIO de 10 minutos, no un permiso de 10 cada vez: quien fue
  // una vez y tardó 4, la próxima arranca en 6.
  //
  // Lo cuenta el SERVIDOR: el navegador de quien está siendo medido no puede
  // ser la fuente, y además el presupuesto cruza sesiones y salas.
  const [banoConsumido, setBanoConsumido] = useState(0);
  const recargarConsumido = useCallback(async () => {
    if (!userId) return;
    const { data } = await rpcBanoConsumido(supabase, [userId]);
    setBanoConsumido(data?.[0]?.segundos ?? 0);
  }, [userId]);
  // Al entrar, y cada vez que se cierra una pausa (ahí cambia el acumulado).
  useEffect(() => { void recargarConsumido(); }, [recargarConsumido]);
  useEffect(() => { if (!breakStartedAt) void recargarConsumido(); }, [breakStartedAt, recargarConsumido]);

  /** Lo ya gastado hoy solo cuenta para el baño; el break sigue siendo por pausa. */
  const consumidoDe = (kind: "bano" | "break" | null) => (kind === "break" ? 0 : banoConsumido);

  // Avisar EN VOZ cuando se acaba la pausa.
  //
  // Quien está en pausa está lejos de la pantalla —es el sentido de la pausa—
  // así que el cartel rojo no le llega. Por eso se habla, y por eso se repite:
  // el primer aviso, casi por definición, no lo escucha nadie.
  const avisoFinPausa = useRef(0);
  useEffect(() => {
    if (!breakStartedAt || breakLimite == null) { avisoFinPausa.current = 0; return; }
    const revisar = () => {
      const transcurrido = Math.floor((Date.now() - breakStartedAt) / 1000) + consumidoDe(breakKind);
      const pasadoMs = (transcurrido - breakLimite * 60) * 1000;
      if (pasadoMs < 0) return;                       // todavía le queda tiempo
      const ahora = Date.now();
      if (ahora - avisoFinPausa.current < REPETIR_FIN_PAUSA_MS) return;
      avisoFinPausa.current = ahora;
      playMessageNotification(0.5);
      // Pasarse un minuto es una cosa; haberse gastado el presupuesto del día
      // es otra, y merece que se lo digan con esas palabras.
      const diaAgotado = breakKind !== "break" && pasadoMs >= LIMITE_DIARIO_AGOTADO_MS;
      hablar(diaAgotado ? fraseDiaAgotado() : fraseFinDePausa(breakKind));
      toast.warning(
        diaAgotado ? "Excediste tu tiempo de baño del día" : "Se acabó tu tiempo de pausa",
        {
          description: diaAgotado
            ? "El baño son 10 minutos por día en total. Por favor, regresa a tu puesto."
            : "Vuelve a tu puesto y quita la pausa para que quede registrado.",
          duration: 10_000,
          id: "fin-pausa",
        },
      );
    };
    revisar();
    const id = window.setInterval(revisar, 5_000);
    return () => window.clearInterval(id);
  }, [breakStartedAt, breakLimite, breakKind, banoConsumido]);

  const etiquetaPausa = (kind: "bano" | "break") => {
    const nombre = kind === "break" ? "Break" : "Baño";
    const min = limitesPausa[kind];
    return min != null ? `${nombre} (${min} min)` : nombre;
  };

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
    // Se fue de verdad: acá el `leave` del presence SÍ corresponde.
    salirDePresencia();
    // Y vuelve el estándar: las reglas eran de ESA sesión. La próxima que se
    // abra las fija de nuevo al cargar su fila.
    fijarReglas(null);
    try { await cowork.leaveRoom?.(); } catch { /* best-effort */ }
    toast.success("Saliste de la sala");
    // Solo se lo lleva a otro lado si esta MIRANDO Cowork: ahi la pantalla se
    // queda sin contenido y hay que mandarlo a alguna parte.
    //
    // Si colgo desde la ventanita flotante mientras trabajaba en otra seccion
    // —Messenger, Contactos, lo que sea— sacarlo de donde estaba es perderle el
    // trabajo: el formulario a medio llenar, la conversacion abierta, el scroll.
    // Colgar una llamada no es pedir que te muevan de pantalla.
    //
    // Se lee `window.location` en el momento y no `useLocation()` a proposito:
    // esta funcion viaja dentro de la config de la llamada, que se arma UNA vez
    // por sala. Meterle la ruta como dependencia reiniciaria la videollamada en
    // cada navegacion, que es exactamente el bug que estamos evitando.
    if (window.location.pathname.startsWith("/cowork")) navigate("/dashboard");
  }, [cowork, navigate, endCall]);

  // La config de la llamada se arma UNA vez por sala. Los callbacks se leen por
  // ref: si fueran dependencias, cualquier cambio de estado del componente
  // reiniciaría la videollamada.

  // El encuadre lo calcula LiveKitCallView sobre el video local y lo reporta acá;
  // nosotros solo lo republicamos por presence para que lo vea el coordinador.
  // Lo que ve la propia persona. Hasta ahora el encuadre solo viajaba al
  // coordinador: quien estaba fuera de cuadro no se enteraba y se quedaba así.
  const [faceWatch, setFaceWatch] = useState<{ state: string; since: number } | null>(null);
  // El supervisor de encuadre ya NO se monta acá: vive dentro de la llamada
  // (`supervisorEncuadre` en la config), que es lo que sobrevive a navegar a
  // otra sección de Maven. Acá solo se le informa la pausa, porque el botón de
  // Baño/Break vive en esta página y él la consulta en cada tic.
  useEffect(() => { marcarPausa(!!breakStartedAt); }, [breakStartedAt]);

  const handleFaceStateChange = useCallback(
    (watch: { state: string; since: number }) => {
      setFaceWatch(watch);
      faceRef.current = { faceState: watch.state, faceSince: watch.since };
      trackMediaState({
        ...lastMediaRef.current,
        onBreak: !!breakStartedAt,
        breakStartedAt,
        banoConsumidoSeg: banoConsumido,
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
      // ACÁ YA NO SE LIBERA LA SALA, y este es EL bug que Jhon venía
      // reportando toda la noche: "me voy a otra sección de Maven y al
      // coordinador le aparece como si me hubiera salido".
      //
      // Este cleanup decía "SPA navigation away → release the slot too", y era
      // correcto cuando se escribió: entonces navegar SÍ significaba irse de
      // Cowork. Hoy no: la llamada vive por encima del router y se muda a la
      // ventanita flotante, o sea que la persona sigue adentro trabajando.
      // Soltar el cupo acá borraba su asignación de la BASE DE DATOS, y por eso
      // la sala aparecía "Sin participantes" aunque la miniatura siguiera
      // mostrando su video.
      //
      // Los dos caminos reales de salida siguen cubiertos: `pagehide` (cerrar
      // la pestaña o el navegador) y el botón de salir, que llama a leaveRoom
      // explícitamente. Si alguien navega y no vuelve, el cupo queda ocupado —
      // que es lo correcto, porque sigue en la llamada.
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
      olvidarDescartada(oneOnOneRequestId);
      dismissedRequestRef.current = null;
      reconnectToMainRoom();
      toast.info("Llamada privada con supervisor finalizada");
    }
  }, [cowork.hostRequests, oneOnOneRequestId, reconnectToMainRoom]);

  useEffect(() => {
    if (oneOnOneRequestId || pendingOneOnOneRef.current) return;
    const existingReq = cowork.hostRequests.find(
      r => r.user_id === userId && (r.status === "open" || r.status === "acknowledged") && r.oneone_livekit_room
    );
    // `fueDescartada` mira sessionStorage, no solo la ref en memoria. La ref se
    // borra al recargar, y por eso una solicitud que quedó viva en la base
    // volvía a llevarse al chatter a una sala 1:1 VACÍA en cada recarga,
    // mientras la supervisora le hablaba a la sala principal.
    if (existingReq && dismissedRequestRef.current !== existingReq.id
        && !fueDescartada(existingReq.id)) {
      setOneOnOneRequestId(existingReq.id);
      setOneOnOneRoom(existingReq.oneone_livekit_room!);
      setConnectedLkRoom(null);
    }
  }, [cowork.hostRequests, userId, oneOnOneRequestId]);

  const dismissedActiveRequest = cowork.hostRequests.find(
    r => r.user_id === userId
      && (r.status === "open" || r.status === "acknowledged")
      && r.oneone_livekit_room
      && (r.id === dismissedRequestRef.current || fueDescartada(r.id))
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

  // La llamada de la sala vive en el PersistentCallProvider, por encima del
  // router: mientras el chatter está en Cowork se dibuja en el hueco que ofrece
  // esta página, y si navega a otra sección pasa sola a una ventanita flotante
  // en vez de cortarse.
  //
  // La 1:1 con el coordinador NO: es efímera y su ciclo de vida ya está atado a
  // la solicitud, así que se sigue montando acá.
  //
  // Este efecto va DEBAJO de getToken a propósito. Su arreglo de dependencias se
  // evalúa al renderizar, y referenciar desde ahí un const declarado más abajo
  // tumba la página entera — es exactamente lo que pasó hoy con cbRef.
  useEffect(() => {
    if (!connectedLkRoom || oneOnOneRoom) return;
    startCall({
      key: `cowork-room-${connectedLkRoom}`,
      roomName: connectedLkRoom,
      displayName,
      callDisplayName: myRoom?.name,
      isAdmin: false,
      recording: { source: "cowork", title: myRoom?.name || undefined },
      onLeave: handleLeaveRoom,
      hideShareLink: true,
      suppressLeaveToast: true,
      initialMicOn: false,
      initialCamOn: false,
      getToken,
      onMediaStateChange: handleMediaStateChange,
      onFaceStateChange: handleFaceStateChange,
      supervisorEncuadre: true,
      leaveLabel: "Salir y volver al dashboard",
      leaveIcon: LogOut,
    });
  }, [connectedLkRoom, oneOnOneRoom, displayName, myRoom?.name, startCall,
      getToken, handleLeaveRoom, handleMediaStateChange, handleFaceStateChange]);

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
      <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center gap-4 p-4">
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
              {lastRoomId ? "O entra con el código de otra sala" : "Entra con el código que te dio tu supervisor"}
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
      </div>
    );
  }

  const isInOneOnOne = !!oneOnOneRoom;

  // Action handlers for both inline and dropdown
  const handleRequestHost = async () => {
    dismissedRequestRef.current = null;
    try {
      await cowork.requestHost(myAssignment.room_id, "Necesito ayuda");
      toast.success("Solicitud enviada al supervisor");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRequestOneOnOne = async () => {
    pendingOneOnOneRef.current = true;
    try {
      const result = await cowork.requestHost(myAssignment.room_id, "Llamada privada", true);
      toast.success("Solicitud de llamada privada enviada al supervisor");
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
    olvidarDescartada(dismissedActiveRequest.id);
    dismissedRequestRef.current = null;
    setOneOnOneRequestId(dismissedActiveRequest.id);
    setOneOnOneRoom(dismissedActiveRequest.oneone_livekit_room!);
    setConnectedLkRoom(null);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 md:px-4 py-1 md:py-2 bg-card border-b border-border z-10 shrink-0">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          {isInOneOnOne ? (
            <>
              <Crown className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-amber-500 text-sm font-medium truncate">Llamada privada con supervisor</span>
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
            <Hand className="h-4 w-4" /> {myOpenRequest && !isInOneOnOne ? "Solicitud enviada" : "Pedir supervisor"}
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-muted gap-1.5 rounded-full" disabled={!!myOpenRequest || isInOneOnOne} onClick={handleRequestOneOnOne}>
            <Phone className="h-4 w-4" /> {isInOneOnOne ? "En llamada privada..." : "Llamada privada supervisor"}
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
                <span>{breakKind === "break" ? "Break" : "Baño"} ·</span>
                {(() => {
                  const c = cuentaPausa(breakElapsed, breakLimite, consumidoDe(breakKind));
                  return (
                    <span className={cn("tabular-nums", clasesPausa(c.estado))}>
                      {c.texto}
                      {c.excedida && <span className="ml-1 font-normal">pasado</span>}
                    </span>
                  );
                })()}
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
                    <DropdownMenuItem onClick={() => toggleBreak("bano")}>{etiquetaPausa("bano")}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleBreak("break")}>{etiquetaPausa("break")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            )}
          </Button>
          {/* Compartir pantalla ahora es DIRECTO desde los controles de la llamada
              (abajo), sin pedir permiso — el token de sala lo habilita para todos. */}
        </div>

        {/* Mobile actions dropdown */}
        <div className="flex md:hidden items-center gap-1 shrink-0">
          {breakStartedAt && (() => {
            const c = cuentaPausa(breakElapsed, breakLimite, consumidoDe(breakKind));
            return (
              <button
                type="button"
                onClick={() => toggleBreak()}
                title="Avisar que volviste"
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 h-8 text-[11px] tabular-nums shrink-0",
                  // Fondo y borde para que se lea como un botón: sin esto queda
                  // texto suelto y nadie adivina que tocándolo se vuelve.
                  "bg-muted border border-border active:bg-muted/70",
                  clasesPausa(c.estado),
                )}
              >
                <Coffee className="h-3.5 w-3.5" />
                {c.texto}
              </button>
            );
          })()}
          {dismissedActiveRequest && !isInOneOnOne && (
            <Button variant="ghost" size="icon" className="text-amber-500 animate-pulse rounded-full" onClick={handleReconnectPrivateCall}>
              <PhoneCall className="h-4 w-4" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground rounded-full">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem onClick={handleRequestHost} disabled={isInOneOnOne}>
                <Hand className="h-4 w-4 mr-2" />
                {myOpenRequest && !isInOneOnOne ? "Solicitud enviada" : "Pedir supervisor"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRequestOneOnOne} disabled={!!myOpenRequest || isInOneOnOne}>
                <Phone className="h-4 w-4 mr-2" />
                {isInOneOnOne ? "En llamada privada..." : "Llamada privada con supervisor"}
              </DropdownMenuItem>
              {breakStartedAt ? (
                <DropdownMenuItem onClick={() => toggleBreak()}>
                  <Coffee className="h-4 w-4 mr-2" />
                  <span>{breakKind === "break" ? "Break" : "Baño"} ·&nbsp;</span>
                  {(() => {
                    const c = cuentaPausa(breakElapsed, breakLimite, consumidoDe(breakKind));
                    return <span className={cn("tabular-nums", clasesPausa(c.estado))}>{c.texto}</span>;
                  })()}
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => toggleBreak("bano")}>
                    <Coffee className="h-4 w-4 mr-2" /> {etiquetaPausa("bano")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toggleBreak("break")}>
                    <Coffee className="h-4 w-4 mr-2" /> {etiquetaPausa("break")}
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
            callDisplayName="Llamada privada con supervisor"
            isAdmin={false}
            onLeave={async () => {
              const reqId = oneOnOneRequestId;
              dismissedRequestRef.current = reqId;
              // Se anota ANTES de intentar resolver: el resolve de abajo es
              // best-effort y si falla (sin red, sesión vencida) la solicitud
              // queda abierta en la base. Sin esta marca, la próxima recarga
              // volvía a secuestrar al chatter a la sala vacía.
              marcarDescartada(reqId);
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
          // Solo el HUECO donde se dibuja la llamada mientras el chatter está
          // en Cowork. Si navega a otra sección el hueco desaparece y la llamada
          // pasa a la ventanita flotante — no se reinicia: es el mismo componente
          // movido por portal.
          <CallOutlet />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary/60" />
          </div>
        )}
      </div>
    </div>
  );
}
