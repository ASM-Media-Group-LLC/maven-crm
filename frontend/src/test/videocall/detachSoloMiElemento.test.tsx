// Al desmontarse, un recuadro NO puede desconectar la pista de los demás.
//
// `Track.detach(elemento)` de livekit-client tiene DOS ramas: con un elemento
// desconecta solo ese; SIN elemento —o con uno falsy— desconecta la pista de
// TODOS los elementos donde esté adjunta y los PAUSA (recycleElement). Entre
// esos elementos está el <audio> oculto de RoomAudioSink, que es la red de
// seguridad de toda la sala.
//
// El 31/08 se cambió el `detach()` sin argumentos por `detach(ref.current)`
// creyendo que eso acotaba el daño. No lo acota: React pone en null el ref de
// un elemento del DOM ANTES de correr la limpieza del efecto pasivo al
// desmontar, así que `detach(null)` cae en la MISMA rama de siempre. El `!` de
// TypeScript tapó justamente eso.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import ParticipantTile from "@/pages/messenger/videocall/ParticipantTile";
import type { LKParticipant } from "@/hooks/useLiveKit";

vi.mock("livekit-client", () => ({
  Track: { Source: { Camera: "camera", ScreenShare: "screen_share", Microphone: "microphone" } },
  Room: vi.fn(),
}));

const desconexiones: Array<unknown> = [];

// jsdom no trae MediaStream: alcanza con algo que tenga pistas de audio.
const streamFalso = () => ({ getAudioTracks: () => [{}], getTracks: () => [{}] }) as unknown as MediaStream;

function pistaFalsa() {
  return {
    attach: (el: HTMLMediaElement) => { el.srcObject = streamFalso(); },
    detach: (el?: unknown) => { desconexiones.push(el); },
    mediaStreamTrack: {},
  };
}

function salaConPistas(identity: string) {
  const micro = pistaFalsa();
  const camara = pistaFalsa();
  return {
    sala: {
      remoteParticipants: new Map([[identity, {
        audioTrackPublications: new Map([["a", { source: "microphone", track: micro }]]),
        videoTrackPublications: new Map([["v", { source: "camera", track: camara }]]),
      }]]),
      localParticipant: { videoTrackPublications: new Map() },
    },
    micro,
    camara,
  };
}

function participante(extra: Partial<LKParticipant> = {}): LKParticipant {
  return {
    sid: "sid-1", identity: "user-1", name: "Mónica", isSpeaking: false, isMuted: false,
    isCameraOff: false, isScreenSharing: false, isLocal: false, handRaised: false,
    reactions: [], connectionQuality: "excellent", hasVideoTrack: true, ...extra,
  };
}

describe("un recuadro que se desmonta", () => {
  beforeEach(() => {
    desconexiones.length = 0;
    // jsdom no implementa play()/pause() en los elementos de media.
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  it("desconecta SOLO su propio <audio>, nunca la pista entera", () => {
    const { sala } = salaConPistas("user-1");
    const { unmount } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ParticipantTile participant={participante()} room={sala as any} />
    );
    unmount();
    expect(desconexiones.length).toBeGreaterThan(0);
    // Ni null ni undefined: cualquiera de los dos desconecta a TODOS.
    for (const el of desconexiones) {
      expect(el, "detach() recibió un elemento falsy: desconecta la pista de TODA la sala").toBeTruthy();
    }
  });
});

// Quien comparte pantalla dibuja DOS recuadros de la misma persona. Los dos
// adjuntaban el mismo micrófono, y con el <audio> de la red de seguridad la voz
// salía por tres elementos. Una pantalla no tiene micrófono.
describe("el recuadro de la pantalla compartida", () => {
  beforeEach(() => {
    desconexiones.length = 0;
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  it("no dibuja <audio> ni adjunta el micrófono: eso es del recuadro de la persona", () => {
    const { sala, micro } = salaConPistas("user-1");
    const adjuntados: unknown[] = [];
    micro.attach = (el: HTMLMediaElement) => { adjuntados.push(el); el.srcObject = streamFalso(); };
    const { container } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ParticipantTile participant={participante({ esTileDePantalla: true, isScreenSharing: true })} room={sala as any} />
    );
    expect(container.querySelector("audio")).toBeNull();
    expect(adjuntados).toHaveLength(0);
  });

  it("el recuadro de la persona sí lo adjunta", () => {
    const { sala, micro } = salaConPistas("user-1");
    const adjuntados: unknown[] = [];
    micro.attach = (el: HTMLMediaElement) => { adjuntados.push(el); el.srcObject = streamFalso(); };
    const { container } = render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <ParticipantTile participant={participante()} room={sala as any} />
    );
    expect(container.querySelector("audio")).not.toBeNull();
    expect(adjuntados).toHaveLength(1);
  });
});
