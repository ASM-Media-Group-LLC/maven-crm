import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Send, DollarSign, Loader2, MessageCircle, Copy, Check, Paperclip, Volume2, VolumeX, Clock, Smile } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useChatterMessages,
  useSendChatterMessage,
  useChatterProfiles,
  useChatterConfig,
} from "@/hooks/useChatterEvaluator";
import type { ChatterSession, ChatterMessage, ChatterProfile } from "../types";

interface Props {
  session: ChatterSession | null;
}

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

const MessageBubble = ({
  msg,
  fanName,
  fanAvatar,
  profile,
}: {
  msg: ChatterMessage;
  fanName: string;
  fanAvatar: string;
  profile: ChatterProfile | null;
}) => {
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

  const isFan = msg.role === "fan";
  const name = isFan ? fanName : profile?.name ?? "chatter";
  const avatar = isFan ? fanAvatar : profile?.avatar_url ?? null;

  return (
    <div className={`flex gap-2 ${isFan ? "" : "flex-row-reverse"}`}>
      <div className="aspect-square h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
        {avatar ? (
          <img
            src={avatar}
            alt={name}
            className="h-full w-full object-cover"
            style={
              !isFan && profile
                ? {
                    objectPosition: `${profile.avatar_x ?? 50}% ${profile.avatar_y ?? 50}%`,
                    transform: `scale(${(profile.avatar_zoom ?? 100) / 100})`,
                  }
                : undefined
            }
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px]">
            {name[0]}
          </div>
        )}
      </div>
      <div className={`flex max-w-[70%] flex-col ${isFan ? "items-start" : "items-end"}`}>
        <span className="text-[10px] text-muted-foreground">{name}</span>
        <div
          className={`rounded-2xl px-3 py-1.5 text-sm ${
            isFan
              ? "rounded-bl-sm bg-muted text-foreground"
              : "rounded-br-sm bg-primary text-primary-foreground"
          } ${msg.deleted === "chatter" ? "italic opacity-60" : ""}`}
        >
          {msg.deleted === "chatter" ? "(mensaje eliminado por el chatter)" : msg.content}
          {msg.images && msg.images.length > 0 && (
            <div className="mt-1 grid grid-cols-2 gap-1">
              {msg.images.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt=""
                  className="rounded"
                  loading="lazy"
                />
              ))}
            </div>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">{formatTime(msg.created_at)}</span>
      </div>
    </div>
  );
};

const PublicLinkBanner = ({ session }: { session: ChatterSession }) => {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/chatter/${session.id}`;
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Link copiado");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  if (session.status === "ended") return null;
  return (
    <Card className="m-3 border-amber-500/40 bg-amber-500/5 p-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-amber-300">Link para el aspirante:</span>
        <code className="flex-1 truncate rounded bg-background/50 px-2 py-1 text-[10px]">
          {url}
        </code>
        <Button onClick={handleCopy} size="icon" variant="outline" className="h-6 w-6">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
    </Card>
  );
};

// 3-tone soft "ding" using WebAudio — no asset to ship, no permission.
let _audioCtx: AudioContext | null = null;
const playPing = () => {
  try {
    _audioCtx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = _audioCtx;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(880, now);
    o.frequency.exponentialRampToValueAtTime(1320, now + 0.15);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + 0.3);
  } catch {
    /* no-op */
  }
};

const formatRemaining = (ms: number): string => {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export const ChatPanel = ({ session }: Props) => {
  const messagesQ = useChatterMessages(session?.id ?? null);
  const profilesQ = useChatterProfiles();
  const configQ = useChatterConfig();
  const sendMut = useSendChatterMessage();
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => localStorage.getItem("maven.chatter.muted") === "1");
  const lastMessageIdRef = useRef<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Tick clock every second for countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Play ping when a NEW message arrives from the chatter (not on initial load)
  useEffect(() => {
    const msgs = messagesQ.data ?? [];
    if (msgs.length === 0) {
      lastMessageIdRef.current = null;
      return;
    }
    const last = msgs[msgs.length - 1];
    const prevLastId = lastMessageIdRef.current;
    lastMessageIdRef.current = last.id;
    if (!prevLastId) return; // initial load
    if (prevLastId === last.id) return;
    if (last.role === "chatter" && !muted) playPing();
  }, [messagesQ.data, muted]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem("maven.chatter.muted", next ? "1" : "0");
  };

  // Realtime: subscribe to chatter_messages inserts/updates for this session
  // so messages from the chatter side (Phase 5) appear instantly here
  // without polling. Cleanup on session change / unmount.
  useEffect(() => {
    if (!session?.id) return;
    const channel = supabase
      .channel(`chatter-messages:${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chatter_messages",
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["chatter-messages", session.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id, qc]);

  const profile = useMemo(() => {
    if (!session) return null;
    return profilesQ.data?.find((p) => p.id === session.profile_id) ?? null;
  }, [profilesQ.data, session]);

  const fanName = configQ.data?.fan_name ?? "JavixBuster";
  const fanAvatar = configQ.data?.fan_avatar_url ?? "/JavixBuster.png";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messagesQ.data]);

  const handleSend = async () => {
    if (!session || !input.trim()) return;
    const content = input.trim();
    setInput("");
    try {
      await sendMut.mutateAsync({
        sessionId: session.id,
        role: "fan",
        msgType: "message",
        content,
        fromExaminer: true,
      });
      // Clear typing indicator after send
      void supabase
        .from("chatter_sessions" as never)
        .update({ typing_fan: false, typing_fan_at: null } as never)
        .eq("id", session.id as never);
    } catch (e) {
      toast.error("No se pudo enviar", { description: (e as Error).message });
      setInput(content); // restore
    }
  };

  // Typing indicator (debounced on the fan/examiner side)
  const typingTimer = useRef<number | null>(null);
  const handleInputChange = (val: string) => {
    setInput(val);
    if (!session) return;
    if (val.length > 0) {
      void supabase
        .from("chatter_sessions" as never)
        .update({ typing_fan: true, typing_fan_at: new Date().toISOString() } as never)
        .eq("id", session.id as never);
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => {
        void supabase
          .from("chatter_sessions" as never)
          .update({ typing_fan: false, typing_fan_at: null } as never)
          .eq("id", session.id as never);
      }, 3000);
    }
  };

  // Mark messages as read by examiner whenever new chatter messages appear
  useEffect(() => {
    if (!session) return;
    const msgs = messagesQ.data ?? [];
    const hasUnread = msgs.some(
      (m) =>
        m.role === "chatter" &&
        (!session.read_by_examiner_at ||
          new Date(m.created_at) > new Date(session.read_by_examiner_at)),
    );
    if (!hasUnread) return;
    void supabase
      .from("chatter_sessions" as never)
      .update({ read_by_examiner_at: new Date().toISOString() } as never)
      .eq("id", session.id as never);
  }, [messagesQ.data, session]);

  const handleFileUpload = async (file: File) => {
    if (!session) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Archivo muy grande", { description: "Máximo 50 MB." });
      return;
    }
    setUploading(true);
    try {
      const sanitized =
        (file.name || "upload")
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 80) || `upload-${Date.now()}`;
      const path = `_chat_uploads/${session.id}/${Date.now()}-${sanitized}`;
      const { error: upErr } = await supabase.storage
        .from("chatter-vault")
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage
        .from("chatter-vault")
        .getPublicUrl(path);

      const caption = input.trim();
      setInput("");
      await sendMut.mutateAsync({
        sessionId: session.id,
        role: "fan",
        msgType: "message",
        content: caption || null,
        images: [pub.publicUrl],
        fromExaminer: true,
      });
      toast.success("Imagen enviada");
    } catch (e) {
      toast.error("No se pudo subir", { description: (e as Error).message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSendTip = async (amountArg?: number) => {
    if (!session) return;
    let amount = amountArg;
    if (typeof amount !== "number") {
      const raw = prompt("Monto del tip ($):", "10");
      if (!raw) return;
      amount = parseFloat(raw);
    }
    if (isNaN(amount) || amount <= 0) {
      toast.error("Monto inválido");
      return;
    }
    try {
      await sendMut.mutateAsync({
        sessionId: session.id,
        role: "system",
        msgType: "tip",
        price: amount,
        content: `Tip de $${amount}`,
      });
    } catch (e) {
      toast.error("No se pudo enviar tip", { description: (e as Error).message });
    }
  };

  if (!session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
        <MessageCircle className="h-10 w-10" />
        <p className="text-sm">Selecciona una sesión a la izquierda para empezar a chatear.</p>
      </div>
    );
  }

  const messages = messagesQ.data ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b p-3">
        <div className="aspect-square h-10 w-10 overflow-hidden rounded-full bg-muted">
          {profile?.avatar_url && (
            <img
              src={profile.avatar_url}
              alt={profile.name}
              className="h-full w-full object-cover"
              style={{
                objectPosition: `${profile.avatar_x ?? 50}% ${profile.avatar_y ?? 50}%`,
                transform: `scale(${(profile.avatar_zoom ?? 100) / 100})`,
              }}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{profile?.name ?? "?"}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            chatter: {session.chatter_name} · status: {session.status}
            {session.typing_chatter && session.status !== "ended" && (
              <span className="ml-2 italic text-emerald-400">escribiendo…</span>
            )}
          </div>
        </div>
        {(() => {
          // Compute time remaining from started_at + duration_minutes (or
          // created_at if not started). Once ended, hide.
          if (session.status === "ended") return null;
          const startMs = session.started_at
            ? new Date(session.started_at).getTime()
            : new Date(session.created_at).getTime();
          const remaining = startMs + session.duration_minutes * 60_000 - now;
          const isLow = remaining > 0 && remaining < 5 * 60_000;
          return (
            <div
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-mono ${
                remaining <= 0
                  ? "bg-rose-500/20 text-rose-300"
                  : isLow
                  ? "bg-amber-500/20 text-amber-300"
                  : "bg-muted text-muted-foreground"
              }`}
              title="Tiempo restante de la sesión"
            >
              <Clock className="h-3 w-3" />
              {formatRemaining(remaining)}
            </div>
          );
        })()}
        <Button
          onClick={toggleMute}
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          title={muted ? "Activar sonido" : "Silenciar notificaciones"}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      </div>

      <PublicLinkBanner session={session} />

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
        {messagesQ.isLoading && (
          <p className="text-xs text-muted-foreground">Cargando mensajes…</p>
        )}
        {!messagesQ.isLoading && messages.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Aún no hay mensajes. Empieza tipeando como JavixBuster (rol "fan").
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            msg={m}
            fanName={fanName}
            fanAvatar={fanAvatar}
            profile={profile}
          />
        ))}
      </div>

      {/* Input */}
      <div className="border-t p-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFileUpload(f);
          }}
        />
        <div className="flex items-end gap-2">
          <Button
            onClick={() => fileInputRef.current?.click()}
            size="icon"
            variant="outline"
            disabled={session.status === "ended" || uploading}
            title="Subir foto / video"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </Button>
          <textarea
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder={`Mensaje como ${fanName}…`}
            disabled={session.status === "ended" || sendMut.isPending}
            rows={2}
            className="min-h-[2.25rem] flex-1 resize-none rounded-md border bg-transparent px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                disabled={session.status === "ended"}
                title="Enviar tip"
              >
                <DollarSign className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="end">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Tip rápido</div>
              <div className="grid grid-cols-3 gap-1">
                {[5, 10, 20, 50, 100, 200].map((amt) => (
                  <Button
                    key={amt}
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => handleSendTip(amt)}
                  >
                    ${amt}
                  </Button>
                ))}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="mt-1 w-full text-xs"
                onClick={() => handleSendTip()}
              >
                Otro monto…
              </Button>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                disabled={session.status === "ended"}
                title="Emoji"
              >
                <Smile className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="end">
              <div className="grid grid-cols-8 gap-1 text-xl">
                {["😏","🔥","💦","😈","❤️","🥵","😍","🙈","🍆","💋","😘","😉","🤤","🥰","😜","💸"].map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setInput((v) => v + e)}
                    className="rounded p-1 hover:bg-muted"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            onClick={handleSend}
            disabled={session.status === "ended" || !input.trim() || sendMut.isPending}
            size="icon"
            title="Enviar"
          >
            {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
