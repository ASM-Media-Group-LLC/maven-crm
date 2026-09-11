import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, AlertCircle, Clock, ShieldAlert, Plus, Eye, Pencil, Trash2,
  Search, X, ListIcon, LayoutGrid,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { PageHeader } from "@/components/ui/page-header";
import { INCIDENT_TYPES, INCIDENT_SEVERITIES, INCIDENT_STATUSES } from "@/lib/hrConstants";
import { SEVERITY_COLORS } from "@/lib/hrAreaUtils";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────
interface IncidentRecord {
  id: string;
  employee_id: string;
  title: string;
  description: string | null;
  incident_type: string;
  severity: string;
  status: string;
  incident_date: string;
  corrective_action: string | null;
  created_at: string;
  employees: {
    first_name: string;
    last_name: string;
    employee_code: string | null;
    department_id: string | null;
  } | null;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useIncidents() {
  return useQuery({
    queryKey: ["employee-incidents-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_incidents")
        .select("*, employees(first_name, last_name, employee_code, department_id)")
        .order("incident_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as IncidentRecord[];
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

function getInitials(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HRIncidents() {
  const navigate = useNavigate();
  const { data: incidents = [], isLoading } = useIncidents();
  const { data: departments = [] } = useDepartments();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Filters
  const [search, setSearch] = useState("");
  type KpiKey = "total" | "open" | "inProgress" | "critical";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptTab, setDeptTab] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Modals
  const [viewItem, setViewItem] = useState<IncidentRecord | null>(null);
  const [editItem, setEditItem] = useState<IncidentRecord | null>(null);
  const [deleteItem, setDeleteItem] = useState<IncidentRecord | null>(null);
  const [editForm, setEditForm] = useState({ status: "", severity: "", corrective_action: "" });

  // ─── Mutations ────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async () => {
      const updates: any = { status: editForm.status, severity: editForm.severity, corrective_action: editForm.corrective_action || null };
      if (editForm.status === "resolved" || editForm.status === "closed") {
        const { data: { user } } = await supabase.auth.getUser();
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = user?.id;
      }
      const { error } = await supabase.from("employee_incidents").update(updates).eq("id", editItem!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-incidents-all"] });
      toast({ title: "Incidente actualizado" });
      setEditItem(null);
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employee_incidents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-incidents-all"] });
      toast({ title: "Incidente eliminado" });
      setDeleteItem(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  // ─── KPIs ─────────────────────────────────────────────────────────────────
  const totalOpen = incidents.filter((i) => i.status === "open").length;
  const totalInProgress = incidents.filter((i) => i.status === "in_progress").length;
  const totalCritical = incidents.filter((i) => i.severity === "critical").length;

  // ─── Filtering ────────────────────────────────────────────────────────────
  const hasFilters = search || severityFilter || statusFilter || dateFrom || dateTo;

  const filtered = incidents.filter((i) => {
    const emp = i.employees;
    const fullName = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
    const matchSearch = !search || fullName.includes(search.toLowerCase());
    const matchSev = !severityFilter || i.severity === severityFilter;
    const matchStatus = !statusFilter || i.status === statusFilter;
    const matchDept = !deptTab || emp?.department_id === deptTab;
    const recordDate = new Date(i.incident_date);
    const matchFrom = !dateFrom || recordDate >= dateFrom;
    const matchTo = !dateTo || recordDate <= dateTo;
    return matchSearch && matchSev && matchStatus && matchDept && matchFrom && matchTo;
  });

  function clearFilters() {
    setSearch("");
    setSeverityFilter("");
    setStatusFilter("");
    setDateFrom(undefined);
    setDateTo(undefined);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Fixed Header ──────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <PageHeader
          title="Incidentes Laborales"
          subtitle={<>{totalOpen} incidentes abiertos · {incidents.length} total</>}
          actions={
            <Button size="sm" onClick={() => navigate("/hr/incidentes/nuevo")}>
              <Plus className="h-4 w-4 mr-1" />Reportar Incidente
            </Button>
          }
        />
      </header>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          ) : (
            <>
              <StatChip label="Total Incidentes" value={String(incidents.length)} icon={<AlertTriangle className="h-3.5 w-3.5" />} color="bg-primary" hint="Todos los registros" onClick={() => setKpiPopup("total")} />
              <StatChip label="Abiertos" value={String(totalOpen)} icon={<AlertCircle className="h-3.5 w-3.5" />} color="bg-primary" hint={incidents.length > 0 ? `${((totalOpen / incidents.length) * 100).toFixed(0)}% del total` : "—"} onClick={() => setKpiPopup("open")} />
              <StatChip label="En Proceso" value={String(totalInProgress)} icon={<Clock className="h-3.5 w-3.5" />} color="bg-warning" hint={incidents.length > 0 ? `${((totalInProgress / incidents.length) * 100).toFixed(0)}% del total` : "—"} onClick={() => setKpiPopup("inProgress")} />
              <StatChip label="Críticos" value={String(totalCritical)} icon={<ShieldAlert className="h-3.5 w-3.5" />} color="bg-destructive" hint={incidents.length > 0 ? `${((totalCritical / incidents.length) * 100).toFixed(0)}% del total` : "—"} onClick={() => setKpiPopup("critical")} />
            </>
          )}
        </div>

        {/* Department Tabs */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <Button variant={!deptTab ? "secondary" : "ghost"} size="sm" onClick={() => setDeptTab("")}>Todos</Button>
          {departments.map((d) => (
            <Button key={d.id} variant={deptTab === d.id ? "secondary" : "ghost"} size="sm" onClick={() => setDeptTab(d.id)}>{d.name}</Button>
          ))}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar empleado..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <Select value={severityFilter || undefined} onValueChange={(v) => setSeverityFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Severidad" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {INCIDENT_SEVERITIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {INCIDENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
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
                    <TableHead className="text-xs font-medium text-muted-foreground">Título</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Tipo</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Severidad</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Fecha</TableHead>
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
                      <TableCell colSpan={7}>
                        {incidents.length === 0 ? (
                          <EmptyState seed="hr-incidentes" title="No hay incidentes registrados" description={'Haz clic en "Reportar Incidente" para empezar.'} />
                        ) : (
                          <EmptyState seed="hr-incidentes" title="Sin resultados" description="No hay coincidencias con los filtros aplicados." />
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((inc) => {
                      const emp = inc.employees;
                      const fullName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
                      const initials = emp ? getInitials(emp.first_name, emp.last_name) : "?";
                      const sev = SEVERITY_COLORS[inc.severity] ?? SEVERITY_COLORS.low;
                      return (
                        <TableRow key={inc.id} className="group hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-xs font-semibold text-primary">{initials}</span>
                              </div>
                              <div>
                                <p className="text-sm font-medium">{fullName}</p>
                                {emp?.employee_code && <p className="text-xs text-muted-foreground">{emp.employee_code}</p>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm max-w-48 truncate">{inc.title}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{INCIDENT_TYPES.find((t) => t.value === inc.incident_type)?.label ?? inc.incident_type}</TableCell>
                          <TableCell>
                            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", sev.bg, sev.text)}>
                              {INCIDENT_SEVERITIES.find((s) => s.value === inc.severity)?.label ?? inc.severity}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{format(new Date(inc.incident_date), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            <Badge variant={inc.status === "resolved" || inc.status === "closed" ? "default" : "secondary"}>
                              {INCIDENT_STATUSES.find((s) => s.value === inc.status)?.label ?? inc.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                            <div className="flex items-center gap-1">
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(inc)}><Eye className="h-3.5 w-3.5" /></Button>
                              </TooltipTrigger><TooltipContent side="left">Ver</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditItem(inc); setEditForm({ status: inc.status, severity: inc.severity, corrective_action: inc.corrective_action || "" }); }}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger><TooltipContent side="left">Editar</TooltipContent></Tooltip>
                              <Tooltip><TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(inc)}>
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
          <div>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
              </div>
            ) : filtered.length === 0 ? (
              incidents.length === 0 ? (
                <EmptyState seed="hr-incidentes" title="No hay incidentes registrados" description={'Haz clic en "Reportar Incidente" para empezar.'} />
              ) : (
                <EmptyState seed="hr-incidentes" title="Sin resultados" description="No hay coincidencias con los filtros aplicados." />
              )
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((inc) => {
                  const emp = inc.employees;
                  const fullName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
                  const initials = emp ? getInitials(emp.first_name, emp.last_name) : "?";
                  const sev = SEVERITY_COLORS[inc.severity] ?? SEVERITY_COLORS.low;
                  return (
                    <Card key={inc.id} className="group hover:shadow-md transition-all">
                      <CardContent className="p-4 space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-xs font-semibold text-primary">{initials}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{fullName}</p>
                              {emp?.employee_code && <p className="text-xs text-muted-foreground">{emp.employee_code}</p>}
                            </div>
                          </div>
                          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0", sev.bg, sev.text)}>
                            {INCIDENT_SEVERITIES.find((s) => s.value === inc.severity)?.label ?? inc.severity}
                          </span>
                        </div>

                        {/* Body */}
                        <div className="space-y-1">
                          <p className="text-sm font-medium truncate">{inc.title}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{INCIDENT_TYPES.find((t) => t.value === inc.incident_type)?.label ?? inc.incident_type}</span>
                            <span>·</span>
                            <span>{format(new Date(inc.incident_date), "dd/MM/yyyy")}</span>
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-1">
                          <Badge variant={inc.status === "resolved" || inc.status === "closed" ? "default" : "secondary"} className="text-xs">
                            {INCIDENT_STATUSES.find((s) => s.value === inc.status)?.label ?? inc.status}
                          </Badge>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewItem(inc)}><Eye className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditItem(inc); setEditForm({ status: inc.status, severity: inc.severity, corrective_action: inc.corrective_action || "" }); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteItem(inc)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Results counter */}
        {!isLoading && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Mostrando {filtered.length} de {incidents.length} incidentes
          </p>
        )}
      </div>

      {/* ── View Modal ─────────────────────────────────────────────────────── */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Detalle del Incidente</DialogTitle></DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-muted-foreground">Empleado</Label><p className="font-medium">{viewItem.employees ? `${viewItem.employees.first_name} ${viewItem.employees.last_name}` : "—"}</p></div>
                <div><Label className="text-muted-foreground">Fecha</Label><p className="font-medium">{format(new Date(viewItem.incident_date), "dd/MM/yyyy")}</p></div>
                <div><Label className="text-muted-foreground">Tipo</Label><p className="font-medium">{INCIDENT_TYPES.find((t) => t.value === viewItem.incident_type)?.label ?? viewItem.incident_type}</p></div>
                <div><Label className="text-muted-foreground">Severidad</Label><p className="font-medium">{INCIDENT_SEVERITIES.find((s) => s.value === viewItem.severity)?.label ?? viewItem.severity}</p></div>
                <div><Label className="text-muted-foreground">Estado</Label><p className="font-medium">{INCIDENT_STATUSES.find((s) => s.value === viewItem.status)?.label ?? viewItem.status}</p></div>
              </div>
              <div><Label className="text-muted-foreground">Título</Label><p className="font-medium">{viewItem.title}</p></div>
              {viewItem.description && <div><Label className="text-muted-foreground">Descripción</Label><p>{viewItem.description}</p></div>}
              {viewItem.corrective_action && <div><Label className="text-muted-foreground">Acción Correctiva</Label><p>{viewItem.corrective_action}</p></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Modal ─────────────────────────────────────────────────────── */}
      <Dialog open={!!editItem} onOpenChange={() => setEditItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Incidente</DialogTitle></DialogHeader>
          {editItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-muted-foreground text-xs">Empleado</Label><p className="text-sm font-medium">{editItem.employees ? `${editItem.employees.first_name} ${editItem.employees.last_name}` : "—"}</p></div>
                <div><Label className="text-muted-foreground text-xs">Título</Label><p className="text-sm font-medium">{editItem.title}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{INCIDENT_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Severidad</Label>
                  <Select value={editForm.severity} onValueChange={(v) => setEditForm((f) => ({ ...f, severity: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{INCIDENT_SEVERITIES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Acción Correctiva</Label>
                <Textarea value={editForm.corrective_action} onChange={(e) => setEditForm((f) => ({ ...f, corrective_action: e.target.value }))} rows={3} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ──────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar incidente?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer. Se eliminará permanentemente el incidente "{deleteItem?.title}".</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
            case "total": return `Total Incidentes — ${incidents.length}`;
            case "open": return `Abiertos — ${totalOpen}`;
            case "inProgress": return `En Proceso — ${totalInProgress}`;
            case "critical": return `Críticos — ${totalCritical}`;
            default: return "";
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = incidents;
          if (kpiPopup === "open") list = incidents.filter((i: any) => i.status === "open");
          else if (kpiPopup === "inProgress") list = incidents.filter((i: any) => i.status === "in_progress");
          else if (kpiPopup === "critical") list = incidents.filter((i: any) => i.severity === "critical");
          const tone = (severity: string): KpiRow["rightTone"] =>
            severity === "critical" ? "destructive" : severity === "high" ? "warning" : "default";
          return list.slice(0, 100).map((i: any): KpiRow => ({
            primary: i.title ?? i.description ?? "Sin título",
            secondary: i.employee_name ?? i.incident_type ?? undefined,
            right: i.severity ?? i.status ?? "—",
            rightTone: tone(i.severity ?? ""),
          }));
        })()}
      />
    </div>
  );
}
