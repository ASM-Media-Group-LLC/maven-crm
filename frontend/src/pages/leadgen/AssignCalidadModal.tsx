import { useState, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useUpdateLeadQuality } from "./useLeadGen";
import { useToast } from "@/hooks/use-toast";
import type { LeadGenEntry } from "./useLeadGen";

const calidadColors: Record<string, string> = {
  "a+": "bg-primary text-primary-foreground",
  a: "bg-green-500 text-white",
  "b+": "bg-yellow-500 text-white",
  b: "bg-muted text-muted-foreground",
  c: "bg-destructive text-destructive-foreground",
};

const calidadOptions = [
  { value: "a+", label: "A+ — Top calidad" },
  { value: "a", label: "A — Alta calidad" },
  { value: "b+", label: "B+ — Buena calidad" },
  { value: "b", label: "B — Calidad estándar" },
  { value: "c", label: "C — Baja calidad" },
];

const puntuacionOptions = [
  { value: "alto", label: "Alto — Excelente trabajo" },
  { value: "medio", label: "Medio — Trabajo aceptable" },
  { value: "bajo", label: "Bajo — Necesita mejorar" },
];

const getTicketId = (entry: LeadGenEntry) =>
  entry.ticket_number || `#LG${entry.id.slice(-7).toUpperCase()}`;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: LeadGenEntry | null;
}

const AssignCalidadModal = ({ open, onOpenChange, lead }: Props) => {
  const [calidad, setCalidad] = useState("");
  const [puntuacion, setPuntuacion] = useState("");
  const [comentario, setComentario] = useState("");
  const { mutate: updateQuality, isPending } = useUpdateLeadQuality();
  const { toast } = useToast();

  useEffect(() => {
    if (lead && open) {
      setCalidad(lead.quality.toLowerCase());
      setPuntuacion("");
      setComentario("");
    }
  }, [lead, open]);

  if (!lead) return null;

  const currentCat = lead.quality.toLowerCase();
  const isValid = calidad && (!comentario || comentario.length >= 3);

  const handleSave = () => {
    if (!isValid) return;
    updateQuality(
      { id: lead.id, quality: calidad },
      {
        onSuccess: () => {
          toast({ title: "Calidad actualizada", description: `Se asignó ${calidad.toUpperCase()} correctamente.` });
          onOpenChange(false);
        },
        onError: () => {
          toast({ title: "Error", description: "No se pudo actualizar la calidad.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader className="pr-8">
          <DialogTitle>Asignar Calidad — {getTicketId(lead)}</DialogTitle>
          <DialogDescription>Asigna o cambia la calidad de este lead.</DialogDescription>
        </DialogHeader>

        <Card className="p-4">
          <div className="flex items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Calidad Actual</span>
              <div className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold ${calidadColors[currentCat] ?? "bg-muted text-muted-foreground"}`}>
                {lead.quality.toUpperCase()}
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground mt-4" />
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Nueva Calidad</span>
              <div className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold ${calidadColors[calidad] ?? "bg-muted text-muted-foreground"}`}>
                {calidad ? calidad.toUpperCase() : "—"}
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Calidad del Modelo</Label>
            <Select value={calidad} onValueChange={setCalidad}>
              <SelectTrigger><SelectValue placeholder="Seleccionar calidad" /></SelectTrigger>
              <SelectContent>
                {calidadOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Puntuación del Trabajo</Label>
            <Select value={puntuacion} onValueChange={setPuntuacion}>
              <SelectTrigger><SelectValue placeholder="Seleccionar puntuación" /></SelectTrigger>
              <SelectContent>
                {puntuacionOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Comentario</Label>
            <Textarea
              placeholder="Razón de la calificación..."
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Opcional. Si escribes una nota, debe tener al menos 3 caracteres.
            </p>
          </div>

          <Button className="w-full" disabled={!isValid || isPending} onClick={handleSave}>
            {isPending ? "Guardando..." : "Guardar Calificación"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssignCalidadModal;
