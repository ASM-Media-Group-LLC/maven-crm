// MAVEN SE ACTUALIZA SOLO, PERO NUNCA EN UNA LLAMADA (Alvaro, 17/11/2026).
//
// Lo que se cuida (lib/recargaAlColgar.ts):
//  • sin llamada y sin nada a medio escribir → recarga sola;
//  • con llamada → aviso sin botón y espera; al colgar, recarga;
//  • escribiendo → espera;
//  • una vez por versión: si ya recargó desde este build y sigue en él, no
//    vuelve a recargar (no hay bucle) y deja el aviso de siempre.
// El 11/11 el service worker recargaba con la llamada andando y la cortaba
// (PR #41): eso es lo que esta guarda no deja volver.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  CLAVE_RECARGA, crearRecargaAlColgar, hayAlgoAMedioEscribir, marcarRecarga, yaRecargoDesde,
  type AlmacenMinimo, type OpcionesDeLaRecarga,
} from "@/lib/recargaAlColgar";

const fuentes = import.meta.glob(["/frontend/src/pwa.ts", "/frontend/src/lib/registroDelSw.ts"], {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const leer = (final: string): string => {
  const clave = Object.keys(fuentes).find((k) => k.endsWith(final));
  if (!clave) throw new Error(`no se cargó el fuente ${final} (glob vacío)`);
  return fuentes[clave];
};

const almacenDePrueba = (): AlmacenMinimo & { datos: Map<string, string> } => {
  const datos = new Map<string, string>();
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => { datos.set(k, v); } };
};

/** Un escenario controlable: llamada, escritura, reloj de 5 s a mano. */
function escenario(o: { enLlamada?: boolean; escribiendo?: boolean; almacen?: AlmacenMinimo; recargaOk?: boolean } = {}) {
  const estado = { enLlamada: !!o.enLlamada, escribiendo: !!o.escribiendo };
  let tic: (() => void) | null = null;
  const almacen = o.almacen ?? almacenDePrueba();
  const pasarALaNueva = vi.fn(async () => {
    if (estado.enLlamada || estado.escribiendo) return false;
    if (o.recargaOk === false) return false;
    marcarRecarga(almacen, "100");
    return true;
  });
  const opciones: OpcionesDeLaRecarga = {
    enLlamada: () => estado.enLlamada,
    aMedioEscribir: () => estado.escribiendo,
    pasarALaNueva,
    mostrarEnLlamada: vi.fn(),
    mostrarNormal: vi.fn(),
    almacen,
    build: "100",
    programar: (fn) => { tic = fn; return 1; },
    cancelar: () => { tic = null; },
  };
  const pedir = crearRecargaAlColgar(opciones);
  const tocar = async () => { tic?.(); await new Promise<void>((r) => setTimeout(r, 0)); };
  return { estado, pedir, tocar, opciones, pasarALaNueva, almacen, mirando: () => tic !== null };
}

const esperarMicro = () => new Promise<void>((r) => setTimeout(r, 0));

describe("versión nueva sin llamada", () => {
  it("se recarga sola, en el acto", async () => {
    const e = escenario();
    e.pedir();
    await esperarMicro();
    expect(e.pasarALaNueva).toHaveBeenCalledTimes(1);
    expect(e.opciones.mostrarEnLlamada).not.toHaveBeenCalled();
  });

  it("escribiendo algo, espera; cuando termina, recarga", async () => {
    const e = escenario({ escribiendo: true });
    e.pedir();
    await esperarMicro();
    expect(e.pasarALaNueva).not.toHaveBeenCalled();
    expect(e.mirando()).toBe(true);
    e.estado.escribiendo = false;
    await e.tocar();
    expect(e.pasarALaNueva).toHaveBeenCalledTimes(1);
  });
});

describe("⚠️ versión nueva CON llamada: nunca recarga en la llamada", () => {
  it("aviso sin botón y espera; al colgar, recarga", async () => {
    const e = escenario({ enLlamada: true });
    e.pedir();
    await esperarMicro();
    expect(e.opciones.mostrarEnLlamada).toHaveBeenCalledTimes(1);
    expect(e.pasarALaNueva).not.toHaveBeenCalled();
    for (let i = 0; i < 5; i++) await e.tocar(); // sigue en la llamada
    expect(e.pasarALaNueva).not.toHaveBeenCalled();
    expect(e.opciones.mostrarEnLlamada).toHaveBeenCalledTimes(1); // el aviso no se repite
    e.estado.enLlamada = false;
    await e.tocar();
    expect(e.pasarALaNueva).toHaveBeenCalledTimes(1);
  });

  it("si a último momento entra a una llamada (pasarALaNueva dice que no), sigue esperando", async () => {
    const e = escenario({ recargaOk: false });
    e.pedir();
    await esperarMicro();
    expect(e.pasarALaNueva).toHaveBeenCalledTimes(1);
    expect(e.mirando()).toBe(true);
  });
});

describe("una vez por versión: sin bucle", () => {
  it("si ya recargó desde este build y sigue en él, no recarga: deja el aviso de siempre", async () => {
    const almacen = almacenDePrueba();
    marcarRecarga(almacen, "100");
    const e = escenario({ almacen });
    e.pedir();
    await esperarMicro();
    expect(e.pasarALaNueva).not.toHaveBeenCalled();
    expect(e.opciones.mostrarNormal).toHaveBeenCalledTimes(1);
    e.pedir(); // otra señal de versión nueva: tampoco
    await esperarMicro();
    expect(e.pasarALaNueva).not.toHaveBeenCalled();
  });

  it("un build NUEVO sí puede recargar (la marca era del anterior)", () => {
    const almacen = almacenDePrueba();
    marcarRecarga(almacen, "99");
    expect(yaRecargoDesde(almacen, "100")).toBe(false);
    expect(yaRecargoDesde(almacen, "99")).toBe(true);
    expect(almacen.datos.get(CLAVE_RECARGA)).toBe("99");
  });

  it("sin almacén (navegador que no deja) no tira", () => {
    expect(yaRecargoDesde(null, "1")).toBe(false);
    expect(() => marcarRecarga(null, "1")).not.toThrow();
  });
});

describe("¿algo a medio escribir?", () => {
  beforeEach(() => { document.body.innerHTML = ""; });
  const visible = (el: Element) => { (el as HTMLElement).getClientRects = () => [{}] as unknown as DOMRectList; return el; };

  it("nada → no", () => {
    document.body.innerHTML = "<div><button>ok</button></div>";
    expect(hayAlgoAMedioEscribir()).toBe(false);
  });

  it("el cursor en un campo de texto → sí", () => {
    document.body.innerHTML = '<input type="text" id="c">';
    (document.getElementById("c") as HTMLInputElement).focus();
    expect(hayAlgoAMedioEscribir()).toBe(true);
  });

  it("un mensaje sin mandar en un área de texto visible → sí; vacía u oculta → no", () => {
    document.body.innerHTML = "<textarea id='t'></textarea>";
    const t = visible(document.getElementById("t")!) as HTMLTextAreaElement;
    expect(hayAlgoAMedioEscribir()).toBe(false);
    t.value = "hola, ya te mando";
    expect(hayAlgoAMedioEscribir()).toBe(true);
    t.getClientRects = () => [] as unknown as DOMRectList;
    expect(hayAlgoAMedioEscribir()).toBe(false);
  });

  it("un formulario tocado → sí; el buscador no cuenta", () => {
    document.body.innerHTML = '<form><input id="n" type="text" value=""><input id="b" type="search" value=""></form>';
    const b = visible(document.getElementById("b")!) as HTMLInputElement;
    b.value = "algo";
    expect(hayAlgoAMedioEscribir()).toBe(false);
    const n = visible(document.getElementById("n")!) as HTMLInputElement;
    n.value = "Ana";
    expect(hayAlgoAMedioEscribir()).toBe(true);
  });
});

describe("pwa.ts y registroDelSw lo usan así", () => {
  it("la versión nueva (con o sin llamada, y cuando el SW nuevo toma control) va por el camino seguro", () => {
    const s = leer("src/pwa.ts");
    expect(s).toContain("const avisar = crearRecargaAlColgar({");
    expect(s).toMatch(/alNecesitarRecarga: avisar,/);
    expect(s).toMatch(/alQuedarPendiente: avisar,/);
    expect(s).toMatch(/recargar: avisar,/);
    // Antes de recargar se vuelve a mirar la llamada y lo escrito, y se marca el build.
    expect(s).toContain("const ocupada = () => hayLlamadaActiva() || hayAlgoAMedioEscribir();");
    expect(s).toContain("pasarALaNueva: () => forzarActualizacion(registro, updateSW, recargarUnaVez, ocupada)");
    expect(s).toContain("const recargarUnaVez = () => { marcarRecarga(almacen, build); window.location.reload(); };");
  });

  it("el aviso con llamada no trae botón", () => {
    const s = leer("src/pwa.ts");
    const enLlamada = s.slice(s.indexOf("mostrarEnLlamada: () => {"), s.indexOf("mostrarNormal: () =>"));
    expect(enLlamada).toContain('"pwa.actualizar.enLlamada"');
    expect(enLlamada).not.toContain("action");
  });

  it("⚠️ registroDelSw sigue sin recargar con llamada (PR #41)", () => {
    const s = leer("lib/registroDelSw.ts");
    expect(s).toMatch(/if \(o\.enLlamada\(\)\) \{\s*o\.alQuedarPendiente\(\);\s*return;\s*\}/);
  });
});
