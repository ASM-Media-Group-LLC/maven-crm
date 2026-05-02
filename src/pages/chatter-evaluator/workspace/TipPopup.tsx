import { useEffect, useRef, useState } from "react";
import { playSoundFile } from "./VolumeControl";

// Mirrors the original Roleplaychatters showTipPopup (index.html line 5360):
// fullscreen overlay, emoji that scales with amount, confetti shower, big
// dollar amount, fades out after ~2.5s. The emoji set/size/confetti count
// thresholds are kept identical to the original so a $5 tip looks exactly
// the same as it did before.

const tierForAmount = (amount: number) => {
  if (amount <= 5)   return { emoji: "🪙🪙",                sizePx: 80,  confettiCount: 8,  sound: "tiny" };
  if (amount <= 10)  return { emoji: "💸💸",               sizePx: 85,  confettiCount: 12, sound: "Small" };
  if (amount <= 50)  return { emoji: "🔥🔥",               sizePx: 90,  confettiCount: 20, sound: "medium" };
  if (amount <= 100) return { emoji: "👿👿",               sizePx: 100, confettiCount: 30, sound: "large" };
  if (amount <= 200) return { emoji: "🥵🥵👿👿",           sizePx: 110, confettiCount: 45, sound: "huge" };
  return                    { emoji: "🥵🥵👿👿💦💦",       sizePx: 120, confettiCount: 60, sound: "Show" };
};

// Same per-amount mp3 mapping as the original (index.html playSoundTip,
// line 1601). The files live under /public/sounds and were copied verbatim
// from the original project.
export const playTipSound = (amount: number): void => {
  playSoundFile(tierForAmount(amount).sound);
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
