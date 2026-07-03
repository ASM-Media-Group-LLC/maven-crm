import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCountdown } from "./useCountdown";
import Logo from "@/components/Logo";
import type { Task } from "./useTareas";

const TaskSharePage = () => {
  const { token } = useParams<{ token: string }>();

  const { data: task, isLoading } = useQuery({
    queryKey: ["shared-task", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_task_by_share_token", { _token: token! } as any);
      if (error) throw error;
      const arr = data as unknown as Task[];
      return arr?.[0] || null;
    },
    enabled: !!token,
  });

  if (isLoading) return <div className="flex items-center justify-center min-h-screen"><p className="text-muted-foreground">Cargando...</p></div>;
  if (!task) return <div className="flex items-center justify-center min-h-screen"><p className="text-muted-foreground">Tarea no encontrada.</p></div>;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <Logo size="sm" className="mb-6" />
      <SharedTaskCard task={task} />
    </div>
  );
};

const SharedTaskCard = ({ task }: { task: Task }) => {
  const { display, isOverdue, isWarning } = useCountdown(task.due_at);
  const isCompleted = task.status === "completed";

  const countdownColor = isCompleted
    ? "text-muted-foreground"
    : isOverdue
    ? "text-destructive"
    : isWarning
    ? "text-warning"
    : "text-foreground";

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="p-6 flex flex-col items-center gap-4 text-center">
        <h2 className="text-lg font-bold">{task.title}</h2>
        {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
        <div className={`text-4xl font-mono font-bold ${countdownColor}`}>
          {isCompleted ? "✓" : display}
        </div>
        {isCompleted && <Badge className="bg-success/20 text-success border-success/30">Completada</Badge>}
        {isOverdue && !isCompleted && <Badge variant="destructive">Vencida</Badge>}
        {!isOverdue && !isCompleted && !isWarning && <Badge variant="secondary">Activa</Badge>}
        {isWarning && <Badge className="bg-warning/20 text-warning border-warning/30">Próxima a vencer</Badge>}
      </CardContent>
    </Card>
  );
};

export default TaskSharePage;
