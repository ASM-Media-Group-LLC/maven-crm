import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type CustomContentRequest = {
  id: string;
  creator_id: string | null;
  title: string;
  description: string | null;
  content_type: string;
  status: string;
  priority: string;
  requested_by: string | null;
  notes: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  creators?: { id: string; name: string; artistic_name: string | null; profile_photo_url: string | null } | null;
  profiles?: { id: string; full_name: string | null } | null;
};

export const useCustomRequests = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["custom-content-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_content_requests")
        .select("*, creators(id, name, artistic_name, profile_photo_url), profiles(id, full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as CustomContentRequest[];
    },
  });

  const createRequest = useMutation({
    mutationFn: async (values: {
      title: string;
      description?: string;
      content_type: string;
      creator_id?: string | null;
      priority?: string;
      due_date?: string | null;
    }) => {
      const { error } = await supabase.from("custom_content_requests").insert({
        ...values,
        requested_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-content-requests"] });
      toast.success("Solicitud creada exitosamente");
    },
    onError: () => toast.error("Error al crear la solicitud"),
  });

  const updateRequest = useMutation({
    mutationFn: async ({ id, ...values }: { id: string; status?: string; notes?: string; completed_at?: string | null }) => {
      const { error } = await supabase
        .from("custom_content_requests")
        .update(values)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-content-requests"] });
      toast.success("Solicitud actualizada");
    },
    onError: () => toast.error("Error al actualizar"),
  });

  const deleteRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_content_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-content-requests"] });
      toast.success("Solicitud eliminada");
    },
    onError: () => toast.error("Error al eliminar"),
  });

  return { requests, isLoading, createRequest, updateRequest, deleteRequest };
};
