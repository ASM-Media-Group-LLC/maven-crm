import { useState, useRef } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSubtasks } from "./useSubtasks";
import SubtaskItem from "./SubtaskItem";

interface SubtasksPanelProps {
  taskId: string;
}

const SubtasksPanel = ({ taskId }: SubtasksPanelProps) => {
  const { subtasks, createSubtask, updateSubtaskStatus, deleteSubtask, reorderSubtasks } = useSubtasks(taskId);
  const [newTitle, setNewTitle] = useState("");
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    createSubtask.mutate(newTitle.trim());
    setNewTitle("");
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
            index={i}
            onStart={(id) => updateSubtaskStatus.mutate({ id, status: "in_progress" })}
            onComplete={(id) => updateSubtaskStatus.mutate({ id, status: "completed" })}
            onDelete={(id) => deleteSubtask.mutate(id)}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <Input
          placeholder="Nueva subtarea..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-7 text-xs"
        />
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
