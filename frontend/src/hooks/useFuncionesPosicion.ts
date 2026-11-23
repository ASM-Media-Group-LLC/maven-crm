import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { FuncionesPosicion } from "@/lib/posiciones/permisos";

export function useFuncionesPosicion() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["mis-funciones-posicion", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<FuncionesPosicion> => {
      const cliente = supabase as unknown as { rpc: (fn: string) => Promise<{data: FuncionesPosicion | null; error: unknown}> };
      const { data, error } = await cliente.rpc("mis_funciones_posicion");
      if (error) throw error;
      if (!data || data.uid !== user?.id || typeof data.aplica !== "boolean" || typeof data.total !== "boolean" || typeof data.bloqueada !== "boolean" || !data.checks || typeof data.checks !== "object" || Array.isArray(data.checks) || Object.values(data.checks).some(v => typeof v !== "boolean")) {
        throw new Error("No se pudieron verificar los permisos de la posición");
      }
      if (data.denegadas !== undefined && (!Array.isArray(data.denegadas) || data.denegadas.some(k => typeof k !== "string"))) {
        throw new Error("No se pudieron verificar las restricciones de la persona");
      }
      if (data.alcances !== undefined && (!data.alcances || typeof data.alcances !== "object" || Array.isArray(data.alcances) || Object.values(data.alcances).some(v => v !== null && !["all", "subordinates", "self", "none"].includes(v)))) {
        throw new Error("No se pudo verificar el alcance de los permisos");
      }
      return data;
    },
  });
}
