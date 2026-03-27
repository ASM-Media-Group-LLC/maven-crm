import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CalendarIcon, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

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
  const [creatorId, setCreatorId] = useState("");
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState<Date>();
  const [periodEnd, setPeriodEnd] = useState<Date>();
  const [periodName, setPeriodName] = useState("");
  const [baseAmount, setBaseAmount] = useState("");
  const [commissionType, setCommissionType] = useState("percentage");
  const [percentage, setPercentage] = useState("");
  const [fixedAmount, setFixedAmount] = useState("");
  const [status, setStatus] = useState("pendiente");
  const [paymentDate, setPaymentDate] = useState<Date>();
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");

  const { data: creators = [] } = useQuery({
    queryKey: ["creators-for-commission"],
    queryFn: async () => {
      const { data } = await supabase.from("creators").select("id, name, artistic_name").order("name");
      return data ?? [];
    },
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setCreatorId(""); setPeriodStart(undefined); setPeriodEnd(undefined);
      setPeriodName(""); setBaseAmount(""); setCommissionType("percentage");
      setPercentage(""); setFixedAmount(""); setStatus("pendiente");
      setPaymentDate(undefined); setPaymentMethod(""); setNotes("");
    }
  }, [open]);

  const base = Number(baseAmount) || 0;
  const pct = Number(percentage) || 0;
  const fixed = Number(fixedAmount) || 0;
  const commissionValue = commissionType === "percentage" ? base * (pct / 100) : fixed;
  const companyValue = base - commissionValue;

  const selectedCreator = creators.find(c => c.id === creatorId);
  const creatorLabel = selectedCreator ? (selectedCreator.artistic_name || selectedCreator.name) : "";

  const canSubmit = creatorId && periodStart && periodEnd && baseAmount && (commissionType === "percentage" ? percentage : fixedAmount);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const period = periodName || (periodStart && periodEnd ? `${format(periodStart, "dd/MM/yy")} - ${format(periodEnd, "dd/MM/yy")}` : "");
    onSubmit({
      creator_id: creatorId,
      period,
      period_start: periodStart ? format(periodStart, "yyyy-MM-dd") : null,
      period_end: periodEnd ? format(periodEnd, "yyyy-MM-dd") : null,
      period_name: periodName || null,
      base_amount: base,
      commission_type: commissionType,
      percentage: commissionType === "percentage" ? pct : null,
      estimated_amount: commissionValue,
      final_amount: companyValue,
      status,
      payment_date: paymentDate ? format(paymentDate, "yyyy-MM-dd") : null,
      payment_method: paymentMethod || null,
      notes: notes || null,
      calculation_method: commissionType === "percentage" ? "fixed_percentage" : "fixed_amount",
      calculation_config: commissionType === "percentage" ? { percentage: pct } : { fixed: fixed },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Crear Comisión</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Creator selector */}
          <div>
            <Label>Creador</Label>
            <Popover open={creatorOpen} onOpenChange={setCreatorOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className={cn("w-full justify-between", !creatorId && "text-muted-foreground")}>
                  {creatorLabel || "Seleccionar creador..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar creador..." />
                  <CommandList>
                    <CommandEmpty>Sin resultados.</CommandEmpty>
                    <CommandGroup>
                      {creators.map(c => (
                        <CommandItem key={c.id} value={c.artistic_name || c.name} onSelect={() => { setCreatorId(c.id); setCreatorOpen(false); }}>
                          <Check className={cn("mr-2 h-4 w-4", creatorId === c.id ? "opacity-100" : "opacity-0")} />
                          {c.artistic_name || c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Period dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Fecha Inicio</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !periodStart && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {periodStart ? format(periodStart, "dd/MM/yyyy") : "Seleccionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={periodStart} onSelect={setPeriodStart} locale={es} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Fecha Fin</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !periodEnd && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {periodEnd ? format(periodEnd, "dd/MM/yyyy") : "Seleccionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={periodEnd} onSelect={setPeriodEnd} locale={es} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div>
            <Label>Nombre del Periodo <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input placeholder="Ej: Enero 2026" value={periodName} onChange={e => setPeriodName(e.target.value)} />
          </div>

          {/* Earnings */}
          <div>
            <Label>Ganancia Total (USD)</Label>
            <Input type="number" placeholder="0.00" value={baseAmount} onChange={e => setBaseAmount(e.target.value)} />
          </div>

          {/* Commission type & value */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo de Comisión</Label>
              <Select value={commissionType} onValueChange={setCommissionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Porcentaje</SelectItem>
                  <SelectItem value="fixed">Fijo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              {commissionType === "percentage" ? (
                <>
                  <Label>Porcentaje (%)</Label>
                  <Input type="number" placeholder="0" value={percentage} onChange={e => setPercentage(e.target.value)} />
                </>
              ) : (
                <>
                  <Label>Valor Fijo (USD)</Label>
                  <Input type="number" placeholder="0.00" value={fixedAmount} onChange={e => setFixedAmount(e.target.value)} />
                </>
              )}
            </div>
          </div>

          {/* Auto-calc preview */}
          <div className="rounded-lg border border-border p-4 bg-muted/30 space-y-1">
            <p className="text-sm font-medium">Cálculo Automático</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Ganancia Total</span>
              <span>{fmt(base)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Comisión {commissionType === "percentage" ? `(${pct}%)` : "(fijo)"}</span>
              <span className="text-destructive font-medium">-{fmt(commissionValue)}</span>
            </div>
            <div className="border-t border-border pt-1 flex justify-between text-sm font-semibold">
              <span>Valor para la Empresa</span>
              <span className="text-primary">{fmt(companyValue)}</span>
            </div>
          </div>

          {/* Payment info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Estado de Pago</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="pagado">Pagado</SelectItem>
                  <SelectItem value="en_proceso">En Proceso</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha de Pago <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !paymentDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {paymentDate ? format(paymentDate, "dd/MM/yyyy") : "Seleccionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} locale={es} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div>
            <Label>Método de Pago <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Select value={paymentMethod || undefined} onValueChange={v => setPaymentMethod(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Ninguno</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="paypal">PayPal</SelectItem>
                <SelectItem value="crypto">Crypto</SelectItem>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Observaciones</Label>
            <Textarea placeholder="Notas adicionales..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isPending}>Guardar Comisión</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
