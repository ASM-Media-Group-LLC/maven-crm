import { describe, it, expect } from "vitest";
import { calcularNota, bandaDeNota } from "@/lib/notaEmpleado";

// La nota diaria del Monitor IA (Argos) responde "¿trabajó full, sí o no?". Se
// arma de 4 factores con peso: pantalla 30, cámara 30, atención 30, horas 10.
// REGLA DURA: sin compartir pantalla → tope 50 (rojo). Cuando falta un dato, su
// peso se REPARTE. Este guard ata ese comportamiento (del que dependen decisiones
// de personal, así que tiene que ser exacto).

describe("nota diaria del empleado (Monitor IA)", () => {
  it("bandas de color por umbral (80 / 60)", () => {
    expect(bandaDeNota(91)).toBe("bien");
    expect(bandaDeNota(80)).toBe("bien");
    expect(bandaDeNota(79)).toBe("ojo");
    expect(bandaDeNota(60)).toBe("ojo");
    expect(bandaDeNota(59)).toBe("mal");
    expect(bandaDeNota(0)).toBe("mal");
  });

  it("alguien full (pantalla, cámara, atención, 8h) saca 100 verde", () => {
    const n = calcularNota({ pantallaPct: 1, camaraPct: 1, atencionPct: 1, horasHechas: 8 });
    expect(n.valor).toBe(100);
    expect(n.banda).toBe("bien");
  });

  it("los pesos son pantalla 30 / cámara 30 / atención 30 / horas 10", () => {
    const n = calcularNota({ pantallaPct: 1, camaraPct: 1, atencionPct: 1, horasHechas: 8 });
    const porClave = Object.fromEntries(n.factores.map((f) => [f.clave, f.peso]));
    expect(porClave.pantalla).toBeCloseTo(0.3);
    expect(porClave.camara).toBeCloseTo(0.3);
    expect(porClave.atencion).toBeCloseTo(0.3);
    expect(porClave.horas).toBeCloseTo(0.1);
  });

  it("REGLA DURA: sin compartir pantalla, aunque lo demás sea perfecto, tope 50 (rojo)", () => {
    const n = calcularNota({ pantallaPct: 0, camaraPct: 1, atencionPct: 1, horasHechas: 8 });
    expect(n.valor).toBeLessThanOrEqual(50);
    expect(n.banda).toBe("mal");
  });

  it("compartir poca pantalla también activa el tope 50", () => {
    const n = calcularNota({ pantallaPct: 0.02, camaraPct: 1, atencionPct: 1, horasHechas: 8 });
    expect(n.valor).toBeLessThanOrEqual(50);
  });

  it("la cámara apagada baja la nota (pesa 30)", () => {
    const conCam = calcularNota({ pantallaPct: 1, camaraPct: 1, atencionPct: 1, horasHechas: 8 });
    const sinCam = calcularNota({ pantallaPct: 1, camaraPct: 0, atencionPct: 1, horasHechas: 8 });
    expect(sinCam.valor!).toBeLessThan(conCam.valor!);
    expect(sinCam.valor).toBe(70); // (100*.3 + 0*.3 + 100*.3 + 100*.1)
  });

  it("la atención (pantalla = ocio) baja la nota", () => {
    const enLoSuyo = calcularNota({ pantallaPct: 1, camaraPct: 1, atencionPct: 1, horasHechas: 8 });
    const distraido = calcularNota({ pantallaPct: 1, camaraPct: 1, atencionPct: 0.3, horasHechas: 8 });
    expect(distraido.valor!).toBeLessThan(enLoSuyo.valor!);
  });

  it("horas cumplidas se miden contra la meta de 8 h", () => {
    const n = calcularNota({ pantallaPct: 1, camaraPct: 1, atencionPct: 1, horasHechas: 4 });
    const horas = n.factores.find((f) => f.clave === "horas")!;
    expect(horas.sub).toBe(50); // 4/8
  });

  it("un factor sin dato REPARTE su peso (no castiga)", () => {
    // Sin dato de atención (no hubo pantallazos juzgados aún): pantalla+cámara+horas perfectos → 100.
    const n = calcularNota({ pantallaPct: 1, camaraPct: 1, horasHechas: 8 });
    const at = n.factores.find((f) => f.clave === "atencion")!;
    expect(at.sub).toBeNull();
    expect(n.valor).toBe(100);
  });

  it("sin NINGÚN dato (solo horas 0) la nota no es null porque horas siempre hay", () => {
    const n = calcularNota({ horasHechas: 0 });
    // horas es el único con dato → nota = 0; sin dato de pantalla, no aplica tope.
    expect(n.valor).toBe(0);
    expect(n.banda).toBe("mal");
  });

  it("alguien que va mal (sin pantalla, poca cámara, distraído) saca rojo", () => {
    const n = calcularNota({ pantallaPct: 0, camaraPct: 0.2, atencionPct: 0.3, horasHechas: 2 });
    expect(n.banda).toBe("mal");
    expect(n.valor!).toBeLessThan(60);
  });
});
