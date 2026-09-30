import { useState, useMemo } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Settings, Search, BookOpen, Pencil, Trash2, Eye, Upload, X, List,
  Video, FileText, HelpCircle, Wrench, Clock, CheckCircle, AlertTriangle,
  ClipboardList, LayoutList, LayoutGrid, CalendarDays, MessageSquare, Monitor,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFormato } from "@/hooks/useFormato";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/UserAvatar";
import { Checkbox } from "@/components/ui/checkbox";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWithinInterval, parseISO, isSameDay, addMonths, subMonths } from "date-fns";
import { cn } from "@/lib/utils";
import { TRAINING_STATUSES, TRAINING_MODALITIES, TRAINING_TARGET_ROLES, TRAINING_CONTENT_TYPES } from "@/lib/hrConstants";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { etiquetaHr, etiquetaHrO, etiquetaHrV, type Traductor } from "./etiquetasHr";

// ── Data hooks ──
function useRoleAssignments(targetRole: string) {
  return useQuery({
    queryKey: ["training-assignments", targetRole],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_training_assignments")
        .select("*, employees(first_name, last_name, profile_photo_url, department_id, departments:department_id(name)), training_programs!inner(id, name, duration_hours, modality, target_role, is_mandatory)")
        .eq("training_programs.target_role", targetRole)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

function useRolePrograms(targetRole: string) {
  return useQuery({
    queryKey: ["training-programs", targetRole],
    queryFn: async () => {
      const { data, error } = await supabase.from("training_programs").select("*").eq("is_active", true).eq("target_role", targetRole).order("name");
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
  return Math.round(((pm?.completed ?? 0) / totalModules) * 100);
}

function isExpiringSoon(a: any): boolean {
  if (!a.completion_date || a.status === "completed") return false;
  const diff = new Date(a.completion_date).getTime() - Date.now();
  return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
}

const CONTENT_TYPE_ICONS: Record<string, typeof Video> = { video: Video, documento: FileText, quiz: HelpCircle, practica: Wrench };
function getContentIcon(type: string) { return CONTENT_TYPE_ICONS[type] || FileText; }

// El nombre del rol llega por prop desde HRTrainingChatters / HRTrainingTech, en
// español. Para los roles conocidos se usa el del diccionario (en español es el
// mismo texto); para uno nuevo, el de la prop.
const NOMBRE_ROL: Record<string, TranslationKey> = {
  chatter: "hrg.tr.roleName.chatter",
  technology: "hrg.opt.trainRole.technology",
};
const nombreRol = (t: Traductor, targetRole: string, roleLabel: string) =>
  NOMBRE_ROL[targetRole] ? t(NOMBRE_ROL[targetRole]) : roleLabel;

const DIAS_SEMANA: readonly TranslationKey[] = [
  "hrg.day.mon", "hrg.day.tue", "hrg.day.wed", "hrg.day.thu", "hrg.day.fri", "hrg.day.sat", "hrg.day.sun",
];

// ══════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════
type ViewState = "list" | "config" | "modules" | "assign" | "detail";

interface RoleTrainingPageProps {
  targetRole: string;
  roleLabel: string;
}

export default function RoleTrainingPage({ targetRole, roleLabel }: RoleTrainingPageProps) {
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<ViewState>("list");
  const [selectedProgram, setSelectedProgram] = useState<any>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);

  if (currentView === "config") return (
    <ProgramConfigView
      targetRole={targetRole}
      roleLabel={roleLabel}
      onBack={() => setCurrentView("list")}
      onManageModules={(p) => { setSelectedProgram(p); setCurrentView("modules"); }}
    />
  );
  if (currentView === "modules" && selectedProgram) return (
    <ModuleManagementView program={selectedProgram} onBack={() => setCurrentView("config")} />
  );
  if (currentView === "assign") return (
    <AssignTrainingView targetRole={targetRole} roleLabel={roleLabel} onBack={() => setCurrentView("list")} />
  );
  if (currentView === "detail" && selectedAssignment) return (
    <AssignmentDetailView assignment={selectedAssignment} onBack={() => setCurrentView("list")} />
  );

  return (
    <RoleListView
      targetRole={targetRole}
      roleLabel={roleLabel}
      onConfig={() => setCurrentView("config")}
      onAssign={() => setCurrentView("assign")}
      onViewDetail={(a) => { setSelectedAssignment(a); setCurrentView("detail"); }}
    />
  );
}

// ══════════════════════════════════════════════
// ROLE LIST VIEW
// ══════════════════════════════════════════════
function RoleListView({ targetRole, roleLabel, onConfig, onAssign, onViewDetail }: {
  targetRole: string; roleLabel: string; onConfig: () => void; onAssign: () => void; onViewDetail: (a: any) => void;
}) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const rol = nombreRol(t, targetRole, roleLabel);
  const { data: assignments = [], isLoading } = useRoleAssignments(targetRole);
  const { data: programs = [] } = useRolePrograms(targetRole);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid" | "calendar">("list");

  const programIds = useMemo(() => [...new Set(assignments.map((a: any) => a.training_programs?.id).filter(Boolean))], [assignments]);
  const { data: allModuleCounts = {} } = useQuery({
    queryKey: ["module-counts", programIds],
    queryFn: async () => {
      if (programIds.length === 0) return {};
      const { data, error } = await supabase.from("training_modules").select("training_program_id").in("training_program_id", programIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((m: any) => { counts[m.training_program_id] = (counts[m.training_program_id] || 0) + 1; });
      return counts;
    },
    enabled: programIds.length > 0,
  });

  // Module counts for program cards (content uploaded indicator)
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

  const assignmentIds = useMemo(() => assignments.map((a: any) => a.id), [assignments]);
  const { data: progressMap = {} } = useModuleProgress(assignmentIds);

  const filtered = useMemo(() => {
    let result = assignments;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((a: any) => {
        const emp = a.employees;
        const prog = a.training_programs;
        return (emp && `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(q)) || (prog?.name?.toLowerCase().includes(q));
      });
    }
    if (statusFilter && statusFilter !== "__all__") result = result.filter((a) => a.status === statusFilter);
    return result;
  }, [assignments, search, statusFilter]);

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

  // Calendar
  const [calMonth, setCalMonth] = useState(new Date());
  const calDays = eachDayOfInterval({ start: startOfMonth(calMonth), end: endOfMonth(calMonth) });
  const dayLabels = DIAS_SEMANA.map((k) => t(k));

  function getAssignmentsForDay(day: Date) {
    return filtered.filter((a: any) => {
      try {
        const start = a.start_date ? parseISO(a.start_date) : null;
        const end = a.completion_date ? parseISO(a.completion_date) : null;
        if (start && end) return isWithinInterval(day, { start, end }) || isSameDay(day, start) || isSameDay(day, end);
        if (start) return isSameDay(day, start);
        return false;
      } catch { return false; }
    });
  }

  const RoleIcon = targetRole === "chatter" ? MessageSquare : Monitor;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 bg-background border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/hr/capacitacion")} aria-label={t("common.back")}><ArrowLeft className="h-5 w-5" /></Button>
          <PageHeader
            className="flex-1"
            title={t("hrg.tr.title", { role: rol })}
            subtitle={t("hrg.tr.subtitle", { role: rol.toLowerCase() })}
            actions={
              <div className="flex gap-2">
                <Button variant="outline" onClick={onConfig}><Settings className="h-4 w-4 mr-1.5" />{t("hrg.tr.settings")}</Button>
                <Button onClick={onAssign}><Plus className="h-4 w-4 mr-1.5" />{t("hrg.tr.assign")}</Button>
              </div>
            }
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-6 py-5 space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="cursor-pointer" onClick={() => handleKpiClick("")}>
              <HRMetricCard title={t("hrg.tr.kpi.total")} value={kpis.total} icon={ClipboardList} color="primary" className={statusFilter === "" ? "ring-2 ring-primary/50" : ""} />
            </div>
            <div className="cursor-pointer" onClick={() => handleKpiClick("in_progress")}>
              <HRMetricCard title={t("hrg.opt.trainStatus.in_progress")} value={kpis.inProgress} icon={Clock} color="warning" className={statusFilter === "in_progress" ? "ring-2 ring-warning/50" : ""} />
            </div>
            <div className="cursor-pointer" onClick={() => handleKpiClick("completed")}>
              <HRMetricCard title={t("hrg.perf.completedPl")} value={kpis.completed} icon={CheckCircle} color="success" className={statusFilter === "completed" ? "ring-2 ring-success/50" : ""} />
            </div>
            <div className="cursor-pointer" onClick={() => handleKpiClick("overdue")}>
              <HRMetricCard title={t("hrg.tr.kpi.overdue")} value={kpis.overdue} icon={AlertTriangle} color="destructive" className={statusFilter === "overdue" ? "ring-2 ring-destructive/50" : ""} />
            </div>
          </div>

          {/* Programs section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <RoleIcon className="h-5 w-5 text-muted-foreground" />
              <h3 className="text-base font-semibold">{t("hrg.tr.programsOf", { role: rol })}</h3>
              <Badge variant="outline" className="ml-1">{programs.length}</Badge>
            </div>
            {programs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">{t("hrg.tr.noProgramsFor", { role: rol })}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {programs.map((p: any) => {
                  const mc = programModuleCounts[p.id];
                  return (
                    <Card key={p.id}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <p className="text-sm font-semibold">{p.name}</p>
                          {p.is_mandatory && <Badge variant="default" className="shrink-0 text-xs">{t("hrg.tr.mandatory")}</Badge>}
                        </div>
                        {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {p.duration_hours && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{p.duration_hours}h</span>}
                          <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{t("hrg.tr.modulesCount", { n: mc ? mc.total : 0 })}</span>
                          {mc && mc.total > 0 && (
                            <span className={cn("text-xs", mc.withContent === mc.total ? "text-success" : "text-warning")}>
                              {t("hrg.tr.withContent", { done: mc.withContent, total: mc.total })}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t("hrg.tr.searchPlaceholder")} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-44"><SelectValue placeholder={t("common.status")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("common.allStatuses")}</SelectItem>
                {TRAINING_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{etiquetaHrO(t, "trainStatus", s.value)}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 ml-auto">
              <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("list")} aria-label={t("hrg.dir.viewTable")}><LayoutList className="h-4 w-4" /></Button>
              <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("grid")} aria-label={t("hrg.dir.viewGrid")}><LayoutGrid className="h-4 w-4" /></Button>
              <Button variant={viewMode === "calendar" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("calendar")} aria-label={t("hrg.viewCalendar")}><CalendarDays className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* Assignments */}
          {viewMode === "list" ? (
            <AssignmentsTable assignments={filtered} isLoading={isLoading} progressMap={progressMap} moduleCounts={allModuleCounts} onViewDetail={onViewDetail} />
          ) : viewMode === "grid" ? (
            <AssignmentsGrid assignments={filtered} isLoading={isLoading} progressMap={progressMap} moduleCounts={allModuleCounts} onViewDetail={onViewDetail} />
          ) : (
            <CalendarView calMonth={calMonth} setCalMonth={setCalMonth} calDays={calDays} dayLabels={dayLabels} getAssignmentsForDay={getAssignmentsForDay} onViewDetail={onViewDetail} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Calendar View ──
function CalendarView({ calMonth, setCalMonth, calDays, dayLabels, getAssignmentsForDay, onViewDetail }: any) {
  const f = useFormato();
  const { t } = useLanguage();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setCalMonth((m: Date) => subMonths(m, 1))}>← {t("common.previous")}</Button>
        <h3 className="text-sm font-semibold capitalize">{format(calMonth, "MMMM yyyy", { locale: f.fechas })}</h3>
        <Button variant="outline" size="sm" onClick={() => setCalMonth((m: Date) => addMonths(m, 1))}>{t("common.next")} →</Button>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-7">
          {dayLabels.map((d: string) => (
            <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground border-b bg-muted/30">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: (calDays[0]?.getDay() || 7) - 1 }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[80px] border-b border-r bg-muted/10" />
          ))}
          {calDays.map((day: Date) => {
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
                  {dayAssignments.length > 3 && <p className="text-[10px] text-muted-foreground">{t("hrg.tr.more", { n: dayAssignments.length - 3 })}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Assignments Table ──
function AssignmentsTable({ assignments, isLoading, progressMap, moduleCounts, onViewDetail }: {
  assignments: any[]; isLoading: boolean; progressMap: Record<string, { completed: number; total: number }>; moduleCounts: Record<string, number>; onViewDetail: (a: any) => void;
}) {
  const f = useFormato();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employee_training_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-assignments"] }); toast({ title: t("hrg.tr.assignmentDeleted") }); setDeleteId(null); },
    onError: () => toast({ title: t("common.errorDeleting"), variant: "destructive" }),
  });

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("hrg.employee")}</TableHead>
              <TableHead>{t("hrg.tr.program")}</TableHead>
              <TableHead>{t("hrg.startDate")}</TableHead>
              <TableHead>{t("hrg.tr.deadline")}</TableHead>
              <TableHead>{t("hrg.progress")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5" /></TableCell>)}</TableRow>
              ))
            ) : assignments.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">{t("hrg.tr.noAssignments")}</TableCell></TableRow>
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
                        <UserAvatar name={emp ? `${emp.first_name} ${emp.last_name}` : null} src={emp?.profile_photo_url} size="sm" />
                        <div>
                          <p className="text-sm font-medium">{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</p>
                          <p className="text-xs text-muted-foreground">{emp?.departments?.name || "—"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{prog?.name || "—"}</TableCell>
                    <TableCell className="text-sm">{a.start_date ? new Date(a.start_date).toLocaleDateString(f.intl("es-CO")) : "—"}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1.5">
                        {a.completion_date ? new Date(a.completion_date).toLocaleDateString(f.intl("es-CO")) : "—"}
                        {expiring && <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30">{t("hrg.tr.dueSoon")}</Badge>}
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
                        {etiquetaHrV(t, "trainStatus", a.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onViewDetail(a)} aria-label={t("common.view")}><Eye className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(a.id)} aria-label={t("common.delete")}><Trash2 className="h-4 w-4" /></Button>
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
          <AlertDialogHeader><AlertDialogTitle>{t("hrg.tr.deleteAssignment")}</AlertDialogTitle><AlertDialogDescription>{t("common.cannotBeUndone")}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Assignments Grid ──
function AssignmentsGrid({ assignments, isLoading, progressMap, moduleCounts, onViewDetail }: {
  assignments: any[]; isLoading: boolean; progressMap: Record<string, { completed: number; total: number }>; moduleCounts: Record<string, number>; onViewDetail: (a: any) => void;
}) {
  const { t } = useLanguage();
  if (isLoading) return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}</div>;
  if (assignments.length === 0) return <p className="text-center text-muted-foreground py-10">{t("hrg.tr.noAssignments")}</p>;

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
                <UserAvatar name={emp ? `${emp.first_name} ${emp.last_name}` : null} src={emp?.profile_photo_url} size="sm" className="h-9 w-9" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{emp ? `${emp.first_name} ${emp.last_name}` : "—"}</p>
                  <p className="text-xs text-muted-foreground">{emp?.departments?.name || "—"}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {expiring && <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30">{t("hrg.tr.dueSoon")}</Badge>}
                  <Badge variant={getStatusBadgeVariant(a.status)}>{etiquetaHrV(t, "trainStatus", a.status)}</Badge>
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
// ASSIGNMENT DETAIL VIEW
// ══════════════════════════════════════════════
function AssignmentDetailView({ assignment, onBack }: { assignment: any; onBack: () => void }) {
  const f = useFormato();
  const { t } = useLanguage();
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
          status: newStatus, completed_at: newStatus === "completed" ? new Date().toISOString() : null,
        }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("training_module_progress").insert({
          assignment_id: assignment.id, module_id: moduleId, status: newStatus,
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
        await supabase.from("employee_training_assignments").update({ status: "completed", completion_date: new Date().toISOString().split("T")[0] }).eq("id", assignment.id);
      } else if (newStatus === "pending" && assignment.status === "completed") {
        await supabase.from("employee_training_assignments").update({ status: "in_progress", completion_date: null }).eq("id", assignment.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignment-module-progress", assignment.id] });
      queryClient.invalidateQueries({ queryKey: ["training-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["module-progress"] });
    },
    onError: () => toast({ title: t("hrg.tr.progressError"), variant: "destructive" }),
  });

  const isLoading = modulesLoading || progressLoading;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 bg-background border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label={t("common.back")}><ArrowLeft className="h-5 w-5" /></Button>
          <PageHeader
            className="flex-1"
            title={
              <>
                {emp ? `${emp.first_name} ${emp.last_name}` : "—"}{" "}
                <Badge variant={getStatusBadgeVariant(assignment.status)}>{etiquetaHrV(t, "trainStatus", assignment.status)}</Badge>
              </>
            }
            subtitle={prog?.name || "—"}
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="px-6 py-5 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1"><p className="text-xs text-muted-foreground">{t("hrg.startDate")}</p><p className="text-sm font-medium">{assignment.start_date ? new Date(assignment.start_date).toLocaleDateString(f.intl("es-CO")) : "—"}</p></div>
            <div className="space-y-1"><p className="text-xs text-muted-foreground">{t("hrg.tr.deadline")}</p><p className="text-sm font-medium">{assignment.completion_date ? new Date(assignment.completion_date).toLocaleDateString(f.intl("es-CO")) : "—"}</p></div>
            <div className="space-y-1"><p className="text-xs text-muted-foreground">{t("hrg.department")}</p><p className="text-sm font-medium">{emp?.departments?.name || "—"}</p></div>
            <div className="space-y-1"><p className="text-xs text-muted-foreground">{t("hrg.tr.programRole")}</p><p className="text-sm font-medium">{etiquetaHr(t, "trainRole", prog?.target_role) || t("hrg.opt.trainRole.general")}</p></div>
          </div>

          {assignment.notes && <div className="space-y-1"><p className="text-xs text-muted-foreground">{t("hrg.notes")}</p><p className="text-sm">{assignment.notes}</p></div>}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{t("hrg.tr.overallProgress")}</p>
              <span className="text-sm font-semibold">{t("hrg.tr.modulesProgress", { done: completedCount, total: totalModules, pct: progressPercent })}</span>
            </div>
            <Progress value={progressPercent} className="h-2.5" />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("hrg.tr.programModules")}</h3>
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
            ) : modules.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">{t("hrg.tr.noModulesConfigured")}</p>
            ) : (
              <div className="border rounded-lg divide-y">
                {modules.map((m: any, idx: number) => {
                  const mp = progressByModule[m.id];
                  const isCompleted = mp?.status === "completed";
                  const ContentIcon = getContentIcon(m.content_type);
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                      <Checkbox
                        checked={isCompleted}
                        onCheckedChange={() => toggleModuleMutation.mutate({ moduleId: m.id, currentStatus: mp?.status || null })}
                        disabled={toggleModuleMutation.isPending}
                      />
                      <span className="text-xs text-muted-foreground font-mono w-6">{idx + 1}</span>
                      <ContentIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${isCompleted ? "line-through text-muted-foreground" : ""}`}>{m.title}</p>
                        {m.description && <p className="text-xs text-muted-foreground truncate">{m.description}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {m.duration_minutes && <span className="text-xs text-muted-foreground">{m.duration_minutes} min</span>}
                        {m.is_required && <Badge variant="outline" className="text-xs">{t("hrg.tr.requiredShort")}</Badge>}
                        {m.content_url && <a href={m.content_url} target="_blank" rel="noreferrer"><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t("hrg.tr.openContent")}><Eye className="h-3.5 w-3.5" /></Button></a>}
                        {isCompleted && mp?.completed_at && <span className="text-xs text-muted-foreground">{new Date(mp.completed_at).toLocaleDateString(f.intl("es-CO"))}</span>}
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
// ASSIGN TRAINING VIEW
// ══════════════════════════════════════════════
function AssignTrainingView({ targetRole, roleLabel, onBack }: { targetRole: string; roleLabel: string; onBack: () => void }) {
  const { t } = useLanguage();
  const rol = nombreRol(t, targetRole, roleLabel);
  const { data: programs = [] } = useRolePrograms(targetRole);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ employee_id: "", training_program_id: "", start_date: "", supervisor_id: "", notes: "" });

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("employee_training_assignments").insert({
        employee_id: form.employee_id, training_program_id: form.training_program_id,
        start_date: form.start_date || null, assigned_by: form.supervisor_id || user?.id, notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-assignments"] }); toast({ title: t("hrg.tr.assigned") }); onBack(); },
    onError: () => toast({ title: t("common.errorAssigning"), variant: "destructive" }),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 bg-background border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label={t("common.back")}><ArrowLeft className="h-5 w-5" /></Button>
          <PageHeader
            className="flex-1"
            title={t("hrg.tr.assignTitle", { role: rol })}
            subtitle={t("hrg.tr.assignSubtitle", { role: rol.toLowerCase() })}
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="px-6 py-6 space-y-5">
          <div className="space-y-1.5">
            <Label>{t("hrg.employee")} <span className="text-destructive">*</span></Label>
            <EmployeeSearchCombobox value={form.employee_id || null} onChange={(v) => setForm((f) => ({ ...f, employee_id: v ?? "" }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("hrg.tr.trainingProgram")} <span className="text-destructive">*</span></Label>
            <Select value={form.training_program_id} onValueChange={(v) => setForm((f) => ({ ...f, training_program_id: v }))}>
              <SelectTrigger><SelectValue placeholder={t("hrg.tr.selectProgram")} /></SelectTrigger>
              <SelectContent>{programs.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("hrg.startDateOf")}</Label>
            <DateInput value={form.start_date} onChange={(v) => setForm((f) => ({ ...f, start_date: v }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("hrg.tr.supervisorOptional")}</Label>
            <EmployeeSearchCombobox value={form.supervisor_id || null} onChange={(v) => setForm((f) => ({ ...f, supervisor_id: v ?? "" }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("hrg.tr.additionalNotes")}</Label>
            <Textarea placeholder={t("hrg.tr.notesPlaceholder")} rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onBack}>{t("common.cancel")}</Button>
            <Button onClick={() => mutation.mutate()} disabled={!form.employee_id || !form.training_program_id || mutation.isPending}>
              {mutation.isPending ? t("hrg.tr.assigning") : t("hrg.tr.assignTraining")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════
// PROGRAM CONFIG VIEW
// ══════════════════════════════════════════════
function ProgramConfigView({ targetRole, roleLabel, onBack, onManageModules }: {
  targetRole: string; roleLabel: string; onBack: () => void; onManageModules: (p: any) => void;
}) {
  const { t } = useLanguage();
  const rol = nombreRol(t, targetRole, roleLabel);
  const { data: programs = [], isLoading } = useRolePrograms(targetRole);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editProgram, setEditProgram] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [modalityFilter, setModalityFilter] = useState("");
  const [configView, setConfigView] = useState<"list" | "grid">("grid");
  const [form, setForm] = useState({ name: "", description: "", duration_hours: "", modality: "presencial", provider: "", is_mandatory: false });

  const resetForm = () => setForm({ name: "", description: "", duration_hours: "", modality: "presencial", provider: "", is_mandatory: false });

  // Module counts for content indicator
  const allProgramIds = useMemo(() => programs.map((p: any) => p.id), [programs]);
  const { data: programModuleCounts = {} } = useQuery({
    queryKey: ["program-module-detail-counts-config", allProgramIds],
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

  const hasActiveFilters = !!(search || modalityFilter);
  const clearFilters = () => { setSearch(""); setModalityFilter(""); };

  const filtered = useMemo(() => {
    let result = programs;
    if (search) { const q = search.toLowerCase(); result = result.filter((p: any) => p.name.toLowerCase().includes(q)); }
    if (modalityFilter && modalityFilter !== "__all__") result = result.filter((p: any) => p.modality === modalityFilter);
    return result;
  }, [programs, search, modalityFilter]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("training_programs").insert({
        name: form.name, description: form.description || null,
        duration_hours: form.duration_hours ? parseFloat(form.duration_hours) : null,
        modality: form.modality, provider: form.provider || null,
        is_mandatory: form.is_mandatory, target_role: targetRole, created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-programs"] }); toast({ title: t("hrg.tr.programCreated") }); setShowNew(false); resetForm(); },
    onError: () => toast({ title: t("common.errorCreating"), variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editProgram) return;
      const { error } = await supabase.from("training_programs").update({
        name: form.name, description: form.description || null,
        duration_hours: form.duration_hours ? parseFloat(form.duration_hours) : null,
        modality: form.modality, provider: form.provider || null, is_mandatory: form.is_mandatory,
      }).eq("id", editProgram.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-programs"] }); toast({ title: t("hrg.tr.programUpdated") }); setEditProgram(null); resetForm(); },
    onError: () => toast({ title: t("common.errorUpdating"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("training_programs").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-programs"] }); toast({ title: t("hrg.tr.programDeleted") }); setDeleteId(null); },
    onError: () => toast({ title: t("common.errorDeleting"), variant: "destructive" }),
  });

  const openEdit = (p: any) => {
    setForm({ name: p.name, description: p.description || "", duration_hours: p.duration_hours?.toString() || "", modality: p.modality || "presencial", provider: p.provider || "", is_mandatory: p.is_mandatory || false });
    setEditProgram(p);
  };

  const isFormDialog = showNew || !!editProgram;
  const isEditing = !!editProgram;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 bg-background border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label={t("common.back")}><ArrowLeft className="h-5 w-5" /></Button>
          <PageHeader
            className="flex-1"
            title={t("hrg.tr.programsOf", { role: rol })}
            subtitle={t("hrg.tr.programsSubtitle")}
            actions={<Button onClick={() => { resetForm(); setShowNew(true); }}><Plus className="h-4 w-4 mr-1.5" />{t("hrg.tr.newProgram")}</Button>}
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="px-6 py-5 space-y-5">
          {/* Filters bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t("hrg.tr.searchProgram")} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={modalityFilter || undefined} onValueChange={(v) => setModalityFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder={t("hrg.dir.modality")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("common.allF")}</SelectItem>
                {TRAINING_MODALITIES.map((m) => <SelectItem key={m.value} value={m.value}>{etiquetaHrO(t, "trainModality", m.value)}</SelectItem>)}
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-1.5 h-4 w-4" />{t("hrg.clearFilters")}
              </Button>
            )}
            <div className="ml-auto flex gap-1">
              <Button variant={configView === "list" ? "secondary" : "ghost"} size="icon" onClick={() => setConfigView("list")} aria-label={t("hrg.dir.viewTable")}><List className="h-4 w-4" /></Button>
              <Button variant={configView === "grid" ? "secondary" : "ghost"} size="icon" onClick={() => setConfigView("grid")} aria-label={t("hrg.dir.viewGrid")}><LayoutGrid className="h-4 w-4" /></Button>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState seed="hr-training-programas" title={t("hrg.tr.noPrograms")} description={t("hrg.tr.noProgramsHint")} />
          ) : configView === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((p: any) => {
                const mc = programModuleCounts[p.id];
                return (
                  <Card key={p.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <p className="text-sm font-semibold">{p.name}</p>
                        {p.is_mandatory && <Badge variant="default" className="text-xs">{t("hrg.tr.mandatory")}</Badge>}
                      </div>
                      {p.description && <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {p.duration_hours && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{p.duration_hours}h</span>}
                        <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{t("hrg.tr.modulesCount", { n: mc ? mc.total : 0 })}</span>
                        {mc && mc.total > 0 && (
                          <span className={cn("text-xs", mc.withContent === mc.total ? "text-success" : "text-warning")}>
                            {t("hrg.tr.withContent", { done: mc.withContent, total: mc.total })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 pt-1">
                        <Button variant="outline" size="sm" onClick={() => onManageModules(p)}><BookOpen className="h-3.5 w-3.5 mr-1" />{t("hrg.tr.modules")}</Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)} aria-label={t("common.edit")}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(p.id)} aria-label={t("common.delete")}><Trash2 className="h-4 w-4" /></Button>
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
                    <TableHead>{t("common.name")}</TableHead>
                    <TableHead>{t("hrg.dir.modality")}</TableHead>
                    <TableHead>{t("common.duration")}</TableHead>
                    <TableHead>{t("hrg.tr.modules")}</TableHead>
                    <TableHead>{t("hrg.tr.mandatory")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p: any) => {
                    const mc = programModuleCounts[p.id];
                    const modalityLabel = etiquetaHr(t, "trainModality", p.modality) || p.modality || "—";
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
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
                        <TableCell>{p.is_mandatory ? <Badge variant="default" className="text-xs">{t("hrg.yes")}</Badge> : <span className="text-muted-foreground text-sm">{t("hrg.no")}</span>}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="outline" size="sm" onClick={() => onManageModules(p)}><BookOpen className="h-3.5 w-3.5 mr-1" />{t("hrg.tr.modules")}</Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)} aria-label={t("common.edit")}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(p.id)} aria-label={t("common.delete")}><Trash2 className="h-4 w-4" /></Button>
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
          <DialogHeader><DialogTitle>{isEditing ? t("hrg.tr.editProgram") : t("hrg.tr.newTrainingProgram")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("common.name")} <span className="text-destructive">*</span></Label>
              <Input placeholder={t("hrg.tr.programNamePlaceholder")} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("hrg.dir.modality")}</Label>
                <Select value={form.modality} onValueChange={(v) => setForm((f) => ({ ...f, modality: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TRAINING_MODALITIES.map((m) => <SelectItem key={m.value} value={m.value}>{etiquetaHrO(t, "trainModality", m.value)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("hrg.tr.durationHours")}</Label>
                <Input type="number" placeholder="8" value={form.duration_hours} onChange={(e) => setForm((f) => ({ ...f, duration_hours: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("hrg.tr.provider")}</Label>
              <Input placeholder={t("hrg.tr.provider")} value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.description")}</Label>
              <Textarea placeholder={t("hrg.tr.programDescPlaceholder")} rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="mandatory" checked={form.is_mandatory} onChange={(e) => setForm((f) => ({ ...f, is_mandatory: e.target.checked }))} className="rounded border-border" />
              <Label htmlFor="mandatory">{t("hrg.tr.mandatoryProgram")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNew(false); setEditProgram(null); resetForm(); }}>{t("common.cancel")}</Button>
            <Button onClick={() => isEditing ? updateMutation.mutate() : createMutation.mutate()} disabled={!form.name || createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? t("hrg.saving") : isEditing ? t("common.save") : t("hrg.tr.createProgram")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t("hrg.tr.deleteProgram")}</AlertDialogTitle><AlertDialogDescription>{t("hrg.tr.deleteProgramBody")}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ══════════════════════════════════════════════
// MODULE MANAGEMENT VIEW
// ══════════════════════════════════════════════
function ModuleManagementView({ program, onBack }: { program: any; onBack: () => void }) {
  const { t } = useLanguage();
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-modules", program.id] }); toast({ title: t("hrg.tr.moduleCreated") }); setShowNew(false); resetForm(); },
    onError: () => toast({ title: t("hrg.tr.moduleCreateError"), variant: "destructive" }),
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-modules", program.id] }); toast({ title: t("hrg.tr.moduleUpdated") }); setEditModule(null); resetForm(); },
    onError: () => toast({ title: t("common.errorUpdating"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("training_modules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["training-modules", program.id] }); toast({ title: t("hrg.tr.moduleDeleted") }); setDeleteId(null); },
    onError: () => toast({ title: t("common.errorDeleting"), variant: "destructive" }),
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
      if (uploadError) { toast({ title: t("hrg.tr.uploadError"), variant: "destructive" }); return; }
      const { data: signedData } = await supabase.storage.from("creator-files").createSignedUrl(path, 86400);
      const { error: updateError } = await supabase.from("training_modules").update({ content_url: signedData?.signedUrl || path }).eq("id", moduleId);
      if (updateError) { toast({ title: t("hrg.tr.saveUrlError"), variant: "destructive" }); return; }
      queryClient.invalidateQueries({ queryKey: ["training-modules", program.id] });
      toast({ title: t("hrg.tr.contentUploaded") });
    };
    input.click();
  };

  const isFormDialog = showNew || !!editModule;
  const isEditing = !!editModule;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 bg-background border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label={t("common.back")}><ArrowLeft className="h-5 w-5" /></Button>
          <PageHeader
            className="flex-1"
            title={program.name}
            subtitle={t("hrg.tr.modulesSubtitle", { n: modules.length })}
            actions={<Button onClick={() => { resetForm(); setShowNew(true); }}><Plus className="h-4 w-4 mr-1.5" />{t("hrg.tr.newModule")}</Button>}
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="px-6 py-5">
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
          ) : modules.length === 0 ? (
            <EmptyState seed="hr-training-modulos" title={t("hrg.tr.noModules")} description={t("hrg.tr.noModulesHint")} />
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead>{t("common.title")}</TableHead>
                    <TableHead>{t("common.type")}</TableHead>
                    <TableHead>{t("common.duration")}</TableHead>
                    <TableHead>{t("hrg.tr.content")}</TableHead>
                    <TableHead>{t("hrg.required")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
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
                            <span className="text-sm">{etiquetaHr(t, "trainContent", m.content_type) || m.content_type}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{m.duration_minutes ? `${m.duration_minutes} min` : "—"}</TableCell>
                        <TableCell>
                          {m.content_url ? (
                            <a href={m.content_url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">{t("common.view")}</a>
                          ) : (
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleFileUpload(m.id)}>
                              <Upload className="h-3.5 w-3.5 mr-1" />{t("hrg.tr.upload")}
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>{m.is_required ? <Badge variant="default" className="text-xs">{t("hrg.yes")}</Badge> : <Badge variant="outline" className="text-xs">{t("hrg.no")}</Badge>}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)} aria-label={t("common.edit")}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(m.id)} aria-label={t("common.delete")}><Trash2 className="h-4 w-4" /></Button>
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
          <DialogHeader><DialogTitle>{isEditing ? t("hrg.tr.editModule") : t("hrg.tr.newModule")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("common.title")} <span className="text-destructive">*</span></Label>
              <Input placeholder={t("hrg.tr.moduleTitlePlaceholder")} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("hrg.tr.contentType")}</Label>
                <Select value={form.content_type} onValueChange={(v) => setForm((f) => ({ ...f, content_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TRAINING_CONTENT_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{etiquetaHrO(t, "trainContent", o.value)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("hrg.tr.durationMin")}</Label>
                <Input type="number" placeholder="30" value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.description")}</Label>
              <Textarea placeholder={t("hrg.tr.moduleDescPlaceholder")} rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("hrg.tr.contentUrl")}</Label>
              <Input placeholder="https://..." value={form.content_url} onChange={(e) => setForm((f) => ({ ...f, content_url: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="required" checked={form.is_required} onChange={(e) => setForm((f) => ({ ...f, is_required: e.target.checked }))} className="rounded border-border" />
              <Label htmlFor="required">{t("hrg.tr.requiredModule")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNew(false); setEditModule(null); resetForm(); }}>{t("common.cancel")}</Button>
            <Button onClick={() => isEditing ? updateMutation.mutate() : createMutation.mutate()} disabled={!form.title || createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? t("hrg.saving") : isEditing ? t("common.save") : t("hrg.tr.createModule")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{t("hrg.tr.deleteModule")}</AlertDialogTitle><AlertDialogDescription>{t("common.cannotBeUndone")}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
