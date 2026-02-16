import { useState, useRef } from "react";
import { Plus, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubtasks } from "./useSubtasks";
import SubtaskItem from "./SubtaskItem";

interface SubtasksPanelProps {
  taskId: string;
  parentSubtaskId?: string | null;
  profiles?: { id: string; full_name: string | null }[];
  depth?: number;
}

const SubtasksPanel = ({ taskId, parentSubtaskId, profiles: externalProfiles, depth = 0 }: SubtasksPanelProps) => {
  const { user } = useAuth();
  const { subtasks, createSubtask, updateSubtaskStatus, updateSubtaskFields, deleteSubtask, reorderSubtasks } = useSubtasks(taskId, parentSubtaskId);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newDueDate, setNewDueDate] = useState<Date | undefined>(undefined);
  const [newAssignedTo, setNewAssignedTo] = useState("");
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Fetch profiles internally if not provided
  const { data: myProfile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("id, company_id, full_name")
        .eq("id", user.id)
        .single();
      return data;
    },
    enabled: !!user && !externalProfiles,
  });

  const { data: fetchedProfiles = [] } = useQuery({
    queryKey: ["company-profiles", myProfile?.company_id],
    queryFn: async () => {
      if (myProfile?.company_id) {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("company_id", myProfile.company_id);
        return data || [];
      }
      return myProfile ? [{ id: myProfile.id, full_name: myProfile.full_name }] : [];
    },
    enabled: !!myProfile && !externalProfiles,
  });

  const profiles = externalProfiles || fetchedProfiles;

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    createSubtask.mutate({
      title: newTitle.trim(),
      priority: newPriority,
      due_at: newDueDate ? newDueDate.toISOString() : null,
      assigned_to: newAssignedTo || null,
    });
    setNewTitle("");
    setNewPriority("medium");
    setNewDueDate(undefined);
    setNewAssignedTo("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleDragStart = (_e: React.DragEvent, index: number) => {
    dragIndex.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = () => {
    if (dragIndex.current === null || dragOverIndex === null || dragIndex.current === dragOverIndex) {
      dragIndex.current = null;
      setDragOverIndex(null);
      return;
    }
    const reordered = [...subtasks];
    const [moved] = reordered.splice(dragIndex.current, 1);
    reordered.splice(dragOverIndex, 0, moved);
    reorderSubtasks.mutate(reordered.map(s => s.id));
    dragIndex.current = null;
    setDragOverIndex(null);
  };

  const completedCount = subtasks.filter(s => s.status === "completed").length;

  return (
    <div className="space-y-2">
      {subtasks.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {completedCount}/{subtasks.length} completadas
        </p>
      )}

      <div className="space-y-1.5">
        {subtasks.map((subtask, i) => (
          <SubtaskItem
            key={subtask.id}
            subtask={subtask}
            profiles={profiles}
            index={i}
            depth={depth}
            onStart={(id) => updateSubtaskStatus.mutate({ id, status: "in_progress" })}
            onComplete={(id) => updateSubtaskStatus.mutate({ id, status: "completed" })}
            onDelete={(id) => deleteSubtask.mutate(id)}
            onUpdate={(params) => updateSubtaskFields.mutate(params)}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        ))}
      </div>

      {/* Creation form — all fields always visible */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Input
          placeholder="Nueva subtarea..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-7 text-xs flex-1 min-w-[120px]"
        />

        <Select value={newPriority} onValueChange={setNewPriority}>
          <SelectTrigger className="h-7 text-[10px] w-[85px] shrink-0">
            <SelectValue />
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
            <Button variant="outline" size="sm" className={cn("h-7 text-[10px] px-2 shrink-0", !newDueDate && "text-muted-foreground")}>
              <CalendarIcon className="h-2.5 w-2.5 mr-1" />
              {newDueDate ? format(newDueDate, "dd/MM/yy") : "Fecha"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={newDueDate} onSelect={setNewDueDate} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        {profiles.length > 0 && (
          <Select value={newAssignedTo || "__none__"} onValueChange={(v) => setNewAssignedTo(v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-7 text-[10px] w-[100px] shrink-0">
              <SelectValue placeholder="Asignar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sin asignar</SelectItem>
              {profiles.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.full_name || "Sin nombre"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={handleAdd}
          disabled={!newTitle.trim() || createSubtask.isPending}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};

export default SubtasksPanel;
