import { useState, useMemo } from "react";
import { useRoadmap, RoadmapCategory, RoadmapItem } from "./useRoadmap";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronRight, Plus, Trash2, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_CYCLE = ["todo", "in_progress", "done", "blocked"] as const;

const statusConfig: Record<string, { label: string; color: string }> = {
  done: { label: "Done", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  in_progress: { label: "In Progress", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  todo: { label: "To Do", color: "bg-muted text-muted-foreground border-border" },
  blocked: { label: "Blocked", color: "bg-destructive/20 text-destructive border-destructive/30" },
};

const RoadmapContent = () => {
  const { categories, items, isLoading, updateItemStatus, addItem, deleteItem, addCategory, deleteCategory } = useRoadmap();
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newItemInputs, setNewItemInputs] = useState<Record<string, string>>({});

  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => i.status === "done").length;
    const inProgress = items.filter((i) => i.status === "in_progress").length;
    const todo = items.filter((i) => i.status === "todo").length;
    const blocked = items.filter((i) => i.status === "blocked").length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, inProgress, todo, blocked, percent };
  }, [items]);

  const handleToggleCheck = (item: RoadmapItem) => {
    const newStatus = item.status === "done" ? "todo" : "done";
    updateItemStatus.mutate({ id: item.id, status: newStatus });
  };

  const handleCycleStatus = (item: RoadmapItem) => {
    const idx = STATUS_CYCLE.indexOf(item.status as any);
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    updateItemStatus.mutate({ id: item.id, status: next });
  };

  const handleAddItem = (categoryId: string) => {
    const task = newItemInputs[categoryId]?.trim();
    if (!task) return;
    addItem.mutate({ category_id: categoryId, task });
    setNewItemInputs((prev) => ({ ...prev, [categoryId]: "" }));
  };

  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    addCategory.mutate(name);
    setNewCategoryName("");
  };

  if (isLoading) {
    return (
      <div className="h-screen overflow-hidden flex flex-col">
        <div className="shrink-0 bg-background border-b border-border px-6 py-4">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      </div>
    );
  }

  const getCategoryItems = (catId: string) => items.filter((i) => i.category_id === catId);

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      {/* Header */}
      <div className="shrink-0 bg-background border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Project Roadmap</h1>
            <p className="text-sm text-muted-foreground mt-1">Progreso de construcción de la plataforma MAVEN</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Progress card */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Progreso General</h2>
            <span className="text-2xl font-bold text-primary">{stats.percent}%</span>
          </div>
          <Progress value={stats.percent} className="h-3 mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "hsl(var(--chart-2))" }} />
              <span className="text-muted-foreground">Done</span>
              <span className="font-semibold text-foreground">{stats.done}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "hsl(var(--chart-4))" }} />
              <span className="text-muted-foreground">In Progress</span>
              <span className="font-semibold text-foreground">{stats.inProgress}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="h-3 w-3 rounded-full bg-muted-foreground" />
              <span className="text-muted-foreground">To Do</span>
              <span className="font-semibold text-foreground">{stats.todo}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="h-3 w-3 rounded-full bg-destructive" />
              <span className="text-muted-foreground">Blocked</span>
              <span className="font-semibold text-foreground">{stats.blocked}</span>
            </div>
          </div>
        </div>

        {/* Categories */}
        {categories.map((cat) => {
          const catItems = getCategoryItems(cat.id);
          const catDone = catItems.filter((i) => i.status === "done").length;
          const catPercent = catItems.length > 0 ? Math.round((catDone / catItems.length) * 100) : 0;

          return (
            <Collapsible key={cat.id} defaultOpen>
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left group">
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90" />
                    <span className="font-semibold text-foreground flex-1">{cat.name}</span>
                    <span className="text-xs text-muted-foreground mr-2">
                      {catDone}/{catItems.length} tasks
                    </span>
                    <div className="w-20">
                      <Progress value={catPercent} className="h-1.5" />
                    </div>
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="border-t border-border">
                    {catItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors group/row"
                      >
                        <Checkbox
                          checked={item.status === "done"}
                          onCheckedChange={() => handleToggleCheck(item)}
                          className="shrink-0"
                        />
                        {item.submodule && (
                          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded shrink-0">
                            {item.submodule}
                          </span>
                        )}
                        <span className={`flex-1 text-sm ${item.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {item.task}
                        </span>
                        <Badge
                          variant="outline"
                          className={`cursor-pointer text-[10px] px-2 py-0.5 ${statusConfig[item.status]?.color || statusConfig.todo.color}`}
                          onClick={() => handleCycleStatus(item)}
                        >
                          {statusConfig[item.status]?.label || "To Do"}
                        </Badge>
                        <button
                          onClick={() => deleteItem.mutate(item.id)}
                          className="opacity-0 group-hover/row:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}

                    {/* Add item inline */}
                    <div className="flex items-center gap-2 px-4 py-2 border-t border-border bg-muted/20">
                      <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Input
                        placeholder="Agregar tarea..."
                        value={newItemInputs[cat.id] || ""}
                        onChange={(e) => setNewItemInputs((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && handleAddItem(cat.id)}
                        className="h-8 text-sm border-0 bg-transparent focus-visible:ring-0 px-0"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAddItem(cat.id)}
                        disabled={!newItemInputs[cat.id]?.trim()}
                        className="h-7 text-xs shrink-0"
                      >
                        Añadir
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}

        {/* Add category */}
        <div className="flex items-center gap-2">
          <Input
            placeholder="Nueva categoría..."
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
            className="max-w-xs"
          />
          <Button variant="outline" size="sm" onClick={handleAddCategory} disabled={!newCategoryName.trim()}>
            <Plus className="h-4 w-4 mr-1" />
            Categoría
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RoadmapContent;
