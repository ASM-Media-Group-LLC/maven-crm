import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, CheckSquare, AlertTriangle, Clock, ArrowLeft, LayoutGrid, List, Search, AlignJustify, Play, Pause, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { useTareas, type Task } from "./useTareas";
import TaskCard from "./TaskCard";
import DraggableGrid from "./DraggableGrid";
import CreateTaskModal from "./CreateTaskModal";
import EditTaskModal from "./EditTaskModal";
import DeleteTaskDialog from "./DeleteTaskDialog";
import OverdueReasonModal from "./OverdueReasonModal";
import TasksTable from "./TasksTable";
import TaskListView from "./TaskListView";

interface TareasContentProps {
  projectId: string;
}

const TareasContent = ({ projectId }: TareasContentProps) => {
  const navigate = useNavigate();
  const { tasks, isLoading, companyProfiles, projectName, projectDescription, projectLeaderId, createTask, completeTask, updateTaskStatus, submitOverdueReason, updateTask, deleteTask, reorderTasks, patchTask, updateTaskAssignees } = useTareas(projectId);
  const [createOpen, setCreateOpen] = useState(false);
  const [justifyTask, setJustifyTask] = useState<Task | null>(null);
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list" | "clickup">("clickup");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [assignedFilter, setAssignedFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");

  const now = Date.now();

  const getTaskStatus = (t: Task): string => {
    if (t.status === "completed") return "completed";
    if (t.status === "in_progress") {
      if (new Date(t.due_at).getTime() <= now) return "overdue";
      return "in_progress";
    }
    if (t.status === "paused") {
      if (new Date(t.due_at).getTime() <= now) return "overdue";
      return "paused";
    }
    // active or overdue status
    if (new Date(t.due_at).getTime() <= now) return "overdue";
    return "pending";
  };

  const filteredAndSortedTasks = useMemo(() => {
    const filtered = tasks.filter((t) => {
      const matchesSearch = !search || t.title.toLowerCase().includes(search.toLowerCase());
      const taskStatus = getTaskStatus(t);
      const matchesStatus = !statusFilter || taskStatus === statusFilter;
      const matchesAssigned = !assignedFilter || (t.assignees || []).includes(assignedFilter);
      const matchesPriority = !priorityFilter || t.priority === priorityFilter;
      return matchesSearch && matchesStatus && matchesAssigned && matchesPriority;
    });

    return filtered.sort((a, b) => {
      const getOrder = (t: Task) => {
        const s = getTaskStatus(t);
        if (s === "overdue") return 0;
        if (s === "in_progress") return 1;
        if (s === "pending") return 2;
        if (s === "paused") return 3;
        return 4; // completed
      };
      return getOrder(a) - getOrder(b) || new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    });
  }, [tasks, now, search, statusFilter, assignedFilter, priorityFilter]);

  const counts = useMemo(() => {
    let pending = 0, in_progress = 0, paused = 0, overdue = 0, completed = 0;
    tasks.forEach((t) => {
      const s = getTaskStatus(t);
      if (s === "completed") completed++;
      else if (s === "overdue") overdue++;
      else if (s === "in_progress") in_progress++;
      else if (s === "paused") paused++;
      else pending++;
    });
    return { pending, in_progress, paused, overdue, completed };
  }, [tasks, now]);

  const totalTasks = tasks.length;
  const projectProgress = totalTasks > 0 ? Math.round((counts.completed / totalTasks) * 100) : 0;
  const projectLeader = projectLeaderId ? companyProfiles.find(p => p.id === projectLeaderId) : null;

  const handleComplete = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const isOverdue = new Date(task.due_at).getTime() <= Date.now();
    if (isOverdue && task.status !== "completed" && !task.overdue_reason) {
      setJustifyTask(task);
      return;
    }
    completeTask.mutate(id);
  };

  const handleStatusChange = (taskId: string, status: string) => {
    if (status === "completed") {
      handleComplete(taskId);
      return;
    }
    updateTaskStatus.mutate({ taskId, status });
  };

  const kpis = [
    { label: "Pendientes", value: counts.pending, icon: Clock, color: "text-primary", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:to-transparent hover:border-primary/40" },
    { label: "En curso", value: counts.in_progress, icon: Play, color: "text-primary", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:to-transparent hover:border-primary/40" },
    { label: "Pausadas", value: counts.paused, icon: Pause, color: "text-yellow-400", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-yellow-500/15 hover:to-transparent hover:border-yellow-500/40" },
    { label: "Vencidas", value: counts.overdue, icon: AlertTriangle, color: "text-destructive", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:to-transparent hover:border-destructive/40" },
    { label: "Completadas", value: counts.completed, icon: CheckSquare, color: "text-emerald-400", hoverClass: "hover:scale-[1.03] hover:bg-gradient-to-br hover:from-emerald-500/15 hover:to-transparent hover:border-emerald-500/40" },
  ];

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/tareas")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">{projectName || "Tareas"}</h1>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nueva Tarea
          </Button>
        </div>
        {/* Project summary banner */}
        <div className="mt-3 ml-11 rounded-lg border border-border bg-card p-4 space-y-3">
          {projectDescription && (
            <p className="text-sm text-muted-foreground max-w-2xl line-clamp-2">{projectDescription}</p>
          )}
          <div className="flex items-center gap-6 flex-wrap">
            {projectLeader && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20">
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-primary">Líder: {projectLeader.full_name}</span>
              </div>
            )}
            <div className="flex items-center gap-3 flex-1 min-w-[200px] max-w-sm">
              <Progress value={projectProgress} className="h-3 flex-1" />
              <span className="text-sm font-bold">{projectProgress}%</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-primary" /> {counts.pending} pendientes</span>
              <span className="flex items-center gap-1.5"><Play className="h-3.5 w-3.5 text-blue-400" /> {counts.in_progress} en curso</span>
              {counts.overdue > 0 && <span className="flex items-center gap-1.5 text-destructive font-medium"><AlertTriangle className="h-3.5 w-3.5" /> {counts.overdue} vencidas</span>}
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium"><CheckSquare className="h-3.5 w-3.5" /> {counts.completed} completadas</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className={cn("transition-all duration-200 cursor-default", kpi.hoverClass)}>
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
              <SelectItem value="in_progress">En curso</SelectItem>
              <SelectItem value="paused">Pausada</SelectItem>
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
            <Button variant={viewMode === "clickup" ? "secondary" : "ghost"} size="icon" onClick={() => setViewMode("clickup")} title="Vista ClickUp">
              <AlignJustify className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" onClick={() => setViewMode("list")} title="Tabla">
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" onClick={() => setViewMode("grid")} title="Grid">
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Cargando tareas...</p>
        ) : filteredAndSortedTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No hay tareas aún. Crea la primera.</p>
        ) : viewMode === "clickup" ? (
          <TaskListView
            tasks={filteredAndSortedTasks}
            profiles={companyProfiles}
            onComplete={handleComplete}
            onJustify={setJustifyTask}
            onEdit={setEditTarget}
            onDelete={setDeleteTarget}
            onCreateNew={() => setCreateOpen(true)}
            onStatusChange={handleStatusChange}
            onPatchTask={(id, fields) => patchTask.mutate({ taskId: id, fields })}
            onUpdateAssignees={(id, ids) => updateTaskAssignees.mutate({ taskId: id, assigneeIds: ids })}
          />
        ) : viewMode === "list" ? (
          <TasksTable
            tasks={filteredAndSortedTasks}
            profiles={companyProfiles}
            onComplete={handleComplete}
            onJustify={setJustifyTask}
            onEdit={setEditTarget}
            onDelete={setDeleteTarget}
            onStatusChange={handleStatusChange}
            onPatchTask={(id, fields) => patchTask.mutate({ taskId: id, fields })}
            onUpdateAssignees={(id, ids) => updateTaskAssignees.mutate({ taskId: id, assigneeIds: ids })}
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
                onStatusChange={handleStatusChange}
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
