// Tono unificado de "mensaje nuevo" para Messenger, bandeja de WhatsApp,
// bandeja de Telegram y Chatter Evaluator. Es el "Pulso": dos notas suaves
// (A4 + E5) que suben juntas en un swell corto.
//
// Sintetizado con Web Audio en vez de reproducir un .wav/.mp3: no pesa nada,
// suena idéntico en todos los navegadores y es más limpio que el viejo
// message.wav / notification.mp3. Un solo AudioContext compartido para no
// agotar el límite del navegador.

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    if (!sharedCtx) sharedCtx = new AC();
    // El navegador lo arranca "suspended" hasta que hay un gesto del usuario;
    // como el ding suena mientras la persona usa la bandeja, ya hubo gesto.
    if (sharedCtx.state === "suspended") void sharedCtx.resume().catch(() => {});
    return sharedCtx;
  } catch {
    return null;
  }
}

// Semántica de "reinicio": el message.wav viejo era UN solo elemento de audio
// que se reiniciaba en cada mensaje, así que una ráfaga no se apilaba. Como acá
// creamos osciladores nuevos por llamada, guardamos los activos y cortamos el
// ding anterior antes de arrancar el nuevo.
let activeOsc: OscillatorNode[] = [];
let activeMaster: GainNode | null = null;

function stopActive(ac: AudioContext) {
  if (activeMaster) {
    try {
      activeMaster.gain.cancelScheduledValues(ac.currentTime);
      activeMaster.gain.setValueAtTime(0.0001, ac.currentTime);
    } catch {
      /* no-op */
    }
  }
  activeOsc.forEach((o) => {
    try {
      o.stop(ac.currentTime + 0.02);
    } catch {
      /* ya detenido */
    }
  });
  activeOsc = [];
  activeMaster = null;
}

/**
 * Reproduce el tono de mensaje nuevo (Pulso).
 * @param volume 0..1 — para respetar el slider de volumen del Chatter Evaluator.
 *               Los demás lo llaman sin argumento (volumen pleno).
 */
export function playMessageNotification(volume = 1): void {
  const vol = Math.max(0, Math.min(1, volume));
  if (vol <= 0) return;
  const ac = getCtx();
  if (!ac) return;

  stopActive(ac);

  const master = ac.createGain();
  master.gain.value = 0.9 * vol;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 7000;
  master.connect(lp).connect(ac.destination);
  activeMaster = master;

  const t = ac.currentTime + 0.02;
  [440, 659.25].forEach((freq) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 1.2);
    activeOsc.push(osc);
  });
}
