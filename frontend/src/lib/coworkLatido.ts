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
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { ESTADOS_TIEMPO, INTERVALO_LATIDO_MS, type Latido } from "@/lib/coworkTiempoRegla";
import type { RelojCowork } from "@/lib/coworkReloj";

export { INTERVALO_LATIDO_MS };

// ── Lo que el servidor contesta: el reloj de hoy ────────────────────────────
// Cada latido vuelve con `estado` y `segundosHoy`. Se guarda acá y se avisa a
// quien quiera dibujarlo (la pantalla del participante) o publicarlo (presencia,
// para el tablero del supervisor).
let reloj: RelojCowork | null = null;
const oyentes = new Set<(r: RelojCowork | null) => void>();

export function leerReloj(): RelojCowork | null { return reloj; }

export function suscribirReloj(cb: (r: RelojCowork | null) => void): () => void {
  oyentes.add(cb);
  return () => { oyentes.delete(cb); };
}

function fijarReloj(r: RelojCowork | null): void {
  reloj = r;
  for (const cb of oyentes) {
    try { cb(r); } catch { /* un oyente roto no frena a los demás */ }
  }
}

// Sale de la regla, NO se copia a mano: una lista escrita a mano descartaba en
// silencio cualquier estado nuevo, y el cronómetro seguía corriendo en verde en
// la pantalla de la persona mientras el servidor lo tenía detenido.
const ESTADOS = new Set<string>(ESTADOS_TIEMPO);

/** Interpreta la respuesta del servidor. Exportado para probarlo. */
export function relojDeRespuesta(json: unknown, ahora: number): RelojCowork | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  if (typeof j.estado !== "string" || !ESTADOS.has(j.estado)) return null;
  const seg = typeof j.segundosHoy === "number" ? j.segundosHoy : 0;
  return { estado: j.estado as RelojCowork["estado"], segundosHoy: seg, en: ahora };
}

// ── Quién late: un identificador por PESTAÑA ────────────────────────────────
// Con Cowork abierto en dos equipos, los dos latían y se pisaban el único tramo
// abierto de la persona: el tiempo trabajado en uno no sumaba mientras el otro
// siguiera abierto fuera de la sala. Con esto la edge sabe cuál es cuál e ignora
// al que quedó afuera (ver latidoDeEquipoAfuera). En sessionStorage: sobrevive
// al F5 de la misma pestaña y cada pestaña o equipo tiene el suyo.
const CLAVE_EQUIPO = "cowork-equipo";
let equipoEnMemoria: string | null = null;

function nuevoId(): string {
  try { if (typeof crypto?.randomUUID === "function") return crypto.randomUUID(); } catch { /* sin crypto */ }
  return `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Exportado para probarlo. Sin almacenamiento (ventana privada) queda en memoria. */
export function equipoDeEstaPestana(): string {
  if (equipoEnMemoria) return equipoEnMemoria;
  try {
    const guardado = sessionStorage.getItem(CLAVE_EQUIPO);
    if (guardado) { equipoEnMemoria = guardado; return guardado; }
  } catch { /* sin almacenamiento */ }
  const id = nuevoId();
  equipoEnMemoria = id;
  try { sessionStorage.setItem(CLAVE_EQUIPO, id); } catch { /* sin almacenamiento */ }
  return id;
}

/** Un cambio de estado se manda enseguida, con un respiro para juntar los
 *  que llegan en ráfaga (apagar cámara dispara dos o tres eventos). */
export const RESPIRO_CAMBIO_MS = 1_500;

type Intervalo = ReturnType<typeof setInterval>;
type Espera = ReturnType<typeof setTimeout>;

interface Vivo {
  sessionId: string;
  estado: Latido;
  cada: Intervalo;
  pendiente: Espera | null;
  enviando: boolean;
  /** Llegó un cambio mientras había un latido en vuelo: se manda apenas vuelve.
   *  Antes se descartaba y podía tardar hasta el próximo latido (30 s). */
  otraVez: boolean;
}

let vivo: Vivo | null = null;

async function enviar(v: Vivo): Promise<void> {
  // Otra pestaña u otro equipo tomó su lugar en la sala: late ESE, que es el que
  // de verdad está adentro. Si latieran los dos se pisarían el único tramo
  // abierto de la persona.
  if (v.estado.conexionSala === "reemplazada") return;
  if (v.enviando) { v.otraVez = true; return; }
  v.enviando = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/cowork-session`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action: "latido", sessionId: v.sessionId, equipo: equipoDeEstaPestana(), ...v.estado }),
    });
    if (res.ok && vivo === v) {
      const r = relojDeRespuesta(await res.json().catch(() => null), Date.now());
      if (r) fijarReloj(r);
    }
  } catch {
    /* el próximo latido lo vuelve a intentar; un latido perdido no rompe nada */
  } finally {
    v.enviando = false;
    if (v.otraVez && vivo === v) {
      v.otraVez = false;
      void enviar(v);
    }
  }
}

/** Lo que mueve el reloj. Si nada de esto cambió, no hace falta latir antes. */
function afectaAlReloj(a: Latido, b: Latido): boolean {
  return a.camOn !== b.camOn
    || a.screenShareOn !== b.screenShareOn
    || !!a.onBreak !== !!b.onBreak
    || (a.faceState === "no_face") !== (b.faceState === "no_face")
    // Perder la sala y recuperarla: tiene que llegar enseguida, no en 30 s.
    || (a.conexionSala === "desconectada") !== (b.conexionSala === "desconectada");
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
    otraVez: false,
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
  fijarReloj(null);
}

/** Para los tests y para depurar desde la consola. */
export function latidoActivo(): { sessionId: string; estado: Latido } | null {
  return vivo ? { sessionId: vivo.sessionId, estado: { ...vivo.estado } } : null;
}
