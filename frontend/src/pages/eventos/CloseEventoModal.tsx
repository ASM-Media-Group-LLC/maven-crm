import { useState, useEffect } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useUpdateEvento, type EventRow } from "./useEventos";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventRow;
}

const CloseEventoModal = ({ open, onOpenChange, event }: Props) => {
  const { toast } = useToast();
  const updateEvento = useUpdateEvento();
  const [outcome, setOutcome] = useState<"completed" | "cancelled">("completed");
  const [closeNotes, setCloseNotes] = useState("");

  useEffect(() => {
    if (open) {
      setOutcome("completed");
      setCloseNotes("");
    }
  }, [open]);

  const handleConfirm = () => {
    const notesUpdate = closeNotes.trim()
      ? event.notes
        ? `${event.notes}\n\n--- Cierre ---\n${closeNotes.trim()}`
        : `--- Cierre ---\n${closeNotes.trim()}`
      : undefined;

    updateEvento.mutate(
      {
        id: event.id,
        data: {
          status: outcome,
          ...(notesUpdate !== undefined ? { notes: notesUpdate } : {}),
        },
      },
      {
        onSuccess: () => {
          toast({ title: outcome === "completed" ? "Evento completado" : "Evento cancelado" });
          onOpenChange(false);
        },
        onError: () => toast({ title: "Error al cerrar evento", variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cerrar Evento</DialogTitle>
          <DialogDescription>¿Cómo finalizó "{event.name}"?</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <RadioGroup value={outcome} onValueChange={(v) => setOutcome(v as "completed" | "cancelled")}>
            <label
              className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                outcome === "completed" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              }`}
            >
              <RadioGroupItem value="completed" className="mt-0.5" />
              <CheckCircle className="h-5 w-5 text-success shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Se realizó exitosamente</p>
                <p className="text-xs text-muted-foreground">El evento se llevó a cabo según lo planeado</p>
              </div>
            </label>
            <label
              className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                outcome === "cancelled" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              }`}
            >
              <RadioGroupItem value="cancelled" className="mt-0.5" />
              <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Se canceló</p>
                <p className="text-xs text-muted-foreground">El evento no se realizó y queda cancelado</p>
              </div>
            </label>
          </RadioGroup>

          <div className="space-y-2">
            <Label>Notas de cierre (opcional)</Label>
            <Textarea
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              placeholder="Agrega notas sobre cómo finalizó el evento..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={updateEvento.isPending}>
            {updateEvento.isPending ? "Cerrando…" : "Confirmar Cierre"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CloseEventoModal;
