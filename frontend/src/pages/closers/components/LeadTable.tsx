import { useState, memo, useMemo, useCallback, type ReactNode } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMyWaChannels } from "@/hooks/useMyWaChannels";
import { TgChatButton } from "@/components/TgChatButton";
import OnlyFansIcon from "@/components/icons/OnlyFansIcon";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon";
import PlatformSalesModal from "./PlatformSalesModal";
import { LEADGEN_COMPANIES } from "@/pages/leadgen/leadgenConstants";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { MoreHorizontal, ExternalLink, Loader2, AlertTriangle, Clock, ChevronDown, UserPlus, ShoppingCart, Undo2, ArrowUpDown, StickyNote, Plus } from "lucide-react";
import { CloserCreatorRow, ContactNote, CLOSER_STAGES, PLATFORMS, CHANNELS, RESULTS, CLOSE_REASONS, CLOSE_REASON_LABELS, isContactOverdue, needsContactDecision, getNextContactDate } from "../hooks/useCloserLeads";
import { useContactHistory } from "../useContactHistory";
import PlatformSalesPanel from "./PlatformSalesPanel";
import { format } from "date-fns";

interface PlatformSaleSummary {
  platform: string;
  price: number;
}

interface Props {
  creators: CloserCreatorRow[];
  activeTab: string;
  viewMode: "list" | "grid";
  onStageChange: (id: string, stage: string, source?: "closer" | "leadgen") => void;
  onFieldChange: (id: string, field: string, value: any) => void;
  onAssign: (id: string, currentAssignee: string | null, source?: "closer" | "leadgen") => void;
  onClaim?: (id: string) => void;
  onConvertToCreator?: (creator: CloserCreatorRow) => void;
  isAdmin: boolean;
  sourceAccounts: string[];
  platformSalesByCreator?: Record<string, PlatformSaleSummary[]>;
}

const CATEGORY_OPTIONS = ["Elite", "A+", "A", "B+", "B"];

const stageVariant = (s: string): "primary-soft" | "secondary-soft" | "success-soft" | "success" | "destructive-soft" | "warning-soft" => {
  const normalized = s === "Pendiente LG" ? "Nuevo" : s;
  switch (normalized) {
    case "Nuevo": return "primary-soft";
    case "Asignada": return "secondary-soft";
    case "En negociación": return "warning-soft";
    case "Formulario enviado": return "warning-soft";
    case "Acuerdo enviado": return "warning-soft";
    case "Confirmada": return "success-soft";
    case "Completada": return "success";
    case "No interesada": return "destructive-soft";
    default: return "secondary-soft";
  }
};

// (cleanPhoneForWhatsApp removido: el número ya no va al cliente; se mensajea vía Maven.)

// ─── Inline editable number cell ───
const InlineNumber = memo(({ value, onSave, prefix = "", suffix = "", disabled }: { value: number | null; onSave: (v: number) => void; prefix?: string; suffix?: string; disabled?: boolean }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value || 0));

  const save = () => {
    setEditing(false);
    const num = Number(text) || 0;
    if (num !== (value || 0)) onSave(num);
  };

  if (!editing) {
    return (
      <span
        className={`rounded px-1 py-0.5 text-sm font-medium ${disabled ? "cursor-default" : "cursor-pointer hover:bg-muted/50"}`}
        onClick={() => {
          if (disabled) return;
          setText(String(value || 0));
          setEditing(true);
        }}
      >
        {prefix}{Number(value || 0).toLocaleString()}{suffix}
      </span>
    );
  }

  return (
    <Input
      type="number"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
      onBlur={save}
      autoFocus
      className="h-7 text-sm w-24"
    />
  );
});
InlineNumber.displayName = "InlineNumber";

// ─── Inline note/rejection cell ───
// Celda de texto libre (notas, motivo). La versión vieja era un input de UNA línea
// truncado en 180px → incómodo de leer y de editar notas largas. Ahora: la celda muestra
// un preview legible de hasta 2 líneas (con ícono), y al hacer clic abre un Popover con un
// Textarea cómodo (multilínea, ⌘/Ctrl+Enter para guardar, Esc para cancelar). Estado vacío
// con una pista clara ("+ Nota") en vez de un guión mudo.
const InlineText = memo(({ value, onSave, placeholder = "—", emptyLabel = "Nota", footer }: {
  value: string | null; onSave: (v: string | null) => void; placeholder?: string; emptyLabel?: string; footer?: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value || "");

  const save = () => {
    const v = text.trim();
    if (v !== (value || "")) onSave(v || null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { if (o) setText(value || ""); setOpen(o); }} modal={true}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={value || undefined}
          className="group flex w-full max-w-[220px] items-start gap-1.5 rounded px-1.5 py-1 text-left text-sm transition-colors hover:bg-muted/60"
        >
          {value ? (
            <>
              <StickyNote className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/60" />
              <span className="line-clamp-2 leading-snug">{value}</span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/50 group-hover:text-muted-foreground">
              <Plus className="h-3 w-3" /> {placeholder !== "—" ? placeholder : emptyLabel}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-80 p-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
            if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
          }}
          autoFocus
          rows={5}
          placeholder={`Escribí ${emptyLabel === "Nota" ? "una nota" : "el motivo"}…`}
          className="resize-none text-sm"
        />
        {footer}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">⌘/Ctrl+Enter para guardar · Esc para cancelar</span>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" className="h-7 px-2 text-xs" onClick={save}>Guardar</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
});
InlineText.displayName = "InlineText";

// ─── Category variant map ───
const CATEGORY_VARIANT: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "secondary-soft" | "destructive-soft"> = {
  "Elite": "success-soft",
  "A+": "success-soft",
  "A": "primary-soft",
  "B+": "warning-soft",
  "B": "secondary-soft",
};

// ─── InlineCategorySelect ───
const InlineCategorySelect = memo(({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) => {
  const [open, setOpen] = useState(false);
  const variant = value ? CATEGORY_VARIANT[value] : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer hover:opacity-80 inline-flex items-center gap-1">
          <Badge variant={variant || "outline"}>{value || "—"}</Badge>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start" side="bottom">
        <div className="flex flex-col gap-1">
          {CATEGORY_OPTIONS.map((cat) => (
            <button
              key={cat}
              className={`cursor-pointer transition-all hover:opacity-80 ${cat === value ? "ring-2 ring-offset-1 ring-offset-background ring-primary/50 rounded-full" : ""}`}
              onClick={() => { onSave(cat); setOpen(false); }}
            >
              <Badge variant={CATEGORY_VARIANT[cat]}>{cat}</Badge>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
});
InlineCategorySelect.displayName = "InlineCategorySelect";

// ─── InlineCloseReasonSelect (motivo estructurado de cierre) ───
const InlineCloseReasonSelect = memo(({ value, onSave }: { value: string | null; onSave: (v: string) => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer hover:opacity-80 inline-flex items-center gap-1">
          <Badge variant={value ? "destructive-soft" : "outline"}>{value ? (CLOSE_REASON_LABELS[value] || value) : "—"}</Badge>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start" side="bottom">
        <div className="flex flex-col gap-0.5">
          {CLOSE_REASONS.map((r) => (
            <button
              key={r.code}
              className={`text-left text-sm px-2 py-1 rounded cursor-pointer hover:bg-muted ${r.code === value ? "bg-primary/10 font-medium" : ""}`}
              onClick={() => { onSave(r.code); setOpen(false); }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
});
InlineCloseReasonSelect.displayName = "InlineCloseReasonSelect";

// ─── InlineSourceSelect ───
const InlineSourceSelect = memo(({ value, onSave, options }: { value: string | null; onSave: (v: string | null) => void; options: string[] }) => {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState("");

  const saveCustom = () => {
    const v = customText.trim();
    if (v) { onSave(v); }
    setCustomMode(false);
    setCustomText("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setCustomMode(false); setCustomText(""); } }} modal={true}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 text-sm inline-flex items-center gap-1 max-w-[160px] truncate bg-transparent border-0" title={value || "—"}>
          {value || "—"} <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2 space-y-1" align="start" side="bottom">
        {!customMode ? (
          <>
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {options.map((opt) => (
                <div
                  key={opt}
                  className={`text-sm px-2 py-1 rounded cursor-pointer hover:bg-muted ${opt === value ? "bg-primary/10 font-medium" : ""}`}
                  onClick={() => { onSave(opt); setOpen(false); }}
                >
                  {opt}
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="w-full text-xs mt-1" onClick={() => setCustomMode(true)}>
              Otra...
            </Button>
          </>
        ) : (
          <div className="space-y-2">
            <Input
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveCustom(); if (e.key === "Escape") { setCustomMode(false); setCustomText(""); } }}
              placeholder="Nueva cuenta..."
              autoFocus
              className="h-8 text-sm"
            />
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setCustomMode(false); setCustomText(""); }}>Cancelar</Button>
              <Button size="sm" className="h-7 text-xs" onClick={saveCustom} disabled={!customText.trim()}>Guardar</Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});
InlineSourceSelect.displayName = "InlineSourceSelect";

// ─── InlineStageSelect ───
const InlineStageSelect = memo(({ value, onSave, disabled }: { value: string; onSave: (v: string) => void; disabled?: boolean }) => {
  const [open, setOpen] = useState(false);
  const displayValue = value === "Pendiente LG" ? "Nuevo" : value;
  if (disabled) {
    return <Badge variant={stageVariant(displayValue)}>{displayValue}</Badge>;
  }
  const stages = [...CLOSER_STAGES];
  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 cursor-pointer">
          <Badge variant={stageVariant(displayValue)}>{displayValue}</Badge>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start" side="bottom">
        <div className="flex flex-col gap-1">
          {stages.filter((s) => s !== "Asignada").map((s) => (
            <button
              key={s}
              className={`cursor-pointer hover:opacity-80 ${s === value ? "ring-2 ring-offset-1 ring-offset-background ring-primary/50 rounded-full" : ""}`}
              onClick={() => { onSave(s); setOpen(false); }}
            >
              <Badge variant={stageVariant(s)}>{s}</Badge>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
});
InlineStageSelect.displayName = "InlineStageSelect";

// ─── ContactCountCell (popover with history + quick form) ───
const ContactCountCell = ({ creatorId, count }: { creatorId: string; count: number }) => {
  const [open, setOpen] = useState(false);
  const { history, isLoading, addContact, maxReached } = useContactHistory(open ? creatorId : null);
  const [channel, setChannel] = useState("");
  const [result, setResult] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = () => {
    if (!channel) return;
    addContact.mutate(
      { creator_id: creatorId, channel, result: result || undefined, notes: notes || undefined },
      {
        onSuccess: () => {
          setChannel("");
          setResult("");
          setNotes("");
        },
      }
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold cursor-pointer hover:bg-muted/50 transition-colors" title={`${count} de 6 contactos`}>
          <span className="flex items-center gap-0.5" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${i < count ? (count >= 6 ? "bg-orange-500" : "bg-sky-500") : "bg-muted-foreground/25"}`}
              />
            ))}
          </span>
          {count}/6 <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 space-y-3" align="start" side="bottom">
        <p className="text-sm font-semibold">Historial de contactos</p>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Cargando...</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin contactos registrados</p>
        ) : (
          <div className="max-h-36 overflow-y-auto space-y-1.5">
            {history.map((h) => (
              <div key={h.id} className="text-xs border-b border-border pb-1.5 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{h.channel}</span>
                  <span className="text-muted-foreground">{format(new Date(h.contact_date), "dd/MM/yy")}</span>
                </div>
                {h.result && <span className="text-muted-foreground">{h.result}</span>}
                {h.notes && <p className="text-muted-foreground/70 truncate">{h.notes}</p>}
              </div>
            ))}
          </div>
        )}

        {!maxReached && (
          <>
            <div className="border-t border-border pt-2">
              <p className="text-xs font-medium mb-2">Nuevo contacto</p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Canal *</Label>
                  <Select value={channel} onValueChange={setChannel}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Resultado</Label>
                  <Select value={result} onValueChange={setResult}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {RESULTS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Notas</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" />
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleSubmit} disabled={!channel || addContact.isPending}>
                    {addContact.isPending ? "..." : "Guardar"}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

// Botón "WhatsApp" — mensajea al lead DESDE Maven (no abre el WhatsApp personal).
// Si el closer atiende 1 canal, abre el inbox directo en la conversación con el lead;
// si atiende varios, despliega para elegir desde cuál. El número queda oculto (privacidad).
const LeadWhatsappButton = ({ leadId, source, resolvedPhone }: { leadId: string; source: "closer" | "leadgen"; resolvedPhone: string | null }) => {
  const { data: channels = [] } = useMyWaChannels();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [gateMsg, setGateMsg] = useState<string | null>(null);

  const open = async (channelId: string) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("wa-inbox-open", {
      body: { channel_id: channelId, closer_creator_id: source === "closer" ? leadId : null, phone: resolvedPhone },
    });
    setBusy(false);
    // Rechazo "suave" del gating (HTTP 200 + ok:false): NO es un error, es un aviso de
    // que el lead no es tuyo → popup claro, no el toast rojo de error.
    if (data && data.ok === false) {
      setGateMsg(data.error || "Este lead no está disponible para vos.");
      return;
    }
    if (error || !data?.conversation_id) {
      toast({ title: "No se pudo abrir el chat", description: error?.message || "Error", variant: "destructive" });
      return;
    }
    navigate(`/inbox?c=${data.conversation_id}`);
  };

  // Closer leads: el edge resuelve el teléfono server-side por closer_creator_id, así
  // que mostramos el botón aunque el número no haya viajado al cliente (admin-only).
  // Leadgen (sin fila de closer): sí necesita el teléfono resuelto en el cliente.
  if (source !== "closer" && !resolvedPhone) return <span className="text-muted-foreground text-xs">—</span>;
  if (channels.length === 0) {
    return <span className="text-muted-foreground text-xs" title="No tenés canales de WhatsApp asignados">WhatsApp</span>;
  }

  const trigger = channels.length === 1 ? (
    <Button variant="ghost" size="sm" className="h-7 w-7 justify-center p-0 text-emerald-600 hover:text-emerald-700" disabled={busy} title="WhatsApp" onClick={() => open(channels[0].id)}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WhatsAppIcon className="h-3.5 w-3.5" />}
    </Button>
  ) : (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-0.5 px-1.5 text-xs text-emerald-600 hover:text-emerald-700" disabled={busy} title="WhatsApp">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WhatsAppIcon className="h-3.5 w-3.5" />} <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">¿Desde qué canal?</div>
        {channels.map((ch) => (
          <DropdownMenuItem key={ch.id} onClick={() => open(ch.id)}>
            {ch.label || ch.evolution_instance}
            <span className="ml-1.5 text-[10px] text-muted-foreground">{ch.department}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      {trigger}
      <AlertDialog open={!!gateMsg} onOpenChange={(o) => { if (!o) setGateMsg(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Este lead no es tuyo</AlertDialogTitle>
            <AlertDialogDescription>{gateMsg}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setGateMsg(null)}>Entendido</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// Fecha relativa corta ("hoy" / "ayer" / "hace N d") para columnas de fecha.
const relDays = (d: string | null | undefined): string => {
  if (!d) return "";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} d`;
};

// Celda "Seguimiento": la pill de contactos (con puntos de progreso, MISMO popover de
// registro) + últ/próx + badges Vencido/Decidir/Último intento. Consolida las viejas
// columnas # Contactos + Último contacto + Alertas. No cambia el flujo: la cadencia
// (1/3/5/8/15/29 días) y los badges se derivan de passed_date + contact_count como siempre.
// Lista read-only de las notas hechas en cada contacto (closer_contact_history),
// para mostrar debajo de la nota libre del lead en la columna "Notas".
const ContactNotesList = ({ notes }: { notes: ContactNote[] }) => {
  const withNote = (notes || [])
    .map((n, i) => ({ ...n, idx: i + 1 }))
    .filter((n) => (n.notes || "").trim().length > 0);
  if (withNote.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-0.5 border-t border-border/40 pt-1">
      {withNote.map((n) => (
        <p key={n.idx} className="text-[10px] leading-snug text-muted-foreground">
          <span className="text-muted-foreground/60">contacto {n.idx}{n.channel ? ` · ${n.channel}` : ""}:</span>{" "}
          {n.notes}
        </p>
      ))}
    </div>
  );
};

const SeguimientoCell = ({ c }: { c: CloserCreatorRow }) => {
  const overdue = isContactOverdue(c.passed_date, c.contact_count, c.last_contact_date);
  const decision = needsContactDecision(c.stage, c.contact_count);
  const lastAttempt = c.contact_count >= 6;
  const next = getNextContactDate(c.passed_date, c.contact_count, c.last_contact_date);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <ContactCountCell creatorId={c.id} count={c.contact_count} />
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
        {c.last_contact_date ? `últ ${format(new Date(c.last_contact_date), "dd/MM")}` : "sin contacto"}
        {next ? ` · próx ${format(next, "dd/MM")}` : ""}
      </span>
      {overdue && (
        <Badge variant="destructive" className="text-[10px] h-5 gap-0.5 whitespace-nowrap" title="El contacto programado venció">
          <AlertTriangle className="h-3 w-3" /> Vencido
        </Badge>
      )}
      {decision && (
        <Badge className="text-[10px] h-5 gap-0.5 whitespace-nowrap bg-orange-500 hover:bg-orange-600 text-white" title="6 contactos hechos — decidir si seguir o marcar No interesada">
          <AlertTriangle className="h-3 w-3" /> Decidir
        </Badge>
      )}
      {lastAttempt && !decision && (
        <Badge className="text-[10px] h-5 bg-warning/20 text-warning gap-0.5 whitespace-nowrap">
          <Clock className="h-3 w-3" /> Último intento
        </Badge>
      )}
    </div>
  );
};

// Link de OnlyFans a la página del lead. Vía OF (glifo de marca, como WhatsApp/Telegram):
// aparece SOLO cuando el lead ya tiene el link cargado (lo pone el LLG al pasar el lead, o
// se edita desde el botón "Editar" del lead). No es un campo editable inline — es un
// indicativo/atajo, igual que los botones de contacto.
const OfLink = ({ url }: { url: string | null | undefined }) => {
  if (!url) return null;
  const href = url.startsWith("http") ? url : `https://onlyfans.com/${url.replace(/^\/+/, "")}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir OnlyFans"
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#00AFF0] hover:bg-[#00AFF0]/10"
    >
      <OnlyFansIcon className="h-4 w-4" />
    </a>
  );
};

// Contacto del lead: WhatsApp + Telegram + OF, EN FILA y solo-íconos (como el mockup) para
// que las filas queden compactas. WhatsApp y Telegram con el mismo tamaño; el de TG contacta
// por el TELÉFONO del lead (importContacts server-side), no por el canal de promo. El logo de
// OF solo se muestra si el lead ya tiene link de OnlyFans cargado.
const LeadContactButtons = ({ leadId, source, resolvedPhone, onlyfansUrl }: { leadId: string; source: "closer" | "leadgen"; resolvedPhone: string | null; onlyfansUrl?: string | null }) => (
  <div className="flex items-center gap-1">
    <LeadWhatsappButton leadId={leadId} source={source} resolvedPhone={resolvedPhone} />
    <TgChatButton
      closerCreatorId={source === "closer" ? leadId : null}
      phone={resolvedPhone}
      compact
      className="h-7 gap-0.5 px-1.5 text-xs text-sky-600 hover:text-sky-700"
    />
    <OfLink url={onlyfansUrl} />
  </div>
);

// ─── SortHeader ───
const SortHeader = ({ label, sortKey: key, currentKey, asc, onSort, className = "" }: {
  label: string; sortKey: string; currentKey: string | null; asc: boolean;
  onSort: (key: string) => void; className?: string;
}) => (
  <TableHead className={`sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))] ${className}`}>
    <Button variant="ghost" size="sm" className="h-7 -ml-2 text-xs font-medium text-muted-foreground hover:text-foreground"
      onClick={() => onSort(key)}>
      {label}
      <ArrowUpDown className={`ml-1 h-3 w-3 ${currentKey === key ? "text-foreground" : "text-muted-foreground/50"}`} />
    </Button>
  </TableHead>
);

const CloserTable = ({ creators, activeTab, viewMode, onStageChange, onFieldChange, onAssign, onClaim, onConvertToCreator, isAdmin, sourceAccounts, platformSalesByCreator }: Props) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [platformModalId, setPlatformModalId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  // Motivo estructurado al cerrar: al mover un lead a "No interesada" pedimos el
  // motivo (enum) + detalle opcional antes de confirmar. El code va a
  // close_reason_code y alimenta el embudo (drop-off por motivo); el detalle a
  // rejection_reason. Cualquier otro cambio de stage pasa directo.
  const [closeReasonTarget, setCloseReasonTarget] = useState<{ id: string; source?: "closer" | "leadgen" } | null>(null);
  const [closeReasonCode, setCloseReasonCode] = useState<string>("");
  const [closeReasonDetail, setCloseReasonDetail] = useState<string>("");

  const requestStageChange = useCallback((id: string, stage: string, source?: "closer" | "leadgen") => {
    if (stage === "No interesada") {
      setCloseReasonTarget({ id, source });
      setCloseReasonCode("");
      setCloseReasonDetail("");
      return;
    }
    onStageChange(id, stage, source);
  }, [onStageChange]);

  const confirmCloseReason = () => {
    if (!closeReasonTarget || !closeReasonCode) return;
    const { id, source } = closeReasonTarget;
    onFieldChange(id, "close_reason_code", closeReasonCode);
    const detail = closeReasonDetail.trim();
    if (detail) onFieldChange(id, "rejection_reason", detail);
    onStageChange(id, "No interesada", source);
    setCloseReasonTarget(null);
  };

  // Permisos por acción. Default true para roles con acceso al módulo
  // padre (default DB sembrado heredando del parent). Si admin quita
  // específicamente uno, esos controles se ven disabled o desaparecen.
  const { canAccess } = usePermissions();
  const canEditStatus = canAccess("Closers", "Editar Status");
  const canAssign = canAccess("Closers", "Asignar Closer");
  const canEditComisiones = canAccess("Closers", "Editar Comisiones");
  const canConvert = canAccess("Closers", "Convertir a Creadora");

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }, [sortKey]);

  const sortedCreators = useMemo(() => {
    if (!sortKey) return creators;
    return [...creators].sort((a, b) => {
      let aVal: any = (a as any)[sortKey];
      let bVal: any = (b as any)[sortKey];
      if (aVal == null) aVal = "";
      if (bVal == null) bVal = "";
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortAsc ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortAsc ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [creators, sortKey, sortAsc]);

  const completadasTotals = activeTab === "completadas" ? creators.reduce(
    (acc, c) => {
      const platSales = (platformSalesByCreator?.[c.id] || []).reduce((s, x) => s + x.price, 0);
      return {
        monetization: acc.monetization + Number(c.estimated_monetization || 0),
        platformRev: acc.platformRev + platSales,
        count: acc.count + 1,
      };
    },
    { monetization: 0, platformRev: 0, count: 0 }
  ) : null;

  const isCloserRow = (c: CloserCreatorRow) => c._source === "closer";

  // ========= GRID VIEW =========
  if (viewMode === "grid") {
    return (
      <div>
        {sortedCreators.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Sin registros</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedCreators.map((c) => {
              const isPlatformDeal = c.deal_type === "venta_plataforma";
              const revenue = isPlatformDeal
                ? Number(c.subscription_amount || 0)
                : (Number(c.estimated_monetization || 0) * Number(c.agency_commission || 0) / 100) + Number(c.extras || 0);
              // Estado de alertas: vencido (rojo) o decisión pendiente (naranja).
              // Espejo de la lógica de check_closer_contact_alerts() en SQL.
              const contactOverdue = isContactOverdue(c.passed_date, c.contact_count, c.last_contact_date);
              const decisionPending = needsContactDecision(c.stage, c.contact_count);
              return (
                <div key={c.id} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3 hover:bg-white/10 hover:border-primary/40 transition-colors">
                  <div className="flex items-start justify-between">
                    <a href={`https://instagram.com/${c.instagram_handle.replace("@", "")}`} target="_blank" rel="noopener noreferrer"
                      className="text-primary hover:underline font-semibold flex items-center gap-1">
                      {c.instagram_handle.startsWith("@") ? c.instagram_handle : `@${c.instagram_handle}`}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={stageVariant(c.stage)} className="text-[10px]">{c.stage}</Badge>
                      {isPlatformDeal && (
                        <Badge variant="primary-soft" className="text-[9px] h-4" title="Venta de plataforma (suscripción mensual)">
                          Venta{c.main_platform ? `: ${c.main_platform}` : ""}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Agente</p>
                      <p className="font-medium truncate">{c.agent_name || "Sin asignar"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Cuenta origen</p>
                      <p className="font-medium truncate">{c.source_account || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Categoría</p>
                      <p className="font-medium truncate">{c.category || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Contactos</p>
                      <p className="font-medium">{c.contact_count}/6</p>
                    </div>
                    {(c.stage === "Confirmada" || c.stage === "Completada") && (
                      <>
                        <div>
                          <p className="text-[10px] uppercase text-muted-foreground">Plataformas</p>
                          <div className="flex flex-wrap gap-0.5">
                            {(platformSalesByCreator?.[c.id] || []).length > 0
                              ? (platformSalesByCreator?.[c.id] || []).map((s, i) => (
                                  <Badge key={i} variant="secondary" className="text-[9px] h-4">{s.platform}</Badge>
                                ))
                              : <p className="font-medium">{c.main_platform || "—"}</p>
                            }
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1 pt-1">
                    {contactOverdue && (
                      <Badge variant="destructive" className="text-[10px] h-5 gap-0.5" title="Contacto vencido — el closer no respetó la cadencia">
                        <AlertTriangle className="h-3 w-3" /> Vencido
                      </Badge>
                    )}
                    {decisionPending && (
                      <Badge className="text-[10px] h-5 gap-0.5 bg-orange-500 hover:bg-orange-600 text-white" title="6 contactos hechos — decidir si seguir o marcar No interesada">
                        <AlertTriangle className="h-3 w-3" /> Decidir
                      </Badge>
                    )}
                    {c.phone && <LeadContactButtons leadId={c.id} source={c._source} resolvedPhone={c.resolved_whatsapp_phone} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {completadasTotals && completadasTotals.count > 0 && (
          <div className="flex items-center justify-between px-4 py-3 mt-4 border border-border rounded-lg bg-muted/30 text-sm">
            <span className="font-medium">{completadasTotals.count} modelos cerradas</span>
            <div className="flex gap-6">
              <span>Monetización: <strong>${completadasTotals.monetization.toLocaleString()}</strong></span>
              <span>Rev. Plataformas: <strong>${completadasTotals.platformRev.toLocaleString()}</strong></span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ========= LIST VIEW =========

  const renderHeaders = () => {
    const sp = { currentKey: sortKey, asc: sortAsc, onSort: handleSort };
    const stickyBase = "sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]";
    const stickyAction = "text-right sticky top-0 right-0 z-30 bg-card shadow-[0_1px_0_0_hsl(var(--border))]";

    switch (activeTab) {
      case "asignadas":
        return (
          <TableRow>
            <TableHead className={`w-8 ${stickyBase}`}>#</TableHead>
            <SortHeader label="Lead" sortKey="instagram_handle" {...sp} />
            <SortHeader label="Asignada" sortKey="passed_date" {...sp} />
            <SortHeader label="Seguimiento" sortKey="contact_count" {...sp} />
            <TableHead className={stickyBase}>Contactar</TableHead>
            <TableHead className={stickyBase}>Notas</TableHead>
            <TableHead className={stickyAction}>Acciones</TableHead>
          </TableRow>
        );
      case "confirmadas":
        return (
          <TableRow>
            <TableHead className={`w-8 ${stickyBase}`}>#</TableHead>
            <SortHeader label="Lead" sortKey="instagram_handle" {...sp} />
            <TableHead className={stickyBase}>Contactar</TableHead>
            <SortHeader label="Monetización" sortKey="estimated_monetization" {...sp} />
            <SortHeader label="% Comisión" sortKey="agency_commission" {...sp} />
            <TableHead className={stickyBase}>Extras</TableHead>
            <TableHead className={stickyBase}>Plataforma</TableHead>
            <TableHead className={stickyBase}>Revenue</TableHead>
            <TableHead className={stickyBase}>Notas</TableHead>
            <TableHead className={`w-8 ${stickyBase}`}></TableHead>
            <TableHead className={stickyAction}>Acciones</TableHead>
          </TableRow>
        );
      case "completadas":
        return (
          <TableRow>
            <TableHead className={`w-8 ${stickyBase}`}>#</TableHead>
            <SortHeader label="Lead" sortKey="instagram_handle" {...sp} />
            <SortHeader label="Monetización" sortKey="estimated_monetization" {...sp} />
            <SortHeader label="% Comisión" sortKey="agency_commission" {...sp} />
            <TableHead className={stickyBase}>Plataformas</TableHead>
            <TableHead className={stickyBase}>Rev. Plat.</TableHead>
            <TableHead className={stickyBase}>Notas</TableHead>
            <TableHead className={stickyAction}>Acciones</TableHead>
          </TableRow>
        );
      case "no_interesadas":
        return (
          <TableRow>
            <TableHead className={`w-8 ${stickyBase}`}>#</TableHead>
            <SortHeader label="Lead" sortKey="instagram_handle" {...sp} />
            <TableHead className={stickyBase}>Motivo</TableHead>
            <TableHead className={stickyBase}>Detalle</TableHead>
            <TableHead className={stickyBase}>Notas</TableHead>
            <TableHead className={stickyAction}>Acciones</TableHead>
          </TableRow>
        );
      case "nuevo":
      case "antiguos":
        return (
          <TableRow>
            <TableHead className={`w-8 ${stickyBase}`}>#</TableHead>
            <SortHeader label="Lead" sortKey="instagram_handle" {...sp} />
            <SortHeader label="Estado" sortKey="stage" {...sp} />
            <TableHead className={stickyBase}>Contactar</TableHead>
            <TableHead className={stickyBase}>Notas</TableHead>
            <TableHead className={stickyAction}>Acciones</TableHead>
          </TableRow>
        );
      default: // todas
        return (
          <TableRow>
            <TableHead className={`w-8 ${stickyBase}`}>#</TableHead>
            <SortHeader label="Lead" sortKey="instagram_handle" {...sp} />
            <SortHeader label="Estado" sortKey="stage" {...sp} />
            <SortHeader label="Seguimiento" sortKey="contact_count" {...sp} />
            <TableHead className={stickyBase}>Contactar</TableHead>
            <TableHead className={stickyBase}>Notas</TableHead>
            <TableHead className={stickyAction}>Acciones</TableHead>
          </TableRow>
        );
    }
  };

  const renderRow = (c: CloserCreatorRow, idx: number) => {
    const isPlatformDeal = c.deal_type === "venta_plataforma";
    const revenue = isPlatformDeal
      ? Number(c.subscription_amount || 0)
      : (Number(c.estimated_monetization || 0) * Number(c.agency_commission || 0) / 100) + Number(c.extras || 0);
    // Estado de alertas: rojo (vencido) o naranja (decisión pendiente).
    // Calculado en el cliente para no esperar el cron — el cron sólo se
    // encarga de la notificación en la campanita, el badge visual es
    // instantáneo.
    const contactOverdue = isContactOverdue(c.passed_date, c.contact_count, c.last_contact_date);
    const decisionPending = needsContactDecision(c.stage, c.contact_count);
    const isLastAttempt = c.contact_count >= 6;
    const nextDate = getNextContactDate(c.passed_date, c.contact_count, c.last_contact_date);
    const isCloser = isCloserRow(c);

    const igLink = (
      <>
        <a href={`https://instagram.com/${c.instagram_handle.replace("@", "")}`} target="_blank" rel="noopener noreferrer"
          className="text-primary hover:underline flex items-center gap-1 font-medium">
          {c.instagram_handle.startsWith("@") ? c.instagram_handle : `@${c.instagram_handle}`}
          <ExternalLink className="h-3 w-3" />
        </a>
        {isPlatformDeal && (
          <Badge variant="primary-soft" className="text-[9px] h-4 whitespace-nowrap" title="Venta de plataforma (suscripción mensual, sin comisión %)">
            Venta{c.main_platform ? `: ${c.main_platform}` : ""}
          </Badge>
        )}
      </>
    );

    switch (activeTab) {
      case "asignadas":
        return (
          <TableRow key={c.id}>
            <TableCell className="text-muted-foreground text-xs align-top">{idx + 1}</TableCell>
            <TableCell className="align-top">
              <div className="flex items-center gap-1.5">{igLink}</div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <InlineSourceSelect value={c.source_account} onSave={(v) => onFieldChange(c.id, "source_account", v)} options={LEADGEN_COMPANIES} />
                <InlineCategorySelect value={c.category} onSave={(v) => onFieldChange(c.id, "category", v)} />
                {c.created_at && <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">creado {format(new Date(c.created_at), "dd/MM")}</span>}
              </div>
            </TableCell>
            <TableCell className="align-top">
              <div className="text-sm">{c.passed_date ? format(new Date(c.passed_date), "dd/MM/yy") : "—"}</div>
              <div className="text-[11px] text-muted-foreground">
                {relDays(c.passed_date)}{c.agent_name ? ` · ${c.agent_name}` : ""}
              </div>
            </TableCell>
            <TableCell className="align-top">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <ContactCountCell creatorId={c.id} count={c.contact_count} />
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {c.last_contact_date ? `últ ${format(new Date(c.last_contact_date), "dd/MM")}` : "sin contacto"}
                  {nextDate ? ` · próx ${format(nextDate, "dd/MM")}` : ""}
                </span>
                {contactOverdue && (
                  <Badge variant="destructive" className="text-[10px] h-5 gap-0.5 whitespace-nowrap" title="El contacto programado venció">
                    <AlertTriangle className="h-3 w-3" /> Vencido
                  </Badge>
                )}
                {decisionPending && (
                  <Badge className="text-[10px] h-5 gap-0.5 whitespace-nowrap bg-orange-500 hover:bg-orange-600 text-white" title="6 contactos hechos — decidir si seguir o marcar No interesada">
                    <AlertTriangle className="h-3 w-3" /> Decidir
                  </Badge>
                )}
                {isLastAttempt && !decisionPending && (
                  <Badge className="text-[10px] h-5 bg-warning/20 text-warning gap-0.5 whitespace-nowrap">
                    <Clock className="h-3 w-3" /> Último intento
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell className="align-top"><LeadContactButtons leadId={c.id} source={c._source} resolvedPhone={c.resolved_whatsapp_phone} onlyfansUrl={c.onlyfans_url} /></TableCell>
            <TableCell className="align-top">
              <InlineText value={c.notes} onSave={(v) => onFieldChange(c.id, "notes", v)} footer={<ContactNotesList notes={c.contact_notes} />} />
            </TableCell>
            <TableCell className="text-right sticky right-0 bg-background z-20 align-top">
              <div className="flex items-center justify-end gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isCloser && (
                      <>
                        <DropdownMenuItem onClick={() => onStageChange(c.id, "Confirmada")}>
                          Mover a Confirmada
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => requestStageChange(c.id, "No interesada")}>
                          Marcar No interesada
                        </DropdownMenuItem>
                      </>
                    )}
                    {(isAdmin || canAssign) && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onAssign(c.id, c.assigned_to)}>
                          <UserPlus className="h-4 w-4 mr-2" /> Reasignar
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </TableCell>
          </TableRow>
        );

      case "confirmadas":
        return (
          <>
            <TableRow key={c.id}>
              <TableCell className="text-muted-foreground text-xs align-top">{idx + 1}</TableCell>
              <TableCell className="align-top">
                <div className="flex items-center gap-1.5">{igLink}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-1">
                  {c.created_at ? `creado ${format(new Date(c.created_at), "dd/MM")}` : ""}{c.agent_name ? ` · ${c.agent_name}` : ""}
                </div>
              </TableCell>
              <TableCell className="align-top"><LeadContactButtons leadId={c.id} source={c._source} resolvedPhone={c.resolved_whatsapp_phone} onlyfansUrl={c.onlyfans_url} /></TableCell>
              <TableCell className="align-top">
                {isPlatformDeal
                  ? <InlineNumber value={c.subscription_amount} prefix="$" onSave={(v) => onFieldChange(c.id, "subscription_amount", v)} disabled={!canEditComisiones} />
                  : <InlineNumber value={c.estimated_monetization} prefix="$" onSave={(v) => onFieldChange(c.id, "estimated_monetization", v)} disabled={!canEditComisiones} />}
              </TableCell>
              <TableCell className="align-top">
                {isPlatformDeal
                  ? <span className="text-xs text-muted-foreground" title="Venta de plataforma: suscripción fija, sin comisión %">— susc.</span>
                  : <InlineNumber value={c.agency_commission} suffix="%" onSave={(v) => onFieldChange(c.id, "agency_commission", v)} disabled={!canEditComisiones} />}
              </TableCell>
              <TableCell className="align-top">
                <InlineNumber value={c.extras} prefix="$" onSave={(v) => onFieldChange(c.id, "extras", v)} disabled={!canEditComisiones} />
              </TableCell>
              <TableCell className="align-top">
                <Select value={c.main_platform || ""} onValueChange={(v) => onFieldChange(c.id, "main_platform", v)}>
                  <SelectTrigger className="h-7 w-28 text-xs">
                    <SelectValue placeholder="Plataforma" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="font-semibold text-sm align-top tabular-nums">${revenue.toLocaleString()}</TableCell>
              <TableCell className="align-top">
                <InlineText value={c.notes} onSave={(v) => onFieldChange(c.id, "notes", v)} footer={<ContactNotesList notes={c.contact_notes} />} />
              </TableCell>
              <TableCell className="align-top">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                  <ChevronDown className={`h-4 w-4 transition-transform ${expandedId === c.id ? "rotate-180" : ""}`} />
                </Button>
              </TableCell>
              <TableCell className="text-right sticky right-0 bg-background z-20 align-top">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onStageChange(c.id, "Completada")}>
                      Mover a Completada
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onStageChange(c.id, "Asignada")}>
                      Volver a Asignada
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
            {expandedId === c.id && (
              <TableRow>
                <TableCell colSpan={11} className="bg-muted/30 p-4">
                  <PlatformSalesPanel creatorId={c.id} />
                </TableCell>
              </TableRow>
            )}
          </>
        );

      case "completadas":
        return (
          <TableRow key={c.id}>
            <TableCell className="text-muted-foreground text-xs align-top">{idx + 1}</TableCell>
            <TableCell className="align-top">
              <div className="flex items-center gap-1.5">{igLink}</div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <InlineCategorySelect value={c.category} onSave={(v) => onFieldChange(c.id, "category", v)} />
                <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
                  {c.created_at ? `creado ${format(new Date(c.created_at), "dd/MM")}` : ""}{c.agent_name ? ` · ${c.agent_name}` : ""}
                </span>
                <OfLink url={c.onlyfans_url} />
              </div>
            </TableCell>
            <TableCell className="align-top">
              {isPlatformDeal
                ? <InlineNumber value={c.subscription_amount} prefix="$" onSave={(v) => onFieldChange(c.id, "subscription_amount", v)} disabled={!canEditComisiones} />
                : <InlineNumber value={c.estimated_monetization} prefix="$" onSave={(v) => onFieldChange(c.id, "estimated_monetization", v)} disabled={!canEditComisiones} />}
            </TableCell>
            <TableCell className="align-top">
              {isPlatformDeal
                ? <span className="text-xs text-muted-foreground" title="Venta de plataforma: suscripción fija, sin comisión %">— susc.</span>
                : <InlineNumber value={c.agency_commission} suffix="%" onSave={(v) => onFieldChange(c.id, "agency_commission", v)} disabled={!canEditComisiones} />}
            </TableCell>
            <TableCell
              className="cursor-pointer hover:bg-muted/50 rounded align-top"
              onClick={() => setPlatformModalId(c.id)}
            >
              <div className="flex flex-wrap gap-1">
                {(platformSalesByCreator?.[c.id] || []).length > 0 ? (
                  <>
                    {(platformSalesByCreator?.[c.id] || []).slice(0, 2).map((s, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px] h-5">{s.platform}: ${s.price}</Badge>
                    ))}
                    {(platformSalesByCreator?.[c.id] || []).length > 2 && (
                      <Badge variant="outline" className="text-[10px] h-5">+{(platformSalesByCreator?.[c.id] || []).length - 2}</Badge>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground text-xs">Agregar...</span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-sm font-medium align-top tabular-nums">
              ${(platformSalesByCreator?.[c.id] || []).reduce((s, x) => s + x.price, 0).toLocaleString()}
            </TableCell>
            <TableCell className="align-top">
              <InlineText value={c.notes} onSave={(v) => onFieldChange(c.id, "notes", v)} footer={<ContactNotesList notes={c.contact_notes} />} />
            </TableCell>
            <TableCell className="text-right sticky right-0 bg-background z-20 align-top">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setPlatformModalId(c.id)}>
                    <ShoppingCart className="mr-2 h-4 w-4" />
                    Ventas por Plataforma
                  </DropdownMenuItem>
                  {onConvertToCreator && canConvert && (
                    <DropdownMenuItem onClick={() => onConvertToCreator(c)}>
                      <UserPlus className="h-4 w-4 mr-2" /> Convertir a Creadora
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onStageChange(c.id, "Asignada")}>
                    <Undo2 className="mr-2 h-4 w-4" />
                    Devolver a Asignada
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        );

      case "no_interesadas":
        return (
          <TableRow key={c.id}>
            <TableCell className="text-muted-foreground text-xs align-top">{idx + 1}</TableCell>
            <TableCell className="align-top">
              <div className="flex items-center gap-1.5">{igLink}</div>
              <div className="flex items-center gap-x-1.5 gap-y-0.5 mt-1 flex-wrap text-[10px] text-muted-foreground/70">
                <span>{c.created_at ? `creado ${format(new Date(c.created_at), "dd/MM")}` : ""}{c.agent_name ? ` · ${c.agent_name}` : ""}</span>
                {c.last_contact_date && <span>· últ contacto {format(new Date(c.last_contact_date), "dd/MM")}</span>}
                <OfLink url={c.onlyfans_url} />
              </div>
            </TableCell>
            <TableCell className="align-top">
              <InlineCloseReasonSelect value={c.close_reason_code} onSave={(v) => onFieldChange(c.id, "close_reason_code", v)} />
            </TableCell>
            <TableCell className="align-top">
              <InlineText value={c.rejection_reason} onSave={(v) => onFieldChange(c.id, "rejection_reason", v)} emptyLabel="Motivo" />
            </TableCell>
            <TableCell className="align-top">
              <InlineText value={c.notes} onSave={(v) => onFieldChange(c.id, "notes", v)} footer={<ContactNotesList notes={c.contact_notes} />} />
            </TableCell>
            <TableCell className="text-right sticky right-0 bg-background z-20 align-top">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onStageChange(c.id, "Asignada", c._source)}>
                    <Undo2 className="mr-2 h-4 w-4" />
                    Volver a Asignada
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        );

      case "nuevo":
      case "antiguos":
        return (
          <TableRow key={c.id}>
            <TableCell className="text-muted-foreground text-xs align-top">{idx + 1}</TableCell>
            <TableCell className="align-top">
              <div className="flex items-center gap-1.5">{igLink}</div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <InlineSourceSelect value={c.source_account} onSave={(v) => onFieldChange(c.id, "source_account", v)} options={LEADGEN_COMPANIES} />
                <InlineCategorySelect value={c.category} onSave={(v) => onFieldChange(c.id, "category", v)} />
                <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
                  {c.created_at ? `creado ${format(new Date(c.created_at), "dd/MM")}` : ""}{c.agent_name ? ` · ${c.agent_name}` : ""}
                </span>
              </div>
            </TableCell>
            <TableCell className="align-top">
              <InlineStageSelect value={c.stage} onSave={(v) => requestStageChange(c.id, v)} disabled={!canEditStatus} />
            </TableCell>
            <TableCell className="align-top"><LeadContactButtons leadId={c.id} source={c._source} resolvedPhone={c.resolved_whatsapp_phone} onlyfansUrl={c.onlyfans_url} /></TableCell>
            <TableCell className="align-top">
              <InlineText value={c.notes} onSave={(v) => onFieldChange(c.id, "notes", v)} footer={<ContactNotesList notes={c.contact_notes} />} />
            </TableCell>
            <TableCell className="text-right sticky right-0 bg-background z-20 align-top">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {/* Tomar = auto-asignarse el lead del pool (cualquier closer).
                      RLS "Closers can claim unassigned pool" lo permite solo
                      para sí y solo sobre filas sin dueño. */}
                  <DropdownMenuItem onClick={() => onClaim?.(c.id)}>
                    <UserPlus className="h-4 w-4 mr-2" /> Tomar (asignármela)
                  </DropdownMenuItem>
                  {(isAdmin || canAssign) && (
                    <>
                      <DropdownMenuItem onClick={() => onAssign(c.id, c.assigned_to)}>
                        <UserPlus className="h-4 w-4 mr-2" /> Asignar a otro closer
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onStageChange(c.id, "Asignada")}>
                        Mover a Asignada
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        );


      default: // todas
        return (
          <TableRow key={c.id}>
            <TableCell className="text-muted-foreground text-xs align-top">{idx + 1}</TableCell>
            <TableCell className="align-top">
              <div className="flex items-center gap-1.5">{igLink}</div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <InlineSourceSelect value={c.source_account} onSave={(v) => onFieldChange(c.id, "source_account", v)} options={LEADGEN_COMPANIES} />
                <InlineCategorySelect value={c.category} onSave={(v) => onFieldChange(c.id, "category", v)} />
                <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
                  {c.created_at ? `creado ${format(new Date(c.created_at), "dd/MM")}` : ""}{c.agent_name ? ` · ${c.agent_name}` : ""}
                </span>
              </div>
            </TableCell>
            <TableCell className="align-top">
              <InlineStageSelect value={c.stage} onSave={(v) => requestStageChange(c.id, v, c._source)} disabled={!canEditStatus} />
            </TableCell>
            <TableCell className="align-top"><SeguimientoCell c={c} /></TableCell>
            <TableCell className="align-top"><LeadContactButtons leadId={c.id} source={c._source} resolvedPhone={c.resolved_whatsapp_phone} onlyfansUrl={c.onlyfans_url} /></TableCell>
            <TableCell className="align-top">
              <InlineText value={c.notes} onSave={(v) => onFieldChange(c.id, "notes", v)} footer={<ContactNotesList notes={c.contact_notes} />} />
            </TableCell>
            <TableCell className="text-right sticky right-0 bg-background z-20 align-top">
              <div className="flex items-center justify-end gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {CLOSER_STAGES.filter((s) => s !== c.stage && s !== "Asignada").map((s) => (
                      <DropdownMenuItem key={s} onClick={() => requestStageChange(c.id, s, c._source)}>
                        Mover a {s}
                      </DropdownMenuItem>
                    ))}
                    {(isAdmin || canAssign) && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onAssign(c.id, c.assigned_to, c._source)}>
                          <UserPlus className="h-4 w-4 mr-2" /> Asignar
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </TableCell>
          </TableRow>
        );
    }
  };

  return (
    <>
      <Table containerClassName="overflow-visible max-md:overflow-x-auto" className="min-w-[760px]">
        <TableHeader>
          {renderHeaders()}
        </TableHeader>
        <TableBody>
          {sortedCreators.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                Sin registros
              </TableCell>
            </TableRow>
          ) : (
            sortedCreators.map((c, idx) => renderRow(c, idx))
          )}
        </TableBody>
      </Table>

      {completadasTotals && completadasTotals.count > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30 text-sm">
          <span className="font-medium">{completadasTotals.count} modelos cerradas</span>
          <div className="flex gap-6">
              <span>Monetización: <strong>${completadasTotals.monetization.toLocaleString()}</strong></span>
              <span>Rev. Plataformas: <strong>${completadasTotals.platformRev.toLocaleString()}</strong></span>
          </div>
        </div>
      )}

      {/* Platform Sales Modal */}
      {platformModalId && (
        <PlatformSalesModal
          creatorId={platformModalId}
          instagramHandle={creators.find(c => c.id === platformModalId)?.instagram_handle || ""}
          open={!!platformModalId}
          onOpenChange={(open) => { if (!open) setPlatformModalId(null); }}
        />
      )}

      {/* Motivo estructurado al cerrar (stage → No interesada) */}
      <AlertDialog open={!!closeReasonTarget} onOpenChange={(o) => { if (!o) setCloseReasonTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Por qué se cierra?</AlertDialogTitle>
            <AlertDialogDescription>
              Elegí el motivo del cierre. Alimenta el embudo de reclutamiento para ver dónde y por qué se caen los leads.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs">Motivo *</Label>
              <Select value={closeReasonCode} onValueChange={setCloseReasonCode}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleccionar motivo" /></SelectTrigger>
                <SelectContent>
                  {CLOSE_REASONS.map((r) => <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Detalle (opcional)</Label>
              <Textarea
                value={closeReasonDetail}
                onChange={(e) => setCloseReasonDetail(e.target.value)}
                rows={2}
                className="text-sm"
                placeholder="Notas del cierre…"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCloseReasonTarget(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={!closeReasonCode} onClick={(e) => { e.preventDefault(); confirmCloseReason(); }}>
              Marcar No interesada
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CloserTable;
