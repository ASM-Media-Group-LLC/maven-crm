// Aviso de "alguien pide coordinador" en el dashboard de Cowork.
//
// Es la "Campanita" que eligió Jhon: dos notas que suben (E5 → B5), amable pero
// clara. Se distingue del "Pulso" de mensajes nuevos (lib/notificationSound.ts)
// porque aquella suena las dos notas JUNTAS y más grave; esta las toca en
// secuencia y termina más arriba.
//
// Sintetizado con Web Audio igual que el Pulso: no pesa nada y suena igual en
// todos los navegadores. Un solo AudioContext compartido.

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!sharedCtx) sharedCtx = new AC();
    // El navegador lo arranca "suspended" hasta que hay un gesto del usuario. El
    // coordinador ya está usando el dashboard, así que normalmente ya hubo gesto.
    if (sharedCtx.state === "suspended") void sharedCtx.resume().catch(() => {});
    return sharedCtx;
  } catch {
    return null;
  }
}

function chime(ac: AudioContext, dest: AudioNode, at: number, freq: number, dur: number, vol: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, ac.currentTime + at);
  gain.gain.setValueAtTime(0.0001, ac.currentTime + at);
  gain.gain.exponentialRampToValueAtTime(vol, ac.currentTime + at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + at + dur);
  osc.connect(gain).connect(dest);
  osc.start(ac.currentTime + at);
  osc.stop(ac.currentTime + at + dur + 0.05);
}

/** Suena cuando entra una solicitud de coordinador nueva. */
export function playCoordinatorRequestSound(volume = 1): void {
  const ac = getCtx();
  if (!ac) return;
  try {
    const master = ac.createGain();
    master.gain.value = Math.max(0, Math.min(1, volume));
    master.connect(ac.destination);

    chime(ac, master, 0, 659.25, 0.28, 0.2);    // E5
    chime(ac, master, 0.11, 987.77, 0.42, 0.18); // B5 — la segunda cierra hacia arriba
  } catch {
    /* si el navegador no deja sonar, el panel igual muestra la solicitud */
  }
}
