import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Estado de cada contacto para colorear la fila del directorio. Lo calcula server-side
// la RPC get_contact_statuses (SECURITY DEFINER): cruza closers_contacts con creators
// (match por handle) y closer_creators (pipeline). Solo devuelve los != 'none'.
//   creator_active → verde   ·   ex_creator → rojo   ·   in_progress → amarillo
export type ContactStatus = "creator_active" | "ex_creator" | "in_progress";

export function useContactStatuses() {
  const { data } = useQuery({
    queryKey: ["contact-statuses"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: rpc, error } = await (supabase as any).rpc("get_contact_statuses");
      if (error) {
        if (error.code === "42501") return new Map<string, ContactStatus>(); // sin permiso → sin colores
        throw error;
      }
      const rows = (rpc?.rows ?? []) as Array<{ contact_id: string; status: string }>;
      const m = new Map<string, ContactStatus>();
      for (const r of rows) {
        if (r.contact_id) m.set(r.contact_id, r.status as ContactStatus);
      }
      return m;
    },
  });
  return data ?? new Map<string, ContactStatus>();
}
