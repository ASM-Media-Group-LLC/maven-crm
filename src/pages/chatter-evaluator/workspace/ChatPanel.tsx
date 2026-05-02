import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Send, DollarSign, Loader2, MessageCircle, Copy, Check } from "lucide-react";
import { toast } from "sonner";
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

export const ChatPanel = ({ session }: Props) => {
  const messagesQ = useChatterMessages(session?.id ?? null);
  const profilesQ = useChatterProfiles();
  const configQ = useChatterConfig();
  const sendMut = useSendChatterMessage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

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
    } catch (e) {
      toast.error("No se pudo enviar", { description: (e as Error).message });
      setInput(content); // restore
    }
  };

  const handleSendTip = async () => {
    if (!session) return;
    const raw = prompt("Monto del tip ($):", "10");
    if (!raw) return;
    const amount = parseFloat(raw);
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
          </div>
        </div>
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
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
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
          <Button
            onClick={handleSendTip}
            size="icon"
            variant="outline"
            disabled={session.status === "ended"}
            title="Enviar tip"
          >
            <DollarSign className="h-4 w-4" />
          </Button>
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
