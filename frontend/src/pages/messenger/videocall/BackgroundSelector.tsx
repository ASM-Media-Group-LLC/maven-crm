import { useState, useRef, useCallback, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ImageIcon, Check, Ban, Cloud, CloudFog, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BACKGROUND_TEMPLATES, MAX_FONDOS_PROPIOS,
  isCustomBackground, getCustomBackgroundUrl, isTemplateBackground,
  listarFondosPropios, guardarFondoPropio, borrarFondoPropio, urlDeFondoPropio,
  type BackgroundEffect, type FondoPropio, type FalloAlGuardar,
} from "@/lib/fondoDeLlamada";

// El tipo, las plantillas y los predicados VIVEN en `@/lib/fondoDeLlamada` desde
// el 09/09/2026 (para que el hook los use sin importar este archivo, que trae
// React). Se re-exportan desde acá porque media docena de archivos —y sus
// tests— ya los importaban de este módulo.
export type { BackgroundEffect };
export { BACKGROUND_TEMPLATES, isCustomBackground, getCustomBackgroundUrl, isTemplateBackground };

/** Qué se le dice a la persona cuando su imagen no se pudo guardar. */
const MOTIVO_DE_FALLO: Record<FalloAlGuardar, string> = {
  limite: `Se guardan hasta ${MAX_FONDOS_PROPIOS}. Borrá uno y volvé a intentar.`,
  ilegible: "Este navegador no puede abrir esa imagen. Probá con un JPG o un PNG.",
  "sin-almacen": "Este navegador no está guardando datos del sitio, así que el fondo no se puede recordar.",
};

interface BackgroundSelectorProps {
  selected: BackgroundEffect;
  onSelect: (effect: BackgroundEffect) => void;
}

/** Los fondos propios de la persona, ya con su URL de esta pestaña. */
export function useFondosPropios(activo: boolean) {
  const [fondos, setFondos] = useState<Array<{ id: string; url: string; creado: number }>>([]);

  const recargar = useCallback(async () => {
    const filas = await listarFondosPropios();
    const conUrl = await Promise.all(
      filas.map(async (f: FondoPropio) => ({ id: f.id, creado: f.creado, url: (await urlDeFondoPropio(f.id)) ?? "" })),
    );
    setFondos(conUrl.filter((f) => f.url));
  }, []);

  useEffect(() => { if (activo) void recargar(); }, [activo, recargar]);

  const subir = useCallback(async (file: File): Promise<string | null> => {
    const { fondo, motivo } = await guardarFondoPropio(file, Date.now());
    if (fondo) {
      await recargar();
      return `custom:${fondo.id}`;
    }
    // El aviso dice lo que DE VERDAD pasó. Antes siempre culpaba al límite,
    // incluso con la lista vacía y el almacenamiento bloqueado.
    toast.error("No se pudo guardar el fondo", { description: MOTIVO_DE_FALLO[motivo ?? "sin-almacen"] });
    return null;
  }, [recargar]);

  const borrar = useCallback(async (id: string) => {
    await borrarFondoPropio(id);
    await recargar();
  }, [recargar]);

  return { fondos, subir, borrar, recargar };
}

export default function BackgroundSelector({ selected, onSelect }: BackgroundSelectorProps) {
  const [open, setOpen] = useState(false);
  const { fondos, subir, borrar } = useFondosPropios(open);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    const efecto = await subir(file);
    if (efecto) onSelect(efecto);
  }, [onSelect, subir]);

  const handleDeleteCustom = useCallback(async (id: string) => {
    await borrar(id);
    if (selected === `custom:${id}`) onSelect("none");
  }, [selected, onSelect, borrar]);

  const handleRandom = () => {
    const tpl = BACKGROUND_TEMPLATES[Math.floor(Math.random() * BACKGROUND_TEMPLATES.length)];
    onSelect(tpl.id);
  };

  const isSelected = (id: string) => selected === id;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          title="Fondo virtual"
          className={cn(
            "h-11 w-11 rounded-full flex items-center justify-center transition-colors",
            selected !== "none"
              ? "bg-primary/20 text-primary hover:bg-primary/30"
              : "bg-card text-foreground hover:bg-muted"
          )}
        >
          <ImageIcon className="h-[18px] w-[18px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" // Tope de alto + scroll: con 5 fondos propios guardados y 8 plantillas el
        // contenido pasa los 470px y en una pantalla baja (el teléfono acostado) la
        // última fila quedaba fuera, sin forma de llegar.
        className="z-[200] w-80 p-3 bg-background border-secondary max-h-[70vh] overflow-y-auto">
        <p className="text-xs font-medium text-foreground mb-3">Fondos y efectos</p>

        {/* Cuatro opciones: sin efecto, los DOS niveles de difuminado y subir
            imagen. En grilla, no en flex: con cuatro en una fila `flex-1` las
            etiquetas quedaban en 68 px y se partían en tres líneas. */}
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          <EffectOption label="Sin efecto" active={isSelected("none")} onClick={() => onSelect("none")}>
            <div className="w-full h-full bg-secondary rounded flex items-center justify-center">
              <Ban className="h-4 w-4 text-muted-foreground" />
            </div>
          </EffectOption>
          <EffectOption label="Difuminar" active={isSelected("blur")} onClick={() => onSelect("blur")}>
            <div className="w-full h-full rounded bg-muted flex items-center justify-center">
              <Cloud className="h-4 w-4 text-muted-foreground" />
            </div>
          </EffectOption>
          <EffectOption label="Difuminar más" active={isSelected("blur-strong")} onClick={() => onSelect("blur-strong")}>
            <div className="w-full h-full rounded bg-muted flex items-center justify-center">
              <CloudFog className="h-4 w-4 text-muted-foreground" />
            </div>
          </EffectOption>
          <EffectOption label="Subir imagen" active={false} onClick={() => fileRef.current?.click()}>
            <div className="w-full h-full bg-secondary rounded flex items-center justify-center">
              <Plus className="h-4 w-4 text-muted-foreground" />
            </div>
          </EffectOption>
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

        {/* Fondos propios. Ahora salen de IndexedDB, así que siguen estando
            mañana y son los MISMOS que se ven en el diálogo de la llamada. */}
        {fondos.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Tus fondos</p>
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {fondos.map((bg) => (
                <div
                  key={bg.id}
                  className={cn(
                    "relative h-14 rounded-lg overflow-hidden border-2 transition-all hover:scale-105 group",
                    isSelected(`custom:${bg.id}`)
                      ? "border-primary ring-1 ring-primary/30"
                      : "border-transparent hover:border-border"
                  )}
                >
                  <button
                    type="button"
                    title="Fondo personalizado"
                    onClick={() => onSelect(`custom:${bg.id}`)}
                    className="absolute inset-0 w-full h-full"
                  >
                    <img src={bg.url} alt="Fondo personalizado" className="w-full h-full object-cover" />
                    {isSelected(`custom:${bg.id}`) && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Check className="h-4 w-4 text-white" />
                      </span>
                    )}
                  </button>
                  {/* Va FUERA del otro botón: un <button> dentro de un <button>
                      es HTML inválido y el navegador lo desanida solo. */}
                  <button
                    type="button"
                    title="Borrar este fondo"
                    onClick={() => void handleDeleteCustom(bg.id)}
                    // Visible SIEMPRE: con `group-hover` en un teléfono no se veía nunca, y
                    // desde que el borrado es permanente eso significaba borrar a ciegas
                    // el fondo guardado. Área de toque de 24px y foco visible.
                    className="absolute top-0 right-0 z-10 grid h-6 w-6 place-items-center rounded-bl-lg bg-black/70 text-white/90 hover:bg-black/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <X className="h-2.5 w-2.5 text-white" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Templates */}
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Fondos virtuales</p>
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {BACKGROUND_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              title={tpl.label}
              onClick={() => onSelect(tpl.id)}
              className={cn(
                "relative h-14 rounded-lg overflow-hidden border-2 transition-all hover:scale-105 group",
                isSelected(tpl.id) ? "border-primary ring-1 ring-primary/30" : "border-transparent hover:border-border"
              )}
            >
              <img src={tpl.src} alt={tpl.label} className="w-full h-full object-cover" loading="lazy" />
              {isSelected(tpl.id) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Check className="h-4 w-4 text-white" />
                </div>
              )}
              <span className="absolute bottom-0 inset-x-0 text-[8px] text-center text-white bg-black/50 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {tpl.label}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={handleRandom}
          className="w-full text-xs text-center py-1.5 rounded-md bg-secondary text-foreground hover:bg-muted transition-colors"
        >
          🎲 Fondo aleatorio
        </button>
      </PopoverContent>
    </Popover>
  );
}

function EffectOption({
  label, active, onClick, children,
}: {
  label: string; active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 p-1.5 rounded-lg border-2 transition-all hover:bg-card",
        active ? "border-primary bg-primary/10" : "border-transparent"
      )}
    >
      <div className="w-full h-8 rounded overflow-hidden">{children}</div>
      <span className="text-[9px] text-muted-foreground leading-tight text-center">{label}</span>
    </button>
  );
}
