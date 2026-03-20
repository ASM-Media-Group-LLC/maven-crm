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

const EMOJIS = [
  "😀","😂","😍","🥰","😎","🤔","👍","👋","🎉","🔥",
  "❤️","💯","🚀","✅","⭐","💪","🙏","😊","🤩","👏",
  "😅","🫡","🤝","💀","🥲","😤","🤓","🫠","🙌","💜",
];

const MAX_FILES = 20;
const MAX_FILE_SIZE_MB = 350;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

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

  // TUS resumable upload with 6MB chunks, retry logic, and progress for large files
  const uploadFileWithProgress = useCallback(async (file: File, path: string): Promise<{ error: string | null }> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;

    if (!token) return { error: "No auth session" };
    if (!apikey) return { error: "Missing Supabase publishable key" };
    if (!projectId) return { error: "Missing Supabase project id" };

    const tusEndpoint = `https://${projectId}.supabase.co/storage/v1/upload/resumable`;

    console.log("[TUS] Starting upload:", { fileName: file.name, fileSize: file.size, fileSizeMB: (file.size / 1024 / 1024).toFixed(1), path, endpoint: tusEndpoint });

    // Base64 metadata per TUS spec
    const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
    const uploadMetadata = [
      `bucketName ${b64("chat-files")}`,
      `objectName ${b64(path)}`,
      `contentType ${b64(file.type || "application/octet-stream")}`,
      `cacheControl ${b64("3600")}`,
    ].join(",");

    try {
      // Step 1: Create TUS upload session
      console.log("[TUS] Creating upload session...");
      const createRes = await fetch(tusEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey,
          "x-upsert": "true",
          "Upload-Length": String(file.size),
          "Upload-Metadata": uploadMetadata,
          "Tus-Resumable": "1.0.0",
        },
      });

      if (!createRes.ok) {
        let detail = `HTTP ${createRes.status}`;
        try {
          const text = await createRes.text();
          console.error("[TUS] Create session failed - raw response:", text);
          try {
            const body = JSON.parse(text);
            detail = body.message || body.error || body.statusCode || detail;
          } catch {
            detail = text.substring(0, 200) || detail;
          }
        } catch {}
        console.error("[TUS] Create session failed:", createRes.status, detail);
        if (createRes.status === 413 || detail.toLowerCase().includes("maximum allowed size") || detail.toLowerCase().includes("payload too large")) {
          return {
            error:
              "El archivo excede el límite de Storage del proyecto. Ve a Supabase Dashboard > Storage > Settings y aumenta el 'Global file size limit' (mín. 367001600 bytes para 350MB).",
          };
        }
        return { error: `Error al iniciar subida: ${detail}` };
      }

      const location = createRes.headers.get("Location");
      if (!location) {
        console.error("[TUS] No Location header in response. Headers:", [...createRes.headers.entries()]);
        return { error: "No upload location returned by server" };
      }

      const uploadUrl = location.startsWith("http") ? location : new URL(location, tusEndpoint).toString();
      console.log("[TUS] Upload session created. Location:", uploadUrl);

      // Step 2: Upload chunks with retry
      const MAX_RETRIES = 3;
      let offset = 0;
      const totalChunks = Math.ceil(file.size / TUS_CHUNK_SIZE_BYTES);
      let chunkIndex = 0;

      while (offset < file.size) {
        chunkIndex++;
        const chunkEnd = Math.min(offset + TUS_CHUNK_SIZE_BYTES, file.size);
        const chunk = file.slice(offset, chunkEnd);
        const currentOffset = offset;

        console.log(`[TUS] Uploading chunk ${chunkIndex}/${totalChunks} (offset: ${currentOffset}, size: ${chunk.size})`);

        let lastError: string | null = null;
        let succeeded = false;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          if (attempt > 1) {
            console.log(`[TUS] Retry attempt ${attempt}/${MAX_RETRIES} for chunk ${chunkIndex}`);
            setUploadProgress(`Reintentando chunk ${chunkIndex}/${totalChunks} (intento ${attempt})...`);
            await new Promise(r => setTimeout(r, 1000 * attempt)); // backoff
          }

          const chunkResult = await new Promise<{ error: string | null; nextOffset: number }>((resolve) => {
            const xhr = new XMLHttpRequest();
            abortRef.current = xhr;

            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const uploaded = currentOffset + e.loaded;
                setUploadPercent(Math.min(99, Math.round((uploaded / file.size) * 100)));
              }
            };

            xhr.onload = () => {
              abortRef.current = null;
              if (xhr.status >= 200 && xhr.status < 300) {
                const nextOffsetHeader = xhr.getResponseHeader("Upload-Offset");
                const nextOffset = Number(nextOffsetHeader ?? currentOffset + chunk.size);
                console.log(`[TUS] Chunk ${chunkIndex} uploaded. Server offset: ${nextOffsetHeader}, nextOffset: ${nextOffset}`);
                resolve({ error: null, nextOffset: Number.isFinite(nextOffset) ? nextOffset : currentOffset + chunk.size });
              } else {
                let detail = `HTTP ${xhr.status}`;
                try {
                  const body = JSON.parse(xhr.responseText);
                  detail = body.message || body.error || detail;
                } catch {
                  detail = xhr.responseText?.substring(0, 200) || detail;
                }
                console.error(`[TUS] Chunk ${chunkIndex} failed (attempt ${attempt}):`, xhr.status, detail);
                resolve({ error: detail, nextOffset: currentOffset });
              }
            };

            xhr.onerror = () => {
              abortRef.current = null;
              console.error(`[TUS] Chunk ${chunkIndex} network error (attempt ${attempt})`);
              resolve({ error: "Error de red — verifica tu conexión", nextOffset: currentOffset });
            };

            xhr.onabort = () => {
              abortRef.current = null;
              resolve({ error: "cancelled", nextOffset: currentOffset });
            };

            xhr.timeout = 120000; // 2min per chunk
            xhr.ontimeout = () => {
              abortRef.current = null;
              console.error(`[TUS] Chunk ${chunkIndex} timeout (attempt ${attempt})`);
              resolve({ error: "Timeout — conexión lenta", nextOffset: currentOffset });
            };

            xhr.open("PATCH", uploadUrl);
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);
            xhr.setRequestHeader("apikey", apikey);
            xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");
            xhr.setRequestHeader("Upload-Offset", String(currentOffset));
            xhr.setRequestHeader("Tus-Resumable", "1.0.0");
            xhr.send(chunk);
          });

          if (chunkResult.error === "cancelled") {
            return { error: "cancelled" };
          }

          if (!chunkResult.error) {
            offset = chunkResult.nextOffset;
            setUploadPercent(Math.min(99, Math.round((offset / file.size) * 100)));
            succeeded = true;
            break;
          }

          lastError = chunkResult.error;
        }

        if (!succeeded) {
          console.error(`[TUS] Chunk ${chunkIndex} failed after ${MAX_RETRIES} attempts:`, lastError);
          return { error: `Error en chunk ${chunkIndex}/${totalChunks}: ${lastError}` };
        }
      }

      setUploadPercent(100);
      console.log("[TUS] Upload completed successfully:", path);
      return { error: null };
    } catch (err: any) {
      console.error("[TUS] Unexpected error:", err);
      return { error: err.message || "Error inesperado en la subida" };
    }
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
    <div className="shrink-0 border-t border-border bg-card/80 backdrop-blur-sm">
      {/* Reply bar */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b border-border animate-fade-in">
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
        <div className="border-b border-border bg-muted/20">
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
                  <img src={pf.preview} alt={pf.file.name} className="h-16 w-16 object-cover rounded-lg border border-border" />
                ) : (
                  <div className="h-16 w-16 rounded-lg border border-border bg-muted flex flex-col items-center justify-center gap-1">
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
        <div className="px-4 py-2 border-b border-border bg-primary/5 space-y-1">
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

      {/* Input row */}
      <div className="flex items-end gap-1.5 px-3 py-2.5">
        {!isRecording && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9 rounded-full text-muted-foreground hover:text-foreground">
                  <Smile className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" side="top" align="start">
                <div className="grid grid-cols-10 gap-0.5">
                  {EMOJIS.map(e => (
                    <button
                      key={e}
                      className="text-lg hover:bg-muted rounded-md p-1 transition-colors"
                      onClick={() => handleTextChange(text + e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} multiple accept="*/*" />
            <Button
              variant="ghost" size="icon"
              className="shrink-0 h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
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
                className="min-h-[38px] max-h-[120px] resize-none bg-muted/40 border-0 focus-visible:ring-1 focus-visible:ring-primary/30 rounded-2xl px-4 py-2.5 text-sm"
                rows={1}
                value={text}
                onChange={e => handleTextChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onSelect={e => setCursorPosition((e.target as HTMLTextAreaElement).selectionStart)}
              />
            </div>

            {text.trim() || pendingFiles.length > 0 ? (
              <Button
                size="icon"
                onClick={handleSend}
                className="shrink-0 h-9 w-9 rounded-full bg-primary text-primary-foreground shadow-md hover:shadow-lg transition-all"
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => setIsRecording(true)}
              >
                <Mic className="h-5 w-5" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
});

MessageInput.displayName = "MessageInput";

export default MessageInput;
