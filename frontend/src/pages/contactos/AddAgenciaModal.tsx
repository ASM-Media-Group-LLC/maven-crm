import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
import { AGENCIA_ESTADOS } from "./agenciasUtils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AddAgenciaModal = ({ open, onOpenChange }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    nombre: "", estado: "Discovery", pais: "", contacto_nombre: "", contacto_email: "", contacto_telefono: "", instagram: "", website: "", notas: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("agencies").insert({
        name: form.nombre,
        status: form.estado,
        country_code: form.pais || null,
        contact_name: form.contacto_nombre || null,
        email: form.contacto_email || null,
        phone: form.contacto_telefono || null,
        website: form.website || null,
        notes: form.notas || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agencies"] });
      toast({ title: "Agencia creada exitosamente" });
      onOpenChange(false);
      setForm({ nombre: "", estado: "Discovery", pais: "", contacto_nombre: "", contacto_email: "", contacto_telefono: "", instagram: "", website: "", notas: "" });
    },
    onError: (err: any) => {
      toast({ title: "Error al crear agencia", description: err.message, variant: "destructive" });
    },
  });

  const update = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Agregar Agencia</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Nombre *</Label><Input value={form.nombre} onChange={(e) => update("nombre", e.target.value)} placeholder="Nombre de la agencia" /></div>
          <div className="space-y-2"><Label>Estado</Label><Select value={form.estado} onValueChange={(v) => update("estado", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{AGENCIA_ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>País</Label><Input value={form.pais} onChange={(e) => update("pais", e.target.value)} placeholder="País" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Contacto Principal</Label><Input value={form.contacto_nombre} onChange={(e) => update("contacto_nombre", e.target.value)} placeholder="Nombre" /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.contacto_email} onChange={(e) => update("contacto_email", e.target.value)} placeholder="email@agencia.com" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Teléfono</Label><Input value={form.contacto_telefono} onChange={(e) => update("contacto_telefono", e.target.value)} placeholder="+1 234 567 8900" /></div>
            <div className="space-y-2"><Label>Instagram</Label><Input value={form.instagram} onChange={(e) => update("instagram", e.target.value)} placeholder="@handle" /></div>
          </div>
          <div className="space-y-2"><Label>Website</Label><Input value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://agencia.com" /></div>
          <div className="space-y-2"><Label>Notas</Label><Textarea value={form.notas} onChange={(e) => update("notas", e.target.value)} placeholder="Notas adicionales..." rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.nombre || mutation.isPending}>{mutation.isPending ? "Guardando..." : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddAgenciaModal;
