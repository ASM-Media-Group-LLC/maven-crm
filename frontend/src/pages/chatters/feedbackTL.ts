import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// FEEDBACK DEL TL — lo que el supervisor registra de un chatter en el día y que
// suma o resta a su nota.
//
// La nota base la sigue calculando su proceso en `chatter_daily_score`; esto
// vive aparte y se aplica al LEER (RPC chatter_dashboard_periodo). Así un
// recálculo no se lleva puesto el ajuste — la lección que dejó corte_cierre_prep.

export type TipoFeedback =
  | "falta_no_justificada"
  | "bajo_rendimiento"
  | "mala_actitud"
  | "buena_actitud"
  | "buen_performance";

/** Catálogo con los puntos por defecto. Los puntos se GUARDAN en la fila, así
 *  que cambiar un valor acá no reescribe el historial. */
export const TIPOS_FEEDBACK: Array<{
  tipo: TipoFeedback;
  label: string;
  puntos: number;
  ayuda: string;
}> = [
  { tipo: "falta_no_justificada", label: "Falta no justificada", puntos: -2, ayuda: "No apareció y no avisó." },
  { tipo: "bajo_rendimiento", label: "Bajo rendimiento", puntos: -1, ayuda: "Estuvo, pero por debajo de lo que puede." },
  { tipo: "mala_actitud", label: "Mala actitud", puntos: -1, ayuda: "Trato o disposición fuera de lugar." },
  { tipo: "buena_actitud", label: "Buena actitud", puntos: 0.5, ayuda: "Ayudó, cubrió, buena disposición." },
  { tipo: "buen_performance", label: "Buen performance", puntos: 1, ayuda: "Se pasó de lo esperado." },
];

export const feedbackDe = (tipo: string) => TIPOS_FEEDBACK.find((t) => t.tipo === tipo);

export interface FeedbackTL {
  id: string;
  identity_id: string;
  dia: string;
  tipo: TipoFeedback;
  puntos: number;
  comentario: string | null;
  created_by: string;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const SIN_FEEDBACK: FeedbackTL[] = [];

/** Feedback de un chatter en un rango (el más nuevo primero). */
export function useFeedbackDeChatter(identityId: string | null, desde: string, hasta: string) {
  const q = useQuery({
    enabled: !!identityId,
    queryKey: ["feedback-tl", identityId, desde, hasta],
    queryFn: async (): Promise<FeedbackTL[]> => {
      const { data, error } = await db
        .from("chatter_tl_feedback")
        .select("*")
        .eq("identity_id", identityId!)
        .gte("dia", desde)
        .lte("dia", hasta)
        .order("dia", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as FeedbackTL[];
    },
  });
  return { feedback: q.data ?? SIN_FEEDBACK, cargando: q.isLoading };
}

export function useMutacionesFeedback() {
  const qc = useQueryClient();
  // Al registrar o borrar cambia la nota del período, así que se invalida
  // también lo que la muestra (el tablero del supervisor y Rendimiento).
  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["feedback-tl"] });
    qc.invalidateQueries({ queryKey: ["chatter-rendimiento"] });
  };

  const registrar = useMutation({
    mutationFn: async (v: { identityId: string; dia: string; tipo: TipoFeedback; comentario?: string }) => {
      const cat = feedbackDe(v.tipo);
      if (!cat) throw new Error("Tipo de feedback desconocido");
      const { data: sesion } = await supabase.auth.getUser();
      const { error } = await db.from("chatter_tl_feedback").insert({
        identity_id: v.identityId,
        dia: v.dia,
        tipo: v.tipo,
        puntos: cat.puntos,
        comentario: v.comentario?.trim() || null,
        created_by: sesion.user?.id,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidar,
  });

  const borrar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("chatter_tl_feedback").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidar,
  });

  return { registrar, borrar };
}
