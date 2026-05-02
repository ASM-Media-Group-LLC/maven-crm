import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Send, DollarSign, Loader2, MessageCircle, Check, CheckCheck, Paperclip, Clock, Pencil, Link2, Square } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { EmojiBar, DEFAULT_EMOJIS } from "./EmojiBar";
import { VolumeControl, playSoundFile } from "./VolumeControl";
import { FontZoom, useChatFontSize } from "./ChatToolbar";
import { MediaViewer } from "./MediaViewer";
import { TipPopup, playTipSound } from "./TipPopup";
import { useUpdateChatterConfig } from "@/hooks/useChatterEvaluator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useChatterMessages,
  useSendChatterMessage,
  useChatterProfiles,
  useChatterConfig,
  useRenameChatterSession,
  useExtendChatterSession,
  usePurchaseChatterMessage,
  useEndChatterSession,
} from "@/hooks/useChatterEvaluator";
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
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ChatterSession, ChatterMessage, ChatterProfile } from "../types";

interface Props {
  session: ChatterSession | null;
}

// Tiny header metric — label on top in muted uppercase, value below in
// the foreground color. Matches .info-item in the original chat-header.
const Metric = ({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) => (
  <div className="flex flex-col items-center leading-tight">
    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
      {label}
    </span>
    <span className={`mt-0.5 text-sm font-bold ${valueClass ?? ""}`}>{value}</span>
  </div>
);

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

const MessageBubble = ({
  msg,
  fanName,
  fanAvatar,
  profile,
  readByOther,
  onOpenMedia,
  onPurchase,
  purchasing,
}: {
  msg: ChatterMessage;
  fanName: string;
  fanAvatar: string;
  profile: ChatterProfile | null;
  /** ISO timestamp of when the OTHER side last read messages, or null. Used
   *  to show single vs. double check on the examiner's own messages. */
  readByOther: string | null;
  onOpenMedia: (url: string) => void;
  onPurchase: (msg: ChatterMessage) => void;
  purchasing: boolean;
}) => {
  if (msg.deleted === "full") return null;

  if (msg.role === "system") {
    // Tip / purchase pill (matches .msg-tip / purchase variant in the
    // original — gold gradient + border for tips, green for purchases).
    const isTip = msg.msg_type === "tip";
    const isPurchase = msg.msg_type === "purchase";
    if ((isTip || isPurchase) && msg.price) {
      const cls = isPurchase
        ? "border-emerald-500 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-emerald-400"
        : "border-amber-500 bg-gradient-to-br from-amber-500/20 to-amber-500/5 text-amber-400";
      return (
        <div className="my-2 flex justify-center">
          <div className={`flex w-full max-w-[420px] items-center gap-2.5 rounded-xl border px-5 py-2 ${cls}`}>
            <span className="text-lg">{isPurchase ? "🎉" : "💸"}</span>
            <span className="text-xs font-bold uppercase tracking-wide">
              {isPurchase ? "Contenido comprado" : "Tip enviada"}
            </span>
            <span className="ml-auto text-sm font-extrabold text-foreground">
              ${msg.price} USD
            </span>
          </div>
        </div>
      );
    }
    return (
      <div className="my-2 text-center">
        <span className="rounded-full bg-muted px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {msg.content || "system"}
        </span>
      </div>
    );
  }

  const isFan = msg.role === "fan";
  const name = isFan ? fanName : profile?.name ?? "chatter";
  const avatar = isFan ? fanAvatar : profile?.avatar_url ?? null;
  // Priced PPV bubble: chatter sent images with a price > 0. The examiner
  // can flip the purchased state with the $ button on the side.
  const isPriced = !isFan && (msg.price ?? 0) > 0 && msg.images && msg.images.length > 0;

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
        {(msg.content || msg.deleted === "chatter") && (
          <div
            className={`rounded-2xl px-3 py-1.5 text-sm ${
              isFan
                ? "rounded-bl-sm bg-muted text-foreground"
                : "rounded-br-sm bg-primary text-primary-foreground"
            } ${msg.deleted === "chatter" ? "italic opacity-60" : ""}`}
          >
            {msg.deleted === "chatter" ? "(mensaje eliminado por el chatter)" : msg.content}
          </div>
        )}
        {msg.images && msg.images.length > 0 && (
          <>
            {isPriced ? (
              // PPV bubble — orange when unbought, green once purchased.
              // Matches the original .msg-priced + .msg-purchase-btn:
              // container is `position:relative`, button is absolutely
              // positioned at top:50% right:-44px so it floats outside
              // the bubble at vertical center.
              <div className="mt-1 ml-12">
                <div
                  className={`relative inline-block rounded-[14px] border-2 p-1 ${
                    msg.purchased
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-orange-500 bg-orange-500/5"
                  }`}
                >
                  <div className="flex flex-wrap gap-1">
                    {msg.images.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt=""
                        loading="lazy"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMedia(url);
                        }}
                        className="max-h-[200px] max-w-[200px] cursor-zoom-in rounded-[12px] object-cover"
                      />
                    ))}
                  </div>
                  <span
                    className={`block rounded-b-[12px] px-4 py-1.5 text-center text-sm font-bold text-white ${
                      msg.purchased ? "bg-emerald-500" : "bg-orange-500"
                    }`}
                  >
                    ${msg.price}{msg.purchased ? " ✓" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => onPurchase(msg)}
                    disabled={msg.purchased || purchasing}
                    title={msg.purchased ? "Comprado" : `Comprar — $${msg.price}`}
                    className={`absolute left-[-44px] top-1/2 z-[5] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border-2 text-base font-bold shadow-md transition-all ${
                      msg.purchased
                        ? "cursor-default border-emerald-500 bg-emerald-500/15 text-emerald-400"
                        : "cursor-pointer border-orange-500 bg-card text-orange-500 hover:scale-110 hover:bg-orange-500 hover:text-white"
                    }`}
                  >
                    {msg.purchased ? "✓" : purchasing ? <Loader2 className="h-4 w-4 animate-spin" /> : "$"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1">
                {msg.images.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt=""
                    loading="lazy"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenMedia(url);
                    }}
                    className="max-h-[200px] max-w-[200px] cursor-zoom-in rounded-[12px] border border-border object-cover"
                  />
                ))}
              </div>
            )}
          </>
        )}
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {formatTime(msg.created_at)}
          {/* Double-check indicator on the examiner's own (fan-role) messages.
              Single check = sent. Double check (sky-blue) = read by chatter. */}
          {isFan && msg.msg_type === "message" && (
            readByOther && new Date(readByOther) >= new Date(msg.created_at) ? (
              <CheckCheck className="h-3 w-3 text-sky-400" />
            ) : (
              <Check className="h-3 w-3" />
            )
          )}
        </span>
      </div>
    </div>
  );
};

// New-message ding. Uses the same notification.mp3 the original
// Roleplaychatters shipped (copied to /public/sounds) — the WebAudio
// fallback the migration started with sounded different, and the user
// asked to match the original 1:1.
const playPing = () => playSoundFile("notification");

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
  const lastMessageIdRef = useRef<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const lastTipIdRef = useRef<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [addTimeOpen, setAddTimeOpen] = useState(false);
  const [addTimeValue, setAddTimeValue] = useState("10");
  const renameMut = useRenameChatterSession();
  const extendMut = useExtendChatterSession();
  const purchaseMut = usePurchaseChatterMessage();
  const endMut = useEndChatterSession();
  const [endOpen, setEndOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const chatFontSize = useChatFontSize();
  const updateConfigMut = useUpdateChatterConfig();
  const examinerEmojis =
    configQ.data?.examiner_emojis && configQ.data.examiner_emojis.length > 0
      ? configQ.data.examiner_emojis
      : DEFAULT_EMOJIS;
  const persistEmojis = (next: string[]) =>
    updateConfigMut.mutate({ examiner_emojis: next });

  // Tick clock every second for countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Play ping when a NEW message arrives from the chatter (not on initial load)
  // and fire the tip popup whenever a brand-new tip system message lands.
  useEffect(() => {
    const msgs = messagesQ.data ?? [];
    if (msgs.length === 0) {
      lastMessageIdRef.current = null;
      lastTipIdRef.current = null;
      return;
    }
    const last = msgs[msgs.length - 1];
    const prevLastId = lastMessageIdRef.current;
    lastMessageIdRef.current = last.id;
    if (prevLastId && prevLastId !== last.id && last.role === "chatter") {
      playPing();
    }

    // Same popup + per-amount sound for tips AND purchases (the original
    // ran playSoundTip / playSoundPurchase off the same tier mapping).
    const newestEvent = [...msgs]
      .reverse()
      .find(
        (m) =>
          m.role === "system" &&
          (m.msg_type === "tip" || m.msg_type === "purchase") &&
          m.price,
      );
    if (newestEvent && newestEvent.id !== lastTipIdRef.current) {
      const isInitial = lastTipIdRef.current === null;
      lastTipIdRef.current = newestEvent.id;
      if (!isInitial && newestEvent.price) {
        setTipAmount(newestEvent.price);
        playTipSound(newestEvent.price);
      }
    }
  }, [messagesQ.data]);

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
      .on(
        // Also invalidate the sessions list so updates from the chatter side
        // (typing_chatter, read_by_chatter_at) reach this component live.
        // The selected session in WorkspaceContent is derived from that list.
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chatter_sessions",
          filter: `id=eq.${session.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["chatter-sessions"] });
          qc.invalidateQueries({ queryKey: ["chatter-session", session.id] });
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

  // Mark messages as read by examiner — but only when the tab is actually
  // visible AND the window has focus. Otherwise the chatter would see a
  // double check even though the examiner has the tab in the background.
  // Mirrors the original _isLooking() guard (index.html line 2456).
  useEffect(() => {
    if (!session) return;
    const sid = session.id;
    const markIfLooking = () => {
      if (document.hidden || !document.hasFocus()) return;
      // Re-check unread inside the listener so focus-gained also flushes.
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
        .eq("id", sid as never);
    };
    markIfLooking();
    document.addEventListener("visibilitychange", markIfLooking);
    window.addEventListener("focus", markIfLooking);
    return () => {
      document.removeEventListener("visibilitychange", markIfLooking);
      window.removeEventListener("focus", markIfLooking);
    };
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

  const messages = messagesQ.data ?? [];

  // Live metrics shown in the header (matches the original chat-info row in
  // index.html line 3390): MSGS = chatter messages with content, WPM = words
  // / active typing minutes (gaps > 90s ignored as idle), RESP. TIME = avg
  // gap between a fan message and the chatter's first reply.
  // NOTE: useMemo MUST stay above any conditional early returns — putting
  // it after `if (!session) return ...` violates rules of hooks and blanks
  // the screen the moment a session is selected.
  const metrics = useMemo(() => {
    const chatterMsgs = messages.filter(
      (m) => m.role === "chatter" && (m.content?.length ?? 0) > 0,
    );
    const msgCount = chatterMsgs.length;

    let wpm: string | number = "—";
    if (chatterMsgs.length >= 2) {
      const MAX_GAP_MS = 90_000;
      let activeMs = 0;
      for (let i = 1; i < chatterMsgs.length; i++) {
        const gap =
          new Date(chatterMsgs[i].created_at).getTime() -
          new Date(chatterMsgs[i - 1].created_at).getTime();
        if (gap < MAX_GAP_MS) activeMs += gap;
      }
      const totalWords = chatterMsgs.reduce(
        (sum, m) => sum + (m.content ?? "").split(/\s+/).filter(Boolean).length,
        0,
      );
      const activeMin = activeMs / 60_000;
      wpm = activeMin > 0.1 ? Math.round(totalWords / activeMin) : "—";
    }

    let respTime: string = "—";
    const responseTimes: number[] = [];
    let lastFanTs: number | null = null;
    let waitingForReply = false;
    for (const m of messages) {
      if (m.role === "fan" && !m.deleted) {
        if (!waitingForReply) {
          lastFanTs = new Date(m.created_at).getTime();
          waitingForReply = true;
        }
      } else if (m.role === "chatter" && !m.deleted && waitingForReply && lastFanTs) {
        const diff = new Date(m.created_at).getTime() - lastFanTs;
        if (diff > 0) responseTimes.push(diff);
        waitingForReply = false;
        lastFanTs = null;
      }
    }
    if (responseTimes.length > 0) {
      const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      respTime = `${(avg / 60_000).toFixed(1)}m`;
    }
    return { msgCount, wpm, respTime };
  }, [messages]);

  if (!session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
        <MessageCircle className="h-10 w-10" />
        <p className="text-sm">Selecciona una sesión a la izquierda para empezar a chatear.</p>
      </div>
    );
  }

  const handleCopyLink = async () => {
    try {
      const url = `${window.location.origin}/chatter/${session.id}`;
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
      toast.success("Link copiado");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header — mirrors the original Roleplaychatters chat-header
          (index.html line 3382): identity on the left, 4 live metrics
          in the center, action buttons on the right. */}
      {(() => {
        const startMs = session.started_at
          ? new Date(session.started_at).getTime()
          : new Date(session.created_at).getTime();
        const remaining = startMs + session.duration_minutes * 60_000 - now;
        const isExpired = remaining <= 0;
        const isLow = remaining > 0 && remaining < 5 * 60_000;
        const ended = session.status === "ended";
        const timeLabel = ended
          ? "Cerrada"
          : session.status === "waiting"
          ? "Esperando…"
          : formatRemaining(remaining);
        const timeClass = ended
          ? "text-muted-foreground"
          : isExpired
          ? "text-rose-400"
          : isLow
          ? "text-amber-400"
          : "text-foreground";
        return (
          <div className="grid grid-cols-1 items-center gap-3 border-b px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            {/* Identity (left) */}
            <div className="flex min-w-0 items-center gap-3">
              <div className="aspect-square h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
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
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{profile?.name ?? "?"}</div>
                <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="truncate">Chatter: {session.chatter_name}</span>
                  {!ended && (
                    <button
                      type="button"
                      onClick={() => {
                        setRenameValue(session.chatter_name);
                        setRenameOpen(true);
                      }}
                      className="shrink-0 rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100"
                      title="Editar nombre"
                      aria-label="Editar nombre del chatter"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  {session.typing_chatter && !ended && (
                    <span className="italic text-emerald-400">escribiendo…</span>
                  )}
                </div>
              </div>
            </div>

            {/* Metrics (centered, fixed-width column so they don't slide
                with the side content) */}
            <div className="flex flex-wrap items-center justify-center gap-6">
              <Metric label="TIEMPO" value={timeLabel} valueClass={`font-mono ${timeClass}`} />
              <Metric label="MSGS" value={String(metrics.msgCount)} valueClass="font-mono" />
              <Metric label="WPM" value={String(metrics.wpm)} valueClass="font-mono" />
              <Metric label="RESP. TIME" value={metrics.respTime} valueClass="font-mono" />
            </div>

            {/* Volume + Actions (right) */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <VolumeControl />
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyLink}
                title="Copiar link público del chatter"
                className="gap-1.5"
              >
                {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                {linkCopied ? "Copiado" : "Copiar link"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAddTimeValue("10");
                  setAddTimeOpen(true);
                }}
                disabled={ended}
                title="Agregar minutos a la sesión"
              >
                + Tiempo
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEndOpen(true)}
                disabled={ended}
                title="Terminar la sesión"
                className="gap-1.5 border-rose-500/60 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                Terminar
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3" style={{ fontSize: `${chatFontSize}px` }}>
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
            readByOther={session?.read_by_chatter_at ?? null}
            onOpenMedia={(url) => setMediaUrl(url)}
            onPurchase={(target) => {
              if (!session || !target.price) return;
              purchaseMut.mutate(
                {
                  sessionId: session.id,
                  messageId: target.id,
                  price: target.price,
                  examinerName: fanName,
                },
                {
                  onError: (err) =>
                    toast.error("No se pudo comprar", { description: (err as Error).message }),
                },
              );
            }}
            purchasing={purchaseMut.isPending}
          />
        ))}
      </div>

      {/* Emoji bar (always visible, examiner emojis are persisted globally) */}
      {session.status !== "ended" && (
        <EmojiBar
          emojis={examinerEmojis}
          onPick={(e) => setInput((v) => v + e)}
          onAdd={(e) => persistEmojis([...examinerEmojis, e])}
          onRemove={(e) =>
            persistEmojis(examinerEmojis.filter((x) => x !== e))
          }
          trailing={<FontZoom />}
        />
      )}

      {/* Input */}
      <div className="p-2">
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
              {/* Gold-accent tip button — matches the original
                  btn-content with the gold border/text override
                  (index.html line 3420). */}
              <Button
                size="icon"
                variant="outline"
                disabled={session.status === "ended"}
                title="Enviar tip"
                className="border-amber-500 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
              >
                <DollarSign className="h-4 w-4" strokeWidth={3} />
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

      <MediaViewer url={mediaUrl} onClose={() => setMediaUrl(null)} />
      <TipPopup amount={tipAmount} onDone={() => setTipAmount(null)} />

      {/* End session dialog (matches endSession in the original — confirm
          before flipping status to 'ended'). */}
      <AlertDialog open={endOpen} onOpenChange={setEndOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminar sesión</AlertDialogTitle>
            <AlertDialogDescription>
              Esto cierra la sesión para el chatter. No podrá seguir escribiendo
              y el link se invalida. ¿Seguro?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={endMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 hover:bg-rose-600"
              onClick={(e) => {
                e.preventDefault();
                endMut.mutate(session.id, {
                  onSuccess: () => {
                    setEndOpen(false);
                    toast.success("Sesión terminada");
                  },
                  onError: (err) =>
                    toast.error("No se pudo terminar", {
                      description: (err as Error).message,
                    }),
                });
              }}
              disabled={endMut.isPending}
            >
              {endMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Terminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename chatter dialog (matches editChatterName from the original) */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar nombre del chatter</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Nombre del chatter"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!renameValue.trim() || !session) return;
                renameMut.mutate(
                  { id: session.id, chatterName: renameValue },
                  {
                    onSuccess: () => {
                      setRenameOpen(false);
                      toast.success("Nombre actualizado");
                    },
                    onError: (err) =>
                      toast.error("No se pudo actualizar", { description: (err as Error).message }),
                  },
                );
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)} disabled={renameMut.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!session || !renameValue.trim()) return;
                renameMut.mutate(
                  { id: session.id, chatterName: renameValue },
                  {
                    onSuccess: () => {
                      setRenameOpen(false);
                      toast.success("Nombre actualizado");
                    },
                    onError: (err) =>
                      toast.error("No se pudo actualizar", { description: (err as Error).message }),
                  },
                );
              }}
              disabled={!renameValue.trim() || renameMut.isPending}
            >
              {renameMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add time dialog (matches openAddTime from the original) */}
      <Dialog open={addTimeOpen} onOpenChange={setAddTimeOpen}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>Agregar tiempo</DialogTitle>
            <DialogDescription>
              Suma minutos al tiempo total de la sesión. El chatter lo verá al instante.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center gap-2 py-2">
            <Input
              type="number"
              min={1}
              autoFocus
              value={addTimeValue}
              onChange={(e) => setAddTimeValue(e.target.value)}
              className="w-24 text-center text-xl font-bold"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const m = parseInt(addTimeValue, 10);
                  if (!session || !Number.isFinite(m) || m <= 0) return;
                  extendMut.mutate(
                    { id: session.id, addMinutes: m },
                    {
                      onSuccess: () => {
                        setAddTimeOpen(false);
                        toast.success(`+${m} min agregados`);
                      },
                      onError: (err) =>
                        toast.error("No se pudo extender", { description: (err as Error).message }),
                    },
                  );
                }
              }}
            />
            <span className="text-sm text-muted-foreground">minutos</span>
          </div>
          <DialogFooter className="justify-center sm:justify-center">
            <Button variant="outline" onClick={() => setAddTimeOpen(false)} disabled={extendMut.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                const m = parseInt(addTimeValue, 10);
                if (!session || !Number.isFinite(m) || m <= 0) return;
                extendMut.mutate(
                  { id: session.id, addMinutes: m },
                  {
                    onSuccess: () => {
                      setAddTimeOpen(false);
                      toast.success(`+${m} min agregados`);
                    },
                    onError: (err) =>
                      toast.error("No se pudo extender", { description: (err as Error).message }),
                  },
                );
              }}
              disabled={extendMut.isPending}
            >
              {extendMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatPanel;
