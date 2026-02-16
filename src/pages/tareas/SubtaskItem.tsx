import { useState } from "react";
import { Play, CheckCircle2, Trash2, GripVertical, ChevronDown, ChevronRight, Flag, CalendarIcon, User, Pencil, X, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
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
  onUpdate: (params: { id: string; title?: string; priority?: string; due_at?: string | null; assigned_to?: string | null }) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent) => void;
  index: number;
  depth?: number;
}

const SubtaskItem = ({ subtask, profiles, onStart, onComplete, onDelete, onUpdate, onDragStart, onDragOver, onDrop, index, depth = 0 }: SubtaskItemProps) => {
  const [childrenOpen, setChildrenOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(subtask.title);
  const [editPriority, setEditPriority] = useState(subtask.priority);
  const [editDueDate, setEditDueDate] = useState<Date | undefined>(subtask.due_at ? new Date(subtask.due_at) : undefined);
  const [editAssignedTo, setEditAssignedTo] = useState(subtask.assigned_to || "");
  const [editAssignPopoverOpen, setEditAssignPopoverOpen] = useState(false);

  const priority = priorityConfig[subtask.priority] || priorityConfig.medium;
  const assignedProfile = profiles.find(p => p.id === subtask.assigned_to);
  const editAssignedName = profiles.find(p => p.id === editAssignedTo)?.full_name || "";
  const maxDepth = 3;

  const handleStartEdit = () => {
    setEditTitle(subtask.title);
    setEditPriority(subtask.priority);
    setEditDueDate(subtask.due_at ? new Date(subtask.due_at) : undefined);
    setEditAssignedTo(subtask.assigned_to || "");
    setEditing(true);
  };

  const handleSaveEdit = () => {
    onUpdate({
      id: subtask.id,
      title: editTitle.trim() || subtask.title,
      priority: editPriority,
      due_at: editDueDate ? editDueDate.toISOString() : null,
      assigned_to: editAssignedTo || null,
    });
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSaveEdit();
    if (e.key === "Escape") handleCancelEdit();
  };

  const statusBadge = () => {
    if (subtask.status === "completed") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">Completada</Badge>;
    if (subtask.status === "in_progress") return <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">En progreso</Badge>;
    return <Badge variant="secondary" className="text-[10px]">Pendiente</Badge>;
  };

  if (editing) {
    return (
      <div
        className="space-y-1.5 p-2 rounded-md border border-primary/30 bg-card"
        style={{ marginLeft: depth > 0 ? `${depth * 16}px` : undefined }}
      >
        <div className="flex items-center gap-1.5">
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleEditKeyDown}
            className="h-7 text-xs flex-1"
            autoFocus
          />
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleSaveEdit} title="Guardar">
            <Check className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCancelEdit} title="Cancelar">
            <X className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Select value={editPriority || undefined} onValueChange={setEditPriority}>
            <SelectTrigger className="h-6 text-[10px] w-[85px]">
              <SelectValue placeholder="Prioridad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Baja</SelectItem>
              <SelectItem value="medium">Media</SelectItem>
              <SelectItem value="high">Alta</SelectItem>
              <SelectItem value="urgent">Urgente</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-6 text-[10px] px-2", !editDueDate && "text-muted-foreground")}>
                <CalendarIcon className="h-2.5 w-2.5 mr-1" />
                {editDueDate ? format(editDueDate, "dd/MM/yy") : "Fecha"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={editDueDate} onSelect={setEditDueDate} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          {profiles.length > 0 && (
            <Popover open={editAssignPopoverOpen} onOpenChange={setEditAssignPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-6 text-[10px] px-2 w-[100px] justify-start", !editAssignedTo && "text-muted-foreground")}>
                  <span className="truncate">{editAssignedTo ? editAssignedName || "Asignar" : "Asignar"}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar usuario..." className="h-8 text-xs" />
                  <CommandList>
                    <CommandEmpty className="text-xs p-2">No encontrado</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__none__"
                        onSelect={() => { setEditAssignedTo(""); setEditAssignPopoverOpen(false); }}
                        className="text-xs"
                      >
                        Sin asignar
                      </CommandItem>
                      {profiles.map(p => (
                        <CommandItem
                          key={p.id}
                          value={p.full_name || p.id}
                          onSelect={() => { setEditAssignedTo(p.id); setEditAssignPopoverOpen(false); }}
                          className="text-xs"
                        >
                          {p.full_name || "Sin nombre"}
                          {editAssignedTo === p.id && <Check className="ml-auto h-3 w-3" />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    );
  }

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
          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={handleStartEdit} title="Editar">
            <Pencil className="h-3 w-3" />
          </Button>
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
