import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { STAGES, SOURCES, Deal } from "./useDeals";

interface EditDealModalProps {
  deal: Deal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (id: string, data: { prospect_handle: string; source: string; stage: string; notes: string }) => void;
  isLoading?: boolean;
}

const EditDealModal = ({ deal, open, onOpenChange, onSubmit, isLoading }: EditDealModalProps) => {
  const [handle, setHandle] = useState("");
  const [source, setSource] = useState("LeadGen");
  const [stage, setStage] = useState("Nuevo");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (deal) {
      setHandle(deal.prospect_handle);
      setSource(deal.source);
      setStage(deal.stage);
      setNotes(deal.notes || "");
    }
  }, [deal]);

  const handleSubmit = () => {
    if (!deal || !handle.trim()) return;
    onSubmit(deal.id, { prospect_handle: handle.trim(), source, stage, notes });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>Editar Deal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Prospect Handle</Label>
            <Input value={handle} onChange={(e) => setHandle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Fuente</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Etapa</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas del deal..." className="resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!handle.trim() || isLoading}>
            {isLoading ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditDealModal;
