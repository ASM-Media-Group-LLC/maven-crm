import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ListRow } from "@/components/ui/list-row";
import { Crown } from "lucide-react";
import { useBestCloserByMonth } from "@/hooks/useOperationsDashboard";

// Popup que lista al mejor cerrador de cada mes desde que el ranking
// arrancó (2026-05). Mismo composite que el card del hero — el hook ya
// filtra meses previos a MIN_MONTH para que no aparezcan.
interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const BestCloserMonthlyDialog = ({ open, onOpenChange }: Props) => {
  const { data, isLoading } = useBestCloserByMonth();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[70vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            Mejor cerrador por mes
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
              Sin data todavía. El ranking arrancó este mes y va a empezar
              a llenarse a medida que entren calls.
            </p>
          ) : (
            data.map((m) => (
              <ListRow key={m.month} className="p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600">
                  <Crown className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {m.monthLabel}
                  </p>
                  {m.winner ? (
                    <>
                      <p className="text-base font-bold truncate">{m.winner.name}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {m.winner.closes.toLocaleString("es")} cierres · calif promedio{" "}
                        {Math.round(m.winner.avgScore)}/100
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin ganador</p>
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
