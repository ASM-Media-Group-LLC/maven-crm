import { useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { format, differenceInDays, startOfDay, addDays, parseISO, isAfter, isBefore } from "date-fns";
import { es } from "date-fns/locale";
import type { Task } from "./useTareas";

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

  // Burndown chart
  const burndownData = useMemo(() => {
    if (tasks.length === 0) return [];
    const dates = tasks.map((t) => new Date(t.due_at).getTime());
    const startDates = tasks.filter((t) => t.start_at).map((t) => new Date(t.start_at!).getTime());
    const earliest = Math.min(...dates, ...startDates, ...tasks.map((t) => t.created_at ? new Date(t.created_at).getTime() : Infinity));
    const latest = Math.max(...dates);
    const start = startOfDay(new Date(earliest));
    const end = startOfDay(new Date(latest));
    const totalDays = differenceInDays(end, start) || 1;
    const total = tasks.length;

    const points: { date: string; ideal: number; real: number }[] = [];
    for (let i = 0; i <= totalDays; i++) {
      const d = addDays(start, i);
      const completedByDate = tasks.filter(
        (t) => t.completed_at && !isAfter(startOfDay(parseISO(t.completed_at)), d)
      ).length;
      const remaining = total - completedByDate;
      const idealRemaining = Math.max(0, total - Math.round((total / totalDays) * i));
      points.push({
        date: format(d, "dd/MM"),
        ideal: idealRemaining,
        real: remaining,
      });
    }
    return points;
  }, [tasks]);

  // Overdue tasks without reason
  const overdueTasks = useMemo(() => {
    return tasks.filter((t) => {
      const s = getTaskStatus(t);
      return s === "overdue" && !t.overdue_reason;
    });
  }, [tasks, getTaskStatus]);

  // Gantt/timeline data
  const ganttData = useMemo(() => {
    return tasks
      .filter((t) => t.start_at)
      .map((t) => {
        const start = new Date(t.start_at!);
        const end = new Date(t.due_at);
        const days = Math.max(1, differenceInDays(end, start));
        return {
          title: t.title.length > 25 ? t.title.slice(0, 25) + "…" : t.title,
          days,
          status: getTaskStatus(t),
          startLabel: format(start, "dd MMM", { locale: es }),
          endLabel: format(end, "dd MMM", { locale: es }),
        };
      })
      .slice(0, 15);
  }, [tasks, getTaskStatus]);

  if (tasks.length === 0) {
    return <p className="text-center text-muted-foreground py-12">No hay tareas para analizar.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      {/* Burndown */}
      {burndownData.length > 1 && (
        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Burndown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={burndownData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="ideal" stroke="#64748b" strokeDasharray="5 5" name="Ideal" dot={false} />
                <Line type="monotone" dataKey="real" stroke="hsl(var(--primary))" name="Real" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

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

      {/* Gantt simplified */}
      {ganttData.length > 0 && (
        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Timeline</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {ganttData.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-[160px] truncate">{item.title}</span>
                <div className="flex-1 relative h-5 bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(8, (item.days / 30) * 100))}%`,
                      backgroundColor: STATUS_COLORS[item.status] || "#888",
                    }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground w-[100px] text-right">
                  {item.startLabel} → {item.endLabel}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
  );
};

export default TaskAnalyticsTab;
