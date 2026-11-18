import { formatUI } from "@/lib/formatoHora";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sun, CalendarDays, Plus, Check, X, Eye, Search,
  List, LayoutGrid, Clock, CheckCircle2, XCircle, CalendarClock,
  ChevronLeft, ChevronRight, Users, Pencil, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEmployees } from "@/hooks/useEmployees";
import { EmployeeSearchCombobox } from "@/components/hr/EmployeeSearchCombobox";
import { PageHeader } from "@/components/ui/page-header";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, isSameMonth, isToday, differenceInCalendarDays } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import { traducir, type TranslationKey } from "@/lib/i18n";
import { DIAS_CORTOS } from "./etiquetasRrhh";

// ─── Constants ─────────────────────────────────────────────────────
// `value` es el absence_type que se guarda (DATO); `label`/`short` son las claves de lo que se ve.
const VACATION_TYPES = [
  { value: "vacaciones", label: "hr.opt.vacType.vacaciones", short: "hr.opt.vacShort.vacaciones", icon: Sun, color: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
  { value: "dia_personal", label: "hr.opt.vacType.dia_personal", short: "hr.opt.vacShort.dia_personal", icon: CalendarDays, color: "bg-violet-500/10 text-violet-500 border-violet-500/30" },
] as const;

type VacationType = "vacaciones" | "dia_personal";

const ANNUAL_VACATION_DAYS = 15;
const ANNUAL_PERSONAL_DAYS = 12;

const STATUS_CONFIG: Record<string, { label: TranslationKey; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  pending: { label: "hr.opt.absStatus.pending", variant: "secondary", color: "text-warning border-warning/40" },
  approved: { label: "hr.opt.absStatus.approved", variant: "default", color: "text-success border-success/40" },
  rejected: { label: "hr.opt.absStatus.rejected", variant: "destructive", color: "text-destructive border-destructive/40" },
};

/** "Vacaciones" / "Personal": la etiqueta corta del tipo, en el idioma de la interfaz. */
const tipoCorto = (tipo: string, t: (k: TranslationKey) => string) =>
  t(tipo === "vacaciones" ? "hr.opt.vacShort.vacaciones" : "hr.opt.vacShort.dia_personal");

// ─── Data hook ─────────────────────────────────────────────────────
function useVacationAbsences() {
  return useQuery({
    queryKey: ["vacation-absences"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("absences")
        .select("*, employees(first_name, last_name, employee_code, position_id, department_id)")
        .in("absence_type", ["vacaciones", "dia_personal"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// ─── Edit Form ─────────────────────────────────────────────────────
function EditVacationForm({ data, onSave, onCancel, isPending }: { data: any; onSave: (d: any) => void; onCancel: () => void; isPending: boolean }) {
  const { t } = useLanguage();
  const [startDate, setStartDate] = useState<Date | undefined>(new Date(data.start_date));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date(data.end_date));
  const [reason, setReason] = useState(data.reason ?? "");
  const f = useFormato();
  const DMY = f.idioma === "en" ? "MM/dd/yyyy" : "dd/MM/yyyy";

  const handleSave = () => {
    const days = startDate && endDate ? Math.max(1, differenceInCalendarDays(endDate, startDate) + 1) : data.total_days;
    onSave({
      start_date: startDate ? format(startDate, "yyyy-MM-dd") : data.start_date,
      end_date: endDate ? format(endDate, "yyyy-MM-dd") : data.end_date,
      total_days: days,
      reason: reason || null,
    });
  };

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("hr.startDate")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start font-normal")}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, DMY) : "—"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={setStartDate} locale={f.fechas} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label>{t("hr.endDate")}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start font-normal")}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, DMY) : "—"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endDate} onSelect={setEndDate} locale={f.fechas} disabled={(d) => startDate ? d < startDate : false} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("hr.reasonLabel")}</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
      <DialogFooter className="shrink-0 px-6 py-4 border-t flex gap-2">
        <Button variant="outline" onClick={onCancel} className="flex-1">{t("common.cancel")}</Button>
        <Button onClick={handleSave} disabled={isPending} className="flex-1">{isPending ? t("hr.saving") : t("hr.saveChanges")}</Button>
      </DialogFooter>
    </>
  );
}

// ─── Component ─────────────────────────────────────────────────────
export default function HRVacations() {
  const { t } = useLanguage();
  const { data: absences = [], isLoading } = useVacationAbsences();
  const { data: employees = [] } = useEmployees();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const f = useFormato();
  const DMY = f.idioma === "en" ? "MM/dd/yyyy" : "dd/MM/yyyy";

  // State
  const [activeType, setActiveType] = useState<VacationType>("vacaciones");
  const [activeView, setActiveView] = useState<"solicitudes" | "balances" | "historial" | "calendario">("solicitudes");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  type KpiKey = "total" | "pending" | "approved" | "rejected" | "upcoming" | "thisMonth" | "available";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalData, setViewModalData] = useState<any>(null);
  const [editData, setEditData] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // Form
  const [form, setForm] = useState({ employee_id: "", start_date: undefined as Date | undefined, end_date: undefined as Date | undefined, reason: "" });

  // ─── Computed ──────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  const typeAbsences = useMemo(() => absences.filter((a) => a.absence_type === activeType), [absences, activeType]);

  const filtered = useMemo(() => {
    let items = activeView === "historial" ? typeAbsences : typeAbsences;
    if (activeView === "solicitudes" && statusFilter) {
      items = items.filter((a) => a.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((a) => {
        const emp = (a as any).employees;
        const name = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
        return name.includes(q) || (a.reason ?? "").toLowerCase().includes(q);
      });
    }
    return items;
  }, [typeAbsences, statusFilter, search, activeView]);

  // KPI data
  const totalRequests = typeAbsences.length;
  const pending = typeAbsences.filter((a) => a.status === "pending").length;
  const approved = typeAbsences.filter((a) => a.status === "approved").length;
  const rejected = typeAbsences.filter((a) => a.status === "rejected").length;
  const upcoming = typeAbsences.filter((a) => a.status === "approved" && new Date(a.start_date) > new Date()).length;

  const approvedThisYear = typeAbsences
    .filter((a) => a.status === "approved" && new Date(a.start_date).getFullYear() === currentYear)
    .reduce((s, a) => s + (a.total_days ?? 0), 0);
  const approvedThisMonth = typeAbsences
    .filter((a) => a.status === "approved" && new Date(a.start_date).getFullYear() === currentYear && new Date(a.start_date).getMonth() === currentMonth)
    .reduce((s, a) => s + (a.total_days ?? 0), 0);

  const maxDays = activeType === "vacaciones" ? ANNUAL_VACATION_DAYS : ANNUAL_PERSONAL_DAYS;
  const availableDays = Math.max(0, maxDays - approvedThisYear);

  // ─── Mutations ─────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!form.start_date || !form.end_date) throw new Error(traducir("hr.vac.datesRequired"));
      const days = Math.max(1, differenceInCalendarDays(form.end_date, form.start_date) + 1);
      const { error } = await supabase.from("absences").insert({
        employee_id: form.employee_id,
        absence_type: activeType,
        start_date: format(form.start_date, "yyyy-MM-dd"),
        end_date: format(form.end_date, "yyyy-MM-dd"),
        reason: form.reason,
        total_days: days,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-absences"] });
      toast({ title: t("hr.vac.created") });
      setModalOpen(false);
      setForm({ employee_id: "", start_date: undefined, end_date: undefined, reason: "" });
    },
    onError: () => toast({ title: t("hr.errorCreatingRequest"), variant: "destructive" }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("absences").update({
        status, approved_by: user?.id, approved_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-absences"] });
      toast({ title: t("hr.statusUpdated") });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("absences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-absences"] });
      toast({ title: t("hr.vac.deleted") });
      setDeleteId(null);
    },
    onError: () => toast({ title: t("common.errorDeleting"), variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const { error } = await supabase.from("absences").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vacation-absences"] });
      toast({ title: t("hr.vac.updated") });
      setEditData(null);
    },
    onError: () => toast({ title: t("common.errorUpdating"), variant: "destructive" }),
  });

  // ─── Helper renders ────────────────────────────────────────────
  const typeConfig = VACATION_TYPES.find((t) => t.value === activeType)!;

  const renderStatusBadge = (status: string) => {
    const cfg = STATUS_CONFIG[status];
    if (!cfg) return <Badge variant="outline" className="text-xs">{status}</Badge>;
    return <Badge variant={cfg.variant} className={cn("text-xs", cfg.color)}>{t(cfg.label)}</Badge>;
  };

  const renderActions = (item: any) => (
    <div className="flex gap-1">
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewModalData(item)}>
        <Eye className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditData(item)}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      {item.status === "pending" && (
        <>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-success" onClick={() => updateStatus.mutate({ id: item.id, status: "approved" })}>
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => updateStatus.mutate({ id: item.id, status: "rejected" })}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteId(item.id)}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  const getEmpName = (a: any) => {
    const emp = a.employees;
    return emp ? `${emp.first_name} ${emp.last_name}` : "—";
  };

  const getInitials = (a: any) => {
    const emp = a.employees;
    if (!emp) return "??";
    return `${emp.first_name?.[0] ?? ""}${emp.last_name?.[0] ?? ""}`.toUpperCase();
  };

  // ─── Balances data ─────────────────────────────────────────────
  const balancesData = useMemo(() => {
    return employees.map((emp) => {
      const empAbsences = absences.filter((a) => a.employee_id === emp.id && a.status === "approved" && new Date(a.start_date).getFullYear() === currentYear);
      const vacUsed = empAbsences.filter((a) => a.absence_type === "vacaciones").reduce((s, a) => s + (a.total_days ?? 0), 0);
      const persUsed = empAbsences.filter((a) => a.absence_type === "dia_personal").reduce((s, a) => s + (a.total_days ?? 0), 0);
      return { emp, vacUsed, persUsed, vacAvail: Math.max(0, ANNUAL_VACATION_DAYS - vacUsed), persAvail: Math.max(0, ANNUAL_PERSONAL_DAYS - persUsed) };
    });
  }, [employees, absences, currentYear]);

  // ─── Calendar data ─────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth);
    const end = endOfMonth(calendarMonth);
    return eachDayOfInterval({ start, end });
  }, [calendarMonth]);

  const calendarAbsences = useMemo(() => {
    return typeAbsences.filter((a) => a.status === "approved");
  }, [typeAbsences]);

  const getAbsencesForDay = (day: Date) => {
    return calendarAbsences.filter((a) => {
      const s = new Date(a.start_date);
      const e = new Date(a.end_date);
      return day >= s && day <= e;
    });
  };

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <PageHeader
          title={t("hr.vac.title")}
          subtitle={t("hr.vac.subtitle")}
          actions={
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              {t("hr.newRequest")}
            </Button>
          }
        />
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* Type tabs */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {VACATION_TYPES.map((vt) => (
            <Button
              key={vt.value}
              variant={activeType === vt.value ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
              onClick={() => setActiveType(vt.value as VacationType)}
            >
              <vt.icon className="h-4 w-4" />
              {t(vt.label)}
            </Button>
          ))}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          ) : activeType === "vacaciones" ? (
            <>
              <StatChip label={t("hr.vac.totalRequests")} value={String(totalRequests)} icon={<CalendarDays className="h-3.5 w-3.5" />} color="bg-primary" hint={`${currentYear}`} onClick={() => setKpiPopup("total")} />
              <StatChip label={t("common.pendingPl")} value={String(pending)} icon={<Clock className="h-3.5 w-3.5" />} color="bg-warning" hint={t("hr.vac.toApprove")} onClick={() => setKpiPopup("pending")} />
              <StatChip label={t("hr.vac.approvedPl")} value={String(approved)} icon={<CheckCircle2 className="h-3.5 w-3.5" />} color="bg-success" hint={t("hr.vac.confirmed")} onClick={() => setKpiPopup("approved")} />
              <StatChip label={t("hr.vac.rejectedPl")} value={String(rejected)} icon={<XCircle className="h-3.5 w-3.5" />} color="bg-destructive" hint={t("hr.vac.denied")} onClick={() => setKpiPopup("rejected")} />
              <StatChip label={t("hr.vac.upcoming")} value={String(upcoming)} icon={<CalendarClock className="h-3.5 w-3.5" />} color="bg-primary" hint={t("hr.vac.scheduled")} onClick={() => setKpiPopup("upcoming")} />
            </>
          ) : (
            <>
              {/* "Días Usados / Disponibles" son métricas agregadas sin
                  lista propia: las dejamos estáticas (sin onClick). */}
              <StatChip label={t("hr.vac.daysUsed")} value={String(approvedThisYear)} icon={<CalendarDays className="h-3.5 w-3.5" />} color="bg-primary" hint={t("hr.vac.ofAnnual", { max: maxDays })} />
              <StatChip label={t("hr.vac.available")} value={String(availableDays)} icon={<CheckCircle2 className="h-3.5 w-3.5" />} color="bg-success" hint={t("hr.vac.remaining")} />
              <StatChip label={t("common.pendingPl")} value={String(pending)} icon={<Clock className="h-3.5 w-3.5" />} color="bg-warning" hint={t("hr.vac.toApprove")} onClick={() => setKpiPopup("pending")} />
              <StatChip label={t("hr.thisMonth")} value={String(approvedThisMonth)} icon={<CalendarClock className="h-3.5 w-3.5" />} color="bg-primary" hint={format(new Date(), "MMMM yyyy", { locale: f.fechas })} onClick={() => setKpiPopup("thisMonth")} />
              <StatChip label={t("hr.vac.rejectedPl")} value={String(rejected)} icon={<XCircle className="h-3.5 w-3.5" />} color="bg-destructive" hint={t("hr.vac.denied")} onClick={() => setKpiPopup("rejected")} />
            </>
          )}
        </div>

        {/* View tabs */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {([
            { key: "solicitudes", label: "hr.vac.tab.requests" },
            { key: "balances", label: "hr.bank.balances" },
            { key: "historial", label: "hr.vac.tab.history" },
            { key: "calendario", label: "hr.vac.tab.calendar", icon: CalendarDays },
          ] as const).map((tab) => (
            <Button
              key={tab.key}
              variant={activeView === tab.key ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
              onClick={() => setActiveView(tab.key as any)}
            >
              {"icon" in tab && tab.icon && <tab.icon className="h-3.5 w-3.5" />}
              {t(tab.label)}
            </Button>
          ))}
        </div>

        {/* ─── View: Solicitudes / Historial ───────────────────────── */}
        {(activeView === "solicitudes" || activeView === "historial") && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t("hr.searchByNameOrReason")} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {activeView === "solicitudes" && (
              <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="w-40"><SelectValue placeholder={t("common.status")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t("common.all")}</SelectItem>
                    <SelectItem value="pending">{t("common.pendingPl")}</SelectItem>
                    <SelectItem value="approved">{t("hr.vac.approvedPl")}</SelectItem>
                    <SelectItem value="rejected">{t("hr.vac.rejectedPl")}</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("list")}>
                  <List className="h-4 w-4" />
                </Button>
                <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("grid")}>
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">{t(filtered.length === 1 ? "hr.vac.requestsCount.one" : "hr.vac.requestsCount.other", { count: filtered.length })}</p>

            {/* Table view */}
            {viewMode === "list" ? (
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[60vh] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead className="text-xs">{t("hr.employee")}</TableHead>
                        <TableHead className="text-xs">{t("common.type")}</TableHead>
                        <TableHead className="text-xs">{t("hr.period")}</TableHead>
                        <TableHead className="text-xs">{t("common.days")}</TableHead>
                        <TableHead className="text-xs">{t("common.reason")}</TableHead>
                        <TableHead className="text-xs">{t("common.status")}</TableHead>
                        <TableHead className="text-xs w-28 sticky right-0 bg-card">{t("common.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5" /></TableCell>)}</TableRow>
                        ))
                      ) : filtered.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">{t("hr.vac.empty")}</TableCell></TableRow>
                      ) : (
                        filtered.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                                  {getInitials(a)}
                                </div>
                                <div>
                                  <p className="text-sm font-medium leading-tight">{getEmpName(a)}</p>
                                  <p className="text-xs text-muted-foreground">{(a as any).employees?.employee_code ?? ""}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn("text-xs", VACATION_TYPES.find((t) => t.value === a.absence_type)?.color)}>
                                {tipoCorto(a.absence_type, t)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              <div className="leading-tight">
                                <span>{format(new Date(a.start_date), "dd MMM", { locale: f.fechas })}</span>
                                <span className="text-muted-foreground"> — </span>
                                <span>{format(new Date(a.end_date), "dd MMM yyyy", { locale: f.fechas })}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm font-medium">{a.total_days}</TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate">{a.reason ?? "—"}</TableCell>
                            <TableCell>{renderStatusBadge(a.status)}</TableCell>
                            <TableCell className="sticky right-0 bg-card">{renderActions(a)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              /* Grid view */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.length === 0 ? (
                  <p className="col-span-full text-center text-muted-foreground py-10">{t("hr.vac.empty")}</p>
                ) : (
                  filtered.map((a) => (
                    <Card key={a.id} className="hover:border-primary/30 transition-colors">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                              {getInitials(a)}
                            </div>
                            <div>
                              <p className="text-sm font-medium leading-tight">{getEmpName(a)}</p>
                              <p className="text-xs text-muted-foreground">{(a as any).employees?.employee_code ?? ""}</p>
                            </div>
                          </div>
                          {renderStatusBadge(a.status)}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={cn("text-xs", VACATION_TYPES.find((t) => t.value === a.absence_type)?.color)}>
                            {tipoCorto(a.absence_type, t)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{t(a.total_days === 1 ? "hr.days.one" : "hr.days.other", { count: a.total_days ?? "" })}</span>
                        </div>
                        <p className="text-sm">
                          {format(new Date(a.start_date), "dd MMM", { locale: f.fechas })} — {format(new Date(a.end_date), "dd MMM yyyy", { locale: f.fechas })}
                        </p>
                        {a.reason && <p className="text-xs text-muted-foreground line-clamp-2">{a.reason}</p>}
                        <div className="flex justify-end">{renderActions(a)}</div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {/* ─── View: Balances ──────────────────────────────────────── */}
        {activeView === "balances" && (
          <div className="border rounded-lg overflow-hidden">
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="text-xs">{t("hr.employee")}</TableHead>
                    <TableHead className="text-xs">{t("hr.vac.vacUsed")}</TableHead>
                    <TableHead className="text-xs">{t("hr.vac.vacAvailable")}</TableHead>
                    <TableHead className="text-xs">{t("hr.vac.persUsed")}</TableHead>
                    <TableHead className="text-xs">{t("hr.vac.persAvailable")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balancesData.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">{t("hr.vac.noEmployees")}</TableCell></TableRow>
                  ) : (
                    balancesData.map(({ emp, vacUsed, vacAvail, persUsed, persAvail }) => (
                      <TableRow key={emp.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                              {`${emp.first_name?.[0] ?? ""}${emp.last_name?.[0] ?? ""}`.toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{emp.first_name} {emp.last_name}</p>
                              <p className="text-xs text-muted-foreground">{emp.employee_code}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <span className="text-sm font-medium">{vacUsed} / {ANNUAL_VACATION_DAYS}</span>
                            <Progress value={(vacUsed / ANNUAL_VACATION_DAYS) * 100} className="h-1.5" />
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-success">{vacAvail}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <span className="text-sm font-medium">{persUsed} / {ANNUAL_PERSONAL_DAYS}</span>
                            <Progress value={(persUsed / ANNUAL_PERSONAL_DAYS) * 100} className="h-1.5" />
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-medium text-success">{persAvail}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* ─── View: Calendario ────────────────────────────────────── */}
        {activeView === "calendario" && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
            <Card>
              <CardContent className="p-4">
                {/* Month navigation */}
                <div className="flex items-center justify-between mb-4">
                  <Button variant="ghost" size="icon" onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold capitalize">{format(calendarMonth, "MMMM yyyy", { locale: f.fechas })}</h3>
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setCalendarMonth(new Date())}>{t("common.today")}</Button>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Legend */}
                <div className="flex gap-4 mb-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> {t("hr.opt.vacShort.vacaciones")}</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" /> {t("hr.opt.vacType.dia_personal")}</span>
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                  {DIAS_CORTOS.map((d) => (
                    <div key={d} className="bg-muted/50 text-center text-xs font-medium text-muted-foreground py-2">{t(d)}</div>
                  ))}
                  {/* Empty cells for offset */}
                  {Array.from({ length: (getDay(startOfMonth(calendarMonth)) + 6) % 7 }).map((_, i) => (
                    <div key={`empty-${i}`} className="bg-card min-h-[70px]" />
                  ))}
                  {calendarDays.map((day) => {
                    const dayAbsences = getAbsencesForDay(day);
                    const isSelected = selectedDay && isSameDay(day, selectedDay);
                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          "bg-card min-h-[70px] p-1 cursor-pointer hover:bg-muted/30 transition-colors",
                          isToday(day) && "ring-1 ring-primary/50",
                          isSelected && "bg-primary/10",
                        )}
                        onClick={() => setSelectedDay(day)}
                      >
                        <span className={cn("text-xs", isToday(day) ? "font-bold text-primary" : "text-muted-foreground")}>{format(day, "d")}</span>
                        <div className="mt-0.5 space-y-0.5">
                          {dayAbsences.slice(0, 3).map((a) => (
                            <div key={a.id} className={cn("text-[10px] truncate rounded px-1 py-0.5 leading-tight", a.absence_type === "vacaciones" ? "bg-blue-500/15 text-blue-400" : "bg-violet-500/15 text-violet-400")}>
                              {getEmpName(a).split(" ")[0]}
                            </div>
                          ))}
                          {dayAbsences.length > 3 && <p className="text-[10px] text-muted-foreground">+{dayAbsences.length - 3}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Day detail panel */}
            <Card>
              <CardContent className="p-4">
                {selectedDay ? (
                  <>
                    <h4 className="text-sm font-semibold mb-3 capitalize">{format(selectedDay, "EEEE dd MMMM", { locale: f.fechas })}</h4>
                    {getAbsencesForDay(selectedDay).length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t("hr.vac.noAbsencesDay")}</p>
                    ) : (
                      <div className="space-y-2">
                        {getAbsencesForDay(selectedDay).map((a) => (
                          <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                              {getInitials(a)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{getEmpName(a)}</p>
                              <p className="text-xs text-muted-foreground">{t(a.total_days === 1 ? "hr.days.one" : "hr.days.other", { count: a.total_days ?? "" })} · {tipoCorto(a.absence_type, t)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center py-8 text-muted-foreground">
                    <CalendarDays className="h-8 w-8 mb-2 opacity-40" />
                    <p className="text-sm">{t("hr.vac.pickDay")}</p>
                    <p className="text-xs">{t("hr.vac.pickDayHint")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ─── New Request Modal ──────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="!flex !flex-col gap-0 max-w-md">
          <DialogHeader className="shrink-0 p-6 pb-4">
            <DialogTitle>{t("hr.newRequest")} — {t(typeConfig.label)}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 space-y-4">
            <div className="space-y-1.5">
              <Label>{t("hr.employee")}</Label>
              <EmployeeSearchCombobox value={form.employee_id || null} onChange={(v) => setForm((prev) => ({ ...prev, employee_id: v ?? "" }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.type")}</Label>
              <div className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-sm", typeConfig.color)}>
                <typeConfig.icon className="h-4 w-4" />
                {t(typeConfig.label)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("hr.startDate")}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.start_date && "text-muted-foreground")}>
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {form.start_date ? format(form.start_date, DMY) : t("common.select")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={form.start_date} onSelect={(d) => setForm((prev) => ({ ...prev, start_date: d }))} locale={f.fechas} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label>{t("hr.endDate")}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.end_date && "text-muted-foreground")}>
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {form.end_date ? format(form.end_date, DMY) : t("common.select")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={form.end_date} onSelect={(d) => setForm((prev) => ({ ...prev, end_date: d }))} locale={f.fechas} disabled={(d) => form.start_date ? d < form.start_date : false} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("hr.reasonLabel")}</Label>
              <Textarea placeholder={t("hr.vac.reasonPlaceholder")} rows={3} value={form.reason} onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="shrink-0 p-6 pt-4">
            <Button variant="outline" onClick={() => setModalOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!form.employee_id || !form.start_date || !form.end_date || createMutation.isPending}>
              {createMutation.isPending ? t("hr.creating") : t("hr.createRequestPlus")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── View Detail Modal ─────────────────────────────────────── */}
      <Dialog open={!!viewModalData} onOpenChange={(o) => !o && setViewModalData(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("hr.vac.detail")}</DialogTitle>
          </DialogHeader>
          {viewModalData && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                  {getInitials(viewModalData)}
                </div>
                <div>
                  <p className="font-medium">{getEmpName(viewModalData)}</p>
                  <p className="text-xs text-muted-foreground">{(viewModalData as any).employees?.employee_code}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">{t("common.type")}</p><Badge variant="outline" className={cn("mt-1", VACATION_TYPES.find((vt) => vt.value === viewModalData.absence_type)?.color)}>{tipoCorto(viewModalData.absence_type, t)}</Badge></div>
                <div><p className="text-xs text-muted-foreground">{t("common.status")}</p><div className="mt-1">{renderStatusBadge(viewModalData.status)}</div></div>
                <div><p className="text-xs text-muted-foreground">{t("hr.vac.start")}</p><p className="font-medium">{format(new Date(viewModalData.start_date), DMY)}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("hr.vac.end")}</p><p className="font-medium">{format(new Date(viewModalData.end_date), DMY)}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("hr.vac.totalDays")}</p><p className="font-medium">{viewModalData.total_days}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("hr.vac.createdAt")}</p><p className="font-medium">{formatUI(new Date(viewModalData.created_at), `${DMY} HH:mm`)}</p></div>
              </div>
              {viewModalData.reason && <div><p className="text-xs text-muted-foreground">{t("hr.reasonLabel")}</p><p className="text-sm mt-1">{viewModalData.reason}</p></div>}
              {viewModalData.status === "pending" && (
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1 gap-1" variant="default" onClick={() => { updateStatus.mutate({ id: viewModalData.id, status: "approved" }); setViewModalData(null); }}>
                    <Check className="h-4 w-4" /> {t("hr.approve")}
                  </Button>
                  <Button className="flex-1 gap-1" variant="destructive" onClick={() => { updateStatus.mutate({ id: viewModalData.id, status: "rejected" }); setViewModalData(null); }}>
                    <X className="h-4 w-4" /> {t("hr.reject")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={!!editData} onOpenChange={(o) => !o && setEditData(null)}>
        <DialogContent className="!flex !flex-col gap-0 max-w-md p-0 overflow-hidden">
          <DialogHeader className="shrink-0 px-6 py-5 border-b">
            <DialogTitle>{t("hr.vac.edit")}</DialogTitle>
            <DialogDescription>{editData ? getEmpName(editData) : ""}</DialogDescription>
          </DialogHeader>
          {editData && <EditVacationForm data={editData} onSave={(d) => editMutation.mutate({ id: editData.id, data: d })} onCancel={() => setEditData(null)} isPending={editMutation.isPending} />}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hr.vac.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("common.cannotBeUndone")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          switch (kpiPopup) {
            case "total": return `${t("hr.vac.totalRequests")} — ${totalRequests}`;
            case "pending": return `${t("common.pendingPl")} — ${pending}`;
            case "approved": return `${t("hr.vac.approvedPl")} — ${approved}`;
            case "rejected": return `${t("hr.vac.rejectedPl")} — ${rejected}`;
            case "upcoming": return `${t("hr.vac.upcoming")} — ${upcoming}`;
            case "thisMonth": return `${t("hr.thisMonth")} — ${approvedThisMonth}`;
            default: return "";
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          let list = typeAbsences;
          if (kpiPopup === "pending") list = typeAbsences.filter((a: any) => a.status === "pending");
          else if (kpiPopup === "approved") list = typeAbsences.filter((a: any) => a.status === "approved");
          else if (kpiPopup === "rejected") list = typeAbsences.filter((a: any) => a.status === "rejected");
          else if (kpiPopup === "upcoming") list = typeAbsences.filter((a: any) => a.status === "approved" && new Date(a.start_date) > new Date());
          else if (kpiPopup === "thisMonth") {
            const now = new Date();
            list = typeAbsences.filter((a: any) => a.status === "approved" && new Date(a.start_date).getFullYear() === now.getFullYear() && new Date(a.start_date).getMonth() === now.getMonth());
          }
          const tone = (status: string): KpiRow["rightTone"] =>
            status === "approved" ? "success" : status === "rejected" ? "destructive" : "warning";
          return list.slice(0, 100).map((a: any): KpiRow => ({
            primary: a.employee_name ?? t("hr.employeeWithId", { id: a.employee_id?.slice?.(0, 8) ?? "—" }),
            secondary: a.start_date && a.end_date ? `${format(new Date(a.start_date), "dd MMM")} → ${format(new Date(a.end_date), "dd MMM yyyy")}` : undefined,
            // En español, el value tal cual, como siempre; en inglés, su etiqueta.
            right: f.idioma === "en" && STATUS_CONFIG[a.status] ? t(STATUS_CONFIG[a.status].label) : (a.status ?? "—"),
            rightTone: tone(a.status ?? ""),
          }));
        })()}
        emptyText={t("hr.kpiEmpty")}
      />
    </div>
  );
}