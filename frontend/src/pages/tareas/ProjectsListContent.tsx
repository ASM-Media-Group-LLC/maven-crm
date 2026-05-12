import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { getPublicBaseUrl } from "@/lib/getPublicUrl";
import { Plus, FolderOpen, Clock, AlertTriangle, LayoutGrid, List, MoreHorizontal, Pencil, Trash2, Search, Play, Pause, CheckSquare, Archive, RotateCcw, Share2, Crown, ChevronDown, ChevronRight, FolderPlus, FolderInput, X, BarChart3 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import KpiCard from "@/components/dashboard/KpiCard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useProjects, type TaskProject } from "./useProjects";
import { useProjectMembers } from "./useProjectMembers";
import { priorityConfig } from "./PrioritySelect";
import DraggableGrid from "./DraggableGrid";
import CreateProjectModal from "./CreateProjectModal";
import EditProjectModal from "./EditProjectModal";
import DeleteProjectDialog from "./DeleteProjectDialog";
import ProjectsTable from "./ProjectsTable";
import CreateFolderModal from "./CreateFolderModal";
import GlobalAnalyticsTab from "./GlobalAnalyticsTab";

const ProjectsListContent = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { projects, allTasks, isLoading, isLoadingTasks, isTasksError, tasksError, profile, folders, createProject, updateProject, deleteProject, archiveProject, getProjectTaskCounts, getProjectProgress, reorderProjects, createFolder, renameFolder, deleteFolder, moveProjectToFolder, updateGlobalTaskStatus } = useProjects();

  const { data: companyProfiles = [] } = useQuery({
    queryKey: ["company-profiles", profile?.company_id],
    queryFn: async () => {
      let query = supabase.from("profiles").select("id, full_name");
      if (profile?.company_id) {
        query = query.or(`company_id.eq.${profile.company_id},company_id.is.null`);
      }
      const { data } = await query;
      return data || [];
    },
    enabled: !!profile,
  });

  const { data: allMembers = [] } = useQuery({
    queryKey: ["all-project-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_members" as any)
        .select("*");
      if (error) throw error;
      return (data || []) as unknown as { id: string; project_id: string; user_id: string; role: string }[];
    },
    enabled: !!user,
  });

  const getMembersForProject = (projectId: string) => {
    const memberUserIds = allMembers.filter(m => m.project_id === projectId).map(m => m.user_id);
    return companyProfiles.filter(p => memberUserIds.includes(p.id));
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [mainView, setMainView] = useState<"projects" | "analytics">("projects");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [editProject, setEditProject] = useState<TaskProject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskProject | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [folderFilter, setFolderFilter] = useState<string>("");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const toggleFolderCollapse = (folderId: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleShare = (project: TaskProject) => {
    if (project.share_token) {
      const url = `${getPublicBaseUrl()}/tareas/project-share/${project.share_token}`;
      navigator.clipboard.writeText(url);
      toast({ title: "Link copiado", description: "El enlace público fue copiado al portapapeles." });
    }
  };

  const handleArchive = (project: TaskProject) => {
    const newStatus = project.status === "archived" ? "active" : "archived";
    archiveProject.mutate({ id: project.id, status: newStatus });
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = !statusFilter || p.status === statusFilter;
      const matchesFolder = !folderFilter || (folderFilter === "__none__" ? !p.folder_id : p.folder_id === folderFilter);
      return matchesSearch && matchesStatus && matchesFolder;
    });
  }, [projects, search, statusFilter, folderFilter]);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === filteredProjects.length) return new Set();
      return new Set(filteredProjects.map(p => p.id));
    });
  }, [filteredProjects]);

  const handleBatchArchive = useCallback(() => {
    Array.from(selectedIds).forEach(id => {
      archiveProject.mutate({ id, status: "archived" });
    });
    clearSelection();
  }, [selectedIds, archiveProject, clearSelection]);

  const handleBatchDelete = useCallback(() => {
    Array.from(selectedIds).forEach(id => {
      deleteProject.mutate(id);
    });
    clearSelection();
    setBatchDeleteOpen(false);
  }, [selectedIds, deleteProject, clearSelection]);

  const handleBatchMove = useCallback((folderId: string | null) => {
    Array.from(selectedIds).forEach(projectId => {
      moveProjectToFolder.mutate({ projectId, folderId });
    });
    clearSelection();
  }, [selectedIds, moveProjectToFolder, clearSelection]);

  // Group projects by folder
  const groupedProjects = useMemo(() => {
    const groups: { folderId: string | null; folderName: string; projects: TaskProject[] }[] = [];
    const folderMap = new Map(folders.map(f => [f.id, f.name]));
    
    // Add folder groups
    folders.forEach(f => {
      const folderProjects = filteredProjects.filter(p => p.folder_id === f.id);
      if (folderProjects.length > 0 || !folderFilter) {
        groups.push({ folderId: f.id, folderName: f.name, projects: folderProjects });
      }
    });

    // Add "Sin carpeta" group
    const unfoldered = filteredProjects.filter(p => !p.folder_id);
    if (unfoldered.length > 0 || groups.length > 0) {
      groups.push({ folderId: null, folderName: "Sin carpeta", projects: unfoldered });
    }

    return groups;
  }, [filteredProjects, folders, folderFilter]);

  const totalCounts = useMemo(() => {
    let pending = 0, in_progress = 0, paused = 0, overdue = 0, completed = 0;
    filteredProjects.forEach((p) => {
      const c = getProjectTaskCounts(p.id);
      pending += c.pending;
      in_progress += c.in_progress;
      paused += c.paused;
      overdue += c.overdue;
      completed += c.completed;
    });
    return { pending, in_progress, paused, overdue, completed };
  }, [filteredProjects, getProjectTaskCounts]);

  const kpis = [
    { label: "Total Proyectos", value: filteredProjects.length, icon: FolderOpen, color: "bg-blue-500" },
    { label: "Pendientes", value: totalCounts.pending, icon: Clock, color: "bg-amber-500" },
    { label: "En curso", value: totalCounts.in_progress, icon: Play, color: "bg-violet-500" },
    { label: "Vencidas", value: totalCounts.overdue, icon: AlertTriangle, color: "bg-rose-500" },
    { label: "Completadas", value: totalCounts.completed, icon: CheckSquare, color: "bg-emerald-500" },
  ];

  const renderProjectActions = (project: TaskProject, stopProp: boolean = true) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={stopProp ? (e) => e.stopPropagation() : undefined}>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={stopProp ? (e) => e.stopPropagation() : undefined}>
        <DropdownMenuItem onClick={() => setEditProject(project)}>
          <Pencil className="mr-2 h-4 w-4" /> Editar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleShare(project)}>
          <Share2 className="mr-2 h-4 w-4" /> Compartir
        </DropdownMenuItem>
        {folders.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput className="mr-2 h-4 w-4" /> Mover a carpeta
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => moveProjectToFolder.mutate({ projectId: project.id, folderId: null })}>
                Sin carpeta
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {folders.map(f => (
                <DropdownMenuItem key={f.id} onClick={() => moveProjectToFolder.mutate({ projectId: project.id, folderId: f.id })}>
                  {f.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem onClick={() => handleArchive(project)}>
          {project.status === "archived" ? (
            <><RotateCcw className="mr-2 h-4 w-4" /> Reactivar</>
          ) : (
            <><Archive className="mr-2 h-4 w-4" /> Archivar</>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(project)}>
          <Trash2 className="mr-2 h-4 w-4" /> Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderProjectCard = (project: TaskProject) => {
    const counts = getProjectTaskCounts(project.id);
    const progress = getProjectProgress(project.id);
    const leader = project.leader_id ? companyProfiles.find(p => p.id === project.leader_id) : null;
    const isSelected = selectedIds.has(project.id);
    return (
      <Card
        key={project.id}
        className={cn("cursor-pointer transition-all hover:bg-muted/50 relative", project.status === "archived" && "opacity-60", isSelected && "ring-2 ring-primary")}
        onClick={() => navigate(`/tareas/${project.id}`)}
      >
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleSelect(project.id)}
                onClick={(e) => e.stopPropagation()}
                className="mt-1 shrink-0"
              />
              <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base truncate">{project.name}</h3>
                {project.status === "archived" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Archivado</span>
                )}
              </div>
              {project.description && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{project.description}</p>
              )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {(() => {
                const projectMembers = getMembersForProject(project.id);
                if (projectMembers.length === 0) return null;
                return (
                  <HoverCard>
                    <HoverCardTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <div className="flex -space-x-1.5 cursor-pointer">
                        {projectMembers.slice(0, 3).map(m => (
                          <Avatar key={m.id} className="h-6 w-6 border-2 border-background">
                            <AvatarFallback className="text-[9px] bg-muted">
                              {(m.full_name || "?").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                        {projectMembers.length > 3 && (
                          <Avatar className="h-6 w-6 border-2 border-background">
                            <AvatarFallback className="text-[9px] bg-muted">+{projectMembers.length - 3}</AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    </HoverCardTrigger>
                    <HoverCardContent side="bottom" align="end" className="w-48 p-3" onClick={(e) => e.stopPropagation()}>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Miembros ({projectMembers.length})</p>
                      <div className="space-y-1.5">
                        {projectMembers.map(m => (
                          <div key={m.id} className="flex items-center gap-2">
                            <Avatar className="h-5 w-5">
                              <AvatarFallback className="text-[8px] bg-muted">
                                {(m.full_name || "?").charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs truncate">{m.full_name || "Sin nombre"}</span>
                          </div>
                        ))}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                );
              })()}
              {renderProjectActions(project)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-500" />
            {leader ? (
              <span className="text-sm font-semibold">{leader.full_name || "Sin nombre"}</span>
            ) : (
              <span className="text-sm text-muted-foreground">Sin líder asignado</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Progress value={progress} className="h-2.5 flex-1" />
            <span className="text-xs font-medium text-muted-foreground w-9 text-right">{progress}%</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex gap-3 text-sm">
              <span className="flex items-center gap-1 text-muted-foreground" title="Pendientes">
                <Clock className="h-3.5 w-3.5 text-primary" /> {counts.pending}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground" title="En curso">
                <Play className="h-3.5 w-3.5 text-blue-400" /> {counts.in_progress}
              </span>
              {counts.overdue > 0 && (
                <span className="flex items-center gap-1 font-medium text-destructive" title="Vencidas">
                  <AlertTriangle className="h-3.5 w-3.5" /> {counts.overdue}
                </span>
              )}
              <span className="flex items-center gap-1 text-emerald-400 font-medium" title="Completadas">
                <CheckSquare className="h-3.5 w-3.5" /> {counts.completed}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const hasFolders = folders.length > 0;

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Tareas</h1>
            <p className="text-sm text-muted-foreground">Gestión de tareas y proyectos</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCreateFolderOpen(true)}>
              <FolderPlus className="h-4 w-4 mr-1" /> Nueva Carpeta
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nuevo Proyecto
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {/* Sticky KPIs + Filters */}
        <div className="sticky top-0 z-10 bg-background px-6 pt-6 pb-4 space-y-4 border-b border-border">
          {/* KPI Stats Cards — patrón estándar (estáticas, la lista de proyectos vive abajo) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {kpis.map((kpi) => (
              <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} color={kpi.color} />
            ))}
          </div>

          {/* Filters + view tabs */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar proyecto..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            {hasFolders && (
              <Select value={folderFilter || undefined} onValueChange={(v) => setFolderFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Carpeta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  <SelectItem value="__none__">Sin carpeta</SelectItem>
                  {folders.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={statusFilter || undefined} onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="archived">Archivado</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 ml-auto border rounded-lg p-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant={mainView === "analytics" ? "secondary" : "ghost"} size="sm" onClick={() => setMainView(mainView === "analytics" ? "projects" : "analytics")} className="gap-1">
                    <BarChart3 className="h-4 w-4" /> Analíticas
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Analíticas globales de tareas</TooltipContent>
              </Tooltip>
              <div className="w-px h-5 bg-border mx-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant={mainView === "projects" && viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => { setMainView("projects"); setViewMode("list"); }}>
                    <List className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Vista lista</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant={mainView === "projects" && viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => { setMainView("projects"); setViewMode("grid"); }}>
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Vista cuadrícula</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">

        {mainView === "analytics" ? (
          <GlobalAnalyticsTab
            tasks={allTasks}
            profiles={companyProfiles}
            projects={projects}
            isLoading={isLoadingTasks}
            isError={isTasksError}
            errorMessage={tasksError?.message}
          />
        ) : (
        <div className="space-y-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Cargando proyectos...</p>
          ) : filteredProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No hay proyectos aún. Crea el primero.</p>
          ) : viewMode === "list" ? (
            <ProjectsTable
              projects={filteredProjects}
              getProjectTaskCounts={getProjectTaskCounts}
              getProjectProgress={getProjectProgress}
              profiles={companyProfiles}
              getMembersForProject={getMembersForProject}
              onEdit={setEditProject}
              onDelete={setDeleteTarget}
              onShare={handleShare}
              onArchive={handleArchive}
              folders={folders}
              onMoveToFolder={(projectId, folderId) => moveProjectToFolder.mutate({ projectId, folderId })}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleAll={toggleSelectAll}
            />
          ) : hasFolders ? (
            <div className="space-y-4">
              {groupedProjects.map(group => {
                if (group.projects.length === 0 && group.folderId) return null;
                const isCollapsed = group.folderId ? collapsedFolders.has(group.folderId) : false;
                const groupKey = group.folderId || "__none__";
                return (
                  <Collapsible key={groupKey} open={!isCollapsed} onOpenChange={() => group.folderId && toggleFolderCollapse(group.folderId)}>
                    <div className="flex items-center gap-2 mb-2">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-1 px-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
                          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          <FolderOpen className="h-4 w-4" />
                          {group.folderName}
                          <span className="text-xs font-normal ml-1">({group.projects.length})</span>
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent>
                      {group.projects.length === 0 ? (
                        <p className="text-xs text-muted-foreground pl-8 pb-2">Sin proyectos en esta carpeta</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {group.projects.map(renderProjectCard)}
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          ) : (
            <DraggableGrid
              items={filteredProjects}
              onReorder={(ids) => reorderProjects.mutate(ids)}
              renderItem={renderProjectCard}
            />
          )}
        </div>
        )}
        </div>
      </div>

      <CreateFolderModal
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        onSubmit={(name) => createFolder.mutate(name)}
        isLoading={createFolder.isPending}
      />

      <CreateProjectModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(data) => createProject.mutate(data)}
        isLoading={createProject.isPending}
        profiles={companyProfiles}
        folders={folders}
      />

      <EditProjectModal
        open={!!editProject}
        onOpenChange={(open) => !open && setEditProject(null)}
        project={editProject}
        onSubmit={(data) => updateProject.mutate(data)}
        isLoading={updateProject.isPending}
        profiles={companyProfiles}
        currentMemberIds={editProject ? allMembers.filter(m => m.project_id === editProject.id).map(m => m.user_id) : []}
        folders={folders}
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

      {/* Batch delete confirmation */}
      <DeleteProjectDialog
        open={batchDeleteOpen}
        onOpenChange={setBatchDeleteOpen}
        projectName={`${selectedIds.size} proyecto(s)`}
        onConfirm={handleBatchDelete}
        isLoading={deleteProject.isPending}
      />

      {/* Floating batch action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <div className="flex items-center gap-3 bg-card border border-border rounded-xl shadow-lg px-5 py-3">
            <span className="text-sm font-medium">{selectedIds.size} seleccionado(s)</span>
            <div className="h-5 w-px bg-border" />
            {folders.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <FolderInput className="h-4 w-4 mr-1" /> Mover
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handleBatchMove(null)}>Sin carpeta</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {folders.map(f => (
                    <DropdownMenuItem key={f.id} onClick={() => handleBatchMove(f.id)}>{f.name}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="outline" size="sm" onClick={handleBatchArchive}>
              <Archive className="h-4 w-4 mr-1" /> Archivar
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setBatchDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar
            </Button>
            <div className="h-5 w-px bg-border" />
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              <X className="h-4 w-4 mr-1" /> Deseleccionar
            </Button>
          </div>
        </div>
      )}
    </main>
  );
};

export default ProjectsListContent;
