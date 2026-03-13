import { useState } from "react";
import { X, LayoutGrid, Grid3X3, Presentation, PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

export type LayoutMode = "auto" | "tiled" | "spotlight" | "sidebar";

export interface ViewSettings {
  layout: LayoutMode;
  maxTiles: number;
  hideNoVideo: boolean;
}

interface AdjustViewDialogProps {
  open: boolean;
  onClose: () => void;
  settings: ViewSettings;
  onSettingsChange: (settings: ViewSettings) => void;
}

const LAYOUT_OPTIONS: { value: LayoutMode; label: string; description: string; icon: React.ElementType }[] = [
  { value: "auto", label: "Auto (dinámico)", description: "Se ajusta según participantes", icon: LayoutGrid },
  { value: "tiled", label: "Mosaico", description: "Todos en cuadrícula uniforme", icon: Grid3X3 },
  { value: "spotlight", label: "Destacado", description: "Enfoca al orador activo", icon: Presentation },
  { value: "sidebar", label: "Barra lateral", description: "Principal + miniaturas", icon: PanelRight },
];

const TILE_STEPS = [1, 4, 6, 9, 16, 25, 49];

function getTileLabel(val: number) {
  if (val >= 49) return "49";
  return String(val);
}

export default function AdjustViewDialog({ open, onClose, settings, onSettingsChange }: AdjustViewDialogProps) {
  if (!open) return null;

  const handleLayoutChange = (layout: LayoutMode) => {
    onSettingsChange({ ...settings, layout });
  };

  const currentStepIndex = TILE_STEPS.findIndex((s) => s >= settings.maxTiles);
  const sliderIndex = currentStepIndex === -1 ? TILE_STEPS.length - 1 : currentStepIndex;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-md mx-4 rounded-2xl bg-[hsl(240_8%_12%)] border border-[hsl(0_0%_100%/0.08)] shadow-2xl text-[hsl(0_0%_96%)]">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-2">
          <div>
            <h2 className="text-lg font-semibold">Ajustar vista</h2>
            <p className="text-xs text-[hsl(0_0%_96%/0.5)] mt-0.5">
              La selección se guarda para futuras llamadas
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-[hsl(0_0%_100%/0.1)] transition-colors text-[hsl(0_0%_96%/0.6)] hover:text-[hsl(0_0%_96%)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Layout options */}
        <div className="px-6 py-3 space-y-1">
          {LAYOUT_OPTIONS.map((opt) => {
            const isActive = settings.layout === opt.value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => handleLayoutChange(opt.value)}
                className={cn(
                  "w-full flex items-center gap-4 rounded-xl px-4 py-3 transition-all text-left",
                  isActive
                    ? "bg-primary/15 ring-1 ring-primary/40"
                    : "hover:bg-[hsl(0_0%_100%/0.05)]"
                )}
              >
                {/* Radio indicator */}
                <div
                  className={cn(
                    "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                    isActive ? "border-primary" : "border-[hsl(0_0%_100%/0.3)]"
                  )}
                >
                  {isActive && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium", isActive ? "text-primary" : "text-[hsl(0_0%_96%)]")}>
                    {opt.label}
                  </p>
                  <p className="text-xs text-[hsl(0_0%_96%/0.45)]">{opt.description}</p>
                </div>

                {/* Icon preview */}
                <div
                  className={cn(
                    "h-10 w-14 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    isActive ? "bg-primary/20" : "bg-[hsl(0_0%_100%/0.05)]"
                  )}
                >
                  <Icon
                    className={cn("h-5 w-5", isActive ? "text-primary" : "text-[hsl(0_0%_96%/0.4)]")}
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="mx-6 border-t border-[hsl(0_0%_100%/0.08)]" />

        {/* Max tiles slider */}
        <div className="px-6 py-4 space-y-3">
          <div>
            <p className="text-sm font-medium">Mosaicos</p>
            <p className="text-xs text-[hsl(0_0%_96%/0.45)]">
              Máximo de mosaicos a mostrar (depende del tamaño de ventana)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Grid3X3 className="h-4 w-4 text-[hsl(0_0%_96%/0.5)] shrink-0" />
            <Slider
              value={[sliderIndex]}
              min={0}
              max={TILE_STEPS.length - 1}
              step={1}
              onValueChange={([idx]) => {
                onSettingsChange({ ...settings, maxTiles: TILE_STEPS[idx] });
              }}
              className="flex-1"
            />
            <LayoutGrid className="h-4 w-4 text-[hsl(0_0%_96%/0.5)] shrink-0" />
          </div>
          <p className="text-center text-xs font-medium text-primary">
            {getTileLabel(settings.maxTiles)} mosaicos
          </p>
        </div>

        {/* Divider */}
        <div className="mx-6 border-t border-[hsl(0_0%_100%/0.08)]" />

        {/* Hide no video */}
        <div className="px-6 py-4 flex items-center justify-between">
          <p className="text-sm text-[hsl(0_0%_96%)]">Ocultar mosaicos sin video</p>
          <Switch
            checked={settings.hideNoVideo}
            onCheckedChange={(checked) =>
              onSettingsChange({ ...settings, hideNoVideo: checked })
            }
          />
        </div>
      </div>
    </div>
  );
}
