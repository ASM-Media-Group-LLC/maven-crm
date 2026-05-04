import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  net: "Desglose de Net Earnings",
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
          <div className="max-h-[500px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Creadora</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Anterior</TableHead>
                <TableHead className="text-right">Variación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creators.map((c) => (
                <TableRow key={c.creatorKey}>
                  <TableCell className="font-medium">{c.artisticName || "—"}</TableCell>
                  <TableCell className="text-right">{fmt(c.currentEarnings)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{fmt(c.previousEarnings)}</TableCell>
                  <TableCell className={`text-right ${c.changePercent >= 0 ? "text-success" : "text-destructive"}`}>
                    {c.changePercent >= 0 ? "+" : ""}{c.changePercent.toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CardDetailModal;
