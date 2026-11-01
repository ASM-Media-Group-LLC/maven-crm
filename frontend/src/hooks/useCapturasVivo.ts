import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { urlCaptura } from "@/hooks/useMonitorEventos";

// LOS PANTALLAZOS EN VIVO de Argos (modelo Hubstaff): las capturas más recientes
// del equipo —pantalla (lo que hacen) y cámara (que estén)—, cada una con su URL
// firmada para dibujar la miniatura. Se refresca solo. Lo ven supervisor+ (lo
// fuerza la RLS de monitor_capturas). Fase A: todo vive en el BUZÓN de Supabase
// (columna path); cuando exista el mover al NAS, las ya mudadas (en_nas) se
// firmarán por nas_path.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export interface CapturaVivo {
  id: string;
  userId: string;
  nombre: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
  tipo: "camara" | "pantalla";
  url: string | null;
  fueraDeLugar: boolean | null;
  veredicto: string | null;
  createdAt: string;
}

const VENTANA_MS = 30 * 60 * 1000; // últimos 30 min
const TOPE = 60; // no firmar de más: 60 miniaturas alcanzan para "lo que pasa ahora"

export function useCapturasVivo() {
  const q = useQuery({
    queryKey: ["capturas-vivo"],
    staleTime: 10_000,
    refetchInterval: 20_000, // se refresca solo (las URLs firmadas caducan a los 2 min)
    queryFn: async (): Promise<CapturaVivo[]> => {
      const desdeISO = new Date(Date.now() - VENTANA_MS).toISOString();
      const { data, error } = await sinTipar
        .from("monitor_capturas")
        .select("id, user_id, tipo, path, nas_path, en_nas, fuera_de_lugar, veredicto, created_at")
        .gte("created_at", desdeISO)
        .order("created_at", { ascending: false })
        .limit(TOPE);
      // PostgREST: error ≠ vacío. Si falló, propagamos (el panel dice "falló" y
      // ofrece reintentar), nunca mostramos "no hay pantallazos" ante un fallo.
      if (error) throw new Error(error.message);

      const filas = (data ?? []) as Array<{
        id: string; user_id: string; tipo: string;
        path: string | null; nas_path: string | null; en_nas: boolean;
        fuera_de_lugar: boolean | null; veredicto: string | null; created_at: string;
      }>;

      const ids = [...new Set(filas.map((f) => f.user_id))];
      const { data: perfiles } = ids.length
        ? await supabase.from("profiles").select("id, full_name, avatar_url, avatar_seed").in("id", ids)
        : { data: [] };
      const perfilPor = new Map(
        (perfiles ?? []).map((p) => [p.id as string, p as { full_name: string | null; avatar_url: string | null; avatar_seed: string | null }]),
      );

      return await Promise.all(
        filas.map(async (f) => {
          const ruta = f.en_nas ? f.nas_path : f.path; // Fase A: siempre path (buzón)
          const url = ruta ? await urlCaptura(ruta) : null;
          const p = perfilPor.get(f.user_id);
          return {
            id: f.id,
            userId: f.user_id,
            nombre: p?.full_name?.trim() || "",
            avatarUrl: p?.avatar_url ?? null,
            avatarSeed: p?.avatar_seed ?? null,
            tipo: (f.tipo === "pantalla" ? "pantalla" : "camara") as "camara" | "pantalla",
            url,
            fueraDeLugar: f.fuera_de_lugar,
            veredicto: f.veredicto,
            createdAt: f.created_at,
          };
        }),
      );
    },
  });

  return {
    capturas: q.data ?? [],
    cargando: q.isLoading,
    error: (q.error as Error | null) ?? null,
    refrescar: () => q.refetch(),
  };
}
