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
import { Link, useSearchParams } from "react-router-dom";
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
import { MessageSquare, Search, Send, Loader2, Instagram, Radio, Sparkles, PenLine, FileText, Gauge, X, UserCheck, Paperclip, Mic, MoreHorizontal, Trash2, Reply, Phone, Check, CheckCheck, AlertCircle, Sticker, Maximize2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { WaConversationStatus, WaMessageDirection } from "./types";
import { EmojiBar, usePersistedEmojis } from "@/pages/chatter-evaluator/workspace/EmojiBar";
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
}

// Palomitas de WhatsApp para los mensajes SALIENTES según el estado de entrega:
// 1 palomita = enviado (server ack), 2 = entregado, 2 azules = leído, ⚠ = no entregado.
function StatusTick({ status }: { status: string | null }) {
  if (status === "failed")
    return <AlertCircle className="h-3 w-3 text-red-300" aria-label="No entregado" />;
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
  const [searchParams] = useSearchParams();
  // Deep-link: /inbox?c=<conversationId> (ej. desde el botón WhatsApp de Closers) abre directo esa conversación.
  useEffect(() => {
    const c = searchParams.get("c");
    if (c) setSelectedId(c);
  }, [searchParams]);
  const [search, setSearch] = useState("");
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
          "id, contact_id, department, status, last_message_at, last_message_preview, unread_count, assigned_to, channel_id, contact:wa_contacts(id, display_name, instagram_handle, wa_jid)",
        )
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ConvRow[];
    },
    refetchOnWindowFocus: false,
  });

  const { data: messages = [], isLoading: msgLoading } = useQuery({
    queryKey: ["wa-inbox-messages", selectedId],
    queryFn: async () => {
      if (!selectedId) return [] as MsgRow[];
      const { data, error } = await (supabase as any)
        .from("wa_conversation_messages")
        .select("id, direction, body, msg_type, media_url, agent_reaction, reply_to_message_id, sent_at, status")
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

  // Canales (id→label) para el panel de info de contacto (admin).
  const { data: channels = [] } = useQuery({
    queryKey: ["wa-inbox-channels-min"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("wa_channels").select("id, label");
      return (data ?? []) as { id: string; label: string | null }[];
    },
    refetchOnWindowFocus: false,
  });
  const channelLabel = (id: string | null) => (!id ? null : channels.find((c) => c.id === id)?.label ?? null);

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

  // Realtime: nuevos mensajes / cambios de conversación → refrescar en vivo.
  useEffect(() => {
    const channel = supabase
      .channel("wa-inbox-rt-" + Math.random().toString(36).slice(2))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wa_conversation_messages" },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] });
          const row = payload.new as { conversation_id?: string } | null;
          if (row?.conversation_id && row.conversation_id === selectedId) {
            qc.invalidateQueries({ queryKey: ["wa-inbox-messages", selectedId] });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wa_conversations" },
        () => qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        contactLabel(c.contact).toLowerCase().includes(q) ||
        (c.last_message_preview ?? "").toLowerCase().includes(q),
    );
  }, [conversations, search]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  // Al abrir una conversación con no-leídos, marcarla leída (resetea el bubble).
  // Via RPC porque la policy UPDATE de wa_conversations está gateada por permiso.
  useEffect(() => {
    if (!selectedId || !selected || (selected.unread_count ?? 0) === 0) return;
    (supabase as any).rpc("wa_mark_read", { p_conversation_id: selectedId })
      .then(() => qc.invalidateQueries({ queryKey: ["wa-inbox-conversations"] }));
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
      const res = data as { ok?: boolean; error?: string } | null;
      if (error || !res?.ok) throw new Error(error?.message ?? res?.error ?? "error");
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

  const sendMessage = async () => {
    const text = draft.trim();
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
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) {
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
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">Bandeja</h1>
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
        <ScrollArea className="flex-1">
          {convLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {conversations.length === 0 ? "Todavía no hay conversaciones." : "Sin resultados."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => { setSelectedId(c.id); setCopilotInfo(null); }}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40",
                      selectedId === c.id && "bg-muted/60",
                    )}
                  >
                    <WaContactAvatar conversationId={c.id} name={contactLabel(c.contact)} className="h-11 w-11 text-sm" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className={cn("min-w-0 flex-1 truncate text-sm", (c.unread_count ?? 0) > 0 ? "font-bold" : "font-medium")}>
                          {contactLabel(c.contact)}
                        </span>
                        <span className={cn(
                          "ml-auto shrink-0 text-[10px] tabular-nums",
                          (c.unread_count ?? 0) > 0 ? "font-semibold text-green-500" : "text-muted-foreground",
                        )}>
                          {fmtTime(c.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn("min-w-0 flex-1 truncate text-xs", (c.unread_count ?? 0) > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
                          {c.last_message_preview ?? "—"}
                        </span>
                        {(c.unread_count ?? 0) > 0 && (
                          <span className="ml-auto grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-green-500 px-1.5 text-[11px] font-bold text-white shadow-sm">
                            {c.unread_count > 99 ? "99+" : c.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
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
                    const isDeleted = m.msg_type === "deleted";
                    const mediaShown = !!m.media_url && ["image", "sticker", "video", "audio", "document"].includes(m.msg_type);
                    const bodyIsPlaceholder = !!m.body && /^\[[^\]]+\]$/.test(m.body.trim());
                    const showBody = isDeleted
                      ? true
                      : (!mediaShown ? true : (!!m.body && !bodyIsPlaceholder && m.msg_type !== "document"));
                    const quoted = m.reply_to_message_id
                      ? messages.find((x) => x.id === m.reply_to_message_id) ?? null
                      : null;
                    return (
                      <div key={m.id} className={cn("group flex flex-col", isOut ? "items-end" : "items-start")}>
                        <div className={cn("flex max-w-[80%] items-end gap-1", isOut ? "flex-row-reverse" : "flex-row")}>
                          <div
                            className={cn(
                              "relative min-w-0 rounded-2xl px-3 py-2 text-sm",
                              isOut ? "bg-primary text-primary-foreground" : "bg-muted",
                              isDeleted && "opacity-70",
                              m.agent_reaction && "mb-2",
                            )}
                          >
                            {!isDeleted && m.reply_to_message_id && (
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
                            {!isDeleted && m.media_url && (m.msg_type === "image" || m.msg_type === "sticker") && (
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
                            {!isDeleted && m.media_url && m.msg_type === "video" && (
                              <div className="relative mb-1">
                                <video controls src={m.media_url} className="max-h-64 rounded-lg" />
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
                            {!isDeleted && m.media_url && m.msg_type === "audio" && (
                              <audio controls src={m.media_url} className="mb-1 w-56" />
                            )}
                            {!isDeleted && m.media_url && m.msg_type === "document" && (
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
                              <p className={cn("whitespace-pre-wrap break-words", isDeleted && "italic opacity-80")}>
                                {isDeleted ? "🚫 Mensaje eliminado" : (m.body || (m.msg_type !== "text" ? `[${m.msg_type}]` : ""))}
                              </p>
                            )}
                            <p
                              className={cn(
                                "mt-0.5 flex items-center justify-end gap-1 text-[10px] tabular-nums",
                                isOut ? "text-primary-foreground/70" : "text-muted-foreground",
                              )}
                            >
                              {fmtTime(m.sent_at)}
                              {isOut && !isDeleted && <StatusTick status={m.status} />}
                            </p>
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

            {/* Barra de "respondiendo a" (Slice 1 responder/citar) */}
            {replyingTo && (
              <div className="mx-4 mt-2 flex items-start gap-2 rounded-md border-l-4 border-primary bg-muted/50 px-3 py-1.5 text-xs">
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

            {/* Barra de emojis — misma config/catálogo que Chatter Evaluator */}
            {!recording && (
              <EmojiBar
                emojis={inboxEmojis}
                onPick={(e) => setDraft((v) => v + e)}
                onAdd={(e) => setInboxEmojis((curr) => (curr.includes(e) ? curr : [...curr, e]))}
                onRemove={(e) => setInboxEmojis((curr) => curr.filter((x) => x !== e))}
              />
            )}

            {/* Grabador de nota de voz (estilo WhatsApp): ondas + pausar/cancelar/enviar */}
            {recording && (
              <AudioRecorderBar onSend={handleRecorderSend} onCancel={() => setRecording(false)} />
            )}

            {/* Cuadro de envío (Slice 3) + Copiloto menú (6a) */}
            {!recording && (
            <div className="flex items-center gap-2 border-t border-border px-4 py-3">
              {canAccess("WhatsApp", "IA") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    disabled={!!copilotBusy || sending}
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0"
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={onFilePicked}
              />
              <Button
                variant="outline" size="icon" className="h-10 w-10 shrink-0"
                title="Adjuntar archivo"
                disabled={mediaBusy || sending || recording}
                onClick={() => fileInputRef.current?.click()}
              >
                {mediaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline" size="icon" className="h-10 w-10 shrink-0"
                title="Grabar nota de voz"
                disabled={mediaBusy || sending}
                onClick={startRecording}
              >
                <Mic className="h-4 w-4" />
              </Button>
              <GifPicker onPick={sendGifUrl} disabled={mediaBusy || sending} />
              <StickerPicker onPick={sendStickerUrl} disabled={mediaBusy || sending} />
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Escribí un mensaje…"
                className="h-10"
              />
              <Button
                onClick={sendMessage}
                disabled={sending || !draft.trim()}
                size="icon"
                className="h-10 w-10 shrink-0"
                title="Enviar"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
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
    </div>
  );
};

export default InboxPage;
