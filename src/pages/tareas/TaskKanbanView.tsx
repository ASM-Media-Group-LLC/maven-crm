import { useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Clock, Play, Pause, AlertTriangle, CheckSquare, Paperclip, Plus, MessageSquare, GitBranch, Flag, MoreHorizontal, Trash2, Pencil, Diamond, Link2, Unplug } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { priorityConfig } from "./PrioritySelect";
import { useTaskAttachmentSummaries } from "./useTaskAttachments";
import type { Task } from "./useTareas";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url?: string | null;
}

interface TaskKanbanViewProps {
  tasks: Task[];
  profiles: Profile[];
  onStatusChange: (taskId: string, status: string) => void;
  onTaskClick: (task: Task) => void;
  getTaskStatus: (t: Task) => string;
  onCreateInline?: (title: string, status: string) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
}

const columns = [
  { id: "pending", label: "Pendiente", icon: Clock, color: "border-t-blue-500", bgHeader: "bg-blue-500/10 text-blue-400", dbStatus: "active" },
  { id: "in_progress", label: "En curso", icon: Play, color: "border-t-indigo-500", bgHeader: "bg-indigo-500/10 text-indigo-400", dbStatus: "in_progress" },
  { id: "paused", label: "Pausada", icon: Pause, color: "border-t-yellow-500", bgHeader: "bg-yellow-500/10 text-yellow-400", dbStatus: "paused" },
  { id: "overdue", label: "Vencida", icon: AlertTriangle, color: "border-t-red-500", bgHeader: "bg-red-500/10 text-red-400", dbStatus: "active" },
  { id: "completed", label: "Completada", icon: CheckSquare, color: "border-t-emerald-500", bgHeader: "bg-emerald-500/10 text-emerald-400", dbStatus: "completed" },
];

const priorityColors: Record<string, string> = {
  low: "bg-slate-500",
  medium: "bg-blue-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
};

const priorityIcons: Record<string, string> = {
  low: "text-slate-400",
  medium: "text-blue-400",
  high: "text-orange-400",
  urgent: "text-red-400",
};

const TaskKanbanView = ({ tasks, profiles, onStatusChange, onTaskClick, getTaskStatus, onCreateInline, onEdit, onDelete }: TaskKanbanViewProps) => {
  const [inlineCol, setInlineCol] = useState<string | null>(null);
  const [inlineTitle, setInlineTitle] = useState("");
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const { data: attachmentSummaries = {} } = useTaskAttachmentSummaries(taskIds);

  // Fetch subtask counts
  const { data: subtaskCounts = {} } = useQuery({
    queryKey: ["kanban-subtask-counts", taskIds.join(",")],
    queryFn: async () => {
      if (taskIds.length === 0) return {};
      const { data } = await supabase
        .from("subtasks" as any)
        .select("task_id, status")
        .in("task_id", taskIds);
      const counts: Record<string, { total: number; done: number }> = {};
      (data || []).forEach((s: any) => {
        if (!counts[s.task_id]) counts[s.task_id] = { total: 0, done: 0 };
        counts[s.task_id].total++;
        if (s.status === "completed") counts[s.task_id].done++;
      });
      return counts;
    },
    enabled: taskIds.length > 0,
  });

  // Fetch comment counts
  const { data: commentCounts = {} } = useQuery({
    queryKey: ["kanban-comment-counts", taskIds.join(",")],
    queryFn: async () => {
      if (taskIds.length === 0) return {};
      const { data } = await supabase
        .from("task_comments" as any)
        .select("task_id")
        .in("task_id", taskIds);
      const counts: Record<string, number> = {};
      (data || []).forEach((c: any) => {
        counts[c.task_id] = (counts[c.task_id] || 0) + 1;
      });
      return counts;
    },
    enabled: taskIds.length > 0,
  });

  // Generate signed URLs for first images
  const imageTaskIds = useMemo(() => {
    return Object.entries(attachmentSummaries)
      .filter(([, s]) => s.firstImageUrl)
      .map(([taskId]) => taskId);
  }, [attachmentSummaries]);

  const { data: signedThumbnails = {} } = useQuery({
    queryKey: ["kanban-thumbnails", imageTaskIds.join(",")],
    queryFn: async () => {
      const urls: Record<string, string> = {};
      for (const taskId of imageTaskIds) {
        const path = attachmentSummaries[taskId]?.firstImageUrl;
        if (path) {
          const { data } = await supabase.storage.from("task-files").createSignedUrl(path, 3600);
          if (data?.signedUrl) urls[taskId] = data.signedUrl;
        }
      }
      return urls;
    },
    enabled: imageTaskIds.length > 0,
  });

  const grouped = useMemo(() => {
    const groups: Record<string, Task[]> = { pending: [], in_progress: [], paused: [], overdue: [], completed: [] };
    tasks.forEach((t) => {
      const s = getTaskStatus(t);
      if (groups[s]) groups[s].push(t);
      else groups.pending.push(t);
    });
    return groups;
  }, [tasks, getTaskStatus]);

  const profileMap = useMemo(() => {
    const m: Record<string, Profile> = {};
    profiles.forEach((p) => { m[p.id] = p; });
    return m;
  }, [profiles]);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const targetCol = columns.find((c) => c.id === destination.droppableId);
    if (!targetCol) return;

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
                    className={cn(
                      "flex-1 p-2 space-y-2 overflow-y-auto transition-colors",
                      snapshot.isDraggingOver && "bg-primary/5"
                    )}
                  >
                    {colTasks.map((task, index) => {
                      const summary = attachmentSummaries[task.id];
                      const thumbnailUrl = signedThumbnails[task.id];
                      const subtasks = subtaskCounts[task.id];
                      const commentCount = commentCounts[task.id] || 0;
                      const pri = priorityConfig[task.priority as keyof typeof priorityConfig];

                      return (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => onTaskClick(task)}
                              className={cn(
                                "bg-card border rounded-lg cursor-pointer hover:border-primary/50 transition-all overflow-hidden group/card",
                                snapshot.isDragging && "shadow-lg rotate-2 scale-105"
                              )}
                            >
                              {/* Thumbnail preview */}
                              {thumbnailUrl && (
                                <img
                                  src={thumbnailUrl}
                                  alt=""
                                  className="w-full h-32 object-cover"
                                  loading="lazy"
                                />
                              )}

                              <div className="p-3">
                                {/* Title + context menu */}
                                <div className="flex items-start gap-2">
                                  <div className={cn("w-1 h-full min-h-[20px] rounded-full shrink-0", priorityColors[task.priority] || "bg-slate-500")} />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm leading-tight line-clamp-2">{task.title}</p>
                                    {task.description && (
                                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{task.description}</p>
                                    )}
                                  </div>
                                  {/* Context menu */}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                      <button className="opacity-0 group-hover/card:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted shrink-0">
                                        <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                      {onEdit && (
                                        <DropdownMenuItem onClick={() => onEdit(task)}>
                                          <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuSeparator />
                                      {columns.filter(c => c.id !== col.id).map(c => (
                                        <DropdownMenuItem key={c.id} onClick={() => onStatusChange(task.id, c.dbStatus)}>
                                          <c.icon className="h-3.5 w-3.5 mr-2" /> {c.label}
                                        </DropdownMenuItem>
                                      ))}
                                      {onDelete && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem className="text-destructive" onClick={() => onDelete(task)}>
                                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Eliminar
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>

                                {/* Footer with metadata icons */}
                                <div className="flex items-center justify-between mt-2.5">
                                  <div className="flex items-center gap-2.5">
                                    {/* Date */}
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                          <Clock className="h-3 w-3" />
                                          {format(new Date(task.due_at), "dd MMM")}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>Fecha límite</TooltipContent>
                                    </Tooltip>

                                    {/* Priority flag */}
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className={cn("flex items-center", priorityIcons[task.priority])}>
                                          <Flag className="h-3 w-3" />
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>{pri?.label || task.priority}</TooltipContent>
                                    </Tooltip>

                                    {/* Subtasks */}
                                    {subtasks && subtasks.total > 0 && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                            <GitBranch className="h-3 w-3" />
                                            {subtasks.done}/{subtasks.total}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>{subtasks.done} de {subtasks.total} subtareas</TooltipContent>
                                      </Tooltip>
                                    )}

                                    {/* Comments */}
                                    {commentCount > 0 && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                            <MessageSquare className="h-3 w-3" />
                                            {commentCount}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>{commentCount} comentarios</TooltipContent>
                                      </Tooltip>
                                    )}

                                    {/* Attachments */}
                                    {summary && summary.count > 0 && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                            <Paperclip className="h-3 w-3" />
                                            {summary.count}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>{summary.count} adjuntos</TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>

                                  {/* Assignees */}
                                  <div className="flex -space-x-1.5">
                                    {(task.assignees || []).slice(0, 3).map((uid) => {
                                      const p = profileMap[uid];
                                      const initials = p?.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2) || "?";
                                      return (
                                        <Tooltip key={uid}>
                                          <TooltipTrigger asChild>
                                            <Avatar className="h-5 w-5 border border-card">
                                              <AvatarFallback className="text-[9px] bg-primary/20 text-primary">
                                                {initials}
                                              </AvatarFallback>
                                            </Avatar>
                                          </TooltipTrigger>
                                          <TooltipContent>{p?.full_name || "Sin nombre"}</TooltipContent>
                                        </Tooltip>
                                      );
                                    })}
                                    {(task.assignees || []).length > 3 && (
                                      <span className="text-[10px] text-muted-foreground ml-1">
                                        +{(task.assignees || []).length - 3}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}

                    {/* Inline creation */}
                    {onCreateInline && inlineCol === col.id ? (
                      <div className="flex gap-1.5 mt-1">
                        <Input
                          value={inlineTitle}
                          onChange={(e) => setInlineTitle(e.target.value)}
                          placeholder="Título de la tarea..."
                          className="h-8 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && inlineTitle.trim()) {
                              onCreateInline(inlineTitle.trim(), col.dbStatus);
                              setInlineTitle("");
                              setInlineCol(null);
                            }
                            if (e.key === "Escape") { setInlineCol(null); setInlineTitle(""); }
                          }}
                          onBlur={() => { setInlineCol(null); setInlineTitle(""); }}
                        />
                      </div>
                    ) : onCreateInline ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-1 text-muted-foreground hover:text-foreground gap-1"
                        onClick={() => { setInlineCol(col.id); setInlineTitle(""); }}
                      >
                        <Plus className="h-3.5 w-3.5" /> Agregar
                      </Button>
                    ) : null}
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

export default TaskKanbanView;
