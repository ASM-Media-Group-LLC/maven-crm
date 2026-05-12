import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Wallet, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { EmployeeSearchCombobox } from "@/components/hr/EmployeeSearchCombobox";
import { INFRACTION_CATEGORIES } from "@/lib/hrConstants";
import { cn } from "@/lib/utils";

interface FormState {
  employee_id: string;
  deduction_type: string;
  category: string;
  amount: string;
  date: string;
  description: string;
}

const initialForm: FormState = {
  employee_id: "",
  deduction_type: "",
  category: "",
  amount: "",
  date: new Date().toISOString().split("T")[0],
  description: "",
};

const TYPE_OPTIONS = [
  { value: "adelanto", label: "Adelanto de Nómina", icon: Wallet, desc: "Anticipo solicitado por el empleado" },
  { value: "infraccion", label: "Infracción", icon: AlertTriangle, desc: "Descuento por violación de políticas" },
];

export default function HRDeductionNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (field: keyof FormState, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const canSubmit = form.employee_id && form.deduction_type && Number(form.amount) > 0 && (form.deduction_type !== "infraccion" || form.category);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Build description with category prefix for infractions
      let description = form.description || null;
      if (form.deduction_type === "infraccion" && form.category) {
        description = `[${form.category}]${form.description ? ` ${form.description}` : ""}`;
      }

      const monthYear = form.date ? form.date.substring(0, 7) : new Date().toISOString().substring(0, 7);

      const { error } = await supabase.from("employee_deductions").insert({
        employee_id: form.employee_id,
        deduction_type: form.deduction_type,
        amount: Number(form.amount),
        description,
        month_year: monthYear,
        created_by: user?.id,
        status: "pending",
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["employee-deductions-all"] });
      toast({ title: "Deducción registrada correctamente" });
      navigate("/hr/deducciones");
    } catch {
      toast({ title: "Error al registrar la deducción", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b border-white/10 bg-background/60 backdrop-blur-xl px-6 py-4">
        <Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground hover:text-foreground" onClick={() => navigate("/hr/deducciones")}>
          <ArrowLeft className="h-4 w-4 mr-1" />Volver a Deducciones
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Registrar Deducción</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Adelanto de nómina o infracción</p>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto px-6 py-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Datos de la Deducción</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {/* Employee */}
            <div className="space-y-1.5">
              <Label>Empleado <span className="text-destructive">*</span></Label>
              <EmployeeSearchCombobox value={form.employee_id || null} onChange={(v) => set("employee_id", v ?? "")} />
            </div>

            {/* Type - Radio Cards */}
            <div className="space-y-1.5">
              <Label>Tipo de Deducción <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {TYPE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = form.deduction_type === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { set("deduction_type", opt.value); if (opt.value !== "infraccion") set("category", ""); }}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-all",
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:border-muted-foreground/30"
                      )}
                    >
                      <div className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                        isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className={cn("text-sm font-medium", isSelected && "text-primary")}>{opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Infraction Category */}
            {form.deduction_type === "infraccion" && (
              <div className="space-y-1.5">
                <Label>Categoría de Infracción <span className="text-destructive">*</span></Label>
                <Select value={form.category || undefined} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar categoría..." /></SelectTrigger>
                  <SelectContent>
                    {INFRACTION_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Amount */}
            <div className="space-y-1.5">
              <Label>Monto <span className="text-destructive">*</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="0"
                  className="pl-7"
                  value={form.amount}
                  onChange={(e) => set("amount", e.target.value)}
                />
              </div>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label>Fecha de Deducción</Label>
              <DateInput value={form.date} onChange={(v) => set("date", v)} />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Descripción / Motivo</Label>
              <Textarea
                rows={3}
                placeholder={form.deduction_type === "infraccion" ? "Detalle de la infracción cometida..." : "Motivo del adelanto solicitado..."}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t bg-background px-6 py-3 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => navigate("/hr/deducciones")}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
          {isSubmitting ? "Guardando..." : "Guardar Deducción"}
        </Button>
      </div>
    </div>
  );
}
