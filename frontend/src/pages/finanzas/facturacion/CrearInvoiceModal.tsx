import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  isPending?: boolean;
}

function fmtMonto(n: number, f: Formato) {
  return new Intl.NumberFormat(f.intl("es-CO"), { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

export default function CrearInvoiceModal({ open, onClose, onSubmit, isPending }: Props) {
  const f = useFormato();
  const fmt = (n: number) => fmtMonto(n, f);
  const [templateId, setTemplateId] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [selectedCommissionIds, setSelectedCommissionIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  // Fetch templates (type = "invoice")
  const { data: templates = [] } = useQuery({
    queryKey: ["invoice-templates-for-modal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_templates")
        .select("id, name, type, company_name")
        .eq("type", "invoice")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  // Fetch creators
  const { data: creators = [] } = useQuery({
    queryKey: ["creators-for-invoice"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creators")
        .select("id, name, artistic_name")
        .order("name");
      if (error) throw error;
      return (data ?? []).sort((a, b) =>
        (a.artistic_name || a.name).localeCompare(b.artistic_name || b.name)
      );
    },
    enabled: open,
  });

  // Fetch commissions for selected creator
  const { data: commissions = [], isLoading: loadingCommissions } = useQuery({
    queryKey: ["commissions-for-invoice", creatorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commissions")
        .select("*")
        .eq("creator_id", creatorId)
        .order("period", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!creatorId,
  });

  const selectedCreator = creators.find(c => c.id === creatorId);

  // Toggle commission selection
  const toggleCommission = (id: string) => {
    setSelectedCommissionIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Calculate totals from selected commissions
  const totals = useMemo(() => {
    const selected = commissions.filter(c => selectedCommissionIds.includes(c.id));
    const agency = selected.reduce((sum, c) => {
      const config = c.calculation_config as any;
      const base = Number(c.base_amount) || 0;
      const pct = Number(config?.percentage) || 0;
      return sum + (base * pct / 100);
    }, 0);
    // Blue: from calculation_config if present
    const blue = selected.reduce((sum, c) => {
      const config = c.calculation_config as any;
      return sum + (config?.blue_amount || 0);
    }, 0);
    // PayPal: from calculation_config if present
    const paypal = selected.reduce((sum, c) => {
      const config = c.calculation_config as any;
      return sum + (config?.paypal_amount || 0);
    }, 0);
    const grand = agency + blue + paypal;

    // Period range
    const starts = selected.map(c => c.period_start).filter(Boolean) as string[];
    const ends = selected.map(c => c.period_end).filter(Boolean) as string[];
    const periodStart = starts.length ? starts.sort()[0] : null;
    const periodEnd = ends.length ? ends.sort().reverse()[0] : null;

    let dueDate: string | null = null;
    if (periodEnd) {
      const d = new Date(periodEnd + "T12:00:00");
      d.setDate(d.getDate() + 5);
      dueDate = d.toISOString().split("T")[0];
    }

    return { agency, blue, paypal, grand, periodStart, periodEnd, dueDate, count: selected.length };
  }, [commissions, selectedCommissionIds]);

  const canSubmit = !!templateId && !!creatorId && totals.count > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;

    // Build immutable commission snapshot from selected commissions
    const selected = commissions.filter(c => selectedCommissionIds.includes(c.id));
    const commissionSnapshot = selected.map(c => {
      const config = c.calculation_config as any;
      return {
        commission_id: c.id,
        period: c.period,
        period_start: c.period_start,
        period_end: c.period_end,
        base_amount: Number(c.base_amount) || 0,
        commission_type: config?.commission_type ?? "fixed",
        commission_percentage: Number(config?.percentage) || 0,
        commission_amount: (Number(c.base_amount) || 0) * (Number(config?.percentage) || 0) / 100,
        earnings_period: Number(config?.earnings_period) || Number(c.base_amount) || 0,
        tier_from: config?.tier_from ?? null,
        tier_to: config?.tier_to ?? null,
        tiers_config: config?.tiers_config ?? null,
        blue_amount: Number(config?.blue_amount) || 0,
        paypal_amount: Number(config?.paypal_amount) || 0,
      };
    });

    onSubmit({
      creator_id: creatorId,
      template_id: templateId,
      amount: totals.grand,
      agency_amount: totals.agency,
      blue_amount: totals.blue,
      paypal_amount: totals.paypal,
      net_amount: totals.grand,
      due_date: totals.dueDate || null,
      notes: notes || null,
      status: "borrador",
      period_start: totals.periodStart,
      period_end: totals.periodEnd,
      commission_snapshot: commissionSnapshot,
    });
    // Reset
    setTemplateId("");
    setCreatorId("");
    setSelectedCommissionIds([]);
    setNotes("");
    onClose();
  };

  const handleClose = () => {
    setTemplateId("");
    setCreatorId("");
    setSelectedCommissionIds([]);
    setNotes("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear Invoice</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template */}
          <div>
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar template" /></SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Creator */}
          <div>
            <Label>Creador</Label>
            <Popover open={creatorOpen} onOpenChange={setCreatorOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={creatorOpen} className="w-full justify-between font-normal">
                  {selectedCreator ? (selectedCreator.artistic_name || selectedCreator.name) : "Seleccionar creador"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
                <Command>
                  <CommandInput placeholder="Buscar creador..." />
                  <CommandList onWheel={(e) => e.stopPropagation()}>
                    <CommandEmpty>No se encontró creador.</CommandEmpty>
                    <CommandGroup>
                      {creators.map(c => (
                        <CommandItem
                          key={c.id}
                          value={c.artistic_name || c.name}
                          onSelect={() => {
                            setCreatorId(c.id);
                            setCreatorOpen(false);
                            setSelectedCommissionIds([]);
                          }}
                        >
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

          {/* Commissions */}
          {creatorId && (
            <div>
              <Label>Comisiones</Label>
              {loadingCommissions ? (
                <p className="text-sm text-muted-foreground py-2">Cargando comisiones...</p>
              ) : commissions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No hay comisiones disponibles para este creador.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto border border-border rounded-md divide-y divide-border">
                  {commissions.map(c => (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <Checkbox
                        checked={selectedCommissionIds.includes(c.id)}
                        onCheckedChange={() => toggleCommission(c.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.period_name || c.period}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.commission_type} · {c.status}
                          {c.estimated_amount != null && ` · ${fmt(c.estimated_amount)}`}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Summary */}
          {totals.count > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1 text-sm">
              <p className="font-medium text-foreground">{totals.count} comisión{totals.count > 1 ? "es" : ""} seleccionada{totals.count > 1 ? "s" : ""}</p>
              {totals.agency > 0 && <p className="text-muted-foreground">Agency: {fmt(totals.agency)}</p>}
              {totals.blue > 0 && <p className="text-muted-foreground">Blue: {fmt(totals.blue)}</p>}
              {totals.paypal > 0 && <p className="text-muted-foreground">PayPal: {fmt(totals.paypal)}</p>}
              <p className="font-semibold text-foreground pt-1 border-t border-border">Total: {fmt(totals.grand)}</p>
              {totals.dueDate && <p className="text-muted-foreground text-xs">Vencimiento: {new Date(totals.dueDate + "T12:00:00").toLocaleDateString(f.intl("es-ES"), { day: "2-digit", month: "long", year: "numeric" })}</p>}
            </div>
          )}

          {/* Notes */}
          <div>
            <Label>Notas</Label>
            <Textarea placeholder="Notas opcionales..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isPending}>
            Crear Invoice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
