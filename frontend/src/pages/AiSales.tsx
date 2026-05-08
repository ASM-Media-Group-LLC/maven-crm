import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import ClariAiChat from "@/components/ClariAiChat";
import AiChatSidebar from "@/components/AiChatSidebar";
import { toast } from "sonner";
import { useAiConversations } from "@/hooks/useAiConversations";
import { useQueryClient } from "@tanstack/react-query";
import VentasSubtabs from "./sales-overview/VentasSubtabs";

// ClariAvatar — mismo patrón que MikeAvatar en agency-qa: gradiente
// violeta/azul (paleta Maven) + Sparkles fallback. Usado en el header
// de la página para darle identidad al asistente.
const ClariAvatar = ({ size = 44 }: { size?: number }) => {
  const [errored, setErrored] = useState(false);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm ring-2 ring-violet-500/20"
      style={{ width: size, height: size }}
    >
      {errored ? (
        <Sparkles className="h-1/2 w-1/2" />
      ) : (
        <img
          src="/clari-avatar.png"
          alt="Clari"
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      )}
    </span>
  );
};

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
      {/* Topbar fijo con VentasSubtabs */}
      <div className="border-b border-border bg-background px-6 py-3 shrink-0">
        <VentasSubtabs />
      </div>

      {/* Contenido scrolleable. Replicamos el layout de Chat with Mike:
          header con avatar + título + descripción, después grid de
          sidebar + card del chat. */}
      <div className="flex-1 overflow-hidden p-4 md:p-6">
        <div className="flex h-full flex-col gap-3">
          {/* Header */}
          <div className="flex items-start gap-3 shrink-0">
            <ClariAvatar size={44} />
            <div className="min-w-0">
              <h2 className="text-base font-semibold">Chat con Clari</h2>
              <p className="text-xs text-muted-foreground">
                Clari es tu asistente IA de ventas — conoce a todas tus
                creadoras y sus métricas. Hacele preguntas sobre tendencias,
                rankings, comparativas o quién está subiendo / bajando.
              </p>
            </div>
          </div>

          {/* Grid sidebar + chat */}
          <div className="grid flex-1 grid-cols-[260px_1fr] gap-3 overflow-hidden">
            <Card className="flex flex-col overflow-hidden p-0">
              <AiChatSidebar
                conversations={conversations}
                activeId={activeId}
                onSelect={setActiveId}
                onCreate={handleCreate}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            </Card>

            <Card className="flex min-h-0 flex-col overflow-hidden">
              {/* Header de la conversación activa */}
              <div className="border-b border-border/60 px-4 py-3 shrink-0">
                <p className="text-sm font-semibold truncate">
                  {activeConversation?.title ?? "Nueva conversación"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {activeConversation
                    ? "Hablando sobre todas tus creadoras y sus earnings"
                    : "Iniciá una conversación o seleccioná una del listado"}
                </p>
              </div>

              {/* Chat — mode full muestra welcome + bubbles + input */}
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
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
};

export default AiSales;
