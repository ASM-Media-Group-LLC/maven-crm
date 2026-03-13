import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Video as VideoIcon, ChevronDown, Check, Ban, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { BackgroundEffect, BACKGROUND_TEMPLATES } from "./BackgroundSelector";

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

  const isSelected = (id: string) => backgroundEffect === id;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[hsl(220_3%_17%)] border-[hsl(220_3%_25%)] text-[hsl(220_3%_90%)] max-w-sm p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-medium text-white">Vídeo</DialogTitle>
        </DialogHeader>
        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Camera selector */}
          <DeviceSection icon={<VideoIcon className="h-4 w-4" />} label="Cámara" devices={videoInputs} selectedId={selectedVideoInput} onSelect={(id) => { setSelectedVideoInput(id); onVideoInputChange?.(id); }} />

          {/* Background effects */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-[hsl(220_3%_70%)]">Fondos y efectos</p>
            <div className="space-y-3">
              <div className="flex gap-2">
                <EffectOption label="Sin efecto" active={isSelected("none")} onClick={() => onBackgroundChange("none")}>
                  <div className="w-full h-full bg-[hsl(220_3%_25%)] rounded flex items-center justify-center">
                    <Ban className="h-4 w-4 text-[hsl(220_3%_55%)]" />
                  </div>
                </EffectOption>
                <EffectOption label="Difuminar fondo" active={isSelected("blur")} onClick={() => onBackgroundChange("blur")}>
                  <div className="w-full h-full rounded bg-[hsl(220_3%_28%)] flex items-center justify-center">
                    <Cloud className="h-4 w-4 text-[hsl(220_3%_55%)]" />
                  </div>
                </EffectOption>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {BACKGROUND_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    title={tpl.label}
                    onClick={() => onBackgroundChange(tpl.id)}
                    className={cn(
                      "relative h-14 rounded-lg overflow-hidden border-2 transition-all hover:scale-105 group",
                      isSelected(tpl.id)
                        ? "border-[hsl(214_82%_51%)] ring-1 ring-[hsl(214_82%_51%/0.3)]"
                        : "border-transparent hover:border-[hsl(220_3%_40%)]"
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
        "flex-1 flex flex-col items-center gap-1 p-1.5 rounded-lg border-2 transition-all hover:bg-[hsl(220_3%_22%)]",
        active ? "border-[hsl(214_82%_51%)] bg-[hsl(214_82%_51%/0.08)]" : "border-transparent"
      )}
    >
      <div className="w-full h-8 rounded overflow-hidden">{children}</div>
      <span className="text-[9px] text-[hsl(220_3%_55%)] leading-tight">{label}</span>
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
      <div className="flex items-center gap-2 text-[hsl(220_3%_70%)]">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-[hsl(220_3%_22%)] border border-[hsl(220_3%_30%)] text-sm text-[hsl(220_3%_85%)] hover:bg-[hsl(220_3%_25%)] transition-colors"
        >
          <span className="truncate text-left flex-1">{selected?.label || "Seleccionar dispositivo"}</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-[hsl(220_3%_55%)] transition-transform", open && "rotate-180")} />
        </button>
        {open && devices.length > 0 && (
          <div className="absolute top-full mt-1 left-0 right-0 z-50 rounded-lg bg-[hsl(220_3%_20%)] border border-[hsl(220_3%_28%)] shadow-xl p-1 max-h-48 overflow-y-auto">
            {devices.map((d) => (
              <button
                key={d.deviceId}
                onClick={() => { onSelect(d.deviceId); setOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2 text-left text-sm px-3 py-2 rounded-md transition-colors",
                  d.deviceId === selectedId
                    ? "bg-[hsl(214_82%_51%/0.12)] text-[hsl(214_82%_65%)]"
                    : "text-[hsl(220_3%_80%)] hover:bg-[hsl(220_3%_28%)]"
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
