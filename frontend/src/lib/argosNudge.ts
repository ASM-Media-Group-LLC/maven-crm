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
