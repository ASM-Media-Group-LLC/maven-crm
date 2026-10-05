import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ListRow } from "@/components/ui/list-row";
import { Crown } from "lucide-react";
import { useBestCloserByMonth } from "@/hooks/useOperationsDashboard";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";

// Popup que lista al mejor cerrador de cada mes desde que el ranking
// arrancó (2026-05). Mismo composite que el card del hero — el hook ya
// filtra meses previos a MIN_MONTH para que no aparezcan.
interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const BestCloserMonthlyDialog = ({ open, onOpenChange }: Props) => {
  const { t } = useLanguage();
  const f = useFormato();
  const { data, isLoading } = useBestCloserByMonth();

  // El hook arma `monthLabel` en español ("Mayo 2026"). En español se usa tal
  // cual; en inglés se vuelve a escribir desde `month` (YYYY-MM).
  const nombreDelMes = (m: { month: string; monthLabel: string }) => {
    if (f.idioma !== "en") return m.monthLabel;
    const [anio, mes] = m.month.split("-").map(Number);
    if (!anio || !mes) return m.monthLabel;
    return new Date(anio, mes - 1, 1).toLocaleDateString(f.intl(), { month: "long", year: "numeric" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[70vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            {t("shared.bestCloser.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {isLoading ? (
            <>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              {t("shared.bestCloser.empty")}
            </p>
          ) : (
            data.map((m) => (
              <ListRow key={m.month} className="p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600">
                  <Crown className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground font-semibold">
                    {nombreDelMes(m)}
                  </p>
                  {m.winner ? (
                    <>
                      <p className="text-base font-bold truncate">{m.winner.name}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {t("shared.bestCloser.stats", {
                          closes: m.winner.closes.toLocaleString(f.idioma === "en" ? "en-US" : "es"),
                          score: Math.round(m.winner.avgScore),
                        })}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("shared.bestCloser.noWinner")}</p>
                  )}
                </div>
              </ListRow>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BestCloserMonthlyDialog;
