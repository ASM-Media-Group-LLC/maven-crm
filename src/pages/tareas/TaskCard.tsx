import { Check, Clock, AlertTriangle, Share2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCountdown } from "./useCountdown";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { Task } from "./useTareas";

interface TaskCardProps {
  task: Task;
  onComplete: (id: string) => void;
  onJustify: (task: Task) => void;
}

const TaskCard = ({ task, onComplete, onJustify }: TaskCardProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { display, isOverdue, isWarning } = useCountdown(task.due_at);

  const isAssigned = user?.id === task.assigned_to;
  const isCompleted = task.status === "completed";
  const needsJustification = isOverdue && !isCompleted && !task.overdue_reason;
  const canComplete = isAssigned && !isCompleted && (!isOverdue || !!task.overdue_reason);

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
            <h3 className="font-semibold text-sm truncate">{task.title}</h3>
            {task.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
            )}
          </div>
          {statusBadge()}
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
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={handleShare}>
            <Share2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default TaskCard;
