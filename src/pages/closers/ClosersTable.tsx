import { useState } from "react";
import { Deal } from "./useDeals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, ArrowUpDown } from "lucide-react";
import { format } from "date-fns";

interface ClosersTableProps {
  deals: Deal[];
}

const stageColors: Record<string, string> = {
  Nuevo: "bg-primary/10 text-primary",
  Contactado: "bg-accent/10 text-accent-foreground",
  "Llamada Agendada": "bg-[hsl(var(--chart-1))]/10 text-[hsl(var(--chart-1))]",
  "En Llamada": "bg-[hsl(var(--chart-2))]/10 text-[hsl(var(--chart-2))]",
  "No Show": "bg-destructive/10 text-destructive",
  Cerrado: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  Perdido: "bg-muted text-muted-foreground",
};

type SortKey = "prospect_handle" | "source" | "stage" | "created_at";
type SortDir = "asc" | "desc";

const ClosersTable = ({ deals }: ClosersTableProps) => {
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = [...deals].sort((a, b) => {
    const valA = a[sortKey] ?? "";
    const valB = b[sortKey] ?? "";
    const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => toggleSort(field)}>
      {label}
      <ArrowUpDown className="h-3 w-3 ml-1" />
    </Button>
  );

  return (
    <div className="rounded-lg border bg-card overflow-auto max-h-[calc(100vh-24rem)]">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead><SortHeader label="Handle" field="prospect_handle" /></TableHead>
            <TableHead><SortHeader label="Fuente" field="source" /></TableHead>
            <TableHead><SortHeader label="Etapa" field="stage" /></TableHead>
            <TableHead><SortHeader label="Fecha" field="created_at" /></TableHead>
            <TableHead className="sticky right-0 z-20 bg-card w-[60px]">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((deal) => (
            <TableRow key={deal.id}>
              <TableCell className="font-medium">{deal.prospect_handle}</TableCell>
              <TableCell>{deal.source}</TableCell>
              <TableCell>
                <Badge variant="secondary" className={stageColors[deal.stage] || ""}>
                  {deal.stage}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {deal.created_at ? format(new Date(deal.created_at), "dd/MM/yyyy") : "—"}
              </TableCell>
              <TableCell className="sticky right-0 bg-card">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Ver detalle</DropdownMenuItem>
                    <DropdownMenuItem>Editar</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">Eliminar</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No hay deals
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default ClosersTable;
