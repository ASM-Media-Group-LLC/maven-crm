import { useState, useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Send, Trash2, Clock, Flag, Users, MessageSquare, X, CalendarIcon, Pencil, ChevronDown, Diamond, Link2, Unplug } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTaskComments } from "./useTaskComments";
import { useAuth } from "@/hooks/useAuth";
import SubtasksPanel from "./SubtasksPanel";
import TaskBlockerSection from "./TaskBlockerSection";
import { priorityConfig } from "./PrioritySelect";
import InlineAssigneeSelect from "./InlineAssigneeSelect";
import type { Task } from "./useTareas";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url?: string | null;
}

interface TaskDetailPageProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: Profile[];
  onEdit: (task: Task) => void;
  onStatusChange: (taskId: string, status: string) => void;
  onPatchTask?: (taskId: string, fields: Record<string, any>) => void;
  onUpdateAssignees?: (taskId: string, assigneeIds: string[]) => void;
  onDelete?: (task: Task) => void;
}

const statusOptions = [
  { value: "active", label: "Pendiente", className: "bg-secondary text-secondary-foreground" },
  { value: "in_progress", label: "En curso", className: "bg-blue-500/20 text-blue-400" },
  { value: "paused", label: "Pausada", className: "bg-yellow-500/20 text-yellow-400" },
  { value: "completed", label: "Completada", className: "bg-emerald-500/20 text-emerald-400" },
];

const TaskDetailPage = ({ task, open, onOpenChange, profiles, onEdit, onStatusChange, onPatchTask, onUpdateAssignees, onDelete }: TaskDetailPageProps) => {
  const { user } = useAuth();
  const { comments, isLoading: commentsLoading, addComment, deleteComment } = useTaskComments(task?.id || null);
  const [newComment, setNewComment] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState("");

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

  const handleSaveTitle = () => {
    const trimmed = titleValue.trim();
    if (trimmed && trimmed !== task.title && onPatchTask) {
      onPatchTask(task.id, { title: trimmed });
    }
    setEditingTitle(false);
  };

  const handleSaveDesc = () => {
    const trimmed = descValue.trim();
    if (onPatchTask) {
      onPatchTask(task.id, { description: trimmed || null });
    }
    setEditingDesc(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 flex flex-col overflow-hidden [&>button.absolute]:hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
          <div className="flex items-center gap-3">
            <Select
              value={task.status}
              onValueChange={(v) => onStatusChange(task.id, v)}
            >
              <SelectTrigger className="h-7 w-auto gap-1 text-xs border-0 p-0 px-2">
                <Badge className={statusOptions.find(s => s.value === task.status)?.className || "bg-secondary"}>
                  {statusOptions.find(s => s.value === task.status)?.label || task.status}
                </Badge>
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(task)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
            </Button>
            {onDelete && (
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(task)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 ml-1" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body - 2 columns */}
        <div className="flex flex-1 min-h-0">
          {/* Left - Main content */}
          <ScrollArea className="flex-1 border-r">
            <div className="p-6 space-y-6">
              {/* Title */}
              {editingTitle ? (
                <Input
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  className="text-xl font-bold h-auto py-1 px-2"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTitle();
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                  onBlur={handleSaveTitle}
                />
              ) : (
                <h1
                  className="text-xl font-bold cursor-pointer hover:text-primary transition-colors group flex items-center gap-2"
                  onClick={() => { setTitleValue(task.title); setEditingTitle(true); }}
                >
                  {task.title}
                  <Pencil className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60" />
                </h1>
              )}

              {/* Description */}
              {editingDesc ? (
                <Textarea
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  className="min-h-[80px] text-sm"
                  autoFocus
                  placeholder="Agregar descripción..."
                  onBlur={handleSaveDesc}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingDesc(false);
                  }}
                />
              ) : (
                <p
                  className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors min-h-[40px] group flex items-start gap-2"
                  onClick={() => { setDescValue(task.description || ""); setEditingDesc(true); }}
                >
                  {task.description || "Agregar descripción..."}
                  <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 mt-0.5 shrink-0" />
                </p>
              )}

              {/* Meta grid */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-5 bg-muted/30 rounded-lg p-4">
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Flag className="h-3 w-3" /> Prioridad</span>
                  <Badge variant="outline" className={`text-xs ${pri?.badgeClass || ""}`}>
                    {pri?.label || task.priority}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Vencimiento</span>
                  <span className={`text-sm font-medium block ${isOverdue ? "text-destructive" : ""}`}>
                    {format(new Date(task.due_at), "dd MMM yyyy, HH:mm", { locale: es })}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> Inicio</span>
                  <span className="text-sm block">
                    {task.start_at ? format(new Date(task.start_at), "dd MMM yyyy", { locale: es }) : "—"}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Duración</span>
                  <span className="text-sm block">
                    {task.duration_hours}h {task.duration_minutes}m
                  </span>
                </div>
                <div className="space-y-1.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Diamond className="h-3 w-3" /> Tipo
                  </span>
                  <Select
                    value={task.task_type || "task"}
                    onValueChange={(v) => onPatchTask?.(task.id, { task_type: v })}
                  >
                    <SelectTrigger className="h-7 w-auto text-xs border-0 p-0 px-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="task">Tarea</SelectItem>
                      <SelectItem value="milestone">Hito</SelectItem>
                      <SelectItem value="prerequisite">Pre-requisito</SelectItem>
                      <SelectItem value="independent">Independiente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Assignees */}
              <div className="space-y-2">
                <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Asignados</span>
                <div className="flex flex-wrap gap-2">
                  {(task.assignees || []).map((uid) => {
                    const p = profileMap[uid];
                    const initials = p?.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2) || "?";
                    return (
                      <div key={uid} className="flex items-center gap-1.5 bg-muted rounded-full px-2.5 py-1">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[9px] bg-primary/20 text-primary">{initials}</AvatarFallback>
                        </Avatar>
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
              <SubtasksPanel taskId={task.id} profiles={profiles} />

              <Separator />

              {/* Attachments */}
              <TaskAttachmentsSection taskId={task.id} />

              <Separator />

              {/* Blockers */}
              <TaskBlockerSection taskId={task.id} profiles={profiles} />
            </div>
          </ScrollArea>

          {/* Right - Activity panel */}
          <div className="w-[360px] flex flex-col min-h-0 shrink-0 hidden md:flex">
            <div className="px-4 py-3 border-b shrink-0">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Actividad ({comments.length})
              </h3>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {commentsLoading ? (
                  <p className="text-xs text-muted-foreground">Cargando...</p>
                ) : comments.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">Sin comentarios aún.</p>
                ) : (
                  comments.map((c) => {
                    const initials = c.profile?.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2) || "?";
                    return (
                      <div key={c.id} className="flex gap-2.5 group">
                        <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                          <AvatarFallback className="text-[10px] bg-primary/15 text-primary">{initials}</AvatarFallback>
                        </Avatar>
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
                  })
                )}
              </div>
            </ScrollArea>

            {/* Comment input */}
            <div className="p-4 border-t shrink-0">
              <div className="flex gap-2">
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
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDetailPage;
