import { useState, useMemo, useRef, useEffect } from "react";
import { useRoadmap, RoadmapItem } from "./useRoadmap";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, Plus, Trash2, CalendarIcon, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, startOfWeek, addWeeks, isWithinInterval, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

const STATUS_CYCLE = ["todo", "in_progress", "done", "blocked"] as const;

const statusConfig: Record<string, { label: string; color: string }> = {
  done: { label: "Done", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  in_progress: { label: "In Progress", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  todo: { label: "To Do", color: "bg-muted text-muted-foreground border-border" },
  blocked: { label: "Blocked", color: "bg-destructive/20 text-destructive border-destructive/30" },
};

const RoadmapContent = () => {
  const { categories, items, isLoading, updateItemStatus, updateDeliveryDate, updateItem, updateCategory, addItem, deleteItem, addCategory, deleteCategory } = useRoadmap();
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newItemInputs, setNewItemInputs] = useState<Record<string, string>>({});
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<{ id: string; field: "task" | "submodule" | "description" } | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const catEditRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCategoryId) catEditRef.current?.focus();
  }, [editingCategoryId]);

  useEffect(() => {
    if (editingField?.field === "description") editTextareaRef.current?.focus();
    else if (editingField) editInputRef.current?.focus();
  }, [editingField]);

  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => i.status === "done").length;
    const inProgress = items.filter((i) => i.status === "in_progress").length;
    const todo = items.filter((i) => i.status === "todo").length;
    const blocked = items.filter((i) => i.status === "blocked").length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, inProgress, todo, blocked, percent };
  }, [items]);

  // Calculate 8 weeks for timeline
  const weeks = useMemo(() => {
    const dates = items.map((i) => new Date(i.created_at)).filter((d) => !isNaN(d.getTime()));
    const earliest = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : new Date();
    const weekStart = startOfWeek(earliest, { weekStartsOn: 1 });
    return Array.from({ length: 8 }, (_, i) => {
      const start = addWeeks(weekStart, i);
      const end = addWeeks(start, 1);
      return { start, end, label: `W${i + 1}`, sub: format(start, "MMM d") };
    });
  }, [items]);

  const isWeekActive = (item: RoadmapItem, weekStart: Date, weekEnd: Date) => {
    if (item.status === "done" && item.completed_at) {
      const start = parseISO(item.created_at);
      const end = parseISO(item.completed_at);
      return weekStart < end && weekEnd > start;
    }
    if (item.status === "in_progress") {
      const start = parseISO(item.created_at);
      const now = new Date();
      return weekStart < now && weekEnd > start;
    }
    if (item.status === "todo" && item.delivery_date) {
      const delivery = parseISO(item.delivery_date);
      return isWithinInterval(delivery, { start: weekStart, end: weekEnd });
    }
    return false;
  };

  const getWeekBarColor = (item: RoadmapItem) => {
    if (item.status === "done") return "bg-emerald-500";
    if (item.status === "in_progress") return "bg-amber-500";
    if (item.status === "blocked") return "bg-destructive";
    return "bg-muted-foreground/40";
  };

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
  const handleDeliveryDateChange = (itemId: string, date: Date | undefined) => {
    updateDeliveryDate.mutate({
      id: itemId,
      delivery_date: date ? format(date, "yyyy-MM-dd") : null,
    });
  };

  const startEditCategory = (catId: string, name: string) => {
    setEditingCategoryId(catId);
    setEditValue(name);
  };

  const commitCategoryEdit = () => {
    if (editingCategoryId && editValue.trim()) {
      updateCategory.mutate({ id: editingCategoryId, name: editValue.trim() });
    }
    setEditingCategoryId(null);
  };

  const startEditField = (id: string, field: "task" | "submodule" | "description", value: string) => {
    setEditingField({ id, field });
    setEditValue(value);
  };

  const commitFieldEdit = () => {
    if (editingField) {
      const val = editValue.trim();
      const data: any = {};
      if (editingField.field === "submodule") {
        data.submodule = val || null;
      } else {
        data[editingField.field] = val;
      }
      if (editingField.field !== "task" || val) {
        updateItem.mutate({ id: editingField.id, data });
      }
    }
    setEditingField(null);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditingCategoryId(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, commit: () => void) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
    if (e.key === "Escape") cancelEdit();
  };

  if (isLoading) {
    return (
      <div className="h-screen overflow-hidden flex flex-col">
        <div className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 py-4">
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
      <div className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 py-4">
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

        {/* Categories with table layout */}
        {categories.map((cat) => {
          const catItems = getCategoryItems(cat.id);
          const catDone = catItems.filter((i) => i.status === "done").length;
          const catPercent = catItems.length > 0 ? Math.round((catDone / catItems.length) * 100) : 0;

          return (
            <Collapsible key={cat.id} defaultOpen>
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left group">
                  <CollapsibleTrigger asChild>
                    <button className="shrink-0">
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90" />
                    </button>
                  </CollapsibleTrigger>
                  {editingCategoryId === cat.id ? (
                    <Input
                      ref={catEditRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitCategoryEdit}
                      onKeyDown={(e) => handleEditKeyDown(e, commitCategoryEdit)}
                      className="h-7 text-sm font-semibold flex-1"
                    />
                  ) : (
                    <span
                      className="font-semibold text-foreground flex-1 cursor-pointer"
                      onDoubleClick={() => startEditCategory(cat.id, cat.name)}
                    >
                      {cat.name}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground mr-2">
                    {catDone}/{catItems.length} tasks
                  </span>
                  <div className="w-20">
                    <Progress value={catPercent} className="h-1.5" />
                  </div>
                  <button
                    onClick={() => deleteCategory.mutate(cat.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <CollapsibleContent>
                  <div className="border-t border-border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-10" />
                          <TableHead className="min-w-[100px]">Submodule</TableHead>
                          <TableHead className="min-w-[200px]">Task</TableHead>
                          <TableHead className="min-w-[100px]">Status</TableHead>
                          <TableHead className="min-w-[100px]">Delivery</TableHead>
                          {weeks.map((w) => (
                            <TableHead key={w.label} className="w-14 text-center px-1">
                              <div className="text-[10px] font-semibold">{w.label}</div>
                              <div className="text-[9px] text-muted-foreground font-normal">{w.sub}</div>
                            </TableHead>
                          ))}
                          <TableHead className="w-8" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {catItems.map((item) => (
                          <TableRow key={item.id} className="group/row">
                            <TableCell className="py-2 px-3">
                              <Checkbox
                                checked={item.status === "done"}
                                onCheckedChange={() => handleToggleCheck(item)}
                              />
                            </TableCell>
                            <TableCell className="py-2">
                              {editingField?.id === item.id && editingField.field === "submodule" ? (
                                <Input
                                  ref={editInputRef}
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={commitFieldEdit}
                                  onKeyDown={(e) => handleEditKeyDown(e, commitFieldEdit)}
                                  className="h-6 text-xs w-24"
                                  placeholder="Submodule"
                                />
                              ) : (
                                <span
                                  className={cn(
                                    "text-xs cursor-pointer px-2 py-0.5 rounded",
                                    item.submodule ? "font-medium text-muted-foreground bg-muted" : "text-muted-foreground/50"
                                  )}
                                  onClick={() => startEditField(item.id, "submodule", item.submodule || "")}
                                >
                                  {item.submodule || "—"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-2">
                              <div className="flex items-center gap-1">
                                {editingField?.id === item.id && editingField.field === "task" ? (
                                  <Input
                                    ref={editInputRef}
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={commitFieldEdit}
                                    onKeyDown={(e) => handleEditKeyDown(e, commitFieldEdit)}
                                    className="h-6 text-sm flex-1"
                                  />
                                ) : (
                                  <span
                                    className={cn(
                                      "text-sm cursor-pointer flex-1",
                                      item.status === "done" ? "line-through text-muted-foreground" : "text-foreground"
                                    )}
                                    onDoubleClick={() => startEditField(item.id, "task", item.task)}
                                  >
                                    {item.task}
                                  </span>
                                )}
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button className={cn(
                                      "shrink-0 transition-opacity",
                                      item.description ? "text-muted-foreground" : "opacity-0 group-hover/row:opacity-100 text-muted-foreground/50"
                                    )}>
                                      <FileText className="h-3.5 w-3.5" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-72 p-3" align="start">
                                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Descripción</p>
                                    <Textarea
                                      value={editingField?.id === item.id && editingField.field === "description" ? editValue : (item.description || "")}
                                      onFocus={() => {
                                        if (editingField?.id !== item.id || editingField?.field !== "description") {
                                          startEditField(item.id, "description", item.description || "");
                                        }
                                      }}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      onBlur={commitFieldEdit}
                                      placeholder="Agregar descripción..."
                                      className="min-h-[80px] text-sm"
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>
                            </TableCell>
                            <TableCell className="py-2">
                              <Badge
                                variant="outline"
                                className={`cursor-pointer text-[10px] px-2 py-0.5 ${statusConfig[item.status]?.color || statusConfig.todo.color}`}
                                onClick={() => handleCycleStatus(item)}
                              >
                                {statusConfig[item.status]?.label || "To Do"}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2">
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={cn(
                                      "h-7 text-xs px-2 justify-start font-normal",
                                      !item.delivery_date && "text-muted-foreground"
                                    )}
                                  >
                                    <CalendarIcon className="h-3 w-3 mr-1" />
                                    {item.delivery_date ? format(parseISO(item.delivery_date), "MMM d") : "—"}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={item.delivery_date ? parseISO(item.delivery_date) : undefined}
                                    onSelect={(date) => handleDeliveryDateChange(item.id, date)}
                                    initialFocus
                                    className={cn("p-3 pointer-events-auto")}
                                  />
                                </PopoverContent>
                              </Popover>
                            </TableCell>
                            {weeks.map((w) => {
                              const active = isWeekActive(item, w.start, w.end);
                              return (
                                <TableCell key={w.label} className="py-2 px-1">
                                  <div className="h-5 flex items-center justify-center">
                                    {active && (
                                      <div className={`w-full h-1.5 rounded-full ${getWeekBarColor(item)}`} />
                                    )}
                                  </div>
                                </TableCell>
                              );
                            })}
                            <TableCell className="py-2 px-2">
                              <button
                                onClick={() => deleteItem.mutate(item.id)}
                                className="opacity-0 group-hover/row:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

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
