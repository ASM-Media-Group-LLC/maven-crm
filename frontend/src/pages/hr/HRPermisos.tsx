import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock, CheckCircle2, CalendarDays, FileText, Search, ListIcon, LayoutGrid,
  Check, X, Eye, Plus, CalendarIcon, Wifi, LogOut, LogIn, User, Stethoscope,
  GraduationCap, Briefcase, Pencil, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EmployeeSearchCombobox } from "@/components/hr/EmployeeSearchCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import KpiCard from "@/components/dashboard/KpiCard";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";

// ─── Constants ────────────────────────────────────────────────────────────────
const PERMISSION_TYPES = [
  { value: "permiso_remoto", label: "Trabajo Remoto", icon: Wifi, color: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  { value: "salida_temprana", label: "Salida Temprana", icon: LogOut, color: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  { value: "llegada_tarde", label: "Llegada Tarde", icon: LogIn, color: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  { value: "permiso_personal", label: "Permiso Personal", icon: User, color: "bg-violet-500/10 text-violet-600 border-violet-500/30" },
  { value: "permiso_medico", label: "Permiso Médico", icon: Stethoscope, color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  { value: "permiso_academico", label: "Permiso Académico", icon: GraduationCap, color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/30" },
  { value: "permiso_diligencia", label: "Diligencia Personal", icon: Briefcase, color: "bg-rose-500/10 text-rose-600 border-rose-500/30" },
  { value: "incapacidad", label: "Incapacidad", icon: Stethoscope, color: "bg-red-500/10 text-red-600 border-red-500/30" },
] as const;

const PERMISSION_TYPE_VALUES = PERMISSION_TYPES.map((t) => t.value);

// ─── Types ────────────────────────────────────────────────────────────────────
interface PermisoRecord {
  id: string;
  employee_id: string;
  absence_type: string;
  start_date: string;
  end_date: string;
  total_days: number | null;
  notes: string | null;
  reason: string | null;
  status: string;
  created_at: string;
  employees: {
    first_name: string;
    last_name: string;
    email: string | null;
    employee_code: string | null;
    department_id: string | null;
    departments?: { id: string; name: string } | null;
  } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function getTypeConfig(val: string) {
  return PERMISSION_TYPES.find((t) => t.value === val);
}

function getStatusBadge(status: string) {
  if (status === "approved") return <Badge variant="default" className="text-xs bg-success/10 text-success border-success/30">Aprobado</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="text-xs">Rechazado</Badge>;
  return <Badge variant="secondary" className="text-xs text-warning border-warning/30">Pendiente</Badge>;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
function usePermisos() {
  return useQuery({
    queryKey: ["permisos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("absences")
        .select(`*, employees(first_name, last_name, email, employee_code, department_id, departments(id, name))`)
        .in("absence_type", PERMISSION_TYPE_VALUES)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PermisoRecord[];
    },
  });
}

function useDepartments() {
  return useQuery({
    queryKey: ["departments-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── Create Modal ─────────────────────────────────────────────────────────────
function CreatePermisoModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [permisoType, setPermisoType] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [horario, setHorario] = useState("");
  const [motivo, setMotivo] = useState("");

  const isValid = !!employeeId && !!permisoType && !!date;

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const dateStr = format(date!, "yyyy-MM-dd");
      const { error } = await supabase.from("absences").insert({
        employee_id: employeeId!,
        absence_type: permisoType,
        start_date: dateStr,
        end_date: dateStr,
        total_days: 1,
        notes: horario || null,
        reason: motivo || null,
        status: "pending",
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permisos"] });
      toast({ title: "Solicitud de permiso creada" });
      onOpenChange(false);
      setEmployeeId(null);
      setPermisoType("");
      setDate(undefined);
      setHorario("");
      setMotivo("");
    },
    onError: () => toast({ title: "Error al crear la solicitud", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex !flex-col gap-0 max-w-md p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 py-5 border-b">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <DialogTitle>Solicitar Permiso</DialogTitle>
          </div>
          <DialogDescription>
            Registra una solicitud de permiso de horario para un empleado
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          {/* Empleado */}
          <div className="space-y-1.5">
            <Label>Empleado <span className="text-destructive">*</span></Label>
            <EmployeeSearchCombobox value={employeeId} onChange={setEmployeeId} />
          </div>

          {/* Tipo de Permiso */}
          <div className="space-y-1.5">
            <Label>Tipo de Permiso <span className="text-destructive">*</span></Label>
            <Select value={permisoType} onValueChange={setPermisoType}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo de permiso..." />
              </SelectTrigger>
              <SelectContent>
                {PERMISSION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="flex items-center gap-2">
                      <t.icon className="h-3.5 w-3.5" />
                      {t.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fecha */}
          <div className="space-y-1.5">
            <Label>Fecha <span className="text-destructive">*</span></Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start font-normal", !date && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "dd 'de' MMMM yyyy", { locale: es }) : "Seleccionar fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => { setDate(d); setCalendarOpen(false); }}
                  locale={es}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Horario */}
          <div className="space-y-1.5">
            <Label>Horario</Label>
            <Input
              placeholder="Ej: 14:00 - 17:00"
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
            />
          </div>

          {/* Motivo */}
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Textarea
              placeholder="Describa el motivo del permiso..."
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 px-6 py-4 border-t flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
            className="flex-1"
          >
            {mutation.isPending ? "Guardando..." : "+ Crear Solicitud"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── View Modal ───────────────────────────────────────────────────────────────
function ViewPermisoModal({ permiso, onClose }: { permiso: PermisoRecord | null; onClose: () => void }) {
  if (!permiso) return null;
  const emp = permiso.employees;
  const empName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
  const typeConfig = getTypeConfig(permiso.absence_type);

  return (
    <Dialog open={!!permiso} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Detalle del Permiso</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold">
              {emp ? getInitials(emp.first_name, emp.last_name) : "—"}
            </div>
            <div>
              <p className="font-semibold text-sm">{empName}</p>
              <p className="text-xs text-muted-foreground">{emp?.email ?? emp?.departments?.name ?? "—"}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs mb-1">Tipo</p>
              {typeConfig ? (
                <Badge variant="outline" className={cn("text-xs gap-1", typeConfig.color)}>
                  <typeConfig.icon className="h-3 w-3" />
                  {typeConfig.label}
                </Badge>
              ) : <span>{permiso.absence_type}</span>}
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Estado</p>
              {getStatusBadge(permiso.status)}
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-1">Fecha</p>
              <p className="font-medium">{format(new Date(permiso.start_date), "dd MMM yyyy", { locale: es })}</p>
            </div>
            {permiso.notes && (
              <div>
                <p className="text-muted-foreground text-xs mb-1">Horario</p>
                <p className="font-medium">{permiso.notes}</p>
              </div>
            )}
          </div>
          {permiso.reason && (
            <div>
              <p className="text-muted-foreground text-xs mb-1">Motivo</p>
              <p className="text-sm">{permiso.reason}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function HRPermisos() {
  const { data: permisos = [], isLoading } = usePermisos();
  const { data: departments = [] } = useDepartments();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const navigate = useNavigate();
  const [viewPermiso, setViewPermiso] = useState<PermisoRecord | null>(null);
  const [editData, setEditData] = useState<PermisoRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  type KpiKey = "total" | "pendientes" | "aprobados" | "esteMes";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("absences")
        .update({ status, approved_by: user?.id, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permisos"] });
      toast({ title: "Estado actualizado" });
    },
    onError: () => toast({ title: "Error al actualizar estado", variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async (vals: { id: string; absence_type: string; start_date: string; end_date: string; notes: string | null; reason: string | null }) => {
      const { error } = await supabase.from("absences").update({
        absence_type: vals.absence_type,
        start_date: vals.start_date,
        end_date: vals.end_date,
        notes: vals.notes,
        reason: vals.reason,
      }).eq("id", vals.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permisos"] });
      toast({ title: "Permiso actualizado" });
      setEditData(null);
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("absences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permisos"] });
      toast({ title: "Permiso eliminado" });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  // KPIs
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const total = permisos.length;
  const pendientes = permisos.filter((p) => p.status === "pending").length;
  const aprobados = permisos.filter((p) => p.status === "approved").length;
  const esteMes = permisos.filter((p) => {
    const d = new Date(p.created_at);
    return d >= monthStart && d <= monthEnd;
  }).length;

  // Filtered
  const filtered = useMemo(() => {
    return permisos.filter((p) => {
      const emp = p.employees;
      const empName = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
      const matchSearch = !search || empName.includes(search.toLowerCase()) || (p.reason ?? "").toLowerCase().includes(search.toLowerCase());
      const matchType = !typeFilter || p.absence_type === typeFilter;
      const matchStatus = !statusFilter || p.status === statusFilter;
      const matchDept = !deptFilter || emp?.department_id === deptFilter;
      return matchSearch && matchType && matchStatus && matchDept;
    });
  }, [permisos, search, typeFilter, statusFilter, deptFilter]);

  // Department tabs
  const activeDepts = useMemo(() => {
    const ids = new Set(permisos.map((p) => p.employees?.department_id).filter(Boolean));
    return departments.filter((d) => ids.has(d.id));
  }, [permisos, departments]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-white/10 bg-background/30 backdrop-blur-xl px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Permisos</h1>
            <p className="text-sm text-muted-foreground">Gestiona las solicitudes de permisos de horario</p>
          </div>
          <Button onClick={() => navigate("/hr/permisos/nuevo")} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Solicitar Permiso
          </Button>
        </div>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          ) : (
            <>
              <KpiCard label="Total" value={String(total)} icon={FileText} color="bg-blue-500" onClick={() => setKpiPopup("total")} />
              <KpiCard label="Pendientes" value={String(pendientes)} icon={Clock} color="bg-amber-500" onClick={() => setKpiPopup("pendientes")} />
              <KpiCard label="Aprobados" value={String(aprobados)} icon={CheckCircle2} color="bg-emerald-500" onClick={() => setKpiPopup("aprobados")} />
              <KpiCard label="Este Mes" value={String(esteMes)} icon={CalendarDays} color="bg-violet-500" onClick={() => setKpiPopup("esteMes")} />
            </>
          )}
        </div>

        {/* Department tabs */}
        <div className="flex flex-wrap gap-1 items-center">
          <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            <Button
              variant={!deptFilter ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setDeptFilter("")}
            >
              Todos
            </Button>
            {departments.map((d) => (
              <Button
                key={d.id}
                variant={deptFilter === d.id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setDeptFilter(d.id)}
              >
                {d.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o motivo..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select value={typeFilter || undefined} onValueChange={(v) => setTypeFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Tipo de Permiso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos los tipos</SelectItem>
              {PERMISSION_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="approved">Aprobado</SelectItem>
              <SelectItem value="rejected">Rechazado</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setViewMode("list")}>
              <ListIcon className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setViewMode("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Count */}
        <p className="text-xs text-muted-foreground">
          Mostrando {filtered.length} de {permisos.length} registros
        </p>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Clock className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="font-medium text-muted-foreground">No hay permisos registrados</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Crea la primera solicitud de permiso</p>
          </div>
        ) : viewMode === "list" ? (
          /* ── Table View ── */
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="text-xs font-semibold w-52">Empleado</TableHead>
                    <TableHead className="text-xs font-semibold w-40">Tipo</TableHead>
                    <TableHead className="text-xs font-semibold w-32">Fecha</TableHead>
                    <TableHead className="text-xs font-semibold w-28">Horario</TableHead>
                    <TableHead className="text-xs font-semibold">Motivo</TableHead>
                    <TableHead className="text-xs font-semibold w-28">Estado</TableHead>
                    <TableHead className="text-xs font-semibold w-24 sticky right-0 bg-card">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const emp = p.employees;
                    const typeConfig = getTypeConfig(p.absence_type);
                    return (
                      <TableRow key={p.id} className="group">
                        {/* Empleado */}
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                              {emp ? getInitials(emp.first_name, emp.last_name) : "?"}
                            </div>
                            <div>
                              <p className="text-sm font-medium leading-tight">
                                {emp ? `${emp.first_name} ${emp.last_name}` : "—"}
                              </p>
                              <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                                {emp?.email ?? emp?.employee_code ?? "—"}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        {/* Tipo */}
                        <TableCell>
                          {typeConfig ? (
                            <Badge variant="outline" className={cn("text-xs gap-1 whitespace-nowrap", typeConfig.color)}>
                              <typeConfig.icon className="h-3 w-3" />
                              {typeConfig.label}
                            </Badge>
                          ) : (
                            <span className="text-sm">{p.absence_type}</span>
                          )}
                        </TableCell>

                        {/* Fecha */}
                        <TableCell className="text-sm whitespace-nowrap">
                          {format(new Date(p.start_date), "dd MMM yyyy", { locale: es })}
                        </TableCell>

                        {/* Horario */}
                        <TableCell className="text-sm text-muted-foreground">
                          {p.notes ?? "—"}
                        </TableCell>

                        {/* Motivo */}
                        <TableCell className="text-sm text-muted-foreground max-w-[180px]">
                          <span className="line-clamp-1">{p.reason ?? "—"}</span>
                        </TableCell>

                        {/* Estado */}
                        <TableCell>{getStatusBadge(p.status)}</TableCell>

                        {/* Acciones */}
                        <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewPermiso(p)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditData(p)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {p.status === "pending" && (
                              <>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-success hover:text-success" onClick={() => updateStatus.mutate({ id: p.id, status: "approved" })}>
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => updateStatus.mutate({ id: p.id, status: "rejected" })}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteId(p.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          /* ── Grid View ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((p) => {
              const emp = p.employees;
              const typeConfig = getTypeConfig(p.absence_type);
              return (
                <Card key={p.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                        {emp ? getInitials(emp.first_name, emp.last_name) : "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight truncate">
                          {emp ? `${emp.first_name} ${emp.last_name}` : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {emp?.email ?? emp?.departments?.name ?? "—"}
                        </p>
                      </div>
                    </div>

                    {/* Badges */}
                    <div className="flex flex-wrap gap-1">
                      {typeConfig && (
                        <Badge variant="outline" className={cn("text-xs gap-1", typeConfig.color)}>
                          <typeConfig.icon className="h-3 w-3" />
                          {typeConfig.label}
                        </Badge>
                      )}
                      {getStatusBadge(p.status)}
                    </div>

                    {/* Fecha + Horario */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                      <span>{format(new Date(p.start_date), "dd MMM yyyy", { locale: es })}</span>
                      {p.notes && <span className="ml-1 font-medium text-foreground">{p.notes}</span>}
                    </div>

                    {/* Motivo */}
                    {p.reason && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{p.reason}</p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1 pt-1 border-t border-border">
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setViewPermiso(p)}>
                        <Eye className="h-3 w-3" /> Ver
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setEditData(p)}>
                        <Pencil className="h-3 w-3" /> Editar
                      </Button>
                      {p.status === "pending" && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-success hover:text-success ml-auto" onClick={() => updateStatus.mutate({ id: p.id, status: "approved" })}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => updateStatus.mutate({ id: p.id, status: "rejected" })}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" className={cn("h-7 w-7 p-0 text-destructive hover:text-destructive", p.status !== "pending" && "ml-auto")} onClick={() => setDeleteId(p.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      <ViewPermisoModal permiso={viewPermiso} onClose={() => setViewPermiso(null)} />
      <ViewPermisoModal permiso={viewPermiso} onClose={() => setViewPermiso(null)} />

      {/* Edit Modal */}
      {editData && (
        <EditPermisoModal
          permiso={editData}
          onClose={() => setEditData(null)}
          onSave={(vals) => editMutation.mutate(vals)}
          isPending={editMutation.isPending}
        />
      )}

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar permiso?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El registro del permiso será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
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
            case "total": return `Total Permisos — ${total}`;
            case "pendientes": return `Pendientes — ${pendientes}`;
            case "aprobados": return `Aprobados — ${aprobados}`;
            case "esteMes": return `Este Mes — ${esteMes}`;
            default: return "";
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = permisos;
          if (kpiPopup === "pendientes") list = permisos.filter((p: any) => p.status === "pending");
          else if (kpiPopup === "aprobados") list = permisos.filter((p: any) => p.status === "approved");
          else if (kpiPopup === "esteMes") {
            const ms = startOfMonth(new Date());
            const me = endOfMonth(new Date());
            list = permisos.filter((p: any) => p.permission_date && new Date(p.permission_date) >= ms && new Date(p.permission_date) <= me);
          }
          const tone = (status: string): KpiRow["rightTone"] =>
            status === "approved" ? "success" : status === "rejected" ? "destructive" : "warning";
          return list.slice(0, 100).map((p: any): KpiRow => ({
            primary: p.employee_name ?? `Empleado ${p.employee_id?.slice?.(0, 8) ?? "—"}`,
            secondary: `${p.permission_type ?? ""} · ${p.permission_date ? format(new Date(p.permission_date), "dd MMM yyyy") : "—"}`,
            right: p.status ?? "—",
            rightTone: tone(p.status ?? ""),
          }));
        })()}
      />
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditPermisoModal({
  permiso,
  onClose,
  onSave,
  isPending,
}: {
  permiso: PermisoRecord;
  onClose: () => void;
  onSave: (vals: { id: string; absence_type: string; start_date: string; end_date: string; notes: string | null; reason: string | null }) => void;
  isPending: boolean;
}) {
  const emp = permiso.employees;
  const empName = emp ? `${emp.first_name} ${emp.last_name}` : "—";

  const [permisoType, setPermisoType] = useState(permiso.absence_type);
  const [date, setDate] = useState<Date | undefined>(new Date(permiso.start_date + "T12:00:00"));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [horario, setHorario] = useState(permiso.notes ?? "");
  const [motivo, setMotivo] = useState(permiso.reason ?? "");

  const handleSave = () => {
    if (!date) return;
    const dateStr = format(date, "yyyy-MM-dd");
    onSave({
      id: permiso.id,
      absence_type: permisoType,
      start_date: dateStr,
      end_date: dateStr,
      notes: horario || null,
      reason: motivo || null,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="!flex !flex-col gap-0 max-w-md p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 py-5 border-b">
          <div className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            <DialogTitle>Editar Permiso</DialogTitle>
          </div>
          <DialogDescription>Modifica los datos de la solicitud de permiso</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          {/* Empleado (readonly) */}
          <div className="space-y-1.5">
            <Label>Empleado</Label>
            <Input value={empName} readOnly className="bg-muted" />
          </div>

          {/* Tipo */}
          <div className="space-y-1.5">
            <Label>Tipo de Permiso</Label>
            <Select value={permisoType} onValueChange={setPermisoType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERMISSION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="flex items-center gap-2">
                      <t.icon className="h-3.5 w-3.5" />
                      {t.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fecha */}
          <div className="space-y-1.5">
            <Label>Fecha</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start font-normal", !date && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "dd 'de' MMMM yyyy", { locale: es }) : "Seleccionar fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => { setDate(d); setCalendarOpen(false); }}
                  locale={es}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Horario */}
          <div className="space-y-1.5">
            <Label>Horario</Label>
            <Input placeholder="Ej: 14:00 - 17:00" value={horario} onChange={(e) => setHorario(e.target.value)} />
          </div>

          {/* Motivo */}
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Textarea placeholder="Describa el motivo..." rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="shrink-0 px-6 py-4 border-t flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={handleSave} disabled={!date || isPending} className="flex-1">
            {isPending ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
