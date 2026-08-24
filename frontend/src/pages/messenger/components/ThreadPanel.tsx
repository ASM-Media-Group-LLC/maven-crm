import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  X, MessageSquareText, Send, MoreVertical, Copy, Edit2, Trash2,
  SmilePlus, Smile, Paperclip, Loader2, File, Mic, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/UserAvatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChatMessage, UserProfile } from "../types";
import { ReactionGroup } from "@/hooks/useReactions";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import MentionAutocomplete, { renderTextWithMentions } from "./MentionAutocomplete";
import ReactionPicker from "./ReactionPicker";
import ReactionsDisplay from "./ReactionsDisplay";
import ReadReceiptIndicator from "./ReadReceiptIndicator";
import ImageLightbox from "./ImageLightbox";
import VoiceNoteRecorder from "./VoiceNoteRecorder";
import { formatTime, formatDate, safeFileUrl } from "../utils";

import { EMOJIS, MAX_FILE_SIZE_MB, MAX_FILE_SIZE_BYTES, formatFileSize, uploadFileWithTUS } from "../uploadUtils";

interface ThreadPanelProps {
  parentMessage: ChatMessage;
  replies: ChatMessage[];
  profiles: Record<string, UserProfile>;
  currentUserId?: string;
  onSendReply: (content: string, type?: ChatMessage["type"], fileUrl?: string, fileName?: string) => void;
  onClose: () => void;
  participants?: { user_id: string; profile?: UserProfile }[];
  onEditMessage: (id: string, content: string) => void;
  onDeleteMessage: (id: string) => void;
  getReactionsForMessage: (messageId: string) => ReactionGroup[];
  onToggleReaction: (messageId: string, emoji: string) => void;
  getReadByUsers: (messageId: string) => string[];
  getDeliveredByUsers: (messageId: string) => string[];
  totalParticipants: number;
}

export default function ThreadPanel({
  parentMessage, replies, profiles, currentUserId, onSendReply, onClose, participants,
  onEditMessage, onDeleteMessage, getReactionsForMessage, onToggleReaction,
  getReadByUsers, getDeliveredByUsers, totalParticipants,
}: ThreadPanelProps) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState("");
  const [lightboxType, setLightboxType] = useState<"image" | "video">("image");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [replies.length]);

  const participantNames = useMemo(() =>
    (participants || []).map(p => p.profile?.full_name).filter(Boolean) as string[],
    [participants]
  );

  const parentSender = profiles[parentMessage.sender_id]?.full_name || "Usuario";

  // --- File upload (TUS) ---
  const uploadFileWithProgress = useCallback(async (file: File, path: string): Promise<{ error: string | null }> => {
    return uploadFileWithTUS(file, path, {
      onProgress: setUploadPercent,
      onStatusText: setUploadProgress,
      abortRef,
    });
  }, []);

  const handleFileUploadAndSend = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(`Archivo demasiado grande (máx ${MAX_FILE_SIZE_MB}MB)`);
      return;
    }
    if (!user) return;
    setUploading(true);
    setUploadProgress(`Subiendo: ${file.name} (${formatFileSize(file.size)})`);
    setUploadPercent(0);
    const path = `${user.id}/${Date.now()}-${file.name}`;
    let uploadError: string | null = null;
    if (file.size > 5 * 1024 * 1024) {
      const result = await uploadFileWithProgress(file, path);
      uploadError = result.error;
    } else {
      const { error } = await supabase.storage.from("chat-files").upload(path, file);
      uploadError = error?.message || null;
    }
    if (uploadError === "cancelled") { toast("Subida cancelada"); }
    else if (uploadError) { toast.error(`Error: ${uploadError}`); }
    else {
      const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(path);
      const isImg = file.type.startsWith("image/");
      onSendReply(file.name, isImg ? "image" : "file", urlData.publicUrl, file.name);
    }
    setUploading(false);
    setUploadProgress("");
    setUploadPercent(0);
  }, [user, onSendReply, uploadFileWithProgress]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => handleFileUploadAndSend(f));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleVoiceNoteSend = useCallback(async (blob: Blob, durationSec: number) => {
    if (!user) return;
    setUploading(true);
    const mimeToExt: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3" };
    const ext = mimeToExt[blob.type] || "webm";
    const fileName = `voice-note-${Date.now()}.${ext}`;
    const path = `${user.id}/${fileName}`;
    const { error } = await supabase.storage.from("chat-files").upload(path, blob, { contentType: blob.type });
    if (error) { toast.error("Error al subir nota de voz"); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(path);
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    onSendReply(`🎤 Nota de voz (${mins}:${secs.toString().padStart(2, "0")})`, "file", urlData.publicUrl, fileName);
    setIsRecording(false);
    setUploading(false);
  }, [user, onSendReply]);

  const handleSend = () => {
    if (!text.trim()) return;
    onSendReply(text.trim());
    setText("");
  };

  const handleTextChange = (val: string) => {
    setText(val);
    setCursorPosition(inputRef.current?.selectionStart || val.length);
  };

  const handleMentionSelect = useCallback((newText: string, _userId: string) => {
    setText(newText);
    setCursorPosition(newText.length);
    inputRef.current?.focus();
  }, []);

  const openLightbox = (src: string, type: "image" | "video") => {
    setLightboxSrc(src);
    setLightboxType(type);
    setLightboxOpen(true);
  };

  // --- Render message content (images, video, voice, files, text) ---
  const renderMessageContent = (msg: ChatMessage) => {
    const isVoiceNote = msg.type === "file" && msg.file_name?.startsWith("voice-note");
    const audioExtPattern = /\.(webm|ogg|mp3|m4a|wav)(\?|$)/i;
    const isAudioFile = msg.file_url && audioExtPattern.test(msg.file_url);
    const isImage = msg.type === "image" && msg.file_url;
    const isVideo = msg.file_url && msg.file_url.match(/\.(mp4|webm|mov)(\?|$)/i);

    if (isImage) {
      return (
        <div>
          <img
            src={msg.file_url!}
            alt={msg.file_name || "image"}
            className="rounded-lg max-w-full max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => openLightbox(msg.file_url!, "image")}
          />
          {msg.content && msg.content !== msg.file_name && (
            <p className="text-[13px] mt-1 whitespace-pre-wrap break-words">
              {renderTextWithMentions(msg.content, participantNames)}
            </p>
          )}
        </div>
      );
    }

    if (isVideo) {
      return (
        <div
          className="relative rounded-lg overflow-hidden cursor-pointer group/video max-w-full max-h-48"
          onClick={() => openLightbox(msg.file_url!, "video")}
        >
          <video src={msg.file_url!} className="rounded-lg max-w-full max-h-48 object-cover" preload="metadata" muted />
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover/video:bg-black/50 transition-colors">
            <div className="h-10 w-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <Play className="h-5 w-5 text-foreground ml-0.5" />
            </div>
          </div>
        </div>
      );
    }

    if (isVoiceNote || (msg.type === "file" && isAudioFile)) {
      return (
        <div className="flex items-center gap-2 min-w-[180px]">
          <div className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 bg-primary/10">
            <Mic className="h-3.5 w-3.5" />
          </div>
          <audio src={msg.file_url!} controls className="h-7 flex-1" preload="metadata" />
        </div>
      );
    }

    if (msg.type === "file" && msg.file_url) {
      const ext = msg.file_name?.split(".").pop()?.toLowerCase() || "";
      return (
        <a href={safeFileUrl(msg.file_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 bg-muted">
            <File className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <span className="text-[13px] truncate block">{msg.file_name || "Archivo"}</span>
            {ext && <span className="text-[10px] text-muted-foreground uppercase">{ext}</span>}
          </div>
        </a>
      );
    }

    if (msg.is_deleted) {
      return <span className="italic text-muted-foreground text-[13px]">Mensaje eliminado</span>;
    }

    return (
      <p className="text-[13px] text-foreground/90 whitespace-pre-wrap break-words">
        {renderTextWithMentions(msg.content || "", participantNames)}
      </p>
    );
  };

  // --- Render a single message row (parent or reply) ---
  const renderMessage = (msg: ChatMessage, isParent: boolean = false) => {
    const isMe = msg.sender_id === currentUserId;
    const sender = profiles[msg.sender_id]?.full_name || "Usuario";
    const reactions = getReactionsForMessage(msg.id);
    const readBy = getReadByUsers(msg.id);
    const deliveredBy = getDeliveredByUsers(msg.id);

    return (
      <div
        key={msg.id}
        className={cn(
          "px-4 py-2 group/msg transition-colors",
          isParent ? "bg-muted/20" : "hover:bg-muted/30"
        )}
      >
        <div className="flex items-start gap-2">
          <UserAvatar
            name={sender}
            src={profiles[msg.sender_id]?.avatar_url}
            seed={profiles[msg.sender_id]?.avatar_seed}
            size="xs"
            className={cn("shrink-0 mt-0.5", isParent ? "h-7 w-7" : "h-6 w-6")}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-foreground">{isMe ? "Tú" : sender}</span>
              <span className="text-[10px] text-muted-foreground">
                {isParent ? `${formatDate(msg.created_at)} ${formatTime(msg.created_at)}` : formatTime(msg.created_at)}
              </span>
              {msg.is_edited && <span className="text-[10px] text-muted-foreground">(editado)</span>}

              {/* Hover actions */}
              {!isParent && !msg.is_deleted && (
                <div className="ml-auto opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center gap-0.5">
                  <ReactionPicker
                    onSelect={(emoji) => onToggleReaction(msg.id, emoji)}
                    className="h-5 w-5"
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full">
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[130px]">
                      <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(msg.content || ""); toast.success("Copiado"); }}>
                        <Copy className="h-3.5 w-3.5 mr-2" /> Copiar
                      </DropdownMenuItem>
                      {isMe && (
                        <>
                          <DropdownMenuItem onClick={() => {
                            const newContent = prompt("Editar mensaje:", msg.content || "");
                            if (newContent && newContent !== msg.content) onEditMessage(msg.id, newContent);
                          }}>
                            <Edit2 className="h-3.5 w-3.5 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => onDeleteMessage(msg.id)}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Eliminar
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>

            <div className="mt-0.5">{renderMessageContent(msg)}</div>

            {/* Reactions */}
            {reactions.length > 0 && (
              <ReactionsDisplay
                reactions={reactions}
                profiles={profiles}
                isMe={isMe}
                onToggle={(emoji) => onToggleReaction(msg.id, emoji)}
              />
            )}

            {/* Read receipts for own messages */}
            {isMe && !isParent && (
              <div className="flex justify-end mt-0.5">
                <ReadReceiptIndicator
                  isMe={isMe}
                  deliveredByUsers={deliveredBy}
                  readByUsers={readBy}
                  profiles={profiles}
                  totalParticipants={totalParticipants}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="absolute inset-0 sm:inset-y-0 sm:left-auto sm:right-0 z-30 w-full sm:w-[380px] bg-card sm:rounded-l-3xl sm:shadow-xl flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-primary/[0.03]">
        <MessageSquareText className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold flex-1">Hilo</h3>
        <span className="text-xs text-muted-foreground">{replies.length} {replies.length === 1 ? "respuesta" : "respuestas"}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Parent message */}
      <div className="bg-primary/[0.02]">
        {renderMessage(parentMessage, true)}
      </div>

      {/* Replies */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {replies.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-muted-foreground">Sin respuestas aún</p>
          </div>
        ) : (
          <div className="py-2 space-y-0.5">
            {replies.map(msg => renderMessage(msg))}
          </div>
        )}
      </div>

      {/* Upload progress */}
      {uploading && (
        <div className="px-3 py-2 bg-primary/5">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="text-[11px] text-muted-foreground flex-1 truncate">{uploadProgress}</span>
            <span className="text-[11px] font-medium text-primary">{uploadPercent}%</span>
          </div>
          <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${uploadPercent}%` }} />
          </div>
        </div>
      )}

      {/* Reply input with full controls */}
      <div className="shrink-0 bg-primary/[0.03] px-3 py-2.5">
        <div className="relative flex items-end gap-1.5">
          {/* Emoji picker */}
          {!isRecording && (
            <>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 rounded-full text-muted-foreground hover:text-foreground">
                    <Smile className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-2" side="top" align="start">
                  <div className="grid grid-cols-10 gap-0.5">
                    {EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors text-base"
                        onClick={() => {
                          setText(prev => prev + emoji);
                          inputRef.current?.focus();
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} multiple accept="*/*" />
              <Button
                variant="ghost" size="icon"
                className="shrink-0 h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </Button>
            </>
          )}

          {isRecording ? (
            <VoiceNoteRecorder
              isRecording={isRecording}
              onStartRecording={() => setIsRecording(true)}
              onSend={handleVoiceNoteSend}
              onCancel={() => setIsRecording(false)}
            />
          ) : (
            <>
              <div className="flex-1 relative">
                {participants && participants.length > 0 && (
                  <MentionAutocomplete
                    text={text}
                    cursorPosition={cursorPosition}
                    participants={participants}
                    currentUserId={currentUserId}
                    onSelect={handleMentionSelect}
                  />
                )}
                <Textarea
                  ref={inputRef}
                  placeholder="Responder en hilo..."
                  className="min-h-[36px] max-h-[80px] resize-none bg-primary/5 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 rounded-3xl px-3 py-2 text-sm"
                  rows={1}
                  value={text}
                  onChange={e => handleTextChange(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  onClick={() => setCursorPosition(inputRef.current?.selectionStart || 0)}
                  onKeyUp={() => setCursorPosition(inputRef.current?.selectionStart || 0)}
                />
              </div>

              {text.trim() ? (
                <Button
                  size="icon"
                  className="h-8 w-8 rounded-full shrink-0 bg-primary text-primary-foreground"
                  disabled={uploading}
                  onClick={handleSend}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  variant="ghost" size="icon"
                  className="shrink-0 h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                  onClick={() => setIsRecording(true)}
                >
                  <Mic className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Lightbox */}
      <ImageLightbox
        src={lightboxSrc}
        alt="media"
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        type={lightboxType}
      />
    </div>
  );
}
