import { describe, it, expect } from "vitest";
import { distanciaHuellas, huellaDeGrises, HUELLA_ALTO, HUELLA_ANCHO } from "@/lib/huellaPantalla";
import { estadoSoloApp, esNavegadorDeComputador, descargaParaEsteEquipo } from "@/lib/coworkSoloApp";

// Alvaro, 17/11/2026: Argos a USD 15. Semana de prueba de los filtros (solo
// anotan) y Cowork en el computador solo en la app desde el 24/11.

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148";

const camara = Object.values(import.meta.glob("../hooks/useMonitorCamara.ts", { query: "?raw", import: "default", eager: true }))[0] as string;
const pagina = Object.values(import.meta.glob("../pages/cowork/CoworkPage.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;

const imagen = (f: (x: number, y: number) => number) => {
  const g: number[] = [];
  for (let y = 0; y < HUELLA_ALTO; y++) for (let x = 0; x < HUELLA_ANCHO; x++) g.push(f(x, y));
  return g;
};

describe("huella del pantallazo (¿cambió la pantalla?)", () => {
  it("son 256 bits en 64 letras hex", () => {
    expect(huellaDeGrises(imagen((x, y) => (x * 7 + y * 13) % 255))).toMatch(/^[0-9a-f]{64}$/);
  });

  it("la misma pantalla da la misma huella; un leve cambio de luz casi no la mueve", () => {
    const a = huellaDeGrises(imagen((x, y) => (x * 31 + y * 17) % 200));
    const b = huellaDeGrises(imagen((x, y) => ((x * 31 + y * 17) % 200) + 3));
    expect(distanciaHuellas(a, a)).toBe(0);
    expect(distanciaHuellas(a, b)).toBeLessThanOrEqual(24);
  });

  it("otra pantalla cambia muchos bits", () => {
    const a = huellaDeGrises(imagen((x) => x * 10));
    const b = huellaDeGrises(imagen((x) => 200 - x * 10));
    expect(distanciaHuellas(a, b)).toBeGreaterThan(100);
  });

  it("el pantallazo guarda su huella en monitor_capturas", () => {
    expect(camara).toMatch(/alHuella\(huellaDeCanvas\(canvas\)\)/);
    expect(camara).toMatch(/cara_visible: caraVisible,[\s\S]{0,120}huella,/);
  });
});

describe("Cowork en el computador solo en la app", () => {
  const desde = new Date("2026-11-24T05:00:00Z");
  const antes = new Date("2026-11-20T15:00:00Z");
  const despues = new Date("2026-11-24T13:00:00Z");

  it("en el navegador del computador: aviso antes, bloqueo desde la fecha", () => {
    expect(estadoSoloApp({ ua: WIN, tactil: false, enApp: false, desde, ahora: antes })).toBe("aviso");
    expect(estadoSoloApp({ ua: MAC, tactil: false, enApp: false, desde, ahora: despues })).toBe("bloqueo");
  });

  it("en la app, el celular o una tableta no cambia nada", () => {
    expect(estadoSoloApp({ ua: MAC, tactil: false, enApp: true, desde, ahora: despues })).toBe("nada");
    expect(estadoSoloApp({ ua: IPHONE, tactil: true, enApp: false, desde, ahora: despues })).toBe("nada");
    expect(estadoSoloApp({ ua: MAC, tactil: true, enApp: false, desde, ahora: despues })).toBe("nada");
    expect(esNavegadorDeComputador({ ua: "Mozilla/5.0 (X11; Linux x86_64)", tactil: false, enApp: false })).toBe(false);
  });

  it("si no se pudo leer la fecha, nunca bloquea", () => {
    expect(estadoSoloApp({ ua: WIN, tactil: false, enApp: false, desde: null, ahora: despues })).toBe("nada");
  });

  it("baja el instalador de su sistema", () => {
    expect(descargaParaEsteEquipo(MAC)).toBe("Maven-Mac.dmg");
    expect(descargaParaEsteEquipo(WIN)).toBe("Maven-Windows.exe");
  });

  it("la página de Cowork respeta el bloqueo", () => {
    expect(pagina).toMatch(/if \(soloApp\.estado === "bloqueo"\) return <BloqueoSoloApp \/>;/);
  });
});
