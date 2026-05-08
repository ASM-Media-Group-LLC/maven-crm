import { useState } from "react";
import ClariAiChat from "@/components/ClariAiChat";
import AiChatSidebar from "@/components/AiChatSidebar";
import { toast } from "sonner";
import { useAiConversations } from "@/hooks/useAiConversations";
import { useQueryClient } from "@tanstack/react-query";
import VentasSubtabs from "./sales-overview/VentasSubtabs";

const AiSales = () => {
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

  const handleTitleSet = () => {
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
          {/* Sub-header con título de la conversación. Antes había un
              botón "Configuración" → /ai-sales-config (modelo + tono +
              custom instructions). Lo removimos: ahora el modelo está
              hardcodeado a Gemini server-side y los datos van precomputed
              en el system prompt — ya no hay nada útil que configurar
              desde el frontend. */}
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
