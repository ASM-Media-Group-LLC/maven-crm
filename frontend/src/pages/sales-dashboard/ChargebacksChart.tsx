// Chargebacks — auditoría dataviz #18: el chart anterior graficaba una
// constante 0 hardcodeada (una fila `chargebacks: 0` por fecha) porque la
// fuente de datos de contracargos no existe todavía. Nunca renderizar una
// serie inventada: mientras no haya fuente real, la card muestra un estado
// vacío honesto. Cuando exista la fuente, restaurar aquí la serie real con
// el mini-sistema de charts (lib/chartTheme + MavenTooltip).
import { CreditCard } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import type { EarningsRow } from "../sales-performance/types";
import type { EarningsMode } from "./DashboardFilters";

interface Props {
  rows: EarningsRow[];
  earningsMode: EarningsMode;
}

const ChargebacksChart = (_props: Props) => {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Chargebacks</h3>
      <EmptyState
        className="py-6"
        icon={<CreditCard className="h-8 w-8 text-muted-foreground" />}
        title="Sin datos de contracargos todavía"
        description="La fuente de contracargos aún no está conectada a Maven. Cuando exista, este panel mostrará la serie real."
      />
    </div>
  );
};

export default ChargebacksChart;
