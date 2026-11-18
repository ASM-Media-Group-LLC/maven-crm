import { describe, it, expect, afterEach, vi } from "vitest";
import { marcarSegundoPlano, pausarVideoConAppEscondida } from "@/lib/videoEscondido";

// Alvaro, 18/11/2026: «la aplicación lo más liviana posible». Con la app de
// computador minimizada, el video de los demás se pausa como en una pestaña
// oculta (la app corre sin backgroundThrottling y la página creía estar visible).

const main = Object.values(import.meta.glob("../../../../desktop/src/main.js", { query: "?raw", import: "default", eager: true }))[0] as string;
const preload = Object.values(import.meta.glob("../../../../desktop/src/preload.js", { query: "?raw", import: "default", eager: true }))[0] as string;
const livekit = Object.values(import.meta.glob("../../hooks/useLiveKit.ts", { query: "?raw", import: "default", eager: true }))[0] as string;

type ConEscritorio = Window & { mavenEscritorio?: unknown };

const videoFalso = () => ({ kind: "video", isInBackground: false, updateVisibility: vi.fn(), attachedElements: [] as HTMLMediaElement[] });

function salaFalsa(videos: ReturnType<typeof videoFalso>[]) {
  const oyentes: Record<string, ((t: unknown) => void)[]> = {};
  return {
    remoteParticipants: new Map([["p1", { videoTrackPublications: new Map(videos.map((v, i) => [String(i), { track: v }])) }]]),
    on: (ev: string, f: (t: unknown) => void) => { (oyentes[ev] ??= []).push(f); },
    off: (ev: string, f: (t: unknown) => void) => { oyentes[ev] = (oyentes[ev] ?? []).filter((g) => g !== f); },
    emitir: (ev: string, t: unknown) => (oyentes[ev] ?? []).forEach((f) => f(t)),
  };
}

describe("video de los demás en pausa con la app escondida", () => {
  afterEach(() => { delete (window as ConEscritorio).mavenEscritorio; });

  it("marca solo los videos y deja que LiveKit decida", () => {
    const v = videoFalso();
    const audio = { kind: "audio", updateVisibility: vi.fn() };
    expect(marcarSegundoPlano([v, audio], true)).toBe(1);
    expect(v.isInBackground).toBe(true);
    expect(v.updateVisibility).toHaveBeenCalledWith(true);
    expect(audio.updateVisibility).not.toHaveBeenCalled();
  });

  it("en la app: al minimizar se pausa, al volver se reanuda, y lo que llega escondido nace pausado", () => {
    let avisar: (visible: boolean) => void = () => {};
    (window as ConEscritorio).mavenEscritorio = {
      esApp: true,
      visible: async () => true,
      alCambiarVisibilidad: (cb: (v: boolean) => void) => { avisar = cb; return () => {}; },
    };
    const v = videoFalso();
    const sala = salaFalsa([v]);
    const soltar = pausarVideoConAppEscondida(sala as never);
    avisar(false);
    expect(v.isInBackground).toBe(true);
    const nuevo = videoFalso();
    sala.emitir("trackSubscribed", nuevo);
    expect(nuevo.isInBackground).toBe(true);
    avisar(true);
    expect(v.isInBackground).toBe(false);
    soltar();
  });

  it("en el navegador no hace nada", () => {
    const v = videoFalso();
    pausarVideoConAppEscondida(salaFalsa([v]) as never)();
    expect(v.updateVisibility).not.toHaveBeenCalled();
  });

  it("la app avisa minimizar/restaurar/esconder/mostrar y la sala se engancha", () => {
    expect(main).toMatch(/for \(const ev of \["minimize", "restore", "hide", "show"\]\) ventana\.on\(ev, avisarVisibilidad\)/);
    expect(main).toMatch(/ipcMain\.handle\("maven:visible"/);
    expect(preload).toMatch(/alCambiarVisibilidad: \(cb\) =>/);
    expect(livekit).toMatch(/const soltarPausaDeVideo = pausarVideoConAppEscondida\(room\);\s*room\.on\(RoomEvent\.Disconnected, \(\) => soltarPausaDeVideo\(\)\);/);
  });
});
