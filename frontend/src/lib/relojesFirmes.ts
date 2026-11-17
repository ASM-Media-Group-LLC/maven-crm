import { CriticalTimers } from "livekit-client";

// RELOJES QUE NO SE DUERMEN (Alvaro, 17/11/2026: «la plataforma se laguea, se sale»).
//
// El 70 % de los cortes de llamada del 16/11 pasó con Maven en segundo plano:
// la persona trabaja en otra pestaña y Cowork queda atrás. Chrome adormece los
// relojes de las pestañas de atrás (tras unos minutos, una vez por minuto), y
// los relojes de LiveKit (el «ping» con el servidor, los plazos de reconexión)
// dejan de llegar a tiempo: el servidor cree que la persona se fue y la llamada
// «parpadea» o se cae.
//
// LiveKit deja cambiar esos relojes críticos (CriticalTimers). Aquí los movemos
// a un hilo aparte (un Worker), al que Chrome no adormece así: el reloj suena en
// el Worker y avisa a la página, que corre la función a tiempo.
//
// Si el navegador no deja crear el Worker, se quedan los relojes de siempre.

type Fn = (...args: unknown[]) => void;

const CODIGO_DEL_HILO = `
const relojes = new Map();
onmessage = (e) => {
  const { tipo, id, ms } = e.data;
  if (tipo === "empezar") {
    relojes.set(id, setTimeout(() => { relojes.delete(id); postMessage(id); }, ms));
  } else if (tipo === "repetir") {
    relojes.set(id, setInterval(() => postMessage(id), ms));
  } else if (tipo === "parar") {
    const r = relojes.get(id);
    if (r !== undefined) { clearTimeout(r); clearInterval(r); relojes.delete(id); }
  }
};`;

export interface RelojesFirmes {
  setTimeout: (fn: Fn, ms?: number, ...args: unknown[]) => number;
  setInterval: (fn: Fn, ms?: number, ...args: unknown[]) => number;
  clearTimeout: (id?: number) => void;
  clearInterval: (id?: number) => void;
}

/** Relojes que corren en un Worker. Devuelve null si el navegador no lo permite. */
export function crearRelojesFirmes(): RelojesFirmes | null {
  let hilo: Worker;
  try {
    if (typeof Worker === "undefined" || typeof Blob === "undefined") return null;
    hilo = new Worker(URL.createObjectURL(new Blob([CODIGO_DEL_HILO], { type: "application/javascript" })));
  } catch {
    return null;
  }
  // Ids altos para no chocar nunca con los de window.setTimeout.
  let siguiente = 1_000_000_000;
  const pendientes = new Map<number, { fn: Fn; args: unknown[]; repite: boolean }>();
  hilo.onmessage = (e: MessageEvent<number>) => {
    const r = pendientes.get(e.data);
    if (!r) return;
    if (!r.repite) pendientes.delete(e.data);
    try { r.fn(...r.args); } catch (err) { setTimeout(() => { throw err; }); }
  };
  const programar = (repite: boolean) => (fn: Fn, ms = 0, ...args: unknown[]) => {
    const id = siguiente++;
    pendientes.set(id, { fn, args, repite });
    hilo.postMessage({ tipo: repite ? "repetir" : "empezar", id, ms: Math.max(0, Number(ms) || 0) });
    return id;
  };
  const parar = (id?: number) => {
    if (id === undefined) return;
    // Un reloj programado antes de afirmar (con los de siempre) se limpia con los de siempre.
    if (!pendientes.has(id)) { clearTimeout(id); clearInterval(id); return; }
    pendientes.delete(id);
    hilo.postMessage({ tipo: "parar", id });
  };
  return { setTimeout: programar(false), setInterval: programar(true), clearTimeout: parar, clearInterval: parar };
}

let puestos = false;

/** Pone los relojes firmes en LiveKit (una vez por pestaña). Llamar antes de `new Room`. */
export function afirmarRelojesDeLiveKit(): void {
  if (puestos) return;
  puestos = true;
  const r = crearRelojesFirmes();
  if (!r) return;
  // Los ids de un reloj y otro no se mezclan: LiveKit siempre limpia con el
  // mismo CriticalTimers con que programó.
  const ct = CriticalTimers as unknown as RelojesFirmes;
  ct.setTimeout = r.setTimeout;
  ct.setInterval = r.setInterval;
  ct.clearTimeout = r.clearTimeout;
  ct.clearInterval = r.clearInterval;
}
