import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import PaymentNoteA4Preview from "./PaymentNoteA4Preview";
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
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import { metodoDePago, tipoDePago } from "../estados";

const A4_W = 595;
const A4_H = 842;

export default function NuevaNotaPagoPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [creatorId, setCreatorId] = useState("");
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState("Standard");
  const [paymentMethod, setPaymentMethod] = useState("PayPal");
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
    queryKey: ["creators-for-payment-note"],
    queryFn: async () => {
      const { data, error } = await supabase.from("creators").select("id, name, artistic_name").order("name");
      if (error) throw error;
      return (data ?? []).sort((a, b) =>
        (a.artistic_name || a.name).localeCompare(b.artistic_name || b.name)
      );
    },
  });

  const createPaymentNote = useMutation({
    mutationFn: async (payload: any) => {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("creator_payments").insert({ ...payload, created_by: user.user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_notes"] });
      toast({ title: t("finanzas.note.toast.created") });
      navigate("/finanzas/facturacion/invoices");
    },
    onError: () => toast({ title: t("common.errorCreating"), variant: "destructive" }),
  });

  const amt = Number(amount) || 0;
  const selectedCreator = creators.find(c => c.id === creatorId);

  const handleSubmit = () => {
    if (!creatorId || !amount || !dueDate) return;
    createPaymentNote.mutate({
      creator_id: creatorId,
      amount: amt,
      payment_type: paymentType,
      payment_method: paymentMethod,
      due_date: dueDate,
      notes: notes || null,
      status: "pending",
    });
  };

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      {/* Header */}
      <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <nav className="text-sm text-muted-foreground mb-2">
          <button onClick={() => navigate("/finanzas/facturacion/invoices")} className="hover:text-foreground transition-colors">{t("finanzas.common.billing")}</button>
          <span className="mx-2">›</span>
          <span className="text-foreground font-medium">{t("finanzas.note.new.title")}</span>
        </nav>
        <button
          onClick={() => navigate("/finanzas/facturacion/invoices")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> {t("common.back")}
        </button>
        <PageHeader
          title={t("finanzas.note.new.title")}
          subtitle={t("finanzas.note.new.subtitle")}
          icon={<FileText className="h-6 w-6" />}
        />
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 min-h-0">
        <div className="grid grid-cols-[400px_1fr] gap-8 h-full max-w-[1400px] mx-auto">
          {/* Left: Form */}
          <div className="space-y-4 overflow-y-auto min-h-0">
            <div>
              <Label>{t("finanzas.common.creator")}</Label>
              <Popover open={creatorOpen} onOpenChange={setCreatorOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={creatorOpen} className="w-full justify-between font-normal">
                    {selectedCreator ? (selectedCreator.artistic_name || selectedCreator.name) : t("finanzas.common.selectCreator")}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
                  <Command>
                    <CommandInput placeholder={t("finanzas.common.searchCreator")} />
                    <CommandList>
                      <CommandEmpty>{t("finanzas.common.creatorNotFound")}</CommandEmpty>
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
              <Label>{t("finanzas.common.amount")}</Label>
              <Input type="number" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("finanzas.note.new.paymentType")}</Label>
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {/* El value se guarda y sale impreso en la nota: solo se traduce la etiqueta. */}
                    {["Standard", "Adelanto", "Bonus", "Ajuste"].map(tipo => (
                      <SelectItem key={tipo} value={tipo}>{tipoDePago(t, tipo)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("finanzas.common.paymentMethod")}</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["PayPal", "Transferencia", "Crypto", "Otro"].map(metodo => (
                      <SelectItem key={metodo} value={metodo}>{metodoDePago(t, metodo)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{t("finanzas.common.dueDateLong")}</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label>{t("finanzas.common.notes")}</Label>
              <Textarea placeholder={t("finanzas.common.optionalNotes")} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {/* Right: Preview */}
          <div className="flex flex-col min-h-0 overflow-hidden">
            <div className="bg-muted/40 rounded-xl border border-border flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Preview header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 shrink-0">
                <p className="text-xs font-medium text-muted-foreground">{t("finanzas.common.preview")}</p>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(2)))} aria-label={t("finanzas.common.zoomOut")}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs font-medium w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))} aria-label={t("finanzas.common.zoomIn")}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* A4 viewer */}
              <div ref={bodyRef} className="flex-1 min-h-0 overflow-auto">
                <div style={{ display: 'grid', placeItems: 'start center', minHeight: '100%', padding: 16 }}>
                  {/* El documento en sí: el mismo componente que dibuja la nota guardada.
                      Sale en español siempre (es lo que recibe la creadora). */}
                  <PaymentNoteA4Preview
                    zoom={zoom}
                    note={{
                      amount: amt,
                      payment_type: paymentType,
                      payment_method: paymentMethod,
                      due_date: dueDate || undefined,
                      notes: notes || undefined,
                      created_at: new Date().toISOString(),
                      _creator: selectedCreator ? { name: selectedCreator.name, artistic_name: selectedCreator.artistic_name } : undefined,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-background px-6 py-4 border-t border-border shrink-0 flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate("/finanzas/facturacion/invoices")}>{t("common.cancel")}</Button>
        <Button onClick={handleSubmit} disabled={!creatorId || !amount || !dueDate || createPaymentNote.isPending}>{t("finanzas.note.new.create")}</Button>
      </footer>
    </main>
  );
}
