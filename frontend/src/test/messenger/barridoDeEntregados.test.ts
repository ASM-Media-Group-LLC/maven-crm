// EL LAZO QUE TIRÓ MAVEN TRES VECES EL 17/09/2026.
//
// El hook de avisos del Messenger tenía UN solo efecto con `[userId, version]`
// en las dependencias. `version` sube cada vez que el canal de realtime revive,
// y el efecto hacía un "barrido": pedir los últimos 200 mensajes DE TODA LA BASE
// y escribir hasta 200 acuses de entrega. Con la base saturada los canales se
// caen, cada caída dispara un barrido, el barrido satura más, se caen más
// canales. Se realimenta solo.
//
// Medido en producción: 74.846 llamadas, 189,9 ms de promedio, 7.483 ms de
// máximo, y durante la crisis el barrido + su upsert eran 0,455 núcleos = 23%
// de todo el trabajo de una base de 2 núcleos compartidos.
//
// El arreglo tiene UNA trampa, y el último bloque de este archivo es el que la
// vigila: lo obvio sería sacar `version` de las dependencias, pero entonces el
// barrido al revivir DESAPARECE — que es justo para lo que existe `alRevivir` —
// y se pierde el ✓✓ gris de todo lo que llegó mientras el canal estuvo muerto.
// Lo correcto es PARTIR el efecto en dos y que el barrido pida solo lo nuevo.

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const marcados: string[][] = [];
vi.mock("@/hooks/useReadReceipts", () => ({
  markMessagesDelivered: vi.fn(async (_userId: string, ids: string[]) => {
    marcados.push(ids);
  }),
}));

type Consulta = {
  tabla: string;
  select: string;
  gt: [string, string] | null;
  limite: number | null;
};
const consultas: Consulta[] = [];
let filasQueDevuelve: { id: string; created_at: string }[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const cliente = {
    from(tabla: string) {
      const c: Consulta = { tabla, select: "", gt: null, limite: null };
      consultas.push(c);
      const q = {
        select(s: string) { c.select = s; return q; },
        neq() { return q; },
        eq() { return q; },
        gt(columna: string, valor: string) { c.gt = [columna, valor]; return q; },
        order() { return q; },
        limit(n: number) {
          c.limite = n;
          return Promise.resolve({ data: filasQueDevuelve, error: null });
        },
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
      return q;
    },
    channel: () => ({ on: () => ({}), subscribe: () => ({}) }),
    removeChannel: () => {},
  };
  return { supabase: cliente };
});

import {
  LOTE_PRIMERA_VEZ,
  LOTE_INCREMENTAL,
  TOLERANCIA_RELOJ_MS,
  FRENO_BARRIDO_MS,
  MARGEN_SOLAPE_MS,
  claveDelBarrido,
  leerMarcaDeBarrido,
  guardarMarcaDeBarrido,
  planDeBarrido,
  aplicarFiltroDelBarrido,
  marcaDeLote,
  barridoDeEntregados,
} from "@/hooks/useMessengerNotifications";

const AHORA = Date.parse("2026-09-17T18:00:00.000Z");
const USUARIO = "u-1";

beforeEach(() => {
  consultas.length = 0;
  marcados.length = 0;
  filasQueDevuelve = [];
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("planDeBarrido", () => {
  it("sin marca pide un lote ACOTADO y sin filtro de fecha (primer barrido del navegador)", () => {
    expect(planDeBarrido(null, AHORA)).toEqual({ desde: null, limite: LOTE_PRIMERA_VEZ });
    expect(LOTE_PRIMERA_VEZ).toBeLessThanOrEqual(200);
  });

  it("con marca pide SOLO LO NUEVO: filtra por la fecha del último barrido", () => {
    const marca = "2026-09-17T17:59:00.000Z";
    expect(planDeBarrido(marca, AHORA)).toEqual({ desde: marca, limite: LOTE_INCREMENTAL });
  });

  it("una marca ilegible NO deja de marcar: vuelve al lote de la primera vez", () => {
    for (const basura of ["", "ayer", "{}", "NaN"]) {
      expect(planDeBarrido(basura, AHORA).desde).toBeNull();
      expect(planDeBarrido(basura, AHORA).limite).toBe(LOTE_PRIMERA_VEZ);
    }
  });

  it("⚠️ una marca EN EL FUTURO se tira: si no, `gt` no devolvería una sola fila NUNCA MÁS", () => {
    // Reloj del equipo mal puesto o storage manipulado. El peor caso permitido
    // es "marco de más"; "no marco nada para siempre" apaga el ✓✓ gris en ese
    // navegador y nadie se entera.
    const futuro = new Date(AHORA + TOLERANCIA_RELOJ_MS + 60_000).toISOString();
    expect(planDeBarrido(futuro, AHORA)).toEqual({ desde: null, limite: LOTE_PRIMERA_VEZ });
  });

  it("un desfase normal de reloj contra el servidor SÍ se respeta", () => {
    const pocoFuturo = new Date(AHORA + 60_000).toISOString();
    expect(planDeBarrido(pocoFuturo, AHORA).desde).toBe(pocoFuturo);
  });
});

describe("aplicarFiltroDelBarrido", () => {
  it("con marca le pone gt(created_at) a la consulta", () => {
    const llamadas: [string, string][] = [];
    const falsa = { gt(c: string, v: string) { llamadas.push([c, v]); return falsa; } };
    aplicarFiltroDelBarrido(falsa, { desde: "2026-09-17T17:00:00.000Z", limite: 200 });
    expect(llamadas).toEqual([["created_at", "2026-09-17T17:00:00.000Z"]]);
  });

  it("sin marca no filtra por fecha (el límite es el que acota)", () => {
    const llamadas: string[] = [];
    const falsa = { gt(c: string) { llamadas.push(c); return falsa; } };
    aplicarFiltroDelBarrido(falsa, { desde: null, limite: 100 });
    expect(llamadas).toEqual([]);
  });
});

describe("marcaDeLote", () => {
  it("toma el mensaje MÁS RECIENTE, no el primero de la lista", () => {
    const m = marcaDeLote([
      { created_at: "2026-09-17T10:00:00.000Z" },
      { created_at: "2026-09-17T12:00:00.000Z" },
      { created_at: "2026-09-17T11:00:00.000Z" },
    ]);
    expect(Date.parse(m!) + MARGEN_SOLAPE_MS).toBe(Date.parse("2026-09-17T12:00:00.000Z"));
  });

  it("deja un SOLAPE hacia atrás: un mensaje que se confirma justo después de la consulta tiene fecha anterior a ella", () => {
    // Sin solape ese mensaje cae fuera del `gt` del próximo barrido y se queda
    // sin ✓✓ gris para siempre. Con solape se repite y el upsert lo ignora.
    const m = marcaDeLote([{ created_at: "2026-09-17T12:00:00.000Z" }])!;
    expect(Date.parse(m)).toBeLessThan(Date.parse("2026-09-17T12:00:00.000Z"));
    expect(MARGEN_SOLAPE_MS).toBeGreaterThan(0);
  });

  it("lote vacío = sin marca nueva (no se puede adelantar la marca sin haber marcado)", () => {
    expect(marcaDeLote([])).toBeNull();
  });

  it("una fecha que no se entiende NO adelanta la marca", () => {
    expect(marcaDeLote([{ created_at: "no es una fecha" }])).toBeNull();
  });
});

describe("la marca en localStorage", () => {
  it("es por usuario: en un equipo compartido la marca de uno no le sirve al otro", () => {
    guardarMarcaDeBarrido("ana", "2026-09-17T10:00:00.000Z");
    expect(leerMarcaDeBarrido("ana")).toBe("2026-09-17T10:00:00.000Z");
    expect(leerMarcaDeBarrido("beto")).toBeNull();
    expect(claveDelBarrido("ana")).not.toBe(claveDelBarrido("beto"));
  });

  it("si el storage está bloqueado (modo privado) no explota: se barre como la primera vez", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(leerMarcaDeBarrido(USUARIO)).toBeNull();
    expect(() => guardarMarcaDeBarrido(USUARIO, "2026-09-17T10:00:00.000Z")).not.toThrow();
  });
});

describe("barridoDeEntregados", () => {
  it("la PRIMERA vez pide un lote acotado y deja la marca en el mensaje más nuevo", async () => {
    filasQueDevuelve = [
      { id: "m2", created_at: "2026-09-17T12:00:00.000Z" },
      { id: "m1", created_at: "2026-09-17T11:00:00.000Z" },
    ];
    const n = await barridoDeEntregados(USUARIO, AHORA);

    expect(n).toBe(2);
    expect(consultas).toHaveLength(1);
    expect(consultas[0].tabla).toBe("chat_messages");
    expect(consultas[0].gt).toBeNull();
    expect(consultas[0].limite).toBe(LOTE_PRIMERA_VEZ);
    expect(marcados).toEqual([["m2", "m1"]]);
    expect(Date.parse(leerMarcaDeBarrido(USUARIO)!) + MARGEN_SOLAPE_MS)
      .toBe(Date.parse("2026-09-17T12:00:00.000Z"));
  });

  it("el SEGUNDO barrido pide solo lo nuevo — y si no hay nada nuevo NO escribe un solo acuse", async () => {
    filasQueDevuelve = [{ id: "m2", created_at: "2026-09-17T12:00:00.000Z" }];
    await barridoDeEntregados(USUARIO, AHORA);

    filasQueDevuelve = [];
    const n = await barridoDeEntregados(USUARIO, AHORA);

    expect(n).toBe(0);
    expect(consultas[1].gt?.[0]).toBe("created_at");
    expect(Date.parse(consultas[1].gt![1]) + MARGEN_SOLAPE_MS)
      .toBe(Date.parse("2026-09-17T12:00:00.000Z"));
    expect(consultas[1].limite).toBe(LOTE_INCREMENTAL);
    expect(marcados).toHaveLength(1); // solo el del primer barrido
  });

  it("si no marcó nada, la marca NO avanza (un fallo no puede saltarse mensajes)", async () => {
    guardarMarcaDeBarrido(USUARIO, "2026-09-17T09:00:00.000Z");
    filasQueDevuelve = [];
    await barridoDeEntregados(USUARIO, AHORA);
    expect(leerMarcaDeBarrido(USUARIO)).toBe("2026-09-17T09:00:00.000Z");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LA TRAMPA. Estos casos leen el fuente porque lo que protegen es el CABLEADO
// del hook: qué efecto depende de qué. Es exactamente lo que se rompe si
// alguien "optimiza" sacando `version` de las dependencias.
// ─────────────────────────────────────────────────────────────────────────────
// Se lee con import.meta.glob y no con node:fs porque el tsconfig de la app
// apunta al navegador (node:fs suma errores de tipos). El patrón es LITERAL y
// arranca en la raíz del repo: vitest corre ahí.
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/hooks/useMessengerNotifications.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});
const fuente = Object.values(fuentes)[0] ?? "";

describe("cableado del hook", () => {
  it("el fuente se cargó de verdad (una guarda que no lee nada pasa siempre)", () => {
    expect(Object.keys(fuentes)).toHaveLength(1);
    expect(fuente).toContain("export function useMessengerNotifications()");
  });

  it("el efecto del barrido SIGUE dependiendo de `version`: revivir el canal tiene que barrer", () => {
    const efectos = fuente.split("useEffect(() => {").slice(1);
    const delBarrido = efectos.filter((e) => e.includes("barridoDeEntregados("));
    expect(delBarrido).toHaveLength(1);
    // Las dependencias del efecto son las del primer `}, [...]);` que lo cierra.
    const deps = delBarrido[0].match(/\}, \[([^\]]*)\]\);/)?.[1] ?? "";
    expect(deps).toContain("version");
    expect(deps).toContain("userId");
  });

  it("`alRevivir` sigue subiendo `version` (es el disparador del barrido)", () => {
    const alRevivir = fuente.match(/alRevivir:([^,]*),/)?.[1] ?? "";
    expect(alRevivir).toContain("setVersion");
  });

  it("el efecto que arma el canal NO depende de `version` (ahí estaba el lazo)", () => {
    const efectos = fuente.split("useEffect(() => {").slice(1);
    const delCanal = efectos.filter((e) => e.includes("armarCanalRef.current ="));
    expect(delCanal).toHaveLength(1);
    const deps = delCanal[0].match(/\}, \[([^\]]*)\]\);/)?.[1] ?? "";
    expect(deps.replace(/\s/g, "")).toBe("userId");
    // Y ya no hace el barrido: eso vive en su propio efecto.
    expect(delCanal[0]).not.toContain("barridoDeEntregados(");
  });

  it("hay un freno entre barridos: volver del segundo plano dispara dos seguidos", () => {
    // useReanudarAlVolver de este hook sube `version`, y useCanalQueRevive
    // vuelve a subirlo desde `alRevivir` al reconectar. Sin freno son dos
    // barridos pegados por cada regreso a primer plano.
    expect(FRENO_BARRIDO_MS).toBeGreaterThanOrEqual(5_000);
    expect(fuente).toContain("FRENO_BARRIDO_MS - (Date.now() - ultimoBarridoRef.current)");
    // Frenado, no descartado: el barrido demorado igual corre.
    expect(fuente).toContain("setTimeout(() => { if (!cancelado) barrer(); }, faltan)");
  });
});
