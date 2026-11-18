// VERSIÓN NUEVA: CARTEL EN EL CENTRO CON «ACTUALIZAR» (Alvaro, 18/11/2026).
// Ya no se recarga sola en silencio: la gente no entendía qué pasaba y, si no
// podía recargar, el avisito de abajo no se veía. Ahora, sin llamada y sin estar
// escribiendo, sale el cartel del centro (components/CartelVersionNueva.tsx) y la
// persona toca «Actualizar». Lo de abajo sigue valiendo para la espera.
//
// Antes (17/11/2026): MAVEN SE ACTUALIZA SOLO, PERO NUNCA EN UNA LLAMADA.
//
// Cada deploy deja a la gente con la versión vieja hasta que recarga, y los
// arreglos (los de caídas incluidos) no les llegan. Recargar sola en cualquier
// momento era peor: el 11/11 se vio que el service worker recargaba la pestaña
// con la llamada andando y la cortaba (PR #41, registroDelSw.ts). Ahora:
//
//  • Hay versión nueva y la persona NO está en una llamada → Maven se recarga
//    solo y toma la versión nueva.
//  • Está en una llamada → aviso sin botón («se actualiza cuando termines») y
//    espera. En cuanto cuelga, se recarga sola.
//  • Está escribiendo algo (el cursor en un campo, un mensaje a medio escribir,
//    un formulario tocado) → espera a que termine: recargar se lo borraría.
//  • Una vez por versión: si ya recargó desde ESTE build y sigue en él (el
//    servidor todavía no sirve el nuevo), no vuelve a recargar; deja el aviso de
//    siempre con su botón. Así no hay bucle.

export const MIRAR_CADA_MS = 5_000;
/** sessionStorage: el build desde el que se recargó por última vez en esta pestaña. */
export const CLAVE_RECARGA = "maven.recarga-por-version";

export interface AlmacenMinimo {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/** ¿Esta pestaña ya recargó desde este mismo build? (y por eso sigue en él). */
export function yaRecargoDesde(almacen: AlmacenMinimo | null, build: string): boolean {
  try { return almacen?.getItem(CLAVE_RECARGA) === build; } catch { return false; }
}

/** Anota que se va a recargar desde este build. Sin almacén se anota igual en
 *  memoria de la página: no hay bucle dentro de una misma carga. */
export function marcarRecarga(almacen: AlmacenMinimo | null, build: string): void {
  try { almacen?.setItem(CLAVE_RECARGA, build); } catch { /* sin storage */ }
}

const TIPOS_DE_TEXTO = new Set(["", "text", "email", "number", "tel", "url", "password", "date", "datetime-local", "time", "month", "week"]);

function esCampoDeTexto(el: Element): el is HTMLInputElement {
  return el.tagName === "INPUT" && TIPOS_DE_TEXTO.has(((el as HTMLInputElement).type || "").toLowerCase());
}

function seVe(el: Element): boolean {
  try { return el.getClientRects().length > 0; } catch { return false; }
}

/**
 * ¿Hay algo a medio escribir que una recarga borraría? No hay forma perfecta de
 * saberlo; estas tres señales cubren lo común:
 *  1. El cursor está en un campo de texto (está escribiendo ahora).
 *  2. Un área de texto o un editor visible con texto (un mensaje sin mandar).
 *  3. Un campo visible de un formulario o de un diálogo con algo distinto de lo
 *     que traía (un formulario tocado). Los buscadores (type="search") no cuentan.
 */
export function hayAlgoAMedioEscribir(doc: Document = document): boolean {
  const activo = doc.activeElement;
  if (activo && (activo.tagName === "TEXTAREA" || esCampoDeTexto(activo) || (activo as HTMLElement).isContentEditable)) return true;
  for (const t of Array.from(doc.querySelectorAll("textarea"))) {
    if (t.value.trim() && seVe(t)) return true;
  }
  for (const e of Array.from(doc.querySelectorAll('[contenteditable=""], [contenteditable="true"]'))) {
    if ((e.textContent ?? "").trim() && seVe(e)) return true;
  }
  for (const i of Array.from(doc.querySelectorAll("form input, [role='dialog'] input"))) {
    if (esCampoDeTexto(i) && i.value !== i.defaultValue && seVe(i)) return true;
  }
  return false;
}

/** ¿Está escribiendo AHORA (el cursor en un campo)? El cartel espera solo a
 *  esto: un borrador olvidado en un chat no puede tapar la versión nueva. */
export function estaEscribiendoAhora(doc: Document = document): boolean {
  const activo = doc.activeElement;
  return !!activo && (activo.tagName === "TEXTAREA" || esCampoDeTexto(activo) || (activo as HTMLElement).isContentEditable);
}

export interface OpcionesDeLaRecarga {
  /** ¿Hay una llamada conectada (o entrando) en esta pestaña? */
  enLlamada: () => boolean;
  /** ¿Hay algo a medio escribir? (hayAlgoAMedioEscribir) */
  aMedioEscribir: () => boolean;
  /** Pasa a la versión nueva y recarga. Devuelve false si a último momento no
   *  pudo (entró a una llamada): se sigue esperando. Ver forzarActualizacion. */
  pasarALaNueva: () => Promise<boolean>;
  /** El aviso con llamada: «se actualiza cuando termines», SIN botón. */
  mostrarEnLlamada: () => void;
  /** El aviso de siempre, con «Recargar»: cuando ya recargó desde este build. */
  mostrarNormal: () => void;
  /** El cartel del centro con «Actualizar» (18/11/2026). Si no se pasa, se
   *  recarga sola como antes. */
  mostrarCartel?: () => void;
  almacen: AlmacenMinimo | null;
  build: string;
  cadaMs?: number;
  programar?: (fn: () => void, ms: number) => number;
  cancelar?: (id: number) => void;
}

/** Devuelve `pedir()`: hay una versión nueva. Idempotente. */
export function crearRecargaAlColgar(o: OpcionesDeLaRecarga): () => void {
  const cada = o.cadaMs ?? MIRAR_CADA_MS;
  const programar = o.programar ?? ((fn, ms) => window.setInterval(fn, ms));
  const cancelar = o.cancelar ?? ((id) => window.clearInterval(id));
  let mirando: number | null = null;
  let enCurso = false;
  let rendida = false;
  let avisadoEnLlamada = false;

  const parar = () => { if (mirando !== null) { cancelar(mirando); mirando = null; } };
  const ocupada = () => o.enLlamada() || o.aMedioEscribir();

  const intentar = async (): Promise<void> => {
    if (enCurso || rendida) return;
    if (o.enLlamada() && !avisadoEnLlamada) { avisadoEnLlamada = true; o.mostrarEnLlamada(); }
    if (ocupada()) return; // se vuelve a mirar en el próximo toque
    parar();
    if (yaRecargoDesde(o.almacen, o.build)) {
      // Ya recargó desde este build y sigue en él: otra recarga no sirve y sería
      // un bucle. Queda el aviso de siempre, con su botón.
      rendida = true;
      o.mostrarNormal();
      return;
    }
    if (o.mostrarCartel) {
      // El botón del cartel hace la recarga; ya no hay nada que vigilar aquí.
      rendida = true;
      o.mostrarCartel();
      return;
    }
    enCurso = true;
    let recargo = false;
    try { recargo = await o.pasarALaNueva(); } catch { recargo = false; }
    enCurso = false;
    if (!recargo) empezar();
  };

  const empezar = () => {
    if (mirando !== null || rendida) return;
    mirando = programar(() => { void intentar(); }, cada);
  };

  return () => {
    if (rendida) { if (!o.mostrarCartel || yaRecargoDesde(o.almacen, o.build)) o.mostrarNormal(); return; }
    void intentar();
    if (!enCurso) empezar();
  };
}
