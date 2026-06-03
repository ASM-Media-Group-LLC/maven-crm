import { useState, memo, useMemo, useCallback } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMyWaChannels } from "@/hooks/useMyWaChannels";
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
import { MoreHorizontal, ExternalLink, MessageCircle, Loader2, AlertTriangle, Clock, ChevronDown, UserPlus, ShoppingCart, Undo2, ArrowUpDown } from "lucide-react";
import { CloserCreatorRow, CLOSER_STAGES, PLATFORMS, CHANNELS, RESULTS, isContactOverdue, needsContactDecision, getNextContactDate } from "../hooks/useCloserLeads";
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

// ─── Inline text cell (kept for notes/rejection) ───
const InlineText = memo(({ value, onSave, placeholder = "—" }: { value: string | null; onSave: (v: string | null) => void; placeholder?: string }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || "");

  const save = () => {
    setEditing(false);
    const v = text.trim();
    if (v !== (value || "")) onSave(v || null);
  };

  if (!editing) {
    return (
      <span
        className="cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 block max-w-[180px] truncate text-sm"
        onClick={() => { setText(value || ""); setEditing(true); }}
        title={value || placeholder}
      >
        {value || placeholder}
      </span>
    );
  }

  return (
    <Input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
      onBlur={save}
      autoFocus
      className="h-7 text-sm w-44"
    />
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
        <button className="inline-flex items-center gap-0.5 rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold cursor-pointer hover:bg-muted/50 transition-colors">
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

  const open = async (channelId: string) => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("wa-inbox-open", {
      body: { channel_id: channelId, closer_creator_id: source === "closer" ? leadId : null, phone: resolvedPhone },
    });
    setBusy(false);
    if (error || !data?.ok) {
      toast({ title: "No se pudo abrir el chat", description: data?.error || error?.message || "Error", variant: "destructive" });
      return;
    }
    navigate(`/inbox?c=${data.conversation_id}`);
  };

  if (!resolvedPhone) return <span className="text-muted-foreground text-xs">—</span>;
  if (channels.length === 0) {
    return <span className="text-muted-foreground text-xs" title="No tenés canales de WhatsApp asignados">WhatsApp</span>;
  }
  if (channels.length === 1) {
    return (
      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-emerald-600 hover:text-emerald-700" disabled={busy} onClick={() => open(channels[0].id)}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />} WhatsApp
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-emerald-600 hover:text-emerald-700" disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />} WhatsApp <ChevronDown className="h-3 w-3" />
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
};

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

const CloserTable = ({ creators, activeTab, viewMode, onStageChange, onFieldChange, onAssign, onConvertToCreator, isAdmin, sourceAccounts, platformSalesByCreator }: Props) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [platformModalId, setPlatformModalId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

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
              const revenue = (Number(c.estimated_monetization || 0) * Number(c.agency_commission || 0) / 100) + Number(c.extras || 0);
              // Estado de alertas: vencido (rojo) o decisión pendiente (naranja).
              // Espejo de la lógica de check_closer_contact_alerts() en SQL.
              const contactOverdue = isContactOverdue(c.passed_date, c.contact_count);
              const decisionPending = needsContactDecision(c.stage, c.contact_count);
              return (
                <div key={c.id} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3 hover:bg-white/10 hover:border-primary/40 transition-colors">
                  <div className="flex items-start justify-between">
                    <a href={`https://instagram.com/${c.instagram_handle.replace("@", "")}`} target="_blank" rel="noopener noreferrer"
                      className="text-primary hover:underline font-semibold flex items-center gap-1">
                      {c.instagram_handle.startsWith("@") ? c.instagram_handle : `@${c.instagram_handle}`}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <Badge variant={stageVariant(c.stage)} className="text-[10px]">{c.stage}</Badge>
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
                    {c.phone && <LeadWhatsappButton leadId={c.id} source={c._source} resolvedPhone={c.resolved_whatsapp_phone} />}
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
            <TableHead className={`w-10 ${stickyBase}`}>#</TableHead>
            <SortHeader label="Creación" sortKey="created_at" {...sp} />
            <SortHeader label="Instagram" sortKey="instagram_handle" {...sp} />
            <SortHeader label="Cuenta origen" sortKey="source_account" {...sp} />
            <SortHeader label="Categoría" sortKey="category" {...sp} />
            <SortHeader label="Fecha asignación" sortKey="passed_date" {...sp} />
            <SortHeader label="Agente" sortKey="agent_name" {...sp} />
            <SortHeader label="# Contactos" sortKey="contact_count" {...sp} />
            <SortHeader label="Último contacto" sortKey="last_contact_date" {...sp} />
            <SortHeader label="Teléfono" sortKey="phone" {...sp} />
            <TableHead className={stickyBase}>OF URL</TableHead>
            <TableHead className={stickyBase}>Alertas</TableHead>
            <TableHead className={stickyBase}>Notas</TableHead>
            <TableHead className={stickyAction}>Acciones</TableHead>
          </TableRow>
        );
      case "confirmadas":
        return (
          <TableRow>
            <TableHead className={`w-10 ${stickyBase}`}>#</TableHead>
            <SortHeader label="Creación" sortKey="created_at" {...sp} />
            <SortHeader label="Instagram" sortKey="instagram_handle" {...sp} />
            <SortHeader label="Agente" sortKey="agent_name" {...sp} />
            <SortHeader label="Teléfono" sortKey="phone" {...sp} />
            <SortHeader label="Monetización" sortKey="estimated_monetization" {...sp} />
            <SortHeader label="% Comisión" sortKey="agency_commission" {...sp} />
            <TableHead className={stickyBase}>Extras</TableHead>
            <TableHead className={stickyBase}>Plataforma</TableHead>
              <TableHead className={stickyBase}>Revenue</TableHead>
              <TableHead className={stickyBase}>OF URL</TableHead>
              <TableHead className={stickyBase}>Notas</TableHead>
              <TableHead className={`w-10 ${stickyBase}`}></TableHead>
              <TableHead className={stickyAction}>Acciones</TableHead>
          </TableRow>
        );
      case "completadas":
        return (
          <TableRow>
            <TableHead className={`w-10 ${stickyBase}`}>#</TableHead>
            <SortHeader label="Creación" sortKey="created_at" {...sp} />
            <SortHeader label="Instagram" sortKey="instagram_handle" {...sp} />
            <SortHeader label="Categoría" sortKey="category" {...sp} />
            <SortHeader label="Agente" sortKey="agent_name" {...sp} />
            <SortHeader label="Monetización" sortKey="estimated_monetization" {...sp} />
            <SortHeader label="% Comisión" sortKey="agency_commission" {...sp} />
            <TableHead className={stickyBase}>Plataformas</TableHead>
            <TableHead className={stickyBase}>Rev. Plat.</TableHead>
            <TableHead className={stickyBase}>OF URL</TableHead>
            <TableHead className={stickyBase}>Notas</TableHead>
            <TableHead className={stickyAction}>Acciones</TableHead>
          </TableRow>
        );
      case "no_interesadas":
        return (
          <TableRow>
            <TableHead className={`w-10 ${stickyBase}`}>#</TableHead>
            <SortHeader label="Creación" sortKey="created_at" {...sp} />
            <SortHeader label="Instagram" sortKey="instagram_handle" {...sp} />
            <SortHeader label="Closer" sortKey="agent_name" {...sp} />
            <SortHeader label="Último contacto" sortKey="last_contact_date" {...sp} />
            <TableHead className={stickyBase}>OF URL</TableHead>
            <TableHead className={stickyBase}>Motivo rechazo</TableHead>
            <TableHead className={stickyBase}>Notas</TableHead>
          </TableRow>
        );
      case "nuevo":
        return (
          <TableRow>
            <TableHead className={`w-10 ${stickyBase}`}>#</TableHead>
            <SortHeader label="Creación" sortKey="created_at" {...sp} />
            <SortHeader label="Instagram" sortKey="instagram_handle" {...sp} />
            <SortHeader label="Creado por" sortKey="agent_name" {...sp} />
            <SortHeader label="Cuenta origen" sortKey="source_account" {...sp} />
            <SortHeader label="Categoría" sortKey="category" {...sp} />
            <SortHeader label="Estado" sortKey="stage" {...sp} />
            <SortHeader label="Teléfono" sortKey="phone" {...sp} />
            <TableHead className={stickyBase}>OF URL</TableHead>
            <TableHead className={stickyBase}>Notas</TableHead>
            <TableHead className={stickyAction}>Acciones</TableHead>
          </TableRow>
        );
      default: // todas
        return (
          <TableRow>
            <TableHead className={`w-10 ${stickyBase}`}>#</TableHead>
            <SortHeader label="Creación" sortKey="created_at" {...sp} />
            <SortHeader label="Instagram" sortKey="instagram_handle" {...sp} />
            <SortHeader label="Estado" sortKey="stage" {...sp} />
            <SortHeader label="Cuenta origen" sortKey="source_account" {...sp} />
            <SortHeader label="Categoría" sortKey="category" {...sp} />
            <SortHeader label="Agente" sortKey="agent_name" {...sp} />
            <SortHeader label="# Contactos" sortKey="contact_count" {...sp} />
            <SortHeader label="Teléfono" sortKey="phone" {...sp} />
            <TableHead className={stickyBase}>OF URL</TableHead>
            <TableHead className={stickyBase}>Notas</TableHead>
            <TableHead className={stickyAction}>Acciones</TableHead>
          </TableRow>
        );
    }
  };

  const renderRow = (c: CloserCreatorRow, idx: number) => {
    const revenue = (Number(c.estimated_monetization || 0) * Number(c.agency_commission || 0) / 100) + Number(c.extras || 0);
    // Estado de alertas: rojo (vencido) o naranja (decisión pendiente).
    // Calculado en el cliente para no esperar el cron — el cron sólo se
    // encarga de la notificación en la campanita, el badge visual es
    // instantáneo.
    const contactOverdue = isContactOverdue(c.passed_date, c.contact_count);
    const decisionPending = needsContactDecision(c.stage, c.contact_count);
    const isLastAttempt = c.contact_count >= 6;
    const nextDate = getNextContactDate(c.passed_date, c.contact_count);
    const isCloser = isCloserRow(c);

    const igLink = (
      <a href={`https://instagram.com/${c.instagram_handle.replace("@", "")}`} target="_blank" rel="noopener noreferrer"
        className="text-primary hover:underline flex items-center gap-1 font-medium">
        {c.instagram_handle.startsWith("@") ? c.instagram_handle : `@${c.instagram_handle}`}
        <ExternalLink className="h-3 w-3" />
      </a>
    );

    switch (activeTab) {
      case "asignadas":
        return (
          <TableRow key={c.id}>
            <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy hh:mm a") : "—"}</TableCell>
            <TableCell>{igLink}</TableCell>
            <TableCell>
              <InlineSourceSelect value={c.source_account} onSave={(v) => onFieldChange(c.id, "source_account", v)} options={LEADGEN_COMPANIES} />
            </TableCell>
            <TableCell>
              <InlineCategorySelect value={c.category} onSave={(v) => onFieldChange(c.id, "category", v)} />
            </TableCell>
            <TableCell className="text-sm">{c.passed_date ? format(new Date(c.passed_date), "dd/MM/yyyy hh:mm a") : "—"}</TableCell>
            <TableCell className="text-sm">{c.agent_name || "Sin asignar"}</TableCell>
            <TableCell>
              <ContactCountCell creatorId={c.id} count={c.contact_count} />
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {c.last_contact_date ? format(new Date(c.last_contact_date), "dd/MM/yyyy hh:mm a") : "—"}
              {nextDate && (
                <p className="text-[10px] text-muted-foreground/70">
                  Próximo: {format(nextDate, "dd/MM")}
                </p>
              )}
            </TableCell>
            <TableCell><LeadWhatsappButton leadId={c.id} source={c._source} resolvedPhone={c.resolved_whatsapp_phone} /></TableCell>
            <TableCell className="text-sm">
              {c.onlyfans_url ? (
                <a href={c.onlyfans_url} target="_blank" rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 truncate max-w-[120px]">
                  <ExternalLink className="h-3 w-3 shrink-0" /> OF
                </a>
              ) : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
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
            <TableCell>
              <InlineText value={c.notes} onSave={(v) => onFieldChange(c.id, "notes", v)} />
            </TableCell>
            <TableCell className="text-right sticky right-0 bg-background z-20">
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
                        <DropdownMenuItem onClick={() => onStageChange(c.id, "No interesada")}>
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
              <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy hh:mm a") : "—"}</TableCell>
              <TableCell>{igLink}</TableCell>
              <TableCell className="text-sm">{c.agent_name || "—"}</TableCell>
              <TableCell><LeadWhatsappButton leadId={c.id} source={c._source} resolvedPhone={c.resolved_whatsapp_phone} /></TableCell>
              <TableCell>
                <InlineNumber value={c.estimated_monetization} prefix="$" onSave={(v) => onFieldChange(c.id, "estimated_monetization", v)} disabled={!canEditComisiones} />
              </TableCell>
              <TableCell>
                <InlineNumber value={c.agency_commission} suffix="%" onSave={(v) => onFieldChange(c.id, "agency_commission", v)} disabled={!canEditComisiones} />
              </TableCell>
              <TableCell>
                <InlineNumber value={c.extras} prefix="$" onSave={(v) => onFieldChange(c.id, "extras", v)} disabled={!canEditComisiones} />
              </TableCell>
              <TableCell>
                <Select value={c.main_platform || ""} onValueChange={(v) => onFieldChange(c.id, "main_platform", v)}>
                  <SelectTrigger className="h-7 w-28 text-xs">
                    <SelectValue placeholder="Plataforma" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="font-semibold text-sm">${revenue.toLocaleString()}</TableCell>
              <TableCell className="text-sm">
                {c.onlyfans_url ? (
                  <a href={c.onlyfans_url} target="_blank" rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 truncate max-w-[120px]">
                    <ExternalLink className="h-3 w-3 shrink-0" /> OF
                  </a>
                ) : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell>
                <InlineText value={c.notes} onSave={(v) => onFieldChange(c.id, "notes", v)} />
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                  <ChevronDown className={`h-4 w-4 transition-transform ${expandedId === c.id ? "rotate-180" : ""}`} />
                </Button>
              </TableCell>
              <TableCell className="text-right sticky right-0 bg-background z-20">
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
                <TableCell colSpan={13} className="bg-muted/30 p-4">
                  <PlatformSalesPanel creatorId={c.id} />
                </TableCell>
              </TableRow>
            )}
          </>
        );

      case "completadas":
        return (
          <TableRow key={c.id}>
            <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy hh:mm a") : "—"}</TableCell>
            <TableCell>{igLink}</TableCell>
            <TableCell>
              <InlineCategorySelect value={c.category} onSave={(v) => onFieldChange(c.id, "category", v)} />
            </TableCell>
            <TableCell className="text-sm">{c.agent_name || "—"}</TableCell>
            <TableCell><InlineNumber value={c.estimated_monetization} prefix="$" onSave={(v) => onFieldChange(c.id, "estimated_monetization", v)} disabled={!canEditComisiones} /></TableCell>
            <TableCell><InlineNumber value={c.agency_commission} suffix="%" onSave={(v) => onFieldChange(c.id, "agency_commission", v)} disabled={!canEditComisiones} /></TableCell>
            <TableCell
              className="cursor-pointer hover:bg-muted/50 rounded"
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
            <TableCell className="text-sm font-medium">
              ${(platformSalesByCreator?.[c.id] || []).reduce((s, x) => s + x.price, 0).toLocaleString()}
            </TableCell>
            <TableCell className="text-sm">
              {c.onlyfans_url ? (
                <a href={c.onlyfans_url} target="_blank" rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 truncate max-w-[120px]">
                  <ExternalLink className="h-3 w-3 shrink-0" /> OF
                </a>
              ) : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell>
              <InlineText value={c.notes} onSave={(v) => onFieldChange(c.id, "notes", v)} />
            </TableCell>
            <TableCell className="text-right sticky right-0 bg-background z-20">
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
            <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy hh:mm a") : "—"}</TableCell>
            <TableCell>{igLink}</TableCell>
            <TableCell className="text-sm">{c.agent_name || "—"}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {c.last_contact_date ? format(new Date(c.last_contact_date), "dd/MM/yyyy hh:mm a") : "—"}
            </TableCell>
            <TableCell className="text-sm">
              {c.onlyfans_url ? (
                <a href={c.onlyfans_url} target="_blank" rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 truncate max-w-[120px]">
                  <ExternalLink className="h-3 w-3 shrink-0" /> OF
                </a>
              ) : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell>
              <InlineText value={c.rejection_reason} onSave={(v) => onFieldChange(c.id, "rejection_reason", v)} placeholder="Sin motivo" />
            </TableCell>
            <TableCell>
              <InlineText value={c.notes} onSave={(v) => onFieldChange(c.id, "notes", v)} />
            </TableCell>
          </TableRow>
        );

      case "nuevo":
        return (
          <TableRow key={c.id}>
            <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy hh:mm a") : "—"}</TableCell>
            <TableCell>{igLink}</TableCell>
            <TableCell className="text-sm">{c.agent_name || "—"}</TableCell>
            <TableCell>
              <InlineSourceSelect value={c.source_account} onSave={(v) => onFieldChange(c.id, "source_account", v)} options={LEADGEN_COMPANIES} />
            </TableCell>
            <TableCell>
              <InlineCategorySelect value={c.category} onSave={(v) => onFieldChange(c.id, "category", v)} />
            </TableCell>
            <TableCell>
              <InlineStageSelect value={c.stage} onSave={(v) => onStageChange(c.id, v)} disabled={!canEditStatus} />
            </TableCell>
            <TableCell><LeadWhatsappButton leadId={c.id} source={c._source} resolvedPhone={c.resolved_whatsapp_phone} /></TableCell>
            <TableCell className="text-sm">
              {c.onlyfans_url ? (
                <a href={c.onlyfans_url} target="_blank" rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 truncate max-w-[120px]">
                  <ExternalLink className="h-3 w-3 shrink-0" /> OF
                </a>
              ) : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell>
              <InlineText value={c.notes} onSave={(v) => onFieldChange(c.id, "notes", v)} />
            </TableCell>
            <TableCell className="text-right sticky right-0 bg-background z-20">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(isAdmin || canAssign) && (
                    <DropdownMenuItem onClick={() => onAssign(c.id, c.assigned_to)}>
                      <UserPlus className="h-4 w-4 mr-2" /> Asignar a Closer
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => onStageChange(c.id, "Asignada")}>
                    Mover a Asignada
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        );


      default: // todas
        return (
          <TableRow key={c.id}>
            <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{c.created_at ? format(new Date(c.created_at), "dd/MM/yyyy hh:mm a") : "—"}</TableCell>
            <TableCell>{igLink}</TableCell>
            <TableCell>
              <InlineStageSelect value={c.stage} onSave={(v) => onStageChange(c.id, v, c._source)} disabled={!canEditStatus} />
            </TableCell>
            <TableCell>
              <InlineSourceSelect value={c.source_account} onSave={(v) => onFieldChange(c.id, "source_account", v)} options={LEADGEN_COMPANIES} />
            </TableCell>
            <TableCell>
              <InlineCategorySelect value={c.category} onSave={(v) => onFieldChange(c.id, "category", v)} />
            </TableCell>
            <TableCell className="text-sm">{c.agent_name || "Sin asignar"}</TableCell>
            <TableCell>
              <ContactCountCell creatorId={c.id} count={c.contact_count} />
            </TableCell>
            <TableCell><LeadWhatsappButton leadId={c.id} source={c._source} resolvedPhone={c.resolved_whatsapp_phone} /></TableCell>
            <TableCell className="text-sm">
              {c.onlyfans_url ? (
                <a href={c.onlyfans_url} target="_blank" rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 truncate max-w-[120px]">
                  <ExternalLink className="h-3 w-3 shrink-0" /> OF
                </a>
              ) : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell>
              <InlineText value={c.notes} onSave={(v) => onFieldChange(c.id, "notes", v)} />
            </TableCell>
            <TableCell className="text-right sticky right-0 bg-background z-20">
              <div className="flex items-center justify-end gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {CLOSER_STAGES.filter((s) => s !== c.stage && s !== "Asignada").map((s) => (
                      <DropdownMenuItem key={s} onClick={() => onStageChange(c.id, s, c._source)}>
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
      <Table containerClassName="overflow-visible" className="min-w-[1000px]">
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
    </>
  );
};

export default CloserTable;
