import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { estaEnPausa } from "@/lib/coworkPausa";
import type { FaceWatch } from "@/hooks/useFaceWatch";
import {
  AVISAR_COORDINADOR_MS,
  AVISAR_SUPERVISOR_SIN_PANTALLA_MS,
  esProblemaDeEncuadre,
} from "@/hooks/useFaceNudge";

// Dejar constancia de los llamados de atención de Cowork.
//
// Hasta ahora estos avisos se decían por voz, salían en la pantalla del
// supervisor… y se perdían. Al cerrar la pestaña no quedaba nada, así que era
// imposible responder "¿cómo le fue a esta persona esta semana?" con otra cosa
// que el recuerdo de quien estuviera mirando.
//
// ⚠️ ESTO SOLO REGISTRA. Todavía no le resta a la nota de nadie, y esa demora
// es a propósito: hay que ver unas semanas de datos reales antes de castigar
// con ellos. El detector de encuadre ya estuvo roto una semana entera sin que
// nos diéramos cuenta, y estrenar una sanción sobre datos así sería sancionar
// gente por bugs nuestros.
//
// ── LA REGLA QUE MANDA ──────────────────────────────────────────────────────
//
// El defecto que importa acá NO es perder un llamado: es INVENTAR uno. Un
// llamado de más es una acusación falsa que además le baja un número a alguien
// que hizo todo bien. Cada vez que hay duda, se pierde el llamado.
//
// Por eso el reloj se OLVIDA —no se pausa— en cuanto aparece cualquier motivo
// para dudar: una pausa marcada, una desconexión de LiveKit, salir de Cowork.
// Al volver se empieza a contar de cero, y eso significa que los primeros
// minutos después de cada uno de esos eventos nunca se anotan. Es intencional.
//
// ── DE DÓNDE SALE EL RELOJ, Y POR QUÉ NO ES `faceWatch.since` ───────────────
//
// Este hook lleva su PROPIO inicio por categoría, en vez de usar el `since` del
// detector. Dos razones, las dos aprendidas de una revisión que encontró el
// bug:
//
//   · `since` se reinicia cada vez que el detector cambia de sub-estado. Como
//     `no_face` y `too_small` son los dos "encuadre", alguien parado justo en
//     el borde del cuadro hacía parpadear el detector y cada parpadeo abría un
//     llamado nuevo.
//   · Y al revés, `since` SOBREVIVE a una pausa. Alguien que marcaba "Break",
//     dejaba la cámara prendida y se iba media hora, al volver se llevaba —en
//     el primer tic— un llamado de media hora de mal encuadre. Con el reloj
//     propio, salir de la pausa lo pone en cero.
//
// ── LO QUE NO SE ANOTA, Y POR QUÉ ───────────────────────────────────────────
//
// · `unavailable` — el detector no cargó en esa máquina. No es culpa de la
//   persona. Anotarlo sería acusar a alguien de algo que no hizo, y encima le
//   pondría peor nota a quien tiene la computadora más vieja.
// · Con LiveKit desconectado. Al caerse la sala, la lista de participantes
//   queda vacía y la cámara de todo el mundo se ve como apagada aunque esté
//   prendida. Como Supabase vive en otro servidor, los `fetch` seguirían
//   funcionando perfecto: una caída de veinte minutos le anotaba a CADA persona
//   veinte minutos de "cámara apagada".
// · En pausa — quien apretó "Baño" o "Break" avisó que se iba. Reclamarle es
//   castigarlo por haber usado bien el botón. El servidor lo vuelve a
//   verificar contra `cowork_breaks`, porque esta bandera no sobrevive a que la
//   persona recargue la pestaña y la escritura sí es durable.
// · Pasarse del tiempo de break o de baño. Eso NO va acá aunque sea un llamado
//   de atención igual de válido: ya se puede calcular exacto desde
//   `cowork_breaks` + `cowork_break_limits`, del lado del servidor, sin
//   depender de que el navegador de nadie lo reporte.

/** Las cuatro categorías que registra la tabla. */
export type KindLlamado = "camara" | "encuadre" | "luz" | "pantalla";

const DE_ENCUADRE: KindLlamado[] = ["camara", "encuadre", "luz"];

/** De qué se le llama la atención, según lo que vio el detector.
 *
 *  Devuelve null para `ok` y para `unavailable`: el primero no es un problema y
 *  el segundo no es de la persona. */
export function kindDeLlamado(estado: string | null | undefined): KindLlamado | null {
  if (!esProblemaDeEncuadre(estado)) return null;
  if (estado === "cam_off") return "camara";
  if (estado === "too_dark") return "luz";
  return "encuadre";   // no_face y too_small
}

/** Identificador del episodio. Va con cada reescritura para que el servidor
 *  sepa que es el MISMO llamado que se está estirando, sin tener que adivinarlo
 *  comparando dos relojes que nunca coinciden del todo. */
function sortearNonce(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Cada cuánto se reescribe una fila abierta para estirar su duración.
 *
 *  Dos minutos, no uno: en el peor caso realista (sin cámara Y sin compartir)
 *  son dos escrituras cada dos minutos por persona, y con treinta personas ocho
 *  horas eso ya son miles de invocaciones diarias del edge. La precisión que se
 *  pierde son dos minutos sobre la duración de un llamado, que no le cambia
 *  nada a nadie. */
export const REPETIR_REGISTRO_MS = 120_000;

/** Hueco entre dos tics a partir del cual se considera que la máquina durmió y
 *  se olvida todo lo acumulado. Ver el comentario en el tic. */
export const MAX_HUECO_MS = 5 * 60_000;

/** ¿Toca escribir? Sí cuando el problema ya pasó el umbral y no se anotó nunca,
 *  o cuando se anotó hace rato y hay que estirar la duración. */
export function debeRegistrar(
  inicio: number | null | undefined,
  ahora: number,
  umbralMs: number,
  ultimoEnvio: number | null | undefined,
): boolean {
  if (inicio === null || inicio === undefined) return false;
  if (ahora - inicio < umbralMs) return false;
  if (ultimoEnvio === null || ultimoEnvio === undefined) return true;
  return ahora - ultimoEnvio >= REPETIR_REGISTRO_MS;
}

/** Manda el llamado. Se le dice al servidor CUÁNTO DURÓ, no cuándo empezó: el
 *  inicio lo resta él. Una duración es un delta y no le importa en qué hora
 *  crea vivir esta máquina; una fecha absoluta con el reloj desviado se corría
 *  en cada llamada y cada reintento creaba una fila nueva. */
async function anotar(kind: KindLlamado, nonce: string, segundos: number, detail?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    console.warn(`[cowork] sin sesión: no se registró el llamado "${kind}"`);
    return;
  }
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cowork-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action: "registrarLlamado", kind, nonce, detail, seconds: segundos }),
  });
  // Que un fallo GRITE. Este archivo empezó ignorando la respuesta, y ese es
  // exactamente el camino por el que el detector de encuadre estuvo roto una
  // semana entera sin que nadie se enterara: el error existía y nadie lo veía.
  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    console.error(`[cowork] no se pudo registrar el llamado "${kind}" (HTTP ${res.status})`, detalle);
  }
}

interface Args {
  faceWatch: FaceWatch | null;
  /** Si está compartiendo pantalla ahora mismo. */
  compartiendo: boolean;
  /** Solo en Cowork: en un Meet o una videollamada normal no aplica nada de esto. */
  activo: boolean;
  /** Si la sala de LiveKit está realmente conectada. Con la sala caída no se
   *  puede afirmar nada sobre la cámara de nadie. */
  conectado: boolean;
}

export function useRegistrarLlamados({ faceWatch, compartiendo, activo, conectado }: Args) {
  /** Desde cuándo vemos NOSOTROS cada problema. */
  const inicio = useRef<Partial<Record<KindLlamado, number>>>({});
  /** Último envío por categoría, para no reescribir la misma fila cada tic. */
  const ultimoEnvio = useRef<Partial<Record<KindLlamado, number>>>({});
  /** Qué episodio es cada uno, para que el servidor no tenga que adivinarlo. */
  const nonce = useRef<Partial<Record<KindLlamado, string>>>({});
  /** Cuándo corrió el tic anterior. Ver MAX_HUECO_MS. */
  const ultimoTick = useRef(0);
  // Lo último que se vio, leído por el tic. Sin esto habría que reiniciar el
  // intervalo en cada cambio de estado, y el intervalo es justamente lo que
  // mide cuánto lleva así: se reiniciaría para siempre sin llegar al umbral.
  const estado = useRef({ faceWatch, compartiendo, conectado });
  estado.current = { faceWatch, compartiendo, conectado };

  useEffect(() => {
    // Al entrar o salir de Cowork se empieza de cero. Si no, una instancia que
    // se reactivara escribiría un llamado con el reloj viejo.
    inicio.current = {};
    ultimoEnvio.current = {};
    nonce.current = {};
    ultimoTick.current = Date.now();
    if (!activo) return;

    /** Se olvida todo lo acumulado: el próximo problema empieza de cero. */
    const olvidar = (kinds: KindLlamado[]) => {
      for (const k of kinds) {
        delete inicio.current[k]; delete ultimoEnvio.current[k]; delete nonce.current[k];
      }
    };
    const TODOS: KindLlamado[] = [...DE_ENCUADRE, "pantalla"];

    const revisar = (kind: KindLlamado, umbralMs: number, ahora: number, detail?: string) => {
      if (inicio.current[kind] === undefined) {
        inicio.current[kind] = ahora;
        nonce.current[kind] = sortearNonce();
      }
      const desde = inicio.current[kind]!;
      if (!debeRegistrar(desde, ahora, umbralMs, ultimoEnvio.current[kind])) return;
      // Se marca ANTES de esperar la respuesta: si falla, el próximo intento es
      // dentro de dos minutos y no cada quince segundos contra un servidor que
      // ya dijo que no.
      ultimoEnvio.current[kind] = ahora;
      void anotar(kind, nonce.current[kind]!, Math.floor((ahora - desde) / 1000), detail)
        .catch((e) => console.error("[cowork] falló el registro del llamado", e));
    };

    const tick = () => {
      const { faceWatch: fw, compartiendo: comp, conectado: con } = estado.current;
      const ahora = Date.now();

      // ¿Pasó mucho más tiempo del que debería entre dos tics? Entonces la
      // máquina estuvo dormida, y todo ese rato la persona no estaba trabajando
      // —Cowork tampoco estaba corriendo—. Sin esto, cerrar la tapa dos horas y
      // volver a abrirla escribía un llamado de dos horas: el intervalo se
      // reanuda de inmediato, `conectado` todavía es el valor viejo, y el reloj
      // propio venía de antes de dormir.
      //
      // El umbral es de MINUTOS, no de segundos, y eso es a propósito. En una
      // pestaña de fondo el navegador ralentiza los temporizadores, y en Cowork
      // la pestaña de fondo es el caso NORMAL: la gente trabaja en otra ventana.
      // Un umbral fino confundiría "el navegador me frenó" con "la máquina
      // durmió" y no registraría nunca nada. Un hueco de más de cinco minutos ya
      // no es frenado: es suspensión — y si de verdad fuera frenado, LiveKit se
      // habría caído y `conectado` ya sería false.
      const hueco = ahora - ultimoTick.current;
      ultimoTick.current = ahora;
      if (hueco > MAX_HUECO_MS) { olvidar(TODOS); return; }

      // Cualquier motivo para dudar borra el reloj entero, no lo congela.
      if (!con || estaEnPausa()) {
        olvidar(TODOS);
        return;
      }

      // ── Encuadre, cámara y luz ── son excluyentes: solo uno puede estar mal.
      const kind = kindDeLlamado(fw?.state);
      olvidar(DE_ENCUADRE.filter((k) => k !== kind));
      if (kind) revisar(kind, AVISAR_COORDINADOR_MS, ahora, fw?.state);

      // ── Pantalla ── independiente de lo anterior.
      if (comp) olvidar(["pantalla"]);
      else revisar("pantalla", AVISAR_SUPERVISOR_SIN_PANTALLA_MS, ahora);
    };

    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [activo]);
}
