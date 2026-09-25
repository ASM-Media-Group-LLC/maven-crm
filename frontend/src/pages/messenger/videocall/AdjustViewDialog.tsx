import { X, LayoutGrid, Grid3X3, PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

export type LayoutMode = "auto" | "tiled" | "sidebar";

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

const LAYOUT_OPTIONS: { value: LayoutMode; label: TranslationKey; description: TranslationKey; icon: React.ElementType }[] = [
  { value: "auto", label: "messenger.view.auto", description: "messenger.view.autoDesc", icon: LayoutGrid },
  { value: "tiled", label: "messenger.view.mosaico", description: "messenger.view.mosaicoDesc", icon: Grid3X3 },
  { value: "sidebar", label: "messenger.view.barraLateral", description: "messenger.view.barraLateralDesc", icon: PanelRight },
];

const TILE_STEPS = [1, 4, 6, 9, 16, 25, 49];

function getTileLabel(val: number) {
  if (val >= 49) return "49";
  return String(val);
}

export default function AdjustViewDialog({ open, onClose, settings, onSettingsChange }: AdjustViewDialogProps) {
  const { t } = useLanguage();
  if (!open) return null;

  const handleLayoutChange = (layout: LayoutMode) => {
    onSettingsChange({ ...settings, layout });
  };

  const currentStepIndex = TILE_STEPS.findIndex((s) => s >= settings.maxTiles);
  const sliderIndex = currentStepIndex === -1 ? TILE_STEPS.length - 1 : currentStepIndex;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-md mx-4 rounded-2xl bg-background border border-secondary shadow-2xl text-foreground">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-1">
          <div>
            <h2 className="text-base font-medium">{t("messenger.call.ajustarVista")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("messenger.view.seGuarda")}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Layout options */}
        <div className="px-5 py-3 space-y-1">
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
                    ? "bg-primary/10"
                    : "hover:bg-card"
                )}
              >
                <div className={cn(
                  "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                  isActive ? "border-primary" : "border-border"
                )}>
                  {isActive && <div className="h-2.5 w-2.5 rounded-full bg-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm", isActive ? "text-primary" : "text-foreground")}>{t(opt.label)}</p>
                  <p className="text-xs text-muted-foreground">{t(opt.description)}</p>
                </div>
                <div className={cn(
                  "h-9 w-12 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                  isActive ? "bg-primary/15" : "bg-card"
                )}>
                  <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="mx-5 border-t border-secondary" />

        {/* Max tiles */}
        <div className="px-6 py-4 space-y-3">
          <div>
            <p className="text-sm">{t("messenger.view.mosaicos")}</p>
            <p className="text-xs text-muted-foreground">{t("messenger.view.maximoMosaicos")}</p>
          </div>
          <div className="flex items-center gap-3">
            <Grid3X3 className="h-4 w-4 text-muted-foreground shrink-0" />
            <Slider
              value={[sliderIndex]}
              min={0}
              max={TILE_STEPS.length - 1}
              step={1}
              onValueChange={([idx]) => onSettingsChange({ ...settings, maxTiles: TILE_STEPS[idx] })}
              className="flex-1"
            />
            <LayoutGrid className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
          <p className="text-center text-xs font-medium text-primary">
            {t("messenger.view.nMosaicos", { n: getTileLabel(settings.maxTiles) })}
          </p>
        </div>

        <div className="mx-5 border-t border-secondary" />

        {/* Hide no video */}
        <div className="px-6 py-4 flex items-center justify-between">
          <p className="text-sm text-foreground">{t("messenger.view.ocultarSinVideo")}</p>
          <Switch
            checked={settings.hideNoVideo}
            onCheckedChange={(checked) => onSettingsChange({ ...settings, hideNoVideo: checked })}
          />
        </div>
      </div>
    </div>
  );
}
