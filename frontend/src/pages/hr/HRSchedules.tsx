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
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { PageHeader } from "@/components/ui/page-header";

// ─── Constants ────────────────────────────────────────────────────────────────
const SCHEDULE_TYPES = [
  { value: "manana", label: "Mañana", icon: Sun, color: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  { value: "tarde", label: "Tarde", icon: Sunset, color: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  { value: "noche", label: "Noche", icon: Moon, color: "bg-indigo-500/10 text-indigo-600 border-indigo-500/30" },
  { value: "flexible", label: "Flexible", icon: Zap, color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
] as const;

function getTypeConfig(val: string) {
  return SCHEDULE_TYPES.find((t) => t.value === val);
}

function TypeBadge({ type }: { type: string }) {
  const cfg = getTypeConfig(type);
  if (!cfg) return <Badge variant="secondary">{type}</Badge>;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cn("text-xs gap-1", cfg.color)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
const HRSchedules = () => {
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
      const { count, error } = await supabase.from("overtime").select("id", { count: "exact", head: true });
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
      toast({ title: "Turno creado exitosamente" });
      setCreateOpen(false);
      resetForm();
    },
    onError: () => toast({ title: "Error al crear turno", variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async (vals: any) => {
      const { id, ...rest } = vals;
      const { error } = await supabase.from("work_schedules").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_schedules"] });
      toast({ title: "Turno actualizado exitosamente" });
      setEditData(null);
      resetForm();
    },
    onError: () => toast({ title: "Error al actualizar turno", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("work_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work_schedules"] });
      toast({ title: "Turno eliminado" });
      setDeleteId(null);
    },
    onError: () => toast({ title: "Error al eliminar turno", variant: "destructive" }),
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
      toast({ title: "Completa los campos requeridos", variant: "destructive" });
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
  const dayLabels = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

  // ─── Render ───────────────────────────────────────────────────────────────
  if (isLoading) return <div className="p-6 space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  const formModal = (
    <Dialog open={createOpen || !!editData} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditData(null); resetForm(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editData ? "Editar Turno" : "Crear Turno"}</DialogTitle>
          <DialogDescription>{editData ? "Modifica los datos del turno" : "Completa la información del nuevo turno"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Ej: Turno Mañana Enero" />
          </div>
          <div>
            <Label>Tipo de turno *</Label>
            <Select value={formType} onValueChange={setFormType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SCHEDULE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Fecha Inicio *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formStartDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formStartDate ? format(formStartDate, "dd/MM/yyyy") : "Seleccionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={formStartDate} onSelect={setFormStartDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Fecha Fin *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formEndDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formEndDate ? format(formEndDate, "dd/MM/yyyy") : "Seleccionar"}
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
              <Label>Hora Inicio</Label>
              <Input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} />
            </div>
            <div>
              <Label>Hora Fin</Label>
              <Input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Departamento</Label>
            <Select value={formDepartment} onValueChange={setFormDepartment}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {departments.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Detalles adicionales" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setCreateOpen(false); setEditData(null); resetForm(); }}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending || editMutation.isPending}>
            {editData ? "Guardar Cambios" : "Crear Turno"}
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
          title="Horarios y Turnos"
          subtitle="Gestión de turnos, horas extra y banco de horas"
          actions={
            <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Crear Turno
            </Button>
          }
        />
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Turnos clickeables (lista propia). Las dos últimas siguen
              navegando porque tienen su propia ruta detallada. */}
          <StatChip label="Turnos Esta Semana" value={String(turnosThisWeek)} icon={<CalendarDays className="h-3.5 w-3.5" />} color="bg-primary" onClick={() => setKpiPopup("week")} />
          <StatChip label="Turnos Hoy" value={String(turnosToday)} icon={<Clock className="h-3.5 w-3.5" />} color="bg-primary" onClick={() => setKpiPopup("today")} />
          <StatChip label="Horas Extra" value={String(overtimeCount)} icon={<Timer className="h-3.5 w-3.5" />} color="bg-warning" hint="Ver detalle" onClick={() => navigate("/hr/horarios/horas-extras")} />
          <StatChip label="Banco de Horas" value={`${hourBankTotal}h`} icon={<Banknote className="h-3.5 w-3.5" />} color="bg-success" hint="Ver detalle" onClick={() => navigate("/hr/horarios/banco-horas")} />
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/hr/horarios/horas-extras")}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10"><Timer className="h-5 w-5 text-amber-600" /></div>
                <div>
                  <p className="font-medium">Horas Extras</p>
                  <p className="text-xs text-muted-foreground">Registrar y gestionar horas extras</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/hr/horarios/banco-horas")}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10"><Banknote className="h-5 w-5 text-emerald-600" /></div>
                <div>
                  <p className="font-medium">Banco de Horas</p>
                  <p className="text-xs text-muted-foreground">Gestionar acumulación y uso de horas</p>
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
            <Input placeholder="Buscar turnos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={typeFilter || undefined} onValueChange={(v) => setTypeFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {SCHEDULE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {(search || typeFilter) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setTypeFilter(""); }}>
              <span className="mr-1.5">✕</span> Limpiar filtros
            </Button>
          )}
          <div className="ml-auto flex items-center border rounded-lg">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("list")}><ListIcon className="h-4 w-4" /></Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
            <Button variant={viewMode === "calendar" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("calendar")}><CalendarDays className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* List View */}
        {viewMode === "list" && (
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="text-xs">Título</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Fecha Inicio</TableHead>
                    <TableHead className="text-xs">Fecha Fin</TableHead>
                    <TableHead className="text-xs">Horario</TableHead>
                    <TableHead className="text-xs">Departamento</TableHead>
                    <TableHead className="text-xs sticky right-0 bg-card">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No hay turnos registrados</TableCell></TableRow>
                  ) : filtered.map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.title}</TableCell>
                      <TableCell><TypeBadge type={s.schedule_type} /></TableCell>
                      <TableCell className="text-sm">{format(parseISO(s.start_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-sm">{format(parseISO(s.end_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-sm">{s.start_time && s.end_time ? `${s.start_time.slice(0,5)} - ${s.end_time.slice(0,5)}` : "—"}</TableCell>
                      <TableCell className="text-sm">{s.departments?.name || "Todos"}</TableCell>
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
              <div className="col-span-full text-center py-10 text-muted-foreground">No hay turnos registrados</div>
            ) : filtered.map((s: any) => (
              <Card key={s.id} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{s.title}</p>
                      <p className="text-xs text-muted-foreground">{s.departments?.name || "Todos"}</p>
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
              {SCHEDULE_TYPES.map((t) => (
                <div key={t.value} className="flex items-center gap-1.5 text-xs">
                  <div className={cn("w-3 h-3 rounded-full", t.value === "manana" ? "bg-amber-500" : t.value === "tarde" ? "bg-orange-500" : t.value === "noche" ? "bg-indigo-500" : "bg-emerald-500")} />
                  {t.label}
                </div>
              ))}
            </div>

            {/* Monthly Calendar */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <Button variant="outline" size="sm" onClick={() => setCalMonth(addDays(startOfMonth(calMonth), -1))}>←</Button>
                  <h3 className="font-medium capitalize">{format(calMonth, "MMMM yyyy", { locale: es })}</h3>
                  <Button variant="outline" size="sm" onClick={() => setCalMonth(addDays(endOfMonth(calMonth), 1))}>→</Button>
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
                <h3 className="font-medium mb-3">Semana Actual</h3>
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
          <DialogHeader><DialogTitle>Detalle del Turno</DialogTitle></DialogHeader>
          {viewData && (
            <div className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Título:</span> <span className="font-medium">{viewData.title}</span></div>
              <div><span className="text-muted-foreground">Tipo:</span> <TypeBadge type={viewData.schedule_type} /></div>
              <div><span className="text-muted-foreground">Período:</span> {format(parseISO(viewData.start_date), "dd/MM/yyyy")} → {format(parseISO(viewData.end_date), "dd/MM/yyyy")}</div>
              {viewData.start_time && <div><span className="text-muted-foreground">Horario:</span> {viewData.start_time.slice(0,5)} - {viewData.end_time?.slice(0,5)}</div>}
              <div><span className="text-muted-foreground">Departamento:</span> {viewData.departments?.name || "Todos"}</div>
              {viewData.description && <div><span className="text-muted-foreground">Descripción:</span> {viewData.description}</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este turno?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={kpiPopup === "week" ? `Turnos Esta Semana — ${turnosThisWeek}` : `Turnos Hoy — ${turnosToday}`}
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
            primary: s.title ?? s.employee_name ?? "Sin título",
            secondary: s.start_at ? new Date(s.start_at).toLocaleString("es") : undefined,
            right: s.shift_type ?? "—",
          }));
        })()}
      />
    </div>
  );
};

export default HRSchedules;
