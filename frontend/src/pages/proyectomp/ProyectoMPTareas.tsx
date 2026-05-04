import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useMPTasks, useUpdateMPTask, useCreateMPTask } from "./hooks/useMPTasks";
import { useMPPhases } from "./hooks/useMPPhases";
import { Plus, GripVertical } from "lucide-react";
import { toast } from "sonner";

const columns = [
  { id: "todo", label: "Por hacer", color: "border-l-muted-foreground" },
  { id: "in_progress", label: "En progreso", color: "border-l-teal-500" },
  { id: "blocked", label: "Bloqueado", color: "border-l-red-500" },
  { id: "completed", label: "Completado", color: "border-l-emerald-500" },
];

const pillarColors: Record<string, string> = {
  recruiting: "bg-blue-500/20 text-blue-400",
  ai: "bg-purple-500/20 text-purple-400",
  modelo: "bg-pink-500/20 text-pink-400",
  trafico: "bg-amber-500/20 text-amber-400",
  operaciones: "bg-cyan-500/20 text-cyan-400",
  general: "bg-muted text-muted-foreground",
};

const priorityColors: Record<string, string> = {
  high: "bg-red-500/20 text-red-400",
  medium: "bg-amber-500/20 text-amber-400",
  low: "bg-muted text-muted-foreground",
};

const ProyectoMPTareas = () => {
  const { data: tasks, isLoading } = useMPTasks();
  const { data: phases } = useMPPhases();
  const updateTask = useUpdateMPTask();
  const createTask = useCreateMPTask();
  const [filterPillar, setFilterPillar] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "", pillar: "general" as string, priority: "medium" as string, phase_id: "" });

  const filteredTasks = tasks?.filter((t) => filterPillar === "all" || t.pillar === filterPillar) ?? [];

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId;
    const taskId = result.draggableId;
    updateTask.mutate({ id: taskId, status: newStatus });
  };

  const handleCreate = () => {
    if (!newTask.title.trim()) return;
    createTask.mutate(
      { ...newTask, phase_id: newTask.phase_id || null },
      {
        onSuccess: () => {
          toast.success("Tarea creada");
          setOpen(false);
          setNewTask({ title: "", description: "", pillar: "general", priority: "medium", phase_id: "" });
        },
      }
    );
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kanban de Tareas</h1>
        <div className="flex items-center gap-2">
          <Select value={filterPillar} onValueChange={setFilterPillar}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los pilares</SelectItem>
              <SelectItem value="recruiting">Recruiting</SelectItem>
              <SelectItem value="ai">AI</SelectItem>
              <SelectItem value="modelo">Modelo</SelectItem>
              <SelectItem value="trafico">Tráfico</SelectItem>
              <SelectItem value="operaciones">Operaciones</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Nueva Tarea</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nueva Tarea</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Título</Label><Input value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} /></div>
                <div><Label>Descripción</Label><Textarea value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Pilar</Label>
                    <Select value={newTask.pillar} onValueChange={(v) => setNewTask({ ...newTask, pillar: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.keys(pillarColors).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Prioridad</Label>
                    <Select value={newTask.priority} onValueChange={(v) => setNewTask({ ...newTask, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">Alta</SelectItem>
                        <SelectItem value="medium">Media</SelectItem>
                        <SelectItem value="low">Baja</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Fase</Label>
                  <Select value={newTask.phase_id} onValueChange={(v) => setNewTask({ ...newTask, phase_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar fase" /></SelectTrigger>
                    <SelectContent>
                      {phases?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreate} className="w-full" disabled={createTask.isPending}>Crear Tarea</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {columns.map((col) => {
            const colTasks = filteredTasks.filter((t) => t.status === col.id);
            return (
              <Droppable key={col.id} droppableId={col.id}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-sm font-semibold">{col.label}</h3>
                      <Badge variant="outline" className="text-xs">{colTasks.length}</Badge>
                    </div>
                    <div className="min-h-[200px] space-y-2">
                      {colTasks.map((task, idx) => (
                        <Draggable key={task.id} draggableId={task.id} index={idx}>
                          {(provided) => (
                            <Card
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`bg-card border-l-4 ${col.color}`}
                            >
                              <CardContent className="p-3">
                                <div className="flex items-start gap-2">
                                  <div {...provided.dragHandleProps}><GripVertical className="h-4 w-4 text-muted-foreground mt-0.5" /></div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">{task.title}</p>
                                    {task.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>}
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      <Badge className={`text-[10px] ${pillarColors[task.pillar] || ""}`}>{task.pillar}</Badge>
                                      <Badge className={`text-[10px] ${priorityColors[task.priority] || ""}`}>{task.priority}</Badge>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
};

export default ProyectoMPTareas;
