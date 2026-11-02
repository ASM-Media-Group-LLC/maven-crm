import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { urlCaptura } from "@/hooks/useMonitorEventos";

// CLIPS de video de un empleado en un DÍA (Argos). Trae los clips grabados cuando
// la persona dejó de mirar la cámara, con su URL firmada para reproducir. Mientras
// viven en el buzón (en_nas=false) se firman del bucket; los ya movidos al NAS se
// marcan como archivados (fase 2 los servirá). Lo ve el dueño (lo fuerza la RLS).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export interface ClipDia {
  id: string;
  motivo: string | null;
  durSeg: number | null;
  conAudio: boolean;
  createdAt: string;
  url: string | null;   // firmada desde el buzón; null si está en el NAS o falló
  enNas: boolean;
}

interface Fila {
  id: string; path: string; nas_path: string | null; en_nas: boolean;
  dur_seg: number | null; motivo: string | null; con_audio: boolean; created_at: string;
}

export function useClipsDia(userId: string | null, dia: string) {
  const q = useQuery({
    enabled: !!userId,
    queryKey: ["clips-dia", userId, dia],
    staleTime: 30_000,
    queryFn: async (): Promise<ClipDia[]> => {
      const { data, error } = await sinTipar
        .from("monitor_clips")
        .select("id, path, nas_path, en_nas, dur_seg, motivo, con_audio, created_at")
        .eq("user_id", userId)
        .gte("created_at", `${dia}T00:00:00-05:00`)
        .lte("created_at", `${dia}T23:59:59-05:00`)
        .order("created_at", { ascending: false })
        .limit(200);
      // PostgREST: error ≠ vacío. Si falló, propagamos (la UI dice "falló"), nunca "no hay".
      if (error) throw new Error(error.message);
      const filas = (data ?? []) as Fila[];
      return await Promise.all(
        filas.map(async (f) => ({
          id: f.id,
          motivo: f.motivo,
          durSeg: f.dur_seg,
          conAudio: f.con_audio,
          createdAt: f.created_at,
          enNas: f.en_nas,
          // En el buzón: se firma y se reproduce. Ya en el NAS: se sirve en fase 2.
          url: f.en_nas ? null : await urlCaptura(f.path),
        })),
      );
    },
  });

  return { clips: q.data ?? [], cargando: q.isLoading, error: (q.error as Error | null) ?? null };
}
