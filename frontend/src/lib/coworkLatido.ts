// El reloj de Cowork, del lado del participante (fase 1 del reemplazo de
// Hubstaff): manda a la edge `cowork-session` un latido cada 30 s con el
// estado propio (cámara, pantalla, detector de cara, pausa), y otro apenas
// cambia algo que mueve el reloj. La decisión de si el tiempo cuenta la toma
// el SERVIDOR con ese latido (ver supabase/functions/_shared/cowork-tiempo.ts);
// acá no se calcula nada.
//
// Vive a nivel de módulo, como la presencia: la llamada de Cowork sobrevive a
// que la persona navegue por Maven (la ventanita flotante), así que el latido
// tiene que seguir aunque la pantalla de Cowork se desmonte. Se detiene solo
// cuando la persona SALE de la sala.
import { supabase } from "@/integrations/supabase/client";
import { INTERVALO_LATIDO_MS, type Latido } from "../../../supabase/functions/_shared/cowork-tiempo";

export { INTERVALO_LATIDO_MS };

/** Un cambio de estado se manda enseguida, con un respiro para juntar los
 *  que llegan en ráfaga (apagar cámara dispara dos o tres eventos). */
export const RESPIRO_CAMBIO_MS = 1_500;

interface Vivo {
  sessionId: string;
  estado: Latido;
  cada: ReturnType<typeof setInterval>;
  pendiente: ReturnType<typeof setTimeout> | null;
  enviando: boolean;
}

let vivo: Vivo | null = null;

async function enviar(v: Vivo): Promise<void> {
  if (v.enviando) return;
  v.enviando = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cowork-session`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action: "latido", sessionId: v.sessionId, ...v.estado }),
    });
  } catch {
    /* el próximo latido lo vuelve a intentar; un latido perdido no rompe nada */
  } finally {
    v.enviando = false;
  }
}

/** Lo que mueve el reloj. Si nada de esto cambió, no hace falta latir antes. */
function afectaAlReloj(a: Latido, b: Latido): boolean {
  return a.camOn !== b.camOn
    || a.screenShareOn !== b.screenShareOn
    || !!a.onBreak !== !!b.onBreak
    || (a.faceState === "no_face") !== (b.faceState === "no_face");
}

/** Empieza a latir para esta sesión. Idempotente: si ya late para la misma
 *  sesión no hace nada; si era otra, la reemplaza. */
export function iniciarLatido(sessionId: string, estadoInicial: Latido): void {
  if (vivo?.sessionId === sessionId) return;
  detenerLatido();
  const v: Vivo = {
    sessionId,
    estado: { ...estadoInicial },
    cada: setInterval(() => { void enviar(v); }, INTERVALO_LATIDO_MS),
    pendiente: null,
    enviando: false,
  };
  vivo = v;
  void enviar(v);
}

/** Actualiza el estado propio. Si cambió algo que mueve el reloj, late
 *  enseguida (con respiro); si no, espera al próximo latido periódico. */
export function actualizarLatido(parcial: Partial<Latido>): void {
  const v = vivo;
  if (!v) return;
  const nuevo: Latido = { ...v.estado, ...parcial };
  const cambio = afectaAlReloj(v.estado, nuevo);
  v.estado = nuevo;
  if (!cambio || v.pendiente) return;
  v.pendiente = setTimeout(() => {
    v.pendiente = null;
    void enviar(v);
  }, RESPIRO_CAMBIO_MS);
}

/** Deja de latir. El servidor cierra el segmento abierto con el `leaveRoom`
 *  que manda la misma salida; acá solo se apagan los relojes locales. */
export function detenerLatido(): void {
  if (!vivo) return;
  clearInterval(vivo.cada);
  if (vivo.pendiente) clearTimeout(vivo.pendiente);
  vivo = null;
}

/** Para los tests y para depurar desde la consola. */
export function latidoActivo(): { sessionId: string; estado: Latido } | null {
  return vivo ? { sessionId: vivo.sessionId, estado: { ...vivo.estado } } : null;
}
