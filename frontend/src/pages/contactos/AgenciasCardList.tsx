import { ArrowRight, ExternalLink, MoreHorizontal, Eye, Pencil, Trash2, Globe } from "lucide-react";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Agencia, estadoAgenciaConfig } from "./agenciasUtils";

interface Props {
  agencias: Agencia[];
  onView?: (a: Agencia) => void;
  onEdit?: (a: Agencia) => void;
  onDelete?: (a: Agencia) => void;
}

// Lista de cajones clickeables para Agencias — mismo patrón que
// ContactosCardList. Click abre el modal de detalle existente.
const AgenciasCardList = ({ agencias, onView, onEdit, onDelete }: Props) => {
  if (agencias.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
        No se encontraron agencias.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {agencias.map((a) => {
        const initials = a.nombre
          .split(/\s+/)
          .map((p) => p[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase() || "?";
        const cfg = estadoAgenciaConfig[a.estado];

        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onView?.(a)}
            className="group w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10 hover:border-primary/40"
          >
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 shrink-0">
                <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-medium text-sm truncate">{a.nombre}</p>
                  <Badge variant={cfg?.variant ?? "outline"} className={`font-normal text-[10px] px-1.5 py-0 shrink-0 ${cfg?.className ?? ""}`}>
                    {a.estado}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  {a.contacto_nombre && <span className="truncate">{a.contacto_nombre}</span>}
                  {a.instagram && (
                    <span className="flex items-center gap-1 truncate">
                      <InstagramIcon className="h-3 w-3 shrink-0" />
                      @{a.instagram}
                    </span>
                  )}
                </div>
              </div>

              <div className="hidden md:flex items-center gap-4 text-right shrink-0">
                {a.pais && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">País</p>
                    <p className="text-xs font-medium truncate max-w-[100px]">{a.pais}</p>
                  </div>
                )}
                {a.website && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Website</p>
                    <p className="text-xs font-medium truncate max-w-[140px]">{a.website}</p>
                  </div>
                )}
              </div>

              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 hidden sm:block" />

              <div onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
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
                    {a.instagram && (
                      <DropdownMenuItem onClick={() => window.open(`https://instagram.com/${a.instagram}`, "_blank", "noopener,noreferrer")}>
                        <ExternalLink className="mr-2 h-4 w-4" /> Abrir Instagram
                      </DropdownMenuItem>
                    )}
                    {a.website && (
                      <DropdownMenuItem onClick={() => window.open(a.website.startsWith("http") ? a.website : `https://${a.website}`, "_blank", "noopener,noreferrer")}>
                        <Globe className="mr-2 h-4 w-4" /> Abrir Website
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem onClick={() => onDelete(a)} className="text-destructive focus:text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default AgenciasCardList;
