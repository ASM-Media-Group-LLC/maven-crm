import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MeetRoom {
  id: string;
  code: string;
  name: string;
  livekit_room_name: string;
  created_at?: string;
  isHost?: boolean;
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

  // Las propias se leen directo por RLS ("Creator sees own meet rooms"), sin
  // pasar por la edge: es una lectura simple y así la lista refresca sola.
  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMyRooms([]); setLoading(false); return; }
    const { data } = await supabase
      .from("meet_rooms")
      .select("id, code, name, livekit_room_name, created_at")
      .eq("created_by", user.id).eq("status", "active")
      .order("created_at", { ascending: false });
    setMyRooms(((data as MeetRoom[]) || []).map((r) => ({ ...r, isHost: true })));
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

  const endRoom = useCallback(async (id: string) => {
    await invokeMeet("end", { id });
    await refresh();
  }, [refresh]);

  return { myRooms, loading, createRoom, joinByCode, resolveByLivekitRoom, endRoom, refresh };
}
