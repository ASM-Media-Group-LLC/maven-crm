import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Hooks del viewer on-demand de Messages Pro (edge function `blu-mp`, que proxa el WS de BLU).
// La fn devuelve { ok, data: <respuesta cruda de BLU> }. Acá desempaquetamos cada shape.

async function callBluMp<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("blu-mp", { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error) + (data.expired ? " · re-seed BLU_JWT" : ""));
  return data.data as T; // la respuesta de BLU
}

export interface BluModel {
  id: number;
  internalName?: string | null;
  gender?: string | null;
  aboutMe?: { name?: string | null; username?: string | null } | null;
}
export const bluModelLabel = (m: BluModel) =>
  m.internalName || m.aboutMe?.username || m.aboutMe?.name || `Modelo ${m.id}`;

// agency:models:list → { models: [...] }
export const useBluModels = (enabled = true) =>
  useQuery({
    queryKey: ["blu-mp", "models"],
    queryFn: async () => {
      const d = await callBluMp<{ models?: BluModel[] }>({ action: "models" });
      return (d.models ?? []).slice().sort((a, b) => bluModelLabel(a).localeCompare(bluModelLabel(b)));
    },
    enabled,
    staleTime: 5 * 60_000,
  });

// participante = entrada de la lista; lo que nos interesa vive en `withUser`.
export interface BluParticipant {
  id: number;                 // = chatId
  name?: string | null;
  username?: string | null;
  displayName?: string | null; // suele ser la nota/etiqueta del fan
  avatar?: string | null;
  avatarThumbs?: { c50?: string; c144?: string } | null;
  isActive?: boolean;
  isRestricted?: boolean;
  subscribedByExpire?: boolean;
  currentSubscribePrice?: number;
  listsStates?: Array<{ id: string; type: string; name: string; hasUser: boolean }>;
}

// messages-pro-get-participants → data.data.list[].withUser
export const useBluParticipants = (modelId: number | null, enabled = true) =>
  useQuery({
    queryKey: ["blu-mp", "participants", modelId],
    queryFn: async () => {
      const d = await callBluMp<{ data?: { list?: Array<{ withUser?: BluParticipant }> } }>({
        action: "participants", modelId, offset: 0, limit: 50,
      });
      return (d?.data?.list ?? []).map((p) => p.withUser).filter((u): u is BluParticipant => !!u);
    },
    enabled: enabled && !!modelId,
  });

export interface BluMessage {
  id: number;
  text: string;
  createdAt: string;
  fromMe: boolean;               // true = lado modelo/chatter (derecha)
  isFree: boolean;
  price: number;
  isTip: boolean;
  tipAmount?: number | null;
  mediaCount: number;
  lockedText?: boolean;
  isOpened?: boolean;
  seenByFan?: boolean;
  canPurchase?: boolean;
  sentByManager?: number | { id?: number; name?: string } | null;
  sentByPersona?: unknown;
}

// messages-pro-get-messages → data.data.list[] (order desc → invertimos a cronológico)
export const useBluThread = (modelId: number | null, chatId: number | null, enabled = true) =>
  useQuery({
    queryKey: ["blu-mp", "messages", modelId, chatId],
    queryFn: async () => {
      const d = await callBluMp<{ data?: { list?: BluMessage[] } }>({
        action: "messages", modelId, chatId, limit: 40, order: "desc",
      });
      return (d?.data?.list ?? []).slice().reverse();
    },
    enabled: enabled && !!modelId && !!chatId,
  });

// fan:get-summary → { statistics, notes, insights, ... }
export interface BluFanSummary {
  statistics?: {
    profile?: { username?: string; displayName?: string; avatar?: string; location?: string; lastSeenAt?: string; joinedAt?: string };
    spend?: { currency?: string; totalAmount?: number; tipsAmount?: number; messagesAmount?: number };
    subscription?: { status?: { code?: string; label?: string }; currentPrice?: number; regularPrice?: number; daysSubscribed?: number; isExpired?: boolean };
    agencySpend?: { currency?: string; totalAmount?: number; tier?: { label?: string; color?: string }; byModel?: Array<{ modelId: number; modelName: string; amount: number }> };
  };
  notes?: string;
  insights?: Record<string, unknown>;
}
export const useBluFan = (modelId: number | null, fanId: number | null, enabled = true) =>
  useQuery({
    queryKey: ["blu-mp", "fan", modelId, fanId],
    queryFn: () => callBluMp<BluFanSummary>({ action: "fan-summary", modelId, fanId }),
    enabled: enabled && !!modelId && !!fanId,
  });
