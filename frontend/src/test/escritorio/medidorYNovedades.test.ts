import { describe, it, expect } from "vitest";
import { luzComputador, luzInternet, luzMemoria, peorLuz, semaforo, tocaAvisar, AVISO_CADA_MS, type MuestraDelEquipo } from "@/lib/medidorEquipo";
import { novedadesParaMostrar, versionDeLaApp, NOVEDADES } from "@/lib/novedadesApp";
import { resumirEquipo } from "@/lib/equipoDelDia";

// Alvaro, 18/11/2026: medidor de internet, computador y memoria en la app; la
// tarjeta de «qué cambió» al volver de una actualización.

const base: MuestraDelEquipo = {
  en_linea: true, ping_ms: 80, bajada_mbps: 20, equipo_gb: 8, libre_gb: 3, app_mb: 500,
  cpu_equipo_pct: 30, cpu_app_pct: 8, mac: false,
};

describe("medidor del equipo", () => {
  it("internet: sin conexión o muy lento en rojo; lento en amarillo", () => {
    expect(luzInternet(base)).toBe("verde");
    expect(luzInternet({ ...base, en_linea: false })).toBe("rojo");
    expect(luzInternet({ ...base, ping_ms: 700 })).toBe("rojo");
    expect(luzInternet({ ...base, ping_ms: 300 })).toBe("amarillo");
    expect(luzInternet({ ...base, bajada_mbps: 0.5 })).toBe("amarillo");
    expect(luzInternet({ ...base, bajada_mbps: 1.6 })).toBe("verde");
    expect(luzInternet({ ...base, ping_ms: null, bajada_mbps: null })).toBe("sin_dato");
  });

  it("computador y memoria (en Mac más tolerante: usa la libre como caché)", () => {
    expect(luzComputador({ cpu_equipo_pct: 95 })).toBe("rojo");
    expect(luzComputador({ cpu_equipo_pct: 80 })).toBe("amarillo");
    expect(luzComputador({ cpu_equipo_pct: null })).toBe("sin_dato");
    expect(luzMemoria({ libre_gb: 0.3, equipo_gb: 8, mac: false })).toBe("rojo");
    expect(luzMemoria({ libre_gb: 0.9, equipo_gb: 8, mac: false })).toBe("amarillo");
    expect(luzMemoria({ libre_gb: 0.3, equipo_gb: 16, mac: true })).toBe("verde");
    expect(peorLuz(semaforo({ ...base, cpu_equipo_pct: 95 }))).toBe("rojo");
  });

  it("avisa solo con dos rojos seguidos y no más de una vez cada 30 min", () => {
    const rojo = semaforo({ ...base, libre_gb: 0.2 });
    const verde = semaforo(base);
    expect(tocaAvisar("memoria", rojo, verde, undefined, 1000)).toBe(false);
    expect(tocaAvisar("memoria", rojo, rojo, undefined, 1000)).toBe(true);
    expect(tocaAvisar("memoria", rojo, rojo, 1000, 1000 + AVISO_CADA_MS - 1)).toBe(false);
    expect(tocaAvisar("memoria", rojo, rojo, 1000, 1000 + AVISO_CADA_MS)).toBe(true);
  });

  it("el resumen del día cuenta los rojos y toma la última muestra", () => {
    const r = resumirEquipo([
      { creado: "2026-11-18T10:00:00Z", datos: { internet: "rojo", memoria: "verde" } },
      { creado: "2026-11-18T10:05:00Z", datos: { internet: "verde", memoria: "amarillo", ping_ms: 90 } },
    ]);
    expect(r.muestras).toBe(2);
    expect(r.rojos.internet).toBe(1);
    expect(r.amarillos.memoria).toBe(1);
    expect(r.ultima?.datos.ping_ms).toBe(90);
  });
});

describe("qué cambió después de actualizar", () => {
  it("lee la versión de la app del user agent", () => {
    expect(versionDeLaApp("Mozilla/5.0 Chrome/140 Electron/45.3.3 MavenEscritorio/2.0.57")).toBe("2.0.57");
    expect(versionDeLaApp("Mozilla/5.0 Chrome/140")).toBeNull();
  });

  it("solo cuando cambió la versión, y solo lo nuevo desde la última vez", () => {
    const lista = [
      { fecha: "2026-11-10T00:00:00Z", nuevo: [], mejoro: [], reparado: [] },
      { fecha: "2026-11-18T00:00:00Z", nuevo: [], mejoro: [], reparado: [] },
    ];
    expect(novedadesParaMostrar({ version: "2.0.2", vista: "2.0.2", vistasHasta: null, lista })).toEqual([]);
    expect(novedadesParaMostrar({ version: "2.0.2", vista: null, vistasHasta: null, lista })).toEqual([]);
    const r = novedadesParaMostrar({ version: "2.0.3", vista: "2.0.2", vistasHasta: "2026-11-15T00:00:00Z", lista });
    expect(r.map((n) => n.fecha)).toEqual(["2026-11-18T00:00:00Z"]);
  });

  it("cada novedad trae al menos algo que contar", () => {
    for (const n of NOVEDADES) expect(n.nuevo.length + n.mejoro.length + n.reparado.length).toBeGreaterThan(0);
  });
});
