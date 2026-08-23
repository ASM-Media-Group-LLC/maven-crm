import { useMemo } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Clock, Play, Pause, AlertTriangle, CheckSquare } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";
import type { Task } from "./useTareas";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url?: string | null;
}

interface ProjectInfo {
  id: string;
  name: string;
}

interface GlobalKanbanViewProps {
  tasks: Task[];
  profiles: Profile[];
  projects: ProjectInfo[];
  onStatusChange: (taskId: string, status: string) => void;
  onTaskClick?: (task: Task) => void;
}

const columns = [
  { id: "pending", label: "Pendiente", icon: Clock, color: "border-t-blue-500", bgHeader: "bg-blue-500/10 text-blue-400", dbStatus: "active" },
  { id: "in_progress", label: "En curso", icon: Play, color: "border-t-indigo-500", bgHeader: "bg-indigo-500/10 text-indigo-400", dbStatus: "in_progress" },
  { id: "paused", label: "Pausada", icon: Pause, color: "border-t-warning", bgHeader: "bg-warning/10 text-warning", dbStatus: "paused" },
  { id: "overdue", label: "Vencida", icon: AlertTriangle, color: "border-t-destructive", bgHeader: "bg-destructive/10 text-destructive", dbStatus: "active" },
  { id: "completed", label: "Completada", icon: CheckSquare, color: "border-t-success", bgHeader: "bg-success/10 text-success", dbStatus: "completed" },
];

const priorityColors: Record<string, string> = {
  low: "bg-slate-500",
  medium: "bg-blue-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
};

const getTaskStatus = (t: Task): string => {
  if (t.status === "completed") return "completed";
  if (t.status === "paused") return "paused";
  if (t.status === "in_progress") return "in_progress";
  if (new Date(t.due_at).getTime() <= Date.now()) return "overdue";
  return "pending";
};

const GlobalKanbanView = ({ tasks, profiles, projects, onStatusChange, onTaskClick }: GlobalKanbanViewProps) => {
  const profileMap = useMemo(() => {
    const m: Record<string, Profile> = {};
    profiles.forEach((p) => { m[p.id] = p; });
    return m;
  }, [profiles]);

  const projectMap = useMemo(() => {
    const m: Record<string, string> = {};
    projects.forEach((p) => { m[p.id] = p.name; });
    return m;
  }, [projects]);

  const grouped = useMemo(() => {
    const groups: Record<string, Task[]> = { pending: [], in_progress: [], paused: [], overdue: [], completed: [] };
    tasks.forEach((t) => {
      const s = getTaskStatus(t);
      if (groups[s]) groups[s].push(t);
      else groups.pending.push(t);
    });
    return groups;
  }, [tasks]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const task = tasks.find((t) => t.id === draggableId);
    if (!task) return;
    const currentStatus = getTaskStatus(task);
    if (currentStatus === destination.droppableId) return;
    const statusMap: Record<string, string> = {
      pending: "active",
      in_progress: "in_progress",
      paused: "paused",
      overdue: "active",
      completed: "completed",
    };
    onStatusChange(draggableId, statusMap[destination.droppableId] || "active");
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
        {columns.map((col) => {
          const colTasks = grouped[col.id] || [];
          const Icon = col.icon;
          return (
            <div key={col.id} className={cn("flex flex-col min-w-[280px] w-[280px] bg-muted/30 rounded-lg border-t-4", col.color)}>
              <div className={cn("flex items-center gap-2 px-3 py-2.5 rounded-t-lg", col.bgHeader)}>
                <Icon className="h-4 w-4" />
                <span className="font-semibold text-sm">{col.label}</span>
                <Badge variant="secondary" className="ml-auto text-xs h-5 min-w-[20px] justify-center">
                  {colTasks.length}
                </Badge>
              </div>
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn("flex-1 p-2 space-y-2 overflow-y-auto transition-colors", snapshot.isDraggingOver && "bg-primary/5")}
                  >
                    {colTasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            onClick={() => onTaskClick?.(task)}
                            className={cn(
                              "bg-card border rounded-lg p-3 cursor-pointer hover:border-primary/50 transition-all",
                              snapshot.isDragging && "shadow-lg rotate-2 scale-105"
                            )}
                          >
                            {/* Project badge */}
                            {task.project_id && projectMap[task.project_id] && (
                              <Badge variant="outline" className="text-[10px] mb-1.5 max-w-full truncate">
                                {projectMap[task.project_id]}
                              </Badge>
                            )}
                            {/* Priority + Title */}
                            <div className="flex items-start gap-2">
                              <div className={cn("w-1 h-full min-h-[20px] rounded-full shrink-0", priorityColors[task.priority] || "bg-slate-500")} />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm leading-tight line-clamp-2">{task.title}</p>
                              </div>
                            </div>
                            {/* Footer */}
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-[11px] text-muted-foreground">
                                {format(new Date(task.due_at), "dd MMM")}
                              </span>
                              <div className="flex -space-x-1.5">
                                {(task.assignees || []).slice(0, 3).map((uid) => {
                                  const p = profileMap[uid];
                                  return (
                                    <UserAvatar key={uid} name={p?.full_name} src={p?.avatar_url} size="xs" className="h-5 w-5 rounded-full border border-card" />
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
};

export default GlobalKanbanView;
