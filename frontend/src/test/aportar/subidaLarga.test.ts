// Videos largos y pesados de las modelos (lib/aportar/subidaLarga.ts, 11/11/2026).
import { describe, it, expect } from "vitest";
import {
  velocidadSuavizada, minutosRestantes, pesoLegible, estaPausada, tocaReportar, seRetomaSola,
  rutaDeUrlTus, sePuedeRetomar, PAUSA_MS, REPORTE_MS, REINTENTOS_SOLOS,
} from "@/lib/aportar/subidaLarga";

const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("cuánto falta", () => {
  it("con 1 Mbps, 649 MB son unas 1,5 horas", () => {
    const kbps = 1000;
    expect(minutosRestantes(649 * 1024 * 1024, kbps)).toBe(91);
  });
  it("sin velocidad todavía no se inventa un número", () => {
    expect(minutosRestantes(1000, null)).toBeNull();
    expect(minutosRestantes(1000, 0)).toBeNull();
  });
  it("al final dice 1 minuto, no 0, mientras falte algo", () => {
    expect(minutosRestantes(10, 5000)).toBe(1);
    expect(minutosRestantes(0, 5000)).toBe(0);
  });
  it("la velocidad se suaviza", () => {
    const v1 = velocidadSuavizada(null, 2 * 1024 * 1024, 16_000)!;
    expect(Math.round(v1)).toBe(1049);
    const v2 = velocidadSuavizada(v1, 2 * 1024 * 1024, 4_000)!;
    expect(v2).toBeGreaterThan(v1);
    expect(v2).toBeLessThan(4 * 1049);
    expect(velocidadSuavizada(v1, 0, 1000)).toBe(v1);
  });
  it("el peso se lee fácil", () => {
    expect(pesoLegible(389 * 1024 * 1024)).toBe("389 MB");
    expect(pesoLegible(Math.round(1.24 * 1024 ** 3))).toBe("1,2 GB");
    expect(pesoLegible(500)).toBe("1 KB");
  });
});

describe("pausa y reportes", () => {
  it("se considera en pausa a los 30 s sin avance", () => {
    expect(estaPausada(0, PAUSA_MS - 1)).toBe(false);
    expect(estaPausada(0, PAUSA_MS)).toBe(true);
  });
  it("el progreso se reporta cada 30 s, no en cada parte", () => {
    expect(tocaReportar(null, 5)).toBe(true);
    expect(tocaReportar(0, REPORTE_MS - 1)).toBe(false);
    expect(tocaReportar(0, REPORTE_MS)).toBe(true);
  });
});

describe("qué falla se retoma sola", () => {
  it("sin red, 5xx, 408 y 429 se retoman", () => {
    for (const s of [null, undefined, 0, 408, 429, 500, 503]) expect(seRetomaSola(s, 0)).toBe(true);
  });
  it("un rechazo (413 muy grande, 403 link cerrado) no", () => {
    for (const s of [400, 403, 404, 413]) expect(seRetomaSola(s, 0)).toBe(false);
  });
  it("tiene un tope", () => {
    expect(seRetomaSola(null, REINTENTOS_SOLOS)).toBe(false);
  });
});

describe("la ruta real cuando la subida se retoma", () => {
  const ruta = "c88fd974c7fa5fe8c3e08f2e91ea80ba/0530ed9b-c009-4d3d-b7e2-77eefb5a2a40-IMG_4202.jpeg";
  it("se lee de la URL de TUS de Supabase", () => {
    const url = `https://x.supabase.co/storage/v1/upload/resumable/${b64url(`drive-aportes/${ruta}/6a54ed3a-02fc-415e-9a48-da967d481dc1`)}`;
    expect(rutaDeUrlTus(url, "drive-aportes")).toBe(ruta);
  });
  it("otro bucket o basura → null", () => {
    const url = `https://x/storage/v1/upload/resumable/${b64url(`chat-files/${ruta}/v`)}`;
    expect(rutaDeUrlTus(url, "drive-aportes")).toBeNull();
    expect(rutaDeUrlTus("https://x/upload/resumable/%%%", "drive-aportes")).toBeNull();
    expect(rutaDeUrlTus(null, "drive-aportes")).toBeNull();
  });
  it("solo se retoma una subida del mismo link", () => {
    expect(sePuedeRetomar({ bucketName: "drive-aportes", objectName: "tok/a.mov" }, "drive-aportes", "tok/")).toBe(true);
    expect(sePuedeRetomar({ bucketName: "drive-aportes", objectName: "otro/a.mov" }, "drive-aportes", "tok/")).toBe(false);
    expect(sePuedeRetomar({ bucketName: "chat-files", objectName: "tok/a.mov" }, "drive-aportes", "tok/")).toBe(false);
    expect(sePuedeRetomar(null, "drive-aportes", "tok/")).toBe(false);
  });
});
