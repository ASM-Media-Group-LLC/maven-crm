import {
  useEffect, useId, useRef, useState,
  type ReactNode, type KeyboardEvent, type ClipboardEvent, type ChangeEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Paperclip, X as XIcon, Play } from "lucide-react";
import { EmojiBar } from "@/pages/chatter-evaluator/workspace/EmojiBar";

// Composer unificado para los 3 chats de Maven (bandeja WhatsApp, Messenger, Chatter
// Evaluator). Layout pedido por el owner: emojis ARRIBA · cajón de texto AL MEDIO (auto-crece)
// · acciones ABAJO (adjuntar + tools de cada superficie + Enviar a la derecha).
//
// Maneja de forma centralizada (igual en las 3 superficies):
//   - barra de emojis personalizable (no roba foco; al insertar vuelve el foco al textarea
//     → Enter ENVÍA, no re-inserta el emoji)
//   - textarea que crece con el texto (hasta un máximo) y Enter envía / Shift+Enter salto
//   - PEGAR imagen/video del portapapeles → se stagea como adjunto con preview (+ caption) y
//     se manda al enviar. También el botón de adjuntar stagea (mismo preview).
//   - onSend(text, files): la superficie sube los archivos a SU bucket y manda el mensaje;
//     si throwea, el composer conserva el texto/adjuntos. Si resuelve, limpia.
//
// Cada superficie pasa sus tools propias (GIF/sticker/tip/mic…) por `toolbarExtra` — esas
// mandan directo (no se stagean). GIF/sticker son URLs, no archivos con caption.

export interface ComposerAttachment {
  id: string;
  file: File;
  url: string; // object URL para el preview
  isVideo: boolean;
}

interface ChatComposerProps {
  value: string;
  onChange: (v: string) => void;
  /** Sube los `files` (si hay) y manda el mensaje con el `text`. Throw = no limpiar. */
  onSend: (text: string, files: File[]) => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  /** Spinner externo (p.ej. mientras la superficie sube media por su cuenta). */
  busy?: boolean;
  // barra de emojis (estado lo maneja la superficie: localStorage o backend)
  emojis: string[];
  onAddEmoji: (e: string) => void;
  onRemoveEmoji: (e: string) => void;
  /** Empujado al borde derecho de la barra de emojis (p.ej. zoom de fuente A−/A+). */
  emojiTrailing?: ReactNode;
  /** Botones propios de la superficie (GIF, sticker, tip, mic…) — van a la izquierda del Enviar. */
  toolbarExtra?: ReactNode;
  /** Barra de cita (reply) que renderiza la superficie, o null. */
  replyBar?: ReactNode;
  /** Tipos aceptados para adjuntar/pegar. Default imágenes + video. */
  accept?: string;
}

const MAX_TEXTAREA_PX = 160; // ~6 líneas; arriba de eso, scroll interno

export const ChatComposer = ({
  value, onChange, onSend, placeholder, disabled, busy,
  emojis, onAddEmoji, onRemoveEmoji, emojiTrailing, toolbarExtra, replyBar,
  accept = "image/*,video/*",
}: ChatComposerProps) => {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ComposerAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputId = useId();

  // Auto-grow del textarea según el contenido.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [value]);

  // Limpia los object URLs al desmontar.
  useEffect(() => () => { pending.forEach((p) => URL.revokeObjectURL(p.url)); }, [pending]);

  const addFiles = (files: File[]) => {
    const media = files.filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (media.length === 0) return;
    setPending((prev) => [
      ...prev,
      ...media.map((file, i) => ({
        id: `${Date.now()}-${i}-${file.name}`,
        file,
        url: URL.createObjectURL(file),
        isVideo: file.type.startsWith("video/"),
      })),
    ]);
    taRef.current?.focus();
  };

  const removeAttachment = (id: string) => {
    setPending((prev) => {
      const hit = prev.find((p) => p.id === id);
      if (hit) URL.revokeObjectURL(hit.url);
      return prev.filter((p) => p.id !== id);
    });
  };

  const clear = () => {
    setPending((prev) => { prev.forEach((p) => URL.revokeObjectURL(p.url)); return []; });
  };

  const canSend = (value.trim().length > 0 || pending.length > 0) && !disabled && !sending && !busy;

  const doSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend(value.trim(), pending.map((p) => p.file));
      onChange("");
      clear();
    } catch {
      // la superficie muestra el toast de error; mantenemos texto + adjuntos para reintentar
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void doSend();
    }
  };

  // Pegar imagen/video del portapapeles → se stagea como adjunto (no se manda solo).
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files: File[] = [];
    for (const it of items) {
      if (it.kind === "file" && (it.type.startsWith("image/") || it.type.startsWith("video/"))) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault(); // no pegar el "blob" como texto
      addFiles(files);
    }
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) addFiles(files);
  };

  const spinning = sending || busy;

  return (
    <div className="border-t bg-card">
      {/* 1) Emojis arriba (personalizable; al insertar vuelve el foco al textarea). */}
      <EmojiBar
        emojis={emojis}
        onPick={(e) => { onChange(value + e); taRef.current?.focus(); }}
        onAdd={onAddEmoji}
        onRemove={onRemoveEmoji}
        trailing={emojiTrailing}
      />

      <div className="space-y-2 p-2">
        {replyBar}

        {/* Preview de adjuntos pegados/elegidos (con caption + se mandan al enviar). */}
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pending.map((a) => (
              <div key={a.id} className="relative h-16 w-16 overflow-hidden rounded-md border border-border bg-muted">
                {a.isVideo ? (
                  <>
                    <video src={a.url} className="h-full w-full object-cover" muted playsInline />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <Play className="h-5 w-5 fill-current text-white drop-shadow" />
                    </div>
                  </>
                ) : (
                  <img src={a.url} alt="" className="h-full w-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl bg-black/60 text-white hover:bg-black/80"
                  title="Quitar"
                  aria-label="Quitar adjunto"
                >
                  <XIcon className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 2) Cajón de texto al medio (crece con el contenido). Enviar va DENTRO del cajón, borde derecho. */}
        <div className="relative">
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="block min-h-[42px] w-full resize-none rounded-2xl border-0 bg-primary/5 px-4 py-2.5 pr-12 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
            style={{ maxHeight: MAX_TEXTAREA_PX }}
          />
          <Button
            type="button"
            onClick={() => void doSend()}
            disabled={!canSend}
            size="icon"
            className="absolute bottom-[7px] right-2 h-7 w-7 rounded-full bg-gradient-to-br from-accent to-primary text-white shadow-sm hover:opacity-90"
            title="Enviar"
          >
            {spinning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>

        {/* 3) Acciones abajo: adjuntar + tools de la superficie + Enviar (derecha). */}
        <div className="flex items-center gap-1">
          <input ref={fileRef} id={fileInputId} type="file" accept={accept} multiple className="hidden" onChange={onFileInput} />
          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            size="icon"
            variant="ghost"
            className="h-9 w-9 text-muted-foreground"
            disabled={disabled}
            title="Adjuntar foto / video"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          {toolbarExtra}
        </div>
      </div>
    </div>
  );
};

export default ChatComposer;
