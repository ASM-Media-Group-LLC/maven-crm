// Reanudar el audio de una llamada cuando el navegador lo dejó pausado.
//
// ── EL BUG QUE ESTO ARREGLA (31/08/2026) ────────────────────────────────────
//
// Un chatter de Cowork no escuchaba a su supervisora. Su propia frase fue la
// que resolvió el caso: «solo la escuché cuando cambié de ventana flotante a
// ventana normal».
//
// Había DOS fallas, y las dos apuntaban al mismo elemento:
//
// 1. UN SELECTOR QUE NO COINCIDÍA CON NADA. Los tres lugares que fuerzan la
//    reproducción cuando el navegador la bloquea buscaban
//    `audio[data-lk-audio]`. Pero `RoomAudioSink` —la red de seguridad que hace
//    audible a TODO micrófono remoto— marcaba sus elementos como
//    `data-lk-room-audio`. Distinto atributo: los recuperadores eran ciegos
//    justamente al único elemento que importaba.
//
//    Y era el único que importaba porque el supervisor entra SIN CÁMARA, y la
//    grilla filtra a quien tiene la cámara apagada (`hideNoVideo`): no tiene
//    tile, así que su voz vive solo en el elemento del sink.
//
// 2. LISTENERS EN EL DOCUMENTO EQUIVOCADO. Cuando la persona se va a otra app,
//    la llamada salta sola a una ventana REAL del sistema (Document PiP), que
//    es OTRO documento. Los listeners de "reanudar al primer clic" estaban en
//    el documento principal, así que el chatter podía hacer mil clics dentro de
//    la ventana flotante y ninguno llegaba. El camino de recuperación estaba
//    muerto exactamente mientras trabajaba.
//
// Lo que curó el silencio fue `useReanudarMedia`, el único que buscaba bien
// (`caja.querySelectorAll("video, audio")`, sin filtro de atributo) — y ese solo
// corre al MUDAR la llamada de ventana. Por eso empezó a oírse en ese instante
// y no antes.
//
// ── LA REGLA ────────────────────────────────────────────────────────────────
//
// Un solo lugar decide con qué se marca el audio de una llamada y dónde
// buscarlo. Repartido en cuatro archivos fue exactamente donde se desincronizó.

/** El atributo con el que se marca TODO `<audio>` de una llamada.
 *
 *  ⚠️ Si esto cambia, cambia acá y en ningún otro lado. La razón de que exista
 *  esta constante es que había dos nombres distintos en dos archivos y nadie lo
 *  notó: no hay test que falle cuando un selector deja de encontrar algo. */
export const MARCA_AUDIO = "data-lk-audio";

const SELECTOR = `audio[${MARCA_AUDIO}]`;

/** Marca un `<audio>` para que los recuperadores lo encuentren. */
export function marcarAudio(el: Element | null | undefined): void {
  try { el?.setAttribute(MARCA_AUDIO, "true"); } catch { /* noop */ }
}

/** Los documentos donde puede vivir el audio de la llamada.
 *
 *  El principal, y el de la ventana flotante del sistema si está abierta. La
 *  llamada se MUDA entre los dos (ver PersistentCallProvider), así que buscar
 *  solo en uno deja el audio fuera de alcance justo cuando la persona está
 *  trabajando en otra cosa — que es cuando más falta hace. */
export function documentosDeLaLlamada(): Document[] {
  const docs: Document[] = [];
  if (typeof document !== "undefined") docs.push(document);
  try {
    const pip = (window as unknown as { documentPictureInPicture?: { window: Window | null } })
      .documentPictureInPicture?.window;
    if (pip?.document && pip.document !== document) docs.push(pip.document);
  } catch { /* navegador sin Document PiP */ }
  return docs;
}

/** Todos los `<audio>` de llamada, en todos los documentos. */
export function audiosDeLaLlamada(): HTMLAudioElement[] {
  const out: HTMLAudioElement[] = [];
  for (const doc of documentosDeLaLlamada()) {
    try { out.push(...Array.from(doc.querySelectorAll<HTMLAudioElement>(SELECTOR))); }
    catch { /* noop */ }
  }
  return out;
}

/** Le da `play()` a todo `<audio>` de llamada que esté pausado.
 *
 *  Devuelve cuántos estaban pausados (o sea, cuántos hacía falta despertar).
 *  Solo toca lo pausado: llamar `play()` sobre algo que ya suena no hace nada,
 *  pero contar de más haría ruidoso el diagnóstico. */
export function reproducirAudiosPausados(): number {
  let pausados = 0;
  for (const el of audiosDeLaLlamada()) {
    if (!el.paused) continue;
    pausados += 1;
    el.play().catch(() => { /* sigue bloqueado; lo resuelve el gesto */ });
  }
  return pausados;
}

/** Todo lo que puede dejar mudo a un `<audio>` de llamada.
 *
 *  `perdioLaPista` mira UN solo bit —si el `srcObject` trae pistas— y con eso
 *  se construyó el vigilante de la red de seguridad. El bit deja fuera el caso
 *  que MÁS dura: el elemento PAUSADO con su pista puesta. Pasa cada vez que la
 *  llamada se muda a la ventana flotante del sistema (sacar un nodo del
 *  documento pausa su media) y cada vez que la librería desadjunta una pista
 *  (su `recycleElement` hace `pause()`). Como el vigilante no lo ve y el mapa
 *  del sink sigue diciendo "ya está adjunto", ese silencio no se cura NUNCA.
 *
 *  Devuelve el motivo, no un booleano, para que el aviso diga qué pasó: un
 *  audio que no suena tiene que dejar rastro de POR QUÉ. */
export type MotivoDeMudez = "sin-fuente" | "sin-pistas" | "pista-muerta" | "pausado" | null;

export function motivoDeMudez(
  el: { srcObject?: unknown; paused?: boolean } | null | undefined,
): MotivoDeMudez {
  if (!el) return null;
  const ms = el.srcObject as { getAudioTracks?: () => Array<{ readyState?: string }> } | null | undefined;
  if (!ms) return "sin-fuente";
  const pistas = ms.getAudioTracks?.();
  if (Array.isArray(pistas)) {
    if (pistas.length === 0) return "sin-pistas";
    // Una pista "ended" sigue puesta pero ya no entrega nada; re-adjuntar no la
    // revive, así que se reporta aparte para poder tratarla distinto.
    if (pistas.every((p) => p?.readyState === "ended")) return "pista-muerta";
  }
  return el.paused === true ? "pausado" : null;
}

/** ¿Este elemento se quedó SIN pista?
 *
 *  Pasa cuando otro componente hace `track.detach()` SIN argumentos: eso
 *  desconecta la pista de TODOS los elementos donde esté adjunta, no solo del
 *  suyo. Fue exactamente el bug: el recuadro de un participante, al desmontarse,
 *  le arrancaba la pista al `<audio>` de la red de seguridad de la sala.
 *
 *  Se mira el `srcObject` y no una bandera nuestra: la bandera decía "adjunto"
 *  mientras el elemento ya estaba vacío, y por eso nadie lo reponía. */
export function perdioLaPista(el: { srcObject?: unknown } | null | undefined): boolean {
  if (!el) return false;
  const ms = el.srcObject as { getAudioTracks?: () => unknown[] } | null | undefined;
  if (!ms) return true;
  const pistas = ms.getAudioTracks?.();
  return Array.isArray(pistas) ? pistas.length === 0 : false;
}

// ── Desbloqueos registrados ─────────────────────────────────────────────────
//
// Darle `play()` al elemento no alcanza si lo que está suspendido es el
// contexto de audio de LiveKit (`room.canPlaybackAudio === false`): ahí hay que
// llamar `room.startAudio()`. Como esta librería no conoce la Room, cada llamada
// viva registra su propio desbloqueo y acá se ejecutan todos antes de reintentar.

type Desbloqueo = () => void | Promise<unknown>;
const desbloqueos = new Set<Desbloqueo>();

/** Registra un desbloqueo (típicamente `() => room.startAudio()`).
 *  Devuelve la función para darlo de baja al desmontar. */
export function registrarDesbloqueo(fn: Desbloqueo): () => void {
  desbloqueos.add(fn);
  return () => { desbloqueos.delete(fn); };
}

function correrDesbloqueos(): void {
  for (const fn of desbloqueos) {
    try { void Promise.resolve(fn()).catch(() => { /* noop */ }); } catch { /* noop */ }
  }
}

// ── Espera de gesto ─────────────────────────────────────────────────────────
//
// UNA sola espera activa a la vez, a propósito. Cada vía que se rendía dejaba
// su propio listener y en una llamada con varias personas eso eran decenas de
// listeners haciendo lo mismo.

let esperandoGesto = false;
let soltarGesto: (() => void) | null = null;

/** Deja de esperar el gesto (y limpia los listeners). */
export function dejarDeEsperarGesto(): void {
  soltarGesto?.();
  soltarGesto = null;
  esperandoGesto = false;
}

/**
 * Intenta reanudar el audio YA; si algo sigue pausado, espera un gesto del
 * usuario —en CUALQUIERA de los documentos, incluida una ventana flotante que
 * se abra después— y vuelve a intentar.
 *
 * Reemplaza el patrón de "cinco reintentos y me rindo". Rendirse era lo que
 * dejaba a alguien sin oír a su supervisora por el resto del turno: los
 * reintentos rápidos cubren una carrera de milisegundos, pero no una política
 * de autoplay, que solo se levanta con un gesto y puede tardar minutos.
 *
 * @param motivo para el log. Un audio que no suena tiene que dejar rastro.
 */
export function reanudarAudioConGesto(motivo: string): void {
  const pausados = reproducirAudiosPausados();
  if (pausados === 0) return;

  console.warn(
    `[Audio] ${pausados} pista(s) de audio pausadas (${motivo}).`,
    "Esperando un gesto del usuario para reanudarlas —",
    "hasta entonces esta persona NO escucha a los demás.",
  );

  if (esperandoGesto) return;
  esperandoGesto = true;

  const alGesto = () => {
    // Primero el contexto de LiveKit, después los elementos: si el contexto
    // sigue suspendido, el `play()` del elemento no produce sonido igual.
    correrDesbloqueos();
    const quedan = reproducirAudiosPausados();
    if (quedan > 0) return;              // sigue trabado: se mantiene la espera
    console.info("[Audio] Audio reanudado tras el gesto del usuario.");
    dejarDeEsperarGesto();
  };

  const enganchados: Array<{ doc: Document }> = [];
  const engancharDoc = (doc: Document) => {
    if (enganchados.some((e) => e.doc === doc)) return;
    doc.addEventListener("click", alGesto);
    doc.addEventListener("touchstart", alGesto);
    doc.addEventListener("keydown", alGesto);
    enganchados.push({ doc });
  };
  documentosDeLaLlamada().forEach(engancharDoc);

  // La ventana flotante puede abrirse DESPUÉS de que empezó la espera; ahí hay
  // que engancharse a su documento o sus clics no cuentan. Es la mitad del bug
  // original.
  let alEntrarPip: (() => void) | null = null;
  const pipApi = (() => {
    try {
      return (window as unknown as { documentPictureInPicture?: EventTarget }).documentPictureInPicture ?? null;
    } catch { return null; }
  })();
  if (pipApi) {
    alEntrarPip = () => { documentosDeLaLlamada().forEach(engancharDoc); alGesto(); };
    try { pipApi.addEventListener("enter", alEntrarPip); } catch { alEntrarPip = null; }
  }

  soltarGesto = () => {
    for (const { doc } of enganchados) {
      try {
        doc.removeEventListener("click", alGesto);
        doc.removeEventListener("touchstart", alGesto);
        doc.removeEventListener("keydown", alGesto);
      } catch { /* documento ya cerrado */ }
    }
    enganchados.length = 0;
    if (pipApi && alEntrarPip) {
      try { pipApi.removeEventListener("enter", alEntrarPip); } catch { /* noop */ }
    }
  };
}

// ── EL MICRÓFONO QUE DEJÓ DE SALIR AL AIRE ──────────────────────────────────
//
// Todo lo de arriba cuida el audio que ENTRA. Esto cuida el que SALE, que hasta
// el 18/09/2026 no tenía ningún vigilante: se cuidaba con avisos que dependían
// de que LiveKit emitiera un evento Y de que una persona tocara un botón. Los
// dos supuestos fallan justo en el caso que importa, y por eso la gente
// terminaba saliendo y volviendo a entrar a la llamada.
//
// La DECISIÓN vive acá, pura y sin objetos de LiveKit, porque su modo de fallo
// peligroso no es no reparar: es reparar EN BUCLE. Reparar significa pedirle el
// micrófono al sistema otra vez, y hacerlo cada 3 segundos sería peor que la
// enfermedad. Los topes son la parte que hay que poder probar.

/** Lo que el vigilante necesita mirar, ya traducido a datos simples. */
export type SalidaDelMicro = {
  conectado: boolean;
  /** La persona QUIERE que la oigan (no se silenció ella misma). */
  micEncendido: boolean;
  hayPista: boolean;
  /** LiveKit vació el emisor: publica, pero no sale un solo paquete. */
  upstreamPausado: boolean;
  /** `readyState` de la pista CRUDA (no la procesada); null si no hay. */
  estadoDeLaPista: string | null;
  /** `muted` de la pista CRUDA. Lo pone el SISTEMA, nunca nosotros: silenciarse
   *  desde Maven mueve `enabled`, no `muted`. Por eso no da falsos positivos. */
  silenciadaPorElSistema: boolean;
};

export type MemoriaDelVigilante = {
  /** Cuántas vueltas seguidas lo vio roto. */
  ticksRoto: number;
  /** Cuántas vueltas seguidas lo vio SANO. Sirve para perdonar intentos. */
  ticksSano: number;
  /** Cuántas veces ya intentó repararlo sin que se haya ganado el perdón. */
  reparaciones: number;
  /** Cuántas van en toda la llamada. Esta NO se perdona nunca. */
  reparacionesTotales: number;
  /** Cuándo fue el último intento (Date.now()); 0 = nunca. */
  ultimaReparacion: number;
  /** Cuándo arrancó la reparación en curso (Date.now()); 0 = ninguna. */
  reparandoDesde: number;
};

export const MEMORIA_VIGILANTE_VACIA: MemoriaDelVigilante = {
  ticksRoto: 0, ticksSano: 0, reparaciones: 0, reparacionesTotales: 0, ultimaReparacion: 0, reparandoDesde: 0,
};

/** Tres vueltas para el caso INEQUÍVOCO. Con el intervalo de 3 s eso es entre 6
 *  y 9 s reales: los ticks no se cuentan desde la rotura, así que dos vueltas
 *  podían ser 3 s. Y hay que quedar SIEMPRE por detrás del debounce de 5 s que
 *  LiveKit espera antes de pausar el emisor, o le pisamos su recuperación. */
export const TICKS_ROTO_ANTES_DE_REPARAR = 3;
/** ⚠️ Mucho más para el caso SOSPECHOSO (`muted` puesto por el sistema): de eso
 *  el navegador se recupera SOLO muy seguido —lo dispara compartir pantalla con
 *  audio, que es nuestro propio caso de uso— y reparar ahí es peor que esperar.
 *  Con 8 vueltas son 21 s o más: si a esa altura no volvió, no vuelve. */
export const TICKS_SOSPECHA_ANTES_DE_REPARAR = 8;
/** Como mucho una reparación cada 20 s. */
export const ESPERA_ENTRE_REPARACIONES_MS = 20_000;
/** Tres intentos por episodio. */
export const MAX_REPARACIONES_SOLAS = 3;
/** ⚠️ Los intentos se perdonan tras UN MINUTO sano seguido, no tras una vuelta.
 *  Un micro que TITILA —se rompe, se repara, anda 3 s, se rompe— recuperaría
 *  sus tres oportunidades cada 3 s y quedaría pidiendo el micrófono al sistema
 *  para siempre. Cowork ya resolvió esto igual (SOBREVIVIO_MS de 60 s). */
export const TICKS_SANOS_PARA_PERDONAR = 20;
/** ⚠️ Y un techo de POR VIDA de la llamada, que ninguna racha sana perdona. Sin
 *  esto, el perdón por racha sigue permitiendo ~98 reparaciones por hora con el
 *  patrón adversario justo (17 vueltas roto + 20 sanas). Ocho intentos en una
 *  reunión ya dicen que el problema no lo arregla pedir el micrófono otra vez. */
export const MAX_REPARACIONES_POR_LLAMADA = 8;
/** Si una reparación no terminó en 30 s, se la da por vencida. Sin esto, una
 *  promesa colgada (el cerrojo de LiveKit, un getUserMedia que nunca vuelve)
 *  dejaba al vigilante muerto para el resto de la llamada. */
export const REPARACION_VENCE_MS = 30_000;

/** Roto SIN DUDA: la pista murió, o LiveKit vació el emisor POR OTRA CAUSA.
 *
 * ⚠️ La gravedad se decide por el ORIGEN, no por el síntoma. Poner
 * `upstreamPausado` a secas acá parecía razonable y era código muerto: LiveKit
 * pausa el emisor 5 s después del MISMO evento `mute` del sistema (un debounce
 * de 5000 ms en livekit-client), así que a los 5 s el caso «sospechoso» se
 * disfrazaba de «inequívoco», el umbral caía de 8 vueltas a 3 y reparábamos a
 * los 6-9 s — exactamente la ventana que se quería proteger. Mientras la causa
 * evidente sea el `muted` del sistema, esto sigue siendo sospechoso por más que
 * LiveKit ya se haya rendido. */
function rotoSinDuda(s: SalidaDelMicro): boolean {
  return s.estadoDeLaPista !== "live" || (s.upstreamPausado && !s.silenciadaPorElSistema);
}

/** ¿El micrófono está publicando pero sin salir al aire? */
export function microNoEstaSaliendo(s: SalidaDelMicro): boolean {
  if (!s.conectado || !s.micEncendido || !s.hayPista) return false;
  return rotoSinDuda(s) || s.silenciadaPorElSistema;
}

/**
 * Decide si toca reparar AHORA, y devuelve la memoria actualizada. Pura: no
 * mira el reloj ni toca nada, todo entra por parámetro.
 */
export function decidirSiRepararElMicro(
  s: SalidaDelMicro,
  m: MemoriaDelVigilante,
  ahora: number,
): { reparar: boolean; memoria: MemoriaDelVigilante } {
  if (!microNoEstaSaliendo(s)) {
    const ticksSano = m.ticksSano + 1;
    const perdonado = ticksSano >= TICKS_SANOS_PARA_PERDONAR;
    return {
      reparar: false,
      memoria: {
        ...m,
        ticksRoto: 0,
        ticksSano: perdonado ? 0 : ticksSano,
        reparaciones: perdonado ? 0 : m.reparaciones,
      },
    };
  }
  const memoria = { ...m, ticksRoto: m.ticksRoto + 1, ticksSano: 0 };
  // Hay una reparación en curso y todavía no venció.
  if (memoria.reparandoDesde > 0 && ahora - memoria.reparandoDesde < REPARACION_VENCE_MS) {
    return { reparar: false, memoria };
  }
  // Solo `muted` del sistema: se espera mucho más. Ver la constante.
  const umbral = !rotoSinDuda(s) ? TICKS_SOSPECHA_ANTES_DE_REPARAR : TICKS_ROTO_ANTES_DE_REPARAR;
  if (memoria.ticksRoto < umbral) return { reparar: false, memoria };
  if (m.reparaciones >= MAX_REPARACIONES_SOLAS) return { reparar: false, memoria };
  if (m.reparacionesTotales >= MAX_REPARACIONES_POR_LLAMADA) return { reparar: false, memoria };
  // ⚠️ `ultimaReparacion: 0` significa NUNCA REPARÓ, no «reparó en 1970».
  if (m.ultimaReparacion > 0 && ahora - m.ultimaReparacion < ESPERA_ENTRE_REPARACIONES_MS) {
    return { reparar: false, memoria };
  }
  return {
    reparar: true,
    memoria: {
      ...memoria,
      reparaciones: m.reparaciones + 1,
      reparacionesTotales: m.reparacionesTotales + 1,
      ultimaReparacion: ahora,
      reparandoDesde: ahora,
    },
  };
}
