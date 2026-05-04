import { useState, useEffect } from "react";
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
import { type Agencia, AGENCIA_ESTADOS } from "./agenciasUtils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencia: Agencia | null;
}

const EditAgenciaModal = ({ open, onOpenChange, agencia }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    nombre: "", estado: "Discovery", pais: "", contacto_nombre: "", contacto_email: "", contacto_telefono: "", instagram: "", website: "", notas: "",
  });

  useEffect(() => {
    if (agencia) {
      setForm({
        nombre: agencia.nombre,
        estado: agencia.estado,
        pais: agencia.pais ?? "",
        contacto_nombre: agencia.contacto_nombre ?? "",
        contacto_email: agencia.contacto_email ?? "",
        contacto_telefono: agencia.contacto_telefono ?? "",
        instagram: agencia.instagram ?? "",
        website: agencia.website ?? "",
        notas: agencia.notas ?? "",
      });
    }
  }, [agencia]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!agencia) return;
      const { error } = await supabase.from("agencies").update({
        name: form.nombre,
        status: form.estado,
        country_code: form.pais || null,
        contact_name: form.contacto_nombre || null,
        email: form.contacto_email || null,
        phone: form.contacto_telefono || null,
        website: form.website || null,
        notes: form.notas || null,
      }).eq("id", agencia.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agencies"] });
      toast({ title: "Agencia actualizada" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error al actualizar", description: err.message, variant: "destructive" });
    },
  });

  const update = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  if (!agencia) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar Agencia</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Nombre *</Label><Input value={form.nombre} onChange={(e) => update("nombre", e.target.value)} /></div>
          <div className="space-y-2"><Label>Estado</Label><Select value={form.estado} onValueChange={(v) => update("estado", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{AGENCIA_ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>País</Label><Input value={form.pais} onChange={(e) => update("pais", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Contacto Principal</Label><Input value={form.contacto_nombre} onChange={(e) => update("contacto_nombre", e.target.value)} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.contacto_email} onChange={(e) => update("contacto_email", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Teléfono</Label><Input value={form.contacto_telefono} onChange={(e) => update("contacto_telefono", e.target.value)} /></div>
            <div className="space-y-2"><Label>Instagram</Label><Input value={form.instagram} onChange={(e) => update("instagram", e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>Website</Label><Input value={form.website} onChange={(e) => update("website", e.target.value)} /></div>
          <div className="space-y-2"><Label>Notas</Label><Textarea value={form.notas} onChange={(e) => update("notas", e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.nombre || mutation.isPending}>{mutation.isPending ? "Guardando..." : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditAgenciaModal;
