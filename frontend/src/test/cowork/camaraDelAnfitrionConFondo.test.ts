import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// GUARDA (Alvaro, 18/11/2026): «no puedo poner el blur en Cowork». El motor del
// desenfoque andaba; el hueco era que el tablero del anfitrión repartía a las
// salas la cámara CRUDA de getUserMedia, sin pasar por ningún procesador, y no
// tenía botón para difuminar. Esta guarda cuida las dos cosas:
//   · la cámara del anfitrión pasa por el procesador de fondo cuando el fondo
//     guardado (el mismo de las llamadas) es desenfoque, y nunca se queda sin
//     cámara por culpa del fondo;
//   · el tablero tiene el botón «Difuminar fondo» y alterna.

const estado = vi.hoisted(() => ({
  soporta: true,
  precalentado: true,
  procesadores: [] as Array<Record<string, unknown>>,
  enganche: "ok" as "ok" | "falla" | "cuelga" | "manual",
  soltarEnganche: null as null | (() => void),
  pistas: [] as Array<Record<string, unknown>>,
  precalentar: 0,
}));

function pistaFalsa(nombre: string) {
  const p = {
    nombre,
    readyState: "live" as MediaStreamTrackState,
    stop: vi.fn(() => { p.readyState = "ended"; }),
  };
  return p;
}

vi.mock("@/lib/fondoFino/procesador", () => ({
  soportaProcesadorDeFondo: () => estado.soporta,
  fondoPrecalentado: () => estado.precalentado,
  precalentarFondo: () => { estado.precalentar++; return Promise.resolve(true); },
  topeParaPonerFondo: (ms: number) => ms,
  ProcesadorDeFondo: vi.fn((opciones: Record<string, unknown>) => {
    const p = {
      opciones,
      processedTrack: undefined as unknown,
      switchTo: vi.fn(() => Promise.resolve()),
      destroy: vi.fn(() => Promise.resolve()),
      transformer: { destroy: vi.fn(() => Promise.resolve()) },
      trackGenerator: undefined,
    };
    estado.procesadores.push(p);
    return p;
  }),
}));

vi.mock("livekit-client", () => ({
  LocalVideoTrack: class {
    cruda: unknown;
    procesador: { processedTrack: unknown } | undefined;
    constructor(cruda: unknown) {
      this.cruda = cruda;
      estado.pistas.push(this as unknown as Record<string, unknown>);
    }
    setProcessor = vi.fn((p: { processedTrack: unknown }) => {
      if (estado.enganche === "falla") return Promise.reject(new Error("webgl"));
      if (estado.enganche === "cuelga") return new Promise<void>(() => { /* nunca */ });
      this.procesador = p;
      p.processedTrack = pistaFalsa("procesada");
      if (estado.enganche === "manual") return new Promise<void>((r) => { estado.soltarEnganche = r; });
      return Promise.resolve();
    });
    stopProcessor = vi.fn(() => Promise.resolve());
    stop = vi.fn();
  },
}));

import { crearCamaraDelAnfitrion, TOPE_ENGANCHE_MS } from "@/lib/camaraDelAnfitrion";
import { ProcesadorDeFondo } from "@/lib/fondoFino/procesador";
import { alternarBlur, guardarFondo, leerFondoGuardado, RADIO_DE_BLUR } from "@/lib/fondoDeLlamada";

const crudaFalsa = () => pistaFalsa("cruda") as unknown as MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };

beforeEach(() => {
  estado.soporta = true;
  estado.precalentado = true;
  estado.procesadores = [];
  estado.pistas = [];
  estado.enganche = "ok";
  estado.soltarEnganche = null;
  estado.precalentar = 0;
  vi.mocked(ProcesadorDeFondo).mockClear();
  guardarFondo("none");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("la cámara del anfitrión con el fondo elegido", () => {
  it("con desenfoque guardado, la cámara pasa por el procesador y a las salas va la procesada", async () => {
    // La misma preferencia de las llamadas: lo que eligió ahí vale en Cowork.
    guardarFondo("blur");
    const cruda = crudaFalsa();
    const camara = crearCamaraDelAnfitrion(cruda);

    const r = await camara.aplicar(leerFondoGuardado());

    expect(r).toBe("puesto");
    expect(ProcesadorDeFondo).toHaveBeenCalledTimes(1);
    // Se crea YA en el modo pedido: el primer cuadro sale difuminado.
    expect(vi.mocked(ProcesadorDeFondo).mock.calls[0][0]).toMatchObject({ mode: "background-blur", blurRadius: RADIO_DE_BLUR.blur });
    const lk = estado.pistas[0] as unknown as { cruda: unknown; setProcessor: ReturnType<typeof vi.fn> };
    expect(lk.cruda).toBe(cruda);
    expect(lk.setProcessor).toHaveBeenCalledWith(estado.procesadores[0], false);
    expect(camara.salida()).toBe(estado.procesadores[0].processedTrack);
    expect(camara.salida()).not.toBe(cruda);
  });

  it("sin fondo guardado, no se engancha nada y va la cámara cruda", async () => {
    const cruda = crudaFalsa();
    const camara = crearCamaraDelAnfitrion(cruda);
    expect(await camara.aplicar(leerFondoGuardado())).toBe("sin-fondo");
    expect(ProcesadorDeFondo).not.toHaveBeenCalled();
    expect(camara.salida()).toBe(cruda);
  });

  it("la primera vez avisa «Preparando el fondo…» y baja el detector", async () => {
    estado.precalentado = false;
    const alPrimeraCarga = vi.fn();
    const camara = crearCamaraDelAnfitrion(crudaFalsa(), { alPrimeraCarga });
    await camara.aplicar("blur");
    expect(alPrimeraCarga).toHaveBeenCalledTimes(1);
    expect(estado.precalentar).toBe(1);
  });

  it("si el navegador no puede, sale la cámara cruda (nunca sin cámara)", async () => {
    estado.soporta = false;
    const cruda = crudaFalsa();
    const camara = crearCamaraDelAnfitrion(cruda);
    expect(await camara.aplicar("blur")).toBe("no-soportado");
    expect(ProcesadorDeFondo).not.toHaveBeenCalled();
    expect(camara.salida()).toBe(cruda);
  });

  it("si el procesador falla al engancharse, sale la cruda y se suelta lo que quedó", async () => {
    estado.enganche = "falla";
    const cruda = crudaFalsa();
    const camara = crearCamaraDelAnfitrion(cruda);
    expect(await camara.aplicar("blur")).toBe("fallo");
    expect(camara.salida()).toBe(cruda);
    expect(cruda.stop).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(estado.procesadores[0].destroy).toHaveBeenCalled());
  });

  it("si el enganche se cuelga, al tope sale la cruda", async () => {
    vi.useFakeTimers();
    estado.enganche = "cuelga";
    const cruda = crudaFalsa();
    const camara = crearCamaraDelAnfitrion(cruda);
    const r = camara.aplicar("blur");
    await vi.advanceTimersByTimeAsync(TOPE_ENGANCHE_MS + 10);
    expect(await r).toBe("fallo");
    expect(camara.salida()).toBe(cruda);
  });

  it("cambiar con la cámara al aire no re-publica: el procesador se engancha una vez y solo cambia de modo", async () => {
    const camara = crearCamaraDelAnfitrion(crudaFalsa());
    await camara.aplicar("blur");
    const procesada = camara.salida();
    const p = estado.procesadores[0] as { switchTo: ReturnType<typeof vi.fn> };

    expect(await camara.aplicar("none")).toBe("sin-fondo");
    expect(p.switchTo).toHaveBeenLastCalledWith({ mode: "disabled" });
    expect(camara.salida()).toBe(procesada);

    expect(await camara.aplicar("blur-strong")).toBe("puesto");
    expect(p.switchTo).toHaveBeenLastCalledWith({ mode: "background-blur", blurRadius: RADIO_DE_BLUR["blur-strong"] });
    expect(camara.salida()).toBe(procesada);
    expect(ProcesadorDeFondo).toHaveBeenCalledTimes(1);
  });

  it("tres toques seguidos: solo se hace el último", async () => {
    const camara = crearCamaraDelAnfitrion(crudaFalsa());
    const [a, b, c] = [camara.aplicar("blur"), camara.aplicar("none"), camara.aplicar("blur")];
    // Los dos primeros quedaron viejos antes de empezar: se hace solo el último.
    expect(await a).toBe("reemplazado");
    expect(await b).toBe("reemplazado");
    expect(await c).toBe("puesto");
    expect(ProcesadorDeFondo).toHaveBeenCalledTimes(1);
  });

  it("si el procesador se cae con la cámara al aire, vuelve la cruda y avisa", async () => {
    vi.useFakeTimers();
    const alCaerse = vi.fn();
    const cruda = crudaFalsa();
    const camara = crearCamaraDelAnfitrion(cruda, { alCaerse });
    await camara.aplicar("blur");
    (camara.salida() as unknown as { readyState: string }).readyState = "ended";
    await vi.advanceTimersByTimeAsync(5_100);
    expect(alCaerse).toHaveBeenCalledTimes(1);
    expect(camara.salida()).toBe(cruda);
  });

  it("al apagar la cámara se limpia todo: procesador, pista procesada y cruda", async () => {
    const cruda = crudaFalsa();
    const camara = crearCamaraDelAnfitrion(cruda);
    await camara.aplicar("blur");
    const procesada = camara.salida() as unknown as { stop: ReturnType<typeof vi.fn> };
    const p = estado.procesadores[0] as { destroy: ReturnType<typeof vi.fn> };
    await camara.destruir();
    expect(procesada.stop).toHaveBeenCalled();
    expect(p.destroy).toHaveBeenCalled();
    expect(cruda.stop).toHaveBeenCalled();
    expect(await camara.aplicar("blur")).toBe("apagada");
  });

  it("si la cámara se apaga mientras engancha, el procesador tardío se suelta", async () => {
    estado.enganche = "manual";
    const cruda = crudaFalsa();
    const camara = crearCamaraDelAnfitrion(cruda);
    const r = camara.aplicar("blur");
    await vi.waitFor(() => expect(estado.soltarEnganche).not.toBeNull());
    const p = estado.procesadores[0] as { destroy: ReturnType<typeof vi.fn>; processedTrack: { stop: ReturnType<typeof vi.fn> } };
    await camara.destruir();
    estado.soltarEnganche?.();
    expect(await r).toBe("apagada");
    expect(p.processedTrack.stop).toHaveBeenCalled();
    expect(p.destroy).toHaveBeenCalled();
    expect(cruda.stop).toHaveBeenCalled();
  });
});

// ── El tablero ──────────────────────────────────────────────────────────────

const fuentes = import.meta.glob("../../pages/cowork/CoworkHostDashboard.tsx", { query: "?raw", import: "default", eager: true });
const tablero = Object.values(fuentes)[0] as string;

describe("el tablero del anfitrión", () => {
  it("la cámara que se reparte sale de la cámara con fondo, con la preferencia de las llamadas", () => {
    expect(tablero).toBeTruthy();
    expect(tablero).toContain("crearCamaraDelAnfitrion(track");
    const efecto = tablero.slice(tablero.indexOf("crearCamaraDelAnfitrion(track"));
    expect(efecto).toContain("leerFondoGuardado()");
    expect(efecto).toContain("ponerFondoEnCamara(cam, efecto)");
    // La cruda ya no se reparte a mano: siempre por la salida de la cámara.
    expect(tablero).not.toMatch(/setCamBaseTrack\(track\)/);
    expect(tablero).toContain("setCamBaseTrack(camara.salida())");
    // Al apagar se limpia todo.
    expect(tablero).toContain("camara.destruir()");
  });

  it("tiene el botón «Difuminar fondo» junto a «Cámara», y alterna y guarda", () => {
    const camara = tablero.indexOf('t("cowork.host.camera")}</span>');
    const boton = tablero.indexOf('data-boton="difuminar-fondo"');
    expect(camara).toBeGreaterThan(0);
    expect(boton).toBeGreaterThan(camara);
    const bloque = tablero.slice(tablero.lastIndexOf("<Button", boton), tablero.indexOf("</Button>", boton));
    expect(bloque).toContain("onClick={alternarDifuminado}");
    expect(bloque).toContain('t("cowork.host.blur")');
    expect(bloque).toContain("aria-pressed={esBlur(fondo)}");
    // «Preparando el fondo…» mientras engancha.
    expect(bloque).toContain("preparandoFondo");
    const alternar = tablero.slice(tablero.indexOf("const alternarDifuminado"));
    expect(alternar).toContain("alternarBlur(fondoRef.current, ultimoBlurRef.current)");
    expect(alternar).toContain("guardarFondo(nuevo)");
    expect(alternar).toContain("ponerFondoEnCamara(camara, nuevo)");
  });

  it("el botón alterna como el de la llamada: difumina, quita y devuelve el último nivel", () => {
    // Lo mismo que hace alternarDifuminado, toque a toque.
    let fondo = leerFondoGuardado();
    let ultimo = "blur";
    const tocar = () => {
      fondo = alternarBlur(fondo, ultimo);
      if (fondo !== "none") ultimo = fondo;
      guardarFondo(fondo);
    };
    expect(fondo).toBe("none");
    tocar();
    expect(fondo).toBe("blur");
    expect(leerFondoGuardado()).toBe("blur");
    tocar();
    expect(fondo).toBe("none");
    expect(leerFondoGuardado()).toBe("none");
    // Si en la llamada eligió «fuerte», el botón lo devuelve fuerte.
    ultimo = "blur-strong";
    tocar();
    expect(fondo).toBe("blur-strong");
  });
});
