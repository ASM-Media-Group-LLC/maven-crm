import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";

// Canales de venta por los que se contactó a un contacto vía WhatsApp.
// "Contactado por un canal" = existe al menos UN mensaje OUTBOUND (direction='out')
// en una wa_conversation de ese canal.
//
// La lógica corre server-side en la RPC `get_contact_sales_channels` (SECURITY
// DEFINER, gateada a admin/manager): así los managers también la ven completa
// (las RLS de wa_* recortarían la data a no-admins si se leyera directo). La RPC
// devuelve { channels:[{id,label}], rows:[{contact_id,channel_id,last_at}] }.

export interface ContactChannel {
  channelId: string;
  label: string;
  lastAt: string | null;
}

export interface SalesChannelOption {
  id: string;
  label: string;
}

export interface ChannelCount {
  id: string;
  label: string;
  count: number;
}

interface BuiltData {
  byContactId: Map<string, ContactChannel[]>;
  channels: SalesChannelOption[];
  countsByChannel: ChannelCount[];
  multiChannelCount: number;
}

const EMPTY: BuiltData = {
  byContactId: new Map(),
  channels: [],
  countsByChannel: [],
  multiChannelCount: 0,
};

export function useContactSalesChannels(enabled: boolean) {
  // El idioma va en la llave: la etiqueta de repuesto ("Canal") se arma adentro
  // de la consulta, y sin esto quedaba en el idioma de la primera carga.
  const { t, language } = useLanguage();
  const { data, isLoading } = useQuery<BuiltData>({
    queryKey: ["contact-sales-channels", language],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const sb = supabase as any;
      const { data: rpc, error } = await sb.rpc("get_contact_sales_channels");
      if (error) throw error;

      const channelsRaw = (rpc?.channels ?? []) as Array<{ id: string; label: string }>;
      const rows = (rpc?.rows ?? []) as Array<{ contact_id: string; channel_id: string; last_at: string | null }>;

      const channelLabelById = new Map<string, string>();
      const channels: SalesChannelOption[] = channelsRaw.map((r) => {
        channelLabelById.set(r.id, r.label);
        return { id: r.id, label: r.label };
      });
      channels.sort((a, b) => a.label.localeCompare(b.label));

      // contactId → (channelId → lastAt). La RPC ya hizo max() por contacto+canal.
      const acc = new Map<string, Map<string, string | null>>();
      for (const row of rows) {
        if (!row.contact_id || !row.channel_id) continue;
        const channelMap = acc.get(row.contact_id) ?? new Map<string, string | null>();
        channelMap.set(row.channel_id, row.last_at ?? null);
        acc.set(row.contact_id, channelMap);
      }

      const byContactId = new Map<string, ContactChannel[]>();
      const countsAcc = new Map<string, number>();
      let multiChannelCount = 0;
      for (const [contactId, channelMap] of acc.entries()) {
        const list: ContactChannel[] = Array.from(channelMap.entries()).map(
          ([channelId, lastAt]) => ({
            channelId,
            label: channelLabelById.get(channelId) || t("contactos.channelFallback"),
            lastAt,
          }),
        );
        list.sort((a, b) => a.label.localeCompare(b.label));
        byContactId.set(contactId, list);
        if (list.length >= 2) multiChannelCount += 1;
        for (const ch of list) {
          countsAcc.set(ch.channelId, (countsAcc.get(ch.channelId) ?? 0) + 1);
        }
      }

      const countsByChannel: ChannelCount[] = channels
        .map((ch) => ({ id: ch.id, label: ch.label, count: countsAcc.get(ch.id) ?? 0 }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

      return { byContactId, channels, countsByChannel, multiChannelCount };
    },
  });

  const built = data ?? EMPTY;

  // closers_contacts ids contactados por CUALQUIERA de los canales dados.
  const contactIdsForChannels = useMemo(() => {
    return (channelIds: string[]): string[] => {
      if (!channelIds.length) return [];
      const wanted = new Set(channelIds);
      const ids: string[] = [];
      for (const [contactId, list] of built.byContactId.entries()) {
        if (list.some((ch) => wanted.has(ch.channelId))) ids.push(contactId);
      }
      return ids;
    };
  }, [built.byContactId]);

  // Todos los closers_contacts ids con ≥1 canal.
  const allContactedIds = useMemo(
    () => Array.from(built.byContactId.keys()),
    [built.byContactId],
  );

  return {
    byContactId: built.byContactId,
    channels: built.channels,
    contactIdsForChannels,
    allContactedIds,
    countsByChannel: built.countsByChannel,
    multiChannelCount: built.multiChannelCount,
    isLoading,
  };
}
