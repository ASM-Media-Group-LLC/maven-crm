import { Eye, MoreHorizontal, Pencil, Trash2, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { type Agencia, estadoAgenciaConfig } from "./agenciasUtils";

interface Props {
  agencias: Agencia[];
  onView?: (a: Agencia) => void;
  onEdit?: (a: Agencia) => void;
  onDelete?: (a: Agencia) => void;
}

const AgenciasGrid = ({ agencias, onView, onEdit, onDelete }: Props) => {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {agencias.map((a) => {
        const initials = a.nombre.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
        const cfg = estadoAgenciaConfig[a.estado];

        return (
          <Card
            key={a.id}
            className="overflow-hidden cursor-pointer transition-shadow duration-200 hover:shadow-md hover:border-primary/30"
            onClick={() => onView?.(a)}
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12 shrink-0">
                  <AvatarFallback className="text-sm">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-primary">{a.nombre}</p>
                  <p className="text-xs text-muted-foreground">{a.pais}</p>
                  <Badge variant={cfg?.variant ?? "outline"} className={`mt-1 text-[10px] px-1.5 py-0 ${cfg?.className ?? ""}`}>
                    {a.estado}
                  </Badge>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView?.(a); }}>
                      <Eye className="mr-2 h-4 w-4" /> Ver detalle
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit?.(a); }}>
                      <Pencil className="mr-2 h-4 w-4" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete?.(a); }} className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-1">
                {a.contacto_nombre && <p className="text-sm text-muted-foreground">{a.contacto_nombre}</p>}
                {a.instagram && (
                  <a
                    href={`https://instagram.com/${a.instagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <InstagramIcon className="h-4 w-4" />
                    <span className="truncate">@{a.instagram}</span>
                  </a>
                )}
                {a.website && (
                  <a
                    href={a.website.startsWith("http") ? a.website : `https://${a.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Globe className="h-4 w-4" />
                    <span className="truncate">{a.website}</span>
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {agencias.length === 0 && (
        <p className="col-span-full py-12 text-center text-muted-foreground">
          No se encontraron agencias.
        </p>
      )}
    </div>
  );
};

export default AgenciasGrid;
