import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RealtimeChannel } from "@supabase/supabase-js";
import { idDePestana } from "@/lib/idDePestana";
import type { ReglasCowork } from "@/lib/coworkReglas";

// La fila de cowork_sessions tal como la lee el hook (select *). Mínima a
// propósito: solo lo que Cowork consume. `alert_rules` todavía no está en los
// tipos generados de Supabase, por eso es opcional y `unknown`: quien la use
// la pasa por normalizarReglas, que tolera cualquier cosa (null = estándar).
export interface CoworkSessionRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  host_hub_livekit_room: string | null;
  created_by: string;
  created_at: string;
  ended_at: string | null;
  updated_at: string;
  /** Reglas de alerta propias de la sesión. null/ausente = estándar. */
  alert_rules?: unknown;
  /** Quién guardó las reglas por última vez. null = nadie las tocó (o volvió al estándar). */
  alert_rules_updated_by?: string | null;
  /** Cuándo. Aparte de `updated_at`, que también se mueve al renombrar la sesión. */
  alert_rules_updated_at?: string | null;
  /** Quién la finalizó (auth user id). Lo escribe la edge en endSession. */
  ended_by?: string | null;
  /** Hasta cuándo vale el enlace de host. null = nunca emitido. */
  host_code_expires_at?: string | null;
}

/** Una sesión finalizada hace poco en la que estuve, con quién la finalizó. */
export interface SesionFinalizada {
  id: string;
  name: string;
  endedAt: string;
  endedBy: string | null;
  endedByName: string | null;
  createdBy: string | null;
  createdByName: string | null;
  members: number;
}

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
  // Conectados al Supervisor Hub (null = LiveKit no contestó o no hay hub).
  hubOnline: number | null;
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

/** Meet grupal (Jhon, 10/09/2026): el supervisor se lleva a la gente de una o
 *  varias salas a una sala temporal. Abierto mientras `ended_at` es null. */
export interface CoworkMeetParticipant {
  id: string;
  meet_id: string;
  session_id: string;
  user_id: string;
  /** De qué sala vino (para volver y para el reporte). */
  room_id: string | null;
  joined_at: string;
  left_at: string | null;
  left_reason: "volvio" | "meet_terminado" | "barrido" | null;
}
export interface CoworkMeet {
  id: string;
  session_id: string;
  created_by: string;
  livekit_room_name: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
  participantes: CoworkMeetParticipant[];
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
  const [session, setSession] = useState<CoworkSessionRow | null>(null);
  const [rooms, setRooms] = useState<CoworkRoom[]>([]);
  const [memberships, setMemberships] = useState<CoworkMembership[]>([]);
  const [assignments, setAssignments] = useState<CoworkAssignment[]>([]);
  const [hostRequests, setHostRequests] = useState<HostRequest[]>([]);
  const [meets, setMeets] = useState<CoworkMeet[]>([]);
  const [screenShareRequests, setScreenShareRequests] = useState<ScreenShareRequest[]>([]);
  const [myMembership, setMyMembership] = useState<CoworkMembership | null>(null);
  const [myAssignment, setMyAssignment] = useState<CoworkAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  /** Foto real y avatar_seed (DiceBear) de cada miembro, para que el tablero
   *  dibuje la misma cara que el Messenger y no solo iniciales (Jhon, 10/09). */
  const [avatares, setAvatares] = useState<Record<string, { src: string | null; seed: string | null }>>({});
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

      // Meets grupales ABIERTOS con su gente. Los cerrados son historia: los ven
      // los reportes, no el tablero.
      // La tabla es nueva: los types generados se regeneran al aplicar la
      // migración, hasta entonces se consulta sin tipar la tabla.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sinTipar = supabase as unknown as { from: (tabla: string) => any };
      const { data: ms } = await sinTipar.from("cowork_meets")
        .select("*, participantes:cowork_meet_participants(*)")
        .eq("session_id", sessionId).is("ended_at", null).order("started_at", { ascending: false });
      const filas = (ms ?? []) as Array<Omit<CoworkMeet, "participantes"> & { participantes?: CoworkMeetParticipant[] }>;
      setMeets(filas.map((m) => ({ ...m, participantes: m.participantes ?? [] })));

      const userIds = (mems as CoworkMembership[])?.map(m => m.user_id) || [];
      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, avatar_url, avatar_seed").in("id", userIds);
        const map: Record<string, string> = {};
        const caras: Record<string, { src: string | null; seed: string | null }> = {};
        profs?.forEach((p: any) => {
          map[p.id] = p.full_name || "User";
          caras[p.id] = { src: p.avatar_url ?? null, seed: p.avatar_seed ?? null };
        });
        setProfiles(map);
        setAvatares(caras);
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

    const meetsCh = supabase.channel(`cowork-meets-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cowork_meets", filter: `session_id=eq.${sessionId}` }, realtimeRefetch)
      .subscribe();
    const meetPartsCh = supabase.channel(`cowork-meet-parts-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cowork_meet_participants", filter: `session_id=eq.${sessionId}` }, realtimeRefetch)
      .subscribe();

    const memCh = supabase.channel(`cowork-members-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cowork_memberships", filter: `session_id=eq.${sessionId}` }, realtimeRefetch)
      .subscribe();

    channelsRef.current = [sessionCh, roomsCh, assignCh, reqCh, ssCh, memCh, meetsCh, meetPartsCh];

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
  // Reglas de alerta de la sesión (host). `null` = volver al estándar. La edge
  // valida y normaliza antes de escribir; el realtime de cowork_sessions
  // refetchea la sesión y las reglas nuevas llegan a todos en vivo.
  const updateAlertRules = useCallback(async (rules: ReglasCowork | null) =>
    invokeCowork("setAlertRules", { sessionId, rules }), [sessionId]);
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

  // ── Meet grupal: el supervisor se lleva a la gente de una o varias salas ──
  const crearMeetGrupal = useCallback(async (roomIds: string[]) => invokeCowork("crearMeetGrupal", { sessionId, roomIds }), [sessionId]);
  const terminarMeetGrupal = useCallback(async (meetId: string, reason: "supervisor_salio" | "terminado" = "terminado") => invokeCowork("terminarMeetGrupal", { meetId, reason }), []);
  const salirDeMeetGrupal = useCallback(async (meetId: string) => invokeCowork("salirDeMeetGrupal", { meetId }), []);
  const joinMeetGrupal = useCallback(async (meetId: string) => invokeCowork("issueLiveKitToken", { sessionId, purpose: "join_meet_grupal", meetId, clientId: idDePestana() }), [sessionId]);

  /** Apaga las asignaciones de quien lleva más de 3 min sin latir: cerró la
   *  pestaña sin salir. Solo hosts; lo llama el tablero cada un par de minutos. */
  const barrerAsignacionesColgadas = useCallback(async () => {
    const r = await invokeCowork("barrerAsignacionesColgadas", { sessionId });
    if ((r as { cerradas?: number })?.cerradas) await fetchData(true);
    return r;
  }, [sessionId, fetchData]);

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
  const listMyActiveSessions = useCallback(async (): Promise<Array<{ id: string; name: string; description: string | null; role: string; members: number; created_at: string; lastRoomId: string | null; createdBy: string | null }>> => {
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
      // Quién la creó: solo esa persona (o un admin) puede finalizarla.
      createdBy: s.created_by ?? null,
    }));
  }, []);

  // Las sesiones en las que estuve y que se finalizaron hace poco, con quién
  // las finalizó. Es la respuesta en pantalla a "¿quién cerró la sala?", que
  // hasta hoy había que ir a buscar a los registros del servidor.
  const listMyEndedSessions = useCallback(async (dias = 10): Promise<SesionFinalizada[]> => {
    // El RPC todavía no está en los tipos generados; el cast se acota acá.
    const { data, error } = await (supabase as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: any[] | null; error: any }> })
      .rpc("cowork_mis_sesiones_finalizadas", { _dias: dias });
    if (error) throw error;
    return (data ?? []).map((s: any) => ({
      id: s.id, name: s.name, endedAt: s.ended_at, endedBy: s.ended_by ?? null,
      endedByName: s.ended_by_name ?? null, createdBy: s.created_by ?? null,
      createdByName: s.created_by_name ?? null, members: s.members ?? 0,
    }));
  }, []);

  // Un host que NO creó la sesión se va de ella (borra su membresía). Es la
  // puerta que faltaba: sin ella, la única visible era Finalizar, que apaga la
  // sesión para todos.
  const leaveSessionById = useCallback(async (sid: string) => invokeCowork("leaveSession", { sessionId: sid }), []);

  // Finalizar una sesión por id (para el botón de la pantalla de inicio, sin sessionId activo).
  const endSessionById = useCallback(async (sid: string) => invokeCowork("endSession", { sessionId: sid }), []);

  // ADMIN: todas las sesiones activas de la empresa, con ocupación en vivo por
  // sala (contada por LiveKit en el edge). Para un no-admin devuelve [].
  const adminListSessions = useCallback(async (): Promise<AdminSessionRow[]> => {
    const r = await invokeCowork("adminListSessions", {});
    const sessions = (r as { sessions?: AdminSessionRow[] })?.sessions ?? [];
    // Normaliza contra una versión vieja del edge que aún no mande los campos.
    return sessions.map((s) => ({ ...s, incognito: s.incognito ?? [], hubOnline: s.hubOnline ?? null }));
  }, []);

  // Latido del modo incógnito (solo admin): mantiene fresca la marca que ven
  // los OTROS admins. `leave` la borra al salir prolijamente; un cierre sucio
  // la deja caducar sola en el edge.
  const incognitoPing = useCallback(async (sid: string) => invokeCowork("incognitoPing", { sessionId: sid }), []);
  const incognitoLeave = useCallback(async (sid: string) => invokeCowork("incognitoLeave", { sessionId: sid }), []);

  return {
    session, rooms, memberships, assignments, hostRequests, screenShareRequests, meets,
    myMembership, myAssignment, isHost, loading, profiles, avatares,
    createSession, joinSession, joinByCode, getMyLastRoomId, renameSession, updateAlertRules, addRoom, updateRoom, closeRoom,
    issueLiveKitToken, requestHost, ackHostRequest, resolveHostRequest, barrerAsignacionesColgadas,
    crearMeetGrupal, terminarMeetGrupal, salirDeMeetGrupal, joinMeetGrupal,
    requestScreenShare, approveScreenShare, claimScreenShareToken, joinOneOnOne, endSession, getHostCode, leaveRoom, setBreak, getPausaAbierta, refetch: fetchData,
    listMyActiveSessions, listMyEndedSessions, leaveSessionById, endSessionById, adminListSessions, incognitoPing, incognitoLeave,
  };
}
