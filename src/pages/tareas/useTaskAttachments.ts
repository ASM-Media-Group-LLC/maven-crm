import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface TaskAttachment {
  id: string;
  task_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  uploaded_by: string;
  created_at: string;
}

export const useTaskAttachments = (taskId: string | null) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ["task-attachments", taskId],
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from("task_attachments" as any)
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as TaskAttachment[];
    },
    enabled: !!taskId && !!user,
  });

  const uploadAttachment = useMutation({
    mutationFn: async (file: File) => {
      if (!user || !taskId) throw new Error("Missing context");

      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/${taskId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("task-files")
        .upload(path, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from("task_attachments" as any)
        .insert({
          task_id: taskId,
          file_name: file.name,
          file_url: path,
          file_type: file.type || "application/octet-stream",
          file_size: file.size,
          uploaded_by: user.id,
        } as any);
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-attachments", taskId] });
      queryClient.invalidateQueries({ queryKey: ["task-attachment-counts"] });
      toast({ title: "Archivo subido", description: "El archivo fue adjuntado correctamente." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo subir el archivo.", variant: "destructive" });
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: async (attachment: TaskAttachment) => {
      // Delete from storage
      await supabase.storage.from("task-files").remove([attachment.file_url]);
      // Delete from DB
      const { error } = await supabase
        .from("task_attachments" as any)
        .delete()
        .eq("id", attachment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-attachments", taskId] });
      queryClient.invalidateQueries({ queryKey: ["task-attachment-counts"] });
      toast({ title: "Archivo eliminado" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo eliminar el archivo.", variant: "destructive" });
    },
  });

  return { attachments, isLoading, uploadAttachment, deleteAttachment };
};

/** Batch query: get attachment counts + first image URL per task for Kanban thumbnails */
export const useTaskAttachmentSummaries = (taskIds: string[]) => {
  return useQuery({
    queryKey: ["task-attachment-counts", taskIds.sort().join(",")],
    queryFn: async () => {
      if (taskIds.length === 0) return {};
      const { data, error } = await supabase
        .from("task_attachments" as any)
        .select("task_id, file_type, file_url")
        .in("task_id", taskIds)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const result: Record<string, { count: number; firstImageUrl: string | null }> = {};
      (data as unknown as { task_id: string; file_type: string; file_url: string }[]).forEach((row) => {
        if (!result[row.task_id]) {
          result[row.task_id] = { count: 0, firstImageUrl: null };
        }
        result[row.task_id].count++;
        if (!result[row.task_id].firstImageUrl && row.file_type.startsWith("image/")) {
          result[row.task_id].firstImageUrl = row.file_url;
        }
      });
      return result;
    },
    enabled: taskIds.length > 0,
  });
};
