// UN SOLO AudioContext PARA TODOS LOS MONITORES DEL HUB (19/11/2026).
//
// La medición de llamadas marcaba «tituloBonito.js:Response.json.then» (~1,2 s
// de promedio, picos de 4 s): es lo que corre apenas llega el token de una sala
// (cowork-session → res.json()) y sigue de un tirón hasta `room.connect`. Ahí
// livekit-client crea un AudioContext NUEVO por cada sala (Room.acquireAudioContext)
// y crearlo es síncrono y caro (abre el dispositivo de audio; en Windows tarda
// cientos de ms). El Hub tiene un monitor por sala —nueve, quince— y cada
// reintento es una Room nueva: un AudioContext nuevo cada vez.
//
// Con `webAudioMix` apagado (lo de siempre en los monitores), ese AudioContext
// solo lo usa el participante local; el audio de las salas sigue saliendo por
// sus <audio> (AudioSink) igual que antes. Aquí se le presta a cada Room el
// MISMO AudioContext, ya creado: livekit no crea otro (solo crea si no tiene o
// si está cerrado). Y como livekit cierra «su» AudioContext al desconectarse, el
// compartido no se deja cerrar: vive lo que vive la página.

let compartido: AudioContext | null = null;

function crear(): AudioContext | null {
  const Ctor = typeof window !== "undefined"
    ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    : undefined;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor({ latencyHint: "interactive" });
    // livekit lo cierra al colgar cada sala: aquí no se cierra nunca.
    Object.defineProperty(ctx, "close", { value: () => Promise.resolve(), configurable: true });
    // Igual que livekit: si nace suspendido (sin gesto), se reanuda al primer clic.
    if (ctx.state === "suspended" && typeof document !== "undefined") {
      const reanudar = () => {
        void ctx.resume().catch(() => { /* el próximo clic */ }).finally(() => {
          if (ctx.state !== "suspended") document.removeEventListener("click", reanudar, true);
        });
      };
      document.addEventListener("click", reanudar, true);
    }
    return ctx;
  } catch {
    return null;
  }
}

/** El AudioContext compartido de los monitores (se crea una vez). */
export function audioDeMonitores(): AudioContext | null {
  if (!compartido || compartido.state === "closed") compartido = crear();
  return compartido;
}

/**
 * Le presta el AudioContext compartido a una Room de monitor ANTES de conectar.
 * Si algo falla, la Room sigue como siempre (crea el suyo).
 */
export function prestarAudioDeMonitores(room: object): void {
  try {
    const r = room as { audioContext?: AudioContext };
    if (r.audioContext && r.audioContext.state !== "closed") return;
    const ctx = audioDeMonitores();
    if (ctx) r.audioContext = ctx;
  } catch { /* la Room crea el suyo */ }
}
