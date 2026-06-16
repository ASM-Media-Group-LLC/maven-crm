import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Canales de venta por los que se contactó a un contacto vía WhatsApp.
// "Contactado por un canal" = existe al menos UN mensaje OUTBOUND (direction='out')
// en una wa_conversation de ese canal.
//
// Cadena de datos (todo read-only):
//   closers_contacts.id  ←(source_contact_id)←  closer_creators.id
//     ←(closer_creator_id)←  wa_contacts.id  ←(contact_id)←  wa_conversations (channel_id)
//     →  wa_channels (id, label)
// y "outbound existe" sale de wa_conversation_messages (conversation_id, direction='out').
//
// Gateado a ADMIN (las RLS de wa_* darían data incompleta a no-admins) → `enabled`.

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
  const { data, isLoading } = useQuery<BuiltData>({
    queryKey: ["contact-sales-channels"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const sb = supabase as any;

      // 1) Canales (≈7 filas)
      const { data: channelsRaw, error: chErr } = await sb
        .from("wa_channels")
        .select("id, label, evolution_instance");
      if (chErr) throw chErr;
      const channelLabel = (row: any): string =>
        (row?.label || row?.evolution_instance || "Canal").toString();
      const channelLabelById = new Map<string, string>();
      const channels: SalesChannelOption[] = (channelsRaw ?? []).map((r: any) => {
        const label = channelLabel(r);
        channelLabelById.set(r.id, label);
        return { id: r.id as string, label };
      });
      channels.sort((a, b) => a.label.localeCompare(b.label));

      // 2) Conversaciones (≈89 filas)
      const { data: convsRaw, error: convErr } = await sb
        .from("wa_conversations")
        .select("id, contact_id, channel_id, last_message_at");
      if (convErr) throw convErr;
      const convs = convsRaw ?? [];

      // 3) Conjunto de conversaciones con outbound (dedupe client-side)
      const { data: outRaw, error: outErr } = await sb
        .from("wa_conversation_messages")
        .select("conversation_id")
        .eq("direction", "out");
      if (outErr) throw outErr;
      const outboundConvIds = new Set<string>();
      (outRaw ?? []).forEach((m: any) => {
        if (m.conversation_id) outboundConvIds.add(m.conversation_id);
      });

      // 4) wa_contacts con closer_creator_id (≈67 filas)
      const { data: waContactsRaw, error: wcErr } = await sb
        .from("wa_contacts")
        .select("id, closer_creator_id")
        .not("closer_creator_id", "is", null);
      if (wcErr) throw wcErr;
      const waContacts = waContactsRaw ?? [];
      // wa_contact.id → closer_creator_id
      const waContactToCloserCreator = new Map<string, string>();
      const closerCreatorIds = new Set<string>();
      waContacts.forEach((w: any) => {
        if (w.id && w.closer_creator_id) {
          waContactToCloserCreator.set(w.id, w.closer_creator_id);
          closerCreatorIds.add(w.closer_creator_id);
        }
      });

      // 5) closer_creators referenciados → source_contact_id (= closers_contacts.id)
      const closerCreatorToContact = new Map<string, string>();
      if (closerCreatorIds.size > 0) {
        const { data: ccRaw, error: ccErr } = await sb
          .from("closer_creators")
          .select("id, source_contact_id")
          .in("id", Array.from(closerCreatorIds));
        if (ccErr) throw ccErr;
        (ccRaw ?? []).forEach((cc: any) => {
          if (cc.id && cc.source_contact_id) {
            closerCreatorToContact.set(cc.id, cc.source_contact_id);
          }
        });
      }

      // Ensamblar: por cada conversación con outbound → resolver contacto →
      // closer_creator → source_contact_id → agregar canal (dedupe, última fecha).
      // Mapa intermedio: contactId → (channelId → lastAt más reciente)
      const acc = new Map<string, Map<string, string | null>>();
      for (const conv of convs) {
        if (!outboundConvIds.has(conv.id)) continue;
        if (!conv.channel_id) continue;
        const closerCreatorId = waContactToCloserCreator.get(conv.contact_id);
        if (!closerCreatorId) continue;
        const contactId = closerCreatorToContact.get(closerCreatorId);
        if (!contactId) continue;

        const channelMap = acc.get(contactId) ?? new Map<string, string | null>();
        const prev = channelMap.get(conv.channel_id);
        const cur = conv.last_message_at ?? null;
        // Quedarse con la fecha más reciente
        if (prev === undefined) {
          channelMap.set(conv.channel_id, cur);
        } else if (cur && (!prev || new Date(cur) > new Date(prev))) {
          channelMap.set(conv.channel_id, cur);
        }
        acc.set(contactId, channelMap);
      }

      const byContactId = new Map<string, ContactChannel[]>();
      const countsAcc = new Map<string, number>();
      let multiChannelCount = 0;
      for (const [contactId, channelMap] of acc.entries()) {
        const list: ContactChannel[] = Array.from(channelMap.entries()).map(
          ([channelId, lastAt]) => ({
            channelId,
            label: channelLabelById.get(channelId) || "Canal",
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
