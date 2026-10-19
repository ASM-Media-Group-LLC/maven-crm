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

export type Decision = "nada" | "unirse-como-host" | "unirse-como-participante";

export function decidirAutoJoin(p: {
  role: string | null;
  code: string | null;
  roomId: string | null;
  membresia: { role: string } | null;
  tieneAsignacion: boolean;
}): Decision {
  const quiereHost = p.role === "host" && !!p.code;
  if (!quiereHost && !p.roomId) return "nada";

  if (p.membresia) {
    const esHost = p.membresia.role === "host";
    // Un host con ?room= en la URL: NO se degrada. El tablero es su vista.
    if (esHost && !quiereHost) return "nada";
    if (quiereHost && esHost) return "nada";
    if (!quiereHost && !esHost) {
      // Participante que ya es miembro: solo hace falta unirse si le falta sala.
      return p.roomId && !p.tieneAsignacion ? "unirse-como-participante" : "nada";
    }
    // Participante que trae código de host: sube a host.
    return "unirse-como-host";
  }
  return quiereHost ? "unirse-como-host" : "unirse-como-participante";
}

/** Qué sala usar al auto-unirse a una sesión. La sala del link (`?room=`) puede
 *  estar VIEJA: te la reenvió alguien, o es de ayer. Si ya tienes una sala en
 *  esta sesión (tu última), ESA manda — el link no te mueve de tu sala. Solo
 *  quien entra por PRIMERA vez (sin historial) usa la sala del link. Arregla el
 *  "entré a mi link y caí en la sala de otro". Para MOVER a alguien a propósito
 *  está el código de 6 caracteres (joinByCode), que sí reasigna. */
export function salaParaAutoUnir(urlRoomId: string | null, ultimaSala: string | null): string | null {
  return ultimaSala ?? urlRoomId;
}
