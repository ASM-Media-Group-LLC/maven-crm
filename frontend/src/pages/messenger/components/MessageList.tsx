import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { ChatMessage, UserProfile } from "../types";
import type { DeletedMessageArchive } from "../useDeletedMessages";
import { ReactionGroup } from "@/hooks/useReactions";
import MessageBubble from "./MessageBubble";
import { GaleriaDelChat, mediaDelChat } from "../galeriaDelChat";
import { cn } from "@/lib/utils";
import { Loader2, ChevronDown } from "lucide-react";
import { agruparEnAlbumes } from "@/lib/albumDeImagenes";
import { useLanguage } from "@/hooks/useLanguage";
import type { Language } from "@/lib/i18n";
import type { Traductor } from "../preview";
import { isSameGroup } from "../utils";

interface MessageListProps {
  messages: ChatMessage[];
  profiles: Record<string, UserProfile>;
  chatType: string;
  currentUserId?: string;
  searchQuery: string;
  loading: boolean;
  onReply: (msg: ChatMessage) => void;
  /** Llevar la vista a un mensaje (el clic en una cita). */
  onIrAlMensaje?: (messageId: string) => void;
  onOpenProfile?: (userId: string) => void;
  deletedArchive?: Record<string, DeletedMessageArchive>;
  onCopy: (content: string) => void;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onRetry?: (id: string) => void;
  getReactionsForMessage: (messageId: string) => ReactionGroup[];
  onToggleReaction: (messageId: string, emoji: string) => void;
  getReadByUsers: (messageId: string) => string[];
  getDeliveredByUsers: (messageId: string) => string[];
  totalParticipants: number;
  /** Fondo del hilo. Lo usa la ventanita del muelle para dejarlo OPACO: el
   *  resto de la ventana es de vidrio, pero texto largo sobre un fondo que
   *  cambia según lo que quede debajo se vuelve ilegible al arrastrarla. */
  className?: string;
  highlightedMsgId?: string | null;
  onOpenThread: (msg: ChatMessage) => void;
  getThreadCount: (messageId: string) => number;
  getUnreadThreadCount?: (messageId: string) => number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

function formatDateSeparator(dateStr: string, t: Traductor, lang: Language): string {
  const date = new Date(dateStr);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return t("common.today");
  if (date.toDateString() === yesterday.toDateString()) return t("messenger.preview.ayer");
  // En español, el "es" de siempre; solo en inglés pasa a en-US.
  return date.toLocaleDateString(lang === "en" ? "en-US" : "es", { day: "numeric", month: "long", year: "numeric" });
}

function groupMessages(messages: ChatMessage[]) {
  const groups: { date: string; messages: ChatMessage[] }[] = [];
  messages.forEach(msg => {
    const dateKey = new Date(msg.created_at).toDateString();
    const last = groups[groups.length - 1];
    if (last && new Date(last.messages[0].created_at).toDateString() === dateKey) {
      last.messages.push(msg);
    } else {
      groups.push({ date: msg.created_at, messages: [msg] });
    }
  });
  return groups;
}

export default function MessageList({
  messages, profiles, chatType, currentUserId, searchQuery,
  loading, onReply, onIrAlMensaje, onOpenProfile, deletedArchive, onCopy, onEdit, onDelete, onRetry,
  getReactionsForMessage, onToggleReaction, getReadByUsers, getDeliveredByUsers, totalParticipants,
  highlightedMsgId, onOpenThread, getThreadCount, getUnreadThreadCount,
  hasMore, loadingMore, onLoadMore, className,
}: MessageListProps) {
  const { t, language } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevMessagesLengthRef = useRef(0);
  const currentConvRef = useRef<string | null>(null);
  // Mientras esté "pegado al fondo", cualquier crecimiento de alto (imágenes que terminan
  // de cargar, reacciones, mensaje nuevo) vuelve a bajar al último mensaje. Se apaga cuando
  // el usuario scrollea hacia arriba y se reactiva cuando vuelve al fondo.
  const pinToBottomRef = useRef(true);
  const prevLastIdRef = useRef<string | null>(null);
  // Botón "↓ N nuevos": visible cuando el usuario está scrolleado hacia arriba; el badge
  // cuenta los mensajes que llegaron mientras no estaba mirando el fondo.
  const [showJump, setShowJump] = useState(false);
  const [newCount, setNewCount] = useState(0);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinToBottomRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setNewCount(0);
    setShowJump(false);
  }, []);

  // Al abrir/cambiar de conversación → al fondo. Con la MISMA conversación, si llega un
  // mensaje nuevo y estabas abajo (o lo mandaste tú), sigue el fondo; si estabas arriba,
  // contalo para el badge.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || messages.length === 0) return;
    const conv = messages[0]?.conversation_id ?? null;
    const lastMsg = messages[messages.length - 1];
    const lastId = lastMsg.id;

    if (conv !== currentConvRef.current) {
      currentConvRef.current = conv;
      pinToBottomRef.current = true;
      el.scrollTop = el.scrollHeight;
      setNewCount(0);
      setShowJump(false);
    } else if (messages.length > prevMessagesLengthRef.current) {
      // Distingue mensaje NUEVO al fondo de históricos prepend-eados arriba (mismo lastId).
      const isNewAtBottom = lastId !== prevLastIdRef.current;
      if (isNewAtBottom && (pinToBottomRef.current || lastMsg.sender_id === currentUserId)) {
        pinToBottomRef.current = true;
        el.scrollTop = el.scrollHeight;
        setNewCount(0);
        setShowJump(false);
      } else if (isNewAtBottom) {
        setNewCount((c) => c + (messages.length - prevMessagesLengthRef.current));
        setShowJump(true);
      }
    }
    prevMessagesLengthRef.current = messages.length;
    prevLastIdRef.current = lastId;
  }, [messages, currentUserId]);

  // ResizeObserver: mientras esté pegado al fondo, mantener el scroll abajo cuando el
  // contenido crece de alto DESPUÉS del render inicial. Las imágenes que cargan async eran
  // la causa de quedar ~140px arriba del último mensaje al abrir la conversación:
  // scrollTop=scrollHeight corría antes de que la imagen tuviera alto, y no se recalculaba.
  const roRef = useRef<ResizeObserver | null>(null);
  const contentRef = useCallback((node: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (node) {
      const ro = new ResizeObserver(() => {
        const el = scrollRef.current;
        if (el && pinToBottomRef.current) el.scrollTop = el.scrollHeight;
      });
      ro.observe(node);
      roRef.current = ro;
    }
  }, []);

  useEffect(() => {
    if (highlightedMsgId && msgRefs.current[highlightedMsgId]) {
      msgRefs.current[highlightedMsgId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedMsgId]);

  const prevScrollHeightRef = useRef(0);
  const wasLoadingMoreRef = useRef(false);

  useEffect(() => {
    if (wasLoadingMoreRef.current && !loadingMore && scrollRef.current) {
      const newHeight = scrollRef.current.scrollHeight;
      scrollRef.current.scrollTop = newHeight - prevScrollHeightRef.current;
      wasLoadingMoreRef.current = false;
    }
  }, [messages, loadingMore]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // ¿el usuario está pegado al fondo? Define si seguimos autoscrolleando.
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    pinToBottomRef.current = atBottom;
    // Botón "↓": visible mientras esté scrolleado arriba; al volver al fondo se limpia.
    if (atBottom) { setNewCount(0); setShowJump(false); }
    else setShowJump(true);
    // Cargar mensajes más viejos al llegar arriba.
    if (hasMore && !loadingMore && onLoadMore && el.scrollTop < 80) {
      prevScrollHeightRef.current = el.scrollHeight;
      wasLoadingMoreRef.current = true;
      onLoadMore();
    }
  }, [hasMore, loadingMore, onLoadMore]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const groups = groupMessages(messages);

  // Índice id→mensaje para resolver la cita (reply_to_id) en O(1). Antes se hacía
  // messages.find(...) por CADA burbuja → O(n²) dentro del render de la lista.
  const msgById = useMemo(() => {
    const m = new Map<string, ChatMessage>();
    for (const x of messages) m.set(x.id, x);
    return m;
  }, [messages]);

  // Las fotos y videos del chat, en orden, para las flechas del visor. Memo:
  // es el valor de un contexto, y uno nuevo por render repintaría TODAS las
  // burbujas (que son memo) cada vez.
  const galeria = useMemo(() => mediaDelChat(messages), [messages]);

  if (messages.length === 0) {
    return (
      // El mismo fondo (y el mismo className del que llama) que con mensajes:
      // el hilo vacío de la ventanita no puede verse distinto al lleno.
      <div className={cn("fondo-de-chat flex-1 flex items-center justify-center", className)}>
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-3xl bg-primary/8 flex items-center justify-center mx-auto">
            <span className="text-2xl">💬</span>
          </div>
          <p className="text-sm text-muted-foreground">{t("messenger.list.primerMensaje")}</p>
        </div>
      </div>
    );
  }

  return (
    <GaleriaDelChat.Provider value={galeria}>
    {/* `fondo-de-chat`: resplandor + papel tapiz detrás del scroller (index.css). */}
    <div className={cn("fondo-de-chat flex-1 relative overflow-hidden", className)}>
    <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden">
      <div ref={contentRef} className="w-full py-4 px-3 md:px-6 space-y-1">
        {loadingMore && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {hasMore && !loadingMore && (
          <div className="flex justify-center py-2">
            <button
              onClick={onLoadMore}
              className="text-xs text-primary hover:bg-primary/8 rounded-full px-4 py-1.5 transition-colors"
            >
              {t("messenger.list.cargarAnteriores")}
            </button>
          </div>
        )}

        {groups.map((group, gi) => (
          <div key={gi}>
            <div className="flex justify-center my-4">
              <span className="text-[11px] text-muted-foreground bg-primary/8 px-4 py-1 rounded-full font-medium select-none">
                {formatDateSeparator(group.date, t, language)}
              </span>
            </div>

            {(() => {
              // El agrupado en álbumes vive en `lib/albumDeImagenes`, con su
              // propia batería de tests: acá adentro era imposible de probar, y
              // la regla tiene bordes (comentarios, remitente, ventana de
              // tiempo) que conviene fijar. `imageGroups` se escribía y no se
              // leía nunca; se fue con la extracción.
              const { lideres: msgGridLeader, partes: msgGridPart, imagenes: msgGridImages } =
                agruparEnAlbumes(group.messages);

              return group.messages.map((msg, mi) => {
                const isMe = msg.sender_id === currentUserId;
                // Un mensaje por API lleva su nombre («BLU») también si es mío o
                // es un directo: si no, quien tiene la key lo vería como suyo.
                const esApi = msg.api_key_id != null;
                const prevMsg = mi > 0 ? group.messages[mi - 1] : null;
                const nextMsg = mi < group.messages.length - 1 ? group.messages[mi + 1] : null;
                const isFirstInGroup = !prevMsg || !isSameGroup(prevMsg, msg);
                const isLastInGroup = !nextMsg || !isSameGroup(msg, nextMsg);
                const isHighlighted = highlightedMsgId === msg.id;
                const threadCount = getThreadCount(msg.id);

                return (
                  <div
                    key={msg.id}
                    ref={el => { msgRefs.current[msg.id] = el; }}
                    className={cn(
                      "transition-colors duration-700",
                      isHighlighted && "bg-primary/10 rounded-2xl"
                    )}
                  >
                    <MessageBubble
                      message={msg}
                      isMe={isMe}
                      chatType={chatType}
                      profiles={profiles}
                      highlight={searchQuery.toLowerCase()}
                      onReply={() => onReply(msg)}
                      onOpenProfile={onOpenProfile}
                      deletedArchive={deletedArchive?.[msg.id]}
                      onCopy={() => onCopy(msg.content || "")}
                      onEdit={(content) => onEdit(msg.id, content)}
                      onDelete={() => onDelete(msg.id)}
                      onRetry={onRetry ? () => onRetry(msg.id) : undefined}
                      replyMessage={msg.reply_to_id ? msgById.get(msg.reply_to_id) : undefined}
                      onIrALaCita={msg.reply_to_id && onIrAlMensaje ? () => onIrAlMensaje(msg.reply_to_id!) : undefined}
                      showAvatar={isLastInGroup && !isMe}
                      showSender={isFirstInGroup && (!isMe || esApi)}
                      isLastInGroup={isLastInGroup}
                      reactions={getReactionsForMessage(msg.id)}
                      onToggleReaction={(emoji) => onToggleReaction(msg.id, emoji)}
                      readByUsers={getReadByUsers(msg.id)}
                      deliveredByUsers={getDeliveredByUsers(msg.id)}
                      totalParticipants={totalParticipants}
                      threadCount={threadCount}
                      unreadThreadCount={getUnreadThreadCount?.(msg.id) ?? 0}
                      onOpenThread={() => onOpenThread(msg)}
                      adjacentImages={msgGridImages.get(msg.id)}
                      isGridLeader={msgGridLeader.has(msg.id)}
                      isPartOfGrid={msgGridPart.has(msg.id)}
                    />
                  </div>
                );
              });
            })()}
          </div>
        ))}
      </div>
    </div>

      {showJump && (
        <button
          onClick={scrollToBottom}
          aria-label={t("messenger.list.irAlUltimo")}
          className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-full bg-card shadow-lg border border-border/60 pl-3 pr-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors animate-fade-in"
        >
          {newCount > 0 && (
            <span className="text-primary">{newCount === 1 ? t("messenger.list.unNuevo") : t("messenger.list.nuevos", { n: newCount })}</span>
          )}
          <ChevronDown className="h-4 w-4 text-primary" />
        </button>
      )}
    </div>
    </GaleriaDelChat.Provider>
  );
}
