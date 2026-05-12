import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ListRow } from "@/components/ui/list-row";

export type KpiRowTone = "default" | "success" | "destructive" | "warning";

export interface KpiRow {
  primary: string;
  secondary?: string;
  right?: string;
  rightTone?: KpiRowTone;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  rows: KpiRow[];
  emptyText?: string;
}

// Modal genérico para mostrar el detalle de un KPI clickeado.
// Reutilizable en cualquier dashboard que siga el patrón KpiCard.
const KpiDetailDialog = ({ open, onOpenChange, title, subtitle, rows, emptyText = "Sin registros para mostrar." }: Props) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <ListRow key={i} className="justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.primary}</p>
                  {r.secondary && <p className="text-[11px] text-muted-foreground truncate">{r.secondary}</p>}
                </div>
                {r.right && (
                  <Badge
                    variant={r.rightTone === "destructive" ? "destructive" : r.rightTone === "warning" ? "secondary" : r.rightTone === "success" ? "default" : "outline"}
                    className="shrink-0 tabular-nums"
                  >
                    {r.right}
                  </Badge>
                )}
              </ListRow>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default KpiDetailDialog;
