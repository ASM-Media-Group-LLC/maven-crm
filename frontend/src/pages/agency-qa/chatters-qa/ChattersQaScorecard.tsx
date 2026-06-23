import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Trash2, TrendingUp, TrendingDown, Minus, CalendarPlus, Info, Users, Gauge, AlertTriangle, Loader2,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import {
  COMPANIES, CRITERIA, MAX_TOTAL, companyLabel, periodLabel, pct, pctTone,
  useScorecardPeriods, useScorecards, useUpdateScorecardCell, useAddChatter, useDeleteScorecard,
  type CompanyCode, type CriterionKey, type Scorecard,
} from "./useChatterScorecards";

// ── Celda editable de score (0-5) ──────────────────────────────────────────
// Estado local que confirma en blur/Enter para no disparar un UPDATE por tecla.
function ScoreCell({ row, field }: { row: Scorecard; field: CriterionKey }) {
  const update = useUpdateScorecardCell();
  const initial = row[field] == null ? "" : String(row[field]);
  const [val, setVal] = useState(initial);
  useEffect(() => setVal(initial), [initial]);

  const commit = () => {
    const trimmed = val.trim();
    const next = trimmed === "" ? null : Math.max(0, Math.min(5, Math.round(Number(trimmed))));
    if (trimmed !== "" && Number.isNaN(Number(trimmed))) { setVal(initial); return; }
    const cur = row[field];
    if (next === cur) return;
    update.mutate({ id: row.id, field, value: next },
      { onError: (e) => { toast.error("No se pudo guardar: " + (e as Error).message); setVal(initial); } });
    setVal(next == null ? "" : String(next));
  };

  return (
    <input
      type="number" min={0} max={5} inputMode="numeric"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-8 w-11 rounded-md border border-border bg-background text-center text-sm tabular-nums outline-none focus:border-primary focus:ring-1 focus:ring-primary/40"
    />
  );
}

const toneClass: Record<"good" | "warn" | "bad", string> = {
  good: "bg-success/15 text-success border-success/30",
  warn: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  bad: "bg-destructive/15 text-destructive border-destructive/30",
};

function PctBadge({ total }: { total: number }) {
  const p = pct(total);
  return <span className={`inline-flex h-7 min-w-[3rem] items-center justify-center rounded-md border px-2 text-sm font-semibold tabular-nums ${toneClass[pctTone(p)]}`}>{p}%</span>;
}

function Trend({ cur, prev }: { cur: number; prev: number | null }) {
  if (prev == null) return <span className="text-xs text-muted-foreground">—</span>;
  const d = pct(cur) - pct(prev);
  if (d === 0) return <Minus className="h-4 w-4 text-muted-foreground" />;
  const up = d > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? "text-success" : "text-destructive"}`}>
      {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}{up ? "+" : ""}{d}%
    </span>
  );
}

// ── Tabla por compañía ──────────────────────────────────────────────────────
function CompanyTable({ company, rows, prevByName }: {
  company: CompanyCode; rows: Scorecard[]; prevByName: Map<string, number>;
}) {
  const del = useDeleteScorecard();
  const [toDelete, setToDelete] = useState<Scorecard | null>(null);
  if (rows.length === 0) return null;
  return (
    <>
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left font-semibold">
              {companyLabel(company)} <span className="text-xs font-normal text-muted-foreground">({company})</span>
            </th>
            {CRITERIA.map((c) => (
              <th key={c.key} className="px-1 py-2 text-center font-medium">
                <TooltipProvider><Tooltip>
                  <TooltipTrigger asChild>
                    <span className={`cursor-help text-[11px] ${c.hubstaff ? "text-primary" : "text-muted-foreground"}`}>{c.short}</span>
                  </TooltipTrigger>
                  <TooltipContent>{c.label}{c.hubstaff ? " · se auto-completará con Hubstaff" : ""}</TooltipContent>
                </Tooltip></TooltipProvider>
              </th>
            ))}
            <th className="px-2 py-2 text-center font-semibold">Total</th>
            <th className="px-2 py-2 text-center font-semibold">%</th>
            <th className="px-2 py-2 text-center font-medium text-muted-foreground">vs mes ant.</th>
            <th className="px-1 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
              <td className="sticky left-0 z-10 bg-background px-3 py-1.5 font-medium hover:bg-muted/20">{r.chatter_name}</td>
              {CRITERIA.map((c) => (
                <td key={c.key} className="px-1 py-1.5 text-center"><ScoreCell row={r} field={c.key} /></td>
              ))}
              <td className="px-2 py-1.5 text-center font-semibold tabular-nums">{r.total}<span className="text-xs text-muted-foreground">/{MAX_TOTAL}</span></td>
              <td className="px-2 py-1.5 text-center"><PctBadge total={r.total} /></td>
              <td className="px-2 py-1.5 text-center"><Trend cur={r.total} prev={prevByName.get(r.chatter_name) ?? null} /></td>
              <td className="px-1 py-1.5 text-center">
                <button
                  type="button"
                  onClick={() => setToDelete(r)}
                  className="text-muted-foreground/50 hover:text-destructive"
                ><Trash2 className="h-4 w-4" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

      {/* Confirmar borrado de chatter del mes — popup estilo Maven */}
      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Eliminar del scorecard
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Sacar a <strong>{toDelete?.chatter_name}</strong> del scorecard de este mes ({companyLabel(company)})? Se pierden sus notas del mes. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!toDelete) return;
                del.mutate(toDelete.id, {
                  onSuccess: () => { toast.success("Chatter eliminado del mes"); setToDelete(null); },
                  onError: (err) => toast.error((err as Error).message),
                });
              }}>
              {del.isPending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Eliminando…</> : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Pantalla principal ──────────────────────────────────────────────────────
export default function ChattersQaScorecard() {
  const { data: periods = [], isLoading: periodsLoading } = useScorecardPeriods();
  const [period, setPeriod] = useState<string | null>(null);
  useEffect(() => { if (!period && periods.length) setPeriod(periods[0]); }, [periods, period]);

  const prevPeriod = useMemo(() => {
    const i = periods.indexOf(period ?? "");
    return i >= 0 && i + 1 < periods.length ? periods[i + 1] : null;
  }, [periods, period]);

  const { data: rows = [], isLoading } = useScorecards(period);
  const { data: prevRows = [] } = useScorecards(prevPeriod);

  const prevByName = useMemo(() => {
    const m = new Map<string, number>();
    prevRows.forEach((r) => m.set(r.chatter_name, r.total));
    return m;
  }, [prevRows]);

  // Resumen: # chatters, promedio %, subieron/bajaron vs mes anterior.
  const summary = useMemo(() => {
    const n = rows.length;
    const avg = n ? Math.round(rows.reduce((s, r) => s + pct(r.total), 0) / n) : 0;
    let up = 0, down = 0, comparables = 0;
    rows.forEach((r) => {
      const prev = prevByName.get(r.chatter_name);
      if (prev == null) return;
      comparables++;
      const d = pct(r.total) - pct(prev);
      if (d > 0) up++; else if (d < 0) down++;
    });
    return { n, avg, up, down, comparables };
  }, [rows, prevByName]);

  const addChatter = useAddChatter();
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState<CompanyCode>("CP");
  const submitNew = () => {
    if (!newName.trim() || !period) return;
    addChatter.mutate({ chatter_name: newName, company: newCompany, period },
      { onSuccess: () => { toast.success(`${newName.trim()} agregado`); setNewName(""); },
        onError: (e) => toast.error((e as Error).message) });
  };

  // Nuevo mes: clona el roster (nombre+compañía) del mes más reciente, scores en blanco.
  const [creatingMonth, setCreatingMonth] = useState(false);
  const [newMonth, setNewMonth] = useState("");
  const createMonth = async () => {
    if (!newMonth) return;
    const periodDate = `${newMonth}-01`;
    if (periods.includes(periodDate)) { toast.error("Ese mes ya existe"); setPeriod(periodDate); setCreatingMonth(false); return; }
    const base = periods[0] ? rows.length && period === periods[0] ? rows : null : null;
    // roster del mes más reciente (si el activo no es el más reciente, lo traemos)
    let roster = base;
    if (!roster) {
      const { data } = await (supabase as any).from("chatter_scorecards").select("chatter_name, company").eq("period", periods[0] ?? periodDate);
      roster = (data ?? []) as Scorecard[];
    }
    const payload = (roster ?? []).map((r) => ({ chatter_name: r.chatter_name, company: r.company, period: periodDate, source: "manual" }));
    if (payload.length === 0) { toast.error("No hay roster para clonar; agregá chatters manualmente."); setPeriod(periodDate); setCreatingMonth(false); return; }
    const { error } = await (supabase as any).from("chatter_scorecards").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(`${periodLabel(periodDate)} creado con ${payload.length} chatters`);
    setCreatingMonth(false); setNewMonth("");
    // refrescamos vía el dropdown; react-query se invalida en las mutaciones, pero acá insertamos directo
    setTimeout(() => window.location.reload(), 250);
  };

  return (
    <div className="space-y-5">
      {/* Header: selector de mes + resumen */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={period ?? ""} onValueChange={setPeriod}>
            <SelectTrigger className="w-48"><SelectValue placeholder={periodsLoading ? "Cargando…" : "Mes"} /></SelectTrigger>
            <SelectContent>
              {periods.map((p) => <SelectItem key={p} value={p}>{periodLabel(p)}</SelectItem>)}
            </SelectContent>
          </Select>
          {!creatingMonth ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCreatingMonth(true)}>
              <CalendarPlus className="h-4 w-4" /> Nuevo mes
            </Button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input type="month" value={newMonth} onChange={(e) => setNewMonth(e.target.value)}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
              <Button size="sm" onClick={createMonth} disabled={!newMonth}>Crear</Button>
              <Button size="sm" variant="ghost" onClick={() => setCreatingMonth(false)}>Cancelar</Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="outline" className="gap-1.5"><Users className="h-3.5 w-3.5" />{summary.n} chatters</Badge>
          <Badge variant="outline" className="gap-1.5"><Gauge className="h-3.5 w-3.5" />promedio {summary.avg}%</Badge>
          {summary.comparables > 0 && (
            <>
              <Badge variant="outline" className="gap-1.5 border-success/30 text-success"><TrendingUp className="h-3.5 w-3.5" />{summary.up} subieron</Badge>
              <Badge variant="outline" className="gap-1.5 border-destructive/30 text-destructive"><TrendingDown className="h-3.5 w-3.5" />{summary.down} bajaron</Badge>
            </>
          )}
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        8 criterios 0-5 → total /40 → %. Editá una celda y se guarda solo. Los criterios en <span className="text-primary">azul</span> se auto-completarán cuando conectemos Hubstaff (Fase 2).
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {!isLoading && rows.length === 0 && period && (
        <p className="text-sm text-muted-foreground">No hay chatters cargados para {periodLabel(period)}. Agregá uno abajo o creá el mes desde el roster anterior.</p>
      )}

      <div className="space-y-5">
        {COMPANIES.map(({ code }) => (
          <CompanyTable key={code} company={code} rows={rows.filter((r) => r.company === code)} prevByName={prevByName} />
        ))}
      </div>

      {/* Agregar chatter */}
      {period && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">Nuevo chatter</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre completo"
              onKeyDown={(e) => { if (e.key === "Enter") submitNew(); }} className="h-9 w-56" />
          </div>
          <Select value={newCompany} onValueChange={(v) => setNewCompany(v as CompanyCode)}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{COMPANIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label} ({c.code})</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" className="gap-1.5" onClick={submitNew} disabled={!newName.trim() || addChatter.isPending}>
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </div>
      )}
    </div>
  );
}
