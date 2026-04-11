import { useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { subDays, startOfDay, format } from "date-fns";
import { CheckSquare, ListTodo, AlertTriangle, TrendingUp } from "lucide-react";
import type { Task } from "./useTareas";

interface Profile {
  id: string;
  full_name: string | null;
}

interface ProjectInfo {
  id: string;
  name: string;
}

interface GlobalAnalyticsTabProps {
  tasks: Task[];
  profiles: Profile[];
  projects: ProjectInfo[];
  isLoading?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#3b82f6",
  in_progress: "#6366f1",
  paused: "#eab308",
  overdue: "#ef4444",
  completed: "#10b981",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  paused: "Pausada",
  overdue: "Vencida",
  completed: "Completada",
};
const PRIORITY_COLORS: Record<string, string> = { low: "#64748b", medium: "#3b82f6", high: "#f97316", urgent: "#ef4444" };
const PRIORITY_LABELS: Record<string, string> = { low: "Baja", medium: "Media", high: "Alta", urgent: "Urgente" };

const getStatus = (t: Task): string => {
  if (t.status === "completed") return "completed";
  if (t.status === "paused") return "paused";
  if (t.status === "in_progress") return "in_progress";
  if (new Date(t.due_at).getTime() <= Date.now()) return "overdue";
  return "pending";
};

const GlobalAnalyticsTab = ({ tasks, profiles, projects, isLoading }: GlobalAnalyticsTabProps) => {
  const projectMap = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p.name])), [projects]);

  // KPIs
  const kpis = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => getStatus(t) === "completed").length;
    const overdue = tasks.filter(t => getStatus(t) === "overdue").length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, overdue, progress };
  }, [tasks]);

  // Tasks per project
  const projectData = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach(t => {
      const pId = t.project_id || "none";
      counts[pId] = (counts[pId] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([id, value]) => ({ name: (projectMap[id] || "Sin proyecto").slice(0, 20), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);
  }, [tasks, projectMap]);

  // Status distribution
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach(t => { const s = getStatus(t); counts[s] = (counts[s] || 0) + 1; });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({ name: STATUS_LABELS[key] || key, value, fill: STATUS_COLORS[key] || "#888" }));
  }, [tasks]);

  // Priority distribution
  const priorityData = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach(t => { counts[t.priority] = (counts[t.priority] || 0) + 1; });
    return Object.entries(counts).map(([key, value]) => ({
      name: PRIORITY_LABELS[key] || key, value, fill: PRIORITY_COLORS[key] || "#888",
    }));
  }, [tasks]);

  // Workload by member
  const workloadData = useMemo(() => {
    const pMap = Object.fromEntries(profiles.map(p => [p.id, p.full_name || "Sin nombre"]));
    const assigned: Record<string, { name: string; asignadas: number; completadas: number }> = {};
    tasks.forEach(t => {
      (t.assignees || []).forEach(uid => {
        if (!assigned[uid]) assigned[uid] = { name: pMap[uid] || uid.slice(0, 8), asignadas: 0, completadas: 0 };
        assigned[uid].asignadas++;
        if (getStatus(t) === "completed") assigned[uid].completadas++;
      });
    });
    return Object.values(assigned).sort((a, b) => b.asignadas - a.asignadas);
  }, [tasks, profiles]);

  // 30-day completion trend
  const trendData = useMemo(() => {
    const today = startOfDay(new Date());
    const points: { date: string; completadas: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = subDays(today, i);
      const dayStr = format(day, "yyyy-MM-dd");
      const count = tasks.filter(t =>
        t.completed_at && format(startOfDay(new Date(t.completed_at)), "yyyy-MM-dd") === dayStr
      ).length;
      points.push({ date: format(day, "dd/MM"), completadas: count });
    }
    return points;
  }, [tasks]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return <p className="text-center text-muted-foreground py-12">No hay tareas para analizar. Crea tareas dentro de tus proyectos para ver las analíticas globales.</p>;
  }

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ListTodo className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">{kpis.total}</p>
              <p className="text-xs text-muted-foreground">Total Tareas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckSquare className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-2xl font-bold">{kpis.completed}</p>
              <p className="text-xs text-muted-foreground">Completadas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-2xl font-bold">{kpis.overdue}</p>
              <p className="text-xs text-muted-foreground">Vencidas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <TrendingUp className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">{kpis.progress}%</p>
              <p className="text-xs text-muted-foreground">Progreso</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tasks by project */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Tareas por Proyecto</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, projectData.length * 32)}>
              <BarChart data={projectData} layout="vertical">
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Tareas" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status pie */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Distribución por Estado</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {statusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Priority bars */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Distribución por Prioridad</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={priorityData} layout="vertical">
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {priorityData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Workload */}
        {workloadData.length > 0 && (
          <Card className={workloadData.length > 3 ? "md:col-span-2" : ""}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Carga por Miembro</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(200, workloadData.length * 40)}>
                <BarChart data={workloadData} layout="vertical">
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="asignadas" fill="#6366f1" name="Asignadas" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="completadas" fill="#10b981" name="Completadas" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* 30-day trend */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Tendencia de Completación (30 días)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={2} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="completadas" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Completadas" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GlobalAnalyticsTab;
