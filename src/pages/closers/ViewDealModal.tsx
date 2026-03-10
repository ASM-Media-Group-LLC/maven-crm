import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Deal } from "./useDeals";
import { format } from "date-fns";

interface ViewDealModalProps {
  deal: Deal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const stageColors: Record<string, string> = {
  Nuevo: "bg-primary/10 text-primary",
  Contactado: "bg-accent/10 text-accent-foreground",
  "Llamada Agendada": "bg-[hsl(var(--chart-1))]/10 text-[hsl(var(--chart-1))]",
  "En Llamada": "bg-[hsl(var(--chart-2))]/10 text-[hsl(var(--chart-2))]",
  "No Show": "bg-destructive/10 text-destructive",
  Cerrado: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  Perdido: "bg-muted text-muted-foreground",
};

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between items-center py-2 border-b border-border last:border-0">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-medium">{value || "—"}</span>
  </div>
);

const ViewDealModal = ({ deal, open, onOpenChange }: ViewDealModalProps) => {
  if (!deal) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>Detalle del Deal</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <InfoRow label="Handle" value={deal.prospect_handle} />
          <InfoRow label="Fuente" value={deal.source} />
          <InfoRow
            label="Etapa"
            value={
              <Badge variant="secondary" className={stageColors[deal.stage] || ""}>
                {deal.stage}
              </Badge>
            }
          />
          <InfoRow
            label="Creado"
            value={deal.created_at ? format(new Date(deal.created_at), "dd/MM/yyyy HH:mm") : "—"}
          />
          <InfoRow
            label="Actualizado"
            value={deal.updated_at ? format(new Date(deal.updated_at), "dd/MM/yyyy HH:mm") : "—"}
          />
          {deal.notes && (
            <div className="pt-3">
              <p className="text-sm text-muted-foreground mb-1">Notas</p>
              <p className="text-sm bg-muted/50 rounded-md p-3">{deal.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ViewDealModal;
