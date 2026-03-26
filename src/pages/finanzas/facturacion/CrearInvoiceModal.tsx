import { useState, useRef, useEffect, useCallback } from "react";
import kashLogo from "@/assets/kash-logo.png";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, Maximize, Check, ChevronsUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  isPending?: boolean;
}

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

export default function CrearInvoiceModal({ open, onClose, onSubmit, isPending }: Props) {
  const [creatorId, setCreatorId] = useState("");
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [feeType, setFeeType] = useState("paypal");
  const [customFee, setCustomFee] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PayPal");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [zoom, setZoom] = useState(0.65);
  const viewerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const A4_W = 595;
  const A4_H = 842;


  const calcFitZoom = useCallback(() => {
    if (!bodyRef.current) return 0.55;
    const h = bodyRef.current.clientHeight - 32; // padding
    const w = bodyRef.current.clientWidth - 32;
    return Math.min(w / A4_W, h / A4_H, 1);
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setZoom(calcFitZoom()));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, calcFitZoom]);

  const { data: creators = [] } = useQuery({
    queryKey: ["creators-for-invoice"],
    queryFn: async () => {
      const { data, error } = await supabase.from("creators").select("id, name, artistic_name").order("name");
      if (error) throw error;
      return (data ?? []).sort((a, b) =>
        (a.artistic_name || a.name).localeCompare(b.artistic_name || b.name)
      );
    },
    enabled: open,
  });

  const amt = Number(amount) || 0;
  const feeAmount = feeType === "paypal" ? amt * 0.0349 + 0.49 : feeType === "standard" ? Number(customFee) || 0 : 0;
  const netAmount = amt - feeAmount;

  const selectedCreator = creators.find(c => c.id === creatorId);
  const today = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });

  const handleSubmit = () => {
    if (!creatorId || !amount) return;
    onSubmit({
      creator_id: creatorId,
      amount: amt,
      fee_type: feeType,
      fee_amount: feeAmount,
      net_amount: netAmount,
      payment_method: paymentMethod,
      due_date: dueDate || null,
      notes: notes || null,
      status: "borrador",
    });
    setCreatorId(""); setAmount(""); setFeeType("paypal"); setCustomFee(""); setNotes(""); setDueDate("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl p-0 flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <DialogTitle>Crear Invoice</DialogTitle>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="grid grid-cols-[400px_1fr] gap-6 h-full">
            {/* Left: Form */}
            <div className="space-y-4 overflow-y-auto min-h-0 py-6 pl-6 pr-1">
              <div>
                <Label>Creador</Label>
                <Popover open={creatorOpen} onOpenChange={setCreatorOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={creatorOpen} className="w-full justify-between font-normal">
                      {selectedCreator ? (selectedCreator.artistic_name || selectedCreator.name) : "Seleccionar creador"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[368px] p-0" align="start">
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
              <div>
                <Label>Monto</Label>
                <Input type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de Fee</Label>
                  <Select value={feeType} onValueChange={setFeeType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paypal">PayPal (3.49% + $0.49)</SelectItem>
                      <SelectItem value="standard">Standard (manual)</SelectItem>
                      <SelectItem value="none">Ninguno</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Método de Pago</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PayPal">PayPal</SelectItem>
                      <SelectItem value="Transferencia">Transferencia</SelectItem>
                      <SelectItem value="Crypto">Crypto</SelectItem>
                      <SelectItem value="Otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {feeType === "standard" && (
                <div>
                  <Label>Fee Manual</Label>
                  <Input type="number" placeholder="0" value={customFee} onChange={e => setCustomFee(e.target.value)} />
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

            {/* Right: Preview block */}
            <div className="flex flex-col min-h-0 overflow-hidden py-6 pr-6">
              <div ref={viewerRef} className="bg-muted/40 rounded-xl border border-border flex flex-col flex-1 min-h-0 overflow-hidden">
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
                      {/* Header */}
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
                        <div className="space-y-1">
                          <p className="font-semibold text-gray-800">Bill to</p>
                          <p className="text-gray-600">{selectedCreator ? (selectedCreator.artistic_name || selectedCreator.name) : "—"}</p>
                          <p className="font-semibold text-gray-800 mt-2">Address</p>
                          <p className="text-gray-600">—</p>
                          <p className="font-semibold text-gray-800 mt-2">Phone</p>
                          <p className="text-gray-600">—</p>
                        </div>
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
                              <td className="py-2 text-gray-700">Agency Service</td>
                              <td className="py-2 text-gray-500"></td>
                              <td className="py-2 text-right text-gray-800 font-medium">{fmt(amt)}</td>
                            </tr>
                            {feeAmount > 0 && (
                              <tr className="border-b border-gray-100">
                                <td className="py-2 text-gray-500">Fee ({feeType === "paypal" ? "PayPal 3.49% + $0.49" : "Manual"})</td>
                                <td className="py-2"></td>
                                <td className="py-2 text-right text-red-500">-{fmt(feeAmount)}</td>
                              </tr>
                            )}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan={2} className="pt-3 font-bold text-gray-900 text-[11px]">Total Neto</td>
                              <td className="pt-3 text-right font-bold text-gray-900 text-[11px]">{fmt(netAmount)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Footer */}
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
        <div className="px-6 py-4 border-t border-border shrink-0 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!creatorId || !amount || isPending}>Crear Invoice</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
