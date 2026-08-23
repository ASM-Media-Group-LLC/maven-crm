import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Send, Trash2, Clock, Flag, Users, MessageSquare } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/UserAvatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTaskComments } from "./useTaskComments";
import { useAuth } from "@/hooks/useAuth";
import SubtasksPanel from "./SubtasksPanel";
import TaskAttachmentsSection from "./TaskAttachmentsSection";
import { priorityConfig } from "./PrioritySelect";
import type { Task } from "./useTareas";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url?: string | null;
}

interface TaskDetailSheetProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: Profile[];
  onEdit: (task: Task) => void;
  onStatusChange: (taskId: string, status: string) => void;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  active: { label: "Pendiente", className: "bg-secondary text-secondary-foreground" },
  in_progress: { label: "En curso", className: "bg-blue-500/20 text-blue-400" },
  paused: { label: "Pausada", className: "bg-warning/20 text-warning" },
  completed: { label: "Completada", className: "bg-success/20 text-success" },
};

const TaskDetailSheet = ({ task, open, onOpenChange, profiles, onEdit, onStatusChange }: TaskDetailSheetProps) => {
  const { user } = useAuth();
  const { comments, isLoading: commentsLoading, addComment, deleteComment } = useTaskComments(task?.id || null);
  const [newComment, setNewComment] = useState("");

  if (!task) return null;

  const pri = priorityConfig[task.priority as keyof typeof priorityConfig];
  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const isOverdue = new Date(task.due_at).getTime() <= Date.now() && task.status !== "completed";

  const handleSubmitComment = () => {
    const trimmed = newComment.trim();
    if (!trimmed) return;
    addComment.mutate({ content: trimmed });
    setNewComment("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <SheetTitle className="text-lg leading-tight">{task.title}</SheetTitle>
              {task.description && (
                <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => onEdit(task)}>
              Editar
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-5">
            {/* Meta info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Flag className="h-3 w-3" /> Prioridad</span>
                <Badge variant="outline" className={`text-xs ${pri?.badgeClass || ""}`}>
                  {pri?.label || task.priority}
                </Badge>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">Estado</span>
                <Badge className={statusLabels[task.status]?.className || "bg-secondary"}>
                  {statusLabels[task.status]?.label || task.status}
                </Badge>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Vencimiento</span>
                <span className={`text-sm font-medium ${isOverdue ? "text-destructive" : ""}`}>
                  {format(new Date(task.due_at), "dd MMM yyyy, HH:mm", { locale: es })}
                </span>
              </div>
              {task.start_at && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Inicio</span>
                  <span className="text-sm">
                    {format(new Date(task.start_at), "dd MMM yyyy", { locale: es })}
                  </span>
                </div>
              )}
            </div>

            {/* Assignees */}
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Asignados</span>
              <div className="flex flex-wrap gap-2">
                {(task.assignees || []).map((uid) => {
                  const p = profileMap[uid];
                  return (
                    <div key={uid} className="flex items-center gap-1.5 bg-muted rounded-full px-2 py-0.5">
                      <UserAvatar name={p?.full_name} src={p?.avatar_url} size="xs" className="h-5 w-5" />
                      <span className="text-xs">{p?.full_name || "Sin nombre"}</span>
                    </div>
                  );
                })}
                {(task.assignees || []).length === 0 && <span className="text-xs text-muted-foreground">Sin asignar</span>}
              </div>
            </div>

            {task.overdue_reason && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <span className="text-xs font-medium text-destructive">Justificación de retraso:</span>
                <p className="text-sm mt-1">{task.overdue_reason}</p>
              </div>
            )}

            <Separator />

            {/* Subtasks */}
            <SubtasksPanel taskId={task.id} />

            <Separator />

            {/* Attachments */}
            <TaskAttachmentsSection taskId={task.id} />

            <Separator />

            {/* Comments */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Comentarios ({comments.length})
              </h3>

              {commentsLoading ? (
                <p className="text-xs text-muted-foreground">Cargando...</p>
              ) : comments.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin comentarios aún.</p>
              ) : (
                <div className="space-y-3">
                  {comments.map((c) => {
                    return (
                      <div key={c.id} className="flex gap-2.5 group">
                        <UserAvatar name={c.profile?.full_name} src={c.profile?.avatar_url} size="sm" className="h-7 w-7 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium">{c.profile?.full_name || "Usuario"}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(c.created_at), "dd MMM, HH:mm", { locale: es })}
                            </span>
                            {c.user_id === user?.id && (
                              <button
                                onClick={() => deleteComment.mutate(c.id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                              >
                                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                              </button>
                            )}
                          </div>
                          <p className="text-sm mt-0.5 whitespace-pre-wrap">{c.content}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* New comment input */}
              <div className="flex gap-2 pt-2">
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Escribe un comentario..."
                  className="min-h-[60px] text-sm resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      handleSubmitComment();
                    }
                  }}
                />
                <Button
                  size="icon"
                  onClick={handleSubmitComment}
                  disabled={!newComment.trim() || addComment.isPending}
                  className="shrink-0 self-end"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default TaskDetailSheet;
