import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Video as VideoIcon, ChevronDown, Check, Ban, Cloud, CloudFog, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFondosPropios } from "./BackgroundSelector";
import { BACKGROUND_TEMPLATES, isCustomBackground, type BackgroundEffect } from "@/lib/fondoDeLlamada";

interface DeviceInfo {
  deviceId: string;
  label: string;
}

interface VideoSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onVideoInputChange?: (deviceId: string) => void;
  currentVideoInputId?: string;
  backgroundEffect: BackgroundEffect;
  onBackgroundChange: (effect: BackgroundEffect) => void;
}

export default function VideoSettingsDialog({
  open, onClose,
  onVideoInputChange, currentVideoInputId,
  backgroundEffect, onBackgroundChange,
}: VideoSettingsDialogProps) {
  const [videoInputs, setVideoInputs] = useState<DeviceInfo[]>([]);
  const [selectedVideoInput, setSelectedVideoInput] = useState(currentVideoInputId || "");
  // Los MISMOS fondos propios que ve el lobby: salen de IndexedDB, no de un
  // useState local. Antes cada pantalla tenía su lista y lo que subías en el
  // lobby no existía acá.
  const { fondos, subir, borrar } = useFondosPropios(open);
  const fileRef = useRef<HTMLInputElement>(null);

  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoInputs(devices.filter((d) => d.kind === "videoinput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || `Cámara ${d.deviceId.slice(0, 5)}` })));
    } catch {}
  }, []);

  useEffect(() => {
    if (open) {
      enumerateDevices();
      setSelectedVideoInput(currentVideoInputId || "");
    }
  }, [open, enumerateDevices, currentVideoInputId]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    const efecto = await subir(file);
    if (efecto) onBackgroundChange(efecto);
  }, [onBackgroundChange, subir]);

  const handleDeleteCustom = useCallback(async (id: string) => {
    await borrar(id);
    if (backgroundEffect === `custom:${id}`) onBackgroundChange("none");
  }, [backgroundEffect, onBackgroundChange, borrar]);

  const isSelected = (id: string) => backgroundEffect === id;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="z-[200] bg-background border-secondary text-foreground max-w-sm p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-medium text-white">Vídeo</DialogTitle>
        </DialogHeader>
        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Camera selector */}
          <DeviceSection icon={<VideoIcon className="h-4 w-4" />} label="Cámara" devices={videoInputs} selectedId={selectedVideoInput} onSelect={(id) => { setSelectedVideoInput(id); onVideoInputChange?.(id); }} />

          {/* Background effects */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">Fondos y efectos</p>
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-1.5">
                <EffectOption label="Sin efecto" active={isSelected("none")} onClick={() => onBackgroundChange("none")}>
                  <div className="w-full h-full bg-secondary rounded flex items-center justify-center">
                    <Ban className="h-4 w-4 text-muted-foreground" />
                  </div>
                </EffectOption>
                <EffectOption label="Difuminar" active={isSelected("blur")} onClick={() => onBackgroundChange("blur")}>
                  <div className="w-full h-full rounded bg-muted flex items-center justify-center">
                    <Cloud className="h-4 w-4 text-muted-foreground" />
                  </div>
                </EffectOption>
                <EffectOption label="Difuminar más" active={isSelected("blur-strong")} onClick={() => onBackgroundChange("blur-strong")}>
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

              {/* Custom backgrounds */}
              {fondos.length > 0 && (
                <>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Tus fondos</p>
                  <div className="grid grid-cols-4 gap-1.5">
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
                          onClick={() => onBackgroundChange(`custom:${bg.id}`)}
                          className="absolute inset-0 w-full h-full"
                        >
                          <img src={bg.url} alt="Fondo personalizado" className="w-full h-full object-cover" />
                          {isSelected(`custom:${bg.id}`) && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                              <Check className="h-4 w-4 text-white" />
                            </span>
                          )}
                        </button>
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
              <div className="grid grid-cols-4 gap-1.5">
                {BACKGROUND_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    title={tpl.label}
                    onClick={() => onBackgroundChange(tpl.id)}
                    className={cn(
                      "relative h-14 rounded-lg overflow-hidden border-2 transition-all hover:scale-105 group",
                      isSelected(tpl.id)
                        ? "border-primary ring-1 ring-primary/30"
                        : "border-transparent hover:border-border"
                    )}
                  >
                    <img src={tpl.src} alt={tpl.label} className="w-full h-full object-cover" loading="lazy" />
                    {isSelected(tpl.id) && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Check className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EffectOption({ label, active, onClick, children }: {
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

function DeviceSection({ icon, label, devices, selectedId, onSelect }: {
  icon: React.ReactNode; label: string; devices: DeviceInfo[]; selectedId: string; onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = devices.find((d) => d.deviceId === selectedId);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-card border border-border text-sm text-foreground hover:bg-secondary transition-colors"
        >
          <span className="truncate text-left flex-1">{selected?.label || "Seleccionar dispositivo"}</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        {open && devices.length > 0 && (
          <div className="absolute top-full mt-1 left-0 right-0 z-50 rounded-lg bg-card border border-border shadow-xl p-1 max-h-48 overflow-y-auto">
            {devices.map((d) => (
              <button
                key={d.deviceId}
                onClick={() => { onSelect(d.deviceId); setOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2 text-left text-sm px-3 py-2 rounded-md transition-colors",
                  d.deviceId === selectedId
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-muted"
                )}
              >
                <span className="truncate flex-1">{d.label}</span>
                {d.deviceId === selectedId && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
