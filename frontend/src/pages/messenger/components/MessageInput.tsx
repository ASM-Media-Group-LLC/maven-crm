import { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from "react";
import MentionAutocomplete from "./MentionAutocomplete";
import { Paperclip, Send, X, Loader2, FileText, Mic, Baseline, Plus, Camera, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import RichComposer, { RichComposerHandle } from "./RichComposer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ChatMessage, UserProfile } from "../types";
import { cn } from "@/lib/utils";
import { remitenteVisible } from "../utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import VoiceNoteRecorder from "./VoiceNoteRecorder";
import { EmojiBar, usePersistedEmojis } from "@/pages/chatter-evaluator/workspace/EmojiBar";
import { GifPicker } from "@/pages/inbox/GifPicker";
import { StickerPicker } from "@/pages/inbox/StickerPicker";
import Expresiones from "./Expresiones";
import SelectorDeEmojis from "@/components/chat/SelectorDeEmojis";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScriptsButton } from "@/components/chat/ScriptsButton";

import { MAX_FILES, MAX_FILE_SIZE_MB, MAX_FILE_SIZE_BYTES, formatFileSize, uploadFileWithTUS, uploadSmallWithRetry } from "../uploadUtils";
import { claveSeguraParaArchivo } from "@/lib/claveDeArchivo";
import { contenidoDeAdjunto } from "@/lib/mensajeConAdjunto";
import { getDraft, getDraftDoc, setDraft, clearDraft } from "../drafts";
import { adjuntosEnMemoria, cargarAdjuntos, guardarAdjuntos, olvidarAdjuntos } from "../adjuntosDelBorrador";
import type { JSONContent } from "@tiptap/react";
import { ProgramarEnvio } from "@/components/programar/ProgramarEnvio";
import { mensajeDeArgs, type MensajeAProgramar } from "../programados";
import { useLanguage } from "@/hooks/useLanguage";

interface PendingFile {
  file: File;
  preview?: string;
  type: "image" | "file";
}

function aPendiente(file: File): PendingFile {
  const isImg = file.type.startsWith("image/");
  return {
    file,
    preview: isImg ? URL.createObjectURL(file) : undefined,
    type: isImg ? "image" : "file",
  };
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
  /** Vuelve a poner un mensaje en el cajón (un programado que se edita). */
  ponerParaEditar: (doc: JSONContent) => void;
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
  /** Fuerza el composer del TELÉFONO (una fila, sin la barra de emojis: las
   *  expresiones van en un solo botón) aunque la pantalla sea grande. Lo usa
   *  la ventanita flotante del Messenger, donde la barra no entraba y tapaba
   *  el chat (Jhon, 10/09/2026). */
  compacto?: boolean;
  /** «Programar envío» (como Google Chat, Jhon 08/10). Recibe los MISMOS
   *  mensajes que se habrían mandado y su hora; devuelve si quedó programado.
   *  Sin esto, no hay flechita (el panel de un hilo no la tiene). */
  onProgramar?: (mensajes: MensajeAProgramar[], cuando: Date) => Promise<boolean>;
}

const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(({
  conversationId, onSendMessage, onSendTyping, replyTo, profiles, onCancelReply,
  participants, chatType, aCiegas, compacto = false, onProgramar,
}, ref) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [cursorPosition, setCursorPosition] = useState(0);
  // El texto arranca desde el borrador guardado: si te fuiste a otro chat (o
  // recargaste) sin terminar el mensaje, al volver sigue acá.
  const [text, setText] = useState(() => getDraft(user?.id, conversationId));
  // El borrador se guarda desde handleComposerUpdate, que trae el DOCUMENTO del
  // editor (renglones, viñetas, formato). Ya no desde un efecto sobre `text`:
  // `text` es plano, y guardar eso era justamente lo que aplastaba los renglones.
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);
  // Los adjuntos sin mandar también son borrador: arrancan desde lo que quedó
  // anotado (memoria de la pestaña, al instante) y, tras una recarga, desde el
  // disco (abajo). Ver adjuntosDelBorrador.ts.
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>(() =>
    (adjuntosEnMemoria(user?.id, conversationId) ?? []).map(aPendiente)
  );
  // ⚠️ No se escribe NADA hasta haber leído lo guardado: el primer render trae
  // la lista vacía y, sin esta guarda, el efecto de abajo borraba del disco la
  // captura que se estaba por recuperar.
  const [adjuntosLeidos, setAdjuntosLeidos] = useState(false);
  // Mientras se suben, los adjuntos YA NO son borrador (ver handleSend).
  const subiendoRef = useRef(false);
  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);
  useEffect(() => {
    let vivo = true;
    void cargarAdjuntos(user?.id, conversationId).then((guardados) => {
      if (!vivo) return;
      // Marcarlo SIEMPRE, haya o no algo guardado: si se pegó una captura mientras
      // se leía el disco, el efecto de abajo tiene que guardarla ahora.
      setAdjuntosLeidos(true);
      if (guardados.length === 0) return;
      setPendingFiles((prev) => {
        // Lo que ya está en pantalla (memoria, o algo pegado mientras se leía el
        // disco) no se duplica.
        const yaEsta = new Set(prev.map((pf) => pf.file));
        const nuevos = guardados.filter((f) => !yaEsta.has(f)).map(aPendiente);
        return nuevos.length ? [...prev, ...nuevos] : prev;
      });
    });
    return () => { vivo = false; };
  }, [user?.id, conversationId]);
  useEffect(() => {
    if (!adjuntosLeidos || subiendoRef.current) return;
    void guardarAdjuntos(user?.id, conversationId, pendingFiles.map((pf) => pf.file));
  }, [pendingFiles, adjuntosLeidos, user?.id, conversationId]);
  // Las miniaturas son URLs de objeto: se sueltan al salir (el File sigue vivo
  // en la memoria del borrador; al volver se crean de nuevo).
  const pendingFilesRef = useRef(pendingFiles);
  pendingFilesRef.current = pendingFiles;
  useEffect(() => () => {
    pendingFilesRef.current.forEach((pf) => { if (pf.preview) URL.revokeObjectURL(pf.preview); });
  }, []);
  const [isRecording, setIsRecording] = useState(false);
  const composerRef = useRef<RichComposerHandle>(null);
  // Al elegir «Responder», el cursor queda listo en el cuadro (Keila, 02/10:
  // había que hacer clic 2 o 3 veces). Va en el cuadro siguiente: el menú de
  // donde vino todavía se está cerrando.
  const respondiendoA = replyTo?.id;
  useEffect(() => {
    if (!respondiendoA) return;
    const cuadro = requestAnimationFrame(() => composerRef.current?.focus());
    return () => cancelAnimationFrame(cuadro);
  }, [respondiendoA]);
  // Barra de formato plegada por defecto (como el botón "Opciones de formato" de Google).
  const [showToolbar, setShowToolbar] = useState(false);
  // Teléfono: fila única estilo WhatsApp (+ · cajón con expresiones · cámara · mic/enviar).
  // `compacto` pide esa misma fila desde una ventana chica en escritorio.
  const isMobile = useIsMobile() || compacto;
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const [messengerEmojis, setMessengerEmojis] = usePersistedEmojis("messenger", user?.id);


  // GIF (Giphy mp4, URL externa estable) → se manda como archivo (Messenger no renderiza video
  // inline; el sticker sí porque es webp/imagen).
  //
  // "🎬 GIF", "sticker" y "🎤 Nota de voz (m:ss)" son el CONTENIDO del mensaje que
  // se guarda en chat_messages y ven los demás: es dato, no se traduce.
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
      if (!resp.ok) throw new Error(t("messenger.input.noSePudoLeerSticker"));
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
      toast.error(t("messenger.input.noSePudoSticker"), { description: (e as Error).message });
    }
  };

  const addFilesInternal = useCallback((files: File[]) => {
    const totalFiles = pendingFiles.length + files.length;
    if (totalFiles > MAX_FILES) {
      toast.error(t("messenger.input.maximoArchivos", { n: MAX_FILES }));
      return;
    }
    const oversized = files.filter(f => f.size > MAX_FILE_SIZE_BYTES);
    if (oversized.length > 0) {
      const names = oversized.map(f => f.name).join(", ");
      toast.error(t("messenger.input.archivosGrandes", { mb: MAX_FILE_SIZE_MB, nombres: names }));
      return;
    }
    const newPending: PendingFile[] = files.map(aPendiente);
    setPendingFiles(prev => [...prev, ...newPending]);
  }, [pendingFiles.length, t]);

  // Expose addFiles to parent via ref
  useImperativeHandle(ref, () => ({
    addFiles: addFilesInternal,
    ponerParaEditar: (doc: JSONContent) => composerRef.current?.ponerDoc(doc),
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

  // Mandar YA, o programar para `cuando` (la flechita). Los mensajes se arman
  // con el MISMO código en los dos casos: `emitir` los manda o los anota.
  const enviarOProgramar = useCallback(async (cuando?: Date) => {
    // Guard: si ya hay una subida en curso, Enter no debe re-disparar el envío
    // (re-subía y duplicaba los archivos porque pendingFiles sigue poblado hasta el final).
    if (uploading) return;
    if (cuando && !onProgramar) return;
    const anotados: MensajeAProgramar[] = [];
    const emitir: MessageInputProps["onSendMessage"] = cuando
      ? (...args) => { anotados.push(mensajeDeArgs(...args)); }
      : onSendMessage;
    if (pendingFiles.length > 0) {
      setUploading(true);
      // Desde que arranca la subida, esto ya no es borrador: se va a mandar. Si
      // no se olvida ACÁ (y se esperaba al final), irse del chat a mitad de la
      // subida dejaba el borrador guardado y al volver aparecía de nuevo, listo
      // para mandarse dos veces. Si se cancela, se vuelve a anotar.
      subiendoRef.current = true;
      const docAntes = composerRef.current?.getDoc() ?? null;
      void olvidarAdjuntos(user?.id, conversationId);
      clearDraft(user?.id, conversationId);
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
        setUploadProgress(t("messenger.input.subiendo", { n: i + 1, total: files.length, name: pf.file.name, tamano: formatFileSize(pf.file.size) }));
        setUploadPercent(0);
        // La clave se SANEA; el nombre que ve la gente sigue siendo el original
        // (se manda aparte, más abajo). Meter el nombre crudo acá era el bug:
        // macOS nombra las capturas con un espacio invisible (U+202F) y Storage
        // rechaza la clave entera. Cualquier tilde o eñe la rompía igual.
        const path = `${user!.id}/${Date.now()}-${claveSeguraParaArchivo(pf.file.name)}`;

        // Use XHR for files > 5MB for progress, SDK (con reintento) for small files
        let uploadError: string | null = null;
        if (pf.file.size > 5 * 1024 * 1024) {
          const result = await uploadFileWithProgress(pf.file, path);
          uploadError = result.error;
        } else {
          // Reintenta: la conexión del equipo corta la respuesta a ratos y antes
          // la imagen fallaba de un tiro (ver uploadSmallWithRetry).
          const result = await uploadSmallWithRetry(pf.file, path);
          uploadError = result.error;
        }

        if (uploadError === "cancelled") {
          toast(t("messenger.input.subidaCancelada"));
          subiendoRef.current = false;
          void guardarAdjuntos(user?.id, conversationId, pendingFiles.map((f) => f.file));
          if (docAntes) setDraft(user?.id, conversationId, text, docAntes);
          setUploading(false);
          setUploadProgress("");
          setUploadPercent(0);
          return;
        }
        if (uploadError) {
          toast.error(t("messenger.input.errorAlSubir", { name: pf.file.name, error: uploadError }));
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
        emitir(msgContent, pf.type as ChatMessage["type"], urlData.publicUrl, pf.file.name, replyTo?.id, isImg ? albumId : undefined);
      }
      subiendoRef.current = false;
      // Programar: si no quedó (la base dijo que no), el borrador vuelve tal
      // cual —texto y archivos—, como cuando se cancela una subida.
      if (cuando && (anotados.length === 0 || !(await onProgramar!(anotados, cuando)))) {
        void guardarAdjuntos(user?.id, conversationId, pendingFiles.map((f) => f.file));
        if (docAntes) setDraft(user?.id, conversationId, text, docAntes);
        setUploading(false);
        setUploadProgress("");
        setUploadPercent(0);
        return;
      }
      // Si la persona ya se fue del chat, no se toca nada: lo guardado se olvidó
      // al arrancar, y lo que haya ahora es un borrador NUEVO de otro cajón.
      if (!montadoRef.current) return;
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
    emitir(text.trim(), "text", undefined, undefined, replyTo?.id, undefined, undefined, rich);
    if (cuando && !(await onProgramar!(anotados, cuando))) return;
    clearDraft(user?.id, conversationId);
    setText("");
    composerRef.current?.clear();
    onCancelReply();
    // clear() dispara onUpdate y re-arma el timer; hay que matarlo o dentro de
    // 3s dispara un `false` de más sobre el mensaje siguiente.
    clearTimeout(typingTimeout.current);
    onSendTyping(false);
    composerRef.current?.focus();
  }, [text, replyTo, onSendMessage, onCancelReply, onSendTyping, pendingFiles, user, uploadFileWithProgress, uploading, t, conversationId, onProgramar]);

  // Ojo: NO pasarle el evento. `onClick={enviarOProgramar}` le daría el clic
  // como «cuando» y programaría en vez de mandar.
  const handleSend = useCallback(() => { void enviarOProgramar(); }, [enviarOProgramar]);
  const programarPara = useCallback((cuando: Date) => { void enviarOProgramar(cuando); }, [enviarOProgramar]);
  const hayQueMandar = !!text.trim() || pendingFiles.length > 0;

  // En el TELÉFONO no hay lugar para la flechita: se programa manteniendo
  // apretado «Enviar», como en Google Chat. El toque corto manda.
  const [menuProgramar, setMenuProgramar] = useState(false);
  const apretado = useRef<number | null>(null);
  const fueLargo = useRef(false);
  const alApretar = () => {
    if (!onProgramar) return;
    fueLargo.current = false;
    apretado.current = window.setTimeout(() => {
      fueLargo.current = true;
      setMenuProgramar(true);
    }, 500);
  };
  const alSoltar = () => {
    if (apretado.current) window.clearTimeout(apretado.current);
    apretado.current = null;
  };

  // El editor rico avisa el texto PLANO y dónde está el cursor dentro de ese texto;
  // con eso siguen andando el borrador, el indicador de "escribiendo" y las @menciones.
  const handleComposerUpdate = useCallback((plain: string, cursorPlain: number, cambioDeTexto: boolean, doc: JSONContent) => {
    setText(plain);
    setCursorPosition(cursorPlain);
    // Mover el cursor NO es escribir: sin esta guarda, hacer clic en el cajón ya
    // le anunciaba "está escribiendo" a la otra persona.
    if (!cambioDeTexto) return;
    // El borrador se guarda en CADA cambio de texto, venga de donde venga
    // (tecleo, emoji, script, mención): todo pasa por el editor. Vacío lo borra.
    setDraft(user?.id, conversationId, plain, doc);
    onSendTyping(true);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onSendTyping(false), APAGAR_ESCRIBIENDO_MS);
  }, [onSendTyping, user?.id, conversationId]);

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
      toast.error(t("messenger.input.errorNotaDeVoz"));
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(path);
    const mins = Math.floor(durationSec / 60);
    const secs = durationSec % 60;
    onSendMessage(`🎤 Nota de voz (${mins}:${secs.toString().padStart(2, "0")})`, "file" as ChatMessage["type"], urlData.publicUrl, fileName);
    setIsRecording(false);
    setUploading(false);
  }, [user, onSendMessage, t]);

  return (
    // Borde inferior en el iPhone instalado: el área segura son 34 pt, pero el
    // indicador de inicio ocupa solo los últimos ~13; con 12 pt menos la barra
    // queda pegada abajo como en Android y no choca con el gesto (24 pt menos: quedan
    // 10 pt, justo por encima del indicador de inicio, que mide 5 pt a 8 del borde). En Android y
    // escritorio el inset es 0 y esto vale 0.
    <div className="shrink-0 bg-primary/[0.03] pb-[max(0px,calc(env(safe-area-inset-bottom,0px)-24px))]">
      {/* Reply bar */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 animate-fade-in">
          <div className="h-8 w-1 rounded-full bg-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-primary">
              {replyTo.sender_id === user?.id && replyTo.api_key_id == null
                ? t("messenger.preview.tu")
                : remitenteVisible(replyTo, profiles, t).nombre}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">{replyTo.content}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onCancelReply} aria-label={t("composer.cancelReply")}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* File previews with sizes */}
      {pendingFiles.length > 0 && (
        <div className="bg-primary/[0.03]">
          <div className="flex items-center justify-between px-4 pt-2 pb-1">
            <span className="text-[11px] text-muted-foreground font-medium">
              {t("messenger.input.adjuntos", { n: pendingFiles.length, max: MAX_FILES })}
            </span>
            <Button variant="ghost" size="sm" className="h-5 text-[10px] text-destructive hover:text-destructive" onClick={() => {
              pendingFiles.forEach(pf => { if (pf.preview) URL.revokeObjectURL(pf.preview); });
              setPendingFiles([]);
            }}>
              {t("messenger.input.quitarTodos")}
            </Button>
          </div>
          <div className="flex gap-2 px-4 pb-2 overflow-x-auto">
            {pendingFiles.map((pf, i) => (
              <div key={i} className="relative shrink-0 group/file">
                {pf.preview ? (
                  // decoding="sync", no "async": la miniatura PARPADEABA al escribir
                  // (Jhon, 10/09). No era React —un MutationObserver sobre la tira
                  // registró 0 mutaciones tecleando 25 letras—, era el pintado: cada
                  // tecla cambia el alto del compositor, Chrome invalida la capa de la
                  // imagen y el decodificado asíncrono pinta un frame vacío hasta tener
                  // el bitmap. A 64 px, decodificar en el hilo principal no cuesta nada.
                  <img src={pf.preview} alt={pf.file.name} decoding="sync" className="h-16 w-16 object-cover rounded-2xl" />
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
                  aria-label={t("messenger.input.quitarArchivo", { name: pf.file.name })}
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
              {t("common.cancel")}
            </Button>
          </div>
          {uploadPercent > 0 && (
            <Progress value={uploadPercent} className="h-1.5" indicatorClassName="bg-primary" />
          )}
        </div>
      )}

      {/* Barra de emojis ARRIBA (personalizable, scope "messenger"). Reemplaza el popover.
          Solo en escritorio: en el teléfono los emojis, GIF y stickers van en UN botón
          (Expresiones), como WhatsApp. Decisión de Jhon (06/09/2026). */}
      {!isRecording && !isMobile && (
        <div>
          <EmojiBar
            emojis={messengerEmojis}
            onPick={(e) => composerRef.current?.insertText(e)}
            onAdd={(e) => setMessengerEmojis((curr) => (curr.includes(e) ? curr : [...curr, e]))}
            onRemove={(e) => setMessengerEmojis((curr) => curr.filter((x) => x !== e))}
            // Solo el CONTENIDO del popup del «+»: el selector de Google. La barra,
            // su lugar y lo que hace elegir ahí (sumar a la barra) no cambian.
            selector={({ enLaBarra, onAgregar }) => (
              <SelectorDeEmojis
                className="h-[min(26rem,60vh)]"
                deshabilitados={enLaBarra}
                motivoDeshabilitado={t("chatters.emoji.alreadyInBar")}
                onElegir={onAgregar}
                enfocarBusqueda
              />
            )}
          />
        </div>
      )}

      {/* Composer: texto AL MEDIO, acciones ABAJO (adjuntar · GIF · sticker · Scripts · mic) +
          Enviar a la derecha. NO se tocó la lógica de envío/voz/menciones/upload. */}
      {/* En la ventanita (compacto) van 6 px abajo, no 2: el anillo de contraste
          al enfocar mide 2 px a 2 px del cajón, y la ventana tiene overflow-hidden —
          con pb-0.5 el aro salía recortado plano por abajo (Jhon, 15/09). */}
      <div className={cn("px-3 pt-2.5", compacto ? "pb-1.5" : isMobile ? "pb-0.5" : "pb-2.5")}>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} multiple accept="*/*" />
        {/* Cámara del teléfono: `capture` abre la cámara directo en iOS/Android. */}
        <input ref={cameraInputRef} type="file" className="hidden" onChange={handleFileSelect} accept="image/*,video/*" capture="environment" />
        {isRecording ? (
          <VoiceNoteRecorder
            isRecording={isRecording}
            onStartRecording={() => setIsRecording(true)}
            onSend={handleVoiceNoteSend}
            onCancel={() => setIsRecording(false)}
          />
        ) : isMobile ? (
          /* ---- TELÉFONO: una fila, como WhatsApp (decisión de Jhon 06/09/2026) ----
             + adjunta · el cajón lleva dentro, a la derecha, emojis/GIF/stickers ·
             cámara · y a la derecha del todo el micrófono, que pasa a Enviar cuando
             hay texto o adjuntos. Formato y Scripts quedan solo en escritorio. */
          <div className="flex items-end gap-1">
            <Button
              variant="ghost" size="icon"
              className={cn("h-10 shrink-0 rounded-full text-foreground/90 hover:bg-primary/8", compacto ? "w-9" : "w-10")}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title={t("messenger.input.adjuntarArchivo")}
              aria-label={t("messenger.input.adjuntarArchivo")}
            >
              {uploading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Plus className="h-7 w-7" strokeWidth={2.25} />}
            </Button>
            <div className="relative min-w-0 flex-1">
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
              {/* En la ventanita (336 px) el cajón quedaba con casi nada de sitio para
                  escribir: fuera la "A" de formato (queda en teléfono y escritorio) y
                  el hueco de la derecha pasa a ser de un solo botón (Jhon, 15/09). */}
              <div className={cn(
                "msg-composer-wrap w-full min-w-0 overflow-hidden bg-primary/5 rounded-[22px] py-2.5 focus-within:ring-1 focus-within:ring-primary/30",
                compacto ? "pl-3 pr-11" : "px-4 pr-[76px]",
              )}>
                <RichComposer
                  ref={composerRef}
                  initialContent={getDraftDoc(user?.id, conversationId)}
                  placeholder={chatType === "group" ? t("messenger.input.placeholderGrupo") : t("messenger.input.placeholder")}
                  showToolbar={showToolbar}
                  disabled={uploading}
                  onUpdate={handleComposerUpdate}
                  onEnter={handleSend}
                  onPasteFiles={addFilesInternal}
                />
              </div>
              {/* Dentro del cajón, a la derecha: emojis/GIF/stickers y, al lado, formato.
                  bottom-1.5 = (44 − 32) / 2: centrados en el cajón de una línea; si el
                  texto crece se quedan abajo, como en WhatsApp. */}
              <Expresiones
                className={cn("absolute bottom-1.5 h-8 w-8 text-foreground/90", compacto ? "right-1.5" : "right-[42px]")}
                iconClassName="h-[23px] w-[23px]"
                favoritos={messengerEmojis}
                onEmoji={(e) => composerRef.current?.insertText(e)}
                onGif={sendGifUrl}
                onSticker={sendStickerUrl}
                disabled={uploading}
              />
              {!compacto && (
                <Button
                  variant="ghost" size="icon"
                  className={cn(
                    "absolute bottom-1.5 right-1.5 h-8 w-8 rounded-full hover:bg-primary/8",
                    showToolbar ? "bg-primary/15 text-primary" : "text-foreground/90",
                  )}
                  onClick={() => setShowToolbar((v) => !v)}
                  title={t("messenger.input.opcionesFormato")}
                  aria-label={t("messenger.input.opcionesFormato")}
                >
                  <Baseline className="h-[22px] w-[22px]" strokeWidth={2.1} />
                </Button>
              )}
            </div>
            {/* La cámara se va al escribir, como en WhatsApp: el hueco es para el
                mensaje. El micrófono ya se volvía "enviar" con la misma condición;
                la cámara se quedaba y en la ventanita (336 px) sobraba (Jhon, 16/09). */}
            {!(text.trim() || pendingFiles.length > 0) && (
              <Button
                variant="ghost" size="icon"
                className="h-10 w-9 shrink-0 rounded-full text-foreground/90 hover:bg-primary/8"
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploading}
                title={t("messenger.input.camara")}
                aria-label={t("messenger.input.camara")}
              >
                <Camera className="h-[26px] w-[26px]" strokeWidth={2.1} />
              </Button>
            )}
            {text.trim() || pendingFiles.length > 0 ? (
              <div className="relative shrink-0">
                <Button
                  size="icon"
                  // Toque corto: manda. Mantener apretado: «Programar envío».
                  onClick={() => {
                    if (fueLargo.current) { fueLargo.current = false; return; }
                    handleSend();
                  }}
                  onPointerDown={alApretar}
                  onPointerUp={alSoltar}
                  onPointerLeave={alSoltar}
                  onContextMenu={onProgramar ? (e) => e.preventDefault() : undefined}
                  className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-accent to-primary text-white shadow-sm hover:opacity-90 transition-all"
                  disabled={uploading}
                  title={t("common.send")}
                  aria-label={t("common.send")}
                >
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </Button>
                {onProgramar && (
                  <ProgramarEnvio
                    onProgramar={programarPara}
                    alineado="end"
                    abierto={menuProgramar}
                    onAbiertoCambia={setMenuProgramar}
                  >
                    {/* Solo para ubicar el menú encima de «Enviar»: lo abre el
                        apretón largo, no un toque. */}
                    <span aria-hidden className="pointer-events-none absolute right-0 top-0 h-px w-px" />
                  </ProgramarEnvio>
                )}
              </div>
            ) : (
              <Button
                variant="ghost" size="icon"
                className="h-10 w-9 shrink-0 rounded-full text-foreground/90 hover:bg-primary/8"
                onClick={() => setIsRecording(true)}
                title={t("messenger.input.grabarNotaDeVoz")}
                aria-label={t("messenger.input.grabarNotaDeVoz")}
              >
                <Mic className="h-[26px] w-[26px]" strokeWidth={2.1} />
              </Button>
            )}
          </div>
        ) : (
          /* ---- ESCRITORIO: texto al medio, acciones abajo (formato · adjuntar · GIF ·
             sticker · Scripts · mic) + Enviar dentro del cajón. Sin cambios. ---- */
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
              <div className={cn(
                "msg-composer-wrap w-full min-w-0 overflow-hidden bg-primary/5 rounded-2xl px-4 py-2.5 focus-within:ring-1 focus-within:ring-primary/30",
                onProgramar ? "pr-[4.5rem]" : "pr-12",
              )}>
                <RichComposer
                  ref={composerRef}
                  initialContent={getDraftDoc(user?.id, conversationId)}
                  placeholder={chatType === "group" ? t("messenger.input.placeholderGrupo") : t("messenger.input.placeholder")}
                  showToolbar={showToolbar}
                  disabled={uploading}
                  onUpdate={handleComposerUpdate}
                  onEnter={handleSend}
                  onPasteFiles={addFilesInternal}
                />
              </div>
              {onProgramar ? (
                // Enviar y su pestañita de «Programar envío», una sola píldora
                // como en Google Chat: la flecha es parte del botón.
                <div className={cn(
                  "absolute bottom-[7px] right-2 flex h-7 overflow-hidden rounded-full bg-gradient-to-br from-accent to-primary text-white shadow-sm",
                  (uploading || !hayQueMandar) && "opacity-50",
                )}>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={uploading || !hayQueMandar}
                    title={t("common.send")}
                    aria-label={t("common.send")}
                    className="inline-flex w-7 items-center justify-center transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80 disabled:pointer-events-none"
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                  <ProgramarEnvio onProgramar={programarPara} alineado="end">
                    <button
                      type="button"
                      disabled={uploading || !hayQueMandar}
                      title={t("shared.schedule.title")}
                      aria-label={t("shared.schedule.title")}
                      className="inline-flex w-5 items-center justify-center border-l border-white/30 transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80 disabled:pointer-events-none data-[state=open]:bg-white/20"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </ProgramarEnvio>
                </div>
              ) : (
                <Button
                  size="icon"
                  onClick={handleSend}
                  className="absolute bottom-[7px] right-2 h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-accent to-primary text-white shadow-sm hover:opacity-90 transition-all"
                  disabled={uploading || !hayQueMandar}
                  title={t("common.send")}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost" size="icon"
                className={cn(
                  "h-9 w-9 shrink-0 rounded-full hover:bg-primary/8",
                  showToolbar ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setShowToolbar((v) => !v)}
                title={t("messenger.input.opcionesFormato")}
              >
                <Baseline className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost" size="icon"
                className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-primary/8 hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title={t("messenger.input.adjuntarArchivo")}
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
                title={t("messenger.input.grabarNotaDeVoz")}
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
