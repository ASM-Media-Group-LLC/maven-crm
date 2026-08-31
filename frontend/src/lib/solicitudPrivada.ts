// "A esta llamada privada ya la cerré" — que sobreviva a recargar la página.
//
// ── EL BUG QUE ESTO ARREGLA ──────────────────────────────────────────────────
//
// Mientras exista una solicitud de llamada privada en estado `open` o
// `acknowledged`, el chatter es llevado automáticamente a esa sala 1:1. Es
// deliberado: él la pidió y espera ahí.
//
// El problema es cuando la solicitud queda viva y nadie la cierra. Al colgar la
// privada el código intenta resolverla, pero es "best-effort" (`catch {}`), y
// hay caminos donde eso no llega a pasar: cierra la pestaña, se le cae el
// navegador, se va a otra sección, o la supervisora tocó «Atender» y después
// abandonó. Ahí la solicitud queda abierta para siempre.
//
// Y la marca de "ya la descarté" vivía en un `useRef` — o sea, en memoria. Cada
// recarga la borraba, así que el chatter volvía a ser llevado a una sala 1:1
// donde no hay NADIE, mientras la supervisora le hablaba a la sala principal.
// Desde afuera se ve exactamente igual que un problema de audio: "le hablo y no
// me escucha".
//
// Guardarla por pestaña arregla la recaída sin cambiar el flujo: quien la
// descartó sigue teniendo el botón para volver a entrar cuando quiera.
//
// Se usa `sessionStorage` y no `localStorage` a propósito: esto describe lo que
// hizo ESTA persona en ESTA pestaña, no una preferencia que deba viajar.

const CLAVE = "maven.cowork.privadas.descartadas";
/** Tope de ids recordados. Son cadenas cortas y las solicitudes viejas dejan de
 *  importar apenas se resuelven; sin tope, esto crecería para siempre. */
const MAX = 20;

function leer(): string[] {
  try {
    const raw = window.sessionStorage.getItem(CLAVE);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}

function escribir(ids: string[]): void {
  try { window.sessionStorage.setItem(CLAVE, JSON.stringify(ids.slice(-MAX))); }
  catch { /* sin storage: se degrada a lo de antes, no rompe nada */ }
}

/** Marca esta solicitud como descartada por el usuario. */
export function marcarDescartada(id: string | null | undefined): void {
  if (!id) return;
  const ids = leer();
  if (ids.includes(id)) return;
  ids.push(id);
  escribir(ids);
}

/** ¿El usuario ya descartó esta solicitud? Si sí, no hay que volver a meterlo. */
export function fueDescartada(id: string | null | undefined): boolean {
  if (!id) return false;
  return leer().includes(id);
}

/** La solicitud dejó de existir (se resolvió, o el usuario quiere volver a
 *  entrar): se olvida para no ocupar lugar ni bloquear una futura con el mismo
 *  id. */
export function olvidarDescartada(id: string | null | undefined): void {
  if (!id) return;
  const ids = leer().filter((x) => x !== id);
  escribir(ids);
}

/** Solo para tests. */
export function _limpiarDescartadas(): void {
  try { window.sessionStorage.removeItem(CLAVE); } catch { /* noop */ }
}
