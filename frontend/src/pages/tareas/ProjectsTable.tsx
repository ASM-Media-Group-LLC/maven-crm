import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpDown, MoreHorizontal, Pencil, Trash2, Share2, Archive, RotateCcw, Shield, FolderOpen, FolderInput } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { TaskProject, ProjectFolder } from "./useProjects";

type SortKey = "name" | "status" | "pending" | "in_progress" | "overdue" | "completed" | "progress";

interface ProjectsTableProps {
  projects: TaskProject[];
  getProjectTaskCounts: (id: string) => { pending: number; in_progress: number; paused: number; overdue: number; completed: number };
  getProjectProgress: (id: string) => number;
  profiles?: { id: string; full_name: string | null }[];
  getMembersForProject?: (projectId: string) => { id: string; full_name: string | null }[];
  onEdit: (project: TaskProject) => void;
  onDelete: (project: TaskProject) => void;
  onShare: (project: TaskProject) => void;
  onArchive: (project: TaskProject) => void;
  folders?: ProjectFolder[];
  onMoveToFolder?: (projectId: string, folderId: string | null) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: () => void;
}

const ProjectsTable = ({ projects, getProjectTaskCounts, getProjectProgress, profiles = [], getMembersForProject, onEdit, onDelete, onShare, onArchive, folders = [], onMoveToFolder, selectedIds = new Set(), onToggleSelect, onToggleAll }: ProjectsTableProps) => {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sorted = [...projects].sort((a, b) => {
    const ca = getProjectTaskCounts(a.id);
    const cb = getProjectTaskCounts(b.id);
    let diff = 0;
    if (sortKey === "name") diff = a.name.localeCompare(b.name);
    else if (sortKey === "status") diff = a.status.localeCompare(b.status);
    else if (sortKey === "progress") diff = getProjectProgress(a.id) - getProjectProgress(b.id);
    else if (sortKey === "pending") diff = ca.pending - cb.pending;
    else if (sortKey === "in_progress") diff = ca.in_progress - cb.in_progress;
    else if (sortKey === "overdue") diff = ca.overdue - cb.overdue;
    else diff = ca.completed - cb.completed;
    return sortAsc ? diff : -diff;
  });

  const groupedSorted: { folderId: string | null; folderName: string; projects: TaskProject[] }[] = [];
  
  if (folders.length > 0) {
    folders.forEach(f => {
      const fp = sorted.filter(p => p.folder_id === f.id);
      if (fp.length > 0) groupedSorted.push({ folderId: f.id, folderName: f.name, projects: fp });
    });
    const unfoldered = sorted.filter(p => !p.folder_id);
    if (unfoldered.length > 0) groupedSorted.push({ folderId: null, folderName: "Sin carpeta", projects: unfoldered });
  } else {
    groupedSorted.push({ folderId: null, folderName: "", projects: sorted });
  }

  const allSelected = projects.length > 0 && selectedIds.size === projects.length;
  const colSpan = onToggleSelect ? 12 : 11;

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs" onClick={() => handleSort(col)}>
      {label} <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  const renderRow = (project: TaskProject) => {
    const counts = getProjectTaskCounts(project.id);
    const progress = getProjectProgress(project.id);
    const leader = project.leader_id ? profiles.find(p => p.id === project.leader_id) : null;
    const isSelected = selectedIds.has(project.id);
    return (
      <TableRow key={project.id} className={cn("cursor-pointer", isSelected && "bg-primary/5")} onClick={() => navigate(`/tareas/${project.id}`)}>
        {onToggleSelect && (
          <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(project.id)} />
          </TableCell>
        )}
        <TableCell className="font-medium">{project.name}</TableCell>
        <TableCell className="hidden sm:table-cell text-muted-foreground text-sm truncate max-w-[200px]">{project.description || "—"}</TableCell>
        <TableCell>
          {leader ? (
            <div className="flex items-center gap-1.5 text-xs">
              <Shield className="h-3 w-3 text-primary" />
              <span>{leader.full_name || "—"}</span>
            </div>
          ) : <span className="text-muted-foreground text-xs">—</span>}
        </TableCell>
        <TableCell>
          {(() => {
            const members = getMembersForProject?.(project.id) || [];
            if (members.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
            return (
              <TooltipProvider>
                <div className="flex -space-x-1.5">
                  {members.slice(0, 3).map(m => (
                    <Tooltip key={m.id}>
                      <TooltipTrigger asChild>
                        <Avatar className="h-6 w-6 border-2 border-background">
                          <AvatarFallback className="text-[9px] bg-muted">
                            {(m.full_name || "?").charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">{m.full_name || "Sin nombre"}</TooltipContent>
                    </Tooltip>
                  ))}
                  {members.length > 3 && (
                    <Avatar className="h-6 w-6 border-2 border-background">
                      <AvatarFallback className="text-[9px] bg-muted">+{members.length - 3}</AvatarFallback>
                    </Avatar>
                  )}
                </div>
              </TooltipProvider>
            );
          })()}
        </TableCell>
        <TableCell>
          <span className={`text-xs px-2 py-0.5 rounded ${project.status === "archived" ? "bg-muted text-muted-foreground" : "bg-primary/20 text-primary"}`}>
            {project.status === "archived" ? "Archivado" : "Activo"}
          </span>
        </TableCell>
        <TableCell className="text-center">{counts.pending}</TableCell>
        <TableCell className="text-center">{counts.in_progress}</TableCell>
        <TableCell className="text-center text-destructive">{counts.overdue}</TableCell>
        <TableCell className="text-center text-success">{counts.completed}</TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Progress value={progress} className="h-1.5 flex-1" />
            <span className="text-[10px] text-muted-foreground w-8 text-right">{progress}%</span>
          </div>
        </TableCell>
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => onEdit(project)}>
                <Pencil className="mr-2 h-4 w-4" /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onShare(project)}>
                <Share2 className="mr-2 h-4 w-4" /> Compartir
              </DropdownMenuItem>
              {folders.length > 0 && onMoveToFolder && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderInput className="mr-2 h-4 w-4" /> Mover a carpeta
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={() => onMoveToFolder(project.id, null)}>
                      Sin carpeta
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {folders.map(f => (
                      <DropdownMenuItem key={f.id} onClick={() => onMoveToFolder(project.id, f.id)}>
                        {f.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuItem onClick={() => onArchive(project)}>
                {project.status === "archived" ? (
                  <><RotateCcw className="mr-2 h-4 w-4" /> Reactivar</>
                ) : (
                  <><Archive className="mr-2 h-4 w-4" /> Archivar</>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(project)}>
                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="rounded-md border max-h-[calc(100vh-24rem)] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            {onToggleSelect && (
              <TableHead className="w-10" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={allSelected} onCheckedChange={onToggleAll} />
              </TableHead>
            )}
            <TableHead><SortHeader label="Nombre" col="name" /></TableHead>
            <TableHead className="hidden sm:table-cell">Descripción</TableHead>
            <TableHead>Líder</TableHead>
            <TableHead>Miembros</TableHead>
            <TableHead><SortHeader label="Estado" col="status" /></TableHead>
            <TableHead className="text-center"><SortHeader label="Pendientes" col="pending" /></TableHead>
            <TableHead className="text-center"><SortHeader label="En curso" col="in_progress" /></TableHead>
            <TableHead className="text-center"><SortHeader label="Vencidas" col="overdue" /></TableHead>
            <TableHead className="text-center"><SortHeader label="Completadas" col="completed" /></TableHead>
            <TableHead className="w-32"><SortHeader label="Progreso" col="progress" /></TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupedSorted.map(group => (
            <>
              {folders.length > 0 && (
                <TableRow key={`folder-${group.folderId || 'none'}`} className="bg-muted/30 hover:bg-muted/30">
                  <TableCell colSpan={colSpan} className="py-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                      <FolderOpen className="h-4 w-4" />
                      {group.folderName}
                      <span className="text-xs font-normal">({group.projects.length})</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {group.projects.map(renderRow)}
            </>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default ProjectsTable;
