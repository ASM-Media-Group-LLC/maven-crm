import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MyTgChannel {
  account_id: string;
  label: string | null;
}

// Sync en segundo plano de tg_channels con las líneas vinculadas del gateway
// (edge tg-sync-channels). Antes SOLO corría al abrir Telegram → Cuentas, así que una línea
// recién agregada NO aparecía en el selector hasta pasar por esa pantalla. Ahora se dispara
// también acá (donde se usa el picker y el filtro de la bandeja) con un cooldown de módulo:
// una sola llamada por sesión cada 5 min, aunque se monten muchos TgChatButton a la vez.
// Si el usuario no tiene permiso Telegram/Cuentas, el edge devuelve 403 → se ignora en silencio.
const SYNC_COOLDOWN_MS = 5 * 60 * 1000;
let lastSyncAt = 0;
let syncInFlight: Promise<void> | null = null;

async function maybeSyncTgChannels(qc: QueryClient) {
  const now = Date.now();
  if (syncInFlight || now - lastSyncAt < SYNC_COOLDOWN_MS) return;
  lastSyncAt = now; // respeta el cooldown aunque falle (sin permiso / gateway caído)
  syncInFlight = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("tg-sync-channels", {});
      const res = data as { ok?: boolean; synced?: number } | null;
      if (!error && res?.ok && (res.synced ?? 0) > 0) {
        qc.invalidateQueries({ queryKey: ["my-tg-channels"] });
        qc.invalidateQueries({ queryKey: ["tg-channels"] });
      }
    } catch {
      /* noop — el picker sigue mostrando lo que haya en tg_channels */
    } finally {
      syncInFlight = null;
    }
  })();
}

// Líneas de Telegram (tg_channels) para el selector de línea del TgChatButton y el filtro
// de la bandeja. La RLS de tg_channels filtra por tenant.
export function useMyTgChannels() {
  const qc = useQueryClient();
  const query = useQuery({
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
  // Refresca la lista contra el gateway al usar el picker/bandeja (throttled a nivel módulo).
  useEffect(() => {
    void maybeSyncTgChannels(qc);
  }, [qc]);
  return query;
}
