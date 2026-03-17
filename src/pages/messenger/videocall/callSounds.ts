/**
 * In-call notification sounds (generated via Web Audio API).
 * No external files needed.
 */

const ctx = () => {
  const w = window as any;
  if (!w.__callAudioCtx || w.__callAudioCtx.state === "closed") {
    w.__callAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (w.__callAudioCtx.state === "suspended") {
    w.__callAudioCtx.resume();
  }
  return w.__callAudioCtx as AudioContext;
};

/** Short two-tone chime – used for hand raised (like Google Meet's "ding-dong") */
export function playHandRaisedSound() {
  try {
    const ac = ctx();
    const now = ac.currentTime;
    const gain = ac.createGain();
    gain.connect(ac.destination);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    // First tone
    const o1 = ac.createOscillator();
    o1.type = "sine";
    o1.frequency.setValueAtTime(880, now);
    o1.connect(gain);
    o1.start(now);
    o1.stop(now + 0.2);

    // Second tone (higher)
    const o2 = ac.createOscillator();
    o2.type = "sine";
    o2.frequency.setValueAtTime(1174.66, now + 0.2); // D6
    o2.connect(gain);
    o2.start(now + 0.2);
    o2.stop(now + 0.5);
  } catch {
    // Audio context not available
  }
}

/** Soft pop – used for new chat message */
export function playChatMessageSound() {
  try {
    const ac = ctx();
    const now = ac.currentTime;
    const gain = ac.createGain();
    gain.connect(ac.destination);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(660, now);
    o.frequency.exponentialRampToValueAtTime(880, now + 0.08);
    o.connect(gain);
    o.start(now);
    o.stop(now + 0.25);
  } catch {
    // Audio context not available
  }
}

/** Participant joined – ascending two-tone */
export function playParticipantJoinedSound() {
  try {
    const ac = ctx();
    const now = ac.currentTime;
    const gain = ac.createGain();
    gain.connect(ac.destination);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    const o1 = ac.createOscillator();
    o1.type = "sine";
    o1.frequency.setValueAtTime(523.25, now); // C5
    o1.connect(gain);
    o1.start(now);
    o1.stop(now + 0.15);

    const o2 = ac.createOscillator();
    o2.type = "sine";
    o2.frequency.setValueAtTime(659.25, now + 0.15); // E5
    o2.connect(gain);
    o2.start(now + 0.15);
    o2.stop(now + 0.35);
  } catch {}
}

/** Participant left – descending two-tone */
export function playParticipantLeftSound() {
  try {
    const ac = ctx();
    const now = ac.currentTime;
    const gain = ac.createGain();
    gain.connect(ac.destination);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    const o1 = ac.createOscillator();
    o1.type = "sine";
    o1.frequency.setValueAtTime(659.25, now); // E5
    o1.connect(gain);
    o1.start(now);
    o1.stop(now + 0.15);

    const o2 = ac.createOscillator();
    o2.type = "sine";
    o2.frequency.setValueAtTime(523.25, now + 0.15); // C5
    o2.connect(gain);
    o2.start(now + 0.15);
    o2.stop(now + 0.35);
  } catch {}
}
