import { useEffect, useState } from "react";

// Mirrors the original Roleplaychatters volume control (index.html, btnSound
// + volumeSlider). Persisted in localStorage so the choice survives reloads
// and is shared between the examiner and chatter views in the same browser.
const STORAGE_KEY = "maven.chatter.soundVolume";
const DEFAULT_VOLUME = 0.5;

export const getSoundVolume = (): number => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_VOLUME;
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return DEFAULT_VOLUME;
    return Math.max(0, Math.min(1, v));
  } catch {
    return DEFAULT_VOLUME;
  }
};

const setStoredVolume = (v: number) => {
  try {
    localStorage.setItem(STORAGE_KEY, String(v));
    // Notify other components in this tab (storage event only fires across tabs).
    window.dispatchEvent(new CustomEvent("maven:soundVolume", { detail: v }));
  } catch {
    /* no-op */
  }
};

/** Same icon mapping as the original: 🔊 > 0.5, 🔉 > 0, 🔇 = 0. */
const iconFor = (v: number) => (v > 0 ? (v > 0.5 ? "🔊" : "🔉") : "🔇");

interface VolumeControlProps {
  /** Optional className for the outer wrapper (lets callers tune spacing). */
  className?: string;
  /** When true, the control uses lighter colors for dark gradient headers. */
  onDark?: boolean;
}

export const VolumeControl = ({ className, onDark }: VolumeControlProps) => {
  const [volume, setVolume] = useState<number>(() => getSoundVolume());

  // Stay in sync with other VolumeControl instances and other tabs.
  useEffect(() => {
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      if (typeof detail === "number") setVolume(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setVolume(getSoundVolume());
    };
    window.addEventListener("maven:soundVolume", onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("maven:soundVolume", onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const apply = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolume(clamped);
    setStoredVolume(clamped);
  };

  const handleToggle = () => {
    // Same toggle as the original: > 0 mutes, = 0 restores to 0.5.
    apply(volume > 0 ? 0 : DEFAULT_VOLUME);
  };

  const handleSlide = (e: React.ChangeEvent<HTMLInputElement>) => {
    apply(parseInt(e.target.value, 10) / 100);
  };

  const btnClasses = onDark
    ? "rounded p-1 text-base hover:bg-white/10"
    : "rounded p-1 text-base hover:bg-muted";
  const sliderClasses = onDark
    ? "h-1 w-[70px] cursor-pointer accent-amber-400"
    : "h-1 w-[70px] cursor-pointer accent-primary";

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <button
        type="button"
        onClick={handleToggle}
        className={btnClasses}
        title={volume > 0 ? "Silenciar" : "Activar sonido"}
        aria-label="Sonido"
      >
        {iconFor(volume)}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(volume * 100)}
        onChange={handleSlide}
        className={sliderClasses}
        aria-label="Volumen"
      />
    </div>
  );
};

export default VolumeControl;
