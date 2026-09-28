import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Search, Users, UserCheck, Clock, UserX, ListIcon, LayoutGrid, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFormato } from "@/hooks/useFormato";
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
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import HrAttendanceAuto from "./HrAttendanceAuto";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import type { Traductor } from "./etiquetasHr";

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
// `value` es lo que se guarda en attendance (shift / status): DATO, no se traduce.
const SHIFTS: { value: string; label: TranslationKey; start: string; end: string }[] = [
  { value: "turno_manana",  label: "hrg.att.shift.morning",  start: "08:00", end: "16:00" },
  { value: "turno_tarde",   label: "hrg.att.shift.afternoon",   start: "14:00", end: "22:00" },
  { value: "turno_noche",   label: "hrg.att.shift.night",   start: "22:00", end: "06:00" },
];

const STATUSES: { value: string; label: TranslationKey; variant: "success" | "warning" | "destructive" }[] = [
  { value: "presente",  label: "hrg.att.status.present",  variant: "success" },
  { value: "tardanza",  label: "hrg.att.status.late",  variant: "warning" },
  { value: "ausente",   label: "hrg.att.status.absent",   variant: "destructive" },
];

function getStatusVariant(status: string) {
  return STATUSES.find((s) => s.value === status)?.variant ?? "secondary";
}

function getStatusLabel(status: string, t: Traductor) {
  const s = STATUSES.find((x) => x.value === status);
  return s ? t(s.label) : status;
}

function getShiftLabel(shift: string, t: Traductor) {
  const s = SHIFTS.find((x) => x.value === shift);
  return s ? t(s.label) : shift;
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
  const formatoUI = useFormato();
  const { t } = useLanguage();
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
      toast({ title: t("hrg.att.created") });
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
    onError: () => toast({ title: t("hrg.att.createError"), variant: "destructive" }),
  });

  const canSubmit = !!employeeId && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex !flex-col gap-0 max-w-lg p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-lg font-semibold">{t("hrg.att.register")}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t("hrg.att.registerHint")}</p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label>{t("hrg.employee")} <span className="text-destructive">*</span></Label>
            <EmployeeSearchCombobox value={employeeId} onChange={setEmployeeId} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("common.date")}</Label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "dd/MM/yyyy") : t("hrg.att.selectDate")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => { if (d) { setDate(d); setDateOpen(false); } }}
                  initialFocus
                  locale={formatoUI.fechas}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label>{t("hrg.att.shift")}</Label>
            <Select value={shift} onValueChange={handleShiftChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SHIFTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{t(s.label)} ({s.start}–{s.end})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("hrg.att.shiftStart")}</Label>
              <Input type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("hrg.att.shiftEnd")}</Label>
              <Input type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("hrg.att.checkIn")}</Label>
              <Input type="datetime-local" value={checkIn} onChange={(e) => handleCheckInChange(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("hrg.att.checkOut")}</Label>
              <Input type="datetime-local" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("common.status")}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{t(s.label)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("hrg.notes")}</Label>
            <Textarea placeholder={t("hrg.att.notesPlaceholder")} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="shrink-0 px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>{t("common.cancel")}</Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending ? t("hrg.registering") : `+ ${t("hrg.att.register")}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Modal ──────────────────────────────────────────────────────────────
function EditAttendanceModal({ record, onClose }: { record: AttendanceRecord | null; onClose: () => void }) {
  const formatoUI = useFormato();
  const { t } = useLanguage();
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
      toast({ title: t("hrg.recordUpdated") });
      onClose();
    },
    onError: () => toast({ title: t("common.errorUpdating"), variant: "destructive" }),
  });

  if (!record) return null;
  const emp = record.employees;
  const empName = emp ? `${emp.first_name} ${emp.last_name}` : "—";

  return (
    <Dialog open={!!record} onOpenChange={onClose}>
      <DialogContent className="!flex !flex-col gap-0 max-w-lg p-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-lg font-semibold">{t("hrg.att.editTitle")}</DialogTitle>
          <p className="text-sm text-muted-foreground">{empName}</p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label>{t("common.date")}</Label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(date, "dd/MM/yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={(d) => { if (d) { setDate(d); setDateOpen(false); } }} initialFocus locale={formatoUI.fechas} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label>{t("hrg.att.shift")}</Label>
            <Select value={shift} onValueChange={(v) => { setShift(v); const f = SHIFTS.find((s) => s.value === v); if (f) { setShiftStart(f.start); setShiftEnd(f.end); } }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SHIFTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{t(s.label)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("hrg.att.shiftStart")}</Label>
              <Input type="time" value={shiftStart} onChange={(e) => setShiftStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("hrg.att.shiftEnd")}</Label>
              <Input type="time" value={shiftEnd} onChange={(e) => setShiftEnd(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("hrg.att.checkIn")}</Label>
              <Input type="datetime-local" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("hrg.att.checkOut")}</Label>
              <Input type="datetime-local" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("common.status")}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{t(s.label)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("hrg.notes")}</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="shrink-0 px-6 py-4 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? t("hrg.saving") : t("hrg.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function HRAttendance() {
  const formatoUI = useFormato();
  const { t } = useLanguage();
  const { data: records = [], isLoading } = useAttendance();
  const { data: departments = [] } = useDepartments();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [view, setView] = useState<"auto" | "manual">("auto");
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<AttendanceRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [deptTab, setDeptTab] = useState("");
  type KpiKey = "total" | "presentes" | "tardanzas" | "ausentes";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);
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
      toast({ title: t("hrg.recordDeleted") });
      setDeleteId(null);
    },
    onError: () => toast({ title: t("common.errorDeleting"), variant: "destructive" }),
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
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <PageHeader
          title={t("hrg.att.title")}
          subtitle={
            view === "auto"
              ? t("hrg.att.subtitleAuto")
              : t("hrg.att.subtitleManual")
          }
          actions={
            <>
              <div className="inline-flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 p-0.5">
                <Button variant={view === "auto" ? "secondary" : "ghost"} size="sm" onClick={() => setView("auto")}>
                  {t("hrg.att.auto")}
                </Button>
                <Button variant={view === "manual" ? "secondary" : "ghost"} size="sm" onClick={() => setView("manual")}>
                  {t("hrg.att.manual")}
                </Button>
              </div>
              {view === "manual" && (
                <Button onClick={() => setModalOpen(true)} size="sm">+ {t("hrg.att.registerShort")}</Button>
              )}
            </>
          }
        />
      </header>

      {/* ── Scrollable content ────────────────────────────────────────────────── */}
      {view === "auto" ? (
        <div className="flex-1 overflow-auto p-6">
          <HrAttendanceAuto />
        </div>
      ) : (
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          ) : (
            <>
              <StatChip label={t("hrg.att.kpi.total")} value={String(total)} icon={<Users className="h-3.5 w-3.5" />} color="bg-primary" hint={t("hrg.allRecords")} onClick={() => setKpiPopup("total")} />
              <StatChip label={t("hrg.att.kpi.present")} value={String(presentes)} icon={<UserCheck className="h-3.5 w-3.5" />} color="bg-success" hint={total > 0 ? t("hrg.ofTotal", { pct: ((presentes / total) * 100).toFixed(0) }) : "—"} onClick={() => setKpiPopup("presentes")} />
              <StatChip label={t("hrg.att.kpi.late")} value={String(tardanzas)} icon={<Clock className="h-3.5 w-3.5" />} color="bg-warning" hint={total > 0 ? t("hrg.ofTotal", { pct: ((tardanzas / total) * 100).toFixed(0) }) : "—"} onClick={() => setKpiPopup("tardanzas")} />
              <StatChip label={t("hrg.att.kpi.absent")} value={String(ausentes)} icon={<UserX className="h-3.5 w-3.5" />} color="bg-destructive" hint={total > 0 ? t("hrg.ofTotal", { pct: ((ausentes / total) * 100).toFixed(0) }) : "—"} onClick={() => setKpiPopup("ausentes")} />
            </>
          )}
        </div>

        {/* Department Tabs */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <Button variant={!deptTab ? "secondary" : "ghost"} size="sm" onClick={() => setDeptTab("")}>{t("common.all")}</Button>
          {departments.map((d) => (
            <Button key={d.id} variant={deptTab === d.id ? "secondary" : "ghost"} size="sm" onClick={() => setDeptTab(d.id)}>{d.name}</Button>
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
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{t(s.label)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={shiftFilter || undefined} onValueChange={(v) => setShiftFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder={t("hrg.att.shift")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("hrg.att.allShifts")}</SelectItem>
              {SHIFTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{t(s.label)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date From */}
          <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-32 justify-start text-left font-normal text-xs", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                {dateFrom ? format(dateFrom, "dd/MM/yy") : t("hrg.att.from")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d); setDateFromOpen(false); }} locale={formatoUI.fechas} className="p-3 pointer-events-auto" />
              {dateFrom && (
                <div className="border-t p-2">
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setDateFrom(undefined)}>{t("hrg.clear")}</Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Date To */}
          <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("w-32 justify-start text-left font-normal text-xs", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                {dateTo ? format(dateTo, "dd/MM/yy") : t("hrg.att.to")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d); setDateToOpen(false); }} locale={formatoUI.fechas} className="p-3 pointer-events-auto" />
              {dateTo && (
                <div className="border-t p-2">
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setDateTo(undefined)}>{t("hrg.clear")}</Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {(search || statusFilter || shiftFilter || dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setSearch(""); setStatusFilter(""); setShiftFilter(""); setDateFrom(undefined); setDateTo(undefined); }}>
              {t("hrg.clearFilters")}
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-28rem)]">
            <Table>
              <TableHeader>
                <TableRow className="sticky top-0 z-10 bg-card border-b">
                  <TableHead className="text-xs font-medium text-muted-foreground">{t("hrg.employee")}</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">{t("hrg.att.shift")}</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">{t("hrg.schedule")}</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">{t("common.date")}</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Check-In</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Check-Out</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">{t("common.duration")}</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">{t("common.status")}</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">{t("hrg.notes")}</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground sticky right-0 bg-card">{t("common.actions")}</TableHead>
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
                        ? t("hrg.att.empty")
                        : t("hrg.noResultsFilters")}
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
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{getShiftLabel(r.shift, t)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {r.shift_start && r.shift_end ? `${r.shift_start.slice(0,5)}–${r.shift_end.slice(0,5)}` : "—"}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{format(new Date(r.date), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap font-mono">{formatTime(r.check_in)}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap font-mono">{formatTime(r.check_out)}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{formatDuration(r.check_in, r.check_out)}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(r.status)} className="text-xs">{getStatusLabel(r.status, t)}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">{r.notes ?? "—"}</TableCell>
                        <TableCell className="sticky right-0 bg-card group-hover:bg-muted/30">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditRecord(r)} title={t("common.edit")}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)} title={t("common.delete")}>
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
            {t("hrg.att.showing", { shown: filtered.length, total: records.length })}
          </p>
        )}
      </div>
      )}

      <RegisterAttendanceModal open={modalOpen} onOpenChange={setModalOpen} />
      <EditAttendanceModal record={editRecord} onClose={() => setEditRecord(null)} />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hrg.att.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("hrg.att.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
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
            case "total": return t("hrg.kpiTitle", { label: t("hrg.att.kpi.total"), value: total });
            case "presentes": return t("hrg.kpiTitle", { label: t("hrg.att.kpi.present"), value: presentes });
            case "tardanzas": return t("hrg.kpiTitle", { label: t("hrg.att.kpi.late"), value: tardanzas });
            case "ausentes": return t("hrg.kpiTitle", { label: t("hrg.att.kpi.absent"), value: ausentes });
            default: return "";
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = records;
          if (kpiPopup === "presentes") list = records.filter((r: any) => r.status === "presente");
          else if (kpiPopup === "tardanzas") list = records.filter((r: any) => r.status === "tardanza");
          else if (kpiPopup === "ausentes") list = records.filter((r: any) => r.status === "ausente");
          const tone = (status: string): KpiRow["rightTone"] =>
            status === "presente" ? "success" : status === "ausente" ? "destructive" : status === "tardanza" ? "warning" : "default";
          return list.slice(0, 100).map((r: any): KpiRow => ({
            primary: r.employee_name ?? (r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : t("hrg.employeeId", { id: r.employee_id?.slice?.(0, 8) ?? "—" })),
            secondary: r.date ? format(new Date(r.date), "dd MMM yyyy") : undefined,
            right: r.status ? getStatusLabel(r.status, t) : "—",
            rightTone: tone(r.status ?? ""),
          }));
        })()}
      />
    </div>
  );
}
