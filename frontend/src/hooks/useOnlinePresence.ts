import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import React from "react";

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
});

export function OnlinePresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [userStatuses, setUserStatuses] = useState<Record<string, UserStatus>>({});
  const [statusTexts, setStatusTexts] = useState<Record<string, string>>({});
  const [myStatus, setMyStatusState] = useState<UserStatus>("available");
  const [myStatusText, setMyStatusTextState] = useState("");
  const [myStatusColor, setMyStatusColorState] = useState<string | null>(null);
  const [statusColors, setStatusColors] = useState<Record<string, string>>({});
  const channelRef = useRef<any>(null);
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
    if (!channel || !userIdRef.current) return;
    void channel.track({
      user_id: userIdRef.current,
      online_at: new Date().toISOString(),
      status: status ?? myStatusRef.current,
      status_text: myStatusTextRef.current || null,
      status_color: myStatusColorRef.current || null,
    });
  }, []);

  // Single channel subscription — depends only on user identity
  useEffect(() => {
    if (!user?.id) return;

    const presenceChannel = supabase.channel("online-users", {
      config: { presence: { key: user.id } },
    });

    channelRef.current = presenceChannel;

    const syncState = () => {
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
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
            // Si Maven se abre ya en segundo plano, no anunciar "Disponible".
            status: document.hidden ? "away" : myStatusRef.current,
            status_text: myStatusTextRef.current || null,
          });
        }
      });

    return () => {
      channelRef.current = null;
      supabase.removeChannel(presenceChannel);
    };
  }, [user?.id]);

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
      const { data } = await supabase
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
    track(status);
    const uid = userIdRef.current;
    if (!uid) return;
    // Sin await: la presencia ya salió, esto es solo para que sobreviva al refresh.
    // Elegir del menú limpia el color personalizado: si no, el puntito se
    // quedaría con el color viejo y el menú parecería no hacer nada.
    setMyStatusColorState(null);
    myStatusColorRef.current = null;
    // Los CUATRO estados sobreviven a la recarga, "Desconectado" incluido: quien
    // se pone invisible espera seguir invisible después de un F5, no reaparecer
    // conectado sin haber hecho nada.
    void supabase
      .from("profiles")
      .update({ status, status_color: null } as never)
      .eq("id", uid);
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

  return React.createElement(
    OnlinePresenceContext.Provider,
    {
      value: {
        onlineUsers, isOnline, userStatuses, getStatus, myStatus, setMyStatus,
        getStatusText, myStatusText, setMyStatusText,
        getStatusColorPersonal, myStatusColor,
      },
    },
    children
  );
}

export function useOnlinePresence() {
  return useContext(OnlinePresenceContext);
}
