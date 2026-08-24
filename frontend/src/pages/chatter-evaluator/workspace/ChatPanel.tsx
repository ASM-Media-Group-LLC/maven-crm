import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Send, DollarSign, Loader2, MessageCircle, Check, CheckCheck, Paperclip, Clock, Pencil, Link2, Square, X as XIcon, Mic, MicOff, SmilePlus, MoreVertical, History, Trash2, Play, Reply } from "lucide-react";
import { GifPicker } from "@/pages/inbox/GifPicker";
import { StickerPicker } from "@/pages/inbox/StickerPicker";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ScriptsButton } from "@/components/chat/ScriptsButton";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { EmojiBar, DEFAULT_EMOJIS } from "./EmojiBar";
import { VolumeControl, getSoundVolume } from "./VolumeControl";
import { playMessageNotification } from "@/lib/notificationSound";
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
  useDeleteExaminerMessage,
  useEditExaminerMessage,
  useToggleMessageReaction,
  useAutoEndExpiredChatterSession,
} from "@/hooks/useChatterEvaluator";
import { useAuth } from "@/hooks/useAuth";
import { useMyProfile } from "@/hooks/useUserProfile";
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
import type { ChatterSession, ChatterMessage, ChatterProfile } from "../types";

interface Props {
  session: ChatterSession | null;
  /** Callback opcional para deseleccionar la sesión actual y dejar el
   *  panel del chat vacío. Si se pasa, renderea un botón X en el header
   *  del chat. Útil cuando hay una sesión cerrada "trabada" en la
   *  vista y el usuario quiere volver al estado vacío. */
  onClose?: () => void;
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

// Set chico de emojis para el picker rápido. Si el usuario quiere
// algo distinto, lo agregamos al backend después; estos cubren ~95%
// de las reacciones típicas en chats.
const QUICK_REACTIONS = ["👍", "❤️", "🔥", "😂", "😮", "👀", "🙏", "🎉"] as const;

// Renderea los chips de reacciones bajo una burbuja de mensaje.
// Cada chip muestra el emoji + el conteo (si > 1). Click sobre un chip
// togglea la reacción del user actual con ese emoji. Si el user actual
// es uno de los que reaccionaron con ese emoji, el chip se ve activado.
// MediaThumb — renderea una preview clickeable. Si la URL apunta a un
// video (extensión común), usa <video preload="metadata"> + el fragment
// `#t=0.1` para forzar a que el browser cargue el primer frame como
// thumbnail; superpone un ícono de Play para que el usuario sepa que
// es video. Para imágenes, <img loading="lazy"> normal. Click llama
// onClick — el caller abre el MediaViewer (que también auto-detecta
// kind por extensión).
const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v|avi|mkv|hevc)(\?|#|$)/i;
const isVideoUrl = (u: string) => VIDEO_EXT_RE.test(u);
// GIF: Giphy/Tenor los sirven como .mp4. Se muestran reproduciéndose solos (autoplay+loop+muted),
// no como video con botón de play (que obligaba a hacer zoom para verlos animados).
const GIF_URL_RE = /(giphy|tenor)\.com|\.gif(\?|#|$)/i;
const isGifUrl = (u: string) => GIF_URL_RE.test(u);

const MediaThumb = ({
  url,
  onClick,
  className,
}: {
  url: string;
  onClick: () => void;
  className?: string;
}) => {
  const isGif = isGifUrl(url);
  if (isGif) {
    // .gif nativo → <img> (anima solo); Giphy/Tenor .mp4 → <video> autoplay+loop+muted.
    const gifIsImg = /\.gif(\?|#|$)/i.test(url);
    return gifIsImg ? (
      <img
        src={url}
        alt="GIF"
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={className}
      />
    ) : (
      <video
        src={url}
        autoPlay
        loop
        muted
        playsInline
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={className}
      />
    );
  }
  const isVideo = isVideoUrl(url);
  if (isVideo) {
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

const ReactionsRow = ({
  reactions,
  currentUserId,
  align,
  onToggle,
}: {
  reactions: ChatterMessage["reactions"];
  currentUserId: string | null;
  align: "left" | "right";
  onToggle: (emoji: string) => void;
}) => {
  if (!reactions || reactions.length === 0) return null;
  // Agrupamos por emoji manteniendo el orden de primera aparición.
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
  const list = Array.from(groups.values());
  return (
    <div
      className={`mt-0.5 flex flex-wrap gap-1 ${
        align === "right" ? "justify-end" : "justify-start"
      }`}
    >
      {list.map((g) => {
        const mine = currentUserId ? g.userIds.has(currentUserId) : false;
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

// Botón flotante que aparece al hover en una burbuja, con popover
// pickeable de emojis rápidos. Click → onToggle(emoji) y cierra el
// popover.
const ReactionPickerButton = ({
  align,
  onToggle,
}: {
  align: "left" | "right";
  onToggle: (emoji: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`absolute top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-background text-muted-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity hover:bg-muted hover:text-foreground group-hover/bubble:opacity-100 data-[state=open]:opacity-100 ${
            align === "right" ? "left-[-30px]" : "right-[-30px]"
          }`}
          title="Reaccionar"
          aria-label="Reaccionar"
        >
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-1" align={align === "right" ? "end" : "start"}>
        <div className="flex gap-0.5">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onToggle(e);
                setOpen(false);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-muted"
              title={`Reaccionar con ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
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
  onDelete,
  onEdit,
  onShowHistory,
  currentUserId,
  onToggleReaction,
  onReply,
  repliedTo,
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
  /** Examiner-side delete (sets deleted='full'). Only invoked from the
   *  3-dot menu on the examiner's own (fan-role) bubbles. */
  onDelete: (msg: ChatterMessage) => void;
  /** Examiner-side edit. Opens an edit dialog whose Save action calls
   *  the useEditExaminerMessage mutation. */
  onEdit: (msg: ChatterMessage) => void;
  /** Examiner-only history viewer for edited messages. */
  onShowHistory: (msg: ChatterMessage) => void;
  /** Auth user id del que está mirando el chat — para saber si SU
   *  reacción está activa en cada emoji. */
  currentUserId: string | null;
  /** Toggle de reacción para este mensaje en particular. */
  onToggleReaction: (msg: ChatterMessage, emoji: string) => void;
  /** Citar este mensaje (reply) — setea el replyTo del composer. */
  onReply: (msg: ChatterMessage) => void;
  /** El mensaje al que ESTE responde (resuelto por el parent), o null. */
  repliedTo: ChatterMessage | null;
}) => {
  if (msg.deleted === "full") return null;

  // Texto corto del mensaje citado para la previsualización (reply).
  const quotePreview = (m: ChatterMessage): string =>
    (m.content?.trim() || (m.images && m.images.length > 0 ? "📷 Foto" : "mensaje"));
  const quoteAuthor = (m: ChatterMessage): string =>
    m.role === "fan" ? fanName : profile?.name ?? "chatter";

  if (msg.role === "system") {
    // Tip / purchase pill (matches .msg-tip / purchase variant in the
    // original — gold gradient + border for tips, green for purchases).
    const isTip = msg.msg_type === "tip";
    const isPurchase = msg.msg_type === "purchase";
    if ((isTip || isPurchase) && msg.price) {
      const cls = isPurchase
        ? "border-emerald-500 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-emerald-400"
        : "border-amber-500 bg-gradient-to-br from-amber-500/20 to-amber-500/5 text-amber-400";
      // Wording desde la perspectiva del EXAMINER (que ES JavixBuster):
      // "You purchased X content" / "You sent X a $Y tip" — la versión
      // chatter-perspective vive en ChatterPublicView.
      const modelName = profile?.name ?? "the model";
      const label = isPurchase
        ? `You purchased ${modelName} content`
        : `You sent ${modelName} a $${msg.price} usd tip`;
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

  const isFan = msg.role === "fan";
  const name = isFan ? fanName : profile?.name ?? "chatter";
  const avatar = isFan ? fanAvatar : profile?.avatar_url ?? null;
  // Priced PPV bubble: chatter sent images with a price > 0. The examiner
  // can flip the purchased state with the $ button on the side.
  const isPriced = !isFan && (msg.price ?? 0) > 0 && msg.images && msg.images.length > 0;

  return (
    // Alignment estilo WhatsApp / iMessage desde el punto de vista del
    // examiner: SUS mensajes (role='fan') van a la DERECHA con color
    // primario; los del chatter (role='chatter') van a la IZQUIERDA en
    // tono neutral. Antes estaba al revés y resultaba confuso.
    <div className={`flex gap-2 ${isFan ? "flex-row-reverse" : ""}`}>
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
      <div className={`flex max-w-[70%] flex-col ${isFan ? "items-end" : "items-start"}`}>
        <span className="text-xs font-semibold text-foreground/80">{name}</span>
        {/* Cita del mensaje al que ESTE responde (reply) — como WhatsApp. */}
        {repliedTo && (
          <div className={`mb-1 max-w-full overflow-hidden rounded-md border-l-2 border-primary/60 bg-muted/60 px-2 py-1 ${isFan ? "self-end" : "self-start"}`}>
            <div className="text-[10px] font-semibold text-primary/80">{quoteAuthor(repliedTo)}</div>
            <div className="max-w-[240px] truncate text-[11px] text-muted-foreground">{quotePreview(repliedTo)}</div>
          </div>
        )}
        {(msg.content || msg.deleted === "chatter") && (
          <div
            className={`group/bubble relative rounded-2xl px-3 py-1.5 ${
              msg.deleted === "chatter"
                ? "rounded-bl-sm bg-rose-500 text-white"
                : isFan
                ? "rounded-br-sm bg-gradient-to-br from-accent to-primary text-white shadow-sm"
                : "rounded-bl-sm bg-muted text-foreground"
            }`}
          >
            {/* Examiner keeps seeing the chatter's original message even
                after the chatter soft-deletes it — the bubble just turns
                rose and gets a small "eliminado" tag below the body. */}
            {msg.content}
            {msg.edited_at && (
              <button
                type="button"
                onClick={() => onShowHistory(msg)}
                className="ml-1 text-[10px] italic opacity-60 hover:opacity-100 hover:underline"
                title="Ver historial de cambios"
              >
                (editado)
              </button>
            )}
            {msg.deleted === "chatter" && (
              <div className="mt-0.5 text-[10px] italic opacity-90">eliminado</div>
            )}
            {/* Examiner-side 3-dot menu. Posicionado del lado del avatar
                (top-right para mensajes del fan/examiner, que están right-
                aligned con avatar a la derecha) — matching el chatter side
                para que ambos lados se sientan consistentes. El emoji
                picker vive del lado opuesto. Editar / Eliminar / Historial
                — Historial solo cuando el mensaje fue editado. */}
            {isFan && (
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
                  {msg.edited_at && (msg.content_history?.length ?? 0) > 0 && (
                    <DropdownMenuItem onClick={() => onShowHistory(msg)}>
                      <History className="mr-2 h-3.5 w-3.5" />
                      Historial de cambios
                    </DropdownMenuItem>
                  )}
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
            {/* Reacción rápida — del lado OPUESTO al avatar (y al 3-dot
                menu), así el bubble queda con menú+avatar de un lado y
                el picker del otro. Para mensajes del fan (right-aligned,
                avatar a la derecha) el picker va a la izquierda; para
                mensajes del chatter (left-aligned, avatar a la izquierda)
                va a la derecha. */}
            <ReactionPickerButton
              align={isFan ? "right" : "left"}
              onToggle={(emoji) => onToggleReaction(msg, emoji)}
            />
            {/* Botón de responder (citar) — aparece al hover, en la esquina superior
                del lado OPUESTO al avatar (no choca con el menú 3-puntos ni el picker). */}
            <button
              type="button"
              onClick={() => onReply(msg)}
              className={`absolute -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-background text-muted-foreground opacity-0 shadow-sm ring-1 ring-border transition-opacity hover:bg-muted hover:text-foreground group-hover/bubble:opacity-100 ${isFan ? "-left-2" : "-right-2"}`}
              title="Responder (citar)"
              aria-label="Responder"
            >
              <Reply className="h-3 w-3" />
            </button>
          </div>
        )}
        {msg.images && msg.images.length > 0 && (
          <>
            {isPriced ? (
              // PPV bubble — orange when unbought, green once purchased.
              // Buy button vive a la DERECHA del bubble (junto al
              // avatar/menu del examiner) en lugar de a la izquierda
              // — más natural: "el examiner hace click cerca de su
              // propio side del chat".
              <div className="mt-1 mr-12">
                <div
                  className={`relative inline-block rounded-[14px] border-2 p-1 ${
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
                  <button
                    type="button"
                    onClick={() => onPurchase(msg)}
                    disabled={msg.purchased || purchasing}
                    title={msg.purchased ? "Comprado" : `Comprar — $${msg.price}`}
                    className={`absolute right-[-44px] top-1/2 z-[5] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border-2 text-base font-bold shadow-md transition-all ${
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
                  <MediaThumb
                    key={i}
                    url={url}
                    onClick={() => onOpenMedia(url)}
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
        <ReactionsRow
          reactions={msg.reactions ?? []}
          currentUserId={currentUserId}
          align={isFan ? "right" : "left"}
          onToggle={(emoji) => onToggleReaction(msg, emoji)}
        />
      </div>
    </div>
  );
};

// Ding de mensaje nuevo → tono "Pulso" unificado (Web Audio, sin asset),
// respetando el slider de volumen del Chatter Evaluator. Los tips siguen con
// sus mp3 en TipPopup.
const playPing = () => playMessageNotification(getSoundVolume());

const formatRemaining = (ms: number): string => {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export const ChatPanel = ({ session }: Props) => {
  const messagesQ = useChatterMessages(session?.id ?? null);

  // Auto-end client-side cuando el tiempo expira (3ra capa de defensa,
  // junto a pg_cron y chatter-public edge function).
  useAutoEndExpiredChatterSession(session);
  const profilesQ = useChatterProfiles();
  const configQ = useChatterConfig();
  const sendMut = useSendChatterMessage();
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  // Reply/cita: mensaje al que el examinador está respondiendo (null = ninguno).
  const [replyTo, setReplyTo] = useState<ChatterMessage | null>(null);

  // Dictado por voz nativo del navegador (Web Speech API) — sin LLMs ni
  // APIs externas. Toggleable: click → empieza a escuchar y mete los
  // chunks reconocidos al input. Click otra vez → para. Si el usuario
  // tipea a mano mientras dicta, el anchor sigue al texto editado para
  // que el siguiente chunk de voz se anexe al final.
  const [listening, setListening] = useState(false);
  const speechAnchorRef = useRef<string>("");
  const speechRecRef = useRef<unknown | null>(null);
  const speechSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, []);
  const toggleDictation = () => {
    if (listening) {
      const r = speechRecRef.current as { stop?: () => void } | null;
      r?.stop?.();
      speechRecRef.current = null;
      setListening(false);
      return;
    }
    if (!speechSupported) {
      toast.error("Tu navegador no soporta dictado por voz", {
        description: "Prueba con Chrome, Edge o Safari.",
      });
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor() as {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: ((e: { results: unknown }) => void) | null;
      onerror: ((e: { error?: string }) => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "es-ES";
    rec.onresult = (ev) => {
      const results = ev.results as unknown as Array<{ 0: { transcript: string }; isFinal: boolean }>;
      let interim = "";
      let finalText = "";
      for (let i = 0; i < results.length; i++) {
        const txt = results[i][0]?.transcript ?? "";
        if (results[i].isFinal) finalText += txt;
        else interim += txt;
      }
      const text = (finalText + interim).trim();
      if (!text) return;
      const base = speechAnchorRef.current;
      const sep = base && !base.endsWith(" ") && !base.endsWith("\n") ? " " : "";
      setInput(base + sep + text);
    };
    rec.onerror = (e) => {
      if (e.error && e.error !== "aborted") {
        toast.error("Dictado por voz", { description: e.error });
      }
      setListening(false);
      speechRecRef.current = null;
    };
    rec.onend = () => {
      setListening(false);
      speechRecRef.current = null;
    };
    speechAnchorRef.current = input;
    try {
      rec.start();
      speechRecRef.current = rec;
      setListening(true);
    } catch (e) {
      toast.error("No se pudo iniciar el dictado", { description: (e as Error).message });
    }
  };
  const lastMessageIdRef = useRef<string | null>(null);
  // Tracks which session the message refs are calibrated for. Switching
  // sessions (clicking another chat in the sidebar) reloads the messages
  // query with a brand-new last id — without this guard the effect below
  // saw "different last message id" and fired the notification ping for
  // every chat switch.
  const lastSessionIdRef = useRef<string | null>(null);
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
  const deleteMsgMut = useDeleteExaminerMessage();
  const editMsgMut = useEditExaminerMessage();
  const reactionMut = useToggleMessageReaction();
  const { user: authUser } = useAuth();
  const profileQ = useMyProfile();
  const currentUserId = authUser?.id ?? null;
  const currentUserName =
    profileQ.data?.full_name?.trim() ||
    authUser?.user_metadata?.full_name?.trim() ||
    authUser?.email ||
    "Sin nombre";

  const handleToggleReaction = (msg: ChatterMessage, emoji: string) => {
    if (!currentUserId || !session) return;
    reactionMut.mutate(
      {
        messageId: msg.id,
        sessionId: session.id,
        emoji,
        userId: currentUserId,
        userName: currentUserName,
      },
      {
        onError: (e) => {
          toast.error("No se pudo guardar la reacción", {
            description: (e as Error).message,
          });
        },
      },
    );
  };
  const endMut = useEndChatterSession();
  const [endOpen, setEndOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const chatFontSize = useChatFontSize();
  const [confirmDelMsg, setConfirmDelMsg] = useState<ChatterMessage | null>(null);
  const [editMsg, setEditMsg] = useState<ChatterMessage | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [historyMsg, setHistoryMsg] = useState<ChatterMessage | null>(null);
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

  // Auto-cierra la sesión cuando expires_at se cumple. El examiner ya
  // tiene un botón "+ tiempo" para extender — el cierre automático
  // sólo aplica cuando NO se extendió. Una sola llamada con un ref de
  // guard para que el setInterval no dispare endSession dos veces si
  // el realtime tarda en propagar el status='ended'.
  const autoEndedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!session?.id) return;
    if (session.status === "ended") return;
    if (!session.expires_at) return;
    const expires = new Date(session.expires_at).getTime();
    if (Number.isNaN(expires)) return;
    if (Date.now() < expires) return;
    if (autoEndedRef.current === session.id) return;
    autoEndedRef.current = session.id;
    endMut.mutate(session.id, {
      onError: () => {
        // Si falla la primera vez, dejar que el siguiente tick reintente.
        autoEndedRef.current = null;
      },
    });
  }, [now, session?.id, session?.status, session?.expires_at, endMut]);

  // Play ping when a NEW message arrives from the chatter (not on initial load)
  // and fire the tip popup whenever a brand-new tip system message lands.
  // The baseline lives PER SESSION and waits until messagesQ.data is
  // actually defined — otherwise a hard refresh would treat the just-
  // fetched messages as "new" and replay the last tip's animation.
  useEffect(() => {
    const msgs = messagesQ.data;
    const sid = session?.id ?? null;
    if (!sid || msgs === undefined) return;

    // First time we have data for this session → baseline silently.
    // Covers both the initial mount case AND the page-refresh case
    // where existing tips were getting replayed.
    if (lastSessionIdRef.current !== sid) {
      lastSessionIdRef.current = sid;
      lastMessageIdRef.current = msgs[msgs.length - 1]?.id ?? null;
      const baselineEvent = [...msgs]
        .reverse()
        .find((m) => m.role === "system" && (m.msg_type === "tip" || m.msg_type === "purchase"));
      lastTipIdRef.current = baselineEvent?.id ?? null;
      return;
    }

    if (msgs.length === 0) {
      // Empty session — keep refs null so the FIRST incoming message
      // counts as new (the previous `prevLastId &&` truthy check
      // suppressed it, which is why the very first chatter message
      // / tip after opening a fresh session never played its sound).
      lastMessageIdRef.current = null;
      lastTipIdRef.current = null;
      return;
    }
    const last = msgs[msgs.length - 1];
    const prevLastId = lastMessageIdRef.current;
    lastMessageIdRef.current = last.id;
    // Fire on any *change* of last-message id (including null → id), as
    // long as it's a chatter message. The session-switch branch above
    // already baselines lastMessageIdRef for sessions that load with
    // pre-existing messages, so this won't fire on initial mount.
    if (prevLastId !== last.id && last.role === "chatter") {
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
      const prevTipId = lastTipIdRef.current;
      lastTipIdRef.current = newestEvent.id;
      // Fire popup whenever the newest tip/purchase id changes, including
      // from null. The session-switch branch baselines this ref for
      // sessions that load with pre-existing tips, so we won't replay
      // on initial mount.
      if (prevTipId !== newestEvent.id && newestEvent.price) {
        setTipAmount(newestEvent.price);
        playTipSound(newestEvent.price);
      }
    }
  }, [messagesQ.data, session?.id]);

  // Realtime via Broadcast nativo de Supabase (no postgres_changes).
  //
  // Por qué Broadcast: postgres_changes evalúa RLS por cada row y se rompe
  // silenciosamente bajo carga multi-cliente o con policies que tienen
  // joins/funciones. Tras 5 migraciones intentando estabilizarlo (denormalize
  // examiner_user_id, dropear global policy, republicar tabla...) decidimos
  // moverlo a Broadcast — push directo servidor→canal, sin WAL ni RLS-por-row,
  // recomendación oficial de Supabase para chat-like.
  //
  // El trigger AFTER INSERT en chatter_messages invoca realtime.send() con
  // topic = 'chatter-session:{session_id}' y event = 'new_message'. Acá nos
  // suscribimos a ese mismo topic y, al recibir el evento, invalidamos la
  // query — el refetch trae el mensaje completo con RLS aplicado.
  useEffect(() => {
    if (!session?.id) return;
    const channel = supabase
      .channel(`chatter-session:${session.id}`)
      .on(
        "broadcast",
        { event: "new_message" },
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
    const replyId = replyTo?.id ?? null;
    setInput("");
    setReplyTo(null);
    try {
      await sendMut.mutateAsync({
        sessionId: session.id,
        role: "fan",
        msgType: "message",
        content,
        fromExaminer: true,
        replyToId: replyId,
      });
      // Clear typing indicator after send
      void supabase
        .from("chatter_sessions" as never)
        .update({ typing_fan: false, typing_fan_at: null } as never)
        .eq("id", session.id as never);
    } catch (e) {
      toast.error("No se pudo enviar", { description: (e as Error).message });
      setInput(content); // restore
    } finally {
      // Devuelve el foco al textarea después del send. Sin esto, el
      // `disabled={sendMut.isPending}` lo suelta cuando arranca el
      // mutate y nunca vuelve, así que el siguiente keypress no
      // entra al textarea (lo que el examiner sentía como "me saca
      // del cajón de chat").
      textareaRef.current?.focus();
    }
  };

  // Typing indicator — port of the original Roleplaychatters pattern
  // (index.html line 2017). Throttled timestamp write; the chatter side
  // auto-expires the bubble client-side when typing_fan_at ages beyond
  // TYPING_TIMEOUT_MS, so we don't need an explicit "stop typing" call
  // and can't leave the bubble stuck on a closed tab.
  const TYPING_THROTTLE_MS = 1500;
  const lastTypingWriteRef = useRef<number>(0);
  const writeTypingFan = () => {
    if (!session) return;
    const now = Date.now();
    if (now - lastTypingWriteRef.current < TYPING_THROTTLE_MS) return;
    lastTypingWriteRef.current = now;
    void supabase
      .from("chatter_sessions" as never)
      .update({
        typing_fan: true,
        typing_fan_at: new Date().toISOString(),
      } as never)
      .eq("id", session.id as never);
  };
  const cancelTypingFan = () => {
    lastTypingWriteRef.current = 0;
    if (!session) return;
    void supabase
      .from("chatter_sessions" as never)
      .update({ typing_fan: false, typing_fan_at: null } as never)
      .eq("id", session.id as never);
  };
  const handleInputChange = (val: string) => {
    setInput(val);
    if (listening) speechAnchorRef.current = val;
    if (!session) return;
    if (val.length > 0) writeTypingFan();
    else cancelTypingFan();
  };

  // Best-effort cancelTypingFan on tab hide / unmount so the chatter sees
  // the bubble disappear instantly. Without this they'd wait the
  // TYPING_TIMEOUT_MS auto-expire (~3.5 s) — fine, but feels snappier.
  useEffect(() => {
    if (!session?.id) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") cancelTypingFan();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", cancelTypingFan);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", cancelTypingFan);
      cancelTypingFan();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  // Mark messages as read by examiner — but only when the tab is actually
  // visible AND the window has focus. Otherwise the chatter would see a
  // double check even though the examiner has the tab in the background.
  // Mirrors the original _isLooking() guard (index.html line 2456).
  useEffect(() => {
    if (!session) return;
    const sid = session.id;
    const markIfLooking = async () => {
      if (document.hidden || !document.hasFocus()) return;
      const msgs = messagesQ.data ?? [];
      const hasUnread = msgs.some(
        (m) =>
          m.role === "chatter" &&
          (!session.read_by_examiner_at ||
            new Date(m.created_at) > new Date(session.read_by_examiner_at)),
      );
      if (!hasUnread) return;
      // Optimistic local update first — the sidebar badge clears
      // instantly. If the server UPDATE later fails, the realtime
      // round-trip (or the next refetch) will restore the real count.
      qc.setQueryData<Record<string, number>>(
        ["chatter-sessions-unread"],
        (prev) => ({ ...(prev ?? {}), [sid]: 0 }),
      );
      // Await the actual UPDATE so we know it landed before we ask
      // the server to recompute counts. Previously this was fire-and-
      // forget which raced with the invalidate, occasionally leaving
      // the badge stuck.
      const { error } = await supabase
        .from("chatter_sessions" as never)
        .update({ read_by_examiner_at: new Date().toISOString() } as never)
        .eq("id", sid as never);
      if (error) {
        // Roll back the optimistic 0 so the user doesn't lose the badge
        // for a session that genuinely still has unread messages.
        qc.invalidateQueries({ queryKey: ["chatter-sessions-unread"] });
        return;
      }
      qc.invalidateQueries({ queryKey: ["chatter-sessions-unread"] });
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
      const replyId = replyTo?.id ?? null;
      setInput("");
      setReplyTo(null);
      await sendMut.mutateAsync({
        sessionId: session.id,
        role: "fan",
        msgType: "message",
        content: caption || null,
        images: [pub.publicUrl],
        fromExaminer: true,
        replyToId: replyId,
      });
      toast.success("Imagen enviada");
    } catch (e) {
      toast.error("No se pudo subir", { description: (e as Error).message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Enviar un GIF (Giphy mp4, URL externa estable). Se manda como media; la burbuja
  // renderea las URLs de video con <video> (isVideoUrl) → se ve el GIF.
  const sendGifUrl = async (mp4Url: string) => {
    if (!session) return;
    const replyId = replyTo?.id ?? null;
    setReplyTo(null);
    try {
      await sendMut.mutateAsync({
        sessionId: session.id,
        role: "fan",
        msgType: "message",
        images: [mp4Url],
        fromExaminer: true,
        replyToId: replyId,
      });
    } catch (e) {
      toast.error("No se pudo enviar el GIF", { description: (e as Error).message });
    }
  };

  // Enviar un sticker. El picker (StickerPicker de la bandeja) devuelve una URL FIRMADA del
  // bucket privado creator-files que EXPIRA a 7 días → en un chat persistente la imagen se
  // rompería. Lo descargamos y re-subimos al bucket PÚBLICO chatter-vault para una URL
  // permanente, y mandamos esa.
  const sendStickerUrl = async (signedUrl: string) => {
    if (!session) return;
    const replyId = replyTo?.id ?? null;
    setUploading(true);
    try {
      const resp = await fetch(signedUrl);
      if (!resp.ok) throw new Error("no se pudo leer el sticker");
      const blob = await resp.blob();
      const ext = blob.type.includes("gif") ? "gif" : "webp";
      const path = `_chat_uploads/${session.id}/sticker-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("chatter-vault")
        .upload(path, blob, { contentType: blob.type || "image/webp", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("chatter-vault").getPublicUrl(path);
      setReplyTo(null);
      await sendMut.mutateAsync({
        sessionId: session.id,
        role: "fan",
        msgType: "message",
        images: [pub.publicUrl],
        fromExaminer: true,
        replyToId: replyId,
      });
    } catch (e) {
      toast.error("No se pudo enviar el sticker", { description: (e as Error).message });
    } finally {
      setUploading(false);
    }
  };

  // Envío unificado del ChatComposer: sube los adjuntos (staged: pegados o elegidos) al
  // bucket público chatter-vault y manda UN mensaje con todas las imágenes + el caption + la
  // cita. Throwea ante error → el composer conserva texto+adjuntos para reintentar.
  const composerSend = async (text: string, files: File[]) => {
    if (!session) return;
    const replyId = replyTo?.id ?? null;
    try {
      const images: string[] = [];
      if (files.length > 0) {
        setUploading(true);
        for (const file of files) {
          if (file.size > 50 * 1024 * 1024) throw new Error(`${file.name || "archivo"}: máximo 50 MB`);
          const sanitized =
            (file.name || "upload").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) ||
            `upload-${Date.now()}`;
          const path = `_chat_uploads/${session.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${sanitized}`;
          const { error: upErr } = await supabase.storage
            .from("chatter-vault")
            .upload(path, file, { upsert: false, contentType: file.type || undefined });
          if (upErr) throw upErr;
          images.push(supabase.storage.from("chatter-vault").getPublicUrl(path).data.publicUrl);
        }
      }
      if (!text && images.length === 0) return;
      await sendMut.mutateAsync({
        sessionId: session.id,
        role: "fan",
        msgType: "message",
        content: text || null,
        images,
        fromExaminer: true,
        replyToId: replyId,
      });
      setReplyTo(null);
      void supabase
        .from("chatter_sessions" as never)
        .update({ typing_fan: false, typing_fan_at: null } as never)
        .eq("id", session.id as never);
    } catch (e) {
      toast.error("No se pudo enviar", { description: (e as Error).message });
      throw e; // el composer mantiene texto + adjuntos
    } finally {
      setUploading(false);
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
    // `relative` para que TipPopup (absolute inset-0) se contenga dentro
    // del ChatPanel en vez de cubrir toda la viewport.
    <div className="relative flex h-full flex-col">
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

            {/* Volume + Actions (right). Botones icon-only para no
                ocupar tanto ancho — hover muestra el tooltip nativo
                con el texto descriptivo. */}
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <VolumeControl />
              <Button
                size="icon"
                variant="outline"
                onClick={handleCopyLink}
                title="Copiar link para el chatter"
                aria-label="Copiar link para el chatter"
                className="h-8 w-8"
              >
                {linkCopied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="icon"
                variant="outline"
                onClick={() => {
                  setAddTimeValue("10");
                  setAddTimeOpen(true);
                }}
                disabled={ended}
                title="Añadir tiempo a la sesión"
                aria-label="Añadir tiempo a la sesión"
                className="h-8 w-8"
              >
                <Clock className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setEndOpen(true)}
                disabled={ended}
                title="Terminar la sesión de chat"
                aria-label="Terminar la sesión de chat"
                className="h-8 w-8 border-rose-500/60 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
              >
                <Square className="h-4 w-4 fill-current" />
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
        {messages
          .filter((m) => m.deleted !== "full")
          .map((m) => (
          <MessageBubble
            key={m.id}
            msg={m}
            fanName={fanName}
            fanAvatar={fanAvatar}
            profile={profile}
            readByOther={session?.read_by_chatter_at ?? null}
            onOpenMedia={(url) => setMediaUrl(url)}
            onDelete={(target) => setConfirmDelMsg(target)}
            onEdit={(target) => {
              setEditMsg(target);
              setEditDraft(target.content ?? "");
            }}
            onShowHistory={(target) => setHistoryMsg(target)}
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
            currentUserId={currentUserId}
            onToggleReaction={handleToggleReaction}
            onReply={(target) => {
              setReplyTo(target);
              textareaRef.current?.focus();
            }}
            repliedTo={m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) ?? null : null}
          />
        ))}
      </div>

      {/* Composer unificado (<ChatComposer>): emojis ARRIBA · texto AL MEDIO (auto-crece) ·
          acciones ABAJO. Pegar imagen/video del portapapeles → preview + se manda al enviar.
          Solo se muestra con la sesión abierta (ended = solo lectura). */}
      {session.status !== "ended" && (
        <ChatComposer
          value={input}
          onChange={handleInputChange}
          onSend={composerSend}
          placeholder={`Mensaje como ${fanName}…`}
          busy={uploading}
          emojis={examinerEmojis}
          onAddEmoji={(e) => persistEmojis([...examinerEmojis, e])}
          onRemoveEmoji={(e) => persistEmojis(examinerEmojis.filter((x) => x !== e))}
          emojiTrailing={<FontZoom />}
          replyBar={
            replyTo ? (
              <div className="flex items-center gap-2 rounded-md border-l-2 border-primary bg-muted/50 px-2 py-1.5">
                <Reply className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-primary">
                    Respondiendo a {replyTo.role === "fan" ? fanName : profile?.name ?? "chatter"}
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
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            ) : null
          }
          toolbarExtra={
            <>
              <GifPicker onPick={sendGifUrl} disabled={uploading} />
              <StickerPicker onPick={sendStickerUrl} disabled={uploading} />
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Enviar tip"
                    className="h-9 w-9 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
                  >
                    <DollarSign className="h-4 w-4" strokeWidth={3} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start" side="top">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Tip rápido</div>
                  <div className="grid grid-cols-3 gap-1">
                    {[5, 10, 20, 50, 100, 200].map((amt) => (
                      <Button key={amt} size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleSendTip(amt)}>
                        ${amt}
                      </Button>
                    ))}
                  </div>
                  <Button size="sm" variant="ghost" className="mt-1 w-full text-xs" onClick={() => handleSendTip()}>
                    Otro monto…
                  </Button>
                </PopoverContent>
              </Popover>
              {speechSupported && (
                <Button
                  onClick={toggleDictation}
                  size="icon"
                  variant={listening ? "default" : "ghost"}
                  title={listening ? "Detener dictado" : "Dictar (Web Speech)"}
                  className={listening ? "h-9 w-9 bg-rose-500 text-white hover:bg-rose-500/90" : "h-9 w-9 text-muted-foreground"}
                >
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              )}
              {/* Scripts en último lugar (antes de Enviar), pedido del owner. */}
              <ScriptsButton
                surface="chatter"
                disabled={uploading}
                onUse={(s) => {
                  if (s.send_on_click) void composerSend(s.text, []);
                  else setInput((v) => (v.trim() ? v.trimEnd() + " " : "") + s.text);
                }}
              />
            </>
          }
        />
      )}

      <MediaViewer url={mediaUrl} onClose={() => setMediaUrl(null)} />
      <TipPopup amount={tipAmount} onDone={() => setTipAmount(null)} />

      {/* Edit-message dialog. Pre-fills the textarea with the current
          content; Save calls useEditExaminerMessage which appends the
          old version to content_history before writing the new one. */}
      <Dialog
        open={!!editMsg}
        onOpenChange={(o) => {
          if (!o) {
            setEditMsg(null);
            setEditDraft("");
          } else if (editMsg) {
            setEditDraft(editMsg.content ?? "");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar mensaje</DialogTitle>
            <DialogDescription>
              El chatter va a ver el texto nuevo + una pequeña tag
              "(editado)" debajo de la burbuja.
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
            <Button
              variant="outline"
              onClick={() => {
                setEditMsg(null);
                setEditDraft("");
              }}
              disabled={editMsgMut.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!editMsg || !session) return;
                const next = editDraft.trim();
                if (!next || next === (editMsg.content ?? "").trim()) {
                  setEditMsg(null);
                  setEditDraft("");
                  return;
                }
                editMsgMut.mutate(
                  { sessionId: session.id, messageId: editMsg.id, newContent: next },
                  {
                    onSuccess: () => {
                      setEditMsg(null);
                      setEditDraft("");
                    },
                    onError: (err) =>
                      toast.error("No se pudo editar", {
                        description: (err as Error).message,
                      }),
                  },
                );
              }}
              disabled={editMsgMut.isPending || !editDraft.trim()}
            >
              {editMsgMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog — examiner-only. Newest version at the top, with
          the current (post-edit) content shown as the first card so the
          user always sees the full timeline at a glance. */}
      <Dialog open={!!historyMsg} onOpenChange={(o) => !o && setHistoryMsg(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Historial del mensaje</DialogTitle>
            <DialogDescription>
              {historyMsg?.content_history?.length ?? 0} versión(es) anterior(es).
              La actual es la que ve el chatter ahora.
            </DialogDescription>
          </DialogHeader>
          {historyMsg && (
            <div className="space-y-2">
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  <span>Actual</span>
                  {historyMsg.edited_at && (
                    <span className="font-normal normal-case text-muted-foreground">
                      editada {new Date(historyMsg.edited_at).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="whitespace-pre-wrap text-sm">{historyMsg.content}</div>
              </div>
              {(historyMsg.content_history ?? []).map((h, i) => (
                <div key={i} className="rounded-lg border bg-muted/30 p-3">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {i === 0 ? "Versión previa" : `Versión hace ${i + 1}`}
                    {h.edited_at && (
                      <span className="ml-2 font-normal normal-case">
                        ({new Date(h.edited_at).toLocaleString()})
                      </span>
                    )}
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{h.content || <em className="opacity-60">(vacío)</em>}</div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete-message confirm — same Maven-styled AlertDialog as the
          other destructive flows, no native browser prompt. */}
      <AlertDialog open={!!confirmDelMsg} onOpenChange={(o) => !o && setConfirmDelMsg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar mensaje</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelMsg
                ? `¿Eliminar este mensaje? Desaparece para ti y el chatter. No se puede deshacer.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMsgMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 hover:bg-rose-600"
              onClick={(e) => {
                e.preventDefault();
                if (!confirmDelMsg || !session) return;
                deleteMsgMut.mutate(
                  { sessionId: session.id, messageId: confirmDelMsg.id },
                  {
                    onSuccess: () => setConfirmDelMsg(null),
                    onError: (err) =>
                      toast.error("No se pudo eliminar", { description: (err as Error).message }),
                  },
                );
              }}
              disabled={deleteMsgMut.isPending}
            >
              {deleteMsgMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
