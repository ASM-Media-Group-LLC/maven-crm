import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Types mirror the scouter_spammer_accounts table. Kept inline here so
// the rest of the app can import them without a regen step.
// "awaiting_screenshot" se setea cuando la cuenta está restricted y el
// scraper no pudo leerla — el frontend muestra drop-zone para que el
// user suba un screenshot logueado del perfil.
export type ScanStatus =
  | "pending"
  | "scanning"
  | "done"
  | "failed"
  | "awaiting_screenshot";

export interface SpammerAccountAiRedFlag {
  signal: string;
  severity: "low" | "medium" | "high";
}

export interface SpammerAccountAiAnalysis {
  score: number;
  summary: string;
  would_respond: "si" | "no" | "tal_vez";
  why_not: string;
  strengths: string[];
  red_flags: SpammerAccountAiRedFlag[];
  urgent_improvements: string[];
  recommendations: string[];
  scanned_at: string;
}

export interface SpammerAccount {
  id: string;
  user_id: string;
  instagram_handle: string;
  display_name: string;
  profile_pic_url: string | null;
  followers_count: number | null;
  bio: string | null;
  account_niche: string;
  active: boolean;
  last_synced_at: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  // Snapshot extra del scan IA (migration 20260509040000).
  following_count: number | null;
  posts_count: number | null;
  is_verified: boolean | null;
  // IG marca la cuenta como restringida → oculta a viewers no-loggeados.
  // Deal-breaker para outreach: las creators target no pueden ver la
  // cuenta sin estar logueadas. (migration 20260511090000).
  is_restricted: boolean | null;
  // Path en bucket scouter-screenshots. Para cuentas restricted, el user
  // sube un screenshot logueado del perfil; Claude vision extrae bio +
  // nombre + followers para alimentar el análisis. (migration
  // 20260511100000).
  manual_screenshot_path: string | null;
  // Análisis IA — null hasta que el scan corra.
  ai_score: number | null;
  ai_analysis: SpammerAccountAiAnalysis | null;
  last_scanned_at: string | null;
  scan_status: ScanStatus | null;
  scan_error: string | null;
}

export type AccountNiche = "lifestyle" | "fitness" | "adult" | "business" | "mixed";

// The `scouter_*` tables aren't in the generated Supabase types yet —
// cast through unknown so the calls don't need full type plumbing.
const sb = supabase as unknown as { from: (table: string) => any };

// ─── Queries ──────────────────────────────────────────────────────────────

/** Returns all spammer accounts for the current user. For managers/admins
 *  RLS on scouter_spammer_accounts will expand the visible rows to all
 *  accounts in the tenant. */
export const useSpammerAccounts = () =>
  useQuery({
    queryKey: ["spammer-accounts"],
    queryFn: async (): Promise<SpammerAccount[]> => {
      const { data, error } = await sb
        .from("scouter_spammer_accounts")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SpammerAccount[];
    },
  });

// ─── Mutations ────────────────────────────────────────────────────────────

export interface InsertSpammerAccountInput {
  instagram_handle: string;
  display_name: string;
  account_niche: AccountNiche;
  profile_pic_url?: string | null;
  followers_count?: number | null;
  bio?: string | null;
}

/** Insert a new spammer account row. tenant_id is filled by DB DEFAULT
 *  current_tenant_id(); user_id is auth.uid() via RLS policy.
 *
 *  Side effect: dispara un scan IA en background contra la edge function
 *  `scouter-spam-account-scan`. Si el handle ya tiene una fila scaneada
 *  por otro usuario del mismo tenant, importamos el snapshot + análisis
 *  sin re-correr Apify+IA (dedup cross-spammer). */
export const useInsertSpammerAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InsertSpammerAccountInput): Promise<SpammerAccount> => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) throw userErr ?? new Error("No hay sesión activa.");

      // Dedup cross-spammer: si el handle ya tiene una fila escaneada,
      // reusamos el snapshot + análisis al insertar (no quema otra
      // call a Apify + Sonnet).
      const handle = input.instagram_handle.trim().toLowerCase();
      const { data: existing } = await sb
        .from("scouter_spammer_accounts")
        .select(
          "profile_pic_url, followers_count, following_count, posts_count, bio, is_verified, ai_score, ai_analysis, last_scanned_at, scan_status",
        )
        .ilike("instagram_handle", handle)
        .order("last_scanned_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      const cloneSnapshot =
        existing && existing.scan_status === "done"
          ? {
              profile_pic_url: input.profile_pic_url ?? existing.profile_pic_url,
              followers_count: input.followers_count ?? existing.followers_count,
              following_count: existing.following_count,
              posts_count: existing.posts_count,
              bio: input.bio ?? existing.bio,
              is_verified: existing.is_verified,
              ai_score: existing.ai_score,
              ai_analysis: existing.ai_analysis,
              last_scanned_at: existing.last_scanned_at,
              scan_status: "done" as const,
            }
          : null;

      const { data, error } = await sb
        .from("scouter_spammer_accounts")
        .insert({
          user_id: userRes.user.id,
          instagram_handle: input.instagram_handle,
          display_name: input.display_name,
          account_niche: input.account_niche,
          profile_pic_url: input.profile_pic_url ?? null,
          followers_count: input.followers_count ?? null,
          bio: input.bio ?? null,
          active: true,
          ...(cloneSnapshot ?? { scan_status: "pending" }),
        })
        .select("*")
        .single();
      if (error) throw error;

      // Si NO había snapshot existente, dispará el scan en background.
      // Fire-and-forget — el frontend invalida la query y la fila se
      // actualiza con el resultado cuando termina.
      if (!cloneSnapshot) {
        supabase.functions
          .invoke("scouter-spam-account-scan", {
            body: { account_id: (data as { id: string }).id },
          })
          .catch((err) => {
            console.warn("scouter-spam-account-scan invoke failed:", err);
          });
      }

      return data as SpammerAccount;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spammer-accounts"] });
      toast.success("Cuenta spammer registrada");
    },
    onError: (e) => {
      toast.error("No se pudo registrar la cuenta", { description: (e as Error).message });
    },
  });
};

/** Sube un screenshot del perfil para una cuenta restricted y dispara
 *  re-scan. Claude vision extrae bio/nombre/followers/link y alimenta el
 *  análisis con data real. */
export const useUploadSpammerScreenshot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accountId,
      file,
    }: {
      accountId: string;
      file: File;
    }): Promise<void> => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `spammer-profiles/${accountId}-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("scouter-screenshots")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) throw uploadErr;

      const { error: updateErr } = await sb
        .from("scouter_spammer_accounts")
        .update({
          manual_screenshot_path: path,
          scan_status: "pending",
          scan_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", accountId);
      if (updateErr) throw updateErr;

      // Dispara re-scan con el screenshot ya seteado.
      const { error: invokeErr } = await supabase.functions.invoke(
        "scouter-spam-account-scan",
        { body: { account_id: accountId } },
      );
      if (invokeErr) throw invokeErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spammer-accounts"] });
      toast.success("Screenshot subido — re-escaneando con la data del perfil");
    },
    onError: (e) => {
      toast.error("No se pudo subir el screenshot", { description: (e as Error).message });
    },
  });
};

/** Re-escanea una cuenta existente. Útil para el botón manual del
 *  Panel de control o para el cron mensual. */
export const useRescanSpammerAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (accountId: string): Promise<void> => {
      const { error } = await supabase.functions.invoke("scouter-spam-account-scan", {
        body: { account_id: accountId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spammer-accounts"] });
    },
  });
};

export interface UpdateSpammerAccountInput {
  id: string;
  display_name?: string;
  account_niche?: AccountNiche;
  active?: boolean;
}

/** Eliminar una cuenta spammer del tenant. Hard delete — la fila se
 *  borra de scouter_spammer_accounts y todas las tareas/assignments
 *  asociados via CASCADE (si están configurados). NO toca el handle
 *  de IG ni nada externo. */
export const useDeleteSpammerAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await sb
        .from("scouter_spammer_accounts")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spammer-accounts"] });
      toast.success("Cuenta eliminada");
    },
    onError: (e) => {
      toast.error("No se pudo eliminar", { description: (e as Error).message });
    },
  });
};

/** Update mutable fields: display_name, niche, active. */
export const useUpdateSpammerAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateSpammerAccountInput): Promise<SpammerAccount> => {
      const { data, error } = await sb
        .from("scouter_spammer_accounts")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as SpammerAccount;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["spammer-accounts"] });
      toast.success("Cuenta actualizada");
    },
    onError: (e) => {
      toast.error("No se pudo actualizar la cuenta", { description: (e as Error).message });
    },
  });
};
