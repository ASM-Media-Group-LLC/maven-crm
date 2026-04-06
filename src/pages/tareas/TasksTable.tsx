import { useState } from "react";
import { ArrowUpDown, MoreHorizontal, Pencil, Trash2, Play, Pause, CheckCircle2, AlertTriangle, Diamond, Link, Unplug } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCountdown } from "./useCountdown";
import InlineAssigneeSelect from "./InlineAssigneeSelect";
import InlinePrioritySelect from "./InlinePrioritySelect";
import InlineDateTimeEdit from "./InlineDateTimeEdit";
import type { Task } from "./useTareas";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type SortKey = "title" | "assigned" | "due" | "status" | "priority" | "start" | "assigned_by" | "due_date" | "task_type";

interface TasksTableProps {
  tasks: Task[];
  profiles: { id: string; full_name: string | null }[];
  onComplete: (id: string) => void;
  onJustify: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onStatusChange?: (taskId: string, status: string) => void;
  onPatchTask: (taskId: string, fields: Record<string, any>) => void;
  onUpdateAssignees: (taskId: string, assigneeIds: string[]) => void;
}

const statusConfig: Record<string, { label: string; badgeClass: string }> = {
  active: { label: "Pendiente", badgeClass: "bg-secondary text-secondary-foreground border-border" },
  in_progress: { label: "En curso", badgeClass: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  paused: { label: "Pausada", badgeClass: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  overdue: { label: "Vencida", badgeClass: "bg-destructive/20 text-destructive border-destructive/30" },
  completed: { label: "Completada", badgeClass: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
};

const getStatusTransitions = (status: string, isOverdue: boolean, hasOverdueReason: boolean) => {
  if (status === "completed") return [];
  if (isOverdue && !hasOverdueReason) {
    return [{ status: "justify", label: "Justificar", icon: AlertTriangle }];
  }
  switch (status) {
    case "active":
      return [
        { status: "in_progress", label: "Iniciar", icon: Play },
        { status: "completed", label: "Completar", icon: CheckCircle2 },
      ];
    case "in_progress":
      return [
        { status: "paused", label: "Pausar", icon: Pause },
        { status: "completed", label: "Completar", icon: CheckCircle2 },
      ];
    case "paused":
      return [
        { status: "in_progress", label: "Reanudar", icon: Play },
        { status: "completed", label: "Completar", icon: CheckCircle2 },
      ];
    case "overdue":
      return [{ status: "completed", label: "Completar", icon: CheckCircle2 }];
    default:
      return [
        { status: "in_progress", label: "Iniciar", icon: Play },
        { status: "completed", label: "Completar", icon: CheckCircle2 },
      ];
  }
};

const CountdownCell = ({ dueAt, status }: { dueAt: string; status: string }) => {
  const { display, isOverdue, isWarning } = useCountdown(dueAt);
  const isCompleted = status === "completed";
  const color = isCompleted ? "text-muted-foreground" : isOverdue ? "text-destructive" : isWarning ? "text-yellow-400" : "text-foreground";
  return <span className={`font-mono text-sm font-semibold ${color}`}>{isCompleted ? "✓" : display}</span>;
};

const StatusCell = ({ task, onComplete, onJustify, onStatusChange }: {
  task: Task;
  onComplete: (id: string) => void;
  onJustify: (task: Task) => void;
  onStatusChange?: (taskId: string, status: string) => void;
}) => {
  const { isOverdue } = useCountdown(task.due_at);
  const isCompleted = task.status === "completed";
  const effectiveStatus = isCompleted ? "completed" : isOverdue && task.status !== "overdue" ? "overdue" : task.status;
  const config = statusConfig[effectiveStatus] || statusConfig.active;
  const transitions = getStatusTransitions(task.status, isOverdue, !!task.overdue_reason);

  const handleTransition = (newStatus: string) => {
    if (newStatus === "justify") { onJustify(task); return; }
    if (newStatus === "completed") { onComplete(task.id); return; }
    onStatusChange?.(task.id, newStatus);
  };

  if (transitions.length === 0) {
    return <Badge className={`${config.badgeClass}`}>{config.label}</Badge>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto p-0">
          <Badge className={`${config.badgeClass} cursor-pointer`}>{config.label}</Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        {transitions.map((t) => (
          <DropdownMenuItem key={t.status} onClick={() => handleTransition(t.status)}>
            <t.icon className="mr-2 h-4 w-4" /> {t.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd MMM yyyy", { locale: es });
  } catch {
    return "—";
  }
};

const TasksTable = ({ tasks, profiles, onComplete, onJustify, onEdit, onDelete, onStatusChange, onPatchTask, onUpdateAssignees }: TasksTableProps) => {
  const [sortKey, setSortKey] = useState<SortKey>("due");
  const [sortAsc, setSortAsc] = useState(true);

  const profileMap = new Map(profiles.map((p) => [p.id, p.full_name || "Sin nombre"]));

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  const sorted = [...tasks].sort((a, b) => {
    let diff = 0;
    if (sortKey === "title") diff = a.title.localeCompare(b.title);
    else if (sortKey === "assigned") diff = (profileMap.get(a.assignees?.[0] || a.assigned_to) || "").localeCompare(profileMap.get(b.assignees?.[0] || b.assigned_to) || "");
    else if (sortKey === "assigned_by") diff = (profileMap.get(a.created_by) || "").localeCompare(profileMap.get(b.created_by) || "");
    else if (sortKey === "due") diff = new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    else if (sortKey === "due_date") diff = new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    else if (sortKey === "start") diff = (a.start_at ? new Date(a.start_at).getTime() : 0) - (b.start_at ? new Date(b.start_at).getTime() : 0);
    else if (sortKey === "priority") diff = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
    else if (sortKey === "task_type") diff = (a.task_type || "task").localeCompare(b.task_type || "task");
    else diff = a.status.localeCompare(b.status);
    return sortAsc ? diff : -diff;
  });

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs" onClick={() => handleSort(col)}>
      {label} <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  return (
    <div className="rounded-md border max-h-[calc(100vh-24rem)] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead><SortHeader label="Título" col="title" /></TableHead>
            <TableHead className="text-center"><SortHeader label="Tipo" col="task_type" /></TableHead>
            <TableHead className="hidden sm:table-cell"><SortHeader label="Asignado por" col="assigned_by" /></TableHead>
            <TableHead className="hidden sm:table-cell"><SortHeader label="Asignado a" col="assigned" /></TableHead>
            <TableHead className="text-center"><SortHeader label="Prioridad" col="priority" /></TableHead>
            <TableHead className="text-center"><SortHeader label="Fecha inicio" col="start" /></TableHead>
            <TableHead className="text-center"><SortHeader label="Fecha fin" col="due_date" /></TableHead>
            <TableHead className="text-center"><SortHeader label="Countdown" col="due" /></TableHead>
            <TableHead className="text-center"><SortHeader label="Estado" col="status" /></TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((task) => (
            <TableRow key={task.id}>
              <TableCell>
                <div className="font-medium text-sm">{task.title}</div>
                {task.description && <div className="text-xs text-muted-foreground truncate max-w-[200px]">{task.description}</div>}
              </TableCell>
              <TableCell className="text-center">
                {task.task_type === "milestone" ? (
                  <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 gap-1"><Diamond className="h-3 w-3" />Hito</Badge>
                ) : task.task_type === "prerequisite" ? (
                  <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 gap-1"><Link className="h-3 w-3" />Pre-req</Badge>
                ) : task.task_type === "independent" ? (
                  <Badge className="bg-muted text-muted-foreground border-border gap-1"><Unplug className="h-3 w-3" />Indep.</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <span className="text-xs text-muted-foreground">{profileMap.get(task.created_by) || "—"}</span>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <InlineAssigneeSelect
                  taskId={task.id}
                  currentAssignees={task.assignees || []}
                  profiles={profiles}
                  onUpdateAssignees={onUpdateAssignees}
                />
              </TableCell>
              <TableCell className="text-center">
                <InlinePrioritySelect
                  taskId={task.id}
                  currentPriority={task.priority}
                  onPatch={onPatchTask}
                />
              </TableCell>
              <TableCell className="text-center">
                <span className="text-xs text-muted-foreground">{formatDate(task.start_at)}</span>
              </TableCell>
              <TableCell className="text-center">
                <span className="text-xs text-muted-foreground">{formatDate(task.due_at)}</span>
              </TableCell>
              <TableCell className="text-center"><CountdownCell dueAt={task.due_at} status={task.status} /></TableCell>
              <TableCell className="text-center">
                <StatusCell task={task} onComplete={onComplete} onJustify={onJustify} onStatusChange={onStatusChange} />
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
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
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default TasksTable;
