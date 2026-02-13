import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import {
  PRIORITY_LABELS,
  TYPE_LABELS,
  COMPANIES,
  TEAM_MEMBERS,
  useTickets,
} from "./useTickets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateTicketModal = ({ open, onOpenChange }: Props) => {
  const { toast } = useToast();
  const { createTicket, creatorsQuery } = useTickets();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [ticketType, setTicketType] = useState("technical");
  const [company, setCompany] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [creatorNotes, setCreatorNotes] = useState("");
  const [creatorId, setCreatorId] = useState("");

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setTicketType("technical");
    setCompany("");
    setAssignedTo("");
    setCreatorNotes("");
    setCreatorId("");
  };

  const handleCancel = () => {
    reset();
    toast({ title: "Edición cancelada" });
    onOpenChange(false);
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast({ title: "El título es requerido", variant: "destructive" });
      return;
    }
    if (!creatorId) {
      toast({ title: "Selecciona un creador", variant: "destructive" });
      return;
    }

    createTicket.mutate(
      {
        creator_id: creatorId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        ticket_type: ticketType,
        company: company || null,
        assigned_to: assignedTo || null,
        creator_notes: creatorNotes.trim() || null,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      }
    );
  };

  const creators = creatorsQuery.data || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh]">
        <DialogHeader className="pr-8">
          <DialogTitle>Crear Nuevo Ticket</DialogTitle>
          <DialogDescription>
            Completa el formulario para crear un ticket de escalación
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 overflow-y-auto max-h-[60vh] pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="t-title">Título *</Label>
            <Input
              id="t-title"
              placeholder="Título del ticket"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-desc">Descripción</Label>
            <Textarea
              id="t-desc"
              placeholder="Describe el problema o solicitud..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Creador *</Label>
            <Select value={creatorId} onValueChange={setCreatorId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar creador" />
              </SelectTrigger>
              <SelectContent>
                {creators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.artistic_name ? ` (${c.artistic_name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de Ticket</Label>
              <Select value={ticketType} onValueChange={setTicketType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
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
                {COMPANIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Asignar a</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                {TEAM_MEMBERS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-notes">Notas sobre el creator (opcional)</Label>
            <Input
              id="t-notes"
              placeholder="Información adicional"
              value={creatorNotes}
              onChange={(e) => setCreatorNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={createTicket.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={createTicket.isPending}>
            {createTicket.isPending ? "Creando..." : "Crear Ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateTicketModal;
