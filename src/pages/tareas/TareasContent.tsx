import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, CheckSquare, AlertTriangle, Clock, ArrowLeft, List, Search, Play, Pause, Crown, Pencil, Columns, BarChart3, Users, Check, MoreHorizontal, Settings, Archive, Trash2, Share2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
import { useProjectMembers } from "./useProjectMembers";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
// Progress removed - using circular SVG instead
import { useTareas, type Task } from "./useTareas";

import CreateTaskModal from "./CreateTaskModal";
import EditTaskModal from "./EditTaskModal";
import DeleteTaskDialog from "./DeleteTaskDialog";
import OverdueReasonModal from "./OverdueReasonModal";
import TasksTable from "./TasksTable";

import TaskKanbanView from "./TaskKanbanView";
import TaskDetailPage from "./TaskDetailPage";
import ProjectMiniSidebar from "./ProjectMiniSidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import EditProjectModal from "./EditProjectModal";
import DeleteProjectDialog from "./DeleteProjectDialog";
import TaskAnalyticsTab from "./TaskAnalyticsTab";

interface TareasContentProps {
  projectId: string;
}

const TareasContent = ({ projectId }: TareasContentProps) => {
  const navigate = useNavigate();
  const { tasks, isLoading, companyProfiles, projectName, projectDescription, projectLeaderId, createTask, completeTask, updateTaskStatus, submitOverdueReason, updateTask, deleteTask, reorderTasks, patchTask, updateTaskAssignees, updateProjectInline } = useTareas(projectId);
  const { members, setProjectMembers } = useProjectMembers(projectId);
  const [membersOpen, setMembersOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [justifyTask, setJustifyTask] = useState<Task | null>(null);
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "list" | "analytics">("kanban");
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [assignedFilter, setAssignedFilter] = useState<string>("");
  
  const [priorityFilter, setPriorityFilter] = useState<string>("");

  // Inline editing states
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [editingLeader, setEditingLeader] = useState(false);
  const [nameValue, setNameValue] = useState(projectName || "");
  const [descValue, setDescValue] = useState(projectDescription || "");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLInputElement>(null);

  // Sync local state when project data changes
  useEffect(() => { setNameValue(projectName || ""); }, [projectName]);
  useEffect(() => { setDescValue(projectDescription || ""); }, [projectDescription]);

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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => navigate("/tareas")}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Volver a proyectos</TooltipContent>
            </Tooltip>
            {editingName ? (
              <Input
                ref={nameInputRef}
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                className="text-2xl font-bold h-auto py-0 px-1 border-primary"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const trimmed = nameValue.trim();
                    if (trimmed && trimmed !== projectName) {
                      updateProjectInline.mutate({ name: trimmed });
                    } else {
                      setNameValue(projectName || "");
                    }
                    setEditingName(false);
                  }
                  if (e.key === "Escape") {
                    setNameValue(projectName || "");
                    setEditingName(false);
                  }
                }}
                onBlur={() => {
                  const trimmed = nameValue.trim();
                  if (trimmed && trimmed !== projectName) {
                    updateProjectInline.mutate({ name: trimmed });
                  } else {
                    setNameValue(projectName || "");
                  }
                  setEditingName(false);
                }}
              />
            ) : (
              <h1
                className="text-2xl font-bold cursor-pointer group/name flex items-center gap-2 hover:text-primary transition-colors"
                onClick={() => setEditingName(true)}
              >
                {projectName || "Tareas"}
                <Pencil className="h-3.5 w-3.5 opacity-0 group-hover/name:opacity-60 transition-opacity" />
              </h1>
            )}
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nueva Tarea
          </Button>
        </div>
        {/* Description inline */}
        <div className="ml-11 mt-1">
          {editingDesc ? (
            <Input
              ref={descInputRef}
              value={descValue}
              onChange={(e) => setDescValue(e.target.value)}
              placeholder="Agregar descripción..."
              className="text-sm max-w-2xl h-auto py-0.5 px-1 border-primary"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const val = descValue.trim() || null;
                  if (val !== (projectDescription || null)) {
                    updateProjectInline.mutate({ description: val });
                  }
                  setEditingDesc(false);
                }
                if (e.key === "Escape") {
                  setDescValue(projectDescription || "");
                  setEditingDesc(false);
                }
              }}
              onBlur={() => {
                const val = descValue.trim() || null;
                if (val !== (projectDescription || null)) {
                  updateProjectInline.mutate({ description: val });
                }
                setEditingDesc(false);
              }}
            />
          ) : (
            <p
              className="text-sm text-muted-foreground max-w-2xl line-clamp-2 cursor-pointer group/desc flex items-center gap-2 hover:text-foreground transition-colors"
              onClick={() => setEditingDesc(true)}
            >
              {projectDescription || "Agregar descripción..."}
              <Pencil className="h-3 w-3 opacity-0 group-hover/desc:opacity-60 transition-opacity" />
            </p>
          )}
        </div>
        {/* Leader inline */}
        <div className="flex items-center gap-2 mt-2 ml-11">
          <Crown className="h-4 w-4 text-amber-500" />
          {editingLeader ? (
            <Select
              value={projectLeaderId || "__none__"}
              onValueChange={(v) => {
                const newLeader = v === "__none__" ? null : v;
                if (newLeader !== projectLeaderId) {
                  updateProjectInline.mutate({ leader_id: newLeader });
                }
                setEditingLeader(false);
              }}
            >
              <SelectTrigger className="w-[200px] h-7 text-sm" autoFocus onBlur={() => setEditingLeader(false)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin líder</SelectItem>
                {companyProfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name || p.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span
              className="text-sm font-semibold cursor-pointer group/leader flex items-center gap-2 hover:text-primary transition-colors"
              onClick={() => setEditingLeader(true)}
            >
              {projectLeader ? projectLeader.full_name : "Sin líder asignado"}
              <Pencil className="h-3 w-3 opacity-0 group-hover/leader:opacity-60 transition-opacity" />
            </span>
          )}
        </div>
        {/* Members management */}
        <div className="flex items-center gap-2 mt-2 ml-11">
          <Popover open={membersOpen} onOpenChange={setMembersOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
                <Users className="h-3.5 w-3.5" />
                Miembros ({members.length})
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" side="bottom" align="start">
              <Command>
                <CommandInput placeholder="Buscar usuario..." />
                <CommandList>
                  <CommandEmpty>No encontrado</CommandEmpty>
                  {companyProfiles
                    .slice()
                    .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""))
                    .map((p) => {
                      const isMember = members.some((m) => m.user_id === p.id);
                      return (
                        <CommandItem
                          key={p.id}
                          value={p.full_name || p.id}
                          onSelect={() => {
                            const currentIds = members.map((m) => m.user_id);
                            const newIds = isMember
                              ? currentIds.filter((id) => id !== p.id)
                              : [...currentIds, p.id];
                            setProjectMembers.mutate({ projectId, userIds: newIds });
                          }}
                        >
                          <Check className={cn("h-4 w-4 mr-2", isMember ? "opacity-100" : "opacity-0")} />
                          {p.full_name || p.id}
                        </CommandItem>
                      );
                    })}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {members.length > 0 && (
            <div className="flex -space-x-1.5">
              {members.slice(0, 5).map((m) => {
                const p = companyProfiles.find((cp) => cp.id === m.user_id);
                const initials = p?.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2) || "?";
                return (
                  <Tooltip key={m.id}>
                    <TooltipTrigger asChild>
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-[9px] font-bold border border-background">
                        {initials}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{p?.full_name || "Sin nombre"}</TooltipContent>
                  </Tooltip>
                );
              })}
              {members.length > 5 && (
                <span className="text-[10px] text-muted-foreground ml-2">+{members.length - 5}</span>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Circular progress card + KPI cards in one row */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
          {/* Circular progress */}
          <Card className="col-span-2 sm:col-span-1">
            <CardContent className="flex flex-col items-center justify-center p-4 gap-2">
              <div className="relative h-20 w-20">
                <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="3"
                    strokeDasharray={`${projectProgress} ${100 - projectProgress}`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">{projectProgress}%</span>
              </div>
              <p className="text-xs text-muted-foreground text-center">Progreso</p>
            </CardContent>
          </Card>
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

        {/* Member tabs */}
        {(() => {
          const memberIds = Array.from(new Set(tasks.flatMap((t) => t.assignees || [])));
          const membersWithTasks = companyProfiles.filter((p) => memberIds.includes(p.id));
          if (membersWithTasks.length === 0) return null;
          return (
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 flex-wrap">
              <Button
                variant={assignedFilter === "" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setAssignedFilter("")}
              >
                Todos
              </Button>
              {membersWithTasks.map((p) => {
                const initials = p.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2) || "?";
                const firstName = p.full_name?.split(" ")[0] || p.id.slice(0, 6);
                return (
                  <Button
                    key={p.id}
                    variant={assignedFilter === p.id ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setAssignedFilter(assignedFilter === p.id ? "" : p.id)}
                    className="gap-1.5"
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[9px] font-bold shrink-0">
                      {initials}
                    </span>
                    {firstName}
                  </Button>
                );
              })}
            </div>
          );
        })()}

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar tarea..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
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
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "kanban" | "list" | "analytics")} className="ml-auto">
            <TabsList>
              <TabsTrigger value="kanban" className="gap-1.5"><Columns className="h-3.5 w-3.5" /> Kanban</TabsTrigger>
              <TabsTrigger value="list" className="gap-1.5"><List className="h-3.5 w-3.5" /> Lista</TabsTrigger>
              <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Analíticas</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {viewMode === "analytics" ? (
          <TaskAnalyticsTab tasks={tasks} profiles={companyProfiles} getTaskStatus={getTaskStatus} />
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Cargando tareas...</p>
        ) : filteredAndSortedTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No hay tareas aún. Crea la primera.</p>
        ) : viewMode === "kanban" ? (
          <TaskKanbanView
            tasks={filteredAndSortedTasks}
            profiles={companyProfiles}
            onStatusChange={handleStatusChange}
            onTaskClick={setDetailTask}
            getTaskStatus={getTaskStatus}
            onCreateInline={(title, status) => {
              const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
              createTask.mutate({
                title,
                assignee_ids: [],
                due_at: dueAt,
                duration_hours: 1,
                duration_minutes: 0,
                project_id: projectId,
                priority: "medium",
                status,
              });
            }}
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
        ) : null}
      </div>

      <TaskDetailSheet
        task={detailTask}
        open={!!detailTask}
        onOpenChange={(open) => !open && setDetailTask(null)}
        profiles={companyProfiles}
        onEdit={(t) => { setDetailTask(null); setEditTarget(t); }}
        onStatusChange={handleStatusChange}
      />


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
