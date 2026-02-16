import { useState } from "react";
import { Check, Clock, AlertTriangle, Share2, MoreHorizontal, Pencil, Trash2, Flag, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCountdown } from "./useCountdown";
import { useAuth } from "@/hooks/useAuth";
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
}

const TaskCard = ({ task, onComplete, onJustify, onEdit, onDelete }: TaskCardProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { display, isOverdue, isWarning } = useCountdown(task.due_at);
  const [subtasksOpen, setSubtasksOpen] = useState(false);

  const isAssigned = user?.id === task.assigned_to;
  const isCompleted = task.status === "completed";
  const needsJustification = isOverdue && !isCompleted && !task.overdue_reason;
  const canComplete = isAssigned && !isCompleted && (!isOverdue || !!task.overdue_reason);

  const priority = priorityConfig[task.priority] || priorityConfig.medium;

  const handleShare = () => {
    const url = `${window.location.origin}/tareas/share/${task.share_token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copiado", description: "El enlace fue copiado al portapapeles." });
  };

  const statusBadge = () => {
    if (isCompleted) return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Completada</Badge>;
    if (isOverdue) return <Badge variant="destructive">Vencida</Badge>;
    if (isWarning) return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Próxima</Badge>;
    return <Badge variant="secondary">Activa</Badge>;
  };

  const countdownColor = isCompleted
    ? "text-muted-foreground"
    : isOverdue
    ? "text-destructive"
    : isWarning
    ? "text-yellow-400"
    : "text-foreground";

  return (
    <Card className={`transition-all duration-300 hover:border-primary/30 ${isOverdue && !isCompleted ? "border-destructive/40" : ""}`}>
      <CardContent className="p-4 flex flex-col gap-3">
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
            {statusBadge()}
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

        <div className={`text-2xl font-mono font-bold text-center ${countdownColor}`}>
          {isCompleted ? "✓" : display}
        </div>

        {task.overdue_reason && (
          <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
            <span className="font-medium">Justificación:</span> {task.overdue_reason}
          </p>
        )}

        <div className="flex items-center gap-2 mt-auto">
          {canComplete && (
            <Button size="sm" className="flex-1" onClick={() => onComplete(task.id)}>
              <Check className="h-3.5 w-3.5 mr-1" /> Completar
            </Button>
          )}
          {needsJustification && isAssigned && (
            <Button size="sm" variant="destructive" className="flex-1" onClick={() => onJustify(task)}>
              <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Justificar
            </Button>
          )}
        </div>

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
