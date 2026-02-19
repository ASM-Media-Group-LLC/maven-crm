import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STAGES, SOURCES } from "./useDeals";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { normalizeHandle } from "@/lib/handle-utils";

interface NewDealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { prospect_handle: string; source: string; stage: string }) => void;
  isLoading?: boolean;
}

const NewDealModal = ({ open, onOpenChange, onSubmit, isLoading }: NewDealModalProps) => {
  const { toast } = useToast();
  const [prospectHandle, setProspectHandle] = useState("");
  const [source, setSource] = useState("LeadGen");
  const [stage, setStage] = useState("Nuevo");

  const handleSubmit = async () => {
    if (!prospectHandle.trim()) return;
    // Duplicate check by prospect_handle
    const normalized = normalizeHandle(prospectHandle);
    if (normalized) {
      const { data: existing } = await supabase
        .from("deals")
        .select("id, prospect_handle")
        .ilike("prospect_handle", normalized)
        .maybeSingle();
      if (existing) {
        toast({
          title: "Duplicado detectado",
          description: `Ya existe un deal con este handle: ${existing.prospect_handle}`,
          variant: "destructive",
        });
        return;
      }
    }
    onSubmit({ prospect_handle: prospectHandle.trim(), source, stage });
    setProspectHandle("");
    setSource("LeadGen");
    setStage("Nuevo");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>Crear Nuevo Deal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prospect_handle">Prospect Handle</Label>
            <Input
              id="prospect_handle"
              placeholder="@username"
              value={prospectHandle}
              onChange={(e) => setProspectHandle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Fuente</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Etapa Inicial</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!prospectHandle.trim() || isLoading}>
            Crear Deal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewDealModal;
