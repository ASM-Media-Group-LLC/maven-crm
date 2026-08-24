import { useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ListTodo } from "lucide-react";
import { format, differenceInDays, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import type { Task } from "./useTareas";
import { EmptyState } from "@/components/EmptyState";

interface Profile {
  id: string;
  full_name: string | null;
}

interface TaskAnalyticsTabProps {
  tasks: Task[];
  profiles: Profile[];
  getTaskStatus: (t: Task) => string;
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

const PRIORITY_COLORS: Record<string, string> = {
  low: "#64748b",
  medium: "#3b82f6",
  high: "#f97316",
  urgent: "#ef4444",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};


const TaskAnalyticsTab = ({ tasks, profiles, getTaskStatus }: TaskAnalyticsTabProps) => {
  // KPI calculations
  const kpis = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter((t) => getTaskStatus(t) === "completed").length;
    const overdue = tasks.filter((t) => getTaskStatus(t) === "overdue").length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, overdue, progress };
  }, [tasks, getTaskStatus]);

  // Status distribution
  const statusData = useMemo(() => {
    const counts: Record<string, number> = { pending: 0, in_progress: 0, paused: 0, overdue: 0, completed: 0 };
    tasks.forEach((t) => { const s = getTaskStatus(t); counts[s] = (counts[s] || 0) + 1; });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({ name: STATUS_LABELS[key] || key, value, fill: STATUS_COLORS[key] || "#888" }));
  }, [tasks, getTaskStatus]);

  // Priority distribution
  const priorityData = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach((t) => { counts[t.priority] = (counts[t.priority] || 0) + 1; });
    return Object.entries(counts).map(([key, value]) => ({
      name: PRIORITY_LABELS[key] || key,
      value,
      fill: PRIORITY_COLORS[key] || "#888",
    }));
  }, [tasks]);

  // Workload by member
  const workloadData = useMemo(() => {
    const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p.full_name || "Sin nombre"]));
    const assigned: Record<string, { name: string; asignadas: number; completadas: number }> = {};
    tasks.forEach((t) => {
      (t.assignees || []).forEach((uid) => {
        if (!assigned[uid]) assigned[uid] = { name: profileMap[uid] || uid.slice(0, 8), asignadas: 0, completadas: 0 };
        assigned[uid].asignadas++;
        if (getTaskStatus(t) === "completed") assigned[uid].completadas++;
      });
    });
    return Object.values(assigned).sort((a, b) => b.asignadas - a.asignadas);
  }, [tasks, profiles, getTaskStatus]);

  // Gantt chart data
  const ganttChartData = useMemo(() => {
    const withDates = tasks.filter((t) => t.start_at);
    if (withDates.length === 0) return { data: [], minDate: new Date(), totalDays: 0 };

    const allStarts = withDates.map((t) => new Date(t.start_at!).getTime());
    const allEnds = withDates.map((t) => new Date(t.due_at).getTime());
    const minDate = startOfDay(new Date(Math.min(...allStarts)));
    const maxDate = startOfDay(new Date(Math.max(...allEnds)));
    const totalDays = Math.max(1, differenceInDays(maxDate, minDate) + 1);

    const data = withDates
      .sort((a, b) => new Date(a.start_at!).getTime() - new Date(b.start_at!).getTime())
      .slice(0, 20)
      .map((t) => {
        const start = startOfDay(new Date(t.start_at!));
        const end = startOfDay(new Date(t.due_at));
        const offset = differenceInDays(start, minDate);
        const duration = Math.max(1, differenceInDays(end, start));
        const status = getTaskStatus(t);
        return {
          title: t.title.length > 30 ? t.title.slice(0, 30) + "…" : t.title,
          offset,
          duration,
          fill: STATUS_COLORS[status] || "#888",
          startLabel: format(start, "dd MMM", { locale: es }),
          endLabel: format(end, "dd MMM", { locale: es }),
        };
      });

    return { data, minDate, totalDays };
  }, [tasks, getTaskStatus]);

  // Overdue tasks without reason
  const overdueTasks = useMemo(() => {
    return tasks.filter((t) => {
      const s = getTaskStatus(t);
      return s === "overdue" && !t.overdue_reason;
    });
  }, [tasks, getTaskStatus]);


  if (tasks.length === 0) {
    return (
      <EmptyState
        seed="tareas-analytics"
        title="No hay tareas para analizar"
        description="Crea tareas en este proyecto para ver las analíticas."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Status pie */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Distribución por Estado</CardTitle></CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {statusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState className="py-8" icon={<ListTodo className="h-8 w-8 text-muted-foreground" />} title="Sin datos de estado disponibles" />
            )}
          </CardContent>
        </Card>

        {/* Priority bars */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Distribución por Prioridad</CardTitle></CardHeader>
          <CardContent>
            {priorityData.length > 0 ? (
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
            ) : (
              <EmptyState className="py-8" icon={<ListTodo className="h-8 w-8 text-muted-foreground" />} title="Sin datos de prioridad disponibles" />
            )}
          </CardContent>
        </Card>

        {/* Gantt Chart */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Diagrama Gantt</CardTitle></CardHeader>
          <CardContent>
            {ganttChartData.data.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(250, ganttChartData.data.length * 36)}>
                <BarChart data={ganttChartData.data} layout="vertical" barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, ganttChartData.totalDays]}
                    allowDecimals={false}
                    tick={{ fontSize: 10 }}
                    label={{ value: "Días", position: "insideBottomRight", offset: -5, fontSize: 11 }}
                  />
                  <YAxis type="category" dataKey="title" width={180} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(value: any, name: string, props: any) => {
                      const item = props.payload;
                      if (name === "duration") return [`${value} días (${item.startLabel} → ${item.endLabel})`, "Duración"];
                      return [value, name];
                    }}
                  />
                  <Bar dataKey="offset" stackId="gantt" fill="transparent" radius={0} />
                  <Bar dataKey="duration" stackId="gantt" radius={[0, 4, 4, 0]}>
                    {ganttChartData.data.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState className="py-8" icon={<ListTodo className="h-8 w-8 text-muted-foreground" />} title="No hay tareas con fecha de inicio para el diagrama Gantt." description="Asigna fechas de inicio a las tareas." />
            )}
          </CardContent>
        </Card>

        {/* Workload */}
        <Card className={workloadData.length > 3 ? "md:col-span-2" : ""}>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Carga por Miembro</CardTitle></CardHeader>
          <CardContent>
            {workloadData.length > 0 ? (
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
            ) : (
              <EmptyState className="py-8" icon={<ListTodo className="h-8 w-8 text-muted-foreground" />} title="No hay tareas asignadas a miembros del equipo." />
            )}
          </CardContent>
        </Card>


        {/* Overdue without reason */}
        {overdueTasks.length > 0 && (
          <Card className="md:col-span-2 border-destructive/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" /> Vencidas sin Justificación ({overdueTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {overdueTasks.slice(0, 10).map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm">
                    <span className="truncate max-w-[300px]">{t.title}</span>
                    <span className="text-xs text-muted-foreground">
                      Venció {format(new Date(t.due_at), "dd MMM", { locale: es })}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default TaskAnalyticsTab;
