import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  isPending?: boolean;
}

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

export default function NuevaComisionModal({ open, onClose, onSubmit, isPending }: Props) {
  const [commissionType, setCommissionType] = useState("laboral");
  const [calcMethod, setCalcMethod] = useState("fixed_percentage");
  const [baseAmount, setBaseAmount] = useState("");
  const [percentage, setPercentage] = useState("");
  const [period, setPeriod] = useState("");
  const [area, setArea] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [notes, setNotes] = useState("");

  const base = Number(baseAmount) || 0;
  const pct = Number(percentage) || 0;
  const estimated = base * (pct / 100);

  const handleSubmit = () => {
    if (!period || !baseAmount) return;
    onSubmit({
      commission_type: commissionType,
      calculation_method: calcMethod,
      base_amount: base,
      percentage: pct,
      estimated_amount: estimated,
      period,
      area: area || null,
      cost_center: costCenter || null,
      notes: notes || null,
      status: "proyectado",
      calculation_config: calcMethod === "fixed_percentage" ? { percentage: pct } : {},
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nueva Comisión</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo de Comisión</Label>
              <Select value={commissionType} onValueChange={setCommissionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="laboral">Laboral</SelectItem>
                  <SelectItem value="comercial">Comercial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Método de Cálculo</Label>
              <Select value={calcMethod} onValueChange={setCalcMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed_percentage">% Fijo</SelectItem>
                  <SelectItem value="tiered">Escalonado</SelectItem>
                  <SelectItem value="goal_based">Por Meta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Periodo</Label>
            <Input placeholder="Ej: 2026-02" value={period} onChange={e => setPeriod(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Monto Base</Label>
              <Input type="number" placeholder="0" value={baseAmount} onChange={e => setBaseAmount(e.target.value)} />
            </div>
            <div>
              <Label>Porcentaje (%)</Label>
              <Input type="number" placeholder="0" value={percentage} onChange={e => setPercentage(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Área</Label>
              <Select value={area || undefined} onValueChange={v => setArea(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ninguna</SelectItem>
                  <SelectItem value="chatters">Chatters</SelectItem>
                  <SelectItem value="closers">Closers</SelectItem>
                  <SelectItem value="tech">Tech</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Centro de Costo</Label>
              <Select value={costCenter || undefined} onValueChange={v => setCostCenter(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ninguno</SelectItem>
                  <SelectItem value="operaciones">Operaciones</SelectItem>
                  <SelectItem value="ventas">Ventas</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notas / Motivo</Label>
            <Textarea placeholder="Motivo obligatorio para ajustes manuales..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="rounded-lg border border-border p-4 bg-muted/30">
            <p className="text-sm font-medium">Preview del Cálculo</p>
            <p className="text-sm text-muted-foreground">Base: {fmt(base)} × {pct}% = <strong>{fmt(estimated)}</strong></p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!period || !baseAmount || isPending}>Crear Comisión</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
