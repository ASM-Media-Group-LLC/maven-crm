import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  X, MessageSquareText, Send, MoreVertical, Copy, Edit2, Trash2,
  SmilePlus, Smile, Paperclip, Loader2, File as FileIcon, Mic, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/UserAvatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChatMessage, UserProfile } from "../types";
import type { DeletedMessageArchive } from "../useDeletedMessages";
import { ReactionGroup } from "@/hooks/useReactions";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import MentionAutocomplete, { renderTextWithMentions } from "./MentionAutocomplete";
import ReactionPicker from "./ReactionPicker";
import ReactionsDisplay from "./ReactionsDisplay";
import ReadReceiptIndicator from "./ReadReceiptIndicator";
import ImageLightbox from "./ImageLightbox";
import VoiceNoteRecorder from "./VoiceNoteRecorder";
import { formatTime, formatDate, safeFileUrl } from "../utils";

import { EMOJIS, MAX_FILE_SIZE_BYTES, formatFileSize, uploadFileWithTUS } from "../uploadUtils";
import { claveSeguraParaArchivo } from "@/lib/claveDeArchivo";
import NotaDeVoz from "./NotaDeVoz";

interface ThreadPanelProps {
  parentMessage: ChatMessage;
  replies: ChatMessage[];
  profiles: Record<string, UserProfile>;
  currentUserId?: string;
  onSendReply: (content: string, type?: ChatMessage["type"], fileUrl?: string, fileName?: string) => void;
  onClose: () => void;
  participants?: { user_id: string; profile?: UserProfile }[];
  /** Grupo con la lista de miembros oculta: el buscador de @ va a ciegas. */
  aCiegas?: boolean;
  onEditMessage: (id: string, content: string) => void;
  onDeleteMessage: (id: string) => void;
  getReactionsForMessage: (messageId: string) => ReactionGroup[];
  onToggleReaction: (messageId: string, emoji: string) => void;
  getReadByUsers: (messageId: string) => string[];
  getDeliveredByUsers: (messageId: string) => string[];
  totalParticipants: number;
  /** Contenido original de los eliminados. Solo llega a admins (RLS). */
  deletedArchive?: Record<string, DeletedMessageArchive>;
  /** Respuesta a resaltar y llevar a la vista (llegamos desde una notificación). */
  resaltada?: string | null;
}

export default function ThreadPanel({
  parentMessage, replies, profiles, currentUserId, onSendReply, onClose, participants, aCiegas,
  onEditMessage, onDeleteMessage, getReactionsForMessage, onToggleReaction,
  getReadByUsers, getDeliveredByUsers, totalParticipants, deletedArchive, resaltada,
}: ThreadPanelProps) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Mención clickeada → abrir el DM con esa persona (mismo gesto que en el
  // timeline; /messenger?dm=<id> lo resuelve MessengerPage).
  const navigate = useNavigate();
  const abrirDmDeMencion = (nombre: string) => {
    const perfil = Object.values(profiles).find((p) => p?.full_name === nombre);
    if (perfil) navigate(`/messenger?dm=${perfil.id}&from=${parentMessage.conversation_id}`);
  };
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);
  // Archivos EN ESPERA: adjuntar NO envía — se previsualizan y se suben al
  // presionar Enviar, igual que el compositor principal del Messenger.
  const [pendingFiles, setPendingFiles] = useState<{ file: File; isImg: boolean; preview?: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef<HTMLTextAreaElement>(null);
  const startEdit = (msg: ChatMessage) => { setEditValue(msg.content || ""); setEditingId(msg.id); };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = (msg: ChatMessage) => {
    const v = editValue.trim();
    if (v && v !== msg.content) onEditMessage(msg.id, v);
    setEditingId(null);
  };
  useEffect(() => {
    if (!editingId) return;
    const el = editRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editingId]);
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

  // Llegada desde una notificación: la respuesta mencionada, a la vista y
  // resaltada. Va DESPUÉS del "pegar al fondo" de arriba para ganarle.
  const respuestaRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    if (!resaltada) return;
    respuestaRefs.current[resaltada]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [resaltada, replies.length]);

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

  // Sube UN archivo y devuelve su URL pública. NO envía nada.
  const uploadOne = useCallback(async (file: File): Promise<{ url: string; isImg: boolean } | null> => {
    if (!user) return null;
    setUploadProgress(`Subiendo: ${file.name} (${formatFileSize(file.size)})`);
    setUploadPercent(0);
    // Misma razón que en MessageInput: la clave se sanea, el nombre visible no.
    const path = `${user.id}/${Date.now()}-${claveSeguraParaArchivo(file.name)}`;
    let uploadError: string | null = null;
    if (file.size > 5 * 1024 * 1024) {
      const result = await uploadFileWithProgress(file, path);
      uploadError = result.error;
    } else {
      const { error } = await supabase.storage.from("chat-files").upload(path, file);
      uploadError = error?.message || null;
    }
    if (uploadError === "cancelled") { toast("Subida cancelada"); return null; }
    if (uploadError) { toast.error(`Error: ${uploadError}`); return null; }
    const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(path);
    return { url: urlData.publicUrl, isImg: file.type.startsWith("image/") };
  }, [user, uploadFileWithProgress]);

  // Adjuntar = poner EN ESPERA con preview. Se envía al presionar Enviar.
  const stageFiles = useCallback((files: File[]) => {
    if (files.some((f) => f.size > MAX_FILE_SIZE_BYTES)) {
      toast.error(`Archivo demasiado grande (máx ${formatFileSize(MAX_FILE_SIZE_BYTES)})`);
    }
    const ok = files.filter((f) => f.size <= MAX_FILE_SIZE_BYTES);
    if (!ok.length) return;
    setPendingFiles((prev) => [
      ...prev,
      ...ok.map((file) => {
        const isImg = file.type.startsWith("image/");
        return { file, isImg, preview: isImg ? URL.createObjectURL(file) : undefined };
      }),
    ]);
  }, []);

  const removePendingFile = useCallback((index: number) => {
    setPendingFiles((prev) => {
      const copy = [...prev];
      const gone = copy[index];
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      copy.splice(index, 1);
      return copy;
    });
  }, []);

  // Pegar imágenes en el hilo (Ctrl/Cmd+V con una captura en el portapapeles):
  // mismo criterio que el composer principal — se interceptan SOLO las imágenes
  // (el texto pegado sigue su curso normal) y se suben con el flujo de archivos
  // del hilo. Antes el hilo simplemente ignoraba el pegado.
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const imageFiles = Array.from(e.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => {
        const file = item.getAsFile();
        if (!file) return null;
        const ext = file.type.split("/")[1] || "png";
        return new File([file], `pasted-image-${Date.now()}.${ext}`, { type: file.type });
      })
      .filter((f): f is File => f !== null);
    if (imageFiles.length > 0) {
      e.preventDefault();
      stageFiles(imageFiles);
    }
  }, [stageFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    stageFiles(files);
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

  const handleSend = async () => {
    const body = text.trim();
    if (!body && pendingFiles.length === 0) return;
    if (pendingFiles.length > 0) {
      setUploading(true);
      const batch = [...pendingFiles];
      for (const pf of batch) {
        const up = await uploadOne(pf.file);
        if (up) onSendReply(pf.file.name, up.isImg ? "image" : "file", up.url, pf.file.name);
      }
      batch.forEach((pf) => { if (pf.preview) URL.revokeObjectURL(pf.preview); });
      setPendingFiles([]);
      setUploading(false);
      setUploadProgress("");
      setUploadPercent(0);
    }
    if (body) onSendReply(body);
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

    // El borrado se chequea PRIMERO: si va después de las ramas de imagen/video/
    // audio/archivo, esas retornan antes y un adjunto eliminado seguía mostrándose.
    if (msg.is_deleted) {
      const arch = deletedArchive?.[msg.id];
      // Con fila de archivo = quien mira es admin (RLS solo-admin) → ve el original.
      if (arch) {
        return (
          <div className="rounded-lg px-2 py-1.5 bg-destructive/10 border border-destructive/25">
            {arch.type === "image" && arch.file_url ? (
              <img src={arch.file_url} alt={arch.file_name || "imagen"} decoding="async" className="rounded-lg max-w-full max-h-48 object-cover" />
            ) : arch.file_url ? (
              <a href={safeFileUrl(arch.file_url)} target="_blank" rel="noopener noreferrer" className="text-[12px] underline break-all">
                {arch.file_name || "Archivo"}
              </a>
            ) : null}
            {arch.content && <p className="text-[13px] whitespace-pre-wrap break-words mt-1">{arch.content}</p>}
            <div className="mt-0.5 text-[10px] italic text-destructive/90">Eliminado por el autor · solo admins</div>
          </div>
        );
      }
      return <span className="italic text-muted-foreground text-[13px]">Eliminado por el autor</span>;
    }

    if (isImage) {
      return (
        <div>
          <img
            src={msg.file_url!}
            alt={msg.file_name || "image"}
            decoding="async"
            className="rounded-lg max-w-full max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => openLightbox(msg.file_url!, "image")}
          />
          {msg.content && msg.content !== msg.file_name && (
            <p className="text-[13px] mt-1 whitespace-pre-wrap break-words">
              {renderTextWithMentions(msg.content, participantNames, abrirDmDeMencion)}
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
          <NotaDeVoz src={msg.file_url!} fileName={msg.file_name} contenido={msg.content} />
        </div>
      );
    }

    if (msg.type === "file" && msg.file_url) {
      const ext = msg.file_name?.split(".").pop()?.toLowerCase() || "";
      return (
        <a href={safeFileUrl(msg.file_url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 bg-muted">
            <FileIcon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <span className="text-[13px] truncate block">{msg.file_name || "Archivo"}</span>
            {ext && <span className="text-[10px] text-muted-foreground uppercase">{ext}</span>}
          </div>
        </a>
      );
    }

    if (editingId === msg.id) {
      return (
        <div>
          <Textarea
            ref={editRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(msg); }
              if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
            }}
            rows={1}
            className="text-[13px] min-h-0 resize-none"
          />
          <div className="flex items-center justify-end gap-1 mt-1">
            <button type="button" onClick={cancelEdit} className="text-[11px] px-2 py-0.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors">
              Cancelar
            </button>
            <button type="button" onClick={() => saveEdit(msg)} className="text-[11px] font-medium px-2 py-0.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-colors">
              Guardar
            </button>
          </div>
        </div>
      );
    }

    return (
      <p className="text-[13px] text-foreground/90 whitespace-pre-wrap break-words">
        {renderTextWithMentions(msg.content || "", participantNames, abrirDmDeMencion)}
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
        ref={(el) => { respuestaRefs.current[msg.id] = el; }}
        className={cn(
          "px-4 py-2 group/msg transition-colors duration-700",
          isParent ? "bg-muted/20" : "hover:bg-muted/30",
          !isParent && resaltada === msg.id && "bg-primary/10"
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
                          {msg.type === "text" && (
                            <DropdownMenuItem onClick={() => startEdit(msg)}>
                              <Edit2 className="h-3.5 w-3.5 mr-2" /> Editar
                            </DropdownMenuItem>
                          )}
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
                  variant="onSurface"
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
        {/* Archivos EN ESPERA: se envían al presionar Enviar, no al adjuntar. */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-2">
            {pendingFiles.map((pf, i) => (
              <div key={`${pf.file.name}-${i}`} className="relative">
                {pf.preview ? (
                  <img src={pf.preview} alt={pf.file.name} decoding="async" className="h-14 w-14 rounded-lg object-cover border border-border" />
                ) : (
                  <div className="h-14 w-[124px] rounded-lg border border-border bg-muted/40 flex items-center gap-1.5 px-2">
                    <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-[10px] truncate">{pf.file.name}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removePendingFile(i)}
                  title="Quitar"
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border border-border flex items-center justify-center shadow hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
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
                    aCiegas={aCiegas}
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
                  onPaste={handlePaste}
                />
              </div>

              {text.trim() || pendingFiles.length > 0 ? (
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
