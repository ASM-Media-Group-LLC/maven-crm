import { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from "react";
import MentionAutocomplete from "./MentionAutocomplete";
import { Smile, Paperclip, Send, X, Loader2, FileText, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ChatMessage, UserProfile } from "../types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import VoiceNoteRecorder from "./VoiceNoteRecorder";
import { EmojiBar, usePersistedEmojis } from "@/pages/chatter-evaluator/workspace/EmojiBar";
import { GifPicker } from "@/pages/inbox/GifPicker";
import { StickerPicker } from "@/pages/inbox/StickerPicker";
import { ScriptsButton } from "@/components/chat/ScriptsButton";

import { MAX_FILES, MAX_FILE_SIZE_MB, MAX_FILE_SIZE_BYTES, formatFileSize, uploadFileWithTUS } from "../uploadUtils";

interface PendingFile {
  file: File;
  preview?: string;
  type: "image" | "file";
}

export interface MessageInputHandle {
  addFiles: (files: File[]) => void;
}

interface MessageInputProps {
  onSendMessage: (content: string, type?: ChatMessage["type"], fileUrl?: string, fileName?: string, replyToId?: string) => void;
  onSendTyping: (isTyping: boolean) => void;
  replyTo: ChatMessage | null;
  profiles: Record<string, UserProfile>;
  onCancelReply: () => void;
  participants?: { user_id: string; profile?: UserProfile }[];
  chatType?: string;
}

const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(({ 
  onSendMessage, onSendTyping, replyTo, profiles, onCancelReply,
  participants, chatType,
}, ref) => {
  const { user } = useAuth();
  const [cursorPosition, setCursorPosition] = useState(0);
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const [messengerEmojis, setMessengerEmojis] = usePersistedEmojis("messenger", user?.id);

  // GIF (Giphy mp4, URL externa estable) → se manda como archivo (Messenger no renderiza video
  // inline; el sticker sí porque es webp/imagen).
  const sendGifUrl = (mp4Url: string) => {
    onSendMessage("🎬 GIF", "file" as ChatMessage["type"], mp4Url, "gif.mp4", replyTo?.id);
    onCancelReply();
  };
  // Sticker: el picker da URL FIRMADA (bucket privado, expira) → la copiamos a chat-files
  // (bucket público de Messenger) para una URL permanente y la mandamos como imagen.
  const sendStickerUrl = async (signedUrl: string) => {
    if (!user) return;
    try {
      const resp = await fetch(signedUrl);
      if (!resp.ok) throw new Error("no se pudo leer el sticker");
      const blob = await resp.blob();
      const ext = blob.type.includes("gif") ? "gif" : "webp";
      const fileName = `sticker-${Date.now()}.${ext}`;
      const path = `${user.id}/${fileName}`;
      const { error } = await supabase.storage.from("chat-files").upload(path, blob, { contentType: blob.type || "image/webp" });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(path);
      onSendMessage("sticker", "image" as ChatMessage["type"], urlData.publicUrl, fileName, replyTo?.id);
      onCancelReply();
    } catch (e) {
      toast.error("No se pudo enviar el sticker", { description: (e as Error).message });
    }
  };

  const addFilesInternal = useCallback((files: File[]) => {
    const totalFiles = pendingFiles.length + files.length;
    if (totalFiles > MAX_FILES) {
      toast.error(`Máximo ${MAX_FILES} archivos adjuntos por envío`);
      return;
    }
    const oversized = files.filter(f => f.size > MAX_FILE_SIZE_BYTES);
    if (oversized.length > 0) {
      const names = oversized.map(f => f.name).join(", ");
      toast.error(`Archivos demasiado grandes (máx ${MAX_FILE_SIZE_MB}MB): ${names}`);
      return;
    }
    const newPending: PendingFile[] = files.map(file => {
      const isImg = file.type.startsWith("image/");
      return {
        file,
        preview: isImg ? URL.createObjectURL(file) : undefined,
        type: isImg ? "image" as const : "file" as const,
      };
    });
    setPendingFiles(prev => [...prev, ...newPending]);
  }, [pendingFiles.length]);

  // Expose addFiles to parent via ref
  useImperativeHandle(ref, () => ({
    addFiles: addFilesInternal,
  }), [addFilesInternal]);

  // TUS resumable upload using shared utility
  const uploadFileWithProgress = useCallback(async (file: File, path: string): Promise<{ error: string | null }> => {
    return uploadFileWithTUS(file, path, {
      onProgress: setUploadPercent,
      onStatusText: setUploadProgress,
      abortRef,
    });
  }, []);

  const cancelUpload = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  const handleSend = useCallback(async () => {
    if (pendingFiles.length > 0) {
      setUploading(true);
      for (let i = 0; i < pendingFiles.length; i++) {
        const pf = pendingFiles[i];
        setUploadProgress(`Subiendo ${i + 1}/${pendingFiles.length}: ${pf.file.name} (${formatFileSize(pf.file.size)})`);
        setUploadPercent(0);
        const path = `${user!.id}/${Date.now()}-${pf.file.name}`;

        // Use XHR for files > 5MB for progress, SDK for small files
        let uploadError: string | null = null;
        if (pf.file.size > 5 * 1024 * 1024) {
          const result = await uploadFileWithProgress(pf.file, path);
          uploadError = result.error;
        } else {
          const { error } = await supabase.storage.from("chat-files").upload(path, pf.file);
          uploadError = error?.message || null;
        }

        if (uploadError === "cancelled") {
          toast("Subida cancelada");
          setUploading(false);
          setUploadProgress("");
          setUploadPercent(0);
          return;
        }
        if (uploadError) {
          toast.error(`Error al subir ${pf.file.name}: ${uploadError}`);
          continue;
        }
        const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(path);
        const baseContent = i === 0 && text.trim() ? text.trim() : "";
        const msgContent = baseContent
          ? `${baseContent}\n📎 ${pf.file.name}`
          : pf.file.name;
        onSendMessage(msgContent, pf.type as ChatMessage["type"], urlData.publicUrl, pf.file.name, replyTo?.id);
      }
      setPendingFiles([]);
      setText("");
      onCancelReply();
      setUploading(false);
      setUploadProgress("");
      setUploadPercent(0);
      inputRef.current?.focus();
      return;
    }

    if (!text.trim()) return;
    onSendMessage(text.trim(), "text", undefined, undefined, replyTo?.id);
    setText("");
    onCancelReply();
    onSendTyping(false);
    inputRef.current?.focus();
  }, [text, replyTo, onSendMessage, onCancelReply, onSendTyping, pendingFiles, user, uploadFileWithProgress]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageFiles = items
      .filter(item => item.type.startsWith("image/"))
      .map(item => {
        const file = item.getAsFile();
        if (!file) return null;
        const ext = file.type.split("/")[1] || "png";
        return new File([file], `pasted-image-${Date.now()}.${ext}`, { type: file.type });
      })
      .filter((f): f is File => f !== null);

    if (imageFiles.length > 0) {
      e.preventDefault();
      addFilesInternal(imageFiles);
    }
  }, [addFilesInternal]);

  const handleTextChange = (val: string) => {
    setText(val);
    setCursorPosition(inputRef.current?.selectionStart || val.length);
    onSendTyping(true);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onSendTyping(false), 2000);
  };

  const handleMentionSelect = (newText: string, _userId: string) => {
    setText(newText);
    setCursorPosition(newText.length);
    inputRef.current?.focus();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) addFilesInternal(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => {
      const updated = [...prev];
      if (updated[index].preview) URL.revokeObjectURL(updated[index].preview!);
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleVoiceNoteSend = useCallback(async (blob: Blob, durationSec: number) => {
    if (!user) return;
    setUploading(true);
    const mimeToExt: Record<string, string> = {
      "audio/webm": "webm",
      "audio/ogg": "ogg",
      "audio/mp4": "m4a",
      "audio/mpeg": "mp3",
    };
    const ext = mimeToExt[blob.type] || "webm";
    const fileName = `voice-note-${Date.now()}.${ext}`;
    const path = `${user.id}/${fileName}`;
    const { error } = await supabase.storage.from("chat-files").upload(path, blob, {
      contentType: blob.type,
    });
    if (error) {
      toast.error("Error al subir nota de voz");
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(path);
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    onSendMessage(`🎤 Nota de voz (${mins}:${secs.toString().padStart(2, "0")})`, "file" as ChatMessage["type"], urlData.publicUrl, fileName);
    setIsRecording(false);
    setUploading(false);
  }, [user, onSendMessage]);

  return (
    <div className="shrink-0 bg-primary/[0.03]">
      {/* Reply bar */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 animate-fade-in">
          <div className="h-8 w-1 rounded-full bg-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-primary">
              {replyTo.sender_id === user?.id ? "Tú" : profiles[replyTo.sender_id]?.full_name || "Usuario"}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">{replyTo.content}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onCancelReply}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* File previews with sizes */}
      {pendingFiles.length > 0 && (
        <div className="bg-primary/[0.03]">
          <div className="flex items-center justify-between px-4 pt-2 pb-1">
            <span className="text-[11px] text-muted-foreground font-medium">
              {pendingFiles.length}/{MAX_FILES} archivos adjuntos
            </span>
            <Button variant="ghost" size="sm" className="h-5 text-[10px] text-destructive hover:text-destructive" onClick={() => {
              pendingFiles.forEach(pf => { if (pf.preview) URL.revokeObjectURL(pf.preview); });
              setPendingFiles([]);
            }}>
              Quitar todos
            </Button>
          </div>
          <div className="flex gap-2 px-4 pb-2 overflow-x-auto">
            {pendingFiles.map((pf, i) => (
              <div key={i} className="relative shrink-0 group/file">
                {pf.preview ? (
                  <img src={pf.preview} alt={pf.file.name} className="h-16 w-16 object-cover rounded-2xl" />
                ) : (
                  <div className="h-16 w-16 rounded-2xl bg-primary/5 flex flex-col items-center justify-center gap-1">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <span className="text-[8px] text-muted-foreground truncate max-w-[56px]">
                      {pf.file.name.split(".").pop()?.toUpperCase()}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => removePendingFile(i)}
                  className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover/file:opacity-100 transition-opacity"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
                <p className="text-[8px] text-muted-foreground truncate max-w-[64px] mt-0.5 text-center">{pf.file.name}</p>
                <p className="text-[7px] text-muted-foreground/70 text-center">{formatFileSize(pf.file.size)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload progress with percentage and cancel */}
      {uploading && uploadProgress && (
        <div className="px-4 py-2 bg-primary/5 space-y-1">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
            <span className="text-[11px] text-primary font-medium truncate flex-1">{uploadProgress}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-2 text-[10px] text-destructive hover:text-destructive"
              onClick={cancelUpload}
            >
              Cancelar
            </Button>
          </div>
          {uploadPercent > 0 && (
            <Progress value={uploadPercent} className="h-1.5" indicatorClassName="bg-primary" />
          )}
        </div>
      )}

      {/* Barra de emojis ARRIBA (personalizable, scope "messenger"). Reemplaza el popover. */}
      {!isRecording && (
        <EmojiBar
          emojis={messengerEmojis}
          onPick={(e) => { setText((v) => v + e); inputRef.current?.focus(); }}
          onAdd={(e) => setMessengerEmojis((curr) => (curr.includes(e) ? curr : [...curr, e]))}
          onRemove={(e) => setMessengerEmojis((curr) => curr.filter((x) => x !== e))}
        />
      )}

      {/* Composer: texto AL MEDIO, acciones ABAJO (adjuntar · GIF · sticker · Scripts · mic) +
          Enviar a la derecha. NO se tocó la lógica de envío/voz/menciones/upload. */}
      <div className="px-3 py-2.5">
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} multiple accept="*/*" />
        {isRecording ? (
          <VoiceNoteRecorder
            isRecording={isRecording}
            onStartRecording={() => setIsRecording(true)}
            onSend={handleVoiceNoteSend}
            onCancel={() => setIsRecording(false)}
          />
        ) : (
          <div className="space-y-2">
            <div className="relative">
              {chatType === "group" && participants && (
                <MentionAutocomplete
                  text={text}
                  cursorPosition={cursorPosition}
                  participants={participants}
                  currentUserId={user?.id}
                  onSelect={handleMentionSelect}
                />
              )}
              <Textarea
                ref={inputRef}
                placeholder={chatType === "group" ? "Escribe un mensaje... (usa @ para mencionar)" : "Escribe un mensaje..."}
                className="min-h-[38px] max-h-[120px] w-full resize-none bg-primary/5 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 rounded-2xl px-4 py-2.5 pr-12 text-sm"
                rows={1}
                value={text}
                onChange={e => handleTextChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onSelect={e => setCursorPosition((e.target as HTMLTextAreaElement).selectionStart)}
              />
              <Button
                size="icon"
                onClick={handleSend}
                className="absolute bottom-1.5 right-1.5 h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-accent to-primary text-white shadow-sm hover:opacity-90 transition-all"
                disabled={uploading || (!text.trim() && pendingFiles.length === 0)}
                title="Enviar"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost" size="icon"
                className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-primary/8 hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Adjuntar archivo"
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
              </Button>
              <GifPicker onPick={sendGifUrl} disabled={uploading} />
              <StickerPicker onPick={sendStickerUrl} disabled={uploading} />
              <ScriptsButton
                surface="messenger"
                disabled={uploading}
                onUse={(s) => {
                  if (s.send_on_click) { onSendMessage(s.text, "text", undefined, undefined, replyTo?.id); onCancelReply(); }
                  else { setText((v) => (v.trim() ? v.trimEnd() + " " : "") + s.text); inputRef.current?.focus(); }
                }}
              />
              <Button
                variant="ghost" size="icon"
                className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-primary/8 hover:text-foreground"
                onClick={() => setIsRecording(true)}
                title="Grabar nota de voz"
              >
                <Mic className="h-5 w-5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

MessageInput.displayName = "MessageInput";

export default MessageInput;
