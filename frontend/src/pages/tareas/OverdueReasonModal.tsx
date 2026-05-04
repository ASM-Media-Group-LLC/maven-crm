import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface OverdueReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  onSubmit: (reason: string) => void;
  isLoading?: boolean;
}

const OverdueReasonModal = ({ open, onOpenChange, taskTitle, onSubmit, isLoading }: OverdueReasonModalProps) => {
  const { toast } = useToast();
  const [reason, setReason] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 10) {
      toast({ title: "Error", description: "La justificación debe tener al menos 10 caracteres.", variant: "destructive" });
      return;
    }
    onSubmit(reason.trim());
    setReason("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>Justificar Incumplimiento</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          La tarea <span className="font-medium text-foreground">"{taskTitle}"</span> venció sin completarse. Explica por qué:
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="reason">Razón (mínimo 10 caracteres)</Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explica por qué no completaste la tarea a tiempo..." rows={4} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" variant="destructive" disabled={isLoading}>{isLoading ? "Enviando..." : "Enviar Justificación"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default OverdueReasonModal;
