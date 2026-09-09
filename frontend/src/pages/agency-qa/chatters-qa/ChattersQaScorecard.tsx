import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import {
  Plus, Trash2, TrendingUp, TrendingDown, Minus, CalendarPlus, Info, Users, Gauge, AlertTriangle, Loader2, ClipboardCheck, ChevronsUpDown, Check,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
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
  useScorecardPeriods, useScorecards, useUpdateScorecardCell, useAddChatter, useDeleteScorecard, useLatestScoredPeriod, useChatterRoster,
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
  warn: "bg-warning/15 text-warning border-warning/30",
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
  const avg = Math.round(rows.reduce((s, r) => s + pct(r.total), 0) / rows.length);
  return (
    <>
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.04] to-transparent backdrop-blur-md">
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{companyLabel(company)}</span>
          <span className="text-[11px] font-normal text-muted-foreground">({company}) · {rows.length}</span>
        </div>
        <span className={`inline-flex h-6 items-center rounded-md border px-2 text-xs font-semibold tabular-nums ${toneClass[pctTone(avg)]}`}>prom. {avg}%</span>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-xs text-muted-foreground">
            <th className="sticky left-0 z-10 bg-card/70 px-3 py-2 text-left font-medium backdrop-blur">Chatter</th>
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
            <tr key={r.id} className="border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03]">
              <td className="sticky left-0 z-10 bg-card/80 px-3 py-1.5 font-medium backdrop-blur">{r.chatter_name}</td>
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

// Stat-card del header (glass).
function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 backdrop-blur">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <div className={`mt-0.5 text-2xl font-bold tabular-nums ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

// ── Pantalla principal ──────────────────────────────────────────────────────
export default function ChattersQaScorecard() {
  const { data: periods = [], isLoading: periodsLoading } = useScorecardPeriods();
  const { data: latestScored, isLoading: scoredLoading } = useLatestScoredPeriod();
  const [period, setPeriod] = useState<string | null>(null);
  // Default: abrir en el ÚLTIMO mes con notas reales; si ninguno tiene notas, el más reciente.
  useEffect(() => {
    if (period || !periods.length || scoredLoading) return;
    setPeriod(latestScored ?? periods[0]);
  }, [periods, latestScored, scoredLoading, period]);

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
  const { data: chatterRoster = [] } = useChatterRoster();
  const [newChatter, setNewChatter] = useState<{ blu_employee_id: number; name: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newCompany, setNewCompany] = useState<CompanyCode>("CP");
  // chatters ya cargados en este mes+compañía → para deshabilitarlos en el selector (no duplicar).
  const alreadyInMonth = useMemo(
    () => new Set(rows.filter((r) => r.company === newCompany).map((r) => r.blu_employee_id).filter((x): x is number => x != null)),
    [rows, newCompany],
  );
  const submitNew = () => {
    if (!newChatter || !period) return;
    addChatter.mutate(
      { chatter_name: newChatter.name, company: newCompany, period, blu_employee_id: newChatter.blu_employee_id },
      { onSuccess: () => { toast.success(`${newChatter.name} agregado`); setNewChatter(null); },
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
      const { data } = await (supabase as any).from("chatter_scorecards").select("chatter_name, company, blu_employee_id").eq("period", periods[0] ?? periodDate);
      roster = (data ?? []) as Scorecard[];
    }
    const payload = (roster ?? []).map((r) => ({ chatter_name: r.chatter_name, company: r.company, period: periodDate, source: "manual", blu_employee_id: r.blu_employee_id ?? null }));
    if (payload.length === 0) { toast.error("No hay roster para clonar; agrega chatters manualmente."); setPeriod(periodDate); setCreatingMonth(false); return; }
    const { error } = await (supabase as any).from("chatter_scorecards").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(`${periodLabel(periodDate)} creado con ${payload.length} chatters`);
    setCreatingMonth(false); setNewMonth("");
    // refrescamos vía el dropdown; react-query se invalida en las mutaciones, pero acá insertamos directo
    setTimeout(() => window.location.reload(), 250);
  };

  return (
    <div className="space-y-5">
      {/* Header card: título + selector de mes + stats */}
      <div className="rounded-2xl border border-white/10 p-5"
        style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.16), hsl(var(--accent) / 0.06) 45%, hsl(var(--card)) 100%)", boxShadow: "0 0 80px -30px hsl(var(--accent) / 0.35)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold tracking-tight"><ClipboardCheck className="h-5 w-5 text-primary" /> Scorecard</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{period ? periodLabel(period) : "—"} · medición mensual · 8 criterios /40</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period ?? ""} onValueChange={setPeriod}>
              <SelectTrigger className="w-44 border-white/15 bg-background/40 backdrop-blur"><SelectValue placeholder={periodsLoading ? "Cargando…" : "Mes"} /></SelectTrigger>
              <SelectContent>{periods.map((p) => <SelectItem key={p} value={p}>{periodLabel(p)}</SelectItem>)}</SelectContent>
            </Select>
            {!creatingMonth ? (
              <Button variant="outline" size="sm" className="gap-1.5 border-white/15 bg-background/40 backdrop-blur" onClick={() => setCreatingMonth(true)}>
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
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={Users} label="Chatters" value={summary.n} />
          <Stat icon={Gauge} label="Promedio" value={`${summary.avg}%`}
            tone={summary.n ? (summary.avg >= 80 ? "text-success" : summary.avg >= 70 ? "text-warning" : "text-destructive") : undefined} />
          <Stat icon={TrendingUp} label="Subieron" value={summary.comparables ? summary.up : "—"} tone={summary.up ? "text-success" : undefined} />
          <Stat icon={TrendingDown} label="Bajaron" value={summary.comparables ? summary.down : "—"} tone={summary.down ? "text-destructive" : undefined} />
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Edita una celda y se guarda solo (0-5 por criterio). Los criterios en <span className="text-primary">azul</span> se auto-completarán cuando conectemos Hubstaff (Fase 2). Abre en el último mes con notas.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {!isLoading && rows.length === 0 && period && (
        <EmptyState
          className="py-8"
          seed="chatters-qa"
          title={`No hay chatters cargados para ${periodLabel(period)}.`}
          description="Agrega uno abajo o crea el mes desde el roster anterior."
        />
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
            {/* Selector del roster de BLU (no texto libre) → la fila queda VINCULADA por
                blu_employee_id, así el chatter la ve en "datos propios" sin depender del nombre. */}
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={pickerOpen} className="h-9 w-56 justify-between font-normal">
                  <span className="truncate">{newChatter?.name ?? "Elige un chatter…"}</span>
                  <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar chatter…" />
                  <CommandList>
                    <CommandEmpty>Sin resultados — ¿está cargado en BLU?</CommandEmpty>
                    <CommandGroup>
                      {chatterRoster.map((c) => {
                        const dup = alreadyInMonth.has(c.blu_employee_id);
                        return (
                          <CommandItem key={c.blu_employee_id} value={c.name} disabled={dup}
                            onSelect={() => { setNewChatter(c); setPickerOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", newChatter?.blu_employee_id === c.blu_employee_id ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">{c.name}</span>
                            {dup && <span className="ml-1 text-[10px] text-muted-foreground">(ya está)</span>}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <Select value={newCompany} onValueChange={(v) => setNewCompany(v as CompanyCode)}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{COMPANIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label} ({c.code})</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" className="gap-1.5" onClick={submitNew} disabled={!newChatter || addChatter.isPending}>
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </div>
      )}
    </div>
  );
}
