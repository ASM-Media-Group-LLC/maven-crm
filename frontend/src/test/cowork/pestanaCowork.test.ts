import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tomarCandado, nombreDelCandado } from "@/lib/pestanaCowork";

// Un Web Locks de juguete con lo que usamos: ifAvailable y steal, un candado
// por nombre, y la petición robada se rechaza con AbortError.
type Titular = { rechazar: (e: Error) => void; liberado: Promise<void> };
function locksDeJuguete() {
  const titulares = new Map<string, Titular>();
  return {
    request(name: string, options: { ifAvailable?: boolean; steal?: boolean }, cb: (lock: unknown | null) => Promise<unknown>) {
      return new Promise<unknown>((resolve, reject) => {
        const actual = titulares.get(name);
        if (actual && options.ifAvailable) { void cb(null).then(resolve, reject); return; }
        if (actual && options.steal) actual.rechazar(Object.assign(new Error("robado"), { name: "AbortError" }));
        if (actual && !options.steal) { reject(new Error("el juguete no hace cola")); return; }
        let rechazar!: (e: Error) => void;
        const liberado = new Promise<void>((_, rej) => { rechazar = rej; });
        const yo: Titular = { rechazar, liberado };
        titulares.set(name, yo);
        const fin = cb({ name });
        // Termina cuando la pestaña suelta (cb resuelve) o cuando la roban (rechazo).
        Promise.race([fin, liberado]).then(
          (v) => { if (titulares.get(name) === yo) titulares.delete(name); resolve(v); },
          (e) => { if (titulares.get(name) === yo) titulares.delete(name); reject(e); },
        );
      });
    },
    quienTiene(name: string) { return titulares.has(name); },
  };
}

let locks: ReturnType<typeof locksDeJuguete>;
beforeEach(() => {
  locks = locksDeJuguete();
  vi.stubGlobal("navigator", { locks });
});
afterEach(() => vi.unstubAllGlobals());

describe("tomarCandado — una sola pestaña de Cowork por sesión", () => {
  it("la primera pestaña es principal; la segunda ve el candado ocupado", async () => {
    const a = await tomarCandado("s1");
    const b = await tomarCandado("s1");
    expect(a.estado).toBe("principal");
    expect(b.estado).toBe("ocupada");
    expect(locks.quienTiene(nombreDelCandado("s1"))).toBe(true);
  });

  it("otra sesión es otro candado", async () => {
    await tomarCandado("s1");
    expect((await tomarCandado("s2")).estado).toBe("principal");
  });

  it("al soltar, la siguiente pestaña puede entrar", async () => {
    const a = await tomarCandado("s1");
    a.soltar();
    await new Promise((r) => setTimeout(r, 0));
    expect((await tomarCandado("s1")).estado).toBe("principal");
  });

  it("'Usar esta pestaña' roba el candado y la otra se entera", async () => {
    const a = await tomarCandado("s1");
    const perdido = vi.fn();
    a.alPerder(perdido);
    const b = await tomarCandado("s1", { robar: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(b.estado).toBe("principal");
    expect(perdido).toHaveBeenCalledTimes(1);
  });

  it("sin Web Locks, todas las pestañas son principales (como hasta hoy)", async () => {
    vi.stubGlobal("navigator", {});
    expect((await tomarCandado("s1")).estado).toBe("sin-soporte");
  });
});
