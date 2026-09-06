import { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from "react";
import MentionAutocomplete from "./MentionAutocomplete";
import { Paperclip, Send, X, Loader2, FileText, Mic, Baseline } from "lucide-react";
import { Button } from "@/components/ui/button";
import RichComposer, { RichComposerHandle } from "./RichComposer";
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
import { claveSeguraParaArchivo } from "@/lib/claveDeArchivo";
import { contenidoDeAdjunto } from "@/lib/mensajeConAdjunto";
import { getDraft, setDraft } from "../drafts";

interface PendingFile {
  file: File;
  preview?: string;
  type: "image" | "file";
}

// Cuánto sigue diciendo "está escribiendo" después de la última tecla.
//
// OJO con la historia, porque este número engaña. La lentitud que se reportó
// ("casi lo detecta cuando ya voy a mandar el mensaje") NO era latencia — medido
// en prod el 05/09, de la tecla a la presencia publicada hay 166 ms — ni era que
// este timer fuera corto. Era que el freno de useChat se desincronizaba en cada
// reconexión y se tragaba las teclas; este timer, al publicar `false`, era lo
// único que lo desatascaba. Por eso subirlo a 5s empeoró LAS DOS puntas: tardaba
// más en apagar Y más en volver a detectar.
//
// Arreglada la desincronización de raíz, este número ya es solo estética: cuánto
// aguanta el indicador una pausa para pensar. 3s es el punto medio entre no
// parpadear y no quedarse colgado.
const APAGAR_ESCRIBIENDO_MS = 3000;

export interface MessageInputHandle {
  addFiles: (files: File[]) => void;
}

interface MessageInputProps {
  conversationId: string;
  onSendMessage: (content: string, type?: ChatMessage["type"], fileUrl?: string, fileName?: string, replyToId?: string, albumId?: string, isThreadReply?: boolean, contentRich?: unknown) => void;
  onSendTyping: (isTyping: boolean) => void;
  replyTo: ChatMessage | null;
  profiles: Record<string, UserProfile>;
  onCancelReply: () => void;
  participants?: { user_id: string; profile?: UserProfile }[];
  /** Grupo con la lista de miembros oculta: el buscador de @ va a ciegas. */
  aCiegas?: boolean;
  chatType?: string;
}

const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(({
  conversationId, onSendMessage, onSendTyping, replyTo, profiles, onCancelReply,
  participants, chatType, aCiegas,
}, ref) => {
  const { user } = useAuth();
  const [cursorPosition, setCursorPosition] = useState(0);
  // El texto arranca desde el borrador guardado: si te fuiste a otro chat (o
  // recargaste) sin terminar el mensaje, al volver sigue acá.
  const [text, setText] = useState(() => getDraft(user?.id, conversationId));

  // Persistir el borrador en CADA cambio de texto, venga de donde venga
  // (tecleo, emoji, script pegado). Vaciarlo (p.ej. al enviar) lo borra.
  useEffect(() => {
    setDraft(user?.id, conversationId, text);
  }, [text, user?.id, conversationId]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const composerRef = useRef<RichComposerHandle>(null);
  // Barra de formato plegada por defecto (como el botón "Opciones de formato" de Google).
  const [showToolbar, setShowToolbar] = useState(false);
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
    // Guard: si ya hay una subida en curso, Enter no debe re-disparar el envío
    // (re-subía y duplicaba los archivos porque pendingFiles sigue poblado hasta el final).
    if (uploading) return;
    if (pendingFiles.length > 0) {
      setUploading(true);
      // Álbum estilo WhatsApp: si van VARIAS imágenes, comparten un album_id y el
      // cliente las dibuja como UNA cuadrícula. Las imágenes se mandan primero y
      // juntas (sort estable) para que el álbum quede contiguo en el timeline;
      // los demás archivos van después, cada uno en su burbuja como siempre.
      const files = [...pendingFiles].sort(
        (a, b) => (a.type === "image" ? 0 : 1) - (b.type === "image" ? 0 : 1)
      );
      const imageCount = files.filter((f) => f.type === "image").length;
      const albumId = imageCount > 1 ? crypto.randomUUID() : undefined;
      // El comentario escrito acompaña a TODO el envío: viaja en la primera
      // imagen que suba bien (la cuadrícula lo dibuja debajo, como pie del
      // álbum) o, si no hay imágenes, en el primer archivo.
      const caption = text.trim();
      let captionPending = !!caption;
      for (let i = 0; i < files.length; i++) {
        const pf = files[i];
        setUploadProgress(`Subiendo ${i + 1}/${files.length}: ${pf.file.name} (${formatFileSize(pf.file.size)})`);
        setUploadPercent(0);
        // La clave se SANEA; el nombre que ve la gente sigue siendo el original
        // (se manda aparte, más abajo). Meter el nombre crudo acá era el bug:
        // macOS nombra las capturas con un espacio invisible (U+202F) y Storage
        // rechaza la clave entera. Cualquier tilde o eñe la rompía igual.
        const path = `${user!.id}/${Date.now()}-${claveSeguraParaArchivo(pf.file.name)}`;

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
        const isImg = pf.type === "image";
        // El comentario va con la primera IMAGEN subida con éxito (pie del álbum);
        // sin imágenes, con el primer archivo que suba bien.
        const givesCaption = captionPending && (imageCount > 0 ? isImg : true);
        const baseContent = givesCaption ? caption : "";
        if (givesCaption) captionPending = false;
        // El nombre del archivo NO se pega al texto.
        //
        // La burbuja ya lo muestra por su cuenta: en la tarjeta de archivo y en
        // el `alt` de la imagen, los dos desde `file_name`. Pegarlo al mensaje
        // tenía dos costos visibles:
        //   · se leía el nombre crudo debajo de una imagen que ya se ve, y
        //   · un nombre de sesenta caracteres estiraba la burbuja hasta el 70%
        //     del ancho, dejando un vacío enorme al lado de una captura
        //     vertical (la burbuja se encoge a su contenido, así que el texto
        //     largo era lo ÚNICO que la estiraba).
        //
        // Sin texto se conserva el nombre como contenido: la burbuja lo oculta
        // sola (`content !== file_name`) y la búsqueda y las vistas previas
        // siguen teniendo algo que mostrar.
        const msgContent = contenidoDeAdjunto(baseContent, pf.file.name);
        onSendMessage(msgContent, pf.type as ChatMessage["type"], urlData.publicUrl, pf.file.name, replyTo?.id, isImg ? albumId : undefined);
      }
      setPendingFiles([]);
      setText("");
      composerRef.current?.clear();
      onCancelReply();
      // El camino de texto ya apagaba el "escribiendo" al terminar; este no, y
      // quedaba anunciado con el cajón vacío hasta que venciera el timer.
      clearTimeout(typingTimeout.current);
      onSendTyping(false);
      setUploading(false);
      setUploadProgress("");
      setUploadPercent(0);
      composerRef.current?.focus();
      return;
    }

    if (!text.trim()) return;
    // El texto plano SIEMPRE viaja en `content` (vista previa, búsqueda, menciones);
    // el formato va aparte en content_rich, y es null si el mensaje no tiene formato.
    const rich = composerRef.current?.getRich() ?? null;
    onSendMessage(text.trim(), "text", undefined, undefined, replyTo?.id, undefined, undefined, rich);
    setText("");
    composerRef.current?.clear();
    onCancelReply();
    // clear() dispara onUpdate y re-arma el timer; hay que matarlo o dentro de
    // 3s dispara un `false` de más sobre el mensaje siguiente.
    clearTimeout(typingTimeout.current);
    onSendTyping(false);
    composerRef.current?.focus();
  }, [text, replyTo, onSendMessage, onCancelReply, onSendTyping, pendingFiles, user, uploadFileWithProgress, uploading]);

  // El editor rico avisa el texto PLANO y dónde está el cursor dentro de ese texto;
  // con eso siguen andando el borrador, el indicador de "escribiendo" y las @menciones.
  const handleComposerUpdate = useCallback((plain: string, cursorPlain: number, cambioDeTexto = true) => {
    setText(plain);
    setCursorPosition(cursorPlain);
    // Mover el cursor NO es escribir: sin esta guarda, hacer clic en el cajón ya
    // le anunciaba "está escribiendo" a la otra persona.
    if (!cambioDeTexto) return;
    onSendTyping(true);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onSendTyping(false), APAGAR_ESCRIBIENDO_MS);
  }, [onSendTyping]);

  // Con editor rico no se puede reemplazar TODO el texto (borraría el formato):
  // se borra solo el token "@algo" que está antes del cursor y se inserta la mención.
  const handleMentionSelect = (_newText: string, userId: string) => {
    const before = text.slice(0, cursorPosition);
    const at = before.lastIndexOf("@");
    const tokenLen = at === -1 ? 0 : cursorPosition - at;
    const nombre = profiles[userId]?.full_name
      || participants?.find((p) => p.user_id === userId)?.profile?.full_name
      || "";
    if (!nombre) return;
    composerRef.current?.replaceMentionToken(tokenLen, `@${nombre} `);
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
    // Los segundos van en el nombre a propósito: el .webm de MediaRecorder no
    // trae duración, así que esta es la única fuente fiable para el reproductor.
    const fileName = `voice-note-${Date.now()}-${Math.round(durationSec)}s.${ext}`;
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
    // Borde inferior en el iPhone instalado: el área segura son 34 pt, pero el
    // indicador de inicio ocupa solo los últimos ~13; con 12 pt menos la barra
    // queda pegada abajo como en Android y no choca con el gesto. En Android y
    // escritorio el inset es 0 y esto vale 0.
    <div className="shrink-0 bg-primary/[0.03] pb-[max(0px,calc(env(safe-area-inset-bottom,0px)-12px))]">
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
                  <img src={pf.preview} alt={pf.file.name} decoding="async" className="h-16 w-16 object-cover rounded-2xl" />
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
                  aria-label={`Quitar ${pf.file.name}`}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/file:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
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

      {/* Barra de emojis ARRIBA (personalizable, scope "messenger"). Reemplaza el popover.
          En el teléfono es una sola fila que se desliza (ver EmojiBar). */}
      {!isRecording && (
        <EmojiBar
          emojis={messengerEmojis}
          onPick={(e) => composerRef.current?.insertText(e)}
          onAdd={(e) => setMessengerEmojis((curr) => (curr.includes(e) ? curr : [...curr, e]))}
          onRemove={(e) => setMessengerEmojis((curr) => curr.filter((x) => x !== e))}
        />
      )}

      {/* Composer: texto AL MEDIO, acciones ABAJO (adjuntar · GIF · sticker · Scripts · mic) +
          Enviar a la derecha. NO se tocó la lógica de envío/voz/menciones/upload. */}
      <div className="px-3 pt-2.5 pb-1.5 md:pb-2.5">
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
                  aCiegas={aCiegas}
                />
              )}
              <div className="msg-composer-wrap w-full min-w-0 overflow-hidden bg-primary/5 rounded-2xl px-4 py-2.5 pr-12 focus-within:ring-1 focus-within:ring-primary/30">
                <RichComposer
                  ref={composerRef}
                  initialContent={getDraft(user?.id, conversationId)}
                  placeholder={chatType === "group" ? "Escribe un mensaje... (usa @ para mencionar)" : "Escribe un mensaje..."}
                  showToolbar={showToolbar}
                  disabled={uploading}
                  onUpdate={handleComposerUpdate}
                  onEnter={handleSend}
                  onPasteFiles={addFilesInternal}
                />
              </div>
              <Button
                size="icon"
                onClick={handleSend}
                className="absolute bottom-[7px] right-2 h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-accent to-primary text-white shadow-sm hover:opacity-90 transition-all"
                disabled={uploading || (!text.trim() && pendingFiles.length === 0)}
                title="Enviar"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost" size="icon"
                className={cn(
                  "h-9 w-9 shrink-0 rounded-full hover:bg-primary/8",
                  showToolbar ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setShowToolbar((v) => !v)}
                title="Opciones de formato"
              >
                <Baseline className="h-5 w-5" />
              </Button>
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
                  else { composerRef.current?.insertText((text.trim() ? " " : "") + s.text); }
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
