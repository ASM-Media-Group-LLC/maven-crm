import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStartOnboarding, AGENCY_ORDER, type ProspectRecord } from "./useProspectos";

interface Props {
  prospect: ProspectRecord | null;
  onClose: () => void;
}

export default function StartOnboardingModal({ prospect, onClose }: Props) {
  const [agency, setAgency] = useState(prospect?.agency || "");
  const mutation = useStartOnboarding();

  if (!prospect) return null;

  return (
    <Dialog open={!!prospect} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Iniciar Onboarding</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Perfil</Label>
            <p className="text-sm font-medium">{prospect.name}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Agencia <span className="text-destructive">*</span></Label>
            <Select value={agency} onValueChange={setAgency}>
              <SelectTrigger><SelectValue placeholder="Seleccionar agencia..." /></SelectTrigger>
              <SelectContent>
                {AGENCY_ORDER.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button
              disabled={!agency || mutation.isPending}
              onClick={() => mutation.mutate({ prospect, agency })}
            >
              {mutation.isPending ? "Iniciando..." : "Confirmar e Iniciar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
