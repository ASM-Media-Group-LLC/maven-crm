import { Eye, MoreHorizontal, Pencil, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import InstagramIcon from "@/components/icons/InstagramIcon";
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

interface Props {
  contactos: Contacto[];
  onView?: (contacto: Contacto) => void;
  onEdit?: (contacto: Contacto) => void;
  onConvert?: (contacto: Contacto) => void;
}

const ContactosGrid = ({ contactos, onView, onEdit, onConvert }: Props) => {
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {contactos.map((c) => {
        const initials = c.nombre
          .split(" ")
          .slice(0, 2)
          .map((w) => w[0])
          .join("")
          .toUpperCase();

        return (
          <Card
            key={c.id}
            className="overflow-hidden cursor-pointer transition-shadow duration-200 hover:shadow-md hover:border-primary/30"
            onClick={() => onView?.(c)}
          >
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12 shrink-0">
                  <AvatarFallback className="text-sm">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-primary">{c.nombre}</p>
                  <p className="text-xs text-muted-foreground font-mono">{c.ticket}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant={statusVariant[c.estado] ?? "secondary-soft"} className="text-[10px] px-1.5 py-0">
                      {c.estado}
                    </Badge>
                    <Badge variant={categoryVariant[c.categoria] ?? "secondary-soft"} className="text-[10px] px-1.5 py-0">
                      {c.categoria}
                    </Badge>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView?.(c); }}>
                      <Eye className="mr-2 h-4 w-4" /> Ver detalle
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit?.(c); }}>
                      <Pencil className="mr-2 h-4 w-4" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onConvert?.(c); }}>
                      <Sparkles className="mr-2 h-4 w-4" /> Convertir a Creador
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{c.pais}</p>
                <a
                  href={`https://instagram.com/${c.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                  onClick={(e) => e.stopPropagation()}
                >
                  <InstagramIcon className="h-4 w-4" />
                  <span className="truncate">@{c.instagram}</span>
                </a>
              </div>
            </CardContent>
          </Card>
        );
      })}
      {contactos.length === 0 && (
        <p className="col-span-full py-12 text-center text-muted-foreground">
          No se encontraron contactos.
        </p>
      )}
    </div>
  );
};

export default ContactosGrid;
