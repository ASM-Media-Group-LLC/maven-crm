import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// "Ahora mismo" del Centro de operaciones: una sola llamada (RPC centro_ahora)
// trae, por persona, si está programada en el turno actual, si está conectada
// al reloj de Cowork, su estado y su pausa abierta. El alcance lo decide la
// función en la base (supervisor+/admin ven a todos; el resto, lo suyo).
// Se sondea cada 45 s; react-query no sondea pestañas ocultas (lección 23/10).

export interface PersonaAhora {
  user_id: string;
  nombre: string | null;
  grupo: string | null;
  agencia: string | null;
  turno: string | null;
  programado: boolean;
  conectado: boolean;
  estado: string | null;
  pausa_kind: string | null;
  pausa_seg: number | null;
  pausa_limite_min: number | null;
  pausa_excedida: boolean | null;
}

export const useCentroAhora = () => {
  return useQuery({
    queryKey: ["centro-ahora"],
    refetchInterval: 45_000,
    staleTime: 20_000,
    queryFn: async (): Promise<PersonaAhora[]> => {
      // La RPC es nueva y no está en los tipos generados → cast establecido.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sinTipar = supabase as unknown as { rpc: (fn: string) => any };
      const { data, error } = await sinTipar.rpc("centro_ahora");
      if (error) throw error;
      return (data ?? []) as PersonaAhora[];
    },
  });
};
