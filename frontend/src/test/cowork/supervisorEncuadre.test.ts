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

const { useFaceNudge, esProblemaDeEncuadre, useScreenShareNudge, debeAvisarSinPantalla, AVISAR_SUPERVISOR_SIN_PANTALLA_MS } = await import("@/hooks/useFaceNudge");

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

  it("al minuto y medio con la cámara apagada avisa, y YA habla", () => {
    supervisar("cam_off", 95);
    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(toastWarning.mock.calls[0][0]).toMatch(/cámara apagada/i);
    // Antes el primero era mudo. Se cambió, y el motivo importa: si estás sin
    // luz o fuera de cuadro, lo más probable es que NO estés mirando la
    // pantalla — que es justo por lo que el detector se quejó. Un cartel para
    // alguien que no mira la pantalla es un cartel para nadie.
    expect(sonido).toHaveBeenCalled();
    expect(habla).toHaveBeenCalled();
  });

  it("a los tres minutos suena y habla, y ofrece las DOS salidas", () => {
    supervisar("cam_off", 200);
    expect(sonido).toHaveBeenCalled();
    expect(habla).toHaveBeenCalled();
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

// El aviso de compartir pantalla. En Cowork la pantalla es la mitad del
// trabajo: sin ella el supervisor ve una cara pero no QUÉ está haciendo.
describe("aviso de compartir pantalla", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); toastWarning.mockClear(); habla.mockClear(); pausa = false; });
  afterEach(() => vi.useRealTimers());

  it("no dice nada antes de los 2 minutos", () => {
    renderHook(() => useScreenShareNudge(false, true));
    vi.advanceTimersByTime(100_000);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("a los 2 minutos avisa y habla", () => {
    renderHook(() => useScreenShareNudge(false, true));
    vi.advanceTimersByTime(125_000);
    expect(toastWarning).toHaveBeenCalled();
    expect(habla).toHaveBeenCalled();
    expect((habla.mock.calls[0][0] as string).toLowerCase()).toMatch(/pantalla/);
  });

  it("si está compartiendo no molesta nunca", () => {
    renderHook(() => useScreenShareNudge(true, true));
    vi.advanceTimersByTime(400_000);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("en pausa se calla: quien avisó que se iba no tiene que compartir nada", () => {
    pausa = true;
    renderHook(() => useScreenShareNudge(false, true));
    vi.advanceTimersByTime(400_000);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("las frases rotan", () => {
    const a = renderHook(() => useScreenShareNudge(false, true));
    vi.advanceTimersByTime(125_000); a.unmount();
    const b = renderHook(() => useScreenShareNudge(false, true));
    vi.advanceTimersByTime(125_000); b.unmount();
    expect(habla).toHaveBeenCalledTimes(2);
    expect(habla.mock.calls[0][0]).not.toBe(habla.mock.calls[1][0]);
  });
});

// Lo que el supervisor ve. La persona ya recibía su aviso a los dos minutos,
// pero al supervisor NO le llegaba nada: sabía quién no estaba en cámara y no
// sabía quién no estaba compartiendo. Es el mismo hueco que tenía el encuadre
// antes de arreglarlo — el sistema sabía y solo se lo decía a quien ya lo sabe.
describe("avisarle al supervisor que alguien no comparte pantalla", () => {
  const AHORA = 1_800_000_000_000;
  const haceMinutos = (m: number) => AHORA - m * 60_000;

  it("a los cinco minutos sí", () => {
    expect(debeAvisarSinPantalla({ screenShareOn: false, screenShareSince: haceMinutos(5) }, AHORA)).toBe(true);
  });

  it("a los dos minutos todavía no: es el turno de la persona, no del supervisor", () => {
    // A los 2 min recién recibe SU primer aviso; a los 4 el segundo. Avisarle
    // al supervisor antes es interrumpirlo por algo que la persona no tuvo
    // chance de corregir.
    expect(debeAvisarSinPantalla({ screenShareOn: false, screenShareSince: haceMinutos(2) }, AHORA)).toBe(false);
  });

  it("si está compartiendo, nunca", () => {
    expect(debeAvisarSinPantalla({ screenShareOn: true, screenShareSince: haceMinutos(30) }, AHORA)).toBe(false);
  });

  it("en pausa se calla, aunque lleve media hora", () => {
    expect(debeAvisarSinPantalla({ screenShareOn: false, onBreak: true, screenShareSince: haceMinutos(30) }, AHORA)).toBe(false);
  });

  it("sin sello de tiempo no acusa a nadie", () => {
    // "No comparte" y "acaba de entrar" se ven igual hasta que hay sello.
    expect(debeAvisarSinPantalla({ screenShareOn: false, screenShareSince: null }, AHORA)).toBe(false);
    expect(debeAvisarSinPantalla(undefined, AHORA)).toBe(false);
  });

  it("el umbral del supervisor es MAYOR que el de la persona", () => {
    // Si se invirtieran, el supervisor se enteraría antes que el interesado.
    expect(AVISAR_SUPERVISOR_SIN_PANTALLA_MS).toBeGreaterThan(120_000);
  });
});

// Por qué el aviso "dejaba de andar" después de la primera vez.
describe("marcas de ya-avisé del supervisor", () => {
  it("olvida a quien se fue, para poder volver a avisarle", async () => {
    const { olvidarAusentes } = await import("@/lib/avisosSupervisor");
    const marcas = new Set(["ana", "beto"]);
    // Beto cerró Cowork: ya no está en presence.
    olvidarAusentes(marcas, { ana: {} });
    expect(marcas.has("beto")).toBe(false);
    // Ana sigue conectada: su marca se respeta, no se le vuelve a avisar.
    expect(marcas.has("ana")).toBe(true);
  });

  it("sin esto, quien se va y vuelve no volvería a disparar el aviso NUNCA", async () => {
    const { olvidarAusentes } = await import("@/lib/avisosSupervisor");
    const marcas = new Set<string>(["beto"]);
    olvidarAusentes(marcas, {});          // se fue
    expect(marcas.size).toBe(0);
    // Vuelve con la cámara apagada: como ya no hay marca, el hub avisa de nuevo.
    expect(marcas.has("beto")).toBe(false);
  });

  it("no inventa marcas para gente presente que nunca tuvo problema", async () => {
    const { olvidarAusentes } = await import("@/lib/avisosSupervisor");
    const marcas = new Set<string>();
    olvidarAusentes(marcas, { ana: {}, beto: {} });
    expect(marcas.size).toBe(0);
  });
});
