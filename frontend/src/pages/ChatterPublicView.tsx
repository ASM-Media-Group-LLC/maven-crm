import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Send, Loader2, Lock, AlertTriangle, FolderOpen, X, Image as ImageIcon, Play, Paperclip, Clock, Check, CheckCheck, SmilePlus as Smile, MoreVertical, Trash2, Pencil, Reply } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { EmojiBar, DEFAULT_EMOJIS } from "@/pages/chatter-evaluator/workspace/EmojiBar";
import { VolumeControl, playSoundFile } from "@/pages/chatter-evaluator/workspace/VolumeControl";
import { MediaViewer } from "@/pages/chatter-evaluator/workspace/MediaViewer";
import { TipPopup, playTipSound } from "@/pages/chatter-evaluator/workspace/TipPopup";
import {
  FontZoom,
  ThemeToggle,
  LangSelect,
  useChatFontSize,
  useChatterLang,
  pVal,
} from "@/pages/chatter-evaluator/workspace/ChatToolbar";
import { CharacterInfoPanel } from "@/pages/chatter-evaluator/workspace/CharacterInfoPanel";
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
import { supabaseAnon } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type {
  ChatterSession,
  ChatterMessage,
  ChatterProfile,
  ChatterConfig,
  ChatterVaultItem,
} from "@/pages/chatter-evaluator/types";

// IMPORTANTE: usamos supabaseAnon (cliente sin sesión) y NO el global,
// para que las queries del link público se evalúen como anon aunque el
// visitante esté logueado en otra parte de Maven. Las políticas RLS de
// chatter_sessions / chatter_messages / chatter_profiles para anon ya
// están escritas con USING (status <> 'ended'); con el cliente global
// + JWT autenticado, esas policies no aplican y el user solo ve sus
// propias sesiones, dando "Sesión no disponible".
const sb = supabaseAnon as unknown as { from: (t: string) => any };

const DEVICE_KEY = "maven.chatter.deviceId";

const getDeviceId = (): string => {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
};

// Per-session tab claim — matches the original Roleplaychatters tab lock
// (index.html line 2364 onward). Each tab writes its own UUID + a fresh
// timestamp every 2 seconds to localStorage. A claim is "stale" after 6s
// (3× heartbeat) and can be silently taken over. A *fresh* claim from
// another tab triggers the "Use here / Cancel" prompt before stealing it.
const TAB_HEARTBEAT_MS = 2000;
const TAB_STALE_MS = 6000;
const tabKey = (sessionId: string) => `maven.chatter.tab.${sessionId}`;

interface TabClaim {
  tabId: string;
  ts: number;
}
const readTabClaim = (sessionId: string): TabClaim | null => {
  try {
    const raw = localStorage.getItem(tabKey(sessionId));
    return raw ? (JSON.parse(raw) as TabClaim) : null;
  } catch {
    return null;
  }
};
const writeTabClaim = (sessionId: string, tabId: string) => {
  try {
    localStorage.setItem(tabKey(sessionId), JSON.stringify({ tabId, ts: Date.now() }));
  } catch {
    /* no-op */
  }
};
const clearTabClaim = (sessionId: string, tabId: string) => {
  const c = readTabClaim(sessionId);
  if (c?.tabId === tabId) localStorage.removeItem(tabKey(sessionId));
};

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
};

// Tag used by callers to silently swallow expected post-session-end
// errors (set-typing, mark-read, etc.) without showing a toast — once
// the examiner ends the session the chatter UI is about to switch to
// the "session ended" screen anyway, so a 403 from the edge function
// during that window is noise, not a real failure.
class SessionEndedError extends Error {
  readonly sessionEnded = true;
  constructor() {
    super("session ended");
  }
}

const callChatterApi = async (action: string, payload: Record<string, unknown>) => {
  // supabaseAnon en vez del global por la misma razón que las queries:
  // si un Maven user abre el link logueado, su JWT NO debe viajar a una
  // edge function pensada para acceso público. La función internamente
  // usa service role y valida por sessionId.
  const { data, error } = await supabaseAnon.functions.invoke("chatter-public", {
    body: { action, ...payload },
  });
  if (error) {
    // The edge function returns 403 with body { error: "session ended" }
    // when status='ended'. supabase-js wraps the non-2xx into FunctionsHttpError
    // which doesn't expose the body cleanly, so we tag any error after the
    // local cache says ended. We re-throw the wrapped sentinel so callers
    // can decide whether to show a toast or stay quiet.
    throw error;
  }
  if (!data?.ok) {
    if (data?.error === "session ended" || data?.error === "session not found") {
      throw new SessionEndedError();
    }
    throw new Error(data?.error || "chatter-public returned !ok");
  }
  return data;
};

const isSessionEndedError = (e: unknown): boolean => {
  if (e instanceof SessionEndedError) return true;
  const msg = e instanceof Error ? e.message : "";
  // FunctionsHttpError wraps the response — Supabase doesn't expose the
  // status cleanly across versions, so match by message. Also catches the
  // generic "Edge Function returned a non-2xx status code" the user saw.
  return /session ended|session not found|non-2xx status/i.test(msg);
};

// MediaThumb — preview clickeable. Si la URL apunta a un video,
// usa <video preload="metadata"> + fragment `#t=0.1` para forzar el
// primer frame como póster + ícono Play encima. Para imágenes, <img>
// normal. El MediaViewer auto-detecta video por extensión también.
const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v|avi|mkv|hevc)(\?|#|$)/i;
const isVideoUrl = (u: string) => VIDEO_EXT_RE.test(u);

const MediaThumb = ({
  url,
  onClick,
  className,
}: {
  url: string;
  onClick: () => void;
  className?: string;
}) => {
  if (isVideoUrl(url)) {
    return (
      <div className="relative inline-block">
        <video
          src={`${url}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className={className}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white shadow-lg">
            <Play className="h-5 w-5 fill-current" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={className}
    />
  );
};

// Quick reactions strip — same set as the examiner side. Tapping one
// toggles the reaction via the chatter-public edge function (which
// runs the toggle logic with service_role to bypass RLS).
const QUICK_REACTIONS = ["❤️", "😂", "🔥", "😮", "😢", "👍"] as const;

// Renderea los chips de reacciones bajo una burbuja. Mismo formato que
// la versión del examiner (ReactionsRow en ChatPanel) — agrupa por emoji
// y muestra el conteo si hay más de uno. Sólo lectura desde aquí; el
// toggle se hace desde el picker.
const ReactionsRowChatter = ({
  reactions,
  myUserId,
  align,
  onToggle,
}: {
  reactions: ChatterMessage["reactions"];
  myUserId: string;
  align: "left" | "right";
  onToggle: (emoji: string) => void;
}) => {
  if (!reactions || reactions.length === 0) return null;
  const groups = new Map<
    string,
    { emoji: string; count: number; userIds: Set<string>; names: string[] }
  >();
  for (const r of reactions) {
    const slot = groups.get(r.emoji) ?? {
      emoji: r.emoji,
      count: 0,
      userIds: new Set<string>(),
      names: [],
    };
    slot.count += 1;
    slot.userIds.add(r.user_id);
    slot.names.push(r.user_name);
    groups.set(r.emoji, slot);
  }
  return (
    <div
      className={`mt-0.5 flex flex-wrap gap-1 ${
        align === "right" ? "justify-end" : "justify-start"
      }`}
    >
      {Array.from(groups.values()).map((g) => {
        const mine = g.userIds.has(myUserId);
        return (
          <button
            key={g.emoji}
            type="button"
            onClick={() => onToggle(g.emoji)}
            title={g.names.join(", ")}
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors ${
              mine
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border bg-muted/50 text-foreground hover:bg-muted"
            }`}
          >
            <span>{g.emoji}</span>
            {g.count > 1 && (
              <span className="text-[10px] tabular-nums">{g.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

// Reaction picker — mirrors the examiner-side ReactionPickerButton in
// look + behavior so the two sides feel consistent. Hover-only on
// desktop (group-hover/bubble:opacity-100) so the icon doesn't clutter
// every message; on touch devices it stays at half opacity (the
// `opacity-50` baseline) so the chatter can still tap it.
const ReactionPickerChatter = ({
  align,
  onPick,
}: {
  align: "left" | "right";
  onPick: (emoji: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`absolute top-1/2 -translate-y-1/2 ${
        align === "right" ? "left-[-30px]" : "right-[-30px]"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-background text-muted-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity hover:bg-muted hover:text-foreground hover:opacity-100 group-hover/bubble:opacity-100 data-[state=open]:opacity-100"
        title="Reaccionar"
        aria-label="Reaccionar"
        data-state={open ? "open" : "closed"}
      >
        <Smile className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 flex gap-0.5 rounded-md border bg-popover p-1 shadow-md z-10">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onPick(e);
                setOpen(false);
              }}
              className="rounded p-1 text-base transition-colors hover:bg-muted"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  /** Synthetic user_id for the chatter — `chatter:${sessionId}`. Used to
   *  highlight which reactions are theirs, mirrors the userId the
   *  edge-function `react` action stamps on inserts. */
  myReactionId: string;
  /** Toggle a reaction on a message. Calls the chatter-public edge
   *  function; the function applies the server-side toggle. */
  onReact: (msg: ChatterMessage, emoji: string) => void;
  /** Chatter-side edit. Opens the edit dialog whose Save action calls
   *  the chatter-public edge function's "edit-message" action. */
  onEdit: (msg: ChatterMessage) => void;
  /** Chatter-side soft delete (deleted='chatter'). The bubble disappears
   *  here but the examiner still sees the "(mensaje eliminado por el
   *  chatter)" placeholder. Only invoked from the chatter's own bubbles. */
  onDelete: (msg: ChatterMessage) => void;
  /** El mensaje al que ESTE responde (reply/cita), resuelto por el parent, o null. */
  repliedTo: ChatterMessage | null;
  /** Citar este mensaje (reply) — setea el replyTo del composer del chatter. */
  onReply: (msg: ChatterMessage) => void;
}

const Bubble = ({ msg, fanName, fanAvatar, profile, side, readByOther, onOpenMedia, onDelete, onEdit, myReactionId, onReact, repliedTo, onReply }: BubbleProps) => {
  if (msg.deleted === "full") return null;

  const quoteAuthor = (m: ChatterMessage): string =>
    m.role === "fan" ? fanName : profile?.name ?? "chatter";
  const quotePreview = (m: ChatterMessage): string =>
    (m.content?.trim() || (m.images && m.images.length > 0 ? "📷 Foto" : "mensaje"));

  if (msg.role === "system") {
    const isTip = msg.msg_type === "tip";
    const isPurchase = msg.msg_type === "purchase";
    if ((isTip || isPurchase) && msg.price) {
      const cls = isPurchase
        ? "border-emerald-500 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-emerald-400"
        : "border-amber-500 bg-gradient-to-br from-amber-500/20 to-amber-500/5 text-amber-400";
      const label = isPurchase
        ? `${fanName} purchased your content`
        : `${fanName} sent you a $${msg.price} usd tip`;
      return (
        <div className="my-2 flex justify-center">
          <div className={`flex w-full max-w-[420px] items-center gap-2.5 rounded-xl border px-5 py-2 ${cls}`}>
            <span className="text-lg">{isPurchase ? "🎉" : "💸"}</span>
            <span className="flex-1 text-xs font-semibold">{label}</span>
            {isPurchase && (
              <span className="ml-auto text-sm font-extrabold text-foreground">
                ${msg.price} USD
              </span>
            )}
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
        <span className="text-xs font-semibold text-foreground/80">{name}</span>
        {/* Cita del mensaje al que ESTE responde (reply) — como WhatsApp. */}
        {repliedTo && (
          <div className={`mb-1 max-w-full overflow-hidden rounded-md border-l-2 border-primary/60 bg-muted/60 px-2 py-1 ${isMine ? "self-end" : "self-start"}`}>
            <div className="text-[10px] font-semibold text-primary/80">{quoteAuthor(repliedTo)}</div>
            <div className="max-w-[240px] truncate text-[11px] text-muted-foreground">{quotePreview(repliedTo)}</div>
          </div>
        )}
        {(msg.content || msg.deleted === "chatter") && (
          <div
            className={`group/bubble relative rounded-2xl px-3.5 py-2 ${
              isMine
                ? "rounded-br-sm bg-primary text-primary-foreground"
                : "rounded-bl-sm bg-muted text-foreground"
            }`}
          >
            {msg.content}
            {/* Chatter-side message menu — 3-dot dropdown matching the
                examiner's pattern. Only one action ("Eliminar") because
                edit + history are examiner-only. The chatter never sees
                the "(editado)" tag either: that's intentional, the
                examiner's edits should look seamless to the chatter. */}
            {isMine && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-background text-muted-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity hover:bg-muted hover:text-foreground group-hover/bubble:opacity-100 data-[state=open]:opacity-100"
                    title="Opciones del mensaje"
                    aria-label="Opciones del mensaje"
                  >
                    <MoreVertical className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => onEdit(msg)}>
                    <Pencil className="mr-2 h-3.5 w-3.5" />
                    Editar mensaje
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onDelete(msg)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Eliminar mensaje
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {/* Reaction picker — flota al lado opuesto a la cola del
                bubble (left para mensajes del fan, right para los del
                chatter). */}
            <ReactionPickerChatter
              align={isMine ? "right" : "left"}
              onPick={(emoji) => onReact(msg, emoji)}
            />
            {/* Botón de responder (citar) — esquina superior del lado opuesto a la cola. */}
            <button
              type="button"
              onClick={() => onReply(msg)}
              className={`absolute -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-background text-muted-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity hover:bg-muted hover:text-foreground group-hover/bubble:opacity-100 ${isMine ? "-left-2" : "-right-2"}`}
              title="Responder (citar)"
              aria-label="Responder"
            >
              <Reply className="h-3 w-3" />
            </button>
          </div>
        )}
        <ReactionsRowChatter
          reactions={msg.reactions ?? []}
          myUserId={myReactionId}
          align={isMine ? "right" : "left"}
          onToggle={(emoji) => onReact(msg, emoji)}
        />
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
                  <MediaThumb
                    key={i}
                    url={url}
                    onClick={() => onOpenMedia(url)}
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
                <MediaThumb
                  key={i}
                  url={url}
                  onClick={() => onOpenMedia(url)}
                  className="max-h-[200px] max-w-[200px] cursor-zoom-in rounded-[12px] border border-border object-cover"
                />
              ))}
            </div>
          )
        )}
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {formatTime(msg.created_at)}
          {/* Read indicator (single/double check) is examiner-only feature.
              The chatter never sees whether the examiner has read their
              messages — they just see the timestamp. */}
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

const TabLockedScreen = () => (
  <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
    <Lock className="h-12 w-12 text-amber-500" />
    <h1 className="text-xl font-bold">Sesión abierta en otra pestaña</h1>
    <p className="max-w-sm text-sm text-muted-foreground">
      Esta sesión se está usando en otra pestaña de este navegador.
    </p>
  </div>
);

const TabTakeoverScreen = ({
  onUseHere,
  onCancel,
}: {
  onUseHere: () => void;
  onCancel: () => void;
}) => (
  <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
    <div className="text-5xl">👥</div>
    <h1 className="text-xl font-bold">¿Usar esta sesión aquí?</h1>
    <p className="max-w-sm text-sm text-muted-foreground">
      Ya hay otra pestaña usando esta sesión. Si continúas, la otra pestaña se cerrará.
    </p>
    <div className="mt-2 flex gap-3">
      <Button variant="outline" onClick={onCancel}>Cancelar</Button>
      <Button onClick={onUseHere}>Usar aquí</Button>
    </div>
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

const ChatterPublicView = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  // Reply/cita: mensaje al que el chatter está respondiendo (null = ninguno).
  const [replyTo, setReplyTo] = useState<ChatterMessage | null>(null);
  const [locked, setLocked] = useState(false);
  const [claimed, setClaimed] = useState(false);
  // Tab-lock state. "checking" while we read localStorage, "prompt" if a
  // live claim from another tab exists (user picks Use here / Cancel),
  // "active" once we own the claim, "blocked" after taking over the loser
  // sees a permanent locked screen.
  const [tabState, setTabState] = useState<"checking" | "prompt" | "active" | "blocked">(
    "checking",
  );
  const tabIdRef = useRef<string>(crypto.randomUUID());
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
  // Bandera explícita de "ya snapshoteé el primer load". No alcanza con
  // mirar `lastTipIdRef === null` porque ese ref también queda null cuando
  // el chatter abre el link SIN tips históricos — y entonces el primer tip
  // en vivo se trataría como histórico y no animaría.
  const tipInitializedRef = useRef<boolean>(false);
  const [confirmDelMsg, setConfirmDelMsg] = useState<ChatterMessage | null>(null);
  const [editMsg, setEditMsg] = useState<ChatterMessage | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deletingMsg, setDeletingMsg] = useState(false);
  const lastMessageIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  // ----- Tab lock (per-browser) ---------------------------------------------
  // Run once per sessionId. Decides whether to take over silently (no live
  // claim, or stale), prompt the user (live claim from another tab), or
  // claim free.
  useEffect(() => {
    if (!sessionId) return;
    const myTabId = tabIdRef.current;
    const existing = readTabClaim(sessionId);
    const isFresh = existing && Date.now() - (existing.ts ?? 0) < TAB_STALE_MS;
    if (existing && existing.tabId !== myTabId && isFresh) {
      setTabState("prompt");
    } else {
      writeTabClaim(sessionId, myTabId);
      setTabState("active");
    }
    const onUnload = () => clearTabClaim(sessionId, myTabId);
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
      clearTabClaim(sessionId, myTabId);
    };
  }, [sessionId]);

  // Heartbeat + storage listener once we own the claim. If another tab
  // takes over (writes a new tabId for our key), we lock ourselves.
  useEffect(() => {
    if (!sessionId || tabState !== "active") return;
    const myTabId = tabIdRef.current;
    const heartbeat = setInterval(() => writeTabClaim(sessionId, myTabId), TAB_HEARTBEAT_MS);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== tabKey(sessionId)) return;
      try {
        const v = e.newValue ? (JSON.parse(e.newValue) as TabClaim) : null;
        if (v && v.tabId !== myTabId) {
          clearInterval(heartbeat);
          setTabState("blocked");
        }
      } catch {
        /* no-op */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("storage", onStorage);
    };
  }, [sessionId, tabState]);

  // Claim device on mount, refresh every 20s while open. Only runs once we
  // own the local tab claim (otherwise two tabs in the same browser would
  // race against the strict device lock).
  useEffect(() => {
    if (!sessionId || tabState !== "active") return;
    // Don't even try to claim if we already know the session is over —
    // saves a guaranteed 403 round-trip and the user-facing toast.
    if (sessionQ.data?.status === "ended") return;
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
        } else if (isSessionEndedError(e)) {
          // The examiner closed the session mid-claim. The session-ended
          // screen takes over from sessionQ; no need to toast a "couldn't
          // join" error on top of it.
          return;
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
  }, [sessionId, tabState, sessionQ.data?.status]);

  // Realtime via Broadcast (no postgres_changes). Ver comentario en
  // ChatPanel.tsx — postgres_changes era inestable en multi-cliente y
  // lo migramos a un trigger AFTER INSERT que invoca realtime.send.
  //
  // Canal compartido con el ChatPanel del examiner: cuando cualquiera
  // de los dos lados inserta, ambos reciben el broadcast e invalidan
  // su query de mensajes. El bucket de session updates (typing/read_at)
  // sigue por postgres_changes en un canal aparte porque no está en el
  // hot path del bug (la inestabilidad apareció bajo carga de inserts
  // de mensajes).
  useEffect(() => {
    if (!sessionId || !claimed) return;
    const channel = supabaseAnon
      .channel(`chatter-session:${sessionId}`)
      .on(
        "broadcast",
        { event: "new_message" },
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
      supabaseAnon.removeChannel(channel);
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
      tipInitializedRef.current = false;
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
      const isInitial = !tipInitializedRef.current;
      lastTipIdRef.current = newestEvent.id;
      if (!isInitial && newestEvent.price) {
        setTipAmount(newestEvent.price);
        playTipSound(newestEvent.price);
        // Bottom-right toast (matches showToast in the original index.html
        // line 3664). The center popup gets the user's eyes; the toast is
        // the persistent confirmation that stays for ~7s.
        const isPurchase = newestEvent.msg_type === "purchase";
        const who = configQ.data?.fan_name ?? "JavixBuster";
        toast(
          isPurchase ? "🎉 ¡Felicidades!" : "💸 ¡Recibiste un tip!",
          {
            description: isPurchase
              ? `${who} compró tu contenido — $${newestEvent.price}`
              : `$${newestEvent.price} USD`,
            duration: 7000,
            className: isPurchase
              ? "border-emerald-500 [&_[data-title]]:text-emerald-400"
              : "border-amber-500 [&_[data-title]]:text-amber-400",
          },
        );
      }
    }
  }, [messagesQ.data, configQ.data]);

  // Initialize lastTipIdRef + tipInitializedRef en el primer load para que
  // (a) tips históricos no disparen animación al reabrir el chat, y
  // (b) el ref de inicialización quede marcado incluso cuando NO hay tips
  // históricos — así el primer tip en vivo sí dispara la animación.
  useEffect(() => {
    if (tipInitializedRef.current) return;
    const msgs = messagesQ.data;
    if (!msgs) return; // todavía cargando
    const newestEvent = [...msgs]
      .reverse()
      .find(
        (m) => m.role === "system" && (m.msg_type === "tip" || m.msg_type === "purchase"),
      );
    lastTipIdRef.current = newestEvent?.id ?? null;
    tipInitializedRef.current = true;
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
    mutationFn: async (vars: { content: string; replyToId?: string | null }) =>
      callChatterApi("send", { sessionId, content: vars.content, replyToId: vars.replyToId ?? null }),
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
    const replyId = replyTo?.id ?? null;
    setInput("");
    setReplyTo(null);
    try {
      await sendMut.mutateAsync({ content: text, replyToId: replyId });
      callChatterApi("set-typing", { sessionId, typing: false }).catch(() => {});
    } catch (e) {
      if (!isSessionEndedError(e)) {
        toast.error("No se pudo enviar", { description: (e as Error).message });
        setInput(text);
      }
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
      if (!isSessionEndedError(e)) {
        toast.error("No se pudo subir", { description: (e as Error).message });
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Typing indicator — port of the original Roleplaychatters pattern
  // (index.html line 2017). Sender stamps `typing_chatter_at = now()`
  // throttled to 1 write per 1.5 s on input change. Receiver subscribes
  // via realtime and auto-hides the bubble when the timestamp ages
  // beyond TYPING_TIMEOUT_MS (3.5 s). No explicit "stop typing" message
  // is needed — the indicator self-clears, which means a closed tab or
  // a dropped realtime event can't leave the bubble stuck.
  const TYPING_THROTTLE_MS = 1500;
  const lastTypingWriteRef = useRef<number>(0);
  const writeTyping = () => {
    if (!sessionId) return;
    const now = Date.now();
    if (now - lastTypingWriteRef.current < TYPING_THROTTLE_MS) return;
    lastTypingWriteRef.current = now;
    callChatterApi("set-typing", { sessionId, typing: true }).catch(() => {});
  };
  const cancelTyping = () => {
    lastTypingWriteRef.current = 0;
    if (!sessionId) return;
    callChatterApi("set-typing", { sessionId, typing: false }).catch(() => {});
  };
  const handleInputChange = (val: string) => {
    setInput(val);
    if (!sessionId) return;
    if (val.length > 0) writeTyping();
    else cancelTyping();
  };

  // Best-effort cancelTyping on page hide / unmount so the receiver's
  // indicator clears immediately instead of waiting for the 3.5 s
  // client-side auto-expire. Not strictly needed (the timeout would
  // catch it), but feels snappier.
  useEffect(() => {
    if (!sessionId) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") cancelTyping();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", cancelTyping);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", cancelTyping);
      cancelTyping();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const session = sessionQ.data;
  const profile = profileQ.data ?? null;
  const config = configQ.data ?? null;
  const messages = messagesQ.data ?? [];

  const fanName = config?.fan_name ?? "JavixBuster";
  const fanAvatar = config?.fan_avatar_url ?? "/JavixBuster.png";

  // Per-tab UI prefs that mirror the original Roleplaychatters chatter
  // header: language (ES/EN), font size (A-/A+), and theme is handled by
  // next-themes through the shared ThemeToggle.
  const [lang] = useChatterLang();
  const fontSize = useChatFontSize();

  // Total spent by the fan — sum of every system tip/purchase price.
  // Mirrors chatterTotalSpent in the original (index.html line 2643).
  const totalSpent = useMemo(
    () =>
      messages.reduce(
        (sum, m) =>
          m.role === "system" && (m.msg_type === "tip" || m.msg_type === "purchase")
            ? sum + (m.price ?? 0)
            : sum,
        0,
      ),
    [messages],
  );

  // Locale-aware character/persona name (used in placeholders, persona bar).
  const personaName =
    pVal(profile as unknown as Record<string, unknown>, "name", lang) || profile?.name || "el personaje";

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
  if (tabState === "blocked") return <TabLockedScreen />;
  if (tabState === "prompt") {
    return (
      <TabTakeoverScreen
        onUseHere={() => {
          // Stealing the claim — the previous tab's `storage` listener will
          // see the new tabId and lock itself.
          writeTabClaim(sessionId!, tabIdRef.current);
          setTabState("active");
        }}
        onCancel={() => setTabState("blocked")}
      />
    );
  }

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
            {lang === "en" ? "Conversations" : "Conversaciones"}
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
                {lang === "en" ? "online" : "en línea"}
              </div>
              {/* Total spent — mirrors chatterTotalSpent in the original. */}
              <div className="mt-1 font-mono text-[13px] font-bold text-amber-500">
                ${totalSpent} {lang === "en" ? "spent" : "gastados"}
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 p-5">
          {session.status === "waiting" ? (
            // Original: "Esperando..." + "El temporizador iniciará al primer
            // mensaje" — the timer doesn't start ticking until the chatter
            // sends the first message (the edge function flips status to
            // 'active' and stamps started_at on first send).
            <>
              <div className="rounded-xl bg-muted p-4 text-center font-mono text-3xl font-bold text-muted-foreground">
                {lang === "en" ? "Waiting…" : "Esperando…"}
              </div>
              <div className="mt-3 text-center text-xs text-muted-foreground">
                {lang === "en"
                  ? "The timer starts on your first message"
                  : "El temporizador inicia con tu primer mensaje"}
              </div>
            </>
          ) : (
            <>
              <div
                className={`rounded-xl bg-muted p-4 text-center font-mono text-3xl font-bold ${
                  timerExpired ? "text-rose-500" : timerLow ? "text-amber-400" : "text-amber-500"
                }`}
              >
                {formatRemaining(remainingMs)}
              </div>
              <div className="mt-3 text-center text-xs text-muted-foreground">
                {timerExpired
                  ? lang === "en" ? "Time's up" : "Tiempo agotado"
                  : lang === "en" ? "Time remaining" : "Tiempo restante"}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* CENTER — chat. `relative` para que el TipPopup (absolute inset-0)
          se contenga acá adentro en vez de cubrir toda la viewport. */}
      <section className="relative flex min-w-0 flex-1 flex-col">
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
          <span className="hidden text-sm font-bold md:inline">
            {lang === "en" ? "Chat with" : "Chat con"} {fanName}
          </span>
          <div className="flex items-center gap-2">
            {/* Mobile timer chip — mientras la sesión está waiting muestra
                un placeholder (el countdown solo arranca cuando el chatter
                manda su primer mensaje). */}
            <div className="md:hidden flex items-center gap-1 rounded-md bg-muted px-2 py-1 font-mono text-xs">
              <Clock className="h-3 w-3" />
              {session.status === "waiting" ? "—:—" : formatRemaining(remainingMs)}
            </div>
            <LangSelect />
            <VolumeControl />
            <ThemeToggle />
          </div>
        </header>

        {/* Persona reminder (slim bar) */}
        {profile && (
          <div className="border-b bg-amber-500/5 px-5 py-2 text-xs">
            <span className="text-muted-foreground">
              {lang === "en" ? "You are playing " : "Estás interpretando a "}
            </span>
            <strong className="text-foreground">{personaName}</strong>
            {examinerTyping && (
              <span className="ml-2 text-muted-foreground">
                · {fanName} {lang === "en" ? "typing…" : "escribiendo…"}
              </span>
            )}
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4" style={{ fontSize: `${fontSize}px` }}>
          <div className="space-y-3">
            {messagesQ.isLoading && (
              <p className="text-xs text-muted-foreground">Cargando…</p>
            )}
            {!messagesQ.isLoading && messages.length === 0 && (
              <p className="rounded-md bg-muted/50 p-4 text-center text-xs text-muted-foreground">
                {fanName} aún no ha escrito. Espera o saluda primero como {personaName}.
              </p>
            )}
            {messages
              // Chatter never sees their own soft-deletes (the examiner
              // does, with a rose bubble + "eliminado" tag) and never
              // sees an examiner hard-delete.
              .filter((m) => m.deleted !== "chatter" && m.deleted !== "full")
              .map((m) => (
              <Bubble
                key={m.id}
                msg={m}
                repliedTo={m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) ?? null : null}
                onReply={(target) => setReplyTo(target)}
                fanName={fanName}
                fanAvatar={fanAvatar}
                profile={profile}
                side="chatter"
                readByOther={session.read_by_examiner_at ?? null}
                onOpenMedia={(url) => setMediaUrl(url)}
                onDelete={(target) => setConfirmDelMsg(target)}
                onEdit={(target) => {
                  setEditMsg(target);
                  setEditDraft(target.content ?? "");
                }}
                myReactionId={`chatter:${sessionId}`}
                onReact={(target, emoji) => {
                  callChatterApi("react", {
                    sessionId,
                    messageId: target.id,
                    emoji,
                  }).catch((e) => {
                    if (!isSessionEndedError(e)) {
                      toast.error("No se pudo reaccionar", {
                        description: (e as Error).message,
                      });
                    }
                  });
                }}
              />
            ))}
          </div>
        </div>

        {/* Emoji bar (in-memory). The original places it just above the
            composer row with the A−/A+ font-zoom buttons pushed to the
            right edge via .chat-zoom { margin-left: auto }. */}
        <EmojiBar
          emojis={chatterEmojis}
          onPick={(e) => {
            setInput((v) => v + e);
            // Devolver foco al textarea: Enter ENVÍA (no re-inserta el emoji).
            textareaRef.current?.focus();
          }}
          onAdd={(e) => setChatterEmojis((curr) => (curr.includes(e) ? curr : [...curr, e]))}
          onRemove={(e) => setChatterEmojis((curr) => curr.filter((x) => x !== e))}
          trailing={<FontZoom />}
        />

        {/* Composer row */}
        <div className="border-t bg-card p-3">
          {/* Barra de cita (reply) — el chatter también puede citar mensajes. */}
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 rounded-md border-l-2 border-primary bg-muted/50 px-2 py-1.5">
              <Reply className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-primary">
                  Respondiendo a {replyTo.role === "fan" ? fanName : personaName}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {replyTo.content?.trim() || (replyTo.images && replyTo.images.length > 0 ? "📷 Foto" : "mensaje")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Cancelar respuesta"
                aria-label="Cancelar respuesta"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
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
              ref={textareaRef}
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={`Responder como ${personaName}…`}
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

        {/* TipPopup contenido dentro del CENTER (section relative) — sólo
            cubre el chat, no la viewport entera. */}
        <TipPopup amount={tipAmount} onDone={() => setTipAmount(null)} />
      </section>

      {/* RIGHT — full character info (matches the original right panel) */}
      <aside className="hidden w-[340px] shrink-0 overflow-y-auto border-l bg-card md:block">
        {profile && <CharacterInfoPanel profile={profile} lang={lang} />}
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

      {/* Edit dialog. El chatter ve un textarea pre-llena con su
          mensaje actual. Save llama al edge function "edit-message"
          que empuja la versión vieja a content_history. */}
      <Dialog
        open={!!editMsg}
        onOpenChange={(o) => {
          if (!o) {
            setEditMsg(null);
            setEditDraft("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar mensaje</DialogTitle>
            <DialogDescription>
              El examiner va a poder ver el historial de cambios.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            rows={4}
            placeholder="Texto del mensaje…"
            className="resize-none"
          />
          <DialogFooter>
            <button
              type="button"
              className="rounded-md border px-3 py-1.5 text-sm"
              onClick={() => {
                setEditMsg(null);
                setEditDraft("");
              }}
              disabled={editSaving}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              onClick={async () => {
                if (!editMsg || !sessionId) return;
                const next = editDraft.trim();
                if (!next || next === (editMsg.content ?? "").trim()) {
                  setEditMsg(null);
                  setEditDraft("");
                  return;
                }
                setEditSaving(true);
                try {
                  await callChatterApi("edit-message", {
                    sessionId,
                    messageId: editMsg.id,
                    newContent: next,
                  });
                  setEditMsg(null);
                  setEditDraft("");
                } catch (e) {
                  if (!isSessionEndedError(e)) {
                    toast.error("No se pudo editar", {
                      description: (e as Error).message,
                    });
                  }
                } finally {
                  setEditSaving(false);
                }
              }}
              disabled={editSaving || !editDraft.trim()}
            >
              {editSaving ? "Guardando…" : "Guardar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <MediaViewer url={mediaUrl} onClose={() => setMediaUrl(null)} />

      <AlertDialog open={!!confirmDelMsg} onOpenChange={(o) => !o && setConfirmDelMsg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar mensaje</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que quieres eliminar este mensaje?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingMsg}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 hover:bg-rose-600"
              onClick={async (e) => {
                e.preventDefault();
                if (!confirmDelMsg || !session) return;
                setDeletingMsg(true);
                try {
                  await callChatterApi("delete-message", {
                    sessionId: session.id,
                    messageId: confirmDelMsg.id,
                  });
                  setConfirmDelMsg(null);
                } catch (err) {
                  toast.error("No se pudo eliminar", {
                    description: (err as Error).message,
                  });
                } finally {
                  setDeletingMsg(false);
                }
              }}
              disabled={deletingMsg}
            >
              {deletingMsg && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

// Vault price presets — same tier ladder as the examiner's quick-tip
// popover but starting at $0 (free) since the chatter often sends teaser
// content for free. The chatter MUST pick one of these (or "Otro monto…")
// before the dialog allows a send. Keeps the unit cost decision explicit
// instead of letting an empty-string default mean "free".
const VAULT_PRICE_PRESETS = [0, 5, 10, 20, 50, 100, 200] as const;
type PriceChoice = number | "custom" | null;

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
  const [priceChoice, setPriceChoice] = useState<PriceChoice>(null);
  const [customPriceStr, setCustomPriceStr] = useState("");
  const [caption, setCaption] = useState("");

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setPriceChoice(null);
      setCustomPriceStr("");
      setCaption("");
    }
  }, [open]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  // Resolve the final numeric price from the chosen tier. Returns null
  // when the user hasn't picked yet or the custom amount is empty/invalid.
  const resolvedPrice: number | null = (() => {
    if (priceChoice === null) return null;
    if (priceChoice === "custom") {
      const n = parseFloat(customPriceStr);
      return Number.isFinite(n) && n >= 0 ? n : null;
    }
    return priceChoice;
  })();

  const canSend =
    !!selected && !sending && (priceChoice !== null) &&
    (priceChoice !== "custom" || resolvedPrice !== null);

  const handleSend = () => {
    if (!canSend || !selected || resolvedPrice === null) return;
    onSend({
      item: selected,
      // 0 still means "send for free" — pass null so it goes as a normal
      // image instead of a $0 PPV bubble that nobody'd want to "buy".
      price: resolvedPrice > 0 ? resolvedPrice : null,
      caption: caption.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Vault de {profileName}</DialogTitle>
          <DialogDescription>
            Selecciona un item y elige el precio. Con un monto &gt; 0 se envía
            como compra (PPV); con "Gratis" se manda como imagen normal.
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
            <Input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Mensaje opcional (ej. 'mira esto baby 😏')"
            />

            {/* Required price tier picker — mirrors the examiner's quick-tip
                popover but with $0 (free) as a valid choice. */}
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                Precio <span className="text-rose-400">*</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {VAULT_PRICE_PRESETS.map((amt) => {
                  const active = priceChoice === amt;
                  return (
                    <Button
                      key={amt}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className={`h-8 text-xs ${
                        active && amt === 0 ? "" : active ? "bg-amber-500 text-white hover:bg-amber-600" : ""
                      }`}
                      onClick={() => {
                        setPriceChoice(amt);
                        setCustomPriceStr("");
                      }}
                    >
                      {amt === 0 ? "Gratis" : `$${amt}`}
                    </Button>
                  );
                })}
                <Button
                  type="button"
                  size="sm"
                  variant={priceChoice === "custom" ? "default" : "outline"}
                  className={`h-8 text-xs ${
                    priceChoice === "custom" ? "bg-amber-500 text-white hover:bg-amber-600" : ""
                  }`}
                  onClick={() => setPriceChoice("custom")}
                >
                  Otro…
                </Button>
              </div>
              {priceChoice === "custom" && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    autoFocus
                    value={customPriceStr}
                    onChange={(e) => setCustomPriceStr(e.target.value)}
                    placeholder="Monto"
                    className="max-w-[140px]"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={!canSend}
            title={
              !selected
                ? "Selecciona un item del vault"
                : priceChoice === null
                ? "Elige un precio (o Gratis)"
                : priceChoice === "custom" && resolvedPrice === null
                ? "Ingresa un monto válido"
                : undefined
            }
            className="gap-2"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
            {resolvedPrice !== null && resolvedPrice > 0 && ` · $${resolvedPrice}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ChatterPublicView;
