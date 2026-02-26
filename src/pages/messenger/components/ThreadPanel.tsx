import { useState, useRef, useEffect } from "react";
import { X, MessageSquareText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage, UserProfile } from "../types";
import { cn } from "@/lib/utils";

interface ThreadPanelProps {
  parentMessage: ChatMessage;
  replies: ChatMessage[];
  profiles: Record<string, UserProfile>;
  currentUserId?: string;
  onSendReply: (content: string) => void;
  onClose: () => void;
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function formatTime(d: string) {
  return new Date(d).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(d: string) {
  const date = new Date(d);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Hoy";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Ayer";
  return date.toLocaleDateString("es", { day: "numeric", month: "short" });
}

export default function ThreadPanel({
  parentMessage, replies, profiles, currentUserId, onSendReply, onClose,
}: ThreadPanelProps) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [replies.length]);

  const handleSend = () => {
    if (!text.trim()) return;
    onSendReply(text.trim());
    setText("");
  };

  const parentSender = profiles[parentMessage.sender_id]?.full_name || "Usuario";

  return (
    <div className="w-full md:w-[380px] shrink-0 border-l border-border bg-card flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <MessageSquareText className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold flex-1">Hilo</h3>
        <span className="text-xs text-muted-foreground">{replies.length} {replies.length === 1 ? "respuesta" : "respuestas"}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Parent message */}
      <div className="px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex items-start gap-2">
          <Avatar className="h-7 w-7 shrink-0 mt-0.5">
            <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
              {getInitials(parentSender)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-foreground">{parentSender}</span>
              <span className="text-[10px] text-muted-foreground">{formatDate(parentMessage.created_at)} {formatTime(parentMessage.created_at)}</span>
            </div>
            <p className="text-sm text-foreground/90 mt-0.5 whitespace-pre-wrap break-words">
              {parentMessage.content}
            </p>
          </div>
        </div>
      </div>

      {/* Replies */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {replies.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-muted-foreground">Sin respuestas aún</p>
          </div>
        ) : (
          <div className="py-2 space-y-0.5">
            {replies.map(msg => {
              const isMe = msg.sender_id === currentUserId;
              const sender = profiles[msg.sender_id]?.full_name || "Usuario";
              return (
                <div key={msg.id} className="px-4 py-2 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-2">
                    <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                      <AvatarFallback className={cn(
                        "text-[9px] font-semibold",
                        isMe ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                      )}>
                        {getInitials(sender)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold text-foreground">{isMe ? "Tú" : sender}</span>
                        <span className="text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
                      </div>
                      <p className="text-[13px] text-foreground/90 mt-0.5 whitespace-pre-wrap break-words">
                        {msg.is_deleted ? (
                          <span className="italic text-muted-foreground">Mensaje eliminado</span>
                        ) : msg.content}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reply input */}
      <div className="shrink-0 border-t border-border px-3 py-2.5">
        <div className="flex items-end gap-1.5">
          <Textarea
            placeholder="Responder en hilo..."
            className="min-h-[36px] max-h-[80px] resize-none bg-muted/40 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 rounded-xl px-3 py-2 text-sm flex-1"
            rows={1}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <Button
            size="icon"
            className={cn(
              "h-8 w-8 rounded-full shrink-0",
              text.trim() ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground opacity-50"
            )}
            disabled={!text.trim()}
            onClick={handleSend}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
