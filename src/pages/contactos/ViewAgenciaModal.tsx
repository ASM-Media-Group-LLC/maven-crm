import { Building2, Globe, Mail, Phone, MapPin } from "lucide-react";
import InstagramIcon from "@/components/icons/InstagramIcon";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Agencia, estadoAgenciaConfig } from "./agenciasUtils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencia: Agencia | null;
  onEdit?: () => void;
  onDelete?: () => void;
}

const ViewAgenciaModal = ({ open, onOpenChange, agencia, onEdit, onDelete }: Props) => {
  if (!agencia) return null;
  const cfg = estadoAgenciaConfig[agencia.estado];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {agencia.nombre}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Badge variant={cfg?.variant ?? "outline"} className={cfg?.className}>
              {agencia.estado}
            </Badge>
          </div>

          {agencia.pais && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{agencia.pais}</span>
            </div>
          )}

          {agencia.contacto_nombre && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase">Contacto Principal</p>
              <p className="text-sm font-medium">{agencia.contacto_nombre}</p>
              {agencia.contacto_email && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" /> {agencia.contacto_email}
                </div>
              )}
              {agencia.contacto_telefono && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" /> {agencia.contacto_telefono}
                </div>
              )}
            </div>
          )}

          {(agencia.instagram || agencia.website) && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase">Redes</p>
              {agencia.instagram && (
                <a href={`https://instagram.com/${agencia.instagram}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:text-foreground text-muted-foreground">
                  <InstagramIcon className="h-4 w-4" /> @{agencia.instagram}
                </a>
              )}
              {agencia.website && (
                <a href={agencia.website.startsWith("http") ? agencia.website : `https://${agencia.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:text-foreground text-muted-foreground">
                  <Globe className="h-4 w-4" /> {agencia.website}
                </a>
              )}
            </div>
          )}

          {agencia.notas && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase">Notas</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{agencia.notas}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onEdit}>Editar</Button>
          <Button variant="destructive" size="sm" onClick={onDelete}>Eliminar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ViewAgenciaModal;
