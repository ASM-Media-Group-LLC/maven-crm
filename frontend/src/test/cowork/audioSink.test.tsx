import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import AudioSink from "@/pages/cowork/AudioSink";

// Imita lo que hace livekit-client al (re)adjuntar: deja el elemento SIN mute.
function trackFalso() {
  let el: HTMLAudioElement | null = null;
  return {
    attach(e: HTMLAudioElement) { el = e; e.muted = false; },
    detach() { el = null; },
    /** El SDK vuelve a adjuntar cuando la persona desmutea su micro. */
    simularDesmuteRemoto() { if (el) { el.muted = false; el.dispatchEvent(new Event("volumechange")); } },
  };
}

describe("AudioSink — el silencio de la sala es nuestro, no del SDK", () => {
  it("queda silenciado aunque attach lo deje sonando", () => {
    const t = trackFalso();
    const { getByTestId } = render(<AudioSink track={t} muted />);
    expect((getByTestId("audio-sink") as HTMLAudioElement).muted).toBe(true);
  });

  it("repone el silencio cuando el SDK lo pisa al desmutear la persona", () => {
    const t = trackFalso();
    const { getByTestId } = render(<AudioSink track={t} muted />);
    const el = getByTestId("audio-sink") as HTMLAudioElement;
    act(() => t.simularDesmuteRemoto());
    expect(el.muted).toBe(true);
  });

  it("si la sala se está escuchando, no la silencia por error", () => {
    const t = trackFalso();
    const { getByTestId } = render(<AudioSink track={t} muted={false} />);
    const el = getByTestId("audio-sink") as HTMLAudioElement;
    act(() => t.simularDesmuteRemoto());
    expect(el.muted).toBe(false);
  });

  it("al cambiar la prop, obedece", () => {
    const t = trackFalso();
    const { getByTestId, rerender } = render(<AudioSink track={t} muted />);
    const el = getByTestId("audio-sink") as HTMLAudioElement;
    rerender(<AudioSink track={t} muted={false} />);
    expect(el.muted).toBe(false);
    rerender(<AudioSink track={t} muted />);
    expect(el.muted).toBe(true);
    act(() => t.simularDesmuteRemoto());
    expect(el.muted).toBe(true);
  });
});
