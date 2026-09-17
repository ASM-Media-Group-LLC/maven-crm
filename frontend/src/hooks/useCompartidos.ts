import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface CompartidoConAlguien {
  document_id: string;
  user_id: string;
  puede_editar: boolean;
}

function tabla() {
  return supabase.from("document_shares" as never);
}

/** Con quién está compartido un documento.
 *
 *  Solo trae `user_id`: el nombre y la cara salen del directorio que ya está en
 *  memoria, igual que con los invitados del calendario. */
export function useCompartidos(documentoId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["compartidos", documentoId],
    enabled: !!documentoId && !!user,
    queryFn: async (): Promise<CompartidoConAlguien[]> => {
      const { data, error } = await tabla()
        .select("document_id, user_id, puede_editar")
        .eq("document_id", documentoId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as CompartidoConAlguien[];
    },
  });
}

export function useCompartir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { documentoId, userId, puedeEditar }:
      { documentoId: string; userId: string; puedeEditar: boolean },
    ) => {
      const { error } = await tabla().insert({
        document_id: documentoId, user_id: userId, puede_editar: puedeEditar,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["compartidos", v.documentoId] });
      // El documento aparece en el listado de la otra persona.
      qc.invalidateQueries({ queryKey: ["documentos"] });
    },
  });
}

/** Cambiar de "puede ver" a "puede editar" o al revés. */
export function useCambiarPermiso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { documentoId, userId, puedeEditar }:
      { documentoId: string; userId: string; puedeEditar: boolean },
    ) => {
      const { error } = await tabla()
        .update({ puede_editar: puedeEditar } as never)
        .eq("document_id", documentoId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["compartidos", v.documentoId] }),
  });
}

export function useDejarDeCompartir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ documentoId, userId }: { documentoId: string; userId: string }) => {
      const { error } = await tabla()
        .delete().eq("document_id", documentoId).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["compartidos", v.documentoId] });
      qc.invalidateQueries({ queryKey: ["documentos"] });
    },
  });
}
