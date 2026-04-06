import { useMemo, useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Clock, Play, Pause, AlertTriangle, CheckSquare, Paperclip, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

const TaskKanbanView = ({ tasks, profiles, onStatusChange, onTaskClick, getTaskStatus }: TaskKanbanViewProps) => {
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
  const { data: attachmentSummaries = {} } = useTaskAttachmentSummaries(taskIds);

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
                      return (
                        <Draggable key={task.id} draggableId={task.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => onTaskClick(task)}
                              className={cn(
                                "bg-card border rounded-lg cursor-pointer hover:border-primary/50 transition-all overflow-hidden",
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
                                {/* Priority indicator */}
                                <div className="flex items-start gap-2">
                                  <div className={cn("w-1 h-full min-h-[20px] rounded-full shrink-0", priorityColors[task.priority] || "bg-slate-500")} />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm leading-tight line-clamp-2">{task.title}</p>
                                    {task.description && (
                                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{task.description}</p>
                                    )}
                                  </div>
                                </div>

                                {/* Footer */}
                                <div className="flex items-center justify-between mt-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-muted-foreground">
                                      {format(new Date(task.due_at), "dd MMM")}
                                    </span>
                                    {summary && summary.count > 0 && (
                                      <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                                        <Paperclip className="h-3 w-3" />
                                        {summary.count}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex -space-x-1.5">
                                    {(task.assignees || []).slice(0, 3).map((uid) => {
                                      const p = profileMap[uid];
                                      const initials = p?.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2) || "?";
                                      return (
                                        <Avatar key={uid} className="h-5 w-5 border border-card">
                                          <AvatarFallback className="text-[9px] bg-primary/20 text-primary">
                                            {initials}
                                          </AvatarFallback>
                                        </Avatar>
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
