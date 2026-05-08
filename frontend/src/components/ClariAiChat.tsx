import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Send, Bot, User, Loader2, Mic, MicOff } from "lucide-react";

// Avatar de Clari renderizado desde /clari-avatar.png con fallback a
// Bot icon si la imagen no carga. Usado en las burbujas del chat y en
// el indicador "escribiendo…" para coherencia con el FAB.
const ClariBubbleAvatar = ({ size = 32 }: { size?: number }) => {
  const [errored, setErrored] = useState(false);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-accent-foreground shadow-sm"
      style={{ width: size, height: size }}
    >
      {errored ? (
        <Bot style={{ width: size * 0.5, height: size * 0.5 }} />
      ) : (
        <img
          src="/clari-avatar.png"
          alt="Clari"
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      )}
    </span>
  );
};
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { useAiMessages } from "@/hooks/useAiConversations";
import { usePermissions } from "@/hooks/usePermissions";
import { useUserRole } from "@/hooks/useUserRole";

type Msg = { role: "user" | "assistant"; content: string };

import { supabase } from "@/integrations/supabase/client";

// Endpoints disponibles para reusar este chat con distintos backends.
//   ai-sales-chat: agente con datos del negocio (creadoras/earnings).
//                  Lo usa el tab "Asistente IA" de Finanzas.
//   clari-help:    asistente de soporte de Maven (how-to + permisos).
//                  Lo usa el FAB global.
const ENDPOINT_URLS = {
  "ai-sales-chat": `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-sales-chat`,
  "clari-help": `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clari-help`,
} as const;

type EndpointKey = keyof typeof ENDPOINT_URLS;

interface UserContextPayload {
  role: string | null;
  isAdmin: boolean;
  permissions: Array<{
    module: string;
    submodule: string | null;
    can_access: boolean;
  }>;
}

// El welcome cambia según el backend para que el primer turno deje
// claro qué tipo de asistente es éste. Mantenemos los mensajes cortos
// — el system prompt ya cubre las reglas de redirección a otros agentes.
const welcomeFor = (endpoint: EndpointKey): Msg => {
  if (endpoint === "clari-help") {
    return {
      role: "assistant",
      content:
        "¡Hola! 👋 Soy Clari. Te ayudo a navegar Maven — preguntame cómo hacer cualquier cosa en la app.",
    };
  }
  return {
    role: "assistant",
    content:
      "¡Hola! 👋 Soy tu asistente de ventas. Pedime rankings, comparativas o tendencias de tus creadoras. Ej: *¿quién factura más esta semana?*",
  };
};

async function streamChat({
  endpoint,
  messages,
  userContext,
  onDelta,
  onDone,
  onError,
  config,
}: {
  endpoint: EndpointKey;
  messages: Msg[];
  userContext: UserContextPayload | null;
  onDelta: (t: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
  config?: { customInstructions?: string; tone?: string; model?: string };
}) {
  // Get the user's session token for authenticated access
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const resp = await fetch(ENDPOINT_URLS[endpoint], {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ messages, config, userContext }),
  });

  if (!resp.ok) {
    let errorMsg = "Error al conectar con la IA";
    try {
      const body = await resp.json();
      if (body.error) errorMsg = body.error;
    } catch {}
    onError(errorMsg);
    return;
  }

  if (!resp.body) { onError("Sin respuesta"); return; }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let done = false;

  while (!done) {
    const { done: rd, value } = await reader.read();
    if (rd) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") { done = true; break; }
      try {
        const parsed = JSON.parse(json);
        const c = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (c) onDelta(c);
      } catch {
        buf = line + "\n" + buf;
        break;
      }
    }
  }
  onDone();
}

// Detect Speech API support
const SpeechRecAPI: any =
  typeof window !== "undefined"
    ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null)
    : null;

interface ClariAiChatProps {
  mode?: "full" | "panel";
  conversationId?: string | null;
  onMessageSaved?: () => void;
  onConversationTitleSet?: (title: string) => void;
  onAutoCreate?: () => Promise<string | null>;
  /** Backend a usar. Default "ai-sales-chat" para no romper consumidores
   *  existentes; el FAB global pasa "clari-help". */
  endpoint?: EndpointKey;
}

const ClariAiChat = ({
  mode = "full",
  conversationId,
  onMessageSaved,
  onConversationTitleSet,
  onAutoCreate,
  endpoint = "ai-sales-chat",
}: ClariAiChatProps) => {
  const { messages: dbMessages, saveMessage, updateConversationTitle } = useAiMessages(conversationId ?? null);
  const WELCOME = welcomeFor(endpoint);
  const [localMessages, setLocalMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [titleSet, setTitleSet] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Permisos + rol del usuario para que clari-help dé respuestas
  // role-aware. Para ai-sales-chat el backend ignora userContext.
  const { permissions } = usePermissions();
  const { role, isAdmin } = useUserRole();
  const userContext: UserContextPayload = {
    role: role ?? null,
    isAdmin,
    permissions: permissions.map((p) => ({
      module: p.module,
      submodule: p.submodule,
      can_access: p.can_access,
    })),
  };

  // Unified sync: load messages from DB or reset.
  //
  // BUG fix: dbMessages venía de useAiMessages como nuevo array cada
  // render (referencia inestable). Como estaba en el deps array, el
  // effect corría en cada render → reseteaba localMessages a [WELCOME]
  // borrando los mensajes que el usuario acababa de tipear. Ahora
  // depende solo de `conversationId` y la LONGITUD de dbMessages
  // (primitivo, estable). Si los mensajes del DB se editan in-place
  // sin cambiar el count, igual no se rebobinan acá; suficiente para
  // el flujo del FAB y el AiSales tab.
  useEffect(() => {
    if (!conversationId) {
      setTitleSet(false);
      setLocalMessages([WELCOME]);
      return;
    }
    if (dbMessages.length > 0) {
      setLocalMessages(dbMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })));
    } else {
      setTitleSet(false);
      setLocalMessages([WELCOME]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, dbMessages.length, endpoint]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [localMessages]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }
    if (!SpeechRecAPI) return;

    const rec = new SpeechRecAPI();
    rec.lang = "es-ES";
    rec.continuous = false;
    rec.interimResults = true;

    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as SpeechRecognitionResultList)
        .map((r: SpeechRecognitionResult) => r[0].transcript)
        .join("");
      setInput(transcript);
    };

    rec.onerror = (e: any) => {
      if (e.error !== "aborted") toast.error("Error de micrófono: " + e.error);
      setIsRecording(false);
    };

    rec.onend = () => setIsRecording(false);
    rec.start();
    setIsRecording(true);
    recognitionRef.current = rec;
  }, [isRecording]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    if (isRecording) recognitionRef.current?.stop();
    setInput("");

    // Auto-create conversation if needed
    let activeConvId = conversationId;
    if (!activeConvId && onAutoCreate) {
      activeConvId = await onAutoCreate();
      if (!activeConvId) return; // creation failed
    }

    const userMsg: Msg = { role: "user", content: text };
    const contextMsgs = localMessages.filter((m) => m !== WELCOME);
    const allMsgs = [...contextMsgs, userMsg];

    setLocalMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Persist user message
    if (activeConvId) {
      try {
        await saveMessage(activeConvId, "user", text);
        // Auto-title from first user message
        if (!titleSet && contextMsgs.length === 0) {
          const autoTitle = text.slice(0, 40) + (text.length > 40 ? "…" : "");
          await updateConversationTitle(activeConvId, autoTitle);
          onConversationTitleSet?.(autoTitle);
          setTitleSet(true);
        }
        onMessageSaved?.();
      } catch (e) {
        console.error("Error saving user message:", e);
      }
    }

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setLocalMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last !== WELCOME) {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      // El modelo y demás config ahora viven server-side en cada Edge
      // Function (Gemini para ai-sales-chat y clari-help). El frontend
      // ya no envía config — eso evita el mismatch que tuvimos cuando
      // el front guardaba modelos Gemini y el backend solo aceptaba
      // Groq.
      await streamChat({
        endpoint,
        userContext,
        messages: allMsgs,
        onDelta: upsert,
        onDone: async () => {
          setIsLoading(false);
          // Persist assistant message
          if (activeConvId && assistantSoFar) {
            try {
              await saveMessage(activeConvId, "assistant", assistantSoFar);
              onMessageSaved?.();
            } catch (e) {
              console.error("Error saving assistant message:", e);
            }
          }
        },
        onError: (msg) => {
          toast.error(msg);
          setIsLoading(false);
        },
      });
    } catch {
      toast.error("Error de conexión");
      setIsLoading(false);
    }
  }, [input, isLoading, isRecording, localMessages, conversationId, titleSet, saveMessage, updateConversationTitle, onMessageSaved, onConversationTitleSet, onAutoCreate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const isPanel = mode === "panel";
  const canChat = isPanel || !!conversationId || !!onAutoCreate;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Chat wallpaper area */}
      <div className="flex-1 overflow-y-auto px-3 py-5" ref={scrollRef}>
        <div className={`space-y-3 ${isPanel ? "" : "mx-auto max-w-3xl"}`}>
          {localMessages.map((m, i) => {
            const isUser = m.role === "user";
            return (
              <div
                key={i}
                className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : ""}`}
              >
                {/* Avatar */}
                {isUser ? (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                    <User className="h-4 w-4" />
                  </div>
                ) : (
                  <ClariBubbleAvatar size={32} />
                )}

                {/* Bubble */}
                <div
                  className={`relative max-w-[85%] shadow-sm ${
                    isUser
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
                      : "bg-card text-card-foreground border border-border/50 rounded-2xl rounded-bl-md"
                  } ${isPanel ? "px-3 py-2.5" : "px-4 py-3"}`}
                >
                  {/* Tail notch */}
                  {!isUser && (
                    <div className="absolute -left-1.5 bottom-1 w-3 h-3 bg-card border-l border-b border-border/50 rotate-45" />
                  )}
                  {isUser && (
                    <div className="absolute -right-1.5 bottom-1 w-3 h-3 bg-primary rotate-45" />
                  )}

                  {m.role === "assistant" ? (
                    <div className="ai-chat-content relative z-10">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed relative z-10">{m.content}</p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing indicator */}
          {isLoading && localMessages[localMessages.length - 1]?.role === "user" && (
            <div className="flex items-end gap-2">
              <ClariBubbleAvatar size={32} />
              <div className="flex items-center gap-2 bg-card border border-border/50 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input bar */}
      <div className="border-t border-border bg-card/80 backdrop-blur-sm p-3">
        <div className={`flex items-end gap-2 ${isPanel ? "" : "mx-auto max-w-3xl"}`}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !canChat
                ? "Crea o selecciona un chat para comenzar…"
                : isRecording
                ? "🎙️ Escuchando…"
                : "Escribe tu pregunta…"
            }
            rows={1}
            className={`flex-1 resize-none rounded-2xl border bg-background px-4 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all ${
              isRecording ? "border-destructive ring-2 ring-destructive/30" : "border-input"
            }`}
          />
          {SpeechRecAPI && (
            <Button
              onClick={toggleRecording}
              variant="outline"
              size="icon"
              disabled={!canChat}
              className={`h-10 w-10 shrink-0 rounded-full transition-all ${
                isRecording
                  ? "border-destructive text-destructive animate-pulse hover:bg-destructive/10"
                  : "hover:bg-accent"
              }`}
              title={isRecording ? "Detener grabación" : "Hablar"}
            >
              {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          )}
          <Button
            onClick={send}
            disabled={!input.trim() || isLoading || !canChat}
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full shadow-md"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ClariAiChat;
