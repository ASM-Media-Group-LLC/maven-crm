import { PRUEBA_VIGENTE_MS } from "@/lib/perfilDePantalla";

// CON QUÉ CALIDAD SE PUBLICA LA CÁMARA, SEGÚN EL INTERNET DE QUIEN LA PUBLICA
// (Alvaro, 13/11/2026). Es la hermana de lib/perfilDePantalla.ts.
//
// ⚠️ Los topes son números sueltos y no presets de livekit-client: varios tests
// simulan livekit-client a medias y un `new VideoPreset(…)` al cargar el módulo
// los tumbaría.
//
// ── EL PERFIL NORMAL (el de siempre, no cambia) ──────────────────────────────
//
// La cámara se captura a 720p (videoCaptureDefaults en hooks/useLiveKit.ts) y se
// publica en simulcast con TRES capas: 180p@20 (160 kbps), 360p@20 (450 kbps) y
// 720p@30 (1,7 Mbps). Sumadas piden hasta ~2,3 Mbps de subida. Con buen internet
// está bien: dynacast solo manda las capas que alguien está mirando.
//
// ── EL PERFIL LIVIANO (subida floja) ─────────────────────────────────────────
//
// La mayoría del equipo sube con ~1 Mbps y las llamadas parpadean: cuando un
// supervisor abre la cámara de alguien en grande, la capa de 720p pide 1,7 Mbps
// que no caben, el control de congestión empuja, se pierden paquetes y la
// llamada se reconecta. A quien tiene la subida floja se le topan las capas:
//
//   · la de arriba, a 360p, 15 cuadros por segundo y 350 kbps como mucho;
//   · la del medio, también a 360p@15, con 300 kbps;
//   · la de abajo, a 180p@10 y 80 kbps.
//
// La del medio NO baja a 180p a propósito: es la que pide una miniatura del
// tablero en una pantalla retina (LiveKit multiplica el tamaño del recuadro por
// la densidad de píxeles), y Alvaro ya pidió que las miniaturas no se vean
// pixeladas. Arriba y medio quedan iguales; dynacast solo codifica las capas que
// alguien está mirando, así que casi nunca salen las dos a la vez.
//
// En el peor caso (las tres capas pedidas a la vez) son ~730 kbps contra
// ~2,3 Mbps del perfil normal; lo común, una o dos capas: 80 a 380 kbps. Una
// cara a 360p se ve bien en un recuadro.
//
// ── CÓMO SE APLICA: EN VIVO, SIN VOLVER A PUBLICAR ───────────────────────────
//
// La cámara se publica UNA vez por sala (apagarla es silenciarla, no
// despublicarla), así que elegir opciones de publicación al prenderla no
// alcanzaría para los cambios a mitad de llamada. En cambio, cada capa se topa
// con `sender.setParameters` (escala, bitrate y cuadros): es instantáneo, no corta
// el video de nadie, y se deshace igual de fácil volviendo a los valores
// originales. LiveKit (dynacast) solo prende y apaga capas (`active`), no toca
// estos topes; igual se vuelven a aplicar cada minuto por si el navegador o una
// reconexión los repone.

/** Debajo de esto (subida medida de verdad, en Mbps) la cámara va en liviano. */
export const SUBIDA_PARA_CAMARA_NORMAL_MBPS = 1.5;
/** Minutos seguidos sin señales malas para volver del liviano al normal. */
export const MINUTOS_BUENOS_PARA_VOLVER = 5;

export interface TopeDeCapa {
  /** Alto máximo de la imagen de esa capa (lado corto, en píxeles). */
  alto: number;
  maxBitrate: number;
  maxFramerate: number;
}

/** Los topes del perfil liviano, de la capa de arriba a la de abajo. */
export const CAMARA_LIVIANA: { alta: TopeDeCapa; media: TopeDeCapa; baja: TopeDeCapa } = {
  alta: { alto: 360, maxBitrate: 350_000, maxFramerate: 15 },
  media: { alto: 360, maxBitrate: 300_000, maxFramerate: 15 },
  baja: { alto: 180, maxBitrate: 80_000, maxFramerate: 10 },
};

export type PerfilDeCamara = "normal" | "liviano";

export interface SenalesDeSubida {
  prueba: { subida_mbps: number | null; edadMs: number } | null;
  ahorroActivo: boolean;
  limiteCam: string | null;
  limitePant: string | null;
}

/**
 * Las mismas señales que la pantalla compartida (lib/perfilDePantalla.ts):
 *
 *  1. La prueba de velocidad real (lib/pruebaDeRed.ts): subida medida por debajo
 *     de 1,5 Mbps → liviano.
 *  2. El modo ahorro prendido (lib/modoAhorro.ts) → liviano.
 *  3. La última muestra dice que el codificador (de la cámara o de la pantalla)
 *     está limitado por ancho de banda → liviano. Limitado por CPU no cuenta: eso
 *     no es falta de internet.
 *
 * Sin ninguna señal, el normal de siempre: no se le baja la calidad a nadie sin
 * evidencia.
 */
export function elegirPerfilDeCamara(s: SenalesDeSubida): PerfilDeCamara {
  const prueba = s.prueba && s.prueba.edadMs <= PRUEBA_VIGENTE_MS ? s.prueba.subida_mbps : null;
  if (prueba !== null && prueba < SUBIDA_PARA_CAMARA_NORMAL_MBPS) return "liviano";
  if (s.ahorroActivo) return "liviano";
  if (s.limiteCam === "bandwidth" || s.limitePant === "bandwidth") return "liviano";
  return "normal";
}

export interface EstadoCamara {
  perfil: PerfilDeCamara;
  /** Minutos seguidos sin señales malas estando en liviano. */
  buenas: number;
}

export const CAMARA_INICIAL: EstadoCamara = { perfil: "normal", buenas: 0 };

/**
 * Se evalúa con cada muestra de la llamada (una por minuto; ahí mismo llegan la
 * prueba de velocidad y el modo ahorro). Bajar es inmediato; volver al normal
 * pide 5 minutos seguidos sin señales malas. Sin esa espera, la limitación por
 * ancho de banda desaparece justo PORQUE se bajó la calidad, se volvería a subir
 * al minuto siguiente y la cámara subiría y bajaría sin parar.
 */
export function siguientePerfilDeCamara(prev: EstadoCamara, s: SenalesDeSubida): EstadoCamara {
  if (elegirPerfilDeCamara(s) === "liviano") return { perfil: "liviano", buenas: 0 };
  if (prev.perfil === "normal") return CAMARA_INICIAL;
  const buenas = prev.buenas + 1;
  return buenas >= MINUTOS_BUENOS_PARA_VOLVER ? CAMARA_INICIAL : { perfil: "liviano", buenas };
}

/** Lo que se toca de cada codificación (RTCRtpEncodingParameters). */
export interface TopeDeCodificacion {
  scaleResolutionDownBy?: number;
  maxBitrate?: number;
  maxFramerate?: number;
}

/** Copia solo lo que se toca, para poder volver exactamente a como estaba. */
export function copiarTopes(e: TopeDeCodificacion): TopeDeCodificacion {
  return { scaleResolutionDownBy: e.scaleResolutionDownBy, maxBitrate: e.maxBitrate, maxFramerate: e.maxFramerate };
}

/**
 * Los topes livianos para las codificaciones ORIGINALES de la cámara.
 *
 * LiveKit las arma de la capa más chica a la más grande, así que la última es
 * la de arriba. Con una sola capa, esa es la de arriba; con dos, arriba y abajo;
 * con tres, arriba, medio y abajo.
 *
 * `ladoCorto` es el alto real de la captura (720 normalmente, 540 con fondo
 * virtual). La escala sale de ahí, nunca menor a la que ya tenía la capa: una
 * capa jamás se agranda.
 */
export function topesLivianos(originales: TopeDeCodificacion[], ladoCorto: number | null): TopeDeCodificacion[] {
  const lado = ladoCorto && ladoCorto > 0 ? ladoCorto : 720;
  const n = originales.length;
  return originales.map((o, i) => {
    const capa = i === n - 1 ? CAMARA_LIVIANA.alta : i === 0 ? CAMARA_LIVIANA.baja : CAMARA_LIVIANA.media;
    return {
      scaleResolutionDownBy: Math.max(o.scaleResolutionDownBy ?? 1, lado / capa.alto),
      maxBitrate: Math.min(o.maxBitrate ?? capa.maxBitrate, capa.maxBitrate),
      maxFramerate: Math.min(o.maxFramerate ?? capa.maxFramerate, capa.maxFramerate),
    };
  });
}

/**
 * Escribe los topes sobre las codificaciones que devolvió `getParameters()`.
 * Devuelve si cambió algo: si no, no hace falta llamar a `setParameters` (cada
 * llamada le cuesta un ciclo al navegador, y esto corre cada minuto).
 */
export function escribirTopes(encodings: TopeDeCodificacion[], topes: TopeDeCodificacion[]): boolean {
  let cambio = false;
  encodings.forEach((e, i) => {
    const t = topes[i];
    if (!t) return;
    for (const k of ["scaleResolutionDownBy", "maxBitrate", "maxFramerate"] as const) {
      const quiere = t[k];
      const tiene = e[k];
      const igual = quiere === undefined ? tiene === undefined : tiene !== undefined && Math.abs(tiene - quiere) < 1e-6;
      if (igual) continue;
      cambio = true;
      if (quiere === undefined) delete e[k];
      else e[k] = quiere;
    }
  });
  return cambio;
}
