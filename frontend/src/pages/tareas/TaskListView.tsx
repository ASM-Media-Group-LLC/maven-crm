import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Plus, User, CalendarIcon, Flag, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import TaskListRow from "./TaskListRow";
import type { Task } from "./useTareas";

interface TaskListViewProps {
  tasks: Task[];
  profiles: { id: string; full_name: string | null }[];
  onComplete: (id: string) => void;
  onJustify: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onCreateNew: () => void;
  onStatusChange?: (taskId: string, status: string) => void;
  onPatchTask: (taskId: string, fields: Record<string, any>) => void;
  onUpdateAssignees: (taskId: string, assigneeIds: string[]) => void;
}

interface StatusGroup {
  key: string;
  label: string;
  color: string;
  badgeClass: string;
  tasks: Task[];
}

const TaskListView = ({ tasks, profiles, onComplete, onJustify, onEdit, onDelete, onCreateNew, onStatusChange, onPatchTask, onUpdateAssignees }: TaskListViewProps) => {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    overdue: true,
    pending: true,
    in_progress: true,
    paused: true,
    completed: false,
  });

  const now = Date.now();

  const groups: StatusGroup[] = useMemo(() => {
    const overdue: Task[] = [];
    const pending: Task[] = [];
    const inProgress: Task[] = [];
    const paused: Task[] = [];
    const completed: Task[] = [];

    tasks.forEach((t) => {
      if (t.status === "completed") {
        completed.push(t);
      } else if (new Date(t.due_at).getTime() <= now) {
        overdue.push(t);
      } else if (t.status === "in_progress") {
        inProgress.push(t);
      } else if (t.status === "paused") {
        paused.push(t);
      } else {
        pending.push(t);
      }
    });

    return [
      {
        key: "overdue",
        label: "VENCIDAS",
        color: "text-destructive",
        badgeClass: "bg-destructive/20 text-destructive border-destructive/30",
        tasks: overdue,
      },
      {
        key: "pending",
        label: "PENDIENTES",
        color: "text-primary",
        badgeClass: "bg-primary/20 text-primary border-primary/30",
        tasks: pending,
      },
      {
        key: "in_progress",
        label: "EN CURSO",
        color: "text-blue-400",
        badgeClass: "bg-blue-500/20 text-blue-400 border-blue-500/30",
        tasks: inProgress,
      },
      {
        key: "paused",
        label: "PAUSADAS",
        color: "text-yellow-400",
        badgeClass: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
        tasks: paused,
      },
      {
        key: "completed",
        label: "COMPLETADAS",
        color: "text-emerald-400",
        badgeClass: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
        tasks: completed,
      },
    ].filter(g => g.tasks.length > 0);
  }, [tasks, now]);

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_110px_120px_110px_80px_80px_100px_40px] items-center px-3 py-2 gap-2 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
        <span className="pl-8">Nombre</span>
        <span className="flex items-center gap-1"><User className="h-3 w-3" /> Asignado por</span>
        <span className="flex items-center gap-1"><User className="h-3 w-3" /> Asignado a</span>
        <span className="flex items-center gap-1"><Flag className="h-3 w-3" /> Prioridad</span>
        <span className="flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> Inicio</span>
        <span className="flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> Fin</span>
        <span className="flex items-center gap-1 justify-end"><Clock className="h-3 w-3" /> Tiempo</span>
        <span></span>
      </div>

      {/* Status groups */}
      {groups.map((group) => (
        <Collapsible
          key={group.key}
          open={openSections[group.key] ?? true}
          onOpenChange={() => toggleSection(group.key)}
        >
          {/* Group header */}
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1.5">
                {(openSections[group.key] ?? true) ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                <span className={`text-xs font-bold tracking-wide ${group.color}`}>
                  {group.label}
                </span>
                <Badge className={`${group.badgeClass} text-[10px] px-1.5 py-0 ml-1`}>
                  {group.tasks.length}
                </Badge>
              </Button>
            </CollapsibleTrigger>

            {group.key !== "completed" && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCreateNew}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* Group rows */}
          <CollapsibleContent>
            {group.tasks.map((task) => (
              <TaskListRow
                key={task.id}
                task={task}
                profiles={profiles}
                onComplete={onComplete}
                onJustify={onJustify}
                onEdit={onEdit}
                onDelete={onDelete}
                onStatusChange={onStatusChange}
                onPatchTask={onPatchTask}
                onUpdateAssignees={onUpdateAssignees}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      ))}

      {/* Empty state */}
      {groups.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">No hay tareas aún.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onCreateNew}>
            <Plus className="h-4 w-4 mr-1" /> Crear primera tarea
          </Button>
        </div>
      )}
    </div>
  );
};

export default TaskListView;
