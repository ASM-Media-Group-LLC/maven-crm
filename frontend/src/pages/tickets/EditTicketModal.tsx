import { useState, useEffect } from "react";
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
  STATUS_LABELS,
  TYPE_LABELS,
  COMPANIES,
  TEAM_MEMBERS,
  type TicketWithCreator,
  useTickets,
} from "./useTickets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketWithCreator;
}

const EditTicketModal = ({ open, onOpenChange, ticket }: Props) => {
  const { toast } = useToast();
  const { updateTicket, creatorsQuery } = useTickets();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("");
  const [ticketType, setTicketType] = useState("");
  const [status, setStatus] = useState("");
  const [company, setCompany] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [creatorNotes, setCreatorNotes] = useState("");
  const [creatorId, setCreatorId] = useState("");

  useEffect(() => {
    if (open && ticket) {
      setTitle(ticket.title);
      setDescription(ticket.description || "");
      setPriority(ticket.priority);
      setTicketType(ticket.ticket_type);
      setStatus(ticket.status);
      setCompany(ticket.company || "");
      setAssignedTo(ticket.assigned_to || "");
      setCreatorNotes(ticket.creator_notes || "");
      setCreatorId(ticket.creator_id);
    }
  }, [open, ticket]);

  const handleCancel = () => {
    toast({ title: "Edición cancelada" });
    onOpenChange(false);
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast({ title: "El título es requerido", variant: "destructive" });
      return;
    }

    updateTicket.mutate(
      {
        id: ticket.id,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        ticket_type: ticketType,
        status,
        company: company || null,
        assigned_to: assignedTo || null,
        creator_notes: creatorNotes.trim() || null,
        creator_id: creatorId,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const creators = creatorsQuery.data || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh]">
        <DialogHeader className="pr-8">
          <DialogTitle>Editar Ticket</DialogTitle>
          <DialogDescription>
            Modifica los campos necesarios y guarda los cambios
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 overflow-y-auto max-h-[60vh] pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="et-title">Título *</Label>
            <Input id="et-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="et-desc">Descripción</Label>
            <Textarea id="et-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="space-y-1.5">
            <Label>Creador *</Label>
            <Select value={creatorId} onValueChange={setCreatorId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar creador" /></SelectTrigger>
              <SelectContent>
                {creators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.artistic_name ? ` (${c.artistic_name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-4">
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
              <Label>Tipo</Label>
              <Select value={ticketType} onValueChange={setTicketType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Compañía / Cuenta de Origen</Label>
            <Select value={company || undefined} onValueChange={(v) => setCompany(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar compañía" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin compañía</SelectItem>
                {COMPANIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Asignar a</Label>
            <Select value={assignedTo || undefined} onValueChange={(v) => setAssignedTo(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sin asignar</SelectItem>
                {TEAM_MEMBERS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="et-notes">Notas sobre el creator</Label>
            <Input id="et-notes" value={creatorNotes} onChange={(e) => setCreatorNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={updateTicket.isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={updateTicket.isPending}>
            {updateTicket.isPending ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditTicketModal;
