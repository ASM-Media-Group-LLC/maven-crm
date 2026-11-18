// Modo ahorro: la llamada se acomoda al internet de subida (lib/modoAhorro.ts, 11/11/2026).
import { describe, it, expect } from "vitest";
import { AHORRO_INICIAL, siguienteAhorro, type EstadoAhorro } from "@/lib/modoAhorro";

const lenta = { subida_kbps: 500, limite_cam: "bandwidth", limite_pant: "bandwidth" };
const holgada = { subida_kbps: 4000, limite_cam: "none", limite_pant: "none" };
const pasar = (e: EstadoAhorro, ...ms: Array<typeof lenta>) => ms.reduce(siguienteAhorro, e);

describe("modo ahorro según el internet de subida", () => {
  it("un minuto malo suelto no lo prende", () => {
    expect(pasar(AHORRO_INICIAL, lenta).activo).toBe(false);
  });
  it("dos minutos seguidos de subida lenta lo prenden", () => {
    expect(pasar(AHORRO_INICIAL, lenta, lenta).activo).toBe(true);
  });
  it("prendido, no se apaga por un minuto bueno: hacen falta 5 seguidos", () => {
    const prendido = pasar(AHORRO_INICIAL, lenta, lenta);
    expect(pasar(prendido, holgada, holgada, holgada, holgada).activo).toBe(true);
    expect(pasar(prendido, holgada, holgada, holgada, holgada, holgada).activo).toBe(false);
  });
  it("la «subida» enorme que informa WebRTC sin video mandándose no cuenta como holgada", () => {
    const prendido = pasar(AHORRO_INICIAL, lenta, lenta);
    const sinVideo = { subida_kbps: 1_000_000, limite_cam: null as unknown as string, limite_pant: null as unknown as string };
    expect(pasar(prendido, sinVideo, sinVideo, sinVideo, sinVideo, sinVideo).activo).toBe(true);
  });
  it("con buen internet nunca se prende", () => {
    expect(pasar(AHORRO_INICIAL, holgada, holgada, holgada).activo).toBe(false);
  });
  // 17/11/2026: la subida es lo que la llamada USA. Una pantalla quieta a 5 fps
  // usa poco con cualquier internet; eso prendía el ahorro a todos y lo dejaba pegado.
  it("usar poca subida sin que el navegador esté limitado NO prende el ahorro", () => {
    const quieta = { subida_kbps: 300, limite_cam: "none", limite_pant: "none" };
    expect(pasar(AHORRO_INICIAL, quieta, quieta, quieta, quieta).activo).toBe(false);
  });
  it("prendido, se apaga con 5 minutos sin limitación aunque la llamada use poco", () => {
    const prendido = pasar(AHORRO_INICIAL, lenta, lenta);
    const quieta = { subida_kbps: 300, limite_cam: "none", limite_pant: "none" };
    expect(pasar(prendido, quieta, quieta, quieta, quieta, quieta).activo).toBe(false);
  });
});
