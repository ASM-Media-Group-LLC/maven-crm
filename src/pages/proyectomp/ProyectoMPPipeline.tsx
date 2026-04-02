import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useMPCandidates, useUpdateMPCandidate, useCreateMPCandidate } from "./hooks/useMPCandidates";
import { Plus, GripVertical, User } from "lucide-react";
import { toast } from "sonner";

const stages = [
  { id: "candidata", label: "Candidata" },
  { id: "contactada", label: "Contactada" },
  { id: "entrevista", label: "Entrevista" },
  { id: "filtro", label: "Filtro" },
  { id: "shooting", label: "Shooting" },
  { id: "contrato", label: "Contrato" },
  { id: "activa", label: "Activa" },
  { id: "inactiva", label: "Inactiva" },
];

const ProyectoMPPipeline = () => {
  const { data: candidates, isLoading } = useMPCandidates();
  const updateCandidate = useUpdateMPCandidate();
  const createCandidate = useCreateMPCandidate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", city: "", notes: "", estimated_tier: "" });

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    updateCandidate.mutate({ id: result.draggableId, stage: result.destination.droppableId });
  };

  const handleCreate = () => {
    if (!form.name.trim()) return;
    createCandidate.mutate(form, {
      onSuccess: () => {
        toast.success("Candidata agregada");
        setOpen(false);
        setForm({ name: "", city: "", notes: "", estimated_tier: "" });
      },
    });
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pipeline de Recruiting</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" />Nueva Candidata</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nueva Candidata</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Ciudad</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div><Label>Tier Estimado</Label><Input value={form.estimated_tier} onChange={(e) => setForm({ ...form, estimated_tier: e.target.value })} placeholder="ej: Alto, Medio" /></div>
              <div><Label>Notas</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={handleCreate} className="w-full" disabled={createCandidate.isPending}>Agregar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const items = candidates?.filter((c) => c.stage === stage.id) ?? [];
            return (
              <Droppable key={stage.id} droppableId={stage.id}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="min-w-[200px] w-[200px] shrink-0">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <h3 className="text-xs font-semibold uppercase tracking-wider">{stage.label}</h3>
                      <Badge variant="outline" className="text-xs">{items.length}</Badge>
                    </div>
                    <div className="min-h-[300px] space-y-2 bg-muted/20 rounded-lg p-2">
                      {items.map((c, idx) => (
                        <Draggable key={c.id} draggableId={c.id} index={idx}>
                          {(provided) => (
                            <Card ref={provided.innerRef} {...provided.draggableProps} className="bg-card">
                              <CardContent className="p-3">
                                <div className="flex items-start gap-2">
                                  <div {...provided.dragHandleProps}><GripVertical className="h-4 w-4 text-muted-foreground" /></div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <User className="h-3 w-3 text-muted-foreground" />
                                      <p className="text-sm font-medium truncate">{c.name}</p>
                                    </div>
                                    {c.city && <p className="text-xs text-muted-foreground mt-1">{c.city}</p>}
                                    {c.estimated_tier && <Badge variant="outline" className="text-[10px] mt-1">{c.estimated_tier}</Badge>}
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

export default ProyectoMPPipeline;
