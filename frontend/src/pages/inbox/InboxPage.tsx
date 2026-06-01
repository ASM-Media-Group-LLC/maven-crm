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

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MessageSquare, Search, Lock, Loader2, Instagram } from "lucide-react";
import type { WaConversationStatus, WaMessageDirection } from "./types";

interface ConvRow {
  id: string;
  contact_id: string;
  department: string;
  status: WaConversationStatus;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  contact: { display_name: string | null; instagram_handle: string | null } | null;
}

interface MsgRow {
  id: string;
  direction: WaMessageDirection;
  body: string | null;
  msg_type: string;
  media_url: string | null;
  sent_at: string;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: conversations = [], isLoading: convLoading } = useQuery({
    queryKey: ["wa-inbox-conversations"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("wa_conversations")
        .select(
          "id, contact_id, department, status, last_message_at, last_message_preview, unread_count, contact:wa_contacts(display_name, instagram_handle)",
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
        .select("id, direction, body, msg_type, media_url, sent_at")
        .eq("conversation_id", selectedId)
        .order("sent_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as MsgRow[];
    },
    enabled: !!selectedId,
    refetchOnWindowFocus: false,
  });

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

  return (
    <div className="flex h-full min-h-0">
      {/* ── Lista de conversaciones ─────────────────────────────────────── */}
      <aside className="flex w-80 shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">Bandeja</h1>
          <Badge variant="secondary-soft" className="ml-auto text-[10px]">
            {convLoading ? "…" : conversations.length}
          </Badge>
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
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-muted/40",
                      selectedId === c.id && "bg-muted/60",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{contactLabel(c.contact)}</span>
                      <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {fmtTime(c.last_message_at)}
                      </span>
                    </div>
                    <span className="truncate text-xs text-muted-foreground">
                      {c.last_message_preview ?? "—"}
                    </span>
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
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{contactLabel(selected.contact)}</p>
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  {selected.contact?.instagram_handle && (
                    <>
                      <Instagram className="h-3 w-3" />
                      @{selected.contact.instagram_handle.replace(/^@/, "")}
                    </>
                  )}
                </p>
              </div>
              <Badge
                variant={(statusMeta[selected.status] ?? statusMeta.open).variant}
                className="ml-auto text-[10px]"
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
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                        m.direction === "out"
                          ? "self-end bg-primary text-primary-foreground"
                          : "self-start bg-muted",
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {m.body || (m.msg_type !== "text" ? `[${m.msg_type}]` : "")}
                      </p>
                      <p
                        className={cn(
                          "mt-0.5 text-right text-[10px] tabular-nums",
                          m.direction === "out" ? "text-primary-foreground/70" : "text-muted-foreground",
                        )}
                      >
                        {fmtTime(m.sent_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Cuadro de envío — llega en el próximo paso (Slice 5). */}
            <div className="flex items-center gap-2 border-t border-border px-5 py-3 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" />
              <span>Responder desde acá llega en el próximo paso.</span>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default InboxPage;
