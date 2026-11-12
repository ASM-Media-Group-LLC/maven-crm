import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// LA MINIATURA VIVA de cada persona (Monitoreo en vivo · 11/11): su último
// pantallazo (monitor_capturas, tipo pantalla, de la última media hora) con URL
// firmada, refrescándose solo cada 20 s. Lo que cada uno puede ver lo decide la
// RLS (dueño, RR. HH. sin admins, el supervisor su equipo); las fotos que ya se
// mudaron al NAS no se firman aquí (la fila queda sin miniatura, no rota).
// Un fallo de lectura se propaga: no es «no hay foto».

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export interface MiniaturaViva {
  url: string;
  /** ISO de cuándo se tomó. */
  at: string;
}

const VENTANA_MS = 30 * 60_000;
const FIRMA_SEG = 5 * 60;

export function useMiniaturasVivas(userIds: string[], habilitado = true) {
  const ids = [...new Set(userIds)].sort();
  const q = useQuery({
    enabled: habilitado && ids.length > 0,
    queryKey: ["miniaturas-vivas", ids.join(",")],
    staleTime: 15_000,
    refetchInterval: 20_000,
    queryFn: async (): Promise<Record<string, MiniaturaViva>> => {
      const { data, error } = await sinTipar.from("monitor_capturas")
        .select("user_id, path, en_nas, created_at")
        .eq("tipo", "pantalla")
        .in("user_id", ids)
        .gte("created_at", new Date(Date.now() - VENTANA_MS).toISOString())
        .order("created_at", { ascending: false })
        .limit(Math.min(800, ids.length * 40));
      if (error) throw new Error(error.message);
      const ultima = new Map<string, { path: string; at: string }>();
      for (const c of (data ?? []) as Array<{ user_id: string; path: string | null; en_nas: boolean | null; created_at: string }>) {
        if (ultima.has(c.user_id) || !c.path || c.en_nas) continue;
        ultima.set(c.user_id, { path: c.path, at: c.created_at });
      }
      if (ultima.size === 0) return {};
      const rutas = [...ultima.values()].map((u) => u.path);
      const { data: firmadas, error: e2 } = await supabase.storage.from("monitor-capturas").createSignedUrls(rutas, FIRMA_SEG);
      if (e2) throw new Error(e2.message);
      const urlPor = new Map((firmadas ?? []).filter((f) => f.signedUrl && f.path).map((f) => [f.path as string, f.signedUrl]));
      const out: Record<string, MiniaturaViva> = {};
      for (const [uid, u] of ultima) {
        const url = urlPor.get(u.path);
        if (url) out[uid] = { url, at: u.at };
      }
      return out;
    },
  });
  return {
    miniaturas: q.data ?? {},
    cargando: q.isLoading,
    error: (q.error as Error | null) ?? null,
  };
}
