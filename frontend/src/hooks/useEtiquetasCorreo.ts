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

/** Los correos que tienen una etiqueta, de CUALQUIER carpeta.
 *
 *  ⚠️ Una etiqueta no es una carpeta: cruza todas. Un correo etiquetado
 *  "Pagos" y después archivado sigue estando en "Pagos" — si esto filtrara por
 *  carpeta, desaparecería de su etiqueta al archivarlo, que es justo lo que
 *  uno NO espera de una etiqueta.
 *
 *  Va en dos consultas y no en un join: PostgREST puede anidar, pero la
 *  relación es por `message_id` (texto) y no por una FK, así que no hay
 *  relación declarada que seguir. */
export function useCorreosDeEtiqueta(labelId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["mail-por-etiqueta", labelId, user?.id],
    enabled: !!labelId && !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rel, error: e1 } = await tabla("mail_message_labels")
        .select("message_id").eq("label_id", labelId!).limit(500);
      if (e1) throw e1;
      const ids = ((rel ?? []) as unknown as { message_id: string }[])
        .map((r) => r.message_id);
      if (!ids.length) return [];

      const { data, error } = await supabase
        .from("mail_messages" as never)
        .select(
          "id, uid, folder, from_addr, to_addr, cc_addr, subject, date, snippet, unread, message_id, in_reply_to, refs",
        )
        .in("message_id", ids)
        .order("date", { ascending: false })
        .limit(200);
      if (error) throw error;
      // El mismo correo está en la caché de cada buzón que lo recibió; y si
      // alguien tiene una copia en dos carpetas, aparecería dos veces. Se
      // deja UNA por message_id, la más nueva.
      const vistos = new Set<string>();
      return ((data ?? []) as unknown as Record<string, unknown>[]).filter((m) => {
        const k = String(m.message_id ?? m.id);
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      });
    },
  });
}

/** Cuántos SIN LEER tiene cada etiqueta, para el número de la columna.
 *
 *  Va en una consulta aparte y no pegado a `useEtiquetas` porque cambia mucho
 *  más seguido: las etiquetas casi nunca, los no leídos con cada correo que
 *  llega. Juntarlas obligaría a re-traer la lista de etiquetas todo el tiempo. */
export function useNoLeidosPorEtiqueta() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["mail-labels-unread", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data: rel, error } = await tabla("mail_message_labels")
        .select("label_id, message_id").limit(5000);
      if (error) throw error;
      const filas = (rel ?? []) as unknown as { label_id: string; message_id: string }[];
      if (!filas.length) return new Map();

      // Qué message_id están sin leer. Se pregunta por los etiquetados y no por
      // todos: la bandeja tiene miles y las etiquetas, decenas.
      const ids = [...new Set(filas.map((f) => f.message_id))];
      const { data: sinLeer } = await supabase
        .from("mail_messages" as never)
        .select("message_id")
        .in("message_id", ids)
        .eq("unread", true)
        .limit(5000);
      const noLeidos = new Set(
        ((sinLeer ?? []) as unknown as { message_id: string }[]).map((m) => m.message_id),
      );

      const cuenta = new Map<string, number>();
      // ⚠️ Por message_id ÚNICO y no por fila: el mismo correo está en la
      // caché de cada buzón que lo recibió, y contar filas lo contaría dos
      // veces.
      const yaContado = new Set<string>();
      for (const f of filas) {
        const clave = `${f.label_id}|${f.message_id}`;
        if (yaContado.has(clave) || !noLeidos.has(f.message_id)) continue;
        yaContado.add(clave);
        cuenta.set(f.label_id, (cuenta.get(f.label_id) ?? 0) + 1);
      }
      return cuenta;
    },
  });
}
