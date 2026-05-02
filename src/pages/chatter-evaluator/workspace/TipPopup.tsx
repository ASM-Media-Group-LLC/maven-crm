import { useEffect, useRef, useState } from "react";
import { getSoundVolume } from "./VolumeControl";

// Mirrors the original Roleplaychatters showTipPopup (index.html line 5360):
// fullscreen overlay, emoji that scales with amount, confetti shower, big
// dollar amount, fades out after ~2.5s. The emoji set/size/confetti count
// thresholds are kept identical to the original so a $5 tip looks exactly
// the same as it did before.

const tierForAmount = (amount: number) => {
  if (amount <= 5) return { emoji: "🪙🪙", sizePx: 80, confettiCount: 8, freq: 660 };
  if (amount <= 10) return { emoji: "💸💸", sizePx: 85, confettiCount: 12, freq: 740 };
  if (amount <= 50) return { emoji: "🔥🔥", sizePx: 90, confettiCount: 20, freq: 880 };
  if (amount <= 100) return { emoji: "👿👿", sizePx: 100, confettiCount: 30, freq: 988 };
  if (amount <= 200) return { emoji: "🥵🥵👿👿", sizePx: 110, confettiCount: 45, freq: 1175 };
  return { emoji: "🥵🥵👿👿💦💦", sizePx: 120, confettiCount: 60, freq: 1320 };
};

// WebAudio "ka-ching" — pitch and length scale with amount. Replaces the
// per-tier mp3 assets (tiny/Small/medium/large/huge/Show) the original
// shipped, since we don't ship those files.
let _audioCtxTip: AudioContext | null = null;
export const playTipSound = (amount: number) => {
  const vol = getSoundVolume();
  if (vol <= 0) return;
  const { freq } = tierForAmount(amount);
  try {
    _audioCtxTip ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = _audioCtxTip;
    const t = ctx.currentTime;
    // Two-note arpeggio so a bigger tip has a meatier sound.
    const dur = Math.min(0.8, 0.35 + amount / 400);
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    o1.type = "triangle";
    o2.type = "sine";
    o1.frequency.setValueAtTime(freq, t);
    o2.frequency.setValueAtTime(freq * 1.5, t + dur * 0.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18 * vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(g);
    o2.connect(g);
    g.connect(ctx.destination);
    o1.start(t);
    o2.start(t + dur * 0.4);
    o1.stop(t + dur);
    o2.stop(t + dur);
  } catch {
    /* no-op */
  }
};

interface ConfettiBit {
  id: number;
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
}

interface TipPopupProps {
  /** When this changes to a non-null number, the popup fires. Null hides it. */
  amount: number | null;
  /** Called once the fade-out finishes so the parent can clear `amount`. */
  onDone: () => void;
}

export const TipPopup = ({ amount, onDone }: TipPopupProps) => {
  const [visible, setVisible] = useState(false);
  const [confetti, setConfetti] = useState<ConfettiBit[]>([]);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (amount == null) return;
    const tier = tierForAmount(amount);
    setConfetti(
      Array.from({ length: tier.confettiCount }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 20 + Math.random() * 25,
        delay: Math.random() * 500,
        duration: 1000 + Math.random() * 1500,
      })),
    );
    // Mount, then flip to visible on the next frame so the CSS transition
    // (opacity + scale) actually plays.
    const r = requestAnimationFrame(() => setVisible(true));
    const tFade = window.setTimeout(() => setVisible(false), 2500);
    const tDone = window.setTimeout(() => onDoneRef.current(), 3000);
    return () => {
      cancelAnimationFrame(r);
      window.clearTimeout(tFade);
      window.clearTimeout(tDone);
    };
  }, [amount]);

  if (amount == null) return null;
  const tier = tierForAmount(amount);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-black/60 transition-opacity duration-200"
      style={{ opacity: visible ? 1 : 0 }}
      aria-live="polite"
    >
      {confetti.map((c) => (
        <span
          key={c.id}
          className="absolute"
          style={{
            left: `${c.left}%`,
            top: `${c.top}%`,
            fontSize: `${c.size}px`,
            opacity: 0,
            animation: `tip-confetti ${c.duration}ms ease-out ${c.delay}ms forwards`,
          }}
        >
          🎉
        </span>
      ))}
      <div
        className="z-10 transition-transform duration-300"
        style={{
          fontSize: `${tier.sizePx}px`,
          transform: visible ? "scale(1)" : "scale(0.3)",
          textShadow: "0 4px 24px rgba(0,0,0,0.6)",
        }}
      >
        {tier.emoji}
      </div>
      <div
        className="z-10 mt-2.5 text-3xl font-extrabold text-amber-400"
        style={{ textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}
      >
        ${amount} USD
      </div>
    </div>
  );
};

export default TipPopup;
