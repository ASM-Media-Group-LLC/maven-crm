import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ImageIcon, Check, Ban, Cloudy, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";

export type BackgroundEffect = "none" | "soft-blur" | "hard-blur" | string;

export const BACKGROUND_TEMPLATES = [
  { id: "tpl-office", label: "Oficina", src: "/backgrounds/bg-office.jpg" },
  { id: "tpl-bookshelf", label: "Biblioteca", src: "/backgrounds/bg-bookshelf.jpg" },
  { id: "tpl-beach", label: "Playa", src: "/backgrounds/bg-beach.jpg" },
  { id: "tpl-mountains", label: "Montañas", src: "/backgrounds/bg-mountains.jpg" },
  { id: "tpl-cafe", label: "Café", src: "/backgrounds/bg-cafe.jpg" },
  { id: "tpl-livingroom", label: "Sala", src: "/backgrounds/bg-livingroom.jpg" },
  { id: "tpl-forest", label: "Bosque", src: "/backgrounds/bg-forest.jpg" },
  { id: "tpl-abstract", label: "Abstracto", src: "/backgrounds/bg-abstract.jpg" },
];

interface BackgroundSelectorProps {
  selected: BackgroundEffect;
  onSelect: (effect: BackgroundEffect) => void;
}

export default function BackgroundSelector({ selected, onSelect }: BackgroundSelectorProps) {
  const [open, setOpen] = useState(false);

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
              ? "bg-[hsl(214_82%_51%/0.2)] text-[hsl(214_82%_65%)] hover:bg-[hsl(214_82%_51%/0.3)]"
              : "bg-[hsl(220_3%_22%)] text-[hsl(220_3%_85%)] hover:bg-[hsl(220_3%_28%)]"
          )}
        >
          <ImageIcon className="h-[18px] w-[18px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-80 p-3 bg-[hsl(220_3%_17%)] border-[hsl(220_3%_25%)]">
        <p className="text-xs font-medium text-[hsl(220_3%_85%)] mb-3">Fondo virtual</p>

        {/* Effect options */}
        <div className="flex gap-2 mb-3">
          <EffectOption label="Sin efecto" active={isSelected("none")} onClick={() => onSelect("none")}>
            <div className="w-full h-full bg-[hsl(220_3%_25%)] rounded flex items-center justify-center">
              <Ban className="h-4 w-4 text-[hsl(220_3%_55%)]" />
            </div>
          </EffectOption>
          <EffectOption label="Difuminado leve" active={isSelected("soft-blur")} onClick={() => onSelect("soft-blur")}>
            <div className="w-full h-full rounded bg-[hsl(220_3%_22%)] flex items-center justify-center">
              <Cloudy className="h-4 w-4 text-[hsl(220_3%_55%)]" />
            </div>
          </EffectOption>
          <EffectOption label="Difuminado fuerte" active={isSelected("hard-blur")} onClick={() => onSelect("hard-blur")}>
            <div className="w-full h-full rounded bg-[hsl(220_3%_28%)] flex items-center justify-center">
              <Cloud className="h-4 w-4 text-[hsl(220_3%_55%)]" />
            </div>
          </EffectOption>
        </div>

        {/* Templates */}
        <p className="text-[10px] uppercase tracking-wider text-[hsl(220_3%_50%)] mb-2">Fondos virtuales</p>
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {BACKGROUND_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              title={tpl.label}
              onClick={() => onSelect(tpl.id)}
              className={cn(
                "relative h-14 rounded-lg overflow-hidden border-2 transition-all hover:scale-105 group",
                isSelected(tpl.id) ? "border-[hsl(214_82%_51%)] ring-1 ring-[hsl(214_82%_51%/0.3)]" : "border-transparent hover:border-[hsl(220_3%_40%)]"
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
          className="w-full text-xs text-center py-1.5 rounded-md bg-[hsl(220_3%_25%)] text-[hsl(220_3%_80%)] hover:bg-[hsl(220_3%_30%)] transition-colors"
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
        "flex-1 flex flex-col items-center gap-1 p-1.5 rounded-lg border-2 transition-all hover:bg-[hsl(220_3%_22%)]",
        active ? "border-[hsl(214_82%_51%)] bg-[hsl(214_82%_51%/0.08)]" : "border-transparent"
      )}
    >
      <div className="w-full h-8 rounded overflow-hidden">{children}</div>
      <span className="text-[9px] text-[hsl(220_3%_55%)] leading-tight">{label}</span>
    </button>
  );
}
