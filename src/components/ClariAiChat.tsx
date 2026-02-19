import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Loader2, Mic, MicOff } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { getAiConfig } from "@/lib/ai-config";

type Msg = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-sales-chat`;

const WELCOME: Msg = {
  role: "assistant",
  content:
    "¡Hola! 👋 Soy tu asistente de ventas con IA. Puedo responder preguntas sobre las creadoras y sus ganancias. Por ejemplo:\n\n- *¿Cuál es la creadora con más ganancias esta semana?*\n- *Muéstrame un resumen de tips por creadora*\n- *¿Cuántos fans activos tiene [creadora]?*\n- *Compara las ganancias de las top 5 creadoras*\n\n¿En qué te puedo ayudar?",
};

async function streamChat({
  messages,
  onDelta,
  onDone,
  onError,
  config,
}: {
  messages: Msg[];
  onDelta: (t: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
  config?: { customInstructions?: string; tone?: string; model?: string };
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages, config }),
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

// Detect Speech API support (cast to any for cross-browser compatibility)
const SpeechRecAPI: any =
  typeof window !== "undefined"
    ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null)
    : null;

interface ClariAiChatProps {
  mode?: "full" | "panel";
}

const ClariAiChat = ({ mode = "full" }: ClariAiChatProps) => {
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Stop recording on unmount
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
      if (e.error !== "aborted") {
        toast.error("Error de micrófono: " + e.error);
      }
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

    // Stop recording if active
    if (isRecording) {
      recognitionRef.current?.stop();
    }

    setInput("");

    const userMsg: Msg = { role: "user", content: text };
    const allMsgs = [...messages.filter((m) => m !== WELCOME), userMsg];
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    let assistantSoFar = "";
    const upsert = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last !== WELCOME) {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const aiConfig = getAiConfig();
      await streamChat({
        messages: allMsgs,
        onDelta: upsert,
        onDone: () => setIsLoading(false),
        onError: (msg) => {
          toast.error(msg);
          setIsLoading(false);
        },
        config: {
          customInstructions: aiConfig.customInstructions,
          tone: aiConfig.tone,
          model: aiConfig.model,
        },
      });
    } catch {
      toast.error("Error de conexión");
      setIsLoading(false);
    }
  }, [input, isLoading, isRecording, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const isPanel = mode === "panel";

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className={`flex-1 px-4 py-4 ${isPanel ? "" : "py-6"}`} ref={scrollRef}>
        <div className={`space-y-4 ${isPanel ? "" : "mx-auto max-w-3xl space-y-6"}`}>
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
              </div>
              <div
                className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                  isPanel ? "max-w-[85%]" : "max-w-[80%] px-4 py-3"
                } ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {m.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-table:my-2">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            </div>
          ))}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Pensando…
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border bg-background p-3">
        <div className={`flex gap-2 ${isPanel ? "" : "mx-auto max-w-3xl"}`}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRecording ? "Escuchando…" : "Pregunta sobre creadoras y ganancias…"}
            rows={1}
            className={`flex-1 resize-none rounded-xl border bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors ${
              isRecording ? "border-destructive" : "border-input"
            }`}
          />
          {SpeechRecAPI && (
            <Button
              onClick={toggleRecording}
              variant="outline"
              size="icon"
              className={`h-10 w-10 shrink-0 rounded-xl transition-colors ${
                isRecording
                  ? "border-destructive text-destructive animate-pulse hover:bg-destructive/10"
                  : ""
              }`}
              title={isRecording ? "Detener grabación" : "Hablar"}
            >
              {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          )}
          <Button
            onClick={send}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ClariAiChat;
