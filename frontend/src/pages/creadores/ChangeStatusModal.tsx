import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { createOffboardingRecord } from "./useOffboarding";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface ChangeStatusModalProps {
  creatorId: string;
  creatorName: string;
  currentStatus: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusOptions = [
  { value: "active", label: "Activa", color: "bg-success" },
  { value: "onboarding", label: "Onboarding", color: "bg-primary" },
  { value: "paused", label: "Pausada", color: "bg-muted-foreground" },
  { value: "leaving", label: "Retiro", color: "bg-warning" },
  { value: "terminated", label: "Terminada", color: "bg-destructive" },
];

const ChangeStatusModal = ({
  creatorId,
  creatorName,
  currentStatus,
  open,
  onOpenChange,
}: ChangeStatusModalProps) => {
  const [newStatus, setNewStatus] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();

  const currentOption = statusOptions.find((s) => s.value === currentStatus);
  const isValid = newStatus && newStatus !== currentStatus && note.trim().length > 0;

  const handleCancel = () => {
    toast({ title: "Edición cancelada" });
    resetAndClose();
  };

  const resetAndClose = () => {
    setNewStatus("");
    setNote("");
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setSaving(true);

    try {
      const { error: updateErr } = await supabase
        .from("creators")
        .update({ status: newStatus })
        .eq("id", creatorId);
      if (updateErr) throw updateErr;

      const oldLabel = statusOptions.find((s) => s.value === currentStatus)?.label ?? currentStatus;
      const newLabel = statusOptions.find((s) => s.value === newStatus)?.label ?? newStatus;

      const { error: histErr } = await supabase.from("creator_history").insert({
        creator_id: creatorId,
        action: "Cambio de estado",
        old_value: oldLabel,
        new_value: newLabel,
        user_id: creatorId,
      });
      if (histErr) throw histErr;

      const { error: noteErr } = await supabase.from("creator_notes").insert({
        creator_id: creatorId,
        note_text: `[Cambio de estado: ${oldLabel} → ${newLabel}] ${note}`,
        created_by: creatorId,
      });
      if (noteErr) throw noteErr;

      // Auto-create offboarding record when status changes to 'leaving'
      let offboardingId: string | null = null;
      if (newStatus === "leaving" && user?.id) {
        try {
          offboardingId = await createOffboardingRecord(creatorId, user.id);
        } catch (offErr: any) {
          // Ignore duplicate — offboarding may already exist
          console.warn("Offboarding creation skipped:", offErr.message);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["creators"] });
      queryClient.invalidateQueries({ queryKey: ["creator", creatorId] });
      queryClient.invalidateQueries({ queryKey: ["creator_history", creatorId] });
      queryClient.invalidateQueries({ queryKey: ["creator_notes", creatorId] });
      queryClient.invalidateQueries({ queryKey: ["creator_offboarding", creatorId] });

      toast({
        title: "Estado actualizado exitosamente",
        description: offboardingId ? "Se creó el proceso de offboarding." : undefined,
        action: offboardingId ? (
          <Button variant="outline" size="sm" onClick={() => navigate(`/creadores/offboarding/${offboardingId}`)}>
            Ver Offboarding
          </Button>
        ) : undefined,
      });
      resetAndClose();
    } catch (err: any) {
      toast({
        title: "Error al cambiar estado",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cambiar Estado de Creadora</DialogTitle>
          <DialogDescription>{creatorName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Current status */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">Estado Actual</Label>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              {currentOption && (
                <span className={`h-2.5 w-2.5 rounded-full ${currentOption.color}`} />
              )}
              <span className="text-sm font-medium">{currentOption?.label ?? currentStatus}</span>
            </div>
          </div>

          {/* New status select */}
          <div className="space-y-1.5">
            <Label>Nuevo Estado *</Label>
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un estado" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions
                  .filter((s) => s.value !== currentStatus)
                  .map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <span className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
                        {s.label}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label>Nota Obligatoria *</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explica el motivo del cambio de estado..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Esta nota se guardará en el historial y en las notas de la creadora
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || saving}>
            {saving ? "Guardando..." : "Cambiar Estado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ChangeStatusModal;
