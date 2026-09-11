import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Clock, CalendarDays, Search, ListIcon, LayoutGrid,
  Check, X, Eye, Plus, CalendarIcon, Pencil, Trash2,
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ABSENCE_TYPES, ABSENCE_STATUSES } from "@/lib/hrConstants";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { PageHeader } from "@/components/ui/page-header";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface AbsenceRecord {
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
    employee_code: string | null;
    job_title?: string | null;
    department_id: string | null;
    departments?: { id: string; name: string } | null;
  } | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function getInitials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function getAbsenceTypeLabel(val: string) {
  return ABSENCE_TYPES.find((t) => t.value === val)?.label ?? val;
}

function getStatusLabel(val: string) {
  return ABSENCE_STATUSES.find((s) => s.value === val)?.label ?? val;
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "approved") return "default";
  if (status === "rejected") return "destructive";
  return "secondary";
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear();
  if (sameMonth) {
    return `${format(s, "d")} - ${format(e, "d MMM", { locale: es })}`;
  }
  return `${format(s, "d MMM", { locale: es })} - ${format(e, "d MMM", { locale: es })}`;
}

// ─── Hooks ─────────────────────────────────────────────────────────────────────
function useAbsences() {
  return useQuery({
    queryKey: ["absences"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("absences")
        .select(`
          *,
          employees(first_name, last_name, employee_code, department_id,
            departments(id, name)
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AbsenceRecord[];
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

// ─── Register Modal ─────────────────────────────────────────────────────────────
interface RegisterModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function RegisterAbsenceModal({ open, onOpenChange }: RegisterModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [absenceType, setAbsenceType] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const isValid = !!employeeId && !!absenceType && !!startDate && !!endDate;

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const start = startDate!;
      const end = endDate!;
      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      const { error } = await supabase.from("absences").insert({
        employee_id: employeeId!,
        absence_type: absenceType,
        start_date: format(start, "yyyy-MM-dd"),
        end_date: format(end, "yyyy-MM-dd"),
        total_days: days,
        notes: notes || null,
        status: "pending",
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absences"] });
      toast({ title: "Falta registrada correctamente" });
      onOpenChange(false);
      setEmployeeId(null);
      setAbsenceType("");
      setStartDate(undefined);
      setEndDate(undefined);
      setNotes("");
    },
    onError: () => toast({ title: "Error al registrar la falta", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex !flex-col gap-0 max-w-md p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 py-5 border-b">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <DialogTitle>Registrar Falta</DialogTitle>
          </div>
          <DialogDescription>
            Registra una falta injustificada o sin aviso previo
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Empleado <span className="text-destructive">*</span></Label>
            <EmployeeSearchCombobox value={employeeId} onChange={setEmployeeId} />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de Falta <span className="text-destructive">*</span></Label>
            <Select value={absenceType} onValueChange={setAbsenceType}>
              <SelectTrigger><SelectValue placeholder="Seleccionar tipo..." /></SelectTrigger>
              <SelectContent>
                {ABSENCE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha Inicio <span className="text-destructive">*</span></Label>
              <Popover open={startOpen} onOpenChange={setStartOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start font-normal", !startDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy") : "Fecha inicio"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => { setStartDate(d); setStartOpen(false); }} locale={es} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha Fin <span className="text-destructive">*</span></Label>
              <Popover open={endOpen} onOpenChange={setEndOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start font-normal", !endDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd/MM/yyyy") : "Fecha fin"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d); setEndOpen(false); }} locale={es} disabled={(d) => startDate ? d < startDate : false} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea placeholder="Descripción o contexto de la falta..." rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="shrink-0 px-6 py-4 border-t flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancelar</Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={!isValid || mutation.isPending} className="flex-1">
            {mutation.isPending ? "Guardando..." : "+ Registrar Falta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Modal ─────────────────────────────────────────────────────────────────
function EditAbsenceModal({ absence, onClose }: { absence: AbsenceRecord | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [absenceType, setAbsenceType] = useState(absence?.absence_type ?? "");
  const [startDate, setStartDate] = useState<Date | undefined>(absence ? new Date(absence.start_date) : undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(absence ? new Date(absence.end_date) : undefined);
  const [notes, setNotes] = useState(absence?.notes ?? "");
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const days = startDate && endDate ? Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1) : null;
      const { error } = await supabase.from("absences").update({
        absence_type: absenceType,
        start_date: startDate ? format(startDate, "yyyy-MM-dd") : absence!.start_date,
        end_date: endDate ? format(endDate, "yyyy-MM-dd") : absence!.end_date,
        total_days: days,
        notes: notes || null,
      }).eq("id", absence!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absences"] });
      toast({ title: "Falta actualizada" });
      onClose();
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  if (!absence) return null;
  const emp = absence.employees;
  const empName = emp ? `${emp.first_name} ${emp.last_name}` : "—";

  return (
    <Dialog open={!!absence} onOpenChange={onClose}>
      <DialogContent className="!flex !flex-col gap-0 max-w-md p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 py-5 border-b">
          <DialogTitle>Editar Falta</DialogTitle>
          <DialogDescription>{empName}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo de Falta</Label>
            <Select value={absenceType} onValueChange={setAbsenceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ABSENCE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha Inicio</Label>
              <Popover open={startOpen} onOpenChange={setStartOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy") : "—"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => { setStartDate(d); setStartOpen(false); }} locale={es} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha Fin</Label>
              <Popover open={endOpen} onOpenChange={setEndOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "dd/MM/yyyy") : "—"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={(d) => { setEndDate(d); setEndOpen(false); }} locale={es} disabled={(d) => startDate ? d < startDate : false} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="shrink-0 px-6 py-4 border-t flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="flex-1">
            {mutation.isPending ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── View Modal ─────────────────────────────────────────────────────────────────
function ViewAbsenceModal({ absence, onClose }: { absence: AbsenceRecord | null; onClose: () => void }) {
  if (!absence) return null;
  const emp = absence.employees;
  const empName = emp ? `${emp.first_name} ${emp.last_name}` : "—";

  return (
    <Dialog open={!!absence} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Detalle de Ausencia</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold">
              {emp ? getInitials(emp.first_name, emp.last_name) : "—"}
            </div>
            <div>
              <p className="font-semibold text-sm">{empName}</p>
              <p className="text-xs text-muted-foreground">{emp?.departments?.name ?? "Sin departamento"}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">Tipo de Falta</p>
              <Badge variant="outline">{getAbsenceTypeLabel(absence.absence_type)}</Badge>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">Estado</p>
              <Badge variant={getStatusVariant(absence.status)}>{getStatusLabel(absence.status)}</Badge>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">Fechas</p>
              <p className="font-medium">{formatDateRange(absence.start_date, absence.end_date)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">Días</p>
              <p className="font-medium">{absence.total_days ?? "—"}</p>
            </div>
          </div>
          {absence.notes && (
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">Observaciones</p>
              <p className="text-sm">{absence.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function HRAbsences() {
  const { data: absences = [], isLoading } = useAbsences();
  const { data: departments = [] } = useDepartments();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [viewAbsence, setViewAbsence] = useState<AbsenceRecord | null>(null);
  const [editAbsence, setEditAbsence] = useState<AbsenceRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  type KpiKey = "total" | "pendientes" | "esteMes";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("absences")
        .update({ status, approved_by: user?.id, approved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absences"] });
      toast({ title: "Estado actualizado" });
    },
    onError: () => toast({ title: "Error al actualizar el estado", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("absences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["absences"] });
      toast({ title: "Falta eliminada" });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  // KPIs
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const totalFaltas = absences.length;
  const pendientes = absences.filter((a) => a.status === "pending").length;
  const esteMes = absences.filter((a) => {
    const d = new Date(a.created_at);
    return d >= monthStart && d <= monthEnd;
  }).length;

  // Filtered
  const filtered = useMemo(() => {
    return absences.filter((a) => {
      const emp = (a as any).employees;
      const empName = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
      const matchSearch = !search || empName.includes(search.toLowerCase()) || (a.notes ?? "").toLowerCase().includes(search.toLowerCase());
      const matchType = !typeFilter || a.absence_type === typeFilter;
      const matchStatus = !statusFilter || a.status === statusFilter;
      const matchDept = !deptFilter || emp?.department_id === deptFilter;
      return matchSearch && matchType && matchStatus && matchDept;
    });
  }, [absences, search, typeFilter, statusFilter, deptFilter]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-white/10 bg-background/30 backdrop-blur-xl px-6 py-4">
        <PageHeader
          title="Ausencias / Faltas"
          subtitle="Faltas injustificadas y sin aviso previo"
          actions={
            <Button onClick={() => setModalOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Registrar Falta
            </Button>
          }
        />
      </header>

      {/* ── Scrollable content ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* KPI Cards — clickeables, abren modal con la lista filtrada */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatChip label="Total Faltas" value={String(totalFaltas)} icon={<AlertTriangle className="h-3.5 w-3.5" />} color="bg-primary" onClick={() => setKpiPopup("total")} />
          <StatChip label="Pendientes" value={String(pendientes)} icon={<Clock className="h-3.5 w-3.5" />} color="bg-warning" onClick={() => setKpiPopup("pendientes")} />
          <StatChip label="Este Mes" value={String(esteMes)} icon={<CalendarDays className="h-3.5 w-3.5" />} color="bg-primary" onClick={() => setKpiPopup("esteMes")} />
        </div>

        {/* Department Tabs */}
        {departments.length > 0 && (
          <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 flex-wrap">
            <Button size="sm" variant={!deptFilter ? "secondary" : "ghost"} className="text-sm" onClick={() => setDeptFilter("")}>Todos</Button>
            {departments.map((d) => (
              <Button key={d.id} size="sm" variant={deptFilter === d.id ? "secondary" : "ghost"} className="text-sm" onClick={() => setDeptFilter(d.id)}>{d.name}</Button>
            ))}
          </div>
        )}

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar empleado u observaciones..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
          <Select value={typeFilter || undefined} onValueChange={(v) => setTypeFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Tipo de Falta" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos los tipos</SelectItem>
              {ABSENCE_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {ABSENCE_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
            <Button size="sm" variant={viewMode === "list" ? "secondary" : "ghost"} className="h-7 w-7 p-0" onClick={() => setViewMode("list")}><ListIcon className="h-4 w-4" /></Button>
            <Button size="sm" variant={viewMode === "grid" ? "secondary" : "ghost"} className="h-7 w-7 p-0" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">Mostrando {filtered.length} de {absences.length} registros</p>

        {/* ── List View ─────────────────────────────────────────────────────── */}
        {viewMode === "list" && (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="text-xs">Empleado</TableHead>
                    <TableHead className="text-xs">Tipo de Falta</TableHead>
                    <TableHead className="text-xs">Fechas</TableHead>
                    <TableHead className="text-xs">Días</TableHead>
                    <TableHead className="text-xs">Observaciones</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                    <TableHead className="text-xs sticky right-0 bg-card">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5" /></TableCell>)}</TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-14">
                        <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p>Sin ausencias registradas</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((a) => {
                      const emp = (a as any).employees;
                      const empName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
                      const initials = emp ? getInitials(emp.first_name, emp.last_name) : "—";
                      return (
                        <TableRow key={a.id} className="group">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{initials}</div>
                              <div>
                                <p className="text-sm font-semibold leading-tight">{empName}</p>
                                <p className="text-xs text-muted-foreground">{emp?.departments?.name ?? "—"}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{getAbsenceTypeLabel(a.absence_type)}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDateRange(a.start_date, a.end_date)}</TableCell>
                          <TableCell>
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">{a.total_days ?? "—"}</span>
                          </TableCell>
                          <TableCell className="max-w-[180px]"><p className="text-xs text-muted-foreground truncate">{a.notes ?? "—"}</p></TableCell>
                          <TableCell>
                            <Badge variant={getStatusVariant(a.status)} className={cn("text-xs", a.status === "pending" && "border-warning/50 bg-warning/10 text-warning", a.status === "approved" && "border-primary/50 bg-primary/10 text-primary")}>
                              {getStatusLabel(a.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="sticky right-0 bg-card">
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => setViewAbsence(a)} title="Ver detalle"><Eye className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditAbsence(a)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                              {a.status === "pending" && (
                                <>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-primary hover:text-primary hover:bg-primary/10" onClick={() => updateStatus.mutate({ id: a.id, status: "approved" })} title="Aprobar"><Check className="h-3.5 w-3.5" /></Button>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => updateStatus.mutate({ id: a.id, status: "rejected" })} title="Rechazar"><X className="h-3.5 w-3.5" /></Button>
                                </>
                              )}
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteId(a.id)} title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></Button>
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
        )}

        {/* ── Grid View ─────────────────────────────────────────────────────── */}
        {viewMode === "grid" && (
          isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 mb-3 opacity-30" />
              <p>Sin ausencias registradas</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((a) => {
                const emp = (a as any).employees;
                const empName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
                const initials = emp ? getInitials(emp.first_name, emp.last_name) : "—";
                return (
                  <div key={a.id} className="rounded-lg border bg-card p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{initials}</div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight truncate">{empName}</p>
                        <p className="text-xs text-muted-foreground truncate">{emp?.departments?.name ?? "Sin departamento"}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-xs">{getAbsenceTypeLabel(a.absence_type)}</Badge>
                      <Badge variant={getStatusVariant(a.status)} className={cn("text-xs", a.status === "pending" && "border-warning/50 bg-warning/10 text-warning", a.status === "approved" && "border-primary/50 bg-primary/10 text-primary")}>
                        {getStatusLabel(a.status)}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{formatDateRange(a.start_date, a.end_date)}</span>
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">{a.total_days ?? "—"}</span>
                    </div>
                    {a.notes && <p className="text-xs text-muted-foreground line-clamp-2">{a.notes}</p>}
                    <div className="flex items-center gap-1 pt-1 border-t">
                      {a.status === "pending" && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 flex-1 text-xs text-primary hover:text-primary hover:bg-primary/10" onClick={() => updateStatus.mutate({ id: a.id, status: "approved" })}>
                            <Check className="h-3.5 w-3.5 mr-1" /> Aprobar
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 flex-1 text-xs text-destructive hover:bg-destructive/10" onClick={() => updateStatus.mutate({ id: a.id, status: "rejected" })}>
                            <X className="h-3.5 w-3.5 mr-1" /> Rechazar
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground ml-auto" onClick={() => setViewAbsence(a)}><Eye className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditAbsence(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteId(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Modals */}
      <RegisterAbsenceModal open={modalOpen} onOpenChange={setModalOpen} />
      <ViewAbsenceModal absence={viewAbsence} onClose={() => setViewAbsence(null)} />
      <EditAbsenceModal absence={editAbsence} onClose={() => setEditAbsence(null)} />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar falta?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer. El registro será eliminado permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          switch (kpiPopup) {
            case "total": return `Total Faltas — ${totalFaltas}`;
            case "pendientes": return `Faltas Pendientes — ${pendientes}`;
            case "esteMes": return `Faltas Este Mes — ${esteMes}`;
            default: return "";
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = absences;
          if (kpiPopup === "pendientes") list = absences.filter(a => a.status === "pending");
          else if (kpiPopup === "esteMes") {
            const now = new Date();
            const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            list = absences.filter((a: any) => a.start_date && new Date(a.start_date) >= startMonth);
          }
          const tone = (status: string): KpiRow["rightTone"] =>
            status === "approved" ? "success" : status === "rejected" ? "destructive" : "warning";
          return list.slice(0, 100).map((a: any): KpiRow => ({
            primary: a.employee_name ?? `Empleado ${a.employee_id?.slice?.(0, 8) ?? "—"}`,
            secondary: `${a.absence_type ?? ""} · ${a.start_date ? new Date(a.start_date).toLocaleDateString("es") : "—"}`,
            right: a.status ?? "—",
            rightTone: tone(a.status ?? ""),
          }));
        })()}
      />
    </div>
  );
}
