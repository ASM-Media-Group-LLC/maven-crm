import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ListRow } from "@/components/ui/list-row";
import CategorySectionHeader from "@/components/dashboard/CategorySectionHeader";
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";
import type { ClosersKpiPopupResult, ClosersKpiPopupRow } from "../hooks/useClosersKpiPopup";

// Popup detalle de un KPI card de closers/dashboard. Sigue el layout
// del DetailDialog de Panel de Control: header con total grande,
// secciones colapsables por categoría y rows estilo ListRow. Solo
// la primera sección se expande por default; el user puede
// expandir/colapsar el resto.

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  result: ClosersKpiPopupResult | undefined;
  isLoading: boolean;
  popupKey: string | null; // identificador para inicializar collapsed state una sola vez
}

const renderRow = (row: ClosersKpiPopupRow, f: Formato) => (
  <ListRow key={row.id} className="justify-between">
    <div className="min-w-0 flex-1">
      <p className="font-medium truncate">{row.primary}</p>
      {row.secondary && (
        <p className="text-xs text-muted-foreground truncate">{row.secondary}</p>
      )}
    </div>
    <div className="flex items-center gap-2 shrink-0">
      {row.badge && (
        <Badge variant="outline" className="text-[10px]">
          {row.badge}
        </Badge>
      )}
      {row.amount && (
        <span className="text-sm font-bold tabular-nums text-success">
          {row.amount}
        </span>
      )}
      {row.date && (
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {format(new Date(row.date), "d MMM", { locale: f.fechas })}
        </span>
      )}
    </div>
  </ListRow>
);

const ClosersKpiDetailDialog = ({
  open,
  onOpenChange,
  title,
  subtitle,
  result,
  isLoading,
  popupKey,
}: Props) => {
  const f = useFormato();
  const groups = result?.groups ?? [];
  const totalCount = result?.totalCount ?? 0;
  const isGrouped = result?.mode === "grouped";

  // Inicializa el estado collapsed una vez por (open, popupKey) —
  // solo la primera sección con datos queda expandida.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const initializedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = open && popupKey ? popupKey : null;
    if (!key) {
      initializedFor.current = null;
      return;
    }
    if (initializedFor.current === key) return;
    if (!isGrouped || groups.length === 0) return;
    const allCats = groups.map((g) => g.cat);
    const first = allCats[0];
    setCollapsed(new Set(allCats.filter((c) => c !== first)));
    initializedFor.current = key;
  }, [open, popupKey, isGrouped, groups]);

  const toggleCat = (cat: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 pr-14 border-b border-border/40 bg-gradient-to-r from-primary/5 via-primary/0 to-primary/5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg font-bold tracking-tight flex items-center gap-3">
                {title}
                {!isLoading && (
                  <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-bold text-primary tabular-nums">
                    {totalCount.toLocaleString(f.idioma === "en" ? "en-US" : "es")}
                  </span>
                )}
              </DialogTitle>
              {!isLoading && totalCount > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {subtitle ||
                    `${totalCount.toLocaleString(f.idioma === "en" ? "en-US" : "es")} ${totalCount === 1 ? "registro" : "registros"}`}
                  {isGrouped && groups.length > 0 &&
                    ` · ${groups.length} ${groups.length === 1 ? "grupo" : "grupos"}`}
                </p>
              )}
            </div>
            {isGrouped && groups.length > 1 && (
              <div className="flex items-center gap-2 shrink-0 mt-1">
                <button
                  type="button"
                  onClick={() => setCollapsed(new Set())}
                  className="rounded-full bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Expandir todas"
                >
                  Expandir
                </button>
                <button
                  type="button"
                  onClick={() => setCollapsed(new Set(groups.map((g) => g.cat)))}
                  className="rounded-full bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Colapsar todas"
                >
                  Colapsar
                </button>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {isLoading ? (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </>
          ) : groups.length === 0 || totalCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <div className="rounded-full bg-muted/40 p-3">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Sin registros para mostrar.
              </p>
            </div>
          ) : !isGrouped ? (
            <div className="space-y-1.5">
              {groups[0]?.rows.map((row) => renderRow(row, f))}
            </div>
          ) : (
            groups.map((g) => {
              const isCollapsed = collapsed.has(g.cat);
              return (
                <div key={g.cat} className="space-y-2">
                  <CategorySectionHeader
                    cat={g.cat}
                    count={g.count}
                    isCollapsed={isCollapsed}
                    onToggle={() => toggleCat(g.cat)}
                  />
                  {!isCollapsed && (
                    <div className="space-y-1.5 pl-1">
                      {g.rows.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic pl-3 py-2">
                          Sin registros visibles para esta categoría.
                        </p>
                      ) : (
                        g.rows.map((row) => renderRow(row, f))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ClosersKpiDetailDialog;
