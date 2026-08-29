import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

// El supervisor de encuadre: a quién le habla, cuándo, y —sobre todo— cuándo NO.
//
// Las reglas que esto fija son las que no se ven mirando la pantalla:
//   · Apagar la cámara SIN marcar pausa es un problema. Es la forma más fácil
//     de desaparecer y era justo la que no avisaba.
//   · Con pausa marcada NO se molesta. La persona avisó que se iba; reclamarle
//     sería castigarla por haber usado bien el botón.
//   · `unavailable` (no cargó el detector en su equipo) NO es culpa suya y no
//     se le reclama nada.
//   · Las frases ROTAN. Repetir la misma cada minuto y medio la vuelve ruido de
//     fondo que el oído filtra, y entonces el aviso deja de servir.

const toastWarning = vi.fn();
const sonido = vi.fn();
const habla = vi.fn();
let pausa = false;

vi.mock("sonner", () => ({ toast: { warning: (...a: unknown[]) => toastWarning(...a) } }));
vi.mock("@/lib/notificationSound", () => ({ playMessageNotification: (...a: unknown[]) => sonido(...a) }));
vi.mock("@/lib/voz", () => ({ hablar: (...a: unknown[]) => habla(...a) }));
vi.mock("@/lib/coworkPausa", () => ({ estaEnPausa: () => pausa, marcarPausa: (v: boolean) => { pausa = v; } }));

const { useFaceNudge, esProblemaDeEncuadre } = await import("@/hooks/useFaceNudge");

/** Monta el supervisor con el problema empezado hace `segundos`. */
function supervisar(state: string, segundos: number, enPausaProp?: boolean) {
  return renderHook(() =>
    useFaceNudge({ state, since: Date.now() - segundos * 1000 } as never, enPausaProp),
  );
}

describe("supervisor de encuadre", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    toastWarning.mockClear(); sonido.mockClear(); habla.mockClear();
    pausa = false;
  });
  afterEach(() => vi.useRealTimers());

  it("la cámara apagada cuenta como problema", () => {
    expect(esProblemaDeEncuadre("cam_off")).toBe(true);
    expect(esProblemaDeEncuadre("no_face")).toBe(true);
    expect(esProblemaDeEncuadre("ok")).toBe(false);
    // No es culpa de la persona: no se le reclama.
    expect(esProblemaDeEncuadre("unavailable")).toBe(false);
  });

  it("al minuto y medio con la cámara apagada avisa, y en silencio", () => {
    supervisar("cam_off", 95);
    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(toastWarning.mock.calls[0][0]).toMatch(/cámara apagada/i);
    // El primero no suena: un descuido de un minuto no amerita ruido.
    expect(sonido).not.toHaveBeenCalled();
    expect(habla).not.toHaveBeenCalled();
  });

  it("a los tres minutos suena y habla, y ofrece las DOS salidas", () => {
    supervisar("cam_off", 200);
    expect(sonido).toHaveBeenCalledTimes(1);
    expect(habla).toHaveBeenCalledTimes(1);
    const frase = habla.mock.calls[0][0] as string;
    // Pedir solo "prendé la cámara" le deja a quien se tuvo que levantar la
    // única opción de ignorar el aviso.
    expect(frase.toLowerCase()).toMatch(/c[áa]mara/);
    expect(frase.toLowerCase()).toMatch(/break|baño|pausa/);
  });

  it("con pausa marcada NO molesta, aunque la cámara esté apagada", () => {
    pausa = true;
    supervisar("cam_off", 600);
    expect(toastWarning).not.toHaveBeenCalled();
    expect(sonido).not.toHaveBeenCalled();
    expect(habla).not.toHaveBeenCalled();
  });

  it("tampoco molesta si la pausa llega por prop", () => {
    supervisar("no_face", 600, true);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("no dice nada si el detector no cargó: no es culpa de la persona", () => {
    supervisar("unavailable", 600);
    expect(toastWarning).not.toHaveBeenCalled();
    expect(habla).not.toHaveBeenCalled();
  });

  it("antes del minuto y medio se queda callado", () => {
    supervisar("no_face", 30);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("las frases rotan: dos episodios seguidos no dicen lo mismo", () => {
    const a = supervisar("cam_off", 200); a.unmount();
    const b = supervisar("cam_off", 200); b.unmount();
    expect(habla).toHaveBeenCalledTimes(2);
    // El índice NO se reinicia entre episodios, justamente para esto.
    expect(habla.mock.calls[0][0]).not.toBe(habla.mock.calls[1][0]);
  });

  it("avisa al coordinador una sola vez, recién a los tres minutos", () => {
    const alCoordinador = vi.fn();
    renderHook(() =>
      useFaceNudge({ state: "cam_off", since: Date.now() - 200_000 } as never, false, alCoordinador),
    );
    expect(alCoordinador).toHaveBeenCalledTimes(1);
    expect(alCoordinador.mock.calls[0][0]).toBeGreaterThanOrEqual(180);
  });
});
