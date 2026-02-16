import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Clock, Play, Pause, AlertTriangle, CheckSquare, Flag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Logo from "@/components/Logo";
import { priorityConfig } from "./PrioritySelect";

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  active: { label: "Pendiente", icon: Clock, color: "text-primary" },
  in_progress: { label: "En progreso", icon: Play, color: "text-blue-400" },
  paused: { label: "Pausada", icon: Pause, color: "text-yellow-400" },
  completed: { label: "Completada", icon: CheckSquare, color: "text-emerald-400" },
};

const ProjectSharePage = () => {
  const { token } = useParams<{ token: string }>();

  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ["shared-project", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_project_by_share_token", { _token: token! });
      if (error) throw error;
      return (data as any)?.[0] || null;
    },
    enabled: !!token,
  });

  const { data: tasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ["shared-project-tasks", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tasks_by_project_share_token", { _token: token! });
      if (error) throw error;
      return (data as any) || [];
    },
    enabled: !!token,
  });

  const isLoading = loadingProject || loadingTasks;

  const getTaskDisplayStatus = (task: any) => {
    if (task.status === "completed") return "completed";
    if (task.due_at && new Date(task.due_at).getTime() <= Date.now()) return "overdue";
    return task.status || "active";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Cargando proyecto...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <Logo />
        <p className="text-muted-foreground">Proyecto no encontrado o link inválido.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center gap-3">
        <Logo />
        <div className="ml-4">
          <h1 className="text-xl font-bold">{project.name}</h1>
          {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-4">
        <p className="text-sm text-muted-foreground">{tasks.length} tarea{tasks.length !== 1 ? "s" : ""}</p>

        {tasks.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No hay tareas en este proyecto.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task: any) => {
              const displayStatus = getTaskDisplayStatus(task);
              const statusInfo = displayStatus === "overdue"
                ? { label: "Vencida", icon: AlertTriangle, color: "text-destructive" }
                : statusConfig[displayStatus] || statusConfig.active;
              const pConfig = priorityConfig[task.priority] || priorityConfig.medium;
              const StatusIcon = statusInfo.icon;

              return (
                <Card key={task.id}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <StatusIcon className={`h-4 w-4 shrink-0 ${statusInfo.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{task.title}</p>
                      {task.description && <p className="text-xs text-muted-foreground truncate">{task.description}</p>}
                    </div>
                    <Badge variant="outline" className={`text-[10px] shrink-0 ${pConfig.badgeClass}`}>
                      <Flag className={`h-2.5 w-2.5 mr-1 ${pConfig.color}`} />
                      {pConfig.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {task.due_at ? format(new Date(task.due_at), "dd/MM/yy") : "—"}
                    </span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default ProjectSharePage;
