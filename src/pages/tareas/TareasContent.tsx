import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, CheckSquare, AlertTriangle, Clock, ArrowLeft, LayoutGrid, List, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTareas, type Task } from "./useTareas";
import TaskCard from "./TaskCard";
import DraggableGrid from "./DraggableGrid";
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
  const { tasks, isLoading, companyProfiles, projectName, createTask, completeTask, submitOverdueReason, updateTask, deleteTask, reorderTasks } = useTareas(projectId);
  const [createOpen, setCreateOpen] = useState(false);
  const [justifyTask, setJustifyTask] = useState<Task | null>(null);
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [assignedFilter, setAssignedFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");

  const now = Date.now();

  const getTaskStatus = (t: Task) => {
    if (t.status === "completed") return "completed";
    if (new Date(t.due_at).getTime() <= now) return "overdue";
    return "pending";
  };

  const filteredAndSortedTasks = useMemo(() => {
    const filtered = tasks.filter((t) => {
      const matchesSearch = !search || t.title.toLowerCase().includes(search.toLowerCase());
      const taskStatus = getTaskStatus(t);
      const matchesStatus = !statusFilter || taskStatus === statusFilter;
      const matchesAssigned = !assignedFilter || t.assigned_to === assignedFilter;
      const matchesPriority = !priorityFilter || t.priority === priorityFilter;
      return matchesSearch && matchesStatus && matchesAssigned && matchesPriority;
    });

    return filtered.sort((a, b) => {
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
  }, [tasks, now, search, statusFilter, assignedFilter, priorityFilter]);

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
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/tareas")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{projectName || "Tareas"}</h1>
              <p className="text-sm text-muted-foreground">Tareas del proyecto</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nueva Tarea
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
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

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar tarea..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="overdue">Vencida</SelectItem>
              <SelectItem value="completed">Completada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assignedFilter || undefined} onValueChange={(v) => setAssignedFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Asignado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {companyProfiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name || p.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter || undefined} onValueChange={(v) => setPriorityFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Prioridad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              <SelectItem value="low">Baja</SelectItem>
              <SelectItem value="medium">Media</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="urgent">Urgente</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 ml-auto">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" onClick={() => setViewMode("list")}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" onClick={() => setViewMode("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Cargando tareas...</p>
        ) : filteredAndSortedTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No hay tareas aún. Crea la primera.</p>
        ) : viewMode === "list" ? (
          <TasksTable
            tasks={filteredAndSortedTasks}
            profiles={companyProfiles}
            onComplete={handleComplete}
            onJustify={setJustifyTask}
            onEdit={setEditTarget}
            onDelete={setDeleteTarget}
          />
        ) : (
          <DraggableGrid
            items={filteredAndSortedTasks}
            onReorder={(ids) => reorderTasks.mutate(ids)}
            renderItem={(task) => (
              <TaskCard
                task={task}
                onComplete={handleComplete}
                onJustify={setJustifyTask}
                onEdit={setEditTarget}
                onDelete={setDeleteTarget}
              />
            )}
          />
        )}
      </div>

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
