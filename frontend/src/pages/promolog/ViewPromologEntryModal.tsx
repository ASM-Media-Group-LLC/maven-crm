import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";
import type { PromologEntry } from "./PromologEntryCard";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: PromologEntry | null;
}

const NetworkIcon = ({ network }: { network: string }) => {
  switch (network) {
    case "instagram": return <InstagramIcon className="h-4 w-4" />;
    case "tiktok": return <TikTokIcon className="h-4 w-4" />;
    case "x": return <XIcon className="h-4 w-4" />;
    case "telegram": return <TelegramIcon className="h-4 w-4" />;
    default: return null;
  }
};

const networkLabel: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X / Twitter",
  telegram: "Telegram",
};

const resultVariant: Record<string, "success-soft" | "destructive-soft" | "warning-soft" | "secondary-soft"> = {
  "Sí": "success-soft",
  "No": "destructive-soft",
  "Parcial": "warning-soft",
  "Pendiente": "secondary-soft",
};

const ViewPromologEntryModal = ({ open, onOpenChange, entry }: Props) => {
  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Detalle de Promo
            <Badge variant="outline" className="text-xs font-mono">#{entry.ticketNumber}</Badge>
          </DialogTitle>
          <DialogDescription>Información completa de la entrada</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Model */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Modelo</p>
            <p className="text-sm font-semibold">{entry.name}</p>
            {entry.handle && (
              <p className="text-xs text-muted-foreground">@{entry.handle}</p>
            )}
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Fecha</p>
              <p className="text-sm">{entry.date}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Hora</p>
              <p className="text-sm">{entry.time}</p>
            </div>
          </div>

          {/* Network & Platform */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Red Social</p>
              <Badge variant="secondary-soft" className="gap-1.5 text-xs mt-1">
                <NetworkIcon network={entry.network} />
                {networkLabel[entry.network] || entry.network}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Plataforma</p>
              <Badge variant="primary-soft" className="text-xs mt-1">
                {entry.platform}
              </Badge>
            </div>
          </div>

          {/* Result */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Resultado</p>
            <Badge variant={resultVariant[entry.result] || "secondary-soft"} className="text-xs mt-1">
              {entry.result}
            </Badge>
          </div>

          {/* Agent */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Agente</p>
            <p className="text-sm">{entry.agent}</p>
          </div>

          {/* Notes */}
          {entry.notes && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Notas</p>
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">{entry.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ViewPromologEntryModal;
