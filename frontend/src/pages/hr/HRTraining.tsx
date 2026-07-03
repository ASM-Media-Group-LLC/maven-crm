import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  GraduationCap, Plus, Settings, ArrowLeft, Search, BookOpen,
  Pencil, Trash2, Eye, Clock, CheckCircle, AlertTriangle, X, List,
  LayoutList, LayoutGrid, CalendarDays, ClipboardList, ArrowRight,
  MessageSquare, Monitor, Upload, Video, FileText, HelpCircle, Wrench,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { EmployeeSearchCombobox } from "@/components/hr/EmployeeSearchCombobox";
import { HRMetricCard } from "@/components/hr/HRMetricCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, parseISO, isSameDay, addMonths, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { TRAINING_STATUSES, TRAINING_TARGET_ROLES, TRAINING_MODALITIES, TRAINING_CONTENT_TYPES } from "@/lib/hrConstants";

// ── Data hooks ──
function useTrainingAssignments() {
  return useQuery({
    queryKey: ["training-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_training_assignments")
        .select("*, employees(first_name, last_name, profile_photo_url, department_id, departments:department_id(name)), training_programs(id, name, duration_hours, modality, target_role, is_mandatory)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

function useAllPrograms() {
  return useQuery({
    queryKey: ["training-programs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("training_programs").select("*").eq("is_active", true).order("name");
      if (error) throw error;
      return data || [];
    },
  });
}

function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data || [];
    },
  });
}

function useModuleProgress(assignmentIds: string[]) {
  return useQuery({
    queryKey: ["module-progress", assignmentIds],
    queryFn: async () => {
      if (assignmentIds.length === 0) return {};
      const { data, error } = await supabase
        .from("training_module_progress")
        .select("assignment_id, status")
        .in("assignment_id", assignmentIds);
      if (error) throw error;
      const map: Record<string, { completed: number; total: number }> = {};
      (data || []).forEach((row: any) => {
        if (!map[row.assignment_id]) map[row.assignment_id] = { completed: 0, total: 0 };
        map[row.assignment_id].total++;
        if (row.status === "completed") map[row.assignment_id].completed++;
      });
      return map;
    },
    enabled: assignmentIds.length > 0,
  });
}

function useAssignmentModuleProgress(assignmentId: string) {
  return useQuery({
    queryKey: ["assignment-module-progress", assignmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_module_progress")
        .select("*")
        .eq("assignment_id", assignmentId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!assignmentId,
  });
}

function useTrainingModules(programId: string | null) {
  return useQuery({
    queryKey: ["training-modules", programId],
    queryFn: async () => {
      if (!programId) return [];
      const { data, error } = await supabase
        .from("training_modules")
        .select("*")
        .eq("training_program_id", programId)
        .order("position");
      if (error) throw error;
      return data || [];
    },
    enabled: !!programId,
  });
}

// ── Helpers ──
function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "failed" || status === "cancelled") return "destructive";
  return "secondary";
}

function calcProgress(assignment: any, progressMap: Record<string, { completed: number; total: number }>, moduleCounts: Record<string, number>) {
  const pm = progressMap[assignment.id];
  const totalModules = moduleCounts[assignment.training_programs?.id] ?? 0;
  if (totalModules === 0) {
    const statusMap: Record<string, number> = { assigned: 0, in_progress: 50, completed: 100, failed: 100, cancelled: 0 };
    return statusMap[assignment.status] ?? 0;
  }
  const completed = pm?.completed ?? 0;
  return Math.round((completed / totalModules) * 100);
}

function isExpiringSoon(assignment: any): boolean {
  if (!assignment.completion_date || assignment.status === "completed") return false;
  const diff = new Date(assignment.completion_date).getTime() - Date.now();
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
}

function getRoleBadgeClass(role: string) {
  if (role === "chatter") return "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30";
  if (role === "technology") return "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30";
  return "bg-muted text-muted-foreground";
}

const CONTENT_TYPE_ICONS: Record<string, typeof Video> = { video: Video, documento: FileText, quiz: HelpCircle, practica: Wrench };
function getContentIcon(type: string) { return CONTENT_TYPE_ICONS[type] || FileText; }

// ══════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════
type ViewState = "list" | "assign" | "config" | "modules" | "detail";

export default function HRTraining() {
  const [currentView, setCurrentView] = useState<ViewState>("list");
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [selectedProgram, setSelectedProgram] = useState<any>(null);

  if (currentView === "assign") return <AssignTrainingView onBack={() => setCurrentView("list")} />;
  if (currentView === "config") return (
    <GeneralProgramConfigView
      onBack={() => setCurrentView("list")}
      onManageModules={(p: any) => { setSelectedProgram(p); setCurrentView("modules"); }}
    />
  );
  if (currentView === "modules" && selectedProgram) return (
    <GeneralModuleManagementView program={selectedProgram} onBack={() => setCurrentView("config")} />
  );
  if (currentView === "detail" && selectedAssignment) return (
    <AssignmentDetailView assignment={selectedAssignment} onBack={() => setCurrentView("list")} />
  );

  return (
    <TrainingDashboard
      onAssign={() => setCurrentView("assign")}
      onConfig={() => setCurrentView("config")}
      onViewDetail={(a: any) => { setSelectedAssignment(a); setCurrentView("detail"); }}
      onViewProgram={(p: any) => { setSelectedProgram(p); setCurrentView("modules"); }}
    />
  );
}

// ══════════════════════════════════════════════
// DASHBOARD (main list view with nav cards + active programs)
// ══════════════════════════════════════════════
function TrainingDashboard({ onAssign, onConfig, onViewDetail, onViewProgram }: {
  onAssign: () => void; onConfig: () => void; onViewDetail: (a: any) => void; onViewProgram: (p: any) => void;
}) {
  const navigate = useNavigate();
  const { data: assignments = [], isLoading } = useTrainingAssignments();
  const { data: allPrograms = [] } = useAllPrograms();
  const { data: departments = [] } = useDepartments();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [viewMode, setViewMode] = useState<"list" | "grid" | "calendar">("list");

  // Module counts per program (for assignments progress)
  const programIds = useMemo(() => [...new Set(assignments.map((a: any) => a.training_programs?.id).filter(Boolean))], [assignments]);
  const { data: allModuleCounts = {} } = useQuery({
    queryKey: ["module-counts", programIds],
    queryFn: async () => {
      if (programIds.length === 0) return {};
      const { data, error } = await supabase
        .from("training_modules")
        .select("training_program_id")
        .in("training_program_id", programIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((m: any) => { counts[m.training_program_id] = (counts[m.training_program_id] || 0) + 1; });
      return counts;
    },
    enabled: programIds.length > 0,
  });

  // Module detail counts for program cards (content indicator)
  const allProgramIds = useMemo(() => allPrograms.map((p: any) => p.id), [allPrograms]);
  const { data: programModuleCounts = {} } = useQuery({
    queryKey: ["program-module-detail-counts", allProgramIds],
    queryFn: async () => {
      if (allProgramIds.length === 0) return {};
      const { data, error } = await supabase
        .from("training_modules")
        .select("training_program_id, content_url")
        .in("training_program_id", allProgramIds);
      if (error) throw error;
      const map: Record<string, { total: number; withContent: number }> = {};
      (data || []).forEach((m: any) => {
        if (!map[m.training_program_id]) map[m.training_program_id] = { total: 0, withContent: 0 };
        map[m.training_program_id].total++;
        if (m.content_url) map[m.training_program_id].withContent++;
      });
      return map;
    },
    enabled: allProgramIds.length > 0,
  });

  const assignmentIds = useMemo(() => assignments.map((a: any) => a.id), [assignments]);
  const { data: progressMap = {} } = useModuleProgress(assignmentIds);

  const filteredAssignments = useMemo(() => {
    let filtered = assignments;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((a: any) => {
        const emp = a.employees;
        const prog = a.training_programs;
        return (emp && `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(q)) ||
          (prog?.name?.toLowerCase().includes(q));
      });
    }
    if (statusFilter && statusFilter !== "__all__") filtered = filtered.filter((a) => a.status === statusFilter);
    if (departmentFilter && departmentFilter !== "__all__") filtered = filtered.filter((a: any) => a.employees?.department_id === departmentFilter);
    if (dateFrom) {
      filtered = filtered.filter((a: any) => {
        if (!a.start_date) return false;
        const d = new Date(a.start_date);
        if (dateTo) return d >= dateFrom && d <= dateTo;
        return d >= dateFrom;
      });
    }
    return filtered;
  }, [assignments, search, statusFilter, departmentFilter, dateFrom, dateTo]);

  const kpis = useMemo(() => ({
    total: assignments.length,
    inProgress: assignments.filter((a) => a.status === "in_progress").length,
    completed: assignments.filter((a) => a.status === "completed").length,
    overdue: assignments.filter((a) => {
      if (!a.completion_date || a.status === "completed") return false;
      return new Date(a.completion_date) < new Date();
    }).length,
  }), [assignments]);

  const handleKpiClick = (status: string) => {
    setStatusFilter((prev) => prev === status ? "" : status);
  };

  // Calendar state
  const [calMonth, setCalMonth] = useState(new Date());
  const calStart = startOfMonth(calMonth);
  const calEnd = endOfMonth(calMonth);
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  function getAssignmentsForDay(day: Date) {
    return filteredAssignments.filter((a: any) => {
      try {
        const start = a.start_date ? parseISO(a.start_date) : null;
        const end = a.completion_date ? parseISO(a.completion_date) : null;
        if (start && end) return isWithinInterval(day, { start, end }) || isSameDay(day, start) || isSameDay(day, end);
        if (start) return isSameDay(day, start);
        return false;
      } catch { return false; }
    });
  }

  const dayLabels = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 bg-background border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Capacitación</h1>
            <p className="text-sm text-muted-foreground">Programas de entrenamiento y seguimiento de asignaciones</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onConfig}><Settings className="h-4 w-4 mr-1.5" />Configuración</Button>
            <Button onClick={onAssign}><Plus className="h-4 w-4 mr-1.5" />Asignar Capacitación</Button>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        <div className="px-6 py-5 space-y-5">
          {/* KPIs - clickeable */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={cn("cursor-pointer rounded-lg transition-all", statusFilter === "" && "ring-0")} onClick={() => handleKpiClick("")}>
              <HRMetricCard title="Total Asignadas" value={kpis.total} icon={ClipboardList} color="primary" className={statusFilter === "" ? "ring-2 ring-primary/50" : ""} />
            </div>
            <div className="cursor-pointer" onClick={() => handleKpiClick("in_progress")}>
              <HRMetricCard title="En Progreso" value={kpis.inProgress} icon={Clock} color="warning" className={statusFilter === "in_progress" ? "ring-2 ring-warning/50" : ""} />
            </div>
            <div className="cursor-pointer" onClick={() => handleKpiClick("completed")}>
              <HRMetricCard title="Completadas" value={kpis.completed} icon={CheckCircle} color="success" className={statusFilter === "completed" ? "ring-2 ring-success/50" : ""} />
            </div>
            <div className="cursor-pointer" onClick={() => handleKpiClick("overdue")}>
              <HRMetricCard title="Vencidas" value={kpis.overdue} icon={AlertTriangle} color="destructive" className={statusFilter === "overdue" ? "ring-2 ring-destructive/50" : ""} />
            </div>
          </div>

          {/* Navigation Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/hr/capacitacion/chatters")}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-violet-500/10"><MessageSquare className="h-5 w-5 text-violet-600" /></div>
                  <div>
                    <p className="font-medium">Capacitación Chatters</p>
                    <p className="text-xs text-muted-foreground">Programas, contenidos y seguimiento para chatters</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/hr/capacitacion/tecnologia")}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/10"><Monitor className="h-5 w-5 text-cyan-600" /></div>
                  <div>
                    <p className="font-medium">Capacitación Tecnología</p>
                    <p className="text-xs text-muted-foreground">Programas, contenidos y seguimiento del equipo tech</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </div>

          {/* Active Programs Section */}
          {allPrograms.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-base font-semibold">Programas Activos</h3>
                  <Badge variant="outline" className="ml-1">{allPrograms.length}</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={onConfig}>Ver todos →</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {allPrograms.slice(0, 8).map((p: any) => {
                  const mc = programModuleCounts[p.id];
                  const roleLabel = TRAINING_TARGET_ROLES.find((r) => r.value === p.target_role)?.label || "General";
                  return (
                    <Card key={p.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => onViewProgram(p)}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold line-clamp-1">{p.name}</p>
                          <Badge variant="outline" className={cn("shrink-0 text-xs", getRoleBadgeClass(p.target_role))}>{roleLabel}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {p.duration_hours && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{p.duration_hours}h</span>}
                          <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{mc ? mc.total : 0} módulos</span>
                        </div>
                        {mc && mc.total > 0 && (
                          <div className="flex items-center gap-2">
                            <Progress value={(mc.withContent / mc.total) * 100} className="h-1 flex-1" />
                            <span className={cn("text-xs", mc.withContent === mc.total ? "text-success" : "text-warning")}>
                              {mc.withContent}/{mc.total}
                            </span>
                          </div>
                        )}
                        {p.is_mandatory && <Badge variant="default" className="text-xs">Obligatorio</Badge>}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar empleado o programa..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos los estados</SelectItem>
                {TRAINING_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={departmentFilter || undefined} onValueChange={(v) => setDepartmentFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Departamento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos los departamentos</SelectItem>
                {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <DateRangePicker
              from={dateFrom}
              to={dateTo}
              onApply={(f, t) => { setDateFrom(f); setDateTo(t); }}
              placeholder="Selecciona fechas"
            />
            <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 ml-auto">
              <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("list")}><LayoutList className="h-4 w-4" /></Button>
              <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
              <Button variant={viewMode === "calendar" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("calendar")}><CalendarDays className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* Table / Grid / Calendar */}
          {viewMode === "list" ? (
            <AssignmentsTable assignments={filteredAssignments} isLoading={isLoading} progressMap={progressMap} moduleCounts={allModuleCounts} onViewDetail={onViewDetail} />
          ) : viewMode === "grid" ? (
            <AssignmentsGrid assignments={filteredAssignments} isLoading={isLoading} progressMap={progressMap} moduleCounts={allModuleCounts} onViewDetail={onViewDetail} />
          ) : (
            /* Calendar view */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={() => setCalMonth((m) => subMonths(m, 1))}>← Anterior</Button>
                <h3 className="text-sm font-semibold capitalize">{format(calMonth, "MMMM yyyy", { locale: es })}</h3>
                <Button variant="outline" size="sm" onClick={() => setCalMonth((m) => addMonths(m, 1))}>Siguiente →</Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-7">
                  {dayLabels.map((d) => (
                    <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground border-b bg-muted/30">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {/* Offset for first day */}
                  {Array.from({ length: (calDays[0]?.getDay() || 7) - 1 }).map((_, i) => (
                    <div key={`empty-${i}`} className="min-h-[80px] border-b border-r bg-muted/10" />
                  ))}
                  {calDays.map((day) => {
                    const dayAssignments = getAssignmentsForDay(day);
                    const isToday = isSameDay(day, new Date());
                    return (
                      <div key={day.toISOString()} className={cn("min-h-[80px] border-b border-r p-1", isToday && "bg-primary/5")}>
                        <p className={cn("text-xs font-medium mb-1", isToday ? "text-primary font-bold" : "text-muted-foreground")}>{format(day, "d")}</p>
                        <div className="space-y-0.5">
                          {dayAssignments.slice(0, 3).map((a: any) => (
                            <div
                              key={a.id}
                              className={cn(
                                "text-[10px] px-1 py-0.5 rounded truncate cursor-pointer",
                                a.status === "completed" ? "bg-success/15 text-success dark:text-success" :
                                a.status === "in_progress" ? "bg-warning/15 text-warning dark:text-warning" :
                                "bg-primary/10 text-primary"
                              )}
                              onClick={() => onViewDetail(a)}
                            >
                              {a.employees ? `${a.employees.first_name?.[0]}. ${a.employees.last_name}` : "—"}
                            </div>
                          ))}
                          {dayAssignments.length > 3 && (
                            <p className="text-[10px] text-muted-foreground">+{dayAssignments.length - 3} más</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Assignments Table ──
function AssignmentsTable({ assignments, isLoading, progressMap, moduleCounts, onViewDetail }: {
  assignments: any[];
  isLoading: boolean;
  progressMap: Record<string, { completed: number; total: number }>;
  moduleCounts: Record<string, number>;
  onViewDetail: (a: any) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employee_training_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-assignments"] }); toast({ title: "Asignación eliminada" }); setDeleteId(null); },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empleado</TableHead>
              <TableHead>Programa</TableHead>
              <TableHead>Fecha Inicio</TableHead>
              <TableHead>Fecha Límite</TableHead>
              <TableHead>Progreso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5" /></TableCell>)}</TableRow>
              ))
            ) : assignments.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">Sin capacitaciones asignadas</TableCell></TableRow>
            ) : (
              assignments.map((a: any) => {
                const emp = a.employees;
                const prog = a.training_programs;
                const progress = calcProgress(a, progressMap, moduleCounts);
                const expiring = isExpiringSoon(a);
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={emp?.profile_photo_url} />
                          <AvatarFallback className="text-xs">{emp ? `${emp.first_name?.[0]}${emp.last_name?.[0]}` : "?"}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</p>
                          <p className="text-xs text-muted-foreground">{emp?.departments?.name || "—"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{prog?.name || "—"}</TableCell>
                    <TableCell className="text-sm">{a.start_date ? new Date(a.start_date).toLocaleDateString("es-CO") : "—"}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1.5">
                        {a.completion_date ? new Date(a.completion_date).toLocaleDateString("es-CO") : "—"}
                        {expiring && <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30">Por vencer</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="w-32">
                      <div className="flex items-center gap-2">
                        <Progress value={progress} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground w-8">{progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(a.status)}>
                        {TRAINING_STATUSES.find((s) => s.value === a.status)?.label ?? a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onViewDetail(a)}><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(a.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar asignación?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Assignments Grid ──
function AssignmentsGrid({ assignments, isLoading, progressMap, moduleCounts, onViewDetail }: {
  assignments: any[];
  isLoading: boolean;
  progressMap: Record<string, { completed: number; total: number }>;
  moduleCounts: Record<string, number>;
  onViewDetail: (a: any) => void;
}) {
  if (isLoading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
    </div>
  );
  if (assignments.length === 0) return <p className="text-center text-muted-foreground py-10">Sin capacitaciones asignadas</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {assignments.map((a: any) => {
        const emp = a.employees;
        const prog = a.training_programs;
        const progress = calcProgress(a, progressMap, moduleCounts);
        const expiring = isExpiringSoon(a);
        return (
          <Card key={a.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => onViewDetail(a)}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={emp?.profile_photo_url} />
                  <AvatarFallback className="text-xs">{emp ? `${emp.first_name?.[0]}${emp.last_name?.[0]}` : "?"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</p>
                  <p className="text-xs text-muted-foreground">{emp?.departments?.name || "—"}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {expiring && <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30">Por vencer</Badge>}
                  <Badge variant={getStatusBadgeVariant(a.status)}>
                    {TRAINING_STATUSES.find((s) => s.value === a.status)?.label ?? a.status}
                  </Badge>
                </div>
              </div>
              <p className="text-sm font-medium">{prog?.name || "—"}</p>
              <div className="flex items-center gap-2">
                <Progress value={progress} className="h-1.5 flex-1" />
                <span className="text-xs text-muted-foreground">{progress}%</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════
// ASSIGNMENT DETAIL VIEW (full screen)
// ══════════════════════════════════════════════
function AssignmentDetailView({ assignment, onBack }: { assignment: any; onBack: () => void }) {
  const emp = assignment.employees;
  const prog = assignment.training_programs;
  const { data: modules = [], isLoading: modulesLoading } = useTrainingModules(prog?.id || null);
  const { data: moduleProgress = [], isLoading: progressLoading } = useAssignmentModuleProgress(assignment.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const progressByModule = useMemo(() => {
    const map: Record<string, any> = {};
    moduleProgress.forEach((mp: any) => { map[mp.module_id] = mp; });
    return map;
  }, [moduleProgress]);

  const completedCount = moduleProgress.filter((mp: any) => mp.status === "completed").length;
  const totalModules = modules.length;
  const progressPercent = totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0;

  const toggleModuleMutation = useMutation({
    mutationFn: async ({ moduleId, currentStatus }: { moduleId: string; currentStatus: string | null }) => {
      const newStatus = currentStatus === "completed" ? "pending" : "completed";
      const existing = progressByModule[moduleId];

      if (existing) {
        const { error } = await supabase.from("training_module_progress").update({
          status: newStatus,
          completed_at: newStatus === "completed" ? new Date().toISOString() : null,
        }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("training_module_progress").insert({
          assignment_id: assignment.id,
          module_id: moduleId,
          status: newStatus,
          completed_at: newStatus === "completed" ? new Date().toISOString() : null,
        });
        if (error) throw error;
      }

      const requiredModules = modules.filter((m: any) => m.is_required);
      const willBeCompleted = requiredModules.every((m: any) => {
        if (m.id === moduleId) return newStatus === "completed";
        return progressByModule[m.id]?.status === "completed";
      });

      if (willBeCompleted && requiredModules.length > 0 && newStatus === "completed") {
        await supabase.from("employee_training_assignments").update({
          status: "completed",
          completion_date: new Date().toISOString().split("T")[0],
        }).eq("id", assignment.id);
      } else if (newStatus === "pending" && assignment.status === "completed") {
        await supabase.from("employee_training_assignments").update({
          status: "in_progress",
          completion_date: null,
        }).eq("id", assignment.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignment-module-progress", assignment.id] });
      queryClient.invalidateQueries({ queryKey: ["training-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["module-progress"] });
    },
    onError: () => toast({ title: "Error al actualizar progreso", variant: "destructive" }),
  });

  const isLoading = modulesLoading || progressLoading;

  const CONTENT_ICONS: Record<string, any> = {
    video: () => <span>🎬</span>, documento: () => <span>📄</span>, quiz: () => <span>❓</span>, practica: () => <span>🔧</span>,
  };
  const getIcon = (type: string) => CONTENT_ICONS[type] || CONTENT_ICONS["documento"];

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 bg-background border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</h1>
              <Badge variant={getStatusBadgeVariant(assignment.status)}>
                {TRAINING_STATUSES.find((s) => s.value === assignment.status)?.label ?? assignment.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{prog?.name || "—"}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-6 py-5 space-y-6">
          {/* Info cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Fecha Inicio</p>
              <p className="text-sm font-medium">{assignment.start_date ? new Date(assignment.start_date).toLocaleDateString("es-CO") : "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Fecha Límite</p>
              <p className="text-sm font-medium">{assignment.completion_date ? new Date(assignment.completion_date).toLocaleDateString("es-CO") : "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Departamento</p>
              <p className="text-sm font-medium">{emp?.departments?.name || "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Rol del Programa</p>
              <p className="text-sm font-medium">{TRAINING_TARGET_ROLES.find((r) => r.value === prog?.target_role)?.label || "General"}</p>
            </div>
          </div>

          {assignment.notes && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Notas</p>
              <p className="text-sm">{assignment.notes}</p>
            </div>
          )}

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Progreso General</p>
              <span className="text-sm font-semibold">{completedCount}/{totalModules} módulos · {progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2.5" />
          </div>

          {/* Module list */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Módulos del Programa</h3>
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
            ) : modules.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Este programa no tiene módulos configurados.</p>
            ) : (
              <div className="border rounded-lg divide-y">
                {modules.map((m: any, idx: number) => {
                  const mp = progressByModule[m.id];
                  const isCompleted = mp?.status === "completed";
                  const ContentIcon = getIcon(m.content_type);
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                      <Checkbox
                        checked={isCompleted}
                        onCheckedChange={() => toggleModuleMutation.mutate({ moduleId: m.id, currentStatus: mp?.status || null })}
                        disabled={toggleModuleMutation.isPending}
                      />
                      <span className="text-xs text-muted-foreground font-mono w-6">{idx + 1}</span>
                      <ContentIcon />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${isCompleted ? "line-through text-muted-foreground" : ""}`}>{m.title}</p>
                        {m.description && <p className="text-xs text-muted-foreground truncate">{m.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {m.duration_minutes && <span className="text-xs text-muted-foreground">{m.duration_minutes} min</span>}
                        {m.is_required && <Badge variant="outline" className="text-xs">Req.</Badge>}
                        {m.content_url && (
                          <a href={m.content_url} target="_blank" rel="noreferrer">
                            <Button variant="ghost" size="icon" className="h-7 w-7"><Eye className="h-3.5 w-3.5" /></Button>
                          </a>
                        )}
                        {isCompleted && mp?.completed_at && (
                          <span className="text-xs text-muted-foreground">{new Date(mp.completed_at).toLocaleDateString("es-CO")}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// ASSIGN TRAINING VIEW (full screen)
// ══════════════════════════════════════════════
function AssignTrainingView({ onBack }: { onBack: () => void }) {
  const { data: programs = [] } = useAllPrograms();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ employee_id: "", training_program_id: "", start_date: "", supervisor_id: "", notes: "" });

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("employee_training_assignments").insert({
        employee_id: form.employee_id,
        training_program_id: form.training_program_id,
        start_date: form.start_date || null,
        assigned_by: form.supervisor_id || user?.id,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-assignments"] }); toast({ title: "Capacitación asignada" }); onBack(); },
    onError: () => toast({ title: "Error al asignar", variant: "destructive" }),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 bg-background border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-xl font-semibold">Asignar Capacitación</h1>
            <p className="text-sm text-muted-foreground">Asigna un programa de entrenamiento a un empleado</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="px-6 py-6 space-y-5">
          <div className="space-y-1.5">
            <Label>Empleado <span className="text-destructive">*</span></Label>
            <EmployeeSearchCombobox value={form.employee_id || null} onChange={(v) => setForm((f) => ({ ...f, employee_id: v ?? "" }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Programa de Capacitación <span className="text-destructive">*</span></Label>
            <Select value={form.training_program_id} onValueChange={(v) => setForm((f) => ({ ...f, training_program_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Seleccionar programa..." /></SelectTrigger>
              <SelectContent>{programs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fecha de Inicio</Label>
            <DateInput value={form.start_date} onChange={(v) => setForm((f) => ({ ...f, start_date: v }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Supervisor (opcional)</Label>
            <EmployeeSearchCombobox value={form.supervisor_id || null} onChange={(v) => setForm((f) => ({ ...f, supervisor_id: v ?? "" }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Notas adicionales</Label>
            <Textarea placeholder="Notas o instrucciones..." rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onBack}>Cancelar</Button>
            <Button onClick={() => mutation.mutate()} disabled={!form.employee_id || !form.training_program_id || mutation.isPending}>
              {mutation.isPending ? "Asignando..." : "Asignar Capacitación"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// GENERAL PROGRAM CONFIG VIEW (all roles)
// ══════════════════════════════════════════════
function GeneralProgramConfigView({ onBack, onManageModules }: {
  onBack: () => void; onManageModules: (p: any) => void;
}) {
  const { data: programs = [], isLoading } = useAllPrograms();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editProgram, setEditProgram] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState("");
  const [modalityFilter, setModalityFilter] = useState("");
  const [configView, setConfigView] = useState<"list" | "grid">("grid");
  const [form, setForm] = useState({ name: "", description: "", duration_hours: "", modality: "presencial", provider: "", is_mandatory: false, target_role: "general" });

  const resetForm = () => setForm({ name: "", description: "", duration_hours: "", modality: "presencial", provider: "", is_mandatory: false, target_role: "general" });

  // Module counts for content indicator
  const allProgramIds = useMemo(() => programs.map((p: any) => p.id), [programs]);
  const { data: programModuleCounts = {} } = useQuery({
    queryKey: ["program-module-detail-counts", allProgramIds],
    queryFn: async () => {
      if (allProgramIds.length === 0) return {};
      const { data, error } = await supabase
        .from("training_modules")
        .select("training_program_id, content_url")
        .in("training_program_id", allProgramIds);
      if (error) throw error;
      const map: Record<string, { total: number; withContent: number }> = {};
      (data || []).forEach((m: any) => {
        if (!map[m.training_program_id]) map[m.training_program_id] = { total: 0, withContent: 0 };
        map[m.training_program_id].total++;
        if (m.content_url) map[m.training_program_id].withContent++;
      });
      return map;
    },
    enabled: allProgramIds.length > 0,
  });

  const hasActiveFilters = !!(search || roleFilter || modalityFilter);
  const clearFilters = () => { setSearch(""); setRoleFilter(""); setModalityFilter(""); };

  const filtered = useMemo(() => {
    let result = programs;
    if (search) { const q = search.toLowerCase(); result = result.filter((p: any) => p.name.toLowerCase().includes(q)); }
    if (roleFilter && roleFilter !== "__all__") result = result.filter((p: any) => p.target_role === roleFilter);
    if (modalityFilter && modalityFilter !== "__all__") result = result.filter((p: any) => p.modality === modalityFilter);
    return result;
  }, [programs, search, roleFilter, modalityFilter]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("training_programs").insert({
        name: form.name, description: form.description || null,
        duration_hours: form.duration_hours ? parseFloat(form.duration_hours) : null,
        modality: form.modality, provider: form.provider || null,
        is_mandatory: form.is_mandatory, target_role: form.target_role, created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-programs"] }); toast({ title: "Programa creado" }); setShowNew(false); resetForm(); },
    onError: () => toast({ title: "Error al crear", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editProgram) return;
      const { error } = await supabase.from("training_programs").update({
        name: form.name, description: form.description || null,
        duration_hours: form.duration_hours ? parseFloat(form.duration_hours) : null,
        modality: form.modality, provider: form.provider || null, is_mandatory: form.is_mandatory,
        target_role: form.target_role,
      }).eq("id", editProgram.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-programs"] }); toast({ title: "Programa actualizado" }); setEditProgram(null); resetForm(); },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("training_programs").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-programs"] }); toast({ title: "Programa eliminado" }); setDeleteId(null); },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  const openEdit = (p: any) => {
    setForm({ name: p.name, description: p.description || "", duration_hours: p.duration_hours?.toString() || "", modality: p.modality || "presencial", provider: p.provider || "", is_mandatory: p.is_mandatory || false, target_role: p.target_role || "general" });
    setEditProgram(p);
  };

  const isFormDialog = showNew || !!editProgram;
  const isEditing = !!editProgram;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 bg-background border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
            <div>
              <h1 className="text-xl font-semibold">Configuración de Programas</h1>
              <p className="text-sm text-muted-foreground">Gestiona todos los programas y módulos de capacitación</p>
            </div>
          </div>
          <Button onClick={() => { resetForm(); setShowNew(true); }}><Plus className="h-4 w-4 mr-1.5" />Nuevo Programa</Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="px-6 py-5 space-y-5">
          {/* Filters bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar programa..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={roleFilter || undefined} onValueChange={(v) => setRoleFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Rol" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {TRAINING_TARGET_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={modalityFilter || undefined} onValueChange={(v) => setModalityFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Modalidad" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {TRAINING_MODALITIES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-1.5 h-4 w-4" />Limpiar filtros
              </Button>
            )}
            <div className="ml-auto flex gap-1">
              <Button variant={configView === "list" ? "secondary" : "ghost"} size="icon" onClick={() => setConfigView("list")}><List className="h-4 w-4" /></Button>
              <Button variant={configView === "grid" ? "secondary" : "ghost"} size="icon" onClick={() => setConfigView("grid")}><LayoutGrid className="h-4 w-4" /></Button>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">No hay programas configurados</p>
          ) : configView === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((p: any) => {
                const mc = programModuleCounts[p.id];
                const roleLabel = TRAINING_TARGET_ROLES.find((r) => r.value === p.target_role)?.label || "General";
                return (
                  <Card key={p.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold">{p.name}</p>
                        <Badge variant="outline" className={cn("shrink-0 text-xs", getRoleBadgeClass(p.target_role))}>{roleLabel}</Badge>
                      </div>
                      {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {p.duration_hours && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{p.duration_hours}h</span>}
                        <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{mc ? mc.total : 0} módulos</span>
                        {mc && mc.total > 0 && (
                          <span className={cn("text-xs", mc.withContent === mc.total ? "text-success" : "text-warning")}>
                            {mc.withContent}/{mc.total} con contenido
                          </span>
                        )}
                      </div>
                      {p.is_mandatory && <Badge variant="default" className="text-xs">Obligatorio</Badge>}
                      <div className="flex items-center gap-1 pt-1">
                        <Button variant="outline" size="sm" onClick={() => onManageModules(p)}><BookOpen className="h-3.5 w-3.5 mr-1" />Módulos</Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Rol Target</TableHead>
                    <TableHead>Modalidad</TableHead>
                    <TableHead>Duración</TableHead>
                    <TableHead>Módulos</TableHead>
                    <TableHead>Obligatorio</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p: any) => {
                    const mc = programModuleCounts[p.id];
                    const roleLabel = TRAINING_TARGET_ROLES.find((r) => r.value === p.target_role)?.label || "General";
                    const modalityLabel = TRAINING_MODALITIES.find((m) => m.value === p.modality)?.label || p.modality || "—";
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell><Badge variant="outline" className={cn("text-xs", getRoleBadgeClass(p.target_role))}>{roleLabel}</Badge></TableCell>
                        <TableCell className="text-sm">{modalityLabel}</TableCell>
                        <TableCell className="text-sm">{p.duration_hours ? `${p.duration_hours}h` : "—"}</TableCell>
                        <TableCell>
                          <span className="text-sm">{mc ? mc.total : 0}</span>
                          {mc && mc.total > 0 && (
                            <span className={cn("ml-1.5 text-xs", mc.withContent === mc.total ? "text-success" : "text-warning")}>
                              ({mc.withContent}/{mc.total})
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{p.is_mandatory ? <Badge variant="default" className="text-xs">Sí</Badge> : <span className="text-muted-foreground text-sm">No</span>}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="outline" size="sm" onClick={() => onManageModules(p)}><BookOpen className="h-3.5 w-3.5 mr-1" />Módulos</Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={isFormDialog} onOpenChange={(o) => { if (!o) { setShowNew(false); setEditProgram(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isEditing ? "Editar Programa" : "Nuevo Programa de Capacitación"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre <span className="text-destructive">*</span></Label>
              <Input placeholder="Nombre del programa" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Rol Target <span className="text-destructive">*</span></Label>
              <Select value={form.target_role} onValueChange={(v) => setForm((f) => ({ ...f, target_role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TRAINING_TARGET_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Modalidad</Label>
                <Select value={form.modality} onValueChange={(v) => setForm((f) => ({ ...f, modality: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TRAINING_MODALITIES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Duración (horas)</Label>
                <Input type="number" placeholder="8" value={form.duration_hours} onChange={(e) => setForm((f) => ({ ...f, duration_hours: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Proveedor</Label>
              <Input placeholder="Proveedor" value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea placeholder="Describe el programa..." rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="mandatory-general" checked={form.is_mandatory} onChange={(e) => setForm((f) => ({ ...f, is_mandatory: e.target.checked }))} className="rounded border-border" />
              <Label htmlFor="mandatory-general">Programa obligatorio</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNew(false); setEditProgram(null); resetForm(); }}>Cancelar</Button>
            <Button onClick={() => isEditing ? updateMutation.mutate() : createMutation.mutate()} disabled={!form.name || createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? "Guardando..." : isEditing ? "Guardar" : "Crear Programa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar programa?</AlertDialogTitle><AlertDialogDescription>El programa se desactivará.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ══════════════════════════════════════════════
// GENERAL MODULE MANAGEMENT VIEW
// ══════════════════════════════════════════════
function GeneralModuleManagementView({ program, onBack }: { program: any; onBack: () => void }) {
  const { data: modules = [], isLoading } = useTrainingModules(program.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [editModule, setEditModule] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", duration_minutes: "", content_type: "documento", content_url: "", is_required: true });

  const resetForm = () => setForm({ title: "", description: "", duration_minutes: "", content_type: "documento", content_url: "", is_required: true });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("training_modules").insert({
        training_program_id: program.id, title: form.title, description: form.description || null,
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
        content_type: form.content_type, content_url: form.content_url || null, is_required: form.is_required, position: modules.length,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-modules", program.id] }); toast({ title: "Módulo creado" }); setShowNew(false); resetForm(); },
    onError: () => toast({ title: "Error al crear módulo", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editModule) return;
      const { error } = await supabase.from("training_modules").update({
        title: form.title, description: form.description || null,
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
        content_type: form.content_type, content_url: form.content_url || null, is_required: form.is_required,
      }).eq("id", editModule.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-modules", program.id] }); toast({ title: "Módulo actualizado" }); setEditModule(null); resetForm(); },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("training_modules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-modules", program.id] }); toast({ title: "Módulo eliminado" }); setDeleteId(null); },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  const openEdit = (m: any) => {
    setForm({ title: m.title, description: m.description || "", duration_minutes: m.duration_minutes?.toString() || "", content_type: m.content_type || "documento", content_url: m.content_url || "", is_required: m.is_required ?? true });
    setEditModule(m);
  };

  const handleFileUpload = async (moduleId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.doc,.docx,.mp4,.webm,.pptx";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const path = `training-modules/${program.id}/${moduleId}/${file.name}`;
      const { error: uploadError } = await supabase.storage.from("creator-files").upload(path, file, { upsert: true });
      if (uploadError) { toast({ title: "Error al subir archivo", variant: "destructive" }); return; }
      const { data: signedData } = await supabase.storage.from("creator-files").createSignedUrl(path, 86400);
      const { error: updateError } = await supabase.from("training_modules").update({ content_url: signedData?.signedUrl || path }).eq("id", moduleId);
      if (updateError) { toast({ title: "Error al guardar URL", variant: "destructive" }); return; }
      queryClient.invalidateQueries({ queryKey: ["training-modules", program.id] });
      toast({ title: "Contenido subido exitosamente" });
    };
    input.click();
  };

  const isFormDialog = showNew || !!editModule;
  const isEditing = !!editModule;
  const roleLabel = TRAINING_TARGET_ROLES.find((r) => r.value === program.target_role)?.label || "General";

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 bg-background border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold">{program.name}</h1>
                <Badge variant="outline" className={cn("text-xs", getRoleBadgeClass(program.target_role))}>{roleLabel}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Módulos del programa · {modules.length} módulos</p>
            </div>
          </div>
          <Button onClick={() => { resetForm(); setShowNew(true); }}><Plus className="h-4 w-4 mr-1.5" />Nuevo Módulo</Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="px-6 py-5">
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
          ) : modules.length === 0 ? (
            <p className="text-center text-muted-foreground py-10">No hay módulos. Agrega uno para comenzar.</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Duración</TableHead>
                    <TableHead>Contenido</TableHead>
                    <TableHead>Requerido</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modules.map((m: any, idx: number) => {
                    const ContentIcon = getContentIcon(m.content_type);
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm text-muted-foreground font-mono">{idx + 1}</TableCell>
                        <TableCell className="text-sm font-medium">{m.title}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <ContentIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">{TRAINING_CONTENT_TYPES.find((t) => t.value === m.content_type)?.label || m.content_type}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{m.duration_minutes ? `${m.duration_minutes} min` : "—"}</TableCell>
                        <TableCell>
                          {m.content_url ? (
                            <a href={m.content_url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">Ver</a>
                          ) : (
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleFileUpload(m.id)}>
                              <Upload className="h-3.5 w-3.5 mr-1" />Subir
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>{m.is_required ? <Badge variant="default" className="text-xs">Sí</Badge> : <Badge variant="outline" className="text-xs">No</Badge>}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(m.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={isFormDialog} onOpenChange={(o) => { if (!o) { setShowNew(false); setEditModule(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isEditing ? "Editar Módulo" : "Nuevo Módulo"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Título <span className="text-destructive">*</span></Label>
              <Input placeholder="Título del módulo" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo de Contenido</Label>
                <Select value={form.content_type} onValueChange={(v) => setForm((f) => ({ ...f, content_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TRAINING_CONTENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Duración (min)</Label>
                <Input type="number" placeholder="30" value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea placeholder="Descripción del módulo..." rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>URL del contenido (opcional)</Label>
              <Input placeholder="https://..." value={form.content_url} onChange={(e) => setForm((f) => ({ ...f, content_url: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="required-general" checked={form.is_required} onChange={(e) => setForm((f) => ({ ...f, is_required: e.target.checked }))} className="rounded border-border" />
              <Label htmlFor="required-general">Módulo requerido</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNew(false); setEditModule(null); resetForm(); }}>Cancelar</Button>
            <Button onClick={() => isEditing ? updateMutation.mutate() : createMutation.mutate()} disabled={!form.title || createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? "Guardando..." : isEditing ? "Guardar" : "Crear Módulo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar módulo?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
