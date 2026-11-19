import { describe, it, expect, vi, afterEach } from "vitest";
import { MEDIR_REGIONES_CADA, REGIONES, medirRegion } from "@/lib/pingRegiones";

const useLiveKit = Object.values(import.meta.glob("../../hooks/useLiveKit.ts", { query: "?raw", import: "default", eager: true }))[0] as string;

describe("medir qué servidor de llamadas queda más cerca (19/11/2026)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mide St. Louis y Miami por https, cada 10 minutos", () => {
    expect(Object.keys(REGIONES)).toEqual(expect.arrayContaining(["stl", "mia"]));
    for (const url of Object.values(REGIONES)) expect(url.startsWith("https://")).toBe(true);
    expect(MEDIR_REGIONES_CADA).toBe(10);
    expect(useLiveKit).toContain("vueltaRegiones++ % MEDIR_REGIONES_CADA === 0");
    expect(useLiveKit).toContain("...(regiones ? { regiones } : {})");
  });

  it("si falla, devuelve null y no rompe nada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sin red")));
    await expect(medirRegion("https://x/ping")).resolves.toBeNull();
  });

  it("devuelve el mejor tiempo de los intentos", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "ok" }));
    const v = await medirRegion("https://x/ping");
    expect(typeof v).toBe("number");
  });
});
