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
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { MessageSquare, Search, Send, Loader2, Instagram, Radio, Sparkles, PenLine, FileText, Gauge, X, UserCheck } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { WaConversationStatus, WaMessageDirection } from "./types";

interface ConvRow {
  id: string;
  contact_id: string;
  department: string;
  status: WaConversationStatus;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  assigned_to: string | null;
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
  const { toast } = useToast();
  const { canAccess } = usePermissions();
  // Permiso configurable (Administración → Roles). Default: solo admin. Quien no
  // lo tiene ve la asignación pero NO puede cambiarla (el RPC + la RLS lo refuerzan).
  const canAssign = canAccess("WhatsApp", "Asignar conversaciones");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [searchParams] = useSearchParams();
  // Deep-link: /inbox?c=<conversationId> (ej. desde el botón WhatsApp de Closers) abre directo esa conversación.
  useEffect(() => {
    const c = searchParams.get("c");
    if (c) setSelectedId(c);
  }, [searchParams]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [copilotBusy, setCopilotBusy] = useState<string | null>(null); // acción del copiloto en curso
  const [copilotInfo, setCopilotInfo] = useState<{ action: string; text: string } | null>(null); // output read-only de resumir/señales

  const { data: conversations = [], isLoading: convLoading } = useQuery({
    queryKey: ["wa-inbox-conversations"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("wa_conversations")
        .select(
          "id, contact_id, department, status, last_message_at, last_message_preview, unread_count, assigned_to, contact:wa_contacts(display_name, instagram_handle)",
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

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || !selectedId || sending) return;
    const convId = selectedId;
    setDraft(""); // limpiar el input al instante (snappy)

    // Optimista: mostrar la burbuja saliente YA; se confirma por detrás.
    const optimisticId = "optimistic-" + Date.now();
    qc.setQueryData<MsgRow[]>(["wa-inbox-messages", convId], (old = []) => [
      ...old,
      { id: optimisticId, direction: "out", body: text, msg_type: "text", media_url: null, sent_at: new Date().toISOString() },
    ]);

    setSending(true);
    const { data, error } = await supabase.functions.invoke("wa-inbox-send", {
      body: { conversation_id: convId, body: text },
    });
    setSending(false);
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) {
      // Rollback de la burbuja optimista + restaurar el texto para reintentar.
      qc.setQueryData<MsgRow[]>(["wa-inbox-messages", convId], (old = []) =>
        old.filter((m) => m.id !== optimisticId));
      setDraft(text);
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
                      "flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-muted/40",
                      selectedId === c.id && "bg-muted/60",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("truncate text-sm", (c.unread_count ?? 0) > 0 ? "font-bold" : "font-medium")}>
                        {contactLabel(c.contact)}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {fmtTime(c.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("truncate text-xs", (c.unread_count ?? 0) > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
                        {c.last_message_preview ?? "—"}
                      </span>
                      {(c.unread_count ?? 0) > 0 && (
                        <span className="ml-auto grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                          {c.unread_count > 99 ? "99+" : c.unread_count}
                        </span>
                      )}
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

            {/* Cuadro de envío (Slice 3) + Copiloto menú (6a) */}
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
          </>
        )}
      </section>
    </div>
  );
};

export default InboxPage;
