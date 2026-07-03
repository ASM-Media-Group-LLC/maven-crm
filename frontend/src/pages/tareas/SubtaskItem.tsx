import { useState } from "react";
import { Trash2, GripVertical, ChevronDown, ChevronRight, Flag, CalendarIcon, User, Pencil, X, Check, Circle, Play, Pause, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { priorityConfig } from "./PrioritySelect";
import SubtasksPanel from "./SubtasksPanel";
import type { Subtask } from "./useSubtasks";

interface SubtaskItemProps {
  subtask: Subtask;
  profiles: { id: string; full_name: string | null }[];
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (params: { id: string; title?: string; priority?: string; due_at?: string | null; assignee_ids?: string[]; start_at?: string | null; status?: string }) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent) => void;
  index: number;
  depth?: number;
}

const statusConfig: Record<string, { label: string; className: string; icon: typeof Circle }> = {
  pending: { label: "Pendiente", className: "bg-secondary text-secondary-foreground", icon: Circle },
  in_progress: { label: "En progreso", className: "bg-primary/20 text-primary border-primary/30", icon: Play },
  paused: { label: "Pausada", className: "bg-warning/20 text-warning border-warning/30", icon: Pause },
  completed: { label: "Completada", className: "bg-success/20 text-success border-success/30", icon: CheckCircle2 },
};

const getStatusTransitions = (status: string) => {
  switch (status) {
    case "pending": return [
      { status: "in_progress", label: "Iniciar", icon: Play },
      { status: "completed", label: "Completar", icon: CheckCircle2 },
    ];
    case "in_progress": return [
      { status: "paused", label: "Pausar", icon: Pause },
      { status: "completed", label: "Completar", icon: CheckCircle2 },
    ];
    case "paused": return [
      { status: "in_progress", label: "Reanudar", icon: Play },
      { status: "completed", label: "Completar", icon: CheckCircle2 },
    ];
    default: return [];
  }
};

const SubtaskItem = ({ subtask, profiles, onStatusChange, onDelete, onUpdate, onDragStart, onDragOver, onDrop, index, depth = 0 }: SubtaskItemProps) => {
  const [childrenOpen, setChildrenOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(subtask.title);
  const [editPriority, setEditPriority] = useState(subtask.priority);
  const [editDueDate, setEditDueDate] = useState<Date | undefined>(subtask.due_at ? new Date(subtask.due_at) : undefined);
  const [editStartDate, setEditStartDate] = useState<Date | undefined>(subtask.start_at ? new Date(subtask.start_at) : undefined);
  const [editAssignedUsers, setEditAssignedUsers] = useState<string[]>(subtask.assignees || (subtask.assigned_to ? [subtask.assigned_to] : []));
  const [editAssignPopoverOpen, setEditAssignPopoverOpen] = useState(false);

  const priority = priorityConfig[subtask.priority] || priorityConfig.medium;
  const assignedProfiles = profiles.filter((p) => subtask.assignees?.includes(p.id));
  const maxDepth = 3;
  const config = statusConfig[subtask.status] || statusConfig.pending;
  const transitions = getStatusTransitions(subtask.status);

  const toggleEditUser = (userId: string) => {
    setEditAssignedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleStartEdit = () => {
    setEditTitle(subtask.title);
    setEditPriority(subtask.priority);
    setEditDueDate(subtask.due_at ? new Date(subtask.due_at) : undefined);
    setEditStartDate(subtask.start_at ? new Date(subtask.start_at) : undefined);
    setEditAssignedUsers(subtask.assignees || (subtask.assigned_to ? [subtask.assigned_to] : []));
    setEditing(true);
  };

  const handleSaveEdit = () => {
    onUpdate({
      id: subtask.id,
      title: editTitle.trim() || subtask.title,
      priority: editPriority,
      due_at: editDueDate ? editDueDate.toISOString() : null,
      start_at: editStartDate ? editStartDate.toISOString() : null,
      assignee_ids: editAssignedUsers,
    });
    setEditing(false);
  };

  const handleCancelEdit = () => setEditing(false);

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSaveEdit();
    if (e.key === "Escape") handleCancelEdit();
  };

  const StatusBadge = () => {
    const Icon = config.icon;
    if (subtask.status === "completed") {
      return (
        <Badge className={cn(config.className, "text-[10px] gap-1 cursor-default")}>
          <Icon className="h-2.5 w-2.5" />
          {config.label}
        </Badge>
      );
    }
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Badge className={cn(config.className, "text-[10px] gap-1 cursor-pointer hover:opacity-80 transition-opacity")}>
            <Icon className="h-2.5 w-2.5" />
            {config.label}
          </Badge>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px]">
          {transitions.map((t) => (
            <DropdownMenuItem key={t.status} onClick={() => onStatusChange(subtask.id, t.status)} className="text-xs gap-2">
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
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
              <Button variant="outline" size="sm" className={cn("h-6 text-[10px] px-2", !editStartDate && "text-muted-foreground")}>
                <CalendarIcon className="h-2.5 w-2.5 mr-1" />
                {editStartDate ? `Inicio: ${format(editStartDate, "dd/MM/yy")}` : "Inicio"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={editStartDate} onSelect={setEditStartDate} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-6 text-[10px] px-2", !editDueDate && "text-muted-foreground")}>
                <CalendarIcon className="h-2.5 w-2.5 mr-1" />
                {editDueDate ? `Fin: ${format(editDueDate, "dd/MM/yy")}` : "Fin"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={editDueDate} onSelect={setEditDueDate} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          {/* Multi-select assignees for edit */}
          {editAssignedUsers.length > 0 && (
            <div className="flex flex-wrap gap-0.5">
              {editAssignedUsers.map((uid) => {
                const p = profiles.find((pr) => pr.id === uid);
                return (
                  <Badge key={uid} variant="secondary" className="text-[10px] gap-0.5 h-5 pr-0.5">
                    {p?.full_name?.split(" ")[0] || "?"}
                    <button type="button" onClick={() => toggleEditUser(uid)} className="hover:text-destructive">
                      <X className="h-2 w-2" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
          {profiles.length > 0 && (
            <Popover open={editAssignPopoverOpen} onOpenChange={setEditAssignPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-6 text-[10px] px-2", editAssignedUsers.length === 0 && "text-muted-foreground")}>
                  <span className="truncate">{editAssignedUsers.length > 0 ? "+Asignar" : "Asignar"}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="start" side="bottom">
                <Command>
                  <CommandInput placeholder="Buscar usuario..." className="h-8 text-xs" />
                  <CommandList>
                    <CommandEmpty className="text-xs p-2">No encontrado</CommandEmpty>
                    <CommandGroup>
                      {profiles.slice().sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "")).map((p) => (
                        <CommandItem
                          key={p.id}
                          value={p.full_name || p.id}
                          onSelect={() => toggleEditUser(p.id)}
                          className="text-xs"
                        >
                          {p.full_name || "Sin nombre"}
                          {editAssignedUsers.includes(p.id) && <Check className="ml-auto h-3 w-3" />}
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
            {subtask.start_at && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <CalendarIcon className="h-2.5 w-2.5" />
                Inicio: {format(new Date(subtask.start_at), "dd/MM/yy")}
              </span>
            )}
            {subtask.due_at && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <CalendarIcon className="h-2.5 w-2.5" />
                Fin: {format(new Date(subtask.due_at), "dd/MM/yy")}
              </span>
            )}
            {assignedProfiles.length > 0 && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <User className="h-2.5 w-2.5" />
                {assignedProfiles.slice(0, 2).map((p) => p.full_name?.split(" ")[0]).join(", ")}
                {assignedProfiles.length > 2 && ` +${assignedProfiles.length - 2}`}
              </span>
            )}
          </div>
        </div>

        <StatusBadge />

        <div className="flex items-center gap-0.5 shrink-0">
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
