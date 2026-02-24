import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onClose: () => void;
  invoice: any;
  onSubmit: (id: string, reason: string) => void;
  isPending?: boolean;
}

export default function ReversarInvoiceModal({ open, onClose, invoice, onSubmit, isPending }: Props) {
  const [reason, setReason] = useState("");

  const handleSubmit = () => {
    if (!reason.trim() || !invoice) return;
    onSubmit(invoice.id, reason);
    setReason("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Reversar Invoice #{invoice?.invoice_number}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Esta acción cambiará el estado del invoice a "Reversada". Esta operación no se puede deshacer.</p>
          <div>
            <Label>Motivo del reverso *</Label>
            <Textarea placeholder="Indique el motivo del reverso..." value={reason} onChange={e => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={!reason.trim() || isPending}>Confirmar Reverso</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
