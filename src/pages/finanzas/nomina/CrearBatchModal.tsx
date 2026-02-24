import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onClose: () => void;
  periods: any[];
  onSubmit: (ids: string[], reason: string) => void;
  isPending?: boolean;
}

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

export default function CrearBatchModal({ open, onClose, periods, onSubmit, isPending }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");

  const eligible = periods.filter(p => p.status === "borrador" || p.status === "calculado");

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const totalImpact = eligible.filter(p => selected.includes(p.id)).reduce((s, p) => s + (Number(p.net_total) || 0), 0);

  const handleSubmit = () => {
    if (selected.length === 0 || !reason.trim()) return;
    onSubmit(selected, reason);
    setSelected([]);
    setReason("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Crear Batch de Cierre</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="max-h-48 overflow-auto space-y-2">
            {eligible.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay periodos elegibles para cierre.</p>
            ) : eligible.map(p => (
              <label key={p.id} className="flex items-center gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/30 transition-colors">
                <Checkbox checked={selected.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
                <div className="flex-1">
                  <span className="text-sm font-medium">{p.period_name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{fmt(Number(p.net_total) || 0)}</span>
                </div>
                <Badge variant="secondary">{p.status}</Badge>
              </label>
            ))}
          </div>
          <div>
            <Label>Motivo del cierre *</Label>
            <Textarea placeholder="Indique el motivo del cierre de batch..." value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          <div className="rounded-lg border border-border p-4 bg-muted/30">
            <p className="text-sm font-medium">Impacto Financiero</p>
            <p className="text-sm text-muted-foreground">Periodos seleccionados: <strong>{selected.length}</strong></p>
            <p className="text-sm text-muted-foreground">Total neto a cerrar: <strong>{fmt(totalImpact)}</strong></p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={selected.length === 0 || !reason.trim() || isPending}>Cerrar Batch</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
