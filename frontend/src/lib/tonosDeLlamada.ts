// LOS SONIDOS DE UNA LLAMADA (Alvaro, 18/11/2026: «no suena que estoy llamando,
// no sé si a mí me suena si me llaman»). Las llamadas del Messenger no tenían
// ningún sonido: a quien recibía solo le salía el cartel, y quien llamaba
// esperaba en silencio.
//
//   · timbre: a quien lo llaman, mientras el cartel está abierto.
//   · espera: a quien llama, mientras le suena al otro («tuuu… tuuu…»).
//
// Se arman con WebAudio (osciladores): no hay archivos que bajar ni que fallen,
// y suenan igual en el navegador y en la app de computador.
//
// El navegador no deja sonar nada en una pestaña que nadie tocó todavía. Por eso
// el primer toque o tecla en la página reanuda el sonido; en la app de computador
// no hace falta (Electron deja sonar sin gesto).

type Nota = { hz: number[]; desde: number; dura: number; volumen: number };

/** Un ciclo del sonido: qué notas, cuándo, y cada cuánto se repite (segundos). */
export interface Patron {
  notas: Nota[];
  ciclo: number;
}

/** El timbre de quien recibe: «din-don, din-don» cada 3 s. */
export const TIMBRE: Patron = {
  ciclo: 3,
  notas: [
    { hz: [659.25], desde: 0, dura: 0.32, volumen: 0.22 },
    { hz: [523.25], desde: 0.36, dura: 0.5, volumen: 0.2 },
    { hz: [659.25], desde: 1.0, dura: 0.32, volumen: 0.22 },
    { hz: [523.25], desde: 1.36, dura: 0.5, volumen: 0.2 },
  ],
};

/** La espera de quien llama: el tono de llamada de siempre (425 Hz, como en
 *  Colombia), un segundo sonando y cuatro callado. */
export const ESPERA: Patron = {
  ciclo: 5,
  notas: [{ hz: [425], desde: 0, dura: 1.2, volumen: 0.12 }],
};

let contexto: AudioContext | null = null;
let desbloqueoPuesto = false;

function obtenerContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!contexto) {
    try { contexto = new Ctor(); } catch { return null; }
  }
  if (contexto.state === "suspended") void contexto.resume().catch(() => {});
  if (!desbloqueoPuesto) {
    desbloqueoPuesto = true;
    const reanudar = () => { if (contexto?.state === "suspended") void contexto.resume().catch(() => {}); };
    window.addEventListener("pointerdown", reanudar, { capture: true });
    window.addEventListener("keydown", reanudar, { capture: true });
  }
  return contexto;
}

/** Programa UNA vez el ciclo a partir de `t0` (tiempo del contexto). */
function tocarCiclo(ctx: AudioContext, patron: Patron, t0: number, nodos: Set<AudioScheduledSourceNode>) {
  for (const nota of patron.notas) {
    const inicio = t0 + nota.desde;
    const fin = inicio + nota.dura;
    const ganancia = ctx.createGain();
    // Envolvente suave: sin el «clic» de prender y apagar de golpe.
    ganancia.gain.setValueAtTime(0, inicio);
    ganancia.gain.linearRampToValueAtTime(nota.volumen, inicio + 0.02);
    ganancia.gain.setValueAtTime(nota.volumen, Math.max(inicio + 0.02, fin - 0.08));
    ganancia.gain.linearRampToValueAtTime(0, fin);
    ganancia.connect(ctx.destination);
    for (const hz of nota.hz) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(hz, inicio);
      osc.connect(ganancia);
      osc.start(inicio);
      osc.stop(fin + 0.02);
      nodos.add(osc);
      osc.onended = () => { nodos.delete(osc); try { osc.disconnect(); ganancia.disconnect(); } catch { /* noop */ } };
    }
  }
}

/** Hace sonar el patrón en bucle. Devuelve la función que lo calla. */
export function sonar(patron: Patron): () => void {
  const ctx = obtenerContexto();
  if (!ctx) return () => {};
  const nodos = new Set<AudioScheduledSourceNode>();
  let proximo = ctx.currentTime + 0.05;
  // Se programa con un ciclo de adelanto: aunque la pestaña quede atrás y el
  // reloj se atrase, el sonido no se corta.
  const programar = () => {
    while (proximo < ctx.currentTime + patron.ciclo * 1.5) {
      tocarCiclo(ctx, patron, proximo, nodos);
      proximo += patron.ciclo;
    }
  };
  programar();
  const id = window.setInterval(() => {
    // Si el contexto estuvo suspendido (pestaña sin tocar), se retoma desde ahora.
    if (proximo < ctx.currentTime) proximo = ctx.currentTime + 0.05;
    programar();
  }, 1000);
  let callado = false;
  return () => {
    if (callado) return;
    callado = true;
    window.clearInterval(id);
    for (const n of nodos) { try { n.stop(); } catch { /* ya terminó */ } }
    nodos.clear();
  };
}

/** Vibración del teléfono mientras suena (si el teléfono la tiene). */
export function vibrarMientrasSuena(): () => void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return () => {};
  const vibrar = () => { try { navigator.vibrate([400, 200, 400]); } catch { /* sin permiso */ } };
  vibrar();
  const id = window.setInterval(vibrar, 3000);
  return () => { window.clearInterval(id); try { navigator.vibrate(0); } catch { /* noop */ } };
}
