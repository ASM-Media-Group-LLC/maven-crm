import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type RespuestaDeInvitado = "pendiente" | "va" | "no_va" | "quizas";

export interface InvitadoDelEvento {
  event_id: string;
  user_id: string;
  respuesta: RespuestaDeInvitado;
}

function tabla() {
  return supabase.from("calendar_event_guests" as never);
}

/** Los invitados de un evento.
 *
 *  Solo trae `user_id`: el nombre y la cara salen del directorio que ya está
 *  cargado en memoria (useDirectorioCorreo). Duplicar esos datos acá sería
 *  mantener dos fuentes de la misma verdad. */
export function useInvitados(eventoId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["invitados", eventoId],
    enabled: !!eventoId && !!user,
    queryFn: async (): Promise<InvitadoDelEvento[]> => {
      const { data, error } = await tabla()
        .select("event_id, user_id, respuesta")
        .eq("event_id", eventoId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as InvitadoDelEvento[];
    },
  });
}

export function useInvitar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventoId, userIds }: { eventoId: string; userIds: string[] }) => {
      if (!userIds.length) return;
      const { error } = await tabla().insert(
        userIds.map((user_id) => ({ event_id: eventoId, user_id })) as never,
      );
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["invitados", v.eventoId] });
      // El evento cambia para el invitado: su calendario tiene que enterarse.
      qc.invalidateQueries({ queryKey: ["eventos"] });
    },
  });
}

export function useDesinvitar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventoId, userId }: { eventoId: string; userId: string }) => {
      const { error } = await tabla().delete().eq("event_id", eventoId).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["invitados", v.eventoId] });
      qc.invalidateQueries({ queryKey: ["eventos"] });
    },
  });
}

/** Contestar a una invitación. Solo la propia: la RLS no deja otra cosa, y es a
 *  propósito — un organizador que puede marcar "va" por otro convierte la lista
 *  de asistentes en una lista de deseos. */
export function useResponder() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ eventoId, respuesta }: { eventoId: string; respuesta: RespuestaDeInvitado }) => {
      const { error } = await tabla()
        .update({ respuesta } as never)
        .eq("event_id", eventoId)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["invitados", v.eventoId] }),
  });
}
