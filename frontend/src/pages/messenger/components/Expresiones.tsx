import { useState } from "react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SelectorDeEmojis from "@/components/chat/SelectorDeEmojis";
import { GifPanel } from "@/pages/inbox/GifPicker";
import { StickerPanel } from "@/pages/inbox/StickerPicker";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

// Un solo botón para emojis, GIF y stickers, como WhatsApp. Es la versión del
// TELÉFONO: en escritorio siguen la barra de emojis arriba del cajón y los dos
// botones separados (GIF, sticker), que ahí caben y se ven de un vistazo. En
// el celular tres controles más una fila de emojis se comían media pantalla.
export default function Expresiones({
  favoritos,
  onEmoji,
  onGif,
  onSticker,
  disabled,
  className,
  iconClassName,
}: {
  /** Los emojis frecuentes del usuario (los de la barra de escritorio). */
  favoritos: string[];
  onEmoji: (emoji: string) => void;
  onGif: (mp4Url: string) => void;
  onSticker: (url: string) => void;
  disabled?: boolean;
  className?: string;
  /** Clases del icono (tamaño/trazo). Dentro del cajón del teléfono va más grande. */
  iconClassName?: string;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("emojis");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-primary/8 hover:text-foreground", className)}
          disabled={disabled}
          title={t("messenger.expr.titulo")}
          aria-label={t("messenger.expr.titulo")}
          data-testid="expresiones"
        >
          <Smile className={cn("h-5 w-5", iconClassName)} strokeWidth={2.1} />
        </Button>
      </PopoverTrigger>
      {/* Alto FIJO: cada pestaña rellena el mismo espacio y scrollea adentro. Con
          alto libre el panel saltaba al cambiar de pestaña (emojis largo, GIF con
          spinner, stickers según cuántos haya). */}
      <PopoverContent align="start" side="top" collisionPadding={8} className="flex h-[400px] max-h-[70dvh] w-[calc(100vw-1.5rem)] max-w-md flex-col p-2">
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          {/* h-9 con p-1 deja 28 px para las pestañas (text-xs + py-1.5 = 28): con h-8
              la pastilla activa se salía del contenedor por arriba y por abajo. */}
          <TabsList className="grid h-9 w-full shrink-0 grid-cols-3">
            <TabsTrigger value="emojis" className="py-1.5 text-xs">Emojis</TabsTrigger>
            <TabsTrigger value="gif" className="py-1.5 text-xs">GIF</TabsTrigger>
            <TabsTrigger value="stickers" className="py-1.5 text-xs">Stickers</TabsTrigger>
          </TabsList>

          {/* El selector de Google (components/chat/SelectorDeEmojis): buscador,
              categorías y «Uso frecuente» con los de la barra de escritorio. */}
          <TabsContent value="emojis" className="mt-2 min-h-0 flex-1">
            <SelectorDeEmojis className="h-full" frecuentes={favoritos} onElegir={onEmoji} />
          </TabsContent>

          <TabsContent value="gif" className="mt-2 min-h-0 flex-1">
            <GifPanel rellenar activo={open && tab === "gif"} onPick={(url) => { onGif(url); setOpen(false); }} />
          </TabsContent>

          <TabsContent value="stickers" className="mt-2 min-h-0 flex-1">
            <StickerPanel rellenar activo={open && tab === "stickers"} onPick={(url) => { onSticker(url); setOpen(false); }} />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
