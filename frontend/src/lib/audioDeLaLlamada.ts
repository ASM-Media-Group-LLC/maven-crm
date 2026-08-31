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
