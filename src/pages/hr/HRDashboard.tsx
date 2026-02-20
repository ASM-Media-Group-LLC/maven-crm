import { Users, UserCheck, UserX, TrendingUp, Building2, Briefcase, Clock, AlertTriangle } from "lucide-react";
import { useEmployees, useDepartments } from "@/hooks/useEmployees";
import { HRPageHeader } from "@/components/hr/HRPageHeader";
import { HRMetricCard } from "@/components/hr/HRMetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeStatusBadge } from "@/components/hr/EmployeeStatusBadge";
import { EmployeeAreaBadge } from "@/components/hr/EmployeeAreaBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function HRDashboard() {
  const { data: employees = [], isLoading } = useEmployees();
  const { data: departments = [] } = useDepartments();
  const navigate = useNavigate();

  const total = employees.length;
  const activos = employees.filter((e) => e.status === "activo").length;
  const enLicencia = employees.filter((e) => e.status === "en_licencia").length;
  const vacaciones = employees.filter((e) => e.status === "vacaciones").length;

  const recentHires = [...employees]
    .filter((e) => e.hire_date)
    .sort((a, b) => new Date(b.hire_date!).getTime() - new Date(a.hire_date!).getTime())
    .slice(0, 5);

  const deptDistribution = departments.map((dept) => ({
    ...dept,
    count: employees.filter((e) => e.department_id === dept.id).length,
  })).filter((d) => d.count > 0).sort((a, b) => b.count - a.count);

  return (
    <div className="p-6 space-y-6">
      <HRPageHeader
        title="Dashboard RRHH"
        subtitle="Resumen de recursos humanos"
        icon={Users}
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
            <HRMetricCard title="Activos" value={activos} icon={UserCheck} color="success" subtitle={`${total > 0 ? Math.round((activos / total) * 100) : 0}% del total`} />
            <HRMetricCard title="En Licencia" value={enLicencia} icon={Clock} color="warning" subtitle="Ausencias activas" />
            <HRMetricCard title="Vacaciones" value={vacaciones} icon={UserX} color="default" subtitle="Disfrutando descanso" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribución por departamento */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Distribución por Departamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 rounded" />)
            ) : deptDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin datos de departamentos</p>
            ) : (
              deptDistribution.map((dept) => (
                <div key={dept.id} className="flex items-center gap-3">
                  <EmployeeAreaBadge departmentName={dept.name} departmentCode={dept.code} />
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded-full transition-all"
                      style={{ width: `${total > 0 ? (dept.count / total) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground w-6 text-right">{dept.count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Contrataciones recientes */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                Contrataciones Recientes
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/hr/directorio")} className="text-xs">
                Ver todos
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded" />)
            ) : recentHires.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay contrataciones registradas</p>
            ) : (
              recentHires.map((emp) => (
                <div
                  key={emp.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/hr/empleado/${emp.id}`)}
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    {emp.profile_photo_url ? (
                      <img src={emp.profile_photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                    ) : (
                      <span className="text-xs font-medium text-primary">
                        {emp.first_name[0]}{emp.last_name[0]}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {emp.first_name} {emp.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {emp.positions?.name ?? "Sin cargo"} · {emp.hire_date ? format(new Date(emp.hire_date), "dd MMM yyyy", { locale: es }) : "—"}
                    </p>
                  </div>
                  <EmployeeStatusBadge status={emp.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
