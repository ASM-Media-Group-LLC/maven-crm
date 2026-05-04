import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: { full_name: string | null; avatar_url: string | null };
}

export const useTaskComments = (taskId: string | null) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["task-comments", taskId],
    queryFn: async () => {
      if (!taskId) return [];
      const { data, error } = await supabase
        .from("task_comments")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      // Fetch profiles for commenters
      const userIds = [...new Set((data || []).map((c: any) => c.user_id))];
      let profileMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", userIds);
        if (profiles) {
          profiles.forEach((p: any) => { profileMap[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url }; });
        }
      }

      return (data || []).map((c: any) => ({
        ...c,
        profile: profileMap[c.user_id] || { full_name: null, avatar_url: null },
      })) as TaskComment[];
    },
    enabled: !!taskId,
  });

  const addComment = useMutation({
    mutationFn: async ({ content }: { content: string }) => {
      if (!taskId || !user) throw new Error("No task or user");
      const { error } = await supabase.from("task_comments").insert({
        task_id: taskId,
        user_id: user.id,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-comments", taskId] });
    },
    onError: () => {
      toast({ title: "Error al agregar comentario", variant: "destructive" });
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase.from("task_comments").delete().eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-comments", taskId] });
    },
  });

  // Get comment count (for badges)
  const commentCount = comments.length;

  return { comments, isLoading, addComment, deleteComment, commentCount };
};
