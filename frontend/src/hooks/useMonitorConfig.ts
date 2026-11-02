import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCanalQueRevive } from "@/hooks/useCanalQueRevive";

// El interruptor y los ajustes del monitor de cámara (una sola fila,
// monitor_config). Lo lee el navegador de cada persona para saber si capturar y
// cada cuánto, y la página de RRHH para mostrarlo/editarlo. Se refresca en vivo:
// si el admin apaga el monitor, deja de capturar sin recargar.

export interface MonitorConfig {
  activo: boolean;
  intervaloIaSeg: number;
  avisarSupervisor: boolean;
  /** Vigilancia a nivel de toda la app (cámara propia, sin LiveKit). Off por defecto. */
  vigilanciaApp: boolean;
  /** Si el empleado ve el aviso «Argos tomó un pantallazo» (transparencia). */
  avisarCaptura: boolean;
}

const DEFAULTS: MonitorConfig = { activo: true, intervaloIaSeg: 120, avisarSupervisor: true, vigilanciaApp: false, avisarCaptura: true };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export function useMonitorConfig(habilitado = true) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["monitor-config"],
    enabled: habilitado,
    staleTime: 30_000,
    queryFn: async (): Promise<MonitorConfig> => {
      const { data, error } = await sinTipar
        .from("monitor_config")
        .select("activo, intervalo_ia_seg, avisar_supervisor, vigilancia_app, avisar_captura")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULTS;
      return {
        activo: data.activo !== false,
        intervaloIaSeg: Math.max(30, Number(data.intervalo_ia_seg) || DEFAULTS.intervaloIaSeg),
        avisarSupervisor: data.avisar_supervisor !== false,
        vigilanciaApp: data.vigilancia_app === true,
        avisarCaptura: data.avisar_captura !== false,
      };
    },
  });

  useCanalQueRevive({
    topic: habilitado ? "monitor-config" : null,
    armar: (ch) =>
      ch.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "monitor_config" },
        () => { void qc.invalidateQueries({ queryKey: ["monitor-config"] }); },
      ),
    alRevivir: () => { void qc.invalidateQueries({ queryKey: ["monitor-config"] }); },
  });

  return {
    config: query.data ?? null,
    cargando: query.isLoading,
    // Un fallo de lectura NO es "apagado": lo tratamos aparte para no apagar el
    // monitor en silencio ante un bache de red (ver useMonitorCamara).
    error: (query.error as Error | null) ?? null,
  };
}
