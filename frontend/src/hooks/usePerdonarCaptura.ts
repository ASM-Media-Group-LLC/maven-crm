import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEsDueno } from "@/hooks/useEsDueno";
import { useRoleTier } from "@/hooks/useRoleTier";

// PERDONAR una falta de un pantallazo (Alvaro, 05/11). Solo el dueño y los admins
// pueden: una falta perdonada deja de bajar la nota (ej. un PR que SÍ puede ver
// redes de sus creadoras). El RPC argos_perdonar_captura lo refuerza en el servidor.
// Al perdonar se refrescan expediente/turno/resumen para que la nota se recalcule.

type RpcDb = { rpc: (f: string, a: unknown) => Promise<{ error: { message: string } | null }> };

export function usePuedePerdonar(): boolean {
  const { esDueno } = useEsDueno();
  const { tier } = useRoleTier();
  return esDueno === true || tier === "admin";
}

export function usePerdonarCaptura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, perdonar }: { id: string; perdonar: boolean }) => {
      const db = supabase as unknown as RpcDb;
      const { error } = await db.rpc("argos_perdonar_captura", { _id: id, _perdonar: perdonar });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expediente"] });
      qc.invalidateQueries({ queryKey: ["argos-turno-personas"] });
      qc.invalidateQueries({ queryKey: ["resumen-dia"] });
    },
  });
}
