import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MARCA_AUDIO, marcarAudio, documentosDeLaLlamada, audiosDeLaLlamada,
  reproducirAudiosPausados, reanudarAudioConGesto, dejarDeEsperarGesto,
  registrarDesbloqueo, perdioLaPista,
} from "@/lib/audioDeLaLlamada";

// EL BUG QUE ESTOS TESTS CUIDAN (31/08/2026): un chatter de Cowork no escuchaba
// a su supervisora. Su propia frase resolvió el caso: "solo la escuché cuando
// cambié de ventana flotante a ventana normal".
//
// Dos fallas sobre el MISMO elemento:
//
//   1. Los tres recuperadores de useLiveKit buscaban `audio[data-lk-audio]`,
//      pero RoomAudioSink marcaba sus elementos `data-lk-room-audio`. Eran
//      ciegos justo al único elemento que llevaba la voz del supervisor (entra
//      sin cámara, la grilla lo filtra, no tiene tile).
//
//   2. Los listeners de "reanudar al primer clic" estaban en el documento
//      PRINCIPAL. La llamada se muda a una ventana REAL del sistema (Document
//      PiP), que es otro documento: los clics del chatter no llegaban nunca.
//
// Ningún test podía fallar por eso: un selector que no encuentra nada no rompe,
// solo calla.

/** Un <audio> de mentira: jsdom no implementa play() ni deja escribir paused. */
function audioFalso(doc: Document, { marcado, pausado }: { marcado: boolean; pausado: boolean }) {
  const el = doc.createElement("audio");
  Object.defineProperty(el, "paused", { value: pausado, writable: true, configurable: true });
  const play = vi.fn(() => {
    Object.defineProperty(el, "paused", { value: false, writable: true, configurable: true });
    return Promise.resolve();
  });
  (el as unknown as { play: typeof play }).play = play;
  if (marcado) marcarAudio(el);
  doc.body.appendChild(el);
  return { el, play };
}

/** Simula la ventana flotante del sistema (Document PiP) con su propio documento. */
function abrirPipFalso() {
  const pipDoc = document.implementation.createHTMLDocument("pip");
  const api = {
    window: { document: pipDoc } as unknown as Window,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture = api;
  return { pipDoc, api };
}

beforeEach(() => {
  dejarDeEsperarGesto();
  document.body.innerHTML = "";
  delete (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture;
});
afterEach(() => { dejarDeEsperarGesto(); vi.restoreAllMocks(); });

describe("la marca del audio de llamada", () => {
  it("marcarAudio pone EXACTAMENTE el atributo que buscan los recuperadores", () => {
    // Este es el test que faltaba. El bug era que había dos nombres distintos:
    // el que se escribía y el que se buscaba.
    const { el } = audioFalso(document, { marcado: true, pausado: true });
    expect(el.getAttribute(MARCA_AUDIO)).toBe("true");
    expect(audiosDeLaLlamada()).toContain(el);
  });

  it("un <audio> marcado con OTRO atributo no lo encuentra nadie", () => {
    // Exactamente lo que pasaba con `data-lk-room-audio`.
    const el = document.createElement("audio");
    el.setAttribute("data-lk-room-audio", "true");
    document.body.appendChild(el);
    expect(audiosDeLaLlamada()).not.toContain(el);
  });
});

describe("reproducir los audios pausados", () => {
  it("despierta a los pausados y no toca a los que ya suenan", () => {
    const a = audioFalso(document, { marcado: true, pausado: true });
    const b = audioFalso(document, { marcado: true, pausado: false });
    expect(reproducirAudiosPausados()).toBe(1);
    expect(a.play).toHaveBeenCalledTimes(1);
    expect(b.play).not.toHaveBeenCalled();
  });

  it("ignora el audio que no es de la llamada", () => {
    const ajeno = document.createElement("audio");
    Object.defineProperty(ajeno, "paused", { value: true, configurable: true });
    const play = vi.fn(() => Promise.resolve());
    (ajeno as unknown as { play: typeof play }).play = play;
    document.body.appendChild(ajeno);
    expect(reproducirAudiosPausados()).toBe(0);
    expect(play).not.toHaveBeenCalled();
  });
});

describe("la ventana flotante del sistema es OTRO documento", () => {
  it("sin ventana flotante, solo está el documento principal", () => {
    expect(documentosDeLaLlamada()).toEqual([document]);
  });

  it("con la ventana flotante abierta, su documento también cuenta", () => {
    const { pipDoc } = abrirPipFalso();
    expect(documentosDeLaLlamada()).toContain(pipDoc);
  });

  it("encuentra y despierta el audio que se MUDÓ a la ventana flotante", () => {
    // El caso real: el chatter se fue a otra app, la llamada saltó a la ventana
    // del sistema y el audio del supervisor quedó pausado allá. Antes se buscaba
    // solo en `document` y ese elemento era inalcanzable.
    const { pipDoc } = abrirPipFalso();
    const enPip = audioFalso(pipDoc, { marcado: true, pausado: true });
    expect(reproducirAudiosPausados()).toBe(1);
    expect(enPip.play).toHaveBeenCalledTimes(1);
  });
});

describe("esperar el gesto del usuario", () => {
  it("no espera nada si no había audio pausado", () => {
    audioFalso(document, { marcado: true, pausado: false });
    const spy = vi.spyOn(document, "addEventListener");
    reanudarAudioConGesto("prueba");
    expect(spy).not.toHaveBeenCalled();
  });

  it("engancha el gesto en los DOS documentos, no solo en el principal", () => {
    // El corazón del bug: los clics del chatter ocurrían dentro de la ventana
    // flotante y el listener estaba en el documento principal.
    const { pipDoc } = abrirPipFalso();
    audioFalso(pipDoc, { marcado: true, pausado: true });
    const spyMain = vi.spyOn(document, "addEventListener");
    const spyPip = vi.spyOn(pipDoc, "addEventListener");

    reanudarAudioConGesto("prueba");

    expect(spyMain).toHaveBeenCalledWith("click", expect.any(Function));
    expect(spyPip).toHaveBeenCalledWith("click", expect.any(Function));
  });

  it("un clic DENTRO de la ventana flotante reanuda el audio", () => {
    const { pipDoc } = abrirPipFalso();
    const enPip = audioFalso(pipDoc, { marcado: true, pausado: true });
    let handler: (() => void) | null = null;
    vi.spyOn(pipDoc, "addEventListener").mockImplementation(((tipo: string, fn: () => void) => {
      if (tipo === "click") handler = fn;
    }) as never);

    reanudarAudioConGesto("prueba");
    expect(enPip.play).toHaveBeenCalledTimes(1);   // el intento inmediato

    // Ahora el chatter hace clic en la ventana flotante.
    Object.defineProperty(enPip.el, "paused", { value: true, writable: true, configurable: true });
    handler?.();
    expect(enPip.play).toHaveBeenCalledTimes(2);
  });

  it("levanta el contexto de audio de LiveKit antes de reintentar", () => {
    // `play()` sobre el elemento no produce sonido si el contexto está
    // suspendido: hay que llamar `room.startAudio()`, que la Room registra acá.
    audioFalso(document, { marcado: true, pausado: true });
    const startAudio = vi.fn(() => Promise.resolve());
    const baja = registrarDesbloqueo(startAudio);
    let handler: (() => void) | null = null;
    vi.spyOn(document, "addEventListener").mockImplementation(((tipo: string, fn: () => void) => {
      if (tipo === "click") handler = fn;
    }) as never);

    reanudarAudioConGesto("prueba");
    handler?.();
    expect(startAudio).toHaveBeenCalled();
    baja();
  });

  it("no apila esperas: dos avisos dejan UNA sola espera", () => {
    audioFalso(document, { marcado: true, pausado: true });
    const spy = vi.spyOn(document, "addEventListener");
    reanudarAudioConGesto("primera");
    const trasPrimera = spy.mock.calls.length;
    reanudarAudioConGesto("segunda");
    expect(spy.mock.calls.length).toBe(trasPrimera);
  });

  it("deja de esperar cuando ya no queda nada pausado", () => {
    const a = audioFalso(document, { marcado: true, pausado: true });
    let handler: (() => void) | null = null;
    vi.spyOn(document, "addEventListener").mockImplementation(((tipo: string, fn: () => void) => {
      if (tipo === "click") handler = fn;
    }) as never);
    const quitar = vi.spyOn(document, "removeEventListener");

    reanudarAudioConGesto("prueba");
    handler?.();                      // el play() del mock marca paused=false
    expect(a.play).toHaveBeenCalled();
    expect(quitar).toHaveBeenCalledWith("click", expect.any(Function));
  });
});

// ── El segundo bug: que te arranquen la pista ───────────────────────────────
//
// `track.detach()` SIN argumentos desconecta la pista de TODOS los elementos
// donde esté adjunta, no solo del propio. `ParticipantTile` lo hacía en su
// limpieza de desmontaje, y los recuadros se desmontan todo el tiempo: al pasar
// a la ventana flotante se dibujan solo DOS, al volver se dibujan todos, y
// `hideNoVideo` los filtra según prendan o apaguen la cámara.
//
// Cada desmontaje le arrancaba la pista al <audio> de RoomAudioSink —la red de
// seguridad de la sala— y el sink no la reponía nunca porque su mapa seguía
// diciendo "ya está adjunto". La persona dejaba de escuchar a quien no tuviera
// recuadro (el supervisor entra SIN cámara) por el resto del turno.
describe("detectar que a un elemento le arrancaron la pista", () => {
  const conPistas = (n: number) => ({ srcObject: { getAudioTracks: () => Array(n).fill({}) } });

  it("un elemento con su pista está sano", () => {
    expect(perdioLaPista(conPistas(1))).toBe(false);
  });

  it("un elemento cuyo srcObject quedó VACÍO perdió la pista", () => {
    // Esto es lo que deja un detach() sin argumentos.
    expect(perdioLaPista(conPistas(0))).toBe(true);
  });

  it("un elemento sin srcObject perdió la pista", () => {
    expect(perdioLaPista({ srcObject: null })).toBe(true);
    expect(perdioLaPista({})).toBe(true);
  });

  it("no opina sobre lo que no puede mirar", () => {
    expect(perdioLaPista(null)).toBe(false);
    expect(perdioLaPista(undefined)).toBe(false);
    // Un srcObject que no es MediaStream (no expone getAudioTracks): no se
    // inventa un diagnóstico.
    expect(perdioLaPista({ srcObject: {} })).toBe(false);
  });
});
