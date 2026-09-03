import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// La precarga de secciones tiene que ser INOFENSIVA: si algo falla, la app se
// comporta exactamente como sin ella (el chunk baja al hacer clic). Estas
// pruebas fijan lo que la hace inofensiva: no repite, no lanza, no baja lo que
// el rol no ve, no baja nada en medio de una llamada.

let enLlamada = false;
vi.mock("@/lib/llamadaEnMaven", () => ({ estaEnLlamadaDeMaven: () => enLlamada }));

const { crearPrecargador, ESPACIO_ENTRE_CHUNKS_MS } = await import("@/lib/prefetchRutas");

describe("precarga de secciones", () => {
  beforeEach(() => { vi.useFakeTimers(); enLlamada = false; });
  afterEach(() => { vi.useRealTimers(); });

  it("precarga una ruta una sola vez, aunque pases el mouse diez veces", () => {
    const messenger = vi.fn(() => Promise.resolve());
    const { precargarRuta } = crearPrecargador({ "/messenger": messenger });
    for (let i = 0; i < 10; i++) precargarRuta("/messenger");
    expect(messenger).toHaveBeenCalledTimes(1);
  });

  it("una ruta desconocida no hace nada, y un chunk que falla no rompe nada", async () => {
    const roto = vi.fn(() => Promise.reject(new Error("sin red")));
    const { precargarRuta } = crearPrecargador({ "/rota": roto });
    expect(() => precargarRuta("/no-existe")).not.toThrow();
    expect(() => precargarRuta("/rota")).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    // Y al fallar se olvida la marca: el próximo intento vuelve a probar.
    precargarRuta("/rota");
    expect(roto).toHaveBeenCalledTimes(2);
  });

  it("en ocio baja las secciones de a una, con espacio entre ellas", async () => {
    const a = vi.fn(() => Promise.resolve()), b = vi.fn(() => Promise.resolve());
    const { precargarEnOcio } = crearPrecargador({ "/a": a, "/b": b, "/c": vi.fn() });
    precargarEnOcio(["/a", "/b"]);           // "/c" no está en la lista del rol: no se toca
    await vi.advanceTimersByTimeAsync(1_300); // el primer respiro (sin requestIdleCallback en jsdom)
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(ESPACIO_ENTRE_CHUNKS_MS + 1_300);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("durante una llamada no baja nada; al terminar, sigue", async () => {
    const a = vi.fn(() => Promise.resolve());
    const { precargarEnOcio } = crearPrecargador({ "/a": a });
    enLlamada = true;
    precargarEnOcio(["/a"]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(a).not.toHaveBeenCalled();
    enLlamada = false;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(a).toHaveBeenCalledTimes(1);
  });

  it("cancelar deja de bajar lo que faltaba", async () => {
    const a = vi.fn(() => Promise.resolve()), b = vi.fn(() => Promise.resolve());
    const { precargarEnOcio } = crearPrecargador({ "/a": a, "/b": b });
    const cancelar = precargarEnOcio(["/a", "/b"]);
    await vi.advanceTimersByTimeAsync(1_300);
    expect(a).toHaveBeenCalledTimes(1);
    cancelar();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(b).not.toHaveBeenCalled();
  });
});
