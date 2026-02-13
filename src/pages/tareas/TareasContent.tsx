import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, CheckSquare, AlertTriangle, Clock, ArrowLeft, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTareas, type Task } from "./useTareas";
import TaskCard from "./TaskCard";
import CreateTaskModal from "./CreateTaskModal";
import EditTaskModal from "./EditTaskModal";
import DeleteTaskDialog from "./DeleteTaskDialog";
import OverdueReasonModal from "./OverdueReasonModal";
import TasksTable from "./TasksTable";

interface TareasContentProps {
  projectId: string;
}

const TareasContent = ({ projectId }: TareasContentProps) => {
  const navigate = useNavigate();
  const { tasks, isLoading, companyProfiles, projectName, createTask, completeTask, submitOverdueReason, updateTask, deleteTask } = useTareas(projectId);
  const [createOpen, setCreateOpen] = useState(false);
  const [justifyTask, setJustifyTask] = useState<Task | null>(null);
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const now = Date.now();

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const getOrder = (t: Task) => {
        if (t.status === "completed") return 4;
        const due = new Date(t.due_at).getTime();
        if (due <= now && !t.overdue_reason) return 0;
        if (due <= now) return 1;
        if (due - now < 30 * 60 * 1000) return 2;
        return 3;
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
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/tareas")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">{projectName || "Tareas"}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}>
            {viewMode === "grid" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nueva Tarea
          </Button>
        </div>
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
      ) : viewMode === "list" ? (
        <TasksTable
          tasks={sortedTasks}
          profiles={companyProfiles}
          onComplete={handleComplete}
          onJustify={setJustifyTask}
          onEdit={setEditTarget}
          onDelete={setDeleteTarget}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={handleComplete}
              onJustify={setJustifyTask}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      <CreateTaskModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        profiles={companyProfiles}
        projectId={projectId}
        onSubmit={(data) => createTask.mutate(data)}
        isLoading={createTask.isPending}
      />

      <EditTaskModal
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        task={editTarget}
        profiles={companyProfiles}
        onSubmit={(data) => updateTask.mutate(data)}
        isLoading={updateTask.isPending}
      />

      <DeleteTaskDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        taskTitle={deleteTarget?.title || ""}
        onConfirm={() => {
          if (deleteTarget) deleteTask.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        isLoading={deleteTask.isPending}
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
