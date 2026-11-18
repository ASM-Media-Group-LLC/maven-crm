import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// LLAMAR COMO EN SKYPE (Alvaro, 18/11/2026: «no suena que estoy llamando… está
// todo abultado arriba»). Mientras le suena a alguien y nadie entró, quien
// llama ve a quién llama en grande y oye el tono de espera; cuando alguien
// contesta, se calla y vuelve la llamada.

const sonar = vi.fn(() => callar);
const callar = vi.fn();
vi.mock("@/lib/tonosDeLlamada", async (original) => ({
  ...(await original<typeof import("@/lib/tonosDeLlamada")>()),
  sonar: (...a: unknown[]) => sonar(...(a as [])),
}));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

import AvisoDeInvitados from "@/pages/messenger/videocall/AvisoDeInvitados";
import { ESPERA, TIMBRE } from "@/lib/tonosDeLlamada";
import type { Invitado } from "@/hooks/useInvitadosDeLaLlamada";
import type { LlamadaViva } from "@/lib/llamadaInvitar";

const llamada = { id: "c1", room_id: "call-x", call_status: "ringing", call_type: "video" } as unknown as LlamadaViva;
const yo: Invitado = { user_id: "yo", nombre: "Alvaro", status: "accepted" };
const ana = (status: Invitado["status"]): Invitado => ({ user_id: "a", nombre: "Ana Ruiz", status });

function pintar(invitados: Invitado[], l: LlamadaViva | null = llamada) {
  return render(
    <AvisoDeInvitados roomName="call-x" uid="yo" llamada={l} invitados={invitados} alColgar={() => {}} alReintentar={() => {}} />,
  );
}

describe("quien llama, mientras suena", () => {
  beforeEach(() => { sonar.mockClear(); callar.mockClear(); });

  it("ve a quién llama en grande y oye el tono de espera", () => {
    pintar([yo, ana("ringing")]);
    expect(screen.getByText("Llamando a Ana Ruiz")).toBeInTheDocument();
    expect(screen.getByText("Sonando…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Colgar" })).toBeInTheDocument();
    expect(sonar).toHaveBeenCalledWith(ESPERA);
  });

  it("cuando contesta, se calla y vuelve la llamada", () => {
    const { rerender } = pintar([yo, ana("ringing")]);
    rerender(<AvisoDeInvitados roomName="call-x" uid="yo" llamada={llamada} invitados={[yo, ana("accepted")]} alColgar={() => {}} alReintentar={() => {}} />);
    expect(callar).toHaveBeenCalled();
    expect(screen.queryByText("Llamando a Ana Ruiz")).not.toBeInTheDocument();
  });

  it("en grupo, con uno adentro y otro sonando, solo el aviso chico y sin tono", () => {
    pintar([yo, ana("accepted"), { user_id: "b", nombre: "Luis", status: "ringing" }]);
    expect(screen.queryByText(/Llamando a/)).not.toBeInTheDocument();
    expect(sonar).not.toHaveBeenCalled();
  });

  it("si nadie contestó, no suena", () => {
    pintar([yo, ana("missed")]);
    expect(sonar).not.toHaveBeenCalled();
  });
});

describe("los tonos", () => {
  it("el timbre y la espera tienen notas y se repiten", () => {
    expect(TIMBRE.notas.length).toBeGreaterThan(0);
    expect(ESPERA.notas[0].hz).toEqual([425]);
    for (const p of [TIMBRE, ESPERA]) {
      const fin = Math.max(...p.notas.map((n) => n.desde + n.dura));
      expect(fin).toBeLessThan(p.ciclo);
    }
  });

  it("se programan osciladores y al callar se detienen", async () => {
    // El de verdad (arriba está reemplazado para contar las llamadas).
    const { sonar: sonarDeVerdad } = await vi.importActual<typeof import("@/lib/tonosDeLlamada")>("@/lib/tonosDeLlamada");
    const osciladores: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
    const param = () => ({ setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() });
    class ContextoFalso {
      state = "running";
      currentTime = 0;
      destination = {};
      resume = vi.fn(async () => {});
      createGain() { return { gain: param(), connect: vi.fn(), disconnect: vi.fn() }; }
      createOscillator() {
        const o = { type: "", frequency: param(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
        osciladores.push(o);
        return o;
      }
    }
    vi.stubGlobal("AudioContext", ContextoFalso);
    const parar = sonarDeVerdad(ESPERA);
    expect(osciladores.length).toBeGreaterThan(0);
    expect(osciladores[0].start).toHaveBeenCalled();
    parar();
    expect(osciladores.every((o) => o.stop.mock.calls.length >= 1)).toBe(true);
    vi.unstubAllGlobals();
  });
});
