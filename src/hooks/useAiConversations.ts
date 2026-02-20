import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AiConversation = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type AiMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export function useAiConversations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["ai_conversations", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("ai_conversations")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as AiConversation[];
    },
    enabled: !!user?.id,
  });

  const createConversation = useMutation({
    mutationFn: async (title?: string) => {
      if (!user?.id) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("ai_conversations")
        .insert({ user_id: user.id, title: title || "Nueva conversación" })
        .select()
        .single();
      if (error) throw error;
      return data as AiConversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai_conversations", user?.id] });
    },
  });

  const deleteConversation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ai_conversations")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai_conversations", user?.id] });
    },
  });

  const renameConversation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase
        .from("ai_conversations")
        .update({ title })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai_conversations", user?.id] });
    },
  });

  return {
    conversations,
    isLoading,
    createConversation,
    deleteConversation,
    renameConversation,
  };
}

export function useAiMessages(conversationId: string | null) {
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["ai_messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const { data, error } = await supabase
        .from("ai_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as AiMessage[];
    },
    enabled: !!conversationId,
  });

  const saveMessage = async (
    convId: string,
    role: "user" | "assistant",
    content: string
  ) => {
    const { error } = await supabase
      .from("ai_messages")
      .insert({ conversation_id: convId, role, content });
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["ai_messages", convId] });
  };

  const updateConversationTitle = async (convId: string, title: string) => {
    await supabase
      .from("ai_conversations")
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", convId);
  };

  return { messages, isLoading, saveMessage, updateConversationTitle };
}
