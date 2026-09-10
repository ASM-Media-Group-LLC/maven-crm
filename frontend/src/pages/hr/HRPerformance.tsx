import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Star, TrendingUp, CheckCircle2, Target, Plus, Eye, Pencil, Check, X as XIcon,
  Search, ListIcon, LayoutGrid, Trash2, Download,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
import { es } from "date-fns/locale";
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
  return (
    <div className="space-y-1 text-xs">
      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Puntualidad</span><span className="font-medium">{ev.punctuality_score?.toFixed(1) ?? "—"}</span></div>
      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Calidad</span><span className="font-medium">{ev.quality_score?.toFixed(1) ?? "—"}</span></div>
      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Equipo</span><span className="font-medium">{ev.teamwork_score?.toFixed(1) ?? "—"}</span></div>
      <div className="flex justify-between gap-4"><span className="text-muted-foreground">Iniciativa</span><span className="font-medium">{ev.initiative_score?.toFixed(1) ?? "—"}</span></div>
    </div>
  );
}

const STATUS_TAB_LIST = [
  { value: "", label: "Todos" },
  { value: "completed", label: "Completadas" },
  { value: "pending", label: "Pendientes" },
  { value: "draft", label: "Borrador" },
];

// ─── Main ───────────────────────────────────────────────────────────────────
export default function HRPerformance() {
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
      toast({ title: "Estado actualizado" });
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  // ─── Delete mutation ──────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("performance_evaluations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance-all"] });
      toast({ title: "Evaluación eliminada" });
      setDeleteId(null);
    },
    onError: () => {
      toast({ title: "Error al eliminar", variant: "destructive" });
      setDeleteId(null);
    },
  });

  // ─── Export ───────────────────────────────────────────────────────────
  async function handleExport() {
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
          title="Evaluaciones & Performance"
          subtitle={
            view === "operativo"
              ? "Resultado operativo por rol desde Hubstaff y BLU"
              : `${evals.length} evaluaciones registradas · ${completedCount} completadas`
          }
          actions={
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 p-0.5">
                <Button variant={view === "operativo" ? "secondary" : "ghost"} size="sm" onClick={() => setView("operativo")}>
                  Operativo (Hubstaff)
                </Button>
                <Button variant={view === "evaluaciones" ? "secondary" : "ghost"} size="sm" onClick={() => setView("evaluaciones")}>
                  Evaluaciones
                </Button>
              </div>
              {view === "evaluaciones" && (
                <>
                  <Button variant="outline" size="sm" onClick={handleExport} disabled={filtered.length === 0}>
                    <Download className="h-4 w-4 mr-1" />Exportar
                  </Button>
                  <Button size="sm" onClick={() => navigate("/hr/desempeno/nuevo")}>
                    <Plus className="h-4 w-4 mr-1" />Nueva Evaluación
                  </Button>
                </>
              )}
            </div>
          }
        />
        {/* Department Tabs — solo en evaluaciones manuales */}
        {view === "evaluaciones" && (
          <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 flex-wrap mt-4">
            <Button variant={!deptTab ? "secondary" : "ghost"} size="sm" onClick={() => setDeptTab("")}>Todos</Button>
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
              <StatChip label="Calif. Promedio" value={avgScore ? avgScore.toFixed(1) : "—"} icon={<Star className="h-3.5 w-3.5" />} color="bg-warning" hint="Score general" onClick={() => setKpiPopup("avg")} />
              <StatChip label="Evaluaciones" value={String(evals.length)} icon={<TrendingUp className="h-3.5 w-3.5" />} color="bg-primary" hint="Total registradas" onClick={() => setKpiPopup("total")} />
              <StatChip label="Completadas" value={String(completedCount)} icon={<CheckCircle2 className="h-3.5 w-3.5" />} color="bg-success" hint={evals.length > 0 ? `${((completedCount / evals.length) * 100).toFixed(0)}% del total` : "—"} onClick={() => setKpiPopup("completed")} />
              <StatChip label="Con Objetivos" value={String(withGoals)} icon={<Target className="h-3.5 w-3.5" />} color="bg-primary" hint={evals.length > 0 ? `${((withGoals / evals.length) * 100).toFixed(0)}% del total` : "—"} onClick={() => setKpiPopup("withGoals")} />
            </>
          )}
        </div>

        {/* Status Tabs */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {STATUS_TAB_LIST.map((s) => (
            <Button key={s.value} variant={statusTab === s.value ? "secondary" : "ghost"} size="sm" onClick={() => setStatusTab(s.value)}>{s.label}</Button>
          ))}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar empleado..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {PERFORMANCE_EVALUATION_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onApply={(f, t) => { setDateFrom(f); setDateTo(t); }}
          />

          {/* View toggle */}
          <div className="inline-flex items-center rounded-md border border-border">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-r-none" onClick={() => setViewMode("list")}>
              <ListIcon className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8 rounded-l-none" onClick={() => setViewMode("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={clearFilters}>
              <XIcon className="h-3.5 w-3.5 mr-1" />Limpiar filtros
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
                    <TableHead className="text-xs font-medium text-muted-foreground">Empleado</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Período</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Evaluado</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Rating</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Objetivos</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">Acciones</TableHead>
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
                        {evals.length === 0 ? 'No hay evaluaciones registradas. Haz clic en "Nueva Evaluación" para empezar.' : "Sin resultados para los filtros aplicados."}
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
                              <Badge variant="outline" className="text-xs">Definidos</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-xs", getStatusBadgeClasses(ev.status))}>
                              {PERFORMANCE_EVALUATION_STATUSES.find((s) => s.value === ev.status)?.label ?? ev.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                            <div className="flex items-center gap-1">
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-success" onClick={() => statusMutation.mutate({ id: ev.id, status: "completed" })} disabled={ev.status === "completed"}>
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent side="left">Aprobar</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => statusMutation.mutate({ id: ev.id, status: "draft" })} disabled={ev.status === "draft"}>
                                  <XIcon className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent side="left">Rechazar</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(ev)}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent side="left">Ver</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => navigate(`/hr/desempeno/nuevo?edit=${ev.id}`)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent side="left">Editar</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteId(ev.id)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent side="left">Eliminar</TooltipContent></Tooltip>
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
                {evals.length === 0 ? 'No hay evaluaciones registradas.' : "Sin resultados para los filtros aplicados."}
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
                            <p className="text-xs text-muted-foreground">{ev.period ?? "Sin período"}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className={cn("text-xs", getStatusBadgeClasses(ev.status))}>
                          {PERFORMANCE_EVALUATION_STATUSES.find((s) => s.value === ev.status)?.label ?? ev.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <ScoreStars score={ev.overall_score} />
                        <span className="text-xs text-muted-foreground">{format(new Date(ev.evaluation_date), "dd MMM yyyy", { locale: es })}</span>
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
          <DialogHeader><DialogTitle>Detalle de Evaluación</DialogTitle></DialogHeader>
          {viewItem && (() => {
            const emp = viewItem.employees;
            const fullName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
            return (
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                <div className="flex items-center gap-3">
                  <UserAvatar name={emp ? `${emp.first_name} ${emp.last_name}` : null} src={emp?.profile_photo_url ?? undefined} size="md" />
                  <div>
                    <p className="font-medium">{fullName}</p>
                    <p className="text-sm text-muted-foreground">{viewItem.period} · {format(new Date(viewItem.evaluation_date), "dd MMM yyyy", { locale: es })}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">Puntualidad</p><ScoreStars score={viewItem.punctuality_score} /></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">Calidad</p><ScoreStars score={viewItem.quality_score} /></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">Trabajo en Equipo</p><ScoreStars score={viewItem.teamwork_score} /></div>
                  <div className="space-y-1"><p className="text-xs text-muted-foreground">Iniciativa</p><ScoreStars score={viewItem.initiative_score} /></div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Score General</p>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">{viewItem.overall_score?.toFixed(1) ?? "—"}</span>
                    <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                  </div>
                </div>
                {viewItem.strengths && <div className="space-y-1"><p className="text-xs font-medium text-muted-foreground">Fortalezas</p><p className="text-sm">{viewItem.strengths}</p></div>}
                {viewItem.areas_for_improvement && <div className="space-y-1"><p className="text-xs font-medium text-muted-foreground">Áreas de Mejora</p><p className="text-sm">{viewItem.areas_for_improvement}</p></div>}
                {viewItem.goals_next_period && <div className="space-y-1"><p className="text-xs font-medium text-muted-foreground">Objetivos Próximo Período</p><p className="text-sm">{viewItem.goals_next_period}</p></div>}
                {viewItem.comments && <div className="space-y-1"><p className="text-xs font-medium text-muted-foreground">Comentarios</p><p className="text-sm">{viewItem.comments}</p></div>}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Delete AlertDialog ────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar evaluación?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer. La evaluación será eliminada permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          switch (kpiPopup) {
            case "avg": return `Calificación Promedio — ${avgScore ? avgScore.toFixed(1) : "—"}`;
            case "total": return `Total Evaluaciones — ${evals.length}`;
            case "completed": return `Completadas — ${completedCount}`;
            case "withGoals": return `Con Objetivos — ${withGoals}`;
            default: return "";
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = evals;
          if (kpiPopup === "completed") list = evals.filter((e: any) => e.status === "completed");
          else if (kpiPopup === "withGoals") list = evals.filter((e: any) => e.goals_next_period);
          return list.slice(0, 100).map((e: any): KpiRow => ({
            primary: e.employee_name ?? `Empleado ${e.employee_id?.slice?.(0, 8) ?? "—"}`,
            secondary: e.period ?? e.review_date ? format(new Date(e.review_date), "dd MMM yyyy") : undefined,
            right: e.overall_score ? `${e.overall_score}/5` : e.status ?? "—",
            rightTone: e.status === "completed" ? "success" : "default",
          }));
        })()}
      />
    </div>
  );
}
