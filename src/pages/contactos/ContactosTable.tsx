import { useState } from "react";
import { ArrowUpDown, ExternalLink, MessageCircle, MoreHorizontal, ChevronDown, Eye, Pencil, Sparkles } from "lucide-react";
import InstagramIcon from "@/components/icons/InstagramIcon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Contacto } from "./ContactosContent";

const statusVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "destructive-soft" | "secondary-soft"> = {
  Nuevo: "primary-soft",
  Contactado: "warning-soft",
  Convertido: "success-soft",
  Descartado: "destructive-soft",
};

const categoryVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "secondary-soft" | "destructive-soft"> = {
  "A+": "success-soft",
  A: "primary-soft",
  "B+": "warning-soft",
  B: "secondary-soft",
  C: "destructive-soft",
};

type SortKey = "creacion" | "ticket" | "nombre" | "estado" | "instagram" | "pais" | "categoria" | "interacciones" | "creadoPor";

interface Props {
  contactos: Contacto[];
  onView?: (contacto: Contacto) => void;
  onEdit?: (contacto: Contacto) => void;
  onConvert?: (contacto: Contacto) => void;
}

const ContactosTable = ({ contactos, onView, onEdit, onConvert }: Props) => {
  const [sortKey, setSortKey] = useState<SortKey>("creacion");
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sorted = [...contactos].sort((a, b) => {
    let va = "";
    let vb = "";
    switch (sortKey) {
      case "creacion": va = a.creacion; vb = b.creacion; break;
      case "ticket": va = a.ticket; vb = b.ticket; break;
      case "nombre": va = a.nombre; vb = b.nombre; break;
      case "estado": va = a.estado; vb = b.estado; break;
      case "instagram": va = a.instagram; vb = b.instagram; break;
      case "pais": va = a.pais; vb = b.pais; break;
      case "categoria": va = a.categoria; vb = b.categoria; break;
      case "interacciones": va = String(a.interacciones); vb = String(b.interacciones); break;
      case "creadoPor": va = a.creadoPor; vb = b.creadoPor; break;
    }
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort(col)}>
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  return (
    <div className="max-h-[calc(100vh-24rem)] overflow-auto rounded-lg border border-border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead><SortHeader label="Creación" col="creacion" /></TableHead>
            <TableHead><SortHeader label="Ticket" col="ticket" /></TableHead>
            <TableHead><SortHeader label="Nombre" col="nombre" /></TableHead>
            <TableHead><SortHeader label="Estado" col="estado" /></TableHead>
            <TableHead><SortHeader label="Instagram" col="instagram" /></TableHead>
            <TableHead><SortHeader label="País" col="pais" /></TableHead>
            <TableHead><SortHeader label="Categoría" col="categoria" /></TableHead>
            <TableHead>WhatsApp</TableHead>
            <TableHead><SortHeader label="Inter." col="interacciones" /></TableHead>
            <TableHead><SortHeader label="Creado por" col="creadoPor" /></TableHead>
            <TableHead className="sticky right-0 bg-card z-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{c.creacion}</TableCell>
              <TableCell className="text-sm font-mono text-muted-foreground">{c.ticket}</TableCell>
              <TableCell className="text-sm font-medium">{c.nombre}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Badge variant={statusVariant[c.estado] ?? "secondary-soft"}>
                    {c.estado}
                  </Badge>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </div>
              </TableCell>
              <TableCell>
                <a
                  href={`https://instagram.com/${c.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  <InstagramIcon className="h-4 w-4" />
                  <span>{c.instagram}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </TableCell>
              <TableCell className="text-sm">{c.pais}</TableCell>
              <TableCell>
                <Badge variant={categoryVariant[c.categoria] ?? "secondary-soft"} className="font-normal">
                  {c.categoria}
                </Badge>
              </TableCell>
              <TableCell>
                <a
                  href={`https://wa.me/${c.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Chat
                </a>
              </TableCell>
              <TableCell className="text-center text-sm">{c.interacciones}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{c.creadoPor}</TableCell>
              <TableCell className="sticky right-0 bg-card">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                     <DropdownMenuItem onClick={() => onView?.(c)}>
                       <Eye className="mr-2 h-4 w-4" /> Ver detalle
                     </DropdownMenuItem>
                     <DropdownMenuItem onClick={() => onEdit?.(c)}>
                       <Pencil className="mr-2 h-4 w-4" /> Editar
                     </DropdownMenuItem>
                     <DropdownMenuItem onClick={() => onConvert?.(c)}>
                       <Sparkles className="mr-2 h-4 w-4" /> Convertir a Creador
                     </DropdownMenuItem>
                   </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
                No se encontraron contactos.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default ContactosTable;
