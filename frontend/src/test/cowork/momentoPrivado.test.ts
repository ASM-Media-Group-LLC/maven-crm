import { afterEach, describe, expect, it } from "vitest";
import {
  empezarMomentoPrivado, estaEnMomentoPrivado, minutosDisponibles, momentoPrivadoGuardado, terminarMomentoPrivado,
} from "@/lib/momentoPrivado";
import { olvidarOrdenesDePausa, ultimaOrdenDePausa } from "@/lib/ordenesDePausa";

// «MOMENTO PRIVADO» (Alvaro, 19/11/2026): un toque apaga cámara, micrófono y
// pantalla; Argos no insiste mientras dure; gasta de la gracia; al acabarse solo
// no se prende nada (la llamada «suelta») y Argos vuelve a pedir la cámara.
const avisos = import.meta.glob("../../hooks/useFaceNudge.ts", { query: "?raw", import: "default", eager: true });
const llamados = import.meta.glob("../../hooks/useRegistrarLlamados.ts", { query: "?raw", import: "default", eager: true });
const tablero = import.meta.glob("../../pages/cowork/CoworkHostDashboard.tsx", { query: "?raw", import: "default", eager: true });
const fuente = (m: Record<string, unknown>) => Object.values(m)[0] as string;

afterEach(() => { terminarMomentoPrivado(); olvidarOrdenesDePausa(); });

describe("momento privado", () => {
  it("dura lo que queda de gracia en lo que el puesto pide (la menor)", () => {
    expect(minutosDisponibles({ camara: true, pantalla: true }, { camara: 12, pantalla: 4 })).toBe(4);
    expect(minutosDisponibles({ camara: true, pantalla: false }, { camara: 12, pantalla: 0 })).toBe(12);
    expect(minutosDisponibles({ camara: false, pantalla: false }, { camara: 12, pantalla: 4 })).toBeNull();
    expect(minutosDisponibles({ camara: true, pantalla: true }, { camara: 0, pantalla: 9 })).toBe(0);
  });

  it("sin minutos no empieza; con minutos dura hasta que se acaban", () => {
    expect(empezarMomentoPrivado(0)).toBe(false);
    const t0 = 1_000_000;
    expect(empezarMomentoPrivado(5, t0)).toBe(true);
    expect(momentoPrivadoGuardado()).toBe(t0 + 5 * 60_000);
    expect(estaEnMomentoPrivado(t0 + 4 * 60_000)).toBe(true);
  });

  it("al acabarse solo, la llamada suelta lo apagado sin prender nada", () => {
    const t0 = 2_000_000;
    empezarMomentoPrivado(1, t0);
    expect(estaEnMomentoPrivado(t0 + 61_000)).toBe(false);
    expect(ultimaOrdenDePausa()).toBe("soltar");
    expect(momentoPrivadoGuardado()).toBeNull();
  });

  it("Argos no insiste, no anota llamados y el supervisor no recibe alarmas mientras dure", () => {
    expect(fuente(avisos)).toContain("estaEnPausa() || estaEnMomentoPrivado() || estaEnLlamadaDeMaven()");
    expect(fuente(llamados)).toContain("estaEnPausa() || estaEnMomentoPrivado() || estaEnLlamadaDeMaven()");
    const t = fuente(tablero);
    expect(t).toContain("if (enMomentoPrivado(ms)) return null;");
    expect(t).toContain("!enMomentoPrivado(ms) && !salaCaidaEn(ms)");
  });
});
