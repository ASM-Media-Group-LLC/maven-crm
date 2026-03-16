import { useState } from "react";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoreHorizontal, ArrowRight, XCircle, ExternalLink, Check, X } from "lucide-react";
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

const CONTACTED_OPTIONS = [
  { value: "contactado", label: "Sí" },
  { value: "no_response", label: "No" },
];

// Inline editable notes cell
const InlineNotes = ({ value, onSave }: { value: string | null; onSave: (v: string) => void }) => {
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
    <div className="flex items-center gap-1">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        onBlur={save}
        autoFocus
        className="h-7 text-sm w-48"
      />
    </div>
  );
};

const LeadTable = ({ leads, onStatusChange, onFieldChange }: Props) => {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
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

                  {/* Inline quality select */}
                  <TableCell>
                    <Select
                      value={lead.quality || ""}
                      onValueChange={(v) => onFieldChange(lead.id, "quality", v)}
                    >
                      <SelectTrigger className="h-7 w-16 border-0 bg-transparent p-0 shadow-none hover:bg-muted/50 focus:ring-0">
                        <Badge className={qualityColor(lead.quality)}>{lead.quality || "—"}</Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {QUALITIES.map((q) => (
                          <SelectItem key={q} value={q}>{q}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>

                  {/* Inline status select */}
                  <TableCell>
                    <Select
                      value={currentStatus}
                      onValueChange={(v) => onStatusChange(lead.id, v)}
                    >
                      <SelectTrigger className="h-7 w-auto min-w-[120px] border-0 bg-transparent p-0 shadow-none hover:bg-muted/50 focus:ring-0">
                        <Badge className={statusColor(currentStatus)}>
                          {STATUS_LABELS[currentStatus] || currentStatus}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            <span className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${statusColor(s).split(" ")[0]}`} />
                              {STATUS_LABELS[s]}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>

                  <TableCell className="text-sm">{lead.entry_date}</TableCell>
                  <TableCell className="text-sm">{lead.company || "—"}</TableCell>

                  {/* Inline contacted select */}
                  <TableCell>
                    <Select
                      value={isContacted ? "contactado" : "no_response"}
                      onValueChange={(v) => {
                        if (v === "no_response" && currentStatus !== "no_response") {
                          onStatusChange(lead.id, "no_response");
                        } else if (v === "contactado" && currentStatus === "no_response") {
                          onStatusChange(lead.id, "contactado");
                        }
                      }}
                    >
                      <SelectTrigger className="h-7 w-16 border-0 bg-transparent p-0 shadow-none hover:bg-muted/50 focus:ring-0">
                        <Badge className={isContacted ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}>
                          {isContacted ? "Sí" : "No"}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {CONTACTED_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>

                  <TableCell className="text-sm">{lead.phone_raw || "—"}</TableCell>

                  {/* Inline editable notes */}
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
