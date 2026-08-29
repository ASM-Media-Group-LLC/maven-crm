import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Grabaciones de Meet/Cowork. La lista y el uso se leen DIRECTO por RLS
// (ves lo que grabaste + lo que te compartieron; admin ve todo); la edge
// `recordings` solo entra para las acciones con efectos: start/stop desde
// la llamada, y acá download (firma URLs que vencen) y delete.

export interface RecordingRow {
  id: string;
  room_name: string;
  source: "cowork" | "meet";
  title: string | null;
  started_by: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  status: "recording" | "processing" | "ready" | "failed" | "deleted";
  expires_at: string | null;
}

export interface RecordingsUsage {
  total_recordings: number;
  total_bytes: number;
  expiring_next_week: number;
  next_expiry: string | null;
}

export async function invokeRecordings(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recordings`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ action, ...payload }),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || "Request failed");
  return json as Record<string, unknown>;
}

export function useRecordings() {
  const [rows, setRows] = useState<RecordingRow[]>([]);
  const [usage, setUsage] = useState<RecordingsUsage | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setMyUserId(user?.id ?? null);
    const [lista, uso] = await Promise.all([
      supabase
        .from("meeting_recordings")
        .select("id, room_name, source, title, started_by, started_at, ended_at, duration_seconds, size_bytes, status, expires_at")
        .is("deleted_at", null)
        .order("started_at", { ascending: false })
        .limit(200),
      supabase.from("v_recordings_usage").select("*").maybeSingle(),
    ]);
    const filas = (lista.data as RecordingRow[] | null) ?? [];
    setRows(filas);
    setUsage((uso.data as RecordingsUsage | null) ?? null);
    setLoading(false);

    // Dos arreglos que solo se pueden hacer del lado del servidor, los dos al
    // abrir la lista porque es cuando a alguien le importa:
    //
    //  · El peso no se conoce al terminar de grabar: el egress todavía está
    //    cerrando el MP4, así que el `stat` de ese momento no encuentra el
    //    archivo.
    //  · Las que quedaron en "En curso" porque nadie apretó Detener. Esas no
    //    se pueden descargar (el edge exige `ready`), así que la persona ve
    //    una grabación que existe y no puede bajar. El servidor le pregunta a
    //    LiveKit si el egress ya terminó y recién ahí la cierra.
    const hayColgadas = filas.some((r) => r.status === "recording" || r.status === "processing");
    const faltaPeso = filas.some((r) => r.status === "ready" && r.size_bytes == null);
    if (hayColgadas || faltaPeso) {
      try {
        const res = await invokeRecordings("reconcile", {});
        if (res?.actualizadas || res?.cerradas) {
          const { data } = await supabase
            .from("meeting_recordings")
            .select("id, room_name, source, title, started_by, started_at, ended_at, duration_seconds, size_bytes, status, expires_at")
            .is("deleted_at", null)
            .order("started_at", { ascending: false })
            .limit(200);
          setRows((data as RecordingRow[] | null) ?? filas);
        }
      } catch { /* si no se puede, la lista igual funciona sin el peso */ }
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Abre la descarga en una pestaña nueva. El link vence a los 10 minutos:
  // si se comparte, se comparte la grabación desde Maven, no el link crudo.
  const download = useCallback(async (id: string) => {
    const res = await invokeRecordings("download", { recording_id: id });
    const url = res.url as string | undefined;
    if (!url) throw new Error("no llegó la URL de descarga");
    window.open(url, "_blank", "noopener");
  }, []);

  // URL para VER la grabación acá adentro. Es otra ruta que la de descarga:
  // aquella la sirve como adjunto (el navegador la baja) y sin Range, así que
  // un <video> no podía ni reproducirla ni adelantarla.
  const view = useCallback(async (id: string) => {
    const res = await invokeRecordings("view", { recording_id: id });
    const url = res.url as string | undefined;
    if (!url) throw new Error("no llegó la URL de reproducción");
    return url;
  }, []);

  const remove = useCallback(async (id: string) => {
    await invokeRecordings("delete", { recording_id: id });
    await refresh();
  }, [refresh]);

  return { rows, usage, myUserId, loading, refresh, download, view, remove };
}
