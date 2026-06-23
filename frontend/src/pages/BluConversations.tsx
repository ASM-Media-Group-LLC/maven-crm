import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Lock, DollarSign, Gift, Image as ImageIcon, MapPin, Clock } from "lucide-react";
import {
  useBluModels, useBluParticipants, useBluThread, useBluFan, bluModelLabel,
  type BluParticipant, type BluMessage,
} from "./sales-performance/useBluMp";

// Conversaciones BLU — viewer ON-DEMAND de Messages Pro dentro de Maven (sin almacenar nada).
// 3 paneles: modelo (dropdown) → fans del modelo → hilo + tarjeta económica del fan.
// Llama a la edge function `blu-mp` que proxa el WS de BLU con el token de sesión.

const htmlToText = (h: string) =>
  String(h || "").replace(/<\/p>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{2,}/g, "\n").trim();
const money = (n?: number | null) => `$${(Number(n) || 0).toFixed(2)}`;
const time = (s?: string) => { try { return s ? format(new Date(s), "d MMM HH:mm") : ""; } catch { return ""; } };
const chatterName = (s: BluMessage["sentByManager"]) =>
  s == null ? null : typeof s === "object" ? (s.name ?? `chatter ${s.id ?? ""}`) : `chatter ${s}`;

function MessageBubble({ m }: { m: BluMessage }) {
  const mine = m.fromMe;
  const txt = htmlToText(m.text);
  const isPpv = !m.isFree && Number(m.price) > 0;
  const who = chatterName(m.sentByManager);
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary/10 border border-primary/20" : "bg-muted border border-border"}`}>
        {txt && <p className="whitespace-pre-wrap break-words text-foreground">{txt}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {m.isTip && <Badge variant="outline" className="h-5 gap-1 border-success/40 text-success text-[10px]"><Gift className="h-3 w-3" />tip {money(m.tipAmount)}</Badge>}
          {isPpv && <Badge variant="outline" className="h-5 gap-1 border-amber-400/50 text-amber-500 text-[10px]"><Lock className="h-3 w-3" />PPV {money(m.price)}{m.isOpened ? " · abierto" : ""}</Badge>}
          {m.mediaCount > 0 && <Badge variant="outline" className="h-5 gap-1 text-[10px]"><ImageIcon className="h-3 w-3" />{m.mediaCount}</Badge>}
          <span className="text-[10px] text-muted-foreground">{time(m.createdAt)}</span>
          {who && <span className="text-[10px] text-muted-foreground">· {who}</span>}
        </div>
      </div>
    </div>
  );
}

function ParticipantRow({ p, active, onClick }: { p: BluParticipant; active: boolean; onClick: () => void }) {
  const avatar = p.avatarThumbs?.c50 || p.avatar || "";
  const label = p.name || p.username || `Fan ${p.id}`;
  return (
    <button type="button" onClick={onClick}
      className={`flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left hover:bg-muted/50 ${active ? "bg-muted" : ""}`}>
      {avatar
        ? <img src={avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" loading="lazy" />
        : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted-foreground/15 text-xs">{label.slice(0, 2)}</div>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
        {p.displayName && p.displayName !== label && <p className="truncate text-[11px] text-muted-foreground">{p.displayName}</p>}
      </div>
      {p.isRestricted && <Badge variant="outline" className="h-5 border-destructive/40 text-destructive text-[10px]">restr.</Badge>}
    </button>
  );
}

export default function BluConversations() {
  // Deep-link: el QA cualitativo abre /conversaciones?model=<id>&chat=<fanId> para
  // saltar directo a la conversación citada. Inicializamos del URL + sincronizamos.
  const [sp, setSp] = useSearchParams();
  const [modelId, setModelId] = useState<number | null>(() => Number(sp.get("model")) || null);
  const [chatId, setChatId] = useState<number | null>(() => Number(sp.get("chat")) || null);
  const selectModel = (id: number | null) => {
    setModelId(id); setChatId(null);
    const n = new URLSearchParams(sp); id ? n.set("model", String(id)) : n.delete("model"); n.delete("chat"); setSp(n, { replace: true });
  };
  const selectChat = (id: number | null) => {
    setChatId(id);
    const n = new URLSearchParams(sp); id ? n.set("chat", String(id)) : n.delete("chat"); setSp(n, { replace: true });
  };

  const { data: models = [], isLoading: modelsLoading, error: modelsErr } = useBluModels();
  const {
    data: partsData, isLoading: partsLoading, error: partsErr,
    fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useBluParticipants(modelId);
  const participants = partsData?.pages.flat() ?? [];
  const { data: messages = [], isLoading: msgsLoading, error: msgsErr } = useBluThread(modelId, chatId);
  const { data: fan } = useBluFan(modelId, chatId);
  const st = fan?.statistics;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Header + selector de modelo */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <MessageSquare className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground">Mensajes Pro</h1>
          <p className="text-[11px] text-muted-foreground">Messages Pro de BLU, en vivo · no se almacena nada (solo lectura, management).</p>
        </div>
        <Select value={modelId ? String(modelId) : ""} onValueChange={(v) => selectModel(Number(v))}>
          <SelectTrigger className="w-64"><SelectValue placeholder={modelsLoading ? "Cargando modelos…" : "Elegí un modelo"} /></SelectTrigger>
          <SelectContent className="max-h-80">
            {models.map((m) => <SelectItem key={m.id} value={String(m.id)}>{bluModelLabel(m)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {modelsErr && <p className="px-4 py-2 text-sm text-destructive">Error cargando modelos: {(modelsErr as Error).message}</p>}

      <div className="flex min-h-0 flex-1">
        {/* Panel izquierdo: fans del modelo */}
        <div className="flex w-72 shrink-0 flex-col border-r border-border">
          <div className="overflow-y-auto">
            {!modelId && <p className="p-4 text-sm text-muted-foreground">Elegí un modelo arriba.</p>}
            {modelId && partsLoading && <p className="p-4 text-sm text-muted-foreground">Cargando fans…</p>}
            {partsErr && <p className="p-4 text-sm text-destructive">{(partsErr as Error).message}</p>}
            {modelId && !partsLoading && participants.length === 0 && !partsErr && <p className="p-4 text-sm text-muted-foreground">Sin conversaciones.</p>}
            {participants.map((p) => (
              <ParticipantRow key={p.id} p={p} active={p.id === chatId} onClick={() => selectChat(p.id)} />
            ))}
            {hasNextPage && (
              <button type="button" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}
                className="w-full px-3 py-2 text-xs font-medium text-primary hover:bg-muted/50 disabled:opacity-50">
                {isFetchingNextPage ? "Cargando…" : "Cargar más"}
              </button>
            )}
          </div>
        </div>

        {/* Panel central: hilo */}
        <div className="flex min-w-0 flex-1 flex-col bg-background">
          {!chatId && <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Elegí una conversación.</div>}
          {chatId && (
            <div className="flex flex-1 flex-col-reverse overflow-y-auto p-4">
              {/* col-reverse: el scroll arranca abajo (lo más nuevo). messages ya está cronológico. */}
              <div className="flex flex-col gap-2">
                {msgsLoading && <p className="text-sm text-muted-foreground">Cargando mensajes…</p>}
                {msgsErr && <p className="text-sm text-destructive">{(msgsErr as Error).message}</p>}
                {!msgsLoading && messages.length === 0 && !msgsErr && <p className="text-sm text-muted-foreground">Sin mensajes.</p>}
                {messages.map((m) => <MessageBubble key={m.id} m={m} />)}
              </div>
            </div>
          )}
        </div>

        {/* Panel derecho: tarjeta económica + playbook del fan */}
        {chatId && (
          <div className="w-72 shrink-0 overflow-y-auto border-l border-border p-3">
            {!fan && <p className="text-sm text-muted-foreground">Cargando fan…</p>}
            {fan && st && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {st.profile?.avatar
                    ? <img src={st.profile.avatar} alt="" className="h-12 w-12 rounded-full object-cover" />
                    : <div className="h-12 w-12 rounded-full bg-muted" />}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{st.profile?.displayName || st.profile?.username}</p>
                    {st.profile?.username && <p className="truncate text-[11px] text-muted-foreground">@{st.profile.username}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {st.subscription?.status?.label && (
                    <Badge variant="outline" className={st.subscription.isExpired ? "text-muted-foreground" : "border-success/40 text-success"}>
                      {st.subscription.status.label}
                    </Badge>
                  )}
                  {st.agencySpend?.tier?.label && (
                    <Badge variant="outline" style={{ borderColor: (st.agencySpend.tier.color || "") + "66", color: st.agencySpend.tier.color || undefined }}>
                      {st.agencySpend.tier.label}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg border border-border p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Gastó (este modelo)</p>
                    <p className="flex items-center justify-center gap-0.5 text-sm font-bold"><DollarSign className="h-3 w-3" />{(Number(st.spend?.totalAmount) || 0).toFixed(0)}</p>
                  </div>
                  <div className="rounded-lg border border-border p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Gastó (agencia)</p>
                    <p className="flex items-center justify-center gap-0.5 text-sm font-bold"><DollarSign className="h-3 w-3" />{(Number(st.agencySpend?.totalAmount) || 0).toFixed(0)}</p>
                  </div>
                </div>
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  {st.profile?.location && <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{st.profile.location}</p>}
                  {st.profile?.lastSeenAt && <p className="flex items-center gap-1"><Clock className="h-3 w-3" />visto {time(st.profile.lastSeenAt)}</p>}
                </div>
                {fan.notes && (
                  <div className="rounded-lg border border-border bg-muted/30 p-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Notas / playbook</p>
                    <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-[11px] text-foreground">{fan.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
