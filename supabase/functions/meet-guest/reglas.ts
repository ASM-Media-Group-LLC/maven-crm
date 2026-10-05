// Las REGLAS de la puerta de invitados, puras y sin base ni red, para poderlas
// probar. `index.ts` las aplica.

/** Intentos de golpear (acertados o no) por IP en 10 minutos.
 *
 *  Eran 8. La IP es la pública, y una oficina, un coworking o una universidad
 *  entera comparten una: en una entrevista grupal el noveno candidato recibía
 *  «Demasiados intentos» por intentos que no hizo. Con 20 sigue cortando un
 *  barrido de códigos (un bot prueba miles) sin cortar a un grupo de personas. */
export const MAX_INTENTOS_POR_10MIN = 20;

/** Rechazos a la MISMA persona en una reunión antes de cerrarle la puerta. */
export const MAX_RECHAZOS_POR_REUNION = 2;

/** Una solicitud pendiente más vieja que esto ya no espera a nadie: la persona
 *  cerró la pestaña hace rato. El anfitrión que reutiliza la sala al día
 *  siguiente veía «Pedro quiere entrar» de ayer, lo admitía, y no pasaba nada. */
export const SOLICITUD_VENCE_MS = 2 * 60 * 60 * 1000;

export function solicitudVencida(createdAt: string, ahora: number = Date.now()): boolean {
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return false;
  return ahora - t >= SOLICITUD_VENCE_MS;
}

/** Dos nombres son «la misma persona» si coinciden sin mayúsculas, acentos ni
 *  espacios de más. Los rechazos se cuentan por persona, no por IP: dos
 *  candidatos rechazados desde la misma oficina no deben bloquear al tercero. */
export function mismoNombre(a: string, b: string): boolean {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
  return norm(a) === norm(b);
}

export interface SolicitudParaClaim {
  status: string;
  left_at: string | null;
  created_at: string;
}

export type EstadoDeClaim = "left" | "sin_reunion" | "ended" | "denied" | "vencida" | "pending" | "admitir";

/** Qué se le contesta a un invitado que pregunta «¿ya me admitieron?».
 *
 *  El orden importa: la REUNIÓN se mira antes que el estado de la solicitud.
 *  Antes se contestaba `pending` sin mirar la sala, así que el invitado cuya
 *  reunión terminó mientras esperaba se quedaba con el reloj girando para
 *  siempre (en producción hay una persona que golpeó 20 segundos antes de que
 *  el anfitrión terminara la sala). */
export function estadoDelClaim(
  solicitud: SolicitudParaClaim,
  reunion: { status: string } | null,
  ahora: number = Date.now(),
): EstadoDeClaim {
  if (solicitud.left_at) return "left";
  if (!reunion) return "sin_reunion";
  if (reunion.status !== "active") return "ended";
  if (solicitud.status === "denied") return "denied";
  if (solicitud.status === "pending") return solicitudVencida(solicitud.created_at, ahora) ? "vencida" : "pending";
  return "admitir";
}
