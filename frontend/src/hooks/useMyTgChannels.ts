import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MyTgChannel {
  account_id: string;
  label: string | null;
}

// Líneas de Telegram (tg_channels) para el selector de línea del TgChatButton y el filtro
// de la bandeja. La RLS de tg_channels filtra por tenant. Se sincroniza con el gateway
// (tg-sync-channels) desde la página de Cuentas.
export function useMyTgChannels() {
  return useQuery({
    queryKey: ["my-tg-channels"],
    queryFn: async (): Promise<MyTgChannel[]> => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => any })
        .from("tg_channels")
        .select("account_id, label")
        .order("label", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MyTgChannel[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
