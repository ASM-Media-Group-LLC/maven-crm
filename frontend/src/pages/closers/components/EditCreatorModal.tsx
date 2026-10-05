import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CloserCreator, STAGES } from "../useCloserCreators";
import { useLanguage } from "@/hooks/useLanguage";
import { stageLabel } from "../hooks/useCloserLeads";

interface Props {
  creator: CloserCreator | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (id: string, data: Partial<CloserCreator>) => void;
  isLoading: boolean;
}

const EditCreatorModal = ({ creator, open, onOpenChange, onSubmit, isLoading }: Props) => {
  const { t } = useLanguage();
  const [form, setForm] = useState<Partial<CloserCreator>>({});

  useEffect(() => {
    if (creator) setForm({ ...creator });
  }, [creator]);

  if (!creator) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(creator.id, form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("closers.creator.edit")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Instagram</Label>
              <Input value={form.instagram_handle || ""} onChange={(e) => setForm({ ...form, instagram_handle: e.target.value })} />
            </div>
            <div>
              <Label>{t("common.category")}</Label>
              <Input value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </div>
            <div>
              <Label>{t("closers.passedDate")}</Label>
              <Input type="date" value={form.passed_date || ""} onChange={(e) => setForm({ ...form, passed_date: e.target.value })} />
            </div>
            <div>
              <Label>{t("closers.sourceAccount")}</Label>
              <Input value={form.source_account || ""} onChange={(e) => setForm({ ...form, source_account: e.target.value })} />
            </div>
            <div>
              <Label>{t("common.phone")}</Label>
              <PhoneInput value={form.phone || ""} onChange={(v) => setForm({ ...form, phone: v })} />
            </div>
            <div>
              <Label>OnlyFans URL</Label>
              <Input value={form.onlyfans_url || ""} onChange={(e) => setForm({ ...form, onlyfans_url: e.target.value })} />
            </div>
            <div>
              <Label>{t("closers.estimatedMonetizationUsd")}</Label>
              <Input type="number" value={form.estimated_monetization ?? ""} onChange={(e) => setForm({ ...form, estimated_monetization: Number(e.target.value) })} />
            </div>
            <div>
              <Label>{t("closers.agencyCommissionPct")}</Label>
              <Input type="number" value={form.agency_commission ?? ""} onChange={(e) => setForm({ ...form, agency_commission: Number(e.target.value) })} />
            </div>
            <div>
              <Label>{t("closers.monthlyMonetizationUsd")}</Label>
              <Input type="number" value={form.monthly_monetization ?? ""} onChange={(e) => setForm({ ...form, monthly_monetization: Number(e.target.value) })} />
            </div>
            <div>
              <Label>{t("common.status")}</Label>
              <Select value={form.stage || "Asignada"} onValueChange={(v) => setForm({ ...form, stage: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => <SelectItem key={s} value={s}>{stageLabel(t, s)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>{t("closers.rejectionReason")}</Label>
            <Input value={form.rejection_reason || ""} onChange={(e) => setForm({ ...form, rejection_reason: e.target.value })} />
          </div>
          <div>
            <Label>{t("closers.notes")}</Label>
            <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={isLoading}>{isLoading ? t("closers.saving") : t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditCreatorModal;
