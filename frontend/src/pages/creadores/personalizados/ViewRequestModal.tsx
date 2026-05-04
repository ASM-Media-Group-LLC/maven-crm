import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useCustomRequests, type CustomContentRequest } from "./useCustomRequests";

interface Props {
  request: CustomContentRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_OPTIONS = [
  { value: "pendiente", label: "Pendiente", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  { value: "en_progreso", label: "En Progreso", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { value: "completado", label: "Completado", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  { value: "cancelado", label: "Cancelado", color: "bg-red-500/20 text-red-400 border-red-500/30" },
];

const PRIORITY_COLORS: Record<string, string> = {
  baja: "bg-muted text-muted-foreground",
  normal: "bg-blue-500/20 text-blue-400",
  alta: "bg-orange-500/20 text-orange-400",
  urgente: "bg-red-500/20 text-red-400",
};

const ViewRequestModal = ({ request, open, onOpenChange }: Props) => {
  const { updateRequest } = useCustomRequests();
  const [status, setStatus] = useState(request?.status || "pendiente");
  const [notes, setNotes] = useState(request?.notes || "");

  // Sync state when request changes
  if (request && status !== request.status && notes === (request.notes || "")) {
    setStatus(request.status);
    setNotes(request.notes || "");
  }

  if (!request) return null;

  const handleSave = () => {
    updateRequest.mutate(
      {
        id: request.id,
        status,
        notes: notes.trim() || null,
        completed_at: status === "completado" ? new Date().toISOString() : null,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const creatorName = request.creators?.artistic_name || request.creators?.name || "—";
  const statusConfig = STATUS_OPTIONS.find((s) => s.value === request.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-6">{request.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={statusConfig?.color}>{statusConfig?.label}</Badge>
            <Badge variant="outline" className={PRIORITY_COLORS[request.priority] || ""}>{request.priority}</Badge>
            <Badge variant="secondary">{request.content_type}</Badge>
          </div>

          {request.description && (
            <div>
              <Label className="text-muted-foreground text-xs">Descripción</Label>
              <p className="text-sm mt-1">{request.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Creadora</span>
              <p>{creatorName}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Solicitado por</span>
              <p>{request.profiles?.full_name || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Fecha Límite</span>
              <p>{request.due_date ? format(new Date(request.due_date), "dd MMM yyyy", { locale: es }) : "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Creado</span>
              <p>{format(new Date(request.created_at), "dd MMM yyyy", { locale: es })}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Actualizar Estado</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agregar notas..." rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            <Button onClick={handleSave} disabled={updateRequest.isPending}>
              {updateRequest.isPending ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ViewRequestModal;
