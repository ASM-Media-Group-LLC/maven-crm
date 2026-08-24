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
