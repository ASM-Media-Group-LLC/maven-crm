// Voz del navegador, en español neutro.
//
// La usan el supervisor de encuadre (que le habla a la persona que quedó fuera
// de cuadro) y el dashboard del supervisor (que le dice a quién le pasa). Cada
// una suena en SU propia máquina: no viaja por la llamada, no gasta ancho de
// banda y no queda dentro de la grabación.
//
// ── POR QUÉ ESTO ES MÁS QUE UN `speak()` ────────────────────────────────────
//
// Chrome carga la lista de voces DE FORMA ASÍNCRONA. Recién cargada la página,
// `getVoices()` devuelve un arreglo VACÍO — y si le pedís que hable en ese
// momento, acepta el pedido, pone `speaking = true`… y no dice absolutamente
// nada. Sin error, sin excepción, sin un evento. La frase se pierde.
//
// Medido en producción el 29/08/2026, en una pestaña recién recargada por el
// service worker:
//
//     voces: 0 · speaking: true · evento onstart: ninguno
//
// O sea: el peor fallo posible para un sistema de alertas. Todo dice que
// funcionó y nadie escuchó nada. Justo el modo de falla que veníamos cazando
// toda la noche en el timbre y en la presencia.
//
// A eso se suma la política de gestos del navegador: una pestaña que se recargó
// sola y en la que nadie tocó nada todavía puede tener la síntesis frenada.
//
// El timbre de llamadas ya tenía resuelto el problema equivalente para el audio
// (`installRingAudioUnlock`, en CallProvider). Esto es lo mismo, para la voz.

/** La voz en español elegida, cacheada. `getVoices()` puede tardar en llenarse. */
let vozEs: SpeechSynthesisVoice | null = null;
let vocesListas = false;

/** Lo último que se quiso decir mientras las voces no estaban listas. Se guarda
 *  UNA sola frase, no una cola: si se acumularan cinco avisos viejos y se
 *  soltaran todos juntos al cargar, sería peor que perderlos. Interesa el
 *  último estado, no la historia. */
let pendiente: { texto: string; opciones?: OpcionesVoz } | null = null;

export interface OpcionesVoz {
  volumen?: number;
  velocidad?: number;
}

function elegirVoz(sintesis: SpeechSynthesis): void {
  const voces = sintesis.getVoices();
  if (!voces.length) return;
  vocesListas = true;
  vozEs = voces.find((v) => v.lang?.toLowerCase().startsWith("es")) ?? null;
}

/** Se llama sola al importar el módulo: engancha el evento que avisa cuando el
 *  navegador terminó de cargar las voces, y suelta lo que hubiera quedado
 *  pendiente. */
function prepararVoces(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const sintesis = window.speechSynthesis;
  elegirVoz(sintesis);
  // `voiceschanged` es el único aviso fiable de que la lista ya está. En
  // Chrome llega unos cientos de ms después de cargar la página.
  sintesis.addEventListener?.("voiceschanged", () => {
    elegirVoz(sintesis);
    if (vocesListas && pendiente) {
      const p = pendiente;
      pendiente = null;
      hablar(p.texto, p.opciones);
    }
  });
}
prepararVoces();

/** Desbloquea la síntesis con el primer gesto del usuario.
 *
 *  Mismo motivo que `installRingAudioUnlock` para el timbre: el navegador puede
 *  tener la voz frenada hasta que la persona toque algo en esa pestaña. Se
 *  pronuncia una frase vacía a volumen cero, que no se oye pero destraba.
 *
 *  Devuelve la función para desengancharlo. */
export function instalarDesbloqueoDeVoz(): () => void {
  if (typeof window === "undefined" || !window.speechSynthesis) return () => {};
  const sintesis = window.speechSynthesis;
  let hecho = false;
  const destrabar = () => {
    if (hecho) return;
    hecho = true;
    try {
      sintesis.resume();          // por si quedó pausada
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      sintesis.speak(u);
      elegirVoz(sintesis);
    } catch { /* si no se puede, el aviso escrito sigue estando */ }
    quitar();
  };
  const eventos: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
  const quitar = () => eventos.forEach((e) => window.removeEventListener(e, destrabar));
  eventos.forEach((e) => window.addEventListener(e, destrabar, { once: false, passive: true }));
  return quitar;
}

/** Habla el texto. Devuelve false si este navegador no puede hablar AHORA.
 *
 *  Si las voces todavía no cargaron, guarda la frase y la dice apenas estén, en
 *  vez de perderla en silencio — que es lo que pasaba antes. */
export function hablar(texto: string, opciones?: OpcionesVoz): boolean {
  try {
    const sintesis = window.speechSynthesis;
    if (!sintesis) return false;

    // Las voces todavía no están: hablar ahora sería tirar la frase a la basura.
    // Se guarda y `voiceschanged` la suelta.
    if (!vocesListas) {
      elegirVoz(sintesis);
      if (!vocesListas) {
        pendiente = { texto, opciones };
        return false;
      }
    }

    // Si venía diciendo otra cosa, se corta: dos frases encimadas no se
    // entienden y es peor que una sola.
    sintesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "es-419";
    u.rate = opciones?.velocidad ?? 0.95;
    u.volume = opciones?.volumen ?? 0.9;
    if (vozEs) u.voice = vozEs;

    // Si aceptó el pedido y nunca arrancó, que al menos quede DICHO en la
    // consola. Un sistema de alertas que falla callado es peor que uno que se
    // cae: nadie se entera de que se perdió algo.
    let arranco = false;
    u.onstart = () => { arranco = true; };
    u.onerror = (e) => {
      console.warn("[Voz] El navegador rechazó hablar:", (e as SpeechSynthesisErrorEvent).error,
        "— el aviso escrito sigue estando.");
    };
    window.setTimeout(() => {
      if (!arranco) {
        console.warn("[Voz] Se pidió hablar y nunca arrancó. Suele ser el navegador",
          "esperando un clic en esta pestaña. Frase:", texto.slice(0, 60));
      }
    }, 2000);

    sintesis.speak(u);
    return true;
  } catch {
    return false;
  }
}
