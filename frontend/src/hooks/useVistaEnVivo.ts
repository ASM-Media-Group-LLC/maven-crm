import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { urlCaptura } from "@/hooks/useMonitorEventos";
import { useCapturasVivo } from "@/hooks/useCapturasVivo";

// LO QUE SE VE DE CADA PERSONA (las pantallas de «Los números de hoy», 20/11/2026):
// su pantalla y su cámara de los últimos minutos (useCapturasVivo) y, si no hay,
// su ÚLTIMO pantallazo de hoy, igual que Presencia de Argos. Misma clave de
// caché que Presencia («presencia-ultimas»), así se comparten.

export interface VistaDe {
  pantallaUrl: string | null;
  camaraUrl: string | null;
  /** ISO del último pantallazo o cámara. */
  cuando: string | null;
  /** true = de los últimos minutos; false = el último de hoy. */
  enVivo: boolean;
}

type SinTipar = { from: (t: string) => any };

function useUltimasDelDia(ids: string[]) {
  const clave = [...ids].sort().join(",");
  return useQuery<Record<string, { pantallaUrl: string | null; camaraUrl: string | null; ultima: string }>>({
    queryKey: ["presencia-ultimas", clave],
    enabled: ids.length > 0,
    staleTime: 50_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
      const desde = new Date(`${hoy}T00:00:00-05:00`).toISOString();
      const db = supabase as unknown as SinTipar;
      const una = async (id: string, tipo: "pantalla" | "camara") => {
        const { data } = await db.from("monitor_capturas")
          .select("path, nas_path, en_nas, created_at")
          .eq("user_id", id).eq("tipo", tipo).gte("created_at", desde)
          .order("created_at", { ascending: false }).limit(1);
        const f = (data ?? [])[0] as { path: string | null; nas_path: string | null; en_nas: boolean; created_at: string } | undefined;
        if (!f) return null;
        const ruta = f.en_nas ? f.nas_path : f.path;
        return { url: ruta ? await urlCaptura(ruta) : null, at: f.created_at };
      };
      const m: Record<string, { pantallaUrl: string | null; camaraUrl: string | null; ultima: string }> = {};
      await Promise.all(ids.map(async (id) => {
        const [p, c] = await Promise.all([una(id, "pantalla"), una(id, "camara")]);
        if (!p && !c) return;
        m[id] = { pantallaUrl: p?.url ?? null, camaraUrl: c?.url ?? null, ultima: [p?.at, c?.at].filter(Boolean).sort().pop()! };
      }));
      return m;
    },
  });
}

export function useVistaEnVivo(ids: string[]): (id: string) => VistaDe | null {
  const vivo = useCapturasVivo();
  const enVivo = useMemo(() => new Map(vivo.personas.map((p) => [p.userId, p])), [vivo.personas]);
  const sinVivo = useMemo(() => ids.filter((id) => !enVivo.get(id)?.pantallaUrl), [ids, enVivo]);
  const ultimas = useUltimasDelDia(sinVivo).data ?? {};
  return (id: string) => {
    const v = enVivo.get(id);
    if (v?.pantallaUrl) return { pantallaUrl: v.pantallaUrl, camaraUrl: v.camaraUrl, cuando: v.ultima, enVivo: true };
    const u = ultimas[id];
    if (u) return { pantallaUrl: u.pantallaUrl, camaraUrl: u.camaraUrl, cuando: u.ultima, enVivo: false };
    if (v?.camaraUrl) return { pantallaUrl: null, camaraUrl: v.camaraUrl, cuando: v.ultima, enVivo: true };
    return null;
  };
}
