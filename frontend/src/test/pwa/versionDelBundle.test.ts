// LA VERSIÓN DEL BUNDLE: quién tiene un Maven sin la etiqueta API, y el mínimo
// que obliga a actualizar (lib/versionDelBundle.ts, lib/minimoDelBundle.ts, pwa.ts).
//
// Lo que más importa probar es lo que NO tiene que pasar: una pestaña que se
// recarga sola sin parar. Un bucle de recargas deja Maven inservible para quien lo
// tenga abierto, así que cada camino que podría repetirse tiene su caso.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Las fuentes se leen con import.meta.glob (el tsconfig de la app no trae los
// tipos de Node). Ruta y opciones literales: Vite lo resuelve al compilar.
type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
const uno = (m: Record<string, string>) => Object.values(m)[0] ?? "";
const FUENTE_PRESENCIA = uno((import.meta as unknown as Glob).glob("/frontend/src/hooks/useOnlinePresence.ts", { query: "?raw", import: "default", eager: true }));
const FUENTE_PWA = uno((import.meta as unknown as Glob).glob("/frontend/src/pwa.ts", { query: "?raw", import: "default", eager: true }));
const FUENTE_VITE = uno((import.meta as unknown as Glob).glob("/vite.config.ts", { query: "?raw", import: "default", eager: true }));

const base = vi.hoisted(() => ({
  sesion: { user: { id: "yo" } } as unknown,
  respuesta: { data: { valor: "2000" } as unknown, error: null as unknown },
  consultas: [] as { tabla: string; columnas: string; filtro: [string, unknown] }[],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: base.sesion } }) },
    from: (tabla: string) => {
      const q = { tabla, columnas: "", filtro: ["", null] as [string, unknown] };
      const c = {
        select: (cols: string) => { q.columnas = cols; return c; },
        eq: (col: string, v: unknown) => { q.filtro = [col, v]; return c; },
        maybeSingle: () => { base.consultas.push(q); return Promise.resolve(base.respuesta); },
      };
      return c;
    },
  },
}));

import {
  versionesDesdePresencia, interpretarMinimo, crearVigiaDelMinimo, buildDeLaPresencia,
  FRENO_DEL_MINIMO_MS, TOLERANCIA_FUTURO_MS, CLAVE_DEL_FORZADO, BUILD_PROPIO,
  type AlmacenDeLaPestana, type DependenciasDelVigia,
} from "@/lib/versionDelBundle";
import { leerUiBuildMinimo, forzarActualizacion } from "@/lib/minimoDelBundle";

beforeEach(() => {
  base.sesion = { user: { id: "yo" } };
  base.respuesta = { data: { valor: "2000" }, error: null };
  base.consultas.length = 0;
});

// ─── versionesConectadas ─────────────────────────────────────────────────────

describe("versionesDesdePresencia: quién sigue con un Maven anterior al mínimo", () => {
  it("nadie conectado → nadie", () => {
    expect(versionesDesdePresencia({}, 1000)).toEqual([]);
    expect(versionesDesdePresencia(null, 1000)).toEqual([]);
  });

  it("con b al día no cuenta; con b anterior, sí (con su build)", () => {
    expect(versionesDesdePresencia({
      ana: [{ user_id: "ana", b: 1500, presence_ref: "r1" }],
      beto: [{ user_id: "beto", b: 900, presence_ref: "r2" }],
      caro: [{ user_id: "caro", b: 1000, presence_ref: "r3" }], // igual al mínimo = al día
    }, 1000)).toEqual([{ userId: "beto", build: 900 }]);
  });

  it("sin b (un bundle de antes de este cambio) cuenta como viejo", () => {
    // Es la razón de existir del contador: los bundles de hoy no mandan `b`.
    expect(versionesDesdePresencia({ ana: [{ user_id: "ana", status: "available" }] }, 1000))
      .toEqual([{ userId: "ana", build: null }]);
  });

  it("mira TODAS las pestañas: basta una vieja", () => {
    expect(versionesDesdePresencia({
      ana: [{ b: 5000 }, { b: 700 }, { b: 3000 }],
      beto: [{ b: 5000 }, { status: "away" }],
      caro: [{ b: 5000 }, { b: 6000 }],
    }, 1000)).toEqual([
      { userId: "ana", build: 700 },
      { userId: "beto", build: null },
    ]);
  });

  it("un b que no es un número válido es como no tenerlo", () => {
    for (const b of ["1500", 0, -1, Number.NaN, Number.POSITIVE_INFINITY, null]) {
      expect(buildDeLaPresencia({ b })).toBeNull();
      expect(versionesDesdePresencia({ ana: [{ b }] }, 1)).toEqual([{ userId: "ana", build: null }]);
    }
  });

  it("también cuenta a quien aparece como desconectado: igual tiene Maven abierto", () => {
    expect(versionesDesdePresencia({ jefe: [{ status: "offline", b: 10 }] }, 1000)).toEqual([{ userId: "jefe", build: 10 }]);
  });
});

describe("la presencia lleva el build (useOnlinePresence)", () => {
  // La presencia es broadcast: el build viaja sin escribir en la base. Se lee el
  // archivo porque los dos track() (al suscribir y al cambiar de estado) tienen
  // que llevarlo; con uno solo, quien nunca cambia de estado no lo mandaría.
  const src = FUENTE_PRESENCIA;
  it("los dos track() llevan `b`", () => {
    // Un glob que no carga nada pasaría todo en verde.
    expect(src.length).toBeGreaterThan(1000);
    const tracks = src.split(/\.track\(\{/).slice(1).map((t) => t.slice(0, t.indexOf("});")));
    expect(tracks).toHaveLength(2);
    for (const t of tracks) expect(t).toContain("...BUILD_EN_LA_PRESENCIA");
  });
  it("expone versionesConectadas leyendo la presencia, sin consultar la base", () => {
    const cuerpo = src.slice(src.indexOf("const versionesConectadas"), src.indexOf("}, []);", src.indexOf("const versionesConectadas")));
    expect(cuerpo).toContain("versionesDesdePresencia(canal?.presenceState?.()");
    expect(cuerpo).not.toMatch(/supabase|\.from\(|\.rpc\(/);
  });
  it("en los tests no hay build (sin el define de Vite): no se manda b ni se fuerza nada", () => {
    expect(BUILD_PROPIO).toBe(0);
  });
});

// ─── el mínimo ──────────────────────────────────────────────────────────────

describe("interpretarMinimo: qué valor de app_flags vale", () => {
  const ahora = 1_759_000_000_000;
  it("ms como texto (lo que guarda app_flags.valor) o número", () => {
    expect(interpretarMinimo("1758999999999", ahora)).toBe(1_758_999_999_999);
    expect(interpretarMinimo(" 1758999999999 ", ahora)).toBe(1_758_999_999_999);
    expect(interpretarMinimo(1_758_999_999_999, ahora)).toBe(1_758_999_999_999);
  });
  it("vacío, null, basura, negativo, decimal o cero → no hay mínimo", () => {
    for (const v of [null, undefined, "", "  ", "abc", "-5", "1.5", "0", "1e12", {}, [], true]) {
      expect(interpretarMinimo(v, ahora)).toBeNull();
    }
  });
  it("en el futuro (más de un día) no es una hora de build: se ignora", () => {
    expect(interpretarMinimo(String(ahora + TOLERANCIA_FUTURO_MS + 1), ahora)).toBeNull();
    // Microsegundos en vez de ms: forzaría en cada deploy para siempre.
    expect(interpretarMinimo(String(ahora * 1000), ahora)).toBeNull();
    expect(interpretarMinimo(String(ahora + 60_000), ahora)).toBe(ahora + 60_000);
  });
});

/** sessionStorage de mentira que sobrevive a la "recarga" (se comparte entre vigías). */
function almacen(): AlmacenDeLaPestana & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => { datos.set(k, v); } };
}

function vigia(extra: Partial<DependenciasDelVigia> & { valor?: unknown } = {}) {
  const reloj = { t: 1_000_000 };
  const forzar = vi.fn();
  const leerMinimo = vi.fn(async () => ("valor" in extra ? extra.valor : "2000"));
  const deps: DependenciasDelVigia = {
    propio: 1000, leerMinimo, forzar, almacen: almacen(), ahora: () => reloj.t, ...extra,
  };
  return { revisar: crearVigiaDelMinimo(deps), forzar, leerMinimo, reloj, deps };
}

describe("el vigía de ui_build_minimo", () => {
  it("build viejo → fuerza la actualización UNA vez", async () => {
    const v = vigia();
    expect(await v.revisar()).toBe("forzado");
    expect(v.forzar).toHaveBeenCalledTimes(1);
    expect(v.deps.almacen!.getItem(CLAVE_DEL_FORZADO)).toBe("2000:1000");
  });

  it("build igual o más nuevo → nada", async () => {
    for (const propio of [2000, 2001]) {
      const v = vigia({ propio });
      expect(await v.revisar()).toBe("al_dia");
      expect(v.forzar).not.toHaveBeenCalled();
    }
  });

  it("sin la fila, con valor null, la columna sin crear o la lectura caída → nada", async () => {
    for (const valor of [null, undefined, "", "x"]) {
      const v = vigia({ valor });
      expect(await v.revisar()).toBe("sin_minimo");
      expect(v.forzar).not.toHaveBeenCalled();
    }
    const caida = vigia({ leerMinimo: () => Promise.reject(new Error("red")) });
    expect(await caida.revisar()).toBe("sin_minimo");
    expect(caida.forzar).not.toHaveBeenCalled();
  });

  it("sin bucle: si tras recargar sigue el MISMO build, no vuelve a forzar nunca", async () => {
    // Una pestaña con el build 1000 y un mínimo de 2000 que ningún deploy
    // satisface (el deploy no llegó, o el valor es de un build que no existe).
    // Cada "recarga" es un vigía nuevo (memoria nueva) con el mismo sessionStorage.
    const pestana = almacen();
    let recargas = 0;
    for (let carga = 0; carga < 20; carga++) {
      const reloj = { t: 1_000_000 + carga * 10 * FRENO_DEL_MINIMO_MS };
      const revisar = crearVigiaDelMinimo({
        propio: 1000, leerMinimo: async () => "2000", almacen: pestana, ahora: () => reloj.t,
        forzar: () => { recargas++; },
      });
      for (let foco = 0; foco < 5; foco++) {
        await revisar();
        reloj.t += FRENO_DEL_MINIMO_MS; // vuelve el foco después de cada freno
      }
    }
    // MUTANTE: sin la marca en sessionStorage, serían 20×5 = 100 recargas.
    expect(recargas).toBe(1);
  });

  it("con un deploy de por medio (otro build, todavía viejo) fuerza otra vez, y una sola", async () => {
    const pestana = almacen();
    const forzar = vi.fn();
    const r1 = crearVigiaDelMinimo({ propio: 1000, leerMinimo: async () => "2000", almacen: pestana, ahora: () => 1e6, forzar });
    expect(await r1()).toBe("forzado");
    // Recargó y llegó el build 1500 (más nuevo, pero no alcanza el mínimo).
    const r2 = crearVigiaDelMinimo({ propio: 1500, leerMinimo: async () => "2000", almacen: pestana, ahora: () => 1e6, forzar });
    expect(await r2()).toBe("forzado");
    const r3 = crearVigiaDelMinimo({ propio: 1500, leerMinimo: async () => "2000", almacen: pestana, ahora: () => 1e6, forzar });
    expect(await r3()).toBe("ya_forzado");
    expect(forzar).toHaveBeenCalledTimes(2);
    // Y con el build bueno, nada más.
    const r4 = crearVigiaDelMinimo({ propio: 2500, leerMinimo: async () => "2000", almacen: pestana, ahora: () => 1e6, forzar });
    expect(await r4()).toBe("al_dia");
    expect(forzar).toHaveBeenCalledTimes(2);
  });

  it("un mínimo nuevo (más alto) vuelve a forzar a la pestaña que ya se había forzado por el anterior", async () => {
    const pestana = almacen();
    const forzar = vi.fn();
    expect(await crearVigiaDelMinimo({ propio: 1000, leerMinimo: async () => "2000", almacen: pestana, ahora: () => 1e6, forzar })()).toBe("forzado");
    expect(await crearVigiaDelMinimo({ propio: 1000, leerMinimo: async () => "3000", almacen: pestana, ahora: () => 1e6, forzar })()).toBe("forzado");
    expect(forzar).toHaveBeenCalledTimes(2);
  });

  it("si no se puede anotar el forzado, no fuerza (sin la marca podría haber bucle)", async () => {
    const sinAlmacen = vigia({ almacen: null });
    expect(await sinAlmacen.revisar()).toBe("sin_almacen");
    const quetira = vigia({ almacen: { getItem: () => null, setItem: () => { throw new Error("QuotaExceeded"); } } });
    expect(await quetira.revisar()).toBe("sin_almacen");
    const queolvida = vigia({ almacen: { getItem: () => null, setItem: () => {} } });
    expect(await queolvida.revisar()).toBe("sin_almacen");
    for (const v of [sinAlmacen, quetira, queolvida]) expect(v.forzar).not.toHaveBeenCalled();
  });

  it("con una llamada conectada no recarga, y la próxima revisión sin llamada sí", async () => {
    let enLlamada = true;
    const v = vigia({ ocupado: () => enLlamada });
    expect(await v.revisar()).toBe("en_llamada");
    expect(v.forzar).not.toHaveBeenCalled();
    // No anotó nada: la marca es la que impediría forzar después.
    expect(v.deps.almacen!.getItem(CLAVE_DEL_FORZADO)).toBeNull();
    enLlamada = false;
    v.reloj.t += FRENO_DEL_MINIMO_MS;
    expect(await v.revisar()).toBe("forzado");
  });

  it("freno de 10 min: volver el foco seguido no vuelve a leer la base", async () => {
    const v = vigia({ propio: 5000 });
    expect(await v.revisar()).toBe("al_dia");
    v.reloj.t += FRENO_DEL_MINIMO_MS - 1;
    expect(await v.revisar()).toBe("frenado");
    expect(v.leerMinimo).toHaveBeenCalledTimes(1);
    v.reloj.t += 1;
    expect(await v.revisar()).toBe("al_dia");
    expect(v.leerMinimo).toHaveBeenCalledTimes(2);
  });

  it("recién cargada no pregunta: la página nueva ya trae el último bundle", async () => {
    const v = vigia({ desde: 1_000_000 });
    expect(await v.revisar()).toBe("frenado");
    expect(v.leerMinimo).not.toHaveBeenCalled();
    v.reloj.t += FRENO_DEL_MINIMO_MS;
    expect(await v.revisar()).toBe("forzado");
  });

  it("focus y visibilitychange a la vez: una sola lectura", async () => {
    const v = vigia({ propio: 5000 });
    const [a, b] = await Promise.all([v.revisar(), v.revisar()]);
    expect([a, b].sort()).toEqual(["al_dia", "frenado"]);
    expect(v.leerMinimo).toHaveBeenCalledTimes(1);
  });

  it("sin build propio (0) no lee ni fuerza", async () => {
    const v = vigia({ propio: 0 });
    expect(await v.revisar()).toBe("sin_build");
    expect(v.leerMinimo).not.toHaveBeenCalled();
  });
});

describe("leerUiBuildMinimo: la lectura es barata y tolerante", () => {
  it("una fila por clave, solo la columna valor", async () => {
    expect(await leerUiBuildMinimo()).toBe("2000");
    expect(base.consultas).toEqual([{ tabla: "app_flags", columnas: "valor", filtro: ["key", "ui_build_minimo"] }]);
  });
  it("sin sesión no pregunta", async () => {
    base.sesion = null;
    expect(await leerUiBuildMinimo()).toBeNull();
    expect(base.consultas).toEqual([]);
  });
  it("sin la fila → null", async () => {
    base.respuesta = { data: null, error: null };
    expect(await leerUiBuildMinimo()).toBeNull();
  });
  it("sin la columna (base sin la migración B: 42703) → null, no tira", async () => {
    base.respuesta = { data: null, error: { code: "42703", message: 'column app_flags.valor does not exist' } };
    expect(await leerUiBuildMinimo()).toBeNull();
  });
});

describe("forzarActualizacion: busca el SW nuevo y recarga", () => {
  it("sin SW esperando: update() y recarga", async () => {
    const update = vi.fn(() => Promise.resolve());
    const updateSW = vi.fn(() => Promise.resolve());
    const recargar = vi.fn();
    await forzarActualizacion({ update, waiting: null } as unknown as ServiceWorkerRegistration, updateSW, recargar);
    expect(update).toHaveBeenCalledTimes(1);
    expect(updateSW).not.toHaveBeenCalled();
    expect(recargar).toHaveBeenCalledTimes(1);
  });
  it("con uno esperando: primero updateSW(true), después recarga igual", async () => {
    vi.useFakeTimers();
    try {
      const updateSW = vi.fn(() => Promise.resolve());
      const recargar = vi.fn();
      const p = forzarActualizacion({ update: () => Promise.resolve(), waiting: {} } as unknown as ServiceWorkerRegistration, updateSW, recargar);
      await vi.advanceTimersByTimeAsync(2000);
      await p;
      expect(updateSW).toHaveBeenCalledWith(true);
      expect(recargar).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it("si update() falla (sin red), recarga igual", async () => {
    const recargar = vi.fn();
    await forzarActualizacion({ update: () => Promise.reject(new Error("offline")), waiting: null } as unknown as ServiceWorkerRegistration, vi.fn(), recargar);
    expect(recargar).toHaveBeenCalledTimes(1);
  });
});

describe("pwa.ts conecta el vigía", () => {
  // pwa.ts importa el módulo virtual del plugin de PWA (no existe en los tests):
  // se lee el archivo.
  const src = FUENTE_PWA;
  it("se cargaron las fuentes", () => {
    expect(src.length).toBeGreaterThan(1000);
    expect(FUENTE_VITE.length).toBeGreaterThan(1000);
  });
  it("con el build propio, la lectura del mínimo, el sessionStorage y la llamada activa", () => {
    expect(src).toMatch(/crearVigiaDelMinimo\(\{[\s\S]*propio: BUILD_PROPIO,[\s\S]*leerMinimo: leerUiBuildMinimo,[\s\S]*forzar: \(\) => forzarActualizacion\(registro, updateSW\),[\s\S]*almacen: almacenDeLaPestana\(\),[\s\S]*ocupado: hayLlamadaActiva,[\s\S]*desde: Date\.now\(\),/);
  });
  it("al volver el foco (focus y visibilitychange), solo con la pestaña visible", () => {
    expect(src).toContain('window.addEventListener("focus", revisar)');
    expect(src).toContain('document.addEventListener("visibilitychange", revisar)');
    expect(src).toMatch(/const revisar = \(\) => \{ if \(document\.visibilityState === "visible"\) void alVolver\(\); \};/);
  });
  it("vite.config.ts define __MAVEN_BUILD__ con la hora del build", () => {
    expect(FUENTE_VITE).toMatch(/__MAVEN_BUILD__: JSON\.stringify\(Date\.now\(\)\)/);
  });
});
