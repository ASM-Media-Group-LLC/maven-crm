import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChannelSoundMuted, type MuteChannel } from "@/hooks/useChannelSoundMuted";

// Silenciar el SONIDO de las notificaciones de UN canal (Messenger, WhatsApp o
// Telegram), por dispositivo. Antes vivía como altavoz en el ítem del menú;
// Jhon (09/09/2026) lo quiso en la cabecera de cada bandeja: Messenger junto
// al "+", Telegram junto al título, WhatsApp a la izquierda de "Gestionar
// canales". Rojo = silenciado.
export function BotonSilenciarCanal({ channel, className }: { channel: MuteChannel; className?: string }) {
  const { muted, toggle } = useChannelSoundMuted(channel);
  const label = muted ? "Activar sonido de notificaciones" : "Silenciar sonido de notificaciones";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={muted}
      className={cn(
        "h-8 w-8 rounded-full",
        muted ? "text-destructive hover:text-destructive" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
    </Button>
  );
}
