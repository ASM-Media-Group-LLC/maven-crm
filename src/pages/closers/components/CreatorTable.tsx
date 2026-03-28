import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Edit, Trash2, AlertCircle, MoreHorizontal, ArrowRight, Phone, XCircle } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CloserCreator, STAGES } from "../useCloserCreators";
import { differenceInDays } from "date-fns";

interface Column {
  key: string;
  label: string;
  render?: (creator: CloserCreator) => React.ReactNode;
}

interface Props {
  creators: CloserCreator[];
  columns: Column[];
  onView?: (c: CloserCreator) => void;
  onEdit?: (c: CloserCreator) => void;
  onDelete?: (c: CloserCreator) => void;
  onStageChange?: (id: string, stage: string) => void;
  showActions?: boolean;
}

const stageVariant = (stage: string): "primary-soft" | "secondary-soft" | "success-soft" | "success" | "destructive-soft" | "warning-soft" => {
  switch (stage) {
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

const NEXT_STAGE: Record<string, string | null> = {
  "Asignada": "En negociación",
  "En negociación": "Formulario enviado",
  "Formulario enviado": "Acuerdo enviado",
  "Acuerdo enviado": "Confirmada",
  "Confirmada": "Completada",
  "Completada": null,
  "No interesada": null,
};

const needsReminder = (lastContact: string | null) => {
  if (!lastContact) return true;
  return differenceInDays(new Date(), new Date(lastContact)) >= 3;
};

const defaultRender = (creator: CloserCreator, key: string): React.ReactNode => {
  const val = (creator as unknown as Record<string, unknown>)[key];
  if (key === "stage") return <Badge variant={stageVariant(String(val))}>{String(val)}</Badge>;
  if (key === "estimated_monetization" || key === "monthly_monetization")
    return `$${Number(val || 0).toLocaleString()}`;
  if (key === "agency_commission") return `${Number(val || 0)}%`;
  if (key === "estimated_revenue")
    return `$${(Number(creator.estimated_monetization || 0) * Number(creator.agency_commission || 0) / 100).toLocaleString()}`;
  if (val === null || val === undefined) return <span className="text-muted-foreground">—</span>;
  return String(val);
};

const CreatorTable = ({ creators, columns, onView, onEdit, onDelete, onStageChange, showActions = true }: Props) => {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key}>{col.label}</TableHead>
            ))}
            {showActions && <TableHead className="text-right">Acciones</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {creators.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + (showActions ? 1 : 0)} className="text-center text-muted-foreground py-8">
                Sin registros
              </TableCell>
            </TableRow>
          ) : (
            creators.map((c) => (
              <TableRow key={c.id}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    <div className="flex items-center gap-1.5">
                      {col.key === "instagram_handle" && needsReminder(c.last_contact_date) && !["Completada", "No interesada"].includes(c.stage) && (
                        <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      )}
                      {col.render ? col.render(c) : defaultRender(c, col.key)}
                    </div>
                  </TableCell>
                ))}
                {showActions && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {onView && <Button variant="ghost" size="icon" onClick={() => onView(c)}><Eye className="h-4 w-4" /></Button>}
                      {onEdit && <Button variant="ghost" size="icon" onClick={() => onEdit(c)}><Edit className="h-4 w-4" /></Button>}
                      {onDelete && <Button variant="ghost" size="icon" onClick={() => onDelete(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}

                      {onStageChange && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {NEXT_STAGE[c.stage] && (
                              <DropdownMenuItem onClick={() => onStageChange(c.id, NEXT_STAGE[c.stage]!)}>
                                <ArrowRight className="h-4 w-4 mr-2" />
                                Avanzar a {NEXT_STAGE[c.stage]}
                              </DropdownMenuItem>
                            )}
                            {c.stage !== "No interesada" && (
                              <DropdownMenuItem onClick={() => onStageChange(c.id, "No interesada")}>
                                <XCircle className="h-4 w-4 mr-2" />
                                Marcar No interesada
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <Phone className="h-4 w-4 mr-2" />
                                Cambiar etapa
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {STAGES.filter((s) => s !== c.stage).map((s) => (
                                  <DropdownMenuItem key={s} onClick={() => onStageChange(c.id, s)}>
                                    {s}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default CreatorTable;
