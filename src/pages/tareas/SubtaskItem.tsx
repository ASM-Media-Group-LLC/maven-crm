import { useState } from "react";
import { Play, CheckCircle2, Trash2, GripVertical, ChevronDown, ChevronRight, Flag, CalendarIcon, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { format } from "date-fns";
import { priorityConfig } from "./PrioritySelect";
import SubtasksPanel from "./SubtasksPanel";
import type { Subtask } from "./useSubtasks";

interface SubtaskItemProps {
  subtask: Subtask;
  profiles: { id: string; full_name: string | null }[];
  onStart: (id: string) => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent) => void;
  index: number;
  depth?: number;
}

const SubtaskItem = ({ subtask, profiles, onStart, onComplete, onDelete, onDragStart, onDragOver, onDrop, index, depth = 0 }: SubtaskItemProps) => {
  const [childrenOpen, setChildrenOpen] = useState(false);
  const priority = priorityConfig[subtask.priority] || priorityConfig.medium;
  const assignedProfile = profiles.find(p => p.id === subtask.assigned_to);
  const maxDepth = 3;

  const statusBadge = () => {
    if (subtask.status === "completed") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">Completada</Badge>;
    if (subtask.status === "in_progress") return <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">En progreso</Badge>;
    return <Badge variant="secondary" className="text-[10px]">Pendiente</Badge>;
  };

  return (
    <div className="space-y-1">
      <div
        draggable
        onDragStart={(e) => onDragStart(e, index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDrop={onDrop}
        className="flex items-center gap-2 p-2 rounded-md border bg-card hover:border-primary/20 transition-colors group"
        style={{ marginLeft: depth > 0 ? `${depth * 16}px` : undefined }}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Flag className={`h-2.5 w-2.5 ${priority.color} shrink-0`} />
            <p className={`text-xs font-medium truncate ${subtask.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
              {subtask.title}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {subtask.due_at && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <CalendarIcon className="h-2.5 w-2.5" />
                {format(new Date(subtask.due_at), "dd/MM/yy")}
              </span>
            )}
            {assignedProfile && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <User className="h-2.5 w-2.5" />
                {assignedProfile.full_name || "Sin nombre"}
              </span>
            )}
            {subtask.started_at && (
              <span className="text-[10px] text-muted-foreground">
                Inicio: {format(new Date(subtask.started_at), "dd/MM HH:mm")}
              </span>
            )}
            {subtask.completed_at && (
              <span className="text-[10px] text-muted-foreground">
                Fin: {format(new Date(subtask.completed_at), "dd/MM HH:mm")}
              </span>
            )}
          </div>
        </div>

        {statusBadge()}

        <div className="flex items-center gap-0.5 shrink-0">
          {subtask.status === "pending" && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onStart(subtask.id)} title="Iniciar">
              <Play className="h-3 w-3" />
            </Button>
          )}
          {subtask.status === "in_progress" && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onComplete(subtask.id)} title="Completar">
              <CheckCircle2 className="h-3 w-3" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100" onClick={() => onDelete(subtask.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Nested subtasks */}
      {depth < maxDepth && (
        <Collapsible open={childrenOpen} onOpenChange={setChildrenOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[10px] text-muted-foreground px-1 ml-4"
              style={{ marginLeft: `${(depth + 1) * 16}px` }}
            >
              {childrenOpen ? <ChevronDown className="h-2.5 w-2.5 mr-0.5" /> : <ChevronRight className="h-2.5 w-2.5 mr-0.5" />}
              Sub-subtareas
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SubtasksPanel
              taskId={subtask.task_id}
              parentSubtaskId={subtask.id}
              profiles={profiles}
              depth={depth + 1}
            />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};

export default SubtaskItem;
