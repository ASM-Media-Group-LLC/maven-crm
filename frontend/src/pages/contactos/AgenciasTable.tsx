import { useState } from "react";
import { ArrowUpDown, ExternalLink, MoreHorizontal, Eye, Pencil, Trash2 } from "lucide-react";
import InstagramIcon from "@/components/icons/InstagramIcon";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Agencia, estadoAgenciaConfig } from "./agenciasUtils";

type SortKey = "nombre" | "estado" | "pais" | "contacto_nombre" | "instagram" | "created_at";

interface Props {
  agencias: Agencia[];
  onView?: (a: Agencia) => void;
  onEdit?: (a: Agencia) => void;
  onDelete?: (a: Agencia) => void;
}

const AgenciasTable = ({ agencias, onView, onEdit, onDelete }: Props) => {
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sorted = [...agencias].sort((a, b) => {
    const va = (a[sortKey] ?? "") as string;
    const vb = (b[sortKey] ?? "") as string;
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs" onClick={() => handleSort(col)}>
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  return (
    <div className="max-h-[calc(100vh-24rem)] overflow-auto rounded-lg border border-border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead><SortHeader label="Nombre" col="nombre" /></TableHead>
            <TableHead><SortHeader label="Estado" col="estado" /></TableHead>
            <TableHead><SortHeader label="País" col="pais" /></TableHead>
            <TableHead><SortHeader label="Contacto" col="contacto_nombre" /></TableHead>
            <TableHead><SortHeader label="Instagram" col="instagram" /></TableHead>
            <TableHead><TableHead><SortHeader label="Creación" col="created_at" /></TableHead></TableHead>
            <TableHead className="sticky right-0 bg-card z-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((a) => {
            const cfg = estadoAgenciaConfig[a.estado];
            return (
              <TableRow key={a.id}>
                <TableCell className="text-sm font-medium">{a.nombre}</TableCell>
                <TableCell>
                  <Badge variant={cfg?.variant ?? "outline"} className={cfg?.className}>
                    {a.estado}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{a.pais}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{a.contacto_nombre}</TableCell>
                <TableCell>
                  {a.instagram ? (
                    <a
                      href={`https://instagram.com/${a.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <InstagramIcon className="h-4 w-4" />
                      <span>{a.instagram}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {new Date(a.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                </TableCell>
                <TableCell className="sticky right-0 bg-card">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onView?.(a)}>
                        <Eye className="mr-2 h-4 w-4" /> Ver detalle
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit?.(a)}>
                        <Pencil className="mr-2 h-4 w-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDelete?.(a)} className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                No se encontraron agencias.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default AgenciasTable;
