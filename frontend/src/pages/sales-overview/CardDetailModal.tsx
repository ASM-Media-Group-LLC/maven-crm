import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ListRow } from "@/components/ui/list-row";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import type { CreatorComparison } from "./usePeriodComparison";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardType: string;
  creators: CreatorComparison[];
}

const fmt = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

// La llave es el id de la tarjeta que abrió el detalle (SalesKPICards /
// SalesOperationalCards).
const TITLES: Record<string, TranslationKey> = {
  gross: "sales.ov.title.gross",
  net: "sales.ov.title.net",
  creators: "sales.ov.title.creators",
  rising: "sales.ov.title.rising",
  at_risk: "sales.ov.title.atRisk",
  falling: "sales.ov.title.falling",
  high_potential: "sales.ov.highPotential",
  top10: "sales.ov.title.top10",
  alerts: "sales.ov.title.alerts",
  todas: "sales.ov.title.creators",
  comparatives: "sales.ov.title.comparatives",
};

const CardDetailModal = ({ open, onOpenChange, cardType, creators }: Props) => {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader className="pr-8">
          <DialogTitle>{t(TITLES[cardType] ?? "sales.ov.detail")}</DialogTitle>
        </DialogHeader>
        {creators.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">{t("sales.ov.noData")}</p>
        ) : (
          <div className="max-h-[500px] overflow-auto space-y-1.5">
            {/* Header simulando una tabla — labels chiquitos arriba de
                las columnas, alineados con los valores de cada row. */}
            <div className="flex items-center gap-3 px-3 pt-1 pb-2 text-xs text-muted-foreground">
              <span className="flex-1">{t("sales.creator")}</span>
              <span className="w-20 text-right">{t("sales.ov.current")}</span>
              <span className="w-20 text-right">{t("sales.ov.previous")}</span>
              <span className="w-16 text-right">{t("sales.col.variation")}</span>
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
