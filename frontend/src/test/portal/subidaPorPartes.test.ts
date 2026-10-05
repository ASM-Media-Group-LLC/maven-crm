import { describe, it, expect, vi } from "vitest";
import { type Enviar, SubidaCancelada, SubidaFallida, subirPorPartes } from "@/lib/drive/subidaPorPartes";

// SUBIR DESDE UN CELULAR: el internet se corta. Cada parte se reintenta sola
// (esperando cada vez más), sin internet espera a que vuelva sin gastar
// intentos, y lo que el NAS rechaza no se insiste. Al final, el recibo.

const MB = 1024 * 1024;
const archivo = (bytes: number) => new Blob([new Uint8Array(bytes)]);
const plan = (partes: number) => ({
  tamano_parte: 8 * MB,
  partes: Array.from({ length: partes }, (_, i) => `https://nas.test/parte/${i}`),
  completar: "https://nas.test/completar",
});
const sinEsperar = () => Promise.resolve();

/** Un NAS de mentira: lo que conteste cada pedido, en orden; después, 200. */
function nas(respuestas: Record<string, number[]> = {}) {
  const pedidos: string[] = [];
  const enviar: Enviar = vi.fn(async (url, metodo, cuerpo, onProgreso) => {
    pedidos.push(`${metodo} ${url.replace("https://nas.test/", "")}`);
    const cola = respuestas[url.replace("https://nas.test/", "")];
    const status = cola?.length ? cola.shift()! : 200;
    if (status === 200 && cuerpo) onProgreso(cuerpo.size);
    return { status, cuerpo: status === 200 && (url.endsWith("completar") || url.endsWith("entero")) ? { recibo: "recibo-firmado" } : null };
  });
  return { enviar, pedidos };
}

describe("subirPorPartes", () => {
  it("uno chico va entero y devuelve el recibo", async () => {
    const n = nas();
    const recibo = await subirPorPartes(archivo(1000), { url: "https://nas.test/entero" }, { enviar: n.enviar, esperar: sinEsperar });
    expect(recibo).toBe("recibo-firmado");
    expect(n.pedidos).toEqual(["PUT entero"]);
  });

  it("por partes: de a una, cada una con su trozo, y al final completar", async () => {
    const n = nas();
    const progreso: number[] = [];
    const recibo = await subirPorPartes(archivo(20 * MB), plan(3), { enviar: n.enviar, esperar: sinEsperar, onProgreso: (b) => progreso.push(b) });
    expect(recibo).toBe("recibo-firmado");
    expect(n.pedidos).toEqual(["PUT parte/0", "PUT parte/1", "PUT parte/2", "POST completar"]);
    const tamanos = (n.enviar as ReturnType<typeof vi.fn>).mock.calls.slice(0, 3).map((c) => (c[2] as Blob).size);
    expect(tamanos).toEqual([8 * MB, 8 * MB, 4 * MB]);
    expect(progreso.at(-1)).toBe(20 * MB);
  });

  it("se corta la red en una parte: la reintenta sola, esperando cada vez más", async () => {
    const n = nas({ "parte/1": [0, 502, 0] });
    const esperas: number[] = [];
    const estados: unknown[] = [];
    await subirPorPartes(archivo(20 * MB), plan(3), {
      enviar: n.enviar,
      esperar: async (ms) => { esperas.push(ms); },
      onEstado: (e) => estados.push(e),
    });
    expect(n.pedidos.filter((p) => p === "PUT parte/1")).toHaveLength(4);
    expect(esperas).toEqual([1000, 2000, 4000]);
    expect(estados).toEqual([{ reintento: 1 }, { reintento: 2 }, { reintento: 3 }]);
  });

  it("sin internet espera a que vuelva, sin gastar los intentos", async () => {
    const n = nas();
    let enLinea = false;
    const cuandoVuelva = vi.fn(async () => { enLinea = true; });
    const estados: unknown[] = [];
    await subirPorPartes(archivo(10 * MB), plan(2), {
      enviar: n.enviar, esperar: sinEsperar, reintentos: 0,
      enLinea: () => enLinea, cuandoVuelva, onEstado: (e) => estados.push(e),
    });
    expect(cuandoVuelva).toHaveBeenCalledTimes(1);
    expect(estados).toEqual([{ sinInternet: true }, { subiendo: true }]);
    expect(n.pedidos).toHaveLength(3);
  });

  it("lo que el NAS rechaza (permiso vencido, demasiado grande) no se insiste", async () => {
    const n = nas({ "parte/0": [403] });
    const e = await subirPorPartes(archivo(10 * MB), plan(2), { enviar: n.enviar, esperar: sinEsperar }).catch((x) => x);
    expect(e).toBeInstanceOf(SubidaFallida);
    expect((e as SubidaFallida).codigo).toBe("nas_rechazo");
    expect(n.pedidos).toEqual(["PUT parte/0"]);
  });

  it("si se corta demasiadas veces, se rinde", async () => {
    const n = nas({ "parte/0": [0, 0, 0] });
    const e = await subirPorPartes(archivo(10 * MB), plan(2), { enviar: n.enviar, esperar: sinEsperar, reintentos: 2 }).catch((x) => x);
    expect((e as SubidaFallida).codigo).toBe("sin_red");
  });

  it("cancelar corta en el momento", async () => {
    const control = new AbortController();
    const enviar: Enviar = async (url) => {
      if (url.endsWith("parte/1")) control.abort();
      return { status: 200, cuerpo: null };
    };
    const e = await subirPorPartes(archivo(20 * MB), plan(3), { enviar, esperar: sinEsperar, signal: control.signal }).catch((x) => x);
    expect(e).toBeInstanceOf(SubidaCancelada);
  });

  it("sin recibo del NAS no se da por subido", async () => {
    const enviar: Enviar = async () => ({ status: 200, cuerpo: {} });
    const e = await subirPorPartes(archivo(10), { url: "https://nas.test/entero" }, { enviar, esperar: sinEsperar }).catch((x) => x);
    expect((e as SubidaFallida).codigo).toBe("sin_recibo");
  });
});
