import { forwardRef, useState, useMemo, memo } from "react";
import {
  MoreVertical, File, Reply, Copy, Edit2, Trash2, MessageSquareText, Mic, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChatMessage, UserProfile } from "../types";
import { profileName, safeFileUrl } from "../utils";
import { ReactionGroup } from "@/hooks/useReactions";
import { cn } from "@/lib/utils";
import ReactionPicker from "./ReactionPicker";
import ReactionsDisplay from "./ReactionsDisplay";
import ReadReceiptIndicator from "./ReadReceiptIndicator";
import ImageLightbox from "./ImageLightbox";
import { renderTextWithMentions } from "./MentionAutocomplete";
import { formatTime as formatMsgTime } from "../utils";

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
  deliveredByUsers: string[];
  totalParticipants: number;
  threadCount?: number;
  unreadThreadCount?: number;
  onOpenThread?: () => void;
  adjacentImages?: ChatMessage[];
  isGridLeader?: boolean;
  isPartOfGrid?: boolean;
}

const MessageBubble = forwardRef<HTMLDivElement, MessageBubbleProps>(({
  message, isMe, chatType, profiles, highlight, onReply, onCopy, onEdit, onDelete,
  replyMessage, showAvatar, showSender, isLastInGroup,
  reactions, onToggleReaction, readByUsers, deliveredByUsers, totalParticipants,
  threadCount = 0, unreadThreadCount = 0, onOpenThread,
  adjacentImages, isGridLeader, isPartOfGrid,
}, ref) => {
  const senderName = profileName(profiles[message.sender_id]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState("");
  const [lightboxType, setLightboxType] = useState<"image" | "video">("image");
  const [showAllImages, setShowAllImages] = useState(false);

  const participantNames = useMemo(() => {
    return Object.values(profiles).map(p => p.full_name).filter(Boolean) as string[];
  }, [profiles]);

  if (isPartOfGrid && !isGridLeader) return null;

  if (message.is_deleted) {
    return (
      <div ref={ref} className={cn("flex items-end gap-2", isMe ? "justify-end" : "justify-start", "px-1")}>
        {!isMe && <div className="w-8 shrink-0" />}
        <div className="max-w-[70%] rounded-3xl px-3 py-1.5 bg-primary/5">
          <p className="text-xs text-muted-foreground italic">Mensaje eliminado</p>
        </div>
      </div>
    );
  }

  const linkifyText = (text: string): React.ReactNode[] => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) =>
      urlRegex.test(part) ? (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 break-all">
          {part}
        </a>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  const highlightText = (text: string) => {
    if (!highlight) {
      if (chatType === "group") {
        return renderTextWithMentions(text, participantNames);
      }
      return linkifyText(text);
    }
    const idx = text.toLowerCase().indexOf(highlight);
    if (idx === -1) return linkifyText(text);
    return (
      <>
        {linkifyText(text.slice(0, idx))}
        <mark className="bg-warning/30 text-foreground rounded px-0.5">{text.slice(idx, idx + highlight.length)}</mark>
        {linkifyText(text.slice(idx + highlight.length))}
      </>
    );
  };

  const bubbleRadius = isMe
    ? cn("rounded-3xl rounded-tr-xl", isLastInGroup ? "rounded-br-md" : "rounded-br-3xl")
    : cn("rounded-3xl rounded-tl-xl", isLastInGroup ? "rounded-bl-md" : "rounded-bl-3xl");

  const isVoiceNote = message.type === "file" && message.file_name?.startsWith("voice-note");
  const audioExtPattern = /\.(webm|ogg|mp3|m4a|wav)(\?|$)/i;
  const isAudioFile = message.file_url && audioExtPattern.test(message.file_url);
  const isImage = message.type === "image" && message.file_url;
  // GIF: Giphy los manda como .mp4 con file_name "gif.mp4". Se muestran en chico y
  // reproduciéndose SOLOS (autoplay+loop+muted), como en WhatsApp — no como video con
  // botón de play (que obligaba a hacer zoom para verlo animado).
  const isGif = !!message.file_url && (
    /\.gif(\?|$)/i.test(message.file_url) ||
    (message.file_name || "").toLowerCase().startsWith("gif") ||
    /(giphy|tenor)\.com/i.test(message.file_url)
  );
  // OJO: los .webm de nota de voz y los gifs .mp4 también matchean este regex →
  // excluirlos para que NO se dibujen como player de video con botón de play.
  const isVideo = !isVoiceNote && !isAudioFile && !isGif && message.file_url && (message.file_url.match(/\.(mp4|webm|mov)(\?|$)/i));

  const openLightbox = (src: string, type: "image" | "video") => {
    setLightboxSrc(src);
    setLightboxType(type);
    setLightboxOpen(true);
  };

  const renderImageGrid = () => {
    if (!adjacentImages || adjacentImages.length <= 1) {
      return (
        <div>
          <img
            src={message.file_url!}
            alt={message.file_name || "image"}
            className="rounded-2xl max-w-full max-h-60 object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => openLightbox(message.file_url!, "image")}
          />
          {message.content && message.content !== message.file_name && (
            <p className="text-[13px] mt-1.5 leading-relaxed">{highlightText(message.content)}</p>
          )}
        </div>
      );
    }

    const images = adjacentImages;
    const displayImages = showAllImages ? images : images.slice(0, MAX_GRID_IMAGES);
    const remaining = images.length - MAX_GRID_IMAGES;
    const count = displayImages.length;

    const gridClass = count === 1
      ? "grid-cols-1"
      : count === 2
        ? "grid-cols-2"
        : count <= 4
          ? "grid-cols-2"
          : "grid-cols-3";

    return (
      <div>
        <div className={cn("grid gap-1", gridClass)}>
          {displayImages.map((img, i) => {
            const isLast = i === displayImages.length - 1 && remaining > 0 && !showAllImages;
            return (
              <div
                key={img.id}
                className="relative cursor-pointer overflow-hidden rounded-2xl aspect-square"
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

    if (isGif) {
      const gifIsImg = /\.gif(\?|$)/i.test(message.file_url!);
      return gifIsImg ? (
        <img
          src={message.file_url!}
          alt="GIF"
          className="rounded-2xl max-w-full max-h-52 object-contain cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => openLightbox(message.file_url!, "image")}
        />
      ) : (
        <video
          src={message.file_url!}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="rounded-2xl max-w-full max-h-52 object-contain cursor-pointer"
          onClick={() => openLightbox(message.file_url!, "video")}
          onContextMenu={(e) => e.preventDefault()}
        />
      );
    }

    if (isVideo) {
      return (
        <div>
          <div
            className="relative rounded-2xl overflow-hidden cursor-pointer group/video max-w-full max-h-60"
            onClick={() => openLightbox(message.file_url!, "video")}
          >
            <video
              src={message.file_url!}
              className="rounded-2xl max-w-full max-h-60 object-cover"
              preload="metadata"
              muted
              controlsList="nodownload noremoteplayback"
              disablePictureInPicture
              onContextMenu={(e) => e.preventDefault()}
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
        <a href={safeFileUrl(message.file_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
          <div className={cn("h-8 w-8 rounded-2xl flex items-center justify-center shrink-0", isMe ? "bg-primary-foreground/15" : "bg-primary/8")}>
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
              <UserAvatar
                name={senderName}
                src={profiles[message.sender_id]?.avatar_url}
                seed={profiles[message.sender_id]?.avatar_seed}
                size="sm"
                className="h-7 w-7"
              />
            ) : null}
          </div>
        )}

        <div className={cn("relative max-w-[70%]", isMe ? "order-first" : "")}>
          {/* Hover actions — M3 tonal */}
          {/* En touch (hover:none) las acciones quedan SIEMPRE visibles; en mouse se
              revelan al hover como antes. Sin esto, en la PWA del celular responder/
              reaccionar/editar/eliminar eran inalcanzables. */}
          <div className={cn(
            "absolute top-0 transition-opacity z-10 flex items-center gap-0.5",
            "opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100",
            isMe ? "-left-16" : "-right-16"
          )}>
            <ReactionPicker onSelect={onToggleReaction} className="bg-primary/10 border-0 rounded-full shadow-none" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full bg-primary/10 border-0 shadow-none hover:bg-primary/15">
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isMe ? "end" : "start"} className="min-w-[140px] rounded-2xl">
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
            "relative px-3.5 py-2",
            bubbleRadius,
            reactions.length > 0 && "mb-3",
            isMe ? "bg-gradient-to-br from-accent to-primary text-white shadow-sm" : "bg-muted"
          )}>
            {replyMessage && (
              <div className={cn(
                "text-[11px] mb-1.5 px-2.5 py-1.5 rounded-xl",
                isMe ? "bg-primary-foreground/10" : "bg-background/60"
              )}>
                <p className="font-semibold opacity-80">{profileName(profiles[replyMessage.sender_id])}</p>
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
                deliveredByUsers={deliveredByUsers}
                readByUsers={readByUsers}
                profiles={profiles}
                totalParticipants={totalParticipants}
              />
            </div>
            <ReactionsDisplay reactions={reactions} profiles={profiles} isMe={isMe} onToggle={onToggleReaction} />
          </div>

          {threadCount > 0 && (
            <button
              onClick={onOpenThread}
              className={cn(
                "flex items-center gap-1.5 mt-1 text-xs text-primary hover:bg-primary/8 rounded-full px-3 py-1 transition-colors",
                isMe ? "justify-end ml-auto" : "justify-start"
              )}
            >
              <MessageSquareText className="h-3 w-3" />
              <span>{threadCount} {threadCount === 1 ? "respuesta" : "respuestas"}</span>
              {unreadThreadCount > 0 && (
                <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  {unreadThreadCount}
                </span>
              )}
            </button>
          )}
        </div>

        {isMe && <div className="w-0 shrink-0" />}
      </div>

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

const MemoizedMessageBubble = memo(MessageBubble, (prev, next) => {
  return (
    prev.message === next.message &&
    prev.isMe === next.isMe &&
    prev.highlight === next.highlight &&
    prev.showAvatar === next.showAvatar &&
    prev.showSender === next.showSender &&
    prev.isLastInGroup === next.isLastInGroup &&
    prev.reactions === next.reactions &&
    prev.readByUsers === next.readByUsers &&
    prev.deliveredByUsers === next.deliveredByUsers &&
    prev.threadCount === next.threadCount &&
    prev.unreadThreadCount === next.unreadThreadCount &&
    prev.replyMessage === next.replyMessage &&
    prev.adjacentImages === next.adjacentImages &&
    prev.isGridLeader === next.isGridLeader &&
    prev.isPartOfGrid === next.isPartOfGrid
  );
});

export default MemoizedMessageBubble;
