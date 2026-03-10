import { forwardRef, useState, useMemo } from "react";
import {
  MoreVertical, File, Reply, Copy, Edit2, Trash2, MessageSquareText, Mic, Play,
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
import ImageLightbox from "./ImageLightbox";
import { renderTextWithMentions } from "./MentionAutocomplete";

const MAX_GRID_IMAGES = 9;

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
  threadCount?: number;
  unreadThreadCount?: number;
  onOpenThread?: () => void;
  /** Adjacent image messages in the same group for grid display */
  adjacentImages?: ChatMessage[];
  isGridLeader?: boolean;
  isPartOfGrid?: boolean;
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
  threadCount = 0, unreadThreadCount = 0, onOpenThread,
  adjacentImages, isGridLeader, isPartOfGrid,
}, ref) => {
  const senderName = profiles[message.sender_id]?.full_name || "Usuario";
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState("");
  const [lightboxType, setLightboxType] = useState<"image" | "video">("image");
  const [showAllImages, setShowAllImages] = useState(false);

  // If this message is part of a grid but not the leader, don't render
  if (isPartOfGrid && !isGridLeader) return null;

  const participantNames = useMemo(() => {
    return Object.values(profiles).map(p => p.full_name).filter(Boolean) as string[];
  }, [profiles]);

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
    if (!highlight) {
      // Render mentions
      if (chatType === "group") {
        return renderTextWithMentions(text, participantNames);
      }
      return text;
    }
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

  const isVoiceNote = message.type === "file" && message.file_name?.startsWith("voice-note");
  const audioExtPattern = /\.(webm|ogg|mp3|m4a|wav)(\?|$)/i;
  const isAudioFile = message.file_url && audioExtPattern.test(message.file_url);
  const isImage = message.type === "image" && message.file_url;
  const isVideo = message.file_url && (message.file_url.match(/\.(mp4|webm|mov)(\?|$)/i));

  const openLightbox = (src: string, type: "image" | "video") => {
    setLightboxSrc(src);
    setLightboxType(type);
    setLightboxOpen(true);
  };

  const renderImageGrid = () => {
    if (!adjacentImages || adjacentImages.length <= 1) {
      // Single image
      return (
        <div>
          <img
            src={message.file_url!}
            alt={message.file_name || "image"}
            className="rounded-lg max-w-full max-h-60 object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => openLightbox(message.file_url!, "image")}
          />
          {message.content && message.content !== message.file_name && (
            <p className="text-[13px] mt-1.5 leading-relaxed">{highlightText(message.content)}</p>
          )}
        </div>
      );
    }

    // Grid display
    const images = adjacentImages;
    const displayImages = showAllImages ? images : images.slice(0, MAX_GRID_IMAGES);
    const remaining = images.length - MAX_GRID_IMAGES;
    const count = displayImages.length;

    // Dynamic grid classes
    const gridClass = count === 1
      ? "grid-cols-1"
      : count === 2
        ? "grid-cols-2"
        : count <= 4
          ? "grid-cols-2"
          : count <= 6
            ? "grid-cols-3"
            : "grid-cols-3";

    return (
      <div>
        <div className={cn("grid gap-1", gridClass)}>
          {displayImages.map((img, i) => {
            const isLast = i === displayImages.length - 1 && remaining > 0 && !showAllImages;
            return (
              <div
                key={img.id}
                className="relative cursor-pointer overflow-hidden rounded-lg aspect-square"
                onClick={() => {
                  if (isLast) {
                    setShowAllImages(true);
                  } else {
                    openLightbox(img.file_url!, "image");
                  }
                }}
              >
                <img
                  src={img.file_url!}
                  alt={img.file_name || "image"}
                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                />
                {isLast && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span className="text-white text-xl font-bold">+{remaining}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {message.content && message.content !== message.file_name && (
          <p className="text-[13px] mt-1.5 leading-relaxed">{highlightText(message.content)}</p>
        )}
      </div>
    );
  };

  const renderContent = () => {
    if (isImage) {
      return renderImageGrid();
    }

    if (isVideo) {
      return (
        <div>
          <div
            className="relative rounded-lg overflow-hidden cursor-pointer group/video max-w-full max-h-60"
            onClick={() => openLightbox(message.file_url!, "video")}
          >
            <video
              src={message.file_url!}
              className="rounded-lg max-w-full max-h-60 object-cover"
              preload="metadata"
              muted
            />
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-100 group-hover/video:bg-black/50 transition-colors">
              <div className="h-12 w-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                <Play className="h-6 w-6 text-foreground ml-0.5" />
              </div>
            </div>
          </div>
          {message.content && message.content !== message.file_name && (
            <p className="text-[13px] mt-1.5 leading-relaxed">{highlightText(message.content)}</p>
          )}
        </div>
      );
    }

    if (isVoiceNote || (message.type === "file" && isAudioFile)) {
      return (
        <div className="flex items-center gap-2 min-w-[200px]">
          <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0", isMe ? "bg-primary-foreground/15" : "bg-primary/10")}>
            <Mic className="h-4 w-4" />
          </div>
          <audio src={message.file_url!} controls className="h-8 flex-1" preload="metadata" />
        </div>
      );
    }

    if (message.type === "file") {
      const ext = message.file_name?.split(".").pop()?.toLowerCase() || "";
      return (
        <a href={message.file_url || "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
          <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", isMe ? "bg-primary-foreground/15" : "bg-muted")}>
            <File className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <span className="text-[13px] truncate block">{message.file_name || "Archivo"}</span>
            {ext && <span className="text-[10px] text-muted-foreground uppercase">{ext}</span>}
          </div>
        </a>
      );
    }

    return (
      <p className="text-[13px] whitespace-pre-wrap break-words leading-relaxed">
        {highlightText(message.content || "")}
      </p>
    );
  };

  return (
    <>
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
          {/* Hover actions */}
          <div className={cn(
            "absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center gap-0.5",
            isMe ? "-left-16" : "-right-16"
          )}>
            <ReactionPicker onSelect={onToggleReaction} className="bg-card shadow-sm border border-border" />
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
                {onOpenThread && (
                  <DropdownMenuItem onClick={onOpenThread}>
                    <MessageSquareText className="h-3.5 w-3.5 mr-2" /> Abrir hilo
                  </DropdownMenuItem>
                )}
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

            {renderContent()}

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

          <ReactionsDisplay reactions={reactions} profiles={profiles} isMe={isMe} onToggle={onToggleReaction} />

          {threadCount > 0 && (
            <button
              onClick={onOpenThread}
              className={cn("flex items-center gap-1 mt-1 text-xs text-primary hover:underline", isMe ? "justify-end" : "justify-start")}
            >
              <MessageSquareText className="h-3 w-3" />
              <span>{threadCount} {threadCount === 1 ? "respuesta" : "respuestas"}</span>
              {unreadThreadCount > 0 && (
                <span className="ml-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  {unreadThreadCount}
                </span>
              )}
            </button>
          )}
        </div>

        {isMe && <div className="w-0 shrink-0" />}
      </div>

      {/* Lightbox for images and videos */}
      <ImageLightbox
        src={lightboxSrc}
        alt={message.file_name || "media"}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        type={lightboxType}
      />
    </>
  );
});

MessageBubble.displayName = "MessageBubble";
export default MessageBubble;
