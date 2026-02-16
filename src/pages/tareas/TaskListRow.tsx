import { useState } from "react";
import { ChevronDown, ChevronRight, Flag, MoreHorizontal, Pencil, Trash2, Share2, Check, AlertTriangle, CalendarIcon, User, Play, Pause, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCountdown } from "./useCountdown";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { priorityConfig } from "./PrioritySelect";
import SubtasksPanel from "./SubtasksPanel";
import type { Task } from "./useTareas";

interface TaskListRowProps {
  task: Task;
  profiles: { id: string; full_name: string | null }[];
  onComplete: (id: string) => void;
  onJustify: (task: Task) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onStatusChange?: (taskId: string, status: string) => void;
}

const statusConfig: Record<string, { label: string; badgeClass: string }> = {
  active: { label: "Pendiente", badgeClass: "bg-secondary text-secondary-foreground border-border" },
  in_progress: { label: "En curso", badgeClass: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  paused: { label: "Pausada", badgeClass: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  overdue: { label: "Vencida", badgeClass: "bg-destructive/20 text-destructive border-destructive/30" },
  completed: { label: "Completada", badgeClass: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
};

const getStatusTransitions = (status: string, isOverdue: boolean, hasOverdueReason: boolean) => {
  if (status === "completed") return [];
  if (isOverdue && !hasOverdueReason) {
    return [{ status: "justify", label: "Justificar", icon: AlertTriangle }];
  }
  switch (status) {
    case "active":
      return [
        { status: "in_progress", label: "Iniciar", icon: Play },
        { status: "completed", label: "Completar", icon: CheckCircle2 },
      ];
    case "in_progress":
      return [
        { status: "paused", label: "Pausar", icon: Pause },
        { status: "completed", label: "Completar", icon: CheckCircle2 },
      ];
    case "paused":
      return [
        { status: "in_progress", label: "Reanudar", icon: Play },
        { status: "completed", label: "Completar", icon: CheckCircle2 },
      ];
    case "overdue":
      return [
        { status: "completed", label: "Completar", icon: CheckCircle2 },
      ];
    default:
      return [
        { status: "in_progress", label: "Iniciar", icon: Play },
        { status: "completed", label: "Completar", icon: CheckCircle2 },
      ];
  }
};

const TaskListRow = ({ task, profiles, onComplete, onJustify, onEdit, onDelete, onStatusChange }: TaskListRowProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { display, isOverdue, isWarning } = useCountdown(task.due_at);
  const [expanded, setExpanded] = useState(false);

  const isAssigned = user?.id === task.assigned_to;
  const isCompleted = task.status === "completed";
  const effectiveStatus = isCompleted ? "completed" : isOverdue && task.status !== "overdue" ? "overdue" : task.status;
  const needsJustification = isOverdue && !isCompleted && !task.overdue_reason;

  const priority = priorityConfig[task.priority] || priorityConfig.medium;
  const assignedProfile = profiles.find(p => p.id === task.assigned_to);
  const currentStatusConfig = statusConfig[effectiveStatus] || statusConfig.active;

  const transitions = getStatusTransitions(task.status, isOverdue, !!task.overdue_reason);

  const handleShare = () => {
    const url = `${window.location.origin}/tareas/share/${task.share_token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copiado", description: "El enlace fue copiado al portapapeles." });
  };

  const handleTransition = (newStatus: string) => {
    if (newStatus === "justify") {
      onJustify(task);
      return;
    }
    if (newStatus === "completed") {
      onComplete(task.id);
      return;
    }
    onStatusChange?.(task.id, newStatus);
  };

  const countdownColor = isCompleted
    ? "text-muted-foreground"
    : isOverdue
    ? "text-destructive"
    : isWarning
    ? "text-yellow-400"
    : "text-muted-foreground";

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className={`group border-b border-border hover:bg-muted/30 transition-colors ${isOverdue && !isCompleted ? "bg-destructive/5" : ""}`}>
        {/* Main row */}
        <div className="grid grid-cols-[1fr_140px_140px_100px_120px_40px] items-center px-3 py-2.5 gap-2">
          {/* Name column with status dropdown */}
          <div className="flex items-center gap-2 min-w-0">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </CollapsibleTrigger>

            {/* Status dropdown */}
            {transitions.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 py-0 shrink-0">
                    <Badge className={`${currentStatusConfig.badgeClass} text-[10px] px-1.5 py-0 cursor-pointer`}>
                      {currentStatusConfig.label}
                    </Badge>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {transitions.map((t) => (
                    <DropdownMenuItem key={t.status} onClick={() => handleTransition(t.status)}>
                      <t.icon className="mr-2 h-4 w-4" /> {t.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Badge className={`${currentStatusConfig.badgeClass} text-[10px] px-1.5 py-0`}>
                {currentStatusConfig.label}
              </Badge>
            )}

            <span className={`text-sm font-medium truncate ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
              {task.title}
            </span>
          </div>

          {/* Assignee column */}
          <div className="flex items-center gap-1.5 min-w-0">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground truncate">
              {assignedProfile?.full_name || "Sin asignar"}
            </span>
          </div>

          {/* Due date column */}
          <div className="flex flex-col gap-0.5 min-w-0">
            {task.start_at && (
              <div className="flex items-center gap-1">
                <CalendarIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(task.start_at), "dd/MM/yy")}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <CalendarIcon className={`h-3.5 w-3.5 shrink-0 ${countdownColor}`} />
              <span className={`text-xs ${countdownColor}`}>
                {format(new Date(task.due_at), "dd/MM/yy HH:mm")}
              </span>
            </div>
          </div>

          {/* Priority column */}
          <div className="flex items-center gap-1">
            <Flag className={`h-3 w-3 ${priority.color} shrink-0`} />
            <Badge className={`${priority.badgeClass} text-[10px] px-1.5 py-0`}>
              {priority.label}
            </Badge>
          </div>

          {/* Countdown column */}
          <div className="text-right">
            <span className={`text-xs font-mono font-semibold ${countdownColor}`}>
              {isCompleted ? "✓ Completada" : display}
            </span>
          </div>

          {/* Actions column */}
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(task)}>
                    <Pencil className="mr-2 h-4 w-4" /> Editar
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleShare}>
                  <Share2 className="mr-2 h-4 w-4" /> Compartir
                </DropdownMenuItem>
                {onDelete && (
                  <DropdownMenuItem className="text-destructive" onClick={() => onDelete(task)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Overdue reason */}
        {task.overdue_reason && (
          <div className="px-12 pb-2">
            <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
              <span className="font-medium">Justificación:</span> {task.overdue_reason}
            </p>
          </div>
        )}
      </div>

      {/* Expanded subtasks */}
      <CollapsibleContent>
        <div className="bg-muted/10 border-b border-border px-4 py-3 pl-12">
          <SubtasksPanel taskId={task.id} profiles={profiles} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default TaskListRow;
