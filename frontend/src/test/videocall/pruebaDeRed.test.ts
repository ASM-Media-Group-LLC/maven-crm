// PRUEBA DE VELOCIDAD REAL DURANTE LA LLAMADA (lib/pruebaDeRed.ts, 13/11/2026).
//
// La estimación de WebRTC (availableOutgoingBitrate) refleja lo que la llamada
// usa, no lo que el internet aguanta (en producción hay 1.000.000 kbps). Esto
// cuida que la prueba de verdad se haga cuando debe (al entrar a Cowork, cada 30
// min, nunca oculta ni reconectando), que el cálculo no se infle y que el
// resultado viaje en la muestra de llamada_salud.
import { describe, it, expect, vi } from "vitest";
import {
  BYTES_BAJADA, BYTES_SUBIDA, PRUEBA_CADA_MS, mbpsDe, medirRed, salaConPrueba, tocaProbar,
} from "@/lib/pruebaDeRed";
import { AHORRO_INICIAL, ahorroPorPrueba } from "@/lib/modoAhorro";

const fuentes = import.meta.glob(["/frontend/src/hooks/useLiveKit.ts", "/supabase/config.toml", "/supabase/functions/prueba-de-red/index.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("cuándo se prueba", () => {
  it("solo en las salas de Cowork", () => {
    expect(salaConPrueba("cowork_ab12cd34_3")).toBe(true);
    expect(salaConPrueba("cowork_meet_ab12cd34_ef56ab78")).toBe(true);
    expect(salaConPrueba("meet_abc")).toBe(false);
    expect(salaConPrueba(null)).toBe(false);
  });

  it("al entrar (nunca se probó) y después cada 30 minutos", () => {
    const base = { ahora: 1_000_000, visible: true, conectada: true, enCurso: false };
    expect(tocaProbar({ ...base, proximaMs: null })).toBe(true);
    expect(tocaProbar({ ...base, proximaMs: base.ahora + 1 })).toBe(false);
    expect(tocaProbar({ ...base, proximaMs: base.ahora })).toBe(true);
    expect(PRUEBA_CADA_MS).toBe(30 * 60_000);
  });

  it("⚠️ nunca con la pestaña oculta, con la llamada reconectando ni con otra prueba andando", () => {
    const base = { proximaMs: null, ahora: 0, visible: true, conectada: true, enCurso: false };
    expect(tocaProbar({ ...base, visible: false })).toBe(false);
    expect(tocaProbar({ ...base, conectada: false })).toBe(false);
    expect(tocaProbar({ ...base, enCurso: true })).toBe(false);
  });
});

describe("el cálculo", () => {
  it("1 MB en 1 s son 8 Mbps; la latencia se descuenta", () => {
    expect(mbpsDe(1_000_000, 1000, 0)).toBe(8);
    expect(mbpsDe(1_000_000, 1100, 100)).toBe(8);
  });
  it("con un ping ruidoso nunca se descuenta más de la mitad (no se infla)", () => {
    expect(mbpsDe(1_000_000, 1000, 900)).toBe(16);
  });
  it("sin bytes o sin tiempo no hay medida", () => {
    expect(mbpsDe(0, 1000, 0)).toBeNull();
    expect(mbpsDe(1000, 0, 0)).toBeNull();
  });
});

describe("la prueba completa", () => {
  const respuesta = (cuerpo: Uint8Array | null, status = 200) => {
    const r = new Response(cuerpo, { status });
    return r;
  };

  it("mide ping, bajada y subida contra la función, con la sesión y sin caché", async () => {
    let t = 0;
    const reloj = () => t;
    const llamadas: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push({ url, init });
      if (url.includes("bytes=0")) { t += 50; return respuesta(null, 204); }
      if (url.includes(`bytes=${BYTES_BAJADA}`)) { t += 1050; return respuesta(new Uint8Array(BYTES_BAJADA)); }
      t += 2050; // la subida
      return respuesta(null, 204);
    }) as unknown as typeof fetch;
    const r = await medirRed({ url: "https://x/functions/v1/prueba-de-red", headers: { Authorization: "Bearer jwt" }, fetchFn, reloj });
    expect(r).not.toBeNull();
    expect(r!.ms).toBe(50);
    expect(r!.bajada_mbps).toBe(12); // 1,5 MB en 1 s (1050 − 50 de ping)
    expect(r!.subida_mbps).toBe(4); // 1 MB en 2 s (2050 − 50)
    expect(r!.subida_tope).toBeUndefined();
    const subida = llamadas.find((l) => l.init?.method === "POST")!;
    expect((subida.init!.body as Uint8Array).byteLength).toBe(BYTES_SUBIDA);
    for (const l of llamadas) {
      expect(l.url.startsWith("https://x/functions/v1/prueba-de-red?")).toBe(true);
      expect((l.init!.headers as Record<string, string>).Authorization).toBe("Bearer jwt");
      expect(l.init!.cache).toBe("no-store");
    }
    // Cada pedido con su marca: ningún caché en el camino puede devolver uno viejo.
    expect(new Set(llamadas.map((l) => l.url)).size).toBe(llamadas.length);
  });

  it("si ni el ping contesta (función caída, sin red), no hay prueba", async () => {
    const fetchFn = vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    expect(await medirRed({ url: "https://x", headers: {}, fetchFn })).toBeNull();
    const sinSesion = vi.fn(async () => new Response(null, { status: 401 })) as unknown as typeof fetch;
    expect(await medirRed({ url: "https://x", headers: {}, fetchFn: sinSesion })).toBeNull();
  });

  it("una subida que no termina a tiempo queda como «menos de» (tope), no como dato falso", async () => {
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return await new Promise<Response>((_, rechazar) => {
          init.signal?.addEventListener("abort", () => rechazar(Object.assign(new Error("abortado"), { name: "AbortError" })));
        });
      }
      if (url.includes("bytes=0")) return respuesta(null, 204);
      return respuesta(new Uint8Array(1000));
    }) as unknown as typeof fetch;
    const r = await medirRed({ url: "https://x", headers: {}, fetchFn, tiempoMaxMs: 30 });
    expect(r!.subida_tope).toBe(true);
    expect(r!.subida_mbps).toBeGreaterThan(0);
  });
});

describe("una prueba floja prende el ahorro en el acto (y una buena no lo apaga)", () => {
  it("menos de 1,5 Mbps de subida medida → ahorro", () => {
    expect(ahorroPorPrueba(AHORRO_INICIAL, 0.9).activo).toBe(true);
    expect(ahorroPorPrueba(AHORRO_INICIAL, 1.5).activo).toBe(false);
    expect(ahorroPorPrueba(AHORRO_INICIAL, null).activo).toBe(false);
    const prendido = { activo: true, malas: 2, buenas: 0 };
    expect(ahorroPorPrueba(prendido, 20)).toBe(prendido);
  });
});

describe("cableado", () => {
  const liveKit = fuentes["/frontend/src/hooks/useLiveKit.ts"];
  const toml = fuentes["/supabase/config.toml"];
  const edge = fuentes["/supabase/functions/prueba-de-red/index.ts"];

  it("los fuentes se cargaron", () => {
    expect(liveKit?.length).toBeGreaterThan(1000);
    expect(toml?.length).toBeGreaterThan(100);
    expect(edge?.length).toBeGreaterThan(100);
  });

  it("el resultado viaja en la muestra de llamada_salud (datos.prueba)", () => {
    expect(liveKit).toContain("...(prueba ? { prueba } : {})");
    expect(liveKit).toContain("conectada: room.state === ConnectionState.Connected");
    expect(liveKit).toContain('visible: document.visibilityState === "visible"');
  });

  it("⚠️ la función tiene su bloque en config.toml con verify_jwt = true (sin bloque se frenan TODOS los deploy de edge)", () => {
    expect(toml).toMatch(/\[functions\.prueba-de-red\]\s*\nverify_jwt = true/);
  });

  it("la función exige una sesión de Maven y no deja que nadie la cachee", () => {
    expect(edge).toContain("admin.auth.getUser(token)");
    expect(edge).toContain('"Cache-Control": "no-store"');
    expect(edge).toMatch(/MAX_BAJADA = 2_000_000/);
    expect(edge).toMatch(/MAX_SUBIDA = 3_000_000/);
  });
});
