import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Star, TrendingUp, CheckCircle2, Target, Plus, Eye, Pencil, Check, X as XIcon,
  Search, ListIcon, LayoutGrid, Trash2, Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFormato } from "@/hooks/useFormato";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/UserAvatar";
import { PageHeader } from "@/components/ui/page-header";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { PERFORMANCE_EVALUATION_STATUSES } from "@/lib/hrConstants";
import HrPerformanceOperativo from "./HrPerformanceOperativo";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { etiquetaHrO } from "./etiquetasHr";
// xlsx loaded on demand inside handleExport — keeps the export
// dependency out of the cold-load bundle.

// ─── Types ──────────────────────────────────────────────────────────────────
interface EvalRecord {
  id: string;
  employee_id: string;
  period: string | null;
  evaluation_date: string;
  overall_score: number | null;
  punctuality_score: number | null;
  quality_score: number | null;
  teamwork_score: number | null;
  initiative_score: number | null;
  strengths: string | null;
  areas_for_improvement: string | null;
  goals_next_period: string | null;
  comments: string | null;
  status: string;
  created_at: string;
  employees: {
    first_name: string;
    last_name: string;
    employee_code: string | null;
    department_id: string | null;
    profile_photo_url: string | null;
  } | null;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────
function usePerformanceData() {
  return useQuery({
    queryKey: ["performance-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("performance_evaluations")
        .select("*, employees(first_name, last_name, employee_code, department_id, profile_photo_url)")
        .order("evaluation_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EvalRecord[];
    },
  });
}

function useDepartments() {
  return useQuery({
    queryKey: ["departments-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function getInitials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function ScoreStars({ score }: { score: number | null }) {
  if (!score) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm font-bold">{score.toFixed(1)}</span>
      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
    </div>
  );
}

// ─── Status badge helper ────────────────────────────────────────────────────
function getStatusBadgeClasses(status: string) {
  switch (status) {
    case "completed": return "bg-success/15 text-success border-success/30";
    case "pending": return "bg-warning/15 text-warning border-warning/30";
    case "draft": return "bg-muted text-muted-foreground border-border";
    case "reviewed": return "bg-primary/10 text-primary border-primary/30";
    default: return "";
  }
}

// ─── Score tooltip content ──────────────────────────────────────────────────
function ScoreBreakdownTooltip({ ev }: { ev: EvalRecord }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-1 text-xs">
      <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t("hrg.perf.punctuality")}</span><span className="font-medium">{ev.punctuality_score?.toFixed(1) ?? "—"}</span></div>
      <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t("hrg.perf.quality")}</span><span className="font-medium">{ev.quality_score?.toFixed(1) ?? "—"}</span></div>
      <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t("hrg.perf.team")}</span><span className="font-medium">{ev.teamwork_score?.toFixed(1) ?? "—"}</span></div>
      <div className="flex justify-between gap-4"><span className="text-muted-foreground">{t("hrg.perf.initiative")}</span><span className="font-medium">{ev.initiative_score?.toFixed(1) ?? "—"}</span></div>
    </div>
  );
}

const STATUS_TAB_LIST: { value: string; label: TranslationKey }[] = [
  { value: "", label: "common.all" },
  { value: "completed", label: "hrg.perf.completedPl" },
  { value: "pending", label: "common.pendingPl" },
  { value: "draft", label: "hrg.opt.perfStatus.draft" },
];

// ─── Main ───────────────────────────────────────────────────────────────────
export default function HRPerformance() {
  const f = useFormato();
  const { t } = useLanguage();
  const estado = (s: string) => etiquetaHrO(t, "perfStatus", s);
  const navigate = useNavigate();
  const { data: evals = [], isLoading } = usePerformanceData();
  const { data: departments = [] } = useDepartments();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Vista: operativo (Hubstaff/QA, default) vs evaluaciones manuales
  const [view, setView] = useState<"operativo" | "evaluaciones">("operativo");
  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptTab, setDeptTab] = useState("");
  const [statusTab, setStatusTab] = useState("");
  type KpiKey = "avg" | "total" | "completed" | "withGoals";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // View modal
  const [viewItem, setViewItem] = useState<EvalRecord | null>(null);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ─── Status mutation ──────────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("performance_evaluations").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance-all"] });
      toast({ title: t("hrg.statusUpdated") });
    },
    onError: () => toast({ title: t("common.errorUpdating"), variant: "destructive" }),
  });

  // ─── Delete mutation ──────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("performance_evaluations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance-all"] });
      toast({ title: t("hrg.perf.deleted") });
      setDeleteId(null);
    },
    onError: () => {
      toast({ title: t("common.errorDeleting"), variant: "destructive" });
      setDeleteId(null);
    },
  });

  // ─── Export ───────────────────────────────────────────────────────────
  async function handleExport() {
    // El Excel sale siempre en español (columnas y estado): es un archivo que
    // se comparte y se procesa afuera, no pantalla (ver lib/formato.ts).
    const XLSX = await import("xlsx");
    const rows = filtered.map((ev) => {
      const emp = ev.employees;
      return {
        Empleado: emp ? `${emp.first_name} ${emp.last_name}` : "—",
        Código: emp?.employee_code ?? "",
        Período: ev.period ?? "",
        Fecha: format(new Date(ev.evaluation_date), "dd/MM/yyyy"),
        Puntualidad: ev.punctuality_score ?? "",
        Calidad: ev.quality_score ?? "",
        Equipo: ev.teamwork_score ?? "",
        Iniciativa: ev.initiative_score ?? "",
        "Score General": ev.overall_score?.toFixed(1) ?? "",
        Estado: PERFORMANCE_EVALUATION_STATUSES.find((s) => s.value === ev.status)?.label ?? ev.status,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Evaluaciones");
    XLSX.writeFile(wb, `evaluaciones_${format(new Date(), "yyyyMMdd")}.xlsx`);
  }

  // ─── KPIs ─────────────────────────────────────────────────────────────
  const avgScore = useMemo(() => {
    const scored = evals.filter((e) => e.overall_score);
    if (!scored.length) return 0;
    return scored.reduce((sum, e) => sum + (e.overall_score ?? 0), 0) / scored.length;
  }, [evals]);
  const completedCount = evals.filter((e) => e.status === "completed").length;
  const withGoals = evals.filter((e) => e.goals_next_period).length;

  // ─── Filtering ────────────────────────────────────────────────────────
  const hasFilters = search || statusFilter || dateFrom || dateTo;

  const filtered = useMemo(() => {
    return evals.filter((e) => {
      const emp = e.employees;
      const fullName = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
      if (search && !fullName.includes(search.toLowerCase())) return false;
      if (statusFilter && e.status !== statusFilter) return false;
      if (statusTab && e.status !== statusTab) return false;
      if (deptTab && emp?.department_id !== deptTab) return false;
      if (dateFrom) {
        const d = new Date(e.evaluation_date);
        if (d < dateFrom) return false;
      }
      if (dateTo) {
        const d = new Date(e.evaluation_date);
        if (d > dateTo) return false;
      }
      return true;
    });
  }, [evals, search, statusFilter, statusTab, deptTab, dateFrom, dateTo]);

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setDateFrom(undefined);
    setDateTo(undefined);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <PageHeader
          title={t("hrg.perf.title")}
          subtitle={
            view === "operativo"
              ? t("hrg.perf.subtitleOperational")
              : t("hrg.perf.subtitleEvals", { total: evals.length, completed: completedCount })
          }
          actions={
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 p-0.5">
                <Button variant={view === "operativo" ? "secondary" : "ghost"} size="sm" onClick={() => setView("operativo")}>
                  {t("hrg.perf.operational")}
                </Button>
                <Button variant={view === "evaluaciones" ? "secondary" : "ghost"} size="sm" onClick={() => setView("evaluaciones")}>
                  {t("hrg.perf.evaluations")}
                </Button>
              </div>
              {view === "evaluaciones" && (
                <>
                  <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
                    <Download className="h-4 w-4 mr-1" />{t("hrg.perf.export")}
                  </Button>
                  <Button size="sm" onClick={() => navigate("/hr/desempeno/nuevo")}>
                    <Plus className="h-4 w-4 mr-1" />{t("hrg.perf.new")}
                  </Button>
                </>
              )}
            </div>
          }
        />
        {/* Department Tabs — solo en evaluaciones manuales */}
        {view === "evaluaciones" && (
          <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 flex-wrap mt-4">
            <Button variant={!deptTab ? "secondary" : "ghost"} size="sm" onClick={() => setDeptTab("")}>{t("common.all")}</Button>
            {departments.map((d) => (
              <Button key={d.id} variant={deptTab === d.id ? "secondary" : "ghost"} size="sm" onClick={() => setDeptTab(d.id)}>{d.name}</Button>
            ))}
          </div>
        )}
      </header>

      {view === "operativo" ? (
        <div className="flex-1 overflow-auto p-6">
          <HrPerformanceOperativo />
        </div>
      ) : (
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          ) : (
            <>
              <StatChip label={t("hrg.perf.kpi.avg")} value={avgScore ? avgScore.toFixed(1) : "—"} icon={<Star className="h-3.5 w-3.5" />} color="bg-warning" hint={t("hrg.perf.overallScore")} onClick={() => setKpiPopup("avg")} />
              <StatChip label={t("hrg.perf.evaluations")} value={String(evals.length)} icon={<TrendingUp className="h-3.5 w-3.5" />} color="bg-primary" hint={t("hrg.perf.kpi.totalHint")} onClick={() => setKpiPopup("total")} />
              <StatChip label={t("hrg.perf.completedPl")} value={String(completedCount)} icon={<CheckCircle2 className="h-3.5 w-3.5" />} color="bg-success" hint={evals.length > 0 ? t("hrg.ofTotal", { pct: ((completedCount / evals.length) * 100).toFixed(0) }) : "—"} onClick={() => setKpiPopup("completed")} />
              <StatChip label={t("hrg.perf.kpi.withGoals")} value={String(withGoals)} icon={<Target className="h-3.5 w-3.5" />} color="bg-primary" hint={evals.length > 0 ? t("hrg.ofTotal", { pct: ((withGoals / evals.length) * 100).toFixed(0) }) : "—"} onClick={() => setKpiPopup("withGoals")} />
            </>
          )}
        </div>

        {/* Status Tabs */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {STATUS_TAB_LIST.map((s) => (
            <Button key={s.value} variant={statusTab === s.value ? "secondary" : "ghost"} size="sm" onClick={() => setStatusTab(s.value)}>{t(s.label)}</Button>
          ))}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("hrg.searchEmployee")} className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder={t("common.status")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("common.all")}</SelectItem>
              {PERFORMANCE_EVALUATION_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{estado(s.value)}</SelectItem>)}
            </SelectContent>
          </Select>

          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onApply={(f, t) => { setDateFrom(f); setDateTo(t); }}
          />

          {/* View toggle */}
          <div className="inline-flex items-center rounded-md border border-border">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-r-none" onClick={() => setViewMode("list")} aria-label={t("hrg.dir.viewTable")}>
              <ListIcon className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-l-none" onClick={() => setViewMode("grid")} aria-label={t("hrg.dir.viewGrid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={clearFilters}>
              <XIcon className="h-3.5 w-3.5 mr-1" />{t("hrg.clearFilters")}
            </Button>
          )}
        </div>

        {/* ── Table View ──────────────────────────────────────────────────── */}
        {viewMode === "list" ? (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-28rem)]">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-card border-b">
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("hrg.employee")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("common.period")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("hrg.perf.evaluated")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Rating</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("hrg.perfNew.step.goals")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("common.status")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                        {evals.length === 0 ? t("hrg.perf.emptyHint") : t("hrg.noResultsFilters")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((ev) => {
                      const emp = ev.employees;
                      const fullName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
                      const initials = emp ? getInitials(emp.first_name, emp.last_name) : "?";
                      return (
                        <TableRow key={ev.id} className="group hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <UserAvatar name={fullName} src={emp?.profile_photo_url ?? undefined} size="sm" />
                              <div>
                                <p className="text-sm font-medium">{fullName}</p>
                                {emp?.employee_code && <p className="text-xs text-muted-foreground">{emp.employee_code}</p>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{ev.period ?? "—"}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{format(new Date(ev.evaluation_date), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="cursor-default"><ScoreStars score={ev.overall_score} /></div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="p-3">
                                <ScoreBreakdownTooltip ev={ev} />
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            {ev.goals_next_period ? (
                              <Badge variant="outline" className="text-xs">{t("hrg.perf.defined")}</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-xs", getStatusBadgeClasses(ev.status))}>
                              {estado(ev.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                            <div className="flex items-center gap-1">
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-success" onClick={() => statusMutation.mutate({ id: ev.id, status: "completed" })} disabled={ev.status === "completed"}>
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent side="left">{t("hrg.perf.approve")}</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => statusMutation.mutate({ id: ev.id, status: "draft" })} disabled={ev.status === "draft"}>
                                  <XIcon className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent side="left">{t("hrg.perf.reject")}</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(ev)}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent side="left">{t("common.view")}</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => navigate(`/hr/desempeno/nuevo?edit=${ev.id}`)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent side="left">{t("common.edit")}</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteId(ev.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent side="left">{t("common.delete")}</TooltipContent></Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          /* ── Grid View ──────────────────────────────────────────────────── */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)
            ) : filtered.length === 0 ? (
              <div className="col-span-full text-center text-muted-foreground py-12">
                {evals.length === 0 ? t("hrg.perf.empty") : t("hrg.noResultsFilters")}
              </div>
            ) : (
              filtered.map((ev) => {
                const emp = ev.employees;
                const fullName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
                const initials = emp ? getInitials(emp.first_name, emp.last_name) : "?";
                return (
                  <Card key={ev.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={fullName} src={emp?.profile_photo_url ?? undefined} size="sm" className="h-9 w-9" />
                          <div>
                            <p className="text-sm font-medium">{fullName}</p>
                            <p className="text-xs text-muted-foreground">{ev.period ?? t("hrg.perf.noPeriod")}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className={cn("text-xs", getStatusBadgeClasses(ev.status))}>
                          {estado(ev.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <ScoreStars score={ev.overall_score} />
                        <span className="text-xs text-muted-foreground">{format(new Date(ev.evaluation_date), "dd MMM yyyy", { locale: f.fechas })}</span>
                      </div>
                      {ev.goals_next_period && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{ev.goals_next_period}</p>
                      )}
                      <div className="flex items-center gap-1 pt-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-success" onClick={() => statusMutation.mutate({ id: ev.id, status: "completed" })} disabled={ev.status === "completed"}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => statusMutation.mutate({ id: ev.id, status: "draft" })} disabled={ev.status === "draft"}>
                          <XIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(ev)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => navigate(`/hr/desempeno/nuevo?edit=${ev.id}`)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteId(ev.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>
      )}

      {/* ── View Modal ────────────────────────────────────────────────────── */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("hrg.perf.detailTitle")}</DialogTitle></DialogHeader>
          {viewItem && (() => {
            const emp = viewItem.employees;
            const fullName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
            return (
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                <div className="flex items-center gap-3">
                  <UserAvatar name={emp ? `${emp.first_name} ${emp.last_name}` : null} src={emp?.profile_photo_url ?? undefined} size="md" />
                  <div>
                    <p className="font-medium">{fullName}</p>
                    <p className="text-sm text-muted-foreground">{viewItem.period} · {format(new Date(viewItem.evaluation_date), "dd MMM yyyy", { locale: f.fechas })}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">{t("hrg.perf.punctuality")}</p><ScoreStars score={viewItem.punctuality_score} /></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">{t("hrg.perf.quality")}</p><ScoreStars score={viewItem.quality_score} /></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">{t("hrg.perf.teamwork")}</p><ScoreStars score={viewItem.teamwork_score} /></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">{t("hrg.perf.initiative")}</p><ScoreStars score={viewItem.initiative_score} /></div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t("hrg.perf.overallScore")}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{viewItem.overall_score?.toFixed(1) ?? "—"}</span>
                    <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                  </div>
                </div>
                {viewItem.strengths && <div className="space-y-1"><p className="text-xs font-medium text-muted-foreground">{t("hrg.perf.strengths")}</p><p className="text-sm">{viewItem.strengths}</p></div>}
                {viewItem.areas_for_improvement && <div className="space-y-1"><p className="text-xs font-medium text-muted-foreground">{t("hrg.perf.improvements")}</p><p className="text-sm">{viewItem.areas_for_improvement}</p></div>}
                {viewItem.goals_next_period && <div className="space-y-1"><p className="text-xs font-medium text-muted-foreground">{t("hrg.perf.nextGoals")}</p><p className="text-sm">{viewItem.goals_next_period}</p></div>}
                {viewItem.comments && <div className="space-y-1"><p className="text-xs font-medium text-muted-foreground">{t("hrg.perf.comments")}</p><p className="text-sm">{viewItem.comments}</p></div>}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Delete AlertDialog ────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hrg.perf.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("hrg.perf.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        emptyText={t("hrg.noRecordsToShow")}
        title={(() => {
          switch (kpiPopup) {
            case "avg": return t("hrg.kpiTitle", { label: t("hrg.perf.kpi.avgFull"), value: avgScore ? avgScore.toFixed(1) : "—" });
            case "total": return t("hrg.kpiTitle", { label: t("hrg.perf.kpi.total"), value: evals.length });
            case "completed": return t("hrg.kpiTitle", { label: t("hrg.perf.completedPl"), value: completedCount });
            case "withGoals": return t("hrg.kpiTitle", { label: t("hrg.perf.kpi.withGoals"), value: withGoals });
            default: return "";
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = evals;
          if (kpiPopup === "completed") list = evals.filter((e: any) => e.status === "completed");
          else if (kpiPopup === "withGoals") list = evals.filter((e: any) => e.goals_next_period);
          return list.slice(0, 100).map((e: any): KpiRow => ({
            primary: e.employee_name ?? (e.employees ? `${e.employees.first_name} ${e.employees.last_name}` : t("hrg.employeeId", { id: e.employee_id?.slice?.(0, 8) ?? "—" })),
            // Antes: `e.period ?? e.review_date ? format(new Date(e.review_date)…)`. La
            // precedencia lo leía como `(period ?? review_date) ? …`, y review_date no
            // existe: con un período cargado, abrir el KPI tiraba "Invalid time value"
            // y la pantalla se caía. La fecha de la evaluación es evaluation_date.
            secondary: e.period ?? (e.evaluation_date ? format(new Date(e.evaluation_date), "dd MMM yyyy") : undefined),
            right: e.overall_score ? `${e.overall_score}/5` : e.status ? estado(e.status) : "—",
            rightTone: e.status === "completed" ? "success" : "default",
          }));
        })()}
      />
    </div>
  );
}
