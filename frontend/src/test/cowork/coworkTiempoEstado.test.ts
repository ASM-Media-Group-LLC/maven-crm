import { describe, it, expect } from "vitest";
import { estadoDeTiempo, cuentaComoTrabajo, UMBRAL_FUERA_DE_CAMARA_MS, INTERVALO_LATIDO_MS, LATIDO_VENCIDO_MS, ESTADOS_TIEMPO } from "@/lib/coworkTiempoRegla";
// La edge tiene SU copia (el frontend no puede importar de supabase/: el build
// de Dokploy excluye esa carpeta). Acá se comprueba que digan lo mismo.
import * as edge from "../../../../supabase/functions/_shared/cowork-tiempo";

const T = 1_700_000_000_000;
const base = { camOn: true, screenShareOn: true, faceState: "ok", faceSince: T - 10 * 60_000 };

describe("estadoDeTiempo — cuándo corre el reloj de Cowork", () => {
  it("corre con cámara + pantalla y alguien delante", () => {
    expect(estadoDeTiempo(base, T)).toEqual({ estado: "activo", detalle: "ok" });
    expect(cuentaComoTrabajo("activo")).toBe(true);
  });
  it("se detiene sin cámara, sin pantalla o en pausa (en ese orden de prioridad)", () => {
    expect(estadoDeTiempo({ ...base, camOn: false }, T).estado).toBe("sin_camara");
    expect(estadoDeTiempo({ ...base, screenShareOn: false }, T).estado).toBe("sin_pantalla");
    expect(estadoDeTiempo({ ...base, onBreak: true, camOn: false }, T).estado).toBe("pausa");
    expect(cuentaComoTrabajo("pausa")).toBe(false);
  });
  it("mal encuadre y poca luz NO detienen el reloj (son alertas, no ausencia)", () => {
    expect(estadoDeTiempo({ ...base, faceState: "too_small" }, T).estado).toBe("activo");
    expect(estadoDeTiempo({ ...base, faceState: "too_dark" }, T).estado).toBe("activo");
  });
  it("'no hay nadie' detiene el reloj solo después del umbral de tolerancia", () => {
    const recien = { ...base, faceState: "no_face", faceSince: T - 5_000 };
    expect(estadoDeTiempo(recien, T).estado).toBe("activo");
    const hace1min = { ...base, faceState: "no_face", faceSince: T - UMBRAL_FUERA_DE_CAMARA_MS };
    expect(estadoDeTiempo(hace1min, T)).toEqual({ estado: "fuera_de_camara", detalle: "no_face" });
  });
  it("un faceSince del futuro o ausente cuenta como 'recién'", () => {
    expect(estadoDeTiempo({ ...base, faceState: "no_face", faceSince: T + 99_000 }, T).estado).toBe("activo");
    expect(estadoDeTiempo({ ...base, faceState: "no_face", faceSince: null }, T).estado).toBe("activo");
  });

  it("el umbral es configurable: con 30 s se detiene antes, con 300 s aguanta más", () => {
    const hace45 = { ...base, faceState: "no_face", faceSince: T - 45_000 };
    expect(estadoDeTiempo(hace45, T, 30_000).estado).toBe("fuera_de_camara");
    expect(estadoDeTiempo(hace45, T, 60_000).estado).toBe("activo");
    expect(estadoDeTiempo(hace45, T, 300_000).estado).toBe("activo");
  });

  it("la copia del frontend y la de la edge dicen EXACTAMENTE lo mismo", () => {
    expect(UMBRAL_FUERA_DE_CAMARA_MS).toBe(edge.UMBRAL_FUERA_DE_CAMARA_MS);
    expect(INTERVALO_LATIDO_MS).toBe(edge.INTERVALO_LATIDO_MS);
    expect(LATIDO_VENCIDO_MS).toBe(edge.LATIDO_VENCIDO_MS);
    expect([...ESTADOS_TIEMPO]).toEqual([...edge.ESTADOS_TIEMPO]);
    const casos: Array<[Parameters<typeof estadoDeTiempo>[0], number | undefined]> = [];
    for (const camOn of [true, false]) for (const screenShareOn of [true, false]) for (const onBreak of [true, false, undefined])
      for (const faceState of ["ok", "no_face", "too_small", "too_dark", null, undefined])
        for (const faceSince of [T - 5_000, T - 60_000, T - 600_000, T + 1_000, null, undefined])
          for (const umbral of [undefined, 30_000, 300_000])
            casos.push([{ camOn, screenShareOn, onBreak, faceState, faceSince }, umbral]);
    for (const [l, umbral] of casos) {
      expect(estadoDeTiempo(l, T, umbral)).toEqual(edge.estadoDeTiempo(l, T, umbral));
    }
    expect(casos.length).toBeGreaterThan(500);
  });
});
