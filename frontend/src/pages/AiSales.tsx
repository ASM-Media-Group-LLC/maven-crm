import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ClariAiChat from "@/components/ClariAiChat";
import AiChatSidebar from "@/components/AiChatSidebar";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { toast } from "sonner";
import { useAiConversations } from "@/hooks/useAiConversations";
import { useQueryClient } from "@tanstack/react-query";
import VentasSubtabs from "./sales-overview/VentasSubtabs";

const AiSales = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { conversations, createConversation, deleteConversation, renameConversation } = useAiConversations();
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeConversation = conversations.find((c) => c.id === activeId);

  const handleCreate = async () => {
    try {
      const conv = await createConversation.mutateAsync(undefined);
      setActiveId(conv.id);
    } catch {
      toast.error("Error al crear conversación");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteConversation.mutateAsync(id);
      if (activeId === id) {
        const remaining = conversations.filter((c) => c.id !== id);
        setActiveId(remaining[0]?.id ?? null);
      }
      toast.success("Conversación eliminada");
    } catch {
      toast.error("Error al eliminar conversación");
    }
  };

  const handleRename = async (id: string, title: string) => {
    try {
      await renameConversation.mutateAsync({ id, title });
    } catch {
      toast.error("Error al renombrar conversación");
    }
  };

  const handleMessageSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["ai_conversations"] });
  };

  const handleTitleSet = (title: string) => {
    queryClient.invalidateQueries({ queryKey: ["ai_conversations"] });
  };

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      {/* Top bar — VentasSubtabs SIEMPRE visibles arriba de todo */}
      <div className="border-b border-border bg-background px-6 py-3 shrink-0">
        <VentasSubtabs />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat Sidebar */}
        <AiChatSidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
          onCreate={handleCreate}
          onDelete={handleDelete}
          onRename={handleRename}
        />

        {/* Main Chat Area */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          {/* Sub-header con título de la conversación + Configuración */}
          <div className="flex items-center justify-between border-b border-border bg-background px-6 py-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold truncate">
                {activeConversation?.title ?? "IA Ventas"}
              </span>
              {!activeConversation && (
                <span className="text-xs text-muted-foreground">
                  Asistente de ventas con IA
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 shrink-0"
              onClick={() => navigate("/ai-sales-config")}
            >
              <Settings className="h-4 w-4" />
              Configuración
            </Button>
          </div>

          {/* Chat Component */}
          <ClariAiChat
            key={activeId ?? "empty"}
            mode="full"
            conversationId={activeId}
            onMessageSaved={handleMessageSaved}
            onConversationTitleSet={handleTitleSet}
            onAutoCreate={async () => {
              try {
                const conv = await createConversation.mutateAsync(undefined);
                setActiveId(conv.id);
                return conv.id;
              } catch {
                toast.error("Error al crear conversación");
                return null;
              }
            }}
          />
        </div>
      </div>
    </main>
  );
};

export default AiSales;
