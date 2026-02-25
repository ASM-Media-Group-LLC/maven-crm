import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Search, Users, UserCheck, Clock, UserX, ListIcon, LayoutGrid, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEmployees } from "@/hooks/useEmployees";
import { EmployeeSearchCombobox } from "@/components/hr/EmployeeSearchCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AttendanceRecord {
  id: string;
  employee_id: string;
  shift: string;
  shift_start: string | null;
  shift_end: string | null;
  check_in: string | null;
  check_out: string | null;
  date: string;
  status: string;
  notes: string | null;
  created_at: string;
  employees: {
    first_name: string;
    last_name: string;
    employee_code: string | null;
    department_id: string | null;
    departments?: { id: string; name: string } | null;
  } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const SHIFTS = [
  { value: "turno_manana",  label: "Turno Mañana",  start: "08:00", end: "16:00" },
  { value: "turno_tarde",   label: "Turno Tarde",   start: "14:00", end: "22:00" },
  { value: "turno_noche",   label: "Turno Noche",   start: "22:00", end: "06:00" },
];

const STATUSES = [
  { value: "presente",  label: "Presente",  variant: "success" as const },
  { value: "tardanza",  label: "Tardanza",  variant: "warning" as const },
  { value: "ausente",   label: "Ausente",   variant: "destructive" as const },
];

function getStatusVariant(status: string) {
  return STATUSES.find((s) => s.value === status)?.variant ?? "secondary";
}

function getStatusLabel(status: string) {
  return STATUSES.find((s) => s.value === status)?.label ?? status;
}

function getShiftLabel(shift: string) {
  return SHIFTS.find((s) => s.value === shift)?.label ?? shift;
}

function formatDuration(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn || !checkOut) return "—";
  const mins = differenceInMinutes(new Date(checkOut), new Date(checkIn));
  if (mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatTime(ts: string | null): string {
  if (!ts) return "—";
  return format(new Date(ts), "HH:mm");
}

function getInitials(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
function useAttendance() {
  return useQuery({
    queryKey: ["attendance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select(`
          *,
          employees(first_name, last_name, employee_code, department_id,
            departments(id, name)
          )
        `)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttendanceRecord[];
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

// ─── Register Modal ──────────────────────────────────────────────────────────
interface RegisterModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function RegisterAttendanceModal({ open, onOpenChange }: RegisterModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [shift, setShift] = useState("turno_manana");
  const [shiftStart, setShiftStart] = useState("08:00");
  const [shiftEnd, setShiftEnd] = useState("16:00");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [status, setStatus] = useState("presente");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [dateOpen, setDateOpen] = useState(false);

  function handleShiftChange(val: string) {
    setShift(val);
    const found = SHIFTS.find((s) => s.value === val);
    if (found) {
      setShiftStart(found.start);
      setShiftEnd(found.end);
    }
  }

  function handleCheckInChange(val: string) {
    setCheckIn(val);
    if (val && shiftStart) {
      const [sh, sm] = shiftStart.split(":").map(Number);
      const [ch, cm] = val.split("T")[1]?.split(":").map(Number) ?? val.split(":").map(Number);
      const shiftMins = sh * 60 + sm;
      const checkMins = ch * 60 + cm;
      if (checkMins - shiftMins > 10) {
        setStatus("tardanza");
      } else {
        setStatus("presente");
      }
    }
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("attendance").insert({
        employee_id: employeeId!,
        shift,
        shift_start: shiftStart || null,
        shift_end: shiftEnd || null,
        check_in: checkIn ? new Date(checkIn).toISOString() : null,
        check_out: checkOut ? new Date(checkOut).toISOString() : null,
        date: format(date, "yyyy-MM-dd"),
        status,
        notes: notes || null,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast({ title: "Asistencia registrada correctamente" });
      onOpenChange(false);
      setEmployeeId(null);
      setShift("turno_manana");
      setShiftStart("08:00");
      setShiftEnd("16:00");
      setCheckIn("");
      setCheckOut("");
      setStatus("presente");
      setNotes("");
      setDate(new Date());
    },
    onError: () => toast({ title: "Error al registrar asistencia", variant: "destructive" }),
  });

  const canSubmit = !!employeeId && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex !flex-col gap-0 max-w-lg p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-lg font-semibold">Registrar Asistencia</DialogTitle>
          <p className="text-sm text-muted-foreground">Complete los datos del registro de asistencia</p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Empleado <span className="text-destructive">*</span></Label>
            <EmployeeSearchCombobox value={employeeId} onChange={setEmployeeId} />
          </div>

          <div className="space-y-1.5">
            <Label>Fecha</Label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "dd/MM/yyyy") : "Seleccionar fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => { if (d) { setDate(d); setDateOpen(false); } }}
                  initialFocus
                  locale={es}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label>Turno</Label>
            <Select value={shift} onValueChange={handleShiftChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SHIFTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label} ({s.start}–{s.end})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Inicio Turno</Label>
              <Input type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fin Turno</Label>
              <Input type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Hora de Entrada</Label>
              <Input type="datetime-local" value={checkIn} onChange={(e) => handleCheckInChange(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hora de Salida</Label>
              <Input type="datetime-local" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea placeholder="Observaciones adicionales..." rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="shrink-0 px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending ? "Registrando..." : "+ Registrar Asistencia"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Modal ──────────────────────────────────────────────────────────────
function EditAttendanceModal({ record, onClose }: { record: AttendanceRecord | null; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [shift, setShift] = useState(record?.shift ?? "turno_manana");
  const [shiftStart, setShiftStart] = useState(record?.shift_start?.slice(0, 5) ?? "08:00");
  const [shiftEnd, setShiftEnd] = useState(record?.shift_end?.slice(0, 5) ?? "16:00");
  const [checkIn, setCheckIn] = useState(record?.check_in ? format(new Date(record.check_in), "yyyy-MM-dd'T'HH:mm") : "");
  const [checkOut, setCheckOut] = useState(record?.check_out ? format(new Date(record.check_out), "yyyy-MM-dd'T'HH:mm") : "");
  const [status, setStatus] = useState(record?.status ?? "presente");
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [date, setDate] = useState<Date>(record ? new Date(record.date) : new Date());
  const [dateOpen, setDateOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("attendance").update({
        shift,
        shift_start: shiftStart || null,
        shift_end: shiftEnd || null,
        check_in: checkIn ? new Date(checkIn).toISOString() : null,
        check_out: checkOut ? new Date(checkOut).toISOString() : null,
        date: format(date, "yyyy-MM-dd"),
        status,
        notes: notes || null,
      }).eq("id", record!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast({ title: "Registro actualizado" });
      onClose();
    },
    onError: () => toast({ title: "Error al actualizar", variant: "destructive" }),
  });

  if (!record) return null;
  const emp = record.employees;
  const empName = emp ? `${emp.first_name} ${emp.last_name}` : "—";

  return (
    <Dialog open={!!record} onOpenChange={onClose}>
      <DialogContent className="!flex !flex-col gap-0 max-w-lg p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-lg font-semibold">Editar Registro</DialogTitle>
          <p className="text-sm text-muted-foreground">{empName}</p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Fecha</Label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(date, "dd/MM/yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={(d) => { if (d) { setDate(d); setDateOpen(false); } }} initialFocus locale={es} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label>Turno</Label>
            <Select value={shift} onValueChange={(v) => { setShift(v); const f = SHIFTS.find((s) => s.value === v); if (f) { setShiftStart(f.start); setShiftEnd(f.end); } }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SHIFTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Inicio Turno</Label>
              <Input type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fin Turno</Label>
              <Input type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Hora de Entrada</Label>
              <Input type="datetime-local" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hora de Salida</Label>
              <Input type="datetime-local" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="shrink-0 px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HRAttendance() {
  const { data: records = [], isLoading } = useAttendance();
  const { data: departments = [] } = useDepartments();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<AttendanceRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [deptTab, setDeptTab] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("attendance").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast({ title: "Registro eliminado" });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  // ─── KPIs ──────────────────────────────────────────────────────────────────
  const total     = records.length;
  const presentes = records.filter((r) => r.status === "presente").length;
  const tardanzas = records.filter((r) => r.status === "tardanza").length;
  const ausentes  = records.filter((r) => r.status === "ausente").length;

  // ─── Filtering ─────────────────────────────────────────────────────────────
  const filtered = records.filter((r) => {
    const emp = r.employees;
    const fullName = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
    const matchSearch = !search || fullName.includes(search.toLowerCase());
    const matchStatus = !statusFilter || r.status === statusFilter;
    const matchShift  = !shiftFilter || r.shift === shiftFilter;
    const matchDept   = !deptTab || emp?.department_id === deptTab;
    const recordDate  = new Date(r.date);
    const matchFrom   = !dateFrom || recordDate >= dateFrom;
    const matchTo     = !dateTo   || recordDate <= dateTo;
    return matchSearch && matchStatus && matchShift && matchDept && matchFrom && matchTo;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Fixed Header ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Control de Asistencia</h1>
            <p className="text-sm text-muted-foreground">Registro y seguimiento de asistencia del equipo</p>
          </div>
          <Button onClick={() => setModalOpen(true)} size="sm">
            + Registrar Asistencia
          </Button>
        </div>
      </header>

      {/* ── Scrollable content ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          ) : (
            <>
              <DashboardMetricCard label="Total Registros" value={String(total)} icon={Users} subtitle="Todos los registros" color="primary" />
              <DashboardMetricCard label="Presentes" value={String(presentes)} icon={UserCheck} subtitle={total > 0 ? `${((presentes / total) * 100).toFixed(0)}% del total` : "—"} color="success" />
              <DashboardMetricCard label="Tardanzas" value={String(tardanzas)} icon={Clock} subtitle={total > 0 ? `${((tardanzas / total) * 100).toFixed(0)}% del total` : "—"} color="warning" />
              <DashboardMetricCard label="Ausentes" value={String(ausentes)} icon={UserX} subtitle={total > 0 ? `${((ausentes / total) * 100).toFixed(0)}% del total` : "—"} color="destructive" />
            </>
          )}
        </div>

        {/* Department Tabs */}
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
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

          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={shiftFilter || undefined} onValueChange={(v) => setShiftFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Turno" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos los turnos</SelectItem>
              {SHIFTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date From */}
          <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-32 justify-start text-left font-normal text-xs", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                {dateFrom ? format(dateFrom, "dd/MM/yy") : "Desde"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d); setDateFromOpen(false); }} locale={es} className="p-3 pointer-events-auto" />
              {dateFrom && (
                <div className="border-t p-2">
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setDateFrom(undefined)}>Limpiar</Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Date To */}
          <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-32 justify-start text-left font-normal text-xs", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                {dateTo ? format(dateTo, "dd/MM/yy") : "Hasta"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d); setDateToOpen(false); }} locale={es} className="p-3 pointer-events-auto" />
              {dateTo && (
                <div className="border-t p-2">
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setDateTo(undefined)}>Limpiar</Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {(search || statusFilter || shiftFilter || dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setSearch(""); setStatusFilter(""); setShiftFilter(""); setDateFrom(undefined); setDateTo(undefined); }}>
              Limpiar filtros
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-28rem)]">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 z-10 bg-card border-b">
                  <TableHead className="text-xs font-medium text-muted-foreground">Empleado</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Turno</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Horario</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Fecha</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Check-In</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Check-Out</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Duración</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Estado</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Notas</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-12">
                      {records.length === 0
                        ? "No hay registros de asistencia. Haz clic en \"+ Registrar Asistencia\" para empezar."
                        : "Sin resultados para los filtros aplicados."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => {
                    const emp = r.employees;
                    const fullName = emp ? `${emp.first_name} ${emp.last_name}` : "—";
                    const initials = emp ? getInitials(emp.first_name, emp.last_name) : "?";
                    return (
                      <TableRow key={r.id} className="group hover:bg-muted/30 transition-colors">
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
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{getShiftLabel(r.shift)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {r.shift_start && r.shift_end ? `${r.shift_start.slice(0,5)}–${r.shift_end.slice(0,5)}` : "—"}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{format(new Date(r.date), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap font-mono">{formatTime(r.check_in)}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap font-mono">{formatTime(r.check_out)}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{formatDuration(r.check_in, r.check_out)}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(r.status)} className="text-xs">{getStatusLabel(r.status)}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">{r.notes ?? "—"}</TableCell>
                        <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditRecord(r)} title="Editar">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)} title="Eliminar">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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

        {!isLoading && filtered.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Mostrando {filtered.length} de {records.length} registros
          </p>
        )}
      </div>

      <RegisterAttendanceModal open={modalOpen} onOpenChange={setModalOpen} />
      <EditAttendanceModal record={editRecord} onClose={() => setEditRecord(null)} />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer. El registro de asistencia será eliminado permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
