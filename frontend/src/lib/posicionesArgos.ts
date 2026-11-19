// JORNADA POR POSICIÓN (Alvaro, 19/11/2026, preguntas y respuestas):
//   · «Una caja por posición»: las cajas de Argos › Jornada salen de las
//     posiciones nuevas (Ajustes › Posiciones), no de los puestos viejos.
//   · «Solo yo por ahora»: mientras las posiciones sean borrador, solo el dueño
//     las ve así (la tabla del borrador solo la lee el dueño); los demás siguen
//     con los equipos de siempre. Nadie ve a una persona más que antes.
//   · «Salen en gris, sin nota»: quien no tiene Argos —su puesto no pide ni
//     cámara ni pantalla (19/11/2026: Admin, Closer externo, Operations Sales,
//     Freelance)— y quien solo es Admin salen en su caja, pero sin nota y sin
//     bajar el promedio. Lo dice el PUESTO, nunca una marca por persona.
//   · El dueño no sale en Argos (eso lo hace la base: argos_vigilables).
// Lógica pura, para probarla sin base.

export interface PosicionBorrador { id: string; nombre: string; orden: number | null; activa: boolean | null; pide_camara?: boolean | null; pide_pantalla?: boolean | null }
export interface AsignacionBorrador { user_id: string; posicion_id: string }
export interface MarcaBorrador { user_id: string; deshabilitada: boolean | null }

export interface PosicionDe {
  /** La posición que define su caja (la de trabajo, no la de «Admin»). */
  posicion: string;
  orden: number;
  /** Sale en gris, sin nota, y no cuenta en el promedio de la caja. */
  sinNota: boolean;
  /** No sale (deshabilitada o el dueño). */
  oculta: boolean;
}

/** Posiciones que dan acceso, no un trabajo: si alguien tiene otra, su caja es la otra. */
const DE_ACCESO = new Set(["admin", "dueño", "dueno"]);
const esDeAcceso = (nombre: string) => DE_ACCESO.has(nombre.trim().toLowerCase());

export function mapaDePosiciones(
  posiciones: PosicionBorrador[],
  asignaciones: AsignacionBorrador[],
  marcas: MarcaBorrador[],
): Map<string, PosicionDe> {
  const porId = new Map(posiciones.filter((p) => p.activa !== false).map((p) => [p.id, p]));
  const dePersona = new Map<string, PosicionBorrador[]>();
  for (const a of asignaciones) {
    const p = porId.get(a.posicion_id);
    if (!p) continue;
    (dePersona.get(a.user_id) ?? dePersona.set(a.user_id, []).get(a.user_id)!).push(p);
  }
  const marcaDe = new Map(marcas.map((m) => [m.user_id, m]));
  const out = new Map<string, PosicionDe>();
  for (const [userId, lista] of dePersona) {
    const orden = [...lista].sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999));
    const trabajo = orden.find((p) => !esDeAcceso(p.nombre)) ?? orden[0];
    const soloAcceso = esDeAcceso(trabajo.nombre);
    const m = marcaDe.get(userId);
    const esDueno = ["dueño", "dueno"].includes(trabajo.nombre.trim().toLowerCase());
    out.set(userId, {
      posicion: trabajo.nombre,
      orden: trabajo.orden ?? 999,
      // Argos funciona con al menos una (cámara o pantalla); con que uno de sus
      // puestos no pida algo, ese algo no se le pide (19/11/2026).
      sinNota: soloAcceso || !(orden.every((p) => p.pide_camara !== false) || orden.every((p) => p.pide_pantalla !== false)),
      oculta: esDueno || m?.deshabilitada === true,
    });
  }
  return out;
}

/** Pasa la gente de los equipos viejos a su posición. Sin mapa (no es el dueño o
 *  no cargó), devuelve lo mismo: se queda con los equipos de siempre. */
export function aplicarPosiciones<T extends { userId: string; equipo: string; sinNota?: boolean }>(
  personas: T[],
  mapa: Map<string, PosicionDe> | null,
  sinPosicion: string,
): T[] {
  if (!mapa) return personas;
  const out: T[] = [];
  for (const p of personas) {
    const pos = mapa.get(p.userId);
    if (pos?.oculta) continue;
    out.push({ ...p, equipo: pos?.posicion ?? sinPosicion, sinNota: pos?.sinNota === true });
  }
  return out;
}
