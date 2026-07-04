// Bandeja de Telegram — LECTURA (S3.1) + RESPONDER (S3.2) + asignación (S4). Layout calcado
// de la bandeja de WhatsApp (pages/inbox/InboxPage.tsx) — filas redondeadas SIN líneas, chips
// de filtro por canal arriba, etiqueta de canal por fila, hora fecha+hora — con la identidad
// CELESTE de Telegram (gradiente #4bc0f0→#2b8fd8 en acentos).
//
// Seguridad: RLS por dueño + peer_phone REVOCADO → columnas explícitas (nunca *).
// REALTIME: esta página solo escucha tg_conversations; los INSERT de tg_messages los maneja
// la suscripción GLOBAL única de useTgInboxNotifications (AppShell), como WhatsApp.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import TelegramIcon from "@/components/icons/TelegramIcon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { ArrowLeft, Radio, Inbox as InboxIcon, Loader2, AtSign, UserCheck, Search } from "lucide-react";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { usePersistedEmojis } from "@/pages/chatter-evaluator/workspace/EmojiBar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";

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

// Fecha + hora (idéntico a la bandeja de WhatsApp: "3 jul, 04:00 p. m.").
const fmtTime = (iso: string | null): string => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
};

// Columnas explícitas (peer_phone está revocado para authenticated → NO se pide).
const CONV_COLS =
  "id, account_id, peer_id, peer_name, peer_username, status, assigned_to, last_message_at, last_message_preview, unread_count, archived, pinned, favorite, created_at";

interface TgConv {
  id: string; account_id: string; peer_id: string;
  peer_name: string | null; peer_username: string | null;
  status: string | null; assigned_to: string | null;
  last_message_at: string | null; last_message_preview: string | null;
  unread_count: number; archived: boolean; pinned: boolean; favorite: boolean; created_at: string;
}
interface TgMsg {
  id: string; direction: "in" | "out"; body: string | null;
  msg_type: string; media_url: string | null; sent_at: string | null; status: string | null;
  sender_user_id: string | null; // closer (usuario Maven) que mandó el saliente; null si entrante
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [chatFilter, setChatFilter] = useState<"todos" | "no_leidos">("todos");
  const [channelFilter, setChannelFilter] = useState<string | null>(null); // account_id activo (null = todos)
  const [draft, setDraft] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [tgEmojis, setTgEmojis] = usePersistedEmojis("telegram", user?.id);
  const { canAccess } = usePermissions();
  const canAssign = canAccess("Telegram", "Asignar conversaciones");

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
        .select("id, direction, body, msg_type, media_url, sent_at, status, sender_user_id")
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

  const assignConversation = async (userId: string | null) => {
    if (!selectedId) return;
    setAssignOpen(false);
    const { error } = await (supabase as any).rpc("tg_assign_conversation", {
      p_conversation_id: selectedId, p_assignee: userId,
    });
    if (error) { toast({ title: "No se pudo asignar", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["tg-inbox-conversations"] });
    toast({ title: userId ? `Asignada a ${userName(userId)}` : "Asignación quitada" });
  };

  // Marcar leído al abrir (RPC; el cliente no puede UPDATE directo).
  useEffect(() => {
    if (!selectedId) return;
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = allConversations.filter((c) => !c.archived);
    if (chatFilter === "no_leidos") list = list.filter((c) => (c.unread_count ?? 0) > 0);
    if (channelFilter) list = list.filter((c) => c.account_id === channelFilter); // filtro por canal (ortogonal)
    if (!q) return list;
    return list.filter(
      (c) => peerLabel(c).toLowerCase().includes(q) || (c.last_message_preview ?? "").toLowerCase().includes(q),
    );
  }, [allConversations, search, chatFilter, channelFilter]);

  // Envío (S3.2): responder por el gateway vía tg-inbox-send. onSend del ChatComposer:
  // si throwea, conserva el texto. Solo texto por ahora.
  const composerSend = async (text: string, files: File[]) => {
    if (files.length) toast({ title: "Solo texto por ahora", description: "Adjuntar media a Telegram llega en un próximo slice." });
    const body = text.trim();
    if (!body || !selectedId) throw new Error("empty");
    const { data, error } = await supabase.functions.invoke("tg-inbox-send", { body: { conversation_id: selectedId, body } });
    const res = data as { ok?: boolean; error?: string; reason?: string } | null;
    if (error || !res?.ok) {
      toast({
        title: "No se pudo enviar",
        description: res?.reason === "send_failed" ? "El gateway no pudo entregar el mensaje." : (res?.error || error?.message || "Error"),
        variant: "destructive",
      });
      throw new Error(res?.error || "send_failed");
    }
    qc.invalidateQueries({ queryKey: ["tg-inbox-messages", selectedId] });
    qc.invalidateQueries({ queryKey: ["tg-inbox-conversations"] });
  };

  const showChannelChip = !channelFilter && channels.length > 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header interno (patrón WhatsApp: cada subtab con su header + nav a hermanos). */}
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <TelegramIcon className="h-5 w-5 text-sky-500" />
        <h1 className="text-base font-semibold">Telegram</h1>
        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-400">Beta</span>
        <Link to="/telegram" className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Radio className="h-3.5 w-3.5" /> Cuentas
        </Link>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Lista */}
        <aside className={cn(selectedId ? "hidden md:flex" : "flex", "w-full flex-col border-r md:w-80")}>
          <div className="relative px-3 pb-2 pt-3">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversación…"
              className="h-9 pl-8"
            />
          </div>

          {/* Filtro por CANAL (línea) — solo si hay más de una. Ortogonal a los chips de abajo. */}
          {channels.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto px-3 pb-2">
              <span className="shrink-0 pr-0.5 text-[11px] font-medium text-muted-foreground">Canal</span>
              <button
                type="button"
                onClick={() => setChannelFilter(null)}
                className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  !channelFilter ? `${TG_GRAD_R} text-white shadow-sm` : "bg-muted text-foreground border border-border hover:bg-muted/70")}
              >
                Todos
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

          {/* Filtros (chips): presets. */}
          <div className="flex items-center gap-1.5 overflow-x-auto px-3 pb-3">
            {([["todos", "Todos"], ["no_leidos", "No leídos"]] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setChatFilter(key)}
                className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  chatFilter === key ? `${TG_GRAD_R} text-white shadow-sm` : "bg-muted text-foreground border border-border hover:bg-muted/70")}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {convLoading ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                <InboxIcon className="mx-auto mb-2 h-8 w-8 opacity-40" />
                {chatFilter === "no_leidos" ? "No hay conversaciones sin leer."
                  : "No hay conversaciones todavía. Aparecen acá cuando alguien te escribe por Telegram."}
              </div>
            ) : (
              <ul className="space-y-0.5 px-2 py-2">
                {filtered.map((c) => {
                  const unread = (c.unread_count ?? 0) > 0;
                  const active = selectedId === c.id;
                  return (
                    <li key={c.id}>
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
                            <span className={cn("min-w-0 flex-1 truncate text-sm", unread ? "font-bold" : "font-medium")}>
                              {peerLabel(c)}
                            </span>
                            <span className={cn("ml-auto shrink-0 text-[10px] tabular-nums", unread ? "font-semibold text-sky-500" : "text-muted-foreground")}>
                              {fmtTime(c.last_message_at)}
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
                            {unread && (
                              <span className={cn("ml-auto grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-bold text-white shadow-sm", TG_GRAD)}>
                                {c.unread_count > 99 ? "99+" : c.unread_count}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
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
              Elegí una conversación para verla.
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
                  </div>
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
                            <CommandItem value="sin asignar" onSelect={() => assignConversation(null)}>Sin asignar</CommandItem>
                            {users.map((u) => (
                              <CommandItem key={u.id} value={u.full_name || u.id} onSelect={() => assignConversation(u.id)}>
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
              </div>

              <div className="flex-1 overflow-y-auto bg-muted/20">
                <div className="flex flex-col gap-1.5 p-4">
                  {msgLoading ? (
                    <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
                  ) : messages.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">Sin mensajes.</div>
                  ) : (
                    messages.map((m) => {
                      const isOut = m.direction === "out";
                      const failed = isOut && m.status === "failed";
                      // Etiqueta "quién lo mandó" en CADA saliente con emisor conocido (mensajes viejos
                      // o enviados desde el propio teléfono no tienen sender_user_id → sin nombre, es correcto).
                      const showSender = isOut && !!m.sender_user_id;
                      return (
                        <div key={m.id} className={cn("flex", isOut ? "justify-end" : "justify-start")}>
                          <div className={cn(
                            "max-w-[75%] px-3 py-1.5 text-sm shadow-sm",
                            isOut
                              ? failed ? "rounded-2xl rounded-br-md bg-destructive/80 text-white" : cn("rounded-2xl rounded-br-md text-white", TG_GRAD)
                              : "rounded-2xl rounded-bl-md border bg-card",
                          )}>
                            {showSender && (
                              <div className="mb-0.5 text-[11px] font-semibold text-white/85">
                                {firstName(m.sender_user_id)}
                              </div>
                            )}
                            {m.msg_type !== "text" && !m.body ? (
                              <span className="italic opacity-80">[{m.msg_type}]</span>
                            ) : (
                              <span className="whitespace-pre-wrap break-words">{m.body}</span>
                            )}
                            <span className={cn("ml-2 align-bottom text-[10px] tabular-nums", isOut ? "text-white/70" : "text-muted-foreground")}>
                              {failed ? "no entregado · " : ""}{fmtTime(m.sent_at)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Composer unificado (emojis arriba · cajón auto-grow · Enviar celeste del canal). */}
              <ChatComposer
                value={draft}
                onChange={setDraft}
                onSend={composerSend}
                placeholder={`Responder a ${peerLabel(selected)}…`}
                emojis={tgEmojis}
                onAddEmoji={(e) => setTgEmojis((curr) => (curr.includes(e) ? curr : [...curr, e]))}
                onRemoveEmoji={(e) => setTgEmojis((curr) => curr.filter((x) => x !== e))}
                sendButtonClassName={TG_GRAD}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default TelegramInboxPage;
