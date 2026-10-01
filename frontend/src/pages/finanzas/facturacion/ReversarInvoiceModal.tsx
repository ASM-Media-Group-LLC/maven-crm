import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  open: boolean;
  onClose: () => void;
  invoice: any;
  onSubmit: (id: string, reason: string) => void;
  isPending?: boolean;
}

export default function ReversarInvoiceModal({ open, onClose, invoice, onSubmit, isPending }: Props) {
  const { t } = useLanguage();
  const [reason, setReason] = useState("");

  const handleSubmit = () => {
    if (!reason.trim() || !invoice) return;
    onSubmit(invoice.id, reason);
    setReason("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("finanzas.billing.reverseModal.title", { number: invoice?.invoice_number ?? "" })}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("finanzas.billing.reverseModal.desc")}</p>
          <div>
            <Label>{t("finanzas.billing.reverseModal.reason")}</Label>
            <Textarea placeholder={t("finanzas.billing.reverseModal.reasonPlaceholder")} value={reason} onChange={e => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={!reason.trim() || isPending}>{t("finanzas.billing.reverseModal.confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
