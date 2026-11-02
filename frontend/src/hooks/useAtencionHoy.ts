import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// % DE ATENCIÓN DE HOY por persona (Argos, estilo Hubstaff): de los pantallazos
// de pantalla que la IA ya juzgó hoy (día de Bogotá), qué porción estaba en lo
// suyo (no fuera de lugar). Devuelve un mapa userId → { pct, ok, juzgadas }.
// PostgREST: error ≠ vacío — si la consulta falla se propaga y el panel pinta
// "—", nunca un 0 inventado. Lo ve el dueño (lo fuerza la RLS).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export interface AtencionHoy {
  pct: number; // 0–100
  ok: number; // pantallazos en lo suyo
  juzgadas: number; // pantallazos con veredicto de la IA
}

export function useAtencionHoy() {
  const q = useQuery({
    queryKey: ["atencion-hoy"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Map<string, AtencionHoy>> => {
      const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
      const { data, error } = await sinTipar
        .from("monitor_capturas")
        .select("user_id, fuera_de_lugar")
        .eq("tipo", "pantalla")
        .not("veredicto", "is", null)
        .gte("created_at", `${hoy}T00:00:00-05:00`)
        .limit(5000);
      if (error) throw new Error(error.message);

      const cuenta = new Map<string, { ok: number; juzgadas: number }>();
      for (const f of (data ?? []) as Array<{ user_id: string; fuera_de_lugar: boolean | null }>) {
        const c = cuenta.get(f.user_id) ?? { ok: 0, juzgadas: 0 };
        c.juzgadas++;
        if (f.fuera_de_lugar !== true) c.ok++;
        cuenta.set(f.user_id, c);
      }
      const porPersona = new Map<string, AtencionHoy>();
      for (const [id, c] of cuenta) porPersona.set(id, { pct: Math.round((c.ok / c.juzgadas) * 100), ok: c.ok, juzgadas: c.juzgadas });
      return porPersona;
    },
  });

  return {
    atencionPor: q.data ?? null, // null = aún sin datos o fallo (no es "0%")
    cargando: q.isLoading,
    error: (q.error as Error | null) ?? null,
  };
}
