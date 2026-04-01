import { Eye, MoreHorizontal, Pencil, Sparkles, Trash2 } from "lucide-react";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon";
import { getCountryFlag, getCountryShortDisplay } from "@/lib/country-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  onDelete?: (contacto: Contacto) => void;
}

const getAgentInitials = (name: string) => {
  const trimmed = name?.trim() || "";
  if (!trimmed) return "NA";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
};

const ContactosGrid = ({ contactos, onView, onEdit, onConvert, onDelete }: Props) => {
  return (
    <TooltipProvider>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {contactos.map((c) => {
          const initials = c.nombre
            .split(" ")
            .slice(0, 2)
            .map((w) => w[0])
            .join("")
            .toUpperCase();

          const cityLabel = c.city || "No aplicable";
          const locationLabel = c.pais
            ? `${getCountryShortDisplay(c.pais)} · ${cityLabel}`
            : cityLabel;

          return (
            <Card
              key={c.id}
              className="overflow-hidden cursor-pointer transition-shadow duration-200 hover:shadow-md hover:border-primary/30"
              onClick={() => onView?.(c)}
            >
              <CardContent className="p-4 flex flex-col gap-3">
                {/* Top row: avatar+info left, date right */}
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12 shrink-0">
                    <AvatarFallback className="text-sm">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-primary">
                      {c.pais && <span className="mr-1">{getCountryFlag(c.pais)}</span>}
                      {c.nombre}
                    </p>
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
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                    {c.creacion}
                  </span>
                </div>

                {/* Middle: location + instagram */}
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{locationLabel}</p>
                  {c.creadoPor && (
                    <div className="flex items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex h-6 w-6 cursor-default items-center justify-center rounded-full border border-border bg-muted text-[10px] font-semibold text-foreground">
                            {getAgentInitials(c.creadoPor)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{c.creadoPor}</p>
                        </TooltipContent>
                      </Tooltip>
                      <p className="text-xs text-muted-foreground">Agente</p>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <a
                      href={`https://instagram.com/${c.instagram.replace(/^@/, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <InstagramIcon className="h-4 w-4" />
                      <span className="truncate">@{c.instagram.replace(/^@/, "")}</span>
                    </a>
                    {(c as any).whatsapp && (
                      <a
                        href={`https://wa.me/${(c as any).whatsapp.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-500 hover:text-green-400 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <WhatsAppIcon className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Bottom row: three dots right */}
                <div className="flex justify-end">
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
    </TooltipProvider>
  );
};

export default ContactosGrid;
