import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface ProjectLink {
  id: string;
  project_id: string;
  name: string;
  url: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ProjectDocumentation {
  id: string;
  project_id: string;
  content: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export const useProjectLinks = (projectId: string) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = ["project-links", projectId];

  const { data: links = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_links")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ProjectLink[];
    },
    enabled: !!projectId,
  });

  const addLink = useMutation({
    mutationFn: async ({ name, url }: { name: string; url: string }) => {
      const { error } = await (supabase as any)
        .from("project_links")
        .insert({ project_id: projectId, name, url, created_by: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: "Enlace agregado" });
    },
  });

  const updateLink = useMutation({
    mutationFn: async ({ id, name, url }: { id: string; name: string; url: string }) => {
      const { error } = await (supabase as any)
        .from("project_links")
        .update({ name, url, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const deleteLink = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("project_links")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: "Enlace eliminado" });
    },
  });

  return { links, isLoading, addLink, updateLink, deleteLink };
};

export const useProjectDocumentation = (projectId: string) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = ["project-documentation", projectId];

  const { data: doc, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_documentation")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data as ProjectDocumentation | null;
    },
    enabled: !!projectId,
  });

  const saveDoc = useMutation({
    mutationFn: async (content: string) => {
      if (doc) {
        const { error } = await (supabase as any)
          .from("project_documentation")
          .update({ content, updated_by: user!.id, updated_at: new Date().toISOString() })
          .eq("id", doc.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("project_documentation")
          .insert({ project_id: projectId, content, updated_by: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: "Documentación guardada" });
    },
  });

  return { doc, isLoading, saveDoc };
};
