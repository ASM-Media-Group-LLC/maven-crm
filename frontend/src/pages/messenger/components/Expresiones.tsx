import { useState } from "react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EMOJI_CATALOG } from "@/pages/chatter-evaluator/workspace/EmojiBar";
import { GifPanel } from "@/pages/inbox/GifPicker";
import { StickerPanel } from "@/pages/inbox/StickerPicker";
import { cn } from "@/lib/utils";

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
          title="Emojis, GIF y stickers"
          aria-label="Emojis, GIF y stickers"
          data-testid="expresiones"
        >
          <Smile className={cn("h-5 w-5", iconClassName)} strokeWidth={2.1} />
        </Button>
      </PopoverTrigger>
      {/* Alto FIJO: cada pestaña rellena el mismo espacio y scrollea adentro. Con
          alto libre el panel saltaba al cambiar de pestaña (emojis largo, GIF con
          spinner, stickers según cuántos haya). */}
      <PopoverContent align="start" side="top" collisionPadding={8} className="flex h-[360px] w-[calc(100vw-1.5rem)] max-w-md flex-col p-2">
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          {/* h-9 con p-1 deja 28 px para las pestañas (text-xs + py-1.5 = 28): con h-8
              la pastilla activa se salía del contenedor por arriba y por abajo. */}
          <TabsList className="grid h-9 w-full shrink-0 grid-cols-3">
            <TabsTrigger value="emojis" className="py-1.5 text-xs">Emojis</TabsTrigger>
            <TabsTrigger value="gif" className="py-1.5 text-xs">GIF</TabsTrigger>
            <TabsTrigger value="stickers" className="py-1.5 text-xs">Stickers</TabsTrigger>
          </TabsList>

          <TabsContent value="emojis" className="mt-2 min-h-0 flex-1">
            <div className="h-full overflow-y-auto pr-1">
              {favoritos.length > 0 && (
                <section className="mb-2">
                  <p className="mb-1 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">Frecuentes</p>
                  <div className="grid grid-cols-8 gap-0.5">
                    {favoritos.map((e) => (
                      <button key={`fav-${e}`} type="button" onClick={() => onEmoji(e)} className="rounded-md py-1 text-2xl leading-none hover:bg-muted" aria-label={e}>
                        {e}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {Object.entries(EMOJI_CATALOG).map(([grupo, lista]) => (
                <section key={grupo} className="mb-2">
                  <p className="mb-1 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">{grupo}</p>
                  <div className="grid grid-cols-8 gap-0.5">
                    {lista.map((e) => (
                      <button key={`${grupo}-${e}`} type="button" onClick={() => onEmoji(e)} className="rounded-md py-1 text-2xl leading-none hover:bg-muted" aria-label={e}>
                        {e}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
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
