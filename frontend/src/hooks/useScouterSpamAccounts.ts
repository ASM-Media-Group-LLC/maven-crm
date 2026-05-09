import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Hooks para `scouter_spam_accounts` — el roster de cuentas de Instagram
// que los scouters/spammers usan para hacer outreach manual (DMs, follows,
// comentarios). El manager ve esto en el tab "Cuentas" de Scouter Assist
// para auditar quién usa qué y rotar cuentas baneadas.
//
// RLS scopea por tenant; el frontend no necesita pasar tenant_id porque
// el DEFAULT de la columna lo resuelve via current_tenant_id().

export type SpamAccountStatus = "active" | "shadowbanned" | "banned" | "retired";

export const SPAM_ACCOUNT_STATUS_OPTIONS: Array<{
  value: SpamAccountStatus;
  label: string;
}> = [
  { value: "active", label: "Activa" },
  { value: "shadowbanned", label: "Shadowban" },
  { value: "banned", label: "Baneada" },
  { value: "retired", label: "Retirada" },
];

export type ScanStatus = "pending" | "scanning" | "done" | "failed";

export interface SpamAccountAiRedFlag {
  signal: string;
  severity: "low" | "medium" | "high";
}

export interface SpamAccountAiAnalysis {
  score: number;
  summary: string;
  would_respond: "si" | "no" | "tal_vez";
  why_not: string;
  strengths: string[];
  red_flags: SpamAccountAiRedFlag[];
  urgent_improvements: string[];
  recommendations: string[];
  scanned_at: string;
}

export interface ScouterSpamAccount {
  id: string;
  tenant_id: string;
  scouter_id: string | null;
  instagram_handle: string;
  instagram_url: string | null;
  display_name: string | null;
  status: SpamAccountStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Snapshot de IG capturado en el último scan.
  profile_photo_url: string | null;
  followers_count: number | null;
  following_count: number | null;
  posts_count: number | null;
  bio: string | null;
  is_verified: boolean | null;
  // Resultado del scan IA.
  ai_score: number | null;
  ai_analysis: SpamAccountAiAnalysis | null;
  last_scanned_at: string | null;
  scan_status: ScanStatus;
  scan_error: string | null;
  // Joined desde profiles para mostrar el nombre del scouter dueño.
  scouter_name?: string | null;
}

// Normaliza el input a handle canónico (lowercase, sin @, sin URL).
export const normalizeIgHandle = (raw: string): string | null => {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^https?:\/\//i, "");
  s = s.replace(/^www\./i, "");
  s = s.replace(/^instagram\.com\//i, "");
  s = s.replace(/^@+/, "");
  s = s.split("?")[0];
  s = s.split("/")[0];
  s = s.toLowerCase().trim();
  if (!s) return null;
  if (!/^[a-z0-9._]+$/.test(s)) return null;
  return s;
};

export const useSpamAccounts = () =>
  useQuery({
    queryKey: ["scouter-spam-accounts"],
    queryFn: async (): Promise<ScouterSpamAccount[]> => {
      const { data, error } = await supabase
        .from("scouter_spam_accounts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const accounts = (data ?? []) as ScouterSpamAccount[];

      // Resolver scouter_name a partir de scouter_id contra profiles.
      // Hacemos un solo IN(...) con todos los scouter_ids únicos.
      const scouterIds = Array.from(
        new Set(accounts.map((a) => a.scouter_id).filter((id): id is string => !!id)),
      );
      if (scouterIds.length === 0) return accounts;
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", scouterIds);
      const nameById = new Map<string, string>();
      (profiles ?? []).forEach((p: { id: string; full_name: string | null }) => {
        nameById.set(p.id, p.full_name ?? "");
      });
      return accounts.map((a) => ({
        ...a,
        scouter_name: a.scouter_id ? nameById.get(a.scouter_id) ?? null : null,
      }));
    },
    staleTime: 30_000,
  });

export interface CreateSpamAccountInput {
  instagram_handle: string;
  instagram_url?: string | null;
  display_name?: string | null;
  scouter_id?: string | null;
  status?: SpamAccountStatus;
  notes?: string | null;
}

export const useCreateSpamAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSpamAccountInput): Promise<ScouterSpamAccount> => {
      const handle = normalizeIgHandle(input.instagram_handle);
      if (!handle) throw new Error("El handle de Instagram no es válido.");

      // Dedup cross-spammer: si el handle ya tiene una fila scaneada
      // (en cualquier scouter del tenant), reusamos el snapshot + ai
      // analysis al insertar la fila nueva. Esto evita correr Apify +
      // Sonnet 4.6 dos veces para la misma cuenta.
      const { data: existing } = await supabase
        .from("scouter_spam_accounts")
        .select(
          "profile_photo_url, followers_count, following_count, posts_count, bio, is_verified, ai_score, ai_analysis, last_scanned_at, scan_status",
        )
        .eq("instagram_handle", handle)
        .order("last_scanned_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      const cloneSnapshot =
        existing && existing.scan_status === "done"
          ? {
              profile_photo_url: existing.profile_photo_url,
              followers_count: existing.followers_count,
              following_count: existing.following_count,
              posts_count: existing.posts_count,
              bio: existing.bio,
              is_verified: existing.is_verified,
              ai_score: existing.ai_score,
              ai_analysis: existing.ai_analysis,
              last_scanned_at: existing.last_scanned_at,
              scan_status: "done" as const,
            }
          : null;

      const { data, error } = await supabase
        .from("scouter_spam_accounts")
        .insert({
          instagram_handle: handle,
          instagram_url: input.instagram_url?.trim() || null,
          display_name: input.display_name?.trim() || null,
          scouter_id: input.scouter_id ?? null,
          status: input.status ?? "active",
          notes: input.notes?.trim() || null,
          ...(cloneSnapshot ?? { scan_status: "pending" }),
        })
        .select("*")
        .single();
      if (error) throw error;

      // Si NO había snapshot existente, disparamos el scan en background
      // (fire-and-forget). El frontend invalida la query cada cierto
      // tiempo y la fila se actualiza con el resultado cuando termina.
      if (!cloneSnapshot) {
        supabase.functions
          .invoke("scouter-spam-account-scan", {
            body: { account_id: (data as { id: string }).id },
          })
          .catch((err) => {
            console.warn("scouter-spam-account-scan invoke failed:", err);
          });
      }

      return data as ScouterSpamAccount;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouter-spam-accounts"] });
    },
  });
};

/** Re-escanea una cuenta existente. Útil para el botón manual del UI
 *  o para el cron mensual. Devuelve cuando el edge termina o falla. */
export const useRescanSpamAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string): Promise<void> => {
      const { error } = await supabase.functions.invoke("scouter-spam-account-scan", {
        body: { account_id: accountId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouter-spam-accounts"] });
    },
  });
};

export interface UpdateSpamAccountInput {
  id: string;
  patch: Partial<{
    instagram_handle: string;
    instagram_url: string | null;
    display_name: string | null;
    scouter_id: string | null;
    status: SpamAccountStatus;
    notes: string | null;
  }>;
}

export const useUpdateSpamAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: UpdateSpamAccountInput): Promise<void> => {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (k === "instagram_handle" && typeof v === "string") {
          const h = normalizeIgHandle(v);
          if (!h) throw new Error("El handle de Instagram no es válido.");
          cleaned.instagram_handle = h;
        } else if (typeof v === "string") {
          cleaned[k] = v.trim() || null;
        } else {
          cleaned[k] = v;
        }
      }
      const { error } = await supabase
        .from("scouter_spam_accounts")
        .update(cleaned)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouter-spam-accounts"] });
    },
  });
};

export const useDeleteSpamAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from("scouter_spam_accounts")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scouter-spam-accounts"] });
    },
  });
};
