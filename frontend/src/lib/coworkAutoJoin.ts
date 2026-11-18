// Qué hace la página de Cowork con los parámetros de la URL cuando ya sabe si
// la persona es miembro y con qué rol.
//
// EL BUG (07/09/2026): un HOST canjeó un código de sala. La vista lo mandó a
// `/cowork?session=…&room=…`, y el auto-join de esa URL llamó a joinSession
// como PARTICIPANTE; la edge vio "rol distinto" y le bajó la membresía de host
// a participante. Perdió el tablero del supervisor. Le pasó a Jhon, y la base
// muestra al creador de otra sesión también degradado por el mismo camino.
//
// Regla: un host nunca se auto-une como participante. A las salas entra desde
// el tablero, sin cambiar de rol.

//
// SALA FIJA (Alvaro, 18/11/2026): el enlace con `?room=` que da el supervisor
// MUEVE al participante aunque ya tenga sala (antes se ignoraba si ya tenía una)
// y lo deja fijo ahí. Para eso hace falta saber en qué sala está (`salaActual`):
// si ya está en la del enlace, no hay nada que hacer.

export type Decision = "nada" | "unirse-como-host" | "unirse-como-participante" | "mover-de-sala";

export function decidirAutoJoin(p: {
  role: string | null;
  code: string | null;
  roomId: string | null;
  membresia: { role: string } | null;
  tieneAsignacion: boolean;
  /** La sala en la que está ahora (su asignación activa). */
  salaActual?: string | null;
}): Decision {
  const quiereHost = p.role === "host" && !!p.code;
  if (!quiereHost && !p.roomId) return "nada";

  if (p.membresia) {
    const esHost = p.membresia.role === "host";
    // Un host con ?room= en la URL: NO se degrada. El tablero es su vista.
    if (esHost && !quiereHost) return "nada";
    if (quiereHost && esHost) return "nada";
    if (!quiereHost && !esHost) {
      // Participante que ya es miembro: sin sala, se une a la del enlace; con
      // otra sala, el enlace del supervisor lo mueve; en la misma, nada.
      if (!p.roomId) return "nada";
      if (!p.tieneAsignacion) return "unirse-como-participante";
      return p.salaActual && p.salaActual !== p.roomId ? "mover-de-sala" : "nada";
    }
    // Participante que trae código de host: sube a host.
    return "unirse-como-host";
  }
  return quiereHost ? "unirse-como-host" : "unirse-como-participante";
}

/** Qué sala usar al auto-unirse por un link. El link (`?room=`) es la orden del
 *  coordinador: es LA sala a la que quiere mandar a la persona, así que MANDA.
 *  `ultimaSala` solo entra si el link no trae sala (reabrir desde la lista de
 *  sesiones o el ícono del PWA), para reanudar donde estabas.
 *
 *  EL BUG (19/10/2026): antes era al revés — "tu última sala" pisaba el link. Y
 *  como getMyLastRoomId devuelve hasta asignaciones INACTIVAS, una sala vieja se
 *  volvía un fantasma eterno: Grace solo había estado en COORDINADORES, así que
 *  cada link de Chatters la devolvía a Coordinadores y no había forma de salir
 *  (entrar de incógnito sí mostraba la sala real; entrar normal, no). Para MOVER
 *  a propósito sigue estando el código de 6 caracteres (joinByCode). */
export function salaParaAutoUnir(urlRoomId: string | null, ultimaSala: string | null): string | null {
  return urlRoomId ?? ultimaSala;
}

/**
 * ¿El enlace (`?session=`) NO es el Cowork de esta persona y hay que mandarla al
 * suyo? (14/11/2026). Desde que hay un Cowork por departamento, una pestaña con el
 * enlace de antes dejaba a la persona en «Unirse» sin entrar nunca a su sala.
 *
 * Solo para quien trabaja en UN Cowork (no ve todas las sesiones) y solo con datos
 * ciertos: la sesión no es visible para ella (0 filas, no un fallo de red), ya se
 * cerró, o está activa pero ella no es miembro (membresías leídas bien). Mientras
 * carga, con un enlace con código o rol (los que canjea un coordinador), nunca.
 */
export function debeIrAlSuyo(p: {
  sessionId: string | null;
  veTodasLasSesiones: boolean;
  cargando: boolean;
  sesionNoVisible: boolean;
  estado: string | null;
  membresiasCargadas: boolean;
  tieneMembresia: boolean;
  conCodigo: boolean;
}): boolean {
  if (!p.sessionId || p.veTodasLasSesiones || p.cargando || p.conCodigo) return false;
  if (p.sesionNoVisible) return true;
  if (p.estado === "ended") return true;
  return p.estado === "active" && p.membresiasCargadas && !p.tieneMembresia;
}
