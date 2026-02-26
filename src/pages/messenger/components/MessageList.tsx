import { useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { ChatMessage, UserProfile } from "../types";
import { ReactionGroup } from "@/hooks/useReactions";
import MessageBubble from "./MessageBubble";

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
  const diff = Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return diff < 120000;
}

export default function MessageList({
  messages, profiles, chatType, currentUserId, searchQuery,
  loading, onReply, onCopy, onEdit, onDelete,
  getReactionsForMessage, onToggleReaction, getReadByUsers, totalParticipants,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const groups = groupMessages(messages);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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

              return (
                <MessageBubble
                  key={msg.id}
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
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
