import { useState } from "react";
import { ArrowUpDown, MoreHorizontal, Pencil, Trash2, Check, AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCountdown } from "./useCountdown";
import type { Task } from "./useTareas";

type SortKey = "title" | "assigned" | "due" | "status";

interface TasksTableProps {
  tasks: Task[];
  profiles: { id: string; full_name: string | null }[];
  onComplete: (id: string) => void;
  onJustify: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

const CountdownCell = ({ dueAt, status }: { dueAt: string; status: string }) => {
  const { display, isOverdue, isWarning } = useCountdown(dueAt);
  const isCompleted = status === "completed";
  const color = isCompleted ? "text-muted-foreground" : isOverdue ? "text-destructive" : isWarning ? "text-yellow-400" : "text-foreground";
  return <span className={`font-mono text-sm font-semibold ${color}`}>{isCompleted ? "✓" : display}</span>;
};

const StatusBadge = ({ task }: { task: Task }) => {
  const { isOverdue, isWarning } = useCountdown(task.due_at);
  if (task.status === "completed") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Completada</Badge>;
  if (isOverdue) return <Badge variant="destructive">Vencida</Badge>;
  if (isWarning) return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Próxima</Badge>;
  return <Badge variant="secondary">Activa</Badge>;
};

const TasksTable = ({ tasks, profiles, onComplete, onJustify, onEdit, onDelete }: TasksTableProps) => {
  const [sortKey, setSortKey] = useState<SortKey>("due");
  const [sortAsc, setSortAsc] = useState(true);

  const profileMap = new Map(profiles.map((p) => [p.id, p.full_name || "Sin nombre"]));

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sorted = [...tasks].sort((a, b) => {
    let diff = 0;
    if (sortKey === "title") diff = a.title.localeCompare(b.title);
    else if (sortKey === "assigned") diff = (profileMap.get(a.assigned_to) || "").localeCompare(profileMap.get(b.assigned_to) || "");
    else if (sortKey === "due") diff = new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    else diff = a.status.localeCompare(b.status);
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
            <TableHead><SortHeader label="Título" col="title" /></TableHead>
            <TableHead className="hidden sm:table-cell"><SortHeader label="Asignado" col="assigned" /></TableHead>
            <TableHead className="text-center"><SortHeader label="Countdown" col="due" /></TableHead>
            <TableHead className="text-center"><SortHeader label="Estado" col="status" /></TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((task) => {
            const isOverdue = new Date(task.due_at).getTime() <= Date.now();
            const isCompleted = task.status === "completed";
            const needsJustification = isOverdue && !isCompleted && !task.overdue_reason;
            const canComplete = !isCompleted && (!isOverdue || !!task.overdue_reason);

            return (
              <TableRow key={task.id}>
                <TableCell>
                  <div className="font-medium text-sm">{task.title}</div>
                  {task.description && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{task.description}</div>}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-sm">{profileMap.get(task.assigned_to) || "—"}</TableCell>
                <TableCell className="text-center"><CountdownCell dueAt={task.due_at} status={task.status} /></TableCell>
                <TableCell className="text-center"><StatusBadge task={task} /></TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canComplete && (
                        <DropdownMenuItem onClick={() => onComplete(task.id)}>
                          <Check className="mr-2 h-4 w-4" /> Completar
                        </DropdownMenuItem>
                      )}
                      {needsJustification && (
                        <DropdownMenuItem onClick={() => onJustify(task)}>
                          <AlertTriangle className="mr-2 h-4 w-4" /> Justificar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => onEdit(task)}>
                        <Pencil className="mr-2 h-4 w-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => onDelete(task)}>
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

export default TasksTable;
