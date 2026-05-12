import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Clock, Loader2, CheckCircle, Plus, Eye, Pencil, Trash2,
  Search, X, ListIcon, LayoutGrid, UserPlus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import KpiCard from "@/components/dashboard/KpiCard";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useDepartments } from "@/hooks/useEmployees";

// ─── Types ────────────────────────────────────────────────────────────────────
interface OnboardingRecord {
  id: string;
  employee_id: string;
  start_date: string | null;
  completion_date: string | null;
  status: string;
  notes: string | null;
  buddy_employee_id: string | null;
  created_at: string;
  employees: {
    first_name: string;
    last_name: string;
    email: string | null;
    profile_photo_url: string | null;
    department_id: string | null;
    departments: { name: string } | null;
    positions: { name: string } | null;
  } | null;
  buddy: {
    first_name: string;
    last_name: string;
  } | null;
  task_total: number;
  task_completed: number;
}

const ONBOARDING_STATUSES = [
  { value: "pending", label: "Pendiente" },
  { value: "in_progress", label: "En Progreso" },
  { value: "completed", label: "Completado" },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-muted", text: "text-muted-foreground" },
  in_progress: { bg: "bg-warning/15", text: "text-warning" },
  completed: { bg: "bg-accent/15", text: "text-accent-foreground" },
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
function useOnboardings() {
  return useQuery({
    queryKey: ["hr-onboardings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_onboarding")
        .select(`
          *,
          employees!employee_onboarding_employee_id_fkey(
            first_name, last_name, email, profile_photo_url, department_id,
            departments(name),
            positions:positions(name)
          ),
          buddy:employees!employee_onboarding_buddy_employee_id_fkey(first_name, last_name)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch task counts
      const ids = (data ?? []).map((d) => d.id);
      let taskCounts: Record<string, { total: number; completed: number }> = {};
      if (ids.length > 0) {
        const { data: tasks } = await supabase
          .from("employee_onboarding_tasks")
          .select("onboarding_id, status")
          .in("onboarding_id", ids);
        if (tasks) {
          for (const t of tasks) {
            if (!taskCounts[t.onboarding_id]) taskCounts[t.onboarding_id] = { total: 0, completed: 0 };
            taskCounts[t.onboarding_id].total++;
            if (t.status === "completed") taskCounts[t.onboarding_id].completed++;
          }
        }
      }

      return (data ?? []).map((d) => ({
        ...d,
        task_total: taskCounts[d.id]?.total ?? 0,
        task_completed: taskCounts[d.id]?.completed ?? 0,
      })) as OnboardingRecord[];
    },
  });
}

function getInitials(first: string, last: string): string {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HROnboarding() {
  const navigate = useNavigate();
  const { data: onboardings = [], isLoading } = useOnboardings();
  const { data: departments = [] } = useDepartments();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptTab, setDeptTab] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  type KpiKey = "total" | "pending" | "inProgress" | "completed";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);

  const [viewItem, setViewItem] = useState<OnboardingRecord | null>(null);
  const [editItem, setEditItem] = useState<OnboardingRecord | null>(null);
  const [deleteItem, setDeleteItem] = useState<OnboardingRecord | null>(null);
  const [editForm, setEditForm] = useState({ status: "", notes: "" });

  // ─── Mutations ────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async () => {
      const updateData: Record<string, any> = { status: editForm.status, notes: editForm.notes || null };
      if (editForm.status === "completed") updateData.completion_date = new Date().toISOString().split("T")[0];
      const { error } = await supabase.from("employee_onboarding").update(updateData).eq("id", editItem!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-onboardings"] });
      toast({ title: "Onboarding actualizado" });
      setEditItem(null);
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Delete tasks first, then onboarding
      await supabase.from("employee_onboarding_tasks").delete().eq("onboarding_id", id);
      const { error } = await supabase.from("employee_onboarding").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-onboardings"] });
      toast({ title: "Onboarding eliminado" });
      setDeleteItem(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  // ─── KPIs ─────────────────────────────────────────────────────────────────
  const totalPending = onboardings.filter((o) => o.status === "pending").length;
  const totalInProgress = onboardings.filter((o) => o.status === "in_progress").length;
  const totalCompleted = onboardings.filter((o) => o.status === "completed").length;

  // ─── Filtering ────────────────────────────────────────────────────────────
  const hasFilters = search || statusFilter;

  const filtered = onboardings.filter((o) => {
    const empName = `${o.employees?.first_name ?? ""} ${o.employees?.last_name ?? ""}`.toLowerCase();
    const matchSearch = !search || empName.includes(search.toLowerCase()) || o.employees?.email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || o.status === statusFilter;
    const matchDept = !deptTab || o.employees?.department_id === deptTab;
    return matchSearch && matchStatus && matchDept;
  });

  function clearFilters() { setSearch(""); setStatusFilter(""); }

  function openEdit(item: OnboardingRecord) {
    setEditForm({ status: item.status, notes: item.notes ?? "" });
    setEditItem(item);
  }

  function getProgress(item: OnboardingRecord) {
    return item.task_total > 0 ? Math.round((item.task_completed / item.task_total) * 100) : 0;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Fixed Header ──────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-background/60 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Onboarding</h1>
            <p className="text-sm text-muted-foreground">Gestión de nuevos empleados en proceso de integración</p>
          </div>
          <Button size="sm" onClick={() => navigate("/hr/onboarding/nuevo")}>
            <Plus className="h-4 w-4 mr-1" />Iniciar Onboarding
          </Button>
        </div>
      </header>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          ) : (
            <>
              <KpiCard label="Total Onboarding" value={String(onboardings.length)} icon={Users} color="bg-blue-500" subtitle="Todos los procesos" onClick={() => setKpiPopup("total")} />
              <KpiCard label="Pendientes" value={String(totalPending)} icon={Clock} color="bg-violet-500" subtitle={onboardings.length > 0 ? `${((totalPending / onboardings.length) * 100).toFixed(0)}% del total` : "—"} onClick={() => setKpiPopup("pending")} />
              <KpiCard label="En Progreso" value={String(totalInProgress)} icon={Loader2} color="bg-amber-500" subtitle={onboardings.length > 0 ? `${((totalInProgress / onboardings.length) * 100).toFixed(0)}% del total` : "—"} onClick={() => setKpiPopup("inProgress")} />
              <KpiCard label="Completados" value={String(totalCompleted)} icon={CheckCircle} color="bg-emerald-500" subtitle={onboardings.length > 0 ? `${((totalCompleted / onboardings.length) * 100).toFixed(0)}% del total` : "—"} onClick={() => setKpiPopup("completed")} />
            </>
          )}
        </div>

        {/* Department Tabs */}
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
          <Button variant={!deptTab ? "secondary" : "ghost"} size="sm" onClick={() => setDeptTab("")}>Todos</Button>
          {departments.map((d: any) => (
            <Button key={d.id} variant={deptTab === d.id ? "secondary" : "ghost"} size="sm" onClick={() => setDeptTab(d.id)}>{d.name}</Button>
          ))}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nombre o email..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {ONBOARDING_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>

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
              <X className="h-3.5 w-3.5 mr-1" />Limpiar filtros
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
                    <TableHead className="text-xs font-medium text-muted-foreground">Posición</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Área</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Fecha Inicio</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Buddy</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Progreso</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                        {onboardings.length === 0
                          ? "No hay procesos de onboarding. Haz clic en \"Iniciar Onboarding\" para empezar."
                          : "Sin resultados para los filtros aplicados."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((ob) => {
                      const emp = ob.employees;
                      const initials = getInitials(emp?.first_name ?? "", emp?.last_name ?? "");
                      const statusColors = STATUS_COLORS[ob.status] ?? STATUS_COLORS.pending;
                      const progress = getProgress(ob);
                      return (
                        <TableRow key={ob.id} className="group hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-xs font-semibold text-primary">{initials}</span>
                              </div>
                              <p className="text-sm font-medium">{emp?.first_name} {emp?.last_name}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{emp?.positions?.name ?? "—"}</TableCell>
                          <TableCell>
                            {emp?.departments?.name ? (
                              <Badge variant="secondary" className="text-xs">{emp.departments.name}</Badge>
                            ) : <span className="text-sm text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{ob.start_date ? format(new Date(ob.start_date), "dd/MM/yyyy") : "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{ob.buddy ? `${ob.buddy.first_name} ${ob.buddy.last_name}` : "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <Progress value={progress} className="h-2 flex-1" />
                              <span className="text-xs text-muted-foreground whitespace-nowrap">{ob.task_completed}/{ob.task_total}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusColors.bg, statusColors.text)}>
                              {ONBOARDING_STATUSES.find((s) => s.value === ob.status)?.label ?? ob.status}
                            </span>
                          </TableCell>
                          <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                            <div className="flex items-center gap-1">
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(ob)}><Eye className="h-3.5 w-3.5" /></Button>
                              </TooltipTrigger><TooltipContent side="left">Ver</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(ob)}><Pencil className="h-3.5 w-3.5" /></Button>
                              </TooltipTrigger><TooltipContent side="left">Editar</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(ob)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)
            ) : filtered.length === 0 ? (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                {onboardings.length === 0 ? "No hay procesos de onboarding." : "Sin resultados para los filtros aplicados."}
              </div>
            ) : (
              filtered.map((ob) => {
                const emp = ob.employees;
                const initials = getInitials(emp?.first_name ?? "", emp?.last_name ?? "");
                const statusColors = STATUS_COLORS[ob.status] ?? STATUS_COLORS.pending;
                const progress = getProgress(ob);
                return (
                  <Card key={ob.id} className="hover:border-primary/30 transition-colors">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-primary">{initials}</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium leading-tight">{emp?.first_name} {emp?.last_name}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[160px]">{emp?.email ?? "Sin email"}</p>
                          </div>
                        </div>
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0", statusColors.bg, statusColors.text)}>
                          {ONBOARDING_STATUSES.find((s) => s.value === ob.status)?.label ?? ob.status}
                        </span>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p><span className="font-medium text-foreground">Posición:</span> {emp?.positions?.name ?? "—"}</p>
                        {emp?.departments?.name && <p><span className="font-medium text-foreground">Área:</span> {emp.departments.name}</p>}
                        <p><span className="font-medium text-foreground">Inicio:</span> {ob.start_date ? format(new Date(ob.start_date), "dd/MM/yyyy") : "—"}</p>
                        {ob.buddy && <p><span className="font-medium text-foreground">Buddy:</span> {ob.buddy.first_name} {ob.buddy.last_name}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={progress} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground">{ob.task_completed}/{ob.task_total}</span>
                      </div>
                      <div className="flex items-center gap-1 pt-1 border-t border-border">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setViewItem(ob)}><Eye className="h-3 w-3 mr-1" />Ver</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(ob)}><Pencil className="h-3 w-3 mr-1" />Editar</Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteItem(ob)}><Trash2 className="h-3 w-3 mr-1" />Eliminar</Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ── View Modal ────────────────────────────────────────────────────── */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Detalle del Onboarding</DialogTitle></DialogHeader>
          {viewItem && (() => {
            const emp = viewItem.employees;
            const progress = getProgress(viewItem);
            const sc = STATUS_COLORS[viewItem.status] ?? STATUS_COLORS.pending;
            return (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-muted-foreground">Empleado</p><p className="font-medium">{emp?.first_name} {emp?.last_name}</p></div>
                  <div><p className="text-xs text-muted-foreground">Email</p><p>{emp?.email ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Posición</p><p>{emp?.positions?.name ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Área</p><p>{emp?.departments?.name ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Fecha Inicio</p><p>{viewItem.start_date ? format(new Date(viewItem.start_date), "dd/MM/yyyy") : "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Buddy/Mentor</p><p>{viewItem.buddy ? `${viewItem.buddy.first_name} ${viewItem.buddy.last_name}` : "—"}</p></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Estado</p>
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", sc.bg, sc.text)}>
                      {ONBOARDING_STATUSES.find((s) => s.value === viewItem.status)?.label ?? viewItem.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Progreso</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={progress} className="h-2 flex-1" />
                      <span className="text-xs">{progress}%</span>
                    </div>
                  </div>
                </div>
                {viewItem.notes && (
                  <div><p className="text-xs text-muted-foreground">Notas</p><p className="whitespace-pre-wrap">{viewItem.notes}</p></div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Edit Modal ────────────────────────────────────────────────────── */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Onboarding</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Empleado</Label>
              <Input value={editItem ? `${editItem.employees?.first_name} ${editItem.employees?.last_name}` : ""} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ONBOARDING_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
              <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ─────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar onboarding?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente el onboarding de <strong>{deleteItem?.employees?.first_name} {deleteItem?.employees?.last_name}</strong> y todas sus tareas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}>
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          switch (kpiPopup) {
            case "total": return `Total Onboarding — ${onboardings.length}`;
            case "pending": return `Pendientes — ${totalPending}`;
            case "inProgress": return `En Progreso — ${totalInProgress}`;
            case "completed": return `Completados — ${totalCompleted}`;
            default: return "";
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = onboardings;
          if (kpiPopup === "pending") list = onboardings.filter((o: any) => o.status === "pending");
          else if (kpiPopup === "inProgress") list = onboardings.filter((o: any) => o.status === "in_progress");
          else if (kpiPopup === "completed") list = onboardings.filter((o: any) => o.status === "completed");
          const tone = (status: string): KpiRow["rightTone"] =>
            status === "completed" ? "success" : status === "in_progress" ? "warning" : "default";
          return list.slice(0, 100).map((o: any): KpiRow => ({
            primary: o.employees ? `${o.employees.first_name ?? ""} ${o.employees.last_name ?? ""}`.trim() : "Sin nombre",
            secondary: o.position ?? o.start_date ? format(new Date(o.start_date), "dd MMM yyyy") : undefined,
            right: o.status ?? "—",
            rightTone: tone(o.status ?? ""),
          }));
        })()}
      />
    </div>
  );
}
