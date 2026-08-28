import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MeetRoom {
  id: string;
  code: string;
  name: string;
  livekit_room_name: string;
  created_at?: string;
  isHost?: boolean;
  pinned?: boolean;
}

async function invokeMeet(action: string, payload: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meet-room`,
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

// Reuniones ad-hoc (Meet). La llamada en sí la sigue manejando /call/:roomName
// con `livekit-token`; este hook solo administra las reuniones.
export function useMeetRooms() {
  const [myRooms, setMyRooms] = useState<MeetRoom[]>([]);
  const [loading, setLoading] = useState(true);

  // La lista sale de MIS membresías (meet_room_members), no de lo que yo creé:
  // una reunión que me pasaron por código también me queda a mano, con el nombre
  // que le puso su anfitrión. Orden: primero las fijadas, después el orden que
  // yo haya armado, y al final las más nuevas.
  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMyRooms([]); setLoading(false); return; }

    const { data } = await supabase
      .from("meet_room_members")
      .select("pinned, sort_order, joined_at, meet_rooms!inner(id, code, name, livekit_room_name, created_at, created_by, status)")
      .eq("user_id", user.id)
      .eq("meet_rooms.status", "active");

    const filas = (data as any[]) || [];
    filas.sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return String(b.joined_at).localeCompare(String(a.joined_at));
    });

    setMyRooms(filas.map((f) => ({
      id: f.meet_rooms.id,
      code: f.meet_rooms.code,
      name: f.meet_rooms.name,
      livekit_room_name: f.meet_rooms.livekit_room_name,
      created_at: f.meet_rooms.created_at,
      isHost: f.meet_rooms.created_by === user.id,
      pinned: !!f.pinned,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const createRoom = useCallback(async (name?: string): Promise<MeetRoom> => {
    const res = await invokeMeet("create", { name });
    await refresh();
    return { ...res.room, isHost: true };
  }, [refresh]);

  const joinByCode = useCallback(async (code: string): Promise<MeetRoom> => {
    const res = await invokeMeet("joinByCode", { code });
    return res.room;
  }, []);

  const resolveByLivekitRoom = useCallback(async (livekitRoom: string): Promise<MeetRoom> => {
    const res = await invokeMeet("resolve", { livekitRoom });
    return res.room;
  }, []);

  const renameRoom = useCallback(async (id: string, name: string) => {
    await invokeMeet("rename", { id, name });
    await refresh();
  }, [refresh]);

  const setPinned = useCallback(async (id: string, pinned: boolean) => {
    await invokeMeet("setPinned", { id, pinned });
    await refresh();
  }, [refresh]);

  // Guarda el orden que armó el usuario arrastrando. Se manda la lista completa:
  // el índice ES el orden, así no hay que reconciliar posiciones sueltas.
  const reorder = useCallback(async (orderedIds: string[]) => {
    await invokeMeet("reorder", { orderedIds });
  }, []);

  const endRoom = useCallback(async (id: string) => {
    await invokeMeet("end", { id });
    await refresh();
  }, [refresh]);

  return {
    myRooms, setMyRooms, loading,
    createRoom, joinByCode, resolveByLivekitRoom, renameRoom, setPinned, reorder, endRoom, refresh,
  };
}
