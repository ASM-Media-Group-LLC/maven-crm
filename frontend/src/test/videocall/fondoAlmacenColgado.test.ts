import { describe, it, expect, vi, afterEach } from "vitest";

// Un pedido de IndexedDB que NO dispara ni onsuccess ni onerror. Pasa en
// WebKit, y es el motivo por el que la llamada y el lobby ya envolvían la
// resolución del fondo en un tiempo límite. El `indexedDB.open` era el único
// punto del camino que quedaba sin proteger: con la conexión cacheada, el
// cuelgue no era recuperable — "Tus fondos" se veía vacío como si la persona no
// tuviera ninguno, elegir una imagen no hacía nada y no salía ningún aviso,
// para toda la pestaña.
function ponerIndexedDbColgado() {
  const abierto = { onsuccess: null, onerror: null, onblocked: null, onupgradeneeded: null, result: null };
  (globalThis as unknown as { indexedDB: unknown }).indexedDB = { open: vi.fn(() => abierto) };
  return abierto;
}

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
  delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
});

describe("cuando IndexedDB no contesta", () => {
  it("listar los fondos propios se rinde en vez de colgarse para siempre", async () => {
    ponerIndexedDbColgado();
    vi.useFakeTimers();
    const { listarFondosPropios } = await import("@/lib/fondoDeLlamada");

    const pedido = listarFondosPropios();
    await vi.advanceTimersByTimeAsync(5_000);

    // Se rinde y devuelve una lista vacía; lo importante es que RESUELVA.
    await expect(pedido).resolves.toEqual([]);
  });

  it("subir una imagen contesta con un motivo en vez de morir en silencio", async () => {
    ponerIndexedDbColgado();
    vi.useFakeTimers();
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi.fn(
      async () => ({ width: 10, height: 10, close: () => {} }) as unknown as ImageBitmap,
    );
    const { guardarFondoPropio } = await import("@/lib/fondoDeLlamada");

    const pedido = guardarFondoPropio(new Blob(["png"], { type: "image/png" }), 1_757_000_000_000);
    await vi.advanceTimersByTimeAsync(15_000);

    const r = await pedido;
    expect(r.fondo).toBeNull();
    // Y el motivo es el correcto: no hay dónde guardar. Antes el aviso culpaba
    // al límite de 5 incluso con la lista vacía.
    expect(r.motivo).toBe("sin-almacen");
  });

  it("el cuelgue NO queda pegado: si el navegador se recupera, el siguiente intento funciona", async () => {
    // Esto es el corazón del arreglo. La conexión se cachea para no abrir una
    // por operación, así que rendirse TIENE que olvidar el caché; si no, un
    // cuelgue pasajero dejaba la función muerta hasta recargar la página.
    const colgado = ponerIndexedDbColgado();
    vi.useFakeTimers();
    const { listarFondosPropios } = await import("@/lib/fondoDeLlamada");

    const primero = listarFondosPropios();
    await vi.advanceTimersByTimeAsync(5_000);
    await primero;

    // Ahora el navegador sí contesta, con una base vacía.
    let abiertoDeNuevo = false;
    (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
      open: vi.fn(() => {
        abiertoDeNuevo = true;
        const pedido: Record<string, unknown> = {
          result: { objectStoreNames: { contains: () => true }, transaction: () => { throw new Error("sin store"); } },
        };
        setTimeout(() => (pedido.onsuccess as () => void)?.(), 0);
        return pedido;
      }),
    };

    const segundo = listarFondosPropios();
    await vi.advanceTimersByTimeAsync(5_000);
    await segundo;

    expect(abiertoDeNuevo).toBe(true);
    expect(colgado.open).toBeUndefined();   // el objeto viejo ya no se usa
  });
});
