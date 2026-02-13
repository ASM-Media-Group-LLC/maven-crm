import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FolderOpen, Clock, AlertTriangle, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useProjects } from "./useProjects";
import CreateProjectModal from "./CreateProjectModal";

const ProjectsListContent = () => {
  const navigate = useNavigate();
  const { projects, isLoading, createProject, getProjectTaskCounts } = useProjects();
  const [createOpen, setCreateOpen] = useState(false);

  const totalPending = projects.reduce((sum, p) => {
    const c = getProjectTaskCounts(p.id);
    return sum + c.active + c.overdue;
  }, 0);

  const kpis = [
    { label: "Total Proyectos", value: projects.length, icon: FolderOpen, color: "text-primary" },
    { label: "Proyectos Activos", value: projects.filter((p) => p.status === "active").length, icon: Clock, color: "text-primary" },
    { label: "Tareas Pendientes", value: totalPending, icon: AlertTriangle, color: "text-warning" },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Proyectos</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo Proyecto
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              <div>
                <p className="text-2xl font-bold">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Cargando proyectos...</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No hay proyectos aún. Crea el primero.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => {
            const counts = getProjectTaskCounts(project.id);
            return (
              <Card
                key={project.id}
                className="cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => navigate(`/tareas/${project.id}`)}
              >
                <CardContent className="p-5 space-y-3">
                  <div>
                    <h3 className="font-semibold text-base truncate">{project.name}</h3>
                    {project.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{project.description}</p>
                    )}
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-primary" /> {counts.active} activas
                    </span>
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 text-destructive" /> {counts.overdue} vencidas
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckSquare className="h-3 w-3 text-emerald-400" /> {counts.completed}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateProjectModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(data) => createProject.mutate(data)}
        isLoading={createProject.isPending}
      />
    </main>
  );
};

export default ProjectsListContent;
