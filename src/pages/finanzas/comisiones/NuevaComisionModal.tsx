import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CalendarIcon, ChevronsUpDown, Check, AlertCircle } from "lucide-react";
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
  const [baseAmount, setBaseAmount] = useState("");
  

  const { data: creators = [] } = useQuery({
    queryKey: ["creators-for-commission"],
    queryFn: async () => {
      const { data } = await supabase.from("creators").select("id, name, artistic_name").order("name");
      return data ?? [];
    },
    enabled: open,
  });

  const { data: creatorBusiness } = useQuery({
    queryKey: ["creator-business-commission", creatorId],
    queryFn: async () => {
      const { data } = await supabase
        .from("creator_business")
        .select("agency_percentage, blue_package, li_payment_amount, commission_type, commission_tiers")
        .eq("creator_id", creatorId)
        .maybeSingle();
      return data;
    },
    enabled: !!creatorId,
  });

  useEffect(() => {
    if (!open) {
      setCreatorId("");
      setPeriodStart(undefined);
      setPeriodEnd(undefined);
      setBaseAmount("");
      
    }
  }, [open]);

  const base = Number(baseAmount) || 0;
  const commType = (creatorBusiness as any)?.commission_type ?? "fixed";
  const commTiers = (creatorBusiness as any)?.commission_tiers as { min_revenue: number; max_revenue: number | null; percentage: number }[] | undefined;

  // Resolve effective percentage
  let agencyPct = creatorBusiness?.agency_percentage ?? 0;
  if (commType === "tiered" && Array.isArray(commTiers) && commTiers.length > 0 && base > 0) {
    const matchedTier = commTiers.find(
      (t) => base >= t.min_revenue && (t.max_revenue === null || base <= t.max_revenue)
    );
    agencyPct = matchedTier?.percentage ?? 0;
  }

  const hasBlue = creatorBusiness?.blue_package === true && (creatorBusiness?.li_payment_amount ?? 0) > 0;
  const blueAmount = hasBlue ? creatorBusiness!.li_payment_amount! : 0;
  const companyValue = base * (agencyPct / 100) + (base > 0 ? blueAmount : 0);

  const selectedCreator = creators.find(c => c.id === creatorId);
  const creatorLabel = selectedCreator ? (selectedCreator.artistic_name || selectedCreator.name) : "";

  const canSubmit = creatorId && periodStart && periodEnd && baseAmount && agencyPct > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const period = `${format(periodStart!, "dd/MM/yy")} - ${format(periodEnd!, "dd/MM/yy")}`;
    onSubmit({
      creator_id: creatorId,
      period,
      period_start: format(periodStart!, "yyyy-MM-dd"),
      period_end: format(periodEnd!, "yyyy-MM-dd"),
      base_amount: base,
      commission_type: "percentage",
      percentage: agencyPct,
      estimated_amount: companyValue,
      final_amount: companyValue,
      status: "pendiente",
      notes: notes || null,
      calculation_method: "fixed_percentage",
      calculation_config: { percentage: agencyPct, blue_package: hasBlue, blue_amount: blueAmount },
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

          {/* Earnings */}
          <div>
            <Label>Ganancia Total (USD)</Label>
            <Input type="number" placeholder="0.00" value={baseAmount} onChange={e => setBaseAmount(e.target.value)} />
          </div>

          {/* Auto-calc preview */}
          <div className="rounded-lg border border-border p-4 bg-muted/30 space-y-1">
            <p className="text-sm font-medium">Cálculo Automático</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Ganancia de la Creadora</span>
              <span>{fmt(base)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Comisión</span>
              {creatorId && agencyPct > 0 ? (
                <span className="font-medium">{agencyPct}%</span>
              ) : creatorId && agencyPct === 0 && commType === "fixed" ? (
                <span className="text-destructive text-xs flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Sin porcentaje configurado
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
            {hasBlue && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Blue</span>
                <span className="font-medium">{fmt(blueAmount)}</span>
              </div>
            )}
            <div className="border-t border-border pt-1 flex justify-between text-sm font-semibold">
              <span>Valor para la Empresa</span>
              <span className="text-primary">{fmt(companyValue)}</span>
            </div>
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
