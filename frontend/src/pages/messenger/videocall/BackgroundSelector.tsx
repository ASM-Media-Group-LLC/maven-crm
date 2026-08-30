import { useState, useRef, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ImageIcon, Check, Ban, Cloud, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type BackgroundEffect = "none" | "blur" | string;

export function isCustomBackground(effect: BackgroundEffect): boolean {
  return typeof effect === "string" && effect.startsWith("custom:");
}

export function getCustomBackgroundUrl(effect: BackgroundEffect): string {
  return effect.replace(/^custom:/, "");
}

export function isTemplateBackground(effect: BackgroundEffect): boolean {
  return effect !== "none" && effect !== "blur" && !isCustomBackground(effect);
}

export const BACKGROUND_TEMPLATES = [
  { id: "tpl-office", label: "Oficina", src: "/backgrounds/bg-office.jpg", lowSrc: "/backgrounds/low/bg-office.jpg" },
  { id: "tpl-bookshelf", label: "Biblioteca", src: "/backgrounds/bg-bookshelf.jpg", lowSrc: "/backgrounds/low/bg-bookshelf.jpg" },
  { id: "tpl-beach", label: "Playa", src: "/backgrounds/bg-beach.jpg", lowSrc: "/backgrounds/low/bg-beach.jpg" },
  { id: "tpl-mountains", label: "Montañas", src: "/backgrounds/bg-mountains.jpg", lowSrc: "/backgrounds/low/bg-mountains.jpg" },
  { id: "tpl-cafe", label: "Café", src: "/backgrounds/bg-cafe.jpg", lowSrc: "/backgrounds/low/bg-cafe.jpg" },
  { id: "tpl-livingroom", label: "Sala", src: "/backgrounds/bg-livingroom.jpg", lowSrc: "/backgrounds/low/bg-livingroom.jpg" },
  { id: "tpl-forest", label: "Bosque", src: "/backgrounds/bg-forest.jpg", lowSrc: "/backgrounds/low/bg-forest.jpg" },
  { id: "tpl-abstract", label: "Abstracto", src: "/backgrounds/bg-abstract.jpg", lowSrc: "/backgrounds/low/bg-abstract.jpg" },
];

interface CustomBg {
  id: string;
  objectUrl: string;
}

interface BackgroundSelectorProps {
  selected: BackgroundEffect;
  onSelect: (effect: BackgroundEffect) => void;
}

export default function BackgroundSelector({ selected, onSelect }: BackgroundSelectorProps) {
  const [open, setOpen] = useState(false);
  const [customBgs, setCustomBgs] = useState<CustomBg[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const objectUrl = URL.createObjectURL(file);
    const id = `custom-${Date.now()}`;
    setCustomBgs((prev) => [...prev, { id, objectUrl }]);
    onSelect(`custom:${objectUrl}`);
    if (fileRef.current) fileRef.current.value = "";
  }, [onSelect]);

  const handleDeleteCustom = useCallback((bg: CustomBg) => {
    URL.revokeObjectURL(bg.objectUrl);
    setCustomBgs((prev) => prev.filter((b) => b.id !== bg.id));
    if (selected === `custom:${bg.objectUrl}`) onSelect("none");
  }, [selected, onSelect]);

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
      <PopoverContent side="top" align="center" className="z-[200] w-80 p-3 bg-background border-secondary">
        <p className="text-xs font-medium text-foreground mb-3">Fondos y efectos</p>

        {/* Effect options */}
        <div className="flex gap-2 mb-3">
          <EffectOption label="Sin efecto" active={isSelected("none")} onClick={() => onSelect("none")}>
            <div className="w-full h-full bg-secondary rounded flex items-center justify-center">
              <Ban className="h-4 w-4 text-muted-foreground" />
            </div>
          </EffectOption>
          <EffectOption label="Difuminar fondo" active={isSelected("blur")} onClick={() => onSelect("blur")}>
            <div className="w-full h-full rounded bg-muted flex items-center justify-center">
              <Cloud className="h-4 w-4 text-muted-foreground" />
            </div>
          </EffectOption>
          <EffectOption label="Subir imagen" active={false} onClick={() => fileRef.current?.click()}>
            <div className="w-full h-full bg-secondary rounded flex items-center justify-center">
              <Plus className="h-4 w-4 text-muted-foreground" />
            </div>
          </EffectOption>
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

        {/* Custom backgrounds */}
        {customBgs.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Tus fondos</p>
            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {customBgs.map((bg) => (
                <button
                  key={bg.id}
                  title="Fondo personalizado"
                  onClick={() => onSelect(`custom:${bg.objectUrl}`)}
                  className={cn(
                    "relative h-14 rounded-lg overflow-hidden border-2 transition-all hover:scale-105 group",
                    isSelected(`custom:${bg.objectUrl}`)
                      ? "border-primary ring-1 ring-primary/30"
                      : "border-transparent hover:border-border"
                  )}
                >
                  <img src={bg.objectUrl} alt="Custom" className="w-full h-full object-cover" />
                  {isSelected(`custom:${bg.objectUrl}`) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteCustom(bg); }}
                    className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-2.5 w-2.5 text-white" />
                  </button>
                </button>
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
        "flex-1 flex flex-col items-center gap-1 p-1.5 rounded-lg border-2 transition-all hover:bg-card",
        active ? "border-primary bg-primary/10" : "border-transparent"
      )}
    >
      <div className="w-full h-8 rounded overflow-hidden">{children}</div>
      <span className="text-[9px] text-muted-foreground leading-tight">{label}</span>
    </button>
  );
}
