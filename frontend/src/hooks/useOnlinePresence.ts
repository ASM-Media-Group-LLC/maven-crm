import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { escucharLaVuelta } from "@/hooks/useReanudarAlVolver";
import { ESTADOS_MUERTOS, esperaDeReconexion } from "@/hooks/useCanalQueRevive";
import { useAuth } from "@/hooks/useAuth";
import { leerArranque } from "@/lib/arranque";
import { esCuentaDeCreadora } from "@/lib/portal/cuenta";
import React from "react";
import { BUILD_PROPIO, versionesDesdePresencia, type PersonaConVersionVieja } from "@/lib/versionDelBundle";

/** El build de esta pestaña en la presencia (`b`). Sin build conocido no va: del
 *  otro lado, «sin b» se cuenta como versión vieja, que es lo prudente. */
const BUILD_EN_LA_PRESENCIA: { b?: number } = BUILD_PROPIO > 0 ? { b: BUILD_PROPIO } : {};

// También sobrevive a desmontar/remontar el proveedor mientras el servidor
// acusa el cierre. Abrir otro canal antes de ese acuse puede borrarlo por topic.
const cierresDePresencia = new Map<RealtimeChannel, Promise<boolean>>();
function retirarPresencia(canal: RealtimeChannel): Promise<boolean> {
  const enCurso = cierresDePresencia.get(canal);
  if (enCurso) return enCurso;
  const cierre = Promise.resolve().then(() => supabase.removeChannel(canal))
    .then((resultado) => resultado === "ok", () => false)
    .finally(() => { cierresDePresencia.delete(canal); });
  cierresDePresencia.set(canal, cierre);
  return cierre;
}

/** "No molestar" se quitó: pintaba el mismo rojo que "Ocupado" y no tenía
 *  ningún efecto funcional. "offline" es aparecer como desconectado (solo
 *  admins lo pueden elegir). */
export type UserStatus = "available" | "busy" | "away" | "offline";

/** Estado personalizado vigente: vacío si no hay texto o si ya expiró. */
export function statusTextVigente(text?: string | null, expiresAt?: string | null): string {
  if (!text) return "";
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return "";
  return text;
}

interface OnlinePresenceContextType {
  onlineUsers: Set<string>;
  isOnline: (userId: string) => boolean;
  userStatuses: Record<string, UserStatus>;
  getStatus: (userId: string) => UserStatus | null;
  myStatus: UserStatus;
  setMyStatus: (status: UserStatus) => void;
  /** Estado personalizado (texto libre) de cada persona conectada. */
  getStatusText: (userId: string) => string;
  myStatusText: string;
  /** Guarda el estado personalizado (persiste en profiles y lo difunde en vivo). */
  setMyStatusText: (text: string, expiresAt: string | null, luz?: UserStatus, color?: string | null) => Promise<void>;
  /** Color del puntito elegido a mano, o null si usa el del estado. */
  getStatusColorPersonal: (userId: string) => string | null;
  myStatusColor: string | null;
  /** Las personas conectadas ahora con un Maven anterior a `minimo` (hora del
   *  build en ms) o que no dicen su versión: las que todavía no verían la etiqueta
   *  API. Lee la presencia en el momento; no consulta la base. */
  versionesConectadas: (minimo: number) => PersonaConVersionVieja[];
}

const OnlinePresenceContext = createContext<OnlinePresenceContextType>({
  onlineUsers: new Set(),
  isOnline: () => false,
  userStatuses: {},
  getStatus: () => null,
  myStatus: "available",
  setMyStatus: () => {},
  getStatusText: () => "",
  myStatusText: "",
  setMyStatusText: async () => {},
  getStatusColorPersonal: () => null,
  myStatusColor: null,
  versionesConectadas: () => [],
});

export function OnlinePresenceProvider({ children }: { children: ReactNode }) {
  // Una cuenta de creadora (portal) no publica presencia: no es del equipo y no
  // tiene por qué aparecer como «en línea» en el Messenger ni en Cowork.
  const { user: cuenta } = useAuth();
  const user = esCuentaDeCreadora(cuenta) ? null : cuenta;
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [userStatuses, setUserStatuses] = useState<Record<string, UserStatus>>({});
  const [statusTexts, setStatusTexts] = useState<Record<string, string>>({});
  const [myStatus, setMyStatusState] = useState<UserStatus>("available");
  const [myStatusText, setMyStatusTextState] = useState("");
  const [myStatusColor, setMyStatusColorState] = useState<string | null>(null);
  const [statusColors, setStatusColors] = useState<Record<string, string>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const conectadoRef = useRef(false);
  const recuperarRef = useRef<(() => void) | null>(null);
  const publicadaRef = useRef<(() => void) | null>(null);
  // El topic es compartido. Hasta confirmar el cierre anterior NO se puede
  // pedir otro: el SDK devolvería el mismo canal, o el leave tardío lo borraría.
  const porRetirarRef = useRef<RealtimeChannel | null>(null);
  const cierrePendienteRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const myStatusRef = useRef<UserStatus>("available");
  const myStatusTextRef = useRef("");
  const myStatusColorRef = useRef<string | null>(null);

  // Keep refs in sync
  myStatusRef.current = myStatus;
  myStatusTextRef.current = myStatusText;
  myStatusColorRef.current = myStatusColor;

  const userIdRef = useRef<string | null>(null);
  userIdRef.current = user?.id ?? null;

  /** Publica mi presencia con el estado indicado (o el actual si no se pasa). */
  const track = useCallback((status?: UserStatus) => {
    const channel = channelRef.current;
    if (!channel || !conectadoRef.current || !userIdRef.current) return;
    void channel.track({
      user_id: userIdRef.current,
      online_at: new Date().toISOString(),
      status: myStatusRef.current === "offline" ? "offline" : (status ?? myStatusRef.current),
      status_text: myStatusTextRef.current || null,
      status_color: myStatusColorRef.current || null,
      ...BUILD_EN_LA_PRESENCIA,
    }).then((resultado) => {
      if (channelRef.current !== channel) return;
      if (resultado === "ok") publicadaRef.current?.();
      else recuperarRef.current?.();
    }).catch(() => { if (channelRef.current === channel) recuperarRef.current?.(); });
  }, []);

  // Un mismo canal para todos; recuperarlo no puede separar las presencias en
  // topics versionados como los canales de cambios de tablas.
  useEffect(() => {
    setOnlineUsers(new Set());
    setUserStatuses({}); setStatusTexts({}); setStatusColors({});
    if (!user?.id) return;
    let cancelado = false;
    let abriendo = false;
    let intento = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let propio: RealtimeChannel | null = null;

    const cancelarTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
    const retirar = (canal: RealtimeChannel) => {
      porRetirarRef.current = canal;
      const cierre = retirarPresencia(canal).then((retirado) => {
        if (!retirado) return false;
        if (porRetirarRef.current === canal) porRetirarRef.current = null;
        return true;
      }).catch(() => false);
      cierrePendienteRef.current = cierre;
      return cierre;
    };
    const programar = () => {
      if (cancelado || timer !== null) return;
      conectadoRef.current = false;
      timer = setTimeout(() => { timer = null; void abrir(); }, esperaDeReconexion(intento++));
    };
    const abrir = async () => {
      if (cancelado || abriendo || navigator.onLine === false) return;
      abriendo = true;
      try {
        await cierrePendienteRef.current;
        await Promise.all(cierresDePresencia.values());
        if (cancelado) return;
        const anterior = channelRef.current ?? porRetirarRef.current
          ?? supabase.getChannels().find((canal) => canal.topic === "realtime:online-users");
        if (anterior) {
          channelRef.current = null;
          conectadoRef.current = false;
          if (!await retirar(anterior)) { programar(); return; }
        }
        if (cancelado) return;
        const presenceChannel = supabase.channel("online-users", {
          config: { presence: { key: user.id } },
        });
        propio = presenceChannel;
        channelRef.current = presenceChannel;
        const vigente = () => !cancelado && channelRef.current === presenceChannel;
        const syncState = () => {
          if (!vigente()) return;
          const state = presenceChannel.presenceState();
          const ids = new Set<string>();
          const statuses: Record<string, UserStatus> = {};
          const texts: Record<string, string> = {};
          const colors: Record<string, string> = {};
          Object.entries(state).forEach(([key, presences]) => {
            const latest = (presences as any[])?.[0];
            // "Desconectado" tiene que serlo de verdad: si solo cambiáramos el color
            // seguiría contando en "X en línea", y el estado sería mentira.
            if (latest?.status !== "offline") ids.add(key);
            if (latest?.status) statuses[key] = latest.status as UserStatus;
            if (latest?.status_text) texts[key] = latest.status_text as string;
            if (latest?.status_color) colors[key] = latest.status_color as string;
          });
          setOnlineUsers(ids);
          setUserStatuses(statuses);
          setStatusTexts(texts);
          setStatusColors(colors);

        };
        presenceChannel
          .on("presence", { event: "sync" }, syncState)
          .on("presence", { event: "join" }, syncState)
          .on("presence", { event: "leave" }, syncState)
          .subscribe((estado) => {
            if (!vigente()) return;
            if (estado === "SUBSCRIBED") {
              cancelarTimer();
              conectadoRef.current = true;
              // El último estado (incluido el color) debe volver con la red.
              track(document.hidden ? "away" : myStatusRef.current);
            } else if (ESTADOS_MUERTOS.has(estado)) programar();
          });
      } catch { programar(); }
      finally { abriendo = false; }
    };
    recuperarRef.current = programar;
    // Estar suscrito no basta si track sigue rechazado: aflojar el freno solo
    // cuando el servidor confirmó la presencia evita reconectar cada segundo.
    publicadaRef.current = () => { intento = 0; };
    const dejarDeEscuchar = escucharLaVuelta(() => {
      if (cancelado) return;
      if (conectadoRef.current) { track(document.hidden ? "away" : myStatusRef.current); return; }
      cancelarTimer();
      void abrir();
    });
    void abrir();

    return () => {
      cancelado = true;
      cancelarTimer();
      dejarDeEscuchar();
      recuperarRef.current = null;
      publicadaRef.current = null;
      conectadoRef.current = false;
      if (channelRef.current === propio) channelRef.current = null;
      if (propio && porRetirarRef.current !== propio) void retirar(propio);
    };
  }, [user?.id, track]);

  // Mi estado guardado: se lee de profiles al entrar (sobrevive al refresh) y se
  // vuelve a publicar en la presencia con el texto Y la luz.
  //
  // ⚠️ La luz también se guarda desde que existe la columna `status`. Antes vivía
  // SOLO en la presencia, o sea en memoria, y se reiniciaba a verde en cada
  // recarga: por eso se veía gente con "EN LUNCH" y el puntito en verde.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      // Primero la petición única del arranque (lib/arranque.ts); si falló, la
      // lectura de siempre.
      const p = (await leerArranque(user.id))?.perfil;
      const { data } = p
        ? { data: { status: p.status, status_color: p.status_color, status_text: p.status_text, status_expires_at: p.status_expires_at } }
        : await supabase
          .from("profiles")
          .select("status, status_color, status_text, status_expires_at")
          .eq("id", user.id)
          .maybeSingle();
      if (cancelled || !data) return;
      const row = data as {
        status?: string | null;
        status_color?: string | null;
        status_text?: string | null;
        status_expires_at?: string | null;
      };
      const vigente = statusTextVigente(row.status_text, row.status_expires_at);
      // El texto caducó → la luz que lo acompañaba también. Si no, quedaría un
      // "Ocupado" colgado sin la frase que lo explicaba.
      const caduco = !!row.status_text && !vigente;
      const luz = (!caduco && row.status ? (row.status as UserStatus) : "available");

      const color = caduco ? null : (row.status_color ?? null);
      if (luz !== "available") {
        setMyStatusState(luz);
        myStatusRef.current = luz;
      }
      if (color) {
        setMyStatusColorState(color);
        myStatusColorRef.current = color;
      }
      if (vigente) {
        setMyStatusTextState(vigente);
        myStatusTextRef.current = vigente;
      }
      if (luz !== "available" || vigente || color) track();
    })();
    return () => { cancelled = true; };
  }, [user?.id, track]);

  // Presencia HONESTA: "Disponible" solo mientras la pestaña está visible.
  // Al pasar a segundo plano (cambiar de app, bloquear el celular, otra pestaña) se
  // publica "away" SIN pisar el estado que la persona eligió; al volver se restaura.
  // Antes la presencia se registraba una vez y quedaba en "Disponible" hasta que el
  // socket moría solo → alguien sin mirar la pantalla seguía "Disponible" y lo que le
  // mandaban quedaba en ✓ (enviado) sin pasar a ✓✓. Al cerrar (pagehide) se hace
  // untrack para que la presencia caiga de inmediato en vez de quedar colgada.
  useEffect(() => {
    if (!user?.id) return;
    const onVisibility = () => { track(document.hidden ? "away" : myStatusRef.current); };
    const onPageHide = () => { void channelRef.current?.untrack(); };
    const onPageShow = () => { track(myStatusRef.current); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [user?.id, track]);

  // When status changes, re-track without recreating channel
  const setMyStatus = useCallback((status: UserStatus) => {
    setMyStatusState(status);
    myStatusRef.current = status;

    // ⚠️ LIMPIAR ANTES DE PUBLICAR. `track()` arma el mensaje con lo que haya en
    // los refs EN ESE INSTANTE: si se limpian después, la presencia que sale a
    // los demás todavía lleva el texto y el color viejos, y del otro lado se
    // sigue viendo el estado anterior hasta que esa persona recargue.
    //
    // Elegir del menú manda: se va el texto personalizado y su color. Si no,
    // pasar de "EN LUNCH" a Ausente dejaba el chip mostrando "EN LUNCH" y
    // parecía que el menú no hiciera nada.
    setMyStatusColorState(null);
    myStatusColorRef.current = null;
    setMyStatusTextState("");
    myStatusTextRef.current = "";

    track(status);

    const uid = userIdRef.current;
    if (!uid) return;

    // Los CUATRO estados sobreviven a la recarga, "Desconectado" incluido: quien
    // se pone invisible espera seguir invisible después de un F5, no reaparecer
    // conectado sin haber hecho nada.
    //
    // ⚠️ EL `.then()` NO ES DECORATIVO. El query builder de supabase-js es
    // PEREZOSO: la petición HTTP solo sale cuando alguien lo consume (`await` o
    // `.then`). Con un `void` suelto se construye la consulta y NUNCA se envía,
    // sin error ni aviso. Ese era el bug: el estado del menú no se guardaba
    // nunca, mientras el del diálogo sí, porque aquel usa `await`.
    void supabase
      .from("profiles")
      .update({ status, status_color: null, status_text: null, status_expires_at: null } as never)
      .eq("id", uid)
      .then(() => {}, () => {});
  }, [track]);

  /** Guarda el estado personalizado. La `luz` es opcional para no romper a quien
   *  llame con dos argumentos; cuando viene, texto y luz se fijan JUNTOS, que es
   *  lo que pide el diálogo ("EN LUNCH" + amarillo). */
  const setMyStatusText = useCallback(async (
    text: string,
    expiresAt: string | null,
    luz?: UserStatus,
    color?: string | null,
  ) => {
    const clean = text.trim().slice(0, 64);
    setMyStatusTextState(clean);
    myStatusTextRef.current = clean;
    if (luz) {
      setMyStatusState(luz);
      myStatusRef.current = luz;
    }
    if (color !== undefined) {
      setMyStatusColorState(color);
      myStatusColorRef.current = color;
    }
    track();
    const uid = userIdRef.current;
    if (!uid) return;
    await supabase
      .from("profiles")
      .update({
        status_text: clean || null,
        status_expires_at: clean ? expiresAt : null,
        ...(luz ? { status: luz } : {}),
        ...(color !== undefined ? { status_color: color } : {}),
      } as never)
      .eq("id", uid);
  }, [track]);

  const isOnline = useCallback(
    (userId: string) => onlineUsers.has(userId),
    [onlineUsers]
  );

  const getStatus = useCallback(
    (userId: string) => userStatuses[userId] || null,
    [userStatuses]
  );

  const getStatusText = useCallback(
    (userId: string) => statusTexts[userId] || "",
    [statusTexts]
  );

  const getStatusColorPersonal = useCallback(
    (userId: string) => statusColors[userId] || null,
    [statusColors]
  );

  // Del estado de la presencia tal como está AHORA (todas las pestañas de cada
  // uno). No guarda nada en el estado de React: quien lo muestra se vuelve a
  // dibujar con cada sync de la presencia (cambia onlineUsers) y lo vuelve a pedir.
  const versionesConectadas = useCallback((minimo: number) => {
    const canal = channelRef.current as { presenceState?: () => Record<string, unknown[]> } | null;
    return versionesDesdePresencia(canal?.presenceState?.() ?? {}, minimo);
  }, []);

  return React.createElement(
    OnlinePresenceContext.Provider,
    {
      value: {
        onlineUsers, isOnline, userStatuses, getStatus, myStatus, setMyStatus,
        getStatusText, myStatusText, setMyStatusText,
        getStatusColorPersonal, myStatusColor,
        versionesConectadas,
      },
    },
    children
  );
}

export function useOnlinePresence() {
  return useContext(OnlinePresenceContext);
}
