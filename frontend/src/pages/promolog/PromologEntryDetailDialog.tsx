import { Check, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import PromologStoryGallery from "./PromologStoryGallery";
import type { PromologEntry } from "./PromologEntryCard";

// Popup "Detalle de Entrada" de Promolog. Extraído de PromologContent para
// reusarlo idéntico en el subtab Promos (click en una fila) y en el subtab
// Calendario (click en un día). Muestra: header (ticket+nombre+@), grid de
// metadata, link de compra, acción/notas, análisis AI, y la galería de
// evidencia con el veredicto EDITABLE por historia (toggle Sí/No) cuando se
// pasa `onSetVerdict`. El resultado del día (`dayResult`) se recalcula afuera
// (Sí si CUALQUIER historia quedó en Sí) y se pasa como prop.

const resultToBadgeVariant = (result: string): "success-soft" | "destructive-soft" | "warning-soft" | "secondary-soft" => {
  switch (result) {
    case "Sí": return "success-soft";
    case "No": return "destructive-soft";
    case "Parcial": return "warning-soft";
    default: return "secondary-soft";
  }
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: PromologEntry | null;
  /** Todas las historias del día (galería). Vacío = mostrar evidencia única. */
  dayStories: PromologEntry[];
  /** Resultado del día ya recalculado (Sí si cualquier historia es Sí). */
  dayResult: string;
  onSetVerdict?: (story: PromologEntry, verdict: "Sí" | "No") => void;
  savingId?: string | null;
  /** Si se pasa, muestra el botón "Editar". Sin esto, solo "Cerrar". */
  onEdit?: (entry: PromologEntry) => void;
}

const PromologEntryDetailDialog = ({
  open,
  onOpenChange,
  entry,
  dayStories,
  dayResult,
  onSetVerdict,
  savingId,
  onEdit,
}: Props) => {
  if (!entry) return null;
  const showStoryGallery = dayStories.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pr-8">
          <DialogTitle>Detalle de Entrada</DialogTitle>
          <DialogDescription className="sr-only">Detalle completo de la entrada de Promolog</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Header: ticket + nombre + handle */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-xs">{entry.ticketNumber || "—"}</Badge>
            <span className="text-sm font-semibold">{entry.name}</span>
            {entry.handle && (
              <span className="text-sm text-muted-foreground">
                @{(entry.handle ?? "").replace(/^@/, "").replace(/\/$/, "").split("/").pop()}
              </span>
            )}
          </div>

          {/* Grid de metadata principal */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Red social:</span>{" "}
              <span className="font-medium capitalize">{entry.network || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Plataforma destino:</span>{" "}
              <span className="font-medium">{entry.platform || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Resultado:</span>{" "}
              <Badge variant={resultToBadgeVariant(dayResult)} className="ml-1 text-xs">
                {dayResult}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Agente:</span>{" "}
              <span className="font-medium">{entry.agent}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Fecha:</span>{" "}
              <span className="font-medium">{entry.date}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Hora:</span>{" "}
              <span className="font-medium">{entry.time}</span>
            </div>
          </div>

          {/* Buy link — sólo cuando la promo tiene link visible */}
          {entry.has_buy_link && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
              <p className="text-xs uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-1.5">
                <Check className="h-3 w-3" />
                Link de compra detectado
              </p>
              <p className="text-sm">
                Tipo:{" "}
                <Badge variant="success-soft" className="text-[10px] capitalize">
                  {entry.buy_link_type || "no especificado"}
                </Badge>
              </p>
            </div>
          )}

          {/* Acción tomada — qué hizo la creadora para promocionar. */}
          {entry.action_taken && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Qué hizo para promocionar</p>
              <p className="text-sm bg-muted/40 rounded-md p-3">{entry.action_taken}</p>
            </div>
          )}

          {/* Notas — viene del chatter manual o del bot ([AUTO] reasoning). */}
          {entry.notes && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Notas</p>
              <p className="text-sm bg-muted/40 rounded-md p-3 whitespace-pre-wrap">{entry.notes}</p>
            </div>
          )}

          {/* AI reasoning + confidence — solo si fue analizada por el pipeline
              automático y NO hay galería (la galería ya muestra el reasoning por story). */}
          {!showStoryGallery && entry.ai_reasoning && (
            <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-blue-400 font-semibold">Análisis AI</p>
                {entry.ai_confidence != null && (
                  <Badge variant="secondary-soft" className="text-[10px] tabular-nums">
                    Confianza: {(entry.ai_confidence * 100).toFixed(0)}%
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground italic">{entry.ai_reasoning}</p>
            </div>
          )}

          {/* Evidencia — galería de TODAS las stories del día (cuando el bot
              analizó varias) o el pantallazo único (entry manual / 1 story). */}
          {showStoryGallery ? (
            <PromologStoryGallery stories={dayStories} selectedId={entry.id} onSetVerdict={onSetVerdict} savingId={savingId} />
          ) : entry.evidence_url ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Evidencia</p>
                <a
                  href={entry.evidence_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  Abrir en nueva pestaña
                </a>
              </div>
              <a
                href={entry.evidence_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md overflow-hidden border border-border bg-muted/20 hover:border-primary/40 transition-colors"
              >
                <img
                  src={entry.evidence_url}
                  alt="Pantallazo de la promo"
                  className="w-full max-h-[400px] object-contain"
                  onError={(e) => {
                    const img = e.currentTarget;
                    img.style.display = "none";
                    const parent = img.parentElement;
                    if (parent && !parent.querySelector(".fallback")) {
                      const fb = document.createElement("div");
                      fb.className = "fallback p-6 text-center text-xs text-muted-foreground";
                      fb.textContent = "La imagen ya no está disponible (URL expirada). Hacé click en 'Abrir en nueva pestaña' para verla en su origen.";
                      parent.appendChild(fb);
                    }
                  }}
                />
              </a>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          {onEdit && <Button onClick={() => onEdit(entry)}>Editar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PromologEntryDetailDialog;
