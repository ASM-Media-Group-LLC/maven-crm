// La pausa del SUPERVISOR: break, almuerzo o ausente.
//
// Pedido de Jhon (10/09/2026): un botón de tacita en la barra del Supervisor
// Hub con tres estados, y que los chatters vean que su supervisor está en pausa
// —según el estado, con una pantalla como la de sus propias pausas y SIN
// contador—. El tiempo que lleva sí viaja (desde), pero lo ven solo los otros
// supervisores en el tablero: es disponibilidad hacia abajo, tiempo hacia arriba.
// Distinto de la pausa de los chatters (Baño y Break, con tope y reloj).
//
// A nivel de módulo, como la pausa de la persona y las órdenes de pausa: el
// botón vive dentro de la llamada del Hub (que sobrevive a navegar) y el
// tablero publica el estado por presencia; ninguno de los dos conoce al otro.

export type EstadoSupervisor = "break" | "lunch" | "ausente";

export const ESTADOS_SUPERVISOR: ReadonlyArray<{ valor: EstadoSupervisor; etiqueta: string; frase: string }> = [
  { valor: "break", etiqueta: "En break", frase: "está en break" },
  { valor: "lunch", etiqueta: "Lunch", frase: "está en lunch" },
  { valor: "ausente", etiqueta: "Ausente", frase: "está ausente" },
];

export function etiquetaDePausaSupervisor(e: EstadoSupervisor | null | undefined): string | null {
  return ESTADOS_SUPERVISOR.find((x) => x.valor === e)?.etiqueta ?? null;
}

export function fraseDePausaSupervisor(e: EstadoSupervisor | null | undefined): string | null {
  return ESTADOS_SUPERVISOR.find((x) => x.valor === e)?.frase ?? null;
}

export function esEstadoSupervisor(v: unknown): v is EstadoSupervisor {
  return v === "break" || v === "lunch" || v === "ausente";
}

/** El segundo renglón de la pantalla que ve el chatter: qué esperar. */
export function subtituloDePausaSupervisor(e: EstadoSupervisor | null | undefined): string | null {
  switch (e) {
    case "break": return "Vuelve en unos minutos.";
    case "lunch": return "Vuelve después del lunch.";
    case "ausente": return "No está disponible por ahora.";
    default: return null;
  }
}

let actual: EstadoSupervisor | null = null;
// Desde cuándo está en ESTE estado (epoch ms). Viaja por presencia para que los
// otros supervisores vean cuánto lleva; cambiar de break a lunch lo reinicia.
let desde: number | null = null;
const oyentes = new Set<(e: EstadoSupervisor | null) => void>();

export function leerPausaSupervisor(): EstadoSupervisor | null { return actual; }
export function leerDesdePausaSupervisor(): number | null { return desde; }

export function fijarPausaSupervisor(e: EstadoSupervisor | null, ahora: number = Date.now()): void {
  if (e === actual) return;
  actual = e;
  desde = e ? ahora : null;
  for (const cb of oyentes) { try { cb(e); } catch { /* un oyente roto no frena a los demás */ } }
}

export function suscribirPausaSupervisor(cb: (e: EstadoSupervisor | null) => void): () => void {
  oyentes.add(cb);
  return () => { oyentes.delete(cb); };
}

/**
 * Lo que ve un chatter: "Álvaro está en break · Yoselin está almorzando".
 * Solo los supervisores en pausa; sin ninguno, null (no hay banner).
 */
export function fraseDeSupervisoresEnPausa(
  supervisores: Array<{ nombre: string; estado: EstadoSupervisor | null | undefined }>,
): string | null {
  const partes = supervisores
    .filter((s) => esEstadoSupervisor(s.estado))
    .map((s) => `${s.nombre} ${fraseDePausaSupervisor(s.estado)}`);
  return partes.length ? partes.join(" · ") : null;
}
