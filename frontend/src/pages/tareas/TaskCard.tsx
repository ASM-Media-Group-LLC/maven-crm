import { useState } from "react";
import { Clock, AlertTriangle, Share2, MoreHorizontal, Pencil, Trash2, Flag, ChevronDown, ChevronRight, Play, Pause, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCountdown } from "./useCountdown";
import { useAuth } from "@/hooks/useAuth";
import { getPublicBaseUrl } from "@/lib/getPublicUrl";
import { useToast } from "@/hooks/use-toast";
import { priorityConfig } from "./PrioritySelect";
import SubtasksPanel from "./SubtasksPanel";
import type { Task } from "./useTareas";

interface TaskCardProps {
  task: Task;
  onComplete: (id: string) => void;
  onJustify: (task: Task) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onStatusChange?: (taskId: string, status: string) => void;
}

const statusConfig: Record<string, { label: string; badgeClass: string }> = {
  active: { label: "Pendiente", badgeClass: "bg-secondary text-secondary-foreground border-border" },
  in_progress: { label: "En curso", badgeClass: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  paused: { label: "Pausada", badgeClass: "bg-warning/20 text-warning border-warning/30" },
  overdue: { label: "Vencida", badgeClass: "bg-destructive/20 text-destructive border-destructive/30" },
  completed: { label: "Completada", badgeClass: "bg-success/20 text-success border-success/30" },
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

const TaskCard = ({ task, onComplete, onJustify, onEdit, onDelete, onStatusChange }: TaskCardProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { display, isOverdue, isWarning } = useCountdown(task.due_at);
  const [subtasksOpen, setSubtasksOpen] = useState(false);

  const isCompleted = task.status === "completed";
  const effectiveStatus = isCompleted ? "completed" : isOverdue && task.status !== "overdue" ? "overdue" : task.status;
  const currentStatusConfig = statusConfig[effectiveStatus] || statusConfig.active;
  const transitions = getStatusTransitions(task.status, isOverdue, !!task.overdue_reason);

  const priority = priorityConfig[task.priority] || priorityConfig.medium;

  const handleShare = () => {
    const url = `${getPublicBaseUrl()}/tareas/share/${task.share_token}`;
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
    ? "text-warning"
    : "text-foreground";

  return (
    <Card className={`transition-all duration-300 hover:border-primary/30 ${isOverdue && !isCompleted ? "border-destructive/40" : ""}`}>
      <CardContent className="p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Flag className={`h-3 w-3 ${priority.color} shrink-0`} />
              <Badge className={`${priority.badgeClass} text-[10px] px-1.5 py-0`}>{priority.label}</Badge>
            </div>
            <h3 className="font-semibold text-sm truncate">{task.title}</h3>
            {task.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Status dropdown badge */}
            {transitions.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-auto p-0">
                    <Badge className={`${currentStatusConfig.badgeClass} cursor-pointer`}>
                      {currentStatusConfig.label}
                    </Badge>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {transitions.map((t) => (
                    <DropdownMenuItem key={t.status} onClick={() => handleTransition(t.status)}>
                      <t.icon className="mr-2 h-4 w-4" /> {t.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Badge className={currentStatusConfig.badgeClass}>{currentStatusConfig.label}</Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
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

        {/* Dates */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {task.start_at && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Inicio: {format(new Date(task.start_at), "dd/MM/yy")}
            </span>
          )}
          <span className={`flex items-center gap-1 ${countdownColor}`}>
            <Clock className="h-3 w-3" />
            Fin: {format(new Date(task.due_at), "dd/MM/yy HH:mm")}
          </span>
        </div>

        <div className={`text-2xl font-mono font-bold text-center ${countdownColor}`}>
          {isCompleted ? "✓" : display}
        </div>

        {task.overdue_reason && (
          <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
            <span className="font-medium">Justificación:</span> {task.overdue_reason}
          </p>
        )}

        {/* Subtareas expandibles */}
        <Collapsible open={subtasksOpen} onOpenChange={setSubtasksOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-muted-foreground h-7 -mx-1">
              {subtasksOpen ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
              Subtareas
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-1">
            <SubtasksPanel taskId={task.id} />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};

export default TaskCard;
