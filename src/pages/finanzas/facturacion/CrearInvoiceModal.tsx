import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export default function CrearInvoiceModal({ open, onClose, onSubmit, isPending }: Props) {
  const [creatorId, setCreatorId] = useState("");
  const [amount, setAmount] = useState("");
  const [feeType, setFeeType] = useState("paypal");
  const [customFee, setCustomFee] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PayPal");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const { data: creators = [] } = useQuery({
    queryKey: ["creators-for-invoice"],
    queryFn: async () => {
      const { data, error } = await supabase.from("creators").select("id, name, artistic_name").order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const amt = Number(amount) || 0;
  const feeAmount = feeType === "paypal" ? amt * 0.0349 + 0.49 : feeType === "standard" ? Number(customFee) || 0 : 0;
  const netAmount = amt - feeAmount;

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
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Crear Invoice</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Creador</Label>
            <Select value={creatorId || undefined} onValueChange={setCreatorId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar creador" /></SelectTrigger>
              <SelectContent>
                {creators.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.artistic_name || c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <div className="rounded-lg border border-border p-4 bg-muted/30 space-y-1">
            <p className="text-sm font-medium">Preview del Cálculo</p>
            <p className="text-sm text-muted-foreground">Monto: {fmt(amt)}</p>
            <p className="text-sm text-muted-foreground">Fee ({feeType}): {fmt(feeAmount)}</p>
            <p className="text-sm font-medium">Total Neto: {fmt(netAmount)}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!creatorId || !amount || isPending}>Crear Invoice</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
