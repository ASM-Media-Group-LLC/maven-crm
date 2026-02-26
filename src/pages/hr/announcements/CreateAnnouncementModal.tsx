import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateAnnouncement } from "./useAnnouncementsAdmin";

const TYPES = [
  { value: "general", label: "General" },
  { value: "policy", label: "Política" },
  { value: "celebration", label: "Celebración" },
  { value: "holiday", label: "Feriado" },
];

const PRIORITIES = [
  { value: "low", label: "Baja" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Alta" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const CreateAnnouncementModal = ({ open, onOpenChange }: Props) => {
  const create = useCreateAnnouncement();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 16));
  const [expiresAt, setExpiresAt] = useState("");

  const reset = () => {
    setTitle(""); setMessage(""); setType("general"); setPriority("normal");
    setStartsAt(new Date().toISOString().slice(0, 16)); setExpiresAt("");
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    create.mutate({
      title: title.trim(),
      message: message.trim() || undefined,
      announcement_type: type,
      priority,
      starts_at: new Date(startsAt).toISOString(),
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    }, {
      onSuccess: () => { reset(); onOpenChange(false); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo Anuncio</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título del anuncio" />
          </div>
          <div className="space-y-2">
            <Label>Mensaje</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Detalles opcionales..." rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prioridad</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fecha inicio</Label>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Expiración (opcional)</Label>
              <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || create.isPending}>
            {create.isPending ? "Creando..." : "Crear Anuncio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateAnnouncementModal;
