import { ExternalLink, MessageCircle, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import InstagramIcon from "@/components/icons/InstagramIcon";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import type { Contacto } from "./ContactosContent";

const categoryVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "secondary-soft" | "destructive-soft"> = {
  "A+": "success-soft",
  A: "primary-soft",
  "B+": "warning-soft",
  B: "secondary-soft",
  C: "destructive-soft",
};

const countryFlags: Record<string, string> = {
  CO: "🇨🇴", MX: "🇲🇽", AR: "🇦🇷", ES: "🇪🇸", CL: "🇨🇱", PE: "🇵🇪", UY: "🇺🇾", BR: "🇧🇷", US: "🇺🇸",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacto: Contacto | null;
  onEdit: () => void;
  onDelete: () => void;
}

const ViewContactoModal = ({ open, onOpenChange, contacto, onEdit, onDelete }: Props) => {
  const { toast } = useToast();

  if (!contacto) return null;

  const flag = countryFlags[contacto.pais] || contacto.pais;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl">{contacto.nombre}</DialogTitle>
              <DialogDescription className="mt-1 space-x-2">
                <span className="font-mono">{contacto.ticket}</span>
                <span>{flag}</span>
                <span>· Ingresado por: {contacto.creadoPor}</span>
              </DialogDescription>
            </div>
            <Badge variant={categoryVariant[contacto.categoria] ?? "secondary-soft"} className="text-base px-3 py-1 shrink-0">
              {contacto.categoria}
            </Badge>
          </div>
        </DialogHeader>

        {/* Metadata badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Creado: {contacto.creacion}</Badge>
          <Badge variant="outline">0 llamadas</Badge>
          <Badge variant="outline">0 notas</Badge>
          <Badge variant="outline">Compañía</Badge>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); onEdit(); }}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
          </Button>
          <Button variant="destructive" size="sm" onClick={() => { onOpenChange(false); onDelete(); }}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Eliminar
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => toast({ title: "Funcionalidad próximamente", description: "La conversión a creador estará disponible pronto." })}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Convertir a Creadora
          </Button>
        </div>

        <Separator />

        {/* Instagram */}
        <div className="flex items-center gap-3">
          <InstagramIcon className="h-5 w-5 text-muted-foreground" />
          <a
            href={`https://instagram.com/${contacto.instagram}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            @{contacto.instagram}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* WhatsApp */}
        <div className="flex items-center gap-3">
          <MessageCircle className="h-5 w-5 text-muted-foreground" />
          <a
            href={`https://wa.me/${contacto.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            Abrir chat
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <Separator />

        {/* Historial de Interacciones */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Historial de Interacciones</h3>
            <Button variant="outline" size="sm" onClick={() => toast({ title: "Próximamente", description: "El registro de interacciones estará disponible pronto." })}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Registrar Interacción
            </Button>
          </div>
          {contacto.interacciones === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No hay interacciones registradas para este contacto. Puedes registrar llamadas, mensajes, emails, reuniones o notas.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              {contacto.interacciones} interacción(es) registrada(s).
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ViewContactoModal;
