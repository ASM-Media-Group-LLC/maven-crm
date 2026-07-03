// Bandeja de WhatsApp del inbox propio (Slice 4) — lectura.
//
// Muestra las conversaciones del núcleo wa_* (Slice 1) que ya se están
// poblando con los DMs entrantes (Slice 2). Estilo WhatsApp: lista a la
// izquierda + hilo a la derecha, en vivo (Supabase Realtime).
//
// Masking: se muestra el NOMBRE / @handle del contacto, NUNCA el número.
// Lanzamiento "oscuro": la ruta está gateada por AdminRoute hasta validar;
// después se abre a closer/supervisor y se le agrega el cuadro de envío.
//
// (supabase as any): las tablas wa_* son nuevas y todavía no están en los
// tipos generados de Supabase.

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { MessageSquare, Search, Send, Loader2, Instagram, Radio, Sparkles, PenLine, FileText, Gauge, X, UserCheck, Paperclip, Mic, MoreHorizontal, Trash2, Reply, Phone, Check, CheckCheck, AlertCircle, Sticker, Maximize2, Pin, Star, Archive, MailOpen, Eraser, Tags, Plus, ArrowLeft } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator,
  ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent, ContextMenuCheckboxItem,
} from "@/components/ui/context-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { WaConversationStatus, WaMessageDirection } from "./types";
import { EmojiBar, usePersistedEmojis } from "@/pages/chatter-evaluator/workspace/EmojiBar";
import { ScriptsButton } from "@/components/chat/ScriptsButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUserRole } from "@/hooks/useUserRole";
import { AudioRecorderBar } from "./AudioRecorder";
import { GifPicker } from "./GifPicker";
import { StickerPicker } from "./StickerPicker";
import { MediaLightbox, type LightboxItem } from "./MediaLightbox";
import { WaContactAvatar } from "./WaContactAvatar";

interface ConvRow {
  id: string;
  contact_id: string;
  department: string;
  status: WaConversationStatus;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  assigned_to: string | null;
  channel_id: string | null;
  archived: boolean;
  pinned: boolean;
  favorite: boolean;
  manually_unread: boolean;
  labels: { label_id: string }[] | null;
  contact: { id: string; display_name: string | null; instagram_handle: string | null; wa_jid: string | null } | null;
}

interface MsgRow {
  id: string;
  direction: WaMessageDirection;
  body: string | null;
  msg_type: string;
  media_url: string | null;
  agent_reaction: string | null;
  reply_to_message_id: string | null;
  sent_at: string;
  status: string | null;
  deleted_at: string | null;
}

// Palomitas de WhatsApp para los mensajes SALIENTES según el estado de entrega:
// 1 palomita = enviado (server ack), 2 = entregado, 2 azules = leído, ⚠ = no entregado.
function StatusTick({ status }: { status: string | null }) {
  if (status === "failed")
    return <AlertCircle className="h-3 w-3 text-destructive" aria-label="No entregado" />;
  if (status === "read")
    return <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" aria-label="Leído" />;
  if (status === "delivered")
    return <CheckCheck className="h-3.5 w-3.5" aria-label="Entregado" />;
  return <Check className="h-3.5 w-3.5" aria-label="Enviado" />; // 'sent' o null
}

const fmtTime = (iso: string | null): string => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-CO", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "";
  }
};

const contactLabel = (c: ConvRow["contact"]): string =>
  c?.display_name ||
  (c?.instagram_handle ? "@" + c.instagram_handle.replace(/^@/, "") : "") ||
  "(sin nombre)";

// Cada canal (línea/marca) tiene su propio color de chip en la lista — como en
// el mockup (Content P. violeta, Unlock azul, Kash verde…). Color determinista
// por id de canal para que sea estable entre renders. Decorativo (identidad de
// marca), no semántico.
const CHANNEL_CHIP_PALETTE = [
  "bg-violet-500/15 text-violet-300",
  "bg-blue-500/15 text-blue-300",
  "bg-emerald-500/15 text-emerald-300",
  "bg-amber-500/15 text-amber-300",
  "bg-rose-500/15 text-rose-300",
  "bg-cyan-500/15 text-cyan-300",
  "bg-indigo-500/15 text-indigo-300",
  "bg-teal-500/15 text-teal-300",
];
const channelChipClass = (key: string | null): string => {
  if (!key) return "bg-muted text-muted-foreground";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return CHANNEL_CHIP_PALETTE[h % CHANNEL_CHIP_PALETTE.length];
};

const statusMeta: Record<string, { label: string; variant: "secondary-soft" | "success-soft" | "warning-soft" }> = {
  open: { label: "Abierta", variant: "secondary-soft" },
  pending: { label: "Pendiente", variant: "warning-soft" },
  closed: { label: "Cerrada", variant: "success-soft" },
};

const InboxPage = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { canAccess } = usePermissions();
  // Permiso configurable (Administración → Roles). Default: solo admin. Quien no
  // lo tiene ve la asignación pero NO puede cambiarla (el RPC + la RLS lo refuerzan).
  const canAssign = canAccess("WhatsApp", "Asignar conversaciones");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Emojis del compose — barra/catálogo de Chatter Evaluator, PERSISTIDA por usuario
  // (localStorage): lo que el usuario agrega/quita sobrevive al refrescar.
  const { user } = useAuth();
  const [inboxEmojis, setInboxEmojis] = usePersistedEmojis("inbox", user?.id);
  // Ref del input de redacción: tras insertar un emoji, devolvemos el foco acá para que
  // Enter ENVÍE (no re-inserte el emoji). Mismo fix que en Chatter Evaluator.
  const draftInputRef = useRef<HTMLInputElement>(null);
  const [searchParams] = useSearchParams();
  // "← Volver" cuando se llegó desde otra pantalla (Contactos/Creadoras/Closers) vía el
  // botón de WhatsApp. Esa pantalla restaura sus filtros sola (sessionStorage).
  const location = useLocation();
  const navigate = useNavigate();
  const backNav = (location.state as { backTo?: string; backLabel?: string } | null) ?? null;
  // Deep-link: /inbox?c=<conversationId> (ej. desde el botón WhatsApp de Closers) abre directo esa conversación.
  useEffect(() => {
    const c = searchParams.get("c");
    if (c) setSelectedId(c);
  }, [searchParams]);
  const [search, setSearch] = useState("");
  // Filtro de la lista (chips estilo WhatsApp) + ver archivados + confirmación destructiva.
  const [chatFilter, setChatFilter] = useState<"todos" | "no_leidos" | "favoritos">("todos");
  const [labelFilter, setLabelFilter] = useState<string | null>(null); // id de lista personal activa
  const [showArchived, setShowArchived] = useState(false);
  const [channelFilter, setChannelFilter] = useState<string | null>(null); // id de canal activo (null = todos)
  const [destructive, setDestructive] = useState<{ kind: "clear" | "delete"; id: string; label: string } | null>(null);
  // Diálogo "Nueva lista" (forConversation: si viene de "Añadir a la lista" de un chat, lo agrega a la nueva lista).
  const [listDialog, setListDialog] = useState<{ forConversation: string | null } | null>(null);
  const [newListName, setNewListName] = useState("");
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<MsgRow | null>(null);
  const [sending, setSending] = useState(false);
  const [copilotBusy, setCopilotBusy] = useState<string | null>(null); // acción del copiloto en curso
  const [copilotInfo, setCopilotInfo] = useState<{ action: string; text: string } | null>(null); // output read-only de resumir/señales
  // Panel de info de contacto (Slice 2) — solo admin.
  const { isAdmin } = useUserRole();
  const [contactPanelOpen, setContactPanelOpen] = useState(false);
  // Visor de medios (lightbox) tipo WhatsApp. items = todas las fotos/videos
  // del hilo, para navegar con ← →. Se abre al tocar una foto o el botón
  // "ver en grande" de un video.
  const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; index: number } | null>(null);
  const openMediaViewer = (clickedId: string) => {
    const items: LightboxItem[] = messages
      .filter((mm) => !!mm.media_url && mm.msg_type !== "deleted" && (mm.msg_type === "image" || mm.msg_type === "video"))
      .map((mm) => ({ id: mm.id, url: mm.media_url as string, type: (mm.msg_type === "video" ? "video" : "image") as "image" | "video" }));
    if (!items.length) return;
    const idx = items.findIndex((it) => it.id === clickedId);
    setLightbox({ items, index: idx < 0 ? 0 : idx });
  };
  const [assignPanelOpen, setAssignPanelOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [contactAvatar, setContactAvatar] = useState<string | null>(null);

  const { data: conversations = [], isLoading: convLoading } = useQuery({
    queryKey: ["wa-inbox-conversations"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("wa_conversations")
        .select(
          "id, contact_id, department, status, last_message_at, last_message_preview, unread_count, assigned_to, channel_id, archived, pinned, favorite, manually_unread, labels:wa_conversation_labels(label_id), contact:wa_contacts(id, display_name, instagram_handle, wa_jid)",
        )
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ConvRow[];
    },
    refetchOnWindowFocus: false,
  });

  // Fallback del deep-link: si /inbox?c=<id> apunta a una conversación que NO está en la
  // lista cargada, la traemos por id. Pasa cuando el botón de WhatsApp (Closers/Contactos/
  // Creadoras) recién la creó (last_message_at NULL → ordenada al final, fuera del .limit(200)),
  // cuando la lista RLS-filtrada del closer no la incluye, o con cache stale. Sin esto,
  // `selected` quedaba null → panel "Elegí una conversación para verla" (parecía que "no abría").
  const inList = !!selectedId && conversations.some((c) => c.id === selectedId);
  const { data: fallbackConv = null } = useQuery({
    queryKey: ["wa-inbox-conversation-one", selectedId],
    queryFn: async () => {
      if (!selectedId) return null;
      const { data, error } = await (supabase as any)
        .from("wa_conversations")
        .select(
          "id, contact_id, department, status, last_message_at, last_message_preview, unread_count, assigned_to, channel_id, archived, pinned, favorite, manually_unread, labels:wa_conversation_labels(label_id), contact:wa_contacts(id, display_name, instagram_handle, wa_jid)",
        )
        .eq("id", selectedId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ConvRow | null;
    },
    enabled: !!selectedId && !inList,
    refetchOnWindowFocus: false,
  });

  // Lista efectiva = la cargada + (si hace falta) la conversación del deep-link traída por id,
  // al frente para que se vea y quede resaltada al abrirla desde el botón de WhatsApp.
  const allConversations = useMemo(
    () =>
      fallbackConv && !conversations.some((c) => c.id === fallbackConv.id)
        ? [fallbackConv, ...conversations]
        : conversations,
    [conversations, fallbackConv],
  );

  // Mis listas/etiquetas personales (la RLS filtra a las del usuario).
  const { data: myLabels = [] } = useQuery({
    queryKey: ["wa-inbox-labels"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("wa_labels").select("id, name").order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    refetchOnWindowFocus: false,
  });

  const { data: messages = [], isLoading: msgLoading } = useQuery({
    queryKey: ["wa-inbox-messages", selectedId],
    queryFn: async () => {
      if (!selectedId) return [] as MsgRow[];
      const { data, error } = await (supabase as any)
        .from("wa_conversation_messages")
        .select("id, direction, body, msg_type, media_url, agent_reaction, reply_to_message_id, sent_at, status, deleted_at")
        .eq("conversation_id", selectedId)
        .order("sent_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as MsgRow[];
    },
    enabled: !!selectedId,
    refetchOnWindowFocus: false,
  });

  // Usuarios para asignar conversaciones (5c).
  const { data: users = [] } = useQuery({
    queryKey: ["wa-inbox-users"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").order("full_name", { ascending: true });
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
    refetchOnWindowFocus: false,
  });
  const userName = (id: string | null) => (!id ? null : users.find((u) => u.id === id)?.full_name || id.slice(0, 8));

  // Canales (id→label) para el panel de info + el filtro por canal de la bandeja.
  const { data: channels = [] } = useQuery({
    queryKey: ["wa-inbox-channels-min"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("wa_channels").select("id, label, evolution_instance");
      return (data ?? []) as { id: string; label: string | null; evolution_instance: string | null }[];
    },
    refetchOnWindowFocus: false,
  });
  const channelLabel = (id: string | null) =>
    !id ? null : (() => { const c = channels.find((c) => c.id === id); return c ? (c.label || c.evolution_instance) : null; })();

  // Autoscroll del hilo: al abrir/recargar una conversación lleva al último mensaje;
  // al llegar mensajes nuevos baja solo si ya estabas cerca del fondo (no te corta
  // la lectura si subiste a leer historial). Alcanza el viewport del Radix
  // ScrollArea desde el ancla con closest([data-radix-scroll-area-viewport]).
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollThreadToBottom = (force: boolean) => {
    const anchor = messagesEndRef.current;
    if (!anchor) return;
    const vp = anchor.closest("[data-radix-scroll-area-viewport]") as HTMLElement | null;
    if (!vp) { anchor.scrollIntoView({ block: "end" }); return; }
    const nearBottom = vp.scrollHeight - vp.scrollTop - vp.clientHeight < 160;
    if (force || nearBottom) vp.scrollTop = vp.scrollHeight;
  };
  // Abrir/recargar/terminar de cargar → SIEMPRE al fondo (+ respaldo a los 220ms por
  // la media que ajusta su altura al cargar y correría el scroll).
  useEffect(() => {
    if (msgLoading) return;
    requestAnimationFrame(() => scrollThreadToBottom(true));
    const t = setTimeout(() => scrollThreadToBottom(true), 220);
    return () => clearTimeout(t);
  }, [selectedId, msgLoading]);
  // Mensajes nuevos (realtime / envío) → al fondo solo si ya estabas cerca.
  useEffect(() => {
    requestAnimationFrame(() => scrollThreadToBottom(false));
  }, [messages]);

  // Realtime: cambios de CONVERSACIÓN (asignación, archivar, no-leídos) → refrescar la
  // lista. Los mensajes nuevos y el refresh del HILO ABIERTO los maneja la suscripción
  // global única de useWaInboxNotifications (AppShell): tener acá un 2º canal sobre
  // wa_conversation_messages competía con el global por el routing de postgres_changes y
  // quedaba mudo → el aviso sonaba pero el mensaje no aparecía hasta refrescar.
  useEffect(() => {
    const channel = supabase
      .channel("wa-inbox-conv-rt-" + Math.random().toString(36).slice(2))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wa_conversations" },
        () => qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const isUnread = (c: ConvRow) => (c.unread_count ?? 0) > 0 || c.manually_unread;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = allConversations.filter((c) => (showArchived ? c.archived : !c.archived));
    if (labelFilter) list = list.filter((c) => (c.labels ?? []).some((l) => l.label_id === labelFilter));
    else if (chatFilter === "no_leidos") list = list.filter(isUnread);
    else if (chatFilter === "favoritos") list = list.filter((c) => c.favorite);
    if (channelFilter) list = list.filter((c) => c.channel_id === channelFilter); // filtro por canal (ortogonal)
    if (q) {
      list = list.filter(
        (c) =>
          contactLabel(c.contact).toLowerCase().includes(q) ||
          (c.last_message_preview ?? "").toLowerCase().includes(q),
      );
    }
    // Fijados primero; dentro de cada grupo se respeta el orden por fecha de la query
    // (sort estable). Los archivados no se fijan arriba.
    return [...list].sort((a, b) => Number(b.pinned && !b.archived) - Number(a.pinned && !a.archived));
  }, [allConversations, search, chatFilter, labelFilter, showArchived, channelFilter]);

  const selected = allConversations.find((c) => c.id === selectedId) ?? null;

  // Al abrir una conversación con no-leídos, marcarla leída (resetea el bubble).
  // Via RPC porque la policy UPDATE de wa_conversations está gateada por permiso.
  useEffect(() => {
    if (!selectedId || !selected) return;
    const needsRead = (selected.unread_count ?? 0) > 0;
    const needsManual = selected.manually_unread;
    if (!needsRead && !needsManual) return;
    (async () => {
      if (needsRead) await (supabase as any).rpc("wa_mark_read", { p_conversation_id: selectedId });
      if (needsManual) await (supabase as any).rpc("wa_set_conversation_flag", { p_conversation_id: selectedId, p_flag: "manually_unread", p_value: false });
      qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] });
    })();
  }, [selectedId, selected, qc]);

  // Foto real del contacto: al abrir el panel, se la pedimos al gateway (vía edge).
  useEffect(() => {
    setContactAvatar(null);
    if (!contactPanelOpen || !selectedId) return;
    const conv = selectedId;
    supabase.functions.invoke("wa-contact-avatar", { body: { conversation_id: conv } })
      .then(({ data }) => {
        const u = (data as { url?: string | null } | null)?.url ?? null;
        if (u) setContactAvatar(u);
      })
      .catch(() => { /* sin foto: queda la inicial */ });
  }, [contactPanelOpen, selectedId]);

  // ── Media saliente (Slice A): sube el archivo a Storage y lo manda por
  //    wa-inbox-send-media (que rutea por la instancia del canal). ──
  const sendMedia = async (
    file: Blob, mediaType: "image" | "audio" | "video" | "document", filename: string, ptt = false,
  ) => {
    if (!selectedId || mediaBusy) return;
    const convId = selectedId;
    setMediaBusy(true);
    try {
      const ext = filename.includes(".") ? filename.split(".").pop() : (mediaType === "audio" ? "webm" : "bin");
      const path = `wa-outbound/${convId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("creator-files")
        .upload(path, file, { contentType: (file as File).type || undefined });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from("creator-files")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      const mediaUrl = signed?.signedUrl;
      if (!mediaUrl) throw new Error("no se pudo firmar la URL");

      const { data, error } = await supabase.functions.invoke("wa-inbox-send-media", {
        body: {
          conversation_id: convId, media_url: mediaUrl, media_type: mediaType,
          mimetype: (file as File).type || undefined, filename, ptt,
        },
      });
      // supabase-js, ante un non-2xx, esconde el body del edge y deja un mensaje genérico.
      // Lo sacamos del context (la Response) para ver el motivo REAL (send_failed, not_connected…).
      if (error) {
        let detail = error.message;
        try {
          const body = await (error as { context?: Response }).context?.json?.();
          if (body?.error || body?.reason) detail = body.error ?? body.reason;
        } catch { /* sin body parseable, queda el genérico */ }
        throw new Error(detail);
      }
      const res = data as { ok?: boolean; error?: string; reason?: string } | null;
      if (!res?.ok) throw new Error(res?.error ?? res?.reason ?? "error");
      qc.invalidateQueries({ queryKey: ["wa-inbox-messages", convId] });
      qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] });
    } catch (e) {
      toast({ title: "No se pudo enviar el archivo", description: (e as Error).message, variant: "destructive" });
    } finally {
      setMediaBusy(false);
    }
  };

  const onFilePicked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-elegir el mismo archivo
    if (!file) return;
    sendMedia(file, file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "document", file.name);
  };

  // La grabación de nota de voz (micrófono + ondas en vivo + pausar/cancelar/enviar)
  // la maneja <AudioRecorderBar/>; acá solo montamos/desmontamos la barra y, al
  // enviar, mandamos el blob como nota de voz (ptt) — el gateway lo transcodea a ogg.
  const startRecording = () => setRecording(true);
  const handleRecorderSend = (blob: Blob) => {
    setRecording(false);
    sendMedia(blob, "audio", `nota-${Date.now()}.webm`, true);
  };

  // Enviar media por URL pública (GIF de Giphy / sticker de la galería): mandamos
  // la URL directo (el gateway la descarga) con el media_type correspondiente.
  const sendUrlMedia = async (url: string, mediaType: "gif" | "sticker", label: string) => {
    if (!selectedId || mediaBusy) return;
    const convId = selectedId;
    setMediaBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("wa-inbox-send-media", {
        body: { conversation_id: convId, media_url: url, media_type: mediaType },
      });
      const res = data as { ok?: boolean; error?: string } | null;
      if (error || !res?.ok) {
        toast({ title: `No se pudo enviar el ${label}`, description: error?.message ?? res?.error ?? "error", variant: "destructive" });
        return;
      }
      qc.invalidateQueries({ queryKey: ["wa-inbox-messages", convId] });
      qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] });
    } finally {
      setMediaBusy(false);
    }
  };
  const sendGifUrl = (gifUrl: string) => sendUrlMedia(gifUrl, "gif", "GIF");
  const sendStickerUrl = (url: string) => sendUrlMedia(url, "sticker", "sticker");

  // Guardar a la galería un sticker RECIBIDO (como "agregar a favoritos" de WhatsApp):
  // baja el webp del mensaje y lo sube a wa-stickers + lo registra en wa_stickers.
  const saveStickerToGallery = async (mediaUrl: string) => {
    try {
      const resp = await fetch(mediaUrl);
      if (!resp.ok) throw new Error("no se pudo bajar el sticker");
      const blob = await resp.blob();
      const path = `wa-stickers/${crypto.randomUUID()}.webp`;
      const up = await supabase.storage.from("creator-files").upload(path, blob, { contentType: "image/webp", upsert: false });
      if (up.error) throw up.error;
      const ins = await (supabase as any).from("wa_stickers").insert({ storage_path: path });
      if (ins.error) throw ins.error;
      qc.invalidateQueries({ queryKey: ["wa-stickers"] });
      toast({ title: "Sticker guardado en tu galería" });
    } catch (e) {
      toast({ title: "No se pudo guardar el sticker", description: (e as Error).message, variant: "destructive" });
    }
  };

  // Acciones por mensaje (Slice B): reaccionar / eliminar via wa-inbox-action.
  const messageAction = async (messageId: string, action: "react" | "delete", emoji?: string) => {
    if (!selectedId) return;
    const convId = selectedId;
    const { data, error } = await supabase.functions.invoke("wa-inbox-action", {
      body: { message_id: messageId, action, emoji },
    });
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) {
      toast({ title: "No se pudo completar la acción", description: error?.message ?? res?.error ?? "error", variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["wa-inbox-messages", convId] });
  };

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride ?? draft).trim();
    if (!text || !selectedId || sending) return;
    const convId = selectedId;
    const replyTo = replyingTo; // capturado para reintento + persistencia
    setDraft(""); // limpiar el input al instante (snappy)
    setReplyingTo(null);

    // Optimista: mostrar la burbuja saliente YA; se confirma por detrás.
    const optimisticId = "optimistic-" + Date.now();
    qc.setQueryData<MsgRow[]>(["wa-inbox-messages", convId], (old = []) => [
      ...old,
      { id: optimisticId, direction: "out", body: text, msg_type: "text", media_url: null, agent_reaction: null, reply_to_message_id: replyTo?.id ?? null, sent_at: new Date().toISOString(), status: "sent" },
    ]);

    setSending(true);
    const { data, error } = await supabase.functions.invoke("wa-inbox-send", {
      body: { conversation_id: convId, body: text, reply_to_message_id: replyTo?.id },
    });
    setSending(false);
    const res = data as { ok?: boolean; error?: string; reason?: string } | null;
    if (error || !res?.ok) {
      // El edge persiste el intento como FALLIDO (rojo) y devuelve 200+reason tanto si
      // el número no tiene WhatsApp como si la LÍNEA falló al enviar (gateway caído).
      if (res?.reason === "not_on_whatsapp" || res?.reason === "send_failed") {
        qc.setQueryData<MsgRow[]>(["wa-inbox-messages", convId], (old = []) =>
          old.filter((m) => m.id !== optimisticId));
        qc.invalidateQueries({ queryKey: ["wa-inbox-messages", convId] });
        qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] });
        toast(
          res.reason === "not_on_whatsapp"
            ? {
                title: "⚠ Número no registrado en WhatsApp",
                description: "El mensaje no se entregó: este número no tiene WhatsApp.",
                variant: "destructive",
              }
            : {
                title: "No se pudo enviar por esta línea",
                description: `La línea de WhatsApp puede estar desconectada — revisá su conexión (panel del gateway) o probá desde otra línea. Detalle: ${res.error ?? "error del gateway"}`,
                variant: "destructive",
              },
        );
        return;
      }
      // Rollback de la burbuja optimista + restaurar el texto para reintentar.
      qc.setQueryData<MsgRow[]>(["wa-inbox-messages", convId], (old = []) =>
        old.filter((m) => m.id !== optimisticId));
      setDraft(text);
      setReplyingTo(replyTo);
      toast({
        title: "No se pudo enviar",
        description: error?.message ?? res?.error ?? "Error desconocido",
        variant: "destructive",
      });
      return;
    }
    qc.invalidateQueries({ queryKey: ["wa-inbox-messages", convId] });
    qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] });
  };

  // Copiloto (6a): el menú dispara una acción puntual (solo gasta cuando elegís).
  // 'suggest' carga el mensaje en el compose box (editable, humano en control);
  // 'summarize'/'signals' muestran info read-only (no se envía).
  const runCopilot = async (action: "suggest" | "summarize" | "signals") => {
    if (!selectedId || copilotBusy) return;
    setCopilotBusy(action);
    const { data, error } = await supabase.functions.invoke("wa-inbox-suggest", {
      body: { conversation_id: selectedId, action },
    });
    setCopilotBusy(null);
    const res = data as { ok?: boolean; result?: string; error?: string; used?: number; limit?: number } | null;
    if (res?.error === "quota_exceeded") {
      toast({
        title: "Llegaste a tu límite de IA por hoy",
        description: `Usaste ${res.used ?? "?"}/${res.limit ?? "?"} hoy. Se reinicia mañana.`,
      });
      return;
    }
    if (error || !res?.ok || !res.result) {
      toast({
        title: "El copiloto no pudo responder",
        description: error?.message ?? res?.error ?? "Error desconocido",
        variant: "destructive",
      });
      return;
    }
    if (action === "suggest") setDraft(res.result);
    else setCopilotInfo({ action, text: res.result });
  };

  // Asignar la conversación a una persona — via RPC gateado por el permiso
  // "WhatsApp / Asignar conversaciones" (admin siempre; el resto solo si el admin
  // se lo prendió por rol). La RLS ya NO deja cambiar assigned_to por la API
  // directa, así que el candado vale aunque alguien evite la UI. No toca Evolution.
  const jidToNumber = (jid: string | null | undefined): string | null => {
    if (!jid) return null;
    const [local, domain] = jid.split("@");
    if (domain === "s.whatsapp.net" && /^\d+$/.test(local)) return "+" + local;
    return null; // @lid u otro: no es el teléfono real
  };

  const saveContactName = async (contactId: string | undefined, name: string) => {
    if (!contactId) return;
    setSavingName(true);
    const { error } = await (supabase as any)
      .from("wa_contacts").update({ display_name: name.trim() || null }).eq("id", contactId);
    setSavingName(false);
    if (error) { toast({ title: "No se pudo guardar el nombre", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Nombre actualizado" });
    qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] });
  };

  // ── Acciones del menú de click derecho de la lista de chats ──────────────
  const toggleFlag = async (id: string, flag: "archived" | "pinned" | "favorite" | "manually_unread", value: boolean) => {
    const { error } = await (supabase as any).rpc("wa_set_conversation_flag", { p_conversation_id: id, p_flag: flag, p_value: value });
    if (error) { toast({ title: "No se pudo actualizar el chat", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] });
  };
  // Marcar leído/no leído: leído resetea el no-leído real (wa_mark_read) + la marca manual.
  const markRead = async (id: string, read: boolean) => {
    if (read) {
      await (supabase as any).rpc("wa_mark_read", { p_conversation_id: id });
      await (supabase as any).rpc("wa_set_conversation_flag", { p_conversation_id: id, p_flag: "manually_unread", p_value: false });
    } else {
      await (supabase as any).rpc("wa_set_conversation_flag", { p_conversation_id: id, p_flag: "manually_unread", p_value: true });
    }
    qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] });
  };
  // Vaciar / Eliminar (solo admin, solo bandeja de Maven) — confirma vía dialog.
  const runDestructive = async () => {
    if (!destructive) return;
    const { kind, id } = destructive;
    const fn = kind === "clear" ? "wa_clear_conversation" : "wa_delete_conversation";
    const { error } = await (supabase as any).rpc(fn, { p_conversation_id: id });
    setDestructive(null);
    if (error) { toast({ title: "No se pudo completar", description: error.message, variant: "destructive" }); return; }
    toast({ title: kind === "clear" ? "Chat vaciado" : "Chat eliminado" });
    if (kind === "delete" && selectedId === id) setSelectedId(null);
    qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] });
    if (selectedId === id) qc.invalidateQueries({ queryKey: ["wa-inbox-messages", id] });
  };

  // ── Listas/etiquetas personales (estilo WhatsApp) ────────────────────────
  const toggleLabel = async (conversationId: string, labelId: string, add: boolean) => {
    const q = add
      ? (supabase as any).from("wa_conversation_labels").insert({ conversation_id: conversationId, label_id: labelId })
      : (supabase as any).from("wa_conversation_labels").delete().eq("conversation_id", conversationId).eq("label_id", labelId);
    const { error } = await q;
    if (error) { toast({ title: "No se pudo actualizar la lista", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] });
  };
  const createLabel = async () => {
    const name = newListName.trim();
    if (!name) return;
    const forConv = listDialog?.forConversation ?? null;
    const { data, error } = await (supabase as any).from("wa_labels").insert({ name }).select("id").single();
    if (error) { toast({ title: "No se pudo crear la lista", description: error.message, variant: "destructive" }); return; }
    if (forConv && data?.id) {
      await (supabase as any).from("wa_conversation_labels").insert({ conversation_id: forConv, label_id: data.id });
    }
    setListDialog(null);
    setNewListName("");
    qc.invalidateQueries({ queryKey: ["wa-inbox-labels"] });
    qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] });
    toast({ title: "Lista creada" });
  };
  const deleteLabel = async (labelId: string) => {
    const { error } = await (supabase as any).from("wa_labels").delete().eq("id", labelId);
    if (error) { toast({ title: "No se pudo borrar la lista", description: error.message, variant: "destructive" }); return; }
    if (labelFilter === labelId) setLabelFilter(null);
    qc.invalidateQueries({ queryKey: ["wa-inbox-labels"] });
    qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] });
  };

  const setConversationStatus = async (status: string) => {
    if (!selectedId) return;
    const { error } = await (supabase as any)
      .from("wa_conversations").update({ status }).eq("id", selectedId);
    if (error) { toast({ title: "No se pudo cambiar el estado", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Conversación ${statusMeta[status]?.label?.toLowerCase() ?? status}` });
    qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] });
  };

  const assignConversation = async (userId: string | null) => {
    if (!selectedId) return;
    setAssignOpen(false);
    const { error } = await (supabase as any).rpc("wa_assign_conversation", {
      p_conversation_id: selectedId,
      p_assignee: userId,
    });
    if (error) {
      toast({ title: "No se pudo asignar", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] });
    toast({ title: userId ? `Asignada a ${userName(userId)}` : "Asignación quitada" });
  };

  return (
    <div className="flex h-full min-h-0">
      {/* ── Lista de conversaciones ─────────────────────────────────────── */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-border">
        {backNav?.backTo && (
          <button
            onClick={() => navigate(backNav.backTo!)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-primary hover:bg-muted/50 border-b border-border"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a {backNav.backLabel || "atrás"}
          </button>
        )}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">Bandeja</h1>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground" title="Actualización en tiempo real">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
            </span>
            en vivo
          </span>
          <div className="ml-auto flex items-center gap-2">
            {canAccess("WhatsApp", "Canales") && (
              <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="Gestionar canales">
                <Link to="/inbox/canales"><Radio className="h-4 w-4" /></Link>
              </Button>
            )}
            <Badge variant="secondary-soft" className="text-[10px]">
              {convLoading ? "…" : conversations.length}
            </Badge>
          </div>
        </div>
        <div className="relative px-3 py-2">
          <Search className="absolute left-5 top-4 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conversación…"
            className="h-9 pl-8"
          />
        </div>
        {/* Filtro por CANAL (línea/número) — solo si hay más de uno. Ortogonal a los chips de abajo. */}
        {channels.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
            <span className="shrink-0 pr-0.5 text-[11px] font-medium text-muted-foreground">Canal</span>
            <button
              type="button"
              onClick={() => setChannelFilter(null)}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                !channelFilter ? "bg-gradient-to-r from-accent to-primary text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              Todos
            </button>
            {channels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => setChannelFilter(ch.id)}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  channelFilter === ch.id ? "bg-gradient-to-r from-accent to-primary text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/70",
                )}
              >
                {ch.label || ch.evolution_instance || "—"}
              </button>
            ))}
          </div>
        )}
        {/* Filtros (chips): presets + mis listas personales + nueva lista + archivados */}
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-3">
          {([["todos", "Todos"], ["no_leidos", "No leídos"], ["favoritos", "Favoritos"]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setChatFilter(key); setLabelFilter(null); setShowArchived(false); }}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                !labelFilter && !showArchived && chatFilter === key ? "bg-gradient-to-r from-accent to-primary text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {label}
            </button>
          ))}
          {myLabels.map((lb) => (
            <button
              key={lb.id}
              type="button"
              onClick={() => { setLabelFilter(lb.id); setShowArchived(false); }}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                labelFilter === lb.id ? "bg-gradient-to-r from-accent to-primary text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              <Tags className="h-3 w-3" /> {lb.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setNewListName(""); setListDialog({ forConversation: null }); }}
            title="Nueva lista"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground hover:bg-muted/70"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => { setShowArchived((v) => !v); setLabelFilter(null); }}
            title="Archivados"
            className={cn(
              "grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors",
              showArchived ? "bg-gradient-to-r from-accent to-primary text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            <Archive className="h-3 w-3" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {convLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {conversations.length === 0 ? "Todavía no hay conversaciones." : "Sin resultados."}
            </div>
          ) : (
            <ul className="space-y-0.5 px-2 py-2">
              {filtered.map((c) => {
                const unread = isUnread(c);
                return (
                <li key={c.id}>
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={() => { setSelectedId(c.id); setCopilotInfo(null); }}
                        className={cn(
                          "relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                          selectedId === c.id && "bg-muted before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-gradient-to-b before:from-accent before:to-primary",
                        )}
                      >
                        <WaContactAvatar conversationId={c.id} name={contactLabel(c.contact)} className="h-11 w-11 text-sm" />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            {c.pinned && !c.archived && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
                            <span className={cn("min-w-0 flex-1 truncate text-sm", unread ? "font-bold" : "font-medium")}>
                              {contactLabel(c.contact)}
                            </span>
                            {c.favorite && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                            <span className={cn(
                              "ml-auto shrink-0 text-[10px] tabular-nums",
                              unread ? "font-semibold text-green-500" : "text-muted-foreground",
                            )}>
                              {fmtTime(c.last_message_at)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {!channelFilter && channels.length > 1 && c.channel_id && (
                              <span
                                className={cn(
                                  "shrink-0 max-w-[90px] truncate rounded px-1 py-0.5 text-[9px] font-medium",
                                  channelChipClass(c.channel_id),
                                )}
                                title={channelLabel(c.channel_id) ?? undefined}
                              >
                                {channelLabel(c.channel_id)}
                              </span>
                            )}
                            <span className={cn("min-w-0 flex-1 truncate text-xs", unread ? "font-medium text-foreground" : "text-muted-foreground")}>
                              {c.last_message_preview ?? "—"}
                            </span>
                            {(c.unread_count ?? 0) > 0 ? (
                              <span className="ml-auto grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-green-500 px-1.5 text-[11px] font-bold text-white shadow-sm">
                                {c.unread_count > 99 ? "99+" : c.unread_count}
                              </span>
                            ) : c.manually_unread ? (
                              <span className="ml-auto h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" title="No leído" />
                            ) : null}
                          </div>
                        </div>
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-56">
                      <ContextMenuItem onClick={() => toggleFlag(c.id, "archived", !c.archived)}>
                        <Archive className="mr-2 h-4 w-4" /> {c.archived ? "Desarchivar chat" : "Archivar chat"}
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => toggleFlag(c.id, "pinned", !c.pinned)}>
                        <Pin className="mr-2 h-4 w-4" /> {c.pinned ? "Desfijar chat" : "Fijar chat"}
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => markRead(c.id, unread)}>
                        <MailOpen className="mr-2 h-4 w-4" /> {unread ? "Marcar como leído" : "Marcar como no leído"}
                      </ContextMenuItem>
                      <ContextMenuItem onClick={() => toggleFlag(c.id, "favorite", !c.favorite)}>
                        <Star className="mr-2 h-4 w-4" /> {c.favorite ? "Quitar de Favoritos" : "Añadir a Favoritos"}
                      </ContextMenuItem>
                      <ContextMenuSub>
                        <ContextMenuSubTrigger>
                          <Tags className="mr-2 h-4 w-4" /> Añadir a la lista
                        </ContextMenuSubTrigger>
                        <ContextMenuSubContent className="w-52">
                          {myLabels.length === 0 && (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">Sin listas todavía</div>
                          )}
                          {myLabels.map((lb) => (
                            <ContextMenuCheckboxItem
                              key={lb.id}
                              checked={(c.labels ?? []).some((x) => x.label_id === lb.id)}
                              onCheckedChange={(v) => toggleLabel(c.id, lb.id, !!v)}
                              onSelect={(e) => e.preventDefault()}
                            >
                              {lb.name}
                            </ContextMenuCheckboxItem>
                          ))}
                          <ContextMenuSeparator />
                          <ContextMenuItem onClick={() => { setNewListName(""); setListDialog({ forConversation: c.id }); }}>
                            <Plus className="mr-2 h-4 w-4" /> Nueva lista…
                          </ContextMenuItem>
                        </ContextMenuSubContent>
                      </ContextMenuSub>
                      {isAdmin && (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem className="text-warning focus:text-warning" onClick={() => setDestructive({ kind: "clear", id: c.id, label: contactLabel(c.contact) })}>
                            <Eraser className="mr-2 h-4 w-4" /> Vaciar chat
                          </ContextMenuItem>
                          <ContextMenuItem className="text-destructive focus:text-destructive" onClick={() => setDestructive({ kind: "delete", id: c.id, label: contactLabel(c.contact) })}>
                            <Trash2 className="mr-2 h-4 w-4" /> Eliminar chat
                          </ContextMenuItem>
                        </>
                      )}
                    </ContextMenuContent>
                  </ContextMenu>
                </li>
              )})}
            </ul>
          )}
        </div>
      </aside>

      {/* ── Hilo ────────────────────────────────────────────────────────── */}
      <section className="flex min-w-0 flex-1 flex-col">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <MessageSquare className="h-10 w-10 opacity-30" />
            <p className="text-sm">Elegí una conversación para verla.</p>
          </div>
        ) : (
          <>
            <header className="flex items-center gap-2 border-b border-border px-5 py-3">
              <WaContactAvatar conversationId={selected.id} name={contactLabel(selected.contact)} className="h-9 w-9 text-xs" />
              <div className="min-w-0">
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => { setNameDraft(selected.contact?.display_name ?? ""); setContactPanelOpen(true); }}
                    className="truncate text-left text-sm font-semibold hover:underline"
                    title="Ver info del contacto"
                  >
                    {contactLabel(selected.contact)}
                  </button>
                ) : (
                  <p className="truncate text-sm font-semibold">{contactLabel(selected.contact)}</p>
                )}
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  {selected.contact?.instagram_handle && (
                    <>
                      <Instagram className="h-3 w-3" />
                      @{selected.contact.instagram_handle.replace(/^@/, "")}
                    </>
                  )}
                </p>
              </div>
              {canAssign ? (
                <Popover open={assignOpen} onOpenChange={setAssignOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="ml-auto h-7 gap-1 text-xs" title="Asignar conversación">
                      <UserCheck className="h-3.5 w-3.5" />
                      {userName(selected.assigned_to) ?? "Asignar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56 p-0">
                    <Command>
                      <CommandInput placeholder="Buscar persona…" className="h-9" />
                      <CommandList>
                        <CommandEmpty>Sin resultados.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem value="sin asignar" onSelect={() => assignConversation(null)}>
                            Sin asignar
                          </CommandItem>
                          {users.map((u) => (
                            <CommandItem
                              key={u.id}
                              value={u.full_name || u.id}
                              onSelect={() => assignConversation(u.id)}
                            >
                              {u.full_name || u.id.slice(0, 8)}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              ) : (
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground" title="Asignación (solo lectura)">
                  <UserCheck className="h-3.5 w-3.5" />
                  {userName(selected.assigned_to) ?? "Sin asignar"}
                </span>
              )}
              <Badge
                variant={(statusMeta[selected.status] ?? statusMeta.open).variant}
                className="text-[10px]"
              >
                {(statusMeta[selected.status] ?? statusMeta.open).label}
              </Badge>
            </header>

            <ScrollArea className="flex-1 px-5 py-4">
              {msgLoading ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando mensajes…
                </div>
              ) : messages.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Sin mensajes.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {messages.map((m) => {
                    const isOut = m.direction === "out";
                    const isDeleted = !!m.deleted_at;
                    const mediaShown = !!m.media_url && ["image", "sticker", "video", "audio", "document"].includes(m.msg_type);
                    const bodyIsPlaceholder = !!m.body && /^\[[^\]]+\]$/.test(m.body.trim());
                    const showBody = !mediaShown ? true : (!!m.body && !bodyIsPlaceholder && m.msg_type !== "document");
                    const quoted = m.reply_to_message_id
                      ? messages.find((x) => x.id === m.reply_to_message_id) ?? null
                      : null;
                    return (
                      <div key={m.id} className={cn("group flex flex-col", isOut ? "items-end" : "items-start")}>
                        <div className={cn("flex max-w-[80%] items-end gap-1", isOut ? "flex-row-reverse" : "flex-row")}>
                          <div
                            className={cn(
                              "relative min-w-0 rounded-2xl px-3 py-2 text-sm shadow-sm",
                              isDeleted
                                ? "border border-destructive/30 bg-destructive/10 text-destructive"
                                : isOut ? "rounded-br-md bg-gradient-to-br from-accent to-primary text-white" : "rounded-bl-md bg-muted",
                              m.agent_reaction && "mb-2",
                            )}
                          >
                            {m.reply_to_message_id && (
                              <div
                                className={cn(
                                  "mb-1 rounded border-l-2 px-2 py-1 text-xs",
                                  isOut ? "border-primary-foreground/50 bg-black/10" : "border-primary bg-background/60",
                                )}
                              >
                                <p className="truncate opacity-80">
                                  {quoted ? (quoted.body || `[${quoted.msg_type}]`) : "Mensaje citado"}
                                </p>
                              </div>
                            )}
                            {m.media_url && (m.msg_type === "image" || m.msg_type === "sticker") && (
                              <img
                                src={m.media_url}
                                alt=""
                                onClick={m.msg_type === "image" ? () => openMediaViewer(m.id) : undefined}
                                className={cn(
                                  "mb-1 rounded-lg object-cover",
                                  m.msg_type === "sticker" ? "max-h-32" : "max-h-64 cursor-zoom-in",
                                )}
                              />
                            )}
                            {m.media_url && m.msg_type === "video" && (
                              <div className="relative mb-1">
                                {/(giphy|tenor)\.com|\.gif(\?|#|$)/i.test(m.media_url) ? (
                                  // GIF (Giphy/Tenor los manda como .mp4): reproducir solo, sin botón de play.
                                  <video autoPlay loop muted playsInline src={m.media_url} className="max-h-64 rounded-lg" />
                                ) : (
                                  <video controls src={m.media_url} className="max-h-64 rounded-lg" />
                                )}
                                <button
                                  type="button"
                                  onClick={() => openMediaViewer(m.id)}
                                  title="Ver en grande"
                                  className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white transition hover:bg-black/80"
                                >
                                  <Maximize2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                            {m.media_url && m.msg_type === "audio" && (
                              <audio controls src={m.media_url} className="mb-1 w-56" />
                            )}
                            {m.media_url && m.msg_type === "document" && (
                              <a
                                href={m.media_url}
                                target="_blank"
                                rel="noreferrer"
                                className={cn(
                                  "mb-1 flex items-center gap-2 rounded-lg border px-2 py-1.5",
                                  isOut ? "border-primary-foreground/30 hover:bg-black/10" : "hover:bg-muted",
                                )}
                              >
                                <FileText className="h-4 w-4 shrink-0" />
                                <span className="truncate text-xs">{m.body && !bodyIsPlaceholder ? m.body : "Documento"}</span>
                              </a>
                            )}
                            {showBody && (
                              <p className="whitespace-pre-wrap break-words">
                                {m.body || (m.msg_type !== "text" ? `[${m.msg_type}]` : "")}
                              </p>
                            )}
                            {isDeleted && (
                              <p className="mt-0.5 flex items-center gap-1 text-[10px] font-medium italic text-destructive dark:text-destructive">
                                <Trash2 className="h-3 w-3" /> mensaje eliminado
                              </p>
                            )}
                            <p
                              className={cn(
                                "mt-0.5 flex items-center justify-end gap-1 text-[10px] tabular-nums",
                                isDeleted
                                  ? "text-destructive/80 dark:text-destructive/80"
                                  : isOut ? "text-white/75" : "text-muted-foreground",
                              )}
                            >
                              {fmtTime(m.sent_at)}
                              {isOut && !isDeleted && <StatusTick status={m.status} />}
                            </p>
                            {isOut && !isDeleted && m.status === "failed" && (
                              <div className="mt-0.5 flex flex-col items-end gap-0.5">
                                <p
                                  className="flex items-center gap-1 text-[10px] font-medium text-destructive"
                                  title="WhatsApp rechazó la entrega. Causa más común: el número no tiene WhatsApp o no es el correcto. Verificá el número del contacto."
                                >
                                  <AlertCircle className="h-3 w-3" /> No entregado · revisá el número
                                </p>
                                {m.body && m.msg_type === "text" && (
                                  <button
                                    type="button"
                                    onClick={() => sendMessage(m.body!)}
                                    disabled={sending}
                                    className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline disabled:opacity-50"
                                    title="Reenviar este mensaje (el número ya pudo haberse corregido). Hacelo de a uno."
                                  >
                                    ↻ Reintentar envío
                                  </button>
                                )}
                              </div>
                            )}
                            {m.agent_reaction && (
                              <span
                                className={cn(
                                  "absolute -bottom-2.5 rounded-full border bg-background px-1 text-xs shadow-sm",
                                  isOut ? "left-2" : "right-2",
                                )}
                              >
                                {m.agent_reaction}
                              </span>
                            )}
                          </div>
                          {!isDeleted && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  aria-label="Acciones del mensaje"
                                  className="mb-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align={isOut ? "end" : "start"} side="top" className="w-auto">
                                <DropdownMenuItem onClick={() => setReplyingTo(m)}>
                                  <Reply className="mr-2 h-4 w-4" /> Responder
                                </DropdownMenuItem>
                                {m.msg_type === "sticker" && m.media_url && (
                                  <DropdownMenuItem onClick={() => saveStickerToGallery(m.media_url!)}>
                                    <Sticker className="mr-2 h-4 w-4" /> Guardar sticker
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                  Reaccionar
                                </DropdownMenuLabel>
                                <div className="flex items-center gap-0.5 px-1.5 pb-1">
                                  {["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥"].map((e) => (
                                    <button
                                      key={e}
                                      type="button"
                                      onClick={() => messageAction(m.id, "react", e)}
                                      className={cn(
                                        "rounded px-1 py-0.5 text-lg leading-none hover:bg-muted",
                                        m.agent_reaction === e && "bg-muted ring-1 ring-primary",
                                      )}
                                    >
                                      {e}
                                    </button>
                                  ))}
                                  {m.agent_reaction && (
                                    <button
                                      type="button"
                                      onClick={() => messageAction(m.id, "react", "")}
                                      aria-label="Quitar reacción"
                                      className="rounded p-1 text-muted-foreground hover:bg-muted"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                                {isOut && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => messageAction(m.id, "delete")}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" /> Eliminar para todos
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Panel del copiloto (resumir / señales) — info read-only */}
            {copilotInfo && (
              <div className="mx-4 mb-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  {copilotInfo.action === "summarize" ? "Resumen del hilo" : "Señales / próximo paso"}
                  <button
                    type="button"
                    onClick={() => setCopilotInfo(null)}
                    className="ml-auto text-muted-foreground hover:text-foreground"
                    title="Cerrar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="whitespace-pre-wrap break-words text-xs text-foreground/90">{copilotInfo.text}</p>
              </div>
            )}

            {/* Panel de info de contacto (Slice 2) — solo admin, abre al click en el nombre */}
            <Dialog open={contactPanelOpen} onOpenChange={setContactPanelOpen}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="sr-only">Info del contacto</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col items-center gap-3 pt-1">
                  {contactAvatar ? (
                    <img src={contactAvatar} alt="" className="h-20 w-20 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-2xl font-semibold text-primary">
                      {(selected?.contact?.display_name || selected?.contact?.instagram_handle || "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="flex w-full items-center gap-1">
                    <Input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      placeholder="Nombre del contacto"
                      className="h-9 text-center"
                    />
                    <Button
                      size="icon" variant="outline" className="h-9 w-9 shrink-0"
                      disabled={savingName || nameDraft === (selected?.contact?.display_name ?? "")}
                      onClick={() => saveContactName(selected?.contact?.id, nameDraft)}
                      title="Guardar nombre"
                    >
                      {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="tabular-nums">{jidToNumber(selected?.contact?.wa_jid) ?? "Número oculto (LID)"}</span>
                  </div>
                  {selected?.contact?.instagram_handle && (
                    <div className="flex items-center gap-2">
                      <Instagram className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>@{selected.contact.instagram_handle.replace(/^@/, "")}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{channelLabel(selected?.channel_id ?? null) ?? "—"} · {selected?.department ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{userName(selected?.assigned_to ?? null) ?? "Sin asignar"}</span>
                    <Popover open={assignPanelOpen} onOpenChange={setAssignPanelOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7">Reasignar</Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-56 p-0">
                        <Command>
                          <CommandInput placeholder="Buscar persona…" className="h-9" />
                          <CommandList>
                            <CommandEmpty>Sin resultados.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem value="sin asignar" onSelect={() => { assignConversation(null); setAssignPanelOpen(false); }}>
                                Sin asignar
                              </CommandItem>
                              {users.map((u) => (
                                <CommandItem key={u.id} value={u.full_name ?? u.id} onSelect={() => { assignConversation(u.id); setAssignPanelOpen(false); }}>
                                  {u.full_name ?? u.id.slice(0, 8)}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex items-center gap-1 pt-1">
                    {(["open", "pending", "closed"] as const).map((st) => (
                      <Button
                        key={st}
                        size="sm"
                        variant={selected?.status === st ? "default" : "outline"}
                        className="h-7 flex-1 text-xs"
                        onClick={() => setConversationStatus(st)}
                      >
                        {statusMeta[st].label}
                      </Button>
                    ))}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Barra de emojis — ARRIBA (misma config/catálogo que Chatter Evaluator) */}
            {!recording && (
              <EmojiBar
                emojis={inboxEmojis}
                onPick={(e) => {
                  setDraft((v) => v + e);
                  draftInputRef.current?.focus();
                }}
                onAdd={(e) => setInboxEmojis((curr) => (curr.includes(e) ? curr : [...curr, e]))}
                onRemove={(e) => setInboxEmojis((curr) => curr.filter((x) => x !== e))}
              />
            )}

            {/* Grabador de nota de voz (estilo WhatsApp): ondas + pausar/cancelar/enviar */}
            {recording && (
              <AudioRecorderBar onSend={handleRecorderSend} onCancel={() => setRecording(false)} />
            )}

            {/* Cuadro de envío — layout unificado: cita + texto AL MEDIO, acciones ABAJO
                (Copiloto · adjuntar · mic · GIF · sticker · Scripts) + Enviar a la derecha.
                NO se tocó la lógica de envío (sendMessage/sendMedia/optimista/errores). */}
            {!recording && (
            <div className="space-y-2 border-t border-border px-4 py-3">
              {/* Barra de "respondiendo a" (responder/citar) — arriba del cajón */}
              {replyingTo && (
                <div className="flex items-start gap-2 rounded-md border-l-4 border-primary bg-muted/50 px-3 py-1.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-primary">
                      {replyingTo.direction === "out" ? "Respondiendo a vos" : `Respondiendo a ${contactLabel(selected?.contact ?? null)}`}
                    </p>
                    <p className="truncate text-muted-foreground">{replyingTo.body || `[${replyingTo.msg_type}]`}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Cancelar respuesta"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={onFilePicked}
              />
              {/* Cajón de texto al medio. Pegar imagen/video del portapapeles → se manda (mismo
                  flujo de media inmediata que el adjuntar de la bandeja). */}
              <Input
                ref={draftInputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                onPaste={(e) => {
                  const items = Array.from(e.clipboardData?.items ?? []);
                  for (const it of items) {
                    if (it.kind === "file" && (it.type.startsWith("image/") || it.type.startsWith("video/"))) {
                      const f = it.getAsFile();
                      if (f) {
                        e.preventDefault();
                        sendMedia(f, f.type.startsWith("image/") ? "image" : "video", f.name || `pegado-${Date.now()}`);
                        return;
                      }
                    }
                  }
                }}
                placeholder="Escribí un mensaje…"
                className="h-10"
              />
              {/* Acciones abajo */}
              <div className="flex items-center gap-1">
                {canAccess("WhatsApp", "IA") && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      disabled={!!copilotBusy || sending}
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground"
                      title="Copiloto IA"
                    >
                      {copilotBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" className="w-52">
                    <DropdownMenuLabel className="text-xs">Copiloto IA</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => runCopilot("suggest")}>
                      <PenLine className="mr-2 h-4 w-4" /> Sugerir respuesta
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => runCopilot("summarize")}>
                      <FileText className="mr-2 h-4 w-4" /> Resumir el hilo
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => runCopilot("signals")}>
                      <Gauge className="mr-2 h-4 w-4" /> Detectar señales
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                )}
                <Button
                  variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground"
                  title="Adjuntar archivo"
                  disabled={mediaBusy || sending || recording}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {mediaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground"
                  title="Grabar nota de voz"
                  disabled={mediaBusy || sending}
                  onClick={startRecording}
                >
                  <Mic className="h-4 w-4" />
                </Button>
                <GifPicker onPick={sendGifUrl} disabled={mediaBusy || sending} />
                <StickerPicker onPick={sendStickerUrl} disabled={mediaBusy || sending} />
                {/* Scripts en último lugar (antes de Enviar). */}
                <ScriptsButton
                  surface="inbox"
                  disabled={mediaBusy || sending}
                  onUse={(s) => {
                    if (s.send_on_click) void sendMessage(s.text);
                    else { setDraft((v) => (v.trim() ? v.trimEnd() + " " : "") + s.text); draftInputRef.current?.focus(); }
                  }}
                />
                <Button
                  onClick={() => sendMessage()}
                  disabled={sending || !draft.trim()}
                  size="icon"
                  className="ml-auto h-9 w-9 shrink-0"
                  title="Enviar"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            )}
          </>
        )}
      </section>
      {lightbox && (
        <MediaLightbox
          items={lightbox.items}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* Confirmación de Vaciar / Eliminar (solo admin · solo bandeja de Maven) */}
      <Dialog open={!!destructive} onOpenChange={(o) => !o && setDestructive(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{destructive?.kind === "clear" ? "Vaciar chat" : "Eliminar chat"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {destructive?.kind === "clear" ? (
              <>Se borrarán todos los mensajes de <b>{destructive?.label}</b> en la bandeja de Maven (el chat queda vacío). <b>No afecta al WhatsApp real.</b> No se puede deshacer.</>
            ) : (
              <>Se eliminará la conversación con <b>{destructive?.label}</b> y sus mensajes de la bandeja de Maven. <b>No afecta al WhatsApp real.</b> No se puede deshacer.</>
            )}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDestructive(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={runDestructive}>
              {destructive?.kind === "clear" ? "Vaciar" : "Eliminar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nueva lista + gestionar mis listas personales */}
      <Dialog open={!!listDialog} onOpenChange={(o) => !o && setListDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva lista</DialogTitle>
          </DialogHeader>
          <Input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="Nombre de la lista (ej. VIP, Reclamos…)"
            onKeyDown={(e) => { if (e.key === "Enter") createLabel(); }}
            autoFocus
          />
          {myLabels.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Mis listas</p>
              {myLabels.map((lb) => (
                <div key={lb.id} className="flex items-center justify-between rounded-md border border-border/60 px-2.5 py-1.5 text-sm">
                  <span className="inline-flex items-center gap-1.5"><Tags className="h-3.5 w-3.5 text-muted-foreground" />{lb.name}</span>
                  <button type="button" onClick={() => deleteLabel(lb.id)} title="Borrar lista" className="text-muted-foreground transition-colors hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setListDialog(null)}>Cerrar</Button>
            <Button onClick={createLabel} disabled={!newListName.trim()}>Crear</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InboxPage;
