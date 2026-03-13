import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mic, Volume2, Video as VideoIcon, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import BackgroundSelector, { BackgroundEffect } from "./BackgroundSelector";

interface DeviceInfo {
  deviceId: string;
  label: string;
}

interface InCallSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  backgroundEffect: BackgroundEffect;
  onBackgroundChange: (effect: BackgroundEffect) => void;
  onAudioInputChange?: (deviceId: string) => void;
  onAudioOutputChange?: (deviceId: string) => void;
  onVideoInputChange?: (deviceId: string) => void;
  currentAudioInputId?: string;
  currentAudioOutputId?: string;
  currentVideoInputId?: string;
}

export default function InCallSettingsDialog({
  open,
  onClose,
  backgroundEffect,
  onBackgroundChange,
  onAudioInputChange,
  onAudioOutputChange,
  onVideoInputChange,
  currentAudioInputId,
  currentAudioOutputId,
  currentVideoInputId,
}: InCallSettingsDialogProps) {
  const [audioInputs, setAudioInputs] = useState<DeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<DeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<DeviceInfo[]>([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState(currentAudioInputId || "");
  const [selectedAudioOutput, setSelectedAudioOutput] = useState(currentAudioOutputId || "");
  const [selectedVideoInput, setSelectedVideoInput] = useState(currentVideoInputId || "");
  const [activeTab, setActiveTab] = useState<"audio" | "video">("audio");

  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(
        devices.filter((d) => d.kind === "audioinput" && d.deviceId).map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Micrófono ${d.deviceId.slice(0, 5)}`,
        }))
      );
      setAudioOutputs(
        devices.filter((d) => d.kind === "audiooutput" && d.deviceId).map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Altavoz ${d.deviceId.slice(0, 5)}`,
        }))
      );
      setVideoInputs(
        devices.filter((d) => d.kind === "videoinput" && d.deviceId).map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Cámara ${d.deviceId.slice(0, 5)}`,
        }))
      );
    } catch {}
  }, []);

  useEffect(() => {
    if (open) {
      enumerateDevices();
      setSelectedAudioInput(currentAudioInputId || "");
      setSelectedAudioOutput(currentAudioOutputId || "");
      setSelectedVideoInput(currentVideoInputId || "");
    }
  }, [open, enumerateDevices, currentAudioInputId, currentAudioOutputId, currentVideoInputId]);

  const handleAudioInputSelect = (id: string) => {
    setSelectedAudioInput(id);
    onAudioInputChange?.(id);
  };

  const handleAudioOutputSelect = (id: string) => {
    setSelectedAudioOutput(id);
    onAudioOutputChange?.(id);
  };

  const handleVideoInputSelect = (id: string) => {
    setSelectedVideoInput(id);
    onVideoInputChange?.(id);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[hsl(220_3%_17%)] border-[hsl(220_3%_25%)] text-[hsl(220_3%_90%)] max-w-md p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-medium text-white">Configuración</DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex border-b border-[hsl(220_3%_25%)] px-5">
          <TabButton active={activeTab === "audio"} onClick={() => setActiveTab("audio")}>
            Audio
          </TabButton>
          <TabButton active={activeTab === "video"} onClick={() => setActiveTab("video")}>
            Vídeo
          </TabButton>
        </div>

        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {activeTab === "audio" && (
            <>
              <DeviceSection
                icon={<Mic className="h-4 w-4" />}
                label="Micrófono"
                devices={audioInputs}
                selectedId={selectedAudioInput}
                onSelect={handleAudioInputSelect}
              />
              <DeviceSection
                icon={<Volume2 className="h-4 w-4" />}
                label="Altavoces"
                devices={audioOutputs}
                selectedId={selectedAudioOutput}
                onSelect={handleAudioOutputSelect}
              />
            </>
          )}

          {activeTab === "video" && (
            <>
              <DeviceSection
                icon={<VideoIcon className="h-4 w-4" />}
                label="Cámara"
                devices={videoInputs}
                selectedId={selectedVideoInput}
                onSelect={handleVideoInputSelect}
              />

              {/* Background effects inline */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-[hsl(220_3%_70%)]">Fondos y efectos</p>
                <InlineBackgroundSelector selected={backgroundEffect} onSelect={onBackgroundChange} />
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2.5 text-sm font-medium transition-colors relative",
        active
          ? "text-[hsl(214_82%_65%)]"
          : "text-[hsl(220_3%_55%)] hover:text-[hsl(220_3%_75%)]"
      )}
    >
      {children}
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(214_82%_51%)] rounded-full" />
      )}
    </button>
  );
}

function DeviceSection({
  icon,
  label,
  devices,
  selectedId,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  devices: DeviceInfo[];
  selectedId: string;
  onSelect: (id: string) => void;
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

// Inline background selector for in-call settings (not a popover, directly rendered)
import { Ban, Cloud } from "lucide-react";
import { BACKGROUND_TEMPLATES } from "./BackgroundSelector";

function InlineBackgroundSelector({ selected, onSelect }: { selected: BackgroundEffect; onSelect: (e: BackgroundEffect) => void }) {
  const isSelected = (id: string) => selected === id;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <InlineEffectOption label="Sin efecto" active={isSelected("none")} onClick={() => onSelect("none")}>
          <div className="w-full h-full bg-[hsl(220_3%_25%)] rounded flex items-center justify-center">
            <Ban className="h-4 w-4 text-[hsl(220_3%_55%)]" />
          </div>
        </InlineEffectOption>
        <InlineEffectOption label="Difuminar fondo" active={isSelected("blur")} onClick={() => onSelect("blur")}>
          <div className="w-full h-full rounded bg-[hsl(220_3%_28%)] flex items-center justify-center">
            <Cloud className="h-4 w-4 text-[hsl(220_3%_55%)]" />
          </div>
        </InlineEffectOption>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {BACKGROUND_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            title={tpl.label}
            onClick={() => onSelect(tpl.id)}
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
  );
}

function InlineEffectOption({
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
