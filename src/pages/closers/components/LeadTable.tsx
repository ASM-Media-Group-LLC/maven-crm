import { useState, memo } from "react";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MoreHorizontal, ArrowRight, XCircle, ExternalLink, ChevronDown, Phone } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CloserLead, STATUS_LABELS } from "../hooks/useCloserLeads";

interface Props {
  leads: CloserLead[];
  onStatusChange: (id: string, status: string) => void;
  onFieldChange: (id: string, field: string, value: string | null) => void;
}

const QUALITIES = ["A+", "A", "B", "C"];

const qualityColor = (q: string) => {
  switch (q) {
    case "A+": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "A": return "bg-primary/10 text-primary";
    case "B": return "bg-accent/10 text-accent-foreground";
    case "C": return "bg-muted text-muted-foreground";
    default: return "";
  }
};

const statusColor = (s: string | null) => {
  switch (s) {
    case "no_response": return "bg-muted text-muted-foreground";
    case "contactado":
    case "replied": return "bg-primary/10 text-primary";
    case "interested": return "bg-accent/10 text-accent-foreground";
    case "meeting_set": return "bg-accent/20 text-accent-foreground";
    case "confirmed": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "completed": return "bg-green-200 text-green-900 dark:bg-green-900/50 dark:text-green-300";
    case "not_interested": return "bg-destructive/10 text-destructive";
    default: return "";
  }
};

const NEXT_STATUS: Record<string, string | null> = {
  no_response: "contactado",
  contactado: "interested",
  replied: "interested",
  interested: "meeting_set",
  meeting_set: "confirmed",
  confirmed: "completed",
  completed: null,
  not_interested: null,
};

const ALL_STATUSES = ["no_response", "contactado", "replied", "interested", "meeting_set", "confirmed", "completed", "not_interested"];

const cleanPhoneForWhatsApp = (phone: string) =>
  phone.replace(/[^\d]/g, "");

// Click-to-edit popover for quality
const QualityCell = memo(({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer hover:ring-1 hover:ring-border rounded-md px-0.5 py-0.5 transition-all flex items-center gap-0.5">
          <Badge className={qualityColor(value)}>{value || "—"}</Badge>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-1" align="start">
        <div className="flex flex-col gap-0.5">
          {QUALITIES.map((q) => (
            <button
              key={q}
              className={`px-3 py-1.5 text-sm rounded hover:bg-muted text-left ${q === value ? "bg-muted font-medium" : ""}`}
              onClick={() => { onChange(q); setOpen(false); }}
            >
              <Badge className={qualityColor(q)}>{q}</Badge>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
});
QualityCell.displayName = "QualityCell";

// Click-to-edit popover for status
const StatusCell = memo(({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer hover:ring-1 hover:ring-border rounded-md px-0.5 py-0.5 transition-all flex items-center gap-0.5">
          <Badge className={statusColor(value)}>
            {STATUS_LABELS[value] || value}
          </Badge>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-1" align="start">
        <div className="flex flex-col gap-0.5">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              className={`px-3 py-1.5 text-sm rounded hover:bg-muted text-left flex items-center gap-2 ${s === value ? "bg-muted font-medium" : ""}`}
              onClick={() => { onChange(s); setOpen(false); }}
            >
              <span className={`w-2 h-2 rounded-full ${statusColor(s).split(" ")[0]}`} />
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
});
StatusCell.displayName = "StatusCell";

// Click-to-edit popover for contacted
const ContactedCell = memo(({ isContacted, onToggle }: { isContacted: boolean; onToggle: (contacted: boolean) => void }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="cursor-pointer hover:ring-1 hover:ring-border rounded-md px-0.5 py-0.5 transition-all flex items-center gap-0.5">
          <Badge className={isContacted ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}>
            {isContacted ? "Sí" : "No"}
          </Badge>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-1" align="start">
        <div className="flex flex-col gap-0.5">
          <button
            className={`px-3 py-1.5 text-sm rounded hover:bg-muted text-left ${isContacted ? "bg-muted font-medium" : ""}`}
            onClick={() => { onToggle(true); setOpen(false); }}
          >
            Sí
          </button>
          <button
            className={`px-3 py-1.5 text-sm rounded hover:bg-muted text-left ${!isContacted ? "bg-muted font-medium" : ""}`}
            onClick={() => { onToggle(false); setOpen(false); }}
          >
            No
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
});
ContactedCell.displayName = "ContactedCell";

// Inline editable notes cell
const InlineNotes = memo(({ value, onSave }: { value: string | null; onSave: (v: string) => void }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || "");

  const save = () => {
    setEditing(false);
    if (text !== (value || "")) onSave(text);
  };

  if (!editing) {
    return (
      <span
        className="cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 block max-w-[200px] truncate text-sm"
        onClick={() => { setText(value || ""); setEditing(true); }}
        title={value || "Click para agregar notas"}
      >
        {value || "—"}
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
      className="h-7 text-sm w-48"
    />
  );
});
InlineNotes.displayName = "InlineNotes";

// Inline editable source/company cell
const InlineSourceCell = memo(({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value || "");

  const save = () => {
    setEditing(false);
    const newVal = text.trim();
    if (newVal !== (value || "")) onSave(newVal || null);
  };

  if (!editing) {
    return (
      <span
        className="cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 block max-w-[140px] truncate text-sm"
        onClick={() => { setText(value || ""); setEditing(true); }}
        title={value || "Click para editar"}
      >
        {value || "—"}
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
      className="h-7 text-sm w-36"
    />
  );
});
InlineSourceCell.displayName = "InlineSourceCell";

const LeadTable = ({ leads, onStatusChange, onFieldChange }: Props) => {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Instagram</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fecha de paso</TableHead>
            <TableHead>Cuenta origen</TableHead>
            <TableHead>Contactada?</TableHead>
            <TableHead>Número</TableHead>
            <TableHead>Notas</TableHead>
            <TableHead>Onlyfans</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.length === 0 ? (
            <TableRow>
              <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                Sin registros
              </TableCell>
            </TableRow>
          ) : (
            leads.map((lead, idx) => {
              const currentStatus = lead.status || "no_response";
              const isContacted = currentStatus !== "no_response";

              return (
                <TableRow key={lead.id}>
                  <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                  <TableCell className="font-medium">
                    <a
                      href={`https://instagram.com/${lead.model_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      @{lead.model_handle}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </TableCell>

                  <TableCell>
                    <QualityCell
                      value={lead.quality || ""}
                      onChange={(v) => onFieldChange(lead.id, "quality", v)}
                    />
                  </TableCell>

                  <TableCell>
                    <StatusCell
                      value={currentStatus}
                      onChange={(v) => onStatusChange(lead.id, v)}
                    />
                  </TableCell>

                  <TableCell className="text-sm">{lead.entry_date}</TableCell>

                  <TableCell>
                    <InlineSourceCell
                      value={lead.company}
                      onSave={(v) => onFieldChange(lead.id, "company", v)}
                    />
                  </TableCell>

                  <TableCell>
                    <ContactedCell
                      isContacted={isContacted}
                      onToggle={(contacted) => {
                        if (!contacted && currentStatus !== "no_response") {
                          onStatusChange(lead.id, "no_response");
                        } else if (contacted && currentStatus === "no_response") {
                          onStatusChange(lead.id, "contactado");
                        }
                      }}
                    />
                  </TableCell>

                  <TableCell className="text-sm">
                    {lead.phone_raw ? (
                      <a
                        href={`https://wa.me/${cleanPhoneForWhatsApp(lead.phone_e164 || lead.phone_raw)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        <span className="truncate max-w-[100px]">{lead.phone_raw}</span>
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <InlineNotes
                      value={lead.notes}
                      onSave={(v) => onFieldChange(lead.id, "notes", v)}
                    />
                  </TableCell>

                  <TableCell>
                    {lead.source_link ? (
                      <a
                        href={lead.source_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1 text-sm"
                      >
                        Link <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {NEXT_STATUS[currentStatus] && (
                          <DropdownMenuItem onClick={() => onStatusChange(lead.id, NEXT_STATUS[currentStatus]!)}>
                            <ArrowRight className="h-4 w-4 mr-2" />
                            Avanzar a {STATUS_LABELS[NEXT_STATUS[currentStatus]!]}
                          </DropdownMenuItem>
                        )}
                        {currentStatus !== "not_interested" && (
                          <DropdownMenuItem onClick={() => onStatusChange(lead.id, "not_interested")}>
                            <XCircle className="h-4 w-4 mr-2" />
                            Marcar No interesada
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <ArrowRight className="h-4 w-4 mr-2" />
                            Cambiar estado
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {ALL_STATUSES.filter((s) => s !== currentStatus).map((s) => (
                              <DropdownMenuItem key={s} onClick={() => onStatusChange(lead.id, s)}>
                                {STATUS_LABELS[s]}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default LeadTable;
