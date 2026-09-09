// Bandeja de Telegram — LECTURA + RESPONDER + asignación + INTERACCIONES (citar, reaccionar,
// borrar) + MEDIA (enviar imagen/video/audio/voz/GIF/sticker y renderizar la entrante). Layout
// calcado de la bandeja de WhatsApp (pages/inbox/InboxPage.tsx) con la identidad CELESTE de
// Telegram (gradiente #4bc0f0→#2b8fd8). Reusa los componentes de WhatsApp: GifPicker,
// StickerPicker, AudioRecorderBar y MediaLightbox.
//
// Seguridad: RLS por dueño + peer_phone REVOCADO → columnas explícitas (nunca *).
// REALTIME: esta página solo escucha tg_conversations; los INSERT de tg_messages los maneja
// la suscripción GLOBAL única de useTgInboxNotifications (AppShell), como WhatsApp.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { BotonSilenciarCanal } from "@/components/BotonSilenciarCanal";
import TelegramIcon from "@/components/icons/TelegramIcon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowLeft, Radio, Inbox as InboxIcon, Loader2, AtSign, UserCheck, Search,
  Reply, Trash2, Smile, Mic, Maximize2, X as XIcon, FileText,
  Pin, Star, Archive, MailOpen, Eraser, Instagram,
} from "lucide-react";
import { AssigneePicker } from "@/pages/inbox/AssigneePicker";
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { GifPicker } from "@/pages/inbox/GifPicker";
import { StickerPicker } from "@/pages/inbox/StickerPicker";
import { AudioRecorderBar } from "@/pages/inbox/AudioRecorder";
import { MediaLightbox, type LightboxItem } from "@/pages/inbox/MediaLightbox";
import { usePersistedEmojis } from "@/pages/chatter-evaluator/workspace/EmojiBar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useUserRole } from "@/hooks/useUserRole";
import { useLanguage } from "@/hooks/useLanguage";
import NotaDeVoz from "@/pages/messenger/components/NotaDeVoz";

// Acento del canal Telegram (mockup: --tg-grad linear-gradient(135deg,#4bc0f0,#2b8fd8)).
const TG_GRAD = "bg-gradient-to-br from-[#4bc0f0] to-[#2b8fd8]";
const TG_GRAD_R = "bg-gradient-to-r from-[#4bc0f0] to-[#2b8fd8]"; // para chips/indicadores
// Barra indicadora de la fila activa: el gradiente va en el pseudo-elemento `before:`,
// NO en la fila (si no, se pinta TODA la fila de celeste — bug que reportó el owner).
const TG_GRAD_BAR = "before:bg-gradient-to-b before:from-[#4bc0f0] before:to-[#2b8fd8]";

// Avatares de contactos sin foto: gradiente DISTINTO por peer (paleta del mockup g1..g5).
const AVATAR_GRADS = [
  "bg-gradient-to-br from-[#9b52ff] to-[#2b9bff]",
  "bg-gradient-to-br from-[#f6789b] to-[#f6a06c]",
  "bg-gradient-to-br from-[#43c6ac] to-[#3a7bd5]",
  "bg-gradient-to-br from-[#8e54e9] to-[#4776e6]",
  TG_GRAD,
];
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const avatarGrad = (peerId: string) => AVATAR_GRADS[hash(peerId) % AVATAR_GRADS.length];

// Chip de canal por fila (mismo patrón/paleta que WhatsApp: color estable por línea).
const CHANNEL_CHIP_PALETTE = [
  "bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/20",
  "bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/20",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/20",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20",
];
const channelChipClass = (key: string | null) =>
  key ? CHANNEL_CHIP_PALETTE[hash(key) % CHANNEL_CHIP_PALETTE.length] : "bg-muted text-muted-foreground";

// Fecha + hora, según idioma ("3 jul, 04:00 p. m." en ES / "Jul 3, 04:00 PM" en EN).
const fmtTime = (iso: string | null, locale = "es-CO"): string => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
};

// Reacciones rápidas (mismas que WhatsApp).
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥"];
// kind (lo que mandamos) → msg_type (lo que renderizamos), para el optimista.
const MSG_TYPE_BY_KIND: Record<string, string> = {
  image: "photo", video: "video", audio: "audio", voice: "voice", gif: "gif", sticker: "sticker", document: "document",
};
const kindForMime = (mime: string) =>
  mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "document";
const isImageType = (t: string) => t === "photo" || t === "image" || t === "sticker";

// Columnas explícitas (peer_phone está revocado para authenticated → NO se pide).
// assignees = multi-asignado N:N (tg_conversation_assignees); assigned_to queda
// como "principal" (primero del set), igual que en WhatsApp.
const CONV_COLS =
  "id, account_id, peer_id, peer_name, peer_username, status, assigned_to, last_message_at, last_message_preview, unread_count, archived, pinned, favorite, manually_unread, created_at, assignees:tg_conversation_assignees(user_id)";
const MSG_COLS =
  "id, direction, body, msg_type, media_url, sent_at, status, sender_user_id, source, reply_to_message_id, reply_to_external_id, reaction, deleted_at";

interface TgConv {
  id: string; account_id: string; peer_id: string;
  peer_name: string | null; peer_username: string | null;
  status: string | null; assigned_to: string | null;
  assignees: { user_id: string }[] | null;
  last_message_at: string | null; last_message_preview: string | null;
  unread_count: number; archived: boolean; pinned: boolean; favorite: boolean;
  manually_unread: boolean; created_at: string;
}
interface TgMsg {
  id: string; direction: "in" | "out"; body: string | null;
  msg_type: string; media_url: string | null; sent_at: string | null; status: string | null;
  sender_user_id: string | null; // closer (usuario Maven) que mandó el saliente; null si entrante
  source: string | null; // 'maven' | 'external' (enviado por fuera: celular/otro disp.) | null (entrante)
  reply_to_message_id: string | null; reply_to_external_id: string | null;
  reaction: string | null; deleted_at: string | null;
}

const peerLabel = (c: TgConv) =>
  c.peer_name || (c.peer_username ? `@${c.peer_username}` : null) || `Telegram ${c.peer_id.slice(0, 8)}`;
const initials = (c: TgConv) => {
  const label = (c.peer_name || c.peer_username || "?").replace(/^@/, "");
  const p = label.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "TG";
};

const TelegramInboxPage = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  // "← Volver" cuando se llegó desde otra pantalla (Contactos/Creadoras/Closers) vía el
  // TgChatButton, que pasa { backTo, backLabel } en el state (igual que WhatsApp).
  const location = useLocation();
  const navigate = useNavigate();
  const backNav = (location.state as { backTo?: string; backLabel?: string } | null) ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [chatFilter, setChatFilter] = useState<"todos" | "no_leidos" | "favoritos">("todos");
  const [channelFilter, setChannelFilter] = useState<string | null>(null); // account_id activo (null = todos)
  const [showArchived, setShowArchived] = useState(false);
  const [destructive, setDestructive] = useState<{ kind: "clear" | "delete"; id: string; label: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<TgMsg | null>(null);
  const [recording, setRecording] = useState(false);
  const [viewer, setViewer] = useState<{ items: LightboxItem[]; index: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [tgEmojis, setTgEmojis] = usePersistedEmojis("telegram", user?.id);
  const { canAccess } = usePermissions();
  const canAssign = canAccess("Telegram", "Asignar conversaciones");
  const { isAdmin } = useUserRole();
  const { t, language } = useLanguage();
  const dtLocale = language === "en" ? "en-US" : "es-CO";

  // Deep-link /telegram/bandeja?c=<id>
  useEffect(() => {
    const c = searchParams.get("c");
    if (c) setSelectedId(c);
  }, [searchParams]);

  // Líneas (id→label) para el filtro por canal + la etiqueta de cada fila.
  const { data: channels = [] } = useQuery({
    queryKey: ["tg-inbox-channels-min"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("tg_channels").select("account_id, label").order("label", { ascending: true });
      return (data ?? []) as { account_id: string; label: string | null }[];
    },
    refetchOnWindowFocus: false,
  });
  const channelLabel = (accountId: string | null) =>
    !accountId ? null : (channels.find((c) => c.account_id === accountId)?.label || accountId);

  const { data: conversations = [], isLoading: convLoading } = useQuery({
    queryKey: ["tg-inbox-conversations"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tg_conversations")
        .select(CONV_COLS)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as TgConv[];
    },
    refetchOnWindowFocus: false,
  });

  // Fallback del deep-link: conversación fuera del .limit(200) o recién creada.
  const inList = !!selectedId && conversations.some((c) => c.id === selectedId);
  const { data: fallbackConv = null } = useQuery({
    queryKey: ["tg-inbox-conversation-one", selectedId],
    queryFn: async () => {
      if (!selectedId) return null;
      const { data, error } = await (supabase as any)
        .from("tg_conversations").select(CONV_COLS).eq("id", selectedId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as TgConv | null;
    },
    enabled: !!selectedId && !inList,
    refetchOnWindowFocus: false,
  });

  const allConversations = useMemo(
    () =>
      fallbackConv && !conversations.some((c) => c.id === fallbackConv.id)
        ? [fallbackConv, ...conversations]
        : conversations,
    [conversations, fallbackConv],
  );

  const { data: messages = [], isLoading: msgLoading } = useQuery({
    queryKey: ["tg-inbox-messages", selectedId],
    queryFn: async () => {
      if (!selectedId) return [] as TgMsg[];
      const { data, error } = await (supabase as any)
        .from("tg_messages")
        .select(MSG_COLS)
        .eq("conversation_id", selectedId)
        .order("sent_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as TgMsg[];
    },
    enabled: !!selectedId,
    refetchOnWindowFocus: false,
  });

  const selected = allConversations.find((c) => c.id === selectedId) ?? null;

  const { data: users = [] } = useQuery({
    queryKey: ["tg-inbox-users"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").order("full_name", { ascending: true });
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
    refetchOnWindowFocus: false,
  });
  const userName = (id: string | null) => (!id ? null : users.find((u) => u.id === id)?.full_name || id.slice(0, 8));
  // Nombre corto del closer que mandó un saliente (para etiquetar la burbuja: "quién lo mandó").
  const firstName = (id: string | null) => { const n = userName(id); return n ? n.split(/\s+/)[0] : null; };

  // Asignados de la conversación abierta, con el principal (assigned_to) primero:
  // ese orden se manda al RPC (p_user_ids[1] = nuevo principal). El fallback sin
  // fila N:N cubre datos viejos escritos solo en assigned_to. Espejo de WhatsApp.
  const selectedAssigneeIds = useMemo(() => {
    if (!selected) return [] as string[];
    const ids = (selected.assignees ?? []).map((a) => a.user_id);
    const p = selected.assigned_to;
    if (!p) return ids;
    return [p, ...ids.filter((x) => x !== p)];
  }, [selected]);
  // Etiqueta corta del botón del header: "Nombre" o "Nombre +N".
  const assigneeSummary =
    selectedAssigneeIds.length === 0
      ? null
      : selectedAssigneeIds.length === 1
        ? userName(selectedAssigneeIds[0])
        : `${userName(selectedAssigneeIds[0])} +${selectedAssigneeIds.length - 1}`;
  const assigneeNames = selectedAssigneeIds.map((id) => userName(id)).filter(Boolean).join(", ");

  // ── Multi-asignado ────────────────────────────────────────────────────────
  // Espejo del pump de WhatsApp (InboxPage): cada toggle actualiza el SET
  // OBJETIVO por conversación y un único loop en vuelo lo drena mandando
  // siempre el último set (coalescing). Evita RPCs concurrentes de set-completo
  // (último-gana → pierde asignados) y toggles calculados sobre un cache pisado
  // por un refetch en vuelo.
  const assignDesiredRef = useRef(new Map<string, string[]>());
  const assignUnsentRef = useRef(new Set<string>());
  const assignPumpingRef = useRef(false);

  const pumpAssignees = async () => {
    if (assignPumpingRef.current) return;
    assignPumpingRef.current = true;
    let failed: string | null = null;
    while (assignUnsentRef.current.size > 0) {
      const convId = assignUnsentRef.current.values().next().value as string;
      const ids = assignDesiredRef.current.get(convId) ?? [];
      // Se saca de la cola ANTES de mandar: si llega otro toggle en vuelo,
      // re-encola la conv y el loop re-manda el set más nuevo.
      assignUnsentRef.current.delete(convId);
      const { error } = await (supabase as any).rpc("tg_conversation_set_assignees", {
        p_conversation_id: convId,
        p_user_ids: ids,
      });
      if (error) {
        // Dropear SOLO la conv que falló (ya salió de la cola arriba) y seguir
        // drenando el resto: un error en A no debe descartar el toggle pendiente
        // de B. El invalidate final revierte el patch optimista de la que falló.
        failed = error.message;
        continue;
      }
    }
    // Sin awaits entre el fin del loop y acá → ningún toggle puede intercalarse.
    assignDesiredRef.current.clear();
    assignPumpingRef.current = false;
    if (failed) toast({ title: t("tg.couldNotAssign"), description: failed, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["tg-inbox-conversations"] });
    qc.invalidateQueries({ queryKey: ["tg-inbox-conversation-one"] });
  };

  const setAssignees = async (ids: string[]) => {
    if (!selectedId) return;
    const convId = selectedId;
    assignDesiredRef.current.set(convId, ids);
    assignUnsentRef.current.add(convId);
    // Cancelar los fetches en vuelo ANTES del patch optimista: si no, un refetch
    // viejo resuelve después y "des-marca" solo el checkbox recién tocado.
    await Promise.all([
      qc.cancelQueries({ queryKey: ["tg-inbox-conversations"] }),
      qc.cancelQueries({ queryKey: ["tg-inbox-conversation-one", convId] }),
    ]);
    const patch = (c: TgConv) =>
      c.id === convId
        ? { ...c, assigned_to: ids[0] ?? null, assignees: ids.map((user_id) => ({ user_id })) }
        : c;
    qc.setQueryData(["tg-inbox-conversations"], (rows: TgConv[] | undefined) => rows?.map(patch));
    qc.setQueryData(["tg-inbox-conversation-one", convId], (c: TgConv | null | undefined) => (c ? patch(c) : c));
    void pumpAssignees();
  };

  const toggleAssignee = (userId: string) => {
    if (!selectedId) return;
    // Base = set objetivo pendiente si hay edición en vuelo; si no, el del cache.
    const base = assignDesiredRef.current.get(selectedId) ?? selectedAssigneeIds;
    setAssignees(base.includes(userId) ? base.filter((x) => x !== userId) : [...base, userId]);
  };

  // @IG del lead resuelto por teléfono (peer_phone está revocado → RPC SECURITY
  // DEFINER que devuelve SOLO el handle), espejo del botón de IG de WhatsApp (#822).
  const { data: resolvedIg = null } = useQuery({
    queryKey: ["tg-contact-ig", selectedId],
    enabled: !!selectedId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_tg_contact_ig", { p_conversation_id: selectedId });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
  const igHandle = (resolvedIg || "").replace(/^@/, "");

  // ── Acciones de la LISTA (click derecho): fijar / archivar / favorito / marcar no leído ──
  const toggleFlag = async (id: string, flag: "archived" | "pinned" | "favorite" | "manually_unread", value: boolean) => {
    const { error } = await (supabase as any).rpc("tg_set_conversation_flag", { p_conversation_id: id, p_flag: flag, p_value: value });
    if (error) { toast({ title: t("tg.couldNotUpdate"), description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["tg-inbox-conversations"] });
  };
  // Marcar leído/no leído: leído resetea el no-leído real (tg_mark_read) + la marca manual.
  const markRead = async (id: string, read: boolean) => {
    if (read) {
      await (supabase as any).rpc("tg_mark_read", { p_conversation_id: id });
      await (supabase as any).rpc("tg_set_conversation_flag", { p_conversation_id: id, p_flag: "manually_unread", p_value: false });
    } else {
      await (supabase as any).rpc("tg_set_conversation_flag", { p_conversation_id: id, p_flag: "manually_unread", p_value: true });
    }
    qc.invalidateQueries({ queryKey: ["tg-inbox-conversations"] });
    qc.invalidateQueries({ queryKey: ["sidebar-badges"] });
  };
  // Vaciar / Eliminar (solo admin) — confirma vía AlertDialog.
  const runDestructive = async () => {
    if (!destructive) return;
    const { kind, id } = destructive;
    const fn = kind === "clear" ? "tg_clear_conversation" : "tg_delete_conversation";
    const { error } = await (supabase as any).rpc(fn, { p_conversation_id: id });
    setDestructive(null);
    if (error) { toast({ title: t("tg.couldNotComplete"), description: error.message, variant: "destructive" }); return; }
    toast({ title: kind === "clear" ? t("tg.chatCleared") : t("tg.chatDeleted") });
    if (kind === "delete" && selectedId === id) setSelectedId(null);
    qc.invalidateQueries({ queryKey: ["tg-inbox-conversations"] });
    if (selectedId === id) qc.invalidateQueries({ queryKey: ["tg-inbox-messages", id] });
  };

  // Marcar leído al abrir (RPC; el cliente no puede UPDATE directo).
  useEffect(() => {
    if (!selectedId) return;
    setReplyingTo(null);
    setRecording(false);
    (supabase as any).rpc("tg_mark_read", { p_conversation_id: selectedId }).then(() => {
      qc.invalidateQueries({ queryKey: ["tg-inbox-conversations"] });
      qc.invalidateQueries({ queryKey: ["sidebar-badges"] });
    });
  }, [selectedId, qc]);

  // Autoscroll al fondo al abrir/llegar mensajes.
  useEffect(() => {
    if (msgLoading) return;
    const anchor = messagesEndRef.current;
    const vp = anchor?.closest("[data-radix-scroll-area-viewport]") as HTMLElement | null;
    requestAnimationFrame(() => { if (vp) vp.scrollTop = vp.scrollHeight; });
  }, [selectedId, msgLoading, messages]);

  // Realtime: SOLO cambios de conversación. Los mensajes nuevos los maneja el hook global.
  useEffect(() => {
    const ch = supabase
      .channel("tg-inbox-conv-rt-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "tg_conversations" }, () =>
        qc.invalidateQueries({ queryKey: ["tg-inbox-conversations"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const isUnread = (c: TgConv) => (c.unread_count ?? 0) > 0 || c.manually_unread;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = allConversations.filter((c) => (showArchived ? c.archived : !c.archived));
    if (chatFilter === "no_leidos") list = list.filter((c) => isUnread(c));
    else if (chatFilter === "favoritos") list = list.filter((c) => c.favorite);
    if (channelFilter) list = list.filter((c) => c.account_id === channelFilter); // filtro por canal (ortogonal)
    if (q) list = list.filter(
      (c) => peerLabel(c).toLowerCase().includes(q) || (c.last_message_preview ?? "").toLowerCase().includes(q),
    );
    // Fijados primero (salvo en la vista de archivados).
    return [...list].sort((a, b) => Number(b.pinned && !b.archived) - Number(a.pinned && !a.archived));
  }, [allConversations, search, chatFilter, channelFilter, showArchived]);

  const invalidateThread = () => {
    qc.invalidateQueries({ queryKey: ["tg-inbox-messages", selectedId] });
    qc.invalidateQueries({ queryKey: ["tg-inbox-conversations"] });
  };
  const isOptimistic = (id: string) => id.startsWith("optimistic-");
  const canActOn = (m: TgMsg) => !isOptimistic(m.id) && !m.deleted_at;

  // Sube un archivo/blob al bucket público tg-media y devuelve su URL (o null).
  const uploadToTg = async (file: File | Blob, name: string): Promise<string | null> => {
    if (!selectedId) return null;
    const path = `out/${selectedId}/${Date.now()}_${name}`;
    const { error } = await supabase.storage.from("tg-media").upload(path, file, {
      contentType: (file as File).type || "application/octet-stream", upsert: true,
    });
    if (error) { toast({ title: t("tg.couldNotUpload"), description: error.message, variant: "destructive" }); return null; }
    return supabase.storage.from("tg-media").getPublicUrl(path).data.publicUrl;
  };

  // Enviar MEDIA (optimista + fire-and-reconcile, como el texto).
  const sendMediaUrl = (url: string, kind: string, opts: { caption?: string; fileName?: string; replyTo?: string | null } = {}) => {
    const convId = selectedId;
    if (!convId || !url) return;
    const msgType = MSG_TYPE_BY_KIND[kind] ?? "document";
    const optimisticId = "optimistic-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    qc.setQueryData<TgMsg[]>(["tg-inbox-messages", convId], (old = []) => [...old, {
      id: optimisticId, direction: "out", body: opts.caption ?? null, msg_type: msgType, media_url: url,
      sent_at: new Date().toISOString(), status: "sent", sender_user_id: user?.id ?? null,
      reply_to_message_id: opts.replyTo ?? null, reply_to_external_id: null, reaction: null, deleted_at: null,
    }]);
    void supabase.functions.invoke("tg-inbox-send-media", {
      body: { conversation_id: convId, url, kind, caption: opts.caption, file_name: opts.fileName, reply_to_message_id: opts.replyTo },
    })
      .then(({ data, error }) => {
        const res = data as { ok?: boolean; error?: string; reason?: string } | null;
        if (error || !res?.ok) toast({
          title: t("tg.couldNotSend"),
          description: res?.reason === "send_failed" ? t("tg.gatewayNoDeliverFile") : (res?.error || error?.message || t("common.error")),
          variant: "destructive",
        });
      })
      .catch((e) => toast({ title: t("tg.couldNotSend"), description: (e as Error).message, variant: "destructive" }))
      .finally(invalidateThread);
  };

  // Envío del composer: texto (optimista) o adjuntos (subir + enviar como media). Con cita.
  const composerSend = async (text: string, files: File[]) => {
    const convId = selectedId;
    if (!convId) throw new Error("no_conv");
    const replyId = replyingTo && !isOptimistic(replyingTo.id) ? replyingTo.id : null;
    const body = text.trim();

    if (files.length) {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const url = await uploadToTg(f, f.name || "archivo");
        if (!url) throw new Error("upload_failed"); // ChatComposer conserva texto/adjuntos
        sendMediaUrl(url, kindForMime(f.type), { caption: i === 0 && body ? body : undefined, fileName: f.name, replyTo: replyId });
      }
      setReplyingTo(null);
      return;
    }

    if (!body) throw new Error("empty");
    const optimisticId = "optimistic-" + Date.now();
    qc.setQueryData<TgMsg[]>(["tg-inbox-messages", convId], (old = []) => [...old, {
      id: optimisticId, direction: "out", body, msg_type: "text", media_url: null,
      sent_at: new Date().toISOString(), status: "sent", sender_user_id: user?.id ?? null,
      reply_to_message_id: replyId, reply_to_external_id: null, reaction: null, deleted_at: null,
    }]);
    void supabase.functions.invoke("tg-inbox-send", { body: { conversation_id: convId, body, reply_to_message_id: replyId } })
      .then(({ data, error }) => {
        const res = data as { ok?: boolean; error?: string; reason?: string } | null;
        if (error || !res?.ok) toast({
          title: t("tg.couldNotSend"),
          description: res?.reason === "send_failed" ? t("tg.gatewayNoDeliverMsg") : (res?.error || error?.message || t("common.error")),
          variant: "destructive",
        });
      })
      .catch((e) => toast({ title: t("tg.couldNotSend"), description: (e as Error).message, variant: "destructive" }))
      .finally(invalidateThread);
    setReplyingTo(null);
  };

  const reactTo = (m: TgMsg, emoji: string) => {
    if (!canActOn(m)) return;
    void supabase.functions.invoke("tg-inbox-action", { body: { message_id: m.id, action: "react", emoji } })
      .then(({ data, error }) => { const res = data as any; if (error || !res?.ok) toast({ title: t("tg.couldNotReact"), description: res?.error || error?.message || t("common.error"), variant: "destructive" }); })
      .finally(() => qc.invalidateQueries({ queryKey: ["tg-inbox-messages", selectedId] }));
  };
  const deleteMsg = (m: TgMsg) => {
    if (!canActOn(m)) return;
    void supabase.functions.invoke("tg-inbox-action", { body: { message_id: m.id, action: "delete" } })
      .then(({ data, error }) => { const res = data as any; if (error || !res?.ok) toast({ title: t("tg.couldNotDelete"), description: res?.error || error?.message || t("common.error"), variant: "destructive" }); })
      .finally(() => qc.invalidateQueries({ queryKey: ["tg-inbox-messages", selectedId] }));
  };

  // Visor de media (foto/video/gif) — reusa el lightbox de WhatsApp.
  const openViewer = (clickedId: string) => {
    const items: LightboxItem[] = messages
      .filter((mm) => mm.media_url && !mm.deleted_at && (isImageType(mm.msg_type) || mm.msg_type === "video" || mm.msg_type === "gif") && mm.msg_type !== "sticker")
      .map((mm) => ({ id: mm.id, url: mm.media_url as string, type: (mm.msg_type === "video" || mm.msg_type === "gif" ? "video" : "image") as "image" | "video" }));
    if (!items.length) return;
    const index = Math.max(0, items.findIndex((it) => it.id === clickedId));
    setViewer({ items, index });
  };

  const showChannelChip = !channelFilter && channels.length > 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header interno (patrón WhatsApp: cada subtab con su header + nav a hermanos). */}
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <TelegramIcon className="h-5 w-5 text-sky-500" />
        <h1 className="text-base font-semibold">Telegram</h1>
        <BotonSilenciarCanal channel="tg" className="h-7 w-7" />
        <Link to="/telegram" className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Radio className="h-3.5 w-3.5" /> {t("tg.accounts")}
        </Link>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Lista */}
        <aside className={cn(selectedId ? "hidden md:flex" : "flex", "w-full flex-col border-r md:w-80")}>
          {backNav?.backTo && (
            <button
              onClick={() => navigate(backNav.backTo!)}
              className="flex items-center gap-1.5 border-b border-border px-4 py-2 text-xs font-medium text-primary hover:bg-muted/50"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Volver a {backNav.backLabel || "atrás"}
            </button>
          )}
          <div className="relative px-3 pb-2 pt-3">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("tg.searchConversation")}
              className="h-9 pl-8"
            />
          </div>

          {/* Filtro por CANAL (línea) — solo si hay más de una. Ortogonal a los chips de abajo. */}
          {channels.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin-x px-3 pb-2">
              <span className="shrink-0 pr-0.5 text-[11px] font-medium text-muted-foreground">{t("tg.channel")}</span>
              <button
                type="button"
                onClick={() => setChannelFilter(null)}
                className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  !channelFilter ? `${TG_GRAD_R} text-white shadow-sm` : "bg-muted text-foreground border border-border hover:bg-muted/70")}
              >
                {t("common.all")}
              </button>
              {channels.map((ch) => (
                <button
                  key={ch.account_id}
                  type="button"
                  onClick={() => setChannelFilter(ch.account_id)}
                  className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    channelFilter === ch.account_id ? `${TG_GRAD_R} text-white shadow-sm` : "bg-muted text-foreground border border-border hover:bg-muted/70")}
                >
                  {ch.label || ch.account_id}
                </button>
              ))}
            </div>
          )}

          {/* Filtros (chips): presets + archivados. */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin-x px-3 pb-3">
            {([["todos", "common.all"], ["no_leidos", "tg.unread"], ["favoritos", "tg.favorites"]] as const).map(([key, lkey]) => (
              <button
                key={key}
                type="button"
                onClick={() => { setChatFilter(key); setShowArchived(false); }}
                className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  !showArchived && chatFilter === key ? `${TG_GRAD_R} text-white shadow-sm` : "bg-muted text-foreground border border-border hover:bg-muted/70")}
              >
                {t(lkey)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              title={t("tg.viewArchived")}
              className={cn("ml-auto flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                showArchived ? `${TG_GRAD_R} text-white shadow-sm` : "bg-muted text-foreground border border-border hover:bg-muted/70")}
            >
              <Archive className="h-3 w-3" /> {t("tg.archived")}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {convLoading ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("common.loading")}
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                <InboxIcon className="mx-auto mb-2 h-8 w-8 opacity-40" />
                {showArchived ? t("tg.emptyArchived")
                  : chatFilter === "no_leidos" ? t("tg.emptyUnread")
                  : chatFilter === "favoritos" ? t("tg.emptyFavorites")
                  : t("tg.emptyAll")}
              </div>
            ) : (
              <ul className="space-y-0.5 px-2 py-2">
                {filtered.map((c) => {
                  const unread = isUnread(c);
                  const active = selectedId === c.id;
                  return (
                    <li key={c.id}>
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setSelectedId(c.id)}
                            className={cn(
                              "relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                              active && `bg-muted before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r ${TG_GRAD_BAR}`,
                            )}
                          >
                            <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white", avatarGrad(c.peer_id))}>
                              {initials(c)}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                {c.pinned && !c.archived && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
                                {c.favorite && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                                <span className={cn("min-w-0 flex-1 truncate text-sm", unread ? "font-bold" : "font-medium")}>
                                  {peerLabel(c)}
                                </span>
                                <span className={cn("ml-auto shrink-0 text-[10px] tabular-nums", unread ? "font-semibold text-sky-500" : "text-muted-foreground")}>
                                  {fmtTime(c.last_message_at, dtLocale)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {showChannelChip && (
                                  <span className={cn("shrink-0 max-w-[90px] truncate rounded px-1 py-0.5 text-[9px] font-medium", channelChipClass(c.account_id))}
                                    title={channelLabel(c.account_id) ?? undefined}>
                                    {channelLabel(c.account_id)}
                                  </span>
                                )}
                                <span className={cn("min-w-0 flex-1 truncate text-xs", unread ? "font-medium text-foreground" : "text-muted-foreground")}>
                                  {c.last_message_preview ?? "—"}
                                </span>
                                {unread && ((c.unread_count ?? 0) > 0 ? (
                                  <span className={cn("ml-auto grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-bold text-white shadow-sm", TG_GRAD)}>
                                    {c.unread_count > 99 ? "99+" : c.unread_count}
                                  </span>
                                ) : (
                                  <span className={cn("ml-auto h-2.5 w-2.5 shrink-0 rounded-full", TG_GRAD)} title={t("tg.unreadOne")} />
                                ))}
                              </div>
                            </div>
                          </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-56">
                          <ContextMenuItem onClick={() => toggleFlag(c.id, "archived", !c.archived)}>
                            <Archive className="mr-2 h-4 w-4" /> {c.archived ? t("tg.unarchiveChat") : t("tg.archiveChat")}
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => toggleFlag(c.id, "pinned", !c.pinned)}>
                            <Pin className="mr-2 h-4 w-4" /> {c.pinned ? t("tg.unpinChat") : t("tg.pinChat")}
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => markRead(c.id, unread)}>
                            <MailOpen className="mr-2 h-4 w-4" /> {unread ? t("tg.markAsRead") : t("tg.markAsUnread")}
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => toggleFlag(c.id, "favorite", !c.favorite)}>
                            <Star className="mr-2 h-4 w-4" /> {c.favorite ? t("tg.removeFavorite") : t("tg.addFavorite")}
                          </ContextMenuItem>
                          {isAdmin && (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem className="text-warning focus:text-warning" onClick={() => setDestructive({ kind: "clear", id: c.id, label: peerLabel(c) })}>
                                <Eraser className="mr-2 h-4 w-4" /> {t("tg.clearChat")}
                              </ContextMenuItem>
                              <ContextMenuItem className="text-destructive focus:text-destructive" onClick={() => setDestructive({ kind: "delete", id: c.id, label: peerLabel(c) })}>
                                <Trash2 className="mr-2 h-4 w-4" /> {t("tg.deleteChat")}
                              </ContextMenuItem>
                            </>
                          )}
                        </ContextMenuContent>
                      </ContextMenu>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Hilo */}
        <section className={cn(selectedId ? "flex" : "hidden md:flex", "min-h-0 flex-1 flex-col")}>
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t("tg.pickConversation")}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2.5 border-b px-4 py-2.5">
                <button onClick={() => setSelectedId(null)} className="text-muted-foreground hover:text-foreground md:hidden">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white", avatarGrad(selected.peer_id))}>
                  {initials(selected)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{peerLabel(selected)}</div>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {selected.peer_username && (
                      <><AtSign className="h-3 w-3" />{selected.peer_username}<span className="mx-0.5">·</span></>
                    )}
                    <span>{channelLabel(selected.account_id)}</span>
                    {igHandle && (
                      <>
                        <span className="mx-0.5">·</span>
                        <a
                          href={`https://instagram.com/${igHandle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-muted/60 px-1.5 py-0.5 transition-colors hover:bg-primary/15 hover:text-primary"
                          title={t("tg.openInstagram")}
                        >
                          <Instagram className="h-3 w-3 shrink-0" />
                          @{igHandle}
                        </a>
                      </>
                    )}
                  </div>
                </div>
                {canAssign ? (
                  <Popover open={assignOpen} onOpenChange={setAssignOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto h-7 gap-1 text-xs"
                        title={assigneeNames ? `${t("tg.assignedToLabel")}: ${assigneeNames}` : t("tg.assignConversation")}
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        {assigneeSummary ?? t("tg.assign")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-56 p-0">
                      <AssigneePicker
                        users={users}
                        assignedIds={selectedAssigneeIds}
                        onToggle={toggleAssignee}
                        onClear={() => setAssignees([])}
                        searchPlaceholder={t("common.searchPerson")}
                        emptyText={t("common.noResults")}
                        clearText={t("common.removeAllAssignees")}
                      />
                    </PopoverContent>
                  </Popover>
                ) : (
                  <span
                    className="ml-auto flex items-center gap-1 text-xs text-muted-foreground"
                    title={assigneeNames ? `${t("tg.assignedToLabel")}: ${assigneeNames}` : t("tg.assignmentReadOnly")}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    {assigneeSummary ?? t("common.unassigned")}
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto bg-muted/20">
                <div className="flex flex-col gap-1.5 p-4">
                  {msgLoading ? (
                    <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
                  ) : messages.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">{t("tg.noMessages")}</div>
                  ) : (
                    messages.map((m) => {
                      const isOut = m.direction === "out";
                      const failed = isOut && m.status === "failed";
                      const deleted = !!m.deleted_at;
                      // Etiqueta "quién lo mandó" en CADA saliente con emisor conocido.
                      const showSender = isOut && !!m.sender_user_id && !deleted;
                      // Saliente enviado por FUERA de Maven (celular / Telegram web con la misma
                      // línea): no tiene emisor Maven → lo marcamos como externo (igual que WhatsApp).
                      const sentOutsideMaven = isOut && !deleted && m.source === "external";
                      const quoted = m.reply_to_message_id ? messages.find((x) => x.id === m.reply_to_message_id) : null;
                      const hasQuote = !deleted && (!!m.reply_to_message_id || !!m.reply_to_external_id);
                      const mediaShown = !deleted && !!m.media_url;
                      return (
                        <div key={m.id} className={cn("flex", isOut ? "justify-end" : "justify-start")}>
                          <div className={cn("group flex max-w-[85%] items-center gap-1", isOut ? "flex-row-reverse" : "flex-row")}>
                            <div className={cn(
                              "min-w-0 max-w-full px-3 py-1.5 text-sm shadow-sm",
                              deleted
                                ? "rounded-2xl border bg-muted text-muted-foreground"
                                : isOut
                                  ? failed ? "rounded-2xl rounded-br-md bg-destructive/80 text-white" : cn("rounded-2xl rounded-br-md text-white", TG_GRAD)
                                  : "rounded-2xl rounded-bl-md border bg-card",
                            )}>
                              {showSender ? (
                                <div className="mb-0.5 text-[11px] font-semibold text-white/85">{firstName(m.sender_user_id)}</div>
                              ) : sentOutsideMaven ? (
                                <div className="mb-0.5 inline-flex items-center gap-1 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white/90">↗ Externo · fuera de Maven</div>
                              ) : null}

                              {hasQuote && (
                                <div className={cn("mb-1 rounded border-l-2 px-2 py-1 text-xs", isOut ? "border-white/50 bg-black/10" : "border-sky-400 bg-muted/60")}>
                                  <p className="truncate opacity-80">{quoted ? (quoted.body || `[${quoted.msg_type}]`) : t("tg.quotedMessage")}</p>
                                </div>
                              )}

                              {mediaShown && isImageType(m.msg_type) && (
                                <img
                                  src={m.media_url as string}
                                  alt=""
                                  onClick={m.msg_type !== "sticker" ? () => openViewer(m.id) : undefined}
                                  className={cn("mb-1 rounded-lg object-cover", m.msg_type === "sticker" ? "max-h-28" : "max-h-64 cursor-zoom-in")}
                                />
                              )}
                              {mediaShown && (m.msg_type === "video" || m.msg_type === "gif") && (
                                <div className="relative mb-1">
                                  {m.msg_type === "gif"
                                    ? <video src={m.media_url as string} autoPlay loop muted playsInline className="max-h-64 rounded-lg" />
                                    : <video src={m.media_url as string} controls className="max-h-64 rounded-lg" />}
                                  {m.msg_type === "video" && (
                                    <button type="button" onClick={() => openViewer(m.id)} title={t("tg.viewLarge")}
                                      className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white transition hover:bg-black/80">
                                      <Maximize2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                              {mediaShown && (m.msg_type === "voice" || m.msg_type === "audio") && (
                                <div className="mb-1">
                                  {/* Mismo reproductor que el Messenger: onda,
                                      arrastre y velocidad. Los .ogg de Telegram
                                      sí traen duración, pero el aspecto tiene
                                      que ser el mismo en toda la app. */}
                                  <NotaDeVoz src={m.media_url as string} />
                                </div>
                              )}
                              {mediaShown && m.msg_type === "document" && (
                                <a href={m.media_url as string} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-1.5 underline">
                                  <FileText className="h-4 w-4" /> {t("common.file")}
                                </a>
                              )}

                              {deleted ? (
                                <span className="italic">{t("tg.messageDeleted")}</span>
                              ) : m.body ? (
                                <span className="whitespace-pre-wrap break-words">{m.body}</span>
                              ) : (!mediaShown && m.msg_type !== "text") ? (
                                <span className="italic opacity-80">[{m.msg_type}]</span>
                              ) : null}

                              <span className={cn("ml-2 align-bottom text-[10px] tabular-nums", isOut && !deleted ? "text-white/70" : "text-muted-foreground")}>
                                {failed ? t("tg.notDelivered") + " · " : ""}{fmtTime(m.sent_at, dtLocale)}
                              </span>

                              {!deleted && m.reaction && (
                                <div className="mt-0.5">
                                  <span className={cn("inline-block rounded-full px-1.5 py-0.5 text-[13px] leading-none", isOut ? "bg-black/20" : "bg-muted")}>
                                    {m.reaction}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Acciones al hover: responder · reaccionar · borrar (borrar solo en salientes). */}
                            {canActOn(m) && (
                              <div className="flex shrink-0 items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100">
                                <button type="button" onClick={() => setReplyingTo(m)} title={t("common.reply")}
                                  className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                                  <Reply className="h-4 w-4" />
                                </button>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button type="button" title={t("common.react")} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                                      <Smile className="h-4 w-4" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent align="center" className="w-auto p-1">
                                    <div className="flex gap-0.5">
                                      {REACTIONS.map((e) => (
                                        <button key={e} type="button" onClick={() => reactTo(m, e)} className="rounded p-1 text-lg leading-none hover:bg-muted">{e}</button>
                                      ))}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                                {isOut && (
                                  <button type="button" onClick={() => deleteMsg(m)} title={t("tg.deleteForEveryone")}
                                    className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Composer: mientras se graba audio, el recorder toma el lugar del cajón. */}
              {recording ? (
                <div className="border-t bg-card p-2">
                  <AudioRecorderBar
                    onSend={async (blob) => {
                      setRecording(false);
                      const ext = (blob.type.split("/")[1] || "ogg").split(";")[0];
                      const url = await uploadToTg(blob, `voz_${Date.now()}.${ext}`);
                      if (url) sendMediaUrl(url, "voice", { fileName: "voz" });
                    }}
                    onCancel={() => setRecording(false)}
                  />
                </div>
              ) : (
                <ChatComposer
                  value={draft}
                  onChange={setDraft}
                  onSend={composerSend}
                  placeholder={t("tg.replyTo", { name: peerLabel(selected) })}
                  emojis={tgEmojis}
                  onAddEmoji={(e) => setTgEmojis((curr) => (curr.includes(e) ? curr : [...curr, e]))}
                  onRemoveEmoji={(e) => setTgEmojis((curr) => curr.filter((x) => x !== e))}
                  sendButtonClassName={TG_GRAD}
                  replyBar={replyingTo ? (
                    <div className="flex items-center gap-2 rounded-lg border-l-2 border-sky-400 bg-muted/60 px-2 py-1.5 text-xs">
                      <Reply className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sky-600 dark:text-sky-400">{t("tg.replying")}</div>
                        <p className="truncate text-muted-foreground">{replyingTo.body || `[${replyingTo.msg_type}]`}</p>
                      </div>
                      <button type="button" onClick={() => setReplyingTo(null)} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={t("composer.cancelReply")}>
                        <XIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ) : undefined}
                  toolbarExtra={
                    <>
                      <GifPicker onPick={(url) => sendMediaUrl(url, "gif")} />
                      <StickerPicker onPick={(url) => sendMediaUrl(url, "sticker")} />
                      <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground" title={t("composer.recordAudio")} onClick={() => setRecording(true)}>
                        <Mic className="h-4 w-4" />
                      </Button>
                    </>
                  }
                />
              )}
            </>
          )}
        </section>
      </div>

      {viewer && <MediaLightbox items={viewer.items} index={viewer.index} onClose={() => setViewer(null)} />}

      <AlertDialog open={!!destructive} onOpenChange={(o) => { if (!o) setDestructive(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{destructive?.kind === "clear" ? t("tg.clearChat") : t("tg.deleteChat")}</AlertDialogTitle>
            <AlertDialogDescription>
              {destructive?.kind === "clear"
                ? t("tg.clearChatConfirm", { name: destructive?.label ?? "" })
                : t("tg.deleteChatConfirm", { name: destructive?.label ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={runDestructive} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {destructive?.kind === "clear" ? t("common.clear") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TelegramInboxPage;
