import { useCallback, useMemo, useState } from "react";
import { Minus, X, Maximize2, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useChatShared } from "@/hooks/ChatProvider";
import { useMessages } from "@/hooks/useChat";
import { useReactions } from "@/hooks/useReactions";
import { useReadReceipts } from "@/hooks/useReadReceipts";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { getStatusColor } from "@/pages/messenger/components/StatusPicker";
import MessageList from "@/pages/messenger/components/MessageList";
import MessageInput from "@/pages/messenger/components/MessageInput";
import type { ChatMessage, ConversationWithDetails } from "@/pages/messenger/types";
import { cn } from "@/lib/utils";

export const VENTANA_ANCHO = 336;
export const VENTANA_ALTO = 460;

/**
 * Ventanita de chat del muelle, estilo Facebook: cabecera compacta, mensajes y
 * el composer COMPLETO (adjuntar, GIF, sticker, nota de voz, emoji, formato).
 *
 * No reusa <ChatView> a propósito: esa es la pantalla grande, con su cabecera
 * de página, el panel de hilos y los menús de fijar/archivar/borrar. En 336px
 * no entra ni tiene sentido. Lo que sí se reusa es lo que de verdad importa —
 * MessageList y MessageInput— así que los mensajes, los recibos, las
 * reacciones y todas las funciones del cajón son exactamente los mismos.
 */
export default function DockChatWindow({
  conversation, onMinimize, onClose,
}: {
  conversation: ConversationWithDetails;
  onMinimize: () => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profiles, markConversationRead } = useChatShared();
  const { isOnline, getStatus } = useOnlinePresence();
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);

  const alLlegarMensaje = useCallback(() => {
    markConversationRead(conversation.id);
  }, [markConversationRead, conversation.id]);

  const {
    messages, loading, hasMore, loadingMore, loadOlderMessages,
    sendMessage, sendTyping, editMessage, deleteMessage, retryMessage,
  } = useMessages(conversation.id, alLlegarMensaje);

  const { toggleReaction, getReactionsForMessage } = useReactions(conversation.id);
  const { getReadBy, getDeliveredBy } = useReadReceipts(conversation.id, messages);

  const isGroup = conversation.type === "group";
  const otro = useMemo(
    () => (isGroup ? undefined : conversation.participants.find((p) => p.user_id !== user?.id)),
    [isGroup, conversation.participants, user?.id],
  );

  return (
    <div
      className="pointer-events-auto flex flex-col overflow-hidden rounded-t-xl border border-border/60 bg-card shadow-2xl ring-1 ring-black/5"
      style={{ width: VENTANA_ANCHO, height: VENTANA_ALTO }}
      role="dialog"
      aria-label={`Chat con ${conversation.displayName}`}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-gradient-to-r from-primary/10 via-card to-card px-2.5 py-2">
        <div className="relative shrink-0">
          {isGroup ? (
            <Avatar className="h-6 w-6">
              {conversation.avatar_url && (
                <AvatarImage src={conversation.avatar_url} alt={conversation.displayName} className="object-cover" />
              )}
              <AvatarFallback className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white">
                <Users className="h-3.5 w-3.5" />
              </AvatarFallback>
            </Avatar>
          ) : (
            <>
              {/* ⚠️ El tamaño va por `size`, NO por className: con muñequito
                  DiceBear el className se aplica al ENVOLTORIO y el avatar
                  interno se queda en su tamaño por defecto (40px) + anillo, se
                  salía del hueco y pisaba el nombre. */}
              <UserAvatar
                name={conversation.displayName}
                src={conversation.avatar_url || otro?.profile?.avatar_url}
                seed={otro?.profile?.avatar_seed}
                size="xs"
              />
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-card",
                  getStatusColor(
                    otro ? getStatus(otro.user_id) : null,
                    otro ? isOnline(otro.user_id) : false,
                  ),
                )}
              />
            </>
          )}
        </div>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{conversation.displayName}</p>
        <Button
          variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
          title="Abrir en Messenger"
          onClick={() => { onClose(); navigate(`/messenger?c=${conversation.id}`); }}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="Minimizar" onClick={onMinimize}>
          <Minus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" title="Cerrar" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* MessageList va como hijo DIRECTO de la columna flex: su raíz ya es
          `flex-1 relative overflow-hidden` y su scroller es `absolute inset-0`.
          Envolverlo en un div que no fuera flex le dejaba altura 0 y la ventana
          salía vacía aunque los mensajes estuvieran cargados. Igual que ChatView. */}
      <MessageList
        messages={messages}
        profiles={profiles}
        chatType={conversation.type}
        currentUserId={user?.id}
        searchQuery=""
        loading={loading}
        onReply={setReplyTo}
        onCopy={(c) => navigator.clipboard?.writeText(c)}
        onEdit={editMessage}
        onDelete={deleteMessage}
        onRetry={retryMessage}
        getReactionsForMessage={getReactionsForMessage}
        onToggleReaction={toggleReaction}
        getReadByUsers={getReadBy}
        getDeliveredByUsers={getDeliveredBy}
        totalParticipants={conversation.participants.length}
        // Los hilos son de la pantalla grande: en 336px no entra el panel.
        onOpenThread={() => navigate(`/messenger?c=${conversation.id}`)}
        getThreadCount={() => 0}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadOlderMessages}
      />

      <div className="shrink-0 border-t border-border/60">
        <MessageInput
          conversationId={conversation.id}
          onSendMessage={sendMessage}
          onSendTyping={sendTyping}
          replyTo={replyTo}
          profiles={profiles}
          onCancelReply={() => setReplyTo(null)}
          participants={conversation.participants}
          chatType={conversation.type}
        />
      </div>
    </div>
  );
}
