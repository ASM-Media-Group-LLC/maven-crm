import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Send, Loader2, Lock, AlertTriangle, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import type {
  ChatterSession,
  ChatterMessage,
  ChatterProfile,
  ChatterConfig,
} from "@/pages/chatter-evaluator/types";

const sb = supabase as unknown as { from: (t: string) => any };

const DEVICE_KEY = "maven.chatter.deviceId";

const getDeviceId = (): string => {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
};

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

const callChatterApi = async (action: string, payload: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("chatter-public", {
    body: { action, ...payload },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "chatter-public returned !ok");
  return data;
};

interface BubbleProps {
  msg: ChatterMessage;
  fanName: string;
  fanAvatar: string;
  profile: ChatterProfile | null;
  side: "fan" | "chatter";
}

const Bubble = ({ msg, fanName, fanAvatar, profile, side }: BubbleProps) => {
  if (msg.deleted === "full") return null;

  if (msg.role === "system") {
    return (
      <div className="my-2 text-center">
        <span className="rounded-full bg-muted px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {msg.msg_type === "tip" && msg.price
            ? `💸 Tip $${msg.price}`
            : msg.msg_type === "purchase" && msg.price
            ? `🛒 Compra $${msg.price}`
            : msg.content || "system"}
        </span>
      </div>
    );
  }

  // From the chatter's POV, fan messages are on the LEFT, chatter messages on the RIGHT.
  const isMine = msg.role === side;
  const name = msg.role === "fan" ? fanName : profile?.name ?? "chatter";
  const avatar = msg.role === "fan" ? fanAvatar : profile?.avatar_url ?? null;

  return (
    <div className={`flex gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
      <div className="aspect-square h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
        {avatar ? (
          <img
            src={avatar}
            alt={name}
            className="h-full w-full object-cover"
            style={
              msg.role === "chatter" && profile
                ? {
                    objectPosition: `${profile.avatar_x ?? 50}% ${profile.avatar_y ?? 50}%`,
                    transform: `scale(${(profile.avatar_zoom ?? 100) / 100})`,
                  }
                : undefined
            }
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[11px]">
            {name[0]}
          </div>
        )}
      </div>
      <div className={`flex max-w-[75%] flex-col ${isMine ? "items-end" : "items-start"}`}>
        <span className="text-[10px] text-muted-foreground">{name}</span>
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm ${
            isMine
              ? "rounded-br-sm bg-primary text-primary-foreground"
              : "rounded-bl-sm bg-muted text-foreground"
          } ${msg.deleted === "chatter" ? "italic opacity-60" : ""}`}
        >
          {msg.deleted === "chatter" ? "(mensaje eliminado)" : msg.content}
          {msg.images && msg.images.length > 0 && (
            <div className="mt-1 grid grid-cols-2 gap-1">
              {msg.images.map((url, i) => (
                <img key={i} src={url} alt="" className="rounded" loading="lazy" />
              ))}
            </div>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
      </div>
    </div>
  );
};

const LockedScreen = () => (
  <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
    <Lock className="h-12 w-12 text-amber-500" />
    <h1 className="text-xl font-bold">Sesión en uso</h1>
    <p className="max-w-sm text-sm text-muted-foreground">
      Otro dispositivo está activo en esta sesión. Solo un dispositivo puede chatear a la vez.
    </p>
  </div>
);

const NotFoundScreen = ({ reason }: { reason: string }) => (
  <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
    <AlertTriangle className="h-12 w-12 text-rose-500" />
    <h1 className="text-xl font-bold">Sesión no disponible</h1>
    <p className="max-w-sm text-sm text-muted-foreground">{reason}</p>
  </div>
);

const ChatterPublicView = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [locked, setLocked] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1) Session
  const sessionQ = useQuery({
    queryKey: ["chatter-public-session", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<ChatterSession | null> => {
      const { data, error } = await sb
        .from("chatter_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChatterSession | null;
    },
  });

  // 2) Profile (only fetched once we know which one)
  const profileQ = useQuery({
    queryKey: ["chatter-public-profile", sessionQ.data?.profile_id ?? null],
    enabled: !!sessionQ.data?.profile_id,
    queryFn: async (): Promise<ChatterProfile | null> => {
      const { data, error } = await sb
        .from("chatter_profiles")
        .select("*")
        .eq("id", sessionQ.data!.profile_id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChatterProfile | null;
    },
  });

  // 3) Config (fan name + avatar)
  const configQ = useQuery({
    queryKey: ["chatter-public-config"],
    queryFn: async (): Promise<ChatterConfig | null> => {
      const { data, error } = await sb
        .from("chatter_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ChatterConfig | null;
    },
  });

  // 4) Messages
  const messagesQ = useQuery({
    queryKey: ["chatter-public-messages", sessionId],
    enabled: !!sessionId && !!claimed,
    queryFn: async (): Promise<ChatterMessage[]> => {
      const { data, error } = await sb
        .from("chatter_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatterMessage[];
    },
  });

  // Claim device on mount, refresh every 20s while open
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const claim = async () => {
      try {
        await callChatterApi("claim-device", { sessionId, deviceId: getDeviceId() });
        if (!cancelled) {
          setClaimed(true);
          setLocked(false);
        }
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("session_locked") || msg.includes("Otro dispositivo")) {
          if (!cancelled) setLocked(true);
        } else {
          if (!cancelled) toast.error("No se pudo entrar a la sesión", { description: msg });
        }
      }
    };
    claim();
    const interval = setInterval(claim, 20_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId]);

  // Realtime subscription on messages
  useEffect(() => {
    if (!sessionId || !claimed) return;
    const channel = supabase
      .channel(`chatter-public-messages:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chatter_messages",
          filter: `session_id=eq.${sessionId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["chatter-public-messages", sessionId] }),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chatter_sessions",
          filter: `id=eq.${sessionId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["chatter-public-session", sessionId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, claimed, qc]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messagesQ.data]);

  // Mark messages as read on focus / new examiner messages
  useEffect(() => {
    if (!sessionId || !claimed) return;
    callChatterApi("mark-read", { sessionId }).catch(() => {});
  }, [messagesQ.data, sessionId, claimed]);

  const sendMut = useMutation({
    mutationFn: async (content: string) => callChatterApi("send", { sessionId, content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chatter-public-messages", sessionId] });
    },
  });

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    try {
      await sendMut.mutateAsync(text);
      callChatterApi("set-typing", { sessionId, typing: false }).catch(() => {});
    } catch (e) {
      toast.error("No se pudo enviar", { description: (e as Error).message });
      setInput(text);
    }
  };

  // Typing indicator (debounced)
  const typingTimer = useRef<number | null>(null);
  const handleInputChange = (val: string) => {
    setInput(val);
    if (!sessionId) return;
    if (val.length > 0) {
      callChatterApi("set-typing", { sessionId, typing: true }).catch(() => {});
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => {
        callChatterApi("set-typing", { sessionId, typing: false }).catch(() => {});
      }, 3000);
    }
  };

  const session = sessionQ.data;
  const profile = profileQ.data ?? null;
  const config = configQ.data ?? null;
  const messages = messagesQ.data ?? [];

  const fanName = config?.fan_name ?? "JavixBuster";
  const fanAvatar = config?.fan_avatar_url ?? "/JavixBuster.png";

  // Loading
  if (sessionQ.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) return <NotFoundScreen reason="Esta sesión no existe o fue eliminada." />;
  if (session.status === "ended") return <NotFoundScreen reason="Esta sesión ya fue cerrada por el examinador." />;
  if (locked) return <LockedScreen />;

  if (!claimed) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const examinerTyping = session.typing_fan;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-gradient-to-r from-purple-700 to-indigo-700 px-4 py-3 text-white shadow">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="aspect-square h-11 w-11 overflow-hidden rounded-full bg-white/20">
            {fanAvatar && (
              <img src={fanAvatar} alt={fanName} className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{fanName}</div>
            <div className="truncate text-[11px] opacity-80">
              {session.status === "waiting" ? "esperando primer mensaje" : "en línea"}
              {examinerTyping ? " · escribiendo…" : ""}
            </div>
          </div>
          <MessageCircle className="h-5 w-5 opacity-70" />
        </div>
      </header>

      {/* Persona reminder card */}
      {profile && (
        <Card className="mx-4 mt-3 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2 p-3 text-xs">
            <span className="text-muted-foreground">Estás interpretando a:</span>
            <strong className="text-foreground">{profile.name}</strong>
            {profile.location && (
              <span className="text-muted-foreground">· {profile.location}</span>
            )}
          </div>
        </Card>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-3">
          {messagesQ.isLoading && (
            <p className="text-xs text-muted-foreground">Cargando…</p>
          )}
          {!messagesQ.isLoading && messages.length === 0 && (
            <p className="rounded-md bg-muted/50 p-4 text-center text-xs text-muted-foreground">
              {fanName} aún no ha escrito. Espera o saluda primero como {profile?.name ?? "el personaje"}.
            </p>
          )}
          {messages.map((m) => (
            <Bubble
              key={m.id}
              msg={m}
              fanName={fanName}
              fanAvatar={fanAvatar}
              profile={profile}
              side="chatter"
            />
          ))}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t bg-card p-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={`Responder como ${profile?.name ?? "el personaje"}…`}
            rows={2}
            className="min-h-[2.5rem] flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sendMut.isPending}
            size="icon"
          >
            {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatterPublicView;
