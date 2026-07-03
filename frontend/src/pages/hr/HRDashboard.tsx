import { useState } from "react";
import {
  Users, UserCheck, Clock, LayoutDashboard, UserPlus,
  CalendarDays, AlertTriangle, TrendingDown, TrendingUp,
  BookOpen, Briefcase, ChevronRight, Zap, Activity,
  Percent, Timer, RotateCcw, Settings2, Check, UserMinus,
  ShieldAlert, ClipboardCheck, DollarSign as DollarSignIcon, Wallet,
} from "lucide-react";
import { useEmployees } from "@/hooks/useEmployees";
import { HRMetricCard } from "@/components/hr/HRMetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import KpiCard from "@/components/dashboard/KpiCard";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { useHrProductivity } from "./useHrProductivity";
import { useHrAttendance } from "./useHrAttendance";

// ─── Types ───────────────────────────────────────────────────────────────────
interface QuickAction {
  id: string;
  label: string;
  icon: typeof Users;
  url: string | null;
  soon?: boolean;
}

// ─── All available quick actions catalog ────────────────────────────────────
const ALL_ACTIONS: QuickAction[] = [
  { id: "ausencias",     label: "Registrar Ausencia", icon: CalendarDays,  url: "/hr/ausencias" },
  { id: "directorio",    label: "Ver Directorio",     icon: Users,          url: "/hr/directorio" },
  { id: "nuevo",         label: "Agregar Empleado",   icon: UserPlus,       url: "/hr/empleado/nuevo" },
  { id: "candidatos",    label: "Ver Candidatos",     icon: Briefcase,      url: "/hr/candidatos" },
  { id: "incidentes",    label: "Ver Incidentes",     icon: ShieldAlert,    url: "/hr/incidentes" },
  { id: "capacitacion",  label: "Ver Capacitación",   icon: BookOpen,       url: "/hr/capacitacion" },
  { id: "desempeno",     label: "Ver Desempeño",      icon: TrendingUp,     url: "/hr/desempeno" },
  { id: "asistencia",    label: "Control Asistencia", icon: ClipboardCheck, url: "/hr/asistencia" },
  { id: "vacaciones",    label: "Vacaciones",          icon: CalendarDays,   url: "/hr/vacaciones" },
  { id: "horarios",      label: "Horarios",            icon: Clock,          url: null, soon: true },
];

const DEFAULT_ACTION_IDS = ["ausencias", "directorio", "nuevo", "candidatos"];
const MAX_SHORTCUTS = 4;
const LS_KEY = "hr_quick_actions";

function loadShortcuts(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return DEFAULT_ACTION_IDS;
}

// ─── Pending absences hook ────────────────────────────────────────────────────
function usePendingAbsences() {
  return useQuery({
    queryKey: ["absences-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("absences")
        .select("*, employees(first_name, last_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });
}

const absenceTypeLabel: Record<string, string> = {
  enfermedad: "Enfermedad",
  vacaciones: "Vacaciones",
  licencia: "Licencia",
  permiso: "Permiso",
  otro: "Otro",
};

// ─── Financial Summary from Finanzas ─────────────────────────────────────────
function FinancialSummaryCards() {
  const navigate = useNavigate();
  const { data: employees = [] } = useEmployees();

  const { data: payrollTotal } = useQuery({
    queryKey: ["hr-fin-payroll-total"],
    queryFn: async () => {
      const now = new Date();
      const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const { data, error } = await supabase.from("payroll_periods").select("net_total").ilike("period_name", `%${monthYear}%`);
      if (error) throw error;
      return (data ?? []).reduce((s, p) => s + (Number(p.net_total) || 0), 0);
    },
  });

  const { data: pendingDeductions } = useQuery({
    queryKey: ["hr-fin-pending-deductions"],
    queryFn: async () => {
      const { count, error } = await supabase.from("employee_deductions").select("id", { count: "exact", head: true }).eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: overtimeHours } = useQuery({
    queryKey: ["hr-fin-overtime-hours"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hour_bank").select("hours").eq("movement_type", "deposit");
      if (error) throw error;
      return (data ?? []).reduce((s, r) => s + (Number(r.hours) || 0), 0);
    },
  });

  const activos = employees.filter(e => e.status === "activo");
  const avgSalary = activos.length > 0
    ? activos.reduce((s, e) => s + (Number(e.base_salary) || 0), 0) / activos.length
    : 0;

  const cards = [
    { label: "Costo Nómina (mes)", value: `$${(payrollTotal ?? 0).toLocaleString("es-CO")}`, icon: DollarSignIcon, color: "bg-blue-500", path: "/finanzas/nomina" },
    { label: "Salario Promedio", value: `$${Math.round(avgSalary).toLocaleString("es-CO")}`, icon: Wallet, color: "bg-violet-500", path: "/finanzas/control" },
    { label: "Deducciones Pend.", value: String(pendingDeductions ?? 0), icon: AlertTriangle, color: "bg-warning", path: "/hr/deducciones" },
    { label: "Horas Extra Acum.", value: `${(overtimeHours ?? 0).toFixed(1)}h`, icon: Clock, color: "bg-emerald-500", path: "/finanzas/horas-variables" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(c => (
        <KpiCard
          key={c.label}
          label={c.label}
          value={c.value}
          icon={c.icon}
          color={c.color}
          onClick={() => navigate(c.path, { state: { fromHR: true } })}
        />
      ))}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function HRDashboard() {
  const { data: employees = [], isLoading } = useEmployees();
  const { data: pendingAbsences = [], isLoading: absencesLoading } = usePendingAbsences();
  const { data: prod } = useHrProductivity(7);
  const { data: attRows = [] } = useHrAttendance();
  const navigate = useNavigate();

  // Puntualidad agregada del equipo (Hubstaff) — promedio de % a tiempo del último período.
  const avgPunct = attRows.length
    ? Math.round(attRows.reduce((s, r) => s + (r.pct_a_tiempo ?? 0), 0) / attRows.length)
    : null;

  // Quick actions state
  const [selectedIds, setSelectedIds] = useState<string[]>(loadShortcuts);
  const [configOpen, setConfigOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  type KpiKey = "total" | "ausencias" | "onboarding";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);

  function openConfig() {
    setDraftIds([...selectedIds]);
    setConfigOpen(true);
  }

  function toggleDraft(id: string, soon?: boolean) {
    if (soon) return;
    setDraftIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SHORTCUTS) return prev;
      return [...prev, id];
    });
  }

  function saveConfig() {
    setSelectedIds(draftIds);
    localStorage.setItem(LS_KEY, JSON.stringify(draftIds));
    setConfigOpen(false);
  }

  // Stats
  const now = new Date();
  const thirtyDaysAgo = subDays(now, 30);
  const twelveMonthsAgo = subDays(now, 365);

  const total        = employees.length;
  const activos      = employees.filter((e) => e.status === "activo").length;
  const enLicencia   = employees.filter((e) => e.status === "en_licencia").length;
  const vacaciones   = employees.filter((e) => e.status === "vacaciones").length;
  const inactivos    = employees.filter((e) => e.status === "inactivo").length;
  const nuevos30d    = employees.filter((e) => e.hire_date && new Date(e.hire_date) >= thirtyDaysAgo).length;
  const terminados30d  = employees.filter((e) => e.termination_date && new Date(e.termination_date) >= thirtyDaysAgo).length;
  const terminados12m  = employees.filter((e) => e.termination_date && new Date(e.termination_date) >= twelveMonthsAgo).length;

  const rotacion30d  = total > 0 ? ((terminados30d / total) * 100).toFixed(1) : "0.0";
  const pctIngresos30d = total > 0 ? ((nuevos30d / total) * 100).toFixed(1) : "0.0";
  const rotacion12m  = total > 0 ? ((terminados12m / total) * 100).toFixed(1) : "0.0";

  const avgAntiguedadDays =
    employees.filter((e) => e.hire_date).length > 0
      ? employees.filter((e) => e.hire_date).reduce((acc, e) => acc + differenceInDays(now, new Date(e.hire_date!)), 0) /
        employees.filter((e) => e.hire_date).length
      : 0;
  const avgAntiguedadMeses = Math.round(avgAntiguedadDays / 30);

  const pct = (n: number) => total > 0 ? `${((n / total) * 100).toFixed(0)}% del total` : "—";

  // Active shortcuts
  const activeActions = selectedIds
    .map((id) => ALL_ACTIONS.find((a) => a.id === id))
    .filter(Boolean) as QuickAction[];

  const rotacionCards = [
    { label: "Rotación 30d",   value: `${rotacion30d}%`,      color: "bg-destructive/10 border-destructive/20", icon: RotateCcw,    textColor: "text-destructive" },
    { label: "Retiros 30d",    value: `${terminados30d}`,      color: "bg-orange-950/40 border-orange-800/30",   icon: TrendingDown,  textColor: "text-orange-300" },
    { label: "% Ingresos 30d", value: `${pctIngresos30d}%`,   color: "bg-success/10 border-success/20",         icon: TrendingUp,    textColor: "text-success" },
    { label: "Antigüedad Prom.", value: `${avgAntiguedadMeses}m`, color: "bg-primary/10 border-primary/20",     icon: Timer,         textColor: "text-primary" },
    { label: "Rotación 12m",   value: `${rotacion12m}%`,      color: "bg-muted border-border",                  icon: Percent,       textColor: "text-muted-foreground" },
  ];

  const teamStatus = [
    { label: "Activos",      value: activos,    subtitle: pct(activos),    icon: UserCheck,  color: "bg-success/10 border-success/20",       textColor: "text-success" },
    { label: "En Licencia",  value: enLicencia, subtitle: pct(enLicencia), icon: Clock,      color: "bg-warning/10 border-warning/20",        textColor: "text-warning" },
    { label: "Vacaciones",   value: vacaciones, subtitle: pct(vacaciones), icon: CalendarDays, color: "bg-blue-500/10 border-blue-500/20",    textColor: "text-blue-400" },
    { label: "Inactivos",    value: inactivos,  subtitle: pct(inactivos),  icon: UserMinus,  color: "bg-destructive/10 border-destructive/20", textColor: "text-destructive" },
    { label: "Nuevos (30d)", value: nuevos30d,  subtitle: pct(nuevos30d),  icon: UserPlus,   color: "bg-primary/10 border-primary/20",        textColor: "text-primary" },
    { label: "Total",        value: total,      subtitle: "plantilla",     icon: Users,      color: "bg-muted border-border",                  textColor: "text-foreground" },
  ];

  const hrModules = [
    { label: "Asistencia",  icon: Activity,     url: "/hr/asistencia" },
    { label: "Vacaciones",  icon: CalendarDays, url: "/hr/vacaciones" },
    { label: "Horarios",    icon: Clock,        url: null },
    { label: "Capacitación",icon: BookOpen,     url: "/hr/capacitacion" },
    { label: "Incidentes",  icon: AlertTriangle,url: "/hr/incidentes" },
    { label: "Candidatos",  icon: Briefcase,    url: "/hr/candidatos" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Recursos Humanos</h2>
            <p className="text-sm text-muted-foreground">Panel de control del equipo</p>
          </div>
          <Button onClick={() => navigate("/hr/empleado/nuevo")} size="sm">
            + Nuevo Empleado
          </Button>
        </div>
      </header>

      {/* ── Scrollable content ────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* KPI Cards — Total/Ausencias/Onboarding tienen data → clickeables.
            Check-ins Hoy es estático (no hay sistema de asistencia integrado). */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
          ) : (
            <>
              <KpiCard label="Total Empleados" value={String(total)} icon={Users} color="bg-blue-500" subtitle="En nómina" onClick={() => setKpiPopup("total")} />
              <KpiCard label="Puntualidad equipo" value={avgPunct != null ? `${avgPunct}%` : "—"} icon={UserCheck} color="bg-emerald-500" subtitle={attRows.length ? `${attRows.length} trackeados · Hubstaff` : "Sin datos Hubstaff"} onClick={() => navigate("/hr/asistencia", { state: { fromHR: true } })} />
              <KpiCard label="Ausencias Pend." value={String(pendingAbsences.length)} icon={AlertTriangle} color="bg-warning" subtitle="Pendientes de revisión" onClick={() => setKpiPopup("ausencias")} />
              <KpiCard label="En Onboarding" value={String(nuevos30d)} icon={UserPlus} color="bg-emerald-500" subtitle="Ingresos últimos 30d" onClick={() => setKpiPopup("onboarding")} />
            </>
          )}
        </div>

        {/* Productividad del equipo (Hubstaff) — horas/actividad/personas reales */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Productividad del equipo (Hubstaff)
                <span className="text-xs font-normal text-muted-foreground">· últimos 7 días</span>
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => navigate("/hr/asistencia", { state: { fromHR: true } })}>
                Ver asistencia <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Horas trackeadas", value: prod ? `${prod.totalHours.toLocaleString("es-CO")}h` : "—", icon: Clock, color: "bg-blue-500/10 border-blue-500/20", textColor: "text-blue-400" },
                { label: "Actividad prom.", value: prod ? `${prod.avgActivity}%` : "—", icon: Activity, color: "bg-violet-500/10 border-violet-500/20", textColor: "text-violet-400" },
                { label: "Personas activas", value: prod ? String(prod.people) : "—", icon: Users, color: "bg-primary/10 border-primary/20", textColor: "text-primary" },
                { label: "Puntualidad prom.", value: avgPunct != null ? `${avgPunct}%` : "—", icon: Percent, color: "bg-success/10 border-success/20", textColor: "text-success" },
              ].map((c) => (
                <div key={c.label} className={cn("rounded-lg border p-3 flex flex-col gap-1", c.color)}>
                  <div className="flex items-center gap-1.5">
                    <c.icon className={cn("h-3.5 w-3.5", c.textColor)} />
                    <span className="text-xs text-muted-foreground">{c.label}</span>
                  </div>
                  <span className={cn("text-xl font-bold", c.textColor)}>{c.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Rotación y Retención */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              Rotación y Retención
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {rotacionCards.map((card) => (
                <div key={card.label} className={cn("rounded-lg border p-3 flex flex-col gap-1", card.color)}>
                  <div className="flex items-center gap-1.5">
                    <card.icon className={cn("h-3.5 w-3.5", card.textColor)} />
                    <span className="text-xs text-muted-foreground">{card.label}</span>
                  </div>
                  <span className={cn("text-xl font-bold", card.textColor)}>{card.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-base font-semibold leading-none">Acciones Rápidas</p>
                  <p className="text-sm text-muted-foreground mt-0.5">Configura los atajos a las funciones que más utilizas en tu día a día</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0" onClick={openConfig}>
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {activeActions.map((action) => (
                <div
                  key={action.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 cursor-pointer hover:border-primary/40 hover:bg-primary/5 hover:-translate-y-[1px] transition-all duration-200 group"
                  onClick={() => action.url && navigate(action.url, { state: { fromHR: true } })}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <action.icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="flex-1 text-sm font-medium">{action.label}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              ))}
              {activeActions.length === 0 && (
                <p className="col-span-4 text-sm text-muted-foreground text-center py-4">
                  No hay accesos configurados. Haz clic en el engranaje para agregar.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Solicitudes + Módulos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Solicitudes Pendientes */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  Solicitudes Pendientes
                </CardTitle>
                <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => navigate("/hr/ausencias")}>
                  Ver todas <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {absencesLoading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded" />)
              ) : pendingAbsences.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No hay solicitudes pendientes</p>
              ) : (
                pendingAbsences.map((absence: any) => (
                  <div key={absence.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="h-8 w-8 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                      <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {absence.employees?.first_name} {absence.employees?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {absenceTypeLabel[absence.absence_type] ?? absence.absence_type} ·{" "}
                        {format(new Date(absence.start_date), "dd MMM", { locale: es })} →{" "}
                        {format(new Date(absence.end_date), "dd MMM yyyy", { locale: es })}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0 border-warning/40 text-warning">Pendiente</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Módulos HR */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                Módulos HR
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {hrModules.map((mod) => (
                  <button
                    key={mod.label}
                    onClick={() => mod.url && navigate(mod.url, { state: { fromHR: true } })}
                    disabled={!mod.url}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors",
                      mod.url ? "hover:bg-muted/50 cursor-pointer" : "opacity-40 cursor-not-allowed"
                    )}
                  >
                    <mod.icon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs font-medium leading-tight">{mod.label}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Resumen Financiero de Personal */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSignIcon className="h-4 w-4 text-muted-foreground" />
              Resumen Financiero de Personal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FinancialSummaryCards />
          </CardContent>
        </Card>

        {/* Estado Actual de la Plantilla */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Estado Actual de la Plantilla</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
              : teamStatus.map((item) => (
                  <div key={item.label} className={cn("rounded-lg border p-3 flex flex-col gap-1.5", item.color)}>
                    <div className="flex items-center gap-1.5">
                      <item.icon className={cn("h-3.5 w-3.5", item.textColor)} />
                      <span className="text-xs text-muted-foreground">{item.label}</span>
                    </div>
                    <span className={cn("text-2xl font-bold leading-none", item.textColor)}>{item.value}</span>
                    <span className="text-xs text-muted-foreground leading-tight">{item.subtitle}</span>
                  </div>
                ))}
          </div>
        </div>
      </div>

      {/* ── Quick Actions Config Dialog ──────────────────────────────── */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Configurar Acciones Rápidas
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">
            Selecciona hasta {MAX_SHORTCUTS} accesos directos para mostrar en el dashboard.
          </p>
          <div className="space-y-2 py-1">
            {ALL_ACTIONS.map((action) => {
              const isChecked = draftIds.includes(action.id);
              const isDisabled = action.soon || (!isChecked && draftIds.length >= MAX_SHORTCUTS);
              return (
                <div
                  key={action.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                    isChecked ? "border-primary/40 bg-primary/5" : "border-border",
                    !action.soon && !isDisabled ? "cursor-pointer hover:bg-muted/50" : "",
                    action.soon ? "opacity-50" : "",
                  )}
                  onClick={() => toggleDraft(action.id, action.soon)}
                >
                  <Checkbox
                    checked={isChecked}
                    disabled={isDisabled}
                    onCheckedChange={() => toggleDraft(action.id, action.soon)}
                  />
                  <action.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", action.soon && "text-muted-foreground")}>{action.label}</p>
                    {action.soon && <p className="text-xs text-muted-foreground">Próximamente</p>}
                  </div>
                  {isChecked && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">{draftIds.length}/{MAX_SHORTCUTS} seleccionados</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigOpen(false)}>Cancelar</Button>
            <Button onClick={saveConfig}>Guardar cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          switch (kpiPopup) {
            case "total": return `Total Empleados — ${total}`;
            case "ausencias": return `Ausencias Pendientes — ${pendingAbsences.length}`;
            case "onboarding": return `En Onboarding — ${nuevos30d}`;
            default: return "";
          }
        })()}
        subtitle={(() => {
          switch (kpiPopup) {
            case "total": return "Empleados activos en nómina";
            case "ausencias": return "Esperando revisión del manager";
            case "onboarding": return "Ingresos de los últimos 30 días";
            default: return undefined;
          }
        })()}
        rows={(() => {
          if (!kpiPopup) return [];
          if (kpiPopup === "total") {
            return employees.slice(0, 100).map((e: any): KpiRow => ({
              primary: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || e.full_name || "Sin nombre",
              secondary: e.position ?? e.department_name ?? undefined,
              right: e.status ?? "—",
              rightTone: e.status === "activo" ? "success" : "default",
            }));
          }
          if (kpiPopup === "ausencias") {
            return pendingAbsences.slice(0, 100).map((a: any): KpiRow => ({
              primary: a.employee_name ?? a.full_name ?? `Empleado ${a.employee_id?.slice?.(0, 8) ?? "—"}`,
              secondary: a.absence_type ? `${a.absence_type} · ${a.start_date ? new Date(a.start_date).toLocaleDateString("es") : "—"}` : a.start_date ? new Date(a.start_date).toLocaleDateString("es") : undefined,
              right: a.status ?? "Pendiente",
              rightTone: "warning",
            }));
          }
          if (kpiPopup === "onboarding") {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return employees
              .filter((e: any) => e.hire_date && new Date(e.hire_date) >= thirtyDaysAgo)
              .slice(0, 100)
              .map((e: any): KpiRow => ({
                primary: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "Sin nombre",
                secondary: e.position ?? undefined,
                right: e.hire_date ? new Date(e.hire_date).toLocaleDateString("es") : "—",
              }));
          }
          return [];
        })()}
      />
    </div>
  );
}
