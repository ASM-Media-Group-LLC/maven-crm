import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpDown, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { TaskProject } from "./useProjects";

type SortKey = "name" | "active" | "overdue" | "completed";

interface ProjectsTableProps {
  projects: TaskProject[];
  getProjectTaskCounts: (id: string) => { active: number; overdue: number; completed: number };
  onEdit: (project: TaskProject) => void;
  onDelete: (project: TaskProject) => void;
}

const ProjectsTable = ({ projects, getProjectTaskCounts, onEdit, onDelete }: ProjectsTableProps) => {
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
    else if (sortKey === "active") diff = ca.active - cb.active;
    else if (sortKey === "overdue") diff = ca.overdue - cb.overdue;
    else diff = ca.completed - cb.completed;
    return sortAsc ? diff : -diff;
  });

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort(col)}>
      {label} <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  return (
    <div className="rounded-md border max-h-[calc(100vh-24rem)] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead><SortHeader label="Nombre" col="name" /></TableHead>
            <TableHead className="hidden sm:table-cell">Descripción</TableHead>
            <TableHead className="text-center"><SortHeader label="Activas" col="active" /></TableHead>
            <TableHead className="text-center"><SortHeader label="Vencidas" col="overdue" /></TableHead>
            <TableHead className="text-center"><SortHeader label="Completadas" col="completed" /></TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((project) => {
            const counts = getProjectTaskCounts(project.id);
            return (
              <TableRow key={project.id} className="cursor-pointer" onClick={() => navigate(`/tareas/${project.id}`)}>
                <TableCell className="font-medium">{project.name}</TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm truncate max-w-[200px]">{project.description || "—"}</TableCell>
                <TableCell className="text-center">{counts.active}</TableCell>
                <TableCell className="text-center text-destructive">{counts.overdue}</TableCell>
                <TableCell className="text-center text-emerald-400">{counts.completed}</TableCell>
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
                      <DropdownMenuItem className="text-destructive" onClick={() => onDelete(project)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default ProjectsTable;
