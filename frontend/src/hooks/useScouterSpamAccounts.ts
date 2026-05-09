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
      const { data, error } = await supabase
        .from("scouter_spam_accounts")
        .insert({
          instagram_handle: handle,
          instagram_url: input.instagram_url?.trim() || null,
          display_name: input.display_name?.trim() || null,
          scouter_id: input.scouter_id ?? null,
          status: input.status ?? "active",
          notes: input.notes?.trim() || null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as ScouterSpamAccount;
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
