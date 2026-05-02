import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Send, Loader2, Lock, AlertTriangle, FolderOpen, X, Image as ImageIcon, Play, Paperclip, Clock, Check, CheckCheck } from "lucide-react";
import { EmojiBar, DEFAULT_EMOJIS } from "@/pages/chatter-evaluator/workspace/EmojiBar";
import { VolumeControl, playSoundFile } from "@/pages/chatter-evaluator/workspace/VolumeControl";
import { MediaViewer } from "@/pages/chatter-evaluator/workspace/MediaViewer";
import { TipPopup, playTipSound } from "@/pages/chatter-evaluator/workspace/TipPopup";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type {
  ChatterSession,
  ChatterMessage,
  ChatterProfile,
  ChatterConfig,
  ChatterVaultItem,
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
  /** ISO timestamp of when the OTHER side last read messages, or null. Used
   *  to render single vs. double check on the chatter's own messages. */
  readByOther: string | null;
  onOpenMedia: (url: string) => void;
}

const Bubble = ({ msg, fanName, fanAvatar, profile, side, readByOther, onOpenMedia }: BubbleProps) => {
  if (msg.deleted === "full") return null;

  if (msg.role === "system") {
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
              {isPurchase ? "Contenido comprado" : "Tip recibida"}
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

  // From the chatter's POV, fan messages are on the LEFT, chatter messages on the RIGHT.
  const isMine = msg.role === side;
  const name = msg.role === "fan" ? fanName : profile?.name ?? "chatter";
  const avatar = msg.role === "fan" ? fanAvatar : profile?.avatar_url ?? null;
  // The chatter sees the same PPV bubble (orange unbought, green purchased)
  // for any of their own priced messages — read-only, the buy button only
  // exists on the examiner side.
  const isPriced = isMine && (msg.price ?? 0) > 0 && msg.images && msg.images.length > 0;

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
        {(msg.content || msg.deleted === "chatter") && (
          <div
            className={`rounded-2xl px-3.5 py-2 text-sm ${
              isMine
                ? "rounded-br-sm bg-primary text-primary-foreground"
                : "rounded-bl-sm bg-muted text-foreground"
            } ${msg.deleted === "chatter" ? "italic opacity-60" : ""}`}
          >
            {msg.deleted === "chatter" ? "(mensaje eliminado)" : msg.content}
          </div>
        )}
        {msg.images && msg.images.length > 0 && (
          isPriced ? (
            <div
              className={`mt-1 inline-block rounded-[14px] border-2 p-1 ${
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
          )
        )}
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {formatTime(msg.created_at)}
          {/* Double-check on the chatter's own messages. Single = enviado.
              Double sky-blue = leído por el examinador. */}
          {isMine && msg.msg_type === "message" && (
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

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("read error"));
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:<mime>;base64,<data>"
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(file);
  });

// Same notification.mp3 as the original — see ChatPanel.tsx for context.
const playPing = () => playSoundFile("notification");

const formatRemaining = (ms: number): string => {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

// Right-rail character info — mirrors index.html ~line 2542 in the original:
// avatar, name, meta, then a stack of labelled note items (greeting, body,
// nudity, anal, collabs, videocalls, custom, prices, extra). Anything blank
// is hidden so admins who only fill some fields don't see "—" everywhere.
const InfoNote = ({ label, value, tone }: { label: string; value: string | null | undefined; tone?: "gold" | "warning" }) => {
  if (!value) return null;
  const valueClass =
    tone === "gold"
      ? "text-sm font-semibold text-amber-500"
      : tone === "warning"
      ? "rounded-md bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-400"
      : "text-sm text-foreground";
  return (
    <div className="mb-3.5">
      <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-amber-500/80">
        {label}
      </div>
      <div className={valueClass}>{value}</div>
    </div>
  );
};

const CharacterInfoPanel = ({ profile }: { profile: ChatterProfile }) => {
  const meta = [
    profile.nationality,
    profile.location ? `📍 ${profile.location}` : null,
    profile.age ? `${profile.age}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="border-b p-6 text-center">
        <div className="mx-auto mb-4 aspect-square h-[90px] w-[90px] overflow-hidden rounded-full bg-gradient-to-br from-purple-600 to-amber-500">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.name}
              className="h-full w-full object-cover"
              style={{
                objectPosition: `${profile.avatar_x ?? 50}% ${profile.avatar_y ?? 50}%`,
                transform: `scale(${(profile.avatar_zoom ?? 100) / 100})`,
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-white">
              {profile.name[0]}
            </div>
          )}
        </div>
        <div className="text-xl font-bold">{profile.name}</div>
        {meta && <div className="mt-1.5 text-xs text-muted-foreground">{meta}</div>}
      </div>
      <div className="p-4">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-amber-500">
          Información del personaje
        </div>
        <InfoNote label="Cómo llamar al usuario" value={profile.users_term} />
        <InfoNote label="Saludo inicial" value={profile.greeting} />
        <div className="my-4 h-px bg-border" />
        <InfoNote label="Cuerpo / términos" value={profile.body} />
        <InfoNote label="Desnudos" value={profile.nudity} />
        <InfoNote label="Anal" value={profile.anal} />
        <InfoNote label="Colaboraciones" value={profile.collabs} />
        <div className="my-4 h-px bg-border" />
        <InfoNote label="Videollamadas" value={profile.videocall} />
        <InfoNote label="Personalizados" value={profile.custom} />
        {profile.prices && Object.keys(profile.prices).length > 0 && (
          <>
            <div className="my-4 h-px bg-border" />
            <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-amber-500">
              Precios
            </div>
            {Object.entries(profile.prices).map(([k, v]) => (
              <InfoNote key={k} label={k} value={v} tone="gold" />
            ))}
          </>
        )}
        {profile.extra && (
          <>
            <div className="my-4 h-px bg-border" />
            <InfoNote label="Importante" value={profile.extra} tone="warning" />
          </>
        )}
      </div>
    </>
  );
};

const ChatterPublicView = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [locked, setLocked] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [now, setNow] = useState(Date.now());
  // Chatter-side emojis live in memory only (matches the original
  // Roleplaychatters behavior — they reset to DEFAULT_EMOJIS on reload).
  const [chatterEmojis, setChatterEmojis] = useState<string[]>([...DEFAULT_EMOJIS]);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  // When non-null, the TipPopup overlay is mounted and animates. We set this
  // when a brand-new "tip" system message lands in the realtime feed.
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const lastTipIdRef = useRef<string | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Tick clock every second for countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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

  // 5) Vault items of the profile being impersonated — loaded only when the
  // chatter opens the vault drawer to keep the initial page light.
  const vaultQ = useQuery({
    queryKey: ["chatter-public-vault", sessionQ.data?.profile_id ?? null],
    enabled: !!sessionQ.data?.profile_id && vaultOpen,
    queryFn: async (): Promise<ChatterVaultItem[]> => {
      const { data, error } = await sb
        .from("chatter_vault_items")
        .select("*")
        .eq("profile_id", sessionQ.data!.profile_id)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChatterVaultItem[];
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

  // Auto-scroll to bottom + ping on new fan messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    const msgs = messagesQ.data ?? [];
    if (msgs.length === 0) {
      lastMessageIdRef.current = null;
      lastTipIdRef.current = null;
      return;
    }
    const last = msgs[msgs.length - 1];
    const prev = lastMessageIdRef.current;
    lastMessageIdRef.current = last.id;
    if (!prev || prev === last.id) return;
    if (last.role === "fan") playPing();

    // Trigger the tip popup + per-amount sound when a brand-new tip
    // system message arrives. Skipped on the initial load so re-opening
    // the chat doesn't replay every historical tip.
    // Tips and purchases share the popup + per-amount sound (the original
    // ran the same emoji-tier popup off either event).
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

  // Initialize lastTipIdRef on first load so historical events don't fire.
  useEffect(() => {
    if (lastTipIdRef.current !== null) return;
    const msgs = messagesQ.data ?? [];
    const newestEvent = [...msgs]
      .reverse()
      .find(
        (m) => m.role === "system" && (m.msg_type === "tip" || m.msg_type === "purchase"),
      );
    if (newestEvent) lastTipIdRef.current = newestEvent.id;
  }, [messagesQ.data]);

  // Mark messages as read — but ONLY when the chatter is actually looking
  // at the tab (matches the original Roleplaychatters _isLooking() check at
  // index.html line 2456). Otherwise the examiner sees the double check
  // even when the chatter never opened the link, which is misleading.
  useEffect(() => {
    if (!sessionId || !claimed) return;
    const isLooking = () => !document.hidden && document.hasFocus();
    const tryMark = () => {
      if (!isLooking()) return;
      callChatterApi("mark-read", { sessionId }).catch(() => {});
    };
    tryMark();
    document.addEventListener("visibilitychange", tryMark);
    window.addEventListener("focus", tryMark);
    return () => {
      document.removeEventListener("visibilitychange", tryMark);
      window.removeEventListener("focus", tryMark);
    };
  }, [messagesQ.data, sessionId, claimed]);

  const sendMut = useMutation({
    mutationFn: async (content: string) => callChatterApi("send", { sessionId, content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chatter-public-messages", sessionId] });
    },
  });

  const sendVaultItemMut = useMutation({
    mutationFn: async ({
      item,
      price,
      caption,
    }: {
      item: ChatterVaultItem;
      price: number | null;
      caption: string;
    }) =>
      callChatterApi("send", {
        sessionId,
        content: caption || null,
        images: [item.url],
        ...(price && price > 0 ? { price, msgType: "purchase" as const } : {}),
      }),
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

  const handleFileUpload = async (file: File) => {
    if (!sessionId) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Archivo muy grande", {
        description: "Máximo 8 MB. Comprime la imagen antes de enviar.",
      });
      return;
    }
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const upload = await callChatterApi("upload-image", {
        sessionId,
        fileName: file.name,
        contentType: file.type,
        base64,
      });
      // Optional caption from current input
      const caption = input.trim();
      setInput("");
      await callChatterApi("send", {
        sessionId,
        content: caption || null,
        images: [upload.url],
      });
      qc.invalidateQueries({ queryKey: ["chatter-public-messages", sessionId] });
      toast.success("Imagen enviada");
    } catch (e) {
      toast.error("No se pudo subir", { description: (e as Error).message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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

  // Countdown shared across the left timer and any other display.
  const startMs = session.started_at
    ? new Date(session.started_at).getTime()
    : new Date(session.created_at).getTime();
  const remainingMs = startMs + session.duration_minutes * 60_000 - now;
  const timerLow = remainingMs > 0 && remainingMs < 5 * 60_000;
  const timerExpired = remainingMs <= 0;

  return (
    // Three-column layout (matches the original Roleplaychatters chatter view,
    // index.html ~line 2497). Left = conversations + timer, center = chat,
    // right = full character info. Stacks below md so it stays usable on
    // narrow screens.
    <div className="flex h-screen flex-col bg-background md:flex-row">
      {/* LEFT — conversations + timer */}
      <aside className="hidden w-[260px] shrink-0 flex-col border-r bg-card md:flex">
        <div className="border-b p-5">
          <div className="mb-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Conversaciones
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
            <div className="aspect-square h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-purple-600 to-amber-500">
              {fanAvatar && (
                <img src={fanAvatar} alt={fanName} className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{fanName}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                en línea
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 p-5">
          <div
            className={`rounded-xl bg-muted p-4 text-center font-mono text-3xl font-bold ${
              timerExpired ? "text-rose-500" : timerLow ? "text-amber-400" : "text-amber-500"
            }`}
          >
            {formatRemaining(remainingMs)}
          </div>
          <div className="mt-3 text-center text-xs text-muted-foreground">
            {session.status === "waiting"
              ? "El temporizador iniciará al primer mensaje"
              : timerExpired
              ? "Tiempo agotado"
              : "Tiempo restante"}
          </div>
        </div>
      </aside>

      {/* CENTER — chat */}
      <section className="flex min-w-0 flex-1 flex-col">
        {/* Chat header */}
        <header className="flex items-center justify-between gap-3 border-b bg-card px-5 py-3">
          {/* Mobile-only: the fan avatar sits in the chat header since the
              left rail is hidden below md. */}
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <div className="aspect-square h-8 w-8 overflow-hidden rounded-full bg-muted">
              {fanAvatar && <img src={fanAvatar} alt={fanName} className="h-full w-full object-cover" />}
            </div>
            <div className="truncate text-sm font-semibold">{fanName}</div>
          </div>
          <span className="hidden text-sm font-bold md:inline">Chat con {fanName}</span>
          <div className="flex items-center gap-2">
            {/* Mobile timer chip */}
            <div className="md:hidden flex items-center gap-1 rounded-md bg-muted px-2 py-1 font-mono text-xs">
              <Clock className="h-3 w-3" />
              {formatRemaining(remainingMs)}
            </div>
            <VolumeControl />
          </div>
        </header>

        {/* Persona reminder (slim bar) */}
        {profile && (
          <div className="border-b bg-amber-500/5 px-5 py-2 text-xs">
            <span className="text-muted-foreground">Estás interpretando a </span>
            <strong className="text-foreground">{profile.name}</strong>
            {examinerTyping && (
              <span className="ml-2 text-muted-foreground">· {fanName} escribiendo…</span>
            )}
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
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
                readByOther={session.read_by_examiner_at ?? null}
                onOpenMedia={(url) => setMediaUrl(url)}
              />
            ))}
          </div>
        </div>

        {/* Emoji bar (in-memory). The original places it just above the
            composer row, not full-width like a popover. */}
        <EmojiBar
          emojis={chatterEmojis}
          onPick={(e) => setInput((v) => v + e)}
          onAdd={(e) => setChatterEmojis((curr) => (curr.includes(e) ? curr : [...curr, e]))}
          onRemove={(e) => setChatterEmojis((curr) => curr.filter((x) => x !== e))}
        />

        {/* Composer row */}
        <div className="border-t bg-card p-3">
          <div className="flex items-end gap-2">
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
            <Button
              onClick={() => fileInputRef.current?.click()}
              size="icon"
              variant="outline"
              title="Subir foto / video"
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </Button>
            <Button
              onClick={() => setVaultOpen(true)}
              size="icon"
              variant="outline"
              title="Vault del personaje"
              disabled={!profile}
            >
              <FolderOpen className="h-4 w-4" />
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
      </section>

      {/* RIGHT — full character info (matches the original right panel) */}
      <aside className="hidden w-[340px] shrink-0 overflow-y-auto border-l bg-card md:block">
        {profile && <CharacterInfoPanel profile={profile} />}
      </aside>

      {/* Vault drawer */}
      <VaultPickerDialog
        open={vaultOpen}
        onOpenChange={setVaultOpen}
        items={vaultQ.data ?? []}
        loading={vaultQ.isLoading}
        profileName={profile?.name ?? ""}
        onSend={async ({ item, price, caption }) => {
          try {
            await sendVaultItemMut.mutateAsync({ item, price, caption });
            setVaultOpen(false);
            toast.success(price ? `Enviado como compra ($${price})` : "Item enviado");
          } catch (e) {
            toast.error("No se pudo enviar", { description: (e as Error).message });
          }
        }}
        sending={sendVaultItemMut.isPending}
      />

      <MediaViewer url={mediaUrl} onClose={() => setMediaUrl(null)} />
      <TipPopup amount={tipAmount} onDone={() => setTipAmount(null)} />
    </div>
  );
};

interface VaultPickerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: ChatterVaultItem[];
  loading: boolean;
  profileName: string;
  onSend: (args: { item: ChatterVaultItem; price: number | null; caption: string }) => void | Promise<void>;
  sending: boolean;
}

const VaultPickerDialog = ({
  open,
  onOpenChange,
  items,
  loading,
  profileName,
  onSend,
  sending,
}: VaultPickerProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [priceStr, setPriceStr] = useState("");
  const [caption, setCaption] = useState("");

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setPriceStr("");
      setCaption("");
    }
  }, [open]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  const handleSend = () => {
    if (!selected) return;
    const price = priceStr.trim() ? parseFloat(priceStr) : NaN;
    onSend({
      item: selected,
      price: isNaN(price) || price <= 0 ? null : price,
      caption: caption.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Vault de {profileName}</DialogTitle>
          <DialogDescription>
            Selecciona un item para enviarlo al fan. Si pones un precio, se manda como compra (PPV).
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
              <p className="text-sm">El vault está vacío.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {items.map((item) => {
                const isSelected = selectedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`group relative aspect-square overflow-hidden rounded-md border-2 transition-colors ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    {item.media_type === "video" ? (
                      <>
                        <video
                          src={item.url}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                          <Play className="h-6 w-6 text-white" />
                        </div>
                      </>
                    ) : (
                      <img
                        src={item.url}
                        alt={item.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selected && (
          <div className="space-y-3 border-t pt-3">
            <div className="flex items-center gap-3">
              <div className="aspect-square h-14 w-14 overflow-hidden rounded">
                {selected.media_type === "video" ? (
                  <video src={selected.url} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  <img src={selected.url} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                <div className="truncate text-foreground">{selected.name}</div>
                <div>{selected.media_type}</div>
              </div>
              <Button
                onClick={() => setSelectedId(null)}
                size="icon"
                variant="ghost"
                aria-label="Quitar selección"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_140px]">
              <Input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Mensaje opcional (ej. 'mira esto baby 😏')"
              />
              <Input
                type="number"
                min={0}
                step={1}
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                placeholder="Precio $ (opcional)"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={!selected || sending} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ChatterPublicView;
