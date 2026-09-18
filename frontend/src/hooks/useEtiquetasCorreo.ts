import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Los colores son TOKENS del tema, no hex sueltos: así una etiqueta se ve
 *  bien en claro y en oscuro sin que nadie elija algo ilegible. */
export const COLORES_ETIQUETA = [
  "primary", "accent", "success", "warning", "destructive", "muted",
] as const;
export type ColorEtiqueta = (typeof COLORES_ETIQUETA)[number];

export interface EtiquetaDeCorreo {
  id: string;
  nombre: string;
  color: ColorEtiqueta;
}

/** `types.ts` es generado y todavía no conoce estas tablas. Mismo patrón que
 *  calendar_events y document_shares. */
function tabla(nombre: string) {
  return supabase.from(nombre as never);
}

export function useEtiquetas() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["mail-labels", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<EtiquetaDeCorreo[]> => {
      const { data, error } = await tabla("mail_labels")
        .select("id, nombre, color").order("nombre", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as EtiquetaDeCorreo[];
    },
  });
}

/** Qué etiquetas tiene cada correo, indexado por `message_id`.
 *
 *  Se traen TODAS de una y se cruzan en memoria, en vez de preguntar por
 *  correo: son decenas de filas por persona y la bandeja pinta 50 renglones —
 *  cincuenta consultas para pintar una lista es justo lo que cuelga la
 *  pantalla. */
export function useEtiquetasPorCorreo() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["mail-message-labels", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, string[]>> => {
      const { data, error } = await tabla("mail_message_labels")
        .select("message_id, label_id").limit(5000);
      if (error) throw error;
      const mapa = new Map<string, string[]>();
      for (const f of (data ?? []) as unknown as { message_id: string; label_id: string }[]) {
        const ya = mapa.get(f.message_id);
        if (ya) ya.push(f.label_id);
        else mapa.set(f.message_id, [f.label_id]);
      }
      return mapa;
    },
  });
}

export function useCrearEtiqueta() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ nombre, color }: { nombre: string; color: ColorEtiqueta }) => {
      const { error } = await tabla("mail_labels")
        .insert({ nombre: nombre.trim(), color, user_id: user?.id } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mail-labels"] }),
  });
}

export function useBorrarEtiqueta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await tabla("mail_labels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mail-labels"] });
      // Las asignaciones se van con ON DELETE CASCADE; el mapa en memoria no.
      qc.invalidateQueries({ queryKey: ["mail-message-labels"] });
    },
  });
}

/** Pone o saca una etiqueta de varios correos de una.
 *
 *  ⚠️ Por `message_id` y NO por (carpeta, uid): el uid CAMBIA al mover el
 *  correo de carpeta, así que una etiqueta atada al uid se perdería la primera
 *  vez que alguien lo archiva — o peor, la heredaría otro mensaje que reciba
 *  ese uid después. */
export function useEtiquetarCorreos() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      { messageIds, labelId, poner }:
      { messageIds: string[]; labelId: string; poner: boolean },
    ) => {
      const ids = messageIds.filter(Boolean);
      if (!ids.length) throw new Error("Estos correos no tienen identificador; abre la carpeta de nuevo e inténtalo.");
      if (poner) {
        const { error } = await tabla("mail_message_labels").upsert(
          ids.map((m) => ({ user_id: user?.id, message_id: m, label_id: labelId })) as never,
          { onConflict: "user_id,message_id,label_id" },
        );
        if (error) throw error;
      } else {
        const { error } = await tabla("mail_message_labels")
          .delete().eq("label_id", labelId).in("message_id", ids);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mail-message-labels"] }),
  });
}
