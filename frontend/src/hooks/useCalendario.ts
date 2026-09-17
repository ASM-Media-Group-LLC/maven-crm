import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type VisibilidadEvento = "privado" | "equipo";

export interface EventoDelCalendario {
  id: string;
  owner_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  description: string | null;
  url: string | null;
  visibility: VisibilidadEvento;
  source: "maven" | "correo";
  external_uid: string | null;
  organiza_nombre: string | null;
  organiza_email: string | null;
  estado: "confirmado" | "cancelado";
}

/** `types.ts` es generado y todavía no conoce esta tabla. El `as never` evita
 *  que tsc tire "Type instantiation is excessively deep"; mismo patrón que
 *  documentos y grabaciones. */
function tabla() {
  return supabase.from("calendar_events" as never);
}

const COLUMNAS =
  "id, owner_id, title, starts_at, ends_at, all_day, location, description, url, visibility, source, external_uid, organiza_nombre, organiza_email, estado";

/** Los eventos que caen dentro de un rango.
 *
 *  ⚠️ El filtro es por SOLAPAMIENTO, no por fecha de inicio: una reunión que
 *  empezó el 31 y termina el 1 tiene que verse en los dos meses. Filtrar solo
 *  por `starts_at` la haría desaparecer del mes donde de verdad está pasando. */
export function useEventos(desde: Date, hasta: Date) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["eventos", desde.toISOString(), hasta.toISOString(), user?.id],
    enabled: !!user,
    queryFn: async (): Promise<EventoDelCalendario[]> => {
      const { data, error } = await tabla()
        .select(COLUMNAS)
        .lte("starts_at", hasta.toISOString())
        // `ends_at` nulo = evento sin fin declarado: se compara contra su inicio.
        .or(`ends_at.gte.${desde.toISOString()},and(ends_at.is.null,starts_at.gte.${desde.toISOString()})`)
        .order("starts_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as EventoDelCalendario[];
    },
  });
}

export interface EventoNuevo {
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  visibility: VisibilidadEvento;
}

export function useCrearEvento() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (ev: EventoNuevo) => {
      const { error } = await tabla().insert({ ...ev, owner_id: user?.id } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eventos"] }),
  });
}

export function useGuardarEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...campos }: Partial<EventoNuevo> & { id: string }) => {
      const { error } = await tabla().update(campos as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eventos"] }),
  });
}

export function useBorrarEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await tabla().delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eventos"] }),
  });
}
