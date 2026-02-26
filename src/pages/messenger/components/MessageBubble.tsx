import { forwardRef } from "react";
import {
  MoreVertical, File, Reply, Copy, Edit2, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChatMessage, UserProfile } from "../types";
import { ReactionGroup } from "@/hooks/useReactions";
import { cn } from "@/lib/utils";
import ReactionPicker from "./ReactionPicker";
import ReactionsDisplay from "./ReactionsDisplay";
import ReadReceiptIndicator from "./ReadReceiptIndicator";

interface MessageBubbleProps {
  message: ChatMessage;
  isMe: boolean;
  chatType: string;
  profiles: Record<string, UserProfile>;
  highlight: string;
  onReply: () => void;
  onCopy: () => void;
  onEdit: (content: string) => void;
  onDelete: () => void;
  replyMessage?: ChatMessage;
  showAvatar: boolean;
  showSender: boolean;
  isLastInGroup: boolean;
  reactions: ReactionGroup[];
  onToggleReaction: (emoji: string) => void;
  readByUsers: string[];
  totalParticipants: number;
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function formatMsgTime(d: string) {
  return new Date(d).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

const MessageBubble = forwardRef<HTMLDivElement, MessageBubbleProps>(({
  message, isMe, chatType, profiles, highlight, onReply, onCopy, onEdit, onDelete,
  replyMessage, showAvatar, showSender, isLastInGroup,
  reactions, onToggleReaction, readByUsers, totalParticipants,
}, ref) => {
  const senderName = profiles[message.sender_id]?.full_name || "Usuario";

  if (message.is_deleted) {
    return (
      <div ref={ref} className={cn("flex items-end gap-2", isMe ? "justify-end" : "justify-start", "px-1")}>
        {!isMe && <div className="w-8 shrink-0" />}
        <div className="max-w-[70%] rounded-xl px-3 py-1.5 bg-muted/40">
          <p className="text-xs text-muted-foreground italic">Mensaje eliminado</p>
        </div>
      </div>
    );
  }

  const highlightText = (text: string) => {
    if (!highlight) return text;
    const idx = text.toLowerCase().indexOf(highlight);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-warning/30 text-foreground rounded px-0.5">{text.slice(idx, idx + highlight.length)}</mark>
        {text.slice(idx + highlight.length)}
      </>
    );
  };

  const bubbleRadius = isMe
    ? cn("rounded-2xl rounded-tr-lg", isLastInGroup ? "rounded-br-md" : "rounded-br-2xl")
    : cn("rounded-2xl rounded-tl-lg", isLastInGroup ? "rounded-bl-md" : "rounded-bl-2xl");

  return (
    <div
      ref={ref}
      className={cn(
        "flex items-end gap-2 group px-1",
        isMe ? "justify-end" : "justify-start",
        isLastInGroup ? "mb-2" : "mb-0.5"
      )}
    >
      {!isMe && (
        <div className="w-8 shrink-0 flex justify-center">
          {showAvatar ? (
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                {getInitials(senderName)}
              </AvatarFallback>
            </Avatar>
          ) : null}
        </div>
      )}

      <div className={cn("relative max-w-[70%]", isMe ? "order-first" : "")}>
        {/* Hover actions: reaction picker + context menu */}
        <div className={cn(
          "absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center gap-0.5",
          isMe ? "-left-16" : "-right-16"
        )}>
          <ReactionPicker
            onSelect={onToggleReaction}
            className="bg-card shadow-sm border border-border"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full bg-card shadow-sm border border-border">
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isMe ? "end" : "start"} className="min-w-[140px]">
              <DropdownMenuItem onClick={onReply}>
                <Reply className="h-3.5 w-3.5 mr-2" /> Responder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCopy}>
                <Copy className="h-3.5 w-3.5 mr-2" /> Copiar
              </DropdownMenuItem>
              {isMe && (
                <>
                  <DropdownMenuItem onClick={() => {
                    const newContent = prompt("Editar mensaje:", message.content || "");
                    if (newContent && newContent !== message.content) onEdit(newContent);
                  }}>
                    <Edit2 className="h-3.5 w-3.5 mr-2" /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Eliminar
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className={cn(
          "px-3 py-2 shadow-sm",
          bubbleRadius,
          isMe ? "bg-primary text-primary-foreground" : "bg-card border border-border"
        )}>
          {replyMessage && (
            <div className={cn(
              "text-[11px] mb-1.5 px-2 py-1 rounded-lg border-l-2",
              isMe ? "bg-primary-foreground/10 border-primary-foreground/40" : "bg-muted/50 border-primary/40"
            )}>
              <p className="font-semibold opacity-80">{profiles[replyMessage.sender_id]?.full_name || "Usuario"}</p>
              <p className="truncate opacity-70">{replyMessage.content}</p>
            </div>
          )}

          {chatType === "group" && !isMe && showSender && (
            <p className="text-[11px] font-semibold text-primary mb-0.5">{senderName}</p>
          )}

          {message.type === "image" && message.file_url ? (
            <div>
              <img src={message.file_url} alt={message.file_name || "image"} className="rounded-lg max-w-full max-h-60 object-cover cursor-pointer hover:opacity-90 transition-opacity" />
              {message.content && message.content !== message.file_name && (
                <p className="text-[13px] mt-1.5 leading-relaxed">{highlightText(message.content)}</p>
              )}
            </div>
          ) : message.type === "file" ? (
            <a href={message.file_url || "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
              <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", isMe ? "bg-primary-foreground/15" : "bg-muted")}>
                <File className="h-4 w-4" />
              </div>
              <span className="text-[13px] truncate">{message.file_name || "Archivo"}</span>
            </a>
          ) : (
            <p className="text-[13px] whitespace-pre-wrap break-words leading-relaxed">
              {highlightText(message.content || "")}
            </p>
          )}

          <div className="flex items-center gap-1 mt-1 justify-end">
            {message.is_edited && (
              <span className={cn("text-[10px]", isMe ? "text-primary-foreground/50" : "text-muted-foreground")}>editado</span>
            )}
            <span className={cn("text-[10px]", isMe ? "text-primary-foreground/60" : "text-muted-foreground")}>
              {formatMsgTime(message.created_at)}
            </span>
            <ReadReceiptIndicator
              isMe={isMe}
              readByUsers={readByUsers}
              profiles={profiles}
              totalParticipants={totalParticipants}
            />
          </div>
        </div>

        {/* Reactions below bubble */}
        <ReactionsDisplay
          reactions={reactions}
          profiles={profiles}
          isMe={isMe}
          onToggle={onToggleReaction}
        />
      </div>

      {isMe && <div className="w-0 shrink-0" />}
    </div>
  );
});

MessageBubble.displayName = "MessageBubble";
export default MessageBubble;
