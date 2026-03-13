import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, ArrowRight, XCircle, ExternalLink, MessageSquare } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CloserLead, STATUS_LABELS } from "../hooks/useCloserLeads";

interface Props {
  leads: CloserLead[];
  onStatusChange: (id: string, status: string) => void;
  onEditNotes?: (lead: CloserLead) => void;
}

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

const LeadTable = ({ leads, onStatusChange, onEditNotes }: Props) => {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Instagram</TableHead>
            <TableHead>Categoría</TableHead>
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
              <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                Sin registros
              </TableCell>
            </TableRow>
          ) : (
            leads.map((lead, idx) => (
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
                  <Badge className={qualityColor(lead.quality)}>{lead.quality || "—"}</Badge>
                </TableCell>
                <TableCell className="text-sm">{lead.entry_date}</TableCell>
                <TableCell className="text-sm">{lead.company || "—"}</TableCell>
                <TableCell>
                  <Badge className={statusColor(lead.status)}>
                    {STATUS_LABELS[lead.status || "no_response"] || lead.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{lead.phone_raw || "—"}</TableCell>
                <TableCell className="text-sm max-w-[200px] truncate">{lead.notes || "—"}</TableCell>
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
                      {NEXT_STATUS[lead.status || "no_response"] && (
                        <DropdownMenuItem onClick={() => onStatusChange(lead.id, NEXT_STATUS[lead.status || "no_response"]!)}>
                          <ArrowRight className="h-4 w-4 mr-2" />
                          Avanzar a {STATUS_LABELS[NEXT_STATUS[lead.status || "no_response"]!]}
                        </DropdownMenuItem>
                      )}
                      {lead.status !== "not_interested" && (
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
                          {ALL_STATUSES.filter((s) => s !== lead.status).map((s) => (
                            <DropdownMenuItem key={s} onClick={() => onStatusChange(lead.id, s)}>
                              {STATUS_LABELS[s]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      {onEditNotes && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onEditNotes(lead)}>
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Editar notas
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default LeadTable;
