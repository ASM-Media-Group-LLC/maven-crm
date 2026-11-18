// ── Sala fija por persona (Alvaro, 18/11/2026) ──────────────────────────────
//
// En un Cowork con salas (p. ej. «Plus 1», «Plus 2»…) cada chatter tiene que
// sentarse en LA suya. Antes, al abrir Cowork, el servidor lo metía en su última
// sala o, si era nuevo, en la PRIMERA de la sesión: los nuevos caían todos en la
// sala 0. Y el anfitrión solo podía mover a quien ya estaba conectado.
//
// Ahora cada persona tiene una sala fija por sesión (tabla cowork_sala_fija):
//   · la fija el supervisor desde el tablero («queda fijo en Plus 1»), aunque la
//     persona todavía no esté conectada;
//   · también queda fija la sala del código o del enlace que el supervisor le dio;
//   · al entrar sin sala, el servidor la manda a su fija; si no tiene (o esa sala
//     se cerró) y la sesión tiene varias salas, se le pide el código de su sala.
//
// La tabla llega por migración aplicada a mano y la edge se despliega al fundir:
// todo lo de acá tolera que la tabla todavía no exista (lee null, no escribe).

// deno-lint-ignore no-explicit-any
export type Base = { from(tabla: string): any };

export interface SalaDeLaSesion { id: string; sort_order?: number | null }

/** A qué sala entra quien llega sin pedir una (Alvaro, 18/11/2026):
 *   · su sala fija, si sigue abierta;
 *   · si no tiene y la sesión tiene UNA sola sala, esa (Editores, PR… entran sin
 *     código, como siempre);
 *   · si hay varias salas y no tiene fija: null = NO se le asigna ninguna y se le
 *     pide el código de su sala (como hace una semana). Su «última sala» ya no
 *     cuenta: así nadie cae en la sala de otro.
 *  Solo valen salas que siguen abiertas en esta sesión. */
export function elegirSalaPorDefecto(p: {
  fija: string | null;
  salas: SalaDeLaSesion[];
}): string | null {
  const abiertas = new Set(p.salas.map((s) => s.id));
  if (p.fija && abiertas.has(p.fija)) return p.fija;
  if (p.salas.length === 1) return p.salas[0].id;
  return null;
}

export type DecisionAsignar =
  | "mover"          // está en una sala ahora: se le mueve en vivo y queda fija
  | "solo-fija"      // no está conectado (o aún no es miembro): solo se guarda la fija
  | "es-anfitrion"   // a un anfitrión no se le asigna sala
  | "fuera";         // no es de esta sesión ni de esta agencia

/** Qué hace «asignar sala» del anfitrión según quién es la persona. */
export function decidirAsignarSala(p: {
  rolMiembro: string | null;
  tieneSalaActiva: boolean;
  mismaAgencia: boolean;
}): DecisionAsignar {
  if (p.rolMiembro === "host") return "es-anfitrion";
  if (p.rolMiembro) return p.tieneSalaActiva ? "mover" : "solo-fija";
  return p.mismaAgencia ? "solo-fija" : "fuera";
}

/** La sala fija de alguien en una sesión. Un fallo (o la tabla sin crear) = null:
 *  se sigue con la regla de antes, nunca se deja a nadie sin entrar. */
export async function leerSalaFija(db: Base, sessionId: string, userId: string): Promise<string | null> {
  try {
    const { data, error } = await db.from("cowork_sala_fija")
      .select("room_id").eq("session_id", sessionId).eq("user_id", userId).maybeSingle();
    if (error) {
      console.warn(`[cowork] no se pudo leer la sala fija de ${userId}: ${error.message}`);
      return null;
    }
    return (data?.room_id as string | undefined) ?? null;
  } catch (e) {
    console.warn(`[cowork] no se pudo leer la sala fija de ${userId}: ${(e as Error).message}`);
    return null;
  }
}

/** Guarda (o cambia) la sala fija. Devuelve si quedó guardada. */
export async function guardarSalaFija(
  db: Base,
  f: { sessionId: string; userId: string; roomId: string; por: string },
): Promise<boolean> {
  try {
    const { error } = await db.from("cowork_sala_fija").upsert({
      session_id: f.sessionId, user_id: f.userId, room_id: f.roomId,
      asignado_por: f.por, updated_at: new Date().toISOString(),
    }, { onConflict: "session_id,user_id" });
    if (error) {
      console.warn(`[cowork] no se pudo guardar la sala fija de ${f.userId}: ${error.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[cowork] no se pudo guardar la sala fija de ${f.userId}: ${(e as Error).message}`);
    return false;
  }
}
