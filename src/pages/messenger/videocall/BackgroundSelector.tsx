import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ImageIcon, Check, Ban } from "lucide-react";
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
            "h-12 w-12 rounded-full flex items-center justify-center transition-colors",
            selected !== "none"
              ? "bg-primary/20 text-primary hover:bg-primary/30"
              : "bg-[hsl(0_0%_100%/0.1)] text-[hsl(0_0%_96%)] hover:bg-[hsl(0_0%_100%/0.2)]"
          )}
        >
          <ImageIcon className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-80 p-3">
        <p className="text-xs font-semibold text-foreground mb-3">Fondo virtual</p>

        {/* Blur options row */}
        <div className="flex gap-2 mb-3">
          <EffectOption
            label="Sin efecto"
            active={isSelected("none")}
            onClick={() => onSelect("none")}
          >
            <div className="w-full h-full bg-muted/40 rounded flex items-center justify-center">
              <Ban className="h-4 w-4 text-muted-foreground" />
            </div>
          </EffectOption>
          <EffectOption
            label="Soft blur"
            active={isSelected("soft-blur")}
            onClick={() => onSelect("soft-blur")}
          >
            <div className="w-full h-full rounded relative overflow-hidden bg-muted/30">
              <div className="absolute inset-0" style={{ backdropFilter: "blur(2px)", background: "hsl(var(--muted) / 0.3)" }} />
              <div className="absolute inset-1.5 rounded-sm bg-foreground/8" />
            </div>
          </EffectOption>
          <EffectOption
            label="Hard blur"
            active={isSelected("hard-blur")}
            onClick={() => onSelect("hard-blur")}
          >
            <div className="w-full h-full rounded relative overflow-hidden bg-muted/50">
              <div className="absolute inset-0" style={{ backdropFilter: "blur(6px)", background: "hsl(var(--muted) / 0.5)" }} />
              <div className="absolute inset-1.5 rounded-sm bg-foreground/15" />
            </div>
          </EffectOption>
        </div>

        {/* Image templates */}
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Plantillas</p>
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {BACKGROUND_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              title={tpl.label}
              onClick={() => onSelect(tpl.id)}
              className={cn(
                "relative h-14 rounded-lg overflow-hidden border-2 transition-all hover:scale-105 group",
                isSelected(tpl.id) ? "border-primary ring-1 ring-primary/30" : "border-transparent hover:border-muted-foreground/30"
              )}
            >
              <img
                src={tpl.src}
                alt={tpl.label}
                className="w-full h-full object-cover"
                loading="lazy"
              />
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

        {/* Random button */}
        <button
          onClick={handleRandom}
          className="w-full text-xs text-center py-1.5 rounded-md bg-accent text-accent-foreground hover:bg-accent/80 transition-colors"
        >
          🎲 Plantilla aleatoria
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
        "flex-1 flex flex-col items-center gap-1 p-1.5 rounded-lg border-2 transition-all hover:bg-accent/50",
        active ? "border-primary bg-primary/10" : "border-transparent"
      )}
    >
      <div className="w-full h-8 rounded overflow-hidden">{children}</div>
      <span className="text-[9px] text-muted-foreground leading-tight">{label}</span>
    </button>
  );
}
