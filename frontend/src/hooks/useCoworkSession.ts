import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";
import { idDePestana } from "@/lib/idDePestana";

export interface CoworkRoom {
  id: string;
  session_id: string;
  name: string;
  livekit_room_name: string;
  sort_order: number;
  preview_mode?: "video" | "avatars";
  // Código corto que el coordinador comparte para entrar a ESTA sala. Solo lo
  // ve quien puede leer la fila (el host); el participante lo recibe por fuera.
  join_code?: string;
}

// Fila de la lista de admin: sesión activa ajena o propia, con ocupación en
// vivo (online=null cuando LiveKit no contestó — se dibuja "–", no "0").
export interface AdminSessionRow {
  id: string;
  name: string;
  description: string | null;
  members: number;
  created_at: string;
  host_name: string | null;
  my_role: string | null;
  online: number | null;
  rooms: Array<{ id: string; name: string; online: number | null }>;
  // Admins mirando esta sesión DE INCÓGNITO ahora (latido fresco). Solo lo ven
  // otros admins: el dato sale de adminListSessions, que exige rol admin.
  incognito: string[];
}

export interface CoworkMembership {
  id: string;
  session_id: string;
  user_id: string;
  role: "host" | "participant";
  joined_at: string;
}

export interface CoworkAssignment {
  id: string;
  session_id: string;
  user_id: string;
  room_id: string;
  is_active: boolean;
  assigned_at: string;
}

export interface HostRequest {
  id: string;
  session_id: string;
  room_id: string;
  user_id: string;
  message: string | null;
  status: "open" | "acknowledged" | "resolved";
  oneone_livekit_room?: string;
  created_at: string;
}

export interface ScreenShareRequest {
  id: string;
  session_id: string;
  room_id: string;
  user_id: string;
  status: "pending" | "approved" | "denied" | "expired";
  created_at: string;
}

async function invokeCowork(action: string, payload: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cowork-session`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ action, ...payload }),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

export function useCoworkSession(sessionId: string | null) {
  const [session, setSession] = useState<any>(null);
  const [rooms, setRooms] = useState<CoworkRoom[]>([]);
  const [memberships, setMemberships] = useState<CoworkMembership[]>([]);
  const [assignments, setAssignments] = useState<CoworkAssignment[]>([]);
  const [hostRequests, setHostRequests] = useState<HostRequest[]>([]);
  const [screenShareRequests, setScreenShareRequests] = useState<ScreenShareRequest[]>([]);
  const [myMembership, setMyMembership] = useState<CoworkMembership | null>(null);
  const [myAssignment, setMyAssignment] = useState<CoworkAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const initialLoadDone = useRef(false);
  const channelsRef = useRef<RealtimeChannel[]>([]);

  const isHost = myMembership?.role === "host";

  // Fetch all data (silent = true skips loading state for realtime refetches)
  const fetchData = useCallback(async (silent = false) => {
    if (!sessionId) return;
    if (!silent) setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: sess } = await supabase.from("cowork_sessions").select("*").eq("id", sessionId).single();
      setSession(sess);

      const { data: rms } = await supabase.from("cowork_rooms").select("*").eq("session_id", sessionId).order("sort_order");
      setRooms((rms as CoworkRoom[]) || []);

      const { data: mems } = await supabase.from("cowork_memberships").select("*").eq("session_id", sessionId);
      setMemberships((mems as CoworkMembership[]) || []);
      const mine = (mems as CoworkMembership[])?.find(m => m.user_id === user.id);
      setMyMembership(mine || null);

      const { data: assigns } = await supabase.from("cowork_room_assignments").select("*").eq("session_id", sessionId).eq("is_active", true);
      setAssignments((assigns as CoworkAssignment[]) || []);
      const myAss = (assigns as CoworkAssignment[])?.find(a => a.user_id === user.id && a.is_active);
      setMyAssignment(myAss || null);

      const { data: hReqs } = await supabase.from("cowork_host_requests").select("*").eq("session_id", sessionId).neq("status", "resolved").order("created_at", { ascending: false });
      setHostRequests((hReqs as HostRequest[]) || []);

      const { data: ssReqs } = await supabase.from("cowork_screenshare_requests").select("*").eq("session_id", sessionId).in("status", ["pending", "approved"]).order("created_at", { ascending: false });
      setScreenShareRequests((ssReqs as ScreenShareRequest[]) || []);

      const userIds = (mems as CoworkMembership[])?.map(m => m.user_id) || [];
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        const map: Record<string, string> = {};
        profs?.forEach((p: any) => { map[p.id] = p.full_name || "User"; });
        setProfiles(map);
      }
    } finally {
      if (!silent) setLoading(false);
      initialLoadDone.current = true;
    }
  }, [sessionId]);

  // Realtime subscriptions
  useEffect(() => {
    if (!sessionId) return;
    fetchData();

    const realtimeRefetch = () => fetchData(true);

    const sessionCh = supabase.channel(`cowork-session-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cowork_sessions", filter: `id=eq.${sessionId}` }, realtimeRefetch)
      .subscribe();

    const roomsCh = supabase.channel(`cowork-rooms-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cowork_rooms", filter: `session_id=eq.${sessionId}` }, realtimeRefetch)
      .subscribe();

    const assignCh = supabase.channel(`cowork-assignments-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cowork_room_assignments", filter: `session_id=eq.${sessionId}` }, realtimeRefetch)
      .subscribe();

    const reqCh = supabase.channel(`cowork-host-reqs-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cowork_host_requests", filter: `session_id=eq.${sessionId}` }, realtimeRefetch)
      .subscribe();

    const ssCh = supabase.channel(`cowork-ss-reqs-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cowork_screenshare_requests", filter: `session_id=eq.${sessionId}` }, realtimeRefetch)
      .subscribe();

    const memCh = supabase.channel(`cowork-members-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cowork_memberships", filter: `session_id=eq.${sessionId}` }, realtimeRefetch)
      .subscribe();

    channelsRef.current = [sessionCh, roomsCh, assignCh, reqCh, ssCh, memCh];

    return () => {
      channelsRef.current.forEach(ch => supabase.removeChannel(ch));
      channelsRef.current = [];
    };
  }, [sessionId, fetchData]);

  // Actions
  const createSession = useCallback(async (name: string, roomNames: string[], description?: string) => {
    return invokeCowork("createSession", { name, roomNames, description });
  }, []);

  const joinSession = useCallback(async (sid: string, role?: string, hostCode?: string, roomId?: string) => {
    return invokeCowork("joinSession", { sessionId: sid, role, hostCode, roomId });
  }, []);

  // Gestión de salas (host): añadir, renombrar / cambiar modo de preview, cerrar.
  const renameSession = useCallback(async (name: string) =>
    invokeCowork("updateSession", { sessionId, name }), [sessionId]);
  const addRoom = useCallback(async (name: string) => invokeCowork("addRoom", { sessionId, name }), [sessionId]);
  const updateRoom = useCallback(async (roomId: string, patch: { name?: string; previewMode?: "video" | "avatars" }) =>
    invokeCowork("updateRoom", { roomId, ...patch }), []);
  const closeRoom = useCallback(async (roomId: string) => invokeCowork("closeRoom", { roomId }), []);

  // Canjea un código de sala. Devuelve { sessionId, roomId, ... } para navegar.
  const joinByCode = useCallback(async (code: string) => invokeCowork("joinByCode", { code }), []);

  // Última sala en la que estuvo el usuario en una sesión, ACTIVA O NO. Sirve para
  // reanudar: el participante que volvió sin `?room=` (o al que se le desactivó la
  // asignación al salir) puede retomar su sala en vez de quedarse esperando a nadie.
  // RLS permite leer las propias asignaciones ("Participants see own assignment"),
  // aunque el nombre de la sala no sea legible sin asignación activa.
  const getMyLastRoomId = useCallback(async (sid: string): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("cowork_room_assignments")
      .select("room_id, assigned_at")
      .eq("session_id", sid).eq("user_id", user.id)
      .order("assigned_at", { ascending: false })
      .limit(1).maybeSingle();
    return (data as { room_id: string } | null)?.room_id ?? null;
  }, []);

  const getHostCode = useCallback(async () => {
    if (!sessionId) throw new Error("No session");
    return invokeCowork("getHostCode", { sessionId });
  }, [sessionId]);

  // assignToRoom and moveParticipant removed — participants self-join via URL ?room=X


  const issueLiveKitToken = useCallback(async (purpose: string, roomId?: string) => {
    // `clientId` = id de ESTA pestaña. El monitor lo usa para que su identidad
    // en LiveKit sea única por pestaña y no solo por persona: con el tablero
    // abierto dos veces, los dos monitores de cada sala se expulsaban entre sí
    // y el expulsado dejaba de publicar el micro PARA SIEMPRE, con el botón
    // igual en verde.
    return invokeCowork("issueLiveKitToken", { sessionId, purpose, roomId, clientId: idDePestana() });
  }, [sessionId]);

  const requestHost = useCallback(async (roomId: string, message?: string, requestOneOnOne?: boolean) => {
    return invokeCowork("requestHost", { sessionId, roomId, message, requestOneOnOne: !!requestOneOnOne });
  }, [sessionId]);

  const ackHostRequest = useCallback(async (requestId: string) => {
    return invokeCowork("ackHostRequest", { requestId });
  }, []);

  const resolveHostRequest = useCallback(async (requestId: string) => {
    return invokeCowork("resolveHostRequest", { requestId });
  }, []);

  const requestScreenShare = useCallback(async (roomId: string) => {
    return invokeCowork("requestScreenShare", { sessionId, roomId });
  }, [sessionId]);

  const approveScreenShare = useCallback(async (requestId: string, approve: boolean) => {
    return invokeCowork("approveScreenShare", { requestId, approve });
  }, []);

  const claimScreenShareToken = useCallback(async (requestId: string) => {
    return invokeCowork("claimScreenShareToken", { requestId });
  }, []);

  const joinOneOnOne = useCallback(async (requestId: string) => {
    return invokeCowork("joinOneOnOne", { requestId });
  }, []);

  const endSession = useCallback(async () => {
    return invokeCowork("endSession", { sessionId });
  }, [sessionId]);

  const leaveRoom = useCallback(async () => {
    if (!sessionId) return;
    return invokeCowork("leaveRoom", { sessionId });
  }, [sessionId]);

  // Abre (kind) o cierra (null) la pausa. El arranque y el cierre los sella el
  // servidor: si el reloj lo llevara el navegador de quien está en pausa, el
  // dato sería lo que esa persona dice que duró.
  const setBreak = useCallback(async (kind: "bano" | "break" | null) => {
    const r = kind
      ? await invokeCowork("startBreak", { kind })
      : await invokeCowork("endBreak", {});
    const inicio = (r as any)?.break?.started_at;
    return {
      startedAt: inicio ? new Date(inicio).getTime() : null,
      limiteMinutos: (r as any)?.limiteMinutos ?? null,
    };
  }, []);

  /** La pausa que quedó abierta, si hay. Se consulta al montar para que
   *  recargar la pestaña no le haga perder la pausa a nadie. */
  const getPausaAbierta = useCallback(async () => {
    const r = await invokeCowork("pausaAbierta", {});
    const p = (r as any)?.pausa;
    if (!p) return null;
    return {
      kind: p.kind as "bano" | "break",
      startedAt: new Date(p.started_at).getTime(),
      limiteMinutos: (r as any)?.limiteMinutos ?? null,
    };
  }, []);

  // Lista las sesiones cowork ACTIVAS donde el usuario es miembro (host o participante).
  // Puro cliente: el RLS `is_cowork_member` permite leer las propias membresías y sus
  // sesiones. El conteo de miembros es exacto (los miembros ven toda la membresía de su
  // sesión); NO devolvemos conteo de salas porque un participante solo ve su sala por RLS.
  // Un solo viaje de red. Antes eran seis encadenados —getUser, mis membresías,
  // las sesiones, todas las membresías para contar, y mis asignaciones— y cada
  // uno esperaba al anterior. En la base cada consulta tarda ~2 ms: lo que se
  // sentía era la ida y vuelta, no el trabajo. El RPC es SECURITY INVOKER, así
  // que sigue respetando las RLS de cada tabla.
  const listMyActiveSessions = useCallback(async (): Promise<Array<{ id: string; name: string; description: string | null; role: string; members: number; created_at: string; lastRoomId: string | null }>> => {
    const { data, error } = await supabase.rpc("cowork_mis_sesiones_activas");
    if (error) throw error;
    return (data ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      role: s.role,
      members: s.members ?? 0,
      created_at: s.created_at,
      lastRoomId: s.last_room_id ?? null,
    }));
  }, []);

  // Finalizar una sesión por id (para el botón de la pantalla de inicio, sin sessionId activo).
  const endSessionById = useCallback(async (sid: string) => invokeCowork("endSession", { sessionId: sid }), []);

  // ADMIN: todas las sesiones activas de la empresa, con ocupación en vivo por
  // sala (contada por LiveKit en el edge). Para un no-admin devuelve [].
  const adminListSessions = useCallback(async (): Promise<AdminSessionRow[]> => {
    const r = await invokeCowork("adminListSessions", {});
    const sessions = (r as { sessions?: AdminSessionRow[] })?.sessions ?? [];
    // Normaliza contra una versión vieja del edge que aún no mande el campo.
    return sessions.map((s) => ({ ...s, incognito: s.incognito ?? [] }));
  }, []);

  // Latido del modo incógnito (solo admin): mantiene fresca la marca que ven
  // los OTROS admins. `leave` la borra al salir prolijamente; un cierre sucio
  // la deja caducar sola en el edge.
  const incognitoPing = useCallback(async (sid: string) => invokeCowork("incognitoPing", { sessionId: sid }), []);
  const incognitoLeave = useCallback(async (sid: string) => invokeCowork("incognitoLeave", { sessionId: sid }), []);

  return {
    session, rooms, memberships, assignments, hostRequests, screenShareRequests,
    myMembership, myAssignment, isHost, loading, profiles,
    createSession, joinSession, joinByCode, getMyLastRoomId, renameSession, addRoom, updateRoom, closeRoom,
    issueLiveKitToken, requestHost, ackHostRequest, resolveHostRequest,
    requestScreenShare, approveScreenShare, claimScreenShareToken, joinOneOnOne, endSession, getHostCode, leaveRoom, setBreak, getPausaAbierta, refetch: fetchData,
    listMyActiveSessions, endSessionById, adminListSessions, incognitoPing, incognitoLeave,
  };
}
