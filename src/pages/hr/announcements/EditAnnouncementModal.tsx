import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { useUpdateAnnouncement, type AnnouncementRow } from "./useAnnouncementsAdmin";

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
  announcement: AnnouncementRow | null;
}

const EditAnnouncementModal = ({ open, onOpenChange, announcement }: Props) => {
  const update = useUpdateAnnouncement();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  useEffect(() => {
    if (announcement) {
      setTitle(announcement.title);
      setMessage(announcement.message ?? "");
      setType(announcement.announcement_type);
      setPriority(announcement.priority);
      setStartsAt(announcement.starts_at.slice(0, 10));
      setExpiresAt(announcement.expires_at?.slice(0, 10) ?? "");
    }
  }, [announcement]);

  const handleSubmit = () => {
    if (!announcement || !title.trim()) return;
    update.mutate({
      id: announcement.id,
      title: title.trim(),
      message: message.trim() || null,
      announcement_type: type,
      priority,
      starts_at: startsAt ? new Date(startsAt + "T00:00:00").toISOString() : new Date().toISOString(),
      expires_at: expiresAt ? new Date(expiresAt + "T23:59:59").toISOString() : null,
    }, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Anuncio</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Mensaje</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
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
              <DateInput value={startsAt} onChange={setStartsAt} placeholder="Fecha inicio" />
            </div>
            <div className="space-y-2">
              <Label>Expiración (opcional)</Label>
              <DateInput value={expiresAt} onChange={setExpiresAt} placeholder="Sin expiración" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || update.isPending}>
            {update.isPending ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditAnnouncementModal;
