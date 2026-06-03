import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Canales de WhatsApp (líneas) que el usuario actual atiende. La RLS de wa_channels
// ya filtra a los que es miembro (o todos si es admin), así que un select alcanza.
// (supabase as any): las tablas wa_* no están en los tipos generados.
export interface MyWaChannel {
  id: string;
  label: string | null;
  evolution_instance: string;
  department: string;
}

export function useMyWaChannels() {
  return useQuery({
    queryKey: ["my-wa-channels"],
    queryFn: async (): Promise<MyWaChannel[]> => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => any })
        .from("wa_channels")
        .select("id, label, evolution_instance, department")
        .eq("active", true)
        .order("label", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MyWaChannel[];
    },
  });
}
