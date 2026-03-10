import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Edit, Trash2, AlertCircle } from "lucide-react";
import { CloserCreator } from "../useCloserCreators";
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
  showActions?: boolean;
}

const stageBadgeColor = (stage: string) => {
  switch (stage) {
    case "Asignada": return "bg-muted text-muted-foreground";
    case "En negociación": return "bg-primary/10 text-primary";
    case "Formulario enviado": return "bg-accent/10 text-accent-foreground";
    case "Acuerdo enviado": return "bg-accent/20 text-accent-foreground";
    case "Confirmada": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "Completada": return "bg-green-200 text-green-900 dark:bg-green-900/50 dark:text-green-300";
    case "No interesada": return "bg-destructive/10 text-destructive";
    default: return "";
  }
};

const needsReminder = (lastContact: string | null) => {
  if (!lastContact) return true;
  return differenceInDays(new Date(), new Date(lastContact)) >= 3;
};

const defaultRender = (creator: CloserCreator, key: string): React.ReactNode => {
  const val = (creator as Record<string, unknown>)[key];
  if (key === "stage") return <Badge className={stageBadgeColor(String(val))}>{String(val)}</Badge>;
  if (key === "estimated_monetization" || key === "monthly_monetization")
    return `$${Number(val || 0).toLocaleString()}`;
  if (key === "agency_commission") return `${Number(val || 0)}%`;
  if (key === "estimated_revenue")
    return `$${(Number(creator.estimated_monetization || 0) * Number(creator.agency_commission || 0) / 100).toLocaleString()}`;
  if (val === null || val === undefined) return <span className="text-muted-foreground">—</span>;
  return String(val);
};

const CreatorTable = ({ creators, columns, onView, onEdit, onDelete, showActions = true }: Props) => {
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
