import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEsDueno } from "@/hooks/useEsDueno";

// ¿Hay algún incidente abierto en salud_incidentes? (Alvaro, 09/11): el puntito
// rojo de la casita del riel. Solo el dueño lo ve (RLS). Un fallo de red deja
// el estado desconocido → no se pinta (no molestamos de más).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export interface IncidenteAbierto { tipo: string; mensaje: string; }

export function useIncidentesSalud(): { incidentes: IncidenteAbierto[]; hayAbiertos: boolean } {
  const { user } = useAuth();
  const { esDueno } = useEsDueno();
  const q = useQuery<IncidenteAbierto[]>({
    queryKey: ["salud-incidentes-abiertos"],
    staleTime: 20_000,
    refetchInterval: 45_000,
    enabled: !!user && esDueno === true,
    queryFn: async () => {
      const { data, error } = await sinTipar.from("salud_incidentes")
        .select("tipo, mensaje").is("cerrado_at", null);
      if (error) return [];
      return (data ?? []) as IncidenteAbierto[];
    },
  });
  const incidentes = q.data ?? [];
  return { incidentes, hayAbiertos: incidentes.length > 0 };
}
