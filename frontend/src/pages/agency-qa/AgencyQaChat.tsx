import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2,
  MessageSquarePlus,
  Send,
  Sparkles,
  Trash2,
  Users,
  User as UserIcon,
  Mic,
  MicOff,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFormato } from "@/hooks/useFormato";
import {
  useCreateQaChatSession,
  useDeleteQaChatSession,
  useQaChatMessages,
  useQaChatSessions,
  useQaClosers,
  useSendQaChatMessage,
  type QaChatScope,
} from "@/hooks/useAgencyQa";

// AgencyQaChat — port del Clari chat de kash. Esta slice cubre UI + persistencia:
// crea sesiones (scope: closer específico o todo el equipo), persiste mensajes
// del user, lista sesiones del usuario actual ordenadas por última actividad.
//
// El response del asistente NO se genera todavía — falta la edge function
// qa-chat-mike + GROQ_API_KEY. Mientras tanto, después de mandar un mensaje,
// aparece una nota "Clari pendiente — falta GROQ_API_KEY" en lugar de la
// respuesta. Cuando se conecte el backend, esa nota se reemplaza por la
// llamada a la edge function que streamea tokens.

const formatRelative = (iso: string, locale: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays < 7) {
    const wd = date
      .toLocaleDateString(locale, { weekday: "short" })
      .replace(".", "");
    return `${wd} ${hh}:${mm}`;
  }
  const day = date.getDate();
  const month = date
    .toLocaleDateString(locale, { month: "short" })
    .replace(".", "");
  return `${day} ${month}`;
};

const sessionTitle = (s: {
  title: string | null;
  scope_type: QaChatScope;
  closer: { name: string } | null;
}): string => {
  if (s.title) return s.title;
  if (s.scope_type === "closer") return `Sobre ${s.closer?.name ?? "(closer)"}`;
  return "Sobre todo el equipo";
};

// MikeAvatar — el muñequito del supervisor IA. La imagen vive en
// /mike-avatar.svg (drop tu PNG en frontend/public/mike-avatar.svg) y
// hace fallback a un círculo con gradient + ícono Sparkles si la
// imagen no carga, así el chat nunca se ve roto.
const MikeAvatar = ({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) => {
  const [errored, setErrored] = useState(false);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm ring-2 ring-amber-500/20",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {errored ? (
        <Sparkles className="h-1/2 w-1/2" />
      ) : (
        <img
          src="/mike-avatar.svg"
          alt="Mike"
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      )}
    </span>
  );
};

// ─── Speech recognition (Web Speech API nativa, sin ElevenLabs) ──────
// El browser expone SpeechRecognition (Firefox / WebKit). En Chrome y
// Safari está bajo `webkitSpeechRecognition`. Lo wrapaeamos en un hook
// minimal: start() comienza a escuchar y los resultados van apareciendo
// como callback `onResult(text)`. Cuando hace stop() o termina la
// oración, dispara onResult con el texto final.

type SpeechRecLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: { transcript: string }[][] & { isFinal?: boolean }[] }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecCtor = new () => SpeechRecLike;

const getSpeechRecognitionCtor = (): SpeechRecCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecCtor;
    webkitSpeechRecognition?: SpeechRecCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

const useSpeechRecognition = ({
  onTranscript,
  onError,
  lang = "es-ES",
}: {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (msg: string) => void;
  lang?: string;
}) => {
  const Ctor = useMemo(() => getSpeechRecognitionCtor(), []);
  const recRef = useRef<SpeechRecLike | null>(null);
  const [listening, setListening] = useState(false);
  const supported = !!Ctor;

  const start = () => {
    if (!Ctor) {
      onError?.("Tu navegador no soporta dictado por voz. Usa Chrome o Safari.");
      return;
    }
    if (recRef.current) {
      // Ya está corriendo — toggle no-op.
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.onresult = (ev) => {
      // recorremos todos los chunks: el navegador acumula resultados
      // parciales hasta que la oración cierra (isFinal=true).
      const results = ev.results as unknown as Array<{
        0: { transcript: string };
        isFinal: boolean;
      }>;
      let interim = "";
      let finalText = "";
      for (let i = 0; i < results.length; i++) {
        const chunk = results[i];
        const txt = chunk[0]?.transcript ?? "";
        if (chunk.isFinal) finalText += txt;
        else interim += txt;
      }
      const text = (finalText + interim).trim();
      if (text) onTranscript(text, !!finalText && !interim);
    };
    rec.onerror = (e) => {
      onError?.(e.error || "Error de reconocimiento de voz.");
      setListening(false);
      recRef.current = null;
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };
    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch (e) {
      onError?.((e as Error).message ?? "No se pudo iniciar el dictado.");
    }
  };

  const stop = () => {
    recRef.current?.stop();
    recRef.current = null;
    setListening(false);
  };

  return { listening, supported, start, stop };
};

const AgencyQaChat = () => {
  const f = useFormato();
  const sessionsQ = useQaChatSessions();
  const closersQ = useQaClosers();
  const createSession = useCreateQaChatSession();
  const deleteSession = useDeleteQaChatSession();
  const sendMessage = useSendQaChatMessage();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [input, setInput] = useState("");
  // Modal estilo Maven para confirmar el borrado de una conversación.
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Dictado por voz: cuando el usuario activa el mic, los chunks
  // reconocidos se anexan al input en vez de reemplazarlo, así puede
  // mezclar tipeo + voz. Guardamos el "anchor" del input cuando arranca
  // el dictado para poder reemplazar solo lo dictado en ese ciclo.
  const dictationAnchorRef = useRef<string>("");
  const speech = useSpeechRecognition({
    onTranscript: (text, _isFinal) => {
      const base = dictationAnchorRef.current;
      const sep = base && !base.endsWith(" ") && !base.endsWith("\n") ? " " : "";
      setInput(base + sep + text);
    },
    onError: (msg) => {
      toast.error("Dictado por voz", { description: msg });
    },
    // Idioma fijo a propósito: es el idioma del dictado por voz, no un formato.
    lang: "es-ES",
  });

  const toggleDictation = () => {
    if (speech.listening) {
      speech.stop();
      return;
    }
    // Anchor en el contenido actual para que la voz no piese lo escrito.
    dictationAnchorRef.current = input;
    speech.start();
  };

  const messagesQ = useQaChatMessages(activeId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = useMemo(
    () => sessionsQ.data?.find((s) => s.id === activeId) ?? null,
    [sessionsQ.data, activeId],
  );

  // Auto-select first session on initial load.
  useEffect(() => {
    if (!activeId && (sessionsQ.data?.length ?? 0) > 0) {
      setActiveId(sessionsQ.data![0].id);
    }
  }, [sessionsQ.data, activeId]);

  // Auto-scroll on new messages.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQ.data]);

  const handleSend = async () => {
    if (!activeId) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    try {
      const result = await sendMessage.mutateAsync({ session_id: activeId, content: trimmed });
      // sendMessage devuelve { user, assistant, assistantError }: si Mike
      // falló (rate limit, LLM error), el user message igual quedó persistido
      // pero no hay respuesta. Mostramos un toast warning con la causa.
      if (result.assistantError) {
        toast.warning("Mike no pudo responder", {
          description: result.assistantError,
        });
      }
    } catch (err) {
      toast.error("No se pudo enviar el mensaje", {
        description: (err as Error).message,
      });
    }
  };

  const askDelete = (id: string, title: string) => {
    setPendingDelete({ id, title });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteSession.mutateAsync(pendingDelete.id);
      if (activeId === pendingDelete.id) setActiveId(null);
      setPendingDelete(null);
    } catch (err) {
      toast.error("No se pudo borrar la conversación", {
        description: (err as Error).message,
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <MikeAvatar size={44} />
          <div>
            <h2 className="text-base font-semibold">Chat with Mike</h2>
            <p className="text-xs text-muted-foreground">
              Mike es tu supervisor IA — conoce a cada closer, todas las QAs, y
              te ayuda a coachear al equipo. Hazle preguntas sobre tendencias,
              comparativas entre closers o qué le falta a alguien.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[260px_1fr] gap-3">
        {/* Sidebar */}
        <Card className="flex flex-col">
          <CardContent className="flex flex-col gap-2 p-2">
            <Button
              type="button"
              size="sm"
              onClick={() => setShowNew(true)}
              className="gap-1.5"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              Nueva conversación
            </Button>

            <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
              {sessionsQ.isLoading ? (
                <div className="flex items-center gap-1.5 px-2 py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Cargando…
                </div>
              ) : (sessionsQ.data?.length ?? 0) === 0 ? (
                <div className="px-2 py-3 text-xs italic text-muted-foreground">
                  Sin conversaciones todavía. Click "+ Nueva conversación" para
                  empezar.
                </div>
              ) : (
                sessionsQ.data!.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveId(s.id)}
                    className={cn(
                      "group flex flex-col items-start gap-1 rounded-md border border-transparent px-2 py-2 text-left transition-colors hover:bg-muted/40",
                      activeId === s.id && "border-border bg-muted/40",
                    )}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <span className="line-clamp-2 flex-1 text-xs font-medium">
                        {sessionTitle(s)}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          askDelete(s.id, sessionTitle(s));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            askDelete(s.id, sessionTitle(s));
                          }
                        }}
                        className="cursor-pointer text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Borrar conversación"
                      >
                        <Trash2 className="h-3 w-3" />
                      </span>
                    </div>
                    <div className="flex w-full items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span
                        className={cn(
                          "rounded-full bg-muted/50 px-1.5 py-0.5",
                          s.scope_type === "closer"
                            ? "text-amber-500"
                            : "text-muted-foreground",
                        )}
                      >
                        {s.scope_type === "closer"
                          ? (s.closer?.name ?? "(closer)")
                          : "Todos"}
                      </span>
                      <span>· {formatRelative(s.updated_at, f.intl("es-AR"))}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Active conversation */}
        <Card className="flex min-h-[60vh] flex-col">
          {activeSession ? (
            <>
              <div className="border-b border-border/60 p-3">
                <p className="text-sm font-semibold">
                  {sessionTitle(activeSession)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Hablando sobre:{" "}
                  <strong>
                    {activeSession.scope_type === "closer"
                      ? (activeSession.closer?.name ?? "(closer borrado)")
                      : "todos los closers"}
                  </strong>
                </p>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messagesQ.isLoading ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Cargando mensajes…
                  </div>
                ) : (messagesQ.data?.length ?? 0) === 0 ? (
                  <p className="text-xs italic text-muted-foreground">
                    Escribe una pregunta para arrancar. Algunos ejemplos:
                    "¿quién cierra más?", "¿qué le falta a [closer]?",
                    "compara [closer1] vs [closer2]".
                  </p>
                ) : (
                  messagesQ.data!.map((m) => {
                    const isAssistant = m.role === "assistant";
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "flex gap-2",
                          isAssistant
                            ? "flex-row items-end"
                            : "flex-row-reverse items-end",
                        )}
                      >
                        {isAssistant && <MikeAvatar size={28} />}
                        <div
                          className={cn(
                            "flex max-w-[80%] flex-col gap-1",
                            isAssistant ? "items-start" : "items-end",
                          )}
                        >
                          <div
                            className={cn(
                              "rounded-2xl px-3 py-2 text-sm",
                              isAssistant
                                ? "border border-border/60 bg-muted/30"
                                : "bg-primary text-primary-foreground",
                            )}
                          >
                            {isAssistant && (
                              <div className="mb-1 text-xs font-bold text-amber-500">
                                Mike
                              </div>
                            )}
                            <div className="whitespace-pre-wrap">{m.content}</div>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {formatRelative(m.created_at, f.intl("es-AR"))}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}

                {/* "Clari escribiendo…" mientras la mutation está en vuelo
                    (después de insertar el user msg, antes que llegue la
                    respuesta del edge function). Si la mutation termina
                    sin assistant (rate limit, LLM error), el placeholder
                    queda como "sin respuesta" hasta el próximo intento. */}
                {sendMessage.isPending &&
                  (messagesQ.data?.length ?? 0) > 0 &&
                  messagesQ.data![messagesQ.data!.length - 1].role === "user" && (
                    <div className="flex items-end gap-2">
                      <MikeAvatar size={28} />
                      <div className="max-w-[80%] rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-500">
                          <Sparkles className="h-3 w-3 animate-pulse" />
                          Mike escribiendo…
                        </div>
                      </div>
                    </div>
                  )}

                <div ref={messagesEndRef} />
              </div>

              <div className="flex gap-2 border-t border-border/60 p-3">
                <Textarea
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    // Si el usuario edita manualmente mientras dicta,
                    // movemos el anchor para que el siguiente chunk de
                    // voz se anexe al final del nuevo texto en vez de
                    // pisarlo.
                    if (speech.listening) {
                      dictationAnchorRef.current = e.target.value;
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder={`Pregunta a Mike sobre ${
                    activeSession.scope_type === "closer"
                      ? (activeSession.closer?.name ?? "este closer")
                      : "el equipo"
                  }…`}
                  rows={2}
                  className="resize-none text-sm"
                />
                <div className="flex flex-col gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          onClick={handleSend}
                          disabled={!input.trim() || sendMessage.isPending}
                          className="gap-1.5"
                        >
                          {sendMessage.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Enviar
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[220px]">
                        <p className="text-xs">
                          Tu mensaje se persiste en{" "}
                          <code>qa_chat_messages</code>. La respuesta la
                          genera Mike (Anthropic) en la edge function.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {/* Mic / dictado nativo del navegador (Web Speech API).
                      Solo se muestra si el navegador lo soporta. */}
                  {speech.supported && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant={speech.listening ? "default" : "outline"}
                            onClick={toggleDictation}
                            className={cn(
                              "gap-1.5",
                              speech.listening &&
                                "bg-destructive text-white hover:bg-destructive/90",
                            )}
                            aria-pressed={speech.listening}
                          >
                            {speech.listening ? (
                              <>
                                <MicOff className="h-3.5 w-3.5" />
                                Detener
                              </>
                            ) : (
                              <>
                                <Mic className="h-3.5 w-3.5" />
                                Dictar
                              </>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[220px]">
                          <p className="text-xs">
                            Dictado por voz nativo del navegador (Web
                            Speech API, español).{" "}
                            {speech.listening
                              ? "Habla ahora — el texto aparece en el cuadro."
                              : "Click para dictar tu pregunta."}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            </>
          ) : (
            <CardContent className="flex flex-1 items-center justify-center p-8">
              <div className="flex flex-col items-center gap-2 text-center">
                <MikeAvatar size={64} />
                <p className="text-sm font-semibold">
                  Hola, soy Mike — supervisor del equipo.
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  Click "+ Nueva conversación" para arrancar. Elige un closer
                  específico o "todos" para preguntas cross-equipo.
                </p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      <NewSessionDialog
        open={showNew}
        onOpenChange={setShowNew}
        closers={closersQ.data ?? []}
        onCreate={async (scopeType, scopeCloserId) => {
          try {
            const session = await createSession.mutateAsync({
              scope_type: scopeType,
              scope_closer_id: scopeCloserId,
            });
            setActiveId(session.id);
            setShowNew(false);
          } catch (err) {
            toast.error("No se pudo crear la conversación", {
              description: (err as Error).message,
            });
          }
        }}
        creating={createSession.isPending}
      />

      {/* Confirm delete — estilo Maven (shadcn AlertDialog) */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Borrar conversación
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que quieres borrar la conversación{" "}
              <strong>&ldquo;{pendingDelete?.title}&rdquo;</strong>?
              <br />
              Se eliminan todos sus mensajes. Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSession.isPending} />
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteSession.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSession.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Borrando…
                </>
              ) : (
                "Borrar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

interface NewSessionDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  closers: Array<{ id: string; name: string }>;
  creating: boolean;
  onCreate: (scopeType: QaChatScope, scopeCloserId: string | null) => void;
}

const NewSessionDialog = ({
  open,
  onOpenChange,
  closers,
  creating,
  onCreate,
}: NewSessionDialogProps) => {
  const [scope, setScope] = useState<string>("all");

  useEffect(() => {
    if (open) setScope("all");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva conversación con Mike</DialogTitle>
          <DialogDescription>
            El scope queda fijo en esta sesión. Si quieres cambiar de closer
            después, abre una sesión nueva.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            ¿De qué quieres hablar?
          </label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  Todos los closers (cross-equipo)
                </div>
              </SelectItem>
              {closers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center gap-1.5">
                    <UserIcon className="h-3.5 w-3.5" />
                    {c.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={creating}
            onClick={() => {
              if (scope === "all") onCreate("all", null);
              else onCreate("closer", scope);
            }}
          >
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MessageSquarePlus className="h-3.5 w-3.5" />
            )}
            Empezar conversación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AgencyQaChat;
