import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { format } from "date-fns";
import { useCostCenters, usePayrollParams } from "@/hooks/useFinancialConfig";

interface Props {
  open: boolean;
  onClose: () => void;
  employees: any[];
  onSubmit: (data: any) => void;
  isPending?: boolean;
}

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

export default function CalcularNominaModal({ open, onClose, employees, onSubmit, isPending }: Props) {
  const [name, setName] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [costCenter, setCostCenter] = useState("");
  const [notes, setNotes] = useState("");
  const { centers } = useCostCenters();
  const { params: payrollParams } = usePayrollParams();

  const totalBase = employees.reduce((s, e) => s + (Number(e.base_salary) || 0), 0);

  const handleSubmit = () => {
    if (!name || !dateFrom || !dateTo) return;
    onSubmit({
      period_name: name,
      start_date: format(dateFrom, "yyyy-MM-dd"),
      end_date: format(dateTo, "yyyy-MM-dd"),
      total_employees: employees.length,
      gross_total: totalBase,
      net_total: totalBase,
      status: "calculado",
      cost_center: costCenter || null,
      notes: notes || null,
    });
    setName(""); setDateFrom(undefined); setDateTo(undefined); setCostCenter(""); setNotes("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Calcular Nómina</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nombre del Periodo</Label>
            <Input placeholder="Ej: Nómina Febrero 2026" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <Label>Rango de Fechas</Label>
            <DateRangePicker from={dateFrom} to={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} />
          </div>
          <div>
            <Label>Centro de Costo</Label>
            <Select value={costCenter || undefined} onValueChange={v => setCostCenter(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Ninguno</SelectItem>
                {centers.map(c => (
                  <SelectItem key={c.code} value={c.code}>{c.name} ({c.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea placeholder="Observaciones..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="rounded-lg border border-border p-4 bg-muted/30 space-y-1">
            <p className="text-sm font-medium">Preview del Cálculo</p>
            <p className="text-sm text-muted-foreground">Empleados activos: <strong>{employees.length}</strong></p>
            <p className="text-sm text-muted-foreground">Total salarios base: <strong>{fmt(totalBase)}</strong></p>
            {payrollParams && (
              <div className="text-xs text-muted-foreground space-y-0.5 mt-2 pt-2 border-t border-border">
                <p>Salud: {payrollParams.deductions.health_pct}% · Pensión: {payrollParams.deductions.pension_pct}%{payrollParams.deductions.tax_pct > 0 ? ` · Impuestos: ${payrollParams.deductions.tax_pct}%` : ""}</p>
                <p>HE Diurno: {payrollParams.overtime_multipliers.daytime}x · Nocturno: {payrollParams.overtime_multipliers.nighttime}x · Festivo: {payrollParams.overtime_multipliers.holiday}x</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">El monto final incluirá horas extra, comisiones y deducciones aplicadas.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!name || !dateFrom || !dateTo || isPending}>Calcular y Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
