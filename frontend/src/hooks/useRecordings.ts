import { useCallback, useEffect, useRef, useState } from "react";
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
  /** Por qué falló (texto técnico de la edge). La página lo traduce. */
  error?: string | null;
}

/** Quién grabó, para la cara y el nombre en la lista. */
export interface PerfilGrabador { id: string; full_name: string | null; avatar_url: string | null; avatar_seed: string | null }

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

const COLUMNAS = "id, room_name, source, title, started_by, started_at, ended_at, duration_seconds, size_bytes, status, expires_at, error";

/** Cuántas filas por tanda. La lista se llenaba con `.limit(200)` de una:
 *  funcionaba con 54 grabaciones, pero con el video mudándose a R2 esto se
 *  acumula y 200 filas de golpe es una página lenta y una lista imposible de
 *  recorrer. Se pide de a poco y se filtra en el servidor. */
export const POR_PAGINA = 30;

export interface FiltrosGrabaciones {
  /** Busca en el título y en el nombre de la sala. */
  q: string;
  fuente: "todas" | "meet" | "cowork";
  soloMias: boolean;
}

export const FILTROS_VACIOS: FiltrosGrabaciones = { q: "", fuente: "todas", soloMias: false };

/** PostgREST parsea `or=(...)` separando por comas y paréntesis: si el texto
 *  buscado los trae, la consulta se rompe entera. Se limpian, no se escapan:
 *  nadie busca una grabación por un paréntesis. */
const limpiarBusqueda = (q: string) => q.replace(/[,()*\\]/g, " ").trim();

/** Trae nombre y cara de quienes grabaron, una sola consulta para toda la
 *  lista. Si falla, la lista sigue: solo se pierde el "Grabó X". */
async function cargarGrabadores(filas: RecordingRow[]): Promise<Record<string, PerfilGrabador>> {
  const ids = [...new Set(filas.map((r) => r.started_by).filter(Boolean))];
  if (ids.length === 0) return {};
  try {
    const { data } = await supabase.from("profiles").select("id, full_name, avatar_url, avatar_seed").in("id", ids);
    return Object.fromEntries(((data as PerfilGrabador[] | null) ?? []).map((p) => [p.id, p]));
  } catch {
    return {};
  }
}

export function useRecordings() {
  const [rows, setRows] = useState<RecordingRow[]>([]);
  const [grabadores, setGrabadores] = useState<Record<string, PerfilGrabador>>({});
  const [usage, setUsage] = useState<RecordingsUsage | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosGrabaciones>(FILTROS_VACIOS);

  // Los filtros en un ref además del estado: `cargarMas` los necesita para
  // pedir la tanda siguiente y no queremos recrear la función en cada tecla
  // (recrearla dispara el efecto de abajo y la lista parpadea).
  const filtrosRef = useRef(filtros);
  filtrosRef.current = filtros;
  const uidRef = useRef<string | null>(null);

  /** Una tanda. Devuelve las filas y si quedan más detrás. */
  const consultar = useCallback(async (desde: number, f: FiltrosGrabaciones) => {
    let q = supabase
      .from("meeting_recordings")
      .select(COLUMNAS)
      .is("deleted_at", null);

    if (f.fuente !== "todas") q = q.eq("source", f.fuente);
    if (f.soloMias && uidRef.current) q = q.eq("started_by", uidRef.current);

    const texto = limpiarBusqueda(f.q);
    if (texto) q = q.or(`title.ilike.%${texto}%,room_name.ilike.%${texto}%`);

    // Se pide UNA de más para saber si hay siguiente sin un count aparte.
    const { data } = await q
      .order("started_at", { ascending: false })
      .range(desde, desde + POR_PAGINA);

    const filas = (data as RecordingRow[] | null) ?? [];
    return { filas: filas.slice(0, POR_PAGINA), hayMas: filas.length > POR_PAGINA };
  }, []);

  /** Primera tanda: resetea la lista. También refresca el uso total, que NO
   *  depende de los filtros — el espacio ocupado es del buzón entero. */
  const refresh = useCallback(async () => {
    if (!uidRef.current) {
      const { data: { user } } = await supabase.auth.getUser();
      uidRef.current = user?.id ?? null;
      setMyUserId(uidRef.current);
    }
    const f = filtrosRef.current;
    const [tanda, uso] = await Promise.all([
      consultar(0, f),
      supabase.from("v_recordings_usage").select("*").maybeSingle(),
    ]);
    setRows(tanda.filas);
    setHayMas(tanda.hayMas);
    setUsage((uso.data as RecordingsUsage | null) ?? null);
    setLoading(false);
    void cargarGrabadores(tanda.filas).then(setGrabadores);

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
    const hayColgadas = tanda.filas.some((r) => r.status === "recording" || r.status === "processing");
    const faltaPeso = tanda.filas.some((r) => r.status === "ready" && r.size_bytes == null);
    if (hayColgadas || faltaPeso) {
      try {
        const res = await invokeRecordings("reconcile", {});
        if (res?.actualizadas || res?.cerradas) {
          const otra = await consultar(0, filtrosRef.current);
          setRows(otra.filas);
          setHayMas(otra.hayMas);
        }
      } catch { /* si no se puede, la lista igual funciona sin el peso */ }
    }
  }, [consultar]);

  /** Siguiente tanda: agrega al final, no reemplaza. */
  const cargarMas = useCallback(async () => {
    setCargandoMas(true);
    try {
      const tanda = await consultar(rows.length, filtrosRef.current);
      setRows((prev) => {
        // La lista pudo cambiar mientras se pedía (una grabación nueva empuja
        // todo): se descarta lo que ya estaba para no repetir filas.
        const vistos = new Set(prev.map((r) => r.id));
        return [...prev, ...tanda.filas.filter((r) => !vistos.has(r.id))];
      });
      setHayMas(tanda.hayMas);
      void cargarGrabadores(tanda.filas).then((nuevos) =>
        setGrabadores((prev) => ({ ...prev, ...nuevos })),
      );
    } finally {
      setCargandoMas(false);
    }
  }, [consultar, rows.length]);

  // Al cambiar los filtros se vuelve a la primera tanda. El texto va con
  // retardo: sin esto cada tecla es una consulta.
  useEffect(() => {
    const t = setTimeout(() => { void refresh(); }, filtros.q ? 300 : 0);
    return () => clearTimeout(t);
    // `refresh` lee los filtros del ref, así que las deps son los filtros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.q, filtros.fuente, filtros.soloMias]);

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

  return {
    rows, grabadores, usage, myUserId, loading, refresh, download, view, remove,
    filtros, setFiltros, cargarMas, cargandoMas, hayMas,
  };
}
