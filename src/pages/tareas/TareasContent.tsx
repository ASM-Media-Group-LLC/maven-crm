import { useState, useMemo } from "react";
import { Plus, CheckSquare, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTareas, type Task } from "./useTareas";
import TaskCard from "./TaskCard";
import CreateTaskModal from "./CreateTaskModal";
import OverdueReasonModal from "./OverdueReasonModal";

const TareasContent = () => {
  const { tasks, isLoading, companyProfiles, createTask, completeTask, submitOverdueReason } = useTareas();
  const [createOpen, setCreateOpen] = useState(false);
  const [justifyTask, setJustifyTask] = useState<Task | null>(null);

  const now = Date.now();

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const getOrder = (t: Task) => {
        if (t.status === "completed") return 4;
        const due = new Date(t.due_at).getTime();
        if (due <= now && !t.overdue_reason) return 0; // overdue no justified
        if (due <= now) return 1; // overdue justified
        if (due - now < 30 * 60 * 1000) return 2; // warning
        return 3; // active
      };
      return getOrder(a) - getOrder(b) || new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    });
  }, [tasks, now]);

  const counts = useMemo(() => {
    let active = 0, overdue = 0, completed = 0;
    tasks.forEach((t) => {
      if (t.status === "completed") completed++;
      else if (new Date(t.due_at).getTime() <= now) overdue++;
      else active++;
    });
    return { active, overdue, completed };
  }, [tasks, now]);

  const handleComplete = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const isOverdue = new Date(task.due_at).getTime() <= Date.now();
    if (isOverdue && !task.overdue_reason) {
      setJustifyTask(task);
      return;
    }
    completeTask.mutate(id);
  };

  const kpis = [
    { label: "Activas", value: counts.active, icon: Clock, color: "text-primary" },
    { label: "Vencidas", value: counts.overdue, icon: AlertTriangle, color: "text-destructive" },
    { label: "Completadas", value: counts.completed, icon: CheckSquare, color: "text-emerald-400" },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Tareas</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nueva Tarea
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              <div>
                <p className="text-2xl font-bold">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Cargando tareas...</p>
      ) : sortedTasks.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No hay tareas aún. Crea la primera.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedTasks.map((task) => (
            <TaskCard key={task.id} task={task} onComplete={handleComplete} onJustify={setJustifyTask} />
          ))}
        </div>
      )}

      <CreateTaskModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        profiles={companyProfiles}
        onSubmit={(data) => createTask.mutate(data)}
        isLoading={createTask.isPending}
      />

      <OverdueReasonModal
        open={!!justifyTask}
        onOpenChange={(open) => !open && setJustifyTask(null)}
        taskTitle={justifyTask?.title || ""}
        onSubmit={(reason) => {
          if (justifyTask) submitOverdueReason.mutate({ taskId: justifyTask.id, reason });
        }}
        isLoading={submitOverdueReason.isPending}
      />
    </main>
  );
};

export default TareasContent;
