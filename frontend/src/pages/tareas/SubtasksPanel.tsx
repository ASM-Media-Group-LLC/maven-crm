import { useState, useRef } from "react";
import { Plus, CalendarIcon, Check, X } from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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
  const [newPriority, setNewPriority] = useState("");
  const [newDueDate, setNewDueDate] = useState<Date | undefined>(undefined);
  const [newStartDate, setNewStartDate] = useState<Date | undefined>(undefined);
  const [newAssignedUsers, setNewAssignedUsers] = useState<string[]>([]);
  const [assignPopoverOpen, setAssignPopoverOpen] = useState(false);
  const [startCalOpen, setStartCalOpen] = useState(false);
  const [endCalOpen, setEndCalOpen] = useState(false);
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
      let query = supabase.from("profiles").select("id, full_name");
      if (myProfile?.company_id) {
        query = query.or(`company_id.eq.${myProfile.company_id},company_id.is.null`);
      }
      const { data } = await query;
      return data || [];
    },
    enabled: !!myProfile && !externalProfiles,
  });

  const profiles = externalProfiles || fetchedProfiles;

  const toggleUser = (userId: string) => {
    setNewAssignedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    createSubtask.mutate({
      title: newTitle.trim(),
      priority: newPriority || "medium",
      due_at: newDueDate ? newDueDate.toISOString() : null,
      start_at: newStartDate ? newStartDate.toISOString() : null,
      assignee_ids: newAssignedUsers.length > 0 ? newAssignedUsers : undefined,
    });
    setNewTitle("");
    setNewPriority("");
    setNewDueDate(undefined);
    setNewStartDate(undefined);
    setNewAssignedUsers([]);
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
    reorderSubtasks.mutate(reordered.map((s) => s.id));
    dragIndex.current = null;
    setDragOverIndex(null);
  };

  const completedCount = subtasks.filter((s) => s.status === "completed").length;

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
            onStatusChange={(id, status) => updateSubtaskStatus.mutate({ id, status })}
            onDelete={(id) => deleteSubtask.mutate(id)}
            onUpdate={(params) => updateSubtaskFields.mutate(params)}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        ))}
      </div>

      {/* Creation form */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Nueva subtarea..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-9 text-sm flex-1 min-w-[180px]"
        />

        <Select value={newPriority || undefined} onValueChange={setNewPriority}>
          <SelectTrigger className="h-8 text-xs w-[90px] shrink-0">
            <SelectValue placeholder="Prioridad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Baja</SelectItem>
            <SelectItem value="medium">Media</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="urgent">Urgente</SelectItem>
          </SelectContent>
        </Select>

        <Popover open={startCalOpen} onOpenChange={setStartCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-8 text-xs px-2 shrink-0", !newStartDate && "text-muted-foreground")}>
              <CalendarIcon className="h-3 w-3 mr-1" />
              {newStartDate ? format(newStartDate, "dd/MM/yy") : "Inicio"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={newStartDate} onSelect={(d) => { setNewStartDate(d); setStartCalOpen(false); }} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        <Popover open={endCalOpen} onOpenChange={setEndCalOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-8 text-xs px-2 shrink-0", !newDueDate && "text-muted-foreground")}>
              <CalendarIcon className="h-3 w-3 mr-1" />
              {newDueDate ? format(newDueDate, "dd/MM/yy") : "Fin"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={newDueDate} onSelect={(d) => { setNewDueDate(d); setEndCalOpen(false); }} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        {profiles.length > 0 && (
          <>
            {newAssignedUsers.length > 0 && (
              <div className="flex flex-wrap gap-0.5">
                {newAssignedUsers.map((uid) => {
                  const p = profiles.find((pr) => pr.id === uid);
                  return (
                    <Badge key={uid} variant="secondary" className="text-[10px] gap-0.5 h-6 pr-0.5">
                      {p?.full_name?.split(" ")[0] || "?"}
                      <button type="button" onClick={() => toggleUser(uid)} className="hover:text-destructive">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
            <Popover open={assignPopoverOpen} onOpenChange={setAssignPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 text-xs px-2 shrink-0", newAssignedUsers.length === 0 && "text-muted-foreground")}>
                  <span className="truncate">{newAssignedUsers.length > 0 ? `+Asignar` : "Asignar"}</span>
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
                          onSelect={() => toggleUser(p.id)}
                          className="text-xs"
                        >
                          {p.full_name || "Sin nombre"}
                          {newAssignedUsers.includes(p.id) && <Check className="ml-auto h-3 w-3" />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
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
