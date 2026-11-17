import { useState, useRef, useEffect } from "react";
import { useAutoGrowTextarea, MAX_TEXTAREA_PX } from "@/hooks/useAutoGrowTextarea";
import { X, Send, Paperclip, FileText, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LKChatMessage, MAX_ARCHIVO_CHAT_MB } from "@/hooks/useLiveKit";
import { useLanguage } from "@/hooks/useLanguage";

interface CallChatSidebarProps {
  messages: LKChatMessage[];
  onSend: (text: string) => void;
  onClose: () => void;
  localIdentity: string;
  /** Mandar un archivo al chat (por LiveKit, persona a persona). Sin esto no
   *  se muestra el clip. */
  onSendFile?: (file: File, onProgress?: (p: number) => void) => Promise<void>;
}

function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CallChatSidebar({ messages, onSend, onClose, localIdentity, onSendFile }: CallChatSidebarProps) {
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const archivoRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<{ nombre: string; pct: number } | null>(null);

  const mandarArchivo = async (file: File | undefined) => {
    if (!file || !onSendFile) return;
    if (file.size > MAX_ARCHIVO_CHAT_MB * 1024 * 1024) {
      toast.error(t("messenger.callChat.archivoGrande", { mb: MAX_ARCHIVO_CHAT_MB }));
      return;
    }
    setSubiendo({ nombre: file.name, pct: 0 });
    try {
      await onSendFile(file, (p) => setSubiendo({ nombre: file.name, pct: Math.round(p * 100) }));
    } catch {
      toast.error(t("messenger.callChat.noSeEnvio"));
    } finally {
      setSubiendo(null);
      if (archivoRef.current) archivoRef.current.value = "";
    }
  };
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Mismo auto-grow que Messenger: el cajón crece con el texto en vez de dejar
  // el mensaje corriendo en una sola línea invisible.
  useAutoGrowTextarea(inputRef, input, MAX_TEXTAREA_PX);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter envía, Shift+Enter hace renglón — igual que Messenger.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-80 max-sm:absolute max-sm:inset-y-0 max-sm:right-0 max-sm:w-full max-sm:z-30 flex flex-col bg-background border-l border-secondary rounded-l-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-secondary">
        <h3 className="text-sm font-medium text-foreground">{t("messenger.callChat.titulo")}</h3>
        <button onClick={onClose} aria-label={t("common.close")} className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-3">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              {t("messenger.callChat.vacio")}
            </p>
          )}
          {messages.map((msg) => {
            const isMe = msg.sender === localIdentity;
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                {!isMe && (
                  <span className="text-[10px] text-muted-foreground mb-0.5">{msg.senderName}</span>
                )}
                <div
                  className={`rounded-2xl px-3 py-1.5 max-w-[85%] text-sm whitespace-pre-wrap break-words ${
                    isMe
                      ? "bg-primary text-white rounded-br-md"
                      : "bg-secondary text-foreground rounded-bl-md"
                  }`}
                >
                  {msg.archivo ? (
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 shrink-0 opacity-80" />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">{msg.archivo.nombre}</div>
                        <div className="text-[10px] opacity-70">
                          {msg.archivo.url ? pesoLegible(msg.archivo.tamano) : t("messenger.callChat.archivoAntes")}
                        </div>
                      </div>
                      {msg.archivo.url && (
                        <a
                          href={msg.archivo.url}
                          download={msg.archivo.nombre}
                          aria-label={t("messenger.callChat.descargar")}
                          title={t("messenger.callChat.descargar")}
                          className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center hover:bg-black/10"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  ) : msg.content}
                </div>
                <span className="text-[9px] text-muted-foreground mt-0.5">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-secondary">
        {subiendo && (
          <p className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            {t("messenger.callChat.enviando", { name: subiendo.nombre, pct: subiendo.pct })}
          </p>
        )}
        <div className="flex gap-2 items-end">
          {onSendFile && (
            <>
              <input
                ref={archivoRef}
                type="file"
                className="hidden"
                onChange={(e) => void mandarArchivo(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => archivoRef.current?.click()}
                disabled={!!subiendo}
                aria-label={t("messenger.callChat.adjuntar")}
                title={t("messenger.callChat.adjuntar")}
                className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-40 shrink-0"
              >
                <Paperclip className="h-4 w-4" />
              </button>
            </>
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={t("messenger.input.placeholder")}
            className="flex-1 min-h-[36px] max-h-[160px] resize-none overflow-y-auto bg-card border border-border rounded-2xl px-3.5 py-2 text-sm leading-5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            aria-label={t("common.send")}
            className="h-9 w-9 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40 shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
