import { describe, it, expect } from "vitest";
import { calcularNota, bandaDeNota, fraccionConectado, fraccionJornada, EXENTO_SEG } from "@/lib/notaEmpleado";

// v3 (Alvaro, 18/11/2026): seis partes — llamados de Argos 25, atención 20,
// pantalla 15, puntualidad 15, en su puesto 15, cámara 10 — y pantalla/cámara
// sobre el tiempo CONECTADO. Lo de abajo describe la v2 (historia).
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

  it("v3 (18/11/2026): llamados 25 · atención 20 · pantalla 15 · puntualidad 15 · en su puesto 15 · cámara 10", () => {
    const n = calcularNota({ pantallaPct: 1, camaraPct: 1, atencionPct: 1, tardeMin: null, llamados: 0, escalados: 0, minFuera: 0 });
    const porClave = Object.fromEntries(n.factores.map((f) => [f.clave, f.peso]));
    expect(porClave.llamados).toBeCloseTo(0.25);
    expect(porClave.atencion).toBeCloseTo(0.2);
    expect(porClave.pantalla).toBeCloseTo(0.15);
    expect(porClave.puntualidad).toBeCloseTo(0.15);
    expect(porClave.puesto).toBeCloseTo(0.15);
    expect(porClave.camara).toBeCloseTo(0.1);
    expect(n.factores.reduce((a, f) => a + f.peso, 0)).toBeCloseTo(1);
    expect(n.valor).toBe(100);
  });

  it("cada llamado de Argos resta; si lo reportó al supervisor, el doble", () => {
    const base = { pantallaPct: 1, camaraPct: 1, atencionPct: 1, tardeMin: null, minFuera: 0 } as const;
    expect(calcularNota({ ...base, llamados: 2, escalados: 0 }).valor).toBe(93); // 25 → 17,5
    expect(calcularNota({ ...base, llamados: 2, escalados: 1 }).valor).toBe(89); // 25 → 13,75
    expect(calcularNota({ ...base, llamados: 9, escalados: 0 }).valor).toBe(75); // a 0
  });

  it("puntualidad: a tiempo completo; 15 min tarde, la mitad; 30 min o más, 0", () => {
    const base = { pantallaPct: 1, camaraPct: 1, atencionPct: 1, llamados: 0, minFuera: 0 } as const;
    const sub = (tardeMin: number | null) => calcularNota({ ...base, tardeMin }).factores.find((f) => f.clave === "puntualidad")!.sub;
    expect(sub(null)).toBe(100);
    expect(sub(15)).toBe(50);
    expect(sub(45)).toBe(0);
  });

  it("en su puesto: cada minuto fuera de Cowork en su turno resta; a los 30 llega a 0", () => {
    const base = { pantallaPct: 1, camaraPct: 1, atencionPct: 1, llamados: 0, tardeMin: null } as const;
    const sub = (minFuera: number) => calcularNota({ ...base, minFuera }).factores.find((f) => f.clave === "puesto")!.sub;
    expect(sub(0)).toBe(100);
    expect(sub(6)).toBe(80);
    expect(sub(60)).toBe(0);
  });

  it("pantalla y cámara se miden sobre el tiempo CONECTADO (10 de 10 min = 100 %)", () => {
    expect(fraccionConectado(600, 600)).toBe(1);
    expect(fraccionConectado(300, 600)).toBe(0.5);
    expect(fraccionConectado(10, 0)).toBeUndefined();
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

  it("la cámara apagada baja la nota (pesa 10)", () => {
    const base = { pantallaPct: 1, atencionPct: 1, tardeMin: null, llamados: 0, minFuera: 0 } as const;
    const conCam = calcularNota({ ...base, camaraPct: 1 });
    const sinCam = calcularNota({ ...base, camaraPct: 0 });
    expect(sinCam.valor!).toBeLessThan(conCam.valor!);
    expect(sinCam.valor).toBe(90);
  });

  it("la distracción (pantalla fuera de lugar) baja la nota", () => {
    const enLoSuyo = calcularNota({ pantallaPct: 1, camaraPct: 1, atencionPct: 1 });
    const distraido = calcularNota({ pantallaPct: 1, camaraPct: 1, atencionPct: 0.3 });
    expect(distraido.valor!).toBeLessThan(enLoSuyo.valor!);
  });

  it("medio tiempo con pantalla/cámara (sobre lo conectado) baja lo que pesan", () => {
    const n = calcularNota({ pantallaPct: 0.5, camaraPct: 0.5, atencionPct: 1, tardeMin: null, llamados: 0, minFuera: 0 });
    // pantalla 50*.15 + cámara 50*.10 + el resto completo (75) = 87,5 → 88
    expect(n.valor).toBe(88);
  });

  it("fraccionJornada: turno completo compartido llega a 100 %, y tope en 1", () => {
    const jornadaUtil = 8 * 3600 - EXENTO_SEG;
    expect(fraccionJornada(jornadaUtil)).toBeCloseTo(1, 3);
    expect(fraccionJornada(jornadaUtil * 2)).toBe(1); // nunca pasa de 1
    expect(fraccionJornada(0)).toBe(0);
  });

  it("un factor sin dato REPARTE su peso (no castiga)", () => {
    // Sin dato de distracción (no hubo pantallazos juzgados aún): lo demás perfecto → 100.
    const n = calcularNota({ pantallaPct: 1, camaraPct: 1, tardeMin: null, llamados: 0, minFuera: 0 });
    const at = n.factores.find((f) => f.clave === "atencion")!;
    expect(at.sub).toBeNull();
    expect(n.valor).toBe(100);
  });

  it("sin NINGÚN dato la nota es null", () => {
    const n = calcularNota({});
    expect(n.valor).toBeNull();
    expect(n.banda).toBeNull();
  });

  it("alguien que va mal (sin pantalla, poca cámara, distraído, llamado varias veces) saca rojo", () => {
    const n = calcularNota({ pantallaPct: 0, camaraPct: 0.2, atencionPct: 0.3, tardeMin: 20, llamados: 4, escalados: 1, minFuera: 15 });
    expect(n.banda).toBe("mal");
    expect(n.valor!).toBeLessThan(60);
  });
});
