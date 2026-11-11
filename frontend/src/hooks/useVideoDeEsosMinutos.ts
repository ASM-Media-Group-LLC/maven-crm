import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { urlsDeNas } from "@/hooks/useMonitorEventos";

// EL VIDEO DE ESOS MINUTOS (Monitoreo en vivo · Alvaro, 11/11/2026).
//
// Si la alerta ya se cerró o la persona ya no está conectada, en vez del en vivo
// se ve lo que pasó en esa ventana:
//   1. los VIDEOS que grabó Argos (argos_clips: la escalera de captura graba la
//      pantalla cuando confirma una distracción; bucket privado argos-clips);
//   2. si no hay video, los PANTALLAZOS de esa ventana (monitor_capturas) uno
//      tras otro, cada uno con lo que dijo Argos de él, y la cámara de ese
//      momento al lado.
// La ventana es [desde − 2 min, hasta + 1 min]; si sigue abierta, hasta ahora.
// Un fallo de lectura se dice (no es «no hay nada»).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export interface ClipDeVentana {
  id: string;
  url: string | null;
  motivo: string | null;
  desde: string;
  hasta: string | null;
  duracionSeg: number | null;
}

export interface FotoDeVentana {
  id: string;
  tipo: "pantalla" | "camara";
  url: string | null;
  at: string;
  veredicto: string | null;
  fueraDeLugar: boolean | null;
  caraVisible: boolean | null;
  perdonado: boolean;
}

export interface VideoDeVentana {
  clips: ClipDeVentana[];
  pantallas: FotoDeVentana[];
  camaras: FotoDeVentana[];
}

const ANTES_MS = 2 * 60_000;
const DESPUES_MS = 60_000;
const MAX_FOTOS = 240;

export function ventanaDe(desde: string, hasta: string | null, ahora = Date.now()): { lo: string; hi: string } {
  const a = Date.parse(desde);
  const b = hasta ? Date.parse(hasta) : ahora;
  return { lo: new Date(a - ANTES_MS).toISOString(), hi: new Date(Math.min(ahora, b + DESPUES_MS)).toISOString() };
}

/** La cámara de ese momento: la última foto de cámara hasta 3 min antes del pantallazo. */
export function camaraDelMomento(camaras: FotoDeVentana[], at: string): FotoDeVentana | null {
  const t = Date.parse(at);
  let mejor: FotoDeVentana | null = null;
  for (const c of camaras) {
    const tc = Date.parse(c.at);
    if (tc <= t + 5_000 && t - tc <= 3 * 60_000) mejor = c;
  }
  return mejor;
}

export function useVideoDeEsosMinutos(userId: string | null, desde: string | null, hasta: string | null, clipId: string | null, habilitado = true) {
  const q = useQuery({
    enabled: habilitado && !!userId && !!desde,
    // Mientras siga abierta la ventana crece: se vuelve a leer cada minuto.
    queryKey: ["video-esos-minutos", userId, desde, hasta, clipId],
    staleTime: 30_000,
    refetchInterval: hasta ? false : 60_000,
    queryFn: async (): Promise<VideoDeVentana> => {
      const { lo, hi } = ventanaDe(desde!, hasta);
      const [clipsRes, fotosRes, clipPedido] = await Promise.all([
        sinTipar.from("argos_clips").select("id, motivo, started_at, ended_at, duracion_seg, path, en_nas")
          .eq("user_id", userId).lte("started_at", hi).or(`ended_at.gte.${lo},ended_at.is.null`)
          .order("started_at", { ascending: true }).limit(20),
        sinTipar.from("monitor_capturas")
          .select("id, tipo, path, en_nas, nas_path, created_at, veredicto, fuera_de_lugar, cara_visible, perdonado")
          .eq("user_id", userId).gte("created_at", lo).lte("created_at", hi)
          .order("created_at", { ascending: false }).limit(MAX_FOTOS),
        clipId
          ? sinTipar.from("argos_clips").select("id, motivo, started_at, ended_at, duracion_seg, path, en_nas").eq("id", clipId).eq("user_id", userId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      const fallo = clipsRes.error ?? fotosRes.error ?? clipPedido.error;
      if (fallo) throw new Error(fallo.message);

      type FilaClip = { id: string; motivo: string | null; started_at: string; ended_at: string | null; duracion_seg: number | null; path: string; en_nas: boolean | null };
      const clipsFilas = (clipsRes.data ?? []) as FilaClip[];
      const pedido = clipPedido.data as FilaClip | null;
      if (pedido && !clipsFilas.some((c) => c.id === pedido.id)) clipsFilas.unshift(pedido);
      // El clip pedido, primero.
      if (pedido) clipsFilas.sort((a, b) => (a.id === pedido.id ? -1 : b.id === pedido.id ? 1 : 0));

      const rutasClip = clipsFilas.filter((c) => !c.en_nas).map((c) => c.path);
      const firmasClip = rutasClip.length
        ? await supabase.storage.from("argos-clips").createSignedUrls(rutasClip, 600)
        : { data: [], error: null };
      const urlClip = new Map((firmasClip.data ?? []).filter((f) => f.signedUrl && f.path).map((f) => [f.path as string, f.signedUrl]));

      type FilaFoto = { id: string; tipo: string; path: string | null; en_nas: boolean | null; nas_path: string | null; created_at: string;
        veredicto: string | null; fuera_de_lugar: boolean | null; cara_visible: boolean | null; perdonado: boolean | null };
      const fotos = ((fotosRes.data ?? []) as FilaFoto[]).reverse();
      const delBuzon = fotos.filter((f) => !f.en_nas && f.path).map((f) => f.path as string);
      const delNas = fotos.filter((f) => f.en_nas && f.nas_path).map((f) => f.nas_path as string);
      const [firmasFotos, nas] = await Promise.all([
        delBuzon.length ? supabase.storage.from("monitor-capturas").createSignedUrls(delBuzon, 900) : Promise.resolve({ data: [], error: null }),
        urlsDeNas(delNas),
      ]);
      const urlFoto = new Map((firmasFotos.data ?? []).filter((f) => f.signedUrl && f.path).map((f) => [f.path as string, f.signedUrl]));
      const aFoto = (f: FilaFoto): FotoDeVentana => ({
        id: f.id,
        tipo: f.tipo === "camara" ? "camara" : "pantalla",
        url: f.en_nas ? (f.nas_path ? nas[f.nas_path] ?? null : null) : (f.path ? urlFoto.get(f.path) ?? null : null),
        at: f.created_at,
        veredicto: f.veredicto,
        fueraDeLugar: f.fuera_de_lugar,
        caraVisible: f.cara_visible,
        perdonado: f.perdonado === true,
      });

      return {
        clips: clipsFilas.map((c) => ({
          id: c.id, url: c.en_nas ? null : urlClip.get(c.path) ?? null, motivo: c.motivo,
          desde: c.started_at, hasta: c.ended_at, duracionSeg: c.duracion_seg,
        })),
        pantallas: fotos.filter((f) => f.tipo !== "camara").map(aFoto),
        camaras: fotos.filter((f) => f.tipo === "camara").map(aFoto),
      };
    },
  });
  return {
    video: q.data ?? null,
    cargando: q.isLoading,
    error: (q.error as Error | null) ?? null,
    reintentar: () => { void q.refetch(); },
  };
}
