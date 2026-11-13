import { supabase } from "@/integrations/supabase/client";

// Registro de "Argos le llamó la atención a la persona" (Alvaro, 09/11, v2).
// Antes esto vivía en un hook aparte con un upsert roto (onConflict no casaba con
// el índice parcial → fallaba en silencio, 0 filas). Ahora lo registra el MISMO
// sistema que de verdad le habla a la persona (useFaceNudge / useScreenShareNudge),
// para que en el expediente se vea CUÁNDO y POR QUÉ Argos le habló, y si corrigió.
//
// Un episodio ABIERTO por (user, tipo): el índice único parcial
// argos_nudges_abierto_por_persona_tipo evita duplicar. El insert del mismo tipo
// mientras hay uno abierto choca y se descarta (el episodio ya quedó registrado);
// al corregirse se cierra, y un problema nuevo abre otra fila.

export const VOZ_ARGOS = "aYbngTsp5kp0sibI3Z0T"; // Javi — la voz de Argos

export type TipoNudge = "camara_apagada" | "fuera_cuadro" | "sin_pantalla";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

/** Del estado del detector de cara al tipo de nudge (null = no es para avisar). */
export function tipoDeEncuadre(state: string | null | undefined): TipoNudge | null {
  if (state === "cam_off") return "camara_apagada";
  if (state === "no_face" || state === "too_small" || state === "too_dark") return "fuera_cuadro";
  return null;
}

/** Abre el episodio (si no hay uno abierto del mismo tipo). No bloquea ni rompe
 *  el aviso: si el insert choca con el índice o falla, se ignora. */
export async function registrarNudge(uid: string, tipo: TipoNudge, mensaje: string, room: string | null): Promise<void> {
  try {
    await sinTipar.from("argos_nudges").insert({
      user_id: uid, tipo, mensaje, room_nombre: room, avisado_at: new Date().toISOString(),
    });
  } catch { /* ya había uno abierto, o falló: el aviso igual sonó */ }
}

/** Cierra el episodio abierto de ese tipo (se corrigió). Idempotente. */
export async function cerrarNudge(uid: string, tipo: TipoNudge): Promise<void> {
  try {
    await sinTipar.from("argos_nudges").update({ cerrado_at: new Date().toISOString() })
      .eq("user_id", uid).eq("tipo", tipo).is("cerrado_at", null);
  } catch { /* ignore */ }
}

// ── Al 3er llamado: «te estoy reportando» (Alvaro, 13/11/2026) ───────────────
// Dentro de Cowork, si la persona no hace caso a 3 llamados seguidos, Argos se lo
// dice y el reporte SALE de verdad a sus jefes (argos_reportarme, que lo vuelve a
// mandar cada 10 min si sigue igual). Las frases son habladas: van en español,
// como las demás de la voz de Argos.

/** Llamado desde el que Argos dice que la reporta (y la reporta). */
export const LLAMADO_DE_REPORTE = 3;

const FRASES_REPORTE: Record<TipoNudge, string[]> = {
  camara_apagada: [
    "Te estoy reportando con tu supervisor: sigues con la cámara apagada. Enciéndela ya o márcate en pausa.",
    "Ya le avisé a tu supervisor. Enciende la cámara ahora.",
  ],
  fuera_cuadro: [
    "Te estoy reportando con tu supervisor: no te veo en la cámara. Ponte frente a la cámara ya.",
    "Ya le avisé a tu supervisor. Vuelve a ponerte frente a la cámara.",
  ],
  sin_pantalla: [
    "Te estoy reportando con tu supervisor: sigues sin compartir pantalla. Compártela ya.",
    "Ya le avisé a tu supervisor. Comparte tu pantalla ahora.",
  ],
};

/** La frase del llamado `n` (desde el 3ro) de este problema. */
export function fraseDeReporte(tipo: TipoNudge, n: number): string {
  const lista = FRASES_REPORTE[tipo];
  return lista[Math.max(0, n - LLAMADO_DE_REPORTE) % lista.length];
}

/** Avisa a sus jefes que no hizo caso. El servidor decide si toca (cada 10 min
 *  como mucho) y a quién; si falla, el llamado igual sonó. */
export async function reportarme(tipo: TipoNudge): Promise<void> {
  try {
    await (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<unknown> })
      .rpc("argos_reportarme", { _tipo: tipo });
  } catch { /* el llamado ya se hizo; el próximo lo vuelve a intentar */ }
}

/** Lo que Argos le dice a quien está FUERA de Cowork en su turno, por llamado
 *  (lo cuenta el servidor, cada 2 min). Desde el 3ro, que la está reportando. */
export function fraseFueraDeCowork(n: number, nuncaEntro: boolean): string {
  if (n >= LLAMADO_DE_REPORTE) {
    return nuncaEntro
      ? "Te estoy reportando con tu supervisor: no has entrado a Cowork. Entra ya."
      : "Te estoy reportando con tu supervisor: sigues fuera de Cowork. Entra ya.";
  }
  if (n === 2) {
    return nuncaEntro
      ? "Sigues sin entrar a Cowork. Entra ya, por favor."
      : "Sigues fuera de Cowork. Vuelve a entrar ya, por favor.";
  }
  return nuncaEntro
    ? "Ya empezó tu turno y no has entrado a Cowork. Entra ahora, con cámara y pantalla."
    : "Estás fuera de Cowork y estás en tu turno. Entra ya, con cámara y pantalla.";
}
