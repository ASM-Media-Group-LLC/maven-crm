import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useMPMilestones, useUpdateMPMilestone } from "./hooks/useMPMilestones";
import { toast } from "sonner";
import { CheckCircle2, Circle, Target } from "lucide-react";

const ProyectoMPMilestones = () => {
  const { data: milestones, isLoading } = useMPMilestones();
  const updateMilestone = useUpdateMPMilestone();

  const toggleMilestone = (id: string, completed: boolean) => {
    updateMilestone.mutate(
      { id, completed: !completed, completed_at: !completed ? new Date().toISOString() : null },
      { onSuccess: () => toast.success(completed ? "Milestone desmarcado" : "¡Milestone completado!") }
    );
  };

  const completed = milestones?.filter((m) => m.completed).length ?? 0;
  const total = milestones?.length ?? 0;

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  // Group by phase
  const grouped = milestones?.reduce((acc, m) => {
    const phaseName = (m as any).mp_phases?.name || "Sin fase";
    if (!acc[phaseName]) acc[phaseName] = [];
    acc[phaseName].push(m);
    return acc;
  }, {} as Record<string, typeof milestones>) ?? {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Milestones & KPIs</h1>
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-amber-400" />
          <span className="text-sm font-medium">{completed}/{total} completados</span>
        </div>
      </div>

      {Object.entries(grouped).map(([phaseName, items]) => (
        <Card key={phaseName} className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{phaseName}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {items?.map((m) => (
              <div
                key={m.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  m.completed ? "border-emerald-500/30 bg-emerald-500/5" : "border-border hover:bg-accent/50"
                }`}
                onClick={() => toggleMilestone(m.id, m.completed)}
              >
                <div className="mt-0.5">
                  {m.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${m.completed ? "line-through text-muted-foreground" : ""}`}>
                    {m.title}
                  </p>
                  {m.description && (
                    <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
                  )}
                  {m.completed && m.completed_at && (
                    <p className="text-xs text-emerald-400 mt-1">
                      Completado: {new Date(m.completed_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default ProyectoMPMilestones;
