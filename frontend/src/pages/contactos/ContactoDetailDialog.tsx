import { useState } from "react";
import { ExternalLink, Pencil, Sparkles, Trash2, ArrowRight, History } from "lucide-react";
import ContactHistoryView from "./ContactHistoryView";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { getCountryFlag, getCountryShortDisplay } from "@/lib/country-utils";
import { WaChatButton } from "@/components/WaChatButton";
import { TgChatButton } from "@/components/TgChatButton";
import type { Contacto } from "./ContactosContent";
import type { ContactChannel } from "./useContactSalesChannels";

const categoryVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "secondary-soft" | "destructive-soft"> = {
  "A+": "success-soft",
  A: "primary-soft",
  "B+": "warning-soft",
  B: "secondary-soft",
  C: "destructive-soft",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacto: Contacto | null;
  onEdit?: () => void;
  onConvert?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
  // Solo admin: canales de venta por los que se contactó a este contacto.
  salesChannels?: ContactChannel[];
  showSalesChannels?: boolean;
}

// Popup focalizado con los campos pedidos: Creación, Registro, Nombre,
// Instagram, OF URL, Agente, Categoría, Tipo, País, Ciudad, Contacto.
// Mismo patrón que CreatorDetailDialog (Dashboard 2): foto + título + IG
// + grid de stats + botones de acción.
const ContactoDetailDialog = ({ open, onOpenChange, contacto, onEdit, onConvert, onDelete, canDelete, salesChannels = [], showSalesChannels }: Props) => {
  const [historyOpen, setHistoryOpen] = useState(false);
  if (!contacto) return null;
  const c = contacto;
  const cleanHandle = c.instagram.replace(/^@/, "");
  const igUrl = cleanHandle ? `https://instagram.com/${cleanHandle}` : null;
  const ofUrl = c.onlyfans_url
    ? c.onlyfans_url.startsWith("http")
      ? c.onlyfans_url
      : `https://onlyfans.com/${c.onlyfans_url}`
    : null;
  const initials = c.nombre
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
  const recordType = (c as unknown as { record_type?: string }).record_type;
  const tipo = recordType === "reactivado" ? "Reactivado" : "Nuevo";
  const stats: { label: string; value: React.ReactNode }[] = [
    { label: "Creación", value: c.creacion || "—" },
    { label: "Registro", value: c.ticket || "—" },
    { label: "Agente", value: c.creadoPor || "No asignado" },
    {
      label: "Categoría",
      value: (
        <Badge variant={categoryVariant[c.categoria] ?? "secondary-soft"} className="font-normal">
          {c.categoria || "—"}
        </Badge>
      ),
    },
    {
      label: "Tipo",
      value: (
        <Badge variant={recordType === "reactivado" ? "warning-soft" : "success-soft"} className="font-normal">
          {tipo}
        </Badge>
      ),
    },
    {
      label: "País",
      value: c.pais ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-base">{getCountryFlag(c.pais)}</span>
          {getCountryShortDisplay(c.pais)}
        </span>
      ) : "—",
    },
    { label: "Ciudad", value: c.city || "—" },
    {
      label: "Contacto",
      value: (
        <div className="flex items-center gap-1">
          <WaChatButton contactId={c.id} name={c.nombre} />
          <TgChatButton contactId={c.id} name={c.nombre} />
        </div>
      ),
    },
  ];

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <Avatar className="h-20 w-20 shrink-0">
              {c.profile_picture_url && <AvatarImage src={c.profile_picture_url} alt={c.nombre} />}
              <AvatarFallback className="text-lg font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <DialogTitle
                className={`text-2xl mb-1 truncate ${igUrl ? "cursor-pointer hover:underline decoration-primary/50 underline-offset-4" : ""}`}
                onClick={() => igUrl && window.open(igUrl, "_blank", "noopener,noreferrer")}
                title={igUrl ? "Abrir Instagram" : undefined}
              >
                {c.nombre}
              </DialogTitle>
              {cleanHandle && (
                <a
                  href={igUrl ?? `https://instagram.com/${cleanHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
                  title="Abrir Instagram"
                >
                  <InstagramIcon className="h-3.5 w-3.5" />
                  @{cleanHandle}
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </a>
              )}
              {ofUrl && (
                <a
                  href={ofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1"
                >
                  OF URL
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{s.label}</p>
              <p className="text-sm font-medium tabular-nums truncate">{s.value}</p>
            </div>
          ))}
        </div>

        {showSalesChannels && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
              Canales de venta contactado
            </p>
            {salesChannels.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin contacto por WhatsApp todavía.</p>
            ) : (
              <div className="space-y-1.5">
                {salesChannels.map((ch) => (
                  <div
                    key={ch.channelId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <Badge variant="secondary" className="font-normal">{ch.label}</Badge>
                    <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {ch.lastAt
                        ? format(parseISO(ch.lastAt), "dd MMM yy, HH:mm", { locale: es })
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setHistoryOpen(true)}>
            <History className="h-3.5 w-3.5" />
            Historial
          </Button>
          {ofUrl && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => window.open(ofUrl, "_blank", "noopener,noreferrer")}
            >
              OF URL
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
          {onEdit && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Button>
          )}
          {onConvert && (
            <Button size="sm" className="gap-1.5" onClick={onConvert}>
              <Sparkles className="h-3.5 w-3.5" />
              Convertir a Creador
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && canDelete && (
            <Button variant="outline" size="sm" className="gap-1.5 ml-auto text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
    <ContactHistoryView
      contactId={c.id}
      contactName={c.nombre}
      open={historyOpen}
      onClose={() => setHistoryOpen(false)}
    />
    </>
  );
};

export default ContactoDetailDialog;
