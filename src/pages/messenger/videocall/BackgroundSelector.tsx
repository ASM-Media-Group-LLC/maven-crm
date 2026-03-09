import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ImageIcon, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type BackgroundEffect = "none" | "soft-blur" | "hard-blur" | string;

export const BACKGROUND_TEMPLATES = [
  { id: "tpl-sunset", label: "Atardecer", gradient: "linear-gradient(135deg, hsl(20 90% 40%), hsl(340 80% 45%), hsl(280 60% 30%))" },
  { id: "tpl-ocean", label: "Océano", gradient: "linear-gradient(180deg, hsl(200 70% 35%), hsl(210 80% 25%), hsl(220 60% 15%))" },
  { id: "tpl-forest", label: "Bosque", gradient: "linear-gradient(160deg, hsl(140 50% 25%), hsl(160 40% 18%), hsl(120 30% 12%))" },
  { id: "tpl-aurora", label: "Aurora", gradient: "linear-gradient(135deg, hsl(180 70% 30%), hsl(260 60% 40%), hsl(300 50% 35%))" },
  { id: "tpl-night", label: "Noche", gradient: "linear-gradient(180deg, hsl(230 40% 12%), hsl(240 50% 8%), hsl(260 30% 5%))" },
  { id: "tpl-warm", label: "Cálido", gradient: "linear-gradient(135deg, hsl(30 70% 50%), hsl(15 60% 40%), hsl(350 50% 35%))" },
  { id: "tpl-neon", label: "Neón", gradient: "linear-gradient(135deg, hsl(280 100% 50%), hsl(200 100% 50%), hsl(160 100% 40%))" },
  { id: "tpl-minimal", label: "Minimal", gradient: "linear-gradient(180deg, hsl(220 15% 20%), hsl(220 10% 15%))" },
];

interface BackgroundSelectorProps {
  selected: BackgroundEffect;
  onSelect: (effect: BackgroundEffect) => void;
}

export default function BackgroundSelector({ selected, onSelect }: BackgroundSelectorProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (effect: BackgroundEffect) => {
    onSelect(effect);
  };

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
      <PopoverContent side="top" align="center" className="w-72 p-3">
        <p className="text-xs font-semibold text-foreground mb-3">Fondo virtual</p>

        {/* Blur options */}
        <div className="flex gap-2 mb-3">
          <BlurOption
            label="Sin efecto"
            active={isSelected("none")}
            onClick={() => handleSelect("none")}
            preview={<div className="w-full h-full bg-muted/50 rounded" />}
          />
          <BlurOption
            label="Soft blur"
            active={isSelected("soft-blur")}
            onClick={() => handleSelect("soft-blur")}
            preview={
              <div className="w-full h-full bg-muted/50 rounded relative overflow-hidden">
                <div className="absolute inset-0 backdrop-blur-sm bg-muted/30" />
                <div className="absolute inset-2 rounded bg-foreground/10" />
              </div>
            }
          />
          <BlurOption
            label="Hard blur"
            active={isSelected("hard-blur")}
            onClick={() => handleSelect("hard-blur")}
            preview={
              <div className="w-full h-full bg-muted/50 rounded relative overflow-hidden">
                <div className="absolute inset-0 backdrop-blur-xl bg-muted/50" />
                <div className="absolute inset-2 rounded bg-foreground/20" />
              </div>
            }
          />
        </div>

        {/* Templates */}
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Plantillas</p>
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {BACKGROUND_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              title={tpl.label}
              onClick={() => handleSelect(tpl.id)}
              className={cn(
                "relative h-12 rounded-lg overflow-hidden border-2 transition-all hover:scale-105",
                isSelected(tpl.id) ? "border-primary" : "border-transparent"
              )}
              style={{ background: tpl.gradient }}
            >
              {isSelected(tpl.id) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Check className="h-3.5 w-3.5 text-white" />
                </div>
              )}
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

function BlurOption({
  label, active, onClick, preview,
}: {
  label: string; active: boolean; onClick: () => void; preview: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 flex flex-col items-center gap-1 p-1.5 rounded-lg border-2 transition-all hover:bg-accent/50",
        active ? "border-primary bg-primary/10" : "border-transparent"
      )}
    >
      <div className="w-full h-8 rounded overflow-hidden">{preview}</div>
      <span className="text-[9px] text-muted-foreground leading-tight">{label}</span>
    </button>
  );
}
