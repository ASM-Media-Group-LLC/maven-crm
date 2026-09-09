import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ListRow } from "@/components/ui/list-row";
import type { CreatorComparison } from "./usePeriodComparison";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardType: string;
  creators: CreatorComparison[];
}

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

const TITLES: Record<string, string> = {
  gross: "Desglose de Ingresos Total",
  net: "Desglose de Net (estimado 80%)",
  creators: "Todas las Creadoras",
  rising: "Creadoras Subiendo",
  at_risk: "Creadoras en Riesgo",
  falling: "Creadoras Bajando",
  high_potential: "Alto Potencial",
  top10: "Top 10 Creadoras",
  alerts: "Alertas Activas",
  todas: "Todas las Creadoras",
  comparatives: "Comparativas de Rendimiento",
};

const CardDetailModal = ({ open, onOpenChange, cardType, creators }: Props) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader className="pr-8">
          <DialogTitle>{TITLES[cardType] || "Detalle"}</DialogTitle>
        </DialogHeader>
        {creators.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No hay datos para este periodo.</p>
        ) : (
          <div className="max-h-[500px] overflow-auto space-y-1.5">
            {/* Header simulando una tabla — labels chiquitos arriba de
                las columnas, alineados con los valores de cada row. */}
            <div className="flex items-center gap-3 px-3 pt-1 pb-2 text-xs text-muted-foreground">
              <span className="flex-1">Creadora</span>
              <span className="w-20 text-right">Actual</span>
              <span className="w-20 text-right">Anterior</span>
              <span className="w-16 text-right">Variación</span>
            </div>
            {creators.map((c) => (
              <ListRow key={c.creatorKey}>
                <span className="flex-1 font-medium truncate">{c.artisticName || "—"}</span>
                <span className="w-20 text-right tabular-nums">{fmt(c.currentEarnings)}</span>
                <span className="w-20 text-right text-muted-foreground tabular-nums">{fmt(c.previousEarnings)}</span>
                <span
                  className={`w-16 text-right tabular-nums font-semibold ${c.changePercent >= 0 ? "text-success" : "text-destructive"}`}
                >
                  {c.changePercent >= 0 ? "+" : ""}{c.changePercent.toFixed(1)}%
                </span>
              </ListRow>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CardDetailModal;
