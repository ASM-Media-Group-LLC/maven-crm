import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Clock, CalendarDays, Search, ListIcon, LayoutGrid, Eye, Plus, Pencil, Trash2,
  ArrowRight, Timer, Banknote, CalendarIcon, Sun, Moon, Sunset, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
import { format, startOfWeek, endOfWeek, addDays, isSameDay, isWithinInterval, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import { cn } from "@/lib/utils";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

// ─── Constants ────────────────────────────────────────────────────────────────
// `value` es lo que se guarda en work_schedules.schedule_type: DATO, no se traduce.
const SCHEDULE_TYPES: readonly { value: string; label: TranslationKey; icon: typeof Sun; color: string }[] = [
  { value: "manana", label: "hrg.sch.type.morning", icon: Sun, color: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  { value: "tarde", label: "hrg.sch.type.afternoon", icon: Sunset, color: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  { value: "noche", label: "hrg.sch.type.night", icon: Moon, color: "bg-indigo-500/10 text-indigo-600 border-indigo-500/30" },
  { value: "flexible", label: "hrg.sch.type.flexible", icon: Zap, color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
];

// Lunes primero, como el calendario de esta pantalla.
const DIAS_SEMANA: readonly TranslationKey[] = [
  "hrg.day.mon", "hrg.day.tue", "hrg.day.wed", "hrg.day.thu", "hrg.day.fri", "hrg.day.sat", "hrg.day.sun",
];

function getTypeConfig(val: string) {
  return SCHEDULE_TYPES.find((t) => t.value === val);
}

function TypeBadge({ type }: { type: string }) {
  const { t } = useLanguage();
  const cfg = getTypeConfig(type);
  if (!cfg) return <Badge variant="secondary">{type}</Badge>;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cn("text-xs gap-1", cfg.color)}>
      <Icon className="h-3 w-3" />
      {t(cfg.label)}
    </Badge>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
const HRSchedules = () => {
  const f = useFormato();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid" | "calendar">("list");
  type KpiKey = "week" | "today";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editData, setEditData] = useState<any | null>(null);
  const [viewData, setViewData] = useState<any | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState("manana");
  const [formStartDate, setFormStartDate] = useState<Date | undefined>();
  const [formEndDate, setFormEndDate] = useState<Date | undefined>();
  const [formStartTime, setFormStartTime] = useState("");
  const [formEndTime, setFormEndTime] = useState("");
  const [formDepartment, setFormDepartment] = useState("all");
  const [formDescription, setFormDescription] = useState("");

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["work_schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_schedules")
        .select("*, departments(name)")
        .eq("team", "hr")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: overtimeCount = 0 } = useQuery({
    queryKey: ["overtime_count"],
    queryFn: async () => {
      // StatChip "Horas Extra" → count:"estimated" (exacto por debajo del
      // max-rows de PostgREST; el chip no cuadra plata, solo lleva al detalle).
      const { count, error } = await supabase.from("overtime").select("id", { count: "estimated", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: hourBankTotal = 0 } = useQuery({
    queryKey: ["hour_bank_total"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hour_bank").select("hours, movement_type");
      if (error) throw error;
      return (data || []).reduce((acc, r) => acc + (r.movement_type === "deposit" ? Number(r.hours) : -Number(r.hours)), 0);
    },
  });

  // ─── Mutations ────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (vals: any) => {
      const { error } = await supabase.from("work_schedules").insert(vals);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_schedules"] });
      toast({ title: t("hrg.sch.created") });
      setCreateOpen(false);
      resetForm();
    },
    onError: () => toast({ title: t("hrg.sch.createError"), variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async (vals: any) => {
      const { id, ...rest } = vals;
      const { error } = await supabase.from("work_schedules").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_schedules"] });
      toast({ title: t("hrg.sch.updated") });
      setEditData(null);
      resetForm();
    },
    onError: () => toast({ title: t("hrg.sch.updateError"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("work_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_schedules"] });
      toast({ title: t("hrg.sch.deleted") });
      setDeleteId(null);
    },
    onError: () => toast({ title: t("hrg.sch.deleteError"), variant: "destructive" }),
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function resetForm() {
    setFormTitle(""); setFormType("manana"); setFormStartDate(undefined);
    setFormEndDate(undefined); setFormStartTime(""); setFormEndTime("");
    setFormDepartment("all"); setFormDescription("");
  }

  function openEdit(s: any) {
    setFormTitle(s.title);
    setFormType(s.schedule_type);
    setFormStartDate(parseISO(s.start_date));
    setFormEndDate(parseISO(s.end_date));
    setFormStartTime(s.start_time || "");
    setFormEndTime(s.end_time || "");
    setFormDepartment(s.department_id || "all");
    setFormDescription(s.description || "");
    setEditData(s);
  }

  function handleSubmit() {
    if (!formTitle || !formStartDate || !formEndDate) {
      toast({ title: t("common.requiredFields"), variant: "destructive" });
      return;
    }
    const vals: any = {
      title: formTitle,
      schedule_type: formType,
      start_date: format(formStartDate, "yyyy-MM-dd"),
      end_date: format(formEndDate, "yyyy-MM-dd"),
      start_time: formStartTime || null,
      end_time: formEndTime || null,
      department_id: formDepartment !== "all" ? formDepartment : null,
      description: formDescription || null,
      team: "hr",
    };
    if (editData) {
      editMutation.mutate({ id: editData.id, ...vals });
    } else {
      createMutation.mutate(vals);
    }
  }

  // ─── Filters ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = schedules;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((s: any) => s.title?.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q));
    }
    if (typeFilter) result = result.filter((s: any) => s.schedule_type === typeFilter);
    return result;
  }, [schedules, search, typeFilter]);

  // ─── KPI Calculations ────────────────────────────────────────────────────
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const todayStr = format(today, "yyyy-MM-dd");

  const turnosThisWeek = schedules.filter((s: any) => {
    try {
      const start = parseISO(s.start_date);
      const end = parseISO(s.end_date);
      return isWithinInterval(today, { start, end }) ||
        isWithinInterval(start, { start: weekStart, end: weekEnd });
    } catch { return false; }
  }).length;

  const turnosToday = schedules.filter((s: any) => {
    try {
      const start = parseISO(s.start_date);
      const end = parseISO(s.end_date);
      return isWithinInterval(today, { start, end });
    } catch { return false; }
  }).length;

  // ─── Calendar View ────────────────────────────────────────────────────────
  const [calMonth, setCalMonth] = useState(today);
  const calStart = startOfMonth(calMonth);
  const calEnd = endOfMonth(calMonth);
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  function getSchedulesForDay(day: Date) {
    return schedules.filter((s: any) => {
      try {
        const start = parseISO(s.start_date);
        const end = parseISO(s.end_date);
        return isWithinInterval(day, { start, end }) || isSameDay(day, start) || isSameDay(day, end);
      } catch { return false; }
    });
  }

  // Week view
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dayLabels = DIAS_SEMANA.map((k) => t(k));

  // ─── Render ───────────────────────────────────────────────────────────────
  if (isLoading) return <div className="p-6 space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  const formModal = (
    <Dialog open={createOpen || !!editData} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditData(null); resetForm(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editData ? t("hrg.sch.editTitle") : t("hrg.sch.create")}</DialogTitle>
          <DialogDescription>{editData ? t("hrg.sch.editHint") : t("hrg.sch.createHint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t("common.title")} *</Label>
            <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder={t("hrg.sch.titlePlaceholder")} />
          </div>
          <div>
            <Label>{t("hrg.sch.shiftType")} *</Label>
            <Select value={formType} onValueChange={setFormType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCHEDULE_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{t(o.label)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("hrg.startDate")} *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formStartDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formStartDate ? format(formStartDate, "dd/MM/yyyy") : t("common.select")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formStartDate} onSelect={setFormStartDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>{t("hrg.endDate")} *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formEndDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formEndDate ? format(formEndDate, "dd/MM/yyyy") : t("common.select")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formEndDate} onSelect={setFormEndDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("hrg.sch.startTime")}</Label>
              <Input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} />
            </div>
            <div>
              <Label>{t("hrg.sch.endTime")}</Label>
              <Input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>{t("hrg.department")}</Label>
            <Select value={formDepartment} onValueChange={setFormDepartment}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("common.description")}</Label>
            <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder={t("hrg.sch.descriptionPlaceholder")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setCreateOpen(false); setEditData(null); resetForm(); }}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending || editMutation.isPending}>
            {editData ? t("hrg.saveChanges") : t("hrg.sch.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 bg-background border-b px-6 py-4">
        <PageHeader
          title={t("hrg.sch.title")}
          subtitle={t("hrg.sch.subtitle")}
          actions={
            <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> {t("hrg.sch.create")}
            </Button>
          }
        />
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Turnos clickeables (lista propia). Las dos últimas siguen
              navegando porque tienen su propia ruta detallada. */}
          <StatChip label={t("hrg.sch.kpi.week")} value={String(turnosThisWeek)} icon={<CalendarDays className="h-3.5 w-3.5" />} color="bg-primary" onClick={() => setKpiPopup("week")} />
          <StatChip label={t("hrg.sch.kpi.today")} value={String(turnosToday)} icon={<Clock className="h-3.5 w-3.5" />} color="bg-primary" onClick={() => setKpiPopup("today")} />
          <StatChip label={t("hrg.ot.title")} value={String(overtimeCount)} icon={<Timer className="h-3.5 w-3.5" />} color="bg-warning" hint={t("hrg.viewDetail")} onClick={() => navigate("/hr/horarios/horas-extras")} />
          <StatChip label={t("hrg.hourBank")} value={`${hourBankTotal}h`} icon={<Banknote className="h-3.5 w-3.5" />} color="bg-success" hint={t("hrg.viewDetail")} onClick={() => navigate("/hr/horarios/banco-horas")} />
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/hr/horarios/horas-extras")}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-warning/10"><Timer className="h-5 w-5 text-warning" /></div>
                <div>
                  <p className="font-medium">{t("hrg.ot.title")}</p>
                  <p className="text-xs text-muted-foreground">{t("hrg.sch.overtimeCard")}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/hr/horarios/banco-horas")}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10"><Banknote className="h-5 w-5 text-success" /></div>
                <div>
                  <p className="font-medium">{t("hrg.hourBank")}</p>
                  <p className="text-xs text-muted-foreground">{t("hrg.sch.hourBankCard")}</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("hrg.sch.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={typeFilter || undefined} onValueChange={(v) => setTypeFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder={t("common.type")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("common.all")}</SelectItem>
              {SCHEDULE_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{t(o.label)}</SelectItem>)}
            </SelectContent>
          </Select>
          {(search || typeFilter) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setTypeFilter(""); }}>
              <span className="mr-1.5">✕</span> {t("hrg.clearFilters")}
            </Button>
          )}
          <div className="ml-auto flex items-center border rounded-lg">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("list")} aria-label={t("hrg.dir.viewTable")}><ListIcon className="h-4 w-4" /></Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("grid")} aria-label={t("hrg.dir.viewGrid")}><LayoutGrid className="h-4 w-4" /></Button>
            <Button variant={viewMode === "calendar" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("calendar")} aria-label={t("hrg.viewCalendar")}><CalendarDays className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* List View */}
        {viewMode === "list" && (
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="text-xs">{t("common.title")}</TableHead>
                    <TableHead className="text-xs">{t("common.type")}</TableHead>
                    <TableHead className="text-xs">{t("hrg.startDate")}</TableHead>
                    <TableHead className="text-xs">{t("hrg.endDate")}</TableHead>
                    <TableHead className="text-xs">{t("hrg.schedule")}</TableHead>
                    <TableHead className="text-xs">{t("hrg.department")}</TableHead>
                    <TableHead className="text-xs sticky right-0 bg-card">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t("hrg.sch.empty")}</TableCell></TableRow>
                  ) : filtered.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.title}</TableCell>
                      <TableCell><TypeBadge type={s.schedule_type} /></TableCell>
                      <TableCell className="text-sm">{format(parseISO(s.start_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-sm">{format(parseISO(s.end_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-sm">{s.start_time && s.end_time ? `${s.start_time.slice(0,5)} - ${s.end_time.slice(0,5)}` : "—"}</TableCell>
                      <TableCell className="text-sm">{s.departments?.name || t("common.all")}</TableCell>
                      <TableCell className="sticky right-0 bg-card">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setViewData(s)}><Eye className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Grid View */}
        {viewMode === "grid" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.length === 0 ? (
              <div className="col-span-full text-center py-10 text-muted-foreground">{t("hrg.sch.empty")}</div>
            ) : filtered.map((s: any) => (
              <Card key={s.id} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{s.title}</p>
                      <p className="text-xs text-muted-foreground">{s.departments?.name || t("common.all")}</p>
                    </div>
                    <TypeBadge type={s.schedule_type} />
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>📅 {format(parseISO(s.start_date), "dd/MM/yyyy")} → {format(parseISO(s.end_date), "dd/MM/yyyy")}</p>
                    {s.start_time && s.end_time && <p>🕐 {s.start_time.slice(0,5)} - {s.end_time.slice(0,5)}</p>}
                  </div>
                  <div className="flex items-center gap-1 pt-2 border-t">
                    <Button variant="ghost" size="sm" onClick={() => setViewData(s)}><Eye className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Calendar View */}
        {viewMode === "calendar" && (
          <div className="space-y-6">
            {/* Legend */}
            <div className="flex flex-wrap gap-3">
              {SCHEDULE_TYPES.map((tp) => (
                <div key={tp.value} className="flex items-center gap-1.5 text-xs">
                  <div className={cn("w-3 h-3 rounded-full", tp.value === "manana" ? "bg-amber-500" : tp.value === "tarde" ? "bg-orange-500" : tp.value === "noche" ? "bg-indigo-500" : "bg-emerald-500")} />
                  {t(tp.label)}
                </div>
              ))}
            </div>

            {/* Monthly Calendar */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <Button variant="outline" size="sm" onClick={() => setCalMonth(addDays(startOfMonth(calMonth), -1))} aria-label={t("hrg.sch.prevMonth")}>←</Button>
                  <h3 className="font-medium capitalize">{format(calMonth, "MMMM yyyy", { locale: f.fechas })}</h3>
                  <Button variant="outline" size="sm" onClick={() => setCalMonth(addDays(endOfMonth(calMonth), 1))} aria-label={t("hrg.sch.nextMonth")}>→</Button>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {dayLabels.map((d) => <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>)}
                  {/* Padding for first day */}
                  {Array.from({ length: (getDay(calStart) + 6) % 7 }).map((_, i) => <div key={`pad-${i}`} />)}
                  {calDays.map((day) => {
                    const daySchedules = getSchedulesForDay(day);
                    return (
                      <div key={day.toISOString()} className={cn("min-h-[60px] p-1 rounded border text-xs", isSameDay(day, today) ? "border-primary bg-primary/5" : "border-border/50")}>
                        <span className={cn("text-[10px]", isSameDay(day, today) ? "font-bold text-primary" : "text-muted-foreground")}>{format(day, "d")}</span>
                        <div className="space-y-0.5 mt-0.5">
                          {daySchedules.slice(0, 2).map((s: any) => {
                            const colorClass = s.schedule_type === "manana" ? "bg-amber-500" : s.schedule_type === "tarde" ? "bg-orange-500" : s.schedule_type === "noche" ? "bg-indigo-500" : "bg-emerald-500";
                            return <div key={s.id} className={cn("h-1.5 rounded-full", colorClass)} title={s.title} />;
                          })}
                          {daySchedules.length > 2 && <span className="text-[9px] text-muted-foreground">+{daySchedules.length - 2}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Week View */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium mb-3">{t("hrg.sch.currentWeek")}</h3>
                <div className="grid grid-cols-7 gap-2">
                  {weekDays.map((day, i) => {
                    const daySchedules = getSchedulesForDay(day);
                    return (
                      <div key={i} className={cn("p-2 rounded-lg border min-h-[80px]", isSameDay(day, today) ? "border-primary bg-primary/5" : "")}>
                        <p className="text-xs font-medium">{dayLabels[i]}</p>
                        <p className="text-[10px] text-muted-foreground mb-1">{format(day, "dd/MM")}</p>
                        {daySchedules.map((s: any) => (
                          <div key={s.id} className="text-[10px] p-1 rounded bg-muted/50 mb-0.5 truncate" title={s.title}>
                            {s.start_time?.slice(0,5)} {s.title}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Form Modal */}
      {formModal}

      {/* View Modal */}
      <Dialog open={!!viewData} onOpenChange={(o) => !o && setViewData(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("hrg.sch.detailTitle")}</DialogTitle></DialogHeader>
          {viewData && (
            <div className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">{t("common.title")}:</span> <span className="font-medium">{viewData.title}</span></div>
              <div><span className="text-muted-foreground">{t("common.type")}:</span> <TypeBadge type={viewData.schedule_type} /></div>
              <div><span className="text-muted-foreground">{t("common.period")}:</span> {format(parseISO(viewData.start_date), "dd/MM/yyyy")} → {format(parseISO(viewData.end_date), "dd/MM/yyyy")}</div>
              {viewData.start_time && <div><span className="text-muted-foreground">{t("hrg.schedule")}:</span> {viewData.start_time.slice(0,5)} - {viewData.end_time?.slice(0,5)}</div>}
              <div><span className="text-muted-foreground">{t("hrg.department")}:</span> {viewData.departments?.name || t("common.all")}</div>
              {viewData.description && <div><span className="text-muted-foreground">{t("common.description")}:</span> {viewData.description}</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hrg.sch.deleteTitle")}</AlertDialogTitle>
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
        emptyText={t("hrg.noRecordsToShow")}
        title={kpiPopup === "week"
          ? t("hrg.kpiTitle", { label: t("hrg.sch.kpi.week"), value: turnosThisWeek })
          : t("hrg.kpiTitle", { label: t("hrg.sch.kpi.today"), value: turnosToday })}
        rows={(() => {
          if (!kpiPopup) return [];
          const now = new Date();
          let list = schedules;
          if (kpiPopup === "week") {
            const ws = new Date(now);
            ws.setDate(now.getDate() - now.getDay() + 1);
            ws.setHours(0, 0, 0, 0);
            const we = new Date(ws);
            we.setDate(ws.getDate() + 7);
            list = schedules.filter((s: any) => s.start_at && new Date(s.start_at) >= ws && new Date(s.start_at) < we);
          } else {
            list = schedules.filter((s: any) => s.start_at && new Date(s.start_at).toDateString() === now.toDateString());
          }
          return list.slice(0, 100).map((s: any): KpiRow => ({
            primary: s.title ?? s.employee_name ?? t("hrg.sch.untitled"),
            secondary: s.start_at ? new Date(s.start_at).toLocaleString(f.intl("es-ES")) : undefined,
            right: s.shift_type ?? "—",
          }));
        })()}
      />
    </div>
  );
};

export default HRSchedules;
