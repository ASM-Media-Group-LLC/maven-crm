// LA LISTA DE PARTICIPANTES NO SE REARMA SI NADA CAMBIÓ (17/11/2026).
//
// La llamada rearma la lista de participantes cada 3 s y con cada evento de
// LiveKit (alguien habla, prende la cámara, cambia la calidad…). Antes cada
// rearmado creaba objetos NUEVOS aunque todo siguiera igual, y React redibujaba
// la vista de la llamada entera y lo que cuelga de ella: en Cowork, con 40
// personas, la página se trababa (lo medido en llamada_salud: el motor de React
// era lo que más tiempo ocupaba, minuto a minuto).
//
// Ahora: cada participante que quedó igual conserva su objeto de antes, y si la
// lista entera quedó igual se devuelve la MISMA lista (React no redibuja nada).

type Valor = unknown;

function mismoValor(a: Valor, b: Valor): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  return false;
}

/** Mismo contenido, campo por campo (los arreglos, elemento por elemento). */
export function mismoContenido<T extends object>(a: T, b: T): boolean {
  if (a === b) return true;
  const ka = Object.keys(a) as Array<keyof T>;
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => mismoValor(a[k], b[k]));
}

/**
 * La lista nueva, pero reusando los objetos de `antes` que no cambiaron. Si no
 * cambió nada (mismos participantes, mismo orden, mismo contenido), devuelve
 * `antes` tal cual.
 */
export function participantesEstables<T extends object>(antes: T[], nuevos: T[], clave: (p: T) => string): T[] {
  const porClave = new Map<string, T>();
  for (const p of antes) porClave.set(clave(p), p);
  let cambio = antes.length !== nuevos.length;
  const salida = nuevos.map((p, i) => {
    const viejo = porClave.get(clave(p));
    if (viejo && mismoContenido(viejo, p)) {
      if (antes[i] !== viejo) cambio = true;
      return viejo;
    }
    cambio = true;
    return p;
  });
  return cambio ? salida : antes;
}

/** La clave de un recuadro: la persona y si es su pantalla o su cámara. */
export function claveDeRecuadro(p: { sid: string; esTileDePantalla?: boolean }): string {
  return `${p.sid}|${p.esTileDePantalla ? "pantalla" : "persona"}`;
}
