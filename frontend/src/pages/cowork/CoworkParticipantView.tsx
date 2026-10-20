import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeRoomCode, isCompleteRoomCode, ROOM_CODE_LENGTH } from "@/lib/coworkRoomCode";
import { Hand, Loader2, Crown, Phone, PhoneCall, MoreVertical, ArrowLeft, LogOut, KeyRound, DoorOpen, Coffee, Copy, Video } from "lucide-react";
import { toast } from "sonner";
import LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";
import { usePersistentCall, CallOutlet } from "@/components/PersistentCallProvider";
import type { useCoworkSession } from "@/hooks/useCoworkSession";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { useCoworkMediaPresence, salirDePresencia } from "@/hooks/useCoworkMediaPresence";
import { iniciarLatido, actualizarLatido, detenerLatido, suscribirReloj, leerReloj } from "@/lib/coworkLatido";
import type { ConexionSala } from "@/lib/coworkTiempoRegla";
import RelojCowork from "./RelojCowork";
import { usePestanaPrincipal } from "@/hooks/usePestanaPrincipal";
import { esEstadoSupervisor, type EstadoSupervisor } from "@/lib/pausaSupervisor";
import SupervisorEnPausa from "@/pages/cowork/SupervisorEnPausa";
import { nombreYApellido } from "@/lib/pausaCowork";
import { pedirApagarPorPausa, pedirReanudarTrasPausa } from "@/lib/ordenesDePausa";
import { marcarPausa } from "@/lib/coworkPausa";
import { fijarReglas, normalizarReglas } from "@/lib/coworkReglas";
import { cn } from "@/lib/utils";
import { rpcBanoConsumido, leerLimitesPausa } from "@/lib/coworkTablas";
import { cuentaPausa, clasesPausa, fraseFinDePausa, REPETIR_FIN_PAUSA_MS, fraseDiaAgotado, LIMITE_DIARIO_AGOTADO_MS } from "@/lib/pausaCowork";
import { anunciar } from "@/lib/anunciarVoz";
import { playMessageNotification } from "@/lib/notificationSound";
import { useIsMobile } from "@/hooks/use-mobile";
import { marcarDescartada, fueDescartada, olvidarDescartada } from "@/lib/solicitudPrivada";
import { useLanguage } from "@/hooks/useLanguage";
import { traducir } from "@/lib/i18n";
import { MENSAJE_LLAMADA_PRIVADA, MENSAJE_PEDIR_AYUDA, NOMBRE_PAUSA } from "./textosCowork";
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

/** El reloj para la presencia, leído del latido (que vive a nivel de módulo y
 *  sigue aunque esta página se desmonte). */
function relojParaPresencia(): { relojEstado: string | null; relojSegundosHoy: number | null; relojEn: number | null } {
  const r = leerReloj();
  return r ? { relojEstado: r.estado, relojSegundosHoy: r.segundosHoy, relojEn: r.en } : { relojEstado: null, relojSegundosHoy: null, relojEn: null };
}

export default function CoworkParticipantView({ cowork, userId }: Props) {
  // Los métodos del meet grupal sueltos: los callbacks dependen de ellos, no de `cowork` entero.
  const { joinMeetGrupal, salirDeMeetGrupal } = cowork;
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  // Los avisos que salen de efectos y de la config de la llamada usan traducir():
  // meter `t` en esas dependencias reiniciaría la llamada al cambiar el idioma.
  const { t } = useLanguage();
  const [displayName, setDisplayName] = useState("User");
  const [connectedLkRoom, setConnectedLkRoom] = useState<string | null>(null);
  const [manuallyLeft, setManuallyLeft] = useState(false);
  const prevRoomIdRef = useRef<string | null>(null);
  const dismissedRequestRef = useRef<string | null>(null);
  const pendingOneOnOneRef = useRef(false);
  const oneOnOneSeenInListRef = useRef(false);

  const [oneOnOneRoom, setOneOnOneRoom] = useState<string | null>(null);
  const [oneOnOneRequestId, setOneOnOneRequestId] = useState<string | null>(null);
  // Meet grupal (Jhon, 10/09): el supervisor me llevó a una sala temporal. Se
  // corta la llamada de la sala (cámara, micro y pantalla quedan apagados para
  // los demás) y al volver se restaura cómo la tenía.
  const [meetRoom, setMeetRoom] = useState<string | null>(null);
  const [meetId, setMeetId] = useState<string | null>(null);
  const estadoPrevioRef = useRef<{ micOn: boolean; camOn: boolean; screenShareOn: boolean } | null>(null);

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
  // Una sola pestaña por persona (ver lib/pestanaCowork): si Cowork ya está
  // abierto en otra, esta no entra a la llamada, no publica presencia ni late.
  const { principal: pestanaPrincipal, tomarEstaPestana } = usePestanaPrincipal(cowork.session?.id);

  const { trackMediaState, supervisores } = useCoworkMediaPresence(
    pestanaPrincipal ? cowork.session?.id : undefined, userId, { persistente: true },
  );
  // "Tu supervisor está en pausa": los hosts de la sesión que marcaron break,
  // lunch o ausente desde la tacita del Hub. Según su estado y SIN contador
  // (Jhon, 10/09/2026): hacia el chatter es disponibilidad, no tiempo que medir.
  const supervisoresEnPausa = cowork.memberships
    .filter((m) => m.role === "host" && esEstadoSupervisor(supervisores[m.user_id]))
    .map((m) => ({ uid: m.user_id, nombre: nombreYApellido(cowork.profiles[m.user_id]), estado: supervisores[m.user_id] as EstadoSupervisor }));

  // Pausa (baño). El tiempo lo cuenta el cliente de quien está en pausa y viaja
  // por presence, así el coordinador lo ve en vivo aunque recargue su dashboard.
  const [breakStartedAt, setBreakStartedAt] = useState<number | null>(null);
  const [breakElapsed, setBreakElapsed] = useState(0);
  // `conexionSala` es obligatoria en el tipo (y null hasta el primer aviso de la
  // sala): así el latido no puede salir sin decidir qué dice sobre la conexión.
  const lastMediaRef = useRef<{ micOn: boolean; camOn: boolean; screenShareOn: boolean; conexionSala: ConexionSala | null }>({
    micOn: false, camOn: false, screenShareOn: false, conexionSala: null,
  });
  const faceRef = useRef<{ faceState: string | null; faceSince: number | null }>({
    faceState: null, faceSince: null,
  });

  // El reloj de Cowork (fase 1 del reemplazo de Hubstaff): late mientras la
  // persona tenga sala. No se apaga al desmontar esta pantalla —la llamada
  // sigue en la ventanita flotante—, solo al Salir (handleLeaveRoom).
  useEffect(() => {
    const sid = cowork.session?.id;
    if (!sid || !myAssignment?.room_id || !pestanaPrincipal) return;
    iniciarLatido(sid, {
      ...lastMediaRef.current,
      faceState: faceRef.current.faceState,
      faceSince: faceRef.current.faceSince,
      onBreak: !!breakStartedAt,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- los refs se leen al iniciar; después se actualizan con actualizarLatido
  }, [cowork.session?.id, myAssignment?.room_id, pestanaPrincipal]);


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

  // El reloj que contesta el servidor viaja por presencia para que el
  // supervisor vea el MISMO número que la persona. Presence reemplaza el payload
  // entero en cada track(), así que todos los trackMediaState de abajo lo
  // incluyen, leído en el MOMENTO de publicar (relojParaPresencia): cuando esta
  // página se desmonta la llamada sigue en la ventanita y re-publica cada 10 s,
  // y un reloj guardado acá se quedaba congelado — el tablero no veía la caída,
  // o la veía para siempre.
  useEffect(() => suscribirReloj(() => {
    trackMediaState({
      ...lastMediaRef.current,
      onBreak: !!breakStartedAt, breakStartedAt, breakKind, banoConsumidoSeg: banoConsumido,
      ...faceRef.current,
      ...relojParaPresencia(),
    });
  }), [trackMediaState, breakStartedAt, breakKind, banoConsumido]);
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
      // La VOZ sigue en español: el motor de voz está fijo en español (lib/voz)
      // y leer inglés con esa voz no se entiende. El cartel sí va en su idioma.
      void anunciar(diaAgotado ? fraseDiaAgotado() : fraseFinDePausa(breakKind));
      toast.warning(
        diaAgotado ? traducir("cowork.participant.bathroomDayOver") : traducir("cowork.participant.pauseOver"),
        {
          description: diaAgotado
            ? traducir("cowork.participant.bathroomDayOverDesc")
            : traducir("cowork.participant.pauseOverDesc"),
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
    const nombre = t(NOMBRE_PAUSA[kind]);
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
      // La llamada apaga cámara, micro y pantalla al pausar, y reencende al
      // volver (la pantalla pide un clic: la llamada muestra el botón).
      if (cerrando) pedirReanudarTrasPausa(); else pedirApagarPorPausa();
      const inicio = cerrando ? null : (r?.startedAt ?? Date.now());
      setBreakStartedAt(inicio);
      setBreakKind(cerrando ? null : kind);
      setBreakLimite(cerrando ? null : (r?.limiteMinutos ?? null));
      trackMediaState({
        ...lastMediaRef.current,
        onBreak: !cerrando, breakStartedAt: inicio, breakKind: cerrando ? null : kind,
        ...faceRef.current,
        ...relojParaPresencia(),
      });
      actualizarLatido({ onBreak: !cerrando });
    } catch (e) {
      toast.error(traducir("cowork.participant.pauseError"), { description: (e as Error).message });
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
    detenerLatido();
    // Y vuelve el estándar: las reglas eran de ESA sesión. La próxima que se
    // abra las fija de nuevo al cargar su fila.
    fijarReglas(null);
    try { await cowork.leaveRoom?.(); } catch { /* best-effort */ }
    toast.success(traducir("cowork.participant.leftRoom"));
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
      actualizarLatido({ faceState: watch.state, faceSince: watch.since });
      // La pausa viaja COMPLETA (tipo y consumido incluidos): presence
      // reemplaza el payload entero en cada track(), así que si acá faltara
      // breakKind el tablero vería la pausa como "Baño" y con consumido 0.
      trackMediaState({
        ...lastMediaRef.current,
        onBreak: !!breakStartedAt,
        breakStartedAt,
        breakKind,
        banoConsumidoSeg: banoConsumido,
        ...faceRef.current,
        ...relojParaPresencia(),
      });
    },
    [breakStartedAt, breakKind, banoConsumido, trackMediaState]
  );
  // Compartir pantalla ya es DIRECTO (el token de sala lo permite para todos) —
  // acá solo reportamos el estado de media para que el dashboard lo muestre.
  const handleMediaStateChange = useCallback(
    (state: { micOn: boolean; camOn: boolean; screenShareOn: boolean; conexionSala: ConexionSala | null }) => {
      // Guardamos el último estado de media para poder re-publicarlo junto con la
      // pausa: presence reemplaza el payload entero en cada track().
      lastMediaRef.current = state;
      // La conexión va en el MISMO latido que la cámara: con la sala caída los
      // dos cambian juntos, y el servidor tiene que ver los dos para no anotar
      // "sin cámara" de paso.
      actualizarLatido({ camOn: state.camOn, screenShareOn: state.screenShareOn, conexionSala: state.conexionSala });
      trackMediaState({
        ...state,
        onBreak: !!breakStartedAt, breakStartedAt, breakKind, banoConsumidoSeg: banoConsumido,
        ...faceRef.current,
        ...relojParaPresencia(),
      });
    },
    [trackMediaState, breakStartedAt, breakKind, banoConsumido]
  );

  const reconnectToMainRoom = useCallback(() => {
    setOneOnOneRoom(null);
    setOneOnOneRequestId(null);
    setManuallyLeft(false);
    if (myRoom?.livekit_room_name) setConnectedLkRoom(myRoom.livekit_room_name);
  }, [myRoom?.livekit_room_name]);

  const volverDelMeet = useCallback(() => {
    setMeetId(null);
    setMeetRoom(null);
    reconnectToMainRoom();
  }, [reconnectToMainRoom]);

  // "Ir a mi sala": con un clic vuelves a TU sala asignada desde un meet grupal
  // o una llamada privada, sin pedirle nada a nadie. Si estás en un meet, sale
  // del meet primero; si no, reconecta a tu sala.
  const irAMiSala = useCallback(() => {
    if (meetId || meetRoom) volverDelMeet();
    else reconnectToMainRoom();
  }, [meetId, meetRoom, volverDelMeet, reconnectToMainRoom]);

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
        const url = `${SUPABASE_URL}/functions/v1/cowork-session`;
        supabase.auth.getSession().then(({ data }) => {
          const token = data.session?.access_token;
          if (!token) return;
          void fetch(url, {
            method: "POST",
            keepalive: true,
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_PUBLISHABLE_KEY,
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

    if (manuallyLeft || oneOnOneRoom || !pestanaPrincipal) return;
    if (myRoom?.livekit_room_name && myRoom.livekit_room_name !== connectedLkRoom) {
      setConnectedLkRoom(myRoom.livekit_room_name);
    }
  }, [myRoom?.livekit_room_name, manuallyLeft, myAssignment?.room_id, oneOnOneRoom, pestanaPrincipal]);

  // Otra pestaña se llevó Cowork: esta se retira SIN avisarle al servidor que
  // se fue (la persona sigue en la sala, desde la otra). Solo suelta la
  // llamada, la presencia y el latido de acá.
  useEffect(() => {
    if (pestanaPrincipal !== false) return;
    setConnectedLkRoom(null);
    endCall();
    salirDePresencia();
    detenerLatido();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pestanaPrincipal]);

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
      toast.info(traducir("cowork.participant.privateCallEnded"));
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

  const getMeetToken = useCallback(async () => {
    if (!meetId) throw new Error("No group meet");
    const result = await joinMeetGrupal(meetId);
    return { token: result.token, url: result.url };
  }, [joinMeetGrupal, meetId]);

  // Mi participación abierta en un meet grupal (la base manda: sobrevive a recargar).
  const miMeet = cowork.meets.find((m) => !m.ended_at && m.participantes.some((p) => p.user_id === userId && !p.left_at)) ?? null;

  // Me llevaron: guardo cómo tenía cámara/micro/pantalla y entro al meet.
  useEffect(() => {
    if (!miMeet || meetId === miMeet.id) return;
    estadoPrevioRef.current = { ...lastMediaRef.current };
    setMeetId(miMeet.id);
    setMeetRoom(miMeet.livekit_room_name);
    setConnectedLkRoom(null);
    toast.info(traducir("cowork.participant.broughtToMeet"));
  }, [miMeet, meetId]);

  // El meet terminó (el supervisor se fue) o me sacaron: vuelvo a mi sala como estaba.
  useEffect(() => {
    if (!meetId || miMeet?.id === meetId) return;
    volverDelMeet();
    toast.info(traducir("cowork.participant.meetEnded"));
  }, [miMeet?.id, meetId, volverDelMeet]);

  const salirDelMeet = useCallback(async () => {
    const id = meetId;
    if (id) { try { await salirDeMeetGrupal(id); } catch { /* best-effort: la base lo cierra si el meet termina */ } }
    volverDelMeet();
  }, [meetId, salirDeMeetGrupal, volverDelMeet]);

  // En el meet, si estaba en break entra con todo apagado; prender micro o
  // cámara ahí es volver del break (Jhon, 10/09).
  const mediaEnMeet = useCallback((state: { micOn: boolean; camOn: boolean; screenShareOn: boolean }) => {
    if (breakStartedAt && (state.micOn || state.camOn)) void toggleBreak();
  }, [breakStartedAt, toggleBreak]);

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
    if (!connectedLkRoom || oneOnOneRoom || meetRoom) return;
    // Al volver de un meet grupal, la sala arranca como se dejó (cámara, micro
    // y pantalla). En cualquier otro ingreso, apagado como siempre.
    const previo = estadoPrevioRef.current;
    estadoPrevioRef.current = null;
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
      initialMicOn: previo?.micOn ?? false,
      initialCamOn: previo?.camOn ?? false,
      initialScreenShareOn: previo?.screenShareOn ?? false,
      getToken,
      onMediaStateChange: handleMediaStateChange,
      onFaceStateChange: handleFaceStateChange,
      supervisorEncuadre: true,
      leaveLabel: traducir("cowork.participant.leaveAndBack"),
      leaveIcon: LogOut,
    });
  }, [connectedLkRoom, oneOnOneRoom, meetRoom, displayName, myRoom?.name, startCall,
      getToken, handleLeaveRoom, handleMediaStateChange, handleFaceStateChange]);

  if (pestanaPrincipal === false) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-border/50 bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning">
            <Copy className="h-5 w-5" />
          </div>
          <h2 className="text-base font-semibold text-foreground">{t("cowork.participant.otherTabTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("cowork.participant.otherTabDesc")}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button className="rounded-full" onClick={() => void tomarEstaPestana()}>{t("cowork.participant.useThisTab")}</Button>
            <Button variant="outline" className="rounded-full" onClick={() => navigate("/dashboard")}>{t("cowork.common.backToDashboard")}</Button>
          </div>
        </div>
      </div>
    );
  }

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
        toast.error(e.message || t("cowork.participant.resumeError"));
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
        toast.error(e.message || t("cowork.common.codeError"));
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
            <p className="text-foreground font-semibold text-center">{t("cowork.participant.noRoomYet")}</p>
            <p className="text-xs text-muted-foreground/70">{cowork.session?.name}</p>
          </div>

          {lastRoomId && (
            <Button onClick={resumeLastRoom} disabled={resuming} className="w-full rounded-full gap-2">
              {resuming ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />}
              {t("cowork.participant.backToMyRoom")}
            </Button>
          )}

          <div className="w-full flex flex-col gap-2">
            <span className="text-xs text-muted-foreground text-center">
              {lastRoomId ? t("cowork.participant.orOtherCode") : t("cowork.participant.enterSupervisorCode")}
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
                {t("cowork.common.enter")}
              </Button>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="rounded-full text-muted-foreground"
            onClick={() => navigate("/cowork", { replace: true })}
          >
            {t("cowork.participant.backToCowork")}
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
      // El mensaje se GUARDA en la solicitud y lo lee el supervisor: va en
      // español siempre; el tablero lo muestra en el idioma de quien lo lee.
      await cowork.requestHost(myAssignment.room_id, MENSAJE_PEDIR_AYUDA);
      toast.success(t("cowork.participant.requestSent"));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRequestOneOnOne = async () => {
    pendingOneOnOneRef.current = true;
    try {
      const result = await cowork.requestHost(myAssignment.room_id, MENSAJE_LLAMADA_PRIVADA, true);
      toast.success(t("cowork.participant.privateRequestSent"));
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
              <Crown className="h-4 w-4 text-warning shrink-0" />
              <span className="text-warning text-sm font-medium truncate">{t("cowork.participant.privateCallWithSupervisor")}</span>
            </>
          ) : (
            <>
              <span className="text-foreground text-sm font-medium truncate">{myRoom?.name || t("cowork.common.room")}</span>
              <span className="text-muted-foreground/70 text-xs hidden sm:inline">{cowork.session?.name}</span>
            </>
          )}
          {/* El reloj de tiempo trabajado (reemplazo de Hubstaff): siempre a la
              vista, corriendo o detenido con el motivo. En el teléfono, solo el número. */}
          <RelojCowork className="hidden md:inline-flex" />
          <RelojCowork compacto className="md:hidden" />
        </div>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-2">
          {(isInOneOnOne || !!meetRoom) && myRoom && (
            <Button variant="ghost" size="sm" className="text-primary hover:text-primary hover:bg-primary/10 gap-1.5 rounded-full" onClick={irAMiSala}>
              <DoorOpen className="h-4 w-4" /> {t("cowork.participant.goToMyRoom")}
            </Button>
          )}
          {dismissedActiveRequest && !isInOneOnOne && (
            <Button variant="ghost" size="sm" className="text-warning hover:text-warning/80 hover:bg-warning/10 gap-1.5 animate-pulse rounded-full" onClick={handleReconnectPrivateCall}>
              <PhoneCall className="h-4 w-4" /> {t("cowork.participant.reconnectPrivate")}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-muted gap-1.5 rounded-full" disabled={isInOneOnOne} onClick={handleRequestHost}>
            <Hand className="h-4 w-4" /> {myOpenRequest && !isInOneOnOne ? t("cowork.participant.requestSentShort") : t("cowork.participant.askSupervisor")}
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-muted gap-1.5 rounded-full" disabled={!!myOpenRequest || isInOneOnOne} onClick={handleRequestOneOnOne}>
            <Phone className="h-4 w-4" /> {isInOneOnOne ? t("cowork.participant.inPrivateCall") : t("cowork.participant.privateCallShort")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`gap-1.5 rounded-full ${breakStartedAt ? "text-warning hover:text-warning/80 hover:bg-warning/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
            onClick={breakStartedAt ? () => toggleBreak() : undefined}
            title={breakStartedAt ? t("cowork.participant.imBack") : t("cowork.participant.stepAway")}
            asChild={!breakStartedAt}
          >
            {breakStartedAt ? (
              <>
                <Coffee className="h-4 w-4" />
                <span>{t(NOMBRE_PAUSA[breakKind === "break" ? "break" : "bano"])} ·</span>
                {(() => {
                  const c = cuentaPausa(breakElapsed, breakLimite, consumidoDe(breakKind));
                  return (
                    <span className={cn("tabular-nums", clasesPausa(c.estado))}>
                      {c.texto}
                      {c.excedida && <span className="ml-1 font-normal">{t("cowork.participant.over")}</span>}
                    </span>
                  );
                })()}
              </>
            ) : (
              <span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <span className="inline-flex items-center gap-1.5 cursor-pointer">
                      <Coffee className="h-4 w-4" /> {t("cowork.participant.pause")}
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
          {(isInOneOnOne || !!meetRoom) && myRoom && (
            <button type="button" onClick={irAMiSala} title={t("cowork.participant.goToMyRoom")}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
              <DoorOpen className="h-3.5 w-3.5" /> {t("cowork.participant.goToMyRoom")}
            </button>
          )}
          {breakStartedAt && (() => {
            const c = cuentaPausa(breakElapsed, breakLimite, consumidoDe(breakKind));
            return (
              <button
                type="button"
                onClick={() => toggleBreak()}
                title={t("cowork.participant.imBack")}
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
            <Button variant="ghost" size="icon" className="text-warning animate-pulse rounded-full" onClick={handleReconnectPrivateCall}>
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
                {myOpenRequest && !isInOneOnOne ? t("cowork.participant.requestSentShort") : t("cowork.participant.askSupervisor")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRequestOneOnOne} disabled={!!myOpenRequest || isInOneOnOne}>
                <Phone className="h-4 w-4 mr-2" />
                {isInOneOnOne ? t("cowork.participant.inPrivateCall") : t("cowork.participant.privateCallWithSupervisor")}
              </DropdownMenuItem>
              {breakStartedAt ? (
                <DropdownMenuItem onClick={() => toggleBreak()}>
                  <Coffee className="h-4 w-4 mr-2" />
                  <span>{t(NOMBRE_PAUSA[breakKind === "break" ? "break" : "bano"])} ·&nbsp;</span>
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

      {/* Tu supervisor está en pausa (break / lunch / ausente): la pantalla del
          mock, con el paisaje y sin contador. Entre la barra y el video, así se
          ve sin tapar a nadie. */}
      {supervisoresEnPausa.length > 0 && (
        <SupervisorEnPausa supervisores={supervisoresEnPausa} className="mx-3 mt-2 shrink-0 md:mx-4" />
      )}

      {/* Video area */}
      <div className="flex-1 min-h-0">
        {meetRoom && meetId ? (
          <div className="flex h-full flex-col">
            {/* La barra del meet: qué pasa y el botón grande para volver (Jhon, 10/09). */}
            <div className={cn("flex shrink-0 items-center gap-2 border-b px-3 py-2", breakStartedAt ? "border-warning/30 bg-warning/10" : "border-primary/30 bg-primary/10")}>
              <Video className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1 text-xs">
                <span className="font-medium text-foreground">{t("cowork.participant.inMeet")}</span>{" "}
                <span className="text-muted-foreground">
                  {breakStartedAt
                    ? t("cowork.participant.inMeetOnBreak")
                    : t("cowork.participant.inMeetRoomOff")}
                </span>
              </div>
              <Button size="sm" className="h-8 shrink-0 gap-1.5 rounded-full" onClick={() => void salirDelMeet()}>
                <DoorOpen className="h-3.5 w-3.5" /> {t("cowork.participant.backToMyRoom")}
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <LiveKitCallView
                key={`meet-${meetRoom}`}
                roomName={meetRoom}
                displayName={displayName}
                callDisplayName={t("cowork.meet.title")}
                isAdmin={false}
                onLeave={() => void salirDelMeet()}
                hideShareLink
                suppressLeaveToast
                autoLeaveOnEmpty={undefined}
                initialMicOn={!breakStartedAt}
                initialCamOn={!breakStartedAt}
                getToken={getMeetToken}
                onMediaStateChange={mediaEnMeet}
                leaveLabel={t("cowork.participant.backToMyCoworkRoom")}
                leaveIcon={DoorOpen}
              />
            </div>
          </div>
        ) : isInOneOnOne && oneOnOneRoom && oneOnOneRequestId ? (
          <LiveKitCallView
            key={`oneOnOne-${oneOnOneRoom}`}
            roomName={oneOnOneRoom}
            displayName={displayName}
            callDisplayName={t("cowork.participant.privateCallWithSupervisor")}
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
            leaveLabel={t("cowork.participant.backToRoom")}
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
