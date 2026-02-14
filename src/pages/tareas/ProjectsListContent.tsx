import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FolderOpen, Clock, AlertTriangle, LayoutGrid, List, MoreHorizontal, Pencil, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useProjects, type TaskProject } from "./useProjects";
import CreateProjectModal from "./CreateProjectModal";
import EditProjectModal from "./EditProjectModal";
import DeleteProjectDialog from "./DeleteProjectDialog";
import ProjectsTable from "./ProjectsTable";

const ProjectsListContent = () => {
  const navigate = useNavigate();
  const { projects, isLoading, createProject, updateProject, deleteProject, getProjectTaskCounts } = useProjects();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [editProject, setEditProject] = useState<TaskProject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskProject | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [projects, search, statusFilter]);

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
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Proyectos</h1>
            <p className="text-sm text-muted-foreground">Gestión de proyectos y tareas</p>
          </div>
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo Proyecto
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
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

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar proyecto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activo</SelectItem>
              <SelectItem value="archived">Archivado</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 ml-auto">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" onClick={() => setViewMode("list")}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" onClick={() => setViewMode("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Cargando proyectos...</p>
        ) : filteredProjects.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No hay proyectos aún. Crea el primero.</p>
        ) : viewMode === "list" ? (
          <ProjectsTable
            projects={filteredProjects}
            getProjectTaskCounts={getProjectTaskCounts}
            onEdit={setEditProject}
            onDelete={setDeleteTarget}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project) => {
              const counts = getProjectTaskCounts(project.id);
              return (
                <Card
                  key={project.id}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  onClick={() => navigate(`/tareas/${project.id}`)}
                >
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base truncate">{project.name}</h3>
                        {project.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{project.description}</p>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => setEditProject(project)}>
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(project)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-primary" /> {counts.active} activas
                      </span>
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-destructive" /> {counts.overdue} vencidas
                      </span>
                      <span className="flex items-center gap-1 text-emerald-400">
                        ✓ {counts.completed}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <CreateProjectModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(data) => createProject.mutate(data)}
        isLoading={createProject.isPending}
      />

      <EditProjectModal
        open={!!editProject}
        onOpenChange={(open) => !open && setEditProject(null)}
        project={editProject}
        onSubmit={(data) => updateProject.mutate(data)}
        isLoading={updateProject.isPending}
      />

      <DeleteProjectDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        projectName={deleteTarget?.name || ""}
        onConfirm={() => {
          if (deleteTarget) deleteProject.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        isLoading={deleteProject.isPending}
      />
    </main>
  );
};

export default ProjectsListContent;
