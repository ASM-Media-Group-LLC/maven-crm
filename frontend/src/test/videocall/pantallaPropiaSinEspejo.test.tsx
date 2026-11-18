import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ParticipantTile from "@/pages/messenger/videocall/ParticipantTile";
import type { LKParticipant } from "@/hooks/useLiveKit";

// EN COWORK: NI ESPEJO INFINITO NI LA MÚSICA DEL CHATTER (Alvaro, 18/11/2026).
//
// 1) «Se le va al infinito la pantalla»: el supervisor veía en grande su propia
//    pantalla compartida; como esa pantalla mostraba Maven, la imagen se repetía
//    adentro de sí misma, y eso era lo que les llegaba a todos. Tu pantalla ya no
//    se dibuja (como en Meet) y el escenario es para la pantalla de otro.
// 2) «La app jala todo el sonido que estén emitiendo los chatter»: en la app de
//    Windows, pedir el audio de la pantalla completa trae todo el sonido del
//    computador. En Cowork la pantalla va sin sonido.
//
// Las fuentes se leen con import.meta.glob (ruta y opciones literales): el
// tsconfig de la app no trae los tipos de Node.

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

vi.mock("livekit-client", () => ({
  Track: { Source: { Camera: "camera", ScreenShare: "screen_share", Microphone: "microphone" } },
  Room: vi.fn(),
}));

type Glob = { glob: (p: string | string[], o: Record<string, unknown>) => Record<string, string> };
const fuentes = (import.meta as unknown as Glob).glob(
  ["/frontend/src/hooks/useLiveKit.ts", "/frontend/src/pages/messenger/videocall/LiveKitCallView.tsx"],
  { query: "?raw", import: "default", eager: true },
);
const fuente = (fin: string) => Object.entries(fuentes).find(([ruta]) => ruta.endsWith(fin))?.[1] ?? "";

function participante(overrides: Partial<LKParticipant> = {}): LKParticipant {
  return {
    sid: "sid-1",
    identity: "user-1",
    name: "Daniel Ospina",
    isSpeaking: false,
    isMuted: false,
    isCameraOff: true,
    isScreenSharing: false,
    isLocal: false,
    handRaised: false,
    reactions: [],
    connectionQuality: "excellent",
    hasVideoTrack: true,
    ...overrides,
  };
}

describe("tu propia pantalla compartida no se dibuja", () => {
  it("la tuya: sin video, con el aviso de que la estás compartiendo", () => {
    const { container } = render(
      <ParticipantTile participant={participante({ isLocal: true, isScreenSharing: true, esTileDePantalla: true, sid: "sid-1-screen" })} room={null} large />,
    );
    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(screen.getByText("Estás compartiendo tu pantalla")).toBeInTheDocument();
  });

  it("la de otro: se ve, como siempre", () => {
    const { container } = render(
      <ParticipantTile participant={participante({ isScreenSharing: true, esTileDePantalla: true, sid: "sid-2-screen" })} room={null} large />,
    );
    expect(container.querySelector("video")).toBeInTheDocument();
    expect(screen.queryByText("Estás compartiendo tu pantalla")).not.toBeInTheDocument();
  });

  it("tu cámara se sigue viendo mientras compartes", () => {
    const { container } = render(
      <ParticipantTile participant={participante({ isLocal: true, isCameraOff: false })} room={null} />,
    );
    expect(container.querySelector("video")).toBeInTheDocument();
  });

  it("el escenario es para la pantalla de otro, no para la tuya", () => {
    const s = fuente("LiveKitCallView.tsx");
    expect(s).toContain("const ss = visibleParticipants.find((p) => p.isScreenSharing && !p.isLocal);");
    expect(s).not.toContain("const ss = visibleParticipants.find((p) => p.isScreenSharing);");
  });
});

describe("en Cowork la pantalla va sin sonido", () => {
  const s = fuente("useLiveKit.ts");

  it("la fuente se cargó", () => {
    expect(s.length).toBeGreaterThan(10_000);
  });

  it("con la pantalla completa obligatoria no se pide el audio", () => {
    expect(s).toMatch(/exigir\s*\n?\s*\?\s*\{ audio: false, video: \{ displaySurface: "monitor" \}/);
    expect(s).not.toMatch(/\{ audio: true, video: \{ displaySurface: "monitor" \}/);
  });

  it("en cualquier sala de Cowork (también el Hub) tampoco", () => {
    expect(s).toContain('const enCowork = !!room.name && room.name.startsWith("cowork_");');
    expect(s).toContain(": { audio: newState && !enCowork };");
  });
});
