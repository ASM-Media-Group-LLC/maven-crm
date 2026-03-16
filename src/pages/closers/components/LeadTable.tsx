import { useState, memo } from "react";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MoreHorizontal, ExternalLink, Phone, AlertTriangle, Clock, ChevronDown, UserPlus, ChevronRight } from "lucide-react";
import { CloserCreatorRow, CLOSER_STAGES, PLATFORMS, isFollowUpPending, getNextContactDate } from "../hooks/useCloserLeads";
import ContactQuickForm from "./ContactQuickForm";
import PlatformSalesPanel from "./PlatformSalesPanel";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Props {
  creators: CloserCreatorRow[];
  activeTab: string;
  onStageChange: (id: string, stage: string) => void;
  onFieldChange: (id: string, field: string, value: any) => void;
  onAssign: (id: string, currentAssignee: string | null) => void;
  isAdmin: boolean;
}

const stageColor = (s: string) => {
  switch (s) {
    case "Asignada": return "bg-primary/10 text-primary";
    case "Confirmada": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "Completada": return "bg-green-200 text-green-900 dark:bg-green-900/50 dark:text-green-300";
    case "No interesada": return "bg-destructive/10 text-destructive";
    default: return "bg-muted text-muted-foreground";
  }
};

const cleanPhoneForWhatsApp = (phone: string) => phone.replace(/[^\d+]/g, "").replace(/^\+/, "");

// Inline editable number cell
const InlineNumber = memo(({ value, onSave, prefix = "", suffix = "" }: { value: number | null; onSave: (v: number) => void; prefix?: string; suffix?: string }) => {
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
        className="cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 text-sm font-medium"
        onClick={() => { setText(String(value || 0)); setEditing(true); }}
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

// Inline text cell
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

const CloserTable = ({ creators, activeTab, onStageChange, onFieldChange, onAssign, isAdmin }: Props) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Compute revenue for completadas footer
  const completadasTotals = activeTab === "completadas" ? creators.reduce(
    (acc, c) => {
      const rev = (Number(c.estimated_monetization || 0) * Number(c.agency_commission || 0) / 100) + Number(c.extras || 0);
      return {
        monetization: acc.monetization + Number(c.estimated_monetization || 0),
        revenue: acc.revenue + rev,
        count: acc.count + 1,
      };
    },
    { monetization: 0, revenue: 0, count: 0 }
  ) : null;

  const renderHeaders = () => {
    switch (activeTab) {
      case "asignadas":
        return (
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Instagram</TableHead>
            <TableHead>Fecha asignación</TableHead>
            <TableHead>Agente</TableHead>
            <TableHead># Contactos</TableHead>
            <TableHead>Último contacto</TableHead>
            <TableHead>Alertas</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        );
      case "confirmadas":
        return (
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Instagram</TableHead>
            <TableHead>Agente</TableHead>
            <TableHead>Monetización</TableHead>
            <TableHead>% Comisión</TableHead>
            <TableHead>Extras</TableHead>
            <TableHead>Plataforma</TableHead>
            <TableHead>Revenue</TableHead>
            <TableHead className="w-10"></TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        );
      case "completadas":
        return (
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Instagram</TableHead>
            <TableHead>Agente</TableHead>
            <TableHead>Monetización</TableHead>
            <TableHead>% Comisión</TableHead>
            <TableHead>Extras</TableHead>
            <TableHead>Revenue</TableHead>
          </TableRow>
        );
      case "no_interesadas":
        return (
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Instagram</TableHead>
            <TableHead>Closer</TableHead>
            <TableHead>Último contacto</TableHead>
            <TableHead>Motivo rechazo</TableHead>
            <TableHead>Notas</TableHead>
          </TableRow>
        );
      default: // todas
        return (
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Instagram</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Agente</TableHead>
            <TableHead>Fecha asignación</TableHead>
            <TableHead># Contactos</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Notas</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        );
    }
  };

  const renderRow = (c: CloserCreatorRow, idx: number) => {
    const revenue = (Number(c.estimated_monetization || 0) * Number(c.agency_commission || 0) / 100) + Number(c.extras || 0);
    const followUpPending = c.stage === "Asignada" && isFollowUpPending(c.last_contact_date);
    const isLastAttempt = c.contact_count >= 6;
    const nextDate = getNextContactDate(c.passed_date, c.contact_count);

    const igLink = (
      <a href={`https://instagram.com/${c.instagram_handle}`} target="_blank" rel="noopener noreferrer"
        className="text-primary hover:underline flex items-center gap-1 font-medium">
        @{c.instagram_handle}
        <ExternalLink className="h-3 w-3" />
      </a>
    );

    switch (activeTab) {
      case "asignadas":
        return (
          <TableRow key={c.id}>
            <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
            <TableCell>{igLink}</TableCell>
            <TableCell className="text-sm">{c.passed_date ? format(new Date(c.passed_date), "dd/MM/yyyy") : "—"}</TableCell>
            <TableCell className="text-sm">{c.agent_name || "Sin asignar"}</TableCell>
            <TableCell>
              <Badge variant="outline">{c.contact_count}/6</Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {c.last_contact_date ? format(new Date(c.last_contact_date), "dd/MM/yyyy") : "—"}
              {nextDate && (
                <p className="text-[10px] text-muted-foreground/70">
                  Próximo: {format(nextDate, "dd/MM")}
                </p>
              )}
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                {followUpPending && (
                  <Badge variant="destructive" className="text-[10px] h-5 gap-0.5">
                    <AlertTriangle className="h-3 w-3" /> Follow-up
                  </Badge>
                )}
                {isLastAttempt && (
                  <Badge className="text-[10px] h-5 bg-warning/20 text-warning gap-0.5">
                    <Clock className="h-3 w-3" /> Último intento
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <ContactQuickForm creatorId={c.id} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onStageChange(c.id, "Confirmada")}>
                      Mover a Confirmada
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onStageChange(c.id, "No interesada")}>
                      Marcar No interesada
                    </DropdownMenuItem>
                    {isAdmin && (
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
              <TableCell>{igLink}</TableCell>
              <TableCell className="text-sm">{c.agent_name || "—"}</TableCell>
              <TableCell>
                <InlineNumber value={c.estimated_monetization} prefix="$" onSave={(v) => onFieldChange(c.id, "estimated_monetization", v)} />
              </TableCell>
              <TableCell>
                <InlineNumber value={c.agency_commission} suffix="%" onSave={(v) => onFieldChange(c.id, "agency_commission", v)} />
              </TableCell>
              <TableCell>
                <InlineNumber value={c.extras} prefix="$" onSave={(v) => onFieldChange(c.id, "extras", v)} />
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
              <TableCell>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                  <ChevronDown className={`h-4 w-4 transition-transform ${expandedId === c.id ? "rotate-180" : ""}`} />
                </Button>
              </TableCell>
              <TableCell className="text-right">
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
                <TableCell colSpan={10} className="bg-muted/30 p-4">
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
            <TableCell>{igLink}</TableCell>
            <TableCell className="text-sm">{c.agent_name || "—"}</TableCell>
            <TableCell className="text-sm">${Number(c.estimated_monetization || 0).toLocaleString()}</TableCell>
            <TableCell className="text-sm">{Number(c.agency_commission || 0)}%</TableCell>
            <TableCell className="text-sm">${Number(c.extras || 0).toLocaleString()}</TableCell>
            <TableCell className="font-semibold text-sm">${revenue.toLocaleString()}</TableCell>
          </TableRow>
        );

      case "no_interesadas":
        return (
          <TableRow key={c.id}>
            <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
            <TableCell>{igLink}</TableCell>
            <TableCell className="text-sm">{c.agent_name || "—"}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {c.last_contact_date ? format(new Date(c.last_contact_date), "dd/MM/yyyy") : "—"}
            </TableCell>
            <TableCell>
              <InlineText value={c.rejection_reason} onSave={(v) => onFieldChange(c.id, "rejection_reason", v)} placeholder="Sin motivo" />
            </TableCell>
            <TableCell>
              <InlineText value={c.notes} onSave={(v) => onFieldChange(c.id, "notes", v)} />
            </TableCell>
          </TableRow>
        );

      default: // todas
        return (
          <TableRow key={c.id}>
            <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
            <TableCell>{igLink}</TableCell>
            <TableCell>
              <Badge className={stageColor(c.stage)}>{c.stage}</Badge>
            </TableCell>
            <TableCell className="text-sm">{c.agent_name || "Sin asignar"}</TableCell>
            <TableCell className="text-sm">{c.passed_date ? format(new Date(c.passed_date), "dd/MM/yyyy") : "—"}</TableCell>
            <TableCell>
              <Badge variant="outline">{c.contact_count}/6</Badge>
            </TableCell>
            <TableCell className="text-sm">
              {c.phone ? (
                <a href={`https://wa.me/${cleanPhoneForWhatsApp(c.phone)}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline">
                  <Phone className="h-3 w-3" />
                  <span className="truncate max-w-[100px]">{c.phone}</span>
                </a>
              ) : <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell>
              <InlineText value={c.notes} onSave={(v) => onFieldChange(c.id, "notes", v)} />
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                <ContactQuickForm creatorId={c.id} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {CLOSER_STAGES.filter((s) => s !== c.stage).map((s) => (
                      <DropdownMenuItem key={s} onClick={() => onStageChange(c.id, s)}>
                        Mover a {s}
                      </DropdownMenuItem>
                    ))}
                    {isAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onAssign(c.id, c.assigned_to)}>
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
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          {renderHeaders()}
        </TableHeader>
        <TableBody>
          {creators.length === 0 ? (
            <TableRow>
              <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                Sin registros
              </TableCell>
            </TableRow>
          ) : (
            creators.map((c, idx) => renderRow(c, idx))
          )}
        </TableBody>
      </Table>

      {/* Footer totals for completadas */}
      {completadasTotals && completadasTotals.count > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30 text-sm">
          <span className="font-medium">{completadasTotals.count} modelos cerradas</span>
          <div className="flex gap-6">
            <span>Monetización: <strong>${completadasTotals.monetization.toLocaleString()}</strong></span>
            <span>Revenue: <strong className="text-primary">${completadasTotals.revenue.toLocaleString()}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CloserTable;
