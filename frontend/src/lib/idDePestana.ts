// Un identificador estable POR PESTAÑA.
//
// ── EL BUG QUE ESTO ARREGLA ──────────────────────────────────────────────────
//
// El token del monitor de Cowork usaba la identidad `${userId}__monitor`: única
// por PERSONA, no por pestaña. Si la supervisora tenía el tablero abierto dos
// veces —otra pestaña, la app instalada además del navegador, otra máquina— los
// dos monitores de cada sala chocaban y LiveKit expulsaba a uno.
//
// Y expulsado no significa "se recupera": el efecto que publica su micro está
// guardado por `status !== "ready"`, así que en esa pestaña el micro NO se
// publica nunca más, y apagar y prender el botón tampoco lo recupera. Mientras
// tanto el botón sigue pintado de verde «Hablando», porque su color sale de la
// preferencia local y no del estado real de la publicación. La supervisora
// hablaba convencida de que la escuchaban.
//
// Con un id por pestaña las dos copias dejan de pelearse y el problema
// desaparece de raíz, en vez de intentar detectar la pelea y recuperarse de
// ella.
//
// ── POR QUÉ sessionStorage Y NO OTRA COSA ───────────────────────────────────
//
// Tiene que ser estable mientras la pestaña viva (si cambiara en cada
// reconexión, cada intento entraría como alguien nuevo y dejaría participantes
// fantasma hasta que el servidor los expire) y distinto entre pestañas.
// `sessionStorage` es exactamente eso: por pestaña, sobrevive recargar.
// `localStorage` se comparte entre pestañas — sería el mismo bug.

const CLAVE = "maven.tab.id";

/** Fallback en memoria: si `sessionStorage` no está disponible (modo privado,
 *  cookies bloqueadas) igual queremos un id estable mientras dure el módulo.
 *  Dos pestañas sin storage volverían a colisionar, pero es un caso de borde
 *  muy raro y aun así no es peor que lo que había. */
let enMemoria: string | null = null;

function nuevo(): string {
  try {
    const c = globalThis.crypto;
    if (c?.randomUUID) return c.randomUUID().replace(/-/g, "").slice(0, 12);
    if (c?.getRandomValues) {
      const b = new Uint8Array(6);
      c.getRandomValues(b);
      return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    }
  } catch { /* sin crypto */ }
  // Último recurso. No hace falta que sea imposible de adivinar: solo distinto.
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** El id de ESTA pestaña. Estable mientras la pestaña viva, distinto en otra. */
export function idDePestana(): string {
  try {
    const guardado = window.sessionStorage.getItem(CLAVE);
    if (guardado && /^[a-z0-9]{4,16}$/.test(guardado)) return guardado;
    const id = nuevo();
    window.sessionStorage.setItem(CLAVE, id);
    return id;
  } catch {
    if (!enMemoria) enMemoria = nuevo();
    return enMemoria;
  }
}

/** Solo para tests. */
export function _olvidarIdDePestana(): void {
  enMemoria = null;
  try { window.sessionStorage.removeItem(CLAVE); } catch { /* noop */ }
}
