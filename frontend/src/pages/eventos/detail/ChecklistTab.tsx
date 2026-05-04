import { useState } from "react";
import { Plus, Trash2, Check, Circle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useEventChecklist,
  useAddChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
} from "../useEventoDetail";

const statusLabel: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En progreso",
  completed: "Completado",
};

const statusIcon: Record<string, React.ElementType> = {
  pending: Circle,
  in_progress: Loader2,
  completed: Check,
};

const statusVariant: Record<string, "secondary-soft" | "warning-soft" | "success-soft"> = {
  pending: "secondary-soft",
  in_progress: "warning-soft",
  completed: "success-soft",
};

interface Props {
  eventId: string;
}

const ChecklistTab = ({ eventId }: Props) => {
  const { toast } = useToast();
  const [newTitle, setNewTitle] = useState("");
  const { data: items = [], isLoading } = useEventChecklist(eventId);
  const addItem = useAddChecklistItem();
  const updateItem = useUpdateChecklistItem();
  const deleteItem = useDeleteChecklistItem();

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    try {
      await addItem.mutateAsync({ event_id: eventId, title: newTitle.trim() });
      setNewTitle("");
    } catch {
      toast({ title: "Error al agregar item", variant: "destructive" });
    }
  };

  const completedCount = items.filter((i: any) => i.status === "completed").length;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: items.length ? `${(completedCount / items.length) * 100}%` : "0%" }}
          />
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {completedCount}/{items.length}
        </span>
      </div>

      {/* Add */}
      <div className="flex gap-2">
        <Input
          placeholder="Nuevo item…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="flex-1"
        />
        <Button variant="outline" size="icon" onClick={handleAdd} disabled={!newTitle.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-4">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No hay items en el checklist</p>
      ) : (
        <div className="space-y-1">
          {items.map((item: any) => {
            const Icon = statusIcon[item.status] ?? Circle;
            return (
              <div key={item.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 group">
                <Icon className={`h-4 w-4 shrink-0 ${item.status === "completed" ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`flex-1 text-sm ${item.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                  {item.title}
                </span>
                {item.assigned_to && (
                  <span className="text-[10px] text-muted-foreground">{item.assigned_to}</span>
                )}
                <Select
                  value={item.status}
                  onValueChange={(val) => updateItem.mutate({ id: item.id, data: { status: val } })}
                >
                  <SelectTrigger className="h-7 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabel).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100"
                  onClick={() => deleteItem.mutate(item.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ChecklistTab;
