import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useMPPhases } from "./hooks/useMPPhases";
import { useMPTasks } from "./hooks/useMPTasks";
import { useMPCandidates } from "./hooks/useMPCandidates";
import { useMPModels } from "./hooks/useMPModels";
import { useMPMilestones } from "./hooks/useMPMilestones";
import { CheckCircle2, Clock, AlertTriangle, Target, Users, Rocket } from "lucide-react";

const statusColor: Record<string, string> = {
  active: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  planned: "bg-muted text-muted-foreground",
  completed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const ProyectoMPDashboard = () => {
  const { data: phases } = useMPPhases();
  const { data: tasks } = useMPTasks();
  const { data: candidates } = useMPCandidates();
  const { data: models } = useMPModels();
  const { data: milestones } = useMPMilestones();

  const totalTasks = tasks?.length ?? 0;
  const completedTasks = tasks?.filter((t) => t.status === "completed").length ?? 0;
  const blockedTasks = tasks?.filter((t) => t.status === "blocked").length ?? 0;
  const activeModels = models?.filter((m) => m.status === "active").length ?? 0;
  const completedMilestones = milestones?.filter((m) => m.completed).length ?? 0;
  const totalMilestones = milestones?.length ?? 0;
  const taskProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const stats = [
    { label: "Tareas Completadas", value: `${completedTasks}/${totalTasks}`, icon: CheckCircle2, color: "text-emerald-400" },
    { label: "Bloqueadas", value: blockedTasks, icon: AlertTriangle, color: "text-red-400" },
    { label: "Candidatas", value: candidates?.length ?? 0, icon: Users, color: "text-blue-400" },
    { label: "Cuentas Activas", value: activeModels, icon: Rocket, color: "text-teal-400" },
    { label: "Milestones", value: `${completedMilestones}/${totalMilestones}`, icon: Target, color: "text-amber-400" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Proyecto Cuentas Propias</h1>
        <p className="text-muted-foreground text-sm mt-1">Dashboard de progreso del plan de negocio</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`h-8 w-8 ${s.color}`} />
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Task progress */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Progreso General de Tareas</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={taskProgress} className="h-3" />
          <p className="text-xs text-muted-foreground mt-2">{taskProgress}% completado</p>
        </CardContent>
      </Card>

      {/* Phases timeline */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Fases del Proyecto</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {phases?.map((phase) => (
              <div key={phase.id} className="flex items-start gap-4 p-3 rounded-lg border border-border bg-background/50">
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary font-bold text-lg shrink-0">
                  {phase.phase_number}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm">{phase.name}</h4>
                    <Badge variant="outline" className={statusColor[phase.status] || ""}>
                      {phase.status === "active" ? "Activa" : phase.status === "completed" ? "Completada" : "Planificada"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{phase.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent milestones */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Milestones</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {milestones?.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-2 rounded border border-border">
                {m.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                ) : (
                  <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${m.completed ? "line-through text-muted-foreground" : ""}`}>{m.title}</p>
                  <p className="text-xs text-muted-foreground">{m.description}</p>
                </div>
                {(m as any).mp_phases && (
                  <Badge variant="outline" className="text-xs shrink-0">
                    Fase {(m as any).mp_phases.phase_number}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProyectoMPDashboard;
