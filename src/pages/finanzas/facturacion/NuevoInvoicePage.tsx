import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import kashLogo from "@/assets/kash-logo.png";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Minus, Plus, Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

const A4_W = 595;
const A4_H = 842;

export default function NuevoInvoicePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [creatorId, setCreatorId] = useState("");
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [zoom, setZoom] = useState(0.65);
  const bodyRef = useRef<HTMLDivElement>(null);

  const calcFitZoom = useCallback(() => {
    if (!bodyRef.current) return 0.55;
    const h = bodyRef.current.clientHeight - 32;
    const w = bodyRef.current.clientWidth - 32;
    return Math.min(w / A4_W, h / A4_H, 1);
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setZoom(calcFitZoom()));
    ro.observe(el);
    return () => ro.disconnect();
  }, [calcFitZoom]);

  const { data: creators = [] } = useQuery({
    queryKey: ["creators-for-invoice"],
    queryFn: async () => {
      const { data, error } = await supabase.from("creators").select("id, name, artistic_name, phone, creator_business(billing_address)").order("name");
      if (error) throw error;
      return (data ?? []).sort((a, b) =>
        (a.artistic_name || a.name).localeCompare(b.artistic_name || b.name)
      );
    },
  });

  // Auto-fetch commissions when creator + date range are set
  const { data: commissions = [], isLoading: loadingCommissions } = useQuery({
    queryKey: ["invoice-commissions", creatorId, dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commissions")
        .select("id, final_amount, base_amount, percentage, period, period_start, period_end, calculation_config")
        .eq("creator_id", creatorId)
        .gte("period_start", dateFrom)
        .lte("period_end", dateTo);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!creatorId && !!dateFrom && !!dateTo,
  });

  // Fetch creator_business for payment_method
  const { data: creatorBusiness } = useQuery({
    queryKey: ["creator-business-invoice", creatorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_business")
        .select("payment_method")
        .eq("creator_id", creatorId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!creatorId,
  });

  // Calculate breakdown from commissions
  const agencyTotal = commissions.reduce((acc, c) => {
    const cfg = (c.calculation_config || {}) as Record<string, any>;
    const pct = Number(cfg.percentage || c.percentage || 0);
    return acc + (Number(c.base_amount) || 0) * (pct / 100);
  }, 0);

  const blueTotal = commissions.reduce((acc, c) => {
    const cfg = (c.calculation_config || {}) as Record<string, any>;
    return acc + (cfg.blue_package ? Number(cfg.blue_amount || 0) : 0);
  }, 0);

  const restante = commissions.reduce((acc, c) => {
    const cfg = (c.calculation_config || {}) as Record<string, any>;
    const pct = Number(cfg.percentage || c.percentage || 0);
    const base = Number(c.base_amount) || 0;
    return acc + (base - base * (pct / 100));
  }, 0);

  const paymentMethod = creatorBusiness?.payment_method || "";
  const paypalAmount = paymentMethod === "PayPal" ? restante * 0.05 : 0;
  const grandTotal = agencyTotal + blueTotal + paypalAmount;

  const createInvoice = useMutation({
    mutationFn: async (payload: any) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("invoices").insert({ ...payload, created_by: user.user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Invoice creado" });
      navigate("/finanzas/facturacion");
    },
    onError: () => toast({ title: "Error al crear", variant: "destructive" }),
  });

  const selectedCreator = creators.find(c => c.id === creatorId);
  const today = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });

  const handleSubmit = () => {
    if (!creatorId || !dateFrom || !dateTo || grandTotal === 0) return;
    createInvoice.mutate({
      creator_id: creatorId,
      amount: grandTotal,
      agency_amount: agencyTotal,
      blue_amount: blueTotal,
      paypal_amount: paypalAmount,
      net_amount: grandTotal,
      due_date: dueDate || null,
      notes: notes || null,
      status: "borrador",
      period_start: dateFrom || null,
      period_end: dateTo || null,
    } as any);
  };

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      {/* Header */}
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <nav className="text-sm text-muted-foreground mb-2">
          <button onClick={() => navigate("/finanzas/facturacion")} className="hover:text-foreground transition-colors">Facturación</button>
          <span className="mx-2">›</span>
          <span className="text-foreground font-medium">Nuevo Invoice</span>
        </nav>
        <button
          onClick={() => navigate("/finanzas/facturacion")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> Volver
        </button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" /> Nuevo Invoice
        </h1>
        <p className="text-sm text-muted-foreground">Crea un nuevo invoice para un creador</p>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 min-h-0">
        <div className="grid grid-cols-[400px_1fr] gap-8 h-full max-w-[1400px] mx-auto">
          {/* Left: Form */}
          <div className="space-y-4 overflow-y-auto min-h-0">
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
                    <CommandList>
                      <CommandEmpty>No se encontró creador.</CommandEmpty>
                      <CommandGroup>
                        {creators.map(c => (
                          <CommandItem
                            key={c.id}
                            value={c.artistic_name || c.name}
                            onSelect={() => { setCreatorId(c.id); setCreatorOpen(false); }}
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Fecha inicio</Label>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div>
                <Label>Fecha fin</Label>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
            </div>

            {/* Commission summary */}
            {creatorId && dateFrom && dateTo && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                {loadingCommissions ? (
                  <p className="text-muted-foreground">Buscando comisiones...</p>
                ) : commissions.length > 0 ? (
                  <p className="text-foreground">
                    <span className="font-semibold">{commissions.length}</span> comisión(es) encontrada(s) — Total: <span className="font-semibold">{fmt(grandTotal)}</span>
                  </p>
                ) : (
                  <p className="text-muted-foreground">No se encontraron comisiones en este periodo.</p>
                )}
              </div>
            )}

            <div>
              <Label>Fecha de Vencimiento</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label>Notas</Label>
              <Textarea placeholder="Notas opcionales..." value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {/* Right: Preview */}
          <div className="flex flex-col min-h-0 overflow-hidden">
            <div className="bg-muted/40 rounded-xl border border-border flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Preview header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 shrink-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Vista previa</p>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(2)))}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs font-medium w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* A4 viewer */}
              <div ref={bodyRef} className="flex-1 min-h-0 overflow-auto">
                <div style={{ display: 'grid', placeItems: 'start center', minHeight: '100%', padding: 16 }}>
                  <div style={{ width: A4_W * zoom, height: A4_H * zoom, flexShrink: 0 }}>
                    <div
                      style={{ width: A4_W, height: A4_H, transform: `scale(${zoom})`, transformOrigin: "top left" }}
                      className="bg-white rounded shadow-2xl border border-border/50 p-10 font-serif text-black text-[11px] leading-relaxed flex flex-col"
                    >
                      {/* Document Header */}
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h2 className="text-lg font-bold tracking-tight text-gray-900">Invoice</h2>
                          <p className="text-[9px] text-gray-400 mt-0.5">KASH AGENCY</p>
                          <p className="text-[9px] text-gray-400">333 SE 2nd Ave</p>
                          <p className="text-[9px] text-gray-400">Miami, FL 33131-2176</p>
                          <p className="text-[9px] text-gray-400">kash@exclusivecontent.me</p>
                        </div>
                        <div>
                          <img src={kashLogo} alt="KASH" className="h-14 object-contain" />
                        </div>
                      </div>

                      <div className="h-px bg-gray-200 mb-4" />

                      <div className="flex justify-between mb-5 text-[9px]">
                        {(() => {
                          const creatorName = selectedCreator ? (selectedCreator.artistic_name || selectedCreator.name) : "—";
                          const cb = selectedCreator?.creator_business;
                          const biz = Array.isArray(cb) ? cb[0] : cb;
                          const billingAddress = biz?.billing_address || "—";
                          const creatorPhone = selectedCreator?.phone || "—";
                          const creatorUuid = selectedCreator?.id || "—";
                          return (
                            <div className="grid grid-cols-[auto_auto_auto_auto] gap-x-4 gap-y-1">
                              <p className="font-semibold text-gray-800">Bill to</p>
                              <p className="text-gray-600">{creatorName}</p>
                              <p className="font-semibold text-gray-800">ID</p>
                              <p className="text-gray-600 text-[7px] leading-relaxed break-all">{creatorUuid}</p>

                              <p className="font-semibold text-gray-800">Address</p>
                              <p className="text-gray-600">{billingAddress}</p>
                              <p /><p />

                              <p className="font-semibold text-gray-800">Phone</p>
                              <p className="text-gray-600">{creatorPhone}</p>
                              <p /><p />
                            </div>
                          );
                        })()}
                        <div className="space-y-1 text-right">
                          <p className="font-semibold text-gray-800">Invoice details</p>
                          <p><span className="font-semibold text-gray-800">Invoice no.: </span><span className="text-gray-600">—</span></p>
                          <p><span className="font-semibold text-gray-800">Invoice date: </span><span className="text-gray-600">{today}</span></p>
                          {dueDate && (
                            <p><span className="font-semibold text-gray-800">Due date: </span><span className="text-gray-600">{new Date(dueDate + "T12:00:00").toLocaleDateString("es-ES")}</span></p>
                          )}
                        </div>
                      </div>

                      {/* Table */}
                      <div className="flex-1">
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="text-left py-1.5 font-semibold text-gray-500 uppercase tracking-wider text-[8px]">Product or service</th>
                              <th className="text-left py-1.5 font-semibold text-gray-500 uppercase tracking-wider text-[8px]">Description</th>
                              <th className="text-right py-1.5 font-semibold text-gray-500 uppercase tracking-wider text-[8px]">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-gray-100">
                              <td className="py-2 text-gray-700">Agency Services</td>
                              <td className="py-2 text-gray-500">
                                {dateFrom && dateTo ? `${dateFrom} — ${dateTo}` : ""}
                              </td>
                              <td className="py-2 text-right text-gray-800 font-medium">{fmt(agencyTotal)}</td>
                            </tr>
                            {blueTotal > 0 && (
                              <tr className="border-b border-gray-100">
                                <td className="py-2 text-gray-700">Blue</td>
                                <td className="py-2 text-gray-500"></td>
                                <td className="py-2 text-right text-gray-800 font-medium">{fmt(blueTotal)}</td>
                              </tr>
                            )}
                            {paypalAmount > 0 && (
                              <tr className="border-b border-gray-100">
                                <td className="py-2 text-gray-700">PayPal</td>
                                <td className="py-2 text-gray-500">5% del restante</td>
                                <td className="py-2 text-right text-gray-800 font-medium">{fmt(paypalAmount)}</td>
                              </tr>
                            )}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan={2} className="pt-3 font-bold text-gray-900 text-[11px]">Total</td>
                              <td className="pt-3 text-right font-bold text-gray-900 text-[11px]">{fmt(grandTotal)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Document Footer */}
                      <div className="mt-auto space-y-2 pt-4">
                        {notes && (
                          <div className="text-[9px]">
                            <span className="text-gray-400">Notes: </span>
                            <span className="text-gray-600 italic">{notes}</span>
                          </div>
                        )}
                        <div className="h-px bg-gray-200 mt-3" />
                        <p className="text-[8px] text-gray-300 text-center pt-1">
                          Documento generado por KASH AGENCY · {today}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-background px-6 py-4 border-t border-border shrink-0 flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate("/finanzas/facturacion")}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={!creatorId || !dateFrom || !dateTo || grandTotal === 0 || createInvoice.isPending}>
          Crear Invoice
        </Button>
      </footer>
    </main>
  );
}
