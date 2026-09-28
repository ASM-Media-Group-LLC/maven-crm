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
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  open: boolean;
  onClose: () => void;
  employees: any[];
  onSubmit: (data: any) => void;
  isPending?: boolean;
}

function fmt(n: number, f: Formato) {
  return new Intl.NumberFormat(f.intl("es-CO"), { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

export default function CalcularNominaModal({ open, onClose, employees, onSubmit, isPending }: Props) {
  const f = useFormato();
  const { t } = useLanguage();
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
        <DialogHeader><DialogTitle>{t("finanzas.payroll.calculate")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t("finanzas.payroll.calc.periodName")}</Label>
            <Input placeholder={t("finanzas.payroll.calc.periodNamePlaceholder")} value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t("common.dateRange")}</Label>
            <DateRangePicker from={dateFrom} to={dateTo} onApply={(desde, hasta) => { setDateFrom(desde); setDateTo(hasta); }} />
          </div>
          <div>
            <Label>{t("finanzas.common.costCenter")}</Label>
            <Select value={costCenter || undefined} onValueChange={v => setCostCenter(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={t("finanzas.payroll.calc.optional")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("common.none")}</SelectItem>
                {centers.map(c => (
                  <SelectItem key={c.code} value={c.code}>{c.name} ({c.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("finanzas.common.notes")}</Label>
            <Textarea placeholder={t("finanzas.payroll.calc.remarks")} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="rounded-lg border border-border p-4 bg-muted/30 space-y-1">
            <p className="text-sm font-medium">{t("finanzas.payroll.calc.preview")}</p>
            <p className="text-sm text-muted-foreground">{t("finanzas.payroll.calc.activeEmployees")}: <strong>{employees.length}</strong></p>
            <p className="text-sm text-muted-foreground">{t("finanzas.payroll.calc.baseTotal")}: <strong>{fmt(totalBase, f)}</strong></p>
            {payrollParams && (
              <div className="text-xs text-muted-foreground space-y-0.5 mt-2 pt-2 border-t border-border">
                <p>{t("finanzas.payroll.calc.deductionsLine", { health: payrollParams.deductions.health_pct, pension: payrollParams.deductions.pension_pct })}{payrollParams.deductions.tax_pct > 0 ? ` · ${t("finanzas.payroll.calc.taxes", { pct: payrollParams.deductions.tax_pct })}` : ""}</p>
                <p>{t("finanzas.payroll.calc.otLine", { day: payrollParams.overtime_multipliers.daytime, night: payrollParams.overtime_multipliers.nighttime, holiday: payrollParams.overtime_multipliers.holiday })}</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t("finanzas.payroll.calc.finalNote")}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={!name || !dateFrom || !dateTo || isPending}>{t("finanzas.payroll.calc.submit")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
