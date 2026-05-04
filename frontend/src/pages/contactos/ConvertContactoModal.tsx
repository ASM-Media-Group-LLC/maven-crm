import { Sparkles, Lightbulb } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type ClosersContact = Tables<"closers_contacts">;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacto: ClosersContact | null;
  onConverted: () => void;
}

const ConvertContactoModal = ({ open, onOpenChange, contacto, onConverted }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const convert = useMutation({
    mutationFn: async () => {
      if (!contacto) throw new Error("No contacto");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No se pudo obtener el usuario autenticado");
      const { error: insertError } = await supabase.from("creators").insert({
        name: contacto.name,
        instagram_handle: contacto.handle,
        country: contacto.country_code,
        category: contacto.physical_appearance,
        phone: contacto.phone,
        country_code: contacto.country_code,
        email: contacto.email,
        profile_photo_url: contacto.profile_picture_url,
        source: "contacto",
        status: "pendiente",
        internal_notes: contacto.company ? `Compañía: ${contacto.company}` : null,
        created_by: user.id,
      });
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from("closers_contacts")
        .update({ status: "converted" })
        .eq("id", contacto.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closers_contacts"] });
      queryClient.invalidateQueries({ queryKey: ["creators"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-counts"] });
      toast({ title: "Contacto convertido", description: "El creador fue creado exitosamente." });
      onConverted();
    },
    onError: () => {
      toast({ title: "Error al convertir", variant: "destructive" });
    },
  });

  if (!contacto) return null;

  const items = [
    { label: "Nombre", value: contacto.name },
    { label: "Handle", value: contacto.handle },
    { label: "País", value: contacto.country_code || "—" },
    { label: "Categoría", value: contacto.physical_appearance || "—" },
    { label: "Teléfono", value: contacto.phone ? `${contacto.country_code || ""}${contacto.phone}` : "—" },
    { label: "Email", value: contacto.email || "—" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <DialogTitle>Convertir Contacto a Creador</DialogTitle>
          </div>
          <DialogDescription>
            Este contacto será transferido al módulo de Creadoras como un nuevo perfil.
          </DialogDescription>
        </DialogHeader>

        <div className="border rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold">Datos que se transferirán</p>
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li key={item.label} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span>
                  <span className="font-medium">{item.label}:</span>{" "}
                  <span className="text-muted-foreground">{item.value}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg bg-primary/10 p-3">
          <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            El contacto quedará marcado como "Convertido" y se creará un nuevo perfil en el módulo de Creadoras.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={convert.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => convert.mutate()} disabled={convert.isPending}>
            {convert.isPending ? "Convirtiendo..." : "Confirmar Conversión"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertContactoModal;
