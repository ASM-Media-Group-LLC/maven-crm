import { useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { ArrowUpDown, ExternalLink, MoreHorizontal, Eye, Pencil, Sparkles, Phone, Trash2, ShoppingCart } from "lucide-react";
import { getCountryFlag, getCountryShortDisplay, maskPhone } from "@/lib/country-utils";
import { WaChatButton } from "@/components/WaChatButton";
import { TgChatButton } from "@/components/TgChatButton";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Contacto } from "./ContactosContent";

const categoryVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "secondary-soft" | "destructive-soft"> = {
  "A+": "success-soft",
  A: "primary-soft",
  "B+": "warning-soft",
  B: "secondary-soft",
  C: "destructive-soft",
};

type SortKey = "creacion" | "registro" | "nombre" | "creadoPor" | "instagram" | "pais" | "ciudad" | "categoria";

interface Props {
  contactos: Contacto[];
  onView?: (contacto: Contacto) => void;
  onEdit?: (contacto: Contacto) => void;
  onConvert?: (contacto: Contacto) => void;
  onSellPlatform?: (contacto: Contacto) => void;
  onDelete?: (contacto: Contacto) => void;
}

const getAgentInitials = (name: string) => {
  const trimmed = name?.trim() || "";
  if (!trimmed) return "NA";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
};

const ContactosTable = ({ contactos, onView, onEdit, onConvert, onSellPlatform, onDelete }: Props) => {
  // Permisos: editar y eliminar contactos. Default heredado del padre
  // "Contactos" (sembrado en DB) → roles que tenían acceso al tab
  // siguen pudiendo editar/eliminar a menos que admin revoque.
  const { canAccess } = usePermissions();
  const canEditContacto = canAccess("Contactos", "Editar Contacto");
  const canDeleteContacto = canAccess("Contactos", "Eliminar Contacto");
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
    if (sortKey === "creacion") {
      const da = a.rawCreatedAt || "";
      const db = b.rawCreatedAt || "";
      return sortAsc ? da.localeCompare(db) : db.localeCompare(da);
    }
    let va = "";
    let vb = "";
    switch (sortKey) {
      case "registro": va = a.ticket; vb = b.ticket; break;
      case "nombre": va = a.nombre; vb = b.nombre; break;
      case "instagram": va = a.instagram; vb = b.instagram; break;
      case "pais": va = a.pais; vb = b.pais; break;
      case "ciudad": va = a.city; vb = b.city; break;
      case "categoria": va = a.categoria; vb = b.categoria; break;
      case "creadoPor": va = a.creadoPor; vb = b.creadoPor; break;
    }
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs" onClick={() => handleSort(col)}>
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  return (
    <TooltipProvider>
      <Table containerClassName="overflow-visible max-md:overflow-x-auto" className="min-w-[1100px]">
        <TableHeader>
          <TableRow>
            <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Creación" col="creacion" /></TableHead>
            <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Registro" col="registro" /></TableHead>
            <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))] max-w-[180px]"><SortHeader label="Nombre" col="nombre" /></TableHead>
            <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Instagram" col="instagram" /></TableHead>
            <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">OF URL</TableHead>
            <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Agente" col="creadoPor" /></TableHead>
            <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Categoría" col="categoria" /></TableHead>
            <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">Tipo</TableHead>
            <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="País" col="pais" /></TableHead>
            <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Ciudad" col="ciudad" /></TableHead>
            <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">Contacto</TableHead>
            <TableHead className="sticky top-0 right-0 z-30 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((c) => {
            const cleanHandle = c.instagram.replace(/^@/, "");
            return (
              <TableRow key={c.id}>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{c.creacion}</TableCell>
                <TableCell className="text-sm font-mono text-muted-foreground">{c.ticket}</TableCell>
                <TableCell className="text-sm font-medium max-w-[180px] truncate">
                  {c.pais && <span className="mr-1.5">{getCountryFlag(c.pais)}</span>}
                  {c.nombre}
                </TableCell>
                <TableCell>
                  <a
                    href={`https://instagram.com/${cleanHandle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <InstagramIcon className="h-4 w-4" />
                    <span>@{cleanHandle}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </TableCell>
                <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
                  {(c as any).onlyfans_url ? (
                    <a
                      href={(c as any).onlyfans_url.startsWith("http") ? (c as any).onlyfans_url : `https://onlyfans.com/${(c as any).onlyfans_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                      <span className="truncate max-w-[80px]">OF</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {c.creadoPor ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex h-7 w-7 cursor-default items-center justify-center rounded-full border border-border bg-muted text-[11px] font-semibold text-foreground">
                          {getAgentInitials(c.creadoPor)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{c.creadoPor}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    "No asignado"
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={categoryVariant[c.categoria] ?? "secondary-soft"} className="font-normal">
                    {c.categoria}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={(c as any).record_type === "reactivado" ? "warning-soft" : "success-soft"} className="font-normal">
                    {(c as any).record_type === "reactivado" ? "Reactivado" : "Nuevo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {c.pais ? getCountryShortDisplay(c.pais) : "No aplicable"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.city || "No aplicable"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <WaChatButton contactId={c.id} />
                    <TgChatButton contactId={c.id} />
                  </div>
                </TableCell>

                <TableCell className="sticky right-0 z-10 bg-card">
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
                      {canEditContacto && (
                        <DropdownMenuItem onClick={() => onEdit?.(c)}>
                          <Pencil className="mr-2 h-4 w-4" /> Editar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onConvert?.(c)}>
                        <Sparkles className="mr-2 h-4 w-4" /> Convertir a Creador
                      </DropdownMenuItem>
                      {onSellPlatform && (
                        <DropdownMenuItem onClick={() => onSellPlatform(c)}>
                          <ShoppingCart className="mr-2 h-4 w-4" /> Vender plataforma
                        </DropdownMenuItem>
                      )}
                      {onDelete && canDeleteContacto && (
                        <DropdownMenuItem onClick={() => onDelete(c)} className="text-destructive focus:text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
                No se encontraron contactos.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
};

export default ContactosTable;
