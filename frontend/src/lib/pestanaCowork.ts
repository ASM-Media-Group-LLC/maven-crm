// UNA sola pestaña por persona dentro de Cowork.
//
// EL BUG (07/09/2026): un chatter con cámara y pantalla compartida recibía
// alertas de "cámara apagada" y "sin compartir pantalla". Tenía Cowork abierto
// en DOS pestañas. La segunda entraba a la misma sala (LiveKit expulsa a la
// primera: misma identidad), publicaba su propio estado —sin cámara, sin
// pantalla— y disparaba los avisos, los del supervisor y los propios. Y con el
// reloj de tiempo trabajado sería peor: los dos latidos se pisarían y el
// tiempo saldría partido.
//
// La solución es que la SEGUNDA pestaña no entre: ve un aviso de que Cowork ya
// está abierto en otra, y puede traerlo acá (la otra suelta la llamada) o
// cerrarse. Se hace con Web Locks: un candado por sesión que solo una pestaña
// del mismo navegador puede tener. Si se roba, la que lo tenía se entera al
// instante y se retira sola. Sin soporte de Web Locks (navegadores viejos) se
// sigue como hasta hoy: todas las pestañas son principales.
export const nombreDelCandado = (sessionId: string) => `maven-cowork-participante:${sessionId}`;

export type EstadoCandado = "principal" | "ocupada" | "sin-soporte";

export interface Candado {
  estado: EstadoCandado;
  /** Suelta el candado (al salir de la sala o al desmontar). */
  soltar: () => void;
  /** Se llama UNA vez si otra pestaña lo roba. */
  alPerder: (cb: () => void) => void;
}

interface LocksMinimos {
  request: (
    name: string,
    options: { ifAvailable?: boolean; steal?: boolean },
    callback: (lock: unknown | null) => Promise<unknown>,
  ) => Promise<unknown>;
}

function locksDisponibles(): LocksMinimos | null {
  const n = (globalThis as { navigator?: { locks?: LocksMinimos } }).navigator;
  return n?.locks && typeof n.locks.request === "function" ? n.locks : null;
}

/** Pide el candado de esta sesión. `robar` = quitárselo a la pestaña que lo tenga. */
export function tomarCandado(sessionId: string, opciones: { robar?: boolean } = {}): Promise<Candado> {
  const locks = locksDisponibles();
  const oyentesPerdida: Array<() => void> = [];
  const alPerder = (cb: () => void) => { oyentesPerdida.push(cb); };
  if (!locks) return Promise.resolve({ estado: "sin-soporte", soltar: () => {}, alPerder });

  return new Promise<Candado>((resolver) => {
    let soltarInterno: () => void = () => {};
    const retenido = new Promise<void>((r) => { soltarInterno = r; });
    let entregado = false;

    const peticion = locks.request(
      nombreDelCandado(sessionId),
      opciones.robar ? { steal: true } : { ifAvailable: true },
      async (lock) => {
        if (!lock) {
          entregado = true;
          resolver({ estado: "ocupada", soltar: () => {}, alPerder });
          return;
        }
        entregado = true;
        resolver({ estado: "principal", soltar: soltarInterno, alPerder });
        // El candado dura lo que dure esta promesa.
        await retenido;
      },
    );
    // Si otra pestaña lo roba, la petición de esta se rechaza con AbortError.
    peticion.catch((e: unknown) => {
      const nombre = (e as { name?: string } | null)?.name;
      if (nombre === "AbortError" && entregado) {
        for (const cb of oyentesPerdida) { try { cb(); } catch { /* nada */ } }
      } else if (!entregado) {
        // Falló pedirlo (raro): mejor dejar entrar que dejar a alguien afuera.
        entregado = true;
        resolver({ estado: "sin-soporte", soltar: () => {}, alPerder });
      }
    });
  });
}
