import { describe, expect, it, vi } from "vitest";
import { esChunkPublico } from "../../../../scripts/pwa/cachePublica";

type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
const uno = (m: Record<string, string>) => Object.values(m)[0] ?? "";
const sw = uno((import.meta as unknown as Glob).glob("/frontend/public/sw-push.js", { query: "?raw", import: "default", eager: true }));
const configuracion = uno((import.meta as unknown as Glob).glob("/vite.config.ts", { query: "?raw", import: "default", eager: true }));

const ORIGEN = "https://app.maven-ai.me";
const coincide = (path: string) => {
  const url = new URL(path, ORIGEN);
  return esChunkPublico({ url, sameOrigin: url.origin === ORIGEN });
};

describe("caché de código público inmutable", () => {
  it("acepta solo chunks propios con hash", () => {
    expect(coincide("/assets/Messenger-CaKcJhcM.js")).toBe(true);
    expect(coincide("/assets/_maven-i18n_en-CRVqsMlp.js")).toBe(true);
    expect(coincide("/assets/vendor-react-GiMyxfl2.js?v=1")).toBe(true);
    expect(coincide("/assets/sin-version.js")).toBe(false);
    expect(coincide("https://ajeno.example/assets/Messenger-CaKcJhcM.js")).toBe(false);
  });

  it("no incluye mensajes, conversaciones ni respuestas de la API", () => {
    for (const path of ["/rest/v1/chat_messages?select=*", "/rest/v1/chat_conversations", "/functions/v1/mensajes", "/api/assets-CaKcJhcM.js"]) {
      expect(coincide(path)).toBe(false);
      expect(coincide(`https://proyecto.supabase.co${path}`)).toBe(false);
    }
    expect(configuracion.length).toBeGreaterThan(1_000);
    expect(configuracion).not.toContain('cacheName: "chat-messages-cache"');
    expect(configuracion).not.toContain('cacheName: "chat-conversations-cache"');
    expect(configuracion).toContain('urlPattern: esChunkPublico');
    expect(configuracion).toContain('handler: "CacheFirst"');
  });
});

describe("migración del service worker sin tocar borradores", () => {
  function cargar(borrar: (nombre: string) => Promise<boolean>) {
    const manejadores: Record<string, (event: { waitUntil: (p: Promise<unknown>) => void }) => void> = {};
    const self = { addEventListener: (tipo: string, fn: typeof manejadores[string]) => { manejadores[tipo] = fn; } };
    expect(sw.length).toBeGreaterThan(1_000);
    new Function("self", "caches", sw)(self, { delete: borrar });
    return async () => {
      let pendiente: Promise<unknown> | undefined;
      manejadores.activate({ waitUntil: (p) => { pendiente = p; } });
      expect(pendiente).toBeDefined();
      await pendiente;
    };
  }

  it("al activar elimina únicamente las dos cachés antiguas de datos privados", async () => {
    const guardadas = new Set(["chat-messages-cache", "chat-conversations-cache", "chunks-cache", "borradores", "workbox-precache-v2"]);
    const borrar = vi.fn(async (nombre: string) => guardadas.delete(nombre));
    await cargar(borrar)();
    expect(borrar.mock.calls.map(([nombre]) => nombre)).toEqual(["chat-messages-cache", "chat-conversations-cache"]);
    expect([...guardadas]).toEqual(["chunks-cache", "borradores", "workbox-precache-v2"]);
  });

  it("una caché ya borrada o inaccesible no impide activar la versión corregida", async () => {
    const borrar = vi.fn().mockRejectedValueOnce(new Error("almacenamiento bloqueado")).mockResolvedValue(false);
    await expect(cargar(borrar)()).resolves.toBeUndefined();
    expect(borrar).toHaveBeenCalledTimes(2);
  });

  it("espera la segunda eliminación aunque la primera falle", async () => {
    let terminarSegunda!: (eliminada: boolean) => void;
    const segunda = new Promise<boolean>((resolve) => { terminarSegunda = resolve; });
    const borrar = vi.fn()
      .mockRejectedValueOnce(new Error("primera caché inaccesible"))
      .mockReturnValueOnce(segunda);
    let terminada = false;
    const activacion = cargar(borrar)().then(() => { terminada = true; });
    // Dejar resolver todos los callbacks de la primera promesa rechazada.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(terminada).toBe(false);
    terminarSegunda(true);
    await activacion;
    expect(terminada).toBe(true);
    expect(borrar).toHaveBeenCalledTimes(2);
  });
});
