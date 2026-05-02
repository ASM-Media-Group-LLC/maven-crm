import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  ChatterProfile,
  ChatterVaultItem,
  ChatterCriterion,
  ChatterConfig,
} from "@/pages/chatter-evaluator/types";

// The chatter_* tables aren't in the generated Supabase types yet, so we use
// `as unknown` casts to bypass the strict typing. After regenerating types
// post-merge these casts can be removed.

const sb = supabase as unknown as {
  from: (table: string) => any;
};

export const useChatterProfiles = () =>
  useQuery({
    queryKey: ["chatter-profiles"],
    queryFn: async (): Promise<ChatterProfile[]> => {
      const { data, error } = await sb
        .from("chatter_profiles")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatterProfile[];
    },
  });

export const useChatterVaultCounts = () =>
  useQuery({
    queryKey: ["chatter-vault-counts"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await sb
        .from("chatter_vault_items")
        .select("profile_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { profile_id: string }[]) {
        counts[row.profile_id] = (counts[row.profile_id] ?? 0) + 1;
      }
      return counts;
    },
  });

export const useChatterVaultByProfile = (profileId: string | null | undefined) =>
  useQuery({
    queryKey: ["chatter-vault", profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<ChatterVaultItem[]> => {
      const { data, error } = await sb
        .from("chatter_vault_items")
        .select("*")
        .eq("profile_id", profileId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatterVaultItem[];
    },
  });

export const useChatterCriteria = () =>
  useQuery({
    queryKey: ["chatter-criteria"],
    queryFn: async (): Promise<ChatterCriterion[]> => {
      const { data, error } = await sb
        .from("chatter_criteria_defaults")
        .select("*")
        .eq("is_active", true)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatterCriterion[];
    },
  });

export const useChatterConfig = () =>
  useQuery({
    queryKey: ["chatter-config"],
    queryFn: async (): Promise<ChatterConfig | null> => {
      const { data, error } = await sb
        .from("chatter_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChatterConfig | null;
    },
  });

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export type ChatterProfileUpdate = Partial<
  Omit<ChatterProfile, "id" | "key" | "created_at" | "updated_at">
>;

export const useUpdateChatterProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: ChatterProfileUpdate;
    }): Promise<ChatterProfile> => {
      const { data, error } = await sb
        .from("chatter_profiles")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as ChatterProfile;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chatter-profiles"] });
    },
  });
};

// ---- Vault items mutations ------------------------------------------------

const VAULT_BUCKET = "chatter-vault";

const inferMediaType = (filename: string): "image" | "video" | "other" => {
  const lower = filename.toLowerCase();
  if (/\.(mp4|mov|webm|m4v|avi|mkv)$/.test(lower)) return "video";
  if (/\.(jpg|jpeg|png|gif|webp|avif|svg|bmp)$/.test(lower)) return "image";
  return "other";
};

const sanitizeFilename = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `item-${Date.now()}`;

export const useAddVaultItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      profileId,
      profileKey,
      file,
    }: {
      profileId: string;
      profileKey: string;
      file: File;
    }): Promise<ChatterVaultItem> => {
      const path = `${profileKey}/${Date.now()}-${sanitizeFilename(file.name)}`;
      const upload = await supabase.storage.from(VAULT_BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
      if (upload.error) throw upload.error;
      const { data: pub } = supabase.storage.from(VAULT_BUCKET).getPublicUrl(path);

      // Position: append at end
      const { data: maxRow } = await sb
        .from("chatter_vault_items")
        .select("position")
        .eq("profile_id", profileId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextPos = ((maxRow?.position as number | undefined) ?? 0) + 1;

      const row = {
        profile_id: profileId,
        name: file.name,
        url: pub.publicUrl,
        media_type: inferMediaType(file.name),
        position: nextPos,
      };
      const { data, error } = await sb
        .from("chatter_vault_items")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return data as ChatterVaultItem;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["chatter-vault", vars.profileId] });
      qc.invalidateQueries({ queryKey: ["chatter-vault-counts"] });
    },
  });
};

export const useDeleteVaultItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      item,
    }: {
      item: ChatterVaultItem;
    }): Promise<void> => {
      // Best-effort: if URL points to our Storage bucket, also delete the
      // underlying object. Otherwise (URL on the legacy host), just remove
      // the DB row — we don't own the file.
      const m = item.url.match(/\/storage\/v1\/object\/public\/chatter-vault\/(.+)$/);
      if (m) {
        await supabase.storage.from(VAULT_BUCKET).remove([decodeURIComponent(m[1])]);
      }
      const { error } = await sb
        .from("chatter_vault_items")
        .delete()
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["chatter-vault", vars.item.profile_id] });
      qc.invalidateQueries({ queryKey: ["chatter-vault-counts"] });
    },
  });
};

export const useReorderVaultItems = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      profileId,
      orderedIds,
    }: {
      profileId: string;
      orderedIds: string[];
    }): Promise<void> => {
      // Update each row's position. Could batch via RPC; for now sequential is fine
      // for the small N (~76) we have.
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await sb
          .from("chatter_vault_items")
          .update({ position: i + 1 })
          .eq("id", orderedIds[i]);
        if (error) throw error;
      }
      // Touch the profile_id closure to silence unused warnings on simple builds
      void profileId;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["chatter-vault", vars.profileId] });
    },
  });
};

// ---- Criteria mutations --------------------------------------------------

export type CriterionInput = {
  label: string;
  label_en: string | null;
  weight?: number;
  position?: number;
  is_active?: boolean;
};

export const useUpsertCriterion = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id?: string;
      patch: CriterionInput;
    }): Promise<ChatterCriterion> => {
      if (id) {
        const { data, error } = await sb
          .from("chatter_criteria_defaults")
          .update(patch)
          .eq("id", id)
          .select("*")
          .single();
        if (error) throw error;
        return data as ChatterCriterion;
      }
      const { data, error } = await sb
        .from("chatter_criteria_defaults")
        .insert(patch)
        .select("*")
        .single();
      if (error) throw error;
      return data as ChatterCriterion;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-criteria"] }),
  });
};

export const useDeleteCriterion = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await sb
        .from("chatter_criteria_defaults")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-criteria"] }),
  });
};

export const useReorderCriteria = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]): Promise<void> => {
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await sb
          .from("chatter_criteria_defaults")
          .update({ position: i + 1 })
          .eq("id", orderedIds[i]);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-criteria"] }),
  });
};

// ---- Config mutations ----------------------------------------------------

export type ConfigUpdate = Partial<
  Omit<ChatterConfig, "id" | "updated_at">
>;

export const useUpdateChatterConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ConfigUpdate): Promise<ChatterConfig> => {
      const { data, error } = await sb
        .from("chatter_config")
        .update(patch)
        .eq("id", 1)
        .select("*")
        .single();
      if (error) throw error;
      return data as ChatterConfig;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatter-config"] }),
  });
};

