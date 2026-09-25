import { useState, useRef, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ImageIcon, Check, Ban, Cloud, CloudFog, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFondosPropios } from "@/hooks/useFondosPropios";
import {
  BACKGROUND_TEMPLATES,
  isCustomBackground, getCustomBackgroundUrl, isTemplateBackground,
  type BackgroundEffect,
} from "@/lib/fondoDeLlamada";
import { useLanguage } from "@/hooks/useLanguage";
import { nombreDelFondo } from "./nombreDelFondo";

// El tipo, las plantillas y los predicados VIVEN en `@/lib/fondoDeLlamada` desde
// el 09/09/2026 (para que el hook los use sin importar este archivo, que trae
// React). Se re-exportan desde acá porque media docena de archivos —y sus
// tests— ya los importaban de este módulo.
export type { BackgroundEffect };
export { BACKGROUND_TEMPLATES, isCustomBackground, getCustomBackgroundUrl, isTemplateBackground };

interface BackgroundSelectorProps {
  selected: BackgroundEffect;
  onSelect: (effect: BackgroundEffect) => void;
}

export default function BackgroundSelector({ selected, onSelect }: BackgroundSelectorProps) {
  const { t } = useLanguage();
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
          title={t("messenger.bg.fondoVirtual")}
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
        <p className="text-xs font-medium text-foreground mb-3">{t("messenger.call.fondosYEfectos")}</p>

        {/* Cuatro opciones: sin efecto, los DOS niveles de difuminado y subir
            imagen. En grilla, no en flex: con cuatro en una fila `flex-1` las
            etiquetas quedaban en 68 px y se partían en tres líneas. */}
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          <EffectOption label={t("messenger.bg.sinEfecto")} active={isSelected("none")} onClick={() => onSelect("none")}>
            <div className="w-full h-full bg-secondary rounded flex items-center justify-center">
              <Ban className="h-4 w-4 text-muted-foreground" />
            </div>
          </EffectOption>
          <EffectOption label={t("messenger.bg.difuminar")} active={isSelected("blur")} onClick={() => onSelect("blur")}>
            <div className="w-full h-full rounded bg-muted flex items-center justify-center">
              <Cloud className="h-4 w-4 text-muted-foreground" />
            </div>
          </EffectOption>
          <EffectOption label={t("messenger.bg.difuminarMasCorto")} active={isSelected("blur-strong")} onClick={() => onSelect("blur-strong")}>
            <div className="w-full h-full rounded bg-muted flex items-center justify-center">
              <CloudFog className="h-4 w-4 text-muted-foreground" />
            </div>
          </EffectOption>
          <EffectOption label={t("messenger.bg.subirImagen")} active={false} onClick={() => fileRef.current?.click()}>
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
            <p className="text-xs text-muted-foreground mb-2">{t("messenger.bg.tusFondos")}</p>
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
                    title={t("messenger.bg.personalizado")}
                    onClick={() => onSelect(`custom:${bg.id}`)}
                    className="absolute inset-0 w-full h-full"
                  >
                    <img src={bg.url} alt={t("messenger.bg.personalizado")} className="w-full h-full object-cover" />
                    {isSelected(`custom:${bg.id}`) && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Check className="h-4 w-4 text-white" />
                      </span>
                    )}
                  </button>
                  {/* Va FUERA del otro botón: un botón dentro de otro botón
                      es HTML inválido y el navegador lo desanida solo. */}
                  <button
                    type="button"
                    title={t("messenger.bg.borrarEste")}
                    aria-label={t("messenger.bg.borrarEste")}
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
        <p className="text-xs text-muted-foreground mb-2">{t("messenger.bg.fondosVirtuales")}</p>
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {BACKGROUND_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              title={nombreDelFondo(tpl, t)}
              onClick={() => onSelect(tpl.id)}
              className={cn(
                "relative h-14 rounded-lg overflow-hidden border-2 transition-all hover:scale-105 group",
                isSelected(tpl.id) ? "border-primary ring-1 ring-primary/30" : "border-transparent hover:border-border"
              )}
            >
              <img src={tpl.src} alt={nombreDelFondo(tpl, t)} className="w-full h-full object-cover" loading="lazy" />
              {isSelected(tpl.id) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Check className="h-4 w-4 text-white" />
                </div>
              )}
              <span className="absolute bottom-0 inset-x-0 text-[8px] text-center text-white bg-black/50 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {nombreDelFondo(tpl, t)}
              </span>
            </button>
          ))}
        </div>

        <button
          onClick={handleRandom}
          className="w-full text-xs text-center py-1.5 rounded-md bg-secondary text-foreground hover:bg-muted transition-colors"
        >
          {t("messenger.bg.aleatorio")}
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
