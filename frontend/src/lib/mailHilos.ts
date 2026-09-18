// Agrupar los correos de una carpeta en CONVERSACIONES.
//
// Lo reportó Keila: «los hilos se muestran como correos aparte, eso necesita
// orden sino que caos va a ser funcionar por ahí». Hoy el comunicado, la
// respuesta y la contrarespuesta son tres renglones sueltos sin relación
// visible; con veinte respuestas la bandeja deja de leerse.
//
// Vive suelto —sin React— porque acá está toda la sutileza: dos correos que se
// unen mal esconden uno adentro de otro, y eso se parece demasiado a perder
// correo.

/** Lo mínimo que hace falta de un correo para encadenarlo. */
export interface CorreoEncadenable {
  messageId?: string | null;
  /** `In-Reply-To`. Puede faltar: los correos anteriores al 18/09/2026 no lo
   *  tienen guardado. */
  inReplyTo?: string | null;
  /** `References`, del más viejo al más nuevo. Ídem. */
  references?: string[] | null;
  subject: string;
  from: string;
  to?: string;
  cc?: string;
  date: string;
}

/** Saca los prefijos de respuesta y reenvío para comparar asuntos.
 *
 *  Se quitan en cadena porque en la vida real se apilan entre clientes:
 *  «Re: RV: Fwd: Re: Contrato» y «Contrato» son el mismo hilo. Se cubren los
 *  del español (RE:, RV:) y los del inglés (RE:, FW:, FWD:), que es lo que
 *  mezclan Zoho, Gmail y Outlook en la misma empresa. */
export function sinPrefijos(asunto: string): string {
  let s = (asunto ?? "").trim();
  // El `[...]` cubre el «Re[2]:» de algunos clientes viejos.
  const prefijo = /^\s*(re|rv|fw|fwd)\s*(\[\d+\])?\s*:\s*/i;
  for (let i = 0; i < 12 && prefijo.test(s); i++) s = s.replace(prefijo, "");
  return s.trim();
}

export function asuntoNormalizado(asunto: string): string {
  return sinPrefijos(asunto).toLowerCase().replace(/\s+/g, " ");
}

/** Las direcciones que aparecen en un correo, en minúscula. */
function participantes(c: CorreoEncadenable): Set<string> {
  const crudo = `${c.from ?? ""} ${c.to ?? ""} ${c.cc ?? ""}`.toLowerCase();
  return new Set(crudo.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? []);
}

function seCruzan(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

/** ⚠️ Un asunto que NO alcanza para unir por sí solo.
 *
 *  Sin esto, todos los «(sin asunto)» de la bandeja —y todos los «hola», y
 *  todos los «buenos días»— se fundirían en UN hilo gigante que se traga
 *  correos de gente que no tiene nada que ver. Unir de más se ve igual que
 *  perder correo, y es peor que no unir. */
function asuntoDemasiadoPobre(norm: string): boolean {
  return norm.length < 4 || norm === "(sin asunto)" || norm === "sin asunto";
}

/** Cuánto puede separar a dos correos para seguir considerándolos el mismo
 *  hilo cuando SOLO los une el asunto. Dos «Reporte semanal» con ocho meses de
 *  distancia no son una conversación, son una costumbre. */
const VENTANA_POR_ASUNTO_MS = 30 * 24 * 3600_000;

class Union {
  private padre = new Map<number, number>();
  raiz(x: number): number {
    let r = this.padre.get(x) ?? x;
    if (r === x) return x;
    r = this.raiz(r);
    this.padre.set(x, r);
    return r;
  }
  unir(a: number, b: number): void {
    const ra = this.raiz(a), rb = this.raiz(b);
    if (ra !== rb) this.padre.set(ra, rb);
  }
}

export interface Hilo<T> {
  /** Con qué nombre se muestra la conversación en la lista.
   *
   *  ⚠️ Es el asunto del más viejo SIN los prefijos, y no el asunto tal cual
   *  del primero, porque `mensajes[0]` es el más viejo CARGADO y no
   *  necesariamente la raíz: la bandeja trae 50 correos y el que arrancó el
   *  hilo puede haber quedado afuera. Pasó con «Hojas de vida Chatters», donde
   *  el más viejo de la ventana era un «RE: RV: …» — y el hilo se habría
   *  llamado así. */
  asunto: string;
  /** Los mensajes, del más VIEJO al más nuevo. */
  mensajes: T[];
  /** El que representa al hilo en la lista: el más reciente. */
  ultimo: T;
  /** Cuántos son. 1 = no es una conversación, es un correo suelto. */
  cantidad: number;
}

/**
 * Agrupa en conversaciones.
 *
 * Dos caminos, y el orden importa:
 *
 *  1. **Por cabeceras** (`In-Reply-To` / `References`) — es el mecanismo real
 *     de RFC 5322 y es exacto: no depende de que nadie haya tocado el asunto.
 *  2. **Por asunto + participantes**, solo para los que NO traen cabeceras.
 *     Es lo que hacía Gmail antes, y acá hace falta porque los correos ya
 *     guardados no las tienen: sin esto, la bandeja entera seguiría suelta
 *     hasta que pase un resincronizado completo.
 *
 * El segundo camino pide TRES cosas a la vez —mismo asunto normalizado, al
 * menos una dirección en común, y menos de 30 días de distancia— porque
 * cualquiera de ellas sola une de más.
 */
export function agruparEnHilos<T extends CorreoEncadenable>(correos: T[]): Hilo<T>[] {
  const n = correos.length;
  const u = new Union();

  // ── 1. Por cabeceras ──────────────────────────────────────────────────
  const porMessageId = new Map<string, number>();
  correos.forEach((c, i) => {
    if (c.messageId) porMessageId.set(c.messageId, i);
  });
  correos.forEach((c, i) => {
    const enlaces = [c.inReplyTo, ...(c.references ?? [])].filter(Boolean) as string[];
    for (const ref of enlaces) {
      const j = porMessageId.get(ref);
      if (j !== undefined) u.unir(i, j);
    }
  });

  // ── 2. Por asunto, solo para los huérfanos ────────────────────────────
  // "Huérfano" = no trae cabeceras. Un correo que SÍ las trae ya quedó donde
  // corresponde, y unirlo además por asunto solo podría meterlo en un hilo
  // ajeno que casualmente se llama igual.
  const sinCabeceras = (c: T) => !c.inReplyTo && !(c.references ?? []).length;
  const porAsunto = new Map<string, number[]>();
  correos.forEach((c, i) => {
    if (!sinCabeceras(c)) return;
    const norm = asuntoNormalizado(c.subject);
    if (asuntoDemasiadoPobre(norm)) return;
    const ya = porAsunto.get(norm);
    if (ya) ya.push(i);
    else porAsunto.set(norm, [i]);
  });

  for (const indices of porAsunto.values()) {
    if (indices.length < 2) continue;
    const gente = indices.map((i) => participantes(correos[i]));
    const cuando = indices.map((i) => Date.parse(correos[i].date) || 0);
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        if (!seCruzan(gente[a], gente[b])) continue;
        if (Math.abs(cuando[a] - cuando[b]) > VENTANA_POR_ASUNTO_MS) continue;
        u.unir(indices[a], indices[b]);
      }
    }
  }

  // ── Armar los hilos ───────────────────────────────────────────────────
  const porRaiz = new Map<number, T[]>();
  for (let i = 0; i < n; i++) {
    const r = u.raiz(i);
    const ya = porRaiz.get(r);
    if (ya) ya.push(correos[i]);
    else porRaiz.set(r, [correos[i]]);
  }

  const hilos: Hilo<T>[] = [];
  for (const mensajes of porRaiz.values()) {
    mensajes.sort((a, b) => (Date.parse(a.date) || 0) - (Date.parse(b.date) || 0));
    hilos.push({
      asunto: sinPrefijos(mensajes[0].subject) || mensajes[0].subject,
      mensajes,
      ultimo: mensajes[mensajes.length - 1],
      cantidad: mensajes.length,
    });
  }
  // La bandeja se ordena por lo más nuevo de cada conversación, no por cuándo
  // empezó: un hilo de marzo con una respuesta de hoy va arriba.
  hilos.sort((a, b) => (Date.parse(b.ultimo.date) || 0) - (Date.parse(a.ultimo.date) || 0));
  return hilos;
}
