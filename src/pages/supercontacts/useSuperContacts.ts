import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export interface SuperContact {
  id: string;
  instagram_handle: string;
  full_name: string | null;
  profile_photo_url: string | null;
  followers_count: number | null;
  bio: string | null;
  category: string | null;
  country: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  status: string;
  enriched: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SuperContactInteraction {
  id: string;
  contact_id: string;
  type: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export const useSuperContacts = () => {
  return useQuery({
    queryKey: ["super-contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("super_contacts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SuperContact[];
    },
  });
};

export const useSuperContact = (id: string | undefined) => {
  return useQuery({
    queryKey: ["super-contacts", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("super_contacts")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as SuperContact;
    },
  });
};

export const useSuperContactInteractions = (contactId: string | undefined) => {
  return useQuery({
    queryKey: ["super-contact-interactions", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("super_contact_interactions")
        .select("*")
        .eq("contact_id", contactId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SuperContactInteraction[];
    },
  });
};

export const useCreateSuperContact = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (contact: Partial<SuperContact>) => {
      const { data, error } = await supabase
        .from("super_contacts")
        .insert({ ...contact, created_by: user?.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-contacts"] });
    },
  });
};

export const useImportSuperContacts = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (handles: string[]) => {
      const rows = handles.map((h) => ({
        instagram_handle: h.replace(/^@/, "").trim(),
        created_by: user?.id,
      }));
      const { data, error } = await supabase
        .from("super_contacts")
        .upsert(rows as any, { onConflict: "instagram_handle", ignoreDuplicates: true })
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["super-contacts"] });
      toast({ title: `${data?.length || 0} contactos importados` });
    },
  });
};

export const useUpdateSuperContact = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SuperContact> & { id: string }) => {
      const { data, error } = await supabase
        .from("super_contacts")
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["super-contacts"] });
      qc.invalidateQueries({ queryKey: ["super-contacts", (data as any)?.id] });
    },
  });
};

export const useCreateInteraction = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (interaction: { contact_id: string; type: string; notes?: string }) => {
      const { data, error } = await supabase
        .from("super_contact_interactions")
        .insert({ ...interaction, created_by: user?.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["super-contact-interactions", vars.contact_id] });
    },
  });
};
