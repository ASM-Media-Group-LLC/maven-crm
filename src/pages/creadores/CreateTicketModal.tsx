import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  creatorId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateTicketModal = ({ creatorId, open, onOpenChange }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [ticketType, setTicketType] = useState("technical");
  const [company, setCompany] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [creatorNotes, setCreatorNotes] = useState("");

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setTicketType("technical");
    setCompany("");
    setAssignedTo("");
    setCreatorNotes("");
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: "El título es requerido", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("tickets" as any).insert({
      creator_id: creatorId,
      title: title.trim(),
      description: description.trim() || null,
      priority,
      ticket_type: ticketType,
      company: company || null,
      assigned_to: assignedTo || null,
      creator_notes: creatorNotes.trim() || null,
    } as any);

    setSaving(false);
    if (error) {
      toast({ title: "Error al crear ticket", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Ticket creado exitosamente" });
    queryClient.invalidateQueries({ queryKey: ["tickets", creatorId] });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="pr-8">
          <DialogTitle>Crear Nuevo Ticket</DialogTitle>
          <DialogDescription>Completa los detalles del ticket de soporte</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ticket-title">Título *</Label>
            <Input
              id="ticket-title"
              placeholder="Ticket title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ticket-desc">Descripción</Label>
            <Textarea
              id="ticket-desc"
              placeholder="Describe the problem or request..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de Ticket</Label>
              <Select value={ticketType} onValueChange={setTicketType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="complaint">Queja (Complaint)</SelectItem>
                  <SelectItem value="technical">Técnico (Technical)</SelectItem>
                  <SelectItem value="billing">Facturación</SelectItem>
                  <SelectItem value="content">Contenido</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Compañía / Cuenta de Origen</Label>
            <Select value={company} onValueChange={setCompany}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar compañía" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ora_miami">Ora Miami</SelectItem>
                <SelectItem value="kash_agency">KASH Agency</SelectItem>
                <SelectItem value="alvaroletshoot">Alvaroletshoot</SelectItem>
                <SelectItem value="blue_app">Blue App</SelectItem>
                <SelectItem value="piclink">piclink.me</SelectItem>
                <SelectItem value="pagomundo">Pagomundo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ticket-assign">Asignar a</Label>
            <Input
              id="ticket-assign"
              placeholder="Sin asignar"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ticket-notes">Notas sobre el creator (opcional)</Label>
            <Input
              id="ticket-notes"
              placeholder="Información adicional"
              value={creatorNotes}
              onChange={(e) => setCreatorNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Creando..." : "Create Ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateTicketModal;
