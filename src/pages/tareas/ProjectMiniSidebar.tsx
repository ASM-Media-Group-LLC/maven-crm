import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Star, ChevronLeft, ChevronRight, FolderOpen, ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

interface ProjectMiniSidebarProps {
  currentProjectId: string;
}

const FAVORITES_KEY = "tareas-project-favorites";

const ProjectMiniSidebar = ({ currentProjectId }: ProjectMiniSidebarProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const [collapsed, setCollapsed] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"); } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const { data: projects = [], isLoading, isError } = useQuery({
    queryKey: ["mini-sidebar-projects", user?.id, isAdmin],
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase
          .from("task_projects" as any)
          .select("id, name, status")
          .eq("status", "active")
          .order("name");
        if (error) throw error;
        return (data || []) as unknown as { id: string; name: string; status: string }[];
      }
      const { data: memberships, error: memError } = await supabase
        .from("project_members" as any)
        .select("project_id")
        .eq("user_id", user!.id);
      if (memError) throw memError;
      const projectIds = (memberships || []).map((m: any) => m.project_id);
      if (projectIds.length === 0) return [];
      const { data, error } = await supabase
        .from("task_projects" as any)
        .select("id, name, status")
        .in("id", projectIds)
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as { id: string; name: string; status: string }[];
    },
    enabled: !!user,
  });

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]);
  };

  const favoriteProjects = projects.filter((p) => favorites.includes(p.id));
  const otherProjects = projects.filter((p) => !favorites.includes(p.id));

  if (collapsed) {
    return (
      <div className="w-10 border-r bg-muted/20 flex flex-col items-center py-3 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCollapsed(false)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Mostrar proyectos</TooltipContent>
        </Tooltip>
        <div className="mt-3 space-y-1">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="w-6 h-6 rounded" />
            ))
          ) : (
            projects.slice(0, 8).map((p) => (
              <Tooltip key={p.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => navigate(`/tareas/${p.id}`)}
                    className={cn(
                      "w-6 h-6 rounded text-[9px] font-bold flex items-center justify-center transition-colors",
                      p.id === currentProjectId ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground"
                    )}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{p.name}</TooltipContent>
              </Tooltip>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-56 border-r bg-muted/20 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Proyectos</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCollapsed(true)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Back to projects list */}
      <button
        onClick={() => navigate("/tareas")}
        className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border-b"
      >
        <ArrowLeft className="h-3 w-3" />
        Todos los proyectos
      </button>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                <Skeleton className="h-3.5 w-3.5 rounded" />
                <Skeleton className="h-4 flex-1 rounded" />
              </div>
            ))
          ) : isError ? (
            <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
              <AlertCircle className="h-5 w-5 opacity-50" />
              <p className="text-xs text-center">Error cargando proyectos</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
              <FolderOpen className="h-5 w-5 opacity-50" />
              <p className="text-xs text-center">No hay proyectos</p>
            </div>
          ) : (
            <>
              {favoriteProjects.length > 0 && (
                <>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-2 py-1 flex items-center gap-1">
                    <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" /> Favoritos
                  </p>
                  {favoriteProjects.map((p) => (
                    <ProjectItem
                      key={p.id}
                      project={p}
                      isCurrent={p.id === currentProjectId}
                      isFavorite
                      onNavigate={() => navigate(`/tareas/${p.id}`)}
                      onToggleFavorite={() => toggleFavorite(p.id)}
                    />
                  ))}
                  <div className="h-px bg-border my-1.5" />
                </>
              )}
              {otherProjects.map((p) => (
                <ProjectItem
                  key={p.id}
                  project={p}
                  isCurrent={p.id === currentProjectId}
                  isFavorite={false}
                  onNavigate={() => navigate(`/tareas/${p.id}`)}
                  onToggleFavorite={() => toggleFavorite(p.id)}
                />
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

const ProjectItem = ({
  project,
  isCurrent,
  isFavorite,
  onNavigate,
  onToggleFavorite,
}: {
  project: { id: string; name: string };
  isCurrent: boolean;
  isFavorite: boolean;
  onNavigate: () => void;
  onToggleFavorite: () => void;
}) => (
  <div
    className={cn(
      "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer group text-sm transition-colors",
      isCurrent
        ? "bg-primary/10 text-primary font-medium border-l-2 border-primary"
        : "hover:bg-muted text-foreground"
    )}
    onClick={onNavigate}
  >
    <FolderOpen className={cn("h-3.5 w-3.5 shrink-0", isCurrent ? "text-primary" : "text-muted-foreground")} />
    <span className="truncate flex-1">{project.name}</span>
    <button
      onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
      className={cn(
        "shrink-0 transition-opacity",
        isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-60"
      )}
    >
      <Star className={cn("h-3 w-3", isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
    </button>
  </div>
);

export default ProjectMiniSidebar;
