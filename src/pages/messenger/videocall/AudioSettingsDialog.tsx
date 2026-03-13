import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Mic, Volume2, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeviceInfo {
  deviceId: string;
  label: string;
}

interface AudioSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onAudioInputChange?: (deviceId: string) => void;
  onAudioOutputChange?: (deviceId: string) => void;
  currentAudioInputId?: string;
  currentAudioOutputId?: string;
}

export default function AudioSettingsDialog({
  open, onClose,
  onAudioInputChange, onAudioOutputChange,
  currentAudioInputId, currentAudioOutputId,
}: AudioSettingsDialogProps) {
  const [audioInputs, setAudioInputs] = useState<DeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<DeviceInfo[]>([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState(currentAudioInputId || "");
  const [selectedAudioOutput, setSelectedAudioOutput] = useState(currentAudioOutputId || "");

  const enumerateDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(devices.filter((d) => d.kind === "audioinput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || `Micrófono ${d.deviceId.slice(0, 5)}` })));
      setAudioOutputs(devices.filter((d) => d.kind === "audiooutput" && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label || `Altavoz ${d.deviceId.slice(0, 5)}` })));
    } catch {}
  }, []);

  useEffect(() => {
    if (open) {
      enumerateDevices();
      setSelectedAudioInput(currentAudioInputId || "");
      setSelectedAudioOutput(currentAudioOutputId || "");
    }
  }, [open, enumerateDevices, currentAudioInputId, currentAudioOutputId]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[hsl(220_3%_17%)] border-[hsl(220_3%_25%)] text-[hsl(220_3%_90%)] max-w-sm p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base font-medium text-white">Audio</DialogTitle>
        </DialogHeader>
        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
          <DeviceSection icon={<Mic className="h-4 w-4" />} label="Micrófono" devices={audioInputs} selectedId={selectedAudioInput} onSelect={(id) => { setSelectedAudioInput(id); onAudioInputChange?.(id); }} />
          <DeviceSection icon={<Volume2 className="h-4 w-4" />} label="Altavoces" devices={audioOutputs} selectedId={selectedAudioOutput} onSelect={(id) => { setSelectedAudioOutput(id); onAudioOutputChange?.(id); }} />
        </div>
      </DialogContent>
    </Dialog>
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
