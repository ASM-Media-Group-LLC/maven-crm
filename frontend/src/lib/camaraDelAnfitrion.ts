// LA CÁMARA DEL ANFITRIÓN DE COWORK, CON SU FONDO (18/11/2026).
//
// Alvaro no podía difuminar el fondo en Cowork desde la app de computador. El
// motor del desenfoque andaba (probado dentro de la app firmada con
// harness.html?ver=fondo: 132 cuadros procesados). El hueco era el camino: el
// tablero del anfitrión toma la cámara CRUDA con getUserMedia y cada sala
// publica un clon (CoworkRoomMonitor). Por ahí no pasaba ningún procesador, y
// el desenfoque de las llamadas vive en useLiveKit, que el tablero no usa.
//
// Este módulo envuelve esa cámara cruda: le engancha el MISMO procesador de las
// llamadas (lib/fondoFino) cuando el anfitrión tiene un fondo elegido, y dice
// qué pista hay que repartir a las salas. Las reglas:
//
//   · El fondo es la MISMA preferencia de las llamadas (leerFondoGuardado): si
//     eligió difuminar en una llamada, Cowork lo respeta, y al revés.
//   · NUNCA sin cámara por culpa del fondo. Si el navegador no puede, si el
//     enganche falla o tarda más del tope, o si el procesador se cae con la
//     cámara al aire, la salida vuelve a ser la cámara cruda (quien llama avisa).
//   · Cambiar el fondo con la cámara al aire no corta las salas: el procesador
//     se engancha UNA vez y después solo cambia de modo (switchTo). Quitar el
//     fondo lo deja en "disabled", que deja pasar los cuadros tal cual (cero
//     costo), así la pista repartida sigue siendo la misma y nadie re-publica.
//   · destruir() limpia todo: el procesador, la pista procesada y la cruda.
//
// No importa React: el tablero lo usa desde sus efectos y la guarda
// (test/cowork/camaraDelAnfitrionConFondo.test.ts) lo prueba sin montar la página.

import { LocalVideoTrack } from "livekit-client";
import {
  ProcesadorDeFondo,
  fondoPrecalentado,
  precalentarFondo,
  soportaProcesadorDeFondo,
  topeParaPonerFondo,
  type OpcionesDeCambio,
  type ProcesadorFondoFino,
} from "@/lib/fondoFino/procesador";
import {
  cadaCuantosCuadrosSegmentar,
  esBlur,
  radioDeBlur,
  resolverImagenDeFondo,
  type BackgroundEffect,
  type ImagenDeFondo,
} from "@/lib/fondoDeLlamada";

/** Tope para enganchar el procesador (el mismo de useLiveKit). La primera vez
 *  se estira solo con `topeParaPonerFondo` mientras baja el detector. */
export const TOPE_ENGANCHE_MS = 6_000;
/** Tope para cambiar de modo o resolver una imagen (el mismo de useLiveKit). */
export const TOPE_CAMBIO_MS = 8_000;
/** La cámara del anfitrión va capada a 15 cuadros (un encoder POR SALA). */
export const CUADROS_POR_SEGUNDO = 15;
/** Cada cuánto se mira si la pista procesada sigue viva. */
const VIGILANCIA_MS = 5_000;

export type ResultadoDelFondo =
  /** El fondo pedido ya está en la salida. */
  | "puesto"
  /** Se pidió "none": la salida va sin efecto. */
  | "sin-fondo"
  /** Este navegador no puede poner fondos: sale la cámara cruda. */
  | "no-soportado"
  /** La imagen elegida ya no existe: sale sin fondo. */
  | "imagen-perdida"
  /** No se pudo enganchar o cambiar el procesador: sale sin fondo. */
  | "fallo"
  /** Llegó otro pedido antes de empezar este: vale el último. */
  | "reemplazado"
  /** La cámara se apagó mientras tanto. */
  | "apagada";

export interface AvisosDelFondo {
  /** Va a bajar el detector por primera vez (~9,4 MB): «Preparando el fondo…». */
  alPrimeraCarga?: () => void;
  /** El procesador se cayó con la cámara al aire: la salida volvió a la cruda. */
  alCaerse?: () => void;
  /** Un cuadro salió procesado (para el banco de pruebas). */
  alProcesarCuadro?: () => void;
}

export interface CamaraDelAnfitrion {
  /** La pista que se reparte a las salas: la procesada si hay procesador; si no, la cruda. */
  salida(): MediaStreamTrack;
  /** ¿Hay un procesador enganchado ahora? */
  conProcesador(): boolean;
  /** Pone (o quita) el fondo. No lanza: el resultado dice qué pasó. */
  aplicar(efecto: BackgroundEffect): Promise<ResultadoDelFondo>;
  /** Apaga todo: procesador, pista procesada y cámara cruda. */
  destruir(): Promise<void>;
}

function conTope<T>(tarea: Promise<T>, ms: number, etiqueta: string): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    tarea,
    new Promise<T>((_, rechazar) => {
      reloj = setTimeout(() => rechazar(new Error(`${etiqueta}-timeout`)), ms);
    }),
  ]).finally(() => {
    if (reloj) clearTimeout(reloj);
  });
}

/** El modo del procesador para un fondo, o por qué no se puede. */
async function modoDelEfecto(
  efecto: BackgroundEffect,
): Promise<OpcionesDeCambio | "imagen-perdida" | "fallo"> {
  if (esBlur(efecto)) return { mode: "background-blur", blurRadius: radioDeBlur(efecto) };
  const imagen = await conTope(
    resolverImagenDeFondo(efecto, window.location.origin),
    TOPE_CAMBIO_MS,
    "fondo-imagen",
  ).catch((): ImagenDeFondo => ({ falta: false }));
  if ("url" in imagen) return { mode: "virtual-background", imagePath: imagen.url };
  // `falta` = la imagen ya no existe; si no, no se pudo leer (no se toca lo guardado).
  return imagen.falta ? "imagen-perdida" : "fallo";
}

/** Suelta un procesador que no se va a usar (enganche fallido, tardío o cámara apagada). */
async function descartar(pista: LocalVideoTrack, procesador: ProcesadorFondoFino) {
  try { procesador.processedTrack?.stop(); } catch { /* ya parada */ }
  // stopProcessor espera el candado de la pista: con tope, por si el enganche sigue colgado.
  try { await conTope(pista.stopProcessor(false), 2_000, "fondo-soltar"); } catch { /* sigue abajo */ }
  try { await procesador.destroy(); } catch { /* ya destruido */ }
  // Si el enganche murió a mitad de camino, el envoltorio no llegó a "running"
  // y su destroy() no hace nada: el contexto WebGL y el detector se cierran acá.
  try { await procesador.transformer?.destroy(); } catch { /* ya cerrado */ }
  try { procesador.trackGenerator?.stop(); } catch { /* no había */ }
}

/**
 * Envuelve la cámara cruda del anfitrión. Arranca SIN procesador: la salida es
 * la cruda hasta que `aplicar` pida un fondo.
 */
export function crearCamaraDelAnfitrion(
  cruda: MediaStreamTrack,
  avisos: AvisosDelFondo = {},
): CamaraDelAnfitrion {
  let viva = true;
  let pista: LocalVideoTrack | null = null;
  let procesador: ProcesadorFondoFino | null = null;
  let procesada: MediaStreamTrack | null = null;
  let vigilante: ReturnType<typeof setInterval> | null = null;
  // Los pedidos van en fila y solo se hace el ÚLTIMO: tocar el botón tres veces
  // seguidas no engancha tres procesadores.
  let pedidos = 0;
  let fila: Promise<unknown> = Promise.resolve();

  const encolar = <T>(tarea: () => Promise<T>): Promise<T> => {
    const op = fila.then(tarea);
    fila = op.catch(() => undefined);
    return op;
  };

  const dejarDeVigilar = () => {
    if (vigilante !== null) clearInterval(vigilante);
    vigilante = null;
  };

  /** Vuelve a la cámara cruda (que sigue viva) soltando el procesador. */
  const soltar = async () => {
    dejarDeVigilar();
    const lk = pista;
    const p = procesador;
    pista = null;
    procesador = null;
    procesada = null;
    if (lk && p) await descartar(lk, p);
  };

  // El envoltorio del procesador, si el caño se rompe, se destruye solo y para
  // la pista generada SIN disparar `ended` (lo hace el código, no el
  // dispositivo). Mirar `readyState` cada tanto es lo único que lo detecta; sin
  // esto las salas se quedaban con un clon muerto y el botón en verde.
  const vigilar = () => {
    dejarDeVigilar();
    vigilante = setInterval(() => {
      if (!viva || !procesada) return;
      if (procesada.readyState !== "ended" || cruda.readyState !== "live") return;
      dejarDeVigilar();
      encolar(async () => {
        if (!viva || !procesada || procesada.readyState !== "ended") return;
        await soltar();
        if (viva) avisos.alCaerse?.();
      });
    }, VIGILANCIA_MS);
  };

  const hacer = async (efecto: BackgroundEffect): Promise<ResultadoDelFondo> => {
    if (!viva) return "apagada";

    if (!efecto || efecto === "none") {
      if (!procesador) return "sin-fondo";
      try {
        // "disabled" deja pasar los cuadros: la pista repartida no cambia.
        await conTope(procesador.switchTo({ mode: "disabled" }), TOPE_CAMBIO_MS, "fondo-quitar");
      } catch (e) {
        console.warn("[cowork] fondo: no se pudo quitar, se suelta el procesador:", e);
        await soltar();
      }
      return "sin-fondo";
    }

    if (!soportaProcesadorDeFondo()) return "no-soportado";

    const modo = await modoDelEfecto(efecto);
    if (!viva) return "apagada";
    if (modo === "imagen-perdida" || modo === "fallo") {
      // Que no siga saliendo un fondo VIEJO distinto del que se pidió.
      if (procesador) {
        await conTope(procesador.switchTo({ mode: "disabled" }), TOPE_CAMBIO_MS, "fondo-quitar")
          .catch(() => soltar());
      }
      return modo;
    }

    // Ya enganchado: solo se cambia de modo, sin cortar las salas.
    if (procesador) {
      try {
        await conTope(procesador.switchTo(modo), TOPE_CAMBIO_MS, "fondo-cambiar");
        return viva ? "puesto" : "apagada";
      } catch (e) {
        console.warn("[cowork] fondo: no se pudo cambiar, vuelve la cámara cruda:", e);
        await soltar();
        return viva ? "fallo" : "apagada";
      }
    }

    // Primera vez con esta cámara: enganchar el procesador. Se crea YA en el
    // modo pedido para que el primer cuadro que salga venga con el fondo.
    if (!fondoPrecalentado()) {
      void precalentarFondo();
      avisos.alPrimeraCarga?.();
    }
    let p: ProcesadorFondoFino;
    try {
      p = ProcesadorDeFondo({
        ...modo,
        cadaCuantos: cadaCuantosCuadrosSegmentar(),
        maxFps: CUADROS_POR_SEGUNDO,
        onFrameProcessed: avisos.alProcesarCuadro ? () => avisos.alProcesarCuadro?.() : undefined,
      });
    } catch (e) {
      console.warn("[cowork] fondo: no se pudo crear el procesador:", e);
      return "fallo";
    }
    // La cruda es del tablero (userProvidedTrack): LiveKit no la re-toma ni la para por su cuenta.
    const lk = new LocalVideoTrack(cruda, undefined, true);
    const enganche = lk.setProcessor(p, false);
    try {
      await conTope(enganche, topeParaPonerFondo(TOPE_ENGANCHE_MS), "fondo-enganche");
    } catch (e) {
      console.warn("[cowork] fondo: el procesador no enganchó, sale la cámara cruda:", e);
      // Si termina tarde, igual se suelta: nadie lo va a usar.
      void enganche.catch(() => undefined).finally(() => descartar(lk, p));
      return viva ? "fallo" : "apagada";
    }
    const salidaNueva = p.processedTrack;
    if (!viva || !salidaNueva || salidaNueva.readyState !== "live") {
      await descartar(lk, p);
      return viva ? "fallo" : "apagada";
    }
    pista = lk;
    procesador = p;
    procesada = salidaNueva;
    vigilar();
    return "puesto";
  };

  return {
    salida: () => procesada ?? cruda,
    conProcesador: () => procesador !== null,
    aplicar(efecto) {
      const turno = ++pedidos;
      return encolar(() => (turno !== pedidos ? Promise.resolve<ResultadoDelFondo>("reemplazado") : hacer(efecto)))
        .catch((e): ResultadoDelFondo => {
          console.warn("[cowork] fondo:", e);
          return viva ? "fallo" : "apagada";
        });
    },
    async destruir() {
      if (!viva) return;
      viva = false;
      pedidos++;
      dejarDeVigilar();
      const lk = pista;
      const p = procesador;
      const out = procesada;
      pista = null;
      procesador = null;
      procesada = null;
      try { out?.stop(); } catch { /* ya parada */ }
      if (p) { try { await conTope(p.destroy(), 2_000, "fondo-destruir"); } catch { /* sigue */ } }
      // lk.stop() para la cruda y suelta lo que quede del procesador.
      try { lk?.stop(); } catch { /* ya parada */ }
      try { cruda.stop(); } catch { /* ya parada */ }
    },
  };
}
