import { useEffect, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";

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

// All known sound files in /public/sounds. Pre-warming these on first user
// interaction avoids the autoplay block that was making notifications skip
// at random — browsers gate Audio() until the document has had a real
// gesture, so the first ping after a fresh load was getting blocked
// silently while later ones (after the user clicked anything) worked.
const SOUND_NAMES = ["notification", "tiny", "Small", "medium", "large", "huge", "Show"] as const;

let _audioUnlocked = false;
let _audioPool: Map<string, HTMLAudioElement> | null = null;

const ensurePool = (): Map<string, HTMLAudioElement> => {
  if (_audioPool) return _audioPool;
  const pool = new Map<string, HTMLAudioElement>();
  for (const n of SOUND_NAMES) {
    try {
      const a = new Audio(`/sounds/${n}.mp3`);
      a.preload = "auto";
      pool.set(n, a);
    } catch {
      /* no-op */
    }
  }
  _audioPool = pool;
  return pool;
};

const unlockAudio = () => {
  if (_audioUnlocked) return;
  _audioUnlocked = true;
  const pool = ensurePool();
  // Silently bump every audio element so the browser flips them into
  // "user-allowed" state. Mirrors unlockAudio in the original
  // Roleplaychatters (index.html line 1559).
  pool.forEach((a) => {
    try {
      a.volume = 0;
      void a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
    } catch {
      /* no-op */
    }
  });
};

// Audio unlock is now registered lazily inside the VolumeControl component
// (via useEffect) instead of at module level. This prevents sounds from
// playing on pages that don't use the chatter evaluator (e.g. Landing on
// mobile, where the module-level approach was causing phantom audio).
const registerUnlockListeners = () => {
  if (typeof window === "undefined" || _audioUnlocked) return () => {};
  const opts = { once: true, capture: true } as const;
  window.addEventListener("click", unlockAudio, opts);
  window.addEventListener("keydown", unlockAudio, opts);
  window.addEventListener("touchstart", unlockAudio, opts);
  return () => {
    window.removeEventListener("click", unlockAudio, opts);
    window.removeEventListener("keydown", unlockAudio, opts);
    window.removeEventListener("touchstart", unlockAudio, opts);
  };
};

// Plays an mp3 from /public/sounds at the persisted volume. Mirrors the
// original Roleplaychatters playSound (index.html line 1580). Reuses a
// pre-warmed pool so playback isn't gated by a fresh fetch + decode each
// time, which is what was causing the inconsistent notification ping.
export const playSoundFile = (name: string): void => {
  const vol = getSoundVolume();
  if (vol <= 0) return;
  const pool = ensurePool();
  const base = pool.get(name);
  if (!base) return;
  try {
    // Clone so two simultaneous events (e.g. message + tip) don't fight
    // over playback position on the same element.
    const a = (base.cloneNode(true) as HTMLAudioElement);
    a.volume = vol;
    void a.play().catch(() => {});
  } catch {
    /* no-op */
  }
};

interface VolumeControlProps {
  /** Optional className for the outer wrapper (lets callers tune spacing). */
  className?: string;
  /** When true, the control uses lighter colors for dark gradient headers. */
  onDark?: boolean;
}

export const VolumeControl = ({ className, onDark }: VolumeControlProps) => {
  const { t } = useLanguage();
  const [volume, setVolume] = useState<number>(() => getSoundVolume());

  // Register audio unlock listeners only when this component mounts
  // (i.e. when the user is actually on a chatter evaluator page).
  useEffect(() => registerUnlockListeners(), []);

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
        title={volume > 0 ? t("chatters.volume.mute") : t("chatters.volume.unmute")}
        aria-label={t("chatters.volume.sound")}
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
        aria-label={t("chatters.volume.volume")}
      />
    </div>
  );
};

export default VolumeControl;
