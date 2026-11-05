import { describe, it, expect } from "vitest";
import { calcularNota, bandaDeNota, fraccionJornada, EXENTO_SEG } from "@/lib/notaEmpleado";

// La nota diaria del Monitor IA (Argos) responde "¿trabajó full el turno, sí o no?".
// (v2, Alvaro 05/11) Tres factores con peso: pantalla 45, cámara 35, distracción 20.
// Las horas van METIDAS dentro de pantalla/cámara (se miden sobre la jornada de 8 h
// menos la pausa libre). REGLA DURA: sin compartir pantalla → tope 50 (rojo). Cuando
// falta un dato, su peso se REPARTE. Este guard ata ese comportamiento (del que
// dependen decisiones de personal, así que tiene que ser exacto).

describe("nota diaria del empleado (Monitor IA)", () => {
  it("bandas de color por umbral (80 / 60)", () => {
    expect(bandaDeNota(91)).toBe("bien");
    expect(bandaDeNota(80)).toBe("bien");
    expect(bandaDeNota(79)).toBe("ojo");
    expect(bandaDeNota(60)).toBe("ojo");
    expect(bandaDeNota(59)).toBe("mal");
    expect(bandaDeNota(0)).toBe("mal");
  });

  it("alguien full (pantalla, cámara, en lo suyo) saca 100 verde", () => {
    const n = calcularNota({ pantallaPct: 1, camaraPct: 1, atencionPct: 1 });
    expect(n.valor).toBe(100);
    expect(n.banda).toBe("bien");
  });

  it("los pesos son pantalla 45 / cámara 35 / distracción 20 (sin factor horas)", () => {
    const n = calcularNota({ pantallaPct: 1, camaraPct: 1, atencionPct: 1 });
    const porClave = Object.fromEntries(n.factores.map((f) => [f.clave, f.peso]));
    expect(porClave.pantalla).toBeCloseTo(0.45);
    expect(porClave.camara).toBeCloseTo(0.35);
    expect(porClave.atencion).toBeCloseTo(0.2);
    expect(porClave.horas).toBeUndefined(); // las horas ya no son un factor aparte
    expect(n.factores).toHaveLength(3);
  });

  it("REGLA DURA: sin compartir pantalla, aunque lo demás sea perfecto, tope 50 (rojo)", () => {
    const n = calcularNota({ pantallaPct: 0, camaraPct: 1, atencionPct: 1 });
    expect(n.valor).toBeLessThanOrEqual(50);
    expect(n.banda).toBe("mal");
  });

  it("compartir poca pantalla también activa el tope 50", () => {
    const n = calcularNota({ pantallaPct: 0.02, camaraPct: 1, atencionPct: 1 });
    expect(n.valor).toBeLessThanOrEqual(50);
  });

  it("la cámara apagada baja la nota (pesa 35)", () => {
    const conCam = calcularNota({ pantallaPct: 1, camaraPct: 1, atencionPct: 1 });
    const sinCam = calcularNota({ pantallaPct: 1, camaraPct: 0, atencionPct: 1 });
    expect(sinCam.valor!).toBeLessThan(conCam.valor!);
    expect(sinCam.valor).toBe(65); // 100*.45 + 0*.35 + 100*.20
  });

  it("la distracción (pantalla fuera de lugar) baja la nota", () => {
    const enLoSuyo = calcularNota({ pantallaPct: 1, camaraPct: 1, atencionPct: 1 });
    const distraido = calcularNota({ pantallaPct: 1, camaraPct: 1, atencionPct: 0.3 });
    expect(distraido.valor!).toBeLessThan(enLoSuyo.valor!);
  });

  it("medio turno de pantalla/cámara ≈ 50 (las horas van metidas en el denominador)", () => {
    // La jornada útil = 8 h − pausa libre. Medio turno de segundos → ~50 %.
    const mediaJornadaSeg = (8 * 3600 - EXENTO_SEG) / 2;
    const medio = fraccionJornada(mediaJornadaSeg);
    expect(medio).toBeCloseTo(0.5, 2);
    const n = calcularNota({ pantallaPct: medio, camaraPct: medio, atencionPct: 1 });
    // pantalla 50*.45 + cámara 50*.35 + distracción 100*.20 = 60
    expect(n.valor).toBe(60);
  });

  it("fraccionJornada: turno completo compartido llega a 100 %, y tope en 1", () => {
    const jornadaUtil = 8 * 3600 - EXENTO_SEG;
    expect(fraccionJornada(jornadaUtil)).toBeCloseTo(1, 3);
    expect(fraccionJornada(jornadaUtil * 2)).toBe(1); // nunca pasa de 1
    expect(fraccionJornada(0)).toBe(0);
  });

  it("un factor sin dato REPARTE su peso (no castiga)", () => {
    // Sin dato de distracción (no hubo pantallazos juzgados aún): pantalla+cámara perfectas → 100.
    const n = calcularNota({ pantallaPct: 1, camaraPct: 1 });
    const at = n.factores.find((f) => f.clave === "atencion")!;
    expect(at.sub).toBeNull();
    expect(n.valor).toBe(100);
  });

  it("sin NINGÚN dato la nota es null", () => {
    const n = calcularNota({});
    expect(n.valor).toBeNull();
    expect(n.banda).toBeNull();
  });

  it("alguien que va mal (sin pantalla, poca cámara, distraído) saca rojo", () => {
    const n = calcularNota({ pantallaPct: 0, camaraPct: 0.2, atencionPct: 0.3 });
    expect(n.banda).toBe("mal");
    expect(n.valor!).toBeLessThan(60);
  });
});
