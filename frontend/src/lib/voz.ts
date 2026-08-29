// Voz del navegador, en español neutro.
//
// La usan el supervisor de encuadre (que le habla a la persona que quedó fuera
// de cuadro) y el dashboard del supervisor (que le dice a quién le pasa). Cada
// una suena en SU propia máquina: no viaja por la llamada, no gasta ancho de
// banda y no queda dentro de la grabación.
//
// ── LA REGLA DE ORO DE ESTE ARCHIVO ─────────────────────────────────────────
//
// SIEMPRE se intenta hablar. Nunca se retiene una frase esperando a que algo
// esté "listo".
//
// Una versión anterior tenía una guarda que parecía sensata: si `getVoices()`
// viene vacío, guardar la frase y decirla cuando carguen las voces. Rompió la
// voz para todos, en producción, la misma noche. Motivo: hay navegadores donde
// la lista de voces se llena RECIÉN DESPUÉS de la primera llamada a `speak()`.
// La guarda creaba un candado — no hablaba porque no había voces, y no había
// voces porque no hablaba.
//
// La lista de voces sirve para ELEGIR una voz en español. No para decidir si se
// habla. Sin voz elegida el navegador usa la suya por defecto: peor acento, se
// entiende igual. El silencio no se entiende.
//
// ── LO QUE SÍ HAY QUE CUIDAR ────────────────────────────────────────────────
//
// · `cancel()` inmediatamente antes de `speak()` puede dejar el motor colgado
//   en Chrome. Solo se cancela si de verdad hay algo sonando.
// · Si se pidió hablar y nunca arrancó, queda dicho en consola. Un sistema de
//   alertas que falla callado es peor que uno que se cae: nadie se entera de
//   que se perdió algo.
// · Si el motor de voz de Chrome queda trabado —pasa: `speaking` en true, cero
//   eventos, y sobrevive a recargar la página Y a cambiar de sitio— no hay nada
//   que este archivo pueda hacer. Se avisa con esas palabras, para no volver a
//   perder horas buscándolo en el lugar equivocado.

export interface OpcionesVoz {
  volumen?: number;
  velocidad?: number;
}

/** La voz en español elegida, si el navegador ya publicó su lista. Es una
 *  MEJORA, no un requisito: si no hay, se habla igual. */
let vozEs: SpeechSynthesisVoice | null = null;

function refrescarVoz(sintesis: SpeechSynthesis): void {
  try {
    const voces = sintesis.getVoices();
    if (!voces.length) return;
    vozEs = voces.find((v) => v.lang?.toLowerCase().startsWith("es")) ?? vozEs;
  } catch { /* da igual: se habla con la voz por defecto */ }
}

// Al cargar el módulo se intenta una vez y se queda escuchando el aviso de que
// la lista cambió. Ninguna de las dos cosas bloquea nada.
if (typeof window !== "undefined" && window.speechSynthesis) {
  refrescarVoz(window.speechSynthesis);
  window.speechSynthesis.addEventListener?.("voiceschanged", () => {
    if (window.speechSynthesis) refrescarVoz(window.speechSynthesis);
  });
}

/** Desbloquea la síntesis con el primer gesto del usuario.
 *
 *  Mismo motivo que `installRingAudioUnlock` para el timbre: el navegador puede
 *  tener la voz frenada hasta que la persona toque algo en esa pestaña, y una
 *  pestaña que se recargó sola (service worker actualizando) no tuvo ningún
 *  gesto todavía. Se pronuncia una frase vacía a volumen cero: no se oye, pero
 *  destraba y de paso empuja al navegador a publicar la lista de voces.
 *
 *  Devuelve la función para desengancharlo. */
export function instalarDesbloqueoDeVoz(): () => void {
  if (typeof window === "undefined" || !window.speechSynthesis) return () => {};
  const sintesis = window.speechSynthesis;
  const eventos: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
  let hecho = false;
  const quitar = () => eventos.forEach((e) => window.removeEventListener(e, destrabar));
  function destrabar() {
    if (hecho) return;
    hecho = true;
    try {
      sintesis.resume();
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      sintesis.speak(u);
      refrescarVoz(sintesis);
    } catch { /* el aviso escrito sigue estando igual */ }
    quitar();
  }
  eventos.forEach((e) => window.addEventListener(e, destrabar, { passive: true }));
  return quitar;
}

/** Habla el texto. Devuelve false solo si este navegador no tiene síntesis. */
export function hablar(texto: string, opciones?: OpcionesVoz): boolean {
  try {
    const sintesis = window.speechSynthesis;
    if (!sintesis) return false;

    // Solo se corta lo anterior si DE VERDAD hay algo sonando. Cancelar por las
    // dudas, justo antes de hablar, es uno de los patrones que cuelga el motor
    // de Chrome.
    if (sintesis.speaking || sintesis.pending) sintesis.cancel();

    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "es-419";
    u.rate = opciones?.velocidad ?? 0.95;
    u.volume = opciones?.volumen ?? 0.9;
    // Si todavía no hay lista de voces, se habla igual con la del navegador.
    refrescarVoz(sintesis);
    if (vozEs) u.voice = vozEs;

    let arranco = false;
    u.onstart = () => { arranco = true; };
    u.onerror = (e) => {
      const motivo = (e as SpeechSynthesisErrorEvent).error;
      // 'canceled' e 'interrupted' son normales: alguien habló encima.
      if (motivo === "canceled" || motivo === "interrupted") return;
      console.warn("[Voz] El navegador rechazó hablar:", motivo, "— el aviso escrito sigue estando.");
    };
    window.setTimeout(() => {
      if (arranco) return;
      console.warn(
        "[Voz] Se pidió hablar y nunca arrancó. Si se repite, el motor de voz de Chrome",
        "quedó trabado: sobrevive a recargar la página y a cambiar de sitio, hay que",
        "cerrar el navegador por completo. Frase:", texto.slice(0, 60),
      );
    }, 2500);

    sintesis.speak(u);
    return true;
  } catch {
    return false;
  }
}
