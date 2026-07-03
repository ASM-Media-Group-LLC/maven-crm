// Bandeja de Telegram (S3.1) — LECTURA. Espejo simplificado de la bandeja de WhatsApp
// (pages/inbox/InboxPage.tsx): lista de conversaciones + hilo + realtime + deep-link ?c=<id>.
// Muestra los DMs que el gateway ingesta vía telegram-ingest (tg_conversations/tg_messages).
//
// Seguridad: RLS por dueño (closer ve solo lo asignado; supervisor+ ve todo) + peer_phone
// REVOCADO a authenticated → acá SIEMPRE se seleccionan columnas explícitas (nunca *).
// Responder (enviar) llega en S3.2 (edge tg-inbox-send + ChatComposer).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import TelegramIcon from "@/components/icons/TelegramIcon";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Radio, Inbox as InboxIcon, Loader2, AtSign } from "lucide-react";

// Columnas explícitas (peer_phone está revocado para authenticated → NO se pide).
const CONV_COLS =
  "id, account_id, peer_id, peer_name, peer_username, status, assigned_to, last_message_at, last_message_preview, unread_count, archived, pinned, favorite, created_at";

interface TgConv {
  id: string;
  account_id: string;
  peer_id: string;
  peer_name: string | null;
  peer_username: string | null;
  status: string | null;
  assigned_to: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  archived: boolean;
  pinned: boolean;
  favorite: boolean;
  created_at: string;
}
interface TgMsg {
  id: string;
  direction: "in" | "out";
  body: string | null;
  msg_type: string;
  media_url: string | null;
  sent_at: string | null;
  status: string | null;
}

// Tiempo relativo corto (sin dependencias): "ahora", "5m", "3h", "2d", o fecha.
const shortTime = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString();
};

const peerLabel = (c: TgConv) =>
  c.peer_name || (c.peer_username ? `@${c.peer_username}` : null) || `Telegram ${c.peer_id.slice(0, 8)}`;

const TelegramInboxPage = () => {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Deep-link /telegram/bandeja?c=<id>
  useEffect(() => {
    const c = searchParams.get("c");
    if (c) setSelectedId(c);
  }, [searchParams]);

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
        .select("id, direction, body, msg_type, media_url, sent_at, status")
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

  // Marcar leído al abrir (RPC; el cliente no puede UPDATE directo).
  useEffect(() => {
    if (!selectedId) return;
    (supabase as any).rpc("tg_mark_read", { p_conversation_id: selectedId }).then(() => {
      qc.invalidateQueries({ queryKey: ["tg-inbox-conversations"] });
    });
  }, [selectedId, qc]);

  // Autoscroll al fondo al abrir/llegar mensajes.
  useEffect(() => {
    if (msgLoading) return;
    const anchor = messagesEndRef.current;
    const vp = anchor?.closest("[data-radix-scroll-area-viewport]") as HTMLElement | null;
    requestAnimationFrame(() => { if (vp) vp.scrollTop = vp.scrollHeight; });
  }, [selectedId, msgLoading, messages]);

  // Realtime: conversaciones + mensajes → invalidar.
  useEffect(() => {
    const ch = supabase
      .channel("tg-inbox-rt-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "tg_conversations" }, () =>
        qc.invalidateQueries({ queryKey: ["tg-inbox-conversations"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "tg_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["tg-inbox-conversations"] });
        qc.invalidateQueries({ queryKey: ["tg-inbox-messages", selectedId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = allConversations.filter((c) => !c.archived);
    if (!q) return list;
    return list.filter(
      (c) =>
        peerLabel(c).toLowerCase().includes(q) ||
        (c.last_message_preview ?? "").toLowerCase().includes(q),
    );
  }, [allConversations, search]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header interno (patrón WhatsApp: cada subtab con su header + nav a hermanos). */}
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <TelegramIcon className="h-5 w-5 text-sky-500" />
        <h1 className="text-base font-semibold">Bandeja de Telegram</h1>
        <Link
          to="/telegram"
          className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Radio className="h-3.5 w-3.5" /> Cuentas
        </Link>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Lista */}
        <aside className={`${selectedId ? "hidden md:flex" : "flex"} w-full flex-col border-r md:w-80`}>
          <div className="border-b p-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="h-9 rounded-lg border-0 bg-primary/5 text-sm focus-visible:ring-1 focus-visible:ring-primary/30"
            />
          </div>
          <ScrollArea className="flex-1">
            {convLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                <InboxIcon className="mx-auto mb-2 h-8 w-8 opacity-40" />
                No hay conversaciones todavía. Aparecen acá cuando alguien te escribe por Telegram.
              </div>
            ) : (
              filtered.map((c) => {
                const unread = (c.unread_count ?? 0) > 0;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`flex w-full items-start gap-2 border-b px-3 py-2.5 text-left transition-colors hover:bg-primary/5 ${
                      selectedId === c.id ? "bg-primary/10" : ""
                    }`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-600">
                      <TelegramIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`truncate text-sm ${unread ? "font-semibold" : "font-medium"}`}>
                          {peerLabel(c)}
                        </span>
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                          {shortTime(c.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <p className={`truncate text-xs ${unread ? "text-foreground" : "text-muted-foreground"}`}>
                          {c.last_message_preview || "—"}
                        </p>
                        {unread && (
                          <span className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-semibold text-white">
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </ScrollArea>
        </aside>

        {/* Hilo */}
        <section className={`${selectedId ? "flex" : "hidden md:flex"} min-h-0 flex-1 flex-col`}>
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Elegí una conversación para verla.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b px-4 py-2.5">
                <button
                  onClick={() => setSelectedId(null)}
                  className="md:hidden text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/10 text-sky-600">
                  <TelegramIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{peerLabel(selected)}</div>
                  {selected.peer_username && (
                    <div className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                      <AtSign className="h-3 w-3" />
                      {selected.peer_username}
                      <span className="ml-1.5 rounded bg-muted px-1">{selected.account_id}</span>
                    </div>
                  )}
                </div>
              </div>

              <ScrollArea className="flex-1 bg-muted/20">
                <div className="flex flex-col gap-1.5 p-4">
                  {msgLoading ? (
                    <div className="flex justify-center py-10 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">Sin mensajes.</div>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-3 py-1.5 text-sm ${
                            m.direction === "out"
                              ? "bg-sky-500 text-white"
                              : "bg-card border"
                          }`}
                        >
                          {m.msg_type !== "text" && !m.body ? (
                            <span className="italic opacity-80">[{m.msg_type}]</span>
                          ) : (
                            <span className="whitespace-pre-wrap break-words">{m.body}</span>
                          )}
                          <span
                            className={`ml-2 align-bottom text-[10px] ${
                              m.direction === "out" ? "text-white/70" : "text-muted-foreground"
                            }`}
                          >
                            {shortTime(m.sent_at)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Responder llega en S3.2 (edge tg-inbox-send + ChatComposer con auto-grow). */}
              <div className="border-t bg-card px-4 py-3 text-center text-xs text-muted-foreground">
                Responder desde Maven llega en el próximo slice.
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default TelegramInboxPage;
