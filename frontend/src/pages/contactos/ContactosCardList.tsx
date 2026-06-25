import { ArrowRight, ExternalLink, MoreHorizontal, Eye, Pencil, Sparkles, Trash2 } from "lucide-react";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCountryFlag, getCountryShortDisplay } from "@/lib/country-utils";
import type { Contacto } from "./ContactosContent";
import type { ContactChannel } from "./useContactSalesChannels";
import type { ContactStatus } from "./useContactStatuses";

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
  // Mapa closers_contacts.id → canales de venta (provisto por ContactosContent).
  channelsByContact?: Map<string, ContactChannel[]>;
  // Mapa closers_contacts.id → estado, para el color de la fila (verde/amarillo/rojo).
  statuses?: Map<string, ContactStatus>;
}

// Tinte de la fila según el estado del contacto (degradado glass sutil).
const ROW_BG: Record<ContactStatus, string> = {
  creator_active: "border-emerald-500/30 bg-gradient-to-r from-emerald-500/[0.16] to-emerald-500/[0.04] hover:from-emerald-500/25",
  in_progress: "border-amber-500/30 bg-gradient-to-r from-amber-500/[0.16] to-amber-500/[0.04] hover:from-amber-500/25",
  ex_creator: "border-rose-500/30 bg-gradient-to-r from-rose-500/[0.16] to-rose-500/[0.04] hover:from-rose-500/25",
};

// Lista de cajones clickeables — mismo patrón que Pareto / Creator Reports
// en Dashboard 2. Cada card muestra avatar IG, nombre, badge categoría,
// fecha y links rápidos. Click abre popup detalle.
const ContactosCardList = ({ contactos, onView, onEdit, onConvert, onDelete, channelsByContact, statuses }: Props) => {
  if (contactos.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
        No se encontraron contactos.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {contactos.map((c) => {
        const cleanHandle = c.instagram.replace(/^@/, "");
        const initials = c.nombre
          .split(/\s+/)
          .map((p) => p[0])
          .filter(Boolean)
          .slice(0, 2)
          .join("")
          .toUpperCase() || "?";
        const recordType = (c as unknown as { record_type?: string }).record_type;
        const salesChannels = channelsByContact?.get(c.id) ?? [];
        // Color de fila: el estado del RPC, o "en proceso" (amarillo) si solo tiene
        // conversación de wpp (= fue contactada). Sin nada → sin color.
        const effStatus = statuses?.get(c.id) ?? (salesChannels.length > 0 ? "in_progress" : undefined);
        const rowBg = effStatus ? ROW_BG[effStatus] : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-primary/40";
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onView?.(c)}
            className={`group w-full rounded-xl border p-3 text-left transition-colors ${rowBg}`}
          >
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 shrink-0">
                {c.profile_picture_url && <AvatarImage src={c.profile_picture_url} alt={c.nombre} />}
                <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {c.pais && <span className="text-base shrink-0">{getCountryFlag(c.pais)}</span>}
                  <p className="font-medium text-sm truncate">{c.nombre}</p>
                  <Badge variant={categoryVariant[c.categoria] ?? "secondary-soft"} className="font-normal text-[10px] px-1.5 py-0 shrink-0">
                    {c.categoria}
                  </Badge>
                  {recordType === "reactivado" && (
                    <Badge variant="warning-soft" className="font-normal text-[10px] px-1.5 py-0 shrink-0">
                      Reactivado
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  {cleanHandle && (
                    <span className="flex items-center gap-1 truncate">
                      <InstagramIcon className="h-3 w-3 shrink-0" />
                      @{cleanHandle}
                    </span>
                  )}
                  {c.creadoPor && <span className="truncate">· {c.creadoPor}</span>}
                </div>
                {salesChannels.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {salesChannels.map((ch) => (
                      <Badge
                        key={ch.channelId}
                        variant="secondary"
                        className="font-normal text-[10px] px-1.5 py-0 shrink-0"
                      >
                        {ch.label}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="hidden md:flex items-center gap-4 text-right shrink-0">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ciudad</p>
                  <p className="text-xs font-medium truncate max-w-[100px]">{c.city || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">País</p>
                  <p className="text-xs font-medium">{c.pais ? getCountryShortDisplay(c.pais) : "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Creación</p>
                  <p className="text-xs font-medium whitespace-nowrap">{c.creacion}</p>
                </div>
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
                    <DropdownMenuItem onClick={() => onView?.(c)}>
                      <Eye className="mr-2 h-4 w-4" /> Ver detalle
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit?.(c)}>
                      <Pencil className="mr-2 h-4 w-4" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onConvert?.(c)}>
                      <Sparkles className="mr-2 h-4 w-4" /> Convertir a Creador
                    </DropdownMenuItem>
                    {cleanHandle && (
                      <DropdownMenuItem onClick={() => window.open(`https://instagram.com/${cleanHandle}`, "_blank", "noopener,noreferrer")}>
                        <ExternalLink className="mr-2 h-4 w-4" /> Abrir Instagram
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem onClick={() => onDelete(c)} className="text-destructive focus:text-destructive">
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

export default ContactosCardList;
