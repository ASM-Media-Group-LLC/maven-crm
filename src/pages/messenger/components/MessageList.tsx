import { useRef, useEffect, useCallback } from "react";
import { ChatMessage, UserProfile } from "../types";
import { ReactionGroup } from "@/hooks/useReactions";
import MessageBubble from "./MessageBubble";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface MessageListProps {
  messages: ChatMessage[];
  profiles: Record<string, UserProfile>;
  chatType: string;
  currentUserId?: string;
  searchQuery: string;
  loading: boolean;
  onReply: (msg: ChatMessage) => void;
  onCopy: (content: string) => void;
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  getReactionsForMessage: (messageId: string) => ReactionGroup[];
  onToggleReaction: (messageId: string, emoji: string) => void;
  getReadByUsers: (messageId: string) => string[];
  totalParticipants: number;
  highlightedMsgId?: string | null;
  onOpenThread: (msg: ChatMessage) => void;
  getThreadCount: (messageId: string) => number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return "Hoy";
  if (date.toDateString() === yesterday.toDateString()) return "Ayer";
  return date.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
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

function isSameGroup(a: ChatMessage, b: ChatMessage): boolean {
  if (a.sender_id !== b.sender_id) return false;
  return Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) < 120000;
}

export default function MessageList({
  messages, profiles, chatType, currentUserId, searchQuery,
  loading, onReply, onCopy, onEdit, onDelete,
  getReactionsForMessage, onToggleReaction, getReadByUsers, totalParticipants,
  highlightedMsgId, onOpenThread, getThreadCount,
  hasMore, loadingMore, onLoadMore,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const prevMessagesLengthRef = useRef(0);
  const isInitialLoadRef = useRef(true);

  // Auto-scroll to bottom on new messages (only if near bottom)
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    
    if (isInitialLoadRef.current) {
      // First load: scroll to bottom
      el.scrollTop = el.scrollHeight;
      isInitialLoadRef.current = false;
      prevMessagesLengthRef.current = messages.length;
      return;
    }

    const wasNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    
    if (messages.length > prevMessagesLengthRef.current && wasNearBottom) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages]);

  // Reset on conversation change (use messages reference identity as proxy for conv change)
  const conversationKey = messages.length > 0 ? messages[0]?.conversation_id : null;
  useEffect(() => {
    isInitialLoadRef.current = true;
    prevMessagesLengthRef.current = 0;
  }, [conversationKey]);

  // Scroll to highlighted message
  useEffect(() => {
    if (highlightedMsgId && msgRefs.current[highlightedMsgId]) {
      msgRefs.current[highlightedMsgId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedMsgId]);

  // Preserve scroll position after older messages are prepended
  const prevScrollHeightRef = useRef(0);
  const wasLoadingMoreRef = useRef(false);

  useEffect(() => {
    if (wasLoadingMoreRef.current && !loadingMore && scrollRef.current) {
      const newHeight = scrollRef.current.scrollHeight;
      scrollRef.current.scrollTop = newHeight - prevScrollHeightRef.current;
      wasLoadingMoreRef.current = false;
    }
  }, [messages, loadingMore]);

  // Infinite scroll: load more on scroll to top
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !hasMore || loadingMore || !onLoadMore) return;
    if (scrollRef.current.scrollTop < 80) {
      prevScrollHeightRef.current = scrollRef.current.scrollHeight;
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

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <span className="text-2xl">💬</span>
          </div>
          <p className="text-sm text-muted-foreground">Envía el primer mensaje</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto py-4 px-2 md:px-4 space-y-1">
        {/* Load more indicator */}
        {loadingMore && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {hasMore && !loadingMore && (
          <div className="flex justify-center py-2">
            <button
              onClick={onLoadMore}
              className="text-xs text-primary hover:underline"
            >
              Cargar mensajes anteriores
            </button>
          </div>
        )}

        {groups.map((group, gi) => (
          <div key={gi}>
            <div className="flex justify-center my-4">
              <span className="text-[11px] text-muted-foreground bg-muted/60 backdrop-blur-sm px-3 py-1 rounded-full font-medium select-none">
                {formatDateSeparator(group.date)}
              </span>
            </div>

            {group.messages.map((msg, mi) => {
              const isMe = msg.sender_id === currentUserId;
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
                    isHighlighted && "bg-primary/10 rounded-lg"
                  )}
                >
                  <MessageBubble
                    message={msg}
                    isMe={isMe}
                    chatType={chatType}
                    profiles={profiles}
                    highlight={searchQuery.toLowerCase()}
                    onReply={() => onReply(msg)}
                    onCopy={() => onCopy(msg.content || "")}
                    onEdit={(content) => onEdit(msg.id, content)}
                    onDelete={() => onDelete(msg.id)}
                    replyMessage={msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : undefined}
                    showAvatar={isLastInGroup && !isMe}
                    showSender={isFirstInGroup && !isMe}
                    isLastInGroup={isLastInGroup}
                    reactions={getReactionsForMessage(msg.id)}
                    onToggleReaction={(emoji) => onToggleReaction(msg.id, emoji)}
                    readByUsers={getReadByUsers(msg.id)}
                    totalParticipants={totalParticipants}
                    threadCount={threadCount}
                    onOpenThread={() => onOpenThread(msg)}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
