import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizarReglas, detectarPreset, sonEstandar, paraGuardar, reglaDeEstado, reglaDeLlamado,
  textoSegundos, fijarReglas, reglasActuales, REGLAS_ESTANDAR, PRESETS, umbralFueraDeCamaraMs,
} from "@/lib/coworkReglas";

// Las reglas de Cowork por sesión. Lo que se fija acá son las garantías que no
// se ven en la pantalla:
//   · Una fila rota, vieja o a medias NUNCA deja a una sesión sin supervisión:
//     lo que falte toma el estándar, lo que se pase se acota.
//   · El nombre del preset no manda: si alguien tocó un número, es
//     Personalizado aunque la fila diga "estandar".
//   · El estándar se guarda como null, para que una sesión sin reglas propias
//     siga al estándar aunque este cambie mañana.

describe("reglas de Cowork por sesión", () => {
  beforeEach(() => fijarReglas(null));

  it("sin reglas propias, la sesión sigue al estándar", () => {
    expect(normalizarReglas(null)).toEqual(REGLAS_ESTANDAR);
    expect(normalizarReglas(undefined)).toEqual(REGLAS_ESTANDAR);
    expect(reglasActuales()).toEqual(REGLAS_ESTANDAR);
  });

  it("una fila a medias toma el estándar para lo que falta", () => {
    const r = normalizarReglas({ pantalla: { activa: false } });
    expect(r.pantalla.activa).toBe(false);
    expect(r.pantalla.primerAvisoSeg).toBe(120);       // lo que faltaba
    expect(r.camara).toEqual(REGLAS_ESTANDAR.camara);  // lo que no vino
    expect(r.preset).toBe("personalizado");
  });

  it("un número fuera de rango se acota, y basura cae al estándar", () => {
    const r = normalizarReglas({ camara: { primerAvisoSeg: 5, repetirSeg: "muchísimo", supervisorSeg: 99999 } });
    expect(r.camara.primerAvisoSeg).toBe(30);     // mínimo
    expect(r.camara.repetirSeg).toBe(90);         // estándar
    expect(r.camara.supervisorSeg).toBe(3600);    // máximo
  });

  it("null en supervisorSeg quiere decir NUNCA, y se respeta", () => {
    const r = normalizarReglas({ camara: { supervisorSeg: null }, pausas: { supervisorSeg: null } });
    expect(r.camara.supervisorSeg).toBeNull();
    expect(r.pausas.supervisorSeg).toBeNull();
  });

  it("el preset lo dicen los valores, no la etiqueta guardada", () => {
    // Dice estándar pero cambió un número: es personalizado.
    expect(normalizarReglas({ preset: "estandar", camara: { primerAvisoSeg: 60 } }).preset).toBe("personalizado");
    // Dice cualquier cosa pero los valores son los de Relajado: es relajado.
    expect(normalizarReglas({ preset: "lo-que-sea", ...PRESETS.relajado }).preset).toBe("relajado");
    expect(detectarPreset(PRESETS.estricto)).toBe("estricto");
  });

  it("el estándar se guarda como null; lo demás, con su preset recalculado", () => {
    expect(paraGuardar(REGLAS_ESTANDAR)).toBeNull();
    expect(paraGuardar({ ...REGLAS_ESTANDAR, preset: "personalizado" })).toBeNull();  // mismos valores
    const propio = paraGuardar({ ...REGLAS_ESTANDAR, pantalla: { ...REGLAS_ESTANDAR.pantalla, activa: false } });
    expect(propio?.preset).toBe("personalizado");
    expect(sonEstandar(normalizarReglas(propio))).toBe(false);
  });

  it("cada estado del detector cae en su regla", () => {
    const r = REGLAS_ESTANDAR;
    expect(reglaDeEstado(r, "cam_off")).toBe(r.camara);
    expect(reglaDeEstado(r, "no_face")).toBe(r.encuadre);
    expect(reglaDeEstado(r, "too_small")).toBe(r.encuadre);
    expect(reglaDeEstado(r, "too_dark")).toBe(r.encuadre);
    expect(reglaDeEstado(r, "ok")).toBeNull();
    expect(reglaDeEstado(r, "unavailable")).toBeNull();   // no es culpa de la persona
    expect(reglaDeLlamado(r, "luz")).toBe(r.encuadre);
    expect(reglaDeLlamado(r, "pantalla")).toBe(r.pantalla);
  });

  it("el store entrega lo último que fijó la página", () => {
    fijarReglas(PRESETS.relajado);
    expect(reglasActuales().pantalla.activa).toBe(false);
    fijarReglas(null);
    expect(reglasActuales()).toEqual(REGLAS_ESTANDAR);
  });

  it("los tiempos se leen como en un reloj", () => {
    expect(textoSegundos(90)).toBe("1:30");
    expect(textoSegundos(300)).toBe("5:00");
    expect(textoSegundos(null)).toBe("Nunca");
  });

  it("el reloj: 60 s por defecto, ajustable por sesión, y tocarlo es Personalizado", () => {
    expect(REGLAS_ESTANDAR.reloj.fueraDeCamaraSeg).toBe(60);
    expect(umbralFueraDeCamaraMs(REGLAS_ESTANDAR)).toBe(60_000);
    // Una fila guardada ANTES de que existiera el reloj sigue siendo su preset.
    const vieja = normalizarReglas({ ...PRESETS.estricto, reloj: undefined });
    expect(vieja.preset).toBe("estricto");
    const conReloj = normalizarReglas({ reloj: { fueraDeCamaraSeg: 120 } });
    expect(conReloj.reloj.fueraDeCamaraSeg).toBe(120);
    expect(conReloj.preset).toBe("personalizado");
    expect(paraGuardar(conReloj)?.reloj.fueraDeCamaraSeg).toBe(120);
    // Basura y fuera de rango: al estándar o acotado.
    expect(normalizarReglas({ reloj: { fueraDeCamaraSeg: "x" } }).reloj.fueraDeCamaraSeg).toBe(60);
    expect(normalizarReglas({ reloj: { fueraDeCamaraSeg: 5 } }).reloj.fueraDeCamaraSeg).toBe(30);
  });
});
