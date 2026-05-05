import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Types mirror the scouter_spammer_accounts table. Kept inline here so
// the rest of the app can import them without a regen step.
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
 *  current_tenant_id(); user_id is auth.uid() via RLS policy. */
export const useInsertSpammerAccount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InsertSpammerAccountInput): Promise<SpammerAccount> => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes.user) throw userErr ?? new Error("No hay sesión activa.");
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
        })
        .select("*")
        .single();
      if (error) throw error;
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

export interface UpdateSpammerAccountInput {
  id: string;
  display_name?: string;
  account_niche?: AccountNiche;
  active?: boolean;
}

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
