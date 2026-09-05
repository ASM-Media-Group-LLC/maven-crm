import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import React from "react";

export type UserStatus = "available" | "busy" | "dnd" | "away";

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
  setMyStatusText: (text: string, expiresAt: string | null, luz?: UserStatus) => Promise<void>;
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
});

export function OnlinePresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [userStatuses, setUserStatuses] = useState<Record<string, UserStatus>>({});
  const [statusTexts, setStatusTexts] = useState<Record<string, string>>({});
  const [myStatus, setMyStatusState] = useState<UserStatus>("available");
  const [myStatusText, setMyStatusTextState] = useState("");
  const channelRef = useRef<any>(null);
  const myStatusRef = useRef<UserStatus>("available");
  const myStatusTextRef = useRef("");

  // Keep refs in sync
  myStatusRef.current = myStatus;
  myStatusTextRef.current = myStatusText;

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
      Object.entries(state).forEach(([key, presences]) => {
        ids.add(key);
        const latest = (presences as any[])?.[0];
        if (latest?.status) statuses[key] = latest.status as UserStatus;
        if (latest?.status_text) texts[key] = latest.status_text as string;
      });
      setOnlineUsers(ids);
      setUserStatuses(statuses);
      setStatusTexts(texts);
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
        .select("status, status_text, status_expires_at")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || !data) return;
      const row = data as {
        status?: string | null;
        status_text?: string | null;
        status_expires_at?: string | null;
      };
      const vigente = statusTextVigente(row.status_text, row.status_expires_at);
      // El texto caducó → la luz que lo acompañaba también. Si no, quedaría un
      // "Ocupado" colgado sin la frase que lo explicaba.
      const caduco = !!row.status_text && !vigente;
      const luz = (!caduco && row.status ? (row.status as UserStatus) : "available");

      if (luz !== "available") {
        setMyStatusState(luz);
        myStatusRef.current = luz;
      }
      if (vigente) {
        setMyStatusTextState(vigente);
        myStatusTextRef.current = vigente;
      }
      if (luz !== "available" || vigente) track();
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
    void supabase
      .from("profiles")
      .update({ status } as never)
      .eq("id", uid);
  }, [track]);

  /** Guarda el estado personalizado. La `luz` es opcional para no romper a quien
   *  llame con dos argumentos; cuando viene, texto y luz se fijan JUNTOS, que es
   *  lo que pide el diálogo ("EN LUNCH" + amarillo). */
  const setMyStatusText = useCallback(async (
    text: string,
    expiresAt: string | null,
    luz?: UserStatus,
  ) => {
    const clean = text.trim().slice(0, 64);
    setMyStatusTextState(clean);
    myStatusTextRef.current = clean;
    if (luz) {
      setMyStatusState(luz);
      myStatusRef.current = luz;
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

  return React.createElement(
    OnlinePresenceContext.Provider,
    {
      value: {
        onlineUsers, isOnline, userStatuses, getStatus, myStatus, setMyStatus,
        getStatusText, myStatusText, setMyStatusText,
      },
    },
    children
  );
}

export function useOnlinePresence() {
  return useContext(OnlinePresenceContext);
}
