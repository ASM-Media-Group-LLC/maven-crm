import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
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

// messages-pro-get-participants → data.data.list[].withUser. Paginado (offset/limit): la lista
// de fans por modelo puede ser larga → useInfiniteQuery + "Cargar más" (antes traía solo 1 página).
const PARTICIPANTS_PAGE = 40;
export const useBluParticipants = (modelId: number | null, enabled = true) =>
  useInfiniteQuery({
    queryKey: ["blu-mp", "participants", modelId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const d = await callBluMp<{ data?: { list?: Array<{ withUser?: BluParticipant }> } }>({
        action: "participants", modelId, offset: pageParam, limit: PARTICIPANTS_PAGE,
      });
      return (d?.data?.list ?? []).map((p) => p.withUser).filter((u): u is BluParticipant => !!u);
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PARTICIPANTS_PAGE ? undefined : allPages.length * PARTICIPANTS_PAGE,
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

// ── Masivos del modelo (of-mass + smart-messages PRIORITY_MASS), normalizados a una fila común ──
export interface BluMasivo {
  id: string;
  type: "of-mass" | "priority";
  copy: string;
  senderName: string | null;   // quién lo envió (null = otro CRM / "Sent on OnlyFans")
  source: string | null;       // external | priority | ...
  isExternal: boolean;
  price: number;
  sent: number;
  viewed: number;              // veces visto
  purchased: number;           // ventas
  earnings: number;            // dinero recaudado
  sentAt: string | null;
}
const num = (v: unknown) => Number(v) || 0;
export const useBluMasivos = (modelId: number | null, enabled = true) =>
  useQuery({
    queryKey: ["blu-mp", "masivos", modelId],
    queryFn: async (): Promise<BluMasivo[]> => {
      const [ofm, sm] = await Promise.all([
        callBluMp<{ rows?: any[] }>({ action: "of-mass", modelId }),
        callBluMp<{ messages?: any[] }>({ action: "smart-messages", modelId }),
      ]);
      const ofRows: BluMasivo[] = (ofm?.rows ?? []).map((r) => ({
        id: String(r.id ?? r.queueId), type: "of-mass", copy: r.message ?? "",
        senderName: r.senderName && r.senderName !== "Sent on OnlyFans" ? r.senderName : null,
        source: r.source ?? null, isExternal: !!r.isExternal,
        price: num(r.price), sent: num(r.sent), viewed: num(r.viewed), purchased: num(r.purchased), earnings: num(r.earnings),
        sentAt: r.sentAt ?? null,
      }));
      const smRows: BluMasivo[] = (sm?.messages ?? []).map((m) => ({
        id: String(m.id), type: "priority", copy: m.name ?? m.textPreview ?? "",
        senderName: m.senderName ?? null, source: "priority", isExternal: false,
        price: num(m.price), sent: num(m.sent ?? m.sentCount), viewed: num(m.viewed ?? m.viewedCount),
        purchased: num(m.purchased ?? m.purchasedCount), earnings: num(m.earnings),
        sentAt: m.sentAt ?? m.publishedAt ?? null,
      }));
      return [...ofRows, ...smRows];
    },
    enabled: enabled && !!modelId,
    staleTime: 5 * 60_000,
  });
