import { describe, it, expect } from "vitest";
import { estadoDeTiempo, cuentaComoTrabajo, UMBRAL_FUERA_DE_CAMARA_MS } from "../../../../supabase/functions/_shared/cowork-tiempo";

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
});
