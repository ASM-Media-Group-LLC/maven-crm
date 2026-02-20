import {
  Users, UserCheck, UserX, Clock, LayoutDashboard, UserPlus,
  CalendarDays, AlertTriangle, TrendingDown, TrendingUp,
  BookOpen, FileText, Briefcase, Activity, ChevronRight,
  Percent, Timer, RotateCcw,
} from "lucide-react";
import { useEmployees } from "@/hooks/useEmployees";
import { HRPageHeader } from "@/components/hr/HRPageHeader";
import { HRMetricCard } from "@/components/hr/HRMetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeStatusBadge } from "@/components/hr/EmployeeStatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

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

export default function HRDashboard() {
  const { data: employees = [], isLoading } = useEmployees();
  const { data: pendingAbsences = [], isLoading: absencesLoading } = usePendingAbsences();
  const navigate = useNavigate();

  const now = new Date();
  const thirtyDaysAgo = subDays(now, 30);
  const twelveMonthsAgo = subDays(now, 365);

  const total = employees.length;
  const activos = employees.filter((e) => e.status === "activo").length;
  const enLicencia = employees.filter((e) => e.status === "en_licencia").length;
  const vacaciones = employees.filter((e) => e.status === "vacaciones").length;

  // Nuevos en los últimos 30 días (En Onboarding)
  const nuevos30d = employees.filter(
    (e) => e.hire_date && new Date(e.hire_date) >= thirtyDaysAgo
  ).length;

  // Terminados en los últimos 30 días (Retiros)
  const terminados30d = employees.filter(
    (e) => e.termination_date && new Date(e.termination_date) >= thirtyDaysAgo
  ).length;

  // Terminados en los últimos 12 meses
  const terminados12m = employees.filter(
    (e) => e.termination_date && new Date(e.termination_date) >= twelveMonthsAgo
  ).length;

  // Rotación 30d = terminados / total * 100
  const rotacion30d = total > 0 ? ((terminados30d / total) * 100).toFixed(1) : "0.0";
  // % Ingresos 30d
  const pctIngresos30d = total > 0 ? ((nuevos30d / total) * 100).toFixed(1) : "0.0";
  // Rotación 12m
  const rotacion12m = total > 0 ? ((terminados12m / total) * 100).toFixed(1) : "0.0";

  // Antigüedad promedio (en días → meses)
  const avgAntiguedadDays =
    employees.filter((e) => e.hire_date).length > 0
      ? employees
          .filter((e) => e.hire_date)
          .reduce((acc, e) => acc + differenceInDays(now, new Date(e.hire_date!)), 0) /
        employees.filter((e) => e.hire_date).length
      : 0;
  const avgAntiguedadMeses = Math.round(avgAntiguedadDays / 30);

  const rotacionCards = [
    { label: "Rotación 30d", value: `${rotacion30d}%`, color: "bg-red-950/40 border-red-800/30", icon: RotateCcw, textColor: "text-red-300" },
    { label: "Retiros 30d", value: `${terminados30d}`, color: "bg-orange-950/40 border-orange-800/30", icon: TrendingDown, textColor: "text-orange-300" },
    { label: "% Ingresos 30d", value: `${pctIngresos30d}%`, color: "bg-green-950/40 border-green-800/30", icon: TrendingUp, textColor: "text-green-300" },
    { label: "Antigüedad Prom.", value: `${avgAntiguedadMeses}m`, color: "bg-blue-950/40 border-blue-800/30", icon: Timer, textColor: "text-blue-300" },
    { label: "Rotación 12m", value: `${rotacion12m}%`, color: "bg-purple-950/40 border-purple-800/30", icon: Percent, textColor: "text-purple-300" },
  ];

  const quickActions = [
    { label: "Registrar Ausencia", icon: AlertTriangle, url: "/hr/ausencias" },
    { label: "Ver Asistencia", icon: Activity, url: null },
    { label: "Ver Directorio", icon: Users, url: "/hr/directorio" },
    { label: "Agregar Empleado", icon: UserPlus, url: "/hr/empleado/nuevo" },
  ];

  const hrModules = [
    { label: "Asistencia", icon: Activity, url: null },
    { label: "Vacaciones", icon: CalendarDays, url: null },
    { label: "Horarios", icon: Clock, url: null },
    { label: "Capacitación", icon: BookOpen, url: "/hr/capacitacion" },
    { label: "Incidentes", icon: AlertTriangle, url: "/hr/incidentes" },
    { label: "Candidatos", icon: Briefcase, url: "/hr/candidatos" },
  ];

  const teamSummary = [
    { label: "Activos", value: activos, color: "bg-green-950/40 border-green-800/30", textColor: "text-green-300" },
    { label: "En Licencia", value: enLicencia, color: "bg-yellow-950/40 border-yellow-800/30", textColor: "text-yellow-300" },
    { label: "Nuevos (30d)", value: nuevos30d, color: "bg-blue-950/40 border-blue-800/30", textColor: "text-blue-300" },
    { label: "Total", value: total, color: "bg-primary/10 border-primary/20", textColor: "text-primary" },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6 space-y-5">
        <HRPageHeader
          title="Dashboard RRHH"
          subtitle="Resumen de recursos humanos"
          icon={LayoutDashboard}
          actions={
            <Button onClick={() => navigate("/hr/empleado/nuevo")} size="sm">
              + Nuevo Empleado
            </Button>
          }
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          ) : (
            <>
              <HRMetricCard title="Total Empleados" value={total} icon={Users} color="primary" subtitle="En nómina" />
              <HRMetricCard title="Check-ins Hoy" value={0} icon={UserCheck} color="success" subtitle="Sin sistema de asistencia" />
              <HRMetricCard title="Ausencias Pend." value={pendingAbsences.length} icon={AlertTriangle} color="warning" subtitle="Pendientes de revisión" />
              <HRMetricCard title="En Onboarding" value={nuevos30d} icon={UserPlus} color="default" subtitle="Ingresos últimos 30d" />
            </>
          )}
        </div>

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
                <div
                  key={card.label}
                  className={cn("rounded-lg border p-3 flex flex-col gap-1", card.color)}
                >
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

        {/* Acciones Rápidas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Button
              key={action.label}
              variant="outline"
              className={cn("flex items-center gap-2 h-10 justify-start", !action.url && "opacity-50 cursor-not-allowed")}
              onClick={() => action.url && navigate(action.url)}
              disabled={!action.url}
            >
              <action.icon className="h-4 w-4 shrink-0" />
              <span className="truncate text-sm">{action.label}</span>
            </Button>
          ))}
        </div>

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
                    onClick={() => mod.url && navigate(mod.url)}
                    disabled={!mod.url}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors",
                      mod.url
                        ? "hover:bg-muted/50 cursor-pointer"
                        : "opacity-40 cursor-not-allowed"
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

        {/* Resumen del Equipo */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Resumen del Equipo</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)
              : teamSummary.map((item) => (
                  <div key={item.label} className={cn("rounded-lg border p-3 flex items-center justify-between", item.color)}>
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span className={cn("text-2xl font-bold", item.textColor)}>{item.value}</span>
                  </div>
                ))}
          </div>
        </div>
      </div>
    </div>
  );
}
