import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/ui/phone-input";
import { NewCreatorData } from "../useCloserCreators";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: NewCreatorData) => void;
  isLoading: boolean;
}

const NewCreatorModal = ({ open, onOpenChange, onSubmit, isLoading }: Props) => {
  const [form, setForm] = useState<NewCreatorData>({ instagram_handle: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.instagram_handle.trim()) return;
    onSubmit(form);
    setForm({ instagram_handle: "" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva Creator</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Instagram *</Label>
              <Input value={form.instagram_handle} onChange={(e) => setForm({ ...form, instagram_handle: e.target.value })} placeholder="@handle" />
            </div>
            <div>
              <Label>Categoría</Label>
              <Input value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Latina, Fitness..." />
            </div>
            <div>
              <Label>Fecha de paso</Label>
              <Input type="date" value={form.passed_date || ""} onChange={(e) => setForm({ ...form, passed_date: e.target.value })} />
            </div>
            <div>
              <Label>Cuenta origen</Label>
              <Input value={form.source_account || ""} onChange={(e) => setForm({ ...form, source_account: e.target.value })} />
            </div>
            <div>
              <Label>Teléfono</Label>
              <PhoneInput value={form.phone || ""} onChange={(v) => setForm({ ...form, phone: v })} />
            </div>
            <div>
              <Label>OnlyFans URL</Label>
              <Input value={form.onlyfans_url || ""} onChange={(e) => setForm({ ...form, onlyfans_url: e.target.value })} />
            </div>
            <div>
              <Label>Monetización estimada ($)</Label>
              <Input type="number" value={form.estimated_monetization || ""} onChange={(e) => setForm({ ...form, estimated_monetization: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Comisión agencia (%)</Label>
              <Input type="number" value={form.agency_commission || ""} onChange={(e) => setForm({ ...form, agency_commission: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isLoading || !form.instagram_handle.trim()}>
              {isLoading ? "Guardando..." : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewCreatorModal;
