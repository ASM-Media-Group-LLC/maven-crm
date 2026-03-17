import { useState } from "react";
import { Copy, ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useUpdateEvento } from "../useEventos";
import { getPublicBaseUrl } from "@/lib/getPublicUrl";

interface Props {
  eventId: string;
  internalToken: string | null;
  externalToken: string | null;
  externalLinkExpiresAt: string | null;
}

const LinksTab = ({ eventId, internalToken, externalToken, externalLinkExpiresAt }: Props) => {
  const { toast } = useToast();
  const updateEvento = useUpdateEvento();
  const [expiresAt, setExpiresAt] = useState(externalLinkExpiresAt ?? "");

  const baseUrl = window.location.origin;
  const internalLink = `${baseUrl}/eventos/${eventId}`;
  const externalLink = externalToken ? `${getPublicBaseUrl()}/eventos/share/${externalToken}` : null;

  const copyLink = (link: string, label: string) => {
    navigator.clipboard.writeText(link);
    toast({ title: `${label} copiado al portapapeles` });
  };

  const handleSaveExpiration = async () => {
    try {
      await updateEvento.mutateAsync({
        id: eventId,
        data: { external_link_expires_at: expiresAt || null },
      });
      toast({ title: "Fecha de expiración actualizada" });
    } catch {
      toast({ title: "Error al actualizar", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Internal link */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">Enlace Interno</h4>
        </div>
        <p className="text-xs text-muted-foreground">
          Solo para equipo interno autenticado. Permite gestionar invitados, checklist y métricas.
        </p>
        <div className="flex gap-2">
          <Input value={internalLink} readOnly className="text-xs" />
          <Button variant="outline" size="icon" onClick={() => copyLink(internalLink, "Enlace interno")}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* External sharelink */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-accent" />
          <h4 className="text-sm font-semibold">Sharelink Externo</h4>
        </div>
        <p className="text-xs text-muted-foreground">
          Para modelos e invitados externos. Permite confirmar o cancelar asistencia. No expone información interna.
        </p>
        {externalLink ? (
          <div className="flex gap-2">
            <Input value={externalLink} readOnly className="text-xs" />
            <Button variant="outline" size="icon" onClick={() => copyLink(externalLink, "Sharelink externo")}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No se ha generado un token externo.</p>
        )}

        {/* Expiration */}
        <div className="space-y-2 pt-2 border-t border-border">
          <label className="text-xs font-medium">Fecha de expiración (opcional)</label>
          <div className="flex gap-2">
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="text-xs flex-1"
            />
            <Button variant="outline" size="sm" onClick={handleSaveExpiration}>
              Guardar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LinksTab;
